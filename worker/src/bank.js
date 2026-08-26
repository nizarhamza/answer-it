// Round builder for multiplayer rooms (§6, §8, §9) - the Worker-side twin of index.html's
// buildPool()/makeRoundSession(). Solo builds its pool in the browser because it has no room to
// protect from the OpenTDB rate limit (§6.2); a room asks here instead, once, when the host
// presses Start.
//
// This is a *direct-fetch* implementation, not the KV bank described in ANSWER-IT.md §6.2/§16 -
// that's slice 4 ("do this before any public launch - the OpenTDB rate limit will bite the
// moment two rooms run at once", §21). Until it exists, two rooms starting within the same
// OpenTDB throttle window will make each other wait; curated-core + Trivia API cover most of a
// round on their own, so this only bites the OpenTDB top-up path. Tracked in ANSWER-IT.md §23.
import {
  CATEGORY_KEYS, TRIVIA_API_CATEGORIES, TRIVIA_API_TAGS, OPENTDB_CATEGORIES,
  normalizeQuestion, fetchTriviaApi, fetchOpenTDB, createThrottle,
} from "./sources.js";
import { gradeQuestion, loadCurated, dedupeKey } from "./quality.js";
// Side-effect imports: these are classic scripts (see their own headers) that assign
// globalThis.ANSWER_IT_CURATED rather than exporting, so the exact same files work over file://
// for solo mode's <script src> tag and here, bundled straight into the Worker by wrangler/esbuild.
import "../../bank/curated-core.js";
import "../../bank/curated-extra.js";
import "../../bank/curated-islamic.js";
import {
  LEVELS, buildAccepted, allocateCounts, adaptiveProfile, rollingAccuracy,
  levelEligibleAt, pickHellQuestion, applyHellModifier, finalizeTimeLimit, doubleLevel,
  PROFILES,
} from "./game-core.js";

const TRIVIA_TO_ANSWERIT = {};
for (const [ourKey, apiKeys] of Object.entries(TRIVIA_API_CATEGORIES)) {
  for (const ak of apiKeys) TRIVIA_TO_ANSWERIT[ak] = ourKey;
}

const CURATED_SCORE = 95;
const MAX_OPENTDB_TOPUPS = 4; // see file header - kept low to bound how long a room's Start can block
const opentdbThrottle = createThrottle(6000); // shared per Worker isolate, not just per room

function minPerBucket(n, categoryCount) {
  const worstCaseLevelShare = Math.ceil(n * 0.6);
  return Math.max(3, Math.ceil(worstCaseLevelShare / categoryCount) + 2);
}

// Builds { [category]: { easy:[], medium:[], hard:[] } }, curated first, API on top, excluding
// anything in `excludeKeys` (this room's seenQuestionIds, §6.2) so a rematch never repeats.
// `region` ("any" or one of the curated bank's region tags) restricts the pool to that region's
// curated rows and skips the API fetch below entirely - neither trivia source tags its questions
// by region, so there is nothing there a region filter could ever apply to.
export async function buildPool(categories, n, excludeKeys = new Set(), region = "any") {
  const regionFilter = region && region !== "any" ? region : null;
  const minBucket = minPerBucket(n, categories.length);
  const pool = {};
  for (const c of categories) pool[c] = { easy: [], medium: [], hard: [] };
  const seen = new Set(excludeKeys);

  for (const c of categories) {
    for (const q of loadCurated(buildAccepted, { category: c, region: regionFilter })) {
      const key = dedupeKey(q);
      if (!pool[c][q.level] || seen.has(key)) continue;
      seen.add(key);
      pool[c][q.level].push({ ...q, key, _score: CURATED_SCORE });
    }
  }
  if (regionFilter) {
    for (const c of categories) for (const L of ["easy", "medium", "hard"]) pool[c][L].sort((a, b) => (b._score || 0) - (a._score || 0));
    return pool;
  }

  function ingest(list, source, forcedCategory) {
    for (const raw of list) {
      let cat = forcedCategory;
      if (!cat && source === "trivia-api") cat = TRIVIA_TO_ANSWERIT[raw.category] || null;
      if (!cat || !categories.includes(cat)) continue;
      const q = normalizeQuestion(raw, source, cat, buildAccepted);
      if (!q || !["easy", "medium", "hard"].includes(q.level)) continue;
      const key = dedupeKey(q);
      if (seen.has(key)) continue;
      const grade = gradeQuestion({ ...q, tags: raw.tags, regions: raw.regions });
      if (!grade.ok) continue;
      seen.add(key);
      pool[cat][q.level].push({ ...q, key, _score: grade.score });
    }
  }

  const triviaCats = [...new Set(categories.flatMap((c) => TRIVIA_API_CATEGORIES[c] || []))];
  const calls = [];
  if (triviaCats.length) {
    for (const d of ["easy", "medium", "hard"]) {
      for (let i = 0; i < 2; i++) {
        calls.push(fetchTriviaApi({ categories: triviaCats, limit: 50, difficulties: [d] }).then((r) => ingest(r, "trivia-api")));
      }
    }
  }
  if (categories.includes("games")) {
    calls.push(fetchTriviaApi({ tags: TRIVIA_API_TAGS.games, limit: 50 }).then((r) => ingest(r, "trivia-api", "games")));
  }
  await Promise.all(calls);

  const need = [];
  for (const c of categories) for (const L of ["easy", "medium", "hard"]) if (pool[c][L].length < minBucket) need.push([c, L]);
  const capped = need.slice(0, MAX_OPENTDB_TOPUPS);
  for (const [c, L] of capped) {
    const ids = OPENTDB_CATEGORIES[c] || [];
    if (!ids.length) continue;
    const id = ids[Math.floor(Math.random() * ids.length)];
    await opentdbThrottle();
    const r = await fetchOpenTDB({ categoryId: id, difficulty: L, amount: 50 });
    ingest(r, "opentdb", c);
  }

  for (const c of categories) for (const L of ["easy", "medium", "hard"]) {
    pool[c][L].sort((a, b) => (b._score || 0) - (a._score || 0)); // best-first; no per-device freshness history on the server
  }
  return pool;
}

export function poolTotal(pool, categories, level) {
  return categories.reduce((s, c) => s + (pool[c]?.[level]?.length || 0), 0);
}

function nearestAvailableLevel(pool, categories, preferred) {
  const idx = LEVELS.indexOf(preferred);
  for (let d = 0; d < LEVELS.length; d++) {
    for (const cand of [idx - d, idx + d]) {
      if (cand < 0 || cand >= LEVELS.length - 1) continue; // "hell" isn't a pool bucket - drawn from hard
      const L = LEVELS[cand];
      if (poolTotal(pool, categories, L) > 0) return L;
    }
  }
  return null;
}

// §6.5.6-equivalent draw: curated wins most draws (60/40) but samples the front of whichever
// side is picked, same reasoning as solo's pickQualityIndex minus the localStorage freshness
// stamp (a room round never repeats a question anyway - see excludeKeys above).
const CURATED_SHARE = 0.6;
function pickQualityIndex(arr) {
  if (arr.length <= 1) return 0;
  const curated = [], rest = [];
  for (let i = 0; i < arr.length; i++) (arr[i].source === "custom" ? curated : rest).push(i);
  let useCurated = curated.length > 0 && (rest.length === 0 || Math.random() < CURATED_SHARE);
  if (useCurated && curated.length === 0) useCurated = false;
  const from = useCurated ? curated : (rest.length ? rest : curated);
  const span = Math.max(1, Math.min(from.length, Math.max(4, Math.ceil(from.length * 0.5))));
  return from[Math.floor(Math.random() * span)];
}

// Server-side twin of index.html's makeRoundSession() - deliberately NOT closure-based like the
// solo copy. A Durable Object using the WebSocket Hibernation API can be evicted from memory
// between messages (that's the point of hibernation), and an alarm() wakes a brand-new instance -
// so nothing here may live only in a JS closure across a message/alarm boundary. Instead every
// function takes the room's persisted `pool` and `sessionState` explicitly, mutates them in
// place, and room.js is responsible for `storage.put()`-ing both back after every call. This is
// the same algorithm as index.html's makeRoundSession, just re-shaped to be resumable.
export function initSessionState() {
  return { used: { easy: 0, medium: 0, hard: 0, hell: 0 }, rolling: [], lastCats: [], servedLevels: [] };
}

function levelBudget(pool, settings, state) {
  const n = settings.n;
  if (settings.intensity !== "adaptive") {
    const fixed = allocateCounts(n, PROFILES[settings.intensity]);
    return LEVELS.reduce((acc, L) => { acc[L] = Math.max(0, fixed[L] - state.used[L]); return acc; }, {});
  }
  const remaining = n - state.servedLevels.length;
  return allocateCounts(remaining, adaptiveProfile(rollingAccuracy(state.rolling)));
}

function pickLevel(pool, settings, state, pos) {
  if (pos === 0) return "easy";
  const categories = settings.categories;
  const target = levelBudget(pool, settings, state);
  const placed = state.servedLevels;
  let eligible = LEVELS.filter((L) => target[L] > 0 && levelEligibleAt(L, pos, settings.n, placed) && (L === "hell" ? poolTotal(pool, categories, "hard") > 0 : poolTotal(pool, categories, L) > 0));
  if (!eligible.length) eligible = LEVELS.filter((L) => target[L] > 0 && (L === "hell" ? poolTotal(pool, categories, "hard") > 0 : poolTotal(pool, categories, L) > 0));
  if (!eligible.length) eligible = LEVELS.filter((L) => (L === "hell" ? poolTotal(pool, categories, "hard") > 0 : poolTotal(pool, categories, L) > 0));
  if (!eligible.length) return null;
  return eligible.reduce((a, b) => (target[a] || 0) >= (target[b] || 0) ? a : b);
}

function pickCategory(pool, categories, state, sourceLevel) {
  const last2 = state.lastCats.slice(-2);
  const withStock = categories.filter((c) => pool[c][sourceLevel].length > 0);
  if (!withStock.length) return null;
  const fresh = withStock.filter((c) => !(last2.length === 2 && last2[0] === c && last2[1] === c));
  const pickFrom = fresh.length ? fresh : withStock;
  pickFrom.sort((a, b) => state.lastCats.lastIndexOf(a) - state.lastCats.lastIndexOf(b));
  return pickFrom[0];
}

function draw(pool, settings, state, level) {
  const sourceLevel = level === "hell" ? "hard" : level;
  const category = pickCategory(pool, settings.categories, state, sourceLevel);
  if (!category) return null;
  const arr = pool[category][sourceLevel];
  let question, modifier = null;
  if (level === "hell") {
    const picked = pickHellQuestion(arr, { allowBlind: settings.style !== "open" });
    if (!picked) return null;
    question = picked.question; modifier = picked.modifier;
    arr.splice(arr.indexOf(question), 1);
    question = applyHellModifier(question, modifier);
  } else {
    const i = pickQualityIndex(arr);
    question = arr[i];
    arr.splice(i, 1);
  }
  state.lastCats.push(category);
  return { question, category };
}

function applyStyle(settings, q) {
  if (q.type === "open") return q;
  if (settings.style === "open") return { ...q, type: "open", options: null };
  if (settings.style === "mixed" && Math.random() < 0.30) return { ...q, type: "open", options: null };
  return q;
}

function finalize(settings, q, isDouble) {
  q = applyStyle(settings, q);
  q.timeLimit = finalizeTimeLimit(q);
  if (settings.extended) q.timeLimit = Math.round(q.timeLimit * 1.5);
  q.isDouble = !!isDouble;
  if (q.type === "open") q.options = null;
  return q;
}

// Draws question (state.servedLevels.length) of the round. Mutates `pool` and `state`; returns
// { question, notices } with question:null once the pool is truly exhausted (§20 - never
// invent questions, end a few short instead).
export function drawNextQuestion(pool, settings, state) {
  const notices = [];
  if (state.servedLevels.length >= settings.n) return { question: null, notices };
  const pos = state.servedLevels.length;
  let level = pickLevel(pool, settings, state, pos);
  if (!level) {
    const nearest = nearestAvailableLevel(pool, settings.categories, "medium");
    if (!nearest) return { question: null, notices };
    level = nearest;
    notices.push({ key: "ranShort" });
  }
  let drawn = draw(pool, settings, state, level);
  if (!drawn) {
    const nearest = nearestAvailableLevel(pool, settings.categories, level);
    if (!nearest) return { question: null, notices };
    notices.push({ key: "toppedUpFrom", level, nearest });
    drawn = draw(pool, settings, state, nearest);
    if (!drawn) return { question: null, notices };
  }
  state.used[drawn.question.level] = (state.used[drawn.question.level] || 0) + 1;
  state.servedLevels.push(drawn.question.level);
  return { question: finalize(settings, { ...drawn.question, category: drawn.category }), notices };
}

export function drawDouble(pool, settings, state) {
  const lvl = doubleLevel(state.servedLevels.length ? state.servedLevels : ["easy"]);
  let drawn = draw(pool, settings, state, lvl);
  if (!drawn) {
    const nearest = nearestAvailableLevel(pool, settings.categories, lvl);
    if (nearest) drawn = draw(pool, settings, state, nearest);
  }
  if (!drawn) return null;
  return finalize(settings, { ...drawn.question, category: drawn.category }, true);
}

// Called once per question, after it locks, with whether the ROOM (collectively - at least one
// correct answer) got it right - §8.3's rolling accuracy is a room-level signal. Mutates
// state.rolling; returns a mixShift toast payload when the hard+hell share moved meaningfully.
export function recordOutcome(settings, state, correct) {
  const before = adaptiveProfile(rollingAccuracy(state.rolling));
  state.rolling.push(correct);
  if (state.rolling.length > 5) state.rolling.shift();
  if (settings.intensity !== "adaptive") return null;
  const after = adaptiveProfile(rollingAccuracy(state.rolling));
  const hardnessBefore = before.hard + before.hell, hardnessAfter = after.hard + after.hell;
  if (hardnessAfter - hardnessBefore > 0.05) return { direction: "up", profile: after };
  if (hardnessBefore - hardnessAfter > 0.05) return { direction: "down", profile: after };
  return null;
}

export { CATEGORY_KEYS };

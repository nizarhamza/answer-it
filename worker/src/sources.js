// Trivia source adapters + normalisation (§6). Pure-ish: the only side effect is `fetch`, so
// unlike game-core.js this module *could* run unmodified in a browser `<script type="module">`
// - but index.html still mirrors it inline rather than importing it, for the same file://
// no-build-step reason documented at the top of game-core.js. This file is the reference copy,
// and is what worker/src/bank.js (slice 4) will import unchanged once it exists.

/* ============================================================
   §4 - Categories
   ============================================================ */
export const CATEGORIES = [
  { key: "general", label: "General Knowledge" },
  { key: "science", label: "Science & Nature" },
  { key: "history", label: "History & Politics" },
  { key: "geography", label: "Geography" },
  { key: "music", label: "Music" },
  { key: "screen", label: "Film & TV" },
  { key: "games", label: "Games & Anime" },
  { key: "sport", label: "Sport" },
  { key: "arts", label: "Arts & Literature" },
  { key: "culture", label: "Society & Culture" },
  { key: "islamic", label: "Islamic Knowledge" },
];
export const CATEGORY_KEYS = CATEGORIES.map((c) => c.key);

// The Trivia API v2 category keys per Answer It category. v2's own list (GET /v2/categories) is
// exactly 10 slugs; each of our 11 maps onto one - or two, for `culture`. `games` has no
// category of its own on Trivia API - it only exists as tags (queried separately, see
// TRIVIA_API_TAGS below). `islamic` has no category or tag on either source - curated-only,
// same empty-mapping treatment `games` gets for its own API-less slice (buildPool's `||[]` +
// length guards already degrade gracefully for a category with nothing to fetch). There is no
// `politics` slug in v2 - passing one makes the API drop the category filter entirely.
export const TRIVIA_API_CATEGORIES = {
  general: ["general_knowledge"],
  science: ["science"],
  history: ["history"],
  geography: ["geography"],
  music: ["music"],
  screen: ["film_and_tv"],
  games: [],
  sport: ["sport_and_leisure"],
  arts: ["arts_and_literature"],
  culture: ["society_and_culture", "food_and_drink"],
  islamic: [],
};
export const TRIVIA_API_TAGS = { games: ["video_games", "board_games"] };

// nizarhamza/questions-api (the "native" v1 surface, GET /v1/questions) exposes its own ~24
// categories, which don't line up with Answer It's curated 11. When a room's question source
// is "native" the category grid switches to this list; the keys are prefixed `n:` so they
// never collide with a curated key (`science` etc.) that still carries a translated label on
// the client. `nativeSlug` strips the prefix back to the value the API's `category` param
// wants. Mirrors NATIVE_CATEGORIES in index.html.
export const NATIVE_CAT_PREFIX = "n:";
export const NATIVE_CATEGORY_KEYS = [
  "general", "science", "computers", "mathematics", "history", "geography", "music",
  "film", "television", "videogames", "boardgames", "sports", "art", "theatre",
  "literature", "mythology", "politics", "celebrities", "animals", "vehicles",
  "comics", "anime", "cartoons",
].map((s) => NATIVE_CAT_PREFIX + s);
export function nativeSlug(key) {
  return key.startsWith(NATIVE_CAT_PREFIX) ? key.slice(NATIVE_CAT_PREFIX.length) : key;
}

// OpenTDB numeric category ids (opentdb.com/api_category.php) - one call per id, §6.1.
// No `islamic` entry - OpenTDB has no matching category either.
export const OPENTDB_CATEGORIES = {
  general: [9],
  science: [17, 18, 19, 30, 27],
  history: [23, 24],
  geography: [22],
  music: [12, 13],
  screen: [11, 14, 32],
  games: [15, 16, 31, 29],
  sport: [21],
  arts: [10, 25],
  culture: [20, 26, 28],
};

/* ============================================================
   §6.3 - Normalisation
   ============================================================ */

const MAX_QUESTION_LEN = 180;
const MIN_ANSWER_LEN = 2;

// OpenTDB is fetched with encode=url3986, so its text arrives percent-encoded - plain
// decodeURIComponent undoes that. Trivia API text needs no decoding at all.
function decodeSourceText(s, source) {
  if (source !== "opentdb") return s;
  try { return decodeURIComponent(s); } catch { return s; }
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Turns one raw source question into the §3 Question shape, or returns null if it fails the
// §6.3 reject rules. `accepted` is built by game-core.js's buildAccepted() at call time (kept
// there since it's answer-matching logic, not sourcing) - pass it in via `buildAccepted`.
export function normalizeQuestion(raw, source, categoryKey, buildAccepted) {
  if (source === "trivia-api") {
    const text = String(raw.question?.text || "").trim();
    const correct = String(raw.correctAnswer || "").trim();
    const incorrect = (raw.incorrectAnswers || []).map((s) => String(s).trim());
    if (!text || text.length > MAX_QUESTION_LEN) return null;
    if (correct.length < MIN_ANSWER_LEN) return null;
    const options = shuffle([correct, ...incorrect]);
    return {
      id: raw.id,
      source: "trivia-api",
      text,
      category: categoryKey,
      level: raw.difficulty, // easy | medium | hard - Hell is a promotion applied later
      type: "choice",
      options,
      answerIndex: options.indexOf(correct),
      accepted: buildAccepted(correct),
      modifiers: [],
      timeLimit: null, // set once the final level (incl. any Hell promotion) is known
      media: null,
      isNiche: !!raw.isNiche,
      correctAnswer: correct,
    };
  }

  if (source === "question-api") {
    // GET /v1/questions objects (reveal=true): always 4-option MC, answer_index 0-3 into
    // options, answer = options[answer_index]. difficulty is easy|medium|hard 1:1 with ours.
    const text = String(raw.question || "").trim();
    const options = Array.isArray(raw.options) ? raw.options.map((s) => String(s).trim()) : [];
    const ai = Number(raw.answer_index);
    if (!text || text.length > MAX_QUESTION_LEN) return null;
    if (options.length !== 4 || !Number.isInteger(ai) || ai < 0 || ai > 3) return null;
    // No MIN_ANSWER_LEN floor here (unlike the crowd-sourced adapters): a one-character option
    // like "H" or "6" is a valid intended answer, and this is a choice question scored by index.
    const correct = String(raw.answer ?? options[ai]).trim();
    if (!correct || options[ai] !== correct) return null;
    return {
      id: `qapi:${raw.id || text.slice(0, 40)}`,
      source: "question-api",
      text,
      category: categoryKey,
      level: raw.difficulty,
      type: "choice",
      options,
      answerIndex: ai,
      accepted: buildAccepted(correct),
      modifiers: [],
      timeLimit: null,
      media: null,
      isNiche: false,
      correctAnswer: correct,
    };
  }

  if (source === "opentdb") {
    const text = decodeSourceText(String(raw.question || ""), "opentdb").trim();
    const correct = decodeSourceText(String(raw.correct_answer || ""), "opentdb").trim();
    const incorrect = (raw.incorrect_answers || []).map((s) => decodeSourceText(String(s), "opentdb").trim());
    if (!text || text.length > MAX_QUESTION_LEN) return null;
    if (correct.length < MIN_ANSWER_LEN) return null;
    const options = shuffle([correct, ...incorrect]);
    return {
      id: `otdb:${categoryKey}:${raw.difficulty}:${text.slice(0, 40)}`, // OpenTDB has no stable id - hash-ish key for de-dupe
      source: "opentdb",
      text,
      category: categoryKey,
      level: raw.difficulty,
      type: "choice",
      options,
      answerIndex: options.indexOf(correct),
      accepted: buildAccepted(correct),
      modifiers: [],
      timeLimit: null,
      media: null,
      isNiche: false, // OpenTDB has no niche/obscurity signal - native Hell only ever comes from Trivia API
      correctAnswer: correct,
    };
  }

  return null;
}

/* ============================================================
   §6.1 - Fetch adapters
   ============================================================ */

async function fetchJson(url, { timeoutMs = 8000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// One call can cover several Answer It categories at once (Trivia API accepts a comma list),
// which is why solo mode leans on this as the fast path and only falls back to OpenTDB
// per-category for whatever's still thin afterward (§6.2, adapted for the no-bank solo case).
export async function fetchTriviaApi({ categories = [], tags = [], limit = 50, difficulties = ["easy", "medium", "hard"] } = {}) {
  const params = new URLSearchParams();
  params.set("limit", String(Math.min(50, limit)));
  params.set("difficulties", difficulties.join(","));
  if (categories.length) params.set("categories", categories.join(","));
  if (tags.length) params.set("tags", tags.join(","));
  const data = await fetchJson(`https://the-trivia-api.com/v2/questions?${params}`);
  return Array.isArray(data) ? data : [];
}

// One call per (category, difficulty) against the native questions-api. `endpoint` is its
// origin, e.g. https://questions-api.<subdomain>.workers.dev - no auth, CORS open. Returns []
// on any failure (empty endpoint, unknown/empty category -> 400/404, network), so a missing
// deployment just yields an empty pool rather than throwing.
export async function fetchQuestionApi({ endpoint, category, difficulty, amount = 50 } = {}) {
  if (!endpoint) return [];
  const params = new URLSearchParams({ amount: String(Math.min(100, amount)) });
  if (category) params.set("category", category);
  if (difficulty) params.set("difficulty", difficulty);
  const data = await fetchJson(`${endpoint.replace(/\/$/, "")}/v1/questions?${params}`);
  return data && Array.isArray(data.questions) ? data.questions : [];
}

export async function fetchOpenTDB({ categoryId, difficulty, amount = 50 } = {}) {
  const params = new URLSearchParams({
    amount: String(Math.min(50, amount)),
    category: String(categoryId),
    difficulty,
    type: "multiple",
    encode: "url3986",
  });
  const data = await fetchJson(`https://opentdb.com/api.php?${params}`);
  if (!data || data.response_code !== 0) return [];
  return data.results || [];
}

// OpenTDB's "1 request / 5s / IP" limit (§6.1) applies per caller regardless of whether that
// caller is the Worker or a solo player's own browser - this is a tiny cooperative throttle
// any OpenTDB-calling code should await before each call.
export function createThrottle(minIntervalMs) {
  let last = 0;
  return async function wait() {
    const now = Date.now();
    const delay = Math.max(0, last + minIntervalMs - now);
    last = now + delay;
    if (delay) await new Promise((r) => setTimeout(r, delay));
  };
}

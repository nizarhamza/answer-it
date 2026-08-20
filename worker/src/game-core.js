// Shared game core - scoring, level mix, round ordering, and answer matching.
// Pure and dependency-free (no fetch, no DOM, no storage): the plan is for this exact file
// to be imported unchanged by the multiplayer Durable Object (worker/src/room.js, slice 2)
// as the single authoritative implementation. Solo mode (../../index.html) mirrors these
// same functions inline instead of importing this file - ES module imports of a same-folder
// file are blocked by CORS when index.html is opened as a plain file:// double-click, and
// "open index.html and it works, no server" is a deliberate property of solo play (see
// ANSWER-IT.md §6.2). Keep the two copies in sync; this file is the reference.
//
// See ANSWER-IT.md for the design rationale behind every constant and formula here - this
// file intentionally has minimal prose commentary and instead cites the section that defines
// each piece of behaviour.

/* ============================================================
   §5 - Levels
   ============================================================ */
export const LEVELS = ["easy", "medium", "hard", "hell"]; // easiest → hardest; index also used as the "harder" tie-break

export const BASE_POINTS = { easy: 600, medium: 1000, hard: 1500, hell: 2500 };

export const TIME_LIMITS = {
  choice: { easy: 15, medium: 20, hard: 25, hell: 35 },
  open: { easy: 25, medium: 30, hard: 35, hell: 45 },
};

export const STREAK_GAIN = { easy: 1, medium: 1, hard: 1, hell: 2 };

/* ============================================================
   §7 - Scoring
   ============================================================ */

// §7.3 - ×1.0 at streak 0–1, +0.1 per step after that, capped ×1.5 at streak ≥ 6.
export function streakMultiplier(streak) {
  return Math.min(1 + Math.max(0, streak - 1) * 0.1, 1.5);
}

// §7.1 - clamp to [0.5, 1]; instant answer = 1, answer at the wire = 0.5.
export function timeFactor(responseTimeMs, timeLimitS) {
  const limitMs = timeLimitS * 1000;
  const f = 1 - 0.5 * (responseTimeMs / limitMs);
  return Math.max(0.5, Math.min(1, f));
}

// Scores one answer and returns the player's new streak alongside the point breakdown.
// `correct` - verdict already decided (choice match, or open-answer verdict from matchOpenAnswer).
// `streakBefore` - the player's streak going into this question.
// `hellInsurance` - lobby setting (§7.4): a streak of 3+ survives a missed Hell question at 1 instead of 0.
export function scoreAnswer({ level, type, isDouble, responseTimeMs, streakBefore, correct, hellInsurance }) {
  if (!correct) {
    const insured = hellInsurance && level === "hell" && streakBefore >= 3;
    return { points: 0, streakAfter: insured ? 1 : 0, timeFactor: 0, multiplier: 0 };
  }
  const limit = TIME_LIMITS[type][level];
  const tf = timeFactor(responseTimeMs, limit);
  const gain = STREAK_GAIN[level];
  const streakAfter = streakBefore + gain; // multiplier applies to the streak this answer just reached - §7.3
  const mult = streakMultiplier(streakAfter);
  const doubleMult = isDouble ? 2 : 1;
  const points = Math.round(BASE_POINTS[level] * tf * mult * doubleMult);
  return { points, streakAfter, timeFactor: tf, multiplier: mult };
}

// §7.6 - tie order: score → correct count → lowest avg response time → longest best streak → alphabetical.
export function comparePlayers(a, b) {
  return (
    (b.score - a.score) ||
    (b.correct - a.correct) ||
    (a.avgMs - b.avgMs) ||
    (b.bestStreak - a.bestStreak) ||
    a.nickname.localeCompare(b.nickname)
  );
}

/* ============================================================
   §8 - The automatic level mix
   ============================================================ */

export const PROFILES = {
  chill: { easy: 0.55, medium: 0.30, hard: 0.12, hell: 0.03 },
  standard: { easy: 0.40, medium: 0.35, hard: 0.20, hell: 0.05 },
  brutal: { easy: 0.20, medium: 0.30, hard: 0.35, hell: 0.15 },
};

// §8.3 - adaptive floor/ceiling per level (as fractions of 1.0).
export const ADAPTIVE_BOUNDS = {
  easy: { floor: 0.15, ceiling: 0.55 },
  medium: { floor: 0.20, ceiling: 0.45 },
  hard: { floor: 0.10, ceiling: 0.40 },
  hell: { floor: 0.03, ceiling: 0.15 },
};

// §8.2 - largest remainder, ties favour the harder level, then guarantee ≥1 of every level for N≥8.
export function allocateCounts(n, profile) {
  const raw = {}, floor = {}, rem = {};
  for (const L of LEVELS) {
    raw[L] = n * profile[L];
    floor[L] = Math.floor(raw[L]);
    rem[L] = raw[L] - floor[L];
  }
  let leftover = n - LEVELS.reduce((s, L) => s + floor[L], 0);
  const order = [...LEVELS].sort((a, b) => (rem[b] - rem[a]) || (LEVELS.indexOf(b) - LEVELS.indexOf(a)));
  for (let i = 0; i < leftover; i++) floor[order[i]]++;

  if (n >= 8) {
    for (const L of LEVELS) {
      while (floor[L] === 0) {
        const donor = LEVELS.reduce((a, b) => (floor[a] >= floor[b] ? a : b));
        if (floor[donor] <= 1) break; // nothing left to give without creating another empty bucket
        floor[donor]--;
        floor[L]++;
      }
    }
  }
  return floor;
}

// §8.3 - rolling accuracy over the last (up to) 5 room/player outcomes. Neutral (0.60) with no data yet.
export function rollingAccuracy(outcomes) {
  const last5 = outcomes.slice(-5);
  if (!last5.length) return 0.60;
  return last5.filter(Boolean).length / last5.length;
}

// §8.3 - the soft pair {easy,medium} (split 60/40) and the hard pair {hard,hell} (split 70/30)
// always keep that internal ratio; `s` moves mass between the two pairs (soft→hard when s>0).
// Clamp to floor/ceiling then redistribute the clamped delta among the buckets still holding
// slack, iterating a few times - this converges on (and, away from the extremes, matches
// exactly) the worked table in §8.3; at the saturated extremes it can land within ~1pt of the
// table's own rounding, which has no visible effect on a 10–30 question round.
export function adaptiveProfile(accuracy) {
  const s = Math.max(-0.35, Math.min(0.35, (accuracy - 0.60) * 0.8));
  const p = {
    easy: PROFILES.standard.easy - 0.6 * s,
    medium: PROFILES.standard.medium - 0.4 * s,
    hard: PROFILES.standard.hard + 0.7 * s,
    hell: PROFILES.standard.hell + 0.3 * s,
  };
  return clampRenormalize(p);
}

function clampRenormalize(profile) {
  const p = { ...profile };
  const pinned = new Set();
  for (let pass = 0; pass < 4; pass++) {
    let delta = 0;
    for (const L of LEVELS) {
      if (pinned.has(L)) continue;
      const { floor, ceiling } = ADAPTIVE_BOUNDS[L];
      if (p[L] > ceiling) { delta += p[L] - ceiling; p[L] = ceiling; pinned.add(L); }
      else if (p[L] < floor) { delta -= floor - p[L]; p[L] = floor; pinned.add(L); }
    }
    if (Math.abs(delta) < 1e-9) break;
    const free = LEVELS.filter((L) => !pinned.has(L));
    if (!free.length) break; // everything pinned - nothing left to absorb the delta into
    const freeTotal = free.reduce((s, L) => s + p[L], 0);
    for (const L of free) {
      p[L] += freeTotal > 0 ? delta * (p[L] / freeTotal) : delta / free.length;
    }
  }
  return p;
}

/* ============================================================
   §5.2 / §8.4 - Hell selection and round ordering
   ============================================================ */

// Picks the treatment for a Hell slot from the pool of available `hard` questions in a
// category. Prefers a native-niche question (isNiche); otherwise promotes a plain hard
// question with exactly one modifier. `allowBlind` should be false whenever the round's
// answer style is locked to "choice" only - blind forces the question open (§5.2).
export function pickHellQuestion(hardPool, { allowBlind }) {
  const niche = hardPool.filter((q) => q.isNiche);
  if (niche.length) return { question: niche[Math.floor(Math.random() * niche.length)], modifier: null };
  if (!hardPool.length) return null;
  const base = hardPool[Math.floor(Math.random() * hardPool.length)];
  const modifier = allowBlind && Math.random() < 0.5 ? "blind" : "rush";
  return { question: base, modifier };
}

// Only sets level/type/options - timeLimit is deliberately left alone here. Callers normalize
// every question's timeLimit in one final pass (finalizeTimeLimit, below) once its type/level/
// modifiers are all locked in; setting it here too would mean this function's caller has to
// know whether timeLimit already holds a real base value or is still the sourcing-time `null`
// placeholder, which is exactly the kind of ordering bug this split avoids.
export function applyHellModifier(question, modifier) {
  const q = { ...question, level: "hell", modifiers: modifier ? [modifier] : [] };
  if (modifier === "blind") {
    q.type = "open";
    q.options = null;
  }
  return q;
}

// §5.1 base limits, with §5.2's `rush` modifier cutting it to 60%. Call once a question's
// final type/level/modifiers are all settled - the last step before it enters the round.
export function finalizeTimeLimit(question) {
  const base = TIME_LIMITS[question.type][question.level];
  return question.modifiers?.includes("rush") ? Math.round(base * 0.6) : base;
}

// One position (0-based) at a time: is `level` allowed to be placed here, given what's
// already been placed? Shared by both the fixed pre-built ramp and the adaptive per-question
// picker so the two paths can't drift apart on the shape rules (§8.4).
export function levelEligibleAt(level, pos, n, placedLevels) {
  const third = Math.ceil(n / 3);
  if (pos === 0) return level === "easy"; // Q1 is always easy
  if (level === "hell" && pos < third) return false; // Hell only in the final third
  if (level === "hell" && placedLevels[placedLevels.length - 1] === "hell") return false; // never adjacent
  if (level === "hard" && pos < third && n - pos > third) return false; // hard mostly middle/final third; relax once few slots remain
  const last2 = placedLevels.slice(-2);
  if (last2.length === 2 && last2[0] === level && last2[1] === level) return false; // no 3 in a row
  return true;
}

// Builds the full N-length level sequence for a fixed intensity (chill/standard/brutal),
// immutable for the whole round (§3, §8.4). `counts` - output of allocateCounts, optionally
// pre-capped by pool availability by the caller.
export function buildLevelSequence(n, counts) {
  const remaining = { ...counts };
  const placed = [];
  for (let pos = 0; pos < n; pos++) {
    const eligible = LEVELS.filter((L) => remaining[L] > 0 && levelEligibleAt(L, pos, n, placed));
    const pick = eligible.length
      ? eligible.reduce((a, b) => (remaining[a] >= remaining[b] ? a : b))
      : LEVELS.filter((L) => remaining[L] > 0).sort((a, b) => LEVELS.indexOf(a) - LEVELS.indexOf(b))[0];
    placed.push(pick);
    remaining[pick]--;
  }
  return placed;
}

// Assigns a category to each already-leveled slot: balanced by largest-remainder (§4), and
// interleaved so the same category never runs 3 deep (§8.4). `available[category][level]` is
// the pool's remaining question count for that slice - a category is skipped for a slot if it
// has nothing left at that level, so a thin category never blocks the round.
export function assignCategories(levelSeq, categories, available) {
  const n = levelSeq.length;
  const targetCounts = allocateEven(n, categories);
  const remaining = { ...targetCounts };
  const lastCats = [];
  const result = [];
  for (let i = 0; i < n; i++) {
    const level = levelSeq[i];
    const need = (c) => (available[c] && available[c][level] > 0);
    const last2 = lastCats.slice(-2);
    let pick =
      categories
        .filter((c) => need(c) && remaining[c] > 0 && !(last2.length === 2 && last2[0] === c && last2[1] === c))
        .sort((a, b) => remaining[b] - remaining[a])[0] ||
      categories.filter((c) => need(c) && !(last2.length === 2 && last2[0] === c && last2[1] === c))[0] ||
      categories.find((c) => need(c)) ||
      categories[0];
    result.push(pick);
    lastCats.push(pick);
    if (remaining[pick] !== undefined) remaining[pick]--;
    if (available[pick]) available[pick][level]--;
  }
  return result;
}

// Generic largest-remainder allocator over an arbitrary set of equally-weighted keys (used
// for category balancing, which - unlike levels - has no "harder" tie-break, so ties just
// go in list order).
export function allocateEven(n, keys) {
  const raw = {}, floor = {}, rem = {};
  for (const k of keys) { raw[k] = n / keys.length; floor[k] = Math.floor(raw[k]); rem[k] = raw[k] - floor[k]; }
  let leftover = n - keys.reduce((s, k) => s + floor[k], 0);
  const order = [...keys].sort((a, b) => rem[b] - rem[a]);
  for (let i = 0; i < leftover; i++) floor[order[i % order.length]]++;
  return floor;
}

/* ============================================================
   §9 - The Double
   ============================================================ */

// One tier above the round's hardest SERVED level, capped at hell (§9).
export function doubleLevel(servedLevels) {
  const maxIdx = servedLevels.reduce((m, L) => Math.max(m, LEVELS.indexOf(L)), 0);
  return LEVELS[Math.min(maxIdx + 1, LEVELS.length - 1)];
}

/* ============================================================
   §10.2 - Open-answer normalisation and matching
   ============================================================ */

const LEADING_ARTICLES = /^(the|a|an|le|la)\s+/;
const ONES = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
const TENS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };

// §10.2's listed pipeline strips punctuation (which would eat the apostrophe in "l'") before
// stripping leading articles - that ordering can never actually match "l'", so the elision is
// stripped here as its own first pass, before generic punctuation stripping runs.
export function normalizeAnswer(input) {
  let s = String(input).toLowerCase().replace(/^l['’]/, "");
  s = s.normalize("NFD").replace(/\p{Diacritic}/gu, ""); // strip diacritics (combining marks left behind by NFD)
  s = s.replace(/[^\p{L}\p{N}\s]/gu, ""); // strip punctuation/symbols
  s = s.replace(/\s+/g, " ").trim();
  s = s.replace(LEADING_ARTICLES, "").trim();
  return s;
}

export function stripParenthetical(s) {
  return String(s).replace(/\s*\([^)]*\)/g, "").trim();
}

// Small hand-maintained alias table (§10.2) for answers that come up constantly.
export const ALIAS_GROUPS = [
  ["usa", "united states", "united states of america", "america"],
  ["uk", "united kingdom", "britain", "great britain"],
  ["russia", "russian federation"],
  ["south korea", "korea", "republic of korea"],
  ["north korea", "dprk"],
  ["netherlands", "holland"],
  ["china", "peoples republic of china", "prc"],
  ["ivory coast", "cote divoire"],
  ["czech republic", "czechia"],
  ["myanmar", "burma"],
  ["drc", "democratic republic of congo", "congo"],
  ["swaziland", "eswatini"],
  ["uae", "united arab emirates"],
  ["ussr", "soviet union"],
];

export function buildAccepted(correctAnswer) {
  const set = new Set();
  const add = (s) => { const n = normalizeAnswer(s); if (n) set.add(n); };
  add(correctAnswer);
  add(stripParenthetical(correctAnswer));
  const base = normalizeAnswer(correctAnswer);
  for (const group of ALIAS_GROUPS) {
    if (group.includes(base)) for (const alt of group) set.add(alt);
  }
  return [...set];
}

export function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] : 1 + Math.min(prev[j], cur[j - 1], prev[j - 1]);
    }
    prev = cur;
  }
  return prev[n];
}

// Parses a plain-English integer phrase ("one thousand eight hundred forty-eight") → number,
// or null if any token isn't recognised. Supports ones/teens/tens/hundred/thousand/million.
export function wordsToNumber(str) {
  const words = String(str).toLowerCase().replace(/-/g, " ").replace(/\band\b/g, " ").split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  let total = 0, current = 0, matched = false;
  for (const w of words) {
    if (w in ONES) { current += ONES[w]; matched = true; }
    else if (w in TENS) { current += TENS[w]; matched = true; }
    else if (w === "hundred") { current = (current || 1) * 100; matched = true; }
    else if (w === "thousand") { total += (current || 1) * 1000; current = 0; matched = true; }
    else if (w === "million") { total += (current || 1) * 1000000; current = 0; matched = true; }
    else return null;
  }
  return matched ? total + current : null;
}

function toNumber(s) {
  const cleaned = String(s).replace(/,/g, "").trim();
  if (cleaned !== "" && !isNaN(Number(cleaned))) return Number(cleaned);
  return wordsToNumber(s);
}

// §10.2's verdict table, in order. Returns "correct" | "dispute" | "wrong".
export function matchOpenAnswer(submitted, correctAnswer, accepted) {
  const subN = normalizeAnswer(submitted);
  if (!subN) return "wrong"; // empty submission is never disputed
  const ansN = normalizeAnswer(correctAnswer);
  if (subN === ansN || accepted.includes(subN)) return "correct";

  const dist = levenshtein(subN, ansN);
  const len = ansN.length || 1;
  if (dist <= Math.ceil(len / 6)) return "correct";

  const subNum = toNumber(submitted), ansNum = toNumber(correctAnswer);
  if (subNum !== null && ansNum !== null && subNum === ansNum) return "correct";

  const wholeWordHit = new RegExp(`(^|\\s)${ansN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s|$)`).test(subN);
  if (dist <= Math.ceil(len / 3) || wholeWordHit) return "dispute";

  return "wrong";
}

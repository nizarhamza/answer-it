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
];
export const CATEGORY_KEYS = CATEGORIES.map((c) => c.key);

// The Trivia API v2 category keys per Answer It category. `games` has no category of its own
// on Trivia API - it only exists as tags (queried separately, see TRIVIA_API_TAGS below).
export const TRIVIA_API_CATEGORIES = {
  general: ["general_knowledge"],
  science: ["science"],
  history: ["history", "politics"],
  geography: ["geography"],
  music: ["music"],
  screen: ["film_and_tv"],
  games: [],
  sport: ["sport_and_leisure"],
  arts: ["arts_and_literature"],
  culture: ["society_and_culture", "food_and_drink"],
};
export const TRIVIA_API_TAGS = { games: ["video_games", "board_games"] };

// OpenTDB numeric category ids (opentdb.com/api_category.php) - one call per id, §6.1.
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

// Question quality gate + curated-bank loader (§6.5).
//
// Why this file exists: the public APIs are a *volume* source, not a *quality* source. Left
// unfiltered they serve obscure one-hit-wonder questions, coin-flip year questions, and a heavy
// US/UK slant. Everything from an API now has to survive `gradeQuestion()` before it can enter
// the bank; the curated core (bank/curated-core.js) skips the gate because it was written to pass it.
//
// Pure functions only - no fetch, no KV. Same "runs in the browser or the Worker" rule as
// game-core.js, so solo mode filters with exactly the same code the bank does.

import { normalizeAnswer, levenshtein } from "./game-core.js";

/* ============================================================
   §6.5.1 - Hard rejects
   ============================================================ */

const MIN_QUESTION_LEN = 20;
const MAX_QUESTION_LEN = 180;
const MAX_ANSWER_LEN = 45;   // longer than this and nobody can type it, or read it under 15s
const MIN_ANSWER_LEN_OPEN = 2;   // "K" is a fine multiple-choice answer and a terrible typed one

// Meta-phrasings that only make sense on a paper quiz, plus questions that lean on media we
// don't have (§22 image/audio questions are parked).
const BAD_PHRASING = [
  /which of the following/i,
  /\ball of the above\b/i,
  /\bnone of the above\b/i,
  /\b(pictured|shown|depicted) (above|below|here)\b/i,
  /\bin the (image|picture|photo|video|clip)\b/i,
  /\bthis (song|image|picture|clip|logo)\b/i,
  /\bfill in the blank\b/i,
  /\b(true or false)\b/i,
  /_{3,}/,                              // fill-in-the-gap templates
];

// "Correct as of when?" questions rot. Anything scoped to a past year is out.
const STALE = /\bas of\s+(19|20)\d\d\b|\bin\s+20(0\d|1\d|2[0-5])\b(?=[^?]*\bcurrently\b)/i;

// Domestic-only material: the single biggest driver of "these questions aren't for us".
// Deliberately narrow - it kills leagues/soaps/civics that only land in one country, and leaves
// globally-followed things (Premier League, NBA, Olympics, Hollywood) alone.
const PAROCHIAL = [
  /\bNFL\b|\bNASCAR\b|\bSuper Bowl\b|\bMajor League Baseball\b|\bMLB\b|\bNHL\b/i,
  /\bAmerican football\b|\bWorld Series\b|\bStanley Cup\b/i,
  /\b(which|what)\s+(U\.?S\.?|American|British|English|Australian|Canadian)\s+(state|county|city|town|province|shire)\b/i,
  /\bstate capital\b|\bcounty in (England|Ireland|Wales|Scotland)\b/i,
  /\bEastEnders\b|\bCoronation Street\b|\bHollyoaks\b|\bNeighbours\b|\bHome and Away\b/i,
  /\bSaturday Night Live\b|\bJeopardy!?\b|\bWheel of Fortune\b/i,
  /\bcongressman\b|\bsenator from\b|\bMember of Parliament for\b/i,
  /\bA-?Level\b|\bGCSE\b|\bSAT\b(?!\w)/i,
];

// ---- Tag policy (The Trivia API only; OpenTDB ships no tags) --------------------------------
// Tags turn out to be the single most useful quality signal the API gives us - far better than
// `difficulty`. Three buckets:

// 1. Straight out. Domestic-league sport, gambling, and one-hit-wonder nostalgia are the exact
//    material that made the first playtest fall flat.
const TAG_REJECT = new Set([
  "us_states", "american_football", "nfl", "baseball", "mlb", "nascar", "horse_racing",
  "gambling", "casinos", "one_hit_wonders", "soap_operas", "british_sitcoms", "nhl",
  "college_football", "college_basketball", "rodeo", "poker",
]);

// 2. Fandom deep-cuts. Fine as *Hell* material, never as the easy/medium body of a round.
const DEEP_CUT_TAGS = new Set([
  "warhammer", "magic_the_gathering", "yu_gi_oh", "runescape", "world_of_warcraft",
  "elder_scrolls", "star_trek", "doctor_who", "my_little_pony", "gundam", "cult_films",
]);

// 3. Soft penalties. A question tagged for one country, or for a decade most of the room did not
//    live through, is not *wrong* - it just loses to a question that travels.
const COUNTRY_TAGS = new Set([
  "usa", "uk", "england", "scotland", "wales", "ireland", "northern_ireland",
  "australia", "new_zealand", "canada", "ohio", "texas", "california", "florida",
]);
const DECADE_TAGS = /^(19[0-8]0)('?s)?$/;
const DRY_TAGS = new Set(["words", "language", "etymology", "vocabulary", "measurements"]);

// "Which Heavweight Boxer Was Known As The Real Deal?" - capitalising every word correlates
// almost perfectly with sloppy, mis-spelled, user-submitted entries.
function isTitleCased(text) {
  const words = text.split(/\s+/).filter((w) => /^[A-Za-z]{4,}$/.test(w));
  if (words.length < 4) return false;
  const caps = words.filter((w) => /^[A-Z]/.test(w)).length;
  return caps / words.length > 0.7;
}

const YEAR_RE = /^(1[0-9]{3}|20[0-9]{2})$/;
const NUMERIC_RE = /^-?[\d.,]+$/;

function isYearSet(options) {
  return options.length > 1 && options.every((o) => YEAR_RE.test(o.trim()));
}

function numericSpread(options) {
  const nums = options.map((o) => Number(String(o).replace(/,/g, ""))).filter((n) => Number.isFinite(n));
  if (nums.length !== options.length) return null;
  return Math.max(...nums) - Math.min(...nums);
}

// Two options that are the same answer twice make the question unanswerable. Note the bar is
// *sameness*, not similarity: "O negative" vs "B negative" and "Bollywood" vs "Tollywood" are one
// edit apart and both perfectly fair, so an edit-distance rule here would eat good questions.
// The only similarity we do catch is one option swallowing another whole ("Titanic" / "Titanic ").
function hasNearDuplicateOptions(options) {
  const norm = options.map((o) => normalizeAnswer(o));
  for (let i = 0; i < norm.length; i++) {
    for (let j = i + 1; j < norm.length; j++) {
      const a = norm[i], b = norm[j];
      if (!a || !b) return true;
      if (a === b) return true;
      const [shortS, longS] = a.length <= b.length ? [a, b] : [b, a];
      if (shortS.length >= 6 && longS.includes(shortS) && shortS.length / longS.length > 0.9) return true;
    }
  }
  return false;
}

// The answer sitting inside the question text is a free point. Matched on whole words, because
// substring matching thinks "Which vitamin does your skin make..." gives away "Vitamin D".
function answerLeaksIntoText(text, answer) {
  const a = normalizeAnswer(answer);
  if (a.length < 4) return false;
  const words = normalizeAnswer(text).split(" ");
  const target = a.split(" ");
  for (let i = 0; i + target.length <= words.length; i++) {
    let hit = true;
    for (let k = 0; k < target.length; k++) if (words[i + k] !== target[k]) { hit = false; break; }
    if (hit) return true;
  }
  return false;
}

/* ============================================================
   §6.5.2 - grade()
   ============================================================
   Returns { ok, reason, score }. `score` (0-100) only means anything when ok is true; the bank
   sorts by it so the best of a batch lands in the bank and the rest is dropped, rather than
   taking whatever the API happened to return first.
*/
export function gradeQuestion(q, { allowNiche = false, strictRegion = true } = {}) {
  const text = String(q.text || "").trim();
  const answer = String(q.correctAnswer ?? q.options?.[q.answerIndex] ?? "").trim();
  const options = (q.options || []).map((o) => String(o).trim());
  const reject = (reason) => ({ ok: false, reason, score: 0 });

  if (text.length < MIN_QUESTION_LEN) return reject("too-short");
  if (text.length > MAX_QUESTION_LEN) return reject("too-long");
  if (!answer) return reject("no-answer");
  if (q.type === "open" && answer.length < MIN_ANSWER_LEN_OPEN) return reject("answer-too-short-to-type");
  if (answer.length > MAX_ANSWER_LEN) return reject("answer-unwieldy");
  if (q.type === "choice" && options.length !== 4) return reject("bad-option-count");

  for (const re of BAD_PHRASING) if (re.test(text)) return reject("meta-phrasing");
  if (STALE.test(text)) return reject("stale-scoped");
  if (strictRegion) for (const re of PAROCHIAL) if (re.test(text)) return reject("parochial");
  if (answerLeaksIntoText(text, answer)) return reject("answer-leak");

  // Pure guess-the-year / guess-the-number questions. A four-year spread of 3 is a coin flip
  // whatever the event, so that is a reject; wider spreads are merely *dull* ("in which year did
  // WWII end?" is a fair question), so they take a score penalty and sink below better material.
  let dullNumbers = 0;
  if (options.length) {
    if (hasNearDuplicateOptions(options)) return reject("ambiguous-options");
    const spread = numericSpread(options);
    if (isYearSet(options)) {
      if (spread !== null && spread <= 3) return reject("coin-flip-year");
      if (spread !== null && spread <= 40) dullNumbers = 20;
    } else if (options.every((o) => NUMERIC_RE.test(o))) {
      const biggest = Math.max(...options.map((o) => Math.abs(Number(String(o).replace(/,/g, "")))));
      if (spread !== null && biggest >= 100 && spread / biggest < 0.08) return reject("coin-flip-number");
      if (spread !== null && biggest > 0 && spread / biggest < 0.25) dullNumbers = 10;
    }
  }

  const tags = (q.tags || []).map((t) => String(t).toLowerCase().replace(/[^a-z0-9_']/g, ""));
  if (tags.some((t) => TAG_REJECT.has(t))) return reject("blocked-tag");
  if (!allowNiche && tags.some((t) => DEEP_CUT_TAGS.has(t))) return reject("deep-cut-tag");
  if (!allowNiche && q.isNiche && q.level !== "hard") return reject("niche-outside-hell");

  /* --- scoring: everything below here has already passed --- */
  let score = 60;
  //  Short, clean questions play better out loud on a shared screen.
  if (text.length <= 90) score += 10;
  else if (text.length > 140) score -= 10;
  //  A short answer is a *sayable* answer - and it is what makes a blind Hell round possible.
  if (answer.length <= 20) score += 8;
  //  Parentheticals are almost always a disambiguation the writer needed and the player doesn't.
  if (/\(/.test(text)) score -= 8;
  //  Dates and roman numerals as answers are the driest thing the APIs ship.
  if (YEAR_RE.test(answer) || /^[IVXLC]+$/.test(answer)) score -= 12;
  //  Negations flip half the room's answer for the wrong reason.
  if (/\bnot\b|\bexcept\b|\bnever\b/i.test(text)) score -= 10;
  //  Niche is a Hell ingredient, so it is worth *more* when we are explicitly shopping for Hell.
  if (q.isNiche) score += allowNiche ? 12 : -15;
  //  Trivia API region hints: a question tagged for one country travels badly.
  if (Array.isArray(q.regions) && q.regions.length && q.regions.length <= 2) score -= 10;
  score -= dullNumbers;
  //  Tag signals (see the tag policy above).
  if (tags.some((t) => COUNTRY_TAGS.has(t))) score -= 14;
  if (tags.some((t) => DECADE_TAGS.test(t))) score -= 14;
  if (tags.some((t) => DRY_TAGS.has(t))) score -= 10;
  //  A period reference in the text itself does the same job as a decade tag.
  if (/\b(19[0-8]\d)\b/.test(text) || /\b([2-8]0'?s)\b/.test(text)) score -= 10;
  //  A quoted two-word proper name is almost always a character nobody outside the fandom knows
  //  ("Which film contains the character 'Carl Spackler'?").
  if (/['\u2018\u201c"][A-Z][a-z]+ [A-Z][a-z]+['\u2019\u201d"]/.test(text)) score -= 12;
  //  Title-Cased Questions Like This One are user submissions, and they are reliably the worst
  //  written and most typo-ridden entries in the pool.
  if (isTitleCased(text)) score -= 18;
  //  "Which of these ..." is paper-quiz phrasing; survivable, but never the best question in a batch.
  if (/which of these/i.test(text)) score -= 4;
  //  "Which book contains the character 'X'?" is a template the APIs run on very obscure works.
  if (/contains the (character|line|quote)/i.test(text)) score -= 14;
  //  A long quoted title is usually a work only specialists have heard of.
  const quoted = text.match(/['\u2018\u201c"]([^'\u2019\u201d"]{6,})['\u2019\u201d"]/);
  if (quoted && quoted[1].length > 28) score -= 8;

  return { ok: true, reason: null, score: Math.max(0, Math.min(100, score)) };
}

// A Hell `blind` promotion (§5.2) strips the options, so the answer has to survive being typed:
// long enough to be unambiguous, short enough to bother.
export function isBlindEligible(q) {
  const a = String(q.correctAnswer ?? q.options?.[q.answerIndex] ?? "").trim();
  return a.length >= MIN_ANSWER_LEN_OPEN && a.length <= 30 && !/^[\d.,]+$/.test(a);
}

/* ============================================================
   §6.5.3 - De-dupe
   ============================================================
   Two APIs ask "What is the capital of Australia?" in three different wordings. Key on the
   *answer plus the content words of the question* so re-phrasings collapse together.
*/
const STOPWORDS = new Set("the a an of in on at to for is are was were which what who whom whose how many much did do does you your it its and or by from with as".split(" "));

export function dedupeKey(q) {
  const answer = normalizeAnswer(q.correctAnswer ?? q.options?.[q.answerIndex] ?? "");
  const words = normalizeAnswer(q.text)
    .split(/\s+/)
    .filter((w) => w && !STOPWORDS.has(w))
    .sort()
    .slice(0, 8)
    .join("-");
  return `${answer}|${words}`;
}

export function dedupe(questions, seenKeys = new Set()) {
  const out = [];
  for (const q of questions) {
    const k = dedupeKey(q);
    if (seenKeys.has(k)) continue;
    seenKeys.add(k);
    out.push(q);
  }
  return out;
}

/* ============================================================
   §6.5.4 - Batch filter
   ============================================================ */
export const MIN_BANK_SCORE = 66; // tuned against a live sample - see QUESTIONS.md

export function filterBatch(questions, opts = {}) {
  const minScore = opts.minScore ?? MIN_BANK_SCORE;
  const kept = [];
  const rejected = [];
  for (const q of questions) {
    const g = gradeQuestion(q, opts);
    if (!g.ok) { rejected.push({ q, reason: g.reason }); continue; }
    if (g.score < minScore) { rejected.push({ q, reason: "low-score:" + g.score }); continue; }
    kept.push({ ...q, _score: g.score });
  }
  kept.sort((a, b) => b._score - a._score);
  return { kept: dedupe(kept, opts.seenKeys), rejected };
}

/* ============================================================
   §6.5.5 - The curated core
   ============================================================
   bank/curated-core.js is a classic script that assigns globalThis.ANSWER_IT_CURATED, so the
   same file works via <script src> over file:// and via a side-effect import in the Worker.
*/
function slug(s) {
  return normalizeAnswer(s).replace(/\s+/g, "-").slice(0, 48);
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Curated row (compact keys, see bank/curated-core.js) -> the §3 Question shape.
export function normalizeCurated(row, buildAccepted, { asOpen = false } = {}) {
  const correct = String(row.a).trim();
  const options = shuffle([correct, ...row.w.map((s) => String(s).trim())]);
  const open = asOpen && row.o === true;
  return {
    id: `cur:${row.c}:${slug(row.t)}`,
    source: "custom",
    text: String(row.t).trim(),
    category: row.c,
    level: row.l,
    type: open ? "open" : "choice",
    options: open ? [] : options,
    answerIndex: open ? -1 : options.indexOf(correct),
    accepted: buildAccepted(correct),
    modifiers: [],
    timeLimit: null,
    media: null,
    isNiche: !!row.n,
    region: row.r || "global",
    correctAnswer: correct,
  };
}

export function loadCurated(buildAccepted, { category, level, asOpen = false } = {}) {
  const rows = globalThis.ANSWER_IT_CURATED || [];
  return rows
    .filter((r) => (!category || r.c === category) && (!level || r.l === level))
    .map((r) => normalizeCurated(r, buildAccepted, { asOpen }));
}

/* ============================================================
   §6.5.6 - The hybrid mix
   ============================================================
   Curated first, API only to fill. `curatedShare` is a floor, not a quota: if there are enough
   curated questions for the whole slice we happily use them all.
*/
export const DEFAULT_CURATED_SHARE = 0.6;

export function mixPool(curated, apiFiltered, count, { curatedShare = DEFAULT_CURATED_SHARE } = {}) {
  const wantCurated = Math.min(curated.length, Math.ceil(count * curatedShare));
  const pick = shuffle(curated).slice(0, wantCurated);
  const seen = new Set(pick.map(dedupeKey));
  for (const q of apiFiltered) {
    if (pick.length >= count) break;
    const k = dedupeKey(q);
    if (seen.has(k)) continue;
    seen.add(k);
    pick.push(q);
  }
  // Still short (thin category, APIs down): top up from whatever curated is left.
  if (pick.length < count) {
    for (const q of shuffle(curated)) {
      if (pick.length >= count) break;
      const k = dedupeKey(q);
      if (seen.has(k)) continue;
      seen.add(k);
      pick.push(q);
    }
  }
  return shuffle(pick);
}

import "./bank/curated-core.js";
import "./bank/curated-extra.js";
import { buildAccepted, normalizeAnswer } from "./worker/src/game-core.js";
import { gradeQuestion, dedupeKey, normalizeCurated } from "./worker/src/quality.js";

const rows = globalThis.ANSWER_IT_CURATED;
console.log("curated rows:", rows.length);

// 1. schema
const bad = [];
for (const r of rows) {
  if (!r.c || !r.l || !r.t || !r.a || !Array.isArray(r.w) || r.w.length !== 3) bad.push(r.t || JSON.stringify(r));
  if (!/^(easy|medium|hard)$/.test(r.l)) bad.push("bad level: " + r.t);
  if (!r.t.trim().endsWith("?")) bad.push("no question mark: " + r.t);
}
console.log("schema problems:", bad.length, bad.slice(0, 5));

// 2. option collisions within a row
let collide = 0;
for (const r of rows) {
  const set = new Set([r.a, ...r.w].map(normalizeAnswer));
  if (set.size !== 4) { collide++; console.log("  collision:", r.t); }
}
console.log("option collisions:", collide);

// 3. duplicate questions across the bank
const seen = new Map();
let dups = 0;
for (const r of rows) {
  const q = normalizeCurated(r, buildAccepted);
  const k = dedupeKey(q);
  if (seen.has(k)) { dups++; console.log("  dup:", r.t, "<->", seen.get(k)); }
  seen.set(k, r.t);
}
console.log("duplicates:", dups);

// 4. every curated question must pass its own gate
let fails = 0;
for (const r of rows) {
  const q = normalizeCurated(r, buildAccepted);
  const g = gradeQuestion(q, { allowNiche: true });
  if (!g.ok) { fails++; console.log("  gate fail [" + g.reason + "]:", r.t); }
}
console.log("gate failures:", fails);

// 5. region spread
const reg = {};
for (const r of rows) reg[r.r || "?"] = (reg[r.r || "?"] || 0) + 1;
console.log("regions:", reg);
const west = (reg.na || 0) + (reg.europe || 0);
console.log("non-Western share:", Math.round((1 - west / rows.length) * 100) + "%");

// 6. open-question readiness
console.log("open-capable:", rows.filter(r => r.o).length);
// 7. hell candidates (hard + niche) per category
const hell = {};
for (const r of rows) if (r.l === "hard" && r.n) hell[r.c] = (hell[r.c] || 0) + 1;
console.log("native-hell candidates:", hell);

// 8. the hand-written locale banks (tier 0 of the translation chain in index.html).
//    A gap here is not fatal at runtime - a missing entry just falls through to the Worker and
//    then to MyMemory - but it is always a mistake, so it is reported as one. The option map is
//    what matters most: options are shuffled at load time, so every option has to be translated
//    by name, and two of them folding onto the same string would make the question unanswerable.
const LOCALE_BANKS = [
  { lang: "ar", file: "./bank/curated-ar.js", varName: "ANSWER_IT_BANK_AR", script: /[\u0600-\u06FF]/ },
  { lang: "fr", file: "./bank/curated-fr.js", varName: "ANSWER_IT_BANK_FR", script: null },
];
for (const b of LOCALE_BANKS) {
  try { await import(b.file); } catch { console.log(b.lang + " bank: not present (skipped)"); continue; }
  const bank = globalThis[b.varName];
  if (!bank) { console.log(b.lang + " bank: " + b.varName + " not set"); continue; }
  const problems = [];
  for (const r of rows) {
    const e = bank[r.t];
    if (!e) { problems.push("missing: " + r.t); continue; }
    if (!e.t || !e.t.trim()) problems.push("empty text: " + r.t);
    else if (e.t.trim() === r.t.trim()) problems.push("untranslated text: " + r.t);
    else if (b.script && !b.script.test(e.t)) problems.push("text not in the target script: " + r.t);
    const eng = [r.a, ...r.w];
    const map = e.o || {};
    for (const o of eng) if (!(o in map)) problems.push("option not mapped [" + o + "]: " + r.t);
    for (const k of Object.keys(map)) if (!eng.includes(k)) problems.push("stale option key [" + k + "]: " + r.t);
    const tr = eng.map((o) => map[o]).filter(Boolean);
    if (tr.length === eng.length) {
      if (tr.some((x) => !String(x).trim())) problems.push("empty option: " + r.t);
      if (new Set(tr.map(normalizeAnswer)).size !== tr.length) problems.push("options collide after translation: " + r.t);
    }
  }
  const extra = Object.keys(bank).filter((k) => !rows.some((r) => r.t === k));
  for (const k of extra) problems.push("entry for a question not in the core bank: " + k);
  console.log(b.lang + " bank problems:", problems.length, problems.slice(0, 5));
}

import "./bank/curated-core.js";
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

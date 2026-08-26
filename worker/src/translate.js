/* ============================================================
   Whole-question translation on Workers AI
   ============================================================
   The problem this exists to solve: MyMemory (the browser-side fallback) translates one string
   at a time, so a bare option like "Mercury", "Bass", "Orange" or "Turkey" arrives at the
   translator with nothing to disambiguate it - not the question, not the category, not the other
   three options. It picks whichever sense is commonest in its corpus and is wrong about half the
   time on exactly the questions players notice.

   Here the whole question travels as one unit: category, question text and every option in a
   single prompt, with the model told to keep the options mutually distinct and to keep the
   correct answer correct. That context is the entire point of this endpoint.

   Cost (see DEPLOY.md): about 6-7 neurons per question on llama-3.1-8b-instruct-fp8, against a
   free allowance of 10,000/day - and each question is translated once, ever, for every player,
   because the result is cached in KV. English rounds cost nothing at all.
   ============================================================ */

const MODEL = "@cf/meta/llama-3.1-8b-instruct-fp8";
const CACHE_VERSION = "v1"; // bump to invalidate every cached translation at once
const CACHE_TTL_S = 60 * 60 * 24 * 90; // 90 days
export const MAX_BATCH = 20;
const MAX_TEXT = 400;

// Per-language instruction for how names should be handled. This mirrors what the hand-written
// locale banks (bank/curated-ar.js, bank/curated-fr.js) already do, so the two tiers do not
// disagree about how "Pink Floyd" should look.
const LANGS = {
  ar: {
    name: "Arabic",
    properNouns:
      "Proper nouns - people, bands, films, games, brands, places - must be TRANSLITERATED into " +
      "Arabic script (\"Pink Floyd\" becomes \"بينك فلويد\"). Never translate what the name means, and never " +
      "add the English original in brackets.",
    script: /[؀-ۿ]/,
  },
  fr: {
    name: "French",
    properNouns:
      "Proper nouns - people, bands, films, games, brands, places - keep their established French " +
      "form if one exists (\"Michel-Ange\", \"Léonard de Vinci\", \"Le Roi lion\"), and are left exactly " +
      "as written if none does (\"Pink Floyd\", \"Wizkid\").",
    script: null, // French shares the Latin script; there is nothing to assert
  },
};
export const SUPPORTED_LANGS = Object.keys(LANGS);

function cacheKey(lang, key) {
  return `t:${CACHE_VERSION}:${lang}:${key}`;
}

// Same folding as normalizeAnswer() in index.html, reduced to what the collision check needs.
function fold(s) {
  return String(s).toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ").trim();
}

function buildMessages(lang, q) {
  const L = LANGS[lang];
  const isChoice = Array.isArray(q.options) && q.options.length > 0;
  const lines = [
    `Category: ${q.category || "general knowledge"}`,
    `Question: ${q.text}`,
  ];
  if (isChoice) {
    lines.push("Options:");
    q.options.forEach((o, i) => lines.push(`${i + 1}. ${o}`));
  } else {
    lines.push(`Answer: ${q.answer}`);
  }
  lines.push(
    "",
    `Translate into ${L.name}.`,
    "",
    "Rules:",
    "- Translate the question and every option as ONE unit. Use the category, the question and " +
      "the sibling options to choose the right sense of an ambiguous word: \"Mercury\" in a " +
      "science question is the planet or the metal, never a person.",
    "- Keep the options mutually distinct. Two options must never come out as the same phrase - " +
      "if a literal translation would collide, pick different but still accurate wording.",
    isChoice
      ? "- Option 1 is the correct answer. Its translation must remain the correct answer to the " +
        "translated question."
      : "- The answer must remain a correct answer to the translated question.",
    `- ${L.properNouns}`,
    "- Leave numbers, years, chemical symbols and units exactly as they are.",
    "- Keep every option short: they are shown in a four-button grid on a phone.",
    "- Do not answer the question, do not explain, do not add commentary.",
    "",
    isChoice
      ? `Return exactly this JSON and nothing else: {"text": "...", "options": [${q.options
          .map(() => '"..."').join(", ")}]} - the options in the SAME order as above.`
      : 'Return exactly this JSON and nothing else: {"text": "...", "answer": "..."}',
  );
  return [
    {
      role: "system",
      content:
        `You are a professional translator of multiple-choice trivia questions from English into ` +
        `${L.name}. You reply with a single JSON object and nothing else - no preamble, no code ` +
        `fence, no explanation.`,
    },
    { role: "user", content: lines.join("\n") },
  ];
}

// Small models put JSON inside prose or a code fence often enough that demanding a clean body is
// the wrong trade. `response_format` is deliberately not used: support varies by model, and an
// unsupported value fails the whole call rather than degrading.
function extractJson(raw) {
  const s = String(raw ?? "");
  const start = s.indexOf("{");
  if (start < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) {
      try { return JSON.parse(s.slice(start, i + 1)); } catch { return null; }
    }
  }
  return null;
}

// Everything the model returns is treated as untrusted. A question that fails any of these is
// dropped from the response entirely, which drops the client back to MyMemory and then to
// English - a question is never shown in a broken state because a model had an off moment.
function validate(lang, q, parsed) {
  const L = LANGS[lang];
  if (!parsed || typeof parsed.text !== "string") return null;
  const text = parsed.text.trim();
  if (!text || text.length > MAX_TEXT * 2) return null;
  if (text === q.text.trim()) return null;                 // came back untranslated
  if (L.script && !L.script.test(text)) return null;        // came back in the wrong script

  const isChoice = Array.isArray(q.options) && q.options.length > 0;
  if (!isChoice) {
    const answer = typeof parsed.answer === "string" ? parsed.answer.trim() : "";
    if (!answer || answer.length > 120) return null;
    return { text, answer };
  }

  const options = Array.isArray(parsed.options) ? parsed.options.map((o) => String(o ?? "").trim()) : [];
  if (options.length !== q.options.length) return null;
  if (options.some((o) => !o || o.length > 120)) return null;
  if (new Set(options.map(fold)).size !== options.length) return null; // unanswerable if two collide
  return { text, options };
}

async function translateOne(env, lang, q) {
  let out;
  try {
    out = await env.AI.run(MODEL, {
      messages: buildMessages(lang, q),
      max_tokens: 600,
      temperature: 0.2, // translation, not invention
    });
  } catch {
    return null; // out of neurons, model unavailable, timeout - all the same to the caller
  }
  return validate(lang, q, extractJson(out?.response ?? out?.result?.response ?? out));
}

/* Translates a batch, cache-first. Returns { results, meta }; a question that could not be
   translated is simply absent from `results`, and the client falls through to its next tier. */
export async function translateBatch(env, lang, questions) {
  const results = {};
  const meta = { cached: 0, translated: 0, failed: 0 };
  const misses = [];

  // KV reads are cheap (100k/day free) and most questions are hits after the first few rounds.
  await Promise.all(questions.map(async (q) => {
    try {
      const hit = await env.TRANSLATIONS?.get(cacheKey(lang, q.key), { type: "json" });
      if (hit) { results[q.key] = hit; meta.cached++; return; }
    } catch { /* KV unavailable - fall through and translate */ }
    misses.push(q);
  }));

  await Promise.all(misses.map(async (q) => {
    const value = await translateOne(env, lang, q);
    if (!value) { meta.failed++; return; }
    results[q.key] = value;
    meta.translated++;
    // The free plan allows 1,000 KV writes/day. Hitting that cap must not fail the request: the
    // translation is already computed and correct, it just will not be remembered today.
    try {
      await env.TRANSLATIONS?.put(cacheKey(lang, q.key), JSON.stringify(value), { expirationTtl: CACHE_TTL_S });
    } catch { /* write cap or KV outage - serve it anyway */ }
  }));

  return { results, meta };
}

/* Shapes and bounds whatever the client posted. Returns null if the body is unusable. */
export function parseRequest(body) {
  if (!body || typeof body !== "object") return null;
  const lang = String(body.lang || "");
  if (!SUPPORTED_LANGS.includes(lang)) return null;
  if (!Array.isArray(body.questions) || !body.questions.length) return null;

  const questions = [];
  for (const raw of body.questions.slice(0, MAX_BATCH)) {
    const key = String(raw?.key || "").slice(0, 64);
    const text = String(raw?.text || "").trim().slice(0, MAX_TEXT);
    if (!key || !text) continue;
    const options = Array.isArray(raw.options)
      ? raw.options.map((o) => String(o ?? "").trim().slice(0, 120)).filter(Boolean)
      : [];
    const answer = String(raw?.answer || "").trim().slice(0, 120);
    if (!options.length && !answer) continue; // nothing to keep consistent with the question
    questions.push({ key, text, category: String(raw?.category || "").slice(0, 32), options, answer });
  }
  return questions.length ? { lang, questions } : null;
}

/* ============================================================
   Answer It - Worker entry point
   ============================================================
   Today this serves exactly one route, POST /api/translate (see translate.js): whole-question
   translation on Workers AI, cached in KV. It is tier 1 of the client's translation chain and is
   entirely optional - index.html ships with TRANSLATE_ENDPOINT empty and falls back to its
   hand-written locale banks, then MyMemory, then English. Deploying this makes the API-sourced
   ~40% of a round read properly in Arabic and French; not deploying it changes nothing else.

   Multiplayer rooms (Durable Object per 6-digit code) are not built yet - see ANSWER-IT.md §16.
   When they land they slot in beside the translate route, exactly as in find-it-site's worker.

   Deploy:  cd worker && npm install && npx wrangler kv namespace create TRANSLATIONS
            (paste the printed id into wrangler.toml) && npx wrangler deploy
   ============================================================ */
import { translateBatch, parseRequest, MAX_BATCH } from "./translate.js";

// Left open (not pinned to https://answer-it.pages.dev) so the game still works from file://
// and from Pages preview deployments (random *.answer-it.pages.dev subdomains per branch/PR).
const ALLOWED_ORIGIN = "*";

function withCORS(resp) {
  const h = new Headers(resp.headers);
  h.set("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  h.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  h.set("Access-Control-Allow-Headers", "Content-Type");
  return new Response(resp.body, { status: resp.status, headers: h });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return withCORS(new Response(null, { status: 204 }));

    if (url.pathname === "/api/health") {
      return withCORS(json({ ok: true, ai: !!env.AI, cache: !!env.TRANSLATIONS }));
    }

    if (url.pathname === "/api/translate" && request.method === "POST") {
      if (!env.AI) return withCORS(json({ error: "no AI binding" }, 503));
      let body;
      try { body = await request.json(); } catch { return withCORS(json({ error: "bad json" }, 400)); }
      const parsed = parseRequest(body);
      if (!parsed) {
        return withCORS(json({ error: `expected { lang: "ar"|"fr", questions: [...] }, max ${MAX_BATCH}` }, 400));
      }
      // A partial result is a good result: whatever is missing falls through to the client's next
      // tier, so this route answers 200 even when every single question failed.
      const { results, meta } = await translateBatch(env, parsed.lang, parsed.questions);
      return withCORS(json({ results, meta }));
    }

    return withCORS(json({ error: "not found" }, 404));
  },
};

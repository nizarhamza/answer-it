/* ============================================================
   Answer It - Worker entry point
   ============================================================
   Two independent features live here:
     - POST /api/translate (translate.js): whole-question translation on Workers AI, cached in
       KV. Tier 1 of the client's translation chain, entirely optional.
     - /api/rooms* (room.js): multiplayer rooms, one Durable Object per 6-digit code, ported from
       find-it-site's index.js/room.js pattern (ANSWER-IT.md §16).

   Deploy:  cd worker && npm install && npx wrangler kv namespace create TRANSLATIONS
            (paste the printed id into wrangler.toml) && npx wrangler deploy
   ============================================================ */
import { translateBatch, parseRequest, MAX_BATCH } from "./translate.js";
import { Room } from "./room.js";
export { Room };

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

    if (url.pathname === "/api/rooms" && request.method === "POST") {
      if (!env.ROOMS) return withCORS(json({ error: "rooms are not enabled on this deployment" }, 503));
      let body;
      try { body = await request.json(); } catch { return withCORS(json({ error: "bad json" }, 400)); }
      const { hostId, hostName } = body || {};
      if (!hostId || !hostName) return withCORS(json({ error: "missing fields" }, 400));

      // A handful of random codes; a 409 only happens if that exact 6-digit code already has a
      // live-or-unfinished room, which is rare across a ~1M-code space (find-it-site's pattern).
      for (let attempt = 0; attempt < 6; attempt++) {
        const code = makeCode();
        const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
        const res = await stub.fetch("https://room/reserve", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ code, hostId, hostName }),
        });
        if (res.ok) return withCORS(json({ code }));
      }
      return withCORS(json({ error: "could not allocate a room code, try again" }, 503));
    }

    const m = url.pathname.match(/^\/api\/rooms\/(\d{6})\/socket$/);
    if (m) {
      if (!env.ROOMS) return new Response("rooms are not enabled on this deployment", { status: 503 });
      const stub = env.ROOMS.get(env.ROOMS.idFromName(m[1]));
      return stub.fetch(request); // 101 upgrade response passes straight through
    }

    if (url.pathname === "/api/health") {
      return withCORS(json({ ok: true, ai: !!env.AI, cache: !!env.TRANSLATIONS, rooms: !!env.ROOMS }));
    }

    return withCORS(json({ error: "not found" }, 404));
  },
};

// Plain 6-digit numeric code, e.g. "042817" - leading zeros allowed, always 6 chars.
function makeCode() {
  return String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0");
}

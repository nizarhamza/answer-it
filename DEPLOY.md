# Deploying Answer It

## What's live today

Solo mode is one static file (`index.html`) plus the banks in `bank/` — 505 curated questions
in `curated-core.js` + `curated-extra.js`, and a hand-written Arabic and French translation of
every one of them in `curated-ar.js` / `curated-fr.js` (loaded only when that language is
picked). Nothing to
build, nothing to install, no server - it fetches questions directly from
[The Trivia API](https://the-trivia-api.com/) and [Open Trivia Database](https://opentdb.com/)
in the browser (both send permissive CORS headers, confirmed live before this shipped).

There is a Worker (`worker/`) that does two things, independently: improves Arabic and French
question translation, and runs multiplayer rooms (a Durable Object per 6-digit code). Deploying
it is a separate, reversible step - see [Step 3](#step-3---the-worker-translation--rooms).
Skipping it costs you the translation upgrade and means "Play with friends" can't actually reach
a server (it fails with a readable "couldn't reach the game server" message rather than
disappearing); solo play works fully untouched either way.

---

## Try it right now, no deploy

Double-click [index.html](index.html) and play. It works from `file://` with zero setup.

---

## Step 1 - Put the repo on GitHub

This folder is a git repository (see the bottom of this file for the current status of that).

1. Create an **empty** repo at https://github.com/new - name it `answer-it`, and **don't**
   tick "Add a README" / .gitignore / license (this folder already has them; an initialised
   remote causes a push conflict).
2. Push from inside this folder:

   ```bash
   git remote add origin https://github.com/YOUR-USERNAME/answer-it.git
   git push -u origin main
   ```

If git asks for a password, use a **personal access token**
(https://github.com/settings/tokens → *Generate new token (classic)* → tick `repo`).

---

## Step 2 - Connect it to Cloudflare Pages

1. https://pages.cloudflare.com → **Ship something new** → **Connect GitHub**
2. Authorise Cloudflare and pick the `answer-it` repository.
3. Build settings:

   | Setting | Value |
   | --- | --- |
   | Production branch | `main` |
   | Framework preset | **None** |
   | Build command | *(leave empty)* |
   | Build output directory | `/` |

4. **Save and Deploy.** First build takes under a minute.
5. Live at `https://answer-it.pages.dev` (or `answer-it-xyz.pages.dev` if the name is taken).

From then on, every `git push` to `main` triggers an automatic redeploy.

---

## Skipping git entirely

Cloudflare Pages also accepts a straight upload: **Ship something new → Upload your static
files**, then drag this folder in. No version history, but it works in about ten seconds.

---

## Step 3 - the Worker: translation + rooms

One Worker, two independent features - deploy it once and both come along:

- **Translation** (optional, improves Arabic/French question quality - see below).
- **Multiplayer rooms** (`POST /api/rooms`, `GET /api/rooms/:code/socket`) - a Durable Object
  per 6-digit room code, per [ANSWER-IT.md §16](ANSWER-IT.md#16-architecture). This is what
  "Play with friends" in the menu talks to; without it, that button still opens but Create/Join
  fail with a readable error instead of reaching a server.

```bash
cd worker
npm install
npx wrangler kv namespace create TRANSLATIONS   # paste the printed id into wrangler.toml
npx wrangler deploy
```

`wrangler deploy` provisions the Durable Object binding (`ROOMS`) automatically from
`wrangler.toml` - the `new_sqlite_classes` migration is what keeps it on the **free** plan, same
as find-it-site. Then put the resulting `https://answer-it-api.<your-subdomain>.workers.dev`
into two places in `index.html`: `TRANSLATE_ENDPOINT` (near the "Tier 1" comment) and
`ROOM_API_BASE` (near the "Multiplayer rooms" comment) - both point at the same Worker. Leave
`TRANSLATE_ENDPOINT` `""` and that tier is skipped entirely, no request, no delay; rooms have no
such opt-out since the button is always visible, but a missing/unreachable `ROOM_API_BASE` just
fails Create/Join gracefully rather than breaking anything else.

To test a deployed page against a local `wrangler dev` Worker without redeploying, override
either endpoint from the browser console instead:

```js
localStorage.setItem("answerit_translate_endpoint", "http://localhost:8787")
localStorage.setItem("answerit_room_endpoint", "http://localhost:8787")
```

`GET /api/health` reports whether the AI, KV and Durable Object bindings are actually bound.

### Optional: the "My question API" source

Settings has a **Question source** toggle: *Trivia API* (default - curated bank blended with The
Trivia API, quality-gated) or *My question API* (`nizarhamza/questions-api` - replaces the whole
source, no curated bank, no gate; English, and only Science / History / Geography / Film today).

To switch the second option on, point it at that deployed Worker's origin
(`https://questions-api.<your-subdomain>.workers.dev`) in two places:

- **Solo:** `QUESTION_API_ENDPOINT` in `index.html` (near the `fetchQuestionApi` comment), or
  from the console: `localStorage.setItem("answerit_question_api_endpoint", "http://localhost:8787")`
- **Rooms:** `QUESTION_API_ENDPOINT` under `[vars]` in `worker/wrangler.toml`, then redeploy.

Left empty, the toggle still appears but a round set to "My question API" just won't build.

### What the translation tier costs

Nothing, on the free tier, with real headroom - and you cannot be surprise-billed, because the
Workers **Free** plan has no card on file: exceeding a daily allowance makes the call fail, and
a failed call falls back to MyMemory and then to English.

| | Free allowance | What a round uses |
| --- | --- | --- |
| Workers AI | 10,000 neurons/day | ~6.5 neurons per *newly seen* question (`llama-3.1-8b-instruct-fp8`) |
| KV reads | 100,000/day | ~15 per round |
| KV writes | 1,000/day | one per newly seen question - the tightest number in the stack |
| Workers | 100,000 requests/day, 10 ms CPU | one request per question; waiting on the AI binding is I/O, not CPU |

Each question is translated **once, ever, for everybody** - the KV cache is what makes the
arithmetic work. English rounds cost nothing at all. If the KV write cap ever becomes a real
constraint, move the cache into a SQLite-backed Durable Object (100,000 rows written/day free).

### What rooms cost, and their one known limitation

Also free at any plausible party-game scale: each room is one Durable Object, billed by wall
time it's actually processing a message, plus the SQLite storage it holds (a room's state is a
few KB). The part worth knowing about before a public launch: **rooms build their question round
by fetching The Trivia API / OpenTDB live when the host presses Start** - the KV question bank
described in [ANSWER-IT.md §6.2](ANSWER-IT.md#62-the-rate-limit-problem-and-the-answer) (build
order slice 4) isn't built yet. OpenTDB's shared-IP rate limit (1 request/5s) is a per-Worker
throttle here, not per-room, so two rooms starting in the same few seconds will make the second
one's top-up wait rather than fail outright - fine for a few friends, worth fixing before
advertising the game to strangers. Curated-core questions and The Trivia API (the primary
source) aren't affected.

---

## Custom domain

Pages dashboard → your project → **Custom domains** → *Set up a domain*.

---

## Notes

- Free tier covers this comfortably: no API keys, no database, no running costs for solo play,
  and no running costs for the translation Worker either (see the table above).
- Licensing: The Trivia API is CC BY-NC 4.0 (non-commercial) - see the in-app Credits screen.
  Keep Answer It non-commercial while it's the primary source (ANSWER-IT.md §23.5).
- `.gitignore` excludes OS/editor junk and `node_modules`/`.wrangler` for when the worker
  folder grows real dependencies.

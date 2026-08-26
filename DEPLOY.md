# Deploying Answer It

## What's live today

Solo mode is one static file (`index.html`) plus the banks in `bank/` — 505 curated questions
in `curated-core.js` + `curated-extra.js`, and a hand-written Arabic and French translation of
every one of them in `curated-ar.js` / `curated-fr.js` (loaded only when that language is
picked). Nothing to
build, nothing to install, no server - it fetches questions directly from
[The Trivia API](https://the-trivia-api.com/) and [Open Trivia Database](https://opentdb.com/)
in the browser (both send permissive CORS headers, confirmed live before this shipped).

There is now an **optional** Worker (`worker/`) that improves Arabic and French question
translation. Deploying it is a separate, reversible step - see
[Step 3](#step-3---optional-the-translation-worker). Skipping it costs you nothing except
translation quality on the API-sourced questions; everything else works untouched.

Multiplayer rooms still aren't built - see [PRODUCT.md](PRODUCT.md#status).

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

## Step 3 - optional: the translation Worker

Skip this and the game still works. What it changes: the ~40% of each round that comes from the
trivia APIs currently reaches Arabic and French players through MyMemory, which translates one
string at a time with no idea what the question is about - so a bare option like "Mercury",
"Bass" or "Turkey" gets whichever sense is commonest, not the right one. The Worker sends the
whole question - category, text and every option - to Workers AI in a single prompt, so the
context that disambiguates it is actually present.

The curated core doesn't need any of this: `bank/curated-ar.js` and `bank/curated-fr.js` are
hand-written and are always tier 0, deployed Worker or not.

```bash
cd worker
npm install
npx wrangler kv namespace create TRANSLATIONS   # paste the printed id into wrangler.toml
npx wrangler deploy
```

Then put the resulting `https://answer-it-api.<your-subdomain>.workers.dev` into
`TRANSLATE_ENDPOINT` near the "Tier 1" comment in `index.html`, and push. Leave it `""` and the
tier is skipped entirely - no request, no delay. To test a deployed page against a local
`wrangler dev` Worker without redeploying, set the override from the browser console instead:

```js
localStorage.setItem("answerit_translate_endpoint", "http://localhost:8787")
```

`GET /api/health` reports whether the AI and KV bindings are actually bound.

### What it costs

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

---

## Multiplayer backend - not built yet

Rooms need a Durable Object per 6-digit room code, per
[ANSWER-IT.md §16](ANSWER-IT.md#16-architecture). `worker/src/` now has `index.js`,
`wrangler.toml` and `package.json` (from Step 3), but no `room.js` or `bank.js` yet. When they
land, the pattern from
[find-it-site's DEPLOY.md](../find-it-site/DEPLOY.md#multiplayer-backend) carries over directly
(`env.ROOMS.idFromName(code)`, SQLite-backed storage for the free plan) - the commented-out
binding block is already in `wrangler.toml` waiting for it.

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

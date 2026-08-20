# Deploying Answer It

## What's live today

Solo mode is one static file (`index.html`). Nothing to build, nothing to install, no server -
it fetches questions directly from [The Trivia API](https://the-trivia-api.com/) and
[Open Trivia Database](https://opentdb.com/) in the browser (both send permissive CORS
headers, confirmed live before this shipped). Multiplayer rooms aren't built yet - see
[PRODUCT.md](PRODUCT.md#status) - so there is no Worker to deploy yet either.

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

## Multiplayer backend - not built yet

Rooms need a Cloudflare Worker + Durable Object (`worker/`), per
[ANSWER-IT.md §16](ANSWER-IT.md#16-architecture). Right now `worker/src/` holds only the two
pure logic modules (`game-core.js`, `sources.js`) - there's no `room.js`, `index.js`,
`bank.js`, `wrangler.toml`, or `package.json` yet, so there's nothing to `wrangler deploy`.
Once that lands, this section will fill in with the same steps as
[find-it-site's DEPLOY.md](../find-it-site/DEPLOY.md#multiplayer-backend) - the pattern
(one Durable Object per 6-digit room code, `env.ROOMS.idFromName(code)`, SQLite-backed storage
for the free plan) carries over directly.

---

## Custom domain

Pages dashboard → your project → **Custom domains** → *Set up a domain*.

---

## Notes

- Free tier covers this comfortably: no API keys, no database, no running costs for solo play.
- Licensing: The Trivia API is CC BY-NC 4.0 (non-commercial) - see the in-app Credits screen.
  Keep Answer It non-commercial while it's the primary source (ANSWER-IT.md §23.5).
- `.gitignore` excludes OS/editor junk and `node_modules`/`.wrangler` for when the worker
  folder grows real dependencies.

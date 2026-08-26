# Answer It

A real-time trivia game. Same shape as [Find It](../find-it-site/): a static, installable web
app for solo play, plus 6-digit rooms for racing friends - backed by one small Cloudflare
Worker with a Durable Object per room.

Where Find It asks *"can you crack the code?"*, Answer It asks *"do you know it - and how
fast?"*

## Play it

Open [index.html](index.html) - no install, no server, no account. Pick categories, a question
count, an intensity, and go. Four levels (easy/medium/hard/**hell**), streak multipliers up to
×1.5, and every round ends on **the Double** - one extra question worth ×2.

## Status

Solo mode is fully playable today, no server needed. Multiplayer rooms (lobby, teams,
spectators/big-screen, the judge panel for open-answer disputes) are built too, behind the
Worker in `worker/` - see [DEPLOY.md](DEPLOY.md) to deploy it and
[PRODUCT.md](PRODUCT.md#status) for exactly what's live versus what's still ahead (the KV
question bank is the main piece left, per [ANSWER-IT.md](ANSWER-IT.md)'s build order).

## Docs

- [ANSWER-IT.md](ANSWER-IT.md) - the full design spec: scoring, levels, question sourcing,
  wire protocol, data model, architecture, build order.
- [PRODUCT.md](PRODUCT.md) - brand/design brief.
- [DEPLOY.md](DEPLOY.md) - how to ship it.

## Stack

No build step. `index.html` is the whole client (markup, CSS, JS). `worker/src/game-core.js`
and `worker/src/sources.js` are pure, dependency-free reference modules - scoring, the level
mix, round ordering, answer matching, and trivia-source adapters - imported unchanged by
`worker/src/room.js`, the Durable Object behind multiplayer rooms. Solo mode mirrors the same
logic inline in `index.html` rather than importing across files, so the page keeps working from
a plain `file://` double-click with no server at all (the same reason Find It does this).

## Credits

Questions from [The Trivia API](https://the-trivia-api.com/) (CC BY-NC 4.0) and
[Open Trivia Database](https://opentdb.com/) (CC BY-SA 4.0). Stack, patterns and design
language borrowed wholesale from **Find It**.

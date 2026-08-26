# Answer It — Game Design & Product Spec

> A real-time trivia game. Same shape as **Find It**: a static, installable web app for
> solo play, plus 6-digit **rooms** for racing friends — backed by one small Cloudflare
> Worker with a Durable Object per room.
>
> Where Find It asks *"can you crack the code?"*, Answer It asks *"do you know it —
> and how fast?"*

**Status:** design spec, v1. Build order slice 1 (solo) and slice 2 (rooms, plus the slice-3
open-question judging and most of slice 5's feel layer) are built - see
[PRODUCT.md](PRODUCT.md#status) for exactly what's live. This document still describes the full
target design; treat it as the spec rooms were built against, not a backlog of unstarted work.
**Sibling project:** [`find-it-site`](../find-it-site/) — Answer It reuses its stack,
theming, PWA setup and multiplayer patterns.

---

## Table of contents

1. [Product](#1-product)
2. [Requirements → where they live](#2-requirements--where-they-live)
3. [Core objects](#3-core-objects)
4. [Categories](#4-categories)
5. [Levels — easy, medium, hard, hell](#5-levels--easy-medium-hard-hell)
6. [Question sourcing](#6-question-sourcing)
7. [Scoring](#7-scoring)
8. [The automatic level mix](#8-the-automatic-level-mix)
9. [The Double](#9-the-double)
10. [Answer types: with options / without options](#10-answer-types-with-options--without-options)
11. [Game modes](#11-game-modes)
12. [Teams & spectators](#12-teams--spectators)
13. [Room lifecycle](#13-room-lifecycle)
14. [Wire protocol](#14-wire-protocol)
15. [Data model](#15-data-model)
16. [Architecture](#16-architecture)
17. [Fairness, latency & anti-cheat](#17-fairness-latency--anti-cheat)
18. [Screens & UX](#18-screens--ux)
19. [Accessibility, i18n, PWA](#19-accessibility-i18n-pwa)
20. [Edge cases](#20-edge-cases)
21. [Build order](#21-build-order)
22. [Ideas parked for later](#22-ideas-parked-for-later)
23. [Open questions](#23-open-questions)

---

## 1. Product

### Users

Groups of 2–40 who want a fast, loud, replayable quiz — friends on a call, a classroom, a
team offsite, a family on the couch passing one phone around. Also a single player killing
five minutes solo. Sessions are short: pick categories, play 10–20 questions, look at the
podium, hit rematch.

### Purpose

A Kahoot-shaped trivia game that is **free, installable, needs no accounts, and works from
a link**. Success looks like: the room fills in under 30 seconds, nobody asks how scoring
works, and the last question actually changes who wins.

### Brand personality

Loud, kinetic, arcade. Answer It should feel like a game show: a countdown bar that drains,
a chunky reveal, a leaderboard that visibly re-sorts, and a `HELL` question that announces
itself with dread. Find It is a quiet puzzle toy; Answer It is its extroverted sibling.
They share the wordmark treatment, theming and colour discipline — not the tempo.

### Design principles

- **The clock is the game.** Every screen makes remaining time unmissable. If a player has
  to look for the timer, the screen is wrong.
- **Scores must be legible mid-round.** A player should always know *why* they got the
  points they got — level badge, time bar, streak pill, all visible on the reveal.
- **Nothing important is a surprise except the questions.** Level mix, the Double, and the
  streak rules are shown in the lobby before anyone commits.
- **The host is a director, not an admin.** Host controls are big and few: Start, Next,
  and (only when needed) ✓/✗.
- **Personality never costs scanability.** One-handed on mobile, readable across a room on
  a shared screen.
- **Full light/dark parity, WCAG AA in both**, and a `prefers-reduced-motion` fallback for
  every animation — same bar Find It sets.

### Anti-references

- The corporate LMS quiz: dense, grey, apologetic.
- A leaderboard that only appears at the end. The tension *is* the leaderboard moving.
- Any UI where "Start game" looks the same weight as "Choose category".

---

## 2. Requirements → where they live

| # | Your requirement | Section |
|---|---|---|
| 1 | A set of questions fixed at the start of the play/room; Kahoot-style time-based scoring | [§3](#3-core-objects), [§7](#7-scoring) |
| 2 | Questions have a category | [§4](#4-categories) |
| 3 | Questions have a level: easy / medium / hard / hell | [§5](#5-levels--easy-medium-hard-hell) |
| 4 | The % of each level is determined automatically | [§8](#8-the-automatic-level-mix) |
| 5 | There is always an extra question worth ×2 | [§9](#9-the-double) |
| 6 | Questions can have options, or not — if not, the host judges | [§10](#10-answer-types-with-options--without-options) |
| + | Streak multiplier & Hell bonus *(agreed extra)* | [§7.3](#73-streaks), [§7.4](#74-the-hell-bonus) |
| + | Teams & spectators *(agreed extra)* | [§12](#12-teams--spectators) |

---

## 3. Core objects

### Question

```jsonc
{
  "id": "622a1c397cc59eab6f950c0e",   // stable id from the source, used for de-duping
  "source": "trivia-api",             // "trivia-api" | "opentdb" | "custom"
  "text": "Which American progressive metal band released 'Scenes from a Memory'?",
  "category": "music",                // Answer It category key — see §4
  "level": "hard",                    // easy | medium | hard | hell — see §5
  "type": "choice",                   // "choice" | "open" — see §10
  "options": ["Dream Theater", "Jars of Clay", "Three 6 Mafia", "The Velvet Underground"],
  "answerIndex": 0,                   // server-only, never leaves the Durable Object
  "accepted": ["dream theater", "dt"], // server-only, for open questions (§10.2)
  "modifiers": [],                    // e.g. ["blind"], ["rush"] — Hell treatments, §5.2
  "timeLimit": 25,                    // seconds, derived from level + type + modifiers
  "media": null                       // reserved: image/audio questions, §22
}
```

### Round (a "play")

A **round** is an ordered, immutable list of `N` questions **plus one Double** (§9),
fixed the moment the host presses **Start**. It never changes mid-play: the whole room
sees identical questions, in identical order, at the same wall-clock moment.

| Setting | Values | Default |
|---|---|---|
| Question count `N` | 10 / 15 / 20 / 30 / or the user can type the number | 15 |
| Categories | any subset of §4, or **Mix** | Mix |
| Answer style | With options / Without options / Mixed | Mixed |
| Intensity | Chill / Standard / Brutal / **Adaptive** | Adaptive |
| Streaks | on / off | on |
| Teams | off / 2–6 teams | off |
| Reveal pace | Auto (5 s) / Host clicks Next | Auto |
| The Double | always on (§9) | — |

### Player

```jsonc
{
  "id": "p_8f3c…",        // permanent per-device id, like Find It — no password
  "nickname": "Nizar",
  "role": "player",        // "player" | "host" | "spectator" | "judge"
  "teamId": null,
  "score": 0,
  "streak": 0,
  "bestStreak": 0,
  "correct": 0,
  "answered": 0,
  "avgMs": 0,
  "rank": null,
  "wins": 0                // carries across rematches in the same room
}
```

---

## 4. Categories

Ten Answer It categories, each with an icon and an accent colour. They're **our** taxonomy —
the source APIs get mapped into it, so swapping a source later doesn't change the UI.

| Key | Label | Maps from The Trivia API | Maps from OpenTDB |
|---|---|---|---|
| `general` | General Knowledge | `general_knowledge` | General Knowledge |
| `science` | Science & Nature | `science` | Science & Nature, Science: Computers, Science: Mathematics, Science: Gadgets, Animals |
| `history` | History & Politics | `history`, `politics` | History, Politics |
| `geography` | Geography | `geography` | Geography |
| `music` | Music | `music` | Entertainment: Music, Entertainment: Musicals & Theatres |
| `screen` | Film & TV | `film_and_tv` | Entertainment: Film, Entertainment: Television, Entertainment: Cartoon & Animations |
| `games` | Games & Anime | — (tags: `video_games`, `board_games`) | Entertainment: Video Games, Entertainment: Board Games, Entertainment: Japanese Anime & Manga, Entertainment: Comics |
| `sport` | Sport | `sport_and_leisure` | Sports |
| `arts` | Arts & Literature | `arts_and_literature` | Entertainment: Books, Art |
| `culture` | Society & Culture | `society_and_culture`, `food_and_drink` | Mythology, Celebrities, Vehicles |

Rules:

- A room selects 1–10 categories, or **Mix** (all of them).
- With multiple categories, the round is balanced across them: each selected category gets
  `floor(N / k)` questions, remainders handed out by the same largest-remainder pass used
  for levels (§8.2), so no category is silently absent.
- Every question card shows its category chip, and the end-of-round summary shows a
  **per-category accuracy breakdown** per player ("you're 5/5 on Geography, 1/4 on Music") —
  cheap to compute, and the single most-shared screenshot in games like this.

---

## 5. Levels — easy, medium, hard, hell

### 5.1 What a level controls

| Level | Base points | Time limit (choice) | Time limit (open) | Streak gain | Colour |
|---|---|---|---|---|---|
| **Easy** | 600 | 15 s | 25 s | +1 | green |
| **Medium** | 1000 | 20 s | 30 s | +1 | blue |
| **Hard** | 1500 | 25 s | 35 s | +1 | orange |
| **Hell** | 2500 | 35 s | 45 s | **+2** | red / animated |

### 5.2 Where Hell comes from

The public trivia sources only tag three tiers — `easy`, `medium`, `hard`. So **Hell is
not just a fourth bucket we hope the API fills; it's a *treatment* applied to the hardest
material available.** A question is Hell when it is `hard` **and** at least one of:

1. **Natively niche** — The Trivia API returns an `isNiche: true` flag on obscure
   questions. `hard` + `isNiche` is the cleanest natural Hell.
2. **Promoted with a modifier** — a plain `hard` question is promoted by applying exactly
   one Hell modifier:
   - **`blind`** — the options are stripped. The question becomes an open one (§10) even in
     an options round. Knowing it isn't enough; you have to *produce* it.
   - **`rush`** — the timer is cut to 60% (21 s instead of 35 s). You know it or you don't.

The engine prefers native Hell, falls back to promotion, and never puts two Hell questions
back to back. Hell questions are announced with a full-screen interstitial ("🔥 HELL") before
the question appears, so the tension lands before the clock starts.

**Why this design:** it makes Hell independent of what any single API happens to ship, and
it makes Hell *feel* different rather than just scoring different — which is the whole point
of a fourth tier.

---

## 6. Question sourcing

### 6.1 Sources

| | [The Trivia API](https://the-trivia-api.com/) | [Open Trivia DB](https://opentdb.com/) |
|---|---|---|
| Role | **Primary** | Fallback / top-up |
| Endpoint | `GET https://the-trivia-api.com/v2/questions` | `GET https://opentdb.com/api.php` |
| Key | none for the free tier | none |
| Difficulties | `easy` / `medium` / `hard` | `easy` / `medium` / `hard` |
| Types | `text_choice` (4 options), image types on paid tiers | `multiple` (4 options), `boolean` (true/false) |
| Batch size | `limit=` (use 50) | `amount=` — **max 50 per call** |
| Categories per call | multiple, comma-separated | **one only** |
| Rate limit | not published | **1 request per 5 s per IP** |
| De-dupe | track returned `id`s ourselves | session `token` (expires after 6 h idle) |
| Extras | `isNiche`, `tags[]`, `regions[]` | — |
| Licence | CC BY-NC 4.0 — **free for non-commercial use, attribution required** | CC BY-SA 4.0 |

Both are quoted with a real response above in this project's research; the shapes are:

```jsonc
// The Trivia API v2 — array of questions
[{ "category":"music", "id":"622a…", "correctAnswer":"Dream Theater",
   "incorrectAnswers":["…","…","…"], "question":{"text":"…"},
   "tags":["music"], "type":"text_choice", "difficulty":"hard", "isNiche":false }]

// OpenTDB — envelope with a response_code
{ "response_code":0, "results":[{ "type":"multiple","difficulty":"hard",
   "category":"Geography","question":"…","correct_answer":"1848",
   "incorrect_answers":["1634","1783","1901"] }] }
```

### 6.2 The rate-limit problem, and the answer

OpenTDB allows **one request per 5 seconds per IP**, and a Cloudflare Worker's outbound
requests come from a shared Cloudflare IP pool. A busy Saturday night would have rooms
tripping each other's limit and getting `response_code: 5`.

So Answer It **never fetches per-room on demand.** Instead:

- A **Cron Trigger** on the Worker (every 15 min) tops up a **KV question bank** — a few
  thousand questions keyed `bank:{category}:{level}`, each entry storing the normalised
  question plus its `sourceId` for de-duping.
- Building a round is then a **KV read**, not a network call: instant, no rate limit, works
  even when both APIs are down.
- If the bank is thin for a requested slice, the Worker fetches live as a fallback, behind a
  single global token bucket (1 call / 6 s for OpenTDB, generous for The Trivia API) with
  exponential backoff on `response_code: 5`.
- A `seen:{roomCode}` set prevents repeats inside a room across rematches; the bank itself
  rotates so the same 20 questions don't haunt every game.

**Solo mode is different:** with no room to protect, the browser fetches directly from the
API, exactly the way Find It fetches words from Datamuse. No backend needed for solo play —
that keeps the "open `index.html` and it works" property Find It has today.

### 6.3 Normalisation

Every source question passes through one `normalise()` before it touches the game:

1. **Decode entities.** OpenTDB returns HTML-encoded text by default — request
   `encode=url3986` and `decodeURIComponent`, or decode `&quot;` / `&#039;` / `&amp;`
   explicitly. Getting this wrong is the single most visible bug in every OpenTDB clone.
2. **Trim.** Sources ship stray trailing spaces in answers (see the Tatsuro Yamashita
   example above: `"Lucky Lady Feel So Good "`). Trim before comparing anything, ever.
3. **Map the category** via §4.
4. **Assign the level** via §5.2.
5. **Build `accepted[]`** for open play (§10.2).
6. **Reject** questions that are: over 180 characters, missing a category we map,
   or whose correct answer is under 2 characters (unanswerable blind).
7. **Shuffle options** and record `answerIndex`.

### 6.4 Attribution

The Trivia API is CC BY-NC — commercial use needs their paid plan. Answer It is free and
non-commercial, so it qualifies, but the credit is not optional: an **About / Credits**
line in the menu and footer naming both sources with links, plus the licence names. Put it
in before launch, not after.


### 6.5 The quality gate and the curated core

The first playtest failed on question *quality*, not question *supply*: the open APIs skew
obscure, dry and Anglo-American. They are now treated as a volume source only.

- **`bank/curated-core.js`** + **`bank/curated-extra.js`** — 505 hand-written questions (235 in
  the first file, 270 in the second) covering all 10 categories and all three source levels,
  written for a general adult crowd and deliberately spread beyond the US/UK (78% non-Western).
  Both files concat onto the same global; the split is only there to keep diffs reviewable. The
  pool is seeded from them *before* any fetch, so a round is playable with no network at all.
  Every question also has a hand-written Arabic and French translation in `bank/curated-ar.js`
  and `bank/curated-fr.js` (§ translation chain).
- **`worker/src/quality.js`** — `gradeQuestion()` runs on everything an API returns. Hard
  rejects: paper-quiz phrasing, domestic-league/soap material, blocked tags, coin-flip year
  options, duplicate options, answer leaks, unwieldy answers, niche below `hard`. Survivors get
  a 0-100 score; buckets are sorted best-first and `MIN_BANK_SCORE` (66) is the floor for
  entering the KV bank. Measured live: ~32% of a Trivia API batch is rejected.
- **The mix is ~60% curated / 40% filtered filler** (`DEFAULT_CURATED_SHARE`). Not 100% curated:
  that would trade "obscure" for "the same questions every night" - though at 505 curated
  questions, roughly 16-19 per (category, level) bucket, that is now a much longer night.

Full write-up, the reject table, and the house rules for writing new questions: **QUESTIONS.md**.

---

## 7. Scoring

Kahoot-shaped: **being right matters, being right *fast* matters more, and being right
*repeatedly* matters most.**

### 7.1 The formula

```
timeFactor = 1 − 0.5 × (responseTime / timeLimit)        // clamped to [0.5, 1]
raw        = basePoints(level) × timeFactor
points     = round( raw × streakMultiplier × doubleMultiplier )

wrong answer, or no answer  →  0 points, streak resets to 0
```

Answer instantly → full base points. Answer at the last possible tick → exactly **half**.
There is no negative scoring: being wrong costs you the points and the streak, never your
existing score. (Punishing a wrong answer with a deduction makes late-game players stop
guessing, which kills the last two minutes of every quiz.)

### 7.2 What that pays out

| Level | instant | 25% of clock | 50% | 75% | last tick | wrong |
|---|---|---|---|---|---|---|
| Easy | **600** | 525 | 450 | 375 | 300 | 0 |
| Medium | **1000** | 875 | 750 | 625 | 500 | 0 |
| Hard | **1500** | 1312 | 1125 | 938 | 750 | 0 |
| Hell | **2500** | 2188 | 1875 | 1562 | 1250 | 0 |

### 7.3 Streaks

Consecutive **correct** answers build a combo. The multiplier applies to the question that
extends the streak, so the pay-off is immediate rather than banked.

| Streak | 0 | 1 | 2 | 3 | 4 | 5 | 6+ |
|---|---|---|---|---|---|---|---|
| Multiplier | ×1.0 | ×1.0 | ×1.1 | ×1.2 | ×1.3 | ×1.4 | **×1.5 (cap)** |

- A wrong answer, a timeout, or a host `✗` verdict resets the streak to **0**.
- The streak pill is always on screen and animates when it steps up — a player two answers
  from ×1.5 should feel it.
- Streaks can be turned off in the lobby for a pure speed game.

### 7.4 The Hell bonus

Hell questions are the streak accelerator, and the risk:

- A correct Hell answer advances the streak by **+2** instead of +1 — one Hell question can
  jump you from ×1.1 to ×1.3.
- A wrong Hell answer resets the streak like any other. High base points, high exposure.
- **Hell Insurance** *(lobby toggle, default off)*: if you're on a streak of 3+ and miss a
  Hell question, your streak drops to 1 instead of 0. Gentler for classrooms; turn it off
  for a real fight.

### 7.5 Worked numbers

- **Theoretical maximum for one question:** Hell + instant + ×1.5 streak + Double =
  `2500 × 1.0 × 1.5 × 2` = **7 500**.
- **A perfect 20-question Standard round** (8 easy / 7 medium / 4 hard / 1 hell), every
  answer instant, streak building throughout, plus a Hell Double: **36 750**.
- **The same perfect run answered at half the clock every time:** **27 564** — a 25% penalty
  for hesitating. That gap is the game.

### 7.6 Ties

Ranked by, in order: score → total correct → lowest average response time → longest best
streak → alphabetical. Ties are broken silently; the podium never shows a shared place.

---

## 8. The automatic level mix

> Requirement 4: *the % of each level is determined automatically.*

Nobody sets sliders. The room picks an **intensity feel**, and the engine computes exact
counts.

### 8.1 The base profiles

| Intensity | easy | medium | hard | hell |
|---|---|---|---|---|
| Chill | 55% | 30% | 12% | 3% |
| **Standard** *(the reference profile `P₀`)* | **40%** | **35%** | **20%** | **5%** |
| Brutal | 20% | 30% | 35% | 15% |
| **Adaptive** *(default)* | starts at Standard, then moves — §8.3 | | | |

### 8.2 Turning percentages into counts

Percentages rarely divide evenly into 15 questions, so allocation uses **largest remainder**
with two guarantees:

```
raw[L]   = N × profile[L]
count[L] = floor(raw[L])
leftover = N − Σ count[L]
→ hand the leftover out to the levels with the biggest fractional part,
  breaking ties in favour of the HARDER level
→ then, for N ≥ 8, guarantee at least one of every level
  (take from the largest bucket if a level came out empty)
```

That tie-break rule matters: without it `N=30` at Standard lands on **one** Hell question
(3%) instead of two, because `medium` and `hell` both have a `.5` remainder and `medium` is
bigger. Favouring the harder level fixes it.

Verified output:

| N | easy | medium | hard | hell | actual % |
|---|---|---|---|---|---|
| 10 | 4 | 3 | 2 | 1 | 40 / 30 / 20 / 10 |
| 12 | 5 | 4 | 2 | 1 | 42 / 33 / 17 / 8 |
| 15 | 6 | 5 | 3 | 1 | 40 / 33 / 20 / 7 |
| 20 | 8 | 7 | 4 | 1 | 40 / 35 / 20 / 5 |
| 25 | 10 | 9 | 5 | 1 | 40 / 36 / 20 / 4 |
| 30 | 12 | 10 | 6 | 2 | 40 / 33 / 20 / 7 |

The lobby shows this as a live mix bar — four coloured segments with counts — so the room
sees the shape of the fight before it starts.

### 8.3 Adaptive mode

In Adaptive (the default), the profile re-computes after every question from the **room's
rolling accuracy `A`** over the last 5 questions, and the *remaining* questions are
re-allocated. Already-served questions are never changed.

```
s = clamp((A − 0.60) × 0.8, −0.35, +0.35)

s > 0  (room is crushing it)  → move weight easy→hard/hell  (70/30 split)
s < 0  (room is drowning)     → move weight hard/hell→easy/medium (60/40 split)

then clamp each level to its floor/ceiling and renormalise to 1.0
```

Floors and ceilings stop it running off the rails — **there is always at least one Hell
question, no matter how badly the room is doing**:

| | easy | medium | hard | hell |
|---|---|---|---|---|
| floor | 15% | 20% | **10%** | **3%** |
| ceiling | 55% | 45% | 40% | 15% |

Verified behaviour at `N = 20`:

| Rolling accuracy `A` | resulting profile | counts (e/m/h/hell) |
|---|---|---|
| 0.00–0.20 | 47 / 40 / 10 / 3 | 9 / 8 / 2 / 1 |
| 0.40 | 47 / 40 / 10 / 3 | 9 / 8 / 2 / 1 |
| 0.60 *(neutral)* | 40 / 35 / 20 / 5 | 8 / 7 / 4 / 1 |
| 0.80 | 30 / 29 / 31 / 10 | 6 / 6 / 6 / 2 |
| 1.00 | 21 / 23 / 41 / 15 | 4 / 5 / 8 / 3 |

When the mix shifts, the room is told — a one-line toast on the reveal screen:
*"Too easy? Turning it up."* / *"Easing off."* Adaptive difficulty that hides itself feels
like a broken game; adaptive difficulty that taunts you is a feature.

### 8.4 Ordering

Counts don't determine sequence. The round is laid out as a ramp:

- Question 1 is **always easy** — nobody should be knocked off a streak before they've built one.
- The round is split into thirds; Hell questions are placed in the final third, Hard mostly
  in the middle and final thirds.
- No two Hell questions adjacent; no more than three of the same level in a row.
- Categories are interleaved so the same category never runs three questions deep.
- The **Double** is always last (§9).

---

## 9. The Double

> Requirement 5: *there is always an additional question with ×2 of his score.*

**The Double** is an extra question appended after question `N` — so a "15-question round"
actually serves 16. It is:

- **Always present.** Every round, every mode, no toggle.
- **Worth ×2**, applied on top of the level base and the streak multiplier. A Hell Double
  answered instantly on a maxed streak is 7 500 points.
- **One tier above the round's hardest served level**, capped at Hell. A Standard round
  ends on a Hell Double; a Chill round that only reached Hard ends on a Hell Double too —
  the finale is always the top of what the round has been building toward.
- **Announced.** A full-screen card: `THE DOUBLE — ×2` with the current top three still
  visible behind it, so everyone understands the swing before the clock starts.
- **A real comeback window.** With N=15 Standard, the leader is typically around 12–14k;
  the Double alone is up to 7.5k. Second place is nearly always live going into it, and
  fourth place occasionally is. That's deliberate — a quiz where the last question can't
  change the podium has effectively ended five questions early.

Post-Double, the podium reveals **bottom-to-top** with the score deltas from the Double
shown as they land.

---

## 10. Answer types: with options / without options

> Requirement 6: *the answer can only have options or without options (if without options
> the host of the play chooses who's right or not).*

A room picks **With options**, **Without options**, or **Mixed** (roughly 70/30, with every
Hell `blind` modifier forcing an open question regardless).

### 10.1 With options (`type: "choice"`)

- 4 options, or 2 for true/false questions.
- Kahoot-style: each option gets a **shape + colour**, so a host reading from a shared
  screen can say "the triangle" and everyone knows what they mean.
- Options are shuffled **once per room** by default, so shape references are shared across
  the room. A lobby toggle switches to **per-player shuffle** for strict play (kills the
  "it's the blue one!" shout across the table).
- Tapping locks the answer immediately. No changing it — the timestamp *is* the score.
- After lock, the reveal shows the correct option and a bar chart of how the room split.

### 10.2 Without options (`type: "open"`) — auto-check first, host only on disputes

This is the interesting one, and the flow you chose. **The host is a referee, not a data-entry
clerk.**

**Step 1 — players type.** Free-text input, autocomplete and spellcheck disabled. Submitting
freezes that player's response time immediately. Judging happens later and costs nobody any
points; the clock stopped when they hit send.

**Step 2 — the server auto-checks.** Both the submitted answer and every accepted answer go
through the same normaliser:

```
lowercase
→ strip diacritics (NFD, drop combining marks: "béziers" → "beziers")
→ strip punctuation and symbols
→ collapse whitespace
→ drop leading articles: "the ", "a ", "an ", "le ", "la ", "l'"
→ trim
```

Then, in order:

| Test | Verdict |
|---|---|
| Exact match after normalisation | ✅ correct |
| Matches an entry in `accepted[]` (aliases) | ✅ correct |
| Levenshtein distance ≤ `ceil(len / 6)` | ✅ correct — tolerates typos ("dreem theater", "wisconsen") |
| Numeric answers: numerically equal (`1848` = `1,848` = `one thousand eight hundred forty-eight` via a small number parser) | ✅ correct |
| Distance ≤ `ceil(len / 3)` **or** the submission contains the answer as a whole-word substring | ⚠️ **dispute** — goes to the host |
| Everything else | ❌ wrong |
| Empty / no submission | ❌ wrong, never disputed |

`accepted[]` is built at normalisation time (§6.3) from: the correct answer itself, its form
without a leading article, its form without any parenthetical, and a small hand-maintained
alias table for the answers that come up constantly (country names, "USA/United States",
"UK/Britain", well-known abbreviations).

**Step 3 — the host rules on what's left.** When the timer ends, the host gets a compact
**Judge panel**: only the disputed answers, one row each, with the correct answer pinned at
the top and big ✓/✗ buttons. Typical load is 0–3 rows out of 20 players. The host can also
open **"show all"** to overturn an auto-verdict either way — the host is always the final
word, including against the server.

While judging, players see *"⚖️ Host is checking answers…"* with their own submission echoed
back. Auto-approved players see their result immediately; only the disputed ones wait.

**Step 4 — reveal.** Correct answer, the room's answers rendered as a word cloud (the funny
wrong ones are half the fun), and score deltas.

**Judge-only host:** if the host has no interest in playing, the lobby has a **"I'll host,
not play"** toggle — the host becomes a spectator with judging powers, sees the correct
answer on every question, and is excluded from the leaderboard. In a room with no such host
(e.g. solo, or an all-players room), disputed answers auto-resolve as **correct** — err
generous — and the room is told that's what happened.

### 10.3 Where open questions come from

The public APIs only ship multiple-choice. Answer It **derives** open questions by taking a
choice question and discarding the options. That works because these sources always give a
single canonical `correctAnswer` string. Questions whose answer is under 2 characters, or is
a bare "true"/"false", are filtered out of the open pool at normalisation time (§6.3) — you
cannot meaningfully type-in a true/false answer.

---

## 11. Game modes

### Solo

No backend, no room. Pick categories, count and intensity; questions come straight from the
API in the browser (the Find It / Datamuse pattern). Full scoring, streaks and the Double
apply, with a **personal best** per category stored locally. Open questions in solo auto-judge
with disputes resolved generously (no host exists).

### Room (race) — the default multiplayer

The Find It multiplayer flow, extended:

1. Pick a nickname → you get a permanent per-device player id. No password.
2. **Create a room** and share the 6-digit code, or **join** with one.
3. The host configures the round in the lobby; everyone sees the settings and the live
   level-mix bar update.
4. Host presses **Start race**. Everyone gets the same question at the same moment.
5. After every question: reveal → leaderboard → next.
6. After the Double: podium, per-category breakdown, and **Rematch** in the same room with
   a fresh question set (never repeating a question already served — §6.2).

### Rematch

Same room, same code, same players, scores reset — `wins` carries over as the room's running
tally, exactly like Find It. Settings can be changed by the host between rounds.

---

## 12. Teams & spectators

### Teams

- 2–6 teams, on/off in the lobby. Named by colour by default (Red, Blue, Green, Amber,
  Purple, Teal), renameable by the host.
- Assignment: **auto-balance** (round-robin as players join) or **pick your own**. The host
  can drag a player between teams in the lobby; locked once the round starts.
- **Team score = sum of member scores.** Individual scores are still tracked and shown —
  a player wants to know they personally carried.
- **Team sync bonus:** if *every* member of a team answers a question correctly, the team
  gets **+10%** on that question's combined points. Encourages the strong players to
  actually help the weak ones instead of racing them.
- Leaderboards toggle between **team view** (default in team mode) and **player view**.
- Late joiners are auto-assigned to the smallest team.

### Spectators

- Anyone can join a room as a spectator, including **after the round has started** — this is
  the main thing Find It can't do today, and it's what makes Answer It work on a projector.
- A spectator sees: the question, the countdown, the reveal, and the leaderboard. They cannot
  answer and never appear in the standings.
- Two useful shapes:
  - **Big-screen mode** — a spectator view designed for a TV or projector: huge question
    type, huge countdown, the room's answer distribution, no input controls. This is *the*
    classroom/party setup: the shared screen is a spectator, the phones are players.
  - **Judge-host** — the host as spectator-with-powers, per §10.2.
- A player who joins mid-round is a spectator until the next round, then auto-promoted to
  player (with a "join next round" chip in the lobby strip so they know).

---

## 13. Room lifecycle

```
        create                start              N+1 questions           rematch
  ─────────────►  lobby  ──────────────►  playing  ──────────────►  finished  ────┐
                    ▲                        │                          │        │
                    │                        │ per-question loop:       │        │
                    │                  ┌─────▼──────┐                   │        │
                    │                  │  question  │ clock running     │        │
                    │                  └─────┬──────┘                   │        │
                    │                        ▼                          │        │
                    │                  ┌────────────┐                   │        │
                    │                  │   locked   │ all in, or time up│        │
                    │                  └─────┬──────┘                   │        │
                    │                        ▼                          │        │
                    │                  ┌────────────┐                   │        │
                    │                  │  judging   │ open Qs only      │        │
                    │                  └─────┬──────┘                   │        │
                    │                        ▼                          │        │
                    │                  ┌────────────┐                   │        │
                    │                  │   reveal   │ → next question   │        │
                    │                  └────────────┘                   │        │
                    └───────────────────────────────────────────────────────────┘
```

| State | Meaning |
|---|---|
| `lobby` | Players joining, host configuring. Question set not built yet. |
| `playing/question` | A question is live. Clock running, answers accepted. |
| `playing/locked` | Everyone answered, or the timer expired. No more answers. |
| `playing/judging` | Open question with disputes; host is ruling. Skipped otherwise. |
| `playing/reveal` | Correct answer + deltas + leaderboard. Auto-advances after 5 s, or the host clicks Next. |
| `finished` | Podium. Host can rematch. |

Rooms auto-expire after **2 hours** of inactivity (the Find It `ROOM_TTL_MS` alarm pattern).
A question **auto-locks** the moment every active player has answered — no waiting out a
35-second clock when the room is already done.

---

## 14. Wire protocol

WebSocket, JSON messages, one socket per player, tagged with the player id — the Find It
Durable Object hibernation pattern, unchanged.

### Client → server

| Type | Payload | Who |
|---|---|---|
| `configure` | `{ n, categories[], style, intensity, teams, streaks, hellInsurance, revealPace }` | host, lobby only |
| `team` | `{ teamId }` | any player, lobby only |
| `role` | `{ role: "player" \| "spectator" }` | self |
| `start` | — | host |
| `answer` | `{ qIndex, value }` — `value` is an option index or a string | player |
| `judge` | `{ qIndex, verdicts: { playerId: true \| false } }` | host |
| `next` | `{ qIndex }` | host |
| `rematch` | — | host |
| `kick` | `{ playerId }` | host |
| `leave` | — | any |
| `ping` | `{ t }` | any — clock-offset handshake, §17 |

### Server → client

| Type | Payload |
|---|---|
| `state` | Full room snapshot: status, settings, players (score, streak, rank, team), hostId, qIndex, mix bar |
| `question` | `{ qIndex, total, text, category, level, type, options?, modifiers, startAt, endsAt, isDouble }` — **never** the answer |
| `answered` | `{ playerId }` — "N of M are in", no content |
| `lock` | `{ qIndex, reason: "timeout" \| "all-in" }` |
| `judging` | to the host: `{ qIndex, correctAnswer, disputes: [{playerId, nickname, text, distance}], auto: [...] }` |
| `reveal` | `{ qIndex, correctAnswer, distribution, results: [{playerId, correct, ms, points, streak, total}] }` |
| `mixShift` | `{ direction: "up" \| "down", profile }` — the adaptive-mode toast |
| `final` | `{ podium, perCategory, awards }` |
| `error` | `{ code, message }` |
| `pong` | `{ t, serverNow }` |

**Invariant:** `correctAnswer` and `answerIndex` exist only inside the Durable Object until
the question locks. The client cannot know the answer early because it was never sent — the
same guarantee Find It makes about its secret. The one exception is the judge-host, who
receives it (they need it to referee) and is excluded from scoring.

---

## 15. Data model

Durable Object storage, one object per 6-digit room code (`env.ROOMS.idFromName(code)`):

```jsonc
{
  "code": "042817",
  "status": "playing",            // lobby | playing | finished
  "phase": "question",            // question | locked | judging | reveal
  "hostId": "p_8f3c…",
  "judgeOnlyHost": false,
  "createdAt": 1755600000000,
  "settings": {
    "n": 15, "categories": ["science","music"], "style": "mixed",
    "intensity": "adaptive", "streaks": true, "hellInsurance": false,
    "teams": 0, "revealPace": "auto"
  },
  "mix": { "easy": 6, "medium": 5, "hard": 3, "hell": 1 },
  "questions": [ /* Question objects incl. answerIndex/accepted — never broadcast */ ],
  "qIndex": 4,
  "startAt": 1755600120000,       // wall-clock start of the current question
  "endsAt":  1755600145000,
  "answers": {                    // per question index, cleared on advance
    "4": { "p_8f3c…": { "value": 2, "ms": 3120, "verdict": "correct", "auto": true } }
  },
  "rolling": [true,true,false,true,true],  // last 5 room-level outcomes → adaptive A
  "players": {
    "p_8f3c…": { "id":"p_8f3c…","nickname":"Nizar","role":"player","teamId":null,
                 "score":8450,"streak":3,"bestStreak":4,"correct":4,"answered":5,
                 "avgMs":4210,"rank":1,"wins":2,
                 "byCategory":{"science":{"c":3,"n":3},"music":{"c":1,"n":2}} }
  },
  "teams": {},
  "seenQuestionIds": ["622a…","6482…"]   // survives rematches within the room
}
```

Storage notes: keep `questions` in a **separate storage key** from the hot room state so the
frequent `put("room", …)` on every answer doesn't rewrite the whole question set. Same for
`answers`, keyed per question index.

---

## 16. Architecture

**Separate site, same stack as Find It.** New folder `answer-it-site/`, deployed independently.

```
answer-it-site/
├── index.html                 # the whole client: markup, CSS, JS. No build step.
├── manifest.webmanifest       # PWA
├── sw.js                      # offline shell
├── icons/                     # 192, 512, maskable, apple-touch
├── PRODUCT.md                 # brand/design brief (Find It has one)
├── ANSWER-IT.md               # this document
├── DEPLOY.md
└── worker/
    ├── wrangler.toml          # DO binding "ROOMS" + KV binding "BANK" + cron trigger
    └── src/
        ├── index.js           # HTTP routes + WS upgrade pass-through
        ├── room.js            # Durable Object: one room
        ├── game-core.js       # scoring, level mix, ordering, answer matching
        ├── sources.js         # trivia API adapters + normalisation
        └── bank.js            # KV question bank + cron top-up
```

`game-core.js` is deliberately pure and dependency-free — the same functions run in the
Worker (multiplayer, authoritative) and in the browser (solo). Find It does exactly this with
its `score()` / `randomSecret()`; keep the property, it's what makes solo and multiplayer feel
identical.

**Hosting:** Cloudflare Pages for the static site (framework preset *None*, no build command,
output `/`), Cloudflare Worker for the API. Durable Objects use the SQLite-backed class
(`new_sqlite_classes`) so it runs on the **free plan**, same as Find It.

**HTTP routes:**

| Route | Purpose |
|---|---|
| `POST /api/rooms` | Create a room → `{ code }` |
| `GET /api/rooms/:code/socket` | WebSocket upgrade, passed straight to the DO |
| `GET /api/questions` | Solo-mode / fallback question fetch from the bank |
| `GET /api/health` | Bank depth per category/level — useful when the cron silently dies |

Lock `ALLOWED_ORIGIN` to the Pages URL before launch. Find It currently ships `"*"`; don't
copy that bit.

---

## 17. Fairness, latency & anti-cheat

The whole game is a stopwatch, so this section is load-bearing.

- **The server is the clock.** `responseTime` is measured in the Durable Object as
  `receivedAt − startAt`, clamped to `[0, timeLimit]`. Client-reported timings are ignored
  entirely — they're trivially forged.
- **Clock-offset handshake.** On connect, the client sends `ping{t}` a few times; the server
  replies `pong{t, serverNow}`. The client keeps the *minimum-RTT* sample to estimate the
  offset, and renders the countdown against `endsAt` in server time. This keeps every
  player's visible countdown in sync even with wildly different clock settings.
- **RTT compensation.** Optionally subtract `min(rtt/2, 150 ms)` from the measured response
  time so a player on a slow connection isn't systematically taxed. Cap the credit so it
  can't be gamed by faking a slow link.
- **The answer never travels early.** `answerIndex` / `correctAnswer` / `accepted[]` stay in
  the DO until lock. Nothing in DevTools reveals them.
- **One answer per player per question**, first submission wins, later ones dropped silently.
- **Grace window.** Answers arriving up to 300 ms after `endsAt` are accepted at the
  worst-case time factor (0.5×) rather than rejected — a network hiccup shouldn't read as a
  wrong answer.
- **Reconnects.** A dropped player keeps their id, score and streak (Find It already keeps
  players in the room on disconnect); on reconnect they get a `state` snapshot and rejoin the
  current question if it's still open.
- **Host disconnect.** Host role passes to the longest-present player, exactly as Find It
  reassigns on leave. A round in progress continues on its auto-advance timer regardless, so
  a host losing signal never freezes the room.
- **Searching is the real cheat**, and no client-side trick prevents it. What actually works
  is the design: short timers, streaks that reward instinct, and Hell `rush` modifiers. A
  player who Googles loses the streak race even when they're right. Say so in the rules
  rather than pretending to enforce it.

---

## 18. Screens & UX

| Screen | Contents |
|---|---|
| **Menu** | Play solo · Create room · Join with code · Big-screen mode · How to play · Credits · ☾/☀ |
| **Lobby** | Room code (huge, tappable to copy + QR), player list with team chips, settings panel, **live level-mix bar**, rules summary ("15 + the Double · Mixed answers · streaks on"), Start (primary, unmissable) |
| **Question** | Countdown bar draining left→right, level badge, category chip, question text sized to fit, then either 4 shape/colour option buttons or a text field + Send. Streak pill top-right. "12 of 20 answered" ticker. |
| **Hell interstitial** | 1.5 s full-bleed red card: 🔥 **HELL** · level base points · any modifier ("BLIND — no options" / "RUSH — 21s") |
| **Judge panel** *(host)* | Correct answer pinned. Dispute rows: nickname · their text · ✓ / ✗. "Show all N answers" expander. "Done" button. |
| **Reveal** | Correct answer big. Distribution bars (choice) or answer word-cloud (open). Your result: ✓/✗ · time · points · streak step. Top 5 leaderboard animating into its new order. |
| **The Double** | Full-screen `THE DOUBLE ×2` card with the current top 3 behind it, then the question. |
| **Podium** | Bottom-to-top reveal, confetti for first (Find It already has a confetti canvas — reuse it), per-category accuracy breakdown, **awards** (§22), Rematch · Change settings · Leave. |
| **Big-screen** | Question + countdown + answered-count + leaderboard only. No inputs. Designed to be read from 4 metres. |

Motion: everything above has a `@media (prefers-reduced-motion: reduce)` path that swaps
animation for an instant state change — the bar and the leaderboard jump instead of easing.

---

## 19. Accessibility, i18n, PWA

- **WCAG AA contrast in both themes.** Option buttons carry a **shape as well as a colour**
  (triangle / diamond / circle / square), so colour-blind players are never guessing —
  this is exactly why Kahoot uses shapes and it's worth copying.
- **Keyboard:** `1`–`4` select options, `Enter` submits, `Esc` dismisses the reveal,
  `Space` advances (host). Same key-language as Find It.
- **Screen readers:** the countdown is an `aria-live="off"` region (announcing every tick is
  torture) with announcements only at 10 s, 5 s and lock; the reveal is `aria-live="polite"`.
- **Timer accommodations:** an **Extended time** room toggle (×1.5 on every limit) that
  scales the time factor to match, so nobody is scored differently for using it.
- **Language:** the trivia sources are **English-only**, so v1 ships English questions. The
  *interface* can still be localised, and Find It's RTL groundwork means an Arabic UI is
  cheap — but be honest in the UI about the question language rather than half-translating.
- **PWA:** manifest + service worker, installable, portrait-primary, offline shell. Solo mode
  can cache a small offline pack of questions in IndexedDB so the app is playable on a plane.

---

## 20. Edge cases

| Situation | Behaviour |
|---|---|
| Bank has too few questions for the requested category/level slice | Fill from the next-nearest level, tell the host in the lobby ("only 6 Hard available in Music — topping up from Medium"), never silently shorten the round |
| Both APIs down and the bank is empty | Room creation fails with a readable message, same as Find It's dictionary failure path. Never invent questions. |
| Everyone gets a question wrong | Reveal says so ("nobody got this one"), no points, all streaks reset, adaptive mix eases off |
| Every player leaves mid-round | Room hits `finished`, storage cleared by the 2 h alarm |
| Host leaves | Longest-present player becomes host; if the leaver was a judge-only host, remaining disputes auto-resolve as correct |
| A player joins mid-round | Spectator now, auto-promoted to player at the next round, starts at 0 |
| Duplicate nickname | Allowed, suffixed in the UI (`Nizar (2)`) — ids are what matter |
| Host never presses Next with `revealPace: "host"` | Reveal auto-advances after 60 s regardless, so an AFK host can't hang the room |
| Open question, no judge-host, disputes present | Auto-resolve **correct**, room is told |
| Answer arrives 250 ms after `endsAt` | Accepted at 0.5× time factor (grace window) |
| Two players tie exactly on score and correct count | Broken by average response time → best streak → alphabetical (§7.6) |

---

## 21. Build order

Ship it in slices that are each independently playable.

1. **Solo, options only.** Static `index.html`, direct API fetch, `game-core.js` scoring,
   4 levels, auto mix, the Double. This alone is a complete game.
2. **Rooms.** Worker + Durable Object, lobby, synchronised questions, live leaderboard,
   rematch. Port Find It's `index.js` / `room.js` almost verbatim — the room, player and
   hibernation logic barely changes.
3. **Open questions.** Text input, normaliser + Levenshtein auto-check, judge panel,
   judge-only host.
4. **The bank.** KV + cron top-up, de-dupe, health route. (Do this before any public launch —
   the OpenTDB rate limit will bite the moment two rooms run at once.)
5. **Streaks, Hell modifiers, adaptive mix.** The feel layer.
6. **Teams, spectators, big-screen mode.**
7. **PWA, offline pack, per-category stats, awards.**

---

## 22. Ideas parked for later

Suggestions worth having on the record, none of them v1:

- **Wager round.** Before the Double, each player secretly bets a slice of their score.
  (You didn't pick it, but it's a one-evening feature that pairs beautifully with the
  Double if you ever want more drama.)
- **Lifelines** — 50/50, freeze-my-timer, steal-from-the-leader. One per player per round.
- **Awards on the podium** — *Fastest Finger* (best average time), *Ice Cold* (longest
  streak), *Against All Odds* (only person to get a Hell right), *Specialist* (100% in one
  category). Cheap to compute from data already tracked, and they give non-winners something
  to screenshot.
- **Media questions** — image and audio rounds. The `media` field is already in the Question
  shape; The Trivia API has image questions on paid tiers, and audio could come from
  self-hosted clips.
- **Host-authored packs** — paste a CSV/JSON of your own questions for a birthday quiz or a
  classroom test. The Question shape and `source: "custom"` already accommodate it.
- **Async rooms** — a code that stays open 24 h and everyone plays the same set whenever they
  can, leaderboard fills up over the day. Good for remote teams.
- **Cross-game hub** — if Answer It works, folding it and Find It into one shell with shared
  player ids, one PWA and one Worker is the natural v2.
- **Per-question review after the podium** — scroll back through all 16, see what you missed.
  The single most-requested feature in every quiz app.

---

## 23. Open questions

Things to decide before or during build:

1. **Room size cap.** A Durable Object broadcast to 200 sockets on every answer is a lot of
   traffic. Suggest capping rooms at 50 players, or throttling `answered` broadcasts to a
   counter update every 250 ms.
2. **Question count vs. attention.** 30 questions plus reveals is roughly 15 minutes. Worth
   testing whether 30 should exist at all, or whether 20 is the real ceiling.
3. **Does the judge-host play?** Currently a toggle. Simpler to force judge-hosts out of the
   standings always — worth deciding from real play.
4. **CORS from the browser.** Solo mode fetches the trivia APIs directly; confirm both send
   permissive CORS headers before committing to the backend-free solo path (Find It's
   Datamuse dependency proves the pattern works, but these are different services). Fallback
   is routing solo through `/api/questions`, which is one line of client code.
5. **Commercial use.** The Trivia API's CC BY-NC licence means Answer It must stay
   non-commercial while it's the primary source. Fine today; a blocker the day there's a
   paid tier.

---

## Credits

Questions from [The Trivia API](https://the-trivia-api.com/) (CC BY-NC 4.0) and
[Open Trivia Database](https://opentdb.com/) (CC BY-SA 4.0).
Stack, patterns and design language borrowed wholesale from **Find It**.

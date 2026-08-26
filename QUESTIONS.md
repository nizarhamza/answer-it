# Where Answer It's questions come from

**Short version:** the public APIs stopped being the question source and became the *filler*.
A hand-written curated bank now carries the round, and anything an API sends has to pass a
quality gate before it can be served.

---

## 1. Why this changed

The first playtest failed on the questions, in four specific ways:

| Complaint | What it actually was |
|---|---|
| Too obscure | `Which film contains the character 'Carl Spackler'?` — deep cuts nobody in the room can play |
| Too US/UK-centric | US state capitals, NFL teams, British soaps, one-hit wonders from 1974 |
| Boring | `In which year did the Vietnam war begin?` — guess-a-year and guess-a-number filler |
| Repetitive | one pool, no de-dupe across phrasings, small effective sample |

None of that is fixable by fetching *more*. The Trivia API and OpenTDB are open, crowd-submitted
sets: they are a good **volume** source and a poor **quality** source. So they were demoted.

## 2. The policy

```
round = 60% curated core  +  40% API filler that survived the gate
```

- **Curated core** — `bank/curated-core.js` (235) plus `bank/curated-extra.js` (270): 505
  hand-written questions across all 10 categories, every level, every one written to be
  answerable by a general adult crowd. 78% of them are not US/UK material. This is the part that
  decides whether a game is fun. The two files concat onto the same global, so the split is
  purely about keeping diffs readable - add to either.
- **API filler** — everything else, but only after `gradeQuestion()` in `worker/src/quality.js`
  says yes. It also carries a score, and buckets are sorted best-first so the weakest survivors
  are only ever reached if a bucket runs dry.
- **The 60/40 split is deliberate, in both directions.** Leaning harder on curated would just
  swap "obscure questions" for "the same questions every night". Note the split is a preference,
  not a rule: when one side has no questions left that this player has not already seen and the
  other does, `pickQualityIndex()` takes the fresh side regardless (see the repetition notes in
  `index.html`). A fresh API question beats a curated repeat.

Bonus property: a round is now playable with **zero network**. The curated bank is loaded from
disk before the first fetch, so if both APIs are down or rate-limited the game still starts.

## 3. What the gate does

`gradeQuestion(q, { allowNiche })` → `{ ok, reason, score }`.

**Hard rejects** (never served):

| Reason | Example caught |
|---|---|
| `meta-phrasing` | `Which of the following…`, `all of the above`, `The king crab walks ______` |
| `parochial` | NFL / MLB / NASCAR / Super Bowl, `which US state…`, EastEnders, Coronation Street |
| `blocked-tag` | tags `us_states`, `american_football`, `horse_racing`, `gambling`, `one_hit_wonders` |
| `deep-cut-tag` | `warhammer`, `world_of_warcraft`, `cult_films` — Hell material at best |
| `coin-flip-year` | four years within 3 of each other: pure guessing |
| `ambiguous-options` | the same answer listed twice |
| `answer-leak` | the answer appears verbatim in the question |
| `stale-scoped` | `as of 2016…` — questions that rot |
| `answer-unwieldy` | a 90-character answer nobody can read in 15 seconds |
| `niche-outside-hell` | `isNiche` questions below `hard` |

**Score penalties** (served, but sorted last): country-specific tags −14, decade tags
(`1980's`) −14, `Title Cased Questions Like This` −18 (reliably the sloppiest submissions),
`contains the character 'X'` −14, long quoted titles −8, period references in the text −10,
negations (`not`, `except`) −10, year/roman-numeral answers −12, parentheticals −8,
guess-a-number options −10 to −20.

Measured on a live 50-question batch from The Trivia API: **32% rejected**, and what got cut was
exactly the material above. OpenTDB behaves similarly.

`MIN_BANK_SCORE = 66` is the floor for entering the **KV bank**. Solo play deliberately does not
apply it — solo has no bank to fall back on, so a weak-but-valid question is kept and simply
sorted to the bottom.

## 4. Adding questions

Open `bank/curated-core.js` or `bank/curated-extra.js` and add a row to any block. Compact keys
keep the files small — they ship to every player:

```js
{ c:"history", l:"medium", t:"Nigeria gained independence from Britain in which year?",
  a:"1960", w:["1957","1963","1948"], r:"africa", o:true },
```

| Key | Meaning |
|---|---|
| `c` | category key (§4) |
| `l` | `easy` / `medium` / `hard` — never `hell`, Hell is a treatment (§5.2) |
| `t` | question text, ends in `?`, under 180 chars |
| `a` | the correct answer |
| `w` | exactly three wrong options, all plausible, none a near-copy of another |
| `n` | `true` = niche → eligible for native Hell |
| `r` | region flavour: `africa` `asia` `latam` `mena` `europe` `na` `global` |
| `o` | `true` = also works as an open (typed) question: short, one spelling |

House rules for writing them:

1. **Would a smart person who isn't a trivia nerd have a shot?** If no, it isn't a question, it's
   a fact. Facts belong in Hell or nowhere.
2. **Wrong options must be tempting.** Three obviously-wrong options is a free point.
3. **No guess-the-year unless the year is famous.** 1945 is fine. 1957 vs 1963 is not.
4. **Spread the world around.** Aim to keep the non-US/UK share above ~70%.
5. **Say it out loud.** If it doesn't work read aloud in a noisy room, rewrite it.

Then run the checks:

```
node check.mjs     # schema, duplicate answers, option collisions, gate pass, region spread
```

Every curated row must pass the same gate the APIs face — that's the point of the check.

## 5. Where things live

| File | Role |
|---|---|
| `bank/curated-core.js`, `bank/curated-extra.js` | the questions. Classic `<script>`s that concat onto `globalThis.ANSWER_IT_CURATED`, so they work over `file://` **and** as side-effect imports in the Worker |
| `bank/curated-ar.js`, `bank/curated-fr.js` | hand-written Arabic and French for every curated question, keyed by the exact English question text. Lazy-loaded only when that language is picked |
| `worker/src/quality.js` | the gate, de-dupe, curated normaliser, and `mixPool()` |
| `index.html` | mirrors the gate inline (same hand-sync rule as the game core) and seeds its solo pool from the curated bank before fetching |

Keep the inline mirror in `index.html` in sync with `worker/src/quality.js` by hand, exactly as
`game-core.js` is mirrored today.

## 6. If it still isn't enough

In rough order of payoff:

1. **Write more curated questions.** 505 is a season; ~1,000 would be a year. The format is
   deliberately trivial to append to. A new row needs a matching entry in `bank/curated-ar.js`
   and `bank/curated-fr.js` — `node check.mjs` reports any that are missing.
2. **Themed packs** — a Naija pack, an Afrobeats pack, a football pack — selectable at room
   setup. Same row format, one file each.
3. **Let hosts add questions** to their own room. The best party trivia is local.
4. **Drop OpenTDB** if it keeps under-performing the gate; The Trivia API's tags make it far
   easier to filter well.

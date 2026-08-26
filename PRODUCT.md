# Product

## Register

product

## Users

Groups of 2–40 who want a fast, loud, replayable quiz - friends on a call, a classroom, a
team offsite, a family on the couch passing one phone around. Also a single player killing
five minutes solo. Sessions are short: pick categories, play 10–20 questions, look at the
podium, hit rematch.

## Product Purpose

A Kahoot-shaped trivia game that is free, installable, needs no accounts, and works from a
link. Success looks like: the room fills in under 30 seconds, nobody asks how scoring works,
and the last question actually changes who wins.

## Brand Personality

Loud, kinetic, arcade. Answer It should feel like a game show: a countdown bar that drains, a
chunky reveal, a leaderboard that visibly re-sorts, and a HELL question that announces itself
with dread. Find It is a quiet puzzle toy; Answer It is its extroverted sibling. They share the
wordmark treatment, theming and colour discipline - not the tempo.

## Anti-references

- The corporate LMS quiz: dense, grey, apologetic.
- A leaderboard that only appears at the end. The tension *is* the leaderboard moving.
- Any UI where "Start game" looks the same weight as "Choose category".

## Design Principles

- **The clock is the game.** Every screen makes remaining time unmissable. If a player has to
  look for the timer, the screen is wrong.
- **Scores must be legible mid-round.** A player should always know *why* they got the points
  they got - level badge, time bar, streak pill, all visible on the reveal.
- **Nothing important is a surprise except the questions.** Level mix, the Double, and the
  streak rules are shown before anyone commits.
- **The host is a director, not an admin.** Host controls are big and few (multiplayer, once
  built): Start, Next, and (only when needed) ✓/✗.
- **Personality never costs scanability.** One-handed on mobile, readable across a room on a
  shared screen.
- **Full light/dark parity, WCAG AA in both**, and a `prefers-reduced-motion` fallback for
  every animation - same bar Find It sets.

## Accessibility & Inclusion

WCAG AA contrast in both themes. Option buttons carry a shape as well as a colour (triangle /
diamond / circle / square) so colour-blind players are never guessing. Keyboard controls: `1`–`4`
select options, `Enter`/`Space` advance, `Esc` dismisses the reveal or a modal. The countdown
announces itself to screen readers only at 10s, 5s and lock - not every tick. An **Extended
time** toggle scales every clock ×1.5 and scores fairly on the same curve, so nobody is
penalised for using it. Any motion has a `prefers-reduced-motion: reduce` fallback that swaps
animation for an instant state change.

**Interface language:** English, French and Arabic, picked from the menu screen or detected
from the browser on first visit. Arabic runs fully right-to-left (layout mirrors via flexbox
row-reversal plus a handful of direction-aware overrides; the back/next nav icons flip to point
the correct way). Both trivia sources only ship English content, so on a French/Arabic
interface each question's text and options are additionally machine-translated live
(MyMemory, cached, falls back to English on any failure) rather than left untranslated -
imperfect for proper nouns, which the setup screen says plainly rather than pretending
otherwise. Scoring is unaffected either way: a choice question's correctness is its option's
array position, which translation never touches, and open-answer matching accepts either the
translated or the original English form.

## Status

**v1 shipped:** solo mode is a complete, standalone game - build order slice 1 from
[ANSWER-IT.md](ANSWER-IT.md#21-build-order), plus solo-appropriate parts of slice 3 (open
questions auto-judge in solo since there's no host to referee). Categories, levels, the
automatic mix (including Adaptive), streaks, the Hell treatment and its modifiers, the Double,
per-category stats, personal bests and awards are all live and playable today by opening
[index.html](index.html) - no server required.

**Rooms shipped:** multiplayer rooms (slice 2) are live - `worker/src/room.js` (one Durable
Object per 6-digit code) plus `worker/src/bank.js` (round building) run the same
`game-core.js`/`quality.js` the solo build already had. Lobby, synced choice + open questions,
live leaderboard, the judge panel for open-answer disputes (judge-only-host toggle), teams with
the sync bonus, spectators/big-screen mode, and rematch are all playable once the Worker in
`worker/` is deployed - see [DEPLOY.md](DEPLOY.md). Solo play needs no server either way.

**Not yet built:** the KV question bank + cron top-up (slice 4 - rooms currently fetch live on
Start, same rate-limit caveat as solo, see ANSWER-IT.md §23.1), awards/per-question review on
the room podium (parked, §22), and PWA packaging - manifest/service worker/icons (slice 7,
solo already has these).

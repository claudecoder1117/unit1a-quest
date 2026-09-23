# notes/cut-integrate-r4.md — THE INTEGRATOR, after round 4

Authority `designs/CUT-BRIEF.md`; `BUILD-POLICY.md` wins. Files changed by this pass:
`site/js/screens/job.js` (one line + its block), `site/data/job.js` (one string),
`site/version.js` (the release bump), `qa/audit-states.mjs` (two states + one helper),
`qa/cut-integrator.mjs` (new, dev-only), `tests/job-screen.test.mjs` (one test added),
`tests/job-pay.test.mjs` / `tests/cut-meta.test.mjs` (the changed string), `designs/CUT-SPEC.md` §6.

No test was deleted, skipped or weakened. No `git` command was run.

## The state I was handed

`node --test tests/` was **already green** — 1,860 tests, 1,856 pass, 0 fail, 4 skipped (the four
pre-existing Playwright-gated arms in `fix5-run.test.mjs`, unchanged since `notes/DEMOLISH.md`).

`node qa/layout-audit.mjs --only job,run,home --engine both` was **not**: **16 BLOCKERs**, one class,
`unreached` on `job-facedown` and `job-streak` in both engines and both themes.

## 1 · The 16 blockers were one contradiction, and it was in the app, not only the catalog

Both states declare the root `.job-screen[data-phase="call"] .job-face-down` and both reach it from
`jobStart`, i.e. from a COLD session. Driven in chromium (`qa/cut-integrator.mjs` §1), a cold
session's first paint is:

```
phase=answer  card=·  calls=0/0  bank=absent  | 0 pile  ×1 streak  pays 8
```

There is no face-down card at all. That is round 4's `pay.js decides` working as designed: at an
empty pile one call is offered, nothing can be lost on it and bank has nothing to take, so
`renderCall` locks the only call (`ms: 0`) and the question arrives — the dead tap, cut. The two
states were describing a screen the build no longer has ("two greyed at an empty pile" is a card
that cannot exist), so they measured nothing and would have gone on measuring nothing.

**But fixing the catalog alone would have papered over a real disagreement.** Two round-4 lanes
landed opposite answers to *does a question with nothing to bid on get a card?* in the same round:

| the question | before this pass |
|---|---|
| normal, empty pile (engine lane, `decides`) | **no card** — the question arrives |
| a repeat, empty pile (screen lane, `bidlessBeat`) | **a card**, three dead calls, dead bank, `BANK_MS` |

Measured on the shipped build (`qa/cut-integrator.mjs` §4 before the fix):

```
the bidless card   phase=call  card=Y  calls=0/3  bank=greyed  | Today 0 pile ×1 streak Pairs in a Figure  not sure pretty sure sure bank
```

A card with **nothing live on it at all**, held for 1.4 s. That is the one shape that reads as
broken rather than as a beat.

### The fix is one rule, and the predicate was already written

`pay.js decides` defines itself as *"more than one call is offered, **or there is a pile to bank**"* —
which is precisely *is any control on this card live* — and over the reachable space it is exactly
`pile > 0`. `render()` now asks it too:

```js
if (bidless !== 2 && state.isBidless(s) && decides(gv.pile, gv.streak)) return bidlessBeat();
```

One line. Nothing was added: a repeat **carrying a pile** keeps its card, its skill name, its beat
and its live BANK — the control `notes/cut-screen.md` round 4 findings 4 and 7 exist for
(`qa/cut-integrator.mjs` §4b: `pile 22 ×1, card=Y, calls=0/3, bank=live, gameTaps=0`). What is gone
is only the card that had nothing on it. It is subtractive, it removes a special case rather than
adding one, and it costs the answering half ~1.4 s less per empty-pile repeat.

No hang is possible on the new path: a repeat is sealed with `call = { id: null }`, so `isObj(gv.call)`
is true and `render()` falls through to `renderAnswer()`, which mounts the question.

### Tests

`tests/job-screen.test.mjs` — one test added, *"the card is drawn exactly when a control on it is
live — one rule, both branches"*. It pins `decides(p, m) === (p > 0)` over the whole reachable space,
pins that at an empty pile **neither** kind of card has a live control, and lints that both branches
ask `decides` before drawing.

**Negative controls**, run against mutated copies in a scratch tree (never the live repo):

| # | mutation | result |
|---|---|---|
| N1 | the bidless branch stops asking `decides(` (the state I was handed) | **caught** |
| N2 | `renderCall` stops asking `!decides(` (the dead tap returns) | **caught** |

### The catalog

`qa/audit-states.mjs` gained `jobToCard()` — it plays the real loop until the **engine's own pile**
says a biddable card is up, then confirms the card in the DOM *with at least one live call* (a
repeat's card and a bank receipt both carry three greyed ones and would otherwise pass for one).
`job-facedown` now measures the first card the student actually decides on; `job-streak` asks for
×3 and falls back to any card with a pile rather than `break`ing out of its own loop on the first
paint. Both now throw a named error instead of reporting `unreached` if the fixture ever stops
reaching a card.

## 2 · `COPY.settings.greyed` — the MAJOR no lane owned the file for

`notes/cut-screen.md` round 4, finding 5, requested of `site/data/job.js`. Landed as requested:

    'a call the pile cannot cover is greyed out'  →  'you can only pick one your pile can pay for'

"call" is a noun no student-visible surface uses (the buttons say `not sure` / `pretty sure` /
`sure`) and "cover" is the finance sense of "afford": two words to teach, in the one line that
exists to explain a greyed button, against CUT-BRIEF's "no word a 14-year-old would have to be
taught". `designs/CUT-SPEC.md` §6 changed with it (**1,197 words**, still under 1,200; the
replacement is the same nine words). Both pins — `tests/job-pay.test.mjs` VOCAB and
`tests/cut-meta.test.mjs` — moved with it.

It stays silent about the other reason a call is greyed (a repeat, where the pile is not the
reason). That is the screen lane's own stated trade and I did not widen it: a second clause is a
second thing to teach.

## 3 · The release bump

`site/version.js` `2026-09-22a` → **`2026-09-23a`**. The cache is `packet-${APP_VERSION}` and every
file of the cut landed on the 23rd; without the bump a returning student keeps the pre-cut cache
(`notes/cut-save.md` round 4, Request 3). `node qa/gen-precache.mjs --check` → **up to date,
122 files**.

## 4 · The two counts, re-measured in a real chromium session

`node qa/cut-integrator.mjs` — 390 × 844, the shipped build, saves seeded with `job/state.js`'s own
verbs. **Migrate the fixture before seeding it**: `qa/fixtures/audit/midweek.json` is a **v1** save
and `store.js`'s 2 → 3 migration *deletes* `inProgress.game`, so a v1 save seeded with the game
verbs is thrown away on load and the browser measures a different session than the one you built.
`qa/cut-engine-r4.mjs` has the same latent trap.

**NUMBERS ON SCREEN — worst paint during play: 3.** The game's own surfaces, with the study
question's subtree removed (its numerals are the study layer's and are identical on `#/run/page`).
Digit-runs in visible text; an `aria-label` is read aloud, not drawn, so it counts as none.

| paint | numbers |
|---|---|
| the face-down card | **2** — `8 pile · ×2 streak · [ten marks]` |
| the flip, and the question | **3** — `8 pile · ×2 streak · pays 16` |
| the widest the engine can reach | **3** — `496 pile · ×5 streak · pays 50` |
| a repeat (the game prices it at nothing) | **2** — the third slot is empty |
| the bank receipt | **1** — `today 24 points` |
| the end panel (after play) | 3 — `today 160 points · best 160 · 17 %` |

**TAPS PER QUESTION — 2, and never more.** One game tap (the call) plus the study card's own Submit.
The question itself carries **zero** game controls (`foot` is empty at `phase=answer`), so the game
cannot charge a second one. Bank is a third control, drawn on the card, `required: false` in every
phase — CUT-BRIEF allows exactly that. A question with nothing to bid on costs **0** game taps.

## Where it finished

```
cd /Users/oliver/Projects/unit1a-quest && node --test tests/
  → 1,861 tests, 1,857 pass, 0 fail, 4 skipped          (the 4 are the pre-existing browser arms)

node qa/layout-audit.mjs --only job,run,home --engine both
  → LAYOUT AUDIT — 0 findings (136 waived) in 368s
  → verdict: 0 blockers, 0 majors → PASS                 (was 16 blockers)

node qa/gen-precache.mjs --check  → up to date, 122 files
designs/CUT-SPEC.md               → 1,197 words
```

The 136 waived are the same 136 as before this pass — nothing was added to
`qa/audit-allow.json` and nothing was waived to make the run pass.

## Open — none of it mine to close, all of it measured

1. **The measured split is 17 %** against CUT-BRIEF's 45–55 % (the end panel printed
   `17 % of this session was the game`). `CUT-SPEC.md` §8 closes this as **CUT-BRIEF's owner's**
   decision — the band or the queue must give — and the number printed is honest, which was the
   round-4 blocker. Nothing in this pass tunes toward it. My §1 fix moves it very slightly *up*
   (it removes 1.4 s of answering time per empty-pile repeat).
2. **`today 160 points · best 160`** — the collision `notes/cut-save.md` round 4 finding 1.2 names,
   reproduced on the end panel. Its Request 1 (`best` = the biggest pile banked in one tap) moves a
   contract four suites assert and belongs to CUT-BRIEF's owner plus the machine lane in one move.
3. **The session is 17 questions** on `midweek.json` against the brief's 8–12 (`notes/cut-home.md`
   R3, unchanged).
4. **`notes/cut-home.md` R11 is still open** — `bankPile` scores any session, so `#/run/job` typed
   by hand still farms `game.today`. Home no longer points there; the score is still ungated.
5. **`tests/_helpers.mjs:167`** still documents `SAVE_BUDGET_KB`, the rating, the elo pair, the
   press and the crew in a 60-line block above `WIDE_DOUBLE`. Dead documentation in a test helper,
   not code, and `tests/job-save.test.mjs:754` already fails if the constant returns under `site/`.
   Left, and named.
6. **`site/data/skills.js`** — `Factoring a = 1` / `Factoring a > 1` still carry digits and
   `FACE_NAMES` in `screens/job.js` is still the stopgap that keeps them off the card
   (`notes/cut-screen.md`, standing since round 2).

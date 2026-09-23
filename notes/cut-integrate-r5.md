# notes/cut-integrate-r5.md — THE INTEGRATOR, after round 5

Authority `designs/CUT-BRIEF.md`; `BUILD-POLICY.md` wins. **No file under `site/` was changed by this
pass** — the two commands were already green and clean when I arrived, and nothing I found needed a
line of app code. What changed is one measurement harness, two documents and three test files:

| file | what |
|---|---|
| `qa/cut-integrator-r5.mjs` | **new**, dev-only. One real session in chromium, sampled every 40 ms. |
| `qa/fix5-run-measure.mjs` | `--kbitem auto` — the stale composer ordinal that had silenced a test. |
| `tests/fix5-run.test.mjs` | that arm now asks for `auto`, with the reading written down. |
| `tests/job-pay.test.mjs` | **+3 tests**: why an empty pile draws no card, and what it costs a session. |
| `tests/_helpers.mjs` | the deleted layer's price list, cut (`notes/cut-save.md` Requests 4, standing since r4). |
| `designs/CUT-SPEC.md` | four sentences that did not match the shipped build. **1,199 words**, cap 1,200. |

No test was deleted, skipped or weakened. No `git` command was run.

---

## 1 · The state I was handed — both acceptance commands already passed

```
node --test tests/                                   1,881 tests · 1,877 pass · 0 fail · 4 skipped
node qa/layout-audit.mjs --only job,run,home --engine both
                                                     0 findings (136 waived) in 369 s → PASS
```

The 136 waived are round 4's 136, unchanged; nothing was added to `qa/audit-allow.json` by anyone
this round. After my changes: **1,884 tests · 1,880 pass · 0 fail · 4 skipped**, and the audit
re-run below.

**The 4 skips are not inert, and one of them was red.** They are `fix5-run.test.mjs`'s
`FIX5_RUN_BROWSER=1` arms. Run with the flag set, 3 of 4 pass and one fails — see §3.

## 2 · The two counts, re-measured in a real chromium session

Two independent probes, because round 5 put four beats BETWEEN paints (the settle's two halves, the
loss hold, the withdrawn third slot, the bank receipt) and a per-state probe can no longer see the
worst frame.

**`node qa/cut-integrator.mjs`** (round 4's, one paint per seeded state, 390 × 844) — reproduces
round 4 exactly on the round-5 build: worst paint **3**, game taps **1** + the study card's Submit.

**`node qa/cut-integrator-r5.mjs`** (new: one session, played by clicking, 40 ms sampler, 390 × 844,
44 distinct frames). Every digit-run visible on screen, attributed to the layer that drew it —
`layerOf` is `qa/ship-sessions.mjs`'s, copied verbatim.

### NUMBERS ON SCREEN — **3**, and never 4 (CUT-BRIEF limit 3)

| the frame | the game's own | the app shell |
|---|---|---|
| a bidless question (`0 pile · ×1 streak · pays 8`) | **3** | 0 |
| the face-down card (`8 pile · ×2 streak · [marks]`) | **2** | 0 |
| the flip, and the question after it (`8 · ×2 · pays 18`) | **3** | 0 |
| the widest the engine reaches (`496 · ×5 · pays 50`) | **3** | 0 |
| after a hint or a retry — the payout withdraws (`8 · ×2 · —`) | **2** | 0 |
| the bank receipt (`today 8 points`) | **1** | 0 |
| the abandoned-bid settle, held (`8 · ×2 · pays 16`) → settled (`4 · ×1`) | **3 → 2** | 0 |
| a repeat the game will not price | **2** | 0 |

`qa/ship-sessions.mjs` agrees over three more sessions: *beats where the GAME printed more than 3
numerals during play: 0*, and **0 of 6 header read-outs** are on screen during a session (the run
lane's `HDR_JOB_HIDE`).

**The convention, stated so it can be argued with.** The limit is measured on the GAME's surfaces. A
geometry stem has numerals in it and the grader prints `+19 XP`; both are there byte-identically on
`#/run/page` with the game switched off, so they are the study layer's and are reported beside the
game's rather than hidden (up to 20 study numerals on a graded card). The one place the app shell's
own numbers come back is `phase=over` — **after** play: the end panel reads 3 game + 4 shell.

### TAPS PER QUESTION — **2**, and the game charges exactly one of them (limit 2)

Measured as clicks actually issued, by owner, over twelve questions:

```
q 2  game 1 [call:not sure]          study 0
q 5  game 1 [bank]                   study 4 [Hint, Submit, Submit, Continue]
q 8  game 1 [call:not sure]          study 3 [Submit, Submit, Continue]
q11  game 1 [call:not sure]          study 2 [Submit, Continue]
q12  game 1 [call:sure]              study 2 [Submit, Continue]
```

* the game's own worst question: **1** — the call. `requiredTapsOf()` is 0 in every other phase and
  the question itself carries no game control.
* **+ the study card's own Submit = 2**, which is CUT-BRIEF's "the call, then the answer".
* Continue is COMPOSED's, on both routes, and is not the game's to charge. Bank is the third
  control: always available, never required (it appears above as one tap, on a card, by choice).
* A question the game will not price costs **0** game taps.

## 3 · What I resolved, at the root

### 3.1 The empty pile is not a build decision — it is CUT-BRIEF's own arithmetic

`notes/cut-screen.md` round 5 finding 3 is the one finding no round has closed: **the first of the
brief's two surviving ideas — "you bid on yourself before you see the question" — is absent from
question 1 of every session, and from a large share of the rest.** It was filed to `job/pay.js` +
`job/state.js` with a proposed remedy (open the session with the pile at `BASE_PAY`).

I did not take the remedy, and `tests/job-pay.test.mjs` now says why in a form that can fail:

> CUT-BRIEF math #8 — *losses come only from the unbanked pile and it floors at zero* — makes every
> call **free** at an empty pile. A free call is worth `q · pay`, maximised by the biggest `pay` at
> every rate. So if all three were offered there, one call would be optimal everywhere and CUT-BRIEF
> math #2 (*each call uniquely optimal on a non-empty band*) would be false. **At an empty pile the
> brief's first idea and the brief's own math cannot both hold, and the build keeps the math.**

It is not an argument from the shipped numbers: it holds for any table whose pays differ, which they
must, or the three calls are one call.

**The size of it, exact forward distribution over the shipped table, no sampling** (twelve
questions, honest calling, pinned to a tenth of a point at both ends):

| | never banks | banks by §4 |
|---|---|---|
| q = 0.35 | 30.8 % | **49.4 %** |
| q = 0.99 | 8.5 % | 8.5 % |

`8.5 %` is the floor because question 1 is always one of them — one twelfth. **This reproduces
`notes/cut-screen.md`'s independently measured 8.5 %–49.4 % to the digit**, from the other side
(their screen walk, my DP over `decides`/`offered`/`payOf`/`costOf`).

**Negative controls**, on a scratch mirror of the repo (the working tree is never patched):

| # | mutation | result |
|---|---|---|
| N1 | `decides = () => true` (draw the card anyway) | **caught** — 3 new tests fail |
| N2 | the offer gate relaxed to all three calls at every pile | **caught** — the 3 new tests fail **and so does CUT-SPEC §7 #1, "honest calling wins"**, which is the theorem arriving in the suite |

N2 is the important one: the obvious fix for the missing bid is the one that breaks the brief's math.
The other remedy on the table — seeding the pile at `BASE_PAY` — I also declined: a seeded pile is
points no question earned, bankable on the first tap of every session, so `game.today` and
`player.best` could be farmed by opening sessions and banking. That is the shape of thing the
deleted layer died of.

**`designs/CUT-SPEC.md` §1 now says it** (it previously described a card before every question):
*"An empty pile can lose nothing, so it draws no card: that question arrives paying 8 — question 1
always, 8.5–49.4 % of a session."*

**ESCALATION — CUT-BRIEF's owner, not a code patch.** The brief promises a bid before every
question and demands math that makes one impossible on an empty pile. One of the two gives. The
build cannot choose for it, and neither can this pass; §5 states the choice.

### 3.2 Three sentences in CUT-SPEC that the build does not do

All three were standing requests from `notes/cut-screen.md` round 5 that the spec lane's round did
not reach (it spent its round on §8). Each was verified against the shipped code before the edit.

1. **§3 said the streak is moved by "nothing else".** False twice over: `screens/job.js
   settleAbandonedBid` charges a standing bid as a miss and writes `streak: 1`, and `store.js
   reconcileGameDay` banks the closing day's pile and writes `live.streak = 1` at midnight. §3 now
   names both. This is the rule a student is most likely to meet and the one the spec denied.
2. **§5 listed two states for the third slot**, and round 5 gave it a third: with a call standing and
   the question no longer earnable (a hint, a retry), the payout withdraws and the slot goes empty.
   §5 now lists it. Measured in the browser: `8 pile · ×2 streak · pays 18` → `8 pile · ×2 streak · —`
   on the hint.
3. **§8 promised the measured share "moves to Settings beside the bands"** — a round-4 decision no
   round took, still printing on the end panel two rounds later. Resolved the way CUT-BRIEF describes
   it (*"the app measures its own split and prints the measured number"*): the panel's third line is
   where it ships, and the promise is gone.

`wc -w designs/CUT-SPEC.md` = **1,199** (cap 1,200). The 26 words were paid for by lossless trims,
named in the diff: §2's "the one floored division keeps prices whole" (§2 already opens with *Whole
points only*), §5's `hitLineOf` mechanism (the claim stays, the implementation detail is in the
code), §8's duplicated "printed once after play". **No pinned figure and no student-visible string
was touched**, and `grep -niE "bar|stake|ruler" designs/CUT-SPEC.md` is still empty
(`tests/job-screen.test.mjs:1088`).

### 3.3 A browser-gated test that had stopped having a subject

`tests/fix5-run.test.mjs` pins `--kbitem 13` — Today's Page item 13. **The cut deleted
`js/gen/asn-reason.js`, every ordinal after it moved, and item 13 is now a widget with no `<input>`**,
so behind its env gate the arm reported *"pick an item that types"* instead of a geometry. A pin on
the composer is a promise the composer is not making: `qa/fix5-run-measure.mjs` now takes
`--kbitem auto` and asks Today's Page for its first item that types (item 10 of 15 today).

**Read the reading, not the name.** With `auto` the arm fails on a real measurement, and it is
honest about what it measures: the harness shrinks the WINDOW, while an OS keyboard shrinks only the
VISUAL viewport, so `data-kb` is `closed` in every arm of that file **including the one that passes**.
What it actually measures is "at 375 × 380, with the field focused before the shrink, is it still on
screen", and on Today's Page it is not — the field lands 174 px below the fold. Focusing while
already short scrolls it back to 198 px, so `widgets/base.js keepVisible` works; what it does not
hear is an inset that arrives after its 220 ms timer. **This is a study-layer reading on a Page item,
outside the cut, and a real phone's browser scrolls a focused field itself** — which is why nobody
has seen it. Filed, not papered over, and not fixed by this pass: `screens/card.js` is COMPOSED's.

### 3.4 The deleted layer's price list, deleted

`tests/_helpers.mjs` still carried `WIDE_DOUBLE`, `WIDE_4DP`, `WIDE_SIGNED_DOUBLE`, `WIDEST_W`,
`WIDEST_Q` and ~40 lines pricing a rating, an Elo pair, a press window, a 68-tag Fault Index, a crew
and `SAVE_BUDGET_KB`. **No test imported one of them** (`grep -rl` over `tests/ qa/ site/`), every
mechanic they price is deleted, and the brief's line about code kept because it might come back is
the reason this layer needed cutting. Gone. `WIDEST_SKILL` stays — `worstCaseJobQueue` (the STUDY
layer's worst case, used by `state.test.mjs`) writes it on every row. `state.test.mjs` and
`job-save.test.mjs`: 106 pass, 0 fail.

## 4 · What I did NOT do, and why

* **`tests/job-ledger.test.mjs` — the run lane's round-5 Request 1** (give `runFlatScreen` a
  `resumeAt` and prove the resumed `startedAt` in the Law's own file). **Declined, deliberately.**
  The claim in its docstring is TRUE and is proved with two negative controls in
  `tests/cut-run.test.mjs` §7 (*a five-hour break cannot move the row: one page, two sittings, either
  door*). Taking it here means building a two-sitting flat runner the file does not have, inside the
  one file that must never become vacuous, at integration time. The coverage exists; only its address
  is elsewhere, and that is written down here and in `notes/cut-run.md`.
* **`screens/card.js`'s hint line** (`notes/cut-screen.md` round 5, finding 2's second half): the
  card says hints *"cost XP quality, never an attempt"*, which is true of XP and false of the pile —
  one hint withdraws the whole payout. The string is the study layer's; editing it changes COMPOSED
  behaviour with the game switched off, which `settings.game = false` forbids, and CUT-SPEC §6
  forbids the game adding a string of its own. **Both halves of the trade are now at least written
  down** (§5 of the spec says the slot withdraws). It needs CUT-BRIEF's owner to allow one of the
  two, or it stays.
* **Nothing was tuned toward the split.** Every lever is forbidden or re-inflation; see §5.
* **No mechanic, number, tap, word, collection, rank, tag or knob was added anywhere.**

## 5 · Open — all measured, none of it closable from inside the build

1. **THE BID IS MISSING FROM 8.5 %–49.4 % OF THE SESSION, AND FROM QUESTION 1 ALWAYS** (§3.1). The
   brief's idea 1 against the brief's math #2 and #8. Pinned in `tests/job-pay.test.mjs`, stated in
   CUT-SPEC §1. **CUT-BRIEF's owner chooses**: amend "you bid on yourself before you see the
   question" to say that the first question of a session (and the one after every bank or wipe)
   earns the pile the rest is played with — or amend math #8, which is what makes a bid mean
   anything at all.
2. **The measured split.** Unchanged and untouched this round: `job-split`'s four declared clocks
   read 3, 9, 14, 21 %; round 5's own session printed 34 %; the ceiling CUT-BRIEF's two-tap limit
   allows is 55 % at COMPOSED's fastest card, 48 % and 23 % at the ends of the brief's own session
   shape. The app prints the number it measures and claims nothing. **The band or the queue gives;
   that is the owner's call** (CUT-SPEC §8).
3. **One browser-gated arm is red under `FIX5_RUN_BROWSER=1`** (§3.3) — a study-layer Page geometry,
   with a harness that cannot open a keyboard. The other three pass.
4. **`site/data/skills.js`** — `Factoring a = 1` / `a > 1` still carry digits, and `FACE_NAMES` in
   `screens/job.js` is still the stopgap that keeps them off the card. Standing since round 2, and
   `tests/job-screen.test.mjs` fails on the next digit-bearing name that has no entry, which is where
   that argument belongs.
5. **`notes/cut-home.md` R11** — `bankPile` scores any session, so `#/run/job` typed by hand still
   adds to `game.today`. Home does not point there; the score is still ungated. Unchanged.
6. **`store.js`'s two named races** (`game.today` stale on Home while a bid stands; the midnight
   timer being best-effort) — `notes/cut-save.md` round 5 Open issues, unchanged, both bounded.

## 6 · Where it finished

```
cd /Users/oliver/Projects/unit1a-quest && node --test tests/
  → 1,884 tests · 1,880 pass · 0 fail · 4 skipped          (the 4 are the browser-gated arms)

node qa/layout-audit.mjs --only job,run,home --engine both
  → LAYOUT AUDIT — 0 findings (136 waived) → PASS          (the same 136; nothing was waived by me)

node qa/gen-precache.mjs --check   → up to date, 122 files
site/version.js                    → 2026-09-23a           (r4's bump; no site/ file changed since)
wc -w designs/CUT-SPEC.md          → 1,199                 (cap 1,200)
ROUTE_PATTERNS                     → 13
numbers on screen during play      → 3      (limit 3)
taps per question                  → 2      (limit 2; the game charges 1)
```

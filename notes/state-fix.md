# notes/state-fix.md — FIXER lane `state`, round 1

Owner: `site/js/job/state.js` + `tests/job-state-r1.test.mjs`. Nothing else was edited.
Authority: `COMPOSED-GAME.md` (G1, G2, G7, G12), overridden by `BUILD-POLICY.md`.

---

## 1. BLOCKER — Backchecks never minted (the only consumable had no source)

`mintBackcheck` (state.js) and `index.mint` (job/index.js) both had **zero call sites** in `site/js`.
The only writer of `backchecks.held` was `plan.payCleanGetaway`, gated on the one-time Night Before
stamp, so a save could hold at most **one Backcheck in its lifetime**.

**Fix (root).** Added `mintForJob(save, g, {day, now, cracked})`, called from `endJob` — the one
function every job ends through. It takes both of G2's sources:

* **vault** — `cracked === true && g.bc === 0` ("1 per vault cracked with no Backcheck spent").
* **dues** — measured, not claimed:
  * `cleared` = the distinct **review / rematch** targets in this job's queue that ended
    `done` with `result.cleared === true`;
  * `open` = `schedule.dueList(save, {now, today: day})` **minus sweep pseudo-dues**;
  * the call is `mintBackcheck(save, {day, dues: cleared + open, cleared, reason: 'dues'})`, so one
    due left open ⇒ `cleared < dues` ⇒ `dues-open` ⇒ no mint, and a day with no due cleared ⇒
    `no-dues`. Sweep entries are excluded because at D ≤ 2 `dueList` flags *every* bucket ≤ 2 card as
    due whether or not it is overdue — including them would make the mint unreachable in the Final
    Sweep week, the one week it matters.

The debrief now carries `minted: {minted, held, why, source, open, cleared}`.

**Not fixed, deliberately:** `mintBackcheck` stamps `backchecks.mintedDay` even when it mints nothing
(at the cap), which burns the day — so a student at the cap who spends one at 20:00 cannot be paid for
the dues they clear at 21:00. `job/index.js canMint` refuses *before* stamping and does not have the
bug; `plan.payCleanGetaway`'s inline fallback does, and `tests/job-week.test.mjs:168` pins
`state.mintBackcheck` to that fallback byte-for-byte. Fixing it here alone breaks that test, so it is
a Request (below). `mintForJob` works around it by never *attempting* a mint that cannot land.

**Test** (`tests/job-state-r1.test.mjs`, "the Backcheck mint has a call site"): five simulated days,
each a whole job played through the real `startJob → … → push` path with `screens/card.js`'s Ledger A
write simulated after each target. `held` goes **0 → 1 → 2 → 3 → 3 → 3** and the first three days
report `minted`. Separate tests cover: one mint per day whichever the source; the **dues** source
carrying a day on its own (a job that *spent* a Backcheck cannot take the vault source, so the mint
that fires is `source: 'dues'`); an open due minting nothing; and a clean crack minting.

---

## 2. MAJOR — a FAILED vault recorded as "cracked"

`advance()` chose `OUTCOMES.CRACKED` from the pointer alone, never from the last target's result, so
a missed vault produced an identical debrief, incremented `records.cracked` and printed under Stats'
"Vaults cracked". G1's named failure state **Knocked** had nowhere to land.

**Fix (root).** Added `OUTCOMES.KNOCKED = 'knocked'`. `advance()` now reads `g.last.ok` (written by
`applyTarget` for every non-free target) and picks `CRACKED` / `KNOCKED`. `cracked`, `records.cracked`,
the job-log entry's `cracked` and the vault Backcheck mint are all downstream of that word.
`KNOCKED` was added to `GETAWAY_OUTCOMES` (a loss the Elo ladder never sees is a ladder that only goes
up) and to `bankOnExit`'s free-getaway case (G1 Knocked: "unchanged: XP, mastery, tiles kept").

**One half of this finding is WRONG and the code was not changed for it.** The critic asked that a
knocked vault "must not be paid COMPLETION". `COMPOSED-GAME.md` line 259 is the authority:

```
$ sed -n '259p' COMPOSED-GAME.md
completion = +10 % on BAGGED if every drafted target was answered
```

A knocked vault answered every drafted target. What G1's Knocked entry forfeits is the **stamp**
("a vault boss KO — unchanged: XP, mastery, tiles kept, stamp forfeited", line 161), not the
completion bonus — and `records.cleanJobs` already refuses a job with a failed call. COMPLETION is
therefore still paid, and a test pins that with the quote.

---

## 3. MAJOR — `ledger.phaseMeans` had no idle clamp, and `k = min(5, jobs)`

At `jobs = 1`, `k = 1`, so `means[ph] = observed`: the shipped `PHASE_MEANS_DEFAULT` was discarded
outright by one sample, and `observed` is raw wall clock with no idle subtraction.

**Fix (root).** New `foldMean(prev, observedS, ph, jobs)`:

* `k = min(SPLIT.projectionWindowJobs, jobs + 1)` — job 1 **blends** with the shipped prior.
* the observation is clamped at `PHASE_OBSERVED_CAP_X (= 4) ×` the phase's shipped default, so a
  locked phone contributes a bounded number and not a night.

`SPLIT.projectionWindowJobs` replaces the hardcoded `5`.

The clamp is a mitigation, not a cure: `g.ph[ph]` is still raw wall clock, because `SPLIT.deadMs = 0`
(data/job.js) means the layer subtracts no idle at all — which is the separate "prints `0 ms idle` as
a measured fact" finding, and it lives in `data/job.js` + `screens/run.js`. This lane bounds the
damage; it cannot remove the constant.

---

## 4. MAJOR — `quietClose()` had no caller

`grep -rn quietClose site/js/` found the definition and one comment in `plan.js`. Nothing scheduled a
22:00 check, so `AUTO_BAG.quiet22`, `COPY.quietBanked` and the `quiet22` outcome were all unreachable.

**Fix (root).** The trigger is now **`advance()`** — G1 line 617 says the close happens "at the next
target boundary", and `advance()` *is* that boundary and is the one place the pointer's consequences
are read. A screen poll was the wrong mechanism anyway: it can be forgotten, and it was.

* `advance()` calls `quietClose(save, {now, end: left === 0})` when the stakes are on and
  `days.isQuietHours(now)`.
* New record key `quiet` (EXTRA_KEYS, serialised as a boolean) so the terminal word is `QUIET22` and
  not `CALLED` — both end the stakes, only one of them was the student's decision.

Tests: a job started at 21:58 banks LOOSE at **100 %** on the first boundary past 22:00, turns the
stakes off, ends on `quiet22` at posted 0, is **not** recorded as walked, and still answers every
drafted target. CALL IT still ends on `called`.

---

## 5. BLOCKER — `phaseMeans.debrief` could never move off 65 s

`endJob` does `setPhase(g, 'debrief', now)` and then folds the means in the same breath, so
`g.ph.debrief` is 0 *by construction* and the `observed > 0` guard never fired. 14–21 % of every
projected game-second was an unmeasurable constant printed as measured.

**Fix (root).** The read cannot be folded by the job that opened it, so it is folded by what comes
next:

* `endJob` stamps `game.ledger.debriefAt = now` and skips `debrief` in its own fold;
* new export **`closeDebrief(save, {now})`** folds `(now − debriefAt)` through the same clamped
  `foldMean` and clears the stamp. TOTAL and idempotent — no stamp ⇒ no-op;
* `startJob` calls it as the guaranteed backstop, so the mean moves even if no screen ever calls it.

Tests: the mean leaves 65 s, moves across four jobs, is idempotent, is a no-op on a fresh save, and a
phone slept on overnight contributes the clamp rather than nine hours.

---

## 6. MAJOR — the brief window's fifth option (the priced contract swap)

G1: "swap one undrafted contract in at its **declined price** (+0.15)". It was never built, and
`board.declinePrice` was computed onto every posted row with **no consumer anywhere in `site/js`**.

**Fix (the half that is in this lane).** The state machine now owns the swap:

* `startJob` stocks `inProgress.bench` — the targets of the contracts you declined, each priced at
  `round(posted × 1.15)`. It has to be taken there: the board's bundles carry their target objects
  only as a *non-enumerable* property of `buildJob`'s result, which `startJob` serialises away. It
  lives on `inProgress` (beside the queue) and **not** inside the budgeted `inProgress.game`, and it
  survives the disk — a swap that vanished when the tab was killed would violate G3.7 proof 6.
* `swapOptions(save)` → `[{id, label, wing, grade, minutes, posted, decline, targets}]`.
* `canSwap(save, id)`.
* `brief(save, {swap: {id}})` splices the contract's targets into the remaining queue **in front of
  the vault**, renumbers `n` (`page.requeueReview`'s own convention), removes them from the bench,
  adds the id to `g.picks` and adds the declined posted to `g.posted`. The return value gains
  `swap: {id, targets, posted, left, of}` and `took` gains `'swap'`.

Tests: the decline price is exactly `+0.15`; the swap lengthens the queue, pays more, keeps the vault
last, renumbers, cannot be taken twice; a swapped-in target prices, answers and marks like any other;
the bench survives a reload.

### Requests (files this lane does not own)

1. **`site/js/screens/job.js`** — render the fifth brief option: one button per `state.swapOptions(save)`
   row, labelled with `o.label` and `o.decline` (e.g. `D  FAC2 · 4 locks · posted 34 → 39`), calling
   `state.brief(save, {swap: {id: o.id}}, {now})`. Until this lands the *reachable* full-use decision
   count is still 33, not the 35 `econ.js` prints from `DECISIONS.briefOptionsMax = 5`.
2. **`site/js/screens/job.js`** — call `state.closeDebrief(save, {now})` when the debrief screen
   unmounts (route change away from the summary). `startJob` is already the backstop, but the screen's
   own unmount is the precise measurement.
3. **`site/js/screens/run.js`** — two places take the terminal word and both now miss one:
   * `JOB_TITLES` (~1562, "one per terminal word of `job/state.js`'s `OUTCOMES`") — add
     `knocked: 'Vault knocked'`, or a terminal word prints with no headline.
   * the `feeFree` list (~1957: `completed | cracked | walked | commit | quiet22`) — add `knocked`.
     `bankOnExit` banks a knock through the getaway's free 100 %, so the fee-strike line would
     otherwise claim a fee that was never charged.
4. **`site/js/screens/stats.js`** — "Vaults cracked" is now correct; consider a "Knocked" row beside it
   (`records` has no counter for it yet — if one is wanted, ask this lane to add `rec.knocked`).
5. **`site/js/page.js` / `site/js/screens/run.js`** — the dues mint currently only fires when a **job**
   closes the day. A flat page that clears the day's last due mints nothing. One line in `finishPage`'s
   caller (`state.mintBackcheck(save, {day, dues, cleared, reason: 'dues'})`, or a re-export of
   `mintForJob`'s dues half) would close that.
6. **`site/js/plan.js`** — `payCleanGetaway`'s inline mint fallback stamps `backchecks.mintedDay` on a
   refusal at the cap, burning the day for a later legitimate mint. `job/index.js canMint` does not.
   Change both the fallback and `state.mintBackcheck` in the same pass (and relax
   `tests/job-week.test.mjs:168`, which pins them to each other) so a refusal never stamps the day.
7. **`site/data/job.js`** — `GAME_PHASES` and `FIXED_PHASES.JOB.full` charge **25 s for a `crew`
   phase that no code ever sets**: `grep -c "setPhase(" site/js/job/state.js` returns 15 call sites and
   `grep -n "setPhase(g, 'crew'" site/js/job/state.js` returns none, and `MEAN_PHASES`
   (= keys of `PHASE_MEANS_DEFAULT`) does not contain it either.
   The crew re-rank happens *inside a brief window* (`brief(save, {crew})`), so its seconds are already
   counted as `brief`. Either the between-jobs crew screen must `state.tick(save, 'crew', now)` while it
   is open, or `crew` must come out of `GAME_PHASES` and out of the full column's 282 s. Not this
   lane's file; flagged, not changed.

---

## Test status

`tests/job-state-r1.test.mjs` — **26 tests, all green.**

Whole non-browser suite (everything but the four Playwright files): **2415 tests, 2408 pass, 3 fail.**
The failing set moves between runs because five other lanes were editing `page.js`, `board.js`,
`guard.js`, `crew.js`, `econ.js`, `mock.js` and `run.js` throughout (mtimes 14:24 → 14:48 while this
lane ran). Nothing in the set is from this lane — every one names another lane's file in its own
assertion:

| suite | assertion | file it names |
|---|---|---|
| `tests/job-state.test.mjs:698` | "every queue item ends `done` with a `result`" | `site/js/page.js` — `requeueReview` now inserts the re-queued copies two slots earlier. **A/B verified**: with `startJob`'s `bench` line removed and this lane's state.js otherwise in place, the failure persists unchanged. `site/js/page.js` was modified at 14:34:52 and `site/js/job/board.js` at 14:34:58, between two runs of this suite. |
| `tests/job-copy.test.mjs:284` | "none anywhere in the game layer's source" | `site/js/job/econ.js → you should` (it read `site/js/job/guard.js → good job` twenty minutes earlier — the copy lanes are mid-edit) |
| `tests/job-exploit.test.mjs:557` | "econ · call · crew · guard · index hold ZERO clock reads" | `site/js/job/crew.js reads the clock: Date.now` (crew.js:470, a default parameter) |
| `tests/job-board.test.mjs:970` | "WALK-SCUMMING IS DEAD: walking at the board re-posts the byte-identical board" | `site/js/job/guard.js` — the guard distribution collapsed from `{.25,.25,.25,.25}` to `{0,0,0,1}` between runs. This suite was **green at 14:43** with this lane's state.js already in place; `guard.js` was modified at 14:45:13 and `board.js` at 14:48:38. `endJob`'s one heat write (`gm.heat = guard.pushHeat(...)`) is untouched by this lane. |

`site/js/job/state.js` is named by none of them, and the two proofs that most constrain this lane's
changes are green:

* `tests/job-exploit.test.mjs` "board.js and state.js read the clock ONLY as a fallback for an
  injected `now`" — the new `isQuietHours` branch in `advance()` takes the same fallback shape;
* `tests/job-exploit.test.mjs` "a whole job replayed with every millisecond × 10 is byte-identical" —
  G1's "answers tick; time does not" still holds with the 22:00 close wired in.

The four Playwright suites were not run here (`job-screen.test.mjs` was failing on
`ReferenceError: guardNote is not defined` at `site/js/screens/run.js:2018`, another lane, mid-edit).

---

# ROUND 2 — `site/js/job/state.js`

Five findings arrived. **Four are fixed at the root. One (the terminal word `cracked` on an ordinary
JOB) is reported WRONG, with the commands that prove it** — and the real defect hiding inside that
finding, the clean-vault Backcheck mint, is fixed for a different reason than the critic gave.

Files touched: `site/js/job/state.js`, the new `tests/job-state-r2.test.mjs` (14 tests), and one
assertion in `tests/job-state-r1.test.mjs` (which was pinning the §3 defect — see Test status).
Nothing else.

## 1. MAJOR — the Backcheck's vault gate was off by one, in the permissive direction ✔ FIXED

`canBackcheck` asked `isVaultTarget(save)`, which is `idxOf(save) === queue.length - 1` — **the
pointer**. `applyTarget` runs `markItem` before any payout-beat predicate can be read, so the pointer
describes the target that is NEXT, never the one just answered. The gate was therefore exactly
inverted: refused one target early, and **allowed on the vault**, which is the single beat G2's rule
exists to leave unshielded (the vault is what CRACK stakes the whole pile on).

Measured before (scratch, 7-target job, 3 Backchecks held, everything CLEAN but one target):

```
miss on target 7 (the LAST target): d=-24  canBackcheck=true   <- the vault was shielded
```

**Fix.** New `lastWasVault(save)`: the answered target is always `queue[idx − 1]` (`markItem` advances
by exactly one, and `requeueReview` splices its retry copy at `last + 1 > i`, never before `i`), so the
predicate reads that slot and treats a trailing run of re-queued copies as still-the-vault — a copy
spliced in **behind** the target that was just answered does not un-vault it. `isVaultTarget` is
unchanged and still correct for the beats that ask before the answer (the getaway gate, `job-state`'s
own `sawGetaway` assertion). After:

```
miss on target 7 (the LAST target): d=-24  canBackcheck=false
misses on 4, 5, 6:                          canBackcheck=true
```

## 2. MAJOR — `startJob` overwrote a live, half-answered Today's Page ✔ FIXED

The only guard was `stateOf(s)` — an existing `inProgress.game`. A PLAIN page has none, so it fell
through to `s.inProgress = { … queue, idx: 0, game }` and the page was gone: unanswered items removed
from the schedule by a game decision (**COMPOSED global rule 5**), `finishPage()` never called
(`counters.pages` never moved), and a seeded Variant target that was never missed is not in
`save.frozen`, so that exact instance is unrecoverable. `#/run/job` is a public hash route; a
back-button, a bookmark or a reload of a URL left in history reaches it, and `plan.js`'s "a resume
always wins" governs Home's button, not the route.

Before (the critic's own scratch run, `lg8.mjs`): `21-item page, 4 answered → inProgress.queue = 10
items, idx = 0, game = true; 9 unanswered page items not in the job queue, one of them the seeded
Variant T-notation#2edc07; counters.pages = undefined`. After, on this lane's own 20-item fixture:

```
flat page in progress: 20 items · idx now 4 of 20
  startJob refused: JobStateError: page-in-progress: 16 left on Today's Page
  after startJob: queue 20 · idx 4 · game false
  items lost from the page: 0
```

**Fix.** New exported predicate `pageInProgress(save)` — a plain page with **`idx > 0`** and targets
left, or null — and `startJob` throws `JobStateError('page-in-progress')` on it unless `opts.force`.
`startPage` in `page.js` already has the same shape (`if (ip && !opts.force) return ip`).

**The pointer, not merely "a page exists".** At `idx === 0` a page is losslessly re-derivable:
`composePage` is pure in `pageSeed(profileId, dayIndex, pageIndex)`, `pageIndexFor` counts FINISHED
pages, and nothing has been answered — re-posting reproduces the identical queue, seeded Variant
instances included. That is precisely the state a job walked AT THE BOARD leaves behind, and a
blanket refusal broke `tests/job-board.test.mjs` "WALK-SCUMMING IS DEAD" (`Error [JobStateError]:
page-in-progress: 10 left on Today's Page`) — an affordance the design wants open. The loss begins
when the pointer moves, which is where the refusal now begins. Green again with the narrower rule.

Deliberate asymmetry: `startPage` *returns* the live page, this *throws*, because a caller of
`startJob` is asking for a job record and there is none to hand back. See Requests (1) for the
screen's half.

## 3. BLOCKER "every completed ordinary JOB is recorded as a cracked vault" — ✘ **the word is NOT a bug**, ✔ the MINT was

The critic is right that a plain `JOB` ends `OUTCOMES.CRACKED` with `SHAPES.JOB.vault === false` and
`g.vault === null`. That is the **spec's own wording**, not a defect:

```
$ grep -n "The last target is the" COMPOSED-GAME.md
68: … Two brief windows open after targets 4 and 8. The last target is the **vault**; before it, the **getaway**.

$ grep -n "the vault target ends in the getaway" COMPOSED-GAME.md
115:| BAG / PUSH (9 beats; the vault target ends in the getaway, not a bag/push) | 9 | 9 |

$ grep -n "9 bag/push beats, not 10" COMPOSED-GAME.md
987: … there are 9 bag/push beats, not 10, because the vault target ends in the getaway.
```

Lines 115 and 987 are the **JOB-10** row: G1's published `24 mandatory / 35 full use` is
`1 draft + 1 press + 10 calls + 9 bag/push + 2 briefs + 1 getaway`, which only adds up if an ordinary
JOB has a vault target and a getaway. `notes/J5c.md §5.3` records the reading explicitly — *"`SHAPES.*.vault`
is read as 'is the final target a boss', not 'is there a getaway' … every longer job ends
`OUTCOMES.CRACKED`"* — and another lane's suite pins it:

```
$ sed -n '124p;731p' tests/job-debrief.test.mjs
  shape = 'JOB',
    assert.equal(got.title, 'Vault cracked');
```

Changing the word would break `tests/job-debrief.test.mjs` (BUILD-POLICY §3 forbids "fix the test"),
and it would contradict three lines of the authority. **Not changed.** What *is* wrong is the copy on
two other lanes' screens — see Requests (2) and (3).

**What WAS a real break, and is fixed:** `mintForJob` paid G2's free clean-**vault** Backcheck on
`cracked === true` alone, i.e. for finishing *any* job cleanly, on a `reason: 'vault'` that skips the
dues gate entirely. That makes the game's only consumable a reward for playing, including on a
zero-dues day, and G2's thesis sentence is the opposite one: *"the least fun, highest-value study
action is the source of the game's only scarce resource."* G3.7 #6 says what the vault IS — *"the
most-overdue tier-3/4 original you have cleared, named on the board at the start of the job"* — i.e.
`board.vaultFor`, drawn only when `budget.vault` is true.

Measured before / after (scratch, same seed):

```
before:  shape=RUN  SHAPES[shape].vault=false g.vault=null -> minted {"source":"vault","held":1}
after:   shape=RUN  SHAPES[shape].vault=false g.vault=null -> minted {"source":null,"why":"dues-open"}
after:   shape=VAULT SHAPES[shape].vault=true g.vault=doc-05 -> minted {"source":"vault","held":1}
```

New private helper `shapeHasVault(g)` = `SHAPES[g.shape].vault === true && g.vault != null`. The dues
path is untouched and still carries the day on its own.

## 4. MAJOR — COMMIT: half WRONG (it fires), half real (the declaration outlived its job) ✔ FIXED

`commitFire` **does** have a call site — the screen lane wired it between the critic's grep and this
one:

```
$ grep -n "commitDue\|commitFire" site/js/screens/job.js
1364:    try { due = state.commitDue(getState(), now()) === true; } catch { due = false; }
1367:    try { update((s) => { out = state.commitFire(s, { now: now(), day: today }); }); }
```

The second half stands and is this file's: **nothing ever cleared `gm.commit.bound`** except
`commitFire`, so a declaration that was never reached ("a declaration that is never reached simply
never fires", G3.9) stayed bound for the life of the save, and `endJob`'s
`committed = word === COMMIT || save.game.commit.bound === true` then added a COMMIT decision to the
debrief of **every later job**. Measured before / after:

```
before (the critic's p11_commit.mjs, one tap on job 1, 10 calls a job):
  job1 committed=true decisions=25 | job2 …=25 | job3 …=25 | job4 …=25 | commit.bound=true throughout
after (this lane's scratch, same shape of run, 7 calls a job):
  job1 committed=true decisions=18 · commit.bound=false once the job ended
  job2 committed=false decisions=17 | job3 the same | job4 the same
```

`honored` is left alone — it is the lifetime count of declarations that actually fired.

**Also added, as a structural backstop:** `advance()` now fires a due declaration at the target
boundary, next to the 22:00 close. G3.9's trigger is a clock, so the screen's 15 s watch is what lands
it *on* the minute and this can never pre-empt it (a boundary is never earlier than a 15 s poll) — but
this file already argues, for `quietClose`, that *"a transition whose only caller is a screen that may
forget it is a transition that does not exist."* With no screen at all:

```
A · commit backstop: outcome commit · targets 5 of 10 · bonusRate 0.08 · honored 1 · bound false
```

It is skipped once the last target is answered, for the same reason the 22:00 close is: a job that is
already ending has nothing left to bind, and firing there would swap G1's +10 % completion for
G3.9's +8 % on a job that completed.

## 5. MAJOR — "the 15-minute job quietly becomes a 25-minute job and never re-quotes" ✔ the NUMBER now exists

The defect is real and its root is here: the board quotes the job once, then `page.requeueReview`
grows the queue (11 → 12 → 13 → 16 targets in the critic's walk) and nothing can re-price it, because
no function returned the remaining time. The *string* is `screens/job.js`'s — see Requests (4) — but
the arithmetic is this lane's, and G1 makes it mechanical rather than cosmetic: *"telling the truth
about time is mechanically necessary, not a courtesy."*

New export **`etaOf(save, {now})`** → `{of, left, answered, drafted, grew, perTarget, spent, ahead,
secondsLeft, minutesLeft, endsAt, source}`. Measured, not claimed: the per-target rate is the job's own
`tGame + tAnswer` with the one-off beats (`ph.board/guard/brief/getaway`) subtracted, falling back to
the shape's shipped row only before the first target is answered; `ahead` re-adds the one-off beats
that have not happened yet, at `game.ledger.phaseMeans` (the same source the board projects from).
`drafted` is the queue **minus its `requeued` copies** — exact, rather than `shape.targets`, because a
legal draft serves the shape's count ±1 on 0.5 % of boards (J5) and would mis-call `grew` there; and
`requeueReview` is the only thing that ever adds to a live queue.

```
at the board:      10 targets · ~11 min · ends 18:10 · shipped  · grew=false
after target 1:    11 targets · ~11 min left · ends 18:12 · measured · grew=true
after target 6:    16 targets · ~12 min left · ends 18:19 · measured · grew=true
after target 17:   18 targets · ~1 min left  · ends 18:21 · measured · grew=true
```

## Requests (files this lane does not own)

1. **`site/js/screens/job.js`** — `mountJob` must redirect instead of crashing now that `startJob`
   refuses a live page: `if (state.pageInProgress(getState())) { navigate('/run/page'); return () => {}; }`,
   the same shape as the existing `jobEntryGate` redirect. Today the refusal surfaces as
   `console.error('job: cannot post the board', e)` and a boardless screen — safe (nothing is lost),
   but not the message the student should get.
2. **`site/js/screens/run.js`** — `JOB_TITLES` (≈1562) has **no `knocked` key**, so G1's named failure
   state falls through to the generic word. Add `knocked: 'Knocked'`. The `feeFree` list (≈1957) still
   needs `knocked` too (round 1's request, still open): `bankOnExit` banks a knock through the
   getaway's free 100 %.
3. **`site/js/screens/stats.js`** — `['Vaults cracked', rec.cracked]` counts *every* job that cleared
   its last target, because that is what G1 calls the vault (see §3 above). The row is honest only if
   it is renamed to what it counts — `Jobs cracked`, or `Last targets cleared`. If the product really
   wants "vault jobs only", that is a data change (`SHAPES.JOB.vault`) plus a spec edit to
   COMPOSED-GAME.md 68/115/987, not a state.js change — ask for it explicitly and this lane will
   gate `rec.cracked` on `shapeHasVault` in one line.
4. **`site/js/screens/job.js`** — print the re-quote. `state.etaOf(save)` is there now:
   `` `JOB · ${e.of} targets · ~${e.minutesLeft} min left · ends ${timeHM(new Date(e.endsAt))}` ``,
   and the collapsed strip should carry it too (it currently has no clock at all). `e.grew` is the
   flag for saying so out loud the first time it happens.
5. **`site/js/screens/job.js`** — `finalWordOf` (≈179) duplicates `advance()`'s word choice. It is
   correct today, but it is a second source of truth for a rule that lives in state.js; if this lane
   ever has to change the terminal word (see §3), that copy will silently diverge. Prefer importing it.

## Test status — round 2

`tests/job-state-r2.test.mjs` — **14 tests**, new file.
`tests/job-state.test.mjs` — unchanged.
`tests/job-state-r1.test.mjs` — one edit: the mint test at :250 now **pins `shape: 'VAULT'`** and
asserts `minted.source === 'vault'` outright. It used to leave the shape to `shapeFor`, which posts a
plain JOB for that seed, so it was green only because the mint fired on any cleanly finished job —
i.e. it asserted the §3 defect. `playJob` there gained a `shape` option to make that possible.

**A/B, to prove the rest is not this lane's.** A byte-copy of `site/` + `tests/` + `qa/` was taken
into the scratchpad and its `site/js/job/state.js` mechanically neutralised — the five behaviour
changes above reverted, everything else in the tree identical, same minute. Both trees, same six
suites:

```
pass 1 — job-save · job-split · job-call · job-index · job-exploit · job-screen
  real (round 2 in place):   367 tests · 5 fail · job-screen:327 · job-split:455 :483 :962 :996
  neutralised (round 2 out): 363 tests · 5 fail · job-screen:327 · job-split:455 :483 :962 :996

pass 2 — job-board · job-screen · job-split, on a copy re-taken the same minute
  real:          158 tests · 3 fail · job-board:1375 · job-split:483 · job-split:962
  neutralised:   158 tests · 3 fail · job-board:1375 · job-split:483 · job-split:962
```

Identical failure set both times. **Not one of them is this lane's.** (`job-screen:327` is
`collapsedLineOf`/`COPY.collapsedBoard`; `job-board:1375` and the `job-split` ones are the board's
projection model vs the debrief's measurement — one says so in its own assertion: *"the projection
now tracks a clock it does not own, so this test has been overtaken"*. The set shrank between the two
passes with no change from here, which is the other lanes converging.)

Whole suite, three full runs from this lane:

```
run A:  2606 tests · 2596 pass · 6 fail · 4 skipped
run B:  2609 tests · 2599 pass · 6 fail · 4 skipped
        job-board:1375 · job-split:483 · job-split:962   (the A/B-cleared set)
        job-coldopen:235 :248 :262                        — transient: `site/js/job/board.js` was
        mid-save during run B (`ReferenceError: meansForShape is not defined` at board.js:442,
        inside `projectFor`). Re-run alone the moment board.js loaded again: **29/29 green.**
run C (last):  2609 tests · 2602 pass · 3 fail · 4 skipped
        job-board:1375 · job-board:1432 · job-split:962   — all one lane: the board's per-shape
        projection model against the debrief's measurement, still landing.
```

That is 21 fail at the start of this ticket → **3, none of them this lane's**. Re-run
`node --test tests/` once the board/split lane lands; `site/js/job/state.js`'s own three suites
(94 tests) are green whenever board.js is, and so are its neighbours: `job-state` + `job-state-r1` +
`job-state-r2` + `job-debrief` + `job-week` + `job-ledger` + `job-copy` = **276 tests, 276 pass**.

The suite is **not stable to measure from this lane**: `site/js/page.js`,
`site/js/job/board.js`, `site/js/job/call.js`, `site/js/job/index.js` and `site/js/screens/run.js`
were all being edited while this ran — two full-suite runs an hour apart caught
`ReferenceError: personalRates is not defined` (board.js) and `ReferenceError: assignLabels is not
defined` (page.js) mid-save, and `COMPOSED-GAME.md` itself changed under us (mtime 17:44, line
numbers shifted by 2). The failures observed name other lanes' files in their own assertions —
board bundle labels and the dry board, `call.js`'s window weight, `index.js`'s sealing,
`run.js`'s `ratingDelta` write, the board-vs-debrief split model — and `site/js/job/state.js` is
named by none of them. The one that WAS this lane's (`job-board.test.mjs` walk-scumming) is fixed
above, in the change, not in the test.

---

# ROUND 3 — the brief window's re-press was free, and the guard game was void from target 5

**File touched: `site/js/job/state.js` only** (plus a new suite of its own,
`tests/job-state-r3.test.mjs`). One BLOCKER, fixed at the root.

## The defect, reproduced

`press()` was legal at phase `brief` and did nothing there but write the new allocation. By the
time a brief window opens the guard's wing is **public** — `envelopeFor` prints `guarded` on every
target served, and `tokens: 0` with it — so the student could move tokens off the wing they already
knew was dead, tap **Skip**, and keep the same guard. `brief({ repress })`, the option
COMPOSED-GAME §"What a brief window is" prices at *"Re-press ONE token WITH THE GUARD DISTRIBUTION
REDRAWN"*, was therefore **strictly dominated by not using it**, and `briefs[].took` recorded `[]`:
no decision at all. Both published claims were broken — the redraw AND the one-token limit (the
gate let any number of tokens move).

Measured on the r1/r2 corpus, 8 seeds, same answers, branch at the first window, Σ
`envelopeFor().posted` over the targets served after it
(`/private/tmp/.../scratchpad/value.mjs`, `value2.mjs`):

```
before   honest 1368 → re-optimised 1576   +15.2 %    (wing unchanged, took [])
after    honest 1368 → re-optimised 1359    −0.7 %    (4 of 8 seeds WORSE: +10.4 −13.1 −4.8 0
                                                       −20.0 −22.5 +8.4 +15.3)
```

The wholesale re-allocation is now refused outright (`repress-step`); the strictly-dominant
restricted play — move the one token sitting on the guarded wing, which is already worth 0 — is
still available, and is now a **trade**: the redraw puts the other two tokens back at risk. That is
the game §3.4 describes.

## The change

1. **The redraw moved out of `brief({repress})` and into `press()` itself.** `screens/job.js
   bump()` (the +/− handler shared by `renderStart` and `renderBrief`) commits through `press()`
   directly and never reaches `brief()`'s action list, so a redraw that lived in `brief()` could
   always be walked around. `press()` at phase `brief` now redraws from the same published
   distribution on the same PINNED seed `${seed}|brief${n}` the priced path always used — so the
   two paths are byte-identical, pressing twice in one window cannot re-roll it, and neither can a
   reload.
2. **"Re-press ONE token", enforced.** `pressRefusal()` (pure, shared with the new exported
   `canPress`) allows at a brief: one atomic move, or a lift then a place, and nothing more —
   `repress-step` (more than one token in a single call), `repress-spent` (a second lift in the
   window), `repress-lift-first` (a place with no lift, i.e. minting a 4th token),
   `repress-unavailable` (the option does not exist on a press of fewer than `GUARD.tokens`).
3. **`brief()` records the decision whichever button closed the window** (`else if (repressed(g))
   took.push('repress')`), so the debrief's decision count stops under-counting the path that was
   getting the option for free. An untouched window is still free: Skip redraws nothing and takes
   no decision.
4. The board press is **untouched** — free, blind, sealed, any allocation ≤ `GUARD.tokens`, no
   redraw. (The round-3 critic's suggested predicate, *"refuse `press()` once `g.guard.wing` is
   non-null"*, would have killed it: `board.js buildJob` draws the wing at build time, so
   `g.guard.wing` is non-null from the job's first second. The wing being DRAWN is not the wing
   being KNOWN; what makes the board press honest is that nothing has revealed it yet.)

## The one-token ledger costs `inProgress.game` no key

G7's byte budget is asserted **exactly** (`job-save.test.mjs`: the `_helpers.mjs` fixture must be a
fixed point of `serialize()`, and the per-line sum must be within 0.05 KB of
`SAVE_BUDGET_KB.totalAdded`), so a new `STATE_KEYS` entry would have forced edits to
`tests/_helpers.mjs` **and** `site/data/job.js` — two other lanes' files, mid-flight. Instead the
ledger is derived from two fields already in the save: `setPhase` stamps `phaseAt` when the window
opens, `press()` stamps `guard.drawnAt` when it redraws, and

```js
const repressed = (g) => num(g?.guard?.drawnAt, 0) > num(g?.phaseAt, 0);
```

IS "this window's token has been lifted". It survives a reload (both halves are on disk) and clears
itself when the window closes and `phaseAt` moves past it. `serialize()` emits exactly the keys it
did — asserted in the new suite.

`drawnAt`'s fallback when a caller passes no `now` is `phaseAt + 1`, **not** `Date.now()`:
`envelopeFor` prices `cold` against `guard.drawnAt`, and `bump()` is exactly a caller with no clock
— a wall-clock stamp there would have moved the job's own pinned basis by hours.

## Tests — `tests/job-state-r3.test.mjs`, 16 tests, new file

Every one drives the real machine. Coverage: the guard really is public by the brief (the envelopes
agree with `guard.wing`, and a guarded wing pays 0 tokens) · press-then-Skip redraws and is recorded
· the guard does NOT read the press (two different re-presses in the same window face the same drawn
wing) · an untouched Skip is still free · `brief({repress})` still prices and still counts (the
full-use decision count is unchanged) · one token, four refusal codes, including the two-step +/−
the screen actually fires · `canPress` is the same rule · a reload cannot re-open a spent window or
re-roll the wing · `serialize()` gained no key · the board press is untouched · and the payoff
assertion above (`gain ≤ 5 %` and the redraw costs the student something on ≥ 2 of 8 seeds).

**A/B, both directions, by file copy (never `git stash` — other lanes park work in this tree).**
A byte-copy of the shipped `state.js` was mechanically reverted in the scratchpad (round-3 `press`
and `brief` restored, a legacy `canPress` shim added so the suite still imports) and swapped in:

```
new suite vs the REVERTED file:   16 tests · 8 fail   (every behavioural assertion of the defect)
new suite vs the SHIPPED file:    16 tests · 0 fail
```

## Not this lane's — cleared by the same A/B

Four failures were observed in the neighbouring suites while this ran. All four fail **identically**
with `state.js` reverted, so none is round 3's:

```
job-board.test.mjs  "the primary button prints targets, minutes, the end time and the projected split"
                    actual: `JOB · A B E · 10 targets · posted 346 (−146 shared) · ~17 min · …`
                    vs the suite's own `^(RUN|JOB|VAULT) · \d+ targets · …$` — the board's copy line
job-call.test.mjs   "it lands in the band G3.1 publishes for this play" — rating 9.188 (call lane)
job-screen.test.mjs "the screen composes no user-facing sentence of its own"  (a static scan of
                    screens/job.js; state.js is not read by it)
job-screen.test.mjs "J6 measured: a full job at 375x667 … board <= 36px" — the 253.45px sticky sheet,
                    already failing in the pre-change baseline captured at the top of this ticket
```

The state lane's own suites are green: `job-state` + `job-state-r1` + `job-state-r2` +
`job-state-r3` + `job-guard` + `job-exploit` = **285 tests, 285 pass**, and
`job-save` + `job-split` + `job-debrief` + `job-index` = green in the same run.

## Requests — `site/js/screens/job.js` (NOT touched; that lane was live)

1. **Gate the brief's +/− with the new `state.canPress(s, next)`** — one line inside `bump()`, next
   to the existing `if (total > GUARD.tokens) return;`:

   ```js
   if (gv && !state.canPress(s, next)) return;      // or: disable the button with the same call
   ```

   Without it, the second token move in a window throws a `JobStateError` out of the `onclick`
   (`update((s) => { state.press(s, next); })` does not catch), so the click is dead and an error
   reaches the console instead of a greyed-out button. Nothing is written — `pressRefusal` runs
   before `g.tokens` is touched — so it is cosmetic, but it is the difference between "the button is
   spent" and "the app broke".
2. **`renderBrief` should say what the ± now costs.** The panel's `tokenRow`s are the priced
   re-press now, not a free scratchpad: one line under `job-tokens` — *"moving a token redraws the
   guard"* — and the `Re-press · redraw the guard` button is honest as-is (it takes the same redraw
   with the allocation unchanged, which is a legal, deliberate play).
3. Round-2 requests 1–5 above are unchanged and still open.

# repair:run — the run lane's repair pass on `designs/r3-findings.json`

Owner files: `site/js/screens/run.js`, `site/js/app.js`, `site/index.html` (+ the test files that
cover them: `tests/run-lane-r1/r2/r3.test.mjs`, `tests/job-debrief.test.mjs`).

**`designs/REPAIR-DECISION.md` assigns this lane nothing.** `grep -n 'Lane:' designs/REPAIR-DECISION.md`
→ `screen`, `doc`, `doc`, `call`, `crew`, `screen`, `guard / doc`. S0–S5 name no `run` ticket, so
there is no structural decision and no S-acceptance test to implement here. The two places the
decision *mentions* this lane's file are verified below (S1.1 item 2, §Requests 1) and neither asks
for a code change.

**Findings owned:** `lane === 'run'` → **three**: 14 (MAJOR), 44 (MAJOR), 63 (MINOR).
One more finding cites a file this lane owns while being assigned elsewhere: **40 (BLOCKER, lane
`call`, file `site/js/screens/run.js`)**. It is confirmed, measured and filed under Requests — it
cannot be closed inside this lane, and the reason is arithmetic, not politeness (see Request 1).

**Baseline, measured before any edit** (`node --test tests/`, 22:33):
`tests 2725 · pass 2719 · fail 2 · skipped 4`, i.e. **the 2721/0 baseline in the ticket is wrong** and
REPAIR-DECISION S0 is right to say so. The two failures are both outside this lane and both in files
other fixers are mid-edit on right now:

- `tests/job-call.test.mjs` — *"behaviour: a mastered student keeps Called 5, and measured cowardice
  still falls to Called 2"* (S3, the `call` lane, in flight)
- `tests/job-screen.test.mjs:875` — *"J6 measured: a full job at 375x667 with the keyboard open"*
  (S0, the `screen` lane)

Neither imports `screens/run.js`. This lane's own suites were green at baseline and are green now.

---

## 14 — MAJOR · call-propriety · the regret line mixes the two ladders → **REFUTED as live (already fixed); the critic's analysis was right**

**Verdict: the defect is real and the tree does not have it.** The finding cites
`site/js/screens/run.js:1737-1738`:

```js
const best = jobCall.argmaxCall(q);                       // the CARRY argmax
const cost = jobCall.expectedCredit(best / 100, q) - jobCall.expectedCredit(called / 100, q);
```

Those two lines are not in the file. `jobRegret` (now `run.js:1747-1772`) reads:

```js
const { best, cost } = jobCall.regretOf({ call: called, qHat: q, ladder: DEBRIEF_CALL_LADDER.best });
```

with `DEBRIEF_CALL_LADDER = Object.freeze({ best: 'rating', cost: 'rating' })` (`run.js:1599`).
`grep -n 'argmaxCall\|expectedCredit' site/js/screens/run.js` → **2 hits, both inside doc comments**
(`:1558`, `:1580`), and `run-lane-r3.test.mjs` asserts `!/argmaxCall|expectedCredit/` over the
comment-**stripped** `jobRegret` slice, so neither can become a call site. The finding was closed by
this lane's own round 3 (`notes/run-fix.md` §Round 3.1) and the critic measured a pre-20:05 snapshot
of the file. Per REPAIR-DECISION arbiter rule 3 the timestamp is not the argument — the
re-measurement is:

```
$ node … regretOf on the shipped module, inside the band the finding names
q̂=0.885 called 70 → shipped line "EV-max was 85, cost 1.3 rating"   E[c]@85 5.880 > E[c]@95 5.760
q̂=0.890 called 70 → shipped line "EV-max was 85, cost 1.4 rating"   E[c]@85 6.020 > E[c]@95 5.940
```

The rung named is the maximiser of the currency printed, in both of `CALL_DISAGREEMENT_BANDS`. The
critic's own three rows (`EV-max was 95`) no longer reproduce.

**NEGATIVE CONTROL — the test is not blind.** The pins are behavioural (they drive `run.jobRegret`
on a job played through the real phase machine), so I put the exact cited expression back into
`run.js` and re-ran. `scratchpad/runlane/negctl.mjs` reverts the two lines, runs the suites, and
restores the file:

```
reverted f14
✖ run r3 §1 — the call-regret line names and prices the SAME ladder
    ✖ over a 101-point grid of q̂, the named rung is the maximiser of the printed currency
    ✖ inside BOTH published disagreement bands it names the RANK rung, not the money rung
    ✖ the pair is `call.regretOf`’s, not the screen’s — and it is no longer dead code
✖ J6b — both regret lines equal the solver’s value for the realised order (G5 #2)
    ✖ the CALL line names the maximiser of the ladder it prices, and prices it in rating credit
✖ J6b — the laws that must stay structural
    ✖ the debrief is the one surface allowed to name a maximiser rung — and job.js still is not
restored site/js/screens/run.js (byte-identical)
```

**PASS. No code change. Number measured: 6 assertions fail the moment the mismatched pair returns
(9 with finding 44's revert in the same run).**

**One correction to this lane's own earlier record:** `notes/run-fix.md` §Round 3.1 prints
*"q̂ 0.885 NOW «EV-max was 85, cost 5.9 rating»"*. 5.880 is `E[c](.85)` itself, not the gap; the
shipped line prints **1.3**. The rung and the verdict in that note are right; the cost figure in that
one illustrative row is not.

---

## 44 — MAJOR · player-feel · two quantities under one word (`posted`) → **REFUTED as live (already fixed); the critic's analysis was right**

The finding quotes `run.js:2311` printing `posted 956` under `COPY.deflation`'s *"posted falls as you
master the material"*, three lines under the job's own `Posted 516`. The shipped `tomorrowLine`
(`run.js:2326-2338`) prints:

```
Tomorrow’s board: 43 cold locks on VOC + FAC2 · worth 902 if you took them all · …
```

```
$ grep -c 'posted' <the body of tomorrowLine, `${t.posted}` excluded>   → 0
$ grep -o "fact('Posted',[^)]*)" site/js/screens/run.js                 → 1 hit, fed `job.posted`
```

One word, one quantity. Closed by `notes/run-fix.md` §Round 3.2.

**NEGATIVE CONTROL.** Reverting the clause to `` clauses.push(`posted ${t.posted}`) ``:

```
reverted f44
✖ run r3 §2 — the debrief never prints two different quantities under one word
    ✖ the backlog figure is not called `posted`, and says what it is instead
    ✖ the only `posted` NUMBER on the debrief is the drafted job’s
    ✖ the empty and singular boards still read as sentences
✖ run r1 §3 — the debrief prints tomorrow's board
    ✖ the line is G5's own shape, and every clause drops on its own
restored site/js/screens/run.js (byte-identical)
```

**PASS. No code change. Number measured: 4 assertions fail when the word comes back.**

---

## 63 — MINOR · ledger-invariance · `commitJobRun`'s once-per-page guard is inert on the snapshot-free branch → **CONFIRMED, REPRODUCED, FIXED**

**Reproduced first, on the critic's own arm** (`scratchpad/runlane/probe63.mjs`: play a job through
the real phase machine, then render the debrief three times through `jobSummaryContext`, once with
the held snapshot and once with `before` omitted — `screens/job.js:1626`'s `jobBefore ?? undefined`):

```
BEFORE
--- A: with the held before-snapshot (the normal path): debrief rendered 3x
  runs=1  forecastLog=1  pageIndexFor(today)=1
--- B: `before` omitted (screens/job.js `jobBefore ?? undefined`): debrief rendered 3x
  runs=3  forecastLog=1  pageIndexFor(today)=3
  runs[].startedAt = 1789596603000, 1789596603000, 1789596603000
```

The mechanism is exactly as the critic states. `jobSummaryContext` builds its fallback snapshot
**fresh on every call**, so (i) `before.runRecorded = true` is stamped on an object that is then
discarded, and (ii) `startedAt` is 0, so `jobRunRecorded`'s `if (!(startedAt > 0)) return false`
returned **before** the `runs[]` scan it guards ever ran. `runs` is in `js/job/state.js`'s
`LEDGER_A_KEYS` and `page.pageIndexFor` counts page runs to seed the NEXT page, so the duplicate
changes what the student is dealt tomorrow.

**THE FIX, at the root** (`site/js/screens/run.js`, `commitJobRun` + `jobRunRecorded`): the dedupe
key is now **the identity the row is written with**, computed before the guard rather than after it.

```js
const stamp = num(debrief.at, 0) || num(save?.game?.ledger?.debriefAt, 0);  // the MACHINE's stamp
const submittedAt = stamp || num(opts.now, 0) || Date.now();
const runKey = startedAt || stamp || submittedAt;
if (jobRunRecorded(save, runKey, before, stamp)) return null;
…
startedAt: runKey, submittedAt, results,      // the row is keyed on what the guard scanned for
```

and the scan matches either half of that identity:

```js
return runs.some((r) => isObj(r) && r.kind === 'page'
  && ((key > 0 && num(r.startedAt, 0) === key) || (stamp > 0 && num(r.submittedAt, 0) === stamp)));
```

Three decisions worth stating, because each is a place this could have gone wrong:

| decision | why |
|---|---|
| the anchor is `game.ledger.debriefAt`, not a render clock | `state.endJob` writes it (`js/job/state.js:1839`) in the statement that closes the page, so it is the same value on every re-render of one debrief and it is recoverable with no snapshot at all. `job-save.test.mjs` already pins it as declared, defaulted and coerced |
| `stamp` is kept **apart from** `submittedAt` | only the machine's own stamp may serve as an identity. If `opts.now`/`Date.now()` could, two genuinely different pages committed at one fixture clock would collide — the guard would suppress a real second record |
| the written record is **byte-identical** to before | `runKey === startedAt` whenever a snapshot exists, and `=== submittedAt` when it does not, which is what `startedAt: startedAt \|\| submittedAt` already wrote. The r2 shape, the seven reserved G7 game fields and the save budget are untouched |

**ACCEPTANCE TEST — written first, watched fail, then fixed.** `tests/run-lane-r3.test.mjs` §3, five
tests. Against the unfixed code, **three of them fail**, and they fail on three different mechanisms
(the count, the return value, and the scan being reached at all):

```
BEFORE (negative control, no patching — the shipped code)
✖ WITHOUT it — `screens/job.js`’s `jobBefore ?? undefined` branch — still exactly one
    AssertionError: three renders on the snapshot-free branch wrote 3 page records
    actual: 3, expected: 1
✖ the second commit returns null because it FOUND the first row, not because it gave up early
    AssertionError: a second commit with no snapshot must be refused by the save, which is the
    only witness left  — actual: {…}, expected: null
✖ the `runs[]` scan is REACHED with no snapshot — it is not the `startedAt > 0` early-out
    AssertionError: the scan must find the page this job already closed
ℹ tests 15 · pass 12 · fail 3
```

The third one is the one that names the defect rather than its symptom: it pushes the page row into
`runs[]` **by hand** (`pushRun(makeRunRecord(…))`, keyed on the job's terminal stamp) so the
in-memory flag cannot be what refuses the write — only the scan can. It also asserts the guard is an
identity and not a latch: a genuinely different page on the same save is still recorded (`runs === 2`).

```
AFTER
ℹ tests 15 · pass 15 · fail 0

$ node scratchpad/runlane/probe63.mjs
--- A: with the held before-snapshot (the normal path): debrief rendered 3x
  runs=1  forecastLog=1  pageIndexFor(today)=1
--- B: `before` omitted (screens/job.js `jobBefore ?? undefined`): debrief rendered 3x
  runs=1  forecastLog=1  pageIndexFor(today)=1
```

**PASS. Numbers measured: `runs` 3 → 1 and `pageIndexFor(today)` 3 → 1 on the snapshot-free branch;
arm A unchanged at 1 / 1 / 1.**

**Residual, named not closed.** A save with **no game ledger at all** (`debriefAt === 0` and no
`debrief.at`) still has no stable identity, so `submittedAt` falls back to a render clock and two
renders would write two rows. No job the app can play reaches that state — `endJob` always stamps
`debriefAt` — and §3's first test pins that the stamp is there (`> 0`) so the anchor cannot be
removed silently. Closing it properly is `notes/run-fix.md` Request 1 (carry the terminal `at` on
`debriefOf`), which belongs to the `state` lane.

---

## Spec corrections (for the doc owner — no file was edited)

One published claim in `COMPOSED-GAME.md` is falsified by the shipped code, and the code is right.
It was already raised as `notes/run-fix.md` round 3 Request 3; it is restated here in the exact form
the ticket asks for.

**OLD (`COMPOSED-GAME.md:637`, G5 #1) — the exact substring:**

> `Tomorrow's board: 7 cold locks on ASN-PLP + CS-LIN · posted 186 · FIGURES has been safe 3 jobs running · bringing dropped-gcf, middle-term`

**NEW:**

> `Tomorrow's board: 7 cold locks on ASN-PLP + CS-LIN · worth 186 if you took them all · FIGURES has been safe 3 jobs running · bringing dropped-gcf, middle-term`

*Reason:* finding 44. The sample is a 7-lock board, where the backlog **is** a job and `posted` reads
correctly; on a real backlog `dueList` returns the whole queue with no draft and no shape cap, so the
number is 1.9× the job's own `Posted` fact printed eight lines above it, under
`COPY.deflation`'s *"posted falls as you master the material"*. The screen now reserves the word
`posted` for the job's own figure and names the backlog for what it is. `tomorrowLine`'s clause order
is otherwise the published order, clause for clause.

---

## Requests

1. **`site/data/job.js` + `tests/job-call.test.mjs` (the `call` lane) — finding 40 (BLOCKER) is
   real, it lives in the copy's unit word, and this lane cannot close it.**

   `COPY.regret2` ends *"cost N rating."* while `N` is a **credit** gap. One call's effect on the
   printed rating is `RATING.scale · w · c / RATING.N = w·c/25`, so the printed number overstates the
   rating cost by `25/w`:

   ```
   RATING: N=50 scale=2 weightK=4
   q̂=0.55  called 70 → "EV-max was 50, cost 0.8 rating"  w=0.9900  real rating points 0.0317  25.3×
   q̂=0.80  called 70 → "EV-max was 85, cost 0.3 rating"  w=0.6400  real rating points 0.0077  39.1×
   q̂=0.885 called 70 → "EV-max was 85, cost 1.3 rating"  w=0.4071  real rating points 0.0215  61.4×
   q̂=0.890 called 70 → "EV-max was 85, cost 1.4 rating"  w=0.3916  real rating points 0.0216  63.8×
   ```

   The finding's two options are not symmetric, and the arithmetic is why this is filed rather than
   fixed:

   - **Relabel the unit** (`cost 1.3 credit`) — correct, and entirely inside the `call`/copy lane's
     own files. It costs three literal-string updates, listed below.
   - **Convert the number to rating points** — *rejected here, on measurement*: the value becomes
     0.008–0.032, `jobRegret`'s own `Math.round(cost*10)/10 > 0` gate then prints **no line at all**
     on every case above, and G5 #2's published worked line (*"cost 0.3 rating"*) stops reproducing.
     A unit fix must not delete the teaching line.

   If the relabel ships, exactly three assertions in this lane's files move with it and I will move
   them on request (they are deliberately NOT pre-loosened — the word is a published claim and a
   silent drift in it should be red):
   `tests/run-lane-r3.test.mjs:122` (`/cost 0\.3 rating\./`), `tests/run-lane-r3.test.mjs:175` and
   `tests/job-debrief.test.mjs:306` (both the full G5 #2 sentence). Plus `COMPOSED-GAME.md` G5 #2 and
   `tests/job-call.test.mjs:966`, which are yours.

2. **`tests/job-call.test.mjs` (the `call`/`tests` lane) — REPAIR-DECISION §S1.3 item 1's lint does
   not pass as written, and two of its four hits are in this lane's file.** The decision says *"grep
   every file under `site/js/` for `before:` outside comment lines and assert the result set is
   EMPTY … Today that is green"*. Measured with the suite's own comment stripper
   (`tests/_helpers.mjs stripCommentsAndStrings`):

   ```
   literal `before:` hits under site/js after stripping comments: 4
     site/js/job/call.js:777       before: cut ? before : null,
     site/js/screens/job.js:1626   … jobSummaryContext(getState(), d, { queue: jobQueue, before: jobBefore ?? undefined })
     site/js/screens/run.js:857    … p.meta = { …, before: snap }
     site/js/screens/run.js:1821   … ip.meta = { …(isObj(ip.meta) ? ip.meta : null), before: snap }
   ```

   None of the four is a `qHatDetail` option: `call.js:777` is `qHatDetail`'s own **return** value,
   and the other three are the Page's `inProgress.meta.before` snapshot, which predates the game
   layer and has nothing to do with the q̂ cut. **Aim the lint at the call sites, not at the token** —
   e.g. scan for `before:` inside a `qHatDetail(`/`callEntry(`/`qHatFor(` argument list, or assert
   the property is absent from every options object passed to those three functions. The invariant
   S1 rests on is true (verified below); a grep that fails on an unrelated word will be "fixed" by
   the next round in the wrong place, most likely by renaming a key in this lane's file.

3. **`COMPOSED-GAME.md` (the `meta` lane) — finding 61's replacement text is correct and depends on
   this lane's `commitJobRun` continuing to exist.** Its fix paragraph names
   `screens/run.js commitJobRun`, called by `jobSummaryContext`, as what writes a completed job's
   page record, daily-goal check and forecast point. That is exactly what ships, it is now
   idempotent on **every** branch (finding 63 above), and `tests/run-lane-r2.test.mjs` +
   `tests/run-lane-r3.test.mjs` §3 are the tests to cite.

---

## Verified, no action (claims about this lane's files in other lanes' findings)

- **REPAIR-DECISION §S1.1 item 2** — *"`screens/run.js:2151` … passes only `{ cards }` and therefore
  takes the sealed default"*. **True**, at `run.js:2174` in the current file:
  `qHatOf: (c) => (c?.skill ? jobCall.qHatFor(save, c.skill, { cards: cardById }) : null)`.
  `grep -n 'qHatDetail\|callEntry' site/js/screens/run.js` → 0 hits; the debrief reads q̂ only
  through `qHatFor`, with no `before` option, so it takes `call.js`'s own seal-defaulted cut. Nothing
  in this lane opts out of the propriety invariant.
- **Finding 33 (screen lane, `site/js/sound.js`)** — greps `screens/run.js` for a `sound.js` import
  and finds none. Correct, and the remedy is in `sound.js` + `screens/job.js`: the debrief's own
  juice (`startBagDrop`, the guard bars) is animation, not audio, and G6's four cues are fired at
  call-lock / chain tick / vault resolve / bag drop, none of which this screen owns.
- **Finding 71 (tests lane, `qa/job-screen.mjs`)** — *"`site/index.html:5` carries no
  `interactive-widget` in the viewport meta, so Chrome's default (resizes-visual) applies too"*.
  True, and the finding's own fix is to make the harness measure the **visual** viewport rather than
  to add the token. `site/index.html` is unchanged: adding `interactive-widget=resizes-content` would
  change the app's real keyboard behaviour to make a harness's wrong model true, which is backwards.
- `site/js/app.js` and `site/index.html` needed no edit this pass. No finding is filed against
  either, and finding 13's `app.js` citation is only *"`#/settings` is a live route"* (`app.js:31`,
  `:345`) — true, and the remedy is in `screens/job.js`.

---

## Tests

| command | before | after |
|---|---|---|
| `node --test tests/run-lane-r3.test.mjs` | tests 15 · pass 12 · **fail 3** | **tests 15 · pass 15 · fail 0** |
| every suite that reads `screens/run.js` (`run-lane-r1/r2/r3`, `job-debrief`, `job-ledger`, `job-save`, `job-split`, `run`, `fix5-run`, `page`, `page-r2`, `job-index`) | — | **tests 388 · pass 384 · fail 0 · skipped 4** |
| `node --test tests/no-random.test.mjs tests/coverage.test.mjs` | — | **135 · 135 · fail 0** |
| `node --test tests/` (22:33, before any edit) | **tests 2725 · pass 2719 · fail 2 · skipped 4** | — |
| `node --test tests/` (22:53, after) | — | **tests 2793 · pass 2787 · fail 2 · skipped 4** |

No test was deleted, skipped, weakened or re-messaged in this pass. §3 is five new tests; the rest of
`run-lane-r3.test.mjs` is untouched. The test total moves 2725 → 2793 because eleven other lanes are
landing their own tickets in the same tree while this ran.

**The two remaining failures are not this lane's, and not this lane's files.** Both are in
`tests/job-meta-constants.test.mjs` — *"the same-wing run rule is printed with the exception that
really overrides it"* (`:464`) and *"Stats no longer promises that a job legalises an over-budget
build"* (`:680`) — i.e. the `meta` lane's copy lints against `screens/settings.js` /
`screens/stats.js`, mid-flight as S4's crew removals land.
`grep -c 'screens/run.js' tests/job-meta-constants.test.mjs` → **0**.

Three other failures were observed and each one resolved on its own, in another lane's file, while
this ticket ran — recorded so the sequence is on the audit trail rather than looking like flakiness:

| failure | lane | resolution |
|---|---|---|
| `job-call.test.mjs` *"a mastered student keeps Called 5…"* (baseline) | `call`, S3 | green by 22:53 |
| `job-screen.test.mjs:875` *"J6 measured … keyboard open"* (baseline) | `screen`, S0 | green by 22:53 |
| `job-save.test.mjs:278` *"ZERO DATA LOSS"*, then *"failed to load"* | `save` | `settings.game` + `archivedGameBytes` landing; **66/66 standalone at 22:42** |
| `job-week.test.mjs:171` *"Home's static gate agrees…"* | `week`/`screen` | reads `screens/home.js` off disk, which was rewritten at 22:45 mid-run; **104/104 standalone** |

`grep -n 'settings.game' site/js/screens/run.js site/js/app.js site/index.html` → 0 hits, so none of
those four can be reached from this lane's files.

## Open issues

- **Finding 40 is open and it is a BLOCKER.** It is assigned to `call` and its only correct remedy
  lives in `site/data/job.js` + `tests/job-call.test.mjs` + `COMPOSED-GAME.md` G5 #2 (Request 1). One
  consequence of this lane's round-3 ladder fix is worth flagging: with the pair now consistent on
  the rating ladder the printed gap inside the disagreement bands is **larger** than the old mixed
  pair's (1.3 vs 1.2 at q̂ = 0.885), so the mislabelled magnitude got slightly worse, not better. The
  fix is the word, not the number.
- **The deflation claim is still unmeasured** (carried over from round 3). Nothing on the debrief
  shows posted-per-lock over time, so *"posted falls as you master the material"* is an assertion the
  screen never evidences. It is no longer contradicted by the line under it. A per-lock average on
  the tomorrow clause (`worth 902 · ~21 each`) would make it checkable night to night — one clause,
  this lane's file, but a design call rather than a defect fix.
- **The idle number still contains the `endJob → render` transition** (round 1's open issue,
  unchanged): `notes/run-fix.md` Request 1 to the `state` lane makes it exact, and the same request
  closes finding 63's residual above.

---
---

# VERIFY ROUND 1 — the run lane

Owner files: `site/js/screens/run.js`, `site/js/app.js`, `site/index.html` (+ their tests).
**`site/js/app.js` and `site/index.html` needed no change: no finding in this round cites either.**

Five findings: **2 BLOCKERs (2, 4), 3 MAJORs (1, 3, 5). All five reproduced, all five fixed at the
root.** Nothing was refuted this round; every critic's measurement stood up when re-run.

**Baseline, measured before any edit** (`node --test tests/`, 02:1x):
`tests 2817 · suites 370 · pass 2813 · fail 0 · skipped 4 · EXIT=0` — **green**, and larger than the
2725/2721 the ticket quotes (other lanes have added suites since).

Probes and negative controls live in
`/private/tmp/claude-501/-Users-oliver/a4b3cdf7-f4be-4831-9be9-2af12b15793b/scratchpad/runv1/`
(`probe-qhat.mjs`, `probe-midnight.mjs`) — reproduced as real tests in `tests/run-lane-v1.test.mjs`,
which is where they now live permanently. Per notes/scratchpad-tmp-purge: everything load-bearing is
in the test file, not in /tmp.

---

## 1 — MAJOR · call-propriety · the regret line's q̂ was read AFTER the outcome → **CONFIRMED, REPRODUCED, FIXED**

**The mechanism, exactly as the critic states it.** `jobLedgerBlock` passed

```js
qHatOf: (c) => (c?.skill ? jobCall.qHatFor(save, c.skill, { cards: cardById }) : null)
```

`call.qHatDetail` defaults its history cut to `sealedCallOf(save)` — `inProgress.game.locked.at`,
the instant the call was sealed — and the debrief runs *after* `endJob` cleared `inProgress`. No
seal, no cut, so the read came back LIVE and contained the sitting it was judging.

**REPRODUCED FIRST.** The r3 fixture could not see this: `schedule.applyOutcome` writes no
`cards[*].history`, so q̂ was `null` there and every regret test drove `qHatOf` by hand. The new
fixture writes the card-history sitting at grade time exactly as `screens/card.js:922/1001` does,
and reads the sealed q̂ while `g.locked` is still standing — the only moment it exists:

```
$ node scratchpad/runv1/probe-qhat.mjs          (24 jobs × real phase machine, 195 envelopes)
envelopes measured                                   : 195
OLD (live, post-job) q̂ ≠ the q̂ the seal cut          : 86  (44.1 %)
OLD named a DIFFERENT honest rung than the seal did  : 39  (20.0 %)
NEW (sealedQHatOf) q̂ ≠ the q̂ the seal cut            : 0
NEW names the seal's own rung                        : 195 / 195
```

The critic measured 14 % of reachable states over a synthetic enumeration; played through the real
machine it is **20 %**, and the direction is theirs: a miss pushes the live q̂ down, so the line
told the student *you over-called*. `run v1 §1` asserts that direction separately (`down > up`).

**THE FIX** — `screens/run.js`, new export `sealedQHatOf(save, calls, i, opts)` + `jobRegret` now
takes the SAVE instead of a reader. Three levels, in order of what each has to assume:

| level | what it uses | when |
|---|---|---|
| 1 | `c.qHat` | whenever the save carries the seal. `realisedOrderOf` already preferred it; `state.cleanCall` does not store it yet — see Requests. **No change needed here when it lands.** |
| 2 | the cut this target's own sitting implies (`ownSittingAt`) | always, today. A beat grades ONE target and `card.js` writes the sitting before `applyTarget` prices the beat, so the only row on that make in `(previous settle, this settle]` is this target's own. Strictly `<` that stamp drops exactly it. |
| 3 | `null` — **no line printed** | a call the save cannot date. Never a live read. |

A VARIANT target writes `save.variants` and no card history, so no row falls in the window and the
cut is `at + 1` (everything the target could see) — which is the right answer for it, and is also
what makes the function correct in headless fixtures that write no history at all.

**THE SEAL IS PUT BACK, NOT ARGUED AROUND.** The first cut of this fix passed the recovered stamp
as `qHatFor(save, make, { cards, before: cut })` — and went red against `tests/job-call.test.mjs`
S1, *"no q̂ or rating call under site/js passes `before:`"*, which is the `call` lane's round-3
repair and is right: an explicit cut is how a staking caller opts OUT of the seal, and with an
endogenous weight lying pays. **The lint was not touched.** `qHatDetail` reads exactly two things
off a save — `save.cards` and `save.inProgress.game.locked` — and DEFAULTS its cut to that seal, so
the debrief hands it a save carrying the seal this target actually had:

```js
const sealedSave = { ...save, inProgress: { game: { locked: { call: c.call ?? null, n: i + 1, at: … } } } };
return jobCall.qHatFor(sealedSave, c.skill, { cards });
```

`cards` is carried by reference, so this costs one object per envelope, and the read goes through
the module's own sealed default rather than around it — which is what S1 is actually protecting.

`run v1 §1` applies S1's own lexer to this file (no `before:` in the arguments of `qHatFor` /
`qHatDetail` / `callEntry` / `ratingDetail`), lints that `jobLedgerBlock` contains no `qHatOf:` and
no `qHatFor(` at all, and pins that an explicit `qHatOf` still wins so tests can drive the line at a
chosen q̂ (which is what `run-lane-r3.test.mjs` §1 does, unchanged and still green).

`tests/job-debrief.test.mjs`'s mirror moved with the screen (same call, `{save, cards, startedAt}`
instead of the live `qHatOf`), so it still asserts *"the screen prints `jobRegret`'s line"*.

---

## 2 — BLOCKER · ledger-invariance · a Ledger A write dated from Ledger B → **CONFIRMED, REPRODUCED, FIXED**

**REPRODUCED, on the critic's own arm** — a job mounted 23:50 on the 16th, graded across midnight,
`endJob` on the 17th with the mount day:

```
$ node scratchpad/runv1/probe-midnight.mjs      (negative control: the shipped code before the fix)
mount day = 2026-09-16   real day at the end = 2026-09-17
forecastLog : [{"day":"2026-09-15","r":41},{"day":"2026-09-16","r":0}]
daily keys  : 2026-09-16
the 16th's r=44 survived           : false      ← logForecast OVERWROTE it
a point exists for the REAL day    : false
record and forecast agree on a day : false      ← submittedAt said the 17th, the point said the 16th
```

```
$ node scratchpad/runv1/probe-midnight.mjs      (after)
forecastLog : [{"day":"2026-09-15","r":41},{"day":"2026-09-16","r":44},{"day":"2026-09-17","r":0}]
daily keys  : 2026-09-17
the 16th's r=44 survived           : true
a point exists for the REAL day    : true
record and forecast agree on a day : true
```

**THE FIX** is the critic's own: `commitJobRun` derives the day from the machine's terminal stamp,
`todayISO(new Date(submittedAt))` — the identical expression the flat `finish()` uses at l.993-994 —
and the `save.game.log` read is **deleted**. `submittedAt` is `game.ledger.debriefAt`, the instant
`endJob` closed the page, so no Ledger B lookup is needed at all. The mount day keeps its home in
`game.log`; nothing in Ledger A reads it.

`run v1 §2` pins all four halves: the fixture really crosses midnight (asserted, not assumed), the
previous day's `r` survives, a point exists for the real day, the row and the point name ONE day —
plus a lint that `commitJobRun` reads no `game.log` and that both routes still derive the day by the
same expression (it reads the flat `finish()` too, so one route moving alone goes red).

**The second half of the finding — `screens/job.js` capturing `today` once at mount (`:345`, used at
`:1668` and `:1719`) — is NOT this lane's file.** It is filed under Requests. It is no longer a
Ledger A defect (nothing in Ledger A reads that value any more); it remains a Ledger B one: a PWA
left on the board overnight still files `game.log` and `commitFire` under the previous day.

---

## 3 — MAJOR · ledger-invariance · a 45 %-of-a-page row bought "Flawless Page" → **CONFIRMED, FIXED (one line in a file this lane does not own — see Requests)**

Confirmed and re-measured. The r2 arms could not see it because **the control was the job's own
draft**: `playFlat(flat, queue)` in `run-lane-r2.test.mjs` and `runFlatScreen(flat, queue, …)` in
`job-ledger.test.mjs` both take `queue = queueOf(probe)` — the job's drafted queue — so the row was
compared against itself. Against the page `composePage` actually deals:

```
$ node --test tests/run-lane-v1.test.mjs   (run v1 §3, six seeded saves)
  the draft really is a strict subset — mean drafted/composed < 0.9, measured per save
  p1 meta 24 deal 24 queue 10   p2 meta 23 deal 23 queue 7   p3 meta 20 deal 20 queue 7
```

**THE FIX, in two halves, and the first is where the root is.**

1. `screens/run.js` — the row says how much of the page it is. `commitJobRun` writes
   `extra: { drafted, composed, partial }`, where `composed` is **`composePage`'s own tally**
   (`composedCountOf` sums `inProgress.meta.counts`, which `page.js` computes from the ordered
   queue) snapshotted by `captureJobBefore` at job start, and `drafted` is what the job recorded.
   `partial` is therefore a comparison between two numbers the save carries, not a policy. A job
   that deals the WHOLE page is **not** partial and still earns everything the flat route earns —
   which is the repair's real claim, and `run-lane-r2.test.mjs` now pins that case explicitly.
   With no snapshot there is no composed count, the row cannot prove it covered a page, and it says
   `partial: true` rather than claim the stronger thing.
2. `site/data/trophies.js` — `flawless-page` gains `&& r.partial !== true`. **One line, in a file
   this lane does not own** (lanes `meta` / `save`), added under BUILD-POLICY §2 and recorded under
   Requests. Rows written by the flat route carry no `partial` key and are untouched.

**THREE TESTS WERE CORRECTED, NONE WEAKENED.** Each asserted the invariance the critic falsified,
and each was corrected in the direction the finding names ("assert the item count of the row against
the item count of the page `composePage` deals for the same save, not against itself"):

| test | was | is |
|---|---|---|
| `run-lane-r2` *THE BLOCKER* | both arms earn `flawless-page`, control = the job's own draft | control = `composePage`'s deal; the drafted/composed gap is asserted; the trophy follows the page — **plus a new arm proving a whole-page job DOES earn it** |
| `run-lane-r2` *the record IS the flat record* | `deepEqual(shape(job), shape(flat))` | same `deepEqual`, with the size triple moved into `shape`'s drop list **and asserted positively against `composePage`** — strictly more is compared than before |
| `job-ledger` *THE RUN RECORD* / *THE TROPHIES* | `runShape` compared the triple; `jobT.includes('flawless-page')` | `runShape` drops it the way it already drops `seed`; the triple is asserted against `composedCountOf`; the trophy is asserted to follow the page in BOTH directions, and **every other trophy the flat play earns is still required** |

Nothing was deleted, skipped, or given a looser predicate: every assertion that survived is the same
assertion, and four new ones were added. `job-ledger.test.mjs` belongs to the `tests` lane — the
edit is minimal (its `runShape` drop list, two measured assertions, one exception filter) and is
filed under Requests for that lane to review.

---

## 4 — BLOCKER · player-feel · two ranks for one rating on one screen → **CONFIRMED, FIXED**

Confirmed exactly as written: `run.js:2103` was `jobCall.rankNameFor(ratingAfter)` — the bare band
lookup — feeding both the `.sum-job-walk` line and the `Rating` fact, while `.sum-job-rating` read
the HELD rank. After S3 the band is not the rank a save holds (`applyTarget` floors `p.rank` on the
rank already held, `state.js:1184`), so the two disagree the moment the rating falls below its band.
Modal, not a corner: `store.fresh()` ships `player.rank = 2` and `rating.value = 5.00`.

**THE FIX is structural rather than a second floor.** One function, `heldRankName(save, rating)`,
and BOTH surfaces call it:

```js
function heldRankName(save, rating) {
  return jobCall.rankOf(num(save?.player?.rank, jobCall.rankFor(num(rating, 5)))).name;
}
```

A third surface can now only be wrong by not calling it. This also closes a divergence the critic's
own suggested patch would have left: the two sites defaulted differently for a save carrying no
`player.rank` at all (`rankFor(rating)` vs a hard `2`), which is a second way to print two words.
`rankNameFor(` now appears **nowhere** in `screens/run.js` — `run v1 §4` asserts the count is 0 over
the whole file, which is the same guard the critic asked for at `job-meta-constants.test.mjs:299`
but pinned in this lane's own file (see Requests for widening theirs).

The `Rating` fact's delta is untouched: it is a RATING delta, the rating does fall, and only the
rank WORD is floored.

**The behavioural assertion the finding asked for is in `tests/job-debrief.test.mjs`** — on a real
rendered debrief, the rank word in `.sum-job-walk` must equal the rank word in `.sum-job-rating`,
must equal `rankOf(save.player.rank).name`, and must appear in the `Rating` fact.

---

## 5 — MAJOR · player-feel · "posted falls" printed beside a figure 2.3× tonight's → **CONFIRMED, FIXED**

Round 3 renamed the backlog figure (`worth N if you took them all`); the verify round measured that
renaming a number does not fix a sentence standing next to it, because **reading order is the
claim**. Both of the critic's suggested repairs go through `tomorrowLine`, whose exact output is
pinned by four `assert.equal` calls in `run-lane-r1.test.mjs` §3 and `run-lane-r3.test.mjs` §2 — so
either would have meant rewriting pinned expectations for a line that is not itself wrong.

**The sentence moved instead.** `COPY.deflation()` is now the last line of `jobTakeBlock`, directly
under that block's own `Posted` fact — the one place on the debrief where `posted` means what the
sentence means, on tonight's basis. `jobLedgerBlock` and `jobTomorrowBlock` no longer build it;
`h('p.sum-job-deflation'` appears exactly once in the file. `tomorrowLine` is untouched, so every
pinned expectation still holds.

The pin the critic asked for ("a test asserting the debrief never prints the deflation sentence
within one section of a posted figure on a different basis") is behavioural, on a rendered debrief:
the sentence's `[role="group"]` is **The take**, that section contains `Posted`, and it does **not**
contain the tomorrow line. Source-level pins in `run v1 §5` keep the take block from ever reaching
for `tomorrowBoard` / `tomorrowLine` / `dueList`.

---

## Requests

1. **`site/data/trophies.js` (lanes `meta` / `save`) — ALREADY MADE, one line, BUILD-POLICY §2.**
   `flawless-page`'s predicate gained `&& r.partial !== true`, with the reason in a comment beside
   it. If that file is being rewritten in this round, please carry the clause: without it finding 3
   reopens, and `tests/run-lane-v1.test.mjs` "THE GATE" goes red.
2. **`site/js/screens/job.js` (lane `screen`) — re-read `todayISO()` at the terminal.** `:345`
   captures `const today = todayISO()` at MOUNT and `:1668` (`endJob`) and `:1719` (`commitFire`)
   still use it. Ledger A no longer reads it (finding 2 is closed), but a PWA left on the board
   overnight still files `game.log` and the COMMIT under the previous day. One line at each call
   site: `{ now: now(), day: todayISO() }`.
3. **`site/js/job/state.js` (lane `state`) — store the sealed q̂ on the call entry.** `cleanCall`
   (`:340`) keeps `{call, ok, w, skill, rung, d, at}`; `applyTarget` already computes `qHat` one
   line above the push (`:1172`). Adding `qHat: num(c?.qHat, null)` to `cleanCall` and `qHat` to the
   push makes `run.sealedQHatOf` level 1 (it already prefers `c.qHat`) and retires the history
   reconstruction. It also makes the debrief's q̂ recoverable on a save whose card history has since
   been trimmed by `store.applyCaps`.
4. **`tests/job-meta-constants.test.mjs:299` (lane `tests`) — widen the rank guard to run.js.** The
   S3 lint covers only `stats.js` + `settings.js`. `tests/run-lane-v1.test.mjs` §4 now guards
   `screens/run.js` (no `rankNameFor(` anywhere in the file); folding run.js into that `prose(...)`
   union would put all three surfaces under one guard.
5. **`tests/job-ledger.test.mjs` (lane `tests`) — review the three edits above.** They are listed in
   the table in §3. The intent was to keep every existing assertion and add measured ones; if the
   `tests` lane would rather own the correction, the invariant to keep is *the trophy follows the
   page, in both directions, measured against `composePage` rather than against the row*.

## Not fixed, and named rather than left silent

- **The job and the flat page compose slightly different pages.** `job/board.js composeInputsFor`
  passes `{q, tier4, microFlashOnly}` to `composePage`; `screens/run.js:824` drops `q` on purpose
  ("page.js derives the identical target itself"). So `#/run/job` and `#/run/page` can deal pages of
  different lengths for the same save. That is upstream of everything in finding 3 and belongs to
  the `board` lane; this lane's `composed` is measured against the page the JOB drafted out of,
  which is the honest comparator for "did this job deal its whole page".
- **The idle number still contains the `endJob → render` transition** (round 1's open issue,
  unchanged) — Request 3 in notes/run-fix.md closes it.

---

## Test state at hand-off (verify r1)

**This lane is green.** Every suite that covers a file this lane owns, or that this lane edited:

```
$ node --test tests/run-lane-r1 run-lane-r2 run-lane-r3 run-lane-v1 job-debrief job-ledger \
                trophies run job-copy no-random page page-r2
ℹ tests 398 · suites 42 · pass 398 · fail 0 · skipped 0
```

`tests/job-debrief.test.mjs` includes the chromium arms (31/31), so the rank pin and the deflation
pin are measured on a rendered debrief, not inferred from source.

**The whole tree is NOT green, and none of it is this lane.** `node --test tests/` at 03:0x:

```
ℹ tests 2896 · pass 2865 · fail 27 · skipped 4
```

All 27 are in suites whose subject modules other fixers are editing right now — every one of these
files moved AFTER this lane's baseline run, and several moved again while the run above was going:

```
02:47 site/data/trophies.js     03:04 site/js/job/econ.js     03:07 site/js/job/call.js
02:53 site/js/screens/job.js    03:08 site/js/job/board.js    03:09 site/js/job/crew.js
```

| suite | failures | subject |
|---|---|---|
| `job-econ` | 11 | `pushMinusBag`, `breakevenQ`, the printed q* table, `carryFor`/`missFor` — `js/job/econ.js` |
| `job-week` | 6 | `mockCall` credit, `w = 1.0`, the rank a Mock slot buys — `js/job/call.js` |
| `job-board` | 3 | the board's printed NET posted, the primary's letters — `js/job/board.js` |
| `job-call`, `job-exploit`, `job-monotone`, `job-screen`, `job-shape-measured`, `mock`, `job-meta-constants` | 1 each | a decimal literal in `call.js`; an rng-import lint over the payoff modules; the q* of 0; `ratingDetail`'s floor; a withdrawn G3.2 sentence in `COMPOSED-GAME.md` |

Not one of those assertions names the run record, the day a write is filed under, the rank word, the
deflation sentence or the q̂ recovery. The three that import `screens/run.js` import `sessionSplit`
(`job-week`), the `KIND_META`/`DELEGATES` entries (`job-screen`) and `realisedOrderOf` in a comment
(`job-econ`) — none of which this round changed.

**Evidence that this is churn and not a regression:** the first full run of this session
(`scratchpad/runv1/full1.txt`, taken after every production edit above) showed 30 failures INCLUDING
`J6b — the realised order reconstructs the job the student actually played` (3) and `J6b — MEASURED
(chromium)` (1). With no further edit to `screens/run.js`, both suites went green as soon as
`js/job/econ.js` settled. The same is expected of the 27 once the econ, call and board lanes finish.

**Re-measured once more at 03:1x, with no further edit from this lane** — the churn is draining, as
predicted, and the shape of what is left is unchanged:

```
ℹ tests 2910 · pass 2888 · fail 18 · skipped 4          (was 30, then 27, now 18)
  7 tests/job-econ.test.mjs   5 tests/job-week.test.mjs   2 tests/job-call.test.mjs
  1 each: tests/mock.test.mjs  tests/job-monotone.test.mjs  tests/job-meta-constants.test.mjs
          tests/job-align.test.mjs
```

Still zero in `run-lane-r1/r2/r3/v1`, `job-debrief`, `job-ledger`, `trophies`, `run`, `page`,
`page-r2`, `job-copy`, `no-random`. `site/js/app.js` and `site/index.html` are byte-unchanged this
round.

## Files changed (verify r1)

| file | owner | what |
|---|---|---|
| `site/js/screens/run.js` | this lane | findings 1-5: `sealedQHatOf` + `ownSittingAt` + `jobRegret` takes the save; `commitJobRun`'s day and its `extra`; `composedCountOf`; `captureJobBefore.composed`; `heldRankName` (both surfaces); the deflation sentence moved into `jobTakeBlock` |
| `tests/run-lane-v1.test.mjs` | this lane | **new** — 23 tests, five sections, one per finding |
| `tests/run-lane-r2.test.mjs` | this lane | the two arms the finding names, corrected against `composePage`; one new arm for the whole-page job |
| `tests/job-debrief.test.mjs` | this lane | the regret mirror follows the screen; two new behavioural pins (one rank word; the deflation sentence's section) |
| `site/data/trophies.js` | `meta`/`save` | **one line** — `flawless-page` gains `&& r.partial !== true` (BUILD-POLICY §2, Requests 1) |
| `tests/job-ledger.test.mjs` | `tests` | `runShape`'s drop list + three measured assertions + one exception filter (Requests 5) |

---
---

# VERIFY ROUND 2 — the run lane

Owner files: `site/js/screens/run.js`, `site/js/app.js`, `site/index.html` (+ their tests).
**`site/js/app.js` and `site/index.html` needed no change again: no finding in this round cites
either, and nothing in the four repairs below is reachable from them** (`grep -n 'pageSizeExtra\|
draftedCountOf\|Decisions\|COPY.regret' site/js/app.js site/index.html` → 0).

Four findings: **2 BLOCKERs (1, 3), 2 MAJORs (2, 4). All four reproduced; all four fixed at the
root.** Nothing was refuted. Two of the four are in files this lane does not own and are marked as
such below (BUILD-POLICY §2).

**Baseline, measured before any edit** (`node --test tests/`, 05:5x):
`tests 2920 · suites 386 · pass 2916 · fail 0 · skipped 4 · EXIT=0` — **green**, and larger than the
2725/2721 the ticket quotes (eleven other lanes have added suites since).

Probes, negative controls and the full measurement scripts are in
`…/scratchpad/runv2/` (`walkloop.mjs`, `partial3.mjs`, `decisions.mjs`, `negctl.py`, `negctl2.py`).
Per notes/scratchpad-tmp-purge everything load-bearing is reproduced as a real test, in
**`tests/run-lane-v2.test.mjs`** (new, 10 tests) and in `tests/run-lane-r2.test.mjs` (one new arm).

---

## 1 — BLOCKER · ledger-invariance · a game decision changed `save.trophies` → **CONFIRMED, REPRODUCED, FIXED**

**Reproduced first, on the critic's own arm** (`scratchpad/runv2/walkloop.mjs`: one corpus save,
both arms all-CLEAN, the same ten drafted targets, played through the real phase machine and ended
through the real screen terminal):

```
BEFORE
composed page for this save: 11
ARM crack: outcome=completed complete=true left=0 inProgress=null drafted=10 composed=11
  runs: 1 [{kind:page, items:10, drafted:10, composed:11, partial:true}]
  trophies: chain-8                       flawless-page: false
ARM walk : outcome=walked    complete=false left=1 inProgress=LIVE   drafted=10 composed=11
  runs after the walk: 0            (commitJobRun refused: complete !== true)
  after finishing flat: {kind:page, items:10}          ← no `partial` key at all
  trophies: chain-8,flawless-page         flawless-page: TRUE
```

Same page, same ten items, same clean answers, same XP — and **walking one target early was worth
one study trophy.** The route is not a deep link: `run.js:1419` renders the **Today's Page** button
exactly when `job.left > 0`, which is exactly when a walk happened.

**THE FIX, at the root — the size provenance is the PAGE'S, not the terminal's.**
`screens/run.js pageSizeExtra(before, queue, results)` reads `composed` off the before-snapshot the
drafted page already carries (`captureJobBefore` → `composedCountOf`, in `inProgress.meta.before`,
which survives both a walk and a reload) and is called by **both** writers:

| writer | when |
|---|---|
| `commitJobRun` (the job terminal) | a completed job |
| `finish()` (the flat terminal), read **before** `finishPage(s)` nulls `inProgress` | any page the board drafted, however it was closed |

`null` when the page carries no composed count — i.e. every page the game never drafted — so the
study route's row is unchanged key for key. No new key is added to the save: `composed` was already
there and already priced (`tests/_helpers.mjs GAME_META_FIELDS`), and `drafted` is derived from the
queue rather than stored.

```
AFTER
ARM crack: runs row {items:10, drafted:10, composed:11, partial:true}   trophies: chain-8
ARM walk : runs row {items:10, drafted:10, composed:11, partial:true}   trophies: chain-8
```

**ACCEPTANCE TEST** — `tests/run-lane-r2.test.mjs` *"THE WALK: a job walked at the getaway and
finished flat earns exactly what the completed job earns"*. It plays the job, WALKS at the getaway,
finishes the remainder through the flat path and asserts `deepEqual(walkTrophies, crackTrophies)`,
plus the row triple, plus two negative controls (a page the board never drafted grows no `partial`
key; a real whole flat page still earns the trophy).

**`finish()` lives inside `mountCardRun` and needs a DOM**, so that arm transcribes it — which is
exactly the shape of arm that cannot fail for the reason it claims. It is tied back to the source in
the same test, the way `job-split.test.mjs` ties the debrief's own lines: the call must be there, it
must be **before** `finishPage(`, and its value must be what the row is stamped with.

**NEGATIVE CONTROLS** (`negctl.py`, which restores the file and prints `byte-identical`):

```
$ python3 negctl.py walk     # the flat terminal stamps nothing again
  ✖ THE WALK: … — "the flat terminal no longer reads the page’s own size provenance"
$ python3 negctl2.py extra   # the shared mechanism: pageSizeExtra returns null
  ✖ THE RUN RECORD (job-ledger) · ✖ THE BLOCKER, re-measured · ✖ commitJobRun honours the `composed`
  ✖ THE HATCH IS REAL · ✖ …but on a REAL page it is out of reach · ✖ the record a job writes IS the
  ✖ THE WALK · ✖ run v2 §2 ×2                                     → 9 assertions, 3 files
```

**PASS. Numbers measured: `flawless-page` true → false on the walk arm; the two arms' trophy sets
now `deepEqual`; both rows `{drafted:10, composed:11, partial:true}`.**

**Spec half (LANDED, not a request).** `COMPOSED-GAME.md` §3.7 proof 11 and G12 #64 published *"a
completed job now writes the same forecast point, `runs[]` record and daily-goal check that
`#/run/page` writes"*. The record was **not** the same and the difference was load-bearing. Both
sites now state it correctly, and `designs/SPEC-CORRECTIONS.md` **R-2** records the change and marks
**M-4** superseded in part. (File owned by the `doc`/`meta` lane — BUILD-POLICY §2; the edits are
two sentences and are listed verbatim in R-2.)

---

## 2 — MAJOR · ledger-invariance · `partial` compared ANSWERS to ITEMS → **CONFIRMED, REPRODUCED, FIXED**

`page.requeueReview` splices a **second copy** of every missed review into the queue, so a miss added
an entry to `results` without adding one card of coverage, while `composed` is `composePage`'s count
of DISTINCT items. Two units, and it moved the wrong way: the more the student missed, the more of
the page the row claimed.

**Reproduced** (`scratchpad/runv2/partial3.mjs`: 4 shapes × 4 answer policies × 40 corpus saves,
real boards, played `startJob → lockCall → applyTarget → push/brief/crack → endJob → the screen
terminal`):

```
completed jobs: 640
BEFORE (drafted = results.length): rows that WOULD be partial:false: 20, ALL of them covering fewer
distinct items than the page holds:
   {"shape":"JOB",  "policy":"missHeavy","i":7, "oldDrafted":18,"distinct":10,"composed":18}
   {"shape":"JOB",  "policy":"missHeavy","i":37,"oldDrafted":17,"distinct":10,"composed":16}   ← 17 of 16
   {"shape":"JOB12","policy":"miss",     "i":37,"oldDrafted":16,"distinct":12,"composed":16}
   {"shape":"JOB12","policy":"missHeavy","i":4, "oldDrafted":21,"distinct":12,"composed":21}
AFTER: rows stamped partial:false: 0        same-board clean/miss pairs: 160, miss reports more: 0
```

One row claimed **17 of a page that holds 16**.

**THE FIX** — `screens/run.js draftedCountOf(ip|queue)`: coverage counted in `composed`'s own unit.
A requeued copy is the only queue entry carrying `requeued > 0` (`page.js requeueReview`) and
`composePage` composes none, so *"the entries this run was dealt"* is exactly *"the entries with no
requeue stamp"* — the same unit `meta.counts` sums. `partial` is then `drafted < composed` between
two numbers of one kind.

**THE TWO PINS THAT COULD NOT SEE IT ARE CORRECTED, NOT DELETED.** `tests/job-ledger.test.mjs:813`
read `rec.drafted === rec.items.length` and `tests/run-lane-r2.test.mjs` read
`rec.partial === (rec.drafted < deal)` — the implementation restated. Both now assert the unit
(`drafted === |{distinct ids in items}|`, `drafted ≤ items.length`, `drafted ≤ composed`), the
corpus property is new in `run-lane-v2.test.mjs` §2 — *"a miss-heavy job never reports more of the
page than a clean one on the SAME board"* — and `job-ledger.test.mjs`'s arm additionally asserts
`jobAnswers.length > queue.length` so that arm cannot pass vacuously on a play that re-answered
nothing.

**NEGATIVE CONTROL** (`negctl.py unit`, `drafted` counted in answers again):

```
✖ THE RUN RECORD (job-ledger) — "`drafted` must be the DISTINCT items the row covers"
✖ run v2 §2 — "RUN/save 0: the row reports 9 of coverage over 6 distinct items"
✖ run v2 §2 — "40 of 40 boards report MORE coverage for the arm that missed more"
✖ run v2 §2 — pageSizeExtra's requeue case
```

**PASS. Numbers measured: dishonest `partial:false` rows 20 → 0 over 640 played jobs; boards where
the miss arm out-reports the clean arm 40/40 → 0/40.**

---

## 3 — BLOCKER · split-honesty · the debrief printed two bases on one line → **CONFIRMED, REPRODUCED, FIXED**

`state.debriefOf` charges **one** decision per brief window (`+ g.briefs.length`);
`econ.decisionCount`'s full column charges `DECISIONS.briefOptionsMax = 5` per window **plus** the
two Backcheck spends. The debrief printed the first beside the second with nothing between them.

**Measured through the shipped machine** (`scratchpad/runv2/decisions.mjs`: `postBoard → startJob →
commitBind → tick → beginTargets → lockCall/applyTarget → push → brief with every option including
the swap → backcheck → endJob`), per shape:

```
             default          full use (every brief option)     published (G1)
  RUN        15 · 2.5         16 · 2.7                          15 / 22
  JOB        24 · 2.4         25 · 2.5                          24 / 35
  JOB12      28 · 2.3         29 · 2.4                          28 / 39
  VAULT      17 · 2.4         18 · 2.6                          17 / 24
exhaustive over 4 shapes × swap on/off × 5 miss patterns × 8 saves, max printed per-item:
  RUN 2.86   JOB 2.58   JOB12 2.50   VAULT 2.78      ← the published 3.5 is unreachable
```

**The `mandatory` columns agree exactly. The `full` columns are on different bases, and the
counter's own is `mandatory + COMMIT` — reached on the nose, on every shape.** On this counter,
using every option inside a window is worth nothing, because a window costs one decision whether it
is used or skipped; that single fact is the whole basis gap, and the line now says it.

**THE FIX** (`screens/run.js jobTakeBlock`): `fullHere = published.mandatory +
JOB_DECISIONS.commitFull`, and the line names both bases:

```
Decisions 25
2.5 per item · 24 mandatory / 25 full use, counting a brief window once · G1’s 35 counts its 5 options and 2 Backchecks
```

`DECISIONS` is imported into `run.js` from `data/job.js` (a one-line addition to this lane's own
import list). **Neither numeral is invented in the screen**: both come out of `econ.decisionCount`.

**`SPLIT.densityMinFull = 3` is NOT lowered and 3.5 is NOT struck**, and this is where this lane
disagrees with the finding's own option (b). `tests/job-split.test.mjs` §5 *"the FULL-USE path adds
the windows and the COMMIT, and reaches G1's 35"* plays a real job and reaches 35 **on G1's basis**,
and that arm is green. The defect was two bases on one line, not a false ceiling; striking the
ceiling would have contradicted a passing measurement. `DECISIONS.backchecksFull` is deliberately
excluded from the counter's own column: a Backcheck needs a miss, a miss queues a Rematch, and the
Rematch is a target the shape does not have — which is also why G1's 35 over ten graded items is
unreachable in one sitting (with the spends it is 39 over fourteen). A job that spends them prints
**more** than the full-use column, which is honest: it answered more targets than the shape deals.

**ACCEPTANCE TESTS** — `run-lane-v2.test.mjs` §1, four tests: the default path lands on
`published.mandatory` per shape (≥ 12 jobs at their shape's own target count); full use lands on
`published.mandatory + commitFull` and is asserted to be **strictly below** `published.full`, so the
day the two bases merge this section fails and gets deleted rather than rotting; the gap between the
columns is asserted to be exactly the window options plus the Backchecks; and the screen must print
both bases with each named.

**THE PIN THAT ASSERTED THE DEFECT IS CORRECTED.** `tests/job-debrief.test.mjs:749` read
`s.includes('24 mandatory / 35 full use')` — it required the debrief to print G1's column beside a
count not on that basis. It now asserts the counter's own column, the basis phrase, and G1's column
named as the different quantity it is. (`job-debrief.test.mjs:334`, which pins
`decisionCount('JOB') === {24, 35}`, is untouched: that is a statement about `econ`, and it is true.)

**NEGATIVE CONTROL** (`negctl2.py basis`, the published ceiling back on the line):

```
✖ the split, the decision count and both accumulators print (chromium, job-debrief)
    "the counter's own decision column (24 mandatory / 25 full use) is not printed:
     … | Decisions 26 2.4 per item · 24 mandatory / 35 full use | …"
✖ run v2 §1 — the screen prints BOTH bases and names each
```

**PASS. Numbers measured: printed full-use ceiling 35 → 25 on the JOB-10, and the counter now
reaches it exactly on all four shapes (15/16, 24/25, 17/18, 28/29).**

**Spec half (LANDED).** `COMPOSED-GAME.md:131` (G1's reframe), G9 #1's density sentence and G10 #17
now name the basis of every numeral. `designs/SPEC-CORRECTIONS.md` **R-3**. (Doc lane's file —
BUILD-POLICY §2.)

---

## 4 — MAJOR · player-feel · `cost 35.` above `cost 3.5 credit.` → **CONFIRMED, FIXED**

`COPY.regret`'s cost is `econ.regretLine`'s `optimal − actual`, both terms out of `playOrder`, whose
contract is *"Replay a realised order … and return the final BAGGED"* (`econ.js:984`) — the unit of
the `BAGGED 455` hero four inches above. `COPY.regret2`'s is a credit gap. Two consecutive
paragraphs under one heading, one of them unlabelled: exactly the defect finding 40 was filed for,
left standing on the other half of the same block.

**THE FIX** — one word, in the file the other line was already fixed in:
`site/data/job.js COPY.regret` → `… cost ${cost} bagged.` **(`site/data/job.js` is the `call`/copy
lane's file; this is the one-word change BUILD-POLICY §2 permits, and it is the change
notes/repair-run.md Request 1 asked that lane for last round.)** Four consequential updates, all of
them the same word: the worked example in `econ.js`'s `regretLine` docstring, the two shape regexes
that pin the line (`job-debrief.test.mjs:261`, `job-econ.test.mjs:1471` — **tightened with the unit,
not loosened**), and `COMPOSED-GAME.md` G5 #2 + the G6 copy table (SPEC-CORRECTIONS **R-4**).

**AND THE LINT THE FINDING ASKED FOR** — `run-lane-v2.test.mjs` §3 renders every `COPY` template
with a numeric stub and requires every `cost <number>` it can print to be followed by a unit word
from a closed set, plus a second test asserting the two regret lines name **different** units,
because they are different economies. It is in this lane's file rather than `job-copy.test.mjs`
purely to avoid a mid-flight collision in another lane's file; it is a pure function of `data/job.js`
and moves there unchanged if that lane wants it.

**NEGATIVE CONTROL** (`negctl2.py unitword`):

```
✖ the BAG/PUSH line is econ.regretLine(order).line, verbatim (job-debrief)
✖ a real regret prints G6’s line (job-econ)
✖ run v2 §3 — every `cost` figure the table can print is followed by a unit word
✖ run v2 §3 — the two regret lines name DIFFERENT units
```

**PASS. The two lines of one block now read `cost 31 bagged.` and `cost 0.3 credit.`**

---

## Files changed

| file | owner | what |
|---|---|---|
| `site/js/screens/run.js` | this lane | `draftedCountOf`, `pageSizeExtra`, `commitJobRun`, the flat `finish()`, the `Decisions` fact, one import |
| `tests/run-lane-v2.test.mjs` | this lane | NEW — 10 tests, §1 §2 §3 |
| `tests/run-lane-r2.test.mjs` | this lane | the WALK arm; the two self-restating pins corrected |
| `tests/job-debrief.test.mjs` | this lane | the decision-column pin corrected; the regret regex tightened |
| `site/data/job.js` | `call`/copy | **one word** in `COPY.regret` (BUILD-POLICY §2) |
| `site/js/job/econ.js` | `econ` | **one word** in a docstring example |
| `tests/job-econ.test.mjs` | `econ`/tests | one regex tightened with the unit |
| `tests/job-ledger.test.mjs` | `ledger`/tests | the `drafted === items.length` pin corrected to the right unit |
| `COMPOSED-GAME.md` | `doc`/`meta` | four sentences (R-2, R-3, R-4) |
| `designs/SPEC-CORRECTIONS.md` | `doc`/`meta` | R-2, R-3, R-4; M-4 marked superseded in part |

`site/js/app.js` and `site/index.html`: **unchanged.**

## Open issues / carried forward

- **The deflation claim is still unmeasured** (carried from round 3 and verify r1). Nothing on the
  debrief shows posted-per-lock over time.
- **`finish()` has no headless arm.** The WALK repair's behavioural half runs through a transcription
  of `finish()` and is tied to the shipped source by lint. A `mountCardRun` that can be driven in
  node (or one more chromium arm in `job-debrief.test.mjs`) would close it properly; it is the same
  gap every previous round left, not a new one.
- **`DECISIONS.backchecksFull` is unreachable inside a shape's own target count**, on BOTH bases.
  Named in `jobTakeBlock`'s comment and in R-3; closing it is an econ/G1 decision (either the column
  stops charging them, or G1 states the column as a sum over mutually exclusive maxima), not a screen
  fix.

# VERIFY ROUND 3 — the run lane

Owner files: `site/js/screens/run.js`, `site/js/app.js`, `site/index.html` (+ their tests:
`tests/run-lane-r1/r2/r3.test.mjs`, `tests/run-lane-v1/v2/v3.test.mjs`, `tests/job-debrief.test.mjs`).

**Findings owned: three.** One MAJOR on `screens/run.js` (call-propriety), one MAJOR on
`COMPOSED-GAME.md` (spec-fidelity), one **BLOCKER** on `screens/run.js` + `app.js` (player-feel).
All three are CONFIRMED. Two are fixed in code; the spec-fidelity one is a document that no fixer
edits, so it is written as `designs/SPEC-CORRECTIONS.md` **R-5** and **R-6** with verbatim OLD/NEW.

**Baseline, measured before any edit** — `node --test tests/` at 09:12:
`tests 2995 · suites 406 · pass 2991 · fail 0 · skipped 4`, **green**. (The ticket's stated baseline
of 2725/2721 is two rounds stale; thirteen lanes have added suites since.)

---

## 1 — MAJOR · call-propriety · "EV-max" named two different rungs on two surfaces → **CONFIRMED, REPRODUCED, FIXED**

**Reproduced first, through the shipped modules** (`scratchpad/runlane/v3-word.mjs`), against the shipped
`evMaxBands()` that `screens/settings.js:533` prints under *"The EV-max rung, by true clear rate"*:

```
evMaxBands() = [{call:50,to:0.6},{call:70,to:0.7778},{call:85,to:0.8824},{call:95,to:1}]
CALL_DISAGREEMENT_BANDS = [{from:.7750,to:.7778,money:70,rank:85},{from:.8824,to:.9000,money:95,rank:85}]
q̂ = 8/9  → debrief "EV-max was 85"   | Settings' band says 95
q̂ = 7/9  → debrief "EV-max was 85"   | Settings' band says 70
```

The critic's analysis is exactly right, and the defect is a **word**, not the ladder: round 3 moved
the line onto the rating ladder for a reason that survives re-checking — *the rung a sentence names
must be the maximiser of the currency it prices*, and `COPY.regret2` prices credit. Flipping
`DEBRIEF_CALL_LADDER` to `carry` (the finding's second option) fails on measurement: the carry
cost at G5 #2's own worked case is **0.05 loot**, and `jobRegret`'s `Math.round(cost*10)/10 > 0`
gate then deletes the teaching line on most envelopes — which is the trap `data/job.js`'s finding-40
comment already records. Renaming the word outright (the first option) fails a *different* test:
`job-call.test.mjs` asserts `named === ['COPY.regret2']` — **exactly one string in the whole data
file may name the EV-max rung, and it is the debrief's**. So the word cannot leave `regret2`, and
the rung cannot leave the rating ladder.

**THE FIX, at the root: one word cannot name two answers, so where the answers differ the line does
not use the word.** Outside the two bands the two ladders agree at every q̂, `EV-max` is true, and
the published sentence is untouched. Inside them the debrief prints a second line that names both
rungs in Settings' own vocabulary (*"the money says call 95, the rating says call 85"*):

```js
// site/data/job.js  (one added template — see Requests 1)
regret2Split: ({ envelope, called, money, rank, cost }) =>
  `envelope ${envelope}: you called ${called}. the money said ${money}, the rating said ${rank}. cost ${cost} credit against ${rank}.`,

// site/js/screens/run.js  jobRegret
const money = shown ? jobCall.regretOf({ call: worst.called, qHat: worst.q, ladder: 'carry' }).best : null;
const split = shown && money !== worst.evMax;
```

Both rungs come out of `call.regretOf` — the money one through `ladder: 'carry'`, never
`argmaxCall` by hand — so run r3 §1's "the screen must not hand-roll either half" still holds on a
comment-stripped slice.

**MEASURED AFTER (the three reachable q̂ the critic names, printed by the shipped machine):**

```
q̂ 8/9 called 95 → envelope 1: you called 95. the money said 95, the rating said 85. cost 0.1 credit against 85.
q̂ 7/9 called 95 → envelope 1: you called 95. the money said 70, the rating said 85. cost 1.0 credit against 85.
q̂ .885 called 70 → envelope 1: you called 70. the money said 95, the rating said 85. cost 1.3 credit against 85.
G5 #2   called 85 at q̂ .75 → envelope 6: you called 85, EV-max was 70. cost 0.3 credit.   (unchanged)
```

Over the test's own grid — 2 001 q̂ × four played jobs, one per rung, 8 004 lines asked for:
**5 843 carry the word and every one names exactly `argmaxCall(q̂)`, Settings' own rung — 0 disagree**;
105 drop it and name both; 2 056 print nothing (an honest call has no regret to teach). At module
level over a 10 001-point grid the same rule holds on 29 210 of 29 732 printed lines, 0 disagreeing
(`scratchpad/runlane/v3-word.mjs`). `tests/run-lane-v3.test.mjs` §1.

**NEGATIVE CONTROL (in the test itself).** The pre-fix sentence is rebuilt — `COPY.regret2` on
`honestCall(0.885)` — and the file asserts that it *violates* the rule, so the rule cannot pass
vacuously. The band walk also fails if a fixture is used that never reaches a band: band 0 is
invisible from the 70 column (its regret rounds to 0.0), which is why §1 plays four jobs rather
than one — the round-3 file's single 70-call fixture could not have caught this.

---

## 2 — MAJOR · spec-fidelity · G8's J8 row publishes two outputs the debrief does not produce → **CONFIRMED (document only); corrections written**

Both halves verified against the shipped screen; **no code change is correct here — the code is
right and the row is stale.**

**(a) "24 mandatory / 35 full", un-based.** `screens/run.js:2449` prints both bases and names each
(`published.mandatory` / `fullHere = published.mandatory + DECISIONS.commitFull` / `G1's
${published.full} counts its 5 options and 2 Backchecks`). `econ.decisionCount('JOB')` =
`{mandatory: 24, full: 35}`; the counter's own full-use column is **25**. This is R-3's own
correction (verify r2's split-honesty BLOCKER), which landed at G1's reframe, G9 #1 and G10 #17 and
was never carried to J8's row. → **SPEC-CORRECTIONS R-5.**

**(b) `0 ms`.** Deleted as a BLOCKER in verify r1: `state.debriefOf` derives `wall = tGame +
tAnswer`, so the printed quantity was `x − x`. `run.js:2487` now prints
``split.idleMeasured ? `${split.idle} ms idle` : 'idle not measured'``, and `sessionSplit(debrief,
null, {})` — no second clock — returns `idleMeasured: false`. The J8 acceptance clause should be
**struck**, and G9 #1 / G12 #32 should restate it as the design property `job-juice.test.mjs`
asserts (no gates, no spinners, six cues ≤ 600 ms, nothing `position: fixed` during a job) rather
than as a printed measurement. → **SPEC-CORRECTIONS R-6.**

Pinned so the row and the screen cannot drift again: `tests/run-lane-v3.test.mjs` §2 asserts the
four numerals the corrected row quotes, the two branches the idle line can print, and that no
literal `0 ms` may come back into the screen.

---

## 3 — BLOCKER · player-feel · `Another board` was a dead button → **CONFIRMED, REPRODUCED, FIXED**

**Reproduced first, in chromium, on the catalog's own `job-debrief` state (a job played to its
end), pressing the rendered anchor by its label — `tests/_run-again.mjs`, before the fix:**

```
job-debrief   BEFORE hash=#/run/job phase=debrief summary=true loads=4
              actions=["Home -> #/today","Another board -> #/run/job","Ledger -> #/stats","Binder -> #/binder"]
job-debrief   AFTER  hash=#/run/job phase=debrief summary=true loads=4 contracts=0 rows=0 primary=null
6 FAIL
  ✖ pressed "Another board" (href #/run/job) and the screen is at phase "debrief" — no board was posted
  ✖ no .job-contracts list after the press          ✖ the posted board has no contract rows
  ✖ no .job-primary after the press                 ✖ the debrief is still on screen after the press
  ✖ run-page-summary: pressed "Another page" (href #/run/page, the route it is rendered at) and the summary is still on screen
```

**The finding under-reports the blast radius.** It is not one button: the whole router was
`window.addEventListener('hashchange', route)`, and *every* repeat control in the app is rendered by
the screen it points at — `Another board` (`#/run/job`), **`Another page` (`#/run/page`, the FLAT
path, which the game layer never touches)** and `againLabel(kind)` (`#/run/:kind/:id`). The sixth
failure above is the study layer's own again-button, dead for the same reason, and no finding named
it. `screens/onboard.js:624` carries the workaround in a comment (*"`&intro=1` only makes the hash
differ … so the ← anchor fires a hashchange"*), which is the tell that the hazard was known.

**THE FIX, at the root — `site/js/app.js`, the router answers the ACTIVATION as well as the hash:**

```js
export function sameRouteClick(ev) {
  if (ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
  const a = …closest('a[href]');
  if (!a || a.target || a.hasAttribute('download')) return;
  const href = a.getAttribute('href');
  if (!href || href[0] !== '#' || href === '#') return;   // in-app hash links only
  if (a.href !== location.href) return;                    // a different route: hashchange has it
  ev.preventDefault();
  route();
}
…
document.addEventListener('click', sameRouteClick);
```

One listener, in the one file that owns routing, instead of a handler per link. It is deliberately
narrow: primary button only, no modifier, nothing a screen has already handled, no `target`/
`download`, `#…` hrefs only, and only when the href resolves to the **whole** current URL — query
string included, so `#/run/job?new=1` still travels through the hash the ordinary way and
`onboard.js`'s `&intro=1` workaround is unaffected (it can be simplified later; it is not wrong).
A same-route press adds **no** history entry, which is the right behaviour for re-posting a board.
An SVG `<a>` cannot trip it (`a.target` is an `SVGAnimatedString`, so the guard returns first).

**MEASURED AFTER, both engines, same driver, same real clicks:**

```
chromium job-debrief AFTER hash=#/run/job phase=board summary=false loads=4 contracts=1 rows=5
                     primary="JOB · A C D · 10 targets · posted 402 · ~9 min · ends 19:38 · 67 % game"
webkit   job-debrief AFTER hash=#/run/job phase=board summary=false loads=4 contracts=1 rows=5  (identical)
run-page-summary AFTER summary=false      ALL PASS · 4 measurements
```

`loads` is unchanged across the press in every row — the count is a `sessionStorage` tally of full
document loads, so a "fix" that reloaded the app could not pass this driver.

---

## Files changed (verify r3)

| file | change |
| --- | --- |
| `site/js/screens/run.js` | `jobRegret` computes the money rung through `call.regretOf({ladder:'carry'})` and prints `COPY.regret2Split` where the ladders disagree; `call.split` / `call.money` added to the returned shape; the `DEBRIEF_CALL_LADDER` and `jobRegret` docblocks carry the measurement |
| `site/js/app.js` | `sameRouteClick` + one `document` click listener at boot (finding 3) |
| `site/data/job.js` | **one added template**, `COPY.regret2Split` — a file this lane does not own; see Requests 1 |
| `tests/run-lane-v3.test.mjs` | **new** — §1 the word, §2 the J8 numerals, §3 the router |
| `tests/_run-again.mjs` | **new** — the browser driver for §3 (chromium + webkit) |
| `tests/job-debrief.test.mjs` | the CALL-line assertion is now the invariant (which template, and the word only on Settings' own rung) instead of a fixed template — **its fixture's worst envelope lands inside band 2, which is how the fix was caught in a played job** |
| `designs/SPEC-CORRECTIONS.md` | R-5, R-6, R-7 appended to §H |

`site/index.html`: **unchanged.**

## Requests

1. **`site/data/job.js` — `COPY.regret2Split` was added by this lane** (BUILD-POLICY §2: a one-line
   addition, marked here). It adds a key and changes nothing existing: `COPY.regret2` is byte-identical,
   so every pinned literal in `job-econ.test.mjs:2196`, `job-debrief.test.mjs` and
   `run-lane-r3.test.mjs:175` still holds, and `job-call.test.mjs`'s "exactly one string names the
   EV-max rung" still resolves to `COPY.regret2` alone (the split line deliberately carries none of
   the five needles). If the copy owner wants it worded differently, the only constraints are: no
   `ev-max`/`evmax`/`evtable`/`argmaxcall` needle, and `cost … credit`.
2. **`site/js/screens/settings.js:536-539`** — the hint under the EV-max table promises "the debrief
   prints what the EV-max call would have been on each envelope you already answered". Inside the two
   bands it now prints both rungs instead. Exact replacement text is in SPEC-CORRECTIONS **R-7**.
3. **`screens/onboard.js:624`'s `&intro=1`** is no longer needed to make the ← anchor fire; it is
   harmless and was left alone. Removing it is the onboard owner's call.
4. **`qa/job-screen.mjs`** — the finding asked for the press to be added to that walk's own debrief
   beat. `qa/` belongs to the tests lane and was being edited during this ticket, so the rule lives in
   `tests/_run-again.mjs` (this lane's, the same arrangement `tests/_job-reach.mjs` already has).
   Folding it into the walk would save one browser launch in the suite; the rule is written to be
   lifted as-is.

## Test state at hand-off (verify r3)

**Full suite, after the fixes** — `node --test tests/`:
`tests 3070 · suites 424 · pass 3065 · fail 1 · skipped 4`.
(Baseline before this lane touched anything, 09:12: `2995 · pass 2991 · fail 0 · skipped 4`. The
75 new tests are this lane's 12 plus other lanes' work landing during the same hour.)

- `tests/run-lane-v3.test.mjs` — **12/12 green** (§3's measured arm runs chromium; it *skips*, never
  fails, with no Playwright browser, exactly as `job-screen.test.mjs` does).
- `run-lane-r1/r2/r3`, `run-lane-v1/v2`, `run.test.mjs`, `job-split`, `job-copy`, `job-index`,
  `job-call`, `job-econ`, `job-debrief`, `job-exploit`, `job-juice`, `job-meta-constants`,
  `job-screen` (including the measured chromium walk) — all green.

**THE ONE FAILURE IS NOT THIS LANE'S, AND THE A/B PROVES IT.**
`tests/job-week.test.mjs:1403` — *"the projection reads the student's OWN last five jobs (G1
statement 1)"* — `the board projected 29 % against a debrief headline of 22 % — more than
SPLIT.agreeWithinPoints = 5`. It compares `board.projectFor`'s number with `run.sessionSplit`'s,
over the ledger `state.endJob` writes. `grep -c 'jobRegret\|regret2' tests/job-week.test.mjs` → **0**:
nothing this lane changed is on that path, and `site/js/job/board.js` (10:08) and
`site/js/job/state.js` (10:05) were both being written while the suite ran.

Measured rather than asserted — `site/js/screens/run.js` copied aside, `jobRegret` reverted to its
pre-v3 body, the suite re-run, the file restored byte-identical (`cmp` clean):

```
reverted jobRegret to the pre-v3 body
ℹ tests 108 · pass 107 · fail 1
  the board projected 29 % against a debrief headline of 22 % — more than SPLIT.agreeWithinPoints = 5
restored site/js/screens/run.js (byte-identical)
```

Same test, same two numbers, with this lane's change out of the tree. **Confirming full run ten
minutes later, with the other lanes' newest files in the tree: `tests 3072 · pass 3067 · fail 1 ·
skipped 4` — the same single failure, `site/js/job/board.js` having been rewritten again at 10:17.** Two other failures seen
mid-session — `job-meta-constants` "Tanking is strictly dominated" (a `COMPOSED-GAME.md` assertion)
and `job-screen`'s measured walk (2 crew-grid FAILs out of `qa/job-screen.mjs` rule 11) — were both
other lanes' in-flight work and both went green on their own before the final run.

## Open issues / carried forward

- **The two ladders still share one word on the Settings surface.** The debrief no longer uses it
  where the answers differ, but "EV-max", unqualified, still means *the money's* rung on the panel
  that defines it. Request 2 is the honest close; until it lands a student reading only Settings is
  told the debrief will print a rung it sometimes declines to name.
- Everything carried from verify r2 stands: the deflation claim is still unmeasured, `finish()`
  still has no headless arm, and `DECISIONS.backchecksFull` is still unreachable inside a shape's
  own target count.

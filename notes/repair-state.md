# repair-state — the `state` lane (r3 repair)

**Owned:** `site/js/job/state.js`, plus the test files that cover it (`tests/job-state.test.mjs`,
`tests/job-ledger.test.mjs`). Nothing else was opened for writing. `tests/job-state-r3.test.mjs` was
**read only** and is unmodified — S5.5 item 5 makes that the S5 regression gate.

**Authority followed:** `designs/REPAIR-DECISION.md` (S3.1(b), S3.4 item 4, S5.1–S5.3, S5.6),
`designs/r3-findings.json` entries with `lane: "state"` (findings **56** and **64**).

---

## 1. S3 — the rank is a ratchet: the two writers in `state.js` pass the held rank

**Decision:** REPAIR-DECISION S3.1(b), the two rows of its table that name this file.

| site | before | after |
|---|---|---|
| `state.js` `applyTarget` (was :1072, now :1104) | `call.ratingDetail(p.rating.calls, CAPS.calls)` | `call.ratingDetail(p.rating.calls, CAPS.calls, { rank: p.rank })` |
| `state.js` `endJob` (was :1785, now :1824) | same | same |

Read **before** the `p.rank = detail.rank` write on the next line — which is the whole reason the two
displays that already passed `{rank}` (`screens/settings.js:515`, `screens/stats.js:249`) were dead
on arrival: they floored on a `p.rank` these two writers had already overwritten with 2.

**MEASURED, the fault (negative control, before the edit):** a save whose every card carries ten
clears in the trailing window (`q̂ = 1` → `w = 4·1·(1−1) = 0` → every slot blank), `player.rank = 5`,
empty window, one real target through `startJob → beginTargets → lockCall(85) → applyTarget(CLEAN)`:

```
rating.calls.length = 1 · rating.n = 0 · rating.value = 5.00 · player.rank = 2   ← DEMOTED
```

and the same after a whole job to the getaway (`endJob`). **After the edit: `player.rank === 5`** in
both, `n` and `value` unchanged (0 and 5.00 — the rating still deflates; only the rank holds).

**Acceptance tests written** (`tests/job-state.test.mjs`, new describe `S3 — mastering the material
must not demote`, 4 tests, all ADDITIONS):

1. `applyTarget HOLDS the rank across a window with no measurement in it` — **PASS** (failed before
   the edit: *"applyTarget DEMOTED a student for mastering the material"*).
2. `endJob HOLDS the rank too — the whole job, played to the getaway` — **PASS** (failed before).
3. `a rank the student never held is NOT invented: a Called 2 save stays Called 2` — **PASS** (also
   passed before; it is the control that the floor is the rank HELD, not a promotion).
4. `source: no call.ratingDetail( in state.js omits its rank: floor` — the grep pin S3.4 item 4 asks
   for, over the two non-comment `call.ratingDetail(` lines in this file. **PASS** (failed before:
   *"state.js:1072 computes a rank with no floor — the ratchet leaks"*).

**Forward compatibility with the `call` lane.** Both forms of `ratingDetail` accept `{rank}`: today
`held = !measured && Number.isFinite(opts.rank)`, and after S3.1(a) lands it becomes
`rankFor(value, {floor: opts.rank})`. The all-blank regime these tests drive holds the rank under
both, so this lane's tests do not depend on the order the two tickets land in. The binding-floor
case on a **measured** window (S3.4 items 1–3) is the `call` lane's, in `tests/job-call.test.mjs`.

---

## 2. Finding 64 (MINOR, ledger-invariance) — the structural half of proof 11 did not cover
`counters`, `streak` or `jumps`

**Reproduced first** (`guardSave` on a `fresh()` save, before the edit):

```
xp:              throws LedgerError
counters.clears: NO THROW   → counters after the write: {"clears":999}
counters = {…}:  NO THROW   → the whole object is replaceable
streak.count:    NO THROW   → {"count":999,…}
jumps.X:         NO THROW
```

Both halves of the finding's own fix are implemented, at the root:

**(a) `counters` is now a NARROW proxy** (`narrowCounters`, state.js) admitting exactly
`COUNTERS_WRITABLE = ['pages']` — the single key `finishPage` writes (`page.js`) — and refusing every
other key, at any depth, plus every delete and every `setPrototypeOf`. The top-level key itself is
refused too, with one named exception: `finishPage`'s own defensive `if (!isObj(save.counters))
save.counters = {}`, admitted only in that exact shape (an empty object over a key that is not an
object), so `s.counters = { clears: 999 }` and any replacement of an existing `counters` still throw.
The exception is named where `SHARED_KEYS` is declared, which is the other branch the finding asked
for; `counters.pages`' own invariance remains byte-identity between the two arms, not refusal, and
that is said out loud there.

**(b) `streak` and `jumps` are now in `LEDGER_A_KEYS`.** Nothing under `site/js/job/` writes or reads
either (`markStreakDay` is `store.js`'s; its only callers are `schedule.checkDailyGoal`,
`screens/card.js:904` and `screens/boss.js:469`, none reachable from this module), so the guard costs
nothing and makes G7's published *"Streak, trophies, XP, levels | unchanged"* (COMPOSED-GAME.md:901)
structural instead of an accident. `tests/job-ledger.test.mjs`'s `ALL_LEDGER_A` is
`COMPARED ∪ LEDGER_A_KEYS`, so the corpus comparison picks both up with no edit — which is the
finding's fix (2), obtained from the root rather than from the test's own list.

**MEASURED, after:** every probe above throws `LedgerError`; `finishPage` through the guarded save
still increments `counters.pages` (`0 → 1`), including on a save with no `counters` at all.

**Tests** (2 ADDITIONS + 1 assertion block strengthened; no assertion deleted):

- `tests/job-ledger.test.mjs` *"the save state.js runs against THROWS on every Ledger A write"*:
  8 assertions → 16. Added `counters.clears`, `counters.mocks`, `delete counters.pages`,
  `counters = {clears:999}`, `streak.count`, `streak = {…}`, `jumps.M1`, and two `deepEqual`s that a
  refused write did not land anyway. **FAIL before (`Missing expected exception (LedgerError):
  counters is writable from js/job/*`) → PASS after.**
- `tests/job-ledger.test.mjs` NEW *"the ONE key `counters` lets through is `pages`, and finishPage
  still writes it"* — drives the real `finishPage(guardSave(save))`, both with and without a
  pre-existing `counters`, and pins that the create-branch is not a hole. **FAIL before → PASS after.**
- `tests/job-ledger.test.mjs` *"the variant, daily-goal and streak branches fire"*: the streak
  byte-identity comparison between the two arms is added **where the streak actually moves** (the
  all-CLEAN arm, on the saves whose daily goal flips), with `compared > 0` asserted so it cannot go
  vacuous. Measured: the comparison runs and the two routes agree.
- `tests/job-ledger.test.mjs` vacuity audit: the named compared-but-unwritten list grows
  `['frozen','variants'] → ['frozen','variants','streak','jumps']`, each with the reason and the
  place its non-vacuous coverage lives. That is the audit doing its job, not a waiver.
- `tests/job-state.test.mjs` *"every named Ledger A write throws LedgerError, at every depth"*:
  `streak`/`jumps` added to the `denied` list, and the single line
  `assert.doesNotThrow(() => { s.counters = { pages: 1 }; })` — which **asserted the hole itself** —
  is replaced by four stronger assertions: `counters.pages` still writable, `counters.clears` throws,
  wholesale replacement throws, `delete counters.pages` throws. Net assertions up, none removed.

**NEGATIVE CONTROL (both edits at once):** with `'streak', 'jumps'` deleted from `LEDGER_A_KEYS` and
`'repress-unavailable'` renamed in `pressRefusal`, `node --test tests/job-state.test.mjs
tests/job-ledger.test.mjs` → **77 tests, 73 pass, 4 fail** (the two structural tests, the vacuity
audit, and the S5 refusal pin). Restored → **77 pass, 0 fail**. The new pins can fail.

---

## 3. Finding 56 (BLOCKER, guard-equilibrium) — PARTLY REFUTED; the rest is the `screen` lane's by
REPAIR-DECISION S5

**No behavioural change in `state.js`, and that is the ruling, not a preference.** REPAIR-DECISION
S5 verdict is *minimal, 2–1: the fix is in `site/js/screens/job.js`*, and S5.2 states that every
"refuse the two-step in `state.js`" repair and every "defer the draw" repair is **dead on arrival**,
because `tests/job-state-r3.test.mjs` (16 tests) pins the two-step legal at module level and the
hard rule forbids weakening a test. S5.6 requires the module-level residual to be **named, not
closed**.

**REFUTED — the finding's headline.** *"The brief window re-presses all 3 tokens for free"* is the
round-2 shape of this code, not the shipped one. Driven to a real brief (`JOB`, 4 targets answered,
guarded wing known):

```
THE CRITIC'S MOVE — all 3 tokens onto FIGURES off the known guarded wing RECALL:
  press(all 3)        : REFUSED repress-step
  canPress(all 3)     = false
```

and the suite already pins it: `tests/job-state-r3.test.mjs:216-225` *"a wholesale re-allocation is
refused outright (the +15.2 % play)"*. The finding's other citations are stale with it: its quoted
`bump()` at `screens/job.js:691-698` is now `:859-868`, and the doc-comment it quotes from
`state.js:798` ("anywhere else it is refused, because the guard has already drawn") no longer exists
in the file. Its own state-level transcript shows *"guard wing after Skip: RECALL (unchanged)"* —
i.e. no redraw at all; the shipped `press()` **does** redraw at `brief`, pinned to
`${seed}|brief${n}`.

**CONFIRMED — the two residual leaks, measured on a fresh window:**

```
1. press(lift one off WORDS)                 : ACCEPTED  wing WORDS -> RECALL, drawnAt stamped
2. press(place it on FIGURES)                : ACCEPTED  against the now-known RECALL, no new draw
   total tokens after: 3 of 3
3. press(bare, unchanged allocation)         : ACCEPTED  wing RECALL -> ALGEBRA, drawnAt moved
```

So the second half of the two-step is a fully informed free move, and the bare press is a free
re-roll. Both are S5.1's leaks, both are the screen's to close (S5.3 items 1–3), and both are now
written into `pressRefusal`'s docblock in this file — with the measurements, the test lines that
forbid closing them here, and the structural alternative S5.6 records for whoever revisits it.

**In-lane work done for S5:** the one published refusal code with **no pin anywhere** —
`repress-unavailable` — now has one. The other three plus `press-closed` are already pinned in
`tests/job-state-r3.test.mjs:203 / :212 / :223 / :317` (untouched).

- `tests/job-state.test.mjs` NEW describe *"S5 — `repress-unavailable`"*: a job that presses ONE
  token at the board (legal there) and reaches a brief; the lift is refused **by code**,
  `canPress` agrees, the tokens did not move, and `guard.drawnAt` did **not** pass `phaseAt` — a
  refused press must not redraw. **PASS**; fails when the code is renamed (negative control above).

---

## Spec corrections (for the doc owner — `COMPOSED-GAME.md` is NOT edited here)

**OLD (COMPOSED-GAME.md:555, §3.7 proof 11):**
> …the same answer sequence inside a job and through `#/run/page` produces byte-identical `cards`, `skills`, `xp`, `errors` and `counters` — **the five keys study progress actually lives in**.

**NEW:**
> …the same answer sequence inside a job and through `#/run/page` produces byte-identical `cards`, `skills`, `xp`, `errors`, `counters`, `streak` and `jumps` — **the keys study progress actually lives in**. `js/job/*` cannot write any of them: `state.guardSave` refuses `streak` and `jumps` outright, and admits exactly one counter — `counters.pages`, the single key `finishPage` increments on BOTH routes, whose invariance is therefore byte-identity between the two arms rather than a refusal.

Reason: "the five keys" was an exhaustiveness claim, and `streak` (written by the grade path through
`store.markStreakDay`) and `jumps` are study progress that the guard did not cover and the corpus
did not compare (finding 64). The code is now right; the sentence is what is out of date.

No other published claim in this lane was falsified. In particular COMPOSED-GAME.md:126's
*"Re-press ONE token with the guard distribution redrawn"* is **true** of the shipped `press()` (one
token enforced by `repress-step`, redraw fired) — finding 56's claim that it is broken is refuted
above. The S5 rewrite of that line is REPAIR-DECISION S5.6's, in the `doc` lane, and is untouched
here.

---

## Requests (for other lanes)

1. **`call` lane (S3.1(a)).** `state.applyTarget` and `state.endJob` now pass
   `{ rank: p.rank }`; the floor is still computed by the OLD `held = !measured` rule until
   `call.js ratingDetail` becomes `rank: rankFor(value, { floor: opts.rank })`. Until it lands, a
   **measured** window with a binding floor still demotes (the continuous slide S3.1's "Refused:
   `held = !measured`" paragraph describes). Nothing in this lane depends on the order.
2. **`screen` lane (S3.1(b), third row).** `screens/mock.js:562 applyMockCall` is the third writer
   and still omits `{ rank: save.player.rank }`; the grep pin S3.4 item 4 asks for over `mock.js`
   belongs with it (this lane pinned the `state.js` half, in `tests/job-state.test.mjs`).
3. **`screen` lane (S5.3).** The two residual leaks are confirmed live at module level with the
   measurements above and are documented in `pressRefusal`'s docblock; closing them in `state.js` is
   refused by S5.2. `state.canPress(save, pendingCandidate)` is the predicate to gate the staged
   +/− with — it is `pressRefusal` verbatim, so a greyed button is the machine's own rule.
4. **`save` lane (S3.1(c)).** `p.records.bestRating` is not written by this file; `endJob` still
   writes only `bestRating20`. If the audit surfaces are to print `best rating 9.90`, the write
   belongs beside `rec.bestRating20` in `endJob` — say the word and this lane adds the one line,
   rather than two lanes editing `state.js`.

---

## Suite

`cd /Users/oliver/Projects/unit1a-quest && node --test tests/` — run at 22:5x, with twelve other
lanes editing the tree concurrently:

```
tests 2793 · pass 2788 · fail 1 · skipped 4
✖ tests/job-crew.test.mjs "WHAT IS STILL OUT OF LANE: legalize() and COPY.crewDemoted have no
                            caller under site/js"
```

That failure is the **crew** lane's S4 deletion mid-flight (`site/js/job/crew.js` and
`tests/job-crew.test.mjs` both rewritten at 22:46, after this lane's last write at 22:40); the file
does not import `js/job/state.js` at all (`grep -c "job/state.js" tests/job-crew.test.mjs` → 0) and
it passes on its own (`node --test tests/job-crew.test.mjs` → 135/135) once its own edit settled.
The S0 Playwright failure, the `job-week` REVIEW BOARD lints, `job-save.test.mjs failed to load` and
the `mock` S3 test that were red earlier in the session are all green again — other lanes landing.

**This lane, verified green by itself:**

```
node --test tests/job-state.test.mjs tests/job-ledger.test.mjs tests/job-state-r3.test.mjs
  → tests 93 · pass 93 · fail 0 · skipped 0
node --test <every one of the 18 test files that import js/job/state.js and load today>
  → tests 714 · pass 714 · fail 0 · skipped 0
```

`tests/job-state.test.mjs` 54 → **59** tests; `tests/job-ledger.test.mjs` 17 → **18**; no test
deleted, skipped, or weakened anywhere; `tests/job-state-r3.test.mjs` byte-unchanged (16/16 green).

---

## Request 5 (URGENT, `screen` lane) — the new brief-press harness check asserts the wrong invariant

`node qa/job-screen.mjs --engines chromium --themes light` is the only red thing in the tree as this
lane finishes, and its one failure is a **new S5 assertion reading `state.js`'s ledger backwards**:

```
brief press: driven on 1 window(s) · RECALL→FIGURES · wing ALGEBRA→FIGURES · one redraw · took ["repress"]
FAIL — 1
  chromium/light: brief press — the submit did not redraw the guard (drawnAt 1790033426128 vs phaseAt 1790033426128)
```

The submit **did** redraw. `drawnAt > phaseAt` is the *open-window* ledger (`repressed(g)`, state.js)
and it is **false by design the moment the window closes**: `brief()` calls `press(s, repress, opts)`,
which stamps `drawnAt = max(opts.now, phaseAt + 1)`, and then `brief()`'s own last statement is
`setPhase(g, …, now)`, which stamps `phaseAt = now` — so after any `brief({repress})` the two are
EQUAL, which is exactly what makes `repressed()` clear itself for the next window. Measured on a real
job (scratchpad probe, shipped API only):

```
BEFORE the submit : {"wing":"RECALL","drawnAt":1789596000000,"phaseAt":1789596222000}
took              : ["repress"] | tokens -> {"RECALL":0,"FIGURES":2,"WORDS":1,"ALGEBRA":0}
AFTER the submit  : {"wing":"RECALL","drawnAt":1789596242000,"phaseAt":1789596242000}
drawnAt MOVED     : true (1789596000000 -> 1789596242000)
drawnAt > phaseAt : false   <-- FALSE BY DESIGN once the window CLOSED
```

**Fix in `qa/job-screen.mjs` (S0/S5's file, not this lane's):** assert `drawnAt` **moved** — capture it
before the submit and compare — or assert `briefs.at(-1).took` contains `repress` and that the wing
was re-drawn, which the harness already prints. Do not assert `drawnAt > phaseAt` after the window
closes. (Also note the redraw is pinned to `${seed}|brief${n}`, so it may legitimately return the
SAME wing with probability `y_w` — Global law 5 / S5.7 — so "the wing changed" is not a sound
assertion either; the probe above shows RECALL → RECALL on its own seed.)

No `LedgerError` was thrown anywhere in that harness run: it walks all 10 targets, both briefs and
the debrief through the real screen, which is positive evidence that this lane's new `counters` /
`streak` / `jumps` guard does not touch the screen's write path.

---
---

# VERIFY ROUND 1 — the `state` lane

**Owned this round:** `site/js/job/state.js` plus its tests. One finding was routed here.

## V1. [MAJOR, test-integrity] `player.records.bestRating` had zero behavioural coverage

**The finding.** S3.1(c)'s audit record could be deleted at either `state.js` writer, or inverted to
`Math.min` (turning the high-water mark into a LOW-water one), with a green suite. Every reference
to the field in `tests/` was a regex over a PRINTER's source
(`job-meta-constants.test.mjs:730-743`), a normalize/coercion test (`job-save.test.mjs:327-346`) or
a byte-budget fixture (`_helpers.mjs:332`); nothing drove `applyTarget` / `endJob` / `applyMockCall`
and read the record back.

**Verdict: the finding is right, and the DEFECT IS THE TEST SUITE, not `state.js`.** The two writers
are correct as shipped — they are `Math.max` over `num(…, 0)`, at both writers of `p.rating.value`,
read after `call.ratingDetail` — so **`site/js/job/state.js` is byte-unchanged this round**. What
was missing is the thing that makes them load-bearing. Five tests were added to
`tests/job-state.test.mjs` (new describe `S3.1(c) — player.records.bestRating is the high-water
rating, and every writer writes it`); **59 → 64 tests in that file, nothing deleted, skipped or
weakened**:

1. **`applyTarget` writes it at EVERY staked target, as a running MAXIMUM.** A real job on
   `CORPUS[3]`, call 85 throughout, clean to target 4 and missing from target 5 — so the rating
   RISES (5.349 → 5.655 → 6.019 → 6.252) and then FALLS (→ 1.828 at the last of 13 targets). The
   arm asserts the record equals the running max after EVERY target, that the trajectory really
   rose and really fell (or it says so and fails), and that the job ended strictly below its own
   record. Nothing is constructed by hand: the window is filled by the shipped path.
2. **`endJob` writes it too — proved where `applyTarget` cannot.** A save whose window a real job
   filled, with the record then cleared (the save of a student who played before S3.1(c) shipped;
   `store.js` loads the absent field as 0), plays a second job on which **CALL IT turns the stakes
   off at the first envelope**. With `g.stakes === false` no target writes a rating at all — the arm
   asserts the record is still 0 after every one of them — so the only writer left is `endJob`,
   which must put back `6.6016`. This is what keeps the two writers from covering for each other.
3. **A later job whose rating COLLAPSES cannot move the record down.** `CORPUS[4]`, job A all-clean
   at 85 (record 6.7035), job B the next day all-miss at 85 (rating → 0.1112). The record must read
   6.7035 after every target of job B and after its `endJob`. This is the arm that makes `Math.max`
   load-bearing, and it is built out of two real jobs rather than a hand-set field.
4. **The third writer, `screens/mock.js applyMockCall`.** Driven through the shipped export on (i) a
   save with no record — the Mock writes a rating, so it owes a record beside it — and (ii) a save
   carrying a job's high-water mark above its current rating, which a Mock may not drag down. It
   asserts NOTHING about how far a Mock moves the rating: the Mock's weight (`MOCK_CALL_W`, ŝ, the
   informative gate) is the `week` lane's and is being re-derived in this very round, and the
   record's invariant holds at `w = 0` as well as at `w = 0.25`. See the Request below.
5. **Source pin: a FIFTH writer cannot slip in.** Every non-comment `rating.value =` in `state.js`
   must carry `bestRating = Math.max(` within 12 lines. Structural only, and written as the LAST
   arm of the five rather than as a substitute for them — it covers the one case behaviour cannot
   reach, a writer that does not exist yet.

### Negative controls (mutants run in a SCRATCH COPY of the tree, never in the live tree)

`rsync` copy at `/private/tmp/…/scratchpad/mut`, `node --test tests/job-state.test.mjs` each time.
Baseline there: **tests 64 · pass 64 · fail 0**. Each mutant was reverted before the next.

| mutant | result | first assertion that fired |
|---|---|---|
| `state.js:1191` (applyTarget record write) → `void 0;` | **fail 2** | `target 1: the audit record reads 0 where the high-water rating is 5.3494…` |
| `state.js:1916` (endJob record write) → `void 0;` | **fail 2** | `endJob left the audit record at 0 while it wrote rating 6.6016…` (and the source pin) |
| `state.js:1191` `Math.max` → `Math.min` | **fail 3** | `target 1: a FALLING rating (6.2197) moved the record to 6.2197 — Math.max became Math.min` |
| `state.js:1916` `Math.max` → `Math.min` | **fail 3** | `the record that survived the job is not the job's high-water rating` |
| `screens/mock.js:578` write deleted | **fail 1** | `applyMockCall wrote rating 5 and left the audit record at 0` |
| `screens/mock.js:578` `Math.max` → `Math.min` | **fail 1** | same |
| a FIFTH writer: an extra `p.rating.value = …` in `endJob` | **fail 1** | `state.js has 3 writers of p.rating.value, not the two S3.1(c) names` |

All seven of the mutants the critic reported as SURVIVED are now killed. (The four the finding
listed are the first four and the fifth row; the last two are added because a silent `Math.min` and
a new writer are the two ways the record stops being a maximum.)

**PASS.** `node --test tests/job-state.test.mjs` → **tests 64 · pass 64 · fail 0 · skipped 0**.

## Requests (verify round 1)

1. **`week` lane (owner of `site/js/screens/mock.js` + `tests/mock.test.mjs`) — mirror arm 4 in your
   own file if you want it closer to home.** I did not touch `tests/mock.test.mjs`: it is yours and
   you are editing `mock.js` right now (the `MOCK_CALL_W = INFORMATIVE_MIN` / ŝ re-derivation landed
   at 02:49 while this lane was running). Arm 4 lives in `tests/job-state.test.mjs` instead, and is
   written to survive your re-derivation — it pins only the S3.1(c) record, never the weight. If you
   mirror it, keep it weight-agnostic for the same reason.
2. **Nobody, yet — the record is not on the debrief.** `records.bestRating` is printed by Settings
   and Stats only (`meta` lane). No request; noted so the next reader does not go looking.

## Suite (verify round 1)

- `node --test tests/job-state.test.mjs` → **64 / 64**, 0 fail, 0 skipped (was 59 / 59).
- `node --test tests/` at the end of this lane's work: the whole-tree run is mid-flight for twelve
  other lanes and its red is entirely theirs — `job-econ`, `job-week`, `job-screen`, `job-call`,
  `job-board`, `job-align`, `job-debrief`, `job-monotone`, `job-exploit`, `job-copy`, `mock` —
  e.g. `tests/job-copy.test.mjs:309` reports `site/js/job/guard.js → come back` (the `guard` lane's
  prose) and `tests/mock.test.mjs:647` reports `the rating fell to 5` (the `week` lane's own S3 test
  against its own half-landed weight change). **No failure in the tree names `js/job/state.js` or
  `tests/job-state.test.mjs`**, which is the whole of this lane's surface this round.

---

# VERIFY ROUND 4 — `site/js/job/state.js`

Four findings, all filed by round-4 critics against the SHIPPED machine. **Three are fixed at the
root. The fourth is half fixed and half measured-and-refused**: the field that closes it landed, and
landed BYTE-NEUTRAL; the rest is priced against a published budget this lane may not move, with the
commands, the numbers and a Request to the owners who can rule.

Files changed by this lane:

* `site/js/job/state.js` — the four repairs.
* `tests/job-state.test.mjs`, `tests/job-state-r1.test.mjs` — this lane's own suites.
* `tests/_helpers.mjs` — the G7 worst-case log row: `queueTargets` priced, `rating` re-priced at the
  new `WIDE_4DP` instead of `WIDE_DOUBLE` (§4). The fixture is the save lane's; the row is byte-
  neutral and `game keys added` re-measures at the same 40332 B, so no `SAVE_BUDGET_KB` figure moved.
* `tests/job-board.test.mjs` — ONE line: the board lane's own row-shape tripwire, moved from
  `[]` to `['queueTargets']` so the VALUE arms they wrote underneath it now run. Their tripwire's
  message asks for exactly this ("Assert what each new field MEANS here … and re-run the save
  budget"), and both halves are done. Requests 4.

(The `tellOff` line another lane added to `inProgressJob12()` while this ran is theirs and is
correct — see §2.)

## 1 — [MAJOR] `DECLINE_PRICE` reached no payout term — **FIXED**

Confirmed exactly as filed. `benchFor` stored `round(t.posted · 1.15)` on the bench item
(`state.js`) and `swapIn` added that figure to `g.posted` — the **Elo bar** — but `pricedTarget`
rebuilds the target from `page.jobTargetOf`, which is given `{tier, scopeFlags, bucket, overdueDays,
tell}` and knows nothing about a decline. `item.posted` was dead for payout. Taking the published
"declined price" therefore raised the bar you had to clear and paid nothing for it: on the numbers
the critic measured, loot per answered target FELL ×0.920 while the recorded posted ROSE.

**The fix is one term, and it is `econ`'s own.** `econ.postedFor`, `carryFor`, `missFor` and
`stakeOf` all already end on `num(target.mult, 1)` — the multiplier `econ.js`' `Target` typedef
documents as *"any further multiplier (default 1) — kept so a shape can add one without this file
growing a term"*. `pricedTarget` now computes

```js
const declineMult = str(item.declined) ? 1 + DECLINE_PRICE : 1;
const mult = num(item.mult, 1) * declineMult;
```

and carries `mult` both into `econ.postedFor` and onto the returned target, which is the object every
payoff term is handed. So a bought-back contract is worth **+15 % on a clear and costs +15 % on a
miss** — G1's *"a decline is a trade, not a free spin"*, on both sides of the wager.

**It costs ZERO save bytes.** The multiplier is derived from `item.declined`, a field `benchFor`
already writes and `swapIn` already copies into the queue; `tests/_helpers.mjs` already prices it
(`GAME_QUEUE_FIELDS`) and `tests/job-save.test.mjs` already asserts the fixture covers it. The
alternative the finding suggested — storing `mult: 1.15` on the spliced items — would have added a
field to every bench and queue row, on a `queueDelta` line with **6 B of slack**.

`g.posted` is deliberately untouched: it is the bar, `swapIn` already adds the declined figure to it,
and the two now agree by construction.

### Tests (`tests/job-state-r1.test.mjs`, new `r4 ·` block)

* `a swapped-in target PRICES at +0.15` — drives the real board → draft → brief → `brief({swap})`,
  finds the queue entry carrying `declined`, and asserts `mult === 1.15` exactly, that the posted is
  `econ.postedFor(drafted with mult 1.15)` exactly, and that the visible RATIO is 1.15 ± 1.
* `…and the premium is PAID` — settles the same two priced targets through `econ.settle`: the clear
  branch pays strictly more and the miss branch costs strictly more.

**The ratio arm is taken at tier 4 and that is load-bearing.** The corpus' swapped-in target posts
**3**; `postedFor` rounds to an integer, so +15 % on it is 0.45 and an arm that measured the ratio
there would be measuring the rounding, not the repair. `dear()` moves `tier` (LOOT's only input) and
nothing else — the wing, guard, tokens, crew, ×2 and the decline are the job's own — and the arm
asserts `dearP >= 10` first so it cannot go vacuous if the board gets cheaper.

## 2 — [MAJOR] "Take / decline the next target's tell" was a no-op — **FIXED (implemented)**

Confirmed: the whole implementation was `took.push(actions.tell ? 'tell' : 'no-tell')`. The critic
forked 40 windows three ways and got byte-identical `inProgress.game` records; the button spent the
window and `econ.tellFor` went on paying ×1.25 on the refused tag.

**What a refusal now buys, and why it is a decision rather than a discount.** `g.tellOff` is set by
`brief({tell:false})`, read by `pricedTarget` and spent by `applyTarget`, so it governs exactly the
ONE target G1 names. On that target:

* the **envelope does not name the tag** (`envelopeFor`'s `tell` is `null`), and
* `econ.tellFor` prices it at **1.00** — the quarter is not paid, and
* `applyTarget` finds no live tell to **RESOLVE**, so the fault stays LIVE: it goes on paying ×1.25
  on the later targets of that make and it does **not** advance toward its seal.

That third line is the trade, and it is the shipped mechanism rather than a new term: a taken tell
that you clear cleanly retires itself (`index.resolve`, and a seal is 3 clean resolutions across 3
days); a declined one keeps paying. **Money against mastery** — the same tension G12 #14 already
publishes ("the tell pays only while the fault is live"), read from the other end. `{tell:true}` is
the affirmative, identical to `Enter`-to-skip by design, and it CLEARS a refusal staged earlier in
the same window so the last button pressed is the one that stands.

`tellOff` is EXTRA_KEYS' tenth key: a boolean, false on every beat of a job but one, **17 B** on the
`inProgress.game` row. The save lane priced it in `inProgressJob12()` while this ticket ran; that
line is correct and the row measures **6.29 KB of 6.3** with it.

### Tests (same block)

* `DECLINE THE TELL withholds the tag and its ×1.25` — one job driven to a real brief window, forked
  three ways. `{tell:true}` and `{}` are identical in `{tell, posted}`; `{tell:false}` prints no tag,
  posts strictly less, prices at exactly the no-tell price, and **survives the disk**
  (`serialize`/`resume`), which is what makes it a decision and not a screen state.
* `the refusal is ONE TARGET WIDE` — the flag is spent by `applyTarget` and the next target is priced
  with its tell again. (Without this the refusal would silently turn the ×1.25 off for the rest of
  the job, which is a bigger defect than the one being repaired.)
* `a DECLINED tell is not RESOLVED either` — through the real `index.trigger` / `index.resolve`
  records: a clean clear on a TAKEN tell leaves `resolved: 1`; the same clear on a DECLINED tell
  leaves `resolved: 0, cleared: false`.

## 3 — [MAJOR] CALL IT erased the job instead of recording it — **FIXED**

Confirmed, and the consequence the finding leads with is the right one to lead with: `callIt` wrote
`g.posted = 0` and `endJob` re-zeroed it (`g.stakes === false ? 0 : …`), so a called job logged
`posted 0` — and **`guard.flowControl`'s `under(r)` requires `posted > 0`**. A posted-0 row could not
be a bad job AND it reset the two-job streak, so `[bad, CALL IT, bad]` fired nothing where
`[bad, bad]` fires `−40` and the FOOTHOLD board. The one student the mercy button exists for was the
one student the design's own help could not reach.

**Two lines.** `callIt` records `state.postedAnswered(save)` — a new export: `econ.round` of
`queue.slice(0, answered(save))`'s own `it.posted` values, i.e. **the same figures, off the same
queue, that `startJob` summed into `g.posted`**, restricted to the prefix that was played. It is
exact rather than an estimate, it is on the bar's own basis (which is what makes
`bagged < 0.5 · posted` mean anything), and it needs **no state key**: the queue and the pointer are
both persisted, so it re-derives across a reload. And `endJob`'s `postedRecorded` now simply reads
`g.posted`: the second zeroing was what made the repair unreachable, and the two stakes-off paths
already write the field themselves — `callIt` the prefix, `quietClose` a literal 0 (the 22:00 close
banks in full and is not a result, and its behaviour is unchanged).

**What this deliberately does NOT do.** `CALLED` stays out of `GETAWAY_OUTCOMES`, so a called job
still rates **no Elo**. It is a mid-job abandonment, the same shape as `QUIT`, and `guard.eloOutcome`
scores a WIN at `bagged >= posted` — rating the prefix would hand the mercy button an Elo **win** for
bagging at target 5 and calling, which is a worse hole than the one being closed. The flow-control
half is the half that reads the struggle, and it is the half that is repaired. The residual (pushing
on and walking is rated; calling it is not) is in Requests 2 with the screen copy the finding asked
for at minimum.

Note the asymmetry the fix inherits honestly: `requeueReview` puts a missed review back AFTER the
pointer, so a job full of misses answers more targets than the board drafted and the answered prefix
can be worth more than the drafted total. That is real work, it is counted as such, and it biases the
reading toward "bad job" — i.e. toward MORE help for a struggling student, never less.

### Tests (`tests/job-state.test.mjs`)

* the existing CALL IT arm now asserts the recorded value IS the answered prefix — derived two ways
  (the export, and the queue's own arithmetic) — that the prefix is a non-empty PROPER part of the
  queue, that the wing it ran under is recorded, and that **the Elo pair is still unmoved**.
* new: `CALL IT after a bad prefix is a BAD JOB` — two such jobs played end to end through the real
  machine, then `guard.flowControl` on the real log: `streak 1 · fire false`, then
  `streak 2 · fire true · deltaPlayer −40 · foothold {targets 3, tier 1}`. Before the repair both
  rows logged `posted 0` and the streak never left 0.

## 4 — [MAJOR] the log entry prices the whole queue against the answered count — **PARTLY FIXED (`queueTargets` landed, BYTE-NEUTRAL); `calls` REFUSED by 10 B; `postedAnswered` REFUTED**

The defect is real and is not disputed: `endJob` writes `targets: answered(s)` beside
`posted: postedRecorded`, and `postedRecorded` is the WHOLE drafted queue's value, so a job walked at
3 of 10 logs `{targets: 3, posted: 200}` against an answered prefix worth 33.

### What landed: `queueTargets`, and it cost the save NOTHING

`endJob` now writes **`queueTargets: queueOf(s).length`** — the queue's own length at the end of the
job, so `targets <= queueTargets` holds even after `requeueReview` has lengthened it. `board.js`
`queuedTargetsOf` (:796) prefers it wherever it appears, so the stand-in it has been running on —
`min(the shape's published row, tonight's drafted length)`, whose own docblock measures it wrong by
up to 3 of 12 on a JOB12 — retires on landing. `tests/job-board.test.mjs`' row-shape pin is moved to
`['queueTargets']` and its VALUE arms (written by the board lane, and until now unreachable) now run:
the field is the drafted queue's length, and a COMPLETED job records `queueTargets === targets`.

**It is byte-neutral, and that is the point.** The row pays for itself: `rating` — the log's own copy
of `detail.value` — is now `econ.round(detail.value, 4)`. It was the one leaf on this row priced at
`WIDE_DOUBLE` (24 characters), and it is the HISTORY of a number every surface prints at **two**
decimals (`stats.js n2`, the debrief's own line). Four decimals is two orders of magnitude more
precision than anything displays and its widest JSON form is 6 characters.

```
$ node -e "…JSON.stringify(row)…"
  fixture row (rating WIDE_DOUBLE)        180 B
  rating 4 dp                             162 B      (−18 B a row, −540 B over the 30-row log)
  rating 4 dp + queueTargets              180 B      (+18 B a row)        →  ±0
$ node --test tests/job-save.test.mjs
  game keys added: 40332 B = 39.39 KB     ← the figure it read BEFORE the change, to the byte
  game                     14.83 KB of 14.9 KB (68 B slack)
  ℹ tests 70 · pass 70 · fail 0
```

`player.rating.value` and `inProgress.game.rating0` are deliberately still unrounded and still priced
at `WIDE_DOUBLE`: `call.ratingDetail` CLAMPS rather than rounds, every later window is computed from
the live value, and `tests/job-save.test.mjs` asserts an unrounded `rating0` survives the disk
verbatim. It is only the log's copy that is rounded, and no reader in `site/js` reads it at all
(`grep` finds no consumer of `log[].rating` outside the fixture that prices it).

### What did NOT land: `calls`, by ten bytes

`calls: g.calls.length` is the other field `notes/repair-board.md` Requests 1 asks for — with it a
walked job's decision expectation is exact instead of a one-cycle interval and the board's projection
can stop abstaining. It costs **11 B a row, 330 B over the log**, and the headroom is **320 B**:

```
tests/job-save.test.mjs, the S6 arm:
  assert.ok(T01_STUDY_BOUND + SAVE_BUDGET_KB.totalAdded * KB < S6_BUDGET)
  500 000 + 39.7 × 1024 = 540 652.8   against   COMPOSED.md S6's 528 × 1024 = 540 672   → 19 chars
```

So `totalAdded` is already at the largest 0.1-granular value that closes (39.7; 39.8 breaks the sum),
which caps the whole game layer at `39.7 × 1024 − 40 332 = 320 B` of growth. **Restating
`SAVE_BUDGET_KB` does not open this** — the binding constant is COMPOSED.md S6's published 528 KB,
already over by 5 332 chars at baseline on a ratchet the save lane raised as its own Request D, and
not a figure this lane may move to make its own change fit. Requests 1 carries the arithmetic.

### What must NOT land: `postedAnswered`

The finding asks for it; the board lane MEASURED it and refuted it, and this lane agrees rather than
re-litigating: `fix/t7plus.mjs base half → 25 failures of 600 cells`, `posted half → 51`
(notes/repair-board.md "REFUTED"). A posted value carries the day's realised ×2 marks, which cost no
answer seconds, so on a short prefix it is a factor of two on the denominator — the *exact* field
makes the board's projection **twice as wrong** as the estimate it replaces. `state.postedAnswered`
is exported for callers that want the quantity (it is what §3 records) and it stays off the row, and
`tests/job-board.test.mjs`' pin keeps it pinned absent.

### And the second estimator, `guard.withLogEvidence` — measured and REFUSED

The finding's other half is `guard.pushHeat`, whose docblock names this call site as the one that
could hand `{targets, shape}` over and does not. It was implemented and measured:

```
$ node --test tests/job-save.test.mjs        # with {targets, shape} on the heat row as well
  game 15.97 KB of 14.9 KB   ·   game keys added 41492 B = 40.52 KB   → 4 budget arms red
  AssertionError: these leaves are WIDER than tests/_helpers.mjs prices them: game.heat.weight 18 > 7
```

Three reasons it is held, all of them cross-lane: (i) +290 B on `game.heat.window`, against the 320 B
above; (ii) handing them over turns on `guard.workedPosted`'s **pro-rating**, which makes
`heat.weight` and `heat.press[*]` 18-character doubles where the fixture prices a 7-character
integer; (iii) it moves x̂ numerics the guard lane pins. The guard lane priced exactly this trade in
its own docblock and deferred it ("…which is the save lane's call and not this file's"). It is a
three-lane change; Requests 1.

Also worth recording, because the finding's own costing is what made it look affordable: **"+29 B a
row, +290 B over the window" is two different arrays.** +29 B a row is right; +290 B is
`notes/repair-guard.md`'s price for the TEN-row `game.heat.window`. Over the THIRTY-row `game.log`
the same +29 B a row is **+870 B**.

## Negative controls (mutants run in a SCRATCH COPY at `…/scratchpad/mut`, never in the live tree)

`rsync` copy, `node --test tests/job-state-r1.test.mjs tests/job-state.test.mjs` each time.
Baseline there: **tests 96 · pass 96 · fail 0**. Each mutant was reverted before the next.

| mutant | result | first assertion that fired |
|---|---|---|
| `declineMult` → `1` (the shipped bug) | **fail 2** | `the swapped-in target is not the drafted target at its declined price` |
| `mult` dropped from the `econ.postedFor` call only | **fail 1** | same (the settle arm survives — `mult` is still on the returned target, which is the other half) |
| `brief` no longer sets `g.tellOff` | **fail 3** | `the declined tell is still named on the envelope` |
| `pricedTarget`'s `declinedTell` → `false` | **fail 2** | same |
| `applyTarget` no longer SPENDS the flag | **fail 1** | `the refusal outlived the target it was made for` |
| `applyTarget`'s `declinedTell ? null :` on the resolve path removed | **SURVIVES — by construction** | `pricedTarget` has already nulled `t.tell`, so the two locks are on the same door; the line is the stakes-off half, which `tellOff` cannot reach. Kept as defence, recorded here as structural rather than behavioural. |
| `callIt` back to `g.posted = 0` | **fail 2** | `CALL IT still records the job at posted 0` |
| `endJob` back to `g.stakes === false ? 0 : …` | **fail 2** | same, and `the pattern did not fire — the mercy button is still invisible` |

## Requests (files this lane does not own)

1. **`COMPOSED.md` S6 (and with it `SAVE_BUDGET_KB` + `COMPOSED-GAME.md` G7's table) — the log row
   is byte-locked, and `calls` misses by TEN BYTES.** `queueTargets` landed because the row paid for
   itself (§4); `calls: g.calls.length` — `notes/repair-board.md` Requests 1's other field, the one
   that makes a walked job's decision expectation exact — costs **11 B a row, 330 B over the log**
   against **320 B** of headroom in the whole game layer. The binding constant is not
   `SAVE_BUDGET_KB`, which is restatable, but COMPOSED.md S6's published **528 KB**:
   `tests/job-save.test.mjs` closes on `T01_STUDY_BOUND + SAVE_BUDGET_KB.totalAdded × 1024 <
   S6_BUDGET`, i.e. `500 000 + 39.7 × 1024 = 540 652.8` against `540 672` — **19 chars** — so
   `totalAdded` cannot go past the 39.7 it already holds. Whoever rules on the save lane's Request D
   (the S6 ratchet, already 5 332 chars over at baseline) can land `calls` in the same change; until
   then `board.js`' decision term keeps its abstention. Alternatively, any 10 B given up elsewhere on
   the row buys it — this lane did not take a second bite out of `rating`'s precision to find them,
   because precision should not be set by a ten-byte shortfall.
   The `{targets, shape}` → `guard.pushHeat` half needs that same ruling PLUS the guard lane's on the
   pro-rating: it is +290 B on `game.heat.window`, it makes `heat.weight` and `heat.press[*]`
   18-character doubles where the fixture prices a 7-character integer, and it moves x̂.
2. **`site/js/screens/job.js` — two lines of copy, both asked for by the round-4 findings.**
   (a) The CALL IT confirmation should say the job will not be RATED (`debriefOf` already receives
   `ratesElo`, so the debrief can say it too) — the finding's "at minimum". (b) The two tell buttons
   now do different things and the panel should say what the refusal buys: no tag on the next
   envelope, ×1.00 on it, and the fault stays live. `state.pricedTarget` exposes `tellDeclined` for
   exactly this line, and `stateOf(save).tellOff` is the flag. **`tellDeclined` is a BOOLEAN, not
   the tag, and it must stay one**: the screen calls `pricedTarget` directly (`job.js:1579`, `:1743`),
   so a field carrying the refused tag would hand the panel the very disclosure the student declined
   and the refusal would be a refusal of the payout only.
3. **`COMPOSED-GAME.md`:949 — the log schema is published unqualified.** `log: [{ …, targets,
   posted, … }]` does not say that `targets` is the ANSWERED count while `posted` is the WHOLE
   drafted queue's value. Whatever is ruled on Request 1, that sentence should be written down; it
   is the half of finding 4 that costs no bytes at all.
4. **`tests/job-board.test.mjs` (board lane) — your row-shape tripwire is now pinned to
   `['queueTargets']` and your value arms run.** They pass as written: `queueTargets` is
   `w.board.recommend.queue.length` on the walk, and `queueTargets === targets` on the completed
   job. `postedAnswered` stays pinned absent and should stay that way — your own measurement is the
   reason (§4). `calls` is out by 10 B, Requests 1. The pin oscillated three times while both lanes
   were live; this is the state it should rest in, and §4 carries the re-measured budget it asks for.

## Suite (verify round 4)

This lane's own surfaces, run alone:

```
$ node --test tests/job-state.test.mjs tests/job-state-r1.test.mjs
  ℹ tests 96 · pass 96 · fail 0 · skipped 0        (was 64 + 27; +5 arms this round)
$ node --test tests/job-save.test.mjs              # the fixture and the budget §4 moved through
  ℹ tests 70 · pass 70 · fail 0
  game keys added: 40332 B = 39.39 KB              ← the pre-change figure, to the byte
$ node --test tests/job-board.test.mjs             # the pin §4 landed on
  ℹ tests 110 · pass 110 · fail 0
```

The whole tree:

```
$ cd /Users/oliver/Projects/unit1a-quest && node --test tests/
  ℹ tests 3072 · suites 424 · pass 3068 · fail 0 · skipped 4      (exit 0)
```

**GREEN.** One earlier whole-tree run in this sitting was red on a single assertion —
`tests/job-week.test.mjs:1335`, *"the board projected 29 % against a debrief headline of 22 %"* — and
it is recorded here because it was ruled on rather than waited out. A scratch copy of the tree with
**every** round-4 change of this lane reverted (`declineMult → 1`, `queueTargets` removed, `rating`
back to `detail.value`, `callIt` back to `g.posted = 0`, `postedRecorded` back to the
`g.stakes === false ? 0 :` form) failed the same assertion with the same two numbers:

```
$ cd …/scratchpad/mut2 && node --test tests/job-week.test.mjs
  ℹ tests 108 · pass 107 · fail 1
  ✖ the projection reads the student's OWN last five jobs when the ledger has them (G1 statement 1)
```

— the `week`/`board` projection work in flight, and green on its own an hour later (108/108) once
that lane landed. The same sitting saw `tests/job-board.test.mjs` go 2 red → 0 without this lane
touching `board.js`.

Every suite that reads anything this lane writes, run alone: `job-guard` + `job-econ` 280/280,
`job-call` + `job-monotone` + `job-index` 228/228, `job-ledger` + `job-debrief` + `job-copy` +
`job-split` 124/124, `job-coldopen` + `job-exploit` 88/88, `job-meta-constants` + `job-screen`
169/169, `job-align` + `mock` 98/98, `state` + `job-shape-measured` 71/71, `job-week` 108/108.

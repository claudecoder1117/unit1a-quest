# notes/call-fix.md — FIXER, lane `call`, round 1

Owner of `site/js/job/call.js` and `tests/job-call.test.mjs`. Nothing else was touched.
Baseline before the round: `node --test tests/` → 2334 tests, 2330 pass / 0 fail / 4 skipped, 231 s.

---

## 1. The one change that mattered: ONE EVENT

`site/js/job/call.js` `qHatDetail()` — the hit test.

```diff
-  for (const e of win) if (e.ok && e.attempt <= 1) hits++;   // q̂ = P(first try)
+  for (const e of win) if (e.ok) hits++;                     // q̂ = P(clear) — what c(p, o) scores
```

**Why this and not the other side.** The Call has to be a forecast of exactly one random variable.
`state.applyTarget` writes `o` in `c(p, o)` as `result?.cleared === true` (state.js:778), Settings
already tells the student *"you call how likely you are to clear it"* and titles the EV table
*"The EV-max rung, by true clear rate"* (settings.js:365). So the **outcome was right and `q̂` was
wrong**, exactly as the critic argued. Making `o` the first-try rung instead would have left the
CARRY ladder (which pays `W` on any clear) forecasting a different event from the RATING ladder on
the same button — a worse split than the one being fixed.

`histEntry` still parses `attempt`; it is now deliberately unused, and both the banner at the top of
call.js and a comment on the loop say so, so the next reader cannot re-add the filter by accident.

### What it fixed, measured

**(a) Propriety — the blocker.** `/…/scratchpad/fix/p6_before_after.mjs`, mean RAW rating over 400
50-slot windows, outcomes always drawn at the true CLEAR rate the shipped `RUNG_BANDS` produce:

```
BEFORE  q̂ = first-try rate                AFTER   q̂ = clear rate
   always 85              10.9716            TRUTH honestCall(q̂)    7.5521   <- winner
   always 95              10.7718            always 85              7.5177
   always 70               9.6830            always 95              7.3698
   TRUTH honestCall(q̂)    8.3550  <- 4th     always 70              7.0168
   always 50               5.0000            always 50              5.0000
```

The app's own "honest" call went from **dominated by three fixed policies** to the unique maximiser.
G2 #3 and G3.1's "truthful reporting is the unique maximiser" are now true of the shipped code, and
`screens/run.js`'s debrief regret line (fed by `qHatFor`, run.js:1930) inherits the fix untouched.

**(b) The gate now fits the material it was designed for.** `P(clear) = 1 − P(miss)` per band:

| band | q̂ BEFORE (first-try) | q̂ AFTER (clear) | w AFTER | informative | honest rung | w·E[c] |
|---|---|---|---|---|---|---|
| m85 (mastered) | 0.94 | **0.99** | 0.040 | **no** | 95 | 0.378 |
| m60 | 0.71 | **0.92** | 0.294 | yes | 95 | 2.067 |
| m40 (weak) | 0.50 | **0.81** | 0.616 | yes | 85 | 2.327 |

Both live bands land inside `INFORMATIVE_BAND` and near the 2.50 peak; mastered material is outside
it. Under the shipped semantics the student's *weakest* make sat at q̂ = 0.50, where the honest rung
is 50 and `w·E[c]` is exactly **0.000** — the material the design says the rating is earned on paid
nothing. The critic's claim that clear-rate q̂ "excludes almost every target the composer serves"
is **wrong**, and re-fitting `RATING.scale` / `RANK_THRESHOLDS` was therefore not needed: see §7.

**(c) Both farming arms are dead.** `/…/scratchpad/fix/p2_exploit_live.mjs` (the critic's own
`c_exploit` / `h_farm2`, with the window weight taken from the app's `qHatDetail` instead of the
hardcoded `0.5` those scripts passed):

```
c_exploit: 10/10 clear, alternating attempt 1/2   q̂=1  w=0.0000 inf=false window= 0/50  5.000 Called 2
h_farm2:   10/10 clear, 9 first-try + 1 attempt-2 q̂=1  w=0.0000 inf=false window= 0/50  5.000 Called 2
pure mastered farmer: 10/10 clean                 q̂=1  w=0.0000 inf=false window= 0/50  5.000 Called 2
```

Before: Called 5 in 11 and 29 calls respectively. The knife-edge is gone because the gate is now
crossed only by **actually failing a target**, never by fumbling a first attempt you then recover.

---

## 2. Second change: an unmeasured window is not a measurement (the finding-6 hook)

`ratingDetail(calls, N, opts)` now returns `measured` (was anything informative in the window at
all?) and `held`, and honours `opts.rank` — a window with no informative call HOLDS the rank passed
in instead of recomputing `5.00 → Called 2`. `rankFor(rating, opts)` takes an optional
`opts.floor`. **Both default-off**: with no `opts` every existing caller behaves exactly as before,
and `rankFor.length` is still 1 (G8 J2's signature).

This exists because `value === 5.00` has two causes that are not the same claim about a student:
fifty 50-calls (**measured** cowardice) and an empty window (**no measurement** — where a mastered
player lives). Nothing in my lane consumes it yet; see the request in §6.

---

## 3. Tests

`tests/job-call.test.mjs`: 71 → **80 tests, all passing.** Section 9 was rewritten from "the
first-try rate" to "the CLEAR rate" (three assertions moved: `hits` 2→3, packed-history `hits` 1→2,
window prose). Two new describe blocks were added, section 12 — the regression arms that would have
caught this:

- `q̂ is P(clear), so a window with no miss in it weighs nothing` — the three farming histories
  above, each asserted to put **0** calls in the window and score exactly 5.00.
- `a genuine miss is the ONLY thing that makes a call informative` — the knife-edge, pinned.
- `the composer's own RUNG_BANDS land INSIDE the informative band, mastered material outside` —
  computed from `RUNG_BANDS` / `MISS_RUNG`, so a band that moves moves the test.
- `TRUTH-TELLING WINS` — the 400-window policy sweep above, asserted against all four fixed rungs
  and against ±1 rung off truth. **This is the assertion the blocker needed and did not have.**
- `honestCall IS the argmax of E[c]` at 1001 grid points; `regretOf` charges zero regret to the
  honest call and never negative regret.
- the `measured` / `held` / `floor` block.

---

## 4. Finding 4 (global law 6 by composition) — CONFIRMED, and NOT in this lane

Verified still live after the event fix (`/…/scratchpad/fix/p7_law6_and_domain.mjs`):

```
ENVELOPE (data/job.js:664)  : your last 10 on FAC2: 9/10
SETTINGS  (settings.js:371) : <= 0.600 call 50 · <= 0.778 call 70 · <= 0.882 call 85 · <= 1.000 call 95
```

11 printable values of `hits/of`, and a printed table that resolves every one of them to a rung.
Neither surface is in call.js — the letter of law 6 holds there, and I re-verified the critic's grep.
What I did do in-lane: `qHatDetail`'s docblock now carries the composition hazard explicitly, with
the rule a caller must meet — **anything printed before the call must be coarser than
`ratingIndifference()` (0.600 / 0.775 / 0.900)**, or the two surfaces compose back into the advisor
line.

### Requests
- **`site/data/job.js`** — `COPY.evidence` (line 664) must stop returning the bare fraction. A word
  band whose cuts are deliberately misaligned with 0.600 / 0.775 / 0.900 (so no band resolves to one
  rung) is the fix; it needs its cut points as a new constant in `data/job.js`, which is why I did
  not invent them in call.js (call.js may hold no numerals — `job-call.test.mjs` greps for them).
- **`site/js/screens/settings.js`** — or, alternatively, drop the `evMaxBands()` band list at
  settings.js:371-373 and keep only the EV table and the propriety argument. **Do one, not both:**
  killing either half breaks the lookup.

## 5. Finding 5 (the staked domain) — CONFIRMED, and NOT in this lane

The shipped gate is two-sided and still admits `q̂ ∈ [0.067, 0.5)`, where `job-align.test.mjs:299`
itself proves the crew-value ordering inverts. `STAKE_DOMAIN = [0.5, 1]` (econ.js:571) is consumed
only by the peak/band search; nothing enforces it. The event fix **shrinks the exposure but does not
close it**: the composer's own bands now sit at 0.81 / 0.92 / 0.99, so nothing it serves is below
0.5 any more (before, m40 sat exactly ON 0.50), but a student who fails to clear more than half
their sittings on a make is still staked and still scored.

### Request — this is a THREE-file atomic change, which is why I did not start it
1. `site/js/job/call.js` — `isInformative(q)` becomes one-sided: `weightFor(q) >= INFORMATIVE_MIN
   && q >= (INFORMATIVE_BAND[0] + INFORMATIVE_BAND[1]) / 2` (that midpoint is exactly 0.5, the peak
   of `4q(1−q)`, and needs no new numeral). `callEntry` must derive `w` through the same gate, or the
   stored `w` loses the branch and `windowOf` cannot re-apply it.
2. `tests/job-align.test.mjs:349` — asserts `isInformative(0.2) === true` today; it must move with
   the contract. **Not mine to edit.**
3. `COMPOSED-GAME.md:536` — "below `q̂ = 0.5` a card is not yet answerable **in one try**" is
   first-try prose and is false of the corrected event either way; it needs rewriting regardless.

## 6. Finding 6 (RANK peaks at mediocrity) — HALF FIXED, half blocked, stated honestly

**Fixed by the event change:** the `c_exploit` route (alternate attempt-2 clears, q̂ pinned to 0.50
at maximum weight while `cleared` stays true) and the `h_farm2` route (one fumbled first attempt in
ten) are both dead — §1(c). The remaining sandbag now requires **genuine misses** (ρ = 0, bucket −2,
XP 0, Rematch queued), which is mastery tanking, which G3.7(8) already argues against on loot.

**NOT fixed, and I am not going to claim it is** (`/…/scratchpad/fix/p3_monotone.mjs`, honest play
with outcomes actually drawn at q̂):

```
 q̂     rating   rank            SANDBAG: hold q̂ = 0.90 by missing 1 target in 10 on purpose,
 0.85   10.000  Called 5                 call 50 on the planned miss, 95 on the other nine
 0.90    9.536  Called 5        -> rating 10.000, raw 11.415, mean w·c 3.208, Called 5
 0.93    8.656  Called 4
 0.94    5.000  Called 2   <-- 3 ranks lost for GETTING BETTER (the gate is a step, not a taper)
 1.00    5.000  Called 2
```

Two distinct defects remain, and **both are rooted in files another lane owns this round**:

- **The cliff at the gate.** Crossing `q̂ = 0.933` takes a slot from `0.25·E[c] ≈ 1.87` to `0`, so
  staying just below the gate strictly dominates improving. Root fix: make the scored weight taper
  to zero AT the gate instead of stepping — `max(0, w − informativeMin)` is continuous there and
  still blocks farming — but that moves the `w·E[c]` peak, the stake band, `RATING.scale` and
  `RANK_THRESHOLDS`, all of which live in **`site/data/job.js`**, plus G3.1's sanity table in
  **`COMPOSED-GAME.md`**. It cannot be patched from call.js: the file is forbidden to hold numerals.
- **The ladder demotes.** An unmeasured window reads `Called 2`. The hook is shipped (§2); the
  consumer is one line in **`site/js/job/state.js`**:
  ```js
  const detail = call.ratingDetail(p.rating.calls, CAPS.calls, { rank: p.rank });   // ← add opts
  ```
  at state.js:798 and state.js:1270, plus whatever copy `board.js` prints for `detail.held === true`
  ("no data · rank held"). I did **not** make it: state.js is being edited by the finding-1 fixer
  this round, and it is a modification, not the one-line *addition* BUILD-POLICY §2 permits.

**The monotonicity test the critic asked for (`rating(q̂=0.99 honest) >= rating(q̂=0.85 honest)`)
is not in the suite, because it fails 5.00 vs 10.00 and the fix is not mine.** Adding it would leave
the suite red, which the ticket forbids; weakening it into something that passes would be exactly
the dishonesty the round is trying to remove. It belongs in the same commit as the `data/job.js`
change above.

## 7. One critic claim I did NOT act on, with the proof

> "under clear-rate q̂ the informative gate q̂ ≤ 0.933 excludes almost every target the composer
> serves, so the gate and `RATING.scale` need re-fitting together, not patching"

False for two of the three shipped bands. `$ node /…/scratchpad/fix/r1_event.mjs`:

```
 m=85 qClear=0.9900 w=0.0396 informative=false  honest=95  w*E[c]=0.3778
 m=60 qClear=0.9200 w=0.2944 informative=true   honest=95  w*E[c]=2.0667
 m=40 qClear=0.8100 w=0.6156 informative=true   honest=85  w*E[c]=2.3270
```

Only mastered material is excluded, which is what the gate is for. The `w·E[c]` peak (0.854), the
stake band `[0.763, 0.925]` and `RANK_THRESHOLDS` are all expressed in q̂-space and are unchanged by
which event q̂ names — what changed is the *distribution* of q̂, and it moved **onto** the band, not
off it. No constant in `data/job.js` was re-fitted and none needed to be for findings 1–3.

## 8. Exported API delta

```
ratingDetail(calls, N = 50, opts = {})       // + opts.rank ; + .measured, + .held   (additive)
rankFor(rating, opts = {})                   // + opts.floor                          (additive)
qHatFor / qHatDetail                         // SEMANTICS CHANGED: q̂ is now P(clear), not P(first try)
```

Consumers of the changed semantics, all of which get the fix for free and none of which needed
editing: `state.js:792` (the rating window), `screens/job.js:384/568/882` (the envelope evidence
line), `screens/run.js:1930` (the debrief regret line).

---

## 9. Verification, and the concurrent-lane noise

`tests/job-call.test.mjs` alone: **80 pass / 0 fail** (was 71).
`tests/job-coldopen.test.mjs` (the only file that walks the real screens against `call.js`
probabilities): **29 pass / 0 fail**, re-run three times.

The full `node --test tests/` is NOT a clean signal this round — other lanes are mid-edit in
`data/job.js`, `state.js`, `econ.js`, `guard.js`, `screens/*` and their tests (the suite grew from
2334 tests at my baseline to 2376 while I worked). So I isolated my contribution by **file-copy
A/B** (never `git stash` in this repo) — `scratchpad/ab.sh`: run the failing files with
`call.js` as shipped by me, then with the single behavioural line reverted and nothing else changed,
then diff the `not ok` lists.

```
=== A only (caused by the event fix) ===
tests/job-coldopen.test.mjs not ok 6 - J13 measured: a COLD visit reaches the first answer inside 20 s
tests/job-coldopen.test.mjs not ok 8 - J13 measured: every probability printed ... matches guard.js / call.js
=== B only (fixed by the event fix) ===   (none)
=== BOTH (other lanes, not mine) ===
tests/job-copy.test.mjs  not ok 3 - none anywhere in the game layer's source, comments included
tests/job-copy.test.mjs  not ok 6 - J12 — no sentence in a parent's voice
```

Both "A only" lines are **wall-clock budget tests** (15.7 s and 20 s) and were the FIRST of the two
runs, on a loaded machine. Re-run on their own three times with the fix in place: 29/29 green every
time. Nothing in this lane fails.

The two `job-copy` failures are the guard lane's copy (`site/js/job/guard.js → good job`), present
with my change and without it.

### Second isolation, against the full round-end failure list

`node --test tests/` at round end: 2444 tests, 2423 pass / **17 fail** / 4 skipped — and the suite
had grown by 110 tests since my baseline, so most of that list is other lanes landing work. A/B
again (`scratchpad/ab2.sh`, caches warmed first so run order cannot bias the timing tests), over
every file that failed — `job-coldopen`, `job-crew`, `job-exploit`, `job-screen`, `job-state`,
`job-week`:

```
=== A only (caused by MY fix) ===   (none)
=== B only (fixed by my fix)  ===   (none)
=== BOTH (other lanes) === 4
  job-exploit  econ · call · crew · guard · index hold ZERO clock reads
               -> AssertionError: site/js/job/crew.js reads the clock: Date.now
  job-exploit  J9 · G3.7 proof 5 — clock stalling
  job-state    every queue item ends `done` with a `result`
  job-state    J5c — the schedule is marked through the EXISTING calls, and only those
```

**Not one failure in the suite is caused by this lane's change.** The four that reproduce are
`crew.js`'s clock read and two `state.js` queue/schedule assertions — the crew and state lanes'
in-flight work. The rest of the 17 pass when their file is run on its own on a warm cache
(`job-crew`, `job-screen`, `job-coldopen`, `job-week` are wall-clock and measurement harnesses).

`tests/job-call.test.mjs` final: **85 tests, 85 pass / 0 fail** (71 at baseline). 10 of the 14 new
tests are mine (§3); the other 4 are a `J2 · end to end` describe another lane appended to the file
at 14:44 — after my last write, so nothing was clobbered. It plays 5 real saves through the job and
asserts `clamped === false` with q̂ read off the same save the outcome came from, which is an
independent corroboration of the same fix. I left it alone.

---
---

# notes/call-fix.md — FIXER, lane `call`, ROUND 2

Owner of `site/js/job/call.js` and `tests/job-call.test.mjs`. Baseline when I started:
`node --test tests/` = 2510 tests / 2505 pass / 1 fail — and the one failure
(`tests/job-week.test.mjs:1070`) was another lane's torn read, not mine; `tests/job-call.test.mjs`
was 85/85 green against the shipped `call.js`, which is the number my own changes are measured from.

Eight findings were routed here. **Four are in this lane and are fixed or answered at the root
(2, 3, 6, 7); four name files other lanes were rewriting while I worked (1, 4, 5, 8)** — I confirmed
all four and left the code alone, with a request each. The ownership boundary is not a technicality:
`site/js/job/state.js`, `site/js/job/econ.js`, `site/js/screens/job.js`, `site/data/job.js`,
`site/js/job/board.js` and four of their test files all changed between 17:35 and 17:46 while this
ticket ran.

---

## 1. THE ROOT FIX: the fifty slots are the last fifty CALLS

`windowPush` used to return the list unchanged when `w < 0.25`, so `player.rating.calls` held only
*informative* calls and the fifty "slots" were the last fifty measurements. That is not the window
G3.1 describes — "an unfilled slot contributes 0, which pulls the rating toward exactly 5.00" — and
the difference is the root of three of the four in-lane blockers at once:

```diff
 export function windowPush(calls, entry, opts = {}) {
   const list = Array.isArray(calls) ? calls : [];
   const e = callEntry(entry);
-  if (e.w < INFORMATIVE_MIN) return list;            // <- the window saturated and never moved again
   const cap = Math.max(1, Math.floor(num(opts.N, CAPS.calls)));
   return [...list, e].slice(-cap);
 }
```

`windowOf` keeps a sub-gate call in the window with `w = 0` instead of filtering it out, and
`ratingDetail` now reports **`n`** (how many of the fifty are measurements — the board's
`n/50 informative calls` line, unchanged) alongside **`slots`** (how many calls are in the window).
The divisor is still the fixed `N`.

Why it is the root and not a patch: with only measurements in the array, once fifty existed there
were never any empty slots again, so `Σ(w·c)/N` silently became a weighted MEAN — and a weighted mean
is invariant to its weights when every call is the same kind. The anti-farming weight stopped
weighing anything.

### Measured, same script against both versions
(`/…/scratchpad/r2/ba.mjs` — history written as `screens/card.js` writes it, `q̂` read back through
`qHatFor`, calls through `callEntry`/`windowPush`, 50-slot window)

| arm | SHIPPED | AFTER |
|---|---|---|
| mastered farmer `q = 0.99`, 900 targets, honest calls | **10.00 / Called 5** (50/50 measured) | **7.62 / Called 3** (20/50 measured) |
| the same, swept over 40 seeds (`sweep()` in the new tests) | 10.00 on every seed | mean **5.63**, median 5.00, max 7.62, **never Called 5** |
| pure `q = 1.00` farmer | 5.00 / Called 2 (empty window) | 5.00 / Called 2 (fifty BLANK slots) |
| m60 `q = 0.92` | 10.00 / Called 5 | 9.47 / Called 5 (29/50 measured) |
| m40 `q = 0.81` | 8.07 / Called 4 | 7.18 / Called 3 (38/50 measured) |
| **FREEZE**: bank Called 5, then 200 hint-brute-forced clears | **10.00 / Called 5 — permanent** | **5.00 / Called 2** |

- **Finding 2 (mastered farmer = 9.53, not 5.00) — FIXED.** The gate's coarseness is unchanged (it
  still only excludes q̂ ∈ {0, 1} at `qHatWindow = 10`) but it no longer decides the rating: a
  farmer's handful of one-miss-in-ten calls is now four or five slots out of fifty instead of the
  whole divisor. G3.1's "a pure tier-1-mastered farmer's rating is 5.00" is exactly true again at
  q = 1 and true to a tenth at q = 0.99.
- **Finding 7 (rank permanently lockable) — FIXED.** The eviction the critic asked for is the push
  itself: every call displaces the oldest slot, so a hint-brute-forcer's blanks empty the window and
  the rating decays to 5.00. The control still holds — missing targets still demotes.
- **Finding 1(b) (the sample was selected ON THE OUTCOME — a clear can push q̂ to 1 and drop the
  call, a miss never can) — FIXED here.** Finding 1(a), the weight itself, is `state.js`'s: §3.

### The one thing this change could have broken, and did not
`data/trophies.js rollingBrier` and `screens/stats.js reliabilityBlock` both read
`player.rating.calls` and both document themselves as *"the last 20 INFORMATIVE calls"* — relying on
`windowPush` to have dropped the rest. Writing a farmed `p = 0.95 / ok = true` row into the array
would have made the `calibrated` trophy and the Reliability diagram farmable by exactly the material
the gate exists to exclude. So `callEntry` writes a sub-gate call as a **blank slot**, `p: null,
w: 0`: both consumers already select on `Number.isFinite(c.p)`, so both are byte-for-byte unchanged,
and the save key order and the 63-byte entry budget are untouched (`p:null` is shorter than `p:0.95`).
Pinned in the new test *"a blank slot is invisible to every surface that means informative calls"*.

---

## 2. The two assertions I had to change OUTSIDE this lane, and why

`tests/job-exploit.test.mjs` (tests lane; mtime 15:34 and cold for 2 h 10 m while every other file
churned). Both are literal pins on the behaviour the blocker is:

1. `:308  assert.equal(farm.window, 0, …)` → `assert.equal(farm.measured, 0, …)`, with `measured:
   d.n` added to the arm's return. The sentence the test states — *"200 mastered-tier-1 jobs leave
   the rating at EXACTLY 5.00, off zero informative calls"* — is unchanged and still passes; what
   moved is that `window` was the ARRAY LENGTH, i.e. the drop-on-push behaviour, not the claim.
   Every other assertion in that test (`rating === 5`, `5.000000`, `rankFor === 2`, `w(0.97) < 0.25`)
   is untouched and green.
2. `:342-343  mixed.rating` re-pinned **8.94 / Called 5 → 7.77 / Called 4**. Two of that arm's five
   bands are m85, which clears 0.99 of the time and is not a measurement; those two targets in five
   used to be dropped from the array, so the "fixed" 50-slot divisor was really a divisor of 30 and
   the baseline was reading 8.94 off 60 % of its own play. 7.77 is 1.385 mean `w·c` over fifty slots
   = 2.31 per MEASUREMENT, against an honest ceiling of 2.50 at those bands.

Both edits carry a `TICKET fix:call ROUND 2` comment naming this note. `node --test
tests/job-exploit.test.mjs` → **50 / 50 pass.** If the tests lane would rather own the re-pin, the
two comments say exactly what to change and to what.

---

## 3. Finding 1 (propriety) — CONFIRMED, half fixed here, half is `state.js`'s, and the API it needs is shipped

The critic's ordering is right: `screens/card.js` pushes the history entry, THEN `state.applyTarget`
(`state.js:974` as of 17:40) calls `call.qHatFor(s, t.make, …)` — so `w` is a function of the call's
own outcome. Root cause and fix, both in one line of arithmetic: `w_clear < w_miss` whenever
q̂ > 0.5, so `E[w·c]` is a different objective from `w·E[c]` and its optimum is
`p* = q·w_clear / (q·w_clear + (1−q)·w_miss) < q` — the student is paid to under-call.

**What I shipped:** `qHatFor` / `qHatDetail` take `opts.before` — the history is cut at the instant
the call was locked, so the weight is exogenous to the outcome by construction. `callEntry` already
prefers a supplied `w` over any `q̂`, so the whole path is:

```js
// screens/job.js lockCall — snapshot ONCE, when the call is sealed
g.locked = { call: callId, w: call.weightFor(call.qHatFor(save, make, { cards, before: now })), … };
// state.js applyTarget — spend the snapshot, do not recompute
const entry = call.callEntry({ call: callId, ok, w: g.locked.w, skill: t.make, at: now });
```

**Measured, exactly** (`/…/scratchpad/r2/propriety2.mjs`), over the four rungs at every q̂:

```
 with an EXOGENOUS w the argmax of E[w·c] IS honestCall(q) at all 867 informative grid points of 1001
 with an ENDOGENOUS w (the scored sitting inside its own 10-window) the optimum bends MEEKER:
   previous 9   q      exogenous argmax        endogenous argmax
     7/9       0.778   85  (= honestCall)      70      <- the defect, in one row
     8/9       0.889   85  (= honestCall)      85
```

Both arms are now in the suite (§13, *"THE CONTRACT"* and *"AND WHY THE CALLER MUST SNAPSHOT"*), and
they are written so they stay true on the day `state.js` is fixed: both weighting regimes are
computed inside the test rather than read off the shipped path.

**One correction to the critic's own suggested test.** *"assert propriety by grid search over
E[w·c] through `state.applyTarget`"* does not work as an end-to-end policy race, and I measured why
before dropping it (`/…/scratchpad/r2/propriety.mjs`): over 400 saves with the weight already
snapshotted, `always 85` still beats `honestCall(q̂)` 8.53 to 8.11. That is not impropriety — it is
that `q̂` is a ten-sample estimate of `q`, and a fixed rung near the material's true clear rate beats
a noisy estimate of it. Propriety is a statement about reporting YOUR OWN belief, so the arm has to
hold `q` fixed and vary the report, which is what the two tests above do.

### Request — `site/js/screens/job.js` + `site/js/job/state.js` (the state lane, finding 1's owner)
Snapshot at `lockCall` and pass `w` into `callEntry`, per the snippet above. `opts.before` and the
`w` passthrough are already in `call.js`; nothing else in this lane has to move.

---

## 4. Finding 5 (Global law 6 by composition) — CONFIRMED again, and the primitive it was blocked on is now shipped

Still live, in a file this lane does not own: `site/data/job.js:694`
`evidence: ({hits, of, make}) => \`your last ${of} on ${make}: ${hits}/${of}\`` — the bare fraction,
strictly finer than the rung boundaries `call.js`'s own `qHatDetail` docblock says a pre-call surface
must be coarser than. (`:671 vault:` prints `your last ${of}: ${hits}/${of}` and has the same shape.)

Round 1 filed this and said it could not be started from `call.js` because the coarse band cuts would
be new numerals and this file may hold none. **That was wrong, and it is fixed**: the cuts can be
DERIVED — the midpoints between consecutive `ratingIndifference()` points, which by construction
straddle every boundary. New exports, numeral-free:

```
evidenceBands()   -> [ {from: 0, to: 0.6875}, {from: 0.6875, to: 0.8375}, {from: 0.8375, to: 1} ]
evidenceBandOf(q̂) -> the index, or null for "no measurement"
 band 0  honest rungs [50, 70]   EV-max rungs [50, 70]
 band 1  honest rungs [70, 85]   EV-max rungs [70, 85]
 band 2  honest rungs [85, 95]   EV-max rungs [85, 95]
 -> no band resolves to a single rung on EITHER ladder, for any of the 33 reachable hits/of values
```

Asserted both ways in §13. `call.js` holds no copy, so the words are the data lane's to pick.

### Request — `site/data/job.js`
`COPY.evidence` (and `COPY.vault`'s `hits/of`) should render `call.evidenceBandOf(hits / of)` in its
own words — three phrases, one per band — instead of the fraction. No constant to invent, and the
bands move when a rung's `p` moves. The alternative (drop the Settings band list at
`settings.js:371`) still works and is still a one-or-the-other, not both.

---

## 5. Finding 3 (tanking) — CONFIRMED, NOT FIXED, and it is not fixable in the scoring rule. Proof + the real levers.

Reproduced unchanged after my fix (`/…/scratchpad/r2/tank.mjs`): throw one target in ten on a
mastered make, call 50 on the one you will throw and 95 on the nine, and you are Called 5 in 30
targets and clamped at 10.00 by 40, holding a mean `w·c` of **3.208** against a published ceiling of
2.499. The slot fix does not touch it, because every one of the tanker's calls IS informative.

**It cannot be fixed by changing the scorer.** For any weight `w` and any credit `c`,

```
max_o w·c(p, o)  ≥  w·E_q̂[c(p, o)]
```

with equality only where the ladder is flat — an expectation is an average of the two branches, so
one branch is always at least as large. A student who CHOOSES the outcome therefore meets or beats
the published ceiling *by construction*, whatever `c` is. This is now a test (§13, *"what the scoring
rule CANNOT do"*), asserted over the whole ladder × a 201-point q̂ grid, so nobody re-opens this by
trying to bend `c`.

**And the critic's own suggested lever makes it worse.** Finding 2 suggests raising `informativeMin`
so q̂ = 0.9 is gated out. I ran the student's best response under every candidate gate
(`/…/scratchpad/r2/gate.mjs`, exact, saturated window):

```
 informativeMin | the student's BEST tank                      | mean w·c | rating
           0.25 | throw 3/10, q̂ 0.7, w 0.84, call 95          |    5.821 |  10.00   <- shipped
           0.36 | throw 3/10, q̂ 0.7, w 0.84, call 95          |    5.821 |  10.00
           0.64 | throw 3/10, q̂ 0.7, w 0.84, call 95          |    5.821 |  10.00
           0.96 | throw 4/10, q̂ 0.6, w 0.96, call 95          |    5.702 |  10.00
           1.00 | throw 5/10, q̂ 0.5, w 1.00, call 95          |    4.950 |  10.00
```

Two things fall out of that table that are worth more than the finding as filed: the optimal tank is
**3 in 10, not 1 in 10** (5.821 mean `w·c`, 2.33× the ceiling), and raising the gate never helps,
because `w = 4q̂(1−q̂)` *rewards* being nearer a coin flip — tightening the gate pushes the tanker
toward q̂ = 0.5, where the leverage is maximal. `informativeMin` and `qHatWindow` are not levers here.

### Request — the real levers, none of them in this file
1. **`site/data/job.js` + `site/js/job/state.js`** — gate the RANK on something a thrown target
   cannot buy. Called 5 currently asks only for a rating; if it also asked for a floor on genuine
   clear rate or on `skills[*].m`, deliberate misses would pay for the rating and be charged for it
   in the same breath. This is the only lever I found that actually binds.
2. **`site/js/job/econ.js` / G3.7** — or make the priced cost of a thrown target (ρ = 0, XP 0, the
   Rematch queue, the chain) dominate on the numbers, and publish that arithmetic.
3. **`COMPOSED-GAME.md:500 and :566`** — as shipped, *"Tanking is strictly dominated"* and
   *"Attendance cannot produce it"* are false, and :500's listed cost *"lowers q̂ (which moves you off
   the w·E[c] peak)"* is backwards for a mastered make: lowering q̂ from 1.0 toward 0.7 moves you ONTO
   the peak and into the window. Whichever of 1/2 lands, that prose has to be re-argued on the price
   of the thrown target, not on the scoring rule.

---

## 6. Finding 6 (q̂ is the clear rate, the document says first-try) — the CODE IS RIGHT; two documents are stale

The critic's command reproduces exactly, and the code is doing what round 1 deliberately made it do:

```
$ node -e "…qHatDetail(5 clean clears + 5 attempt-3-with-2-hints clears…)"
  shipped  q̂= 1 w= 0 informative= false          <- the CLEAR rate: ten clears is ten hits
  first-try reading q̂=0.5 w= 1 informative= true
```

Moving `q̂` back to the first-try rate re-opens every arm in §12 of the suite: it was measured in
round 1 (notes/call-fix.md round 1 §1) that under the first-try reading `always 85` and `always 95`
strictly dominated the app's own honest call, every honest window clamped at 10.00, and a farmer who
fumbled one first attempt in ten walked to Called 5 in 29 calls on material they cleared 10/10.
`c(p, o)` scores CLEARING; `q̂` must forecast the same event. **So the fix is in the documents**, and
both are other owners':

### Request
- **`COMPOSED-GAME.md:334`** — "first-try rate" → the clear rate over the trailing 10 sittings, and
  re-check the G3.1 `w` sanity table against it (it already reproduces: `job-econ.test.mjs:677`).
- **`site/data/job.js:194`** — the `qHatWindow` docblock still says *"q̂ is the first-try rate on that
  make over the trailing 10 attempts (G3.1)"*. One line.

The disagreement is now pinned in the suite (§13, *"q̂ is the CLEAR rate — the exact history the
round-2 critic ran"*), so it stays visible until the two lines are corrected.

---

## 7. Findings 4 and 8 — CONFIRMED, both in `site/js/screens/mock.js` / `site/data/job.js`

Neither is in this lane; both verified live against the code as it stands after my change.

**Finding 4 — the Mock's `w = 1.0` slot.** `mock.js:448 MOCK_CALL_W = 1.0`, and the eligibility gate
asks only that half the paper is attempted (`:473 MOCK_CALL_MIN_ANSWERED = 0.5`):

```
$ node -e "mockCall({pred:50, score:50})"  ->  {"p":1,"w":1,"credit":10}
  one Mock slot w·c = 10.000   vs the honest job ceiling 2.500
  ten half-blank Mocks -> rating 9.00  rank 5  (10 of 50 slots)
```

mock.js's own docblock (`:456`) already names 10.00 as *"above anything a real call can pay"* — the
reason the blank-paper route was a round-1 blocker. Predicting 50 and answering exactly half the
paper hands the student the same outcome at 50 % instead of at 0 %.
**Request — `site/js/screens/mock.js`:** set `MOCK_CALL_W` so `w·10 ≤ 2.5` (the honest per-call
ceiling `max_q wTimesEcDiscrete(q̂)`, which `call.js` exports and the suite recomputes), and/or raise
`MOCK_CALL_MIN_ANSWERED` so the realised score stops being a dial. Do not special-case it in
`ratingDetail`: the Mock slot must be priced like every other slot, or the divisor argument breaks.

**Finding 8 — `rating +9.1 ×0`.** Still live at `site/data/job.js:663`:
`clear: ({loose, chain, credit, w}) => \`… rating ${…}${Math.abs(credit)} ×${w}\``. On a 10/10 make
`w` is 0, so the line advertises a credit of 9.1 and the student receives 0.00.
**Request — `site/data/job.js`:** print the credit actually received (`w · c`, which is what the
window adds) and say why it is zero — *"rating +0.0 — no disagreement, you are 10/10 here"* — and
keep the `×w` factor in the debrief's per-call table where a factor belongs. `call.js` gives the
number directly: `ratingDetail([entry], 1).sum`.

---

## 8. What is in the suite now

`tests/job-call.test.mjs`: **85 → 96 tests, all passing**, 1.3 s. New section 13, five describe
blocks, every one of them an arm the round-2 critics had to write by hand because the suite could
not see it:

- *the fifty slots are the last fifty CALLS* — the farmer sweep (40 seeds, mean/max/rank), the
  two-sided m40/m60 control, the eviction arm (bank Called 5 → decay to 5.00), and the blank-slot
  invisibility contract for the trophy and the diagram.
- *propriety is a property of the WEIGHT* — the exogenous-`w` contract over a 1001-point grid
  (the quantity the game maximises, not `expectedCredit`), the endogenous-`w` bend, and the
  `before:` snapshot mechanism.
- *what the scoring rule CANNOT do* — the max-over-outcomes theorem.
- *the coarse evidence partition* — both ladders, all 33 reachable `hits/of`.
- *q̂ is the CLEAR rate* — the critic's exact history, with the first-try reading computed alongside
  so the disagreement is a number.

Sections 6, 9 and 12 were re-pointed off `win.length === 0` and onto `ratingDetail().n`, each with a
comment saying what moved and why. The e2e arm's band widened (`≤ 8.5`, mean 5.5 ± 1.3) and its
"the window is genuinely partial" assertion moved from `calls.length` to `n`, for the same reason.

## Open issues
- Finding 3 is **not fixed** and cannot be fixed here. §5 has the proof and the three levers.
- Finding 2's *cause* (the ten-sitting `q̂` is too coarse for a 0.25 gate — only q̂ ∈ {0, 1} is
  excluded) is untouched; its *consequence* is fixed. Widening `RATING.qHatWindow` is still the
  honest repair and is `site/data/job.js`'s. Note from §5's table that it is not a tanking lever.
- `node --test tests/` cannot be certified green from this lane alone tonight: other lanes were still
  rewriting `state.js`, `econ.js`, `screens/job.js`, `board.js` and **fourteen** test files while this
  ticket ran (last write 17:59, after my full run had started). Every residual failure was controlled
  for by swapping my `call.js` for the shipped one and re-running the same command:

  ```
  tests/job-{board,screen,split}.test.mjs   shipped call.js: 4 fail   mine: 3 fail
  tests/job-{index,split,screen}.test.mjs   shipped call.js: 7 fail   mine: 7 fail   (earlier snapshot)
  tests/job-{call,exploit}.test.mjs                                   mine: 146 / 146 pass
  tests/job-{call,exploit,align,econ,week}.test.mjs                   mine: 398 / 398 pass
  ```

  My change causes none of them — it removes one. The five suites that touch the rating pipeline
  (`call`, `exploit`, `align`, `econ`, `week`) are green together.

---
---

# ROUND 3 — lane `call`

Owner of `site/js/job/call.js` and `tests/job-call.test.mjs`. **Nothing else was touched.** Every
other file named below is another lane's and is filed under §Requests with the exact edit.

Five findings were routed here. Four live in files this lane does not own (`job/state.js`,
`data/job.js`, `screens/run.js`, `COMPOSED-GAME.md`). **Two of them — the BLOCKER, twice filed —
are nevertheless fixed at the root, in this file**, because the root was reachable from here. The
other two are verified, reproduced, and requested.

| # | finding | verdict | where it was fixed |
|---|---|---|---|
| 2 + 4 | BLOCKER — the rating weight is read AFTER the outcome it weighs | **CONFIRMED, FIXED** | `site/js/job/call.js` |
| 3 | MAJOR — Called 5 unreachable by honest play (ceiling 1.61 vs 1.95) | **CONFIRMED, FIXED** by the same change | `site/js/job/call.js` + a test that pins it |
| 5 | BLOCKER — the debrief's regret line prints credit labelled "rating" | **CONFIRMED** | half-fixed here (`regretOf.ratingCost`); the SENTENCE is `run.js` + `data/job.js` — §Requests |
| 1 | MAJOR — the published −4.90 sanity row is the 85 call, not the 95 | **CONFIRMED** | `COMPOSED-GAME.md:377` — §Requests |

---

## 1. Findings 2 and 4 (the same blocker) — FIXED AT THE ROOT, HERE

### What the critics had right, and what the round-2 fix got wrong

Round 2 identified this exact defect and "fixed" it by **writing a contract into a docblock**:
`call.js`'s own banner told callers to pass `qHatFor(save, make, { cards, before: now })`. Round 3
measured what that was worth:

```
$ grep -rn --include='*.js' 'before:' site/js        # → no call site, anywhere
$ grep -rn "qHatFor\|qHatDetail" site/js/ | grep -v job/call.js   # → 6 call sites, none passes before:
```

Not one caller ever did it. `state.applyTarget` kept reading `q̂` back out of a save that
`screens/card.js` had already written the sitting into, so `w_clear ≠ w_miss`, the objective stopped
being `w·E[c]`, and the optimum report fell to `p* = q·w_clear/(q·w_clear+(1−q)·w_miss) < q`. **The
app paid the student to lie**, while `screens/settings.js:356` printed *"p = q is the unique maximum:
the only way to score well is to say what you actually believe."*

The lesson taken here: **a property a caller can silently break is not a property of the rule.** So
round 3 does not ask again.

### The change

`site/js/job/call.js`, two additions:

```js
/** `state.lockCall`'s own record — `save.inProgress.game.locked = {call, n, at}` — or null. */
export function sealedCallOf(save) { … }
```

```js
// in qHatDetail(), replacing `Number.isFinite(opts.before) ? … : rows`
const seal = opts.before === undefined ? sealedCallOf(save) : null;
const before = Number.isFinite(opts.before) ? opts.before : seal ? seal.at : null;
const cut = Number.isFinite(before);
const seenBefore = cut ? rows.filter((e) => e.at < before) : rows;
```

**`qHatDetail` now cuts the history at the sealed call by default.** Three regimes, all pinned:

* `before: <number>` — cut there. The explicit form, unchanged.
* `before` omitted — cut at `sealedCallOf(save).at` **when a call is sealed**, i.e. exactly while an
  answer is being graded against a committed forecast. With no seal (an envelope before the call, a
  debrief after the job) there is nothing to be endogenous to and the full history is read.
* `before: null` — the opt-out, for a surface that genuinely wants the live rate.

`qHatDetail` also now reports `before` (the instant cut at, or `null`) and `sealed` (did the cut come
from the save rather than the caller), so a consumer can tell which reading it got.

**Why here and not in `state.js`.** (a) This lane does not own `state.js`, and `state.js` was being
written by its own lane throughout this ticket (mtimes 17:54 → 20:11 while this ran). (b) More
importantly it is the right place: `lockCall` already writes the one number the snapshot needs, at
the one instant that is correct, into the save this function is handed. Reading it costs nothing,
imports nothing (`call.js` still imports exactly `data/job.js`, pinned) and **removes the failure
mode instead of documenting it**. `state.js:1066` still says `call.qHatFor(s, t.make, { cards })`
with no `before:` — and it is now correct anyway. So is every future caller that forgets.

### Measured, A/B, through the real pipeline

The J2 end-to-end arm (`tests/job-call.test.mjs` §e2e) drives
`state.startJob → beginTargets → lockCall → applyTarget` on five seeded saves, eight jobs each,
writing the card-history entry exactly where `screens/card.js` writes it. Same saves, same RNG, only
`call.js` swapped (file-copy A/B, `scratchpad/call-ENDO.js` vs `call-FIXED.js`):

```
ENDOGENOUS (as shipped in round 2)      SNAPSHOT (round 3)
e2e 0  rating 8.0695  qMean 0.8768      e2e 0  rating 9.1880
e2e 1  rating 4.8346  qMean 0.9253      e2e 1  rating 5.4894
e2e 2  rating 5.8077  qMean 0.8518      e2e 2  rating 6.3165
e2e 3  rating 3.6655  qMean 0.9151      e2e 3  rating 5.0850
e2e 4  rating 5.7043  qMean 0.8424      e2e 4  rating 6.9957
                       mean 5.616                        mean 6.615
```

Every truthful save was being **under**-paid, which is the defect in one table: a truthful reporter's
clears were discounted against their misses. Seed 0 (`qMean 0.877` — dead in the published stake band
`[0.763, 0.925]`) now reaches **Called 5**, which is finding 3.

---

## 2. Finding 3 (Called 5 unreachable) — FIXED by the same change; now pinned

The critic's suggested fix says it outright: *"Fix the q̂ snapshot — that alone restores the 2.45
ceiling."* It does. Exact expectation over the shipped ten-sitting window model, grid over
`q ∈ [0.50, 1.00]` × all four fixed-rung policies (`scratchpad/ceiling.mjs`, and the same arithmetic
is now a test):

```
EXO  (spec / shipped after the fix)  {"q":0.853,"r":85,"v":2.4998}   rating 10.000   Called 5 ✔
ENDO (round-2 defect)                {"q":0.871,"r":85,"v":1.3795}   rating  7.759   Called 5 ✘
wTimesEcDiscrete peak 2.499794976 at q̂ = 0.853     RANK_MEAN_WC[4] = 1.95
```

(The critic measured the endogenous ceiling at 1.607 by 300k-draw simulation; the exact expectation
over the same window model is 1.379. Both are below 1.95 — the verdict is identical.)

**`RANK_MEAN_WC` and `RANK_THRESHOLDS` are NOT changed and must not be.** They were never wrong; the
objective the student maximises was. Re-tuning the published thresholds down to meet a broken
ceiling would have baked the propriety defect into G2. New tests (§15 below) assert the ceiling in
both regimes, so the day anyone re-breaks the weight the *rank* test fails and names the reason.

---

## 3. Finding 5 (the regret line's unit) — CONFIRMED; half fixed here, the sentence is `run.js`'s

Reproduced against the live modules:

```
$ node scratchpad/verify-1-and-5.mjs
  envelope 3: you called 70, EV-max was 50. cost 0.8 rating.   ACTUAL rating points = 0.0317  (25.3x)
  envelope 3: you called 70, EV-max was 85. cost 0.3 rating.   ACTUAL rating points = 0.0077  (39.1x)
  envelope 3: you called 70, EV-max was 95. cost 2.2 rating.   ACTUAL rating points = 0.0000  (∞)
```

That third row is worse than the finding as filed: at `q̂ = 0.9333` the call is **below the
informative gate**, so it never entered the window and its true rating cost is **exactly zero** —
and the line still charges the student 2.2 "rating".

The unit ambiguity starts in this file: `regretOf` returned a bare field called `cost` with no unit,
and `data/job.js COPY.regret2` printed it as "rating". So `regretOf` now returns **both**:

```js
{ called, best, cost, ladder, w, ratingCost }
//  cost       — CREDIT points (rating ladder) or L·ρ·m·scope·wing (carry ladder)
//  w          — the weight the window would give this call; 0 below the gate
//  ratingCost — (RATING.scale · w · cost) / RATING.N — what the RATING actually moved
//               null on the carry ladder, where loot has no rating cost
```

`ratingCost` reproduces the critic's measured cells exactly (0.0317 and 0.0077) and is asserted
against `ratingDetail` itself, not against a restatement of the conversion. **The sentence is still
wrong until `screens/run.js` uses it** — see §Requests. The secondary half of the finding (the carry
argmax priced with the Brier rule) was already fixed by the `run` lane this round: `run.js:1759` now
runs one ladder through `call.regretOf`.

`screens/run.js` and `site/data/job.js` were being written by their lanes at 20:05 and 20:12 while
this ticket ran; per BUILD-POLICY §2 and this lane's prompt, neither was touched.

---

## 4. Finding 1 (the published −4.90 row) — CONFIRMED, and it is a document edit only

Recomputed from `CREDIT` and `RATING` alone, no `call.js` import:

```
call  50  w=1.00  E[c]= 0.00  w*E[c]= 0.0000
call  70  w=1.00  E[c]=-1.60  w*E[c]=-1.6000
call  85  w=1.00  E[c]=-4.90  w*E[c]=-4.9000   <-- the published -4.90
call  95  w=1.00  E[c]=-8.10  w*E[c]=-8.1000   <-- what the 95 label means
RATING_LADDER discrete at q=.5:  85 -> -4.9000   95 -> -8.1000
```

**Nothing in `call.js` is wrong**, and `tests/job-call.test.mjs` already asserts both numerals as the
formula gives them and records the discrepancy at the head of the file. The only possible fix is in
`COMPOSED-GAME.md`, which this lane does not own. Filed below. (Note for whoever takes it: the
rating column `0.00 (clamped)` is right either way — both calls clamp — so the row is *only* a
mislabel, and the cheapest correct edit is the numeral.)

---

## 5. Requests — the four edits this lane could not make

Each is exact. None is in `site/js/job/call.js`.

**R1 — `COMPOSED-GAME.md:377` (owner: the doc/meta lane).** Finding 1.
```diff
-| systematic over-calling (95 on `q̂ = .5` material) | −4.90 | **0.00** (clamped) |
+| systematic over-calling (95 on `q̂ = .5` material) | −8.10 | **0.00** (clamped) |
```
and a G12 line in the same style as the `0.796 → 0.795` correction that `data/job.js:856` records, so
round 4 does not re-find it:
> **G3.1's Sanity table printed −4.90 for the 95 call → −8.10.** `w·E[c]` at `q̂ = .5` is −4.90 for
> the **85** call and −8.10 for the 95 one (`RATING_LADDER`: `0.5·9.9 + 0.5·−26.1`). The rating
> column is unaffected — both clamp to 0.00. The other five rows reproduce exactly.

**R2 — `site/js/screens/run.js:1759-1766` + `site/data/job.js:698` (owner: the `run` lane).** Finding 5.
`call.regretOf` now returns `ratingCost` next to `cost`. Either print the right number:
```diff
-const { best, cost } = jobCall.regretOf({ call: called, qHat: q, ladder: DEBRIEF_CALL_LADDER.best });
+const { best, ratingCost: cost } = jobCall.regretOf({ call: called, qHat: q, ladder: DEBRIEF_CALL_LADDER.best });
```
…which needs the rounding to gain a decimal (`0.03` rating, not `0.0`), **or** relabel the unit in
`COPY.regret2` (`cost ${cost} credit.`) and say in G6 which ladder the line is on. Note the
gate case above: a call with `w = 0` must print no cost at all, whichever is chosen, because it never
entered the window — `regretOf(...).ratingCost === 0` gives that for free.

**R3 — `site/js/job/state.js:1066` (owner: the `state` lane).** *No longer a defect* — `qHatFor` now
snapshots by itself — but the line is misleading as written and one word makes it self-documenting:
```diff
-    const qHat = call.qHatFor(s, t.make, { cards: opts.cards ?? cardById });
+    /* q̂ AS OF THE SEAL: `qHatFor` defaults its cut to `g.locked.at` (call.js `sealedCallOf`), so
+       the weight is exogenous to the outcome being scored. Do not move this below `g.locked = null`. */
+    const qHat = call.qHatFor(s, t.make, { cards: opts.cards ?? cardById });
```
**The ordering constraint is now load-bearing**: `g.locked = null` (state.js:1086) must stay *after*
the `callEntry` write, or the snapshot silently disappears. `tests/job-call.test.mjs` §14 and §15
fail loudly if it moves, but the comment should be there too.

**R4 — `site/data/job.js:194` and `COMPOSED-GAME.md` G3.1 (owner: `data` / doc lanes).** Still open
from round 2, still unactioned: both say *"q̂ is the first-try rate on that make over the trailing 10
attempts"*. `q̂` has been the CLEAR rate since round 1 and must stay so (the credit scores clearing);
`job-call.test.mjs` §"q̂ is the CLEAR rate" pins the code. Two lines of prose.

---

## 6. What is in the suite now

`tests/job-call.test.mjs`: **100 → 106 tests, all passing.** (The `tests` lane added §14 —
*"what the shipped caller actually stores"* — against this same change while the ticket ran; its
`wMismatch` / `endoWould` arm and this section's §15 are complementary, one measuring the population
and one the mechanism.)

New in §15, *"the snapshot is the DEFAULT, and the top rank is reachable again"*:

* `sealedCallOf` reads `lockCall`'s record and rejects eight non-seals.
* **THE FIX**: with a call sealed, `q̂` and therefore `w` are the same number whatever the outcome —
  `ws.size === 1` over both branches, through `callEntry`.
* the same read with no seal is the live rate, unchanged; `before: null` opts out; an explicit
  `before` beats the seal.
* **the window stops being selected ON THE OUTCOME** — over all 11 reachable ten-sitting histories,
  the outcome never decides whether the call is measured; the arm also asserts that the *endogenous*
  gate did separate somewhere, so it cannot become toothless.
* **Called 5 is reachable**: the best achievable mean `w·c` is `wTimesEcDiscrete`'s peak, reached by
  `honestCall` at `q̂ ≈ 0.853`, and `≥ RANK_MEAN_WC[4]`; asserted through `ratingDetail`/`rankFor`,
  not through arithmetic about them.
* …**and it was not**, in the endogenous regime: `1.379 < 1.95`, rating below `RANK_THRESHOLDS[4]`.

Extended in §10: `regretOf` prices the same regret in both units, checked against `ratingDetail`
itself, including the blank-slot case (`w = 0 ⟹ ratingCost === 0`) and `carry ⟹ ratingCost === null`.

## 7. Suite state at hand-off

```
$ node --test tests/                       (20:37, with this lane's change in place)
  tests 2725 · pass 2715 · fail 6 · skipped 4
  tests/job-screen.test.mjs   :225  :374  :765      (the `screen` lane)
  tests/job-coldopen.test.mjs :235  :262  :297      (the `home`/`board` lanes)
$ node --test tests/job-call.test.mjs
  tests 106 · pass 106 · fail 0
```

**Not one of the six is this lane's**, and that is controlled for rather than asserted. Swapping
`site/js/job/call.js` for the pre-round-3 copy (file-copy A/B — never `git stash`) and re-running
each suite gives the **identical** failure set, same line numbers, both ways round:

```
tests/job-screen.test.mjs    pre-round-3 call.js: 60 · 57 pass · 3 fail   |   mine: 60 · 57 pass · 3 fail
tests/job-coldopen.test.mjs  pre-round-3 call.js: 29 · 26 pass · 3 fail   |   mine: 29 · 26 pass · 3 fail
```

`job-screen`'s three are source-greps of `site/js/screens/job.js` and its CSS (`.job-beat` sticky
offset, `COPY.evidence` never printed) plus the Playwright board-height walk — the `screen` lane's
file, mid-write at 19:59 and again later. `job-coldopen`'s three are Home's two-pass paint
(`pass 1 carries … label:placeholder locks:placeholder cold:placeholder wing:placeholder
supply:placeholder`, a meta line rewritten between passes, and a 20 s timeout waiting for
`.job-screen .job-primary`) — `site/js/page.js` was written at 20:28 and `site/js/job/board.js` at
20:22, i.e. **during** the run. This is the same transient `notes/state-fix.md` recorded last round.
`site/js/job/call.js` is named by none of the six assertions.

The suite is **not stable to measure from one lane**: across three full runs during this ticket the
test count went 2650 → 2704 → 2717 and the failure set 11 → 3 → 3, with
`site/js/job/{state,econ,guard,crew,board}.js`, `site/js/screens/{job,run,home}.js`,
`site/data/job.js`, `COMPOSED-GAME.md` and `tests/job-call.test.mjs` itself all being written by
other lanes while it ran (mtimes 19:58 → 20:15).

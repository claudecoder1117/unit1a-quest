# notes/econ-fix.md — FIXER, lane `econ`, round 1

Owner of `site/js/job/econ.js`, `site/data/job.js` and their tests (`tests/job-econ.test.mjs`).
Nothing else was touched. Five findings came in: **three fixed at the root, one fixed as far as this
lane's authority reaches (with the remainder written up for a spec decision), one refuted.**

Final: `node --test tests/` → **2499 pass / 0 fail**.
(The suite is red *intermittently* while other lanes write to their files mid-run — three different
failure sets appeared across three runs of the same tree. Every file passes in isolation; the clean
2499/0 run above was taken when the tree was quiet.)

---

## 1. [BLOCKER] `regretLine` printed two economies in one sentence — FIXED

`econ.js regretLine()`.

The debrief's line is `you bagged at chain 0; the threshold said push (q* 1.00, your q̂ 0.62). cost 36.`
`said` came from `optimalOrder` — an exhaustive replay over the *realised rungs*, i.e. hindsight.
`qStar` came from `breakevenQ` — the *ex-ante* threshold the student actually had. Two different
models, printed as one claim, so the sentence routinely refuted itself: a student reads "the
threshold said push" and then reads `q* 1.00` against their own `q̂ 0.62`, which says bag.

**Fix — one model for the half of the sentence that names a model.** The student's own line is now
replayed once and *the threshold* is asked the same question at every beat. `said` is
`pushOrBag(state)`, `qStar` is `breakevenQ(state)` — the root of the very function whose sign gave
`said` — so coherence is structural, not asserted after the fact. The solver keeps what the solver is
good for (`cost`, `optimal`, `best`, pinned unchanged as `cost = optimal − actual`), and its own
first divergence is returned as the new field **`solverAt`** so the two models are visible instead of
silently merged.

Two beats are now deliberately unnameable, and the debrief prints nothing rather than something it
cannot back:

* a beat with **no recorded `q̂`** — there is no threshold verdict without one;
* every beat of a line that **cost nothing** — you were unlucky, not wrong. (Unchanged: `cost > 0`
  already gated the line.)

A consequence worth stating plainly: when the threshold agreed with you and the realised rungs
punished you anyway, the debrief is now **silent** instead of saying you should have bagged. That is
the right lesson — the old behaviour taught results-orientation.

Pinned by three new tests in §12 of `tests/job-econ.test.mjs`, the load-bearing one being a
deterministic 512-order sweep asserting `said === 'push' ⟹ q̂ ≥ q*` and `said === 'bag' ⟹ q̂ ≤ q*`
on every line it produces:

```
$ node /tmp/.../verify.mjs
lines 384  said-push 212  said-bag 172  contradictions 0  beats where solver!=threshold 121
```

121 of 384 is how far apart the two models actually are — which is why taking `said` from the wrong
one was not a rounding problem.

## 2. [MAJOR] `breakevenQ`'s deep branch dropped the fee — FIXED

`econ.js breakevenQ()` now returns `breakevenQExact` — the true root of `pushMinusBag`, fee included,
in both branches. `deepQStar` and `shallowQStar` stay exported and stay pinned to the published G3.2
table; they are simply no longer what goes on screen.

**The spec asked for exactly this and the code was not doing it.** G3.2 line 376 introduces the deep
form as *"dropping the fee term for the clean asymptotic form"* and then says, of the table:
*"the app computes `ρ̄` per target from your own rung distribution and **prints the true threshold**"*.
`breakevenQ` was printing the brochure's form, which drops `0.10·S` — the term that dominates
precisely when the pile is deep, because that is what "deep" means. At `c = 0` the deep form's
denominator is 0 and it returns **1.00** ("you would need certainty") in states where pushing
strictly dominates:

```
L=6 call=70 S=50 chain 0: deepQStar 1  printed 0.0000  pushMinusBag@q=0.5 +3.20
target 2 of an ordinary RUN (S=8): deep? true  printed q* 0.7778  table form 1
```

Survey over the realistic grid, after the fix:

```
deep states 711 | worst |printed-true| 0.0000 | states giving WRONG advice 0
```

New test `the PRINTED threshold never contradicts the app's own push/bag arithmetic, anywhere on the
grid` asserts the invariant that was missing: over ~780 states × 11 values of `q`,
`q ≥ breakevenQ(st) ⟹ pushMinusBag ≥ 0` and `q < breakevenQ(st) ⟹ pushMinusBag ≤ 0`, with both
branches required to be exercised.

**One existing assertion was corrected, not weakened.** `tests/job-econ.test.mjs:299` read
`assert.equal(r3(breakevenQ(st)), row.call, 'breakevenQ takes the deep branch here')` — it pinned the
published table against the *printed* number, which is exactly the conflation that let this ship. The
table is still pinned, on the line above, against `deepQStar`, which is the function G3.2 publishes.
The replacement asserts the stronger thing: that on that state (a 9e15 pile against a 252-loot loss)
the printed threshold is 0, that `pushMinusBag` agrees at `q = 0`, and that the table's form can only
ever be *harder* than the truth.

`screens/job.js` needed no change — it calls `econ.breakevenQ` and now gets the true threshold.
`tests/job-screen.test.mjs` §5b (ρ̄ has to move the number) still passes: bound 0.601 vs own 0.648.

## 3. [MAJOR] the debrief priced every target at `L = 1` — FIXED

`econ.js stateL()` now reads `mult`:

```js
const stateL = (s) => {
  const t = s?.target ?? s ?? {};
  const base = Number.isFinite(s?.L) ? s.L : lootFor(t);
  const mult = Number.isFinite(s?.mult) ? s.mult : num(t?.mult, 1);
  return base * mult;
};
```

`screens/run.js realisedOrderOf` (not this lane's file) rebuilds each realised target as
`{loot: 1, scope: 1, cold: 1, …, mult: d/(ρ·m·W)}` — the target's entire worth lives in `mult`.
`carryFor`/`missFor`/`settle` all end in `· num(target.mult, 1)`, so `optimalOrder` priced it right;
`stateL` did not, so `isDeepPile`, `breakevenQ` and `pushMinusBag` all saw a target worth 1. Fixing
it here rather than in `run.js` is the smaller and safer change **and** the more correct one: any
caller that folds a multiplier into `mult` now gets the same `L` the payout charges.

The four states the critic reported, recomputed after the fix — the folded column now equals the
directly-priced column exactly:

```
S    c  L   call | folded-into-mult   | priced directly
100  2  70  85   | SHAL q* 0.5984     | SHAL q* 0.5984
60   1  38  85   | SHAL q* 0.7329     | SHAL q* 0.7329
40   4  70  95   | SHAL q* 0.2206     | SHAL q* 0.2206
150  3  70  95   | SHAL q* 0.5569     | SHAL q* 0.5569
```

New test: over `L × S × chain × call`, `isDeepPile`, `breakevenQ` and `pushMinusBag` must agree
between a target priced directly and the same target folded into `mult`.

## 4. [MAJOR] bag-every-beat makes the top call weakly dominant — CONFIRMED; fixed as far as this lane goes

The mechanism is real and reproduces: G2's miss branch is `−min(LOOSE, L·m·P·wing_pen)` and BAG sets
`LOOSE = 0`, so the beat after a bag has **no miss term at all** for any call, while the clear branch
is strictly increasing in `W`. `settle(miss, chain, loose = 0).delta === 0` for every call and every
chain.

**The root of this one is in the published spec, not in this file.** The cap is G2's own formula and
G3.7 #4 keeps it deliberately (*"every stake slider is rejected; Kelly survives as the `min(LOOSE, ·)`
cap"*). The fee is G2's `0.10` with its own proof of work in G3.3. Every fix the critic proposes —
charge `P` against BAGGED, escalate the fee per consecutive bag, pay the miss out of BAGGED — changes
a published formula. That is Oliver's call, not a fixer's.

What this lane did instead, which is everything it can do honestly:

* **`econ.carryEVAt(state, call)`** — G3.1's carry EV *at a real state*, cap included. It is
  `pushThrough(state) − S` by construction, so there is no second model of the branch to drift.
* **`econ.evMaxCallAt(state, calls)`** — the argmax the student is actually facing; ties break to the
  lower rung, as J2's `argmaxCall` does.
* **`PUBLISHED.evTable` now carries its condition** in `data/job.js`: the table is the deep-pile
  (`S ≥ L·m·P`) ladder, and its argmax column is the deep-pile argmax. It was reading as
  unconditional, which is the part that was actually dishonest.
* **`tests/job-econ.test.mjs §5b`** pins all of it, including the hole itself: the table reproduces
  from `carryEVAt` under its own condition and its argmax column is recovered exactly; at `LOOSE = 0`
  every call's miss is 0, `evMaxCallAt` returns the top rung at every `q` from 0.05 to 0.99, and with
  the 95 rung locked (Called 1–2) it returns 85. The hole can never be re-discovered as a surprise
  and nothing can quietly start treating the published table as unconditional.

Also worth recording, because the critic's simulation did not model it: **the 95 half of the exploit
partly self-destructs.** 95 needs Called 3 (`CALL_LEVELS[3].minRank === 3`), and systematic
over-calling at `q̂ = 0.55` scores `−4.90` mean `w·c` → rating clamps to 0.00 → Called 1 → the 95 rung
is revoked. The critic's `q = 0.55, call 95` row is not a reachable steady state. The **85** version
of the exploit is, at Called 2, and is not braked by anything. Asserted in the last test of §5b.

### Requests to other owners

* **J2 (`site/js/job/call.js`, `site/js/screens/run.js`)** — G5 #2's second regret line
  (`COPY.regret2`, *"envelope 6: you called 85, EV-max was 70"*) computes `evMax` with
  `call.argmaxCall(q̂)`, which is the *unconditional* published ladder. For a player whose pile is
  empty at that beat, the EV-max rung it names is wrong. `econ.evMaxCallAt(state, ranksCalls)` is
  shipped and pure; the envelope's `loose`/`chain`/`L` are already in the realised order.
* **Spec (COMPOSED-GAME G2 / G3.1 / G3.3)** — the dominance hole above needs a ruling. The cheapest
  honest wording, if the mechanics are to stay as they are, is one clause on G3.1's EV table naming
  its condition; the cheapest mechanical close is a bag fee that scales with consecutive bags, which
  contradicts G3.3's proof as written.

## 5. [BLOCKER] "the default column is charged for a path the student did not take" — **WRONG, no change made**

The finding asks for `FIXED_PHASES.*.default.phases.board = 6` and `.guard = 4`, derived from
`COLD_OPEN`. Doing that would contradict the authority, which adjudicated this exact conflict
already. Three pieces of evidence.

**(a) The guard cell is 12 in BOTH columns, so it is not a default-path charge at all.**

```
$ node -e "…FIXED_PHASES…"
guard cell, JOB default / JOB full : 12 / 12
guard cell, RUN default / RUN full : 12 / 12
board cell, JOB default / JOB full : 18 / 55
COLD_OPEN.path                     : ["board 6","primary 0","guard-accept 4","call 5"]
```

The columns are "skip the optional surfaces" vs "use them". The guard press is not optional — it is
one of G1's 24 *mandatory* decisions — so it costs the same on both paths. The critic's framing
("the default column is charged for a path the student on it did not take") requires the default
column to be claiming the guard was skipped. It never claims that; the only cells that differ are
`board`, `brief` and `crew`, which are exactly the optional surfaces.

**(b) COMPOSED-GAME.md resolves the two numbers explicitly, in three places.**

```
$ grep -n "observed mean when you re-press|observed re-press mean" COMPOSED-GAME.md
 81: | guard reveal + token press | 12 (4 s to accept the equilibrium mix; 12 s is the observed
     mean when you re-press) | 12 |
155: …`tests/job-coldopen.test.mjs` pins the exact path — `board 6 → primary button → guard accept 4
     → call 5`. The 12 s guard figure in the fixed-phase table is the *observed mean when the student
     re-presses*, not the cold-open path; both numbers are true and the table says which is which.
     Drafting is opt-in; the primary button is always the plan's own recommendation pre-drafted…
896: 23. COMPOSED S9 #1 … The 12 s guard figure in the phase table is the observed re-press mean and
     is labelled as such.
```

G12 #24 (line ~955) is the murder-board ruling that created the pair: *"The 90-second trace and the
phase budget disagreed → **both numbers survive, labelled**."* `COLD_OPEN` measures *time to first
answer on the fastest path*; `FIXED_PHASES.default` measures *a session in which the optional windows
are skipped*. They are different measurements of different things, which is why one is 4 and one is
12, and why the board cell is 6 against 18 (`COLD_OPEN`'s board step is the read before tapping a
pre-drafted primary; the 18 s phase is read **+ draft**).

The `job-coldopen.test.mjs` assertions the finding calls "documenting the contradiction instead of
resolving it" are a direct transcription of line 155 — they assert that the two numbers are
different and ordered, which is what the document requires. Deriving one from the other, as the
finding suggests, would delete the distinction the document spent a murder-board item creating.

**(c) "the RUN measures over half either way" is true as published.**

```
published RUN split : [ 51.1, 54.3 ]
```

"Either way" is the two published columns, named in the sentence immediately before it
(*"43 % game on the tap-through path and 51 % if you use the windows"*). Both RUN columns are over
half. The finding's 42.7 % comes from a third, unpublished path (board 6 **and** guard 4 **and** no
debrief credit) that the document does not claim anything about.

`tests/job-coldopen.test.mjs` was not touched.

---

## Files changed

* `site/js/job/econ.js` — `stateL` (reads `mult`), `breakevenQ` (→ `breakevenQExact`), `regretLine`
  (threshold-derived `said`/`qStar`, new `solverAt`), new `carryEVAt` / `evMaxCallAt`, and the
  docblocks on `deepQStar` / `breakevenQExact` / the file header.
* `site/data/job.js` — `PUBLISHED.evTable` docblock only. No constant moved.
* `tests/job-econ.test.mjs` — one corrected assertion (§5, the deep table), a new §5b (7 assertions
  over the carry ladder at a state and the dominance hole), two new tests in §5 (printed-threshold
  sign coherence; `mult` parity), three new tests in §12 (sentence coherence sweep, threshold vs
  solver divergence, unnameable beats). 96 → 105 tests in this file.

## Open

* `regretLine` still reports `cost` as the whole line's regret against the hindsight optimum, not the
  named beat's own cost. It is documented as an upper bound (it already was, for the walk-exit
  reason). A per-beat `beatCost` is the obvious next step and would let the copy's `cost N` be
  attributable to the beat it sits in; it needs a decision about what to print when following the
  threshold at that beat would have paid *less* on the realised rungs.
* `pushMinusBag` prices a target at `L·ρ̄·m·W` on the clear side and `L·m·P` on the miss side, with
  `scope`/`wing`/`cold`/`tell` in neither — that is G3.2's published model, and the realised order's
  `mult` now flows through both. But the realised order's clear-side `mult` (`d/(ρ·m·W)`, which
  carries `scope·wing·cold·tell`) and its miss-side `mult` (`lost/(m·P)`, which carries `wing_pen·x2`)
  are different numbers folded into one field. `regretLine` uses whichever one the target settled
  with. Recorded, not fixed: the fix is J5c/J6b's open request to record the pricing in
  `inProgress.game.calls[]` instead of reconstructing it.

---

# notes/econ-fix.md — FIXER, lane `econ`, round 2

Owner of `site/js/job/econ.js`, `site/data/job.js` and their tests. Four findings came in:
**two fixed at the root in this lane, one fixed in this lane + a one-line Request filed for the live
surface, one already fixed by the lane that owns it (verified, not re-fixed).**

`tests/job-econ.test.mjs` → **110 pass / 0 fail**. See "Suite state" at the bottom for the 9 failures
elsewhere in the tree, none of them this lane's (each proved independent by experiment).

---

## 1. [BLOCKER] the printed `q*` was the threshold of a different economy — FIXED (root), live surface REQUESTED

`econ.js`. `stateL(s)` was `loot · mult` and **both** branches of PUSH − BAG got that one number, so
the gain term was missing `scope · wing · cold · tell · ×2` (all of which `carryFor` charges) and the
loss term was missing `wing_pen · ×2` (both of which `missFor` charges). G2 gives the two branches
different multiplier sets **on purpose** — `missFor`'s own docstring says so — and a single `L` cannot
be the root of an arithmetic that has two.

Reproduced before touching anything (`scratchpad/econ/repro1.mjs`), rebuilding PUSH − BAG out of
`carryFor`/`missFor`/`0.9S` and root-finding on `q`:

```
T2 review, cold, live tell, 2 tokens (unguarded)   posted 63  q* PRINTED 0.628  TRUE 0.358
T1 drill on the GUARDED wing, rank 2               posted  3  q* PRINTED 0.516  TRUE 0.771
T2 mastered (scope .5)                             posted  9  q* PRINTED 0.376  TRUE 0.529

wing_pen isolated — same target, same state, call 85, chain 4, S = 60:
  guarded=false  |missFor| = 22   breakevenQ = 0.516
  guarded=true   |missFor| = 43   breakevenQ = 0.516      <- identical
```

**Fix.** `stateL` is gone. In its place, two exported functions that are `carryFor`'s and `missFor`'s
own factor lists with `(ρ̄, m, W)` and `(m, P)` divided out:

```js
gainLFor(state)  // L · scope · wing · cold · tell · ×2 · mult
lossLFor(state)  // L · wing_pen · ×2 · mult   — and 0 where the crew forgives the miss
```

Used by `pushThrough`, `bagThenAnswer`, `pushMinusBag`, `isDeepPile`, `breakevenQExact`,
`shallowQStar` and `deepQStar`. The same run after the fix:

```
T2 review/cold/tell/tokens  0.357 vs 0.358   ·  guarded T1  0.776 vs 0.771
guarded=false  breakevenQ 0.516   guarded=true  breakevenQ 0.776
```

(The residual ≤ 0.015 is `carryFor`/`missFor` rounding to whole loot in the *reference* rebuild; the
closed form is exact. The tests assert sign agreement outside that rounding band and exact rootness
of the closed form.)

Three consequences worth stating plainly rather than burying:

* **A bare target is unchanged.** With no scope, wing, cold, tell or ×2, `gainLFor === lossLFor === L`,
  so G3.2's published table, `deepQStar`'s L-independence and every existing pinned numeral survive
  untouched. That is why the closed forms could take one `L` per branch without the table moving.
* **`deepQStar` now carries the ratio** `θ* = (L_loss·m·P)/(L_gain·ρ̄·W·(m−1))`, which cancels to the
  published `m·P/(ρ̄·W·(m−1))` on a bare target and does not cancel on a guarded or ×2 one.
* **Crew forgiveness zeroes the loss.** `missFor` returns 0 at rank ≥ 1 (the miss rung is forgiven to
  a paying rung), so a threshold that still charges a loss there is charging money the payout will
  never take. `lossLFor` returns 0 and `breakevenQ` returns 0 — *push at any `q`* — which is the
  truth about this game and is now visible instead of hidden. **This is a real design hole and it is
  not mine to close**: a STEADY crew on the next target makes pushing strictly dominant, permanently,
  because rank forgiveness is a ladder step and not a per-job consumable. Filed under Requests.

**Pinned by three new tests in §5**, the load-bearing one being the assertion the suite never had —
the printed threshold is the root of a PUSH − BAG **rebuilt out of `carryFor`/`missFor`**, not out of
a second copy of the model (`pushMinusBagFromPayout`), over 8 priced targets × S × chain × call:

```
512 states, 266 interior roots, 0 sign disagreements with the payout
```

plus a test that each of `scope`/`cold`/`tell`/`tokens` lowers the printed threshold and **none** of
them appears in `lossLFor` (G2's asymmetry, asserted rather than commented), that the ×2 doubles both
`L`s identically (G3.6 / G3.7 proof 1), and that `gainLFor`/`lossLFor` reproduce `carryFor`/`missFor`
by division across tiers, chains and calls.

### The live surface is still wrong, and it is one line in a file this lane does not own

`screens/job.js breakevenQOf` builds a fresh object with seven keys — `{loose, chain, call, tier,
loot, rungs, crew}` — off a `state.pricedTarget`, which already carries `scopeFlags`, `bucket`,
`overdueDays`, `tell`, `tokens`, `guarded`, `rank`, `x2` and `crewInfo`. So the screen still prices a
**bare** target and prints a threshold for a target the student is not being offered. Measured over
138 240 realistic live states (`scratchpad/econ/live2.mjs`):

```
states where the printed verdict flips at some q on the 0.3–0.9 grid : 72 558 (52.5 %)
worst gap 0.750  — screen 0.000 ("push at any q") vs true 0.750
  {tier 1, guarded, rank 2, ×2}  S=120  c=0  call 85  m̄ 40
```

`econ.breakevenQ`'s docstring now says outright that it is only as good as the target it is handed,
and the `PushState` typedef says which fields are read. The Request is under **Requests → J6** below.

## 2. [MAJOR] "as the chain deepens the threshold falls" is false of the number the app prints — FIXED (scoped + published)

The claim is true of `shallowQStar` and of `deepQStar` — the two closed forms — and false of
`breakevenQ`, which keeps the fee in both branches. Reproduced (`scratchpad/econ/repro2.mjs`):

```
breakevenQ, S = 200, L = 18, chains 0 1 2 3 4 5 6 8
  call 70 : 0.000 0.000 0.000 0.000 0.000 0.034 0.070 0.118   RISES
  call 85 : 0.444 0.467 0.480 0.488 0.494 0.498 0.501 0.506   RISES
  call 95 : 0.778 0.759 0.747 0.739 0.733 0.729 0.725 0.683   falls
shallow (S = 12, L = 18, call 95): 0.900 → 0.143, monotone down — the regime the sentence describes
```

**Mechanism, corrected.** The critic reads it as "the fee swamps `L·m·P` at a shallow chain"; that is
true at call 70 (where it clamps `q*` to 0) but not at 85, where `0.10·S = 20 < L·m·P = 36` at `c = 0`
and the threshold still rises. The general statement is: the deep root is
`(L·m·P − 0.10·S)/(L·ρ̄·W·(m−1) + L·m·P)`, the fee enters as a **fixed** credit toward pushing, and the
loss term it is subtracted from grows with the chain — so the credit is worth proportionally less at
every step. Drop the fee and the same branch falls, which is exactly why the table falls. That is the
form the test and the document now state, and it is checked, not asserted:
`falls(noFee(c))` and `rises(breakevenQ(c))` over the same chains.

**Fixed in the claim, not by relaxing it.** `COMPOSED-GAME.md` G3.2 keeps the bolded sentence (it is
true of the forms, and the *amount at risk grows* half is true everywhere) and gains a scope note
with the printed-`q*` table above and the mechanism. `shallowQStar`'s docstring, which carried the
same sentence unscoped, now says which function owns it. New test **'the escalation claim holds on a
SHALLOW pile and inverts on a deep one — both pinned'** asserts monotone-down for `shallowQStar` and
`deepQStar` at every call, monotone-down for the printed `q*` on a shallow pile (0.900 at `c = 0`,
< 0.2 at `c = 8`), monotone-**up** and strictly so for the printed `q*` on a deep pile at 70 and 85,
and that the stake grows in both branches.

## 3. [BLOCKER] the Backcheck 'vault' mint bypassed the dues gate — **ALREADY FIXED by the lane that owns it; not re-fixed**

`site/js/job/state.js` is not this lane's file. The finding is real and the mechanism is exactly as
reported — `word = queueOf(save).length > 1 ? (lastOk ? CRACKED : KNOCKED) : COMPLETED` makes
`cracked` true for **any** multi-target shape, and `mintForJob` gated the free `reason: 'vault'` mint
on `cracked` alone — but the state lane has landed the fix while this round was running:

```
$ sed -n '/function mintForJob/,+20p' site/js/job/state.js
  if (room && cracked === true && shapeHasVault(g) && Math.max(0, int(g.bc, 0)) === 0) {
$ grep -n 'shapeHasVault' site/js/job/state.js
  const shapeHasVault = (g) => (SHAPES[g?.shape] ?? SHAPES.JOB).vault === true && str(g?.vault) != null;
```

That is the critic's own suggested belt-and-braces gate (`SHAPES[g.shape].vault === true`), plus a
requirement that a vault was actually drawn. `tests/job-exploit.test.mjs` is 48/48 green. Nothing was
changed here; `SHAPES[*].vault` in `data/job.js` already carried the flag the gate needs and is
unmodified.

## 4. [MAJOR] VAULT published two brief windows it can never serve — FIXED (root)

`BOARD.briefAfterTargets` is `[4, 8]`; `state.js push()` opens a window on
`briefAfterTargets.includes(done)` and the `left === 1` target goes to the getaway, so a window at
`n ≥ targets` never opens. VAULT is **7** targets and serves **one**. `econ.decisionCount` and
`econ.fixedSeconds` both multiplied by `SHAPES.VAULT.briefs = 2` anyway, while `board.js projectFor`
already clamped — so the board and the published table disagreed by construction, and the debrief
prints the measured count beside the published one ("17 … 18 mandatory").

**Fix — one owner for the clamp.** New `econ.landedBriefs(shape)`:

```js
Math.min(shape.briefs, BOARD.briefAfterTargets.filter((n) => n < shape.targets).length)
```

`fixedSeconds` multiplies its `brief` cell by it; `decisionCount` charges the mandatory window count
and the full-use options from it. `SHAPES.VAULT.briefs: 2` is **kept** — it is the ceiling the shape
is allowed, and if G1 ever moves the second window to a target a VAULT has, `landedBriefs` returns 2
on its own and nothing else moves. Recomputed, with RUN / JOB / JOB12 unmoved:

```
RUN   landed 1 | gameS 188 214 | split 51.1 54.3 | decisions 15 22
JOB   landed 2 | gameS 320 442 | split 43.2 51.3 | decisions 24 35
JOB12 landed 2 | gameS 384 506 | split 33.9 40.3 | decisions 28 39
VAULT landed 1 | gameS 296 388 | split 28.3 34.1 | decisions 17 24     (was 316/438, 29.6/36.9, 18/29)
```

`PUBLISHED.shapeTable.VAULT` is regenerated to those values and `PUBLISHED.decisionCount` gains a
`VAULT: {mandatory: 17, full: 24}` row, because VAULT is the one shape whose nominal and reachable
window counts differ and the debrief prints the published number on screen. `COMPOSED-GAME.md`'s
shape table row, its `≤ 19:48` sentence, G12 #18, G12 #23 and G12 #40e are updated to
**296 → 388 s / 17:26 → 18:58 / 28.3 % → 34.1 %**, with a new paragraph under the table stating the
rule. `FIXED_PHASES`' own docblock now says to multiply by `landedBriefs`, not by `shape.briefs`.

**Two tests were tightened rather than relaxed**, both of which had been written *around* this bug:

* `tests/job-split.test.mjs` §5 asserted `w.debrief.decisions === published.mandatory − missing`,
  where `missing = SHAPES[id].briefs − landed` — i.e. it subtracted the over-count back out and let
  the inflated numeral ship. The subtraction is gone; the equality is exact per shape, and the number
  of windows that opened is now asserted equal to the number that *can*.
* `tests/job-split.test.mjs` §1's independent `tableFrom()` multiplied by `s.briefs`. It now applies
  the same clamp, spelled out from `BOARD.briefAfterTargets` rather than by calling `landedBriefs` —
  it has to stay an independent recomputation.
* `tests/job-econ.test.mjs` pinned `Math.min(splits) === 29.6` as a literal. It now reads both ends
  off `PUBLISHED.shapeTable` *and* checks the value, so it can never again hold a numeral the product
  has stopped producing.

New test **'a brief window that can never open is never charged'** derives the clamp from the
primitives for all four shapes, pins VAULT at 1 window / 17 mandatory / 140 s / 232 s, pins JOB and
JOB12 to `FIXED_PHASES.JOB`'s published totals, and asserts the board's clamp and the table's clamp
are one number.

---

## Requests to other owners

1. **J6 — `site/js/screens/job.js`, `breakevenQOf` (one line).** Spread the priced target instead of
   picking four fields off it. The state lane's `pricedTarget` already returns everything
   `gainLFor`/`lossLFor` read (`scopeFlags`, `bucket`, `overdueDays`, `tell`, `tokens`, `guarded`,
   `rank`, `x2`), and `page.jobTargetOf` supplies them. Exact patch — `...t` **first**, so the
   explicit `crew` (the round-1 `crewInfo.forgives` fix) still wins:

   ```js
   function breakevenQOf(gv, t, call = callOf(gv)) {
     return econ.breakevenQ({
       ...t,                                   // the WHOLE priced target: scope, cold, tell, tokens,
                                               // guarded, rank, x2 — gainLFor/lossLFor read all of them
       loose: gv.loose,
       chain: gv.chain,
       call,
       rungs: state.crew.bandFor(state.crew.mShownOf(getState(), t.make)),
       crew: Math.max(0, int(t.crewInfo?.forgives ?? t.crew, 0)),
     });
   }
   ```

   (`tier`/`loot` come in with the spread; `t.loot` is undefined and `lootFor` falls back to `tier`,
   which is correct — the multipliers are the other fields.) Until this lands, the threshold on screen
   is the bare-target threshold: 52.5 % of realistic states flip a verdict somewhere on 0.3–0.9, worst
   gap 0.750. `tests/job-screen.test.mjs` §5b already greps this call site; the natural assertion to
   add beside it is that the call contains the spread.

2. **Spec (COMPOSED-GAME G2 "Crew", G3.2) — crew forgiveness makes PUSH strictly dominant.** At rank
   ≥ 1, `rhoFor(MISS_RUNG, rank)` is a paying rung, so `missFor` returns 0 and there is no miss branch
   at all on that target: `breakevenQ` is 0 and bagging is never correct. Rank forgiveness is a ladder
   step, not a per-job consumable, so this is every beat of every make with a crew on it. The
   threshold now tells the truth about it (it used to print a loss the payout would not take), but the
   *mechanic* is a dominance hole of the same family as round 1's finding 4 and needs a ruling:
   the cheapest close is to let forgiveness lower the loss rather than delete it (e.g. charge
   `L·m·P·(1 − ρ_eff(MISS, rank))`), which is a G2 change.

3. **J8 / spec — the alternative fix for finding 4.** Moving VAULT's second brief window to a target
   index a 7-target shape reaches (`briefAfterTargets` per shape, or `[4, 6]`) would restore two
   windows and is a G1 change. `landedBriefs` makes it a one-constant edit with no other code moving.

---

## Files changed (round 2)

* `site/js/job/econ.js` — `stateL` → `baseL` + new exported `gainLFor` / `lossLFor`; `pushThrough`,
  `bagThenAnswer`, `pushMinusBag`, `isDeepPile`, `deepQStar`, `shallowQStar`, `breakevenQExact` take
  one `L` per branch; new exported `landedBriefs`; `fixedSeconds` and `decisionCount` charged from it;
  `BOARD` added to the import; docblocks on `breakevenQ`, `shallowQStar`, `PushState`, the header.
* `site/data/job.js` — `PUBLISHED.shapeTable.VAULT` regenerated (296/388, 1046/1138, 28.3/34.1);
  `PUBLISHED.decisionCount` gains `VAULT` (17 / 24); `SHAPES` and `FIXED_PHASES` docblocks restated
  around `landedBriefs`. No other constant moved.
* `tests/job-econ.test.mjs` — 4 new tests (payout-rebuilt threshold root; the multipliers each move
  the number; `gainLFor`/`lossLFor` by division; the escalation direction in both branches), 1 new
  test for `landedBriefs`, 1 literal-pinned split-span test derived from `PUBLISHED`. 105 → 110.
* `tests/job-split.test.mjs` — `tableFrom()` gains the independent clamp; §5's `missing` subtraction
  replaced by an exact equality plus an assertion on how many windows can open.
* `COMPOSED-GAME.md` — G3.2: the two-`L` paragraph, `L_gain`/`L_loss` in the PUSH/PUSH−BAG/deep/shallow
  forms, the printed-`q*` scope note and table; G1: the VAULT row, the brief-window rule paragraph,
  and the `18:58` / `28.3 % → 34.1 %` numerals in G12 #18, #23 and #40e.

## Suite state at hand-off

`node --test tests/` → **2600 pass / 4 fail** (final run; the tree moved five times during this round,
and the failing set moved with it — 9, then 2, then 4). Every failure is in another lane's file and
none is this lane's. Proof, not assertion: the `landedBriefs` clamp was temporarily reverted in place
and the same tests failed either way, and none of the messages names an economy number.

```
tests/job-board.test.mjs:1375  "the split is not the per-draft model 52 !== 31"     board.js projectFor
tests/job-screen.test.mjs:474  Playwright layout walk, board ≤ 36 px at 375×667     screens/job.js + job.css
tests/job-split.test.mjs:483   "RUN/full … board printed 41 %, debrief headlined 33.8 %"
tests/job-split.test.mjs:962   board projection vs debrief measurement, JOB
```

Earlier in the round the same run also showed `job-board:684` (board composition),
`job-juice:366` and `job-save:759` — the last two self-describing, each naming in its own failure
message the other lane that had just shipped the thing it was guarding (`job.css` enforcing
`--job-board-sheet`; `screens/run.js` starting to write `ratingDelta`). All three had cleared by the
final run. `tests/job-econ.test.mjs` is **110 / 110** and `tests/job-exploit.test.mjs` **48 / 48**.

---
---

# notes/econ-fix.md — FIXER, lane `econ`, **round 3**

Owner of `site/js/job/econ.js`, `site/data/job.js` and their tests. Three findings came in — one
BLOCKER and two MAJORs. **All three were real. All three are fixed, and two of them are now truer
than the critic stated**, because the recomputation this lane did while fixing them found the
critics' own mitigations to be wrong.

Every one of the three was the same defect in three places: **`COMPOSED-GAME.md` publishing a table
or a claim without the condition the code attaches to it.** Nothing in the shipped economy was
mispriced. What was wrong was the authority, and — for finding 3 — one row of `PUBLISHED`.

---

## 1. [MAJOR] "and the app says so" — FIXED, and the critic's mitigation REFUTED

**The finding stands.** `site/js/screens/settings.js:457` is the only place the app states the
threshold's direction, it states it flat, and no test guarded it:

```
$ grep -rn "chain deepens" site/js site/data | grep -v '^\s*\*'
site/js/screens/settings.js:457:  'As the chain deepens the threshold falls and the amount at risk grows: …'
```

`settings.js` is not this lane's file and a copy rewrite is not the one-line class BUILD-POLICY §2
lets a ticket reach into, so the fix is on the side this lane owns: **G3.2 no longer attributes the
scope to the app.** The paragraph now says exactly what the app says, where, and that scoping it is
a Request (below).

**The critic's recorded mitigation is wrong, and the truth is sharper.** The finding offered, as
mitigation, that *"on an actual play path S grows with the chain, so the printed q\* does fall"* —
their `/tmp/critic-econ/i-live.mjs` printing 0.752 → 0.380. Reproduced independently on this lane's
own functions (`scratchpad` walk: clear every target at ρ̄ = 1, bank nothing, let `S` accumulate),
**it does not fall.** Eight tier-1 clears at call 95:

```
printed q*  (breakevenQ)   0.000 0.696 0.712 0.726 0.738 0.731 0.705 0.682   ← peaks at beat 5
shallow closed form        0.000 0.696 0.712 0.726 0.738 0.748 0.756 0.763   ← RISES monotonically
deep closed form (θ*)      1.000 0.932 0.888 0.858 0.836 0.820 0.806 0.796   ← falls, trivially
```

and on the T2-heavy job the composer actually drafts, at call 85, the printed threshold walks
`0.000 · 0.497 · 0.630 · 0.633 · 0.624 · 0.336 · 0.554 · 0.513 · 0.144 · 0.463`.

So the falling direction is **a comparative static — hold `S`, vary `c`** — and not a property of
"the shallow branch" at all: `shallowQStar` is `0.9·S/(A + S)`, and on a played path `S` outruns
`A = L_gain·ρ̄·W·(m−1)`, so it *rises*. The only form that falls over a session is `deepQStar`, and
it falls for an uninteresting reason: `θ* = m·P/(ρ̄·W·(m−1))` never reads the pile. Round 2's scope
note said the direction belonged to "the two published closed forms"; that was already too generous
by one form.

**Changed:** `COMPOSED-GAME.md` G3.2 — the bolded sentence gains *at a fixed pile*, the attribution
to the app is struck, and a new paragraph carries the three walks as a table. `econ.js`
`shallowQStar`'s docblock carries the same three walks. `tests/job-econ.test.mjs` §5 gains **'a PLAY
path does not rescue the claim either'**, which pins the printed walk as non-monotone (peak at beat
5), `shallowQStar`'s walk as rising, `deepQStar`'s as falling, and `deepQStar` as literally
`S`-independent. `tests/job-shape-measured.test.mjs` §3 fails if the attribution is written back.

---

## 2. [MAJOR] G3.1's argmax table published without its condition — FIXED

**The finding stands and the numbers reproduce exactly** (`econ.carryEVAt`, one T1 opener):

```
LOOSE 0,   q = 0.40:  50 → 2.40   70 → 3.36   85 → 4.32   95 → 5.28      argmax 95 at EVERY q
LOOSE 120, q = 0.50:  50 → 9.00   70 → 7.20   85 → −1.80  95 → −25.20    argmax 50
```

The dominance itself was already pinned — `tests/job-econ.test.mjs` §3b has carried **'KNOWN HOLE,
pinned: at LOOSE = 0 every call's miss costs 0 and the top rung is weakly dominant'** since round 1,
and `site/data/job.js` + `site/js/job/econ.js` both carry the condition in comments. The critic's
complaint is precisely that *the authority prints the table flat while the scoping hides in a data
comment*, and that is correct.

**Changed:** `COMPOSED-GAME.md` G3.1 — the "Carry EV" caption now states `S ≥ L·m·P` and labels the
column the deep-pile argmax, and a new paragraph under the table gives the two EV rows above, names
the three states that reach `S = 0` (target 1 of every job, after every BAG, after any miss that
emptied LOOSE), points at `evMaxCallAt` as the argmax at a real state, and says plainly that the
rank ladder is the only published brake and that it is a *rating* brake, not an EV one.
`tests/job-shape-measured.test.mjs` §2 asserts the condition, the `S = 0` case and the
where-it-is-reached sentence are all present in that section of the document.

**Not taken:** closing the hole. Flooring the miss against BAGGED-this-job at `S = 0` changes G2's
published payout line, which is a spec decision and not this lane's to make. It is Request 2 below.

---

## 3. [BLOCKER] The published JOB row matched ~none of the boards the app posts — FIXED

**Reproduced independently** (my own corpus rebuild + `postBoard`, clock 19:30, costing each board's
REAL drafted tiers through the same `ANSWER_MINUTES_PER_TIER` / `DECISION_SECONDS` / `FIXED_PHASES`
arithmetic `econ.shapeTable` uses):

```
JOB    n=45   targets 10/10/11   answerS 510/690/1260    wall 854/1046/1674 s   split 24.7/34.0/40.3 %
VAULT  n=5    targets  7/ 7/ 7   answerS 390/450/ 810    wall 658/ 728/1116 s   split 27.4/38.2/40.7 %
published JOB row: wall 740/862 s, split 43.2/51.3 %  →  brackets 1 of 45 on wall, 0 of 45 on split
```

**The mechanism, which the finding names and which is the actual root:** `SHAPES.JOB.tierMix` is
`{1: 8, 2: 2}` and a drafted JOB is a median **T1 4.09 / T2 5.44 / T3 0.31 / T4 0.18**. `targets` is
binding (`composeBundles` serves `budget.targets` locks); the *mix* is not — the composer prices
whatever `composePage` had due. `site/js/job/board.js` already knew this in a comment at
`projectFor` (*"the obvious estimate, the shape's published `tierMix`, is biased"*); the document did
not. And the suite could not see it because `tests/job-split.test.mjs:150` rewrites every drafted
target's tier to `SHAPES[id].tierMix` (`canon`) before measuring, which makes the walkthrough
reproduce the fixed-phase table by construction.

**A second, independent basis error found while fixing it.** `PUBLISHED.shapeTable.split` is
`gameS / wallS` with the debrief read **inside** `gameS`. The board's projection and the debrief's
headline put it in **neither** term (G1 statement 2, `board.js projectFor`). That is 5–6 points on
every shape before any tier-mix question: nominal JOB is 43.2 % by the table's definition and
**37.8 %** by the one the app prints. So the brochure's 43 % and the screen's 30 % differed for two
reasons, only one of which the finding had.

**Fix — publish both tables, measure the second, and say which is which.** `tierMix` is not changed:
it is a real design-time budget, it feeds `page.jobBudget().minutes` and `lootMean`, and rewriting it
to chase tonight's page would be circular (the budget feeds the draft). Instead:

* `site/data/job.js` — `PUBLISHED.shapeTable`'s docblock now says NOMINAL and why; `SHAPES`' docblock
  says `tierMix` is a budget, not a draft, and lists everything downstream of it that is therefore
  nominal too. New **`PUBLISHED.shapeTableDrafted`** (JOB and VAULT, `[min, median, max]` for
  targets / answerS / decisionS / wallS / split / headline, plus `n` and `overSessionCeiling`), new
  **`PUBLISHED.nominalHeadlineSplit`** (all four shapes on the app's basis), new
  **`PUBLISHED.sessionBandS = [600, 1500]`**.
* `site/js/job/econ.js` — `shapeTable()`'s docblock says NOMINAL, names the measured counterpart, and
  tells callers who want "how long is tonight's job" to use `board.js projectFor`.
* `COMPOSED-GAME.md` G1 — the old table is retitled **the BUDGET table**; a new section **"What the
  board actually posts (measured, round 3)"** publishes the measured rows, the drafted tier mixes,
  the 1-of-45 / 0-of-45 bracketing, the `canon` fixture that hid it, and the three-percentages
  paragraph. The *"Every shape now sits inside COMPOSED S1's 10–25 minute session"* sentence is
  restated: true of the budget rows and of the median board and of 49 of the 50 corpus boards, and
  **false of one** — a T2-heavy 11-target JOB at **27:54**.
* **New test file `tests/job-shape-measured.test.mjs`** — rebuilds the 50-save corpus, posts every
  board, costs the real queue, and asserts the published band *brackets the product's median* field
  by field (plus median within 5 %, ends within 10 %). It also asserts: the recomputed headline split
  equals `board.split` **row by row, exactly** (45 + 5 rows); the budget row still does *not* bracket
  the drafts (so the two cannot quietly re-merge); the 25-minute exceedance count is exactly the
  published `overSessionCeiling`; the drafted mix is T2-heavy where the budget is T1-heavy; and
  `nominalHeadlineSplit` is recomputed from `FIXED_PHASES`, not transcribed.

No test was weakened. `job-split.test.mjs`'s `canon` fixture is left alone — it belongs to the split
lane and it is legitimate *as a fixed-phase-table check*; what was missing was any test at all on the
un-canonised path, and that is now its own file.

---

## Requests to other owners

1. **`site/js/screens/settings.js:457` (copy, the `hint(...)` in the "chain, and when to bank it"
   card).** The sentence *"As the chain deepens the threshold falls and the amount at risk grows"*
   is true only at a fixed pile, and the sentence after it pivots to the number the app prints, which
   is not monotone in the chain at all. Exact suggested replacement:

   > `'At a fixed pile, deepening the chain lowers this threshold and raises the stake; once the pile '`
   > `+ 'can pay the loss it is the fee that moves it, and over a whole job the printed q* does not move '`
   > `+ 'in one direction. The app prints your q* before every bag-or-push, computed from your own rung '`
   > `+ 'distribution on that make.'`

   `tests/job-shape-measured.test.mjs` §3 asserts the current unscoped sentence is present **and will
   fail when you fix it**, with a message telling you to update COMPOSED-GAME G3.2 in the same change.
   That is deliberate: the document and the copy have to move together.

2. **Spec (G2's miss branch) — the `S = 0` dominance hole.** `Δloose = −min(LOOSE, L·m·P·wing_pen)`
   makes every rung's downside 0 at `S = 0`, so the highest call the rank allows is weakly dominant
   on target 1 of every job and after every BAG. Cheapest close that keeps the cap: charge the miss
   against **BAGGED-this-job** when `LOOSE = 0`. That is a G2 change; the hole is now printed in G3.1
   rather than only pinned in a test.

3. **`site/js/screens/home.js` `shapeTable()` / `boardModel()` — the nominal row is on screen.**
   Home's pass-1 board is the player-facing half of finding 3 and this lane cannot reach it. Line 26
   reads `PUBLISHED.shapeTable[id]` and `boardModel` prints `minutes: Math.ceil(wallS / 60)` and
   `split: t.split.default` when the ledger is empty — i.e. **"JOB · ~13 min · 43 % game"**, which
   pass 2 then replaces with the board's own **"~17 min · 31 % game"** (the string in
   `job-board.test.mjs:1499`'s own failure output, on an unrelated regex break). Two errors stacked:
   the nominal tier mix *and* the table's split basis, which is not the basis the board or the
   debrief prints.

   `PUBLISHED.shapeTableDrafted` and `PUBLISHED.nominalHeadlineSplit` were added to `data/job.js`
   (zero imports, so Home's static-graph rule in `job-index.test.mjs` is untouched) specifically so
   this is a data swap and not a new dependency:

   ```js
   const shapeTable = (id) => {
     const key = SHAPES[id] ? id : 'JOB';
     const p = PUBLISHED.shapeTable[key];
     const d = PUBLISHED.shapeTableDrafted[key];            // measured; absent for RUN / JOB12
     return {
       // the MEDIAN board of this shape, not the budget row; fall back to the budget where there is
       // no measurement, and take the split on the basis the board and the debrief actually print
       wallS: { default: d?.wallS.default[1] ?? p.wallS[0], full: d?.wallS.full[1] ?? p.wallS[1] },
       split: { default: d?.headline.default[1] ?? PUBLISHED.nominalHeadlineSplit[key][0],
                full:    d?.headline.full[1]    ?? PUBLISHED.nominalHeadlineSplit[key][1] },
       targets: p.targets,
     };
   };
   ```

   `tests/job-week.test.mjs` re-pins the two numbers Home prints (the header says so) and will need
   the same edit in the same change. Until then pass 1 and pass 2 disagree by ~4 minutes and
   12 points on a fresh student — the first two numbers the game shows anybody.

4. **Supply / `plan.qFor` — the 27:54 board.** One of 45 JOB boards runs past COMPOSED S1's
   25-minute ceiling because the shape has a target count but no tier ceiling and the page was
   T2-heavy. Either give the draft a tier budget (spend minutes, not items) or let `plan.qFor` size
   the queue in minutes. `job-shape-measured.test.mjs` pins the exceedance at 1 so it cannot grow
   unnoticed; it is not this lane's to fix.

## Files changed (round 3)

* `COMPOSED-GAME.md` — G1: budget-table retitle, new measured section, restated S1 sentence.
  G3.1: the deep-pile condition on the Carry EV caption + a paragraph under the argmax table.
  G3.2: *at a fixed pile*, the attribution struck, the three-walk paragraph.
* `site/data/job.js` — `SHAPES` docblock (tierMix is a budget); `PUBLISHED.shapeTable` docblock;
  new `nominalHeadlineSplit`, `shapeTableDrafted`, `sessionBandS`. **No existing constant moved.**
* `site/js/job/econ.js` — docblocks only (`shapeTable`, `shallowQStar`). **No behaviour changed.**
* `tests/job-econ.test.mjs` — §5 gains the play-path test. 110 → 111.
* `tests/job-shape-measured.test.mjs` — new, 12 tests.

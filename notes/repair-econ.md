# notes/repair-econ.md — FIXER, lane `econ`, round 4 (the REPAIR-DECISION wave)

Owner of `site/js/job/econ.js`, `site/data/job.js` and their tests
(`tests/job-econ.test.mjs`, `tests/job-shape-measured.test.mjs`).

**What I found when I arrived, and how I established it.** Three of the five `econ` findings in
`designs/r3-findings.json` — the BLOCKER and both MAJORs — were **already fixed at the root** by the
round-3 econ pass recorded in `notes/econ-fix.md` (round 3, its findings 1–3 are verbatim these
three). I did **not** conclude that from file timestamps: REPAIR-DECISION arbiter rule 3 forbids the
timestamp inference, and it is right to — `r3-findings.json` was assembled after that pass and can
carry an earlier measurement. I concluded it by **re-measuring all three against today's tree**
(`board.js`, `state.js`, `crew.js` and `call.js` have all moved since that pass ran) and by running a
**negative control on each acceptance test** to show it can still fail. Numbers below.

The two MINORs had no fix and are the real work of this ticket: both are numerals G3.2 publishes
without the parameters that produce them. Both are **document** defects with **correct code**, so
per the ticket they are recorded under *Spec corrections* rather than edited into `COMPOSED-GAME.md`
— but neither is left as prose: each is now a `PUBLISHED` constant recomputed from the shipped
function, with the branch of every cell proved from `econ.isDeepPile` instead of assumed.

**Suite:** `node --test tests/job-econ.test.mjs tests/job-shape-measured.test.mjs` →
**128 tests, 128 pass, 0 fail** (was 123: +2 arithmetic pins, +2 document-numeral pins, and the
pairing test rewritten, see §Tests). Whole-tree result at the bottom.

---

## 0. REPAIR-DECISION: what is assigned to this lane, and the one item that is BLOCKED

`designs/REPAIR-DECISION.md` assigns this lane exactly one structural item, as a **graft onto S4**
(§S4.2 and §S4.7, *"Lane: crew (with `econ`, `doc`, `screen` …)"*). S1, S2, S3 and S5 name no `econ`
action (S1 explicitly: *"no file under `site/js/job/` changes"*).

**S4 · econ-side, NOT IMPLEMENTED — and deliberately so.** The two branches of S4 ask this lane for
*opposite* edits, and which one is live is decided by the **S4.3 gate**, which the decision says the
fixer *"does not get to judge"* and which the **crew** lane writes into `notes/J-S4.md`:

| S4 branch | the econ-lane edit it requires |
|---|---|
| gate **passes** (§S4.2) | `econ.js`: `chainAfterTarget` loses its crew/idle arguments and its hold branch. `data/job.js`: **delete** `CREW_MATRIX`, rename the r2 label HELD → DEEP in `COPY`. |
| gate **fails** (§S4.7) | *"no file under `site/js/job/` changes"* — `econ.js` untouched; `data/job.js`: `CREW_MATRIX.rows` **repriced** to `winner: 'STEADY'` on all four rows. |

**The gate has since been declared, and it does not change this answer — it confirms it.**
`notes/repair-crew.md` (22:49) reports the S4.3 gate **PASS on all three conditions** (worst census
side 67.3 % over 1 040 drafted boards; `job-crew.test.mjs` 119 → 135 tests, 560 → 607 assertions, zero
deleted) — **and then does not perform §S4.2's demolition**, for the same reason I did not perform its
econ half:

> *"the symbols have live references in five files this lane does not own, and removing them from
> `crew.js` today turns the suite red in files this lane is forbidden to repair … Deleting
> `CHAIN_HOLD_MIN` alone breaks `tests/job-meta-constants.test.mjs` at **import time** and breaks two
> screens. `crew.js` also **re-exports `CREW_MATRIX`**, so the coupling runs both ways: whichever side
> deletes first breaks the other."*

So the apparatus is still live in the shipped tree — r2 still carries its `mastery.isMastered` gate
and the chain-hold — and the deletion is one coordinated six-file change, their **Request R-D1**,
which names this lane's two rows of it: `econ.js chainAfterTarget` and the `CREW_MATRIX` winner
assertions in `tests/job-econ.test.mjs`. Had I dropped the hold branch on my own, `crew.js`'s live
`holdsChain` / `chainAfterFor` / `heldValue` and the ~80 assertions around them would have gone red in
a lane that is doing its work correctly. **Confirmed by their measurement, not just by my caution.**

One ownership disagreement to settle in round 5, recorded because it is one line either way: R-D1
assigns *"`site/data/job.js` — delete `CREW_MATRIX`; `COPY` label HELD → DEEP"* to **data/meta**,
while this ticket gives `site/data/job.js` to `econ`. Whoever runs R-D1 should take both rows in the
same commit; the file is this lane's as far as this ticket is concerned, and I have touched nothing in
`CREW_MATRIX` (see §7).

Guessing is not free here, and the cost is not symmetric:

1. Dropping the hold branch from `chainAfterTarget` **deletes shipped assertions in two lanes'
   files** — `tests/job-econ.test.mjs:187-197` (HELD holds at chain 3; the idle rule) is mine, but
   `tests/job-crew.test.mjs:1043` (`heldChainHold > heldForgiveness`), `:814-826` and the J4 §5 suite
   are the crew lane's, and §S4.3 item 4 makes the **assertion count across both** the gate.
2. If I dropped it and the gate then failed, the tree would hold S4.7 (*no `site/js/job/` change*)
   **and** an econ.js with no hold — the suite red on someone else's correct work.
3. `chainAfterTarget` is called from `crew.js:695`, `:713`, `:1518`, `:1541`, `state.js` (via
   `xp.nextCombo` agreement at `state.js:953`) and four test files. It is the single most-referenced
   function in the S4 blast radius and it is not mine to re-signature unilaterally.

**S1 · the one econ-FILE edit S1 asks for, DONE.** S1's verdict is *"no code"* and its lane is `doc`,
but §S1.1 item 1 and §S1.5 specify an edit to **`site/data/job.js:194`** — which is this lane's file,
so the S1 ticket cannot reach it and I have landed it here:

> OLD `/** q̂ is the first-try rate on that make over the trailing 10 attempts (G3.1). */`
> NEW `q̂ is the CLEAR rate on that make over the trailing 10 sittings (G3.1); the attempt a clear`
> `arrived on decides ρ, never the forecast.` — verbatim from §S1.5, plus the reason (honest's, per
> §S1.1: `econ.settle` prices the clear event, so re-pointing q̂ at the first-attempt rate would make
> one button forecast two).

It is written so that **both readings of §S1.3 item 2's lint pass**: the file now has no occurrence of
the stale phrase and does have `CLEAR rate` in raw text **and** in `prose(src)` — note that
`job-meta-constants.test.mjs:39`'s `prose()` strips `/* … */` but not `//`, so a docblock alone would
satisfy the "no stale phrase" half and fail the "says CLEAR rate" half. Measured:
`raw: first-try rate false / CLEAR rate true · prose: first-try rate false / CLEAR rate true`.

**I did not add the §S1.3 lint itself**, because `COMPOSED-GAME.md:361` still carries the stale
sentence (`grep -c 'first-try rate' COMPOSED-GAME.md` → 1, `CLEAR rate` → 0). Adding the lint now
would leave the suite red on text the doc lane has not written; it is a two-line addition once S1.5
lands — Request 6.

*Incidental, and it says something good about the suite:* my first draft of that docblock quoted the
old wording, and `job-copy.test.mjs` caught it — `['site/data/job.js → come back']`, the G12 #35
parent's-voice lint, which scans this file's **comments** too. Reworded; the lint is doing exactly
what it is for, and it is recorded here rather than silently worked around.

**Therefore:** the S4 patch is written out in full under *Requests* → **Request 1**, ready to apply in
one edit the moment the crew lane's ticket declares the gate. Nothing in this lane's own five
findings depends on it, and nothing I did blocks either branch.

---

## 1. [BLOCKER · player-feel · `site/data/job.js`] "The published JOB row matches ~none of the boards the app actually posts" — **PASS (already fixed at root; verified today, and the acceptance test is product-sensitive)**

*Finding:* `PUBLISHED.shapeTable`'s JOB row (12:20–14:22, 43–51 % game) brackets 1 of 45 JOB boards
on wall clock and 0 of 45 on split; measured 14.2–27.9 min, 22–35 %. And the suite could not see it,
because `tests/job-split.test.mjs:150-153` rewrites each drafted target's tier to the shape's own
`tierMix` (`canon`) before measuring — *"builds the correct regime inside the test"*.

**Re-measured on today's tree** (`scratchpad/econlane/probe-shape.mjs`, the same 50-save corpus
`job-board.test.mjs` builds, clock 19:30, each board's real drafted tiers costed through
`ANSWER_MINUTES_PER_TIER` / `DECISION_SECONDS` / `FIXED_PHASES`):

```
JOB    n=45  targets 10/10/11  answerS 510/690/1260  wall 854/1046/1674 s  split 24.7/34.0/40.3 %  headline 21.7/29.8/35.4 %
VAULT  n= 5  targets  7/ 7/  7  answerS 390/450/ 810  wall 658/ 728/1116 s  split 27.4/38.2/40.7 %  headline 22.9/32.1/34.2 %
PUBLISHED.shapeTableDrafted: identical, field for field, both shapes
budget row (PUBLISHED.shapeTable.JOB): wall 740–862 s, split 43.2–51.3 %
  inside the budget wall range:  1 of 45      inside the budget split range: 0 of 45
  past COMPOSED S1's 25-min ceiling: 1 (longest 27.9 min)
```

So the fix is live: `PUBLISHED.shapeTableDrafted` (measured) and `PUBLISHED.nominalHeadlineSplit` ship
beside the budget row, the budget row is labelled NOMINAL in its own docblock, and
`tests/job-shape-measured.test.mjs` **measures** the product through `postBoard` instead of
canonising it. 1-of-45 and 0-of-45 are the finding's own numbers, reproduced.

**The test is not blind — two negative controls, one on each side** (§Negative controls, NC-C1/C2).
The one that matters is the **product-side** control: changing a real pricing constant
(`ANSWER_MINUTES_PER_TIER[2]` 1.5 → 1.6, i.e. nothing in `PUBLISHED` at all) turns the file red
(`VAULT.answerS: published median 450 is not the measured median 474`). A test that reproduces the
brochure by construction cannot do that. Restored immediately; `md5` verified.

**No code change.** The remaining half of this finding is not mine: Home still prints the nominal row
(`screens/home.js`, its own MAJOR in the `screen` lane) — Request 3.

---

## 2. [MAJOR · exploit-hunt · `COMPOSED-GAME.md`] "G3.1's argmax table is published without its condition" — **PASS (already fixed in the authority; the arithmetic re-measured)**

**The finding's own measurement, reproduced on today's `econ.carryEVAt`**
(`scratchpad/econlane/probe.mjs`, one T1 opener, bare):

```
LOOSE   0  q=0.40:  50 = 2.40   70 = 3.36   85 = 4.32   95 = 5.28    ← every rung's downside is 0
LOOSE   0  q=0.50:  50 = 3.00   70 = 4.20   85 = 5.40   95 = 6.60
LOOSE 120  q=0.50:  50 = 3.00   70 = 2.40   85 = −0.60  95 = −8.40   ← argmax 50
```

Digit for digit the critic's `e-callsweep.mjs` row. The dominance is real, it is reached on target 1
of every job and after every BAG, and it lives in G2's published `−min(LOOSE, …)` cap, which G3.7 #4
keeps on purpose — so closing it is a spec decision, not a data edit (Request 2, unchanged from
round 3).

What the finding asked for is that the **authority** carry the condition instead of leaving it in a
data comment. It now does: `COMPOSED-GAME.md:342` opens the Carry EV block with *"on a pile that can
pay the loss (`S ≥ L·m·P`, G3.2's deep branch). The argmax column below is the DEEP-pile argmax and it
is not unconditional"*, and the paragraph under the table names the three states that reach `S = 0`.
`site/data/job.js:836-844` and `site/js/job/econ.js:635-648` carry the same condition, and
`job-econ.test.mjs §3b` pins the hole itself.

**Negative control (NC-D):** the `job-shape-measured.test.mjs` §2 assertions are regexes over the
document, so I checked they can fail rather than assuming it —
`scratchpad/econlane/nc-doc.mjs` runs the same regexes over the shipped text and over the text with
the phrases removed: `condition true→false`, `deep-pile argmax true→false`, `weakly dominant
true→false`, `where-it-is-reached true→false`. **No code change.**

---

## 3. [MAJOR · econ-math · `COMPOSED-GAME.md`] "«and the app says so» is false" — **PASS (already fixed; the pin it left behind was one-directional and is now fixed too)**

`grep -c 'and the app says so' COMPOSED-GAME.md` → **0**. G3.2 now states what the app says, where,
that scoping it is a Request against `screens/settings.js`, and — the sharper half the round-3 pass
added — that the critic's own mitigation ("on a play path the pile grows, so it falls anyway") is
false: the printed `q*` walks `0.000 · 0.696 · 0.712 · 0.726 · 0.738 · 0.731 · 0.705 · 0.682`, peaking
at beat 5. That is pinned in `job-econ.test.mjs` §5 ("a PLAY path does not rescue the claim either").

**What I changed, and why it is not a weakening.** The round-3 pass left a guard in
`job-shape-measured.test.mjs` §3 asserting the Settings sentence is **still unscoped**
(`assert.equal(scoped, false)`). That pins the *presence of a defect*: the moment the screen lane
applies this lane's own Request 4 and scopes the copy, the suite goes red for someone else's correct
fix — and no repair can satisfy the assertion. The property that actually matters is the **pairing**
(G3.2 makes a claim *about* `settings.js`, so the two must move together), so the test now asserts
**both directions**, exactly one arm firing, plus two things the old form did not check at all:

* scope is read off the **sentence** the claim lives in, not off the matched fragment — a scope is
  most naturally written *in front of* "as the chain deepens" (*"At a fixed pile, as the chain
  deepens…"*), which the fragment cannot see, so the old form would have called that copy unscoped;
* `\bshallow(?![A-Za-z])` rather than `/shallow/`, because two lines above that copy sits
  `shallowQStar(...)` — an identifier. A ±character window reads it as a scope, which is how a lint
  learns to lie. (Measured: a ±260-char window does match `shallowQStar`.)

**Negative control (NC-E):** `scratchpad/econlane/nc-pairing.mjs` runs the new logic over eight
states of the world:

```
shipped copy           + shipped doc          -> PASS
scope BEFORE the claim + shipped doc          -> FAIL: copy scoped, doc still says unscoped
scope AFTER  the claim + shipped doc          -> FAIL: copy scoped, doc still says unscoped
scope BEFORE the claim + doc rewritten        -> PASS      (the state Request 4 asks for)
shipped copy           + doc w/o the record   -> FAIL: copy unscoped, the doc does not say so
shipped copy           + attribution back     -> FAIL: the attribution is back
Request 4's replacement + doc rewritten       -> PASS
Request 4's replacement + shipped doc         -> FAIL: the doc describes a sentence that is gone
```

Assertions: 3 → 5 (and the arm that fires is chosen by a measurement, not by an assumption).
**No code change.**

---

## 4. [MINOR · econ-math · `COMPOSED-GAME.md:420`] "0.900 → 0.143 is published with no S and no L" — **FIXED (numerals published + pinned in this lane; one line for the doc owner)**

**Confirmed, and the spread is bigger than the finding says.** `econ.shallowQStar`, call 95, chains 0…8
(`scratchpad/econlane/m1.mjs`):

```
S= 12 L=18: 0.900 0.542 0.388 0.302 0.247 0.209 0.181 0.160 0.143   ← the published pair
S= 50 L=18: … 0.397      S=100 L=18: … 0.551      S=200 L=18: … 0.683
S= 12 L= 6: … 0.326      S= 12 L=70: … 0.042
```

The c = 0 end is **0.9 for every state** (that half is parameter-free and G3.2 says so correctly);
the c = 8 end runs **0.042 … 0.683**, a **16.3×** spread. So "0.900 → 0.143" is not reproducible from
a document that names neither parameter. `econ.js:547` already named them; the authority did not.

**Shipped in this lane:** `PUBLISHED.shallowQWalk` — the walk with its `S`, `L` and call, plus the
c = 8 endpoint at all six states — and a new pin in `job-econ.test.mjs` §5, *"the shallow walk
0.900 → 0.143 is a function of S and L, and only its START is parameter-free"*, which recomputes
every cell from `shallowQStar`, re-derives the 0.9 start at every state, and asserts the endpoint
spread is > 15×. **The doc line is Spec correction 1.**

---

## 5. [MINOR · econ-math · `COMPOSED-GAME.md:428-430`] "One cell of the printed-q* table is not produced by the formula stated under it" — **FIXED (all 18 cells and their branches pinned; one footnote for the doc owner)**

**Confirmed exactly.** `econ.breakevenQ` on a bare target at `S = 200`, `L = 18`, `ρ̄ = 1`
(`scratchpad/econlane/m1.mjs`; `ρ̄ = 1` is the **default** — passing `rhoBar: 1` as a field makes
`stateRho` read it as a rung distribution, which is how a first attempt at this measurement gets
0.737 instead of 0.683):

```
call 70  printed 0.000 0.000 0.000 0.000 0.070 0.118    branch D D D D D D
call 85  printed 0.444 0.467 0.480 0.494 0.501 0.506    branch D D D D D D
call 95  printed 0.778 0.759 0.747 0.733 0.725 0.683    branch D D D D D S   ← c = 8 is SHALLOW
         L_loss·m·P at call 95:  90  108  126  162  198  234     (S = 200 < 234)
         the stated deep root  : 0.778 0.759 0.747 0.733 0.725 0.720
```

All 18 published cells reproduce from the shipped function, so **the published 0.683 is right and the
caption is what owes the reader a footnote**: 17 cells are the deep root printed under the table, the
18th is `0.9·S/(A+S)`, and a reader recomputing the row gets 0.720 — out by 0.037 — with nothing to
tell them why. Every other of the 18 cells is deep, exactly as the critic said.

**Shipped in this lane:** `PUBLISHED.printedQ` (the parameters, the three rows, and
`shallowCells: [{ call: 95, chain: 8, lossLmP: 234, deepRootWouldBe: 0.720 }]`) and a new pin in
`job-econ.test.mjs` §5, *"the printed q* table reproduces from breakevenQ, and exactly ONE of its 18
cells is not the deep root"*, which
(a) recomputes every cell from `breakevenQ` against the published numeral,
(b) proves each cell's **branch from `econ.isDeepPile`** rather than from the published list,
(c) checks a deep cell **is** the caption's closed form and the shallow cell **is** `shallowQStar`,
(d) pins the census at exactly one, and
(e) pins `L_loss·m·P = 234 > 200` and `deepRootWouldBe = 0.720`, 0.037 from the published cell.
**The doc footnote is Spec correction 2.**

---

## 6. Both MINORs, second half: the AUTHORITY's numerals are now pinned to the shipped function

An arithmetic pin alone would have left the same hole the exploit-hunt MAJOR was about — *"do not
leave the scoping in a data-file comment while the authority prints it flat"*. So
`tests/job-shape-measured.test.mjs` gains a §4 that reads the numerals **out of
`COMPOSED-GAME.md`** (parsed, not retyped) and requires them to be `breakevenQ`'s and
`shallowQStar`'s own answers:

1. *every cell of the printed-q\* table in G3.2 is `breakevenQ` at the parameters the table states* —
   all three rows parsed out of the markdown, 18 cells, each checked against `PUBLISHED.printedQ`
   **and** against the shipped function at `S = 200`, `L = 18`, ρ̄ = 1. Parsed today:
   `call 70: 0 0 0 0 0.07 0.118 · call 85: 0.444 0.467 0.48 0.494 0.501 0.506 ·
   call 95: 0.778 0.759 0.747 0.733 0.725 0.683`.
2. *the 0.900 → 0.143 pair is `shallowQStar` at `PUBLISHED.shallowQWalk`'s own S and L* — the pair
   must be present in the document and must be what the function returns at the published
   parameters. The **parameters** themselves are Spec correction 1, which this lane may not write, so
   that half is a **conditional** arm rather than a lint that would leave the suite red on text
   nobody has written: the moment G3.2 names an `S` and an `L` beside the pair, they must be a pair
   that produces 0.143. Verified to fire on a wrong pair (NC-G).

This is the same direction of authority the file already used — the document is compared against the
computation, never the reverse.

---

## 7. A blind assertion in this lane's file, named rather than quietly left (CREW_MATRIX)

Not one of the five findings, but it is in my file and the ticket's standing instruction applies:
`tests/job-econ.test.mjs:1694-1700` "asserts" the 4×2 crew matrix by comparing **PUBLISHED against
PUBLISHED** — that `data/job.js` still carries the winners G2 prints, and that the published per-point
column still picks the published winner column. It cannot see that the matrix is **false**: the crew
lane measures STEADY winning every shape (STEADY/pt vs HELD/pt `1.50/0.09 · 3.33/0.25 · 5.95/0.48 ·
6.44/0.40`, 12×–17×).

I did **not** reprice the rows and did **not** rewrite the assertions, and neither is timidity:

* the truth **is** policed, where the functions are — `tests/job-crew.test.mjs:1040-1047` asserts the
  published column **and** `assert.notEqual(bestRankFor('JOB'), rowFor('JOB').winner)`, whose own
  message is *"if the published and the measured argmax now AGREE, `data/job.js` CREW_MATRIX has been
  repriced"*. A unilateral repricing here fails that test **by design**;
* which branch the rows take is §S4's decision (delete under §S4.2, reprice under §S4.7), the gate
  passed for §S4.2, and the demolition is deferred to R-D1.

What I did do is make the assertions stop reading as a clean bill of health: a comment block at
`:1694` states exactly what they pin (a transcription and an internal-consistency check — the latter
fires if a repricing flips one column and forgets the other, which is precisely §S4.7's edit), that
they are **not** evidence the matrix is true, where the real measurement lives, and that both edits
land together in R-D1. A blind assertion that says out loud what it cannot see is no longer blind;
one that is silent about it is how round 5 re-discovers this as a surprise.

---

## Negative controls — every new or rewritten assertion, made to fail on purpose

`site/js/job/econ.js` and `site/data/job.js` were copied to
`scratchpad/econlane/*.bak` first and restored after each control; both `md5`s verified identical
afterwards (`06cb7ad4…` / `70ea8079…`).

| id | mutation (reverted) | result |
|---|---|---|
| **NC-A1** | `econ.js breakevenQExact`: branch cut `S >= D` → `S >= D * 0.5` (the switching cell becomes deep) | `job-econ.test.mjs` **114 → 108 pass, 6 fail**, mine among them: `expected: 0.683` |
| **NC-A2** | `econ.js isDeepPile` → `return true` | **6 fail**, mine: `call 95 c8: PUBLISHED.printedQ.shallowCells disagrees with isDeepPile about this cell's branch` — the census is measured, not transcribed |
| **NC-B** | `econ.js shallowQStar`: drop the fee, `(1 − FEE)·S` → `S` | **4 fail**, mine: `shallowQStar c0 at S = 12, L = 18, call 95` |
| **NC-C1** | `data/job.js`: measured `wallS.default` median 1046 → 862 (the budget number) | `job-shape-measured.test.mjs` **1 fail**: *published median 862 is not the measured median 1046* |
| **NC-C2** | `data/job.js`: **product** constant `ANSWER_MINUTES_PER_TIER[2]` 1.5 → 1.6 — nothing in `PUBLISHED` | **2 fail**: *VAULT.answerS: published median 450 is not the measured median 474*. This is the control that proves the BLOCKER's acceptance test measures the product and not the brochure |
| **NC-D** | the §2 document regexes, run over the doc with each phrase removed | every one flips `true → false` |
| **NC-E** | the rewritten §3 pairing logic over 8 states of the world | 4 PASS / 4 FAIL, each for the right reason (table in §3) |
| **NC-F** | `data/job.js`: `PUBLISHED.printedQ.rows[95]` last cell 0.683 → 0.720 (the deep root) | **2 fail, one in each file**: `call 95 c8: the numeral G3.2 publishes` (the arithmetic pin) and `call 95, c = 8: the document and PUBLISHED.printedQ disagree` (the §4 document pin) |
| **NC-G** | the §4 parses run over a drifted / renamed / re-parameterised document (`scratchpad/econlane/nc-docnum.mjs`; COMPOSED-GAME.md never written to) | `one cell drifted → FAIL: doc 0.72 vs PUBLISHED 0.683` · `row renamed away → FAIL: no "printed q*, call 95" row` · `numeral deleted → FAIL` · `correct S,L named → PASS` · `WRONG S,L named → FAIL: S=50 L=18 produce 0.397, not 0.143` |

---

## Tests

* `tests/job-econ.test.mjs` — **+2 tests** in the `push or bag` section (§5): the printed-`q*` branch
  census and the shallow-walk parameters. 112 → 114. Nothing deleted, nothing rewritten.
* `tests/job-shape-measured.test.mjs` — **+2 tests** (a new §4: the document's own q\* numerals
  against the shipped functions, 12 → 14), and the §3 pairing test **rewritten** (assertions 3 → 5).
  That rewrite removed the only assertion I removed anywhere: `assert.equal(scoped, false)`, which
  pinned the presence of the defect rather than a property of the code, and which forbade the fix
  this lane itself requested. Reasoning and the 8-state control in §3 above.
* Nothing in `tests/job-split.test.mjs` (split lane's `canon` fixture, legitimate as a fixed-phase
  check — the gap was that nothing tested the un-canonised path, and that is its own file now).

---

## Spec corrections — for the agent that owns `COMPOSED-GAME.md`

Both are cases where the finding proves a published claim incomplete and the **code is right**, so
per this ticket I did not edit the document.

**1. `COMPOSED-GAME.md:420` — the shallow walk, published without its two parameters.**

OLD (the fragment inside the bolded sentence):
> as the chain deepens the threshold *falls* — 0.900 → 0.143 on a shallow pile at call 95, 0.932 → 0.787 in the deep table above — while the amount at risk *grows*.

NEW:
> as the chain deepens the threshold *falls* — 0.900 → 0.143 at `S = 12`, `L = 18`, call 95 (the start is 0.9 at every state; the `c = 8` end is a function of both parameters and runs 0.042 at `L = 70` to 0.683 at `S = 200`, published as `PUBLISHED.shallowQWalk`), 0.932 → 0.787 in the deep table above — while the amount at risk *grows*.

**2. `COMPOSED-GAME.md:430` — the printed-`q*` table's one non-deep cell.**

OLD (first sentence of the paragraph under the table):
> The deep root is `(L·m·P − 0.10·S) / (L·ρ̄·W·(m−1) + L·m·P)`.

NEW:
> The deep root is `(L·m·P − 0.10·S) / (L·ρ̄·W·(m−1) + L·m·P)`, and it produces **17 of the 18 cells above**. The eighteenth does not come from it: at call 95, `c = 8`, `L_loss·m·P = 234` has overtaken `S = 200`, so that cell is on the **shallow** branch, `0.9·S / (L_gain·ρ̄·W·(m−1) + S) = 0.683` — the deep root would read 0.720 there. The cells, their parameters and the one branch switch are `PUBLISHED.printedQ`, recomputed from `econ.breakevenQ` with each cell's branch proved from `econ.isDeepPile` in `job-econ.test.mjs` §5.

Neither correction is pinned by a document lint **on purpose**: a lint asserting text that is not
written yet would leave the suite red, which this ticket forbids. Once the text lands, the lint is
two lines in `job-shape-measured.test.mjs` §2's style (assert the doc names `S = 12`/`L = 18` beside
`0.900 → 0.143`, and that the caption says `17 of the 18`) — Request 5.

---

## Requests

**1. → whoever runs `notes/repair-crew.md` Request R-D1 — this lane's two rows of it, pre-written.**
The gate passed and the demolition is R-D1's, in one commit across six files. The two rows R-D1 names
for `econ` are below, ready to paste; the third row it gives to *data/meta* (`site/data/job.js`:
delete `CREW_MATRIX`, `COPY` label HELD → DEEP) is in this lane's file and should come with them.
The §S4.7 fallback branch is kept below too, because R-D1 can still fail to land as one change:

*R-D1's two econ rows (§S4.2, the branch the gate selected):*
```js
// site/js/job/econ.js — chainAfterTarget(rung, chain) : crew-independent, hold branch gone
export function chainAfterTarget(rung, chain) {        // was (rung, crewRank, chain, opts)
  return comboTransition(rung, chain);                 // xp.comboTransition verbatim …
}                                                      // … the bag reset stays in chainAfterBag()
```
plus, in `site/data/job.js`: delete `CREW_MATRIX` (lines 345-355) and rename the r2 label
`HELD` → `DEEP` in `COPY` (copy only — crew rank persists as a number, `store.js:204`, so no
migration and the `crew-held` trophy keeps its id). Note for your inventory: this deletes
`tests/job-econ.test.mjs:187-190` (HELD holds at chain 3) and turns `:196-197` (the idle rule **on
the chain**) into assertions about a mechanic that no longer exists — 4 assertions of mine, which
belong in your §S4.3 item 2 count, and I will replace them with §S4.4 item 4's exhaustive
`chainAfterTarget ≡ xp.comboTransition` table (a strictly stronger pin than the shipped
`crewRank: 0` arm). The per-target **idle rule itself** is not in `chainAfterTarget` after this and
every assertion about it elsewhere stays. R-D1's second econ row — the `CREW_MATRIX` winner
assertions at `tests/job-econ.test.mjs:1694-1700` — goes in the same change; §7 above explains why
they are still there today and what their comment now says.

*The §S4.7 fallback, if R-D1 cannot land as one change:* `site/js/job/econ.js` stays untouched and the
edit is `site/data/job.js CREW_MATRIX.rows` → `winner: 'STEADY'` on all four rows, repriced to the
crew lane's measurement (the four `steadyPerPoint` / `heldPerPoint` pairs from `J4_PRINT=1`, since the
same object publishes them). **That repricing may not be done alone:** `job-crew.test.mjs:1046`'s
`notEqual` fails the instant the published and measured argmaxes agree, by its own design, so the
repricing and that test's rewrite are one change (§7).
**And please do not edit `site/data/job.js` from another lane** — three other lanes have MINORs filed
against that file and it is this lane's; name the numbers and this lane lands them in one edit.

**2. → spec (G2's miss branch) — the `S = 0` dominance hole.** Unchanged from
`notes/econ-fix.md` round 3, Request 2, and now measured twice: `−min(LOOSE, L·m·P·wing_pen)` makes
every rung's downside 0 at `S = 0`, so the highest call the rank allows is weakly dominant on target
1 of every job and after every BAG (2.40 / 3.36 / 4.32 / 5.28 at q = 0.40). The cheapest close that
keeps the cap is to charge the miss against **BAGGED-this-job** when `LOOSE = 0`. It is a G2 change;
the hole is printed in G3.1 and pinned in `job-econ.test.mjs §3b`, not hidden.

**3. → the `screen` lane, `site/js/screens/home.js`.** Home's pass-1 board still prints the **nominal**
row (`PUBLISHED.shapeTable`) on the table's own split basis — "JOB · ~13 min · 43 % game" — and pass 2
replaces it with the board's own "~17 min · 30 % game". `PUBLISHED.shapeTableDrafted` (medians) and
`PUBLISHED.nominalHeadlineSplit` exist in `data/job.js` with **zero imports** precisely so this is a
data swap and not a new dependency; the exact `shapeTable()` shim is in `notes/econ-fix.md` round 3,
Request 3, and `tests/job-week.test.mjs` needs the same edit in the same change.

**4. → the `screen` lane, `site/js/screens/settings.js:457` (copy).** *"As the chain deepens the
threshold falls and the amount at risk grows"* is true only at a fixed pile, and the next sentence
pivots to the number the app prints, which is not monotone in the chain at all. Suggested
replacement (unchanged from round 3):

> `'At a fixed pile, deepening the chain lowers this threshold and raises the stake; once the pile '`
> `+ 'can pay the loss it is the fee that moves it, and over a whole job the printed q* does not move '`
> `+ 'in one direction. The app prints your q* before every bag-or-push, computed from your own rung '`
> `+ 'distribution on that make.'`

**This is now safe to apply on its own** — the pairing test in `job-shape-measured.test.mjs` §3 no
longer demands that the copy stay unscoped. It does demand that G3.2's paragraph about it move in the
same change (it currently says the app scopes nothing), so apply it together with the doc lane.

**5. → the `tests`/`doc` lane, after Spec corrections 1–2 land.** Add the two document lints named at
the end of §Spec corrections, so the parameters cannot fall back out of G3.2. (§4 of
`job-shape-measured.test.mjs` already pins the *numerals* against the shipped functions and carries a
conditional arm that goes live on the parameters the moment G3.2 names them.)

**6. → the `doc` lane (S1.5) and then the `tests` lane (S1.3 item 2).** `COMPOSED-GAME.md:361` still
reads *"`q̂` = your first-try rate on that make over the trailing 10 attempts"* and the document
contains no occurrence of `CLEAR rate`. `site/data/job.js:194` is **already corrected** (above), so
the moment G3.1 is corrected the S1.3 lint can be added over both files and will be green on this
side. I did not add it early, for the reason S0 gives: a lint asserting text nobody has written is
not a repair, it is a red suite.

---

## Requests received from other lanes, and what this lane did with them

**`notes/repair-crew.md` R-2 — add a fourth `RUNG_BANDS` band at m ≈ 15–20 (`site/data/job.js`).**
**NOT DONE, on the requester's own instruction:** *"every `Δρ` in G2 and every threshold in
`DEEP_THRESHOLDS` moves, and this lane's §S4 · 1 pin and §S4 · 2 census pin both have to be
re-measured in the same ticket. **Do not do it piecemeal.**"* Re-fitting `DRHO_SLOPE` (which happens
at module load, `crew.js:783`) from this side alone would move the crew lane's two freshly measured
pins. It is a band-design question with a published alternative (their SC-3) and it belongs to one
ticket that owns both files. Recorded here so it is not lost.

**`notes/repair-crew.md` R-D1 — the two econ rows.** See Request 1 above: pre-written, not applied,
and the reason is R-D1's own (one commit, six files).

---

## Files changed

* `site/data/job.js` — three edits, all additive or comment-only:
  1. **added** `PUBLISHED.shallowQWalk` and `PUBLISHED.printedQ` (+ docblocks carrying the branch
     switch and the 16× endpoint spread);
  2. `RATING.qHatWindow`'s docblock at `:194` corrected to the CLEAR rate over sittings, verbatim from
     REPAIR-DECISION §S1.5, with a `//` line beside it so both readings of the §S1.3 lint pass.
  **No existing constant moved or removed**; `CREW_MATRIX`, `SHAPES`, `RUNG_BANDS`, `FIXED_PHASES` and
  every other shipped value are byte-identical.
* `tests/job-econ.test.mjs` — +2 tests in §5 (the printed-`q*` branch census, the shallow-walk
  parameters) and a comment block at `:1694` naming what the `CREW_MATRIX` assertions cannot see (§7).
  112 → 114 tests.
* `tests/job-shape-measured.test.mjs` — +2 tests (§4, the document's own numerals against the shipped
  functions) and §3's pairing test rewritten (both directions, sentence-local scope detection,
  identifier-safe). 12 → 14 tests.
* `site/js/job/econ.js` — **unchanged.** (Used for negative controls and restored; `md5`
  `06cb7ad46490015d08f72254f9a242e8` before and after.)
* `COMPOSED-GAME.md` — **unchanged**, by instruction. Two corrections above.

---

## Suite

**This lane's own files** (`node --test tests/job-econ.test.mjs tests/job-shape-measured.test.mjs`):
**128 tests · 128 pass · 0 fail** (114 + 14; +4 over the 123 I inherited, none deleted, none skipped).

**Every test file in the tree that imports `site/data/job.js` or `site/js/job/econ.js`** — 27 files,
`job-screen.test.mjs` excluded as the browser harness S0 owns:

```
node --test tests/job-align … tests/job-week    →  tests 1451 · pass 1451 · fail 0 · skipped 0
```

That set includes `job-crew`, `job-call`, `job-state`, `job-board`, `job-split`, `job-week`,
`job-meta-constants`, `job-copy`, `job-index`, `job-exploit`, `mock` and `state` — i.e. every
consumer of the two files I edited, all green with other lanes' in-flight work in the tree.

**The whole tree** (`cd /Users/oliver/Projects/unit1a-quest && node --test tests/`, finished 22:58):

```
ℹ tests 2806 · suites 367 · pass 2801 · fail 1 · skipped 4
✖ J6 measured: a full job at 375x667 with the keyboard open, board <= 36px on every target (66011 ms)
```

**One failure in the tree, and it is S0's.** It is `tests/job-screen.test.mjs:871` — the exact test
REPAIR-DECISION **§S0** reproduces, rules blocking, assigns to **lane: screen**, and forbids every
S1–S5 ticket from touching. Per §S0 this note therefore does **not** claim "suite green": it claims
**the only red in the tree is the pre-flight S0 opened, and this lane is not in its blast radius** —
`econ.js` is byte-identical, and `data/job.js` moved only by two additive `PUBLISHED` keys and a
docblock, none of which `job-screen.test.mjs` reads (its own harness measures board height in a
browser). Earlier in this wave the same run showed 8 failures — 7 of them the crew lane's then-unlanded
S4 acceptance tests and the board/screen lanes' in-flight work; all 7 have since gone green.

The true baseline is therefore **2806 tests today** against the 2725 every proposal quoted — the wave
has added 81 — which is the number §S0 asks the ticket that closes it to record.

---

# notes/repair-econ.md — FIXER, lane `econ`, **VERIFY ROUND 1**

Owner of `site/js/job/econ.js`, `site/data/job.js` and their tests. **One finding: the BLOCKER
exploit-hunt raised against the bag-every-beat dominance hole. It is closed at the root.**

`cd /Users/oliver/Projects/unit1a-quest && node --test tests/` → **2916 tests, 2912 pass, 0 fail,
4 skipped** (baseline at the start of this ticket, same tree: 2817 / 2813 / 0 / 4).

---

## 1. [BLOCKER] BAG at every beat made the 95 call free — **FIXED, by covering the premium**

### The finding, reproduced before anything was touched

```
$ node --input-type=module -e "import * as e from './site/js/job/econ.js'; …"
published price of a 95 miss (G3.7 #9): 162
the SAME miss with LOOSE 0 (right after a BAG): 0
chainAfterBag() = 0  bagFee(100) = 10
```

and end to end, through the shipped machine only (`startJob → beginTargets → lockCall →
applyTarget → bag/push → crack → endJob`, realised total read back out of `game.log[].bagged`;
harness `scratchpad/econ-v1/exploit.mjs`, 16 seeded saves × 10 days × JOB-10, `player.rank` pinned
to 3 once so the 95 rung is legal and never touched again):

```
BEFORE (4 seeds × 10 days, the same harness)   q = 0.50
  honest 85 · push   6719      95 always · BAG  13721     +104.2 %, exploit wins 4/4 seeds
```

The critic's mechanism is exactly right. `econ.js` caps the miss at the pile, `chainAfterBag()`
returns 0 and `state.js` sets `g.loose = 0`, so **after a bag every rung's miss is identically 0**
while the clear branch was still strictly increasing in `W`. `screens/job.js beatAfter` offers BAG
at every beat but the last, so "the opening beat" (COMPOSED-GAME:378) was every beat for one tap,
and the `162` that G3.7 #9 names as *the* brake was paid **zero times** on the maximising policy.

### What was NOT done, and why

* **SPEC-CORRECTIONS D-3's own suggestion — charge the miss against BAGGED-this-job — is rejected.**
  G1 publishes "BAGGED is only ever added to: there is no state in which the game takes something
  already bagged", `state.js:1266` restates it and `tests/job-exploit.test.mjs:1669` asserts it
  across a hostile job. A repair that contradicts a published law to mend another is not a repair.
* **Withdrawing the claim at G3.7 #9 is rejected** — the ticket forbids softening a claim, and the
  pin the critic asked for (realised carry under max-call-and-bag ≤ honest play) can only pass if
  the hole is actually closed.
* **A cliff — full premium whenever `LOOSE > 0`, none at `LOOSE = 0` — is rejected**: it moves the
  hole by ε. Priced: at `S = 6` a 95 call on a tier-2 at chain 1 still buys `+13` EV over calling
  50 while risking 6. The close has to be continuous in the pile or it is not a close.

### The close: **THE COVER** (`econ.coverFor` / `econ.coveredW` / `econ.coverOf`)

G2's `min(LOOSE, ·)` truncated the **price** of a bold call and left its **prize** whole. The cover
applies the same cap to both sides of the wager:

```
cover = min(1, LOOSE / |nominal miss|)        W_eff = W(50) + (W_call − W(50))·cover
```

**You are paid a bold call's premium in the same proportion as its penalty is collectable.**

* On a **deep pile the cover is 1** — it is `isDeepPile`'s own ratio — so **every published
  deep-pile number is untouched**: G3.1's EV table, `deepQStar`, the G3.2 deep table, `shallowQStar`.
* At **`S = 0` the cover is 0**: every rung pays `W = 1.0`, the rungs **tie**, `evMaxCallAt` returns
  the bottom of the ladder instead of the top, and the call is settled by the rating — which is
  strictly proper, so honest calling is *strictly* best at the exact state where the top rung used
  to be free.
* The exploit collapses onto "call 50 and bag every beat", which the 10 % fee already prices below
  honest play. It is now **equal to it to the unit**, which is the strongest form of the statement:
  the premium is not merely smaller, it is gone.

Two things the cover deliberately does not read, both documented at the function:

* **crew forgiveness** — at rank ≥ 1 `missFor` returns 0 because the miss rung is *forgiven*, not
  *capped*; the cap is not what removed the price, so the premium stands (cover 1). That hole is
  `notes/econ-fix.md` round 2 §1's own open Request and is not this finding.
* **the 50 rung** — `P(50) = 0`: no price to cover, and `W = 1.0`, so no premium to scale.

### Measured after, at the critic's own scale (16 seeds × 10 days × JOB-10)

```
q = 0.50   honest q̂ · push 36852 | 95 always · BAG 28292  = −23.2 %   (call 50 · BAG banks 28292 — to the unit)
q = 0.65   honest q̂ · push 48266 | 95 always · BAG 33758  = −30.1 %
q = 0.80   honest q̂ · push 62429 | 95 always · BAG 37401  = −40.1 %,  0/16 seeds
```

against the critic's headline baseline (`honest 85 · push`), which is itself an over-call at
q = 0.50 (the shipped `honestCall` says 50 there, and the carry ladder is supposed to punish 85):

```
q = 0.50   85 · push 23893 | 95 · BAG 28292  = +18.4 %      ← both LOSE to honest play by 23–35 %
q = 0.65   85 · push 45274 | 95 · BAG 33758  = −25.4 %
q = 0.80   85 · push 82960 | 95 · BAG 37401  = −54.9 %
```

The ordering is now the one the design asks for: **honest > over-call-and-bag > over-call-and-push**,
and the exploit's advantage over honest play is negative at every `q` measured — where it used to be
`+95.6 %` and to *grow* as the student got weaker.

### The pin the finding asked for

`tests/job-exploit.test.mjs` → `COVERED: "max call + bag every beat" may never out-bank honest play
(q = 0.50 and 0.65)`. It banks both arms through the shipped machine on 4 seeded saves × 4 days,
reads the realised total out of `game.log`, and asserts `exploit ≤ honest` in total **and on every
seed**, with three anti-vacuity guards (both arms reached the log, both answered targets, the
exploit arm really bagged at every beat and the honest arm never bagged).

**Negative control, run before it was kept** — with `coverFor` forced to return 1:

```
✖ COVERED: "max call + bag every beat" may never out-bank honest play (q = 0.50 and 0.65)
  AssertionError: max call + bag every beat banks 5344 against honest play's 3077 at q = 0.5 (+73.7 %)
  — the cover is not holding
```

## 2. What else moved, and why it had to

The cover changes the *shallow* half of the economy, so three kinds of published number moved. None
of them was edited to fit; each was recomputed from the shipped function and re-pinned.

**(a) The BAG branch of the threshold lost its premium.** `PUSH − BAG`'s gain term was
`W·(m − 1)`, which assumes both branches pay the same `W`. A bag empties the pile that backs the
next call, so under the cover the bag branch pays `W(50)` and the term is `m·W_push − W_bag`. Every
printed threshold therefore falls (pushing keeps a premium bagging forfeits):

| | c = 0 | 1 | 2 | 4 | 6 | 8 |
|---|---|---|---|---|---|---|
| printed `q*`, call 85, `S = 200`, `L = 18` | 0.317 | 0.362 | 0.391 | 0.426 | 0.447 | 0.460 |
| …before the cover | 0.444 | 0.467 | 0.480 | 0.494 | 0.501 | 0.506 |

`PUBLISHED.printedQ`, `PUBLISHED.workedRows` and G3.2's table, caption formula, played-path table
and two worked rows are all updated together, and `job-shape-measured.test.mjs` §4 (which reads the
document) passes without being touched — which is the point of that test. **BAG survives as a real
decision**: 237 of 256 outcome vectors on an 8-target board still have a bag in their optimal line.

**(b) `breakevenQExact`'s shallow branch is no longer `shallowQStar`.** `shallowQStar` is G3.2's
*uncovered* closed form — the one Settings prints and the document tabulates — and it is unchanged,
including `0.900 → 0.143` and the `0.9 at c = 0 for every L` property. The printed root is now above
it wherever there is a premium to cover, and equal to it at call 50. Both are pinned; neither can
absorb the other.

**(c) `pushOrBag`'s tie-break moved from BAG to PUSH.** `q*` is published as "push at `q ≥ q*`", so
a verdict computed with `> 0` disagreed with the printed number at every exact tie — and one tie is
not exotic: at `S = 0, c = 0` there is nothing to bank and no chain to lose, so `PUSH − BAG ≡ 0`,
`breakevenQ` returns 0 ("push at any q") and `pushOrBag` said BAG. The debrief printed the pair:
*"you pushed at chain 0; the threshold said bag (q* 0.00, your q̂ 0.95)"*. Round 1's own coherence
sweep caught it the moment the cover changed which states are reachable.

**(d) G3.7 proof 2's pinned counterexample.** On the outcome vector it was pinned at, the cover
**repairs** the violation (331 → 336 — the clear now pays). The exception is not gone: the same four
targets violate on a different vector (483 → 467, drop 16), and the `n ≤ 11` sweep measures
**0.190 % of flips, worst 22, 1.92 % of the bag** against the published 0.234 % / 22 / 1.9 %. The
document and `tests/job-monotone.test.mjs` carry the new pair, and the test now asserts the removal
on the old vector rather than leaving it to the reader.

## 3. Files changed

* `site/js/job/econ.js` — `coverFor`, `coveredW`, `coverOf`, `realisedMult` (new exports);
  `carryFor` gains a `loose` argument (default `Infinity` = "price the ladder"); `settle` passes the
  pile on both branches; `bagThenAnswer` / `pushThrough` / `pushMinusBag` / `breakevenQExact` price
  the cover; `pushOrBag`'s tie-break; docblocks on all of it.
* `site/data/job.js` — `PUBLISHED.printedQ` (18 cells + the shallow cell's deep root),
  `PUBLISHED.workedRows`, and the `evTable` / `printedQ` docblocks.
* `COMPOSED-GAME.md` — G3.1's `S = 0` paragraph (the cover, with its measurement), G3.2's printed-`q*`
  table + caption + played-path table + worked rows, G3.7 #9 (the claim the finding falsified, now
  true and carrying its own history), G3.7 proof 2's numerals.
* `tests/job-econ.test.mjs` — §5b rewritten from "KNOWN HOLE, pinned" to the closure and its two
  ends; the payout-rebuilt `PUSH − BAG` now passes the pile on both branches; the played-path walks
  price the cover; the escalation, worked-row, table and shallow-root pins recomputed. 114 pass.
* `tests/job-exploit.test.mjs` — **the new end-to-end pin** (proof 9), with its negative control run.
* `tests/job-monotone.test.mjs` — the pinned counterexample's outcome vector and its four numerals.

### Requests / changes made in files this lane does not own

* **`site/js/screens/run.js`, ONE LINE (made, marked in the file).** `realisedOrderOf` rebuilt each
  realised target with `mult = d/(ρ·m·W)`; under the cover `W_eff` depends on `mult`, so that
  division no longer inverts the payout and `tests/job-debrief.test.mjs` went red in three places.
  The inversion is closed-form in two branches and now lives in `econ.realisedMult` (one file owns a
  payout and its inverse); the screen's line reads
  `mult = jobEcon.realisedMult(d, { rho, chain, call: c.call, loose });`. Round-trip verified over
  1 152 states, 0 mismatches. **Request to the run lane: keep it, or move the inversion inline — but
  it may not go back to a bare division.**
* **`tests/job-monotone.test.mjs`** (tests lane): the pinned counterexample above. The assertion
  structure is unchanged and nothing was loosened — one `rung` field and four numerals moved, and an
  assertion was **added** for the vector the cover repaired.
* **Settings copy** (`screens/settings.js`, screen lane): the "chain, and when to bank it" card
  prints `shallowQStar`, which is unchanged, so it is still correct — but it is now the *uncovered*
  form and the card does not say so. Round 2's Request to scope that paragraph is unchanged and
  still open; this makes it slightly sharper.
* **`js/job/call.js`** (call lane): `argmaxCall(q̂)` is the unconditional ladder. At `S = 0` the
  rungs now tie, so `econ.evMaxCallAt(state)` is the only right answer for G5 #2's second regret
  line. Same Request as round 1, unchanged.

## 4. Open

* **Crew forgiveness still makes pushing strictly dominant on a forgiven target** (`lossLFor` is 0
  there, so `breakevenQ` returns 0 — push at any `q`). The cover deliberately does not touch it:
  the price is removed by a *ladder step*, not by the cap, and paying a premium for a genuinely free
  bet is the same defect in a different mechanism. It wants the same treatment and it is a G2
  decision, not a fixer's. Unchanged from `notes/econ-fix.md` round 2 §1.
* The cover is priced off the **loss-side** nominal (`L·m·P·wing_pen·×2`). On a realised-order
  replay the two `L`s are folded into one `mult` field (round 2's own Open item), so the cover a
  debrief replay computes is the gain-side one. `realisedMult` inverts whatever `settle` charges, so
  the replay is self-consistent; it is not the same number the live beat used. The fix is still
  J5c/J6b's open request to record the pricing in `inProgress.game.calls[]`.

---

# VERIFY ROUND 2 — the econ lane

Two findings, one BLOCKER and one MAJOR. Both are fixed at the root; neither was closed by
restating a claim, and no test was weakened to get the suite green. `node --test tests/` is
**2995 tests · 2991 pass · 0 fail · 4 skipped**.

## 1. [BLOCKER] Over-calling was the best-paid reporting policy on every dressed target

**The finding reproduces exactly.** `node /tmp/exh/e19.mjs` and `/tmp/exh/e21.mjs`, run before
anything was touched:

```
  call 50:  CLEAR   64   MISS     0   breakeven q = 0.0000
  call 70:  CLEAR   89   MISS   -19   breakeven q = 0.1759   (the rung claims p = 0.70)
  call 85:  CLEAR  115   MISS   -65   breakeven q = 0.3611
  call 95:  CLEAR  140   MISS  -162   breakeven q = 0.5364

  review + cold  q=0.50  evMaxCallAt=70   honestCall=50   ⚠ DISAGREE     … 4 of 5 cells
```

### The cause, stated precisely

`carryFor` was one flat product — `round(L·ρ·m·W·scope·wing·cold·tell·×2)`. The call's multiplier
`W` therefore rode the GAIN multiplier set while its price `P` was charged by `missFor` on the LOSS
set, which G2 deliberately makes smaller (`scope`, `cold` and `tell` do not scale a loss). **Dressing
a target was arithmetically identical to raising `q`**, so the carry ladder's published indifference
points — `call.carryIndifference() = [0.600, 0.7778, 0.88235]` — held on a bare target and on nothing
else. G3.8 step 1 sends the min-maxer at the review block first; reviews carry the highest scope in
the game.

### The repair

The clear branch is now **two terms**, and `settle` / `pushThrough` / `pushMinusBag` /
`breakevenQExact` all price the same two:

```
Δloose = round( m_chain · ( LOOT + STAKE · ρ_eff · (W_call − 1) ) )
  LOOT  = L · ρ_eff · scope · wing · cold · tell · ×2      (`gainLFor`·ρ̄ — the target's worth)
  STAKE = L · ×2                                           (`stakeOf`/`stakeLFor` — what the CALL bets)
```

Every pairwise indifference is then `q·ρ̄·ΔW = (1−q)·wing_pen·ΔP`. At `ρ̄ = 1` on an unguarded wing
that is exactly `0.600 / 0.7778 / 0.88235` — **at every scope, wing, cold, tell, ×2, chain and pile
depth**, shallow pile included (there the premium is `ρ̄·S·(W−1)/(wing_pen·P)` against a price of `S`,
which is the same cut again). `ρ̄ = 1` is the state a call is MADE at: the rung does not exist yet,
and `rhoBarFor(null)` is what `evMaxCallAt` and the envelope price a call on.

**No published numeral in `data/job.js` moved.** On a bare target `LOOT === STAKE·ρ_eff`, so the
whole thing collapses to `round(L·ρ·m·W)` — G2's old product — and every published table (`evTable`,
`printedQ`, `workedRows`, `carryIndifference`, `shallowQWalk`) is computed on exactly that basis.
`realisedMult`'s two-branch inverse is unchanged for the same reason, and its round trip still holds.

### Two deviations survive, and both run toward caution

| | cuts | why |
|---|---|---|
| unguarded, `ρ̄ = 1` | **0.600 / 0.7778 / 0.88235** | the published ladder, exactly |
| guarded wing | **0.750 / 0.875 / 0.9375** | `wing_pen = 2` prices the miss and is deliberately NOT in `STAKE` |
| `ρ̄ < 1` (hinted / 2nd attempt) | higher again | `ρ_eff` multiplies the premium |

Both push the cuts UP, so **money can ask for more certainty than rank and never for less: a lie is
never the best-paid report anywhere.** `PUBLISHED.carryIndifferenceGuarded` publishes the second row
rather than leaving it to be re-found.

**Why `wing_pen` is out of the stake, measured rather than asserted.** Putting it in makes the
guarded cuts published too — and doubles a bold call's PRIZE inside the guard as well as its price,
which inverts the guard: a guarded tier-1 at rank 1, chain 3, call 85 then out-earns the same target
on a safe wing at any `q > 0.870` (17.1 against 15.2 at `q = 0.95`), i.e. a confident student should
hunt the guard. That variant was built, measured and rejected. **Why `ρ_eff` is IN**: it keeps G3's
printed *"a hint costs 30 %"* exactly true (30.3 % measured, against 19.7 % without it), and it
narrows the monotonicity cost below.

### The evidence

Over **1 059 840** (target × chain × rung × pile × `q`) cells — 4 tiers × scope {0.5, 0.8, 1, 1.25} ×
cold × tell × tokens × guarded × ×2 × chain {0, 4, 8} × rung {0, 1, 2} × 5 piles × `q` 0.50…0.95:

```
$ node <scratchpad>/final.mjs            # integer rounding scaled out with mult: 1000
1059840 cells · argmax ABOVE the honest rung outside the published bands: 0
unguarded + rho=1 + deep + off-band: argmax != honest in 0

$ node <scratchpad>/final2.mjs           # at shipped integer scale
1059840 cells · argmax ABOVE the honest rung outside the published bands: 2675   (0.25 %)
worst edge to the lie: 0.60 loot
```

so what is left is `round` alone, never worth more than 0.60 loot, against the **+19.3 % of the
honest rung's whole EV** the defect paid. The critic's own target now clears at `64 / 73 / 82 / 91`
against the same untouched misses `0 / −19 / −65 / −162`.

### The pin the finding asked for

`tests/job-econ.test.mjs` **§3c**, three arms — §3b only ever exercised a bare target, which is why
the suite could not see any of this:

* *on a DEEP pile the carry argmax is the published rung at EVERY dressing, tier, chain and rung* —
  the 192-dressing grid, exact at `ρ̄ = 1` on each wing's own ladder, one-directional at rungs 1–2.
* *…so `evMaxCallAt` agrees with `honestCall` everywhere but the two PUBLISHED bands (safe wing)* —
  the critic's requested assertion, over >5 000 (state, `q`) pairs, with an anti-vacuity check that
  the bands are real.
* *…and on the GUARDED wing the money ladder is never looser than the rating one* — plus the guarded
  cuts derived from the constants, and asserted to sit above `carryIndifference()` at every rung.
* *the dressed target the critic measured* — that exact state, pinned rung by rung.

### What it cost, published rather than absorbed

**G3.7 proof 2's general-order monotonicity exception widens: 0.190 % → 0.334 % of flips, 1.92 % →
2.32 % of the bag, worst absolute violation unchanged at 22 loot.** A clear's payout now carries a
term that does not shrink with the target's own gain multipliers, so more orders have a clear whose
chain amplification outruns it. The design bound — ≤ 1 % of flips and ≤ 5 % of the bag — is
untouched and still passes, and the shape sweep (RUN · JOB · VAULT × 8 seeds) still has **0**
exceptions. `tests/job-monotone.test.mjs` now pins the rate in a **two-sided** band (`0.003 ≤ rate ≤
0.0035`, `worst === 22`) so it cannot drift in either direction unnoticed; the pinned counterexample
moved 483/467 → 476/460 with **the drop itself, 16, unchanged** and the whole mechanism trace
unchanged.

Two smaller consequences, both in the direction the design wants:

* the tell's realised multiple on a 70 call is **×1.184**, not ×1.25 — the tell is a quarter of the
  LOOT and not of the premium, so G12 #14's tell-farming trade needs **six** paying targets to repay
  instead of four. It also closes the tier-1 rounding inflation `job-exploit.test.mjs` had pinned as
  an open issue (`round(6×1.25) + 6×0.4 = 10` against 8 — exactly ×1.25, where the compounded
  roundings used to give ×1.375).
* the guard is now a tax at **every** `q`, asserted over ranks 1–5 and tiers 1–4, where the old arm
  only checked that one clear was smaller than another.

## 2. [MAJOR] The full-use fixed-phase column billed 25 s to a phase the machine cannot enter

**Reproduced**: `grep -rn "setPhase(.*crew" site/js/` → 0 hits; `phase = 'crew'` appears nowhere in
`js/job/state.js`. The crew move is an ACTION inside the `brief` phase (`screens/job.js setCrewRank →
takeBrief → state.brief → crew.allocate`, the only caller chain there is), so its seconds have always
banked into `ph.brief`. `node /tmp/splitcrit/canon.mjs` reproduced the deficit to the decimal:
JOB −1.5, JOB12 −1.2, VAULT −1.5, RUN Δ 0.0 — zero on exactly the one column whose `crew` cell is 0.

**It was also a DOUBLE charge, which decides which way to fix it.** G1 publishes the brief window as
*"50 s at full use, five real options, no padding"*, and the third of those five is *re-rank one crew
slot*. G1's own decision table charges it the same way — `brief windows (skip, or up to 5 options
each) | 2 | 10`, no crew row — and `DECISIONS.briefOptionsMax = 5`. Only the SECONDS table billed it
twice. It is a survivor of the between-jobs crew screen G2 withdrew (G12 #54).

**So the cell is gone, not moved.** `FIXED_PHASES` holds only phases the machine enters,
`'crew'` is out of `PHASE_ORDER`/`GAME_PHASES` (`state.tick` now refuses it by name), and the full
JOB column is **257 s**, not 282. Nothing about the running game changes — a real full-use student
always spent those seconds inside a brief window — so no board projection, ledger mean or §3
agreement arm moves. What changes is that the published column is the one the app produces:

| | published before | published now = measured |
|---|---|---|
| JOB full, session basis | 51.3 % | **49.8 %** |
| JOB-12 / VAULT | 40.3 % / 34.1 % | **39.1 % / 32.6 %** |
| headline basis | 47.3 / 37.0 / 30.1 | **45.6 / 35.7 / 28.4** |
| JOB full wall clock | 14:22 | **13:57** |

`PUBLISHED.shapeTable`, `nominalHeadlineSplit`, `fixedTotals` and the two `shapeTableDrafted` `full`
bands are all **re-measured** (the drafted bands each fell by the same 25 s; their `default` bands are
untouched, which is the defect's own signature). RUN is untouched at both ends — its `crew` cell was 0.

**The band is tightened so this cannot hide again.** `tests/job-split.test.mjs` §2's full-use arm was
`abs(got − pub) ≤ 5` plus a recorded tolerance (`assert.ok(got < pub, 'the crew phase is not
creditable')`); it is now an **equality** on the rounded percentage, exactly like the default arm,
with `ph.brief` asserted to account for both windows and nothing beside them. Two new arms:

* *every shape reproduces BOTH published cells exactly — the full column included* (8 cells).
* *no cell of FIXED_PHASES charges seconds to a phase the machine cannot enter* — drives all four
  shapes on both paths, collects the phases actually entered, and asserts every published phase key
  is one of them; plus `tick(save, 'crew')` throws `bad-phase`.

## 3. Files changed

* `site/js/job/econ.js` — `stakeOf` (new), `carryFor`, `stakeLFor` (new export), `lossLFor`,
  `clearAt` (new), `bagThenAnswer`, `pushThrough`, `pushMinusBag`, `breakevenQExact`, `fixedSeconds`;
  docblocks carrying the measurement on all of it. `realisedMult` unchanged (its docblock says why).
* `site/data/job.js` — `FIXED_PHASES` (the `crew` cell, and the docblock that explains it),
  `PHASE_ORDER`, `GAME_PHASES`, `PUBLISHED.fixedTotals`, `PUBLISHED.shapeTable`,
  `PUBLISHED.nominalHeadlineSplit`, `PUBLISHED.shapeTableDrafted` (both `full` bands),
  `PUBLISHED.carryIndifferenceGuarded` (new).
* `tests/job-econ.test.mjs` — §3c (three new arms), the clear-branch formula, the `gainLFor` /
  `lossLFor` / `stakeLFor` decomposition, the guarded threshold pair, the play-path walk, the tell,
  the two fixed-phase arms. 118 pass.
* `tests/job-split.test.mjs` — §2 tightened to equality, two new arms, the walkthrough's `ph`
  snapshot and phase watch. 37 pass.
* `COMPOSED-GAME.md` — G2's clear branch and the four paragraphs under it; G1's fixed-phase table and
  its new paragraph; G1's budget table, the three-percentages line and the VAULT brief line; G3.2's
  "two `L`s"; G3.7 #9; G3.8 step 3; G8 J8, G9 #1, G12 #23 and #72's numerals.

### Requests / changes made in files this lane does not own

* **`tests/job-exploit.test.mjs`** (exploit lane), two tests, no assertion deleted and none loosened:
  *the guard multiplies both branches too* now checks the loot cut at the 50 rung, asserts the guard
  is a tax in EXPECTATION at five `q` values (the old arm only compared one clear against another,
  which is why it could not see the inversion the rejected variant would have shipped), and pins that
  the call's premium is the SAME on both wings. *the ×1.25 is worth a QUARTER* pins the exact ×1.25 on
  the loot, the ×1.184 realised multiple on a 70 call, and the repay count 6; the tier-1 rounding
  inflation it recorded as an open issue is asserted as CLOSED (×1.25 exactly) rather than bounded.
* **`tests/job-monotone.test.mjs`** (tests lane): the pinned counterexample's two numerals
  (483/467 → 476/460 — the drop and the mechanism trace are unchanged), and the §3.7(2) bound, which
  is **raised** from 0.0025/0.02 to 0.0035/0.025 and given a two-sided band plus `worst === 22`.
  That is the one loosened bound in this round; it is a re-measurement of a published exception whose
  design bound (≤ 1 % / ≤ 5 %) is untouched and still passes, and it is published in G3.7 rather than
  absorbed.
* **`tests/job-shape-measured.test.mjs`** (tests lane): one line — its local copy of the fixed-phase
  sum dropped its `+ p.crew` term. No assertion changed.
* **`site/js/screens/settings.js`** (screen lane), UNCHANGED and a standing Request: the "chain, and
  when to bank it" card prints `shallowQStar`, which this round did not touch, but round 2's Request
  to scope its escalation sentence is still open.
* **`js/job/call.js`** (call lane), a Request: `carryIndifference()` is now exact rather than
  approximate on an unguarded wing at `ρ̄ = 1`, and `PUBLISHED.carryIndifferenceGuarded` is the
  guarded pair. `disagreementBands()` is still computed on the unguarded ladder only; a
  `disagreementBands({guarded: true})` would let Settings print the guarded pair too, which is the
  one surface that still cannot show a student the ladder they are actually on.

## 4. Open

* **Crew forgiveness still makes pushing strictly dominant on a forgiven target.** Unchanged from
  round 2 §1 and verify round 1: `lossLFor` is 0 there, so `breakevenQ` returns 0. Note that the
  premium is still paid in full on a forgiven target (`stakeOf` does not read the crew), which is the
  same shape of hole in the same mechanism. It is a G2 decision, not a fixer's.
* **The guarded wing has no surface that prints its own ladder.** Settings prints
  `carryIndifference()`; a student inside the guard is facing `0.750 / 0.875 / 0.9375`. Filed as the
  call-lane Request above. Nothing is dishonest — the app prices every call from `econ` — but the
  published boundary and the faced boundary differ there and only this note says so.
* **`deepQStar` / `shallowQStar` were left alone.** They are G3.2's published TABLE forms, explicitly
  not the number the app prints (`breakevenQ` is), and they are stated at `ρ̄ = 1` on a bare target,
  where this round changed nothing. On a dressed target they are now a slightly different
  approximation of a slightly different economy than `breakevenQExact` is — as they already were.

---

# VERIFY ROUND 3 — the econ lane

Owner of `site/js/job/econ.js`, `site/data/job.js` and their tests. Three findings, one BLOCKER and
two from spec-fidelity. All three reproduced against today's tree before anything was edited; the
harness is `/tmp/claude-501/.../econ-r3/getaway.mjs` in this session and, because `/tmp` is reaped,
its arm is now permanent as `tests/job-econ.test.mjs` §8 (the sweep) and §9 (the document lints).

**Suite:** `node --test tests/job-econ.test.mjs` → **133 tests, 133 pass, 0 fail** (was 128: ten new
arms in §8/§8b and five in §9). Whole-tree result at the bottom.

## 1. [BLOCKER] WALK at the getaway was strictly dominated by a branch that could not lose — **FIXED at the root, by pricing the two exits at PARITY**

**Reproduced, on the shipped machine, before editing.** 50 seeds × 4 shapes of the same seeded corpus
`tests/job-exploit.test.mjs` drives, every job played to its getaway and then FORKED: one branch
walks, the other cracks at the 50 rung and deliberately throws the vault. Both driven to a terminal
debrief and read out of `game.log`:

```
RUN    n=50  WALK 198.7  CRACK@50+MISS 218.7  x1.1001  crack>walk 50/50  worst x1.0976
JOB    n=50  WALK 424.5              466.9   x1.1000              50/50        x1.0989
JOB12  n=50  WALK 561.9              618.2   x1.1002              50/50        x1.0993
VAULT  n=50  WALK 248.9              273.9   x1.1004              50/50        x1.0982
ALL   n=200                                  x1.1002  crack ahead 200/200  worst x1.0976
```

The critic's own sweep (`/tmp/.../e22-getaway-all.mjs`) is reproduced to the fourth decimal on the
worst branch. **The two shipped facts that compose into it**, each verified on its own:

* `CALL_LEVELS[0]` is `{ id: 50, W: 1.0, P: 0.0, minRank: 1 }`, so `econ.missFor` returns `0` at that
  rung in EVERY state (`raw = L·m·P·pen·x2·mult` with `P = 0`), and `call.canCall(50, rank)` is true
  at every rank. A deliberate miss on the vault therefore costs exactly nothing.
* `state.endJob` paid the completion on `complete = targetsLeft(s) === 0` — "every drafted target was
  ANSWERED" — and a thrown vault is an answered one. WALK banks the same LOOSE at the same full rate
  (`bankOnExit` routes WALKED and KNOCKED through the identical `econ.getawayBank`) and took none of
  it.

**The repair, and why it is not the other two.** The finding offered three. Two were rejected with a
reason, and the reason is the product's, not a preference:

* *Gate the completion on the vault CLEARING.* **Rejected.** It makes facing the last lock of the
  night worse than skipping it for any student who is not sure — the game would pay them to stop
  studying. §3.7 proof 6 forbids exactly that state in as many words, and BUILD-POLICY's honesty
  architecture is the reason the proof is there.
* *Exclude the stake-free 50 rung from the getaway's call row.* **Rejected**, same clause. That rung
  IS proof 6's "zero-downside call always exists"; removing it at the getaway makes the last problem
  a forced gamble and re-opens the same hole one beat earlier. It is also not in this lane's files
  (`call.canCall`, `CALL_LEVELS[*].minRank`), so it could only have been done as a phase-aware
  special case in a file another fixer is editing.
* *Price WALK at parity.* **Taken.** A WALK AT THE GETAWAY is the one exit whose only unanswered
  target is the vault, and it already banks the same pile at the same rate; the whole difference
  between it and CRACK-then-throw was a free option. It now takes the same `COMPLETION`. A **mid-job
  QUIT still takes none** — it leaves targets the student never faced, which is the case G1 line 259
  was written for — and still auto-banks at 50 %.

**Where the rule now lives.** `econ.exitBonusRate({ honoured, complete, stakes, getawayWalk })`, new
export, pure, with the measurement in its docblock. `state.endJob` asks it (see §Requests: one line
in a file this lane does not own). `econ.walkOrder` — this lane's own MODEL of the walk exit, whose
docblock literally read *"no completion bonus, because targets remain"* — takes the same bonus, so
the model and the machine cannot drift apart again. That docblock was the published half of the
defect and is corrected in place rather than deleted.

**Re-measured after, same 200 getaways, same script:**

```
CRACK@50 MISS   x1.0000  beats WALK   0  loses   0  ties 200  range x1.0000..x1.0000
CRACK@50 CLEAN  x1.3244  beats WALK 200  loses   0            range x1.0337..x3.0930
CRACK@70 MISS   x0.7987  beats WALK   0  loses 200            range x0.0000..x0.9613
CRACK@70 CLEAN  x1.4054  beats WALK 200  loses   0            range x1.0570..x3.4535
CRACK@85 MISS   x0.4912  beats WALK   0  loses 200            range x0.0000..x0.8716
CRACK@85 CLEAN  x1.4716  beats WALK 200  loses   0            range x1.0814..x3.5000
```

**Parity is an IDENTITY, not a statistic, and §8 asserts it as one.** The throw moves LOOSE by 0, so
both exits reach `endJob` with the same pile and now apply the same `round(pile·1.1)`. §8's arm is
`assert.equal(r.branches['50-miss'], r.after)` — integer against integer, on every getaway — not a
mean inside a band. The means are asserted too, against `PUBLISHED.getawayParity`, with the band and
the reason for the band stated in the section header: the identity is composition-independent, the
mean is not.

**What the getaway now is.** Two live branches, and the live decision is the **rung**. The rung's own
break-even against walking is `q* = |miss|/(clear + |miss|) = P/(W + P)` — `0 · 3/10 · 10/19 · 25/36`,
recomputed from `carryFor`/`missFor` on an uncovered pile in §8 and published as FRACTIONS (a decimal
`0.5263` trips this file's own G11 rejected-band lint on its leading digits, which is worth knowing).
The cover moves each of them **down** and never up, asserted, because a premium the pile cannot back
is a premium not charged — at a 300 pile on a tier-4 vault only the 95 rung moves, to 0.6787.

**Two published claims were false against this and are corrected, not softened.**
`COMPOSED-GAME.md:37` sold CRACK/WALK as *"all-in on the vault, or leave with the bag"* — a wager
with two live branches, which it was not — and `:657` published the min-maxer as *"Cracks the vault
when `q > 3/7`"*. **No `(W, P)` pair on the shipped ladder produces 3/7**, and the min-maxer's real
answer was `q = 0` on every shape, for a free ×1.10. The key-table row now reads *"take the vault at
a rung of your choosing, or leave with the bag"* with a paragraph under it carrying the measurement;
§3.8 #6 is rewritten to the shipped thresholds and says what it used to claim. G12 **VR3-GETAWAY**
records the whole trail.

## 2. [BLOCKER] Three sites published the pre-cover worked rows — **FIXED at all three, and lint-pinned**

**Reproduced:** `node -e` on `site/data/job.js` gives `PUBLISHED.workedRows` =
`(−12, BAG)` and `(+133.20, PUSH)`; `data/job.js:1044` records the supersession in its own docblock
(verify round 1 put the premium on the STAKE and gave the BAG branch its own `W`); §3.2 at `:516-517`
already prints `30 + 28 − 70 = −12` and `30 + 163.20 − 60 = +133.20`; and
`tests/job-econ.test.mjs:285` drives `pushMinusBag`/`pushOrBag` on exactly those two states. Three
document sites printed the superseded pair — G8's J1 acceptance row, G12 #3, and the "left alone"
list.

**Fixed:** all three now print the shipped pair. The third is the sharper half and is treated as
such: the worked rows are **off** the "left alone" list, with the cover named as the reason and with
the same self-aware sentence the list already carries about the guard fixed point one item away.
G12 #3 keeps the old pair as a quote beside the new one, so the history stays readable.

**And pinned so it cannot be retyped again** — `tests/job-econ.test.mjs` §9, which reads
`COMPOSED-GAME.md` by PARAGRAPH (the document hard-wraps, so a line-based lint splits claims in half)
and enforces one rule: *a superseded numeral may be quoted, but only beside the one that replaced
it.* `90.96` is the needle; the bare `−40` deliberately is **not**, because the document uses that
exact string for an `R_player` step and a lint that cannot tell the two apart teaches people to
ignore it. A second arm re-drives `pushMinusBag`/`pushOrBag` on the two published states, so the lint
can never certify a constant that has drifted from the code.

## 3. [MAJOR] G10 #18 and G12 #40e published the VAULT as 17:26–18:58 — **FIXED, with the 25 s traced**

**Reproduced:** `PUBLISHED.shapeTable.VAULT.wallS` is `[1046, 1113]` → 17:26 → **18:33**; 18:58 is
1138 s, which is 1113 + the 25 s `crew re-allocation` fixed-phase cell that **this lane's own verify
round 2** deleted as unreachable and double-charged (§2 of that round, above). `tests/job-split.test.mjs:287`
recomputes both ends from the shipped constants, and G1's budget table two paragraphs up had already
been re-measured to 18:33 — three sites had not. `grep -rn "18:58" site tests` returns nothing:
**no code ever produced the published figure.**

**Fixed** at `:120`, G10 #18 and G12 #40e, each citing `PUBLISHED.shapeTable.VAULT.wallS` and naming
the deleted cell, so the 25 s are traceable rather than lost — that trail is the half of this finding
that mattered, and G12 VR3-VAULT states it. §9 lints it two ways: every VAULT **range** in the
document must end at the shipped figure (or correct itself in the same paragraph), and no file under
`site/` or `tests/` may name 1138 s or 18:58. The seconds needle carries word boundaries, because a
16-digit board digest in `tests/job-board.test.mjs` contains those four digits inside it and a
substring match would have called that a wall clock.

## 4. Files changed

* `site/js/job/econ.js` — `exitBonusRate` (new export, and the whole rule), `walkOrder` (takes the
  same bonus; docblock corrected), `withBonuses` (docblock: which model composes and which picks).
* `site/data/job.js` — `PUBLISHED.getawayParity` (new: the before/after table, the six branches, and
  the per-rung crack thresholds as fractions).
* `tests/job-econ.test.mjs` — §8 (6 arms: the sweep, the identity, the reproduced defect, its
  absence, the six branches, the thresholds), §8b (4 arms: the rule, its range, the state.js source
  pin, the walkOrder model), §9 (5 arms: the two document lints, the machine link, the tree scan, and
  the withdrawn 3/7). 133 pass.
* `COMPOSED-GAME.md` — the key table's CRACK/WALK row and a new paragraph under it; §3.8 #6; G8's J1
  row; G12 #3; G10 #18; G12 #40e; G1's budget paragraph; the "left alone" list; and a new
  `### Verify round 3 — the econ lane` section with VR3-GETAWAY, VR3-ROWS and VR3-VAULT.

## 5. Requests / changes made in files this lane does not own

* **`site/js/job/state.js`** (state lane) — **one line changed**, BUILD-POLICY §2, marked in place
  with an `=== econ lane, verify round 3 ===` comment:

  ```js
  -  const bonusRate = honoured ? COMMIT_BONUS : (complete && g.stakes !== false ? COMPLETION : 0);
  +  const bonusRate = econ.exitBonusRate({
  +    honoured, complete, stakes: g.stakes !== false, getawayWalk: word === OUTCOMES.WALKED,
  +  });
  ```

  Nothing else in `endJob` moves; `COMPLETION`/`COMMIT_BONUS` stay imported there because the debrief
  prints them. The adjacent block comment gained three lines saying that verify round 3 added the
  other half of G1 line 259 rather than taking this one back. `tests/job-econ.test.mjs` §8b pins the
  call with a source regex and asserts the inline ternary is gone, so a revert is a red test and not
  a silent regression.
* **`tests/job-monotone.test.mjs`** (tests lane) — one arm re-pinned, **nothing loosened and nothing
  deleted**. *"WALK at the getaway banks LOOSE at FULL value, exactly as bestWalk assumes"* asserted
  the fee-free banking on `debrief.bagged`, which now also carries the parity bonus (it read 513
  against 466). The claim is unchanged and is asserted on the field that carries it — `baseBagged`,
  the pile before the bonus — and **two assertions are added**: that a getaway WALK's `bonusRate` IS
  `COMPLETION`, and that the debrief prints `round(baseBagged · 1.1)`. So the arm went from one
  assertion to three at the very site the walk model reads. `bestWalk` itself is untouched and
  unaffected: it prices BARE orders (no `completion` flag), the bonus is a constant multiplier, and
  it now applies to both exits equally, so no crack-vs-walk comparison in that file can move. The
  monotonicity sweeps and their published exception rate are byte-unchanged.
* **`site/js/screens/settings.js`** (screen lane), UNCHANGED, a Request: `:663` prints the rule as
  *"…drafted target pays +10 % on the bag; an honoured walk-away declaration pays +8 %…"*. That is
  now incomplete — a WALK at the getaway pays it too — and the sentence should say so, ideally by
  interpolating from `econ.exitBonusRate`'s cases the way `job-meta-constants.test.mjs` requires of
  every other Settings numeral.
* **`tests/job-meta-constants.test.mjs`** (doc/meta lane), UNCHANGED, a Request: §9's two document
  lints belong beside the doc lane's own `SPEC`/`SPEC_LINES` arms in that file's verify-round
  sections. They are in `job-econ.test.mjs` instead because this lane owns that file and three lanes
  were appending to `job-meta-constants.test.mjs` at once. The paragraph-splitting idiom
  (`SPEC_MD.split(/\n[ \t]*\n/)`) is worth lifting: the existing arms there are line-based, and this
  document wraps its claims across lines, which is how the VR3-VAULT quote would have slipped a
  line-based lint.
* **`site/js/job/call.js`** (call lane), UNCHANGED, a Request carried over from verify round 2 and
  now with a second reason: `disagreementBands()` still computes on the unguarded ladder only, and
  the getaway is exactly where a student meets the guarded one with the whole pile on the table.

## 6. Open

* **A getaway reached with `LOOSE = 0` makes the vault free in the strong sense** — nothing can be
  lost at any rung — so every rung ties there and the argmax is the top one. That is correct (there
  is no wager without a stake) and it is not reachable for free: getting there means bagging at beat
  `n−2` and paying the 10 % mid-job fee on the pile, which is strictly worse than carrying it. None
  of the 200 measured getaways had `LOOSE = 0`. Recorded because "the wager is live exactly when
  `LOOSE > 0`" is a real condition on G1's key-table paragraph and the paragraph does not state it.
* **A thrown vault is re-queued by the STUDY layer**, so the deliberate-miss line meets the same lock
  again until it clears — which is why §8's crack driver loops back through the getaway rather than
  finishing in one pass. It costs the exploiter nothing in loot (the pile is unchanged), so it was
  not a defence; it is noted because a single-pass harness measures only 133 of the 200 getaways and
  would under-report the sweep.
* **A getaway WALK now banks 10 % more, which touches one adjacent dial and no other.** G5's flow
  control fires after two consecutive jobs with `BAGGED < 0.5·posted`; a walked job's BAGGED is now
  10 % higher, so that trigger is marginally less likely on a walk. The move is in the direction the
  dial intends (it exists to catch a student who is losing, and a walk is not a loss), it changes no
  published numeral, and no arm in the suite moved. Recorded because it is a real downstream effect
  of this repair and nothing else in the tree says so.
* **`withBonuses` still composes both flags where `exitBonusRate` picks one.** No caller in the tree
  sets both on one order, so the two models cannot disagree today, and `exitBonusRate` is named in
  `withBonuses`'s docblock as the authority. Unifying them touches `regretLine`'s replay model and
  belongs to a round that has a finding for it.

## 7. Suite

`node --test tests/job-econ.test.mjs` → **133 / 133**, 0 fail.
`node --test tests/job-econ.test.mjs tests/job-monotone.test.mjs tests/job-split.test.mjs
 tests/job-exploit.test.mjs tests/job-state.test.mjs tests/job-state-r1.test.mjs
 tests/job-ledger.test.mjs` → **358 / 358**, 0 fail — every suite that models the economy, the
machine, the exits or the ledger.

**Whole tree, with eleven other lanes writing to it at the same time.** The tree was **2995 tests /
2991 pass / 0 fail / 4 skipped** when this lane started. The last full run as this lane finished is
**3072 tests / 3067 pass / 1 fail / 4 skipped** — the growth is every lane's new arms, fifteen of
them this lane's. The one failing test is `tests/job-week.test.mjs:1403` *"the projection reads the student's OWN last five jobs
when the ledger has them"* (the board projected 29 % against a debrief headline of 22 %). **It is not
this lane's, and that is measured, not asserted:** with `exitBonusRate`'s parity clause temporarily
removed — i.e. the exact pre-repair rule — `job-week.test.mjs` fails the same test, identically,
107 / 108. `board.js` reads `targets`, `posted`, `tGame`, `tAnswer` and `briefs` off `game.log` and
names `bagged` once, as a literal default; this repair moves only `bagged`, `bonusRate` and
`finalBagged`, none of which can enter a percentage of elapsed time. `site/js/job/board.js` and
`site/js/page.js` were both being rewritten while this ran (the board lane's `projectFor` findings),
and every other failure in the intermediate run — the draft-union net, the 375x667 keyboard, the two
`COMPOSED-GAME.md` doc lints — cleared on its own as those lanes landed, without a line from here.

# repair-doc — the DOC lane, verify round 1

Owner file: `COMPOSED-GAME.md` (the game spec). Authority: `COMPOSED-GAME.md` + `COMPOSED.md`,
overridden by `BUILD-POLICY.md`. This lane writes no product code.

Eight findings from the round-1 verification critics (3 BLOCKER + 1 BLOCKER carried from
exploit-hunt, 4 MAJOR). All eight verified against the shipped code before editing — none was
refuted. Every numeral published below is one a shipped function produces **and** a test asserts.

Baseline before: `node --test tests/` → 2817 tests, 2813 pass, 0 fail, 4 skipped.

---

## What changed in `COMPOSED-GAME.md`

### 1 · G3.2's over-calling brake (BLOCKER, exploit-hunt)

**Was:** `:378` — "The only published brake is the rank ladder (95 needs Called 3, and systematic
over-calling drives the rating that gates it to 0), which is a *rating* brake, not an EV one."
The same sentence was withdrawn at G3.7 #9 (`:589`) and recorded on G11's withdrawn list
(`:1077`) in the round-3 repair. One withdrawal, two sites; the second was never edited.

**Now:** the sentence is gone. G3.2 states the post-ratchet truth — the 95 rung is gated at
Called 3 **on the way up only**, rank is a ratchet, so the rung is never withdrawn afterwards,
and at `S = 0` there is no EV brake and no rank brake; what is left is the carry ladder,
`P(95) = 5.0`. The measurement is the one the suite already owns, not the critic's 120-call
figure: `tests/job-call.test.mjs` S3 item 5 drives a **full fifty-slot** window (the window IS
50 — `RATING.N`) of 95-calls at q̂ = 0.5 and asserts `n = 50`, `rating 0.00`, bare rank
`Called 1`, printed rank held, `held === true`. The critic's "120 calls, rank 3" is the same
result read through a rolling window from a Called-3 floor; the 50-call form is what ships and
what is asserted, so that is what is published.

### 2 · "what a throw cannot buy is the rank" (MAJOR, exploit-hunt)

**Was:** `:208` and `:587`, both unqualified. True of a learner, false of a student already
competent on the unit.

**Now:** both sites carry the condition, and `:591`'s "a throw buys a tool they already own" is
scoped to a student who has a rung. The mechanism, measured through `call.callEntry` /
`ratingDetail` and newly pinned (arm C of the lint below):

| student | window | rating | rank |
|---|---|---|---|
| already competent, q̂ 0.97 | `w = 0.116 < 0.25` → **empty**, `n = 0` | **5.00** | **Called 2** |
| same student, throwing back to q̂ 0.90 | full, `n = 50`, honest rung 85 | **9.536** | **Called 5** |
| then masters again | empty, `n = 0` | 5.00 | **Called 5, `held === true`** |

9.536 is not a new number: G2 "Rank" already publishes it as the *demotion* slide
(`9.536 → 8.656 → 5.000 at q̂ 0.90 / 0.93 / 0.95`); this is the same arithmetic read forwards.

The critic's 40-seed simulation table (rank@30…rank@150, C5 share) is **not** published — no test
measures it. The mechanism that produces it is published and pinned instead. See Requests.

### 3 · G1 called the Home pass-1 defect live (BLOCKER, spec-fidelity)

`:113` said the shape-table swap was "a Request in `notes/econ-fix.md`, not a change this lane
may make". It landed. `screens/home.js:20` is the comment saying the shim is gone,
`grep -n PUBLISHED site/js/screens/home.js` returns only that comment, and `boardModel` returns
`minutes` / `wallS` / `endsAt` / `ends` / `split` / `projection` / `projectionSource` as `null`
**by contract** (its own docblock's words). `tests/job-week.test.mjs:1012` and `:1138` assert the
`null`s on every week state and seed that posts a board. The paragraph now states the closure and
the pointer at the closed Request is deleted. G7, G12 #20 and G12 #65 already agreed; G1 was the
lone dissenter.

### 4 · G2's Rank table published a non-partition (BLOCKER, spec-fidelity)

`:320-324` printed `RANKS[i].bandTop` (`4.9 / 6.4 / 7.6 / 8.8`) against thresholds
`5.0 / 6.5 / 7.7 / 8.9`, so 4.95, 6.45, 7.65 and 8.85 sat in **no** printed band while
`call.rankFor` ranked every one of them. Replaced with the partition
`screens/settings.js rankBandCells()` renders — `< 5.0` · `5.0 to < 6.5` · `6.5 to < 7.7` ·
`7.7 to < 8.9` · `≥ 8.9` — plus a paragraph naming the defect and its negative control.

### 5 · G1's sample primary button (BLOCKER, spec-fidelity) — and a SECOND site the critic did not find

`:167` printed `TAKE THE POSTED JOB · … · ~14 min · ends 20:31 · 48 % game` on a draft the same
section declares to be `SHAPES.JOB.tierMix`. Recomputed through `board.js projectFor`'s own terms
with no ledger (rates 1, `PHASE_MEANS_DEFAULT`):

```
answerS  = 8×0.5 + 2×1.5 min          = 420 s
decisionS= 8×14  + 2×24               = 160 s
gameS    = 18 + 12 + 2×20 + 25 + 160  = 255 s      (debrief-headline basis)
wallS    = 420 + 255 + 65             = 740 s      = PUBLISHED.shapeTable.JOB.wallS[0]
→ ~13 min  ·  round(100×255/675) = 38 % game  = round(PUBLISHED.nominalHeadlineSplit.JOB[0])
```

48 % is none of the four published bases. The line is regenerated as
`[ JOB · A D E · 10 targets · posted 100 (−5 shared) · ~13 min · ends 20:30 · 38 % game ]`, the
trace header now states its clock (**board read at 20:18**) so `ends 20:30` follows from
`now + wallS`, the whole arithmetic is printed under the trace, and the example is labelled
**NOMINAL** as G1's own basis rule at `:100` requires.

**Second site, found while fixing the first:** `:737` (G6, "Every primary button prints…") carried
`JOB · 10 targets · ~14 min · ends 20:31 · 48 % game` — the identical unproduceable line. Fixed
the same way. This is the same one-fix-two-sites failure as finding 1, which is why the lint
below walks the whole document rather than the first hit.

### 6 · G10 #10 cited a crew mechanic that does not exist (MAJOR, spec-fidelity)

"HELD crew skips the *call*" — `grep -rn "skip.*call\|autoCall\|skipCall" site/js/job/
site/js/screens/job.js` returns nothing. `state.lockCall` is unconditional on crew rank; the only
other door to the stem is `beginAnswer`, which throws `stakes-on`; crew is read only afterwards at
`crewFor` / `forgivenessOf`. Clause struck; the bag/push-occupies-the-continue-slot half resolves
Global rule 4 on its own, and G1's decision table (`CALL | 10 | 10`, totals 24/35) already agreed.

### 7 · G3.7 proof 4 cited `drawnBy: 'job'` (MAJOR, spec-fidelity)

`grep -rn "drawnBy" site/ tests/` → **zero** hits. The field exists on no queue item, in no
serialiser and in no test; it came from `designs/game-heist.md:272`. The proof's conclusion is
correct, its cited defence was fictional. Replaced with the mechanism that is real: `applyTarget`
is the only writer of LOOSE, the chain and a `calls[]` entry; `screens/job.js:1174` is its only
caller; the only other `call.callEntry` call site under `site/js/` is `screens/mock.js
applyMockCall`, the Mock's one prediction per run at `w = 1.0` (G12 #40d), which is not a card
answer. Verified by grep before publishing.

### 8 · G12's "left alone" list re-confirmed a withdrawn pair (MAJOR, spec-fidelity)

The list claimed this revision left "the guard fixed point `k = (n−1)/Σ(1/v_i)` with `(⅓,⅓,⅓)`
and `(0.60, 0.40)`" alone, while G12 #57 and G11 withdrew exactly that pair in the same revision.
The entry now keeps the ε = 0 closed form — which *was* confirmed — and says plainly that its two
worked pairs were not, pointing at §3.4's shipped attractors `(4/11, 4/11, 3/11)` / `(7/11, 4/11)`.

### G12 changelog

New sub-section **"Verify round 1"** with entries **#71–#77**, one per finding above, in the
document's established *Claimed / True / Changed* form, plus a closing paragraph naming the one
thing this round did **not** close (below).

---

## Cross-lane change: `tests/job-meta-constants.test.mjs` (APPENDED BLOCK ONLY)

BUILD-POLICY §2 — this lane does not own that file. The block is **appended at the end**, wrapped
in its own `describe`, touches nothing above it, and is doc-lane work by subject: every arm reads
`COMPOSED-GAME.md` and checks it against a shipped function, which is exactly the class this file
already owns for `settings.js` / `stats.js`. Findings 1 and 2 both asked for it by name. If the
tests lane would rather own it, move the block verbatim.

`describe('doc · COMPOSED-GAME.md may not re-assert a claim it withdrew (G12 #71–#77)')`, four arms:

- **A · the exact regression.** Every site of `systematic over-calling drives the rating that
  gates it to 0` must retract it, and the sentence it lived in may not come back. Includes an
  in-test **negative control** that splices the round-3 sentence back into G3.2's own paragraph
  and asserts the lint flags it.
- **B · the class.** Four other phrases on G11's withdrawn list, same rule.
  *Why the retraction test is windowed, not line-wide:* a markdown paragraph is one line here and
  some run 2 000 characters. The round-3 defect's own paragraph contains "it is not a corner case"
  120 characters upstream of the phrase, so any line-wide retraction test would have passed it.
  The retraction has to sit within reading distance: 60 chars upstream, 200 down. G11's withdrawn
  list and G12's `N. **Claimed…` entries are exempt — quoting the old claim is their subject.
- **C · the arithmetic behind finding 2's qualification.** The three rows of the table above,
  through `callEntry` / `ratingDetail` / `rankFor`, including the learner half that survives.
- **D · the numerals the document quotes off a shipped surface.** *Every* sample primary button in
  the document against `PUBLISHED.shapeTable.JOB.wallS[0]` and
  `PUBLISHED.nominalHeadlineSplit.JOB[0]`, with `ends` derived from G1's own stated clock; and
  G2's Rank table against `rankBandCells()`, with the orphan control.

Both lints were verified to **bite**: re-inserting the round-3 sentence flags
`COMPOSED-GAME.md:384`, and restoring the round-3 triple flags `:167` and drops the live count.

After: `node --test tests/job-meta-constants.test.mjs` → 46 tests, 46 pass, 0 fail.

---

## Requests

**To the exploit lane — `tests/job-exploit.test.mjs`, an already-competent arm.** Finding 2's
critic asked for it and this lane did not land it: it is a week-simulation change inside another
lane's file, not a doc lint. Every arm of the throw-rate pin holds `rank: 3` common across arms
(`week`'s priced target), which is precisely what lets the throw's cost be priced apart from the
rank prize — and therefore what makes the case where the claim fails invisible. What is needed is
one arm at a **fixed high true ability** where the rank is *not* pinned but carried forward from
`ratingDetail(..., { rank })`, measuring the share of seeds reaching Called 5 honest vs at throw
rate 1/8. The mechanism is already pinned at the scorer (arm C above); what is missing is the
end-to-end week. Published as open in G12's round-4 closing paragraph rather than implied shut.

**To nobody in particular — `notes/econ-fix.md`.** G1 `:113`'s pointer at that file is deleted
(the item closed). The two other pointers at it — the `S = 0` miss-floor change in G3.2 and the
27:54 supply tail in G1 — are unchanged and still open.

## Tree state at hand-off — READ THIS BEFORE BLAMING THIS LANE

The suite was **green when this lane started** (2817 / 2813 pass / 0 fail / 4 skipped, run before
any edit). It is **not green now, and none of it is this lane's**. Other lanes are editing this
tree live:

```
site/js/job/econ.js       02:47   site/js/screens/job.js   02:51
site/data/job.js          02:50   site/js/screens/run.js   02:52     (clock: 02:53)
```

Two other `node --test tests/` runs and two `qa/job-screen.mjs` Playwright runs were in flight
from other sessions at the same moment. The smoking gun is not a numeric drift at all:

```
tests/job-align.test.mjs:748
import { bandFor, drawRung, ownDueReviewIndices, makeOf, STEADY as CREW_STEADY } from '…/crew.js';
SyntaxError: Identifier 'makeOf' has already been declared
```

— a half-written import, i.e. a file caught mid-edit. The other failures are all code assertions
in the modules with fresh mtimes: `evMaxCallAt` at `LOOSE = 0` now returns 50 where the pin wants
95, `breakevenQ` returns 0.061 where the table says 0.07, the Mock's `w` is 0.25 where G12 #40d
says 1.0, `payoutLineOf` / `call.credit` routing. Somebody is mid-way through the `S = 0`
miss-floor change and the Mock weight.

Final full run at hand-off: **2886 tests · 2864 pass · 18 fail · 4 skipped** (the count grew from
2817 because other lanes are adding tests too; 8 of the new ones are this lane's). The failure set
shrank 40 → 18 over the session as those lanes converged, and its shape moved with them: it is now
14 Mock-weight assertions in `job-week` (`w` 0.25 where G12 #40d says 1.0), the `job-align` import
SyntaxError, and `job-screen` / `job-call` / `mock` / `job-state` / `job-board` / `job-debrief` /
`job-exploit` in ones and twos. **`tests/job-meta-constants.test.mjs` passed in that run** —
`✔ doc · COMPOSED-GAME.md may not re-assert a claim it withdrew (G12 #71–#77)`.

**Proof this lane's edits are not in it.** Over the 25 test files that read `COMPOSED-GAME.md`,
run together: 1361 tests, 26 fail, and **zero** failure message mentions `COMPOSED-GAME` — every
one is an assertion about a source module this lane did not touch. `tests/job-meta-constants.test.mjs`
(the only file this lane wrote to) is **49 / 49 green** both in isolation and inside that run. The
two assertions this lane's finding 3 rests on — `job-week.test.mjs`'s pass-1 `null` sweeps at
`:1012` and `:1138` — both pass.

**A second lane is also writing `COMPOSED-GAME.md`**, which this lane was told it owns alone.
G12 #70's "still open" entry was rewritten mid-session by someone else (the layout-matrix clause
grew `job-answer-kb` / `job-payout-kb` / `qa/audit-states.mjs` and the visual-viewport fold). All
eleven edits below survived — they are in different regions — and nothing of theirs was reverted,
but a later reader should not assume this file has had one writer this round.

**One thing to watch when the econ lane lands.** If the `S = 0` miss floor is being changed to
floor against BAGGED-this-job, then G3.2's `**At S = 0 every rung's downside is exactly 0**` and
the new paragraph under it go stale together, as does `"Closing the hole itself … has not been
taken"` — which was already in the document before this round. That is one coordinated doc edit,
not three; whoever lands the code should file it, or re-run this lane.

## Not done, deliberately

- No product code was touched. No test was deleted, skipped or weakened.
- The critic's 120-call figure (finding 1) and 40-seed rank table (finding 2) are not published:
  no shipped test asserts either. The equivalent results that ARE asserted are published instead.
- `git` was not run in any form.

---

# repair-doc — the DOC lane, verify round 2

Owner file: `COMPOSED-GAME.md`. Same authority chain, same rule: this lane writes no product code,
and every numeral it publishes is one a shipped function produces **and** a test asserts.

Four findings (2 BLOCKER + 2 MAJOR). **All four reproduced against the shipped tree before a word
was edited; none was refuted.** The pattern in every one is the same and is named in the document's
own new G12 section: the code landed a repair, wrote down in its own docstring what it had done,
and this document went on publishing the pre-repair rule. A spec that is behind its own code is not
merely stale — it reads to a later round as authority to "repair" the code back.

## Reproductions (run first, before editing)

| finding | what I ran | what came back |
|---|---|---|
| 1 · the rank cap | read `site/js/job/call.js:588-597` + `slotCeiling` | `earned = Math.min(value, ceiling)`; `rank = rankFor(earned, {floor})`. `grep -n "ceiling\|earned" COMPOSED-GAME.md` → nothing describing it. Confirmed. |
| 2 · G3.8 reachability | `J4_PRINT=1 node --test tests/job-align.test.mjs` | `brief: … ALL 1.0 % \| contenderDomain.all 7.7 %` · `19 makes: … ALL 0.0 % \| 2.0 %`. 0 fail. Confirmed. |
| 3 · the five-of-five walk claim | `node --test tests/job-board.test.mjs` | `[0,200,0,0,0.37,0.84,3.85] · [3,200,0,0,1.37,2.51,3.49] · [5,200,26,13,2.32,5.05,5.88]`. 0 fail. Confirmed exactly. |
| 4 · the phone sheet | re-ran the critic's own `pos.mjs` (drives `qa/audit-states.mjs`'s `prepare()`) | `chromium job-envelope 375x667 position=static height=232 max-block-size=232px` · `job-board 375x667 position=static height=253 max-block-size=253.46px` · `390x844 → 264`. Confirmed in both engines. |

## What changed in `COMPOSED-GAME.md`

### 1 · G2 "Rank" + G3.1 — THE CAP (MAJOR, call-propriety)

Three sentences were falsified by one unpublished rule, and all three are repaired at the root
rather than softened:

- the ratchet rule now reads **`rankFor(min(value, ceiling), { floor })`**;
- **THE CAP** is a new paragraph in G2 — the formula, the fact that it reads no slot's `ok`, the
  slot-by-slot propriety identity, the **readable branch** (`q̂ ≥ ½`, which over computable rates is
  exactly `{0.5, 0.6, 0.7, 0.8, 0.9}` — the set `job-call.test.mjs` §1 asserts by `deepEqual`), the
  driven arms §4/§5, and the price (`player.rank` may be **below** `rankFor(player.rating.value)`;
  read legal rungs off the rank);
- **F1 is published as an OPEN finding**, in the document's own voice: on `q̂ < ½` the ambiguous `w`
  is read at the flattering root and a lie can out-cap the honest 50; the `value` term of
  `min(value, ceiling)` is what closes it, which is weaker than the identity the readable branch
  gets, and closing it in the cap needs `q̂` on the stored entry — a save-schema change no lane owns;
- **"Rank helps, monotonically in the rating" is struck** and replaced by "monotone in the EARNED
  rating", with the reason stated inline: two windows with the same rating can hold different ranks;
- G3.1 states the same rule where propriety is proved, tied to the Sanity table by the asserted
  identity `ceiling === expectedRating(q̂)` (so 7.69 / 9.48 / 9.54 are the cap, not a second table);
- **G2's high-water paragraph and G9 #4 now carry BOTH statistics.** `player.rank` is a high-water
  of `earned`; `player.records.bestRating` stores `detail.value` (`state.js:1191`, `:1916`,
  `mock.js:698`). The current window's `ceiling` is recomputable from each slot's stored `(w, p)`;
  the `earned` that bought a *past* rank is not. So `· best rating 9.90` may honestly sit beside a
  rank 9.90 alone would not buy, and the document says so instead of implying they are one number.

**Numerals deliberately NOT published.** The critic's evidence and the test's own banner quote
`33.0 % / 83.0 %` over 400 lives at true q 0.55, and `8.456` / `9.480` / `1.80` for individual
capped rungs. **No arm asserts any of them** — §4 asserts the *direction* (truth ≥ one rung over and
≥ one rung under, on the persisted rank, at six true rates) and §5 asserts the anti-tautology
control. The direction is what is published. Same rule as round 1's 120-call figure.

### 2 · G3.8 / G9 #5 / G8's J4 row — the domain's reachability (BLOCKER, crew-alignment)

`crew.js alignmentFor`'s shipped docstring says **"`domain.all` is therefore a limit case and not a
description of an evening"**, `tests/job-align.test.mjs` §9 asserts it, and its header says in so
many words that the document publishes the domain and not the rate. It did not. G3.8 now publishes
the rate where the claim is made — **≤ 5 % of 300 drafted boards at the brief's own call, ≤ 1 % over
the 19-make pool**, both asserted as bounds — names conditions 1 and 4 as the universally-quantified
ones that empty the conjunction, states the limit-case sentence in the document's own voice, and
adds `contenderDomain` (strictly larger, still < 25 %). G9 #5 and G8's J4 row carry the same bound;
a lint asserts at least two sites do, because round 1's lesson was that a one-site withdrawal is not
a withdrawal.

The **printed** readings (1.0 % / 0.0 % / 7.7 % / 2.0 %) are given in one parenthesis and explicitly
labelled as printed-under-`J4_PRINT`-but-not-asserted, exactly as G8's `r13` rows already are.

### 3 · G1 statement 2, the round-3 correction under it, and G9 criterion 1 (MAJOR, test-integrity)

SPEC-CORRECTIONS **A-3** existed, said verbatim *"Do not publish 'up to five of five' unqualified"*,
and had been applied at **none** of the three sites. Applied at all three, in the two registers the
arm asserts: **per cell up to three walks in the five-job window; as a distribution at five of five**
— 87 % of 200 cells inside 5 points, median 2.3, worst 5.9, with the asserted bounds (16 % / 3.0 /
6.0) printed beside them. The round-3 sentence's own figures ("worst gap 2.1; 16 shape × save
cells") are kept and labelled as the 16-cell measurement they were, against the 200-cell-per-level
sweep that replaced them — the wider sweep is a real improvement and the note says so; what is
withdrawn is the claim, not the repair.

Why the residue is not "an open defect": at five of five the projection window holds **no finished
job**, so `board.js personalRates` has no unambiguous decision measurement to rate
(`tGame − fixed` after `k` answers lies anywhere in `[(k−1)·D + call, k·D + call]`), and the line
prints `projected` rather than `your last 5 jobs`. That is an information limit; A-3 also records
that the obvious fix (`postedAnswered`) was measured and is **worse**.

### 4 · G6's phone paragraph (BLOCKER, layout-safari)

`Board sheet 264 px sticky during the decision phases` — false in both halves at the 375 px phone
the paragraph itself calls load-bearing. Replaced with what `css/job.css` declares: the cap
`min(var(--job-board-sheet), 38dvh, var(--job-board-fit, 100dvh))`, the 253 px the `dvh` term allows
at 375×667, the ~695 px of viewport height 264 needs to be reachable at all, and **normal flow, not
sticky** — `position: sticky` is on `.job-board` in exactly one rule in the whole file, inside
`@container jobscreen (min-width: 896px)`, and the file argues at *THE 264 px SHEET* that the narrow
form must not be sticky because a sticky grid item cannot leave its own grid area. The later clause
in the same paragraph ("does not fit under a 264 px board on a 375×667 screen") is corrected to 253.

N-2 rewrote this paragraph's `Collapsed:` sentence in the repair round and left this clause standing
two clauses earlier; N-4 now sits beside N-2 so the next reader applies them together.

**Not decided here:** whether 264-and-sticky is the *intent*. If it is, `job.css:152` and the narrow
form are what must move. The document publishes the record; it is not the half that decides that.

### G12 changelog

New sub-section **"Verify round 2"**, entries **#78–#81**, one per finding, in the document's
established *Claimed / True / Changed* form, plus a closing paragraph naming F1 as the one thing this
round did not close.

## Cross-lane changes — two, both minimal, both declared

**1 · `tests/job-meta-constants.test.mjs` — APPENDED BLOCK ONLY** (same standing as round 1's, same
justification: this file already owns the "a surface may not restate a constant the code owns" class
and the document is a surface). New `describe('doc · COMPOSED-GAME.md may not publish a rule the code
has moved past (G12 #78–#81)')`, four groups, **each deriving the document's numerals from the
shipped artefact rather than restating them**:

- **E** — the cap. The doc must quote `rankFor(min(value, ceiling), { floor })` and must not carry
  the pre-cap sentence; the shipped scorer is driven (`70` at q̂ = 3/5, all clears) and must report
  `capped` with `rank < rankFor(value)`; the published readable branch is `deepEqual` to the set
  recomputed from `RATING.qHatWindow` + `isInformative`; F1 must be labelled open **and the code must
  still have the hole** (if `slotCeiling` ever closes it, this arm fails and the doc must stop calling
  it open); "monotonically in the rating" may not stand unretracted; and `state.js` must still write
  `detail.value` into `bestRating`, or the two-statistic exception is what changes.
- **F** — the reachability bounds are **parsed out of `tests/job-align.test.mjs`'s own assertions**
  and required verbatim in the document, at ≥ 2 sites.
- **G** — the five-of-five bounds are **parsed out of `tests/job-board.test.mjs`'s own assertions**
  (`0.16`, `0.6 × SPLIT.agreeWithinPoints`, `1.2 × …`) and required in the document; "five of five"
  may not appear unqualified; and the arm's **name** must name both registers.
- **H** — the cap declaration is **read out of `css/job.css`** and required verbatim in the document;
  253 and 695 are **derived** from the `dvh` term and `--job-board-sheet` (never typed); and
  `position: sticky` must be on `.job-board` in exactly one rule, inside the ≥ 896 px container query.

All eight negative controls verified to **bite** (scratch harness: mutate the artefact, re-run the
predicate). Derived at run time: `38dvh @ 667 = 253 px`, `264px unlocks at 695 px`.

**2 · `tests/job-board.test.mjs` — ONE LINE, a test NAME.** The arm was called
`'THE CRITERION survives a history of mid-job walks — swept over all 50 saves, every shape'` while
at five of five it asserts `over.length / cells.length <= 0.16`, i.e. it tolerates 13 % of cells
falsifying the criterion it is named for. Renamed to
`'THE CRITERION survives a history of mid-job walks — PER CELL to three of five, as a DISTRIBUTION at
five of five (all 50 saves, every shape)'`. **No assertion was touched, added, removed or weakened.**
The substring `THE CRITERION survives a history of mid-job walks` is preserved deliberately, because
`site/js/job/board.js:699`, `notes/repair-tests.md:566` and `notes/repair-board.md:41/:301` all cite
the arm by that text and this lane does not own those files.

**3 · `designs/SPEC-CORRECTIONS.md`** — new entries **B-3** (the cap, with "do not repair the code
back" in capitals), **C-8** (the reachability), **N-4** (the phone sheet, filed beside N-2 with
"apply together"), and A-3 stamped **APPLIED**. All four marked *APPLIED, verify round 2, doc lane*
so round 5 does not re-apply them against a document that already carries them.

## Requests

- **To the call lane / whoever owns the save schema.** F1 is open and is now published as open. The
  fix is `q̂` on the stored `calls[]` entry so `slotCeiling` can read the branch instead of guessing
  it generously (`notes/repair-call.md` round 4, Requests). Until then the honest statement is the
  one G2 now makes: exact on the readable branch, generous off it, closed by the rating's own value.
- **To the board lane.** `queueTargets` / a per-job `calls` count on the log entry is what turns the
  five-of-five register from a distribution back into a per-cell claim. The document is now written
  so that landing it is a *strengthening* edit at three known sites, not a rewrite.
- **To the screen lane.** N-4's last paragraph: if 264-and-sticky is the intent, `css/job.css:152`
  and the narrow form are the half that has to move. Nobody has ruled.
- **Still open from round 1, unchanged:** the already-competent end-to-end arm on
  `tests/job-exploit.test.mjs` (#74). Not landed by this round either.

## Not done, deliberately

- No product code was touched. No test was deleted, skipped or weakened; the one test edit is a name.
- `git` was not run in any form.
- No numeral was published that a test does not assert. Where only a bound is asserted, the bound is
  what the document claims and any point reading beside it is labelled as printed-not-asserted.

---

## ADDENDUM — what moved UNDER this round while it was writing (read this first)

Between the reproductions above and the hand-off, other lanes landed three changes inside the exact
surfaces this round was correcting. **Every one was caught by this round's own lints, within minutes
of landing, rather than by the next critic** — which is the whole reason the lints exist. The
document and the note were then re-verified against the code and rewritten; what is published is the
tree as it stands at hand-off, not the tree the findings were written against.

**1 · F1 is CLOSED. The call lane landed `q̂` on the stored call entry.**
`callEntry` now writes `{p, ok, q, skill, at}` for a composer-drawn call (the Mock's defined-weight
form still writes `{p, ok, w, skill, at}`), `slotCeiling(w, p, q)` reads the slot's own material
instead of guessing a root, and `ratingDetail` passes `e.q`. Verified here, not taken on trust:

```
truth-not-maximal violations over ALL q̂: []        # the truthful rung out-caps every rung at every q̂
sandbag q̂=0.2 ceiling 0.0000 rank 1 | earned q̂=0.8 ceiling 9.4800 rank 5
entry shape: {"p":0.85,"ok":true,"q":0.8,"skill":"M","at":1}
```

So G2 THE CAP no longer carries a readable-branch restriction: the identity holds over the whole
informative grid `q̂ ∈ {0.1 … 0.9}` (`job-call.test.mjs` S3-CAP §1 asserts that grid by `deepEqual`,
and keeps the pre-fix flattering-root reading as its negative control). The only double-root reading
left is a slot with **no make**, where it can only cap too high and demotes nobody (§1b). The
F1 bullet in G2, the G3.1 pointer, G12 #78, the round's closing paragraph and SPEC-CORRECTIONS B-3
were all rewritten to publish the closure — **and B-3 now says in capitals that rolling the schema
back means moving the document back with it.** This lane's lint arm changed sides deliberately: it
now holds the closure, and fails if `callEntry` stops storing `q`.

**2 · `player.records.bestRating` now stores `detail.earned`, not `detail.value`** (all three
writers: `state.applyTarget`, `state.endJob`, `screens/mock.js applyMockCall`). This is strictly
better and it simplifies G9 #4's exception rather than widening it: `rankFor` is monotone, so a
high-water over `earned` is exactly what the held rank recomputes from —
`player.rank === max(the rank this save started at, rankFor(player.records.bestRating))`, one line a
reviewer can check. The paragraph I had written (two statistics that may honestly disagree) was
true for about four minutes and is gone. `bestRating20` remains the printed **rating**'s own record.
The lint no longer names a field at all: it reads the writers, insists they agree with each other,
and insists the document names the same one — so the prose moves with the code either way.

**3 · The board lane rewrote the mid-job-WALK arm, further than finding 3 asked.** The registers are
no longer split by walk level; they are split by **the line the board prints**:

| register | scope | asserted |
|---|---|---|
| PER CELL | every line labelled `ledger` — walk levels 0–4, 4 shapes, 50 saves, **4 student clocks** | **4 000 cells, none outside the 5-point band, worst 2.13** |
| DISTRIBUTION | five of five, where **zero** boards print `ledger` and every one demotes itself to `projected` | per clock: `CLOCK` ≤ 16 % over / median ≤ 3.0 / worst ≤ 6.0 (measured 13.0 / 2.32 / 5.88); `TABLE_PACE` and `SLOW_STEM` inside the band on every cell (worst 2.11 / 2.69); `DELIBERATOR` **100 % over, median 14.22, worst 21.78** |

Re-measured here: `node --test tests/job-board.test.mjs` → **106 tests, 106 pass, 0 fail**, table
above copied from its own printed rows. All three published sites were rewritten to this shape, and
the deliberator's 21.78 is published rather than dropped — a projection with nothing but walked
prefixes to rate is worth that, and the line says `projected` for exactly that reason.

The board lane also renamed the arm itself, better than this lane's one-line rename did, and left a
comment in it saying its three five-of-five bounds are kept as **literal expressions** specifically
so this lane's `job-meta-constants.test.mjs` §G lint keeps deriving the document's numerals from
them. Two lanes now hold the same contract from both ends. My earlier rename is superseded; the
substring `board.js` and two lane notes cite still survives in the new name.

**A second agent is also editing `COMPOSED-GAME.md`,** as in verify round 1 — G1 statement 2 and G9
criterion 1 were both rewritten by someone else mid-round, correctly, and better than the text they
replaced. Two numerals in that text were wrong (`2 000 cells` where the sweep is 50 × 4 × 5 × 4 =
**4 000**, at both sites) and are corrected. Nothing of theirs was reverted.

## Suite at hand-off

`node --test tests/job-board.test.mjs` → 106 / 106, 0 fail. `node --test tests/job-meta-constants.test.mjs`
→ 71 tests, **70 pass, 1 fail**, and the failure is **not this lane's**: `after one played job the
printed high-water is max(rating over the play)`, an arm of the meta lane's own "verify round 2"
block, which still expects `bestRating` to track `detail.value`. It is stale against change 2 above
and belongs to whoever owns that block. **Every arm of this lane's two blocks passes** —
`doc · COMPOSED-GAME.md may not re-assert a claim it withdrew (G12 #71–#77)` and
`doc · COMPOSED-GAME.md may not publish a rule the code has moved past (G12 #78–#81)`.

The tree is being written live by several lanes (mtimes on `call.js`, `state.js`, `board.js`,
`job.css`, `job-board.test.mjs` and `COMPOSED-GAME.md` itself all moved during this session, several
of them more than once). A full-suite number taken at any instant is a number about that instant.

### ADDENDUM 2 — `earned` moved again, twice in one round

The call lane did not stop at closing F1. With `q̂` on the entry the ceiling is EXACT, so the `min`
against the rating became a liability rather than a safety net, and `ratingDetail` now reads

```
const earned = ceiling;                       // was min(value, ceiling); was value before that
const rank   = rankFor(earned, { floor: opts.rank });
```

with the code's own note saying the `min` "demoted the honest player 19 windows in 20 and left the
liar's ceiling standing". So inside one round the ratchet's argument went
`value` → `min(value, ceiling)` → `ceiling`, and the document had to follow it twice. A second agent
editing `COMPOSED-GAME.md` had already moved G2's formula block, G2's monotonicity sentence and
G3.1's paragraph onto the third form by the time this lane looked; what was left stale was G12 #78's
`True:` clause, which now records all three forms in order so the history survives the correction.

**The lint was rewritten to stop caring which form it is.** It reads `const earned = …;` out of
`site/js/job/call.js` and asserts the document publishes THAT expression — so the arm cannot be made
stale by a fourth move, only by a disagreement between the two files, which is the only thing it was
ever supposed to detect. The same treatment is now on three of the four groups: the walk bounds come
out of `job-board.test.mjs`'s own assertions, the reachability bounds out of `job-align.test.mjs`'s,
the sheet cap and the sticky scoping out of `job.css`, and the `bestRating` field out of its writers.
Nothing in the block compares a numeral typed in a test to a numeral typed in the document.

**`tests/job-meta-constants.test.mjs` at hand-off: 71 tests, 71 pass, 0 fail** — this lane's two
blocks and the meta lane's, all green together.

### Suite at hand-off (final)

`node --test tests/` at 06:48 → **2994 tests, 2982 pass, 8 fail, 4 skipped.** The suite is NOT green
at that instant and **none of the eight is this lane's**:

```
tests/job-econ.test.mjs:1113  :1139     tests/job-exploit.test.mjs:215  :1786
tests/job-monotone.test.mjs:303  :418   tests/job-screen.test.mjs:1204
tests/job-debrief.test.mjs:724
```

— an econ/exploit cluster around `evMaxCallAt` / `honestCall` / the carry ladder that a lane was
landing while this run was in flight, plus one Playwright arm. **Zero of the eight failure messages
mentions `COMPOSED-GAME`** (the round-1 proof technique, re-run here), and every file this lane
wrote is green on its own at hand-off:

```
tests/job-meta-constants.test.mjs   71 tests, 71 pass, 0 fail   (both doc blocks, and the meta lane's)
tests/job-board.test.mjs           106 tests, 106 pass, 0 fail
tests/job-align.test.mjs                        0 fail
tests/job-debrief.test.mjs          31 tests, 31 pass, 0 fail   (fails only inside a concurrent full run)
```

Two of the failures in the PREVIOUS full run (`job-index` "the calls[] entry is BYTE-IDENTICAL" and
`job-debrief` "the split, the decision count and both accumulators print") passed in isolation
minutes later, which is what a file caught mid-edit looks like. Re-run `node --test tests/` once the
other lanes are quiet; nothing in this lane's four artifacts depends on their outcome.

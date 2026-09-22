# repair-week — the WEEK lane (J11's four files)

**Owned:** `site/js/plan.js`, `site/js/screens/home.js`, `site/js/screens/mock.js`,
`site/js/screens/boss.js`, plus the test files that cover them (`tests/job-week.test.mjs`,
`tests/mock.test.mjs`).

**Suite at finish:** `node --test tests/` → see §Suite. Baseline measured at the start of this
ticket, before any edit of mine: **tests 2725 · pass 2720 · fail 1 · skipped 4** — NOT the
"2721 pass / 0 fail" every proposal quotes. The single failure was
`tests/job-screen.test.mjs:871` (S0's Playwright mount timeout), which this lane may not touch.

---

## 1. REPAIR-DECISION items

`designs/REPAIR-DECISION.md` names no section "Lane: week". Two of its decisions land inside files
this lane owns, and they are implemented here because no other lane may edit them:

### S3.1(b) — the third writer of `player.rank` (`screens/mock.js`) · **PASS**

`site/js/screens/mock.js:569` (`applyMockCall`) now reads

```js
const detail = ratingDetail(rating.calls, JOB_CAPS.calls, { rank: save.player.rank });
```

exactly as §S3.1(b)'s table specifies. `call.ratingDetail` had already been given the floor by the
call lane and `state.applyTarget` / `state.endJob` by the state lane; mock.js was the last of the
three writers still recomputing the rank bare, which is why `screens/settings.js:522` and
`screens/stats.js:249` — both of which already passed `{rank}` — were dead on arrival: a Mock had
overwritten `p.rank` before they read it. No save-schema change (`p.rank` is already a coerced 1..5
field).

**Measured**, on a window of 50 non-informative slots (a mastered player) plus one bad Mock call
(`pred 10 → score 90`):

| quantity | before | after |
|---|---|---|
| `player.rating.value` | 4.376 | 4.376 (the rating still falls — it is a measurement, not a ladder) |
| `rating.n` | 1 (**measured**) | 1 |
| `rankFor(value)` bare | 1 | 1 |
| `player.rank` written | **1** | **5** |
| `ratingDetail(..., {rank: 5}).held` | — | `true` |

This is the case §S3.3 says the suite did not have and the case the critics' own named fix
(`held = !measured`) does **not** reach: the window is MEASURED and the floor still binds.

### S3.4 item 4 (the mock half) — the acceptance test · **PASS**

`tests/mock.test.mjs` gains two tests:

1. *"S3: a Mock never demotes the rank — the held rank is ratingDetail's FLOOR, and it binds on a
   MEASURED window"*. Asserts the table above, plus that the floor is a floor and not a freeze (a
   perfect forecast still lifts rank 1, and a non-binding floor is transparent).
2. *"S3: every call.ratingDetail in screens/mock.js passes the rank floor"* — the grep pin §S3.4
   item 4 asks for, mock.js's half (state.js's half belongs to the state lane).

**NEGATIVE CONTROL** (the third argument deleted from mock.js:569, suite re-run):

```
✖ S3: a Mock never demotes the rank …
  AssertionError: a Mock DEMOTED the student: 5 → 1      actual: 1, expected: 5
✖ S3: every call.ratingDetail in screens/mock.js passes the rank floor …
  AssertionError: a ratingDetail call in mock.js omits the rank floor: ratingDetail(rating.calls, JOB_CAPS.calls)
→ tests 41 · pass 39 · fail 2
```

restored → `tests 41 · pass 41 · fail 0`.

S0, S1, S2, S4, S5 and S5b touch no file this lane owns. S3.1(d)/(e) (the board's rating copy, the
`RANKS` bandTop gap) live in `screens/job.js`, `screens/settings.js`, `screens/stats.js` and
`data/job.js` — other lanes.

---

## 2. r3 findings

`designs/r3-findings.json` contains **no entry whose `lane` is `"week"`**
(`lane` values present: screen 13 · tests 11 · board 9 · crew 8 · meta 8 · call 7 · econ 5 · save 5
· guard 4 · run 3 · state 2). Taken instead: every entry whose `file` is one of this lane's files,
plus the home.js half of one entry whose fix names it.

### #8 · split-honesty · MAJOR · `site/js/screens/home.js` — pass 1 prints the brochure's split and minutes under the board's own `projected` sentence · **FIXED, root cause**

**The finding is right, and understated.** Re-measured before any edit, over 16 boards
(8 seeded saves × {no ledger, 5-job ledger}), pass 1 against the `postBoard` that overwrites the
same node:

```
worst |Δsplit| 13 points   ·   worst |Δminutes| 6 min (1.46× the wall clock)   ·   SHAPE mismatch 2 of 16
seed7 jobs0  HOME "~43 % game · projected" ~13min ends 19:12 | BOARD "~30 % game · projected" ~19min ends 19:18
seed6 jobs0  shape JOB/VAULT                                  (board.shapeFor posts a VAULT off a ready boss)
```

and the brochure row against real composed boards, per shape:

| shape | pass 1 (published row) | real boards |
|---|---|---|
| RUN | ~7 min · 51.1 % | 10–12 min · 29–33 % |
| JOB | ~13 min · 43.2 % | 15–19 min · 30–34 % |
| JOB12 | ~19 min · 33.9 % | 17–22 min · 28–34 % |
| VAULT | ~18 min · 28.3 % | 11–15 min · 29–34 % |

**Fixed at the root, the first of the finding's two options.** `boardModel` now returns
`minutes`, `wallS`, `endsAt`, `ends`, `split`, `projection` and `projectionSource` as **always
`null`**, and that is the documented contract, not an omission: every one of them is a property of
tonight's DRAFT. Concretely:

- the duplicate raw estimator (the shape-blind `Σ tGame / Σ(tGame + tAnswer)` that `board.js`'s
  round-2 correction had already removed and documents as the round-1 bug) is **deleted**;
- the `PUBLISHED.shapeTable` shim at `home.js:25-28` is **deleted** — the brochure is no longer
  reachable from this module at all, so it cannot come back by a later edit;
- `.b-min`, `.b-ends`, `.b-split` and `.b-shape` are `numeral()` placeholders reserving their
  longest final width (8 / 10 / 29 / 6 ch), the same treatment every other pass-2 numeral gets, and
  `fillBoard` writes all four through `setNumeral` so the dots become ink;
- `.b-shape` is the one cell pass 1 may sometimes ink: when `weekGate` itself settled the shape
  (review / school) that name is derivable and `fillBoard` is handed the same shape, so the two
  passes agree by construction. On an ordinary evening it is a placeholder, because `shapeFor` reads
  a ready boss and the composed queue length and pass 1 can see neither;
- `SHAPES[id].targets` is still read, for the row-count reserve only (`sizingShape`, never printed);
- pass 1 keeps everything the SAVE settles: the week line, the dues, the days cold, the row frame,
  whether a cold-crew box is possible.

**After** (`node qa/job-walk.mjs gate --engines chromium`, the harness's own rows):

```
pass 1 meta line            ····· · ······· · ········· · ····························
pass 2 meta line            JOB · ~23 min · ends 19:52 · ~26 % game · projected
shift INSIDE the board 1→2  ZERO
ALL PASS
```

`tests/job-coldopen.test.mjs` (the Playwright two-pass gate, including *"ZERO layout shift between
the board's two passes"* and *"the known-open register is EMPTY"*): **29 pass, 0 fail**.

### #10 · split-honesty · MINOR · `tests/job-week.test.mjs` — the only test of Home's projection is arithmetic on its own constants · **FIXED (converged with the tests lane)**

The finding is right: `:955-959` built `tGame: 300000, tAnswer: 200000` and asserted
`split === 60`, which 300/(300+200) makes true by construction, and nothing anywhere compared
`home.boardModel(save).split` with `postBoard(save).split`.

The **tests** lane owns this file and rewrote all three arms while this ticket was in flight; their
new arms pin the contract above from both sides, drive the ledger arm through `playJob` +
`state.endJob` (a real clock, with `sessionSplit`'s debrief headline as the second clock), and their
*"THE AGREEMENT: one projection, and the numeral Home shows is the BOARD's"* arm is green against
this lane's root fix. **I did not touch those three arms** — the root fix is the code change above,
and the two lanes converged on it independently (their arm 1 quotes this lane's new docblock). What
I did edit in that file is only what my own changes broke or hollowed out, §4 below.

**Negative control for the pair:** the tests-lane arms are green now and FAIL against the pre-fix
code by construction — the old `boardModel` returned numbers where they assert `null`, and I
watched exactly that happen: before my edit the same file's arms
*"pass 1 paints a real board …"*, *"the projection reads the student's OWN last five jobs …"* and
*"THE AGREEMENT …"* failed 3 of 104. After the fix: **104 pass, 0 fail**.

### #37 · spec-fidelity · MINOR · `tests/job-copy.test.mjs` — the copy lint does not read the four screens · the **home.js half FIXED**

The lint's own scope (`LAYER_SOURCES`) is the tests lane's to widen. The half of the fix that lands
in this lane's file — *"either route home.js's REVIEW BOARD / school-window / cold-crew strings
through COPY, or delete the unused COPY entries"* — is done, and the finding's count is confirmed:
`COPY.boardTitle`, `COPY.reviewBoard`, `COPY.schoolWindow`, `COPY.coldCrew` and `COPY.supply` had
**zero call sites under `site/js`** while `home.js` re-typed their text as literals and DOM nodes.
All five now have exactly one caller and `home.js` contains **zero** of the literals:

- `lineFor` → `COPY.reviewBoard()` / `COPY.schoolWindow()`;
- the panel heading → `COPY.boardTitle({ review })`;
- the cold-crew strip and the per-wing supply row → built from the table's own sentence through a
  new exported helper `copyParts(fn, fields)`, which substitutes sentinels for the numeric fields
  and splits, so the words stay in `data/job.js` and the numerals stay reservable placeholders.
  Measured: `copyParts(COPY.coldCrew, ['idle','dues','minutes'])` →
  `["", " crew idle on their own reviews · ", " dues · clear them first — ", " minutes"]` (4 parts),
  `copyParts(COPY.supply, ['wing','locks'])` → `["", " ", " locks available today"]` (3 parts).
  The DOM is node-for-node what it was, so the walk still reads `shift INSIDE the board 1→2 ZERO`.

---

## 3. Findings NOT in this lane that cite its files, and need nothing from it

- **#54** (save, `store.js`): cites `plan.js:342/492/628` only as readers of `settings.game`. The
  fix is `fresh()`/`fillDefaults` + `tests/state.test.mjs`. No change here.
- **#66** (board, `page.js`): cites `plan.js:536` for `LIMITS`. The fix is `composeBundles` /
  the order-law loop. No change here.
- `site/js/plan.js` and `site/js/screens/boss.js` carry **no finding** and are **unmodified** by
  this ticket.

---

## 4. Tests I changed, and why each change makes a test able to fail

Two arms of `tests/job-week.test.mjs` policed this lane's copy with a **regex over home.js's source
text**, which is the defect class the ticket names: both were green for a screen that prints the
words once and green for a screen that prints them twice — and home.js printed them twice.

| arm | was | now |
|---|---|---|
| `:171` *"Home's static gate agrees, and its panel heading is the REVIEW BOARD"* | `assert.match(read('home.js'), /'REVIEW BOARD' : "Tonight's Board"/)` | asserts the VALUES: `COPY.boardTitle({review})` both ways, `home.lineFor({kind:'review'}) === COPY.reviewBoard()`, same for `school`, and that home.js re-types **none** of the three strings |
| `:1182` *"the cold-crew strip prints the dues in pass 1 and the idle count in pass 2"* | `assert.match(read('home.js'), /crew idle on their own reviews · /)` + `typeof COPY.coldCrew(...) === 'string'` | asserts the strip's fragments **reassemble** `COPY.coldCrew({idle:4,dues:9,minutes:4})` exactly, that the template still has its three numerals, and the same for `COPY.supply` |

**NEGATIVE CONTROL**, both at once — the two literals put back in home.js beside the COPY calls
(the exact shape of the defect, two sources of truth):

```
✖ Home's static gate agrees, and its panel heading is the REVIEW BOARD
  AssertionError: home.js re-types a string the table owns: REVIEW BOARD ·
✖ the cold-crew strip prints the dues in pass 1 and the idle count in pass 2
  AssertionError: home.js re-types the cold-crew sentence the table owns
```

reverted → `tests/job-week.test.mjs`: **104 pass, 0 fail**.

No assertion was deleted, skipped or weakened anywhere. `tests/job-week.test.mjs` went 104 → 104
tests with strictly more assertions in those two arms; `tests/mock.test.mjs` 39 → 41.

One arm of the same file, *"nothing in J11's four files gates a card, a boss, the Mock, a hint, a
solution or a Variant on rank"* (`:889`), forbade **any** read of `player.rank` in these four files,
so the S3 ratchet broke it (`site/js/screens/mock.js READS the game rank: player.rank })`). Another
lane had already re-cut it to admit exactly `ratingDetail(… { rank: save.player.rank })` at exactly
one site and to `assert.fail` on any comparison/ternary on the rank, which is stronger than the old
form. **I left their version alone**; it is green with this lane's mock.js.

---

## 5. Suite

```
cd /Users/oliver/Projects/unit1a-quest && node --test tests/
```

- start of ticket (nothing of mine yet): **tests 2725 · pass 2720 · fail 1 · skipped 4**
  (`job-screen.test.mjs:871`, S0's).
- this lane's own files: `job-week.test.mjs` 104/104 · `mock.test.mjs` 41/41 ·
  `job-coldopen.test.mjs` 29/29 (Playwright) · `home-r1` + `home-r2` + `fix-home-r3` +
  `fix5-home` + `fix5-integrate` + `job-copy` + `integration-w4` + `integration-w5` +
  `job-index` = 246/246.
- end of ticket, whole suite: **tests 2806 · suites 367 · pass 2801 · fail 1 · cancelled 0 ·
  skipped 4 · 207 s**. The one failure is **S0's and only S0's**:

  ```
  test at tests/job-screen.test.mjs:871:1
  ✖ J6 measured: a full job at 375x667 with the keyboard open, board <= 36px on every target
    [mount] .job-screen never became visible — hash "#/run/job"
    [mount] plan.jobEntryGate: {"allow":true,…,"why":"D ≥ 3 — the board is the primary action"}
    [mount] page errors: (none)
    chromium/light: harness — page.waitForSelector: Timeout 20000ms exceeded (locator('.job-screen'))
  ```

  It is byte-for-byte the failure I measured before touching anything (§Suite, first line), the
  `[mount] …` lines are the S0 lane's own new diagnostic, and `REPAIR-DECISION` §S0 forbids every
  S1–S5 ticket from touching that test or `qa/job-screen.mjs`. It is not reachable from this lane:
  `screens/home.js` is imported only by `screens/index.js` (the router), and the one harness that
  mounts the job screen THROUGH Home — `qa/job-walk.mjs`, the cold-open gate — reaches the first
  answer in 15.6 s and reports `ALL PASS`. The count rose 2725 → 2806 across all lanes; nothing
  anywhere was deleted or skipped to get there.

---

## Requests

1. **`qa/job-walk.mjs` (tests lane) — the new `pass 1 truth` check needs to ignore pending nodes.**
   The check added today compares the meta line's raw text across the passes:
   ```js
   if (pass1.meta && meta2 && pass1.meta !== meta2) warn('pass 1 truth', …)
   ```
   Now that pass 1 prints no per-draft number, it fires on dots → ink, which is the repair working:
   ```
   ! pass 1 truth — the meta line the student reads in pass 1 is rewritten in pass 2:
     "····· · ······· · ········· · ····························" → "JOB · ~23 min · ends 19:52 · ~26 % game · projected"
   ```
   A node carrying `data-pending` is not a claim. Suggested replacement for the `meta` probe, which
   keeps the check's real intent (*an inked pass-1 cell may never be rewritten*) and would have
   caught the original 13-point defect:
   ```js
   meta: [...b.querySelectorAll('.board-meta > *')]
           .filter((e) => !e.dataset.pending)
           .map((e) => e.textContent.trim()).join(' · '),
   ```
   then compare that against the same selector's inked text after pass 2. It only prints a warning
   today, so nothing is red either way.

2. **`tests/job-copy.test.mjs` (tests lane) — `screens/home.js` is ready for `LAYER_SOURCES`.**
   Its board prose now routes through `COPY` entirely (finding #37's second half is done in this
   lane), and the file is clean under the narrow sweep by hand: no exclamation mark, no emoji, no
   first-person pronoun in code or comment. Adding it should not need another pass from this lane.

3. **`site/data/job.js` (econ / meta lane) — nothing to delete after all.** Finding #37 offered
   "delete the unused COPY entries" as the alternative. `COPY.boardTitle`, `COPY.reviewBoard`,
   `COPY.schoolWindow`, `COPY.coldCrew` and `COPY.supply` each have a caller now, so they should
   stay. `COPY.crewDemoted` is a separate matter and belongs to S4 (the crew lane deletes it).

4. **`screens/job.js` / `data/job.js` (screen + call lanes) — S3.1(d) is still open.** Home's board
   line no longer prints a rating at all, so the "`rating 5.00 · 0/50 informative calls` beside
   `Called 5`" copy fix is entirely on the job screen's board line and its `COPY` string. Nothing in
   this lane blocks it.

## Spec corrections

G1 statement 1 (*"the board prints your own number, not the brochure's"*) needs no correction — it
was the true line the code was breaking, and it is now true of both passes for the first time.

Two lines **are** false with the code right, and both are the same claim: G7's and G12 #20's
enumeration of what pass 1 carries. Note that the first half of each was already false before this
repair — contract labels, lock counts, cold days, wing labels and per-wing supply have always been
pass-2 placeholders in the shipped screen, which is exactly what `qa/job-walk.mjs` measures and
prints as its `pass 1 content` warning (`they are placeholders here (label, locks, cold, wing,
supply)`); they need `data/cards.js`, the import G12 #21 rules out. This repair moves the meta line
to pass 2 as well. `COMPOSED-GAME.md` is another lane's file and I did not edit it.

**OLD (`COMPOSED-GAME.md:766`, G7 "Home paints the board in two passes"):**

> - **Pass 1 (static, from `store` + `schedule` + `save.game.log`):** contract labels, lock counts, cold days, wing labels, `~N min`, the end time, the projected split, per-wing supply. All derivable from `save.cards` and `dueList`, which Home already imports.

**NEW:**

> - **Pass 1 (static, from `store` + `schedule.dueList` + `data/job.js`):** the week line, the row frame at its full reserved height, the dues count, the days cold, whether a cold-crew box is possible at all, and the shape's NAME only when the week itself settled it (REVIEW BOARD, school window). Nothing per-contract and nothing per-draft: a contract's label, its wing, its lock count, its cold days, its posted value, the per-wing supply, `~N min`, the end time and the projected split are ALL `--muted` placeholders of their final width, because every one of them needs `data/cards.js` — the import G12 #21 forbids — or tonight's own draft. Measured: pass 1's shape-table estimate missed the board that replaces it by up to **6 minutes (1.46×)** and **13 points of split**, and on 2 of 16 boards it did not name the same shape, so the published row is no longer reachable from `screens/home.js` at all.

**OLD (`COMPOSED-GAME.md:1030`, G12 #20):**

> Pass 1 static from `store` + `schedule` + `save.game.log` (labels, lock counts, cold days, minutes, end time, split, supply); pass 2 tweens the `posted` numerals in after the dynamic import.

**NEW:**

> Pass 1 static from `store` + `schedule.dueList` + `data/job.js` (the week line, the row frame and its reserve, the dues, the days cold, the cold-crew box, and the shape's name only when the week settled it); pass 2 writes EVERY numeral after the dynamic import — the labels, lock counts, cold days, posted values, the per-wing supply and the whole meta line (`~N min`, the end time, the projected split) — because `job/board.js` is the only thing that knows tonight's draft.

---

# REPAIR — week lane, verify round 1: the Mock's call (`screens/mock.js`)

Two independent critics (call-propriety, exploit-hunt) filed the same BLOCKER: the Mock's prediction
enters the rating window at a hardcoded `w = 1.0`, so predicting a score you hand yourself pays
`w·c = 10.00` a slot — the largest contribution in the system — and ten deliberately-failed papers
bought Called 5 with zero jobs played and zero cards studied. Both are fixed at the root. One file
changed: `site/js/screens/mock.js`, plus its two test files.

## 1. The findings, reproduced before the repair

The exploit-hunt command, run verbatim against the shipped `applyMockCall` on a `fresh()` save:

```
mock 1  score 0%  pred 0  ->  rating 5.40  Called 2
mock 4  score 0%  pred 0  ->  rating 6.60  Called 3
mock 7  score 0%  pred 0  ->  rating 7.80  Called 4
mock 10 score 0%  pred 0  ->  rating 9.00  Called 5      <- ten evenings, zero mathematics
mock 12 score 0%  pred 0  ->  rating 9.80  Called 5
jobs played: 0   cards studied: 0   final rank: Called 5   best rating 9.8
```

Both critics were right on every particular. The J13 r1 docblock's own claim ("the prediction scores
only when the outcome was NOT the student's to hand themselves") was false as written: its three
conditions are about EFFORT, `itemAttempted` counts a WRONG answer as an attempt, and a paper of
nonsense typed for 6 min 40 s satisfies all three. Measured per-slot comparison, from the shipped
`call.wTimesEcDiscrete`: best honest slot **2.2680** on the reachable 10-sitting grid, **2.4998**
continuous — against the Mock's **10.000**, a ratio of **4.409**.

## 2. What shipped

The propriety argument cannot be repaired on the OUTCOME axis — a Mock's score is the student's own
work, the whole range from 0 to their true ability is theirs to choose, any floor drawn across it is
beaten by aiming just above it, and a gate ON the realised score truncates the outcome space, which
makes a quadratic score improper. So it is repaired on the WEIGHT axis, which is read before the
outcome and never from it. Three parts, all in `screens/mock.js`:

1. **`mockPriorMean(save, run)` — an exogenous measurement.** ŝ = the mean score fraction of the last
   `MOCK_CALL_WINDOW` (= `call.QHAT_WINDOW` = 10) PRIOR sittings: `r !== run`, submitted no later
   than this one, retries excluded, done Mocks and Baselines only. It cannot see the paper it is
   weighing, so `c` stays strictly proper in `pred` — the report that maximises it is still the true
   one, and `job-week.test.mjs`'s propriety sweep is untouched.
2. **`mockCallWeight(ŝ) = min(4ŝ(1−ŝ), MOCK_CALL_W)`, gated by `INFORMATIVE_MIN`** — the same law
   every other call obeys. No prior sitting weighs 0 (`call.weightFor(null) === 0`, on call.js's own
   reading that "a make with no attempt history cannot carry a calibration measurement"); a trailing
   mean outside `INFORMATIVE_BAND` (≤ 6.7 % or ≥ 93.3 %) weighs 0. **That is what closes the channel:
   hand yourself a blank paper and ŝ = 0 for as long as you keep doing it.** An unweighed call still
   takes its slot (round-2 `windowPush`: a slot is a call) and pays exactly 0.
3. **`MOCK_CALL_W = INFORMATIVE_MIN` (0.25), `MOCK_CALL_SLOT_MAX = 2.50`** — parity with the job
   ladder. 2.50 is `INFORMATIVE_MIN × c_max`, i.e. the FLOOR of what any counting slot can pay, so
   the critics' suggested cap of 2.2680 exactly is not expressible: reaching it needs the credit
   clipped, a clipped credit has a flat top, and a flat top gives up STRICT propriety. That trade was
   refused; the 0.23 of slack is documented in the code and pinned in the test.

`mockCall(run, { now, sHat })` now returns `{ p, o, err, sHat, w, weighed, credit, contribution,
entry }`. `credit` is the raw calibration credit whatever the weight (it is read off `1 − err`, not
off `entry.p`, because a blank entry nulls `p` and `credit(null, true)` is −30); `contribution` is
`w × credit`, what the window actually adds up. `run.call` keeps its same five keys and the same
byte budget.

## 3. Measured after the repair

```
mock 1..10  score 0%  pred 0  ->  rating 5.00  Called 2   w 0  paid 0   (every one of them)
jobs played: 0   cards studied: 0   final rank: Called 2   best rating 5
```

* 60 consecutive deliberately-failed papers, every effort gate satisfied honestly: window full,
  **0 measurements, rating 5.000, rank unmoved**. It used to be Called 5 on evening ten.
* Per-slot: **2.500** against the honest 2.2680 (reachable) / 2.4998 (theoretical) — ratio **1.102**,
  where it was 4.409.
* The bound on the channel, driven end to end through `applyMockCall` with a PERFECT daily forecast
  on in-band papers: at 2.50 a slot the arithmetic floor is 15 / 27 / 39 weighed slots for Called
  3 / 4 / 5 (16 / 28 / 40 sittings — the first paper of all is unweighed). Measured in the shipped
  app it is slower still, because `call.ratingDetail` now prices the rank off `earned`, the honest
  expectation the window carries (the call lane's round-4 verify work): **Called 3 on sitting 22,
  Called 4 on 38, and Called 5 NOT REACHED inside the 50-slot window.** The test asserts the floor
  (which is mine and cannot move) and logs the measured ladder, so it survives either pricing.
* Side effect, in the right direction: an unweighed Mock writes `p: null`, so it no longer feeds
  `trophies.rollingBrier` or the Settings reliability diagram, both of which select on a finite `p`.

## 4. What was deliberately NOT done

* **No gate on the realised score.** See §2 — it would break the property it defends.
* **The S3 rank ratchet is untouched.** Gating the Mock out of the floor path was one of the critics'
  three options; it would reverse REPAIR-DECISION §S3.1(b) (another ticket's decision, and one whose
  reasoning — rank gates tools, and this layer never removes a tool you own — is not affected by the
  weight defect). With the channel bounded, the ratchet has nothing exploitable left to bank.
* **No test was deleted, skipped or weakened.** Five pins that asserted `w === 1.0` were RESTATED
  against the new law (that is what the tests lane's own `THE BOUND THE GATE IS NOT` docblock asked
  the fixer to do: "the numbers below are pinned so that whoever makes it has to come back here and
  restate them"), and eight new pins were added: the weight law itself, ŝ's exogeneity, the
  unweighed first paper, the ten-deliberately-failed-papers reproduction and the channel bound
  (`job-week.test.mjs`), plus three that drive the WHOLE shipped path — `startRun` → fill →
  `submitRun` with the real graders — for a thrown paper, a genuine 50 and a perfect 100
  (`mock.test.mjs`). The last of those is the top of the band: a student who scores 100 every time is
  not forecasting either, and the same law retires their prediction exactly as it retires a mastered
  make's call.

## 5. Residual, disclosed

The channel is **bounded, not banned**, and it cannot be banned without making the Mock's prediction
worthless to honest students. A student who can score inside the informative band on demand (≈ 2 of
20 items right) and predict it exactly can still walk the Mock channel alone — 22 daily sittings of
6 min 40 s for Called 3, 38 for Called 4, Called 5 unreachable inside the window. That is the bound
the suite now pins; it is not a claim that attendance is impossible.

## 6. Requests (files this lane does not own)

**(a) `site/data/job.js:223` — `RATING.mockWeight` is now stale and one surface PRINTS it.**

```
OLD:   mockWeight: 1.0,
NEW:   mockWeight: 0.25,        // = RATING.informativeMin; screens/mock.js MOCK_CALL_W, verify r1
```

**(b) `site/js/screens/settings.js:734` — the printed claim is false until (a) lands.** It renders
"…call at w = 1.0: it has no make, so it has no q̂, and the weight is defined rather than guessed."
The weight is no longer defined and no longer 1.0. Suggested replacement:

> …call at `w = 0.25`: it has no make of its own, so its weight is read off your last ten papers —
> `4ŝ(1−ŝ)` on the mean score of those, capped at the smallest weight the window counts. A run of
> papers you always score the same on carries no forecast, and pays nothing.

**(c) `COMPOSED-GAME.md` — six places say the Mock enters the window at `w = 1.0`:** lines **400**
(the anti-farming weight paragraph), **587** (G3.7 proof 4), **832** (G7's file table), **980** (the
J11 row), **1009** (the J11 acceptance row) and **1171** (G12 #40d, "(d) The Mock's prediction enters
the window at **`w = 1.0`** — it has no make and therefore no `q̂` — stated in G7 and Settings") and
**1228** (G12 #75's restatement). All should read: *enters the window at `w = min(4ŝ(1−ŝ), 0.25)`,
where ŝ is the mean score of the trailing ten sittings — it has no make of its own, so its weight is
measured from its own history rather than defined, and it is capped at the smallest weight the window
counts so one paper can never outweigh a job call.*

**(d) `COMPOSED-GAME.md:688`, G4 "Tense when strong".** The sentence *"Attendance cannot produce it;
a chosen outcome can, and buys nothing, because the rank it would buy is already held"* was false in
its second clause — a chosen outcome bought three ranks from a fresh save. It is now true, but for a
different reason, and the reason is the load-bearing part:

> Attendance cannot produce it; a chosen outcome cannot either, because an outcome you can hand
> yourself leaves your trailing scores outside the informative band, and a call outside that band
> weighs nothing. `tests/job-week.test.mjs` pins the bound: the Mock channel alone needs at least 39
> weighed slots for Called 5, and does not reach it inside the 50-slot window as shipped.

## 7. Test status

`node --test tests/` — **2919 tests, 2915 pass, 0 fail, 4 skipped** (the tree is being edited by
other lanes while this ran; `tests/job-week.test.mjs` 108/108 and `tests/mock.test.mjs` 44/44 on
their own).

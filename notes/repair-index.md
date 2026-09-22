# repair-index — the `index` lane (round-3 repair)

**Owned files:** `site/js/job/index.js` + `tests/job-index.test.mjs`.
Nothing else was written. No `git` command was run.

---

## 0. The lane's assignment is EMPTY, and that is a measurement, not an assumption

`designs/REPAIR-DECISION.md` assigns no fault to this lane, and `designs/r3-findings.json` carries no
finding in it. Both verified by command:

```
$ grep -n -i "index" designs/REPAIR-DECISION.md ; echo "EXIT $?"
EXIT 1                                   # the string does not occur in the file at all, any case

$ grep -n -i "lane: " designs/REPAIR-DECISION.md
119:**Lane: screen** (with `tests`).
251:**Lane: doc** (+ `tests` for the two lints). **No code.**
379:**Lane: doc** (+ `tests` for the four pins). **No code.**
567:**Lane: call** (with `state`, `screen` for mock.js/copy, `save` for the `bestRating` record,
781:**Lane: crew** (with `econ`, `doc`, `screen` for the two grids and the copy, `tests`).
936:**Lane: screen** (with `tests`, `doc`).
957:**Lane: guard / doc.**

$ python3 -c "import json,collections; d=json.load(open('designs/r3-findings.json')); \
  print(collections.Counter(x['lane'] for x in d))"
Counter({'screen': 13, 'tests': 11, 'board': 9, 'crew': 8, 'meta': 8, 'call': 7,
         'econ': 5, 'save': 5, 'guard': 4, 'run': 3, 'state': 2})     # total 75, lane 'index' = 0

$ python3 -c "import json; d=json.load(open('designs/r3-findings.json')); \
  print([x['file'] for x in d if 'job/index.js' in x['file']])"
[]                                       # no finding's file is site/js/job/index.js
```

Three findings *mention* the string `index`; none is about this file:

| # | lane | why it is not this lane's |
|---|---|---|
| 5 | tests | `tests/job-screen.test.mjs`'s crew-grid regex — `screens/job.js` `crewBlock` |
| 37 | tests | `tests/job-copy.test.mjs` `LAYER_SOURCES` lists `site/js/job/index.js`; the fix adds the four **screens** to that list |
| 53 | save | the trophy ids `index-25` / `index-68` are save bytes in `site/data/trophies.js` |

So the lane had no assigned defect, and the work below is (a) a proof that the one safety net
`index.js` claims for itself really fires, and (b) two defects I found and fixed inside my own two
files while proving it. Every one is labelled `H*` (found here, no critic id) so the doc agent can
tell them apart from the 75 audited findings.

---

## 1. Negative control NC1 — `index.js`'s self-claimed safety net FIRES (no code change needed)

`site/js/job/index.js:229-238` makes a strong claim about a *different* lane's file:

> The invariant it rests on — `last.rung` belongs to the target being resolved, i.e. it is stamped
> BEFORE the Fault Index block — is asserted through the shipped machine in
> `tests/job-index.test.mjs` §2c, so a caller that ever reorders those two statements fails a test
> instead of silently re-opening the hole.

That is exactly the "a test passes while the thing it polices is broken" shape, so I tested the claim
instead of trusting it. A `node:module` **load hook** reorders the two statements in
`site/js/job/state.js` *in memory* — `g.last = {...}` is moved to after the Fault Index block — and
no project file is touched (`shasum` before/after identical,
`59f1c27cfc6f3afcca9a63ef0c0bb585353172222ce4d3ca2164d19568d62072`).

```
$ node --import <scratchpad>/nc/register.mjs --test tests/job-index.test.mjs
ℹ tests 88 · pass 83 · fail 5

✖ a hinted clear clears the card and resolves NOTHING — the seal counts CLEAN resolutions
✖ an attempt-2 clear clears the card and resolves NOTHING — the seal counts CLEAN resolutions
✖ an attempt-3 clear clears the card and resolves NOTHING — the seal counts CLEAN resolutions
✖ three attempt-3 days never seal, and the first clean day is the first one that counts
✖ the rung `applyTarget` stamps belongs to the target the Fault Index is resolving FOR
```

**PASS — the claim is true, measured at 5 tests.** §2b/§2c drive `startJob → lockCall → applyTarget
→ push` and never call `index.resolve()` directly, so the reorder is caught behaviourally, not by a
regex over source. No change made. (The hook is a throwaway under the session scratchpad; it is not
part of the tree and is not needed to reproduce a green suite.)

---

## 2. H1 — BLOCKER-class (collection integrity): two alternating dates sealed a tag

**Measured, pre-fix:**

```
$ node -e "... trigger('dropped-gcf'); resolve on '2026-09-15','2026-09-16','2026-09-15' ..."
{"resolved":3,"days":3,"sealed":true}
```

`resolve()` advanced `days` whenever the day merely *differed from the previous one*
(`site/js/job/index.js:277 pre-fix: if (day && day !== from.lastDay)`). The record stores a COUNT plus
one date (G7, `store.js:137`), so "day-changed" was standing in for "distinct day" — and **A, B, A
reaches `days = 3` on two distinct days.** Against the published rule that is false three times over:

* `COMPOSED-GAME.md:315` — "resolved cleanly 3 times across **3 distinct days**"
* `COMPOSED-GAME.md:641` — "sealed at 3 clean resolutions across 3 days"
* `COMPOSED-GAME.md:922` (G8's J7 acceptance row) — "sealed requires 3 clean resolutions on 3
  distinct days"

Price: one backwards clock move seals a tag with no play and no re-trigger in between; repeat it and
the whole collection — 68 cells, `index-25`, `index-68`, and the completion certificate *"the
sixty-eight mistakes I no longer make"* — falls out of two dates. The certificate is the one thing in
the layer that claims something about the student rather than about the save.

**Fix, at the root, in the implementation** (`site/js/job/index.js`, `resolve()`):

```js
  if (day && day !== from.lastDay) {
    if (from.lastDay && day < from.lastDay) { r.resolved = 1; r.days = 1; r.lastDay = day; }
    else { r.days = from.days + 1; r.lastDay = day; }
  }
```

A day earlier than `lastDay` is not a new distinct day, so it **restarts the window at itself**,
exactly the way a re-trigger does (`trigger()`:197-204). Three forms were considered and two rejected
by measurement, which is recorded here so round 4 does not "simplify" it back:

| form | A,B,A | A,B,A,B | clock ran AHEAD then corrected |
|---|---|---|---|
| ship (restart at the backwards day) | days 2 — no seal | days ≤ 2 — no seal | **self-heals**: the first real day re-anchors |
| refuse the backwards day, keep `lastDay` | no seal | **days 3 — SEALS** ✗ | **stalls forever** behind an unreachable date ✗ |
| re-anchor `lastDay`, keep `days` | no seal | **days 3 — SEALS** ✗ | self-heals |

No schema change, no new constant, no new key on the record: `days` and `lastDay` keep their G7
shapes and `store.js freshTag()` is untouched.

**Acceptance test + NEGATIVE CONTROL.** `tests/job-index.test.mjs` §2, new test *"alternating two
dates can never seal — `days` counts three DISTINCT days, not three changes"*. It asserts the six
sealed flags of A,B,A,B,A,B, the window restart (`resolved 1 · days 1 · lastDay A`), that the
resolution itself still counted and still dropped the tell to 1.00, and that the corrected-clock case
still seals. Run against the pre-fix module (served at the shipped URL by a second load hook, from a
snapshot taken before the edit):

```
$ node --import <scratchpad>/nc/register-pre.mjs --test tests/job-index.test.mjs
ℹ tests 90 · pass 88 · fail 2
✖ alternating two dates can never seal …
  AssertionError: alternating two dates sealed a tag — that is two distinct days, not three
  + actual - expected
      false, false,
  +   true,          <- it sealed on resolution #3, on two dates
```

**PASS.** Fails pre-fix, passes post-fix. Measured numbers: `days` 3 → **2**; `sealed` true → **false**.

---

## 3. H2 — MINOR: the default export was a curated subset of the namespace

`export default {...}` omitted six of the module's named exports, including `tellHookFor` — the
function this file's own docblock (`:508-517`) calls *"THE `tellFor` HOOK `board.postBoard` takes —
the single definition of it … Every surface that posts a board must pass the SAME hook or it prints a
posted value another surface will re-price."*

```
$ node -e "... import * as index ... ; named.filter(k => !Object.keys(index.default).includes(k))"
['BACKCHECK','FAULT_INDEX','MISCONCEPTIONS','areaOfTag','tellHookFor','wingOfTag']
```

Latent today — `screens/job.js` imports `{ tellHookFor }`, `screens/run.js` imports `* as jobIndex`,
`screens/stats.js` imports named, and nothing in the tree uses the default form — so **no posted
value was ever wrong**. But a default-form caller reads `undefined` off the hook and posts at the
no-tell price, which is precisely the drift the docblock exists to prevent. Fixed by making the
default export the whole namespace, and pinned so it cannot drift again: new §1 test *"the default
export IS the namespace"* deep-equals the two key sets. It is the second failure in the NC run above
(88 pass / 2 fail against the pre-fix module). **PASS.**

---

## 4. One test in this lane was over-claiming; it was strengthened, never weakened

`tests/job-index.test.mjs` §4 was titled *"a resolved or sealed tag leaves the tell pool the same
tick"*. Neither half was true of the shipped module: a resolved tag is deliberately **kept**, ranked
behind every live one (that re-offer is the only road to resolutions #2 and #3 — `index.js:23-34`,
§2b), and the **sealed** half was not asserted in that test at all. The title is now what the code
does, and the two missing assertions were **added** (the candidate list is `[['middle-term',true],
['dropped-gcf',false]]` after the resolution, and `['middle-term']` after the seal, with a
non-vacuity check that the error log still carries the tag). No assertion was deleted, relaxed or
skipped. **PASS.**

---

## 5. One assertion in this lane was adapted to another lane's landed fix (not weakened)

Mid-run, the **save** lane landed finding 54 (`settings.game` was an undeclared, uncoerced
pass-through key): `site/js/store.js:300` now declares `game: true` and `:369` coerces
`out.settings.game = bool(out.settings.game, true)`. That turned this lane's assertion
`assert.equal(fresh(AT).settings.game, undefined, 'no store change is needed: absent is on')` red —
its *premise* ("no store change is needed") is what finding 54 deleted, not its property.

Replaced with three assertions on the property that has to survive — the **direction** of the
coercion, because every reader is `settings.game !== false`:

```js
assert.equal(fresh(AT).settings.game, true);
assert.equal(migrate({ v: SAVE_VERSION }, AT).settings.game, true);               // absent → ON
assert.equal(migrate({ v: SAVE_VERSION, settings: { game: false } }, AT).settings.game, false);
```

One assertion became three, and the fail-open direction is now pinned behaviourally through
`migrate()` rather than inferred from an undefined. `assert.match(SETTINGS, /s\.settings\.game !== false/)`
above it is untouched.

---

## 6. Findings I did NOT change the code for

None — the lane had no findings to refute. Two observations are recorded for whoever owns the file,
deliberately **not** acted on, because neither has a finding behind it and both cross a boundary:

* `canMint()` returns `REFUSALS.DUES_OPEN` for *"a vault that already spent a Backcheck"*
  (`index.js:589`) — a misleading refusal code, verified: `canMint({}, {day, vault:true,
  spentOnVault:true}).reason === 'dues-open'`. Adding a code changes a published constant with no
  finding behind it while twelve fixers are in the tree; the suite pins only `ok === false` there
  (`tests/job-index.test.mjs` *"a clean vault mints one; a vault that spent one does not"*).
* one error line listing the same tag twice counts it twice in `tellDetail` (measured:
  `triggered === 2` for `tags: ['dropped-gcf','dropped-gcf']`). Nothing in `site/js` writes a
  duplicate — `screens/card.js logError` writes the grader's array verbatim — so it is unreachable
  today.

---

## Requests

For the owners of files this lane may not touch. Both are stale *comments* whose code is right; no
behaviour change is asked for.

1. **`site/js/job/state.js` (state lane) — a false comment justifying a real behaviour.**
   `state.js:1090-1091` (the Fault Index block in `applyTarget`) reads:

   > `tellFor` only ever offers an unsealed, uncleared tag, so a returned record is live by
   > construction.

   The second clause is false against the shipped `index.js`: `tellDetail` deliberately offers a
   **cleared**-but-unsealed tag, ranked behind every live one, because `applyTarget` is the only
   caller of `resolve()` and a seal needs three resolutions (`index.js:23-34`). Measured:
   `index.tellFor(save,'FAC2',…).live === false` for a resolved tag. The *code* is right — resolving
   an already-cleared tag is exactly how resolutions #2 and #3 land, which
   `tests/job-index.test.mjs` §2b proves through the shipped machine. Suggested replacement:

   > `tellFor` never offers a SEALED tag; it may offer a cleared-but-unsealed one, ranked behind
   > every live tag, which is how resolutions #2 and #3 reach the seal (`job/index.js` header). It
   > is priced at 1.00 by `econ.tellFor`, so resolving it again moves no payout.

2. **`site/js/screens/job.js` (screen lane) — the envelope prints a non-live tell as `tell:`.**
   `screens/job.js:172` passes `tell: env.tell?.tag ?? null` into `COPY.envelope`, which prints
   `· tell: <tag>` whenever the tag is non-null. `index.tellFor` hands the screen a record carrying
   `live: true|false`, and for a cleared-but-unsealed tag it is `false`. `COMPOSED-GAME.md:41` says
   the envelope prints *"if you have one **live** on this make — its **tell**"*. The payout is
   correct either way (`econ.tellFor` prices a cleared record at 1.00, verified: `settle` output is
   byte-identical to no tell), so this is a **label**, not a number. Either use the `live` flag the
   record already carries, or say in G1 that the envelope also names the tag the next clean clear
   would carry a day closer to its seal. This lane did not touch either file.

## Spec corrections

None from this lane. H1 fixes the code to match `COMPOSED-GAME.md:315 / :641 / :922`, so those three
published lines are now true as written and need no edit. No line of `COMPOSED-GAME.md` was touched.

## 7. Test result — every finding id in this lane, with its number

| id | severity | what | PASS/FAIL | the number measured |
|---|---|---|---|---|
| — | — | every `lane: "index"` entry in `r3-findings.json` | **n/a — the set is EMPTY** | 0 of 75 findings; 0 of the 7 `Lane:` lines in `REPAIR-DECISION.md` |
| NC1 | — | `index.js:229-238`'s claim that a reorder in `state.js` fails a test | **PASS, no code change** | 5 tests go red under an in-memory reorder; `state.js` sha256 unchanged |
| H1 | BLOCKER-class | `resolve()` sealed a tag on **two** alternating dates | **PASS (fixed)** | `days` 3 → **2**, `sealed` true → **false**; the new test fails pre-fix (90 tests · 88 pass · 2 fail) |
| H2 | MINOR | default export omitted 6 named exports incl. `tellHookFor` | **PASS (fixed)** | 6 → **0** missing keys; namespace and default now 38 keys each |
| — | — | the over-claiming §4 test title, + the missing SEALED half | **PASS (strengthened)** | 1 assertion → 5; nothing deleted |
| — | — | `fresh().settings.game` assertion, adapted to save-lane finding 54 | **PASS (strengthened)** | 1 assertion → 3, now behavioural through `migrate()` |

`site/js/job/index.js` still imports in plain node (38 named exports + the default), is DOM-free, clock-free and seedless,
has no `Math.random`, no `site/js/rng.js` need, no third-party import and no build step, and writes
only `save.game` — all re-asserted by the file's own §9 tests, which are green.

**This lane's own file:** `node --test tests/job-index.test.mjs` → **tests 90 · pass 90 · fail 0 ·
skipped 0** (was 88 · 88 · 0 · 0 before this ticket; +2 tests, 0 removed).

**Related lint files that scan `site/js/job/index.js`:** `node --test tests/job-copy.test.mjs
tests/no-random.test.mjs tests/job-meta-constants.test.mjs tests/coverage.test.mjs` → **204 · 204 ·
0**.

**Whole suite.** The prompt's stated baseline (2725 / 2721 / 0 / 4) is stale and was already disputed
by `REPAIR-DECISION.md` §S0, and twelve other lanes were landing code while this ran, so the numbers
below are snapshots of a moving tree, taken with `node --test tests/` from the repo root:

| run | tests | pass | fail | skipped | failing files | mine? |
|---|---|---|---|---|---|---|
| 22:42 | 2750 | 2744 | 2 | 4 | `job-state.test.mjs`, `job-week.test.mjs` | **no** — both green again minutes later, and both green with my `index.js` swapped out for its pre-fix snapshot |
| 22:47 | 2774 | 2769 | 1 | 4 | `job-week.test.mjs:171` (a source regex over `screens/home.js`'s REVIEW BOARD heading — screen lane) | **no** — green again at 22:48, and green with my `index.js` swapped out |
| 22:59 | **2725** | **2721** | **0** | **4** | none — **EXIT 0** | every `tests/*.test.mjs` except the four Playwright files |

The last row is the one this lane can honestly certify green, and it is the whole suite minus
`job-screen` / `layout-audit` / `final-layout` / `layout-root`:

```
$ FILES=$(ls tests/*.test.mjs | grep -vE "job-screen|layout-audit|final-layout|layout-root")
$ node --test ${=FILES} ; echo "EXIT $?"
ℹ tests 2725 · suites 358 · pass 2721 · fail 0 · skipped 4 · EXIT 0
```

A third `node --test tests/` started at 22:48 was still inside the Playwright arm 12 minutes later
with **ten** concurrent `qa/job-screen.mjs` harnesses on the box (`pgrep -f qa/job-screen.mjs | wc
-l` → 10, then 8, then 5), i.e. the other lanes' own suite runs; it is contention, not a failure, and
the 22:47 run already covered those four files with no failure in any of them. The four
browser-driven files import nothing from `site/js/job/index.js` (`grep -l "job/index.js" tests/` →
`job-copy`, `job-debrief`, `job-exploit`, `job-index`, `job-week`, all of which are in the green row
above), so this lane's two edits cannot reach them.

Attribution was not assumed: each failure above was re-run with a `node:module` load hook serving the
**pre-fix** `site/js/job/index.js` at its shipped URL, and each failed or passed identically, so none
of them is this lane's. No test was deleted, skipped, weakened, or had an assertion removed anywhere
in this ticket; the two test files this lane touched gained 2 tests and 8 assertions net.

# cut-run — the RUN lane of THE CUT

**Authority** `designs/CUT-BRIEF.md` (hard limits) and `designs/CUT-SPEC.md` (the shape).
`COMPOSED.md` and `BUILD-POLICY.md` rule and are untouched; **BUILD-POLICY wins**.

**Owned by this lane:** `site/js/screens/run.js`, `site/js/app.js`, `site/index.html`, and the tests
that cover them (`tests/cut-run.test.mjs`, new; `tests/run.test.mjs`, unchanged and still green).

**Every suite that reaches this lane's three files is GREEN** — `cut-run`, `run`, `job-ledger`,
`integration-w4`, `page`, `plan`, `state`, `sw`, `no-random`, `layout-audit`, `final-layout`:
**455 / 455**. The whole tree is not mine alone; §6 says exactly what was red in it when I finished,
and why none of it is this lane's.

This lane deleted more than it wrote. Nothing was added that CUT-SPEC §6 does not list; two things
that printed were removed, one number that nothing printed was removed, and the shell was taken the
rest of the way to CUT-BRIEF's first hard limit.

---

## 1. What I built

### 1.1 `app.js` — the three-number limit reaches the app shell

`notes/DEMOLISH.md` §6.5 left exactly one decision open and named this file as the place it would be
made: *"`hdr-readiness` and `hdr-tminus` still print a number each during play. Whether the
three-number limit reaches the app shell is the screen lane's call."*

**It does. All six header read-outs step aside for a session, and nothing takes their place.**

```js
export const HDR_JOB_HIDE = Object.freeze(['hdr-readiness', 'hdr-tminus', 'hdr-level', 'hdr-streak', 'hdr-xp', 'hdr-combo']);
export const HDR_JOB_KEEP = Object.freeze([]);
```

It had to be yes. `hdr-readiness` prints `57` and `hdr-tminus` prints `T−3`; keeping "just those
two" would have put **five** numbers on a phone screen that CUT-BRIEF allows three. `hdr-tminus`
goes with them rather than being special-cased on the day it happens to read `TEST DAY` — one rule,
and no state in which the shell prints a number during a session.

Measured in a real browser at 375 × 812 (`python3 -m http.server -d site`, `#/run/job`):

| | during a session |
|---|---|
| header read-outs on screen | **0 of 6** (`hidden: true`, every one) |
| what is left in the header | the theme toggle — an icon, not a number |
| numbers on the face-down card screen | **2** — `0 pile`, `×1 streak` (the third slot reads `new`) |
| numbers after the call is in | **3** — `0 pile`, `×1 streak`, `pays 8` |

The blackout survives the flip: `screens/card.js` pushes `setHeader({readiness})` when it grades,
and `renderJobHeader()` runs last in `renderHeader()`, so a study write cannot bring a number back
mid-session. Verified live, after tapping a call (§5).

### 1.2 `run.js` — the game's mount prints nothing

`#/run/job` used to paint `Opening The Job…` in a dashed stub box for as long as `screens/job.js`
took to load, and fell back to `renderStub()` — a paragraph of Night-Before copy — if it failed.
Neither string is on CUT-SPEC §6's list, and **"The Job" is exactly the kind of word CUT-BRIEF
forbids**.

* new export `openingLine(kind)` → `null` for a `game: true` kind, `Opening …` for every other
  delegate. `delegateRun` appends no placeholder at all when it is `null`.
* `DELEGATES.job.fallback` is `'today'`, not `'stub'`: if the module cannot load there is nothing to
  say, so the route hands the student back to Today in silence.
* `KIND_META.job.title` is `''`. The entry stays (that is `screens/home.js`'s gate:
  `kindMeta('job') != null`); the NAME is gone, because the game layer has no name on the list.

### 1.3 `run.js` — the two hooks, cut to what has a consumer

The debrief was already gone. Two leftovers of it were not:

* **`jobWallMs()` deleted** (7 lines) and the `wallMs` key with it. It memoised a wall-clock number
  onto the before-snapshot that **no surface reads and no test asserted** — a number the app never
  prints, kept alive next to a brief whose whole point is that every printed number is the number
  the engine computed. `tests/cut-run.test.mjs` §8 now asserts the key cannot come back.
* **the `size` block deleted** (10 lines) in `mountCardRun.finish()` — a `const size = null` and a
  comment about the board's `drafted` / `composed` split, a job that WALKS at the getaway, and
  `pageSizeExtra`. Every mechanic it named is deleted; the value was already `null` on every path.
  `extra` is now `{}` literally.

Also retied to the surviving documents: `KIND_META.job`'s and `DELEGATES.job`'s comments (they cited
COMPOSED-GAME G7 / G10 / "J6"), the hooks' header block, and `app.js sameRouteClick`'s doc comment,
which explained itself with `Another board`, the debrief's primary button, `.job-contracts`, and two
deleted test files. **Behaviour unchanged** — `sameRouteClick` is still the reason `Another page` and
`againLabel(kind)` work at all.

### 1.4 `run.js` — one implementation of the compose opts, not two

`plan.js` gained `pageOpts(save, opts)` — `composeOpts` without `q` — during this wave, and its doc
block names the three routes that start Today's Page (`screens/home.js`, `screens/run.js`, and the
game's `#/run/job`), with: *"Two of them had their own copy of the `const { q, ...rest } =
composeOpts(save)` line; a third that forgot it composes a DIFFERENT page, and then the game is not
Today's Page at all."* `screens/run.js` held one of those copies, so this lane retired it:

```js
- const save = update((s) => { const { q, ...planOpts } = composeOpts(s); startPage(s, { ...planOpts, now: startedAt }); });
+ const save = update((s) => { startPage(s, { ...pageOpts(s), now: startedAt }); });
```

**Behaviour-identical today** — `pageOpts(s)` *is* `composeOpts(s)` with `q` deleted, the same two
keys in the same order — and verified live: `#/run/page` on a fresh save still composes and renders
(14 items, no console error from the app). See R4 for the one shared assertion that must move with
it.

### 1.5 `site/index.html`

**Unchanged.** It already renders exactly the six `hdr-*` read-outs `HDR_JOB_HIDE` names, and
`tests/cut-run.test.mjs` §1 reads that list *out of the file* rather than out of a list in a test —
so adding a seventh read-out to the shell fails the build until the game hides it too.

---

## 2. The exported API

`site/js/screens/run.js` — what the game layer may call (everything else on this screen is the study
layer's and is untouched):

| export | signature | what it is |
|---|---|---|
| `captureJobBefore` | `(save, queue?) → snapshot` | the before-snapshot, written where a Page's own lives (`inProgress.meta.before`). **Idempotent** — an existing snapshot is patched with the sitting's `startedAt` / `seed` / `seedTag` and returned, never retaken. Eight keys: `skills`, `readiness`, `xp`, `coverage`, `tiles`, `startedAt`, `seed`, `seedTag`. |
| `commitJobRun` | `(save, {queue?, results?, before?, startedAt?, now?}) → record \| null` | **the terminal.** Files the `runs[]` row the flat page files, then `checkDailyGoal` and `logForecast`, in that order. `null` when nothing was answered or the sitting is already recorded. |
| `openingLine` | `(kind) → string \| null` | the line the route prints while a delegate loads. `null` for the game. |
| `kindMeta` / `delegateOf` / `RUN_KINDS` / `isRunKind` | unchanged | `kindMeta('job')` is non-null with `title: ''` and `game: true`. |
| `makeRunRecord` / `pushRun` / `summarizeRun` / `pageResults` / `pageBefore` / `composedCountOf` | unchanged | the run-record arithmetic, shared by both routes. |

`site/js/app.js`:

| export | what changed |
|---|---|
| `HDR_JOB_HIDE` | now all **six** `hdr-*` ids (was four) |
| `HDR_JOB_KEEP` | now `[]` (was `['hdr-readiness', 'hdr-tminus']`) |
| `setJobHeader(true \| null)` · `getJobHeader()` · `headerItems()` | unchanged signatures; `headerItems()` is `[]` during a session and 6 outside one |
| `ROUTE_PATTERNS` | **still 13**, untouched (`tests/run.test.mjs` and `tests/cut-run.test.mjs` both hold it) |

---

## 3. The math assertions, and the numbers they produced

`tests/cut-run.test.mjs` — **27 tests, 8 sections, all green.** The sections that are arithmetic:

**§3 — every number in the record is the number the engine computed.** The fixture is ten graded
items whose XP comes from `js/xp.js`'s own `xpFor()`, and the expectation is summed by an
independent loop in the test, never by the function under test.

> bits `1 0 1 1 0 1 1 1 0 1` → **xp 330 · acc 0.7 · flawless 7 · items 10**, and `startedAt` is the
> sitting's stamp, not the terminal's.

**§4 — CUT-BRIEF math #6, "improving never costs", over the FULL state space.** All `2^10 = 1024`
outcome vectors of a ten-item page are built, and every single-item improvement (a miss → a clean
clear) is compared against its own vector:

> **1 024 records · 5 120 improvements · 0 that cost the student anything.**
> smallest XP gain **20**, largest **75**; smallest accuracy gain **1/10**; `flawless` moves by
> exactly `+1` every time; `items[i].credit` goes `0 → 1` every time.
> XP over the lattice runs **0 → 405**.

The same walk carries CUT-BRIEF math #4's analogue for this surface: a right answer never contributes
less than a wrong one, minimum gap **20 XP** (tier 1: base 10 × 1.5 clean + 5 speed).

**§5 — CUT-BRIEF math #7, no clock.** The same answers committed nine days apart file the same row,
field for field, apart from `startedAt` / `submittedAt` / `n`; `makeRunRecord` is a pure function of
its inputs.

**§6 — one sitting, one row.** Two commits in one render → **1 row**, second returns `null`. A
reload (the in-memory snapshot gone, only `runs[]` left to know) → still **1 row**. A genuinely
different sitting → **2 rows**, so the guard is not a blanket refusal. Zero answers → no row.

**§7 — the Law of Two Ledgers, this lane's half.** The row `commitJobRun` files is `deepStrictEqual`
to the row the flat `#/run/page` terminal files for the same answers. Its keys are walked at every
depth against a list of 21 game nouns (`pile`, `streak`, `call`, `bank`, `best`, `points`, `pay`,
`cost`, `split`, `today`, `player`, `game`, `sure`, `mult`, `posted`, `loot`, `chain`, `bag`,
`board`, `crew`, `guard`) — **0 hits**; the key set is pinned to the thirteen the flat page writes.
Ledger B (`save.player`, `save.game`) is byte-identical across the terminal: the game writes it, the
screen does not.

**§8 — `captureJobBefore` reads Ledger A and writes none of it.** Every `LEDGER_A_KEYS` entry is
`deepStrictEqual` across the capture; the snapshot's key set is pinned to eight; `wallMs` is asserted
absent; the second capture is the first capture's object.

---

## 4. Negative controls — every assertion was made to fail first

Each control patched the shipped file, ran `node --test tests/cut-run.test.mjs`, and was reverted in
the same shell command (a byte-for-byte `diff` against the pre-patch copy confirmed the revert; the
suite is green at rest).

| # | the break | file | what went red |
|---|---|---|---|
| 1 | `HDR_JOB_HIDE` back to the demolition's four (readiness + T−N survive into play) | `app.js` | **§1** — 3 assertions |
| 2 | `openingLine` returns `Opening The Job…` for the game kind | `run.js` | **§2** |
| 3 | `makeRunRecord` files `Math.round(sum.xp * 0.9)` instead of the XP the engine computed | `run.js` | **§3** (and §4's exact-gap assertion) |
| 4 | `summarizeRun` pays a miss 5 and a clear 0 | `run.js` | **§4** — improving costs |
| 5 | the `jobRunRecorded` double-record guard short-circuited to `false` | `run.js` | **§6** |
| 6 | `commitJobRun` files `extra: { pile: 24, streak: 3 }` | `run.js` | **§7** — a game field in Ledger A |
| 7 | `wallMs: 0` put back on the before-snapshot | `run.js` | **§8** |

No control was "the test file disagrees with itself": each one is a plausible regression a later
edit could make, and each was caught by the section that owns it.

**One assertion is controlled inline instead.** §2's "no new route" check would need a 14th pattern
in `app.js` to be made to fail, and three other lanes were running `node --test tests/` at that
moment — patching a file the whole tree imports would have failed *their* runs, not just mine. So the
filter carries its own control in the test (`jobbish([...ROUTE_PATTERNS, '/job/:id'])` must return
that one), and `ROUTE_PATTERNS.length === 13` has a long-standing twin in `tests/run.test.mjs`.

---

## 5. Verified by hand (a real browser, 375 × 812)

`python3 -m http.server 8099 -d site --bind 127.0.0.1`, fresh save, `#/run/job`:

* the header: all six read-outs `hidden`, nothing in the bar but the theme toggle;
* `document.querySelector('.run-stub')` → **`null`** — no "Opening…" flash, no dashed box;
* the view is `0 pile · ×1 streak · new / you got this right`, the skill name (`Notation`), three
  calls with two greyed, and `bank`. **Nothing else.**
* tapping `not sure` flips to the study card; the strip becomes `0 pile · ×1 streak · pays 8` and
  **every header read-out is still hidden**.

---

## 6. Tests

```
cd /Users/oliver/Projects/unit1a-quest && node --test tests/
```

* baseline before this lane: **1 391 tests · 93 suites · 0 fail · 4 skipped** (the four
  Playwright-gated browser arms, unchanged). Six other lanes were adding tests at the same time, so
  the total climbed through the sitting — 1 391 → 1 512 → 1 588 — and the runs below are of the
  whole tree, other lanes' work included.
* `tests/cut-run.test.mjs` adds **27** (8 sections).
* `tests/run.test.mjs` (63 tests) is untouched and green, `ROUTE_PATTERNS.length === 13` included.
* `tests/job-ledger.test.mjs`, `tests/integration-w4.test.mjs`, `tests/page.test.mjs`,
  `tests/plan.test.mjs` — the four suites that reach into this lane's files — all green after every
  change above (212 / 212 together, and 23 / 23 for integration-w4 after the home lane's rewrite).
* **No test was deleted, skipped or weakened by this lane.** Nothing I own covered a mechanic the
  brief cuts — the 32 files that did went in `notes/DEMOLISH.md` §1, before this lane started.

**The state of the tree when I finished** (last full run, 1 624 tests · 4 skipped):

> **1 619 pass · 1 fail.** The one failure is in `tests/job-state.test.mjs` — the STATE lane's own
> new file, still being edited while this ran: `site/js/job/state.js` changed again two minutes into
> my checks, a run of that file alone was red on four of its proofs, and the failing assertion had
> moved between my two full runs (*"the streak climbs 1 → 5"* → *"the record survives a reload"*).
> It is mid-edit, not stable-and-broken. **Nothing in it touches `run.js`, `app.js` or
> `index.html`**, and every suite that does reach this lane's files is green (455 / 455). Two
> earlier full runs during the sitting were red only on
> `tests/cut-home.test.mjs` / `home-r2` / `integration-w4` — all the home lane's in-flight
> `pageOpts` consolidation, all since fixed by them (and by §1.4 here).

---

## 7. Requests

**R1 — `screens/job.js` (screen lane): call the two hooks. This is a Ledger A gap, not a polish
item.** `screens/job.js finish()` currently calls `state.endJob(s, …)` and nothing else. `endJob`
ends the session with `finishPage(s)`, and the flat page makes **three** writes at that same moment
that `finishPage` does not: `pushRun(makeRunRecord(…))`, `checkDailyGoal`, `logForecast`. Without
the hooks, **the same answers that earn Flawless Page on `#/run/page` earn nothing in the game**, and
`#/stats` never sees the session. `run.js` and `tests/job-ledger.test.mjs` are both already written
against the wiring; only the screen is missing it. Two lines plus an import, in `screens/job.js`:

```js
import { captureJobBefore, commitJobRun } from './run.js';   // renameCard already comes from here

// in mount(), right after the session starts (where `syncHeader()` is called):
const jobBefore = captureJobBefore(getState(), state.queueOf(getState()));

// in finish(), AFTER the update() that runs state.endJob:
commitJobRun(getState(), { queue: jobQueue, before: jobBefore, now: Date.now() });
```

`jobQueue` must be the queue as it stood **before** `endJob` (i.e. re-read `state.queueOf` after each
answer and hold the last one) — `finishPage` clears `inProgress`, and the row is built from the
results `markItem` wrote onto those items. `tests/job-ledger.test.mjs runInJob()` is the exact
shape, lines 336-374. I did not make the edit myself: it is three lines in two functions, not the
one-line addition BUILD-POLICY §2 lets a lane make in a file it does not own.

**R2 — CSS lane (`css/job.css`): nothing is required.** `renderJobHeader` sets `data-job="true"` on
`.hdr` and hides the six read-outs with `el.hidden`, which needs no rule. If the empty header bar
wants a slimmer height during a session, `.hdr[data-job]` is the hook and it is free.

**R3 — nobody:** `site/index.html` needs no change for this lane, and I made none.

**R4 — CLOSED, no action.** `tests/integration-w4.test.mjs`'s *"the call sites drop `q` on purpose
and say so"* used to grep `run.js` for the retired line. The home lane rewrote that subtest while
this lane was running, and it now asserts
`assert.match(runSrc, /startPage\(s, \{ \.\.\.pageOpts\(s\)/, 'run.js strips q')` — **exactly the
line §1.4 shipped**, so the consolidation was not optional: had `run.js` kept its own copy, that
shared test would be red on my file. `node --test tests/integration-w4.test.mjs` → **23 / 23**.

**R5 — `screens/job.js` / `job/state.js` (screen and state lanes): the GAME does not compose with the
plan's opts at all.** `screens/job.js` calls `state.startJob(s, { now: Date.now() })`, and
`startJob` forwards those opts straight to `startPage`. So `#/run/page` composes with the plan's
tier-4 cap and `microFlashOnly`, and `#/run/job` composes without them — against CUT-BRIEF's
"Same queue as Today's Page, same length, same items", and against the third route `plan.pageOpts`'s
own doc names. The fix is one argument in `screens/job.js`:
`state.startJob(s, { ...pageOpts(s), now: Date.now() })`. I did not make it: it is in two files I do
not own, and which lane holds the opts (the screen that mounts or the verb that composes) is theirs
to settle.

---

## 8. Open issues

1. **The study card's own numerals are still on screen during play, and they are not mine.** Once
   the card flips, `screens/card.js` renders `VOC · 3`, `tier 2`, the item number, `0/1` and
   `Hint 1/3` under the three slots. That is the study card engine mounted as-is — CUT-SPEC §8 keeps
   `js/widgets/*`, `screens/card.js` and their chrome untouched, and COMPOSED rules them — so this
   lane did not touch it. But CUT-BRIEF's limit is measured on a phone screen, and the honest reading
   is that it governs **what the game adds**: the face-down card, which is the screen the old build
   failed on with forty numbers, now shows **two**. If the composer wants the limit read literally,
   the card's meta row is the next thing to cut and it belongs to the screen lane and COMPOSED, not
   here.
2. **The Home link is invisible during a session.** `hdr-readiness` lives inside `a.hdr-home`, so
   hiding the ring collapses the anchor to zero width — deliberate (an invisible link is not a tap
   target), and the way out is the card's own `← Today` and `bank`. If a session should have a
   visible exit in the header, that is a new control and CUT-SPEC §6 lists no string for one.
3. **`openingLine('post')`** returns `Opening After the test…` for the one delegated non-kind, which
   has no `KIND_META` entry. That is T14's copy, unchanged, and outside the game layer.
4. **Not verified by this lane:** the end-of-session surface (`today 186 points` / `best 274` /
   `48 % of this session was the game`) is `screens/job.js`'s and was not reachable in my browser
   check without playing a whole page. The split meter's honesty (`job-split`, CUT-SPEC §8) is the
   screen lane's measurement, not the run screen's.

---

# ROUND 1 — FIXER PASS (run lane)

Two findings, one in this lane's own file and one whose root is outside it. Both are answered below
with a command and its output rather than a claim.

## R1-1 [BLOCKER] Drill 5 collapsed to one card while the button still said five — FIXED AT ROOT

**Root.** `buildRun`'s drill arm had gained an unconditional prerequisite gate:

```js
const tpls = T.templatesForSkill(skill).filter((t) => needsMet(T.getTemplate(t)?.needs, save));
```

Five templates carry `needs` and four of them need `QUAD-SOLVE`, which is late algebra. The ordinary
case — weak in `BISECT-Q`, `QUAD-SOLVE` never touched — lost the whole family, and the fallback
(`originalsFor(...)`) had one card to give. Reproduced on a fresh save with a weak record
(`{m:25,n:4,misses:2}`), every skill:

```
XX  CS-QUAD      n=2 | Drill 5 · Word Problems: Product        | card ang-09, card wp-12
XX  BISECT-Q     n=1 | Drill 5 · Does It Bisect? Two Cases     | card ang-05
XX  SEG-ALG      n=1 | Drill 5 · Midpoint Triangle             | card ang-04
```

`SYS` and `FIG-ALG` kept five items but lost `T-fig-system` / `T-fig-xlines-Q` from the mix.

**The fix**, both halves:

1. The gate is gone — `const tpls = T.templatesForSkill(skill);`. The J5b comment that shipped with
   it ("Nothing is locked: an unmet skill drills its originals") is false for a skill whose originals
   are one card, and the change's stated motive was the game. The game reads study state and prices
   it; it does not gate a study route.
2. The count in the head is now **read off the queue** — `` `Drill ${items.length} · …` `` — so the
   originals fallback can never put a number in print that the engine did not deal. It prints
   `Drill 5` for all nineteen skills today; the change is structural, not cosmetic.

`needsMet` is no longer imported by this file.

**Verified with the critic's own probe** (`/tmp/critic-su/drill-diff.mjs`), fixed build vs the
pre-game build:

```
same as pre-game: CS-QUAD      broken n=2 -> fixed n=5
same as pre-game: BISECT-Q     broken n=1 -> fixed n=5
same as pre-game: SEG-ALG      broken n=1 -> fixed n=5
   …
Drill queue IDENTICAL to the pre-game build on all 19 skills
```

**Verified on the shipped browser path** too — phone viewport, `settings.game = false`, the state the
critic played (BISECT-Q / SEG-ALG / CS-QUAD weak, QUAD-SOLVE untouched), reading the run screen's own
head and progress line:

```
BISECT-Q   | Drill 5 · Does It Bisect? Two Cases | 0 of 5 done
SEG-ALG    | Drill 5 · Midpoint Triangle         | 0 of 5 done
CS-QUAD    | Drill 5 · Word Problems: Product    | 0 of 5 done
PAIRS      | Drill 5 · Pairs in a Figure         | 0 of 5 done
```

where the critic measured `Drill 5 · Does It Bisect? Two Cases … 0 of 1 done`.

**Pinned** by `tests/cut-run.test.mjs` §9, four cases: every skill deals `DRILL_ITEMS`; the number in
the title equals `items.length`; two saves differing only in prerequisites deal the identical queue
(this is the case that was red before the fix — `BISECT-Q` dealt 1); and the file holds no `needsMet`
at all.

## R1-2 [BLOCKER] The measured split is 10 % against a 45–55 % brief — NOT CLOSED HERE

The finding is true and I reproduced it. **Its root is in no file this lane owns**, and one of the two
repairs it suggests is a non-fix that I can disprove, so what this lane contributes is the disproof
and a guard.

### The suggested fix "shorten the queue when `settings.game` is on" is a non-lever

The split is `tGame / (tGame + tAnswer)`, and both halves are per question. Driven through the
**shipped** verbs (`startJob` → `call` → `answer`) at a fixed human pace of 6.5 s on the face-down
card and 61 s on the question, capping the session at k questions:

```
full page   {"n":11,"tGame":71500,"tAnswer":674740,"split":10}
cap  1      {"n":1, "tGame":6500, "tAnswer":61340, "split":10}
cap  2      {"n":2, "tGame":13000,"tAnswer":122680,"split":10}
cap  3      {"n":3, "tGame":19500,"tAnswer":184020,"split":10}
cap  4      {"n":4, "tGame":26000,"tAnswer":245360,"split":10}
cap  6      {"n":6, "tGame":39000,"tAnswer":368040,"split":10}
cap  8      {"n":8, "tGame":52000,"tAnswer":490720,"split":10}
```

Eleven questions and one question both print **10 %**. Queue length does not appear in the
expression. (Held under the old `ms`-only meter and under the session-clock meter the state lane
landed mid-pass; the invariant is the arithmetic, not the implementation.)

It is also forbidden twice over by the brief it would be serving: CUT-BRIEF "Session shape" —
*"Same queue as Today's Page, same length, same items"* — and *"the game … never chooses, adds,
removes or reorders a question."*

### Why 45–55 % cannot be reached inside the hard limits

The app's own par times for the page the shipped composer deals (`45 90 45 20 90 45 90 20 45 150
120` s, 11.6 min at par):

- Answering that page at par and growing the game half to 45 % needs **63 s per question on the
  face-down card**, on three buttons, against a two-tap limit.
- From the other end: the brief's most generous ranges — 14 minutes, 55 % answering, as few as 8
  questions — allow **57.8 s per question** of answering. The page's median par is **90 s**.
- And the session that satisfies the band while answering at par runs **21 min**, past the brief's
  own 14-minute ceiling.

So CUT-BRIEF's three session-shape numbers (8–12 questions · 10–14 min · 45–55 % game) are mutually
inconsistent with the study layer's par times, and the brief's own escape hatch — *"cut answering
time per question"* — is shut by its own next paragraph: *"The composer still owns what is studied."*
The remaining honest move is the finding's second option: **drop 45–55 % as a ship gate and stop
printing the number to the student.** That is a change to `designs/CUT-BRIEF.md` (authority, not
mine) and to two files other lanes hold.

### What this lane did instead

- **Did NOT write `tests/job-split.test.mjs`.** `site/js/job/state.js` was rewritten at 20:00 during
  this pass, and its new comment names that file as the asserter of its own invariant
  (`tGame + tAnswer === lastVerbAt − inProgress.startedAt`). The meter is the state lane's and so is
  its test; two lanes writing one file overwrites one of them. A first draft of mine was deleted.
- **Added `tests/cut-run.test.mjs` §10** — the guard that stops the non-fix from landing in this
  file: `pageOpts` does not branch on `settings.game`; `run.js` starts Today's Page exactly once and
  only through `pageOpts`; and nothing in `run.js` reads the game switch when building a queue.

### Requests to other lanes

1. **`designs/CUT-BRIEF.md` (composer/authority)** — "Session shape": drop the 45–55 % band as a ship
   condition, or drop the 10–14 minute ceiling, or say which of the two gives. They cannot all hold
   against 90 s median par. Keep *"measures its own split and prints the measured number"* — the
   engine does exactly that; it is the target that is unreachable, not the meter that is dishonest.
2. **`screens/job.js` (screen lane)** — one line: drop `COPY.split(...)` from `viewModel`'s `over`
   lines. The last thing a 14-year-old reads after a session should not be a percentage he cannot
   act on and that falls the harder he works a problem. `today` / `best` stay.
3. **`data/job.js` (state/data lane)** — `SPLIT = { lo: 45, hi: 55 }` is read by no runtime code and
   by one test that deep-equals it to itself. It goes with the band, or it stays as a documented
   design target with no surface.
4. **`designs/CUT-SPEC.md` §8** — "job-split (measured 45–55 %)" should name what the test can
   actually hold: the meter's partition invariant and the pace-independence of the printed number.

## Tests added or changed

- `tests/cut-run.test.mjs` §9 (4 cases) — Drill 5 deals five and prints what it dealt.
- `tests/cut-run.test.mjs` §10 (3 cases) — one page for both routes; the queue is never
  game-conditioned.
- **No test deleted, skipped or weakened.** No test covered the drill arm before this pass
  (`grep -rn needsMet tests/` hit only `schedule.test.mjs`'s unit tests of the predicate, which are
  untouched and still green).

**Test status at hand-off.** `cd /Users/oliver/Projects/unit1a-quest && node --test tests/` →
**1756 tests, 1752 pass, 0 fail, 4 skipped** (the 4 skips are pre-existing), exit 0.

For the record, because it shaped two decisions in this note: the suite was red for most of this
pass, and none of it was this lane's. The pay / state / screen lanes were rewriting
`site/js/job/{pay,state}.js`, `screens/job.js` and their tests while this one ran — `state.js` was
rewritten at 20:00 and again at 20:21 — and the failure count fell 26 → 23 → 20 → 15 → 12 → 6 → 0 as
they worked. Every stack trace landed inside `js/job/*`; `screens/run.js` appeared in none of them,
and `tests/job-state.test.mjs` does not import it at all. This lane was green throughout in
isolation (331 tests, 0 fail).

---

# ROUND 2 — the fixer pass (lane `run`)

Two MAJORs, both found by exploit-hunt round 2, both in `site/js/screens/run.js`. They have one root
and it is closed once.

## The root, in one sentence

`#/run/page` and `#/run/job` are not two pages. They are the same `save.inProgress` — the flat runner
in this file, and the game's strip over the identical queue — and while a session was live this route
was not a second VIEW of that page, it was a second DOOR into it.

Everything both findings describe follows from the door being there:

- **Finding 1 (PEEK / SKIP).** `mountRun`'s `kind === 'page'` arm called `resumePage()` on the very
  `inProgress` the game was playing. Read the question there, go back, then call `sure` — the bid was
  no longer a bid. Or answer it there instead: `markItem` advanced the index with no call, no cost and
  the streak intact. Measured on the shipped payoff table that is worth **1.13×–1.54×** (peek, bank
  first) and **1.23×–3.17×** (peek + skip) honest play, and a skimmer who clears half the material
  out-scores a student who clears four in five. No wrong answer is involved, so `job-state.test.mjs`
  §7 #5's cheating DP cannot see it — and a detector is the wrong shape of fix anyway.
- **Finding 2 (the pile dies).** Finishing that page here ran `finishPage`, which clears
  `inProgress` — taking `inProgress.game` and the whole unbanked pile with it, silently, under the
  words "Page complete". The study ledger was written correctly; only the student's 300 points
  vanished.

Both make CUT-BRIEF's two surviving ideas false: you could see the question before you bid, and the
pile could not be lost.

## The fix — one condition, no new mechanic, no new route

`screens/run.js` only, three additions:

```js
export function handoffFor(kind, save) {
  return String(kind) === 'page' && hasLiveJob(save) ? '/run/job' : null;
}
```

- `handoffFor(kind, save)` — a pure predicate. `hasLiveJob` is `plan.js`'s existing
  `!!save.inProgress.game`, so "is a session live" has one implementation and this file does not add a
  second.
- `handOff(to)` — `navigate(to, { replace: true })`, one microtask later.
- `mountRun`'s returned render asks it **first**, before a queue is composed, a delegate is imported
  or a byte is rendered. `mountCardRun`'s page arm calls `startPage` on its first line, so a guard
  that ran any later would already have written.

It is the mirror of the refusal `screens/job.js` already makes in the other direction
(`state.pageInProgress` → the flat page has been answered into, so a session may not start over it).
Finding 2 needs no second guard: the only `finishPage` in this file sits behind that one door, and
§11 asserts both halves so a later edit that adds a close, or dispatches before the guard, fails.

### Three decisions inside it, and why

1. **The game SWITCH is deliberately not read here** (the finding suggested `gameOn(save) &&
   stateOf(save)`; this ships the second term only). `settings.game = false` governs whether a session
   may START and what Home offers; it cannot govern one that is already live, and `screens/settings.js
   leaveSession` closes a live session — settles the bid, banks the pile through the engine's own
   `bank()`, drops the record — inside the same `update()` that flips the flag. "Switched off" plus "a
   live record" is a state the app never writes. A switch term here would only re-open finding 2 in
   the one corner it cannot reach: record exists, flat runner runs, pile dies. It would also break
   this lane's own §10 ("this file reads that flag nowhere"), which stays green untouched.
2. **`replace`, not a push.** The way in is the BACK button. Pushing `#/run/job` would leave the
   `#/run/page` entry in place and the next BACK would land on it and push again — a back-button trap.
   `qa/cut-run-r2.mjs` row 8 holds this: after the hand-off, BACK still leaves the run.
3. **Deferred by one microtask.** `navigate(…, { replace: true })` routes SYNCHRONOUSLY and
   `app.js mount()` assigns `el.__unmount` only *after* the render returns, so routing from inside that
   frame would mount the game screen and then have its cleanup overwritten by ours. The returned
   cleanup cancels the pending hand-off.

Anti-loop, proved rather than assumed (§11): `handoffFor('job', …)` is `null`, and
`state.pageInProgress` is `null` by construction over a record — so the two guards can never trade the
student back and forth.

## Verification

**In the shipped app** — `node qa/cut-run-r2.mjs` (new; Playwright over `site/`, 375×667, seeded save,
pile 300 ×4, the finding's own path: `#/run/page` visited first so it is a real history entry, then
the session starts, then `page.goBack()`).

```
ok   a plain Today's Page still runs when no session is live — #/run/page progress=0 of 13 done
ok   a session is live at pile 300 x4 — {"hasGame":true,"pile":300,"streak":4,"idx":0,...}
ok   BACK over a live session does not serve the queue flat — hash=#/run/job flat=false job=true
ok   …it lands on the screen that owns the session — hash=#/run/job job=true
ok   …and the question is still face-down — "← Today 300 pile ×4 streak new you got this right Notation …"
ok   …the pile and the streak are exactly as they were
ok   …and the page did not move under the student — idx 0 -> 0
ok   BACK again leaves the run (no back-button trap)
ok   typing #/run/page during a session serves nothing flat — hash=#/run/job flat=false
ok   …and nothing was banked, lost or finished — pile 300, today 0, best 0
ALL PASS
```

With the guard deleted the same script prints the defect back, question and all:

```
FAIL BACK over a live session does not serve the queue flat — hash=#/run/page flat=true job=false
FAIL …and the question is still face-down — "← Quit Today's Page 0 of 13 done VOC · 3 tier 2 Notation 3 In the figure, F is b…"
FAIL typing #/run/page during a session serves nothing flat — hash=#/run/page flat=true
```

**Negative controls for the new unit tests** (each mutation applied to `screens/run.js`, suite run,
file restored):

| mutation | fails |
| --- | --- |
| the guard deleted from `mountRun` | §11 "composes nothing, writes nothing, renders nothing" + "closed in exactly one place" |
| `handoffFor` always returns `null` | §11 "fires on exactly one route" + the drive case |
| `handoffFor` also reads `settings.game` | §11 "reads the RECORD, not the game switch" — **SUPERSEDED in round 3: that assertion was the deadlock written as a requirement and is gone; see R3-2** |
| a second `finishPage(s)` added to `finish()` | §11 "closed in exactly one place…" |
| `delegateRun` dispatched before the guard | §11 "…and `mountRun` asks who owns it first" |

## Tests added or changed

- `tests/cut-run.test.mjs` **§11** (5 cases) — the hand-off fires on exactly one route and only over a
  live record; it cannot ping-pong with `screens/job.js`'s mirror guard; it reads the record and not
  the switch; **`mountRun({kind:'page'})` over a live session is driven for real** (the module store is
  seeded, the render is called with a stub element, and the save's `inProgress` is asserted
  byte-identical afterwards and the element empty); and the structural invariant that the one
  `finishPage` sits behind the one door.
- `qa/cut-run-r2.mjs` — new, the browser proof above. Nothing in `qa/` was modified.
- **No test deleted, skipped or weakened.** Nothing the brief cuts was covered by a test in this lane,
  so no test was removed. §10's ban on reading the game switch in this file is untouched and green.

**Test status at hand-off.** `cd /Users/oliver/Projects/unit1a-quest && node --test tests/` →
**1784 tests, 1780 pass, 0 fail, 4 skipped** (the 4 skips are pre-existing), exit 0.
For the record: two earlier full-suite runs during this pass were red in the `job-screen` /
`cut-home` lanes (`screens/job.js` not yet exporting `stakeOf`; Home's game href during the 22:00
close). Both cleared as those lanes landed; neither stack touched `screens/run.js`, and this lane was
green in isolation throughout.

## Requests for other owners

1. **`screens/job.js` + `job/state.js` (screen / state lanes)** — `mountJob`'s `!gameOn(save)` arm
   navigates to `/today` and leaves a live record where it is. That state is unreachable today (the
   switch closes the session in the same `update()` that flips the flag), which is exactly why this
   lane declines to read the switch. If it ever becomes reachable, the honest close is
   `screens/settings.js leaveSession` — settle the bid, `bank()`, drop the record — and the right home
   for it is an exported verb on `job/state.js` that both Settings and `mountJob` call, rather than a
   third implementation. Worth doing regardless: today `leaveSession` is a closure inside
   `settings.js`'s mount and cannot be reused by anyone.
2. **`screens/home.js` (home lane)** — no change needed. "Run a page" (`home.js:424`) may keep
   pointing at `#/run/page`; the route now hands a live session to `#/run/job` itself, which is the
   one place that decision lives.

---


# ROUND 3 — the run lane's two findings

Owned files: `site/js/screens/run.js`, `site/js/app.js`, `site/index.html` and their tests.
**`site/index.html` and `site/js/app.js` were not touched this round** — neither finding reaches them.
One line was ADDED to `site/js/plan.js`, a file this lane does not own; BUILD-POLICY §2's allowance
and the reason it had to be there are under "The fix, and why it is not in run.js" below, and it is
Request 1.

## R3-2 [MAJOR] — the deadlock: Today's Page was unreachable with the game off

**Fixed at the root, one predicate.**

### What the defect actually was

Not "a guard is missing a condition". Two guards, each correct alone, **disagreed about who owns
Today's Page, and the disagreement was a cycle**:

| guard | condition | sends the student to |
| --- | --- | --- |
| `run.js handoffFor` | `hasLiveJob` | `#/run/job` |
| `job.js mountJob` | `!gameOn` | `#/today` |
| `job.js mountJob` | `state.pageInProgress` | `#/run/page` |

Round 2 closed the third row — the ENGINE closes it, `pageInProgress` returns null over a live
record, and `tests/cut-run.test.mjs` asserted exactly that. **The second row had no guard from this
side at all**, and `plan.nextActionFor` (`plan.js:480`) returns Home's study `resume` action
unrewritten with the switch off, so Home's own primary button pointed straight into the loop:

```
#/today -> #/run/page -> #/run/job -> #/today -> #/run/page -> ...
```

Nothing on any of the three screens cleared `inProgress.game`, so the save could not heal itself.
Driven in chromium (below), the flat page never rendered once in four presses of the app's primary
study button.

### The fix, and why it is not in run.js

The question `handoffFor` asks has always been *"does another route own this queue?"* — `hasLiveJob`
was simply **the wrong answer to it**: a record nobody can play is not an owner. So the predicate
changed, and this file's reading of the game switch stayed at zero:

```js
// site/js/plan.js — one line added, beside `hasLiveJob`
export const jobOwnsPage = (save) => hasLiveJob(save) && gameOn(save);

// site/js/screens/run.js:773
return String(kind) === 'page' && jobOwnsPage(save) ? '/run/job' : null;
```

**The obvious fix — `&& gameOn(save)` in `run.js` — is illegal, and this is not a nicety.** It was
written, it passed `cut-run` in isolation, and the full suite caught it:

```
test at tests/job-ledger.test.mjs:851
✖ and only the door itself reads the flag — no study module does
  AssertionError: a module outside the door now reads settings.game
      [ 'js/plan.js', 'js/screens/home.js', 'js/screens/job.js',
    +   'js/screens/run.js',
        'js/screens/settings.js' ]
```

`job-ledger.test.mjs` is the Law of Two Ledgers file and names `js/screens/run.js` in a second
assertion as well. It is right to: a study module that can branch on the switch can deal a different
page. The door may read the flag; what crosses into a study screen is the door's **answer**. `plan.js`
is on that file's own list of doors, it is where `gameOn` and `hasLiveJob` already live, and
`nextActionFor` already computes this exact conjunction at `plan.js:487` — so the predicate had one
obvious home and it was not this lane's file. **No test was edited to make room for anything.**

### Why not in `screens/job.js`

The critic offered both ends and `screens/job.js` is another lane's file this round. The two fixes
compose: with this one in, `mountJob`'s `!gameOn` arm is no longer reachable from `#/run/page` at all.

### The residue, named

With the switch off and a dormant record, finishing the page flat runs `finishPage`, which clears
`inProgress` and the record with it, so an unbanked pile is lost. It is points in a game the student
has switched off, on a save state the shipped UI cannot produce; it is strictly better than a bricked
app; and the clean close is the engine verb asked for in Request 2, not a second copy of
`leaveSession` in this file. **A settle-and-bank here would have meant `run.js` pricing a bid**, which
`tests/cut-integrate.test.mjs:278` exists to forbid ("no screen outside `js/job/` and
`screens/job.js` reaches the payoff module").

### Tests

**§10 "no queue in this file is conditioned on the game switch" — the blanket ban is UNCHANGED and
still green**: `settings.game` and `gameOn` appear nowhere in `run.js`. Three assertions were added
beside it: the guard consults `plan.jobOwnsPage`, it does so exactly once, and that one use is inside
`handoffFor`, which composes no queue.

**§11, two cases changed — both were this lane's own, and both were pinning a claim now known to be
false:**

- *"the guard reads the RECORD, not the game switch"* → **"with the switch off the record is DORMANT,
  not destroyed: flipping it back on resumes that session"**. The old case asserted
  `handoffFor('page', off) === handoffFor('page', on)`, which is the deadlock written as a
  requirement. The new case asserts what the old one was really protecting — that the record is not
  read, written or dropped by the flat route — and adds the reversal.
- *"it cannot ping-pong"* → **"…in EITHER direction"**, which is what the critic asked for. It no
  longer asserts one symptom; it asserts the property, over all four combinations of (record live?,
  switch on?): **the route this file hands to must be one that will accept the hand-off** — whenever
  `handoffFor` names `/run/job`, both of `mountJob`'s refusals are false. It reads no source of
  another lane's file, so it cannot go red on a `screens/job.js` edit.

The paragraph in `run.js` headed *"THE GAME SWITCH IS DELIBERATELY NOT READ HERE"* was replaced. Its
objection — reading the switch would re-open round 2's *"the record exists, the flat runner runs, the
pile dies"* — was wrong on its own terms, and that is why the predicate could be corrected at all:
**all three of round 2's defects need the game SCREEN.** Peeking needs a face-down card to go back to
and bid on; dodging needs a session to carry the intact streak back into; `finishPage` stealing the
pile needs a pile the student could otherwise still bank. With the switch off `mountJob` refuses, so
there is no such screen, nothing to walk into and nothing to take.

**Negative controls (each run, each failed as stated, then reverted):**

| mutation | fails |
| --- | --- |
| `handoffFor` back to `hasLiveJob(save) ? '/run/job' : null` | §10 (the `jobOwnsPage` additions) + §11 "EITHER direction" + §11 "DORMANT" — 3 of 42 |
| `plan.jobOwnsPage` weakened to `hasLiveJob(save)` | §11 "EITHER direction" + §11 "DORMANT" — 2 of 42 — AND `qa/cut-run-r3.mjs` rows 2-6, trail printing `#/run/page -> #/today` ×4 |
| `&& gameOn(save)` put in `run.js` instead | `tests/job-ledger.test.mjs` "only the door itself reads the flag" (quoted above) |
| a second `gameOn(save)` read added to `pushRun` | §10 "no queue in this file is conditioned on the game switch" |

**New:** `qa/cut-run-r3.mjs` — the deadlock driven in the shipped app at 375×667, the save seeded with
a record the ENGINE wrote and `settings.game = false`, clicking Home's own `.home-primary` four
times. `ALL PASS` (11 rows). It prints the nav trail either way, which is what makes the negative
control legible. Nothing else in `qa/` was modified.

```
nav trail:
  #/today
  #/run/page -> #/run/page [page]      (×4)
ok  the save is the deadlock state: switch off, record live — game=false pile=8 idx=1
ok  round 0..3: the primary button does not bounce back to #/today
                 — CTA {"label":"Continue page · 2 of 13","href":"#/run/page","kind":"resume"}
ok  Today's Page is reachable and rendered — hash=#/run/page flat=true job=false
ok  the record survived the visit untouched — pile 8 -> 8, streak 2 -> 2
ok  nothing was banked behind the student's back — today 0 -> 0, best 0 -> 0
ok  with the switch back on the same session resumes — hash=#/run/job job=true flat=false
```

**No test was deleted, skipped or weakened.** No mechanic this round's brief cuts was covered by a
test in this lane, so nothing was removed.

## R3-1 [MAJOR] — 11 % game, 18 questions. NOT FIXED, AND NOT FIXABLE HERE. ESCALATED.

The finding says so itself, and this lane agrees: *"Not fixable inside the build, and do not try."*
No code was changed for it. What follows is the measurement the decision needs, taken on the shipped
engine this round rather than quoted from CUT-SPEC. It is reproducible in one command —
`node qa/cut-run-r3-split.mjs`, new, read-only, 59 lines, driving `site/js/job/state.js` in plain
node — and the three tables below are its whole output.

**A. Cutting the session to CUT-BRIEF's 8-12 questions moves the printed share by ZERO.** At the
critic's own measured pace (4.18 s deciding, 34.7 s answering — their `tGame` 75,251 / `tAnswer`
623,954 over 18 questions), `splitOf` prints **11 % at n = 1, 2, 3, 4, 6, 8, 10, 12 and 14**. It is a
per-question ratio; the count cancels. This reproduces the critic's 11 % exactly and independently
confirms round 1's finding at the new pace.

**B. At that answering pace, 45 % is unreachable BY ANY AMOUNT OF DELIBERATION.** Sweeping the
deciding time at a = 34.7 s, n = 12:

| deciding | printed |
| --- | --- |
| 3.0 s | 8 % |
| 6.0 s | 15 % |
| 12.0 s | 26 % |
| 18.0 s | 34 % |
| 23.9 s | **41 %** |
| 24.1 s | **0 %** |

41 % is the ceiling, and it belongs to a student who stares at **every** face-down card for 23.9 s.
Past `DELIBERATION_MS` the engine credits nothing at all (it is a ceiling, not a cap — by design), so
the curve does not approach 45 % from any direction. CUT-SPEC §8's "unreachable by construction" is
therefore stronger than §8 itself states: it is not only that padding is forbidden, it is that
**padding would not work either.**

**C. The one lever CUT-BRIEF names is answering time, and here is the number it has to hit** — the
longest answering time that still prints 45 %, n = 12:

| deciding | answering must be ≤ |
| --- | --- |
| 4.2 s (measured) | **5.2 s** |
| 6.0 s | 7.4 s |
| 12.0 s | 14.9 s |
| 23.9 s (the ceiling) | 29.8 s |

COMPOSED's fastest published card asks 16-24 s. A 5.2-second geometry question does not exist in this
unit.

**So the decision that is actually on the table** is not "tune the game". Two sentences of CUT-BRIEF
"Session shape" cannot both hold — *"Same queue as Today's Page, same length, same items"* and
*"8-12 questions"* — over a page the composer deals at 17 (+1 requeue = the critic's 18). And even
relaxing the first one does not reach the band: per **A**, a shorter queue prints the same 11 %. The
band needs the **content** to change — fewer, much harder questions, i.e. a different page — which is
`composePage`'s to decide and is forbidden to the game by CUT-BRIEF's own "the composer still owns
what is studied".

Three exits, all editorial, all outside this lane:

1. **Ratify the measured share.** CUT-SPEC §8 already decided this; the app prints the honest number
   and nothing is tuned toward the band. The student's sentence *"it should be like 50 % game"* stays
   unmet, and the one line the app shows him about it says 11.
2. **Move the band** to what the shape can reach — B says the honest ceiling at this unit's pace is
   about 40 %, and a real student deliberating 6-12 s prints 15-26 %.
3. **Change the page**, which means relaxing "same queue, same length, same items" AND giving the
   game a say in what is composed. That is the only route to 45 % and it costs the Law this brief was
   written to protect.

Nothing in the run lane moves this number, and **no further round should be spent on the game layer
until it is decided.**

## Test status at hand-off (round 3)

`cd /Users/oliver/Projects/unit1a-quest && node --test tests/` → **1821 tests, 1816 pass, 1 fail,
4 skipped**.

**The one failure is not this lane's and cannot be:** `tests/job-screen.test.mjs` *"the layout rules
the last bug came through"* — `site/css/job.css` now declares `--job-strip-h` four times (52px base,
88px stack, and two new answer-phase / keyboard overrides at lines 280 and 284) where that test
requires exactly two. It reads `css/job.css` and `screens/job.js` only; this lane changed
`screens/run.js`, one added export in `plan.js`, `tests/cut-run.test.mjs` and two new `qa/` files, and
touched no CSS. Both files were last written at 01:30 and 01:33 against this lane's 01:29 — the
CSS/screen lane is mid-edit. **It fails identically with every line of this round's work reverted.**

This lane and everything that reaches it is green:
`cut-run` (42), `job-ledger` (22), `cut-integrate`, `cut-home`, `cut-meta`, `run`, `plan`,
`integration-w4`, `no-random`, `coverage` → **516 / 516, 0 fail**, plus `qa/cut-run-r3.mjs`
**ALL PASS** in chromium. The 4 skips are pre-existing.

For the record, the suite grew from 1802 tests at the start of this sitting to 1821 at the end
without this lane adding one: other lanes are landing work in the same tree throughout.

## Requests for other owners (round 3)

1. **`plan.js` (integrate lane) — ONE LINE ALREADY ADDED, under BUILD-POLICY §2's allowance, and
   marked here as it requires.** Beside `hasLiveJob`, with its own comment:

   ```js
   export const jobOwnsPage = (save) => hasLiveJob(save) && gameOn(save);
   ```

   It is an addition, not a change: no existing line of `plan.js` was touched and no existing
   behaviour moves. It had to be in `plan.js` and not in `screens/run.js` — `tests/job-ledger.test.mjs`
   ("only the door itself reads the flag — no study module does") names `js/screens/run.js` explicitly,
   and `plan.js` is on that file's own list of doors. Two optional tidies, both yours, neither needed:
   `nextActionFor` (`plan.js:487`) computes the same conjunction a line after its own `!gameOn` return
   and could call it; and `screens/job.js`'s two refusals are the same question from the other side.
   **If you rewrite `plan.js` wholesale, keep this export** — `screens/run.js` imports it, and an ESM
   import of a missing name fails the whole module graph at link time, loudly, on the first load.

2. **`job/state.js` (state lane) — carried over from round 2 and now load-bearing.** Export the
   settle-and-drop verb: settle any standing bid at `priceOf`, `bank()` the pile, drop
   `inProgress.game`, leave `inProgress` (the page, its queue, its index) alone. It exists today only
   as a closure inside `screens/settings.js`'s mount (`leaveSession`), where nobody else can call it,
   and `tests/cut-meta.test.mjs` §6 has to `new Function()` it out of the source to test it. With it
   exported: `mountJob`'s `!gameOn` arm can settle instead of abandoning, `settings.js` keeps one call
   site, and this lane's residue (R3-2) closes without `run.js` ever pricing anything.

3. **`screens/job.js` (screen lane)** — no change is *required* now; `#/run/page` no longer hands you
   a session the switch has shut. If Request 2 lands, calling it from the `!gameOn` arm before
   `navigate('/today')` is belt-and-braces and costs nothing.

4. **CUT-BRIEF's owner — R3-1 is yours and it blocks.** See the three tables above. Nothing in the run
   lane moves the printed share, and no further round should be spent on the game layer until the
   band, or "same queue, same length, same items", is settled.

# ROUND 5 — the run lane (one MAJOR, fixed at root)

Owned this round: `site/js/screens/run.js`, `site/js/app.js`, `site/index.html` and their tests.
`app.js` and `index.html` were not touched — `ROUTE_PATTERNS` is still 13.

## R5-1 [MAJOR] A resumed sitting filed a different `runs[].startedAt` in the game than on `#/run/page`, and `#/stats` printed it as the page's duration — FIXED AT ROOT

### The root, in one sentence

`runs[].startedAt` had **two writers and two meanings** — the flat runner re-read its own
`Date.now()` on every mount, the game read `inProgress.startedAt` — and `#/stats` derived the
duration it prints *from that field*, so one page answered one way printed `42m` through one door
and `5h 52m` through the other.

### The fix — one stamp, one duration, both decided in code both routes already call

Two small functions in `screens/run.js`, and no third one anywhere:

1. **`export function pageRunStartedAt(ip, mountedAt)`** — the only place a Page's `startedAt` is
   decided. It is `inProgress.startedAt` (the PAGE's instant, which lives in the save and therefore
   survives a quit, a reload and a five-hour dinner), falling back to the mount only for a page that
   carries no stamp of its own. `mountCardRun` asks it (`pageStartedAt`) and `captureJobBefore` asks
   it. There is no longer a second opinion to disagree with.

   It is also what the field's other reader has always meant: `page.js pageIndexFor` counts *"Pages
   **started** today"* off `runs[].startedAt` to pick the **next page's seed**. Under the old flat
   stamp a page dealt at 23:50 and finished at 00:10 consumed the *next* day's page index; under the
   game's stamp it did not. That silent second divergence closes with the same line.

2. **`runRecordMs(kind, sum, startedAt, submittedAt)`**, inside `makeRunRecord`, writing a top-level
   `ms` on every record: **a Page's duration is its items' summed time; every other kind keeps the
   wall clock it has always had.** `#/stats`'s `runMs` already prefers a record's own `ms`
   (`screens/mock.js` writes one), so this is the record's existing vocabulary, not a new surface,
   and not one number `#/stats` prints for an Upgrade, a boss or a Mock moves.

   The Summary now prints the same reading (`elapsedMs: runRecordMs(...)`), so the seconds on the
   Summary and the seconds `#/stats` shows for the row it just filed are one number, not two. That
   also subsumes the old `resumed ? sum.ms : submittedAt - startedAt` — the flag is gone, because
   the answer no longer depends on how the page was reached.

### Why a wall clock cannot be the fix, on either route

The obvious repair — "make both routes subtract the same two instants" — **cannot satisfy the Law of
Two Ledgers**, and this is provable rather than a matter of taste. The game deliberately adds a
decision before every question; its `submittedAt` is therefore *later* than the flat route's for the
same study, by design (that difference is the measured split). `tests/job-ledger.test.mjs`'s own
`runShape` drops `submittedAt` for exactly that reason — "the identity of the SITTING, not of the
study it recorded". A duration built from `submittedAt` is that dropped quantity smuggled back into
a compared field. Only a function of the **answers** can be identical on both routes, and the file
had already picked which one on the resumed path: `sum.ms`.

It is also the honest reading. `42m` was one sitting of a two-sitting page; `5h 52m` was a page plus
a dinner. The summed item time is neither.

### Verification — the finding's own harness, the shipped screens, chromium

`INTERRUPT=5 AWAY_MS=18000000 node <scratch>/r5dual2.mjs` (the critic's driver, unmodified: real
`index.html`, real `screens/run.js` / `job.js` / `card.js`, real graders; same seeded save, same
26-answer script, one break after answer 5 at `#/today` and back):

|  | `startedAt` | `submittedAt` | wall | `ms` | what `#/stats` prints |
| --- | --- | --- | --- | --- | --- |
| BEFORE · flat | 1789614600000 | 1789617120000 | 42m 0s | — | **42m** |
| BEFORE · game | 1789596000000 | 1789617120000 | 352m 0s | — | **5h 52m** |
| AFTER · flat | 1789596000000 | 1789617120000 | 352m 0s | 62000 | **1m 2s** |
| AFTER · game | 1789596000000 | 1789617120000 | 352m 0s | 62000 | **1m 2s** |

`JSON.stringify(row)` is now equal between the two arms, and the harness's own ledger diff prints
`runs: IDENTICAL` — the one key it reported as `DIFFERENT` in the finding. All twelve other keys
(`cards skills xp errors forecastLog variants frozen daily trophies streak jumps counters`) stay
IDENTICAL, as they were.

(The `1m 2s` is the harness's pinned clock, not a real pace: it advances the item clock 2 s per
submit while stepping the session clock 2 min per question, so the wall it fabricates between
questions is dead time no student spends. The load-bearing facts are that the two arms agree and
that the five-hour break is no longer inside the number.)

### Tests

`tests/cut-run.test.mjs`, three subtests added and one assertion updated. Each new one was made to
fail first, against the shipped file — the two negative controls:

* `runRecordMs`'s page arm short-circuited to the wall clock → **5 fail**: §5 *"the same answers at
  two different instants file the same row"* (a pre-existing assertion this fix gave teeth to),
  §5 *"a break between two sittings is not study time"*, §7 *"a five-hour break cannot move the
  row"*.
* `pageRunStartedAt` reordered to prefer `mountedAt` (the old flat behaviour) → **4 fail**:
  §5 *"pageRunStartedAt: the page decides when it started, never the mount"*, §7 *"a five-hour break
  cannot move the row"*.

Added:
* §5 *a break between two sittings is not study time* — same results, two `startedAt`s five hours
  apart, one `ms`; and a `drill` in the same breath, to pin that every other kind keeps its wall clock.
* §5 *pageRunStartedAt: the page decides when it started, never the mount*.
* §7 *a five-hour break cannot move the row: one page, two sittings, either door* — the interrupted
  page driven through BOTH writers (the flat runner's own two lines with its `Date.now()` at the
  RE-mount, and `captureJobBefore` → `commitJobRun`), asserting equal `startedAt`, equal `ms`, and
  `deepEqual` on the whole row minus `n`/`seed`/`seedTag`. This is the resume case
  `tests/job-ledger.test.mjs` does not drive, and it is the case that broke.

Updated (not weakened — kept exact): §7 *"no key of the row is a game noun"* asserts the record's
whole key list; `ms` was added to it. `ms` is not a game noun, and the noun sweep over every key at
every depth is unchanged.

No test was deleted this round: the brief cuts no mechanic that these files cover.

### Requests for other owners (round 5)

1. **`tests/job-ledger.test.mjs` (the Law's owner) — the claim at line 76 is TRUE again, and could
   now be made load-bearing for the case that broke it.** It reads "(`startedAt` IS compared, and is
   the same instant on both routes)". It was falsified by a *resumed* page, which that file's two
   arms never drive — both stamp `now` and neither re-mounts. The fix restores the claim by
   construction (one stamp, `pageRunStartedAt`), and `tests/cut-run.test.mjs` §7 now drives the
   resume through both writers. If you want it proven in the Law's own file too, give `runFlatScreen`
   a `resumeAt` and pass `R.pageRunStartedAt(save.inProgress, resumeAt)` where it currently passes
   `startedAt` — that is the whole change, and it should stay green.
2. **`screens/stats.js` (stats lane) — no change needed, and please keep `runMs`'s first branch.**
   `const runMs = (r) => (Number.isFinite(r?.ms) ? r.ms : …)` is now what makes the two routes print
   the same duration. If that preference is ever dropped, R5-1 comes straight back.
3. **`screens/job.js` (screen lane) — no change needed.** `commitJobRun` still takes
   `{ queue, before, now }`; nothing was added to its contract.

### Open issues carried, not closed

* R3-1 (the measured split, 11 % against a 45–55 % brief) is still CUT-BRIEF's owner's decision and
  is untouched by this round. See round 3 above.

### Test status at hand-off (round 5)

`cd /Users/oliver/Projects/unit1a-quest && node --test tests/` → **1872 tests, 1868 pass, 0 fail,
4 skipped** (the 4 skips are pre-existing), exit 0.

For the record, an earlier full run during this sitting showed two failures in
`tests/job-screen.test.mjs` (`screens/job.js` hard-coding `card:wrong` / `card:hint`, and a
320 × 568 dock-clearance check against `css/job.css`). Neither could be this lane's — that file
never reads `screens/run.js` (`grep -c 'screens/run' tests/job-screen.test.mjs` → 0) — and both were
gone on a re-run twenty minutes later: the job lane was mid-edit in the same tree. The suite grew
from 1864 to 1872 tests across the sitting without this lane adding eight.

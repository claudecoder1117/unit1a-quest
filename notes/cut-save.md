# cut-save — the save and the worker

**Lane** `save`. **Owns** `site/js/store.js`, `site/sw.js`, and the two test files that cover them:
`tests/job-save.test.mjs`, `tests/sw.test.mjs`.
**Authority** `designs/CUT-SPEC.md` / `designs/CUT-BRIEF.md`; `BUILD-POLICY.md` wins.

`cd /Users/oliver/Projects/unit1a-quest && node --test tests/` — my four files are green
(`job-save` 27, `sw` 28, `state` 60, `job-ledger` 17 = **129 pass, 0 fail**; with `no-random`, 249).
The last full run as I finish is **1 557 tests, 1 549 pass, 4 fail, 4 skipped** (the four skips are the
same Playwright-gated browser arms as before), and **all four failures are the home/plan lane's
in-flight edits** — 3 in `home-r2`, 1 in `integration-w4`, none in a file this lane owns or touches.
An earlier run twenty minutes before showed 14, so that lane is converging.

---

## 1. What I built

The demolition had already cut `store.js`'s schema down to the two keys the design keeps
(`notes/DEMOLISH.md` §3). This lane finished the cut, closed one hole the cut opened, and replaced the
save's and the worker's tests with ones that can fail.

### `site/js/store.js` (687 → 707 lines; net +20)

1. **`CAPS.game` is gone.** The five caps (`calls 50, log 30, tags 68, bundles 5, heat 10`) were still
   sitting in the caps table with a twelve-line comment, trimming collections that no longer exist.
   Nothing read them. A cap is a tuning knob and a knob is how the old layer reached fourteen numbers;
   `tests/job-save.test.mjs` now asserts `'game' in CAPS === false` so it cannot come back quietly.
2. **`reconcileGameDay(save, today)` — new, 6 lines.** `game.today` is the points banked ON
   `game.day`. Opened on any other day those points are yesterday's, and a surface printing them as
   today's would print a number the engine never computed — the hard limit CUT-BRIEF states outright.
   `job/state.js gameOf()` already rolls the day over when a session **starts or banks**; nothing
   rolled it over on **load**, so between midnight and the first tap of a session the save held
   yesterday's number and every surface had to remember to check the date itself. Now the save layer
   hands out a correct `today` once, for every surface. It is wired into `load()` and `importJSON()`
   next to `reconcileStreak`, the same shape of repair in the same two places.
   It also floors `player.best` by `game.today` — see §3, "the floor".
3. **Comments.** Every remaining reference to a cut mechanic is gone from the file: the `ARCHIVED_KEYS`
   note about "crew ranks, the 68-tag Fault Index, heat, the job log", the `KEPT_KEYS` note about "a
   50-call calibration window and an Elo pair", three `COMPOSED-GAME G7` citations and two stale
   `file:line` references. No behaviour changed with them.

**Nothing else in `store.js` moved.** The study layer's caps, the packed disk codec, the storage
fallbacks, the unit hand-off and the streak are untouched, line for line.

### `site/sw.js` (235 lines)

No edit was needed: the demolition regenerated the list and `node qa/gen-precache.mjs --check` says
**up to date, 123 files**. What this lane added is coverage — the worker had never been *run*, only
read (§2). Re-run the generator after the other lanes land (§5, Requests).

---

## 2. Exported API

`site/js/store.js` — one new export, everything else unchanged:

```js
/** The day rolls over: points dated any day but `today` are not today's. Idempotent, total. */
export function reconcileGameDay(save, today = todayISO()) → save
```

* `save.game.day !== today` → `save.game.today = 0`, `save.game.day = null`.
* then `save.player.best = max(save.player.best, save.game.today)` — a raise, never a lower.
* a non-object `save.game` or `save.player` is left alone for `fillDefaults`; it never throws.
* called automatically by `store.load()` and `store.importJSON()`. No screen needs to call it.

The game's save, in full — **169 B** at its widest (9 999 points and a live session):
`save.player {best:0}` 13 B · `save.game {today:0, day:null}` 33 B · `inProgress.game` (the seven
`IN_PROGRESS_KEYS`) 123 B.

`site/sw.js` exports nothing (a classic worker). Its contract is `CACHE = packet-${APP_VERSION}`,
`PRECACHE` (123 paths, generated), and the `{type:'SKIP_WAITING'}` / `{type:'VERSION'}` messages.

---

## 3. The math, and the numbers it produced

CUT-SPEC §7's eight requirements are the payoff lane's to prove on the payoff table. Four of them are
*also* properties of the layer the numbers pass through on the way to disk, where they can be enforced
once for every surface instead of once per surface. Those are this lane's, and each is asserted over a
range rather than a sample.

| # | assertion | range | result |
|---|---|---|---|
| §7 #6 | `normalizePlayer` / `normalizeGame` are the **identity** on every points value | 414 values: 0…400 plus 499…1e6 | **0 moved** |
| §7 #6 | a full `migrate` is the identity on `best` and `today` | the same 414 | **0 moved** |
| §7 #6 | the disk codec (`pack` → JSON → parse → `unpack`) is the identity on both | the same 414 | **0 moved** |
| §7 #8 | `applyCaps` is the identity on `player`, `game` **and** `inProgress.game` | **2 005 states** — every pile 0…400 × every streak 1…5 | **0 violations** |
| §7 #8 | the day rollover never lowers `best` | the same 414, each with a stale day | **0 lowered** |
| brief | the v2→v3 migration lets **no old number** reach the new keys | **55 v2 saves**, five old fields × eleven values (1, 7, 8, 9, 10, 26, 186, 274, 419, 526, 9 999) | **best 0, today 0, day null in all 55** |
| brief | nothing in the game's save is a collection | every field of both defaults | 3 scalars + 1 null |
| brief | `CAPS` has no `game` knob | — | absent |
| §8 | the two schema copies deep-equal **in both directions** | `store.js` ↔ `data/job.js SAVE_DEFAULTS` | equal |
| §8 | `inProgress.game` is exactly `IN_PROGRESS_KEYS`, in order | driven through `startJob` | `pile, streak, call, answered, tGame, tAnswer, seed` |
| §8 | a killed tab restores the session with the **seed pinned** | `startJob → call → disk → migrate` | record byte-identical, seed unchanged |

**The day (CUT-SPEC §6 `today 186 points`).** Today's 186 survive a reload untouched; the same 186
dated yesterday, a week ago, a year ago, tomorrow, `null`, `''` or `'not-a-day'` all read **0**, and
`best 274` is untouched by every one of them.

**The floor.** `best = max(best, today)` fires only on a save that arrived with the two disagreeing —
an import, a hand edit, a tab killed between two writes — because `job/state.js bank()` maxes them
itself. It can only raise `best`, and only to a number the engine did compute (the points banked
today), so it cannot print a number the engine never computed, and it cannot cost the student one. Its
absence is what would print `best 0` under `today 186 points`.

**The worker, run rather than read.** `tests/sw.test.mjs` now evaluates `sw.js` in a vm with an honest
fake runtime (CacheStorage, `Request`, `Response`, `fetch`, `clients`) and **drives the three
handlers**: install precaches all 123 paths with `cache: 'reload'` and survives one 404 (all-or-nothing
would leave the student with no offline app at all); install never calls `skipWaiting`; activate
deletes every older `packet-` cache, keeps this one and anything that is not ours, and claims its
clients; a cached asset is served with the network **never touched**, with or without a query string;
every navigation (`/`, `#/today`, `#/run/job`, `#/settings`) resolves to the cached shell, and to a
503 "not cached on this device yet" when nothing is cached; an uncached asset is fetched once and kept,
and offline resolves **504 rather than rejecting**; a 404 is never cached; a cross-origin request and a
non-GET are not intercepted at all (S6: zero third-party requests).

---

## 4. Negative controls — 17 run, 17 caught

Each one breaks exactly one thing in a **mirror of the repo** (`site/`, `tests/`, `qa/` copied to a
scratch dir — the working tree is never patched, so a concurrent lane can never see a broken file) and
runs the shipped test file against it. The mirror is green before every patch and restored after it.

| # | the break | caught by |
|---|---|---|
| 1 | the day rollover removed (`if (false)`) | yesterday's points do NOT (+1) |
| 2 | the `best` floor removed | `best` is floored by a day that has happened |
| 3 | the floor's guard dropped, so it **lowers** `best` | 4 tests |
| 4 | a cap on points: `best` clipped at 500 | the two identity tests |
| 5 | `applyCaps` trims `game.today` at 200 | the 2 005-state identity |
| 6 | the migration carries `records.bestBag` into `best` | NO old number reaches the new keys |
| 7 | `pack()` drops `game.day` | the disk codec is the identity |
| 8 | `CAPS.game` added back | `CAPS` has no game knob |
| 9 | `freshGame()` grows a `log: []` | the drift test + nothing can grow |
| 10 | install back to all-or-nothing (`Promise.all`) | ONE renamed file does not cost the offline app (+2) |
| 11 | fetch-first instead of cache-first | a cached asset comes from the cache (+1) |
| 12 | the cross-origin guard removed | S6 — a cross-origin request is not intercepted |
| 13 | `js/store.js` dropped from `PRECACHE` | every file under site/js… is precached (+2) |
| 14 | `ignoreSearch` dropped from `match()` | a query string does not miss the cache |
| 15 | `skipWaiting()` moved into install | install never swaps itself in (+1) |
| 16 | a 404 is cached | a 404 is never cached |
| 17 | navigations stop resolving to the shell | every navigation resolves to the cached shell |

The harness is `scratchpad/nc.mjs` in this session's scratch dir; it is not part of the artifact.

---

## 5. Tests deleted, and why

No test of a live mechanic was deleted, skipped or weakened. `tests/job-save.test.mjs` lost four
assertions that tested **`js/job/state.js`**, not the save layer — `serialize(freshState())`'s key
order, `deserialize(serialize(g))`'s fixed point, `deserialize(junk)`'s hardening, and `resume()`.
Three are replaced by stronger save-layer equivalents driven through the verbs CUT-SPEC §8 names
(`startJob`, `call`) and through the disk: the key order is read off `inProgress.game` after
`startJob`; the resume is a real `pack → JSON → unpack → migrate` round trip; the one-sample
`applyCaps` check became the 2 005-state one. The fourth — **`deserialize` on a junk record** — is
genuinely not covered by this file any more, and is a Request below. What this file asserts instead is
narrower and absolute: the save layer carries whatever is in the slot to disk and back **unchanged**,
so a reload can never be the thing that changed a number.

This also removes this lane's coupling to four `state.js` exports that CUT-SPEC does not name, so a
rewrite of that module cannot break the save's tests for a reason that is not about the save.

---

## Requests

1. **`js/job/state.js` (state lane) — cover `deserialize` on junk in your own suite.** Moved out of
   `job-save` with the four assertions above; the property worth keeping is that
   `deserialize(anything)` never throws, is idempotent, and yields `pile ≥ 0`, `1 ≤ streak ≤ 5`.
2. **`site/version.js` (release step, one line) — bump `APP_VERSION` when the cut ships.** The cache
   name is `packet-${APP_VERSION}`; without a bump a returning student keeps the pre-cut cache and the
   new worker installs nothing. It is still `2026-09-21a`. I have deliberately **not** bumped it
   mid-build — six lanes are writing to `site/` and every bump invalidates the cache again.
3. **Whoever lands the last change under `site/` — run `node qa/gen-precache.mjs`.** The list is in
   sync right now (123 files), but the payoff lane's rename of `job/econ.js` → `job/pay.js`
   (CUT-SPEC §8 / DEMOLISH seam 1) changes it, and `tests/sw.test.mjs` fails until it is regenerated.
   `node qa/gen-precache.mjs --check` is the one-second version of that question.
4. **Screens lane — read the day through the store, not around it.** `save.game.today` is now correct
   on load, so `COPY.todayPoints({ points: save.game.today })` is safe; do **not** add a second
   date check on a surface, and do not print `save.game.today` from a save you got anywhere but
   `store.getState()`.

## Open issues

* **`settings.callYourShot`** (the study layer's confidence row) still ships in the settings schema. It
  is COMPOSED's, not the game's, and reads like the game's bid — the words "call" and "sure" now mean
  something specific two taps away. Not this lane's file (`screens/settings.js`); worth one look from
  the copy lane against CUT-SPEC §6's whitelist.
* **`archiveUnit` copies `game` into the archive** as `{today, day}` — a day's points filed under a
  finished unit. Harmless (nothing reads an archived `game`) and correct by the S8 #19 rule, but it is
  the one place a cut number is still written to disk, and a future unit swap will carry it.
* The full suite is **not** green as I finish, for 4 failures that are entirely the home/plan lane's
  (`home-r2`, `integration-w4`). My four files are green, before and after this work.

---

# ROUND 1 FIX — the save lane (fixer, files: `site/js/store.js`, `site/sw.js`)

**Finding (number-truth, Round 1, MAJOR):** *"A session resumed the next day prints yesterday's
points as `today`, and writes the two-day sum into `best` permanently."*

## 1. Reproduced first, both ways

Shipped modules, shipped store, a live session started 2026-09-21 with 500 points already banked on
that day, `player.best 100`, 48 points on the pile, reopened 2026-09-22 and banked once:

```
after reload on 2026-09-22: {"game":{"today":500,"day":"2026-09-21"},"player":{"best":500},"live":true}
after bank:                 {"bankReturn":{"points":48,"today":548,"best":548}, "game":{"today":548,"day":"2026-09-21"}}
printed: today 548 points | best 548        truth: points banked on 2026-09-22 = 48
```

And — not in the report, found while reproducing it — **the reload is not required**. With the tab
simply left open across local midnight, no `load()` ever runs and the same two numbers come out:

```
no reload, banked on day 2: {"bankReturn":{"points":48,"today":548,"best":548}, "game":{"today":548,"day":"2026-09-21"}}
```

`best` is never lowered again by anything, so both routes corrupt it permanently.

## 2. The root, in two halves

1. **`store.js reconcileGameDay` skipped the roll while `inProgress.game` existed** (the R4 exemption
   this note's §2.2 of `notes/cut-integrate.md` added). `job/state.js bank()` reads no clock by
   design, so with the roll skipped **nothing at all** rolled the day for as long as a session stayed
   open — and a session is closed only by finishing it. `startJob` "owning the boundary" cannot own
   it: it is the one verb that *cannot run* until the live session ends.
2. **`reconcileGameDay` floored `player.best` AFTER the roll had zeroed `game.today`,** so the floor
   read the `0` it had just written. The closing day was dropped in exactly the case the floor was
   written for (a save that arrives with the two disagreeing). Two lines, wrong order.

## 3. The fix (root, no surface, no number, no tap)

`site/js/store.js`, and nothing else:

* **`reconcileGameDay` floors `best` first, then rolls, unconditionally.** The live-session exemption
  is gone. A `today` that falls to 0 at midnight is exact; a `today` that is the sum of two days is
  not, and CUT-BRIEF's hard limit is that every printed number is the number the engine computes.
  Nothing is lost when it fires: the closing day is in `best` (floored first, and the floor only ever
  raises), and the unbanked pile lives in `inProgress.game`, which the roll never touches.
* **The roll stamps the new day** (`g.day = today`) instead of clearing it to `null`. `bank()` takes
  no clock and adds its points to whatever day `game.day` names, so a `null` would make the *next*
  reconcile roll away points that had just been banked.
* **`update()` reconciles the day before running its mutator.** This is what closes the tab that is
  never reloaded: the save layer owes `bank()` a `game` that already names the current day. It runs
  *before* `fn`, never after — after would zero points banked a moment earlier. Idempotent, inert on
  the study path (it touches `player` / `game` and nothing else), and it is the only clock read added.

After: `today 48 points`, `best 500` — the 500-point day kept as the best single day, 48 as today's,
on both routes. Nothing was added to any screen: no surface reads `save.game.today` during play
(`screens/job.js` prints `over.today` / `over.best` off `endJob`'s return, and Home prints
`player.best`), so there is not even a visible flicker; what changed is that the two numbers on the
end panel are now true.

**Why not the suggested fix.** The report suggested rolling inside `bank()`. `bank()` is the machine
lane's file, and putting a clock back into it re-opens the hole `notes/cut-machine.md` §1.2 closed
(`today` falling mid-session with the number on screen) while leaving every other write on a stale
day. One rollover, in the save layer, in front of every write, is the version with no second
implementation to disagree with.

## 4. Tests — changed, added, and proven to fail against the shipped code

`tests/job-save.test.mjs` (this lane's):

* `"yesterday's points do NOT"` — the roll now stamps `TODAY` instead of `null`. One assertion
  changed, with the reason in the test.
* **new** `"the day that is CLOSING is floored into `best` before the roll zeroes it"` — over the
  whole `POINTS` range.
* **new** describe `"a session that outlives its own day banks into the day the student is looking
  at"` — three tests, driving the **real** `createStore` + `state.bank`: the reload, the tab that was
  never reloaded, and a same-day control (two banks on one day still add to 548) so the suite cannot
  pass by rolling everything.
* **new** `"the screen banks through the store, never around it"` — the narrowest statement of the
  one coupling the `update()` half depends on: `state.bank` / `state.endJob` are never handed a bare
  `getState()`.

`tests/cut-integrate.test.mjs` §3 — **not mine, and changed anyway, because it asserted the defect**
(`assert.equal(s.game.today, 186)` on a stale live session; `day === YESTERDAY`). §3 is a suite over
`store.reconcileGameDay`, this lane's export. It is **retargeted, not deleted or weakened**: same five
tests, same subject, asserting the calendar instead of the exemption, plus two assertions the old
version did not make (the live record's pile is untouched by the roll; the floor fires before the
roll in all four live × day combinations). The file's header comment, which documented the exemption
as a fix, now documents it as the defect. **No test was deleted anywhere.**

**Negative controls** (scratch mirror of `site/` + `tests/`, working tree never patched):

| mirror | red |
|---|---|
| whole fix reverted | 4 of `job-save`'s (the roll, the floor, the reload, the never-reloaded tab) + 4 of `cut-integrate` §3 |
| only the `update()` half reverted | 1 — `"…and so does the tab that was never reloaded"` |

Each half is load-bearing and has its own failing test. The same-day control stays green in every
mirror, so the new suite is not vacuous.

`cd /Users/oliver/Projects/unit1a-quest && node --test tests/` → **1697 tests, 1693 pass, 0 fail.**

## 5. Requests

1. **`js/job/state.js` (machine lane) — the doc block on `bank()` is now stale in one clause.** It
   still says *"`startJob` is the one verb that rolls the day over"*; the store rolls it, on load, on
   import and in front of every `update()`. The behaviour it describes is unchanged and must stay
   unchanged: **do not put a clock back into `bank()` / `bankPile()`.** `gameOf(s, str(day))` with no
   `day` is exactly right — the save layer hands you a `game` that already names the current day.
   Suggested replacement for the last two sentences: *"The DAY is whatever `save.game.day` already
   names: `store.js reconcileGameDay` rolls it in front of every write, so points banked at 00:05 land
   on the day the student is looking at without this function reading a clock."*
2. **`site/version.js` (release step, one line) — `APP_VERSION` must be bumped again.** `store.js`
   changed; the cache is `packet-${APP_VERSION}`. Still not bumping it mid-round (six lanes are
   writing under `site/`).
3. **Whoever lands the last change under `site/` — `node qa/gen-precache.mjs --check`.** `sw.js` is
   in sync as I finish (`tests/sw.test.mjs` 28 green) and this fix added no file, but lanes are
   deleting and adding modules around me.
4. **Screens lane — unchanged from Request 4 above, and now load-bearing.** Print `today` from
   `endJob` / `bank`'s return or from `store.getState()`, never from a save captured before the
   mutation, and never add a second date check on a surface. There is exactly one rollover.

## 6. Open issues

* **`site/sw.js` needed no change** for this finding, and got none.
* **The trade this fix makes, stated plainly:** a student mid-session when local midnight passes now
  sees `today` restart at 0 for the new day. That is the exact number (0 points banked today) and
  nothing is lost (`best` holds the closing day, the pile is untouched), but it is a number moving
  backwards on a screen, which `notes/cut-machine.md` R4 and `notes/cut-integrate.md` §2.2 chose to
  avoid. They avoided it by printing a two-day sum instead, and CUT-BRIEF settles that trade: *"No
  number on any surface that is not exactly the number the engine computes."* In practice no surface
  prints `today` during play at all, so what a student can actually see is the end panel — where the
  number is now true.
* **`archiveUnit` still copies `game` into the archive** — unchanged, still harmless, still the one
  place a cut number reaches disk.

---

# ROUND 3 FIX — the save lane (fixer, files: `site/js/store.js`, `site/sw.js`)

**Finding** [MAJOR, exploit-hunt r3] *An unbanked pile crosses midnight and banks into the next day,
so `today N points` and `best` name a day the points were not earned on.*

## 1. Reproduced first, against the shipped modules

The round-2 fix closed the BANKED half of this (`today` zeroed, `best` floored first) and said in its
own comment that nothing was lost because "the unbanked pile lives in `inProgress.game`, which this
function never touches". That sentence was the defect. Banking is never required, so the pile simply
waited.

```
$ node /tmp/cutx/carry.mjs        # shipped startJob/call/answer/resume/bank/endJob + shipped roll
  day 1 close : pile 946  today 0  best 0  day 2026-09-16
  after roll  : pile 946  today 0  best 0  day 2026-09-17
  day 2 bank  : today 946  best 946        <- points EARNED on day 1
  day 2 end   : today 946  best 946
```

On day 2 the student answers nothing, taps bank once, and the end panel prints `today 946 points` over
a day with no questions in it — and because `best` is never lowered, that day is his best day for good.
Same file, same sentence, same hard limit as round 2: `today` must only ever name the calendar day the
student is looking at, and `player.best` is "the best single day, in points" (`data/job.js:74`), not
one day's pile plus another day's play.

## 2. The fix (root; no surface, no number, no word, no tap)

`site/js/store.js`, `reconcileGameDay` only — **the closing day takes its own pile home with it**:

```
DRAIN  →  FLOOR  →  ROLL
```

* **DRAIN.** When `g.day` names a real day that is not `today` and the live record carries a pile, the
  pile is added to the CLOSING day's `game.today`, and the record's `pile` goes to 0 and `streak` to
  ×1 — the two writes `job/state.js bankPile` makes, because the drain *is* the bank the student could
  have tapped, not a new verb.
* **FLOOR** is the line that was already there and already only ever raises: it now reads the closing
  day's TRUE total and carries it into `best`.
* **ROLL** then zeroes `today` for the day the student is looking at.

The session is not ended and not edited beyond the pile: queue, index, seed, `answered`, `call` and the
split meter carry on into the new day exactly as before. Nothing is destroyed — every point is in
`best`, which is the only number the design keeps about a past day. After:

```
  after roll  : pile 0  today 0  best 946  day 2026-09-17
  day 2 end   : today 0  best 946
```

`today 0` is exact (he banked nothing today); `best 946` is one day, whole, every point earned on it.

### The three guards, each of which is the fix and not decoration

1. **A BID IN FLIGHT HOLDS THE DAY OPEN.** `answer` prices a miss at `costOf(call, streak, pileBefore)`,
   capped at the pile. Draining a pile out from under a locked call floors that cost to **nothing** —
   a free question at full pay, which is exactly the exploit `bank()`'s own refusal ("REFUSED while a
   call is locked") exists to prevent, and it must not become reachable by waiting for midnight. It
   also floors `settleAbandonedBid`'s cost to nothing, so walking away would become free after
   midnight and expensive before it. So a real bid defers the WHOLE roll. That deferral is invisible
   and bounded: **no surface reads `save.game.today`** (grep across `site/js` — the only four hits are
   comments), `bank()` cannot be reached over a bid at all, and the bid is cleared by the next thing
   that happens to it either way — `screens/job.js settleAbandonedBid` on the next mount, or `answer`
   in a tab that never reloaded — after which the roll completes on the very next `update()`. A
   bidless seal (`{ id: null }`) is not a bid and does not defer it, exactly as `bank()` treats it.
2. **An EMPTY pile keeps its streak.** `bankPile` resets unconditionally because tapping bank is a
   decision; there is no decision here, so resetting a ×5 on a pile of 0 would be a cost the clock
   charged for nothing. This is the one deliberate divergence from `bankPile`, and the parity test
   names it.
3. **`g.day === null` credits nobody.** A save on which nothing was ever banked names no closing day,
   and inventing one is the defect, not the fix. Unreachable in the app (`startJob` stamps the day and
   so does every `update()`), so the gate only ever fires on an import or a hand edit.

### Why it is not `bank()` called from the store, as the report suggested

Measured, not asserted (`scratchpad/graph.mjs`, a module-graph walk over the real files):

```
store.js today            : 3 modules
store.js + job/state.js   : 58 modules
cycles back into store.js : 1
   js/store.js -> js/job/state.js -> js/page.js -> js/schedule.js -> js/store.js
```

A save layer that imports the engine pulls the whole card bank onto the cold-open boot path of every
screen and loads the game for a student who has switched it off (`settings.game = false` must be
"byte-identical COMPOSED behaviour") — through a cycle back into itself. `screens/settings.js
leaveSession` can use that pattern because a screen may import the engine; `store.js` may not.
`bank()` also *throws* over a standing bid, so the suggested call would have had to settle or void the
bid — charging for a question that has not been answered, or voiding a bid the session still needs.

The arithmetic is therefore written twice, and what keeps the copies honest is a test, not a comment:
**`the roll leaves exactly what the engine's own bank() leaves`** drives the SHIPPED `job/state.js
bank()` and the SHIPPED roll over the same record at every value in `POINTS` and compares `best`,
`pile`, `streak`, `call`, `answered`, `seed`. If `bankPile` changes and the roll does not, it is red.

## 3. Tests — changed, added, and each proven to fail against a broken store

`tests/job-save.test.mjs` (this lane's) — two retargeted, five new:

* `reopened the next day…` — `best` is now **548**, not 500: the 48-point pile was won last night too,
  so 548 is what that one day was worth. The pile is 0 and the streak ×1 on the reopened record, the
  session's other fields are asserted untouched, and the test goes on to win 12 points on day 2 and
  bank them, so `today 12` / `best 548` is asserted over a day that was actually played.
* `…and so does the tab that was never reloaded` — same retarget.
* **new** `the pile never crosses the date line, at any size` (over all of `POINTS`).
* **new** `the roll leaves exactly what the engine's own bank() leaves` — the parity test above.
* **new** `a locked call is not drained out from under, and defers the whole roll` — both halves: the
  refusal, then the completion once the bid is sealed bidless.
* **new** `nothing goes home when there is nothing to send, and an empty pile keeps its streak`.
* **new** `a save that names no day invents one for nobody`.
* **new** `it repairs nothing and throws on nothing, live record and all` — junk records
  (`null 0 'x' [] NaN undefined {pile:'nonsense'} {pile:-4} {pile:5.5}`) are carried byte-identical,
  the roll still happens, and the roll is idempotent over a live record it can read.

`tests/cut-integrate.test.mjs` §3 — **not this lane's, and changed anyway, because it asserted the
defect** (`assert.equal(s.inProgress.game.pile, 186, 'the roll reached into the live record')`). §3 is
a suite over `store.reconcileGameDay`, this lane's export, and it is **retargeted, not deleted or
weakened**: same tests, same subject, now asserting that the closing day's pile goes home (186 banked +
186 on the record = `best 372`) and that the session is otherwise untouched, plus two assertions the
old version did not make. The section header, which documented "the roll never touches
`inProgress.game`" as the fix, now documents it as the other half of the defect. **No test was deleted,
here or anywhere — nothing in this finding cuts a mechanic.**

**Negative controls** — scratch mirror of `site/` + `tests/`, working tree never patched. Each guard
has its own failing test and none is decoration:

| mirror | red (of mine) |
|---|---|
| whole fix reverted to the round-2 body | **8** — both retargets, the range, the parity, the bid, and 3 of `cut-integrate` §3 |
| the standing bid no longer defers the roll | **1** — `a locked call is not drained out from under` |
| the drain leaves the streak standing (free bank) | **3** — both retargets and the parity test |
| the drain fires on an empty pile (`> 0` → `>= 0`) | **1** — `an empty pile keeps its streak` |
| the `g.day === null` gate removed | **1** — `a save that names no day invents one for nobody` |

## 3b. The numbers

```
node --test tests/job-save.test.mjs tests/cut-integrate.test.mjs tests/sw.test.mjs tests/job-ledger.test.mjs
  106 tests, 106 pass, 0 fail        <- this lane's four files
node --test tests/state cut-meta cut-run cut-home job-state job-split job-pay no-random
  485 tests, 485 pass, 0 fail        <- everything that reads the store or the engine
node --test tests/                   1821 tests, 1817 pass, 0 fail, 4 skipped   (EXIT 0)
```

The four skips are the same Playwright-gated browser arms as every round. `node qa/gen-precache.mjs
--check` → *precache list is up to date (122 files)*.

**A later full run, twelve minutes on, is 1827 / 1822 / 1 fail** — and the one red is the screens
lane's live edit, not this fix: `job-screen.test.mjs → the layout rules the last bug came through`
counts `--job-strip-h` declarations in `site/css/job.css`, which grew from 2 to 4 at 01:30:40, ten
minutes after `site/js/store.js` was last written. No file this lane owns is in that test's inputs,
and the suite was **0 fail with this fix already in** at 01:29. Re-run when that lane lands; if it is
still red it is theirs (their test, their CSS, their literal `2`).

## 4. Requests

1. **`site/sw.js` needed no change and got none.** No file was added or removed;
   `node qa/gen-precache.mjs --check` → *precache list is up to date (122 files)*, `tests/sw.test.mjs`
   28 green.
2. **`site/version.js` (release step, one line) — `APP_VERSION` must be bumped again.** `store.js`
   changed and the cache is `packet-${APP_VERSION}`. Not bumping it mid-round: several lanes are
   writing under `site/` right now.
3. **`site/js/job/state.js` (machine lane) — one doc clause is now stale, and the behaviour it
   describes must NOT change.** `bank()`'s block still says the roll never reaches the live record.
   Suggested replacement for that clause: *"a closing day takes its own unbanked pile home through
   `store.js reconcileGameDay`, which refuses to do so while a call is locked — exactly as this
   function refuses."* **Do not put a clock into `bank()` / `bankPile()`**: `gameOf(s, str(day))` with
   no `day` is still exactly right.
4. **`screens/job.js` (screens lane) — the one path the deferral does not close, measured:**

   ```
   bid standing, next action = end the session   panel: today 548  best 548   (calendar day is the 22nd)
   bid cleared first (the ordinary path)         panel: today 0    best 548
   ```

   `endJob` voids the standing bid *inside* the same `update()` whose reconcile already deferred, so
   that one panel prints the CLOSING day's true total under the word "today". `best` is right in both,
   and the disk self-corrects on the next `update()`/load. It needs a bid locked and the session ended
   within the same minute as local midnight, and `settleAbandonedBid` already clears the mount case.
   The fix is one line in the screen, not in the store: clear the abandoned bid in its own `update()`
   before the finishing one, so the roll completes first. **Do not add a date check to a surface** —
   there is exactly one rollover.
5. **Screens lane — unchanged and still load-bearing.** Print `today` from `endJob` / `bank`'s return
   or from `store.getState()`, never from a save captured before the mutation.

## 5. Open issues

* **The trade this fix makes, stated plainly.** A student who abandons a session overnight comes back
  to a pile of 0 and a streak of ×1. He lost no points — they are in `best` — but he lost a multiplier
  he had built, because taking a pile home is what resets a streak. The alternative (keep the streak)
  is strictly better than tapping bank, so it would make *waiting for midnight* the dominant banking
  strategy: the app would pay for the clock. CUT-BRIEF math #7 is about the payoff table reading a
  clock, and it still does not — `payOf` / `costOf` take a call, a streak and a pile, and nothing else.
* **`archiveUnit` still copies `game` into the archive** — unchanged, still harmless.
* **Cross-lane, resolved, NOT mine:** mid-round the machine lane grew `IN_PROGRESS_KEYS` from 7 keys
  to 9 (`tAway`, `awayAt` — the split meter's absence span and its stamp), which made
  `tests/job-save.test.mjs`'s `it is exactly IN_PROGRESS_KEYS, in order` red against the literal key
  list that test restates. That literal is a tripwire, not a judgement, and following a shipped schema
  is not weakening it. **That lane made the one-line follow in this file itself** (BUILD-POLICY §2's
  one-line exception) while I was writing this note, with the reason in a comment; I left it as I
  found it. Nothing about `tAway` / `awayAt` touches the day roll: the drain writes `pile` and
  `streak` and nothing else on the record, and no payoff term reads a clock either way.
* **Six lanes are writing under `site/` as I finish**, so a single full-suite number is a moving
  target: `site/js/job/state.js`, `site/js/screens/job.js`, `site/js/screens/run.js` and
  `site/data/job.js` all changed under me during this ticket. What is stable and re-runnable is the
  per-file result below.

---

# ROUND 4 FIX — the save lane (fixer, files: `site/js/store.js`, `site/sw.js`, `tests/job-save.test.mjs`, `tests/sw.test.mjs`)

Two findings. **One is fixed at the root and ratcheted; one has no root in this lane's files, and
that is shown with commands rather than argued.** Nothing under `site/` changed this round —
`store.js` and `sw.js` are byte-identical to round 3.

---

## FINDING 1 [MAJOR, player-feel r4] — `best` is set by the composer's queue length, not by how you played

**Not fixed here, because none of it is here.** The claim is true; I reproduced every number in it.
Its two writers and its one reader are all in other lanes' files, and the fix it asks for changes a
contract four other suites assert. Detail, then the handover, then what this lane checked instead.

### 1.1 The ceiling really is linear in N — confirmed on the SHIPPED table

`node scratchpad/cut-save-r4/best-attrib.mjs` (shipped `job/pay.js`, perfect play, always the biggest offered call):

```
perfect play: N=8 -> 296  N=12 -> 496  N=14 -> 596  N=17 -> 746  N=21 -> 946
deltas per extra question: 50, 50, 50, 50, 50, 50, 50
closed form 96 + 50*(N-4): true
```

The report's ladder (8, 18, 30, 40, then 50) and its four totals are exact. A day's ceiling is
`96 + 50(N − 4)`, and N is `composePage`'s.

### 1.2 The `today N / best N` collision is `job/state.js`'s, not the save's

Fresh save, one session, 146 banked through the shipped verbs:

```
2. before bank:  player.best = 0  game.today = 0
   bank() RETURNED: {"today":146,"best":146}
   save after bank: player.best = 146  game.today = 146
3. reconcileGameDay on the same-day save: {"best":146,"today":146} -> {"best":146,"today":146} (NO-OP)
4. endJob() RETURNED (what viewModel prints): {"today":146,"best":146}
```

`best` is already equal to `today` **inside `bank()`'s return value**, before the save layer is
reached at all, and the panel prints that return (`screens/job.js:304` → `COPY.best({ points:
over.best })`, off `endJob`), never `store.getState()`. This lane's `reconcileGameDay` is a **no-op**
on that save. The write is one line:

```
$ grep -rn "\.best *=" site/js/ | grep -v "streak\|counters"
site/js/store.js:508    …  the save layer's floor  (fires only when a save ARRIVES with the two disagreeing)
site/js/job/state.js:840  p.best = Math.max(int(p.best, 0), gm.today);   ← this one
```

### 1.3 Why this lane did not "fix" it by dropping its own floor

Removing `store.js:508` is the only lever this lane has, and it is the wrong one — it is not the
cause, and it is load-bearing. Negative control, in a scratch mirror of `site/ tests/ qa/` (the
working tree is never patched; the mirror is green first):

```
mirror pristine : 37 pass, 0 fail
floorBest() removed : 12 fail
  ✖ the day that is CLOSING is floored into `best` before the roll zeroes it
  ✖ `best` is floored by a day that has happened, and raised by nothing else
  ✖ a session that outlives its own day … (+ 9 more, job-save and cut-integrate §3)
```

That floor is what rounds 1–3 put there so a day that closes with an unbanked pile takes its points
home (`DRAIN → FLOOR → ROLL`). Dropping it would re-open three earlier MAJORs and would still leave
`today 146 / best 146` on the panel. It stays.

### 1.4 The handover — a record whose ceiling the composer does NOT set, measured

The report offers two fixes. **The first is closed to this build**: "points per question" is a second
unit, and CUT-SPEC §6 freezes the strings (`today 186 points`, `best 274`) — "Not on this list, not
in the app" — while `best`-per-N is the collection CUT-BRIEF's "do not add a ladder" rules out. The
second (a non-numeric mark) is `screens/job.js`'s panel.

There is a third, and it is a **cut**, so it is worth putting on the record with its numbers:
**`player.best` = the biggest pile ever banked in one tap**, instead of the best day's total.

`node scratchpad/cut-save-r4/nfree.mjs` drives the shipped `pay.shouldPush` (its own §4 policy) at a true hit
rate `q`, and asks how big the pile is when it says bank:

```
day ceiling by N : 8->296  12->496  14->596  17->746  21->946  30->1396  40->1896
stop pile q=0.6  : 8->96   12->96   14->96   17->96   21->96   30->96    40->96
stop pile q=0.7  : 8->196  12->196  14->196  17->196  21->196  30->196   40->196
stop pile q=0.8  : 8->296  12->296  14->296  17->296  21->296  30->296   40->296
stop pile q=0.9  : 8->296  12->496  14->596  17->746  21->746  30->746   40->746
stop pile q=0.95 : 8->296  12->496  14->596  17->746  21->946  30->1396  40->1596
```

The day's ceiling is +50 per question, for ever. The banked pile's is **flat in N** at every rate up
to 4-in-5 — 96, 196, 296 — because the share makes the push condition fail at a pile the page length
cannot move. It rises only when the student does (96 → 196 → 296 is CUT-BRIEF math #6, visibly), it
is one number, in points, so `COPY.best` and §6's `best 274` are untouched, and it is **already on
screen during play**: the pile is slot 1, so the record becomes something you watch yourself walk up
to, with no fourth number and no new word. Honest limit, stated: above 4-in-5 it is still
page-limited (q = 0.9 saturates at 746 from N = 17; q = 0.95 is still climbing at N = 40), so it
narrows the defect rather than closing it at the very top of the skill range.

It also fixes 1.2 for free: the pile you banked and the day's total are different numbers, so
`today 146 / best 96` reads as a day in progress and beating your best stops rendering as a tie.

**Why I did not land it.** It is `bankPile`'s line 840 (`max(best, today)` → `max(best, points)`)
plus `endJob`'s return, plus the contract four suites this lane does not own assert:
`cut-meta.test.mjs:753` (`best` 166 after banking 146 onto 20), `cut-integrate.test.mjs:161/187/217`
("best is one day", 372), `job-ledger.test.mjs:543`, `job-screen.test.mjs:650`. That is a design
change across five lanes, mid-round, with three of those files being written to while I type
(`job/state.js` mtime 04:13:35, `pay.js` 04:12:00, `screens/job.js` 04:13:46, against a 04:13:49
clock). It belongs to CUT-BRIEF's owner and the machine lane, in one move, not to a save fixer's
side edit. **Request 1 below carries it in full.**

---

## FINDING 2 [MAJOR, study-untouched r4] — COMPOSED.md S6 still publishes the DELETED layer's save numbers

**Fixed at the root, and the root is that no test could read the paragraph.** All six sub-claims
reproduced first:

| # | the published claim | the shipped fact | command |
|---|---|---|---|
| a | `539 932 chars = 499 600 study + 40 332 game` | `499940 chars = 499727 study + 213 game` | `node --test tests/state.test.mjs` |
| b | "the stated `SAVE_BUDGET_KB.totalAdded` of 39.7 KB" | the constant is nowhere under `site/` (one stale comment in `tests/_helpers.mjs:167`) | `grep -rn SAVE_BUDGET_KB site/ tests/` |
| c | `study 505671 … over by 5671`, "329 chars away" | `study 502227 of 500000 — over by 2227` — **3 773** from the 6 000 ratchet | `node --test tests/state.test.mjs` |
| d | "`tests/job-save.test.mjs` ratchets that overrun" (546 004 chars) | that file measures no save size; its only byte assertion is `cost < 1024` on a live game record | `grep -niE "char\|byte\|budget" tests/job-save.test.mjs` |
| e | "500 000 + 39.7 KB … leave 19 B", "740 chars of headline slack" | `slack: study 273 chars of 500000 · game 811 B of 1024` | same run |
| f | headline "Size < 528 KB", raised for a 40 KB game layer | the bound two assertions actually enforce is `500 000 + 1 024 = 501 024` chars | `tests/state.test.mjs:577-597` |

### 2.1 The rewrite (`COMPOSED.md:330-332`, now 330-346)

Rewritten from the shipped test's own printout, which it now **quotes verbatim in a fenced block**
rather than paraphrasing:

* headline bound → **`< 501 024 chars of JSON — 500 000 study + 1 024 B game`**, the two numbers
  `tests/state.test.mjs` asserts separately, stated in the unit that test measures (chars, not
  bytes — the old "528 KB / 540 672 B / 19 B" arithmetic silently treated one as the other). The
  localStorage cost is given as what it is: ≈ 1 MB of the 5 MB quota at two bytes a char.
* the `SAVE_BUDGET_KB` citation is **gone** — the constant does not exist, so the document does not
  name it.
* the `tests/job-save.test.mjs` ratchet citation is **gone** — that file no longer measures a save.
  What it does assert (the game half under 1 024 B with a session live) is stated instead.
* the OPEN block-quote keeps its substance — the before-snapshot overrun is real and pre-existing —
  and is re-measured: `study 502227 of 500000 — over by 2227`, 3 773 before the ratchet, with the
  test's own assertion that the snapshot moved **none** of the 213 B game half, which is what makes
  it a study-side question and not the game's. Still filed as notes/repair-save.md Request D.
* `captureJobBefore` still exists (`screens/job.js:113,581`), so that half of the sentence stands.

### 2.2 The root fix — the paragraph is now machine-checked

A document that outranks the code does not get to publish a number the code cannot compute. Four
tests in **`tests/job-save.test.mjs`** (this lane's), following the precedent `tests/job-split.test.mjs:613`
already set by reading S1's per-card budget out of COMPOSED.md:

1. **the bound is the document's, not the test's.** `gameBudget()` pulls the game half's byte budget
   out of S6 — from the headline sum *and* from the sentence that names this file — asserts the two
   agree, and then **uses it** as the bound in `a live session, priced`. A hand edit to either one
   moves this file's bound or fails here.
2. **`SAVE_BUDGET_KB` exists nowhere under `site/`** (walked, not grepped by hand) **and S6 does not
   cite it.** If the game half ever needs a published constant again, the constant comes first.
3. **no figure from the deleted layer survives in the paragraph** — `539 932`, `40 332`, `39.7 KB`,
   `546 004`, `540 672`, `505 671`, each listed as the string the document printed, so this fails on
   a revert rather than on an honest re-measure.
4. **the figures it does publish are the ones the shipped tests print** — S6 and `tests/state.test.mjs`
   must both still carry the three printout lines S6 quotes, and the two measured figures must match.

### 2.3 Negative controls — 5 run, 5 caught

Scratch mirror of `site/ tests/ qa/ package.json` + `COMPOSED.md`; the working tree is never patched.

| # | the break | result |
|---|---|---|
| 1 | `store.js floorBest()` removed | 12 red (job-save + cut-integrate) — §1.3 |
| 2 | S6's measured total reverted to `539932 … 40332` | 2 red (tests 3 and 4) |
| 3 | S6's published game budget hand-raised 1 024 → 40 960 | 1 red (`a live session, priced`) |
| 4 | `COMPOSED.md` deleted outright | 4 red |
| 5 | pristine mirror | 41 pass, 0 fail |

**A hole this found in my own first draft, worth recording.** Controls 3 and 4 first came back
**green at 37 tests instead of 41**: the parsing sat in the `describe` body, and a throw there does
not fail a node:test suite — it silently drops the whole block. A broken document would have
*deleted* four tests and reported success. Every read, match and assertion now lives inside a
`test`, and the comment above the block says why. Re-run: control 3 → 1 fail, control 4 → 4 fail.

---

## Tests deleted, skipped or weakened this round

**None.** One test was **strengthened in place**: `a live session, priced` keeps its assertion and
takes its bound from COMPOSED.md instead of from a literal in this file. Three tests added. No test
anywhere was touched to accommodate finding 1.

## Requests

1. **`js/job/state.js` (machine lane) + `screens/job.js` (screen lane) + CUT-BRIEF's owner — finding
   1, in one move.** `bankPile` line 840 `p.best = Math.max(int(p.best, 0), gm.today)` →
   `Math.max(int(p.best, 0), points)`, so `best` is the biggest pile banked in one tap rather than
   the best day's total; `endJob`/`bank` keep returning it, `COPY.best` and CUT-SPEC §6 are
   untouched, and no screen gains a number or a tap. `notes/cut-save.md` §1.4 above has the measured
   N-independence (flat at 96/196/296 for every N from 8 to 40 at hit rates up to 4-in-5) and the
   honest limit above 4-in-5. It moves a contract four suites assert — `cut-meta:753`,
   `cut-integrate:161/187/217`, `job-ledger:543`, `job-screen:650` — so it is one ticket, not five
   side edits. **This lane's `store.js:508` floor and its `DRAIN → FLOOR → ROLL` need no change
   under it** (the drain already books the closing day's pile through the same door), but tell me and
   I will re-derive the four `cut-integrate` §3 expectations.
2. **`tests/_helpers.mjs` (test lane) — `_helpers.mjs:167` still cites `SAVE_BUDGET_KB`.** It is the
   last reference in the repo and it is a comment on the deleted layer's carrier (50 calls, 68 tags,
   12 crew makes, 5 bundles). `tests/job-save.test.mjs` now fails if that constant comes back under
   `site/`; the comment is harmless but it is the thread finding 2 pulled.
3. **`site/version.js` (release step, one line) — `APP_VERSION` is still `2026-09-21a`.** The cache
   is `packet-${APP_VERSION}`; without a bump a returning student keeps the pre-cut cache. Still not
   bumping it mid-round.
4. **Whoever lands the last change under `site/` — `node qa/gen-precache.mjs --check`.** It said
   **up to date, 122 files** as I finished (it was 123 before this round — a module was deleted
   under me and the list already tracks it), but `job/`, `screens/job.js` and `pay.js` were all
   being written while I worked.

## Open issues

* **Finding 1 is NOT closed.** Nothing in this lane's two files is its root; Request 1 is the fix,
  with its numbers. Saying so is not a softening of the finding — §1.1 reproduces every figure in it.
* **The full suite is GREEN at handoff: `node --test tests/` → 1 857 tests, 1 853 pass, 0 fail,
  4 skipped** (the four skips are the same Playwright-gated browser arms as every round).
* **It was red for part of this round, and none of it was this lane's — proved, not asserted.** While
  I worked, `job-split`, `job-pay`, `job-state` and `job-screen` were red (16, then 7, then 4) as the
  split / payoff / machine / screen lanes landed a ceiling on face-down time and an "is there
  anything to decide here?" gate (`pay.js` 04:12, `state.js` 04:14, `call.js` 04:18, `screens/job.js`
  04:21). **Counterfactual, run at the worst of it:** a scratch mirror of the working tree with
  `COMPOSED.md` and `tests/job-save.test.mjs` reverted to `HEAD` failed **7** of those four suites'
  tests; the live tree, with my changes, failed **4**. My edits cannot cause a failure that is worse
  without them. The one test anywhere that reads `COMPOSED.md` — `job-split.test.mjs:610`, S1's
  per-card budget — was green before the rewrite, during the red, and after it.
* My four files — `job-save` **41**, `sw` 28, `state` 60, `job-ledger` 17 — are **148 pass, 0 fail**
  at every point in this round, as is `no-random` (119). `node qa/gen-precache.mjs --check` says
  **up to date, 122 files**.
* **`archiveUnit` still copies `game` into the archive** — unchanged, still harmless, still the one
  place a cut number reaches disk.
* **`settings.callYourShot`** — unchanged from round 1's note; still the copy lane's look.

---

# ROUND 5 FIX — the save lane (fixer, files: `site/js/store.js`, `tests/job-save.test.mjs`)

**Owns** `site/js/store.js`, `site/sw.js` + `tests/job-save.test.mjs`, `tests/sw.test.mjs`.
`site/sw.js` and `tests/sw.test.mjs` are **untouched this round** — nothing in the three findings
reaches the worker, and `node qa/gen-precache.mjs --check` says *up to date, 122 files*.

All three findings are one defect wearing three coats: **the day roll was not an event, it was a
side effect of whatever verb happened to run next.** So a throw could strand it (finding 1), a
standing bid could hold it open until the next day's points had joined the pile it was about to bank
(finding 2), and the verb it rode inside reported on a pile it had just emptied (finding 3). The fix
is one sentence in code: **the roll is its own transaction, on its own clock, and when it has to wait
for a bid it banks the pile the day closed on and not the one the next day made of it.**

No number was added to any screen. No tap was added to any question. No key was added to the save —
`freshPlayer()` is still `['best']`, `freshGame()` is still `['today','day']`, `IN_PROGRESS_KEYS` is
still the same nine, and `CAPS` still has no game knob. `ROUTE_PATTERNS` is untouched (13).

## 1. Reproduced first, against the shipped modules

`/private/tmp/.../scratchpad/nc/probe2.mjs`, driving the real `store.js` + `job/state.js` with a
fake clock and a fake storage. **"pre-fix" is this tree with my three edits reverted and nothing
else changed.**

```
FINDING 1 — 94-point pile at ×5, 23:40; the clock passes midnight; the student taps `sure`
  before midnight   : mem {pile 94, ×5, day 2026-09-21, best 500}   disk {pile 94, ×5, 2026-09-21, best 500}
  offered           : ["not sure","pretty sure","sure"]
  sure refused      : JobStateError: unaffordable: sure
  pre-fix  after    : mem {pile 0,  ×1, day 2026-09-22, best 594}   disk {pile 94, ×5, 2026-09-21, best 500}
  WITH FIX after    : mem {pile 0,  ×1, day 2026-09-22, best 594}   disk {pile 0,  ×1, 2026-09-22, best 594}

FINDING 2 — 500-point day, 48-point pile at ×4, `sure` locked, then midnight, then the answer
  call sure         : pays 40, costs 36        (`sure` at ×4 over a 48-point pile)
  pre-fix  after the answer      : best 500  game {today 500, day 2026-09-21}  pile 88 ×5
  pre-fix  one update later      : best 588  game {today 0,   day 2026-09-22}  pile 0  ×1     ← 548 + 40
  WITH FIX after the answer      : best 548  game {today 0,   day 2026-09-22}  pile 40 ×1
  WITH FIX one update later      : best 548  (unchanged — the roll finished inside the settling verb)
```

`588` is the shipped `644` in miniature: the closing day's own total (500 banked + its 48-point
pile = 548) **plus a question answered on the next day**. Exactly what the function's own docblock
says it exists to prevent.

## 2. The fix, in three pieces — `site/js/store.js` (782 → 915 lines)

### 2.1 `rollAt(day, held)` — the roll is a transaction, not a side effect (findings 1 and 3)

One private function inside `createStore`: reconcile, and **if the clock moved a number, cap it,
announce it and write it — immediately, then.** Every path into the roll now goes through it:

* `rollDay()` — public on the store, `rollAt` at the current clock;
* **a local-midnight timer** (`armDayTick`, armed only when a `doc` is passed, re-armed after each
  fire, `unref`'d, clamped to `[1 s, 24 h]` so it can never spin);
* **`visibilitychange` → visible** (the phone locked overnight on a face-down card — the store's own
  handler is registered at module-eval, i.e. **before** any screen's, so `screens/job.js`'s
  `resync()` on the same event repaints the reading the roll left);
* `load()` / `importJSON()`, unchanged;
* and `update()`, where it now runs **as its own committed transaction before `fn`** rather than
  inside it.

That last line is finding 1's root. The roll's mutation was applied to the live state and then
`fn` threw `unaffordable`, so `notify` and `save` never ran: memory held an empty pile, localStorage
held last night's 94, and the strip printed a third reading with two controls on it that the engine
would refuse for as long as the student kept tapping. **A refusal may cost the verb; it may not cost
the day.** `update()` is now four lines shorter than my first draft of the fix — there is no
throw-path special case, because there is nothing left to strand.

It is also finding 3's root: *"order the roll so the verb that triggers it is not the verb it
silently empties"*. In a browser the roll has now almost always already happened — on the timer, or
on the document coming back — so BANK is tapped against the reading on screen rather than against a
pile the same tap just sent home. `update()`'s pass is the backstop for the tab that saw neither
event, and even there the roll is committed and announced first.

### 2.2 `reconcileGameDay(s, today, { held })` — the closing day banks its OWN pile (finding 2)

Six lines. When a real bid defers the roll, the drain, when it finally runs, credits
`min(live.pile, held)` and **leaves the rest in the pile that won it**, instead of banking the whole
grown pile into the day that closed.

`held` needs no field on the save and no memory between sessions, and this is why: **while a real
bid stands the pile cannot move.** The only two writers are `job/state.js answer()`, which clears
the bid in the same breath, and `bankPile`, which `bank()` refuses to reach over a bid (and `call()`
refuses a second one). So the pile read on *any* deferred pass **is** the closing pile, however many
updates or reloads the bid is held across — which is what makes the unbounded deferral the finding
measured (`s7.mjs`, six reloads) harmless rather than something that needed a second fix.

`store.update()` reads it once, through the new exported `deferredPile(save, today)`, **before** the
verb runs, and hands it back to the roll **after** — the one window in which the closing pile and
the settled bid are both known.

**What this deliberately does NOT do**, because each was tried on paper and each is worse:

* *drain the pile under the standing bid* — `answer()` and `priceOf` both read the CURRENT streak
  and pile, so a bid locked at `pays 40` would settle at `pays 10` and cost nothing. That is the
  payoff reading a clock (CUT-BRIEF math #7) and a printed number the engine then did not honour.
* *void or bidlessly seal the bid at midnight* — same violation, louder: `pays 40` settles at 0.
* *let the pile ride into the new day* — conserved, but `best` is then inflatable on purpose: hold a
  bid overnight and a 94-point pile joins the next day's 300 to print `best 394` over two days.
* *snapshot the deferred pile on the save* — a fourth integer in `game` or a tenth key in
  `IN_PROGRESS_KEYS`. The brief's whole thesis is that this is how the last one died.

Measured, both ways, through the shipped `startJob`/`call`/`answer`:

| the bid, locked at ×4 over 48 | pays/costs | closing day (`best`) | the new day's pile |
|---|---|---|---|
| CLEAR after midnight | pays 40 (priced 40) | **548** = 500 + 48 | **40** |
| MISS after midnight  | costs 36 (priced 36) | **512** = 500 + 12 | **0** |

A right answer still pays more than a wrong one (548 + a 40-point pile vs 512 + nothing), `best`
still names one day, and the bid is settled at the price it was locked at.

### 2.3 `gameReading(s)` — "did the clock move a number?"

Five scalars (`game.today`, `game.day`, `player.best`, and the live record's `pile` / `streak`) as
one comparable string. It is how `rollAt` answers that question without a second copy of the roll's
own logic, and it is why `rollDay()` is idempotent and silent when there is nothing to do.

## 3. Tests — 6 added, 1 left standing, 0 deleted, 0 weakened

`tests/job-save.test.mjs`: **41 → 49 tests, all green.** Added:

1. `the closing day banks the pile it HAD, never the one the next day made of it` — `held` over the
   whole POINTS range × four grown piles (1 656 cases).
2. `…and a loss taken on the new day cannot credit the closing one with points that are gone`.
3. `` `held` is a count of points, and anything that is not one drains the whole pile `` — eight junk
   values, plus `held: 0` (a day that closed on an empty pile owes nothing and must not reset a
   streak for a bank that sent nothing home).
4. `` `deferredPile` names the pile a standing bid is holding open, and nothing else `` — bid /
   no-bid / bidless seal / empty pile / same day, and total on seven junk saves. The options bag the
   roll now takes is covered in (3): `undefined`, `null`, `{}`, `0`, `'x'`, `[]`, `{nope:1}` all
   leave the roll behaving exactly as it did before `held` existed.
5. `a verb that refuses may cost the verb; it may not cost the day` — drives `createStore().update()`
   with a stale `game.day` and a mutator that throws, and asserts **the persisted pile, streak, day
   and best equal the in-memory ones** and that exactly one `'update'` was announced; then that a
   refusal with nothing to roll writes nothing and announces nothing.
6. `a bid settled after midnight pays the new day, and \`best\` is never a two-day sum` — the real
   `startJob` → `call` → midnight → `answer` → **and the update after it**, for CLEAR and MISS. The
   last step is the one the finding named: it is the update the deferred roll used to complete on,
   by which time `answer` had already added this question's pay to the pile it drained.
7. `the roll is its own event: written, announced, and finished before anything is tapped`.
8. `…and the document coming back is the clock too` — a fake `doc`, hidden (writes, does not roll)
   then visible (rolls).

**`a locked call is not drained out from under, and defers the whole roll` is kept as it was** — the
bid's pile and streak still must not move, and that is still true. The finding's suggestion was to
replace its hand-written `call = { id: null }` with a real `answer()`; test 6 does that instead of
editing it, because the `held` plumbing lives in `store.update()` and a bare `reconcileGameDay` call
cannot exercise it. Test 6 drives the door the app actually uses (`screens/job.js:1157` answers
through `update()`), and it fails against the shipped code — see the controls below.

### Negative controls — 5 run, 5 caught (scratch mirror; the working tree is never patched)

| # | the break | result |
|---|---|---|
| 0 | pristine mirror | 49 pass, 0 fail |
| 1 | the roll folded back inside the verb (`rollAt(day)` → `reconcileGameDay`) | 1 red — finding 1's test |
| 2 | the deferred-pile post-pass removed | 1 red — finding 2's test, on `best 500` then `588` |
| 3 | the shell clock disarmed (`rollDay` → `false`, no visibility roll) | 2 red — finding 3's two tests |
| 4 | `held` ignored inside the roll (`owed = pile`) | 3 red |

## Tests deleted, skipped or weakened this round

**None.** Nothing in the three findings is a mechanic CUT-BRIEF cuts, so no test covering one was
removed. No assertion anywhere was loosened.

## Requests

1. **`screens/job.js` (screen lane) — ALREADY DONE, nothing owed; recorded so the coupling is
   written down.** While I worked you landed `resync()`, the two `catch` → `resync()` sites, and
   `offStore = subscribe(() => resync())` with the `inVerb` guard that stands the subscription down
   during the screen's own writes. That is exactly the half of finding 1 that is not mine and the
   repaint the midnight roll needs, and it works because the roll announces itself with
   `notify('update')` — which your `tests/job-screen.test.mjs` lint now asserts off my file, so
   neither of us can take it away quietly. **The contract between our two files, stated once:** the
   store rolls the day (on its timer, on `visibilitychange`, on load, and as the backstop inside
   `update()`), commits it, and announces it as `'update'`; the screen repaints from
   `state`/`modelNow` when it hears one it did not cause. Nothing is remembered across that line.

2. **`js/job/state.js` (machine lane) — do NOT change `bankPile`'s return.** Finding 3 offers, as a
   fallback, "have `bankPile` report the points it actually sent home on this tap — including any the
   roll just drained". With 2.1 in place the receipt is already honest (the roll finished at
   midnight, so the tap really is worth what it says), and doing it anyway would print DAY1's points
   on a DAY2 receipt under the word `today` — a number that day did not hold, which is the defect
   rather than the fix. Nothing for you to do; recording the decision so it is not re-litigated.

3. **`site/version.js` (release step, one line) — `APP_VERSION` is still `2026-09-21a`.** Fourth
   round running. The cache key is `packet-${APP_VERSION}`; without a bump a returning student keeps
   the pre-cut cache. Still not bumping it mid-round.

4. **`tests/_helpers.mjs` (test lane) — `_helpers.mjs:167` still cites `SAVE_BUDGET_KB`**, the last
   reference in the repo, unchanged from round 4.

5. **Whoever lands the last change under `site/` — `node qa/gen-precache.mjs --check`.** It says *up
   to date, 122 files* as I finish, but `screens/job.js`, `job/state.js` and `pay.js` were all being
   written while I worked.

## Open issues

* **The midnight timer is browser-only and best-effort by construction.** It is armed only when a
  `doc` is passed (so it never exists under Node, and no test waits on a real timer — the two clock
  tests drive `rollDay()` and a fake `visibilitychange` directly). A background tab whose timer the
  browser throttles is caught by the `visibilitychange` roll on its way back; a foreground tab's
  timer fires. `update()`'s pass remains the backstop under all of it.
* **`game.today` is still stale on Home while a real bid stands.** The deferral keeps `game.day` at
  the closing day until the bid settles, so a student who locks a bid at 23:59 and then navigates to
  Today sees the closing day's points under the word *today*. Pre-existing (r3's deferral), bounded
  by one question, and not reachable from the game screen itself — `bank()` refuses over a bid and
  no game surface reads `game.today` during play. Closing it properly needs the calendar to close
  while the pile waits, which needs the snapshot field §2.2 rejects; flagging it rather than
  inflating the save for it.
* **`archiveUnit` still copies `game` into the archive** — unchanged, still harmless, still the one
  place a cut number reaches disk.
* **One cross-lane race, recorded because it looked like a failure of mine and was not.** A full run
  mid-round failed one test: a source lint in `tests/job-screen.test.mjs` that pinned `update()`'s
  exact old text (`/reconcileGameDay\(s, todayISO\(new Date\(now\(\)\)\)\);\n\s*const r = fn\(s\)/`).
  The screen lane replaced that lint with a behavioural one in the same hour (`the store really can
  move the game under a screen that does not repaint`, which reads `reconcileGameDay(`, `live.pile =`,
  `function subscribe(fn)` and `notify('update')` off my file), and `job-screen` is **85 pass, 0
  fail** against my final tree. A lint that quotes another lane's source line-for-line will do this
  again; the four facts it reads now are the right shape.
* **The full suite is GREEN at handoff** — see §4.

## 4. The run at handoff

```
cd /Users/oliver/Projects/unit1a-quest && node --test tests/
  tests 1881 · suites 159 · pass 1877 · fail 0 · cancelled 0 · skipped 4 · todo 0
```

The four skips are the same Playwright-gated browser arms as every round. The baseline I took before
touching anything, on the same tree, was **1861 / 1857 pass / 0 fail / 4 skipped**. Eight of the
twenty new tests are mine (`job-save` 41 → 49); the rest arrived from the lanes editing beside me
while I worked. The only red I ever saw was the cross-lane lint race recorded under Open issues.

This lane's own four files at handoff: `job-save` **49**, `sw` 28, `state` 57, `job-ledger` 22 =
**156 pass, 0 fail**, plus `no-random` 119 (275 together). `node qa/gen-precache.mjs --check` → *up
to date, 122 files*. `site/sw.js` is byte-identical to how I found it (`md5 0f63554c…`).

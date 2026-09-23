# cut-home — the game gate and Home

**Lane** `home`. **Owns** `site/js/plan.js`, `site/js/screens/home.js`, `tests/cut-home.test.mjs`.
**Authority** `designs/CUT-BRIEF.md` → `designs/CUT-SPEC.md`; `BUILD-POLICY.md` wins.

The old layer failed on Home before a question was asked: forty numbers on the first screen, and a
grey line under the primary button that read *"the game is Today's Page with a different top strip"*
— the design document, quoted at a 14-year-old. `notes/DEMOLISH.md` removed the board panel. This
lane removed the last two ways the game could still reach this screen, and pinned the fact that it
cannot.

**This lane added no copy. Not one string.** Home's button says what the PAGE says, or nothing.

---

## 1. What was built

### `site/js/screens/home.js` — the CTA is two pure functions now

The primary button's text and grey line were ~20 lines of branching inside `render()`. They are
`ctaLabel(act)` and `ctaSub(act, ctx)`, exported and DOM-free, and **both treat `kind: 'job'` and
`kind: 'page'` as the same thing**: a composed page. That is the whole mechanism by which the game
adds no word and no number to Home — there is no branch it could add one in.

| was | now |
|---|---|
| `else if (act.kind === 'job') sub.push(act.policy?.why ?? '')` | the `job` action falls into the PAGE arm: breakdown · `~N min` · `seed xxxxxx` · carried |
| the `> 24 chars` label trim ran only for `kind === 'page'` | runs for both, so the game's button cannot wrap to two lines at 375 |
| a local `const { q, ...rest } = composeOpts(save, { D })` | `plan.pageOpts(save, { D })` — one implementation for the three routes that start Today's Page |

The stale header comment about `data/job.js` / `job/econ.js` on Home's static graph went too: Home
imports neither, and has not since the demolition.

### `site/js/plan.js` — the gate

1. **`nextActionFor` returns the very object it was handed when `settings.game === false`.** Not a
   copy, not a copy with one extra key — identity. `settings.game = false` is byte-identical
   COMPOSED, and an action Home cannot distinguish is the strongest available form of that.
2. **`.board` is gone.** `nextActionFor` used to hang the policy on every action it returned,
   including on actions it otherwise passed through. The board panel it fed was demolished; nothing
   under `site/` has read `.board` since. Removed rather than carried.
3. **`jobAction` has no `sub`.** Its only value was `policy.why`, which is the string Home printed.
   `policy.why` stays as a DIAGNOSTIC (tests, console) and is documented as never copy.
4. **`pageOpts(save, opts)`** — NEW. `composeOpts` minus `q`. CUT-BRIEF's session shape is "same
   queue as Today's Page, same length, same items"; three routes start that page and two of them
   each kept their own copy of the drop-`q` line.
5. **Cut**: `quietLimit`, `nightBeforeDone`, `NIGHT_BEFORE_MINUTES`, `MORNING_MINUTES` — four
   exports, zero readers anywhere in `site/`, `tests/` or `qa/`.

Nothing else in `plan.js` moved. `workR`, `qFor`, `lowering`, `composeOpts`, `modeFor`, `pillsFor`,
`planFor`, `fillPlanStrip` are the study layer's and are untouched.

---

## 2. Exported API

### `site/js/plan.js` (game gate only — the study exports are unchanged)

```js
QUIET_HOUR: 22                        SCHOOL_WINDOW: { days:[1..5], fromMin:420, toMin:855 }
gameOn(save) -> boolean               // settings.game !== false
hasLiveJob(save) -> boolean           // !!save.inProgress.game
minuteOfDay(now?) -> 0..1439          isQuietNow(now?) -> boolean       inSchoolWindow(now?) -> boolean
pageOpts(save, { D? }) -> { tier4, microFlashOnly }        // composeOpts minus q — NEW
boardPolicy(save, { now?, today?, D?, mode? })
  -> { on, D, mode, today, now, quiet, school, post, kind, href, why }
     kind ∈ off | closed | nodate | post | morning | night | game;  post === true only for 'game'
     why  is a DIAGNOSTIC. Never render it.
jobAction(save, opts) -> null | { kind:'job', policy, href, label }     // label is the PAGE's own
jobEntryGate(save, opts) -> { allow, resume, redirect, why, policy, live }
nextActionFor(save, act, opts) -> act (identity) | { ...act, href:'#/run/job' } | job action
```

### `site/js/screens/home.js`

```js
CTA_LABEL_MAX: 24
EST_MIN: { 1: 0.5, 2: 1.5, 3: 3, 4: 5 }
estMinutes(queue) -> integer minutes
ctaLabel(act) -> { label, breakdown }          // breakdown is null unless the label was too long
ctaSub(act, { breakdown?, inProgress? }) -> string[]    // joined with ' · ' by the renderer
startedPhrases(started) / weakEmptyLine(kind, opts) / mountHome   (unchanged)
```

---

## 3. The assertions, and the numbers they produced

**`cd /Users/oliver/Projects/unit1a-quest && node --test tests/` is GREEN at the end of this lane:
1 588 tests, 118 suites, 1 584 pass, 0 fail, 4 skipped** (the same four Playwright-gated browser arms
the demolition lane recorded), 130 s. The baseline this lane started from was 1 391 / 0 fail; the
growth is this lane's 32 plus six other lanes' work landing in parallel.


`tests/cut-home.test.mjs` — **32 tests, all green.** The state sweep is `D × clock × switch × live
session` = `8 × 3 × 2 × 2` = **96 states** (`D ∈ {none, −1, 0, 1, 2, 4, 7, 14}`, clocks 06:30 / 10:00
/ 23:00). Over those 96 the gate produces **32 allows, 64 refusals, 4 distinct hrefs and 7 distinct
diagnostics**.

### A — the switch is a door

* `nextActionFor` returned the identical object in **432 / 432** checks (48 switch-off states × 9
  action kinds: resume, post, morning, night, warmup, boss, mock, missed, page).
* An off action's key set is exactly `['kind','label','href']` — no `.board`, no `.policy`, no `.sub`.
* A save with the game switched off but a live `inProgress.game` record still resumes the flat page,
  and the record is not deleted.

### B — the game adds no word and no number to Home

One save, cloned, the switch the only difference. Flipping it changes the HREF and nothing else:

| D | button | grey line | digits printed (on ≡ off) | href on → off |
|---|---|---|---|---|
| 2 | `RUN NEXT · 14 items` | `12 new + 2 variants · ~17 min · seed 17e01a` | 14,12,2,17,17,01 | `#/run/job` → `#/run/page` |
| 4 | `RUN NEXT · 14 items` | `12 new + 2 variants · ~17 min · seed a90859` | 14,12,2,17,90859 | `#/run/job` → `#/run/page` |
| 7 | `RUN NEXT · 13 items` | `11 new + 2 variants · ~19 min · seed 559f99` | 13,11,2,19,559,99 | `#/run/job` → `#/run/page` |
| 14 | `RUN NEXT · 8 items` | `6 new + 2 variants · ~13 min · seed f49037` | 8,6,2,13,49037 | `#/run/job` → `#/run/page` |

* the digit lists are compared as ordered multisets and are identical at every D (≥ 2 digits each, so
  the comparison is not vacuous);
* `on.page === raw.page` — the SAME object `page.nextAction` composed. The game never re-composes,
  adds, removes or reorders a question, and the button keeps the page's own label;
* all **7** gate diagnostics are absent from the rendered CTA, and `home.js` contains no `.why`, no
  `.policy` and no `board`;
* none of CUT-SPEC §6's game words (`pile`, `streak`, `not sure`, `pretty sure`, `sure`, `bank`,
  `pays`, `points`, `best`) appears on the CTA;
* the two numbers Home computes rather than quotes are pinned literally, because an on-vs-off
  comparison cannot catch a drift that moves both: `EST_MIN = {1:0.5, 2:1.5, 3:3, 4:5}`,
  `estMinutes([1,1,1,1,2,2,3,4,4]) = 18` (2 + 3 + 3 + 10), unknown tier → 1.5, `CTA_LABEL_MAX = 24`
  with the boundary inclusive (24 chars keeps the label, 29 splits it);
* and the renderer is pinned to those two functions — it assembles no sub-line of its own.

### C — no new route, and no refusal is a dead end

* `ROUTE_PATTERNS.length === 13`, read out of `app.js`'s source (importing `app.js` installs the
  trophy engine, which `tests/run.test.mjs` has to undo).
* Every href the gate can emit over the 96 states — `boardPolicy.href`, `jobAction.href`,
  `jobEntryGate.redirect`, `nextActionFor`'s output — matches one of the 13 patterns. The distinct
  set is exactly **`#/today`, `#/run/job`, `#/run/morning`, `#/run/night`**; `#/run/job` rides the
  existing `/run/:kind/:id?`.
* All **64** refusals name a study route and none is `#/run/job`; all **32** allows redirect nowhere.
* The 22:00 close stops a NEW session (`allow:false`, `redirect:'#/today'`) and never an old one (a
  live record at 23:00 is `allow:true, resume:true`).
* A live session resumes to `#/run/job` keeping `kind`, `label` and the key set of the study layer's
  own action; with no live session that action is returned by identity.

### One set of compose opts

* `pageOpts` has keys exactly `['tier4','microFlashOnly']` and no `q`, and equals `composeOpts`
  minus `q` at `D ∈ {none, 2, 7, 14}`.
* A lowered week really lowers: at `D = 2`, `qFor().warn === true`, `q = 40 → target 12`, and
  `pageOpts → { tier4: 1, microFlashOnly: true }`; at `D = 14`, `{ tier4: 2, microFlashOnly: false }`.
* `home.js` has exactly 2 `startPage(` calls and both read `startPage(s, planOpts(s, D))`.

### D — the plan cannot price anything

* `plan.js` imports nothing under `js/job/`; its one game import is `../data/job.js` (a constants
  file with zero imports of its own) for `WEEK`.
* It names none of `PAYS COSTS payOf costOf honestCall shouldPush BANDS econ pile`, and none of
  `contract crew guard wing token elo backcheck posted loot vault getaway`.
* `boardPolicy`'s only numeric fields are `D` and `now` — the calendar and the clock, no score.
* `quietLimit`, `nightBeforeDone`, `NIGHT_BEFORE_MINUTES`, `MORNING_MINUTES` are `undefined`.

---

## 4. Negative controls

Every assertion above was run against a deliberately broken build first. **22 mutations, 22 caught**
(scripts under the scratchpad; each one was applied to a file copy, run, and the file restored —
never `git stash`/`checkout`).

| # | mutation | caught by |
|---|---|---|
| N1 | game-off returns `{ ...act }` instead of `act` | identity (432 checks), and the live-session case |
| N2 | `.board` hung on the pass-through actions | live-session resume · "never taken over" |
| N3 | `ctaSub` returns `[policy.why]` for a job action | 5 tests incl. the diagnostic sweep and the source scan |
| N4 | job action pushes `pile 8` onto the sub-line | "not one digit moves" · the §6 word list |
| N5 | `nextActionFor` returns `{ ...act.page }` (a copy) | "the queue is the same queue" |
| N6 | the game's href becomes `#/game` | "every href … is one of them" (+ the on/off compare) |
| N7 | a refusal redirects to `#/run/job` | "a refusal always names a STUDY route" |
| N8 | `pageOpts` stops dropping `q` | "pageOpts is composeOpts without q" |
| N9 | one `startPage(s, planOpts(s, D))` → `startPage(s, {})` | "home.js starts every page through it" |
| N10 | `import { PAYS } from './job/econ.js'` in plan.js | the import scan + the vocabulary scan |
| N11 | the resume branch drops the `hasLiveJob` test | "a live session resumes into the game" |
| N12 | the 22:00 close is deleted from `boardPolicy` | "the 22:00 close stops a NEW session" |
| N13 | `composeOpts` ignores the lowering | "a lowered week really does hand the composer one tier-4 item" |
| N14 | `quietLimit` re-exported | "the dead week helpers are gone" |
| N15 | `.board` hung on the game-OFF path | identity + "the off action grows no key" |
| N16 | `.board` hung on the job action | "the ON action carries no `.board`" |
| N17 | `jobAction` regrows `sub: policy.why` | "the ON action carries no `.board`" (key-set check) |
| N18 | the game renames the button to "Play the game" | the on/off label compare · the digit compare |
| N19 | `EST_MIN[4]` 5 → 9 | the pinned-numbers test (an on/off compare alone did NOT catch this — which is why that test exists) |
| N20 | `CTA_LABEL_MAX` 24 → 30 | the pinned-numbers test |
| N21 | `ctaLabel` stops returning the breakdown | the pinned-numbers test |
| N22 | the renderer rebuilds the sub-line inline from `policy.why` | the source scan + the renderer-wiring test |

**N19 is the one worth reading.** An on-versus-off comparison is a tautology for any number the
switch does not move, so the two numbers Home computes itself are pinned literally. The previous
build shipped tests that could not fail; this is where this lane's could have.

---

## 5. Tests deleted, and two retargeted

**Deleted: none.** This lane cut four unused `plan.js` exports (`quietLimit`, `nightBeforeDone`,
`NIGHT_BEFORE_MINUTES`, `MORNING_MINUTES`); no test referenced any of them — `tests/plan.test.mjs`
never touched the week/game block, and the suites that did (`job-week`, `job-state`) were already
deleted by the demolition lane. Nothing was skipped or weakened.

**Retargeted: two assertions**, both source-text pins on the drop-`q` line that moved into
`plan.pageOpts`. Neither property was dropped; both got stronger.

* `tests/home-r2.test.mjs:145` — the literal `const planOpts = (save, D) => { const { q, ...rest }
  = composeOpts(...)` pin now pins `pageOpts(save, { D })`, **plus** a new
  `assert.ok(!/composeOpts/.test(home))` so home.js cannot regrow a private copy.
* `tests/integration-w4.test.mjs:89` ("the call sites drop `q` on purpose and say so") — the home
  and run pins now name `pageOpts`, **plus** a new behavioural assertion that
  `Object.keys(plan.pageOpts(fresh(), {}))` is exactly `['microFlashOnly','tier4']`, which a source
  regex could never prove. One dropped sub-assertion: a "no private copy of the drop-q line" grep
  that matched the *comments* explaining the change in both files — a test that fails on prose.
  `home-r2`'s `!composeOpts` check covers the same ground on the file this lane owns.

`integration-w4` is shared with the run lane; only the two lines above were touched. That lane
adopted `pageOpts` in `run.js` concurrently (see R3), which is why its half of that assertion needed
updating too.

---

## 5b. Verified in a real browser

`python3 -m http.server 8091 -d site` and Chrome, one save with `placement.done` and a test date
seven days out, the switch flipped between two reloads of `#/today`:

| `settings.game` | `.home-primary` href | label | `.home-cta-sub` |
|---|---|---|---|
| `true` | `#/run/job` | `RUN NEXT · 13 items` | `11 new + 2 variants · ~19 min · seed 0b531c` |
| `false` | `#/run/page` | `RUN NEXT · 13 items` | `11 new + 2 variants · ~19 min · seed 0b531c` |

Byte-identical but the href, including the seed — which is what §3's table asserts, now observed in
the paint rather than in the pure function. The only console errors are the two `sw.js` registration
failures `notes/DEMOLISH.md` §5 already records for the sandbox (`sw.js` serves 200 and
`tests/sw.test.mjs` is green). The fixture save was written back to its pre-test state afterwards and
the server stopped.

## 6. Requests

**R1 — `screens/job.js` (job-screen lane): the game composes a DIFFERENT page on a lowered week.**
`mountJob` calls `state.startJob(s, { now: Date.now() })` with no compose opts, so `startPage`
composes with defaults. Home composes with the plan's. Measured at `D = 2`: Home passes
`{ tier4: 1, microFlashOnly: true }`, the game passes nothing — two tier-4 items instead of one, and
every fourth new slot from the tier-1 pool instead of every second. CUT-BRIEF's session shape is
"same queue as Today's Page, same length, same items", and the plan strip promises the lowering in
print. Fix:

```js
import { gameOn, pageOpts } from '../plan.js';
...
update((s) => { if (state.stateOf(s)) state.resume(s); else state.startJob(s, { now: Date.now(), ...pageOpts(s) }); });
```

`pageOpts` is DOM-free and adds nothing to `screens/job.js`'s graph that `page.js` is not already
pulling in.

**R2 — `screens/job.js`: `#/run/job` has no entry gate.** `mountJob` checks `gameOn` and
`pageInProgress` only, so a deep link (or a bookmark) at 23:10 starts a new session that Home would
refuse. `plan.jobEntryGate(save)` is the one decision, already written and tested over all 96 states:
`{ allow, resume, redirect }`, where every refusal names a study route and a LIVE session is always
allowed to finish. Until it is adopted the 22:00 close is enforced on Home's button only, and the
function has no caller.

**R3 — `screens/run.js` (run lane): DONE, by that lane, while this one was running.** `run.js` now
reads `startPage(s, { ...pageOpts(s), now: startedAt })`. Two of the three routes are converged; only
the game's (R1) is left.

**R4 — `site/js/app.js` (shell lane): the header prints two numbers during play.** `hdr-readiness`
and `hdr-tminus` sit above the game strip's three, against CUT-BRIEF's "at most three numbers on
screen at once during play". Named in `notes/DEMOLISH.md` §6.5 and still open; not this lane's file.

**R5 — `site/data/job.js`: `WEEK.schoolWindow` has no reader.** `plan.inSchoolWindow` computes it
into `boardPolicy().school` and nothing reads that field. If no lane claims it, both can go.

---

## 7. Open issues

1. **`plan.jobEntryGate` has no caller** until R2 lands. It is tested, not dead by intent — but if
   the job-screen lane declines it, delete it rather than leave it.
2. **`boardPolicy().school` is computed and unread** (R5).
3. **There is no DOM-level test of Home.** The repo has no jsdom and BUILD-POLICY §2 forbids adding
   one, so the copy and number assertions run against the pure `ctaLabel` / `ctaSub` that the
   renderer calls, plus a source scan that pins the renderer to them (N22 proves that scan bites).
   A visual check of `#/today` with the game on and off is still worth one pass by the QA lane.
4. **`policy.why` is one careless line from being printed again.** It is documented in three places
   and grepped for in `home.js`, but the grep is scoped to this lane's file — a different screen
   that starts rendering a gate diagnostic would not be caught here.

---

# cut-home — ROUND 1 FIXER

**Lane** `home`, round 1. **Owns** `site/js/plan.js`, `site/js/screens/home.js`, `tests/cut-home.test.mjs`
(+ new `qa/cut-home.mjs`). **Authority** `designs/CUT-BRIEF.md` → `designs/CUT-SPEC.md`; `BUILD-POLICY.md` wins.

Three findings came in. **Two are fixed at the root. One is disputed on its remedy, not its
measurement, and the proof is below and executable in the suite.**

`cd /Users/oliver/Projects/unit1a-quest && node --test tests/` — see §R5 for the state of the tree.
`tests/cut-home.test.mjs` is **56 tests, 0 fail, 0 skipped** (was 32).

---

## R1. Finding 1 [MAJOR] — nothing carries to tomorrow. **FIXED.**

Home prints the best day. One line, one number, and that number is `save.player.best` verbatim.

```js
// site/js/screens/home.js
export function bestLine(save) {
  if (save?.settings?.game === false) return null;          // the switch is a door: no game, no line
  const best = save?.player?.best;
  if (!Number.isInteger(best) || best <= 0) return null;    // never banked a point → no number
  return COPY.best({ points: best });                       // CUT-SPEC §6 — `best 612`
}
```

Rendered as a **sibling of the CTA block**, in both paints (the cold-open placeholder render and the
composed one — a number a student acts on must not flicker in after the button resolves):

```js
best ? h('p.home-best.muted.fs-1.mono', { dataset: { slot: 'best' } }, best) : null,
```

Five decisions worth naming:

* **The string is not this screen's.** It is `COPY.best` out of `site/data/job.js` — CUT-SPEC §6's own
  words. Home reaches for exactly **one** entry of the game vocabulary and formats nothing itself, so
  it cannot invent a caption or a unit. (`data/job.js` has ZERO imports, so the static import costs
  Home's cold open one small constants module and no card or generator data.)
* **It is the number that survives the night, never the one that rolls over.** `save.game.today` is
  reset daily; printing it would put `today 0 points` on Home every morning. `home.js` now reads
  `player.best` in exactly one place and names `game.today` nowhere — both asserted.
* **`best 0` is not a line.** A student who has never banked a point sees no number at all, so the
  first thing the game says on Home is never a zero.
* **The switch is still a door.** `settings.game === false` prints nothing, at any score.
* **It is not on the button.** `ctaLabel`/`ctaSub` take an ACTION, never a save, so the best day
  cannot reach the CTA by construction; the round-0 assertions that the CTA is byte-identical with
  the switch on and off are untouched and still green.

**The lane's old headline property had to change, and did — honestly.** Round 0 documented "THE GAME
ADDS NO WORD AND NO NUMBER TO HOME". That is what made the reward invisible. The property is now
**"the game adds no word and no number to the BUTTON, and exactly one line to the screen"**, and the
browser arm measures that the line is the *only* difference a student can see between the two
switch positions — same label, same grey line, same seed. Nothing was softened: every round-0
assertion is still in the file.

## R2. Finding 3 [MAJOR] — a plan pill remounts Home and jumps the scroll. **FIXED.**

`app.js`'s global `sameRouteClick` is not this lane's file and is not gated on `settings.game`, so
it armed every decorative self-link in the study app. The half of the fix this lane owns is the half
that is right anyway: **a link to the screen you are on is not a link.**

* `plan.hereNow(loc?)` — NEW, pure, node-safe: the current route spelled the way a pill spells its
  destination (`#/today`), query dropped, `null` outside a browser.
* `pillsFor(save, { …, here })` gives every pill a `self` flag. `planFor` threads `here` through.
  **The destinations never move** — only whether they are rendered as links.
* `fillPlanStrip` derives `here` itself (`opts.here ?? hereNow()`) rather than taking an argument:
  Home's one call site is pinned verbatim by three suites I do not own (`fix5-home`, `cut-integrate`,
  `integration-w4`) and must not grow a parameter.
* A `self` pill is created as an `<a>` **with no `href`**. `sameRouteClick` matches `a[href]`, so it
  never sees one; the element stays an `<a>` so `screens.css`'s `.plan-pill a` styling is untouched
  (a `<span>` would have needed four selector edits in a file this lane does not own). The
  description moves to the `<li>` — a listitem announces an `aria-label`; an href-less `<a>` is
  generic and may not.
* Home's **fallback** strip (painted before `plan.js` loads) got the same rule. `mountHome` IS the
  `/today` screen, so there a page-day pill is always a link to here: `const href = k === 0 ?
  '#/morning' : k === 1 ? '#/night' : null;`

Measured in Chromium at 375×667 (`node qa/cut-home.mjs`), the critic's own probe:

| | before (mutation N-P1 below) | after |
|---|---|---|
| page pill has href | `true` | `false` |
| tapping it re-mounts Home | `true` | **`false`** |
| scroll | `939 → 0` | **`939 → 939`** |
| Night pill still navigates | `#/run/night` | `#/run/night` |
| self-href anchors left on `#/today` | 6 | **2** — `hdr-home`, `hdr-tminus`, both `app.js`'s (R7) |

## R3. Finding 2 [MAJOR] — the session is 13–19 questions / ~24 min against a brief of 8–12 / 10–14.

**The measurement is right and I reproduced it. The suggested remedy cannot be paid for out of this
lane, and the second option the finding offers — amend the brief's session-shape target — belongs to
the brief's owner. So: proved, bounded in a test, and filed as R8.**

Reproduced through the shipped composer (`node --test tests/cut-home.test.mjs`, block G):

```
fresh save, Today's Page = D=10 9q/14min · D=7 13q/19min · D=5 14q/17min · D=3 14q/17min · D=2 14q/17min
qa/fixtures/midweek.json  = 19q / 25min / 10 reviews
```
(stable across profile ids — only the seed tag moves — so the envelope is pinned literally.)

**Why the cap is not shipped.** Three sentences of CUT-BRIEF sit in the same paragraph as the target:
"Same queue as Today's Page, same length, same items", and (global rule) "The composer still owns
what is studied … it never chooses, adds, removes or reorders a question". So the game may not
shorten the page on its own — the page itself would have to be shorter, **for a student with the game
switched off too**, which is the one thing `settings.game = false` is promised not to be.

And `plan.js` has exactly one lever. `pageOpts` hands the composer `{ tier4, microFlashOnly }`;
neither is a length bound (block G measures that too). The only option that shortens a page is
`composePage`'s minute budget — and here is the sweep, on the very fixture `tests/home-r1.test.mjs`
pins ("the review block still leads — reviews are never dropped, only deferred", `review >= 10`):

```
minutes=  6  q= 9 est=11 review= 2   brief-window=true    review>=10=false
minutes= 10  q= 9 est=11 review= 2   brief-window=true    review>=10=false
minutes= 14  q=12 est=14 review= 3   brief-window=true    review>=10=false
minutes= 16  q=12 est=15 review= 5   brief-window=false   review>=10=false
minutes= 20  q=15 est=20 review= 6   brief-window=false   review>=10=false
minutes= 25  q=19 est=25 review=10   brief-window=false   review>=10=true      ← what ships
```

**Every budget that reaches the brief's 8–12 / 10–14 window cuts the review block from 10 to ≤ 3**,
and `minutes = 25` — no cap — is the only value that keeps it. The second half of the price, on a
fresh page day:

```
D=7  25min:13q/alg2   18min:12q/alg1   16min:11q/alg0   14min:10q/alg0
D=5  25min:14q/alg2   18min:14q/alg2   16min:13q/alg1   14min:12q/alg0
D=3  25min:14q/alg2   18min:14q/alg2   16min:13q/alg1   14min:12q/alg0
D=2  25min:14q/alg2   18min:14q/alg2   16min:13q/alg1   14min:12q/alg0
```

COMPOSED S7's **per-day floor of 2 M11/M12 Variants** — "keeps the doc's named algebra topic on the
plan" — survives at 18 minutes and is gone at 14. A 14-minute page reaches the brief's count and
drops the floor on every page day.

So the cap costs one test's stated study property and one COMPOSED guarantee, and it costs them for
a student who never turns the game on. That is not a fix at the root; it is the study layer paying
for a game number. **Not shipped.**

**What IS shipped is the bound the finding asked for**, and it is executable rather than a claim:

* the shipped envelope is pinned per `D`, so the session can only get SHORTER unnoticed;
* the session is asserted inside COMPOSED S1's own budget (`LIMITS.pageMax`, `LIMITS.minutesMax`);
* the game is asserted not to move it — the same queue, the same items, the same estimate with the
  switch on and off;
* and the conflict itself is a test: *no* minute budget reaches CUT-BRIEF's window while keeping the
  review block. **The day `page.js` can compose a 10–14 minute page without deferring a due review,
  that assertion goes red and the cap becomes available** — with a failure message that names this
  note. (Mutation N-C below proves it bites: smuggling `minutes: 14` into `pageOpts` turns five
  assertions red, including "CUT-BRIEF's window is not met", which is the one that says "re-read R8".)

Nothing about this makes the session short enough. See **R8**.

---

## R4. The API this round added

```js
// site/js/plan.js
hereNow(loc?) -> '#/today' | null          // the current route, query dropped; null under node
pillsFor(save, { today?, D?, target?, boss?, here? })   // each pill gains `self: boolean`
planFor(save,  { now?, today?, here? })                 // threads `here` to pillsFor
fillPlanStrip(wrap, save, opts)            // derives `here` itself; a self pill is rendered with no href

// site/js/screens/home.js
bestLine(save) -> 'best 612' | null        // CUT-SPEC §6 `COPY.best`, game-gated, 0 prints nothing
```

Unchanged: `workR`, `qFor`, `lowering`, `composeOpts`, `pageOpts`, `modeFor`, `boardPolicy`,
`jobAction`, `nextActionFor`, `ctaLabel`, `ctaSub`, `startedPhrases`, `weakEmptyLine`, `mountHome`.
**`pageOpts` still has exactly `['tier4','microFlashOnly']` and still drops `q`** (R3).

## R5. Tests: 24 added, **none deleted, none skipped, none weakened**

`tests/cut-home.test.mjs` 32 → **56**, four new blocks:

* **E — the best day is on Home** (7 arms): the switch is still a door at any score; `best 0` and a
  corrupt `player.best` print nothing; the number is `save.player.best` VERBATIM over six values and
  is the only digit on the line; the string IS `COPY.best`; `player.best` is read once and
  `game.today` never; both paints print it through `bestLine` and nothing else formats a score; it is
  a sibling of `.home-cta`, and the CTA functions take no save.
* **F — a self-link is not a link** (7 arms): `hereNow` normalisation incl. query and trailing slash
  and the node case; on `#/today` every page pill is `self` and the Night/Test pills are not; the
  rule follows the route (`here: '#/night'`, `'#/binder'`, absent); the long-week gap pill; `planFor`
  threads it and changes nothing else; the painter's four source pins.
* **G — the session's length** (6 arms): R3, executable.
* **H — measured in a real browser** (1 arm, Playwright-gated the way `tests/fix-stats.test.mjs` is):
  spawns `qa/cut-home.mjs` and asserts `ALL PASS` **plus five of its printed numbers**, so a pass that
  measured nothing cannot slip through. It RUNS here (chromium is installed); it skips in CI.

`qa/cut-home.mjs` — NEW, 17 measured checks. Harness copied from `qa/fix5-home-r3.mjs`: in-process
static server on port 0, Chromium 375×667, the save injected before the first script runs. **The
game-on and game-off renders are one CLONED save**, so the grey line is compared seed and all.

This round closes **round-0 open issue 3** ("there is no DOM-level test of Home") for the two things
that needed one. It does not add a runtime or test dependency: `qa/` is dev-only and already had
Playwright, and the arm skips without a browser (BUILD-POLICY §2 intact — no jsdom).

## R6. Negative controls — 5 mutations, 5 caught

Each applied to a **file copy**, run, then restored from the copy (never `git stash`/`checkout`/`reset`).

| # | mutation | caught by |
|---|---|---|
| N-P1 | `fillPlanStrip` restores `a.href = p.href` for every pill | the browser arm, with the critic's own numbers: `hasHref=true`, `remounted=true`, `939 → 0` |
| N-P2 | `pillsFor` marks every pill `self: true` | 3 pure arms in F + the browser arm (the Night pill would be deadened, so it stops navigating) |
| N-B1 | `bestLine` ignores `settings.game` | the browser arm: "game OFF: not a word of it — `best 612`" and "the ONLY thing the switch adds" |
| N-B2 | `bestLine` prints `best × 2` | E's verbatim arm (`best 1224` ≠ `best 612`) |
| N-C | `pageOpts` smuggles in `minutes: 14` | 5 assertions across the compose-opts block and G, including "CUT-BRIEF's window is not met…", whose message points at R8 |

N-B2 is the one worth reading: an on-versus-off comparison is a tautology for a line the switch
turns off entirely, so the best day is pinned against the engine's own value and against `COPY.best`,
not against itself.

## R7 / R8 / R9. Requests

**R7 — `site/js/app.js` (shell lane): the header chips are the last two self-links on `#/today`.**
This lane deadened the four plan pills. `hdr-home` and `hdr-tminus` still have `href="#/today"`, and
measured live they still do the damage the finding describes: `scroll 939 → 0, remounted: true`.
Either drop their `href` on the route they point at, or narrow `sameRouteClick` to opt-in
(`a[data-again]`), which is the better fix — it was added for the summary's "Another page" button
and currently arms every anchor in the study app. This lane's fix stands either way; the two are
independent, and the narrowing would make mine belt-and-braces rather than redundant.

**R8 — `designs/CUT-BRIEF.md` (brief owner, NOT a code lane): "Session shape" is not reachable.**
Its three sentences cannot all be true of this app: "same queue as Today's Page, same length, same
items" + "never … removes … a question" + "8–12 questions, 10–14 minutes". Today's Page is 9–14
questions / 14–25 minutes and every way to shorten it defers a due review (R3, with the sweep).
A decision is needed, and it is a product decision, not an engineering one:

* **(a)** accept the session as COMPOSED sizes it and amend the target to "8–14 questions, 10–25
  minutes, one sitting" — costs nothing, and block G already bounds it; or
* **(b)** accept a shorter page for everyone — one line, `minutes: 14` in `plan.composeOpts`, which
  lands every page day at 9–12 questions / 12–14 minutes — and accept its price: `tests/home-r1.test.mjs`'s
  "reviews are never dropped, only deferred" becomes false (10 → 3 on the midweek fixture) and
  COMPOSED S7's per-day algebra floor is dropped on every page day. **Both of those are somebody's
  authority, so a fixer must not choose (b) quietly; it needs the brief and COMPOSED amended
  together.** If (b) is chosen, three key-set pins must move with it —
  `tests/cut-home.test.mjs`, `tests/cut-integrate.test.mjs:82`, `tests/integration-w4.test.mjs:95`.

**R9 — `site/css/screens.css` (one line, already made and marked here per BUILD-POLICY §2).**
Appended in its own wrapper at the end of the file; it touches nothing else:

```css
/* === cut:home r1 === */
.home-best { text-align: center; color: var(--muted); }
/* === /cut:home r1 === */
```

## R10. Open issues

1. **The two header chips (R7)** are still live self-links on `#/today`; not this lane's file.
2. **The session length is unresolved by design (R8)** and is bounded, not fixed. Block G's
   "CUT-BRIEF's window is not met" arm is deliberately a to-do that fails loudly the day it is.
3. **`plan.js` still has no reader for `boardPolicy().school`** — round-0 R5, unchanged.
4. **`hereNow` reads `location` once per strip paint.** If a screen other than Home ever renders the
   plan strip, it gets the right answer automatically; if one ever renders it into a detached
   document, pass `here` explicitly.

---

# cut-home — ROUND 4 FIXER

**Owns** `site/js/plan.js`, `site/js/screens/home.js`, `tests/cut-home.test.mjs`. One finding.
`node --test tests/` green: **1836 pass · 0 fail · 4 skipped** (baseline before the change: 1829 / 0 / 4).
No file outside the three above was written. No `git` verb was run.

## R4-1. Finding 1 [MAJOR] — the primary button re-deals the page it just finished. **FIXED in the offer; the score half is R11.**

### Confirmed first, on the shipped engine

Driven through the shipped verbs plus `screens/job.js`'s own two hooks, in the order that screen
calls them (`startJob` → `captureJobBefore` → `call`/`answer` … → `endJob` → `commitJobRun`), on
`fresh()` + a test 7 days out + placement done:

```
lap 1: pts=546 today=546  best=546  n=13 pageIndex=1   HOME: kind=job href=#/run/job "RUN NEXT · 11 new + 2 variants"
lap 2: pts=546 today=1092 best=1092 n=13 pageIndex=2   HOME: kind=job href=#/run/job "RUN NEXT · 11 new + 2 variants"
lap 3: pts=546 today=1638 best=1638 …  lap 5: today=2730 best=2730
lap1 ids: not-03,fac-01,not-04,voc-01,fac-02,not-05,fac-03,voc-02,not-06,fac-04,ang-wu-1,T-sys#…,T-quad-solve#…
lap2 ids: not-03,fac-01,not-04,voc-01,fac-02,not-05,fac-03,voc-02,not-06,fac-04,ang-wu-1,T-quad-solve#…,T-sys#…
```

11 of 13 byte-identical; only the two generated variants re-seed, because the page seed is
`cyrb53(profileId|dayIndex|pageIndex)` and `pageIndex` is the one thing that moved. The critic's
17-item midweek save gives the same shape at 746 a lap. The student has just read every worked
solution, so lap 2 is played at q ≈ 1 against 264–397 for honest play of that page.

### The root, as this lane owns it

`boardPolicy` is the module whose whole job is *"what does the week allow right now"*, and it knew
about one clock (the 22:00 close) and nothing about the day's page being spent. So `nextActionFor`
turned **every** `kind:'page'` action into `#/run/job`, for as many pages as the study layer would
deal. `save.player.best` is the game's only reward (CUT-SPEC §8) and it was counting taps.

### The fix — subtractive, and an OFFER rather than a lock

```js
export const pageSpentToday = (save, today = todayISO()) => pageIndexFor(save, today) > 0;
…
if (pageSpentToday(save, today)) return { ...base, kind: 'spent', href: '#/run/page',
    why: "today's page is closed — an extra page is study, not a score" };
```

* `page.pageIndexFor` is the **study layer's own** count of pages closed today — the same number
  `pageSeed` deals from, so "Today's Page" is literally `pageIndex === 0`. Deliberately **not**
  `save.game.today > 0`: a module that can read a point can leak one onto Home (block D), and this
  question does not need one. `page.js` was already this file's import; the graph is unchanged.
* **Nothing is added and nothing is taken.** No number, no tap, no route, no copy, no new key on the
  action: over a spent day `nextActionFor` returns **the very object it was handed**, which is the
  shape the `settings.game = false` door already has. Measured live at 375×667 the button keeps its
  words and its numbers and only its href moves:
  `{"kind":"job","href":"#/run/job","label":"RUN NEXT · 13 items","sub":"11 new + 2 variants · ~19 min · seed 52c1de","best":"best 546"}`
  → `{"kind":"page","href":"#/run/page","label":"RUN NEXT · 13 items","sub":"11 new + 2 variants · ~19 min · seed 5d4e85","best":"best 546"}`
  (the seed differs because the page index does — the study layer's own number, on both routes).
* **The route is not gated.** `jobEntryGate` stays deleted, `screens/job.js` still refuses on its two
  doors and on no third, `#/run/job` still opens on a bookmark, and a LIVE session still resumes into
  it at every hour — `nextActionFor` answers the resume before it asks the week anything.
* Studying a second page stays free and is one tap away, on `#/run/page`, with the study layer's own
  label and sub-line.

## R4-2. Tests: 6 added, **none deleted, none skipped, none weakened**

`tests/cut-home.test.mjs` block **I — "the day's page is dealt once"** (59 → 66 assertions in the file):

| arm | what can be false |
|---|---|
| the week withholds the game over a closed page | `post`, `kind`, and that the withheld href is a STUDY route in the 13 patterns |
| …and the button is the flat page's **by identity** | all 9 action kinds — no copy, no extra key, no rename |
| yesterday's page does not spend today | the gate reads the calendar, not just `runs[]` |
| nothing is stranded | a live session resumes to `#/run/job` at 06:30 / 10:00 / 23:00; `screens/job.js` names neither `pageSpentToday` nor `pageIndexFor` (and the two matchers are proved non-vacuous against `plan.js`) |
| no number, no tap | the policy's numeric keys are still exactly `D` + `now`; the gate answers a boolean; `ctaLabel`/`ctaSub` are `deepEqual` to the flat page's |
| **measured** | a real session played to the end through the shipped verbs and `screens/job.js`'s two hooks: `#/run/job` before, `#/run/page` after, and the second page's items asserted to be the first's |

### Negative controls — 3 mutations, 3 caught

Each applied to a **file copy** of `plan.js`, run, then restored from the copy (never `git`).

| # | mutation | caught by |
|---|---|---|
| N-S1 | the `boardPolicy` branch deleted (the shipped round-3 code) | 4 failures: the policy arm, the identity arm, and the measured arm — *"Home re-dealt the page it had just finished"* |
| N-S2 | `pageSpentToday` → `pageIndexFor(…) >= 0` (always shut) | 12 failures across four blocks, incl. block B *"D=2: the game posts"* and block C *"0 offers, 96 withholds — both branches reached"* |
| N-S3 | the gate forgets the calendar (`runs.some(kind === 'page')`) | *"a page closed yesterday spends today"* |

N-S2 is the one worth reading: a gate that is always shut would "fix" the exploit and delete the
game, and it is the existing blocks — not the new one — that refuse it.

## R11. Request — `site/js/job/state.js` (engine lane). **NOT MADE: not this lane's file.**

**This lane closed the OFFER. The SCORE is still ungated, and that is the half the finding asked
for.** `bankPile` banks over any session, so a student who types `#/run/job` by hand still farms
`game.today` / `player.best` at 546 a lap. Home never points there any more, so it is no longer the
biggest button on the screen — but `best` is not yet a record either. The exact change, which is
the finding's own and needs no new field on any surface:

```js
// startJob(), beside the other record fields — a study fact, read once, at the instant the session opens
ip.game = serialize(freshState({ seed: ip.seed == null ? '' : String(ip.seed) }));
ip.game.banks = pageIndexFor(s, str(opts.day) ?? todayISO(new Date(now))) === 0;

// bankPile(s, g, day) — the pile still clears and the streak still resets; only `today` stops counting laps
const points = Math.max(0, int(g.pile, 0));
const scores = g.banks !== false;
const gm = gameOf(s, str(day));
if (scores) { gm.today = Math.max(0, int(gm.today, 0)) + points; p.best = Math.max(int(p.best, 0), gm.today); }
```

`pageIndexFor` is `js/page.js`, which `js/job/state.js` already imports, and it reads no game number,
so `guardSave` and the Law of Two Ledgers are untouched. `tests/job-save.test.mjs` owns
`serialize`/`freshState`, so the new scalar belongs in that suite's shape pin. Keep the gate on the
SCORE and not on the route: `screens/job.js` must go on mounting, or a bookmark becomes a dead end.

## R12. Open issues

1. **R11 is the other half and it is open.** Named above with the code; one file, one lane.
2. **`save.runs` is capped at 40** (`store.js CAPS.runs`, newest kept), so 40 runs of any kind in one
   day would age today's page record out of `runs[]` and reopen this gate. That is not a new bound:
   the same trim already moves `pageIndexFor`, and with it the page seed the composer deals from, so
   a day that long already re-deals page 0 on the flat route. Naming it, not papering it.
3. R7 (the two header chips in `app.js`), R8 (CUT-BRIEF "Session shape" is unreachable) and R10.3/10.4
   from round 1 are unchanged and still open.

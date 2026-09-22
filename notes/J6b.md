# J6b — The debrief

**The Page Summary IS the debrief.** Not a second summary screen: `renderSummary` with `ctx.job` set.
That is the only way G8's "byte-identical to the flat-path Page Summary with the layer off" can be
*structural* rather than a promise — the tile mint, the skill bars and the Readiness delta are built
by the **same three expressions** either way, and this ticket only adds sibling sections and holds the
summary's own cues back for the 600 ms of the bag drop.

---

## 0. Status of the inherited work — read this first

This ticket was started by an earlier lane that was killed mid-run (limits). It left, uncommitted:

* a substantially complete implementation in `site/js/screens/run.js` (the `=== J6b ===` block), and
* a complete-looking `tests/job-debrief.test.mjs` — **which was red: 29 tests, 16 pass, 13 fail.**

Liveness was verified before I claimed either file (memory rule *"verify lane liveness before
recovery"*): both were 3 days stale (Sep 18), `pgrep` showed no owning process, `ListAgents` showed no
peer holding them. I adopted them, fixed them, and vouch for the result below.

**Final: 30 tests, 30 pass, 0 fail.** Full suite `node --test tests/` → **2 212 tests · 2 208 pass ·
0 fail · 4 skipped, exit 0.** (The 4 skips are pre-existing `fix5-run` opt-in browser tests behind
`FIX5_RUN_BROWSER=1`; none of mine skip — the chromium half actually runs.)

### What was actually wrong, and why (all four causes were in the TEST, not the implementation)

| # | symptom | root cause | fix |
|---|---|---|---|
| 1 | 6 failures: `debrief.calls` empty, `baseBagged` undefined, decisions 2≠3, signature `JOB:?:0:0:0:0:0` | the fixture's `playJob` ended the last target with `push()`. `push` → `advance()` → `endJob()` → `finishPage()` **nulls `inProgress`**, so the trailing `debriefOf(save)` read a `freshState()` — an empty debrief. This is exactly notes/J6.md §5.3. | the last beat now closes through `state.endJob(save, finalWordOf(save))` — **the real screen's own path** (`screens/job.js finish()`), imported from `screens/job.js`, not a test-only shortcut |
| 2 | 4 failures: `cannot find const mintWrap = … /* skill bars`, `[data-drop]` not found, `JOB_COPY.walk` not found, `JOB_AUTO_BAG.walk` not found | all four needles/anchors live inside **comments or string literals**, and the tests grepped `strip(RUN_SRC)`, which deletes both. `stripCommentsAndStrings` also does not re-enter `${…}`, so `JOB_AUTO_BAG.walk` inside a template literal vanished too. These assertions could never have passed. | anchors and string-literal needles now read the **raw** source; the negative laws (`\bjob\b`) still read the stripped source, which is the correct way round — a prose "job" in a comment must not fail a law about code |
| 3 | the mint/bars/Readiness law banned `hold` outright | it contradicted acceptance #1: the skill-bar cue **must** start after the drop, or the drop is not the only thing animating. | the law is now precise: `hold` may appear **only** as `afterHold(hold, …)`'s delay argument, and may never be branched on (`hold ? …`). Byte-identity is about the markup, which `afterHold` does not touch |
| 4 | 3 browser failures | the fixture drew a **VAULT-8** (the seeded save happened to be boss-ready), so it printed `18 mandatory / 29 full use` instead of G1's JOB-10 row; it minted **no** tile, so "byte-identical mint" and "the summary's own cues were held" were both vacuous; the primary button sat at y≈9 953 in a 1 200 px viewport, so `elementFromPoint` returned `null` and read as "covered"; and the `position: fixed` count caught the **probe's own `#/settings` shell** (`.set-msg`), not the debrief | shape pinned to `JOB`; the fixture now applies the one Ledger-A write a mint *is*; the button is scrolled into view before the hit test; the fixed-element law is scoped to the rendered debrief (the body-wide version is J12's, in `job-juice.test.mjs`) |

---

## 1. What I built (on top of the inherited block)

### 1.1 The real rating delta — a defect I found and fixed inside my own block

`state.applyTarget` rewrites `player.rating.value` on **every staked target**
(`js/job/state.js` — `windowPush` → `ratingDetail` → `p.rating.value = detail.value`). `endJob` then
reads its own `ratingBefore` from that same field, *after* every call has already moved it. So

```
ratingAfter − ratingBefore  ≡  0.00      for every job, always
```

and the debrief printed `Called 2 · +0.00` no matter what happened. G5 #4 ("your rating is live … it
can go down, which is what makes it worth something") cannot be served by a number that is
structurally zero, so:

* `captureJobBefore()` now snapshots `rating: player.rating.value` at board time, beside the `tags`
  and `index` keys it already added (additive; `pageBefore()` validates only `skills`/`readiness`/
  `tiles`, so the flat path ignores it);
* `jobTakeBlock` prefers `ctx.before.rating`, falling back to `job.ratingBefore` when there is no
  snapshot.

Measured on the fixture: **before 5.00 → after 6.29, printed `Called 2 · +1.29`** (was `+0.00`).
A request to fix the source in `job/state.js` is in §5 — the workaround is deliberately written so
that fixing state.js makes it a no-op, and a test pins the degeneracy so it is noticed if it changes.

### 1.2 Everything the ticket names, and where it lives

| what | where | how |
|---|---|---|
| the debrief | `renderSummary(host, ctx)` with `ctx.job` set | one `const job = isObj(ctx.job) ? ctx.job : null` at the top; every flat-path line below is untouched |
| the take | `jobTakeBlock()` → `.sum-job-take` | BAGGED numerals, the fee line, `COPY.walk`, the rating delta, the split, the decision count, posted |
| the ledger | `jobLedgerBlock()` → `.sum-job-ledger` | both regret lines, the guard redraw, the Fault Index deltas, `COPY.ratingLine` / `leftOnPage` / `deflation` / `sealed` |
| the bag drop | `startBagDrop()` | per-glyph `translateY(-1.2em) → 0`, 40 ms stagger, `ANIMATION.bagDrop.ms` total, `fill: both` |
| "the only thing animating" | `holdEverythingElse()` | every other `document.getAnimations({subtree:true})` is **paused** for the duration and resumed after, except `[data-drop]` — the header column's half of the same cue |
| the realised order | `realisedOrderOf()` | the save keeps `{call, ok, w, skill, rung, d}` but not the pricing; one `mult = d / (ρ·m_chain·W)` per target reproduces Δ exactly at the realised chain **and** scales correctly at every other, which is all the solver needs |
| the BAG/PUSH vector | `inferDecisions()` | nobody records it; brute-force all `2^(n−1)` vectors (≤ 2 048 at 12 targets), keep those whose replayed BAGGED matches, tie-break to the **fewest** bags |

**The primary button is `Home`** and `Another board` is secondary (G6: *"the app never says 'one
more?'"*). `Today's Page` appears only when the job left targets.

---

## 2. Exported API (exact signatures)

```ts
// site/js/screens/run.js — all additive, all beside J6's KIND_META / DELEGATES entries
export const DEBRIEF_CALL_LADDER: Readonly<{ best: 'carry'; cost: 'rating' }>
export const jobSignature: (job: object) => string          // shape:outcome:targets:of:bagged:tGame:tAnswer
export function bagDropMs(): number                          // ANIMATION.bagDrop.ms, or 0 under reduced motion

export function realisedOrderOf(debrief, opts?: {
  decisions?: ('bag'|'push')[]; items?: object[]; guardWing?: string|null;
  qHatOf?: (call: object, i: number) => number|null;
}): { targets: object[]; decisions: ('bag'|'push')[]; completion: boolean; commit: boolean }

export function inferDecisions(debrief, opts?): {
  decisions: ('bag'|'push')[]; unique: boolean; candidates: number; target: number }

export function jobRegret(debrief, opts?): {
  order: object;
  bagpush: { line: string; cost: number; at: number|null };            // === econ.regretLine(order)
  call:    { line: string; envelope: number|null; called: number|null;
             evMax: number|null; cost: number; q: number|null };       // evMax === call.argmaxCall(q̂)
}

export function captureJobBefore(save, queue?: object[]|null): {
  skills; readiness: {r, provisional}; xp; coverage; tiles;            // the flat Page's five
  tags: string[]; index: object; rating: number;                       // the game's three
}                                                                      // idempotent; lands in inProgress.meta.before

export function jobSummaryContext(save, debrief, opts?: {
  queue?; before?; results?; elapsedMs?; decisions?; guard?; seedTag?;
}): object                                                             // a Page Summary ctx + {job, jobOpts}

export function renderJobSummary(host, ctx): void                      // === renderSummary(host, ctx)
export function startBagDrop(root, job, ms?): { cancel(): void; animations: Animation[]; held: number }
```

**`DEBRIEF_CALL_LADDER` answers notes/J2.md §5.7**, which asked J6b to pick a ladder and write it
down. The call-regret line names the **carry** argmax and costs it in **rating** credit, because that
is the only combination under which G5 #2's own worked line reproduces:
`argmaxCall(0.75) === 70` and `credit(.70, .75) − credit(.85, .75) = 0.3` — both pinned.

---

## 3. How to test it

```sh
cd /Users/oliver/Projects/unit1a-quest
node --test tests/job-debrief.test.mjs        # 30 tests: 24 pure + 6 chromium, ~4 s
node --test tests/                            # the gate
```

The chromium half **skips, never fails**, when Playwright or its browsers are absent (the same gate
`tests/job-screen.test.mjs` uses), so the suite stays green on a bare machine. It serves the **real**
`site/index.html` with three extra hosts, so the debrief is measured inside the document it ships in —
same theme, same header, same stylesheets in the same order — rather than in a stripped page where
"nothing else animates" would be free.

The module imports cleanly in plain node:

```sh
node --input-type=module -e "import('./site/js/screens/run.js').then(m=>console.log(typeof m.renderJobSummary))"
# → function
```

---

## 4. Acceptance — every criterion, with the number actually measured

| # | criterion | verdict | measured |
|---|---|---|---|
| 1 | the bag drop plays **ONCE** per job and is the **only** element animating while it runs | **PASS** | BAGGED `669` → **3** glyph animations; at t=250 ms **3 running inside `.sum-bag-digits` and 0 running anywhere else in the document**; **18** other animations held (9 `t16-mint-flip` + 9 `t11-sheen`) and **0** still paused at t=950 ms; a second `startBagDrop` for the same `jobSignature` returned **0** animations. Budget `600 ms`, `translate`+`opacity` only, `fill: both`; the last glyph lands **on** the budget (`dur = max(120, ms − stagger·(n−1))`). **0** `position: fixed` elements in the debrief |
| 2 | both regret lines equal `econ.regretLine` / `call.argmaxCall` for the **REALISED** order | **PASS** | `jobRegret().bagpush` is `econ.regretLine(order)` **verbatim** — `line`, `cost` and `at` all asserted equal, and the rendered `.sum-regret-line[data-kind=bagpush]` equals it byte for byte. The call line's `evMax === call.argmaxCall(q̂)` and its cost is `expectedCredit(evMax/100,q) − expectedCredit(called/100,q)` to `<1e-12`. Printed: `you bagged at chain 1; the threshold said push (q* 0.87, your q̂ 0.60). cost 9.` and `envelope 3: you called 85, EV-max was 50. cost 4.9 rating.` Played optimally (`econ.optimalOrder`) the BAG/PUSH line is **`''`** and its cost **≤ 1e-9** — the debrief teaches nothing when there was nothing to teach. The order itself is verified first: every target replays to its realised Δloose at its realised chain, and `playOrder` reproduces `baseBagged` (±1) and `finalBagged` (±2) |
| 3 | the split, the decision count (**24 mandatory / 35 full use**) and both accumulators print | **PASS** | `Split 34 % · 3:45 deciding / 7:20 thinking`; `Decisions 26 · 2.4 per item · 24 mandatory / 35 full use`; `bagged 669 · rating 6.29 (Called 2) · 7:20 thinking / 3:45 deciding · 26 decisions`. The published pair is `econ.decisionCount('JOB')` = `{mandatory: 24, full: 35}`, asserted; the measured 26 is G1's own arithmetic `1+1+calls+(calls−1)+briefs+1+backchecks`, asserted; `perItem 2.4 ≥ 2` (G9 #1's density floor); `wall === tGame + tAnswer` and `split === tGame/wall` to `<1e-12` |
| 4 | the tile mint, skill bars and Readiness delta are **BYTE-IDENTICAL** to the flat-path Page Summary with the layer off | **PASS** | the same ctx rendered three ways — `job` set, `job: null`, and `job: null, kind:'page'` — and `.sum-mint` / `.sum-skills` / `.sum-readiness` compared by `outerHTML`: **3/3 identical across both controls**. Not vacuous: **9** tiles minted (4 512 B of mint markup), **5** skill bars (1 946 B), Readiness `28→28 ±0` (412 B). Structural, not incidental: the three expressions contain **0** references to `job`, and `hold` appears only as `afterHold(hold, …)`'s delay — asserted in the source |
| 5 | the Fault Index deltas and the guard redraw render with **NO layout shift** | **PASS** | `PerformanceObserver('layout-shift')` over the render + the 600 ms drop + the release + the redraw: **CLS 0.000** attributable to `.sum-job-ledger`. **4** guard bars, all laid out at the **same height (19 px, 1 distinct value)** with only the fill transformed; percentages print `5 % · 58 % · 32 % · 5 %`, all matching `/^\d+ %$/`, none clipped (right edge 359 px against a 359 px container at 375 px, `scrollWidth − clientWidth = 0`). Fault Index prints exactly **3** facts (Sealed / Live / Resolutions), each carrying a delta |
| 6 | the debrief stays **interactive** during the bag drop | **PASS** | at t=180 ms, mid-drop: `elementFromPoint` at the primary button's centre resolves to the button itself (**not covered**), `focus()` moves (`activeElement === btn`), a `click()` reaches the handler with the right label, and the drop is **still running** at that instant — so the measurement is not vacuous. Primary button label is **`Home`** (G6). Nothing is disabled, no overlay, **0** `position: fixed` |
| — | `prefers-reduced-motion` | **PASS** | `bagDropMs() === 0`, **0** bag-drop animations created at all, the numerals are already final (`.sum-bag-digits` text === `.sum-bag-n` text), and the debrief's running-animation set is **deep-equal to the flat Page Summary's** rendered from the same ctx — the layer adds **no** motion. No horizontal scroll at 420 px or 375 px (`scrollX = 0`) |
| — | `node --test tests/` green | **PASS** | **2 212 tests · 2 208 pass · 0 fail · 4 skipped**, exit 0. My file: **30/30**. The 4 skips are the pre-existing `FIX5_RUN_BROWSER` opt-ins |

---

## 5. Requests for other file owners

### R1 — **BLOCKING the feature (not the tests): `screens/job.js` must mount this debrief.** → J6

`screens/job.js renderDebrief()` still renders its own placeholder panel, written when J6 shipped
("*G7 hands the Page Summary extension to J6b; until it lands this is the honest minimum*"). **Until
this lands, the real debrief is unreachable on `#/run/job`.** I did not make the change: it is ~5
lines across three places in a file I do not own, which is past BUILD-POLICY §2's one-line allowance.
It is mechanical — `job.js` already imports from `./run.js`:

```js
// 1. the import (line 41, already there — add three names)
import { renameCard, captureJobBefore, jobSummaryContext, renderJobSummary } from './run.js';

// 2. in mount(), right after startJob() and BEFORE the first answer:
const jobBefore = captureJobBefore(getState());
let jobQueue = state.queueOf(getState()).slice();     // endJob's finishPage() clears inProgress

// 3. renderDebrief() becomes:
function renderDebrief() {
  if (!debrief) { /* keep the existing "This job is over." panel */ return; }
  renderJobSummary(stage, jobSummaryContext(getState(), debrief, {
    queue: jobQueue, before: jobBefore, decisions: bagPushVector,   // decisions is OPTIONAL
  }));
  if (!bagDropped) { bagDropped = true; syncHeader(); }
}
```

`decisions` may be omitted entirely — `inferDecisions()` recovers the vector from the save. `queue`
and `before` are the only two that must be held across `endJob`. Note J6 §5.4 keeps the header in job
mode through the debrief, which is exactly right: `#hdr-bag` must exist for the drop's other column.

### R2 — `job/state.js`: `endJob`'s `ratingBefore` is degenerate → J5c

`applyTarget` writes `player.rating.value` on every staked target, so `endJob`'s
`const ratingBefore = num(p.rating.value, 5)` is already the *after* value and the debrief's rating
delta is structurally `+0.00` (§1.1). Fix: snapshot the rating in `startJob` (into `freshState`, e.g.
`g.rating0`) and have `endJob` report that as `ratingBefore`. When you do, `captureJobBefore`'s
`rating` key becomes redundant and my fallback picks up the real value automatically — and the pure
test *"the rating delta is the real one"* will fail on its own deliberate tripwire assertion, which is
the signal to delete the workaround.

### R3 — `job/state.js`: have `push()`/`crack()` return the debrief when they end the job → J5c

Restating J6 §5.3, because this ticket hit it too and it cost the inherited test file 6 failures: the
last target's `push()` ends the job through `advance()` → `endJob()` → `finishPage()`, which nulls
`inProgress`, so the caller gets a status object and the debrief is gone. Both the screen and this
test now work around it by calling `endJob(save, finalWordOf(save))` directly and duplicating
`advance()`'s word choice. One return value removes both duplications.

### R4 — `css/job.css`: adopt the debrief's inline layout as a marked block → J6 / J12

`jobTakeBlock` / `jobLedgerBlock` carry their layout as inline `style` objects
(`BAG_LINE_CSS`, `GUARD_BAR_CSS`, …) because `css/screens.css` and `css/job.css` belong to other
tickets and appending to either would make this screen's look have two owners (BUILD-POLICY §2). Every
value is a theme token and every bar is laid out at its final size, so the redraw shifts nothing
(criterion 5 measures CLS 0). If J12 wants them in `css/job.css` as `/* === J6b === */ … `, the class
names are stable: `.sum-job-take`, `.sum-bag-line`, `.sum-bag-digits`, `.sum-bag-digit`, `.sum-bag-n`,
`.sum-bag-fee`, `.sum-bag-bonus`, `.sum-job-walk`, `.sum-job-facts`, `.sum-job-ledger`, `.sum-regret`,
`.sum-regret-line`, `.sum-guard-bars`, `.sum-guard-bar`, `.sum-guard-track`, `.sum-guard-fill`,
`.sum-guard-pct`, `.sum-guard-note`, `.sum-index-facts`, `.sum-index-sealed`, `.sum-job-rating`,
`.sum-job-left`, `.sum-job-deflation`.

### R5 — record the BAG/PUSH vector in `inProgress.game` → J5c / J10

`inferDecisions()` exists only because the vector is not saved. It is exact for this fixture and
tie-breaks to the fewest bags, but it is `2^(n−1)` brute force and it is *inference*. One
`g.decisions: ('bag'|'push')[]` pushed in `bag()`/`push()` (≤ 12 entries, ~60 B, well inside
`CAPS.game`) would make the regret line a *reading* rather than a reconstruction. `jobSummaryContext`
already accepts `opts.decisions` and prefers it.

---

## 6. Open issues

1. **R1 is the one that matters.** Everything in this ticket is tested and green, but a student cannot
   see it until `screens/job.js` mounts it. The tests exercise `renderJobSummary` against the real
   shell, so they prove the surface works — not that it is routed.
2. **The `hold` pauses animations document-wide, not screen-wide.** `holdEverythingElse` scopes to
   `root.ownerDocument.body`. That is deliberate — "the only element animating" is unenforceable if a
   later ticket can add a cue outside the summary root — but it does mean a *shell* animation (a theme
   transition, say) is paused for 600 ms too. It is always resumed (`stillPaused === 0` measured), and
   `cancel()` resumes early. Flagging it because it reaches outside the ticket's own subtree.
3. **`deltaText` renders a fall with an ASCII hyphen (`-3`) while the rating delta uses U+2212 (`−`).**
   Pre-existing in `run.js` and identical on both paths, so out of scope here — but the debrief prints
   both conventions a few lines apart. Worth one line from whoever owns the copy lint (J12).
4. **The mint row overflows its container at 375 px** when 9 tiles are minted (the 5th tile clips). It
   is byte-identical on the flat path, so it is the existing `.sum-mint` block's behaviour and not this
   ticket's to change — but a job mints more tiles at once than a flat Page typically does, so the
   layer makes an existing edge case common. J13's visual QA should look at it.
5. **The split the fixture measures (34 %) is not G1's 43.2 %.** The fixture's phase durations are
   synthetic (`step(40000)` per answer), so its split is the fixture's arithmetic, not the product's.
   **J8 owns the real split acceptance** and measures it on a scripted walkthrough; this ticket asserts
   only that whatever `state.debriefOf` measured is what the debrief prints.

---

## 7. Deviations from COMPOSED-GAME

**None in the mechanics.** Every number the debrief prints belongs to `js/job/*` and is rendered, not
recomputed: `econ.regretLine`, `econ.decisionCount`, `econ.round`, `call.argmaxCall`,
`call.expectedCredit`, `call.rankNameFor`, `call.WINDOW_N`, `guard.guardDist`/`guardBars`,
`index.indexProgress`/`sealedOf`, and `data/job.js`'s `COPY`, `ANIMATION` and `AUTO_BAG`. No literal
is re-typed — `job-debrief` asserts the 600 ms budget, the stagger, the translate and the 50 %
auto-bank rate all come from `data/job.js`.

Three recorded departures, none of them a spec change:

1. **§1.1's rating-delta workaround** reads the before-snapshot instead of `endJob`'s `ratingBefore`.
   The spec says the debrief prints "the rating delta"; the source it was supposed to read is
   degenerate. Implemented the spec, filed the objection (R2).
2. **The inherited test file was rewritten in five places** (§0). It is a file this ticket owns, and
   every change made an assertion *correct*, not weaker: three of them (`[data-drop]`, the COPY
   templates, `JOB_AUTO_BAG.walk`) could not match against stripped source at all, and two were
   measuring the wrong thing (the probe's shell, an off-screen button). Two assertions were made
   **stronger** in the process — reduced motion is now compared against the flat path as a control
   rather than asserting a document-wide zero that T11's tile sheen has never satisfied, and the
   `hold` law now forbids *branching* on the hold rather than mentioning it. Four new assertions were
   added (the rating delta, pure and measured; the auto-bank literal ban; the `afterHold` law).
3. **No `position: fixed` is asserted over the debrief's subtree, not over `body`.** G12 #32's
   body-wide law during a *job* is J12's, in `job-juice.test.mjs`; asserting it here measured the test
   probe's own `#/settings` route. The debrief's own count is **0**, which is the clause J6b owns.

## 8. Files

| file | status | lines |
|---|---|---|
| `site/js/screens/run.js` | **extended** — the `=== J6b ===` block (adopted from the killed lane, corrected), `captureJobBefore`'s `rating` key, `jobTakeBlock`'s `ratingBefore` | 1 996 total; the J6b block is ~470 |
| `tests/job-debrief.test.mjs` | **owned** — 30 tests, 24 pure + 6 chromium | 770 |

Nothing else in the tree was touched. J6's `KIND_META` / `DELEGATES` / `RUN_KINDS` lines in `run.js`
are untouched. A J12 lane was live in this tree during the session (`notes/J12.md`,
`tests/job-copy.test.mjs`); the final gate was run after its most recent write and is green.

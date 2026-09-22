# screen lane — THE JOB game layer, fix round 1

Owner files: `site/js/screens/job.js`, `site/css/job.css`, and their own tests
(`tests/job-screen.test.mjs`, `qa/job-screen.mjs`). Nothing else was touched.

`node --test tests/` green. `node qa/job-screen.mjs --engines chromium --themes light` and
`--engines webkit` both **ALL PASS** with the three new measured rules below.

---

## 1. BLOCKER — q* was the ρ̄ = 1 brochure bound on every target (econ-math)

COMPOSED-GAME G3.2 quotes its threshold table "at `ρ̄ = 1` (the optimistic bound; the app computes
`ρ̄` per target from your own rung distribution and prints the true threshold)", and
`settings.js:458` repeats it to the student. `econ.breakevenQ` falls back to `ρ̄ = 1` when it is
handed no `rungs` (`econ.rhoBarFor(null) → 1`), and this screen handed it none.

**Fixed at the root, in `breakevenQOf()`** (`site/js/screens/job.js`): the call now carries

- `rungs: state.crew.bandFor(state.crew.mShownOf(save, t.make))` — G2's own reading of
  `save.cards[*].history` per make, interpolated between the three shipped bands, and
- `crew: t.crewInfo.forgives` — the rank the payout will actually honour, i.e. BARE on a target that
  is its own due review (the idle rule). Pricing at the *stored* rank would print a threshold the
  payout does not pay.

The branch (deep vs shallow) and the fee convention are untouched: they are G3.2's published closed
forms. Only `ρ̄` stops being a constant. `tests/job-screen.test.mjs` §5b asserts both arguments are
present AND that they move the number (`|q*(own) − q*(bound)| > 0.005`, and `q*(own) > q*(bound)`
because a real ρ̄ is below 1), so the fix cannot decay into a decoration.

Settings' *other* half — "the app prints your q* **before every bag-or-push**" — was also false: the
only surface carrying q* was the board's vault line, and `:has(.card-screen)` has already collapsed
the board to one 36 px strip by the time a payout is on screen. So the payout beat now prints its
own row (`.job-qstar`): `q* 0.82 at call 70 · your last 3 on PAIRS: 2/3`. It is evidence, never a
nudge — no verb, no named action; Global law 6 stays structural.

Side effect, deliberate: the two bare `?? 70` call literals are gone. `CALL_FALLBACK` is derived as
*the lowest rung in `CALL_LEVELS` with `P > 0`* (at call 50 the penalty is 0 and the deep threshold
degenerates to `q* = 0`, which would print a meaningless number), and the printed line now names the
call the threshold is quoted at instead of hiding the assumption.

## 2. MAJOR — `crewOrder` reached no student (crew-alignment)

`crew.js:578` documents `crewOrder` as "the crew grid's recommended order" and nothing outside
`crew.js` called it. **The only surface that can allocate crew is the brief window**, and it listed
makes in *queue* order, so G3.8's min-maxer could not follow their own step 5 without computing
`w · (1 − m/100)` by hand.

**Fixed in `crewBlock()`**: rows are now `state.crew.crewOrder(save, { shape, of: makesOnBoard })`,
and each row carries `m` and `crewValueDetail().score` — the sort key that ordering *is*, byte
identical to `readiness.weakSpots()`'s. A header line names it (`ordered by w × (1 − m/100)`), and a
legend line prints what a rung costs and does (`STEADY 1 pt forgives 1 rung · HELD 2 pts forgives 2
and holds the chain at 3+`), both read off `data/job.js` rather than re-typed. That also answers
player-feel's "PAIRS bare STEADY HELD with no cost, no effect, no legend".

Rendered at 375x667, in order: `CS-LIN m 20 · 7.24 · NOTE m 36 · 5.14 · PAIRS m 61 · 3.12 ·
QUAD-SOLVE m 50 · 2.00 · FAC2 m 80 · 1.20`. The key is `toFixed(2)`, not `econ.round(·, 2)`: round
drops trailing zeros and printed `2` beside `3.12`, which is the one thing a sort column must not do.

**Not fixed here, and not mine:** `stats.js`'s crew grid is still read-only and still in table order,
so `crew.js:578`'s "the crew grid's" is still imprecise. Request to that owner below.

## 3. MAJOR — the payout line and BAG were below the fold at every target (player-feel)

Measured before: payout line y = 1016, BAG y = 1100, in an 812 px viewport; the only control at rest
was card.js's sticky dock, relabelled PUSH, full width.

**Fixed as a layout rule, not a scroll call.** `.job-beat` is now `position: sticky; bottom:
var(--job-dock-h)`, and `screens/job.js` *measures* card.js's dock (`syncDockOffset()`, re-read on
every render and again from `applyResult`, because the dock's height changes with the key row).
`sticky`, never `fixed` — G10 #13's "the tile mint is the only full-screen moment" is untouched, and
the beat keeps its place in flow so nothing is permanently covered.

G10 #10 says the dock's Continue *is* the push tap. The beat also carried a `.job-push`, which had
been invisible only because it was 290 px below the fold; now that the beat rides the fold the two
would be adjacent, so `relabelContinue()` returns whether it really found the dock button, the beat
stamps `data-dock`, and `.job-beat[data-dock="true"] .job-push { display: none }` stands the twin
down. BAG has no twin — it is the button that was never on screen.

Measured after, at rest, no scrolling: payout line, q* line and BAG all inside the viewport at
**375x812 and 375x667**, beat 177–200 px, board still 36 px, 0 px horizontal overflow, chromium and
webkit.

## 4. MAJOR — the brief's Skip was ~680 px below the fold under a re-expanded board (player-feel)

Two rules, both in `css/job.css`:

- the board collapses at the brief exactly as it does at call-lock, keyed on `render()`'s own
  `[data-phase="brief"]` (it used to spring back to ~280 px of contracts between every target);
- `.job-brief > .run-actions` is sticky at the same measured `--job-dock-h`.

The pinned primary also takes the row (`flex: 1 1 auto`): `Enter` skips, so it is the beat's default
path, and a sticky footer holding one small left-aligned button reads as an accident.

Measured after: board 36 px at the brief; the brief's primary at bottom 802 of an 812 px viewport and
657 of a 667 px one — inside the fold at rest, at both heights. `node qa/layout-audit.mjs --only
job-brief` — **0 findings** over 17 viewports × 2 themes × 2 engines, plus the text-zoom and
reduced-motion passes.

## 5. MAJOR — the ≥ 1024 px rail did not exist (layout-safari)

G6: *"≥ 1024 px: the board lives in the 320 px right rail, permanently visible."* Shipped: no width
rule at all, and a 36 px strip at 1024/1440/1900/2560 px alike.

**Built.** `screens/job.js` now wraps the screen's children as `.job-body > (.job-board + .job-main)`
— `.job-main` holds the walk prompt, the stage and the beat — so the two-column form is CSS alone and
no renderer decides a width. `.job-screen` becomes the container `jobscreen` (keeping polish.css's
`run` name alongside it: the debrief IS a Page Summary and `@container run` styles `.sum-bar`), and
one `@container jobscreen (min-width: 896px)` rule gives the board its own `var(--job-rail)` track,
sticky under the header. The `:has(.card-screen)` / `[data-phase="brief"]` collapses are scoped to
`@container jobscreen (max-width: 895.98px)`, so the rail is never collapsed.

**Why 896 px and not 1024.** `job.css` may not read the window (LAYOUT-ROOT; the file still contains
zero `@media (min-width: …)`, which `tests/job-screen.test.mjs` asserts). `#view` caps at `--col`
(680 px) until base.css lifts it at a 1024 px window, where `.job-screen` measures **992 px**. So the
screen box is ≤ 680 px below G6's 1024 and 992 px above it — any threshold in that gap *is* G6's
1024, and 896 sits in the middle of it rather than on either edge.

Measured at 1280x900: board **320 px wide, 503 px tall, sticky, beside a 688 px reading column**,
0 px horizontal overflow, both engines. Screenshot in the round-1 scratch dir.

## 6/7/8 — not this lane, and one is already fixed upstream

- **#6 "0 ms idle" is x − x** — NOT fixed by me: the `run.js` owner had already landed a better fix
  while I worked. `captureJobBefore` now stamps `inProgress.startedAt` onto the before-snapshot and
  `jobWallMs(before)` measures it against `Date.now()`, with `sessionSplit(job, save, { wall })`
  taking the measurement as a third argument and reporting `idleMeasured`. I started a second clock
  in this screen, then **reverted it** — two clocks would have been worse than one, and their version
  survives `finishPage` where mine did not. The one thing this screen owes that fix is that it keeps
  handing the held `before` snapshot to `jobSummaryContext`; there is now a test pinning that, since
  the snapshot looks like it is only there for the skill bars.
- **#7 the RUN is credited the JOB's 65 s debrief** — `run.js:1911` still reads
  `means?.debrief` with `JOB_PHASE_MEANS.debrief` as the flat fallback. `run.js` lane.
- **#8 Home's first paint prints the brochure split with the board's `projected` label** —
  `home.js`. That lane is live in the file (line numbers moved under me while I read it).

## Requests to other owners

1. `site/js/job/crew.js:578` — `crewOrder` is now called by the brief window (the only allocable
   surface). The doc comment still says "the crew grid's recommended order"; either wire it into
   `stats.js`'s grid too, or reword to name the brief.
2. `site/js/screens/stats.js` — the crew grid is read-only and in table order. If it is meant to be
   the surface G3.8 talks about, it needs `crewOrder` and an allocation control.
3. `site/js/screens/card.js` — standing request, unchanged: a `continueLabel` option on the dock
   would remove `relabelContinue()`'s reach into `#dock`. This lane now also *measures* the dock's
   height (`syncDockOffset`); a CSS custom property published by the dock itself would be better
   than a `getBoundingClientRect()` per render.
4. `site/js/job/guard.js` — a comment reading "One good job re-arms it." briefly tripped
   `tests/job-copy.test.mjs`'s banned-phrase sweep (it greps the whole source, comments included).
   Already gone when I re-checked; flagging so it does not come back.

## What this lane did NOT change

No COPY entry was added or edited (`data/job.js` is another lane's file and mid-edit), so the two new
lines — the q* row and the crew order/legend rows — are composed locally, the way `renderGetaway`'s
and `renderBrief`'s ledger lines already were. If `data/job.js`'s owner wants them in the table, the
strings are `q* {q} at call {call} · {record}`, `ordered by w × (1 − m/100) — {n} makes left on the
board` and `STEADY {c} pt forgives 1 rung · HELD {c} pts forgives 2 and holds the chain at {n}+`.

## New assertions

`tests/job-screen.test.mjs` §4 (three tests) and §5b (five tests): the beat is sticky and offset by a
measured property; the brief collapses the board and pins its primary; the rail exists, is
`@container`-driven, keeps the `run` container name, and the collapse is scoped to the narrow form;
q* carries `rungs` + `crew` and those arguments move the number; the threshold row advises nothing;
the brief's crew block orders by `crewOrder` before it builds rows; the debrief passes the held
before-snapshot and computes no second split line.

`qa/job-screen.mjs` rules 6, 7, 8: the payout line / q* / BAG inside the viewport at 375x667 **and**
375x812 at every payout beat with no scrolling (the old harness only checked `.job-bag` *existed* and
then pressed `B` — existence is not reachability); the brief's board ≤ 36 px and its primary inside
the fold; the rail at 1280x900 beside the reading column, ~320 px, not collapsed, no overflow.

---

# screen lane — fix round 2

Owner files: `site/js/screens/job.js`, `site/css/job.css`, and their own tests
(`tests/job-screen.test.mjs`, `qa/job-screen.mjs`). Nothing else was touched. **Note for the next
reader: `screens/job.js` was being edited by another lane while I worked** (the week gate
`jobEntryGate` and the COMMIT watch landed under me mid-file); every edit here was surgical.

`node --test tests/` green. `node qa/job-screen.mjs` ALL PASS with two new measured rules. The
critic's own reproducer — `node qa/layout-audit.mjs --only job --vp 375x667,320x568,390x844 --engine
both --theme light --no-extra --inject "html{font-size:20px !important}"` — goes from **8 BLOCKERs to
0 findings, PASS**, and the un-mutated `--only job --engine both --theme both` sweep (44 rows) is 0
findings as well.

## 1 · MAJOR — the honesty apparatus had no caller (crew-alignment)

`alignmentFor` / the per-make encounter reality were computed in `crew.js` and reached no student.
Two additions to `crewBlock()`, both *evidence, never a nudge* (Global law 6 — `bestBuy` is still
**not** wired to a recommendation, and under the measured `e_held` it would have recommended HELD
points worth a fraction of a STEADY):

- **per row, what a point buys TONIGHT**: `CS-LIN m 20 · 7.24 2 left · forgives 1`. The second pair
  is this board's own count and the subset a crew would be awake for — G2's idle rule applied per
  target, using `isIdleFor`'s test *minus its rank gate*, because `isIdleFor` answers `false` for an
  unmanned make ("no crew → nothing to stand down"), which is the one reading that cannot inform a
  purchase. Measured on the shipped brief fixture: `PAIRS m 61 · 3.12 1 left · forgives 0` — the
  third row of the recommended order buys nothing at all tonight, and now says so.
- **`alignmentFor(save, {shape, of: onBoard}).threshold`**, in the `w × (1 − m/100)` units the sort
  column is already printed in, beside the ordering label: *"a HELD point prices at 1.24 in the same
  units — the study ordering leads it"*, or *"no HELD point is buyable on this board"*.

## 2+4 · MAJOR/BLOCKER — the brief shipped 4 of G1's 5 options (exploit-hunt, player-feel)

`swapRows()` renders one row per `state.swapOptions(save)` entry, taken through
`takeBrief({ swap: { id } })`. Rendered, at 375x667:
`Swap in D · NOTE · +1 target · posted 232 (+15 % declined)`. Clicked, measured through the machine:
targets 8 → 9, queue 12 → 13, posted 349 → 370, bench 2 → 1, picks 3 → 4, phase → envelope. So
`DECISIONS.briefOptionsMax = 5` and the debrief's "35 full use" are reachable counts now, and no
constant had to be lowered to make the printed number true.

**The direction of `DECLINE_PRICE` is NOT mine to decide and I did not touch it.** G1 publishes
`+0.15 posted` twice and `state.js`/`data/job.js` implement exactly that, so the row prints it as
the `+15 %` it is. The exploit-hunt sim (take-every-swap ×1.148 over skip-every-brief) is a real
question for the econ/state owners — see Requests. Leaving G1's fifth option unreachable was not an
answer to it.

## 3+13 · BLOCKER/MAJOR — the ladder line credited a crew that did not exist

`ladderLineOf` now reads `p.target.crewInfo.forgives` — the forgiveness the payout actually applied,
idle rule included:

| forgives | line |
|---|---|
| 0 | `attempt 2 · ρ 0.45 · +29 loose` — why ρ moved, and nothing else (`hint` at rung 1) |
| 1 | `COPY.ladder(...)` verbatim, with **STEADY** in the crew slot, as G6's copy table prints it |
| 2 | `attempt 3 · crew HELD forgave 2 rungs · ρ 0.70 · +29 loose` |

`COPY.ladder`'s hardcoded "forgives one" is true of exactly one rung, which is why HELD is composed
locally rather than rounded down to a number the ρ beside it disproves. notes/crew-fix.md R8 is
closed from the caller's side; the copy entry itself is `data/job.js`'s (Requests).

## 5 · MAJOR — the collapsed board line lied about your tokens

`collapsedLineOf(g, wing)` takes the wing of the target ON SCREEN (`env.wing` while a stem or its
payout is up, `pricedTarget().wing` between targets) and prints THAT wing's own token count and own
multiplier: `RECALL ×1.25 ⟨1⟩ · loose 0 · ×1.0 · chain 0`, and `WORDS guarded ×0.55 ⟨0⟩ · …` on the
guarded wing, where G3.4 voids the tokens. It used to print `g.guard.wing` — a property of the job,
not of the question — with the SUM over every wing as the ⟨n⟩. The trailing `×` and `chain` stay the
pair G6's own example prints (`RECALL ⟨2⟩ · loose 131 · ×1.8 · chain 4`: `×1.8 = chainMult(4)`).

## 6 · MAJOR — a hint's price, printed before the hint (Global law 6)

`sayHintPrice()` runs when the stem opens: **`hints are free · this one costs 8 of 28 loose`**,
measured live off `econ.settle` at rung 0 against rung 1 on the priced target, at the call the
student locked. A crew rank that forgives the first rung prices it at 0 and the line stays silent
rather than repeating G3's 30 % brochure figure. It is on the job's own live region because
`screens/card.js` is another lane's file — the hint header itself needs a `hintNote` option
(Requests). No stakes (CALL IT, the 22:00 close) ⇒ no price.

## 7 · MAJOR — three sentences, at the three surfaces this screen owns

- the board, while the draft is live: *"take 3 of these — you answer every lock in the ones you take"*
- the press panel, above the tokens: *"a token is +25 % on that wing's loot · the guard takes one
  wing tonight, and tokens on it are void"* (`GUARD.tokenBonus`, not a typed 25)
- the FIRST envelope only: *"call how sure you are — a higher call pays more and costs more"*

`screens/onboard.js` is another lane's file and the critic's headline half — a first-run explanation
of the layer — belongs there; this is the in-place half, which is the half that survives skipping.

## 8 · BLOCKER — the app's one horizontal scroll, at 125 % text

`.job-contract`'s FALLBACK is two tracks now, with the price on its own row
(`"key name" / "key meta" / "key posted"`), and one `@container job (min-width: 30ch)` rule puts it
back beside the name the moment the row has the width for it. The file's stated invariant ("every
text track has a ch floor … so a floor can never be wider than the grid it sits in") was true per
track and false in sum: `2.5ch + 12ch + a nowrap auto` resolved `31.2 + 149.8 + 120.4 + 2×10 gap =
321 px` inside a 279 px box at 320×568 with `html{font-size:20px}`. Bounding the SUM is the fix.

`ch` is the unit that makes ONE rule cover both ends, because it scales with the student's own text
size. Measured, `.job-board`'s inner width in its own `ch`:

| viewport / text | ch | form | row height | document |
|---|---|---|---|---|
| 375×812 @ 100 % | 31.5 | `key name posted` | 58 px (unchanged) | 375 |
| 320×568 @ 100 % | 26.0 | stacked | 102 px | 320 |
| 375×667 @ 125 % | 25.4 | stacked | 96 px | 375 |
| 320×568 @ 125 % | 21.0 | stacked | 115 px | 320 |

The tracks sum to ~26.5 ch at their floors, so 30 ch is a measured threshold, not a taste — and the
default phone keeps the compact card it always had. `.job-bar` and `.job-token` were re-measured
under the same mutation and are clean (0 findings, both engines, five viewports).

## 9 · MAJOR — the 264 px sheet, and a focus that scrolled itself off screen

- **the sheet exists**: `max-block-size: min(var(--job-board-sheet), 38dvh)` + `overflow-y: auto` in
  the narrow container block, with `--job-board-sheet: 264px` = `LAYOUT.boardSheetPx`. G3.6's "exact
  remaining composition" is all still there — it is read by scrolling the SHEET, not the page.
  Measured: board 477 → **253.5 px** at 375x667, 264 at 375x812, and every decision control inside
  the viewport at rest (`.job-call` first AND last rung, `.job-crack`, `.job-walk`).
- **the landscape phone**: at ≤ 520 px of height a sheet and a decision do not both fit (the rungs
  measured 456–515 of 390 with a 148 px sheet), so the decision phases get call-lock's own one-line
  strip and the panel tightens one step. A `max-height` query is the one measurement a container
  cannot make; no column in this file is decided by the window, and the min-width count is still 0.
- **the focus**: `afterBeat()` scrolls to the top BEFORE the beat paints (it used to focus
  `.job-call` and then `scrollTo(0, 0)` two statements later, leaving the ring 142 px below the
  fold), and `focusFirst` now calls `ensureInView`, which moves the page only when the focused
  control is actually outside it.
- `position: sticky` was deliberately NOT added to the narrow board: a sticky grid item can only
  travel inside its own grid area, and in the one-column form that area is the board itself. The
  rail (≥ 896 px) is where the sheet really is sticky, and it already was.

## 10 · MAJOR — `phaseMeans.guard` is a measurement now

`startOrGo` runs `startJob(now: boardAt)` → `state.tick(s, 'guard', pressAt)` → `beginTargets(now)`,
so `ph.board` banks the board read and `ph.guard` banks the press. The boundary is `touchPress()` —
the student's own first token bump or wing key. Nothing about the game's order moves: the press is
still sealed before the guard draws, the walk drivers still reach the first envelope in one tap
(`qa/job-walk.mjs`'s pinned cold-open path presses Enter exactly once), and a student who accepts the
posted mix without touching it presses at `now`, so `guard` observes 0 and `foldMean` ignores it —
their whole read stays in `board` rather than a beat being invented for them.

Measured on the real screen (read the board 2.2 s → touch the press → work it 1.6 s → primary):
`ph = {board: 3513, guard: 1634, brief: 0, getaway: 0, debrief: 0}`, `tGame 5147`. Before this,
`ph.guard` was `0` after every job the app could play.

`tests/job-screen.test.mjs` now asserts that **every** phase `PHASE_MEANS_DEFAULT` claims to measure
is reachable from a call this screen actually makes, so the next phase to lose its call site fails
this file instead of quietly becoming a constant.

## 11 · MAJOR — the debrief read is banked on unmount

`state.closeDebrief(getState(), { now })` in the screen's teardown, before `flush()` — the half of
state.js:1588's stated contract that did not exist. `startJob` stays the backstop for a tab that is
closed rather than navigated. Without it the only observation ever folded was `now(next startJob) −
debriefAt`, clamped at `4 × 65 = 260 s`, so identical 18.2-minute evenings advertised ~17 min on
night 1 and ~20 min on night 8.

## 12 · BLOCKER — a MISSED vault was recorded CRACKED

`finalWordOf` is `state.advance()`'s expression, term for term: `g.last?.ok` decides CRACKED vs
**KNOCKED**, and `g.quiet` decides QUIET22 vs CALLED. `OUTCOMES.KNOCKED` was unreachable in the
shipped app, so `records.cracked`, the debrief, `game.log` and the "1 per vault cracked" Backcheck
all counted G1's *Knocked* as a success, and a 22:00 close was filed under `records.walked`.

## 14 — NOT FIXED, and not fixable inside this lane

The VAULT's final target does not delegate to `screens/boss.js`. Wiring it is a THREE-file change and
two of the three are other lanes':

1. `screens/job.js` (mine) navigates to `#/boss/<bossId>?job=1` at the vault beat — but nothing in
   the layer maps a vault to a boss id (`board.vault` is a CARD id; `page.bossReady(save)` is the
   gate G7 names), and navigating away DESTROYS this screen, so the crack's result cannot come back
   through a closure.
2. `screens/boss.js` must write its result where the job can find it on resume — there is no such
   write today. Its own comment says the record comes back "through the `onFinish` hook that already
   existed", but `onFinish` is an option of `createBossRun`, not something a hash navigation carries.
3. `js/job/state.js` needs the handoff slot (e.g. `inProgress.game.pendingBoss`) and the rule that
   `applyTarget` prices a result that arrived from outside the screen.

Half-wiring it would leave a job mid-flight with an unpriced target, which is strictly worse than
today. So: request below, and the alternative the critic offers (amend G7/G8's two lines and delete
`boss.js`'s dead `VAULT_QUERY` / `VAULT_BACK` / `isVaultRun`) is a decision for the doc's owner.

## Requests to other owners

1. **`site/data/job.js`** — three strings this screen composes locally because that file was mid-edit
   in another lane. If its owner wants them in the table:
   `ladderBare: ({why, rho, loose}) => \`${why} · ρ ${rho} · +${loose} loose\``;
   `ladderHeld: ({why, rank, n, rho, loose}) => \`${why} · crew ${rank} forgave ${n} rungs · …\``;
   `hintPrice: ({cost, clean}) => \`hints are free · this one costs ${cost} of ${clean} loose\``;
   plus the swap row and the two crew lines. `COPY.ladder`'s "forgives one" should also take a count.
2. **`site/js/job/state.js`** — export the terminal-word expression (`advance()`'s `word`) so
   `finalWordOf` and `advance` are one definition rather than two that agree. Also: `press()` accepts
   phase `'guard'`, which is a press AFTER the draw; it is unreachable from this screen today (the
   board → guard → envelope transition happens inside one `update`), but it is a hole.
3. **`site/js/job/econ.js` / `state.js`** — `DECLINE_PRICE = +0.15` makes a swapped-in contract pay
   MORE, and G1 publishes both "+0.15 posted" and "a decline is a trade, not a free spin". Now that
   the button exists, that tension is live: exploit-hunt measures ×1.148 for taking every swap. If
   +0.15 is meant to be a cost, the return price is `posted / (1 + DECLINE_PRICE)`.
4. **`site/js/screens/card.js`** — a `hintNote` (string) option on the card view, printed in the hint
   rail's header, so the live price sits on the control it prices instead of on the job's live line.
   (Standing request from round 1 for `continueLabel` still open.)
5. **`site/js/screens/boss.js` + `COMPOSED-GAME.md` G7/G8** — finding 14 above.
6. **`site/js/screens/onboard.js`** — the first-run half of finding 7: nothing in that file mentions
   the job, loose, bagged, the guard, the crew or the chain.

## New assertions

`tests/job-screen.test.mjs` §5c (15 tests): the ladder line's three branches and the two silences;
`finalWordOf`'s four words against the table; the brief renders `swapOptions` and the option count
equals `DECISIONS.briefOptionsMax`; the crew grid calls `alignmentFor` and counts tonight's targets;
one teaching sentence per verb, each reading its own constant; the hint price is `settle(rung 0) −
settle(rung 1)` and that arithmetic IS G3's published 30 %; **every phase in `PHASE_MEANS_DEFAULT`
is reachable from a call in this file**; `closeDebrief` runs before `flush()` on unmount; the scroll
precedes the paint; the sheet cap, the height query and the two-track contract row.

`qa/job-screen.mjs` rules 10 / 10b: the first AND last call rung, and CRACK/WALK, inside the viewport
at rest at **375x667 and 844x390**, no scrolling, both engines — plus the sheet re-measured at the
envelope on both, against `LAYOUT.boardSheetPx`.

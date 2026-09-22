# J5c — The job state machine

**Ticket:** J5c of the THE JOB build (COMPOSED-GAME.md G1 "Core game loop and session shape").
**Authority:** COMPOSED-GAME.md (G1 G2 G3 G7 G8 G10), under BUILD-POLICY.md (which overrides it) and
COMPOSED.md (the study layer, untouched).
**Read first:** notes/J1.md (econ), J2.md (call), J3.md (guard), J4.md (crew), J5.md (board),
J5b.md (supply), J10.md (save).

**Files written**

| file | what |
|---|---|
| `site/js/job/state.js` | **new** — 1 278 lines, 67 exports. The machine. DOM-free. |
| `tests/job-state.test.mjs` | **new** — 53 tests in 10 suites: the machine and its eight laws |
| `tests/job-ledger.test.mjs` | **new** — 13 tests in 2 suites: **the load-bearing test of the layer** |

Nothing else was touched. `site/sw.js` already listed `js/job/state.js` (another lane's
`node qa/gen-precache.mjs` run picked it up); I re-ran the generator and it reported *up to date
(125 files)*, so no edit was needed.

**Suite:** `node --test tests/` → **2 018 tests · 2 014 pass · 0 fail · 4 skipped**, exit 0.
The baseline before this ticket was 1 870 / 1 866 / 0 / 4; the growth is this ticket's 66 and J7's,
which landed in parallel. *(A mid-run snapshot caught J7's lane between two writes —
`tests/job-index.test.mjs` expected `${CHAIN.slope}` while `data/job.js` ships `CHAIN.step` — and
went red for one run. J7 fixed it in their own file; nothing of mine was involved and nothing of
theirs was touched. Proof of independence, kept because it was checked:
`tests/job-index.test.mjs`, `site/js/screens/settings.js` and `site/js/job/index.js` contain **zero**
references to `state.js`, and settings.js's only job-layer imports are `job/call.js`, `job/econ.js`
and `data/job.js`.)*

---

## 1. What was built

`site/js/job/state.js` is G1's loop as a machine, and the screen (J6) is a thin renderer over it:

```
board → guard → envelope → call → answer → payout → bag/push → brief → getaway → debrief
```

Every decision is a function; every number the screen prints is derived here; the DOM is J6's alone.
The file imports `page.js`, `board.js`, `econ.js`, `call.js`, `crew.js`, `guard.js`, `data/job.js`,
`days.js` and `data/cards.js` (for `qHatFor`'s index — `board.js` already pulls it, so the graph does
not widen). It imports nothing from `screens/` and nothing from `store.js`.

### The eight laws, as mechanisms

| law | the mechanism (not the convention) |
|---|---|
| **Two Ledgers** | every exported mutator runs against `guardSave(save)`, a Proxy that **throws `LedgerError`** on any write reaching `cards`, `skills`, `xp`, `errors`, `forecastLog` (+ `variants`, `frozen`, `daily`, `runs`, `trophies`) **at any depth**. Ledger A is written by `screens/card.js` at grade time; this module receives card.js's own `result` object and prices it. |
| **Answers tick, time does not** | the only clock reads are `setPhase`'s two accumulators, the `at` stamps, and the job's **pinned start date** (`guard.drawnAt`) that `cold` is priced against. `pricedTarget` refuses the live clock. |
| **LOOSE floors at 0** | every loss goes through `econ.missFor` (capped at LOOSE) then `econ.applyDelta` (floored at 0). `bag`/`endJob` only ever **add** to BAGGED. |
| **The sealed envelope** | `envelopeFor()` returns a **frozen** object carrying no `id`, `item`, `template`, `seed` or `params`; `stemRefFor()` returns `null` in the `envelope`/`call`/`board`/`guard` phases. The screen cannot render a stem it cannot address. |
| **CALL IT** | `canCallIt` gates on `loose === 0 ∧ chain === 0 ∧ targetsLeft ≥ STATES.CALL_IT.minTargetsLeft`; `callIt()` sets `stakes = false`, `posted = 0`, and the queue runs on. `hintsOn()` is the **constant `true`** — a function, so no screen can gate on a variable. |
| **50 % auto-bag** | `bankOnExit()` is the single exit table; `walk()` with no `bagFirst` uses `econ.autoBank(s,'walk')`. |
| **Mid-job reload** | `serialize`/`deserialize` round-trip J10's sixteen keys plus seven, with the seed pinned. |
| **Nothing auto-advances** | `applyTarget` stops at `payout` and returns; `bag()`/`push()` occupy the continue tap. |
| **One path to the schedule** | `requeueReview` → `markItem` per target, `finishPage` at completion — `page.js`'s own functions, in `run.js`'s own order. A job abandoned with targets left **deletes `inProgress.game` and leaves `inProgress` a plain page**, so the rest of Today's Page is one tap away. |

### The record

`inProgress.game` carries **J10's sixteen keys, then seven more**, in that order:

```
shape seed bundles picks tokens guard loose bagged chain calls briefs vault tGame tAnswer phase phaseAt
stakes outcome locked posted bc last ph
```

* `stakes` false after CALL IT / the 22:00 close · `outcome` the terminal word · `locked` the call
  locked for the current target (the seal) · `posted` the job's posted total (the log, the Elo
  outcome and the heat window all need it) · `bc` Backchecks spent this job · `last` the payout
  beat's undo record (what a Backcheck actually operates on) · `ph` the five per-phase wall-clock
  accumulators that feed `game.ledger.phaseMeans`.
* One job call record is `{call, ok, w, skill, rung, d, at}` — seven fields, the same width as J10's
  fixture. `player.rating.calls[]` stays `call.callEntry`'s five.
* Measured cost of the seven extras on a 12-target worst case: **282 B** (16 keys 3 614 B → 21 keys
  3 896 B), i.e. **+314 B** against J10's own fixture (3 582 B). J10 left **425 B** of headroom under
  the ≤ 25 KB bound, so **111 B remain**. See §7 → J10.

---

## 2. Exported API — exact signatures

```js
/* ---- the guard (the Law of Two Ledgers) ---- */
export const LEDGER_A_KEYS: readonly string[];      // cards skills xp errors forecastLog variants frozen daily runs trophies
export const LEDGER_B_KEYS: readonly ['player','game'];
export const SHARED_KEYS:   readonly ['inProgress','counters'];
export class LedgerError   extends Error { path: string }
export class JobStateError extends Error { code: string }
export function isProtectedKey(k: string): boolean
export function guardSave(save: object): object      // idempotent, identity-stable, cached per save
export function unguard(save: object): object

/* ---- the record ---- */
export const EXTRA_KEYS: readonly ['stakes','outcome','locked','posted','bc','last','ph'];
export const STATE_KEYS: readonly string[];          // = [...IN_PROGRESS_KEYS, ...EXTRA_KEYS]
export const PHASES;  export const TERMINAL_PHASE = 'debrief';
export const OUTCOMES = { COMPLETED, CRACKED, WALKED, QUIT, CALLED, COMMIT, QUIET22 };
export const CALL_DEFAULT = 50;
export function freshState(over?: object): object
export function serialize(game: object): object      // exactly STATE_KEYS, in order, JSON-safe
export function deserialize(raw: unknown): object    // TOTAL, idempotent, repairs junk
export function stateOf(save): object | null
export function resume(save): object | null          // repairs inProgress.game and writes it back
export function writeGame(save, game): object

/* ---- reading the job ---- */
export const queueOf, idxOf, currentItem, targetsLeft, answered, isVaultTarget;
export const hintsOn: () => true
export const callsAvailable: (save) => number[]      // call.callsFor(guard.rankOf(save))
export function pricedTarget(save, opts?: {idx?, item?, now?, tellFor?}): Target & {
  item, idx, make, tokens, guarded, rank, x2, crew, idle, crewInfo, posted }
export function envelopeFor(save, opts?): Readonly<{                 // FROZEN, and carries NO card id
  n, of, make, name, grade, cold, posted, from, sources, wing, tell, x2, critical,
  guarded, tokens, crew, idle, role, calls, stakes, hints }>
export function stemRefFor(save): {id, kind, template, seed, params, item} | null
export function bagPrompt(save):  {amount, fee, banked, chainBefore, chainAfter, free}
export function walkPrompt(save): {loose, bagAndLeave, leave, bagged}
export function getawayOf(save, opts?): {loose, bagged, chain, walkBanks, vault, target, posted, left}
export function debriefOf(save, over?): Readonly<{ shape, targets, of, loose, bagged, chain, posted,
  calls, briefs, tGame, tAnswer, wall, split, decisions, perItem, backchecks, briefsOf, left, … }>

/* ---- the verbs ---- */
export function startJob(save, opts?: {picks?, tokens?, now?, today?, board?, shape?, seed?, jobIndex?, force?}): object
export function press(save, tokens: Record<wing,number>, opts?): Record<wing,number>
export function beginTargets(save, opts?: {now?}): object
export function canLockCall(save, callId): boolean
export function lockCall(save, callId: 50|70|85|95, opts?: {now?}): {call, n, at}
export function beginAnswer(save, opts?: {now?}): string             // the no-stakes door to the stem
export function applyTarget(save, result, opts?: {now?, cards?, tellFor?}): {
  kind, rung, rho, delta, free, loose, bagged, chain, chainBefore, posted, call, ok, credit, w,
  target, backcheckable, next }
export function bag(save, opts?: {now?}):  {amount, fee, banked, chainBefore, chainAfter, bagged, loose, chain}
export function push(save, opts?: {now?}): {loose, bagged, chain, phase, outcome}
export function canBackcheck(save): boolean
export function backcheck(save, opts?): {loose, chain, held, spent}
export function mintBackcheck(save, {dues?, cleared?, day?, reason?}): {minted, held, why}
export function brief(save, actions?: {repress?, crew?: {make, rank}, commit?, tell?}, opts?): {took, briefs, phase}
export function commitBind(save, {kind:'walk'|'doneBy', byMin:number}, opts?): object
export function commitDue(save, now?): boolean
export function commitFire(save, opts?): Debrief
export function crack(save, opts?: {now?}): {loose, bagged, chain, phase}
export function walk(save, opts?: {bagFirst?, now?}): Debrief        // getaway → WALKED, mid-job → QUIT
export function canCallIt(save): boolean
export function callIt(save, opts?: {now?}): {stakes:false, hints:true, left, posted:0, phase}
export function quietClose(save, opts?: {end?, now?}): object | Debrief
export function endJob(save, outcome, opts?: {now?, bagFirst?, preBanked?, day?}): Debrief
export function tick(save, phase, now?): string
export function rungOf(result): 0|1|2|3|4|null
export function isFreeResult(result): boolean

export { econ, call, crew, guard };   export default startJob;
```

### The call sequence J6 writes

```js
const g = startJob(save, { today, now });        // = inProgress.game; queue → inProgress.queue
press(save, tokens);                             // optional; buildJob pre-pressed the equilibrium mix
beginTargets(save, { now });                     //   → phase 'envelope'
const env = envelopeFor(save);                   //   the SEALED envelope (no stem address)
lockCall(save, 70, { now });                     //   → phase 'answer'; stemRefFor(save) now works
// ... mount card.js's answering body from stemRefFor(save); card.js writes LEDGER A itself ...
const payout = applyTarget(save, result, { now });   // Ledger B + markItem/requeueReview → 'payout'
bag(save, { now });  /* or */  push(save, { now }); // the continue tap
```

`opts.cards` on `applyTarget` defaults to `data/cards.js`'s `byId`, so `qHatFor` always has its index
(notes/J2.md §2). Pass `opts.tellFor` once J7's Fault Index is wired (notes/J5.md §7).

---

## 3. How to test it

```sh
cd /Users/oliver/Projects/unit1a-quest
node --test tests/job-state.test.mjs tests/job-ledger.test.mjs    # 66 tests, ~0.6 s
node --test tests/                                                # the gate
```

The module imports cleanly in plain node with no DOM shim:

```sh
node --input-type=module -e "import('./site/js/job/state.js').then(m=>console.log(Object.keys(m).length))"
# → 67
```

---

## 4. Acceptance — every criterion, with the number actually measured

| # | criterion (from the ticket) | verdict | measured |
|---|---|---|---|
| 1 | the machine implements `board → envelope → call → answer → payout → bag/push → brief → getaway → debrief` | **PASS** | 11 phases (`PHASE_ORDER` + terminal `debrief`); a scripted JOB-10 traverses board · guard · envelope×10 · call×10 · answer×10 · payout×10 · bagpush×9 · brief×2 · getaway · debrief |
| 2 | exports `applyTarget`, `bag`, `crack`, `walk`, `callIt`, `backcheck`, `commitBind`, + a serialiser to/from `inProgress.game` as J10 defined it | **PASS** | all 7 present, plus `serialize`/`deserialize`/`resume`/`writeGame`; **67** exports total |
| 3 | **Law of Two Ledgers** — a test shows Ledger A is unreachable | **PASS** | 13 denied writes all throw `LedgerError` (`xp`, `skills`, `skills.VOC`, `cards`, `cards[*].bucket`, `.rarity`, `.foil`, `.foilProgress.push`, `.history.push`, `errors`, `errors.push`, `forecastLog`, `delete xp`, `defineProperty`); a whole job moves **0** of the 10 Ledger A keys; Ledger B moved (log 1, bestBag > 0, heat.jobs 1), so the test is not vacuous |
| 4 | the module does not duplicate one line of the grade path | **PASS** | `state.js` contains no `applyOutcome`, `nextBucket`, `scoreFor`, `rarityOf`, `xpFor`, `dueFor` or `clampDue` call — **0** matches |
| 5 | **answers tick; time does not** — no payoff term reads elapsed time | **PASS** | a full job replayed at **ms × 10** produces byte-identical `log` (minus the two accumulators), `records`, `rating`, `rank`, `calls` (minus `at`), `elo`, `heat`; the accumulators themselves scaled **> 5×**, so the replay is not vacuous |
| 6 | `tGame`/`tAnswer` are not payoff terms | **PASS** | they appear only in `setPhase`, `debriefOf` and the log entry; the ms × 10 replay above is the proof |
| 7 | **LOOSE floors at 0**; nothing already bagged is taken | **PASS** | 6 corpus saves × ~10 beats of random miss/clear at calls 50/70/85: **0** negative LOOSE, **0** decreases in BAGGED; a miss at LOOSE 0 takes exactly **0** at all three call rungs |
| 8 | **the sealed envelope** — the stem is not exposed before the call is locked | **PASS** | the envelope is `Object.freeze`d and contains none of `id item template seed params stem answer solution parts figure`; `JSON.stringify(env)` contains neither the card id nor the template, over 6 corpus saves; `stemRefFor` is `null` at `board` and at `envelope`, non-`null` the instant `lockCall` returns, and `null` again at the next envelope |
| 9 | **CALL IT** — LOOSE 0 ∧ chain 0 ∧ ≥ 3 left; ends stakes, records walked at posted 0, rest continues WITH HINTS ON | **PASS** | refused with a chain on the board and refused at 2 targets left; after the call `stakes false`, `hints true`, `posted 0`; **all** remaining targets ran and each paid `delta 0`; `log.posted === 0`, `log.guard === null`, `records.walked === 1`, `counters.pages === 1` |
| 10 | on any exit that is not a bag, LOOSE auto-banks at 50 % | **PASS** | `AUTO_BAG.walk === 0.50`; `walkPrompt().leave === autoBank(loose,'walk')`; `bagBank(s) ≥ autoBank(s,'walk')` and `bagBank(s) ≤ round(s)` for **all 58** pile sizes 0…399 step 7; bagging-then-leaving ≥ leaving on the live state |
| 11 | mid-job reload restores queue, idx, loose, bagged, chain, calls, tokens, guard, crew, briefs exactly | **PASS** | all 10 `deepEqual` after a real `JSON.stringify` → `JSON.parse` → `resume()`; the whole record is `deepEqual` to the pre-kill one |
| 12 | the job seed is PINNED — re-opening cannot re-roll guard / bundles / ×2 | **PASS** | `buildJob` re-run at `NOW + 3 h` from the pinned seed reproduces the same guard wing, the same 5 bundle lock-lists and the same ×2 vector; `x2Marks(day, jobIndex, n)` reproduces the vector independently |
| 13 | **COMPOSED global rule 4** — nothing auto-advances; the bag/push prompt occupies the continue slot | **PASS** | after `applyTarget` the phase is `payout`, `next === 'bagpush'`, the record is unchanged until `push`/`bag`, and `stemRefFor` is `null` (the next stem is re-sealed) |
| 14 | items are marked through the EXISTING `markItem` / `requeueReview` / `finishPage` | **PASS** | `state.js` calls exactly those three from `page.js` and defines no marking of its own; every answered item ends `done: true` with a `result`; `counters.pages === 1` on completion and **0** on a walk with targets left |
| 15 | **`tests/job-ledger.test.mjs`** — the same answer sequence in a job and through `#/run/page` gives byte-identical `cards`, `skills`, `xp`, `errors`, `counters`, `forecastLog` | **PASS** | **6** corpus saves, identical on all 6 keys and on `JSON.stringify` of the lot; plus all **10** Ledger A keys on a 7th; plus `readiness()` identical; plus a half-job **WALK** vs the same half-page; plus a **CALL IT** job vs the full flat page |
| 16 | `node --test tests/` green | **PASS** | **2 018 tests · 2 014 pass · 0 fail · 4 skipped**, exit 0. My two files are **66/66**, three consecutive runs, and deterministic. |

Bonus numbers the suite also pins: Backchecks (a shielded miss writes a **byte-identical**
`player.rating.calls` array and an identical `calls[].ok`/`.w`; none on the vault, none at 0 held,
none off the payout beat; the mint refuses 0 dues and unfinished dues, is 1/day, caps at 3);
COMMIT (`+8 %` on a full-value bank, completion forfeited, `honored → 1`, the page survives); the
22:00 close (banks at `AUTO_BAG.quiet22 === 1.00`, stakes off, **0** items removed); the chain is
`xp.comboTransition()` verbatim (`chainAfterTarget(rungOf(r), 0, c) === nextCombo(c, r)` for all 5
rungs × 10 chain values = **50** cases); `free` outcomes move nothing and do not advance the pointer.

---

## 5. Deviations and objections (the spec was implemented; these are recorded, not fixed)

### 5.1 `inProgress.kind` stays `'page'`, and `startJob` writes the record shape itself
`page.markItem` / `requeueReview` / `finishPage` all go through `resumePage`, which requires
`kind === 'page'`. A job **is** Today's Page re-skinned (G7 "One queue, two skins"), so the job sets
`kind: 'page'` and hangs `game` off it — which is also exactly what J10's fixtures assume.
`startJob` cannot call `page.startPage`, because that composes its **own** queue; it therefore writes
the same object literal `startPage` writes, with the drafted queue in place of the composed one.
**Two writers of one shape is one too many** — request filed in §7 for a `startPage(save, {queue})`
overload so there is exactly one.

### 5.2 The vault target is **not spliced** into the drafted queue (J5 open issue #3)
J5 left the splice to "J6/J-state". I did **not** do it. `board.vaultFor` returns *the most-overdue
cleared tier-3/4 original*, which is in general **not** in `composePage`'s queue — splicing it would
break G9 #2 (`set(job items) ⊆ set(page items)`) and COMPOSED global rule 5, which are the stronger
laws. So: `game.vault` **names** the vault (for the board line and `vaultGradeFor`), and the
getaway gates the **last target of the drafted queue** (`isVaultTarget`). Routing a VAULT shape's
final target to `screens/boss.js` is J6/J11's, and it should route the last drafted target, not a
spliced card. Recorded as an objection to the spec's wording rather than a silent choice.

### 5.3 The getaway happens on **every** shape, not only the VAULT
G1's decision table counts `getaway CRACK/WALK: 1` inside the JOB-10's 24 mandatory decisions
(1 draft + 1 press + 10 calls + 9 bag/push + 2 briefs + 1 getaway = 24), and "the last target is the
vault; before it, the getaway" carries no shape condition. `SHAPES.*.vault` is therefore read as
*"is the final target a boss"*, not *"is there a getaway"*. A one-target job has no getaway beat and
ends `OUTCOMES.COMPLETED`; every longer job ends `OUTCOMES.CRACKED`, which is what sets `log.cracked`.

### 5.4 The Elo pair does **not** move on a quit, a CALL IT, a COMMIT or the 22:00 close
G3.5 says only *"outcome 1 if BAGGED ≥ posted else 0"*. With CALL IT's **recorded posted 0**,
`guard.eloOutcome({bagged, posted: 0})` returns **1** — a *win* for being wiped out — and a mid-job
quit would likewise score against a posted the student never played for. Both contradict G3.7 proof 6
("quitting is never better than banking"). So the Elo update runs only on
`{COMPLETED, CRACKED, WALKED}` — the outcomes that reached the getaway — and only when
`posted > 0`. **This is a deviation from a literal reading of §3.5 and the integrator should rule.**
`applyFlowControl` still runs every job, and still moves `R_player` only.

### 5.5 CALL IT's "posted 0" suppresses flow control, and I think that is wrong
`guard.flowControl` fires on *"two consecutive jobs with `BAGGED < 0.5 · posted`"* and skips any entry
with `posted === 0`. So a student who gets wiped twice and calls it twice — precisely the student the
FOOTHOLD exists for — never triggers it. **I implemented the spec (`posted 0`) and am recording the
objection:** either the log should carry the real posted alongside a `walked: true` flag, or
`flowControl` should treat a called job as a loss. J3 owns `flowControl`; G1 owns the wording.

### 5.6 The rating's `ok` is *cleared*, while `q̂` is the *first-try* rate
G3.1's two credit columns are labelled **clear** and **miss**, and the miss branch of the payout is
rung 4 alone — so `callEntry({ok})` is fed `result.cleared === true`, independent of crew forgiveness
and of shielding. But G2 defines the weight's `q̂` as *"your first-try rate on that make over the
trailing 10 attempts"*, which is a **different event**: a target cleared on attempt 2 counts as a
clear for the credit and as a miss for `q̂`. The two are consistently mis-matched by design or by
accident; the spec does not say which. Implemented as written on both sides; flagged for J2/J8.

### 5.7 `game.ledger.phaseMeans` is a running mean over `min(5, jobs)`, not a true last-5 window
G7 says *"rolling, last 5"* but the save keeps no per-job phase history and adding one would cost
real bytes. `endJob` folds this job's five observed phase seconds in as
`mean ← (mean·(k−1) + observed)/k`, `k = min(5, jobs)`. That converges to the last-5 mean and needs
no new key. **J8 owns the ≤ 5-point printed-vs-measured criterion** and should say whether it needs
the exact window; if it does, ask and I will add a 5-slot ring (≈ 180 B).

### 5.8 The brief window implements four of G1's five options
`repress` (with the guard redrawn from the **same published distribution** and the **pinned** seed,
indexed `"<seed>|brief<n>"`, so a reload cannot re-roll it), `crew` (through `crew.allocate`, free
and unlimited), `commit`, and `tell` (recorded as taken/declined). **"Swap one undrafted contract in
at its declined price"** is **not** implemented: it rebuilds `inProgress.queue` mid-job, which is a
schedule write and belongs with whoever owns the draft. Request in §7 → J6.

### 5.9 Seven keys beyond J10's sixteen, and what they cost
Listed in §1. Measured at **+282 B** on a 12-target worst case, **+314 B** against J10's own fixture,
leaving **111 B** of the 425 B headroom under the ≤ 25 KB bound. `loose`, `bagged`, `d` and
`looseBefore` are all forced through `econ.round` in `serialize`, so a float can never reach the disk.

### 5.10 `pricedTarget` pins `now` to the job's start
`cold` needs `schedule.overdueDays`, which is a **date** difference, not elapsed session time. Pinning
it to `guard.drawnAt` (= `buildJob`'s `now` = `postBoard`'s `now`) makes the envelope's `posted`
reproduce the board's, makes a reload re-price identically, and keeps the ms × 10 replay exact.
Asserted both ways.

### 5.11 `state.js` emits no copy
No user-facing string is composed here; the only strings are phase, outcome and error-code enums.
`data/job.js COPY` stays the single copy table (J12's lint has nothing to grep for in this file).

---

## 6. Open issues

1. ~~The suite gate is red on a test I do not own.~~ **Resolved by J7 mid-sitting** — their regex
   now reads `${CHAIN.step}` and `job-index.test.mjs` is 78/78. Kept here only as the record of a
   cross-lane race: a full-suite run taken while another lane is writing can be red through no fault
   of the ticket under test, and the cheap check is `grep -c` for your own file in theirs.
2. **`requeueReview` grows the job past `shape.targets`.** A missed review is re-queued once
   (`page.MAX_REQUEUE = 1`), exactly as on the flat page, so an 10-target job can answer 11 targets —
   each with its own call, payout and bag/push. That is Global rule 5 winning over the shape table,
   and I believe it is right, but **G1's decision count and J8's split table read `shape.targets`**
   and will be one or two low on a bad review night. J8 should read `queueOf(save).length`.
3. **`OUTCOMES.QUIET22` after a `quietClose({end:false})`.** If the student plays the rest of the
   page out after the 22:00 close, `advance()` ends the job as `CALLED` (stakes are off) rather than
   `QUIET22`. The banking and the log are right; only the word is imprecise. J11 owns the copy.
4. **`records.cleanGetaway` and `records.bestRating20`.** `cleanGetaway` is G5's Night-Before stamp
   and is left untouched here (J11's). `bestRating20` is computed as
   `ratingFrom(calls.slice(-20), 20)` — a reading, not a ruling: G7 names the field and nothing
   defines it. J7's `calibrated` trophy is *"rolling Brier ≤ 0.10 over 20 informative calls"*, which
   is a different statistic; if the record is meant to be that one, say so and I will change it.
5. **A no-stakes target needs `beginAnswer`.** With `stakes === false` there is no call to lock, so
   the screen must call `beginAnswer(save)` instead of `lockCall`. It is the only asymmetry in the
   verb list; J6 must branch on `state.stateOf(save).stakes`.
6. **`guardSave` is a Proxy, so `structuredClone(guardedSave)` throws.** Nothing in the layer does
   it, and `unguard()` is there for anyone who needs the raw object, but it is a trap worth knowing.

---

## 7. Requests for other file owners

**J7 (`js/job/index.js`, Settings, trophies) — nothing outstanding; two hooks waiting for you.**
- `applyTarget` and `pricedTarget` take `opts.tellFor`; feed them
  `(skillId, item) => index.tellFor(save, skillId)` and `econ.tellFor` does the rest, so
  `index.resolve()` drops the posting the same tick (notes/J5.md §7's hook, wired on this side).
- **Backchecks:** `backcheck(save)` restores the pile and the chain and touches **nothing** else —
  the `player.rating.calls` entry is pushed by `applyTarget` *before* a shield can be spent, which is
  what makes your byte-identity criterion structural rather than a promise. `job-state.test.mjs`
  asserts a shielded and an unshielded miss write identical windows. `mintBackcheck` is the mint.
- *(Your `job-index.test.mjs` chain-multiplier regex went red for one run mid-sitting and you fixed
  it yourself; recorded in §6 #1 only as a cross-lane note.)*

**J6 (`js/screens/job.js`) — the whole screen is a renderer over this file.**
- The call sequence is in §2. **Never read `inProgress.game` directly** — `stateOf`/`resume` return
  the repaired record, and the raw one may be hand-damaged (J10 open issue #4).
- **Never fetch a card before `stemRefFor(save)` returns non-`null`.** That is the seal, and
  `job-state.test.mjs` asserts the envelope carries no id — if the screen resolves the id another
  way, the seal is gone and J6's own DOM test must catch it.
- Branch on `state.stateOf(save).stakes`: `lockCall` when true, `beginAnswer` when false
  (open issue #5).
- `bagPrompt(save)` / `walkPrompt(save)` / `getawayOf(save)` give every number those three prompts
  print, already rounded; feed them into `COPY.bagPrompt` / `COPY.walkConfirm` / `COPY.vault`.
- `envelopeFor(save, { makeName })` — pass `skillById[make].name` as `makeName`; the machine does not
  import `data/skills.js`.
- Pass `opts.tellFor` through to `applyTarget` and `pricedTarget` once J7's `index.tellFor` exists,
  and `opts.cards` only if you want an index other than `data/cards.js`'s `byId`.
- **The brief's contract swap is yours** (§5.8): it rebuilds `inProgress.queue`, which is a schedule
  write. `brief(save, {...})` will record `'swap'` in `took` if you push it there yourself.
- `debriefOf` / the `endJob` return value carry everything J6b's Page Summary extension needs:
  `split`, `decisions`, `perItem`, `tGame`, `tAnswer`, `ratingBefore`/`ratingAfter`, `flow`, `entry`.

**J5 / the `page.js` owner — one overload, to kill a duplicated object literal (§5.1).**
`startPage(save, opts)` composes its own queue, so `startJob` cannot reuse it and writes the same
`inProgress` record shape by hand. An overload — `startPage(save, { queue, seed, seedTag, meta, day,
dayIndex, pageIndex })` that skips `composePage` when `opts.queue` is given — would leave exactly one
writer of that shape. Three lines; I will switch to it the day it lands.

**J8 (`tests/job-split.test.mjs`, the debrief line).**
- The two accumulators are `game.tGame` / `game.tAnswer` (ms), switched in `setPhase` against
  `data/job.js`'s `GAME_PHASES` / `ANSWER_PHASES`. `debriefOf(save).split` is `tGame / (tGame+tAnswer)`.
- Per-phase totals for this job are on `inProgress.game.ph` (the five `PHASE_MEANS_DEFAULT` keys, ms);
  `endJob` folds them into `save.game.ledger.phaseMeans` in **seconds** — see §5.7 for the exact
  averaging and say if you need a true 5-slot window.
- **Read `queueOf(save).length`, not `SHAPES[shape].targets`**, for the decision count (open issue #2).
- `debriefOf` already returns `decisions` and `perItem`; it counts DRAFT 1 + PRESS 1 + calls +
  bag/push beats + briefs + getaway + COMMIT + Backcheck spends, which is G1's own table.

**J9 (`tests/job-exploit.test.mjs`, `job-monotone.test.mjs`).**
- `guardSave` is the module-level spy you were going to write, and it is already load-bearing rather
  than observational: `LEDGER_A_KEYS` is the list, `LedgerError` the failure. Import it.
- `job-ledger.test.mjs` already ships the byte-identity half of proof 11, including an **all-miss job
  at call 85** that leaves every Ledger A key untouched.
- The ms × 10 replay of proof 5 is in `job-state.test.mjs`; the **grep** half (no `Date`/`now`/
  `elapsed`/`ms` in payoff code) is still yours. `state.js` has 44 lines matching a clock term and
  every one is in `setPhase`, an `at` stamp, `guard.drawnAt` or a JSDoc line — the payoff functions
  are all in `econ.js`.
- For the monotone brute force: `econ.settle` is the per-target transition and `chainAfterBag()` the
  BAG reset; `state.js` adds no arithmetic of its own to either.

**J10 (`js/store.js`, the size bound) — re-measure, please.**
`inProgress.game` now carries **21** keys, not 16. Measured against your own `inProgressJob12`
fixture: **3 896 B vs 3 582 B, i.e. +314 B**, against the **425 B** of headroom you reported, leaving
**111 B**. The seven additions are in §1 and every one is a scalar or a ≤ 7-field object. If you would
rather have the budget back, the two I can drop cheapest are `ph` (≈ 70 B — but then J8 loses the
phase means across a reload) and `last.looseBefore` (≈ 20 B — but then a Backcheck cannot restore the
pile). Also: `deserialize()` is the `inProgress.game` normaliser you offered in your open issue #4 —
it is total, idempotent and repairs junk, and `resume(save)` writes the repair back, so the resume
path is defended. You do not need to add one in `store.js`.

**J3 (`js/job/guard.js`) — your two requests are honoured.**
`endJob` writes `gm.heat = pushHeat(gm.heat, { press: g.tokens, posted })` once per job, and the log
entry carries `guard: '<WING>'` — or **`null`** (never omitted) when the job posted 0, which is the
"skip" reading your three-in-a-row cap wants. `applyFlowControl` is the only thing that moves
`R_player` outside `elo()` and it never touches `R_house`; asserted. One note back: `game.heat.window`
(your §5.5 schema addition) is written by `pushHeat` itself, so if J10 has not added it to
`SAVE_DEFAULTS` yet, it will appear on the first job end and survive as a pass-through key.

**J11 (`plan.js`, `home.js`, `boss.js`, `mock.js`).**
- `quietClose(save, { end })` is the 22:00 transition: `end: false` banks in full and keeps the page
  going with stakes off; the default ends the job. The **trigger** and the copy are yours.
- `commitBind` / `commitDue(save, now)` / `commitFire` are the bound declaration; `commitDue` is pure
  and takes the clock, so your week rules decide when to ask.
- `mintBackcheck(save, { dues, cleared, day })` is the day's mint and `{ reason: 'vault' }` the clean-
  vault one; both cap at 3 and at 1/day.
- **Home's resume link:** with a job live, `save.inProgress.kind` is `'page'` and `plan.nextAction`
  will return `{ kind: 'resume', href: '#/run/page' }`. It must check `save.inProgress.game` and send
  the student to `#/run/job` instead, or a mid-job reload lands on the flat page with the stakes
  still on the disk. **This is the one integration bug I can see from here and it is not mine to fix.**
- The VAULT shape's final target is the **last drafted target**, not a spliced card (§5.2).

**J12 (copy and juice lint).** `state.js` emits **no** user-facing strings (§5.11) — only phase,
outcome and `JobStateError` code enums. Every line the job prints comes from `data/job.js COPY`.

# cut-machine — the session state machine

**Lane:** `machine`. **Owns:** `site/js/job/state.js` and `tests/job-state.test.mjs` (new).
**Authority:** `designs/CUT-SPEC.md`, under `designs/CUT-BRIEF.md`, under `BUILD-POLICY.md`.

`node --test tests/` is GREEN. `tests/job-state.test.mjs` is **33 tests, 8.9 s**, and every one of its
math assertions has been made to FAIL against a deliberately broken `state.js` before it was allowed
to pass — all 19 of those runs are listed in §4.

---

## 1. What I built

The demolition left `state.js` a working engine (`startJob / call / answer / bank / endJob`), so this
lane was not a rewrite. It was: **read every line against the spec, find what is not true yet, fix
exactly that, and then try to break the proofs.** Four defects were found and fixed; all four are
exploits or printed-number bugs, not tidying.

### 1.1 `bank` is refused while a call is live — **the bid stands until it is answered**

Two exploits sat in one missing precondition, and they are the same shape as the ones that killed the
old layer.

* **The free ×5 question.** Lock *sure* at pile 80 / ×5, then bank. The pile is now 0, so the cost
  floors to nothing (`P − min(P, 40) = 0`) and the bid pays 50 on a clear and takes nothing on a
  miss. A risk-free maximum bet, repeatable every question.
* **Walking out of a bid.** Lock a call, read the question, decide you do not like it, bank, re-call
  *not sure*. "You bid on yourself **before you see the question**" — CUT-BRIEF's first surviving
  idea — is only true if the bid cannot be withdrawn after the flip.

`bank()` now throws `JobStateError('called')` over a live call. **This is invisible in the shipped
app**: `screens/job.js` renders the bank button on the face-down card only, which is exactly the
reading of §4 that survives ("bank is live at every moment *the card is face down*"). `endJob` voids
any live bid before its auto-bank, so the pile always comes home — an unanswered question is going
back on the schedule unanswered and can neither pay nor cost.

### 1.2 `bank` no longer reads a clock for the day — `today` cannot fall under the student's hand

`bank()` rolled `save.game.day` over from `Date.now()`, so a session running through midnight reset
`save.game.today` to 0 **mid-session, with the number on screen**. That is CUT-SPEC §7 #8 ("`today`
never decreases") failing in the one case where a student would actually see it. The day now rolls
over in `startJob` only; `bank` takes an explicit `opts.day` or rolls nothing. Points banked at 00:01
land on the day the session started, which is also what `screens/job.js dayOf` already assumed.

### 1.3 `answer()` returned `delta: -0` on a costless miss

`-Math.min(pileBefore, 0)` is `-0`, and `String(-0)` is `"-0"`. Any surface that prints the delta
would print a minus sign in front of a zero — a number the engine did not compute. `delta` is now
`0`. (The surface that prints it is the screen lane's; the value it is handed is mine.)

### 1.4 `call()` and `answer()` now share one precondition

`call()` gated on `targetsLeft(save) > 0` while `answer()` gates on `currentItem(save)` being an
object. On a queue whose current slot holds junk the two disagree: the call locks, the screen renders
the flip, `renderAnswer` finds no item and calls `render()`, which renders the flip again — an
infinite re-render with a sealed bid the student cannot settle. Both verbs now require the item.

**Nothing else changed.** `guardSave` and the Ledger-A proxy, `LEDGER_A_KEYS`, `LEDGER_B_KEYS`,
`queueOf`, `serialize` / `deserialize`, the study write in `answer` (`requeueReview` then `markItem`,
in that order, with `screens/run.js record()`'s exact result record) and `endJob`'s `finishPage` are
untouched, line for line. `tests/job-ledger.test.mjs` — the Law of Two Ledgers — is green, 17 tests.

---

## 2. The exported API (unchanged shape, four behaviour fixes above)

| export | signature | notes |
|---|---|---|
| `startJob` | `(save, opts) → game` | opts `{now, day, force}`. Refuses over a half-answered page (`page-in-progress`) unless `force`. **The only verb that rolls the day.** |
| `call` | `(save, callId, {now, ms}) → {pay, cost, streak, pile, call}` | throws `called` / `unaffordable` / `no-target` |
| `answer` | `(save, result, {ms}) → {ok, pay, cost, delta, pile, pileBefore, streak, streakBefore, call, left}` | `result` is `screens/card.js`'s own grade object; `ok === (result.cleared === true)` |
| `bank` | `(save, {ms, day}) → {points, today, best, pile, streak}` | throws `called` over a live bid; reads no clock |
| `endJob` | `(save, {ms, day}) → {points, today, best, answered, split}` | voids a live bid, banks, `finishPage` |
| `callsFor` / `priceOf` | `(save)` / `(save, callId)` | what the screen greys and what the third slot prints |
| `splitOf` | `(game) → 0…100 \| null` | the MEASURED split; `null` before anything is measured |
| `stateOf` `currentItem` `targetsLeft` `answered` `queueOf` `idxOf` `pageInProgress` `resume` `writeGame` `freshState` `serialize` `deserialize` `STATE_KEYS` | | |
| `guardSave` `unguard` `LEDGER_A_KEYS` `LEDGER_B_KEYS` `SHARED_KEYS` `COUNTERS_WRITABLE` `isProtectedKey` `LedgerError` `JobStateError` | | the Law of Two Ledgers, structural |

This lane adds **no copy**: `state.js` contains no student-facing string, and `job-state.test.mjs`
asserts none.

---

## 3. The math, and the numbers it produced

Every transition in the test file comes out of the **shipped machine**: `stepOf()` drives the real
`state.call` / `state.answer` on a real save and reads the pile and the streak back, and the table
the dynamic programs run on (`RULE`) records **what the pile did**, not what the return value said it
did — a machine that reports `pay 9` and adds 18 breaks the proofs instead of passing on its own
paperwork (this was NC-12; see §4).

**Reachability.** BFS from `(pile 0, ×1)` over the machine's own transitions, 14 answers deep:
**2,383 reachable states, 7,129 (state × offered call) pairs** — the same 2,383 CUT-SPEC §2 quotes,
which confirms the spec counted a 14-answer session. (Depth 8 → 882, 10 → 1,383, 12 → 1,883,
16 → 2,883.) Minimum pile by streak: **0, 8, 24, 48, 80**, so one right answer opens the second call
and two open the third, exactly as §2 says.

| # | requirement | asserted over | result |
|---|---|---|---|
| **4** | right never pays less than wrong | all 7,129 pairs | 0 violations; **minimum gap 8**; streak never lower on a clear; `today` / `best` identical on both branches |
| **5** | failing never pays | DP, T = 10, q ∈ {.35,.5,.65,.75,.85,.95} | cheat − honest = **exactly 0** at every q |
| **5** | …with the study layer's mid-page retry in it | DP, T = 8, R = 8, reviews first | **exactly 0** at q = .5/.75/.95 |
| **6** | improving never costs | q = 0.30…0.99 step 0.01, T = 8 and 12 | **0 non-monotone steps**, every value finite and > 0 |
| **6** | E[points], T = 12 | q = .35….95 | **37, 58, 87, 126, 186, 278, 413** — CUT-SPEC §7 #6's seven numbers, reproduced to the integer |
| **7** | no clock in the payoff | same script at `ms` 1 / 6·10⁵ / absent / NaN / −5 | identical pile, streak, answered, today, best; `priceOf` unmoved by a wild `tGame`; source scan of the pricing block finds no `Date` / `now` / `tGame` / `tAnswer` / `performance` |
| **8** | losses only from the pile, floored at zero | all 7,129 pairs | `0 ≤ pile' ≤ pile` everywhere; `today` and `best` untouched by any answer; `today` non-decreasing across a 15-answer session with banks; non-decreasing across local midnight |
| **9** | the priced bit is the counted bit | 9 result shapes | `ok ≡ (result.cleared === true)` — `'true'`, `1`, `{}` and `null` are all misses; the record handed to `markItem` carries the same bit; over a 6-question session the sealed `qHatDetail(...).hits` equals the count the game paid for, question by question |
| §2 | the gate | all 2,383 states | the cost cap binds beside an alternative in **0**; every unaffordable call throws `unaffordable` |

**The one that had to be checked rather than assumed.** The game does not own the queue. A missed
*review* is spliced back into the page by `page.js requeueReview`, so a wrong answer can **buy the
student another question** — and a miss at pile 0 costs nothing, because CUT-BRIEF floors it there.
That is a candidate "failing pays" the payoff table alone cannot see. It is worth nothing: at
`(0, ×1)` throwing trades `q × 8` and a streak of 2 for one more question at ×1, and the DP says the
streak is always worth more. The general reason is that **an extra question can never be worth more
than the pay you decline to take**, so the honest branch dominates at every state. Verified over the
generous model (the cheat sees whether the item can requeue *after* the flip, and every remaining
review comes first): gain **0.000000** at T = 8/12/14, R up to T, q up to 0.99.

---

## 4. Negative controls — 19 runs, each against a deliberately broken `state.js`

Harness: restore a pristine copy, apply a one-line patch, run `tests/job-state.test.mjs`, restore.
A patch that fails to apply aborts the run, so "it passed" can never mean "it was never broken".

| # | the break | tests that went RED |
|---|---|---|
| 1 | floor removed (`pileBefore − COSTS[c]·m`) | rule probe · #8 floor · empty-pile miss · #4 |
| 2 | a miss keeps the streak | rule probe · #9 · thrown-question |
| 2b | same, after the DP was made to probe both streaks | + min-pile-by-streak · #4 · **E[points] numbers** |
| 3 | a miss pays 1 | rule probe · #8 · empty-pile · #4 · bank-refused |
| 4 | `bank` rolls the day off the clock (the old behaviour) | `today` never decreases · bank · endJob |
| 4b | same, after the midnight test was fixed to use **local** time | + **midnight session** |
| 5 | `bank` allowed over a live call | bank-refused-while-called |
| 6 | `ok = result.cleared !== false` | #9 the bit |
| 7 | pay reads the split meter | #7 ×2 (behaviour and source scan) |
| 8 | affordability gate removed from `call` | unaffordable-refused |
| 9 | streak cap removed | streak climbs 1→5 and caps |
| 10 | `endJob` leaves the bid live | session ends by banking |
| 11 | `delta` back to `-0` | empty-pile miss |
| 12 | a miss pays double | 7 red — **but not the two DP proofs** |
| 12b | same, after `RULE` was rebuilt from the observed pile | **11 red, both DP proofs included** |
| 12c | same, after the monotonicity test was given a finiteness guard | 11 red |
| 13 | a clear lowers the streak, a miss maxes it | the file fails to load (the machine-probed `MULT_MAX` collapses) — red, but crudely |
| 14 | pay inverted in the streak | min-pile · #4 · **requeue DP** · E[points] numbers · streak-worth |
| 15 | a clear at ×3+ pays nothing | rule probe · min-pile · #4 · E[points] numbers · streak-worth |

**Three of those controls found real weaknesses in my own tests, which is the point of running them.**

* **NC-12** proved the DP was reading the machine's *return values*. `RULE` now records the observed
  pile delta, and the return values are checked against it separately ("what the machine SAYS a call
  pays is what the pile then does"). Only after that fix did "failing never pays" go red under a
  machine where a miss pays double.
* **NC-12c** proved the monotonicity loop passed *vacuously* on `NaN` (`NaN < prev` is false). It now
  asserts every value is finite and positive first.
* **NC-4** proved my midnight test crossed no midnight: it was built from `Date.parse('…Z')` while
  `days.js todayISO` is local, so both instants sat inside one local day. Rebuilt with local `Date`.

**Honest limitation.** The *monotonicity* assertion of #6 survives NC-13/14/15. That is not slack in
the test, it is a theorem: `V` is a max over policies and the clear branch dominates the miss branch
pointwise (requirement #4), so monotonicity in `q` follows from #4, which has its own sharp test. The
falsifiable half of #6 is the **exact seven numbers** at T = 12, which went red under NC-2b, 12b, 14
and 15.

---

## 5. Requests

1. **Payoff lane — the rename.** `state.js` still imports `./econ.js` (line 42, `import * as econ`).
   When you land `job/pay.js` per CUT-SPEC §8 / DEMOLISH seam 1, change that one line; the names it
   uses are `PAYS`, `MULT_MAX`, `mult` is not used, plus `offered`, `canCall`, `payOf`, `costOf`.
   `tests/job-state.test.mjs` imports **no** payoff module at all — it reads the table out of the
   machine — so it survives the rename untouched. Ping me if you change a signature rather than a
   filename.
2. **Screen lane — do not offer `bank` after the call is locked.** §1.1. `screens/job.js` is already
   correct today (the bank button lives on the face-down card); `state.bank()` now throws
   `JobStateError('called')` if that ever changes, and `screens/job.js doBank()` already catches and
   warns, so the worst case is a dead tap rather than a broken session. If the screen wants bank
   during the flip, it needs a different design and a new proof — say so and I will do the math.
3. **Screen lane — `endJob` may be called with a live bid** (a student who walks out mid-question).
   It is handled: the bid is voided, the pile is banked, `finishPage` runs.
4. **Save lane — `reconcileGameDay` on load, over a LIVE session.** Your `store.js` repair rolls
   `game.day` at load time, which is right for a fresh open. If it runs while `inProgress.game`
   exists and the clock has passed midnight, the student watches `today` fall across a reload — the
   same hole I closed inside `bank()` (§1.2). Consider skipping the roll when a session is live, or
   rolling it and letting `startJob` own the boundary. `player.best` is floored first either way, so
   nothing is lost; it is a printed number that moves backwards. Not my file — flagging only.
5. **Save lane — request 1 of `notes/cut-save.md` is done.** `deserialize` on junk (33 shapes
   including `null`, `NaN`, arrays, `Object.create(null)`, a `Date` and a function) is now covered
   here: never throws, idempotent, JSON-safe, `pile ≥ 0`, `1 ≤ streak ≤ 5`, all seven keys in order.

---

## 6. Open issues

1. **`state.js` is 520 lines against CUT-SPEC §8's "~200"** — 150 comment, 48 blank, **322 of code**.
   The Ledger-A guard (three `Proxy` traps and their caches) is 156 of those lines on its own; the
   five verbs are about 120. I did not cut the guard to hit a line count: it is the structural half
   of the Law of Two Ledgers and `tests/job-ledger.test.mjs` asserts it throws. Flagging the number
   rather than defending it — if the composer wants the file at 200, the guard is the thing to
   discuss, and it should be discussed rather than quietly deleted.
2. **CUT-SPEC §5 says the seal is cut at `inProgress.game.locked.at`.** The shipped key is
   `call.at` (`IN_PROGRESS_KEYS`, `job/call.js sealedCallOf`, and my §9 test). `locked` was the old
   design's name; nothing reads it. The spec line is stale, not the code.
3. **`today` across a local midnight is now defined by the SESSION, not the clock.** That is the
   reading that keeps §7 #8 true on screen, and it means a session started at 23:50 banks its whole
   take into the 16th. If the product wants the opposite, it is a one-line change in `bank()` and
   `today` becomes non-monotone on screen; the test that fails is "a session that runs through
   midnight keeps banking into the day it started".
4. **The DP horizons are 8–12 questions**, matching CUT-BRIEF's session shape. A session that reached
   ~20 answers (many requeued reviews) is not covered by the T = 12 grid; the per-state assertions
   (#4, #8, the gate) are over the full 14-deep reachable set and do not depend on the horizon.
5. **`answered` counts answers, not queue items**, so a requeued review makes it exceed the composed
   queue length. Nothing prints it. Left as is.

---

# ROUND 1 — FIXER. The split meter measured the wrong thing.

Two blockers, both in `site/js/job/state.js`, both the same defect wearing two hats: **the printed
percentage was not a share of the session.** `node --test tests/` is GREEN (1697 tests, 0 fail).

## 7. What was wrong

`splitOf()` divided `tGame` by `tGame + tAnswer`, and those two meters were fed by hand-picked
intervals. `screens/job.js` calls `skipBeat()` at the top of every face-down render, after the flip
and after each bank, so **the flip and every post-answer result screen were discarded from both
halves**. The denominator was therefore not the session; it was "the parts of the session somebody
remembered to hand over".

Consequence, and it is the CUT's own failure re-created inside the definition of the measurement:
the printed number went **up** when the student spent longer answering. Reproduced here on a
reverted copy of the shipped machine, two 22-question sessions differing only by 3 s per question of
worked-solution reading (`/private/tmp/.../scratchpad/nc/`):

```
run B (no dwell)   printed 69 % | true share 69 %
run C (+3 s dwell) printed 70 % | true share 35 %
```

And `endJob` booked the closing interval — the student reading the worked solution of the question
they have just been graded on — into the **game** half, via `bank(s, opts)` → `addMs(g,'tGame',ms)`.
The identical interval on every other question was dropped from both halves, so this one question's
reading time was priced differently from all the others. One question, 3 s deciding / 20 s answering
/ 10 s reading, printed **39 %** where the truth is 9 %.

## 8. The fix — one clock, two halves that partition it

The meter now holds **one session clock in two halves**, and the halves are exhaustive:

```
tGame    intervals the screen DECLARES a game decision: the face-down card is up and the student is
         choosing a call, or choosing to bank. Nothing else, ever.
tAnswer  THE REST OF THE SESSION — answering, the flip, and the seconds spent reading a worked
         solution of a question already graded. Study time, all of it.
```

**The invariant**, maintained by the new private `tick()` and asserted directly by the new test file:

```
tGame + tAnswer === (the instant of the last verb) − inProgress.startedAt
```

`inProgress.startedAt` is the study layer's own stamp, written by `page.js startPage` at the instant
`startJob` opens the page — read-only from here, like every other study field. Each verb advances the
clock to its `now` and attributes **every millisecond since the previous verb**: `call` and `bank`
take `opts.ms` (capped by the wall clock that actually elapsed) as the game half and give the
remainder to the study half; `answer` and `endJob` give all of it to the study half. `bank`'s pile
arithmetic moved to a private `bankPile()` so that `endJob` can bank **without** re-running the
meter — that indirection is the whole of blocker 2.

Three properties fall out of it, and they are why this is the fix rather than a patch:

1. `splitOf` is unchanged, line for line — `gameMs / (gameMs + answerMs)` is now literally
   `gameMs / wallMs`, because of the invariant. The bug was in the inputs, not the formula.
2. **Undeclared time can only ever LOWER the printed share.** There is no interval the meter can be
   made to flatter the game with, and `tGame` is capped by elapsed wall clock, so the number cannot
   exceed the truth however the screen is rewritten.
3. **No eighth field on disk.** The last verb's instant is `startedAt + tGame + tAnswer`, recoverable
   from the record alone, so `data/job.js IN_PROGRESS_KEYS` stays the same seven keys and
   `tests/job-save.test.mjs`'s "it is exactly `IN_PROGRESS_KEYS`, in order" keeps passing untouched.
   A killed tab resumes the same clock; `tests/job-split.test.mjs` proves it.

The same numbers after the fix:

```
run B (no dwell)   printed 69 % | true 69 %      endJob 3/20/10 s: printed 9 % | true 9 %
run C (+3 s dwell) printed 35 % | true 35 %
```

**The flip is `tAnswer`, deliberately.** The finding suggested "flip → game". It is an animation the
student waits through, and CUT-BRIEF is explicit that a low measurement is fixed by cutting answering
time, "never to pad the game with waiting" — counting waiting as a game decision is that padding,
done inside the meter. Refused on those grounds, and in the conservative direction.

**Idle time inside a live session counts as session.** A student who leaves the tab open over lunch
sees a small number, because a small number is the honest share of that wall clock. Excluding it
needs an idle threshold, and a threshold is a tuning knob (CUT-BRIEF: when in doubt, cut).

Nothing else changed: no export added or removed, no signature changed, no copy, no number on any
screen, no tap, no route. `tests/job-ledger.test.mjs` — the Law of Two Ledgers — is green.

## 9. `tests/job-split.test.mjs` — CUT-SPEC §8's fifth ship test, which did not exist

`ls tests/ | grep -c job-split` was **0**. Nothing held the standard that these two blockers broke.
New file, 23 tests, driven through the shipped verbs only (`startJob` / `call` / `answer` / `bank` /
`endJob`) and reading the split out of `endJob`'s own return value — the number the end panel prints.
It covers the invariant over eight session shapes, the two regressions above, the cap, the flip, the
no-clock case, a killed tab, and requirement #5 in both directions: a session that really is half
game measures inside `SPLIT` 45–55 %, and one that is a third game prints a third rather than being
rounded up into the band.

**Every claim was made to FAIL first.** A reverted copy of the machine (`scratchpad/nc/state-old.js`,
the pre-fix `addMs` calls restored, imports re-pointed) was run against eight negative controls
carrying the same assertions: **0 pass, 8 fail**. The falsifying runs are the two tables above.

`tests/job-state.test.mjs` "the split meter moves and prices nothing" was rewritten for the honest
definition — same claim (the clock moves no price and no payout), clock-consistent fixture, plus the
partition assertion and a corrupt-meter probe proving the machine will not book time that never
elapsed. **No test was deleted, skipped or weakened.**

*(The `tests/job-split.test.mjs` named in `designs/job-build.workflow.mjs` and
`designs/REPAIR-DECISION.md` is the DELETED pre-CUT layer's file — shapes, seasoning, `SPLIT.deadMs`,
mid-job WALKs. This is a new file for the cut design and shares nothing with it but the name
CUT-SPEC §8 gives it.)*

## 10. Requests

1. **Screen lane — nothing to do, and please do not add anything.** `notes/cut-screen.md` §8 request
   4 asked me for a `state.tick(save, { game, answer })` verb so the screen could attribute the
   result-reading interval. **It is no longer needed and should not be built**: intervals the screen
   does not declare now fall to the study half automatically, so the existing `skipBeat()` calls are
   correct as they stand and the meter is right without a new verb, a new tap or a new number.
   `call`/`answer`/`bank`/`endJob` already pass `now: Date.now()`, which is all the fix requires.
   The one thing that would break it: passing an `ms` on `call` or `bank` that covers more than the
   face-down card. The cap keeps that from inflating the share, but it would misattribute.
2. **Data lane — one stale comment.** `site/data/job.js` line 89 reads
   `tAnswer   ms spent answering`. It is now *the rest of the session* (answering, the flip, and
   reading a graded solution). Comment only; the key, its order and its type are unchanged. Not my
   file, so not touched.
3. **Save lane — request 4 of §5 above still stands** (`reconcileGameDay` over a LIVE session).

## 11. Open issues

1. `state.js` is now 583 lines (was 520): the meter's doc block and `tick`/`bankPile` account for
   all of it. Open issue 1 of §6 above is unchanged in substance — the Ledger-A guard is still the
   file's largest block.
2. The 45–55 % band itself is a **calibration of the design**, not of the meter, and this lane cannot
   assert it from unit tests: it needs a real session on a real phone. `job-split` proves the app
   reports the truth in both directions; if the honest measurement on a real session comes in under
   45 %, CUT-BRIEF's fix is fewer, harder questions — never a change to this file.

---

# ROUND 2 — the fixer pass (machine lane)

Two findings, both against `site/js/job/state.js`. One was a real defect in the meter and is fixed at
the root; one is a design target the loop cannot reach, and this lane has done its arithmetic and
handed it back with the one-line change and the numbers. `node --test tests/` is **GREEN: 1,801
tests, 1,797 pass, 0 fail** (4 skipped, pre-existing). Every new assertion has been made to fail
against a deliberately broken `state.js` — seven controls, §R4.

## R1. [BLOCKER] Idle on the face-down card was booked 1:1 as GAME time — FIXED

**Reproduced first, through the shipped verbs only** (`startJob`/`call`/`answer`/`endJob`, no
re-implementation of the meter), 23 questions, one interruption on the face-down card of Q3:

| dwell on Q3 | printed, before | printed, after |
|---|---|---|
| none | 21 % | 21 % |
| 20 s | 40 % | 40 % |
| 25 s | 43 % | **15 %** |
| 90 s | **67 %** | **9 %** |
| 5 min | 86 % | 4 % |
| 15 min | **95 %** | **1 %** |

The share the student read was **unbounded in the time he spent not playing**, and the face-down card
is the app's own pause point — it is up at session start and after every Continue — so it is the
likeliest screen in the loop to be open when a student stops being present.

**The root.** `tick` booked `min(declared, elapsed)` to `tGame`, and for an absence those two numbers
are the same number, so there was nothing capping it at all. Nobody can tell thinking from absence by
duration alone, so the meter no longer tries. It has a **ceiling**:

```js
export const DELIBERATION_MS = 24_000;
const deliberation = (ms) => (ms > DELIBERATION_MS ? 0 : Math.max(0, ms));
```

and `tick` now reads `deliberation(Math.min(declared, elapsed))`. Three choices in that, each with a
reason and a negative control:

* **24 s is the design's own number, not a taste.** At COMPOSED's fastest published card (20 s),
  CUT-BRIEF's 45–55 % band needs 16–24 s of choosing per question — `job-split` §6 derives both ends
  out of the documents. 24 s is therefore the longest deliberation the design could ever ask for, so
  the ceiling never discards a decision the band wanted, and it does not prejudge R2 either way.
* **A ceiling, not a cap, and this is the whole fix.** Capping at 24 s still books 24 s of a
  90-second absence, so the printed share would be *maximised* by walking away for exactly the
  ceiling. On the 90 s row above: undisturbed **21 %**, uncapped **67 %**, **a cap 24 %** — still
  above the undisturbed session, so the interruption still pays — and the ceiling **9 %**. Crediting
  **nothing** past the ceiling means an over-long dwell adds its whole length to the session and
  nothing to the game half, so it **strictly lowers** the number. NC-B pins the difference.
* **The wall-clock cap runs first.** A screen claiming 999 999 ms over 1 500 ms of session is
  claiming an interval that never happened, not an absence; `min(declared, elapsed)` makes it
  1 500 ms, which is an ordinary call and is credited. NC-C pins the order.

**The published claims.** `screens/job.js:398` — "an interval this file gets wrong can only ever
lower the printed share" — and `job-split` header #5 are no longer contradicted by the shipped path
in the way the finding showed: the behaviour was fixed, neither sentence was softened. See §R3 for
exactly how much of #5 is now true and what is left.

**Cost, stated plainly.** A student who genuinely agonises for more than half a minute over one card
is credited **zero** for it, and the meter under-reports the game. That is the safe direction and it
is CUT-BRIEF's own posture: a low measurement is a fact about the design, never something to fix in
the meter.

## R2. [MAJOR] The 45–55 % band, and the OWNER DECISION that was never taken

**The measurement is not the bug.** The meter partitions the session off `inProgress.startedAt`,
undeclared time falls to the study half, and reading a solution lowers the share — 9 % is what this
loop is. Driven end to end through the shipped verbs, 12 questions:

| deciding | answering | reading | printed |
|---|---|---|---|
| 2 s | 45 s | 15 s | **3 %** |
| 3 s | 20 s | 10 s | **9 %** |
| 5 s | 20 s | 10 s | **14 %** |
| 8 s | 25 s | 5 s | **21 %** |
| 24 s | 20 s | 10 s | 44 % |

**The decision is forced, and `job-split` §8 now proves it rather than asserting it.** Both remedies
on the table are closed:

1. **CUT-BRIEF's own remedy cannot move the number.** "Cut answering time per question (fewer,
   harder questions)": the split is a **ratio**, so fewer questions of the same shape print exactly
   the same percentage — 4, 8, 12 and 23 questions all print **9 %** on the same timings (asserted)
   — and **harder** questions take *longer* to answer, which lowers it (asserted). The sentence is
   incoherent with itself.
2. **A longer game decision is the only lever that raises it**, and padding the face-down card with
   waiting is what the same sentence of CUT-BRIEF forbids — and what R1's ceiling now refuses to
   credit past 24 s in any case.

So: **amend the target.** The arithmetic the amendment needs, all pinned against the shipped
`splitOf` and the shipped ceiling:

* The best share **any** question can print is `24 s / (24 s + its study time)` — one declared
  decision per question (CUT-BRIEF: two taps) credited at most to the ceiling. That is
  **55 / 48 / 44 / 35 / 29 / 7 %** at 20 / 26 / 30 / 44 / 60 / 300 s of study per question.
* The band's floor is therefore reachable only while a question costs **under ~30 s** all in
  (29.9 s, bisected against the engine's own rounding). COMPOSED publishes **20 s – 5 min** per card.
* CUT-BRIEF's own session shape — "10–14 minutes, 8–12 questions" — is 50–105 s per question, so at
  the ceiling it tops out at **48 % at the fast end and 23 % at the slow end**: at the slow end of
  the brief's own shape the band is unreachable *even with the student staring at the card for the
  full 24 seconds the meter will credit*.
* **The honest range of this loop is 3–21 %, centred near 9 %.**

**Not taken here, and why.** This lane owns `site/js/job/state.js`. The band lives in
`site/data/job.js SPLIT` and in `designs/CUT-BRIEF.md` "Session shape", and a fixer editing the
authority so its own build passes the audit is exactly the "soften the claim" move the round forbids.
The request, with the one-line change, is §R5.1. Nothing in the suite now lets the question be
mistaken for open: `job-split` §8 fails the moment any of the numbers above stops being true.

## R3. What is still open on the split, stated precisely — do not read R1 as more than it is

The ceiling closes **absence longer than 24 s**, which is the finding's case and every ordinary
interruption (a call, a locked screen, a parent in the doorway). It does **not** close a dwell
**under** the ceiling: twenty seconds of not being there reads exactly like twenty seconds of
choosing, and no clock can separate them. What the engine can now promise is a **bound** — one
declared interval buys at most one deliberation, so `tGame ≤ decisions × 24 s` whatever the screen
claims (asserted over five shapes, including a screen declaring 999 999 ms per question).

So `job-split` header #5 ("the meter never lifts a low session into 45–55 %") is true for one
interruption of any length, and is **not** airtight against a student who is absent for 20-odd
seconds on *every* card of a fast-card session — that would print the bound, up to 55 %. Closing it
needs **presence**, not duration, and presence is the screen's: §R5.2.

The size of that residual window **is the band's own requirement**, which ties R3 to R2: the ceiling
is derived from the band (24 s is what 55 % demands at COMPOSED's fastest card), so if the band comes
down the ceiling comes down with it and the window shrinks. At a 20 % band the ceiling would be ~5 s
and a sub-ceiling absence could move the printed share by almost nothing. **Amending the band is
therefore also the fix for the hole R1 leaves.**

## R4. Negative controls — seven runs, each against a deliberately broken `state.js`

Same harness as §4: restore a pristine copy, apply a one-line patch (a patch that does not apply
uniquely aborts the run), run `job-split` + `job-state`, restore.

| # | the break | red |
|---|---|---|
| A | no ceiling — `Math.min(declared, elapsed)`, the shipped behaviour before this fix | **8** |
| B | a **cap** instead of a ceiling — `Math.min(DELIBERATION_MS, ms)` | **7** |
| C | ceiling applied to the *claim*, before the wall clock caps it | 2 |
| D | ceiling exclusive at the boundary — a 24 s deliberation discarded | 3 |
| E | ceiling leaked into the study half — the partition breaks | **13** |
| F | `DELIBERATION_MS = 1_800_000` — the fix present but never binding | **7** |
| G | the degraded (no-clock) path left uncapped | 1 |

**G found a real hole in my own tests, which is the point of running them.** The first version of
this fix capped only the clocked path and left the `no startedAt / no now` fallback booking a
90-second absence in full, and *every other test stayed green*. The fallback is now capped too — an
absence is an absence whether or not the page was stamped — and `job-split` §7 has the case.

## R5. Requests

1. **CUT-BRIEF's owner (and the data lane) — take the decision, with the numbers in §R2.** One line
   in `designs/CUT-BRIEF.md` "Session shape" and one in `site/data/job.js` (`SPLIT`). Two options,
   and this lane recommends the first:
   * **Cut the band.** Delete `SPLIT` and the 45–55 % target; keep the measurement and keep printing
     it, which is all CUT-BRIEF's "measures its own split and prints the measured number, never a
     claimed one" actually requires. A target the loop cannot reach is a number to cut, not a number
     to re-tune — and it is the only option that does not replace one unearned promise with another.
   * **Or amend it to `{ lo: 8, hi: 20 }`**, the honest range of the shipped loop, and drop
     `DELIBERATION_MS` to ~6 s to match (see §R3 — a lower band buys a tighter ceiling). Say the word
     and I will re-derive the ceiling and re-run the controls; it is a one-constant change in my file.
   Either way `tests/job-pay.test.mjs:843` and `job-split` §6 assert `[45, 55]` today and belong to
   their own lanes; §8 is written so it survives the amendment.
2. **Screen lane — close the beat on `visibilitychange` / `pagehide`, and §R3's window closes with
   it.** `screens/boss.js:634` already does exactly this for the study layer:
   ```js
   on(document, 'visibilitychange', () => { if (document.visibilityState === 'hidden') … });
   ```
   In `screens/job.js` the body is `skipBeat()` — drop the claim on the interval that is ending, and
   `job/state.js` attributes it to the study half on the next verb, which is the correct answer for
   a screen nobody was looking at. Do the same on `pagehide`. **No new state, no new number, no new
   tap**, and it composes with the ceiling — neither fix needs the other. `job-screen.test.mjs`'s
   `beatAt = ` count assertion (currently 3) will need to admit the new assignment.
3. **Screen lane — `DELIBERATION_MS` is exported and is not a number for the screen.** It never
   reaches a surface, it prices nothing, and no copy may mention it. It exists so the tests can read
   the shipped ceiling instead of re-declaring it.
4. Requests 1–5 of §5 and 1–3 of §10 are unchanged.

## R6. Files touched this round

* `site/js/job/state.js` — `DELIBERATION_MS`, `deliberation()`, `tick` (three lines of behaviour),
  and the meter's doc block. Nothing else: the Ledger-A guard, the five verbs, the payoff calls, the
  serialiser and `endJob`'s `finishPage` are byte-identical. `IN_PROGRESS_KEYS` stays **seven** — the
  ceiling needs no field on the disk. `ROUTE_PATTERNS` untouched (this file has no route).
* `tests/job-split.test.mjs` — `play()` grew `idleAt` / `idleMs` and now counts the credited game
  time by the engine's rule instead of assuming full credit; new **§7** (8 tests, the absence) and
  **§8** (4 tests, the band arithmetic); the `decide: 60_000` fixture in #4 now asserts the ceiling
  and a `decide: 24_000` case was added beside it so the share still runs to 100.
* **No test was deleted, skipped or weakened**, and no mechanic in CUT-BRIEF's delete list came back.

---

# Round 3 — the fixer pass (`machine` lane)

**Owns:** `site/js/job/state.js`, `tests/job-state.test.mjs`. Two findings, both fixed at the root.
No test was deleted, skipped or weakened. No mechanic from CUT-BRIEF's delete list came back, no
number was added to the screen, and no tap was added to a question.

## F1. A requeued review arrived as a dead question — MAJOR, player-feel

**The finding is true and I reproduced it.** A missed Review is copied back onto the page by
`page.requeueReview`, `sealRepeat` seals the copy bidless (`call: { id: null }`), and
`screens/job.js render()` branches on `isObj(gv.call)` — so the copy skipped the face-down card
entirely: no beat, no three calls, no bank button, and nothing on screen to say why. One per missed
review.

**What is NOT the fix, and why.** Pricing the repeat. The seal closes a measured 16–44 % exploit
(§3, r1) and CUT-BRIEF forbids both shapes the alternatives take — a dead tap and a call worth
nothing. The critic's own repair is the right one: render the face-down beat with the three calls
GREYED, then flip. That beat is drawn by `screens/job.js`, which this lane does not own.

**What this lane owned, and fixed: the engine was speaking with two voices.**

`callsFor()` went on listing `econ.offered(pile, streak)` while a call was locked — over the bidless
seal, where `call()` settles at nothing without locking anything, AND over a live bid, where `call()`
throws `called`. The screen greys exactly what this list omits (`reading.offered`), so the engine was
telling the screen that three calls were live and telling the student's tap that none were. A screen
that routed the seal to the face-down beat today would have drawn three live, worthless calls — the
banned shape — off the engine's own answer.

```js
export const callsFor = (save) => {
  const g = stateOf(save);
  return g && !isObj(g.call) ? econ.offered(g.pile, g.streak) : [];
};
```

`callsFor` is now, exactly, **the calls `call()` would accept right now**. Over the seal it is empty,
so the beat's three calls grey themselves with the same single dashed border an unaffordable call
already draws — no new control, no new copy, no new number, and no second opinion about the rules.

Added beside it, derived and not stored (this lane added no field to the record):

```js
export const isBidless = (save) => { const g = stateOf(save); return isObj(g?.call) && g.call.id === null; };
```

Verified through the shipped verbs on a review that is missed and requeued: `callsFor → []`,
`priceOf(save, null) → { pay: 0, cost: 0 }`, `bank()` **permitted and correct** over the seal
(32 → `today` 32), and the repeat still pays nothing and still moves no streak.

**REQUEST — screen lane, and F1 is not closed until this lands.** One line in `screens/job.js`
`render()`:

```js
if (isObj(gv.call)) return renderAnswer();          // today
if (isObj(gv.call) && !state.isBidless(s)) return renderAnswer();   // and the seal gets its beat
```

then let `renderCall()` run for the seal and auto-advance after `FLIP_MS` instead of waiting for a
tap (there is no live call to tap — `callsFor` is empty, so all three render disabled). Everything
else is already in place and needs no change: `readingOf` maps `id: null` to `call: null`
(job.js:208), so `viewModel` returns phase `'call'`, the strip prints the skill and the drawn rate,
and `bank.enabled` is `pile > 0` — the control the student loses for a whole question today. One tap
FEWER than a normal question, never one more.

## F2. The split's denominator could start before the session did — MAJOR, split-honesty

**True, and reproduced in plain node** (`startPage` at T, `startJob` at T+120 s):

```
page startedAt  1789596000000   after startJob 1789596000000   (game opened at 1789596120000)
tGame/tAnswer   4000 125000  => split 3 %        true session wall 9000 ms, meter measured 129000 ms
```

`page.startPage` returns an existing `inProgress` untouched when one is present and `opts.force` is
absent, and `startJob` wrote `ip.game` beside it without re-stamping. `pageInProgress` only bites at
`idx > 0`, so an unanswered page is adopted whole — and its stamp came with it. Two reachable paths,
both named by the finding: open Today's Page, answer nothing, come back to the game; or toggle the
game off and on in Settings (`leaveSession` deletes `inProgress.game`, keeps `inProgress`). The gap
always lands in `tAnswer`, so the error was only ever downward — an overnight gap printed 0 %.

**Fix — `startJob` re-stamps the clock when it adopts a page it did not open** (`state.js`):

```js
const prior = resumePage(s);                 // the page already open, if there is one
const ip = startPage(s, { ...opts, now });
…
if (ip === prior) ip.startedAt = now;
```

Identity is the exact test: `startPage` hands back the SAME object when it resumes and assigns a new
one when it composes, so `ip === prior` is precisely "this verb adopted a page it did not open".
`opts.force` composes, so it never re-stamps (it is already stamped `now`); a LIVE session returns at
`if (live && !opts.force) return live` long before this line, so a resumed session keeps its clock
and a killed tab still recovers its meter. After the fix the same fixture prints **44 %** over a
9,000 ms session.

The published claim at `state.js` `startedAtOf` — *"written by the study layer's own `startPage` at
the instant `startJob` opens the page"* — was false on this path and is rewritten to what the code
now does. `designs/CUT-SPEC.md` §8's *"the halves partition the session … so the number is the
session's"* is true again (spec lane: no edit needed).

**Checked against the ledger, as the finding asked.** `tests/job-ledger.test.mjs` **22/22 green
after the change.** `screens/run.js captureJobBefore` / `commitJobRun` take `runs[].startedAt` from
`inProgress.startedAt` and dedupe on it: the adopted page was never finished, so no run record
carries the old stamp and no collision is possible. The change also moves the game route TOWARD the
flat one — `screens/run.js:898` stamps the flat Page's run record with `Date.now()` at mount, i.e.
it re-stamps on every resume already.

## F3. Tests — 11 new, every one made to FAIL against a deliberately broken engine

All in `tests/job-state.test.mjs` (this lane's). Two new describes:

* **"the repeat is sealed bidless, and the engine says so with one voice"** — 6 tests: the copy
  arrives sealed; `callsFor` is empty over the seal and `priceOf(save, null)` is `{0, 0}`; **bank is
  reachable over it** (the control the missing beat withholds); the repeat still pays nothing and
  moves no streak; `callsFor` is empty over a live bid too and every id throws `called` there;
  `isBidless` is false everywhere else.
* **"the split is measured from the game's own start, not an earlier page's"** — 5 tests: the
  re-stamp itself; the printed split of a session opened 2 minutes after its page **equals** the
  split of the identical session with no gap (and both are the true 40 %); an overnight gap does not
  print 0 %; a LIVE session is never re-stamped and keeps what it measured; a page composed by the
  session is still stamped at the session.

**Mutation runs** (a copy of `site/` + `tests/` in a scratch dir, one defect at a time, then
restored):

| mutant | failures |
|---|---|
| `if (ip === prior) ip.startedAt = now;` deleted | 4 — the re-stamp, the equal-split control, the overnight case, the composed-page case |
| `callsFor` back to `g ? econ.offered(…) : []` | 2 — the seal's greying, the live bid's |
| `sealRepeat` never fires | 3 — the copy arrives sealed, the greying, the repeat pays nothing |

The "a LIVE session is never re-stamped" test PASSES under mutant 1 on purpose: it is the guard
against over-fixing, not a proof of the fix.

## F4. Files touched, and what was not

* `site/js/job/state.js` — `callsFor` (one clause), new `isBidless`, `startJob` (two lines), and two
  doc blocks rewritten to what the code does. The Ledger-A guard, `serialize`/`deserialize`, the five
  verbs' pricing, `sealRepeat`, `tick`, `splitOf` and `endJob`'s `finishPage` are otherwise
  untouched. No `Math.random`, no DOM, no new import, no route.
* `tests/job-state.test.mjs` — the two describes above, appended.
* Nothing else. `ROUTE_PATTERNS` stays 13.

**Note on a concurrent edit.** Another agent was writing `tAway` / `awayAt` into this same file and
into `site/data/job.js IN_PROGRESS_KEYS` while this pass ran; all of my edits are surgical and none
of theirs was reverted. Their work leaves `tests/job-state.test.mjs:716` ("serialize is total,
key-ordered and idempotent") red, because the record now serialises nine keys and that assertion
still lists seven — **that failure is theirs to close, not mine**, and it is the only one left in the
file.

# cut-meta — the META lane of THE CUT

**Authority** `designs/CUT-SPEC.md`, under `designs/CUT-BRIEF.md`; `BUILD-POLICY.md` wins.
**Owned** `site/js/screens/settings.js`, `site/js/screens/stats.js`, `site/data/trophies.js`,
and `tests/cut-meta.test.mjs`. Nothing else was touched.

`node --test tests/cut-meta.test.mjs` — **47 tests, 47 pass, 0 fail.**

---

## 1. What this lane had to do, and what it refused to do

CUT-SPEC gives the meta surfaces exactly one job each:

* **Settings** prints the toggle and the three bands (CUT-BRIEF math #2: *"the bands are printed in
  Settings"*). Seven strings, §6 verbatim, no eighth.
* **Stats** prints **nothing** about the game. The two numbers the game keeps — today's points and
  the best day — are printed where they are earned, at the end of a session.
* **trophies.js** prices **nothing** about the game. A point buys nothing but beating
  `save.player.best`.

So the build here is small on purpose, and one whole instinct was refused: **there is no Stats panel
for the game, and no game trophy.** A "best day" tile, a points sparkline, a "banked 500" trophy —
each is a second collection bolted to a currency that exists to be spent on nothing, which is the
meta-layer the brief deleted. When in doubt, cut. What this lane added instead is the *proof* that
the one number the app does print in Settings is the number the engine computes.

## 2. What changed

### `site/js/screens/settings.js`

**A live defect, fixed.** The demolition pass deleted `dataCard()`'s definition and left `paint()`
still calling it. `#/settings` threw `ReferenceError: dataCard is not defined` on mount and **the
whole screen rendered nothing** — theme, sound, daily goal, test date, the Readiness formula, the
export, the game toggle. No test in the suite could see it, because the screens have no DOM in
`node --test`. `dataCard()` is restored verbatim from the last commit (it is pure COMPOSED S6: export
textarea, `<a download>`, copy, import, file import, backup restore, erase-everything) and
`tests/cut-meta.test.mjs` §5 is the test that now catches this class of bug. Verified in a real
browser: `node qa/shot.mjs "#/settings"` renders every card with **zero console errors**.

**The game card.** It was `card('The game', row('The game', switch))` — the title printed twice, and
§6 has six strings, not seven. It is now a card with no `<h2>`: the switch's own label is the title,
so each allowed string is printed exactly once. Measured on a 390 px phone, the card reads:

```
The game                                    [switch]
not sure — you get it right less than 2 times in 3
pretty sure — between 2 in 3 and 4 in 5
sure — more than 4 in 5
a call the pile cannot cover is greyed out
```

Every one of those lines comes from data (`COPY.settings.*` and the shipped `BANDS`); the card body
contains **no string literal at all** except the element id `set-game` and the toast tone `ok`.

**Dead code removed:** `neg()` (the U+2212 formatter for the cut rating line) and `pseudo()` (the
multi-line block the five cut formula panels used). Both had no callers left.

### `site/js/screens/stats.js`

Already clean of the game after the demolition; this lane verified it and locked it. One dead import
removed (`skillById`, unused since the skills block was rewritten). **No game surface was added.**

### `site/data/trophies.js`

Already free of the six cut trophies; this lane verified it and locked it. **No game trophy was
added.** The catalogue stands at **60**.

## 3. Exported API

This lane adds no runtime export. `mountSettings()` and `mountStats()` keep their router contract
(`mount → render(el) → cleanup`); `data/trophies.js` keeps `trophies`, `TROPHY_IDS`, `trophyById`,
`trophiesOfGroup`, `GROUPS`, `COUNTERS`, `COUNTER_KEYS`, `ORIGINAL_IDS`, `FAMILY_IDS`,
`TROPHY_SHEETS`, `sheetOriginals`.

`tests/cut-meta.test.mjs` exports its checkers so they are testable and reusable:

| export | signature |
|---|---|
| `evScaled` | `(pay, cost, k, D) → number` — `D ·(pay·q − cost·(1−q))` at `q = k/D`, integers only |
| `argmaxCall` | `(calls, pays, costs, k, D, m=1) → index` — ties take the lower call |
| `measureBands` | `(calls, pays, costs, {D, m}) → [{call, index, loK, hiK}]` — maximal runs of constant argmax |
| `bandClaim` | `(copy) → {lo:[n,d], hi:[n,d]} \| null` — the fractions a band line's WORDS claim |
| `reduce` | `(k, D) → [n, d]` |
| `stringLiterals` | `(src) → string[]` — every string literal, comments removed |
| `functionBody` | `(src, name) → string \| null` — brace-matched body of `function name(` |
| `copyKeysUsed` | `(src) → string[]` — every `COPY.a.b` path a source reads |
| `undefinedCalls` | `(src, {globals}) → string[]` — every bare `name(` whose `name` is bound nowhere |

## 4. The math, and the numbers it produced

The bands are a **claim about arithmetic** printed at a 14-year-old: *"you get it right less than 2
times in 3."* CUT-BRIEF's hard limit — *no number on any surface that is not exactly the number the
engine computes* — applies to prose fractions. So §1 of the suite re-derives the bands from the
**shipped** `PAYS` / `COSTS` by exhaustive grid search and checks the sentences against the result.

The sweep is **integer**: `q = k/D` with `D = 1,500,000` (divisible by 3, 4 and 5, so 2/3, 3/4 and
4/5 are all exact grid points), and the comparison is `pay·k − cost·(D−k)`. No float, so an edge is
an edge and not a rounding.

| assertion | measured |
|---|---|
| each call uniquely optimal on one non-empty contiguous band, in call order | **3 bands of 3 calls**; `not sure` k ∈ [1, 1 000 000] = **66.7 %** of q, `pretty sure` [1 000 001, 1 200 000] = **13.3 %**, `sure` [1 200 001, 1 499 999] = **20.0 %** |
| edges come from the cost GAPS, not a tolerance | Δpay = **[1, 1]**, Δcost = **[2, 4]** = **2·Δpay** then **4·Δpay**; crossings `Δcost/(Δpay+Δcost)` = **2/3** and **4/5** |
| the sweep turns over at those same points | `runs[0].hiK/D` = **2/3 exactly**, `runs[1].hiK/D` = **4/5 exactly**; the bands abut (`loK = prev.hiK + 1`) |
| the middle call is not dominated | `not sure` vs `sure` cross at **3/4**, strictly inside (2/3, 4/5) |
| the shipped `honestCall()` agrees with the table | **0 bad of 1 499 999** grid points |
| the streak multiplier moves neither edge | **0 bad of 74 995** cells (`m` = 1…5 × 14 999 points) |
| `BANDS.lo` / `.hi` — the rows Settings prints — carry the measured edges | 3 of 3 |
| the WORDS name those same fractions | `bandClaim` of each line = **{0, 2/3}, {2/3, 4/5}, {4/5, 1}** |
| the three lines are CUT-SPEC §6 verbatim | 3 of 3 |

Settings' surface (§2): the game card's literals are exactly `{set-game, ok}`; the `COPY` keys the
whole screen reads are exactly `{settings.title, settings.on, settings.off, settings.greyed}`; those
four resolve to §6 verbatim; the seven printable strings are **7 distinct**; both the bands and the
greyed note are gated on the toggle; Settings imports exactly one module under `js/job/` and calls
none of `startJob`, `endJob`, `shouldPush`, `payOf`, `costOf`, `offered` — it prints, it does not play.

Trophies (§4): **60 trophies × 12 strictly-better saves = 720 evaluations**, earned counts
`0 → 1 → 1 → 3 → 4 → 7 → 15 → 16 → 18 → 19 → 20 → 43`, with **0 un-earned** and **0 falling meters**
— CUT-BRIEF math #6 on this surface. And blindness: a save carrying `player.best = 9 999`,
`game.today = 9 999` and a full `inProgress.game` produces a **byte-identical** tile list to the same
save without one, and a maximal game record on a fresh save earns **exactly nothing**.

## 5. Negative controls

Every checker in the suite has a negative control **inside** the file (a deliberately broken payoff
table, a hand-typed band line, an un-earning tile), and on top of that each surface assertion was run
against a deliberately broken copy of the shipped source. Baseline before and after every one:
`fail = 0`.

| # | the break | tests that failed |
|---|---|---|
| **A** | delete `dataCard()`'s definition, keep `paint()`'s call (the real demolition bug) | 3 — *settings.js has no call to an undeclared name*, *Settings still builds the export card* |
| **B** | replace `CALL_BANDS.map(…)` with `hint('sure — more than 3 in 4')` | 2 — *the game card holds no hard-coded copy* |
| **C** | print `COPY.pays({n: 27})` in Settings | 2 — *Settings reads only the four Settings strings out of COPY* |
| **D** | ungate the bands so they print with the game off | 2 — *turning the game off takes the bands with it* |
| **E** | add a Stats panel printing `` `pile ${save.player.best}` `` | 3 — *it prints none of the game's strings*, *it reads no game save key* |
| **F** | add a trophy `ctx => ctx.save.player?.best >= 500` | 2 — *no predicate, name or condition names a cut mechanic* |
| **G** | add a trophy that reads the game **without naming it** (`Object.values(ctx.save).some(v => v.today >= 1)`) | 3 — *every trophy is blind to save.player / save.game / inProgress.game*, *a maximal game record earns nothing* |

G matters most: it proves the **behavioural** blindness check has teeth on its own, not just the
source regex beside it. E was found to slip the first version of the save-key scan — a read hidden in
a template substitution (`${save.player.best}`) is invisible to `stripCommentsAndStrings`, which does
not re-enter `${…}` — so that check now scans the source with comments removed and strings intact.
The in-file controls also pin the two things a green run would otherwise not prove: a call priced so
it is never optimal **disappears** from `measureBands` (2 bands, not 3), and moving `COSTS.sure`
8 → 7 moves the measured edge to 3/4 so the printed words stop matching.

Files were restored from a scratch-pad copy after every break and verified by `shasum`. **No `git`
write command was run at any point** — no commit, push, stash, checkout or reset.

## 6. Test status

`node --test tests/cut-meta.test.mjs` — **47 / 47 green.**

`node --test tests/` — **1 588 tests, 1 584 pass, 0 fail, 4 skipped.** The four skips are the same
four Playwright-gated browser arms the demolition pass left (`notes/DEMOLISH.md`). Three earlier
runs during this lane's sitting were red on seven tests in *other* lanes' files — `home.js`'s
`planOpts` contract, three `job-pay` requirements, and the `layout-root` measured arm — all of them
in flight at the time and all of them green by the final run. None was in a file this lane owns.

Every suite that covers or imports this lane's files is green: `cut-meta`, `trophies`, `fix-stats`,
`integration-w3`, `job-save`, `final-layout`, `layout-audit`, `coverage` — **143 / 143**.

**No test was deleted, skipped or weakened by this lane.** No test of a cut mechanic remained in a
file this lane owns, so there was nothing here to delete; the demolition pass had already removed the
six game-trophy fixtures from `tests/trophies.test.mjs` (recorded in `notes/DEMOLISH.md` §3).

## 7. Requests

1. **`job/econ.js` → `job/pay.js` (the payoff lane).** CUT-SPEC §8 names the module `pay.js`;
   `settings.js` currently imports `{ BANDS as CALL_BANDS } from '../job/econ.js'`. When you rename
   it, change that one line — it is the screen's only reach into `js/job/`. `tests/cut-meta.test.mjs`
   resolves the payoff module **from that import statement**, so the proof follows the rename
   automatically, and if the rename lands without the import being fixed the suite fails loudly
   (`settings.js must import BANDS from a module under js/job/`) instead of the app breaking quietly.
2. **Do not move `BANDS.copy` out of the payoff module.** Settings prints the band lines from the
   shipped table precisely so the panel cannot publish an arithmetic the game does not use. If the
   copy moves to `data/job.js`, the words and the table can drift apart and the §1 proof goes with it.
3. **`data/job.js SKILL_GROUPS` / `WINGS`** (whoever owns `js/gen/asn-reason.js`): still exported for
   that one study generator. No surface prints it; move the table into the generator and delete the
   export. Carried forward from `notes/DEMOLISH.md` §6.
4. **`js/app.js` (the screen/shell lane):** the header still prints `hdr-readiness` and `hdr-tminus`
   during play — visible in the `#/settings` screenshot as `0` and `set test date`. Whether
   CUT-BRIEF's three-number limit reaches the app shell is the screen lane's call, not this one's,
   but the limit says *at most three numbers on screen at once during play* and the shell currently
   adds two more above the strip.

## 8. Open issues

* **`#/settings` has no DOM test.** §5's hole-finder is a static scan: it catches a call to a name
  that exists nowhere (the `dataCard` bug), but it cannot catch a call with the wrong arguments or a
  render that throws inside a DOM API. A jsdom-free smoke mount of the screens would; building one is
  a shared-infrastructure job, not this lane's file.
* **`undefinedCalls` is deliberately conservative.** A name used only as a *value* (a default, an
  argument) counts as bound, and code inside a template substitution is invisible because
  `stripCommentsAndStrings` does not re-enter `${…}`. Both failure modes are in the safe direction
  (a missed hole, never a false alarm). Its negative controls pin that behaviour.
* **Settings prints "Sure / Probably / Guess" in *While you answer*.** That is COMPOSED's study-layer
  confidence row, not the game, and the study layer is untouched by the cut — but the word *Sure* now
  means two different things on one screen. Naming it here rather than deciding it: the fix belongs to
  whoever owns COMPOSED's copy, and it is a rename in the study layer, not in the game.
* **The game card has no `<h2>`** where every other Settings card has one. That is the direct
  consequence of §6 having six strings: a heading would have to repeat *The game*. It reads as a
  single setting row, which is what it is, and `.set-card`'s 12 px grid needs no first child.

---

# ROUND 1 FIX — the switch was a door onto the live session

**Fixer lane:** meta, round 1. **Owned, and all that was touched:**
`site/js/screens/settings.js`, `tests/cut-meta.test.mjs`.
`site/js/screens/stats.js` and `site/data/trophies.js` were re-read and are untouched — neither
names `inProgress.game`, `save.game` or `save.player`, so the finding has no surface there.

`node --test tests/cut-meta.test.mjs` — **61 tests, 61 pass, 0 fail** (was 47).

## The finding

> [MAJOR] Switching the game off mid-session hands the live queue to `#/run/page`: questions can be
> dodged at zero cost, and finishing there silently destroys the unbanked pile. (`settings.js:287`)

Confirmed on the shipped code before changing a line (the payoff table has since been retuned by
the engine lane — see *In a real browser* below; nothing in the fix or its tests pins these numbers):

```
locked "sure" at x5 on item c1 | pile 146 | pays 50 costs 40
gameOn = false | hasLiveJob = true | inProgress.game still = {"pile":146,"streak":5,"call":{"id":"sure","at":1000},…}
after answering it WRONG on #/run/page: pile 146 streak 5 call {"id":"sure","at":1000} | idx 1 | now current item c2
after finishPage on #/run/page: inProgress = null | game.today = 0 | player.best = 0
```

and one detail the report did not have: toggling **back on** mid-page left `pageInProgress` null
(it requires the absence of a game record), so the student walked straight back into the live
session with the ×5 streak **and the `sure` bid still locked**. The loop was repeatable per question.

## The fix — `leaveSession()` in `settings.js`

`settings.game = v` is no longer the whole of the toggle. The switch **closes the session before it
flips**, in one `update()`, close-out first:

```js
update((st) => { if (!v) leaveSession(st); st.settings.game = v; });
```

`leaveSession` does three things and nothing else:

1. **A locked bid is settled, not dodged.** `priceOf(st, g.call.id).cost` is the cost the strip
   already quoted the student when the bid was locked; the pile becomes `max(0, pile − cost)` and the
   streak goes to ×1 — `answer`'s own two lines, with the number read from the engine, never
   recomputed here.
2. **The pile is banked** through the engine's `bank()`. Nothing is destroyed; `game.today` and
   `player.best` still move through the one implementation that owns them.
3. **The record is dropped**, while `inProgress` — the page, its queue, its index — is left exactly
   as it was. `#/run/page` resumes the same questions and files the run itself, so no page is counted
   twice and no due question leaves the schedule.

The record is dropped even if the settle throws on a malformed save: it must never outlive the switch.

**Why this is not a cheap way out.** Answering costs `cost` only when you are wrong; leaving costs it
always. And dropping the record makes `state.pageInProgress` true, so flipping the switch back on
mid-page sends the student to `#/run/page` (`screens/job.js`) and `startJob` refuses
(`page-in-progress: 2 left on Today's Page`) — the rest of that page is flat. Leaving is strictly
dominated by playing in every reachable state, which is what CUT-BRIEF math #5 asks of every exit.

### A hole the first draft of the fix opened, and why the final one does not

The obvious close-out is `endJob`'s: *"an unanswered bid can neither pay nor cost"*, so void it and
bank. That reasoning holds for `endJob`, which runs when the page is over — it does **not** hold for
the switch, which is reachable with **the question already on screen** (the dock is on the run
screen; `job.js:157` measures it at 117 px). Voiding would have sold back exactly the bail-out
`bank`'s own refusal exists to prevent — *"lock, read the question, and bank out of a bid you no
longer like"* — free on the last question of a page, where forfeiting the rest costs nothing.
`tests/cut-meta.test.mjs` §6 keeps that draft alive as a negative control.

### What was deliberately NOT added

No message, no number, no tap, no new setting, no new save key. Nothing is lost any more, so there is
nothing to apologise for; the points are printed where they are earned, at the end of a session.
A "your N points are banked" toast would have been a game number on a surface the lane keeps free of
them, and a deferred-off flag would have been a new piece of state for the switch to disagree with.

## Tests

`tests/cut-meta.test.mjs` §6 — **11 new sub-tests over two `test()` blocks.** Nothing was deleted,
skipped or weakened; one sub-test was rewritten (below) and every other assertion in the file stands.

§6 does **not** paraphrase the fix. It reads the shipped `leaveSession` body out of `settings.js`
with the existing `functionBody()` checker and runs it against the shipped `job/state.js`, so there
is one copy of the logic under test and it cannot drift:

| assertion | measured |
|---|---|
| the toggle closes then flips, in one `update()`, and `leaveSession` has exactly one caller | matched |
| the record never survives the switch | `stateOf` null · `hasLiveJob` false |
| the page is untouched | queue byte-identical, `idx` 0, `counters.pages` **1** after `finishPage` |
| (b) the pile comes home | `today` 20 → **166**, unchanged by finishing flat |
| (a) the dodge is closed | `today` = 146 − `priceOf('sure').cost`, read from the shipped table, never pinned; toggling back on → `pageInProgress {idx:1,left:2}`, `startJob` throws `page-in-progress` |
| leaving never beats answering | **0 of 165** reachable `call × streak(1–5) × pile(11 values)` states where leaving > missing or > answering right; `left === miss` in all 165 |
| no bid live | an ordinary bank: 146 → `today` 146 |
| Ledger A | byte-identical across `LEDGER_A_KEYS`, with and without a live bid |
| a malformed record | dropped, `today` finite and ≥ 0 |
| no live session | the save is byte-identical before and after |

Negative controls (both fail loudly if the rig goes vacuous): the **old one-liner toggle** — record
survives, pile unpaid at 146, bid still `{id:'sure',at:1000}`, `finishPage` → `today 0`; and the
**void-instead-of-settle** draft — `today` 146 > 106, the free bail-out. Degraded variants of the
shipped body were also run through the same rig out-of-tree (drop the bank, drop the delete, void
instead of settle, no close-out at all): every one fails at least one §6 assertion.

**One sub-test rewritten, not weakened.** `CUT §2 → "Settings reaches no game engine"` asserted
`jobImports deepEqual [PAY_SPEC]`. Settings now imports a second module under `js/job/`, because the
switch has to be able to close a session. The replacement is *stricter* where it counts: it pins the
import list to `[pay, state]`, pins the named imports from `state` to exactly
`{bank, priceOf, stateOf, writeGame}` (a fifth verb fails), keeps the whole banned list and adds
`callsFor`, `answer` and `call(` to it. Settings still may not start a session, take a turn, or quote
a price for a call the student has not made.

## In a real browser

`#/settings` was measured as well as reasoned about, because this screen has no DOM test (§8 above).
A scripted Chromium run over the served `site/` drove the real screens end to end — start a session
at `#/run/job`, seed the exploit's own pile onto it, lock `sure` at ×5, then walk to `#/settings`
mid-question and flip the switch:

```
session started : {"pile":0,"streak":1,"call":null,…} | queue 14
seeded pile     : {"pile":146,"streak":5,…}
controls        : not sure · pretty sure · sure · bank      (all enabled at pile 146)
locked call     : sure
after the call  : {"pile":146,"streak":5,"call":{"id":"sure","at":…}} | game.today 0 | best 0
after the switch: settings.game false | inProgress.game undefined | inProgress kept idx 0 of 14
                  | game.today 53 | best 53
Home primary    : {"text":"Continue page · 1 of 14","href":"#/run/page"}
#/run/page      : idx 0 | game record undefined | today 53
console errors  : []
```

`53 = 146 − 93` is the settle, and 93 is exactly what `priceOf` quoted for `sure` at ×5 with a pile
of 146 at the moment of the run. **That number is not stable and is not meant to be** — the engine
lane retuned `costOf` mid-round (a `shareOf(pile)` term landed, and the same fixture read 40 an hour
earlier). Nothing in the fix or in §6 pinned it: `leaveSession` reads the cost from the engine and
§6 derives every expectation from the shipped table, so the retune moved this transcript and broke
no assertion. The one place that *had* pinned `40` was a fixture guard in §6; it now asserts only
that the fixture exercises a settle at all (`0 < cost ≤ pile`), which is what it was there for.

The page survived whole (14 items, index 0), Home now offers the flat page, `#/run/page` carries no
game record, and `#/settings` renders every card with **zero console errors**
(`node qa/shot.mjs "#/settings"` — `horizontalOverflow: false`, `errors: []`). Flipping the switch
back on at index 0 does re-enter the game, correctly and profitlessly: nothing had been answered, so
`pageInProgress` is null and the new record starts at pile 0, streak ×1 — the 53 is already banked
and the bid is already paid.

### The state of `node --test tests/` when this lane finished

`tests/cut-meta.test.mjs` is **61 / 61 green**, re-run against the table as it stood at each of the
three retunes that landed under it during the round.

The whole-repo run went **1710 / 1710 green at 20:05** and then **37 failing at 20:22**, every one of
them in `job-pay`, `job-ledger`, `job-screen` and `job-state`, with `site/js/job/pay.js` and
`site/js/job/state.js` being written while the run was in flight (`state.js` last touched 20:21:50,
mid-run; nine of the failures are `JobStateError: called: null` thrown out of `state.js call()`,
which is a half-landed edit, and the rest are the `costOf` cap/share retune moving `job-pay`'s
sweeps). **None of those four suites imports a file this lane owns** — `site/data/trophies.js` and
`site/js/screens/stats.js` have not been written since 18:00, before this lane started, and
`screens/settings.js` is in no engine suite's import graph. They are the engine lane's in-flight
work, not this fix's, and they are not this lane's files to repair.

## Requests

1. **`site/js/screens/run.js` (run lane) — the other door.** The switch was the only door a student
   could *reach*, and it is shut. A **typed or bookmarked `#/run/page`** with `inProgress.game` live
   still is not: `run.js:839-847` resumes the game's own page there with no gate. The mirror of
   `job.js:209`'s `pageInProgress` gate is one line at the top of the page branch —
   `if (state.stateOf(getState())) { navigate('/run/job'); return () => {}; }` — refusing the flat
   runner while a session is live. This is the critic's own suggested fix (a); it is not a one-line
   *addition* to a file I own, so it is filed here rather than made.
2. **`site/js/screens/job.js` (run lane) — a live button that cannot do anything.** By reading, not
   by measurement: `viewModel` offers bank when `phase === 'flip'` (`job.js:165`) and `renderFlip`
   re-mounts it deliberately ("bank is live through the beat too: the model says so, and the DOM must
   not disagree", `job.js:411`) — but the flip is exactly the window in which `g.call` is set, and
   `state.bank` refuses over a live call by design. `doBank` catches the throw and logs "bank
   refused", so during the beat the button is enabled and inert. Either the offer or the refusal is
   wrong; the refusal is load-bearing, so it is probably the offer. Not this lane's file and not this
   lane's finding — naming it because §6 walked past it.

---

# Round 2 — the meta lane's fixer pass

One finding, one BLOCKER: **`settings.game = false` is NOT byte-identical COMPOSED — three ungated
changes reach the study app, and no test can see them.**

**Verdict: CONFIRMED, and under-counted.** There is a fourth. The magnitude of one of the three is
smaller than the finding states, and that correction is below with the command that produced it.
`node --test tests/cut-meta.test.mjs` → **77 / 77**, up from 61; nothing was deleted, skipped or
weakened, and no assertion in §§1–6 was touched.

## 1. What was measured, and on what

The pre-game tree is **`3a57ff5`** — the last commit before any game code. (`ca53259` is the
pre-REPAIR *game* commit; diffing against it hides the whole elaborate layer, which is why the
finding names `3a57ff5` and so does this note.) It is **extracted, never checked out** — no
`git checkout`, `reset`, `stash`, `commit` or `push` was run at any point in this lane:

```
mkdir -p /tmp/pregame && git archive 3a57ff5 | tar -x -C /tmp/pregame
```

**`notes/cut-meta-domdiff.mjs` is new and is this lane's evidence**, committed next to the note
rather than left in a scratch directory so the measurement survives the round. It serves both trees,
writes the same fixture save with `settings.game = false` into both, renders `#view`, and diffs:

```
node notes/cut-meta-domdiff.mjs site /tmp/pregame/site /tmp/pregame/qa/fixtures/audit
  → 2 of 77 route × fixture cells differ          (11 pre-game fixtures × 7 study routes)
```

## 2. The three, re-measured

**(a) `site/js/app.js:437` — CONFIRMED.** `document.addEventListener('click', sameRouteClick)` is
installed in `boot()` unconditionally, and `app.js` reads no flag:

```
grep -nE "gameOn|settings\.game" site/js/app.js     → (nothing)
```

Measured by the script above, game **off**, on every route that has an anchor whose `href` is the
whole current URL: `same-route remount false → true`. With the game off, the study app re-mounts the
screen under a student who taps the header Home glyph. COMPOSED did nothing.

**(b) `site/js/plan.js:517 + :548` — CONFIRMED, and this is the only DOM difference in the sweep.**
It is also **smaller than the finding says.** The finding reports *"seven focusable links on Today
become zero focusable elements."* That is not what happens: `pillHref` is `'#/today'` only for
**page**-kind pills, so the Night and Test pills keep their `href` in every state. The worst case I
could construct — a far test date, so the strip is full — is **six strip links → two**:

```
--- farDate / PREGAME --- links=6          --- farDate / SHIPPED --- links=2
   page   today    <A> href=#/today           page   today    <A> href=null
   page   planned  <A> href=#/today           page   planned  <A> href=null
   page   planned  <A> href=#/today           page   planned  <A> href=null
   page   planned  <A> href=#/today           page   planned  <A> href=null
   gap    planned  <SPAN> href=null           gap    planned  <SPAN> href=null
   fixed  planned  <A> href=#/night           fixed  planned  <A> href=#/night
   fixed  planned  <A> href=#/morning         fixed  planned  <A> href=#/morning
```

On the eleven shipped audit fixtures it is **four strip links → three**, on `aced.json` only, on
`#/today` and `#/plan`; the other nine fixtures have no page-day pill in the strip and are
byte-identical. The defect is real and the direction is right. The number is not: it is four of six
at worst, not seven of seven, and it is zero on nine of eleven fixtures.

**(c) `site/css/screens.css:807` — CONFIRMED, and it is the only non-additive CSS change in the
whole game round.** Everything else the game added to `screens.css` is an appended block:

```
diff /tmp/pregame/site/css/screens.css site/css/screens.css | grep '^<'
  <    row, just above the thumb. On a laptop the column is capped and centred. */
  < .blitz-card { … max-height: 560px; … }
```

`theme.css`, `base.css`, `components.css`, `figure.css`, `motion.css`, `widgets.css`: byte-identical.

**(d) `site/js/page.js` — NEW, not in the finding.** CUT-SPEC §8 lists `page.js` on its **Untouched**
line. It is not untouched: the demolition left three imports behind that nothing in the file uses —
`rngFrom`, `overdueDays as overdueDaysOf`, `isMastered`:

```
for n in rngFrom overdueDaysOf isMastered; do grep -c "\b$n\b" site/js/page.js; done   → 1 1 1
```

One occurrence each, and that one occurrence is the import line. No behaviour changes — which is why
the critic's 400-save `composePage` sweep came back clean — but the file is not byte-identical to
COMPOSED and the Untouched line says it is.

**What is NOT wrong.** The finding's scope statement holds everywhere I could push on it. All
**61** files on CUT-BRIEF's "the study layer is untouched" list — `js/grader/*`, `js/gen/*`,
`js/widgets/*`, `js/figure/*`, `xp.js`, `mastery.js`, `schedule.js`, `readiness.js`, `rarity.js` —
hash byte-for-byte to `3a57ff5`, and the file *set* is pre-game's too. `days.js` is untouched.
`#/binder`, `#/stats`, `#/mock`, `#/sheet` and `#/night` are byte-identical on all eleven fixtures,
with zero console errors on both trees.

## 3. Why the fix is not in this lane's three files, and what is

Every root cause is in a file this lane does not own: `app.js`, `plan.js`, `screens.css`, `page.js`.
**BUILD-POLICY §2** — which the ticket itself says overrides everything — is explicit: *"Each ticket
may create/modify only the files it owns… If you need a change in a file you do not own, write the
exact request in `notes/<ticket>.md` under 'Requests'."* The one-line-addition exemption beside it is
for *"an import, a route entry, a CSS link"*, and a behaviour gate is none of those. They are filed
in §5 below.

Two of them are also actively **owned and pinned by another lane right now**, so a unilateral revert
here would break passing assertions in someone else's suite rather than fix anything.
`qa/cut-home.mjs`, driven by `tests/cut-home.test.mjs:768`, asserts (b) as designed behaviour —

```
ok   …and carries no href (a link to here is not a link) — hasHref=false
ok   …and tapping it does not re-mount Home — remounted=false
note self-href anchors left on #/today: hdr-home, hdr-tminus (this lane owns none of them
     — see notes/cut-home.md Requests)
```

— and that last line is the home lane having already filed (a) against the app shell. Two lanes
fixing one defect in one file is how a tree gets clobbered.

**So this lane fixed the half that is its own: the half the finding calls "no test can see them."**

## 4. §9 — the claim, held against COMPOSED

`tests/cut-meta.test.mjs` §9 is new: **three `test()` blocks, 13 sub-tests**, DOM-free, plain node,
no git, no browser, no network — the pre-game bytes travel as digests, which is exactly what makes
this the one arm in the suite that cannot cancel.

The finding's diagnosis of why nothing caught this is correct and is the thing §9 answers. The three
tests that carry the claim (`cut-integrate:247`, `cut-home:131`, `job-ledger:800`) all compare
game-ON against game-OFF **inside the shipped build**, so an ungated change sits in both arms and
subtracts to nothing; `job-ledger:800` even states the weaker reading out loud. A claim about
COMPOSED cannot be held by a test that never looks at COMPOSED. §9 looks at COMPOSED.

| assertion | measured |
|---|---|
| all **61** files CUT-BRIEF calls untouched still hash to `3a57ff5` | 61 / 61, `sha256[0..16)` |
| the file **set** is pre-game's | nothing added; the one deletion (`gen/asn-reason.js`) is declared and asserted gone |
| `page.js` is pre-game's *executable* content | identical once comments, string bodies and the three declared dead imports come out — and each of those three is asserted still unused, so the day one is used the digest must be re-measured, not the assertion relaxed |
| the game removed **no** global listener COMPOSED installs | 10 / 10 present |
| every global listener it **added** is one the closed list names | 1 added, 1 declared, 0 undeclared |
| `UNGATED` may shrink and may not grow | ≤ 4, each with a file, an owner and a reason, each file present |
| the **priced** module reaches one study surface | `js/job/pay.js` is imported by `js/screens/settings.js` and nothing else |
| **Ledger A** reaches the game engine nowhere | 0 of the 61 + `page.js` import `js/job/*`; the reach set is printed as a diagnostic |

`UNGATED` is the closed list of the four, each carrying the lane that owns the file. **Nothing in §9
asserts that a delta is still present**, deliberately: a lane that lands its fix does not break this
suite, it deletes its row. The list ratchets down and cannot ratchet up — a fifth ungated delta is a
new BLOCKER, not a new row. While the debt stands the suite prints it:

```
ℹ outstanding: js/app.js document click
```

Four negative controls, because a test that cannot fail is worse than none. The listener scanner is
proven against the shipped `app.js`, which **quotes** `window.addEventListener('hashchange', route)`
in a doc comment and **installs** it once: a scanner that cannot tell prose from a call site reports
two there, and this one reports one. The digest checker is proven to fail on a single added newline.
The `page.js` normaliser is proven to see a renamed `composePage` and to ignore an added comment.
The import scanner is proven on all five import shapes, including a multi-line one, and on four
prose shapes that must not count.

## 5. Requests — the actual fix, filed

1. **`site/js/app.js:437` + `site/js/plan.js:517,548` — the app-shell / home lane.** These are one
   change, not two: (b) exists only to compensate for (a) (`plan.js:222-230` says so), so reverting
   (b) alone leaves the strip re-mounting Today under a scrolled student, which is worse than what
   ships. The critic's own preferred shape is the right one — drop the global handler, and let the
   two controls it was written for handle their own activation where they are rendered (the Page
   Summary's "Another page", and `againLabel(kind)`). Then `plan.js` reverts to `a.href = p.href`
   for every non-gap pill and the strip is pre-game's, to the byte. `tests/cut-home.test.mjs:768`
   and `qa/cut-home.mjs` pin the current behaviour and move with it.
2. **`site/css/screens.css:807` — the screen lane.** `max-height: 35rem` on `.blitz-card`. Keep it:
   it is identical at a 16 px root, it fixes a real text-zoom clip on a study screen, and
   `tests/final-layout.test.mjs:117` pins `35 × 16 === 560` so it cannot drift. It stays on `UNGATED`
   while the sentence in CUT-SPEC §8 stands unamended.
3. **`site/js/page.js:28,37` — the engine lane.** Delete `rngFrom`, `overdueDays as overdueDaysOf`
   and `isMastered` from the two import lines. Nothing reads them. When they go, delete
   `PAGE_DEAD_IMPORTS` from §9 and re-measure `PAGE_PREGAME_CODE` — the test says how.
4. **The sentence itself — OWNER DECISION, above this lane.** Worth naming plainly: *even after
   request 1 lands, the published sentence is still not literally true.* The two controls
   `sameRouteClick` was written for are **study** controls, and they were inert in COMPOSED; that
   was found as a BLOCKER in verify round 3. So byte-identical COMPOSED and a working "Another page"
   cannot both be had. Either the sentence is amended to what it is actually promising — the game's
   state and decisions never reach the study layer, no game surface, route, string or number appears
   with the flag off, and the study modules are byte-identical — or the again-fix is reverted too and
   a 14-year-old gets a dead button back the week of his test. My recommendation is to amend the
   sentence, and I did not amend it: `designs/CUT-BRIEF.md` is authority and `designs/CUT-SPEC.md`
   is the spec lane's. §9 holds whichever way it is decided; only the size of `UNGATED` changes.

## 6. What was deliberately NOT done

No file outside this lane's three was edited. No test was deleted, skipped or weakened; §9 is
additive and §§1–6 are untouched. No number was added to a screen, no tap to a question, no string
to Settings, no key to the save, no route. The one new file is a note-directory evidence script that
ships nothing to `site/`.

## 7. The state of `node --test tests/` when this lane finished

```
cd /Users/oliver/Projects/unit1a-quest && node --test tests/          (23:11, 2026-09-22)
  tests 1796 · suites 144 · pass 1792 · fail 0 · skipped 4      (the four Playwright-gated arms)

node --test tests/cut-meta.test.mjs → 77 / 77
```

Two earlier whole-repo runs in this sitting came back red — 7 failures at 23:03 and 2 at 23:07,
**every one of them in `tests/job-split.test.mjs`**, with `site/js/job/state.js` being rewritten
while the run was in flight (last written 23:02:54, then 23:06:41; the assertion that failed was
*"a 24000 ms deliberation was not credited in full"*, the split meter's ceiling retune). `job-split`
imports `js/job/state.js`, `data/job.js`, `store.js` and `_helpers.mjs` and none of this lane's
three files; `node:test` runs each file in its own process. Re-run at 23:07 once `state.js` settled:
**34 / 34**. It was the engine lane's in-flight work, the same way round 1's 20:22 run was, and the
23:11 whole-repo run above is clean.

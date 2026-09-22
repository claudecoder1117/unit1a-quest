# notes/guard-fix.md — the `guard` lane of THE JOB game layer

Owner files: `site/js/job/guard.js`, `tests/job-guard.test.mjs`.
Authority: `COMPOSED-GAME.md` §3.4 / §3.5 / §3.6 / §3.7, G4 "Mercy", G2 "Rank". `BUILD-POLICY.md` overrides.

---

## Round 1 — 2026-09-21

Seven findings arrived from three independent critics (`guard-equilibrium`, `exploit-hunt`,
`player-feel`, and a spec-fidelity critic). Five were root-fixed inside `guard.js`; two are in files
this lane does not own and are written out verbatim under **Requests** below. One extra hole the
critics did not name was found while fixing #1 and is closed with them (Mercy was for sale).

`node --test tests/job-guard.test.mjs` → **115 pass, 0 fail** (was 103).
`node --test tests/` → **2503 tests, 2499 pass, 0 fail** — the whole repo, green.
(`tests/job-copy.test.mjs`, the J12 lint, scans this file's COMMENTS too; it is green.)

### The one idea all of it turned out to be

`posted` is the BOARD's drafted stake. It is fixed before the first envelope opens and it is the same
number whether you answered ten targets or walked out in two seconds. Three separate things in this
file read it as if it meant *work done* — the heat window (`x̂`), Mercy (`blockedWing`) and flow
control — while `state.endJob`'s own `ratesElo` gate one line away refuses to let a quit count
("quitting must not pay"). Every farm the critics measured is the gap between those two readings.

So `guard.js` now has one predicate that everything log-derived goes through, and it reads work:

```js
targetsAnswered(entry)   // number | null   — null means "this record says nothing", not "zero"
workedJob(entry)         // no evidence reads as WORKED, so old saves keep their meaning
abandonedJob(entry)      // targets === 0 && posted > 0 — the shape of every quit-scum
workedPosted(entry)      // posted, pro-rated over the shape by targets actually answered
```

---

### 1. BLOCKER — a quit credited the board's full posted to the heat window. FIXED

`state.js` calls `guard.pushHeat(gm.heat, { press: g.tokens, posted: postedRecorded })` on **every**
`endJob`, `QUIT` included, and `postedRecorded` is `g.posted` — the stake, not the work. Six seconds
of clicking pinned the guard at its 0.75 cap on a wing of the student's choosing, and both published
anti-farm claims (`COMPOSED-GAME.md:441`, `settings.js:390`) were false.

Fixed in three places, all in `guard.js`:

- **`heatEntry`** drops a job with no work exactly as it already dropped a job with no press, and
  credits `workedPosted` rather than the raw stake. A job abandoned half way credits half.
- **`withLogEvidence`** — the window `state.js` writes today carries no work evidence, so at read
  time each window row is paired with the `game.log` entry of the same job (one log entry per job,
  one window entry per job that pressed, so the window is the log's tail with press-less jobs
  removed) and **checksummed on `posted`**. A single disagreeing pair abandons the merge *whole*,
  so one job's work is never attributed to another job's press.
- **`heatWindow` seals the window.** A window that held rows has spoken even when every row turns
  out to be an abandoned board: the answer is then "no data", not "ask G7's scalar accumulator".
  `heat.press` is a running sum that cannot be un-credited, and it was handing the exploit straight
  back — the first pass of this fix still measured `x̂ = {RECALL: 1}` after three walks because of it.

**Measured, through the real `store.fresh` → `postBoard` → `startJob` → `walk` path**
(`/tmp/guardcrit/p11.mjs`, the critic's own script):

```
                                   before                       after
x̂ after 3 instant quits   {"RECALL":1,...}            {"RECALL":.25,"FIGURES":.25,"WORDS":.25,"ALGEBRA":.25}
elo after 3 instant quits {"player":920}              {"player":1000}
```

The full 40-save exploit (`/tmp/guardcrit/p9.mjs` — press a decoy wing on the throwaway quits, the
real wing on the job that counts):

```
                  before                      after
0 decoy quits ->  P(guard on MY wing) 37.8%   37.5%
1 decoy quits ->                      10.8%   37.5%
2 decoy quits ->                      10.8%   37.5%
9 decoy quits ->                          —   37.5%
```

The farm now buys exactly nothing.

**Residual, and why it is not the blocker.** `state.js` still hands `pushHeat` an entry with no
`targets`, so a quit still *occupies a slot* in the 10-job window and can evict a real job from it.
The credit is zero either way, so the guard cannot be walked onto a wing; the most a student can buy
is blanking `x̂` back to uniform with ten walks — and #2 below prices that, because those ten walks
leave the guard **held** on whatever the last one drew. The one-line call-site change that removes
even this is in **Requests** ↓; `pushHeat` already accepts and records `targets`/`shape` and will
start refusing to log the walk at all the moment it is passed them.

### 2. BLOCKER — the guard draw was re-rollable by quitting. FIXED (the payable half; see below)

Reload was genuinely safe (the pinned seed). Quitting was not: `board.jobIndexFor` counts `game.log`
entries for the day, a quit writes one, so the seed changed and the guard re-drew. Press → see the
wing → quit → retry, ~2 s a try, mean 1.81 tries. `COMPOSED-GAME.md:496` and `:859` both publish
"**no reroll exists**".

The seed was never the place to fix it, and `board.js` is not this lane's file. The fix is that
**there is nothing to reroll**:

```js
heldWing(save)   // the wing of the most recent log entry, iff that entry is an abandoned board
```

`guardDist` collapses to that wing with probability 1 until a job is actually worked. The guard you
walked out on is still standing. It overrides Mercy — Mercy is a promise against the *house*, not a
lever an abandoned board may pull — and one answered target releases it.

**Measured** (`scratchpad/reroll.mjs` and `scratchpad/shop.mjs`, 100 seeded saves each, real
`postBoard` → `startJob` → `walk`):

```
                                                    before            after
saves where the wing EVER changed (6 retries)       —                 0 / 100
mean distinct wings seen per save (6 retries)       —                 1.000
mean distinct wings REACHABLE (8 retries)           —                 1.000
retries needed to move the guard off your wing      1.81 (max 4)      unreachable
```

`guardDist` returns `held`, and `guardBars` carries `held` per bar so the board can print it. The
note line uses `COPY.guardHeld?.({ wing })` — optional-chained, because `data/job.js` is J1's file;
see **Requests**.

**What this closes, and what it does not — stated, because I got it wrong on the first pass.**

The half that paid was **shopping**: quitting until the draw put the guard on the wing you cared
least about, then pressing the rest. That is gone — the wing cannot be chosen at all any more, at any
number of retries.

The half that remains is **knowing**. The board prints its distribution BEFORE the press (Global law
6), so a held board tells you the wing before you commit your tokens, and pressing three tokens off a
known wing beats pressing three under uncertainty. That is still an edge over honest play.

**No fix that lives in `guard.js` can remove it, and neither can either of the two the critic
suggested.** "Seed the draw on the count of jobs that reached a getaway" and "persist the drawn wing"
are both *deterministic*, so both hand the student the same knowledge by the same two keystrokes: the
wing is learned by starting and quitting, and the restart is a free re-press with it. The leak is
structural in "quit → a NEW board is posted", not in where the randomness comes from.

The fix that does remove it is the critic's third option, restated so it does not punish an honest
evening off — **R1b** in Requests: an abandoned board is **resumed**, not re-posted. Same seed, same
draft, same press, same wing. Then quitting buys nothing at all, because you get the identical job
back with your tokens already spent.

Recorded in the suite as `RECORDED: the hold ends the SHOPPING, and what it does not end`, so the
next lane that touches this does not ship the seed fix believing it closes the leak.

### 3. MAJOR — "no single job may be more than a quarter of the window" was false. FIXED

`ω_j = min(posted_j, 0.25·Σposted)` bounds ω against Σ**posted**; it does not bound `ω_j / Σω` at
0.25, because the cap scales with the window total. With three RUNs and one huge job the survivor
still owned 99 % of Σω, and for a window of fewer than four jobs the published sentence is not even
arithmetically reachable — on job 1 one job *is* the window. `tests/job-guard.test.mjs` recorded this
as a known gap; the Settings panel the student reads did not.

Fixed by implementing the bound the copy claims, rather than rewriting the copy:
**uniform ballast**. `xHatFrom` adds `max(0, maxω/0.25 − Σω)` of uniform weight — exactly enough that
the largest job's share of the window IS the cap, and none at all once the window is broad enough to
satisfy the bound on its own.

Why this shape and not a share clamp: clamping shares at `max(0.25, 1/n)` forces a window of four or
fewer jobs to be perfectly uniform (with n entries each ≤ 1/n there is only one feasible vector),
which would have killed stake weighting outright and made the *companion* claim ("a RUN counts about
a fifth of a VAULT") false. Ballast leaves every ratio between real jobs untouched.

```
n=1 posted=[84]           shares [25.0%]                     rest uniform
n=2 posted=[84,84]        shares [25.0%, 25.0%]              rest uniform
n=3 posted=[84,84,84]     shares [25.0%,…]                   rest uniform
n=4 posted=[36,36,36,152] shares [5.9%,5.9%,5.9%,25.0%]      ratio 36:152 exact
n=10 posted=[36×9,162]    shares [5.6%×9, 25.0%]             was 27.3%
every realistic 10-job window: ballast 0, nothing changes at all
```

Asserted over 3 000 random windows of reachable shapes, n = 1..10:
`maxShare ≤ GUARD.jobWeightCap`, every share ≤ the cap, `Σshares + ballast/denom == 1`, `Σx̂ == 1`.

`settings.js:389-391` is now **true as written** and needs no edit. The farm numbers the suite
already records (`0.1034` for a JOB-10-only window, `0.0821` for 9 JOB + 1 VAULT) are unchanged,
because the ballast is zero on those windows and three 6-target RUNs really are 108 posted against a
JOB-10's 84 — that scenario-sensitivity of `COMPOSED-GAME.md:833`'s parenthetical was recorded in
round 0 with its arithmetic and is left recorded, not bent.

### 4. MAJOR — the primary button pre-pressed the HOUSE's mixing. FIXED

`fixedPointMix` solves `v_i(1 − y_i) = k`: that is the mixing which makes the *player* indifferent —
the **house's** strategy, as its own doc-comment says — and `pressAdvice` handed it to
`largestRemainder` as the player's token allocation. It was dominated by a flat press.

New export `stationaryPress(values, wings, {eps, n})` solves the player's side against the guard this
file actually implements (`y_i = (1−ε)x̂_i + ε/n`, and a repeated press *is* `x̂`):

```
U(p) = Σ p_i·v_i·(1 − (1−ε)p_i − ε/n)
∂U/∂p_i = λ  ⟹  p_i = A − B/v_i ,  A = (1 − ε/n)/(2(1−ε)) ,  B = (|S|·A − 1)/Σ_S(1/v_i)
```

`pressAdvice.tokens` now apportions `p`. `equilibrium` is still published as evidence (it is the
guard's mixing, and it is what the `y_i = 1 − k/v_i` line in Settings names) — it is simply no longer
what the button commits. The test re-derives `p` by grid search from the definition of `U`, never
from the closed form, and asserts `U(p) > U(flat) > U(house's own mix)`.

**Measured** (the critic's `/tmp/guardcrit/p4.mjs` and `p5.mjs`, unmodified):

```
400-job repeated simulation, v=(30,20,10), ε=0.20    before      after
  shipped pre-press                                  12.4578     13.3333
  uniform                                            13.3333     13.3333
  grid-optimal stationary                            13.8818     13.8859

49–50 real boards from the 50-save corpus            before      after
  boards with a zero-token wing                      34 (69 %)   23 (46 %)
  all three tokens on one wing                       —           0 (0 %)
  save 1  v=[58.5,131.3,71.3,18.0]  tokens           0/2/1/0     1/1/1/0
  save 9  v=[81.0,131.3,33.8,51.8]  tokens           0/2/0/1     1/1/0/1
```

Three whole tokens over four wings **must** zero a wing; what changed is that the zeroed wing is now
the least valuable one (`v = 18.0`, `14.4`) instead of the second most valuable one. `p` is monotone
increasing in `v` and positive on every wing of every board in the corpus before rounding.

The Settings prose that explains this is `settings.js:418-420` and is not this lane's file — exact
replacement text in **Requests**.

### 5. MAJOR — flow control penalised quitting and downgraded the vault. FIXED

`flowControl` fires on `posted > 0 && bagged < 0.5·posted`, which every one-tap board-walk satisfies,
in the same function whose `ratesElo` gate exists to stop a quit counting. Three walks cost 80
R_player and silently demoted the next vault from tier 3 to tier 2; twelve cost 440. G1 makes WALK a
designed one-tap action and G3.5 frames flow control as *mercy*.

`flowControl` now reads `log.filter(workedJob)`. A board-walk is not a bad job; it is not a job.

```
before:  12 one-tap walks -> player elo 560      after: 1000, vaultGradeFor unchanged at 3
before:   3 one-tap walks -> player elo 920, vault tier 2 (from 3)
```

Asserted: three consecutive board-walks leave `player.elo.player` and `vaultGradeFor(...)` untouched;
so do twelve; and the same record with **one** target answered is a bad job again and is priced as one.

### 6. MAJOR — the collapsed status line. NOT THIS LANE'S FILE — see Requests

`site/js/screens/job.js:80-87` + `site/data/job.js:696`. Real defect, correctly diagnosed, and the
wing/token ambiguity is genuinely the only readout on screen while answering. Exact patch in
**Requests**; nothing in `guard.js` can reach it (`wingMult`/`guardMultFor` are already re-exported
here for exactly this line to use).

### 7. MAJOR — FOOTHOLD computed and thrown away; the penalty re-fired. HALF FIXED

**The re-fire is fixed here.** `state.endJob` pushes the current job's log entry and then reads
`log.slice(-2)`, so three bad jobs fired the −40 twice and four fired it three times — an unbounded,
uncommunicated slide in the number that drives the vault grade. Two gates now:

- `armed` — the worked job *before* the window must not itself be under threshold, so one pattern
  fires once. Six bad jobs running now cost 40, not 200. One job that clears the bar re-arms it.
- `justCompleted` — the job that just ended must BE the one that completed the pattern. Without it a
  walk taken *after* the penalty fired re-fired it, because `endJob` evaluates flow control on every
  exit and a walk adds no worked job for `armed` to see.

```
6 bad jobs in a row      fires at job index [1]        (was [1,2,3,4,5])
bad,bad,good,bad,bad     fires at [1,4]                 one clearing job re-arms
bad,bad,walk,walk        fires at [1]                   walks neither fire nor hide
```

**The FOOTHOLD itself needs `board.js`.** `guard.js` now exports it ready to consume:

```js
footholdFor(saveOrLog) -> { fire, contract, label, deltaPlayer }
```

The two gates above are for the PENALTY, which `endJob` charges once. The FOOTHOLD is a state of the
next board, so `flowControl` also returns `pending` (the pattern stands) and `footholdFor` reads that
one: a walk taken between the firing job and the next board does not quietly cancel the easier board,
and neither does a third bad job. One job that clears the bar ends it.

`contract` is a **copy** of `ELO.footholdContract` (so a board may not edit the constant) and `label`
is `COPY.foothold()`. The test asserts the four fields against their published values and that the
copy is not the constant — replacing the old `assert.deepEqual(f.foothold, ELO.footholdContract)`,
which compared the constant against itself. Board-side patch in **Requests**.

### EXTRA (not in any finding) — Mercy was for sale. FIXED

`blockedWing` counted the last three *logged* guards, and `state.endJob` logs a guard wing on a quit
whenever `posted > 0`. So pressing a wing and quitting three times made that wing **blocked** — a
guaranteed exemption, bought with six seconds of clicking, and a cleaner reroll than #2's. Found while
fixing #1, closed with it: `blockedWing` skips jobs that were not worked, exactly as it already
skipped jobs with no guard.

```
three JOBs the guard really took  -> blockedWing 'RECALL'
three boards walked off           -> blockedWing null
```

---

## Exported API added this round

```js
targetsAnswered(entry) -> number|null      // null = the record carries no evidence
workedJob(entry)       -> boolean          // no evidence reads as worked
abandonedJob(entry)    -> boolean          // targets === 0 && posted > 0
workedPosted(entry)    -> number           // posted, pro-rated by targets/shape
heldWing(save)         -> string|null      // the wing an abandoned board left standing
stationaryPress(values, wings, {eps, n})
                       -> { p, wings, byWing, support, dropped, A, B, eps, n }
footholdFor(saveOrLog) -> { fire, contract, label, deltaPlayer }
```

Changed shapes (all additive):

- `xHatFrom(save)` gains `ballast`, `denom`, `shares[]`, `maxShare`. `weights[]` is still ω
  (pre-ballast) so `notes/J3.md`'s leverage bound still reads the way it did.
- `heatWindow(save)` gains `sealed`.
- `guardDist(save, opts)` gains `held`; `opts.held` overrides it the way `opts.blocked` already does.
- `guardBars(dist)` gains `held` per bar.
- `pressAdvice(dist, values)` gains `press[]`, `pressSupport[]`, `eps`, `A`, `B`, and
  `byWing[w].press`. **`tokens` changed meaning** — it is the player's press now, not `equilibrium`.
- `flowControl(...)` gains `pending`, `played`, `streak`, `armed`. `fire` is the penalty
  (charged once by `endJob`); `pending` is the board state (`footholdFor` reads it).

`pushHeat(heat, entry)` accepts `targets` and `shape` on the entry and records them on the window row.
The row keeps the **raw** `posted` (not the credited product) so it stays checkable against the log.

---

## Requests — changes needed in files this lane does not own

`state.js`, `board.js`, `screens/job.js`, `data/job.js`, `crew.js`, `econ.js`, `call.js` and
`home.js` were all being edited by other lanes while this ran — `state.js` grew 15 KB during the
sitting, and the suite went red and green again around `home.js:666` (`baseHref`), `crew.js`
(`Date.now`), `econ.js` ("you should") and the crew idle rule without this lane touching any of
them. Nothing outside `guard.js` and `tests/job-guard.test.mjs` was changed here. Exact patches for
the rest:

**R1 — `site/js/job/state.js`, one line, closes the residual of #1.** In `endJob`, the `pushHeat`
call sits just after the `entry` that already knows what was answered:

```js
-  gm.heat = guard.pushHeat(gm.heat, { press: g.tokens, posted: postedRecorded });
+  gm.heat = guard.pushHeat(gm.heat, { press: g.tokens, posted: postedRecorded,
+                                      targets: entry.targets, shape: entry.shape });
```

With it, a walk never enters the 10-job window at all and cannot evict a real job from it; `heat.press`
and `heat.weight` stop accumulating stake that was never worked; and `withLogEvidence` stops being
needed for new saves (it stays for old ones). `guard.js` already handles both shapes.

**R1b — `site/js/job/state.js` + `site/js/job/board.js`, the last of #2 and the only leak-free shape
of it.** `endJob` on a `QUIT` with `targets === 0` should keep `inProgress.game` rather than deleting
it — or, if it must be cleared, `postBoard` should re-post the abandoned board verbatim (its `seed`,
its `picks`, its `tokens`) for the rest of the day instead of composing a new one. Do **not** fix
this by pinning the seed on a getaway count: that is deterministic too, so the student still learns
the wing by quitting and still gets a free re-press with it. The point is that there is no second
press, not that there is no second draw. See the "what this closes" note under #2.

**R2 — `site/data/job.js`, one line, so #2 is printed and not silent.** Next to `guardColdStart`:

```js
  guardHeld: ({ wing }) => `${wing} — the guard you walked out on. Answer one target to redraw.`,
```

`guardDist` already reads `COPY.guardHeld?.({ wing })` and degrades to `note: null` without it.

**R3 — `site/js/job/board.js`, `postBoard`, so #7's FOOTHOLD reaches a board.** `guard.js` exports
`footholdFor`; nothing consumes it:

```js
const foot = footholdFor(save);
if (foot.fire) {
  rows[0] = { ...rows[0], foothold: true, label: foot.label,
              line: `${rows[0].id}  ${foot.label} · ${foot.contract.targets} tier-${foot.contract.tier} dues · guard ×${foot.contract.guardMult}` };
}
// ...and on the returned board: `foothold: foot.fire ? foot.contract : null, footholdLabel: foot.label`
```

`debriefOf` already carries the `flow` key, so the −40 can be printed on the debrief from what it has.

**R4 — `site/js/screens/job.js:80-87` + `site/data/job.js:696`, finding #6.** The collapsed line puts
the guard's wing and the total token count in one bracket pair, so `ALGEBRA ⟨3⟩` reads as "3 tokens on
ALGEBRA" when the real state was `{ALGEBRA:1, FIGURES:1, WORDS:1}` and ALGEBRA was the guarded wing
paying ×0.55:

```js
-  const tokens = WING_IDS.reduce((t, w) => t + Math.max(0, int(g?.tokens?.[w], 0)), 0);
-  return COPY.collapsedBoard({ wing, tokens, ... });
+  const tokens = Math.max(0, int(g?.tokens?.[wing], 0));     // the GUARDED wing's own tokens
+  return COPY.collapsedBoard({ wing, tokens, guardMult: g?.guard?.mult, ... });
```

```js
-  collapsedBoard: ({wing, tokens, loose, mult, chain}) => `${wing} ⟨${tokens}⟩ · loose ${loose} · ×${mult} · chain ${chain}`
+  collapsedBoard: ({wing, tokens, guardMult, loose, mult, chain}) =>
+    `guard ${wing} ×${guardMult} · your ⟨${tokens}⟩ · loose ${loose} · ×${mult} · chain ${chain}`
```

`tests/job-screen.test.mjs:283` asserts the ambiguous form and moves with it. `guardMultFor` and
`wingMult` are re-exported from `guard.js` for exactly this.

**R5 — `site/js/screens/settings.js:418-420`, the prose half of #4.** The sentence asserts
proportionality and then prints a formula that is not proportional, and the formula it prints is the
*guard's*, not the player's:

> A token pays only where the guard is not, so the press that cannot be exploited spreads pressure
> across every wing, weighted toward the wings worth most — which is interleaved practice, weighted
> by test weight and overdue-ness. It is a solve, not a slogan. The guard mixes at
> `yᵢ = 1 − k/vᵢ`, `k = (n − 1)/Σ(1/vᵢ)`; against that mix your best repeated press is
> `pᵢ = A − B/vᵢ` with `A = (1 − ε/n)/(2(1 − ε))` and `B` set so `Σp = 1`. That is what the three
> tokens are pre-pressed to. Pressing the guard's own vector instead — the intuitive move — hands the
> House the game: on `v = (30, 20, 10)` it is worth 8.0 against a flat press's 10.0.

`settings.js:389-391` (finding #3's student-facing claim) needs **no** change: the ballast makes it
true as written.

## Open

- `COMPOSED-GAME.md:833` / `:939`'s parenthetical "a 3-RUN + 1-VAULT farm moves `x̂` by < 0.08" is
  still scenario-sensitive: it holds for every 10-job window that contains any plan-sized or vault
  work (0.058–0.071) and is 0.1034 for a window of nothing but the default JOB-10, because three
  6-target RUNs are 108 posted against a JOB-10's 84 and are not "throwaway". Both numbers are
  asserted with their arithmetic in `tests/job-guard.test.mjs`. Not bent, not hidden; the doc's
  sentence, not the code, is the thing that is imprecise.
- `COMPOSED-GAME.md:859` "Quitting is free and never a strategy" is now true on every axis this
  lane owns — no Elo, no rating, no heat credit, no Mercy exemption, and no choice of guarded wing —
  and is still marginally false on one it does not: a held board publishes the wing before the press.
  **R1b** closes it. Until then the sentence is over-claiming by exactly that much, and the suite
  says so in `RECORDED: the hold ends the SHOPPING, and what it does not end`.
- `board.jobIndexFor` still advances on a quit. Harmless now (the draw no longer depends on it for
  an abandoned board, and the ×2 marks are re-drawn honestly), but it means a quit still consumes a
  day's job index. Worth aligning with R1 if `board.js`'s owner is in there anyway.

---

## Round 2 — 2026-09-21

Six findings. **Two are closed inside `guard.js` and one is closed at its root there** (#2, #3 and the
code half of #1). **Three are entirely outside this lane's one file** (#4, #5, #6) and one is half
outside (#1's published text): those are in **Requests R6–R11** below, each as a copy-paste patch.

None of the six was wrong. All six reproduce; the repros are in
`scratchpad/guard-r2/` (`desync.mjs`, `sweep.mjs`, `eq.mjs`, `farm.mjs`).

`node --test tests/job-guard.test.mjs` → **120 pass, 0 fail** (was 115).
Nothing outside `site/js/job/guard.js`, `tests/job-guard.test.mjs`, this note and
`scratchpad/guard-r2/` (gitignored repros) was written this round.

`node --test tests/` at the end of this sitting → **2601 tests, 2588 pass, 9 fail**. Every one of the
nine is in another lane's file, mid-round: `job-board.test.mjs`, `job-juice.test.mjs`,
`job-save.test.mjs`, `job-screen.test.mjs`, `job-split.test.mjs` (the board/draft-name, tile-mint,
`ratingDelta` in `screens/run.js`, the LAYOUT-px consumer and the ledger-vs-debrief split). Zero are
in `tests/job-guard.test.mjs`, and `site/js/job/{state,econ,call,crew,board}.js`,
`site/data/job.js` and `site/js/screens/job.js` were all being written by other agents while this
ran (mtimes inside the sitting), with five other `node --test tests/` runs live at the same time.

---

### 3. BLOCKER — zero-token press disabled the abandoned-board defence. FIXED AT THE ROOT HERE

Reproduced exactly as reported (`scratchpad/guard-r2/desync.mjs`): `pushHeat` refuses a row whose press
total is 0 while `state.endJob` logs that job anyway, so **one** zero-token press shortens the window
by one and slides every older row off its own log entry. `withLogEvidence` paired positionally and
bailed **whole** on the first `posted` mismatch, so the repair simply switched off and every
abandoned board was credited at full `posted`:

```
                                                    x̂ on the decoy wing   (honest baseline 0.3333)
7 honest jobs + 3 abandoned boards, all pressed      0.3333
the same, one honest job pressed 0 tokens            0.6016   <- the defence is off
```

`withLogEvidence` is now four tiers, and the last two are the fix (`guard.js` §x̂):

1. **self-describing** — the row carries `targets`; nothing to repair. (This is where R1/R6 puts
   every new row, and it never reaches the rest.)
2. **exact** — the window IS the log's tail, position for position, checksummed on `posted`.
3. **greedy, and only when it is UNIQUE** — walk both lists backwards and let a log entry be
   skipped (the job that pressed nothing wrote no row). Matching rows into the log is a subsequence
   match on `posted`, and an occurrence is unique exactly when matching every row as LATE as
   possible and as EARLY as possible land on the same entries. Both are run and must agree.
   Ambiguous greedy alignment is deliberately NOT used: over a week of identical JOB-10s it shifts
   every row onto its neighbour's evidence, and the shift runs the farmer's way.
4. **otherwise, and only when the log shows an abandoned board in the same reach** — the
   un-attributable rows are **dropped, not credited**. They cannot be attributed and one of them may
   be the walk; crediting them is the exploit, dropping them costs a legacy save some history and
   pushes `x̂` toward uniform, which pays nobody. With no walk in reach the legacy reading stands
   untouched, so an honest old save loses nothing.

```
                                                    before     after
one honest job pressed 0 tokens, 3 boards walked    0.6016     0.3333  (= the honest baseline, exactly)
4 000 adversarial windows (walks × zero-presses ×
  flat and varied posted): worst gain on the
  decoy wing from walking out                       —          0.000000
honest history lost to tier 4 in those 4 000        —          18 windows (0.45 %), never a gain
```

Recorded as `THE DESYNC: pressing zero tokens on one job does not switch the defence off` and
`NO desync shape pays: 4 000 adversarial windows…`. The old test
`…and bails rather than guess` asserted `jobs === 2` for an un-pairable window — i.e. it *recorded*
that the walk got credited. It now asserts `jobs === 0`: nothing is credited on a guess. That is a
strengthening, not a rewrite, and the new case beside it asserts that a window with **no** walk in
reach still keeps every job it earned.

**This does not make R1/R6 unnecessary.** Tier 4 costs an honest legacy save real history, and the
one-line call-site change deletes tiers 2–4 for every row written after it. R6 below is R1 again.

### 2. BLOCKER — two vectors, one name, and the losing one published. FIXED HERE (code half)

Confirmed, and worse than a naming slip. `v_i(1 − y_i) = k` is the condition that makes the PLAYER
indifferent, and the side a condition pins is the OTHER side: `y` is the **House's** mix. Measured
(`scratchpad/guard-r2/eq.mjs`, `v = (30,20,10)`, payoff `Σx_i v_i(1 − y_i)`):

```
                          x                      vs a minimising house   vs the house we SHIP (ε=.15)
doc/Settings y = 1 − k/v  0.600, 0.400, 0.000     8.000                  12.800   <- worst of the four
board pre-press A − B/v   0.436, 0.374, 0.190     9.385                  13.805   <- what tokens apportions
true maximin  x ∝ 1/v     0.400, 0.600, 0.000    12.000                  12.600
literally ∝ v             0.500, 0.333, 0.167     8.333                  13.667
```

So the published "unexploitable" press gives up a third of the game's own value (8.0 of 12.0), it is
the reciprocal of the ordering the sentence beside it claims ("in proportion to study value"), and it
puts zero pressure on the third cluster — the opposite of the interleaving it is sold as.

Fixed in `guard.js`:

- **`pressAdvice` no longer returns anything called `equilibrium`.** Three vectors, three names, each
  named for the side it belongs to and the guard it is optimal against:
  `guardMix` (`y_i = 1 − k/v_i`, the HOUSE), `maximin` (`x_i ∝ 1/v_i`, the PLAYER, worth the game's
  value `k` against any guard at all) and `press` (`p_i = A − B/v_i`, the best reply to the guard
  this layer actually ships, and the one `tokens` apportions). `byWing[w]` carries all three.
  Asserted: `'equilibrium' in pressAdvice(...) === false`.
- **New export `maximinPress(values, wings)`** — the honest referent of the phrase "the unexploitable
  press". It reuses `fixedPointMix`'s support and `k`, because the two sides of a matching-pennies
  pair share both: `x_i·v_i` is equal across the support (which is exactly why no wing is worth
  guarding) and the value of the game IS `k`.
- **New exports `GUARD_MIX_FORMULA`, `MAXIMIN_FORMULA`, `PRESS_FORMULA`** — the three formulae as
  strings, so a panel prints the one belonging to the side it is talking about.
- `fixedPointMix`'s doc-comment now opens with "THE GUARD'S MIX, and only the guard's" and states
  both halves of the pair side by side.

Recorded as `y = 1 − k/v is the GUARD s side: pressing it is exploitable, x ∝ 1/v is not`, which
asserts the 8.0-vs-12.0 gap from the definition of the payoff rather than from a stored number.

**The prose is still wrong** in `COMPOSED-GAME.md:463`, `:527`, `:877` (proof 5) and
`settings.js:418-421`. Exact replacement text in **R8**.

### 1. BLOCKER — the printed x̂ formula is not the one that runs. CODE HALF FIXED HERE

Both halves of the critic's claim hold. The published `x̂ᵢ = Σⱼ(ωⱼ·shareᵢⱼ)/Σⱼωⱼ` (a) is not what the
code runs — the code adds uniform ballast `β` (round 1, finding #3) — and (b) does not satisfy the
25 % sentence printed beside it, because `ωⱼ ≤ 0.25·Σposted` bounds ω against Σ**posted**, not
`ωⱼ/Σω`. The doc's own named 3-RUN + 1-VAULT attack puts **52 %** of that window on one job under
the published formula, and nine tiny jobs against one huge one put **85 %**.

So the two published sentences contradicted each other AND the code, and round 1 fixed only the code.
Round 2 makes the published shape come out of the implementation:

```js
export const X_HAT_FORMULA = Object.freeze({
  law:     'x̂ᵢ = (Σⱼ ωⱼ·shareᵢⱼ + β/n) / (Σⱼ ωⱼ + β)',
  omega:   'ωⱼ = min(postedⱼ, cap · Σₖ postedₖ)',
  ballast: 'β = max(0, max(ω)/cap − Σω)   — uniform weight added until the largest job IS `cap` of the window',
  bound:   'therefore ωⱼ/(Σω + β) ≤ cap for every job, at every window size, job 1 included',
});
```

`xHatFrom`'s own doc-comment led with the un-ballasted ratio too; it now leads with the law above and
says in as many words that **β is part of the formula, not an implementation detail**.

New test `THE PUBLISHED FORMULA IS THE RUNNING ONE` implements `X_HAT_FORMULA` **by hand** — ω, β and
all — and asserts it reproduces `xHatFrom` over 3 000 random windows of reachable shapes, plus the
two windows that broke the old text (`maxShare` is exactly 0.25 on both). The published text and the
running code are now one object and a test that executes it.

**The panel still prints the old string.** `settings.js:389-391` and `COMPOSED-GAME.md:452-456` —
exact replacement in **R7**. Nothing in `guard.js` can reach either.

### 4. MAJOR — the "< 0.08" farm bound. NOT THIS LANE'S FILE — R9

Re-measured this round with the suite's own scenarios (`scratchpad/guard-r2/farm.mjs`, and it is the same
arithmetic `tests/job-guard.test.mjs` has recorded since round 0):

```
mixedWeek     x̂ moves 0.0710
vaultHeavy    x̂ moves 0.0580
planSized     x̂ moves 0.0614
jobAndVault   x̂ moves 0.0821   <- the published "< 0.08" does NOT hold
defaultOnly   x̂ moves 0.1034   <- the published "< 0.08" does NOT hold
```

The critic is right that the honest sentence already exists in the test file and the authority
document was never updated, and right that a JOB-10-only window is the most common window there is.
Bending the mechanism to hit a round number in a doc would be the wrong repair: three 6-target RUNs
really do post 108 against a JOB-10's 84, and pretending otherwise is the *lie* the stake weighting
exists to avoid. The doc sentence is the thing to fix — **R9**.

### 5. MAJOR — `COPY.guardHeld` does not exist. NOT THIS LANE'S FILE — R10

Confirmed, both halves, and **neither half is reachable from `guard.js`**:

```
$ grep -rn guardHeld site/data/job.js site/js/job/*.js site/js/screens/*.js
site/js/job/guard.js:761:      ? (COPY.guardHeld?.({ wing: held }) ?? null)      <- the call site, alone
$ node -e "import('./site/data/job.js').then(m=>console.log(typeof m.COPY.guardHeld))"
undefined
```

and `site/js/screens/job.js:527` renders a note **only** for the cold start
(`board?.guard?.coldStart ? … COPY.guardColdStart(…) : null`), so even with the COPY entry the held
note would still never appear. Writing the sentence into `guard.js` would put user-facing copy
outside `data/job.js` (the rule `tests/job-copy.test.mjs` is built on) **and** would still print
nothing. Both lines are in **R10**; this is round 1's R2 again, plus the render.

### 6. BLOCKER — the FOOTHOLD reaches no board. NOT THIS LANE'S FILE — R11

Confirmed unchanged from round 1:

```
$ grep -rn foothold site/js/ | grep -v job/guard.js
(no output)
```

`guard.js` exports `footholdFor(save) -> {fire, contract, label, deltaPlayer}` ready to consume and
has since round 1; `postBoard` never calls it, while `state.js` DOES charge the −40 half. So the Elo
drops and the promised visible compensation never appears. This is round 1's R3 again, restated in
**R11** with the board fields the screen needs.

---

## Exported API added this round

```js
maximinPress(values, wings) -> { x, wings, byWing, support, k, value }
X_HAT_FORMULA      // {law, omega, ballast, bound} — the published x̂, β included
GUARD_MIX_FORMULA  // 'yᵢ = 1 − k/vᵢ …'  the GUARD's mixing
MAXIMIN_FORMULA    // 'xᵢ ∝ 1/vᵢ …'      the PLAYER's maximin
PRESS_FORMULA      // 'pᵢ = A − B/vᵢ …'  what the board pre-presses
```

**Breaking (intentional, and nothing in `site/js` reads it):** `pressAdvice(...)` no longer returns
`equilibrium`, and `byWing[w].equilibrium` is gone. Use `guardMix` (the house), `maximin` (the
player's maximin) or `press` (what `tokens` apportions). `pressAdvice` also gains `value` (= `k`).
`grep -rn 'equilibrium' site/js/` returns nothing outside comments.

---

## Requests — round 2 (each is copy-paste; none is in this lane's file)

**R6 — `site/js/job/state.js`, one line. Round 1's R1, unlanded, and finding #3's root.**
`endJob`'s `pushHeat` call (now at `state.js:1719`) sits one line under an `entry` that already knows
what was answered:

```js
-  gm.heat = guard.pushHeat(gm.heat, { press: g.tokens, posted: postedRecorded });
+  gm.heat = guard.pushHeat(gm.heat, { press: g.tokens, posted: postedRecorded,
+                                      targets: entry.targets, shape: entry.shape });
```

`pushHeat` already stores `row.targets` when `e.targets != null` and `workedPosted` already pro-rates
by shape, so nothing else changes and `withLogEvidence` becomes legacy-only. Every row written after
it takes tier 1 and no repair runs at all.

**R7 — `site/js/screens/settings.js:389-391` and `COMPOSED-GAME.md:452-456`, finding #1.** Print the
formula that runs. In `settings.js`, replace the `x̂` legend body with:

```js
          h('dt.mono', 'x̂'), h('dd', 'your own token shares over the last '
            + `${GUARD.xHatWindowJobs} jobs, weighted by what each job was worth: `
            + `${X_HAT_FORMULA.law} with ${X_HAT_FORMULA.omega} and ${X_HAT_FORMULA.ballast}, cap = ${GUARD.jobWeightCap}. `
            + 'A short RUN counts about a fifth of a VAULT. β is the half that makes the next sentence '
            + 'true: ω alone bounds one job against Σposted, not against the window, so three RUNs and '
            + 'one VAULT would leave the VAULT owning 52 % of it. With β, no single job is ever more '
            + 'than a quarter of the window — at any window size, job 1 included.'),
```

(`import { X_HAT_FORMULA } from '../job/guard.js'` — the strings are exported so the panel cannot
print a shape the code does not run; `tests/job-guard.test.mjs` executes them.) In `COMPOSED-GAME.md`
replace the fenced block at :452-454 and the sentence at :456 with:

```
x̂_i = ( Σ_j ω_j·share_ij + β/n ) / ( Σ_j ω_j + β )
ω_j = min( posted_j , 0.25 · Σ_k posted_k )
β   = max( 0 , max_j(ω_j)/0.25 − Σ_j ω_j )
```

> A RUN contributes about a fifth of a VAULT. `β` is uniform weight added until the largest job's
> share of the window IS 0.25, and it is zero on any window already inside the bound (every
> realistic 10-job window). Without it the cap scales with the window total and does not bound a
> job's share at all: three RUNs and one VAULT leave the VAULT at 52 %, and on job 2 one job is
> half the window. **With it, no single job is ever more than 25 % of the window, at any window
> size.** (G12 #12.)

**R8 — `COMPOSED-GAME.md:463`, `:527`, `:877` and `settings.js:418-421`, finding #2.** Stop selling
the House's mix as the student's. Suggested text for `:463`:

> `v_i(1 − y_i) = k` is the PLAYER's indifference condition, so it pins the HOUSE: `y_i = 1 − k/v_i`
> is how the guard mixes. The player's half of the same pair is its reciprocal, `x_i ∝ 1/v_i` on the
> same support, which equalises `x_i·v_i` and is worth the value of the game `k` against any guard —
> that is the unexploitable press, and it is a Nash statement, not a slogan. But the House this
> layer ships does not minimise: `y` is a published mirror of `x̂`. Against that House the student's
> optimum is the stationary press `p_i = A − B/v_i`, `A = (1 − ε/n)/(2(1 − ε))`, `B` set so `Σp = 1`
> — which is positive on every wing of every board the composer deals, and is what the board
> pre-presses. Interleaving is what `p` looks like; it is not derived from `y`.

`:527` item 2 becomes "Presses tokens at the stationary press `p_i = A − B/v_i` the board
pre-presses", and proof 5 at `:877` should say "the token press is interleaving weighted by
`w × cold`" without calling `y` the token equilibrium. For `settings.js:418-421`, print
`PRESS_FORMULA` **next to the pre-press**, since that is the number the app acts on, and name the
other two for their own sides (`GUARD_MIX_FORMULA`, `MAXIMIN_FORMULA` are exported for it).

**R8b — `site/data/job.js:878`, one comment.** `PUBLISHED.guardFixedPoints` is `{v:[30,20,10],
k:12.0, y:[0.60,0.40]}` — that is the GUARD's mixing, and the comment above it reads "the mixed
equilibrium", which is the phrase this round is retiring. It should read
`/** G3.4 — the guard's mixing, y_i = 1 − k/v_i */`. The data itself is correct and must not change.

**R9 — `COMPOSED-GAME.md:839` and `:945`, finding #4.** Replace "(a 3-RUN + 1-VAULT farm moves `x̂`
by < 0.08)" with the measured numbers and the window they depend on:

> a 3-RUN + 1-VAULT farm moves `x̂` by < 0.08 on a mixed week (0.058–0.071 measured), and by 0.082
> on a 9-JOB + 1-VAULT window and 0.103 on a JOB-10-only window, because three 6-target RUNs post
> 108 against a JOB-10's 84 and are not throwaway. All five are asserted with their arithmetic in
> `tests/job-guard.test.mjs`.

**R10 — `site/data/job.js` and `site/js/screens/job.js`, finding #5.** One line each. Next to
`guardColdStart` (`data/job.js:683`):

```js
  guardHeld: ({ wing }) => `${wing} — the guard you walked out on. Answer one target to redraw.`,
```

and in `screens/job.js:527`, render the note the distribution already carries instead of only the
cold-start one:

```js
-      board?.guard?.coldStart ? h('p.job-guard-cold.muted.fs-1', COPY.guardColdStart({ n: bars.length || GUARD.tokens })) : null,
+      (board?.guard?.note ?? (board?.guard?.coldStart ? COPY.guardColdStart({ n: bars.length || GUARD.tokens }) : null))
+        ? h('p.job-guard-cold.muted.fs-1', board.guard.note ?? COPY.guardColdStart({ n: bars.length || GUARD.tokens })) : null,
```

`guardDist().note` is already `COPY.guardHeld?.({wing}) ?? null` for a held board and
`COPY.guardColdStart({n})` for a cold start, so one render covers both. The same block belongs in the
debrief's guard section. NOTE: `renderStart` rebuilds `dist` as `{byWing, eps}` once the job has
started, which drops `held` — pass `note`/`held` through, or `guardBars` cannot mark the bar either.

**R11 — `site/js/job/board.js` `postBoard`, finding #6.** Round 1's R3, unlanded. `guard.js` exports
`footholdFor`; nothing consumes it, while `state.js:1563` charges its −40 half:

```js
const foot = footholdFor(save);
if (foot.fire) {
  rows[0] = { ...rows[0], foothold: true, label: foot.label,
              line: `${rows[0].id}  ${foot.label} · ${foot.contract.targets} tier-${foot.contract.tier} dues · guard ×${foot.contract.guardMult}` };
}
// ...and on the returned board: `foothold: foot.fire ? foot.contract : null, footholdLabel: foot.label`
```

Until this lands, `settings.js:428`'s "stated on the board, never silent" is false of the shipped
board and the −40 is exactly the silent penalty that sentence promises does not exist.

## Open (carried from round 1, unchanged)

- **R1b** — an abandoned board should be *resumed*, not re-posted (`state.js` + `board.js`). Until
  then a held board publishes its wing before the press, and `COMPOSED-GAME.md:520`'s "no reroll
  exists" over-claims by exactly that much. The suite says so in
  `RECORDED: the hold ends the SHOPPING, and what it does not end`.
- **R4** — the collapsed status line (`screens/job.js`, `data/job.js`), round 1 finding #6.

---

## Round 3 — 2026-09-21

Two findings arrived (one MAJOR, one BLOCKER). Every measurement in both of them reproduces — none
was wrong — but they land in two different places.

The MAJOR one reads as "the doc over-claims"; it is not. Chasing the first clause found a real defect
**inside `guard.js`**: the best-response argmax is a tied SET on most jobs and `pressAdvice` was
silently taking its first member. Fixing that makes the published figure TRUE of the shipped code
rather than merely recorded as missed, so the acceptance row does not need weakening on that clause
at all. The other two clauses are genuinely conditional; their conditions are now exported from this
file and asserted, and the doc sentences that drop them are **R13**. The two coverage gaps the critic
named (equal `v` never driven through `simulateShipped`; the all-RUN farm window absent from the
scenario table) are closed, and one of this lane's own test titles that over-claimed — "halves the
exploit in EVERY window" — is restated to what is true and both halves asserted.

The BLOCKER is in `site/js/screens/settings.js`, which this lane does not own and which another
agent wrote to at 20:10 today, mid-round. `guard.js` is on the right side of that finding already;
the in-lane half is done (the paragraph the panel should print is now exported from here, so the
settings lane authors nothing) and the two-line change itself is **R12**.

`node --test tests/job-guard.test.mjs` → **126 pass, 0 fail** (was 120). `node --test tests/` →
2705 tests, 2698 pass, **3 fail — none of them this lane's**, and all three are in the baseline
captured before this round's first edit (`J5 / the primary button prints targets…` in
`tests/job-board.test.mjs`, and `the screen composes no user-facing sentence of its own` +
`J6 measured: a full job at 375x667…` in `tests/job-screen.test.mjs`). Three other lanes were
running their own `node --test tests/` against the same tree while this ran; the baseline had ten
failures and seven of them were fixed by their owners during the round.

### 1. MAJOR — "G8's J3 acceptance row is false for the shipped guard in three clauses". FIXED, and
### the first clause was a defect in this file, not in the doc

Every number the critic measured reproduces exactly (re-run independently, no test helpers, argmax
`v_i(1−y_i)` written out by hand, driven through the real `guardDist` → `pushHeat` → `xHatFrom`):

```
(a) v=(30,20,10) shipped, ε=0   0.6360 0.3640 0.0000   |y₁−0.60| = 0.0360   (7/11 = 0.6364)
    Called 1 (ε=.25)            0.5611 0.3556 0.0833   |y₁−0.60| = 0.0389
(b) equal v, shipped, ε=0       0.3636 0.3636 0.2727   max|y−1/3| = 0.0606  (4/11,4/11,3/11)
    …and at EVERY rank          0.0455 … 0.0547 off uniform — the ε-floor does not rescue it
    n = 4, equal v              0.2727 ×3, 0.1818      max|y−1/4| = 0.0682  (3/11,3/11,3/11,2/11)
(c) 10×RUN → 7×RUN + 3×RUN decoy   Δx̂ = 0.2000        (unrecorded anywhere; the school-hours week)
```

**THE ROOT: the argmax is a SET, and `pressAdvice` was taking its first member.** `x̂` is a TEN-job
window pressed in THREE whole tokens, so the reachable `y` are multiples of 1/10 and `v_i(1 − y_i)`
ties **exactly** — 63 % of a 500-job run on `v = (30,20,10)`, 73 % on equal `v`, counted by
`simulateShipped` itself and asserted. Taking `WING_IDS[0]` out of that tied set every time is a
standing bias toward RECALL, and it is the whole of the deviation. Measured three ways through the same loop:

```
ties settled by          v=(30,20,10) ε=0      equal v (max dev from 1/3)
WING_IDS order           0.6360  (0.036 out)   0.0613  ← what shipped
reverse order            0.5460  (0.054 out)   0.0613  (mirrored)
round-robin              0.5820  (0.018 out)   0.0013
seeded uniform, 4 seeds  0.583 – 0.587         0.0019 – 0.0047
```

So `pressAdvice` now returns **`bestResponseWings`** — the whole tied set, with a relative tolerance,
because these ties are exact in arithmetic and 1 ulp apart in floating point — and accepts an
optional `{seed}` that settles the tie with a seeded uniform draw through `js/rng.js` (G3.6). With no
seed the pick stays index-order and deterministic, so every existing caller is byte-identical.

With the tie settled the way a best response to an indifference is settled, **the shipped path meets
the published row**: `y₁ ∈ [0.583, 0.587]` over four seeds at 2000 jobs, and uniform to 0.005 for
equal `v` at every rank and at `n = 4`. Nothing was widened to get there — the tolerance is
still the published ±0.03, and the index-order attractors are still asserted, by their exact
fractions, as what the other tie-break does.

Two figures are still conditional, and they are now **exported from the implementation** rather than
restated in prose, for the same reason `X_HAT_FORMULA` is:

- `BEST_RESPONSE_ACCEPTANCE` — the row, the condition it holds under, the ε > 0 caveat (at Called 1
  the target is the ε-floored equilibrium `(0.5667, 0.35, 0.0833)`, which the loop reaches to 0.01,
  putting `(.60,.40)` 0.039 away), and the index-order attractors.
- `FARM_BAND` — `< 0.08` holds on any window holding plan-sized or VAULT work (0.058 / 0.061 /
  0.071); it is 0.082 on a 9-JOB + 1-VAULT window, 0.103 on a JOB-10-only window and **0.200 on an
  all-RUN window**. `COPY.schoolWindow` is "School window · RUN only · Mon–Fri 07:00–14:15", so a
  student who plays only between bells HAS that window; every job posts 36, `ω` is flat, and the
  stake weighting has nothing to weigh. What holds on every window is the leverage bound, which the
  suite already proved over 2000 random windows: three of ten equal jobs is 0.30 of the weight and
  `0.30 × (1 − 1/3) = 0.200` exactly.

Both objects are frozen, and each string is checked against the freshly recomputed numbers by a test,
so a doc or a panel that copies them cannot drift from the code again.

New/changed tests in `tests/job-guard.test.mjs`:

| test | what it pins |
| --- | --- |
| `THE PUBLISHED ROW IS TRUE OF THE SHIPPED PATH once a TIED argmax is settled uniformly` | ±0.03 on the shipped path, 4 seeds, `(30,20,10)` and equal `v` and `n = 4` and every rank; the Called 1 residual is the ε-floor and is asserted as such |
| `RECORDED: equal v settled by WING_IDS order is (4/11, 4/11, 3/11), and it is an attractor` | the coverage asymmetry the critic named — this case now drives `simulateShipped`, at 500 / 2000 / 5000 jobs and at every rank |
| `THE SHIPPED PATH …` (extended) | the tied FRACTION (> 50 % of jobs), the 5000-job stability of the 7/11 attractor, and that it really is a **period-11 cycle of the press** — `simulateShipped` returns the press sequence and `periodOf` reads the repeat off it, so "period 11" in the exported string is executed, not asserted by eye |
| `RECORDED: an all-RUN window — the school-hours week — moves the full 0.200, and why` | the missing scenario, plus the proof that it is the only flat-stake window in the table |
| `stake weighting halves the exploit … in every window that HAS a stake spread` | the old title said EVERY window; on a flat-stake window halving is arithmetically impossible, and the test now says which case is which and asserts both |
| `FARM_BAND publishes that band and its condition` / `BEST_RESPONSE_ACCEPTANCE says exactly that` | every measured figure appears in the exported string, filed under the half (holds / misses) that matches its size |

### 2. BLOCKER — Settings prints the GUARD's mixing as "the unexploitable" press. In-lane half done;
### the fix itself is **R12** (`settings.js` is not this lane's file)

The finding is correct and `guard.js` is on the right side of it: this file has named the three
vectors for their own sides since round 2 (`GUARD_MIX_FORMULA` / `MAXIMIN_FORMULA` / `PRESS_FORMULA`,
and `pressAdvice` returns `guardMix` / `maximin` / `press` with no key called `equilibrium`).
Re-measured, unchanged:

```
v=[30,20,10]   guardMix y=1−k/v   0.600 0.400 0.000   <- what Settings tells the student to press
               stationary press p 0.447 0.379 0.174   <- what board.js:267 actually pre-presses
               maximin x ∝ 1/v    0.400 0.600 0.000   <- the real unexploitable press
               tokens pre-pressed {RECALL:1, FIGURES:1, WORDS:1}   (y would put 0 of 3 on WORDS)
```

R8 asked the settings lane to write the replacement prose and it did not land in two rounds, so the
prose is now **exported from this file as `PRESS_PANEL_COPY`** — four sentences, assembled from the
three formula strings, so the panel cannot print a shape the code does not run and the settings lane
does not have to author anything. `tests/job-guard.test.mjs` executes it against the vectors
(`PRESS_PANEL_COPY names each vector for its own side, and the numbers back every sentence`),
including a negative assertion that the string "in proportion to their study value" is gone rather
than reworded. **R12 is now a two-line change in `settings.js`.**

## Requests — round 3

**R12 — `site/js/screens/settings.js`, finding #2. Two lines, and neither of them is prose.**
Add the import (BUILD-POLICY §2 lets this lane add an import; it is NOT added here because another
agent holds the file this round):

```js
import { PRESS_PANEL_COPY } from '../job/guard.js';
```

and at `settings.js:418-420` replace the whole `hint(...)` call — the one that begins
`'A token pays only where the guard is not. The unexploitable answer is…'` — with:

```js
        ...PRESS_PANEL_COPY.map((s) => hint(s)),
```

That prints `pᵢ = A − B/vᵢ` next to the pre-press (the number `board.js:264` commits), names
`yᵢ = 1 − k/vᵢ` as the HOUSE's, and names `xᵢ ∝ 1/vᵢ` as the maximin — which is the reciprocal of
"in proportion to their study value", not a paraphrase of it.

**R13 — `COMPOSED-GAME.md` G8's J3 row and G12 #12, finding #1.** Both figures are conditional and
both conditions are now exported from `js/job/guard.js`. The doc was being edited while this was
written, so GREP the sentences rather than trusting a line number: the J3 row was at `:872` when the
critic filed and is at `:912` now; G12 #12 was at `:978` and is at `:1018`. Paste-ready:

> in the J3 row, replacing "a 500-job best-response simulation converges to `y = (.60,.40)` for
> `v = (30,20,10)` ±0.03 and to uniform for equal `v`":
>
> a 500-job best-response simulation converges to `y = (.60,.40)` for `v = (30,20,10)` ±0.03 and to
> uniform for equal `v`, at ε = 0 and with a TIED argmax settled uniformly — the shipped `x̂` is a
> ten-job window pressed in three whole tokens, so `v_i(1 − y_i)` ties exactly on most jobs, and
> settling those ties by `WING_IDS` order instead lands on `(7/11, 4/11)` and on
> `(4/11, 4/11, 3/11)`, 0.036 and 0.061 out; at ε > 0 the target is the ε-floored equilibrium, which
> the shipped loop reaches inside 0.025 at every rank while `(.60,.40)` itself is 0.039 away at
> Called 1

> in the same row, replacing "(a 3-RUN + 1-VAULT farm moves `x̂` by < 0.08)", and the same sentence
> at the end of G12 #12:
>
> a 3-RUN + 1-VAULT farm moves `x̂` by < 0.08 on any window holding plan-sized or VAULT work
> (0.058 / 0.061 / 0.071 measured), by 0.082 on a 9-JOB + 1-VAULT window, 0.103 on a JOB-10-only
> window and 0.200 on an all-RUN window — the school-hours week, where every job posts the same and
> `ω` has no spread to read. What holds on every window is the leverage bound: re-pressing a subset
> moves `x̂` by at most that subset's share of `Σω`.

Both replacements are `BEST_RESPONSE_ACCEPTANCE` and `FARM_BAND` in `js/job/guard.js`, whose strings
are asserted against the freshly recomputed numbers — quote them rather than re-typing them and the
doc cannot drift again.

**R13b — `COMPOSED-GAME.md`, the four places R8 of round 2 named ("the unexploitable strategy is to
mix pressure … in proportion to their study value", G3.8 #2's "Presses tokens at the mixed
equilibrium", the gradient table's "wing token equilibrium" row, and G9 criterion 5 — line numbers
have moved, grep them).** Still unapplied, and it is finding #2's other half. The prose is now in `PRESS_PANEL_COPY` and can be quoted straight out of it.

**R14 — `tests/job-copy.test.mjs:102`, finding #2's "why no test caught it".** `LAYER_SOURCES` lints
the eight layer files and `screens/job.js`; `screens/settings.js`, `screens/home.js`,
`screens/stats.js` and `screens/run.js` carry most of the layer's prose and are not linted at all.
Adding them is one line — but it is the copy lane's call, because the lint will then read four files
it has never read.

**R15 — `site/js/job/board.js:267`, new.** `pressAdvice(dist, values.byWing)` leaves the tie-break at
index order, so on a board where two wings are worth the same the DEBRIEF's `bestResponseWing` always
names RECALL. One argument fixes it, and the seed is already in scope for the guard draw:

```js
-  const press = pressAdvice(dist, values.byWing);
+  const press = pressAdvice(dist, values.byWing, { seed: jobSeed });
```

`bestResponseWings` (the whole tied set) is also returned now, if the debrief would rather name both.
NOTE: this changes which wing the debrief names on an exact tie; it changes no payoff and no token
count, because `tokens` apportions `press`, never the argmax.

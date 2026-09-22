# notes/index-fix.md — the `index` lane (site/js/job/index.js), fixer round 1

Owner of this round: `site/js/job/index.js` + `tests/job-index.test.mjs`. Nothing else was touched.

## R1 · [BLOCKER] No Fault Index tag could EVER seal — CONFIRMED, fixed at the root

### What the critic found, reproduced through the SHIPPED machine (not through the module)

`site/js/job/state.js applyTarget` is the only caller of `index.resolve()` in `site/js`
(`grep -rn "index.resolve\|index.trigger" site/js` → `job/state.js` only), and it resolves exactly
the tag the priced target's TELL named. `tellDetail`'s candidate filter read

```js
return r.sealed !== true && r.cleared !== true;      // old
```

so the instant a tag was resolved once it left the tell pool for ever, the caller had nothing left to
resolve, and `resolved` stuck at 1 against a seal that needs 3. I drove the real state machine —
`startJob → lockCall → applyTarget → push`, with `screens/job.js`'s own `index.tellHookFor` — for four
simulated days of honest play (one miss, then clean clears):

```
2026-09-16 {"resolved":1,"triggered":1,"days":1,"lastDay":"2026-09-16","cleared":true,"sealed":false} tell-> null
2026-09-17 {"resolved":1,...,"days":1,"lastDay":"2026-09-16","sealed":false} tell-> null
2026-09-18 {"resolved":1,...,"days":1,"lastDay":"2026-09-16","sealed":false} tell-> null
2026-09-19 {"resolved":1,...,"days":1,"lastDay":"2026-09-16","sealed":false} tell-> null
sealed tags after 4 days of honest play: []
```

68 cells, `index-25`, `index-68`, the completion certificate ("the sixty-eight mistakes I no longer
make", G2) and the retirement half of G3.7 proof 3(e) were all unreachable. The only retirement left
was `cleared`, which the next miss undoes.

### The fix (index.js, `tellDetail`)

A SEALED tag is still gone for good. A **cleared-but-unsealed** tag now stays in the candidate list,
ranked strictly BEHIND every live one:

```js
.filter((c) => !c.sealed)
.sort((a, b) => Number(b.live) - Number(a.live) || b.triggered - a.triggered || …)
```

so the next clean clear of that make resolves it again and the seal can land on day 3. Each candidate
and the returned record carry `live` (true = a live fault at ×1.25; false = a resolved one riding at
1.00 so the seal can advance).

**It moves no money.** `econ.tellFor` prices a record with `cleared === true` at 1.00, and a live tag
can never be displaced by a cleared one, so every posted value in the game is byte-identical to before
the change: the only newly-offered records are ones that price exactly like no tell at all. The one
new behaviour is that `applyTarget` now has a tag to resolve on encounters 2 and 3.

Trigger/resolve arithmetic was NOT touched: a re-trigger still wipes `resolved`/`days`/`lastDay`
(G2's "zero re-triggers in that window"), `sealsOn` still needs `resolved ≥ 3 ∧ days ≥ 3`, and `days`
still only moves on a NEW ISO day — so three resolutions inside one day still do not seal.

Same four days, after the fix:

```
2026-09-16 resolved 3 days 1 sealed false   tell-> middle-term   (re-offered at 1.00)
2026-09-17 resolved 7 days 2 sealed false   tell-> middle-term
2026-09-18 resolved 8 days 3 sealed TRUE    tell-> null          (retired for good)
2026-09-19 sealed stays true, tell-> null even with the miss still in save.errors
sealed tags after 4 days of honest play: [ 'middle-term' ]
```

### The `clean` half of the finding — the seam is in, the caller is a Request

G2 seals on resolutions that were **clean**, and `state.js` resolves on `ok` (any clear, hints and
attempt 3 included). I own neither `state.js` nor `COMPOSED-GAME.md`, and the spec is the authority,
so I built the seam and left the one-line call-site change as a Request (below):

`resolve(save, tag, { day, clean })` — an explicit `clean: false` now changes nothing at all
(`reason: 'not-clean'`, `changed: false`, the fault stays live at ×1.25). `clean` omitted — what
`state.js` passes today — is treated as clean, so this is a pure addition with zero behaviour change
until the caller opts in.

### Tests added (tests/job-index.test.mjs §2b, all through `state.applyTarget` — never `resolve()`)

* `miss it once, then clear it cleanly on three distinct days — it seals, and not one day sooner`
  — plays three real jobs; asserts days 1 and 2 do NOT seal, day 3 does, `applyTarget` reports
  `sealedTag`, `sealedOf`/`indexProgress`/both milestones move, and that the tag then leaves the tell
  pool for good **with its error lines still in `save.errors`**.
* `a re-trigger inside the window costs the days back, in the app and not just in the module`.
* `the re-offered tag is priced at 1.00, so reaching the seal moves NO posted value` (`econ.settle`
  with the cleared record `deepEqual`s `econ.settle` with no tell at all).
* `a LIVE fault always outranks a resolved one` — a 5-trigger cleared tag never takes the ×1.25 slot
  from a 1-trigger live one; candidate order asserted as `[[live, true], [cleared, false]]`.
* §2 gained `a clear the grader did not call CLEAN advances nothing`.

A/B proof that these are guards and not tautologies (frozen snapshot of the repo, my change reverted
in the copy only — the live tree was never touched):
`with the fix: job-index 83/83 green · with it reverted: the same suite fails at 167, 253, 292, 316`
— exactly the four new tests, and no other test in the repo changes verdict either way.

## Requests (files I do not own)

1. **`site/js/job/state.js` (state lane), `applyTarget`, the Fault Index block** — one line:
   `index.resolve(s, tag, { day: todayISO(new Date(now)), clean: result?.clean === true })`.
   The module already honours it (see above) and ignores it when absent, so the change is safe in
   either order. Without it the code resolves on `ok` while G2 §"The Fault Index" and the comment
   directly above the call both say a CLEAN clear — that is the last live half of the R1 finding, and
   it cannot be closed from inside `job/index.js`.
   (The same block's comment "`tellFor` only ever offers an unsealed, uncleared tag, so a returned
   record is live by construction" is now stale: it offers an unsealed tag, which is live OR cleared —
   `tell.live` says which, and the resolve call is correct for both.)

## Suite status at hand-off

`node --test tests/` is NOT green, and none of it is this lane: `tests/job-index.test.mjs` is
**83/83**, and every failure names another lane's file, which is being rewritten as I write this
(`crew.js` grew 38k → 61k and gained a bare `Date.now` at 14:42; `guard.js` tripped the
banned-copy grep with "good job"; `job-state.test.mjs:698`; `screens/home.js` threw
`baseHref is not defined` at 14:30 and no longer does at 14:37). The A/B above confirms the failure
set is identical with my change reverted.

---

# Round 2 — the `index` lane (site/js/job/index.js + tests/job-index.test.mjs)

Owned and touched this round: `site/js/job/index.js`, `tests/job-index.test.mjs`. Nothing else.
`site/js/job/state.js` was NOT edited — see R2.1 "why the fix is in this file".

## R2.1 · [MAJOR] The seal resolved on ANY clear, not a clean one — CONFIRMED, fixed at the root

### The finding, reproduced

G2: "A tag is **sealed** when it has been **resolved cleanly** 3 times across 3 distinct days"; G8's
J7 row: "sealed requires 3 **clean** resolutions on 3 distinct days"; the certificate reads "here are
the sixty-eight mistakes I no longer make". `state.js applyTarget` — the only caller of `resolve()`
in `site/js` — gates on `ok = result?.cleared === true` and passes `{ day }` and nothing else, so a
card the student got wrong twice and right on attempt 3 resolved its tag, dropped the ×1.25 G2 calls
"the best-paying single thing in the game", and advanced the seal. Driven through the shipped machine
(one job, target 2 answered on the third attempt, everything else clean) the record read
`resolved 1 · cleared true` off that attempt-3 clear. It is the still-open half of R1's Request 1.

### Why the fix is in THIS file, not at the call site

The call site is `site/js/job/state.js:1006`, which this lane does not own and which another agent is
editing **right now** — `state.js` was 81 978 bytes at 14:44 and 92 210 bytes at 17:47, and the
Fault-Index block moved from line 900 to line 1006 between two greps in this sitting. R1 already
filed the one-line Request and a full round passed without it landing. So the rule is enforced from
inside `index.js`, where it can be enforced without touching anyone's open file.

### The fix — `resolvedCleanly(save, opts)` (index.js), read by `resolve()`

Three sources, in order:

1. `opts.clean` — the grader's verdict, when a caller passes one. It always wins (R1's seam, intact).
2. **the rung the state machine already stamped for the very target it is resolving for** —
   `save.inProgress.game.last.rung`, written two statements above its `resolve()` call
   (`state.js:987`/`:992`, then the Fault Index block at `:995`). `RUNGS.CLEAN` is rung 0 — first
   try, zero hints — which is `xp.isClean()` exactly, so HINT1 / ATT2 / ATT3 all read as not clean.
   `last.ok !== true` means the stamp is not a clear, so it is not this resolution's rung and is not
   read.
3. nothing to read (no live job: a direct module call, a migration, a unit test) — clean, which is
   the lenient reading this module already shipped. Those callers see no change at all.

A non-clean clear therefore does exactly what R1's `clean: false` did: `reason: 'not-clean'`,
`changed: false`, record untouched, the fault still LIVE at ×1.25 until it is met and beaten outright.

**(2) is a bridge, and it is better than the flag the finding suggested.** The suggested call-site
line was `clean: result?.clean === true`. `screens/card.js:952` does set `clean`, but 33 clear-result
literals in `tests/` do not (e.g. `tests/job-ledger.test.mjs:219` `CLEAN = { cleared: true, firstTry:
true, hints: 0, attempt: 1 }`), and `screens/run.js:613` already compensates with
`r.clean ?? isClean({…})`. `rung` is `rungOf(result)` — computed from `cleared`/`firstTry`/`hints`/
`attempt` — so the bridge reads those synthetic results correctly where the raw flag would have
called every one of them dirty and re-closed the seal.

The invariant it rests on — `last.rung` is stamped for THIS target before the Fault Index block runs —
is asserted through the shipped machine (§2c below), so a caller that reorders those two statements
fails a test instead of silently re-opening the hole. When the caller does start passing `clean`,
rule 1 takes over and rule 2 is never read.

### Tests added — `tests/job-index.test.mjs` §2c, all through `state.applyTarget`

* `a hinted clear / an attempt-2 clear / an attempt-3 clear clears the card and resolves NOTHING`
  (three tests, rungs 1/2/3). Each asserts it is not vacuous first — the tag was triggered, the tell
  was offered back on a target the student **cleared**, and the clears landed on the rung under test —
  then `{resolved: 0, days: 0, cleared: false, sealed: false}`, `tellMultiplierOf === 1.25`, no seal,
  and the fault still in the make's tell pool. HINT1 carries the grader's own `clean: false`; ATT2 and
  ATT3 carry **no `clean` key at all**, so the bridge is what is being tested, not the flag.
* `three attempt-3 days never seal, and the first clean day is the first one that counts` — three days
  of third-attempt clears leave `resolved 0 · days 0 · sealed false` and `sealedOf(save) === []`, and
  the same save then seals on three CLEAN days, so the gate blocks nothing it should not.
* `the rung applyTarget stamps belongs to the target the Fault Index is resolving FOR` — mixed play
  inside ONE job: target 2 attempt-3, target 3 clean; `last.rung === beat.rung` on every target, the
  messy one moves nothing, the clean one resolves on the same day, same make, same tell.

### §2b was RED before I started, for a reason outside this lane — harness repaired

`tests/job-index.test.mjs` was 81/83 on arrival (it was 83/83 at R1 hand-off). Cause: `startJob`
drafts its own queue from `board.js`'s posted board, and the board lane's round-1 change moved the
recommendation, so the page of FAC2 cards the harness composed was no longer what the job dealt —
the miss landed on a VOC card, `middle-term` was attributed to VOC, and FAC2's tell was `null` for
the rest of the job. The assertions were right; the setup had gone stale. `playDay` now seeds the
error log with one line per **drafted** card (exactly the line `screens/card.js logError` writes), so
the make under test is whatever the board deals and this suite no longer depends on a draft it does
not own. Not one assertion was weakened; five were added.

### A/B proof (frozen snapshot, my change reverted in the copy only — the live tree never touched)

13 suites, everything that reads `game.tags` or drives `applyTarget` (`job-index`, `job-exploit`,
`job-crew`, `trophies`, `job-state`, `job-state-r1`, `job-ledger`, `job-debrief`, `job-monotone`,
`job-split`, `job-screen`, `job-save`, `job-week`):

```
with the gate:  473 tests · 469 pass · 3 fail
gate reverted:  473 tests · 464 pass · 8 fail
diff of the failure sets = exactly the 5 new tests, and nothing else
```

The 3 constants are `tests/job-split.test.mjs` and `tests/job-board.test.mjs` — the J8 split / board
lanes, red with and without this change.

**It moves no posted value.** `econ.tellFor` prices a live record at 1.25 and this change only ever
KEEPS a record live that the old code would have cleared, so every payout that was ever clean is
byte-identical; what changes is that a messy clear no longer buys the retirement.

## Suite status at hand-off

`cd /Users/oliver/Projects/unit1a-quest && node --test tests/` → **2611 tests · 2606 pass · 1 fail**,
and `tests/job-index.test.mjs` is **88/88**. The one failure is `tests/job-screen.test.mjs:474`
("J6 measured: a full job at 375x667…"), whose Playwright harness `qa/job-screen.mjs` throws
`PROBE_REACH is not defined` — the screen lane's file, mid-edit, and nothing to do with the Fault
Index. (Twenty minutes earlier the same command read 2609 · 2602 · 3, the three being
`tests/job-board.test.mjs:1375` and `tests/job-split.test.mjs:483/:962`; those lanes have since
landed their fixes. The A/B above shows every one of them failing identically with my gate reverted.)

## Requests (files I do not own) — carried over and AMENDED

1. **`site/js/job/state.js` (state lane), `applyTarget`, the Fault Index block** — still worth doing,
   and now belt-and-braces rather than load-bearing: pass the grader's verdict explicitly so the
   module never has to infer it.
   Use the RUNG, not the raw flag: `index.resolve(s, tag, { day: todayISO(new Date(now)), clean: rung === RUNGS.CLEAN })`
   (`rung` is already in scope as `rungOf(result)` three lines above). `clean: result?.clean === true`
   would be WRONG for every result that carries `{cleared, firstTry, hints}` and no `clean` key — 33
   such literals drive `applyTarget` in `tests/`, and `screens/run.js:613` already works around it.
   If you do take it, keep `last` stamped BEFORE the Fault Index block either way: `tests/job-index.test.mjs`
   §2c asserts that ordering.
2. **`state.js:997-999`, the comment above the block** — "a **clean** clear … resolves it" is now true
   of the code, but the sentence after it ("`tellFor` only ever offers an unsealed, uncleared tag, so a
   returned record is live by construction") is still stale: the pool also offers a cleared-but-unsealed
   tag at 1.00, which is the only road to resolutions 2 and 3. `tell.live` says which.

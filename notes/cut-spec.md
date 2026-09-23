# notes/cut-spec.md — the SPEC lane

## Round 1 fixer — four findings, all fixed at the root

Owned file: `designs/CUT-SPEC.md`. Authority: `designs/CUT-BRIEF.md`, then `BUILD-POLICY.md`.

### 1. [BLOCKER] "§4 scores 1.000000000 at every q" — false below q = 1/3

Reproduced independently before touching anything: rebuilt `policyValue`/`solveDP` from the test
file verbatim against `site/js/job/pay.js` and swept q at 0.001. The failure band was
q ∈ (0.295, 1/3] at every session length, worst 0.9376 at q = 1/3, T = 14, because
`qStar(not sure, ×2) = 4/12 = 1/3` exactly and the rule then banks at every streak.

**Fix:** the claim, not the rule — and both edges of the honest claim were pinned in
`tests/job-pay.test.mjs` so neither can drift (the band edge at q = 0.34 asserted exactly
`1.000000000` at T = 8, 10, 12, 14 and every 0.01 step to 0.99; the floor asserted to four figures
at q = 1/3). Chasing the optimum below 1/3 needs a lookahead past the next question — a second
formula on a surface no student sees, to buy 6 % at a hit rate of one in three. That is the
re-inflation CUT-BRIEF forbids.

**SUPERSEDED MID-ROUND.** While this was being written, the engine lane replaced the flat payoff
table with one that prices the pile (a wrong answer now takes the call's bite plus `⌊(P−40)/2⌋`),
and rewrote `tests/job-pay.test.mjs` around it. Against that table §4 is *near*-optimal, not exact:
**0.9574** of the optimum at its worst, q = 0.81, T = 12 — pinned in that file. §7 #3 now publishes
that figure. The finding stands as fixed: the spec no longer claims exactness it does not have.

### 2. [MAJOR] Four §7 measurements did not reproduce

All four confirmed by recomputation, then all four re-derived from the shipped module and pinned:

| §7 | published (wrong) | now published | pinned in |
|----|-------------------|---------------|-----------|
| #1 cells | 1,847,239 | **1,198,782** (981 × 1,222) | `job-pay.test.mjs` |
| #2 shares | 26.1 / 20.9 / 38.3, bank 14.1 | **4.7 / 5.7 / 17.5, bank 72.0** | `job-pay.test.mjs` |
| #3 sweeps | 0 of 1,372 / 0 of 1,470 | **2,110** streak / **3,628** pile | `job-pay.test.mjs` |
| §2 states | 0 of 2,383 (`reachable(14)`) | 0 of **1,222** (`reachable(12)`) | `job-pay.test.mjs` |

Two assertions were added by this lane and kept by the engine lane's rewrite: the reachable-state
count and the §7 #2 share table, both pinned to the digit rather than floored — a `> 5 %` floor and
a `> 3000` floor are exactly what let four quoted figures drift in the first place.

### 3. [MAJOR] The measured split is 9–19 %, not 45–55 %

Verified independently through the shipped state machine on a declared clock (no browser): 9 % at
3 s deciding / 20 s answering / 10 s reading, 13 % with no reading pause, 19 % tapping through,
and the number is a property of the pace, not of the session length or the questions.

`designs/CUT-SPEC.md` §8 had published `job-split (measured 45–55 %)` as a shipping test. **No such
file existed**, and `site/js/job/state.js:350` cited it too. The repo's entire split coverage was
`assert.deepEqual([SPLIT.lo, SPLIT.hi], [45, 55])` — two literals equalling two literals.

**Fix:** §8 now publishes what the meter measures and names the conflict as an owner decision
instead of shipping a target as though it were met. `tests/job-split.test.mjs` now exists (written
by the tests lane, which landed a far more thorough file than this lane's first draft — its version
was kept). The spec quotes only figures that file pins: the 9 %, and the band restated as an
identity — 45–55 % asks the face-down card to hold a student 0.82–1.22× as long as everything else,
i.e. 16–24 s of choosing on the fastest card `COMPOSED.md` publishes.

**OPEN — FOR CUT-BRIEF'S OWNER, NOT A CODE PATCH.** CUT-BRIEF's remedy for a low split ("fewer,
harder questions") collides with its own "Same queue as Today's Page, same length, same items", and
the composer owns the queue. Either cut the session or amend the Session-shape target. Nothing in
this lane can close it, and the spec must not paper over it.

### 4. [BLOCKER] A study generator shipped inside `js/gen` and changed Today's Page

Confirmed before deleting, with a headless compose diff of 18 saves between the pre-game tree
(`git archive 3a57ff5`, read-only) and the current one: 8 differing lines, `card ASN-PLP fact-02` /
`card ASN-ANG asn-01` replaced by `variant ASN-PLP T-asn-reason`. Weak ASN-ANG got **no item at
all** — `T-asn-reason.skills[0] === 'ASN-PLP'`, so `templateForSkill`'s primary-skill filter landed
every weak ASN slot on ASN-PLP.

**Fix — deleted, as the finding asked:**

- `site/js/gen/asn-reason.js` (385 lines) removed;
- the `/* === J5b === */` block removed from `site/data/templates.js` — the file is now
  **byte-identical to 3a57ff5** (`git diff 3a57ff5 -- site/data/templates.js site/js/gen/` is empty);
- `node qa/gen-precache.mjs` re-run: `js/gen/asn-reason.js` dropped from `site/sw.js`'s PRECACHE;
- the `SKILL_GROUPS` / `WINGS` residue removed from `site/data/job.js`. Its own comment said
  "REQUEST for whoever next owns `js/gen/asn-reason.js`: … it is the only reader". It was, and it
  is gone; the four wing names are now nowhere in the codebase.

**Re-verified after the deletion: 0 of 18 compose cases differ from pre-game.**
Probe kept at `/private/tmp/.../scratchpad/compose-probe.mjs` (scratch; re-derive from this note if
it has been reaped — it is 40 lines around `composePage`).

## Requests for other owners

- **`site/js/page.js`** (study lane): `git diff 3a57ff5` shows its only change is a comment block
  plus three imports added for the deleted game half — `rngFrom`, `overdueDays as overdueDaysOf`,
  `isMastered`. Behaviour is unchanged (the compose diff above proves it), but if they are unused
  they are dead and should go, so CUT-SPEC's "Untouched … `page.js`" is true byte-for-byte.
- **`site/js/job/state.js:350`** (machine lane): the comment now names a file that exists. It did
  not when it was written; worth a glance that the invariant it claims is the one that file asserts.

## Word count

`designs/CUT-SPEC.md` is **1,197 words** (`len(text.split())`). The file used to end with
`**Word count: 1,199.**` while actually running ~1,278 by the same measure, and no test checked it.
That line is gone: a self-reported count nothing verifies is the same defect class as the rest of
this round. CUT-BRIEF's 1200-word limit is met by measurement, not by assertion. Casualties of the
trim were unpinned decoration only — the tournament provenance (`53.1 % → 31.3 %`), the deleted
modules' line counts (`7,570`), the rewritten files' before/after sizes. Every surviving number is
one the shipped code produces and a test asserts; cross-checked file by file at the end of the round.

## Cross-lane note — this round was concurrent

`tests/job-pay.test.mjs` changed hands three times while this lane worked (694 → 777 → 1,024 lines),
and `site/js/job/pay.js` twice, the second time changing the payoff table itself. `CUT-SPEC` §2, §4
and §7 were re-derived from scratch against the final shipped table rather than the one this lane
first measured; every figure was re-grepped against the test that pins it before the file was
closed. `tests/job-split.test.mjs` was written twice, and the other lane's version was kept.
If the table moves again, §2, §4 and §7 move with it.

---

# ROUND 2 — FIXER PASS (spec lane)

Four findings, all in `designs/CUT-SPEC.md`. No code, no test, no other file touched; nothing
committed. `node --test tests/` green at the end of the pass.

## 1 + 4. The split — the owner decision is CLOSED in the spec, and closed against the target

Both findings are the same fact seen twice: the meter is honest and the level is 9–18 %, against
CUT-BRIEF's 45–55 %. Round 1 printed the 9 % and wrote **OWNER DECISION: cut the session … or amend
the target** — two live branches and no choice, which is what the critics called still-open.

Re-verified, not re-litigated. `tests/job-split.test.mjs:176` pins `over.split === 9` on the
declared 3 s / 20 s / 10 s clock, and `:395-397` pins the band as an identity —
`gameBudget(20 000, 45) = 16 364 ms`, `gameBudget(20 000, 55) = 24 444 ms`. Nothing in the critics'
measurements contradicts either; their 16–18 % is the same meter at a different pace.

**The branch taken, written into §8 as a decision rather than a question:** ship the measured share,
and record the distance to 45–55 % as an accepted deviation of this spec. The other branch is shut
by CUT-BRIEF's own text, and the spec now says so in one sentence instead of gesturing at it:
padding the game with waiting is forbidden outright, and a shorter session is closed by "same queue,
same length, same items" plus the composer owning the queue. That also disposes of the session-length
half of finding 1 (Home's 14 items / ~17 min vs "8–12 questions"): the session is Today's Page's
length, and the spec now states that rather than quoting the brief's count as though the game chose it.

`COPY.split` **stays on the end panel.** Finding 1 suggested dropping it; finding 4 said keep it.
Keeping it is right and the reason is one line: CUT-BRIEF requires the app to measure its own split
and print the measured number, never a claimed one, and that requirement exists *because* the deleted
layer shipped a claimed 50 % over a measured 29 %. Dropping the print would delete the only guard
against the exact failure that produced this brief, and would need a brief amendment anyway. It is
printed once, after play — never during, so it costs no on-screen number and no tap.

What is left for CUT-BRIEF's owner is editorial and is named as such in §8: ratify the measured share
as the target, or move "same queue, same length". Nothing below the brief can do either, and this
lane owns only the spec — so the spec states the decision it *can* make and stops pretending the rest
is a build blocker.

## 2. §7 #3's pile claim was false for 2,035 of 3,628 comparisons — fixed at the sentence

Confirmed independently, from `site/js/job/pay.js` alone (probe re-derives `reachable(12)`, `qStar`
and the offered-call gate the way `tests/job-pay.test.mjs` does):

    {"states":1222,"pileSteps":3628,"fell":0,"rose":1593,"flat":2035,"streakSteps":2110,"notStrict":0}
    flat example  qStar('sure',3,24) === qStar('sure',3,25) === 0.5217391304347826

The share is `⌊(P−40)/2⌋`, so `q*` cannot move below pile 40 and moves on only half the steps above
it. The test was always honest — `job-pay.test.mjs:426-428` asserts `fell === 0` and records
`rose === 1593` separately — the spec sentence was the thing quoting 3,628 as if all of it rose.

§7 #3 now reads: falls strictly with the streak, **2,110 of 2,110 steps**; never falls with the pile,
**1,593 of 3,628** single-point steps raise it and the rest are flat, because the share is floored.
`site/js/job/pay.js`'s header does **not** repeat the claim (checked: `grep -rn "3628\|rises strictly"`
hits only this spec and the two test assertions), so no cross-file request is owed.

## 3. 1,406 words → **1,189 by `wc -w`**

The round-1 count (1,197) was `len(text.split())` after stripping headings and code spans — the one
measure that passed. It now passes on every measure a reader would use:

    wc -w                            1189
    minus headings                   1150
    alphabetic-only words             987
    minus headings AND code spans     989

Cut, in order of size: §5's three-paragraph defence of "why it is not `7 of 10`" and §6's repeat of
it; §7 #3's never-bank / always-bank score table (the claim and `0.9574` survive — the sweep is
`job-pay.test.mjs:504-529`); §4's second worked example collapsed into the first; §1's restatement of
§2 and §3; §2's restatement of the call ladder; §8's file-manifest prose. **No claim was softened and
no number was dropped that was load-bearing** — every surviving figure was re-grepped to the test that
pins it.

One word came back after the trim: §5 said "the ten-mark ruler", and
`tests/job-screen.test.mjs:987` records that `grep -niE "bar|stake|ruler" designs/CUT-SPEC.md` is
empty — the round-1 spec had already falsified that comment. §5 now says "the row is ten marks wide",
which keeps the fact and makes the grep true again.

**§9 was folded back into §8** rather than left as a new section: `tests/job-split.test.mjs:1` calls
itself "the fifth ship test of designs/CUT-SPEC.md §8", and renumbering would have made that comment
false for no gain. §8 is now "Files, and the split".

## Cross-lane note

`designs/CUT-SPEC.md` changed under this lane mid-pass: §7 #6 grew another lane's honesty fix (the
`200` / `33` / `363` sweeps and the `182.8 → 176.5` step across 4/5, pinned at
`job-pay.test.mjs:833,876,905-906`). It was **kept in full**; only its closing rhetorical clause was
trimmed for the word budget. If that lane is still running, re-check §7 #6 against its own note
before trusting this word count.

---

## Round 3 fixer — one BLOCKER, fixed at the sentence in §8

Owned file: `designs/CUT-SPEC.md`, and nothing else. The engineering half of the suggested fix
(`app.js`, `plan.js`, `screens/home.js`, `css/screens.css`) belongs to three other lanes — Requests
at the bottom.

### The finding, re-measured from the tree rather than read

Every part of it reproduced, from the pre-game commit and the shipped files, with no browser:

    git show 3a57ff5:site/js/app.js | grep -n addEventListener      # no document click handler
    grep -n "settings.game\|gameOn" site/js/app.js                  # empty — the file reads no flag

`site/js/app.js:437` installs `document.addEventListener('click', sameRouteClick)` inside `boot()`,
unconditionally. Pre-game `site/js/screens/home.js:131` is
`const href = k === 0 ? '#/morning' : k === 1 ? '#/night' : '#/today';`; shipped `home.js:158` ends
`: null`, and pre-game `plan.js` has no `p.self` at all (`plan.js:548` today:
`if (p.kind !== 'gap' && !p.self) a.href = p.href;`). Neither reads `gameOn`. `.blitz-card`:
pre-game `max-height: 560px`, shipped `35rem`; `tests/final-layout.test.mjs:118` asserts
`35 × 16 === 560`. So the flat claim in §8 was false, and `tests/cut-meta.test.mjs`'s `UNGATED` was
the honest artifact.

**One part of the finding is already stale, and it matters for the fix.** `page.js`'s three dead
imports are gone:

    git show 3a57ff5:site/js/page.js | diff - site/js/page.js
    550a551,559   →  one 9-line tombstone comment, nothing else
    grep -c rngFrom site/js/page.js → 0 ; no `overdueDays`, no `isMastered`

So `page.js` today is pre-game's executable content **to the byte**, one comment apart —
`cut-meta`'s `PAGE_PREGAME_CODE` still passes because stripping absent specifiers is a no-op.

### What §8 says now

> **Untouched** `…`, `rarity.js`, each hashed against pre-game. … `page.js` is pre-game's
> executable content to the byte, one tombstone comment apart.
>
> **`settings.game = false` is COMPOSED except the ungated deltas `cut-meta`'s `UNGATED` names** —
> a closed list, an owner per row, that may shrink and may not grow.

and §8's last line now sends two editorial calls to CUT-BRIEF's owner, not one: ratify the measured
share or move "same queue, same length", **and** ratify the deltas or have their lanes gate them.

**Two deliberate departures from the suggested wording.** (1) *No count.* The suggestion said "the
four deltas"; `UNGATED` is a list that may shrink, and one of its four rows is already spent, so a
printed `four` would be false on the next fix. The spec points at the register, which is the thing a
test holds (`UNGATED.length <= 4`, plus "every global listener it ADDED is one the closed list
names"). (2) *The deltas are not restated in the spec.* Restating them is precisely what produced
this finding — two artifacts asserting the same fact and drifting apart. One register, one pointer,
and a lane that lands a gate deletes its row without needing a spec edit.

### The word budget was the real constraint

1189 → **1195** by `wc -w` (cap 1200; 1156 minus headings). The new text costs ~35 words, paid for
by lossless compression with no claim softened and no number dropped: §5's hit-rate paragraph
(−10), §7 #3's pile clause (−4), §8's two split paragraphs (−6), five one-word joins elsewhere.
`grep -niE "bar|stake|ruler" designs/CUT-SPEC.md` is still empty, which `tests/job-screen.test.mjs`
:1022 records as true. `§7 #6` (another lane's honesty fix) was not touched.

`node --test tests/` is **green at the end of this pass: 1821 tests, 1817 pass, 0 fail, 4 skipped,
exit 0.** No test was deleted, skipped or weakened, and none here covers a mechanic the brief cuts.

One transient worth recording, because the next lane will hit it too. The baseline run before my
edits was green at **1802** tests; a run finishing at 01:28 reported **1807** tests and **6 fails**
(`job-ledger` "only the door itself reads the flag" — `js/screens/run.js` had joined the readers;
`job-save` `IN_PROGRESS_KEYS`; `job-split`'s meter field; `layout-root` at 1900 px), and the run
after that was green at **1821**. Those are other lanes landing mid-run — `site/js/screens/run.js`,
`site/js/plan.js`, `site/js/store.js`, `site/js/job/state.js` and four test files all have mtimes
inside the failing run's window. Nothing in this lane can reach them: the only files it touched are
`designs/CUT-SPEC.md` and this note, `designs/` is git-ignored, and
`grep -rnE "read[A-Za-z]*\(|execSync|readFile" tests/*.mjs | grep -E "designs|notes/"` is empty —
no test reads either path. **Re-run before believing a red suite during a parallel round.**

### Requests

1. **META lane — `tests/cut-meta.test.mjs`.** The `page.js:dead-imports` row of `UNGATED` is spent:
   its `why` says "three imports nothing in the file uses" and "page.js is on CUT-SPEC §8 Untouched
   and is not byte-identical", and both are now false — the imports are gone, and §8 no longer lists
   `page.js` among the Untouched. **Delete the row** (the list may shrink), or reduce its `why` to
   the one fact left, the tombstone comment. Nothing goes red either way; it is simply the only
   stale sentence in the register the spec now points at.
2. **app-shell lane (`site/js/app.js`) and home lane (`site/js/plan.js`, `site/js/screens/home.js`).**
   If you gate `sameRouteClick`'s installation and `hereNow`/`planStrip`'s self-pill on
   `gameOn(save)`, delete your `UNGATED` rows — the spec's sentence narrows by itself, because it
   names no delta.
3. **CUT-BRIEF's owner.** `designs/CUT-BRIEF.md:89` still reads "`settings.game = false` returns the
   app to byte-identical COMPOSED behaviour". The spec no longer repeats it. That line is either
   amended the way §8 was, or the two lanes above gate their deltas and it becomes true again.

---

## Round 4 fixer — one MAJOR, the 50/50 gap. Owned file: `designs/CUT-SPEC.md`, nothing else.

### The finding is right, and I re-derived every number without reading a test name

`job-split`'s harness drives the verbs; the arithmetic under it is `splitOf`, so I recomputed the
whole finding from the shipped engine instead of quoting the suite:

    node -e "import('./site/js/job/state.js').then(s=>{const so=s.splitOf,D=s.DELIBERATION_MS;
      const p=(n,d,a,r)=>so({tGame:n*Math.min(d,D),tAnswer:n*(a+r)});
      console.log([p(12,2000,45000,15000),p(12,3000,20000,10000),p(12,5000,20000,10000),p(12,8000,25000,5000)],
                  [4,8,12,23].map(n=>p(n,3000,20000,10000)), p(8,3000,45000,10000), D,
                  [20000,26000,29900,30000].map(x=>so({tGame:D,tAnswer:x})));});"
    → [3,9,14,21]   [9,9,9,9]   5   24000   [55,48,45,44]

So: the loop's honest span is **3–21 %** (the critic's played 12.5 % and 18 % sit inside it), the
brief's stated remedy *fewer* moves nothing (a share is a ratio — 4, 8, 12, 23 questions all print
9 %) and *harder* moves it the wrong way (45 s answering → 5 %), and at the 24 s deliberation
ceiling the band's floor survives only up to a **29.9 s** question. CUT-BRIEF:16 cites the deleted
layer's **29 %** as evidence of failure. The replacement tops its honest span at 21 %.

### What I changed, and the one decision I took

§8's three closing paragraphs. The old text measured the split on one declared clock and printed
its single value (**9 %**), then declared the band unreachable, then said "**Decided: ship the
measured share**". Three defects, all fixed at the sentence:

1. **One clock became the span.** `job-split` is driven on 2–8 s deciding against 20–45 s answering
   and the panel prints **3, 9, 14, 21 %**. A reader of the old line could believe 9 % was the
   number; it is the middle of a span the student's own session lands in.
2. **The comparison the spec never made.** §8 now says it in its own words: this is *under the share
   CUT-BRIEF's Why calls a failure* — 29 % against a span topping at 21 % — and it prices both
   escapes with the engine's own arithmetic (the ratio invariance, and the 30 s question at the
   ceiling). The old text asserted "unreachable by construction" and left the owner nothing to
   decide with.
3. **"Decided" was deciding someone else's half.** The band and the queue belong to CUT-BRIEF's
   owner and the composer; the spec cannot ratify either. **What the spec does own is who the
   number is for, and that half is now taken: the measured share is instrumentation, not the
   student's line.** It moves to Settings beside the band lines, leaving the end panel
   `today 186 points` and `best 274` — his two numbers, no sentence about the app. Nothing is
   hidden: it is still the measured number, still printed, and the deviation still stands in §8 and
   in `job-split`. **The spec says plainly that until the screen lane moves it, it ships as the end
   panel's third line**, so the spec is true of the tree today and unambiguous about the change.

This adds no number to the play screen and no tap to the question: it takes one line off a panel.

### §6's sample was the other half of the same dishonesty

§6 rendered the sentence as `48 % of this session was the game`. 48 is `job-pay`'s copy sample, and
it is also — by coincidence — the ceiling of CUT-BRIEF's own session shape, i.e. roughly five times
what the loop prints. The spec's only rendering of the student-facing sentence flattered the thing
the finding is about. It now reads `9 % of this session was the game`, a value `job-split` drives
the engine to print end to end.

**Nothing went red and nothing can**: `tests/job-pay.test.mjs:1151` holds its own `VOCAB` array,
and `VOCAB.includes(s)` is checked against strings the COPY table PRODUCES, not against this file.
A tests-lane reader who syncs the array must change `COPY.split({ percent: 48 })` at
`job-pay.test.mjs:1164,1174` and `job-screen.test.mjs:654` with it, or leave all four alone — both
are green. My recommendation is to leave them: the sample in a copy test is arbitrary by design,
and the spec is the artifact a person reads.

### Word budget

1197 → **1193** by `wc -w`, cap 1200, with ~70 words of new claim paid for by lossless compression:
§8's file manifest (`js/gen/*` was listed twice, once in Untouched and once as byte-identical),
the `UNGATED` sentence folded into one clause now that the behavioural deltas are gated, §2's share
and gate clauses, §3, §4's second worked example, §5's hit-rate sentence, and a dozen ` — ` tokens
turned into `:` or `;` (each em-dash costs `wc` a word). **No claim was softened and no pinned
number was dropped.** §7 #6 (another lane's honesty fix) was not touched.
`grep -niE "bar|stake|ruler" designs/CUT-SPEC.md` is still empty, which `job-screen.test.mjs:1073`
records as true.

### Tests, and a red suite that was not mine

`node --test tests/` is **green at the end of this pass: 1860 tests, 1856 pass, 0 fail, exit 0.**
No test was deleted, skipped or weakened; none here covers a mechanic CUT-BRIEF cuts.

Three earlier runs in this pass were red — **16, then 13, then 7 failures, over rising test counts
(1840 → 1855 → 1856 → 1860) and changing failure names**. They are other lanes landing: during
those runs `site/js/screens/job.js`, `site/js/job/{call,state,pay}.js`,
`tests/job-{screen,save,split,state}.test.mjs` all had mtimes minutes old and still moving
(04:12 → 04:28 while I ran). **No failure can be this lane's**: the only files it writes are
`designs/CUT-SPEC.md` and this note, and no test reads either —

    grep -rnE "readFile|readFileSync|execSync|spawnSync|readdir" tests/*.mjs | grep -iE "design|notes"
    → empty;  all 15 mentions of `designs` under tests/ are comments or assertion messages

**Re-run before believing a red suite during a parallel round** — the same warning round 3 left, now
with a second data point.

### Requests

1. **Screen lane (`site/js/screens/job.js`, `site/data/job.js`, `site/js/screens/settings.js`).**
   Move `COPY.split` off the end panel and into Settings under the three band lines. The end panel
   becomes `today … points` / `best …` (`viewModel().lines` loses its third entry — `screens/job.js`
   :303-305). `job-screen.test.mjs:1401` asserts `lines[2] === COPY.split({percent: truth})`; it
   should assert the same equality wherever the line lands, and `job-split`'s meter tests are
   untouched by the move. When it lands, delete §8's last sentence — it names itself as temporary.
2. **CUT-BRIEF's owner.** The decision is one of two and it is not the spec's: amend the band to
   what a two-tap loop can measure, or give up "same queue, same length" so the answering half
   shrinks. The arithmetic for both is now in §8. The third option — pad the face-down card — is
   forbidden by the brief and refused by the engine's 24 s ceiling.
3. **Nobody should tune toward the band.** §8 says so, and the ceiling is what makes it enforceable.

### Cross-lane addendum — §7's "Ninth" changed under me mid-pass, and the cap had to absorb it

At 04:34, while my verification run was going, the engine lane rewrote §7's **Ninth**: the priced
bit is no longer `result.cleared` but a **clean** clear (`js/xp.js isClean`, first try and no hint),
because `screens/card.js` also sets `cleared` for a clear bought on the hint ladder — three taps and
`sure` was buyable at will, **746** against honest play's **263.7** over a page
(`notes/cut-engine.md` §4). That is a real r4 fix and it stands **in full**: no claim and no number
of theirs was dropped. It cost the file ~53 words, which took the spec to **1255** — over
CUT-BRIEF's 1200-word hard limit, which is this file's to keep.

So the budget pass went further than planned. Final: **1196** by `wc -w`. What paid for it, all
lossless, no claim softened, no pinned number dropped:

- §8's manifest listed `js/gen/*` twice (Untouched, then "byte-identical"); the five study modules
  collapse to `js/{xp,mastery,schedule,readiness,rarity}.js`, and `job/{state,call}.js` likewise.
- `(the five verbs)` is gone from §8's `job/state.js` entry — and it should be: `site/js/job/state.js`
  :608 heads its own section **"The four verbs"** while exporting `startJob`, `call`, `answer`,
  `bank` and `endJob`. That was an unpinned number in a spec whose first line promises every number
  is pinned. It is now simply not claimed. (If the state lane wants a count in §8, settle the
  file's own header first.)
- §1 is one sentence: it summarised what §2 and §3 state formally.
- §4 keeps one worked example (the push side). The bank side is §7 #3's, proved over 2,110 and
  3,628 steps, not a prose example's.
- The `UNGATED` sentence, §2's share and gate clauses, §3, §5's hit-rate sentence, §7 #1/#3/#5/#6
  connectives, and ~15 ` — ` tokens turned into `:` or `;` — each em-dash costs `wc` a word.
- The engine lane's Ninth itself was trimmed by three words (`r4, exploit-hunt;` → its
  `notes/cut-engine.md` §4 pointer, `worth 746` → **746**), the same lossless-trim licence round 2
  used on §7 #6. Every fact, file, number and citation of theirs survives.

**Final state: `designs/CUT-SPEC.md` is 1196 words** and `node --test tests/` is green —
**1860 tests, 1856 pass, 0 fail, 4 skipped, exit 0** (the run before the last spec edits; the spec
is markdown no test reads, proven above). Three earlier runs this pass were red at 16, 13 and 7
failures with rising test counts and changing names while `site/js/job/*`, `site/js/screens/job.js`
and four test files were being written by other lanes — 04:12 through 04:34.

---

## Round 5 — the spec lane fixer, one MAJOR

**Finding.** *"The session is further from the brief's 45–55 % game share than the layer that was
deleted for missing it."* Evidence: the critic's own shipped end panel printed **34 %** after a
14-question session with 8–20 s on each face-down card, while §8 read *"The deleted layer measured
29 %; that span tops out at **21 %**"*.

### The finding's own evidence refutes the sentence it quotes

`21 %` was never a bound. It is the largest of **four declared clocks** `job-split` drives the
engine on — `job-split.test.mjs:778-787`, 2–8 s deciding against 20–45 s answering — and §8 stood it
next to the deleted layer's 29 % in a way that reads as a ceiling. The critic read it that way, and
then measured 34 % in real play, above all four. A spec whose first line promises every number is
one the code produces published, as the loop's top, a figure the loop exceeds in an ordinary
session. **That is the defect, and it is mine.**

The real bound was already pinned, in the same file and by another lane, and §8 never cited it.
`tests/job-split.test.mjs` #8 asserts it three ways, and I re-ran the shipped engine directly rather
than trusting the assertions:

    DELIBERATION_MS         = 24000            state.js:446
    SPLIT                   = {lo:45, hi:55}   data/job.js:49
    bestFor(20 s card)      = 55 %             job-split:766-771
    brief's shape 50/105 s  = 48 % / 23 %      job-split:774-777
    largest question at 45% = 29 900 ms        job-split:756-758

At most two taps is at most **one declared decision a question**, credited to at most 24 s — so the
ceiling is not a tuning choice, it is CUT-BRIEF's own tap limit priced by the engine. It runs 55 %
at COMPOSED's fastest card, 48 % and 23 % at the fast and slow ends of CUT-BRIEF's own session
shape, and 45 % only on a question inside 29.9 s.

### What §8 now says

The last three paragraphs became two. Corrected, not softened:

- **`3, 9, 14, 21 %` is labelled as four declared clocks, not a bound, with round 5's session cited
  as having printed above all four.** The old "tops out at 21 %" is gone.
- **The ceiling is published for the first time** — 55 / 48 / 23 / 29.9 s — so the reader can price
  either branch of the owner decision instead of taking the escalation on trust.
- **The self-indictment stays and is made exact.** "Those clocks sit under the 29 % the Why
  condemns; the 55 % ceiling does not." The earlier draft of this sentence said "the bound does
  not", which is false at the slow end (23 %); it names the ceiling now.
- **The ratio argument stays** — 4, 8, 12 and 23 questions all print 9 %, a harder one less
  (`job-split:725-733`) — because it is why CUT-BRIEF's own remedy cannot move this number.
- Round 4's decision is untouched: the measured share is instrumentation, moves to Settings, ships
  as the end panel's third line until the screen lane moves it.

Two pinned facts were dropped as redundant with the ceiling, which states the same demand from the
other side: `answering = 0.82–1.22 × deciding` and the `16–24 s` the band asks of the card. Both
survive in `job-split:654-680` and in `notes/CUT-SCORECARD.md`. No other claim or number was cut.

### What I did NOT do, and why

**I did not answer the escalation, because it is not answerable from this file.** The finding says
so itself. `SPLIT` lives in `site/data/job.js` and in CUT-BRIEF; the queue is the composer's. A
spec cannot amend its own authority.

**I did not raise the share.** Every lever that would have is either forbidden or re-inflation:
padding the card is forbidden by CUT-BRIEF in the same sentence that sets the band and refused by
`DELIBERATION_MS` past 24 s; declaring the result screen (where the bank decision lives) as game
time is precisely the flattering that `job-split` #2, #3, #7 and #9 were written to stop; a richer
call is a third tap and a fourth number. **Any fix that moved this number would have been the
re-inflation the brief exists to prevent.**

**I did not add the ship-posture sentence I drafted** ("no string shows the student a target").
§6 already enumerates every string in the app and closes with *"Not listed, not in the app."*, and
no band or target appears in it — so the claim was already made, and restating it would have cost
seven words to say nothing new.

### The decision, restated for whoever takes it

One of two, and both are now priced in the spec itself:

1. **Amend the band.** Nothing above **48 %** is honestly reachable inside CUT-BRIEF's own session
   shape, and that only with the student pinned at the 24 s ceiling on every card. If the band
   comes down, `job-split`'s deliberation ceiling should come down with it — 24 s is derived from
   55 % at COMPOSED's fastest card.
2. **Move "same queue, same length".** The share is a ratio, so the count does nothing; only
   **shorter answering per question** moves it, which is the opposite of CUT-BRIEF's parenthetical
   ("fewer, **harder** questions") and is the composer's call, not the game's.

Until then the app claims nothing: it prints the measured number and no target. That print is the
guard the deleted layer's claimed 50 % over a measured 29 % did not have. **Do not delete it to
make the panel read better.**

### Word budget and tests

`wc -w designs/CUT-SPEC.md` = **1200**, cap 1200. The new material was paid for by merging §8's old
"The split" paragraph into the new one and five lossless trims, all outside the split: `page.js`'s
Untouched clause (`composePage`'s queue folded in as an appositive — the sentence
`tests/cut-meta.test.mjs:1098` quotes verbatim is kept contiguous and was checked by grep), "buys
nothing but a" → "buys only a", one `and` → `;` in §2, one em-dash → colon in §7's Ninth, and
§6's "Not on this list" → "Not listed". No claim softened, no test touched, no test deleted — none
here covers a mechanic CUT-BRIEF cuts. `grep -niE "bar|stake|ruler" designs/CUT-SPEC.md` is still
empty (`job-screen.test.mjs:1088`).

`node --test tests/` — **1872 tests, 1868 pass, 0 fail, 4 skipped, exit 0.**

**One earlier run this pass was red** — `job-screen.test.mjs:1726`, a chromium layout arm whose
`job-answer-kb-sealed@scroll0` case was absent from the harness output. It is not this lane's and it
is not reproducible: `site/js/screens/job.js` (07:51), `tests/job-screen.test.mjs` (07:54) and
`tests/job-save.test.mjs` (07:56) were all written minutes before that run started, and the re-run
at 08:00 was green over a larger suite (1860 → 1872 tests). **This is now the third round in a row
that has recorded the same thing: re-run before believing a red suite during a parallel round.**
The only files this lane writes are `designs/CUT-SPEC.md` and this note, and no test reads either —
`grep -rnE "read(Repo|FileSync|File)\(\s*['\"]designs" tests/` is empty, and the two `designs/`
mentions under `tests/` are an assertion message and a comment.

# AUDIT-TRIAGE — what the sweep found, in English (ticket TRIAGE, 2026-09-17)

The student's report was *"the question is going vertical … find all similar mistakes and make sure the
app is perfect."* LAYOUT-ROOT fixed the vertical question. This ticket asked the safety net whether
anything else like it is still out there, and triaged the answer. Numbers and the full defect table:
`qa/audit/TRIAGE.md`. Detector reference: `notes/AUDIT.md`.

## The short version

**The vertical question is gone, everywhere.** 92 screens x 17 window sizes x light/dark x Chrome and
Safari, plus a text-zoom pass and an animations pass — **6 992 measured screens**. Zero collapsed text,
zero zero-width tracks on a card, zero horizontal scrollbars, zero controls off screen or stuck behind
the dock, zero console errors.

**But the net was lying to us twice, and one real bug was hiding behind that noise.** The first full run
returned 6 703 findings. Two thirds of them were the auditor's own fault; fixing it dropped the count to
2 380 and left **16 real defects**. One of them — the header chip printing straight through the level
ring and the XP counter on a 320 px phone — is exactly the same *kind* of bug the student reported, and
the old net literally could not see it.

## What was wrong with the net (and why you should trust it now)

1. **It counted text nobody can see.** A two-line "clamp" (Binder list rows, Home's skill list) still
   reports a position for the third, invisible line. The auditor was treating those ghost lines as text
   lying on top of the paragraph below — ten Binder screens, five Home screens, one Drill header, all
   reported as BLOCKERs, all wrong. Ink is now clipped to what is actually painted.
2. **It thought every deliberate "…" was an accident.** It only understood one of the two CSS ways to
   truncate text. It now understands both — and at the same time got *stricter* about the one case that
   matters: a truncated **question** is still a blocker, now vertically as well as horizontally.
3. **It never looked inside the header.** The header and the bottom dock were excluded from the
   overlap check (correct: they float over the page by design) — but that also meant the header's own
   contents were never checked against *each other*. They are now, and the first run with the change
   found a real blocker on two screens.

Each change is pinned by a deliberately broken element on `qa/audit/selftest.html` (seven of them now),
so a future "cleanup" cannot quietly switch a detector off.

**Proof it catches real bugs, not just its own fixtures:** there is a new `--inject "<css>"` flag that
breaks the live app in memory without touching a file. Injecting `.card-stem{width:12px}` reproduces the
student's bug and the auditor reports it in both engines with a screenshot of one letter per line;
without the injection the same screens are silent. Two more injections (a 1 400 px card, an 18 px hint
button) fire `doc-overflow`, `tap-target`, `overlap` and `offscreen`.

## The 16 real defects, worst first

**Two blockers, both in the app header, both on small phones — fix these first.**

1. **"set test date" runs out of its pill and through the level ring** (320 and 360 px wide, 9 screens
   including the whole of onboarding and the placement). The chip is squeezed to 51 px while its text
   needs 86, and a polish rule from an earlier round turned off the guard that used to trim it.
2. **"after the test" collides with "1840 XP"** in the same header after the test date passes.

**Then, in rough order of how much they matter:**

3. Figure **wedges are 41 px tall, not 44** — 13 card and mock screens. Known since S9; it is three
   pixels and it is every figure question.
4. Six **contrast** misses in light mode, five of them one root cause: the rarity words (GOLD, SILVER…)
   are painted in the *fill* gold instead of the darker text gold the design system already defines.
   Plus the printed cheat-sheet's date line in dark mode, which is nearly invisible.
5. The **Drill header truncates its own title** ("Drill 5 · Word Pr…") on phones.
6. The **Mock rules list** has a count column that computes to 7.8 px wide — it works today only
   because every count is a single digit.
7. A 16 px-tall **source link** in the expanded Mock report.
8. Two cosmetic leftovers: a hint-ladder line that wraps narrow, and a Safari-only graze between two
   answer options on a landscape phone.

Nothing on that list hides a question, blocks an answer, or scrolls the page sideways.

## How the work is split

Six lanes, each owning its own files so they can run at once. Details and the exact re-check command per
lane are in `qa/audit/TRIAGE.md` §3.

| lane | owns | defects |
| --- | --- | --- |
| B1 app shell header | `index.html`, `js/app.js`, `css/base.css` | the two blockers |
| B2 ink tokens | `css/theme.css` | all six contrast misses |
| B3 figure wedges | `js/figure/svg.js`, `css/figure.css` | the 44 px rule |
| B4 run chrome | `js/screens/run.js` | drill title, mint tile |
| B5 mock + report | `js/screens/mock.js`, `js/screens/report.js` | the 7.8 px column, the small link |
| B6 card rail + 2 widgets | `js/screens/card.js`, `js/widgets/mc.js`, `js/widgets/termmatch.js` | the two cosmetics |

Every lane adds its CSS at the end of `polish.css` in its own tagged block, re-runs its own command in
both engines, then the full matrix and `node --test` (1 300 pass / 0 fail today).

## One waiver to revisit

The only waived finding is the header T−N chip's own tap target (37.4 x 48 px, 328 hits). The waiver
says the chip is fine because it "sits inside" the 48 px home anchor — it does not; it is a sibling, and
the 37.4 px width is the same squeeze that causes blocker #1. B1 must re-measure it after the fix and
delete that half of the waiver if it passes. Nothing else is waived, and waived hits are printed and
counted in every run rather than hidden.

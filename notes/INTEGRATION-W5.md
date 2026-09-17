# INTEGRATION-W5 — Wave 5 (T17 test consolidation · CI gate · unit hand-off)

One lane in this wave (T17), no failed agents, no lane reporting red tests. The suite was green on arrival
(**1138 pass**) and T17's own work needed no repair — so this sitting was the other half of the integrator's
job: the **four decisions T17 escalated** (`notes/OPEN-ISSUES.md` §E, row "integrator"), T17's one request
into a file it did not own, and a screenshot pass over what changed.

**Suite after integration: `node --test tests/` → 1156 tests, 1156 pass, 0 fail** (≈ 46 s; the 18 new ones
are `tests/integration-w5.test.mjs` + one added to `plan.test.mjs`). `node qa/gen-precache.mjs --check` → up
to date (115 files). Nothing was deleted or skipped; three assertions in `plan.test.mjs` were re-pointed at a
different module because the behaviour they pinned is the defect §A2 describes — see §1.1.

---

## 1. Decisions taken, and the code that now matches them

### 1.1 §A2 BLOCKER — one clean placement item no longer erases 55 cards — `screens/onboard.js`

`cardIsPlaced()` is `save.cards[id].placed || save.jumps[module]`, and the placement set `jumps[M1] = true`
on a single clean **notation** item. M1 `Lexicon` holds **55 originals** (23 vocab · 9 notation · 14
definitions · 5 facts · 4 classify) behind that one cluster. One right answer to "write the symbol for a ray"
therefore removed the entire vocabulary/definitions/facts sheet from the new-card pool — permanently, because
those cards were never attempted, so `lastAt == null` and they never returned as reviews either. **M9 `ASN
Arena` (54 originals: `asn-01..36` + `qz-01..18`) had exactly the same shape behind the single ASN cluster.**
109 of the bank's 197 cards could be lost to two right answers in the first ten minutes.

The rule now scales with what the placement can actually sample:

```js
export const PLACE_MAX_ORIGINALS = 40;   // more originals than this …
export const PLACE_LARGE_CLEAN   = 2;    // … and the placement needs this many clean clusters
export const originalsCount = mod => moduleById[mod]?.originals?.length ?? 0;
export function placeNeedsClean(mod);    // 1, or PLACE_LARGE_CLEAN for a big module
export function placeWithheld(mod);      // true when the placement has too few clusters to ever place it
applyPlacement(…) → { placedModules, withheld, skills, clean, retry, wrong }   // `withheld` is new
```

S7's sentence is unchanged for every module the placement samples properly (M4 still needs both of its items;
M10, M11, M12, M7 still place off one clean item). M1 and M9 have one cluster each, so the placement never
places them — and **JUMP HERE (`#/run/jump/:module`, 10 items, ≥ 8) is untouched**: that is a real sample of a
55-card module and it still places it in one sitting. Nothing is lost from the student's record either: a
clean item still writes `m = 80`, `n = 5` and `skills[id].placedAt` exactly as before.

The placement summary had to stop lying too: a clean row on a withheld module used to read "placed". It now
reads **"first try"**, and the card carries one more line — *"Lexicon · ASN Arena stayed in the plan on
purpose: they are too big to skip off one question (55 / 54 cards). **JUMP HERE** in the Binder is 10
questions — clear 8 and it is skipped for real."* Read at 375 px (§4).

**Tests re-pointed, not deleted.** Three cases in `tests/plan.test.mjs` used `notation`/M1 as their generic
"a clean item places a module" example; they now use `fac2`/M10, which places exactly as they assert. The M1
behaviour they used to encode is the defect, and it is now pinned the other way in five cases (one in
`plan.test.mjs`, four in `integration-w5.test.mjs`), including "the M1 pool is the same size afterwards" and
"JUMP HERE still places it".

### 1.2 §A3 BLOCKER — the lowered plan strip no longer promises something the composer ignores

`plan.lowering()` returned `microFlashOnly: true` on a lowered day and printed *"Vocabulary and notation drop
to flash only: you read them, you do not write them out."* Nothing read the flag, and the app has no
read-only flash mode at all (even the Night-Before "Notation flash" block is ordinary cards with hints on).
The other two lines of the lowering were true; this one was not, against S9 #10 "Honest".

Rather than delete the clause, the intent behind it is now real. `composePage` reads the flag:

```js
LIMITS.microEveryLowered = 2;    // vs LIMITS.microEvery = 4
const microEvery = opts.microFlashOnly === true ? LIMITS.microEveryLowered : LIMITS.microEvery;
```

On a lowered day every **second** new slot is filled from the tier-1 pool instead of every fourth — on the
D = 3 fixture that is 6 micro cards of 12 new, against 3 of 12 before, and it drags the day's minutes down,
which is the direction §B1 wants. The strip line now says exactly that: *"The ten-second cards — vocabulary,
notation, definitions — take every other new card. The long write-outs wait."* Both call sites already spread
`...planOpts` into `startPage`, so no wiring was needed; `q` is still stripped (the W4 §1.2 rule) and pinned.

### 1.3 T17 → T15 — the unit hand-off is visible — `screens/settings.js`, `css/screens.css`

T17 built the S8 #19 hand-off (`archiveUnit` / `archivedUnits` / `flags.archivedUnit`) and asked T15 to
surface it. Settings now has a **Past units** card between "How Readiness is computed" and "Your data":

* `flags.archivedUnit` → *"Unit 1A is filed away — this build now teaches Unit 1B. Nothing was deleted…"*, on
  the one load that performed the hand-off.
* `archivedUnits(save)` → one row per archived unit: `Unit 1A · 9/17/2026 · 2 cards · 1 run · 6420 XP` from
  the entry's own `stats`.
* **The whole card returns `null` when there is no archive and no flag** — which is every save this build
  will ever see, since `UNIT_ID === 'u1a'` and a unit never archives itself. It costs the student nothing
  today and is already correct on the day the data is swapped.

CSS is a new `/* === W5 === */` block at the end of `screens.css` (`.set-units`, `.set-unit`), using the
existing `--line` / `--surface2` / `--radius-sm` tokens, so it follows the theme in both modes (§4).

---

## 2. The other two decisions (no code)

### 2.1 §B7 — the 500 K save bound is **accepted as documented**
T01 kept the spec's caps (history 20, errors 300, runs 40, Mock work 1 KB × 3) and `state.test.mjs` asserts
the packed save stays under 500 000 chars — ≈ 1 MB of a 5 MB UTF-16 quota. Reaching S6's stated "≈ 210 KB"
would need history ≈ 6 and runs ≈ 25, i.e. throwing away the student's actual review history to reclaim
about 1 % of a quota under no pressure. Accepted as is. The number to revisit is not this one: it is the
**third** archived unit (§5 #4 in `notes/T17.md`), and that wants an export-then-evict action in Settings.

### 2.2 The `apple-touch-icon` question — **declined; BUILD-POLICY §1 stands**
iOS ignores SVG touch icons, so a home-screen install falls back to a screenshot. Shipping a PNG would mean
relaxing the no-raster rule, editing `coverage.test.mjs`, and disarming the `artifact-policy` CI job on the
exact folder that gets uploaded. That rule is the only one in this repo that cannot be undone after the fact
once Pages has served the artifact, and the entire cost of keeping it is one icon on one platform. No
`<link rel="apple-touch-icon">` is added (it would 404 anyway).

### 2.3 Housekeeping
`notes/sweep-w1.mjs` deleted (superseded by `coverage.test.mjs`, which cites it in a comment — T06f's request
to T17). `notes/OPEN-ISSUES.md` §A2, §A3, §B7, the icon bullet, the sweep bullet and the §E "integrator" row
are annotated in place with what was decided, so the next reader does not re-open a settled question.

---

## 3. Screens loaded and read (Chromium, 375 × 812, `qa/shot.mjs`)

| route | state | result |
|---|---|---|
| `#/today` | fresh | 0 console errors, no horizontal overflow. Ring 0, Warm-up primary, no plan strip (no test date). |
| `#/today` | **tight week** (fresh save, test in 3 days → q = 32, lowering active) | 0 errors. The 4-pill strip, the warning headline *"32 new a day is more than a day holds — the target is 12"*, and the three lowering lines — **all three now true of the page the button builds** (§1.2). |
| `#/run/page` | tight week | 0 errors, no overflow. `12 new + 2 variants · 0 of 14 done`, first item `not-03` with its figure, Scratch, hint ladder, Submit in the thumb zone. |
| `#/onboard?step=4` | placement fixture: 4 clean (M1, M9, M10, M12), 2 retry, 2 wrong | 0 errors, no overflow. **This is the §A1 shot**: the two big modules read "first try", not "placed"; `Placed: Factor Forge · Systems`; the withheld line names both modules, their sizes and JUMP HERE. |
| `#/settings` | hand-off fixture (an archived `u1a`) | 0 errors, no overflow, light **and** dark. The Past units card renders between Readiness and Your data; the archive is inside the Export JSON, as T17 intended. |

Fixtures were built in the scratchpad from `store.js` + `onboard.applyPlacement` (not committed;
`qa/fixtures/midweek.json` is still the only committed one).

**No audio was produced** — 01:54 local, the user's quiet-hours rule. Sound remains wired-and-never-heard
since Wave 3; it is on T18's daytime list (`notes/OPEN-ISSUES.md` §B6).

---

## 4. New tests — `tests/integration-w5.test.mjs` (17) + 1 in `plan.test.mjs`

* **§A2**: the size rule catches exactly M1 and M9 and leaves every other placement cluster at one clean item ·
  the M1 pool is byte-for-byte the same size after a clean notation item · a small module still places off one ·
  JUMP HERE still places M1 at 8/10 and still writes nothing at 7/10 · the summary's row label follows the save.
* **§A3**: the lowering hands over all three levers · `microFlashOnly` really doubles the micro share and lands
  on exactly `n / microEveryLowered` · the tier-4 cap still holds in the same queue · no line of the copy says
  "flash only" any more, and `page.js` really reads the flag.
* **T17 → T15**: Settings imports `archivedUnits` and `flags.archivedUnit`, mounts the card, and ships CSS ·
  the card is hidden when there is nothing to show · an archived unit survives `pack`/`unpack` with its stats
  and its reused skill record.
* **Standing**: the content bank is still 197 cards and M1 + M9 still hold 109 of them (an engine wave must not
  move content).

---

## 5. Still open

1. **T18 Visual QA has never run — this is now the only unstarted ticket and the last acceptance gate**
   (`notes/OPEN-ISSUES.md` §A1). Eight notes have already written its regression set. Two measured failures
   are waiting for it: the header `T−N` chip at 41 × 24 px against the 44 px floor, and BLITZ's answer row
   sitting mid-screen on an 812 px phone. Sound has still never been heard.
2. **§B1: a heavy-review day still composes ~34 min** against S1's 10–25. §1.2 helps a *lowered* day only.
3. **§B3: `qz-04`'s ⚑ note still nudges toward the wrong answer.** Left for the content owner — Global rule 5
   means the flag text is quoted from the teacher, and rewording it is a content edit to `SOURCE.md` plus
   `data/cards/asn.js`, not an integration one.
4. **§B2: the 51 Quizlet stems have still never been diffed** against the set (403 to a fetch; needs a browser).
5. Carried unchanged: `mastery.js` vs `schedule.js` are still two implementations of one ladder (pinned to each
   other); the Boss-B4 blank-setup dead end (§B4); JUMP HERE still offered on a fully cleared module; the lazy
   widget proxy's partial contract; `cleanMsg()` in 8 widget files; `mc.js`'s `hash53` duplicating `rng.js`
   (needs its own commit with the fixtures re-baselined).
6. **`archivedUnits()` now has UI, but no build has ever exercised the hand-off end to end in the browser** —
   only in tests and against an injected fixture. That is by construction (`UNIT_ID === 'u1a'`); whoever swaps
   the unit should read `docs/next-unit.md` first and re-shoot `#/settings` on the first real hand-off.

## 6. Integrator checklist for whoever is next
1. `node --test tests/` green **before** touching anything (1156 today).
2. `node qa/gen-precache.mjs` after any file lands under `site/{js,css,data,assets}`.
3. **Read the screenshots.** §1.1's summary copy and §1.2's strip lines were both verified by reading a PNG,
   not by a test — a test can only pin the string the copy *already* says.
4. Never re-point a test to make a change pass without saying so in the note. Three assertions moved in this
   wave and §1.1 says which, why, and what replaced them.
5. When a note escalates a "product decision" to the integrator, decide it in writing in the notes — an
   undecided blocker survives every wave otherwise.

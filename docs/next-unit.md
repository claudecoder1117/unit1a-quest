# Swapping The Packet to the next unit

*T19 / COMPOSED S8 #19. This file lives in the repo and is **not** served — `docs/` is outside `site/`, which
is the entire Pages artifact.*

The app is a shell (`site/js`, `site/css`, `index.html`) plus **one unit's worth of data** (`site/data`).
Nothing in the shell knows the word "angle". Swapping units means rewriting `site/data`, bumping one constant,
and letting the save layer file the finished unit away. The student keeps their XP, their streak, their
trophies and their settings; Unit 1A's card records, Variants, schedule, runs and errors move into
`save.archive['u1a']`, where they stay readable and exportable forever.

---

## 0. The short version

```
1.  git switch -c unit-1b
2.  content/SOURCE.md  ← transcribe the new packet (this file is the content authority)
3.  site/data/*        ← rewrite, file by file, in the order of §2
4.  site/js/store.js   ← UNIT_ID = 'u1b'          (ONE line; do NOT touch LEGACY_UNIT_ID)
5.  site/version.js    ← APP_VERSION = 'YYYY-MM-DDa'
6.  node qa/gen-precache.mjs        (rewrites site/sw.js's PRECACHE list)
7.  node --test tests/              (must be 0 failures BEFORE you push — it is the deploy gate)
8.  push to main → .github/workflows/pages.yml tests, policy-checks and deploys site/
```

Step 4 is the one that makes the hand-off happen. Everything else is content.

---

## 1. What is unit-specific and what is not

| stays as-is | is rewritten per unit |
|---|---|
| `site/js/**` — graders, widgets, screens, scheduler, XP, rarity, store | `site/data/**` — every file |
| `site/css/**`, `index.html`, `manifest.webmanifest` | `content/SOURCE.md`, `content/transcript.md` |
| `site/js/gen/*` **engines** (they take parameters, not content) | which generators are *registered* (`data/templates.js`) |
| `tests/*` for the shell (graders, store, rng, sw, no-random) | `tests/coverage.test.mjs`, `teacher-flag.test.mjs`, `rarity.test.mjs`, `plan.test.mjs`, `mock.test.mjs` — they assert *this* unit's numbers |

The one exception in `site/js`: **`store.js` holds `UNIT_ID`** and imports `SKILL_IDS` from `data/skills.js`.
That is the entire coupling between the save layer and the unit.

---

## 2. The data files, in dependency order

Rewrite them in this order — each one is read by the ones below it. After each file, `node --test tests/` tells
you exactly what still disagrees; the suite is designed to be the checklist.

### 2.1 `site/data/skills.js` — the skill graph
`skills[]` of `{ id, name, w, prereqs[] }`, **weights summing to 100** (`TOTAL_WEIGHT` is asserted). `prereqs`
are recommendations that order the plan; they never lock anything (Global rule 1).

> **Reuse ids on purpose.** Any id that also exists in Unit 1A keeps the student's mastery record through the
> swap (§4). `VOC`, `NOTE`, `CLASS`, `FAC1`, `FAC2`, `QUAD-SOLVE` are the obvious candidates in a Geometry
> sequence — if Unit 1B still teaches vocabulary, call the skill `VOC` and the student walks in already
> Mastered. Renaming it to `VOC2` throws that away (archived, not lost — but not live either).

### 2.2 `site/data/sheets.js` — the Binder tabs
One tab per physical page of the packet: `{ id, name, short, page, ids[] }`, `ids` in the teacher's order.
`numbering(id)` turns a card id into the margin number the student sees ("10)"). Every card's `sheet` field
must equal a tab id.

### 2.3 `site/data/source-manifest.js` — the id checklist
One hand-written row per original: `r(id, skill, sheet, module, description, mockSection)`. It is deliberately
**not** generated from the card files — it is the independent list that `coverage.test.mjs` checks the cards
*against*, which is what makes "nothing from the packet was forgotten" a machine fact rather than a claim.
Write this from `content/SOURCE.md` before you write a single card.

### 2.4 `site/data/cards/*.js` + `site/data/cards.js`
One file per sheet so parallel tickets never collide; `cards.js` only concatenates them and builds `byId`.
Card schema is COMPOSED S6. Every card needs `id, sheet, skills[], tier, stem, parts[], hints[3], solution[],
verified`. **Solutions are ours, typed step by step** — verified against the teacher's numbers in
`content/SOURCE.md`, never scanned (BUILD-POLICY §1).

### 2.5 `site/data/figures.js`
Hand-modelled SVG figure descriptions (`site/js/figure/model.js` resolves them, `svg.js` draws and lints
them). Redrawn by us from the teacher's drawings. **No PNG, ever** — the CI `artifact-policy` job fails the
build if a raster file appears under `site/`.

### 2.6 `site/data/modules.js`
The modules (each with `originals[]`, `templates[]`, a `boss`, `blitz` seconds, `jump`), the family tiles, and
the bosses. `allOriginalIds()` must equal the manifest's non-bonus ids.

### 2.7 `site/data/templates.js` + `site/js/gen/*`
The generator registry. Keep the engines that still apply (a linear word-problem or factoring generator does
not care which unit it is in); delete the registrations whose originals are gone, and add new ones. Each
template is `{ id, skill, tier, par, family?, modes?, frames?, gen(seed, params) }` and must satisfy
`js/gen/contract.js validateItem`.

### 2.8 `site/data/blueprint.js`
The Mock. `MOCK_SLOTS` / `BASELINE_SLOTS` name every slot's candidate ids and fallback templates.
`coverage.test.mjs` enforces **≥ 3 candidate sources per slot** and that every non-bonus id is eligible for at
least one section — write the blueprint against the new manifest's `mock` letters.

### 2.9 The rest
`asn.js` (verdict reason bank), `vocab.js` (terms, confusables, term-match sets), `misconceptions.js` (the tag
catalogue — every `tag:` literal anywhere under `site/` must be in it, enforced by
`tests/misconceptions.test.mjs`), `trophies.js` (per-sheet and per-original trophies + `COUNTERS`), `sheet.js`
(the Night-Before cheat sheet's fixed half).

### 2.10 There is no `site/content/`
COMPOSED mentions one; BUILD-POLICY §1 deleted it. Nothing the school or Kuta owns is ever committed or
served: no PDFs, no HTML exports, no scans, no handwritten keys, no "Teacher's key" toggle, no "Show
original". `source/`, `content/*.png` and `designs/` are git-ignored, and CI fails the deploy if any of them
is tracked or if a raster/PDF file appears under `site/`.

---

## 3. The one line in `site/js/store.js`

```js
export const UNIT_ID = 'u1a';        // ← 'u1b'. Bump in the SAME commit that swaps site/data.

export const LEGACY_UNIT_ID = 'u1a'; // ← NEVER change this. Frozen forever.
```

`LEGACY_UNIT_ID` is what a save written **before** the `unitId` field existed is assumed to be. Those saves are
Unit-1A saves by definition. If you ever retarget it at `UNIT_ID`, a student's Unit-1A save opened under the
Unit-1B build would look like it already belonged to 1B and would be *merged* into it instead of archived —
silent, unrecoverable data corruption. It has no other job.

Bumping `UNIT_ID` and `site/data/skills.js` in the same commit is enough. Nothing else has to be wired: the
default store instance is created with `unit = { id: UNIT_ID, skills: SKILL_IDS }`, so the hand-off happens
inside `load()` the first time the student opens the new build, and is written to disk immediately.

---

## 4. What the hand-off does to a save

`migrate(raw, now, { unit })` runs the version chain, fills defaults, and then — only when
`save.unitId !== unit.id` — calls `archiveUnit(save, unit, now)`:

**Archived** into `save.archive['u1a']` and reset in the live save (`ARCHIVED_KEYS`):

| key | why it cannot come along |
|---|---|
| `cards` | card ids belong to the old packet |
| `variants` | family tiles of the old templates |
| `frozen` | frozen Variant seeds of old templates |
| `runs` | Pages, Bosses and Mocks of the old unit |
| `errors` | the Patterns panel's evidence, all old-unit items |
| `skills` | *(see below — this one is partly carried over)* |
| `forecastLog` | Readiness against the old blueprint; a sparkline mixing units lies |
| `placement` | "placed" is a claim about the old unit's modules |
| `jumps` | JUMP-HERE marks on old module ids |
| `postTest` | the old unit's test score |
| `inProgress` | a half-finished run whose item ids no longer resolve |

**Kept**, untouched (`KEPT_KEYS`): `xp`, `streak`, `trophies`, `settings`, plus `daily`, `counters`,
`profileId`, `createdAt`, `seedCounter`, `v` and `archive` itself. The student's level, rank, streak and every
trophy they earned survive the unit change — which is the point.

**`skills` is the interesting one.** The whole map is archived, then re-seeded with exactly the records whose
ids the new unit's `skills.js` **reuses**:

```js
// unit 1A save                          unit 1B skills.js exports VOC, NOTE, CLASS, FAC1, FAC2, TRI-CONG, PROOF
skills: { VOC: {m:92.5,…}, PAIRS: {m:74,…}, 'CS-RATIO': {m:55,…} }
// after the hand-off
skills: { VOC: {m:92.5,…} }             // PAIRS and CS-RATIO are archived, not live
archive['u1a'].skills                    // …and still readable here, forever
```

Three details worth knowing:

* **Nothing is ever overwritten.** Archiving a unit whose id is already in `archive` files the second one
  under `u1a~2`, `u1a~3`, … (this happens when an *old* Unit-1A save is imported into a Unit-1B build).
* **It is idempotent.** `archiveUnit` on a save already in the target unit is a no-op, so it is safe on every
  load. Under the current build, a Unit-1A save never grows an archive at all.
* **`applyCaps` does not touch the archive.** It is history, not working state. The live caps (S6) still apply
  to the new unit's data. A saturated single unit measures ≈ 480 000 chars of JSON; two units is ≈ 1 MB of the
  5 MB localStorage quota, so archiving a second and third unit is comfortable. If a fourth ever crowds it,
  Settings should offer "export and remove Unit 1A" — export first, always, since the archive is the only copy.

### API (`site/js/store.js`)

```js
UNIT_ID          : string                  // the unit this build teaches
LEGACY_UNIT_ID   : string                  // 'u1a' — frozen
ARCHIVED_KEYS    : readonly string[]       // moved into archive[oldUnitId] and reset
KEPT_KEYS        : readonly string[]       // carried across untouched
migrate(raw, now?, { unit }?)  → save      // version chain + defaults + (optional) unit hand-off
archiveUnit(save, { id, skills? }, now?) → save   // the hand-off itself; idempotent
archivedUnits(save) → [{ key, unitId, archivedAt, v, stats, …data }]   // newest first
store.migrateUnit(next?) → save            // hand over NOW, notify subscribers, write to disk
store.flags.archivedUnit                   // the unit id that was filed away on this load, or null
```

`unit.skills` may be an array or a `Set` of ids; omit it and every mastery record is carried over (the caller
did not say what the new unit teaches, so dropping mastery would be a guess). Pass `unit: null` to
`createStore` to disable automatic hand-off entirely — useful in tests and for a Settings screen that wants to
own the moment.

### What Settings should show

`store.flags.archivedUnit` is set on the load that performed the hand-off. A one-line note —
*"Unit 1A is finished and filed away — your XP, streak and trophies carried over"* — plus a "Past units" list
from `archivedUnits(save)` (each entry's `stats` has `cards / variants / frozen / skills / runs / errors /
xpAtArchive`) is all it needs. The existing Export button already includes the archive: it is part of the save.

**"Set next test date"** (Settings) is the entry point the spec points at this document from: when the student
sets a date for a test in a *new* unit, that is the moment the next unit's data should already be deployed.
The date itself lives in `settings.testDate` and is a kept key — it survives the swap, so clear or re-set it
as part of the hand-off commit's release note.

---

## 5. Tests you must update with the data

`node --test tests/` is the deploy gate (`.github/workflows/pages.yml`), so these have to move with the
content. None of them should be *deleted* — they are the acceptance checks.

| file | what to change |
|---|---|
| `coverage.test.mjs` | the per-prefix counts and the S2 letter strings; the manifest↔cards bijection is generic |
| `teacher-flag.test.mjs` | re-derives every numeric answer from the new stems — rewrite per unit |
| `rarity.test.mjs` | the Foil-reachability class lists (which cards are own-template / family / recall) |
| `plan.test.mjs`, `mock.test.mjs`, `boss.test.mjs`, `page.test.mjs` | the day-1 numbers and section pools |
| `gen.test.mjs` | one `harness(id, {seeds, invariant})` block per registered template |
| `state.test.mjs` | **add a `unit-1c` stub** to the `unit hand-off` suite when you bump again; the existing suite already proves 1A → 1B |
| `misconceptions.test.mjs`, `no-random.test.mjs`, `sw.test.mjs`, `state.test.mjs` | shell tests — should pass untouched. If they fail, you broke the shell, not the content |

Generic helpers live in **`tests/_helpers.mjs`** (`ROOT`, `read`, `listFiles`, `stripCommentsAndStrings`,
`correctRaw`). `correctRaw(card, part)` builds the raw a student would submit for any part type — reuse it for
the new unit's golden round-trip instead of writing a third copy.

---

## 6. Release checklist

- [ ] `content/SOURCE.md` transcribed and committed; nothing under `source/` is tracked
- [ ] every `site/data` file rewritten; `site/data/cards.js` concatenates the new sheets
- [ ] `UNIT_ID` bumped; `LEGACY_UNIT_ID` untouched
- [ ] `APP_VERSION` bumped in `site/version.js` (the SW cache key — a stale one means the student never sees the new unit)
- [ ] `node qa/gen-precache.mjs` run and the `site/sw.js` diff committed
- [ ] `node --test tests/` green locally **and** in the Action on both Node majors
- [ ] `find site -iname '*.png' -o -iname '*.pdf'` is empty; `<meta name="robots" content="noindex">` still in `index.html`
- [ ] opened the deployed build once with a real Unit-1A save in localStorage: XP, streak and trophies intact,
      `archive.u1a` present in Settings → Export, and the Binder shows the new packet

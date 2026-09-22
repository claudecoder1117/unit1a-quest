# J5b — RECALL supply (THE JOB)

**Status: DONE. `node --test tests/` is GREEN — 1698 tests, 1694 pass, 0 fail, 4 skipped** (the same 4
skips the tree has carried since T17). `tests/job-supply.test.mjs` adds 27 tests, plus the 1 that
`no-random.test.mjs` generates automatically for the new file under `site/`.

Files owned and written:

- `/Users/oliver/Projects/unit1a-quest/site/js/gen/asn-reason.js` — NEW, 385 lines. The generator **and**
  (because it is the only non-test file this ticket owns) the per-wing supply arithmetic.
- `/Users/oliver/Projects/unit1a-quest/site/data/templates.js` — **one appended `/* === J5b === */`
  block: one import line, one `templates['T-asn-reason'] = …` assignment. No existing line changed.**
- `/Users/oliver/Projects/unit1a-quest/tests/job-supply.test.mjs` — NEW, 490 lines, 27 tests.

Two cross-file changes, both marked below under **Requests** and both one line:

- `/Users/oliver/Projects/unit1a-quest/site/js/screens/run.js` — Drill 5 now filters the skill's
  templates by item-level `needs` (`needsMet`, added to the existing `../schedule.js` import). This is
  the BUILD-POLICY §2 one-line allowance and it is **required** to keep `tests/run.test.mjs`'s
  "drill falls back to originals for a skill with no generator (ASN)" green. See §6.
- `/Users/oliver/Projects/unit1a-quest/site/sw.js` — **not touched by me.** `node qa/gen-precache.mjs`
  reported "up to date (121 files)" — another lane had already run the generator and `js/gen/asn-reason.js`
  is at line 38 of the precache list. `tests/sw.test.mjs` is green.

---

## 1. What was built

### `site/js/gen/asn-reason.js` — `T-asn-reason`, the reason-chip drill family

COMPOSED-GAME G4, response 2. **Every line of content it serves is read, never authored**: the chips
come from `data/asn.js`'s own `chipsFor(id)` (the 54 in-scope reason sets, one reason + two distractors
each, ticket T06d) and the statement each reason justifies comes from `data/cards/asn.js` (our
committed transcription of `content/SOURCE.md` §4/§5). No `orig`, no PNG, no `site/content/`, no
teacher key — asserted, including an allowlist of the module's six imports.

Two asks, drawn 5 : 3 (measured 198 : 102 over 300 seeds):

| mode | part | the student is given | the student answers | a miss tags |
|---|---|---|---|---|
| `reason` | `mc` | the statement **and** its verdict | which of the three lines is the reason | `wrong-reason` |
| `verdict` | `asn` | the statement **and** the bank's reason | Always / Sometimes / Never | `overgeneralised` · `undergeneralised` · `flipped-verdict` |

Both tags sets are ones `data/misconceptions.js` already catalogues and `js/grader/asn.js` /
`js/grader/mc.js` already emit — no new tag, no card-data migration (G4's "The tell is skill-keyed"
argument depends on exactly this).

```
“A plane and a line will intersect in one point.” is Sometimes. Which line is the reason?
  · One point, or the line lies in the plane, or they never meet at all.          ← the bank's reason
  · A line always pierces a plane at exactly one point, since a line goes on forever.
  · A line never meets a plane at just one point — it lies in it or misses it.

“The sum of the measures of 2 acute angles is greater than the sum of the measures of 2 obtuse
 angles.” — Two acute angles add to less than 180°; two obtuse angles add to more than 180°.
 · Which verdict does that make it?
```

Deliberately **not** offered as a third mode: the plain statement → verdict ask. That is the original
card, and re-serving it as a "Variant" would be the same lock, not a re-keyed one.

The item is tier 1, par 20 s, module M9, sheet `ASN`/`QZ` (the statement's own), `skills: [the
statement's own skill]` so a clear credits ASN-PLP **or** ASN-ANG, never both.

### The registry entry — one, on both ASN skills

`skills: ['ASN-PLP', 'ASN-ANG']`, so `templatesForSkill()` returns it for both and the composer's weak
slot, Drill 5 and the Night Before mini-mock can all reach it. `forCards: []` on purpose: this family is
not the Infinite view of any one statement, so **no `asn-*` / `qz-*` original changes its review,
rematch or Binder path** (`templatesFor('asn-07')` is still `[]` — asserted for all 54).

### The supply arithmetic (G4: `RECALL 8 locks available today`)

`wingSupply()` folds the card bank and the save into the four wings of G3.4:

```
RECALL 113 locks available today          (fresh save: 109 never-answered originals + 4 families)
FIGURES 17 locks available today
WORDS 28 locks available today
ALGEBRA 32 locks available today
```

`locks = due + fresh + one per renewable family`. A family counts as **one** lock because it is a floor,
not a ceiling: a renewable wing never runs dry, which is the entire point of registering this template.
`due`, `fresh`, `repeatable`, `originals`, `families`, `renewableSkills` and `thin` are all exposed
separately, so if J5 wants a different fold for the board sheet it is a one-line change at the call site.

---

## 2. Exported API — exact signatures

`site/js/gen/asn-reason.js` (DOM-free, pure, seeded; imports only `../rng.js`, `../schedule.js`,
`../../data/asn.js`, `../../data/cards/asn.js`, `../../data/cards.js`, `../../data/job.js`):

```js
// --- the generator -------------------------------------------------------------------------------
export const TEMPLATE_ID = 'T-asn-reason';
export const VERSION = 1;
export const SCOPE = 0.8;                       // xp.scopeFor({isVariant:true}), verbatim
export const MODES = ['reason', 'verdict'];
export const SKILLS = ['ASN-PLP', 'ASN-ANG'];
export const POOL: string[];                    // the 54 in-scope reason ids, bank order
export const POOL_BY_SKILL: { 'ASN-PLP': string[30], 'ASN-ANG': string[24] };

build(rng: Rng, opts?: { mode?: 'reason'|'verdict', ref?: string, skill?: 'ASN-PLP'|'ASN-ANG' }): Item
gen(seed?: string|number, params?: object): Item          // gen.version, gen.template
export const template: TemplateEntry                       // frozen; this IS the registry entry
export const templates: [TemplateEntry]                    // also the default export

// --- supply (G4) ---------------------------------------------------------------------------------
export const REPEAT_SCOPE = 0.5;                           // === data/job.js SCOPE_MIRROR.repeat

repeatFor(cardId: string, save: object, opts?: {
  now?: number,
  templatesFor?: (id: string) => TemplateEntry[],          // the registry's own; omitted → untemplated
}): {
  repeat: boolean, scope: number|null, note: string|null,
  reason: 'unseen'|'due'|'templated'|'repeat',
  templated: boolean, due: boolean, seen: boolean, daysEarly: number,
}

repeatNote(): string                                       // 'repeat · scope 0.5' — derived, not typed

skillSupply(save, opts?: { now?, cards?, templatesForSkill?, templatesFor? }):
  Record<skillId, { id, due, fresh, repeatable, cleared, originals, families: string[],
                    renewable: boolean, locks: number }>

wingSupply(save, opts?: { now?, cards?, wings?, templatesForSkill?, templatesFor? }): {
  wings: Record<wingId, { id, label, w, skills, due, fresh, repeatable, originals,
                          families, renewable, renewableSkills, locks }>,
  order: string[],          // WING_IDS
  lines: string[],          // 'RECALL 113 locks available today' — equals COPY.supply({wing, locks})
  total: number,
  thin: string[],           // wings with no cards and no family (G4 response 1)
}

intervalOf(rec): number                                     // schedule.intervalDays of a card record
```

`templatesForSkill` / `templatesFor` are **parameters, not imports**: `data/templates.js` imports this
module, so importing the registry back would close a cycle. Callers pass the registry's own functions.

---

## 3. How to test it

```bash
cd /Users/oliver/Projects/unit1a-quest
node --test tests/job-supply.test.mjs        # 27 tests, ~0.1 s
node --test tests/                            # 1698 / 1694 pass / 0 fail / 4 skipped
node qa/gen-precache.mjs                      # must print "up to date"
```

The A/B in `tests/job-supply.test.mjs` deletes `templates['T-asn-reason']` from the live registry
(try/finally, restored and re-asserted) and rebuilds the identical week from the identical save, so the
week claim is attributed to **this ticket** rather than to the composer happening to behave.

---

## 4. Acceptance — every criterion, with the number measured

| # | criterion | verdict | measured |
|---|---|---|---|
| 1 | generates only from the 54 existing reasons in `data/asn.js` | **PASS** | `POOL.length === 54` (36 `asn-*` + 18 `qz-*`, 0 `bonus-*`). Over **400 seeded items** every option is a line the bank owns (`answer === REASONS[ref].reason`, distractors `deepEqual` the bank's pair) and every stem contains the card's own statement verbatim; **2 000 seeds reach all 54**. Imports pinned to a 6-module allowlist; no `orig` / `.png` / `content/` / `teacherKey` in the code. |
| 2 | registers through `templatesForSkill` for ASN-PLP and ASN-ANG, pays scope 0.8 | **PASS** | `templatesForSkill('ASN-PLP') === ['T-asn-reason']`, same for `ASN-ANG`, and **0 of the other 17 skills** return it. `SCOPE === 0.8 === xp.scopeFor({isVariant:true}) === SCOPE_MIRROR.variant`; `postedFor({tier:1, isVariant})` = **5** against a drill's **6**. A composed ASN weak slot is `kind:'variant'`, `isVariant:true`, `template:'T-asn-reason'`. |
| 3 | a 30-run simulated week never repeats a card inside its Leitner interval | **PASS** | 30 runs, D ≈ 16 (no Final Sweep), every card answered clean through the real `schedule.applyOutcome`: **292 cards served, 0 served before due, 0 weak-slot originals, 89 weak-slot Variants.** A/B with the entry deleted: **5 cards served early** (`qz-15` 0.47 d, `asn-34` 0.56 d, `qz-05` 0.60 d, `qz-06` 0.60 d, `asn-36` 0.56 d), every one of them the `weak` role on an ASN skill, and **60 weak-slot originals**. |
| 4 | an untemplated `def-*`/`fact-*` repeat inside its interval pays scope 0.5 and prints `repeat · scope 0.5` | **PASS** | All **19** `def-*`/`fact-*` cards have `templatesFor(id) === []`. `repeatFor('fact-01', …)` one hour after a clean answer → `{repeat:true, scope:0.5, daysEarly 0.958, note:'repeat · scope 0.5'}`, and `note === COPY.repeat()`. `REPEAT_SCOPE === SCOPE_MIRROR.repeat === 0.5`; `postedFor` halves at **all four tiers** (6→3, 18→9, 38→19, 70→35). A due, an unseen and a templated card all return `repeat:false`. |
| 5 | per-wing supply is computed and exported so the board can print it | **PASS** | `wingSupply()` returns all **4** wings partitioning all **19** skills, weights summing to **100**; `lines[i] === COPY.supply({wing, locks})` for every wing; `locks === due + fresh + families.length` for every wing; `total === Σ locks`. With the entry: RECALL carries **4** families and `renewableSkills` includes both ASN skills; without it: **3** families, **locks − 1**, neither ASN skill renewable — i.e. this ticket adds **exactly one** always-available RECALL lock. `thin` reports a wing with no cards and no family. |
| 6 | `site/data/templates.js` gains EXACTLY ONE entry and no other line changes | **PASS** | Exactly **1** `/* === J5b === */` block, containing exactly **1** `templates[…] =` assignment and **1** import line; the string `asn-reason` appears **0** times outside that block; the block is appended after `/* === /T07c === */`, so no earlier ticket's line moved. |

---

## 5. Deviations from COMPOSED-GAME.md, and why

1. **The statement is read from `data/cards/asn.js`, not only from `data/asn.js`.** The acceptance line
   says "generates only from the 54 existing reasons in `data/asn.js`"; the **chips** are 100 % from
   there (`chipsFor(id)`, asserted over 400 items). But a reason like *"It could be right (exactly 90°)
   or obtuse…"* begins with a pronoun: without the statement it justifies, the ask is incoherent. The
   statement is the committed transcription BUILD-POLICY §1 explicitly blesses, and nothing is authored.
   **Zero new content lines ship in this ticket.**
2. **The entry carries `needs: ['ASN-PLP', 'ASN-ANG']`, which the spec does not mention.** A reason drill
   sits one layer above the verdict: you cannot usefully justify statements you have not met. The gate
   is `needsMet` (m ≥ 40 **or** placed), it locks nothing (an unmet save is served the statements
   themselves), and by the time the RECALL wing actually empties — mid-week, G4's own scenario — both
   skills are long past 40. It is also what keeps `tests/page.test.mjs`'s "ASN weak spots fall back to an
   original" green for a save that has met neither skill. See §6 for the honest cost of this choice.
3. **`wingSupply` / `repeatFor` live in `js/gen/asn-reason.js`.** G7's table puts `supply` on
   `page.composeBundles` (J5's file), and J5b owns no other non-test file. They are pure and take the
   registry as a parameter, so relocating them into `js/job/board.js` is a move, not a rewrite. Request
   filed.
4. **`js/gen/asn-reason.js` imports `data/job.js`** (for `WINGS` only). That pulls ~41 KB of layer
   constants into the `page.js` dynamic chunk even with `settings.game = false`. The alternative was to
   re-type the wing partition, which would drift from G3.4. Objection logged; the fix is deviation 3.
5. **`forCards: []`** rather than the 54 statements. Listing them would give every `asn-*`/`qz-*`
   original an Infinite view **and** change `page.js templateForCardId()`, i.e. the rematch path, which
   the prime directive forbids.
6. **`data/modules.js` M9 `templates` is left `[]`** (not my file). Consequence: the B2 Boss pool
   (`boss.test.mjs:87` reads `moduleById[m].templates`) and the Binder's M9 tile are byte-identical to
   before this ticket. If M9 should list `T-asn-reason`, that is a deliberate change to a Boss pool and
   its owner should make it — request filed.

**No objection to any number in the spec.** One clarification for the record: G4's "ASN-PLP (35 items)"
reconciles as 30 `asn-*`/`qz-*` statements + the 5 `fact-*` cards, and "ASN-ANG (24)" is exact.

---

## 6. Open issues

1. **`tests/run.test.mjs`'s "drill falls back to originals for a skill with no generator (ASN)" is only
   still true because of the one-line `needsMet` filter I added to `run.js`.** `buildRun('drill', …)`
   read `templatesForSkill(skill)` with no `needs` filter at all, so ANY registration on ASN-PLP —
   which is an acceptance criterion, not a choice — changed Drill 5 for a fresh save. The filter makes
   the drill screen select templates exactly the way `page.js`'s weak slot already does (COMPOSED S1's
   item-level `needs`), locks nothing, and leaves every other drill (all tested paths use `CS-LIN`,
   `needs: []`) byte-identical. Once both ASN skills are met, **Drill 5 on ASN is reason Variants rather
   than the 5 originals — this is intended by G4 and is a real behaviour change.**
2. **`locks` is my definition** (due + fresh + one per family). G4 prints `RECALL 8 locks available
   today` without defining it. Every component is exported separately; J5 should pick the fold the board
   sheet wants and pin it in `job-board.test.mjs`.
3. **`repeatFor` needs `templatesFor` injected.** With it omitted every card looks untemplated, which
   would bless a repeat of a card that could have been re-keyed. The board must pass it.
4. **Frozen Variants are not counted in `wingSupply`.** `schedule.dueList` also returns due *frozen*
   items; mapping those to a wing needs `getTemplate`, i.e. another injected registry function. Dues
   from originals are counted; frozen dues are not. J5 should decide whether the board's number includes
   them.
5. **Nothing here has been seen in a browser.** The generator emits `mc` and `asn` parts, both of which
   already have widgets (`integration-w2.test.mjs` pins that), and the `asn` part ships
   `distractors: []` in `verdict` mode, which `widgets/asn.js` handles (`chipList.length < 2 → no chip
   stage`, the same path the Bonus bank uses). The chip lines are the same strings the ASN cards render
   today, but in `reason` mode they go through the **`mc`** widget — J6 should eyeball three chips of
   ~90 characters at 375 px.
6. **Mode weights (5 : 3) are mine.** Nothing in the spec fixes them; `opts.mode` forces either ask.

---

## 7. Requests for other file owners

- **J5 (`js/page.js`, `js/job/board.js`)** — for the board sheet:
  ```js
  import { wingSupply, repeatFor } from '../gen/asn-reason.js';
  import { templatesForSkill, templatesFor } from '../../data/templates.js';
  const supply = wingSupply(save, { now, templatesForSkill, templatesFor });   // supply.lines → the sheet
  ```
  and `composeBundles(...).supply = supply.wings`. **Preferred:** move `wingSupply` / `skillSupply` /
  `repeatFor` / `repeatNote` / `REPEAT_SCOPE` into `js/job/board.js` verbatim and tell me; I will delete
  my copies and leave `asn-reason.js` a pure generator (which also drops its `data/job.js` import).
- **J6 (`js/screens/job.js`)** — the envelope's repeat line is `repeatNote()`, which is
  `data/job.js COPY.repeat()`; the per-wing line is `COPY.supply({ wing, locks })`, already built for
  you in `wingSupply().lines`.
- **`js/screens/run.js` owner (J6)** — please keep the one-line `needsMet` filter on the drill's
  template list (line ~288, marked `J5b`). Without it `tests/run.test.mjs`'s ASN drill test goes red.
- **`data/modules.js` owner** — decide whether M9's `templates` should list `T-asn-reason`. It is empty
  today, so B2's Boss pool and M9's Binder tile are unchanged. Listing it changes a Boss pool; I did not
  make that call unilaterally.
- **J10 (`js/store.js`, `sw.js`)** — `js/gen/asn-reason.js` is already in the precache list (a
  concurrent lane's `qa/gen-precache.mjs` run picked it up). Nothing further needed.

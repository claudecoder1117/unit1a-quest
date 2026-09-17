# INTEGRATION — Wave 1 (T03 numeric graders + dispatcher · T06b angles/doc content · T06c word problems)

Integrator pass after Wave 1. No agent failed. T06b and T06c both reported **red tests**, and both
named the same cause: a `tags.push(…)` literal inside `site/js/grader/num.js`, a file T03 was writing
while they ran. **T03 landed that fix before finishing** — the suite was already green when this pass
started (545/545). Nothing from Wave 1 had to be re-implemented; this pass connected the pieces,
adjudicated the open content questions, and closed the one request that crossed a closed lane.

## 1. Tests

```
cd /Users/oliver/Projects/unit1a-quest && node --test tests/
```
→ **545 tests, 545 pass, 0 fail** (41 suites, ≈ 305 ms, Node 26) — before and after every change below.
New this wave: `roots-cases.test.mjs`, `equation.test.mjs`, `golden.test.mjs` (T03, 64 tests). No test was
deleted or skipped; the one test edited is recorded in §3.

Content verifiers (dev-only, in `notes/`) after the changes:
`node notes/check-wp.mjs` → 1967 checks, 0 errors, 0 flags · `node notes/verify-t06b.mjs` → 1450 checks, 0 FLAG.

## 2. Requests fulfilled / dispositioned

| from → to | request | disposition |
|---|---|---|
| T06b, T06c → T03 | `num.js` tag-scan red run (`'angle'`/`'smaller'`/`'larger'` inside `tags.push`) | **already fixed by T03** before hand-off; `tests/misconceptions.test.mjs` is green |
| T06c → T06g | add catalogue key `grouping` to `site/data/misconceptions.js` | **DONE HERE** (T06g's lane is closed) — §3 |
| T06c → integrator | swap the 11 `requestedTag:'grouping'` entries in `cards/wp.js` to `tag:'grouping'` | **DONE HERE** — §3 |
| T06c → T03 | `equation`: accept `alternates[]` (each with its own `mustMention`), `part.roots` fallback, misconceptions by equivalence with `gives` | **verified landed** — `equation.test.mjs` sweeps every setup part of the content |
| T06c → T03 | `multi.js`: part-level entries dropped in the orderFree branch, field-scoped entries dropped in the other | **verified fixed by T03.** Probed both branches directly: a field-scoped entry in a non-orderFree multi and a part-level entry in an orderFree multi both surface their `msg` and tag. The asymmetry T06c warned T06b/T07a about is gone |
| T06c → T03 | `ratio.js` should consult card `misconceptions[]` by reduced-ratio equality | **verified landed**: wp-10 `1:29` → `ratio-as-measure`, `3:7` → `gave-supplement`, `6:4` → correct + `unreduced-ratio` nudge, `2:3` → `reversed-ratio`, `1.5` → malformed |
| T06b → T03 | (c) reject grades by `reasonKey`; (d) `cols[].type==='verdict'` compares text; (e) `bonus` optional | **verified landed**: ang-04 reject → correct/credit 1, a distractor reason → wrong/credit 0.5; ang-05's `verdict:verdict` column grades; ang-09's blank bonus is `correct`, a wrong bonus is a free `almost` |
| T03 → T01/T09 | `await ready` once before the first submit | **WIRED HERE** in `site/js/app.js` boot — §3 |
| T03 → T06b | reword the two `roots` misconception lines that name a root? | **ADJUDICATED: no change.** §4 |
| T03 → T06g | no new tags needed | confirmed; the scanner is green over all of `site/` |
| T06b/T06c → T07a/b, T08a/b, T09, T11, T13, T06f | part shapes, widget raw shapes, pips rule, blueprint slots | future waves; every shape they name exists in the landed data and is documented in their notes |

## 3. Changes made by this pass (4 files)

1. **`site/data/misconceptions.js`** (T06g's file, closed lane) — one key added in the `setup` area, verbatim
   from T06c's request:
   ```js
   'grouping': entry('Grouping misread',
     'Multiply or subtract the WHOLE phrase: "three times the difference between x and 5" is 3(x − 5), not 3x − 5.', 'setup'),
   ```
   (16-char title, 107-char fix — inside the catalogue's 40 / 140 limits, asserted by `misconceptions.test.mjs`.)
2. **`site/data/cards/wp.js`** (T06c's file) — the 11 grouping misreads now carry `tag:'grouping'` instead of
   `requestedTag:'grouping'`; the header comment records the swap. They now count in the Patterns panel (S4) and
   on the Night-Before sheet instead of grading by `msg` alone. `notes/check-wp.mjs` accepts both forms and is
   still 0 errors / 0 flags.
3. **`tests/equation.test.mjs`** (T03's file) — one assertion updated at its root, not deleted. The test pinned
   wp-01's grouping entry as *tagless* (`assert.deepEqual(untagged.tags, [])`); with the catalogue key added, that
   entry legitimately grades `['grouping']`. It now asserts the real tag **and** keeps the tagless-entry coverage
   through a synthetic part, so the "a misconception with no `tag` grades by message only" path (the shape T07
   generators may emit) is still tested. Net test count unchanged at 545.
4. **`site/js/app.js`** (T01's file — integrator wiring, BUILD-POLICY §2) — the grader registry is warmed once at
   boot and published on the dev handle:
   ```js
   const graders = import('./grader/index.js')
     .then(async (m) => { await m.ready; if (m.missing.length) console.warn('graders failed to load:', m.missing); return m; })
     .catch((err) => { console.warn('grader registry unavailable:', err); return null; });
   window.packet = { …, graders };
   ```
   Deliberately a **dynamic** import: a static one would put the whole 21-grader module graph in front of the first
   paint on every route. **T09 / T12 / T13 / T16:** `await window.packet.graders` (or `await ready` from the module)
   once before your first `grade()` call — until it resolves, a T04/T05 type answers `malformed` `err:'no-grader'`.

Also added: **`notes/sweep-w1.mjs`** — a dev-only verifier (never served; the `notes/check-wp.mjs` convention),
described in §5.

## 4. The one content question adjudicated — roots lines that name a root

T03 asked whether ang-10's `1/2` → "2x + 1 = 0 gives x = −1/2, not +1/2." and ang-05's `8` / `1` lines break S3's
"the roots grader never names the missing root". **They do not, and they stay as written.** Those entries are
tagged `sign-flip`, not `forgot-second-root`: they fire when the student has *already produced that root* and
typed it with the wrong sign, so naming the corrected sign is the correction itself, not a reveal. Probed on
ang-10 with one `ctx` across submits:

| typed | kind | free | tags | line |
|---|---|---|---|---|
| `3` | almost → wrong (2nd) | yes → no | `forgot-second-root` | "There is a second root — set each factor of (2x + 1)(x − 3) to 0." (never names −1/2) |
| `1/2` | wrong | no | `sign-flip` | "2x + 1 = 0 gives x = −1/2, not +1/2." |
| `x = 3 or -1/2` | correct | — | — | "Both roots ✓" |
| `3, -1/2, 7` | wrong | no | `extra-root` | "7 isn't a solution — plug it back in: 2(7)² − 5(7) − 3 = 60, not 0." |

The subset path — the one S3 guards — reveals nothing. The `cases` `missing-case` lines are shown only on the
**second** miss, where S3 allows the reveal. No content change.

## 5. Browser QA (what was loaded, looked at, and measured)

Four routes shot and **read as images**; all four render the T01 placeholder screens with the live header,
**zero console errors, zero failed requests, no horizontal overflow**, correct light/dark palettes. No screen
ticket has landed yet, so placeholders are the expected picture — the wave-1 deliverable is graders and content,
and it was exercised live in Chromium through `--eval`.

```
node qa/shot.mjs "#/today"       /tmp/w1-today.png    --w 375
node qa/shot.mjs "#/card/ang-10" /tmp/w1-card.png     --w 375
node qa/shot.mjs "#/settings"    /tmp/w1-settings.png --w 375 --dark
node qa/shot.mjs "#/binder"      /tmp/w1-binder.png   --w 1280 --h 800
```

- `#/today` + `--eval "window.packet.graders.then(m => ({types: m.types().length, missing: m.missing}))"`
  → `{ types: 21, missing: [] }` — the §3 boot wiring works in the browser.
- `#/card/ang-10` + `--eval` grading **in the page**: `data/cards.js` = 197 cards; ang-10's setup
  `(-x + 84) + (2x^2 - 4x + 3) = 90` → `correct`; its roots `x = 3 or -1/2` → `correct`.
- `#/settings --dark` + an import of **all 42 modules under `site/js` and `site/data`** → zero failures
  (W0's 23-module smoke check, re-run and widened after this wave's 9 new grader modules). **Re-run this after
  any wave that touches `site/js` or `site/data`.**

## 6. New standing verifier — `notes/sweep-w1.mjs`

```
node notes/sweep-w1.mjs        # → 193 word-grader parts, 19 figure cards, "all clean — 197 cards", exit 0
```
It closes the one gap the per-ticket suites leave. `tests/golden.test.mjs` round-trips every **numeric** part of
every card; nothing round-tripped the **193 asn / mc / term / termmatch / cloze / classify / notation parts**, i.e.
T05's graders against T06d/T06e/T06a/T06b content. A renamed field or a changed answer shape there would only
have surfaced in T09's screens. It checks: (1) every such part grades its own authored answer as `correct`
through the dispatcher; (2) every part type present in the content has a registered grader and `missing` is empty
(17 types, all registered); (3) termmatch layouts are deterministic per seed; (4) every card figure resolves,
`validate()` = [], `lint(343 px)` = [] and renders real SVG (**19 figure cards**, up from 9 before this wave);
(5) deck integrity (197 unique ids, no card without parts). All clean today.
**T06f: lift this into `coverage.test.mjs`. T17: fold it into the consolidated suite.**

## 7. Publication-policy audit (BUILD-POLICY §1) — clean

No `.png` / `.pdf` / `.html` under `site/` except `index.html` (the only non-JS/CSS files are our own
`assets/icons/icon.svg` and `icon-maskable.svg`); no `teacherKey` / `orig` / `crop` identifier anywhere in
`site/` or `tests/`; no external URL in any served file (only the `www.w3.org` SVG namespace); no `Math.random`
under `site/js` (`no-random.test.mjs` green). `content/*.png` remain git-ignored.

## 8. Still open (carried forward — none blocking wave 2)

1. **T09 (Card screen) owes three content-driven behaviours**, all documented and all with data already in place:
   pips = the S1 formula over `parts.filter(p => !p.optional)` (ang-10 = 4, not 5); render `card.note` muted under
   the stem (ang-wu-1..5, ang-04, ang-06, ang-10 carry one); keep **one `ctx` object per part per visit** so the
   subset / GCF / missing-case counters on `ctx.state` escalate (T03).
2. **T09 also owes the `await window.packet.graders`** before its first submit (§3).
3. **cls-02 wording vs the drawing** (carried from W0 §5.2, cosmetic): the right-angle square sits in ∠BFA while
   cls-02 asks for ∠BFD. If it looks odd on T09's screen, change the stem to "…the small square at F marks ∠BFA as
   a right angle" — never move the mark (the mark matches the packet).
4. **ang-wu stems say `{line AD}` while the figure prints G** (T06b open issue #4, as printed). Handled by `note`;
   a student typing "∠AFC" on a warm-up gets T04's "unknown letter" malformed line (free). If T09 finds that
   confusing, turn the rename off on reviews rather than editing the transcript.
5. **`roots` partial credit** is `found/total` while `kind` is `almost`/`wrong`; T13 decides whether a roots item
   scores partially in the Mock — `combineCredit` just averages what it is given.
6. **Save-size bound stays at 500 K** (W0 §2 decision). Any cap change re-opens `state.test.mjs`.
7. T01's carried items, unchanged and owned by later tickets: no onboarding redirect (T14),
   `apple-touch-icon-180.png` not linked (T15), `markStreakDay()` provided but not yet called (T10/T13),
   `sw.js` not registered (T15). Screens registry is still empty — **wave 2 is what changes that**.

## 9. Commands the next integrator should run first

```sh
cd /Users/oliver/Projects/unit1a-quest
node --test tests/                                  # must be 0 fail (545 today)
node notes/sweep-w1.mjs                             # content ↔ grader ↔ figure contract, must exit 0
node notes/check-wp.mjs && node notes/verify-t06b.mjs
node qa/shot.mjs "#/today" /tmp/today.png --w 375    # console errors must be []
# widen the module smoke check to every file under site/js and site/data (see §5)
```

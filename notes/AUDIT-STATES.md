# AUDIT-STATES — the catalog of every screen state the layout auditor checks

Built by ticket AUDIT-STATES. Files owned by this ticket:

| file | what it is |
|---|---|
| `qa/audit-states.mjs` | the catalog: `states(h)` → one entry per screen state, each with an async `prepare(page)` |
| `qa/fixtures/audit-build.mjs` | the fixture **builder** (saves are built from the app's own modules, never hand-typed) |
| `qa/fixtures/audit/*.json` | the built saves (11 files), each stamped with the day it was anchored on |
| `qa/audit-selftest.mjs` | the proof: runs every `prepare()` at 1900×1200 and 375×667 and checks the screen actually mounted |
| `notes/AUDIT-STATES.md` | this file |

`qa/layout-audit.mjs` (another lane) consumes the catalog. **Nothing under `site/` imports any of this**, and
none of it is part of the deployed artifact.

## Why a catalog, and why these states

Every responsive rule in the app is keyed to the **viewport** (`@media`), but a component is hosted at widths
that have nothing to do with the viewport: a card lives inside `#/card`, inside a run (`.run-stage`), inside
the onboarding placement (`.ob-run-stage`), inside a boss (`.boss-stage`), inside the Mock body, inside the
night screen. `grep -rn "container-type|@container" site/css` returns nothing — the app has no container
queries at all, so a component is only ever correct in the hosts somebody happened to look at.

That is exactly the bug the student hit: at 1900×1200 on `#/onboard?step=3` the placement question rendered
**one letter per line** — `.card-stem` computed to **0 px** because `.card-paper`'s grid was `0px 250px`
inside a 336 px content column. `#/card/ang-10` at the same width was fine, so no single-screen check could
see it. The catalog therefore opens the **same** components through **every** host they live in, and the
self-test prints `.card-stem`'s width so a collapse is visible in one line of output — this is the catalog
reproducing the student's bug, in both engines, before the fix lane's CSS landed:

```
OK   1900px placement-item-1           #/onboard?step=3   stem    0px   COLLAPSED STEM cols=0px 250px
OK   1900px placement-item-2           #/onboard?step=3   stem    0px   COLLAPSED STEM cols=0px 250px
```

## The contract

```js
import { states } from './audit-states.mjs';
const list = states(h);                    // → Array<{ id, describe, tags, root, media, prepare }>
for (const st of list) { await st.prepare(page); /* measure · shoot · report */ }
```

`h = { base, gotoRoute(page, hash), setSave(page, json), waitReady(page), readFixture(name) }`.
**Only `base` is required** (the origin the site is served from, e.g. `http://127.0.0.1:8123/`); `adapt()`
fills a working default for every other helper, so the catalog also drives a bare Playwright page.

Each entry:

| field | meaning |
|---|---|
| `id` | stable slug, safe as a filename (`placement-item-1`) |
| `describe` | one line for the report, in the student's language |
| `tags` | `['card','phone-critical','figure']`-style labels — see below |
| `root` | the selector that proves the state actually happened; `prepare` waits up to 20 s for it |
| `media` | `'print'` on `sheet-print`, `'screen'` everywhere else (every `prepare` resets media itself) |
| `prepare(page)` | sets the save, loads the route, drives the clicks, waits for the state |

`prepare` is self-contained and order-independent: it always re-lands on a real document (`version.js`),
writes or clears `u1a.save`, then navigates — so states never leak into each other, and the auditor may run
one state, one tag, or all 92.

### One hard requirement on the auditor's browser context

```js
browser.newContext({ …, serviceWorkers: 'block' })      // qa/shot.mjs and qa/s9-walk.mjs already do this
```

With service workers allowed, the app's own SW registers on the first load and **controls the second one**,
and in WebKit that navigation never reports "finished": `page.goto` hangs for ever and takes the run with it
(`page.evaluate` has no default timeout, so no per-state timeout rescues you). This cost an hour of this
ticket — `--browser webkit` sat on state 2 until it was killed. Belt and braces, every `prepare` also
unregisters any registered worker and empties the caches while it is on the warm-up document
(`killServiceWorkers`), so the catalog survives a context that allows them; block them anyway. Offline
behaviour is `qa/s9-walk.mjs offline`'s job, not the layout auditor's.

### Tags in use

`home · onboard · placement · binder · card · widget · w:<type> · variant · run · summary · blitz · boss ·
mock · report · stats · sheet · settings · night · morning · post` (what screen it is) and
`phone-critical · host · figure · wedges · keyboard · options · chips · builder · stages · tabs · grid ·
list · table · overlay · form · long · timed · print · fresh · fixture · answer · wrong · hint · solution ·
cleared · result-strip · mint · regression` (what about it is risky). `host` marks the states that exist
only because the component is hosted somewhere unusual — those are the ones that caught this bug.
`timed` states have a live clock (BLITZ 60 s, the Mock): shoot them promptly.

### A state that lies is worse than a state that fails

`go()` checks, after every navigation, that the app really booted on the save it was given (`ensureSave`,
matching `profileId`; a fresh state must boot with no cards, no placement and no runs) and, if not, writes
it again and reloads. This is not paranoia: with service workers allowed, the *previous* app document can
outlive the warm-up navigation long enough for its own flush to overwrite ours, and the next screen then
renders the previous state's data while looking perfectly healthy. It was caught in the act —
`#/binder` said "0 % of the packet cleared — 0/164" while the fixture on disk had 40 cleared, and the Mock
report rendered the mid-week *Baseline* instead of the fixture's submitted Mock. Both now self-correct
(the self-test prints `reload` in those rows).

## What the catalog already showed (before the auditor even measured)

`.card-stem`'s width at 1900×1200, per state. **First run, against the tree as this ticket started**
(`site/css` untouched by the fix lane):

| state | `.card-stem` |
|---|---|
| `card-num` … `card-cloze` (`#/card/…`, no figure) | 614 px |
| `card-rootcase-*`, `card-classify`, `card-notation` (figure cards) | 314 px |
| `run-page-item-1`, `run-jump-m10`, `onboard-2-sandbox` | 270–278 px |
| **`placement-item-1`, `placement-item-2`** | **0 px** (`.card-paper` columns `0px 250px`) |

Same component, five different widths at one viewport — which is the whole argument for container queries,
and why the catalog opens the card through every host rather than once. The sharpest row was
`run-page-item-1`: **278 px at 1900×1200 vs 317 px at 375×667** — the same question wider on a phone than on
a 1900 px laptop, in both engines.

**Re-run at the end of the ticket**, after the fix lane's `site/css` + `card.js` changes landed: 92/92 states
still reach their screen, and the collapse is gone — `placement-item-1` now measures **314 px** and
`placement-item-2` **614 px**, with no `COLLAPSED STEM` and no `H-OVERFLOW` anywhere. The spread that
remains (254 · 278 · 314 · 614 px across hosts at one viewport) is the auditor's verdict to make, not this
ticket's; the catalog's job is that no host can hide any more.

## What is covered (92 states)

* **Home** — fresh (no save) · mid-week · after an aced placement · with the **Mock as primary CTA** · post-test.
* **Onboarding** — step 1 (setup form) · step 2 (**live sandbox card inside the step**) · step 3 (placement intro).
* **Placement** — item 1 · item 2 (reached by missing item 1 three times and continuing) · the summary.
  Driven with real clicks, exactly the way the student got there.
* **Binder** — all 12 sheet tabs × **tiles and list** (24 states) · the long-press tile sheet on a card tile
  and on a **family** tile.
* **The Card** — one card per widget type: `num` `multi` `equation` `factored` `ratio` `pairs` `strip` `asn`
  `mc` `term` `termmatch` `notation` `cloze` `classify`, plus `ang-05` (four parts on one card) and the three
  progressive **rootcase** stages of `ang-10` (Solve → Keep or reject → Cases, each driven to its stage with
  answers read from the card's own data).
* **Answer states on two cards** (`wp-04` num, `wp-01` multi) — wrong · hints open · forced worked solution ·
  cleared result strip.
* **Variants** — `T-cs-lin`, `T-factor-a2`, `T-fig-pairs` (fixed seeds).
* **Runs** — `page` item 1 · page mid-run · the **Summary** (minted tiles incl. a family tile) · `blitz/M1` ·
  `drill/CS-LIN` · `jump/M10` · `full36` · `missed` · `upgrade` · `baseline` · `night` · `morning` · post-test.
* **Boss** — B4 intro · mid-run · heart-lost / CONTINUE (driven by real wrong answers).
* **Mock** — rules · mid-mock · mid-mock with the **question map** open · report #1 · report with an item expanded.
* **Stats · Sheet · Sheet under `@media print` · Settings · Settings scrolled to the export box.**

## The fixtures

`node qa/fixtures/audit-build.mjs [YYYY-MM-DD]` writes `qa/fixtures/audit/`:

| file | the save it is |
|---|---|
| `midweek.json` | the committed `qa/fixtures/midweek.json`, re-anchored so the test is 6 days out |
| `aced.json` | placement done and aced, nothing attempted yet (provisional Readiness) |
| `page-open.json` | Today's Page in progress at item 1 (17 items) |
| `page-mid.json` | the same Page with 4 items done |
| `page-done.json` | the same Page finished — one miss, a `T-sys` Variant in the queue and an empty before-snapshot, so the Summary mints tiles **including the `fam-sys` family tile** |
| `mock-cta.json` | T−3, goal met, no Mock or Baseline on the save → the Mock is Home's primary action |
| `mock-open.json` | an OPEN Mock: 20 items, 3 answered, sitting on question 4 |
| `mock-done.json` | a real SUBMITTED Mock built through `startRun` → `setItemAnswer` → `submitRun`: **70/100**, 14 clean, 6 missed, predicted 72 |
| `post.json` / `night.json` / `morning.json` | the test 2 days ago / tomorrow / today |

Two rules make them trustworthy:

1. **Built, not typed.** Every save goes through the app's own code (`store.fresh`, `page.startPage`,
   `mock.startRun`/`submitRun`, `run.variantsFrom`, `tests/_helpers.mjs` `correctRaw`). A fixture can never
   claim a state the engine cannot actually reach, and they keep working when a save shape changes.
2. **Never stale.** Each file carries `auditAnchor` (the ISO day it was built for). `freshen()` in the builder
   shifts every epoch-ms number and every `YYYY-MM-DD` string *and key* by whole days, and `audit-states.mjs`
   applies it on load — so a fixture built in September still says "T−6" in December. The mid-mock state also
   re-stamps the open run's `startedAt`, so there is always ~36 min left on the clock.
   The builder runs itself the first time a state asks for a file that is missing.

`qa/fixtures/midweek.json` is **read, never written** — another lane owns it.
`qa/screenshots/s9/*.json` (`after-ace.json`, `after-page.json`, `midmock.json`) are git-ignored, so nothing
here depends on them; they are still resolvable by name (`s9:after-ace.json`) for a manual one-off.

## Verifying (and what "verified" means)

```
node qa/audit-selftest.mjs                     # chromium, 1900×1200 + 375×667, all 92 states
node qa/audit-selftest.mjs --browser webkit    # the other engine
node qa/audit-selftest.mjs --only placement    # filter by id or tag substring
node qa/audit-selftest.mjs --shots /tmp/aud    # a PNG per state as well
```

Each line is `OK`/`MISS`, the hash it ended on, `.card-stem`'s width when a card is on screen, an
`H-OVERFLOW` flag, the time prepare took, and any page error. `MISS` means the state's `root` never became
visible — the catalog is wrong (or the screen is broken); exit code is non-zero if anything missed.
`COLLAPSED STEM` is *not* a self-test failure: it is a real product defect the state successfully exposed.

## Adding a state

1. Decide what makes it different. If it is a **component in a new host**, that is the most valuable kind.
2. If it needs a save that does not exist, add a builder function to `qa/fixtures/audit-build.mjs`, register
   it in `BUILDERS`, and build it from the app's modules (never by editing JSON). Re-run the builder.
3. Pick a `root` the state's POINT depends on, not just the screen: the wrong-answer states root on
   `.card-parts .w-field[data-state="bad"]`, the hint states on `.hint-list li`, the cleared states on
   `.card-result`, `run-page-mid` on `.run-progress[aria-valuenow="4"]`. A root that is merely
   `.card-screen` passes even when the driving silently did nothing.
4. Add one `add(id, describe, tags, root, prepare)` call in the right section of `states()` in
   `qa/audit-states.mjs`. Use `go(H, page, hash, { save, root })` for the load, `tap`/`typeFields`/
   `cardLive` for the driving — never `page.click` (a sticky dock makes actionability flaky).
5. Run `node qa/audit-selftest.mjs --only <id>` at both viewports and in both engines. A state that cannot
   reach its screen is not a state; fix the path or drop it.
6. `node --test` must stay green (this ticket adds no test-visible behaviour).

## Known limits (honest list)

* `placement-item-2` gets there by **missing item 1 three times** and taking Continue (there is no per-item
  skip — `.ob-skip` ends the whole placement). Verified: the head reads `2 / 8` and the label changes from
  `Notation` to `Always / Sometimes / Never`, so the state also audits a second widget inside that host. It
  depends on card.js charging three *different* wrong answers (`isRepeatWrong` ignores a repeat) and on the
  notation builder staying on a two-letter kind (a null build is "malformed" and free). If either changes,
  the state silently falls back to item 1 — the self-test still says OK, because a card *is* mounted, so
  check the counter after touching the card's miss path.
* `boss-b4-heart-lost` drives real wrong answers. Verified to reach **0 of 3 hearts and the `CONTINUE?`
  panel** on B4 today; if B4's first items change it may stop at the heart-lost line instead, and the root
  selector accepts either (both are worth auditing).
* `run-blitz-m1` mounts a 60 s round that is already running, and the two mid-mock states a paper with
  ~36 min left: they are re-created per state, never shared.
* `run-blitz-m1` and the two mid-mock states have live clocks; a slow auditor will photograph a later second.
* The answer helpers only type `num` and `multi` fields (plus the rootcase stages). Clearing a `pairs`,
  `notation` or `termmatch` card by script was not needed for layout and is not implemented.

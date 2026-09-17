# INTEGRATION-W4 — Wave 4 (T12 Bosses · T13 Mock/Report/Baseline · T14 Plan/Onboarding/Night/Sheet · T16 Run)

No agent failed; no lane reported red tests. The suite was green on arrival (**1102 pass**). As in Wave 3 the
work was connection, not repair — plus three real defects that only showed up once the pieces were joined and
the screenshots were read.

**Suite after integration: `node --test tests/` → 1125 tests, 1125 pass, 0 fail** (≈ 45 s; the 23 new ones are
`tests/integration-w4.test.mjs`). `node qa/gen-precache.mjs --check` → up to date (115 files).

---

## 1. Defects found and fixed at the root

### 1.1 Boss B1 was unreachable — forever — `site/js/page.js bossReady()`
`bossReady` required, for **every** module of a boss, that the module have originals or family tiles and that
all of them be cleared. **M3 ("Comp/Supp Sprint") has neither**: it is a generator-only module, all of its work
is Variants. B1 = M1 + M3, so B1 could never be offered no matter what the student did — one of the seven
bosses, its elite (`not-04`), its trophies and the whole Definitions Gauntlet, dead.

The gate is now: *every module that **has** content is fully cleared, **and** at least one module of the boss has
content.* A generator-only module is vacuously satisfied. Verified: a save with M1's 55 originals cleared now
offers `B1 Definitions Gauntlet`; a fresh save offers nothing; a beaten boss is not offered again. Pinned by a
test that walks **all seven** bosses and asserts each one can be reached by clearing its modules (§4).

### 1.2 The plan turned a 25-item Page into a 33-item one — *my own wiring*, caught by a screenshot
T14 asked (notes/T14.md → T10/T16) for `startPage(s, plan.composeOpts(s))`. Doing that literally made
`#/today` announce "17 reviews + **12 new** + 4 variants · **~44 min**". Cause: `composeOpts()` returns
`{ q, tier4, microFlashOnly }`, and an **explicit `q`** switches off page.js's session budget
(`qEff = Number.isInteger(opts.q) ? q : min(q, pageMax − queue.length)`), which is what keeps a heavy-review
day inside S1's 10–25 minutes; the day's remaining new cards are meant to land on the day's *second* Page.

The call sites now pass the plan's opts **minus `q`**: page.js derives the identical target from its own `qFor`
(pinned in §4, so a future drift goes red rather than silent), and what the composer genuinely cannot derive —
the **tier-4 cap** — is what gets forwarded. Back to 25 items / ~34 min, with the lowering honoured.

### 1.3 A phrase in the number gutter painted over the stem — `card.js` + `screens.css`
`.card-paper` reserves a 44 px left gutter and `.card-no` sits in it `position:absolute`. It fits `16)` / `W2` /
`◆`. The five AP-1 warm-up cards number themselves **"Warm up! — item 2"** (from `teacherNo`), 154 px wide, so
the label was painted straight across the first two lines of the stem — on `#/card/ang-wu-*` **and** on every
review of them, which is what the mid-week Page opens on. Pre-existing (Wave 3 shipped it); found by reading
`#/run/page`.

`renderPaper()` now sets `paper.dataset.no = 'none' | 'short' | 'long'` and the T09 CSS block drops a **long**
number into the flow above the stem (gutter padding removed with it). Verified light at 375: `ang-wu-2` reads
cleanly, `fac-16` still has its `16)` in the gutter.

---

## 2. Requests fulfilled (the wave's notes, closed)

| request | where | what was done |
|---|---|---|
| **T12 → T09**: a hidden hint ladder must not record a hint | `screens/card.js` | `if (n === 2 && !hintWrap.hidden) revealHint(0, { auto: true })`. Every Boss / `hints:false` item that took two wrongs on one part was recording `cards[id].hintsUsed += 1` for a hint the student never saw. |
| **T13 → T08a**: `rootcase` is the last widget with no `ctx.values` restore | `widgets/rootcase.js` | Each stage gained `setValues()` and the mount ends with `restoreValues(ctx.values)`. `found` is restored **first**, because the reject rows and the case tabs are built from it. Verified in Chromium against `ang-05`: a `{stage:'cases', found:['3','-1/2'], roots, cases:[…]}` snapshot comes back as the Cases stage with both tabs, both measures per tab and the collapsed "Solve · 3, −1/2" summary. A resumed Mock now shows the answers it always stored. |
| **T13 → T16**: `daily.missesDrilled` at the *end* of the drill | `screens/run.js`, `screens/report.js` | The report wrote the flag when "Drill what I missed" was **tapped** — tap and walk away and S4's "a Mock completed ∧ its misses drilled" goal was satisfied for free. `run.js` now writes it when a `drill` run finishes, and only when `daily[today].mockDone` is set (a drill on its own is not that goal). The three lines in `report.js startDrill()` are gone, as T13 asked. |
| **T14 → T10/T16**: hand the composer the plan's lowered target | `page.js`, `home.js`, `run.js` | `composePage` honours `opts.tier4` (the plan strip prints "tier-4 to one a day" — now true). Home and run.js compose with the plan. See §1.2 for the `q` half. |
| **T12 → T10**: skip the boss intro once it has been read | `screens/home.js` | `bossHref(id)` appends `?start=1` when `save.runs` already holds a `boss:<id>` run; the plain link stays for the first time (and it is also the resume link). Applies to the primary button *and* the secondary. Verified both branches with `--eval` on the rendered `href`. |
| **T12/T16 → T11**: the Binder should start a module's runs | `screens/binder.js` | The tile popover's action row gained **`BLITZ · 60 s`** (M1/M3/M9 — driven by `moduleById[m].blitz`) and **`BOSS · <name>`** for each boss of that module that is ready right now (`bossReady`). A boss that is not ready is not offered rather than offered and refused. Verified by right-clicking `voc-01`: Open card / Infinite / JUMP HERE / BLITZ / BOSS, no overflow, no console errors. |
| **T16 → integrator**: two JUMP implementations | — | Kept both, because they now provably agree: `run.js` delegates to `onboard.js#mountJump` (the live path) and keeps its own as the fallback. T16's note says T14's `applyJump` writes `m = 0` on a failure — **it does not** (T14's note is the accurate one): both write nothing at all on a failed JUMP. A test drives both writers side by side (§4) so they cannot drift. |
| **T13 → T11 / T16 → T13 / T16 → T14** (keep `mountBaseline`, `mountRunKind`, run-record fields) | — | Already satisfied; re-checked by `tests/run.test.mjs`'s greps and the route test in §4. |

### 2.1 One extra piece of wiring: the Readiness ring belongs to the shell — `site/js/app.js`
Every screen that happened to compute Readiness pushed it into the header; the ones that did not (`#/mock`,
`#/mock/report/:n`, `#/boss/:id`) showed **"—"** on a deep link while the app knew the number perfectly well —
the same defect Wave 3 fixed one screen at a time on `#/settings`. Readiness is a pure function of the save, so
`syncHeaderFromState()` now derives it on every state change and no screen has to remember. The screens' own
`setHeader({ readiness })` calls stay valid and write the same value. `#/mock` now opens on `0`, not `—`.

---

## 3. Screens loaded and read (Chromium, 375 × 812, light unless noted)

| route | state | result |
|---|---|---|
| `#/today` | fresh | 0 errors, no overflow. Ring 0, Warm-up primary, no plan strip (no date — S7), 19 skill bars. |
| `#/today` | midweek fixture | 0 errors. Ring 38, `RUN NEXT · 17 reviews + 4 new + 4 variants · ~34 min`, the 6-pill plan strip with today outlined, 5 weak spots with Drill 5. **This is the shot that caught §1.2.** |
| `#/today` | B1-ready fixture | primary `Boss: Definitions Gauntlet` → `#/boss/B1`; with a `boss:B1` run on the save → `#/boss/B1?start=1`. |
| `#/mock` | fresh | 0 errors. Rules card, section table A4/B2/C4/D6/E4, the five rules, the predict slider at the student's own Readiness, Start / Not now. Header ring now `0` (§2.1). |
| `#/boss/B1?start=1` | fresh | 0 errors. Head + 3 hearts, `Item 1 of 6 · seed 955a28`, the `◆ T-vocab` chip, tier 1, no hint ladder, the four options, the dock. |
| `#/run/blitz/M1` | fresh | 0 errors. `BLITZ · Lexicon`, `60 s · wrong = −3 s · 3 strikes`, the clock at 0:58, 3 strike pips, the meter, a plane-naming prompt with keyed options. |
| `#/run/page` | midweek fixture | 0 errors. `inProgress` = 25 items, 0 tier-4. **Caught §1.3.** |
| `#/card/ang-wu-2`, `#/card/fac-16` | fresh | §1.3 before/after. |
| `#/binder` (tile popover) | B1-ready fixture | 0 errors, no overflow; the five actions of §2. |
| `#/sheet` | fresh | 0 errors, no overflow. |
| `widgets/rootcase.js` mounted directly with a snapshot | — | §2 (the restore). |

Drivers used: `qa/shot.mjs` for the routes; three ~40-line Playwright drivers in the scratchpad (not committed)
for the long-press popover, the widget-level `ctx.values` restore and a DOM measurement of `.card-paper`.
**No audio was produced** (01:14 local — quiet hours); sound is still wired-and-unheard from Wave 3.

---

## 4. New tests — `tests/integration-w4.test.mjs` (23)

* **plan ↔ composer.** `composeOpts().q === qFor().target` for every plan state (this is what makes dropping
  `q` at the call sites lossless — if the two ever drift, this goes red). The tier-4 cap really changes the
  queue (2 → 1 → 0 tier-4 items on a save whose weak spots are tier-4 skills). A lowered day really asks for
  `tier4: 1`. **The session budget survives the plan opts** — the §1.2 regression guard, plus a source
  assertion that neither call site forwards `q`, so it cannot creep back in. `nextAction`'s new `compose`
  pass-through means Home previews the page it is about to start.
* **One JUMP, two writers.** Constants agree; a pass writes `m = 80 / n = 5 / jumps[M]` with `m_shown = 80` in
  both; **a fail writes nothing** in both (byte-compared against the untouched save).
* **The Wave-4 call sites exist**: the hidden-ladder hint guard, `restoreValues(ctx.values)` with `found`
  restored first, `missesDrilled` moved from `report.js` to the end of a drill, `bossHref(?start=1)`, the
  Binder's BLITZ / BOSS entries, the long-number paper layout, and the shell's Readiness sync.
* **Every boss is reachable**: M3 really has no content; B1 lights up when M1 is cleared and goes dark once
  beaten; **all seven** bosses can be reached by clearing their own modules.
* **The route map after four waves**: every one of app.js's 13 patterns has a screen, every registered screen
  is one of the 13, every handler is a function, and the `/night` / `/morning` aliases still land on run kinds
  that have a delegate.

---

## 5. Still open

1. **`microFlashOnly` is produced and ignored.** `plan.composeOpts()` returns it on a lowered day ("vocabulary
   and notation to flash only") and `composePage` has no flash item kind, so that third of the lowering is
   printed on the strip but not honoured. The other two (target 12, tier-4 → 1) are real. Either build a
   `flash` role in the composer or soften the strip copy — a product call, not an integration one.
2. **A heavy-review day still reads ~34 min** against S1's 10–25. `pageMax` (20) bounds reviews + rematches +
   new, but the 3 weak Variants, the 2-item algebra floor and the tier ramp ride on top, and a 17-review day
   is simply long. Worth a look before the student's first heavy day.
3. **BLITZ's answer row is not in the thumb zone** on an 812 px phone — the prompt card sizes to its content
   and floats in the top half, so the options sit mid-screen. Cosmetic; T16 owns `.blitz-card`.
4. **JUMP HERE is still offered on a fully cleared module** (`!t.placed` is the only gate), where it cannot
   teach anything. One condition in `binder.js`, T11/T14's line.
5. Carried from Wave 3, unchanged: `js/mastery.js` vs `js/schedule.js` are still two implementations of one
   idea (agreeing, and pinned); **sound has still never been heard**; no `apple-touch-icon` on iOS by policy;
   the header `T−N` chip is 41 × 24 px.
6. Carried from the wave's own notes: T12's blank-B4-setup path and its ≤ 5 s `setupMiss` autosave window;
   T13's `work` scratch kept only for the three most recent Mock-like runs; T14's Night mini-mock still shows
   per-item feedback (scored on first try, so the numbers are honest) and `isQuietHours` is `>= 22` only;
   T16's BLITZ pool recycling and flat +20 Daily bonus.
7. **`home.js planStrip()`'s pill loop is dead on the happy path** (T14 flagged it). Left standing on purpose:
   it is the fallback if `plan.js` ever throws.

## 6. Integrator checklist for Wave 5
1. `node --test tests/` green **before** touching anything.
2. `node qa/gen-precache.mjs` after any file lands under `site/js|css|data|assets`.
3. Watch for `*/` inside a JS block comment and `/*` inside a CSS comment.
4. **Read the screenshots.** Three of the four defects above were invisible to `node --test`: two were found
   only by reading a PNG, and the third (B1) only by trying to build a fixture that made a boss appear.
5. When a note asks you to "pass the plan's opts", check what the receiving function does with **each** key —
   `q` and `tier4` looked alike and behaved nothing alike.

# notes/FIX-qa.md — ticket fix:qa (round 2): the auditor's tap-target blind spot

One finding, type `audit-blindspot`. Nothing in `site/` changed: this ticket owns the **net**, and a net
that cannot see a defect is worse than no net, because everyone downstream reads its silence as "clean".

Owned/changed files:

| file | change |
| --- | --- |
| `qa/layout-audit.mjs` | detector 8 (`tap-target`): the pseudo-element hit-area credit is now measured, not assumed. Plus the eighth plant in `PLANTED`, and the clean page's negative control is guarded against drifting off screen. |
| `qa/audit/selftest.html` | plant 8: `#plant-clipped-hit`, a 30x20 control whose `inset: -12px` `::before` is clipped away by its own `overflow: hidden`. |
| `qa/audit/selftest-clean.html` | negative control `#ctl-pill`: a 32 px pill whose 44 px `::before` hit area really IS painted. Must stay silent. |
| `tests/layout-audit.test.mjs` | pins the plants by NEEDLE, not only by type (a second tap-target plant is invisible to a by-type assertion), and pins the clean page's negative controls being on screen. Deliberate: it is the behaviour this ticket changed. |
| `notes/AUDIT.md` | the `tap-target` row and the self-test section now describe what is actually measured. |

---

## V2-audit-pseudogrow-blind — root cause

`pseudoGrow()` summed the **negative insets** of `::before`/`::after` and added them to the measured
box. Three things were wrong with that, in descending order of damage:

1. **No check that the pseudo is painted.** An element's `overflow` clips its own absolutely positioned
   pseudo whenever the element is that pseudo's containing block. base.css:115 says
   `.chip { … overflow: hidden; text-overflow: ellipsis }` — commented "truncates before it can
   overlap" — and polish.css:201 said `.st-jump .chip::before { position: absolute; inset: -6px }`.
   The extension was painted nowhere and hit-tested nowhere, yet the detector reported the intention:

   | | `.st-jump .chip` (Stats section chips, ×6) |
   | --- | --- |
   | CSS intent | 44 px tall hit box |
   | detector (before) | **44 x 44 → no finding** |
   | measured painted/tappable box | **32 px tall** |
   | `fix:stats r2` lane, independently, by `elementFromPoint` stepping out from the chip edges | 33 px |

   Consequence: the whole matrix returned **0 tap-target findings**, and that zero was the only
   evidence anyone had that the app's hit targets were fine.

2. **Insets summed across both pseudos.** `::before` and `::after` both at `inset: -12px` gave
   `dx = 48`, i.e. 24 px of hit area on each side that only one of them provides. Two boxes over the
   same region are a union, not a sum.

3. **No check that the insets mean what they look like.** `inset: -6px` is "6 px around this control"
   only when the control is its pseudo's containing block. On a `position: static` control the pseudo
   is laid out against some ancestor's padding box and its rect cannot be derived from the control's
   box at all — the old code derived it anyway.

## The fix

`hitBoxOf(el, r)` in detector 8, reusing the overlap detector's `clipBoxOf()` / clip-intersection
machinery (the same fact, one detector over: **what is not painted cannot be interacted with**).

* `pseudoGrow()` returns a **per-side** extension, MAXed over the two pseudos, and skips a pseudo that
  is `display: none` or `visibility: hidden` (neither is painted or hit-tested).
* `pseudoClip(el)` walks up to the pseudo's **containing block** — the nearest ancestor (the element
  included) that is positioned, transformed, filtered, `contain`ed, or a query container — and returns
  `clipBoxOf(cb)` from there. Starting at the containing block is what keeps this honest in the other
  direction: an `overflow: hidden` wrapper *between* a static control and its containing block clips
  nothing, and pretending it does would invent defects. `container-type` counts, which matters in this
  app since LAYOUT-ROOT put query containers on `.card-host`, `.card-stage`, `.card-parts`, `.run-screen`.
* The grown rect is intersected with that clip box and then **unioned with the element's own border
  box** (an element is never clipped by its own overflow), so the reported hit box is never smaller
  than the box itself.
* If the element is not its pseudo's containing block, the extension is not credited at all and the
  finding says why.
* The finding now names the reason the browser disagrees with the CSS, because "but it is 44x44 in the
  stylesheet" is the first thing the reader thinks:

  ```
  MAJOR tap-target  section.screen.stats > header.st-top > nav.st-jump > a.chip
        hit box 81.1x32 (< 44x44) — its negative-inset pseudo-element would grow the box to 93.1x44,
        but the element's own overflow clips it away, so nothing out there is painted or tappable
  ```

  `extra` carries `w`, `h`, `rawW`, `rawH`, `clippedBy` and `pseudoOffContainingBlock` for triage.

## Measurements after

**1. The plant (both engines).** `node qa/layout-audit.mjs --selftest --engine both` → **PASS**, 8/8
plants caught, clean control silent, no console noise, no plant or negative control off screen.

**2. Negative control on the detector itself** (a check that cannot fail its own defect is worthless).
Relaxing the new clip check (`const ci = pseudoClip(el)` → `null`) and re-running:

```
FAIL  MISSED tap-target (a 30x20 control whose 44px ::before hit area is clipped away)
```

The other seven plants still passed — i.e. only the new plant can see this regression, which is why the
finding asked for it.

**3. Mutation-tested on the REAL app, all three paths** (`--inject`, `--only stats`, chromium, light —
the state is served with the injected rule, nothing on disk touched):

| injected onto `.st-jump .chip` | real hit box | auditor |
| --- | --- | --- |
| `height: 32px; overflow: hidden` + `::before { inset: -6px }` (the defect as it shipped) | 32 px | **MAJOR tap-target**, 18 measurements, 1 distinct defect |
| the same with `overflow: visible` (the hatch actually works) | 44 px | **0 findings** |
| the same on a `position: static` chip inside a positioned `.st-jump` | 32 px | **MAJOR**, "the element is not that pseudo's containing block" |

Row 2 is the one that matters most: a "fix" that simply stopped counting pseudo-elements would pass the
new plant and fail here, and `#ctl-pill` on the clean page pins it under `node --test` as well.

**4. What the un-blinded detector found in the app.** `--only stats --vp 375x667,1900x1200`:

* before `fix:stats r2` landed (22:16): **24 measurements / 1 defect, MAJOR** — the six section chips,
  every viewport class, both zoom and motion passes.
* after it landed: **0 findings**, chromium **and** webkit, light **and** dark. The stats lane had
  root-caused the same chips by hand while this ticket was fixing the detector; the detector now agrees
  with their hit-test both before and after. Reported defect, independent fix, net agrees — the loop
  the harness exists for.

**5. App-wide inventory, so this fix cannot be a per-screen patch.** `qa/` scratch probe over the whole
catalog (92 states, 375x667 + 1900x1200, chromium) listing every interactive element whose 44 px hit
area depends on a negative-inset pseudo:

| element | box | on paper | painted | verdict |
| --- | --- | --- | --- | --- |
| `.st-jump .chip` ×6 (Stats) | 58.6–81.1 x **32** | 44 | **32** | the defect; now fixed by `fix:stats r2` |
| `.st-skill-drill` ("Drill 5") | 55.3 x 36 | 44 | **44** | genuinely fine (nothing clips it); `fix:stats r2` retired the hatch anyway |

Nothing else in the app buys a hit target with a negative-inset pseudo, so **no other element's
measurement changed**: with no such pseudo, `pseudoGrow()` returns `null` and the hit box is the border
box, byte-for-byte the old result. The full 184-state sweep at 375x667 + 1900x1200 (chromium, light)
after the change reports **0 findings**, i.e. the fix adds no noise while removing the blindness.

## Requests / open issues for other owners

* **State-catalog lane.** `#dock .boss-miss .btn` (polish.css §mock r2, both the
  `:root[data-kb="open"]` and the `@media (max-height: 520px)` copies) is a ~17 px link whose 48 px hit
  box is `::before { inset: -14px -8px }` *inside* `#dock .boss-miss { max-height: 44px;
  overflow: hidden }` — the one remaining place in the app where a hit area depends on a clip. No
  catalog state ever renders it (the probe never saw it, including `boss-b4-heart-lost` at the
  landscape-phone 844x390 where the `max-height: 520px` copy applies), so the auditor cannot check it
  either way. It needs a state: a boss miss with the on-screen keyboard open / at a short viewport.
* **Deliberate boundary, documented rather than fixed here:** this detector still measures an
  element's own box unclipped by its **ancestors**. A 44 px button inside an `overflow: hidden` strip
  shorter than itself would be reported as 44 px. That is a different defect class (and inside an
  `overflow: auto` scroller it is not a defect at all — the reader scrolls), so it belongs in its own
  detector with its own plant, not smuggled in here.
* No `site/` file was touched by this ticket, so nothing in the app can regress from it.

## How to re-check

```
cd /Users/oliver/Projects/unit1a-quest
node qa/layout-audit.mjs --selftest --engine both          # 8 plants, both engines, ~20 s
node --test tests/layout-audit.test.mjs                    # the same under node --test
node qa/layout-audit.mjs --only stats --engine both        # the screen the blind spot was hiding
```

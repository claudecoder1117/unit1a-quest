# The Packet — Unit 1A Quest

A gamified study site for Geometry Unit 1A (points, lines, planes, angles, vocabulary and notation, plus
the algebra review: systems, factoring, quadratics). The teacher's study packet is the game world: every
original problem is a **Card** in a **Binder**, the daily unit is **Today's Page**, the hero number is
**Readiness**. Spec: `COMPOSED.md` (product authority) and `BUILD-POLICY.md` (engineering policy — it wins
where the two disagree). Content authority: `content/SOURCE.md`.

Static site. Vanilla ES modules, CSS custom properties, inline SVG. **No build step, no framework, no
runtime dependencies, zero third-party requests.**

## Run it locally

ES modules need http (`file://` does not work):

```sh
python3 -m http.server 8090 -d site --bind 127.0.0.1
# then open http://127.0.0.1:8090/#/today
```

## Tests

```sh
node --test tests/        # or: npm test
```

Node ≥ 22. `node:test` + `node:assert/strict`, zero dependencies. The root `package.json` has
`"type": "module"` so `tests/*.test.mjs` import `site/js/*.js` and `site/data/*.js` directly.
`tests/index.js` exists only so the directory form of the command works on Node ≥ 21 (whose runner treats
positional arguments as globs); `node --test 'tests/**/*.test.mjs'` is equivalent.

Screenshots (dev-only, Playwright under `qa/`, never served):

```sh
node qa/shot.mjs "#/today" out.png --w 375 [--dark] [--click "#theme-toggle"] [--state save.json]
```

## Deploy — GitHub Pages via Actions

`.github/workflows/pages.yml` runs the tests, then uploads **`site/` and only `site/`** as the Pages
artifact and deploys it (no build — the folder ships as-is). Repository → Settings → Pages → Source must be
**GitHub Actions** (the workflow's `configure-pages` step turns it on if it is not). Push to `main` or run
the workflow by hand. GitHub serves with `Cache-Control: max-age=600`, so a push is live within 10 minutes.

All URLs in `site/` are relative (`js/app.js`, never `/js/app.js`) so the site works under
`/unit1a-quest/`. Routing is hash-based (`#/today`, `#/card/ang-10`, …) so no 404 configuration is needed.
`site/.nojekyll` stops Jekyll from touching the artifact. `site/version.js` holds the one `APP_VERSION`
constant; bump it on every deploy.

## Publication policy (non-negotiable — BUILD-POLICY §1)

- **Nothing the school or Kuta owns is ever committed or served**: no PDFs, no HTML exports, no scanned
  pages, no handwritten keys, no doc-figure PNGs. `source/`, `content/*.png` and `designs/` are git-ignored
  and stay local. No PNG from `content/` or `source/` is ever copied into `site/`.
- Figures are redrawn SVG (ours); solutions are typed step-by-step (ours) and verified against the
  teacher's numbers in `content/SOURCE.md` (our own transcription, committed). There is no "Teacher's key"
  or "Show original" toggle.
- The Pages artifact is `site/` only. The shell carries `<meta name="robots" content="noindex">` — one
  student's study app, not a search result.
- Everything runs and saves locally (`localStorage["u1a.save"]`); nothing is sent anywhere.

## Layout

```
package.json          {"type":"module"} — inert on Pages; lets tests import site/js as ESM
.github/workflows/    pages.yml — test job gates the deploy job
COMPOSED.md           product spec (authority)      BUILD-POLICY.md  engineering policy (overrides)
content/SOURCE.md     content authority (NOT served)
tests/*.test.mjs      node --test
qa/                   Playwright screenshot driver (NOT served)
notes/<ticket>.md     what each build ticket built, its exported API, how to test, open issues
site/                 ← the Pages artifact, nothing else is ever served
  index.html version.js manifest.webmanifest .nojekyll
  css/   theme.css (every colour token, light + dark) base.css components.css figure.css motion.css widgets.css screens.css
  js/    app.js (router, mount, bus, theme, header) store.js (save) days.js (local dates) …
  js/screens/  one module per screen, registered in screens/index.js
  data/  cards.js (index over cards/<sheet>.js) skills.js modules.js …
  assets/icons/  SVG icons (a protractor arc)
```

See `notes/T01.md` for the shell/router/save API every other module builds on.

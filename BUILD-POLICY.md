# BUILD POLICY — overrides COMPOSED.md where they conflict

COMPOSED.md is the product spec (authority). This file is the engineering policy every build ticket follows. When COMPOSED.md and this file disagree, THIS FILE WINS.

## 1. Publication policy (non-negotiable)
- Nothing owned by the school or by Kuta is ever committed or served: no PDFs, no HTML exports, no scanned pages, no handwritten keys, no doc figure PNGs. `source/`, `content/*.png`, `designs/` are git-ignored. Do not copy any PNG from `content/` or `source/` into `site/`.
- Therefore: **there is no "Teacher's key" toggle and no "Show original" toggle.** Drop `teacherKey`, `orig`, `crop`, T04b, `keys.test.mjs`, the `site/content/` folder and the "13 PNGs" everywhere they appear. Figures are redrawn SVG (our own); solutions are typed step-by-step `solution[]` (our own) verified against the teacher's numbers in `content/SOURCE.md`.
- `content/SOURCE.md` is the content authority and IS committed (it is our transcription). `content/transcript.md` (T00) is also committed.
- The Pages artifact is `site/` only, deployed by `.github/workflows/pages.yml` (GitHub Actions source). `<meta name="robots" content="noindex">` stays.

## 2. Repo layout and ownership
- Paths in COMPOSED.md S6 apply. Root `package.json` is `{"name":"unit1a-quest","private":true,"type":"module","scripts":{"test":"node --test tests/"}}`.
- Data is split by sheet so tickets never edit the same file: `site/data/cards/m1.js`, `cards/angles.js`, `cards/doc.js`, `cards/wp.js`, `cards/asn.js`, `cards/fac.js`; `site/data/cards.js` re-exports them all as one array + a `byId` map. Templates: `site/data/templates.js` registers generators by importing `site/js/gen/*.js`.
- CSS: `site/css/{theme,base,components,figure,motion,widgets,screens}.css`, all linked from `index.html` by T01. Widget tickets append to `widgets.css`; screen tickets append to `screens.css`. Append only; never rewrite another ticket's block; wrap your block in `/* === T08a === */ ... /* === /T08a === */`.
- **Each ticket may create/modify only the files it owns (listed in its prompt).** If you need a change in a file you do not own, write the exact request in `notes/<ticket>.md` under "Requests" and, if the change is a one-line addition (an import, a route entry, a CSS link), you MAY make it — mark it in the note.
- Every ticket ends by writing `notes/<ticket>.md`: what was built, the exported API (function signatures), how to test, open issues, requests for other owners. Later tickets read the notes of the tickets they depend on FIRST.
- No `Math.random` under `site/js`. No third-party runtime dependencies. ES modules only (`.js`). All URLs relative. No build step.
- Fonts: system stack in v1 (`Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif` and `JetBrains Mono, SFMono-Regular, Menlo, Consolas, monospace`). Self-hosted subsetting (T15) is optional polish, never a blocker; zero third-party requests either way.

## 3. Testing
- `node --test tests/` from the repo root must be green after every ticket. Run it before you finish. If a test outside your ticket breaks because of your change, fix your change (do not delete or skip the test).
- Node 26 is installed; use `node:test` + `node:assert/strict`.
- Local server for manual checks: `python3 -m http.server 8090 -d site --bind 127.0.0.1` (there is a Playwright install under `qa/` — `qa/shot.mjs` takes screenshots; see notes/T01.md).

## 4. Watchdog rules for agents
- Keep tool calls flowing; never sleep more than 20 s in one call; never chain more than one screenshot per Bash call. Long-running commands go to the background.
- If a command is denied, do not retry it verbatim; note it in your ticket note and continue.
- Time budget: one ticket = one sitting. Ship a working, tested slice over a perfect unfinished one; list what is missing in the note.

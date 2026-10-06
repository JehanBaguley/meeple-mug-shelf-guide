# AGENTS.md

## What this is
Shelf Guide for Meeple & Mug, a board game cafe in Brisbane: a static catalogue so someone at the shelf finds a playable game in under thirty seconds. This is the cafe's live instance. The reusable template is Pickmark (`../pickmark`). Live at https://jehanbaguley.github.io/meeple-mug-shelf-guide/

## Stack
Single-file vanilla JS (`index.html`), no framework, no dependencies. Node 22 build scripts, GitHub Actions, GitHub Pages. Data from a Google Sheet plus BoardGameGeek. Playwright browser tests. PWA (`sw.js`, `manifest.webmanifest`).

## Folders
- `index.html` the app; `config.js` venue identity and theme (strict JSON inside).
- `scripts/` nightly `build-data.mjs`, `fetch-bgg-cats.mjs`, `check-setup.mjs`.
- `data/` built catalogue (`games.json`), BGG snapshots, `gaps.json`/`gaps.csv`.
- `tests/` regression harnesses (`tests/README.md` maps each). `.github/workflows/` nightly sync, tests, canary.

## Commands
- Serve: `python3 -m http.server 8899` from the repo root.
- Test: `node tests/chkNN.mjs` for one harness, or run all `tests/chk*.mjs` (needs `playwright`; see `.github/workflows/tests.yml`). chk34 and chk35 need no browser.
- Build data: `node scripts/build-data.mjs` (needs `SHEET_CSV_URL`, `BGG_TOKEN`).
- Setup check: `node scripts/check-setup.mjs`.

## Rules
Read `.github/copilot-instructions.md` before changing anything; it holds the invariants. Key ones:
- The sheet is the shelf: BGG enriches sheet rows and never adds a game.
- Join on `bggId`, not name. The cafe's category order and spelling win; Expansion is a pill, not a genre.
- `catSlugFor` exists in both `index.html` and `scripts/build-data.mjs`; keep them identical.
- In `config.js`, an empty string means deliberately none; check `!== undefined`, never use `||`. No real venue details as fallbacks in shared code.
- `sw.js`, `scripts/build-data.mjs`, `scripts/fetch-bgg-cats.mjs` must stay byte-identical with Pickmark.
- Theme colour must agree in `config.js`, the `theme-color` meta tag and `manifest.webmanifest`.
- Do not change the `"name|field"` line shape of `data/gaps.csv`; the sheet depends on it.
- Never publish an empty or partial catalogue. Do not add `?t=Date.now()` cache-busting.
- Verify in a real browser (count games, no duplicates, categories map, console clean) or say it is unverified.
- Read `CONTINUITY.md` (cafe-facing) before changing hand-over, hosting or failure behaviour.
- Never paste a token into a shell command. Never commit secrets, tokens or private data.

## Standards
- UI: WCAG 2.2 AA minimum, including focus visible, target size and reduced motion. WAI-ARIA APG patterns for interactive components. Open UI names for new components where one exists.
- AGENTS.md is the agent instructions file; CLAUDE.md only points to it.
- Commits use Conventional Commits 1.0 (the nightly bot's "Nightly data sync" commits are the exception).

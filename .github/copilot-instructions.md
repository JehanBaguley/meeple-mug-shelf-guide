# Working on the Meeple & Mug Shelf Guide

Read this before changing anything. It exists because a long agent session once
broke the live site by making a series of individually reasonable-looking changes,
none of which were checked against the invariants below.

## What this thing is for

Someone is standing at a shelf in a board game café. They have about thirty seconds
to find a game they can play right now. That is the whole product. Every change is
judged against that, not against code tidiness.

## The invariants. Do not violate these.

**The sheet is the shelf.** `data/games.json` is built from the café's Google Sheet.
BoardGameGeek *enriches* rows that already exist in the sheet. BGG must never add a
game. If a game is not in the sheet it is not in the café, and putting it on the site
tells a customer to come in for something that is not there. The build enforces this
by dropping any collection entry no sheet row claimed; do not remove that filter.

**The first category sets the spine colour.** The café's category order is hand
curated. Never overwrite it, never reorder it, never append BGG's raw category
vocabulary into it. BGG's tags ("Expansion for Base-game", "Movies / TV / Radio
theme", "Post-Napoleonic") have no colour mapping and render as blank chips.
New genre chips are allowed only at three or more games, and only after the café
has seen the list.

**Expansion is a pill, not a genre.** It renders next to the title. It must never
appear as a category chip.

**`catSlugFor` exists twice**, once in `index.html` and once in `scripts/build-data.mjs`.
They must stay identical or a game gets one colour in the baked data and a different
one after the live sheet overlay lands. If you change one, change both, and check
every category in the live sheet still maps to a slug.

**The join key is `bggId`, not the name.** BGG and the café spell the same box
differently ("Tainted Grail: Kings of Ruin" versus "Tainted Grail - Kings of Ruin").
Matching on name alone produces two cards for one game. Resolve the sheet's
`bgg_link` to an id first, fall back to the name second, and let the café's spelling
win on output.

## How to verify a change

Do not report a change as working because a script exited zero, because a file was
written, or because a syntax check passed. None of those tell you the site is right.
A change is verified when you have:

- counted the games in `data/games.json` and confirmed it matches the sheet's row count
- confirmed no duplicate names
- confirmed every category still maps to a colour slug
- loaded the page in a real browser and read the console

If you cannot do those, say the change is unverified. That is a useful thing to say.

## Things that are not improvements

- **Cache-busting `?t=Date.now()` on `data/games.json`.** It defeats the CDN and makes
  every visit slower. The nightly build changes the file; the CDN handles it.
- **A schema-mismatch warning banner.** This is a customer-facing page in a café. Staff
  problems belong in the build log, not on the shelf guide.
- **Rewriting the Google Sheet's column order from a script.** The sheet is the café's
  working document and people are typing into it. Read it defensively instead; the
  parser already maps columns by header name, so order does not matter.
- **Reordering the merge so BGG beats the sheet.** Availability, price, blurb, picks and
  categories are the café's, and only the café knows them.

## Practical notes

- Deploys go through GitHub. Test locally first, then push.
- Never paste a token into a shell command; it lands in shell history. Use a repo secret.
- `data/bgg.json` is the committed ratings map and is a real input to the build. It is
  not a stale leftover.
- If the live sheet fetch fails at build time, keep the previous catalogue. Never publish
  an empty or partial one.

## Layers added since the sections above were written

- **`config.js` is the template layer.** The site and the build both read it; the object
  inside is strict JSON. An **empty string is a deliberate "none"** (`"sheetCsvUrl": ""`
  means no sheet overlay, `"bggUser": ""` means no collection). The code checks
  `!== undefined`, not truthiness; do not "simplify" those checks to `||` or an empty
  config value silently falls back to Meeple & Mug's identity, sheet included.
- **`tests/` is the regression suite and CI runs it** (`.github/workflows/tests.yml`) on
  any push touching `index.html`, `config.js` or `tests/`. Run the suite locally against
  the exact bytes you intend to deploy before pushing. tests/README.md maps what each
  harness guards.
- **`sw.js` is the service worker.** Navigations, `config.js` and `data/` are
  network-first, so deploys land on the next load with no version dance; only fonts and
  icons are cache-first. Bump `VERSION` only if you need to force old caches out.
- **The build publishes `data/gaps.json` and `data/gaps.csv`.** The café's sheet
  IMPORTDATAs the CSV and its conditional-format rules key off the quoted `"name|field"`
  line shape. Changing that format silently breaks the amber flags in the sheet.

## When you are unsure

Say so and stop. A half-applied change to a live catalogue is worse than no change.
Batch your questions rather than asking one at a time.

# Meeple & Mug Catalogue

Static catalogue for the café: every game in the building, filterable, with
play availability, for-sale stock, staff badges and member pick lists. Built
for GitHub Pages, no build step, vanilla JS in a single `index.html`.

Live site: https://jehanbaguley.github.io/meeple-mug-shelf-guide/

## How data flows

1. **The master list is the café's Google Sheet** (the `data` tab). The full
   play library — transcribed from the printed shelf list — lives there, one
   row per game. Staff edit the sheet; the site fetches it as CSV on every
   page load, so status/price/pick changes appear near-live. The same data is
   embedded in `index.html` as a fallback for when the fetch fails.
2. **BGG ratings are optional gravy.** `.github/workflows/sync-data.yml` runs
   nightly; once the café creates a BoardGameGeek account (set `BGG_USER` in
   `scripts/build-data.mjs`) it merges community ratings and complexity
   weights into `data/games.json`. Until then it skips quietly.
3. The published CSV URL is set in two places: the `SHEET_CSV_URL` constant in
   `index.html`, and the repo Actions variable `SHEET_CSV_URL`.

## Sheet columns (one row per game; repeat a game's name on extra rows to add it to more pick lists)

| column | values |
|---|---|
| name | game title (must match between rows) |
| playable | yes / no — can punters play it in the café |
| status | On shelf / Out / Borrowed — anything not starting with "On" drops it from Play here |
| for_sale | yes / no |
| expansion | yes / no — marks an expansion rather than a base game |
| price | whole dollars, used for sorting and filtering |
| price_text | optional display price overriding the number, e.g. "$80–110" for dice pricing |
| rating | optional BGG rating; the build pipeline can auto-fill this from `bgg_link` |
| bgg_link | optional BGG game URL used to match ratings, categories and extra stats |
| players | "2-5", "3+", "2" |
| age | "10+" |
| time | "30-45 mins", "90 mins", "Varies" |
| category | e.g. "Strategy, Economic" — drives the genre filter chips and card colour |
| play_style | co-op / teams / competitive |
| blurb | optional one-line description shown on the card |
| pick_by | staff name, renders as "Name's pick" on the card |
| pick_note | one-liner shown when that pick list is selected |
| rec_list | list name, e.g. "Ollie's picks" (becomes a chip) |
| rec_note | one-liner shown when that list is selected |
| notes | internal flags or sheet comments; not shown on the card |
| rules_link | optional external link to rules or a how-to-play video |

## Fixing a mis-ordered export

If staff reorder or accidentally export the sheet with columns moved, the site will mis-read columns. Use the included helper script to fetch the published CSV and write a corrected version.

Run:

```bash
SHEET_CSV_URL="<published CSV URL>" node scripts/fix-sheet-order.mjs
```

The script writes `data/sheet-fixed.csv`. Inspect that file and, if correct, use it as your source when running the nightly build or re-publish the sheet in the correct column order.

Optional: install an Apps Script that auto-repairs the header
-----------------------------------------------------------
If the sheet is frequently edited by staff and columns get moved, you can install a small Apps Script that repairs the header row in-place (preserving the sheet GID used by published CSV URLs).

- Copy `scripts/google-sheets-fix-header.gs` into the Google Sheet's Apps Script editor (Extensions → Apps Script), save.
- Run `runOnce()` from the editor to test. The script also exposes a `Sheet Tools` menu with `Repair header order` and includes a lightweight `onEdit` handler that repairs when the header row is changed.
- If your workflow requires it, create an installable `onEdit` or `onOpen` trigger in the Apps Script editor to ensure the script has the permissions you need.

Keep the `CANONICAL_HEADERS` array in the Apps Script in sync with `sheet-template.csv` in this repo if you add/remove columns.


## Buy and Request buttons

"Buy · $X" on for-sale stock (the café's retail shelf — mark rows for_sale in the
sheet), "Request a copy" on play-only games. Retail-only stock lives in the same
sheet with playable set to no. With no
backend, taps open one of:
1. **Google Form (recommended):** make a form with Game and Type fields, grab
   a pre-filled link, swap the answers for `{game}` and `{type}`, paste it
   into `REQUEST_URL_TEMPLATE` in index.html. Responses land in a Sheet.
2. **Email fallback:** set `CAFE_EMAIL` and taps open a pre-filled email.

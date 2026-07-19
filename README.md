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
| price | whole dollars, shows as the Buy button |
| players | "2-5", "3+", "2" |
| age | "10+" |
| time | "30-45 mins", "90 mins", "Varies" |
| category | e.g. "Strategy, Economic" — drives the genre filter chips and card colour |
| play_style | co-op / teams / competitive |
| badge_by | staff name, renders as "Name's pick" on the card |
| badge_note | one-liner shown on the card |
| rec_list | list name, e.g. "Ollie's picks" (becomes a chip) |
| rec_note | one-liner shown when that list is selected |
| check | transcription flags — cells to verify against the shelf, ignored by the site |

## Buy and Request buttons

"Buy · $X" on for-sale stock, "Request a copy" on play-only games. With no
backend, taps open one of:
1. **Google Form (recommended):** make a form with Game and Type fields, grab
   a pre-filled link, swap the answers for `{game}` and `{type}`, paste it
   into `REQUEST_URL_TEMPLATE` in index.html. Responses land in a Sheet.
2. **Email fallback:** set `CAFE_EMAIL` and taps open a pre-filled email.

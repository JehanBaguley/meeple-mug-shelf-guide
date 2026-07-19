# Meeple & Mug Catalogue

Static catalogue for the café: every game in the building, filterable, with
"Play here" vs "For sale", staff badges and member pick lists. Built for
GitHub Pages, no build step, vanilla JS in a single `index.html`.

## How data flows

1. **Play library** comes from the café's public BGG collection
   (user `meepleandmug`). `.github/workflows/sync-data.yml` runs nightly,
   fetches the collection with stats (handling BGG's 202 queue with retries),
   and commits `data/games.json`. The site prefers that file when present.
2. **Shop + human layer** comes from one Google Sheet the café edits.
   Import `sheet-template.csv` into Google Sheets, then File → Share →
   Publish to web → that tab as CSV. Put the published CSV URL in two places:
   - repo Settings → Variables → `SHEET_CSV_URL` (for the nightly merge)
   - `SHEET_CSV_URL` constant at the top of `index.html` (for near-live
     status updates when the page loads)
3. Until either source is connected, the site runs on embedded demo data:
   51 shelf games with full stats and prices, 257 library titles with stats
   pending, plus sample pick lists.

## Sheet columns (one row per game; repeat a game to add it to more lists)

| column | values |
|---|---|
| name | must match the BGG title |
| playable | yes / no |
| for_sale | yes / no |
| price | whole dollars |
| status | On shelf / Out / Borrowed |
| play_style | co-op / teams / competitive |
| badge_by | staff name, renders as "Name's pick" |
| badge_note | one-liner shown on the card |
| rec_list | list name, e.g. "Ollie's picks" (becomes a chip) |
| rec_note | one-liner shown when that list is selected |

## Deploy

Push to a public repo, enable GitHub Pages (main branch, root), run the
"Sync catalogue data" action once from the Actions tab to populate stats.

## Buy and Request buttons

Cards carry real actions: "Buy · $X" on shelf stock, "Request a copy" on
play-only games. With no backend, taps open one of:
1. **Google Form (recommended):** make a form with Game and Type fields,
   grab a pre-filled link, swap the answers for `{game}` and `{type}`, and
   paste it into `REQUEST_URL_TEMPLATE` in index.html. Responses land in a
   Sheet, so purchase requests join the data the café already manages.
2. **Email fallback:** set `CAFE_EMAIL` and taps open a pre-filled email.

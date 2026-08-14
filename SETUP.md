# Make this your own shelf

This repo is a template. One config file gives you your own browsable catalogue —
for a café, a club, or the shelf in your lounge room — with stats that keep
themselves up to date from BoardGameGeek. No backend, no hosting bill, nothing to
maintain once it's running.

Fifteen minutes, five steps.

## 1. Get your copy

Click **Use this template** (or Fork) on GitHub, name it, then in your new repo's
settings turn on **Pages** (Settings → Pages → deploy from branch → main, root).
Your site will live at `yourname.github.io/your-repo-name`.

## 2. Make your sheet

Create a Google Sheet with a tab named `data`. Copy the header row from
[the template sheet](https://github.com/JehanBaguley/meeple-mug-shelf-guide/blob/main/sheet-template.csv):

```
name, bgg_link, playable, for_sale, price, blurb, pick_by, pick_note, rating,
play_style, expansion, players, age, time, category
```

You only ever type the first seven kinds of thing (name, BGG link, playable,
for sale, price, blurb, picks). Everything else arrives from BoardGameGeek
overnight. Blank cell = trust BGG; typed cell = you win.

Then File → Share → **Anyone with the link: Viewer**, and note your sheet id
(the long string in the URL).

## 3. Edit config.js

The only file you need to touch. Every field is explained in its comments:
your name, the small line above the title, the tagline, contact link, your
sheet's CSV feed (swap your sheet id into the URL pattern already there), and
optional theme colours. Set `"sheetCsvUrl": ""` if you just want a static list
with no sheet, and `"bggUser": ""` if you don't have a BGG collection.

Also replace `icon.png` with your own favicon, and (optional, for nice social
link previews) update the half-dozen `<meta>` lines at the top of `index.html` —
they're the only identity strings the config can't reach, because social
crawlers don't run JavaScript.

## 4. Wire the nightly build

In your repo: Settings → Secrets and variables → Actions.
Add a **variable** `SHEET_CSV_URL` with the same CSV URL from config.js.
Optionally add a **secret** `BGG_TOKEN` (a BoardGameGeek application token) for
more reliable stat fetching; without it the build still works, just more gently.

Then Actions → "Sync catalogue data" → **Run workflow**. From then on it runs
itself nightly at 3am AEST (edit the cron in
`.github/workflows/sync-data.yml` for your timezone).

## 5. Print a QR code

Point any QR generator at your Pages URL. That's the whole deployment.

## Rules the template lives by

- **The sheet is the shelf.** Rows not in the sheet don't exist on the site.
- The build refuses to publish if data coverage collapses — a broken sync gives
  you yesterday's good data, not a broken site.
- Missing data flags itself amber in the sheet and clears itself when filled
  (see GUIDE.md for the two-minute staff version).
- If you display BGG data publicly, keep the BoardGameGeek attribution in the
  footer — their API terms require it, and it's non-commercial by default.

## Not board games?

The only BGG-specific code is the enrichment in `scripts/build-data.mjs` and the
genre vocabulary. Everything else — the sheet contract, overrides, self-flagging,
filters, the site — is collection-agnostic. Swapping the enricher for another
metadata API (Open Library for books, Discogs for records) is a contained change.

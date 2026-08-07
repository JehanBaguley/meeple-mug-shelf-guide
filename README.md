# Meeple & Mug — Shelf Guide

Static catalogue for the café. Someone standing at the shelf should find a game they can
play right now in under thirty seconds, without reading the back of every box.

Live: https://jehanbaguley.github.io/meeple-mug-shelf-guide/

Single-file vanilla JS, no build step, no framework, no dependencies. GitHub Pages serves
`index.html` as-is.

## The one rule

**The sheet is the shelf.** The café's Google Sheet decides which games exist. BoardGameGeek
fills in the details. BGG never adds a game, because a game that isn't in the sheet isn't in
the café, and putting it on the site sends a customer in for something that isn't there.

The build enforces this: any BGG collection entry that no sheet row claimed gets dropped.
If you find yourself removing that filter, you are about to publish a catalogue of games the
café doesn't own.

## How the data flows

There are three sources and they layer in this order, each one only filling what the last
one left empty.

**BoardGameGeek** supplies rating, complexity weight, player count, play time, minimum age,
categories and mechanics. Two endpoints feed it. The nightly workflow reads the café's BGG
collection for live stats. Separately, `scripts/fetch-bgg-cats.mjs` reads BGG's `thing`
endpoint and writes `data/bgg-cats.json`, a committed snapshot of categories, mechanics,
player count, length, age and a fallback description. The snapshot matters because the
collection endpoint is the one that goes down, and the sheet no longer holds a hand-typed
copy of any of it.

**The Google Sheet** supplies everything BGG can't know: whether it's on the shelf, whether
it's for sale, the price, the blurb, and staff picks. It also overrides BGG on any field
where someone has typed something. A blank cell means "trust BGG". A filled cell wins.

**`data/games.json`** is the baked result, committed nightly. The page loads it instantly,
then re-fetches the live sheet in the browser and re-applies the overlay, so a price change
in the sheet shows up on the next page load without a deploy.

## The sheet

One row per game. Only the first group needs filling in.

| column | what it's for |
|---|---|
| name | the title as the café says it. This wins over BGG's spelling on the card. |
| bgg_link | the `boardgamegeek.com/boardgame/NNN` URL. This is the join key, so it matters more than anything else here. |
| playable | yes / no. No means retail stock, not on the play shelf. |
| for_sale | yes / no |
| price | whole dollars, or a range like `$80–110` |
| blurb | the "plays like X" one-liner. The single most useful thing on a card, and the one field worth writing by hand. |
| pick_by / pick_note | staff name and a one-liner, renders as "Name's pick" |

Everything below is an **override**. Leave it blank and BGG supplies it. Type in it and
yours wins.

| column | override for |
|---|---|
| rating | BGG community average |
| players | `2-5`, `3+`, `2` |
| age | `10+` |
| time | `30-45 mins` |
| category | comma separated. **The first one sets the card's spine colour**, so put the truest one first. |
| play_style | co-op / teams / competitive. Derived from BGG's mechanics when blank. |
| expansion | yes. Renders as a pill beside the title, never as a genre chip. |

Columns that exist but nothing reads: `status`, `notes`, `rules_link`, `price_text`,
`rec_list`, `rec_note`. Safe to delete. Harmless to leave.

## Genre chips

BGG's category vocabulary and the café's are folded together through `TAG_ALIAS` in
`index.html`, so "Party Game" and "Party" don't both appear on one card. A genre only earns
a chip once **five or more games** share it (`TAG_MIN`); below that the tag is still stored
and searchable, it just doesn't clutter the card. Cards show up to four chips.

Chip colour signals a family, not an identity. Eleven families, because nobody can tell
forty-eight hues apart but "amber is loud, blue is think-y, green is everyone on the same
side" reads at arm's length. `catSlugFor` does the mapping and every category must land in
one of them.

## Safety rails

The build **refuses to publish a catalogue whose coverage collapsed**. If a source goes down
mid-build and player counts or ratings drop by more than a fifth against what's already
live, it exits non-zero and leaves `data/games.json` untouched. A slightly stale shelf guide
beats one where every filter is broken.

`.github/copilot-instructions.md` holds the invariants for anyone, human or agent, changing
this repo. Read it before touching the build.

## Files

| path | what it is |
|---|---|
| `index.html` | the whole app: markup, styles, logic |
| `scripts/build-data.mjs` | nightly build, sheet plus BGG into `data/games.json` |
| `scripts/fetch-bgg-cats.mjs` | one-off enrichment, writes `data/bgg-cats.json` |
| `data/games.json` | the baked catalogue the page loads first |
| `data/bgg-cats.json` | committed BGG snapshot, the durable fallback |
| `data/bgg.json` | committed ratings map, keyed by name |
| `.github/workflows/sync-data.yml` | the nightly, 3am AEST |

## Config

`SHEET_CSV_URL` is set in two places and both need to agree: the constant in `index.html`
and the repo Actions variable. `BGG_TOKEN` is a repo secret. Never put it in a shell
command, it lands in your history.

## Buy and Request

No backend. "Buy · $X" on for-sale stock and "Request a copy" on play-only games both open
the café's contact page. Set `REQUEST_URL_TEMPLATE` in `index.html` to point at a Google
Form instead if you want responses landing in a sheet.

## Licensing note

BGG's XML API terms are non-commercial. This site sorts by price and routes people toward
buying a copy. Worth emailing BGG for permission for this use rather than assuming.

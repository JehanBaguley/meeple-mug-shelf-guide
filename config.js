// Shelf Guide — instance configuration.
// -------------------------------------
// This is the ONLY file a new shelf needs to edit. Keep the object below as
// strict JSON (double quotes, no comments inside it, no trailing commas):
// the nightly build script reads this same file.
//
// name         the venue or person the shelf belongs to
// guideName    what the catalogue calls itself (shown after the name)
// kicker       the small line above the title (address, or anything)
// tagline      the line under the title
// siteUrl      where the name in the footer links to
// contactUrl   where Buy / Request a copy sends people
// contactEmail fallback if contactUrl is ever blank (opens a pre-filled email)
// sheetCsvUrl  your Google Sheet's CSV feed: File > Share > publish is NOT
//              needed; use the gviz form below with your own sheet id
// bggUser      BoardGameGeek username whose collection seeds live stats
// colors       optional theme overrides, any of: bg, bg-deep, card, card-edge,
//              timber, timber-light, red, amber, ink, ink-soft, cream, muted
window.SHELF_CONFIG =
{
  "name": "Meeple & Mug",
  "guideName": "Shelf Guide",
  "kicker": "63 Hardgrave Rd · West End · Brisbane",
  "tagline": "Every game we’ve got. Play one here, or take a new copy home.",
  "siteUrl": "https://www.meepleandmug.com.au",
  "contactUrl": "https://www.meepleandmug.com.au/contact",
  "contactEmail": "admin@meepleandmug.com.au",
  "sheetCsvUrl": "https://docs.google.com/spreadsheets/d/1PuwiRbEurcLIG8YOUGzk6aBT5XMR9b9sVRWdrKw1pSQ/gviz/tq?tqx=out:csv&headers=1&sheet=data",
  "bggUser": "meepleandmug",
  "colors": {}
};

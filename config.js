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
// colors       this venue's theme. The shipped default is the Pickmark palette;
//              everything here overrides it. Keys: bg, bg-deep, card, card-edge,
//              timber, timber-light, red, amber, ink, ink-soft, cream, muted,
//              link, ok, warn, line
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
  "colors": {
    "bg": "#123a24", "bg-deep": "#0c2a19",
    "card": "#f4ead2", "card-edge": "#dccdaa",
    "timber": "#c9a06b", "timber-light": "#dcb98a",
    "red": "#c8452e", "amber": "#d8d848",
    "ink": "#2b2419", "ink-soft": "#6b6150",
    "cream": "#ece5d3", "muted": "#9dc0a8",
    "link": "#7a4d12", "line": "rgba(236,229,211,.16)"
  }
};

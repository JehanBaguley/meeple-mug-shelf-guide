// "Check my setup", for somebody who has just forked this and cannot tell what is wrong.
//
// Run it from the Actions tab. It reads the same things the nightly build reads, in the
// same order, and says in plain words what it found. It is deliberately chatty: the
// whole point is that a person who has never seen this code can act on the output.
//
// Exit code is 1 only for things that are actually broken. Suggestions do not fail it.
import { readFileSync, existsSync } from "node:fs";

const problems = [], warnings = [], notes = [];
const P = (s) => problems.push(s);
const W = (s) => warnings.push(s);
const N = (s) => notes.push(s);

const line = (s = "") => console.log(s);
const head = (s) => { line(); line(s); line("-".repeat(s.length)); };

head("1. config.js");

let cfg = null;
if (!existsSync("config.js")) {
  P("config.js is missing. It is the one file a fork has to edit.");
} else {
  const t = readFileSync("config.js", "utf8");
  try {
    cfg = JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1));
    line("config.js parses cleanly.");
  } catch (e) {
    // By far the most common fork problem, and the browser console message for it is
    // useless unless you already know what you are looking at.
    P(`config.js is not valid JSON: ${e.message}. Usually a trailing comma, a smart quote pasted from a document, or an unescaped " inside a name.`);
  }
}

if (cfg) {
  const shown = (k) => (cfg[k] || "").toString().trim();
  for (const k of ["name", "guideName", "tagline"]) {
    if (shown(k)) line(`${k.padEnd(12)} ${shown(k)}`);
    else W(`config.js has no ${k}. The page will still work, it will just look unfinished.`);
  }
  for (const k of ["siteUrl", "contactUrl", "contactEmail"]) {
    if (!shown(k)) N(`config.js has no ${k}. Fine if you do not want one, but "Buy" and "Request a copy" have nowhere to send people.`);
  }
  const cols = cfg.colors || {};
  const badHex = Object.entries(cols).filter(([, v]) =>
    typeof v === "string" && !/^#[0-9a-f]{3,8}$/i.test(v.trim()) && !/^rgba?\(/i.test(v.trim()));
  if (badHex.length) P(`These theme colours are not colours: ${badHex.map(([k, v]) => `${k}=${v}`).join(", ")}`);
  else if (Object.keys(cols).length) line(`${Object.keys(cols).length} theme colours set.`);

  // Pre-runtime surface. The manifest and the meta tag are read before any JavaScript
  // runs, so config cannot reach them, which is exactly why they drift.
  if (cols.bg && existsSync("manifest.webmanifest") && existsSync("index.html")) {
    const manifest = JSON.parse(readFileSync("manifest.webmanifest", "utf8"));
    const meta = (readFileSync("index.html", "utf8").match(/<meta name="theme-color" content="([^"]+)"/) || [])[1];
    const same = (a, b) => (a || "").toLowerCase() === (b || "").toLowerCase();
    if (!same(cols.bg, manifest.theme_color) || !same(cols.bg, meta)) {
      W(`Your address bar colour will not match your theme. config.colors.bg is ${cols.bg}, manifest.theme_color is ${manifest.theme_color}, the theme-color meta tag is ${meta}. These three cannot be driven from config, because a phone reads them before the page runs. Set all three by hand.`);
    } else line("Address-bar colour agrees with the theme.");
  }
}

head("2. Your sheet");

const SHEET = (process.env.SHEET_CSV_URL || (cfg && cfg.sheetCsvUrl) || "").trim();
if (!SHEET) {
  N('No sheet configured, so the site will show whatever is committed in data/games.json and never change. That is a valid setup. If you did not mean it, set "sheetCsvUrl" in config.js.');
} else {
  try {
    const host = new URL(SHEET).host;
    const id = (SHEET.match(/\/d\/([^/]+)/) || [])[1] || "";
    line(`Feed host   ${host}`);
    line(`Sheet id    ${id.slice(0, 6)}…${id.slice(-4)}`);
  } catch { P(`sheetCsvUrl is not a URL: ${SHEET.slice(0, 40)}`); }

  let body = null;
  try {
    const res = await fetch(SHEET);
    line(`HTTP        ${res.status}`);
    if (res.status === 401 || res.status === 403) {
      P('Your sheet is not readable. In Google Sheets: Share, then General access, then "Anyone with the link", role Viewer. This is the single most common reason a shelf stops updating, and it looks like nothing is wrong from inside the spreadsheet.');
    } else if (!res.ok) {
      P(`The sheet feed answered ${res.status}. If that is a 404 the sheet id is wrong or the sheet was deleted.`);
    } else body = await res.text();
  } catch (e) {
    P(`Could not reach the sheet at all: ${e.message}`);
  }

  if (body != null) {
    if (/^\s*<(!doctype|html)/i.test(body)) {
      P("The feed returned a web page, not a spreadsheet. That is Google's sign-in page, which means the sheet is not shared publicly. Paste your sheetCsvUrl into a private browser window: you should get a CSV download, not a login screen.");
    } else {
      const rows = body.trim().split("\n");
      const head0 = (rows[0] || "").split(",").map(h => h.replace(/^"|"$/g, "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "_"));
      line(`Rows        ${Math.max(0, rows.length - 1)} below the header`);
      line(`Columns     ${head0.filter(Boolean).join(", ")}`);

      if (!head0.includes("name")) {
        P('That sheet has no "name" column, so the build cannot read it. Columns are matched by heading, not by position: check the spelling on the first row, and check the feed is pointing at the right tab.');
      }
      const WANT = { bgg_link: "BGG links", playable: "playable here", for_sale: "for sale", price: "prices", blurb: "blurbs", pick_by: "staff picks" };
      const absent = Object.entries(WANT).filter(([k]) => !head0.includes(k)).map(([, label]) => label);
      if (absent.length) N(`No column for: ${absent.join(", ")}. Normal on a new shelf. Add the headings from sheet-template.csv when you want those features.`);

      const KNOWN = new Set(["name", "bgg_link", "playable", "for_sale", "price", "price_text", "blurb", "status",
        "pick_by", "pick_note", "badge_by", "badge_note", "rec_list", "rec_note",
        "rating", "play_style", "expansion", "players", "age", "time", "category"]);
      const odd = head0.filter(h => h && !KNOWN.has(h));
      if (odd.length) W(`Columns the build ignores: ${odd.join(", ")}. Harmless, unless one of them was meant to do something, in which case the heading is misspelled.`);

      // The trap that cost a whole column silently. Google's feed gives one type per
      // column: put 65 and ~$80 in the same price column and it returns the numbers and
      // drops the text, with no error and nothing in any log.
      const i = (k) => head0.indexOf(k);
      if (i("for_sale") > -1 && i("price") > -1) {
        let sold = 0, unpriced = 0;
        for (const r of rows.slice(1)) {
          const c = r.split(",").map(x => x.replace(/^"|"$/g, "").trim());
          if (/^y/i.test(c[i("for_sale")] || "")) { sold++; if (!(c[i("price")] || "")) unpriced++; }
        }
        line(`For sale    ${sold}, of which ${unpriced} have no price`);
        if (unpriced) {
          W(`${unpriced} game${unpriced > 1 ? "s are" : " is"} marked for sale with no price coming through. Either the cell is genuinely empty, or your price column mixes text and numbers. Google's feed picks one type per column and silently blanks the rest, so "65" and "~$80" in the same column means the ~$80 rows come back empty. Pick one format for the whole column.`);
        }
      }
    }
  }
}

head("3. BoardGameGeek");

const USER = (process.env.BGG_USER || (cfg && cfg.bggUser) || "").trim();
if (!USER) {
  N("No BGG username set, so ratings, weights, player counts and times come only from what you type or from the committed snapshot. That is fine.");
} else {
  line(`Collection  ${USER}`);
  if (!process.env.BGG_TOKEN) W("No BGG_TOKEN secret. Unauthenticated requests are rate limited hard and BoardGameGeek has been moving towards requiring a token, so add one when you can. Settings, Secrets and variables, Actions.");
  else line("BGG_TOKEN is set.");
}

head("4. Monitoring");

if (!existsSync("data/expected.json")) {
  W("data/expected.json is missing, so the canary has nothing to check against and will fail.");
} else {
  const e = JSON.parse(readFileSync("data/expected.json", "utf8"));
  const loose = e.minPickLists === 0 && e.minPickedGames === 0 && e.minForSale === 0 && e.games?.max >= 100000;
  if (loose) N("data/expected.json is still at the shipped defaults, which check almost nothing on purpose so a new fork is never red on day one. Once your shelf is real, tighten it: that is where the canary earns its keep.");
  else line(`Canary expects ${e.games.min} to ${e.games.max} games, at least ${e.minForSale} for sale, at least ${e.minPickedGames} picked.`);
}

head("Result");

for (const s of problems) line("BROKEN    " + s);
for (const s of warnings) line("CHECK     " + s);
for (const s of notes) line("FYI       " + s);
if (!problems.length && !warnings.length) line("Nothing to fix. Run the 'Sync catalogue data' workflow and your shelf will be live.");
line();
line(`${problems.length} broken, ${warnings.length} worth checking, ${notes.length} for information.`);
process.exit(problems.length ? 1 : 0);

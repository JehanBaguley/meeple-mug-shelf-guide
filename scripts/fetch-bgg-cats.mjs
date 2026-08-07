// One-off enrichment fetch: pulls BGG's own categories and mechanics for every
// game in the sheet that has a usable BGG link, and writes data/bgg-cats.json.
//
// Deliberately NOT part of the nightly build. It costs ~16 requests against
// BGG's rate limiter every run, and BGG categories almost never change once a
// game is published, so re-fetching them every night would be pure noise.
// Run it by hand from the Actions tab when new games are added to the shelf.
//
// Node 20+, zero deps. Reads SHEET_CSV_URL exactly like build-data.mjs does.

import { writeFileSync, mkdirSync } from "node:fs";

const SHEET_CSV_URL = process.env.SHEET_CSV_URL || "";
// BGG closed the XML API to anonymous callers: every request now needs an
// application token, sent as a normal bearer header. No token = 401 on everything.
const BGG_TOKEN = process.env.BGG_TOKEN || "";
const UA = {
  "User-Agent": "meeple-mug-catalogue/1.0",
  ...(BGG_TOKEN ? { Authorization: `Bearer ${BGG_TOKEN}` } : {}),
};
const CHUNK = 20;      // BGG's /thing accepts a comma-separated id list
const GAP_MS = 2500;   // BGG asks for a pause between requests, so we give it one

// same quoted-CSV walker the nightly build uses, so a comma inside a blurb
// cannot shift every column to the right
function parseCsv(text) {
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    }
    else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (ch !== "\r") cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// /thing answers 200 or 429. 429 means slow down, so back off and try again
// rather than dropping twenty games on the floor.
async function fetchThings(ids) {
  const url = `https://boardgamegeek.com/xmlapi2/thing?id=${ids.join(",")}&stats=1`;
  for (let attempt = 1; attempt <= 5; attempt++) {
    const res = await fetch(url, { headers: UA });
    if (res.status === 200) return res.text();
    if (res.status === 429 || res.status === 202) { await sleep(attempt * 5000); continue; }
    // 401 is not a per-batch hiccup, it is "your token is missing or wrong".
    // Fail the whole run loudly rather than grinding through 16 identical refusals.
    if (res.status === 401) {
      throw new Error(BGG_TOKEN
        ? "BGG rejected the token (401). Check the BGG_TOKEN secret is the current application token."
        : "BGG requires an application token now (401). Set the BGG_TOKEN secret in repo settings.");
    }
    console.log(`  BGG responded ${res.status} for this batch, skipping it`);
    return null;
  }
  console.log("  batch still throttled after 5 attempts, skipping it");
  return null;
}

// pull every <link type="boardgamecategory|boardgamemechanic"> out of one <item>
function parseItems(xml) {
  const out = {};
  for (const m of xml.matchAll(/<item[^>]*\bid="(\d+)"[\s\S]*?<\/item>/g)) {
    const body = m[0];
    const grab = (type) => [...body.matchAll(
      new RegExp(`<link[^>]*type="${type}"[^>]*value="([^"]*)"`, "g")
    )].map(x => x[1].replace(/&amp;/g, "&").replace(/&#039;/g, "'").replace(/&quot;/g, '"'));
    const wm = body.match(/<averageweight[^>]*value="([\d.]+)"/);
    const am = body.match(/<average[^>]*value="([\d.]+)"/);
    // First sentence of BGG's description, as a stand-in blurb for games nobody has
    // written one for yet. BGG's copy is publisher marketing and runs to paragraphs, so
    // only the opening sentence is worth keeping, and only if it is a sensible length.
    const dm = body.match(/<description>([\s\S]*?)<\/description>/);
    let desc = null;
    if (dm) {
      const plain = dm[1]
        .replace(/&#10;|&#13;|<br\s*\/?>/gi, " ")
        .replace(/&amp;/g, "&").replace(/&#039;|&rsquo;/g, "'").replace(/&quot;|&ldquo;|&rdquo;/g, '"')
        .replace(/&mdash;|&ndash;/g, "-").replace(/&hellip;/g, "...").replace(/&[a-z]+;|&#\d+;/gi, " ")
        .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      const first = (plain.match(/^.*?[.!?](?=\s|$)/) || [plain])[0].trim();
      if (first.length >= 25 && first.length <= 180) desc = first;
    }
    out[m[1]] = {
      cats: grab("boardgamecategory"),
      mechs: grab("boardgamemechanic"),
      desc,
      // rating and weight come free in the same response, so take them
      bgg: am ? Number(Number(am[1]).toFixed(1)) : null,
      weight: wm ? Number(Number(wm[1]).toFixed(2)) : null,
    };
  }
  return out;
}

async function main() {
  if (!SHEET_CSV_URL) { console.log("No SHEET_CSV_URL set, nothing to do"); return; }

  const rows = parseCsv(await (await fetch(SHEET_CSV_URL)).text());
  const head = rows.shift().map(h => h.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_"));
  const iName = head.indexOf("name"), iLink = head.indexOf("bgg_link");
  if (iName < 0 || iLink < 0) throw new Error("sheet is missing a name or bgg_link column");

  // /thing works for base games and expansions. boardgamefamily and rpggeek
  // links point at a different namespace, so they are skipped rather than 404'd.
  const byId = new Map();   // id -> [names], because two rows can share an id
  let skipped = 0;
  for (const r of rows) {
    const name = (r[iName] || "").trim(); if (!name) continue;
    const m = (r[iLink] || "").match(/\/(?:boardgame|boardgameexpansion)\/(\d+)/);
    if (!m) { skipped++; continue; }
    if (!byId.has(m[1])) byId.set(m[1], []);
    byId.get(m[1]).push(name);
  }
  const ids = [...byId.keys()];
  console.log(`${ids.length} ids to fetch, ${skipped} rows skipped (no usable link)`);

  const things = {};
  for (let i = 0; i < ids.length; i += CHUNK) {
    const batch = ids.slice(i, i + CHUNK);
    console.log(`batch ${i / CHUNK + 1}/${Math.ceil(ids.length / CHUNK)}`);
    const xml = await fetchThings(batch);
    if (xml) Object.assign(things, parseItems(xml));
    if (i + CHUNK < ids.length) await sleep(GAP_MS);
  }

  // key the output by game name, so the merge back into the sheet is a lookup
  const out = {};
  for (const [id, names] of byId) {
    const t = things[id]; if (!t) continue;
    for (const n of names) out[n] = { bggId: +id, ...t };
  }
  const missing = [...byId.values()].flat().filter(n => !out[n]);
  console.log(`resolved ${Object.keys(out).length} games, ${missing.length} unresolved`);
  if (missing.length) console.log("unresolved:", missing.join(", "));

  mkdirSync("data", { recursive: true });
  writeFileSync("data/bgg-cats.json", JSON.stringify(out, null, 1));
  console.log("wrote data/bgg-cats.json");
}

main().catch(e => { console.error(e); process.exit(1); });

// Nightly data build for the Meeple & Mug catalogue.
// Fetches the café's BGG collection (with stats), optionally merges the Google Sheet
// overlay (shop columns + picks), and writes data/games.json for the static site.
// Node 20+, zero dependencies. Run: node scripts/build-data.mjs

import { writeFileSync, mkdirSync } from "node:fs";

const BGG_USER = "meepleandmug";
const COLLECTION_URL = `https://boardgamegeek.com/xmlapi2/collection?username=${BGG_USER}&stats=1&own=1`;
// Set as a repo variable/secret, or paste the published-CSV URL here:
const SHEET_CSV_URL = process.env.SHEET_CSV_URL || "";

// BGG queues collection requests: a 202 means "come back shortly". Retry politely.
async function fetchCollection() {
  for (let attempt = 1; attempt <= 8; attempt++) {
    const res = await fetch(COLLECTION_URL, { headers: { "User-Agent": "meeple-mug-catalogue/1.0" } });
    if (res.status === 200) return res.text();
    if (res.status === 202) { await new Promise(r => setTimeout(r, attempt * 5000)); continue; }
    throw new Error(`BGG responded ${res.status}`);
  }
  throw new Error("BGG collection still queued after 8 attempts");
}

// Minimal XML pulls: enough fields for the site, no parser dependency.
function parseCollection(xml) {
  const items = [];
  for (const m of xml.matchAll(/<item[^>]*objectid="(\d+)"[\s\S]*?<\/item>/g)) {
    const block = m[0];
    const pick = (re) => (block.match(re) || [])[1];
    const sub = (block.match(/subtype="(\w+)"/) || [])[1];
    items.push({
      bggId: Number(m[1]),
      name: pick(/<name[^>]*>([^<]+)<\/name>/),
      exp: sub === "boardgameexpansion" || undefined,
      players: pick(/minplayers="(\d+)"/) ? [Number(pick(/minplayers="(\d+)"/)), Number(pick(/maxplayers="(\d+)"/) || pick(/minplayers="(\d+)"/))] : null,
      mins: pick(/playingtime="(\d+)"/) ? Number(pick(/playingtime="(\d+)"/)) : null,
      time: pick(/playingtime="(\d+)"/) ? `${pick(/playingtime="(\d+)"/)}m` : null,
      bgg: pick(/<average[^>]*value="([\d.]+)"/) ? Number(Number(pick(/<average[^>]*value="([\d.]+)"/)).toFixed(1)) : null,
      weight: pick(/<averageweight[^>]*value="([\d.]+)"/) ? Number(Number(pick(/<averageweight[^>]*value="([\d.]+)"/)).toFixed(1)) : null,
      playable: true, forSale: false, cat: null, mode: null, price: null, priceTxt: null, playsLike: null,
    });
  }
  return items;
}

function parseCsv(text) {
  const rows = []; let row = [], cell = "", q = false;
  for (const ch of text) {
    if (q) { if (ch === '"') q = false; else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (ch !== "\r") cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();

async function main() {
  const games = parseCollection(await fetchCollection());
  console.log(`BGG collection: ${games.length} items`);
  let picks = [];

  if (SHEET_CSV_URL) {
    const rows = parseCsv(await (await fetch(SHEET_CSV_URL)).text());
    const head = rows.shift().map(h => norm(h).replace(/ /g, "_"));
    const idx = (k) => head.indexOf(k);
    const byName = Object.fromEntries(games.map(g => [norm(g.name), g]));
    const lists = {};
    for (const r of rows) {
      const val = (k) => (idx(k) > -1 ? (r[idx(k)] || "").trim() : "");
      const name = val("name"); if (!name) continue;
      let g = byName[norm(name)];
      if (!g) { g = { name, bggId: null, players: null, mins: null, time: null, bgg: null, weight: null, playable: false, forSale: false, cat: null, mode: null, price: null, priceTxt: null, playsLike: null }; games.push(g); byName[norm(name)] = g; }
      if (val("playable")) g.playable = /^y/i.test(val("playable"));
      if (val("for_sale")) g.forSale = /^y/i.test(val("for_sale"));
      if (val("price")) { g.price = parseInt(val("price")) || null; g.priceTxt = "$" + val("price").replace(/^\$/, ""); }
      if (val("status")) g.status = val("status");
      if (val("play_style")) g.mode = { "co-op": "coop", coop: "coop", teams: "team", team: "team", competitive: "comp", comp: "comp" }[norm(val("play_style"))] || null;
      if (val("badge_by")) { g.pickBy = val("badge_by"); g.pickNote = val("badge_note"); }
      if (val("rec_list")) { (lists[val("rec_list")] ??= { list: val("rec_list"), note: "", games: {} }).games[g.name] = val("rec_note"); }
    }
    picks = Object.values(lists);
    console.log(`Sheet overlay applied (${picks.length} pick lists)`);
  }

  mkdirSync("data", { recursive: true });
  writeFileSync("data/games.json", JSON.stringify({ built: new Date().toISOString(), games, picks }, null, 1));
  console.log("Wrote data/games.json");
}

main().catch((e) => { console.error(e); process.exit(1); });

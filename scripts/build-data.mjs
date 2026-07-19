// Nightly data build for the Meeple & Mug catalogue.
// Sources, in order of preference:
//   1. The café's Google Sheet (the master list staff edit) via SHEET_CSV_URL
//   2. The café's BGG collection (adds community ratings/weights) — optional,
//      skipped gracefully until the café creates the account
// Writes data/games.json when there is anything to write. Node 20+, zero deps.

import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";

const BGG_USER = "meepleandmug";
const COLLECTION_URL = `https://boardgamegeek.com/xmlapi2/collection?username=${BGG_USER}&stats=1&own=1`;
const SHEET_CSV_URL = process.env.SHEET_CSV_URL || "";

// BGG queues collection requests: 202 means "come back shortly". 401/403/404 means
// the account doesn't exist or BGG is blocking — treat as "no BGG source", not a failure.
async function fetchCollection() {
  for (let attempt = 1; attempt <= 8; attempt++) {
    const res = await fetch(COLLECTION_URL, { headers: { "User-Agent": "meeple-mug-catalogue/1.0" } });
    if (res.status === 200) return res.text();
    if (res.status === 202) { await new Promise(r => setTimeout(r, attempt * 5000)); continue; }
    if ([401, 403, 404].includes(res.status)) { console.log(`BGG not available (${res.status}), skipping BGG stats this run`); return null; }
    throw new Error(`BGG responded ${res.status}`);
  }
  console.log("BGG collection still queued after 8 attempts, skipping this run");
  return null;
}

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
      age: null, catText: null,
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
// "2-5" | "3+" | "2" → [min,max]
function parsePlayersTxt(s) {
  let m = s.match(/^(\d+)\s*-\s*(\d+)\+?$/); if (m) return [+m[1], +m[2]];
  m = s.match(/^(\d+)\+$/); if (m) return [+m[1], 20];
  m = s.match(/^(\d+)$/); if (m) return [+m[1], +m[1]];
  return null;
}
// "30-45 mins" | "90 mins" | "Varies" → {time, mins}
function parseTimeTxt(s) {
  if (/varies/i.test(s)) return { time: "Varies", mins: null };
  let m = s.match(/^(\d+)\s*-\s*(\d+)/); if (m) return { time: `${m[1]}–${m[2]}m`, mins: +m[2] };
  m = s.match(/^(\d+)/); if (m) return { time: `${m[1]}m`, mins: +m[1] };
  return { time: null, mins: null };
}
// mirrors the site's spine-colour mapping
function catSlugFor(t) {
  // primary (first-listed) category decides the colour; every token maps to one of nine groups
  for (const c of (t || "").toLowerCase().split(",").map(s => s.trim()).filter(Boolean)) {
    if (/co-?op|cooperative/.test(c)) return "coop";
    if (/party|dexterity|drawing|humor|trivia|word|social|storytelling/.test(c)) return "party";
    if (/deduction|bluffing|hidden roles|political/.test(c)) return "deduct";
    if (/family|children|kids/.test(c)) return "family";
    if (/horror|adult/.test(c)) return "dark";
    if (/card|deck building|dice|set collection|bidding/.test(c)) return "cards";
    if (/adventure|exploration|sci-?fi|fantasy|superhero|thematic|legacy|roleplaying|historical|action/.test(c)) return "adventure";
    if (/abstract|puzzle|tile|expansion/.test(c)) return "abstract";
    if (/strategy|economic|worker placement|area control|tactical|city building|civilization|asymmetric|resource management|racing|real-?time/.test(c)) return "strategy";
  }
  return null;
}

async function main() {
  const xml = await fetchCollection();
  const games = xml ? parseCollection(xml) : [];
  console.log(`BGG collection: ${games.length} items`);
  let picks = [];
  let sheetRows = 0;

  if (SHEET_CSV_URL) {
    const rows = parseCsv(await (await fetch(SHEET_CSV_URL)).text());
    const head = rows.shift().map(h => h.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_"));
    const idx = (k) => head.indexOf(k);
    const byName = Object.fromEntries(games.map(g => [norm(g.name), g]));
    const lists = {};
    for (const r of rows) {
      const val = (k) => (idx(k) > -1 ? (r[idx(k)] || "").trim() : "");
      const name = val("name"); if (!name) continue;
      sheetRows++;
      let g = byName[norm(name)];
      if (!g) { g = { name, bggId: null, players: null, mins: null, time: null, age: null, catText: null, bgg: null, weight: null, playable: false, forSale: false, cat: null, mode: null, price: null, priceTxt: null, playsLike: null }; games.push(g); byName[norm(name)] = g; }
      if (val("playable")) g.playable = /^y/i.test(val("playable"));
      if (val("for_sale")) g.forSale = /^y/i.test(val("for_sale"));
      if (val("price")) { g.price = parseInt(val("price")) || null; g.priceTxt = "$" + val("price").replace(/^\$/, ""); }
      if (val("check") && /estimate/i.test(val("check")) && g.priceTxt && g.priceTxt[0] !== "~") g.priceTxt = "~" + g.priceTxt;
      if (val("price_text")) g.priceTxt = val("price_text");
      if (val("blurb")) g.playsLike = val("blurb");
      if (val("status")) g.status = val("status");
      if (val("players")) g.players = parsePlayersTxt(val("players")) ?? g.players;
      if (val("age")) g.age = val("age");
      if (val("time")) { const t = parseTimeTxt(val("time")); if (t.time) { g.time = t.time; g.mins = t.mins; } }
      if (val("category")) { g.catText = val("category"); g.cat = catSlugFor(g.catText); if (/co-?op|cooperative/i.test(g.catText)) g.mode = "coop"; if (/expansion|stretch goals/i.test(g.catText + " " + name)) g.exp = true; }
      if (val("play_style")) g.mode = { "co-op": "coop", coop: "coop", teams: "team", team: "team", competitive: "comp", comp: "comp" }[norm(val("play_style"))] || g.mode;
      if (val("badge_by")) { g.pickBy = val("badge_by"); g.pickNote = val("badge_note"); }
      if (val("rec_list")) { (lists[val("rec_list")] ??= { list: val("rec_list"), note: "", games: {} }).games[g.name] = val("rec_note"); }
    }
    picks = Object.values(lists);
    console.log(`Sheet overlay applied: ${sheetRows} rows, ${picks.length} pick lists`);
  }

  // merge the committed BGG ratings map (data/bgg.json) for games the API/dump matched
  if (existsSync("data/bgg.json")) {
    const bmap = JSON.parse(readFileSync("data/bgg.json", "utf8"));
    let merged = 0;
    for (const g of games) {
      const b = bmap[g.name];
      if (b && g.bgg === null) { g.bgg = b.bgg ?? null; g.bggId = b.bggId ?? null; merged++; }
      if (b && b.weight != null && g.weight === null) g.weight = b.weight;
    }
    console.log(`BGG map merged into ${merged} games`);
  }

  if (!games.length) { console.log("No data from either source, leaving games.json untouched"); return; }
  mkdirSync("data", { recursive: true });
  writeFileSync("data/games.json", JSON.stringify({ built: new Date().toISOString(), games, picks }, null, 1));
  console.log(`Wrote data/games.json (${games.length} games)`);
}

main().catch((e) => { console.error(e); process.exit(1); });

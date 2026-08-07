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
// BGG application token, injected by the workflow. Empty string = no auth header sent.
const BGG_TOKEN = process.env.BGG_TOKEN || "";
// BGG queues collection requests: 202 means "come back shortly". 401/403/404 means
// the account doesn't exist or BGG is blocking — treat as "no BGG source", not a failure.
async function fetchCollection() {
  for (let attempt = 1; attempt <= 8; attempt++) {
  const res = await fetch(COLLECTION_URL, {
  headers: {
    "User-Agent": "meeple-mug-catalogue/1.0",
    // only send the auth header when the token exists, same trick as fetch-bgg-cats.mjs
    ...(BGG_TOKEN ? { Authorization: `Bearer ${BGG_TOKEN}` } : {}),
  },
}); 
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
    if (/party|dexterity|drawing|humor|trivia|word|social|storytelling|conversation/.test(c)) return "party";
    if (/deduction|bluffing|hidden roles|political|negotiation|auction/.test(c)) return "deduct";
    if (/family|children|kids/.test(c)) return "family";
    if (/horror|adult/.test(c)) return "dark";
    if (/card|deck building|dice|set collection|bidding/.test(c)) return "cards";
    if (/adventure|exploration|sci-?fi|science fiction|fantasy|superhero|thematic|legacy|roleplaying|historical|action|survival/.test(c)) return "adventure";
    if (/wargame|war game|military/.test(c)) return "war";
    if (/two.?player|2.?player/.test(c)) return "two";
    if (/abstract|puzzle|tile|expansion|classic/.test(c)) return "abstract";
    if (/strategy|economic|worker placement|area control|tactical|city building|civilization|asymmetric|resource management|racing|real-?time/.test(c)) return "strategy";
  }
  return null;
}

async function main() {
  const xml = await fetchCollection();
  let games = xml ? parseCollection(xml) : [];
  console.log(`BGG collection: ${games.length} items`);
  let picks = [];
  let sheetRows = 0;

  if (SHEET_CSV_URL) {
    try {
      const rows = parseCsv(await (await fetch(SHEET_CSV_URL)).text());
      const head = rows.shift().map(h => h.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_"));
      const idx = (k) => head.indexOf(k);
      const byName = Object.fromEntries(games.map(g => [norm(g.name), g]));
      const byId = new Map();                       // bggId -> collection entries, in order
      for (const g of games) if (g.bggId != null) { if (!byId.has(g.bggId)) byId.set(g.bggId, []); byId.get(g.bggId).push(g); }
      const claimed = new Set();                    // so two sheet rows can't claim one entry
      const lists = {};
      for (const r of rows) {
        const val = (k) => (idx(k) > -1 ? (r[idx(k)] || "").trim() : "");
        const name = val("name"); if (!name) continue;
        sheetRows++;
        // resolve the sheet's own BGG link first: it is the only reliable join key
        const lm = (idx("bgg_link") > -1 ? (r[idx("bgg_link")] || "") : "").match(/boardgame(?:expansion|accessory)?\/(\d+)/);
        let g = null;
        if (lm) g = (byId.get(+lm[1]) || []).find(c => !claimed.has(c)) || null;
        if (!g) { const c = byName[norm(name)]; if (c && !claimed.has(c)) g = c; }
        if (g) { claimed.add(g); g.name = name; }   // the cafe's spelling is the one on the shelf
        g && (g.__sheet = true);
        if (!g) { g = { name, __sheet: true, bggId: null, players: null, mins: null, time: null, age: null, catText: null, bgg: null, weight: null, playable: false, forSale: false, cat: null, mode: null, price: null, priceTxt: null, playsLike: null }; games.push(g); byName[norm(name)] = g; claimed.add(g); }
        if (val("playable")) g.playable = /^y/i.test(val("playable"));
        if (val("for_sale")) g.forSale = /^y/i.test(val("for_sale"));
        if (val("expansion")) g.exp = /^y/i.test(val("expansion"));
        if (val("price")) { const pr = val("price").trim(), pm = pr.match(/\d+/); g.price = pm ? parseInt(pm[0]) : null; g.priceTxt = /^[~$]/.test(pr) ? pr : "$" + pr; }
        if (val("rating")) g.bgg = parseFloat(val("rating")) || g.bgg;
        if (val("bgg_link")) { g.bggUrl = val("bgg_link"); const bm = val("bgg_link").match(/boardgame(?:expansion|accessory)?\/(\d+)/); if (bm) g.bggId = +bm[1]; }
        if (val("price_text")) g.priceTxt = val("price_text");
        if (val("blurb")) g.playsLike = val("blurb");
        if (val("status")) g.status = val("status");
        if (val("players")) g.players = parsePlayersTxt(val("players")) ?? g.players;
        if (val("age")) g.age = val("age");
        if (val("time")) { const t = parseTimeTxt(val("time")); if (t.time) { g.time = t.time; g.mins = t.mins; } }
        if (val("category")) { g.catText = val("category"); g.cat = catSlugFor(g.catText); if (/co-?op|cooperative/i.test(g.catText)) g.mode = "coop"; if (/expansion|stretch goals/i.test(g.catText + " " + name)) g.exp = true; }
        if (val("play_style")) g.mode = { "co-op": "coop", coop: "coop", teams: "team", team: "team", competitive: "comp", comp: "comp" }[norm(val("play_style"))] || g.mode;
        const pb = val("pick_by") || val("badge_by") || val("rec_list"), pn = val("pick_note") || val("badge_note") || val("rec_note");
        if (pb) { g.pickBy = pb; g.pickNote = pn; (lists[pb] ??= { list: pb, note: "", games: {} }).games[g.name] = pn; }
      }
      picks = Object.values(lists);
      console.log(`Sheet overlay applied: ${sheetRows} rows, ${picks.length} pick lists`);
    } catch (e) {
      console.warn("Sheet overlay unavailable:", e);
      // Leave `games` as-is (may be from BGG) and continue — don't let a
      // failing sheet fetch abort the entire nightly build.
      sheetRows = 0; picks = [];
    }
  }

  // The sheet is the shelf. Collection entries no sheet row claimed are games the cafe
  // does not stock, so they must not appear in the guide saying "On the shelf".
  if (sheetRows > 0) {
    const before = games.length;
    games = games.filter(g => g.__sheet);
    for (const g of games) delete g.__sheet;
    if (before !== games.length) console.log(`Dropped ${before - games.length} BGG entries no sheet row claimed`);
  } else {
    for (const g of games) delete g.__sheet;
  }
  // BGG reports 0 for a game nobody has rated for complexity; that is "unknown", not "trivial"
  for (const g of games) if (g.weight === 0) g.weight = null;

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

  // ————— BGG categories, mechanics and description —————
  // The sheet is still the shelf, so this only ever ADDS. The cafe's own categories keep
  // their position, which matters because the first one sets the spine colour, and BGG's
  // are appended behind them. Anything the cafe has already stated wins outright.
  if (existsSync("data/bgg-cats.json")) {
    const cmap = JSON.parse(readFileSync("data/bgg-cats.json", "utf8"));
    const byId = new Map();
    for (const v of Object.values(cmap)) if (v.bggId != null && !byId.has(v.bggId)) byId.set(v.bggId, v);
    let catAdd = 0, modeAdd = 0, blurbAdd = 0;
    for (const g of games) {
      const b = (g.bggId != null && byId.get(g.bggId)) || cmap[g.name];
      if (!b) continue;
      // Two of BGG's "categories" are not genres. Expansion is a flag we already show as
      // a pill next to the title, and Print & Play means nothing on a cafe shelf.
      const cats = (b.cats || []).filter(c => {
        if (/^expansion for base/i.test(c)) { g.exp = true; return false; }
        return !/^print\s*&\s*play$/i.test(c);
      });
      if (cats.length) {
        const have = new Set((g.catText || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean));
        const add = cats.filter(c => !have.has(c.toLowerCase()));
        if (add.length) { g.catText = [g.catText, ...add].filter(Boolean).join(", "); catAdd++; }
      }
      // Play style, only where the sheet left it blank. BGG's mechanic list is the honest
      // source for this: "Cooperative Game" and "Semi-Cooperative Game" both mean everyone
      // is on the same side as far as someone picking a game off the shelf is concerned.
      if (!g.mode) {
        const m = (b.mechs || []).join(" ").toLowerCase();
        if (/semi-?cooperative game|cooperative game/.test(m)) g.mode = "coop";
        else if (/team-based game/.test(m)) g.mode = "team";
        else g.mode = "comp";
        modeAdd++;
      }
      // A blurb is the best thing on the card, so BGG's first sentence is only ever a
      // stand-in for a game nobody has written one for yet.
      if (!g.playsLike && b.desc) { g.playsLike = b.desc; blurbAdd++; }
    }
    console.log(`BGG enrichment: categories on ${catAdd}, play style on ${modeAdd}, fallback blurb on ${blurbAdd}`);
  }
  // "Expansion" is a pill beside the title, not a genre, and while it sits first in
  // catText it steals the spine colour from the genre that should own it.
  for (const g of games) {
    if (!g.catText) continue;
    const kept = g.catText.split(",").map(s => s.trim()).filter(Boolean)
      .filter(c => { if (/^expansions?$/i.test(c)) { g.exp = true; return false; } return true; });
    g.catText = kept.join(", ") || null;
  }
  // The spine colour has to be recomputed after the categories settle, not before.
  for (const g of games) if (g.catText) g.cat = catSlugFor(g.catText);

  if (!games.length) { console.log("No data from either source, leaving games.json untouched"); return; }
  mkdirSync("data", { recursive: true });
  writeFileSync("data/games.json", JSON.stringify({ built: new Date().toISOString(), games, picks }, null, 1));
  console.log(`Wrote data/games.json (${games.length} games)`);
}

main().catch((e) => { console.error(e); process.exit(1); });

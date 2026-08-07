// Nightly data build for the Meeple & Mug catalogue.
// Sources, in order of authority:
//   1. The café's Google Sheet is the master inventory and availability source.
//   2. The café's BGG collection enriches linked games with community ratings,
//      weight, player/time/age stats, and categories when available.
//
// Sheet values still win for availability, price, category text, play style,
// blurb, and pick lists; BGG augments or overrides stats fields for linked
// games so the catalogue stays accurate and up to date.
// Writes data/games.json when there is anything to write. Node 20+, zero deps.

import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";

const BGG_USER = "meepleandmug";
const COLLECTION_URL = `https://boardgamegeek.com/xmlapi2/collection?username=${BGG_USER}&stats=1&own=1`;
const SHEET_CSV_URL = process.env.SHEET_CSV_URL || "";
// Optionally use a local CSV instead of fetching the published sheet.
// Set LOCAL_SHEET_PATH to 'data/sheet-fixed.csv' or set USE_FIXED_SHEET=1 to default to data/sheet-fixed.csv
const LOCAL_SHEET_PATH = process.env.LOCAL_SHEET_PATH || (process.env.USE_FIXED_SHEET ? 'data/sheet-fixed.csv' : '');
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
  const games = xml ? parseCollection(xml) : [];
  console.log(`BGG collection: ${games.length} items`);
  let picks = [];
  let sheetRows = 0;

  if (SHEET_CSV_URL) {
    try {
      const rows = parseCsv(await (await fetch(SHEET_CSV_URL)).text());
      const head = rows.shift().map(h => h.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_"));
      const idx = (k) => head.indexOf(k);
      // Map existing games by normalized name; we'll add new games here if sheet has them
      const byName = Object.fromEntries(games.map(g => [norm(g.name), g]));
      const lists = {};
      const sheetOverlays = {};
      for (const r of rows) {
        const val = (k) => (idx(k) > -1 ? (r[idx(k)] || "").trim() : "");
        const name = val("name"); if (!name) continue;
        sheetRows++;
        let g = byName[norm(name)];
        if (!g) { g = { name, bggId: null, players: null, mins: null, time: null, age: null, catText: null, bgg: null, weight: null, playable: false, forSale: false, cat: null, mode: null, price: null, priceTxt: null, playsLike: null, rulesLink: null, notes: null }; games.push(g); byName[norm(name)] = g; }
        // build a conservative overlay object — do NOT include BGG stat fields so BGG always wins
        const overlay = {};
        if (val("playable")) overlay.playable = /^y/i.test(val("playable"));
        if (val("for_sale")) overlay.forSale = /^y/i.test(val("for_sale"));
        if (val("expansion")) overlay.exp = /^y/i.test(val("expansion"));
        if (val("price")) { const pr = val("price").trim(), pm = pr.match(/\d+/); overlay.price = pm ? parseInt(pm[0]) : null; overlay.priceTxt = /^[~$]/.test(pr) ? pr : "$" + pr; }
        if (val("bgg_link")) { overlay.bggUrl = val("bgg_link"); const bm = val("bgg_link").match(/boardgame(?:expansion|accessory)?\/(\d+)/); if (bm) overlay.bggId = +bm[1]; }
        if (val("price_text")) overlay.priceTxt = val("price_text");
        if (val("blurb")) overlay.playsLike = val("blurb");
        if (val("status")) overlay.status = val("status");
        if (val("age")) overlay.age = val("age");
        if (val("category")) { overlay.catText = val("category"); overlay.cat = catSlugFor(overlay.catText); if (/expansion|stretch goals/i.test(overlay.catText + " " + name)) overlay.exp = true; }
        if (val("play_style")) overlay.mode = { "co-op": "coop", coop: "coop", teams: "team", team: "team", competitive: "comp", comp: "comp" }[norm(val("play_style"))] || undefined;
        if (val("rules_link")) overlay.rulesLink = val("rules_link");
        if (val("notes")) overlay.notes = val("notes");
        const pb = val("pick_by") || val("badge_by") || val("rec_list"), pn = val("pick_note") || val("badge_note") || val("rec_note");
        if (pb) { overlay.pickBy = pb; overlay.pickNote = pn; (lists[pb] ??= { list: pb, note: "", games: {} }).games[name] = pn; }
        sheetOverlays[norm(name)] = overlay;
      }
      globalThis.__sheetOverlays = sheetOverlays;
      picks = Object.values(lists);
      console.log(`Sheet overlay parsed: ${sheetRows} rows, ${picks.length} pick lists (overlays stored)`);
    } catch (e) {
      console.warn("Sheet overlay unavailable:", e);
      sheetRows = 0; picks = [];
    }
  } else if (LOCAL_SHEET_PATH && existsSync(LOCAL_SHEET_PATH)) {
    try {
      const txt = readFileSync(LOCAL_SHEET_PATH, 'utf8');
      const rows = parseCsv(txt);
      const head = rows.shift().map(h => h.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_"));
      const idx = (k) => head.indexOf(k);
      const byName = Object.fromEntries(games.map(g => [norm(g.name), g]));
      const lists = {};
      const sheetOverlays = {};
      for (const r of rows) {
        const val = (k) => (idx(k) > -1 ? (r[idx(k)] || "").trim() : "");
        const name = val("name"); if (!name) continue;
        sheetRows++;
        let g = byName[norm(name)];
        if (!g) { g = { name, bggId: null, players: null, mins: null, time: null, age: null, catText: null, bgg: null, weight: null, playable: false, forSale: false, cat: null, mode: null, price: null, priceTxt: null, playsLike: null, rulesLink: null, notes: null }; games.push(g); byName[norm(name)] = g; }
        const overlay = {};
        if (val("playable")) overlay.playable = /^y/i.test(val("playable"));
        if (val("for_sale")) overlay.forSale = /^y/i.test(val("for_sale"));
        if (val("expansion")) overlay.exp = /^y/i.test(val("expansion"));
        if (val("price")) { const pr = val("price").trim(), pm = pr.match(/\d+/); overlay.price = pm ? parseInt(pm[0]) : null; overlay.priceTxt = /^[~$]/.test(pr) ? pr : "$" + pr; }
        if (val("bgg_link")) { overlay.bggUrl = val("bgg_link"); const bm = val("bgg_link").match(/boardgame(?:expansion|accessory)?\/(\d+)/); if (bm) overlay.bggId = +bm[1]; }
        if (val("price_text")) overlay.priceTxt = val("price_text");
        if (val("blurb")) overlay.playsLike = val("blurb");
        if (val("status")) overlay.status = val("status");
        if (val("age")) overlay.age = val("age");
        if (val("category")) { overlay.catText = val("category"); overlay.cat = catSlugFor(overlay.catText); if (/expansion|stretch goals/i.test(overlay.catText + " " + name)) overlay.exp = true; }
        if (val("play_style")) overlay.mode = { "co-op": "coop", coop: "coop", teams: "team", team: "team", competitive: "comp", comp: "comp" }[norm(val("play_style"))] || undefined;
        if (val("rules_link")) overlay.rulesLink = val("rules_link");
        if (val("notes")) overlay.notes = val("notes");
        const pb = val("pick_by") || val("badge_by") || val("rec_list"), pn = val("pick_note") || val("badge_note") || val("rec_note");
        if (pb) { overlay.pickBy = pb; overlay.pickNote = pn; (lists[pb] ??= { list: pb, note: "", games: {} }).games[name] = pn; }
        sheetOverlays[norm(name)] = overlay;
      }
      globalThis.__sheetOverlays = sheetOverlays;
      picks = Object.values(lists);
      console.log(`Local sheet overlay parsed: ${sheetRows} rows, ${picks.length} pick lists (overlays stored)`);
    } catch (e) {
      console.warn("Local sheet overlay unavailable:", e);
      sheetRows = 0; picks = [];
    }
  }

  // merge the committed BGG stats map (data/bgg-cats.json) for games the sheet linked
  // to BGG. For linked games, rating/players/time/age come from BGG when available;
  // the sheet is only a fallback for those fields. Sheet remains authoritative for
  // availability, price, category text, play style, blurb, picks, and rules_link.
  let bggStatsUsed = 0;
  let sheetFallbackUsed = 0;
  if (existsSync("data/bgg-cats.json")) {
    const bmap = JSON.parse(readFileSync("data/bgg-cats.json", "utf8"));
    const bmapById = Object.fromEntries(Object.entries(bmap)
      .filter(([,b]) => b.bggId != null)
      .map(([,b]) => [b.bggId, b]));
    for (const g of games) {
      const b = g.bggId != null ? bmapById[g.bggId] : bmap[g.name];
      // prefer explicit bggId mapping, fall back to name lookup; skip if no BGG record
      if (!b) { sheetFallbackUsed++; continue; }
      let used = false;
      if (b.bgg != null) { g.bgg = b.bgg; used = true; }
      if (b.weight != null) { g.weight = b.weight; used = true; }
      if (b.minPlayers != null || b.maxPlayers != null) {
        const min = b.minPlayers != null ? b.minPlayers : b.maxPlayers;
        const max = b.maxPlayers != null ? b.maxPlayers : b.minPlayers;
        if (min != null && max != null) {
          g.players = [min, max];
          used = true;
        }
      }
      if (b.minTime != null || b.maxTime != null) {
        const min = b.minTime != null ? b.minTime : b.maxTime;
        const max = b.maxTime != null ? b.maxTime : b.minTime;
        if (min != null && max != null) {
          g.mins = max;
          g.time = min === max ? `${min}m` : `${min}–${max}m`;
          used = true;
        }
      }
      if (b.minAge != null) {
        g.age = `${b.minAge}+`;
        used = true;
      }
      if (b.cats?.length) {
        const existing = new Set((g.catText || "").split(",").map(s => s.trim()).filter(Boolean).map(s => s.toLowerCase()));
        const merged = (g.catText ? g.catText.split(",").map(s => s.trim()).filter(Boolean) : []);
        for (const cat of b.cats) {
          if (!existing.has(cat.toLowerCase())) {
            merged.push(cat);
            existing.add(cat.toLowerCase());
          }
        }
        if (merged.length) {
          const newCatText = merged.join(", ");
          if (newCatText !== g.catText) {
            g.catText = newCatText;
            g.cat = catSlugFor(g.catText);
          }
        }
      }
      if (b.bggId != null) { g.bggId = b.bggId; }
      if (used) bggStatsUsed++; else sheetFallbackUsed++;
    }
    console.log(`BGG stats applied to ${bggStatsUsed} games; sheet fallback used for ${sheetFallbackUsed} linked games`);
  }

  // apply sheet overlays now — these are intentionally conservative and must NOT overwrite
  // BGG-derived stats (rating, players, time, age, weight). Overlays are applied for
  // availability, pricing, category text, play style, blurb, picks, rules_link, notes.
  const sheetOverlays = globalThis.__sheetOverlays || {};
  let overlaysApplied = 0;
  if (Object.keys(sheetOverlays).length) {
    const byName = Object.fromEntries(games.map(g => [norm(g.name), g]));
    for (const [n, overlay] of Object.entries(sheetOverlays)) {
      const g = byName[n];
      if (!g) continue;
      if (overlay.playable !== undefined) g.playable = overlay.playable;
      if (overlay.forSale !== undefined) g.forSale = overlay.forSale;
      if (overlay.exp !== undefined) g.exp = overlay.exp;
      if (overlay.price !== undefined) g.price = overlay.price;
      if (overlay.priceTxt !== undefined) g.priceTxt = overlay.priceTxt;
      if (overlay.playsLike !== undefined) g.playsLike = overlay.playsLike;
      if (overlay.status !== undefined) g.status = overlay.status;
      if (overlay.catText !== undefined) { g.catText = overlay.catText; g.cat = catSlugFor(g.catText); }
      if (overlay.mode !== undefined) g.mode = overlay.mode;
      if (overlay.rulesLink !== undefined) g.rulesLink = overlay.rulesLink;
      if (overlay.notes !== undefined) g.notes = overlay.notes;
      if (overlay.bggId !== undefined) g.bggId = overlay.bggId;
      if (overlay.bggUrl !== undefined) g.bggUrl = overlay.bggUrl;
      if (overlay.pickBy) { g.pickBy = overlay.pickBy; g.pickNote = overlay.pickNote; }
      overlaysApplied++;
    }
    console.log(`Applied ${overlaysApplied} sheet overlays (non-stat fields)`);
  }

  if (!games.length) { console.log("No data from either source, leaving games.json untouched"); return; }
  mkdirSync("data", { recursive: true });
  writeFileSync("data/games.json", JSON.stringify({ built: new Date().toISOString(), games, picks }, null, 1));
  console.log(`Wrote data/games.json (${games.length} games)`);
}

main().catch((e) => { console.error(e); process.exit(1); });

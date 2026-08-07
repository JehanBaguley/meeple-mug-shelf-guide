#!/usr/bin/env node
// Fetch a published Google Sheet CSV and reorder its columns to the
// repository's canonical schema. Useful when staff reorder columns or
// export a slightly different layout. Writes `data/sheet-fixed.csv` and
// prints a short report to stdout.

import { writeFileSync } from 'node:fs';

const SHEET_CSV_URL = process.env.SHEET_CSV_URL || '';
if(!SHEET_CSV_URL){
  console.error('Set SHEET_CSV_URL environment variable to the published CSV URL');
  process.exit(2);
}

function parseCsv(text){
  const rows=[]; let row=[],cell='',q=false;
  for(const ch of text){
    if(q){ if(ch==='"') q=false; else cell+=ch; }
    else if(ch==='"'){ q=true }
    else if(ch===','){ row.push(cell); cell=''; }
    else if(ch==='\n'){ row.push(cell); rows.push(row); row=[]; cell=''; }
    else if(ch!=='\r'){ cell+=ch }
  }
  if(cell||row.length){ row.push(cell); rows.push(row); }
  return rows;
}

const EXPECTED = [
  'name','playable','status','for_sale','expansion','price','price_text','rating','bgg_link','players','age','time','category','play_style','blurb','pick_by','pick_note','rec_list','rec_note','notes','rules_link'
];

const HEAD_ALIAS = { game:'name', title:'name', game_name:'name', player_count:'players', no_of_players:'players', num_players:'players', playtime:'time', play_time:'time', duration:'time', length:'time', age_rating:'age', ages:'age', min_age:'age', categories:'category', genre:'category', genres:'category', forsale:'for_sale', in_stock:'for_sale', play_here:'playable', on_shelf:'playable', bgg:'rating', bgg_rating:'rating', bgg_url:'bgg_link', description:'blurb' };

function normalizeHeader(h){ return String(h||'').toLowerCase().trim().replace(/[^a-z0-9]+/g,'_'); }

async function main(){
  console.error('Fetching', SHEET_CSV_URL);
  const res = await fetch(SHEET_CSV_URL);
  if(!res.ok) { console.error('Fetch failed', res.status); process.exit(3); }
  const txt = await res.text();
  const rows = parseCsv(txt);
  if(!rows.length){ console.error('No rows'); process.exit(4); }
  const rawHead = rows.shift();
  const head = rawHead.map(h => normalizeHeader(h));
  const head2 = head.map(h => HEAD_ALIAS[h] || h);

  // find column index for a header name by exact match or simple heuristics
  const findCol = (key, sampleRows) => {
    let i = head2.indexOf(key);
    if(i>-1) return i;
    // look for alias variations
    const alt = Object.keys(HEAD_ALIAS).find(a=>HEAD_ALIAS[a]===key && head.includes(a));
    if(alt) return head.indexOf(alt);
    // heuristics by content
    for(let j=0;j<head.length;j++){
      const col = rows.map(r=>r[j]||'').slice(0,6).join(' ');
      if(key==='bgg_link' && /boardgamegeek\.com|https?:\/\//i.test(col)) return j;
      if(key==='players' && /\b\d+(?:\s*[\-to+]\s*\d+|\+)?\b/.test(col)) return j;
      if(key==='age' && /\d+\+/.test(col)) return j;
      if(key==='time' && /min|mins|hour|hr|h\b/i.test(col)) return j;
      if(key==='rating' && /\b\d\.\d|\d{1,2}\.\d\b/.test(col)) return j;
      if(key==='price' && /\$|AUD|\d+\s*(?:\.|,)?\d*/i.test(col)) return j;
    }
    return -1;
  };

  const mapping = {};
  const used = new Set();
  for(const k of EXPECTED){
    const idx = findCol(k, rows);
    mapping[k] = idx;
    if(idx>-1) used.add(idx);
  }

  // For any expected column not found, leave it blank in the output but
  // continue — this prevents catastrophic failure if sheet is missing optional cols.
  const outRows = [];
  outRows.push(EXPECTED.slice());
  for(const r of rows){
    const out = EXPECTED.map(h => {
      const i = mapping[h];
      return i>-1 ? (r[i]||'') : '';
    });
    outRows.push(out);
  }

  const csv = outRows.map(row => row.map(cell => {
    if(cell.includes(',') || cell.includes('"') || cell.includes('\n')) return '"'+String(cell).replace(/"/g,'""')+'"';
    return String(cell);
  }).join(',')).join('\n');

  writeFileSync('data/sheet-fixed.csv', csv, 'utf8');
  console.error('Wrote data/sheet-fixed.csv — rows:', outRows.length-1);
  console.error('Column mapping:');
  for(const k of EXPECTED){ console.error(k, '→', mapping[k]===-1?'<missing>':rawHead[mapping[k]]); }
  console.error('Tip: review data/sheet-fixed.csv and re-publish or use it as the source for the build.');
}

main().catch(e=>{ console.error(e); process.exit(1); });

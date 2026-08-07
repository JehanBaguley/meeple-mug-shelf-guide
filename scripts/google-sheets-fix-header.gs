// Google Apps Script: safer auto-repair header order for published CSV
// Usage: paste into the sheet's Apps Script editor (Extensions → Apps Script),
// then run `runOnce()` to preview and apply. The script creates a backup
// sheet before making changes. It uses strict matching (canonical + aliases),
// reports ambiguous or missing headers and aborts unless `force` is true.

const CANONICAL_HEADERS = [
  'name','bgg_link','playable','status','for_sale','expansion','price','price_text','rating','players','age','time','category','play_style','blurb','pick_by','pick_note','rec_list','rec_note','notes','rules_link'
];

const TARGET_SHEET_NAME = '';

// Common header aliases (keep in sync with the client/server parsing code)
const HEADER_ALIASES = {
  game: 'name', title: 'name', game_name: 'name', player_count: 'players', no_of_players: 'players', num_players: 'players', playtime: 'time', play_time: 'time', duration: 'time', length: 'time', age_rating: 'age', ages: 'age', min_age: 'age', categories: 'category', genre: 'category', genres: 'category', forsale: 'for_sale', in_stock: 'for_sale', play_here: 'playable', on_shelf: 'playable', bgg: 'rating', bgg_rating: 'rating', bgg_url: 'bgg_link', description: 'blurb', price_text: 'price_text'
};

function normalizeHeader(h){ return (h||'').toString().toLowerCase().trim().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,''); }

function locateHeaderIndex(existingNorm, target){
  // strict exact match first
  const exact = existingNorm.map((v,i)=>v===target?i:-1).filter(i=>i>-1);
  if(exact.length===1) return exact[0];
  if(exact.length>1) return -2; // ambiguous
  // try aliases
  const alias = Object.keys(HEADER_ALIASES).find(k => HEADER_ALIASES[k]===target);
  if(alias){ const i = existingNorm.indexOf(alias); if(i>-1) return i; }
  // nothing found
  return -1;
}

function fixHeaderOrder(force){
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = TARGET_SHEET_NAME ? ss.getSheetByName(TARGET_SHEET_NAME) : ss.getActiveSheet();
  if(!sheet){
    try{ SpreadsheetApp.getUi().alert('Target sheet not found. Check TARGET_SHEET_NAME.'); }
    catch(e){ Logger.log('Target sheet not found. Check TARGET_SHEET_NAME.'); }
    throw new Error('Target sheet not found. Check TARGET_SHEET_NAME.');
  }
  const values = sheet.getDataRange().getValues();
  if(!values || values.length===0) return;
  const existingHeader = values[0].map(normalizeHeader);

  // build mapping for canonical headers
  const mapping = [];
  const problems = {missing:[],ambiguous:[]};
  CANONICAL_HEADERS.forEach((h,i)=>{
    const idx = locateHeaderIndex(existingHeader,h);
    if(idx===-2) problems.ambiguous.push(h);
    else if(idx===-1) problems.missing.push(h);
    mapping.push(idx);
  });

  // if ambiguous or missing and not forced, abort and show a clear message
  if(!force && (problems.ambiguous.length || problems.missing.length)){
    const msg = 'Header check: ambiguous or missing columns.\n\nAmbiguous: '+(problems.ambiguous.join(', ')||'none')+'\nMissing: '+(problems.missing.join(', ')||'none')+'\n\nRun with force=true only if you understand the risks.';
    try{ SpreadsheetApp.getUi().alert(msg); }
    catch(e){ Logger.log(msg); }
    Logger.log('Mapping problems: %s', JSON.stringify(problems));
    throw new Error('Header mapping problems: see logs or UI alert');
  }

  // create a backup sheet with timestamped name
  const ts = new Date().toISOString().replace(/[:.]/g,'-');
  const backupName = '__backup_sheet_'+ts;
  const backup = ss.insertSheet(backupName);
  backup.getRange(1,1,values.length, values[0].length).setValues(values);
  try{ backup.hideSheet(); }catch(e){ /* non-fatal */ }

  // determine unmatched existing columns (those not mapped to canonical)
  const mappedIdx = new Set(mapping.filter(i=>i>=0));
  const unmatched = [];
  for(let c=0;c<existingHeader.length;c++) if(!mappedIdx.has(c)) unmatched.push(c);

  // build output rows: canonical headers first, then unmatched columns (preserve original header text)
  const outCols = CANONICAL_HEADERS.length + unmatched.length;
  const out = new Array(values.length).fill(0).map(()=>new Array(outCols).fill(''));
  // header row
  for(let j=0;j<CANONICAL_HEADERS.length;j++) out[0][j]=CANONICAL_HEADERS[j];
  for(let k=0;k<unmatched.length;k++) out[0][CANONICAL_HEADERS.length+k] = values[0][unmatched[k]] || '';

  // fill data rows
  for(let r=1;r<values.length;r++){
    for(let j=0;j<CANONICAL_HEADERS.length;j++){
      const ci = mapping[j];
      out[r][j] = (ci>=0 && values[r][ci]!==undefined) ? values[r][ci] : '';
    }
    for(let k=0;k<unmatched.length;k++){
      out[r][CANONICAL_HEADERS.length+k] = values[r][unmatched[k]] || '';
    }
  }

  // overwrite in-place (preserve sheet gid). Clear then write the new table.
  sheet.clearContents();
  sheet.getRange(1,1,out.length,out[0].length).setValues(out);
  SpreadsheetApp.getActiveSpreadsheet().toast('Header repaired; backup: '+backupName,'Header fix');
  Logger.log('Header repaired. Backup sheet: %s', backupName);
}

// onEdit: run only on explicit header edits; keep conservative (no force)
function onEdit(e){
  try{ if(e && e.range && e.range.getRow()===1){ Utilities.sleep(250); fixHeaderOrder(false); } }catch(err){ Logger.log('onEdit failed: %s', err); }
}

function onOpen(){ SpreadsheetApp.getUi().createMenu('Sheet Tools').addItem('Repair header order (safe)','runRepairSafe').addItem('Repair header order (force)','runRepairForce').addToUi(); }

function runOnce(){ runRepairSafe(); }
function runRepairSafe(){ fixHeaderOrder(false); }
function runRepairForce(){ fixHeaderOrder(true); }

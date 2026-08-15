import { chromium } from 'playwright';
// CI-ready: BASE_URL and PW_EXECUTABLE come from env; defaults match local dev.
const __B = process.env.BASE_URL || 'http://127.0.0.1:8899/';

const b = await chromium.launch({ executablePath: process.env.PW_EXECUTABLE || undefined });
const out = {}, errs = [];
const IG = /ERR_TUNNEL|ERR_NAME|ERR_CONNECTION|fonts\.g|gviz|docs\.google|powered-by-bgg/;
const U = __B + 'index.html';
const p = await b.newPage({ viewport: { width: 1400, height: 800 } });
p.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
p.on('console', m => { if (m.type()==='error' && !IG.test(m.text())) errs.push('CONSOLE ' + m.text()); });
await p.goto(U, { waitUntil: 'domcontentloaded' });
await p.evaluate(() => { try { localStorage.clear(); } catch(e){} });
await p.goto(U, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(2200);

// THE BUG: few results, tall sidebar. The page must still scroll to reach the bottom
// of the filters, with the cursor anywhere.
await p.evaluate(() => { state.query = 'zzz'; state.limit = 12; render(); });
await p.waitForTimeout(400);
out.fewResults = await p.evaluate(() => {
  const side = document.querySelector('.side');
  return { cards: document.querySelectorAll('#list .gname h3').length,
           sideHeight: Math.round(side.getBoundingClientRect().height),
           pageScrollable: document.documentElement.scrollHeight > window.innerHeight + 20,
           sideHasOwnScroll: getComputedStyle(side).overflowY === 'auto' };
});
// scroll the PAGE (cursor over the results area, not the sidebar) and check the bottom
// of the filter panel comes into view
out.canReachBottom = await p.evaluate(async () => {
  const price = [...document.querySelectorAll('.fgrouphd')].find(e => /picks/i.test(e.textContent));
  window.scrollTo(0, document.documentElement.scrollHeight);
  await new Promise(r => setTimeout(r, 300));
  const r = price.getBoundingClientRect();
  return { visible: r.top >= 0 && r.bottom <= window.innerHeight, top: Math.round(r.top) };
});
await p.evaluate(() => { state.query=''; resetAll(); window.scrollTo(0,0); });
await p.waitForTimeout(400);

// sticky header is still pinned, but subtle
out.stickyHead = await p.evaluate(async () => {
  window.scrollTo(0, 500); await new Promise(r => setTimeout(r, 250));
  const m = document.querySelector('.mtop');
  const cs = getComputedStyle(m);
  return { top: Math.round(m.getBoundingClientRect().top), position: cs.position,
           border: cs.borderBottomWidth, padTop: cs.paddingTop };
});
await p.evaluate(() => window.scrollTo(0,0));

// the hidden-games note must name what is actually missing
await p.waitForTimeout(200);
out.hiddenNote = await p.evaluate(async () => {
  state.minSeats = 1; state.maxSeats = 8; render();
  await new Promise(r => setTimeout(r, 200));
  const el = document.getElementById('hiddenNote');
  return { text: el.textContent, hidden: el.hidden };
});
out.hiddenNoteTimeOnly = await p.evaluate(async () => {
  resetAll(); state.tHi = 4; render();
  await new Promise(r => setTimeout(r, 200));
  return document.getElementById('hiddenNote').textContent;
});

// mobile sheet scrolls internally and the Done button stays reachable
const m = await b.newPage({ viewport: { width: 390, height: 780 } });
m.on('pageerror', e => errs.push('MOBILE ' + e.message));
await m.goto(U, { waitUntil: 'domcontentloaded' }); await m.waitForTimeout(2200);
await m.click('#mfilt'); await m.waitForTimeout(500);
out.mobileSheet = await m.evaluate(() => {
  const panel = document.querySelector('.panel'), done = document.querySelector('.sheetdone');
  const cs = getComputedStyle(panel);
  return { overflow: cs.overflowY, scrollable: panel.scrollHeight > panel.clientHeight,
           doneVisible: done ? done.getBoundingClientRect().bottom <= window.innerHeight + 2 : 'no done btn',
           bodyLocked: getComputedStyle(document.body).overflow };
});
await m.close();

out.errors = errs;
await p.close(); await b.close();
console.log(JSON.stringify(out, null, 1));

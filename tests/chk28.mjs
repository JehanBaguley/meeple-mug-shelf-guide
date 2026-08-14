// The ghost-tab regression test: open the sheet, unfold the availability group,
// and demand the pressed tab is visibly amber (pill measured) or amber-backed (fallback).
import { chromium } from 'playwright';
// CI-ready: BASE_URL and PW_EXECUTABLE come from env; defaults match local dev.
const __B = process.env.BASE_URL || 'http://127.0.0.1:8899/';

const B = __B;
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS' : 'FAIL') + ' ' + m); if (!c) fails++; };
const br = await chromium.launch({ executablePath: process.env.PW_EXECUTABLE || undefined });

const pg = await br.newPage({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true });
await pg.goto(B, { waitUntil: 'networkidle' });
await pg.waitForSelector('.gcard');

// open sheet, unfold "Taking one home" so seg2 becomes visible
await pg.click('#mfilt'); await pg.waitForTimeout(400);
await pg.click('#homeGrp summary'); await pg.waitForTimeout(450);

const r = await pg.evaluate(() => {
  const seg2 = document.getElementById('seg2');
  const on = seg2.querySelector('[aria-pressed="true"]');
  const pill = seg2.querySelector('.segpill');
  const pr = pill ? pill.getBoundingClientRect() : null;
  const or_ = on.getBoundingClientRect();
  const pillPlaced = pr && pr.width > 10 && Math.abs(pr.left - or_.left) < 4 && pill.style.opacity !== '0';
  const fallback = seg2.classList.contains('nopill') && getComputedStyle(on).backgroundColor !== 'rgba(0, 0, 0, 0)';
  return { pillPlaced, fallback, text: on.textContent, textColor: getComputedStyle(on).color };
});
ok(r.pillPlaced || r.fallback, `sheet seg2 pressed tab visibly marked (pill=${r.pillPlaced} fallback=${r.fallback}, "${r.text}")`);
ok(r.textColor !== 'rgb(236, 229, 211)', 'pressed tab text is ink, not cream');

// switch tabs inside the sheet and re-check the pill follows
await pg.click('#seg2 [data-seg="buy"]'); await pg.waitForTimeout(600);
const r2 = await pg.evaluate(() => {
  const seg2 = document.getElementById('seg2');
  const on = seg2.querySelector('[aria-pressed="true"]');
  const pill = seg2.querySelector('.segpill');
  const pr = pill.getBoundingClientRect(), or_ = on.getBoundingClientRect();
  return { follows: Math.abs(pr.left - or_.left) < 4 && Math.abs(pr.width - or_.width) < 4, seg: on.dataset.seg };
});
ok(r2.follows && r2.seg === 'buy', 'pill follows a tab change made inside the sheet');

// close, reopen: still placed
await pg.click('#sheetDone'); await pg.waitForTimeout(300);
await pg.click('#mfilt'); await pg.waitForTimeout(500);
const r3 = await pg.evaluate(() => {
  const seg2 = document.getElementById('seg2');
  const on = seg2.querySelector('[aria-pressed="true"]');
  const pill = seg2.querySelector('.segpill');
  if (!on.offsetWidth) return { na: true }; // group folded again is fine; fallback covers
  const pr = pill.getBoundingClientRect(), or_ = on.getBoundingClientRect();
  return { placed: Math.abs(pr.left - or_.left) < 4 };
});
ok(r3.na || r3.placed, 'pill correct after close/reopen');

// desktop main bar still right after everything
const pd = await br.newPage({ viewport: { width: 1400, height: 900 } });
await pd.goto(B, { waitUntil: 'networkidle' }); await pd.waitForSelector('.gcard');
const r4 = await pd.evaluate(() => {
  const on = document.querySelector('#seg [aria-pressed="true"]');
  const pill = document.querySelector('#seg .segpill');
  const pr = pill.getBoundingClientRect(), or_ = on.getBoundingClientRect();
  return Math.abs(pr.left - or_.left) < 3 && Math.abs(pr.width - or_.width) < 3;
});
ok(r4, 'desktop main bar pill still aligned');
await br.close();
console.log(fails ? fails + ' FAILURES' : 'ALL PASS');
process.exit(fails ? 1 : 0);

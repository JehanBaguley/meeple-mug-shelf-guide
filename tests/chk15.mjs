import { chromium } from 'playwright';
// CI-ready: BASE_URL and PW_EXECUTABLE come from env; defaults match local dev.
const __B = process.env.BASE_URL || 'http://127.0.0.1:8899/';

const b = await chromium.launch({ executablePath: process.env.PW_EXECUTABLE || undefined });
const out = {}, errs = [];
const IGNORE = /ERR_TUNNEL|ERR_NAME|ERR_CONNECTION|fonts\.g|gviz|docs\.google|powered-by-bgg/;
const U = __B + 'index.html';
const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
p.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
p.on('console', m => { if (m.type() === 'error' && !IGNORE.test(m.text())) errs.push('CONSOLE ' + m.text()); });
await p.route('**/data/games.json', async r => { await new Promise(s => setTimeout(s, 800)); await r.continue(); });
await p.goto(U, { waitUntil: 'domcontentloaded' });
await p.evaluate(() => { try { localStorage.clear(); } catch(e){} });
await p.goto(U, { waitUntil: 'domcontentloaded' });

await p.waitForTimeout(300);
out.duringLoad = await p.evaluate(() => ({
  skCards: document.querySelectorAll('#skList .skcard').length,
  skGenre: document.querySelectorAll('#skGenre .skchip').length,
  skPicks: document.querySelectorAll('#skPicks .skpill').length,
  skSliders: document.querySelectorAll('#skSliders .sktrack').length,
  sliders: document.querySelectorAll('input[type=range].dual').length,
}));

await p.waitForTimeout(2200);
out.afterLoad = await p.evaluate(() => ({
  skeletonsLeft: document.querySelectorAll('.skel').length,
  cards: document.querySelectorAll('#list .gname h3').length,
  sliders: document.querySelectorAll('input[type=range].dual').length,
  pills: document.querySelectorAll('.segpill').length,
}));

// the pill should sit exactly over the pressed tab, and move when the tab changes
const pillVsTab = async () => p.evaluate(() => {
  const seg = document.querySelector('.seg');
  const pill = seg.querySelector('.segpill');
  const on = seg.querySelector('[aria-pressed="true"]');
  const pr = pill.getBoundingClientRect(), or_ = on.getBoundingClientRect();
  return { tab: on.textContent.trim(), aligned: Math.abs(pr.left - or_.left) < 2 && Math.abs(pr.width - or_.width) < 2,
           pillLeft: Math.round(pr.left) };
});
out.pillAtStart = await pillVsTab();
await p.click('[data-seg="buy"]'); await p.waitForTimeout(500);
out.pillAfterClick = await pillVsTab();
out.pillMoved = out.pillAfterClick.pillLeft !== out.pillAtStart.pillLeft;

// ripple appears on tap and cleans itself up
await p.click('[data-seg="play"]');
out.rippleImmediately = await p.evaluate(() => document.querySelectorAll('.rip').length);
await p.waitForTimeout(800);
out.rippleCleanedUp = await p.evaluate(() => document.querySelectorAll('.rip').length);

// the pill must survive a resize
await p.setViewportSize({ width: 900, height: 900 }); await p.waitForTimeout(400);
out.pillAfterResize = await pillVsTab();

// reduced motion kills the movement but keeps the position
const q = await b.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
await q.goto(U, { waitUntil: 'domcontentloaded' }); await q.waitForTimeout(2000);
out.reducedMotion = await q.evaluate(() => {
  const pill = document.querySelector('.segpill');
  return { transition: getComputedStyle(pill).transitionDuration, hasPill: !!pill };
});
await q.close();

// mobile
const m = await b.newPage({ viewport: { width: 390, height: 844 } });
m.on('pageerror', e => errs.push('MOBILE ' + e.message));
await m.goto(U, { waitUntil: 'domcontentloaded' }); await m.waitForTimeout(2200);
out.mobile = await m.evaluate(() => ({
  cards: document.querySelectorAll('#list .gname h3').length,
  skeletonsLeft: document.querySelectorAll('.skel').length,
  pills: document.querySelectorAll('.segpill').length,
}));
await m.close();

out.errors = errs;
await p.close(); await b.close();
console.log(JSON.stringify(out, null, 1));

import { chromium } from 'playwright';
// CI-ready: BASE_URL and PW_EXECUTABLE come from env; defaults match local dev.
const __B = process.env.BASE_URL || 'http://127.0.0.1:8899/';

const B = __B;
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS' : 'FAIL') + ' ' + m); if (!c) fails++; };
const br = await chromium.launch({ executablePath: process.env.PW_EXECUTABLE || undefined });

// ---- mobile: pill responds immediately, no ripple on segs, tab scroll lands at list top
const pg = await br.newPage({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true });
await pg.goto(B, { waitUntil: 'networkidle' });
await pg.waitForSelector('.gcard');

// no ripple element spawns on a seg tap
await pg.click('#seg [data-seg="play"]');
const rip = await pg.evaluate(() => document.querySelectorAll('#seg .rip').length);
ok(rip === 0, 'no ripple spawned inside the tab bar');

// pill has begun moving before the heavy render lands (aria flips immediately)
const aria = await pg.evaluate(() => document.querySelector('#seg [data-seg="play"]').getAttribute('aria-pressed'));
ok(aria === 'true', 'pressed state flips in the same frame as the tap');
await pg.waitForTimeout(500);

// scrolled deep, switching tabs lands at the top of the results, not clamped randomly
await pg.evaluate(() => window.scrollTo(0, 4000));
await pg.waitForTimeout(200);
await pg.click('#seg [data-seg="buy"]');
// poll: slow CI machines take a few frames to render, settle and scroll
let s = { csTop: -9999 };
for (let i = 0; i < 20; i++) {
  await pg.waitForTimeout(150);
  s = await pg.evaluate(() => ({ csTop: document.querySelector('.countsort').getBoundingClientRect().top }));
  if (s.csTop > -40 && s.csTop < 300) break;
}
ok(s.csTop > -40 && s.csTop < 300, `tab change lands at the top of the list (countsort at ${Math.round(s.csTop)}px)`);

// chips still ripple
await pg.evaluate(() => window.scrollTo(0, 0));
await pg.click('#seg [data-seg="all"]'); await pg.waitForTimeout(400);
await pg.click('#mfilt'); await pg.waitForTimeout(400);
await pg.click('.genrow .wt'); // "Any" play style chip
const rip2 = await pg.evaluate(() => document.querySelectorAll('.rip').length);
ok(rip2 > 0, 'chips still get the tap ripple');
await pg.waitForTimeout(700);
const rip3 = await pg.evaluate(() => document.querySelectorAll('.rip').length);
ok(rip3 === 0, 'ripple cleans itself up');

// seg2 in the sheet: unfold and confirm pill correctness end to end
await pg.click('#homeGrp summary'); await pg.waitForTimeout(500);
const p2 = await pg.evaluate(() => {
  const seg2 = document.getElementById('seg2');
  const on = seg2.querySelector('[aria-pressed="true"]');
  const pill = seg2.querySelector('.segpill');
  if (!pill) return { placed: false };
  const pr = pill.getBoundingClientRect(), or_ = on.getBoundingClientRect();
  return { placed: Math.abs(pr.left - or_.left) < 4 && pr.width > 10, instantOff: !pill.classList.contains('instant') || true };
});
ok(p2.placed, 'sheet seg2 pill placed after reveal');
await pg.close();

// ---- desktop: pill instant-snaps on resize (no glide), animates on tap
const pd = await br.newPage({ viewport: { width: 1400, height: 900 } });
await pd.goto(B, { waitUntil: 'networkidle' }); await pd.waitForSelector('.gcard');
await pd.setViewportSize({ width: 1200, height: 900 });
await pd.waitForTimeout(120);
const d1 = await pd.evaluate(() => {
  const pill = document.querySelector('#seg .segpill');
  const on = document.querySelector('#seg [aria-pressed="true"]');
  const pr = pill.getBoundingClientRect(), or_ = on.getBoundingClientRect();
  return { snapped: Math.abs(pr.left - or_.left) < 3, instant: pill.classList.contains('instant') };
});
ok(d1.snapped, 'resize snaps the pill straight to place');
ok(d1.instant, 'resize placement carries the instant class (no glide)');
await pd.click('#seg [data-seg="play"]'); await pd.waitForTimeout(80);
const d2 = await pd.evaluate(() => !document.querySelector('#seg .segpill').classList.contains('instant'));
ok(d2, 'tap placement animates (instant class off)');
await br.close();
console.log(fails ? fails + ' FAILURES' : 'ALL PASS');
process.exit(fails ? 1 : 0);

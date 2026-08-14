// ux-plan verification: bar above columns, folded groups, mobile sheet intact,
// container cap, sticky offsets. Fails loudly on any miss.
import { chromium } from 'playwright';
// CI-ready: BASE_URL and PW_EXECUTABLE come from env; defaults match local dev.
const __B = process.env.BASE_URL || 'http://127.0.0.1:8899/';

const B = __B;
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS' : 'FAIL') + ' ' + m); if (!c) fails++; };

const br = await chromium.launch({ executablePath: process.env.PW_EXECUTABLE || undefined });

// ---------- desktop 1400x900 ----------
{
  const pg = await br.newPage({ viewport: { width: 1400, height: 900 } });
  await pg.goto(B, { waitUntil: 'networkidle' });
  await pg.waitForSelector('.gcard');

  // 1. mtop is a child of main, above .cols, and spans (nearly) the container width
  const r = await pg.evaluate(() => {
    const mtop = document.querySelector('.mtop'), cols = document.querySelector('.cols');
    const mb = mtop.getBoundingClientRect(), cb = cols.getBoundingClientRect();
    return {
      parentIsMain: mtop.parentElement === document.querySelector('main.wrap'),
      aboveCols: mb.bottom <= cb.top + 1,
      width: mb.width, colsWidth: cb.width,
      sticky: getComputedStyle(mtop).position === 'sticky',
    };
  });
  ok(r.parentIsMain, 'desktop: mtop lives in main.wrap');
  ok(r.aboveCols, 'desktop: mtop sits above the columns');
  ok(Math.abs(r.width - r.colsWidth) < 2, `desktop: mtop spans full container (${r.width} vs ${r.colsWidth})`);
  ok(r.sticky, 'desktop: mtop is sticky');

  // 2. segDesc hidden on desktop, search + tabs on one row
  const r2 = await pg.evaluate(() => {
    const sd = document.getElementById('segDesc');
    const row = document.querySelector('.mtoprow').getBoundingClientRect();
    const seg = document.getElementById('seg').getBoundingClientRect();
    return { sdHidden: getComputedStyle(sd).display === 'none', sameRow: Math.abs(row.top - seg.top) < 12 };
  });
  ok(r2.sdHidden, 'desktop: segDesc hidden');
  ok(r2.sameRow, 'desktop: search and tabs share the row');

  // 3. folded groups closed by default; open ones still open
  const r3 = await pg.evaluate(() => ({
    home: document.getElementById('homeGrp').open,
    picks: document.getElementById('picksLabel').open,
    table: !!document.querySelector('.fgroup .dualwrap'),
  }));
  ok(!r3.home && !r3.picks, 'desktop: Taking one home + picks folded by default');
  ok(r3.table, 'desktop: Your table group present and open');

  // 4. clicking Take home unfolds the price group
  await pg.click('#seg [data-seg="buy"]');
  await pg.waitForTimeout(150);
  const r4 = await pg.evaluate(() => ({
    open: document.getElementById('homeGrp').open,
    priceVisible: !document.getElementById('priceGrp').hidden,
  }));
  ok(r4.open && r4.priceVisible, 'desktop: Take home tab unfolds the group and shows price');

  // 5. countsort pins under the bar, not under it visually
  await pg.click('#seg [data-seg="all"]');
  await pg.evaluate(() => window.scrollTo(0, 1200));
  await pg.waitForTimeout(250);
  const r5 = await pg.evaluate(() => {
    const cs = document.querySelector('.countsort').getBoundingClientRect();
    const mt = document.querySelector('.mtop').getBoundingClientRect();
    return { csTop: cs.top, mtBottom: mt.bottom, mtTop: mt.top };
  });
  ok(r5.mtTop <= 1, 'desktop scrolled: mtop pinned at top');
  ok(r5.csTop >= r5.mtBottom - 2, `desktop scrolled: countsort pins below the bar (cs ${r5.csTop} vs bar bottom ${r5.mtBottom})`);

  // 6. pill sits on the pressed tab after all this
  const r6 = await pg.evaluate(() => {
    const p = document.querySelector('.segpill'); if (!p) return { okp: true };
    const b = document.querySelector('#seg [aria-pressed="true"]').getBoundingClientRect();
    const pb = p.getBoundingClientRect();
    return { okp: Math.abs(pb.left - b.left) < 3 && Math.abs(pb.width - b.width) < 3 };
  });
  ok(r6.okp, 'desktop: seg pill aligned with pressed tab');

  // 7. deep-link with price + pick opens the folded groups
  const pg2 = await br.newPage({ viewport: { width: 1400, height: 900 } });
  await pg2.goto(B + '?av=buy&pr=10-100', { waitUntil: 'networkidle' });
  await pg2.waitForSelector('.gcard');
  const r7 = await pg2.evaluate(() => document.getElementById('homeGrp').open);
  ok(r7, 'desktop: restored buy/price view opens the folded group');
  await pg2.close();
  await pg.close();
}

// ---------- wide 1920x1000: container cap ----------
{
  const pg = await br.newPage({ viewport: { width: 1920, height: 1000 } });
  await pg.goto(B, { waitUntil: 'networkidle' });
  await pg.waitForSelector('.gcard');
  const r = await pg.evaluate(() => {
    const w = document.querySelector('main.wrap').getBoundingClientRect().width;
    const cards = getComputedStyle(document.querySelector('.list')).gridTemplateColumns.split(' ').length;
    return { w, cards };
  });
  ok(r.w <= 1600.5, `wide: container capped (${r.w})`);
  ok(r.cards === 3, `wide: three columns (${r.cards})`);
  await pg.close();
}

// ---------- mobile 390x780 ----------
{
  const pg = await br.newPage({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true });
  await pg.goto(B, { waitUntil: 'networkidle' });
  await pg.waitForSelector('.gcard');

  const m1 = await pg.evaluate(() => {
    const mtop = document.querySelector('.mtop');
    return {
      parentIsMain: mtop.parentElement === document.querySelector('main.wrap'),
      sticky: getComputedStyle(mtop).position === 'sticky',
      segDesc: getComputedStyle(document.getElementById('segDesc')).display !== 'none',
      headerPx: document.querySelector('.countsort').getBoundingClientRect().top,
    };
  });
  ok(m1.parentIsMain, 'mobile: mtop in main.wrap');
  ok(m1.sticky, 'mobile: mtop sticky');
  ok(m1.segDesc, 'mobile: segDesc visible');
  console.log('INFO mobile: content above results = ' + Math.round(m1.headerPx) + 'px');

  // open the filter sheet
  await pg.click('#mfilt');
  await pg.waitForTimeout(350);
  const m2 = await pg.evaluate(() => {
    const done = document.getElementById('sheetDone');
    const db = done.getBoundingClientRect();
    const fw = document.getElementById('filterWrap');
    return {
      open: document.body.classList.contains('sheet-open'),
      doneVisible: db.height > 0 && db.bottom <= innerHeight + 1,
      doneText: done.textContent,
      scrolls: fw.scrollHeight > fw.clientHeight,
      home: document.getElementById('homeGrp').open,
    };
  });
  ok(m2.open, 'mobile: sheet opens');
  ok(m2.doneVisible, 'mobile: commit bar visible and pinned at bottom');
  ok(/^See \d+ games?$/.test(m2.doneText), `mobile: commit bar carries live count ("${m2.doneText}")`);
  ok(!m2.home, 'mobile: folded group folded in sheet too');

  // scroll the sheet: commit bar must not move
  await pg.evaluate(() => { document.getElementById('filterWrap').scrollTop = 400; });
  await pg.waitForTimeout(150);
  const m3 = await pg.evaluate(() => {
    const db = document.getElementById('sheetDone').getBoundingClientRect();
    return db.bottom <= innerHeight + 1 && db.height > 0;
  });
  ok(m3, 'mobile: commit bar stays pinned while sheet scrolls');

  // unfold picks group inside the sheet and pick something if present
  await pg.click('#picksLabel summary').catch(() => {});
  await pg.waitForTimeout(150);
  const m4 = await pg.evaluate(() => document.getElementById('picksLabel').open);
  ok(m4, 'mobile: picks group unfolds on tap');

  // Done closes
  await pg.click('#sheetDone');
  await pg.waitForTimeout(350);
  const m5 = await pg.evaluate(() => !document.body.classList.contains('sheet-open'));
  ok(m5, 'mobile: Done closes the sheet');
  await pg.close();
}

await br.close();
console.log(fails ? `\n${fails} FAILURES` : '\nALL PASS');
process.exit(fails ? 1 : 0);

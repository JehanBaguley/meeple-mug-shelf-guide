// PWA: manifest wired, service worker registers, and the site survives offline.
import { chromium } from 'playwright';
const __B = process.env.BASE_URL || 'http://127.0.0.1:8899/';
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS' : 'FAIL') + ' ' + m); if (!c) fails++; };

const br = await chromium.launch({ executablePath: process.env.PW_EXECUTABLE || undefined });
const ctx = await br.newContext({ viewport: { width: 390, height: 780 } });
const pg = await ctx.newPage();
await pg.goto(__B, { waitUntil: 'networkidle' });
await pg.waitForSelector('.gcard');

const m = await pg.evaluate(() => ({
  manifest: !!document.querySelector('link[rel="manifest"]'),
  touch: !!document.querySelector('link[rel="apple-touch-icon"]'),
}));
ok(m.manifest, 'manifest linked');
ok(m.touch, 'apple-touch-icon linked');

// wait for the worker to take control
const sw = await pg.evaluate(async () => {
  if (!('serviceWorker' in navigator)) return 'unsupported';
  const reg = await navigator.serviceWorker.ready;
  return reg.active ? reg.active.state : 'none';
});
ok(sw === 'activated', `service worker activated (${sw})`);

// give the install precache a beat, then reload once ONLINE so the SW controls the page
await pg.waitForTimeout(800);
await pg.reload({ waitUntil: 'networkidle' });
await pg.waitForSelector('.gcard');

// now go offline and reload: the shelf should still be there
await ctx.setOffline(true);
await pg.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
await pg.waitForTimeout(2500);
const off = await pg.evaluate(() => ({
  cards: document.querySelectorAll('.gcard').length,
  title: document.title,
}));
ok(off.cards > 20, `offline reload still renders the shelf (${off.cards} cards)`);
ok(/Shelf Guide/.test(off.title), 'offline page is the real app');
await ctx.setOffline(false);

await br.close();
console.log(fails ? fails + ' FAILURES' : 'ALL PASS');
process.exit(fails ? 1 : 0);

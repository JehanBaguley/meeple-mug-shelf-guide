// Guards against the sheet being able to run JavaScript in a customer's browser.
//
// Everything on a card is escaped at the point of interpolation, and was, except for two
// places found by an adversarial review: the staff-pick chip took the `pick_by` cell
// straight into innerHTML (zero-click, buildPicks runs on load), and the active-filter
// chip took a category token into a data-clear="..." ATTRIBUTE. Both were live.
//
// The lesson is that "we escape everything" is not checkable by reading. This is.
//
// It intercepts the data fetch rather than editing any file, so it can be hostile without
// leaving anything hostile in the repo.
import { chromium } from 'playwright';

const __B = process.env.BASE_URL || 'http://127.0.0.1:8899/';
const br = await chromium.launch({ executablePath: process.env.PW_EXECUTABLE || undefined });
const pg = await br.newPage({ viewport: { width: 1280, height: 1000 } });
const fail = [];
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail.push(m); };

// Payloads chosen to cover the two contexts that actually differ: HTML text, and inside a
// quoted attribute. The attribute one needs no angle brackets, which is why entity-escaping
// only the text context is not enough.
const IMG = '<img src=x onerror="window.__X_TEXT=1">';
const ATTR = 'x" onmouseover="window.__X_ATTR=1" data-y="';

const hostile = {
  built: '2026-01-01T00:00:00.000Z',
  count: 2,
  picks: [{ list: IMG, note: IMG, games: { 'Azul': IMG } },
          { list: '__proto__', note: '', games: { 'Azul': 'proto pollution probe' } }],
  games: [
    { bggId: 1, name: IMG, players: [2, 4], mins: 30, time: '30m', age: '8+',
      catText: ATTR, tags: [ATTR], cat: 'cards', mode: 'comp', bgg: 7, weight: 2,
      playsLike: IMG, price: null, priceTxt: IMG, forSale: false, playable: true,
      pickBy: IMG, pickNote: IMG, status: IMG },
    { bggId: 2, name: 'Azul', players: [2, 4], mins: 45, time: '45m', age: '8+',
      catText: 'Abstract', tags: ['Abstract'], cat: 'cards', mode: 'comp', bgg: 7.7,
      weight: 1.8, playsLike: 'ok', price: null, priceTxt: null, forSale: false, playable: true },
  ],
};

await pg.route('**/data/games.json', route =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(hostile) }));
// A fork with no sheet has no CSV to serve; make sure the overlay path cannot rescue us.
await pg.route('**/gviz/**', route => route.fulfill({ status: 404, body: '' }));

await pg.goto(__B + 'index.html', { waitUntil: 'domcontentloaded' });
await pg.waitForTimeout(2500);

// 1. nothing executed on load
ok(await pg.evaluate(() => !window.__X_TEXT), 'no script executed from a hostile pick list name');
ok(await pg.evaluate(() => !window.__X_ATTR), 'no attribute breakout on load');

// 2. the payload is present as text, not as an element
const injected = await pg.evaluate(() => document.querySelectorAll('img[src="x"]').length);
ok(injected === 0, 'hostile <img> is not a real element anywhere in the document');
const onerrors = await pg.evaluate(() =>
  [...document.querySelectorAll('*')].filter(e => e.hasAttribute('onerror') || e.hasAttribute('onmouseover')).length);
ok(onerrors === 0, 'no inline event handler attributes exist in the document');

// 3. the pick chip specifically, since that one needed no interaction
const chip = await pg.evaluate(() => {
  const b = [...document.querySelectorAll('.pickchip')].find(x => x.textContent.includes('img'));
  return b ? b.innerHTML : '';
});
ok(!chip || chip.includes('&lt;img'), 'pick chip renders the payload escaped');

// 4. drive the active-filter chip, the attribute-context path
await pg.evaluate(() => { const t = document.querySelector('.gtag'); if (t) t.click(); });
await pg.waitForTimeout(400);
ok(await pg.evaluate(() => !window.__X_ATTR), 'no attribute breakout after selecting a genre');
const achip = await pg.evaluate(() => {
  const a = document.querySelector('.achip:not(.clearall)');
  return a ? { attrs: [...a.attributes].map(x => x.name), html: a.outerHTML } : null;
});
if (achip) {
  ok(!achip.attrs.some(n => n.startsWith('on')), 'active chip carries no on* attributes');
  ok(!achip.attrs.includes('data-y'), 'active chip attribute was not broken out of');
}

// 5. a pick list literally named __proto__ must not poison anything or throw
ok(await pg.evaluate(() => Object.prototype.games === undefined), 'Object.prototype not polluted');
const rendered = await pg.evaluate(() => document.querySelectorAll('.gcard').length);
ok(rendered === 2, 'both games still render, so nothing threw mid-build (' + rendered + ')');

console.log(JSON.stringify({ rendered, chipSample: chip.slice(0, 80) }, null, 1));
await br.close();
if (fail.length) { console.log('FAILURES: ' + fail.join(' | ')); process.exit(1); }
console.log('ALL PASS');

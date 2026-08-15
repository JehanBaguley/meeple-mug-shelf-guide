import { chromium } from 'playwright';
// CI-ready: BASE_URL and PW_EXECUTABLE come from env; defaults match local dev.
const __B = process.env.BASE_URL || 'http://127.0.0.1:8899/';

const b = await chromium.launch({ executablePath: process.env.PW_EXECUTABLE || undefined });
const U = __B + 'index.html';
const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto(U, { waitUntil: 'domcontentloaded' });
await p.evaluate(() => { try { localStorage.clear(); } catch(e){} });
await p.goto(U, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(2200);
const out = {};

const count = async t => p.evaluate(t => {
  const el = [...document.querySelectorAll('#genreRow .wt')].find(x => new RegExp('^'+t,'i').test(x.textContent.trim()));
  return el ? +el.textContent.replace(/[^0-9]/g,'') : null;
}, t);

await p.evaluate(() => { state.showAllGenres = true; buildTagRow(); });
await p.waitForTimeout(200);
out.unfiltered = { horror: await count('horror'), party: await count('party'), strategy: await count('strategy') };

// narrow to short, young, competitive, take-home only
await p.evaluate(() => { state.seg='buy'; state.tHi=3; state.aHi=9; state.playStyle='comp'; render(); buildTagRow(); });
await p.waitForTimeout(250);
out.filtered = { horror: await count('horror'), party: await count('party'), strategy: await count('strategy') };

// the number on a chip must equal what you get when you tap it
out.truthCheck = await p.evaluate(() => {
  const res = [];
  for (const name of ['party','strategy','card game']) {
    const el = [...document.querySelectorAll('#genreRow .wt')].find(x => new RegExp('^'+name,'i').test(x.textContent.trim()));
    if (!el) continue;
    const shown = +el.textContent.replace(/[^0-9]/g,'');
    state.tags[name] = 1; state.limit = 9999; render();
    const actual = document.querySelectorAll('#list .gname h3').length;
    delete state.tags[name]; render();
    res.push({ name, shown, actual, match: shown === actual });
  }
  return res;
});
out.errors = errs;
await p.close(); await b.close();
console.log(JSON.stringify(out, null, 1));

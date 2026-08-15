// Guards the setup wizard: it must produce a config.js that the real site and the
// real build script can both parse, and must never silently emit someone else's sheet.
import { chromium } from 'playwright';
const __B = process.env.BASE_URL || 'http://127.0.0.1:8899/';
const br = await chromium.launch({ executablePath: process.env.PW_EXECUTABLE || undefined });
const pg = await br.newPage({ viewport: { width: 1280, height: 1000 } });
const errors = [];
pg.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
pg.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
await pg.goto(__B + 'setup.html');
await pg.waitForTimeout(400);
const fail = [];
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail.push(m); };

// 1. default output parses as the same shape config.js uses
const out1 = await pg.textContent('#out');
const obj1 = JSON.parse(out1.slice(out1.indexOf('{'), out1.lastIndexOf('}') + 1));
ok(obj1.name === 'Meeple & Mug', 'default name round-trips');
ok(/gviz\/tq\?tqx=out:csv/.test(obj1.sheetCsvUrl), 'sheet link becomes a gviz csv feed');
ok(obj1.sheetCsvUrl.includes('1PuwiRbEurcLIG8YOUGzk6aBT5XMR9b9sVRWdrKw1pSQ'), 'sheet id preserved');
ok(JSON.stringify(obj1.colors) === '{}', 'default preset writes no colour overrides');

// 2. a fork's own sheet id is what comes out, not the template's
await pg.fill('#f-sheet', 'https://docs.google.com/spreadsheets/d/1AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/edit#gid=0');
await pg.fill('#f-name', 'Jehan’s Shelf');
await pg.waitForTimeout(150);
const out2 = await pg.textContent('#out');
const obj2 = JSON.parse(out2.slice(out2.indexOf('{'), out2.lastIndexOf('}') + 1));
ok(obj2.sheetCsvUrl.includes('1AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'), 'fork sheet id used');
ok(!obj2.sheetCsvUrl.includes('1PuwiRbEurcLIG8YOUGzk6aBT5XMR9b9sVRWdrKw1pSQ'), 'template sheet id gone');
ok(obj2.name === 'Jehan’s Shelf', 'curly apostrophe survives the round-trip');

// 3. empty sheet must mean empty string, never a fallback to the template's
await pg.fill('#f-sheet', '');
await pg.waitForTimeout(150);
const out3 = await pg.textContent('#out');
const obj3 = JSON.parse(out3.slice(out3.indexOf('{'), out3.lastIndexOf('}') + 1));
ok(obj3.sheetCsvUrl === '', 'blank sheet gives a deliberate empty string');

// 4. a colour change writes overrides, and derives the shades
await pg.click('.preset:nth-child(2)');
await pg.waitForTimeout(150);
const out4 = await pg.textContent('#out');
const obj4 = JSON.parse(out4.slice(out4.indexOf('{'), out4.lastIndexOf('}') + 1));
ok(Object.keys(obj4.colors).length > 4, 'preset writes a full derived palette');
ok(/^#[0-9a-f]{6}$/i.test(obj4.colors.bg), 'derived colours are valid hex');
ok(!!obj4.colors['bg-deep'] && obj4.colors['bg-deep'] !== obj4.colors.bg, 'deep shade derived, not copied');

// 5. quotes in a name must not break the JSON
await pg.fill('#f-name', 'The "Best" Café');
await pg.waitForTimeout(150);
const out5 = await pg.textContent('#out');
let parsed5 = null;
try { parsed5 = JSON.parse(out5.slice(out5.indexOf('{'), out5.lastIndexOf('}') + 1)); } catch (e) {}
ok(parsed5 && parsed5.name === 'The "Best" Café', 'double quotes in a name stay valid JSON');

// 6. meta tags track the name
const meta = await pg.textContent('#outmeta');
ok(meta.includes('<title>') && meta.includes('og:title'), 'meta block has title and og tags');

// 7. bad sheet link is called out rather than silently dropped
await pg.fill('#f-sheet', 'not a link');
await pg.waitForTimeout(150);
ok((await pg.textContent('#sheetnote')).includes("doesn't look like"), 'bad sheet link warns the user');

console.log(JSON.stringify({ errors }, null, 1));
await br.close();
// External font CDN is unreachable in some sandboxes; that is not a page fault.
const real = errors.filter(e => !/404|ERR_TUNNEL_CONNECTION_FAILED|ERR_FAILED|ERR_NAME_NOT_RESOLVED/.test(e));
if (fail.length || real.length) { console.log('FAILURES: ' + fail.concat(real).join(' | ')); process.exit(1); }
console.log('ALL PASS');

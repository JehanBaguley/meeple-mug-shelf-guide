// The sheet is the shelf. This proves the build refuses to publish anything else.
//
// On 24 Aug 2026 the cafe's sheet lost "anyone with the link can view". The CSV feed
// started answering 401 with an HTML sign-in page, fetch() did not throw, that page
// parsed as valid CSV with no recognised columns, sheetRows stayed 0, and the nightly
// published the raw BGG collection instead: 289 games nobody had vetted, no prices, no
// for-sale flags, no staff picks. It ran that way for eleven nights without one alarm.
//
// No browser needed. Runs build-data.mjs against a stub sheet server and asserts the
// process exits non-zero and leaves data/games.json byte-identical.
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS' : 'FAIL') + ' ' + m); if (!c) fails++; };

// spawnSync would block this process's event loop, and the stub sheet server lives in
// this process, so the child's request would never be answered. Async spawn only.
const run = (cwd, env) => new Promise(res => {
  const p = spawn(process.execPath, ['scripts/build-data.mjs'], { cwd, env: { ...process.env, ...env } });
  let stdout = '', stderr = '';
  p.stdout.on('data', d => stdout += d);
  p.stderr.on('data', d => stderr += d);
  const kill = setTimeout(() => p.kill('SIGKILL'), 30000);
  p.on('close', code => { clearTimeout(kill); res({ status: code, stdout, stderr }); });
});

// A stand-in for a shelf that is already live: whatever happens, this must survive.
const LIVE = JSON.stringify({ built: '2026-01-01T00:00:00.000Z', games: [{ name: 'Cascadia', bggId: 295947 }], picks: [{ list: 'Jehan', note: '', games: { Cascadia: '' } }] }, null, 1);

// Each case is [label, status, body]. The bodies are the real shapes Google returns.
const SIGN_IN = '<!DOCTYPE html><html><head><title>Sign in</title></head><body>You need permission</body></html>';
const CASES = [
  ['a 401 sign-in page (what actually happened)', 401, SIGN_IN],
  ['a 200 that is HTML, not the sheet', 200, SIGN_IN],
  ['a 200 CSV whose header row lost the name column', 200, 'foo,bar\n1,2\n'],
  ['a 500 from Google', 500, 'server error'],
];

for (const [label, status, body] of CASES) {
  // Fresh throwaway checkout so a bad build cannot damage the real tree.
  const dir = mkdtempSync(join(tmpdir(), 'shelf-'));
  mkdirSync(join(dir, 'scripts'), { recursive: true });
  mkdirSync(join(dir, 'data'), { recursive: true });
  cpSync('scripts/build-data.mjs', join(dir, 'scripts/build-data.mjs'));
  writeFileSync(join(dir, 'data/games.json'), LIVE);

  const srv = createServer((_, res) => { res.writeHead(status, { 'Content-Type': 'text/plain' }); res.end(body); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${srv.address().port}/sheet.csv`;

  // BGG_USER empty keeps this offline; the fallback the bug published came from there,
  // and its absence only makes the test stricter, not weaker.
  const r = await run(dir, { SHEET_CSV_URL: url, BGG_USER: '', BGG_TOKEN: '' });
  srv.close();

  ok(r.status !== 0, `${label}: build exits non-zero (got ${r.status})`);
  ok(readFileSync(join(dir, 'data/games.json'), 'utf8') === LIVE, `${label}: data/games.json untouched`);
  ok(/sheet is the shelf|no rows/i.test(r.stderr), `${label}: says why, on stderr`);
}

// Negative control: a sheet that reads properly must still build.
{
  const dir = mkdtempSync(join(tmpdir(), 'shelf-'));
  mkdirSync(join(dir, 'scripts'), { recursive: true });
  mkdirSync(join(dir, 'data'), { recursive: true });
  cpSync('scripts/build-data.mjs', join(dir, 'scripts/build-data.mjs'));
  const csv = 'name,bgg_link,playable,for_sale,price,blurb,pick_by,pick_note\n'
            + 'Cascadia,https://boardgamegeek.com/boardgame/295947/cascadia,y,n,,Tile-laying,Jehan,Cosy\n';
  const srv = createServer((_, res) => { res.writeHead(200, { 'Content-Type': 'text/csv' }); res.end(csv); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${srv.address().port}/sheet.csv`;
  const r = await run(dir, { SHEET_CSV_URL: url, BGG_USER: '', BGG_TOKEN: '' });
  srv.close();
  ok(r.status === 0, `a healthy sheet still builds (exit ${r.status})`);
  const out = JSON.parse(readFileSync(join(dir, 'data/games.json'), 'utf8'));
  ok(out.games.length === 1 && out.games[0].name === 'Cascadia', 'the one sheet row is the whole shelf');
  ok(out.picks.length === 1 && out.picks[0].list === 'Jehan', 'the staff pick survived');
}

console.log(fails ? `\n${fails} FAILED` : '\nall good');
process.exit(fails ? 1 : 0);

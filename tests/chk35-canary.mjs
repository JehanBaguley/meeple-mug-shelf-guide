// The canary. Everything else in this suite proves the code does what the code says.
// This one asks a different question: is the thing the public can see right now still
// this venue's catalogue?
//
// That distinction is not academic. In August 2026 the nightly published somebody's BGG
// collection instead of the cafe's shelf for eleven consecutive nights. Every CI run was
// green the whole time, because the code was doing exactly what the code said. Only the
// live output could have caught it, and nothing was looking at the live output.
//
// Two modes:
//   default            run the audit against fixtures, offline and deterministic. This
//                      is what the test suite runs, so a pull request is never red
//                      because a live site happened to be stale.
//   CANARY_LIVE=1      fetch the real site and audit that. This is what the scheduled
//                      canary workflow runs, an hour after the nightly.
import { readFileSync, existsSync } from 'node:fs';

let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS' : 'FAIL') + ' ' + m); if (!c) fails++; };

// ————— the audit, as a pure function so it can be tested without a network —————
// Returns a list of human-readable reasons the live catalogue should not be trusted.
// Every rule here is something a person put in the sheet, or a sign the pipeline stopped.
export function audit(doc, gapsText, exp, { requireFreshness, now = Date.now() } = {}) {
  const bad = [];
  if (!doc || !Array.isArray(doc.games)) return ['data/games.json is not a catalogue'];

  const games = doc.games, picks = Array.isArray(doc.picks) ? doc.picks : [];

  // Freshness catches a disabled schedule, a stuck Pages deploy and a silently failing
  // sync in one check. It only applies where a sheet is configured: the template ships a
  // demo shelf with a fixed date and must not go red for it.
  if (requireFreshness) {
    const built = Date.parse(doc.built);
    if (!Number.isFinite(built)) bad.push('built timestamp is missing or unparseable');
    else {
      const hours = (now - built) / 36e5;
      if (hours > exp.maxAgeHours) bad.push(`catalogue is ${hours.toFixed(1)}h old, limit is ${exp.maxAgeHours}h`);
    }
  }

  if (games.length < exp.games.min) bad.push(`only ${games.length} games, expected at least ${exp.games.min}`);
  if (games.length > exp.games.max) bad.push(`${games.length} games, expected at most ${exp.games.max}`);

  // Staff picks, prices and for-sale flags cannot come from anywhere but a person typing
  // them. If they are all gone, whatever is being served is not the venue's shelf.
  const lists = picks.filter(p => Object.keys(p.games || {}).length);
  const picked = picks.reduce((n, p) => n + Object.keys(p.games || {}).length, 0);
  if (lists.length < exp.minPickLists) bad.push(`${lists.length} non-empty pick lists, expected at least ${exp.minPickLists}`);
  if (picked < exp.minPickedGames) bad.push(`${picked} picked games, expected at least ${exp.minPickedGames}`);

  const forSale = games.filter(g => g.forSale && g.price != null).length;
  if (forSale < exp.minForSale) bad.push(`${forSale} games for sale with a price, expected at least ${exp.minForSale}`);

  // The exact fingerprint of the August fault: BGG's XML returns entity-escaped names,
  // and the venue's own spelling never contains them.
  const escaped = games.filter(g => typeof g.name === 'string' && g.name.includes('&#')).map(g => g.name);
  if (escaped.length) bad.push(`${escaped.length} names still carry HTML entities, e.g. ${escaped[0]}. That is BGG's spelling, not the venue's`);

  if (gapsText != null) {
    const lines = gapsText.split('\n').filter(Boolean).length;
    if (lines > exp.maxGapLines) bad.push(`${lines} gap flags, limit is ${exp.maxGapLines}`);
  }
  return bad;
}

// ————— where the live site lives —————
// Derived, so a fork inherits this with nothing to configure. SITE_URL overrides it for
// a custom domain or a local fixture server.
function siteUrl() {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/?$/, '/');
  const repo = process.env.GITHUB_REPOSITORY;
  if (repo) { const [owner, name] = repo.split('/'); return `https://${owner.toLowerCase()}.github.io/${name}/`; }
  throw new Error('No SITE_URL and no GITHUB_REPOSITORY, so there is no site to check');
}

// A sheet is configured if the workflow passed one, or config.js names one. Freshness
// only makes sense when something is meant to be refreshing the catalogue.
function sheetConfigured() {
  if ((process.env.SHEET_CSV_URL || '').trim()) return true;
  try {
    const t = readFileSync('config.js', 'utf8');
    const cfg = JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1));
    return Boolean((cfg.sheetCsvUrl || '').trim());
  } catch { return false; }
}

const EXPECTED = existsSync('data/expected.json')
  ? JSON.parse(readFileSync('data/expected.json', 'utf8'))
  : null;

if (!EXPECTED) {
  console.log('FAIL data/expected.json is missing, so there is nothing to check against');
  process.exit(1);
}

if (process.env.CANARY_LIVE === '1') {
  const base = siteUrl();
  const fresh = sheetConfigured();
  console.log(`Auditing ${base} (freshness ${fresh ? 'enforced' : 'not applicable, no sheet configured'})`);

  const get = async (path, optional = false) => {
    const res = await fetch(base + path, { headers: { 'Cache-Control': 'no-cache' } });
    if (!res.ok) { if (optional) return null; throw new Error(`${base}${path} answered ${res.status}`); }
    return res.text();
  };

  // A network failure has to read as a plain sentence, not a stack trace. This runs
  // unattended and its output is the whole of what anyone sees in the failure email.
  try {
    // A 200 on the page itself separates "the data is wrong" from "the site is gone".
    const page = await get('');
    ok(page.length > 500, `the page itself loads (${page.length} bytes)`);

    const doc = JSON.parse(await get('data/games.json'));
    const gaps = await get('data/gaps.csv', true);

    const bad = audit(doc, gaps, EXPECTED, { requireFreshness: fresh });
    ok(bad.length === 0, bad.length ? 'the live catalogue is not trustworthy' : 'the live catalogue is this venue\'s shelf');
    for (const b of bad) console.log('   ' + b);
    console.log(`\n${doc.games.length} games, built ${doc.built}`);
  } catch (e) {
    ok(false, `could not audit the live site: ${e.message || e}`);
    console.log('   Either GitHub Pages is not serving this repo, or the site has moved.');
    console.log('   Set SITE_URL if this shelf lives on a custom domain.');
  }
} else {
  // ————— self-test: every rule must reject something —————
  // A canary that cannot fail is a decoration, so each rule gets a fixture that trips it
  // and the whole thing gets a fixture that must pass.
  const EXP = { maxAgeHours: 36, games: { min: 100, max: 400 }, minPickLists: 1, minPickedGames: 5, minForSale: 10, maxGapLines: 50 };
  const NOW = Date.parse('2026-09-24T12:00:00Z');
  const game = (i, over = {}) => ({ name: `Game ${i}`, forSale: true, price: 50, ...over });
  const healthy = () => ({
    built: '2026-09-24T02:00:00Z',
    games: Array.from({ length: 200 }, (_, i) => game(i)),
    picks: [{ list: 'Jehan', note: '', games: Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`Game ${i}`, ''])) }],
  });
  const run = (mut, gaps = '') => { const d = healthy(); mut(d); return audit(d, gaps, EXP, { requireFreshness: true, now: NOW }); };

  ok(run(() => {}).length === 0, 'a healthy catalogue passes clean');
  ok(run(d => d.built = '2026-09-20T02:00:00Z').some(x => /old/.test(x)), 'a stale catalogue fails on freshness');
  ok(run(d => d.built = 'not a date').some(x => /unparseable/.test(x)), 'a broken timestamp fails');
  ok(run(d => d.games = d.games.slice(0, 40)).some(x => /only 40 games/.test(x)), 'a collapsed game count fails');
  ok(run(d => d.games = [...d.games, ...d.games, ...d.games]).some(x => /at most/.test(x)), 'an inflated game count fails');
  ok(run(d => d.picks = []).some(x => /pick lists/.test(x)), 'losing every staff pick fails');
  ok(run(d => d.picks = [{ list: 'Jehan', note: '', games: {} }]).some(x => /pick lists/.test(x)), 'an empty pick list does not count');
  ok(run(d => d.games.forEach(g => { g.forSale = false; })).some(x => /for sale/.test(x)), 'losing every for-sale flag fails');
  ok(run(d => d.games.forEach(g => { g.price = null; })).some(x => /for sale/.test(x)), 'losing every price fails');
  ok(run(d => d.games[3].name = 'Betrayal at Baldur&#039;s Gate').some(x => /HTML entities/.test(x)), 'a BGG-escaped name fails, the August fingerprint');
  ok(run(() => {}, Array(80).fill('"x|age"').join('\n')).some(x => /gap flags/.test(x)), 'too many gap flags fails');
  ok(audit(null, '', EXP, {}).length === 1, 'a missing catalogue fails rather than throwing');
  // The template ships a demo shelf with a fixed build date and must not go red for it.
  ok(run(d => d.built = '2026-01-01T00:00:00Z').some(x => /old/.test(x)), 'freshness applies when a sheet is configured');
  const old = healthy(); old.built = '2026-01-01T00:00:00Z';
  ok(audit(old, '', EXP, { requireFreshness: false, now: NOW }).length === 0, 'freshness is skipped when no sheet is configured');
}

console.log(fails ? `\n${fails} FAILED` : '\nall good');
process.exit(fails ? 1 : 0);

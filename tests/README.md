# The regression suite

Eleven harnesses that gate every behavioural change. CI runs them on any push touching
index.html, config.js, scripts/ or tests/ (see `.github/workflows/tests.yml`); data-only
nightly commits skip them. All but chk34 and chk35 drive a real browser.

| File | Guards |
|---|---|
| chk15 | skeleton placeholders, tab pill, tap ripple, reduced-motion |
| chk17b | truthful genre chips: the count shown equals the tap result |
| chk18 | one scroll region, sticky bars, hidden-note wording, mobile sheet scroll |
| chk23 | filter group structure, kept genres, footer copy |
| chk27 | full-width bar layout, folded groups, container cap, mobile sheet commit bar |
| chk28 | the ghost-tab fix: pill correctness through every hide/reveal path |
| chk29 | motion honesty: instant snaps vs tap glides, ripple hygiene, tab-change scroll |
| chk30-pwa | manifest + service worker registration, offline reload still renders the shelf |
| chk33-injection | a hostile sheet cell cannot run script in a customer's browser |
| chk34-sheet-authority | the build refuses to publish anything but the sheet, and says so loudly |
| chk35-canary | the live site still serves this venue's catalogue, and is not stale |

Run locally:

```
python3 -m http.server 8899 &         # from the repo root
node tests/chk27.mjs                  # or any of them
```

Env knobs: `BASE_URL` (default `http://127.0.0.1:8899/`) and `PW_EXECUTABLE`
(default lets Playwright find its own browser; point it at a system Chromium if
you have one).

House rule these encode: nothing is "done" until a browser has proven it, and a check
that cannot fail against the unfixed code is decoration.

Two of them need no browser. chk34 exercises the nightly build: it stands up a stub
sheet server and asserts the build dies rather than publishing a catalogue that did not
come from the sheet, then that it refuses a catalogue which has quietly lost every
price, for-sale flag or staff pick. chk35 is the canary, and it is the only check that
looks outward: by default it runs its own audit rules against fixtures, offline and
deterministic, so a pull request is never red because a live site happened to be stale.
With `CANARY_LIVE=1` it fetches the real Pages site instead, which is what the scheduled
`canary.yml` workflow does an hour after the nightly. That is the only check that would
have caught the August 2026 fault, because every other one was green throughout it.
Anchored deploys are md5-gated against locally tested bytes; these are the tests
that produce those bytes.

# The regression suite

Ten harnesses that gate every behavioural change. CI runs them on any push touching
index.html, config.js, scripts/ or tests/ (see `.github/workflows/tests.yml`); data-only
nightly commits skip them. All but chk34 drive a real browser.

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

Run locally:

```
python3 -m http.server 8899 &         # from the repo root
node tests/chk27.mjs                  # or any of them
```

Env knobs: `BASE_URL` (default `http://127.0.0.1:8899/`) and `PW_EXECUTABLE`
(default lets Playwright find its own browser; point it at a system Chromium if
you have one).

House rule these encode: nothing is "done" until a browser has proven it. chk34 is
the one exception: it exercises the nightly build, not the page, so it needs no browser
and no server. It spins up a stub sheet server and asserts the build dies rather than
publishing a catalogue that did not come from the sheet.
Anchored deploys are md5-gated against locally tested bytes; these are the tests
that produce those bytes.

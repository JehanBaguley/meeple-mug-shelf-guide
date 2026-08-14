# The regression suite

Seven Playwright harnesses that gate every behavioural change. CI runs them on any
push touching index.html, config.js or tests/ (see `.github/workflows/tests.yml`);
data-only nightly commits skip them.

| File | Guards |
|---|---|
| chk15 | skeleton placeholders, tab pill, tap ripple, reduced-motion |
| chk17b | truthful genre chips: the count shown equals the tap result |
| chk18 | one scroll region, sticky bars, hidden-note wording, mobile sheet scroll |
| chk23 | filter group structure, kept genres, footer copy |
| chk27 | full-width bar layout, folded groups, container cap, mobile sheet commit bar |
| chk28 | the ghost-tab fix: pill correctness through every hide/reveal path |
| chk29 | motion honesty: instant snaps vs tap glides, ripple hygiene, tab-change scroll |

Run locally:

```
python3 -m http.server 8899 &         # from the repo root
node tests/chk27.mjs                  # or any of them
```

Env knobs: `BASE_URL` (default `http://127.0.0.1:8899/`) and `PW_EXECUTABLE`
(default lets Playwright find its own browser; point it at a system Chromium if
you have one).

House rule these encode: nothing is "done" until a browser has proven it.
Anchored deploys are md5-gated against locally tested bytes; these are the tests
that produce those bytes.

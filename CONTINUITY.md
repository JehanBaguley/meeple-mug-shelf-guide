# If something goes wrong with the Shelf Guide

This page is for Meeple & Mug. It is written so that if the site stops working and I am not
around, someone at the café can understand what happened and what their options are, without
knowing anything about code.

Nothing here is urgent. The site is designed so that when things break, they break slowly and
visibly rather than suddenly.

---

## What this thing actually is

It is a plain web page. It lives on GitHub, which is free and run by Microsoft, and it does
not cost the café anything to run. There is no server, no database, no account, no
subscription and no renewal date. If everyone involved walked away tomorrow, the page would
keep loading exactly as it is today, indefinitely.

The only moving part is a job that runs at 3am each night. It reads the café's Google Sheet,
asks BoardGameGeek for the ratings and player counts, and rebuilds the list.

**The sheet is the shelf.** If a game is not a row in the sheet, it is not on the site. Staff
type seven things per game and the rest arrives by itself.

## Who to contact

Jehan Baguley, who built it. jehan.baguley@outlook.com

If that address stops working, everything below still applies and the site does not need me
to keep running.

---

## What breaks first, and what it looks like

In rough order of likelihood.

**1. The nightly update stops running.**

What you would see: new games typed into the sheet do not appear on the site the next day.
Prices and blurbs still update, because those come straight from the sheet when the page
loads. It is only the BoardGameGeek half that goes stale.

Why it happens: BoardGameGeek changes how their data is shared, or the free access token
expires, or GitHub changes something.

How bad: not very. The site keeps showing the last good version. It does not go blank and it
does not show wrong information, because the build refuses to publish if the data looks
broken. You can run for months like this and most customers would never notice.

**2. The sheet overlay stops loading.**

What you would see: prices and blurbs on the site freeze at whatever they were on the last
nightly build. Everything else works.

Why it happens: Google changes how published spreadsheets are shared, or someone unpublishes
the sheet.

How bad: mild. The fix, if the sheet was accidentally unpublished, is to publish it again:
File, Share, Publish to web, and republish the same tab as CSV.

**3. The page stops loading entirely.**

What you would see: a blank page or an error at the URL on the QR cards.

Why it happens: almost the only cause is the GitHub account being deleted or the repository
being made private.

How bad: this is the only one that is actually visible to customers, and it is also the
easiest to avoid. Do not delete the account.

---

## If it stops updating, three things to check

In order. Each one takes a minute.

1. **Is the sheet still published?** Open the sheet, then File, Share, Publish to web. It
   should say it is published. If not, publish the same tab again as CSV.
2. **Is the sheet still the right shape?** The site matches columns by their heading names.
   Renaming a column heading, or deleting one, will quietly break that column. Compare
   against the list in `README.md`.
3. **Has anything been reported?** Open github.com/JehanBaguley/meeple-mug-shelf-guide, click
   the **Actions** tab, and look for a red cross next to the most recent run. A red cross
   means the nightly job failed and the message will say roughly why.

If all three look fine and it is still wrong, it is a code problem and needs someone
technical. See below.

---

## Handing it to someone technical

Anybody who has worked with a website before can pick this up. It is deliberately small:
about two thousand lines of ordinary HTML, CSS and JavaScript in a single file, with no
frameworks and no build step.

Point them at these, in this order:

| File | What it tells them |
|---|---|
| `README.md` | How the whole thing fits together, and the sheet contract |
| `.github/copilot-instructions.md` | The rules that must not be broken, and why |
| `scripts/build-data.mjs` | The nightly job |
| `index.html` | The entire site |

Two things they will need from the café or from me:

- **Write access to the GitHub repository.** The café can ask GitHub support to recover an
  account, or the repository can be forked and re-pointed. Nothing is locked to me personally
  except the account it currently sits under.
- **A BoardGameGeek API token**, registered free at boardgamegeek.com under Applications. It
  goes into the repository's Settings, Secrets, as `BGG_TOKEN`. It is not shared and it is
  not mine.

The template version of this, with setup instructions written for strangers, is at
github.com/JehanBaguley/pickmark. If the café's copy is ever unrecoverable, a fresh one can
be built from that in about fifteen minutes, pointed at the same sheet, and everything comes
back.

---

## Going back to paper without losing anything

This matters, so it is worth saying plainly: **the café owns its data and always did.**

Everything the café typed lives in the Google Sheet, which the café controls. The site never
held anything the sheet does not. Nothing is trapped.

If you ever want to stop using the site:

- The sheet is already a complete list. Print it, or use File, Download, PDF.
- The `blurb` column is the part that took real effort. It is worth keeping regardless of
  what happens to the website.
- Take the QR cards off the tables. Nothing else needs undoing, and nothing needs cancelling,
  because there is nothing to cancel.

You would be back exactly where you started, with a better spreadsheet than you had before.

---

## The honest version

I built this because I could not choose a game one Saturday night, and the café said yes to a
stranger with a spreadsheet. It is free, it maintains itself, and I intend to keep an eye on
it. But I am one person with a day job, and it would be unfair to let the café depend on
something without knowing what that dependency actually is.

So: it is small, it is yours, it degrades gently, and the worst realistic outcome is a list
that gradually goes out of date. Which is exactly where the printed list was.

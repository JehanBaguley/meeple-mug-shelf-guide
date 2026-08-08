# Shelf Guide — how to look after it

For staff. Two minutes to read, and you should never need to read it twice.

The guide lives at **jehanbaguley.github.io/meeple-mug-shelf-guide**. Customers scan the QR
code at the table and use it to pick a game. Everything on it comes from the Google Sheet.

## Adding a game

Open the sheet, go to **Meeple → Add a game**, and fill in six things.

**Name** as we say it. **BGG link** is the important one: search the game on
boardgamegeek.com, copy the address bar. **Playable in café** yes or no. **For sale** yes
or no, and a price if yes. **Blurb**, one line saying what it plays like.

That's it. Press Add game.

Players, age, play time, genres, play style and the rating all arrive on their own
overnight from BoardGameGeek. You never type them. That's what the link is for.

The game shows up on the site straight away with what you typed, and fills in the rest
after the next night's update.

## Writing a good blurb

This is the only part that needs a human, and it's the bit customers actually read. One
line, comparing it to something they might know.

"Cascadia's abstract cousin, pattern-drafting tiles" is a good one. "A great game for
families" is not, because it's true of two hundred others. Say what it's *like*, not
whether it's good.

## Changing something

Edit the sheet. The site picks it up on the next page load, no waiting.

Sold out, or a box has gone missing? Set **playable** to no. Price changed? Type the new
one. Nothing else to do.

## When BoardGameGeek is wrong

Sometimes it is. Its player count might say 2 to 4 when the box says 2 to 5, or it might
have no age at all.

Every one of those columns is still in the sheet: **rating, players, age, time, category,
play_style**. Leave them empty and BGG fills them in. Type something in and yours wins,
permanently, until you clear the cell again.

So the rule is: **only type in those columns when BGG is actually wrong.** An empty cell
is not a gap, it's the normal state.

## Amber cells

The sheet flags itself. A required cell (name, link, playable, blurb) goes amber the
moment it's left empty, and clears the moment you type. The BGG columns go amber only
for the handful of games BGG genuinely has nothing for; those are the only blanks worth
filling by hand. Type a number and the flag clears itself by the next morning.

## Staff picks

Put your name in **pick_by** and a line in **pick_note**. It shows on the card as "Sam's
pick" with your note underneath, and the game joins the picks row at the top.

## Things that go wrong, and what they mean

**A game isn't showing up.** It's almost always missing from the sheet, or its name has a
typo. The site only ever shows what's in the sheet.

**A game has no player count or age.** It has no BGG link, or the link points at a series
page rather than a single game. Find the game's own page on BGG and paste that.

**The rating looks stale.** Ratings update overnight, not instantly. If it's been a few
days, tell Jehan.

**Everything looks old.** Pull to refresh. If that doesn't do it, the overnight update may
have failed, which is a Jehan problem rather than a you problem.

## What not to do

**Don't reorder or rename the columns.** The site finds them by name.

**Don't delete a row to hide a game.** Set playable to no instead, so we keep the record.

**Don't put a rating in by hand** unless BGG genuinely has it wrong. It'll be overwritten
by a better number tomorrow anyway, and a made-up rating is worse than none.

## Who to ask

Jehan built it. The site updates itself every night at 3am, so most things fix themselves
by morning.

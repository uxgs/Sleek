# Sleek Slides for iPhone

Sleek Slides as an app of its own, designed for the phone. It is not in the App Store yet; you build
it yourself with Xcode.

## What it does

- **Your decks are a list**, each with a cover in its own look. Press and hold a deck to rename it,
  duplicate it, send a copy, or delete it. A new deck asks its name, light or dark, and a colour.
- **You edit the words, and the slide lays itself out.** The slide stays in view at the top: it is
  drawn by the same deck page Sleek Slides uses on the web, inside the app, so a deck is the same
  everywhere. Beneath it are the slide's words as fields (its title, its points, its captions) and
  its speaker notes. Type, and the slide changes.
- **Add a slide** from the deck's own layouts; duplicate or delete the one showing; undo and redo.
- **All slides** shows every slide small, to jump to one.
- **Look** switches the deck between dark and light, and changes its colour.
- **Present** from your hand: upright, the slide, what comes next, your notes, a clock, and Next
  under your thumb. Turn the phone on its side and the slide fills the screen; press its right half
  to go on and its left to go back.
- **Edit on the Slide** (in ⋯) brings the web's own editing back, in place, for what the fields
  cannot do: pictures and clips, moving and sizing things, charts.
- **Send a copy** of a deck as a `.sleek` file.

## Your decks, and Sleek Slides elsewhere

Your decks are kept on the iPhone, in the app's own storage, and a plain `.sleek` copy of each is
also kept in the app's folder and brought back if that storage is ever emptied. Nothing is sent
anywhere. Decks move between the phone and Sleek Slides on the web as `.sleek` files: Send a Copy
from here, or ⋯ › Bring In a Deck. The two do not stay in step by themselves.

## Not here yet

Changing the layout of a slide that already exists (the web has no such thing either), reordering
slides, a picture of the next slide while presenting (its name is shown), showing on a second screen,
publishing, and adding or removing a single point (a layout has a fixed number).

## Building it

You need Xcode, [xcodegen](https://github.com/yonaskolb/XcodeGen) (`brew install xcodegen`), and to
have run `../browser/make.sh` once (it fetches the fonts the slides use).

```
./make.sh                 build for the Simulator
./make.sh check           build, then have the app check itself in the Simulator that is running
./make.sh phone TEAMID    build for your iPhone, signed with your Apple development team, and install it
```

`./make.sh check` makes a deck, opens it in the real deck page, changes its words and notes the way
the fields do, adds, copies and removes slides, runs the library through its paces in storage that is
thrown away, says what it finds, and quits.

## How it is made

```
project.yml            what the app is made of
make.sh                calls ../ios-shared/build.sh, which gathers a copy of Sleek's pages and builds
Sources/Slides.swift   the library, one deck (the deck page inside, and what the app tells it), the fields, the presenter
Sources/Check.swift    the app checking itself
../ios-shared/         Kit.swift (colours, glass, small pieces) and Host.swift (one of Sleek's pages inside a native app)
```

It also compiles three files of the Mac browser as they are (`../browser/Sources/Sleek/`):
`Common.swift`, `Work.swift` and `Known.swift`. The deck page gives the app what it needs through a
few members of `window.Deck` in `app.js` (`count`, `setNote`, `act`, `openGrid`, `edit`, `step`).

# Sleek for iPhone

Sleek, the browser, for the phone: the web with adverts and trackers blocked, and Slides, Docs and
Tasks inside it. It is the iPhone's own web engine in Sleek's own app. It is not in the App Store
yet; you build it yourself with Xcode.

## What it does

- **The bar is where you want it.** The first time, Sleek asks: along the bottom, near your thumb,
  or along the top. Change it in Settings. Scroll down a page and the bar draws in to a small tile
  with Sleek's mark; press the tile, or scroll up, and it opens out. Drag the tile to any corner and
  it stays there.
- **The address.** Press it to search or type an address. As you type, Sleek offers your own decks,
  pages, boards and tasks first, then bookmarks and places you have been, then well-known sites, then
  a search. All of that comes from the phone; what you type goes to your search provider only when
  you search. Slide the address sideways for the next or last tab, and up for all of them.
- **Tabs, and Private Browsing.** All your tabs are a grid, with the private ones apart. A private tab
  writes no history, is offered none of your history or work as you type, keeps its cookies and
  sign-ins apart from your ordinary tabs, and forgets them when you close the last private tab. A link
  opened from a private tab opens in another private tab. Private tabs do not come back the next time
  you open Sleek; ordinary tabs do.
- **Blocking.** The same lists and the same code as the Mac app: adverts, trackers and cookie
  notices. The shield beside an address switches blocking off for a site that does not work, and
  Sleek remembers that. Settings lists those sites.
- **A new tab is your day.** What is due from Sleek Tasks, to tick off and add to; Slides, Docs and
  Tasks; the decks and pages you last worked on; your bookmarks; and where you go most.
- **Slides, Docs and Tasks inside.** They open from inside the app (no network needed) and keep their
  work on the phone. A plain copy of everything is also kept in the app's own folder, and brought
  back if the phone ever empties the web engine's storage.
- **Save to Sleek.** The page showing becomes a task, on the board and day you choose, with a link
  back and any words you selected; or a Docs page with the article's words.
- **The rest of a browser.** Bookmarks and history (by day; swipe to remove), find on page, pull
  down to refresh, swipe back and forward, share, press and hold a link for a new tab or a private
  one, your search provider, light or dark, clearing history, and clearing cookies and cache (which
  does not touch your Sleek work).

## What is not here yet

- Passwords (the Mac app's vault), saving files, a count of what was blocked, reader view, iPad.
- It cannot be set as the iPhone's browser for links from other apps until Apple grants that to a
  released app.
- Work does not travel between this app and Sleek anywhere else by itself; move it with the apps'
  own "save a copy" files.

## Building it

You need Xcode, [xcodegen](https://github.com/yonaskolb/XcodeGen) (`brew install xcodegen`), and to
have run `../browser/make.sh` once (it fetches the block lists and fonts both apps carry).

```
./make.sh                 build for the Simulator
./make.sh check           build, then have the app check itself in the Simulator that is running
./make.sh phone TEAMID    build for your iPhone, signed with your Apple development team, and install it
```

`./make.sh check` starts the app with `--prove`: it drives the same model the screens draw, through
tabs, Private Browsing, blocking, bookmarks, history, your Sleek work, Save to Sleek and the bar, on
real pages, says what it finds, and quits. Nothing of yours is touched while it does.

## How it is made

```
project.yml          what the app is made of (xcodegen turns it into an Xcode project)
make.sh              gathers what goes inside the app (build/inside), then builds
Assets.xcassets      the app's icon
Sources/
  Model.swift        tabs (ordinary and private), the bar's place, blocking for each site, bookmarks, history, your Sleek work
  Views.swift        the screen: the page, the bar and its tile, the menu
  Start.swift        a new tab: your day; and a private tab's first page
  Sheets.swift       searching, all your tabs, tasks, bookmarks and history, settings, the shield, Save to Sleek, the first-time question
  Check.swift        the app checking itself
  Support.swift      where the app's files are, Sleek's mark and colours, small pieces the screens share
```

Five files are compiled straight from the Mac app, so the two never drift apart
(`../browser/Sources/Sleek/`): `Common.swift` (Sleek's own pages, where an address goes, search
providers), `Blocker.swift`, `Store.swift` (settings, bookmarks, history), `Known.swift` (site icons,
well-known sites) and `Work.swift` (your Sleek work, through `bridge.html`).

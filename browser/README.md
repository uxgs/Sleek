# Sleek, the browser

A Mac app that browses the web and has Sleek Slides, Docs and Tasks inside it. It is built on the web
engine every Mac already has, so the app itself is small and opens quickly, and Apple keeps the
engine patched.

This is Stage 2: the browser itself, and blocking. It is not yet a public download.

## What works

- **Tabs**, with Slides, Docs and Tasks pinned first. They open from inside the app, with no connection.
- **The address box**: type an address to go there, or words to search (DuckDuckGo). As you type it
  finishes the address for you and offers your other open tabs, bookmarks, pages from your history
  and well-known sites (a list inside the app, `Resources/sites.txt`; nothing you type is sent
  anywhere to make suggestions).
- **Bookmarks**: the star in the address box keeps a page; press it again to rename or remove it.
  The bookmarks bar starts hidden (⇧⌘B shows it).
- **Site icons** are kept on this Mac, so bookmarks and the places you go most show them on a new tab.
- **A picture dragged in** (onto the bar, a new tab, or a page with no use for it): Sleek asks whether
  to open it or search Google for it. Searching sends the picture to Google; nothing is sent otherwise.
- **Split view**: two pages side by side, three across, or four corners. The bar works on the page
  with the ring; press a page to move the ring, or a tab to put it there.
- **The bar at the top or the bottom**, and **immersive**: the page takes the whole window and the bar
  floats over it, holding the window's red, yellow and green buttons. After a moment it draws itself
  in to a small tile with Sleek's mark; rest the pointer on the tile and it opens out again. Drag the
  tile to any corner and it stays there.
- **Look** (the button beside Split): light, dark or matching the Mac, and six themes.
- **Private Browsing** (⇧⌘N): a window that keeps no history and forgets its cookies when it closes.
- **Pull down to refresh**: with a trackpad, pull down on a page that is at its top. An arrow comes
  down from the top of the page; let go once it turns purple and the page loads again. It leaves
  alone a page that is scrolled down, a sideways stroke (that is Back and Forward), pages that use
  the wheel themselves such as maps, and Sleek's own pages. A mouse with a plain wheel has no
  "letting go", so it doesn't pull.
- **History, downloads, find on the page, zoom, print**, and the usual menu bar with its shortcuts.
- Pages may ask to open a new tab, upload a file, or use the camera or microphone (Sleek asks you).
- **Blocking**, on everywhere from the start: adverts, trackers, pop-ups and redirects to advert
  sites, requests to send notifications, and cookie banners. The shield in the address box shows
  what was stopped on the page, and has a switch to turn blocking off for a site that needs it.

## Blocking

Sleek blocks with three lists kept by others: EasyList (adverts), EasyPrivacy (trackers) and the
EasyList Cookie List (cookie banners). `make.sh` fetches them into `build/lists` and puts a copy in
the app, with their credits and licences (`Resources/lists-credits.txt`); they are not kept in this
repository. The app fetches fresh copies every five days.

The lists are turned into the rules the web engine understands and handed to the engine, which does
the blocking itself, so no page is slowed by Sleek reading its traffic. The first start takes a few
seconds to prepare about 170,000 rules; after that they are ready at once.

What to know:

- The engine takes a simpler kind of rule than the lists are written in. About one line in a
  hundred has no equivalent and is left out, so the odd advert gets through, video adverts most of all.
- Some sites leave an empty gap where an advert was.
- Cookie banners from the common consent tools are answered with "reject"; others are hidden.
- Requests to send notifications are refused. Allowing them for a chosen site is not possible yet.
- The numbers in the shield come from a part of the engine Apple does not promise to keep. If it
  goes, blocking carries on and the shield stops counting.

## What is still to come

Your day on a new tab, Tasks beside any page and Save to Sleek; passwords; and the public release
with automatic updates. Also not here yet: folders on the bookmarks bar, dragging tabs and bookmarks
to reorder them, and dragging the lines of a split view to resize it.

## Building it

You need Xcode's command line tools. From this folder:

```bash
./make.sh
```

That makes `build/Sleek.app`. To have it check itself afterwards (it opens real pages, so it needs a
connection, and writes pictures of the window into `build/selftest`):

```bash
./make.sh test
```

The app is signed for the Mac it was built on. Opening it on another Mac needs the signing that
comes with the public release.

## How it is put together

```
Package.swift            how the program is built
make.sh                  builds Sleek.app: the program, the bar, a copy of Slides, Docs and Tasks, the block lists, the icon
Sources/Sleek/
  main.swift             starts the app
  App.swift              the windows, the menu bar, links handed over by other apps
  BrowserWindow.swift    one window: its tabs, which are showing, and doing what the bar asks
  Tab.swift              one tab: a page, and what a page may ask of the browser; downloads
  Blocker.swift          blocking: turns the lists into the engine's rules and keeps them fresh
  Known.swift            site icons kept on this Mac, and the list of well-known sites
  Images.swift           a picture dragged in: open it, or search for it
  Store.swift            settings, bookmarks and history, as files on this Mac
  Support.swift          where files are, Sleek's own pages (sleek://ui and sleek://app), small helpers
  SelfTest.swift         the app checking itself
Resources/
  chrome/                the bar: chrome.html, chrome.css, chrome.js; and start.html, a new tab's page
  lists-credits.txt      whose block lists these are, and their licences
  sites.txt              well-known sites, for finishing and suggesting addresses
  Info.plist, Sleek.icns what a Mac needs to know about the app, and its icon
```

A window is three layers: bare window at the back, the web pages over it, and on top the bar, which
is a see-through page of its own that covers the whole window. The bar draws the tabs, the address
row, the bookmarks, the frame of a split view and anything that floats over a page. It tells the
window where the pages go and which parts of itself are solid; a press anywhere else falls through
to the page underneath.

What Sleek remembers is kept in `~/Library/Application Support/Sleek` as plain files, and is sent
nowhere. A private window writes no history and forgets its cookies when it closes.

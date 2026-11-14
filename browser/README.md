# Sleek, the browser

A Mac app that browses the web and has Sleek Slides, Docs and Tasks inside it. It is built on the web
engine every Mac already has, so the app itself is small and opens quickly, and Apple keeps the
engine patched.

This is Stage 1: the browser itself. It is not yet a public download.

## What works

- **Tabs**, with Slides, Docs and Tasks pinned first. They open from inside the app, with no connection.
- **The address box**: type an address to go there, or words to search (DuckDuckGo). As you type it
  offers your other open tabs, bookmarks and pages from your history.
- **Bookmarks**: the star in the address box keeps a page on the bookmarks bar; press it again to
  rename or remove it. The bar can be hidden.
- **Split view**: two pages side by side, three across, or four corners. The bar works on the page
  with the ring; press a page to move the ring, or a tab to put it there.
- **The bar at the top or the bottom**, and **immersive**: the page takes the whole window and the bar
  floats over it, fading away after a moment and coming back when you scroll up to the top or reach
  for its edge.
- **Look**: light, dark or matching the Mac, and six themes.
- **History, downloads, find on the page, zoom, print, a private window**, and the usual menu bar
  with its shortcuts.
- Pages may ask to open a new tab, upload a file, or use the camera or microphone (Sleek asks you).

## What is still to come

Blocking of ads, trackers, pop-ups, notification requests and cookie banners; your day on a new tab,
Tasks beside any page and Save to Sleek; passwords; and the public release with automatic updates.
Also not here yet: folders on the bookmarks bar, dragging tabs and bookmarks to reorder them, and
dragging the lines of a split view to resize it.

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
make.sh                  builds Sleek.app: the program, the bar, a copy of Slides, Docs and Tasks, the icon
Sources/Sleek/
  main.swift             starts the app
  App.swift              the windows, the menu bar, links handed over by other apps
  BrowserWindow.swift    one window: its tabs, which are showing, and doing what the bar asks
  Tab.swift              one tab: a page, and what a page may ask of the browser; downloads
  Store.swift            settings, bookmarks and history, as files on this Mac
  Support.swift          where files are, Sleek's own pages (sleek://ui and sleek://app), small helpers
  SelfTest.swift         the app checking itself
Resources/
  chrome/                the bar: chrome.html, chrome.css, chrome.js; and start.html, a new tab's page
  Info.plist, Sleek.icns what a Mac needs to know about the app, and its icon
```

A window is three layers: bare window at the back, the web pages over it, and on top the bar, which
is a see-through page of its own that covers the whole window. The bar draws the tabs, the address
row, the bookmarks, the frame of a split view and anything that floats over a page. It tells the
window where the pages go and which parts of itself are solid; a press anywhere else falls through
to the page underneath.

What Sleek remembers is kept in `~/Library/Application Support/Sleek` as plain files, and is sent
nowhere. A private window writes no history and forgets its cookies when it closes.

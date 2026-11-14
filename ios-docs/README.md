# Sleek Docs for iPhone

Sleek Docs as an app of its own, designed for the phone. It is not in the App Store yet; you build
it yourself with Xcode.

## What it does

- **Your pages are a list** you can search with one thumb, with folders as chips along the top. Press
  and hold a page to duplicate it, move it to a folder, send a copy, or delete it.
- **A page is all page.** It is the same editor Sleek Docs uses on the web, inside the app, so a page
  is the same everywhere; the web's own bars are taken away. Nothing shows until you type.
- **The tools ride on the keyboard:** the kind of line (text, three headings, quote, code), bullets,
  numbers and a checklist, bold and italic and the other marks, a link, undo and redo, and **+**.
- **+ adds a block:** a picture from your photo library, a table, a divider, a callout, columns, a
  cover, a chart, big numbers, before and after. The list is the page's own, so it never falls behind
  the web. In a table, the bar gains rows and columns.
- **Outline** jumps between headings. **Look** switches light and dark, and clean or editorial type.
- **Send** a page as a `.sleek` copy, as Markdown, as a web page, or print it (or save it as a PDF).

## Your pages, and Sleek Docs elsewhere

Your pages are kept on the iPhone, in the app's own storage, and a plain `.sleek` copy of each is
also kept in the app's folder and brought back if that storage is ever emptied. Nothing is sent
anywhere. Pages move between the phone and Sleek Docs on the web as `.sleek` files: Send a Copy from
here, or ⋯ › Bring In a Page (a `.sleek` file sent to the phone can also be opened into the app).
The two do not stay in step by themselves.

## Not here yet

Publishing with viewers, saving as Word, Markdown files coming in, tasks and boards set into a page
(this app keeps no tasks), and making a deck from a page.

## Building it

You need Xcode, [xcodegen](https://github.com/yonaskolb/XcodeGen) (`brew install xcodegen`), and to
have run `../browser/make.sh` once (it fetches the fonts the pages use).

```
./make.sh                 build for the Simulator
./make.sh check           build, then have the app check itself in the Simulator that is running
./make.sh phone TEAMID    build for your iPhone, signed with your Apple development team, and install it
```

`./make.sh check` opens a new page in the real editor, drives it the way the keyboard bar does, runs
the library through its paces in storage that is thrown away, says what it finds, and quits. (A
picture from the phone is not part of it: the web engine keeps no pictures in throwaway storage.)

## How it is made

```
project.yml          what the app is made of
make.sh              calls ../ios-shared/build.sh, which gathers a copy of Sleek's pages and builds
Sources/Docs.swift   the library, one page (the editor inside, and what the app tells it), the keyboard bar, the sheets
Sources/Check.swift  the app checking itself
../ios-shared/       Kit.swift (colours, glass, small pieces) and Host.swift (one of Sleek's pages inside a native app)
```

It also compiles three files of the Mac browser as they are (`../browser/Sources/Sleek/`):
`Common.swift` serves Sleek's pages from inside the app, `Work.swift` is the door to the work those
pages keep (and keeps the plain copy), and `Known.swift` comes with them. The web editor gives the
app its list of blocks through `SleekDoc.blocks()` in `doc/toolbar.js`.

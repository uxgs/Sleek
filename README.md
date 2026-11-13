# Sleek

Two apps that run in your browser, with no account and nothing to install, and that work offline:

- **Sleek Slides**, a presentation app. Build a deck, present it with speaker notes and a live
  preview, and share it as a file or a web page.
- **Sleek Docs**, a writing app. Write pages with rich formatting, pictures and tables, keep them in
  folders, and save them as PDF or Markdown. [More below](#sleek-docs).

Your work stays in your browser; the one thing Sleek can send anywhere is
[who is viewing a deck](#see-whos-viewing), and only for a deck you switch that on for.

The front page asks which one you want. Each app also has a short address on the hosted site, `/slides`
and `/docs`, and each start screen has a **Slides | Docs** switch. Each app has its own version number
and What's new. Most of this page is about Sleek Slides.

**Open it** from the link in this repo's About box (it's hosted on GitHub Pages), or run your own copy
(below).

In Chrome or Edge, use the install button in the address bar to add Sleek Slides or Sleek Docs as an
app, with its own window and icon. In Safari, choose File › Add to Dock.

## On a phone

Sleek works on phones and tablets. Swipe the slide, or tap its left or right edge, to change slides.
The bar keeps previous, next and All slides. Everything else (your decks, Present, Notes, Edit, Theme,
Share) is in the **⋯** tray. In portrait, speaker notes open under the slide. Add Sleek to
your home screen (Share › Add to Home Screen) and it opens like an app.

## How it saves

Every change saves as you make it. ⌘Z undoes and ⇧⌘Z redoes, back through your last 60 steps.

Decks live in the browser you made them in. To keep a deck safe or move it somewhere else:

- **Download a .sleek file.** Use the ⋯ menu on the start screen, or Share in the deck. A .sleek file
  holds the whole deck, pictures and videos included. Open it with **Open a file…**, or drop it on the
  start screen, in any browser.
- **Link a folder** (Chrome and Edge). Pick a folder once, and every deck keeps a .sleek copy there,
  written a moment after each change. Put the folder in iCloud Drive or Dropbox and your decks are
  backed up and follow you. When you open Sleek on another computer, the start screen lists that
  folder's decks so you can open them. After the browser restarts, it asks you once to reconnect.

## Share a deck

**Publish as a web page** (Share in the deck) downloads one .html file with the whole deck inside it.
It plays, presents with the presenter window, and shows every feature, but can't be edited. Email it,
put it on any web host, or open it straight from your disk.

### See who's viewing

Switch on **See who's viewing** under Publish and the page you publish reports in while it is open.
Back in Sleek, the deck's bar shows how many people are viewing it now. Its panel shows which slide
each viewer is on (press one to go there), how many views and people there have been, and how far
through the deck they got. All slides marks the slides viewers are on, and the start screen shows
each deck's count.

It is off unless you switch it on, and a page published without it makes no requests at all.

- **What a viewer's page sends:** a random id for that browser, so two visits count as one person,
  and the number of the slide showing.
- **What is kept:** for each deck, the number of views and of people, when it was last opened, and
  how many views reached each slide.
- **What is never kept:** names, network addresses, anything about the device, anything from the
  deck. Viewers are numbers: "Viewer 1" is whoever has been there longest.
- **Who can see it:** only the browser you published from. It holds a private code for the deck,
  which is never written into a .sleek file, a copy of the deck or a published page. Clear that
  browser's data and the record can no longer be reached.
- **Stopping:** Clear the record wipes the totals. Stop counting makes the service forget the deck,
  and copies already shared stop being counted. A deck nobody opens for a year is forgotten too.
- Your own visits count: open your published page and you are a viewer like anyone else.

This is the only part of Sleek that uses a server: a small service in `service/`, hosted on
Cloudflare. Like any web host, Cloudflare sees the network address of each request as it handles
it; the service does not store it. To run a copy of Sleek that can never call out, empty `ADDRESS`
in `core/online.js` and Viewers doesn't appear in it; to use a service of your own, deploy
`service/` and put its address there.

## Sleek Docs

Open **Docs** from the front page, or the switch on either start screen. A page is one continuous sheet, not a stack of
paper pages, and it saves as you write.

- **Write.** Headings (plain or collapsible), bullets, numbers, checklists, quotes, code, dividers,
  tables, and bold, italic, underline, strike, highlight and links. The bar across the top has them all; so does typing `/` on
  an empty line. Shortcuts as you type: `# ` `## ` `### ` for headings, `- ` bullets, `1. ` numbers,
  `[] ` a checklist, `> ` a quote, three backticks for code, `---` a divider.
- **Pictures.** Choose one from Insert, drop it on the page, or paste it. Each has a caption and can
  be as wide as the text, wide, or full width.
- **Designed sections.** A cover across the top of the page, callout boxes, and two or three columns,
  all from Insert. ⌘Enter steps out of whatever you are in.
- **Paste from Word or Google Docs.** Headings, lists, tables, links, bold, italic, underline, strike
  and highlight come across; fonts, sizes and colours are left behind, so the page keeps its look.
- **Folders and search.** The list on the left holds your pages in folders, and folders in folders.
  Drag to move things. Search looks through titles and every page's words. ⌘\ hides the list.
- **Look.** Light or dark, a colour, and clean or editorial type, saved with each page.
- **Share.** Publish as a web page: one .html file with the page, its pictures and its look inside,
  an outline at the side and a light or dark switch, and no editor. Switch on **See who's reading**
  as you publish and Docs shows who is reading now and how far people got, the same way decks do
  ([what is sent and kept](#see-whos-viewing); for a page, "which slide" is how far down the page).
  Also: Save as PDF (through your browser's print), Save as Markdown (a .zip when the page has
  pictures), and Download a copy: a .sleek file that opens in Sleek Docs in any browser.
- **Open a file.** The Docs start screen opens .sleek pages and Markdown or text files.

Pages live in the browser you wrote them in, in their own storage beside your decks. A linked folder
(above) mirrors decks only, for now.

A page's .sleek file is `{ "format": "sleek", "version": 2, "kind": "doc", "id", "title", "seed" }`,
and the seed is `{ "kind": "doc", "v": 1, "theme", "doc" }`, where `doc` is the document.

## The sample deck

A launch story for Pace, a made-up fitness app. It has one slide per layout, and each slide's speaker
notes explain that layout:

| Layout | What it is |
|---|---|
| Title | Name, title, one line and a footer |
| Bullets | Overline, headline and a short list |
| Bullets with video | A glass side panel beside a film; the space around the film is painted from its own edges |
| Bullets with two videos | Copy beside two stacked videos that play full screen on click |
| Statement | One big line with a film strip of reference frames rolling by |
| Cards | Three cards in a row: steps, options or pillars |
| Section divider | A section break over an optional full-bleed picture |
| Gallery | One large tile and two smaller ones |
| Carousel | An endless, slow carousel you can drag |
| Before and after | A carousel paired with an earlier one: each tile opens as a before / after |
| Take apart | A tile that comes apart into labelled layers in place |
| Full video | The whole slide is a film, with the title over it |
| Results | One to four big numbers that count up as the slide appears |
| Chart | Bars, a line, a pie or a donut, drawn from a small table you edit, in the deck's colours or your own |
| Lessons | Two columns: what landed and what to watch, with a press clipping on one bullet |
| Wrap up | A recap in cards, then questions |
| Annotated screen | A full-screen capture with pins, boxes and arrows, each with its own note |

You can remove the sample deck. **Add the sample deck** on the start screen brings it back.

## Keys

| Key | Does |
|---|---|
| → / ← , Space | Next / previous slide |
| E, or double-click a slide | Edit: click text to retype it, click a tile to swap its picture or video. The bar shows what applies to what you have selected |
| P / A while editing | Pin / Arrow: point at anything on the slide, each with its own note |
| ⌘Z / ⇧⌘Z | Undo / redo |
| N | Speaker notes |
| P | Presenter window: notes, timer, next slide and a live preview you can click |
| G | All slides (drag to reorder; hover a slide to duplicate or delete it, or press the + after it to add one there) |
| A | Show / hide annotations |
| F | Fullscreen |
| H | Back to your decks |
| Space on a before / after | Sweep to the whole Before, then back to the After |

In the presenter window, **Box** draws a highlight the audience sees, **Cursor** shows them where you
point, and **Wipe** plays a before / after.

## Before / after pictures

Any picture tile can open as a before / after. In Edit mode, click **Add before** on the tile's top-left
corner, then pick the earlier picture from anywhere in the deck, or upload one. **No before** turns it
off. In Present, the tile opens with a divider that wipes from the Before to the After, and Space plays
the wipe again.

The sample's *Before and after* slide pairs on its own: its tiles match the tiles with the same caption
on the slide named in its `data-before`. A pick made with the button takes over from that.

## Run it from your own copy

Sleek is static files, with no build step (the two files in `vendor/` are built once, by hand, and
committed). Serve the folder with any web server and open it:

```
python3 -m http.server 8000
```

Then go to http://localhost:8000. To host your own copy, push the folder to a GitHub repo and turn on
Pages (Settings › Pages › Deploy from a branch › main, root). Any static host works too.

The offline cache (`sw.js`) stays off on localhost, so your edits to the code show on reload. To try it
there, run `localStorage.setItem('sleek-sw', '1')` in the console. When you add or remove a file the
app needs, add it to the list in `sw.js` and bump `VERSION` (it carries both apps' version numbers:
Slides' from `data/changelog.js` and Docs' from `data/doc-changelog.js`).

## Files

```
index.html            the front page: pick Sleek Slides or Sleek Docs
slides.html           Slides' start screen: your decks, New deck, Open a file, Link a folder
core/short.js         the short addresses, /slides and /docs, where the host serves them
404.html              the hosted site's not-found page; it also puts /slides/ and /docs/ right
deck.html             the deck: slides, editor, presenter; the layouts are its <template id="layouts">
app.js                the engine: navigation, editing, presenter, grid, autosave, undo
core/store.js         decks, media and undo history in this browser (IndexedDB); .sleek files
core/boot.js          opens a deck from the store and starts the engine on it
core/publish.js       builds the one-file web page
core/folder.js        the linked folder (File System Access)
core/online.js        Viewers: the service's address, a deck's two codes, the calls to the service
data/sample.js        the sample deck
features/             press clippings, take apart, before / after, add slide, setup, tour,
                      the Share menu, the start screen's library and film, the phone tray (mobile.js)
                      viewers.js (your side) and viewers-beacon.js (the published page's side)
assets/sample/        the sample's placeholder art (generated by tools/make-placeholders.py)
assets/film/          the Sleek film, as the start screen plays it (features/film.js)
assets/help/          six short clips for Settings, How Sleek works (features/settings.js)
service/              the Viewers service (a Cloudflare Worker); not part of the app you download
tools/film/           how the film is made: the real app, rendered a frame at a time, and its score
icons/                the logo and app icons
sw.js                 the offline cache
manifest.webmanifest  install Sleek Slides as an app

docs.html             Sleek Docs' start screen: your pages, New page, Open a file
doc.html              a page: the editor, with your pages and folders down the left
core/doc-store.js     pages, folders and search in this browser (IndexedDB "sleek-docs"); .sleek files
core/doc-boot.js      finds the page to open and loads the editor
doc/                  the editor: schema.js (what a page can hold), editor.js, toolbar.js (format bar,
                      menus, Look, Share), sidebar.js (pages and folders), blocks-figure.js (pictures),
                      paste.js (Word and Google Docs), export.js and import.js (Markdown), library.js
                      (the start screen), publish.js (the one-file web page), reader.js and reader.css
                      (what that page's reader gets), viewers.js (who is reading), doc.css (how a
                      page looks) and doc-ui.css (the app around it)
vendor/               outside code, under free licences (vendor/LICENSES.md): ProseMirror, the text
                      editing engine under Sleek Docs, and markdown-it, which reads Markdown files
tools/vendor-editor/  builds the files in vendor/ from pinned versions; run by hand, output committed
docs.webmanifest      install Sleek Docs as an app
```

A `.sleek` file is JSON: `{ "format": "sleek", "version": 1, "id", "title", "seed" }`. The seed is the
deck: its slides (`added`), text, media, notes, annotations, theme and order. Pictures and videos are
inside it as data URLs.

## License

MIT. The files in `vendor/` are other people's work under their own free licences, listed in
`vendor/LICENSES.md`.

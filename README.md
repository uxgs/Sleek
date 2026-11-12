# Sleek

A presentation app that runs in your browser. Build a deck, present it with speaker notes and a live
preview, and share it as a file or a web page. There's no account, no server and nothing to install,
and it works offline.

**Open it** from the link in this repo's About box (it's hosted on GitHub Pages), or run your own copy
(below).

In Chrome or Edge, use the install button in the address bar to add Sleek as an app, with its own
window and icon. In Safari, choose File › Add to Dock.

## On a phone

Sleek works on phones and tablets. Swipe the slide, or tap its left or right edge, to change slides.
The bar keeps previous, next and All slides. Everything else (your decks, Present, Notes, Annotate,
Edit, Theme, Share) is in the **⋯** tray. In portrait, speaker notes open under the slide. Add Sleek to
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
| Lessons | Two columns: what landed and what to watch, with a press clipping on one bullet |
| Wrap up | A recap in cards, then questions |
| Annotated screen | A full-screen capture with pins, boxes and arrows, each with its own note |

You can remove the sample deck. **Add the sample deck** on the start screen brings it back.

## Keys

| Key | Does |
|---|---|
| → / ← , Space | Next / previous slide |
| E, or double-click a slide | Edit: click text to retype it, click a tile to swap its picture or video |
| ⌘Z / ⇧⌘Z | Undo / redo |
| N | Speaker notes |
| P | Presenter window: notes, timer, next slide and a live preview you can click |
| G | All slides (drag to reorder; hover a slide to duplicate or delete it) |
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

Sleek is static files, with no build step. Serve the folder with any web server and open it:

```
python3 -m http.server 8000
```

Then go to http://localhost:8000. To host your own copy, push the folder to a GitHub repo and turn on
Pages (Settings › Pages › Deploy from a branch › main, root). Any static host works too.

The offline cache (`sw.js`) stays off on localhost, so your edits to the code show on reload. To try it
there, run `localStorage.setItem('sleek-sw', '1')` in the console. When you add or remove a file the
app needs, add it to the list in `sw.js` and bump `VERSION`.

## Files

```
index.html            start screen: your decks, New deck, Open a file, Link a folder
deck.html             the deck: slides, editor, presenter; the layouts are its <template id="layouts">
app.js                the engine: navigation, editing, presenter, grid, autosave, undo
core/store.js         decks, media and undo history in this browser (IndexedDB); .sleek files
core/boot.js          opens a deck from the store and starts the engine on it
core/publish.js       builds the one-file web page
core/folder.js        the linked folder (File System Access)
data/sample.js        the sample deck
features/             press clippings, take apart, before / after, add slide, setup, tour,
                      the Share menu, the start screen's library and film, the phone tray (mobile.js)
assets/sample/        the sample's placeholder art (generated by tools/make-placeholders.py)
assets/film/          the Sleek film, as the start screen plays it (features/film.js)
tools/film/           how the film is made: the real app, rendered a frame at a time, and its score
icons/                the logo and app icons
sw.js                 the offline cache
manifest.webmanifest  install as an app
```

A `.sleek` file is JSON: `{ "format": "sleek", "version": 1, "id", "title", "seed" }`. The seed is the
deck: its slides (`added`), text, media, notes, annotations, theme and order. Pictures and videos are
inside it as data URLs.

## License

MIT

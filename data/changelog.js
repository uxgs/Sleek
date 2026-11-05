/* What's new in Sleek, newest first. The start screen shows Sleek's version (the first entry's v)
   and these notes.

   Every release adds an entry at the top, with v one higher than the last, and sets sw.js's
   VERSION to 'sleek-v' + that number, so the offline cache and the version you see always match. */
window.SLEEK_CHANGES = [
  { v: 18, date: '2026-11-05', title: 'Settings, a changelog, and Edit includes annotations',
    items: [
      'A Settings gear on the start screen: turn the tips off or see the tour again, add the sample deck, read how Sleek works, and find out who made it.',
      'The start screen shows Sleek’s version and what’s new in each one.',
      'Tip cards have a × to close them.',
      'Edit on a slide with annotations edits them too: drag pins, boxes and arrows, open their notes, and add new ones from the same bar.',
      'On a phone, pull a slide down for All slides, and swipe up to go back: from the bottom bar, the top row, or the end of the list.',
      'The editing bar stays on one row on a wide window.'
    ] },
  { v: 17, date: '2026-11-05', title: 'Your theme everywhere, and quicker ways around',
    items: [
      'New slide previews and the sample deck follow your theme: sample pictures, films and the take-apart card take your accent, and previews show your backdrop effect.',
      'The Sleek button sits at the left of the bar.',
      'All slides has a breadcrumb back to your decks.',
      'Point at the window’s top-left corner for a Back to your decks button.'
    ] },
  { v: 16, date: '2026-11-05', title: 'A film strip that fits',
    items: [
      'The film strip holds 2 to 5 pictures and refits as you remove or add them.',
      'Add picture at the end of the strip, in Edit mode.'
    ] },
  { v: 15, date: '2026-11-04', title: 'Newspaper clippings',
    items: [
      'Give any bullet a newspaper clipping in Edit mode: paper, headline, passage and byline, with *stars* for highlighted words and a live preview.',
      'In Present, clicking the bullet opens its clipping over the slide.',
      'A section divider can have no picture, so your theme’s glow shows behind it.',
      'Play buttons show only on videos, and the Full video layout takes your own film.'
    ] },
  { v: 14, date: '2026-11-04', title: 'Clippings travel with the deck',
    items: [ 'A deck keeps its own clippings, and duplicating or deleting a slide takes them along.' ] },
  { v: 13, date: '2026-11-04', title: 'Films stay films',
    items: [ 'Videos come back as videos after a deck is saved and opened again.' ] },
  { v: 12, date: '2026-11-04', title: 'Take-apart layers of your own',
    items: [
      'Each take-apart picture keeps its own layers. Replace the picture and it comes apart as itself.',
      'The Layers button in Edit mode adds, names, orders and removes layers from your own images.',
      'Saving or opening a .sleek file asks whether to keep the speaker notes.'
    ] },
  { v: 11, date: '2026-11-04', title: 'Before and after, side by side',
    items: [ 'In Edit mode a tile with a Before shows both halves: click the left to change the Before, the right to replace the After.' ] },
  { v: 10, date: '2026-11-04', title: 'More pictures to pick from',
    items: [ 'The Before picker lists the pictures from your Statement slides under Your Images.' ] },
  { v: 9, date: '2026-11-04', title: 'Before and after anywhere',
    items: [ 'Every tile in the Before and after layout comes with a sample Before, so it works wherever you add it.' ] },
  { v: 8, date: '2026-11-04', title: 'Before and after fixed',
    items: [ 'The before / after divider works again.' ] },
  { v: 7, date: '2026-11-04', title: 'Smoother pictures',
    items: [
      'The Before picker plays a real wipe between the two pictures.',
      'Take-apart layers fit under the slide’s title.',
      'A new version never mixes with files cached from an old one.'
    ] },
  { v: 6, date: '2026-11-04', title: 'Effect opacity',
    items: [ 'The Theme menu has an Opacity slider for the Smoke and Pulse grid effects.' ] },
  { v: 5, date: '2026-11-04', title: 'Film strip editing',
    items: [ 'The × on a film strip picture removes it from the strip.' ] },
  { v: 4, date: '2026-11-04', title: 'Pulse grid',
    items: [ 'The Pulse grid effect shows on the slides themselves.' ] },
  { v: 3, date: '2026-11-04', title: 'Phones, part two',
    items: [ 'Hold a slide to edit it, pull sheets down to close them, and rearrange slides with Edit in All slides.' ] },
  { v: 2, date: '2026-11-04', title: 'Phones',
    items: [ 'On a phone the bar’s buttons move into a tray, and you swipe between slides.' ] },
  { v: 1, date: '2026-11-04', title: 'Sleek',
    items: [ 'Build a deck in your browser. It saves as you go, needs no account or install, and works offline.' ] }
];

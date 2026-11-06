/* What's new in Sleek: one short entry per day, newest first. The start screen shows Sleek's
   version (the first entry's v) and these notes.

   Versions are major.minor.patch, and every push raises the patch by one (1.0.0, 1.0.1, …): set
   the top entry's v (or, on a new day, add an entry at the top) and set sw.js's VERSION to
   'sleek-' + that version, so the offline cache and the version you see always match. Keep each
   line to a few words. */
window.SLEEK_CHANGES = [
  { v: '1.0.36', date: '2026-11-06',
    items: [
      'Put pictures and videos anywhere on a slide',
      'A bullet can open a picture or video',
      'Start over from the last slide',
      'The audience screen hides the bar while you present',
      'Show bottom bar, from the presenter notes',
      'Choose your own deck thumbnail',
      'Before / after slider moves only while you drag',
      'Fill, fit or crop any picture',
      'Size each take-apart layer',
      'Turn off a picture’s backplate',
      'Turn off a carousel’s auto scroll',
      'Carousels hold 1 to 5 pictures',
      'Delete removes a carousel picture',
      'Before / after labels sit above the picture',
      'Carousel captions can be edited again',
      'A one-picture carousel shows it once'
    ] },
  { v: '1.0.25', date: '2026-11-05',
    items: [
      'Moodboard layout',
      'Lock a Masonry picture to 16:9',
      'Videos on moodboards',
      'Scroll a drifting moodboard by hand',
      'Fill, fit or crop moodboard pictures',
      'Add media from your deck',
      'Remix reshuffles Masonry',
      'Fullscreen image layout',
      'Annotations show in your speaker notes',
      'Change the picture on an annotated screen',
      'Templates and the sample deck follow your theme',
      'Settings on the start screen',
      'Version number and changelog',
      'Improved annotation editing',
      'Improved film strip editing',
      'New swipe gestures on phones',
      'Easier ways back to your decks',
      'Tips can be closed or turned off'
    ] },
  { v: '1.0.14', date: '2026-11-04',
    items: [
      'Build decks in your browser, offline',
      'Phone support',
      'Before and after pictures',
      'Take-apart layers',
      'Newspaper clippings',
      'Backdrop effect opacity',
      'Fixes and polish'
    ] }
];

/* What's new in Sleek Slides: one short entry per day, newest first. The Slides start screen shows
   Slides' version (the first entry's v) and these notes. Sleek Docs has its own number and notes
   (data/doc-changelog.js).

   Versions are major.minor.patch, and the patch rises by one each time Slides changes (1.0.0,
   1.0.1, …): set the top entry's v (or, on a new day, add an entry at the top) and set the
   Slides half of sw.js's VERSION to match, so the offline cache and the version you see always
   match. Keep each line to a few words, and each day to four lines at most. */
window.SLEEK_CHANGES = [
  { v: '1.0.51', date: '2026-11-13',
    items: [
      'Now Sleek Slides, at /slides, with its own logo; a front page picks the app',
      'See who\'s viewing a deck you published: a switch in Share',
      'A Tasks slide: a project’s board or list from Sleek Tasks, live',
      'The Sleek film shows charts; the saving clip shows the new Edit bar'
    ] },
  { v: '1.0.44', date: '2026-11-12',
    items: [
      'Results and Chart slides, with numbers that count up',
      'A simpler Add slide, and one Edit mode with pins and arrows built in',
      'The Sleek film, and How Sleek works in six short clips',
      'What’s new folds into a tile; the sample deck wears Sleek’s colours'
    ] },
  { v: '1.0.40', date: '2026-11-10',
    items: [
      'New start screen heading',
      'Visit counts for the hosted site'
    ] },
  { v: '1.0.39', date: '2026-11-06',
    items: [
      'Pictures and videos anywhere, even from a bullet',
      'Fill, fit or crop any picture, with or without its backplate',
      'Carousels of 1 to 5 pictures you can reorder',
      'Your own deck thumbnails, and smoother presenting'
    ] },
  { v: '1.0.25', date: '2026-11-05',
    items: [
      'Moodboard and fullscreen image layouts',
      'Better annotation and film strip editing',
      'Settings, version and changelog on the start screen',
      'Smoother phone gestures and ways back to your decks'
    ] },
  { v: '1.0.14', date: '2026-11-04',
    items: [
      'Build decks in your browser, offline, on any phone',
      'Before and after, take-apart and clipping layouts',
      'Backdrop effect opacity',
      'Fixes and polish'
    ] }
];

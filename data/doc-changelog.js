/* What's new in Sleek Docs: one short entry per day, newest first. The Docs start screen shows
   Docs' version (the first entry's v) and these notes.

   Sleek Docs has its own version number, apart from Sleek Slides' (data/changelog.js). It rises
   by one patch each time Docs changes: set the top entry's v (or, on a new day, add an entry at
   the top), and set the Docs half of sw.js's VERSION to match. Keep each line to a few words,
   and each day to four lines at most. */
window.SLEEK_DOC_CHANGES = [
  { v: '1.0.11', date: '2026-11-15',
    items: [
      'Put a grocery list in a page: tick and add to it there'
    ] },
  { v: '1.0.10', date: '2026-11-14',
    items: [
      'Your pages are tiles now, each with a thumbnail you can choose',
      'Checklists sit cleanly, with ticks level with their words',
      'Menus use the room the window has before they scroll'
    ] },
  { v: '1.0.9', date: '2026-11-13',
    items: [
      'Sleek Docs is here, with its own logo; pages change with motion',
      'Publish a page, see who is reading it, or make a deck from it',
      'Pictures, tables, charts, before and after; Word files in and out',
      'Tasks from Sleek Tasks, live in a page: one task, a list or a whole board'
    ] }
];

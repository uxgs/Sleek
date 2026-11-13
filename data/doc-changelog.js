/* What's new in Sleek Docs: one short entry per day, newest first. The Docs start screen shows
   Docs' version (the first entry's v) and these notes.

   Sleek Docs has its own version number, apart from Sleek Slides' (data/changelog.js). It rises
   by one patch each time Docs changes: set the top entry's v (or, on a new day, add an entry at
   the top), and set the Docs half of sw.js's VERSION to match. Keep each line to a few words,
   and each day to four lines at most. */
window.SLEEK_DOC_CHANGES = [
  { v: '1.0.2', date: '2026-11-13',
    items: [
      'Sleek Docs is here: pages with pictures and tables, in folders',
      'Publish a page as a web page, and see who is reading it',
      'Covers, callouts, columns and collapsible headings',
      'Paste from Word and Google Docs; save as PDF or Markdown'
    ] }
];

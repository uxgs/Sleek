/* What's new in Sleeky Notes: one short entry per day, newest first. Notes shows its version (the
   first entry's v) and these notes from the button at the foot of its side list.

   Sleeky Notes has its own version number, apart from Slides' (data/changelog.js), Docs'
   (data/doc-changelog.js) and Tasks' (data/task-changelog.js). It rises by one patch each time Notes
   changes: set the top entry's v (or, on a new day, add an entry at the top), and set the Notes part
   of sw.js's VERSION to match. Keep each line to a few words, and each day to four lines at most. */
window.SLEEK_NOTE_CHANGES = [
  { v: '1.0.1', date: '2026-11-20',
    items: [
      'Sleeky Notes: jot something down in a second, find it later',
      'Pin notes, file them in folders, tag them, and give each an icon',
      'Lock a note: only its title shows until you unlock it',
      'Checklists and bold, a copy of everything as a file, and it works offline'
    ] }
];

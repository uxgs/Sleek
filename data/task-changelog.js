/* What's new in Sleek Tasks: one short entry per day, newest first. Tasks shows its version (the
   first entry's v) and these notes from the button at the foot of its left column.

   Sleek Tasks has its own version number, apart from Slides' (data/changelog.js) and Docs'
   (data/doc-changelog.js). It rises by one patch each time Tasks changes: set the top entry's v
   (or, on a new day, add an entry at the top), and set the Tasks part of sw.js's VERSION to match.
   Keep each line to a few words, and each day to four lines at most. */
window.SLEEK_TASK_CHANGES = [
  { v: '1.0.1', date: '2026-11-13',
    items: [
      'Sleek Tasks is here: projects, a board you drag, and a list',
      'Today gathers what is due across every project',
      'Tasks have notes, subtasks, people, tags and due dates',
      'Tasks, lists and boards show live inside Sleek Docs pages'
    ] }
];

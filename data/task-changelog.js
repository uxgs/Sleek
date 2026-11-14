/* What's new in Sleek Tasks: one short entry per day, newest first. Tasks shows its version (the
   first entry's v) and these notes from the button at the foot of its left column.

   Sleek Tasks has its own version number, apart from Slides' (data/changelog.js) and Docs'
   (data/doc-changelog.js). It rises by one patch each time Tasks changes: set the top entry's v
   (or, on a new day, add an entry at the top), and set the Tasks part of sw.js's VERSION to match.
   Keep each line to a few words, and each day to four lines at most. */
window.SLEEK_TASK_CHANGES = [
  { v: '1.0.8', date: '2026-11-14',
    items: [
      'Choose a thumbnail of your own for a board’s tile',
      'Small buttons and tick boxes are easier to press',
      'A task’s details line up in even rows'
    ] },
  { v: '1.0.7', date: '2026-11-13',
    items: [
      'Sleek Tasks is here, with its own logo and a home page for your boards',
      'Each board is cards, a list, a grid with your own fields, or a calendar',
      'Notes, subtasks, people, tags, pictures; tasks that repeat; a copy of it all as a file',
      'Today gathers what is due; tasks live in Docs and on slides; views change with motion'
    ] }
];

/* What's new in Sleek Tasks: one short entry per day, newest first. Tasks shows its version (the
   first entry's v) and these notes from the button at the foot of its left column.

   Sleek Tasks has its own version number, apart from Slides' (data/changelog.js) and Docs'
   (data/doc-changelog.js). It rises by one patch each time Tasks changes: set the top entry's v
   (or, on a new day, add an entry at the top), and set the Tasks part of sw.js's VERSION to match.
   Keep each line to a few words, and each day to four lines at most. */
window.SLEEK_TASK_CHANGES = [
  { v: '1.0.10', date: '2026-11-20',
    items: [
      'On iPhone: Sleek Tasks opens with Sleek’s mark and its sound'
    ] },
  { v: '1.0.9', date: '2026-11-15',
    items: [
      'Grocery lists: sorted by aisle, with your usuals one tap away',
      'Give a list a day and it shows on Today, here and in the Sleek browser',
      'Done shopping carries what is left to next week’s list',
      'On iPhone: Goals, widgets, and Siri for your grocery list'
    ] },
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

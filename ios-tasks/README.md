# Sleek Tasks for iPhone

Sleek Tasks as an app of its own, designed for the phone. It is not in the App Store yet; you build
it yourself with Xcode.

## What it does

- **It opens on Today.** What is late, what is due today, and what you have done, with a ring that
  fills as you go.
- **Adding is under your thumb.** A field docked at the bottom, which stays up after each task so a
  list goes in as fast as you can type. While you type, choose when (today, tomorrow, next week, no
  date) and which board.
- **Swipes.** Swipe a task right to tick it, left to put it off to tomorrow or next week.
- **A task opens on a sheet:** its name, its day, its board and column, how it repeats, steps to tick,
  and notes.
- **Upcoming** is the days ahead, then later, then tasks with no date.
- **Boards.** A board is one column at a time; the next peeks in from the side and a flick changes
  column. A card moves on to the next column with one press, or to any column from a long press. Add,
  rename and delete columns and boards, and choose a board's colour.
- **Find a task** by its words, from Boards.
- **Tasks that repeat** (every day, weekday, week, month or year) move on to their next day when
  ticked, as on the web.
- **Grocery lists** (Boards › ⋯ › New Grocery List): things by aisle, a quantity stepper, your usuals
  under **Add again**, a basket for what is got, and Done shopping, which carries what is left to
  next week's list. A list with a day shows on Today. They are the same lists as on the web, in the
  same file.
- **Siri.** "What's on my grocery list in Sleek Tasks" reads out what is left to get on today's list
  (or the next one), and shows it by aisle. "Add to my grocery list in Sleek Tasks" asks what, and
  puts it on (say "2 lemons" for more than one). "What's due today in Sleek Tasks" says what is due
  and what is late. Siri needs the app's name in what you say; the same three are in the Shortcuts
  app, Spotlight and the Action button. They answer even when the app is closed.
- **Goals** (the Goals tab): say it in a sentence ("Run 30 days by New Year", "Accomplish these 20
  things this year", "Save $2,000 by summer") and it picks how to track it: days to mark off on a
  calendar, a list of things to tick, or a number to count up, with a chart. Each goal shows whether
  you are ahead of pace or behind, and what it takes to catch up. Goals are kept in the same file.
- **Widgets.** Groceries, Aisles, Due today, a board, a Goal (choose which; mark today, tick the next
  thing or add to it right from the widget, also on the Lock Screen) and Goals (three at once).
- **Opened from the Sleek browser.** A list or board opened from the browser's Today opens here, on
  that list.

## Your tasks, and Sleek Tasks elsewhere

Your tasks are kept on the iPhone, in one file written a moment after each change. It is in a folder
the Sleek apps on this iPhone share (the App Group `group.com.uxg.sleek`, in a place only Sleek Tasks
writes), and Sleek Tasks brings in what is newer in the Sleek browser's, Docs' and Slides' copies
when it opens, when it comes back to the front, and when one of them says it wrote something. A board
or task changed in two apps keeps the later change, and what is deleted in one stays deleted in all.
(The first time, the file this app kept before comes along, and stays where it was as a copy. If the
browser had its own "My tasks" board too, you will see both: rename or delete one.)

That file is the same kind Sleek Tasks saves on the web with "Save a copy of them all"
(`core/task-store.js`), so:

- **Boards › ⋯ › Save a Copy of Everything** makes a `.sleek` file to keep, or to bring into Sleek
  Tasks on the web (or in the Sleek browser) with "bring in a copy".
- **Boards › ⋯ › Bring In a Copy** brings a file saved there in here. A `.sleek` file sent to the
  phone can also be opened straight into the app. A board or task that is already here is left as it
  is, so bringing the same file in twice changes nothing.

Nothing is sent anywhere, and the phone and the web do not stay in step by themselves: the file is
how tasks move between them.

What the phone does not show yet is kept untouched and goes back out in the file: formatted notes
(their words are shown, and what you write is added beneath, never over them), pictures on cards,
your own fields, people and tags (people and tags are shown, not changed).

## Not here yet

Reminders at a time, dragging cards to reorder them, the calendar and grid views, your own
fields, pictures, goals on the web, and staying in step with the web without a file.

## Building it

You need Xcode and [xcodegen](https://github.com/yonaskolb/XcodeGen) (`brew install xcodegen`).

```
./make.sh                 build for the Simulator
./make.sh check           build, then have the app check itself in the Simulator that is running
./make.sh phone TEAMID    build for your iPhone, signed with your Apple development team, and install it
```

`./make.sh check` starts the app with `--prove`: it runs the store through its rules (ticking,
repeating, columns, notes, files, grocery lists, goals, widgets, sharing with the other apps, and what Siri says and
adds) in a throwaway folder and against a file written the way the web
writes one, says what it finds, and quits. Given `--web <file> --next <day> --out <file>` as well, it
also takes a real file saved by Sleek Tasks on the web, checks it comes in exactly, and writes its own
copy out for the web to read back.

Siri itself can only be tried on a real iPhone: the Simulator will not run an app's shortcuts unless
the app is signed with a team, and it will not start an app that is.

## How it is made

```
project.yml       what the app is made of (xcodegen turns it into an Xcode project)
make.sh           builds it
Assets.xcassets   the app's icon
Sources/
  Store.swift     your boards and tasks: the file, and the rules (the same as core/task-store.js)
  Today.swift     the app, Today, Upcoming, a task in a list, the add bar, a task on its sheet
  Boards.swift    your boards, one board, finding a task, saving and bringing in a copy
  Grocery.swift   a grocery list's own screen, its add bar, and its card on Today
  GoalScreens.swift  the Goals tab, a goal's screen, and making a goal
  Kit.swift       Sleek's colours, glass, and small pieces the screens share
  Check.swift     the app checking itself
../ios-shared/
  Shared.swift    the folder the Sleek apps share, and the signal one gives the others when it writes
  Aisles.swift    a shop's aisles, and how "2 lemons" is read (the Sleek browser uses them too)
  Siri.swift      what Siri can ask, read from every app's copy (the Sleek browser compiles it too)
  Goals.swift     a goal, its pace, its changes, and reading one from a sentence
  Widgets.swift   the widgets of all four apps
Widgets/          the widget extension
```

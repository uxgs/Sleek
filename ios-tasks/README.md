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

## Your tasks, and Sleek Tasks elsewhere

Your tasks are kept on the iPhone, in one file in the app's own folder, written a moment after each
change. That file is the same kind Sleek Tasks saves on the web with "Save a copy of them all"
(`core/task-store.js`), so:

- **Boards › ⋯ › Save a Copy of Everything** makes a `.sleek` file to keep, or to bring into Sleek
  Tasks on the web (or in the Sleek browser) with "bring in a copy".
- **Boards › ⋯ › Bring In a Copy** brings a file saved there in here. A `.sleek` file sent to the
  phone can also be opened straight into the app. A board or task that is already here is left as it
  is, so bringing the same file in twice changes nothing.

Nothing is sent anywhere, and the two do not stay in step by themselves: the file is how tasks move.

What the phone does not show yet is kept untouched and goes back out in the file: formatted notes
(their words are shown, and what you write is added beneath, never over them), pictures on cards,
your own fields, people and tags (people and tags are shown, not changed).

## Not here yet

Reminders at a time, a widget, dragging cards to reorder them, the calendar and grid views, your own
fields, pictures, and staying in step with the web without a file.

## Building it

You need Xcode and [xcodegen](https://github.com/yonaskolb/XcodeGen) (`brew install xcodegen`).

```
./make.sh                 build for the Simulator
./make.sh check           build, then have the app check itself in the Simulator that is running
./make.sh phone TEAMID    build for your iPhone, signed with your Apple development team, and install it
```

`./make.sh check` starts the app with `--prove`: it runs the store through its rules (ticking,
repeating, columns, notes, files) in a throwaway folder and against a file written the way the web
writes one, says what it finds, and quits. Given `--web <file> --next <day> --out <file>` as well, it
also takes a real file saved by Sleek Tasks on the web, checks it comes in exactly, and writes its own
copy out for the web to read back.

## How it is made

```
project.yml       what the app is made of (xcodegen turns it into an Xcode project)
make.sh           builds it
Assets.xcassets   the app's icon
Sources/
  Store.swift     your boards and tasks: the file, and the rules (the same as core/task-store.js)
  Today.swift     the app, Today, Upcoming, a task in a list, the add bar, a task on its sheet
  Boards.swift    your boards, one board, finding a task, saving and bringing in a copy
  Kit.swift       Sleek's colours, glass, and small pieces the screens share
  Check.swift     the app checking itself
```

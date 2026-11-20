# Sleeky Notes for iPhone

Sleeky Notes as an app of its own. It is not in the App Store yet; you build it yourself with Xcode.

## What it does

- **It is the same Sleeky Notes.** The app carries the very page Sleeky Notes is on the web
  (`../notes.html`, `../note/`) and fills the screen with it: jot something down, pin notes, file
  them in folders, tag them, give each an icon, write with checklists and bold, and search.
- **It opens as every Sleek app does:** Sleek's mark slides together in amber, the name writes itself
  in, and it lifts away, to the opening sound (`../ios-shared/Opening.swift`). A tap skips it.
- **Locked notes open with Face ID or Touch ID.** A locked note shows its title and icon; its text is
  scrambled. The first time you lock one you choose a passcode, as on the web, and the app also keeps
  the key in the iPhone's keychain, where only Face ID, Touch ID or the iPhone's own passcode releases
  it. So here a locked note opens with a glance, and your notes' passcode still opens it, here and
  everywhere else. A note locks again when you leave it or leave the app.
- **Widgets, in four kinds.** *Pinned Notes* (small, medium, large), *Note* (one note you choose: its
  text and its checklist; small, medium, large), *Recent Notes* (medium, large, and on the Lock
  Screen) and *Jot a Note* (small, and a round button on the Lock Screen). A press on a note opens
  it; a locked note shows only its title and a lock.
- **Jot from a widget.** Jot opens a small sheet with the keyboard up. Return keeps the note.
- **One copy on your iPhone.** Your notes are shared with the Sleek browser on the same iPhone,
  through the folder the Sleek apps share: a note written in either is in both. With this app on the
  phone, the browser's Notes tile opens your notes here.
- **A `.sleek` file of notes** sent to the phone opens into the app, and its notes come in beside yours.

## Not here yet

- Sending a copy of your notes out of the app as a file.
- Siri, and a note inside a Sleek Docs page or as a task.
- Other devices: the phone and Sleeky Notes on the web do not stay in step by themselves.

## Build it

Run `../browser/make.sh` once (it fetches the fonts the pages use), then:

    ./make.sh                 build for the Simulator
    ./make.sh check           build, then have the app check itself in the Simulator that is running
    ./make.sh phone <team>    build for your iPhone, signed with your Apple development team, and install it

You need Xcode and xcodegen (`brew install xcodegen`).

## What is in here

```
project.yml          the app and its widgets, for xcodegen
Assets.xcassets      the app's icon
Sources/
  Notes.swift        the page inside the app, the key to locked notes (the keychain), the Jot sheet, the addresses it answers to
  Check.swift        the app checking itself, and drawing every widget to a picture
Widgets/Bundle.swift the list of widgets
```

It compiles, from `../ios-shared/`: `Host.swift` (a Sleek page inside a native app), `Kit.swift`,
`Shared.swift` and `SharedWork.swift` (the folder the Sleek apps share), `Opening.swift`,
`NoteData.swift` (your notes as the widgets read them) and `NoteWidgets.swift` (the widgets); and from
`../browser/Sources/Sleek/`: `Common.swift`, `Work.swift` and `Known.swift`.

The app answers to `sleek-notes://open`, `sleek-notes://open?id=<a note>`, `sleek-notes://jot` and
`sleek-notes://new`.

Face ID itself can only be tried on a real iPhone: while the app checks itself, the key is kept in
memory instead of the keychain.

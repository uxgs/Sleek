// The widgets Sleeky Notes offers. They are drawn by ../ios-shared/NoteWidgets.swift.
import SwiftUI
import WidgetKit

@main
struct NotesWidgets: WidgetBundle {
  var body: some Widget { NotesPinnedWidget(); NotesNoteWidget(); NotesRecentWidget(); NotesJotWidget() }
}

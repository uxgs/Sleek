// The widgets Sleek Docs offers. They are drawn by ../ios-shared/Widgets.swift.
import SwiftUI
import WidgetKit

@main
struct DocsWidgets: WidgetBundle {
  var body: some Widget { DocsRecentWidget(); DocsPagesWidget(); DocsNewWidget(); DocsPageWidget() }
}

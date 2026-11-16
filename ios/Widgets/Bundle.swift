// The widgets Sleek (the browser) offers. They are drawn by ../ios-shared/Widgets.swift.
import SwiftUI
import WidgetKit

@main
struct SleekWidgets: WidgetBundle {
  var body: some Widget { SleekSearchWidget(); SleekSitesWidget(); SleekPrivateWidget(); SleekDayWidget() }
}

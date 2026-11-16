// The widgets Sleek Slides offers. They are drawn by ../ios-shared/Widgets.swift.
import SwiftUI
import WidgetKit

@main
struct SlidesWidgets: WidgetBundle {
  var body: some Widget { SlidesRecentWidget(); SlidesDeckWidget(); SlidesDecksWidget() }
}

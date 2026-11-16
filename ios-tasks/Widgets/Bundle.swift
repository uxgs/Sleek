// The widgets Sleek Tasks offers. They are drawn by ../ios-shared/Widgets.swift.
import SwiftUI
import WidgetKit

@main
struct TasksWidgets: WidgetBundle {
  var body: some Widget { TasksGroceriesWidget(); TasksAislesWidget(); TasksDueWidget(); TasksBoardWidget(); TasksGoalWidget(); TasksGoalsWidget() }
}

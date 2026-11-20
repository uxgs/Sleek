// What the Sleek apps on an iPhone share: one folder they can all reach (the App Group group.com.uxg.sleek), in which
// each app keeps its copy of your work in a place of its own (browser, tasks, docs, slides, notes) that only it writes, and a
// ping that tells the others when one of them has written something. Each app brings in what is newer in the others'
// places when it opens, when it comes back to the front, and when it hears the ping.
// The browser, Docs and Slides share through ../browser/Sources/Sleek/Work.swift; Sleek Tasks through its Store.swift.
import Foundation
import UIKit
import WidgetKit

enum Shared {
  static let group = "group.com.uxg.sleek"
  static let apps = ["browser", "tasks", "docs", "slides", "notes"]
  private static let ping = "com.sleek.shared.changed" as CFString
  /// The shared folder, or nil when the app was built without the App Group.
  static var root: URL? { FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group)?.appendingPathComponent("Work", isDirectory: true) }
  /// An app's own place in it.
  static func place(_ app: String) -> URL? { root?.appendingPathComponent(app, isDirectory: true) }
  /// The other apps' places, and Siri's (what Siri added to a list: ios-shared/Siri.swift).
  static func peers(of app: String) -> [URL] { (apps + ["siri"]).filter { $0 != app }.compactMap(place) }
  /// Tell the other apps (and this one) that something was written.
  static func tell() { WidgetCenter.shared.reloadAllTimelines(); CFNotificationCenterPostNotification(CFNotificationCenterGetDarwinNotifyCenter(), CFNotificationName(ping), nil, nil, true) }
  @MainActor private static var heard: [@MainActor () -> Void] = []
  /// What to do on hearing it (on the main thread; each thing asked for is done).
  @MainActor static func listen(_ f: @escaping @MainActor () -> Void) {
    if heard.isEmpty { CFNotificationCenterAddObserver(CFNotificationCenterGetDarwinNotifyCenter(), nil, { _, _, _, _, _ in DispatchQueue.main.async { MainActor.assumeIsolated { WidgetCenter.shared.reloadAllTimelines(); for h in Shared.heard { h() } } } }, ping, nil, .deliverImmediately) }
    heard.append(f)
  }
  #if !WIDGET
  /// Some time to finish writing as the app is left, before iOS stops it.
  @MainActor static func whileLeaving(_ work: @escaping @MainActor () async -> Void) {
    let app = UIApplication.shared; var id = UIBackgroundTaskIdentifier.invalid
    id = app.beginBackgroundTask(withName: "Sleek: sharing your work") { if id != .invalid { app.endBackgroundTask(id); id = .invalid } }
    Task { @MainActor in await work(); if id != .invalid { app.endBackgroundTask(id); id = .invalid } }
  }
  #endif
}

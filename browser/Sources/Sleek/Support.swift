// Small things the Mac app leans on: where the app's own files are, and two kinds of plain view.
// (What the Mac app shares with the iPhone app, the app's own pages among it, is in Common.swift.)
import AppKit
import WebKit

enum Res {
  /// The app's own files: inside Sleek.app when it is one, otherwise this folder's Resources (a run from the source).
  static let root: URL = {
    let b = Bundle.main.bundleURL
    if b.pathExtension == "app" { return b.appendingPathComponent("Contents/Resources") }
    return URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("Resources")
  }()
  /// Slides, Docs and Tasks: a copy inside Sleek.app, or, run from the source, the site folder this one sits in.
  static let site: URL = {
    let inApp = root.appendingPathComponent("app")
    if FileManager.default.fileExists(atPath: inApp.appendingPathComponent("index.html").path) { return inApp }
    return root.deletingLastPathComponent().deletingLastPathComponent()
  }()
  static let args = CommandLine.arguments
  static func arg(_ name: String) -> String? { if let i = args.firstIndex(of: name), i + 1 < args.count { return args[i + 1] }; return nil }
  static let selfTest = arg("--selftest") ?? (args.contains("--lists") ? "" : nil)
}

/// A view whose top-left corner is its origin, as on a web page, so the bar's measurements can be used as they are.
class FlippedView: NSView { override var isFlipped: Bool { true } }
/// Bare window: pressing and dragging here moves the window; a double press zooms it.
final class DragView: NSView {
  override var mouseDownCanMoveWindow: Bool { true }
  override func mouseUp(with event: NSEvent) { if event.clickCount == 2 { window?.zoom(nil) } }
}

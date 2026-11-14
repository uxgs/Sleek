// Small things everything else leans on: where the app's own files are, where a person's data is
// kept, and the app's pages (sleek://ui/… for the bar and the start page, sleek://app/… for Slides,
// Docs and Tasks), which are served from inside the app and never touch the network.
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
  static let selfTest = arg("--selftest")
}

/// sleek://ui/<file> is the bar and the start page; sleek://app/<file> is Slides, Docs and Tasks.
final class OwnPages: NSObject, WKURLSchemeHandler {
  static let types: [String: String] = ["html": "text/html; charset=utf-8", "js": "text/javascript; charset=utf-8", "css": "text/css; charset=utf-8", "json": "application/json", "webmanifest": "application/manifest+json",
    "svg": "image/svg+xml", "png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg", "webp": "image/webp", "gif": "image/gif", "mp4": "video/mp4", "webm": "video/webm", "woff2": "font/woff2", "ico": "image/x-icon"]
  func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
    guard let url = task.request.url else { task.didFailWithError(URLError(.badURL)); return }
    let base = url.host == "ui" ? Res.root.appendingPathComponent("chrome") : Res.site
    var path = url.path; if path.isEmpty || path == "/" { path = "/index.html" }
    let file = base.appendingPathComponent(String(path.dropFirst())).standardizedFileURL
    guard file.path.hasPrefix(base.standardizedFileURL.path), let data = try? Data(contentsOf: file) else {
      task.didReceive(HTTPURLResponse(url: url, statusCode: 404, httpVersion: "HTTP/1.1", headerFields: ["Content-Type": "text/plain"])!)
      task.didReceive(Data("Not here".utf8)); task.didFinish(); return
    }
    let type = OwnPages.types[file.pathExtension.lowercased()] ?? "application/octet-stream"
    task.didReceive(HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: ["Content-Type": type, "Content-Length": "\(data.count)", "Cache-Control": "no-cache"])!)
    task.didReceive(data); task.didFinish()
  }
  func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}
}

/// A view whose top-left corner is its origin, as on a web page, so the bar's measurements can be used as they are.
class FlippedView: NSView { override var isFlipped: Bool { true } }
/// Bare window: pressing and dragging here moves the window; a double press zooms it.
final class DragView: NSView {
  override var mouseDownCanMoveWindow: Bool { true }
  override func mouseUp(with event: NSEvent) { if event.clickCount == 2 { window?.zoom(nil) } }
}

func json(_ value: Any) -> String {
  guard JSONSerialization.isValidJSONObject(value), let d = try? JSONSerialization.data(withJSONObject: value) else { return "null" }
  return String(data: d, encoding: .utf8) ?? "null"
}

/// What someone typed in the address box: an address to go to, or words to search for.
func destination(for typed: String, search: String) -> URL? {
  let t = typed.trimmingCharacters(in: .whitespacesAndNewlines); if t.isEmpty { return nil }
  if t.range(of: "^[a-zA-Z][a-zA-Z0-9+.-]*://", options: .regularExpression) != nil || t.hasPrefix("about:") { return URL(string: t) }
  let looksLikeAddress = !t.contains(" ") && (t.range(of: "^[^/\\s]+\\.[a-zA-Z]{2,}(:\\d+)?(/.*)?$", options: .regularExpression) != nil || t.hasPrefix("localhost") || t.range(of: "^\\d+\\.\\d+\\.\\d+\\.\\d+", options: .regularExpression) != nil)
  if looksLikeAddress { return URL(string: (t.hasPrefix("localhost") || t.first!.isNumber ? "http://" : "https://") + t) }
  var c = URLComponents(string: search)!; c.queryItems = [URLQueryItem(name: "q", value: t)]
  return c.url
}

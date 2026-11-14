// Your Sleek work, as the browser itself sees it.
//
// Slides, Docs and Tasks keep their work in the web engine's storage for sleek://app. The app reaches it
// through one page it keeps open out of sight (Resources/chrome/bridge.html, at sleek://app/_bridge.html),
// which loads the same storage code the three apps use. Through it the app knows what is due, your boards,
// and your latest pages and decks (for a new tab, the Tasks panel and the address box), and can add a
// task, tick one, or keep a web page as a Docs page (Save to Sleek). Keeping that page open also keeps
// the apps' engine warm, so they open at once.
//
// Nothing here goes anywhere but this Mac.
import AppKit
import WebKit

@MainActor
final class Work: NSObject, WKScriptMessageHandler {
  static let shared = Work()
  /// Where Sleek's own pages keep their work: one store for every ordinary window (a throwaway one while the app checks itself).
  static let store: WKWebsiteDataStore = Res.selfTest != nil ? .nonPersistent() : .default()
  private var web: WKWebView?
  private(set) var ready = false
  /// What is due, your boards, your latest pages and decks: as last read. (bridge.html: Work.day)
  private(set) var day: [String: Any] = [:]
  /// Every deck, page, board and open task by name, for the address box.
  private(set) var names: [[String: Any]] = []
  var onChange: [() -> Void] = []
  private var reading = false, again = false

  func start() {
    let c = WKWebViewConfiguration(); c.websiteDataStore = Work.store; c.setURLSchemeHandler(OwnPages(), forURLScheme: "sleek")
    c.userContentController.add(Weak(self), name: "sleekWork")
    let w = WKWebView(frame: NSRect(x: 0, y: 0, width: 480, height: 320), configuration: c); web = w
    w.load(URLRequest(url: URL(string: "sleek://app/_bridge.html")!))
  }
  func userContentController(_ c: WKUserContentController, didReceive message: WKScriptMessage) {
    guard let m = message.body as? [String: Any] else { return }
    if m["ready"] as? Bool == true { ready = true; refresh() }
    if m["changed"] != nil { refresh() }
    if let why = m["failed"] as? String { print("Sleek's work could not be opened:", why) }
  }
  /// Ask the page for something; nil when it is not ready or the asking fails.
  func ask(_ js: String, _ args: [String: Any] = [:]) async -> Any? {
    guard let w = web, ready else { return nil }
    return try? await w.callAsyncJavaScript(js, arguments: args, in: nil, contentWorld: .page)
  }
  /// Read your day and the names again, then tell whoever shows them. Asked for many times at once, it reads once more at the end.
  func refresh() {
    if !ready { return }; if reading { again = true; return }; reading = true
    Task { @MainActor in
      let d = await ask("return await Work.day()") as? [String: Any], n = await ask("return await Work.names()") as? [[String: Any]]
      if let d = d { day = d }; if let n = n { names = n }
      reading = false; onChange.forEach { $0() }
      if again { again = false; refresh() }
    }
  }

  static func dayKey(_ daysFromToday: Int) -> String {
    let d = Calendar.current.date(byAdding: .day, value: daysFromToday, to: Date()) ?? Date(), c = Calendar.current.dateComponents([.year, .month, .day], from: d)
    return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
  }
  /// Add a task. `due` is "today", "tomorrow" or nothing; the board is the first one when none is named. Says which board it went on.
  @discardableResult func addTask(title: String, board: String = "", due: String = "", url: String = "", words: String = "") async -> String? {
    let t = title.trimmingCharacters(in: .whitespacesAndNewlines); if t.isEmpty { return nil }
    let on = due == "today" ? Work.dayKey(0) : due == "tomorrow" ? Work.dayKey(1) : ""
    let r = await ask("return await Work.add(o)", ["o": ["title": t, "board": board, "due": on, "url": url, "words": words]]) as? [String: Any]
    return r?["board"] as? String
  }
  func tick(_ id: String, _ on: Bool) { Task { @MainActor in _ = await ask("return await Work.tick(id, on)", ["id": id, "on": on]); refresh() } }
  /// Keep a web page as a Docs page. Gives back the address of the new page.
  func keepPage(title: String, url: String, blocks: [[String: Any]]) async -> String? {
    let r = await ask("return await Work.page(o)", ["o": ["title": title, "url": url, "blocks": blocks]]) as? [String: Any]
    refresh()
    return (r?["id"] as? String).map { "sleek://app/doc.html?d=" + $0 }
  }
  /// Your decks, pages, boards and tasks whose names have every word typed.
  func suggest(_ typed: String, limit: Int = 4) -> [[String: Any]] {
    let words = typed.lowercased().split(separator: " ").map(String.init); if words.isEmpty || typed.count < 2 { return [] }
    var out: [[String: Any]] = []
    for n in names { let t = (n["title"] as? String ?? "").lowercased(); if words.allSatisfy({ t.contains($0) }) { out.append(n); if out.count >= limit { break } } }
    return out
  }
}

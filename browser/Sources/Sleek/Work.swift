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
  /// Open the door afresh (the app's own check uses this after emptying the storage, as the engine might one day).
  func restart() { ready = false; restoreTried = false; kept = [:]; day = [:]; names = []; web?.reload() }
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
      reading = false; onChange.forEach { $0() }; keepCopySoon()
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
  // ---------- the copy on this Mac, and bringing work in from files ----------
  // The apps' work lives in the web engine's storage, which the engine may clear. So the app also keeps a plain copy:
  // …/Application Support/Sleek/Work/Tasks.sleek, decks/<id>.sleek and pages/<id>.sleek, each the same file its own
  // app would save, written again whenever the thing changes. If the storage is ever found empty while a copy is
  // here, the copy is brought back. What you delete in Sleek moves to Work/Removed rather than vanishing.
  var folder: URL?
  var onNote: ((String) -> Void)?
  private var kept: [String: String] = [:], keeping = false, restoreTried = false, keepQueued = false
  private func safe(_ id: String) -> Bool { !id.isEmpty && id.count <= 24 && id.allSatisfy { $0.isASCII && ($0.isLetter || $0.isNumber) } }
  /// Keep the copy up to date a little while from now (so a run of changes is one pass).
  func keepCopySoon() {
    if keepQueued { return }; keepQueued = true
    DispatchQueue.main.asyncAfter(deadline: .now() + (Res.selfTest != nil ? 0.5 : 8)) { [weak self] in self?.keepQueued = false; Task { @MainActor in await self?.keepCopy() } }
  }
  func keepCopy() async {
    guard ready, !keeping, let dir = folder else { return }
    keeping = true; defer { keeping = false }
    guard let s = await ask("return await Work.stamps()") as? [String: Any] else { return }
    let decks = s["decks"] as? [[String: Any]] ?? [], pages = s["pages"] as? [[String: Any]] ?? [], boards = (s["boards"] as? NSNumber)?.intValue ?? 0
    let fm = FileManager.default, index = dir.appendingPathComponent("index.json")
    if decks.isEmpty && pages.isEmpty && boards == 0 {
      // nothing in the storage at all: if a copy is here the storage was lost, so bring the copy back (once in a run)
      if !restoreTried { restoreTried = true; if await restore(from: dir) > 0 { onNote?("Your Sleek work was brought back from the copy on this Mac"); refresh() } }
      return
    }
    for sub in ["decks", "pages"] { try? fm.createDirectory(at: dir.appendingPathComponent(sub), withIntermediateDirectories: true) }
    if kept.isEmpty, let d = try? Data(contentsOf: index), let k = try? JSONSerialization.jsonObject(with: d) as? [String: String] { kept = k }
    var changed = false
    if boards > 0, let stamp = s["tasks"] as? String, kept["tasks"] != stamp, let text = await ask("return await Work.file('tasks')") as? String {
      if (try? text.write(to: dir.appendingPathComponent("Tasks.sleek"), atomically: true, encoding: .utf8)) != nil { kept["tasks"] = stamp; changed = true }
    }
    let now = Date().timeIntervalSince1970 * 1000
    for (kind, list, sub) in [("deck", decks, "decks"), ("page", pages, "pages")] {
      var here = Set<String>()
      for d in list {
        guard let id = d["id"] as? String, safe(id) else { continue }
        here.insert(id)
        let at = (d["at"] as? NSNumber)?.doubleValue ?? 0, key = kind + ":" + id, stamp = String(Int(at))
        if kept[key] == stamp || (Res.selfTest == nil && now - at < 20_000) { continue }      // the copy is current, or the thing is still being worked on
        if let text = await ask("return await Work.file(kind, id)", ["kind": kind, "id": id]) as? String,
           (try? text.write(to: dir.appendingPathComponent(sub).appendingPathComponent(id + ".sleek"), atomically: true, encoding: .utf8)) != nil { kept[key] = stamp; changed = true }
      }
      // what is no longer in Sleek is moved aside, not deleted
      for f in (try? fm.contentsOfDirectory(at: dir.appendingPathComponent(sub), includingPropertiesForKeys: nil)) ?? [] where f.pathExtension == "sleek" {
        let id = f.deletingPathExtension().lastPathComponent; if here.contains(id) { continue }
        let aside = dir.appendingPathComponent("Removed").appendingPathComponent(sub); try? fm.createDirectory(at: aside, withIntermediateDirectories: true)
        let to = aside.appendingPathComponent(f.lastPathComponent); if fm.fileExists(atPath: to.path) { try? fm.removeItem(at: to) }
        try? fm.moveItem(at: f, to: to); kept[kind + ":" + id] = nil; changed = true
      }
    }
    if changed, let d = try? JSONSerialization.data(withJSONObject: kept, options: [.sortedKeys]) { try? d.write(to: index, options: .atomic) }
  }
  private func files(in dir: URL) -> [URL] {
    let fm = FileManager.default; var out: [URL] = []
    let tasks = dir.appendingPathComponent("Tasks.sleek"); if fm.fileExists(atPath: tasks.path) { out.append(tasks) }
    for sub in ["decks", "pages"] { out += ((try? fm.contentsOfDirectory(at: dir.appendingPathComponent(sub), includingPropertiesForKeys: nil)) ?? []).filter { $0.pathExtension == "sleek" } }
    return out
  }
  private func restore(from dir: URL) async -> Int { let got = await bring(files(in: dir)); return got.decks + got.pages + got.boards + got.tasks }
  /// Bring in Sleek files: decks, pages, a Sleek Tasks file, or everything in one. What is already here is left alone.
  func bring(_ files: [URL]) async -> (decks: Int, pages: Int, boards: Int, tasks: Int, here: Int, unread: Int) {
    var n = (decks: 0, pages: 0, boards: 0, tasks: 0, here: 0, unread: 0)
    for f in files {
      guard let text = try? String(contentsOf: f, encoding: .utf8), let r = await ask("return await Work.bring(text)", ["text": text]) as? [String: Any], r["error"] == nil else { n.unread += 1; continue }
      func v(_ k: String) -> Int { (r[k] as? NSNumber)?.intValue ?? 0 }
      n.decks += v("decks"); n.pages += v("pages"); n.boards += v("boards"); n.tasks += v("tasks"); n.here += v("here")
    }
    if n.decks + n.pages + n.boards + n.tasks > 0 { refresh() }
    return n
  }
  /// In a few words, what came of bringing files in.
  static func say(_ n: (decks: Int, pages: Int, boards: Int, tasks: Int, here: Int, unread: Int)) -> String {
    func count(_ k: Int, _ one: String) -> String? { k == 0 ? nil : "\(k) \(one)\(k == 1 ? "" : "s")" }
    let parts = [count(n.decks, "deck"), count(n.pages, "page"), count(n.boards, "board"), count(n.tasks, "task")].compactMap { $0 }
    if parts.isEmpty { return n.unread > 0 ? "That is not a Sleek file" : "Everything in there is already here" }
    return "Brought in " + parts.joined(separator: ", ") + (n.unread > 0 ? "; \(n.unread) could not be read" : "")
  }

  /// Your decks, pages, boards and tasks whose names have every word typed.
  func suggest(_ typed: String, limit: Int = 4) -> [[String: Any]] {
    let words = typed.lowercased().split(separator: " ").map(String.init); if words.isEmpty || typed.count < 2 { return [] }
    var out: [[String: Any]] = []
    for n in names { let t = (n["title"] as? String ?? "").lowercased(); if words.allSatisfy({ t.contains($0) }) { out.append(n); if out.count >= limit { break } } }
    return out
  }
}

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
import Foundation
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
    let w = WKWebView(frame: CGRect(x: 0, y: 0, width: 480, height: 320), configuration: c); web = w
    w.load(URLRequest(url: URL(string: "sleek://app/_bridge.html")!))
  }
  func userContentController(_ c: WKUserContentController, didReceive message: WKScriptMessage) {
    guard let m = message.body as? [String: Any] else { return }
    if m["ready"] as? Bool == true { ready = true; refresh(); if sharing { Task { @MainActor in await pull() } } }
    if m["changed"] != nil { refresh() }
    if let why = m["failed"] as? String { print("Sleek's work could not be opened:", why) }
  }
  /// Open the door afresh (the app's own check uses this after emptying the storage, as the engine might one day).
  func restart() { ready = false; restoreTried = false; kept = [:]; gone = nil; seen = [:]; day = [:]; names = []; web?.reload() }
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
    DispatchQueue.main.asyncAfter(deadline: .now() + (Res.selfTest != nil ? 0.5 : soon)) { [weak self] in self?.keepQueued = false; Task { @MainActor in await self?.keepCopy() } }
  }
  /// `now`: write what changed even if it was changed a moment ago (the app is being left, or another app is about to open).
  func keepCopy(now force: Bool = false) async {
    if force { for _ in 0..<100 where keeping { try? await Task.sleep(nanoseconds: 50_000_000) } }      // one already under way: this one follows it
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
    // (once there is a copy, it is written even when the last board has gone, so the other apps hear of it)
    if shares.contains("tasks"), boards > 0 || (sharing && kept["tasks"] != nil), let stamp = s["tasks"] as? String, kept["tasks"] != stamp, let text = await ask("return await Work.file('tasks')") as? String {
      if (try? text.write(to: dir.appendingPathComponent("Tasks.sleek"), atomically: true, encoding: .utf8)) != nil { kept["tasks"] = stamp; changed = true }
    }
    let now = Date().timeIntervalSince1970 * 1000
    for (kind, list, sub) in [("deck", decks, "decks"), ("page", pages, "pages")] where shares.contains(sub) {
      var here = Set<String>()
      for d in list {
        guard let id = d["id"] as? String, safe(id) else { continue }
        here.insert(id)
        let at = (d["at"] as? NSNumber)?.doubleValue ?? 0, key = kind + ":" + id, stamp = String(Int(at))
        if kept[key] == stamp || (!force && Res.selfTest == nil && now - at < settle) { continue }      // the copy is current, or the thing is still being worked on
        if let text = await ask("return await Work.file(kind, id)", ["kind": kind, "id": id]) as? String,
           (try? text.write(to: dir.appendingPathComponent(sub).appendingPathComponent(id + ".sleek"), atomically: true, encoding: .utf8)) != nil { kept[key] = stamp; changed = true }
      }
      // what is no longer in Sleek is moved aside, not deleted
      for f in (try? fm.contentsOfDirectory(at: dir.appendingPathComponent(sub), includingPropertiesForKeys: nil)) ?? [] where f.pathExtension == "sleek" {
        let id = f.deletingPathExtension().lastPathComponent; if here.contains(id) { continue }
        let aside = dir.appendingPathComponent("Removed").appendingPathComponent(sub); try? fm.createDirectory(at: aside, withIntermediateDirectories: true)
        let to = aside.appendingPathComponent(f.lastPathComponent); if fm.fileExists(atPath: to.path) { try? fm.removeItem(at: to) }
        try? fm.moveItem(at: f, to: to); kept[kind + ":" + id] = nil; changed = true
        if sharing && goneNotes()[kind + ":" + id] == nil { noteGone(kind + ":" + id, now) }      // so the other apps let it go too
      }
    }
    // which page is in which folder, for the other apps (only when it changed: the time says whose is newer)
    if sharing, shares.contains("pages"), let map = await ask("return await Work.folders()") as? [String: Any] {
      let file = dir.appendingPathComponent("folders.json"), mine = (try? Data(contentsOf: file)).flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }
      if !Work.same(map, mine) { var o = map; o["at"] = Int(now); if let d = try? JSONSerialization.data(withJSONObject: o, options: [.sortedKeys]) { try? d.write(to: file, options: .atomic); changed = true } }
    }
    // every page and deck in a few words, for the iPhone widgets (only what this app holds)
    if sharing, let g = await ask("return await Work.glance()") as? [String: Any] {
      var o: [String: Any] = [:]; for k in ["pages", "decks"] where shares.contains(k) { o[k] = g[k] ?? [] }
      let file = dir.appendingPathComponent("glance.json")
      if let d = try? JSONSerialization.data(withJSONObject: o, options: [.sortedKeys]), d != (try? Data(contentsOf: file)) { try? d.write(to: file, options: .atomic); changed = true }
    }
    if changed, let d = try? JSONSerialization.data(withJSONObject: kept, options: [.sortedKeys]) { try? d.write(to: index, options: .atomic) }
    if changed && sharing { tell?() }
  }

  // ---------- sharing with the other Sleek apps on the same iPhone ----------
  // On iPhone, the Sleek browser, Sleek Tasks, Sleek Docs and Sleek Slides each keep their own work and share it through
  // a folder they can all reach (an App Group). This app's copy (`folder`) is its own place there, which only it writes;
  // `peers` are the other apps' places. Pulling brings in what is newer in theirs: boards and tasks merge one by one
  // (core/task-store.js mergeAll), a page or a deck is taken whole when newer (adopt), Docs folders come with the newer
  // folders.json, and what another app deleted (its gone.json: what, and when) is deleted here unless it changed here since.
  // Each app writes only its own files, so two apps never write the same file. The Mac sets none of this.
  var peers: [URL] = []
  var sharing: Bool { !peers.isEmpty && folder != nil }
  /// What this app holds and shares: "tasks", "pages", "decks".
  var shares: Set<String> = ["tasks", "pages", "decks"]
  /// Tells the other apps that this one wrote something (the iPhone apps set it).
  var tell: (() -> Void)?
  /// A page or deck ("page", id) was taken from another app, or deleted as it was there: whoever shows it opens it afresh.
  var onAdopt: ((String, String) -> Void)?
  /// How long after a change the copy is written, and how long a page or deck must be left before it is (unless `now`).
  var soon: Double = 8
  var settle: Double = 20_000
  private var gone: [String: Double]?
  private var seen: [String: Date] = [:]
  private var pulling = false, pullAgain = false
  private static func num(_ v: Any?) -> Double { (v as? NSNumber)?.doubleValue ?? Double(v as? String ?? "") ?? 0 }
  private static func json(_ u: URL) -> Any? { (try? Data(contentsOf: u)).flatMap { try? JSONSerialization.jsonObject(with: $0) } }
  /// Two folder maps alike, leaving out when they were written.
  private static func same(_ a: [String: Any], _ b: [String: Any]?) -> Bool {
    guard var b = b else { return false }; var a = a; a["at"] = nil; b["at"] = nil
    return (try? JSONSerialization.data(withJSONObject: a, options: [.sortedKeys])) == (try? JSONSerialization.data(withJSONObject: b, options: [.sortedKeys]))
  }
  /// What was deleted here, and when ("page:<id>", "deck:<id>"); boards and tasks keep theirs inside Tasks.sleek.
  func goneNotes() -> [String: Double] {
    if let g = gone { return g }
    var g: [String: Double] = [:]
    if let dir = folder, let o = Work.json(dir.appendingPathComponent("gone.json")) as? [String: Any] { for (k, v) in o { g[k] = Work.num(v) } }
    gone = g; return g
  }
  private func noteGone(_ key: String, _ at: Double) {
    guard let dir = folder else { return }
    var g = goneNotes(); if (g[key] ?? 0) >= at { return }
    g[key] = at; let old = Date().timeIntervalSince1970 * 1000 - 90 * 864e5; g = g.filter { $0.value >= old }; gone = g
    if let d = try? JSONSerialization.data(withJSONObject: g.mapValues { Int($0) }, options: [.sortedKeys]) { try? d.write(to: dir.appendingPathComponent("gone.json"), options: .atomic) }
  }
  private func keepIndex(_ key: String, _ stamp: String) {
    guard let dir = folder else { return }; let index = dir.appendingPathComponent("index.json")
    if kept.isEmpty, let d = try? Data(contentsOf: index), let k = try? JSONSerialization.jsonObject(with: d) as? [String: String] { kept = k }
    kept[key] = stamp; if let d = try? JSONSerialization.data(withJSONObject: kept, options: [.sortedKeys]) { try? d.write(to: index, options: .atomic) }
  }
  /// Bring in what is newer in the other apps' copies. Says how many things changed here.
  @discardableResult func pull() async -> Int {
    guard ready, sharing, let dir = folder else { return 0 }
    if pulling { pullAgain = true; for _ in 0..<200 where pulling { try? await Task.sleep(nanoseconds: 50_000_000) }; return 0 }      // one under way: wait for it
    pulling = true
    let fm = FileManager.default; var took = 0
    var here: [String: Double] = [:]      // "page:<id>" and "deck:<id>": when each here last changed
    if let s = await ask("return await Work.stamps()") as? [String: Any] {
      for (kind, k) in [("deck", "decks"), ("page", "pages")] { for d in s[k] as? [[String: Any]] ?? [] { if let id = d["id"] as? String { here[kind + ":" + id] = Work.num(d["at"]) } } }
    }
    func split(_ key: String) -> (kind: String, sub: String, id: String)? {
      let b = key.split(separator: ":", maxSplits: 1).map(String.init); guard b.count == 2, safe(b[1]) else { return nil }
      let sub = b[0] == "deck" ? "decks" : b[0] == "page" ? "pages" : ""; return sub.isEmpty || !shares.contains(sub) ? nil : (b[0], sub, b[1])
    }
    for p in peers where fm.fileExists(atPath: p.path) {
      // what they deleted
      for (key, v) in Work.json(p.appendingPathComponent("gone.json")) as? [String: Any] ?? [:] {
        guard let k = split(key), let h = here[key] else { continue }; let at = Work.num(v)
        if h <= at, let r = await ask("return await Work.drop(kind, id, at)", ["kind": k.kind, "id": k.id, "at": at]) as? [String: Any], r["dropped"] as? Bool == true {
          took += 1; here[key] = nil; noteGone(key, at); onAdopt?(k.kind, k.id)
        }
      }
      // their boards and tasks, when their file changed since it was last read
      let tf = p.appendingPathComponent("Tasks.sleek")
      if shares.contains("tasks"), let m = (try? fm.attributesOfItem(atPath: tf.path))?[.modificationDate] as? Date, seen[tf.path] != m, let text = try? String(contentsOf: tf, encoding: .utf8) {
        if let r = await ask("return await Work.merge(text)", ["text": text]) as? [String: Any], r["error"] == nil { took += Int(Work.num(r["changed"])); seen[tf.path] = m }
      }
      // their pages and decks: their index says when each last changed
      for (key, stamp) in Work.json(p.appendingPathComponent("index.json")) as? [String: Any] ?? [:] {
        guard let k = split(key) else { continue }; let at = Work.num(stamp)
        if at <= (here[key] ?? 0) || at <= (goneNotes()[key] ?? 0) { continue }
        guard let text = try? String(contentsOf: p.appendingPathComponent(k.sub).appendingPathComponent(k.id + ".sleek"), encoding: .utf8) else { continue }
        if let r = await ask("return await Work.adopt(kind, text)", ["kind": k.kind, "text": text]) as? [String: Any], r["took"] as? Bool == true {
          took += 1; here[key] = at; onAdopt?(k.kind, k.id)
          // this app's copy has it at once, so that deleting it here before the next writing is still noticed and passed on
          let sub = dir.appendingPathComponent(k.sub); try? fm.createDirectory(at: sub, withIntermediateDirectories: true)
          if (try? text.write(to: sub.appendingPathComponent(k.id + ".sleek"), atomically: true, encoding: .utf8)) != nil { keepIndex(key, String(Int(at))) }
        }
      }
      // their folders, when theirs are newer than this app's
      if shares.contains("pages"), let o = Work.json(p.appendingPathComponent("folders.json")) as? [String: Any] {
        let mineFile = dir.appendingPathComponent("folders.json"), mine = Work.json(mineFile) as? [String: Any]
        if Work.num(o["at"]) > Work.num(mine?["at"]), !Work.same(o, mine), let r = await ask("return await Work.takeFolders(o)", ["o": o]) as? [String: Any], r["took"] as? Bool == true {
          took += 1
          // this app's map now, with their time: alike to theirs, so it is not passed back as newer
          if var now = await ask("return await Work.folders()") as? [String: Any] { now["at"] = Int(Work.num(o["at"])); if let d = try? JSONSerialization.data(withJSONObject: now, options: [.sortedKeys]) { try? d.write(to: mineFile, options: .atomic) } }
        }
      }
    }
    pulling = false
    if took > 0 { refresh() }      // the screens redraw, and this app's copy is written again, so the others hear of it
    if pullAgain { pullAgain = false; took += await pull() }
    return took
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

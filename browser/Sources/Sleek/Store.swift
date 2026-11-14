// What Sleek remembers on this Mac, as plain files in ~/Library/Application Support/Sleek:
//   settings.json    how the window looks and behaves
//   bookmarks.json   the bookmarks bar: [{ id, title, url }]
//   history.json     pages visited: [{ u: address, t: title, at: when, n: how many times }], newest first
//   session.json     the tabs that were open, to open them again next time
// Nothing here is sent anywhere. A private window reads the settings and bookmarks and writes no history.
import Foundation

final class Store {
  let dir: URL
  var settings: [String: Any] = ["look": "auto", "theme": "graphite", "barAt": "top", "imm": false, "bar": false, "search": "https://duckduckgo.com/"]
  var bookmarks: [[String: Any]] = []
  var history: [[String: Any]] = []
  var onChange: [() -> Void] = []
  private var pending: Set<String> = []

  init(dir: URL) {
    self.dir = dir
    try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    if let s = read("settings") as? [String: Any] { for (k, v) in s { settings[k] = v } }
    if settings["barSet"] == nil { settings["bar"] = false }      // the bookmarks bar starts hidden; once you show or hide it yourself, that is kept
    if let b = read("bookmarks") as? [[String: Any]] { bookmarks = b }
    if let h = read("history") as? [[String: Any]] { history = h }
  }
  private func read(_ name: String) -> Any? { guard let d = try? Data(contentsOf: dir.appendingPathComponent(name + ".json")) else { return nil }; return try? JSONSerialization.jsonObject(with: d) }
  func write(_ name: String, _ value: Any) { if let d = try? JSONSerialization.data(withJSONObject: value, options: [.prettyPrinted, .sortedKeys]) { try? d.write(to: dir.appendingPathComponent(name + ".json"), options: .atomic) } }
  /// Save a little later, so a run of changes is one write.
  private func soon(_ name: String) {
    if pending.contains(name) { return }; pending.insert(name)
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { [weak self] in guard let s = self else { return }; s.pending.remove(name); s.write(name, name == "settings" ? s.settings : name == "bookmarks" ? s.bookmarks : s.history) }
  }
  func flush() { write("settings", settings); write("bookmarks", bookmarks); write("history", history) }
  private func changed() { onChange.forEach { $0() } }

  func set(_ key: String, _ value: Any) { settings[key] = value; if key == "bar" { settings["barSet"] = true }; soon("settings"); changed() }
  var search: String { settings["search"] as? String ?? "https://duckduckgo.com/" }

  func bookmark(for url: String) -> [String: Any]? { bookmarks.first { ($0["url"] as? String) == url } }
  func addBookmark(title: String, url: String) { if bookmark(for: url) != nil { return }; bookmarks.append(["id": UUID().uuidString, "title": title.isEmpty ? url : title, "url": url]); soon("bookmarks"); changed() }
  func removeBookmark(url: String) { bookmarks.removeAll { ($0["url"] as? String) == url }; soon("bookmarks"); changed() }
  func renameBookmark(url: String, title: String) { if let i = bookmarks.firstIndex(where: { ($0["url"] as? String) == url }), !title.isEmpty { bookmarks[i]["title"] = title; soon("bookmarks"); changed() } }

  func visit(url: String, title: String) {
    guard url.hasPrefix("http") else { return }
    var n = 1
    if let i = history.firstIndex(where: { ($0["u"] as? String) == url }) { n = (history[i]["n"] as? Int ?? 1) + 1; history.remove(at: i) }
    history.insert(["u": url, "t": title, "at": Date().timeIntervalSince1970, "n": n], at: 0)
    if history.count > 5000 { history.removeLast(history.count - 5000) }
    soon("history")
  }
  func retitle(url: String, title: String) { if let i = history.firstIndex(where: { ($0["u"] as? String) == url }), !title.isEmpty { history[i]["t"] = title; soon("history") } }
  func clearHistory() { history = []; soon("history"); changed() }
  /// How to finish an address that is being typed: the site you go to most that begins that way, then a bookmark,
  /// then a well-known site. What was typed comes back as typed, with the rest added; nothing when there is no match.
  func finish(_ typed: String, known: Bool) -> String {
    let q = typed.lowercased(); if q.isEmpty || q.contains(" ") || q.contains("/") || q.contains(":") { return "" }
    let bare = q.hasPrefix("www.") ? String(q.dropFirst(4)) : q; if bare.isEmpty { return "" }
    func site(_ address: String?) -> String? { guard let h = address.flatMap({ URL(string: $0)?.host?.lowercased() }) else { return nil }; return h.hasPrefix("www.") ? String(h.dropFirst(4)) : h }
    var sites: [String] = []
    if known { sites += history.prefix(400).sorted { ($0["n"] as? Int ?? 1) > ($1["n"] as? Int ?? 1) }.compactMap { site($0["u"] as? String) } }
    sites += bookmarks.compactMap { site($0["url"] as? String) } + Sites.all.map { $0.host }
    guard let s = sites.first(where: { $0.hasPrefix(bare) && $0.count > bare.count }) else { return "" }
    return typed + s.dropFirst(bare.count)
  }
  /// Pages from history and bookmarks whose title or address has every word typed; most visited and most recent first.
  func suggest(_ typed: String, limit: Int = 6) -> [[String: Any]] {
    let words = typed.lowercased().split(separator: " ").map(String.init); if words.isEmpty { return [] }
    func hit(_ t: String, _ u: String) -> Bool { let hay = (t + " " + u).lowercased(); return words.allSatisfy { hay.contains($0) } }
    var out: [[String: Any]] = [], seen = Set<String>()
    for b in bookmarks { let t = b["title"] as? String ?? "", u = b["url"] as? String ?? ""; if hit(t, u), !seen.contains(u) { seen.insert(u); out.append(["title": t, "url": u, "kind": "bookmark"]) } }
    let ranked = history.filter { hit($0["t"] as? String ?? "", $0["u"] as? String ?? "") }.prefix(200).sorted { ($0["n"] as? Int ?? 1) > ($1["n"] as? Int ?? 1) }
    for h in ranked { let u = h["u"] as? String ?? ""; if !seen.contains(u) { seen.insert(u); out.append(["title": h["t"] as? String ?? "", "url": u, "kind": "history"]) }; if out.count >= limit { break } }
    return Array(out.prefix(limit))
  }
}

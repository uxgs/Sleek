// Blocking: ads, trackers and cookie banners, from the public lists other blockers use.
//
// The lists (EasyList, EasyPrivacy and the EasyList Cookie List) are plain text, one rule a line, in
// the form Adblock Plus made common. The web engine has its own, stricter form. This file:
//   1. reads a list and turns each line it can into one or more of the engine's rules (convert),
//      leaving out what the engine has no way to say;
//   2. hands the rules to the engine to make ready (compile). If the engine refuses the batch, it
//      finds the offending rules by halving and leaves them out;
//   3. keeps the ready lists (the engine stores them, so this is slow only the first time, or after
//      a list changes), and gives them to every tab;
//   4. fetches fresh lists every few days.
// A copy of the lists ships inside the app (make.sh puts it there), so blocking works from the first
// launch with no connection. Newer copies live in ~/Library/Application Support/Sleek/lists.
//
// What a line can be, and what becomes of it:
//   ||ads.example^                    a request to that site or below it          -> a block rule
//   /banner/*.gif$image,third-party   a pattern, with the kinds of request        -> a block rule
//   @@||ok.example^                   an exception                                -> "ignore the rules before"
//   ##.ad-box, site.com##.promo       hide what matches, everywhere or on a site  -> a hide rule
//   ||popads.example^$popup           a site only ever opened as a pop-up         -> kept in popupHosts
//   anything with options the engine can't express (csp, redirect, scripts…)      -> left out
import Foundation
import WebKit

struct Converted {
  var rules: [String] = []          // block and hide rules, each the engine's JSON for one rule
  var exceptions: [String] = []     // "ignore the rules before", which must come after them
  var popupHosts = Set<String>()
  var left = 0                      // lines left out
}

enum ListConverter {
  static let everything = ["image", "style-sheet", "script", "font", "raw", "svg-document", "media", "ping", "fetch", "websocket", "other"]
  static let kinds: [String: [String]] = ["script": ["script"], "image": ["image"], "stylesheet": ["style-sheet"], "xmlhttprequest": ["raw", "fetch"], "font": ["font"], "media": ["media"], "websocket": ["websocket"], "ping": ["ping"], "other": ["other"]]
  static let cannotHide = [":has-text(", ":contains(", ":xpath(", ":-abp-", ":matches-", ":upward(", ":remove(", ":style(", ":watch-attr", ":min-text-length", ":nth-ancestor", ":others(", ":if(", ":if-not(", "{", "}"]

  static func quote(_ s: String) -> String {
    var o = "\""; o.reserveCapacity(s.count + 2)
    for u in s.unicodeScalars { switch u { case "\"": o += "\\\""; case "\\": o += "\\\\"; case "\n": o += "\\n"; case "\r": o += "\\r"; case "\t": o += "\\t"; default: if u.value < 0x20 { o += String(format: "\\u%04x", u.value) } else { o.unicodeScalars.append(u) } } }
    return o + "\""
  }
  static func array(_ a: [String]) -> String { "[" + a.map(quote).joined(separator: ",") + "]" }

  /// The pattern of a line as the engine's kind of expression, or nil if it has no way to say it.
  static func expression(_ pattern: String) -> String? {
    var p = Substring(pattern); if p.isEmpty { return nil }
    var out = ""
    if p.hasPrefix("||") { out = "^[^:]+:(//)?([^/]+\\.)?"; p = p.dropFirst(2) } else if p.hasPrefix("|") { out = "^"; p = p.dropFirst() }
    var end = ""; if p.hasSuffix("|") { end = "$"; p = p.dropLast() }
    while p.hasPrefix("*") { p = p.dropFirst() }; while p.hasSuffix("*") { p = p.dropLast() }
    if p.count < 3 { return nil }
    for c in p.unicodeScalars {
      if c.value > 126 || c.value < 33 { return nil }
      switch c { case "*": out += ".*"; case "^": out += "[/:&?=]"; case ".", "+", "?", "$", "{", "}", "(", ")", "[", "]", "|", "\\": out += "\\"; out.unicodeScalars.append(c); default: out.unicodeScalars.append(c) }
    }
    return out + end
  }
  /// The host of a line like ||host^ or ||host/path, for pop-up rules.
  static func host(_ pattern: String) -> String? {
    guard pattern.hasPrefix("||") else { return nil }
    let h = pattern.dropFirst(2).prefix { $0 != "^" && $0 != "/" && $0 != "*" && $0 != ":" }
    return h.contains(".") && h.allSatisfy({ $0.isASCII && ($0.isLetter || $0.isNumber || $0 == "." || $0 == "-") }) ? h.lowercased() : nil
  }
  static func rule(_ expr: String, kinds: [String]?, childFrame: Bool = false, party: String?, on: [String], notOn: [String], caseMatters: Bool, action: String) -> String {
    var t = "\"url-filter\":" + quote(expr)
    if caseMatters { t += ",\"url-filter-is-case-sensitive\":true" }
    if let k = kinds { t += ",\"resource-type\":" + array(k) }
    if childFrame { t += ",\"load-context\":[\"child-frame\"]" }
    if let p = party { t += ",\"load-type\":[\"" + p + "\"]" }
    if !on.isEmpty { t += ",\"if-domain\":" + array(on.map { "*" + $0 }) } else if !notOn.isEmpty { t += ",\"unless-domain\":" + array(notOn.map { "*" + $0 }) }
    return "{\"trigger\":{" + t + "},\"action\":{\"type\":\"" + action + "\"}}"
  }
  static func domains(_ list: Substring, by sep: Character) -> (on: [String], notOn: [String])? {
    var on: [String] = [], notOn: [String] = []
    for d in list.split(separator: sep) { let neg = d.hasPrefix("~"), name = (neg ? d.dropFirst() : d).lowercased()
      if name.isEmpty || !name.allSatisfy({ $0.isASCII && ($0.isLetter || $0.isNumber || $0 == "." || $0 == "-") }) { return nil }
      if neg { notOn.append(name) } else { on.append(name) } }
    return (on, notOn)
  }

  /// A whole list. frames: also block the frames of sites the list blocks (for the ads list).
  static func convert(_ text: String, frames: Bool) -> Converted {
    var out = Converted()
    var hideOn: [String: [String]] = [:], order: [String] = []      // which selectors to hide, by where: "" everywhere, "a.com,b.com" there, "~a.com" everywhere but there
    text.enumerateLines { raw, _ in
      let line = raw.trimmingCharacters(in: .whitespaces)
      if line.isEmpty || line.hasPrefix("!") || line.hasPrefix("[") { return }
      // ----- hiding -----
      if let at = line.range(of: "##"), !line.contains("#@#"), !line.contains("#?#"), !line.contains("#$#"), !line.contains("#%#") {
        let sel = String(line[at.upperBound...])
        if sel.isEmpty || sel.hasPrefix("+js(") || sel.hasPrefix("^") || cannotHide.contains(where: { sel.contains($0) }) { out.left += 1; return }
        guard let d = domains(line[..<at.lowerBound], by: ",") else { out.left += 1; return }
        let key = !d.on.isEmpty ? d.on.joined(separator: ",") : d.notOn.isEmpty ? "" : "~" + d.notOn.joined(separator: ",")
        if hideOn[key] == nil { order.append(key) }; hideOn[key, default: []].append(sel); return
      }
      if line.contains("#@#") || line.contains("#?#") || line.contains("#$#") || line.contains("#%#") { out.left += 1; return }
      // ----- requests -----
      var s = Substring(line), exception = false
      if s.hasPrefix("@@") { exception = true; s = s.dropFirst(2) }
      var options: [Substring] = []
      if let d = s.lastIndex(of: "$"), d != s.startIndex { let tail = s[s.index(after: d)...]
        if let f = tail.first, f.isLetter || f == "~", tail.allSatisfy({ $0.isASCII && ($0.isLetter || $0.isNumber || "~,=|_.-:/*".contains($0)) }) { options = tail.split(separator: ","); s = s[..<d] } }
      if s.hasPrefix("/") && s.hasSuffix("/") && s.count > 2 { out.left += 1; return }      // a full expression of its own: the engine's are too limited to trust with it
      var want: [String] = [], unwanted: [String] = [], frame = false, party: String? = nil, on: [String] = [], notOn: [String] = [], popup = false, caseMatters = false, cannot = false, page = false
      for o in options {
        let parts = o.split(separator: "=", maxSplits: 1), name = parts[0].lowercased()
        switch name {
        case "third-party", "3p": party = "third-party"
        case "~third-party", "1p", "first-party": party = "first-party"
        case "subdocument": frame = true
        case "~subdocument", "~object", "~object-subrequest", "important", "~popup", "~document": break
        case "popup": popup = true
        case "document": page = true
        case "match-case": caseMatters = true
        case "domain": if parts.count == 2, let d = domains(parts[1], by: "|") { on = d.on; notOn = d.notOn } else { cannot = true }
        default:
          if let k = kinds[name] { want += k } else if name.hasPrefix("~"), let k = kinds[String(name.dropFirst())] { unwanted += k } else { cannot = true }
        }
      }
      if cannot { out.left += 1; return }
      let pattern = String(s)
      if popup && !exception, let h = host(pattern) { out.popupHosts.insert(h) }
      if popup && want.isEmpty && !frame && !page { return }                              // only ever a pop-up: handled when a page asks for a new tab
      if exception && page { out.left += 1; return }                                       // "leave this whole site alone": left out, so the site is still blocked on
      guard let expr = expression(pattern) else { out.left += 1; return }
      let action = exception ? "ignore-previous-rules" : "block"
      func add(_ r: String) { if exception { out.exceptions.append(r) } else { out.rules.append(r) } }
      let plain = want.isEmpty && !frame && !page
      let kindsWanted = plain ? everything.filter { !unwanted.contains($0) } : want
      if !kindsWanted.isEmpty { add(rule(expr, kinds: kindsWanted, party: party, on: on, notOn: notOn, caseMatters: caseMatters, action: action)) }
      if frame || (plain && frames && pattern.hasPrefix("||")) { add(rule(expr, kinds: ["document"], childFrame: true, party: party, on: on, notOn: notOn, caseMatters: caseMatters, action: action)) }
      if page { add(rule(expr, kinds: ["document"], party: party, on: on, notOn: notOn, caseMatters: caseMatters, action: action)) }
    }
    // the hiding rules: selectors that share a place go together, a few to a rule (one bad selector then costs only its few)
    for key in order {
      let sels = hideOn[key] ?? []
      let place = key.isEmpty ? "" : key.hasPrefix("~") ? ",\"unless-domain\":" + array(key.dropFirst().split(separator: ",").map { "*" + $0 }) : ",\"if-domain\":" + array(key.split(separator: ",").map { "*" + $0 })
      var i = 0; while i < sels.count { let part = sels[i..<min(i + 24, sels.count)].joined(separator: ", "); i += 24
        out.rules.append("{\"trigger\":{\"url-filter\":\".*\"" + place + "},\"action\":{\"type\":\"css-display-none\",\"selector\":" + quote(part) + "}}") }
    }
    return out
  }
}

@MainActor
final class Blocker {
  static let shared = Blocker()
  static let sources: [(id: String, title: String, url: String)] = [
    ("ads", "EasyList", "https://easylist.to/easylist/easylist.txt"),
    ("privacy", "EasyPrivacy", "https://easylist.to/easylist/easyprivacy.txt"),
    ("cookies", "EasyList Cookie List", "https://secure.fanboy.co.nz/fanboy-cookiemonster.txt")]
  static let most = 149_000      // the engine takes 150,000 rules in one list

  private(set) var lists: [String: WKContentRuleList] = [:]
  private(set) var popupHosts = Set<String>()
  private(set) var facts: [String: [String: Any]] = [:]      // for each list: rules, left out, dropped, when it was made ready, its version
  var onChange: [() -> Void] = []
  private var dir = FileManager.default.temporaryDirectory
  private var working = false
  var ready: Bool { lists.count == Blocker.sources.count }
  var summary: [String: Any] { ["ready": ready, "rules": facts.values.reduce(0) { $0 + ($1["rules"] as? Int ?? 0) }, "updated": facts.values.compactMap { $0["dated"] as? String }.max() ?? ""] }

  /// The newest copy of a list: one fetched since, or the one that came inside the app.
  private func source(_ id: String) -> URL? {
    let fresh = dir.appendingPathComponent(id + ".txt"), shipped = Res.root.appendingPathComponent("lists/" + id + ".txt"), built = Res.root.deletingLastPathComponent().appendingPathComponent("build/lists/" + id + ".txt")
    for u in [fresh, shipped, built] where FileManager.default.fileExists(atPath: u.path) { return u }
    return nil
  }
  /// A short name for exactly this copy of a list: its size and its own "Version" or "Last modified" line.
  private func version(_ text: String) -> (id: String, dated: String) {
    var stamp = "", dated = ""
    for l in text.prefix(1200).split(separator: "\n") { if l.hasPrefix("! Version:") || l.hasPrefix("! Last modified:") { stamp += l; if dated.isEmpty { dated = l.split(separator: ":", maxSplits: 1).last.map { $0.trimmingCharacters(in: .whitespaces) } ?? "" } } }
    var h: UInt64 = 1469598103934665603; for b in (stamp + "#\(text.utf8.count)#3").utf8 { h = (h ^ UInt64(b)) &* 1099511628211 }      // the trailing number changes when the way lists are converted changes
    return (String(h, radix: 36), dated)
  }

  func start(dir: URL) {
    self.dir = dir; try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    if let saved = (try? JSONSerialization.jsonObject(with: Data(contentsOf: dir.appendingPathComponent("ready.json")))) as? [String: Any] {
      facts = saved["lists"] as? [String: [String: Any]] ?? [:]; popupHosts = Set(saved["popups"] as? [String] ?? [])
    }
    Task { await makeReady(); if Res.selfTest == nil { await refreshIfOld() } }
  }
  private func compile(_ id: String, _ rules: ArraySlice<String>) async -> WKContentRuleList? {
    let text = "[" + rules.joined(separator: ",") + "]"
    return await withCheckedContinuation { c in WKContentRuleListStore.default().compileContentRuleList(forIdentifier: id, encodedContentRuleList: text) { l, _ in c.resume(returning: l) } }
  }
  private func lookUp(_ id: String) async -> WKContentRuleList? { await withCheckedContinuation { c in WKContentRuleListStore.default().lookUpContentRuleList(forIdentifier: id) { l, _ in c.resume(returning: l) } } }
  /// The rules of a batch the engine accepts. A refused batch is halved until the bad rules are alone, and those are dropped.
  private func sound(_ rules: ArraySlice<String>, dropped: inout Int) async -> [String] {
    if rules.isEmpty { return [] }
    if await compile("sleek-probe", rules) != nil { return Array(rules) }
    if rules.count == 1 { dropped += 1; return [] }
    let mid = rules.startIndex + rules.count / 2
    let a = await sound(rules[rules.startIndex..<mid], dropped: &dropped), b = await sound(rules[mid..<rules.endIndex], dropped: &dropped)
    return a + b
  }
  /// For the app's own checks: how many of these rules survive the halving that drops what the engine refuses.
  func soundCount(_ rules: [String]) async -> (kept: Int, dropped: Int) { var d = 0; let ok = await sound(rules[...], dropped: &d); return (ok.count, d) }
  /// Make every list ready: use what the engine already holds for this exact copy, or convert and compile it.
  private func makeReady() async {
    if working { return }; working = true; defer { working = false }
    var popups = Set<String>(), changed = false
    for s in Blocker.sources {
      guard let file = source(s.id), let text = try? String(contentsOf: file, encoding: .utf8) else { continue }
      let v = version(text), name = "sleek-" + s.id + "-" + v.id
      if (facts[s.id]?["version"] as? String) == v.id, let held = await lookUp(name) { lists[s.id] = held; continue }
      let frames = s.id == "ads"
      let made = await Task.detached(priority: .utility) { ListConverter.convert(text, frames: frames) }.value
      var rules = made.rules; if rules.count + made.exceptions.count > Blocker.most { rules = Array(rules.prefix(Blocker.most - made.exceptions.count)) }
      var all = rules + made.exceptions, dropped = 0
      var list = await compile(name, all[...])
      if list == nil { all = await sound(all[...], dropped: &dropped); list = await compile(name, all[...]) }
      guard let ok = list else { continue }
      lists[s.id] = ok; changed = true
      facts[s.id] = ["version": v.id, "dated": v.dated, "rules": all.count, "left": made.left, "dropped": dropped, "popups": Array(made.popupHosts), "title": s.title]
    }
    for f in facts.values { popups.formUnion(f["popups"] as? [String] ?? []) }
    popupHosts = popups
    if changed {
      if let d = try? JSONSerialization.data(withJSONObject: ["lists": facts, "popups": []]) { try? d.write(to: dir.appendingPathComponent("ready.json"), options: .atomic) }
      // lists the engine holds for older copies are no longer needed
      let keep = Set(Blocker.sources.compactMap { s in (facts[s.id]?["version"] as? String).map { "sleek-" + s.id + "-" + $0 } })
      WKContentRuleListStore.default().getAvailableContentRuleListIdentifiers { ids in (ids ?? []).filter { $0.hasPrefix("sleek-") && !keep.contains($0) }.forEach { WKContentRuleListStore.default().removeContentRuleList(forIdentifier: $0) { _ in } } }
    }
    onChange.forEach { $0() }
  }
  /// Every few days, fetch the lists again from where they are published.
  private func refreshIfOld() async {
    var fetched = false
    for s in Blocker.sources {
      let fresh = dir.appendingPathComponent(s.id + ".txt")
      let age = ((try? (source(s.id) ?? fresh).resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? nil).map { Date().timeIntervalSince($0) } ?? .infinity
      if age < 5 * 86400 { continue }
      var req = URLRequest(url: URL(string: s.url)!); req.setValue("Sleek", forHTTPHeaderField: "User-Agent"); req.timeoutInterval = 60
      if let (data, resp) = try? await URLSession.shared.data(for: req), (resp as? HTTPURLResponse)?.statusCode == 200, data.count > 50_000, let text = String(data: data, encoding: .utf8), text.contains("||") { try? data.write(to: fresh, options: .atomic); fetched = true }
    }
    if fetched { await makeReady() }
  }
  func isPopupHost(_ host: String?) -> Bool {
    guard var h = host?.lowercased() else { return false }
    while true { if popupHosts.contains(h) { return true }; guard let dot = h.firstIndex(of: "."), h[h.index(after: dot)...].contains(".") else { return false }; h = String(h[h.index(after: dot)...]) }
  }
}

// Your notes, as the widgets and the Notes app's own screens read them: from the folder the Sleek apps share
// (Shared.swift), where Sleeky Notes and the Sleek browser each keep a copy as Notes.sleek, the file Sleeky Notes
// saves everywhere (../core/note-store.js). Each note is taken from whichever copy changed it last, and a note
// deleted in one is left out.
//
// A locked note's text is scrambled in that file, so nothing here can show it: a widget shows its title, its icon
// and a lock, as the app's list does.
import Foundation

/// One line of a note: plain, or a checklist line that is ticked or not.
struct NoteLine: Hashable { let text: String; let check: Bool; let done: Bool }

struct NoteGlance: Identifiable, Hashable {
  let id, title, icon, color, folder: String
  let tags: [String]
  let pin, lock: Bool
  let at: Double                                 // when it last changed, in milliseconds
  let lines: [NoteLine]                          // none for a locked note
  var shown: String { title.isEmpty ? "Untitled" : title }
  /// Its first words, for under its title.
  var peek: String { lock ? "Locked" : lines.map(\.text).filter { !$0.trimmingCharacters(in: .whitespaces).isEmpty }.prefix(3).joined(separator: " · ") }
}

enum NoteData {
  typealias R = [String: Any]
  /// The apps that keep notes, each in its own place in the shared folder.
  static let apps = ["notes", "browser"]
  static func file(_ app: String, _ root: URL?) -> URL? { root?.appendingPathComponent(app, isDirectory: true).appendingPathComponent("Notes.sleek") }
  private static func num(_ v: Any?) -> Double { (v as? NSNumber)?.doubleValue ?? 0 }
  private static func json(_ f: URL?) -> R? { f.flatMap { try? Data(contentsOf: $0) }.flatMap { (try? JSONSerialization.jsonObject(with: $0)) as? R } }

  /// Every note, pinned ones first, then the one changed last.
  static func read(_ root: URL?) -> [NoteGlance] {
    var notes: [String: R] = [:], gone: [String: Double] = [:], folders: [String: String] = [:]
    for app in apps {
      guard let o = json(file(app, root)), o["format"] as? String == "sleek-notes", num(o["version"]) <= 1 else { continue }
      for (id, t) in o["gone"] as? R ?? [:] { gone[id] = max(gone[id] ?? 0, num(t)) }
      for f in o["folders"] as? [R] ?? [] { if let id = f["id"] as? String, let n = f["name"] as? String { folders[id] = n } }
      for n in o["notes"] as? [R] ?? [] {
        guard let id = n["id"] as? String, n["title"] is String else { continue }
        if let have = notes[id], stamp(have) >= stamp(n) { continue }
        notes[id] = n
      }
    }
    return notes.values.filter { (gone[$0["id"] as? String ?? ""] ?? 0) < stamp($0) }.map { n in
      let lock = n["lock"] as? Bool == true && n["sealed"] != nil
      return NoteGlance(id: n["id"] as? String ?? "", title: n["title"] as? String ?? "", icon: n["icon"] as? String ?? "note", color: n["color"] as? String ?? "#F5A80C",
                        folder: folders[n["folder"] as? String ?? ""] ?? "", tags: n["tags"] as? [String] ?? [], pin: n["pin"] as? Bool == true, lock: lock, at: num(n["updated"]),
                        lines: lock ? [] : lines(n["body"] as? String ?? ""))
    }.sorted { $0.pin != $1.pin ? $0.pin : $0.at > $1.at }
  }
  private static func stamp(_ n: R) -> Double { max(num(n["stamp"]), num(n["updated"])) }

  /// A note's text (lines of <div>, some of them checklist lines, with <b> and <br> inside: ../note/editor.js) as lines.
  static func lines(_ html: String) -> [NoteLine] {
    guard let re = try? NSRegularExpression(pattern: "<div(?: class=\"ck\" data-done=\"([01])\")?>(.*?)</div>", options: [.dotMatchesLineSeparators]) else { return [] }
    let s = html as NSString
    return re.matches(in: html, range: NSRange(location: 0, length: s.length)).map { m in
      let done = m.range(at: 1).location == NSNotFound ? nil : s.substring(with: m.range(at: 1))
      return NoteLine(text: plain(s.substring(with: m.range(at: 2))), check: done != nil, done: done == "1")
    }
  }
  private static func plain(_ s: String) -> String {
    var t = s.replacingOccurrences(of: "<br>", with: " ").replacingOccurrences(of: "<[^>]+>", with: "", options: .regularExpression)
    for (a, b) in [("&lt;", "<"), ("&gt;", ">"), ("&quot;", "\""), ("&nbsp;", " "), ("&amp;", "&")] { t = t.replacingOccurrences(of: a, with: b) }
    return t
  }

  /// A note's icon as the iPhone's own symbol (the names are ../note/app.js's NOTE_ICONS).
  static func symbol(_ icon: String) -> String {
    ["note": "note.text", "bulb": "lightbulb", "cart": "cart", "key": "key", "heart": "heart", "star": "star", "plane": "airplane", "book": "book", "home": "house", "work": "briefcase",
     "music": "music.note", "gift": "gift", "wifi": "wifi", "leaf": "leaf", "food": "fork.knife", "card": "creditcard", "code": "chevron.left.forwardslash.chevron.right", "health": "cross.case",
     "fit": "dumbbell", "camera": "camera", "car": "car", "phone": "iphone", "chat": "bubble.left", "sun": "sun.max"][icon] ?? "note.text"
  }

  // ---------- the addresses Sleeky Notes for iPhone answers to ----------
  /// sleek-notes://open (your notes), ://open?id=<id> (a note), ://jot and ://new (a new note, open in full).
  static func link(_ what: String, id: String? = nil) -> URL {
    var c = URLComponents(); c.scheme = "sleek-notes"; c.host = what
    if let id, id.range(of: "^[a-z0-9]{4,24}$", options: .regularExpression) != nil { c.queryItems = [URLQueryItem(name: "id", value: id)] }
    return c.url!
  }
  /// What an address asks for: ("open", id or nil), ("jot", nil) or ("new", nil); nil when it is not one of ours.
  static func ask(_ u: URL) -> (what: String, id: String?)? {
    guard u.scheme == "sleek-notes", let h = u.host, ["open", "jot", "new"].contains(h) else { return nil }
    let id = URLComponents(url: u, resolvingAgainstBaseURL: false)?.queryItems?.first { $0.name == "id" }?.value
    return (h, id.flatMap { $0.range(of: "^[a-z0-9]{4,24}$", options: .regularExpression) != nil ? $0 : nil })
  }
}

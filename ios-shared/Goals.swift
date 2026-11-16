// Goals in Sleek Tasks: something to reach by a day, made of days marked off, things ticked, or a number counted up.
// Sleek Tasks (its Goals tab), its widgets and Siri all compile this file, so they follow the same rules.
//
// A goal is kept in Tasks.sleek beside the boards and tasks, under "goals", one record each:
//   { id, kind: "days" | "things" | "count", title, color, start: "YYYY-MM-DD", due: "YYYY-MM-DD", target,
//     marks: ["YYYY-MM-DD", …]                         the days marked off (days)
//     items: [{ id, t: name, done: "YYYY-MM-DD" | "" }]  the things to tick (things)
//     log: [{ id, d: "YYYY-MM-DD", a: amount, n: note }] what was added (count), unit: ["book", "books"] or ["$", "$"]
//     created, updated, doneAt }
// A goal travels between the Sleek apps whole, the newer one (its updated time) winning, as a task does.
import Foundation

enum GDay {
  static func key(_ d: Date) -> String { let c = Calendar.current.dateComponents([.year, .month, .day], from: d); return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0) }
  static func date(_ key: String) -> Date? { let p = key.split(separator: "-").compactMap { Int($0) }; guard p.count == 3 else { return nil }; return Calendar.current.date(from: DateComponents(year: p[0], month: p[1], day: p[2])) }
  static func add(_ key: String, _ n: Int) -> String { guard let d = date(key) else { return key }; return GDay.key(Calendar.current.date(byAdding: .day, value: n, to: d)!) }
  static var today: String { key(Date()) }
  /// Days from a to b (b later is positive).
  static func between(_ a: String, _ b: String) -> Int { guard let x = date(a), let y = date(b) else { return 0 }; return Calendar.current.dateComponents([.day], from: x, to: y).day ?? 0 }
  /// "Dec 31".
  static func short(_ key: String) -> String { date(key)?.formatted(.dateTime.month(.abbreviated).day()) ?? "" }
  static var stamp: Int { Int(Date().timeIntervalSince1970 * 1000) }
  static func uid() -> String { String(String(stamp, radix: 36).suffix(5)) + String((0..<5).map { _ in "0123456789abcdefghijklmnopqrstuvwxyz".randomElement()! }) }
}

struct Goal: Identifiable, Hashable {
  typealias R = [String: Any]
  enum Kind: String, CaseIterable { case days, things, count }
  struct Thing: Identifiable, Hashable { let id: String; var name: String; var done: String }
  struct Entry: Identifiable, Hashable { let id: String; let day: String; var note: String; let amount: Double }
  static let colors = ["#12A36A", "#7C5CFF", "#0A84FF", "#FF7A45", "#E5487F", "#C9A100"]
  static func color(for k: Kind) -> String { k == .things ? "#7C5CFF" : k == .count ? "#0A84FF" : "#12A36A" }

  let id: String, kind: Kind, title: String, color: String, start: String, due: String, target: Int
  let marks: Set<String>, things: [Thing], log: [Entry], unit: [String]
  let created: Double, doneAt: Double

  init?(_ r: R) {
    guard let id = r["id"] as? String, let k = Kind(rawValue: r["kind"] as? String ?? "") else { return nil }
    func n(_ v: Any?) -> Double { (v as? NSNumber)?.doubleValue ?? 0 }
    self.id = id; kind = k; title = (r["title"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? "Goal"; color = r["color"] as? String ?? Goal.color(for: k)
    let st = r["start"] as? String ?? GDay.today; start = st; due = max(st, r["due"] as? String ?? st); target = max(1, Int(n(r["target"])))
    marks = Set((r["marks"] as? [String] ?? []).filter { GDay.date($0) != nil })
    things = (r["items"] as? [R] ?? []).map { Thing(id: $0["id"] as? String ?? GDay.uid(), name: $0["t"] as? String ?? "", done: $0["done"] as? String ?? "") }
    log = (r["log"] as? [R] ?? []).map { Entry(id: $0["id"] as? String ?? GDay.uid(), day: $0["d"] as? String ?? "", note: $0["n"] as? String ?? "", amount: n($0["a"])) }
    let u = (r["unit"] as? [String] ?? []).filter { !$0.isEmpty }; unit = u.count == 2 ? u : ["time", "times"]
    created = n(r["created"]); doneAt = n(r["doneAt"])
  }

  // ---------- how far along ----------
  var done: Double { kind == .days ? Double(marks.count) : kind == .things ? Double(things.filter { !$0.done.isEmpty }.count) : log.reduce(0) { $0 + $1.amount } }
  var goal: Double { kind == .things ? Double(things.count) : Double(target) }
  var frac: Double { goal > 0 ? min(1, max(0, done / goal)) : 0 }
  var percent: Int { Int((frac * 100).rounded(.down)) }
  var reached: Bool { goal > 0 && done >= goal }
  var money: Bool { kind == .count && unit[0] == "$" }
  var left: Int { max(0, GDay.between(GDay.today, due)) }
  var over: Bool { GDay.today > due }
  var markedToday: Bool { marks.contains(GDay.today) }
  var nextThing: Thing? { things.first { $0.done.isEmpty } }
  var openThings: [Thing] { things.filter { $0.done.isEmpty } }
  /// Days marked in a row, up to today (or yesterday, while today is not marked yet).
  var streak: Int { var s = 0, d = markedToday ? GDay.today : GDay.add(GDay.today, -1); while marks.contains(d) { s += 1; d = GDay.add(d, -1) }; return s }

  // ---------- saying it ----------
  func word(_ n: Double) -> String { let w = kind == .days ? ["day", "days"] : kind == .things ? ["thing", "things"] : unit; return n == 1 ? w[0] : w[1] }
  func num(_ n: Double) -> String {
    let whole = (n * 10).rounded() / 10
    let s = whole == whole.rounded() ? Int(whole).formatted() : whole.formatted(.number.precision(.fractionLength(1)))
    return money ? "$" + s : s
  }
  /// "4 books", "$500", "3 days".
  func amount(_ n: Double) -> String { money ? num(n) : "\(num(n)) \(word(n))" }
  /// "12 of 30 days · 46 days left".
  var sub: String { "\(num(done)) of \(amount(goal)) · " + (reached ? "reached" : over ? "past its day" : left == 0 ? "due today" : "\(left) \(left == 1 ? "day" : "days") left") }
  var kindName: String { kind == .days ? "Days" : kind == .things ? "Things" : "Number" }

  struct Pace: Hashable { let text: String, hint: String, behind: Bool }
  /// Ahead, on pace or behind, against a straight line from the start to the goal by its day.
  var pace: Pace {
    let d = done, t = goal
    if reached { return Pace(text: "Reached", hint: "", behind: false) }
    let total = Double(GDay.between(start, due) + 1), gone = min(total, max(0, Double(GDay.between(start, GDay.today) + 1)))
    let diff = d - t * gone / max(1, total), toGo = "\(amount(t - d)) to go"
    if diff >= 1 { return Pace(text: "\(num(diff.rounded())) ahead of pace", hint: toGo, behind: false) }
    if diff > -1 { return Pace(text: "On pace", hint: toGo, behind: false) }
    let rest = t - d, r = rest / (Double(max(1, left)) / 7), hint: String
    if over { hint = "Its day has gone: change the date to keep going" }
    else if kind == .days && rest > Double(left + 1) { hint = "Not enough days left for this target" }
    else if r >= 1 { hint = "\(amount(r.rounded(.up))) a week gets you there" }
    else { hint = "1 \(word(1)) every \(Int((1 / r).rounded())) weeks gets you there" }
    return Pace(text: "\(num((-diff).rounded())) behind", hint: hint, behind: true)
  }
  /// The ups of a number goal, day by day: (day, total after it), in order.
  var climb: [(day: String, total: Double)] { var c = 0.0; return log.sorted { $0.day < $1.day }.map { c += $0.amount; return ($0.day, c) } }
  /// What one tap adds on a widget: "1 book", "$100".
  var step: Double { money ? max(1, (goal / 20).rounded()) >= 100 ? 100 : max(1, (goal / 20).rounded()) : 1 }

  static func == (a: Goal, b: Goal) -> Bool { a.id == b.id && a.kind == b.kind && a.title == b.title && a.color == b.color && a.start == b.start && a.due == b.due && a.target == b.target && a.marks == b.marks && a.things == b.things && a.log == b.log && a.unit == b.unit && a.doneAt == b.doneAt }
  func hash(into h: inout Hasher) { h.combine(id) }
}

/// Changes to a goal's record. Each one stamps it as changed now and notes when it was reached.
enum GoalEdit {
  typealias R = [String: Any]
  static func stamp(_ r: inout R) {
    r["updated"] = GDay.stamp
    let g = Goal(r), was = (r["doneAt"] as? NSNumber)?.doubleValue ?? 0
    if g?.reached == true { if was == 0 { r["doneAt"] = GDay.stamp } } else { r["doneAt"] = 0 }
  }
  /// A new goal, from what New goal worked out.
  static func make(_ d: GoalParse.Draft, color: String? = nil) -> R {
    let id = GDay.uid(), t = GDay.stamp
    var r: R = ["id": id, "kind": d.kind.rawValue, "title": String(d.title.prefix(120)), "color": color ?? Goal.color(for: d.kind), "start": GDay.today, "due": d.due, "target": max(1, d.target),
                "marks": [String](), "items": [R](), "log": [R](), "unit": d.unit, "created": t, "updated": t, "doneAt": 0]
    if d.kind == .things { r["items"] = (0..<min(200, max(1, d.target))).map { _ in ["id": GDay.uid(), "t": "", "done": ""] as R } }
    return r
  }
  /// Mark a day, or unmark it (not a day still to come).
  static func mark(_ r: inout R, _ day: String = GDay.today) {
    guard day <= GDay.today else { return }
    var m = r["marks"] as? [String] ?? []
    if let i = m.firstIndex(of: day) { m.remove(at: i) } else { m.append(day); m.sort() }
    r["marks"] = m; stamp(&r)
  }
  /// Tick a thing (the next one with no id), or untick it.
  static func tick(_ r: inout R, _ thing: String = "", on: Bool? = nil) {
    var items = r["items"] as? [R] ?? []
    guard let i = thing.isEmpty ? items.firstIndex(where: { ($0["done"] as? String ?? "").isEmpty }) : items.firstIndex(where: { ($0["id"] as? String) == thing }) else { return }
    let isOn = !(items[i]["done"] as? String ?? "").isEmpty, want = on ?? !isOn
    if want == isOn { return }
    items[i]["done"] = want ? GDay.today : ""; r["items"] = items; stamp(&r)
  }
  static func addThing(_ r: inout R, _ name: String = "") -> String { let id = GDay.uid(); r["items"] = (r["items"] as? [R] ?? []) + [["id": id, "t": String(name.prefix(200)), "done": ""] as R]; stamp(&r); return id }
  static func nameThing(_ r: inout R, _ thing: String, _ name: String) {
    var items = r["items"] as? [R] ?? []; guard let i = items.firstIndex(where: { ($0["id"] as? String) == thing }), (items[i]["t"] as? String) != name else { return }
    items[i]["t"] = String(name.prefix(200)); r["items"] = items; stamp(&r)
  }
  static func removeThing(_ r: inout R, _ thing: String) { r["items"] = (r["items"] as? [R] ?? []).filter { ($0["id"] as? String) != thing }; stamp(&r) }
  /// Add to a number goal (today), with a note if given.
  static func add(_ r: inout R, _ amount: Double, note: String = "") {
    guard amount != 0 else { return }
    r["log"] = (r["log"] as? [R] ?? []) + [["id": GDay.uid(), "d": GDay.today, "a": amount, "n": String(note.prefix(200))] as R]; stamp(&r)
  }
  /// Take back the last thing added today. False when nothing was added today.
  @discardableResult static func undoToday(_ r: inout R) -> Bool {
    var log = r["log"] as? [R] ?? []; guard let i = log.lastIndex(where: { ($0["d"] as? String) == GDay.today }) else { return false }
    log.remove(at: i); r["log"] = log; stamp(&r); return true
  }
  static func note(_ r: inout R, _ entry: String, _ text: String) {
    var log = r["log"] as? [R] ?? []; guard let i = log.firstIndex(where: { ($0["id"] as? String) == entry }), (log[i]["n"] as? String) != text else { return }
    log[i]["n"] = String(text.prefix(200)); r["log"] = log; stamp(&r)
  }
  static func set(_ r: inout R, title: String? = nil, due: String? = nil, target: Int? = nil, color: String? = nil) {
    if let t = title?.trimmingCharacters(in: .whitespacesAndNewlines), !t.isEmpty { r["title"] = String(t.prefix(120)) }
    if let d = due, GDay.date(d) != nil { r["due"] = max(d, r["start"] as? String ?? d) }
    if let t = target { r["target"] = max(1, min(100_000_000, t)) }
    if let c = color { r["color"] = c }
    stamp(&r)
  }
}

/// New goal: a sentence, the way you'd tell a friend ("Read 12 books this year", "Save $2,000 by March"), worked out into
/// what to track, how many, and by when.
enum GoalParse {
  struct Draft: Hashable { var title: String, kind: Goal.Kind, target: Int, due: String, unit: [String] }
  static let words = ["one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10, "twelve": 12, "fifteen": 15, "twenty": 20, "thirty": 30, "forty": 40, "fifty": 50, "hundred": 100]
  static let dayWords = "^(days?|times?|runs?|workouts?|sessions?|mornings?|nights?|walks?|swims?|rides?|classes|lessons?|meditations?|gym)$"
  static let thingWords = "^(things?|items?|goals?|tasks?|places?|experiences?|adventures?|projects?|countries|cities|restaurants?|hikes?)$"
  static let months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]

  /// The groups of the first match ("" for one that took no part), or nil.
  static func match(_ pattern: String, _ s: String) -> [String]? {
    guard let rx = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]), let m = rx.firstMatch(in: s, range: NSRange(s.startIndex..., in: s)) else { return nil }
    return (0..<m.numberOfRanges).map { i in Range(m.range(at: i), in: s).map { String(s[$0]) } ?? "" }
  }
  static func strip(_ pattern: String, _ s: String) -> String { (try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]))?.stringByReplacingMatches(in: s, range: NSRange(s.startIndex..., in: s), withTemplate: "") ?? s }

  static func parse(_ text: String, today: Date = Date()) -> Draft {
    let cal = Calendar.current, t0 = cal.startOfDay(for: today), y = cal.component(.year, from: t0)
    var t = text.lowercased()
    for (w, n) in words { t = (try? NSRegularExpression(pattern: "\\b\(w)\\b"))?.stringByReplacingMatches(in: t, range: NSRange(t.startIndex..., in: t), withTemplate: String(n)) ?? t }
    func off(_ d: Date) -> Int { cal.dateComponents([.day], from: t0, to: cal.startOfDay(for: d)).day ?? 0 }
    func on(_ yy: Int, _ mm: Int, _ dd: Int) -> Date { cal.date(from: DateComponents(year: yy, month: mm, day: dd))! }
    func endOf(_ yy: Int, _ mm: Int) -> Date { cal.date(byAdding: DateComponents(month: 1, day: -1), to: on(yy, mm, 1))! }
    let unitDays = ["day": 1, "week": 7, "month": 30]
    let tests: [(String, ([String]) -> Int)] = [
      ("\\b(by|before) (the )?new year('?s)?\\b|\\bthis year\\b|\\b(by|before) the end of the year\\b", { _ in off(on(y, 12, 31)) }),
      ("\\bthis month\\b|\\b(by )?the end of the month\\b", { _ in off(endOf(y, cal.component(.month, from: t0))) }),
      ("\\b(by |before )?(this )?summer\\b", { _ in let s = on(y, 6, 21); return off(s > t0 ? s : on(y + 1, 6, 21)) }),
      ("\\bin (\\d+) (day|week|month)s?\\b", { m in (Int(m[1]) ?? 0) * (unitDays[m[2]] ?? 1) }),
      ("\\bfor (\\d+) (day|week|month)s?\\b", { m in (Int(m[1]) ?? 0) * (unitDays[m[2]] ?? 1) - 1 }),
      ("\\b(by|before|until) (jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\.?( (\\d{1,2}))?\\b", { m in
        let mi = (months.firstIndex(of: m[2]) ?? 0) + 1, day = Int(m[4])
        func at(_ yy: Int) -> Date { day.map { on(yy, mi, min($0, cal.range(of: .day, in: .month, for: on(yy, mi, 1))!.count)) } ?? endOf(yy, mi) }
        return off(at(y) >= t0 ? at(y) : at(y + 1)) }),
    ]
    var due = 29, dueRx: String? = nil
    for (rx, f) in tests { if let m = match(rx, t) { due = max(1, f(m)); dueRx = rx; break } }
    var kind = Goal.Kind.days, tgt = due + 1, unit: [String]? = nil
    let every = match("\\bevery ?day\\b|\\bdaily\\b", t) != nil
    if let m = match("\\$\\s?([\\d,]+)", t) { kind = .count; tgt = Int(m[1].replacingOccurrences(of: ",", with: "")) ?? 100; unit = ["$", "$"] }
    else if let m = match("\\b(\\d+)\\s*(?:[a-z]+\\s)?(?:a|per|each|every)\\s+week\\b", t) { kind = .days; tgt = max(1, Int((Double(Int(m[1]) ?? 1) * Double(due + 1) / 7).rounded())) }
    else {
      if let m = match("\\b(\\d[\\d,]*)\\s+(?:new |more |good |different )?([a-z]+)", strip("\\b(in|for) \\d+ (day|week|month)s?\\b", t)) {
        let n = Int(m[1].replacingOccurrences(of: ",", with: "")) ?? 1, noun = m[2]
        if match(dayWords, noun) != nil { kind = .days; tgt = min(n, due + 1) }
        else if match(thingWords, noun) != nil { kind = .things; tgt = n }
        else { kind = .count; tgt = n; unit = [noun.hasSuffix("s") ? String(noun.dropLast()) : noun, noun.hasSuffix("s") ? noun : noun + "s"] }
      } else if match("\\b(things|list)\\b", t) != nil { kind = .things; tgt = 10 }
      if every { kind = .days; tgt = due + 1 }
    }
    var title = text.trimmingCharacters(in: .whitespacesAndNewlines)
    if let rx = dueRx { title = strip(rx, title).replacingOccurrences(of: "\\s{2,}", with: " ", options: .regularExpression).trimmingCharacters(in: .whitespaces) }
    title = title.replacingOccurrences(of: "[,.;:!\\s]+$", with: "", options: .regularExpression)
    title = title.prefix(1).uppercased() + title.dropFirst()
    return Draft(title: title, kind: kind, target: max(1, min(kind == .things ? 200 : 100_000_000, tgt)), due: GDay.key(cal.date(byAdding: .day, value: due, to: t0)!), unit: unit ?? ["time", "times"])
  }
}

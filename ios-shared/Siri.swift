// What Siri (and Shortcuts, Spotlight and the Action button) can ask Sleek: what is on your grocery list, to add
// something to it, and what is due today. Sleek Tasks and the Sleek browser both compile this file, so either one
// answers, whichever is on the iPhone ("…in Sleek Tasks", "…in Sleek": Siri needs the app's name in what you say).
//
// The answers come from your tasks as every Sleek app on this iPhone has them: each app's copy in the folder they share
// (Shared.swift), taken together by the same rule the apps use (the newer board or task wins; what was deleted stays
// deleted). What Siri adds is written to a place of Siri's own in that folder, which the apps bring in like any other
// app's copy, so Siri never writes over an app's own file. It keeps only what it changed in the last 30 days: by then
// every app has long brought it in.
import AppIntents
import SwiftUI

enum SiriTasks {
  typealias R = [String: Any]
  static let format = "sleek-tasks"
  static let place = "siri"
  static let listColumns: [R] = [["id": "need", "name": "To get", "color": "#8E8E93", "done": false], ["id": "got", "name": "In the basket", "color": "#12A36A", "done": true]]
  static func num(_ v: Any?) -> Double { (v as? NSNumber)?.doubleValue ?? 0 }
  static func at(_ r: R) -> Double { let u = num(r["updated"]); return u != 0 ? u : num(r["created"]) }
  static var now: Int { Int(Date().timeIntervalSince1970 * 1000) }
  static func day(_ n: Int = 0) -> String {
    let d = Calendar.current.date(byAdding: .day, value: n, to: Calendar.current.startOfDay(for: Date()))!, c = Calendar.current.dateComponents([.year, .month, .day], from: d)
    return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
  }
  static func uid() -> String { String(String(now, radix: 36).suffix(5)) + String((0..<5).map { _ in "0123456789abcdefghijklmnopqrstuvwxyz".randomElement()! }) }
  static func ok(_ v: Any?) -> String? { guard let id = v as? String, id.range(of: "^[a-z0-9]{4,24}$", options: .regularExpression) != nil else { return nil }; return id }

  /// Your tasks, taken together from every copy.
  struct Copy {
    var projects: [String: R] = [:], tasks: [String: R] = [:], usuals: [String: R] = [:], goals: [String: R] = [:], gone: [String: Double] = [:]
    mutating func take(_ o: R) {
      guard (o["format"] as? String) == SiriTasks.format, num(o["version"]) <= 1 else { return }
      for (k, v) in o["gone"] as? R ?? [:] { if let id = ok(k) { gone[id] = max(gone[id] ?? 0, num(v)) } }
      for g in o["goals"] as? [R] ?? [] { guard let id = ok(g["id"]), Goal(g) != nil else { continue }; if goals[id].map({ at($0) < at(g) }) ?? true { goals[id] = g } }
      for p in o["projects"] as? [R] ?? [] { guard let id = ok(p["id"]), !(p["statuses"] as? [R] ?? []).isEmpty else { continue }; if projects[id].map({ at($0) < at(p) }) ?? true { projects[id] = p } }
      for t in o["tasks"] as? [R] ?? [] { guard let id = ok(t["id"]) else { continue }; if tasks[id].map({ at($0) < at(t) }) ?? true { tasks[id] = t } }
      for u in o["usuals"] as? [R] ?? [] {
        guard let n = u["n"] as? String, !n.isEmpty else { continue }; let k = Grocer.norm(n)
        guard var have = usuals[k] else { usuals[k] = u; continue }
        if num(u["c"]) > num(have["c"]) { have["c"] = Int(num(u["c"])) }
        if num(u["at"]) > num(have["at"]) { have["at"] = Int(num(u["at"])); have["a"] = u["a"] ?? ""; have["off"] = u["off"] ?? false; have["n"] = n }
        usuals[k] = have
      }
    }
    /// What was deleted goes, and so do tasks whose board went.
    mutating func settle() {
      projects = projects.filter { (gone[$0.key] ?? 0) < at($0.value) }
      tasks = tasks.filter { (gone[$0.key] ?? 0) < at($0.value) && projects[$0.value["project"] as? String ?? ""] != nil }
      goals = goals.filter { (gone[$0.key] ?? 0) < at($0.value) }
    }
    /// Your goals: the ones still going first (newest first), then the ones reached (most recently first).
    var goalList: [Goal] {
      let all = goals.values.compactMap(Goal.init)
      return all.filter { !$0.reached }.sorted { $0.created > $1.created } + all.filter(\.reached).sorted { $0.doneAt > $1.doneAt }
    }
    func columns(_ board: String) -> [R] { projects[board]?["statuses"] as? [R] ?? [] }
    func done(_ t: R) -> Bool { columns(t["project"] as? String ?? "").first { ($0["id"] as? String) == (t["status"] as? String) }?["done"] as? Bool ?? false }
    func isList(_ p: R) -> Bool { (p["kind"] as? String) == "grocery" }
    /// The list Siri means: one for today (or a day gone by) not yet shopped, else the next one, else one with no day.
    func list() -> R? {
      let open = projects.values.filter { isList($0) && !($0["done"] as? Bool ?? false) }, t = SiriTasks.day()
      func due(_ p: R) -> String { p["due"] as? String ?? "" }
      if let l = open.filter({ !due($0).isEmpty && due($0) <= t }).sorted(by: { (due($0), num($0["created"])) < (due($1), num($1["created"])) }).first { return l }
      if let l = open.filter({ due($0) > t }).sorted(by: { (due($0), num($0["created"])) < (due($1), num($1["created"])) }).first { return l }
      return open.filter { due($0).isEmpty }.max { num($0["created"]) < num($1["created"]) }
    }
    func things(_ list: String) -> [R] { tasks.values.filter { ($0["project"] as? String) == list }.sorted { num($0["order"]) < num($1["order"]) } }
    /// Not done, on a board (not a list), due on that day.
    func due(_ key: String, late: Bool = false) -> [R] {
      tasks.values.filter { t in let d = t["due"] as? String ?? ""; let p = projects[t["project"] as? String ?? ""]; return !d.isEmpty && (late ? d < key : d == key) && !done(t) && !(p.map(isList) ?? true) }
        .sorted { ($0["due"] as? String ?? "", num($0["order"])) < ($1["due"] as? String ?? "", num($1["order"])) }
    }
  }

  static func file(_ app: String, _ root: URL?) -> URL? { root?.appendingPathComponent(app, isDirectory: true).appendingPathComponent("Tasks.sleek") }
  static func json(_ f: URL?) -> R? { f.flatMap { try? Data(contentsOf: $0) }.flatMap { (try? JSONSerialization.jsonObject(with: $0)) as? R } }
  /// Every app's copy (and Siri's own), taken together.
  static func read(_ root: URL? = Shared.root) -> Copy {
    var c = Copy(); for app in Shared.apps + [place] { if let o = json(file(app, root)) { c.take(o) } }
    c.settle(); return c
  }

  struct Added { let name: String, qty: Int, list: String, again: Bool }
  /// Put something on the list Siri means (a new "Groceries" list when there is none), as Sleek Tasks' Add does: already
  /// there, one more of it (or the number said), back from the basket if it was in it.
  @discardableResult static func add(_ typed: String, root: URL? = Shared.root) -> Added? {
    let c = read(root), p = Grocer.parse(typed); guard !p.name.isEmpty, let root = root else { return nil }
    let t0 = now
    let list = c.list() ?? ["id": uid(), "name": "Groceries", "color": "#12A36A", "statuses": listColumns, "kind": "grocery", "due": "", "done": false, "doneAt": 0,
                            "board": ["show": ["tags": true, "subs": true, "due": true, "who": true], "dense": false, "group": "status", "shut": R()] as R, "created": t0, "updated": t0]
    let lid = list["id"] as? String ?? "", cols = list["statuses"] as? [R] ?? listColumns
    let open = (cols.first { !($0["done"] as? Bool ?? false) } ?? cols[0])["id"] as? String ?? "need"
    let things = c.things(lid), key = Grocer.norm(p.name)
    var task: R, again = false
    if var have = things.first(where: { Grocer.norm($0["title"] as? String ?? "") == key }) {
      again = true; have["qty"] = p.counted ? p.qty : max(1, Int(num(have["qty"]))) + 1
      if c.done(have) { have["status"] = open; have["was"] = ""; have["doneAt"] = 0 }
      have["updated"] = t0; task = have
    } else {
      let u = c.usuals[key], a = (u?["a"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? Aisle.guess(p.name)
      task = ["id": uid(), "project": lid, "title": p.name, "status": open, "due": "", "who": "", "tags": [String](), "subs": [R](), "notes": NSNull(), "order": (things.map { num($0["order"]) }.max() ?? 0) + 1, "was": "",
              "created": t0, "updated": t0, "doneAt": 0, "rep": "", "cover": NSNull(), "vals": R(), "qty": p.qty, "aisle": a]
    }
    var usual = c.usuals[key] ?? ["n": p.name, "c": 0, "a": "", "off": false]
    usual["c"] = Int(num(usual["c"])) + 1; usual["at"] = t0; usual["off"] = false; usual["n"] = p.name
    keep(project: list, task: task, usual: usual, root: root)
    return Added(name: p.name, qty: Int(num(task["qty"])), list: list["name"] as? String ?? "Groceries", again: again)
  }
  /// Write what Siri (or a widget) changed into its own place, beside what it changed in the last 30 days, and tell the apps.
  static func keep(project: R? = nil, task: R? = nil, usual: R? = nil, goal: R? = nil, root: URL) {
    let f = file(place, root)!, old = json(f) ?? [:], t0 = Double(now), cut = t0 - 30 * 864e5
    var wrote = (old["wrote"] as? R ?? [:]).mapValues { num($0) }.filter { $0.value >= cut }
    func merged(_ have: [R], _ new: R?, _ key: (R) -> String) -> [R] {
      let k = new.map(key); if let k = k { wrote[k] = t0 }
      return have.filter { key($0) != k && wrote[key($0)] != nil } + (new.map { [$0] } ?? [])
    }
    let id = { (r: R) in r["id"] as? String ?? "" }
    let ps = merged(old["projects"] as? [R] ?? [], project, id), ts = merged(old["tasks"] as? [R] ?? [], task, id), gs = merged(old["goals"] as? [R] ?? [], goal) { "g:" + id($0) }
    let us = merged(old["usuals"] as? [R] ?? [], usual) { "u:" + Grocer.norm($0["n"] as? String ?? "") }
    let o: R = ["format": format, "version": 1, "exported": ISO8601DateFormatter().string(from: Date()), "projects": ps, "tasks": ts, "usuals": us, "goals": gs, "people": [R](), "gone": R(), "wrote": wrote.mapValues { Int($0) }]
    try? FileManager.default.createDirectory(at: f.deletingLastPathComponent(), withIntermediateDirectories: true)
    if let d = try? JSONSerialization.data(withJSONObject: o, options: [.sortedKeys]), (try? d.write(to: f, options: .atomic)) != nil { Shared.tell() }
  }
  /// Change a goal from outside the app (a widget, Siri, the Sleek browser's start page): the newest copy of it, changed,
  /// written to Siri's place. Gives the goal as it is now, or nil when there is no such goal.
  @discardableResult static func goal(_ id: String, root: URL? = Shared.root, _ change: (inout R) -> Void) -> Goal? {
    guard let root = root, var g = read(root).goals[id] else { return nil }
    change(&g); keep(goal: g, root: root); return Goal(g)
  }

  // ---------- saying it ----------
  /// "Avocados", 3 → "3 avocados".
  static func said(_ t: R) -> String {
    let title = t["title"] as? String ?? "", q = max(1, Int(num(t["qty"])))
    let soft = title.count > 1 && title.dropFirst().first.map { $0.isLowercase } == true ? title.prefix(1).lowercased() + title.dropFirst() : title
    return q > 1 ? "\(q) \(soft)" : soft
  }
  /// "a", "a and b", "a, b and c".
  static func joined(_ s: [String]) -> String { s.count < 2 ? (s.first ?? "") : s.dropLast().joined(separator: ", ") + " and " + s.last! }
  static func when(_ due: String) -> String {
    if due.isEmpty { return "" }; if due == day() { return " for today" }; if due == day(1) { return " for tomorrow" }; if due < day() { return "" }
    let p = due.split(separator: "-").compactMap { Int($0) }; guard p.count == 3, let d = Calendar.current.date(from: DateComponents(year: p[0], month: p[1], day: p[2])) else { return "" }
    return " for " + d.formatted(.dateTime.weekday(.wide))
  }

  /// What is on the list, by aisle, for Siri to say and show.
  static func groceries(_ c: Copy) -> (said: String, card: Card) {
    guard let l = c.list(), let lid = l["id"] as? String else { return ("You have no grocery list in Sleek right now.", Card(title: "No grocery list", sub: "Add one in Sleek Tasks", groups: [])) }
    let name = l["name"] as? String ?? "Groceries", all = c.things(lid), left = all.filter { !c.done($0) }, got = all.count - left.count
    let walk = Aisle.walk.map(\.id), by = Dictionary(grouping: left) { Aisle.of(id: $0["aisle"] as? String ?? "").id }
    let groups = walk.compactMap { a -> Card.Group? in guard let xs = by[a] else { return nil }; let ai = Aisle.of(id: a); return Card.Group(name: ai.name, color: ai.color, rows: xs.map { x in (x["title"] as? String ?? "") + (Int(num(x["qty"])) > 1 ? "  ×\(Int(num(x["qty"])))" : "") }) }
    let inOrder = walk.flatMap { by[$0] ?? [] }.map(said), when = when(l["due"] as? String ?? "")
    let said = left.isEmpty ? (all.isEmpty ? "Your \(name) list\(when) is empty." : "Everything on your \(name) list\(when) is in the basket.")
      : "Your \(name) list\(when) has \(left.count == 1 ? "one thing" : "\(left.count) things"): \(joined(inOrder))." + (got > 0 ? " \(got) \(got == 1 ? "is" : "are") in the basket already." : "")
    return (said, Card(title: name, sub: left.isEmpty ? "All in the basket" : "\(left.count) to get" + (got > 0 ? " · \(got) in the basket" : "") + (when.isEmpty ? "" : " ·" + when.replacingOccurrences(of: " for", with: "")), groups: groups))
  }
  /// What is due today, and what is late.
  static func dueToday(_ c: Copy) -> (said: String, card: Card) {
    let t = day(), today = c.due(t), late = c.due(t, late: true), lists = c.projects.values.filter { c.isList($0) && !($0["done"] as? Bool ?? false) && ($0["due"] as? String ?? "") == t }
    func names(_ xs: [R]) -> [String] { xs.map { $0["title"] as? String ?? "" } }
    func color(_ x: R) -> String { c.projects[x["project"] as? String ?? ""]?["color"] as? String ?? "#12A36A" }
    var said = today.isEmpty ? "Nothing is due today." : "\(today.count == 1 ? "One thing is" : "\(today.count) things are") due today: \(joined(names(today)))."
    if !late.isEmpty { said += " \(late.count == 1 ? "One more is" : "\(late.count) more are") late: \(joined(names(late)))." }
    if let l = lists.first { said += " And your \(l["name"] as? String ?? "grocery") list is for today." }
    var groups: [Card.Group] = []
    if !late.isEmpty { groups.append(Card.Group(name: "Late", color: "#E5484D", rows: names(late))) }
    if !today.isEmpty { groups.append(Card.Group(name: "Due today", color: color(today[0]), rows: names(today))) }
    if !lists.isEmpty { groups.append(Card.Group(name: "Shopping", color: "#12A36A", rows: lists.map { $0["name"] as? String ?? "Groceries" })) }
    return (said, Card(title: "Today", sub: today.isEmpty && late.isEmpty ? "Nothing due" : "\(today.count) due" + (late.isEmpty ? "" : " · \(late.count) late"), groups: groups))
  }
}

/// What Siri shows under its answer.
struct Card: View {
  struct Group: Identifiable { var id: String { name }; let name: String, color: String, rows: [String] }
  let title: String, sub: String, groups: [Group]
  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      VStack(alignment: .leading, spacing: 2) { Text(title).font(.system(size: 22, weight: .bold)); Text(sub).font(.system(size: 14)).foregroundStyle(.secondary) }
      ForEach(groups.prefix(6)) { g in
        VStack(alignment: .leading, spacing: 4) {
          HStack(spacing: 6) { Circle().fill(Card.color(g.color)).frame(width: 8, height: 8); Text(g.name.uppercased()).font(.system(size: 11, weight: .semibold)).tracking(1.1).foregroundStyle(.secondary) }
          ForEach(Array(g.rows.prefix(8).enumerated()), id: \.offset) { _, r in Text(r).font(.system(size: 16)).lineLimit(1) }
          if g.rows.count > 8 { Text("and \(g.rows.count - 8) more").font(.system(size: 13)).foregroundStyle(.secondary) }
        }
      }
    }.frame(maxWidth: .infinity, alignment: .leading).padding(16)
  }
  static func color(_ hex: String) -> Color {
    let v = UInt64(hex.trimmingCharacters(in: CharacterSet(charactersIn: "#")), radix: 16) ?? 0x12A36A
    return Color(red: Double((v >> 16) & 255) / 255, green: Double((v >> 8) & 255) / 255, blue: Double(v & 255) / 255)
  }
}

// ---------- the intents (in the apps; the widgets compile only what reads and ticks) ----------
#if !WIDGET
struct GroceryListIntent: AppIntent {
  static let title: LocalizedStringResource = "What's on my grocery list"
  static let description: IntentDescription? = IntentDescription("Says what is left to get on today's grocery list, or the next one, by aisle.")
  @MainActor func perform() async throws -> some IntentResult & ProvidesDialog & ShowsSnippetView {
    let r = SiriTasks.groceries(SiriTasks.read())
    return .result(dialog: "\(r.said)", view: r.card)
  }
}

struct AddToGroceryListIntent: AppIntent {
  static let title: LocalizedStringResource = "Add to my grocery list"
  static let description: IntentDescription? = IntentDescription("Puts something on today's grocery list, or the next one. Say a number for more than one, like \"2 lemons\".")
  @Parameter(title: "Item", requestValueDialog: "What should I add?") var item: String
  static var parameterSummary: some ParameterSummary { Summary("Add \(\.$item) to my grocery list") }
  @MainActor func perform() async throws -> some IntentResult & ProvidesDialog & ShowsSnippetView {
    guard let a = SiriTasks.add(item) else { return .result(dialog: "I couldn't add that.", view: Card(title: "Nothing added", sub: "", groups: [])) }
    let thing = SiriTasks.said(["title": a.name, "qty": a.qty])
    let said = a.again ? "\(a.name) was already on your \(a.list) list. Now it's \(a.qty)." : "Added \(thing) to your \(a.list) list."
    return .result(dialog: "\(said)", view: SiriTasks.groceries(SiriTasks.read()).card)
  }
}

struct DueTodayIntent: AppIntent {
  static let title: LocalizedStringResource = "What's due today"
  static let description: IntentDescription? = IntentDescription("Says what is due today in Sleek Tasks, and what is late.")
  @MainActor func perform() async throws -> some IntentResult & ProvidesDialog & ShowsSnippetView {
    let r = SiriTasks.dueToday(SiriTasks.read())
    return .result(dialog: "\(r.said)", view: r.card)
  }
}

/// What you can say. Siri needs the app's name in it: "Sleek Tasks", or "Sleek" for the browser.
struct SleekShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(intent: GroceryListIntent(), phrases: [
      "What's on my grocery list in \(.applicationName)", "What's on my \(.applicationName) grocery list", "Which groceries are on my list in \(.applicationName)",
      "Read my grocery list in \(.applicationName)", "What do I need from the shop in \(.applicationName)", "Show my \(.applicationName) shopping list",
    ], shortTitle: "Grocery list", systemImageName: "basket")
    AppShortcut(intent: AddToGroceryListIntent(), phrases: [
      "Add to my grocery list in \(.applicationName)", "Add to my \(.applicationName) grocery list", "Add something to my shopping list in \(.applicationName)",
    ], shortTitle: "Add to the list", systemImageName: "plus.circle")
    AppShortcut(intent: DueTodayIntent(), phrases: [
      "What's due today in \(.applicationName)", "What's on today in \(.applicationName)", "What do I have to do today in \(.applicationName)",
    ], shortTitle: "Due today", systemImageName: "sun.max")
  }
}
#endif

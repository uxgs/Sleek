// Sleek Tasks for iPhone: where your boards and tasks are kept, and the rules they follow.
//
// They are kept on this iPhone in one file (Application Support/Tasks.sleek), written a moment after
// each change. That file is the very file Sleek Tasks saves on the web ("Save a copy of them all"):
// { format: "sleek-tasks", version: 1, projects, tasks, people }, so a copy saved from either opens in
// the other (core/task-store.js is the web's side of this; the rules below are the same rules).
//
// Every board and task is held exactly as it is in the file, so anything this app does not show yet
// (rich notes, pictures, your own fields, people, tags) is kept untouched and goes back out with it.
// What the screens draw are the plain values below (Board, Column, Item, Step), made again after each change.
import Foundation
import SwiftUI

typealias Rec = [String: Any]

struct Column: Identifiable, Hashable { let id: String; var name: String; var color: String; var done: Bool }
struct Board: Identifiable, Hashable { let id: String; var name: String; var color: String; var columns: [Column]
  var firstOpen: String { (columns.first { !$0.done } ?? columns[0]).id }
  var firstDone: String { (columns.first { $0.done } ?? columns[columns.count - 1]).id } }
struct Step: Identifiable, Hashable { let id: String; var text: String; var done: Bool }
struct Item: Identifiable, Hashable {
  let id: String, board: String, title: String, column: String, due: String, rep: String, who: String
  let steps: [Step], tags: [String], order: Double, doneAt: Double, done: Bool
  let notes: String          // the notes as plain words
  let richNotes: Bool        // the notes hold more than plain paragraphs (made on the web): shown, and added to, but not rewritten here
}

enum Day {
  static func key(_ d: Date) -> String { let c = Calendar.current.dateComponents([.year, .month, .day], from: d); return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0) }
  static func date(_ key: String) -> Date? { let p = key.split(separator: "-").compactMap { Int($0) }; guard p.count == 3 else { return nil }; return Calendar.current.date(from: DateComponents(year: p[0], month: p[1], day: p[2])) }
  static func from(today n: Int) -> String { key(Calendar.current.date(byAdding: .day, value: n, to: Calendar.current.startOfDay(for: Date()))!) }
  static var today: String { from(today: 0) }
  /// "Today", "Tomorrow", "3 days late", "Sat 14".
  static func word(_ key: String) -> String {
    guard let d = date(key) else { return "" }; let n = Calendar.current.dateComponents([.day], from: Calendar.current.startOfDay(for: Date()), to: d).day ?? 0
    return n == 0 ? "Today" : n == 1 ? "Tomorrow" : n == -1 ? "Yesterday" : n < 0 ? "\(-n) days late" : n < 7 ? d.formatted(.dateTime.weekday(.wide)) : d.formatted(.dateTime.weekday(.abbreviated).day().month(.abbreviated))
  }
}

/// How a task repeats: "" or one of these. Ticking a repeating task does not finish it: it moves on to the next time.
enum Repeats {
  static let all = ["daily", "weekdays", "weekly", "monthly", "yearly"]
  static func name(_ r: String) -> String { ["daily": "Every day", "weekdays": "Every weekday", "weekly": "Every week", "monthly": "Every month", "yearly": "Every year"][r] ?? "Does not repeat" }
  /// The days a repeating task falls on after `due`, one at a time: nth 1 is the next, 2 the one after.
  static func nth(_ due: String, _ rep: String, _ n: Int) -> Date {
    let cal = Calendar.current, b = Day.date(due) ?? cal.startOfDay(for: Date()), c = cal.dateComponents([.year, .month, .day], from: b), y = c.year!, m = c.month!, day = c.day!
    if rep == "daily" { return cal.date(byAdding: .day, value: n, to: b)! }
    if rep == "weekly" { return cal.date(byAdding: .day, value: 7 * n, to: b)! }
    if rep == "weekdays" { var d = b, left = n; while left > 0 { d = cal.date(byAdding: .day, value: 1, to: d)!; let w = cal.component(.weekday, from: d); if w != 1 && w != 7 { left -= 1 } }; return d }
    // a month or a year on, on the same day of the month, or the month's last day when it is shorter
    let months = rep == "yearly" ? (y + n) * 12 + (m - 1) : y * 12 + (m - 1) + n, yy = months / 12, mm = months % 12 + 1
    let first = cal.date(from: DateComponents(year: yy, month: mm, day: 1))!, last = cal.range(of: .day, in: .month, for: first)!.count
    return cal.date(from: DateComponents(year: yy, month: mm, day: min(day, last)))!
  }
  /// The next day it is due: the first of those days that is after today.
  static func next(_ due: String, _ rep: String) -> String {
    let t0 = Calendar.current.startOfDay(for: Date()), from = due.isEmpty ? Day.key(t0) : due
    for n in 1..<4000 { let d = nth(from, rep, n); if d > t0 { return Day.key(d) } }
    return from
  }
}

@MainActor
final class Store: ObservableObject {
  static let format = "sleek-tasks"
  static let colors = ["#12A36A", "#0A84FF", "#7C5CFF", "#F0642D", "#E0457B", "#C2A21E", "#5B6470"]
  static let columns: [Rec] = [["id": "todo", "name": "To do", "color": "#8E8E93", "done": false], ["id": "doing", "name": "Doing", "color": "#F0A52D", "done": false], ["id": "done", "name": "Done", "color": "#12A36A", "done": true]]

  @Published private(set) var boards: [Board] = []
  @Published private(set) var items: [Item] = []
  private var projects: [Rec] = [], tasks: [Rec] = [], people: [Rec] = []
  let file: URL
  private var saving = false
  /// False when the file on this iPhone could not be read: then nothing is written over it.
  private(set) var readable = true

  init(file: URL) {
    self.file = file
    try? FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
    if let d = try? Data(contentsOf: file) {
      if let o = (try? JSONSerialization.jsonObject(with: d)) as? Rec, (o["format"] as? String) == Store.format { projects = o["projects"] as? [Rec] ?? []; tasks = o["tasks"] as? [Rec] ?? []; people = o["people"] as? [Rec] ?? [] }
      else { readable = false }
    }
    redraw()
  }
  static func uid() -> String { let ms = String(Int(Date().timeIntervalSince1970 * 1000), radix: 36); return String(ms.suffix(5)) + String((0..<5).map { _ in "0123456789abcdefghijklmnopqrstuvwxyz".randomElement()! }) }
  private func now() -> Int { Int(Date().timeIntervalSince1970 * 1000) }
  private func num(_ v: Any?) -> Double { (v as? NSNumber)?.doubleValue ?? 0 }

  // ---------- what the screens draw ----------
  private func redraw() {
    projects.sort { num($0["created"]) < num($1["created"]) }
    boards = projects.compactMap { p in
      guard let id = p["id"] as? String else { return nil }
      let cols = (p["statuses"] as? [Rec] ?? []).compactMap { s -> Column? in guard let sid = s["id"] as? String else { return nil }; return Column(id: sid, name: s["name"] as? String ?? "", color: s["color"] as? String ?? "#8E8E93", done: s["done"] as? Bool ?? false) }
      return cols.isEmpty ? nil : Board(id: id, name: p["name"] as? String ?? "Board", color: p["color"] as? String ?? Store.colors[0], columns: cols)
    }
    let by = Dictionary(uniqueKeysWithValues: boards.map { ($0.id, $0) })
    items = tasks.compactMap { t in
      guard let id = t["id"] as? String, let b = by[t["project"] as? String ?? ""] else { return nil }
      let col = t["status"] as? String ?? "", n = Store.words(t["notes"])
      return Item(id: id, board: b.id, title: t["title"] as? String ?? "", column: col, due: t["due"] as? String ?? "", rep: t["rep"] as? String ?? "", who: t["who"] as? String ?? "",
                  steps: (t["subs"] as? [Rec] ?? []).map { Step(id: $0["id"] as? String ?? Store.uid(), text: $0["t"] as? String ?? "", done: $0["done"] as? Bool ?? false) },
                  tags: t["tags"] as? [String] ?? [], order: num(t["order"]), doneAt: num(t["doneAt"]), done: b.columns.first { $0.id == col }?.done ?? false, notes: n.text, richNotes: n.rich)
    }
  }
  func board(_ id: String) -> Board? { boards.first { $0.id == id } }
  func item(_ id: String) -> Item? { items.first { $0.id == id } }
  func cards(_ board: String, _ column: String) -> [Item] { let c = items.filter { $0.board == board && $0.column == column }; return (self.board(board)?.columns.first { $0.id == column }?.done ?? false) ? c.sorted { $0.doneAt > $1.doneAt } : c.sorted { $0.order < $1.order } }
  var late: [Item] { let t = Day.today; return items.filter { !$0.done && !$0.due.isEmpty && $0.due < t }.sorted { $0.due < $1.due } }
  func due(_ key: String) -> [Item] { items.filter { !$0.done && $0.due == key }.sorted { $0.order < $1.order } }
  var doneToday: [Item] { let start = Calendar.current.startOfDay(for: Date()).timeIntervalSince1970 * 1000; return items.filter { $0.done && $0.doneAt >= start }.sorted { $0.doneAt > $1.doneAt } }
  func found(_ words: String) -> [Item] { let w = words.lowercased().split(separator: " ").map(String.init); if w.isEmpty { return [] }; return items.filter { i in let hay = (i.title + " " + i.notes).lowercased(); return w.allSatisfy { hay.contains($0) } }.sorted { !$0.done && $1.done } }

  // ---------- writing it down ----------
  private func changed() {
    redraw()
    if saving || !readable { return }; saving = true
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { [weak self] in self?.saving = false; self?.flush() }
  }
  var text: String { let o: Rec = ["format": Store.format, "version": 1, "exported": ISO8601DateFormatter().string(from: Date()), "projects": projects, "tasks": tasks, "people": people]; return (try? JSONSerialization.data(withJSONObject: o, options: [.sortedKeys])).map { String(decoding: $0, as: UTF8.self) } ?? "" }
  /// Write the file now (the app is being left, or a change has settled).
  func flush() { guard readable else { return }; try? Data(text.utf8).write(to: file, options: .atomic) }

  // ---------- boards ----------
  @discardableResult func addBoard(_ name: String, color: String? = nil) -> String {
    let id = Store.uid(), n = name.trimmingCharacters(in: .whitespaces)
    projects.append(["id": id, "name": n.isEmpty ? "New board" : String(n.prefix(80)), "color": color ?? Store.colors[projects.count % Store.colors.count], "statuses": Store.columns,
                     "board": ["show": ["tags": true, "subs": true, "due": true, "who": true], "dense": false, "group": "status", "shut": [String: Any]()] as Rec, "created": now(), "updated": now()])
    changed(); return id
  }
  private func pi(_ id: String) -> Int? { projects.firstIndex { ($0["id"] as? String) == id } }
  func setBoard(_ id: String, name: String? = nil, color: String? = nil) {
    guard let i = pi(id) else { return }
    if let n = name?.trimmingCharacters(in: .whitespaces), !n.isEmpty { projects[i]["name"] = String(n.prefix(80)) }; if let c = color { projects[i]["color"] = c }
    projects[i]["updated"] = now(); changed()
  }
  /// Deleting a board deletes its tasks.
  func removeBoard(_ id: String) { projects.removeAll { ($0["id"] as? String) == id }; tasks.removeAll { ($0["project"] as? String) == id }; changed() }
  func addColumn(_ board: String, _ name: String) {
    guard let i = pi(board) else { return }; let n = name.trimmingCharacters(in: .whitespaces); if n.isEmpty { return }
    var s = projects[i]["statuses"] as? [Rec] ?? []; let at = s.firstIndex { $0["done"] as? Bool == true } ?? s.count      // a new column goes before the done one
    s.insert(["id": Store.uid(), "name": String(n.prefix(40)), "color": "#8E8E93", "done": false], at: at); projects[i]["statuses"] = s; projects[i]["updated"] = now(); changed()
  }
  func renameColumn(_ board: String, _ column: String, _ name: String) {
    guard let i = pi(board) else { return }; let n = name.trimmingCharacters(in: .whitespaces); if n.isEmpty { return }
    projects[i]["statuses"] = (projects[i]["statuses"] as? [Rec] ?? []).map { s in var s = s; if (s["id"] as? String) == column { s["name"] = String(n.prefix(40)) }; return s }; projects[i]["updated"] = now(); changed()
  }
  /// A column is deleted: its tasks move to the first column left.
  func removeColumn(_ board: String, _ column: String) {
    guard let i = pi(board) else { return }; var s = projects[i]["statuses"] as? [Rec] ?? []; if s.count < 2 { return }
    s.removeAll { ($0["id"] as? String) == column }; guard let to = s.first?["id"] as? String else { return }
    projects[i]["statuses"] = s; projects[i]["updated"] = now()
    for j in tasks.indices where (tasks[j]["project"] as? String) == board && (tasks[j]["status"] as? String) == column { tasks[j]["status"] = to; tasks[j]["updated"] = now() }
    changed()
  }

  // ---------- tasks ----------
  private func ti(_ id: String) -> Int? { tasks.firstIndex { ($0["id"] as? String) == id } }
  private func isDone(_ t: Rec) -> Bool { board(t["project"] as? String ?? "")?.columns.first { $0.id == (t["status"] as? String) }?.done ?? false }
  private func lastOrder(_ board: String) -> Double { tasks.filter { ($0["project"] as? String) == board }.map { num($0["order"]) }.max() ?? 0 }
  @discardableResult func addTask(_ title: String, board: String, due: String = "", column: String? = nil) -> String? {
    let t = title.trimmingCharacters(in: .whitespacesAndNewlines); guard !t.isEmpty, let b = self.board(board) else { return nil }
    let id = Store.uid(), col = column.flatMap { c in b.columns.contains { $0.id == c } ? c : nil } ?? b.firstOpen
    var r: Rec = ["id": id, "project": b.id, "title": String(t.prefix(300)), "status": col, "due": due, "who": "", "tags": [String](), "subs": [Rec](), "notes": NSNull(), "order": lastOrder(b.id) + 1, "was": "",
                  "created": now(), "updated": now(), "doneAt": 0, "rep": "", "cover": NSNull(), "vals": [String: Any]()]
    if b.columns.first(where: { $0.id == col })?.done == true { r["doneAt"] = now() }
    tasks.append(r); changed(); return id
  }
  /// Change a task. When that finishes it, the time is kept; when it is no longer finished, the time goes.
  private func set(_ id: String, _ change: Rec) {
    guard let i = ti(id) else { return }; let was = isDone(tasks[i])
    for (k, v) in change { tasks[i][k] = v }; tasks[i]["updated"] = now()
    let done = isDone(tasks[i]); if done && !was { tasks[i]["doneAt"] = now() }; if !done { tasks[i]["doneAt"] = 0 }
    changed()
  }
  func setTitle(_ id: String, _ title: String) { let t = title.trimmingCharacters(in: .whitespacesAndNewlines); if !t.isEmpty { set(id, ["title": String(t.prefix(300))]) } }
  func setDue(_ id: String, _ due: String) { set(id, ["due": due]) }
  func setRepeat(_ id: String, _ rep: String) { guard let i = ti(id) else { return }; var c: Rec = ["rep": Repeats.all.contains(rep) ? rep : ""]; if !rep.isEmpty && (tasks[i]["due"] as? String ?? "").isEmpty { c["due"] = Day.today }; set(id, c) }
  func setSteps(_ id: String, _ steps: [Step]) { set(id, ["subs": steps.filter { !$0.text.trimmingCharacters(in: .whitespaces).isEmpty }.map { ["id": $0.id, "t": $0.text, "done": $0.done] as Rec }]) }
  /// Put a task in a column of its board.
  func move(_ id: String, to column: String) { guard let i = ti(id), let b = board(tasks[i]["project"] as? String ?? ""), b.columns.contains(where: { $0.id == column }) else { return }; set(id, ["status": column, "order": lastOrder(b.id) + 1]) }
  /// Put a task on another board, in its first open column.
  func move(_ id: String, toBoard board: String) { guard let b = self.board(board), let i = ti(id), (tasks[i]["project"] as? String) != board else { return }; set(id, ["project": b.id, "status": b.firstOpen, "was": "", "order": lastOrder(b.id) + 1]) }
  /// Tick or untick: done goes to the board's done column, undone goes back where it came from. A repeating task moves on to its next day instead.
  func tick(_ id: String, _ on: Bool? = nil) {
    guard let i = ti(id), let b = board(tasks[i]["project"] as? String ?? "") else { return }
    let t = tasks[i], done = isDone(t), want = on ?? !done; if want == done { return }
    let rep = t["rep"] as? String ?? ""
    if want && Repeats.all.contains(rep) {
      set(id, ["due": Repeats.next(t["due"] as? String ?? "", rep), "lastDone": now(), "subs": (t["subs"] as? [Rec] ?? []).map { ["id": $0["id"] ?? "", "t": $0["t"] ?? "", "done": false] as Rec }]); return
    }
    if want { set(id, ["was": t["status"] as? String ?? "", "status": b.firstDone]) }
    else { let back = t["was"] as? String ?? ""; set(id, ["status": b.columns.contains { $0.id == back && !$0.done } ? back : b.firstOpen, "was": ""]) }
  }
  func removeTask(_ id: String) { tasks.removeAll { ($0["id"] as? String) == id }; changed() }

  // ---------- notes: a Sleek Docs document on the web, plain words here ----------
  /// The words of a task's notes, and whether they hold more than plain paragraphs.
  static func words(_ notes: Any?) -> (text: String, rich: Bool) {
    guard let doc = notes as? Rec, let blocks = doc["content"] as? [Rec] else { return ("", false) }
    var rich = false
    func text(_ n: Rec) -> String { if let t = n["text"] as? String { if n["marks"] != nil { rich = true }; return t }; return (n["content"] as? [Rec] ?? []).map(text).joined(separator: (n["type"] as? String) == "paragraph" ? "" : "\n") }
    let lines = blocks.map { b -> String in if (b["type"] as? String) != "paragraph" { rich = true }; return text(b) }
    return (lines.joined(separator: "\n"), rich)
  }
  private static func paragraphs(_ text: String) -> [Rec] { text.components(separatedBy: "\n").map { l in ["type": "paragraph", "content": l.isEmpty ? [Rec]() : [["type": "text", "text": l] as Rec]] as Rec } }
  /// Plain notes are rewritten as you type. Notes with formatting from the web are left as they are, and what you write here is added beneath.
  func setNotes(_ id: String, _ text: String) {
    guard let i = ti(id) else { return }
    if Store.words(tasks[i]["notes"]).rich { return }
    set(id, ["notes": text.isEmpty ? NSNull() as Any : ["type": "doc", "content": Store.paragraphs(text)] as Rec])
  }
  func addToNotes(_ id: String, _ text: String) {
    guard let i = ti(id), !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
    var doc = tasks[i]["notes"] as? Rec ?? ["type": "doc", "content": [Rec]()]; doc["content"] = (doc["content"] as? [Rec] ?? []) + Store.paragraphs(text); set(id, ["notes": doc])
  }

  // ---------- a copy as a file: to keep, or to move your tasks to or from Sleek Tasks on the web ----------
  struct NotOurs: LocalizedError { let why: String; var errorDescription: String? { why } }
  /// Bring a file's boards and tasks in beside what is here. A board or a task that is already here (the very one, by its id) is left as it is.
  @discardableResult func bring(_ text: String) throws -> (boards: Int, tasks: Int) {
    guard let o = (try? JSONSerialization.jsonObject(with: Data(text.utf8))) as? Rec, (o["format"] as? String) == Store.format, let ps = o["projects"] as? [Rec], let ts = o["tasks"] as? [Rec] else { throw NotOurs(why: "This is not a Sleek Tasks file.") }
    if num(o["version"]) > 1 { throw NotOurs(why: "This file was made with a newer Sleek Tasks.") }
    func ok(_ r: Rec) -> String? { guard let id = r["id"] as? String, id.range(of: "^[a-z0-9]{4,24}$", options: .regularExpression) != nil else { return nil }; return id }
    var b = 0, t = 0
    for var p in ps { guard let id = ok(p), pi(id) == nil, let s = p["statuses"] as? [Rec], !s.isEmpty else { continue }; p["name"] = String((p["name"] as? String ?? "Board").prefix(80)); if p["created"] == nil { p["created"] = now() }; projects.append(p); b += 1 }
    redraw()
    for var x in ts {
      guard let id = ok(x), ti(id) == nil, let bd = board(x["project"] as? String ?? "") else { continue }
      let title = String((x["title"] as? String ?? "").prefix(300)); x["title"] = title.isEmpty ? "Task" : title
      if !bd.columns.contains(where: { $0.id == (x["status"] as? String) }) { x["status"] = bd.firstOpen }
      if !(x["tags"] is [Any]) { x["tags"] = [String]() }; if !(x["subs"] is [Any]) { x["subs"] = [Rec]() }; if x["vals"] == nil { x["vals"] = [String: Any]() }
      tasks.append(x); t += 1
    }
    for p in o["people"] as? [Rec] ?? [] { if let n = p["name"] as? String, !n.isEmpty, !people.contains(where: { ($0["name"] as? String) == n }) { people.append(["name": String(n.prefix(40)), "color": p["color"] as? String ?? Store.colors[0]]) } }
    changed(); return (b, t)
  }
  /// For the app's own checks: a board or a task exactly as it is kept.
  func kept(board id: String) -> Rec? { pi(id).map { projects[$0] } }
  func kept(task id: String) -> Rec? { ti(id).map { tasks[$0] } }
}

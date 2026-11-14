// Started plainly, the app is Sleek Tasks. Started with `--prove` (./make.sh check), it checks the rules its
// store follows, against a file as Sleek Tasks on the web saves it, in a throwaway folder (your tasks are not
// touched), says each thing it finds on screen and in the console, and quits.
import SwiftUI

@main
struct SleekTasksApp: App {
  var body: some Scene { WindowGroup { if Args.proving { CheckView() } else { TasksRoot() } } }
}

@MainActor
final class Checker: ObservableObject {
  @Published var lines: [(ok: Bool, text: String)] = []
  private var failures = 0
  private func say(_ ok: Bool, _ text: String) { lines.append((ok, text)); if !ok { failures += 1 }; print((ok ? "  ok   " : "  FAIL ") + text); fflush(stdout) }
  private func same(_ a: Any?, _ b: Any?) -> Bool {
    func j(_ v: Any?) -> String { guard let v = v else { return "nil" }; return (try? JSONSerialization.data(withJSONObject: ["v": v], options: [.sortedKeys])).map { String(decoding: $0, as: UTF8.self) } ?? "?" }
    return j(a) == j(b)
  }
  /// A file as Sleek Tasks on the web saves it: a board with its own field and settings, a task with formatted notes, a picture, tags and a person.
  static let webFile = """
  {"format":"sleek-tasks","version":1,"exported":"2026-11-01T10:00:00.000Z",
   "projects":[{"id":"webboard01","name":"From the web","color":"#7C5CFF","statuses":[{"id":"todo","name":"To do","color":"#8E8E93","done":false},{"id":"rev1","name":"In review","color":"#F0A52D","done":false},{"id":"done","name":"Done","color":"#12A36A","done":true}],
     "board":{"show":{"tags":true,"subs":true,"due":true,"who":false},"dense":true,"group":"status","shut":{}},"fields":[{"id":"f1abc","name":"Cost","type":"number"}],"grid":{"sort":"due"},"created":1700000000000,"updated":1700000000500}],
   "tasks":[{"id":"webtask001","project":"webboard01","title":"A task made on the web","status":"rev1","due":"2026-12-24","who":"Priya","tags":["launch","copy"],"subs":[{"id":"s1","t":"First step","done":true}],
     "notes":{"type":"doc","content":[{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Why"}]},{"type":"paragraph","content":[{"type":"text","text":"From "},{"type":"text","text":"https://example.com","marks":[{"type":"link","attrs":{"href":"https://example.com"}}]}]}]},
     "order":3,"was":"","rep":"","cover":{"ref":"data:image/png;base64,AAAA","video":false,"name":"shot.png"},"vals":{"f1abc":12.5},"created":1700000001000,"updated":1700000002000,"doneAt":0},
    {"id":"webtask002","project":"webboard01","title":"A plain one","status":"gone","due":"","who":"","tags":[],"subs":[],"notes":null,"order":4,"was":"","rep":"","cover":null,"vals":{},"created":1700000003000,"updated":1700000003000,"doneAt":0},
    {"id":"orphan0001","project":"nosuchboard","title":"Belongs nowhere","status":"todo"}],
   "people":[{"name":"Priya","color":"#E0457B"}]}
  """

  func run() async {
    let dir = FileManager.default.temporaryDirectory.appendingPathComponent("sleek-tasks-check-\(ProcessInfo.processInfo.processIdentifier)"), file = dir.appendingPathComponent("Tasks.sleek")
    let s = Store(file: file)
    say(s.boards.isEmpty && s.items.isEmpty && s.readable, "it starts with nothing, in a folder of its own")

    // ---------- boards and tasks ----------
    let home = s.addBoard("My tasks"), b = s.board(home)
    say(b?.columns.map(\.name) == ["To do", "Doing", "Done"] && b?.columns.map(\.done) == [false, false, true] && b?.firstOpen == "todo" && b?.firstDone == "done" && s.kept(board: home)?["board"] != nil, "a new board has To do, Doing and Done, as on the web")
    let a = s.addTask("  Buy milk  ", board: home, due: Day.today) ?? "", second = s.addTask("Call Sam", board: home) ?? ""
    say(s.item(a)?.title == "Buy milk" && s.item(a)?.column == "todo" && s.item(second)!.order > s.item(a)!.order && a.range(of: "^[a-z0-9]{4,24}$", options: .regularExpression) != nil && s.due(Day.today).map(\.id) == [a] && s.addTask("   ", board: home) == nil, "a task goes into the first open column, in order, and shows under the day it is due")
    s.tick(a)
    say(s.item(a)?.done == true && s.item(a)?.column == "done" && (s.item(a)?.doneAt ?? 0) > 0 && s.doneToday.map(\.id) == [a] && s.due(Day.today).isEmpty && (s.kept(task: a)?["was"] as? String) == "todo", "ticking it moves it to Done and keeps when")
    s.tick(a)
    say(s.item(a)?.done == false && s.item(a)?.column == "todo" && s.item(a)?.doneAt == 0, "unticking puts it back")
    s.move(a, to: "doing"); s.tick(a); s.tick(a)
    say(s.item(a)?.column == "doing", "a task ticked from Doing goes back to Doing when unticked")
    s.setDue(a, Day.from(today: -2))
    say(s.late.map(\.id) == [a] && Day.word(Day.from(today: -2)) == "2 days late" && Day.word(Day.today) == "Today" && Day.word(Day.from(today: 1)) == "Tomorrow", "a task past its day is late")
    s.setTitle(a, "Buy oat milk"); s.setSteps(a, [Step(id: "x1", text: "Check the fridge", done: true), Step(id: "x2", text: "  ", done: false), Step(id: "x3", text: "Go", done: false)])
    say(s.item(a)?.title == "Buy oat milk" && s.item(a)?.steps.map(\.text) == ["Check the fridge", "Go"] && s.item(a)?.steps.first?.done == true, "its name and its steps can be changed; an empty step is dropped")

    // ---------- tasks that repeat ----------
    say(Day.key(Repeats.nth("2026-01-31", "monthly", 1)) == "2026-02-28" && Day.key(Repeats.nth("2024-02-29", "yearly", 1)) == "2025-02-28" && Day.key(Repeats.nth("2026-11-13", "weekdays", 1)) == "2026-11-16" && Day.key(Repeats.nth("2026-11-13", "weekly", 2)) == "2026-11-27" && Day.key(Repeats.nth("2026-12-31", "daily", 1)) == "2027-01-01", "repeating days are worked out as on the web: month ends, leap days, weekdays")
    s.setDue(a, Day.from(today: -10)); s.setRepeat(a, "weekly"); s.tick(a)
    let again = s.item(a), gap = Calendar.current.dateComponents([.day], from: Day.date(Day.today)!, to: Day.date(again?.due ?? "")!).day ?? -1
    say(again?.done == false && again?.column == "doing" && gap >= 1 && gap <= 7 && (gap + 10) % 7 == 0 && again?.steps.allSatisfy({ !$0.done }) == true && s.kept(task: a)?["lastDone"] != nil, "ticking a weekly task moves it on to its next day, with its steps unticked, and leaves it open")
    s.setRepeat(second, "daily")
    say(s.item(second)?.due == Day.today && s.item(second)?.rep == "daily", "a task set to repeat with no day starts today")
    s.setRepeat(a, ""); s.setRepeat(second, "")

    // ---------- notes ----------
    s.setNotes(a, "Semi-skimmed is fine.\nNot the small one.")
    let doc = s.kept(task: a)?["notes"] as? Rec, paras = doc?["content"] as? [Rec]
    say(s.item(a)?.notes == "Semi-skimmed is fine.\nNot the small one." && s.item(a)?.richNotes == false && (doc?["type"] as? String) == "doc" && paras?.count == 2 && (paras?.first?["type"] as? String) == "paragraph", "plain notes are kept as a Sleek Docs document, a paragraph a line")
    s.setNotes(a, "")
    say(s.kept(task: a)?["notes"] is NSNull && s.item(a)?.notes == "", "and cleared when emptied")

    // ---------- columns ----------
    s.addColumn(home, "Waiting"); s.renameColumn(home, "doing", "In hand")
    let cols = s.board(home)?.columns ?? [], waiting = cols.first { $0.name == "Waiting" }?.id ?? ""
    say(cols.map(\.name) == ["To do", "In hand", "Waiting", "Done"], "a new column goes in before Done, and a column can be renamed")
    s.move(second, to: waiting); s.removeColumn(home, waiting)
    say(s.board(home)?.columns.count == 3 && s.item(second)?.column == "todo", "deleting a column moves its tasks to the first")

    // ---------- a file from Sleek Tasks on the web ----------
    let came = try? s.bring(Checker.webFile), w = s.item("webtask001"), original = ((try? JSONSerialization.jsonObject(with: Data(Checker.webFile.utf8))) as? Rec)?["tasks"] as? [Rec]
    say(came?.boards == 1 && came?.tasks == 2 && s.board("webboard01")?.columns.map(\.name) == ["To do", "In review", "Done"] && s.item("orphan0001") == nil, "a file saved on the web comes in: its board and its tasks, and not a task whose board is missing")
    say(w?.column == "rev1" && w?.due == "2026-12-24" && w?.who == "Priya" && w?.tags == ["launch", "copy"] && w?.steps.first?.text == "First step" && s.item("webtask002")?.column == "todo", "a task from it shows its day, steps, tags and person; one in a column that is gone goes to the first")
    say(same(s.kept(task: "webtask001"), original?[0]) && same(s.kept(board: "webboard01")?["fields"], [["id": "f1abc", "name": "Cost", "type": "number"]]), "what this app does not show (formatted notes, a picture, your own fields) is kept exactly as it came")
    say(w?.richNotes == true && w?.notes == "Why\nFrom https://example.com", "formatted notes are shown as their words")
    s.setNotes("webtask001", "overwritten"); s.addToNotes("webtask001", "Added on the phone")
    let rich = (s.kept(task: "webtask001")?["notes"] as? Rec)?["content"] as? [Rec] ?? []
    say(rich.count == 3 && (rich[0]["type"] as? String) == "heading" && same(rich[1], ((original?[0]["notes"] as? Rec)?["content"] as? [Rec])?[1]) && same(rich[2], ["type": "paragraph", "content": [["type": "text", "text": "Added on the phone"]]]), "they are never rewritten here: what you add goes beneath, and the formatting stays")
    let twice = try? s.bring(Checker.webFile)
    say(twice?.boards == 0 && twice?.tasks == 0 && s.boards.count == 2, "bringing the same file in again changes nothing")
    var refused = "", newer = ""
    do { try s.bring("{\"format\":\"something-else\"}") } catch { refused = error.localizedDescription }
    do { try s.bring("{\"format\":\"sleek-tasks\",\"version\":2,\"projects\":[],\"tasks\":[]}") } catch { newer = error.localizedDescription }
    say(refused == "This is not a Sleek Tasks file." && newer == "This file was made with a newer Sleek Tasks.", "a file that is not Sleek Tasks, or from a newer one, is refused plainly")

    // ---------- moving, finding ----------
    s.move(a, toBoard: "webboard01")
    say(s.item(a)?.board == "webboard01" && s.item(a)?.column == "todo" && s.cards("webboard01", "todo").last?.id == a, "a task can move to another board, into its first open column")
    say(s.found("oat MILK").map(\.id) == [a] && s.found("phone").map(\.id) == ["webtask001"] && s.found("   ").isEmpty, "a task is found by its words, in its name or its notes")

    // ---------- the file on this iPhone ----------
    s.flush()
    let onDisk = (try? JSONSerialization.jsonObject(with: Data(contentsOf: file))) as? Rec, t2 = Store(file: file)
    say((onDisk?["format"] as? String) == "sleek-tasks" && (onDisk?["version"] as? Int) == 1 && (onDisk?["people"] as? [Rec])?.first?["name"] as? String == "Priya" && t2.boards == s.boards && t2.items == s.items, "everything is written to one file, the same kind the web saves, and read back the same")
    let fresh = Store(file: dir.appendingPathComponent("other.sleek")), moved = try? fresh.bring(s.text)
    say(moved?.boards == 2 && moved?.tasks == s.items.count && same(fresh.kept(task: "webtask001"), s.kept(task: "webtask001")), "a copy saved from here comes into another Sleek Tasks whole")
    let bad = dir.appendingPathComponent("bad.sleek"); try? Data("not a file of tasks".utf8).write(to: bad)
    let broken = Store(file: bad); broken.addBoard("Should not be saved"); broken.flush()
    say(!broken.readable && (try? String(contentsOf: bad, encoding: .utf8)) == "not a file of tasks", "a file that cannot be read is never written over")
    s.removeTask(second); s.removeBoard("webboard01")
    say(s.item(second) == nil && s.boards.map(\.id) == [home] && s.items.isEmpty, "a task can be deleted; deleting a board deletes its tasks")

    // ---------- a real file, saved by Sleek Tasks on the web just now (./make.sh is not given one; see the README) ----------
    if let from = Args.arg("--web"), let text = try? String(contentsOfFile: from, encoding: .utf8) {
      let x = Store(file: dir.appendingPathComponent("cross.sleek")), got = try? x.bring(text), before = ((try? JSONSerialization.jsonObject(with: Data(text.utf8))) as? Rec)?["tasks"] as? [Rec] ?? []
      let board = x.boards.first, weekly = x.items.first { $0.rep == "weekly" }, dueToday = x.items.first { $0.title == "Web task due today" }, finished = x.items.first { $0.title == "Web done task" }
      say(got?.boards == 1 && got?.tasks == 3 && board?.name == "Cross-check board" && finished?.done == true && dueToday?.who == "Sam" && weekly?.notes == "Plain note from the web" && weekly?.richNotes == false && weekly?.steps.first?.done == true, "a real file from the web comes in as the web made it")
      say(before.allSatisfy { r in same(x.kept(task: r["id"] as? String ?? ""), r) }, "and every task in it is kept exactly as the web wrote it")
      if let w = weekly { x.tick(w.id) }
      say(x.item(weekly?.id ?? "")?.due == Args.arg("--next") && x.item(weekly?.id ?? "")?.done == false, "ticking its weekly task lands on the day the web itself works out (\(Args.arg("--next") ?? "?"))")
      if let b = board { let made = x.addTask("Made on the phone", board: b.id, due: Day.from(today: 1)) ?? ""; x.setSteps(made, [Step(id: Store.uid(), text: "A phone step", done: false)]); x.setNotes(made, "A note from the phone"); x.addColumn(b.id, "Waiting"); if let d = dueToday { x.tick(d.id) } }
      if let out = Args.arg("--out") { try? x.text.write(toFile: out, atomically: true, encoding: .utf8); say(FileManager.default.fileExists(atPath: out), "its own copy is written out for the web to read") }
    }

    try? FileManager.default.removeItem(at: dir)
    print(failures == 0 ? "\nall passed (\(lines.count) checks)" : "\n\(failures) FAILED"); fflush(stdout)
    try? await Task.sleep(nanoseconds: 800_000_000); exit(failures == 0 ? 0 : 1)
  }
}

struct CheckView: View {
  @StateObject private var c = Checker()
  var body: some View {
    ScrollViewReader { reader in
      ScrollView {
        VStack(alignment: .leading, spacing: 6) {
          ForEach(Array(c.lines.enumerated()), id: \.offset) { i, line in HStack(alignment: .top, spacing: 8) { Image(systemName: line.ok ? "checkmark.circle.fill" : "xmark.circle.fill").foregroundStyle(line.ok ? .green : .red); Text(line.text).font(.footnote) }.id(i) }
        }.padding(12).frame(maxWidth: .infinity, alignment: .leading)
      }.onChange(of: c.lines.count) { _, n in reader.scrollTo(n - 1) }
    }.task { await c.run() }
  }
}

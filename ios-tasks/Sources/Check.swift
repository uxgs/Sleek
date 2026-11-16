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

    // ---------- grocery lists ----------
    let gl = s.addList("Weekly shop"), lb = s.board(gl)
    say(lb?.isList == true && lb?.columns.map(\.name) == ["To get", "In the basket"] && (s.kept(board: gl)?["kind"] as? String) == "grocery" && s.plainBoards.map(\.id) == [home], "a grocery list is a board of its own kind, with To get and In the basket, as on the web")
    let p1 = Store.parse("2 lemons"), p2 = Store.parse("lemons x3"), p3 = Store.parse("Lemons ×12"), p4 = Store.parse("eggs")
    say(p1.name == "Lemons" && p1.qty == 2 && p2.qty == 3 && p3.qty == 12 && p4.qty == 1 && !p4.counted && p4.name == "Eggs", "“2 lemons”, “lemons x3” and “Lemons ×12” are read as the web reads them")
    let guesses = ["Kitchen roll", "Bread rolls", "Oat milk", "Peanut butter", "Rice", "Steak", "Shampoo", "Foil", "Ice cream", "Frozen peas", "Chickpeas", "Juice", "Tomatoes", "Blueberries", "Birthday candles", "Sellotape"].map(Aisle.guess)
    say(guesses == ["home", "bakery", "dairy", "pantry", "pantry", "meat", "home", "home", "frozen", "frozen", "pantry", "drinks", "produce", "produce", "home", "other"], "each thing goes to the aisle the web would put it in")
    for x in ["2 lemons", "Avocados x3", "milk", "kitchen roll"] { s.addThing(x, to: gl) }
    let lem = s.onList(gl, "lemons")
    say(s.things(gl).map { "\($0.title)×\($0.qty)@\($0.aisle)" } == ["Lemons×2@produce", "Avocados×3@produce", "Milk×1@dairy", "Kitchen roll×1@home"] && s.addThing("   ", to: gl) == nil && s.addThing("Bread", to: home) == nil, "things land with their number and aisle, and only on a list")
    s.addThing("milk", to: gl); s.tick(lem?.id ?? ""); s.addThing("lemons", to: gl)
    say(s.onList(gl, "milk")?.qty == 2 && s.onList(gl, "lemons")?.done == false && s.onList(gl, "lemons")?.qty == 3 && s.things(gl).count == 4, "adding something already there makes it one more, and brings it back out of the basket")
    s.removeTask(s.onList(gl, "milk")?.id ?? ""); s.removeTask(s.onList(gl, "kitchen roll")?.id ?? "")
    say(s.offer(gl).map(\.name) == ["Milk", "Kitchen roll"] && s.suggest("2 mi", gl).map(\.name) == ["Milk"] && s.suggest("Milk", gl).isEmpty, "Add again offers your usuals not on the list, most added first; typing offers them too")
    s.stopOffering("Kitchen roll"); s.setAisle(s.onList(gl, "avocados")?.id ?? "", "other")
    say(s.offer(gl).map(\.name) == ["Milk"] && s.aisle(for: "avocados") == "other" && s.onList(gl, "Avocados")?.aisle == "other", "a usual can be told not to be offered; a thing moved to another aisle goes there from now on")
    s.setQty(s.onList(gl, "avocados")?.id ?? "", 0)
    say(s.onList(gl, "avocados")?.qty == 1 && s.found("lemons").isEmpty, "a number is never less than one; things on lists are not found as tasks")
    s.setListDue(gl, Day.from(today: 2))
    say(s.listsToday.isEmpty, "a list for another day is not on Today yet")
    s.setListDue(gl, Day.from(today: -1))
    say(s.listsToday.map(\.id) == [gl], "a list for today or a day gone by is on Today until shopped")
    s.tick(s.onList(gl, "lemons")?.id ?? "")
    let nx = s.finishList(gl, carry: true) ?? "", done = s.board(gl), nb = s.board(nx)
    say(done?.shopped == true && done?.carried == 1 && done?.next == nx && nb?.isList == true && s.things(nx).map(\.title) == ["Avocados"] && s.things(gl).map(\.title) == ["Lemons"] && (nb?.due ?? "") > Day.today && s.listsToday.isEmpty, "Done shopping: it is shopped; what was not got starts the next list, a week on")
    s.reopenList(gl)
    say(s.board(gl)?.shopped == false && s.listsToday.map(\.id) == [gl], "a shopped list can be opened again")
    s.flush()
    let back = Store(file: file), keptU = back.keptUsual("milk")
    say(back.board(gl)?.isList == true && back.board(nx)?.due == nb?.due && back.onList(nx, "avocados")?.aisle == "other" && (keptU?["c"] as? Int) == 2 && back.keptUsual("kitchen roll")?["off"] as? Bool == true, "lists, their things and your usuals are written to the file and read back the same")
    let other = Store(file: dir.appendingPathComponent("lists.sleek")); _ = try? other.bring(s.text)
    say(other.lists.count == 2 && other.offer(nx).map(\.name) == ["Lemons", "Milk"] && other.aisle(for: "Avocados") == "other", "a copy carries the lists and your usuals into another Sleek Tasks")
    s.removeBoard(gl); s.removeBoard(nx)

    // ---------- sharing with the other Sleek apps on this iPhone (the same cases as the web's mergeAll) ----------
    func edit(_ text: String, _ f: (inout Rec) -> Void) -> String { var o = (try? JSONSerialization.jsonObject(with: Data(text.utf8))) as? Rec ?? [:]; f(&o); return (try? JSONSerialization.data(withJSONObject: o)).map { String(decoding: $0, as: UTF8.self) } ?? "" }
    let theirs = dir.appendingPathComponent("browser"), them = Store(file: theirs.appendingPathComponent("Tasks.sleek")), mine = Store(file: dir.appendingPathComponent("tasks/Tasks.sleek"))
    var told = 0; mine.tell = { told += 1 }; mine.peers = [theirs]
    let tb = them.addBoard("Home"), keep = them.addTask("Keep me", board: tb) ?? "", change = them.addTask("Change me", board: tb) ?? "", del = them.addTask("Delete me there", board: tb) ?? "", later = them.addTask("Edited here later", board: tb) ?? ""
    let tl = them.addList("Shop"); them.addThing("milk", to: tl); them.addThing("milk", to: tl); them.flush()
    let first = mine.pull()
    say(first > 0 && mine.board(tb)?.name == "Home" && mine.items.count == 5 && mine.keptUsual("milk")?["c"] as? Int == 2 && mine.pull() == 0, "it brings in another app's copy once, and again only when that copy changes")
    let soon = Int(Date().timeIntervalSince1970 * 1000) + 5000
    let next = edit(them.text) { o in
      o["tasks"] = (o["tasks"] as? [Rec] ?? []).compactMap { t -> Rec? in var t = t; let id = t["id"] as? String; if id == del || id == later { return nil }; if id == change { t["title"] = "Changed there"; t["updated"] = soon }; return t }
        + [["id": "zzzz1newone", "project": tb, "title": "Made there", "status": "todo", "order": 9, "created": soon, "updated": soon] as Rec]
      o["gone"] = [del: soon, later: soon - 70_000] as Rec
      o["usuals"] = (o["usuals"] as? [Rec] ?? []).map { u in var u = u; u["c"] = 7; u["a"] = "pantry"; u["at"] = soon; return u } + [["n": "Tea", "c": 3, "a": "", "off": false, "at": soon] as Rec]
    }
    mine.setTitle(later, "Edited here later, again")
    let n1 = mine.merge(next), n2 = mine.merge(next)
    say(mine.things(tb).map(\.title).sorted() == ["Changed there", "Edited here later, again", "Keep me", "Made there"] && mine.wasGone(del), "newer wins, deleted there goes, made there comes, changed here after the delete stays")
    say(mine.keptUsual("milk")?["c"] as? Int == 7 && mine.keptUsual("milk")?["a"] as? String == "pantry" && mine.keptUsual("tea") != nil, "usuals combine: the higher count, the newer aisle, new names")
    say(n1 > 0 && n2 == 0, "taking the same copy again changes nothing")
    _ = mine.merge(edit(next) { o in o["projects"] = (o["projects"] as? [Rec] ?? []).map { p in var p = p; if p["id"] as? String == tb { p["name"] = "Older name"; p["updated"] = 1 }; return p } })
    say(mine.board(tb)?.name == "Home", "an older board in the other copy is left alone")
    _ = mine.merge(edit(next) { o in o["version"] = 2; o["tasks"] = [] as [Rec]; o["gone"] = [keep: soon + 9000] as Rec })
    say(mine.item(keep) != nil, "a copy from a newer Sleek is left alone")
    mine.flush(); let t1 = told; mine.flush()
    say(t1 > 0 && told == t1, "writing its own copy tells the other apps, and only when something changed")
    _ = mine.merge(edit(next) { o in o["gone"] = [tb: soon + 9000] as Rec })
    say(mine.board(tb) == nil && mine.things(tb).isEmpty, "a board deleted there goes, with its tasks")
    let tl2 = mine.lists.first?.id ?? ""; mine.removeTask(mine.things(tl2).first?.id ?? "")
    let back2 = (try? JSONSerialization.jsonObject(with: Data(mine.text.utf8))) as? Rec
    say((back2?["gone"] as? Rec)?.count ?? 0 > 2, "what is deleted here is noted in its own copy, for the others")

    // ---------- what Siri says and adds (../ios-shared/Siri.swift), from the apps' copies in a shared folder of its own ----------
    let root = dir.appendingPathComponent("shared"), st = Store(file: root.appendingPathComponent("tasks/Tasks.sleek")), sb = Store(file: root.appendingPathComponent("browser/Tasks.sleek"))
    let work = st.addBoard("Work"); st.addTask("Send the invoice", board: work, due: Day.today); st.addTask("File taxes", board: work, due: Day.from(today: -1)); if let d = st.addTask("Already done", board: work, due: Day.today) { st.tick(d) }
    let gro = st.addList("Groceries", due: Day.today); st.addThing("2 avocados", to: gro); let sour = st.addThing("sourdough", to: gro) ?? ""; if let m = st.addThing("milk", to: gro) { st.tick(m) }
    st.addList("Next shop", due: Day.from(today: 6)); st.flush()
    _ = try? sb.bring(st.text); sb.setTitle(sour, "Rye bread"); sb.flush()      // changed later in the browser
    let heard = SiriTasks.groceries(SiriTasks.read(root))
    say(heard.said.contains("Groceries list for today has 2 things") && heard.said.contains("2 avocados") && heard.said.contains("rye bread") && !heard.said.contains("milk") && heard.said.contains("1 is in the basket"), "Siri reads today's list from every app's copy, the newer change winning: “\(heard.said)”")
    say(heard.card.groups.map(\.name) == ["Produce", "Bakery"], "and shows it by aisle, in the order you walk the shop")
    let due = SiriTasks.dueToday(SiriTasks.read(root)).said
    say(due.contains("One thing is due today: Send the invoice") && due.contains("late: File taxes") && !due.contains("Already done") && due.contains("Groceries list is for today"), "Siri says what is due today, what is late, and today's shopping: “\(due)”")
    let e = SiriTasks.add("eggs", root: root), av = SiriTasks.add("3 avocados", root: root), mk = SiriTasks.add("milk", root: root)
    say(e?.again == false && e?.list == "Groceries" && av?.again == true && av?.qty == 3 && mk?.again == true && mk?.qty == 2, "Siri adds to today's list as Add does: new things, a number said, one more of what is there")
    st.peers = [root.appendingPathComponent("siri")]; st.pull()
    let eggs = st.onList(gro, "eggs")
    say(eggs?.aisle == "dairy" && st.onList(gro, "avocados")?.qty == 3 && st.onList(gro, "milk")?.done == false && st.keptUsual("eggs") != nil, "the app brings in what Siri added from Siri's own place (milk back from the basket, eggs in Dairy)")
    st.removeTask(eggs?.id ?? ""); st.flush()
    say(!SiriTasks.groceries(SiriTasks.read(root)).said.contains("eggs"), "something deleted in the app after Siri added it stays deleted")
    let none = dir.appendingPathComponent("empty"), said0 = SiriTasks.groceries(SiriTasks.read(none)).said, made = SiriTasks.add("bananas", root: none), after = SiriTasks.groceries(SiriTasks.read(none)).said
    say(said0.contains("no grocery list") && made?.list == "Groceries" && after.contains("bananas"), "with no list, Siri says so, and adding makes one")

    // ---------- the widgets (../ios-shared/Widgets.swift), from the same shared folder ----------
    let rye = st.onList(gro, "rye bread")?.id ?? sour
    let wd = WData.load(root: root)
    say(wd.list?.name == "Groceries" && wd.list?.left.map(\.title).contains("Rye bread") == true && wd.list?.got == 0 && wd.today.map(\.title) == ["Send the invoice"] && wd.late.map(\.title) == ["File taxes"], "the widgets read today's list, what is due and what is late from every app's copy")
    say(wd.board?.name == "Work" && wd.board?.columns.map(\.name) == ["To do", "Doing", "Done"] && wd.board?.done == 1 && wd.board?.total == 3, "the Board widget shows a board's columns and how far along it is")
    let ticked = SiriTasks.tick(rye, root: root), wd2 = WData.load(root: root)
    say(ticked && wd2.list?.left.contains { $0.id == rye } == false && wd2.list?.got == 1, "a tick on a widget takes the thing off the list")
    st.pull(); say(st.item(rye)?.done == true, "and Sleek Tasks brings the tick in from Siri's place")
    let wk = st.addTask("Water the plants", board: work, due: Day.today) ?? ""; st.setRepeat(wk, "weekly"); st.flush()
    SiriTasks.tick(wk, root: root); st.pull()
    say(st.item(wk)?.done == false && st.item(wk)?.due == Repeats.next(Day.today, "weekly") && ["daily", "weekdays", "monthly", "yearly"].allSatisfy { WText.next("2026-01-31", $0) == Repeats.next("2026-01-31", $0) }, "ticking a repeating task on a widget moves it to its next day, as the app does")
    let dk = root.appendingPathComponent("docs"), br = root.appendingPathComponent("browser")
    try? FileManager.default.createDirectory(at: dk.appendingPathComponent("pages"), withIntermediateDirectories: true)
    try? ##"{"pages":[{"id":"page000001","title":"Old name","at":100,"peek":"x"},{"id":"page000002","title":"Gone page","at":100,"peek":""}],"decks":[{"id":"deck000001","title":"Pitch","at":50,"slides":7,"kicker":"Q1","heading":"Hello","mode":"light","accent":"#FF9F0A"}]}"##.write(to: br.appendingPathComponent("glance.json"), atomically: true, encoding: .utf8)
    try? ##"{"pages":[{"id":"page000001","title":"New name","at":200,"peek":"Opening words"}]}"##.write(to: dk.appendingPathComponent("glance.json"), atomically: true, encoding: .utf8)
    try? ##"{"page:page000002":150}"##.write(to: dk.appendingPathComponent("gone.json"), atomically: true, encoding: .utf8)
    try? ##"{"format":"sleek","version":2,"kind":"doc","id":"page000001","title":"New name","updated":200,"seed":{"theme":{"accent":"#7C5CFF"},"doc":{"type":"doc","content":[{"type":"cover","content":[{"type":"paragraph","content":[{"type":"text","text":"Trip"}]},{"type":"heading","content":[{"type":"text","text":"New name"}]},{"type":"paragraph"}]},{"type":"paragraph","content":[{"type":"text","text":"Flights land Friday."}]},{"type":"heading","content":[{"type":"text","text":"Packing"}]},{"type":"task_list","content":[{"type":"task_item","attrs":{"done":true},"content":[{"type":"paragraph","content":[{"type":"text","text":"Passport"}]}]},{"type":"task_item","attrs":{"done":false},"content":[{"type":"paragraph","content":[{"type":"text","text":"Charger"}]}]}]}]}}}"##.write(to: dk.appendingPathComponent("pages/page000001.sleek"), atomically: true, encoding: .utf8)
    let wg = WData.glance(root), pb = WData.body("page000001", root)
    say(wg.pages.map(\.title) == ["New name"] && wg.decks.first?.heading == "Hello" && wg.decks.first?.slides == 7, "the Docs and Slides widgets list every page and deck, the newest word winning and what was deleted left out")
    say(pb?.kicker == "Trip" && pb?.opening == "Flights land Friday." && pb?.label == "Packing" && pb?.checks.map(\.0) == ["Passport", "Charger"] && pb?.checks.map(\.1) == [true, false], "the Page widget reads a page's cover line, its opening and its checklist")
    say(WAislesView.groups(WData.sample.list!.left).reduce(0) { $0 + 1 + $1.1.count } <= 11, "the large grocery widget shows only as many aisles and things as fit")

    // ---------- goals (../ios-shared/Goals.swift), in the app, on the widgets, and between the apps ----------
    let nov15 = Calendar.current.date(from: DateComponents(year: 2026, month: 11, day: 15))!
    func P(_ t: String) -> GoalParse.Draft { GoalParse.parse(t, today: nov15) }
    let g1 = P("Run 30 days by New Year"), g2 = P("Accomplish these 20 things this year"), g3 = P("Read 12 books this year"), g4 = P("Save $2,000 by March"), g5 = P("Meditate every day for 6 weeks"), g6 = P("Go to the gym 3 times a week until Jan 31"), g7 = P("Visit five new countries by summer")
    say(g1.kind == .days && g1.target == 30 && g1.due == "2026-12-31" && g1.title == "Run 30 days", "“Run 30 days by New Year”: 30 days to mark by Dec 31 (\(g1.title))")
    say(g2.kind == .things && g2.target == 20 && g2.due == "2026-12-31" && g3.kind == .count && g3.target == 12 && g3.unit == ["book", "books"], "“20 things this year” is a list to tick; “12 books” is a number to count")
    say(g4.kind == .count && g4.target == 2000 && g4.unit[0] == "$" && g4.due == "2027-03-31" && g5.kind == .days && g5.target == 42 && g5.due == "2026-12-26", "“Save $2,000 by March” counts dollars to Mar 31; “every day for 6 weeks” is 42 days")
    say(g6.kind == .days && g6.due == "2027-01-31" && g6.target == 33 && g7.kind == .things && g7.target == 5 && g7.due == "2027-06-21", "“3 times a week until Jan 31” is 33 days; “five new countries by summer” is 5 things by Jun 21")
    let gs = Store(file: dir.appendingPathComponent("goals/Tasks.sleek"))
    let gd = gs.addGoal(GoalParse.Draft(title: "Practise Spanish", kind: .days, target: 3, due: GDay.add(GDay.today, 10), unit: ["time", "times"]))
    var reachedNow = gs.edit(gd) { GoalEdit.mark(&$0) }
    gs.edit(gd) { GoalEdit.mark(&$0, GDay.add(GDay.today, -1)) }; gs.edit(gd) { GoalEdit.mark(&$0, GDay.add(GDay.today, 3)) }
    say(gs.goal(gd)?.marks.count == 2 && gs.goal(gd)?.streak == 2 && gs.goal(gd)?.markedToday == true && !reachedNow, "a day is marked, a day gone by too, a day to come never; two in a row is a streak of 2")
    reachedNow = gs.edit(gd) { GoalEdit.mark(&$0, GDay.add(GDay.today, -2)) }
    say(reachedNow && gs.goal(gd)?.reached == true && (gs.goal(gd)?.doneAt ?? 0) > 0 && gs.goal(gd)?.pace.text == "Reached", "the third day reaches it, and says so once")
    gs.edit(gd) { GoalEdit.mark(&$0) }
    say(gs.goal(gd)?.reached == false && gs.goal(gd)?.doneAt == 0 && gs.goal(gd)?.markedToday == false, "unmarking a day takes it back below its target")
    let gt = gs.addGoal(GoalParse.Draft(title: "Things", kind: .things, target: 3, due: GDay.add(GDay.today, 30), unit: ["time", "times"]))
    let firstThing = gs.goal(gt)?.things.first?.id ?? ""
    gs.edit(gt) { GoalEdit.nameThing(&$0, firstThing, "Visit Lisbon") }; gs.edit(gt) { GoalEdit.tick(&$0) }; var extra = ""; gs.edit(gt) { extra = GoalEdit.addThing(&$0, "Learn to juggle") }
    say(gs.goal(gt)?.things.count == 4 && gs.goal(gt)?.things.first?.done == GDay.today && gs.goal(gt)?.nextThing?.id != firstThing && gs.goal(gt)?.things.last?.id == extra && gs.goal(gt)?.sub.hasPrefix("1 of 4 things") == true, "a things goal: each one named, ticked with its day, more added (\(gs.goal(gt)?.sub ?? ""))")
    let gc = gs.addGoal(GoalParse.Draft(title: "Save", kind: .count, target: 2000, due: GDay.add(GDay.today, 60), unit: ["$", "$"]))
    gs.edit(gc) { GoalEdit.add(&$0, 250, note: "Birthday money") }; gs.edit(gc) { GoalEdit.add(&$0, 100) }; gs.edit(gc) { GoalEdit.undoToday(&$0) }
    say(gs.goal(gc)?.done == 250 && gs.goal(gc)?.num(1500) == "$1,500" && gs.goal(gc)?.step == 100 && gs.goal(gc)?.log.first?.note == "Birthday money" && gs.goal(gc)?.pace.text.hasSuffix("ahead of pace") == true, "a number goal adds up, takes back today's last, and says money as money (\(gs.goal(gc)?.pace.text ?? ""))")
    let behind = Goal(["id": "behind01", "kind": "days", "title": "Behind", "start": GDay.add(GDay.today, -20), "due": GDay.add(GDay.today, 9), "target": 30, "marks": [GDay.add(GDay.today, -1)]])!
    let slow = Goal(["id": "slow0001", "kind": "count", "title": "Books", "start": GDay.add(GDay.today, -100), "due": GDay.add(GDay.today, 100), "target": 12, "unit": ["book", "books"], "log": [["id": "a", "d": GDay.today, "a": 6]]])!
    say(behind.pace.behind && behind.pace.text == "20 behind" && behind.pace.hint == "Not enough days left for this target" && slow.pace.text == "On pace" && slow.pace.hint == "6 books to go", "ahead, on pace or behind, with what it takes (\(behind.pace.text): \(behind.pace.hint))")
    gs.flush()
    let gback = Store(file: gs.file), onDisk2 = (try? JSONSerialization.jsonObject(with: Data(contentsOf: gs.file))) as? Rec
    say(gback.goals == gs.goals && (onDisk2?["goals"] as? [Rec])?.count == 3 && gback.goals.first?.reached == false, "goals are written to the same Tasks file and read back the same")
    let gfresh = Store(file: dir.appendingPathComponent("goals2.sleek")); _ = try? gfresh.bring(gs.text)
    say(gfresh.goals.count == 3 && same(gfresh.kept(goal: gc), gs.kept(goal: gc)), "a copy of everything carries your goals")
    // between the apps: a widget writes to Siri's place, the app brings it in; deleted stays deleted
    let groot = dir.appendingPathComponent("goalshare"), gapp = Store(file: groot.appendingPathComponent("tasks/Tasks.sleek")); gapp.peers = [groot.appendingPathComponent("siri")]
    let wgoal = gapp.addGoal(GoalParse.Draft(title: "Run 5k", kind: .days, target: 30, due: GDay.add(GDay.today, 40), unit: ["time", "times"])); usleep(3000); let wc = gapp.addGoal(P("Read 12 books this year")); usleep(3000); let wt = gapp.addGoal(P("10 places this year")); gapp.flush()
    let wdat = WData.load(goal: wc, root: groot)
    say(wdat.goals.count == 3 && wdat.goal?.id == wc && WData.load(root: groot).goal?.id == wt, "the Goal widget shows the goal chosen for it, else the newest")
    SiriTasks.goalStep(wgoal, "mark", root: groot); SiriTasks.goalStep(wc, "add", root: groot); SiriTasks.goalStep(wt, "tick", root: groot)
    let after2 = WData.load(root: groot)
    say(after2.goals.first { $0.id == wgoal }?.markedToday == true && after2.goals.first { $0.id == wc }?.done == 1 && after2.goals.first { $0.id == wt }?.done == 1, "a tap on a widget marks today, adds one, or ticks the next thing")
    gapp.pull()
    say(gapp.goal(wgoal)?.markedToday == true && gapp.goal(wc)?.done == 1 && gapp.goal(wt)?.done == 1, "and Sleek Tasks brings those in from Siri's place")
    gapp.edit(wgoal) { GoalEdit.mark(&$0) }; gapp.removeGoal(wt); gapp.flush()
    let after3 = WData.load(root: groot)
    say(after3.goals.first { $0.id == wgoal }?.markedToday == false && !after3.goals.contains { $0.id == wt }, "what the app changes after wins, and a goal deleted in the app stays deleted on the widgets")
    say(WData.sampleGoals.count == 4 && WData.sampleGoals.allSatisfy { !$0.reached && $0.id.hasPrefix("sample") }, "the widget gallery shows sample goals of each kind, which cannot be changed")

    // every widget drawn, light and dark, with the sample and with what is in this Simulator, for a look (Documents/widgets-*.png)
    for (name, data) in [("sample", WData.sample), ("real", WData.load())] {
      for dark in [false, true] {
        func box<V: View>(_ w: CGFloat, _ h: CGFloat, pad: Bool = true, _ v: V) -> some View { v.tint(.primary).padding(pad ? 16 : 0).frame(width: w, height: h).background(WC.bg).clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous)) }
        let sheet = VStack(alignment: .leading, spacing: 18) {
          HStack(alignment: .top, spacing: 18) { box(170, 170, WSearchView(family: .systemSmall)); box(364, 170, WSitesView(d: data)); box(170, 170, WPrivateView(family: .systemSmall).environment(\.colorScheme, .dark)).environment(\.colorScheme, .dark); box(364, 382, WDayView(d: data)) }
          HStack(alignment: .top, spacing: 18) { box(170, 170, WGroceriesView(d: data, family: .systemSmall)); box(364, 170, WGroceriesView(d: data, family: .systemMedium)); box(364, 382, WAislesView(d: data)); box(170, 170, WDueView(d: data, family: .systemSmall)) }
          HStack(alignment: .top, spacing: 18) { box(364, 170, WDueView(d: data, family: .systemMedium)); box(364, 382, WBoardView(d: data)); box(170, 170, WRecentPageView(d: data, family: .systemSmall)); box(364, 170, WPagesView(d: data)) }
          HStack(alignment: .top, spacing: 18) { box(170, 170, WNewPageView(family: .systemSmall)); box(364, 382, pad: false, WPageView(d: data)); box(170, 170, pad: false, WRecentDeckView(d: data, family: .systemSmall)); box(364, 170, WDeckView(d: data)); box(364, 382, WDecksView(d: data)) }
          HStack(alignment: .top, spacing: 18) {
            ForEach(0..<1, id: \.self) { _ in
              WGroceriesView(d: data, family: .accessoryCircular).frame(width: 72, height: 72); WDueView(d: data, family: .accessoryCircular).frame(width: 72, height: 72); WSearchView(family: .accessoryCircular).frame(width: 72, height: 72); WPrivateView(family: .accessoryCircular).frame(width: 72, height: 72); WNewPageView(family: .accessoryCircular).frame(width: 72, height: 72)
              WDueView(d: data, family: .accessoryRectangular).frame(width: 166, height: 72); WRecentPageView(d: data, family: .accessoryRectangular).frame(width: 166, height: 72); WRecentDeckView(d: data, family: .accessoryRectangular).frame(width: 166, height: 72); WDueView(d: data, family: .accessoryInline).frame(width: 240, height: 30)
            }
          }.foregroundStyle(.white).padding(12).background(Color(white: 0.2), in: RoundedRectangle(cornerRadius: 22))
          // the goal widgets: one of each kind small, the days and number ones medium and large, the things one large, all goals, and the Lock Screen
          HStack(alignment: .top, spacing: 18) {
            ForEach(data.goals.prefix(3)) { g in var one = data; let _ = (one.goal = g); box(170, 170, WGoalView(d: one, family: .systemSmall)) }
            box(364, 170, WGoalView(d: data, family: .systemMedium)); box(364, 170, WGoalsView(d: data))
          }
          HStack(alignment: .top, spacing: 18) {
            ForEach(data.goals.prefix(3)) { g in var one = data; let _ = (one.goal = g); box(364, 382, WGoalView(d: one, family: .systemLarge)) }
            ForEach(data.goals.dropFirst(2).prefix(1)) { g in var one = data; let _ = (one.goal = g); box(364, 170, WGoalView(d: one, family: .systemMedium)) }
          }
          HStack(alignment: .top, spacing: 18) {
            ForEach(0..<1, id: \.self) { _ in
              WGoalView(d: data, family: .accessoryCircular).frame(width: 72, height: 72); WGoalView(d: data, family: .accessoryRectangular).frame(width: 166, height: 72); WGoalView(d: data, family: .accessoryInline).frame(width: 260, height: 30)
            }
          }.foregroundStyle(.white).padding(12).background(Color(white: 0.2), in: RoundedRectangle(cornerRadius: 22))
        }.padding(30).background(dark ? Color(white: 0.04) : wHex("#DCD8EA")).environment(\.colorScheme, dark ? .dark : .light)
        let r = ImageRenderer(content: sheet); r.scale = 1.5
        if let png = r.uiImage?.pngData(), let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first { try? png.write(to: docs.appendingPathComponent("widgets-\(name)-\(dark ? "dark" : "light").png")) }
      }
    }

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

// The widgets of the four Sleek apps: what they read, how they look, and the tick that works right on a widget.
//
// Every widget reads your work where the apps share it (Shared.swift): your tasks taken together from every app's copy
// by the rule Siri uses (Siri.swift), a short list of your pages and decks each app keeps beside its copy (glance.json,
// written by Work.swift), and the sites you go to most (sites.json, written by the Sleek browser). A tick on a widget is
// written to Siri's place in that folder, which every app brings in, so it shows up everywhere.
//
// Each app's widget extension compiles this file and has a small bundle of its own (Widgets/Bundle.swift) that names
// which of these widgets it offers. Sleek Tasks also compiles it into the app, to draw every widget in its own check.
import AppIntents
import SwiftUI
import WidgetKit

// ---------- what the widgets show ----------
struct WThing: Identifiable, Hashable { let id, title, board, color, aisle: String; let qty: Int; let late: Bool }
struct WList { let id, name, due: String; let left: [WThing]; let got: Int; var all: Int { left.count + got } }
struct WColumn: Identifiable { let id, name: String; let done: Bool; let count: Int; let top: [WThing] }
struct WBoard { let id, name, color: String; let columns: [WColumn]; let done, total: Int; let next: String }
struct WPage: Identifiable, Hashable { let id, title, peek: String; let at: Double }
struct WDeck: Identifiable, Hashable { let id, title, kicker, heading, mode, accent: String; let at: Double; let slides: Int }
struct WSite: Identifiable { var id: String { url }; let name, url, color, letter: String; let icon: UIImage? }
struct WPageBody { let id, title, kicker, opening, label, accent: String; let checks: [(String, Bool)]; let at: Double }

struct WData {
  var list: WList?
  var today: [WThing] = [], late: [WThing] = []
  var board: WBoard?
  var pages: [WPage] = [], decks: [WDeck] = []
  var sites: [WSite] = []
  var page: WPageBody?
  var deck: WDeck?
  /// Your goals (going first), and the one a Goal widget shows: the one chosen, else the newest still going.
  var goals: [Goal] = []
  var goal: Goal?
  var real = true

  /// Read what a widget needs. `board`, `page`, `deck`: what its owner chose for it (nil: the latest, or the busiest board).
  static func load(board: String? = nil, page: String? = nil, deck: String? = nil, goal: String? = nil, wantPage: Bool = false, root: URL? = Shared.root) -> WData {
    guard root != nil else { return .sample }
    var d = WData(), c = SiriTasks.read(root)
    c.settle()
    let t = SiriTasks.day()
    func thing(_ x: SiriTasks.R) -> WThing {
      let p = c.projects[x["project"] as? String ?? ""]
      return WThing(id: x["id"] as? String ?? "", title: x["title"] as? String ?? "", board: p?["name"] as? String ?? "", color: p?["color"] as? String ?? "#12A36A",
                    aisle: x["aisle"] as? String ?? "", qty: max(1, Int(SiriTasks.num(x["qty"]))), late: (x["due"] as? String ?? "") < t)
    }
    if let l = c.list(), let lid = l["id"] as? String {
      let all = c.things(lid), left = all.filter { !c.done($0) }
      let walk = Aisle.walk.map(\.id), by = Dictionary(grouping: left) { Aisle.of(id: $0["aisle"] as? String ?? "").id }
      d.list = WList(id: lid, name: l["name"] as? String ?? "Groceries", due: l["due"] as? String ?? "", left: walk.flatMap { by[$0] ?? [] }.map(thing), got: all.count - left.count)
    }
    d.today = c.due(t).map(thing); d.late = c.due(t, late: true).map(thing)
    d.board = WData.board(c, board)
    let g = WData.glance(root); d.pages = g.pages; d.decks = g.decks
    d.sites = WData.sites(root)
    if wantPage, let id = page ?? d.pages.first?.id { d.page = WData.body(id, root) }
    d.deck = deck.flatMap { id in d.decks.first { $0.id == id } } ?? d.decks.first
    d.goals = c.goalList; d.goal = goal.flatMap { id in d.goals.first { $0.id == id } } ?? d.goals.first { !$0.reached } ?? d.goals.first
    return d
  }

  /// The boards that are not grocery lists, busiest first.
  static func boards(_ c: SiriTasks.Copy) -> [(id: String, name: String)] {
    let open = Dictionary(grouping: c.tasks.values.filter { !c.done($0) }) { $0["project"] as? String ?? "" }.mapValues(\.count)
    return c.projects.values.filter { !c.isList($0) }
      .sorted { (open[$0["id"] as? String ?? ""] ?? 0, SiriTasks.at($0)) > (open[$1["id"] as? String ?? ""] ?? 0, SiriTasks.at($1)) }
      .map { ($0["id"] as? String ?? "", $0["name"] as? String ?? "Board") }
  }
  static func board(_ c: SiriTasks.Copy, _ chosen: String?) -> WBoard? {
    guard let id = chosen.flatMap({ c.projects[$0] != nil ? $0 : nil }) ?? boards(c).first?.id, let p = c.projects[id] else { return nil }
    let color = p["color"] as? String ?? "#12A36A", ts = c.things(id), t = SiriTasks.day()
    func thing(_ x: SiriTasks.R) -> WThing { WThing(id: x["id"] as? String ?? "", title: x["title"] as? String ?? "", board: "", color: (x["color"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? color, aisle: "", qty: 1, late: !(x["due"] as? String ?? "").isEmpty && (x["due"] as? String ?? "") < t) }
    let cols = c.columns(id).map { col -> WColumn in
      let cid = col["id"] as? String ?? "", done = col["done"] as? Bool ?? false
      var mine = ts.filter { ($0["status"] as? String) == cid }
      if done { mine.sort { SiriTasks.num($0["doneAt"]) > SiriTasks.num($1["doneAt"]) } }
      return WColumn(id: cid, name: col["name"] as? String ?? "", done: done, count: mine.count, top: mine.prefix(3).map(thing))
    }
    let doneN = ts.filter { c.done($0) }.count
    let next = ts.filter { !c.done($0) && !($0["due"] as? String ?? "").isEmpty }.sorted { ($0["due"] as? String ?? "") < ($1["due"] as? String ?? "") }.first
    return WBoard(id: id, name: p["name"] as? String ?? "Board", color: color, columns: Array(cols.prefix(3)), done: doneN, total: ts.count,
                  next: next.map { "\($0["title"] as? String ?? "") · \(WText.day($0["due"] as? String ?? ""))" } ?? (ts.isEmpty ? "Nothing on it yet" : "\(ts.count - doneN) still to do"))
  }

  /// Every page and deck the apps keep, newest first: the newest word on each wins, and what was deleted stays gone.
  static func place(_ root: URL?, _ app: String) -> URL? { root?.appendingPathComponent(app, isDirectory: true) }
  static func glance(_ root: URL? = Shared.root) -> (pages: [WPage], decks: [WDeck]) {
    var pages: [String: WPage] = [:], decks: [String: WDeck] = [:], gone: [String: Double] = [:]
    for app in ["browser", "docs", "slides"] {
      guard let dir = place(root, app) else { continue }
      for (k, v) in SiriTasks.json(dir.appendingPathComponent("gone.json")) ?? [:] { gone[k] = max(gone[k] ?? 0, SiriTasks.num(v)) }
      let g = SiriTasks.json(dir.appendingPathComponent("glance.json")) ?? [:]
      for p in g["pages"] as? [SiriTasks.R] ?? [] {
        guard let id = SiriTasks.ok(p["id"]) else { continue }; let at = SiriTasks.num(p["at"])
        if (pages[id]?.at ?? -1) < at || (pages[id]?.at == at && pages[id]?.peek.isEmpty == true) { pages[id] = WPage(id: id, title: (p["title"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? "Untitled page", peek: p["peek"] as? String ?? "", at: at) }
      }
      for x in g["decks"] as? [SiriTasks.R] ?? [] {
        guard let id = SiriTasks.ok(x["id"]) else { continue }; let at = SiriTasks.num(x["at"])
        if (decks[id]?.at ?? -1) < at || (decks[id]?.at == at && decks[id]?.heading.isEmpty == true) {      // the same deck: the copy with its cover words
          decks[id] = WDeck(id: id, title: (x["title"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? "Untitled deck", kicker: x["kicker"] as? String ?? "", heading: x["heading"] as? String ?? "",
                            mode: x["mode"] as? String ?? "dark", accent: x["accent"] as? String ?? "#7C5CFF", at: at, slides: Int(SiriTasks.num(x["slides"])))
        }
      }
    }
    return (pages.values.filter { (gone["page:" + $0.id] ?? 0) < $0.at }.sorted { $0.at > $1.at },
            decks.values.filter { (gone["deck:" + $0.id] ?? 0) < $0.at }.sorted { $0.at > $1.at })
  }

  /// The sites you go to most, as the Sleek browser last wrote them down (never from private tabs).
  static func sites(_ root: URL? = Shared.root) -> [WSite] {
    guard let dir = place(root, "browser"), let o = SiriTasks.json(dir.appendingPathComponent("sites.json")) else { return [] }
    return (o["sites"] as? [SiriTasks.R] ?? []).prefix(4).compactMap { s in
      guard let url = s["url"] as? String, let name = s["name"] as? String else { return nil }
      let icon = (s["icon"] as? String).flatMap { $0.range(of: "^[A-Za-z0-9._-]{1,80}$", options: .regularExpression) != nil ? UIImage(contentsOfFile: dir.appendingPathComponent("icons").appendingPathComponent($0).path) : nil }
      return WSite(name: name, url: url, color: s["color"] as? String ?? "#3A3A44", letter: String(name.prefix(1)).uppercased(), icon: icon)
    }
  }

  /// One page's cover line, its opening words and its first checklist, read from the newest copy of its file.
  static func body(_ id: String, _ root: URL? = Shared.root) -> WPageBody? {
    guard SiriTasks.ok(id) != nil else { return nil }
    var best: SiriTasks.R?
    for app in ["browser", "docs", "slides"] {
      if let o = SiriTasks.json(place(root, app)?.appendingPathComponent("pages").appendingPathComponent(id + ".sleek")), SiriTasks.num(o["updated"]) > SiriTasks.num(best?["updated"]) { best = o }
    }
    guard let o = best, let seed = o["seed"] as? SiriTasks.R, let doc = seed["doc"] as? SiriTasks.R else { return nil }
    func text(_ n: SiriTasks.R) -> String { (n["text"] as? String) ?? (n["content"] as? [SiriTasks.R] ?? []).map(text).joined() }
    let title = o["title"] as? String ?? "Untitled page"
    var kicker = "", opening: [String] = [], checks: [(String, Bool)] = [], label = "", lastHeading = ""
    for n in doc["content"] as? [SiriTasks.R] ?? [] {
      switch n["type"] as? String ?? "" {
      case "cover": kicker = (n["content"] as? [SiriTasks.R] ?? []).first.map(text) ?? ""
      case "heading": let h = text(n).trimmingCharacters(in: .whitespacesAndNewlines); if h != title { lastHeading = h }
      case "paragraph": let p = text(n).trimmingCharacters(in: .whitespacesAndNewlines); if !p.isEmpty && opening.count < 2 { opening.append(p) }
      case "task_list" where checks.isEmpty:
        label = lastHeading
        for i in (n["content"] as? [SiriTasks.R] ?? []).prefix(5) { checks.append((text(i), ((i["attrs"] as? SiriTasks.R)?["done"] as? Bool) ?? false)) }
      default: break
      }
    }
    let accent = ((seed["theme"] as? SiriTasks.R)?["accent"] as? String) ?? "#0A84FF"
    return WPageBody(id: id, title: title, kicker: kicker, opening: opening.joined(separator: " "), label: label.isEmpty ? "Checklist" : label, accent: accent, checks: checks, at: SiriTasks.num(o["updated"]))
  }

  /// What a widget shows before there is anything of yours (in the list of widgets, and the moment one is added).
  static var sample: WData {
    var d = WData(); d.real = false
    let g = [("Avocados", 3, "produce"), ("Spinach", 1, "produce"), ("Lemons", 4, "produce"), ("Milk", 1, "dairy"), ("Greek yogurt", 1, "dairy"), ("Butter", 1, "dairy"), ("Sourdough", 1, "bakery"), ("Oats", 1, "pantry"), ("Olive oil", 1, "pantry")]
    d.list = WList(id: "", name: "Groceries", due: SiriTasks.day(), left: g.map { WThing(id: "sample-" + $0.0, title: $0.0, board: "", color: "#12A36A", aisle: $0.2, qty: $0.1, late: false) }, got: 3)
    d.late = [WThing(id: "sample-dentist", title: "Book the dentist", board: "Home", color: "#FF9F0A", aisle: "", qty: 1, late: true)]
    d.today = [("Send the launch brief", "Work", "#7C5CFF"), ("Review the Q4 deck", "Work", "#7C5CFF"), ("Water the plants", "Home", "#FF9F0A")].map { WThing(id: "sample-" + $0.0, title: $0.0, board: $0.1, color: $0.2, aisle: "", qty: 1, late: false) }
    func card(_ s: String, _ c: String) -> WThing { WThing(id: "sample-" + s, title: s, board: "", color: c, aisle: "", qty: 1, late: false) }
    d.board = WBoard(id: "", name: "Kitchen redo", color: "#FF9F0A", columns: [
      WColumn(id: "a", name: "To do", done: false, count: 4, top: [card("Pick the grout", "#FF9F0A"), card("Book the plumber", "#0A84FF"), card("Order handles", "#FF9F0A")]),
      WColumn(id: "b", name: "Doing", done: false, count: 2, top: [card("Paint the ceiling", "#E5484D"), card("Measure for shelves", "#FF9F0A")]),
      WColumn(id: "c", name: "Done", done: true, count: 5, top: [card("Take out cabinets", "#12A36A"), card("Choose tiles", "#12A36A")])], done: 5, total: 11, next: "Tiles arrive Thursday")
    let now = Date().timeIntervalSince1970 * 1000
    d.pages = [WPage(id: "sample1", title: "Trip to Lisbon", peek: "Flights land Friday at 9:40. Day one: Alfama, the castle, and dinner at the place on the corner.", at: now - 2 * 36e5),
               WPage(id: "sample2", title: "Q4 plan", peek: "Three goals for the quarter: ship the iPhone apps, and keep every page fast.", at: now - 26 * 36e5),
               WPage(id: "sample3", title: "Reading notes", peek: "Chapter four: the shape of a good habit.", at: now - 60 * 36e5)]
    d.decks = [WDeck(id: "sample1", title: "Product launch", kicker: "Q4 review", heading: "Shipping faster, together", mode: "dark", accent: "#7C5CFF", at: now - 3 * 36e5, slides: 12),
               WDeck(id: "sample2", title: "Field trip", kicker: "Year 6", heading: "A day at the coast", mode: "light", accent: "#12A36A", at: now - 30 * 36e5, slides: 8),
               WDeck(id: "sample3", title: "Design crit", kicker: "Studio", heading: "What we learned this sprint", mode: "dark", accent: "#FF8EE0", at: now - 50 * 36e5, slides: 15),
               WDeck(id: "sample4", title: "Budget 2027", kicker: "Finance", heading: "Where the money goes", mode: "light", accent: "#FF9F0A", at: now - 80 * 36e5, slides: 9)]
    d.deck = d.decks.first
    d.page = WPageBody(id: "", title: "Q4 plan", kicker: "", opening: "Three goals for the quarter: ship the iPhone apps, get the first hundred people using Viewers, and keep every page fast.", label: "This week", accent: "#0A84FF",
                       checks: [("Draft the launch post", true), ("Record the walkthrough", false), ("Check pricing with two friends", false)], at: now - 26 * 36e5)
    d.sites = [("Wikipedia", "#3A3A44"), ("BBC", "#B4232A"), ("Weather", "#2F80ED")].map { WSite(name: $0.0, url: "https://example.com/" + $0.0, color: $0.1, letter: String($0.0.prefix(1)), icon: nil) }
    d.goals = WData.sampleGoals; d.goal = d.goals.first
    return d
  }

  /// Goals to show before there are any of yours: days, things and a number, part of the way along.
  static var sampleGoals: [Goal] {
    let t = SiriTasks.day()
    func day(_ n: Int) -> String { GDay.add(t, n) }
    let run: SiriTasks.R = ["id": "samplerun", "kind": "days", "title": "Run 5k", "color": "#12A36A", "start": day(-26), "due": day(46), "target": 30, "marks": [-25, -23, -21, -18, -16, -14, -11, -9, -7, -4, -2, -1].map(day), "created": 3]
    let names = ["Learn to make fresh pasta", "Run a 10k", "See the northern lights", "Visit Lisbon", "Call grandma every Sunday", "Learn three songs on guitar", "Read a book in Spanish", "Sleep under the stars", "Bake sourdough", "Try rock climbing", "A week without social media", "Volunteer at the food bank", "Paint something and hang it", "Swim in the sea in winter", "Host a dinner for eight", "Learn to juggle", "Watch a sunrise from a hill", "Write to my future self", "Fix the bike", "Take a pottery class"]
    let got: Set<Int> = [0, 1, 3, 4, 5, 7, 8, 9, 10, 11, 12, 14]
    let things: SiriTasks.R = ["id": "samplethings", "kind": "things", "title": "20 things before the new year", "color": "#7C5CFF", "start": day(-75), "due": day(46), "target": 20, "created": 2,
                               "items": names.enumerated().map { ["id": "samplei\($0.offset)", "t": $0.element, "done": got.contains($0.offset) ? day(-70 + $0.offset * 4) : ""] as SiriTasks.R }]
    let read: SiriTasks.R = ["id": "sampleread", "kind": "count", "title": "Read 12 books this year", "color": "#0A84FF", "start": day(-318), "due": day(46), "target": 12, "unit": ["book", "books"], "created": 1,
                             "log": [-298, -270, -236, -199, -160, -121, -80, -37, -13].map { ["id": "samplel\($0)", "d": day($0), "a": 1, "n": ""] as SiriTasks.R }]
    let spanish: SiriTasks.R = ["id": "samplespanish", "kind": "days", "title": "Practise Spanish", "color": "#FF7A45", "start": day(-45), "due": day(14), "target": 50, "created": 0,
                                "marks": (-45 ... -1).filter { ![-40, -33, -27, -20, -12, -5].contains($0) }.map(day)]
    return [run, things, read, spanish].compactMap(Goal.init)
  }
}

struct WGoalIntent: AppIntent {
  static let title: LocalizedStringResource = "Move a Goal On"
  static let isDiscoverable = false
  @Parameter(title: "Goal") var id: String
  @Parameter(title: "What") var act: String
  @Parameter(title: "Thing") var thing: String
  init() {}
  init(id: String, act: String, thing: String = "") { self.id = id; self.act = act; self.thing = thing }
  func perform() async throws -> some IntentResult { SiriTasks.goalStep(id, act, thing: thing); return .result() }
}

// ---------- ticking a task off, right on the widget ----------
extension SiriTasks {
  /// Tick a task off as the apps do (a repeating task moves on to its next day instead), written to Siri's place.
  @discardableResult static func tick(_ id: String, root: URL? = Shared.root) -> Bool {
    let c = read(root); guard let root, var t = c.tasks[id], let pid = t["project"] as? String, let p = c.projects[pid], !c.done(t) else { return false }
    let cols = c.columns(pid), t0 = now
    guard let doneCol = cols.first(where: { $0["done"] as? Bool ?? false })?["id"] as? String else { return false }
    let rep = t["rep"] as? String ?? ""
    if let next = WText.next(t["due"] as? String ?? "", rep) { t["due"] = next; t["lastDone"] = t0; t["subs"] = (t["subs"] as? [R] ?? []).map { ["id": $0["id"] ?? "", "t": $0["t"] ?? "", "done": false] as R } }
    else { t["was"] = t["status"] as? String ?? ""; t["status"] = doneCol; t["doneAt"] = t0 }
    t["updated"] = t0
    keep(project: p, task: t, usual: nil, root: root)
    return true
  }
}

struct WTickIntent: AppIntent {
  static let title: LocalizedStringResource = "Tick Off"
  static let isDiscoverable = false
  @Parameter(title: "Task") var id: String
  init() {}
  init(id: String) { self.id = id }
  func perform() async throws -> some IntentResult { SiriTasks.tick(id); return .result() }
}

// ---------- choosing a board, a page or a deck (press and hold the widget, Edit Widget) ----------
struct WBoardPick: AppEntity {
  let id: String
  let name: String
  static let typeDisplayRepresentation: TypeDisplayRepresentation = "Board"
  var displayRepresentation: DisplayRepresentation { DisplayRepresentation(title: "\(name)") }
  static let defaultQuery = WBoardQuery()
}
struct WBoardQuery: EntityQuery {
  func all() -> [WBoardPick] { WData.boards(SiriTasks.read()).map { WBoardPick(id: $0.id, name: $0.name) } }
  func entities(for ids: [String]) async throws -> [WBoardPick] { all().filter { ids.contains($0.id) } }
  func suggestedEntities() async throws -> [WBoardPick] { all() }
}
struct WPagePick: AppEntity {
  let id: String
  let name: String
  static let typeDisplayRepresentation: TypeDisplayRepresentation = "Page"
  var displayRepresentation: DisplayRepresentation { DisplayRepresentation(title: "\(name)") }
  static let defaultQuery = WPageQuery()
}
struct WPageQuery: EntityQuery {
  func all() -> [WPagePick] { WData.glance().pages.map { WPagePick(id: $0.id, name: $0.title) } }
  func entities(for ids: [String]) async throws -> [WPagePick] { all().filter { ids.contains($0.id) } }
  func suggestedEntities() async throws -> [WPagePick] { all() }
}
struct WDeckPick: AppEntity {
  let id: String
  let name: String
  static let typeDisplayRepresentation: TypeDisplayRepresentation = "Deck"
  var displayRepresentation: DisplayRepresentation { DisplayRepresentation(title: "\(name)") }
  static let defaultQuery = WDeckQuery()
}
struct WDeckQuery: EntityQuery {
  func all() -> [WDeckPick] { WData.glance().decks.map { WDeckPick(id: $0.id, name: $0.title) } }
  func entities(for ids: [String]) async throws -> [WDeckPick] { all().filter { ids.contains($0.id) } }
  func suggestedEntities() async throws -> [WDeckPick] { all() }
}
struct WGoalPick: AppEntity {
  let id: String
  let name: String
  static let typeDisplayRepresentation: TypeDisplayRepresentation = "Goal"
  var displayRepresentation: DisplayRepresentation { DisplayRepresentation(title: "\(name)") }
  static let defaultQuery = WGoalQuery()
}
struct WGoalQuery: EntityQuery {
  func all() -> [WGoalPick] { SiriTasks.read().goalList.map { WGoalPick(id: $0.id, name: $0.title) } }
  func entities(for ids: [String]) async throws -> [WGoalPick] { all().filter { ids.contains($0.id) } }
  func suggestedEntities() async throws -> [WGoalPick] { all() }
}
struct WChooseGoal: WidgetConfigurationIntent {
  static let title: LocalizedStringResource = "Choose a Goal"
  static let description = IntentDescription("The goal this widget shows. Leave it empty for your newest goal.")
  @Parameter(title: "Goal") var goal: WGoalPick?
  init() {}
}
struct WChooseBoard: WidgetConfigurationIntent {
  static let title: LocalizedStringResource = "Choose a Board"
  static let description = IntentDescription("The board this widget shows. Leave it empty for your busiest board.")
  @Parameter(title: "Board") var board: WBoardPick?
  init() {}
}
struct WChoosePage: WidgetConfigurationIntent {
  static let title: LocalizedStringResource = "Choose a Page"
  static let description = IntentDescription("The page this widget shows. Leave it empty for the one you edited last.")
  @Parameter(title: "Page") var page: WPagePick?
  init() {}
}
struct WChooseDeck: WidgetConfigurationIntent {
  static let title: LocalizedStringResource = "Choose a Deck"
  static let description = IntentDescription("The deck this widget shows. Leave it empty for the one you edited last.")
  @Parameter(title: "Deck") var deck: WDeckPick?
  init() {}
}

// ---------- timelines: read afresh whenever an app writes, every half hour, and at midnight for a new day ----------
struct WEntry: TimelineEntry { let date: Date; let d: WData }
private func wPolicy() -> TimelineReloadPolicy {
  let now = Date(), midnight = Calendar.current.startOfDay(for: now.addingTimeInterval(86400))
  return .after(min(now.addingTimeInterval(1800), midnight.addingTimeInterval(5)))
}
struct WPlain: TimelineProvider {
  var page = false
  func placeholder(in context: Context) -> WEntry { WEntry(date: Date(), d: .sample) }
  func getSnapshot(in context: Context, completion: @escaping (WEntry) -> Void) { completion(WEntry(date: Date(), d: WPlain.data(page, preview: context.isPreview))) }
  func getTimeline(in context: Context, completion: @escaping (Timeline<WEntry>) -> Void) { completion(Timeline(entries: [WEntry(date: Date(), d: WData.load(wantPage: page))], policy: wPolicy())) }
  /// In the list of widgets, your own work when there is some, else the sample.
  static func data(_ page: Bool, preview: Bool) -> WData { let d = WData.load(wantPage: page); return preview && d.list == nil && d.pages.isEmpty && d.decks.isEmpty && d.today.isEmpty ? .sample : d }
}
struct WBoardTimeline: AppIntentTimelineProvider {
  func placeholder(in context: Context) -> WEntry { WEntry(date: Date(), d: .sample) }
  func snapshot(for c: WChooseBoard, in context: Context) async -> WEntry { let d = WData.load(board: c.board?.id); return WEntry(date: Date(), d: context.isPreview && d.board == nil ? .sample : d) }
  func timeline(for c: WChooseBoard, in context: Context) async -> Timeline<WEntry> { Timeline(entries: [WEntry(date: Date(), d: WData.load(board: c.board?.id))], policy: wPolicy()) }
}
struct WPageTimeline: AppIntentTimelineProvider {
  func placeholder(in context: Context) -> WEntry { WEntry(date: Date(), d: .sample) }
  func snapshot(for c: WChoosePage, in context: Context) async -> WEntry { let d = WData.load(page: c.page?.id, wantPage: true); return WEntry(date: Date(), d: context.isPreview && d.pages.isEmpty ? .sample : d) }
  func timeline(for c: WChoosePage, in context: Context) async -> Timeline<WEntry> { Timeline(entries: [WEntry(date: Date(), d: WData.load(page: c.page?.id, wantPage: true))], policy: wPolicy()) }
}
struct WGoalTimeline: AppIntentTimelineProvider {
  func placeholder(in context: Context) -> WEntry { WEntry(date: Date(), d: .sample) }
  func snapshot(for c: WChooseGoal, in context: Context) async -> WEntry { let d = WData.load(goal: c.goal?.id); return WEntry(date: Date(), d: context.isPreview && d.goals.isEmpty ? .sample : d) }
  func timeline(for c: WChooseGoal, in context: Context) async -> Timeline<WEntry> { Timeline(entries: [WEntry(date: Date(), d: WData.load(goal: c.goal?.id))], policy: wPolicy()) }
}
struct WDeckTimeline: AppIntentTimelineProvider {
  func placeholder(in context: Context) -> WEntry { WEntry(date: Date(), d: .sample) }
  func snapshot(for c: WChooseDeck, in context: Context) async -> WEntry { let d = WData.load(deck: c.deck?.id); return WEntry(date: Date(), d: context.isPreview && d.decks.isEmpty ? .sample : d) }
  func timeline(for c: WChooseDeck, in context: Context) async -> Timeline<WEntry> { Timeline(entries: [WEntry(date: Date(), d: WData.load(deck: c.deck?.id))], policy: wPolicy()) }
}

// ---------- small things ----------
enum WText {
  static func ago(_ ms: Double) -> String {
    guard ms > 0 else { return "" }; let s = Date().timeIntervalSince1970 - ms / 1000
    if s < 60 { return "just now" }; if s < 3600 { return "\(Int(s / 60)) min ago" }; if s < 86400 { return "\(Int(s / 3600))h ago" }
    if s < 172800 { return "yesterday" }; let d = Date(timeIntervalSince1970: ms / 1000)
    return s < 6 * 86400 ? d.formatted(.dateTime.weekday(.wide)) : d.formatted(.dateTime.day().month(.abbreviated))
  }
  static func short(_ ms: Double) -> String { let a = ago(ms); return a.replacingOccurrences(of: " ago", with: "").replacingOccurrences(of: "yesterday", with: "Yesterday") }
  static func day(_ key: String) -> String {
    if key == SiriTasks.day() { return "today" }; if key == SiriTasks.day(1) { return "tomorrow" }; if key < SiriTasks.day() { return "late" }
    let p = key.split(separator: "-").compactMap { Int($0) }; guard p.count == 3, let d = Calendar.current.date(from: DateComponents(year: p[0], month: p[1], day: p[2])) else { return key }
    return d.formatted(.dateTime.weekday(.wide))
  }
  /// A repeating task's next day after the one it was due (as Sleek Tasks' Repeats), or nil when it does not repeat.
  static func next(_ due: String, _ rep: String) -> String? {
    guard ["daily", "weekdays", "weekly", "monthly", "yearly"].contains(rep) else { return nil }
    let cal = Calendar.current, today = cal.startOfDay(for: Date()), p = due.split(separator: "-").compactMap { Int($0) }
    var b = p.count == 3 ? cal.date(from: DateComponents(year: p[0], month: p[1], day: p[2])) ?? today : today
    let day0 = cal.component(.day, from: b)
    func step(_ d: Date) -> Date {
      switch rep {
      case "daily": return cal.date(byAdding: .day, value: 1, to: d)!
      case "weekly": return cal.date(byAdding: .day, value: 7, to: d)!
      case "weekdays": var x = cal.date(byAdding: .day, value: 1, to: d)!; while [1, 7].contains(cal.component(.weekday, from: x)) { x = cal.date(byAdding: .day, value: 1, to: x)! }; return x
      default:
        let m = cal.date(byAdding: rep == "yearly" ? .year : .month, value: 1, to: cal.date(from: DateComponents(year: cal.component(.year, from: d), month: cal.component(.month, from: d), day: 1))!)!
        let last = cal.range(of: .day, in: .month, for: m)!.count
        return cal.date(from: DateComponents(year: cal.component(.year, from: m), month: cal.component(.month, from: m), day: min(day0, last)))!
      }
    }
    repeat { b = step(b) } while b <= today
    let c = cal.dateComponents([.year, .month, .day], from: b)
    return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
  }
}

func wHex(_ s: String) -> Color {
  let v = UInt64(s.trimmingCharacters(in: CharacterSet(charactersIn: "#")).prefix(6), radix: 16) ?? 0x7C5CFF
  return Color(red: Double((v >> 16) & 255) / 255, green: Double((v >> 8) & 255) / 255, blue: Double(v & 255) / 255)
}
enum WC {
  static let tasks = wHex("#12A36A"), docs = wHex("#0A84FF"), slides = wHex("#7C5CFF"), late = wHex("#E5484D")
  static let a = wHex("#7E9CFF"), b = wHex("#B48CFF"), c = wHex("#FF8EE0")
  static let bg = Color(UIColor { $0.userInterfaceStyle == .dark ? UIColor(red: 0.11, green: 0.11, blue: 0.125, alpha: 1) : .white })
  static let fill = Color(UIColor { $0.userInterfaceStyle == .dark ? UIColor(red: 0.165, green: 0.165, blue: 0.19, alpha: 1) : UIColor(red: 0.945, green: 0.945, blue: 0.96, alpha: 1) })
  static let run = LinearGradient(colors: [a, b, c], startPoint: .leading, endPoint: .trailing)
}
enum WLink {
  static func browser(_ what: String, _ u: String? = nil) -> URL { var c = URLComponents(); c.scheme = "sleek-browser"; c.host = what; if let u { c.queryItems = [URLQueryItem(name: "u", value: u)] }; return c.url! }
  static func tasks(_ what: String, board: String? = nil) -> URL { var c = URLComponents(); c.scheme = "sleek-tasks"; c.host = what; if let board, !board.isEmpty { c.queryItems = [URLQueryItem(name: "board", value: board), URLQueryItem(name: "view", value: "shop")] }; return c.url! }
  static func app(_ scheme: String, _ what: String, _ id: String? = nil) -> URL { var c = URLComponents(); c.scheme = scheme; c.host = what; if let id, !id.isEmpty { c.queryItems = [URLQueryItem(name: "d", value: id)] }; return c.url! }
  static func docs(_ id: String) -> URL { id.isEmpty ? app("sleek-docs", "open") : app("sleek-docs", "open", id) }
  static func deck(_ id: String, present: Bool = false) -> URL { app("sleek-slides", present ? "present" : "open", id) }
  static func goal(_ id: String) -> URL { var c = URLComponents(); c.scheme = "sleek-tasks"; c.host = id.isEmpty || id.hasPrefix("sample") ? "goals" : "goal"; if !id.isEmpty && !id.hasPrefix("sample") { c.queryItems = [URLQueryItem(name: "id", value: id)] }; return c.url! }
}

/// Sleek's mark: two bars in its colour run.
struct WMark: View {
  var scale: CGFloat = 1, white = false
  var body: some View {
    VStack(alignment: .leading, spacing: 3 * scale) {
      Capsule().fill(white ? AnyShapeStyle(Color.white) : AnyShapeStyle(WC.run)).frame(width: 20 * scale, height: 7 * scale).offset(x: 6 * scale)
      Capsule().fill(white ? AnyShapeStyle(Color.white) : AnyShapeStyle(WC.run)).frame(width: 20 * scale, height: 7 * scale)
    }.frame(width: 26 * scale, alignment: .leading).widgetAccentable()
  }
}
struct WHead: View {
  let color: Color, title: String; var right: String = ""
  var body: some View {
    HStack(spacing: 6) {
      RoundedRectangle(cornerRadius: 3).fill(color).frame(width: 8, height: 8).widgetAccentable()
      Text(title).lineLimit(1)
      Spacer(minLength: 4)
      if !right.isEmpty { Text(right).foregroundStyle(.tertiary).lineLimit(1) }
    }.font(.system(size: 12, weight: .semibold)).foregroundStyle(.secondary)
  }
}
struct WRing: View {
  let frac: Double, color: Color, size: CGFloat, width: CGFloat; var label: String? = nil
  var body: some View {
    ZStack {
      Circle().stroke(Color.primary.opacity(0.1), lineWidth: width)
      Circle().trim(from: 0, to: max(0.001, min(1, frac))).stroke(color, style: StrokeStyle(lineWidth: width, lineCap: .round)).rotationEffect(.degrees(-90)).widgetAccentable()
      if let label { Text(label).font(.system(size: size * 0.36, weight: .bold, design: .rounded)).minimumScaleFactor(0.6) }
    }.frame(width: size, height: size)
  }
}
/// A task or a thing on the list, with a circle that ticks it off.
struct WTickRow: View {
  let t: WThing; let color: Color; var right: String? = nil; var rightColor: Color = .secondary; var size: CGFloat = 13.5
  var body: some View {
    HStack(spacing: 9) {
      Button(intent: WTickIntent(id: t.id)) { Circle().strokeBorder(Color.secondary.opacity(0.55), lineWidth: 1.7).frame(width: 20, height: 20).contentShape(Circle().inset(by: -6)) }.buttonStyle(.plain).disabled(t.id.isEmpty || t.id.hasPrefix("sample"))
      (Text(t.title).font(.system(size: size, weight: .medium)) + Text(t.qty > 1 ? "  ×\(t.qty)" : "").font(.system(size: size - 1.5)).foregroundColor(.secondary)).lineLimit(1)
      Spacer(minLength: 2)
      if let right { HStack(spacing: 4) { Circle().fill(wHex(t.color)).frame(width: 6, height: 6); Text(right).foregroundStyle(rightColor) }.font(.system(size: 11.5, weight: .semibold)) }
    }.frame(minHeight: 26).transition(.push(from: .bottom).combined(with: .opacity)).id(t.id + t.title)
  }
}
private struct WEmpty: View {
  let text: String
  var body: some View { Text(text).font(.system(size: 13)).foregroundStyle(.secondary).frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center) }
}

// ---------- Sleek (the browser) ----------
struct WSearchView: View {
  let family: WidgetFamily
  var body: some View {
    if family == .accessoryCircular {
      ZStack { AccessoryWidgetBackground(); Image(systemName: "magnifyingglass").font(.system(size: 22, weight: .semibold)) }.widgetURL(WLink.browser("search"))
    } else {
      VStack(alignment: .leading, spacing: 0) {
        WMark()
        Spacer(minLength: 0)
        Text("Search the web").font(.system(size: 17, weight: .bold))
        Text("or type an address").font(.system(size: 12)).foregroundStyle(.secondary).padding(.bottom, 10)
        HStack(spacing: 7) { Image(systemName: "magnifyingglass"); Text("Search") }.font(.system(size: 13.5, weight: .medium)).foregroundStyle(.secondary)
          .padding(.horizontal, 12).frame(maxWidth: .infinity, minHeight: 34, alignment: .leading).background(WC.fill, in: Capsule())
      }.frame(maxWidth: .infinity, alignment: .leading).widgetURL(WLink.browser("search"))
    }
  }
}
struct WSitesView: View {
  let d: WData
  private var tiles: [WSite] {
    var s = d.sites
    for (n, page, c) in [("Tasks", "tasks", "#12A36A"), ("Docs", "docs", "#0A84FF"), ("Slides", "slides", "#7C5CFF")] where s.count < 4 { s.append(WSite(name: n, url: "sleek://app/\(page).html", color: c, letter: "", icon: nil)) }
    return Array(s.prefix(4))
  }
  var body: some View {
    VStack(spacing: 12) {
      Link(destination: WLink.browser("search")) {
        HStack(spacing: 8) { WMark(scale: 0.7); Text("Search or type an address").font(.system(size: 13.5, weight: .medium)).foregroundStyle(.secondary); Spacer() }
          .padding(.horizontal, 13).frame(height: 40).background(WC.fill, in: Capsule())
      }
      HStack(spacing: 6) {
        ForEach(tiles) { s in
          Link(destination: WLink.browser("open", s.url)) {
            VStack(spacing: 5) {
              ZStack {
                RoundedRectangle(cornerRadius: 15, style: .continuous).fill(wHex(s.color).gradient)
                if let i = s.icon { Image(uiImage: i).resizable().scaledToFit().clipShape(RoundedRectangle(cornerRadius: 9, style: .continuous)).padding(10) }
                else if s.letter.isEmpty { WMark(scale: 0.8, white: true) } else { Text(s.letter).font(.system(size: 21, weight: .bold)).foregroundStyle(.white) }
              }.frame(width: 52, height: 52).widgetAccentable()
              Text(s.name).font(.system(size: 11, weight: .semibold)).foregroundStyle(.secondary).lineLimit(1)
            }.frame(maxWidth: .infinity)
          }
        }
      }
    }
  }
}
struct WPrivateView: View {
  let family: WidgetFamily
  private var glasses: some View {
    HStack(spacing: 4) { Circle().stroke(lineWidth: 2.2).frame(width: 13, height: 13); Rectangle().frame(width: 5, height: 2); Circle().stroke(lineWidth: 2.2).frame(width: 13, height: 13) }
  }
  var body: some View {
    if family == .accessoryCircular {
      ZStack { AccessoryWidgetBackground(); glasses }.widgetURL(WLink.browser("private"))
    } else {
      VStack(alignment: .leading, spacing: 2) {
        glasses.foregroundStyle(Color(white: 0.75)).scaleEffect(1.3, anchor: .topLeading)
        Spacer(minLength: 0)
        Text("Private tab").font(.system(size: 17, weight: .bold)).foregroundStyle(.white)
        Text("Nothing kept when you close it").font(.system(size: 12)).foregroundStyle(Color(white: 0.62))
      }.frame(maxWidth: .infinity, alignment: .leading).widgetURL(WLink.browser("private"))
    }
  }
}
struct WDayView: View {
  let d: WData
  var body: some View {
    VStack(alignment: .leading, spacing: 9) {
      HStack(spacing: 6) { WMark(scale: 0.6); Text("Your day").foregroundStyle(.secondary); Spacer(); Text(Date().formatted(.dateTime.weekday(.wide).day())).foregroundStyle(.tertiary) }.font(.system(size: 12, weight: .semibold))
      Link(destination: WLink.browser("open", "sleek://app/tasks.html")) {
        VStack(alignment: .leading, spacing: 3) {
          HStack(spacing: 6) { RoundedRectangle(cornerRadius: 2).fill(WC.late).frame(width: 7, height: 7); Text("TODAY").font(.system(size: 11, weight: .bold)).tracking(0.4).foregroundStyle(.secondary) }
          let rows = Array((d.late + d.today).prefix(3))
          if rows.isEmpty { Text("Nothing due. Enjoy it.").font(.system(size: 13)).foregroundStyle(.secondary).frame(minHeight: 22) }
          ForEach(rows) { t in
            HStack(spacing: 8) { Circle().fill(wHex(t.color)).frame(width: 7, height: 7); Text(t.title).font(.system(size: 13, weight: .medium)).lineLimit(1); Spacer(minLength: 2); Text(t.late ? "Late" : t.board).font(.system(size: 11.5)).foregroundStyle(t.late ? WC.late : Color.secondary) }.frame(minHeight: 21)
          }
        }
      }
      if let l = d.list {
        Link(destination: WLink.browser("open", "sleek://app/tasks.html#/\(l.id)/shop")) {
          HStack(spacing: 12) {
            WRing(frac: l.all == 0 ? 0 : Double(l.got) / Double(l.all), color: WC.tasks, size: 34, width: 4)
            VStack(alignment: .leading, spacing: 0) { Text(l.name).font(.system(size: 13.5, weight: .bold)); Text(l.left.isEmpty ? "All in the basket" : "\(l.left.count) left" + (l.due.isEmpty ? "" : " · for \(WText.day(l.due))")).font(.system(size: 12)).foregroundStyle(.secondary) }
            Spacer(); Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(.tertiary)
          }.padding(.horizontal, 12).padding(.vertical, 9).background(WC.fill, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
      }
      HStack(spacing: 6) { RoundedRectangle(cornerRadius: 2).fill(WC.b).frame(width: 7, height: 7); Text("WHERE YOU LEFT OFF").font(.system(size: 11, weight: .bold)).tracking(0.4).foregroundStyle(.secondary) }
      HStack(spacing: 8) {
        if let k = d.decks.first { Link(destination: WLink.browser("open", "sleek://app/deck.html?d=\(k.id)")) { WSlide(deck: k, scale: 0.9) } }
        if let p = d.pages.first { Link(destination: WLink.browser("open", "sleek://app/doc.html?d=\(p.id)")) { WSheet(page: p) } }
        if d.decks.isEmpty && d.pages.isEmpty { WEmpty(text: "Your pages and decks show here") }
      }.frame(maxHeight: .infinity)
    }
  }
}

// ---------- Sleek Tasks ----------
struct WGroceriesView: View {
  let d: WData, family: WidgetFamily
  private var frac: Double { guard let l = d.list, l.all > 0 else { return 0 }; return Double(l.got) / Double(l.all) }
  private var link: URL { WLink.tasks("open", board: d.list?.id) }
  var body: some View {
    switch family {
    case .accessoryCircular:
      ZStack { AccessoryWidgetBackground(); WRing(frac: frac, color: .primary, size: 54, width: 4.5); VStack(spacing: -1) { Text("\(d.list?.left.count ?? 0)").font(.system(size: 19, weight: .bold, design: .rounded)); Text("LEFT").font(.system(size: 8, weight: .bold)).opacity(0.8) } }.widgetURL(link)
    case .systemMedium:
      HStack(spacing: 14) {
        Link(destination: link) {
          VStack(alignment: .leading, spacing: 0) {
            WHead(color: WC.tasks, title: d.list?.name ?? "Groceries")
            Spacer(minLength: 0)
            WRing(frac: frac, color: WC.tasks, size: 58, width: 6, label: "\(d.list?.left.count ?? 0)")
            Text(d.list.map { $0.left.isEmpty ? "All done" : "\($0.left.count) left" } ?? "No list").font(.system(size: 12)).foregroundStyle(.secondary).padding(.top, 6)
          }.frame(width: 100, alignment: .leading)
        }
        VStack(alignment: .leading, spacing: 4) {
          if let l = d.list, !l.left.isEmpty { ForEach(l.left.prefix(4)) { WTickRow(t: $0, color: WC.tasks) } }
          else { WEmpty(text: d.list == nil ? "No grocery list yet" : "Everything is in the basket.") }
        }.frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
      }
    default:
      VStack(alignment: .leading, spacing: 0) {
        WHead(color: WC.tasks, title: d.list?.name ?? "Groceries")
        HStack(spacing: 10) {
          WRing(frac: frac, color: WC.tasks, size: 54, width: 6, label: "\(d.list?.left.count ?? 0)")
          VStack(alignment: .leading, spacing: 0) { Text("left").font(.system(size: 14, weight: .bold)); Text(d.list.map { $0.due.isEmpty ? "on the list" : "for \(WText.day($0.due))" } ?? "no list yet").font(.system(size: 12)).foregroundStyle(.secondary) }
        }.padding(.top, 10)
        Spacer(minLength: 0)
        VStack(alignment: .leading, spacing: 1) { ForEach((d.list?.left ?? []).prefix(3)) { Text($0.title).lineLimit(1) } }.font(.system(size: 12.5, weight: .medium))
        if d.list?.left.isEmpty == true { Text("All done. Nice.").font(.system(size: 12.5)).foregroundStyle(.secondary) }
      }.frame(maxWidth: .infinity, alignment: .leading).widgetURL(link)
    }
  }
}
struct WAislesView: View {
  let d: WData
  var body: some View {
    VStack(alignment: .leading, spacing: 2) {
      WHead(color: WC.tasks, title: (d.list?.name ?? "Groceries") + (d.list.map { $0.due.isEmpty ? "" : " · \(WText.day($0.due))" } ?? ""), right: d.list.map { "\($0.left.count) left" } ?? "")
      VStack(alignment: .leading, spacing: 1) {
        if let l = d.list, !l.left.isEmpty {
          let groups = WAislesView.groups(l.left)
          ForEach(groups, id: \.0.id) { a, xs in
            HStack(spacing: 6) { RoundedRectangle(cornerRadius: 2).fill(wHex(a.color)).frame(width: 7, height: 7); Text(a.name.uppercased()).font(.system(size: 11, weight: .bold)).tracking(0.3).foregroundStyle(.secondary) }.padding(.top, 5)
            ForEach(xs) { WTickRow(t: $0, color: WC.tasks) }
          }
        } else { WEmpty(text: d.list == nil ? "No grocery list yet" : "Everything is in the basket.") }
      }.frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading).clipped()
      HStack(spacing: 8) {
        Link(destination: WLink.tasks("add", board: d.list?.id)) { Label("Add", systemImage: "plus").font(.system(size: 13, weight: .semibold)).foregroundStyle(.white).frame(maxWidth: .infinity, minHeight: 34).background(WC.tasks, in: Capsule()) }
        Link(destination: WLink.tasks("open", board: d.list?.id)) { Label("Shop", systemImage: "cart").font(.system(size: 13, weight: .semibold)).frame(maxWidth: .infinity, minHeight: 34).background(WC.fill, in: Capsule()) }
      }.padding(.top, 4)
    }
  }
  /// By aisle, as many as fit (an aisle's name takes a line too).
  static func groups(_ left: [WThing], room: Int = 11) -> [(Aisle, [WThing])] {
    var out: [(Aisle, [WThing])] = [], lines = 0
    for a in Aisle.walk {
      let xs = left.filter { Aisle.of(id: $0.aisle).id == a.id }; if xs.isEmpty || lines + 2 > room { continue }
      let n = min(xs.count, room - lines - 1); out.append((a, Array(xs.prefix(n)))); lines += n + 1
    }
    return out
  }
}
struct WDueView: View {
  let d: WData, family: WidgetFamily
  private var next: WThing? { d.today.first ?? d.late.first }
  var body: some View {
    switch family {
    case .accessoryCircular:
      ZStack { AccessoryWidgetBackground(); VStack(spacing: -1) { Text("\(d.today.count + d.late.count)").font(.system(size: 20, weight: .bold, design: .rounded)); Text("DUE").font(.system(size: 8, weight: .bold)).opacity(0.8) } }.widgetURL(WLink.tasks("today"))
    case .accessoryInline:
      Label("\(d.today.count + d.late.count) due" + (d.list.map { " · \($0.left.count) groceries" } ?? ""), systemImage: "checkmark").widgetURL(WLink.tasks("today"))
    case .accessoryRectangular:
      VStack(alignment: .leading, spacing: 0) {
        Label("Next · Sleek Tasks", systemImage: "checkmark").font(.system(size: 11.5, weight: .bold)).opacity(0.75)
        Text(next?.title ?? "Nothing left today").font(.system(size: 14, weight: .semibold)).lineLimit(1)
        Text(next.map { $0.late ? "Late" : "Due today" } ?? "Enjoy it").font(.system(size: 11.5)).opacity(0.7)
      }.frame(maxWidth: .infinity, alignment: .leading).widgetURL(WLink.tasks("today"))
    case .systemMedium:
      VStack(alignment: .leading, spacing: 3) {
        Link(destination: WLink.tasks("today")) { WHead(color: WC.tasks, title: "Due today", right: "\(d.today.count)" + (d.late.isEmpty ? "" : " · \(d.late.count) late")) }
        VStack(alignment: .leading, spacing: 2) {
          let rows = Array((d.late + d.today).prefix(4))
          if rows.isEmpty { WEmpty(text: "Nothing left today.") }
          ForEach(rows) { t in WTickRow(t: t, color: wHex(t.color), right: t.late ? "Late" : t.board, rightColor: t.late ? WC.late : .secondary) }
        }.frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
      }
    default:
      VStack(alignment: .leading, spacing: 0) {
        WHead(color: WC.tasks, title: "Due today")
        HStack(alignment: .firstTextBaseline, spacing: 8) {
          Text("\(d.today.count)").font(.system(size: 38, weight: .bold, design: .rounded))
          Text(d.late.isEmpty ? "all on time" : "+\(d.late.count) late").font(.system(size: 13, weight: .semibold)).foregroundStyle(d.late.isEmpty ? Color.secondary : WC.late)
        }.padding(.top, 6)
        Spacer(minLength: 0)
        Text("NEXT").font(.system(size: 11, weight: .semibold)).tracking(0.5).foregroundStyle(.secondary)
        Text(next?.title ?? "Nothing left today").font(.system(size: 13.5, weight: .bold)).lineLimit(1)
        if let n = next { HStack(spacing: 5) { Circle().fill(wHex(n.color)).frame(width: 7, height: 7); Text(n.board) }.font(.system(size: 12)).foregroundStyle(.secondary) }
      }.frame(maxWidth: .infinity, alignment: .leading).widgetURL(WLink.tasks("today"))
    }
  }
}
struct WBoardView: View {
  let d: WData
  var body: some View {
    if let b = d.board {
      VStack(alignment: .leading, spacing: 10) {
        WHead(color: wHex(b.color), title: b.name, right: "Board")
        HStack(spacing: 12) {
          WRing(frac: b.total == 0 ? 0 : Double(b.done) / Double(b.total), color: wHex(b.color), size: 44, width: 5)
          VStack(alignment: .leading, spacing: 0) { Text("\(b.done) of \(b.total) done").font(.system(size: 15, weight: .bold)); Text(b.next).font(.system(size: 12)).foregroundStyle(.secondary).lineLimit(1) }
        }
        HStack(alignment: .top, spacing: 8) {
          ForEach(b.columns) { col in
            VStack(alignment: .leading, spacing: 6) {
              HStack { Text(col.name).lineLimit(1); Spacer(minLength: 2); Text("\(col.count)") }.font(.system(size: 11, weight: .bold)).foregroundStyle(.secondary)
              ForEach(col.top) { t in
                VStack(alignment: .leading, spacing: 5) { Capsule().fill(wHex(t.color)).frame(width: 22, height: 4).widgetAccentable(); Text(t.title).font(.system(size: 11.5, weight: .semibold)).lineLimit(2).strikethrough(col.done).foregroundStyle(col.done ? Color.secondary : Color.primary) }
                  .padding(.horizontal, 8).padding(.vertical, 7).frame(maxWidth: .infinity, alignment: .leading).background(WC.bg, in: RoundedRectangle(cornerRadius: 9, style: .continuous))
              }
              Spacer(minLength: 0)
            }.padding(8).frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading).background(WC.fill, in: RoundedRectangle(cornerRadius: 13, style: .continuous))
          }
        }
      }.widgetURL(WLink.tasks("open", board: b.id).replacingQuery(view: nil))
    } else { WEmpty(text: "Make a board in Sleek Tasks").widgetURL(WLink.tasks("today")) }
  }
}
extension URL {
  /// The same address without its view= part (a board opens as a board, not in Shop).
  func replacingQuery(view: String?) -> URL { guard var c = URLComponents(url: self, resolvingAgainstBaseURL: false) else { return self }; c.queryItems = c.queryItems?.filter { $0.name != "view" }; return c.url ?? self }
}

// ---------- Sleek Docs ----------
/// A page drawn small: a strip of its colour, its title, its opening words.
struct WSheet: View {
  let page: WPage; var lines = 6
  var body: some View {
    VStack(alignment: .leading, spacing: 5) {
      Capsule().fill(WC.docs).frame(width: 26, height: 4).widgetAccentable()
      Text(page.title).font(.system(size: 12.5, weight: .bold)).lineLimit(2)
      Text(page.peek.isEmpty ? " " : page.peek).font(.system(size: 9.5)).foregroundStyle(Color(white: 0.3)).lineSpacing(1.5).lineLimit(lines)
      Spacer(minLength: 0)
    }.foregroundStyle(Color(white: 0.09)).padding(.horizontal, 11).padding(.vertical, 10).frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
      .background(wHex("#FBFBFD"), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
      .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(Color.black.opacity(0.06), lineWidth: 0.5))
  }
}
struct WRecentPageView: View {
  let d: WData, family: WidgetFamily
  private var p: WPage? { d.page.map { b in WPage(id: b.id, title: b.title, peek: d.pages.first { $0.id == b.id }?.peek ?? b.opening, at: b.at) } ?? d.pages.first }
  var body: some View {
    if family == .accessoryRectangular {
      VStack(alignment: .leading, spacing: 0) {
        Label("Sleek Docs", systemImage: "text.alignleft").font(.system(size: 11.5, weight: .bold)).opacity(0.75)
        Text(p?.title ?? "No pages yet").font(.system(size: 14, weight: .semibold)).lineLimit(1)
        Text(p.map { "Edited " + WText.ago($0.at) } ?? "Start one in Sleek Docs").font(.system(size: 11.5)).opacity(0.7)
      }.frame(maxWidth: .infinity, alignment: .leading).widgetURL(WLink.docs(p?.id ?? ""))
    } else if let p {
      VStack(alignment: .leading, spacing: 8) {
        WSheet(page: p, lines: 5)
        WHead(color: WC.docs, title: "Edited " + WText.ago(p.at)).padding(.horizontal, 3)
      }.widgetURL(WLink.docs(p.id))
    } else { WEmpty(text: "Your latest page shows here").widgetURL(WLink.app("sleek-docs", "new")) }
  }
}
struct WPagesView: View {
  let d: WData
  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      HStack {
        WHead(color: WC.docs, title: "Recent pages")
        Link(destination: WLink.app("sleek-docs", "new")) { Label("New", systemImage: "plus").font(.system(size: 12, weight: .semibold)).foregroundStyle(WC.docs) }
      }
      if d.pages.isEmpty { WEmpty(text: "No pages yet") }
      VStack(spacing: 0) {
        ForEach(d.pages.prefix(3)) { p in
          Link(destination: WLink.docs(p.id)) {
            HStack(spacing: 10) {
              Image(systemName: "text.alignleft").font(.system(size: 13, weight: .semibold)).foregroundStyle(WC.docs).frame(width: 28, height: 28).background(WC.docs.opacity(0.14), in: RoundedRectangle(cornerRadius: 8, style: .continuous)).widgetAccentable()
              VStack(alignment: .leading, spacing: 0) { Text(p.title).font(.system(size: 13.5, weight: .bold)).lineLimit(1); Text(p.peek).font(.system(size: 11.5)).foregroundStyle(.secondary).lineLimit(1) }
              Spacer(minLength: 2)
              Text(WText.short(p.at)).font(.system(size: 11.5)).foregroundStyle(.tertiary)
            }.frame(maxHeight: .infinity)
          }
        }
      }
    }
  }
}
struct WNewPageView: View {
  let family: WidgetFamily
  var body: some View {
    if family == .accessoryCircular {
      ZStack { AccessoryWidgetBackground(); Image(systemName: "doc.badge.plus").font(.system(size: 22, weight: .medium)) }.widgetURL(WLink.app("sleek-docs", "new"))
    } else {
      VStack(alignment: .leading, spacing: 2) {
        Image(systemName: "plus").font(.system(size: 22, weight: .bold)).foregroundStyle(.white).frame(width: 44, height: 44).background(WC.docs, in: RoundedRectangle(cornerRadius: 14, style: .continuous)).widgetAccentable()
        Spacer(minLength: 0)
        Text("New page").font(.system(size: 17, weight: .bold))
        Text("Start writing straight away").font(.system(size: 12)).foregroundStyle(.secondary)
      }.frame(maxWidth: .infinity, alignment: .leading).widgetURL(WLink.app("sleek-docs", "new"))
    }
  }
}
struct WPageView: View {
  let d: WData
  var body: some View {
    if let b = d.page {
      VStack(alignment: .leading, spacing: 0) {
        LinearGradient(colors: [WC.docs, wHex(b.accent), WC.b], startPoint: .topLeading, endPoint: .bottomTrailing).frame(height: 70)
          .overlay(alignment: .bottomLeading) { if !b.kicker.isEmpty { Text(b.kicker.uppercased()).font(.system(size: 10, weight: .bold)).tracking(1).foregroundStyle(.white.opacity(0.85)).padding(.horizontal, 16).padding(.bottom, 9) } }
          .widgetAccentable()
        VStack(alignment: .leading, spacing: 7) {
          Text(b.title).font(.system(size: 19, weight: .bold)).lineLimit(1)
          if !b.opening.isEmpty { Text(b.opening).font(.system(size: 12.5)).foregroundStyle(.secondary).lineSpacing(2).lineLimit(b.checks.isEmpty ? 8 : 3) }
          if !b.checks.isEmpty {
            HStack(spacing: 6) { RoundedRectangle(cornerRadius: 2).fill(WC.docs).frame(width: 7, height: 7); Text(b.label.uppercased()).font(.system(size: 11, weight: .bold)).tracking(0.3).foregroundStyle(.secondary).lineLimit(1) }.padding(.top, 3)
            ForEach(Array(b.checks.prefix(4).enumerated()), id: \.offset) { _, c in
              HStack(spacing: 9) {
                ZStack { Circle().strokeBorder(c.1 ? WC.docs : Color.secondary.opacity(0.55), lineWidth: 1.7).background(Circle().fill(c.1 ? WC.docs : .clear)); if c.1 { Image(systemName: "checkmark").font(.system(size: 10, weight: .bold)).foregroundStyle(.white) } }.frame(width: 20, height: 20)
                Text(c.0).font(.system(size: 13.5, weight: .medium)).strikethrough(c.1).foregroundStyle(c.1 ? Color.secondary : Color.primary).lineLimit(1)
              }
            }
          }
          Spacer(minLength: 0)
          WHead(color: WC.docs, title: "Edited " + WText.ago(b.at))
        }.padding(.horizontal, 16).padding(.top, 12).padding(.bottom, 14)
      }.widgetURL(WLink.docs(b.id))
    } else { WEmpty(text: "Your page shows here").padding().widgetURL(WLink.app("sleek-docs", "new")) }
  }
}

// ---------- Sleek Slides ----------
/// A deck's cover drawn small: its look, a glow in its colour, the line above and the heading.
struct WSlide: View {
  let deck: WDeck; var scale: CGFloat = 1; var footer: String? = nil
  var body: some View {
    let light = deck.mode == "light", ink: Color = light ? wHex("#15131C") : .white, a = wHex(deck.accent)
    ZStack(alignment: .bottomLeading) {
      (light ? wHex("#F6F4FB") : wHex("#0D0B14"))
      GeometryReader { g in
        Circle().fill(a).frame(width: g.size.width * 0.75).blur(radius: 26 * scale).opacity(light ? 0.45 : 0.7).offset(x: g.size.width * 0.45, y: -g.size.height * 0.35)
        Circle().fill(WC.c).frame(width: g.size.width * 0.45).blur(radius: 28 * scale).opacity(0.3).offset(x: -g.size.width * 0.12, y: g.size.height * 0.7)
      }
      VStack(alignment: .leading, spacing: 3 * scale) {
        if !deck.kicker.isEmpty { Text(deck.kicker.uppercased()).font(.system(size: 8.5 * scale, weight: .bold)).tracking(1.2 * scale).opacity(0.7) }
        Text(deck.heading.isEmpty ? deck.title : deck.heading).font(.system(size: 15 * scale, weight: .bold)).lineLimit(3).minimumScaleFactor(0.8)
        if let footer { Text(footer).font(.system(size: 11 * scale, weight: .semibold)).opacity(0.65).padding(.top, 3) }
      }.foregroundStyle(ink).padding(12 * scale)
    }
    .overlay(alignment: .topTrailing) { if deck.slides > 0 { Text("\(deck.slides)").font(.system(size: 10 * scale, weight: .bold)).foregroundStyle(ink).padding(.horizontal, 7).padding(.vertical, 2).background(ink.opacity(0.16), in: Capsule()).padding(9 * scale) } }
    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    .widgetAccentable()
  }
}
struct WRecentDeckView: View {
  let d: WData, family: WidgetFamily
  var body: some View {
    if family == .accessoryRectangular {
      VStack(alignment: .leading, spacing: 0) {
        Label("Sleek Slides", systemImage: "play.rectangle").font(.system(size: 11.5, weight: .bold)).opacity(0.75)
        Text(d.deck?.title ?? "No decks yet").font(.system(size: 14, weight: .semibold)).lineLimit(1)
        Text(d.deck == nil ? "Make one in Sleek Slides" : "Tap to present").font(.system(size: 11.5)).opacity(0.7)
      }.frame(maxWidth: .infinity, alignment: .leading).widgetURL(d.deck.map { WLink.deck($0.id, present: true) } ?? WLink.app("sleek-slides", "new"))
    } else if let k = d.deck {
      WSlide(deck: k, scale: 1.25, footer: "\(k.title) · edited \(WText.ago(k.at))").clipShape(Rectangle()).widgetURL(WLink.deck(k.id))
    } else { WEmpty(text: "Your latest deck shows here").padding().widgetURL(WLink.app("sleek-slides", "new")) }
  }
}
struct WDeckView: View {
  let d: WData
  var body: some View {
    if let k = d.deck {
      HStack(spacing: 14) {
        Link(destination: WLink.deck(k.id)) { WSlide(deck: k).frame(width: 180) }
        VStack(alignment: .leading, spacing: 0) {
          WHead(color: WC.slides, title: "Slides")
          Text(k.title).font(.system(size: 15, weight: .bold)).lineLimit(2).padding(.top, 6)
          Text("\(k.slides) slide\(k.slides == 1 ? "" : "s") · edited \(WText.ago(k.at))").font(.system(size: 12)).foregroundStyle(.secondary).lineLimit(1)
          Spacer(minLength: 0)
          Link(destination: WLink.deck(k.id, present: true)) { Label("Present", systemImage: "play.fill").font(.system(size: 13, weight: .semibold)).foregroundStyle(.white).frame(maxWidth: .infinity, minHeight: 34).background(WC.slides, in: Capsule()).widgetAccentable() }
        }.padding(.vertical, 3)
      }
    } else { WEmpty(text: "Your latest deck shows here").widgetURL(WLink.app("sleek-slides", "new")) }
  }
}
struct WDecksView: View {
  let d: WData
  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack {
        WHead(color: WC.slides, title: "Your decks")
        Link(destination: WLink.app("sleek-slides", "new")) { Label("New", systemImage: "plus").font(.system(size: 12, weight: .semibold)).foregroundStyle(WC.slides) }
      }
      if d.decks.isEmpty { WEmpty(text: "No decks yet") }
      Grid(horizontalSpacing: 10, verticalSpacing: 10) {
        ForEach(0..<2, id: \.self) { r in
          GridRow {
            ForEach(0..<2, id: \.self) { c in
              let i = r * 2 + c
              if i < d.decks.count {
                let k = d.decks[i]
                Link(destination: WLink.deck(k.id)) {
                  VStack(alignment: .leading, spacing: 5) { WSlide(deck: k, scale: 0.82); Text(k.title).font(.system(size: 12, weight: .semibold)).lineLimit(1).padding(.leading, 2) }
                }
              } else { Color.clear }
            }
          }
        }
      }
    }
  }
}

// ---------- Goals (Sleek Tasks) ----------
/// What one tap does on a goal widget: mark today, add one, or tick the next thing.
struct WGoalAction: View {
  let g: Goal; var compact = false
  var body: some View {
    let c = wHex(g.color)
    switch g.kind {
    case .days:
      let did = g.markedToday
      Button(intent: WGoalIntent(id: g.id, act: "mark")) {
        HStack(spacing: 5) { if did { Image(systemName: "checkmark").font(.system(size: 12, weight: .bold)) }; Text(did ? "Done today" : "Mark today") }
          .font(.system(size: 13, weight: .semibold)).foregroundStyle(did ? c : .white).frame(maxWidth: .infinity).frame(height: compact ? 30 : 34)
          .background(did ? c.opacity(0.14) : c, in: Capsule()).widgetAccentable()
      }.buttonStyle(.plain).disabled(g.over && !did)
    case .count:
      Button(intent: WGoalIntent(id: g.id, act: "add")) {
        HStack(spacing: 5) { Image(systemName: "plus").font(.system(size: 12, weight: .bold)); Text(g.amount(g.step)) }
          .font(.system(size: 13, weight: .semibold)).foregroundStyle(.white).frame(maxWidth: .infinity).frame(height: compact ? 30 : 34).background(c, in: Capsule()).widgetAccentable()
      }.buttonStyle(.plain).disabled(g.reached)
    case .things:
      if let n = g.nextThing { WGoalThing(g: g, t: n) } else { Text("All ticked off").font(.system(size: 12.5, weight: .semibold)).foregroundStyle(c) }
    }
  }
}
struct WGoalThing: View {
  let g: Goal, t: Goal.Thing
  var body: some View {
    HStack(spacing: 9) {
      Button(intent: WGoalIntent(id: g.id, act: "tick", thing: t.id)) { Circle().strokeBorder(wHex(g.color).opacity(0.7), lineWidth: 1.7).frame(width: 20, height: 20).contentShape(Circle().inset(by: -6)) }.buttonStyle(.plain)
      Text(t.name.isEmpty ? "Next thing" : t.name).font(.system(size: 13, weight: .medium)).foregroundStyle(t.name.isEmpty ? .secondary : .primary).lineLimit(1)
      Spacer(minLength: 0)
    }.frame(minHeight: 24).transition(.push(from: .bottom).combined(with: .opacity)).id(t.id)
  }
}
/// The days of a goal as squares, a week to a column: marked, today, and days to come.
struct WGoalDays: View {
  let g: Goal; let from: String; let weeks: Int; let size: CGFloat; var labels = true
  var body: some View {
    let c = wHex(g.color), lead = (Calendar.current.component(.weekday, from: GDay.date(from) ?? Date()) + 5) % 7, first = GDay.add(from, -lead), t = GDay.today
    HStack(alignment: .top, spacing: 4) {
      if labels { VStack(spacing: 4) { ForEach(Array(["M", "", "W", "", "F", "", "S"].enumerated()), id: \.offset) { _, l in Text(l).font(.system(size: 8.5, weight: .bold)).foregroundStyle(.tertiary).frame(width: 10, height: size) } } }
      ForEach(0..<weeks, id: \.self) { w in
        VStack(spacing: 4) {
          ForEach(0..<7, id: \.self) { i in
            let d = GDay.add(first, w * 7 + i), on = g.marks.contains(d), inside = d >= g.start && d <= g.due, shape = RoundedRectangle(cornerRadius: size * 0.28, style: .continuous)
            if d == t && inside && !g.id.hasPrefix("sample") {
              Button(intent: WGoalIntent(id: g.id, act: "mark")) { shape.fill(on ? c : c.opacity(0.12)).overlay(shape.stroke(c, lineWidth: on ? 0 : 1.5)).frame(width: size, height: size).widgetAccentable() }.buttonStyle(.plain)
            } else {
              shape.fill(on ? c : !inside ? Color.clear : d > t ? Color.primary.opacity(0.04) : Color.primary.opacity(0.09)).overlay(shape.stroke(d == t ? c : .clear, lineWidth: 1.5)).frame(width: size, height: size).widgetAccentable()
            }
          }
        }
      }
    }
  }
}
/// The climb of a number goal against the straight line to its target, drawn small.
struct WGoalClimb: View {
  let g: Goal
  var body: some View {
    GeometryReader { geo in
      let w = geo.size.width, h = geo.size.height, span = Double(max(1, GDay.between(g.start, g.due))), top = max(g.goal, g.done, 1)
      let x = { (d: String) in CGFloat(Double(GDay.between(g.start, d)) / span) * w }, y = { (v: Double) in h - CGFloat(v / top) * (h - 4) }
      let pts: [CGPoint] = { var p = [CGPoint(x: 0, y: h)], c = 0.0; for e in g.log.sorted(by: { $0.day < $1.day }) { p.append(CGPoint(x: x(e.day), y: y(c))); c += e.amount; p.append(CGPoint(x: x(e.day), y: y(c))) }; p.append(CGPoint(x: x(min(GDay.today, g.due)), y: y(c))); return p }()
      let c = wHex(g.color)
      ZStack(alignment: .topLeading) {
        Path { p in p.move(to: CGPoint(x: 0, y: h)); p.addLine(to: CGPoint(x: w, y: y(g.goal))) }.stroke(Color.secondary.opacity(0.6), style: StrokeStyle(lineWidth: 1.3, dash: [3, 3]))
        Path { p in p.addLines(pts); p.addLine(to: CGPoint(x: pts.last?.x ?? 0, y: h)); p.closeSubpath() }.fill(c.opacity(0.16))
        Path { p in p.addLines(pts) }.stroke(c, style: StrokeStyle(lineWidth: 2.2, lineCap: .round, lineJoin: .round)).widgetAccentable()
        Circle().fill(c).frame(width: 8, height: 8).position(pts.last ?? .zero)
      }
    }
  }
}
struct WGoalView: View {
  let d: WData, family: WidgetFamily
  var body: some View {
    if let g = d.goal { content(g).widgetURL(WLink.goal(g.id)) }
    else {
      switch family {
      case .accessoryCircular: ZStack { AccessoryWidgetBackground(); Image(systemName: "target").font(.system(size: 22, weight: .semibold)) }.widgetURL(WLink.goal(""))
      case .accessoryInline: Label("Set a goal in Sleek Tasks", systemImage: "target").widgetURL(WLink.goal(""))
      case .accessoryRectangular: VStack(alignment: .leading) { Label("Goals", systemImage: "target").font(.system(size: 12, weight: .bold)); Text("Set one in Sleek Tasks").font(.system(size: 13)) }.frame(maxWidth: .infinity, alignment: .leading).widgetURL(WLink.goal(""))
      default: VStack(spacing: 8) { Image(systemName: "target").font(.system(size: 28, weight: .semibold)).foregroundStyle(WC.tasks); Text("Set a goal in Sleek Tasks").font(.system(size: 13, weight: .semibold)).multilineTextAlignment(.center).foregroundStyle(.secondary) }.frame(maxWidth: .infinity, maxHeight: .infinity).widgetURL(WLink.goal(""))
      }
    }
  }
  private func paceLine(_ g: Goal) -> some View { Text(g.pace.text).font(.system(size: 12, weight: .semibold)).foregroundStyle(g.pace.behind ? WC.late : wHex(g.color)).lineLimit(1) }
  @ViewBuilder private func content(_ g: Goal) -> some View {
    let c = wHex(g.color)
    switch family {
    case .accessoryCircular:
      ZStack { AccessoryWidgetBackground(); WRing(frac: g.frac, color: .primary, size: 54, width: 5); VStack(spacing: -2) { Text(g.money ? g.num(g.done) : g.num(g.done)).font(.system(size: g.money ? 12 : 17, weight: .bold, design: .rounded)).minimumScaleFactor(0.6); Text("of \(g.num(g.goal))").font(.system(size: 8.5, weight: .semibold)).opacity(0.75).minimumScaleFactor(0.6) }.padding(8) }
    case .accessoryInline:
      Label("\(g.title) · " + (g.reached ? "reached" : "\(g.amount(g.goal - g.done)) to go"), systemImage: "target")
    case .accessoryRectangular:
      VStack(alignment: .leading, spacing: 2) {
        Label(g.title, systemImage: "target").font(.system(size: 12, weight: .bold)).lineLimit(1)
        Text("\(g.num(g.done)) of \(g.amount(g.goal))").font(.system(size: 14, weight: .semibold)).lineLimit(1)
        GeometryReader { geo in ZStack(alignment: .leading) { Capsule().fill(Color.primary.opacity(0.25)); Capsule().fill(Color.primary).frame(width: max(5, geo.size.width * g.frac)) } }.frame(height: 5)
      }.frame(maxWidth: .infinity, alignment: .leading)
    case .systemSmall:
      VStack(alignment: .leading, spacing: 0) {
        WHead(color: c, title: g.title)
        HStack(spacing: 10) {
          WRing(frac: g.frac, color: c, size: 54, width: 6.5, label: "\(g.percent)%")
          VStack(alignment: .leading, spacing: 2) {
            (Text(g.num(g.done)).font(.system(size: 24, weight: .bold, design: .rounded)) + Text(g.money ? "" : "/\(g.num(g.goal))").font(.system(size: 13, weight: .semibold)).foregroundColor(.secondary)).lineLimit(1).minimumScaleFactor(0.6)
            Text(g.reached ? "Reached" : "\(g.left) days left").font(.system(size: 11.5, weight: .semibold)).foregroundStyle(.secondary).lineLimit(1)
          }
        }.padding(.top, 9)
        Spacer(minLength: 6)
        WGoalAction(g: g, compact: true)
      }
    case .systemMedium:
      HStack(spacing: 14) {
        VStack(alignment: .leading, spacing: 0) {
          WHead(color: c, title: "Goal", right: GDay.short(g.due))
          Text(g.title).font(.system(size: 16, weight: .bold)).lineLimit(2).padding(.top, 5)
          (Text(g.num(g.done)).font(.system(size: 28, weight: .bold, design: .rounded)) + Text(" of \(g.amount(g.goal))").font(.system(size: 14, weight: .semibold)).foregroundColor(.secondary)).lineLimit(1).minimumScaleFactor(0.7).padding(.top, 2)
          Spacer(minLength: 2)
          paceLine(g)
          Text(g.kind == .days ? "\(g.streak) day streak · \(g.left) days left" : g.kind == .things ? "\(g.openThings.count) to go · \(g.left) days left" : "\(g.left) days left").font(.system(size: 11.5)).foregroundStyle(.secondary).lineLimit(1)
        }.frame(maxWidth: .infinity, alignment: .leading)
        if g.kind == .days {
          VStack(spacing: 5) {
            let monday = GDay.add(GDay.today, -((Calendar.current.component(.weekday, from: Date()) + 5) % 7))
            WMonthGrid(g: g, from: GDay.add(monday, -21))
            Text(g.markedToday ? "Marked today" : "Tap today to mark it").font(.system(size: 10, weight: .semibold)).foregroundStyle(.tertiary)
          }.frame(width: 150)
        } else {
          VStack(spacing: 10) { WRing(frac: g.frac, color: c, size: 78, width: 8, label: "\(g.percent)%"); WGoalAction(g: g, compact: true) }.frame(width: 128)
        }
      }
    default:
      VStack(alignment: .leading, spacing: 10) {
        WHead(color: c, title: "Goal", right: g.kind == .things ? "\(g.left) days left" : "by " + GDay.short(g.due))
        HStack(spacing: 14) {
          WRing(frac: g.frac, color: c, size: 70, width: 8, label: g.kind == .things ? "\(Int(g.done))" : "\(g.percent)%")
          VStack(alignment: .leading, spacing: 2) {
            Text(g.title).font(.system(size: 18, weight: .bold)).lineLimit(2)
            Text(g.kind == .days ? "\(g.marks.count) of \(g.target) days · \(g.streak) day streak" : g.kind == .things ? "\(g.openThings.count) to go of \(g.things.count)" : "\(g.num(g.done)) of \(g.amount(g.goal))").font(.system(size: 12.5)).foregroundStyle(.secondary).lineLimit(1)
            paceLine(g).padding(.top, 1)
          }
        }
        switch g.kind {
        case .days:
          let span = weeksShown(g)
          WGoalDays(g: g, from: span.from, weeks: span.weeks, size: span.size).frame(maxWidth: .infinity, maxHeight: .infinity)
          WGoalAction(g: g)
        case .things:
          HStack(spacing: 3) { ForEach(g.things.prefix(40)) { t in Capsule().fill(t.done.isEmpty ? Color.primary.opacity(0.1) : c).frame(height: 5).widgetAccentable() } }.padding(.vertical, 2)
          VStack(alignment: .leading, spacing: 3) { ForEach(g.openThings.prefix(6)) { t in WGoalThing(g: g, t: t) } }
          Spacer(minLength: 0)
        case .count:
          WGoalClimb(g: g).frame(maxHeight: .infinity).padding(.vertical, 4)
          WGoalAction(g: g)
        }
      }
    }
  }
  /// The weeks a large widget shows: the whole goal when it fits, else the 16 weeks around today.
  private func weeksShown(_ g: Goal) -> (from: String, weeks: Int, size: CGFloat) {
    let monday = { (k: String) in GDay.add(k, -((Calendar.current.component(.weekday, from: GDay.date(k) ?? Date()) + 5) % 7)) }
    let s = monday(g.start), all = GDay.between(s, g.due) / 7 + 1, most = 16
    var from = s, weeks = all
    if all > most { weeks = most; let now = monday(min(GDay.today, g.due)); from = max(s, min(GDay.add(now, -7 * 11), GDay.add(monday(g.due), -7 * (most - 1)))) }
    return (from, weeks, min(18, ((300 - CGFloat(weeks) * 4) / CGFloat(weeks + 1)).rounded(.down)))
  }
}
/// Four weeks of a days goal, Monday first, with today's square marking today.
struct WMonthGrid: View {
  let g: Goal; let from: String
  var body: some View {
    VStack(spacing: 4) {
      HStack(spacing: 4) { ForEach(Array(["M", "T", "W", "T", "F", "S", "S"].enumerated()), id: \.offset) { _, l in Text(l).font(.system(size: 8.5, weight: .bold)).foregroundStyle(.tertiary).frame(width: 17) } }
      ForEach(0..<4, id: \.self) { w in
        HStack(spacing: 4) {
          ForEach(0..<7, id: \.self) { i in
            let day = GDay.add(from, w * 7 + i), on = g.marks.contains(day), c = wHex(g.color), shape = RoundedRectangle(cornerRadius: 5, style: .continuous)
            if day == GDay.today && !g.id.hasPrefix("sample") {
              Button(intent: WGoalIntent(id: g.id, act: "mark")) { shape.fill(on ? c : c.opacity(0.12)).overlay(shape.stroke(c, lineWidth: on ? 0 : 1.5)).frame(width: 17, height: 17).widgetAccentable() }.buttonStyle(.plain)
            } else { shape.fill(on ? c : day > GDay.today ? Color.primary.opacity(0.04) : Color.primary.opacity(0.09)).overlay(shape.stroke(day == GDay.today ? c : .clear, lineWidth: 1.5)).frame(width: 17, height: 17).widgetAccentable() }
          }
        }
      }
    }
  }
}
/// Your goals still going, three at a time, each with a bar and its one-tap step.
struct WGoalsView: View {
  let d: WData
  var body: some View {
    let going = d.goals.filter { !$0.reached }
    VStack(alignment: .leading, spacing: 8) {
      Link(destination: WLink.goal("")) { HStack(spacing: 6) { Image(systemName: "target").foregroundStyle(WC.tasks).widgetAccentable(); Text("Goals"); Spacer(minLength: 4); Text("\(going.count) going").foregroundStyle(.tertiary) }.font(.system(size: 12, weight: .semibold)).foregroundStyle(.secondary) }
      if going.isEmpty { Text("Set a goal in Sleek Tasks").font(.system(size: 13, weight: .semibold)).foregroundStyle(.secondary).frame(maxWidth: .infinity, maxHeight: .infinity) }
      ForEach(going.prefix(3)) { g in
        let c = wHex(g.color)
        HStack(spacing: 10) {
          Link(destination: WLink.goal(g.id)) {
            VStack(alignment: .leading, spacing: 5) {
              HStack { Text(g.title).font(.system(size: 13, weight: .semibold)).lineLimit(1); Spacer(minLength: 6); Text("\(g.num(g.done))/\(g.num(g.goal))").font(.system(size: 12, weight: .semibold)).foregroundStyle(.secondary) }
              GeometryReader { geo in ZStack(alignment: .leading) { Capsule().fill(c.opacity(0.15)); Capsule().fill(c).frame(width: max(6, geo.size.width * g.frac)).widgetAccentable() } }.frame(height: 6)
            }
          }
          Button(intent: WGoalIntent(id: g.id, act: g.kind == .days ? "mark" : g.kind == .count ? "add" : "tick", thing: g.nextThing?.id ?? "")) {
            let did = g.kind == .days && g.markedToday
            Image(systemName: g.kind == .count ? "plus" : "checkmark").font(.system(size: 13, weight: .bold)).foregroundStyle(did ? .white : c).frame(width: 32, height: 32).background(did ? c : c.opacity(0.14), in: Circle()).widgetAccentable()
          }.buttonStyle(.plain)
        }
      }
      Spacer(minLength: 0)
    }
  }
}

// ---------- the widgets themselves ----------
private extension View {
  func wBackground(dark: Bool = false) -> some View { tint(.primary).containerBackground(for: .widget) { dark ? wHex("#121218") : WC.bg } }
}
struct SleekSearchWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "sleek.search", provider: WPlain()) { e in WSearchViewBox() }
      .configurationDisplayName("Search").description("Straight to the address bar, with the keyboard up.").supportedFamilies([.systemSmall, .accessoryCircular])
  }
}
private struct WSearchViewBox: View { @Environment(\.widgetFamily) var f; var body: some View { WSearchView(family: f).wBackground() } }
struct SleekSitesWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "sleek.sites", provider: WPlain()) { e in WSitesView(d: e.d).wBackground() }
      .configurationDisplayName("Search and Sites").description("The search box and the sites you go to most.").supportedFamilies([.systemMedium])
  }
}
struct SleekPrivateWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "sleek.private", provider: WPlain()) { _ in WPrivateBox() }
      .configurationDisplayName("Private Tab").description("A new private tab. Nothing is kept when you close it.").supportedFamilies([.systemSmall, .accessoryCircular])
  }
}
private struct WPrivateBox: View { @Environment(\.widgetFamily) var f; var body: some View { WPrivateView(family: f).environment(\.colorScheme, f == .systemSmall ? .dark : .light).wBackground(dark: true) } }
struct SleekDayWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "sleek.day", provider: WPlain()) { e in WDayView(d: e.d).wBackground() }
      .configurationDisplayName("Your Day").description("What's due, your grocery list, and where you left off.").supportedFamilies([.systemLarge])
  }
}
struct TasksGroceriesWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "tasks.groceries", provider: WPlain()) { e in WFam { WGroceriesView(d: e.d, family: $0) } }
      .configurationDisplayName("Groceries").description("What's left to get. Tick things off as you shop.").supportedFamilies([.systemSmall, .systemMedium, .accessoryCircular])
  }
}
struct TasksAislesWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "tasks.aisles", provider: WPlain()) { e in WAislesView(d: e.d).wBackground() }
      .configurationDisplayName("Groceries by Aisle").description("Your list in the order you walk the shop, with Add and Shop.").supportedFamilies([.systemLarge])
  }
}
struct TasksDueWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "tasks.due", provider: WPlain()) { e in WFam { WDueView(d: e.d, family: $0) } }
      .configurationDisplayName("Due Today").description("What's due and what's late. Tick tasks off right here.").supportedFamilies([.systemSmall, .systemMedium, .accessoryCircular, .accessoryRectangular, .accessoryInline])
  }
}
struct TasksBoardWidget: Widget {
  var body: some WidgetConfiguration {
    AppIntentConfiguration(kind: "tasks.board", intent: WChooseBoard.self, provider: WBoardTimeline()) { e in WBoardView(d: e.d).wBackground() }
      .configurationDisplayName("Board").description("One board: how far along it is, and its columns.").supportedFamilies([.systemLarge])
  }
}
struct DocsRecentWidget: Widget {
  var body: some WidgetConfiguration {
    AppIntentConfiguration(kind: "docs.recent", intent: WChoosePage.self, provider: WPageTimeline()) { e in WFam { WRecentPageView(d: e.d, family: $0) } }
      .configurationDisplayName("Recent Page").description("The page you edited last, or one you choose.").supportedFamilies([.systemSmall, .accessoryRectangular])
  }
}
struct DocsPagesWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "docs.pages", provider: WPlain()) { e in WPagesView(d: e.d).wBackground() }
      .configurationDisplayName("Recent Pages").description("Your last three pages, and a new one.").supportedFamilies([.systemMedium])
  }
}
struct DocsNewWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "docs.new", provider: WPlain()) { _ in WFam { WNewPageView(family: $0) } }
      .configurationDisplayName("New Page").description("An empty page with the keyboard up.").supportedFamilies([.systemSmall, .accessoryCircular])
  }
}
struct DocsPageWidget: Widget {
  var body: some WidgetConfiguration {
    AppIntentConfiguration(kind: "docs.page", intent: WChoosePage.self, provider: WPageTimeline()) { e in WPageView(d: e.d).wBackground() }
      .configurationDisplayName("Page").description("One page: its opening, and its checklist.").supportedFamilies([.systemLarge]).contentMarginsDisabled()
  }
}
struct SlidesRecentWidget: Widget {
  var body: some WidgetConfiguration {
    AppIntentConfiguration(kind: "slides.recent", intent: WChooseDeck.self, provider: WDeckTimeline()) { e in WFam { WRecentDeckView(d: e.d, family: $0) } }
      .configurationDisplayName("Recent Deck").description("The cover of your latest deck, or one you choose.").supportedFamilies([.systemSmall, .accessoryRectangular]).contentMarginsDisabled()
  }
}
struct SlidesDeckWidget: Widget {
  var body: some WidgetConfiguration {
    AppIntentConfiguration(kind: "slides.deck", intent: WChooseDeck.self, provider: WDeckTimeline()) { e in WDeckView(d: e.d).wBackground() }
      .configurationDisplayName("Deck").description("A deck's cover, and Present.").supportedFamilies([.systemMedium])
  }
}
struct SlidesDecksWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "slides.decks", provider: WPlain()) { e in WDecksView(d: e.d).wBackground() }
      .configurationDisplayName("Decks").description("Your four latest decks.").supportedFamilies([.systemLarge])
  }
}
struct TasksGoalWidget: Widget {
  var body: some WidgetConfiguration {
    AppIntentConfiguration(kind: "tasks.goal", intent: WChooseGoal.self, provider: WGoalTimeline()) { e in WFam { WGoalView(d: e.d, family: $0) } }
      .configurationDisplayName("Goal").description("One goal: how far along, your pace, and one tap to move it on.").supportedFamilies([.systemSmall, .systemMedium, .systemLarge, .accessoryCircular, .accessoryRectangular, .accessoryInline])
  }
}
struct TasksGoalsWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "tasks.goals", provider: WPlain()) { e in WGoalsView(d: e.d).wBackground() }
      .configurationDisplayName("Goals").description("Your goals going, each with a quick tap.").supportedFamilies([.systemMedium])
  }
}
/// Hands the widget's size to its view, and gives Home Screen sizes their background (the Lock Screen draws its own).
struct WFam<V: View>: View {
  @Environment(\.widgetFamily) var f
  let make: (WidgetFamily) -> V
  init(@ViewBuilder _ make: @escaping (WidgetFamily) -> V) { self.make = make }
  var body: some View { make(f).tint(.primary).containerBackground(for: .widget) { if [.systemSmall, .systemMedium, .systemLarge].contains(f) { WC.bg } else { Color.clear } } }
}

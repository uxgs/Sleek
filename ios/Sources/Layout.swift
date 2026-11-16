// What goes on a new tab, and in what order: yours to arrange. Press and hold anything there and it all wiggles, as the
// Home Screen does: drag sections and tiles into any order, take off what you don't want, and add it back from Add.
// Each section has its own options (tap it while arranging). Kept with your other settings (Store.swift).
import SwiftUI

/// The sections a new tab can show.
enum Part: String, CaseIterable, Identifiable {
  case today, goals, apps, recent, marks, most
  var id: String { rawValue }
  var name: String {
    switch self { case .today: "Today, from Sleek Tasks"; case .goals: "Goals"; case .apps: "Sleek"; case .recent: "Pick up where you left off"; case .marks: "Bookmarks"; case .most: "Where you go most" }
  }
  var blurb: String {
    switch self { case .today: "What is due, and your grocery list"; case .goals: "Your goals, with one tap to move them on"; case .apps: "Slides, Docs and Tasks"; case .recent: "The decks and pages you last worked on"; case .marks: "The bookmarks you choose, as tiles"; case .most: "The sites you go to most, as tiles" }
  }
  var icon: String {
    switch self { case .today: "checkmark.circle"; case .goals: "target"; case .apps: "square.grid.2x2"; case .recent: "rectangle.on.rectangle"; case .marks: "bookmark"; case .most: "globe" }
  }
  var color: Color {
    switch self { case .today: .tasks; case .goals: Color(hex: "#FF7A45"); case .apps: .slides; case .recent: .docs; case .marks: Color(hex: "#E5487F"); case .most: Color(hex: "#7E9CFF") }
  }
}

extension Browser {
  // ---------- the sections ----------
  /// Every section in your order (any the app gained since you arranged it come last).
  private var allParts: [Part] { let saved = (store.settings["startOrder"] as? [String] ?? []).compactMap(Part.init); return saved + Part.allCases.filter { !saved.contains($0) } }
  /// The sections taken off. The old switch for the row of Sleek's apps (⋯, Appearance) counts as taking it off.
  var partsOff: Set<Part> { Set((store.settings["startOff"] as? [String] ?? (startApps ? [] : ["apps"])).compactMap(Part.init)) }
  /// The sections on the page, top to bottom.
  var parts: [Part] { let off = partsOff; return allParts.filter { !off.contains($0) } }
  private func keepParts(_ on: [Part], off: Set<Part>) {
    withAnimation(.spring(response: 0.42, dampingFraction: 0.84)) {
      store.set("startOrder", (on + allParts.filter { off.contains($0) }).map(\.rawValue)); store.set("startOff", off.map(\.rawValue).sorted()); objectWillChange.send()
    }
  }
  /// Move a section to a place among those on the page.
  func movePart(_ p: Part, to i: Int) {
    var on = parts; guard let from = on.firstIndex(of: p) else { return }
    on.remove(at: from); on.insert(p, at: max(0, min(i, on.count))); if on != parts { keepParts(on, off: partsOff) }
  }
  func takeOff(_ p: Part) { keepParts(parts.filter { $0 != p }, off: partsOff.union([p])); say("\(p.name) taken off. Add brings it back.") }
  /// Back on the page, at the foot.
  func bringBack(_ p: Part) { keepParts(parts.filter { $0 != p } + [p], off: partsOff.subtracting([p])) }

  // ---------- the tiles in a section ----------
  /// Sleek's own apps on the page, in your order.
  var appsOnPage: [String] { (store.settings["startAppList"] as? [String] ?? ["slides", "docs", "tasks"]).filter { ["slides", "docs", "tasks"].contains($0) } }
  func setApp(_ a: String, on: Bool) { var l = appsOnPage.filter { $0 != a }; if on { l.append(a) }; choose(list: "startAppList", l) }
  /// The bookmarks on the page: the ones you chose, in your order; until you choose, your first eight.
  var marksOnPage: [StartView.Place] {
    let all = store.bookmarks.compactMap { m -> StartView.Place? in guard let u = m["url"] as? String, let h = URL(string: u)?.host else { return nil }; return StartView.Place(host: h, name: m["title"] as? String ?? h, url: u) }
    guard let chosen = store.settings["startMarks"] as? [String] else { return Array(all.prefix(8)) }
    return chosen.compactMap { u in all.first { $0.url == u } }
  }
  /// Every bookmark, for choosing which are on the page.
  var allMarks: [StartView.Place] { store.bookmarks.compactMap { m in guard let u = m["url"] as? String, let h = URL(string: u)?.host else { return nil }; return StartView.Place(host: h, name: m["title"] as? String ?? h, url: u) } }
  func setMark(_ url: String, on: Bool) { var l = marksOnPage.map(\.url).filter { $0 != url }; if on { l.append(url) }; choose(list: "startMarks", l) }
  /// Where you go most, in your order where you moved them, the rest by how often you go.
  var mostOnPage: [StartView.Place] {
    let order = store.settings["mostOrder"] as? [String] ?? [], top = topSites.map { StartView.Place(host: $0.host, name: SiteName.of($0.host), url: $0.url) }
    return top.enumerated().sorted { a, b in
      let i = order.firstIndex(of: a.element.host) ?? Int.max, j = order.firstIndex(of: b.element.host) ?? Int.max
      return i != j ? i < j : a.offset < b.offset
    }.map(\.element)
  }
  /// Move a tile to where another one is, in its section (apps, marks or most).
  func moveTile(_ group: Part, _ id: String, to other: String) {
    func moved(_ l: [String]) -> [String]? { guard let i = l.firstIndex(of: id), let j = l.firstIndex(of: other), i != j else { return nil }; var l = l; l.remove(at: i); l.insert(id, at: j); return l }
    switch group {
    case .apps: if let l = moved(appsOnPage) { choose(list: "startAppList", l) }
    case .marks: if let l = moved(marksOnPage.map(\.url)) { choose(list: "startMarks", l) }
    case .most: if let l = moved(mostOnPage.map(\.host)) { choose(list: "mostOrder", l) }
    default: break
    }
  }
  /// Take a tile off the page: an app, a bookmark (still kept in Bookmarks), or a place you go (left off that list).
  func takeOffTile(_ group: Part, _ id: String) {
    switch group {
    case .apps: setApp(id, on: false); say("\(id.capitalized) taken off. Its options bring it back.")
    case .marks: setMark(id, on: false); say("Off the page, still in Bookmarks")
    case .most: hideTop(id)
    default: break
    }
  }
  private func choose(list key: String, _ l: [String]) { withAnimation(.spring(response: 0.42, dampingFraction: 0.84)) { store.set(key, l); objectWillChange.send() } }

  // ---------- each section's options ----------
  func option(_ key: String, _ fallback: Bool = true) -> Bool { store.settings[key] as? Bool ?? fallback }
  var goalLook: String { store.settings["goalLook"] as? String ?? "rings" }
  var recentCount: Int { store.settings["recentN"] as? Int ?? 6 }
  func choose(_ key: String, number: Int) { withAnimation(.spring(response: 0.45, dampingFraction: 0.85)) { store.set(key, number); objectWillChange.send() } }
  /// The decks and pages to pick up, as the section's options say.
  var recentOnPage: [WorkItem] { day.recent.filter { $0.kind == "slides" ? option("recentDecks") : option("recentPages") }.prefix(recentCount).map { $0 } }

  // ---------- goals, from Sleek Tasks ----------
  /// The goals switched off for the page (new goals show until you switch them off).
  var goalsOff: Set<String> { Set(store.settings["goalsOff"] as? [String] ?? []) }
  var goalsOnPage: [Goal] { let off = goalsOff; return goals.filter { !off.contains($0.id) && !$0.reached } }
  func showGoal(_ id: String, _ on: Bool) { var off = goalsOff; if on { off.remove(id) } else { off.insert(id) }; withAnimation(.spring(response: 0.42, dampingFraction: 0.84)) { store.set("goalsOff", off.sorted()); objectWillChange.send() } }
  /// Your goals as every Sleek app on this iPhone has them.
  func readGoals(_ root: URL? = Shared.root) { let g = SiriTasks.read(root).goalList; if g != goals { withAnimation(.spring(response: 0.42, dampingFraction: 0.84)) { goals = g } } }
  /// Move a goal on from the start page as its widget does: mark today, add to it, or tick its next thing.
  func stepGoal(_ g: Goal, root: URL? = Shared.root) {
    tap(.medium)
    let act = g.kind == .days ? "mark" : g.kind == .count ? "add" : "tick", next = g.nextThing
    guard let now = SiriTasks.goalStep(g.id, act, root: root) else { say("That goal is no longer in Sleek Tasks"); readGoals(root); return }
    readGoals(root)
    if now.reached && !g.reached { tap(.heavy); say("Goal reached: \(g.title)"); return }
    switch g.kind {
    case .days: say(now.markedToday ? "Marked today on \(g.title)" : "Unmarked today")
    case .count: say("Added \(g.amount(g.step)) to \(g.title)")
    case .things: say(next.map { $0.name.isEmpty ? "Ticked a thing off \(g.title)" : "Ticked “\($0.name)”" } ?? "Every thing is ticked")
    }
  }
}

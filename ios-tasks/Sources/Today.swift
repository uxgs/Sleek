// Sleek Tasks for iPhone: the app, Today, the days ahead, and one task on a sheet.
//
//   It opens on Today: what is late, what is due, what you have done. Adding is always under your thumb,
//   in a field docked at the bottom that stays up for the next one. Swipe a task right to tick it, left
//   to put it off. Press it for the rest, on a sheet.
import SwiftUI

/// What the screens share besides the store: a short message, and the board new tasks last went to.
@MainActor
final class Shell: ObservableObject {
  @Published var toast: String?
  /// The board or list the Sleek browser asked to open.
  @Published var goTo: String?
  /// The goal a widget asked to open.
  @Published var goGoal: String?
  /// The widget's Add: the list opens with the keyboard up (taken once, by the list's add bar).
  var adding = false
  func takeAdding() -> Bool { defer { adding = false }; return adding }
  @Published var lastBoard: String { didSet { UserDefaults.standard.set(lastBoard, forKey: "lastBoard") } }
  private var n = 0
  init() { lastBoard = Args.proving ? "" : (UserDefaults.standard.string(forKey: "lastBoard") ?? "") }
  func say(_ text: String) { n += 1; let mine = n; withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) { toast = text }; DispatchQueue.main.asyncAfter(deadline: .now() + 3) { [weak self] in if self?.n == mine { withAnimation(.easeOut(duration: 0.25)) { self?.toast = nil } } } }
}

struct TasksRoot: View {
  @StateObject private var s: Store
  @StateObject private var shell = Shell()
  @State private var tab = Args.arg("--tab") ?? "today"
  @Environment(\.scenePhase) private var phase
  init() {
    // your tasks live in Sleek Tasks' place in the folder the Sleek apps share (../ios-shared/Shared.swift), so the
    // browser, Docs and Slides see them too. The first time, the file this app kept before comes along (and stays, as a copy).
    let fm = FileManager.default, old = fm.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("Tasks.sleek")
    var file = old, peers: [URL] = []
    if !Args.proving, let me = Shared.place("tasks") {
      let f = me.appendingPathComponent("Tasks.sleek")
      if !fm.fileExists(atPath: f.path) { try? fm.createDirectory(at: me, withIntermediateDirectories: true); if fm.fileExists(atPath: old.path) { try? fm.copyItem(at: old, to: f) } }
      file = f; peers = Shared.peers(of: "tasks")
    }
    let store = Store(file: file)
    if !peers.isEmpty { store.peers = peers; store.tell = Shared.tell; store.pull(); Shared.listen { [weak store] in store?.pull() } }
    if store.plainBoards.isEmpty && store.readable { store.addBoard("My tasks") }      // somewhere for your first task to go
    _s = StateObject(wrappedValue: store)
  }
  var body: some View {
    TabView(selection: $tab) {
      NavigationStack { TodayView(s: s, shell: shell) }.tabItem { Label("Today", systemImage: "sun.max.fill") }.tag("today")
      NavigationStack { UpcomingView(s: s, shell: shell) }.tabItem { Label("Upcoming", systemImage: "calendar") }.tag("upcoming")
      NavigationStack { BoardsView(s: s, shell: shell) }.tabItem { Label("Boards", systemImage: "rectangle.split.3x1.fill") }.tag("boards")
      NavigationStack { GoalsView(s: s, shell: shell) }.tabItem { Label("Goals", systemImage: "target") }.tag("goals")
    }
    .tint(.tasks)
    .overlay(alignment: .top) { if let t = shell.toast { Text(t).font(.system(size: 15, weight: .medium)).padding(.horizontal, 16).frame(minHeight: 40).modifier(Glass(shape: Capsule())).padding(.top, 8).padding(.horizontal, 20).transition(.move(edge: .top).combined(with: .opacity)).id(t) } }
    .onChange(of: phase) { _, now in if now != .active { s.flush() } else { s.pull() } }
    // the Sleek browser opening a board or list here (sleek-tasks://open?board=<id>), or a .sleek file sent to this
    // iPhone (from Sleek Tasks on the web, or another phone)
    .onOpenURL { url in
      // (and its widgets: sleek-tasks://today, ://open?board=<list>, ://add?board=<list>)
      // (the goal widgets: sleek-tasks://goals, ://goal?id=<goal>)
      if url.scheme == "sleek-tasks", url.host == "goals" || url.host == "goal" { s.pull(); tab = "goals"; shell.goGoal = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.first { $0.name == "id" }?.value; return }
      if url.scheme == "sleek-tasks" { s.pull(); let id = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.first { $0.name == "board" }?.value ?? ""; if url.host != "today", s.board(id) != nil { tab = "boards"; shell.goTo = id; if url.host == "add" { shell.adding = true } } else { tab = "today" }; return }
      bring(url, into: s, shell)
    }
  }
}
/// Read a file of tasks and bring it in, saying what came.
@MainActor func bring(_ url: URL, into s: Store, _ shell: Shell) {
  let mine = url.startAccessingSecurityScopedResource(); defer { if mine { url.stopAccessingSecurityScopedResource() } }
  guard let text = try? String(contentsOf: url, encoding: .utf8) else { shell.say("That file could not be read"); return }
  do { let r = try s.bring(text); tap(.medium); shell.say(r.boards + r.tasks == 0 ? "Everything in that file is already here" : "Brought in \(r.boards) board\(r.boards == 1 ? "" : "s") and \(r.tasks) task\(r.tasks == 1 ? "" : "s")") }
  catch { shell.say(error.localizedDescription) }
}

// ---------- one task in a list ----------
struct TaskRow: View {
  let t: Item; @ObservedObject var s: Store; var showDue = true; let open: (Item) -> Void
  var body: some View {
    let b = s.board(t.board), late = !t.done && !t.due.isEmpty && t.due < Day.today
    HStack(alignment: .top, spacing: 12) {
      Button { tap(.medium); withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) { s.tick(t.id) } } label: {
        ZStack { Circle().stroke(t.done ? Color.tasks : Color.secondary.opacity(0.5), lineWidth: 2).background(Circle().fill(t.done ? Color.tasks : .clear)); if t.done { Image(systemName: "checkmark").font(.system(size: 12, weight: .bold)).foregroundStyle(.white).transition(.scale.combined(with: .opacity)) } }.frame(width: 26, height: 26).contentShape(Rectangle().inset(by: -10))
      }.buttonStyle(Press())
      VStack(alignment: .leading, spacing: 2) {
        Text(t.title).font(.system(size: 17, weight: .medium)).strikethrough(t.done, color: .secondary).foregroundStyle(t.done ? .secondary : .primary)
        HStack(spacing: 4) {
          Circle().fill(Color(hex: b?.color ?? "#12A36A")).frame(width: 8, height: 8); Text(b?.name ?? "").foregroundStyle(.secondary).lineLimit(1)
          if showDue, !t.due.isEmpty, !t.done { Text("·").foregroundStyle(.tertiary); Text(Day.word(t.due)).foregroundStyle(late ? .red : .secondary) }
          if !t.rep.isEmpty { Image(systemName: "repeat").font(.system(size: 11)).foregroundStyle(.tertiary) }
          if !t.steps.isEmpty { Image(systemName: "checklist").font(.system(size: 11)).foregroundStyle(.tertiary) }
          if !t.notes.isEmpty { Image(systemName: "text.alignleft").font(.system(size: 10)).foregroundStyle(.tertiary) }
        }.font(.system(size: 13))
      }
      Spacer(minLength: 0)
    }
    .padding(.vertical, 8).contentShape(Rectangle()).onTapGesture { tap(); open(t) }
    .listRowSeparator(.hidden).listRowBackground(Color.clear).listRowInsets(EdgeInsets(top: 0, leading: 20, bottom: 0, trailing: 20))
    .swipeActions(edge: .leading, allowsFullSwipe: true) { Button { tap(.medium); withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) { s.tick(t.id) } } label: { Label(t.done ? "Not done" : "Done", systemImage: t.done ? "arrow.uturn.left" : "checkmark") }.tint(.tasks) }
    .swipeActions(edge: .trailing, allowsFullSwipe: true) {
      Button { tap(); withAnimation(.spring(response: 0.4, dampingFraction: 0.85)) { s.setDue(t.id, Day.from(today: 1)) } } label: { Label("Tomorrow", systemImage: "sunrise") }.tint(.orange)
      Button { tap(); withAnimation(.spring(response: 0.4, dampingFraction: 0.85)) { s.setDue(t.id, Day.from(today: 7)) } } label: { Label("Next week", systemImage: "calendar.badge.clock") }.tint(.indigo)
    }
  }
}
extension View {
  /// A task opens on a sheet that starts half-way up.
  func taskSheet(_ open: Binding<Item?>, _ s: Store, _ shell: Shell) -> some View { sheet(item: open) { t in TaskSheet(s: s, shell: shell, id: t.id).presentationDetents([.medium, .large]).presentationCornerRadius(30).presentationBackground(.regularMaterial) } }
}

// ---------- Today ----------
struct TodayView: View {
  @ObservedObject var s: Store; @ObservedObject var shell: Shell
  @State private var open: Item?
  @State private var showDone = false
  @State private var list: String?
  var body: some View {
    let late = s.late, today = s.due(Day.today), done = s.doneToday, left = late.count + today.count, lists = s.listsToday
    List {
      VStack(alignment: .leading, spacing: 4) {
        Text(Date().formatted(.dateTime.weekday(.wide).day().month(.wide)).uppercased()).font(.system(size: 12, weight: .semibold)).tracking(1.4).foregroundStyle(.secondary).frame(height: 16)
        HStack(alignment: .center) {
          Text("Today").font(.system(size: 40, weight: .bold)).tracking(-1.2)
          Spacer()
          if left + done.count > 0 { ZStack { Circle().stroke(Color.tasks.opacity(0.18), lineWidth: 5); Circle().trim(from: 0, to: CGFloat(done.count) / CGFloat(left + done.count)).stroke(Color.tasks, style: StrokeStyle(lineWidth: 5, lineCap: .round)).rotationEffect(.degrees(-90)).animation(.spring(response: 0.6, dampingFraction: 0.8), value: done.count) }.frame(width: 32, height: 32).padding(.trailing, 2) }
        }
        Text(!s.readable ? "Your tasks could not be read, so nothing will be changed." : left == 0 ? (lists.isEmpty ? (done.isEmpty ? "Nothing is due. Add a task below." : "All done. Enjoy your day.") : "Just the shopping.") : late.isEmpty ? "A clear run." : "Start with what is late.").font(.system(size: 16)).foregroundStyle(.secondary)
      }.padding(.top, 4).padding(.bottom, 12).plainRow()
      // grocery lists for today, or a day gone by, that are not shopped yet
      ForEach(lists) { l in ListCard(s: s, l: l) { list = l.id }.padding(.bottom, 12).plainRow() }
      if !late.isEmpty { Head(text: "Late", c: .red); ForEach(late) { TaskRow(t: $0, s: s) { open = $0 } } }
      if !today.isEmpty { Head(text: "Due today"); ForEach(today) { TaskRow(t: $0, s: s, showDue: false) { open = $0 } } }
      if !done.isEmpty {
        Button { withAnimation(.spring(response: 0.4, dampingFraction: 0.85)) { showDone.toggle() } } label: { HStack(spacing: 8) { Text("DONE").font(.system(size: 12, weight: .semibold)).tracking(1.4); Image(systemName: "chevron.right").font(.system(size: 10, weight: .bold)).rotationEffect(.degrees(showDone ? 90 : 0)) }.foregroundStyle(.secondary).padding(.bottom, 8).frame(maxWidth: .infinity, minHeight: 44, alignment: .bottomLeading).contentShape(Rectangle()) }.buttonStyle(.plain).plainRow()
        if showDone { ForEach(done) { TaskRow(t: $0, s: s, showDue: false) { open = $0 } } }
      }
      Color.clear.frame(height: 88).plainRow()
    }
    .listStyle(.plain).scrollContentBackground(.hidden).scrollDismissesKeyboard(.interactively)
    .background(alignment: .top) { Bloom() }
    .safeAreaInset(edge: .bottom) { AddBar(s: s, shell: shell) }
    .taskSheet($open, s, shell)
    .navigationDestination(item: $list) { id in GroceryView(s: s, shell: shell, id: id) }
    .animation(.spring(response: 0.45, dampingFraction: 0.85), value: lists)
  }
}

/// Adding, always under the thumb. It stays up after each one, so a list of things goes in as fast as you can type.
struct AddBar: View {
  @ObservedObject var s: Store; @ObservedObject var shell: Shell
  @State private var text = ""
  @State private var when = 0            // 0 today, 1 tomorrow, 7 next week, -1 no date
  @FocusState private var typing: Bool
  private var board: String { s.plainBoards.first { $0.id == shell.lastBoard }?.id ?? s.plainBoards.first?.id ?? "" }
  var body: some View {
    VStack(spacing: 8) {
      if typing {
        ScrollView(.horizontal, showsIndicators: false) {
          HStack(spacing: 8) {
            ForEach([(0, "Today", "sun.max"), (1, "Tomorrow", "sunrise"), (7, "Next week", "calendar"), (-1, "No date", "minus.circle")], id: \.0) { w in chip(w.1, w.2, on: when == w.0, .tasks) { when = w.0 } }
            if s.plainBoards.count > 1 { Divider().frame(height: 24); ForEach(s.plainBoards) { b in chip(b.name, "circle.fill", on: board == b.id, Color(hex: b.color)) { shell.lastBoard = b.id } } }
          }.padding(.horizontal, 16)
        }.padding(.vertical, -4).transition(.move(edge: .bottom).combined(with: .opacity))
      }
      HStack(spacing: 12) {
        Image(systemName: "plus.circle.fill").font(.system(size: 24)).foregroundStyle(Color.tasks)
        TextField("Add a task", text: $text).font(.system(size: 17)).focused($typing).submitLabel(.done)
          .onSubmit { let had = !text.trimmingCharacters(in: .whitespaces).isEmpty; if had { tap(.medium); withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) { _ = s.addTask(text, board: board, due: when < 0 ? "" : Day.from(today: when)) } }; text = ""; typing = had }
        if typing { Button { typing = false } label: { Image(systemName: "keyboard.chevron.compact.down").foregroundStyle(.secondary).frame(width: 44, height: 44).contentShape(Rectangle()) }.padding(.horizontal, -8) }
      }
      .padding(.horizontal, 16).frame(height: 56)
      .modifier(Glass(shape: Capsule()))
      .overlay(Capsule().stroke(Color.tasks, lineWidth: typing ? 1.6 : 0)).shadow(color: Color.tasks.opacity(typing ? 0.35 : 0), radius: 16, y: 6)
      .padding(.horizontal, 16)
    }
    .padding(.bottom, 8).animation(.spring(response: 0.35, dampingFraction: 0.82), value: typing)
  }
  private func chip(_ name: String, _ icon: String, on: Bool, _ c: Color, _ act: @escaping () -> Void) -> some View {
    Button { tap(); withAnimation(.spring(response: 0.3, dampingFraction: 0.75)) { act() } } label: {
      HStack(spacing: 8) { Image(systemName: icon).font(.system(size: icon == "circle.fill" ? 8 : 12, weight: .semibold)).foregroundStyle(on ? .white : c); Text(name).font(.system(size: 14, weight: .medium)).lineLimit(1) }
        .padding(.horizontal, 12).frame(height: 36).foregroundStyle(on ? .white : .primary).background(on ? AnyShapeStyle(c) : AnyShapeStyle(.ultraThinMaterial), in: Capsule())
        .frame(minHeight: 44).contentShape(Rectangle())
    }.buttonStyle(Press())
  }
}

// ---------- the days ahead ----------
struct UpcomingView: View {
  @ObservedObject var s: Store; @ObservedObject var shell: Shell
  @State private var open: Item?
  var body: some View {
    let far = Day.from(today: 14), later = s.items.filter { !$0.done && $0.due > far }.sorted { $0.due < $1.due }, lists = Set(s.lists.map(\.id)), loose = s.items.filter { !$0.done && $0.due.isEmpty && !lists.contains($0.board) }.sorted { $0.order < $1.order }
    List {
      Text("Upcoming").font(.system(size: 40, weight: .bold)).tracking(-1.2).padding(.top, 24).padding(.bottom, 8).plainRow()
      ForEach(1..<15, id: \.self) { n in
        let key = Day.from(today: n), due = s.due(key), d = Day.date(key) ?? Date()
        if n < 8 || !due.isEmpty {
          HStack(alignment: .firstTextBaseline, spacing: 8) { Text(n == 1 ? "Tomorrow" : d.formatted(.dateTime.weekday(.wide))).font(.system(size: 17, weight: .bold)); Text(d.formatted(.dateTime.day().month(.abbreviated))).font(.system(size: 14)).foregroundStyle(.secondary) }.opacity(due.isEmpty ? 0.35 : 1).padding(.top, 16).plainRow()
          ForEach(due) { TaskRow(t: $0, s: s, showDue: false) { open = $0 } }
        }
      }
      if !later.isEmpty { Text("Later").font(.system(size: 17, weight: .bold)).padding(.top, 16).plainRow(); ForEach(later) { TaskRow(t: $0, s: s) { open = $0 } } }
      if !loose.isEmpty { Text("No date").font(.system(size: 17, weight: .bold)).padding(.top, 16).plainRow(); ForEach(loose) { TaskRow(t: $0, s: s) { open = $0 } } }
      Color.clear.frame(height: 32).plainRow()
    }
    .listStyle(.plain).scrollContentBackground(.hidden).background(alignment: .top) { Bloom() }
    .taskSheet($open, s, shell)
  }
}

// ---------- one task, on a sheet ----------
struct TaskSheet: View {
  @ObservedObject var s: Store; @ObservedObject var shell: Shell; let id: String
  @Environment(\.dismiss) private var dismiss
  @State private var title = ""
  @State private var notes = ""
  @State private var more = ""
  @State private var steps: [Step] = []
  @State private var step = ""
  @State private var loaded = false
  @State private var sure = false
  var body: some View {
    if let t = s.item(id), let b = s.board(t.board) {
      let c = Color(hex: b.color)
      ScrollView {
        VStack(alignment: .leading, spacing: 16) {
          HStack(alignment: .top, spacing: 12) {
            Button { tap(.medium); withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) { s.tick(id) } } label: { ZStack { Circle().stroke(t.done ? Color.tasks : Color.secondary.opacity(0.5), lineWidth: 2.2).background(Circle().fill(t.done ? Color.tasks : .clear)); if t.done { Image(systemName: "checkmark").font(.system(size: 14, weight: .bold)).foregroundStyle(.white) } }.frame(width: 30, height: 30).contentShape(Rectangle().inset(by: -7)) }.buttonStyle(Press())
            TextField("Task", text: $title, axis: .vertical).font(.system(size: 24, weight: .bold)).onChange(of: title) { _, v in if loaded { s.setTitle(id, v) } }
          }
          ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
              ForEach([(0, "Today"), (1, "Tomorrow"), (7, "Next week")], id: \.0) { w in let on = t.due == Day.from(today: w.0); pillButton(w.1, on: on) { s.setDue(id, on ? "" : Day.from(today: w.0)) } }
              DatePicker("", selection: Binding(get: { Day.date(t.due) ?? Date() }, set: { s.setDue(id, Day.key($0)) }), displayedComponents: .date).labelsHidden()
              if !t.due.isEmpty { pillButton("No date", on: false) { s.setDue(id, "") } }
            }.padding(.horizontal, 20)
          }.padding(.horizontal, -20).padding(.vertical, -4)
          HStack(spacing: 8) {
            Menu { ForEach(s.plainBoards) { x in Button(x.name) { withAnimation { s.move(id, toBoard: x.id) } } } } label: { pill(b.name, "circle.fill", c) }.buttonStyle(.plain)
            Menu { ForEach(b.columns) { x in Button(x.name) { withAnimation { s.move(id, to: x.id) } } } } label: { pill(b.columns.first { $0.id == t.column }?.name ?? "", "rectangle.split.3x1", .secondary) }.buttonStyle(.plain)
            Menu { Button("Does not repeat") { s.setRepeat(id, "") }; ForEach(Repeats.all, id: \.self) { r in Button(Repeats.name(r)) { s.setRepeat(id, r) } } } label: { pill(t.rep.isEmpty ? "Repeat" : Repeats.name(t.rep), "repeat", t.rep.isEmpty ? .secondary : .tasks) }.buttonStyle(.plain)
          }.padding(.vertical, -4)
          VStack(alignment: .leading, spacing: 12) {
            ForEach($steps) { $x in
              HStack(spacing: 12) { Button { tap(); withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) { x.done.toggle() }; s.setSteps(id, steps) } label: { Image(systemName: x.done ? "checkmark.square.fill" : "square").font(.system(size: 20)).foregroundStyle(x.done ? Color.tasks : .secondary).frame(width: 24, height: 24).contentShape(Rectangle().inset(by: -10)) }.buttonStyle(.plain)
                TextField("Step", text: $x.text).strikethrough(x.done).foregroundStyle(x.done ? .secondary : .primary).onChange(of: x.text) { _, _ in s.setSteps(id, steps) } }
            }
            HStack(spacing: 12) { Image(systemName: "plus.square").font(.system(size: 20)).foregroundStyle(.tertiary).frame(width: 24, height: 24); TextField("Add a step", text: $step).submitLabel(.done).onSubmit { if !step.trimmingCharacters(in: .whitespaces).isEmpty { withAnimation { steps.append(Step(id: Store.uid(), text: step, done: false)) }; s.setSteps(id, steps); step = "" } } }
          }.padding(16).background(Color(.systemBackground).opacity(0.7), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
          VStack(alignment: .leading, spacing: 12) {
            if t.richNotes {
              Text(t.notes).font(.system(size: 16)).textSelection(.enabled)
              Divider()
              TextField("Add to the notes", text: $more, axis: .vertical).font(.system(size: 16)).submitLabel(.done).onChange(of: more) { _, v in if v.contains("\n") { s.addToNotes(id, v.replacingOccurrences(of: "\n", with: "")); more = "" } }
              Text("These notes have formatting from Sleek Tasks on the web. What you add here goes beneath them.").font(.system(size: 12)).foregroundStyle(.secondary)
            } else { TextField("Notes", text: $notes, axis: .vertical).lineLimit(3...).font(.system(size: 16)).onChange(of: notes) { _, v in if loaded { s.setNotes(id, v) } } }
          }.padding(16).frame(maxWidth: .infinity, alignment: .leading).background(Color(.systemBackground).opacity(0.7), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
          if !t.tags.isEmpty || !t.who.isEmpty { HStack(spacing: 8) { if !t.who.isEmpty { Label(t.who, systemImage: "person").font(.system(size: 13)).foregroundStyle(.secondary) }; ForEach(t.tags, id: \.self) { Text($0).font(.system(size: 13, weight: .medium)).padding(.horizontal, 12).frame(height: 28).background(Color.primary.opacity(0.07), in: Capsule()) } } }
          Button(role: .destructive) { sure = true } label: { Label("Delete this task", systemImage: "trash").font(.system(size: 15)).frame(minHeight: 44).contentShape(Rectangle()) }.padding(.vertical, -8)
        }.padding(.horizontal, 20).padding(.top, 28).padding(.bottom, 32)
      }
      .scrollDismissesKeyboard(.interactively)
      .onAppear { if !loaded { title = t.title; notes = t.richNotes ? "" : t.notes; steps = t.steps; DispatchQueue.main.async { loaded = true } } }
      .confirmationDialog("Delete this task?", isPresented: $sure, titleVisibility: .visible) { Button("Delete", role: .destructive) { dismiss(); DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { withAnimation { s.removeTask(id) } } } }
    }
  }
  private func pill(_ name: String, _ icon: String, _ c: Color) -> some View {
    HStack(spacing: 8) { Image(systemName: icon).font(.system(size: icon == "circle.fill" ? 9 : 12)).foregroundStyle(c); Text(name).font(.system(size: 14, weight: .medium)).foregroundStyle(.primary).lineLimit(1) }.padding(.horizontal, 12).frame(height: 36).background(Color.primary.opacity(0.07), in: Capsule()).frame(minHeight: 44).contentShape(Rectangle())
  }
  private func pillButton(_ name: String, on: Bool, _ act: @escaping () -> Void) -> some View {
    Button { tap(); withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) { act() } } label: { Text(name).font(.system(size: 14, weight: .medium)).padding(.horizontal, 16).frame(height: 36).foregroundStyle(on ? .white : .primary).background(on ? AnyShapeStyle(Color.tasks) : AnyShapeStyle(Color.primary.opacity(0.07)), in: Capsule()).frame(minHeight: 44).contentShape(Rectangle()) }.buttonStyle(Press())
  }
}

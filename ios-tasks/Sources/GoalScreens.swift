// Sleek Tasks for iPhone: Goals. Something to reach by a day: days marked off, things ticked, or a number counted up.
//
//   The Goals tab lists what is going (a ring, how far along, ahead or behind) and what was reached. A goal opens
//   on its own screen: a calendar to mark days on, a list to tick, or a counter with a chart against the pace line.
//   New goal reads a sentence the way you'd tell a friend ("Read 12 books this year") and sets it up.
//   The rules are in ../ios-shared/Goals.swift, which the widgets share.
import SwiftUI
import Charts

extension Color { static let late = Color(hex: "#E5484D") }
struct GoalID: Identifiable, Hashable { let id: String }

/// A ring that fills to how far along a goal is, from where it was.
struct GoalRing<Inner: View>: View {
  let frac: Double, color: Color, size: CGFloat, width: CGFloat
  @ViewBuilder var inner: () -> Inner
  @State private var shown = 0.0
  var body: some View {
    ZStack {
      Circle().stroke(color.opacity(0.16), lineWidth: width)
      Circle().trim(from: 0, to: shown).stroke(color, style: StrokeStyle(lineWidth: width, lineCap: .round)).rotationEffect(.degrees(-90))
      inner()
    }.frame(width: size, height: size)
    .onAppear { withAnimation(.spring(response: 0.9, dampingFraction: 0.8).delay(0.08)) { shown = frac } }
    .onChange(of: frac) { _, f in withAnimation(.spring(response: 0.6, dampingFraction: 0.75)) { shown = f } }
  }
}
struct PacePill: View {
  let g: Goal
  var body: some View {
    let p = g.pace, c = p.behind ? Color.late : Color(hex: g.color)
    Text(p.text).font(.system(size: 12.5, weight: .semibold)).foregroundStyle(c).padding(.horizontal, 10).frame(height: 24).background(c.opacity(0.13), in: Capsule())
  }
}

// ---------- the Goals tab ----------
struct GoalsView: View {
  @ObservedObject var s: Store; @ObservedObject var shell: Shell
  static var launched = false
  @State private var open: GoalID?
  @State private var making = false
  private func go(_ id: String?) { guard let id, s.goal(id) != nil else { return }; shell.goGoal = nil; if open?.id == id { return }; open = nil; DispatchQueue.main.async { open = GoalID(id: id) } }
  var body: some View {
    let going = s.goals.filter { !$0.reached }, won = s.goals.filter(\.reached)
    ScrollView {
      VStack(alignment: .leading, spacing: 14) {
        HStack {
          VStack(alignment: .leading, spacing: 2) {
            Text("\(going.count) going" + (won.isEmpty ? "" : " · \(won.count) reached")).font(.system(size: 13, weight: .semibold)).foregroundStyle(.secondary).contentTransition(.numericText())
            Text("Goals").font(.system(size: 40, weight: .bold)).tracking(-1.2)
          }
          Spacer()
          Button { tap(); making = true } label: { Image(systemName: "plus").font(.system(size: 18, weight: .bold)).foregroundStyle(.white).frame(width: 44, height: 44).background(Color.tasks, in: Circle()).shadow(color: Color.tasks.opacity(0.4), radius: 10, y: 4) }.buttonStyle(Press()).accessibilityLabel("New goal")
        }.padding(.top, 24)
        ForEach(going) { g in Button { tap(); open = GoalID(id: g.id) } label: { GoalCard(g: g) }.buttonStyle(Press()).transition(.opacity.combined(with: .scale(scale: 0.96))) }
        Button { tap(); making = true } label: {
          HStack(spacing: 14) {
            Image(systemName: "plus").font(.system(size: 20, weight: .semibold)).foregroundStyle(Color.tasks).frame(width: 56, height: 56).background(Color.tasks.opacity(0.1), in: Circle())
            VStack(alignment: .leading, spacing: 2) { Text("New goal").font(.system(size: 16, weight: .semibold)); Text("A date, and something to mark off").font(.system(size: 14)).foregroundStyle(.secondary) }
            Spacer(minLength: 0)
          }.padding(16).frame(maxWidth: .infinity).overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).strokeBorder(Color.secondary.opacity(0.35), style: StrokeStyle(lineWidth: 1.5, dash: [6, 5]))).contentShape(Rectangle())
        }.buttonStyle(Press()).foregroundStyle(.primary)
        if !won.isEmpty {
          Text("REACHED").font(.system(size: 12, weight: .semibold)).tracking(1.4).foregroundStyle(.secondary).padding(.top, 14)
          ForEach(won) { g in Button { tap(); open = GoalID(id: g.id) } label: { GoalCard(g: g) }.buttonStyle(Press()) }
        }
      }.padding(.horizontal, 20).padding(.bottom, 32).animation(.spring(response: 0.4, dampingFraction: 0.85), value: s.goals)
    }
    .background(alignment: .top) { Bloom() }
    .navigationDestination(item: $open) { g in GoalView(s: s, shell: shell, id: g.id) }
    .sheet(isPresented: $making) { NewGoalView(s: s) { id in making = false; DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) { open = GoalID(id: id); shell.say("Goal started. It shows on your Goal widgets too.") } } }
    .onAppear {
      go(shell.goGoal)
      guard !GoalsView.launched else { return }      // the launch arguments open things once, not on every return to the list
      GoalsView.launched = true
      if Args.arg("--open") == "goal", open == nil, let g = s.goals.first { open = GoalID(id: g.id) }
      if Args.arg("--open") == "newgoal" { making = true }
    }
    .onChange(of: shell.goGoal) { _, id in go(id) }
  }
}

/// A goal in the list: its ring, how far along, its pace, and a strip of the last two weeks, its things, or a bar.
struct GoalCard: View {
  let g: Goal
  var body: some View {
    let c = Color(hex: g.color)
    HStack(alignment: .top, spacing: 14) {
      GoalRing(frac: g.frac, color: c, size: 56, width: 6) {
        if g.reached { Image(systemName: "checkmark").font(.system(size: 18, weight: .bold)).foregroundStyle(c) } else { Text("\(g.percent)%").font(.system(size: 13, weight: .bold)).monospacedDigit() }
      }
      VStack(alignment: .leading, spacing: 6) {
        Text(g.title).font(.system(size: 17, weight: .semibold)).multilineTextAlignment(.leading).lineLimit(2)
        Text(g.reached ? "Reached \(Date(timeIntervalSince1970: g.doneAt / 1000).formatted(.dateTime.month(.abbreviated).day())) · \(g.num(g.goal)) of \(g.amount(g.goal))" : g.sub).font(.system(size: 13.5)).foregroundStyle(.secondary)
        if !g.reached {
          PacePill(g: g)
          Group {
            if g.kind == .days { HStack(spacing: 3) { ForEach(-13...0, id: \.self) { o in let d = GDay.add(GDay.today, o); RoundedRectangle(cornerRadius: 3).fill(g.marks.contains(d) ? c : Color.primary.opacity(0.08)).overlay(RoundedRectangle(cornerRadius: 3).stroke(o == 0 && !g.marks.contains(d) ? c : .clear, lineWidth: 1.5)).frame(height: 14) } } }
            else if g.kind == .things { HStack(spacing: 3) { ForEach(g.things.prefix(40)) { t in Capsule().fill(t.done.isEmpty ? Color.primary.opacity(0.08) : c).frame(height: 6) } } }
            else { GeometryReader { geo in ZStack(alignment: .leading) { Capsule().fill(Color.primary.opacity(0.08)); Capsule().fill(c).frame(width: max(6, geo.size.width * g.frac)) } }.frame(height: 6) }
          }.padding(.top, 4)
        }
      }
      Spacer(minLength: 0)
    }
    .padding(16).frame(maxWidth: .infinity, alignment: .leading)
    .background(Color(.secondarySystemBackground).opacity(0.8), in: RoundedRectangle(cornerRadius: 24, style: .continuous))
    .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).stroke(c.opacity(0.18), lineWidth: 1))
    .foregroundStyle(.primary).opacity(g.reached ? 0.85 : 1)
  }
}

// ---------- one goal ----------
struct GoalView: View {
  @ObservedObject var s: Store; @ObservedObject var shell: Shell; let id: String
  @Environment(\.dismiss) private var dismiss
  @State private var won = false
  @State private var renaming = false
  @State private var name = ""
  @State private var dating = false
  @State private var due = Date()
  @State private var targeting = false
  @State private var target = ""
  @State private var deleting = false
  private func edit(_ f: (inout Rec) -> Void) { if s.edit(id, f) { tap(.heavy); DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) { withAnimation(.spring(response: 0.5, dampingFraction: 0.7)) { won = true } } } }
  var body: some View {
    if let g = s.goal(id) {
      let c = Color(hex: g.color)
      ScrollView {
        VStack(alignment: .leading, spacing: 18) {
          HStack(alignment: .center, spacing: 14) {
            VStack(alignment: .leading, spacing: 4) {
              Text("\(g.kindName) · by \(GDay.short(g.due))".uppercased()).font(.system(size: 12, weight: .semibold)).tracking(1.2).foregroundStyle(c)
              Text(g.title).font(.system(size: 30, weight: .bold)).tracking(-0.8).fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
            GoalRing(frac: g.frac, color: c, size: 84, width: 8) { Text("\(g.percent)%").font(.system(size: 19, weight: .bold)).monospacedDigit().contentTransition(.numericText()) }
          }.padding(.top, 8)
          HStack(spacing: 10) { PacePill(g: g); if !g.pace.hint.isEmpty { Text(g.pace.hint).font(.system(size: 13.5)).foregroundStyle(.secondary) } }
          switch g.kind {
          case .days: DaysPart(g: g, edit: edit)
          case .things: ThingsPart(g: g, edit: edit)
          case .count: CountPart(g: g, edit: edit, shell: shell)
          }
        }.padding(.horizontal, 20).padding(.bottom, 40)
      }
      .background(alignment: .top) { Bloom(c: c) }
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        Menu {
          Button { name = g.title; renaming = true } label: { Label("Rename", systemImage: "pencil") }
          Button { due = GDay.date(g.due) ?? Date(); dating = true } label: { Label("Change the Date", systemImage: "calendar") }
          if g.kind != .things { Button { target = String(g.target); targeting = true } label: { Label("Change the Target", systemImage: "target") } }
          Menu { ForEach(Goal.colors, id: \.self) { col in Button { tap(); edit { GoalEdit.set(&$0, color: col) } } label: { Label(col == g.color ? "This colour" : "Colour", systemImage: col == g.color ? "checkmark.circle.fill" : "circle.fill") }.tint(Color(hex: col)) } } label: { Label("Colour", systemImage: "paintpalette") }
          Divider()
          Button(role: .destructive) { deleting = true } label: { Label("Delete Goal", systemImage: "trash") }
        } label: { Image(systemName: "ellipsis.circle") }
      }
      .tint(c)
      .overlay { if won { Reached(g: g) { withAnimation(.easeOut(duration: 0.25)) { won = false } }.transition(.opacity) } }
      .alert("Rename", isPresented: $renaming) { TextField("Goal", text: $name); Button("Cancel", role: .cancel) {}; Button("Save") { edit { GoalEdit.set(&$0, title: name) } } }
      .alert("Target", isPresented: $targeting) { TextField("How many", text: $target).keyboardType(.numberPad); Button("Cancel", role: .cancel) {}; Button("Save") { if let n = Int(target.filter(\.isNumber)) { edit { GoalEdit.set(&$0, target: n) } } } } message: { Text(g.kind == .days ? "Days to mark off" : g.money ? "Dollars" : g.unit[1].capitalized) }
      .sheet(isPresented: $dating) {
        NavigationStack { DatePicker("By", selection: $due, in: (GDay.date(g.start) ?? Date())..., displayedComponents: .date).datePickerStyle(.graphical).tint(c).padding()
          .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dating = false } }; ToolbarItem(placement: .confirmationAction) { Button("Save") { edit { GoalEdit.set(&$0, due: GDay.key(due)) }; dating = false } } }
          .navigationTitle("Reach it by").navigationBarTitleDisplayMode(.inline) }.presentationDetents([.medium, .large])
      }
      .confirmationDialog("Delete this goal?", isPresented: $deleting, titleVisibility: .visible) { Button("Delete Goal", role: .destructive) { s.removeGoal(id); dismiss() } } message: { Text("It goes from Sleek Tasks and its widgets.") }
    } else { Text("This goal was deleted.").foregroundStyle(.secondary) }
  }
}

/// Three small numbers side by side.
struct Stats: View {
  let items: [(String, String, String)]      // big, small after it, label
  var body: some View {
    HStack(spacing: 10) {
      ForEach(Array(items.enumerated()), id: \.offset) { _, x in
        VStack(alignment: .leading, spacing: 2) {
          (Text(x.0).font(.system(size: 24, weight: .bold)) + Text(x.1).font(.system(size: 14, weight: .semibold)).foregroundColor(.secondary)).monospacedDigit().contentTransition(.numericText())
          Text(x.2).font(.system(size: 12.5, weight: .medium)).foregroundStyle(.secondary)
        }.padding(14).frame(maxWidth: .infinity, alignment: .leading).background(Color(.secondarySystemBackground).opacity(0.8), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
      }
    }
  }
}

// ---------- days: mark today, and any day gone by on the calendar ----------
struct DaysPart: View {
  let g: Goal; let edit: ((inout Rec) -> Void) -> Void
  @State private var pop = ""
  var body: some View {
    let c = Color(hex: g.color), did = g.markedToday
    VStack(alignment: .leading, spacing: 16) {
      Stats(items: [("\(g.marks.count)", "/\(g.target)", "days"), ("\(g.streak)", "", "day streak"), ("\(g.left)", "", "days left")])
      Button { tap(.medium); pop = GDay.today; withAnimation(.spring(response: 0.4, dampingFraction: 0.7)) { edit { GoalEdit.mark(&$0) } } } label: {
        HStack(spacing: 8) { if did { Image(systemName: "checkmark").font(.system(size: 16, weight: .bold)).transition(.scale.combined(with: .opacity)) }; Text(did ? "Marked today" : "Mark today") }
          .font(.system(size: 17, weight: .semibold)).foregroundStyle(did ? c : .white).frame(maxWidth: .infinity).frame(height: 54)
          .background(did ? c.opacity(0.13) : c, in: RoundedRectangle(cornerRadius: 18, style: .continuous)).shadow(color: did ? .clear : c.opacity(0.35), radius: 12, y: 5)
      }.buttonStyle(Press()).disabled(g.over && !did)
      VStack(spacing: 6) {
        HStack(spacing: 0) { ForEach(Array(["M", "T", "W", "T", "F", "S", "S"].enumerated()), id: \.offset) { _, d in Text(d).font(.system(size: 11, weight: .semibold)).foregroundStyle(.tertiary).frame(maxWidth: .infinity) } }
        ForEach(months, id: \.self) { m in month(m, c) }
      }.padding(14).background(Color(.secondarySystemBackground).opacity(0.8), in: RoundedRectangle(cornerRadius: 22, style: .continuous))
      Text("Tap any day gone by to mark it or unmark it").font(.system(size: 12.5)).foregroundStyle(.tertiary).frame(maxWidth: .infinity)
    }
  }
  /// The first day of each month from the goal's start to its day.
  private var months: [String] {
    var out: [String] = [], d = String(g.start.prefix(8)) + "01"
    while d <= g.due { out.append(d); let p = d.split(separator: "-").compactMap { Int($0) }; d = p[1] == 12 ? String(format: "%04d-01-01", p[0] + 1) : String(format: "%04d-%02d-01", p[0], p[1] + 1) }
    return out
  }
  private func month(_ first: String, _ c: Color) -> some View {
    let d0 = GDay.date(first) ?? Date(), n = Calendar.current.range(of: .day, in: .month, for: d0)?.count ?? 30, lead = (Calendar.current.component(.weekday, from: d0) + 5) % 7
    let days = (0..<n).map { GDay.add(first, $0) }
    return VStack(alignment: .leading, spacing: 6) {
      Text(d0.formatted(.dateTime.month(.wide).year())).font(.system(size: 13, weight: .semibold)).foregroundStyle(.secondary).padding(.top, 6).padding(.leading, 4)
      LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 5), count: 7), spacing: 5) {
        ForEach(0..<lead, id: \.self) { _ in Color.clear.frame(height: 36) }
        ForEach(days, id: \.self) { day in cell(day, c) }
      }
    }
  }
  @ViewBuilder private func cell(_ day: String, _ c: Color) -> some View {
    let on = g.marks.contains(day), inside = day >= g.start && day <= g.due, past = day <= GDay.today, isToday = day == GDay.today
    let num = Text(String(Int(day.suffix(2)) ?? 0)).font(.system(size: 14, weight: on ? .bold : .medium)).monospacedDigit()
    let shape = RoundedRectangle(cornerRadius: 10, style: .continuous)
    if inside && past {
      Button { tap(); pop = day; withAnimation(.spring(response: 0.35, dampingFraction: 0.6)) { edit { GoalEdit.mark(&$0, day) } } } label: {
        num.foregroundStyle(on ? .white : .primary).frame(maxWidth: .infinity).frame(height: 36)
          .background(on ? c : Color.primary.opacity(0.05), in: shape).overlay(shape.stroke(isToday && !on ? c : .clear, lineWidth: 2))
          .scaleEffect(pop == day && on ? 1.08 : 1).shadow(color: on ? c.opacity(0.35) : .clear, radius: pop == day ? 8 : 0)
      }.buttonStyle(.plain).accessibilityLabel(GDay.short(day) + (on ? ", marked" : ""))
    } else {
      num.foregroundStyle(inside ? Color.secondary : Color.secondary.opacity(0.35)).frame(maxWidth: .infinity).frame(height: 36)
        .overlay(alignment: .bottom) { if day == g.due { Circle().fill(c).frame(width: 5, height: 5).padding(.bottom, 3) } }
    }
  }
}

// ---------- things: a list to tick, each named as you go ----------
struct ThingsPart: View {
  let g: Goal; let edit: ((inout Rec) -> Void) -> Void
  @State private var focus: String?
  var body: some View {
    let rows = g.things.filter { $0.done.isEmpty } + g.things.filter { !$0.done.isEmpty }
    VStack(alignment: .leading, spacing: 12) {
      Stats(items: [(g.num(g.done), "/\(g.things.count)", "things"), ("\(g.openThings.count)", "", "to go"), ("\(g.left)", "", "days left")])
      VStack(spacing: 0) {
        ForEach(rows) { t in
          ThingLine(t: t, color: Color(hex: g.color), focus: $focus, tick: { withAnimation(.spring(response: 0.45, dampingFraction: 0.8)) { edit { GoalEdit.tick(&$0, t.id) } } }, name: { n in edit { GoalEdit.nameThing(&$0, t.id, n) } }, remove: { withAnimation { edit { GoalEdit.removeThing(&$0, t.id) } } })
          if t.id != rows.last?.id { Divider().padding(.leading, 52) }
        }
        Button { tap(); var made = ""; withAnimation { edit { made = GoalEdit.addThing(&$0) } }; focus = made } label: {
          HStack(spacing: 12) { Image(systemName: "plus").font(.system(size: 15, weight: .bold)).foregroundStyle(Color(hex: g.color)).frame(width: 28, height: 28).background(Color(hex: g.color).opacity(0.13), in: Circle()); Text("Add a thing").font(.system(size: 16, weight: .medium)); Spacer() }.padding(.vertical, 12).contentShape(Rectangle())
        }.buttonStyle(.plain)
      }.padding(.horizontal, 14).background(Color(.secondarySystemBackground).opacity(0.8), in: RoundedRectangle(cornerRadius: 22, style: .continuous))
    }
  }
}
struct ThingLine: View {
  let t: Goal.Thing, color: Color; @Binding var focus: String?
  let tick: () -> Void, name: (String) -> Void, remove: () -> Void
  @State private var text = ""
  @FocusState private var on: Bool
  @State private var burst = false
  var body: some View {
    let done = !t.done.isEmpty
    HStack(spacing: 12) {
      Button { tap(.medium); burst = true; DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { burst = false }; tick() } label: {
        ZStack { Circle().stroke(done ? color : Color.secondary.opacity(0.5), lineWidth: 2).background(Circle().fill(done ? color : .clear)); if done { Image(systemName: "checkmark").font(.system(size: 12, weight: .bold)).foregroundStyle(.white).transition(.scale.combined(with: .opacity)) } }
          .frame(width: 28, height: 28).scaleEffect(burst ? 1.2 : 1).shadow(color: burst ? color.opacity(0.6) : .clear, radius: 8).contentShape(Rectangle().inset(by: -8))
      }.buttonStyle(.plain).accessibilityLabel(done ? "Untick" : "Tick")
      TextField("Name this thing", text: $text, axis: .vertical).font(.system(size: 16, weight: .medium)).foregroundStyle(done ? .secondary : .primary).strikethrough(done, color: .secondary).focused($on).submitLabel(.done)
        .onSubmit { on = false }
      if done { Text(GDay.short(t.done)).font(.system(size: 12.5, weight: .medium)).foregroundStyle(.tertiary) }
    }.padding(.vertical, 10)
    .contextMenu { Button(role: .destructive, action: remove) { Label("Delete", systemImage: "trash") } }
    .onAppear { text = t.name; if focus == t.id { on = true; focus = nil } }
    .onChange(of: focus) { _, f in if f == t.id { on = true; focus = nil } }
    .onChange(of: t.name) { _, n in if !on { text = n } }
    .onChange(of: on) { _, now in if !now && text != t.name { name(text.trimmingCharacters(in: .whitespacesAndNewlines)) } }
  }
}

// ---------- a number: count it up, against the pace line ----------
struct CountPart: View {
  let g: Goal; let edit: ((inout Rec) -> Void) -> Void; @ObservedObject var shell: Shell
  var body: some View {
    let c = Color(hex: g.color)
    VStack(alignment: .leading, spacing: 16) {
      HStack(alignment: .center) {
        VStack(alignment: .leading, spacing: 0) {
          Text(g.num(g.done)).font(.system(size: 54, weight: .bold)).tracking(-2).monospacedDigit().contentTransition(.numericText(value: g.done))
          Text("of \(g.amount(g.goal))").font(.system(size: 15, weight: .medium)).foregroundStyle(.secondary)
        }
        Spacer()
        Button { tap(); withAnimation(.spring(response: 0.4, dampingFraction: 0.75)) { var any = true; edit { any = GoalEdit.undoToday(&$0) }; if !any { shell.say("Only today's can be taken off here") } } } label: { Image(systemName: "minus").font(.system(size: 20, weight: .bold)).frame(width: 56, height: 56).background(Color.primary.opacity(0.07), in: Circle()) }.buttonStyle(Press()).foregroundStyle(.primary).accessibilityLabel("Take one off")
        Button { tap(.medium); withAnimation(.spring(response: 0.4, dampingFraction: 0.75)) { edit { GoalEdit.add(&$0, g.step) } } } label: { Image(systemName: "plus").font(.system(size: 22, weight: .bold)).foregroundStyle(.white).frame(width: 64, height: 64).background(c, in: Circle()).shadow(color: c.opacity(0.4), radius: 12, y: 5) }.buttonStyle(Press()).accessibilityLabel("Add \(g.amount(g.step))")
      }
      VStack(alignment: .leading, spacing: 8) {
        GoalChart(g: g).frame(height: 150)
        HStack(spacing: 14) { Label { Text("You") } icon: { Capsule().fill(c).frame(width: 14, height: 4) }; Label { Text("Pace to \(GDay.short(g.due))") } icon: { Capsule().stroke(Color.secondary, style: StrokeStyle(lineWidth: 1.5, dash: [3, 3])).frame(width: 14, height: 3) } }.font(.system(size: 12, weight: .medium)).foregroundStyle(.secondary)
      }.padding(14).background(Color(.secondarySystemBackground).opacity(0.8), in: RoundedRectangle(cornerRadius: 22, style: .continuous))
      Text("ADDED").font(.system(size: 12, weight: .semibold)).tracking(1.4).foregroundStyle(.secondary).padding(.top, 4)
      if g.log.isEmpty { Text("Nothing added yet. Press + each time you get one closer.").font(.system(size: 15)).foregroundStyle(.secondary) }
      VStack(spacing: 0) {
        ForEach(g.log.reversed()) { e in EntryLine(e: e, g: g) { n in edit { GoalEdit.note(&$0, e.id, n) } }; if e.id != g.log.first?.id { Divider() } }
      }.padding(.horizontal, 14).background(g.log.isEmpty ? Color.clear : Color(.secondarySystemBackground).opacity(0.8), in: RoundedRectangle(cornerRadius: 22, style: .continuous))
    }
  }
}
struct EntryLine: View {
  let e: Goal.Entry, g: Goal; let save: (String) -> Void
  @State private var text = ""
  @FocusState private var on: Bool
  var body: some View {
    HStack(spacing: 12) {
      Text(e.day == GDay.today ? "Today" : GDay.short(e.day)).font(.system(size: 13, weight: .semibold)).foregroundStyle(.secondary).frame(width: 52, alignment: .leading)
      TextField("Add a note", text: $text).font(.system(size: 15.5)).focused($on).submitLabel(.done)
      Text("+" + g.num(e.amount)).font(.system(size: 14, weight: .semibold)).foregroundStyle(Color(hex: g.color)).monospacedDigit()
    }.padding(.vertical, 12)
    .onAppear { text = e.note }
    .onChange(of: on) { _, now in if !now && text != e.note { save(text) } }
  }
}
struct GoalChart: View {
  let g: Goal
  var body: some View {
    let c = Color(hex: g.color), start = GDay.date(g.start) ?? Date(), end = GDay.date(g.due) ?? Date(), now = min(GDay.date(GDay.today) ?? Date(), end)
    var pts: [(Date, Double)] = [(start, 0)]
    var total = 0.0
    for e in g.log.sorted(by: { $0.day < $1.day }) { let d = GDay.date(e.day) ?? start; pts.append((d, total)); total += e.amount; pts.append((d, total)) }
    pts.append((now, total))
    return Chart {
      ForEach(Array(pts.enumerated()), id: \.offset) { _, p in
        AreaMark(x: .value("Day", p.0), y: .value("Total", p.1), series: .value("s", "you")).foregroundStyle(LinearGradient(colors: [c.opacity(0.28), c.opacity(0.02)], startPoint: .top, endPoint: .bottom)).interpolationMethod(.linear)
        LineMark(x: .value("Day", p.0), y: .value("Total", p.1), series: .value("s", "you")).foregroundStyle(c).lineStyle(StrokeStyle(lineWidth: 2.6, lineCap: .round, lineJoin: .round))
      }
      LineMark(x: .value("Day", start), y: .value("Total", 0), series: .value("s", "pace")).foregroundStyle(Color.secondary.opacity(0.7)).lineStyle(StrokeStyle(lineWidth: 1.5, dash: [4, 4]))
      LineMark(x: .value("Day", end), y: .value("Total", g.goal), series: .value("s", "pace")).foregroundStyle(Color.secondary.opacity(0.7)).lineStyle(StrokeStyle(lineWidth: 1.5, dash: [4, 4]))
      PointMark(x: .value("Day", now), y: .value("Total", total)).foregroundStyle(c).symbolSize(70)
    }
    .chartXScale(domain: start...max(end, start.addingTimeInterval(86400)))
    .chartYScale(domain: 0...max(g.goal, total))
    .chartYAxis { AxisMarks(position: .trailing, values: .automatic(desiredCount: 3)) { v in AxisGridLine().foregroundStyle(Color.primary.opacity(0.06)); AxisValueLabel { if let n = v.as(Double.self) { Text(g.num(n)) } } } }
    .chartXAxis {      // a short goal is marked by day ("Nov 15"), a long one by month
      if end.timeIntervalSince(start) < 120 * 86400 { AxisMarks(values: .automatic(desiredCount: 3)) { _ in AxisValueLabel(format: .dateTime.month(.abbreviated).day()) } }
      else { AxisMarks(values: .stride(by: .month, count: Int((end.timeIntervalSince(start) / 86400 / 30 / 4).rounded(.up)))) { _ in AxisValueLabel(format: .dateTime.month(.abbreviated)) } }
    }
  }
}

/// A goal just reached: a tick that blooms, and what it took.
struct Reached: View {
  let g: Goal; let close: () -> Void
  @State private var shown = false
  var body: some View {
    let c = Color(hex: g.color), days = max(1, GDay.between(g.start, GDay.today) + 1)
    ZStack {
      Rectangle().fill(.ultraThinMaterial).ignoresSafeArea().onTapGesture(perform: close)
      VStack(spacing: 14) {
        ZStack {
          Circle().fill(c.opacity(0.25)).frame(width: 150).blur(radius: 30).scaleEffect(shown ? 1.3 : 0.4)
          Circle().fill(c).frame(width: 96).shadow(color: c.opacity(0.5), radius: 20).scaleEffect(shown ? 1 : 0.3)
          Image(systemName: "checkmark").font(.system(size: 44, weight: .bold)).foregroundStyle(.white).scaleEffect(shown ? 1 : 0.2).rotationEffect(.degrees(shown ? 0 : -30))
        }
        Text("Goal reached").font(.system(size: 30, weight: .bold)).tracking(-0.8)
        Text(g.title).font(.system(size: 17, weight: .medium)).multilineTextAlignment(.center)
        Text("\(g.amount(g.goal)), \(days) \(days == 1 ? "day" : "days") after you started").font(.system(size: 14)).foregroundStyle(.secondary)
        Button { tap(); close() } label: { Text("Lovely").font(.system(size: 17, weight: .semibold)).foregroundStyle(.white).frame(width: 180, height: 50).background(c, in: Capsule()) }.buttonStyle(Press()).padding(.top, 8)
      }.padding(32).opacity(shown ? 1 : 0).offset(y: shown ? 0 : 24)
    }
    .onAppear { UINotificationFeedbackGenerator().notificationOccurred(.success); withAnimation(.spring(response: 0.6, dampingFraction: 0.6)) { shown = true } }
  }
}

// ---------- new goal ----------
struct NewGoalView: View {
  @ObservedObject var s: Store; let made: (String) -> Void
  @Environment(\.dismiss) private var dismiss
  @State private var text = ""
  @State private var draft: GoalParse.Draft?
  @State private var color: String?
  @State private var due = Date()
  @FocusState private var typing: Bool
  static let ideas = ["Run 30 days by New Year", "Accomplish these 20 things this year", "Read 12 books this year", "Save $2,000 by March", "Meditate every day for 6 weeks"]
  private func read(_ t: String) {
    guard !t.trimmingCharacters(in: .whitespaces).isEmpty else { withAnimation(.spring(response: 0.4, dampingFraction: 0.85)) { draft = nil }; return }
    let p = GoalParse.parse(t); if p.kind != draft?.kind { color = nil }
    withAnimation(.spring(response: 0.4, dampingFraction: 0.85)) { draft = p }; due = GDay.date(p.due) ?? Date()
  }
  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: 18) {
          VStack(alignment: .leading, spacing: 2) { Text("NEW GOAL").font(.system(size: 12, weight: .semibold)).tracking(1.4).foregroundStyle(.secondary); Text("What's the goal?").font(.system(size: 30, weight: .bold)).tracking(-0.8) }
          TextField("Run 30 days by New Year", text: $text, axis: .vertical).font(.system(size: 19, weight: .medium)).focused($typing).submitLabel(.done)
            .padding(.horizontal, 16).padding(.vertical, 14).background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(typing ? Color(hex: color ?? draft.map { Goal.color(for: $0.kind) } ?? "#12A36A").opacity(0.6) : .clear, lineWidth: 2))
            .shadow(color: typing ? Color(hex: color ?? "#12A36A").opacity(0.18) : .clear, radius: 14).animation(.easeOut(duration: 0.25), value: typing)
            .onChange(of: text) { _, t in read(t) }
            .onSubmit { if draft != nil { start() } }
          ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) { ForEach(NewGoalView.ideas, id: \.self) { i in Button { tap(); text = i } label: { Text(i).font(.system(size: 14, weight: .medium)).padding(.horizontal, 14).frame(height: 36).background(Color.primary.opacity(0.06), in: Capsule()) }.buttonStyle(Press()).foregroundStyle(.primary) } }
          }.padding(.horizontal, -20).contentMargins(.horizontal, 20, for: .scrollContent)
          if let d = draft { details(d).transition(.opacity.combined(with: .move(edge: .bottom))) }
          else { Text("Say it the way you'd tell a friend. Add a date like “by March” or “this year”, and a number of days, things, or anything to count.").font(.system(size: 15)).foregroundStyle(.secondary) }
        }.padding(20)
      }
      .scrollDismissesKeyboard(.interactively)
      .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
      .onAppear { typing = true; if let t = Args.arg("--goal") { text = t } }
    }
    .presentationDragIndicator(.visible)
  }
  private func details(_ d: GoalParse.Draft) -> some View {
    let c = Color(hex: color ?? Goal.color(for: d.kind))
    let kinds: [(Goal.Kind, String, String, String)] = [(.days, "Days", "Mark off days", "calendar.badge.checkmark"), (.things, "Things", "A list to tick", "checklist"), (.count, "Number", "Count up", "chart.line.uptrend.xyaxis")]
    let span = GDay.between(GDay.today, d.due) + 1
    return VStack(alignment: .leading, spacing: 18) {
      VStack(alignment: .leading, spacing: 8) {
        Text("TRACK IT BY").font(.system(size: 12, weight: .semibold)).tracking(1.4).foregroundStyle(.secondary)
        HStack(spacing: 8) {
          ForEach(kinds, id: \.0) { k in
            let on = d.kind == k.0
            Button { tap(); withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) { draft?.kind = k.0; if k.0 == .days { draft?.target = min(d.target, span) }; color = nil } } label: {
              VStack(spacing: 4) { Image(systemName: k.3).font(.system(size: 19, weight: .semibold)); Text(k.1).font(.system(size: 14, weight: .semibold)); Text(k.2).font(.system(size: 11)).foregroundStyle(.secondary) }
                .foregroundStyle(on ? c : .primary).frame(maxWidth: .infinity).padding(.vertical, 12)
                .background(on ? c.opacity(0.12) : Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(on ? c : .clear, lineWidth: 1.5))
            }.buttonStyle(Press())
          }
        }
      }
      HStack(spacing: 10) {
        HStack {
          VStack(alignment: .leading, spacing: 0) {
            Text(d.kind == .count && d.unit[0] == "$" ? "$" + d.target.formatted() : String(d.target)).font(.system(size: 22, weight: .bold)).monospacedDigit().contentTransition(.numericText())
            Text(d.kind == .days ? "days" : d.kind == .things ? "things" : d.unit[0] == "$" ? "dollars" : d.unit[1]).font(.system(size: 12.5)).foregroundStyle(.secondary)
          }
          Spacer(minLength: 4)
          Stepper("Target", onIncrement: { step(d, 1) }, onDecrement: { step(d, -1) }).labelsHidden()
        }.padding(.horizontal, 14).frame(height: 64).background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        HStack {
          VStack(alignment: .leading, spacing: 0) { Text(GDay.short(d.due)).font(.system(size: 22, weight: .bold)); Text("by · \(span) days").font(.system(size: 12.5)).foregroundStyle(.secondary) }
          Spacer(minLength: 0)
        }.padding(.horizontal, 14).frame(height: 64).background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay { DatePicker("By", selection: $due, in: Calendar.current.date(byAdding: .day, value: 1, to: Date())!..., displayedComponents: .date).labelsHidden().tint(c).blendMode(.destinationOver).opacity(0.02) }
        .onChange(of: due) { _, nd in let k = GDay.key(nd); if k != draft?.due { draft?.due = k; if draft?.kind == .days { draft?.target = min(draft?.target ?? 1, GDay.between(GDay.today, k) + 1) } } }
      }
      VStack(alignment: .leading, spacing: 8) {
        Text("COLOUR").font(.system(size: 12, weight: .semibold)).tracking(1.4).foregroundStyle(.secondary)
        HStack(spacing: 12) { ForEach(Goal.colors, id: \.self) { col in let on = (color ?? Goal.color(for: d.kind)) == col
          Button { tap(); withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) { color = col } } label: { Circle().fill(Color(hex: col)).frame(width: 34, height: 34).overlay(Circle().stroke(Color(.systemBackground), lineWidth: on ? 3 : 0).padding(3)).overlay(Circle().stroke(Color(hex: col), lineWidth: on ? 2 : 0)).scaleEffect(on ? 1.1 : 1).frame(width: 44, height: 44) }.buttonStyle(.plain).accessibilityLabel("Colour") } }
      }
      Button(action: start) { Text("Start goal").font(.system(size: 17, weight: .semibold)).foregroundStyle(.white).frame(maxWidth: .infinity).frame(height: 54).background(c, in: RoundedRectangle(cornerRadius: 18, style: .continuous)).shadow(color: c.opacity(0.4), radius: 12, y: 5) }
        .buttonStyle(Press()).disabled(d.title.isEmpty).opacity(d.title.isEmpty ? 0.5 : 1).padding(.top, 4)
    }
  }
  private func step(_ d: GoalParse.Draft, _ dir: Int) {
    tap(); let by = d.kind == .count && d.unit[0] == "$" ? 100 : 1
    var t = max(1, d.target + dir * by); if d.kind == .days { t = min(t, GDay.between(GDay.today, d.due) + 1) }; if d.kind == .things { t = min(t, 200) }
    withAnimation { draft?.target = t }
  }
  private func start() {
    guard let d = draft, !d.title.isEmpty else { return }
    tap(.medium); let id = s.addGoal(d, color: color); made(id)
  }
}

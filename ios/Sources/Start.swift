// A new tab. An ordinary one is your day, arranged as you like it (Layout.swift): what is due from Sleek Tasks, to
// tick off and add to; your goals; your three apps; the decks and pages you last worked on; your bookmarks and where
// you go most. Press and hold anything there and it all wiggles: drag, take off, add back, and set each section's options.
// A private one shows none of that: only what Private Browsing does.
import SwiftUI

struct StartView: View {
  @ObservedObject var b: Browser; @Binding var sheet: Sheet?
  @State private var newTask = ""
  @FocusState private var adding: Bool
  @State private var composing = false
  @State private var pressingTile = false          // the New task tile has opened into a box to type in
  @Namespace private var addNS
  @State private var shown = false                 // the page has come in (each part rises in turn)
  // arranging (Layout.swift): what is being dragged, where everything is, and which sheet is open
  struct Lift: Equatable { let key: String, part: Part, tile: String?; let grab: CGSize; var at: CGPoint }
  @State private var lift: Lift?
  @State private var frames: [String: CGRect] = [:]
  @State private var viewport: CGRect = .zero
  @State private var scrolled = Date.distantPast
  enum EditSheet: Identifiable { case add, options(Part); var id: String { if case .options(let p) = self { return p.rawValue }; return "add" } }
  @State private var edit: EditSheet?
  @State private var cameBack: Part?               // a section just added back, to scroll to
  private var hello: String { let h = Calendar.current.component(.hour, from: Date()); return h < 12 ? "Good morning." : h < 18 ? "Good afternoon." : "Good evening." }
  private var sub: String {
    let n = b.day.today.count, late = b.day.late.count, get = b.day.toGet
    let bits = (late > 0 ? ["\(late) overdue"] : []) + (get > 0 ? ["\(get) thing\(get == 1 ? "" : "s") to get"] : [])
    return (n == 0 ? "Nothing due today" : "\(n) task\(n == 1 ? "" : "s") for today") + (bits.count == 2 ? ", \(bits[0]) and \(bits[1])" : bits.count == 1 ? ", and \(bits[0])" : "") + "."
  }
  /// The sections showing: all of yours while arranging; otherwise those with something in them.
  private var showing: [Part] { b.parts.filter { b.arranging || has($0) } }
  private func has(_ p: Part) -> Bool {
    switch p { case .today: true; case .goals: !b.goalsOnPage.isEmpty; case .apps: !b.appsOnPage.isEmpty; case .recent: !b.recentOnPage.isEmpty; case .marks: !b.marksOnPage.isEmpty; case .most: !b.mostOnPage.isEmpty }
  }
  var body: some View {
    ScrollViewReader { proxy in
      ScrollView {
        VStack(alignment: .leading, spacing: 24) {
          brand.padding(.top, 8)
            .background(GeometryReader { g in Color.clear.onAppear { b.brandAt = g.frame(in: .global) }.onChange(of: g.frame(in: .global)) { _, f in b.brandAt = f } })
            .opacity(b.launch == .done ? 1 : 0)          // while Sleek opens, its mark is on its way here
          VStack(alignment: .leading, spacing: 4) { Text(hello).font(.system(size: 34, weight: .bold)).tracking(-1); Text(b.day.loaded ? sub : " ").font(.system(size: 17)).foregroundStyle(.secondary) }.rise(shown, 1)
          ForEach(Array(showing.enumerated()), id: \.element) { i, p in section(p).id(p).rise(shown, 2 + i) }
          if b.arranging && !b.partsOff.isEmpty {
            Text("\(b.partsOff.count) taken off · Add brings \(b.partsOff.count == 1 ? "it" : "them") back").font(.system(size: 13)).foregroundStyle(.secondary).frame(maxWidth: .infinity).transition(.opacity)
          }
        }
        .padding(.horizontal, 20).padding(.top, (b.barAtTop ? 68 : 0) + (b.arranging && !b.barAtTop ? 52 : 0)).padding(.bottom, (b.barAtTop ? 40 : 112) + (b.arranging && b.barAtTop ? 60 : 0))
        .background { if b.arranging { Color.clear.contentShape(Rectangle()).onTapGesture { done() } } }      // a tap on empty space: done
        .onPreferenceChange(Frames.self) { frames = $0 }
      }
      .scrollDisabled(lift != nil)
      .background(GeometryReader { g in Color.clear.onAppear { viewport = g.frame(in: .global) }.onChange(of: g.frame(in: .global)) { _, f in viewport = f } })
      .onChange(of: lift?.at) { _, at in follow(at, proxy) }
      .onChange(of: cameBack) { _, p in guard let p else { return }; DispatchQueue.main.asyncAfter(deadline: .now() + 0.45) { withAnimation(.spring(response: 0.6, dampingFraction: 0.86)) { proxy.scrollTo(p, anchor: .center) }; cameBack = nil } }
    }
    .scrollDismissesKeyboard(.interactively)
    .refreshable { await b.freshenToday() }          // pull down: your tasks again, without the ones you have ticked off
    .background(alignment: .top) { bloom.opacity(shown ? 1 : 0).scaleEffect(shown ? 1 : 0.6, anchor: .top).animation(.easeOut(duration: 0.9), value: shown) }
    .overlay(alignment: b.barAtTop ? .bottom : .top) { if b.arranging { controls.transition(.move(edge: b.barAtTop ? .bottom : .top).combined(with: .opacity)) } }
    .sheet(item: $edit) { e in
      Group { if case .options(let p) = e { StartOptions(b: b, part: p) } else { StartAdd(b: b) { cameBack = $0 } } }.presentationDetents([.medium, .large]).presentationDragIndicator(.visible)
    }
    .onAppear { Work.shared.refresh(); if b.launch == .done || b.launch == .flying { DispatchQueue.main.async { shown = true } } }
    .onChange(of: b.launch) { _, now in if now == .flying { shown = true } }      // the page comes in as the mark flies to it
    .onDisappear { b.brandAt = nil; b.arranging = false }
    .onChange(of: adding) { _, on in if !on && composing && newTask.trimmingCharacters(in: .whitespaces).isEmpty { withAnimation(.spring(response: 0.42, dampingFraction: 0.85)) { composing = false } } }      // left with nothing typed: back to the tile
  }
  /// Sleek's mark turns into place and the name slides in beside it.
  private var brand: some View {
    HStack(spacing: 12) {
      Mark(size: 30).rotationEffect(.degrees(shown ? 0 : -90)).scaleEffect(shown ? 1 : 0.4).opacity(shown ? 1 : 0)
        .animation(.spring(response: 0.7, dampingFraction: 0.62), value: shown)
      Text("Sleek").font(.system(size: 26, weight: .bold)).tracking(-1).opacity(shown ? 1 : 0).offset(x: shown ? 0 : -14).blur(radius: shown ? 0 : 6)
        .animation(.spring(response: 0.6, dampingFraction: 0.85).delay(0.08), value: shown)
    }
  }
  /// The soft light at the top of the page, in Sleek's colours.
  private var bloom: some View {
    ZStack { Circle().fill(Color.sleekA.opacity(0.32)).frame(width: 300).offset(x: -120, y: -150); Circle().fill(Color.sleekC.opacity(0.24)).frame(width: 280).offset(x: 140, y: -170) }.blur(radius: 70).allowsHitTesting(false)
  }

  // ---------- arranging ----------
  /// Add and Done, floating at the edge away from the bar while the page wiggles.
  private var controls: some View {
    HStack {
      Button { tap(); edit = .add } label: { Label("Add", systemImage: "plus").font(.system(size: 15, weight: .semibold)).padding(.horizontal, 16).frame(height: 40).background(.regularMaterial, in: Capsule()).overlay(Capsule().stroke(Color.primary.opacity(0.1), lineWidth: 0.5)) }
        .foregroundStyle(.primary).buttonStyle(Press())
      Spacer()
      Button { done() } label: { Text("Done").font(.system(size: 15, weight: .bold)).padding(.horizontal, 20).frame(height: 40).foregroundStyle(Color(.systemBackground)).background(Color.primary, in: Capsule()) }.buttonStyle(Press())
    }
    .shadow(color: .black.opacity(0.15), radius: 12, y: 4)
    .padding(.horizontal, 16).padding(.top, 6).padding(.bottom, 10)
    .background {                                     // the page fades beneath them, so they never sit on top of a tile
      Rectangle().fill(.ultraThinMaterial).overlay(Color(.systemBackground).opacity(0.6))
        .mask(LinearGradient(stops: [.init(color: .black, location: 0), .init(color: .black, location: 0.6), .init(color: .clear, location: 1)], startPoint: b.barAtTop ? .bottom : .top, endPoint: b.barAtTop ? .top : .bottom))
        .padding(b.barAtTop ? .top : .bottom, -36).ignoresSafeArea().allowsHitTesting(false)
    }
  }
  private func begin() {
    guard !b.arranging else { return }
    tap(.heavy); adding = false; composing = false
    withAnimation(.spring(response: 0.4, dampingFraction: 0.78)) { b.arranging = true }
  }
  private func done() { tap(); withAnimation(.spring(response: 0.4, dampingFraction: 0.85)) { lift = nil; b.arranging = false } }
  /// The "−" that takes a section or a tile off the page.
  private func minus(_ label: String, _ act: @escaping () -> Void) -> some View {
    Button { tap(.medium); act() } label: {
      Image(systemName: "minus").font(.system(size: 12, weight: .heavy)).foregroundStyle(.primary).frame(width: 24, height: 24)
        .background(.regularMaterial, in: Circle()).overlay(Circle().stroke(Color.primary.opacity(0.14), lineWidth: 0.5)).shadow(color: .black.opacity(0.2), radius: 4, y: 2)
        .frame(width: 44, height: 44).contentShape(Circle())
    }.buttonStyle(Press()).accessibilityLabel(label).transition(.scale(scale: 0.3).combined(with: .opacity))
  }
  /// Hold a moment, then drag: the section or tile lifts and follows your finger, and the others make room.
  private func arrange(_ key: String, _ p: Part, _ tile: String?) -> HoldDrag {
    HoldDrag(on: b.arranging, began: { start in
      guard lift == nil, let f = frames[key] else { return }
      // a section leaves a hold on one of its tiles to the tile
      if tile == nil, frames.contains(where: { $0.key.hasPrefix("t:\(p.rawValue):") && $0.value.insetBy(dx: -8, dy: -8).contains(start) }) { return }
      tap(.medium); withAnimation(.spring(response: 0.28, dampingFraction: 0.7)) { lift = Lift(key: key, part: p, tile: tile, grab: CGSize(width: start.x - f.minX, height: start.y - f.minY), at: start) }
    }, moved: { at in
      guard lift?.key == key else { return }
      lift?.at = at; reorder()
    }, ended: {
      guard lift?.key == key else { return }
      withAnimation(.spring(response: 0.36, dampingFraction: 0.78)) { lift = nil }
    })
  }
  /// How far the lifted thing is from its place: under your finger (a section moves up and down only).
  private func lifted(_ key: String) -> CGSize {
    guard let l = lift, l.key == key, let f = frames[key] else { return .zero }
    return CGSize(width: l.tile == nil ? 0 : l.at.x - l.grab.width - f.minX, height: l.at.y - l.grab.height - f.minY)
  }
  /// Past the middle of a neighbouring section, or over another tile in its section, the two swap.
  private func reorder() {
    guard let l = lift else { return }
    if let t = l.tile {
      let prefix = "t:\(l.part.rawValue):"
      let near = frames.filter { $0.key.hasPrefix(prefix) && $0.key != l.key }.map { (id: String($0.key.dropFirst(prefix.count)), d: hypot($0.value.midX - l.at.x, $0.value.midY - l.at.y)) }.min { $0.d < $1.d }
      if let n = near, n.d < 56 { tap(); b.moveTile(l.part, t, to: n.id) }
    } else {
      let on = showing; guard let i = on.firstIndex(of: l.part) else { return }
      var to = i
      for (j, q) in on.enumerated() where q != l.part { guard let f = frames["s:" + q.rawValue] else { continue }; if j < i && l.at.y < f.midY { to = min(to, j) }; if j > i && l.at.y > f.midY { to = max(to, j) } }
      if to != i, let k = b.parts.firstIndex(of: on[to]) { tap(); b.movePart(l.part, to: k) }
    }
  }
  /// Dragged near the top or the foot of the screen, the page moves on to the next section.
  private func follow(_ at: CGPoint?, _ proxy: ScrollViewProxy) {
    guard let at, let l = lift, Date().timeIntervalSince(scrolled) > 0.55, let i = showing.firstIndex(of: l.part) else { return }
    if at.y > viewport.maxY - (b.barAtTop ? 70 : 120), i + 1 < showing.count { scrolled = Date(); withAnimation(.easeInOut(duration: 0.45)) { proxy.scrollTo(showing[i + 1], anchor: .bottom) } }
    else if at.y < viewport.minY + (b.barAtTop ? 150 : 110), i > 0 { scrolled = Date(); withAnimation(.easeInOut(duration: 0.45)) { proxy.scrollTo(showing[i - 1], anchor: .top) } }
  }
  /// A section, wiggling while you arrange: its "−", its options, and dragging it.
  private func section(_ p: Part) -> some View {
    let key = "s:" + p.rawValue, up = lift?.key == key
    return content(p)
      .frame(maxWidth: .infinity, alignment: .leading)
      .modifier(Jiggle(on: b.arranging && lift?.part != p, amount: 0.5, seed: key))
      .scaleEffect(up ? 1.03 : 1).shadow(color: .black.opacity(up ? 0.22 : 0), radius: 22, y: 12)
      .overlay(alignment: .topLeading) { if b.arranging && !up { minus("Take \(p.name) off the page") { b.takeOff(p) }.offset(x: -22, y: -22) } }
      .offset(lifted(key))
      .frame(maxWidth: .infinity, alignment: .leading)      // its place on the page, which the lifted section leaves behind
      .background { if b.arranging { GeometryReader { g in Color.clear.preference(key: Frames.self, value: [key: g.frame(in: .global)]) } } }
      .contentShape(Rectangle().inset(by: b.arranging ? -26 : 0))      // its "−" sits over its corner, and is reached there too
      .onTapGesture { if b.arranging { tap(); edit = .options(p) } }      // while arranging, a tap opens its options
      .modifier(arrange(key, p, nil))      // alongside the page's scrolling: a quick swipe scrolls, a hold lifts
      .simultaneousGesture(LongPressGesture(minimumDuration: 0.45).onEnded { _ in begin() }, including: b.arranging ? .subviews : .all)
      .zIndex(lift?.part == p ? 10 : 0)
      .transaction { if up { $0.animation = nil } }
      .transition(.scale(scale: 0.85, anchor: .top).combined(with: .opacity))
  }
  /// A tile in a section, wiggling while you arrange, with its own "−", dragged within its section.
  private func chrome<V: View>(_ p: Part, _ id: String, _ name: String, @ViewBuilder _ v: () -> V) -> some View {
    let key = "t:\(p.rawValue):\(id)", up = lift?.key == key
    return ZStack {
      v().allowsHitTesting(!b.arranging)
        .modifier(Jiggle(on: b.arranging && !up, amount: 1.5, seed: key))
        .scaleEffect(up ? 1.1 : 1).shadow(color: .black.opacity(up ? 0.28 : 0), radius: 16, y: 10)
        .overlay(alignment: .topLeading) { if b.arranging && !up { minus("Take \(name) off the page") { b.takeOffTile(p, id) }.offset(x: -20, y: -20) } }
        .offset(lifted(key))
    }
    .background { if b.arranging { GeometryReader { g in Color.clear.preference(key: Frames.self, value: [key: g.frame(in: .global)]) } } }
    .contentShape(Rectangle().inset(by: b.arranging ? -22 : 0))
    .modifier(arrange(key, p, id))
    .zIndex(up ? 10 : 0)
    .transaction { if up { $0.animation = nil } }
    .transition(.scale(scale: 0.4).combined(with: .opacity))
  }

  // ---------- the sections ----------
  @ViewBuilder private func content(_ p: Part) -> some View {
    switch p {
    case .today: today
    case .goals: titled(p) { goalsPart }
    case .apps: titled(p) { appsPart }
    case .recent: titled(p) { recent }
    case .marks: titled(p) { tiles(.marks, b.marksOnPage) }
    case .most: titled(p) { tiles(.most, b.mostOnPage) }
    }
  }
  private func titled<V: View>(_ p: Part, @ViewBuilder _ v: () -> V) -> some View { VStack(alignment: .leading, spacing: 12) { header(p); v() } }
  private func header(_ p: Part) -> some View {
    HStack {
      head(p.name).padding(.leading, b.arranging ? 16 : 0); Spacer()      // room for its "−" while arranging
      if b.arranging {
        Button { tap(); edit = .options(p) } label: { Label("Options", systemImage: "slider.horizontal.3").font(.system(size: 12, weight: .semibold)).padding(.horizontal, 10).frame(height: 26).background(Color.primary.opacity(0.08), in: Capsule()) }
          .foregroundStyle(.primary).buttonStyle(Press()).padding(.vertical, -6).transition(.opacity.combined(with: .scale(scale: 0.8)))
      } else if p == .today {
        Button { sheet = .tasks } label: { Text("All").font(.system(size: 13, weight: .semibold)).frame(minWidth: 44, minHeight: 44, alignment: .trailing).contentShape(Rectangle()) }.foregroundStyle(Color.tasks).padding(.vertical, -14)
      }
    }
  }
  private func card<V: View>(@ViewBuilder _ v: () -> V) -> some View { v().padding(16).frame(maxWidth: .infinity, alignment: .leading).background(Color(.secondarySystemBackground).opacity(0.75), in: RoundedRectangle(cornerRadius: 24, style: .continuous)).overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).stroke(Color.primary.opacity(0.06), lineWidth: 0.5)) }
  private func head(_ t: String) -> some View { Text(t.uppercased()).font(.system(size: 12, weight: .semibold)).tracking(1.4).foregroundStyle(.secondary) }
  private func hint(_ t: String) -> some View { Text(t).font(.system(size: 14)).foregroundStyle(.secondary).frame(maxWidth: .infinity, alignment: .leading).padding(16).background(RoundedRectangle(cornerRadius: 20, style: .continuous).strokeBorder(Color.primary.opacity(0.15), style: StrokeStyle(lineWidth: 1, dash: [5, 4]))) }
  private var today: some View {
    card {
      VStack(alignment: .leading, spacing: 12) {
        header(.today)
        VStack(alignment: .leading, spacing: 12) {
          if b.option("todayAdd") { newTask_ }
          let rows = b.dueToday, lists = b.option("todayLists") ? b.day.lists : [], done = b.option("todayDone") ? b.doneToday : []
          ForEach(lists) { TodayList(l: $0, b: b).transition(.opacity.combined(with: .scale(scale: 0.97, anchor: .top))) }
          if rows.isEmpty && done.isEmpty && lists.isEmpty && !composing { Text(b.day.loaded ? "Nothing is due today." : "Opening your tasks…").font(.system(size: 15)).foregroundStyle(.secondary).padding(.vertical, 4) }
          ForEach(rows.prefix(5)) { TaskLine(t: $0, b: b).transition(.opacity) }
          // ticked off, a task stays here struck through; pull the page down and it slides away
          ForEach(done.prefix(2)) { TaskLine(t: $0, b: b).transition(.asymmetric(insertion: .opacity, removal: .opacity.combined(with: .move(edge: .trailing)))) }
        }.allowsHitTesting(!b.arranging)
      }
    }
  }
  /// Adding a task: a tile in Tasks green, which opens into a box to type in (and folds back when you are done).
  @ViewBuilder private var newTask_: some View {
    let shape = RoundedRectangle(cornerRadius: composing ? 16 : 22, style: .continuous)
    if composing {
      HStack(spacing: 10) {
        Image(systemName: "plus").font(.system(size: 14, weight: .bold)).foregroundStyle(.white).frame(width: 28, height: 28).background(Color.tasks, in: Circle()).matchedGeometryEffect(id: "icon", in: addNS)
        TextField("What needs doing today?", text: $newTask).font(.system(size: 16)).focused($adding).submitLabel(.done).onSubmit { finish(add: true) }
        Button { finish(add: !newTask.trimmingCharacters(in: .whitespaces).isEmpty) } label: {
          Image(systemName: newTask.trimmingCharacters(in: .whitespaces).isEmpty ? "xmark" : "arrow.up").font(.system(size: 13, weight: .bold)).frame(width: 30, height: 30)
            .foregroundStyle(newTask.trimmingCharacters(in: .whitespaces).isEmpty ? Color.secondary : .white)
            .background(newTask.trimmingCharacters(in: .whitespaces).isEmpty ? Color.primary.opacity(0.08) : Color.tasks, in: Circle())
            .frame(width: 44, height: 44).contentShape(Rectangle())
        }.buttonStyle(Press()).accessibilityLabel(newTask.isEmpty ? "Close" : "Add")
      }
      .padding(.leading, 10).padding(.trailing, 2).frame(height: 52).frame(maxWidth: .infinity)
      .background { shape.fill(Color(.systemBackground)).matchedGeometryEffect(id: "tile", in: addNS) }
      .overlay(shape.stroke(Color.tasks, lineWidth: 1.5)).shadow(color: Color.tasks.opacity(0.3), radius: 16, y: 6)
      .transition(.opacity)
    } else {
      HStack(spacing: 10) {
        Image(systemName: "plus").font(.system(size: 14, weight: .bold)).foregroundStyle(.white).frame(width: 28, height: 28).background(Color.tasks, in: Circle()).matchedGeometryEffect(id: "icon", in: addNS)
        Text("New task").font(.system(size: 15, weight: .semibold)).foregroundStyle(Color.tasks)
      }
      .padding(.leading, 8).padding(.trailing, 18).frame(height: 44)
      .background { shape.fill(Color.tasks.opacity(0.13)).matchedGeometryEffect(id: "tile", in: addNS) }
      .contentShape(.interaction, shape)
      .scaleEffect(pressingTile ? 0.96 : 1).animation(.spring(response: 0.25, dampingFraction: 0.7), value: pressingTile)
      .onLongPressGesture(minimumDuration: 0, maximumDistance: 12, perform: {}, onPressingChanged: { pressingTile = $0 })
      .simultaneousGesture(TapGesture().onEnded {
        tap(); withAnimation(.spring(response: 0.42, dampingFraction: 0.82)) { composing = true }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.12) { adding = true }
      })
      .transition(.opacity).accessibilityElement(children: .ignore).accessibilityLabel("New task for today").accessibilityAddTraits(.isButton)
    }
  }
  /// Add what was typed (if anything), and fold the box back into its tile.
  private func finish(add: Bool) {
    let t = newTask.trimmingCharacters(in: .whitespaces)
    if add && !t.isEmpty { b.addTask(t) }
    newTask = ""; adding = false
    withAnimation(.spring(response: 0.42, dampingFraction: 0.85)) { composing = false }
  }

  // ---------- goals ----------
  @ViewBuilder private var goalsPart: some View {
    let gs = b.goalsOnPage
    if gs.isEmpty { hint(b.goals.isEmpty ? "Set a goal in Sleek Tasks and it shows here, to move on with a tap." : "Choose goals to show here in this section's options.") }
    else if b.goalLook == "bars" { VStack(spacing: 10) { ForEach(gs) { goalBar($0) } }.allowsHitTesting(!b.arranging) }
    else { HStack(alignment: .top, spacing: 10) { ForEach(gs.prefix(3)) { goalRing($0) } }.allowsHitTesting(!b.arranging) }
  }
  private func goalRing(_ g: Goal) -> some View {
    let c = Color(hex: g.color)
    return VStack(spacing: 10) {
      Button { openGoal(g) } label: {
        VStack(spacing: 8) {
          ZStack {
            Circle().stroke(c.opacity(0.18), lineWidth: 6)
            Circle().trim(from: 0, to: g.frac).stroke(c, style: StrokeStyle(lineWidth: 6, lineCap: .round)).rotationEffect(.degrees(-90))
            Text("\(g.percent)%").font(.system(size: 13, weight: .bold).monospacedDigit()).contentTransition(.numericText())
          }.frame(width: 54, height: 54).animation(.spring(response: 0.6, dampingFraction: 0.8), value: g.frac)
          Text(g.title).font(.system(size: 13, weight: .semibold)).foregroundStyle(.primary).multilineTextAlignment(.center).lineLimit(2).frame(maxWidth: .infinity, minHeight: 34, alignment: .top)
        }
      }.buttonStyle(Press())
      goalButton(g, wide: true)
    }
    .padding(.horizontal, 8).padding(.vertical, 14).frame(maxWidth: .infinity)
    .background { ZStack { RoundedRectangle(cornerRadius: 22, style: .continuous).fill(c.opacity(0.28)).blur(radius: 16).offset(y: 8).padding(10); RoundedRectangle(cornerRadius: 22, style: .continuous).fill(Color(.secondarySystemBackground)) } }
    .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(c.opacity(0.25), lineWidth: 0.8))
  }
  private func goalBar(_ g: Goal) -> some View {
    let c = Color(hex: g.color)
    return HStack(spacing: 12) {
      Button { openGoal(g) } label: {
        VStack(alignment: .leading, spacing: 8) {
          HStack { Text(g.title).font(.system(size: 15, weight: .semibold)).foregroundStyle(.primary).lineLimit(1); Spacer(minLength: 6); Text("\(g.num(g.done))/\(g.num(g.goal))").font(.system(size: 13, weight: .semibold).monospacedDigit()).foregroundStyle(.secondary).contentTransition(.numericText()) }
          GeometryReader { geo in ZStack(alignment: .leading) { Capsule().fill(c.opacity(0.16)); Capsule().fill(c).frame(width: max(6, geo.size.width * g.frac)) } }.frame(height: 6).animation(.spring(response: 0.6, dampingFraction: 0.8), value: g.frac)
        }.contentShape(Rectangle())
      }.buttonStyle(Press())
      goalButton(g, wide: false)
    }
    .padding(14).background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(c.opacity(0.22), lineWidth: 0.8))
  }
  /// One tap to move a goal on: mark today, add one step, or tick the next thing.
  private func goalButton(_ g: Goal, wide: Bool) -> some View {
    let c = Color(hex: g.color), did = g.kind == .days && g.markedToday
    let icon = g.kind == .count ? "plus" : "checkmark", word = g.kind == .days ? (did ? "Today" : "Mark today") : g.kind == .count ? g.amount(g.step) : "Next"
    return Button { b.stepGoal(g) } label: {
      Group {
        if wide { Label(word, systemImage: icon).font(.system(size: 12, weight: .bold)).labelStyle(Tight()).lineLimit(1).minimumScaleFactor(0.8).padding(.horizontal, 8).frame(maxWidth: .infinity).frame(height: 30) }
        else { Image(systemName: icon).font(.system(size: 14, weight: .bold)).frame(width: 36, height: 36) }
      }
      .foregroundStyle(did ? c : .white)
      .background(did ? c.opacity(0.16) : c, in: Capsule())
      .frame(minHeight: 44).contentShape(Rectangle())
    }.buttonStyle(Press()).accessibilityLabel(g.kind == .days ? (did ? "Unmark today on \(g.title)" : "Mark today on \(g.title)") : g.kind == .count ? "Add \(word) to \(g.title)" : "Tick the next thing off \(g.title)")
  }
  struct Tight: LabelStyle { func makeBody(configuration: Configuration) -> some View { HStack(spacing: 4) { configuration.icon; configuration.title } } }
  /// A goal opens in Sleek Tasks, where goals are kept.
  private func openGoal(_ g: Goal) {
    tap(); guard let u = URL(string: "sleek-tasks://goal?id=\(g.id)") else { return }
    UIApplication.shared.open(u) { ok in if !ok { b.say("Goals are kept in Sleek Tasks for iPhone") } }
  }

  // ---------- Sleek's apps ----------
  @ViewBuilder private var appsPart: some View {
    let list = b.appsOnPage
    if list.isEmpty { hint("Choose Sleek's apps for here in this section's options.") }
    else if b.tileStyle == "icons" { HStack(spacing: 12) { ForEach(list, id: \.self) { a in chrome(.apps, a, a.capitalized) { app(a.capitalized, a, Color(hex: a == "slides" ? "#7C5CFF" : a == "docs" ? "#0A84FF" : "#12A36A")) } } } }
    else {                                              // the same glass as the site tiles, three square across
      LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 12), count: 3), spacing: 12) { ForEach(Array(list.enumerated()), id: \.element) { i, a in
        chrome(.apps, a, a.capitalized) {
          Button { guard !b.arranging else { return }; tap(); b.open("sleek://app/\(a).html") } label: { SiteTile(host: a, name: a.capitalized, style: b.tileStyle, wide: false, big: false, app: a) }.buttonStyle(Press())
        }
        .opacity(shown ? 1 : 0).offset(y: shown ? 0 : 16).animation(.spring(response: 0.55, dampingFraction: 0.8).delay(0.25 + Double(i) * 0.055), value: shown)
      } }
    }
  }
  private func app(_ name: String, _ file: String, _ c: Color) -> some View {
    Button { guard !b.arranging else { return }; tap(); b.open("sleek://app/\(file).html") } label: {
      VStack(alignment: .leading, spacing: 12) { AppIcon(app: file); Text(name).font(.system(size: 16, weight: .semibold)).foregroundStyle(.primary) }
      .padding(16).frame(maxWidth: .infinity, alignment: .leading)
      .background { ZStack { RoundedRectangle(cornerRadius: 24, style: .continuous).fill(c.opacity(0.35)).blur(radius: 16).offset(y: 8).padding(8); RoundedRectangle(cornerRadius: 24, style: .continuous).fill(Color(.secondarySystemBackground)) } }
      .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).stroke(c.opacity(0.25), lineWidth: 0.8))
    }.buttonStyle(Press())
  }

  // ---------- your decks and pages ----------
  @ViewBuilder private var recent: some View {
    let list = b.recentOnPage
    if list.isEmpty { hint("The decks and pages you work on in Sleek will show here.") }
    else {
      ScrollView(.horizontal, showsIndicators: false) { HStack(spacing: 14) { ForEach(Array(list.enumerated()), id: \.element.id) { i, r in
        Button { tap(); b.open(r.url) } label: { RecentTile(r: r) }.buttonStyle(Press())
          .opacity(shown ? 1 : 0).offset(y: shown ? 0 : 14)
          .animation(.spring(response: 0.55, dampingFraction: 0.82).delay(0.3 + Double(i) * 0.06), value: shown)
      } }.padding(.vertical, 6) }.scrollClipDisabled().allowsHitTesting(!b.arranging)
    }
  }

  // ---------- bookmarks, and where you go most: tiles as you chose them ----------
  struct Place: Identifiable, Hashable { let host: String, name: String, url: String; var id: String { url } }
  /// The tiles of a section, in the look you chose (⋯ › Appearance › Site Tiles, or Tile look here): glass tiles, wide or
  /// square, in a grid or a row; or plain icons, four to a row. Bookmarks also have a tile for choosing more while arranging.
  @ViewBuilder private func tiles(_ p: Part, _ list: [Place]) -> some View {
    let more = p == .marks && b.arranging
    if list.isEmpty && !more { hint("The sites you go to most will show here.") }
    else if b.tileStyle == "icons" {
      LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8, alignment: .top), count: 4), spacing: 16) {
        ForEach(list) { pl in chrome(p, p == .marks ? pl.url : pl.host, pl.name) { place(pl) } }
        if more { addMarks(icon: true) }
      }
    } else if b.tileLayout == "row" {
      let wide = b.tileShape == "wide"
      ScrollView(.horizontal, showsIndicators: false) {
        HStack(spacing: 12) {
          ForEach(Array(list.enumerated()), id: \.element.id) { i, pl in tile(p, pl, i, big: true).containerRelativeFrame(.horizontal, count: wide ? 5 : 2, span: wide ? 4 : 1, spacing: 12) }
          if more { addMarks(icon: false).containerRelativeFrame(.horizontal, count: wide ? 5 : 2, span: wide ? 4 : 1, spacing: 12) }
        }.scrollTargetLayout().padding(.vertical, 22)
      }
      .scrollTargetBehavior(.viewAligned).contentMargins(.horizontal, 20, for: .scrollContent).padding(.horizontal, -20).padding(.vertical, -22)
    } else {
      LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 12), count: b.tileShape == "wide" ? 2 : 3), spacing: 12) {
        ForEach(Array(list.enumerated()), id: \.element.id) { i, pl in tile(p, pl, i, big: false) }
        if more { addMarks(icon: false) }
      }
    }
  }
  private func tile(_ p: Part, _ pl: Place, _ i: Int, big: Bool) -> some View {
    chrome(p, p == .marks ? pl.url : pl.host, pl.name) {
      Button { guard !b.arranging else { return }; tap(); b.open(pl.url) } label: { SiteTile(host: pl.host, name: pl.name, style: b.tileStyle, wide: b.tileShape == "wide", big: big) }.buttonStyle(Press())
    }
    .opacity(shown ? 1 : 0).offset(y: shown ? 0 : 16).scaleEffect(shown ? 1 : 0.97)
    .animation(.spring(response: 0.55, dampingFraction: 0.8).delay(0.4 + Double(i) * 0.055), value: shown)
  }
  /// One place as a plain icon, 56 wide, its name centred beneath.
  private func place(_ p: Place) -> some View {
    Button { guard !b.arranging else { return }; tap(); b.open(p.url) } label: { VStack(spacing: 8) { SiteIcon(host: p.host, size: 56); Text(p.name).font(.system(size: 11)).foregroundStyle(.secondary).lineLimit(1).minimumScaleFactor(0.9).frame(width: 72).frame(width: 56) } }.buttonStyle(Press())
  }
  /// While arranging, the end of Bookmarks: a dashed tile for choosing which bookmarks are on the page.
  private func addMarks(icon: Bool) -> some View {
    Button { tap(); edit = .options(.marks) } label: {
      let shape = RoundedRectangle(cornerRadius: icon ? 15 : 20, style: .continuous)
      Group {
        if icon { VStack(spacing: 8) { Image(systemName: "plus").font(.system(size: 20, weight: .semibold)).frame(width: 56, height: 56).background(shape.strokeBorder(Color.primary.opacity(0.3), style: StrokeStyle(lineWidth: 1.2, dash: [5, 4]))); Text("Add").font(.system(size: 11)).foregroundStyle(.secondary) } }
        else { Color.clear.aspectRatio(b.tileShape == "wide" ? 16 / 9 : 1, contentMode: .fit).overlay { Label("Bookmarks", systemImage: "plus").font(.system(size: 13, weight: .semibold)).labelStyle(Tight()) }.background(shape.strokeBorder(Color.primary.opacity(0.3), style: StrokeStyle(lineWidth: 1.2, dash: [5, 4]))) }
      }.foregroundStyle(.secondary)
    }.buttonStyle(Press()).accessibilityLabel("Choose bookmarks for the start page").transition(.scale(scale: 0.6).combined(with: .opacity))
  }
}

/// Where each section and tile is, while the page is being arranged.
struct Frames: PreferenceKey {
  static let defaultValue: [String: CGRect] = [:]
  static func reduce(value: inout [String: CGRect], nextValue: () -> [String: CGRect]) { value.merge(nextValue()) { $1 } }
}

/// A little wiggle, as icons do on the Home Screen while it is being arranged. Each thing keeps its own time, so they
/// never move together.
/// Hold a moment, then drag, without stopping the page from scrolling: the system's own long press (a quick swipe fails it
/// and the page scrolls; a still finger wins it and the page stops). Points are in the screen's space.
struct HoldDrag: ViewModifier {
  var on: Bool
  var began: (CGPoint) -> Void
  var moved: (CGPoint) -> Void
  var ended: () -> Void
  func body(content: Content) -> some View {
    if #available(iOS 18.0, *) {
      content.gesture(Recogniser(on: on, began: began, moved: moved, ended: ended))
    } else {
      content.simultaneousGesture(
        LongPressGesture(minimumDuration: 0.18, maximumDistance: 8).sequenced(before: DragGesture(minimumDistance: 0, coordinateSpace: .global))
          .onChanged { v in guard case .second(true, let d?) = v else { return }; if d.translation == .zero { began(d.startLocation) } else { moved(d.location) } }
          .onEnded { _ in ended() },
        including: on ? .all : .subviews)
    }
  }
  @available(iOS 18.0, *)
  struct Recogniser: UIGestureRecognizerRepresentable {
    var on: Bool
    var began: (CGPoint) -> Void
    var moved: (CGPoint) -> Void
    var ended: () -> Void
    func makeUIGestureRecognizer(context: Context) -> UILongPressGestureRecognizer {
      let g = UILongPressGestureRecognizer(); g.minimumPressDuration = 0.18; g.allowableMovement = 8; g.delegate = context.coordinator; g.isEnabled = on; return g
    }
    func updateUIGestureRecognizer(_ g: UILongPressGestureRecognizer, context: Context) { if g.isEnabled != on { g.isEnabled = on } }
    func handleUIGestureRecognizerAction(_ g: UILongPressGestureRecognizer, context: Context) {
      let at = context.converter.location(in: .global)
      switch g.state { case .began: began(at); case .changed: moved(at); case .ended, .cancelled, .failed: ended(); default: break }
    }
    func makeCoordinator(converter: CoordinateSpaceConverter) -> Coordinator { Coordinator() }
    /// Alongside the taps and the other holds on the page, but not alongside its scrolling: one or the other.
    final class Coordinator: NSObject, UIGestureRecognizerDelegate {
      func gestureRecognizer(_ g: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith o: UIGestureRecognizer) -> Bool { !(o.view is UIScrollView) }
    }
  }
}

struct Jiggle: ViewModifier {
  let on: Bool, amount: Double, seed: String
  func body(content: Content) -> some View {
    let phase = Double(seed.unicodeScalars.reduce(0) { ($0 &* 31 &+ Int($1.value)) % 997 }) / 997 * 2 * .pi
    TimelineView(.animation(minimumInterval: nil, paused: !on)) { t in
      let s = t.date.timeIntervalSinceReferenceDate * 2 * .pi * 2.4 + phase
      content.rotationEffect(.degrees(on ? sin(s) * amount : 0)).offset(y: on ? cos(s * 1.3) * 0.6 : 0)
    }
  }
}

/// Add to Start Page: the sections taken off, to bring back, and how tiles look.
struct StartAdd: View {
  @ObservedObject var b: Browser
  var brought: (Part) -> Void = { _ in }
  @Environment(\.dismiss) private var dismiss
  var body: some View {
    NavigationStack {
      Form {
        Section("Sections") {
          let off = b.parts.count < Part.allCases.count ? Part.allCases.filter { b.partsOff.contains($0) } : []
          if off.isEmpty { Text("Everything is on your start page. Take a section off with − and it waits here.").font(.system(size: 15)).foregroundStyle(.secondary) }
          ForEach(off) { p in
            Button { tap(.medium); b.bringBack(p); brought(p); dismiss() } label: {
              HStack(spacing: 14) {
                Image(systemName: p.icon).font(.system(size: 18, weight: .semibold)).foregroundStyle(p.color).frame(width: 40, height: 40).background(p.color.opacity(0.15), in: RoundedRectangle(cornerRadius: 11, style: .continuous))
                VStack(alignment: .leading, spacing: 2) { Text(p.name).font(.system(size: 16, weight: .semibold)).foregroundStyle(.primary); Text(p.blurb).font(.system(size: 13)).foregroundStyle(.secondary) }
                Spacer(minLength: 4)
                Text("Add").font(.system(size: 14, weight: .bold)).foregroundStyle(.white).padding(.horizontal, 14).frame(height: 30).background(p.color, in: Capsule())
              }.contentShape(Rectangle())
            }.buttonStyle(.plain)
          }
        }
        TileLook(b: b)
      }
      .navigationTitle("Add to Start Page").navigationBarTitleDisplayMode(.inline)
      .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
    }
  }
}

/// How tiles look, for Bookmarks, Where you go most and Sleek's apps: a preview of each style, then shape and layout.
struct TileLook: View {
  @ObservedObject var b: Browser
  /// Shape and layout are for the site tiles; Sleek's own apps stay three across.
  var shapes = true
  var body: some View {
    Section {
      HStack(spacing: 10) { ForEach([("clear", "Clear Glass"), ("colour", "Colour Glass"), ("icons", "Icons")], id: \.0) { s in
        Button { tap(); b.choose("tileStyle", s.0) } label: {
          VStack(spacing: 8) {
            Group { if s.0 == "icons" { AppIcon(app: "tasks", size: 40).frame(maxWidth: .infinity).frame(height: 64) } else { SiteTile(host: "tasks", name: "Tasks", style: s.0, wide: false, big: false, app: "tasks").frame(width: 64) } }
            Text(s.1).font(.system(size: 12, weight: .semibold)).foregroundStyle(b.tileStyle == s.0 ? Color.sleekB : .secondary)
          }
          .padding(.vertical, 10).frame(maxWidth: .infinity)
          .background(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(b.tileStyle == s.0 ? Color.sleekB : .clear, lineWidth: 2))
        }.buttonStyle(.plain).accessibilityAddTraits(b.tileStyle == s.0 ? .isSelected : [])
      } }
      if shapes && b.tileStyle != "icons" {
        Choice(options: [("square", "Square", "square"), ("wide", "Wide", "rectangle")], value: b.tileShape) { b.choose("tileShape", $0) }
        Choice(options: [("grid", "Grid", "square.grid.2x2"), ("row", "Row", "rectangle.split.3x1")], value: b.tileLayout) { b.choose("tileLayout", $0) }
      }
    } header: { Text("Tile look") } footer: { Text(shapes ? "For Bookmarks, Where you go most and Sleek's apps, which stay three across." : "For Sleek's apps, Bookmarks and Where you go most. Shape and layout are in those two sections' options.") }
  }
}

/// Two or three choices side by side; the highlight slides to the one you tap.
struct Choice: View {
  let options: [(id: String, name: String, icon: String)]
  let value: String
  let pick: (String) -> Void
  @Namespace private var ns
  var body: some View {
    HStack(spacing: 4) {
      ForEach(options, id: \.id) { o in
        let on = o.id == value
        Button { guard !on else { return }; tap(); pick(o.id) } label: {
          Group { if o.icon.isEmpty { Text(o.name) } else { Label(o.name, systemImage: o.icon) } }.font(.system(size: 14, weight: on ? .semibold : .medium))
            .foregroundStyle(on ? Color.primary : .secondary).frame(maxWidth: .infinity).frame(height: 36)
            .background { if on { Capsule().fill(Color(.systemBackground)).shadow(color: .black.opacity(0.12), radius: 6, y: 2).matchedGeometryEffect(id: "on", in: ns) } }
            .contentShape(Capsule())
        }.buttonStyle(.plain).accessibilityAddTraits(on ? .isSelected : [])
      }
    }
    .padding(3).background(Color.primary.opacity(0.07), in: Capsule())
    .animation(.spring(response: 0.38, dampingFraction: 0.82), value: value)
  }
}

/// A section's options, from tapping it (or its Options) while arranging.
struct StartOptions: View {
  @ObservedObject var b: Browser
  let part: Part
  @Environment(\.dismiss) private var dismiss
  private func toggle(_ key: String, _ title: String, _ sub: String) -> some View {
    Toggle(isOn: Binding(get: { b.option(key) }, set: { tap(); b.setting(key, $0) })) { VStack(alignment: .leading, spacing: 2) { Text(title); Text(sub).font(.system(size: 13)).foregroundStyle(.secondary) } }
  }
  var body: some View {
    NavigationStack {
      Form { form }
        .navigationTitle(part.name).navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
    }
  }
  @ViewBuilder private var form: some View {
    switch part {
    case .today:
      Section { toggle("todayLists", "Grocery lists", "Today's list, with things to tick"); toggle("todayDone", "Just done", "What you ticked off today"); toggle("todayAdd", "New task", "A box to add a task for today") }
    case .goals:
      Section("Look") { Choice(options: [("rings", "Rings", "circle.circle"), ("bars", "Bars", "chart.bar.xaxis")], value: b.goalLook) { b.choose("goalLook", $0) } }
      Section {
        let going = b.goals.filter { !$0.reached }
        if going.isEmpty { Text("Set a goal in Sleek Tasks, in its Goals tab, and it can show here.").foregroundStyle(.secondary) }
        ForEach(going) { g in
          Toggle(isOn: Binding(get: { !b.goalsOff.contains(g.id) }, set: { tap(); b.showGoal(g.id, $0) })) {
            HStack(spacing: 12) { Circle().fill(Color(hex: g.color)).frame(width: 10, height: 10); VStack(alignment: .leading, spacing: 2) { Text(g.title); Text(g.sub).font(.system(size: 13)).foregroundStyle(.secondary) } }
          }
        }
      } header: { Text("Goals to show") } footer: { Text("Rings show three at a time. New goals you make in Sleek Tasks show here until you switch them off.") }
    case .apps:
      Section("On the page") { ForEach(["slides", "docs", "tasks"], id: \.self) { a in
        Toggle(isOn: Binding(get: { b.appsOnPage.contains(a) }, set: { tap(); b.setApp(a, on: $0) })) { HStack(spacing: 12) { AppIcon(app: a, size: 30); Text("Sleek " + a.capitalized) } }
      } }
      TileLook(b: b, shapes: false)
    case .recent:
      Section { toggle("recentDecks", "Decks", "From Sleek Slides"); toggle("recentPages", "Pages", "From Sleek Docs") }
      Section("How many") { Choice(options: [("3", "3", ""), ("6", "6", "")], value: String(b.recentCount)) { b.choose("recentN", number: Int($0) ?? 6) } }
    case .marks:
      Section {
        let all = b.allMarks, on = Set(b.marksOnPage.map(\.url))
        if all.isEmpty { Text("Bookmark a page with ⋯ › Add Bookmark and it can go here.").foregroundStyle(.secondary) }
        ForEach(all) { m in
          Toggle(isOn: Binding(get: { on.contains(m.url) }, set: { tap(); b.setMark(m.url, on: $0) })) { HStack(spacing: 12) { SiteIcon(host: m.host, size: 30); VStack(alignment: .leading, spacing: 2) { Text(m.name).lineLimit(1); Text(m.host).font(.system(size: 13)).foregroundStyle(.secondary).lineLimit(1) } } }
        }
      } header: { Text("On the page") } footer: { Text("Taking one off the page keeps it in Bookmarks.") }
      TileLook(b: b)
    case .most:
      TileLook(b: b)
      if !(b.store.settings["hiddenTop"] as? [String] ?? []).isEmpty {
        Section { Button("Show the Sites You Took Off Again") { tap(); b.store.set("hiddenTop", [String]()); b.objectWillChange.send() } }
      }
    }
  }
}

/// A new private tab: what Private Browsing does, and nothing of yours.
struct PrivateStartView: View {
  @ObservedObject var b: Browser; @Binding var sheet: Sheet?
  @State private var shown = false
  var body: some View {
    VStack(alignment: .leading, spacing: 20) {
      Image(systemName: "eyeglasses").font(.system(size: 30, weight: .medium)).foregroundStyle(.white).frame(width: 68, height: 68).background(Color.white.opacity(0.1), in: Circle()).overlay(Circle().stroke(sleekRun, lineWidth: 1.5)).shadow(color: Color.sleekB.opacity(0.45), radius: 18, y: 8)
      Text("Private Browsing").font(.system(size: 34, weight: .bold)).tracking(-1).foregroundStyle(.white)
      VStack(alignment: .leading, spacing: 12) {
        line("clock.arrow.circlepath", "Sleek keeps no history of what you open in private tabs.")
        line("person.crop.circle.badge.xmark", "Their cookies and sign-ins are kept apart, and forgotten when you close the last private tab.")
        line("checkmark.shield", "Adverts and trackers are still blocked.")
        line("wifi", "Sites, and whoever runs your network, can still see that you visited.")
      }
      Button { tap(); sheet = .search } label: {
        HStack(spacing: 8) { Image(systemName: "magnifyingglass"); Text("Search privately or enter an address"); Spacer(minLength: 0) }.font(.system(size: 16)).foregroundStyle(.white.opacity(0.7))
          .padding(.horizontal, 16).frame(height: 48).background(Color.white.opacity(0.1), in: Capsule())
      }.buttonStyle(Press()).padding(.top, 4)
      Spacer(minLength: 0)
    }
    .padding(.horizontal, 20).padding(.top, b.barAtTop ? 96 : 44)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .opacity(shown ? 1 : 0).offset(y: shown ? 0 : 14)
    .background { ZStack { Color(hex: "#0E0E12"); Circle().fill(Color.sleekB.opacity(0.22)).frame(width: 320).blur(radius: 90).offset(x: 120, y: -280) }.ignoresSafeArea() }
    .onAppear { withAnimation(.spring(response: 0.55, dampingFraction: 0.85)) { shown = true } }
  }
  private func line(_ icon: String, _ text: String) -> some View {
    HStack(alignment: .top, spacing: 12) { Image(systemName: icon).font(.system(size: 15)).foregroundStyle(.white.opacity(0.6)).frame(width: 24); Text(text).font(.system(size: 16)).foregroundStyle(.white.opacity(0.78)).fixedSize(horizontal: false, vertical: true) }
  }
}

extension View {
  /// Comes in with the page: up a little and into view, each part a moment after the one before.
  func rise(_ on: Bool, _ step: Int) -> some View {
    opacity(on ? 1 : 0).offset(y: on ? 0 : 22).scaleEffect(on ? 1 : 0.97, anchor: .top)
      .animation(.spring(response: 0.62, dampingFraction: 0.84).delay(0.05 + Double(step) * 0.055), value: on)
  }
}

struct TaskLine: View {
  let t: TaskRow; @ObservedObject var b: Browser
  private var dueWord: String {
    guard !t.due.isEmpty else { return "" }; let p = t.due.split(separator: "-").compactMap { Int($0) }; guard p.count == 3, let d = Calendar.current.date(from: DateComponents(year: p[0], month: p[1], day: p[2])) else { return "" }
    let n = Calendar.current.dateComponents([.day], from: Calendar.current.startOfDay(for: Date()), to: d).day ?? 0
    return n == 0 ? "Today" : n == 1 ? "Tomorrow" : n == -1 ? "Yesterday" : n < 0 ? "\(-n) days late" : d.formatted(.dateTime.weekday(.abbreviated).day())
  }
  var body: some View {
    HStack(alignment: .top, spacing: 12) {
      Button { b.tick(t) } label: { ZStack { Circle().stroke(t.done ? Color.tasks : Color.secondary.opacity(0.6), lineWidth: 1.8).background(Circle().fill(t.done ? Color.tasks : .clear)); if t.done { Image(systemName: "checkmark").font(.system(size: 11, weight: .bold)).foregroundStyle(.white) } }.frame(width: 24, height: 24).contentShape(Rectangle().inset(by: -10)) }.buttonStyle(Press())
      VStack(alignment: .leading, spacing: 2) {
        Text(t.title).font(.system(size: 16, weight: .medium)).strikethrough(t.done).foregroundStyle(t.done ? .secondary : .primary)
        HStack(spacing: 4) { Circle().fill(Color(hex: t.color)).frame(width: 8, height: 8); (Text(t.board + (dueWord.isEmpty ? "" : " · ")).foregroundColor(.secondary) + Text(dueWord).foregroundColor(t.late ? .red : .secondary)).lineLimit(1) }.font(.system(size: 13))
      }
      Spacer(minLength: 0)
    }.padding(.vertical, 4)
  }
}

/// A grocery list on Today: its name and how much is left, a bar that fills as things go in the basket,
/// the first few things to get (tick them here), and a way into the list in Sleek Tasks.
struct TodayList: View {
  let l: ListRow; @ObservedObject var b: Browser
  private var c: Color { Color(hex: l.color) }
  private var dueWord: String {
    let p = l.due.split(separator: "-").compactMap { Int($0) }; guard l.late, p.count == 3, let d = Calendar.current.date(from: DateComponents(year: p[0], month: p[1], day: p[2])) else { return "Today" }
    let n = Calendar.current.dateComponents([.day], from: Calendar.current.startOfDay(for: Date()), to: d).day ?? 0
    return n == -1 ? "Yesterday" : "\(-n) days late"
  }
  var body: some View {
    let things = b.things(l), got = l.got, left = l.left
    VStack(alignment: .leading, spacing: 8) {
      Button { tap(); b.open(l.url) } label: {
        HStack(spacing: 12) {
          Image(systemName: "basket.fill").font(.system(size: 15, weight: .semibold)).foregroundStyle(c).frame(width: 34, height: 34).background(c.opacity(0.15), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
          VStack(alignment: .leading, spacing: 1) {
            Text(l.name).font(.system(size: 16, weight: .semibold)).foregroundStyle(.primary).lineLimit(1)
            (Text(left > 0 ? "\(left) thing\(left == 1 ? "" : "s") to get · " : "Everything is in the basket · ").foregroundColor(.secondary) + Text(dueWord).foregroundColor(l.late ? .red : .secondary)).font(.system(size: 13)).lineLimit(1)
          }
          Spacer(minLength: 4)
          Text("Open").font(.system(size: 13, weight: .semibold)).foregroundStyle(c)
          Image(systemName: "chevron.right").font(.system(size: 12, weight: .bold)).foregroundStyle(c.opacity(0.7))
        }.contentShape(Rectangle())
      }.buttonStyle(Press()).accessibilityLabel("Open \(l.name)")
      GeometryReader { g in ZStack(alignment: .leading) { Capsule().fill(Color.primary.opacity(0.08)); Capsule().fill(c).frame(width: l.all > 0 ? g.size.width * CGFloat(got) / CGFloat(l.all) : 0) } }.frame(height: 4)
        .animation(.spring(response: 0.5, dampingFraction: 0.8), value: got)
      ForEach(things) { t in
        HStack(spacing: 12) {
          Button { b.tick(t, on: l) } label: { ZStack { Circle().stroke(t.done ? c : Color.secondary.opacity(0.6), lineWidth: 1.8).background(Circle().fill(t.done ? c : .clear)); if t.done { Image(systemName: "checkmark").font(.system(size: 11, weight: .bold)).foregroundStyle(.white) } }.frame(width: 24, height: 24).contentShape(Rectangle().inset(by: -10)) }.buttonStyle(Press())
            .accessibilityLabel("Got: \(t.title)").accessibilityAddTraits(t.done ? .isSelected : [])
          Text(t.title).font(.system(size: 16)).strikethrough(t.done).foregroundStyle(t.done ? .secondary : .primary).lineLimit(1)
          if t.qty > 1 { Text("×\(t.qty)").font(.system(size: 14).monospacedDigit()).foregroundStyle(.secondary) }
          Spacer(minLength: 4)
          Text(t.aisle).font(.system(size: 12)).foregroundStyle(.tertiary).lineLimit(1)
        }.padding(.vertical, 2).transition(.opacity)
      }
      if l.left > 6 { Text("and \(l.left - 6) more").font(.system(size: 13)).foregroundStyle(.secondary).padding(.leading, 36) }
    }
    .padding(12).background(Color(.systemBackground).opacity(0.7), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(c.opacity(0.35), lineWidth: 1))
  }
}


/// A deck or page on the start screen's "Pick up where you left off": a small preview of the thing itself, not a
/// block of colour. A deck is a little slide in its own theme, with its cover's kicker and heading and how many
/// slides it has; a page is a little sheet with its title and opening lines. A picture of your own, set in the app,
/// takes the preview's place. The tile glows in the app's colour when pressed (Press).
struct RecentTile: View {
  let r: WorkItem
  private var deck: Bool { r.kind == "slides" }
  private var c: Color { deck ? .slides : .docs }
  private var picture: UIImage? {
    guard let comma = r.thumb.firstIndex(of: ","), let d = Data(base64Encoded: String(r.thumb[r.thumb.index(after: comma)...])) else { return nil }
    return UIImage(data: d)
  }
  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      ZStack { if let p = picture { Image(uiImage: p).resizable().scaledToFill() } else if deck { slide } else { sheet } }
        .frame(width: 192, height: 108).clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(.white.opacity(0.1), lineWidth: 0.8))
        .background { RoundedRectangle(cornerRadius: 14, style: .continuous).fill(c.opacity(0.32)).blur(radius: 14).offset(y: 8).padding(10) }
      HStack(spacing: 6) {
        Image(systemName: deck ? "play.rectangle.fill" : "doc.text.fill").font(.system(size: 11, weight: .semibold)).foregroundStyle(c)
        Text(r.title).font(.system(size: 14, weight: .semibold)).lineLimit(1).foregroundStyle(.primary)
      }.frame(width: 192, alignment: .leading)
    }
  }
  /// The deck's cover as a slide: dark or light as its theme says, its accent glowing from a corner.
  private var slide: some View {
    let a = Color(hex: r.accent), light = r.mode == "light", ink: Color = light ? Color(hex: "#15131C") : .white
    let heading = r.heading.isEmpty ? r.title : r.heading
    return ZStack(alignment: .bottomLeading) {
      (light ? Color(hex: "#F6F4FB") : Color(hex: "#0D0B14"))
      Circle().fill(a.opacity(light ? 0.35 : 0.75)).frame(width: 150).blur(radius: 40).offset(x: 110, y: -70)
      Circle().fill(a.opacity(light ? 0.18 : 0.35)).frame(width: 110).blur(radius: 36).offset(x: -40, y: 40)
      VStack(alignment: .leading, spacing: 3) {
        if !r.kicker.isEmpty { Text(r.kicker.uppercased()).font(.system(size: 6.5, weight: .semibold)).kerning(0.8).foregroundStyle(ink.opacity(0.6)).lineLimit(1) }
        Text(heading).font(.system(size: 14, weight: .bold)).foregroundStyle(ink).lineLimit(2).minimumScaleFactor(0.8)
      }.padding(12).frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
      if r.slides > 0 {
        Text("\(r.slides)").font(.system(size: 9, weight: .bold).monospacedDigit()).foregroundStyle(ink.opacity(0.75))
          .padding(.horizontal, 6).padding(.vertical, 2).background(Capsule().fill(ink.opacity(0.12)))
          .padding(8).frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
      }
    }
  }
  /// The page as a sheet of paper: its title, then its first lines, fading out at the foot.
  private var sheet: some View {
    ZStack(alignment: .topLeading) {
      Color(hex: "#FBFBFD")
      VStack(alignment: .leading, spacing: 5) {
        Capsule().fill(c).frame(width: 18, height: 3)
        Text(r.title).font(.system(size: 11, weight: .bold)).foregroundStyle(Color(hex: "#16161A")).lineLimit(1)
        if r.peek.isEmpty { ForEach(0..<3, id: \.self) { k in Capsule().fill(Color.black.opacity(0.08)).frame(width: k == 2 ? 90 : 160, height: 4) } }
        else { Text(r.peek).font(.system(size: 7.5)).foregroundStyle(Color(hex: "#4A4A55")).lineSpacing(1.5).lineLimit(6) }
      }.padding(.horizontal, 14).padding(.top, 12)
      LinearGradient(colors: [.clear, Color(hex: "#FBFBFD")], startPoint: .center, endPoint: .bottom)
    }
  }
}

// A new tab. An ordinary one is your day: what is due from Sleek Tasks, to tick off and add to, your
// three apps, the decks and pages you last worked on, your bookmarks and where you go most.
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
  private var hello: String { let h = Calendar.current.component(.hour, from: Date()); return h < 12 ? "Good morning." : h < 18 ? "Good afternoon." : "Good evening." }
  private var sub: String { let n = b.day.today.count, late = b.day.late.count; return (n == 0 ? "Nothing due today" : "\(n) task\(n == 1 ? "" : "s") for today") + (late > 0 ? ", and \(late) overdue" : "") + "." }
  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 24) {
        brand.padding(.top, 8)
        VStack(alignment: .leading, spacing: 4) { Text(hello).font(.system(size: 34, weight: .bold)).tracking(-1); Text(b.day.loaded ? sub : " ").font(.system(size: 17)).foregroundStyle(.secondary) }.rise(shown, 1)
        today.rise(shown, 2)
        if b.startApps { apps.rise(shown, 3).transition(.opacity.combined(with: .scale(scale: 0.96, anchor: .top))) }
        if !b.day.recent.isEmpty { recent.rise(shown, 4) }
        if !marks.isEmpty { grid("Bookmarks", marks).rise(shown, 5) }
        if !places.isEmpty { grid("Where you go most", places).rise(shown, 6) }
      }
      .padding(.horizontal, 20).padding(.top, b.barAtTop ? 68 : 0).padding(.bottom, b.barAtTop ? 40 : 112)
    }
    .scrollDismissesKeyboard(.interactively)
    .refreshable { await b.freshenToday() }          // pull down: your tasks again, without the ones you have ticked off
    .background(alignment: .top) { bloom.opacity(shown ? 1 : 0).scaleEffect(shown ? 1 : 0.6, anchor: .top).animation(.easeOut(duration: 0.9), value: shown) }
    .onAppear { Work.shared.refresh(); DispatchQueue.main.async { shown = true } }
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
  private func card<V: View>(@ViewBuilder _ v: () -> V) -> some View { v().padding(16).frame(maxWidth: .infinity, alignment: .leading).background(Color(.secondarySystemBackground).opacity(0.75), in: RoundedRectangle(cornerRadius: 24, style: .continuous)).overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).stroke(Color.primary.opacity(0.06), lineWidth: 0.5)) }
  private func head(_ t: String) -> some View { Text(t.uppercased()).font(.system(size: 12, weight: .semibold)).tracking(1.4).foregroundStyle(.secondary) }
  private var today: some View {
    card {
      VStack(alignment: .leading, spacing: 12) {
        HStack { head("Today, from Sleek Tasks"); Spacer(); Button { sheet = .tasks } label: { Text("All").font(.system(size: 13, weight: .semibold)).frame(minWidth: 44, minHeight: 44, alignment: .trailing).contentShape(Rectangle()) }.foregroundStyle(Color.tasks).padding(.vertical, -14) }
        newTask_
        let rows = b.dueToday
        if rows.isEmpty && b.doneToday.isEmpty && !composing { Text(b.day.loaded ? "Nothing is due today." : "Opening your tasks…").font(.system(size: 15)).foregroundStyle(.secondary).padding(.vertical, 4) }
        ForEach(rows.prefix(5)) { TaskLine(t: $0, b: b).transition(.opacity) }
        // ticked off, a task stays here struck through; pull the page down and it slides away
        ForEach(b.doneToday.prefix(2)) { TaskLine(t: $0, b: b).transition(.asymmetric(insertion: .opacity, removal: .opacity.combined(with: .move(edge: .trailing)))) }
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
  private var apps: some View {
    VStack(alignment: .leading, spacing: 12) {
      head("Sleek")
      HStack(spacing: 12) { app("Slides", "slides", .slides); app("Docs", "docs", .docs); app("Tasks", "tasks", .tasks) }
    }
  }
  private func app(_ name: String, _ file: String, _ c: Color) -> some View {
    Button { tap(); b.open("sleek://app/\(file).html") } label: {
      VStack(alignment: .leading, spacing: 12) { AppIcon(app: file); Text(name).font(.system(size: 16, weight: .semibold)).foregroundStyle(.primary) }
      .padding(16).frame(maxWidth: .infinity, alignment: .leading)
      .background { ZStack { RoundedRectangle(cornerRadius: 24, style: .continuous).fill(c.opacity(0.35)).blur(radius: 16).offset(y: 8).padding(8); RoundedRectangle(cornerRadius: 24, style: .continuous).fill(Color(.secondarySystemBackground)) } }
      .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).stroke(c.opacity(0.25), lineWidth: 0.8))
    }.buttonStyle(Press())
  }
  private var recent: some View {
    VStack(alignment: .leading, spacing: 12) {
      head("Pick up where you left off")
      ScrollView(.horizontal, showsIndicators: false) { HStack(spacing: 12) { ForEach(b.day.recent) { r in
        let c: Color = r.kind == "slides" ? .slides : .docs
        Button { tap(); b.open(r.url) } label: {
          VStack(alignment: .leading, spacing: 8) {
            RoundedRectangle(cornerRadius: 10, style: .continuous).fill(LinearGradient(colors: [c, c.opacity(0.55)], startPoint: .topLeading, endPoint: .bottomTrailing)).frame(width: 150, height: 84)
            VStack(alignment: .leading, spacing: 2) { Text(r.title).font(.system(size: 15, weight: .semibold)).lineLimit(1).foregroundStyle(.primary); Text(r.kind == "slides" ? "Slides" : "Docs").font(.system(size: 13)).foregroundStyle(.secondary) }
          }.frame(width: 150, alignment: .leading)
        }.buttonStyle(Press()) } } }
    }
  }
  struct Place: Identifiable { let host: String, name: String, url: String; var id: String { url } }
  private var marks: [Place] { b.store.bookmarks.prefix(8).compactMap { m in guard let u = m["url"] as? String, let h = URL(string: u)?.host else { return nil }; return Place(host: h, name: m["title"] as? String ?? h, url: u) } }
  private var places: [Place] { b.topSites.map { Place(host: $0.host, name: $0.host.replacingOccurrences(of: "www.", with: ""), url: $0.url) } }
  private func grid(_ name: String, _ list: [Place]) -> some View {
    VStack(alignment: .leading, spacing: 12) {
      head(name)
      // four to a row, the first icon under the heading's left edge and the last at the page's right edge
      VStack(spacing: 16) { ForEach(Array(stride(from: 0, to: list.count, by: 4)), id: \.self) { i in
        HStack(alignment: .top, spacing: 0) { ForEach(0..<4, id: \.self) { j in
          if j > 0 { Spacer(minLength: 0) }
          if i + j < list.count { place(list[i + j], mark: name == "Bookmarks") } else { Color.clear.frame(width: 56, height: 56) }
        } }
      } }
    }
  }
  /// One place: its icon, 56 wide, and its name centred beneath (the name may be a little wider than the icon).
  /// Press and hold it to open it in a new tab or a private one, or to take it off the start screen.
  private func place(_ p: Place, mark: Bool) -> some View {
    Button { tap(); b.open(p.url) } label: { VStack(spacing: 8) { SiteIcon(host: p.host, size: 56); Text(p.name).font(.system(size: 11)).foregroundStyle(.secondary).lineLimit(1).minimumScaleFactor(0.9).frame(width: 72).frame(width: 56) } }.buttonStyle(Press())
      .contentShape(.contextMenuPreview, RoundedRectangle(cornerRadius: 16, style: .continuous).inset(by: -10))      // lifted for its menu, its name comes with it whole
      .contextMenu { Button { b.newTab(URL(string: p.url)) } label: { Label("Open in New Tab", systemImage: "plus.square.on.square") }; Button { b.newTab(URL(string: p.url), isPrivate: true) } label: { Label("Open in Private Tab", systemImage: "eyeglasses") }
        Divider()
        if mark { Button(role: .destructive) { tap(.medium); b.removeMark(p.url) } label: { Label("Remove Bookmark", systemImage: "trash") } }
        else { Button(role: .destructive) { tap(.medium); b.hideTop(p.host) } label: { Label("Remove", systemImage: "minus.circle") } } }
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

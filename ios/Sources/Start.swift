// A new tab. An ordinary one is your day: what is due from Sleek Tasks, to tick off and add to, your
// three apps, the decks and pages you last worked on, your bookmarks and where you go most.
// A private one shows none of that: only what Private Browsing does.
import SwiftUI

struct StartView: View {
  @ObservedObject var b: Browser; @Binding var sheet: Sheet?
  @State private var newTask = ""
  @FocusState private var adding: Bool
  private var hello: String { let h = Calendar.current.component(.hour, from: Date()); return h < 12 ? "Good morning." : h < 18 ? "Good afternoon." : "Good evening." }
  private var sub: String { let n = b.day.today.count, late = b.day.late.count; return (n == 0 ? "Nothing due today" : "\(n) task\(n == 1 ? "" : "s") for today") + (late > 0 ? ", and \(late) overdue" : "") + "." }
  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 22) {
        HStack(spacing: 10) { Mark(size: 30); Text("Sleek").font(.system(size: 26, weight: .bold)).tracking(-1) }.padding(.top, 8)
        VStack(alignment: .leading, spacing: 2) { Text(hello).font(.system(size: 34, weight: .bold)).tracking(-1); Text(b.day.loaded ? sub : " ").font(.system(size: 17)).foregroundStyle(.secondary) }
        today
        apps
        if !b.day.recent.isEmpty { recent }
        if !marks.isEmpty { grid("Bookmarks", marks) }
        if !places.isEmpty { grid("Where you go most", places) }
      }
      .padding(.horizontal, 20).padding(.top, b.barAtTop ? 62 : 0).padding(.bottom, b.barAtTop ? 40 : 110)
    }
    .scrollDismissesKeyboard(.interactively)
    .background(alignment: .top) { bloom }
    .onAppear { Work.shared.refresh() }
  }
  /// The soft light at the top of the page, in Sleek's colours.
  private var bloom: some View {
    ZStack { Circle().fill(Color.sleekA.opacity(0.32)).frame(width: 300).offset(x: -120, y: -150); Circle().fill(Color.sleekC.opacity(0.24)).frame(width: 280).offset(x: 140, y: -170) }.blur(radius: 70).allowsHitTesting(false)
  }
  private func card<V: View>(@ViewBuilder _ v: () -> V) -> some View { v().padding(14).frame(maxWidth: .infinity, alignment: .leading).background(Color(.secondarySystemBackground).opacity(0.75), in: RoundedRectangle(cornerRadius: 22, style: .continuous)).overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(Color.primary.opacity(0.06), lineWidth: 0.5)) }
  private func head(_ t: String) -> some View { Text(t.uppercased()).font(.system(size: 12, weight: .semibold)).tracking(1.4).foregroundStyle(.secondary) }
  private var today: some View {
    card {
      VStack(alignment: .leading, spacing: 10) {
        HStack { head("Today, from Sleek Tasks"); Spacer(); Button { sheet = .tasks } label: { Text("All").font(.system(size: 13, weight: .semibold)) }.foregroundStyle(Color.tasks) }
        HStack(spacing: 8) { Image(systemName: "plus.circle.fill").foregroundStyle(Color.tasks).font(.system(size: 20))
          TextField("Add a task for today", text: $newTask).focused($adding).submitLabel(.done).onSubmit { b.addTask(newTask); newTask = "" } }
          .padding(.horizontal, 12).frame(height: 44).background(Color(.systemBackground).opacity(0.9), in: RoundedRectangle(cornerRadius: 13, style: .continuous))
          .overlay(RoundedRectangle(cornerRadius: 13, style: .continuous).stroke(adding ? Color.tasks : .clear, lineWidth: 1.5)).shadow(color: Color.tasks.opacity(adding ? 0.35 : 0), radius: 14, y: 5).animation(.easeOut(duration: 0.2), value: adding)
        let rows = b.day.late + b.day.today
        if rows.isEmpty && b.day.done.isEmpty { Text(b.day.loaded ? "Nothing is due. Add a task above." : "Opening your tasks…").font(.system(size: 15)).foregroundStyle(.secondary).padding(.vertical, 4) }
        ForEach(rows.prefix(5)) { TaskLine(t: $0, b: b) }
        ForEach(b.day.done.prefix(2)) { TaskLine(t: $0, b: b) }
      }
    }
  }
  private var apps: some View {
    VStack(alignment: .leading, spacing: 10) {
      head("Sleek")
      HStack(spacing: 10) { app("Slides", "slides", .slides); app("Docs", "docs", .docs); app("Tasks", "tasks", .tasks) }
    }
  }
  private func app(_ name: String, _ file: String, _ c: Color) -> some View {
    Button { tap(); b.open("sleek://app/\(file).html") } label: {
      VStack(alignment: .leading, spacing: 10) { AppIcon(app: file); Text(name).font(.system(size: 16, weight: .semibold)).foregroundStyle(.primary) }
      .padding(14).frame(maxWidth: .infinity, alignment: .leading)
      .background { ZStack { RoundedRectangle(cornerRadius: 20, style: .continuous).fill(c.opacity(0.35)).blur(radius: 16).offset(y: 8).padding(8); RoundedRectangle(cornerRadius: 20, style: .continuous).fill(Color(.secondarySystemBackground)) } }
      .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(c.opacity(0.25), lineWidth: 0.8))
    }.buttonStyle(Press())
  }
  private var recent: some View {
    VStack(alignment: .leading, spacing: 10) {
      head("Pick up where you left off")
      ScrollView(.horizontal, showsIndicators: false) { HStack(spacing: 10) { ForEach(b.day.recent) { r in
        let c: Color = r.kind == "slides" ? .slides : .docs
        Button { tap(); b.open(r.url) } label: {
          VStack(alignment: .leading, spacing: 8) {
            RoundedRectangle(cornerRadius: 10, style: .continuous).fill(LinearGradient(colors: [c, c.opacity(0.55)], startPoint: .topLeading, endPoint: .bottomTrailing)).frame(width: 150, height: 84)
            Text(r.title).font(.system(size: 15, weight: .semibold)).lineLimit(1).foregroundStyle(.primary); Text(r.kind == "slides" ? "Slides" : "Docs").font(.system(size: 13)).foregroundStyle(.secondary)
          }.frame(width: 150, alignment: .leading)
        }.buttonStyle(Press()) } } }
    }
  }
  struct Place: Identifiable { let host: String, name: String, url: String; var id: String { url } }
  private var marks: [Place] { b.store.bookmarks.prefix(8).compactMap { m in guard let u = m["url"] as? String, let h = URL(string: u)?.host else { return nil }; return Place(host: h, name: m["title"] as? String ?? h, url: u) } }
  private var places: [Place] {
    var seen = Set<String>(), out: [Place] = []
    for h in b.store.history.sorted(by: { ($0["n"] as? Int ?? 1) > ($1["n"] as? Int ?? 1) }) { guard let u = h["u"] as? String, let host = URL(string: u)?.host, !seen.contains(host) else { continue }; seen.insert(host); out.append(Place(host: host, name: host.replacingOccurrences(of: "www.", with: ""), url: u)); if out.count == 8 { break } }
    return out
  }
  private func grid(_ name: String, _ list: [Place]) -> some View {
    VStack(alignment: .leading, spacing: 12) {
      head(name)
      LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 10), count: 4), spacing: 14) { ForEach(list) { p in
        Button { tap(); b.open(p.url) } label: { VStack(spacing: 6) { SiteIcon(host: p.host, size: 56); Text(p.name).font(.system(size: 11)).foregroundStyle(.secondary).lineLimit(1) } }.buttonStyle(Press())
          .contextMenu { Button { b.newTab(URL(string: p.url)) } label: { Label("Open in New Tab", systemImage: "plus.square.on.square") }; Button { b.newTab(URL(string: p.url), isPrivate: true) } label: { Label("Open in Private Tab", systemImage: "eyeglasses") } }
      } }
    }
  }
}

/// A new private tab: what Private Browsing does, and nothing of yours.
struct PrivateStartView: View {
  @ObservedObject var b: Browser; @Binding var sheet: Sheet?
  @State private var shown = false
  var body: some View {
    VStack(alignment: .leading, spacing: 18) {
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
          .padding(.horizontal, 16).frame(height: 50).background(Color.white.opacity(0.1), in: Capsule())
      }.buttonStyle(Press()).padding(.top, 6)
      Spacer(minLength: 0)
    }
    .padding(.horizontal, 24).padding(.top, b.barAtTop ? 96 : 44)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .opacity(shown ? 1 : 0).offset(y: shown ? 0 : 14)
    .background { ZStack { Color(hex: "#0E0E12"); Circle().fill(Color.sleekB.opacity(0.22)).frame(width: 320).blur(radius: 90).offset(x: 120, y: -280) }.ignoresSafeArea() }
    .onAppear { withAnimation(.spring(response: 0.55, dampingFraction: 0.85)) { shown = true } }
  }
  private func line(_ icon: String, _ text: String) -> some View {
    HStack(alignment: .top, spacing: 12) { Image(systemName: icon).font(.system(size: 15)).foregroundStyle(.white.opacity(0.6)).frame(width: 22); Text(text).font(.system(size: 16)).foregroundStyle(.white.opacity(0.78)).fixedSize(horizontal: false, vertical: true) }
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
      Button { b.tick(t) } label: { ZStack { Circle().stroke(t.done ? Color.tasks : Color.secondary.opacity(0.6), lineWidth: 1.8).background(Circle().fill(t.done ? Color.tasks : .clear)); if t.done { Image(systemName: "checkmark").font(.system(size: 11, weight: .bold)).foregroundStyle(.white) } }.frame(width: 24, height: 24).contentShape(Rectangle().inset(by: -8)) }.buttonStyle(Press())
      VStack(alignment: .leading, spacing: 2) {
        Text(t.title).font(.system(size: 16, weight: .medium)).strikethrough(t.done).foregroundStyle(t.done ? .secondary : .primary)
        HStack(spacing: 5) { Circle().fill(Color(hex: t.color)).frame(width: 7, height: 7); (Text(t.board + (dueWord.isEmpty ? "" : " · ")).foregroundColor(.secondary) + Text(dueWord).foregroundColor(t.late ? .red : .secondary)).lineLimit(1) }.font(.system(size: 13))
      }
      Spacer(minLength: 0)
    }.padding(.vertical, 4)
  }
}

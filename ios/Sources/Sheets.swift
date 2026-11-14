// Sleek for iPhone: what slides up over the page. Searching and going somewhere; all your tabs, with
// your private ones apart; your tasks; bookmarks and history; settings; blocking for the site showing;
// Save to Sleek; and, the first time, where you would like the bar.
import SwiftUI
import WebKit

// ---------- searching and going somewhere ----------
struct SearchView: View {
  @ObservedObject var b: Browser
  @Environment(\.dismiss) private var dismiss
  @State private var text = ""
  @FocusState private var typing: Bool
  var body: some View {
    let rows = b.suggestions(text)
    VStack(spacing: 0) {
      HStack(spacing: 10) {
        HStack(spacing: 8) { Image(systemName: b.tab.isPrivate ? "eyeglasses" : "magnifyingglass").foregroundStyle(.secondary)
          TextField(b.tab.isPrivate ? "Search privately or enter an address" : "Search or enter an address", text: $text).focused($typing).keyboardType(.webSearch).textInputAutocapitalization(.never).autocorrectionDisabled().submitLabel(.go).onSubmit { go(text) }
          if !text.isEmpty { Button { text = "" } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(.tertiary) } } }
          .padding(.horizontal, 14).frame(height: 48).background(Color(.secondarySystemBackground), in: Capsule())
          .overlay(Capsule().stroke(sleekRun, lineWidth: typing ? 1.6 : 0)).shadow(color: Color.sleekB.opacity(typing ? 0.4 : 0), radius: 16, y: 6).animation(.easeOut(duration: 0.25), value: typing)
        Button("Cancel") { dismiss() }.font(.system(size: 16))
      }.padding(.horizontal, 16).padding(.top, 18).padding(.bottom, 10)
      List {
        // the page you are on, to change its address rather than start again
        if text.isEmpty, b.tab.isWeb, let u = b.tab.address { Button { text = u.absoluteString } label: { HStack(spacing: 12) { Image(systemName: "pencil").frame(width: 28, height: 28).foregroundStyle(.secondary); VStack(alignment: .leading, spacing: 1) { Text("Edit this page’s address").font(.system(size: 16)).foregroundStyle(.primary); Text(u.absoluteString).font(.system(size: 13)).foregroundStyle(.secondary).lineLimit(1) } } } }
        if text.isEmpty && !rows.isEmpty { Section("Lately") { ForEach(rows) { row($0) } } }
        else { ForEach(rows) { row($0) } }
      }.listStyle(.plain).scrollDismissesKeyboard(.interactively).animation(.spring(response: 0.3, dampingFraction: 0.85), value: rows.map(\.id))
    }
    .onAppear { typing = true }
  }
  private func go(_ what: String) { guard !what.trimmingCharacters(in: .whitespaces).isEmpty else { return }; tap(); b.open(what); dismiss() }
  private func row(_ r: Suggestion) -> some View {
    Button { go(r.url.isEmpty ? text : r.url) } label: {
      HStack(spacing: 12) {
        Group {
          if r.kind == "slides" || r.kind == "docs" || r.kind == "tasks" { AppIcon(app: r.kind, size: 28) }
          else if r.kind == "search" { Image(systemName: "magnifyingglass").frame(width: 28, height: 28).foregroundStyle(.secondary) }
          else { SiteIcon(host: URL(string: r.url)?.host ?? "", size: 28) }
        }
        VStack(alignment: .leading, spacing: 1) { Text(r.title.isEmpty ? r.hint : r.title).font(.system(size: 16)).foregroundStyle(.primary).lineLimit(1); if !r.hint.isEmpty { Text(r.hint).font(.system(size: 13)).foregroundStyle(.secondary).lineLimit(1) } }
        Spacer(minLength: 0)
        if r.kind == "bookmark" { Image(systemName: "bookmark.fill").font(.system(size: 11)).foregroundStyle(.tertiary) }
      }
    }
  }
}

// ---------- all your tabs: the ordinary ones, and apart from them the private ones ----------
struct TabsView: View {
  @ObservedObject var b: Browser
  @Environment(\.dismiss) private var dismiss
  @Environment(\.colorScheme) private var scheme
  @State private var hidden: Bool
  init(b: Browser) { self.b = b; _hidden = State(initialValue: b.tab.isPrivate) }
  private var shown: [(at: Int, tab: PhoneTab)] { b.tabs.enumerated().filter { $0.element.isPrivate == hidden }.map { ($0.offset, $0.element) } }
  var body: some View {
    VStack(spacing: 0) {
      HStack {
        Picker("", selection: $hidden.animation(.spring(response: 0.4, dampingFraction: 0.85))) { Text("Tabs").tag(false); Label("Private", systemImage: "eyeglasses").tag(true) }.pickerStyle(.segmented).frame(width: 210)
        Spacer(); Button("Done") { dismiss() }.font(.system(size: 17, weight: .semibold))
      }.padding(.horizontal, 20).padding(.top, 22).padding(.bottom, 14)
      ScrollView {
        if hidden && shown.isEmpty { nothingPrivate }
        LazyVGrid(columns: [GridItem(.flexible(), spacing: 14), GridItem(.flexible(), spacing: 14)], spacing: 16) {
          ForEach(shown, id: \.tab.id) { s in TabCard(t: s.tab, on: s.at == b.at) { b.show(s.at); dismiss() } close: { b.close(s.tab) }.transition(.scale(scale: 0.85).combined(with: .opacity)) }
        }.padding(.horizontal, 18).padding(.bottom, 100)
      }
    }
    .background(Color(.systemBackground).ignoresSafeArea())
    .overlay(alignment: .bottom) {
      Button { tap(); b.newTab(isPrivate: hidden); dismiss() } label: { Label(hidden ? "New Private Tab" : "New Tab", systemImage: hidden ? "eyeglasses" : "plus").font(.system(size: 17, weight: .semibold)).padding(.horizontal, 22).frame(height: 52) }
        .foregroundStyle(.primary).modifier(Glass(shape: Capsule())).padding(.bottom, 14)
    }
    .environment(\.colorScheme, hidden ? .dark : scheme)
  }
  private var nothingPrivate: some View {
    VStack(spacing: 10) {
      Image(systemName: "eyeglasses").font(.system(size: 34, weight: .medium)).foregroundStyle(.secondary)
      Text("Private Browsing").font(.system(size: 22, weight: .bold))
      Text("Sleek keeps no history of private tabs, and forgets their cookies and sign-ins when you close the last one.").font(.system(size: 15)).foregroundStyle(.secondary).multilineTextAlignment(.center)
    }.padding(.horizontal, 40).padding(.top, 90)
  }
}
struct TabCard: View {
  @ObservedObject var t: PhoneTab; let on: Bool; let open: () -> Void; let close: () -> Void
  var body: some View {
    Button(action: { tap(); open() }) {
      VStack(alignment: .leading, spacing: 8) {
        ZStack(alignment: .topTrailing) {
          Group {
            if let s = t.shot { Image(uiImage: s).resizable().scaledToFill() }
            else if t.isPrivate { ZStack { Color(hex: "#15151B"); Image(systemName: "eyeglasses").font(.system(size: 34, weight: .medium)).foregroundStyle(.white.opacity(0.6)) } }
            else { ZStack { LinearGradient(colors: [Color.sleekA.opacity(0.35), Color.sleekC.opacity(0.3)], startPoint: .topLeading, endPoint: .bottomTrailing); Mark(size: 40) } }
          }.frame(maxWidth: .infinity).frame(height: 210, alignment: .top).clipped()
          Button(action: { tap(); close() }) { Image(systemName: "xmark").font(.system(size: 11, weight: .bold)).frame(width: 26, height: 26).background(.ultraThinMaterial, in: Circle()) }.foregroundStyle(.primary).padding(8)
        }
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(on ? AnyShapeStyle(sleekRun) : AnyShapeStyle(Color.primary.opacity(0.1)), lineWidth: on ? 2.5 : 0.5))
        .shadow(color: on ? Color.sleekB.opacity(0.4) : .black.opacity(0.12), radius: on ? 16 : 10, y: 6)
        HStack(spacing: 6) { if t.isPrivate && t.atStart { Image(systemName: "eyeglasses").font(.system(size: 11)) } else if t.atStart || t.isSleek { Mark(size: 13) } else { SiteIcon(host: t.host, size: 16) }; Text(t.shownTitle).font(.system(size: 13, weight: .medium)).lineLimit(1) }.foregroundStyle(.primary).padding(.horizontal, 4)
      }
    }.buttonStyle(Press())
  }
}

// ---------- your tasks, over any page ----------
struct TasksView: View {
  @ObservedObject var b: Browser
  @Environment(\.dismiss) private var dismiss
  @State private var newTask = ""
  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 8) {
        HStack(spacing: 10) { AppIcon(app: "tasks", size: 30); Text("Today").font(.system(size: 28, weight: .bold)).tracking(-0.8); Spacer() }.padding(.top, 22)
        HStack(spacing: 8) { Image(systemName: "plus.circle.fill").foregroundStyle(Color.tasks).font(.system(size: 20)); TextField("Add a task for today", text: $newTask).submitLabel(.done).onSubmit { b.addTask(newTask); newTask = "" } }
          .padding(.horizontal, 12).frame(height: 46).background(Color(.systemBackground).opacity(0.8), in: RoundedRectangle(cornerRadius: 13, style: .continuous)).padding(.bottom, 4)
        if b.day.loaded && b.day.late.isEmpty && b.day.today.isEmpty && b.day.soon.isEmpty && b.day.done.isEmpty { Text("Nothing is due.").font(.system(size: 15)).foregroundStyle(.secondary).padding(.top, 8) }
        section("Overdue", b.day.late, .red); section("Today", b.day.today); section("Next 7 days", b.day.soon); section("Just done", b.day.done)
        Button { b.open("sleek://app/tasks.html"); dismiss() } label: { Text("Open Sleek Tasks").font(.system(size: 15, weight: .semibold)) }.foregroundStyle(Color.tasks).padding(.top, 12)
      }.padding(.horizontal, 20).padding(.bottom, 30)
    }.onAppear { Work.shared.refresh() }
  }
  @ViewBuilder private func section(_ name: String, _ rows: [TaskRow], _ c: Color = .secondary) -> some View {
    if !rows.isEmpty { Text(name.uppercased()).font(.system(size: 12, weight: .semibold)).tracking(1.4).foregroundStyle(c).padding(.top, 10); ForEach(rows) { TaskLine(t: $0, b: b) } }
  }
}

// ---------- bookmarks and history ----------
struct LibraryView: View {
  @ObservedObject var b: Browser
  @Environment(\.dismiss) private var dismiss
  @State private var history = false
  @State private var sure = false
  struct Row: Identifiable { let title: String, url: String, at: Double; var id: String { url } }
  private var marks: [Row] { b.store.bookmarks.map { Row(title: $0["title"] as? String ?? "", url: $0["url"] as? String ?? "", at: 0) } }
  private var visits: [Row] { b.store.history.prefix(400).map { Row(title: $0["t"] as? String ?? "", url: $0["u"] as? String ?? "", at: ($0["at"] as? NSNumber)?.doubleValue ?? 0) } }
  /// History by day: today, yesterday, and before.
  private var days: [(name: String, rows: [Row])] {
    let cal = Calendar.current; var out: [(name: String, rows: [Row])] = []
    for r in visits {
      let d = Date(timeIntervalSince1970: r.at), name = cal.isDateInToday(d) ? "Today" : cal.isDateInYesterday(d) ? "Yesterday" : d.formatted(.dateTime.weekday(.wide).day().month(.wide))
      if out.last?.name == name { out[out.count - 1].rows.append(r) } else { out.append((name, [r])) }
    }
    return out
  }
  var body: some View {
    VStack(spacing: 0) {
      HStack {
        Picker("", selection: $history.animation(.spring(response: 0.35, dampingFraction: 0.85))) { Text("Bookmarks").tag(false); Text("History").tag(true) }.pickerStyle(.segmented).frame(width: 230)
        Spacer(); Button("Done") { dismiss() }.font(.system(size: 17, weight: .semibold))
      }.padding(.horizontal, 20).padding(.top, 22).padding(.bottom, 10)
      List {
        if history {
          if visits.isEmpty { empty("clock", "No history yet", "Pages you open are listed here. Private tabs never are.") }
          ForEach(days, id: \.name) { day in Section(day.name) { ForEach(day.rows) { row($0) }.onDelete { at in at.map { day.rows[$0].url }.forEach(b.forget) } } }
          if !visits.isEmpty { Button("Clear History…", role: .destructive) { sure = true } }
        } else {
          if marks.isEmpty { empty("bookmark", "No bookmarks yet", "Add one from the ⋯ menu on any page.") }
          ForEach(marks) { row($0) }.onDelete { at in at.map { marks[$0].url }.forEach { b.store.removeBookmark(url: $0) }; b.objectWillChange.send() }
        }
      }.listStyle(.plain)
    }
    .confirmationDialog("Clear all of your history?", isPresented: $sure, titleVisibility: .visible) { Button("Clear History", role: .destructive) { b.clearHistory() } }
  }
  private func empty(_ icon: String, _ title: String, _ note: String) -> some View {
    VStack(spacing: 8) { Image(systemName: icon).font(.system(size: 30)).foregroundStyle(.secondary); Text(title).font(.system(size: 19, weight: .semibold)); Text(note).font(.system(size: 15)).foregroundStyle(.secondary).multilineTextAlignment(.center) }.frame(maxWidth: .infinity).padding(.top, 70).listRowSeparator(.hidden)
  }
  private func row(_ r: Row) -> some View {
    Button { tap(); b.open(r.url); dismiss() } label: {
      HStack(spacing: 12) { SiteIcon(host: URL(string: r.url)?.host ?? "", size: 30)
        VStack(alignment: .leading, spacing: 1) { Text(r.title.isEmpty ? r.url : r.title).font(.system(size: 16)).foregroundStyle(.primary).lineLimit(1); Text(URL(string: r.url)?.host ?? r.url).font(.system(size: 13)).foregroundStyle(.secondary).lineLimit(1) } }
    }
    .contextMenu { Button { if let u = URL(string: r.url) { b.newTab(u, isPrivate: false); dismiss() } } label: { Label("Open in New Tab", systemImage: "plus.square.on.square") }; Button { if let u = URL(string: r.url) { b.newTab(u, isPrivate: true); dismiss() } } label: { Label("Open in Private Tab", systemImage: "eyeglasses") }; Button { UIPasteboard.general.string = r.url } label: { Label("Copy Link", systemImage: "doc.on.doc") } }
  }
}

// ---------- settings ----------
struct SettingsView: View {
  @ObservedObject var b: Browser
  @Environment(\.dismiss) private var dismiss
  @State private var sure = false
  private var version: String { (Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String) ?? "" }
  var body: some View {
    NavigationStack {
      Form {
        Section { Picker("Bar", selection: Binding(get: { b.barAtTop }, set: { b.placeBar(top: $0) })) { Text("At the bottom").tag(false); Text("At the top").tag(true) }.pickerStyle(.segmented) } header: { Text("Bar") } footer: { Text("Scroll down a page and the bar draws in to a tile. Drag the tile to any corner and it stays there.") }
        Section("Look") { Picker("Look", selection: $b.look) { Text("Automatic").tag("auto"); Text("Light").tag("light"); Text("Dark").tag("dark") }.pickerStyle(.segmented) }
        Section { Picker("Search with", selection: Binding(get: { b.store.search }, set: { b.store.set("search", $0); b.objectWillChange.send() })) { ForEach(Search.providers, id: \.address) { Text($0.name).tag($0.address) } } } header: { Text("Search") } footer: { Text("What you type in the address box goes to your search provider only when you search. Suggestions come from this iPhone.") }
        Section {
          LabeledContent("Adverts and trackers", value: b.blockerReady ? "Blocked" : "Getting ready…")
          ForEach(b.blockOff, id: \.self) { h in LabeledContent(h, value: "Off") }.onDelete { at in at.map { b.blockOff[$0] }.forEach(b.allowBlocking) }
        } header: { Text("Blocking") } footer: { Text("Press the shield beside an address to switch blocking off for a site that does not work. Sites you switched it off for are listed here; swipe one away to block there again. Lists: " + Blocker.sources.map(\.title).joined(separator: ", ") + ".") }
        Section { Button("Clear History…", role: .destructive) { sure = true }; Button("Clear Cookies and Cache") { b.clearCookies() } } header: { Text("Privacy") } footer: { Text("Clearing cookies signs you out of sites. Your decks, pages and tasks are not touched.") }
        Section { LabeledContent("Sleek for iPhone", value: version) }
      }
      .navigationTitle("Settings").navigationBarTitleDisplayMode(.inline)
      .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
      .confirmationDialog("Clear all of your history?", isPresented: $sure, titleVisibility: .visible) { Button("Clear History", role: .destructive) { b.clearHistory() } }
    }
  }
}

// ---------- blocking, for the site showing ----------
struct ShieldView: View {
  @ObservedObject var b: Browser; @ObservedObject var tab: PhoneTab
  var body: some View {
    let host = tab.address?.host ?? "", on = b.blockingOn(host)
    VStack(alignment: .leading, spacing: 16) {
      HStack(spacing: 12) {
        SiteIcon(host: host, size: 44)
        VStack(alignment: .leading, spacing: 2) { Text(tab.host).font(.system(size: 20, weight: .bold)).lineLimit(1); Text(!b.blockerReady ? "Blocking is getting ready" : on ? "Adverts and trackers are blocked" : "Blocking is off for this site").font(.system(size: 15)).foregroundStyle(.secondary) }
        Spacer(minLength: 0)
        Image(systemName: on && b.blockerReady ? "checkmark.shield.fill" : "shield.slash").font(.system(size: 26)).foregroundStyle(on && b.blockerReady ? Color.tasks : .secondary).contentTransition(.symbolEffect(.replace))
      }
      Toggle("Block on this site", isOn: Binding(get: { on }, set: { b.setBlocking($0) })).tint(.tasks).font(.system(size: 17, weight: .medium))
        .padding(.horizontal, 14).frame(height: 54).background(Color(.systemBackground).opacity(0.7), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
      Text("Switch it off if this site does not work as it should. Sleek remembers your choice for this site and loads the page again.").font(.system(size: 14)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
      Spacer(minLength: 0)
    }.padding(.horizontal, 22).padding(.top, 28)
  }
}

// ---------- Save to Sleek: the page showing, as a task or as a Docs page ----------
struct SaveView: View {
  @ObservedObject var b: Browser
  @Environment(\.dismiss) private var dismiss
  @State private var board = ""
  @State private var due = "today"
  @State private var busy = false
  private var boardName: String { b.day.boards.first { $0.id == board }?.name ?? b.day.boards.first?.name ?? "My tasks" }
  var body: some View {
    VStack(alignment: .leading, spacing: 14) {
      VStack(alignment: .leading, spacing: 2) { Text("Save to Sleek").font(.system(size: 26, weight: .bold)).tracking(-0.6); Text(b.tab.title.isEmpty ? b.tab.host : b.tab.title).font(.system(size: 15)).foregroundStyle(.secondary).lineLimit(1) }
      card {
        HStack(spacing: 10) { AppIcon(app: "tasks", size: 30); Text("As a task").font(.system(size: 17, weight: .semibold)); Spacer()
          Menu { Picker("Board", selection: $board) { ForEach(b.day.boards) { Text($0.name).tag($0.id) } } } label: { HStack(spacing: 4) { Text(boardName).lineLimit(1); Image(systemName: "chevron.up.chevron.down").font(.system(size: 11)) }.font(.system(size: 15)) }.tint(.tasks) }
        Picker("Due", selection: $due) { Text("Today").tag("today"); Text("Tomorrow").tag("tomorrow"); Text("No date").tag("") }.pickerStyle(.segmented)
        act("Add Task", .tasks) { await b.save(asPage: false, board: board, due: due) }
      }
      card {
        HStack(spacing: 10) { AppIcon(app: "docs", size: 30); VStack(alignment: .leading, spacing: 1) { Text("As a Docs page").font(.system(size: 17, weight: .semibold)); Text("Its words, or the ones you selected, with a link back").font(.system(size: 13)).foregroundStyle(.secondary) } }
        act("Keep as a Page", .docs) { await b.save(asPage: true) }
      }
      Spacer(minLength: 0)
    }
    .padding(.horizontal, 20).padding(.top, 26).disabled(busy)
    .onAppear { Work.shared.refresh() }
  }
  private func card<V: View>(@ViewBuilder _ v: () -> V) -> some View { VStack(alignment: .leading, spacing: 12) { v() }.padding(14).frame(maxWidth: .infinity, alignment: .leading).background(Color(.systemBackground).opacity(0.7), in: RoundedRectangle(cornerRadius: 20, style: .continuous)) }
  private func act(_ name: String, _ c: Color, _ what: @escaping () async -> Bool) -> some View {
    Button { tap(.medium); busy = true; Task { _ = await what(); busy = false; dismiss() } } label: { Text(name).font(.system(size: 16, weight: .semibold)).foregroundStyle(.white).frame(maxWidth: .infinity).frame(height: 46).background(c, in: Capsule()).shadow(color: c.opacity(0.35), radius: 12, y: 5) }.buttonStyle(Press())
  }
}

// ---------- the first time: where would you like the bar? ----------
struct WelcomeView: View {
  @ObservedObject var b: Browser
  @State private var top = false
  @State private var shown = false
  var body: some View {
    VStack(spacing: 0) {
      Spacer(minLength: 20)
      Mark(size: 54).shadow(color: Color.sleekB.opacity(0.5), radius: 22, y: 10).scaleEffect(shown ? 1 : 0.7).opacity(shown ? 1 : 0)
      Text("Welcome to Sleek").font(.system(size: 34, weight: .bold)).tracking(-1).padding(.top, 22).opacity(shown ? 1 : 0).offset(y: shown ? 0 : 12)
      Text("Where would you like the bar?").font(.system(size: 19)).foregroundStyle(.secondary).padding(.top, 6).opacity(shown ? 1 : 0).offset(y: shown ? 0 : 12)
      HStack(spacing: 16) { choice(atTop: false, name: "At the bottom", note: "Near your thumb"); choice(atTop: true, name: "At the top", note: "Where it has always been") }
        .padding(.horizontal, 24).padding(.top, 34).opacity(shown ? 1 : 0).offset(y: shown ? 0 : 18)
      Text("You can change this at any time in Settings.").font(.system(size: 14)).foregroundStyle(.secondary).padding(.top, 22).opacity(shown ? 1 : 0)
      Spacer(minLength: 20)
      Button { b.chose(top: top) } label: { Text("Continue").font(.system(size: 18, weight: .semibold)).frame(maxWidth: .infinity).frame(height: 56).foregroundStyle(Color(.systemBackground)).background(Color.primary, in: Capsule()) }
        .buttonStyle(Press()).padding(.horizontal, 24).padding(.bottom, 18).opacity(shown ? 1 : 0)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background { ZStack { Color(.systemBackground); Circle().fill(Color.sleekA.opacity(0.3)).frame(width: 340).blur(radius: 80).offset(x: -130, y: -260); Circle().fill(Color.sleekC.opacity(0.24)).frame(width: 320).blur(radius: 80).offset(x: 150, y: -200) }.ignoresSafeArea() }
    .onAppear { withAnimation(.spring(response: 0.7, dampingFraction: 0.82).delay(0.1)) { shown = true } }
    .interactiveDismissDisabled()
  }
  /// One of the two places, drawn as a small phone with the bar where it would be.
  private func choice(atTop: Bool, name: String, note: String) -> some View {
    let on = top == atTop
    return Button { tap(); withAnimation(.spring(response: 0.35, dampingFraction: 0.75)) { top = atTop } } label: {
      VStack(spacing: 12) {
        ZStack(alignment: atTop ? .top : .bottom) {
          RoundedRectangle(cornerRadius: 22, style: .continuous).fill(Color(.secondarySystemBackground))
          VStack(alignment: .leading, spacing: 7) { ForEach(0..<5, id: \.self) { i in Capsule().fill(Color.primary.opacity(0.1)).frame(width: i == 4 ? 46 : i % 2 == 0 ? 92 : 74, height: 7) } }.frame(maxWidth: .infinity, maxHeight: .infinity).padding(.vertical, 30)
          Capsule().fill(on ? AnyShapeStyle(sleekRun) : AnyShapeStyle(Color.primary.opacity(0.28))).frame(height: 16).padding(.horizontal, 12).padding(.vertical, 12).shadow(color: Color.sleekB.opacity(on ? 0.55 : 0), radius: 10, y: 4)
        }
        .frame(height: 220)
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(on ? AnyShapeStyle(sleekRun) : AnyShapeStyle(Color.primary.opacity(0.1)), lineWidth: on ? 2.5 : 1))
        .shadow(color: Color.sleekB.opacity(on ? 0.35 : 0), radius: 18, y: 8)
        VStack(spacing: 2) { Text(name).font(.system(size: 17, weight: .semibold)).foregroundStyle(.primary); Text(note).font(.system(size: 13)).foregroundStyle(.secondary) }
      }.frame(maxWidth: .infinity).scaleEffect(on ? 1 : 0.96)
    }.buttonStyle(Press()).accessibilityAddTraits(on ? .isSelected : [])
  }
}

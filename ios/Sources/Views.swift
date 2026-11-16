// Sleek for iPhone: the screen.
//
//   The page fills the screen. Over it floats the bar, along the bottom or the top as you chose: back,
//   the address (press it to search or type; slide it sideways to change tab, up for all your tabs),
//   your tabs, and a menu. Scroll down a page and the bar draws in to a small tile with Sleek's mark;
//   press the tile, or scroll up, and it opens out again. Drag the tile to any corner and it stays there.
//   A private tab wears a dark bar with a pair of glasses in it.
import SwiftUI
import WebKit

enum Sheet: String, Identifiable { case search, tabs, tasks, library, history, blocking, shield, save, passwords; var id: String { rawValue } }

struct BrowserView: View {
  @StateObject private var b = Browser()
  @State private var sheet: Sheet?
  @Environment(\.scenePhase) private var phase
  var body: some View {
    ZStack {
      PageView(tab: b.tab, b: b, sheet: $sheet).id(b.tab.id)
        .transition(.asymmetric(insertion: .move(edge: b.slideFrom).combined(with: .opacity), removal: .move(edge: b.slideFrom == .trailing ? .leading : .trailing).combined(with: .opacity)))
      BarView(b: b, tab: b.tab, sheet: $sheet)
      ToastView(b: b)
      if b.launch == .showing || b.launch == .flying { LaunchView(b: b).zIndex(10) }       // Sleek opening
    }
    .sheet(item: $sheet) { which in
      Group {
        switch which {
        case .search: SearchView(b: b).presentationDetents([.large])
        case .tabs: TabsView(b: b).presentationDetents([.large])
        case .tasks: TasksView(b: b).presentationDetents([.medium, .large]).presentationBackground(.regularMaterial)
        case .library: LibraryView(b: b).presentationDetents([.large])
        case .history: LibraryView(b: b, history: true).presentationDetents([.large])
        case .blocking: BlockingView(b: b).presentationDetents([.medium, .large])
        case .shield: ShieldView(b: b, tab: b.tab).presentationDetents([.height(224)]).presentationBackground(.regularMaterial)
        case .save: SaveView(b: b).presentationDetents([.height(436)]).presentationBackground(.regularMaterial)
        case .passwords: NavigationStack { PasswordsScreen(b: b, sheet: true) }.presentationDetents([.large])
        }
      }.presentationCornerRadius(28).preferredColorScheme(b.scheme).tint(.sleekB)
    }
    .fullScreenCover(isPresented: Binding(get: { b.asking }, set: { _ in })) { WelcomeView(b: b).preferredColorScheme(b.scheme) }
    .preferredColorScheme(b.scheme)
    .tint(.sleekB)
    .onChange(of: phase) { _, now in if now != .active { b.leaving() } else { Task { await Work.shared.pull() } }; if now == .background { Vault.shared.lock() } }      // passwords close when you leave the app
    // the widgets: sleek-browser://search, ://private, ://open?u=<a site, or one of Sleek's own pages>
    .onOpenURL { url in
      guard url.scheme == "sleek-browser" else { return }
      let u = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.first { $0.name == "u" }?.value
      switch url.host {
      case "search": sheet = nil; DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { sheet = .search }
      case "private": sheet = nil; b.newTab(nil, isPrivate: true)
      case "open":
        guard let s = u, let to = URL(string: s), ["https", "http", "sleek"].contains(to.scheme ?? "") else { return }
        sheet = nil
        if to.scheme == "sleek" { if !b.tab.atStart || b.tab.isPrivate { b.newTab(nil, isPrivate: false) }; b.open(s) } else { b.newTab(to, isPrivate: false) }
      default: break
      }
    }
  }
}

/// A short message, near the bar, gone in a few seconds.
struct ToastView: View {
  @ObservedObject var b: Browser
  var body: some View {
    VStack {
      if b.barAtTop { Spacer().frame(height: 72) } else { Spacer() }
      if let t = b.toast {
        Text(t).font(.system(size: 15, weight: .medium)).padding(.horizontal, 16).frame(height: 40).modifier(Glass(shape: Capsule()))
          .transition(.move(edge: b.barAtTop ? .top : .bottom).combined(with: .opacity)).id(t)
      }
      if b.barAtTop { Spacer() } else { Spacer().frame(height: 72) }
    }.allowsHitTesting(false)
  }
}

struct PageView: View {
  @ObservedObject var tab: PhoneTab; @ObservedObject var b: Browser; @Binding var sheet: Sheet?
  var body: some View {
    ZStack(alignment: .top) {
      if tab.atStart { if tab.isPrivate { PrivateStartView(b: b, sheet: $sheet) } else { StartView(b: b, sheet: $sheet) } }
      else {
        WebBox(web: tab.web).ignoresSafeArea(.container, edges: .bottom)
        if tab.loading && !b.barAtTop { progress }
      }
    }
    .background(Color(.systemBackground))
  }
  /// With the bar at the bottom, a page's progress runs along the top of the screen.
  private var progress: some View {
    GeometryReader { g in Capsule().fill(sleekRun).frame(width: max(24, g.size.width * tab.progress), height: 2.5).animation(.easeOut(duration: 0.25), value: tab.progress) }.frame(height: 2.5).transition(.opacity)
  }
}

// ---------- the bar, and the tile it draws in to ----------
struct BarView: View {
  @ObservedObject var b: Browser; @ObservedObject var tab: PhoneTab; @Binding var sheet: Sheet?
  @Environment(\.colorScheme) private var scheme
  @Namespace private var ns
  @State private var pull: CGSize = .zero            // the address being slid
  @State private var carry: CGSize = .zero           // the tile being dragged
  @State private var dragging = false
  var body: some View {
    GeometryReader { g in
      ZStack(alignment: b.compact ? b.corner.alignment : (b.corner.isTop ? .top : .bottom)) {
        Color.clear
        if b.compact { tile(in: g.size) } else {
          VStack(spacing: 8) { if !b.barAtTop { extras }; bar; if b.barAtTop { extras } }
        }
      }
      .padding(.horizontal, b.compact ? 16 : 12).padding(.bottom, b.compact ? 12 : 4).padding(.top, 8)
    }
    .environment(\.colorScheme, tab.isPrivate ? .dark : scheme)
  }
  private var bar: some View {
    HStack(spacing: 4) {
      round("chevron.left", dim: tab.atStart) { tap(); tab.back() }
      address
      tabsButton
      Menu { menu } label: { Image(systemName: "ellipsis").font(.system(size: 17, weight: .semibold)).frame(width: 44, height: 44) }.menuOrder(.fixed).foregroundStyle(.primary)
    }
    .padding(.horizontal, 4).frame(height: 52)
    // with the bar at the top, a page's progress runs along the bar's own lower edge
    .overlay(alignment: .bottom) { if tab.loading && b.barAtTop && !tab.atStart { barProgress } }
    .background { if tab.isPrivate { RoundedRectangle(cornerRadius: 26, style: .continuous).fill(Color.black.opacity(0.55)) } }
    .modifier(Glass(shape: RoundedRectangle(cornerRadius: 26, style: .continuous)))
    .matchedGeometryEffect(id: "bar", in: ns)
    .transition(.scale(scale: 0.9).combined(with: .opacity))
  }
  /// What sits beside the bar while you sign in: the offer to fill (or to use a strong password), or the question after.
  @ViewBuilder private var extras: some View {
    if let k = b.keyAsk, k.tab == tab.id { keyCard(k).transition(.move(edge: b.barAtTop ? .top : .bottom).combined(with: .opacity)) }
    else if let a = b.keepAsk { askCard(a).transition(.move(edge: b.barAtTop ? .top : .bottom).combined(with: .opacity)) }
    else if let o = b.offer, o.tab == tab.id { offerRow(o).transition(.move(edge: b.barAtTop ? .top : .bottom).combined(with: .opacity)) }
  }
  private func chip(_ icon: String, _ text: String, _ act: @escaping () -> Void) -> some View {
    Button(action: act) {
      HStack(spacing: 8) { Image(systemName: icon).font(.system(size: 13, weight: .semibold)).foregroundStyle(sleekRun); Text(text).font(.system(size: 15, weight: .medium)).lineLimit(1) }
        .padding(.horizontal, 16).frame(height: 44).modifier(Glass(shape: Capsule()))
    }.buttonStyle(Press()).foregroundStyle(.primary)
  }
  private func offerRow(_ o: SignInOffer) -> some View {
    ScrollView(.horizontal, showsIndicators: false) {
      HStack(spacing: 8) {
        ForEach(o.keys) { u in chip("person.badge.key.fill", u.user.isEmpty ? "Sign in with passkey" : u.user) { b.useQuietPasskey(u.id) } }
        ForEach(o.users) { u in chip("key.fill", u.user.isEmpty ? "Fill saved password" : u.user) { b.fillSignIn(u.id) } }
        if !o.strong.isEmpty { chip("wand.and.stars", "Use a strong password") { b.fillSignIn(nil) } }
      }.padding(.horizontal, 4).padding(.vertical, 10)
    }.padding(.vertical, -10).scrollClipDisabled()
  }
  private func askCard(_ a: SignInAsk) -> some View {
    VStack(alignment: .leading, spacing: 12) {
      HStack(spacing: 12) {
        Image(systemName: "key.fill").font(.system(size: 15, weight: .semibold)).foregroundStyle(.white).frame(width: 36, height: 36).background(sleekRun, in: Circle())
        VStack(alignment: .leading, spacing: 2) { Text(a.update ? "Update this password?" : "Save this password?").font(.system(size: 16, weight: .semibold)); Text((a.user.isEmpty ? "" : a.user + " · ") + a.site).font(.system(size: 13)).foregroundStyle(.secondary).lineLimit(1) }
        Spacer(minLength: 0)
      }
      HStack(spacing: 8) {
        Button { b.answerSignIn("never") } label: { Text("Never here").font(.system(size: 14, weight: .medium)).padding(.horizontal, 12).frame(height: 44).contentShape(Rectangle()) }.foregroundStyle(.secondary)
        Spacer(minLength: 0)
        Button { b.answerSignIn("later") } label: { Text("Not Now").font(.system(size: 15, weight: .medium)).padding(.horizontal, 16).frame(height: 44).background(Color.primary.opacity(0.08), in: Capsule()) }.foregroundStyle(.primary)
        Button { b.answerSignIn("save") } label: { Text(a.update ? "Update" : "Save").font(.system(size: 15, weight: .semibold)).padding(.horizontal, 20).frame(height: 44).foregroundStyle(Color(.systemBackground)).background(Color.primary, in: Capsule()) }
      }.buttonStyle(Press())
    }
    .padding(16).modifier(Glass(shape: RoundedRectangle(cornerRadius: 24, style: .continuous)))
  }
  /// A site asks to make a passkey, or to sign in with one.
  private func keyCard(_ k: KeyQuestion) -> some View {
    VStack(alignment: .leading, spacing: 12) {
      HStack(spacing: 12) {
        Image(systemName: "person.badge.key.fill").font(.system(size: 15, weight: .semibold)).foregroundStyle(.white).frame(width: 36, height: 36).background(sleekRun, in: Circle())
        VStack(alignment: .leading, spacing: 2) {
          Text(k.make ? "Make a passkey?" : k.users.isEmpty ? "No passkey for this site" : "Sign in with a passkey").font(.system(size: 16, weight: .semibold))
          Text((k.make && !k.user.isEmpty ? k.user + " · " : "") + k.site).font(.system(size: 13)).foregroundStyle(.secondary).lineLimit(1)
        }
        Spacer(minLength: 0)
      }
      if k.make { Text("Kept on this iPhone only and used with Face ID, so you sign in without a password.").font(.system(size: 13)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true) }
      else if k.users.isEmpty { Text("Sign in another way. If the site then offers to add a passkey, Sleek keeps it.").font(.system(size: 13)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true) }
      else {
        VStack(spacing: 6) {
          ForEach(k.users) { u in
            Button { b.answerPasskey(yes: true, id: u.id) } label: {
              HStack(spacing: 10) { Image(systemName: "faceid").font(.system(size: 15, weight: .medium)).foregroundStyle(sleekRun); Text(u.user.isEmpty ? "Passkey" : u.user).font(.system(size: 15, weight: .medium)).lineLimit(1); Spacer(minLength: 0); Image(systemName: "chevron.right").font(.system(size: 12, weight: .semibold)).foregroundStyle(.tertiary) }
                .padding(.horizontal, 14).frame(height: 48).background(Color.primary.opacity(0.06), in: RoundedRectangle(cornerRadius: 14, style: .continuous)).contentShape(Rectangle())
            }.foregroundStyle(.primary)
          }
        }
      }
      HStack(spacing: 8) {
        Spacer(minLength: 0)
        if k.make {
          Button { b.answerPasskey(yes: false) } label: { Text("Not Now").font(.system(size: 15, weight: .medium)).padding(.horizontal, 16).frame(height: 44).background(Color.primary.opacity(0.08), in: Capsule()) }.foregroundStyle(.primary)
          Button { b.answerPasskey(yes: true) } label: { Text("Make Passkey").font(.system(size: 15, weight: .semibold)).padding(.horizontal, 20).frame(height: 44).foregroundStyle(Color(.systemBackground)).background(Color.primary, in: Capsule()) }
        } else {
          Button { b.answerPasskey(yes: false) } label: { Text(k.users.isEmpty ? "OK" : "Cancel").font(.system(size: 15, weight: .medium)).padding(.horizontal, 18).frame(height: 44).background(Color.primary.opacity(0.08), in: Capsule()) }.foregroundStyle(.primary)
        }
      }
    }
    .buttonStyle(Press())
    .padding(16).modifier(Glass(shape: RoundedRectangle(cornerRadius: 24, style: .continuous)))
  }
  private var barProgress: some View {
    GeometryReader { g in Capsule().fill(sleekRun).frame(width: max(20, (g.size.width - 48) * tab.progress), height: 2.5).padding(.horizontal, 24).animation(.easeOut(duration: 0.25), value: tab.progress) }.frame(height: 2.5).padding(.bottom, 4)
  }
  private func round(_ icon: String, dim: Bool = false, _ act: @escaping () -> Void) -> some View {
    Button(action: act) { Image(systemName: icon).font(.system(size: 17, weight: .semibold)).frame(width: 44, height: 44) }.foregroundStyle(.primary).opacity(dim ? 0.3 : 1).disabled(dim)
  }
  private func showTabs() { tap(); Task { await tab.snap(); sheet = .tabs } }
  /// Your tabs. Press and hold for a new tab, a private one, or to close this one.
  private var tabsButton: some View {
    let mine = b.tabs.filter { $0.isPrivate == tab.isPrivate }.count
    return Button { showTabs() } label: {
      TabsGlyph(count: mine).frame(width: 44, height: 44)
    }
    .foregroundStyle(.primary)
    .contextMenu {
      Button { b.newTab(isPrivate: false) } label: { Label("New Tab", systemImage: "plus") }
      Button { b.newTab(isPrivate: true) } label: { Label("New Private Tab", systemImage: "eyeglasses") }
      Button(role: .destructive) { b.close(tab) } label: { Label("Close This Tab", systemImage: "xmark") }
    }
  }
  /// The ⋯ menu, top to bottom wherever the bar is: tabs and Tasks; Appearance and Manage, each opening onto its own
  /// choices; what you can do with the page showing; and Forward, Reload and Share.
  @ViewBuilder private var menu: some View {
    Section {
      Button { b.newTab(isPrivate: false) } label: { Label("New Tab", systemImage: "plus.square.on.square") }
      Button { b.newTab(isPrivate: true) } label: { Label("Private Tab", systemImage: "eyeglasses") }
      if !tab.isPrivate { Button { sheet = .tasks } label: { Label("Tasks", systemImage: "checklist") } }
      if tab.atStart && !tab.isPrivate { Button { tap(.heavy); withAnimation(.spring(response: 0.4, dampingFraction: 0.78)) { b.arranging = true } } label: { Label("Edit Start Page", systemImage: "square.grid.2x2") } }
    }
    Section {
      Menu { appearance } label: { Label("Appearance", systemImage: "paintbrush") }
      Menu { manage } label: { Label("Manage", systemImage: "slider.horizontal.3") }
    }
    Section {
      if !tab.atStart { Button { tab.find() } label: { Label("Find on Page", systemImage: "magnifyingglass") } }
      if tab.isWeb {
        if !tab.isPrivate { Button { sheet = .save } label: { Label("Save to Sleek…", systemImage: "tray.and.arrow.down") } }
        Button { b.toggleBookmark() } label: { Label(b.isBookmarked(tab) ? "Remove Bookmark" : "Add Bookmark", systemImage: b.isBookmarked(tab) ? "bookmark.fill" : "bookmark") }
        if !tab.isPrivate { Button { b.openInApp() } label: { Label("Open in App", systemImage: "arrow.up.forward.app") } }
      }
    }
    ControlGroup {
      Button { tab.web.goForward() } label: { Label("Forward", systemImage: "chevron.right") }.disabled(!tab.canForward || tab.atStart)
      Button { tab.web.reload() } label: { Label("Reload", systemImage: "arrow.clockwise") }.disabled(tab.atStart)
      if let u = tab.address, tab.isWeb { ShareLink(item: u) { Label("Share", systemImage: "square.and.arrow.up") } }
    }
  }
  /// How Sleek looks: where the bar is, light or dark, and the tiles on a new tab (what is on it is arranged there: Layout.swift).
  @ViewBuilder private var appearance: some View {
    Picker(selection: Binding(get: { b.barAtTop }, set: { tap(); b.placeBar(top: $0) })) {
      Label("At the Bottom", systemImage: "rectangle.bottomthird.inset.filled").tag(false); Label("At the Top", systemImage: "rectangle.topthird.inset.filled").tag(true)
    } label: { Label("Bar Placement", systemImage: "menubar.rectangle") }.pickerStyle(.menu)
    Picker(selection: Binding(get: { b.look }, set: { tap(); b.look = $0 })) {
      Label("Automatic", systemImage: "circle.lefthalf.filled").tag("auto"); Label("Light", systemImage: "sun.max").tag("light"); Label("Dark", systemImage: "moon").tag("dark")
    } label: { Label("Look", systemImage: "circle.lefthalf.filled") }.pickerStyle(.menu)
    Menu {
      Picker("Style", selection: Binding(get: { b.tileStyle }, set: { tap(); b.choose("tileStyle", $0) })) { Text("Clear Glass").tag("clear"); Text("Colour Glass").tag("colour"); Text("Icons").tag("icons") }.pickerStyle(.inline)
      if b.tileStyle != "icons" {
        Picker("Shape", selection: Binding(get: { b.tileShape }, set: { tap(); b.choose("tileShape", $0) })) { Label("Wide", systemImage: "rectangle").tag("wide"); Label("Square", systemImage: "square").tag("square") }.pickerStyle(.inline)
        Picker("Layout", selection: Binding(get: { b.tileLayout }, set: { tap(); b.choose("tileLayout", $0) })) { Label("Grid", systemImage: "square.grid.2x2").tag("grid"); Label("Row", systemImage: "rectangle.split.3x1").tag("row") }.pickerStyle(.inline)
      }
    } label: { Label("Site Tiles", systemImage: "rectangle.grid.2x2") }
  }
  /// What Sleek keeps and how it behaves: passwords, bookmarks, history, blocking, searching, links to apps.
  @ViewBuilder private var manage: some View {
    Button { sheet = .passwords } label: { Label("Passwords", systemImage: "key") }
    Button { sheet = .library } label: { Label("Bookmarks", systemImage: "bookmark") }
    Button { sheet = .history } label: { Label("History", systemImage: "clock") }
    Button { sheet = .blocking } label: { Label("Blocking", systemImage: "checkmark.shield") }
    Section {
      Picker(selection: Binding(get: { b.store.search }, set: { b.store.set("search", $0); b.objectWillChange.send() })) { ForEach(Search.providers, id: \.address) { Text($0.name).tag($0.address) } } label: { Label("Search With", systemImage: "magnifyingglass") }.pickerStyle(.menu)
      Toggle(isOn: Binding(get: { b.searchHints }, set: { b.setting("searchHints", $0) })) { Text("Suggestions"); Text("Asked without cookies, never from private tabs") }
      Toggle(isOn: Binding(get: { b.appLinks }, set: { b.store.set("apps", $0); b.objectWillChange.send() })) { Text("Open in Apps"); Text("Links to a site whose app is on this iPhone, and Sleek Tasks, Docs and Slides") }
    }
    Section { Text("Sleek for iPhone " + ((Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String) ?? "")) }
  }
  /// What stands before the address: a looking glass on a new tab, Sleek's mark on Sleek's own pages, and on the web
  /// the shield, which opens blocking for this site.
  @ViewBuilder private var lead: some View {
    if tab.atStart { Image(systemName: tab.isPrivate ? "eyeglasses" : "magnifyingglass").font(.system(size: 14, weight: .medium)).foregroundStyle(.secondary) }
    else if tab.isSleek { Mark(size: 15) }
    else {
      Button { tap(); sheet = .shield } label: {
        Image(systemName: tab.blocking ? "checkmark.shield.fill" : (b.blockerReady ? "shield.slash" : "shield")).font(.system(size: 14)).foregroundStyle(tab.blocking ? Color.tasks : .secondary).frame(width: 44, height: 44).contentShape(Rectangle())
      }.padding(.horizontal, -15).padding(.vertical, -2)
    }
  }
  /// The address: press it to search or type an address. Slide it sideways for the next or last tab, up for all of them.
  private var address: some View {
    HStack(spacing: 8) {
      lead
      Text(tab.atStart ? (tab.isPrivate ? "Search privately" : "Search or enter address") : tab.shownName).font(.system(size: 15, weight: tab.atStart ? .regular : .medium)).foregroundStyle(tab.atStart ? .secondary : .primary).lineLimit(1)
      Spacer(minLength: 0)
      if tab.isPrivate && !tab.atStart { Image(systemName: "eyeglasses").font(.system(size: 13, weight: .medium)).foregroundStyle(.secondary) }
      if !tab.atStart { Button { tap(); if tab.loading { tab.web.stopLoading() } else { tab.web.reload() } } label: { Image(systemName: tab.loading ? "xmark" : "arrow.clockwise").font(.system(size: 13, weight: .semibold)).frame(width: 44, height: 44).contentShape(Rectangle()) }.foregroundStyle(.secondary).padding(.horizontal, -7).padding(.vertical, -2) }
    }
    .padding(.leading, 12).padding(.trailing, 4).frame(height: 40).frame(maxWidth: .infinity)
    .background(Color.primary.opacity(tab.isPrivate ? 0.12 : 0.06), in: Capsule())
    .offset(x: pull.width * 0.5, y: min(0, pull.height * 0.3))
    .contentShape(Capsule())
    .onTapGesture { tap(); sheet = .search }
    .gesture(DragGesture(minimumDistance: 14).onChanged { v in pull = v.translation }.onEnded { v in
      let w = v.translation.width, h = v.translation.height
      withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) { pull = .zero }
      if h < -44 && abs(w) < 60 { showTabs() }
      else if w < -56 { if let i = b.neighbour(1) { b.show(i) } else if !tab.atStart { b.newTab() } }
      else if w > 56, let i = b.neighbour(-1) { b.show(i) }
    })
  }
  /// The bar, drawn in: press it to open the bar again, or drag it to a corner to keep it there.
  private func tile(in size: CGSize) -> some View {
    Mark(size: 24).frame(width: 56, height: 56)
      .background { if tab.isPrivate { Circle().fill(Color.black.opacity(0.55)) } }
      .modifier(Glass(shape: Circle()))
      .matchedGeometryEffect(id: "bar", in: ns)
      .scaleEffect(dragging ? 1.12 : 1)
      .offset(carry)
      .onTapGesture { tap(); b.setCompact(false) }
      .gesture(DragGesture(minimumDistance: 6, coordinateSpace: .global).onChanged { v in carry = v.translation; if !dragging { dragging = true; tap(.soft) } }.onEnded { v in
        let x = v.location.x, y = v.location.y, top = y < size.height / 2, left = x < size.width / 2
        tap(.rigid)
        withAnimation(.spring(response: 0.45, dampingFraction: 0.72)) { carry = .zero; dragging = false; b.corner = top ? (left ? .topLeading : .topTrailing) : (left ? .bottomLeading : .bottomTrailing) }
      })
      .transition(.scale(scale: 0.6).combined(with: .opacity))
  }
}


/// The tabs button's picture: two squares, drawn here so that the front one is the right size to hold how many
/// tabs are open, with the number in its very middle. (The system's two-squares symbol leaves no room for a number:
/// one laid over it sat across the symbol's own lines.) The back square stops short of the front one, with a little air.
private struct TabsGlyph: View {
  let count: Int
  private let front = CGRect(x: 1.5, y: 5.5, width: 17, height: 17), back = CGRect(x: 5.5, y: 1.5, width: 17, height: 17)
  var body: some View {
    Canvas { ctx, size in
      var behind = ctx, hole = Path(CGRect(origin: .zero, size: size))
      hole.addPath(Path(roundedRect: front.insetBy(dx: -2.4, dy: -2.4), cornerRadius: 6.5, style: .continuous))
      behind.clip(to: hole, style: FillStyle(eoFill: true))
      behind.stroke(Path(roundedRect: back, cornerRadius: 4.5, style: .continuous), with: .foreground, lineWidth: 1.7)
      ctx.stroke(Path(roundedRect: front, cornerRadius: 4.5, style: .continuous), with: .foreground, lineWidth: 1.7)
    }
    .overlay(alignment: .topLeading) {
      if count > 1 { Text("\(min(count, 99))").font(.system(size: count > 9 ? 8.5 : 10.5, weight: .bold, design: .rounded)).monospacedDigit().frame(width: front.width, height: front.height).offset(x: front.minX, y: front.minY) }
    }
    .frame(width: 24, height: 24)
  }
}

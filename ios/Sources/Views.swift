// Sleek for iPhone: the screen.
//
//   The page fills the screen. Over it floats the bar, along the bottom or the top as you chose: back,
//   the address (press it to search or type; slide it sideways to change tab, up for all your tabs),
//   your tabs, and a menu. Scroll down a page and the bar draws in to a small tile with Sleek's mark;
//   press the tile, or scroll up, and it opens out again. Drag the tile to any corner and it stays there.
//   A private tab wears a dark bar with a pair of glasses in it.
import SwiftUI
import WebKit

enum Sheet: String, Identifiable { case search, tabs, tasks, library, settings, shield, save, passwords; var id: String { rawValue } }

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
    }
    .sheet(item: $sheet) { which in
      Group {
        switch which {
        case .search: SearchView(b: b).presentationDetents([.large])
        case .tabs: TabsView(b: b).presentationDetents([.large])
        case .tasks: TasksView(b: b).presentationDetents([.medium, .large]).presentationBackground(.regularMaterial)
        case .library: LibraryView(b: b).presentationDetents([.large])
        case .settings: SettingsView(b: b).presentationDetents([.large])
        case .shield: ShieldView(b: b, tab: b.tab).presentationDetents([.height(250)]).presentationBackground(.regularMaterial)
        case .save: SaveView(b: b).presentationDetents([.height(430)]).presentationBackground(.regularMaterial)
        case .passwords: NavigationStack { PasswordsScreen(b: b, sheet: true) }.presentationDetents([.large])
        }
      }.presentationCornerRadius(28).preferredColorScheme(b.scheme).tint(.sleekB)
    }
    .fullScreenCover(isPresented: Binding(get: { b.asking }, set: { _ in })) { WelcomeView(b: b).preferredColorScheme(b.scheme) }
    .preferredColorScheme(b.scheme)
    .tint(.sleekB)
    .onChange(of: phase) { _, now in if now != .active { b.leaving() }; if now == .background { Vault.shared.lock() } }      // passwords close when you leave the app
  }
}

/// A short message, near the bar, gone in a few seconds.
struct ToastView: View {
  @ObservedObject var b: Browser
  var body: some View {
    VStack {
      if b.barAtTop { Spacer().frame(height: 74) } else { Spacer() }
      if let t = b.toast {
        Text(t).font(.system(size: 15, weight: .medium)).padding(.horizontal, 16).frame(height: 40).modifier(Glass(shape: Capsule()))
          .transition(.move(edge: b.barAtTop ? .top : .bottom).combined(with: .opacity)).id(t)
      }
      if b.barAtTop { Spacer() } else { Spacer().frame(height: 74) }
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
      .padding(.horizontal, b.compact ? 14 : 10).padding(.bottom, b.compact ? 10 : 4).padding(.top, 6)
    }
    .environment(\.colorScheme, tab.isPrivate ? .dark : scheme)
  }
  private var bar: some View {
    HStack(spacing: 6) {
      round("chevron.left", dim: tab.atStart) { tap(); tab.back() }
      address
      tabsButton
      Menu { menu } label: { Image(systemName: "ellipsis").font(.system(size: 17, weight: .semibold)).frame(width: 44, height: 44) }.foregroundStyle(.primary)
    }
    .padding(.horizontal, 4).frame(height: 54)
    // with the bar at the top, a page's progress runs along the bar's own lower edge
    .overlay(alignment: .bottom) { if tab.loading && b.barAtTop && !tab.atStart { barProgress } }
    .background { if tab.isPrivate { RoundedRectangle(cornerRadius: 27, style: .continuous).fill(Color.black.opacity(0.55)) } }
    .modifier(Glass(shape: RoundedRectangle(cornerRadius: 27, style: .continuous)))
    .matchedGeometryEffect(id: "bar", in: ns)
    .transition(.scale(scale: 0.9).combined(with: .opacity))
  }
  /// What sits beside the bar while you sign in: the offer to fill (or to use a strong password), or the question after.
  @ViewBuilder private var extras: some View {
    if let a = b.keepAsk { askCard(a).transition(.move(edge: b.barAtTop ? .top : .bottom).combined(with: .opacity)) }
    else if let o = b.offer, o.tab == tab.id { offerRow(o).transition(.move(edge: b.barAtTop ? .top : .bottom).combined(with: .opacity)) }
  }
  private func chip(_ icon: String, _ text: String, _ act: @escaping () -> Void) -> some View {
    Button(action: act) {
      HStack(spacing: 7) { Image(systemName: icon).font(.system(size: 13, weight: .semibold)).foregroundStyle(sleekRun); Text(text).font(.system(size: 15, weight: .medium)).lineLimit(1) }
        .padding(.horizontal, 14).frame(height: 40).modifier(Glass(shape: Capsule()))
    }.buttonStyle(Press()).foregroundStyle(.primary)
  }
  private func offerRow(_ o: SignInOffer) -> some View {
    ScrollView(.horizontal, showsIndicators: false) {
      HStack(spacing: 8) {
        ForEach(o.users) { u in chip("key.fill", u.user.isEmpty ? "Fill saved password" : u.user) { b.fillSignIn(u.id) } }
        if !o.strong.isEmpty { chip("wand.and.stars", "Use a strong password") { b.fillSignIn(nil) } }
      }.padding(.horizontal, 4).padding(.vertical, 10)
    }.padding(.vertical, -10).scrollClipDisabled()
  }
  private func askCard(_ a: SignInAsk) -> some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack(spacing: 10) {
        Image(systemName: "key.fill").font(.system(size: 15, weight: .semibold)).foregroundStyle(.white).frame(width: 34, height: 34).background(sleekRun, in: Circle())
        VStack(alignment: .leading, spacing: 1) { Text(a.update ? "Update this password?" : "Save this password?").font(.system(size: 16, weight: .semibold)); Text((a.user.isEmpty ? "" : a.user + " · ") + a.site).font(.system(size: 13)).foregroundStyle(.secondary).lineLimit(1) }
        Spacer(minLength: 0)
      }
      HStack(spacing: 8) {
        Button { b.answerSignIn("never") } label: { Text("Never here").font(.system(size: 14, weight: .medium)).padding(.horizontal, 12).frame(height: 38) }.foregroundStyle(.secondary)
        Spacer(minLength: 0)
        Button { b.answerSignIn("later") } label: { Text("Not Now").font(.system(size: 15, weight: .medium)).padding(.horizontal, 14).frame(height: 38).background(Color.primary.opacity(0.08), in: Capsule()) }.foregroundStyle(.primary)
        Button { b.answerSignIn("save") } label: { Text(a.update ? "Update" : "Save").font(.system(size: 15, weight: .semibold)).padding(.horizontal, 18).frame(height: 38).foregroundStyle(Color(.systemBackground)).background(Color.primary, in: Capsule()) }
      }.buttonStyle(Press())
    }
    .padding(14).modifier(Glass(shape: RoundedRectangle(cornerRadius: 24, style: .continuous)))
  }
  private var barProgress: some View {
    GeometryReader { g in Capsule().fill(sleekRun).frame(width: max(20, (g.size.width - 48) * tab.progress), height: 2.5).padding(.horizontal, 24).animation(.easeOut(duration: 0.25), value: tab.progress) }.frame(height: 2.5).padding(.bottom, 3)
  }
  private func round(_ icon: String, dim: Bool = false, _ act: @escaping () -> Void) -> some View {
    Button(action: act) { Image(systemName: icon).font(.system(size: 17, weight: .semibold)).frame(width: 44, height: 44) }.foregroundStyle(.primary).opacity(dim ? 0.3 : 1).disabled(dim)
  }
  private func showTabs() { tap(); Task { await tab.snap(); sheet = .tabs } }
  /// Your tabs. Press and hold for a new tab, a private one, or to close this one.
  private var tabsButton: some View {
    let mine = b.tabs.filter { $0.isPrivate == tab.isPrivate }.count
    return Button { showTabs() } label: {
      ZStack { Image(systemName: "square.on.square").font(.system(size: 17, weight: .medium)); if mine > 1 { Text("\(mine)").font(.system(size: 9, weight: .bold, design: .rounded)).offset(x: -2.5, y: 2.5) } }.frame(width: 44, height: 44)
    }
    .foregroundStyle(.primary)
    .contextMenu {
      Button { b.newTab(isPrivate: false) } label: { Label("New Tab", systemImage: "plus") }
      Button { b.newTab(isPrivate: true) } label: { Label("New Private Tab", systemImage: "eyeglasses") }
      Button(role: .destructive) { b.close(tab) } label: { Label("Close This Tab", systemImage: "xmark") }
    }
  }
  @ViewBuilder private var menu: some View {
    ControlGroup {
      Button { tab.web.goForward() } label: { Label("Forward", systemImage: "chevron.right") }.disabled(!tab.canForward || tab.atStart)
      Button { tab.web.reload() } label: { Label("Reload", systemImage: "arrow.clockwise") }.disabled(tab.atStart)
      if let u = tab.address, tab.isWeb { ShareLink(item: u) { Label("Share", systemImage: "square.and.arrow.up") } }
    }
    ControlGroup {
      Button { b.newTab(isPrivate: false) } label: { Label("New Tab", systemImage: "plus") }
      Button { b.newTab(isPrivate: true) } label: { Label("Private Tab", systemImage: "eyeglasses") }
    }
    if tab.isWeb {
      if !tab.isPrivate { Button { b.openInApp() } label: { Label("Open in App", systemImage: "arrow.up.forward.app") } }
      Button { b.toggleBookmark() } label: { Label(b.isBookmarked(tab) ? "Remove Bookmark" : "Add Bookmark", systemImage: b.isBookmarked(tab) ? "bookmark.fill" : "bookmark") }
      if !tab.isPrivate { Button { sheet = .save } label: { Label("Save to Sleek…", systemImage: "tray.and.arrow.down") } }
    }
    if !tab.atStart { Button { tab.find() } label: { Label("Find on Page", systemImage: "magnifyingglass") } }
    Button { sheet = .library } label: { Label("Bookmarks and History", systemImage: "book") }
    if !tab.isPrivate { Button { sheet = .tasks } label: { Label("Tasks", systemImage: "checklist") } }
    Divider()
    Button { sheet = .settings } label: { Label("Settings", systemImage: "gearshape") }
  }
  /// What stands before the address: a looking glass on a new tab, Sleek's mark on Sleek's own pages, and on the web
  /// the shield, which opens blocking for this site.
  @ViewBuilder private var lead: some View {
    if tab.atStart { Image(systemName: tab.isPrivate ? "eyeglasses" : "magnifyingglass").font(.system(size: 14, weight: .medium)).foregroundStyle(.secondary) }
    else if tab.isSleek { Mark(size: 15) }
    else {
      Button { tap(); sheet = .shield } label: {
        Image(systemName: tab.blocking ? "checkmark.shield.fill" : (b.blockerReady ? "shield.slash" : "shield")).font(.system(size: 14)).foregroundStyle(tab.blocking ? Color.tasks : .secondary).frame(width: 26, height: 40).contentShape(Rectangle())
      }.padding(.horizontal, -6)
    }
  }
  /// The address: press it to search or type an address. Slide it sideways for the next or last tab, up for all of them.
  private var address: some View {
    HStack(spacing: 8) {
      lead
      Text(tab.atStart ? (tab.isPrivate ? "Search privately" : "Search or enter address") : tab.shownName).font(.system(size: 15, weight: tab.atStart ? .regular : .medium)).foregroundStyle(tab.atStart ? .secondary : .primary).lineLimit(1)
      Spacer(minLength: 0)
      if tab.isPrivate && !tab.atStart { Image(systemName: "eyeglasses").font(.system(size: 13, weight: .medium)).foregroundStyle(.secondary) }
      if !tab.atStart { Button { tap(); if tab.loading { tab.web.stopLoading() } else { tab.web.reload() } } label: { Image(systemName: tab.loading ? "xmark" : "arrow.clockwise").font(.system(size: 13, weight: .semibold)).frame(width: 30, height: 34) }.foregroundStyle(.secondary) }
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

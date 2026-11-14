// Sleek for iPhone: what is open and what it knows. The views (Views.swift, Start.swift, Sheets.swift)
// draw this and call into it; nothing here draws.
//
//   PhoneTab   one tab: a page in the phone's own web engine, or (atStart) your day. A private tab keeps
//              its cookies apart, writes no history, and is forgotten when the last private tab closes.
//   Browser    the tabs, which one is showing, where the bar lives, your Sleek work as last read,
//              bookmarks and history and settings (the Mac app's Store), and blocking.
import SwiftUI
import WebKit

struct TaskRow: Identifiable, Equatable { let id: String, title: String, board: String, color: String, due: String; var done: Bool; let late: Bool }
struct WorkItem: Identifiable { let id: String, title: String, url: String, kind: String, at: Double, slides: Int }
struct Board: Identifiable, Equatable { let id: String, name: String, color: String, open: Int }
struct Day { var late: [TaskRow] = [], today: [TaskRow] = [], soon: [TaskRow] = [], done: [TaskRow] = [], recent: [WorkItem] = [], boards: [Board] = [], loaded = false
  var due: Int { late.count + today.count } }
struct Suggestion: Identifiable { let kind: String, title: String, hint: String, url: String; var id: String { kind + "|" + title + "|" + url } }

enum Corner: String, CaseIterable { case topLeading, topTrailing, bottomLeading, bottomTrailing
  var isTop: Bool { self == .topLeading || self == .topTrailing }
  var isLeading: Bool { self == .topLeading || self == .bottomLeading }
  var alignment: Alignment { switch self { case .topLeading: return .topLeading; case .topTrailing: return .topTrailing; case .bottomLeading: return .bottomLeading; case .bottomTrailing: return .bottomTrailing } } }

@MainActor
final class PhoneTab: NSObject, ObservableObject, Identifiable, WKNavigationDelegate, WKUIDelegate {
  let id = UUID().uuidString
  let web: WKWebView
  let isPrivate: Bool
  @Published var title = ""
  @Published var address: URL?
  @Published var loading = false
  @Published var progress = 0.0
  @Published var canBack = false
  @Published var canForward = false
  @Published var atStart = true          // showing your day, not a page
  @Published var shot: UIImage?          // how it looked when last left, for the grid of tabs
  private(set) var blocking = false      // whether the block lists are on this tab now
  weak var browser: Browser?
  private var watch: [NSKeyValueObservation] = [], lastY: CGFloat = 0

  init(browser: Browser, isPrivate: Bool = false) {
    self.isPrivate = isPrivate
    let c = WKWebViewConfiguration()
    c.websiteDataStore = isPrivate ? browser.privateData : Work.store
    c.setURLSchemeHandler(OwnPages(), forURLScheme: "sleek")
    c.applicationNameForUserAgent = "Version/26.0 Mobile/15E148 Safari/604.1"      // sites treat Sleek as they treat Safari, whose engine it is
    c.allowsInlineMediaPlayback = true
    web = WKWebView(frame: .zero, configuration: c); self.browser = browser
    super.init()
    web.navigationDelegate = self; web.uiDelegate = self; web.allowsBackForwardNavigationGestures = true; web.isFindInteractionEnabled = true
    let pull = UIRefreshControl(); pull.addTarget(self, action: #selector(pulled(_:)), for: .valueChanged); web.scrollView.refreshControl = pull
    let sync: (WKWebView, Any) -> Void = { [weak self] _, _ in Task { @MainActor in self?.sync() } }
    watch = [web.observe(\.title, changeHandler: sync), web.observe(\.url, changeHandler: sync), web.observe(\.isLoading, changeHandler: sync), web.observe(\.estimatedProgress, changeHandler: sync),
             web.observe(\.canGoBack, changeHandler: sync), web.observe(\.canGoForward, changeHandler: sync),
             web.scrollView.observe(\.contentOffset) { [weak self] s, _ in MainActor.assumeIsolated { self?.scrolled(s) } }]
    fit(top: browser.barAtTop)
  }
  /// Leave room for the bar at whichever end it is, so nothing at the very top or bottom of a page sits under it.
  func fit(top: Bool) {
    let room: CGFloat = 62, inset = UIEdgeInsets(top: top ? room : 0, left: 0, bottom: top ? 0 : room, right: 0)
    web.scrollView.contentInset = inset; web.scrollView.verticalScrollIndicatorInsets = inset
  }
  private func sync() { title = web.title ?? ""; address = web.url; loading = web.isLoading; progress = web.estimatedProgress; canBack = web.canGoBack; canForward = web.canGoForward }
  @objc private func pulled(_ c: UIRefreshControl) { tap(.medium); web.reload(); DispatchQueue.main.asyncAfter(deadline: .now() + 0.7) { c.endRefreshing() } }
  /// Scrolling down a page draws the bar in; scrolling up, or reaching the top, brings it back.
  private func scrolled(_ s: UIScrollView) {
    guard let b = browser, b.current === self, !atStart, s.isDragging || s.isDecelerating else { return }
    let y = s.contentOffset.y + s.adjustedContentInset.top
    if y <= 4 { b.setCompact(false); lastY = y } else if y > lastY + 28, y > 80 { b.setCompact(true); lastY = y } else if y < lastY - 44 { b.setCompact(false); lastY = y }
    else if abs(y - lastY) > 120 { lastY = y }
  }
  var host: String { let h = address?.host ?? ""; return h.hasPrefix("www.") ? String(h.dropFirst(4)) : h }
  var isSleek: Bool { address?.scheme == "sleek" }
  var isWeb: Bool { !atStart && (address?.scheme == "https" || address?.scheme == "http") }
  var shownName: String {
    if atStart { return "" }
    if isSleek { let f = address?.lastPathComponent ?? ""; return f.hasPrefix("slides") || f.hasPrefix("deck") ? "Sleek Slides" : f.hasPrefix("doc") ? "Sleek Docs" : f.hasPrefix("tasks") ? "Sleek Tasks" : "Sleek" }
    return host
  }
  var shownTitle: String { atStart ? (isPrivate ? "Private Tab" : "New Tab") : (title.isEmpty ? shownName : title) }
  func go(_ url: URL) { atStart = false; tapAt = .distantPast; web.load(URLRequest(url: url)) }
  func back() { if web.canGoBack { web.goBack() } else { atStart = true; browser?.setCompact(false) } }
  func find() { web.findInteraction?.presentFindNavigator(showingReplace: false) }
  /// Keep a picture of the page for the grid of tabs.
  func snap() async { if atStart { shot = nil; return }; shot = try? await web.takeSnapshot(configuration: nil) }
  /// Put the block lists on this tab, or take them off. The next page it loads is under the new rule.
  func applyBlocking(_ on: Bool) {
    let c = web.configuration.userContentController; c.removeAllContentRuleLists()
    if on { Blocker.shared.lists.values.forEach { c.add($0) } }
    blocking = on; objectWillChange.send()
  }

  // ---------- going places ----------
  /// A link you tapped, and where you were when you tapped it. For a few seconds afterwards, wherever that tap leads
  /// (a short link, a "you are leaving" page) is still that tap, and may be handed to an app.
  var tapAt = Date.distantPast, tapSite = ""
  /// An address this tab is to load itself, whatever app might want it.
  private var passing: URL?
  /// The site a host belongs to: example.com for www.example.com and m.example.com.
  static func site(_ host: String?) -> String {
    let parts = (host ?? "").lowercased().split(separator: ".").map(String.init); guard parts.count > 2 else { return parts.joined(separator: ".") }
    let two = parts.suffix(2), wide = two.last!.count == 2 && ["co", "com", "org", "net", "gov", "ac", "edu"].contains(two.first!)
    return parts.suffix(wide ? 3 : 2).joined(separator: ".")
  }
  /// Load an address here in Sleek, without offering it to an app.
  func stay(_ request: URLRequest) { passing = request.url; atStart = false; web.load(request) }
  func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, preferences: WKWebpagePreferences, decisionHandler: @escaping (WKNavigationActionPolicy, WKWebpagePreferences) -> Void) {
    guard let u = action.request.url, let scheme = u.scheme else { decisionHandler(.allow, preferences); return }
    let whole = action.targetFrame == nil || action.targetFrame?.isMainFrame == true      // the page itself (or a new one), not a frame inside it
    if !["http", "https", "sleek", "about", "blob", "data"].contains(scheme) {      // phone numbers, mail, other apps: they belong to the phone
      if whole { UIApplication.shared.open(u) }; decisionHandler(.cancel, preferences); return
    }
    if action.shouldPerformDownload { browser?.say("Saving files is not in Sleek for iPhone yet"); decisionHandler(.cancel, preferences); return }
    let allow = { [weak self] in
      if let s = self, action.targetFrame?.isMainFrame == true { let want = s.browser?.blockingWanted(for: u) ?? false; if want != s.blocking { s.applyBlocking(want) } }
      decisionHandler(.allow, preferences)
    }
    guard whole, scheme == "http" || scheme == "https", let b = browser else { allow(); return }
    if u == passing { passing = nil; allow(); return }
    // Handing a link to its app (any app on the phone that opens its own site's links):
    //   a link you tap that leads to another site is offered to the phone first; if an app on this iPhone opens that
    //   site's links, it opens there and this page stays as it was. Links within the site you are browsing, addresses
    //   you type, and private tabs stay in Sleek.
    let tapped = action.navigationType == .linkActivated, here = PhoneTab.site(webView.url?.host)
    if tapped { tapAt = Date(); tapSite = here }
    let fromTap = tapped || (action.navigationType == .other && Date().timeIntervalSince(tapAt) < 4)
    let away = PhoneTab.site(u.host) != (tapped ? here : tapSite)
    if fromTap && away && b.appLinks && !isPrivate {
      b.handOff(u) { [weak self] opened in
        if opened { self?.tapAt = .distantPast; decisionHandler(.cancel, preferences) } else { allow() }
      }
      return
    }
    // The engine would itself hand a tapped link on another host to an app. Where Sleek has decided the link stays
    // (a private tab, the same site, the setting off), it loads the address itself instead.
    if tapped && action.targetFrame?.isMainFrame == true && u.host != webView.url?.host { decisionHandler(.cancel, preferences); stay(action.request); return }
    allow()
  }
  func webView(_ webView: WKWebView, decidePolicyFor response: WKNavigationResponse, decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
    if !response.canShowMIMEType { browser?.say("Saving files is not in Sleek for iPhone yet") }
    decisionHandler(response.canShowMIMEType ? .allow : .cancel)
  }
  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    guard let b = browser, let u = webView.url else { return }
    b.pageLoaded(self)
    guard !isPrivate, u.scheme == "https" || u.scheme == "http" else { return }
    b.store.visit(url: u.absoluteString, title: webView.title ?? "")
    webView.evaluateJavaScript("(function(){ var l = document.querySelector('link[rel~=\"icon\"], link[rel=\"apple-touch-icon\"]'); return l && l.href ? l.href : location.origin + '/favicon.ico'; })()") { v, _ in
      if let icon = v as? String, let h = u.host { Icons.keep(host: h, from: icon) }
    }
  }
  func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { failed(error) }
  func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { failed(error) }
  private func failed(_ error: Error) {
    let e = error as NSError
    if e.code == NSURLErrorCancelled || (e.domain == "WebKitErrorDomain" && e.code == 102) { return }      // you went elsewhere
    let at = (e.userInfo[NSURLErrorFailingURLErrorKey] as? URL) ?? web.url
    let esc = { (s: String) in s.replacingOccurrences(of: "&", with: "&amp;").replacingOccurrences(of: "<", with: "&lt;") }
    let page = "<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width, initial-scale=1'><title>Can’t open this page</title><style>:root{color-scheme:light dark}body{font:17px/1.5 -apple-system,system-ui,sans-serif;margin:22vh 24px 0}h1{font-size:28px;letter-spacing:-.02em;margin:0 0 8px}p{color:#777;margin:0 0 6px}code{font-size:13px;word-break:break-all}</style><h1>Sleek can’t open this page</h1><p>\(esc(e.localizedDescription))</p><p><code>\(esc(at?.absoluteString ?? ""))</code></p>"
    web.loadSimulatedRequest(URLRequest(url: at ?? URL(string: "about:blank")!), responseHTML: page)
  }

  // ---------- what a page may ask for ----------
  func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
    if action.request.url != nil, let t = browser?.newTab(nil, isPrivate: isPrivate) { t.tapAt = tapAt; t.tapSite = tapSite; t.stay(action.request) }      // a link that opens a new window opens a new tab
    return nil
  }
  private func ask(_ title: String, _ text: String, field: String? = nil, cancel: Bool, done: @escaping (Bool, String?) -> Void) {
    let a = UIAlertController(title: title, message: text, preferredStyle: .alert)
    if let f = field { a.addTextField { $0.text = f } }
    if cancel { a.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in done(false, nil) }) }
    a.addAction(UIAlertAction(title: "OK", style: .default) { _ in done(true, a.textFields?.first?.text) })
    if let top = topController() { top.present(a, animated: true) } else { done(false, nil) }
  }
  private var asker: String { (web.url?.host ?? "This page") }
  func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) { ask(asker + " says", message, cancel: false) { _, _ in completionHandler() } }
  func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) { ask(asker + " asks", message, cancel: true) { ok, _ in completionHandler(ok) } }
  func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (String?) -> Void) { ask(asker + " asks", prompt, field: defaultText ?? "", cancel: true) { ok, s in completionHandler(ok ? s : nil) } }
  /// Press and hold a link: open it in a new tab (or a private one), copy it, or share it.
  func webView(_ webView: WKWebView, contextMenuConfigurationFor elementInfo: WKContextMenuElementInfo) async -> UIContextMenuConfiguration? {
    guard let u = elementInfo.linkURL else { return nil }
    return UIContextMenuConfiguration(identifier: nil, previewProvider: nil) { [weak self] _ in
      UIMenu(title: u.absoluteString, children: [
        UIAction(title: "Open in New Tab", image: UIImage(systemName: "plus.square.on.square")) { _ in self?.browser?.newTab(u, isPrivate: self?.isPrivate ?? false) },
        UIAction(title: "Open in Private Tab", image: UIImage(systemName: "eyeglasses")) { _ in self?.browser?.newTab(u, isPrivate: true) },
        UIAction(title: "Copy Link", image: UIImage(systemName: "doc.on.doc")) { _ in UIPasteboard.general.url = u },
        UIAction(title: "Share…", image: UIImage(systemName: "square.and.arrow.up")) { _ in topController()?.present(UIActivityViewController(activityItems: [u], applicationActivities: nil), animated: true) }
      ])
    }
  }
}

@MainActor
final class Browser: ObservableObject {
  @Published var tabs: [PhoneTab] = []
  @Published var at = 0
  @Published var compact = false                 // the bar drawn in to its tile
  @Published var slideFrom: Edge = .trailing     // which way the next tab comes in
  @Published var day = Day()
  @Published var blockerReady = false
  @Published var toast: String?
  /// Where the bar lives is yours to choose: along the bottom or along the top (asked the first time, then in Settings and the
  /// ⋯ menu, or by dragging its tile to a top or bottom corner). The corner also says which side the tile rests on.
  @Published var corner: Corner { didSet { store.set("corner", corner.rawValue); fit() } }
  @Published var look: String { didSet { store.set("look", look) } }
  @Published var asking: Bool
  let store: Store
  var privateData = WKWebsiteDataStore.nonPersistent()
  /// Whether a tapped link may open in its own app. On unless you switch it off in Settings.
  var appLinks: Bool { store.settings["apps"] as? Bool ?? true }
  /// Offers an address to the phone: true when an app on this iPhone opened it. (The app's own check puts a stand-in here.)
  var handOff: (URL, @escaping (Bool) -> Void) -> Void = { url, done in UIApplication.shared.open(url, options: [.universalLinksOnly: true]) { ok in done(ok) } }
  /// Open the page showing in its app, if there is one.
  func openInApp() {
    guard tab.isWeb, let u = tab.address else { return }
    handOff(u) { [weak self] opened in if !opened { self?.say("No app on this iPhone opens this page") } }
  }
  private var toastN = 0

  init() {
    let base = Res.proving ? FileManager.default.temporaryDirectory.appendingPathComponent("sleek-prove-\(ProcessInfo.processInfo.processIdentifier)") : FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("Sleek")
    store = Store(dir: base)
    corner = Corner(rawValue: store.settings["corner"] as? String ?? "") ?? .bottomTrailing
    look = store.settings["look"] as? String ?? "auto"
    asking = (store.settings["corner"] == nil && !Res.proving) || Res.args.contains("--welcome")
    if let place = Res.arg("--bar") { corner = place == "top" ? .topTrailing : .bottomTrailing; asking = false }
    Icons.dir = base.appendingPathComponent("icons"); Icons.onNew = { [weak self] in Task { @MainActor in self?.objectWillChange.send() } }
    Blocker.shared.onChange.append { [weak self] in self?.blockerChanged() }
    Blocker.shared.start(dir: base.appendingPathComponent("lists"))
    Work.shared.folder = base.appendingPathComponent("Work")
    Work.shared.onNote = { [weak self] text in self?.say(text) }
    Work.shared.onChange.append { [weak self] in self?.readDay() }
    Work.shared.start()
    Timer.scheduledTimer(withTimeInterval: 180, repeats: true) { _ in Task { @MainActor in await Work.shared.keepCopy() } }
    // the tabs you had open come back; `--open <address>` (for looking at the app) starts on those pages instead
    var asked: [URL] = []; for (i, a) in Res.args.enumerated() where a == "--open" && i + 1 < Res.args.count { if let u = URL(string: Res.args[i + 1]) { asked.append(u) } }
    let again = Res.proving || !asked.isEmpty ? [] : (store.settings["session"] as? [String] ?? []).compactMap { URL(string: $0) }
    for u in asked.isEmpty ? again : asked { let t = PhoneTab(browser: self); tabs.append(t); t.go(u) }
    if tabs.isEmpty { tabs = [PhoneTab(browser: self)] }
    at = asked.isEmpty ? min(max(0, store.settings["sessionAt"] as? Int ?? 0), tabs.count - 1) : 0
  }
  var tab: PhoneTab { tabs[min(at, tabs.count - 1)] }
  /// The tab showing, or none while the first is still being made.
  var current: PhoneTab? { tabs.isEmpty ? nil : tabs[min(at, tabs.count - 1)] }
  var scheme: ColorScheme? { look == "dark" ? .dark : look == "light" ? .light : nil }
  var barAtTop: Bool { corner.isTop }
  func setCompact(_ on: Bool) { if compact != on { withAnimation(.spring(response: 0.44, dampingFraction: 0.8)) { compact = on } } }
  func placeBar(top: Bool) {
    guard top != barAtTop else { return }
    tap(.medium); withAnimation(.spring(response: 0.5, dampingFraction: 0.82)) { corner = top ? (corner.isLeading ? .topLeading : .topTrailing) : (corner.isLeading ? .bottomLeading : .bottomTrailing); compact = false }
  }
  func chose(top: Bool) { tap(.medium); withAnimation(.spring(response: 0.5, dampingFraction: 0.82)) { corner = top ? .topTrailing : .bottomTrailing; asking = false } }
  func fit() { for t in tabs { t.fit(top: barAtTop) } }
  /// A short message over the page, gone in a few seconds.
  func say(_ text: String) { toastN += 1; let n = toastN; withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) { toast = text }; DispatchQueue.main.asyncAfter(deadline: .now() + 3) { [weak self] in if self?.toastN == n { withAnimation(.easeOut(duration: 0.25)) { self?.toast = nil } } } }

  // ---------- tabs ----------
  /// A new tab, on a page or on your day; private when asked, or when opened from a private tab.
  @discardableResult func newTab(_ url: URL? = nil, isPrivate: Bool? = nil) -> PhoneTab {
    let t = PhoneTab(browser: self, isPrivate: isPrivate ?? tab.isPrivate); tabs.append(t); show(tabs.count - 1); if let u = url { t.go(u) }; saveSession(); return t
  }
  func show(_ i: Int) {
    guard i >= 0, i < tabs.count, i != at else { return }
    let leaving = tab; Task { await leaving.snap() }
    slideFrom = i > at ? .trailing : .leading
    withAnimation(.spring(response: 0.4, dampingFraction: 0.86)) { at = i; compact = false }
    tap(); saveSession()
  }
  func close(_ t: PhoneTab) {
    guard let i = tabs.firstIndex(where: { $0 === t }) else { return }
    withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) { tabs.remove(at: i); if tabs.isEmpty { tabs = [PhoneTab(browser: self)] }; at = min(at > i ? at - 1 : at, tabs.count - 1) }
    if !tabs.contains(where: { $0.isPrivate }) { privateData = .nonPersistent() }      // the last private tab is gone: so is everything they kept
    saveSession()
  }
  /// The neighbour of the tab showing, among tabs of its own kind (private or not), for sliding the address sideways.
  func neighbour(_ step: Int) -> Int? {
    let mine = tabs.indices.filter { tabs[$0].isPrivate == tab.isPrivate }; guard let k = mine.firstIndex(of: at) else { return nil }
    let j = k + step; return j >= 0 && j < mine.count ? mine[j] : nil
  }
  func open(_ typed: String) { if let u = destination(for: typed, search: store.search) { tab.go(u); setCompact(false) } }
  func pageLoaded(_ t: PhoneTab) { saveSession(); if t.isSleek { Work.shared.refresh() } }
  /// The tabs to bring back next time (never private ones).
  func saveSession() {
    let keep = tabs.filter { !$0.isPrivate && !$0.atStart }
    store.set("session", keep.compactMap { $0.web.url?.absoluteString }.filter { $0.hasPrefix("http") || $0.hasPrefix("sleek://app/") })
    store.set("sessionAt", keep.firstIndex { $0 === tab } ?? 0)
  }

  /// Leaving the app: everything is written down now, not a moment later.
  func leaving() { saveSession(); store.flush(); Task { @MainActor in await Work.shared.keepCopy() } }
  func clearHistory() { store.clearHistory(); store.flush(); objectWillChange.send(); say("History cleared") }
  func forget(_ url: String) { store.history.removeAll { ($0["u"] as? String) == url }; store.flush(); objectWillChange.send() }
  /// Sign out of sites and empty what they kept to load faster. Your Sleek work is kept apart from these and stays.
  func clearCookies() {
    Work.store.removeData(ofTypes: [WKWebsiteDataTypeCookies, WKWebsiteDataTypeDiskCache, WKWebsiteDataTypeMemoryCache], modifiedSince: .distantPast) { [weak self] in Task { @MainActor in self?.say("Cookies and cache cleared") } }
  }

  // ---------- blocking ----------
  var blockOff: [String] { store.settings["blockOff"] as? [String] ?? [] }
  func blockingOn(_ host: String) -> Bool { !blockOff.contains(host) }
  func allowBlocking(_ host: String) { store.set("blockOff", blockOff.filter { $0 != host }); objectWillChange.send() }
  /// Blocking is on for the web, once the lists are ready, except on sites you switched it off for.
  func blockingWanted(for url: URL) -> Bool { guard Blocker.shared.ready, let s = url.scheme, s == "http" || s == "https", let h = url.host else { return false }; return !blockOff.contains(h) }
  private func blockerChanged() { blockerReady = Blocker.shared.ready; for t in tabs { if let u = t.web.url, blockingWanted(for: u) { t.applyBlocking(true) } } }
  /// Switch blocking on or off for the site showing; the page loads again under the new rule.
  func setBlocking(_ on: Bool) {
    guard let h = tab.address?.host else { return }
    var off = blockOff.filter { $0 != h }; if !on { off.append(h) }
    store.set("blockOff", off); tab.applyBlocking(on && Blocker.shared.ready); tab.web.reload(); tap(.medium)
  }

  // ---------- bookmarks ----------
  func isBookmarked(_ t: PhoneTab) -> Bool { t.isWeb && store.bookmark(for: t.address?.absoluteString ?? "") != nil }
  func toggleBookmark() {
    guard tab.isWeb, let u = tab.address?.absoluteString else { return }
    if store.bookmark(for: u) != nil { store.removeBookmark(url: u); say("Bookmark removed") } else { store.addBookmark(title: tab.title.isEmpty ? tab.host : tab.title, url: u); say("Bookmarked") }
    tap(.medium); objectWillChange.send()
  }

  // ---------- your Sleek work (the same door the Mac app uses: Work.swift and bridge.html) ----------
  private func readDay() {
    let d = Work.shared.day
    func rows(_ k: String) -> [TaskRow] { (d[k] as? [[String: Any]] ?? []).map { TaskRow(id: $0["id"] as? String ?? "", title: $0["title"] as? String ?? "", board: $0["board"] as? String ?? "", color: $0["color"] as? String ?? "#12A36A", due: $0["due"] as? String ?? "", done: $0["done"] as? Bool ?? false, late: $0["late"] as? Bool ?? false) } }
    func items(_ k: String, _ kind: String) -> [WorkItem] { (d[k] as? [[String: Any]] ?? []).map { WorkItem(id: $0["id"] as? String ?? "", title: $0["title"] as? String ?? "", url: $0["url"] as? String ?? "", kind: kind, at: ($0["at"] as? NSNumber)?.doubleValue ?? 0, slides: ($0["slides"] as? NSNumber)?.intValue ?? 0) } }
    let boards = (d["boards"] as? [[String: Any]] ?? []).map { Board(id: $0["id"] as? String ?? "", name: $0["name"] as? String ?? "", color: $0["color"] as? String ?? "#12A36A", open: ($0["open"] as? NSNumber)?.intValue ?? 0) }
    withAnimation(.spring(response: 0.4, dampingFraction: 0.85)) {
      day = Day(late: rows("late"), today: rows("today"), soon: rows("soon"), done: rows("done"), recent: (items("decks", "slides") + items("pages", "docs")).sorted { $0.at > $1.at }.prefix(6).map { $0 }, boards: boards, loaded: true)
    }
  }
  func tick(_ t: TaskRow) { tap(.medium); Work.shared.tick(t.id, !t.done) }
  func addTask(_ title: String, board: String = "", due: String = "today") {
    let t = title.trimmingCharacters(in: .whitespacesAndNewlines); if t.isEmpty { return }
    tap(.medium); Task { @MainActor in if await Work.shared.addTask(title: t, board: board, due: due) == nil { say("That could not be added") } }
  }
  /// Save to Sleek: the page showing becomes a task (with a link back, and any words you selected) or a Docs page.
  func save(asPage: Bool, board: String = "", due: String = "today") async -> Bool {
    let t = tab; guard t.isWeb else { return false }
    let p = (try? await t.web.evaluateJavaScript(readPageScript)) as? [String: Any] ?? [:]
    let title = (p["title"] as? String) ?? t.title, url = (p["url"] as? String) ?? (t.address?.absoluteString ?? ""), blocks = p["blocks"] as? [[String: Any]] ?? [], sel = p["sel"] as? String ?? ""
    if asPage { if let made = await Work.shared.keepPage(title: title, url: url, blocks: blocks) { say("Kept as a Docs page"); lastKept = made; return true } }
    else if let b = await Work.shared.addTask(title: "Read: " + title, board: board, due: due, url: url, words: String(sel.prefix(4000))) { say("Added to " + b); return true }
    say("That could not be saved"); return false
  }
  /// The address of the Docs page Save to Sleek last made.
  private(set) var lastKept: String?

  // ---------- what to offer as you type ----------
  /// Your own work first (never in a private tab), then places you know, then well-known sites, then a search.
  func suggestions(_ typed: String) -> [Suggestion] {
    let q = typed.trimmingCharacters(in: .whitespaces), hidden = tab.isPrivate; var out: [Suggestion] = []
    func host(_ u: String) -> String { URL(string: u)?.host ?? "" }
    if q.isEmpty { return hidden ? [] : store.history.prefix(6).map { Suggestion(kind: "history", title: ($0["t"] as? String) ?? "", hint: host(($0["u"] as? String) ?? ""), url: ($0["u"] as? String) ?? "") } }
    if !hidden { for n in Work.shared.suggest(q, limit: 3) { let k = n["kind"] as? String ?? ""; out.append(Suggestion(kind: k, title: n["title"] as? String ?? "", hint: k == "slides" ? "Deck" : k == "docs" ? "Page" : (n["task"] as? Bool == true ? "Task" : "Board"), url: n["url"] as? String ?? "")) } }
    for s in store.suggest(q, limit: 4) where !hidden || (s["kind"] as? String) == "bookmark" { out.append(Suggestion(kind: s["kind"] as? String ?? "history", title: s["title"] as? String ?? "", hint: host(s["url"] as? String ?? ""), url: s["url"] as? String ?? "")) }
    for s in Sites.matching(q, limit: 3) where !out.contains(where: { host($0.url).replacingOccurrences(of: "www.", with: "") == host(s["url"] as? String ?? "") }) { out.append(Suggestion(kind: "site", title: s["title"] as? String ?? "", hint: host(s["url"] as? String ?? ""), url: s["url"] as? String ?? "")) }
    out.append(Suggestion(kind: "search", title: "Search " + Search.name(for: store.search) + " for “\(q)”", hint: "", url: ""))
    return out
  }
}

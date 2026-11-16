// Sleek for iPhone: what is open and what it knows. The views (Views.swift, Start.swift, Sheets.swift)
// draw this and call into it; nothing here draws.
//
//   PhoneTab   one tab: a page in the phone's own web engine, or (atStart) your day. A private tab keeps
//              its cookies apart, writes no history, and is forgotten when the last private tab closes.
//   Browser    the tabs, which one is showing, where the bar lives, your Sleek work as last read,
//              bookmarks and history and settings (the Mac app's Store), and blocking.
import SwiftUI
import WidgetKit
import WebKit

struct TaskRow: Identifiable, Equatable { let id: String, title: String, board: String, color: String, due: String; var done: Bool; let late: Bool }
/// A deck or page you worked on lately, with enough to draw its preview: a page's opening words; a deck's cover
/// (its kicker and heading) and theme; and a picture of your own for either, when you set one.
struct WorkItem: Identifiable { let id: String, title: String, url: String, kind: String, at: Double, slides: Int; var peek = "", kicker = "", heading = "", mode = "dark", accent = "#7C5CFF", thumb = "" }
struct Board: Identifiable, Equatable { let id: String, name: String, color: String, open: Int }
/// A grocery list that is on Today (not shopped, its day today or gone by): how much is left, and the first things to get.
struct ListRow: Identifiable, Equatable { let id: String, name: String, color: String, due: String, late: Bool; var left: Int, got: Int; let all: Int, url: String; var items: [ThingRow] }
struct ThingRow: Identifiable, Equatable { let id: String, title: String, qty: Int, aisle: String; var done: Bool }
struct Day { var late: [TaskRow] = [], today: [TaskRow] = [], soon: [TaskRow] = [], done: [TaskRow] = [], recent: [WorkItem] = [], boards: [Board] = [], lists: [ListRow] = [], loaded = false
  var toGet: Int { lists.reduce(0) { $0 + $1.left } }
  var due: Int { late.count + today.count } }
struct SavedName: Identifiable, Equatable { let id: String, user: String }
struct SignInOffer: Equatable { let tab: String, site: String, users: [SavedName], strong: String; var keys: [SavedName] = [] }
/// A site asks to make a passkey, or to sign in with one (Passkeys.swift).
struct KeyQuestion: Equatable { let tab: String, ask: String, make: Bool, site: String, user: String, users: [SavedName] }
struct SignInAsk: Equatable { let site: String, user: String, update: Bool }
struct Suggestion: Identifiable { let kind: String, title: String, hint: String, url: String; var id: String { kind + "|" + title + "|" + url } }

enum Corner: String, CaseIterable { case topLeading, topTrailing, bottomLeading, bottomTrailing
  var isTop: Bool { self == .topLeading || self == .topTrailing }
  var isLeading: Bool { self == .topLeading || self == .bottomLeading }
  var alignment: Alignment { switch self { case .topLeading: return .topLeading; case .topTrailing: return .topTrailing; case .bottomLeading: return .bottomLeading; case .bottomTrailing: return .bottomTrailing } } }

@MainActor
final class PhoneTab: NSObject, ObservableObject, Identifiable, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
  let id = UUID().uuidString
  let web: WKWebView
  let isPrivate: Bool
  /// Finds the site's icon: its iPhone icon (marked "#touch"), or else the largest it names, or else /favicon.ico.
  static let iconScript = """
  (function(){ var t = document.querySelector('link[rel~="apple-touch-icon"], link[rel~="apple-touch-icon-precomposed"]'); if (t && t.href) return t.href + '#touch';
    var best = null, top = -1; document.querySelectorAll('link[rel~="icon"]').forEach(function(l){ var s = parseInt((l.getAttribute('sizes') || '').split('x')[0], 10) || (/\\.svg/i.test(l.href) ? 0 : 16); if (l.href && s > top) { top = s; best = l.href; } });
    return best || location.origin + '/favicon.ico'; })()
  """
  static var upgraded = Set<String>()
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
  /// Where the page's passkey questions arrive (Passkeys.swift, shared with the Mac app).
  let keys = KeyBridge()

  /// `from`: the settings a page hands over when it opens a window of its own (a sign-in window, say). The new tab must be
  /// made from them, or the page that opened it and the window it opened can't talk to each other, and the sign-in never comes back.
  init(browser: Browser, isPrivate: Bool = false, from given: WKWebViewConfiguration? = nil) {
    self.isPrivate = isPrivate
    let c = given ?? WKWebViewConfiguration()
    if given != nil { c.userContentController = WKUserContentController() }      // its own scripts and messages, not those of the page that asked; the rest (below) it already has
    else {
      c.websiteDataStore = isPrivate ? browser.privateData : Work.store
      c.setURLSchemeHandler(OwnPages(), forURLScheme: "sleek")
      c.applicationNameForUserAgent = "Version/26.0 Mobile/15E148 Safari/604.1"      // sites treat Sleek as they treat Safari, whose engine it is
      c.allowsInlineMediaPlayback = true
    }
    web = WKWebView(frame: .zero, configuration: c); self.browser = browser
    super.init()
    web.navigationDelegate = self; web.uiDelegate = self; web.allowsBackForwardNavigationGestures = true; web.isFindInteractionEnabled = true
    // signing in: a script apart from the page's own (the same one the Mac app uses) says where the sign-in boxes are and what was sent
    c.userContentController.addUserScript(WKUserScript(source: sharedSignInScript, injectionTime: .atDocumentEnd, forMainFrameOnly: true, in: signInWorld))
    c.userContentController.add(Weak(self), contentWorld: signInWorld, name: "sleekPw")
    // passkeys: a script in the page stands in for navigator.credentials and hands the question to Sleek
    c.userContentController.addUserScript(WKUserScript(source: Passkeys.script, injectionTime: .atDocumentStart, forMainFrameOnly: true))
    c.userContentController.addScriptMessageHandler(keys, contentWorld: .page, name: "sleekKey")
    let pull = UIRefreshControl(); pull.addTarget(self, action: #selector(pulled(_:)), for: .valueChanged); web.scrollView.refreshControl = pull
    let sync: (WKWebView, Any) -> Void = { [weak self] _, _ in Task { @MainActor in self?.sync() } }
    watch = [web.observe(\.title, changeHandler: sync), web.observe(\.url, changeHandler: sync), web.observe(\.isLoading, changeHandler: sync), web.observe(\.estimatedProgress, changeHandler: sync),
             web.observe(\.canGoBack, changeHandler: sync), web.observe(\.canGoForward, changeHandler: sync),
             web.scrollView.observe(\.contentOffset) { [weak self] s, _ in MainActor.assumeIsolated { self?.scrolled(s) } }]
    fit(top: browser.barAtTop)
    keys.onAsk = { [weak self] a in if let s = self { s.browser?.passkeyAsked(s, a) } }
    keys.onDrop = { [weak self] a in if let b = self?.browser, b.keyAsk?.ask == a { withAnimation(.easeOut(duration: 0.2)) { b.keyAsk = nil } } }
  }
  /// The tab is going: its page's open passkey questions are answered "not allowed", and nothing holds on to it.
  func closing() { keys.dropAll(); web.configuration.userContentController.removeScriptMessageHandler(forName: "sleekKey", contentWorld: .page) }
  func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) { keys.dropAll() }      // a new page: the old one's questions are over
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

  // ---------- signing in ----------
  /// A password Sleek made for this page (signing up). Once the page sends it, it is kept without asking.
  var suggested: String?
  func userContentController(_ c: WKUserContentController, didReceive message: WKScriptMessage) {
    guard message.name == "sleekPw", let m = message.body as? [String: Any], let u = web.url, u.scheme == "https", let host = u.host else { return }      // never over a connection others can read
    let site = Vault.site(host)
    if m["focus"] != nil { browser?.signInField(self, site: site, fresh: m["fresh"] as? Bool ?? false, on: m["on"] as? String ?? "pass", keysOnly: m["webauthn"] != nil) }
    if m["blur"] != nil, m["scrolled"] == nil { browser?.signInLeft(self) }      // on a phone the page scrolls as the keyboard comes up: that is not leaving the box
    if let s = m["sent"] as? [String: Any], let pass = s["pass"] as? String, !pass.isEmpty { browser?.signedIn(self, site: site, address: u.absoluteString, user: s["user"] as? String ?? "", password: pass) }
  }
  /// Put a name and password into the page's sign-in boxes (both password boxes, when signing up).
  func fill(user: String, password: String, both: Bool) {
    web.callAsyncJavaScript("return window.__sleekFill ? window.__sleekFill(user, pass, both) : false", arguments: ["user": user, "pass": password, "both": both], in: nil, in: signInWorld) { _ in }
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
    // the site's icon: the one it gives iPhones if it has one (large and made to be seen), or else its largest
    webView.evaluateJavaScript(PhoneTab.iconScript) { v, _ in
      guard let icon = v as? String, let h = u.host, let f = Icons.file(h) else { return }
      let touch = icon.hasSuffix("#touch"), named = touch ? String(icon.dropLast(6)) : icon
      let small = UIImage(contentsOfFile: f.path).map { $0.size.width * $0.scale < 96 } ?? true
      guard small, !PhoneTab.upgraded.contains(h), let origin = u.host.map({ (u.scheme ?? "https") + "://" + $0 }) else { Icons.keep(host: h, from: named); return }
      // no icon yet, or one too small for a tile: ask at once for the site's iPhone icon (the one it names, or else
      // the one at the usual address), keeping what there is until a better one comes; failing that, the icon it names
      PhoneTab.upgraded.insert(h)
      let stale = { try? FileManager.default.setAttributes([.modificationDate: Date.distantPast], ofItemAtPath: f.path) }
      stale(); Icons.keep(host: h, from: touch ? named : origin + "/apple-touch-icon.png")
      if !touch { DispatchQueue.main.asyncAfter(deadline: .now() + 6) {
        let got = (try? FileManager.default.attributesOfItem(atPath: f.path))?[.modificationDate] as? Date
        if got == nil || got == .distantPast { stale(); Icons.keep(host: h, from: named) }
      } }
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
    // a link that opens a new window opens a new tab. The tab is the window the page asked for (made from what the engine
    // hands over), so a sign-in window can hand its answer back to the page that opened it.
    guard let u = action.request.url, let t = browser?.newTab(nil, isPrivate: isPrivate, from: configuration) else { return nil }
    t.tapAt = tapAt; t.tapSite = tapSite; t.passing = u; t.atStart = false
    return t.web
  }
  /// A window a page opened has closed itself (a sign-in window, once you have signed in): its tab goes.
  func webViewDidClose(_ webView: WKWebView) { browser?.close(self) }
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
        UIAction(title: "Open in Background", image: UIImage(systemName: "square.on.square.dashed")) { _ in self?.browser?.newTab(u, isPrivate: self?.isPrivate ?? false, background: true) },
        UIAction(title: "Open in New Tab", image: UIImage(systemName: "plus.square.on.square")) { _ in self?.browser?.newTab(u, isPrivate: self?.isPrivate ?? false) },
        UIMenu(title: "", options: .displayInline, children: [
          UIAction(title: "Open in Private Tab", image: UIImage(systemName: "eyeglasses")) { _ in self?.browser?.newTab(u, isPrivate: true) }] +
          (self?.isPrivate == true ? [] : [UIAction(title: "Open in Background Private Tab", image: UIImage(systemName: "eyeglasses")) { _ in self?.browser?.newTab(u, isPrivate: true, background: true) }])),
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
  @Published var goals: [Goal] = []             // from Sleek Tasks, for the start page's Goals (Layout.swift)
  @Published var arranging = false               // the start page is wiggling: being arranged (Layout.swift)
  @Published var blockerReady = false
  @Published var toast: String?
  @Published var offer: SignInOffer?             // the cursor is in a sign-in box: saved names to fill, or a strong password to use
  @Published var keepAsk: SignInAsk?             // a sign-in was sent: keep it?
  @Published var keyAsk: KeyQuestion?            // a site asks to make a passkey, or to sign in with one
  private var pendingLogin: (site: String, address: String, user: String, password: String, replacing: String?)?
  private var offerN = 0
  /// Where the bar lives is yours to choose: along the bottom or along the top (asked the first time, then in Appearance and the
  /// ⋯ menu, or by dragging its tile to a top or bottom corner). The corner also says which side the tile rests on.
  @Published var corner: Corner { didSet { store.set("corner", corner.rawValue); fit() } }
  @Published var look: String { didSet { store.set("look", look) } }
  @Published var asking: Bool
  /// Sleek opening: its mark coming together (showing), flying to its place on the start page (flying), then gone
  /// (done). The very first time it waits until the question about the bar is answered. Never while checking.
  enum Launch { case waiting, showing, flying, done }
  @Published var launch: Launch = .done
  /// Where the start page's mark sits on the screen, for the launch to land on (nil when a page is showing).
  var brandAt: CGRect?
  let store: Store
  var privateData = WKWebsiteDataStore.nonPersistent()
  /// Whether a tapped link may open in its own app. On unless you switch it off (⋯, Manage).
  var appLinks: Bool { store.settings["apps"] as? Bool ?? true }
  /// Whether the start page shows the row of Sleek's three apps. On unless you switch it off (⋯, Manage).
  var startApps: Bool { store.settings["startApps"] as? Bool ?? true }
  /// Whether your search provider suggests searches as you type (never in a private tab). On unless you switch it off.
  var searchHints: Bool { store.settings["searchHints"] as? Bool ?? true }
  /// How the places you go most look on a new tab (⋯, Appearance): clear glass, colour glass or plain
  /// icons; wide (16 by 9) or square tiles; a grid or a row that scrolls sideways.
  var tileStyle: String { store.settings["tileStyle"] as? String ?? "clear" }
  var tileShape: String { store.settings["tileShape"] as? String ?? "wide" }
  var tileLayout: String { store.settings["tileLayout"] as? String ?? "grid" }
  func choose(_ key: String, _ value: String) { withAnimation(.spring(response: 0.45, dampingFraction: 0.85)) { store.set(key, value); objectWillChange.send() } }
  func setting(_ key: String, _ on: Bool) { withAnimation(.spring(response: 0.4, dampingFraction: 0.85)) { store.set(key, on); objectWillChange.send() } }
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
    launch = Res.proving || Res.args.contains("--still") ? .done : asking ? .waiting : .showing
    Icons.dir = base.appendingPathComponent("icons"); Icons.onNew = { [weak self] in Task { @MainActor in self?.objectWillChange.send() } }
    Blocker.shared.onChange.append { [weak self] in self?.blockerChanged() }
    Blocker.shared.start(dir: base.appendingPathComponent("lists"))
    Work.shared.share(as: "browser", holds: ["tasks", "pages", "decks"], else: base.appendingPathComponent("Work"))      // with the other Sleek apps on this iPhone
    Work.shared.onAdopt = { [weak self] _, id in for t in self?.tabs ?? [] where t.web.url?.scheme == "sleek" && (t.web.url?.query ?? "").contains("d=" + id) { t.web.reload() } }
    Work.shared.onNote = { [weak self] text in self?.say(text) }
    Work.shared.onChange.append { [weak self] in self?.readDay() }
    if !Res.proving { Shared.listen { [weak self] in self?.readGoals() }; readGoals() }      // a goal moved on in Sleek Tasks or a widget
    Vault.shared.onChange.append { [weak self] in self?.objectWillChange.send() }
    Vault.shared.start(dir: base)
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
  func chose(top: Bool) { tap(.medium); withAnimation(.spring(response: 0.5, dampingFraction: 0.82)) { corner = top ? .topTrailing : .bottomTrailing; asking = false }
    if launch == .waiting { DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { [weak self] in self?.launch = .showing } } }     // then Sleek opens, as it will every time
  func fit() { for t in tabs { t.fit(top: barAtTop) } }
  /// A short message over the page, gone in a few seconds.
  func say(_ text: String) { toastN += 1; let n = toastN; withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) { toast = text }; DispatchQueue.main.asyncAfter(deadline: .now() + 3) { [weak self] in if self?.toastN == n { withAnimation(.easeOut(duration: 0.25)) { self?.toast = nil } } } }

  // ---------- tabs ----------
  /// A new tab, on a page or on your day; private when asked, or when opened from a private tab.
  /// A new tab. In the background, it opens behind the page you are on (Open in Background): you stay where you are,
  /// the tab count goes up, and a note says where it went.
  @discardableResult func newTab(_ url: URL? = nil, isPrivate: Bool? = nil, from given: WKWebViewConfiguration? = nil, background: Bool = false) -> PhoneTab {
    let t = PhoneTab(browser: self, isPrivate: isPrivate ?? tab.isPrivate, from: given)
    if background { withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) { tabs.append(t) }; tap(); say(t.isPrivate && !tab.isPrivate ? "Opened in a private tab, behind this one" : "Opened in a tab behind this one") }
    else { tabs.append(t); show(tabs.count - 1) }
    if let u = url { t.go(u) }; saveSession(); return t
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
    t.closing(); if keyAsk?.tab == t.id { keyAsk = nil }
    withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) { tabs.remove(at: i); if tabs.isEmpty { tabs = [PhoneTab(browser: self)] }; at = min(at > i ? at - 1 : at, tabs.count - 1) }
    if !tabs.contains(where: { $0.isPrivate }) { privateData = .nonPersistent() }      // the last private tab is gone: so is everything they kept
    saveSession()
  }
  /// The neighbour of the tab showing, among tabs of its own kind (private or not), for sliding the address sideways.
  func neighbour(_ step: Int) -> Int? {
    let mine = tabs.indices.filter { tabs[$0].isPrivate == tab.isPrivate }; guard let k = mine.firstIndex(of: at) else { return nil }
    let j = k + step; return j >= 0 && j < mine.count ? mine[j] : nil
  }
  func open(_ typed: String) {
    guard let u = destination(for: typed, search: store.search) else { return }
    // Sleek Tasks, Docs or Slides, when that app is on this iPhone: it opens there, with your latest work written for it
    // first. Otherwise the same page opens here, from inside this app, as it always has. ("Open in Apps" in Settings.)
    if appLinks && !Res.proving, let app = Browser.sleekApp(for: u), UIApplication.shared.canOpenURL(app) {
      Task { @MainActor in await Work.shared.keepCopy(now: true); await UIApplication.shared.open(app) }; return
    }
    tab.go(u); setCompact(false)
  }
  /// For one of Sleek's own pages inside this app, the address of the Sleek app that shows it (nil for anything else):
  /// tasks.html#/<board>/… → sleek-tasks://open?board=<board>; doc.html?d=<id> → sleek-docs://open?d=<id>; deck.html?d=<id> → sleek-slides://open?d=<id>.
  static func sleekApp(for u: URL) -> URL? {
    guard u.scheme == "sleek", u.host == "app" else { return nil }
    let d = URLComponents(url: u, resolvingAgainstBaseURL: false)?.queryItems?.first { $0.name == "d" }?.value, ok = { (s: String) in s.range(of: "^[a-z0-9]{4,24}$", options: .regularExpression) != nil }
    func app(_ scheme: String, _ key: String, _ id: String?) -> URL? { var c = URLComponents(); c.scheme = scheme; c.host = "open"; if let id, ok(id) { c.queryItems = [URLQueryItem(name: key, value: id)] }; return c.url }
    switch u.lastPathComponent {
    case "tasks.html": return app("sleek-tasks", "board", (u.fragment ?? "").split(separator: "/").first.map(String.init))
    case "doc.html", "docs.html": return app("sleek-docs", "d", d)
    case "deck.html", "slides.html", "index.html": return app("sleek-slides", "d", d)
    default: return nil
    }
  }
  func pageLoaded(_ t: PhoneTab) { saveSession(); if t.isSleek { Work.shared.refresh() }; if offer?.tab == t.id { offer = nil } }
  /// The tabs to bring back next time (never private ones).
  func saveSession() {
    let keep = tabs.filter { !$0.isPrivate && !$0.atStart }
    store.set("session", keep.compactMap { $0.web.url?.absoluteString }.filter { $0.hasPrefix("http") || $0.hasPrefix("sleek://app/") })
    store.set("sessionAt", keep.firstIndex { $0 === tab } ?? 0)
  }

  /// Leaving the app: everything is written down now, not a moment later.
  func leaving() { saveSession(); store.flush(); keepSitesForWidgets(); Work.shared.leaving(wait: 0.4) }

  // ---------- passwords (the vault is the Mac app's own: Vault.swift) ----------
  var savePasswords: Bool { store.settings["savePasswords"] as? Bool ?? true }
  /// The cursor went into a sign-in box. Offer the names saved for this site; or, where a new password is being chosen, a strong one.
  func signInField(_ t: PhoneTab, site: String, fresh: Bool, on field: String, keysOnly: Bool = false) {
    guard t === current else { return }
    let users = fresh || keysOnly ? [] : Vault.shared.users(for: site).map { SavedName(id: $0["id"] ?? "", user: $0["user"] ?? "") }, strong = fresh && field == "pass" && !t.isPrivate && !keysOnly
    let keys = fresh ? [] : (t.keys.quiet.map { Passkeys.choices($0) } ?? []).map { SavedName(id: $0["id"] ?? "", user: $0["user"] ?? "") }      // passkeys, when the page is waiting quietly for one
    offerN += 1
    if users.isEmpty && keys.isEmpty && !strong { if offer != nil { withAnimation(.easeOut(duration: 0.2)) { offer = nil } }; return }
    if strong, t.suggested == nil { t.suggested = Vault.generate(words: false, length: 20) }
    withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) { offer = SignInOffer(tab: t.id, site: site, users: users, strong: strong ? (t.suggested ?? "") : "", keys: keys); compact = false }
  }

  // ---------- passkeys (Passkeys.swift, shared with the Mac app) ----------
  /// A site asks to make a passkey, or to sign in with one (not quietly). Ask beside the bar.
  func passkeyAsked(_ t: PhoneTab, _ a: KeyAsk) {
    if !a.make && a.conditional { t.web.callAsyncJavaScript("window.__sleekRefocus && window.__sleekRefocus()", arguments: [:], in: nil, in: signInWorld) { _ in }; return }      // offered beside the bar while the cursor is in the sign-in box
    if a.make, Passkeys.hasOne(a) { t.keys.answer(a.ask, nil, fail: KeyFail(name: "InvalidStateError", message: "A passkey for this account is kept already.")); say("Sleek already keeps a passkey for this account"); return }
    let users = a.make ? [] : Passkeys.choices(a).map { SavedName(id: $0["id"] ?? "", user: $0["user"] ?? "") }
    withAnimation(.spring(response: 0.45, dampingFraction: 0.8)) { offer = nil; keepAsk = nil; keyAsk = KeyQuestion(tab: t.id, ask: a.ask, make: a.make, site: a.rp, user: a.user.isEmpty ? a.display : a.user, users: users); compact = false }
  }
  /// Yes (make it, or sign in with the passkey named) once Face ID agrees; or no.
  func answerPasskey(yes: Bool, id key: String? = nil) {
    guard let q = keyAsk else { return }
    withAnimation(.spring(response: 0.4, dampingFraction: 0.85)) { keyAsk = nil }
    guard let t = tabs.first(where: { $0.id == q.tab }), let a = t.keys.open[q.ask] else { return }
    guard yes, a.make || key != nil else { t.keys.answer(q.ask, nil); return }
    tap(.medium)
    Task { @MainActor in
      guard await Vault.shared.unlock(a.make ? "make a passkey for " + a.rp : "sign in to " + a.rp + " with a passkey") else { t.keys.answer(q.ask, nil); return }
      guard t.keys.open[q.ask] != nil else { return }
      if a.make { let r = Passkeys.make(a, page: t.web.url?.absoluteString ?? ""); t.keys.answer(q.ask, r); say(r != nil ? "Passkey saved for " + a.rp : "That passkey could not be kept") }
      else { let r = Passkeys.sign(a, with: key ?? ""); t.keys.answer(q.ask, r); if r == nil { say("That passkey could not be used here") } }
    }
  }
  /// From the offer beside the bar: sign in with this passkey, once Face ID agrees.
  func useQuietPasskey(_ key: String) {
    let t = tab; guard let a = t.keys.quiet else { return }; tap(.medium)
    Task { @MainActor in
      guard await Vault.shared.unlock("sign in to " + a.rp + " with a passkey"), t.keys.open[a.ask] != nil else { return }
      if let r = Passkeys.sign(a, with: key) { t.keys.answer(a.ask, r); withAnimation { offer = nil } } else { say("That passkey could not be used here") }
    }
  }
  /// The cursor left the sign-in boxes: the offer goes, a moment later (so a press on it still lands).
  func signInLeft(_ t: PhoneTab) {
    let n = offerN
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { [weak self] in if let s = self, s.offerN == n, s.offer?.tab == t.id { withAnimation(.easeOut(duration: 0.2)) { s.offer = nil } } }
  }
  /// Fill a saved sign-in, once Face ID (or the passcode) has said yes; or, with no sign-in named, use the strong password offered.
  func fillSignIn(_ login: String?) {
    let t = tab, site = Vault.site(t.web.url?.host); tap(.medium)
    guard let login = login else { if let s = t.suggested { t.fill(user: "", password: s, both: true); say("Sleek keeps it once you have joined") }; withAnimation { offer = nil }; return }
    Task { @MainActor in
      guard await Vault.shared.unlock("fill your password for " + site) else { return }
      // only ever into the site it was saved for
      guard let l = Vault.shared.password(for: login), l.site == Vault.site(t.web.url?.host), t.web.url?.scheme == "https" else { say("That password could not be filled here"); return }
      t.fill(user: l.user, password: l.password, both: false); withAnimation { offer = nil }
    }
  }
  /// A page was sent a name and password. Unless they are kept already, offer to keep them (or keep them at once, when the password is one Sleek made).
  func signedIn(_ t: PhoneTab, site: String, address: String, user: String, password: String) {
    if t.isPrivate || !savePasswords || Vault.shared.never.contains(site) { return }
    let ours = t.suggested == password || Vault.shared.awaited[site] == password
    var replacing: String?
    switch Vault.shared.have(site: site, user: user, password: password) {
    case .same, .unknown: return
    case .changed(let id): replacing = id
    case .new: replacing = nil
    }
    if ours {
      if Vault.shared.save(site: site, url: address, user: user, password: password, replacing: replacing) { say("Your new password for " + site + " is saved") }
      t.suggested = nil; Vault.shared.awaited[site] = nil; return
    }
    pendingLogin = (site, address, user, password, replacing)
    withAnimation(.spring(response: 0.45, dampingFraction: 0.8)) { offer = nil; keepAsk = SignInAsk(site: site, user: user, update: replacing != nil); compact = false }
  }
  /// Keep the sign-in that is waiting ("save"), never ask for this site again ("never"), or leave it.
  func answerSignIn(_ how: String) {
    withAnimation(.spring(response: 0.4, dampingFraction: 0.85)) { keepAsk = nil }
    guard let p = pendingLogin else { return }; pendingLogin = nil
    if how == "save" { tap(.medium); say(Vault.shared.save(site: p.site, url: p.address, user: p.user, password: p.password, replacing: p.replacing) ? (p.replacing == nil ? "Password saved" : "Password updated") : "That could not be saved") }
    else if how == "never" { Vault.shared.neverSave(for: p.site, true); say("Sleek won’t offer to save passwords for " + p.site) }
  }
  /// A stronger password for a saved sign-in: onto the clipboard, the site's change-password page opened, and kept once the site has taken it.
  func useNew(_ password: String, for site: String) {
    Vault.shared.copy(password); Vault.shared.awaited[site] = password
    if let u = URL(string: "https://" + site + "/.well-known/change-password") { newTab(u, isPrivate: false) }
    say("The new password is copied. Sleek keeps it once " + site + " has taken it.")
  }
  func clearHistory() { store.clearHistory(); store.set("hiddenTop", [String]()); store.flush(); objectWillChange.send(); say("History cleared") }
  /// The sites you go to most, for the start screen: one for each site, the most visited first, leaving out
  /// any you took off the list there.
  var topSites: [(host: String, url: String)] {
    let hidden = Set(store.settings["hiddenTop"] as? [String] ?? []); var seen = Set<String>(), out: [(host: String, url: String)] = []
    for h in store.history.sorted(by: { ($0["n"] as? Int ?? 1) > ($1["n"] as? Int ?? 1) }) {
      guard let u = h["u"] as? String, let host = URL(string: u)?.host, !seen.contains(host) else { continue }
      seen.insert(host); if hidden.contains(host) { continue }
      out.append((host, u)); if out.count == 8 { break }
    }
    return out
  }
  /// The four sites you go to most, written down for the Search and Sites widget, each with a copy of its icon and its
  /// colour (only from your ordinary history: private tabs keep none). Written again when it changed, as you leave the app.
  func keepSitesForWidgets() {
    guard !Res.proving, let me = Shared.place("browser") else { return }
    let fm = FileManager.default, icons = me.appendingPathComponent("icons"); try? fm.createDirectory(at: icons, withIntermediateDirectories: true)
    func hex(_ c: Tint.RGB) -> String { String(format: "#%02X%02X%02X", Int(c[0].rounded()), Int(c[1].rounded()), Int(c[2].rounded())) }
    var sites: [[String: Any]] = [], keep = Set<String>()
    for s in topSites.prefix(4) {
      var o: [String: Any] = ["name": SiteName.of(s.host), "url": s.url]
      if let t = Tint.of(s.host) { o["color"] = hex(t.pair(dark: true).1) }
      let k = Icons.key(s.host)
      if let f = Icons.file(s.host), fm.fileExists(atPath: f.path), k.allSatisfy({ $0.isASCII }) {
        let to = icons.appendingPathComponent(k); keep.insert(k)
        let a = (try? fm.attributesOfItem(atPath: f.path))?[.modificationDate] as? Date, b = (try? fm.attributesOfItem(atPath: to.path))?[.modificationDate] as? Date
        if b == nil || (a ?? .distantPast) > b! { try? fm.removeItem(at: to); try? fm.copyItem(at: f, to: to) }
        o["icon"] = k
      }
      sites.append(o)
    }
    for f in (try? fm.contentsOfDirectory(atPath: icons.path)) ?? [] where !keep.contains(f) { try? fm.removeItem(at: icons.appendingPathComponent(f)) }
    let file = me.appendingPathComponent("sites.json")
    if let d = try? JSONSerialization.data(withJSONObject: ["sites": sites], options: [.sortedKeys]), d != (try? Data(contentsOf: file)) { try? d.write(to: file, options: .atomic); WidgetCenter.shared.reloadAllTimelines() }
  }
  /// Take a site off "Where you go most" (press and hold it on the start screen). Your history keeps it, and it is
  /// still offered as you type; it is only left off that list, until you clear your history.
  func hideTop(_ host: String) {
    var h = store.settings["hiddenTop"] as? [String] ?? []; if !h.contains(host) { h.append(host) }
    withAnimation(.spring(response: 0.4, dampingFraction: 0.85)) { store.set("hiddenTop", h); objectWillChange.send() }
    store.flush(); say("Removed from Where you go most")
  }
  /// Take a bookmark away (press and hold it on the start screen).
  func removeMark(_ url: String) { withAnimation(.spring(response: 0.4, dampingFraction: 0.85)) { store.removeBookmark(url: url); objectWillChange.send() }; store.flush(); say("Bookmark removed") }
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
    if !Res.proving { readGoals() }
    func rows(_ k: String) -> [TaskRow] { (d[k] as? [[String: Any]] ?? []).map { TaskRow(id: $0["id"] as? String ?? "", title: $0["title"] as? String ?? "", board: $0["board"] as? String ?? "", color: $0["color"] as? String ?? "#12A36A", due: $0["due"] as? String ?? "", done: $0["done"] as? Bool ?? false, late: $0["late"] as? Bool ?? false) } }
    func items(_ k: String, _ kind: String) -> [WorkItem] { (d[k] as? [[String: Any]] ?? []).map { WorkItem(id: $0["id"] as? String ?? "", title: $0["title"] as? String ?? "", url: $0["url"] as? String ?? "", kind: kind, at: ($0["at"] as? NSNumber)?.doubleValue ?? 0, slides: ($0["slides"] as? NSNumber)?.intValue ?? 0,
                                                                                     peek: $0["peek"] as? String ?? "", kicker: $0["kicker"] as? String ?? "", heading: $0["heading"] as? String ?? "", mode: $0["mode"] as? String ?? "dark", accent: $0["accent"] as? String ?? "#7C5CFF", thumb: $0["thumb"] as? String ?? "") } }
    let boards = (d["boards"] as? [[String: Any]] ?? []).map { Board(id: $0["id"] as? String ?? "", name: $0["name"] as? String ?? "", color: $0["color"] as? String ?? "#12A36A", open: ($0["open"] as? NSNumber)?.intValue ?? 0) }
    func n(_ x: Any?) -> Int { (x as? NSNumber)?.intValue ?? 0 }
    let lists = (d["lists"] as? [[String: Any]] ?? []).map { l in
      ListRow(id: l["id"] as? String ?? "", name: l["name"] as? String ?? "", color: l["color"] as? String ?? "#12A36A", due: l["due"] as? String ?? "", late: l["late"] as? Bool ?? false,
              left: n(l["left"]), got: n(l["got"]), all: n(l["all"]), url: l["url"] as? String ?? "",
              items: (l["items"] as? [[String: Any]] ?? []).map { ThingRow(id: $0["id"] as? String ?? "", title: $0["title"] as? String ?? "", qty: max(1, n($0["qty"])), aisle: $0["aisle"] as? String ?? "", done: $0["done"] as? Bool ?? false) })
    }
    withAnimation(.spring(response: 0.4, dampingFraction: 0.85)) {
      day = Day(late: rows("late"), today: rows("today"), soon: rows("soon"), done: rows("done"), recent: (items("decks", "slides") + items("pages", "docs")).sorted { $0.at > $1.at }.prefix(6).map { $0 }, boards: boards, lists: lists, loaded: true)
    }
  }
  func tick(_ t: TaskRow) { tap(.medium); if t.done { cleared.remove(t.id) }; Work.shared.tick(t.id, !t.done) }
  /// Something on a grocery list, into the basket (or out of it). Shown at once; Tasks catches up a moment later.
  func tick(_ t: ThingRow, on list: ListRow) {
    tap(.medium); if t.done { cleared.remove(t.id) }
    if let li = day.lists.firstIndex(where: { $0.id == list.id }), let ti = day.lists[li].items.firstIndex(where: { $0.id == t.id }) {
      withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) { day.lists[li].items[ti].done = !t.done; day.lists[li].got += t.done ? -1 : 1; day.lists[li].left += t.done ? 1 : -1 }
    }
    Work.shared.tick(t.id, !t.done)
  }
  /// A list's things on the start page, without what you have got and then cleared by pulling the page down.
  func things(_ l: ListRow) -> [ThingRow] { l.items.filter { !($0.done && cleared.contains($0.id)) } }
  /// Tasks you have ticked off and then cleared from the start page by pulling it down. (They stay done in Sleek Tasks.)
  @Published private(set) var cleared: Set<String> = []
  var doneToday: [TaskRow] { day.done.filter { !cleared.contains($0.id) } }
  /// What is due, without what you have ticked off and cleared.
  var dueToday: [TaskRow] { (day.late + day.today).filter { !($0.done && cleared.contains($0.id)) } }
  /// Pull the start page down: your tasks are read again, and what you have ticked off leaves Today.
  func freshenToday() async {
    Work.shared.refresh(); try? await Task.sleep(nanoseconds: 450_000_000)
    let gone = Set((day.done + day.late + day.today).filter(\.done).map(\.id) + day.lists.flatMap(\.items).filter(\.done).map(\.id))
    if !gone.subtracting(cleared).isEmpty { tap(.soft) }
    withAnimation(.spring(response: 0.45, dampingFraction: 0.85)) { cleared = gone }
  }
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
    out.append(Suggestion(kind: "search", title: q, hint: "", url: ""))
    return out
  }
  /// What your search provider would search for, given what you have typed so far: nothing in a private tab, with
  /// suggestions switched off, or while the app checks itself. Asked without cookies, so it is not tied to you.
  func askHints(_ typed: String) async -> [String] {
    let q = typed.trimmingCharacters(in: .whitespaces)
    guard !q.isEmpty, !tab.isPrivate, searchHints, !Res.proving, let u = Search.hints(for: store.search, q) else { return [] }
    var r = URLRequest(url: u, cachePolicy: .returnCacheDataElseLoad, timeoutInterval: 4); r.httpShouldHandleCookies = false
    guard let (data, _) = try? await Browser.hintSession.data(for: r) else { return [] }
    let low = q.lowercased()
    return Array(Search.readHints(data).filter { $0.lowercased() != low }.prefix(5))
  }
  private static let hintSession: URLSession = { let c = URLSessionConfiguration.ephemeral; c.httpCookieStorage = nil; c.urlCache = URLCache(memoryCapacity: 2_000_000, diskCapacity: 0); return URLSession(configuration: c) }()
}

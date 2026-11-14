// One tab: a page of the web (or one of Sleek's own pages), and everything the page can ask of the
// browser: opening a new tab, a download, a file to upload, the camera, an alert.
import AppKit
import WebKit

@MainActor
final class Tab: NSObject, WKNavigationDelegate, WKUIDelegate, WKDownloadDelegate, WKScriptMessageHandler {
  let id = UUID().uuidString
  let web: WKWebView
  weak var owner: BrowserWindow?
  var icon = ""
  var blocking = false                    // whether the block lists are on this tab now (they are off on Sleek's own pages, and on sites you switched them off for)
  var blocked: [String: Int] = [:]        // what was blocked on the page showing: ads, trackers, cookies, notes (notification requests), popups
  var mine = false                        // the load now starting is your own (typed, a bookmark), not one the page started
  private var watching: [NSKeyValueObservation] = []
  private var downloads: [ObjectIdentifier: (id: String, to: URL, watch: NSKeyValueObservation?)] = [:]

  /// The little script every page gets: it tells the browser the page's icon, and when the page is
  /// scrolled back to its top or pulled upward there (which is what calls the bar back in immersive).
  static let pageScript = """
  (function(){ if(window.top !== window) return; var post = function(m){ try { webkit.messageHandlers.sleekPage.postMessage(m); } catch(e){} };
    function icon(){ var l = document.querySelector('link[rel~="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]'); post({ icon: l && l.href ? l.href : (location.protocol.indexOf('http') === 0 ? location.origin + '/favicon.ico' : '') }); }
    document.addEventListener('DOMContentLoaded', icon); window.addEventListener('load', icon); window.addEventListener('pageshow', icon);      // pageshow: a page brought back by Back or Forward
    var last = window.scrollY; window.addEventListener('scroll', function(){ var y = window.scrollY; if(y <= 0 && last > 0) post({ scroll: 'top' }); else if(y > last + 4) post({ scroll: 'down' }); last = y; }, { passive: true, capture: true });
    window.addEventListener('wheel', function(e){ if(e.deltaY < 0 && window.scrollY <= 0) post({ scroll: 'top' }); }, { passive: true });
    // a picture dragged in from outside: if nothing on the page takes it, Sleek does (and asks whether to open it or search for it).
    // Sleek's own apps are left to themselves: they take dropped files in their own ways.
    if(!(location.protocol === 'sleek:' && location.host === 'app')){
      var pic = function(e){ var it = e.dataTransfer && e.dataTransfer.items; if(!it) return false; for(var i = 0; i < it.length; i++) if(it[i].kind === 'file' && /^image\\//.test(it[i].type)) return true; return false; };
      window.addEventListener('dragover', function(e){ if(!e.defaultPrevented && pic(e)){ e.preventDefault(); try { e.dataTransfer.dropEffect = 'copy'; } catch(x){} } });
      window.addEventListener('drop', function(e){ if(!e.defaultPrevented && pic(e)){ e.preventDefault(); post({ drop: 'free' }); } });
    }
    // pull down to refresh: the page says whether a pull here may refresh it. Not when it is scrolled down, when a
    // box inside it is, when the page uses the wheel itself (a map), or when it has said it wants no such thing.
    var pOk = null, pSent = 0, pAt = 0, pT = null, pFree = true, NO = /none|contain/;
    function free(t){ try { var d = document.documentElement, b = document.body;
        if(NO.test(getComputedStyle(d).overscrollBehaviorY) || (b && NO.test(getComputedStyle(b).overscrollBehaviorY))) return false;
        for(var el = t; el && el.nodeType === 1 && el !== b && el !== d; el = el.parentElement){ if(el.scrollHeight > el.clientHeight + 1){ var s = getComputedStyle(el); if(/auto|scroll/.test(s.overflowY) && NO.test(s.overscrollBehaviorY)) return false; } }
      } catch(e){} return true; }
    window.addEventListener('wheel', function(e){
      var now = Date.now(), t = e.target; if(t !== pT || now - pAt > 400){ pT = t; pFree = free(t); } pAt = now;
      setTimeout(function(){      // after the page's own listeners, so we know whether it took the wheel for itself
        var ok = pFree && !e.defaultPrevented && !e.ctrlKey && window.scrollY <= 0, d = document.scrollingElement;
        for(var el = t; ok && el && el.nodeType === 1; el = el.parentElement) if(el !== d && el.scrollTop > 0) ok = false;
        if(ok !== pOk || now - pSent > 80){ pOk = ok; pSent = now; post({ pull: ok }); }
      }, 0);
    }, { passive: true });
  })();
  """

  /// What a page gets on top of that while blocking is on: requests to send notifications are refused
  /// quietly, and the "reject" button of the common cookie-consent tools is pressed for you, once.
  static let shieldScript = """
  (function(){ if(window.top !== window) return; var post = function(m){ try { webkit.messageHandlers.sleekPage.postMessage(m); } catch(e){} };
    try { if(window.Notification){ var N = window.Notification; N.requestPermission = function(cb){ post({ blocked: 'notification' }); if(typeof cb === 'function') try { cb('denied'); } catch(e){} return Promise.resolve('denied'); };
      try { Object.defineProperty(N, 'permission', { get: function(){ return 'denied'; }, configurable: true }); } catch(e){} } } catch(e){}
    var REJECT = ['#onetrust-reject-all-handler', '#CybotCookiebotDialogBodyButtonDecline', '#CybotCookiebotDialogBodyLevelButtonLevelOptinDeclineAll', '#didomi-notice-disagree-button', '.cky-btn-reject', '.cmplz-deny', '.osano-cm-denyAll', '.osano-cm-deny',
      '.iubenda-cs-reject-btn', '.qc-cmp2-summary-buttons button[mode="secondary"]', 'button[data-testid="uc-deny-all-button"]', '.wt-cli-reject-btn', 'button[class*="-cta-do-not-consent"]', '#axeptio_btn_dismiss', '.cc-deny', '#truste-consent-required', '.klaro .cn-decline',
      '#cookiescript_reject', '.cookie-notice-container #cn-refuse-cookie', '#wt-cli-reject-btn', '[data-cookiefirst-action="reject"]', '#cmpbntnotxt', '.cmpboxbtnno', '#hs-eu-decline-button', '.termly-styles-root button[data-tid="banner-decline"]'];
    var tries = 0, done = false;
    function decline(){
      if(done) return; var b = null;
      for(var i = 0; i < REJECT.length && !b; i++){ try { b = document.querySelector(REJECT[i]); } catch(e){} }
      if(!b){ var uc = document.querySelector('#usercentrics-root'); if(uc && uc.shadowRoot) b = uc.shadowRoot.querySelector('[data-testid="uc-deny-all-button"]'); }
      if(b){ done = true; try { b.click(); } catch(e){} post({ blocked: 'cookie' }); return; }
      if(++tries < 20) setTimeout(decline, 500);
    }
    if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', decline); else decline();
  })();
  """

  /// Signing in. This script runs apart from the page's own scripts (they cannot see or change it). It notices the
  /// boxes of a sign-in form, tells the browser when the cursor goes into one (so it can offer a saved name, or a strong
  /// password when signing up) and what name and password the page was sent (so it can offer to keep them), and fills
  /// the boxes when the browser says to. It never asks for, or holds, a saved password itself.
  static let world = WKContentWorld.world(name: "sleek")
  static let signInScript = """
  (function(){ if(window.top !== window) return; var post = function(m){ try { webkit.messageHandlers.sleekPw.postMessage(m); } catch(e){} };
    function vis(e){ var r = e.getBoundingClientRect(), s = getComputedStyle(e); return r.width > 20 && r.height > 8 && s.visibility !== 'hidden' && s.display !== 'none' && !e.disabled && !e.readOnly; }
    function passes(root){ return [].filter.call((root && root.querySelectorAll ? root : document).querySelectorAll('input[type=password]'), vis); }
    function scope(el){ return el.form || (el.closest && el.closest('form, [role=form], [role=dialog], section, main')) || document.body; }
    function userFor(pw){
      var s = scope(pw), named = s.querySelector('input[autocomplete~=username], input[autocomplete~=email], input[type=email], input[name*=user i], input[name*=email i], input[name*=login i], input[id*=user i], input[id*=email i], input[id*=login i]');
      if(named && named.type !== 'password' && vis(named)) return named;
      var best = null; [].forEach.call(s.querySelectorAll('input'), function(i){ if(/^(text|email|tel|)$/.test(i.type) && vis(i) && (i.compareDocumentPosition(pw) & Node.DOCUMENT_POSITION_FOLLOWING)) best = i; });
      return best;
    }
    function fresh(pw){ return /new-password/.test(pw.getAttribute('autocomplete') || '') || passes(scope(pw)).length >= 2; }
    function rect(e){ var r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }
    var cur = null, last = '';
    document.addEventListener('focusin', function(e){
      var t = e.target; if(!t || t.tagName !== 'INPUT') return;
      var pw = null; if(t.type === 'password') pw = t; else { var ps = passes(scope(t)); if(ps.length && userFor(ps[0]) === t) pw = ps[0]; }
      if(!pw) return;
      cur = { user: userFor(pw), pass: pw, all: passes(scope(pw)) };
      post({ focus: rect(t), on: t === pw ? 'pass' : 'user', fresh: fresh(pw) });
    }, true);
    document.addEventListener('focusout', function(e){ if(cur && (e.target === cur.pass || e.target === cur.user)) setTimeout(function(){ var a = document.activeElement; if(!cur || (a !== cur.pass && a !== cur.user)) post({ blur: 1 }); }, 200); }, true);
    window.addEventListener('scroll', function(){ if(cur) post({ blur: 1 }); }, { passive: true, capture: true });
    function set(el, v){ if(!el) return; var d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value'); d.set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }
    window.__sleekFill = function(user, pass, both){
      if(!cur || !cur.pass.isConnected){ var ps = passes(); if(!ps.length) return false; cur = { user: userFor(ps[0]), pass: ps[0], all: passes(scope(ps[0])) }; }
      if(user && cur.user) set(cur.user, user);
      (both ? cur.all : [cur.pass]).forEach(function(p){ set(p, pass); });
      return true;
    };
    // what the page was sent when you signed in or signed up: once for each name and password
    function sent(from){
      var ps = passes(from).filter(function(p){ return p.value; }); if(!ps.length) return;
      var pw = ps[0], u = userFor(pw), k = (u ? u.value : '') + ' / ' + pw.value; if(k === last) return; last = k;
      post({ sent: { user: u ? u.value : '', pass: pw.value } });
    }
    document.addEventListener('submit', function(e){ sent(e.target); }, true);
    document.addEventListener('click', function(e){ var b = e.target.closest && e.target.closest('button, input[type=submit], [role=button]'); if(b && passes(scope(b)).length) sent(scope(b)); }, true);
    document.addEventListener('keydown', function(e){ if(e.key === 'Enter' && e.target && e.target.tagName === 'INPUT') sent(scope(e.target)); }, true);
  })();
  """

  static func configuration(store: WKWebsiteDataStore) -> WKWebViewConfiguration {
    let c = WKWebViewConfiguration()
    c.websiteDataStore = store
    c.setURLSchemeHandler(OwnPages(), forURLScheme: "sleek")
    c.applicationNameForUserAgent = "Version/26.0 Safari/605.1.15"      // sites treat Sleek as they treat Safari, whose engine it is
    c.preferences.isElementFullscreenEnabled = true
    c.preferences.javaScriptCanOpenWindowsAutomatically = false        // a page opens a new tab only when you pressed something
    return c
  }

  init(configuration: WKWebViewConfiguration, owner: BrowserWindow) {
    let view = PageView(frame: .zero, configuration: configuration); web = view
    self.owner = owner
    super.init()
    view.onDrop = { [weak self] pb in if let s = self, let dir = s.owner?.store.dir.appendingPathComponent("dropped"), let image = DroppedImage.from(pb, keepIn: dir) { s.drop = (image, Date()) } }
    configuration.userContentController.add(Weak(self), name: "sleekPage")
    configuration.userContentController.add(Weak(self), contentWorld: Tab.world, name: "sleekPw")
    applyBlocking(false)
    web.navigationDelegate = self; web.uiDelegate = self
    web.allowsBackForwardNavigationGestures = true
    web.allowsMagnification = true
    let tell: (WKWebView, Any) -> Void = { [weak self] _, _ in Task { @MainActor in self?.owner?.tabChanged(self); self?.refreshed() } }
    watching = [web.observe(\.title, changeHandler: tell), web.observe(\.url, changeHandler: tell), web.observe(\.isLoading, changeHandler: tell),
                web.observe(\.estimatedProgress, changeHandler: tell), web.observe(\.canGoBack, changeHandler: tell), web.observe(\.canGoForward, changeHandler: tell)]
  }
  func close() {
    watching = []; let c = web.configuration.userContentController
    c.removeScriptMessageHandler(forName: "sleekPage"); c.removeScriptMessageHandler(forName: "sleekPw", contentWorld: Tab.world)
    web.stopLoading(); web.removeFromSuperview()
  }

  /// Put the block lists and the shield's script on this tab, or take them off. The next page it loads is under the new rule.
  func applyBlocking(_ on: Bool) {
    let c = web.configuration.userContentController
    c.removeAllContentRuleLists(); c.removeAllUserScripts()
    c.addUserScript(WKUserScript(source: Tab.pageScript, injectionTime: .atDocumentStart, forMainFrameOnly: true))
    c.addUserScript(WKUserScript(source: Tab.signInScript, injectionTime: .atDocumentEnd, forMainFrameOnly: true, in: Tab.world))
    if on { Blocker.shared.lists.values.forEach { c.add($0) }; c.addUserScript(WKUserScript(source: Tab.shieldScript, injectionTime: .atDocumentStart, forMainFrameOnly: true)) }
    blocking = on
  }
  /// The engine says a rule from one of the lists stopped a request. (This is a part of the engine Apple doesn't
  /// promise to keep; without it everything is still blocked, and only the counts on the shield stay at nothing.)
  @objc(_webView:contentRuleListWithIdentifier:performedAction:forURL:)
  func rule(_ webView: WKWebView, list identifier: String, did action: NSObject, for url: URL) {
    guard action.responds(to: Selector(("blockedLoad"))), (action.value(forKey: "blockedLoad") as? Bool) == true else { return }
    blocked[identifier.contains("-ads-") ? "ads" : identifier.contains("-privacy-") ? "trackers" : "cookies", default: 0] += 1; owner?.tabChanged(self)
  }

  // ---------- pull down to refresh ----------
  // Two fingers pulling down on a page that is at its top: an arrow comes down from the top of the page, and
  // letting go once it has come far enough loads the page again. Only on the web, only with a trackpad or a
  // mouse you stroke (a wheel has no "letting go"), and only where the page says a pull is free (its script, above).
  static let pullAt = 120.0                // how far a pull has to go, in points
  private var pulling = false, pull = 0.0, sideways = 0.0
  private(set) var refreshing = false, pageSays: Bool?      // pageSays: what the page said of this stroke; nothing yet, a pull is free here, or it is not
  private var refreshedAt = Date.distantPast
  /// How far the arrow has come, 0 to a little over 1 (1 is far enough).
  var pulled: Double { pulling && pageSays == true ? min(1.4, pull / Tab.pullAt) : 0 }
  func wheel(_ e: NSEvent) { if e.hasPreciseScrollingDeltas, e.momentumPhase == [] { wheel(phase: e.phase, dx: e.scrollingDeltaX, dy: e.scrollingDeltaY) } }
  func wheel(phase: NSEvent.Phase, dx: Double, dy: Double) {
    if phase.contains(.began) || phase.contains(.mayBegin) { pulling = !refreshing && ["http", "https"].contains(web.url?.scheme ?? ""); pull = 0; sideways = 0; pageSays = nil }
    guard pulling else { return }
    if phase.contains(.ended) {
      let go = pulled >= 1; pulling = false
      if go { refreshing = true; refreshedAt = Date(); mine = true; web.reload(); DispatchQueue.main.asyncAfter(deadline: .now() + 1) { [weak self] in self?.refreshed() } }
      owner?.pullChanged(self)
    } else if phase.contains(.cancelled) { stopPull() }
    else if phase.contains(.began) || phase.contains(.changed) {
      sideways += abs(dx); pull = max(0, pull + dy)
      if sideways > 12 && sideways > pull { stopPull() } else { owner?.pullChanged(self) }      // going sideways is Back and Forward, not this
    }
  }
  private func stopPull() { if pulling { pulling = false; owner?.pullChanged(self) } }
  /// The page has loaded again (or given up): the arrow has turned for at least a moment, and goes.
  private func refreshed() {
    guard refreshing, !web.isLoading else { return }
    DispatchQueue.main.asyncAfter(deadline: .now() + max(0, 0.6 - Date().timeIntervalSince(refreshedAt))) { [weak self] in
      guard let s = self, s.refreshing, !s.web.isLoading else { return }; s.refreshing = false; s.owner?.pullChanged(s) }
  }

  var address: String { web.url?.absoluteString ?? "" }
  /// What kind of page this is: the start page, one of Sleek's apps, or the web.
  var kind: String {
    guard let u = web.url, u.scheme == "sleek" else { return "web" }
    if u.host == "ui" { return u.lastPathComponent == "passwords.html" ? "passwords" : "start" }
    let f = u.lastPathComponent
    return f.hasPrefix("slides") || f.hasPrefix("deck") ? "slides" : f.hasPrefix("doc") ? "docs" : f.hasPrefix("tasks") ? "tasks" : "sleek"
  }
  var state: [String: Any] {
    let k = kind, t = web.title ?? ""
    return ["id": id, "url": address, "kind": k, "title": t.isEmpty ? (k == "start" ? "New tab" : web.url?.host ?? "New tab") : t, "loading": web.isLoading, "progress": web.estimatedProgress,
            "back": web.canGoBack, "fwd": web.canGoForward, "icon": icon, "zoom": Int((web.pageZoom * 100).rounded()), "blockOn": blocking, "blocked": blocked, "host": web.url?.host ?? ""]
  }
  func go(_ url: URL) { icon = ""; mine = true; if url.isFileURL { web.loadFileURL(url, allowingReadAccessTo: url) } else { web.load(URLRequest(url: url)) } }
  func go(_ request: URLRequest) { icon = ""; mine = true; web.load(request) }
  /// A picture just dropped on this page. If the page takes it, nothing more happens; if the engine sets off to show the bare picture, Sleek asks instead.
  var drop: (image: DroppedImage, at: Date)?

  // ---------- what the page tells the browser ----------
  func userContentController(_ c: WKUserContentController, didReceive message: WKScriptMessage) {
    guard message.frameInfo.isMainFrame, let m = message.body as? [String: Any] else { return }
    if message.name == "sleekPw" { signIn(m); return }
    if let i = m["icon"] as? String, i != icon { icon = i; owner?.tabChanged(self); if owner?.isPrivate == false, let h = web.url?.host { Icons.keep(host: h, from: i) } }
    if let s = m["scroll"] as? String { owner?.pageScrolled(self, s) }
    if m["drop"] != nil, let d = drop, Date().timeIntervalSince(d.at) < 3 { drop = nil; owner?.imageDropped(d.image) }      // a dropped picture nothing on the page took
    if let ok = m["pull"] as? Bool, pulling { if ok { if pageSays == nil { pageSays = true; owner?.pullChanged(self) } } else { pageSays = false; stopPull() } }
    if let b = m["blocked"] as? String { blocked[b == "notification" ? "notes" : "cookies", default: 0] += 1; owner?.tabChanged(self) }
    // Sleek's own start page asks for what to show, and says where to go
    if let from = message.frameInfo.request.url, from.scheme == "sleek", from.host == "ui" {
      if m["want"] as? String == "start" { owner?.fillStart(self) }; if let text = m["go"] as? String { owner?.navigate(text, in: self) }
      // the Passwords page (and only it) asks about the vault
      if from.path == "/passwords.html", let what = m["vault"] as? String { owner?.passwordsPage(self, what, m) }
      // your day, on a new tab: tick a task, add one for today
      if owner?.isPrivate == false { if let id = m["tick"] as? String { Work.shared.tick(id, m["on"] as? Bool ?? true) }; if let title = m["addTask"] as? String { owner?.addTask(title: title, board: m["board"] as? String ?? "", due: "today") } }
    }
  }

  // ---------- signing in ----------
  /// A password Sleek made for this page (signing up). Once the page sends it, it is kept without asking.
  var suggested: String?
  private func signIn(_ m: [String: Any]) {
    guard let u = web.url, u.scheme == "https", let host = u.host else { return }      // never over a connection others can read
    let site = Vault.site(host)
    if let f = m["focus"] as? [String: Any] { owner?.signInField(self, site: site, rect: f, fresh: m["fresh"] as? Bool ?? false, on: m["on"] as? String ?? "pass") }
    if m["blur"] != nil { owner?.signInLeft(self) }
    if let s = m["sent"] as? [String: Any], let pass = s["pass"] as? String, !pass.isEmpty { owner?.signedIn(self, site: site, address: u.absoluteString, user: s["user"] as? String ?? "", password: pass) }
  }
  /// Put a name and password into the page's sign-in boxes (both password boxes, when signing up).
  func fill(user: String, password: String, both: Bool) {
    web.callAsyncJavaScript("return window.__sleekFill ? window.__sleekFill(user, pass, both) : false", arguments: ["user": user, "pass": password, "both": both], in: nil, in: Tab.world) { _ in }
  }

  // ---------- going places ----------
  func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, preferences: WKWebpagePreferences, decisionHandler: @escaping (WKNavigationActionPolicy, WKWebpagePreferences) -> Void) {
    if action.shouldPerformDownload { decisionHandler(.download, preferences); return }
    if let u = action.request.url, let s = u.scheme, !["http", "https", "sleek", "about", "blob", "data", "file"].contains(s) {      // mailto:, tel: and the like belong to other apps
      NSWorkspace.shared.open(u); decisionHandler(.cancel, preferences); return
    }
    // ⌘-click opens the link in a new tab behind this one
    if action.navigationType == .linkActivated, action.modifierFlags.contains(.command), let u = action.request.url { owner?.newTab(u, select: false); decisionHandler(.cancel, preferences); return }
    if action.targetFrame?.isMainFrame == true, let u = action.request.url {
      // a picture dropped on a page that had no use for it: ask what to do with it, rather than replace the page with the bare picture
      if let d = drop, !mine, Date().timeIntervalSince(d.at) < 2 { drop = nil; owner?.imageDropped(d.image); decisionHandler(.cancel, preferences); return }
      // a page that sends you off to a site that only ever serves pop-up adverts: no
      if blocking, !mine, action.navigationType == .other, Blocker.shared.isPopupHost(u.host) { blocked["popups", default: 0] += 1; owner?.tabChanged(self); decisionHandler(.cancel, preferences); return }
      let want = owner?.blockingWanted(for: u) ?? false
      if want != blocking { applyBlocking(want) }
    }
    decisionHandler(.allow, preferences)
  }
  func webView(_ webView: WKWebView, decidePolicyFor response: WKNavigationResponse, decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
    decisionHandler(response.canShowMIMEType ? .allow : .download)
  }
  func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) { icon = ""; blocked = [:]; mine = false; owner?.tabChanged(self) }      // a new page: the old one's icon goes, and the page says its own
  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { owner?.visited(self) }
  func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { failed(error) }
  func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { failed(error) }
  private func failed(_ error: Error) {
    let e = error as NSError
    if e.code == NSURLErrorCancelled || (e.domain == "WebKitErrorDomain" && e.code == 102) { owner?.tabChanged(self); return }      // you went elsewhere, or it became a download
    let at = (e.userInfo[NSURLErrorFailingURLErrorKey] as? URL) ?? web.url
    let esc = { (s: String) in s.replacingOccurrences(of: "&", with: "&amp;").replacingOccurrences(of: "<", with: "&lt;") }
    let page = "<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width'><title>Can’t open this page</title><style>:root{color-scheme:light dark}body{font:16px/1.5 -apple-system,system-ui,sans-serif;max-width:520px;margin:18vh auto;padding:0 20px}h1{font-size:28px;letter-spacing:-.02em;margin:0 0 8px}p{color:#777;margin:0 0 6px}code{font-size:13px}</style><h1>Sleek can’t open this page</h1><p>\(esc(e.localizedDescription))</p><p><code>\(esc(at?.absoluteString ?? ""))</code></p>"
    web.loadSimulatedRequest(URLRequest(url: at ?? URL(string: "about:blank")!), responseHTML: page)
  }
  func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) { download.delegate = self }
  func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) { download.delegate = self }

  // ---------- downloads: into the Downloads folder, never over a file that is already there ----------
  func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String, completionHandler: @escaping (URL?) -> Void) {
    let folder = Downloads.folder
    var to = folder.appendingPathComponent(suggestedFilename), n = 2
    let base = to.deletingPathExtension().lastPathComponent, ext = to.pathExtension
    while FileManager.default.fileExists(atPath: to.path) { to = folder.appendingPathComponent(base + " \(n)" + (ext.isEmpty ? "" : "." + ext)); n += 1 }
    let did = Downloads.shared.begin(name: to.lastPathComponent, path: to.path, total: response.expectedContentLength)
    let watch = download.progress.observe(\.fractionCompleted) { p, _ in let f = p.fractionCompleted; Task { @MainActor in Downloads.shared.progress(did, f) } }
    downloads[ObjectIdentifier(download)] = (did, to, watch)
    completionHandler(to)
  }
  func downloadDidFinish(_ download: WKDownload) { if let d = downloads.removeValue(forKey: ObjectIdentifier(download)) { Downloads.shared.finish(d.id, ok: true) } }
  func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) { if let d = downloads.removeValue(forKey: ObjectIdentifier(download)) { Downloads.shared.finish(d.id, ok: false) } }

  // ---------- what a page may ask for ----------
  func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
    guard let owner = owner else { return nil }
    if blocking, Blocker.shared.isPopupHost(action.request.url?.host) { blocked["popups", default: 0] += 1; owner.tabChanged(self); return nil }      // a pop-up advert
    return owner.newTab(configuration: configuration).web      // a link that opens a new window opens a new tab
  }
  func webViewDidClose(_ webView: WKWebView) { owner?.closeTab(id) }
  private func sheet(_ text: String, info: String = "", buttons: [String], field: String? = nil, then: @escaping (Int, String?) -> Void) {
    let a = NSAlert(); a.messageText = text; a.informativeText = info; buttons.forEach { a.addButton(withTitle: $0) }
    var input: NSTextField?
    if let f = field { let t = NSTextField(frame: NSRect(x: 0, y: 0, width: 280, height: 24)); t.stringValue = f; a.accessoryView = t; input = t }
    guard let w = web.window else { then(1, nil); return }
    a.beginSheetModal(for: w) { r in then(r == .alertFirstButtonReturn ? 0 : 1, input?.stringValue) }
  }
  private var host: String { web.url?.host ?? "This page" }
  func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) { sheet(host + " says", info: message, buttons: ["OK"]) { _, _ in completionHandler() } }
  func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) { sheet(host + " asks", info: message, buttons: ["OK", "Cancel"]) { i, _ in completionHandler(i == 0) } }
  func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (String?) -> Void) { sheet(host + " asks", info: prompt, buttons: ["OK", "Cancel"], field: defaultText ?? "") { i, s in completionHandler(i == 0 ? s : nil) } }
  func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) {
    let p = NSOpenPanel(); p.allowsMultipleSelection = parameters.allowsMultipleSelection; p.canChooseDirectories = parameters.allowsDirectories
    guard let w = web.window else { completionHandler(nil); return }
    p.beginSheetModal(for: w) { r in completionHandler(r == .OK ? p.urls : nil) }
  }
  func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin, initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType, decisionHandler: @escaping (WKPermissionDecision) -> Void) {
    let what = type == .camera ? "your camera" : type == .microphone ? "your microphone" : "your camera and microphone"
    sheet("Let \(origin.host) use \(what)?", info: "It can use it until you close this tab.", buttons: ["Don’t allow", "Allow"]) { i, _ in decisionHandler(i == 1 ? .grant : .deny) }
  }
}

/// Lets a page's messages reach a tab without the page keeping the tab alive.
final class Weak: NSObject, WKScriptMessageHandler {
  weak var to: WKScriptMessageHandler?
  init(_ to: WKScriptMessageHandler) { self.to = to }
  func userContentController(_ c: WKUserContentController, didReceive message: WKScriptMessage) { to?.userContentController(c, didReceive: message) }
}

/// Every download, in every window.
@MainActor
final class Downloads {
  static let shared = Downloads()
  static var folder = FileManager.default.urls(for: .downloadsDirectory, in: .userDomainMask).first ?? FileManager.default.temporaryDirectory
  var list: [[String: Any]] = []
  var onChange: [() -> Void] = []
  func begin(name: String, path: String, total: Int64) -> String { let id = UUID().uuidString; list.insert(["id": id, "name": name, "path": path, "part": 0.0, "done": false, "failed": false], at: 0); tell(); return id }
  func progress(_ id: String, _ f: Double) { if let i = list.firstIndex(where: { ($0["id"] as? String) == id }) { list[i]["part"] = f; tell() } }
  func finish(_ id: String, ok: Bool) { if let i = list.firstIndex(where: { ($0["id"] as? String) == id }) { list[i]["done"] = ok; list[i]["failed"] = !ok; list[i]["part"] = ok ? 1.0 : list[i]["part"]; tell() } }
  func reveal(_ id: String) { if let d = list.first(where: { ($0["id"] as? String) == id }), let p = d["path"] as? String { NSWorkspace.shared.activateFileViewerSelecting([URL(fileURLWithPath: p)]) } }
  private func tell() { onChange.forEach { $0() } }
}

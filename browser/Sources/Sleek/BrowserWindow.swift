// One browser window.
//
// The window is three layers. At the back, bare window you can drag. Over it, the pages: one web view
// for each tab that is showing (one, or the two, three or four of a split view). On top, covering
// the whole window, the bar: a see-through page of its own (Resources/chrome) that draws the tabs,
// the address box, the bookmarks, the menus, the ring round the page you are in, and anything that
// floats over a page. It tells this window where the pages go (the "slots"), and which parts of
// itself are solid; a press anywhere else falls through to the page underneath.
//
// This file owns what is open (tabs, which are showing, which one you are in) and does what the bar
// asks. The bar owns only how things look.
import AppKit
import WebKit

/// The bar's web view: presses go to it only where it has something there.
final class ChromeView: WKWebView {
  var slots: [NSRect] = [], solid: [NSRect] = [], drag: [NSRect] = [], modal = false
  private func fallsThrough(_ p: NSPoint) -> Bool {
    if modal { return false }
    if solid.contains(where: { $0.contains(p) }) { return false }
    return slots.contains(where: { $0.contains(p) }) || drag.contains(where: { $0.contains(p) })
  }
  private func own(_ pointInWindow: NSPoint) -> NSPoint { let p = convert(pointInWindow, from: nil); return isFlipped ? p : NSPoint(x: p.x, y: bounds.height - p.y) }
  override func hitTest(_ point: NSPoint) -> NSView? {
    guard let w = window, let sup = superview else { return super.hitTest(point) }
    _ = w; return fallsThrough(own(sup.convert(point, to: nil))) ? nil : super.hitTest(point)
  }
  override func mouseMoved(with event: NSEvent) { if !fallsThrough(own(event.locationInWindow)) { super.mouseMoved(with: event) } }
  /// Which page a point of the window is over (0, 1, 2, 3), or nil where the bar has something of its own.
  func page(at pointInWindow: NSPoint) -> Int? { let p = own(pointInWindow); return fallsThrough(p) ? slots.firstIndex { $0.contains(p) } : nil }
  // a picture dropped on the bar itself (the tabs, the address row): Sleek asks what to do with it
  var onImage: ((DroppedImage) -> Void)?, imagesIn: URL?
  private func image(_ s: NSDraggingInfo) -> DroppedImage? { imagesIn.flatMap { DroppedImage.from(s.draggingPasteboard, keepIn: $0) } }
  private func hasImage(_ s: NSDraggingInfo) -> Bool {
    let pb = s.draggingPasteboard, urls = (pb.readObjects(forClasses: [NSURL.self], options: nil) as? [URL]) ?? []
    return urls.contains { DroppedImage.isImage($0) } || (urls.isEmpty && pb.availableType(from: [.png, .tiff]) != nil)
  }
  override func draggingEntered(_ sender: NSDraggingInfo) -> NSDragOperation { hasImage(sender) ? .copy : [] }
  override func draggingUpdated(_ sender: NSDraggingInfo) -> NSDragOperation { hasImage(sender) ? .copy : [] }
  override func draggingExited(_ sender: NSDraggingInfo?) {}
  override func prepareForDragOperation(_ sender: NSDraggingInfo) -> Bool { hasImage(sender) }
  override func performDragOperation(_ sender: NSDraggingInfo) -> Bool { guard let i = image(sender) else { return false }; onImage?(i); return true }
  override func concludeDragOperation(_ sender: NSDraggingInfo?) {}
}
/// Holds the pages; a press that misses every page goes on to the bare window behind.
final class PagesView: FlippedView { override func hitTest(_ point: NSPoint) -> NSView? { let v = super.hitTest(point); return v === self ? nil : v } }

@MainActor
final class BrowserWindow: NSObject, NSWindowDelegate, WKScriptMessageHandler, WKNavigationDelegate {
  let window: NSWindow
  let chrome: ChromeView
  let pages = PagesView()
  let store: Store
  let isPrivate: Bool
  let dataStore: WKWebsiteDataStore
  var tabs: [Tab] = []
  var panes: [String] = []      // the tabs showing, by id: one, or up to four in a split view
  var at = 0                    // which of them you are in
  var n = 1
  var onClose: ((BrowserWindow) -> Void)?
  private var ready = false, pushQueued = false, monitor: Any?, nearEdge = false, lightsShown = true
  private var findText = ""

  init(store: Store, isPrivate: Bool = false) {
    self.store = store; self.isPrivate = isPrivate
    dataStore = isPrivate || Res.selfTest != nil ? .nonPersistent() : .default()
    window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1280, height: 860), styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView], backing: .buffered, defer: false)
    let c = WKWebViewConfiguration(); c.websiteDataStore = .nonPersistent(); c.setURLSchemeHandler(OwnPages(), forURLScheme: "sleek")
    chrome = ChromeView(frame: .zero, configuration: c)
    super.init()
    window.titlebarAppearsTransparent = true; window.titleVisibility = .hidden; window.isReleasedWhenClosed = false
    window.minSize = NSSize(width: 520, height: 360); window.delegate = self; window.acceptsMouseMovedEvents = true
    window.setFrameAutosaveName(isPrivate ? "SleekPrivate" : "SleekMain"); if window.frame.origin == .zero { window.center() }
    let content = FlippedView(frame: window.contentLayoutRect); content.autoresizingMask = [.width, .height]; window.contentView = content
    let drag = DragView(frame: content.bounds); drag.autoresizingMask = [.width, .height]; content.addSubview(drag)
    pages.frame = content.bounds; pages.autoresizingMask = [.width, .height]; content.addSubview(pages)
    chrome.frame = content.bounds; chrome.autoresizingMask = [.width, .height]; chrome.setValue(false, forKey: "drawsBackground"); chrome.unregisterDraggedTypes()
    c.userContentController.add(Weak(self), name: "sleek"); chrome.navigationDelegate = self; content.addSubview(chrome)
    chrome.load(URLRequest(url: URL(string: "sleek://ui/chrome.html")!))
    applyLook()
    // reaching for the edge the bar lives on calls it back when it is hidden (immersive)
    // Two fingers moving over a page are watched for a pull down to refresh, and a press on a page closes
    // whatever hangs from the bar (suggestions, a menu). The page still gets both.
    monitor = NSEvent.addLocalMonitorForEvents(matching: [.leftMouseDown, .rightMouseDown, .scrollWheel]) { [weak self] e in
      guard let s = self, e.window === s.window else { return e }
      if e.type == .scrollWheel { s.wheel(e) } else if s.chrome.page(at: e.locationInWindow) != nil { s.tell(["type": "away"]) }
      return e
    }
    chrome.onImage = { [weak self] image in self?.imageDropped(image) }
    chrome.imagesIn = store.dir.appendingPathComponent("dropped")
    chrome.registerForDraggedTypes([.fileURL, .URL, .png, .tiff])
  }

  // ---------- the window's own buttons ----------
  // The red, yellow and green buttons sit where the bar says: in the tab row, which in immersive is inside the
  // floating bar, so they come and go with it. (The Mac lays them out afresh whenever the window changes, so
  // this is done again each time it does.)
  private var lightsAt: NSPoint?, lightsHome: (height: CGFloat, origins: [NSPoint])?
  private var lights: [NSButton] { [.closeButton, .miniaturizeButton, .zoomButton].compactMap { window.standardWindowButton($0) } }
  func placeLights() {
    let b = lights; guard b.count == 3, let strip = b[0].superview?.superview, !window.styleMask.contains(.fullScreen) else { return }
    if lightsHome == nil { lightsHome = (strip.frame.height, b.map { $0.frame.origin }) }
    guard let home = lightsHome else { return }
    let step = home.origins[1].x - home.origins[0].x, h = b[0].frame.height
    let tall = lightsAt.map { h + 2 * $0.y } ?? home.height
    var f = strip.frame; f.size.height = tall; f.origin.y = window.frame.height - tall; strip.frame = f
    for (i, button) in b.enumerated() { button.setFrameOrigin(lightsAt.map { NSPoint(x: $0.x + CGFloat(i) * step, y: (tall - h) / 2) } ?? home.origins[i]) }
  }
  private func showLights(_ show: Bool) {
    if show == lightsShown { return }; lightsShown = show
    let b = lights; if show { b.forEach { $0.isHidden = false } }
    NSAnimationContext.runAnimationGroup({ c in c.duration = Res.selfTest != nil ? 0 : 0.3; b.forEach { $0.animator().alphaValue = show ? 1 : 0 } }, completionHandler: { [weak self] in if self?.lightsShown == false { b.forEach { $0.isHidden = true } } })
  }
  func windowDidResize(_ notification: Notification) { placeLights() }
  func windowDidBecomeKey(_ notification: Notification) { placeLights() }
  func windowDidResignKey(_ notification: Notification) { placeLights() }

  // ---------- a picture dragged in ----------
  private var dropped: DroppedImage?
  /// Ask what to do with a picture that was dropped on the bar, on a new tab, or on a page with no use for it.
  func imageDropped(_ image: DroppedImage) { dropped = image; tell(["type": "image", "name": image.name, "thumb": image.thumb]) }
  private func imageChosen(_ how: String) {
    guard let d = dropped else { return }; dropped = nil
    if how == "open", let u = d.file ?? d.url { newTab(u) }
    else if how == "search", let r = d.search { let t = Tab(configuration: Tab.configuration(store: dataStore), owner: self); tabs.append(t); t.go(r); select(t.id) }
  }

  // ---------- pull down to refresh ----------
  private weak var pullTab: Tab?
  /// A stroke of the trackpad belongs to the page it began over, until the fingers lift.
  private func wheel(_ e: NSEvent) {
    if e.phase.contains(.began) || e.phase.contains(.mayBegin) { pullTab = chrome.page(at: e.locationInWindow).flatMap { $0 < panes.count ? tab(panes[$0]) : nil } }
    pullTab?.wheel(e)
  }
  /// Tell the bar how far the arrow has come over a page, or that the page is loading again.
  func pullChanged(_ t: Tab) { tell(["type": "pull", "id": t.id, "by": t.pulled, "going": t.refreshing]) }

  // ---------- tabs ----------
  var current: Tab? { tabs.first { $0.id == (at < panes.count ? panes[at] : "") } ?? tabs.first }
  private func tab(_ id: String) -> Tab? { tabs.first { $0.id == id } }
  static let start = URL(string: "sleek://ui/start.html")!
  @discardableResult func newTab(_ url: URL? = nil, select: Bool = true) -> Tab {
    let t = Tab(configuration: Tab.configuration(store: dataStore), owner: self); tabs.append(t)
    t.go(url ?? BrowserWindow.start); if select { self.select(t.id) } else { push() }
    return t
  }
  /// A tab a page asked for (a link that opens a new window): it must use the settings the page hands over.
  func newTab(configuration: WKWebViewConfiguration) -> Tab {
    configuration.userContentController = WKUserContentController()      // its own, not the one of the page that asked
    let t = Tab(configuration: configuration, owner: self); tabs.append(t); select(t.id); return t
  }
  func select(_ id: String) {
    guard tab(id) != nil else { return }
    if panes.isEmpty { panes = [id]; at = 0 }
    else if let j = panes.firstIndex(of: id), j != at { panes.swapAt(j, at) }      // already showing in another space: the two swap
    else { panes[at] = id }
    arrange(); push(); if !chromeHasFocus { focusPage() }
  }
  func closeTab(_ id: String) {
    guard let i = tabs.firstIndex(where: { $0.id == id }) else { return }
    let t = tabs.remove(at: i); t.close()
    if tabs.isEmpty { if windowsWanted { newTab(); return } else { window.close(); return } }
    for (k, p) in panes.enumerated() where p == id {
      let free = tabs.filter { !panes.contains($0.id) }
      if let pick = (i < tabs.count && !panes.contains(tabs[i].id) ? tabs[i] : free.last) { panes[k] = pick.id } else { let fresh = newTab(select: false); panes[k] = fresh.id }
    }
    arrange(); push()
  }
  private var windowsWanted: Bool { true }      // the last tab closing leaves a fresh one, not an empty window
  func setSplit(_ count: Int) {
    n = max(1, min(4, count)); panes = Array(panes.prefix(n))
    while panes.count < n { if let free = tabs.first(where: { !panes.contains($0.id) }) { panes.append(free.id) } else { panes.append(newTab(select: false).id) } }
    at = min(at, n - 1); arrange(); push()
  }
  // ---------- blocking ----------
  private var blockOff: [String] { store.settings["blockOff"] as? [String] ?? [] }
  /// Blocking is on for the web, once the lists are ready, except on sites you switched it off for.
  func blockingWanted(for url: URL) -> Bool { guard Blocker.shared.ready, let s = url.scheme, s == "http" || s == "https", let h = url.host else { return false }; return !blockOff.contains(h) }
  /// The lists became ready, or newer ones arrived: tabs showing the web take them on from their next page.
  func blockerChanged() { for t in tabs { if let u = t.web.url, blockingWanted(for: u) || t.blocking { t.applyBlocking(blockingWanted(for: u)) } }; push() }
  func navigate(_ text: String, in t: Tab? = nil) { if let u = destination(for: text, search: store.search), let tab = t ?? current { tab.go(u); focusPage() } }

  // ---------- where the pages sit ----------
  // A page that changes place (a split view opening or closing, the bar moving) glides to its new place; a page
  // that comes into view (another tab, a new space in a split) fades in. Dragging the window's edge moves pages at once.
  private var arrangedFor = NSSize.zero
  private func arrange() {
    let resized = window.frame.size != arrangedFor; arrangedFor = window.frame.size
    let still = Res.selfTest != nil || resized || NSWorkspace.shared.accessibilityDisplayShouldReduceMotion
    for t in tabs {
      guard let k = panes.firstIndex(of: t.id), k < chrome.slots.count else { t.web.isHidden = true; continue }
      let to = chrome.slots[k], fresh = t.web.superview !== pages || t.web.isHidden
      if t.web.superview !== pages { pages.addSubview(t.web) }
      if still || fresh || t.web.frame.isEmpty || to.isEmpty { t.web.frame = to }
      else if t.web.frame != to { NSAnimationContext.runAnimationGroup { c in c.duration = 0.32; c.timingFunction = CAMediaTimingFunction(controlPoints: 0.2, 0.8, 0.2, 1); c.allowsImplicitAnimation = true; t.web.animator().frame = to } }
      if fresh { t.web.isHidden = false; if !still { t.web.alphaValue = 0; NSAnimationContext.runAnimationGroup { c in c.duration = 0.2; t.web.animator().alphaValue = 1 } } }
    }
  }
  private func rects(_ any: Any?) -> [NSRect] { ((any as? [[String: Any]]) ?? []).map { NSRect(x: $0["x"] as? Double ?? 0, y: $0["y"] as? Double ?? 0, width: $0["w"] as? Double ?? 0, height: $0["h"] as? Double ?? 0) } }
  private var chromeHasFocus: Bool { window.firstResponder === chrome || ((window.firstResponder as? NSView)?.isDescendant(of: chrome) ?? false) }
  func focusPage() { if let w = current?.web { window.makeFirstResponder(w) } }
  func focusAddress() { window.makeFirstResponder(chrome); tell(["type": "focus-url"]) }

  // ---------- telling the bar what is so ----------
  func tell(_ message: [String: Any]) { if ready { chrome.evaluateJavaScript("window.Sleek && Sleek.on(" + json(message) + ")") } }
  func push() {
    if pushQueued { return }; pushQueued = true
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.03) { [weak self] in guard let s = self else { return }; s.pushQueued = false
      s.window.title = s.current?.web.title ?? "Sleek"
      s.tell(["type": "state", "tabs": s.tabs.map { $0.state }, "panes": s.panes, "at": s.at, "n": s.n, "settings": s.store.settings, "bookmarks": s.store.bookmarks, "private": s.isPrivate, "downloads": Downloads.shared.list, "blocker": Blocker.shared.summary]) }
  }
  func tabChanged(_ t: Tab?) { push() }
  func visited(_ t: Tab) { if !isPrivate, t.kind == "web" { store.visit(url: t.address, title: t.web.title ?? "") }; push() }
  func pageScrolled(_ t: Tab, _ how: String) { if t === current { tell(["type": "scroll", "how": how]) } }
  /// The start page asks what to show: your bookmarks, and the places you go most.
  func fillStart(_ t: Tab) {
    let top = isPrivate ? [] : Array(store.history.sorted { ($0["n"] as? Int ?? 1) > ($1["n"] as? Int ?? 1) }.prefix(8))
    t.web.evaluateJavaScript("window.Start && Start.fill(" + json(["bookmarks": store.bookmarks, "top": top, "private": isPrivate, "still": Res.selfTest != nil]) + ")")
  }
  /// A site's icon was just kept: new tabs that are showing fill in again, so it appears.
  func iconsChanged() { for t in tabs where t.kind == "start" { fillStart(t) }; push() }
  private func applyLook() {
    let look = store.settings["look"] as? String ?? "auto"
    window.appearance = isPrivate || look == "dark" ? NSAppearance(named: .darkAqua) : look == "light" ? NSAppearance(named: .aqua) : nil
  }
  func settingsChanged() { applyLook(); push() }

  // ---------- what the bar asks for ----------
  func userContentController(_ c: WKUserContentController, didReceive message: WKScriptMessage) {
    guard let m = message.body as? [String: Any], let what = m["do"] as? String else { return }
    let id = m["id"] as? String ?? ""
    switch what {
    case "ready": ready = true; if tabs.isEmpty { newTab() }; push()
    case "layout":
      chrome.slots = rects(m["slots"]); chrome.solid = rects(m["solid"]); chrome.drag = rects(m["drag"]); chrome.modal = m["modal"] as? Bool ?? false
      let p = (m["lightsAt"] as? [Any])?.compactMap { ($0 as? NSNumber)?.doubleValue }
      lightsAt = p?.count == 2 ? NSPoint(x: p![0], y: p![1]) : nil; placeLights()
      showLights(m["lights"] as? Bool ?? true)
      arrange()
    case "go": navigate(m["text"] as? String ?? "")
    case "open": if let u = URL(string: m["url"] as? String ?? "") { if m["new"] as? Bool == true { newTab(u) } else { current?.go(u); focusPage() } }
    case "newTab": newTab(); focusAddress()
    case "close": closeTab(id)
    case "select": select(id)
    case "back": current?.web.goBack()
    case "fwd": current?.web.goForward()
    case "reload": current?.web.reload()
    case "stop": current?.web.stopLoading()
    case "split": setSplit(m["n"] as? Int ?? 1)
    case "pane": if let i = m["i"] as? Int, i < panes.count { at = i; push(); focusPage() }
    case "unpane": if let i = m["i"] as? Int, i < panes.count, n > 1 { panes.remove(at: i); n -= 1; at = min(at > i ? at - 1 : at, n - 1); arrange(); push() }
    case "set": if let k = m["k"] as? String, let v = m["v"] { store.set(k, v) }
    case "mark":
      let url = m["url"] as? String ?? current?.address ?? ""
      switch m["how"] as? String ?? "" { case "add": store.addBookmark(title: m["title"] as? String ?? current?.web.title ?? "", url: url); case "remove": store.removeBookmark(url: url); default: store.renameBookmark(url: url, title: m["title"] as? String ?? "") }
    case "shield":      // the switch on the shield: blocking on or off for the site you are on; the page loads again under the new rule
      guard let t = current, let h = t.web.url?.host else { return }
      var off = blockOff.filter { $0 != h }; if m["on"] as? Bool == false { off.append(h) }
      store.set("blockOff", off); t.mine = true; t.web.reload()
    case "suggest":      // places you know (bookmarks, history) first, then well-known sites; and how to finish the address being typed
      let q = m["q"] as? String ?? ""
      var items = isPrivate ? store.suggest(q).filter { ($0["kind"] as? String) == "bookmark" } : store.suggest(q)
      let have = Set(items.compactMap { ($0["url"] as? String).flatMap { URL(string: $0)?.host }.map(Icons.key) })
      items += Sites.matching(q, limit: 8).filter { !have.contains(Icons.key(URL(string: $0["url"] as? String ?? "")?.host ?? "")) }.prefix(max(2, 6 - items.count))
      tell(["type": "suggest", "q": q, "items": items, "fill": store.finish(q, known: !isPrivate)])
    case "image": imageChosen(m["how"] as? String ?? "")
    case "corner":      // immersive: which corner the bar's tile rests in (left or right; top or bottom)
      store.settings["immSide"] = m["side"] as? String == "right" ? "right" : "left"; store.set("barAt", m["at"] as? String == "bottom" ? "bottom" : "top")
    case "history": tell(["type": "history", "items": Array(store.history.prefix(60))])
    case "clearHistory": store.clearHistory(); tell(["type": "history", "items": []])
    case "find":
      findText = m["text"] as? String ?? ""; if findText.isEmpty { return }
      let cfg = WKFindConfiguration(); cfg.backwards = m["back"] as? Bool ?? false; cfg.wraps = true
      current?.web.find(findText, configuration: cfg) { [weak self] r in self?.tell(["type": "find", "found": r.matchFound]) }
    case "zoom": zoom(m["by"] as? Int ?? 0)
    case "print": printPage()
    case "private": App.shared.newWindow(isPrivate: true)
    case "window": App.shared.newWindow(isPrivate: false)
    case "default": App.shared.makeDefault()
    case "reveal": Downloads.shared.reveal(id)
    case "focusPage": focusPage()
    default: break
    }
  }
  func zoom(_ by: Int) { guard let w = current?.web else { return }; w.pageZoom = by == 0 ? 1 : max(0.5, min(3, ((w.pageZoom + Double(by) * 0.1) * 10).rounded() / 10)); push(); tell(["type": "toast", "text": "\(Int((w.pageZoom * 100).rounded()))%"]) }
  func printPage() { guard let w = current?.web else { return }; let op = w.printOperation(with: NSPrintInfo.shared); op.view?.frame = w.bounds; op.runModal(for: window, delegate: nil, didRun: nil, contextInfo: nil) }
  func show(_ what: String) { tell(["type": "show", "what": what]) }      // the menu bar asking the bar to open something of its own

  // ---------- the window ----------
  func windowWillClose(_ notification: Notification) { if let m = monitor { NSEvent.removeMonitor(m) }; tabs.forEach { $0.close() }; tabs = []; onClose?(self) }
  func windowDidEnterFullScreen(_ notification: Notification) { tell(["type": "full", "on": true]) }
  func windowDidExitFullScreen(_ notification: Notification) { tell(["type": "full", "on": false]) }
  var session: [String] { tabs.map { $0.address }.filter { $0.hasPrefix("http") || $0.hasPrefix("sleek://app/") } }
}

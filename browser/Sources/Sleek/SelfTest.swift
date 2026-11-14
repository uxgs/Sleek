// Sleek checking itself: `Sleek --selftest <folder>` opens a window with nothing saved, presses its
// own bar the way a person would, visits real pages, and prints one line for each thing checked.
// It also writes pictures of the window into the folder: the pages, with the bar drawn over them.
// (It can run with the screen locked; nothing on screen is needed.)
import AppKit
import WebKit

@MainActor
enum SelfTest {
  static var failures = 0
  static func check(_ name: String, _ ok: Bool, _ got: Any? = nil) { print((ok ? "  ok   " : "  FAIL ") + name + (ok || got == nil ? "" : "  got " + String(describing: got!))); if !ok { failures += 1 }; fflush(stdout) }
  static func nap(_ s: Double) async { try? await Task.sleep(nanoseconds: UInt64(s * 1e9)) }
  static func bar(_ w: BrowserWindow, _ js: String) async -> Any? { try? await w.chrome.callAsyncJavaScript(js, arguments: [:], in: nil, contentWorld: .page) }
  static func see(_ w: BrowserWindow) async -> [String: Any] { (await bar(w, "return Sleek.test.see()")) as? [String: Any] ?? [:] }
  static func press(_ w: BrowserWindow, _ sel: String) async { _ = await bar(w, "return Sleek.test.click(" + json([sel]).dropFirst().dropLast() + ")"); await nap(0.35) }
  static func page(_ t: Tab?, _ js: String) async -> Any? { guard let t = t else { return nil }; return try? await t.web.callAsyncJavaScript(js, arguments: [:], in: nil, contentWorld: .page) }
  /// Wait until something is true, for up to `seconds`.
  static func until(_ seconds: Double = 12, _ test: () async -> Bool) async -> Bool { let end = Date().addingTimeInterval(seconds); while Date() < end { if await test() { return true }; await nap(0.2) }; return await test() }
  static func loaded(_ w: BrowserWindow, _ part: String) async -> Bool { await until(20) { (w.current?.address ?? "").contains(part) && !(w.current?.web.isLoading ?? true) } }

  /// A picture of the window: each page where it sits, and the bar over them.
  static func shot(_ w: BrowserWindow, _ name: String, to out: URL) async {
    let size = w.chrome.bounds.size, img = NSImage(size: size)
    func snap(_ v: WKWebView) async -> NSImage? { await withCheckedContinuation { c in v.takeSnapshot(with: WKSnapshotConfiguration()) { i, _ in c.resume(returning: i) } } }
    var parts: [(NSImage, NSRect)] = []
    for t in w.tabs where !t.web.isHidden { if let i = await snap(t.web) { parts.append((i, t.web.frame)) } }
    let top = await snap(w.chrome)
    img.lockFocusFlipped(true)
    NSColor.white.setFill(); NSRect(origin: .zero, size: size).fill()
    for (i, r) in parts { i.draw(in: r, from: .zero, operation: .sourceOver, fraction: 1, respectFlipped: true, hints: nil) }
    top?.draw(in: NSRect(origin: .zero, size: size), from: .zero, operation: .sourceOver, fraction: 1, respectFlipped: true, hints: nil)
    img.unlockFocus()
    if let tiff = img.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff), let jpg = rep.representation(using: .jpeg, properties: [.compressionFactor: 0.82]) { try? jpg.write(to: out.appendingPathComponent(name + ".jpg")) }
  }

  static func run(_ w: BrowserWindow, out: URL) {
    try? FileManager.default.createDirectory(at: out, withIntermediateDirectories: true)
    Task { @MainActor in
      await scenario(w, out)
      print(failures == 0 ? "\nall passed" : "\n\(failures) FAILED"); fflush(stdout)
      exit(failures == 0 ? 0 : 1)
    }
  }

  static func scenario(_ w: BrowserWindow, _ out: URL) async {
    w.window.setContentSize(NSSize(width: 1280, height: 860))
    let up = await until(10) { (await bar(w, "return !!(window.Sleek && Sleek.test)")) as? Bool == true && !w.tabs.isEmpty && !w.chrome.slots.isEmpty }
    check("the window opens with its bar and one tab", up, ["tabs": w.tabs.count, "slots": w.chrome.slots.count])
    _ = await bar(w, "return Sleek.test.still()")
    var s = await see(w)
    let noBar = (await bar(w, "return !document.querySelector('.bbar')")) as? Bool == true
    check("the bookmarks bar starts hidden", noBar && (w.store.settings["bar"] as? Bool) == false)
    w.store.set("bar", true); await nap(0.4)      // shown for the rest of these checks
    /// Where the window's red button is, from the window's top-left corner.
    func redButton() -> [Int] { guard let b = w.window.standardWindowButton(.closeButton) else { return [] }; let r = b.convert(b.bounds, to: nil); return [Int(r.minX.rounded()), Int((w.window.frame.height - r.maxY).rounded())] }
    /// A real press of the mouse at a point of the window (measured from its top-left), sent the way the Mac sends one.
    func mouse(_ x: CGFloat, _ y: CGFloat) async {
      for kind in [NSEvent.EventType.leftMouseDown, .leftMouseUp] {
        if let e = NSEvent.mouseEvent(with: kind, location: NSPoint(x: x, y: w.window.frame.height - y), modifierFlags: [], timestamp: ProcessInfo.processInfo.systemUptime, windowNumber: w.window.windowNumber, context: nil, eventNumber: 0, clickCount: 1, pressure: 1) { NSApp.sendEvent(e) }
      }
      await nap(0.35)
    }
    check("the window's red, yellow and green buttons sit in the tab row", redButton() == [13, 12], redButton())

    print("the start page")
    _ = await until(8) { (await page(w.current, "return !!window.Start && document.querySelectorAll('.apps a.site').length")) as? Int == 3 }
    s = await see(w)
    check("a new tab opens on the start page, with an empty address box", w.current?.kind == "start" && (s["url"] as? String) == "" && (s["on"] as? String) == "New tab", s)
    check("the page sits under the bar, filling the rest of the window", w.chrome.slots.count == 1 && abs(w.chrome.slots[0].minY - CGFloat(s["barBottom"] as? Int ?? -1)) <= 1 && abs(w.chrome.slots[0].maxY - 860) <= 1 && w.current?.web.frame == w.chrome.slots[0], w.chrome.slots)
    await shot(w, "1-start", to: out)

    print("where a press lands")
    func under(_ x: CGFloat, _ y: CGFloat) -> String {      // what is under a point of the window, measured from its top-left
      guard let c = w.window.contentView, let v = c.hitTest(c.superview?.convert(NSPoint(x: x, y: y), from: c) ?? NSPoint(x: x, y: y)) else { return "nothing" }
      return v === w.chrome || v.isDescendant(of: w.chrome) ? "bar" : v is DragView ? "window" : (v as? WKWebView) != nil || v.isDescendant(of: w.pages) ? "page" : String(describing: type(of: v))
    }
    let tabX = ((await bar(w, "var r = document.querySelector('.tab').getBoundingClientRect(); return r.left + 30")) as? Double).map { CGFloat($0) } ?? 200
    let places = [under(640, 500), under(tabX, 22), under(1100, 14), under(400, 62), under(640, 96)]
    check("a press on the page goes to the page; on a tab, the address row or the bookmarks, to the bar; on the bare part of the tab row, it drags the window", places == ["page", "bar", "window", "bar", "bar"], places)
    await press(w, "#b-menu"); await nap(0.2)
    let overPage = (await bar(w, "var r = document.querySelector('#pop').getBoundingClientRect(); return [r.left + 20, r.bottom - 20]")) as? [Double] ?? [0, 0]
    check("an open menu takes presses even where it hangs over the page", overPage[1] > 130 && under(CGFloat(overPage[0]), CGFloat(overPage[1])) == "bar" && under(300, 600) == "page", overPage)
    _ = await bar(w, "document.getElementById('win').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return 1"); await nap(0.3)
    check("and gives the page back when it closes", under(CGFloat(overPage[0]), CGFloat(overPage[1])) == "page")

    print("going somewhere")
    _ = await bar(w, "Sleek.test.type('example.com'); return Sleek.test.enter()")
    var ok = await loaded(w, "example.com")
    s = await see(w)
    check("typing an address and pressing Enter goes there", ok && w.current?.address == "https://example.com/" && (s["url"] as? String) == "example.com", [w.current?.address ?? "", s["url"] ?? ""])
    check("the tab takes the page's title", (s["on"] as? String) == "Example Domain", s["on"])
    _ = await bar(w, "Sleek.test.type('what is a web browser'); return Sleek.test.enter()")
    ok = await loaded(w, "duckduckgo.com")
    check("typing words searches the web", ok && (w.current?.address ?? "").contains("q=what"), w.current?.address)
    w.current?.web.goBack(); ok = await loaded(w, "example.com")
    s = await see(w); let canForward = w.current?.web.canGoForward ?? false
    check("Back goes back, and Forward is then possible", ok && canForward, w.current?.address)
    check("history keeps what was visited", w.store.history.contains { ($0["u"] as? String) == "https://example.com/" }, w.store.history.count)

    print("tabs")
    await press(w, ".plus"); _ = await until(5) { w.tabs.count == 2 && w.current?.kind == "start" }
    _ = await bar(w, "Sleek.test.type('https://en.wikipedia.org/wiki/Web_browser'); return Sleek.test.enter()")
    ok = await loaded(w, "wikipedia.org"); _ = await until(5) { ((await see(w))["on"] as? String ?? "").contains("Wikipedia") }
    s = await see(w)
    check("＋ opens a second tab, which loads its own page", ok && w.tabs.count == 2 && (s["tabs"] as? [String])?.count == 2 && ((s["on"] as? String) ?? "").contains("Web browser"), s["tabs"])
    await shot(w, "2-two-tabs", to: out)
    _ = await bar(w, "document.querySelectorAll('.tab')[0].click(); return 1"); await nap(0.4)
    check("pressing the first tab shows the first page again", w.current?.address == "https://example.com/" && w.tabs.filter { !$0.web.isHidden }.count == 1, w.current?.address)
    _ = await bar(w, "Sleek.test.type('wiki'); return 1"); await nap(0.6)
    s = await see(w)
    check("typing suggests the other open tab, pages from history, and a search", (s["rows"] as? [String] ?? []).contains { $0.hasPrefix("tab:") } && (s["rows"] as? [String] ?? []).contains { $0.hasPrefix("history:") } && (s["rows"] as? [String] ?? []).last?.hasPrefix("search:") == true, s["rows"])
    check("and finishes the address for you, with the offered ending selected, and suggests the well-known site", (s["url"] as? String) == "wikipedia.org" && (s["fill"] as? String) == "pedia.org" && (s["sel"] as? [Int]) == [4, 13] && (s["rows"] as? [String] ?? []).contains("site:Wikipedia"), [s["url"] ?? "", s["fill"] ?? "", s["sel"] ?? "", s["rows"] ?? ""])
    await shot(w, "3-suggestions", to: out)
    _ = await bar(w, "var u = document.getElementById('url'); u.value = 'wik'; u.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' })); return 1"); await nap(0.5); s = await see(w)
    check("deleting does not bring the ending back", (s["url"] as? String) == "wik" && (s["fill"] as? String) == "", [s["url"] ?? "", s["fill"] ?? ""])
    await mouse(640, 600); s = await see(w)
    let noRows = (await bar(w, "return !document.getElementById('sugg')")) as? Bool == true
    check("a press on the page closes the suggestions", noRows && (s["url"] as? String) != "wik", [noRows, s["url"] ?? ""])
    await press(w, "#b-menu"); await mouse(300, 600); s = await see(w)
    check("and an open menu", s["pop"] is NSNull || s["pop"] == nil, s["pop"])
    _ = await bar(w, "Sleek.test.type('wiki'); return 1"); await nap(0.5)
    _ = await bar(w, "document.getElementById('url').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return 1"); await nap(0.3)

    print("bookmarks")
    await press(w, ".star"); s = await see(w)
    check("the star bookmarks the page and puts it on the bar", (s["star"] as? Bool) == true && (s["marks"] as? [String]) == ["Example Domain"] && w.store.bookmarks.count == 1 && (s["pop"] as? String) == "star", s)
    _ = await bar(w, "var n = document.getElementById('bmname'); n.value = 'Example'; return Sleek.test.click('[data-do=closepop]')"); await nap(0.4)
    s = await see(w); check("it can be renamed", (s["marks"] as? [String]) == ["Example"], s["marks"])
    _ = await bar(w, "document.querySelectorAll('.tab')[1].click(); return 1"); await nap(0.4)
    await press(w, ".bbar .bm[data-bm]"); ok = await until(8) { w.current?.address == "https://example.com/" }
    check("pressing a bookmark opens it in the tab you are in", ok, w.current?.address)
    w.current?.web.goBack(); _ = await loaded(w, "wikipedia.org")

    print("split view")
    await press(w, "#b-split"); _ = await bar(w, "return Sleek.test.click('[data-lay=\"2\"]')"); _ = await until(5) { w.chrome.slots.count == 2 }
    s = await see(w)
    let two = w.chrome.slots
    check("side by side shows two pages, half the window each", two.count == 2 && abs(two[0].width - two[1].width) <= 2 && w.tabs.filter { !$0.web.isHidden }.count == 2 && (s["ring"] as? Int) == 1, two)
    await shot(w, "4-split-two", to: out)
    await press(w, "#b-split"); _ = await bar(w, "return Sleek.test.click('[data-lay=\"4\"]')"); _ = await until(6) { w.chrome.slots.count == 4 && w.tabs.count == 4 }
    check("four corners shows four, two by two, opening new tabs to fill it", w.chrome.slots.count == 4 && Set(w.chrome.slots.map { Int($0.minX) }).count == 2 && Set(w.chrome.slots.map { Int($0.minY) }).count == 2 && w.tabs.count == 4, w.chrome.slots)
    await shot(w, "5-split-four", to: out)
    await press(w, "#b-split"); _ = await bar(w, "return Sleek.test.click('[data-lay=\"1\"]')"); _ = await until(5) { w.chrome.slots.count == 1 }
    check("One page goes back to one", w.chrome.slots.count == 1 && w.n == 1)

    print("where the bar sits")
    w.store.set("barAt", "bottom"); await nap(0.6); s = await see(w)
    check("at the bottom the page is on top and the whole bar under it", (s["barBottom"] as? Int) == 860 && w.chrome.slots.first.map { abs($0.minY - 28) <= 1 && abs($0.maxY - CGFloat(s["barTop"] as? Int ?? 0)) <= 1 } == true, [s["barTop"] ?? "", w.chrome.slots])
    await shot(w, "6-bar-at-bottom", to: out)
    w.store.set("barAt", "top"); w.store.set("imm", true); await nap(0.7); s = await see(w)
    check("immersive: the page takes the whole window and the bar floats over it", (s["floating"] as? Bool) == true && w.chrome.slots.first == NSRect(x: 0, y: 0, width: 1280, height: 860) && ((s["cls"] as? String) ?? "").contains("show"), [s["cls"] ?? "", w.chrome.slots])
    let inCard = (await bar(w, "var b = document.getElementById('bar'); return [b.offsetLeft, b.offsetTop, b.offsetWidth, b.offsetHeight]")) as? [Int] ?? []
    check("and the window's buttons are inside the floating bar, at its top left", inCard == [10, 10, 1260, 88] && redButton() == [24, 23], [inCard, redButton()])
    await shot(w, "7-immersive", to: out)
    _ = await bar(w, "await new Promise(function(ok){ setTimeout(ok, 3300); }); return 1"); s = await see(w)
    let hidden = !((s["cls"] as? String) ?? "").contains("show"), lightsGone = w.window.standardWindowButton(.closeButton)?.isHidden == true
    w.pageScrolled(w.current!, "top"); await nap(0.3); s = await see(w)
    let stillAway = !((s["cls"] as? String) ?? "").contains("show")
    let tile = (await bar(w, "var b = document.getElementById('bar'), i = b.querySelector('.isle'); return [b.offsetLeft, b.offsetTop, b.offsetWidth, b.offsetHeight, +getComputedStyle(i).opacity]")) as? [Int] ?? []
    check("after a moment it draws itself in to a small tile with Sleek's mark, taking the window's buttons with it, and scrolling does not bring it back", hidden && lightsGone && stillAway && tile == [10, 10, 46, 38, 1], [hidden, lightsGone, stillAway, tile])
    await shot(w, "7b-immersive-drawn-in", to: out)
    _ = await bar(w, "document.querySelector('.peek').dispatchEvent(new MouseEvent('mousemove', { bubbles: true })); return 1"); await nap(0.3); s = await see(w)
    check("resting the pointer on its handle does", ((s["cls"] as? String) ?? "").contains("show") && w.window.standardWindowButton(.closeButton)?.isHidden == false, s["cls"])
    // the tile's corner: chosen in Look (dragging the tile ends in the same message)
    func barBox() async -> [Int] { (await bar(w, "var b = document.getElementById('bar'); return [b.offsetLeft, b.offsetTop, b.offsetWidth, b.offsetHeight]")) as? [Int] ?? [] }
    _ = await bar(w, "document.getElementById('b-look').click(); return 1"); await nap(0.3); await press(w, "[data-corner='right bottom']"); await nap(0.4)
    let openLow = await barBox()
    _ = await bar(w, "document.getElementById('win').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return 1")
    _ = await bar(w, "await new Promise(function(ok){ setTimeout(ok, 3400); }); return 1"); let tileLow = await barBox()
    check("the tile can rest in another corner, and the bar opens out from there", openLow == [10, 762, 1260, 88] && tileLow == [1224, 812, 46, 38] && (w.store.settings["immSide"] as? String) == "right" && (w.store.settings["barAt"] as? String) == "bottom", [openLow, tileLow])
    await shot(w, "7c-immersive-other-corner", to: out)
    _ = await bar(w, "document.querySelector('.peek').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: 1240, clientY: 830 })); window.dispatchEvent(new MouseEvent('mousemove', { clientX: 300, clientY: 200 })); window.dispatchEvent(new MouseEvent('mouseup', { clientX: 60, clientY: 40 })); return 1"); await nap(0.6)
    let tileBack = await barBox()
    check("dragging the tile to a corner leaves it there", tileBack == [10, 10, 46, 38] && (w.store.settings["immSide"] as? String) == "left" && (w.store.settings["barAt"] as? String) == "top", tileBack)
    w.store.set("imm", false); await nap(0.5)
    check("out of immersive, the buttons are back in the tab row", redButton() == [13, 12], redButton())

    print("themes")
    w.store.set("look", "dark"); w.store.set("theme", "ocean"); await nap(0.6); s = await see(w)
    check("dark and a theme change the bar, and the window goes dark for the pages too", (s["mode"] as? String) == "dark" && w.window.appearance?.name == .darkAqua, s["mode"])
    await shot(w, "8-dark-ocean", to: out)
    w.store.set("look", "light"); w.store.set("theme", "graphite"); await nap(0.4)

    print("find, zoom, the menu")
    w.show("find"); await nap(0.3)
    _ = await bar(w, "var f = document.getElementById('find'); f.value = 'browser'; f.dispatchEvent(new Event('input', { bubbles: true })); return 1"); await nap(0.8); s = await see(w)
    check("Find finds a word that is on the page", (s["find"] as? Bool) == true && (s["miss"] as? Bool) == false, s)
    _ = await bar(w, "var f = document.getElementById('find'); f.value = 'zzqxjv'; f.dispatchEvent(new Event('input', { bubbles: true })); return 1"); await nap(0.8); s = await see(w)
    check("and says so when a word is not", (s["miss"] as? Bool) == true, s["miss"])
    await press(w, "[data-do=findclose]")
    w.zoom(1); await nap(0.3); check("Zoom makes the page larger", abs((w.current?.web.pageZoom ?? 1) - 1.1) < 0.01, w.current?.web.pageZoom); w.zoom(0)
    await press(w, "#b-menu"); s = await see(w)
    check("the ⋯ menu opens", (s["pop"] as? String) == "menu", s["pop"])
    await shot(w, "9-menu", to: out)
    _ = await bar(w, "return Sleek.test.click('[data-menu=history]')"); await nap(0.6)
    let hist = (await bar(w, "return document.querySelectorAll('#pop [data-hist]').length")) as? Int ?? 0
    check("History lists the pages visited", hist >= 2, hist)
    _ = await bar(w, "document.getElementById('win').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return 1"); await nap(0.3)

    print("a download")
    Downloads.folder = FileManager.default.temporaryDirectory.appendingPathComponent("sleek-selftest-downloads-\(ProcessInfo.processInfo.processIdentifier)")
    try? FileManager.default.createDirectory(at: Downloads.folder, withIntermediateDirectories: true)
    w.current?.web.loadHTMLString("<!doctype html><title>A file</title><a id=a download='hello.txt' href='data:text/plain;charset=utf-8,Hello%20from%20Sleek'>hello.txt</a>", baseURL: URL(string: "https://example.com/files"))
    await nap(1.0); _ = await page(w.current, "document.getElementById('a').click(); return 1")
    ok = await until(8) { Downloads.shared.list.first?["done"] as? Bool == true }
    let got = (try? String(contentsOf: Downloads.folder.appendingPathComponent("hello.txt"), encoding: .utf8)) ?? ""
    s = await see(w)
    check("a download lands in the Downloads folder, and the bar says so", ok && got == "Hello from Sleek" && ((s["toast"] as? String) ?? "").contains("hello.txt"), [got, s["toast"] ?? ""])
    try? FileManager.default.removeItem(at: Downloads.folder)

    print("blocking")
    let listsReady = await until(90) { Blocker.shared.ready }
    check("the block lists are ready: adverts, trackers and cookie banners, with their rules", listsReady && (Blocker.shared.summary["rules"] as? Int ?? 0) > 100_000 && !Blocker.shared.popupHosts.isEmpty, Blocker.shared.facts.mapValues { [$0["rules"] ?? 0, $0["left"] ?? 0, $0["dropped"] ?? 0] })
    let good = "{\"trigger\":{\"url-filter\":\"^https?://ads\\\\.example[/:]\"},\"action\":{\"type\":\"block\"}}", bad = "{\"trigger\":{\"url-filter\":\"(a|b)\"},\"action\":{\"type\":\"block\"}}"
    let kept = await Blocker.shared.soundCount([good, good, bad, good, bad, good, good])
    check("a rule the engine refuses is found and left out, and the rest are kept", kept.kept == 5 && kept.dropped == 2, [kept.kept, kept.dropped])
    let lines = ListConverter.convert("||ads.example^\n@@||ok.example^$script\n##.promo\nsite.example##.box\n||pop.example^$popup\n/track.js$third-party,script\n||x.example^$csp=default-src\n", frames: true)
    check("list lines become the engine's rules: block, except, hide, pop-up sites; what it can't say is left out", lines.rules.count == 5 && lines.exceptions.count == 1 && lines.popupHosts == ["pop.example"] && lines.left == 1, [lines.rules.count, lines.exceptions.count, Array(lines.popupHosts), lines.left])
    let extras = """
    <!doctype html><title>A page with the usual extras</title><h1>News</h1><div class="ad-slot" id="ad">ADVERTISEMENT</div><p id="words">The article itself.</p>
    <button id="onetrust-reject-all-handler" onclick="window.__declined = true">Reject all</button>
    <script>window.__r = {};
    function probe(name, url){ return new Promise(function(ok){ var s = document.createElement('script'); s.src = url; s.onload = function(){ window.__r[name] = 'loaded'; ok(); }; s.onerror = function(){ window.__r[name] = 'blocked'; ok(); }; document.head.appendChild(s); setTimeout(function(){ if(!window.__r[name]){ window.__r[name] = 'timeout'; ok(); } }, 9000); }); }
    window.__done = Promise.all([probe('tagmanager', 'https://www.googletagmanager.com/gtag/js?id=G-PROOF00000'), probe('analytics', 'https://www.google-analytics.com/analytics.js'), probe('doubleclick', 'https://securepubads.g.doubleclick.net/tag/js/gpt.js'), probe('ordinary', 'https://cdnjs.cloudflare.com/ajax/libs/lodash.js/4.17.21/lodash.min.js')]);
    </script>
    """
    let look = "await window.__done; await new Promise(function(ok){ setTimeout(ok, 900); }); var note = window.Notification ? await Notification.requestPermission() : 'none'; return { requests: window.__r, adShown: getComputedStyle(document.getElementById('ad')).display !== 'none', wordsShown: getComputedStyle(document.getElementById('words')).display !== 'none', declined: !!window.__declined, note: note }"
    var visit = 0      // each load of the test page has its own address, so the check waits for the new page and not the one before it
    func loadExtras() async { visit += 1; let mark = "?visit=\(visit)"; w.current?.web.loadSimulatedRequest(URLRequest(url: URL(string: "https://blocking-test.example/news" + mark)!), responseHTML: extras); _ = await until(10) { (await page(w.current, "return location.search === '\(mark)' && !!window.__done")) as? Bool == true } }
    await loadExtras()
    var seen = (await page(w.current, look)) as? [String: Any] ?? [:]
    var reqs = seen["requests"] as? [String: String] ?? [:]
    check("on a page with the usual extras: tracker and advert scripts are stopped, an ordinary script still loads", reqs["tagmanager"] == "blocked" && reqs["analytics"] == "blocked" && reqs["doubleclick"] == "blocked" && reqs["ordinary"] == "loaded", reqs)
    check("the advert is hidden and the article is not", (seen["adShown"] as? Bool) == false && (seen["wordsShown"] as? Bool) == true, seen)
    check("the cookie banner's Reject is pressed for you, and a request to send notifications is refused", (seen["declined"] as? Bool) == true && (seen["note"] as? String) == "denied", seen)
    await nap(0.4); var counts = w.current?.blocked ?? [:]; s = await see(w)
    check("the shield counts them: adverts, trackers, the cookie banner, the notification request", (counts["ads"] ?? 0) >= 1 && (counts["trackers"] ?? 0) >= 2 && (counts["cookies"] ?? 0) >= 1 && (counts["notes"] ?? 0) == 1 && (Int((s["shield"] as? String) ?? "") ?? 0) >= 5, [counts, s["shield"] ?? ""])
    let popSite = Blocker.shared.popupHosts.sorted().first ?? "", tabsBefore = w.tabs.count
    let opened = (await page(w.current, "var a = window.open('https://\(popSite)/'); return !!a")) as? Bool ?? true
    await nap(0.4); counts = w.current?.blocked ?? [:]
    check("a pop-up to a site that only serves pop-up adverts is refused, and counted", !opened && w.tabs.count == tabsBefore && (counts["popups"] ?? 0) == 1, [opened, w.tabs.count - tabsBefore, counts])
    _ = await page(w.current, "location.href = 'https://\(popSite)/'; return 1"); await nap(1.0); counts = w.current?.blocked ?? [:]
    check("so is being sent off to one", (w.current?.address ?? "").contains("blocking-test.example") && (counts["popups"] ?? 0) == 2, [w.current?.address ?? "", counts])
    check("the shield in the address box is just the shield, with no number beside it", (s["shieldText"] as? String) == "", s["shieldText"])
    await press(w, ".shield"); s = await see(w)
    let big = (await bar(w, "return (document.querySelector('.pop .big') || {}).textContent || ''")) as? String ?? ""
    check("the shield opens with what was blocked, and how many", (s["pop"] as? String) == "shield" && (Int(big.split(separator: " ").first ?? "") ?? 0) >= 5, [s["pop"] ?? "", big])
    await shot(w, "12-shield", to: out)
    _ = await page(w.current, "var a = window.open('https://example.org/'); return !!a"); ok = await until(8) { w.tabs.count == tabsBefore + 1 }
    check("an ordinary link that opens a new tab still does", ok, w.tabs.count - tabsBefore)
    if ok, let t = w.current { w.closeTab(t.id) }; await nap(0.4)
    w.store.set("blockOff", ["blocking-test.example"]); await nap(0.2); await loadExtras()
    seen = (await page(w.current, look)) as? [String: Any] ?? [:]; reqs = seen["requests"] as? [String: String] ?? [:]; s = await see(w)
    check("switched off for a site, nothing is blocked there, and the shield says Off", reqs["tagmanager"] == "loaded" && reqs["doubleclick"] == "loaded" && (seen["adShown"] as? Bool) == true && (seen["declined"] as? Bool) == false && (w.current?.blocked ?? [:]).isEmpty && (s["shieldOff"] as? Bool) == true, [reqs, seen, s["shield"] ?? ""])
    w.store.set("blockOff", [String]()); await nap(0.2); await loadExtras()
    seen = (await page(w.current, look)) as? [String: Any] ?? [:]; reqs = seen["requests"] as? [String: String] ?? [:]
    check("and switched back on, it is blocked again", reqs["tagmanager"] == "blocked" && (seen["adShown"] as? Bool) == false, reqs)
    // a real, busy site: not a pass or a fail, just what the shield found
    _ = await bar(w, "Sleek.test.type('https://www.nytimes.com'); return Sleek.test.enter()"); _ = await loaded(w, "nytimes.com"); await nap(4)
    print("   on nytimes.com the shield counted:", w.current?.blocked ?? [:])
    await shot(w, "13-real-site", to: out)

    print("icons of sites, and a new tab")
    let iconKept = await until(10) { Icons.file("www.nytimes.com").map { FileManager.default.fileExists(atPath: $0.path) } == true }
    let served = (await bar(w, "return await new Promise(function(ok){ var i = new Image(); i.onload = function(){ ok(i.naturalWidth); }; i.onerror = function(){ ok(0); }; i.src = 'sleek://ui/_icon/nytimes.com'; })")) as? Int ?? 0
    check("a site's icon is kept on this Mac, and Sleek's own pages can show it", iconKept && served > 0, [iconKept, served])
    await press(w, ".plus"); _ = await until(5) { w.current?.kind == "start" }
    ok = await until(6) { (await page(w.current, "var i = document.querySelector('#top-g a.site[href*=nytimes] i img'); return !!(i && i.naturalWidth > 0)")) as? Bool == true }
    check("a new tab shows where you go most, each with its site's icon", ok, await page(w.current, "return document.getElementById('top-g').innerHTML.slice(0, 400)"))
    _ = await page(w.current, "var a = document.querySelector('#top-g a.site[href*=nytimes]'); if(a) a.focus(); return 1"); await nap(0.5)
    await shot(w, "15-new-tab", to: out)

    print("a picture dragged in")
    let logo = Res.site.appendingPathComponent("icons/icon-192.png"), board = NSPasteboard(name: NSPasteboard.Name("sleek-selftest"))
    board.clearContents(); board.writeObjects([logo as NSURL])
    let pic = DroppedImage.from(board, keepIn: w.store.dir.appendingPathComponent("dropped"))
    board.clearContents(); board.writeObjects([Res.root.appendingPathComponent("sites.txt") as NSURL])
    let notPic = DroppedImage.from(board, keepIn: w.store.dir.appendingPathComponent("dropped"))
    check("a dragged picture file is seen for what it is, and another kind of file is left alone", pic?.file == logo && notPic == nil && !(pic?.thumb ?? "").isEmpty, [pic?.name ?? "", notPic?.name ?? ""])
    if let pic = pic, let t = w.current {
      // The drop reaches the page the way a drop does (the picture itself is noted by the tab, as the window would note it).
      let before = w.tabs.count, was = t.address
      let dropJS = "var d = new DataTransfer(); d.items.add(new File([new Uint8Array(8)], 'icon-192.png', { type: 'image/png' })); ['dragover', 'drop'].forEach(function(n){ document.body.dispatchEvent(new DragEvent(n, { bubbles: true, cancelable: true, dataTransfer: d })); }); return 1"
      _ = await page(t, "window.__take = function(e){ e.preventDefault(); }; document.addEventListener('dragover', window.__take); document.addEventListener('drop', window.__take); return 1")
      t.drop = (pic, Date()); _ = await page(t, dropJS); await nap(0.6); s = await see(w)
      check("dropped on a page that takes the picture itself, Sleek stays out of it", (s["pop"] as? String) != "image", s["pop"])
      _ = await page(t, "document.removeEventListener('dragover', window.__take); document.removeEventListener('drop', window.__take); return 1")
      t.drop = (pic, Date()); _ = await page(t, dropJS); await nap(0.6); s = await see(w)
      check("dropped on a page with no use for it, Sleek asks what to do with it, and the page stays", (s["pop"] as? String) == "image" && t.address == was, [s["pop"] ?? "", t.address])
      await shot(w, "16-picture-dropped", to: out)
      await press(w, "[data-do=imgopen]"); ok = await until(8) { w.tabs.count == before + 1 && (w.current?.address ?? "").hasSuffix("icon-192.png") && !(w.current?.web.isLoading ?? true) }
      let shown = (await page(w.current, "var i = document.querySelector('img'); return i ? i.naturalWidth : 0")) as? Int ?? 0
      check("Open it shows the picture in a new tab", ok && shown == 192, [w.current?.address ?? "", shown])
      w.imageDropped(pic); await nap(0.4); await press(w, "[data-do=imgsearch]")
      ok = await until(25) { (w.current?.web.url?.host ?? "").contains("google.") && !(w.current?.web.isLoading ?? true) }
      check("Search Google for it sends the picture up and lands on Google's results", ok && w.tabs.count == before + 2, w.current?.address.prefix(120))
      await shot(w, "17-picture-search", to: out)
    }

    print("pull down to refresh")
    // The stroke is handed to the tab as the trackpad would hand it over; the page's say comes from a real wheel event in the page.
    _ = await bar(w, "Sleek.test.type('https://example.com'); return Sleek.test.enter()"); _ = await loaded(w, "example.com"); await nap(0.5)
    if let pt = w.current {
      func begin(_ js: String = "") async { pt.wheel(phase: .began, dx: 0, dy: 0); _ = await page(pt, js + "document.body.dispatchEvent(new WheelEvent('wheel', { deltaY: -20, bubbles: true, cancelable: true })); return 1"); _ = await until(4) { pt.pageSays != nil } }
      func move(_ dy: Double, dx: Double = 0) async { for _ in 0..<5 { pt.wheel(phase: .changed, dx: dx / 5, dy: dy / 5) }; await nap(0.3) }
      func lift() async { pt.wheel(phase: .ended, dx: 0, dy: 0); await nap(0.5) }
      func same() async -> Bool { (await page(pt, "return window.__same === 1")) as? Bool == true }
      func arrow() async -> [String: Any]? { (await see(w))["pull"] as? [String: Any] }
      _ = await page(pt, "window.__same = 1; return 1")
      await begin(); await move(60); var a = await arrow(); let slot = w.chrome.slots[0]
      check("a pull at the top of a page brings an arrow down from the top of that page", pt.pulled == 0.5 && (a?["cls"] as? String) == "ptr" && (a?["top"] as? Int) == Int(slot.minY) && (a?["width"] as? Int) == Int(slot.width) && (a?["y"] as? Int ?? -99) > -30 && (a?["y"] as? Int ?? 99) < 10, [pt.pulled, a ?? [:]])
      await lift(); a = await arrow(); var kept = await same()
      check("let go too soon, and nothing happens", kept && a == nil && !pt.refreshing, [kept, a ?? [:]])
      await begin(); await move(70); await move(70); a = await arrow()
      check("pulled far enough, the arrow says so", pt.pulled >= 1 && (a?["cls"] as? String) == "ptr ready", [pt.pulled, a ?? [:]])
      await shot(w, "14-pull", to: out)
      pt.wheel(phase: .ended, dx: 0, dy: 0)
      check("letting go then starts the page loading again, and the arrow turns", pt.refreshing, pt.refreshing)
      ok = await until(12) { !(await same()) && !pt.web.isLoading }
      let gone = await until(5) { !pt.refreshing }; a = await arrow()
      check("the page is loaded again, and the arrow goes", ok && gone && a == nil, [ok, gone, a ?? [:]])
      _ = await page(pt, "window.__same = 1; document.body.style.minHeight = '4000px'; window.scrollTo(0, 300); return 1")
      await begin(); await move(200); a = await arrow(); await lift(); kept = await same()
      check("a page that is scrolled down is not pulled", pt.pageSays == false && a == nil && kept && !pt.refreshing, [pt.pageSays as Any, a ?? [:], kept])
      _ = await page(pt, "window.scrollTo(0, 0); return 1")
      await begin(); await move(20, dx: 200); await move(200); a = await arrow(); await lift(); kept = await same()
      check("a stroke that goes sideways is not a pull", a == nil && kept && !pt.refreshing, [a ?? [:], kept])
      await begin("window.addEventListener('wheel', function(e){ e.preventDefault(); }, { passive: false }); "); await move(200); a = await arrow(); await lift(); kept = await same()
      check("a page that uses the wheel itself (a map) is not pulled", pt.pageSays == false && a == nil && kept && !pt.refreshing, [pt.pageSays as Any, a ?? [:], kept])
      if let own = w.tabs.first(where: { $0.kind == "start" }) {
        own.wheel(phase: .began, dx: 0, dy: 0); for _ in 0..<5 { own.wheel(phase: .changed, dx: 0, dy: 50) }; let far = own.pulled; own.wheel(phase: .ended, dx: 0, dy: 0)
        check("Sleek's own pages are not pulled", far == 0 && !own.refreshing, far)
      }
    }

    print("Sleek's own apps")
    await press(w, "[data-pin=tasks]"); ok = await until(15) { (await page(w.current, "return !!(window.SleekTasks && window.SleekTaskApp && SleekTasks.projects().length)")) as? Bool == true }
    s = await see(w)
    check("the Tasks pin opens Sleek Tasks from inside the app", ok && w.current?.kind == "tasks" && (s["url"] as? String) == "Sleek Tasks", [w.current?.address ?? "", s["url"] ?? ""])
    _ = await page(w.current, "document.body.style.transition = 'none'; document.body.style.opacity = '1'; return 1"); await nap(0.3)
    await shot(w, "10-sleek-tasks", to: out)

    print("closing, and a private window")
    let before = w.tabs.count; if let t = w.current { w.closeTab(t.id) }; await nap(0.4)
    check("closing a tab shows another", w.tabs.count == before - 1 && w.current != nil && !(w.current!.web.isHidden), w.tabs.count)
    let p = App.shared.newWindow(isPrivate: true); _ = await until(8) { !p.tabs.isEmpty && !p.chrome.slots.isEmpty }
    _ = await bar(p, "return Sleek.test.still()")
    let n0 = w.store.history.count
    _ = await bar(p, "Sleek.test.type('example.org'); return Sleek.test.enter()"); _ = await loaded(p, "example.org"); await nap(0.5)
    let ps = await see(p)
    check("a private window is dark, keeps no history, and has its own cookies", p.isPrivate && (ps["mode"] as? String) == "dark" && w.store.history.count == n0 && !p.dataStore.isPersistent, [ps["mode"] ?? "", w.store.history.count - n0])
    await shot(p, "11-private", to: out)
    p.window.close()
    w.store.flush()
    let saved = (try? JSONSerialization.jsonObject(with: Data(contentsOf: w.store.dir.appendingPathComponent("bookmarks.json")))) as? [[String: Any]]
    check("bookmarks are saved to a file on this Mac", saved?.count == 1 && (saved?[0]["title"] as? String) == "Example", saved)
    try? FileManager.default.removeItem(at: w.store.dir)
  }
}

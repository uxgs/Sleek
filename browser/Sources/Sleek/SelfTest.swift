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
    await shot(w, "3-suggestions", to: out)
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
    await shot(w, "7-immersive", to: out)
    _ = await bar(w, "await new Promise(function(ok){ setTimeout(ok, 3300); }); return 1"); s = await see(w)
    let hidden = !((s["cls"] as? String) ?? "").contains("show")
    w.pageScrolled(w.current!, "top"); await nap(0.3); s = await see(w)
    check("it fades after a moment, and scrolling up to the top brings it back", hidden && ((s["cls"] as? String) ?? "").contains("show"), [hidden, s["cls"] ?? ""])
    w.store.set("imm", false); await nap(0.5)

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

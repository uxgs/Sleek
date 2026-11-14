// The app: its windows, its menu bar, and opening links other apps hand to it.
import AppKit
import WebKit

@MainActor
final class App: NSObject, NSApplicationDelegate {
  static let shared = App()
  var store: Store!
  var windows: [BrowserWindow] = []
  private var pendingURLs: [URL] = []
  private var launched = false

  var front: BrowserWindow? { windows.first { $0.window.isKeyWindow } ?? windows.first { $0.window.isMainWindow } ?? windows.last }

  func applicationDidFinishLaunching(_ note: Notification) {
    let dir = Res.selfTest != nil ? FileManager.default.temporaryDirectory.appendingPathComponent("sleek-selftest-\(ProcessInfo.processInfo.processIdentifier)")
                                  : FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("Sleek")
    store = Store(dir: dir)
    store.onChange.append { [weak self] in self?.windows.forEach { $0.settingsChanged() } }
    Downloads.shared.onChange.append { [weak self] in self?.windows.forEach { $0.push() } }
    Blocker.shared.onChange.append { [weak self] in self?.windows.forEach { $0.blockerChanged() } }
    Blocker.shared.start(dir: dir.appendingPathComponent("lists"))
    Icons.dir = dir.appendingPathComponent("icons")
    Icons.onNew = { [weak self] in self?.windows.forEach { $0.iconsChanged() } }
    Work.shared.onChange.append { [weak self] in self?.windows.forEach { $0.workChanged() } }
    if !Res.args.contains("--lists") { Work.shared.start() }
    buildMenu()
    // `--lists`: only make the block lists ready, say what came of it, and quit (for whoever is working on the lists)
    if Res.args.contains("--lists") {
      let t0 = Date(); Blocker.shared.onChange.append { for s in Blocker.sources { print(s.id, Blocker.shared.facts[s.id].map { f in "rules \(f["rules"] ?? 0), left out \(f["left"] ?? 0), dropped \(f["dropped"] ?? 0), pop-up sites \((f["popups"] as? [String])?.count ?? 0), dated \(f["dated"] ?? "")" } ?? "not ready") }
        print("ready:", Blocker.shared.ready, "in", (Date().timeIntervalSince(t0) * 10).rounded() / 10, "s"); exit(0) }
      Blocker.shared.start(dir: FileManager.default.temporaryDirectory.appendingPathComponent("sleek-lists-\(ProcessInfo.processInfo.processIdentifier)")); return
    }
    let w = newWindow(isPrivate: false, empty: true)
    let asked = (Res.arg("--url").flatMap { URL(string: $0) }.map { [$0] } ?? []) + pendingURLs
    let again = Res.selfTest == nil ? (store.settings["session"] as? [String] ?? []).compactMap { URL(string: $0) } : []
    let open = asked.isEmpty ? again : asked
    if open.isEmpty { w.newTab() } else { open.forEach { w.newTab($0) } }
    launched = true
    if let out = Res.selfTest { SelfTest.run(w, out: URL(fileURLWithPath: out)) } else { NSApp.activate(ignoringOtherApps: true) }
  }
  @discardableResult func newWindow(isPrivate: Bool, empty: Bool = false) -> BrowserWindow {
    let w = BrowserWindow(store: store, isPrivate: isPrivate)
    w.onClose = { [weak self] gone in self?.windows.removeAll { $0 === gone } }
    windows.append(w); if !empty { w.newTab() }
    if Res.selfTest != nil { w.window.orderFrontRegardless() } else { w.window.makeKeyAndOrderFront(nil) }
    return w
  }
  // links from other apps, once Sleek is the default browser, or a file dropped on its icon
  func application(_ application: NSApplication, open urls: [URL]) { if launched { let w = front ?? newWindow(isPrivate: false, empty: true); urls.forEach { w.newTab($0) }; w.window.makeKeyAndOrderFront(nil) } else { pendingURLs += urls } }
  func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }
  func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool { if !flag { newWindow(isPrivate: false) }; return true }
  func applicationWillTerminate(_ note: Notification) {
    if Res.selfTest == nil { if let w = windows.first(where: { !$0.isPrivate }) { store.settings["session"] = w.session }; store.flush() }
  }
  /// Ask the Mac to make Sleek the browser links open in. The Mac asks you to confirm.
  func makeDefault() {
    guard Bundle.main.bundleURL.pathExtension == "app" else { front?.tell(["type": "toast", "text": "That works once Sleek is installed as an app"]); return }
    for scheme in ["http", "https"] { NSWorkspace.shared.setDefaultApplication(at: Bundle.main.bundleURL, toOpenURLsWithScheme: scheme) { _ in } }
  }

  // ---------- the menu bar ----------
  /// A menu item. Sleek's own actions go to this object; the rest (Copy, Paste, Minimize…) find whoever is in focus.
  private func item(_ title: String, _ key: String, _ mods: NSEvent.ModifierFlags = [.command], _ action: Selector) -> NSMenuItem {
    let i = NSMenuItem(title: title, action: action, keyEquivalent: key); i.keyEquivalentModifierMask = mods; i.target = responds(to: action) ? self : nil; return i
  }
  private func menu(_ title: String, _ items: [NSMenuItem]) -> NSMenuItem { let m = NSMenu(title: title); items.forEach { m.addItem($0) }; let top = NSMenuItem(); top.submenu = m; return top }
  private func buildMenu() {
    let main = NSMenu(), sep = { NSMenuItem.separator() }
    main.addItem(menu("Sleek", [item("About Sleek", "", [], #selector(NSApplication.orderFrontStandardAboutPanel(_:))), sep(), item("Look…", ",", [.command], #selector(look)), item("Make Sleek the Default Browser", "", [], #selector(makeDefaultMenu)), sep(),
                           item("Hide Sleek", "h", [.command], #selector(NSApplication.hide(_:))), item("Quit Sleek", "q", [.command], #selector(NSApplication.terminate(_:)))]))
    main.addItem(menu("File", [item("New Tab", "t", [.command], #selector(newTab)), item("New Window", "n", [.command], #selector(newWin)), item("New Private Browsing Window", "n", [.command, .shift], #selector(newPrivate)), sep(),
                          item("Open Location…", "l", [.command], #selector(address)), sep(), item("Close Tab", "w", [.command], #selector(closeTab)), item("Print…", "p", [.command], #selector(printPage))]))
    main.addItem(menu("Edit", [item("Undo", "z", [.command], Selector(("undo:"))), item("Redo", "z", [.command, .shift], Selector(("redo:"))), sep(), item("Cut", "x", [.command], #selector(NSText.cut(_:))), item("Copy", "c", [.command], #selector(NSText.copy(_:))),
                          item("Paste", "v", [.command], #selector(NSText.paste(_:))), item("Select All", "a", [.command], #selector(NSText.selectAll(_:))), sep(), item("Find…", "f", [.command], #selector(find))]))
    main.addItem(menu("View", [item("Reload", "r", [.command], #selector(reload)), sep(), item("Zoom In", "+", [.command], #selector(zoomIn)), item("Zoom Out", "-", [.command], #selector(zoomOut)), item("Actual Size", "0", [.command], #selector(zoomReset)), sep(),
                          item("Show or Hide the Bookmarks Bar", "b", [.command, .shift], #selector(toggleBar)), item("Immersive", "i", [.command, .shift], #selector(toggleImmersive)), item("Split View…", "\\", [.command], #selector(split)), sep(),
                          item("Enter Full Screen", "f", [.command, .control], #selector(NSWindow.toggleFullScreen(_:)))]))
    main.addItem(menu("History", [item("Back", "[", [.command], #selector(back)), item("Forward", "]", [.command], #selector(forward)), sep(), item("Show History", "y", [.command], #selector(history))]))
    main.addItem(menu("Bookmarks", [item("Bookmark This Page", "d", [.command], #selector(bookmark)), item("All Bookmarks", "b", [.command, .option], #selector(bookmarks))]))
    main.addItem(menu("Tab", [item("Next Tab", "\t", [.control], #selector(nextTab)), item("Previous Tab", "\t", [.control, .shift], #selector(prevTab))]))
    let win = menu("Window", [item("Minimize", "m", [.command], #selector(NSWindow.performMiniaturize(_:))), item("Zoom", "", [], #selector(NSWindow.performZoom(_:))), sep(), item("Downloads", "l", [.command, .option], #selector(downloads))])
    main.addItem(win); NSApp.windowsMenu = win.submenu
    NSApp.mainMenu = main
  }
  @objc func newTab() { front?.newTab(); front?.focusAddress() }
  @objc func newWin() { newWindow(isPrivate: false) }
  @objc func newPrivate() { newWindow(isPrivate: true) }
  @objc func address() { front?.focusAddress() }
  @objc func closeTab() { if let w = front, let t = w.current { w.closeTab(t.id) } }
  @objc func printPage() { front?.printPage() }
  @objc func find() { if let w = front { w.window.makeFirstResponder(w.chrome); w.show("find") } }
  @objc func reload() { front?.current?.web.reload() }
  @objc func zoomIn() { front?.zoom(1) }
  @objc func zoomOut() { front?.zoom(-1) }
  @objc func zoomReset() { front?.zoom(0) }
  @objc func toggleBar() { store.set("bar", !(store.settings["bar"] as? Bool ?? true)) }
  @objc func toggleImmersive() { store.set("imm", !(store.settings["imm"] as? Bool ?? false)) }
  @objc func split() { front?.show("split") }
  @objc func back() { front?.current?.web.goBack() }
  @objc func forward() { front?.current?.web.goForward() }
  @objc func history() { front?.show("history") }
  @objc func bookmark() { front?.show("star") }
  @objc func bookmarks() { front?.show("allmarks") }
  @objc func downloads() { front?.show("downloads") }
  @objc func look() { front?.show("look") }
  @objc func makeDefaultMenu() { makeDefault() }
  private func step(_ by: Int) { guard let w = front, let c = w.current, let i = w.tabs.firstIndex(where: { $0 === c }) else { return }; w.select(w.tabs[(i + by + w.tabs.count) % w.tabs.count].id) }
  @objc func nextTab() { step(1) }
  @objc func prevTab() { step(-1) }
}

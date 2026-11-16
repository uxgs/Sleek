// Started plainly, the app is the browser. Started with `--prove` (./make.sh check), it checks itself:
// it drives the same model the screens draw (tabs, Private Browsing, blocking, bookmarks, history, your
// Sleek work, Save to Sleek, the bar), says each thing it finds on screen and in the console, and quits.
// While it checks, nothing of yours is touched: settings go to a throwaway folder and pages keep nothing.
import SwiftUI
import WebKit
import CryptoKit

@main
struct SleekApp: App {
  var body: some Scene { WindowGroup { if Res.proving { CheckView() } else { BrowserView() } } }
}

@MainActor
final class Checker: ObservableObject {
  @Published var lines: [(ok: Bool, text: String)] = []
  let b = Browser()
  private var failures = 0
  private func say(_ ok: Bool, _ text: String) { lines.append((ok, text)); if !ok { failures += 1 }; print((ok ? "  ok   " : "  FAIL ") + text); fflush(stdout) }
  private func nap(_ s: Double) async { try? await Task.sleep(nanoseconds: UInt64(s * 1e9)) }
  private func until(_ seconds: Double, _ test: () async -> Bool) async -> Bool { let end = Date().addingTimeInterval(seconds); while Date() < end { if await test() { return true }; await nap(0.25) }; return await test() }
  private func js(_ t: PhoneTab, _ code: String) async -> Any? { try? await t.web.callAsyncJavaScript(code, arguments: [:], in: nil, contentWorld: .page) }
  /// Go somewhere in a tab and wait for the page to arrive.
  private func visit(_ t: PhoneTab, _ address: String) async -> Bool {
    let was = t.web.url; t.go(URL(string: address)!); await nap(0.3)
    return await until(30) { !t.web.isLoading && t.web.url != nil && (t.web.url != was || was?.absoluteString == address) }
  }

  func run() async {
    say(true, "the app runs on \(UIDevice.current.name), iOS \(UIDevice.current.systemVersion)")

    // ---------- what it starts with ----------
    say(b.tabs.count == 1 && b.tab.atStart && !b.tab.isPrivate, "it opens on one tab, showing your day")
    let ready = await until(150) { self.b.blockerReady }
    say(ready, "the block lists are ready (\(Blocker.shared.summary["rules"] as? Int ?? 0) rules)")
    let open = await until(30) { Work.shared.ready && self.b.day.loaded }
    say(open, "your Sleek work opens: \(b.day.boards.count) board\(b.day.boards.count == 1 ? "" : "s")")

    // ---------- going places ----------
    say(destination(for: "apple.com", search: b.store.search)?.absoluteString == "https://apple.com" && (destination(for: "two words", search: b.store.search)?.host ?? "") == URL(string: b.store.search)?.host, "an address goes to the site, and words go to \(Search.name(for: b.store.search))")
    let first = b.tab
    let there = await visit(first, "https://example.com/")
    say(there && !first.atStart && first.host == "example.com" && !first.title.isEmpty, "a page opens: “\(first.title)” at \(first.host)")
    say(first.blocking, "blocking is on for it")
    say((b.store.history.first?["u"] as? String) == "https://example.com/", "it is written in your history")
    let wasTop = b.topSites.contains { $0.host == "example.com" }
    b.hideTop("example.com")
    say(wasTop && !b.topSites.contains { $0.host == "example.com" } && b.store.history.contains { ($0["u"] as? String) == "https://example.com/" }, "the site shows among the places you go most; removed from there, it leaves that list and stays in your history")
    b.store.set("hiddenTop", [String]())
    say(first.web.findInteraction != nil && first.web.scrollView.refreshControl != nil && first.web.allowsBackForwardNavigationGestures, "find on page, pull down to refresh and swiping back are there")

    // ---------- blocking, and switching it off for a site ----------
    let t2 = b.newTab(); t2.atStart = false; t2.applyBlocking(true)
    let testPage = """
    <!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width"><title>A page with the usual extras</title><body><h1>News</h1><div class="ad-slot" id="ad">an advert</div>
    <script>window.r = {}; function t(n, u){ var s = document.createElement('script'); s.src = u; s.onload = function(){ r[n] = 'loaded'; }; s.onerror = function(){ r[n] = 'blocked'; }; document.head.appendChild(s); }
    t('tagmanager', 'https://www.googletagmanager.com/gtm.js?id=GTM-TEST'); t('doubleclick', 'https://securepubads.g.doubleclick.net/tag/js/gpt.js'); t('ordinary', 'https://cdnjs.cloudflare.com/ajax/libs/lodash.js/4.17.21/lodash.min.js');</script>
    """
    t2.web.loadSimulatedRequest(URLRequest(url: URL(string: "https://blocking-test.example/news")!), responseHTML: testPage)
    _ = await until(20) { ((await self.js(t2, "return window.r ? Object.keys(window.r).length : 0")) as? Int ?? 0) >= 3 }
    let got = (await js(t2, "return { r: window.r, ad: getComputedStyle(document.getElementById('ad')).display }")) as? [String: Any] ?? [:], r = got["r"] as? [String: String] ?? [:]
    say(r["tagmanager"] == "blocked" && r["doubleclick"] == "blocked" && r["ordinary"] == "loaded" && (got["ad"] as? String) == "none", "a tracker and an advert are blocked, an ordinary script loads, and the advert's box is hidden")
    b.close(t2)
    say(b.tabs.count == 1 && b.tab === first, "closing a tab goes back to the one before")
    b.setBlocking(false); await nap(1.5)
    say(!first.blocking && !b.blockingWanted(for: URL(string: "https://example.com/")!) && b.blockingWanted(for: URL(string: "https://example.org/")!), "blocking can be switched off for one site, and stays on for the rest")
    b.setBlocking(true); await nap(1.5)
    say(first.blocking && b.blockOff.isEmpty, "and switched on again")

    // ---------- bookmarks ----------
    b.toggleBookmark(); let marked = b.isBookmarked(first); b.toggleBookmark()
    say(marked && !b.isBookmarked(first), "a page can be bookmarked, and the bookmark removed")

    // ---------- Private Browsing ----------
    _ = await js(first, "document.cookie = 'seen=ordinary; path=/; max-age=600'; return 1")
    let visits = b.store.history.count
    let p = b.newTab(isPrivate: true)
    say(p.isPrivate && p.atStart && b.tab === p && !p.web.configuration.websiteDataStore.isPersistent && p.web.configuration.websiteDataStore !== first.web.configuration.websiteDataStore, "a private tab opens, with storage of its own")
    say(b.suggestions("").isEmpty && !b.suggestions("exam").contains { $0.kind == "history" }, "it is offered nothing from your history as you type")
    let pThere = await visit(p, "https://example.com/")
    let pCookie = (await js(p, "return document.cookie")) as? String ?? "?", oCookie = (await js(first, "return document.cookie")) as? String ?? ""
    say(pThere && oCookie.contains("seen=ordinary") && !pCookie.contains("seen"), "a cookie set in an ordinary tab is not seen by the private one")
    say(b.store.history.count == visits, "what it opens is not written in your history")
    _ = await js(p, "document.cookie = 'seen=private; path=/; max-age=600'; return 1")
    let p2 = b.newTab(); let p2There = await visit(p2, "https://example.com/")
    let p2Cookie = (await js(p2, "return document.cookie")) as? String ?? ""
    say(p2.isPrivate && p2There && p2Cookie.contains("seen=private"), "a tab opened from a private tab is private too, and shares that session")
    b.saveSession()
    let kept = b.store.settings["session"] as? [String] ?? []
    say(kept == ["https://example.com/"], "private tabs are not among the tabs brought back next time")
    say(b.neighbour(-1) == b.tabs.firstIndex { $0 === p } && b.neighbour(1) == nil, "sliding the address moves between private tabs only")
    let before = b.privateData; b.close(p2); let still = b.privateData === before; b.close(p)
    say(still && b.privateData !== before && !b.tabs.contains { $0.isPrivate } && b.tab === first, "closing the last private tab forgets everything they kept")
    let p3 = b.newTab(isPrivate: true); _ = await visit(p3, "https://example.com/")
    let p3Cookie = (await js(p3, "return document.cookie")) as? String ?? "seen"
    say(!p3Cookie.contains("seen"), "a private tab opened afterwards starts clean")
    b.close(p3)
    // the start screen's "Pick up where you left off": a picture of sample tiles, light and dark, to look at
    let samples = [WorkItem(id: "a", title: "Pace", url: "", kind: "slides", at: 0, slides: 12, kicker: "Quarterly review", heading: "Pace of the year", mode: "dark", accent: "#7C5CFF"),
                   WorkItem(id: "b", title: "Launch", url: "", kind: "slides", at: 0, slides: 8, kicker: "", heading: "", mode: "light", accent: "#FF6A3D"),
                   WorkItem(id: "c", title: "Hey", url: "", kind: "docs", at: 0, slides: 0, peek: "Thanks for the notes on Tuesday. Here is where the plan stands, and the three things I would like us to settle before the end of the month: who owns the launch, when it ships, and what we cut."),
                   WorkItem(id: "d", title: "Rip plan", url: "", kind: "docs", at: 0, slides: 0)]
    for dark in [false, true] {
      let r = ImageRenderer(content: HStack(spacing: 14) { ForEach(samples) { RecentTile(r: $0) } }.padding(24).background(dark ? Color.black : Color(hex: "#F4F2FA")).environment(\.colorScheme, dark ? .dark : .light)); r.scale = 2
      if let d = r.uiImage?.pngData(), let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first { try? d.write(to: docs.appendingPathComponent(dark ? "recent-dark.png" : "recent-light.png")) }
    }
    // Open in Background: the link opens behind the page you are on, in an ordinary tab or a private one
    let on = b.tab, count = b.tabs.count, bg = b.newTab(URL(string: "https://example.com/"), isPrivate: false, background: true)
    say(b.tab === on && b.tabs.count == count + 1 && !bg.isPrivate && b.toast == "Opened in a tab behind this one", "Open in Background opens the link in a tab behind this page, and you stay here")
    let bgp = b.newTab(URL(string: "https://example.com/"), isPrivate: true, background: true)
    say(b.tab === on && bgp.isPrivate && bgp.web.configuration.websiteDataStore === b.privateData && b.toast == "Opened in a private tab, behind this one", "Open in Background Private Tab opens it in a private tab behind this page")
    b.show(b.tabs.firstIndex { $0 === bgp }!); let bgp2 = b.newTab(URL(string: "https://example.com/"), background: true)
    say(b.tab === bgp && bgp2.isPrivate, "from a private tab, Open in Background opens another private tab behind it")
    b.close(bgp2); b.close(bgp); b.close(bg); b.show(b.tabs.firstIndex { $0 === on } ?? 0)

    // ---------- your Sleek work ----------
    b.addTask("Checked on the phone")
    let added = await until(10) { self.b.day.today.contains { $0.title == "Checked on the phone" } }
    say(added, "a task added from the app is in today's tasks")
    if let t = b.day.today.first(where: { $0.title == "Checked on the phone" }) { b.tick(t) }
    let ticked = await until(10) { self.b.day.done.contains { $0.title == "Checked on the phone" } }
    say(ticked, "and can be ticked off")
    let doneShown = b.doneToday.contains { $0.title == "Checked on the phone" }
    await b.freshenToday()
    say(doneShown && !b.doneToday.contains { $0.title == "Checked on the phone" } && b.day.done.contains { $0.title == "Checked on the phone" }, "pulling the start page down clears what was ticked off from Today (it stays done in Tasks)")
    // a grocery list due today shows on Today; ticking a thing there puts it in the basket in Tasks
    let listId = await Work.shared.ask("var T = SleekTasks; var l = T.addList({ name: 'Checked list' }); T.setProject(l.id, { due: T.dayKey(new Date()) }); T.addItem(l.id, '2 lemons'); T.addItem(l.id, 'milk'); return l.id") as? String ?? ""
    Work.shared.refresh()
    let listShown = await until(10) { self.b.day.lists.contains { $0.id == listId && $0.left == 2 } }
    say(listShown && !b.day.boards.contains { $0.id == listId } && b.day.toGet >= 2, "a grocery list due today shows on Today, apart from the boards")
    if let l = b.day.lists.first(where: { $0.id == listId }), let t = l.items.first(where: { $0.title == "Lemons" }) { b.tick(t, on: l) }
    let gotIt = await until(10) { self.b.day.lists.first { $0.id == listId }.map { $0.left == 1 && $0.items.contains { $0.title == "Lemons" && $0.done } } ?? false }
    say(gotIt, "and a thing ticked there goes in the basket")
    _ = await Work.shared.ask("var T = SleekTasks; T.finishList(id, false); return true", ["id": listId]); Work.shared.refresh()
    let listGone = await until(10) { !self.b.day.lists.contains { $0.id == listId } }
    say(listGone, "a shopped list leaves Today")
    _ = await Work.shared.ask("SleekTasks.removeProject(id); return true", ["id": listId])
    // sharing with the other Sleek apps on this iPhone: this app's place and another's, in a folder standing in for the shared one
    let fm = FileManager.default, was = (Work.shared.folder, Work.shared.peers)
    let share = fm.temporaryDirectory.appendingPathComponent("sleek-share-\(ProcessInfo.processInfo.processIdentifier)"), mine = share.appendingPathComponent("browser"), other = share.appendingPathComponent("tasks")
    try? fm.createDirectory(at: other.appendingPathComponent("pages"), withIntermediateDirectories: true)
    Work.shared.folder = mine; Work.shared.peers = [other]
    let t0 = Int(Date().timeIntervalSince1970 * 1000)
    func tasksFile(gone: String) -> String { "{\"format\":\"sleek-tasks\",\"version\":1,\"projects\":[{\"id\":\"sharedbrd1\",\"name\":\"Shared board\",\"color\":\"#12A36A\",\"statuses\":[{\"id\":\"todo\",\"name\":\"To do\",\"color\":\"#8E8E93\",\"done\":false},{\"id\":\"done\",\"name\":\"Done\",\"color\":\"#12A36A\",\"done\":true}],\"created\":\(t0),\"updated\":\(t0)}],\"tasks\":[{\"id\":\"sharedtsk1\",\"project\":\"sharedbrd1\",\"title\":\"From Sleek Tasks\",\"status\":\"todo\",\"order\":1,\"created\":\(t0),\"updated\":\(t0)}],\"people\":[],\"usuals\":[],\"gone\":{\(gone)}}" }
    try? tasksFile(gone: "").write(to: other.appendingPathComponent("Tasks.sleek"), atomically: true, encoding: .utf8)
    let pageText = await Work.shared.ask("var D = SleekDocs, p = await D.create({ seed: { kind: 'doc', v: 1, theme: {}, doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Written in Sleek Docs' }] }] } } }); var o = JSON.parse(await D.exportDoc(p.id)); await D.remove(p.id); o.id = 'sharedpg01'; o.updated = Date.now() - 1000; return JSON.stringify(o)") as? String ?? ""
    let pageAt = ((try? JSONSerialization.jsonObject(with: Data(pageText.utf8))) as? [String: Any])?["updated"] as? NSNumber
    try? pageText.write(to: other.appendingPathComponent("pages/sharedpg01.sleek"), atomically: true, encoding: .utf8)
    try? "{\"page:sharedpg01\":\"\(pageAt?.int64Value ?? 0)\"}".write(to: other.appendingPathComponent("index.json"), atomically: true, encoding: .utf8)
    let took = await Work.shared.pull()
    let cameIn = await Work.shared.ask("var T = SleekTasks, k = T.task('sharedtsk1'), p = await SleekDocs.get('sharedpg01'); return !!T.project('sharedbrd1') && !!k && k.title === 'From Sleek Tasks' && !!p && p.updated === at", ["at": pageAt ?? 0]) as? Bool ?? false
    say(took >= 2 && cameIn, "another app's board, task and page come in from the shared folder")
    let twice = await Work.shared.pull(); say(twice == 0, "and bringing them in again changes nothing")
    _ = await Work.shared.ask("SleekTasks.removeTask('sharedtsk1'); await SleekDocs.remove('sharedpg01'); return 1")
    await Work.shared.keepCopy(now: true)
    let myTasks = (try? Data(contentsOf: mine.appendingPathComponent("Tasks.sleek"))).flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }
    let myGone = (try? Data(contentsOf: mine.appendingPathComponent("gone.json"))).flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }
    say((myTasks?["gone"] as? [String: Any])?["sharedtsk1"] != nil && myGone?["page:sharedpg01"] != nil, "what is deleted here is written in this app's place, for the others")
    let again = await Work.shared.pull(), stillGone = await Work.shared.ask("return !SleekTasks.task('sharedtsk1') && !(await SleekDocs.get('sharedpg01'))") as? Bool ?? false
    say(again == 0 && stillGone, "and the other app's older copy does not bring it back")
    try? await Task.sleep(nanoseconds: 50_000_000)
    try? tasksFile(gone: "\"sharedbrd1\":\(t0 + 5000)").write(to: other.appendingPathComponent("Tasks.sleek"), atomically: true, encoding: .utf8)
    _ = await Work.shared.pull()
    let boardGone = await Work.shared.ask("return !SleekTasks.project('sharedbrd1')") as? Bool ?? false
    say(boardGone, "a board deleted in another app goes here too")
    Work.shared.folder = was.0; Work.shared.peers = was.1; try? fm.removeItem(at: share)
    let addr = { (s: String) in Browser.sleekApp(for: URL(string: s)!)?.absoluteString ?? "-" }
    say(addr("sleek://app/tasks.html#/abcde12345/shop") == "sleek-tasks://open?board=abcde12345" && addr("sleek://app/tasks.html") == "sleek-tasks://open" && addr("sleek://app/doc.html?d=pg12345678") == "sleek-docs://open?d=pg12345678"
        && addr("sleek://app/deck.html?d=dk12345678") == "sleek-slides://open?d=dk12345678" && addr("sleek://app/slides.html") == "sleek-slides://open" && addr("https://example.org/doc.html?d=x1234") == "-" && addr("sleek://app/tasks.html#/BAD!/x") == "sleek-tasks://open",
        "each of Sleek's own pages knows the address of the Sleek app that shows it")
    let hintsWere = b.searchHints; b.setting("searchHints", false); let hintsOff = !b.searchHints; b.setting("searchHints", hintsWere)
    let appsWere = b.startApps; b.setting("startApps", false); let appsOff = !b.startApps; b.setting("startApps", appsWere)
    say(hintsOff && appsOff && b.startApps == appsWere, "search suggestions and the row of Sleek apps can each be switched off")
    // the tiles for where you go most: clear glass, wide, in a grid unless chosen otherwise, and coloured from each site's own icon
    let tilesFirst = b.tileStyle == "clear" && b.tileShape == "wide" && b.tileLayout == "grid"
    b.choose("tileStyle", "colour"); b.choose("tileShape", "square"); b.choose("tileLayout", "row")
    let tilesChosen = b.tileStyle == "colour" && b.tileShape == "square" && b.tileLayout == "row"
    b.choose("tileStyle", "clear"); b.choose("tileShape", "wide"); b.choose("tileLayout", "grid")
    say(tilesFirst && tilesChosen, "where you go most starts as wide clear-glass tiles two across, and Appearance can make them colour glass, square or a sideways row")
    func iconOf(_ px: Int, _ draw: (CGContext) -> Void) -> UIImage { let f = UIGraphicsImageRendererFormat(); f.scale = 1; return UIGraphicsImageRenderer(size: CGSize(width: px, height: px), format: f).image { draw($0.cgContext) } }
    let redIcon = iconOf(180) { c in c.setFillColor(UIColor.white.cgColor); c.fill(CGRect(x: 0, y: 0, width: 180, height: 180)); c.setFillColor(UIColor(red: 1, green: 0, blue: 0.1, alpha: 1).cgColor); c.fillEllipse(in: CGRect(x: 30, y: 30, width: 120, height: 120)) }
    let monoIcon = iconOf(64) { c in c.setFillColor(UIColor.black.cgColor); c.fill(CGRect(x: 0, y: 0, width: 64, height: 64)); c.setFillColor(UIColor.white.cgColor); c.fill(CGRect(x: 16, y: 16, width: 32, height: 32)) }
    let redTint = Tint.read(redIcon), monoTint = Tint.read(monoIcon)
    let redOK = redTint?.accent.map { $0[0] > 200 && $0[1] < 60 } == true && redTint?.corner.map { Tint.lum($0) > 0.9 } == true && redTint?.pixels == 180
    let monoOK = monoTint?.accent == nil && monoTint?.corner.map { Tint.lum($0) < 0.1 } == true && monoTint.map { Tint.lum($0.pair(dark: false).1) < 0.2 } == true
    say(redOK && monoOK, "a tile takes its colour from the site's icon (red for a red one), and a black-and-white icon gets a graphite tile")
    if let f = Icons.file("tile-check.example") { try? FileManager.default.createDirectory(at: f.deletingLastPathComponent(), withIntermediateDirectories: true); try? redIcon.pngData()?.write(to: f) }
    let keptTint = Tint.of("tile-check.example"); if let f = Icons.file("tile-check.example") { try? FileManager.default.removeItem(at: f) }
    say(["slides", "docs", "tasks"].allSatisfy { SiteTile.apps[$0]?.accent != nil }, "Slides, Docs and Tasks have glass tiles in their own colours")
    say(Chime.url != nil, "the opening sound is inside the app")
    say(b.launch == .done,"while the app checks itself, Sleek opens without its launch animation")
    say(keptTint == redTint && SiteName.of("www.tile-check.example") == "tile-check.example" && PhoneTab.iconScript.contains("apple-touch-icon"), "tiles read the icon Sleek keeps for a site, and Sleek keeps the site's iPhone icon when it has one")
    let hintsEvery = Search.providers.allSatisfy { Search.hints(for: $0.address, "new york")?.absoluteString.contains("new%20york") == true }
    let hintsRead = Search.readHints(Data(#"["new",["news","new york times"]]"#.utf8)) == ["news", "new york times"] && Search.readHints(Data("oops".utf8)).isEmpty
    say(hintsEvery && hintsRead, "every search provider has an address for suggestions, and their answers are read")
    let hintsSent = await b.askHints("new")
    say(hintsSent.isEmpty, "while the app checks itself, nothing is sent to a search provider")
    let asTask = await b.save(asPage: false)
    let savedTask = await until(10) { self.b.day.today.contains { $0.title.hasPrefix("Read: ") } }
    say(asTask && savedTask, "Save to Sleek makes a task of the page showing")
    let asPage = await b.save(asPage: true)
    let savedPage = await until(10) { self.b.day.recent.contains { $0.kind == "docs" } }
    say(asPage && b.lastKept != nil && savedPage, "and keeps it as a Docs page")
    say(["tasks", "docs"].contains(b.suggestions("Example").first?.kind ?? "") && b.suggestions("exam").contains { $0.kind == "history" } && b.suggestions("exam").last?.kind == "search", "typing offers your own work first, then places you know, then a search")
    let s = b.newTab(isPrivate: false); let tasksUp = await visit(s, "sleek://app/tasks.html")
    let home = await until(20) { (await self.js(s, "return !!(window.SleekTasks && SleekTasks.projects().length && document.querySelector('.home h1'))")) as? Bool == true }
    let wide = ((await js(s, "return document.documentElement.scrollWidth - innerWidth")) as? Int) ?? 99
    say(tasksUp && home && wide <= 0 && s.shownName == "Sleek Tasks" && !s.blocking, "Sleek Tasks opens inside the app and fits the phone's width")
    for (file, name) in [("docs.html", "Sleek Docs"), ("slides.html", "Sleek Slides")] {
      let up = await visit(s, "sleek://app/" + file); await nap(0.6)
      let w = ((await js(s, "return document.documentElement.scrollWidth - innerWidth")) as? Int) ?? 99
      say(up && w <= 0 && s.shownName == name, "\(name) opens inside the app and fits the phone's width")
    }
    say(!b.store.history.contains { ($0["u"] as? String ?? "").hasPrefix("sleek:") }, "Sleek's own pages are not written in your history")

    // ---------- handing links to their apps ----------
    // (a stand-in plays the phone here: it says an app opens has-an-app.example and example.com, and nothing else)
    var offered: [URL] = []
    b.handOff = { url, done in offered.append(url); let site = PhoneTab.site(url.host); done(site == "has-an-app.example" || site == "example.com") }
    func click(_ t: PhoneTab, _ address: String, blank: Bool = false) async { _ = await self.js(t, "var a = document.createElement('a'); a.href = '\(address)'; \(blank ? "a.target = '_blank'; " : "")document.body.appendChild(a); a.click(); return 1") }
    _ = await visit(first, "https://example.org/")
    say(offered.isEmpty, "an address you go to yourself is not offered to an app")
    await click(first, "https://www.has-an-app.example/watch?v=abc"); await nap(1.2)
    say(offered.last?.host == "www.has-an-app.example" && first.web.url?.host == "example.org" && !first.web.isLoading, "a tapped link to a site that has an app opens in the app, and the page stays as it was")
    offered = []; await click(first, "https://www.iana.org/help/example-domains")
    let noApp = await until(20) { first.web.url?.host == "www.iana.org" && !first.web.isLoading }
    say(noApp && offered.first?.host == "www.iana.org", "a tapped link to a site with no app is offered, then opens in Sleek")
    _ = await visit(first, "https://example.com/"); offered = []
    await click(first, "https://www.example.com/")
    let sameSite = await until(20) { first.web.url?.host == "www.example.com" && !first.web.isLoading }
    say(sameSite && offered.isEmpty, "a link within the site you are browsing stays in Sleek, though an app could open it")
    let hop = b.newTab(isPrivate: false); hop.atStart = false; hop.tapAt = Date(); hop.tapSite = "links.example"
    hop.web.loadSimulatedRequest(URLRequest(url: URL(string: "https://short.example/x")!), responseHTML: "<!doctype html><title>On the way</title><script>setTimeout(function(){ location.href = 'https://www.has-an-app.example/watch?v=abc'; }, 300);</script>")
    let hopped = await until(6) { offered.last?.host == "www.has-an-app.example" }; await nap(0.5)
    say(hopped && hop.web.url?.host == "short.example", "where a tapped link leads a moment later (a short link) is handed to the app too")
    b.close(hop); offered = []
    let tabsBefore = b.tabs.count
    await click(first, "https://www.has-an-app.example/watch?v=new", blank: true); await nap(1.2)
    say(offered.last?.host == "www.has-an-app.example" && b.tabs.count == tabsBefore, "a link that would open a new tab goes to its app without leaving an empty tab behind")
    let hidden = b.newTab(isPrivate: true); _ = await visit(hidden, "https://example.org/"); offered = []
    await click(hidden, "https://example.com/")
    let keptIn = await until(20) { hidden.web.url?.host == "example.com" && !hidden.web.isLoading }
    say(keptIn && offered.isEmpty, "a private tab hands nothing to apps")
    b.close(hidden)
    b.store.set("apps", false); _ = await visit(first, "https://example.org/"); offered = []
    await click(first, "https://example.com/")
    let off = await until(20) { first.web.url?.host == "example.com" && !first.web.isLoading }
    say(off && offered.isEmpty, "with the setting off, links stay in Sleek")
    b.store.set("apps", true)
    b.show(0); b.openInApp(); await nap(0.3)
    say(offered.last == first.address && first.address?.host == "example.com", "Open in App sends the page showing to its app")
    b.show(1)

    // ---------- passwords ----------
    let V = Vault.shared, who = "sam@sleek-check.example", secret = "Pw-" + UUID().uuidString.prefix(14), secret2 = "Pw2-" + UUID().uuidString.prefix(14)
    let g = b.newTab(isPrivate: false); g.atStart = false
    func signInPage(_ t: PhoneTab, _ host: String, signUp: Bool = false, scheme: String = "https") async {
      let boxes = signUp ? "<input id=u type=email autocomplete=username><input id=p type=password autocomplete=new-password><input id=p2 type=password autocomplete=new-password>" : "<input id=u type=text name=username><input id=p type=password>"
      let html = "<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width'><title>Sign in</title><style>body{font:16px system-ui;margin:60px 24px}input{display:block;width:100%;height:40px;margin:10px 0;font:inherit}</style><h1>\(signUp ? "Join" : "Sign in")</h1><form id=f onsubmit=\"event.preventDefault()\">\(boxes)<button id=go type=submit>Go</button></form>"
      t.atStart = false; t.web.loadSimulatedRequest(URLRequest(url: URL(string: "\(scheme)://\(host)/login")!), responseHTML: html)
      _ = await until(8) { (await self.js(t, "return !!document.getElementById('f') && document.readyState === 'complete' && location.host === '\(host)'")) as? Bool == true }; await nap(0.4)
    }
    func typeAndSend(_ t: PhoneTab, _ user: String, _ pass: String) async { _ = await self.js(t, "document.getElementById('u').value = '\(user)'; document.getElementById('p').value = '\(pass)'; document.getElementById('f').requestSubmit(); return 1"); await nap(0.6) }
    func focusBox(_ t: PhoneTab, _ id: String) async { _ = await self.js(t, "var e = document.getElementById('\(id)'); e.focus(); e.dispatchEvent(new FocusEvent('focusin', { bubbles: true })); return 1"); await nap(0.5) }
    func boxes(_ t: PhoneTab) async -> [String] { (await self.js(t, "return [].map.call(document.querySelectorAll('input'), function(i){ return i.value; })")) as? [String] ?? [] }
    await signInPage(g, "signin-test.example"); await typeAndSend(g, who, String(secret))
    say(b.keepAsk == SignInAsk(site: "signin-test.example", user: who, update: false) && V.count == 0, "signing in to a site, Sleek offers to keep the name and password")
    b.answerSignIn("save")
    let onDisk = (try? String(contentsOf: b.store.dir.appendingPathComponent("passwords.sleekvault"), encoding: .utf8)) ?? ""
    say(V.count == 1 && V.sites.contains("signin-test.example") && b.keepAsk == nil && onDisk.contains("\"sealed\"") && !onDisk.contains(String(secret)) && !onDisk.contains(who), "Save keeps it, and in the file neither the name nor the password can be read")
    await typeAndSend(g, who, String(secret))
    say(b.keepAsk == nil, "signing in again with the same password asks nothing")
    await signInPage(g, "signin-test.example"); await focusBox(g, "u")
    let offered1 = b.offer, login = offered1?.users.first?.id ?? ""
    say(offered1?.users.map(\.user) == [who] && offered1?.strong == "" && offered1?.tab == g.id, "with the cursor in a sign-in box, Sleek offers the saved name")
    V.testApproves = false; V.lock(); b.fillSignIn(login); await nap(0.8)
    var typed = await boxes(g)
    say(typed == ["", ""], "without Face ID, nothing is filled")
    V.testApproves = true; await focusBox(g, "p"); b.fillSignIn(login)
    let filled = await until(6) { await boxes(g) == [who, String(secret)] }
    say(filled && b.offer == nil, "with it, the name and the password go into their boxes")
    await typeAndSend(g, who, String(secret2))
    say(b.keepAsk == SignInAsk(site: "signin-test.example", user: who, update: true), "a different password for a saved name: Sleek offers to update it")
    b.answerSignIn("save")
    var updated = false; if case .same = V.have(site: "signin-test.example", user: who, password: String(secret2)) { updated = true }
    say(updated && V.count == 1, "and Update replaces it")
    await signInPage(g, "never-test.example"); await typeAndSend(g, "sam", "S-" + UUID().uuidString.prefix(12)); b.answerSignIn("never")
    await typeAndSend(g, "sam", "T-" + UUID().uuidString.prefix(12))
    say(b.keepAsk == nil && V.never.contains("never-test.example") && V.count == 1, "Never here: Sleek does not ask for that site again")
    await signInPage(g, "join-test.example", signUp: true); await focusBox(g, "p")
    let strong = b.offer?.strong ?? ""
    say(strong.count == 20 && Vault.strength(strong).verdict == "strong" && b.offer?.users.isEmpty == true, "joining a site, Sleek offers a strong password")
    b.fillSignIn(nil); _ = await until(5) { (await boxes(g)).suffix(2) == [strong, strong] }; typed = await boxes(g)
    _ = await js(g, "document.getElementById('u').value = 'new@sleek-check.example'; document.getElementById('f').requestSubmit(); return 1"); await nap(0.6)
    var keptNew = false; if case .same = V.have(site: "join-test.example", user: "new@sleek-check.example", password: strong) { keptNew = true }
    say(Array(typed.suffix(2)) == [strong, strong] && keptNew && b.keepAsk == nil && g.suggested == nil, "it goes into both password boxes, and is kept without asking once the site is sent it")
    await signInPage(g, "other-test.example"); b.fillSignIn(login); await nap(0.8); typed = await boxes(g)
    say(typed == ["", ""], "a saved password is never filled into another site")
    await signInPage(g, "plain-test.example", scheme: "http"); await focusBox(g, "p"); await typeAndSend(g, "sam", "U-" + UUID().uuidString.prefix(12))
    say(b.keepAsk == nil && b.offer == nil, "on a page whose connection others can read, Sleek neither offers nor keeps")
    b.store.set("savePasswords", false); await signInPage(g, "quiet-test.example"); await typeAndSend(g, "sam", "V-" + UUID().uuidString.prefix(12))
    say(b.keepAsk == nil, "with the offer switched off, Sleek does not ask")
    b.store.set("savePasswords", true)
    let pp = b.newTab(isPrivate: true); await signInPage(pp, "signin-test.example"); await focusBox(pp, "p")
    let privateOffer = b.offer?.users.map(\.user) == [who]
    await typeAndSend(pp, "someone-else", "W-" + UUID().uuidString.prefix(12))
    say(privateOffer && b.keepAsk == nil && V.count == 2, "a private tab can fill a saved sign-in, and is never asked to keep one")
    b.close(pp); b.close(g)
    V.ageOut()
    say(!V.isOpen && V.list() == nil && V.reveal(login) == nil, "the vault closes by itself when it has not been used, and then shows nothing")
    let reopened = await V.unlock("show your passwords"), listed = V.list() ?? []
    say(reopened && listed.count == 2 && V.reveal(login) == String(secret2), "the Passwords screen opens with Face ID, and lists what is kept")
    V.copy(String(secret2))
    let wasAdded = V.add(site: "https://www.weak-test.example/login", user: "sam", password: "password"), weak = V.list()?.first { ($0["site"] as? String) == "weak-test.example" }
    say(V.copied == String(secret2) && wasAdded && (weak?["verdict"] as? String) == "weak", "a password can be copied, one can be added by hand, and a weak one is marked")
    let changed = V.change(weak?["id"] as? String ?? "", user: "sam2", password: Vault.generate(words: true, length: 24)), after = V.list()?.first { ($0["site"] as? String) == "weak-test.example" }
    let wordy = Vault.generate(words: true, length: 24)
    say(changed && (after?["user"] as? String) == "sam2" && (after?["verdict"] as? String) == "strong" && wordy.split(separator: "-").count >= 5 && FileManager.default.fileExists(atPath: Res.root.appendingPathComponent("words.txt").path), "it can be changed for one Sleek makes of words, from the list inside the app")
    let came = V.bring(csv: "name,url,username,password\n\"Shop, the\",https://shop-test.example/login,\"a \"\"quoted\"\" name\",p1-long-enough\r\nplain,https://plain-shop.example,bob,p2-long-enough\nagain,https://signin-test.example,\(who),whatever\n")
    let gone = V.remove(after?["id"] as? String ?? "")
    say(came?.added == 2 && came?.here == 1 && gone && V.count == 4, "passwords come in from another browser's file, and one can be removed")

    // ---------- passkeys (a made-up site that exists only inside this check) ----------
    let keyPage = #"""
    <!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width'><title>Passkey test</title><h1>Passkey test</h1><input id=u autocomplete="username webauthn" style="width:90%;height:40px">
    <script>
    function enc(b){ var a = new Uint8Array(b), s = ''; for(var i = 0; i < a.length; i++) s += String.fromCharCode(a[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
    window.ch = crypto.getRandomValues(new Uint8Array(32));
    window.mk = function(){ window.made = null; navigator.credentials.create({ publicKey: { rp: { name: 'Passkey test' }, user: { id: new Uint8Array([1, 2, 3, 4]), name: 'maya@example.com', displayName: 'Maya' }, challenge: ch, pubKeyCredParams: [{ type: 'public-key', alg: -7 }] } })
      .then(function(c){ window.made = { id: c.id, inst: c instanceof PublicKeyCredential, cd: enc(c.response.clientDataJSON), pub: enc(c.response.getPublicKey()), alg: c.response.getPublicKeyAlgorithm() }; }, function(e){ window.made = { err: e.name }; }); };
    window.si = function(rp, quiet){ window.got = null; navigator.credentials.get({ mediation: quiet ? 'conditional' : undefined, publicKey: { challenge: ch, rpId: rp } })
      .then(function(c){ window.got = { id: c.id, cd: enc(c.response.clientDataJSON), ad: enc(c.response.authenticatorData), sig: enc(c.response.signature), uh: enc(c.response.userHandle) }; }, function(e){ window.got = { err: e.name }; }); };
    </script>
    """#
    let kt = b.newTab(isPrivate: false); kt.atStart = false
    func keySite(_ host: String) async {
      kt.web.loadSimulatedRequest(URLRequest(url: URL(string: "https://\(host)/account")!), responseHTML: keyPage)
      _ = await until(8) { (await self.js(kt, "return typeof window.mk === 'function' && document.readyState === 'complete' && location.host === '\(host)'")) as? Bool == true }; await nap(0.3)
    }
    func pageVal(_ name: String) async -> [String: Any] { (await self.js(kt, "return window.\(name) || null")) as? [String: Any] ?? [:] }
    V.testApproves = true
    await keySite("passkey-test.example")
    _ = await js(kt, "mk(); return 1"); _ = await until(4) { self.b.keyAsk != nil }
    say(b.keyAsk?.make == true && b.keyAsk?.user == "maya@example.com" && b.keyAsk?.site == "passkey-test.example", "a site asking to make a passkey: Sleek asks first, with the account and the site")
    b.answerPasskey(yes: true); _ = await until(6) { !(await pageVal("made")).isEmpty }
    let pkMade = await pageVal("made"), pkCD = (pkMade["cd"] as? String).flatMap(Passkeys.unb64u).flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] } ?? [:]
    say(pkMade["inst"] as? Bool == true && (pkMade["alg"] as? Int) == -7 && pkCD["origin"] as? String == "https://passkey-test.example" && pkCD["type"] as? String == "webauthn.create" && V.passkeys(for: "passkey-test.example").count == 1, "Make Passkey answers the page, for its own address, and keeps the passkey in the vault")
    func verifies(_ g: [String: Any]) -> Bool {
      guard let pub = (pkMade["pub"] as? String).flatMap(Passkeys.unb64u), let key = try? P256.Signing.PublicKey(derRepresentation: pub), let ad = (g["ad"] as? String).flatMap(Passkeys.unb64u),
            let cd = (g["cd"] as? String).flatMap(Passkeys.unb64u), let sd = (g["sig"] as? String).flatMap(Passkeys.unb64u), let sig = try? P256.Signing.ECDSASignature(derRepresentation: sd) else { return false }
      return key.isValidSignature(sig, for: ad + Data(SHA256.hash(data: cd))) && g["uh"] as? String == "AQIDBA"
    }
    _ = await js(kt, "si('passkey-test.example'); return 1"); _ = await until(4) { self.b.keyAsk != nil }
    let pkUsers = b.keyAsk?.users ?? []
    say(b.keyAsk?.make == false && pkUsers.map(\.user) == ["maya@example.com"], "signing in: Sleek offers the site's passkeys")
    b.answerPasskey(yes: true, id: pkUsers.first?.id); _ = await until(6) { !(await pageVal("got")).isEmpty }
    say(verifies(await pageVal("got")), "with Face ID, the page gets a signature the site can check with its public key")
    V.testApproves = false; V.lock()
    _ = await js(kt, "si('passkey-test.example'); return 1"); _ = await until(4) { self.b.keyAsk != nil }; b.answerPasskey(yes: true, id: pkUsers.first?.id); _ = await until(6) { !(await pageVal("got")).isEmpty }
    say((await pageVal("got"))["err"] as? String == "NotAllowedError", "without Face ID, the page gets nothing")
    V.testApproves = true
    _ = await js(kt, "si('passkey-test.example', true); return 1"); await nap(0.4); await focusBox(kt, "u")
    let quietKeys = b.offer?.keys ?? []
    say(quietKeys.map(\.user) == ["maya@example.com"] && b.keyAsk == nil, "a page waiting quietly: its passkey is offered beside the bar while the cursor is in its box")
    b.useQuietPasskey(quietKeys.first?.id ?? ""); _ = await until(6) { !(await pageVal("got")).isEmpty }
    say(verifies(await pageVal("got")), "and choosing it signs in")
    await keySite("other-test.example")
    _ = await js(kt, "si('passkey-test.example'); return 1"); _ = await until(4) { !(await pageVal("got")).isEmpty }
    say((await pageVal("got"))["err"] as? String == "SecurityError", "another site may not ask for this site's passkeys")
    let pkGone = V.removePasskey(pkUsers.first?.id ?? "")
    say(pkGone && V.passkeys(for: "passkey-test.example").isEmpty, "a passkey can be removed")
    b.close(kt)
    if let i = b.tabs.firstIndex(where: { $0 === s }) { b.show(i) }

    // ---------- the bar ----------
    b.placeBar(top: true)
    say(b.barAtTop && s.web.scrollView.contentInset.top == 62 && s.web.scrollView.contentInset.bottom == 0 && (b.store.settings["corner"] as? String) == "topTrailing", "the bar moves to the top, pages make room for it there, and the choice is kept")
    b.placeBar(top: false)
    say(!b.barAtTop && s.web.scrollView.contentInset.bottom == 62 && s.web.scrollView.contentInset.top == 0, "and back to the bottom")
    b.setCompact(true); let drawn = b.compact; b.show(0)
    say(drawn && !b.compact && b.tab === first, "the bar draws in, and opens out again when you change tab")

    // ---------- a page that cannot be reached, and real sites ----------
    _ = await visit(s, "https://no-such-site.invalid/"); b.show(1)
    let told = await until(15) { ((await self.js(s, "return document.title")) as? String ?? "").contains("Can’t open") }
    say(told, "a page that cannot be reached says so plainly")
    for address in ["https://en.m.wikipedia.org/wiki/Web_browser", "https://www.apple.com/", "https://www.bbc.com/news"] {
      let t = Date(), done = await visit(s, address), took = Date().timeIntervalSince(t); await nap(0.4)
      say(done && !s.title.isEmpty && s.blocking, "\(URL(string: address)!.host ?? address) arrives in \(String(format: "%.1f", took)) s with blocking on: “\(s.title.prefix(48))”")
    }

    print(failures == 0 ? "\nall passed (\(lines.count) checks)" : "\n\(failures) FAILED"); fflush(stdout)
    await nap(1.0); exit(failures == 0 ? 0 : 1)
  }
}

struct CheckView: View {
  @StateObject private var c = Checker()
  var body: some View {
    VStack(spacing: 0) {
      PageHolder(b: c.b).frame(maxHeight: .infinity)
      ScrollViewReader { reader in
        ScrollView {
          VStack(alignment: .leading, spacing: 6) {
            ForEach(Array(c.lines.enumerated()), id: \.offset) { i, line in
              HStack(alignment: .top, spacing: 8) { Image(systemName: line.ok ? "checkmark.circle.fill" : "xmark.circle.fill").foregroundStyle(line.ok ? .green : .red); Text(line.text).font(.footnote) }.id(i)
            }
          }.padding(12).frame(maxWidth: .infinity, alignment: .leading)
        }.frame(height: 260).background(Color(.secondarySystemBackground))
        .onChange(of: c.lines.count) { _, n in reader.scrollTo(n - 1) }
      }
    }
    .task { await c.run() }
  }
}
/// The tab showing, so its page is really on screen while it is checked.
struct PageHolder: View {
  @ObservedObject var b: Browser
  var body: some View { WebBox(web: b.tab.web).id(b.tab.id) }
}

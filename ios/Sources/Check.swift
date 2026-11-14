// Started plainly, the app is the browser. Started with `--prove` (./make.sh check), it checks itself:
// it drives the same model the screens draw (tabs, Private Browsing, blocking, bookmarks, history, your
// Sleek work, Save to Sleek, the bar), says each thing it finds on screen and in the console, and quits.
// While it checks, nothing of yours is touched: settings go to a throwaway folder and pages keep nothing.
import SwiftUI
import WebKit

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

    // ---------- your Sleek work ----------
    b.addTask("Checked on the phone")
    let added = await until(10) { self.b.day.today.contains { $0.title == "Checked on the phone" } }
    say(added, "a task added from the app is in today's tasks")
    if let t = b.day.today.first(where: { $0.title == "Checked on the phone" }) { b.tick(t) }
    let ticked = await until(10) { self.b.day.done.contains { $0.title == "Checked on the phone" } }
    say(ticked, "and can be ticked off")
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

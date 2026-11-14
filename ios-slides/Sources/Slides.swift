// Sleek Slides for iPhone.
//
//   Nobody arranges boxes on a slide with a thumb. So on the phone you edit the words, and the slide,
//   always in view above them, lays itself out. The slide is the very slide Sleek Slides shows on the web
//   (the same page draws it, so a deck is the same everywhere), with the web's own bars taken away and
//   native ones in their place: the words of the slide as fields, its speaker notes, the layouts to add.
//   Present puts the slide, what comes next, your notes and a clock in your hand; turn the phone on its
//   side and the slide fills the screen. Anything the fields cannot do, "Edit on the slide" still can.
//
//   Library   your decks, read through the app's door to the decks' own storage (Work.swift)
//   Deck      one open deck: the web page inside (Host.swift), the slide showing, and what can be done to it
import SwiftUI
import WebKit

struct DeckRec: Identifiable, Hashable { let id: String, title: String, updated: Double, slides: Int, mode: String, accent: String, over: String, head: String, thumb: String }

@MainActor
final class Library: ObservableObject {
  @Published var decks: [DeckRec] = []
  @Published var ready = false
  private var W: Work { Work.shared }
  func start() {
    W.folder = Res.support.appendingPathComponent("Work")
    W.onChange.append { [weak self] in Task { @MainActor in await self?.refresh() } }
    W.start()
    Timer.scheduledTimer(withTimeInterval: 120, repeats: true) { _ in Task { @MainActor in await Work.shared.keepCopy() } }
  }
  func refresh() async {
    guard W.ready else { return }
    let raw = await W.ask("return (await SleekStore.list()).map(function(d){ var t = d.theme || {}, c = d.cover || {}; return { id: d.id, title: d.title || 'Untitled deck', updated: d.updated || 0, slides: d.slides || 0, mode: t.mode || 'dark', accent: t.accent || '#7C5CFF', over: c.k || '', head: c.h || '', thumb: d.thumb || '' }; })") as? [[String: Any]] ?? []
    let d = raw.map { DeckRec(id: $0["id"] as? String ?? "", title: $0["title"] as? String ?? "", updated: ($0["updated"] as? NSNumber)?.doubleValue ?? 0, slides: ($0["slides"] as? NSNumber)?.intValue ?? 0, mode: $0["mode"] as? String ?? "dark", accent: $0["accent"] as? String ?? "#7C5CFF", over: $0["over"] as? String ?? "", head: $0["head"] as? String ?? "", thumb: $0["thumb"] as? String ?? "") }
    withAnimation(.spring(response: 0.4, dampingFraction: 0.86)) { decks = d; ready = true }
  }
  /// A new deck, as the web's own start does it: a title slide with its name on, and a slide of points to write on.
  func create(title: String, mode: String, accent: String) async -> String? {
    let name = title.trimmingCharacters(in: .whitespaces)
    let id = await W.ask("""
      var S = SleekStore, a = S.uid(), b = S.uid(), text = {}, d = document.createElement('div'); d.textContent = title; if(title) text[a + '.t1'] = d.innerHTML;
      var seed = { theme: { mode: mode, accent: accent, glow: 'aurora', glowColor: 'dusk', motion: 'on', fx: 'none' }, added: [{ id: a, t: 'title', name: 'Title' }, { id: b, t: 'bullets', name: 'Bullets' }], text: text };
      var made = await S.create({ title: title || 'Untitled deck', seed: seed, cover: { k: '', h: title || 'Untitled deck' } }); return made.id;
      """, ["title": name, "mode": mode, "accent": accent]) as? String
    await refresh(); return id
  }
  func addSample() async -> String? { let id = await W.ask("if(!window.SLEEK_SAMPLE) await new Promise(function(ok, no){ var s = document.createElement('script'); s.src = 'data/sample.js'; s.onload = ok; s.onerror = no; document.head.appendChild(s); }); var d = await SleekStore.addSample(); return d && d.id") as? String; await refresh(); return id ?? decks.first?.id }
  func remove(_ id: String) async { _ = await W.ask("await SleekStore.remove(id); return 1", ["id": id]); await refresh(); W.keepCopySoon() }
  func duplicate(_ id: String) async { _ = await W.ask("await SleekStore.duplicate(id); return 1", ["id": id]); await refresh() }
  func rename(_ id: String, _ title: String) async { let t = title.trimmingCharacters(in: .whitespaces); if t.isEmpty { return }; _ = await W.ask("await SleekStore.rename(id, title); return 1", ["id": id, "title": t]); await refresh() }
  /// A deck as a .sleek file's text, with its pictures inside.
  func file(_ id: String) async -> String? { await W.ask("return await SleekStore.exportDeck(id)", ["id": id]) as? String }
  func bring(_ url: URL) async -> String {
    let mine = url.startAccessingSecurityScopedResource(); defer { if mine { url.stopAccessingSecurityScopedResource() } }
    let r = await W.bring([url]); await refresh()
    return r.decks > 0 ? "Brought in \(r.decks) deck\(r.decks == 1 ? "" : "s")" : r.here > 0 ? "That deck is already here" : r.pages + r.boards > 0 ? "That file is not a deck (it has been kept all the same)" : "That is not a Sleek file"
  }
}

/// One piece of a slide's words: its title, a point, a caption.
struct Field: Identifiable, Equatable { let id: String, role: String; var text: String; let shown: Bool }
struct Layout: Identifiable { let id: String, name: String, about: String }

@MainActor
final class Deck: ObservableObject {
  let host: Host
  @Published var id = ""
  @Published var ready = false
  @Published var at = 0
  @Published var count = 0
  @Published var labels: [String] = []
  @Published var notes = ""
  @Published var fields: [Field] = []
  @Published var mode = "dark"
  @Published var accent = "#7C5CFF"
  @Published var grid = false          // All slides is open, in the page
  @Published var full = false          // editing on the slide itself, with the web's own bars
  var onChanged: (() -> Void)?
  private var want: Int?

  /// The web page's own bars are hidden (until "Edit on the slide" asks for them back).
  static let css = "html.in-app:not(.in-app-full) #bar, html.in-app:not(.in-app-full) #editbar, html.in-app:not(.in-app-full) #notes, html.in-app:not(.in-app-full) #filebtn, html.in-app:not(.in-app-full) .df-pop, html.in-app:not(.in-app-full) .vw-wrap, html.in-app:not(.in-app-full) #morebtn, html.in-app:not(.in-app-full) .tray, html.in-app:not(.in-app-full) .zone, html.in-app .deck-back, html.in-app .et-card, html.in-app .et-ring, html.in-app:not(.in-app-full) .hold-ring { display: none !important; }"
  /// The web's own first-visit tour is for the web's own bars.
  static let early = "try { localStorage.setItem('sleek-tips', 'off'); localStorage.removeItem('sleek-tour'); } catch(e){}"
  /// Tells the app which slide is showing, its words and notes, and takes new words and notes from the app.
  static let script = """
  (function(){
    var post = function(m){ try { webkit.messageHandlers.sleekHost.postMessage(m); } catch(e){} };
    function plain(html){ var d = document.createElement('div'); d.innerHTML = String(html || '').replace(/<br\\s*\\/?>/gi, '\\n').replace(/<\\/(p|div|li)>/gi, '\\n'); return (d.textContent || '').replace(/\\n{3,}/g, '\\n\\n').trim(); }
    function html(v){ var d = document.createElement('div'); d.textContent = v; return d.innerHTML.replace(/\\n/g, '<br>'); }
    var ROLES = [['overline', 'Small line above'], ['display', 'Title'], ['lead', 'Line beneath'], ['one', 'Statement'], ['section-no', 'Number'], ['body', 'Text'], ['lbl', 'Label'], ['lh', 'Heading'], ['cap', 'Caption'], ['meta', 'Small print']];
    function role(el){ var c = ' ' + (el.className || '') + ' '; for(var i = 0; i < ROLES.length; i++) if(c.indexOf(' ' + ROLES[i][0] + ' ') >= 0) return ROLES[i][1]; if(el.tagName === 'LI') return 'Point'; if(el.closest && el.closest('.card-item')) return 'Card'; return 'Text'; }
    function fields(){
      var s = Deck.current(), out = []; if(!s) return out;
      [].forEach.call(s.querySelectorAll('[data-eid]'), function(el){ if(el.innerHTML === '<!--removed-->') return; var r = el.getBoundingClientRect(); out.push({ id: el.getAttribute('data-eid'), role: role(el), text: plain(el.innerHTML), shown: r.width > 0 && r.height > 0 }); });
      return out;
    }
    function tell(){ var s = Deck.current(); post({ slide: { at: Deck.index(), count: Deck.count(), labels: Deck.labels(), notes: plain(s && s._notes), fields: fields(), mode: DeckTheme.get('mode') || 'dark', accent: DeckTheme.get('accent') || '', id: (window.SLEEK_DECK || {}).id || '' } }); }
    window.__sleekTell = tell;
    window.__sleekSet = function(id, v){ var el = Deck.stage.querySelector('[data-eid="' + id + '"]'); if(!el) return false; el.innerHTML = html(v); el.dispatchEvent(new Event('input', { bubbles: true })); return true; };
    window.__sleekNote = function(v){ Deck.setNote(html(v)); };
    var t = setInterval(function(){
      if(!window.Deck || !Deck.count || !Deck.current() || document.documentElement.classList.contains('booting')) return; clearInterval(t);
      Deck.onShow.push(function(){ setTimeout(tell, 0); });
      new MutationObserver(function(){ post({ grid: document.body.classList.contains('grid-open') }); }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
      post({ ready: 1 }); tell();
    }, 50);
  })();
  """
  init() {
    host = Host(css: Deck.css, script: Deck.script, early: Deck.early)
    host.web.scrollView.isScrollEnabled = false; host.web.scrollView.bounces = false
    host.onSay = { [weak self] m in self?.heard(m) }
  }
  private func heard(_ m: [String: Any]) {
    if m["ready"] != nil { if let k = want { want = nil; host.tell("Deck.go(k)", ["k": k]) }; if full { host.tell("document.documentElement.classList.add('in-app-full'); Deck.refit(); Deck.edit(true);") } }
    if let g = m["grid"] as? Bool, g != grid { withAnimation(.spring(response: 0.45, dampingFraction: 0.86)) { grid = g } }
    guard let s = m["slide"] as? [String: Any] else { return }
    let f = (s["fields"] as? [[String: Any]] ?? []).map { Field(id: $0["id"] as? String ?? "", role: $0["role"] as? String ?? "Text", text: $0["text"] as? String ?? "", shown: $0["shown"] as? Bool ?? true) }
    let k = (s["at"] as? NSNumber)?.intValue ?? 0, n = (s["count"] as? NSNumber)?.intValue ?? 0
    if n != count && count != 0 { onChanged?() }
    withAnimation(.spring(response: 0.35, dampingFraction: 0.86)) { at = k; count = n; labels = s["labels"] as? [String] ?? []; notes = s["notes"] as? String ?? ""; fields = f; mode = s["mode"] as? String ?? "dark"; if let a = s["accent"] as? String, !a.isEmpty { accent = a }; id = s["id"] as? String ?? id; ready = true }
  }
  func open(_ id: String) { ready = false; count = 0; fields = []; grid = false; full = false; host.open("sleek://app/deck.html?d=" + id) }
  func go(_ k: Int) { guard k >= 0, k < count, k != at else { tap(.rigid); return }; tap(.medium); host.tell("Deck.go(k)", ["k": k]) }
  /// New words for one piece of the slide showing: the slide changes as you type, and the deck saves itself.
  func set(_ field: String, _ text: String) { if let i = fields.firstIndex(where: { $0.id == field }) { fields[i].text = text }; host.tell("window.__sleekSet(id, v)", ["id": field, "v": text]) }
  func setNotes(_ text: String) { notes = text; host.tell("window.__sleekNote(v)", ["v": text]) }
  func layouts() async -> [Layout] { ((await host.js("return Deck.templates()")) as? [[String: Any]] ?? []).map { Layout(id: $0["key"] as? String ?? "", name: $0["name"] as? String ?? "", about: $0["desc"] as? String ?? "") } }
  /// A new slide after the one showing. The page saves, loads again, and opens on it.
  func add(_ layout: String) { tap(.medium); want = at + 1; host.tell("Deck.addSlide(key, at); setTimeout(function(){ location.reload(); }, 500);", ["key": layout, "at": at + 1]) }
  func duplicate() { tap(.medium); want = at + 1; host.tell("Deck.act('dup')") }
  func delete() { guard count > 1 else { return }; tap(.medium); want = max(0, at - 1); host.tell("Deck.act('del')") }
  func undo(_ dir: Int) { tap(); want = at; host.tell("Deck.step(d)", ["d": dir]) }
  func allSlides(_ on: Bool) { tap(); host.tell(on ? "Deck.openGrid()" : "Deck.closeGrid()") }
  /// Editing on the slide itself, with the web's own bars: for what the fields cannot do (pictures, moving things).
  func onSlide(_ on: Bool) { tap(.medium); withAnimation(.spring(response: 0.45, dampingFraction: 0.86)) { full = on }; host.tell(on ? "document.documentElement.classList.add('in-app-full'); Deck.refit(); Deck.edit(true);" : "Deck.edit(false); Deck.flush(); document.documentElement.classList.remove('in-app-full'); Deck.refit(); window.__sleekTell();") }
  func look(_ key: String, _ value: String) { tap(); host.tell("DeckTheme.set(k, v); DeckTheme.paint(); Deck.flush(); window.__sleekTell();", ["k": key, "v": value]) }
  func flush() { host.tell("window.Deck && Deck.flush && Deck.flush()") }
  func refit() { host.tell("window.Deck && Deck.refit && Deck.refit()") }
}

// ---------- the app ----------
struct SlidesRoot: View {
  @StateObject private var lib = Library()
  @StateObject private var shell = Shell()
  @StateObject private var deck = Deck()
  @Environment(\.scenePhase) private var phase
  var body: some View {
    NavigationStack { LibraryView(lib: lib, deck: deck, shell: shell) }
      .tint(.slides).modifier(Toast(shell: shell))
      .onAppear { lib.start() }
      .onChange(of: phase) { _, now in if now != .active { deck.flush(); Task { await Work.shared.keepCopy() } } else { Task { await lib.refresh() } } }
      .onOpenURL { url in Task { shell.say(await lib.bring(url)) } }
  }
}

/// A deck's cover, drawn from its look and its name (the web keeps no picture of a deck's first slide).
struct Cover: View {
  let d: DeckRec
  var body: some View {
    GeometryReader { g in
      let u = g.size.width / 100, c = Color(hex: d.accent), dark = d.mode != "light", ink: Color = dark ? .white : Color(hex: "#15151B")
      ZStack(alignment: .bottomLeading) {
        dark ? Color(hex: "#0F0F16") : Color(hex: "#F6F5FA")
        Circle().fill(c.opacity(dark ? 0.55 : 0.35)).frame(width: 60 * u).blur(radius: 14 * u).offset(x: 62 * u, y: -52 * u)
        Circle().fill(Color.sleekC.opacity(dark ? 0.22 : 0.18)).frame(width: 40 * u).blur(radius: 12 * u).offset(x: -12 * u, y: 12 * u)
        if d.thumb.hasPrefix("data:"), let comma = d.thumb.firstIndex(of: ","), let data = Data(base64Encoded: String(d.thumb[d.thumb.index(after: comma)...])), let img = UIImage(data: data) { Image(uiImage: img).resizable().scaledToFill().frame(width: g.size.width, height: g.size.height).clipped() }
        else {
          VStack(alignment: .leading, spacing: 2.2 * u) {
            Capsule().fill(c).frame(width: 9 * u, height: 1.1 * u)
            if !d.over.isEmpty { Text(d.over).font(.system(size: 3.4 * u, weight: .semibold)).foregroundStyle(ink.opacity(0.65)).lineLimit(1) }
            Text(d.head.isEmpty ? d.title : d.head).font(.system(size: 10 * u, weight: .bold)).tracking(-0.3 * u).foregroundStyle(ink).lineLimit(2).minimumScaleFactor(0.5)
          }.padding(8 * u)
        }
      }.clipShape(RoundedRectangle(cornerRadius: 3.2 * u, style: .continuous))
    }.aspectRatio(16 / 9, contentMode: .fit)
  }
}

struct LibraryView: View {
  @ObservedObject var lib: Library; @ObservedObject var deck: Deck; @ObservedObject var shell: Shell
  @State private var open: String?
  @State private var making = false
  @State private var bringing = false
  @State private var renaming: DeckRec?
  @State private var name = ""
  @State private var sharing: URL?
  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 22) {
        HStack(alignment: .firstTextBaseline) {
          Text("Slides").font(.system(size: 40, weight: .bold)).tracking(-1.2)
          Spacer()
          Menu {
            Button { making = true } label: { Label("New Deck", systemImage: "plus") }
            Button { Task { if let id = await lib.addSample() { open = id } } } label: { Label("Add the Sample Deck", systemImage: "sparkles.rectangle.stack") }
            Button { bringing = true } label: { Label("Bring In a Deck…", systemImage: "square.and.arrow.down") }
          } label: { Image(systemName: "ellipsis").font(.system(size: 17, weight: .semibold)).frame(width: 40, height: 40).background(Color.primary.opacity(0.07), in: Circle()) }.foregroundStyle(.primary)
        }
        if lib.ready && lib.decks.isEmpty {
          VStack(spacing: 10) {
            Image(systemName: "rectangle.on.rectangle").font(.system(size: 30)).foregroundStyle(.secondary)
            Text("No decks yet").font(.system(size: 19, weight: .semibold))
            Text("Start one of your own, or look around the sample deck first.").font(.system(size: 15)).foregroundStyle(.secondary).multilineTextAlignment(.center)
            Button { Task { if let id = await lib.addSample() { open = id } } } label: { Text("Open the sample deck").font(.system(size: 16, weight: .semibold)).padding(.horizontal, 20).frame(height: 46).background(Color.slides.opacity(0.12), in: Capsule()) }.buttonStyle(Press()).padding(.top, 6)
          }.frame(maxWidth: .infinity).padding(.top, 60)
        }
        ForEach(lib.decks) { d in
          Button { tap(); open = d.id } label: {
            VStack(alignment: .leading, spacing: 10) {
              Cover(d: d).shadow(color: Color(hex: d.accent).opacity(0.35), radius: 18, y: 10)
              HStack { Text(d.title).font(.system(size: 18, weight: .bold)).foregroundStyle(.primary).lineLimit(1); Spacer(); Text(ago(d.updated)).font(.system(size: 13)).foregroundStyle(.tertiary) }.padding(.horizontal, 4)
            }
          }.buttonStyle(Press())
          .contextMenu {
            Button { name = d.title; renaming = d } label: { Label("Rename", systemImage: "pencil") }
            Button { Task { await lib.duplicate(d.id) } } label: { Label("Duplicate", systemImage: "plus.square.on.square") }
            Button { Task { if let t = await lib.file(d.id) { sharing = temp(d.title + ".sleek", t) } } } label: { Label("Send a Copy…", systemImage: "square.and.arrow.up") }
            Button(role: .destructive) { Task { await lib.remove(d.id); shell.say("Deck deleted") } } label: { Label("Delete", systemImage: "trash") }
          }
        }
      }.padding(.horizontal, 22).padding(.bottom, 110)
    }
    .background(alignment: .top) { Bloom(c: .slides) }
    .overlay(alignment: .bottomTrailing) {
      Button { tap(.medium); making = true } label: { Image(systemName: "plus").font(.system(size: 24, weight: .semibold)).foregroundStyle(.white).frame(width: 62, height: 62).background(Color.slides, in: Circle()).shadow(color: Color.slides.opacity(0.5), radius: 16, y: 8) }.buttonStyle(Press()).padding(22)
    }
    .navigationDestination(item: $open) { id in DeckScreen(deck: deck, lib: lib, shell: shell, id: id) }
    .sheet(isPresented: $making) { NewDeck { title, mode, accent in making = false; Task { if let id = await lib.create(title: title, mode: mode, accent: accent) { open = id } } }.presentationDetents([.height(420)]).presentationCornerRadius(30).presentationBackground(.regularMaterial) }
    .alert("Rename deck", isPresented: Binding(get: { renaming != nil }, set: { if !$0 { renaming = nil } })) { TextField("Its name", text: $name); Button("Cancel", role: .cancel) {}; Button("Save") { if let d = renaming { Task { await lib.rename(d.id, name) } } } }
    .fileImporter(isPresented: $bringing, allowedContentTypes: [.sleek, .json, .data]) { r in if case .success(let u) = r { Task { shell.say(await lib.bring(u)) } } }
    .sheet(item: $sharing) { u in ShareItems(items: [u]).presentationDetents([.medium, .large]) }
    .onAppear { Task { await lib.refresh() }; if Res.arg("--open") == "first", open == nil, let f = lib.decks.first { open = f.id } }
    .onChange(of: lib.ready) { _, _ in if Res.arg("--open") == "first", open == nil, let f = lib.decks.first { open = f.id } }
  }
}
extension URL: @retroactive Identifiable { public var id: String { absoluteString } }
func temp(_ name: String, _ text: String) -> URL {
  let safe = name.replacingOccurrences(of: "/", with: "-").replacingOccurrences(of: ":", with: "-"), u = FileManager.default.temporaryDirectory.appendingPathComponent(safe.isEmpty ? "Deck.sleek" : safe)
  try? Data(text.utf8).write(to: u, options: .atomic); return u
}
let accents = [("#7C5CFF", "Violet"), ("#0A84FF", "Blue"), ("#12A36A", "Green"), ("#F0642D", "Orange"), ("#E0457B", "Pink"), ("#C2A21E", "Gold")]

/// A new deck: its name, light or dark, and its colour.
struct NewDeck: View {
  let make: (String, String, String) -> Void
  @State private var title = ""
  @State private var mode = "dark"
  @State private var accent = "#7C5CFF"
  @FocusState private var typing: Bool
  var body: some View {
    VStack(alignment: .leading, spacing: 16) {
      Text("New deck").font(.system(size: 26, weight: .bold)).tracking(-0.6)
      Cover(d: DeckRec(id: "", title: title.isEmpty ? "Your title" : title, updated: 0, slides: 2, mode: mode, accent: accent, over: "", head: "", thumb: "")).frame(height: 120).frame(maxWidth: .infinity).animation(.spring(response: 0.4, dampingFraction: 0.8), value: accent + mode)
      TextField("What is it called?", text: $title).font(.system(size: 18, weight: .medium)).focused($typing).submitLabel(.done).padding(.horizontal, 16).frame(height: 50).background(Color(.systemBackground).opacity(0.8), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
      HStack(spacing: 12) {
        Picker("", selection: $mode) { Text("Dark").tag("dark"); Text("Light").tag("light") }.pickerStyle(.segmented).frame(width: 150)
        Spacer()
        ForEach(accents, id: \.0) { a in Button { tap(); accent = a.0 } label: { Circle().fill(Color(hex: a.0)).frame(width: 26, height: 26).overlay(Circle().stroke(Color.primary, lineWidth: accent == a.0 ? 2 : 0).padding(-3)) }.buttonStyle(Press()) }
      }
      Button { tap(.medium); make(title, mode, accent) } label: { Text("Make it").font(.system(size: 17, weight: .semibold)).foregroundStyle(.white).frame(maxWidth: .infinity).frame(height: 52).background(Color(hex: accent), in: Capsule()).shadow(color: Color(hex: accent).opacity(0.4), radius: 14, y: 6) }.buttonStyle(Press())
      Spacer(minLength: 0)
    }.padding(.horizontal, 22).padding(.top, 26).onAppear { typing = true }
  }
}

// ---------- one deck ----------
struct DeckScreen: View {
  @ObservedObject var deck: Deck; @ObservedObject var lib: Library; @ObservedObject var shell: Shell
  let id: String
  @State private var presenting = Res.arg("--present") != nil
  @State private var began = Date()
  @State private var adding: [Layout]?
  @State private var sharing: URL?
  @State private var sure = false
  @FocusState private var typing: String?
  var body: some View {
    let c = Color(hex: deck.accent)
    GeometryReader { g in
      let wide = g.size.width > g.size.height, big = wide || deck.grid || deck.full
      VStack(spacing: 0) {
        if presenting && !big { presenterTop }
        HostView(host: deck.host).opacity(deck.ready ? 1 : 0)
          .frame(height: big ? nil : (g.size.width - (presenting ? 24 : 0)) * 9 / 16).frame(maxHeight: big ? .infinity : nil)
          .clipShape(RoundedRectangle(cornerRadius: big ? 0 : 14, style: .continuous)).padding(.horizontal, big || !presenting ? 0 : 12)
          .overlay { if !deck.ready { ProgressView() } }
          .overlay { if presenting && wide { HStack(spacing: 0) { Color.clear.contentShape(Rectangle()).onTapGesture { deck.go(deck.at - 1) }; Color.clear.contentShape(Rectangle()).onTapGesture { deck.go(deck.at + 1) } } } }
          .overlay(alignment: .topLeading) { if presenting && wide { Button { stop() } label: { Image(systemName: "xmark").font(.system(size: 13, weight: .bold)).foregroundStyle(.white).frame(width: 34, height: 34).background(Color.black.opacity(0.4), in: Circle()) }.padding(14) } }
          .overlay(alignment: .top) { if deck.full && !wide { Button { deck.onSlide(false) } label: { Label("Done editing on the slide", systemImage: "checkmark").font(.system(size: 15, weight: .semibold)).padding(.horizontal, 16).frame(height: 40).modifier(Glass(shape: Capsule())) }.foregroundStyle(.primary).padding(.top, 8) } }
        if !big { if presenting { presenterBottom(c) } else { editor(c) } }
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      .background(presenting || wide ? Color.black : Color(.systemBackground))
      .onChange(of: g.size) { _, _ in DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) { deck.refit() } }
    }
    .ignoresSafeArea(.keyboard)
    .navigationTitle(lib.decks.first { $0.id == id }?.title ?? "").navigationBarTitleDisplayMode(.inline)
    .toolbar(presenting || deck.full ? .hidden : .visible, for: .navigationBar)
    .statusBarHidden(presenting).persistentSystemOverlays(presenting ? .hidden : .automatic)
    .toolbar {
      ToolbarItemGroup(placement: .topBarTrailing) {
        Menu {
          Picker("Look", selection: Binding(get: { deck.mode }, set: { deck.look("mode", $0) })) { Label("Dark", systemImage: "moon").tag("dark"); Label("Light", systemImage: "sun.max").tag("light") }
          Picker("Colour", selection: Binding(get: { deck.accent.uppercased() }, set: { deck.look("accent", $0) })) { ForEach(accents, id: \.0) { Text($0.1).tag($0.0) } }
        } label: { Image(systemName: "paintpalette") }
        Menu {
          Button { deck.onSlide(true) } label: { Label("Edit on the Slide", systemImage: "hand.tap") }
          Button { deck.undo(-1) } label: { Label("Undo", systemImage: "arrow.uturn.backward") }
          Button { deck.undo(1) } label: { Label("Redo", systemImage: "arrow.uturn.forward") }
          Divider()
          Button { deck.duplicate() } label: { Label("Duplicate This Slide", systemImage: "plus.square.on.square") }
          Button(role: .destructive) { sure = true } label: { Label("Delete This Slide", systemImage: "trash") }.disabled(deck.count < 2)
          Divider()
          Button { Task { deck.flush(); try? await Task.sleep(nanoseconds: 400_000_000); if let t = await lib.file(id) { sharing = temp((lib.decks.first { $0.id == id }?.title ?? "Deck") + ".sleek", t) } } } label: { Label("Send a Copy…", systemImage: "square.and.arrow.up") }
        } label: { Image(systemName: "ellipsis.circle") }
      }
    }
    .sheet(item: Binding(get: { adding.map { Layouts(list: $0) } }, set: { if $0 == nil { adding = nil } })) { l in
      ScrollView { VStack(alignment: .leading, spacing: 10) {
        Text("Add a slide").font(.system(size: 22, weight: .bold)).tracking(-0.4).padding(.bottom, 4)
        ForEach(l.list) { x in Button { adding = nil; deck.add(x.id) } label: { VStack(alignment: .leading, spacing: 2) { Text(x.name).font(.system(size: 17, weight: .semibold)).foregroundStyle(.primary); if !x.about.isEmpty { Text(x.about).font(.system(size: 13)).foregroundStyle(.secondary).multilineTextAlignment(.leading) } }.padding(14).frame(maxWidth: .infinity, alignment: .leading).background(Color(.systemBackground).opacity(0.8), in: RoundedRectangle(cornerRadius: 16, style: .continuous)) }.buttonStyle(Press()) }
      }.padding(.horizontal, 22).padding(.top, 26).padding(.bottom, 30) }.presentationDetents([.medium, .large]).presentationCornerRadius(30).presentationBackground(.regularMaterial)
    }
    .sheet(item: $sharing) { u in ShareItems(items: [u]).presentationDetents([.medium, .large]) }
    .confirmationDialog("Delete this slide?", isPresented: $sure, titleVisibility: .visible) { Button("Delete Slide", role: .destructive) { deck.delete() } }
    .onAppear { deck.onChanged = { Task { await lib.refresh(); Work.shared.keepCopySoon() } }; if deck.id != id || !deck.ready { deck.open(id) } }
    .onDisappear { deck.flush(); DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { Task { await lib.refresh(); Work.shared.keepCopySoon() } } }
  }
  struct Layouts: Identifiable { let list: [Layout]; var id: Int { list.count } }
  private func stop() { tap(); withAnimation(.spring(response: 0.45, dampingFraction: 0.86)) { presenting = false } }
  private func label(_ k: Int) -> String { k >= 0 && k < deck.labels.count ? deck.labels[k] : "" }

  /// Under the slide: where you are, the slide's words as fields, its notes, and Present.
  private func editor(_ c: Color) -> some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 16) {
        HStack(spacing: 6) {
          Button { deck.go(deck.at - 1) } label: { Image(systemName: "chevron.left").font(.system(size: 15, weight: .bold)).frame(width: 40, height: 40).background(Color.primary.opacity(0.07), in: Circle()) }.opacity(deck.at == 0 ? 0.35 : 1)
          VStack(spacing: 1) { Text(label(deck.at)).font(.system(size: 15, weight: .semibold)).lineLimit(1); Text("\(deck.at + 1) of \(deck.count)").font(.system(size: 12, design: .rounded)).foregroundStyle(.secondary) }.frame(maxWidth: .infinity)
          Button { deck.go(deck.at + 1) } label: { Image(systemName: "chevron.right").font(.system(size: 15, weight: .bold)).frame(width: 40, height: 40).background(Color.primary.opacity(0.07), in: Circle()) }.opacity(deck.at + 1 >= deck.count ? 0.35 : 1)
        }.foregroundStyle(.primary).padding(.horizontal, 20)
        let shown = deck.fields.filter { $0.shown }
        if !shown.isEmpty {
          group("Words on this slide") {
            ForEach(Array(shown.enumerated()), id: \.element.id) { n, f in
              VStack(alignment: .leading, spacing: 3) {
                Text(f.role).font(.system(size: 12, weight: .medium)).foregroundStyle(c)
                TextField(f.role, text: Binding(get: { deck.fields.first { $0.id == f.id }?.text ?? "" }, set: { deck.set(f.id, $0) }), axis: .vertical).font(.system(size: f.role == "Title" || f.role == "Statement" ? 18 : 16, weight: f.role == "Title" || f.role == "Statement" ? .semibold : .regular)).focused($typing, equals: f.id)
              }
              if n < shown.count - 1 { Divider() }
            }
          }
        } else if deck.ready { Text("This slide has no words to change here. Its pictures and the rest change with Edit on the Slide, in the ⋯ menu.").font(.system(size: 14)).foregroundStyle(.secondary).padding(.horizontal, 26) }
        group("Speaker notes") { TextField("What you will say", text: Binding(get: { deck.notes }, set: { deck.setNotes($0) }), axis: .vertical).lineLimit(3...).font(.system(size: 16)).focused($typing, equals: "notes") }
        Color.clear.frame(height: 90)
      }.padding(.top, 12)
    }
    .scrollDismissesKeyboard(.interactively)
    .safeAreaInset(edge: .bottom) {
      HStack(spacing: 10) {
        Button { Task { adding = await deck.layouts() } } label: { Image(systemName: "plus").font(.system(size: 19, weight: .semibold)).frame(width: 54, height: 54).modifier(Glass(shape: Circle())) }.foregroundStyle(.primary)
        Button { tap(.medium); typing = nil; began = Date(); withAnimation(.spring(response: 0.5, dampingFraction: 0.86)) { presenting = true } } label: { HStack(spacing: 8) { Image(systemName: "play.fill"); Text("Present") }.font(.system(size: 17, weight: .semibold)).foregroundStyle(.white).frame(maxWidth: .infinity).frame(height: 54).background(c, in: Capsule()).shadow(color: c.opacity(0.45), radius: 16, y: 8) }.buttonStyle(Press())
        Button { deck.allSlides(true) } label: { Image(systemName: "square.grid.2x2").font(.system(size: 18, weight: .semibold)).frame(width: 54, height: 54).modifier(Glass(shape: Circle())) }.foregroundStyle(.primary)
      }.padding(.horizontal, 16).padding(.bottom, 8)
    }
  }
  private func group<V: View>(_ name: String, @ViewBuilder _ v: () -> V) -> some View {
    VStack(alignment: .leading, spacing: 8) {
      Text(name.uppercased()).font(.system(size: 12, weight: .semibold)).tracking(1.4).foregroundStyle(.secondary).padding(.horizontal, 6)
      VStack(alignment: .leading, spacing: 12) { v() }.padding(16).frame(maxWidth: .infinity, alignment: .leading).background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }.padding(.horizontal, 20)
  }

  // ---------- presenting, upright: the slide, what is next, your notes, a clock, and Next under your thumb ----------
  private var presenterTop: some View {
    HStack {
      Button { stop() } label: { Image(systemName: "xmark").font(.system(size: 15, weight: .bold)).foregroundStyle(.white).frame(width: 40, height: 40).background(Color.white.opacity(0.14), in: Circle()) }
      Spacer()
      TimelineView(.periodic(from: began, by: 1)) { t in let s = max(0, Int(t.date.timeIntervalSince(began))); Text(String(format: "%d:%02d", s / 60, s % 60)).font(.system(size: 20, weight: .semibold, design: .rounded)).monospacedDigit().foregroundStyle(.white) }
      Spacer()
      Text("\(deck.at + 1) of \(deck.count)").font(.system(size: 15, weight: .medium, design: .rounded)).foregroundStyle(.white.opacity(0.6)).frame(width: 64, alignment: .trailing)
    }.padding(.horizontal, 18).padding(.vertical, 10)
  }
  private func presenterBottom(_ c: Color) -> some View {
    VStack(alignment: .leading, spacing: 14) {
      HStack(spacing: 8) { Text("NEXT").font(.system(size: 11, weight: .semibold)).tracking(1.4).foregroundStyle(.white.opacity(0.5)); Text(deck.at + 1 < deck.count ? label(deck.at + 1) : "The end").font(.system(size: 15, weight: .semibold)).foregroundStyle(.white.opacity(0.85)).lineLimit(1) }
      ScrollView { Text(deck.notes.isEmpty ? "No notes for this slide." : deck.notes).font(.system(size: 22, weight: .medium)).lineSpacing(5).foregroundStyle(.white.opacity(deck.notes.isEmpty ? 0.4 : 0.92)).frame(maxWidth: .infinity, alignment: .leading) }.frame(maxHeight: .infinity)
      HStack(spacing: 12) {
        Button { deck.go(deck.at - 1) } label: { Image(systemName: "chevron.left").font(.system(size: 20, weight: .bold)).foregroundStyle(.white).frame(width: 84, height: 72).background(Color.white.opacity(0.12), in: RoundedRectangle(cornerRadius: 24, style: .continuous)) }.opacity(deck.at == 0 ? 0.35 : 1)
        Button { deck.go(deck.at + 1) } label: { HStack(spacing: 8) { Text(deck.at + 1 < deck.count ? "Next" : "Last slide"); Image(systemName: "chevron.right") }.font(.system(size: 20, weight: .bold)).foregroundStyle(.white).frame(maxWidth: .infinity).frame(height: 72).background(c, in: RoundedRectangle(cornerRadius: 24, style: .continuous)).shadow(color: c.opacity(0.5), radius: 18, y: 8) }
      }.buttonStyle(Press())
      Text("Turn the phone on its side to fill the screen with the slide.").font(.system(size: 13)).foregroundStyle(.white.opacity(0.4)).frame(maxWidth: .infinity)
    }.padding(.horizontal, 18).padding(.top, 16).padding(.bottom, 8)
  }
}

// Sleek Docs for iPhone.
//
//   Your pages are a list you can search with one thumb. A page is all page: it is the very page Sleek
//   Docs shows on the web (the same editor, so a document is the same everywhere), with the web's own
//   bars taken away and native ones in their place. Nothing shows until you type; then the tools ride
//   on top of the keyboard, where your thumbs already are.
//
//   Library   your pages and folders, read through the app's door to the pages' own storage (Work.swift)
//   Page      one open page: the web editor inside (Host.swift), what the cursor is in, and the commands
import PhotosUI
import SwiftUI
import WebKit

struct PageRec: Identifiable, Hashable { let id: String, title: String, peek: String, folder: String, updated: Double }
struct Folder: Identifiable, Hashable { let id: String, name: String }

@MainActor
final class Library: ObservableObject {
  @Published var pages: [PageRec] = []
  @Published var folders: [Folder] = []
  @Published var ready = false
  private var W: Work { Work.shared }
  func start() {
    W.folder = Res.support.appendingPathComponent("Work")
    W.onChange.append { [weak self] in Task { @MainActor in await self?.refresh() } }
    W.start()
    Timer.scheduledTimer(withTimeInterval: 120, repeats: true) { _ in Task { @MainActor in await Work.shared.keepCopy() } }
  }
  private func recs(_ v: Any?) -> [PageRec] { (v as? [[String: Any]] ?? []).map { PageRec(id: $0["id"] as? String ?? "", title: $0["title"] as? String ?? "Untitled", peek: $0["peek"] as? String ?? "", folder: $0["folder"] as? String ?? "", updated: ($0["updated"] as? NSNumber)?.doubleValue ?? 0) } }
  private static let fields = "function(d){ return { id: d.id, title: d.title || 'Untitled', peek: d.peek || (d.text || '').slice(0, 200), folder: d.folder || '', updated: d.updated || 0 }; }"
  func refresh() async {
    guard W.ready else { return }
    let p = recs(await W.ask("return (await SleekDocs.list()).map(" + Library.fields + ")"))
    let f = (await W.ask("return (await SleekDocs.folders()).map(function(f){ return { id: f.id, name: f.name }; })") as? [[String: Any]] ?? []).map { Folder(id: $0["id"] as? String ?? "", name: $0["name"] as? String ?? "") }
    withAnimation(.spring(response: 0.4, dampingFraction: 0.86)) { pages = p; folders = f; ready = true }
  }
  func search(_ q: String) async -> [PageRec] { recs(await W.ask("return (await SleekDocs.search(q)).map(" + Library.fields + ")", ["q": q])) }
  func remove(_ id: String) async { _ = await W.ask("await SleekDocs.remove(id); return 1", ["id": id]); await refresh(); W.keepCopySoon() }
  func duplicate(_ id: String) async { _ = await W.ask("await SleekDocs.duplicate(id); return 1", ["id": id]); await refresh() }
  func move(_ id: String, to folder: String) async { _ = await W.ask("await SleekDocs.move(id, folder || null); return 1", ["id": id, "folder": folder]); await refresh() }
  func addFolder(_ name: String) async { let n = name.trimmingCharacters(in: .whitespaces); if n.isEmpty { return }; _ = await W.ask("await SleekDocs.addFolder(name, null); return 1", ["name": n]); await refresh() }
  func removeFolder(_ id: String) async { _ = await W.ask("await SleekDocs.removeFolder(id); return 1", ["id": id]); await refresh() }
  /// A page as a .sleek file's text.
  func file(_ id: String) async -> String? { await W.ask("return await SleekDocs.exportDoc(id)", ["id": id]) as? String }
  /// Bring a .sleek file in. Says what came.
  func bring(_ url: URL) async -> String {
    let mine = url.startAccessingSecurityScopedResource(); defer { if mine { url.stopAccessingSecurityScopedResource() } }
    let r = await W.bring([url]); await refresh()
    return r.pages > 0 ? "Brought in \(r.pages) page\(r.pages == 1 ? "" : "s")" : r.here > 0 ? "That page is already here" : r.decks + r.boards > 0 ? "That file is not a page (it has been kept all the same)" : "That is not a Sleek file"
  }
}

/// What the cursor is in, as the page last said.
struct Cursor: Equatable { var block = "paragraph", level = 0, list = "", table = false, marks: [String] = [], focus = false }
struct Heading: Identifiable { let id: Int, level: Int, text: String }
struct BlockItem: Identifiable { let id: Int, group: String, name: String, hint: String, kind: String, section: Bool }

@MainActor
final class Page: ObservableObject {
  let host: Host
  @Published var id = ""
  @Published var ready = false
  @Published var at = Cursor()
  @Published var mode = "light"
  @Published var font = "inter"
  var onSaved: (() -> Void)?
  var barInPlace = false

  /// The web page's own bars are hidden; the app's take their place.
  static let css = ".side, .top, .fmt, .vw-rail, #locked { display: none !important; } .app { padding-top: 0 !important; } .pagebox { padding-top: 8px !important; } html.in-app, html.in-app body { overscroll-behavior: none; }"
  /// Tells the app when the page is open, when it has been saved, and what the cursor is in.
  static let script = """
  (function(){
    var post = function(m){ try { webkit.messageHandlers.sleekHost.postMessage(m); } catch(e){} }, last = '';
    try { localStorage.setItem('sleek-docs-welcome', localStorage.getItem('sleek-docs-welcome') || '1'); } catch(e){}
    function state(){
      var A = window.SleekDoc; if(!A || !A.view) return;
      var st = A.view.state, $f = st.selection.$from, p = $f.parent, list = '', table = false, marks = [];
      for(var d = $f.depth; d > 0; d--){ var n = $f.node(d).type.name; if(!list && /_list$/.test(n)) list = n; if(n === 'table') table = true; }
      (st.storedMarks || $f.marks()).forEach(function(m){ marks.push(m.type.name); });
      var s = { block: p.type.name, level: p.attrs.level || 0, list: list, table: table, marks: marks, focus: A.view.hasFocus(), mode: A.look('mode') || 'light', font: A.look('font') || 'inter' };
      var k = JSON.stringify(s); if(k !== last){ last = k; post({ state: s }); }
    }
    window.__sleekState = state;
    var t = setInterval(function(){
      var A = window.SleekDoc; if(!A || !A.view || !A.meta || !A.meta()) return; clearInterval(t);
      (A.onSaved = A.onSaved || []).push(function(){ post({ saved: 1 }); });
      (A.onUpdate = A.onUpdate || []).push(function(){ setTimeout(state, 0); });
      (A.onOpen = A.onOpen || []).push(function(d){ post({ opened: d.id }); });
      document.addEventListener('focusin', function(){ setTimeout(state, 0); }); document.addEventListener('focusout', function(){ setTimeout(state, 60); });
      post({ opened: A.meta().id }); state();
    }, 40);
  })();
  """
  init() {
    host = Host(css: Page.css, script: Page.script)
    host.onSay = { [weak self] m in self?.heard(m) }
  }
  private func heard(_ m: [String: Any]) {
    if let i = m["opened"] as? String { id = i; withAnimation(.easeOut(duration: 0.25)) { ready = true } }
    if m["saved"] != nil { onSaved?() }
    if let s = m["state"] as? [String: Any] {
      let c = Cursor(block: s["block"] as? String ?? "paragraph", level: (s["level"] as? NSNumber)?.intValue ?? 0, list: s["list"] as? String ?? "", table: s["table"] as? Bool ?? false, marks: s["marks"] as? [String] ?? [], focus: s["focus"] as? Bool ?? false)
      if c != at { at = c }; mode = s["mode"] as? String ?? "light"; font = s["font"] as? String ?? "inter"
    }
  }
  /// Open a page, or with no id a new one (in a folder, if one is named).
  func open(_ id: String?, folder: String = "") {
    ready = false; self.id = ""
    host.open(id.map { "sleek://app/doc.html?d=" + $0 } ?? ("sleek://app/doc.html?new=1" + (folder.isEmpty ? "" : "&folder=" + folder)))
  }
  private static let names = "var A = SleekDoc, K = SleekDocKit, N = K.N, M = K.M, c = SleekPM.commands;"
  /// Do something to the page where the cursor is, and keep the keyboard up.
  func run(_ code: String, _ args: [String: Any] = [:]) { tap(); host.tell(Page.names + code + "; A.view.focus(); window.__sleekState && window.__sleekState();", args) }
  // the kinds of line
  func text() { run("A.run(function(st, d){ return A.setType(N.paragraph)(st, d) || c.lift(st, d); })") }
  func heading(_ level: Int) { if at.block == "heading" && at.level == level { text() } else { run("A.run(A.setType(N.heading, { level: level }))", ["level": level]) } }
  func quote() { run("A.run(c.wrapIn(N.blockquote)) || A.run(c.lift)") }
  func code() { if at.block == "code_block" { text() } else { run("A.run(A.setType(N.code_block))") } }
  /// Make the line a list of this kind; a list of another kind becomes this kind; a list of this kind goes back to plain lines.
  func list(_ kind: String) { run("if(was && was !== kind) A.list(N[was]); A.list(N[kind])", ["kind": kind, "was": at.list]) }
  func mark(_ name: String) { run("A.run(c.toggleMark(M[name]))", ["name": name]) }
  func link() { run("A.link()") }
  func undo() { run("A.run(SleekPM.history.undo)") }
  func redo() { run("A.run(SleekPM.history.redo)") }
  func done() { host.tell("SleekDoc.view.dom.blur()") }
  func flush() { host.tell("window.SleekDoc && SleekDoc.flush && SleekDoc.flush()") }
  /// What can be added to a page, and what can be done to the section the cursor is in: the page's own list, so the phone never falls behind the web.
  func blocks() async -> [BlockItem] {
    let raw = await host.js("var A = SleekDoc, out = []; A.sectionActions().forEach(function(b, i){ out.push({ i: i, g: 'This section', n: b.n, h: b.h, k: b.i, s: true }); }); A.blocks().forEach(function(b, i){ out.push({ i: i, g: b.g, n: b.n, h: b.h, k: b.i, s: false }); }); return out;") as? [[String: Any]] ?? []
    return raw.enumerated().compactMap { n, b in
      let g = b["g"] as? String ?? ""; if g == "From Sleek Tasks" { return nil }      // this app keeps no tasks of its own
      let sec = b["s"] as? Bool ?? false
      return BlockItem(id: sec ? -1 - ((b["i"] as? NSNumber)?.intValue ?? n) : (b["i"] as? NSNumber)?.intValue ?? n, group: g, name: b["n"] as? String ?? "", hint: b["h"] as? String ?? "", kind: b["k"] as? String ?? "", section: sec)
    }
  }
  func add(_ b: BlockItem) { run(b.section ? "A.sectionActions()[i].f()" : "A.blocks()[i].f()", ["i": b.section ? -1 - b.id : b.id]) }
  func tableDo(_ i: Int) { run("A.run(A.tableActions()[i].c)", ["i": i]) }
  /// A picture from the phone's library goes into the page where the cursor is.
  func addPicture(_ data: Data, type: String) {
    host.tell("var bin = atob(b64), u = new Uint8Array(bin.length); for(var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); SleekDocKit.addPictures(SleekDoc.view, [new File([u], 'picture.' + (type.split('/')[1] || 'jpg'), { type: type })]);", ["b64": data.base64EncodedString(), "type": type])
  }
  func headings() async -> [Heading] {
    let raw = await host.js("var out = []; SleekDoc.view.state.doc.forEach(function(n, pos){ if(n.type.name === 'heading' && n.textContent.trim()) out.push({ p: pos, l: n.attrs.level, t: n.textContent }); else if(n.type.name === 'cover'){ n.forEach(function(c){ if(c.type.name === 'heading' && c.textContent.trim()) out.push({ p: 0, l: 1, t: c.textContent }); }); } }); return out;") as? [[String: Any]] ?? []
    return raw.map { Heading(id: ($0["p"] as? NSNumber)?.intValue ?? 0, level: ($0["l"] as? NSNumber)?.intValue ?? 1, text: $0["t"] as? String ?? "") }
  }
  func go(to pos: Int) { host.tell("var d = SleekDoc.view.nodeDOM(pos); if(d && d.scrollIntoView) d.scrollIntoView({ block: 'start', behavior: 'smooth' });", ["pos": pos]) }
  func look(_ key: String, _ value: String) { tap(); host.tell("SleekDoc.setLook(k, v); window.__sleekState && window.__sleekState();", ["k": key, "v": value]) }
  /// The page as Markdown, as a web page to send, or as a .sleek copy.
  func markdown() async -> String? { (await host.js("return SleekDocKit.toMarkdown(SleekDoc.view.state.doc).md")) as? String }
  func webPage() async -> (html: String, name: String)? { guard let r = await host.js("await SleekDoc.flush(); var r = await SleekDocPublish.build(false); return { html: r.html, name: r.name }") as? [String: Any], let h = r["html"] as? String else { return nil }; return (h, r["name"] as? String ?? "page.html") }
  func title() async -> String { (await host.js("return SleekDoc.title ? SleekDoc.title() : document.title")) as? String ?? "Page" }
}

// ---------- the app ----------
struct DocsRoot: View {
  @StateObject private var lib = Library()
  @StateObject private var shell = Shell()
  @StateObject private var page = Page()
  @Environment(\.scenePhase) private var phase
  var body: some View {
    NavigationStack { LibraryView(lib: lib, page: page, shell: shell) }
      .tint(.docs).modifier(Toast(shell: shell))
      .onAppear { lib.start() }
      .onChange(of: phase) { _, now in if now != .active { page.flush(); Task { await Work.shared.keepCopy() } } else { Task { await lib.refresh() } } }
      .onOpenURL { url in Task { shell.say(await lib.bring(url)) } }
  }
}

struct LibraryView: View {
  @ObservedObject var lib: Library; @ObservedObject var page: Page; @ObservedObject var shell: Shell
  @State private var query = ""
  @State private var found: [PageRec]?
  @State private var folder = ""
  @State private var open: String?           // a page's id, or "new"
  @State private var naming = false
  @State private var name = ""
  @State private var bringing = false
  @State private var sharing: URL?
  var body: some View {
    let shown = found ?? lib.pages.filter { folder.isEmpty || $0.folder == folder }
    ScrollView {
      VStack(alignment: .leading, spacing: 16) {
        HStack(alignment: .firstTextBaseline) {
          Text("Docs").font(.system(size: 40, weight: .bold)).tracking(-1.2)
          Spacer()
          Menu {
            Button { name = ""; naming = true } label: { Label("New Folder", systemImage: "folder.badge.plus") }
            Button { bringing = true } label: { Label("Bring In a Page…", systemImage: "square.and.arrow.down") }
            if let f = lib.folders.first(where: { $0.id == folder }) { Divider(); Button(role: .destructive) { Task { await lib.removeFolder(f.id); folder = "" } } label: { Label("Remove the Folder “\(f.name)”", systemImage: "folder.badge.minus") } }
          } label: { Image(systemName: "ellipsis").font(.system(size: 17, weight: .semibold)).frame(width: 40, height: 40).background(Color.primary.opacity(0.07), in: Circle()) }.foregroundStyle(.primary)
        }.padding(.horizontal, 22)
        HStack(spacing: 8) { Image(systemName: "magnifyingglass").foregroundStyle(.secondary); TextField("Search your pages", text: $query).autocorrectionDisabled(); if !query.isEmpty { Button { query = "" } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(.tertiary) } } }
          .padding(.horizontal, 14).frame(height: 46).background(Color(.secondarySystemBackground), in: Capsule()).padding(.horizontal, 22)
        if !lib.folders.isEmpty && found == nil {
          ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) { chip("All", ""); ForEach(lib.folders) { chip($0.name, $0.id) } }.padding(.horizontal, 22)
          }
        }
        if lib.ready && shown.isEmpty {
          VStack(spacing: 8) { Image(systemName: found == nil ? "doc.text" : "magnifyingglass").font(.system(size: 30)).foregroundStyle(.secondary); Text(found != nil ? "No page has those words" : folder.isEmpty ? "No pages yet" : "Nothing in this folder").font(.system(size: 19, weight: .semibold)); if found == nil { Text("Press the pencil to start one.").font(.system(size: 15)).foregroundStyle(.secondary) } }.frame(maxWidth: .infinity).padding(.top, 70)
        }
        LazyVStack(spacing: 0) { ForEach(shown) { p in row(p) } }
      }.padding(.bottom, 110)
    }
    .scrollDismissesKeyboard(.interactively)
    .background(alignment: .top) { Bloom(c: .docs) }
    .overlay(alignment: .bottomTrailing) {
      Button { tap(.medium); open = "new" } label: { Image(systemName: "square.and.pencil").font(.system(size: 22, weight: .semibold)).foregroundStyle(.white).frame(width: 62, height: 62).background(Color.docs, in: Circle()).shadow(color: Color.docs.opacity(0.5), radius: 16, y: 8) }.buttonStyle(Press()).padding(22)
    }
    .navigationDestination(item: $open) { which in PageScreen(page: page, lib: lib, shell: shell, id: which == "new" ? nil : which, folder: folder) }
    .onChange(of: query) { _, q in let words = q.trimmingCharacters(in: .whitespaces); if words.isEmpty { found = nil } else { Task { let r = await lib.search(words); if query.trimmingCharacters(in: .whitespaces) == words { withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) { found = r } } } } }
    .alert("New folder", isPresented: $naming) { TextField("Its name", text: $name); Button("Cancel", role: .cancel) {}; Button("Add") { Task { await lib.addFolder(name) } } }
    .fileImporter(isPresented: $bringing, allowedContentTypes: [.sleek, .json, .data]) { r in if case .success(let u) = r { Task { shell.say(await lib.bring(u)) } } }
    .sheet(item: $sharing) { u in ShareItems(items: [u]).presentationDetents([.medium, .large]) }
    .onAppear { Task { await lib.refresh() }; if Res.arg("--open") == "new", open == nil { open = "new" } else if Res.arg("--open") == "first", open == nil, let f = lib.pages.first { open = f.id } }
  }
  private func chip(_ name: String, _ id: String) -> some View {
    Button { tap(); withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) { folder = id } } label: { Text(name).font(.system(size: 14, weight: .semibold)).lineLimit(1).padding(.horizontal, 14).frame(height: 34).foregroundStyle(folder == id ? .white : .primary).background(folder == id ? AnyShapeStyle(Color.docs) : AnyShapeStyle(Color.primary.opacity(0.07)), in: Capsule()) }.buttonStyle(Press())
  }
  private func row(_ p: PageRec) -> some View {
    VStack(spacing: 0) {
      Button { tap(); open = p.id } label: {
        VStack(alignment: .leading, spacing: 3) {
          HStack { Text(p.title).font(.system(size: 17, weight: .semibold)).foregroundStyle(.primary).lineLimit(1); Spacer(); Text(ago(p.updated)).font(.system(size: 13)).foregroundStyle(.tertiary) }
          Text(p.peek.isEmpty || p.peek.lowercased() == p.title.lowercased() ? "Only its title so far" : p.peek).font(.system(size: 15)).foregroundStyle(.secondary).lineLimit(2).multilineTextAlignment(.leading)
        }.padding(.vertical, 12).padding(.horizontal, 22).frame(maxWidth: .infinity, alignment: .leading).contentShape(Rectangle())
      }.buttonStyle(.plain)
      .contextMenu {
        Button { Task { await lib.duplicate(p.id) } } label: { Label("Duplicate", systemImage: "plus.square.on.square") }
        Button { Task { if let t = await lib.file(p.id) { sharing = temp(p.title + ".sleek", t) } } } label: { Label("Send a Copy…", systemImage: "square.and.arrow.up") }
        if !lib.folders.isEmpty { Menu { Button("No folder") { Task { await lib.move(p.id, to: "") } }; ForEach(lib.folders) { f in Button(f.name) { Task { await lib.move(p.id, to: f.id) } } } } label: { Label("Move to a Folder", systemImage: "folder") } }
        Button(role: .destructive) { Task { await lib.remove(p.id); shell.say("Page deleted") } } label: { Label("Delete", systemImage: "trash") }
      }
      Divider().padding(.leading, 22)
    }.transition(.opacity)
  }
}
extension URL: @retroactive Identifiable { public var id: String { absoluteString } }
/// A file in the app's own scratch folder, to hand to the share sheet.
func temp(_ name: String, _ text: String) -> URL {
  let safe = name.replacingOccurrences(of: "/", with: "-").replacingOccurrences(of: ":", with: "-"), u = FileManager.default.temporaryDirectory.appendingPathComponent(safe.isEmpty ? "Page" : safe)
  try? Data(text.utf8).write(to: u, options: .atomic); return u
}

// ---------- one page ----------
struct PageScreen: View {
  @ObservedObject var page: Page; @ObservedObject var lib: Library; @ObservedObject var shell: Shell
  let id: String?; let folder: String
  @State private var outline: [Heading]?
  @State private var inserting: [BlockItem]?
  @State private var picking = false
  @State private var picked: PhotosPickerItem?
  @State private var sharing: URL?
  var body: some View {
    HostView(host: page.host).opacity(page.ready ? 1 : 0)
      .ignoresSafeArea(.keyboard).ignoresSafeArea(.container, edges: .bottom)
      .background(page.mode == "dark" ? Color(hex: "#101014") : Color.white)
      .overlay { if !page.ready { ProgressView() } }
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItemGroup(placement: .topBarTrailing) {
          Menu {
            Picker("Look", selection: Binding(get: { page.mode }, set: { page.look("mode", $0) })) { Label("Light", systemImage: "sun.max").tag("light"); Label("Dark", systemImage: "moon").tag("dark") }
            Picker("Type", selection: Binding(get: { page.font }, set: { page.look("font", $0) })) { Text("Clean").tag("inter"); Text("Editorial").tag("editorial") }
          } label: { Image(systemName: "textformat") }
          Button { tap(); Task { outline = await page.headings() } } label: { Image(systemName: "list.bullet.indent") }
          Menu {
            Button { Task { if let t = await lib.file(page.id) { sharing = temp(await page.title() + ".sleek", t) } } } label: { Label("Send a Copy", systemImage: "doc") }
            Button { Task { if let m = await page.markdown() { sharing = temp(await page.title() + ".md", m) } } } label: { Label("Send as Markdown", systemImage: "number") }
            Button { Task { if let w = await page.webPage() { sharing = temp(w.name, w.html) } } } label: { Label("Send as a Web Page", systemImage: "globe") }
            Button { printPage() } label: { Label("Print or Save as PDF", systemImage: "printer") }
          } label: { Image(systemName: "square.and.arrow.up") }
        }
      }
      .sheet(item: Binding(get: { outline.map { Outline(list: $0) } }, set: { if $0 == nil { outline = nil } })) { o in OutlineSheet(list: o.list) { h in outline = nil; page.go(to: h.id) }.presentationDetents([.medium]).presentationCornerRadius(30).presentationBackground(.regularMaterial) }
      .sheet(item: Binding(get: { inserting.map { Blocks(list: $0) } }, set: { if $0 == nil { inserting = nil } })) { b in
        InsertSheet(list: b.list) { item in inserting = nil; if item.name == "Picture" { picking = true } else { DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) { page.add(item) } } }.presentationDetents([.medium, .large]).presentationCornerRadius(30).presentationBackground(.regularMaterial)
      }
      .photosPicker(isPresented: $picking, selection: $picked, matching: .images)
      .onChange(of: picked) { _, item in guard let item = item else { return }; picked = nil; Task { if let d = try? await item.loadTransferable(type: Data.self) { page.addPicture(d, type: item.supportedContentTypes.first?.preferredMIMEType ?? "image/jpeg") } else { shell.say("That picture could not be read") } } }
      .sheet(item: $sharing) { u in ShareItems(items: [u]).presentationDetents([.medium, .large]) }
      .onAppear {
        page.onSaved = { Task { await lib.refresh(); Work.shared.keepCopySoon() } }
        page.open(id, folder: folder)
        page.barInPlace = page.host.setKeyboardBar(Host.keyboardBar { KeyboardBar(page: page) { Task { inserting = await page.blocks() } } })
      }
      .onDisappear { page.flush(); DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { Task { await lib.refresh() } } }
  }
  struct Outline: Identifiable { let list: [Heading]; var id: Int { list.count } }
  struct Blocks: Identifiable { let list: [BlockItem]; var id: Int { list.count } }
  private func printPage() {
    let c = UIPrintInteractionController.shared, info = UIPrintInfo(dictionary: nil); info.jobName = "Sleek Docs"; info.outputType = .general
    c.printInfo = info; c.printFormatter = page.host.web.viewPrintFormatter(); c.present(animated: true)
  }
}

/// The tools, riding on the keyboard: the kind of line the cursor is in, lists, the marks, + for the rest, and Done.
struct KeyboardBar: View {
  @ObservedObject var page: Page; let insert: () -> Void
  var body: some View {
    let a = page.at
    HStack(spacing: 8) {
      ScrollView(.horizontal, showsIndicators: false) {
        HStack(spacing: 2) {
          Menu {
            Button { page.text() } label: { Label("Text", systemImage: a.block == "paragraph" ? "checkmark" : "text.alignleft") }
            Button { page.heading(1) } label: { Label("Heading", systemImage: a.block == "heading" && a.level == 1 ? "checkmark" : "textformat.size.larger") }
            Button { page.heading(2) } label: { Label("Smaller heading", systemImage: a.block == "heading" && a.level == 2 ? "checkmark" : "textformat.size") }
            Button { page.heading(3) } label: { Label("Small heading", systemImage: a.block == "heading" && a.level == 3 ? "checkmark" : "textformat.size.smaller") }
            Button { page.quote() } label: { Label("Quote", systemImage: "text.quote") }
            Button { page.code() } label: { Label("Code", systemImage: a.block == "code_block" ? "checkmark" : "chevron.left.forwardslash.chevron.right") }
          } label: { key("textformat.size", on: a.block == "heading") }
          Button { page.list("bullet_list") } label: { key("list.bullet", on: a.list == "bullet_list") }
          Button { page.list("ordered_list") } label: { key("list.number", on: a.list == "ordered_list") }
          Button { page.list("task_list") } label: { key("checklist", on: a.list == "task_list") }
          Button { page.mark("strong") } label: { key("bold", on: a.marks.contains("strong")) }
          Button { page.mark("em") } label: { key("italic", on: a.marks.contains("em")) }
          Menu {
            Button { page.mark("underline") } label: { Label("Underline", systemImage: "underline") }
            Button { page.mark("strike") } label: { Label("Strike through", systemImage: "strikethrough") }
            Button { page.mark("highlight") } label: { Label("Highlight", systemImage: "highlighter") }
            Button { page.mark("code") } label: { Label("Fixed-width", systemImage: "chevron.left.forwardslash.chevron.right") }
            Button { page.link() } label: { Label("Link", systemImage: "link") }
          } label: { key("textformat.abc.dottedunderline", on: a.marks.contains { ["underline", "strike", "highlight", "code", "link"].contains($0) }) }
          if a.table {
            Menu {
              Button { page.tableDo(0) } label: { Label("Add a row below", systemImage: "plus") }
              Button { page.tableDo(1) } label: { Label("Add a column to the right", systemImage: "plus") }
              Button { page.tableDo(2) } label: { Label("Delete this row", systemImage: "minus") }
              Button { page.tableDo(3) } label: { Label("Delete this column", systemImage: "minus") }
              Button(role: .destructive) { page.tableDo(4) } label: { Label("Delete the table", systemImage: "trash") }
            } label: { key("tablecells", on: true) }
          }
          Button { page.undo() } label: { key("arrow.uturn.backward", on: false) }
          Button { page.redo() } label: { key("arrow.uturn.forward", on: false) }
        }.padding(.horizontal, 6)
      }
      .frame(height: 48).modifier(Glass(shape: Capsule()))
      Button { tap(); insert() } label: { Image(systemName: "plus").font(.system(size: 19, weight: .semibold)).foregroundStyle(.white).frame(width: 48, height: 48).background(Color.docs, in: Circle()).shadow(color: Color.docs.opacity(0.4), radius: 10, y: 4) }
      Button { tap(); page.done() } label: { Image(systemName: "keyboard.chevron.compact.down").font(.system(size: 17, weight: .semibold)).frame(width: 48, height: 48).modifier(Glass(shape: Circle())) }.foregroundStyle(.primary)
    }
    .padding(.horizontal, 10).padding(.bottom, 6).tint(.docs)
  }
  private func key(_ icon: String, on: Bool) -> some View { Image(systemName: icon).font(.system(size: 17, weight: .medium)).foregroundStyle(on ? Color.white : Color.primary).frame(width: 40, height: 36).background(on ? Color.docs : Color.clear, in: RoundedRectangle(cornerRadius: 11, style: .continuous)).frame(width: 44, height: 44) }
}

/// + on the keyboard: what can go into a page, big enough for a thumb. The list is the page's own.
struct InsertSheet: View {
  let list: [BlockItem]; let pick: (BlockItem) -> Void
  static let icons = ["h": "textformat.size.larger", "fold": "chevron.down.square", "list": "list.bullet", "num": "list.number", "check": "checklist", "quote": "text.quote", "code": "chevron.left.forwardslash.chevron.right", "rule": "minus", "image": "photo", "cmp": "rectangle.split.2x1", "table": "tablecells", "chart": "chart.bar", "nums": "number", "cover": "rectangle.topthird.inset.filled", "call": "lightbulb", "cols": "rectangle.split.3x1", "trash": "trash", "task": "checkmark.circle", "board": "rectangle.split.3x1"]
  var body: some View {
    let groups = list.reduce(into: [String]()) { if !$0.contains($1.group) { $0.append($1.group) } }
    ScrollView {
      VStack(alignment: .leading, spacing: 16) {
        Text("Add to the page").font(.system(size: 22, weight: .bold)).tracking(-0.4)
        ForEach(groups, id: \.self) { g in
          VStack(alignment: .leading, spacing: 8) {
            Text(g.uppercased()).font(.system(size: 12, weight: .semibold)).tracking(1.4).foregroundStyle(.secondary)
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 10), count: 2), spacing: 10) { ForEach(list.filter { $0.group == g }) { it in
              Button { tap(.medium); pick(it) } label: {
                HStack(spacing: 10) { Image(systemName: InsertSheet.icons[it.kind] ?? "plus").font(.system(size: 18)).foregroundStyle(it.kind == "trash" ? Color.red : Color.docs).frame(width: 26); Text(it.name).font(.system(size: 15, weight: .medium)).foregroundStyle(.primary).lineLimit(2).multilineTextAlignment(.leading); Spacer(minLength: 0) }
                  .padding(.horizontal, 12).frame(height: 54).background(Color(.systemBackground).opacity(0.8), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
              }.buttonStyle(Press()) } }
          }
        }
      }.padding(.horizontal, 22).padding(.top, 26).padding(.bottom, 30)
    }
  }
}
struct OutlineSheet: View {
  let list: [Heading]; let go: (Heading) -> Void
  var body: some View {
    ScrollView { VStack(alignment: .leading, spacing: 4) {
      Text("Outline").font(.system(size: 22, weight: .bold)).tracking(-0.4).padding(.bottom, 8)
      ForEach(Array(list.enumerated()), id: \.offset) { _, h in Button { tap(); go(h) } label: { Text(h.text).font(.system(size: h.level == 1 ? 18 : 16, weight: h.level == 1 ? .semibold : .regular)).foregroundStyle(h.level == 1 ? .primary : .secondary).lineLimit(2).multilineTextAlignment(.leading).padding(.leading, CGFloat(max(0, h.level - 1)) * 16).frame(maxWidth: .infinity, minHeight: 40, alignment: .leading).contentShape(Rectangle()) }.buttonStyle(.plain) }
      if list.isEmpty { Text("Headings you add show here, to jump between.").foregroundStyle(.secondary) }
    }.padding(.horizontal, 22).padding(.top, 26) }
  }
}

// Started plainly, the app is Sleek Docs. Started with `--prove` (./make.sh check), it checks itself: it opens a
// new page in the real editor, drives it the way the keyboard bar does, and runs the library through its paces,
// in storage that is thrown away afterwards (nothing of yours is touched). It says what it finds, and quits.
import SwiftUI
import WebKit

@main
struct SleekDocsApp: App {
  var body: some Scene { WindowGroup { if Res.proving { CheckView() } else { DocsRoot() } } }
}

@MainActor
final class Checker: ObservableObject {
  @Published var lines: [(ok: Bool, text: String)] = []
  let lib = Library(), page = Page()
  private var failures = 0
  private func say(_ ok: Bool, _ text: String) { lines.append((ok, text)); if !ok { failures += 1 }; print((ok ? "  ok   " : "  FAIL ") + text); fflush(stdout) }
  private func nap(_ s: Double) async { try? await Task.sleep(nanoseconds: UInt64(s * 1e9)) }
  private func until(_ seconds: Double, _ test: () async -> Bool) async -> Bool { let end = Date().addingTimeInterval(seconds); while Date() < end { if await test() { return true }; await nap(0.2) }; return await test() }
  private func js(_ code: String) async -> Any? { await page.host.js(code) }
  /// The kinds of the page's top-level blocks, in order.
  private func kinds() async -> [String] { (await js("var out = []; SleekDoc.view.state.doc.forEach(function(n){ out.push(n.type.name); }); return out;")) as? [String] ?? [] }

  func run() async {
    lib.start()
    let up = await until(30) { Work.shared.ready && self.lib.ready }
    say(up && lib.pages.isEmpty, "the app's door to its pages opens, and there are none yet")

    // ---------- a new page, in the real editor ----------
    page.open(nil)
    let opened = await until(30) { self.page.ready && !self.page.id.isEmpty }
    say(opened, "a new page opens in the editor")
    let chrome = (await js("function gone(q){ var e = document.querySelector(q); return !e || getComputedStyle(e).display === 'none'; } return { top: gone('.top'), fmt: gone('#fmt'), side: gone('#side'), wide: document.documentElement.scrollWidth - innerWidth, ed: !!document.querySelector('#ed .ProseMirror, #ed [contenteditable]') }")) as? [String: Any] ?? [:]
    say((chrome["top"] as? Bool) == true && (chrome["fmt"] as? Bool) == true && (chrome["side"] as? Bool) == true && ((chrome["wide"] as? Int) ?? 9) <= 0 && (chrome["ed"] as? Bool) == true, "the web page's own bars are hidden, and the page fits the phone")
    let bar = page.host.setKeyboardBar(Host.keyboardBar { KeyboardBar(page: page) {} })
    say(bar, "the app's own bar takes the place of the engine's on the keyboard")

    // ---------- writing, the way the keyboard bar does it ----------
    _ = await js("var v = SleekDoc.view; v.focus(); v.dispatch(v.state.tr.insertText('Notes from the phone')); return 1")
    _ = await until(4) { self.page.at.focus }
    say(page.at.block == "heading" && page.at.level == 1, "a new page starts on its title, and the bar knows what the cursor is in")
    _ = await js("var v = SleekDoc.view, c = SleekPM.commands; c.splitBlock(v.state, v.dispatch); v.dispatch(v.state.tr.insertText('A section')); return 1")
    _ = await until(4) { self.page.at.block == "paragraph" }
    page.heading(2); _ = await until(4) { self.page.at.block == "heading" && self.page.at.level == 2 }
    let made = page.at.block == "heading" && page.at.level == 2
    page.heading(2); _ = await until(4) { self.page.at.block == "paragraph" }
    let unmade = page.at.block == "paragraph"
    page.heading(2); _ = await until(4) { self.page.at.block == "heading" }
    say(made && unmade && page.at.level == 2, "a line becomes a heading, and goes back to text when pressed again")
    _ = await js("var v = SleekDoc.view, c = SleekPM.commands; c.splitBlock(v.state, v.dispatch); v.dispatch(v.state.tr.insertText('First point')); return 1")
    _ = await until(4) { self.page.at.block == "paragraph" }
    page.list("bullet_list"); _ = await until(4) { self.page.at.list == "bullet_list" }
    let inList = page.at.list == "bullet_list"
    page.list("task_list"); _ = await until(4) { self.page.at.list == "task_list" }
    say(inList && page.at.list == "task_list", "a line becomes a list, and a list becomes a checklist")
    page.mark("strong"); _ = await until(4) { self.page.at.marks.contains("strong") }
    let bold = page.at.marks.contains("strong")
    _ = await js("var v = SleekDoc.view; v.dispatch(v.state.tr.insertText(' in bold')); return 1")
    let marked = (await js("var has = false; SleekDoc.view.state.doc.descendants(function(n){ if(n.isText && n.text.indexOf('in bold') >= 0 && n.marks.some(function(m){ return m.type.name === 'strong'; })) has = true; }); return has;")) as? Bool ?? false
    say(bold && marked, "bold switches on, and what is typed next is bold")
    page.undo(); await nap(0.3)
    let undone = (await js("return SleekDoc.view.state.doc.textContent.indexOf('in bold') < 0")) as? Bool ?? false
    page.redo(); await nap(0.3)
    let redone = (await js("return SleekDoc.view.state.doc.textContent.indexOf('in bold') >= 0")) as? Bool ?? false
    say(undone && redone, "undo and redo work from the bar")

    // ---------- adding blocks: the page's own list ----------
    let blocks = await page.blocks(), names = blocks.map(\.name)
    say(names.contains("Table") && names.contains("Divider") && names.contains("Callout") && names.contains("Chart") && names.contains("Picture") && !blocks.contains { $0.group == "From Sleek Tasks" }, "what can be added is the page's own list (\(blocks.count) kinds)")
    for want in ["Divider", "Table", "Chart", "Big numbers", "Before and after"] { if let b = blocks.first(where: { $0.name == want }) { page.add(b); await nap(0.35); _ = await js("var v = SleekDoc.view, end = v.state.doc.content.size; v.dispatch(v.state.tr.setSelection(SleekPM.state.Selection.atEnd(v.state.doc))); return end") } }
    let after = await kinds()
    say(after.contains("horizontal_rule") && after.contains("table") && after.filter { $0 == "data" }.count == 2 && after.contains("compare"), "a divider, a table, a chart, big numbers and a before-and-after go in: \(after.joined(separator: ", "))")
    // (a picture from the phone is not tried here: the web engine keeps no pictures in storage that is thrown away. It is tried by hand.)

    // ---------- outline, look, and what goes out ----------
    let heads = await page.headings()
    say(heads.map(\.text) == ["Notes from the phone", "A section"] && heads.map(\.level) == [1, 2], "the outline lists the page's headings")
    page.look("mode", "dark"); page.look("font", "editorial"); _ = await until(4) { self.page.mode == "dark" && self.page.font == "editorial" }
    let painted = (await js("return document.documentElement.getAttribute('data-mode') + '/' + document.documentElement.getAttribute('data-font')")) as? String ?? ""
    say(page.mode == "dark" && page.font == "editorial" && painted == "dark/editorial", "the look changes: dark, and editorial type")
    page.look("mode", "light")
    let md = await page.markdown() ?? "", web = await page.webPage()
    say(md.contains("# Notes from the phone") && md.contains("## A section") && md.contains("First point"), "the page goes out as Markdown")
    say((web?.html.contains("Notes from the phone") ?? false) && (web?.html.count ?? 0) > 2000 && (web?.name.hasSuffix(".html") ?? false), "and as a web page to send")
    page.flush(); await nap(0.8); await lib.refresh()
    let id = page.id, mine = lib.pages.first { $0.id == id }
    say(lib.pages.count == 1 && mine?.title == "Notes from the phone" && (mine?.peek.contains("First point") ?? false), "it is saved, and shows in the library by its first line")

    // ---------- the library ----------
    let file = await lib.file(id) ?? ""
    say(file.contains("\"kind\":\"doc\"") || file.contains("\"kind\": \"doc\""), "a page goes out as a .sleek copy")
    await lib.duplicate(id); await lib.addFolder("Work")
    let folder = lib.folders.first?.id ?? "", copy = lib.pages.first { $0.id != id }?.id ?? ""
    await lib.move(copy, to: folder)
    say(lib.pages.count == 2 && lib.folders.map(\.name) == ["Work"] && lib.pages.first { $0.id == copy }?.folder == folder, "a page can be duplicated, and moved into a folder")
    let found = await lib.search("first point"), none = await lib.search("zebra crossing")
    say(found.count == 2 && none.isEmpty, "pages are found by their words")
    await lib.remove(id)
    say(lib.pages.map(\.id) == [copy], "a page can be deleted")
    let back = FileManager.default.temporaryDirectory.appendingPathComponent("sleek-docs-check.sleek"); try? Data(file.utf8).write(to: back)
    let told = await lib.bring(back), again = await lib.bring(back)
    say(told == "Brought in 1 page" && again == "That page is already here" && lib.pages.contains { $0.id == id }, "a .sleek copy comes back in, once")
    await Work.shared.keepCopy()
    let kept = Res.support.appendingPathComponent("Work/pages/\(id).sleek")
    say(FileManager.default.fileExists(atPath: kept.path), "a plain copy of each page is kept in the app's own folder")

    // ---------- opening it again ----------
    page.open(id)
    let reopened = await until(30) { self.page.ready && self.page.id == id }
    let text = (await js("return SleekDoc.view.state.doc.textContent")) as? String ?? ""
    let kept2 = await kinds()
    say(reopened && text.contains("Notes from the phone") && text.contains("in bold") && kept2.contains("table"), "the page opens again as it was left")

    try? FileManager.default.removeItem(at: Res.support); try? FileManager.default.removeItem(at: back)
    print(failures == 0 ? "\nall passed (\(lines.count) checks)" : "\n\(failures) FAILED"); fflush(stdout)
    await nap(0.8); exit(failures == 0 ? 0 : 1)
  }
}

struct CheckView: View {
  @StateObject private var c = Checker()
  var body: some View {
    VStack(spacing: 0) {
      HostView(host: c.page.host).frame(maxHeight: .infinity)
      ScrollViewReader { reader in
        ScrollView {
          VStack(alignment: .leading, spacing: 6) { ForEach(Array(c.lines.enumerated()), id: \.offset) { i, line in HStack(alignment: .top, spacing: 8) { Image(systemName: line.ok ? "checkmark.circle.fill" : "xmark.circle.fill").foregroundStyle(line.ok ? .green : .red); Text(line.text).font(.footnote) }.id(i) } }.padding(12).frame(maxWidth: .infinity, alignment: .leading)
        }.frame(height: 240).background(Color(.secondarySystemBackground)).onChange(of: c.lines.count) { _, n in reader.scrollTo(n - 1) }
      }
    }.task { await c.run() }
  }
}

// Started plainly, the app is Sleek Slides. Started with `--prove` (./make.sh check), it checks itself: it makes a
// deck, opens it in the real deck page, changes its words and notes the way the fields do, adds and removes
// slides, and runs the library through its paces, in storage that is thrown away afterwards (nothing of yours
// is touched). It says what it finds, and quits.
import SwiftUI
import WebKit

@main
struct SleekSlidesApp: App {
  var body: some Scene { WindowGroup { if Res.proving { CheckView() } else { SlidesRoot() } } }
}

@MainActor
final class Checker: ObservableObject {
  @Published var lines: [(ok: Bool, text: String)] = []
  let lib = Library(), deck = Deck()
  private var failures = 0
  private func say(_ ok: Bool, _ text: String) { lines.append((ok, text)); if !ok { failures += 1 }; print((ok ? "  ok   " : "  FAIL ") + text); fflush(stdout) }
  private func nap(_ s: Double) async { try? await Task.sleep(nanoseconds: UInt64(s * 1e9)) }
  private func until(_ seconds: Double, _ test: () async -> Bool) async -> Bool { let end = Date().addingTimeInterval(seconds); while Date() < end { if await test() { return true }; await nap(0.2) }; return await test() }
  private func js(_ code: String) async -> Any? { await deck.host.js(code) }
  /// What the deck's own storage holds for this deck now.
  private func stored(_ id: String, _ what: String) async -> Any? { await Work.shared.ask("var d = await SleekStore.get(id); return d ? (" + what + ") : null", ["id": id]) }

  func run() async {
    lib.start()
    let up = await until(30) { Work.shared.ready && self.lib.ready }
    say(up && lib.decks.isEmpty, "the app's door to its decks opens, and there are none yet")

    // ---------- a new deck ----------
    let id = await lib.create(title: "Phone deck", mode: "dark", accent: "#12A36A") ?? ""
    let mine = lib.decks.first
    say(!id.isEmpty && lib.decks.count == 1 && mine?.title == "Phone deck" && mine?.slides == 2 && mine?.mode == "dark" && mine?.accent == "#12A36A" && mine?.head == "Phone deck", "a new deck is made: a title slide and a slide of points, in its colour")
    deck.open(id)
    let opened = await until(40) { self.deck.ready && self.deck.count == 2 }
    say(opened && deck.at == 0 && deck.id == id, "it opens in the deck page, on its first slide")
    let chrome = (await js("function gone(q){ var e = document.querySelector(q); return !e || getComputedStyle(e).display === 'none'; } var s = Deck.current().getBoundingClientRect(); return { bar: gone('#bar'), edit: gone('#editbar'), notes: gone('#notes'), w: Math.round(s.width), win: innerWidth, h: Math.round(s.height), winh: innerHeight }")) as? [String: Any] ?? [:]
    func n(_ k: String) -> Int { (chrome[k] as? NSNumber)?.intValue ?? -1 }
    say((chrome["bar"] as? Bool) == true && (chrome["edit"] as? Bool) == true && (chrome["notes"] as? Bool) == true && n("w") > 0 && n("w") <= n("win") + 1, "the web page's own bars are hidden, and the slide fits the screen (\(n("w")) of \(n("win")) wide)")

    // ---------- the words of a slide ----------
    let title = deck.fields.first { $0.role == "Title" }
    say(title?.text == "Phone deck" && deck.fields.contains { $0.role == "Small line above" }, "the slide's words come to the app as fields: \(deck.fields.map(\.role).joined(separator: ", "))")
    deck.set(title?.id ?? "", "Made on a phone"); await nap(0.9)
    let shown = (await js("return Deck.current().querySelector('[data-eid$=\".t1\"]').textContent")) as? String ?? ""
    deck.flush(); await nap(0.9)
    let kept = (await stored(id, "d.seed.text['" + (title?.id ?? "") + "']")) as? String ?? ""
    say(shown == "Made on a phone" && kept == "Made on a phone", "new words show on the slide at once, and are saved in the deck")
    deck.go(1); _ = await until(6) { self.deck.at == 1 }
    let points = deck.fields.filter { $0.role == "Point" }
    say(deck.at == 1 && points.count >= 3, "the next slide's points come as fields (\(points.count))")
    deck.set(points.first?.id ?? "", "First point,\nover two lines"); await nap(0.5)
    let li = (await js("var e = Deck.stage.querySelector('[data-eid=\"" + (points.first?.id ?? "") + "\"]'); return e ? e.innerHTML : ''")) as? String ?? ""
    say(li == "First point,<br>over two lines", "a point can run over two lines, and what is typed is never read as markup")

    // ---------- speaker notes ----------
    deck.setNotes("Pause here.\nThen the number."); await nap(0.4)
    deck.go(0); _ = await until(6) { self.deck.at == 0 }; deck.go(1); _ = await until(6) { self.deck.at == 1 }
    deck.flush(); await nap(0.9)
    let notes = (await stored(id, "JSON.stringify(d.seed.noteByKey || {})")) as? String ?? ""
    say(deck.notes == "Pause here.\nThen the number." && notes.contains("Pause here."), "speaker notes are kept with their slide, and saved in the deck")

    // ---------- adding, copying and removing slides ----------
    let layouts = await deck.layouts()
    say(layouts.contains { $0.id == "statement" } && layouts.contains { $0.id == "results" } && layouts.count > 10, "the layouts to add are the deck page's own (\(layouts.count))")
    deck.add("statement")
    let added = await until(30) { self.deck.count == 3 && self.deck.at == 2 }
    say(added && deck.labels == ["Title", "Bullets", "Statement"] && !deck.fields.isEmpty, "a new slide goes in after the one showing, and the deck opens on it")
    deck.duplicate()
    let copied = await until(30) { self.deck.count == 4 }
    deck.delete()
    let removed = await until(30) { self.deck.count == 3 }
    say(copied && removed, "a slide can be duplicated, and deleted")
    await nap(0.6); await lib.refresh()
    say(lib.decks.first?.slides == 3, "the library knows the deck has three slides now")

    // ---------- the look, all slides, editing on the slide ----------
    deck.look("mode", "light"); deck.look("accent", "#E0457B"); _ = await until(5) { self.deck.mode == "light" && self.deck.accent.uppercased() == "#E0457B" }
    let painted = (await js("return (document.documentElement.getAttribute('data-theme') || 'light') + ' ' + getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()")) as? String ?? ""
    say(deck.mode == "light" && deck.accent.uppercased() == "#E0457B" && painted.lowercased() == "light #e0457b", "the deck's look changes: light, and another colour")
    deck.allSlides(true); let gridOpen = await until(5) { self.deck.grid }
    let tiles = (await js("return document.querySelectorAll('#grid .gt[data-k]').length")) as? Int ?? 0
    deck.allSlides(false); let gridShut = await until(5) { !self.deck.grid }
    say(gridOpen && tiles >= 3 && gridShut, "All slides opens in the page, with a tile for each slide, and closes")
    deck.onSlide(true); await nap(0.8)
    let onSlide = (await js("return { bar: getComputedStyle(document.querySelector('#bar')).display !== 'none', editing: Deck.isEditing() }")) as? [String: Any] ?? [:]
    deck.onSlide(false); await nap(0.8)
    let back = (await js("return { bar: getComputedStyle(document.querySelector('#bar')).display === 'none', editing: Deck.isEditing() }")) as? [String: Any] ?? [:]
    say((onSlide["bar"] as? Bool) == true && (onSlide["editing"] as? Bool) == true && (back["bar"] as? Bool) == true && (back["editing"] as? Bool) == false, "Edit on the slide brings the web's own editing back, and Done puts it away")

    // ---------- the library ----------
    await lib.rename(id, "Renamed deck"); await lib.duplicate(id)
    say(lib.decks.count == 2 && lib.decks.contains { $0.id == id && $0.title == "Renamed deck" }, "a deck can be renamed and duplicated")
    let file = await lib.file(id) ?? ""
    say(file.contains("\"format\":\"sleek\"") && file.contains("Made on a phone"), "a deck goes out as a .sleek copy")
    await lib.remove(id)
    let out = FileManager.default.temporaryDirectory.appendingPathComponent("sleek-slides-check.sleek"); try? Data(file.utf8).write(to: out)
    let told = await lib.bring(out), again = await lib.bring(out)
    say(told == "Brought in 1 deck" && again == "That deck is already here" && lib.decks.contains { $0.title == "Renamed deck" }, "a .sleek copy comes back in, once")
    await Work.shared.keepCopy()
    let copies = (try? FileManager.default.contentsOfDirectory(atPath: Res.support.appendingPathComponent("Work/decks").path)) ?? []
    say(copies.count == lib.decks.count && !copies.isEmpty, "a plain copy of each deck is kept in the app's own folder")

    // ---------- the sample deck ----------
    let sample = await lib.addSample() ?? ""
    deck.open(sample)
    let big = await until(40) { self.deck.ready && self.deck.id == sample && self.deck.count > 8 }
    say(big, "the sample deck opens (\(deck.count) slides)")
    var withWords = 0
    for k in 0..<min(deck.count, 12) { deck.go(k); _ = await until(4) { self.deck.at == k }; if !deck.fields.filter({ $0.shown }).isEmpty { withWords += 1 } }
    say(withWords >= 8, "its slides give their words to the app (\(withWords) of the first \(min(deck.count, 12)))")

    try? FileManager.default.removeItem(at: Res.support); try? FileManager.default.removeItem(at: out)
    print(failures == 0 ? "\nall passed (\(lines.count) checks)" : "\n\(failures) FAILED"); fflush(stdout)
    await nap(0.8); exit(failures == 0 ? 0 : 1)
  }
}

struct CheckView: View {
  @StateObject private var c = Checker()
  var body: some View {
    VStack(spacing: 0) {
      GeometryReader { g in HostView(host: c.deck.host).frame(width: g.size.width, height: g.size.width * 9 / 16) }.frame(height: UIScreen.main.bounds.width * 9 / 16)
      ScrollViewReader { reader in
        ScrollView {
          VStack(alignment: .leading, spacing: 6) { ForEach(Array(c.lines.enumerated()), id: \.offset) { i, line in HStack(alignment: .top, spacing: 8) { Image(systemName: line.ok ? "checkmark.circle.fill" : "xmark.circle.fill").foregroundStyle(line.ok ? .green : .red); Text(line.text).font(.footnote) }.id(i) } }.padding(12).frame(maxWidth: .infinity, alignment: .leading)
        }.background(Color(.secondarySystemBackground)).onChange(of: c.lines.count) { _, n in reader.scrollTo(n - 1) }
      }
    }.task { await c.run() }
  }
}

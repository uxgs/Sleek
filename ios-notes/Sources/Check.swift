// Started plainly, the app is Sleeky Notes. Started with `--prove` (./make.sh check), it checks itself: it opens the
// real page, jots and locks notes in it, and reads them back the way the widgets and the other Sleek apps do, in
// storage that is thrown away afterwards (nothing of yours is touched). It says what it finds, and quits.
// While it checks itself there is nobody to look at the phone, so the key to locked notes is kept in memory, not in
// the keychain behind Face ID (NoteKeys.testing); the keychain itself can only be tried on a real iPhone.
import SwiftUI
import WebKit

@main
struct SleekNotesApp: App {
  var body: some Scene { WindowGroup { if Res.proving { CheckView() } else { NotesRoot().sleekOpening("Notes", ["#F59E0B", "#FFC53D", "#FFD466"], brand: "Sleeky") } } }
}

@MainActor
final class Checker: ObservableObject {
  @Published var lines: [(ok: Bool, text: String)] = []
  let notes = Notes()
  private var failures = 0
  private func say(_ ok: Bool, _ text: String) { lines.append((ok, text)); if !ok { failures += 1 }; print((ok ? "  ok   " : "  FAIL ") + text); fflush(stdout) }
  private func nap(_ s: Double) async { try? await Task.sleep(nanoseconds: UInt64(s * 1e9)) }
  private func until(_ seconds: Double, _ test: () async -> Bool) async -> Bool { let end = Date().addingTimeInterval(seconds); while Date() < end { if await test() { return true }; await nap(0.2) }; return await test() }
  private func js(_ code: String, _ args: [String: Any] = [:]) async -> Any? { await notes.host.js(code, args) }
  private func yes(_ code: String, _ args: [String: Any] = [:]) async -> Bool { await js(code, args) as? Bool == true }

  func run() async {
    say(Chime.url != nil && !Opening.plays, "the opening sound is inside the app, and the opening does not play while the app checks itself")
    notes.start()
    let up = await notes.ready()
    let door = await until(30) { Work.shared.ready }
    say(up && door, "the page opens inside the app, and so does the door to its notes")
    say(await yes("return SleekNotes.notes().length === 1 && SleekNotes.notes()[0].pin && document.documentElement.classList.contains('in-app')"), "it starts with one note, a welcome, pinned")
    say(await yes("return getComputedStyle(document.querySelector('[data-act=\"export\"]')).display === 'none' && document.documentElement.scrollWidth <= innerWidth"), "the page fits the phone, without the web's own way of saving a copy")

    // ---------- jotting, as the page does and as the app's own sheet does ----------
    _ = await js("document.querySelector('#jotin').value = 'Call the plumber'; document.querySelector('#jot').requestSubmit(); return 1")
    notes.jot("  Buy washers for the kitchen tap  ")
    let jotted = await until(5) { await self.yes("return SleekNotes.notes().length === 3 && SleekNotes.notes()[0].title === 'Buy washers for the kitchen tap' && SleekNotes.notes()[1].title === 'Call the plumber'") }
    say(jotted, "a note jotted in the page is kept, and one from the app's Jot sheet lands on top")
    let id = await js("return SleekNotes.notes()[0].id") as? String ?? ""
    _ = await js("SleekNotes.set(id, { body: '<div>Half inch, <b>brass</b></div><div class=\"ck\" data-done=\"1\">Measure the tap</div><div class=\"ck\" data-done=\"0\">Turn off the water</div>', icon: 'home', color: '#0A84FF', pin: true, tags: ['House Jobs'] }); return 1", ["id": id])

    // ---------- the addresses it answers to ----------
    notes.go(NoteData.link("open", id: id))
    let opened = await until(8) { await self.yes("return SleekNotesApp.state.open === id && !!document.querySelector('#body') && document.querySelector('#body').textContent.indexOf('brass') > 0", ["id": id]) }
    notes.go(NoteData.link("jot")); let sheet = await until(5) { self.notes.jotting }; notes.jotting = false
    notes.go(NoteData.link("open")); let listed = await until(8) { await self.yes("return SleekNotesApp.state.open === null") }
    let a = NoteData.ask(URL(string: "sleek-notes://open?id=abcde12345")!), b = NoteData.ask(URL(string: "sleek-notes://open?id=BAD!")!), c = NoteData.ask(URL(string: "sleek-tasks://open")!)
    say(opened && sheet && listed && a?.id == "abcde12345" && b?.what == "open" && b?.id == nil && c == nil, "a widget or the Sleek browser can open a note, the Jot sheet, or the list")

    // ---------- locking, with the key kept by the app ----------
    let can = await js("return await SleekVault.canBio()") as? Bool == true, name = await js("return SleekVault.bioName()") as? String ?? ""
    let native = await yes("return SleekVault.native && SleekVault.can")
    say(can && name == "Face ID" && native, "the page asks the app to keep the key, and the app says what unlocks it (\(name))")
    notes.go(NoteData.link("open", id: id)); _ = await until(8) { await self.yes("return SleekNotesApp.state.open === id && !!document.querySelector('#body')", ["id": id]) }
    _ = await js("document.querySelector('[data-act=\"lock\"]').click(); return 1")
    let asked = await until(8) { await self.yes("return !!document.querySelector('#setform') && !!document.querySelector('#usebio') && document.querySelector('#usebio').checked") }
    _ = await js("document.querySelector('#pass1').value = 'tap-9042'; document.querySelector('#pass2').value = 'tap-9042'; document.querySelector('#setform').requestSubmit(); return 1")
    let locked = await until(15) { await self.yes("var n = SleekNotes.note(id); return n.lock && n.body === '' && !!n.sealed && JSON.stringify(n).indexOf('brass') < 0", ["id": id]) }
    let vault = await js("return SleekNotes.note(id).sealed.v", ["id": id]) as? String ?? ""
    let both = await yes("var v = SleekNotes.vault(v0); return v.bio.length === 1 && v.bio[0].native === true && !!v.pass", ["v0": vault])
    say(asked && locked && NoteKeys.testing?[vault] != nil && both, "locking a note scrambles its text, and the app keeps the key for Face ID beside your passcode")
    notes.go(NoteData.link("open")); _ = await until(8) { await self.yes("return SleekNotesApp.state.open === null") }
    notes.go(NoteData.link("open", id: id))
    let shut = await until(8) { await self.yes("return SleekNotesApp.state.open === id && !!document.querySelector('.vault') && !document.querySelector('#body') && /Face ID/.test(document.querySelector('.vault').textContent)", ["id": id]) }
    _ = await js("document.querySelector('[data-act=\"unlock\"]').click(); return 1")
    let opens = await until(8) { await self.yes("return !!document.querySelector('#body') && document.querySelector('#body').textContent.indexOf('brass') > 0 && !document.querySelector('#passform')") }
    say(shut && opens, "opened again it shows only its title until the app hands the key over, with no passcode asked")
    notes.away()
    let relocked = await until(8) { await self.yes("return !!document.querySelector('.vault') && SleekNotesApp.state.key === null") }
    NoteKeys.testing?[vault] = nil
    _ = await js("document.querySelector('[data-act=\"unlock\"]').click(); return 1")
    let asksPass = await until(8) { await self.yes("return !!document.querySelector('#passform')") }
    _ = await js("document.querySelector('#pass1').value = 'tap-9042'; document.querySelector('#passform').requestSubmit(); return 1")
    let byPass = await until(15) { await self.yes("return !!document.querySelector('#body') && document.querySelector('#body').textContent.indexOf('brass') > 0") }
    say(relocked && asksPass && byPass && NoteKeys.testing?[vault] != nil, "leaving the app locks it again; without the app's key your passcode opens it, and the app then keeps the key again")

    // ---------- the copy the widgets and the other Sleek apps read ----------
    notes.go(NoteData.link("open")); _ = await until(8) { await self.yes("return SleekNotesApp.state.open === null") }
    await nap(0.6); await Work.shared.keepCopy(now: true)
    let root = Res.support, mine = root.appendingPathComponent("Work"), text = (try? String(contentsOf: mine.appendingPathComponent("Notes.sleek"), encoding: .utf8)) ?? ""
    say(text.contains("\"format\":\"sleek-notes\"") && text.contains("Call the plumber") && !text.contains("brass") && !text.contains("tap-9042"), "a copy of your notes is written for the other apps, locked notes still scrambled in it")
    // as the widgets read: this app's place and the browser's, side by side in one folder
    let shared = FileManager.default.temporaryDirectory.appendingPathComponent("sleek-notes-check-\(ProcessInfo.processInfo.processIdentifier)")
    try? FileManager.default.createDirectory(at: shared.appendingPathComponent("notes"), withIntermediateDirectories: true); try? FileManager.default.createDirectory(at: shared.appendingPathComponent("browser"), withIntermediateDirectories: true)
    try? text.write(to: shared.appendingPathComponent("notes/Notes.sleek"), atomically: true, encoding: .utf8)
    let t = Int(Date().timeIntervalSince1970 * 1000) + 5000, plumber = await js("return SleekNotes.notes().filter(function(n){ return n.title === 'Call the plumber'; })[0].id") as? String ?? ""
    let theirs: [String: Any] = ["format": "sleek-notes", "version": 1, "folders": [["id": "fold000001", "name": "Home", "created": t, "updated": t]], "vaults": [String: Any](), "gone": [String: Any](),
      "notes": [["id": plumber, "title": "Call the plumber on Monday", "icon": "phone", "color": "#12A36A", "folder": "fold000001", "tags": ["calls"], "pin": false, "lock": false, "body": "<div>Ask about the &amp; boiler too</div>", "created": t, "updated": t, "stamp": t],
                ["id": "browser0001", "title": "Written in the browser", "icon": "bulb", "color": "#7C5CFF", "folder": "", "tags": [String](), "pin": false, "lock": false, "body": "<div class=\"ck\" data-done=\"0\">First</div><div class=\"ck\" data-done=\"1\">Second</div>", "created": t, "updated": t, "stamp": t]]]
    try? JSONSerialization.data(withJSONObject: theirs).write(to: shared.appendingPathComponent("browser/Notes.sleek"))
    let seen = NoteData.read(shared), kitchen = seen.first { $0.id == id }, call = seen.first { $0.id == plumber }, web = seen.first { $0.id == "browser0001" }
    say(seen.count == 4 && seen.first?.pin == true && kitchen?.lock == true && kitchen?.lines.isEmpty == true && kitchen?.peek == "Locked" && kitchen?.title == "Buy washers for the kitchen tap" && kitchen?.tags == ["house-jobs"], "a widget reads your notes, pinned ones first, and of a locked note only its title, icon and tags")
    say(call?.title == "Call the plumber on Monday" && call?.folder == "Home" && call?.lines.first?.text == "Ask about the & boiler too" && web?.lines == [NoteLine(text: "First", check: true, done: false), NoteLine(text: "Second", check: true, done: true)] && NoteData.symbol("home") == "house" && NoteData.symbol("?") == "note.text",
        "it takes each note from the app that changed it last, with its checklist and its icon")
    // and this app brings in what the browser changed
    Work.shared.peers = [shared.appendingPathComponent("browser")]
    let took = await Work.shared.pull()
    let merged = await until(8) { await self.yes("return SleekNotes.notes().length === 4 && !!SleekNotes.note('browser0001') && SleekNotes.note(p).title === 'Call the plumber on Monday' && SleekNotes.folders().length === 1", ["p": plumber]) }
    let shown = await until(8) { await self.yes("return document.querySelector('#rows').textContent.indexOf('Written in the browser') >= 0") }
    say(took >= 2 && merged && shown, "a note written or changed in the Sleek browser comes in here, and shows at once")

    // ---------- the widgets, drawn from those notes (and from the sample, as the list of widgets shows them) ----------
    for dark in [false, true] {
      for (name, e) in [("yours", NEntry(date: Date(), notes: seen, pick: web)), ("sample", NEntry.sample)] {
        func box<V: View>(_ w: CGFloat, _ h: CGFloat, _ v: V) -> some View { v.tint(.primary).padding(16).frame(width: w, height: h).background(NC.bg, in: RoundedRectangle(cornerRadius: 28, style: .continuous)) }
        let sheet = VStack(alignment: .leading, spacing: 18) {
          HStack(alignment: .top, spacing: 18) { box(170, 170, NPinnedView(e: e, family: .systemSmall)); box(364, 170, NPinnedView(e: e, family: .systemMedium)); box(170, 170, NJotView(family: .systemSmall)) }
          HStack(alignment: .top, spacing: 18) { box(364, 382, NPinnedView(e: e, family: .systemLarge)); box(364, 382, NNoteView(e: e, family: .systemLarge)) }
          HStack(alignment: .top, spacing: 18) { box(170, 170, NNoteView(e: e, family: .systemSmall)); box(364, 170, NNoteView(e: e, family: .systemMedium)); box(170, 170, NNoteView(e: NEntry(date: Date(), notes: e.notes, pick: e.notes.first { $0.lock }), family: .systemSmall)) }
          HStack(alignment: .top, spacing: 18) { box(364, 170, NRecentView(e: e, family: .systemMedium)); box(364, 170, NNoteView(e: NEntry(date: Date(), notes: e.notes, pick: e.notes.first { $0.lock }), family: .systemMedium)) }
          HStack(alignment: .center, spacing: 18) {
            NJotView(family: .accessoryCircular).frame(width: 72, height: 72); NRecentView(e: e, family: .accessoryRectangular).frame(width: 166, height: 72); NRecentView(e: e, family: .accessoryInline).frame(width: 260, height: 30)
          }.foregroundStyle(.white).padding(12).background(Color(white: 0.2), in: RoundedRectangle(cornerRadius: 22))
        }.padding(30).background(dark ? Color(white: 0.04) : nHex("#EDE6D6")).environment(\.colorScheme, dark ? .dark : .light)
        let r = ImageRenderer(content: sheet); r.scale = 1.5
        if let png = r.uiImage?.pngData(), let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first { try? png.write(to: docs.appendingPathComponent("widgets-\(name)-\(dark ? "dark" : "light").png")) }
      }
    }
    let drawn = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first.map { FileManager.default.fileExists(atPath: $0.appendingPathComponent("widgets-yours-dark.png").path) } ?? false
    say(drawn && NEntry.sample.pinned.count == 3 && NEntry(date: Date(), notes: seen).pinned.allSatisfy(\.pin), "every widget is drawn, light and dark: pinned notes, one note, recent notes, and Jot")

    try? FileManager.default.removeItem(at: Res.support); try? FileManager.default.removeItem(at: shared)
    print(failures == 0 ? "\nall passed (\(lines.count) checks)" : "\n\(failures) FAILED"); fflush(stdout)
    await nap(0.8); exit(failures == 0 ? 0 : 1)
  }
}

struct CheckView: View {
  @StateObject private var c = Checker()
  var body: some View {
    VStack(spacing: 0) {
      HostView(host: c.notes.host).frame(maxHeight: .infinity)
      ScrollViewReader { reader in
        ScrollView {
          VStack(alignment: .leading, spacing: 6) { ForEach(Array(c.lines.enumerated()), id: \.offset) { i, line in HStack(alignment: .top, spacing: 8) { Image(systemName: line.ok ? "checkmark.circle.fill" : "xmark.circle.fill").foregroundStyle(line.ok ? .green : .red); Text(line.text).font(.footnote) }.id(i) } }.frame(maxWidth: .infinity, alignment: .leading).padding(12)
        }.frame(height: 240).background(Color(.secondarySystemBackground)).onChange(of: c.lines.count) { _, n in reader.scrollTo(n - 1) }
      }
    }.task { await c.run() }
  }
}

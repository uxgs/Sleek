// Sleeky Notes for iPhone: jot something down in a second, and find it later.
//
// The app is the very page Sleeky Notes is on the web (../notes.html, ../note/), carried inside the app and filling
// the screen, so your notes look and work the same everywhere. Around it the app adds what only an iPhone app can:
//   the opening      Sleek's mark and the opening sound, as every Sleek app opens (../ios-shared/Opening.swift)
//   Face ID          a locked note opens with Face ID or Touch ID: the key to your locked notes is kept in the
//                    iPhone's keychain, where only that (or the iPhone's passcode) releases it (NoteKeys, below).
//                    The passcode you chose for your notes still opens them, here and everywhere else.
//   one copy         the notes are shared with the Sleek browser on this iPhone, and read by the widgets, through
//                    the folder the Sleek apps share (../ios-shared/Shared.swift, ../browser/Sources/Sleek/Work.swift)
//   widgets          pinned notes, one note, recent notes and a Jot button (../ios-shared/NoteWidgets.swift)
//   addresses        sleek-notes://open, ://open?id=<a note>, ://jot and ://new, for the widgets and the browser
import SwiftUI
import WebKit
import LocalAuthentication

/// The key to your locked notes, in the iPhone's keychain. It is stored so that reading it needs you: Face ID, Touch ID,
/// or the iPhone's passcode. It never leaves this iPhone, and is not in any backup.
enum NoteKeys {
  private static let service = "com.sleek.notes.lock"
  /// While the app checks itself there is nobody to look at the phone: keys are kept in memory instead, and thrown away.
  nonisolated(unsafe) static var testing: [String: String]? = Res.proving ? [:] : nil
  static var can: Bool { testing != nil || LAContext().canEvaluatePolicy(.deviceOwnerAuthentication, error: nil) }
  /// What this iPhone calls it.
  static var name: String {
    if testing != nil { return "Face ID" }
    let c = LAContext(); _ = c.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: nil)
    switch c.biometryType { case .faceID: return "Face ID"; case .touchID: return "Touch ID"; case .opticID: return "Optic ID"; default: return "your iPhone passcode" }
  }
  private static func item(_ id: String) -> [String: Any] { [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: id] }
  /// Keep a lock's key. False when this iPhone cannot guard it (no passcode set).
  static func keep(_ id: String, _ key: String) -> Bool {
    if testing != nil { testing?[id] = key; return true }
    guard let access = SecAccessControlCreateWithFlags(nil, kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly, .userPresence, nil) else { return false }
    SecItemDelete(item(id) as CFDictionary)
    var add = item(id); add[kSecAttrAccessControl as String] = access; add[kSecValueData as String] = Data(key.utf8)
    return SecItemAdd(add as CFDictionary, nil) == errSecSuccess
  }
  /// The key, once you have shown it is you: (key, false). (nil, true) when there is no key here; (nil, false) when it is refused.
  static func key(_ id: String, done: @escaping (String?, Bool) -> Void) {
    if let t = testing { done(t[id], t[id] == nil); return }
    let ctx = LAContext(); ctx.localizedReason = "Open your locked note"
    DispatchQueue.global(qos: .userInitiated).async {
      var q = item(id); q[kSecReturnData as String] = true; q[kSecMatchLimit as String] = kSecMatchLimitOne; q[kSecUseAuthenticationContext as String] = ctx
      var out: CFTypeRef?
      let status = SecItemCopyMatching(q as CFDictionary, &out), k = status == errSecSuccess ? (out as? Data).flatMap { String(data: $0, encoding: .utf8) } : nil
      DispatchQueue.main.async { done(k, status == errSecItemNotFound) }
    }
  }
}

@MainActor
final class Notes: NSObject, ObservableObject, WKScriptMessageHandlerWithReply {
  let host: Host
  @Published var jotting = false
  private var began = false
  /// What the app takes away from the page: the way back to Sleek's front page (there is none here), and saving a copy
  /// as a download (a file is sent from the app instead).
  static let css = ".brand { pointer-events: none; } [data-act=\"export\"], [data-act=\"import\"] { display: none !important; }"
  override init() {
    host = Host(css: Notes.css)
    super.init()
    host.web.configuration.userContentController.addScriptMessageHandler(self, contentWorld: .page, name: "sleekLock")
    host.web.scrollView.isScrollEnabled = false      // the page fills the screen and scrolls inside itself
  }
  /// The page asking about the lock (../note/lock.js): { do: "can" } → { can, name }; { do: "keep", id, key } → { ok };
  /// { do: "key", id } → { key } once Face ID lets it go, { missing: true } when no key is kept here, or {} when it is refused.
  func userContentController(_ c: WKUserContentController, didReceive message: WKScriptMessage, replyHandler: @escaping (Any?, String?) -> Void) {
    guard message.frameInfo.isMainFrame, message.frameInfo.request.url?.scheme == "sleek", let m = message.body as? [String: Any], let what = m["do"] as? String else { replyHandler(nil, "not allowed"); return }
    let id = m["id"] as? String ?? "", ok = id.range(of: "^[a-z0-9]{6,24}$", options: .regularExpression) != nil
    switch what {
    case "can": replyHandler(["can": NoteKeys.can, "name": NoteKeys.name], nil)
    case "keep": replyHandler(["ok": ok && NoteKeys.keep(id, m["key"] as? String ?? "")], nil)
    case "key": if ok { NoteKeys.key(id) { k, missing in replyHandler(k.map { ["key": $0] } ?? (missing ? ["missing": true] : [String: Any]()), nil) } } else { replyHandler([String: Any](), nil) }
    default: replyHandler(nil, "unknown")
    }
  }
  func start() {
    guard !began else { return }; began = true
    Work.shared.share(as: "notes", holds: ["notes"], else: Res.support.appendingPathComponent("Work"))      // with the Sleek browser on this iPhone, and for the widgets
    Work.shared.start()
    host.open("sleek://app/notes.html")
    Timer.scheduledTimer(withTimeInterval: 120, repeats: true) { _ in Task { @MainActor in await Work.shared.keepCopy() } }
  }
  /// The page is there, and its notes are read.
  func ready() async -> Bool {
    for _ in 0..<150 { if await host.js("return !!(window.SleekNotesApp && !document.documentElement.classList.contains('booting'))") as? Bool == true { return true }; try? await Task.sleep(nanoseconds: 100_000_000) }
    return false
  }
  /// What a widget or the Sleek browser asked for (NoteData.ask), once the latest notes are in.
  func go(_ url: URL) {
    if url.isFileURL { Task { await bring(url) }; return }
    guard let a = NoteData.ask(url) else { return }
    Task {
      guard await ready() else { return }
      await Work.shared.pull()
      switch a.what {
      case "jot": jotting = true
      case "new": host.tell("SleekNotesApp.add()")
      default: if let id = a.id { host.tell("SleekNotesApp.open(id)", ["id": id]) } else { host.tell("SleekNotesApp.list()") }
      }
    }
  }
  /// Keep what was typed in the app's own Jot sheet as a new note.
  func jot(_ text: String) { let t = text.trimmingCharacters(in: .whitespacesAndNewlines); if !t.isEmpty { tap(.medium); host.tell("SleekNotesApp.list(); SleekNotesApp.jot(t)", ["t": t]) } }
  /// A .sleek file of notes sent to the phone: its notes come in beside yours.
  func bring(_ url: URL) async {
    let scoped = url.startAccessingSecurityScopedResource(); defer { if scoped { url.stopAccessingSecurityScopedResource() } }
    guard await ready(), let text = try? String(contentsOf: url, encoding: .utf8) else { return }
    _ = await host.js("try { var r = await SleekNotes.importAll(t); location.reload(); return r.notes; } catch(e){ return -1; }", ["t": text])
  }
  /// The app is being left: an open locked note locks again, and the copy the other apps and the widgets read is written.
  func away() { host.tell("if(window.SleekNotesApp) SleekNotesApp.away()"); Work.shared.leaving(wait: 0.6) }
}

struct NotesRoot: View {
  @StateObject private var notes = Notes()
  @Environment(\.scenePhase) private var phase
  var body: some View {
    HostView(host: notes.host).ignoresSafeArea(.container)
      .background(Color(.systemBackground).ignoresSafeArea())
      .onAppear { notes.start() }
      .onChange(of: phase) { _, now in if now == .background { notes.away() } else if now == .active { Task { await Work.shared.pull() } } }
      .onOpenURL { notes.go($0) }
      .sheet(isPresented: $notes.jotting) { JotSheet { notes.jot($0) } }
  }
}

/// The box a widget's Jot opens: the keyboard is up at once, and Keep (or return) saves the note.
struct JotSheet: View {
  let keep: (String) -> Void
  @State private var text = ""
  @FocusState private var typing: Bool
  @Environment(\.dismiss) private var dismiss
  private let amber = Color(UIColor { $0.userInterfaceStyle == .dark ? UIColor(red: 1, green: 0.773, blue: 0.239, alpha: 1) : UIColor(red: 0.961, green: 0.659, blue: 0.047, alpha: 1) })
  private func save() { keep(text); dismiss() }
  var body: some View {
    VStack(alignment: .leading, spacing: 14) {
      HStack {
        Text("Jot a note").font(.system(size: 20, weight: .bold)).tracking(-0.4)
        Spacer()
        Button("Cancel") { dismiss() }.foregroundStyle(.secondary)
      }
      HStack(alignment: .bottom, spacing: 8) {
        TextField("Jot something down…", text: $text, axis: .vertical).lineLimit(1...5).font(.system(size: 17)).focused($typing).submitLabel(.done)
          .onChange(of: text) { _, now in if now.hasSuffix("\n") { text = String(now.dropLast()); save() } }      // return keeps it
        Button { save() } label: { Image(systemName: "arrow.up").font(.system(size: 17, weight: .bold)).foregroundStyle(Color(red: 0.165, green: 0.106, blue: 0)).frame(width: 40, height: 40).background(amber, in: Circle()) }
          .buttonStyle(Press()).disabled(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty).accessibilityLabel("Keep this note")
      }
      .padding(.leading, 16).padding(.trailing, 6).padding(.vertical, 6).background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 26, style: .continuous))
      .overlay(RoundedRectangle(cornerRadius: 26, style: .continuous).strokeBorder(amber.opacity(typing ? 1 : 0), lineWidth: 2)).shadow(color: amber.opacity(typing ? 0.28 : 0), radius: 14)
      .animation(.easeOut(duration: 0.25), value: typing)
      Spacer(minLength: 0)
    }
    .padding(20)
    .presentationDetents([.height(170)]).presentationDragIndicator(.visible)
    .onAppear { typing = true }
  }
}

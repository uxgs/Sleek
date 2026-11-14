// Sleek for iPhone: the Passwords screen. The vault is the Mac app's own (Vault.swift): one encrypted file
// on this iPhone, its key in the iPhone's Keychain, opened with Face ID or the passcode and closed again
// when you leave the app or five minutes after it was last used. What a page says about its sign-in boxes,
// and the offers beside the bar, are in Model.swift and Views.swift.
import LocalAuthentication
import SwiftUI
import UniformTypeIdentifiers

struct Saved: Identifiable, Equatable { let id: String, site: String, user: String, verdict: String, sharedWith: Int, changed: Double }

/// A passwords file to hand to another app. It is not encrypted.
struct PasswordsFile: FileDocument {
  static var readableContentTypes: [UTType] { [.commaSeparatedText] }
  var text = ""
  init(text: String) { self.text = text }
  init(configuration: ReadConfiguration) throws { text = String(decoding: configuration.file.regularFileContents ?? Data(), as: UTF8.self) }
  func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper { FileWrapper(regularFileWithContents: Data(text.utf8)) }
}

struct PasswordsScreen: View {
  @ObservedObject var b: Browser
  let sheet: Bool                                  // shown as its own sheet (with Done), or inside Settings
  @Environment(\.dismiss) private var dismiss
  @State private var query = ""
  @State private var adding = false
  @State private var importing = false
  @State private var exporting = false
  @State private var sureExport = false
  @State private var file = PasswordsFile(text: "")
  @State private var asked = false
  private var V: Vault { Vault.shared }
  private var items: [Saved]? {
    V.list()?.map { Saved(id: $0["id"] as? String ?? "", site: $0["site"] as? String ?? "", user: $0["user"] as? String ?? "", verdict: $0["verdict"] as? String ?? "", sharedWith: $0["sharedWith"] as? Int ?? 1, changed: $0["changed"] as? Double ?? 0) }
  }
  var body: some View {
    Group { if let all = items { open(all) } else { locked } }
      .navigationTitle("Passwords").navigationBarTitleDisplayMode(.inline)
      .toolbar {
        if sheet { ToolbarItem(placement: .cancellationAction) { Button("Done") { dismiss() } } }
        if items != nil {
          ToolbarItem(placement: .primaryAction) {
            Menu {
              Button { adding = true } label: { Label("Add a Password", systemImage: "plus") }
              Button { importing = true } label: { Label("Bring In from a File…", systemImage: "square.and.arrow.down") }
              Button { sureExport = true } label: { Label("Save All to a File…", systemImage: "square.and.arrow.up") }
              Button { V.lock() } label: { Label("Lock Now", systemImage: "lock") }
            } label: { Image(systemName: "ellipsis.circle") }
          }
        }
      }
      .sheet(isPresented: $adding) { NavigationStack { EditPassword(b: b, id: nil) }.presentationDetents([.large]).presentationCornerRadius(28) }
      .fileImporter(isPresented: $importing, allowedContentTypes: [.commaSeparatedText, .plainText]) { got in
        guard case .success(let f) = got else { return }
        let mine = f.startAccessingSecurityScopedResource(); defer { if mine { f.stopAccessingSecurityScopedResource() } }
        guard let text = try? String(contentsOf: f, encoding: .utf8) else { b.say("That file could not be read"); return }
        if let r = V.bring(csv: text) { b.say(r.added == 0 && r.here == 0 ? "No passwords were found in that file" : "Brought in \(r.added)" + (r.here > 0 ? "; \(r.here) were here already" : "") + ". Now delete that file.") } else { b.say("Unlock your passwords first") }
      }
      .confirmationDialog("This file is not locked. Anyone who opens it can read every password in it.", isPresented: $sureExport, titleVisibility: .visible) {
        Button("Save All to a File") { if let t = V.csv() { file = PasswordsFile(text: t); exporting = true } }
      }
      .fileExporter(isPresented: $exporting, document: file, contentType: .commaSeparatedText, defaultFilename: "Sleek passwords") { r in file = PasswordsFile(text: ""); if case .success = r { b.say("Saved. Keep that file somewhere safe, or delete it when you are done.") } }
      .onAppear { if !asked && !V.isOpen { asked = true; unlock() } }
  }
  private func unlock() { Task { @MainActor in _ = await V.unlock("show your passwords") } }

  // ---------- closed ----------
  private var canAsk: Bool { Res.proving || LAContext().canEvaluatePolicy(.deviceOwnerAuthentication, error: nil) }
  private var locked: some View {
    VStack(spacing: 14) {
      Spacer()
      Image(systemName: "lock.fill").font(.system(size: 30, weight: .medium)).foregroundStyle(.white).frame(width: 76, height: 76).background(sleekRun, in: Circle()).shadow(color: Color.sleekB.opacity(0.45), radius: 20, y: 10)
      Text("Your passwords are locked").font(.system(size: 24, weight: .bold)).tracking(-0.5)
      Text(V.unreadable ? "The key to your passwords is not in this iPhone’s Keychain, so they cannot be opened. The file has been left as it is." : !canAsk ? "Set a passcode on this iPhone first. Passwords open with Face ID or your passcode." : "They are kept on this iPhone only, encrypted, and never sent anywhere.").font(.system(size: 15)).foregroundStyle(.secondary).multilineTextAlignment(.center).padding(.horizontal, 36)
      if !V.unreadable && canAsk {
        Button { tap(.medium); unlock() } label: { Label("Unlock", systemImage: "faceid").font(.system(size: 17, weight: .semibold)).padding(.horizontal, 26).frame(height: 52).foregroundStyle(Color(.systemBackground)).background(Color.primary, in: Capsule()) }.buttonStyle(Press()).padding(.top, 8)
      }
      Spacer(); Spacer()
    }.frame(maxWidth: .infinity)
  }

  // ---------- open ----------
  private func open(_ all: [Saved]) -> some View {
    let q = query.lowercased().trimmingCharacters(in: .whitespaces), shown = q.isEmpty ? all : all.filter { $0.site.contains(q) || $0.user.lowercased().contains(q) }
    let poor = all.filter { $0.verdict == "weak" || $0.verdict == "reused" }
    return List {
      if all.isEmpty {
        VStack(spacing: 8) { Image(systemName: "key").font(.system(size: 30)).foregroundStyle(.secondary); Text("No passwords yet").font(.system(size: 19, weight: .semibold)); Text("Sign in to a site and Sleek offers to keep the password. Or add one, or bring them in from another browser, from the menu above.").font(.system(size: 15)).foregroundStyle(.secondary).multilineTextAlignment(.center) }.frame(maxWidth: .infinity).padding(.vertical, 50).listRowSeparator(.hidden).listRowBackground(Color.clear)
      }
      if !poor.isEmpty && q.isEmpty {
        Section { ForEach(poor) { row($0) } } header: { Text("Worth changing") } footer: { Text("Easy to guess, or used for more than one sign-in.") }
      }
      Section { ForEach(shown) { row($0) }.onDelete { at in at.map { shown[$0].id }.forEach { V.remove($0) } } } header: { if !all.isEmpty { Text(q.isEmpty ? "All" : "Found") } }
      if q.isEmpty {
        Section { Toggle("Offer to save passwords", isOn: Binding(get: { b.savePasswords }, set: { b.store.set("savePasswords", $0); b.objectWillChange.send() })) }
        if !V.never.isEmpty { Section { ForEach(V.never.sorted(), id: \.self) { Text($0) }.onDelete { at in let n = V.never.sorted(); at.map { n[$0] }.forEach { V.neverSave(for: $0, false) } } } header: { Text("Never saved for") } footer: { Text("Swipe a site away and Sleek offers to save for it again.") } }
      }
    }
    .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always), prompt: "Search").textInputAutocapitalization(.never).autocorrectionDisabled()
    .animation(.spring(response: 0.35, dampingFraction: 0.85), value: all)
  }
  private func row(_ s: Saved) -> some View {
    NavigationLink { PasswordDetail(b: b, id: s.id) } label: {
      HStack(spacing: 12) {
        SiteIcon(host: s.site, size: 36)
        VStack(alignment: .leading, spacing: 1) { Text(s.site).font(.system(size: 16, weight: .medium)).lineLimit(1); Text(s.user.isEmpty ? "No name" : s.user).font(.system(size: 13)).foregroundStyle(.secondary).lineLimit(1) }
        Spacer(minLength: 0)
        if s.verdict == "weak" || s.verdict == "reused" { Image(systemName: "exclamationmark.triangle.fill").font(.system(size: 13)).foregroundStyle(.orange) }
      }
    }
  }
}

/// One saved sign-in: its name and password to show and copy, how good the password is, a stronger one, changing and removing it.
struct PasswordDetail: View {
  @ObservedObject var b: Browser
  let id: String
  @Environment(\.dismiss) private var dismiss
  @State private var shown: String?
  @State private var made: String?
  @State private var editing = false
  @State private var sure = false
  private var V: Vault { Vault.shared }
  private var item: [String: Any]? { V.list()?.first { ($0["id"] as? String) == id } }
  var body: some View {
    let x = item ?? [:], site = x["site"] as? String ?? "", user = x["user"] as? String ?? "", verdict = x["verdict"] as? String ?? "", shared = x["sharedWith"] as? Int ?? 1, length = x["length"] as? Int ?? 8
    List {
      if item == nil { Text("Your passwords are locked.").foregroundStyle(.secondary) }
      else {
        Section {
          HStack(spacing: 12) { SiteIcon(host: site, size: 44); Text(site).font(.system(size: 20, weight: .bold)).lineLimit(1) }.padding(.vertical, 4)
          Button { V.copy(user, forgetAfter: 600); tap(); b.say("Name copied") } label: { LabeledContent("Name") { Text(user.isEmpty ? "None" : user).foregroundStyle(.secondary).lineLimit(1) } }.foregroundStyle(.primary).disabled(user.isEmpty)
          HStack {
            Text("Password"); Spacer()
            Text(shown ?? String(repeating: "•", count: min(length, 14))).font(.system(size: shown == nil ? 17 : 15, design: .monospaced)).foregroundStyle(.secondary).lineLimit(2).multilineTextAlignment(.trailing).textSelection(.enabled)
            Button { tap(); withAnimation(.easeOut(duration: 0.15)) { shown = shown == nil ? V.reveal(id) : nil } } label: { Image(systemName: shown == nil ? "eye" : "eye.slash").frame(width: 32, height: 32) }.buttonStyle(.borderless)
          }
          Button { if let p = V.reveal(id) { V.copy(p); tap(.medium); b.say("Copied. It leaves the clipboard in a minute.") } } label: { Label("Copy Password", systemImage: "doc.on.doc") }
        } footer: { Text(verdict == "reused" ? "This password is used for \(shared) sign-ins. If one site loses it, the others are open too." : verdict == "weak" ? "This password is easy to guess." : verdict == "fair" ? "This password is fair. A longer one would be stronger." : "This password is strong.") }
        Section {
          if let m = made {
            Text(m).font(.system(size: 15, design: .monospaced)).textSelection(.enabled)
            Button { b.useNew(m, for: site); dismiss() } label: { Label("Copy It and Open the Site", systemImage: "arrow.up.forward.square") }
            Button { withAnimation { made = Vault.generate(words: false, length: 20) } } label: { Label("Another", systemImage: "arrow.triangle.2.circlepath") }
          } else { Button { tap(); withAnimation { made = Vault.generate(words: false, length: 20) } } label: { Label(verdict == "strong" ? "Make a New Password" : "Make a Stronger Password", systemImage: "wand.and.stars") } }
        } footer: { if made != nil { Text("Sleek copies the new password and opens the site’s page for changing it. Once the site has taken it, Sleek keeps it in place of the old one.") } }
        Section {
          Button { if let u = URL(string: "https://" + site + "/") { b.newTab(u, isPrivate: false); dismiss() } } label: { Label("Open " + site, systemImage: "safari") }
          Button { editing = true } label: { Label("Change", systemImage: "pencil") }
          Button(role: .destructive) { sure = true } label: { Label("Remove", systemImage: "trash") }
        }
      }
    }
    .navigationTitle(site).navigationBarTitleDisplayMode(.inline)
    .sheet(isPresented: $editing) { NavigationStack { EditPassword(b: b, id: id) }.presentationDetents([.large]).presentationCornerRadius(28) }
    .confirmationDialog("Remove this password from Sleek?", isPresented: $sure, titleVisibility: .visible) { Button("Remove", role: .destructive) { V.remove(id); dismiss() } }
    .onDisappear { shown = nil }
  }
}

/// A new sign-in, or changes to a saved one.
struct EditPassword: View {
  @ObservedObject var b: Browser
  let id: String?
  @Environment(\.dismiss) private var dismiss
  @State private var site = ""
  @State private var user = ""
  @State private var password = ""
  @State private var words = false
  private var V: Vault { Vault.shared }
  var body: some View {
    let s = Vault.strength(password)
    Form {
      Section("Site") { TextField("example.com", text: $site).keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled() }
      Section("Name") { TextField("Name or email", text: $user).keyboardType(.emailAddress).textInputAutocapitalization(.never).autocorrectionDisabled() }
      Section {
        TextField("Password", text: $password).font(.system(size: 16, design: .monospaced)).textInputAutocapitalization(.never).autocorrectionDisabled()
        Button { tap(); password = Vault.generate(words: words, length: words ? 24 : 20) } label: { Label("Make One", systemImage: "wand.and.stars") }
        Toggle("Of words, easier to type", isOn: $words)
      } header: { Text("Password") } footer: { if !password.isEmpty { Text(s.verdict == "weak" ? "Easy to guess." : s.verdict == "fair" ? "Fair. A longer one would be stronger." : "Strong.") } }
    }
    .navigationTitle(id == nil ? "Add a Password" : "Change").navigationBarTitleDisplayMode(.inline)
    .toolbar {
      ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
      ToolbarItem(placement: .confirmationAction) { Button("Save") { save() }.disabled(site.trimmingCharacters(in: .whitespaces).isEmpty || password.isEmpty) }
    }
    .onAppear {
      guard let id = id, let x = V.list()?.first(where: { ($0["id"] as? String) == id }) else { return }
      site = x["site"] as? String ?? ""; user = x["user"] as? String ?? ""; password = V.reveal(id) ?? ""
    }
  }
  private func save() {
    let ok = id.map { V.change($0, site: site, user: user, password: password) } ?? V.add(site: site.trimmingCharacters(in: .whitespaces), user: user, password: password)
    if ok { tap(.medium); dismiss() } else { b.say("That could not be saved") }
  }
}

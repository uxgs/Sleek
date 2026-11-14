// Passwords in a window: offering to fill a sign-in, offering to keep one, and the Passwords page.
// (The vault itself is Vault.swift; what a page tells the browser about its sign-in boxes is in Tab.swift.)
import AppKit
import WebKit

extension BrowserWindow {
  // ---------- filling ----------
  /// The cursor went into a sign-in box. Offer the names saved for this site; or, where a new password is being chosen, a strong one.
  func signInField(_ t: Tab, site: String, rect: [String: Any], fresh: Bool, on field: String) {
    guard panes.contains(t.id) else { return }
    let users = fresh ? [] : Vault.shared.users(for: site), strong = fresh && field == "pass" && !isPrivate
    if users.isEmpty && !strong { tell(["type": "pw-hide", "tab": t.id]); return }
    if strong, t.suggested == nil { t.suggested = Vault.generate(words: false, length: 20) }
    tell(["type": "pw-offer", "tab": t.id, "site": site, "rect": rect, "users": users, "strong": strong ? (t.suggested ?? "") : ""])
  }
  func signInLeft(_ t: Tab) { tell(["type": "pw-hide", "tab": t.id]) }
  /// From the bar: fill this saved sign-in, once Touch ID has said yes; or (no sign-in named) use the strong password offered.
  func fillSignIn(tab id: String, login: String?) {
    guard let t = tab(id) else { return }
    let site = Vault.site(t.web.url?.host)
    guard let login = login else { if let s = t.suggested { t.fill(user: "", password: s, both: true); window.makeFirstResponder(t.web) }; return }
    Task { @MainActor in
      guard await Vault.shared.unlock("fill your password for " + site) else { return }
      // only ever into the site it was saved for
      guard let l = Vault.shared.password(for: login), l.site == Vault.site(t.web.url?.host) else { tell(["type": "toast", "text": "That password could not be filled here"]); return }
      t.fill(user: l.user, password: l.password, both: false); window.makeFirstResponder(t.web)
    }
  }

  // ---------- keeping ----------
  /// A page was sent a name and password. Unless they are kept already, offer to keep them (or keep them at once, when the password is one Sleek made).
  func signedIn(_ t: Tab, site: String, address: String, user: String, password: String) {
    if isPrivate || (store.settings["savePasswords"] as? Bool) == false || Vault.shared.never.contains(site) { return }
    let ours = t.suggested == password || Vault.shared.awaited[site] == password
    var replacing: String?
    switch Vault.shared.have(site: site, user: user, password: password) {
    case .same, .unknown: return
    case .changed(let id): replacing = id
    case .new: replacing = nil
    }
    if ours {
      if Vault.shared.save(site: site, url: address, user: user, password: password, replacing: replacing) { tell(["type": "toast", "text": "Your new password for " + site + " is saved"]) }
      t.suggested = nil; Vault.shared.awaited[site] = nil; return
    }
    pendingLogin = (site, address, user, password, replacing)
    tell(["type": "pw-ask", "site": site, "user": user, "update": replacing != nil])
  }
  /// From the bar: keep the sign-in that is waiting, never ask for this site again, or leave it.
  func answerSignIn(_ how: String) {
    guard let p = pendingLogin else { return }; pendingLogin = nil
    if how == "save" { tell(["type": "toast", "text": Vault.shared.save(site: p.site, url: p.address, user: p.user, password: p.password, replacing: p.replacing) ? (p.replacing == nil ? "Password saved" : "Password updated") : "That could not be saved"]) }
    else if how == "never" { Vault.shared.neverSave(for: p.site, true); tell(["type": "toast", "text": "Sleek won’t offer to save passwords for " + p.site]) }
  }

  // ---------- the Passwords page ----------
  static let passwordsPage = URL(string: "sleek://ui/passwords.html")!
  func showPasswords() { if let have = tabs.first(where: { $0.kind == "passwords" }) { select(have.id) } else { newTab(BrowserWindow.passwordsPage) } }
  /// The vault changed (or opened, or closed): any Passwords page showing follows.
  func passwordsChanged() { for t in tabs where t.kind == "passwords" { fillPasswords(t) } }
  private func fillPasswords(_ t: Tab) {
    let V = Vault.shared
    var s: [String: Any] = ["open": V.isOpen, "count": V.count, "never": V.never.sorted(), "offer": (store.settings["savePasswords"] as? Bool) != false, "unreadable": V.unreadable, "still": Res.selfTest != nil]
    if let l = V.list() { s["items"] = l }
    t.web.evaluateJavaScript("window.Passwords && Passwords.fill(" + json(s) + ")")
  }
  private func word(_ text: String) -> String { String(json([text]).dropFirst().dropLast()) }      // a piece of text, written so a page's script can read it
  func passwordsPage(_ t: Tab, _ what: String, _ m: [String: Any]) {
    let V = Vault.shared, id = m["id"] as? String ?? ""
    func note(_ text: String) { t.web.evaluateJavaScript("window.Passwords && Passwords.note(" + word(text) + ")") }
    switch what {
    case "state": fillPasswords(t)
    case "unlock": Task { @MainActor in if !(await V.unlock("show your passwords")) { note(V.unreadable ? "The key to your passwords is not in this Mac’s Keychain, so they cannot be opened." : "Not unlocked") }; self.fillPasswords(t) }
    case "lock": V.lock()
    case "show": if let p = V.reveal(id) { t.web.evaluateJavaScript("window.Passwords && Passwords.shown(" + word(id) + ", " + word(p) + ")") } else { fillPasswords(t) }
    case "copy":
      if m["of"] as? String == "user" { if let u = V.list()?.first(where: { ($0["id"] as? String) == id })?["user"] as? String { V.copy(u, forgetAfter: 600); note("Copied") } }
      else if let p = V.reveal(id) { V.copy(p); note("Copied. It leaves the clipboard in a minute.") } else { fillPasswords(t) }
    case "delete": if !V.remove(id) { fillPasswords(t) }
    case "change": if !V.change(id, site: m["site"] as? String, user: m["user"] as? String, password: m["password"] as? String) { note("That could not be saved"); fillPasswords(t) }
    case "add":
      let site = (m["site"] as? String ?? "").trimmingCharacters(in: .whitespaces), pass = m["password"] as? String ?? ""
      if site.isEmpty || pass.isEmpty { note("A sign-in needs a site and a password") } else if !V.add(site: site, user: m["user"] as? String ?? "", password: pass) { note("That could not be saved"); fillPasswords(t) }
    case "make": t.web.evaluateJavaScript("window.Passwords && Passwords.made(" + word(Vault.generate(words: m["words"] as? Bool ?? false, length: (m["length"] as? NSNumber)?.intValue ?? 20)) + ")")
    case "use":      // a stronger password for a saved sign-in: onto the clipboard, the site's change-password page opened, and kept once the site has taken it
      guard let new = m["password"] as? String, !new.isEmpty, let site = V.list()?.first(where: { ($0["id"] as? String) == id })?["site"] as? String else { return }
      V.copy(new); V.awaited[site] = new
      if let u = URL(string: "https://" + site + "/.well-known/change-password") { newTab(u) }
      tell(["type": "toast", "text": "The new password is on the clipboard. Sleek keeps it once " + site + " has taken it."])
    case "import":
      let p = NSOpenPanel(); p.allowsMultipleSelection = false; p.message = "Choose the passwords file you exported from Chrome, Safari or another browser (a .csv file)."
      guard p.runModal() == .OK, let f = p.url, let text = try? String(contentsOf: f, encoding: .utf8) else { return }
      if let r = V.bring(csv: text) { note(r.added == 0 && r.here == 0 ? "No passwords were found in that file" : "Brought in \(r.added)" + (r.here > 0 ? "; \(r.here) were here already" : "") + ". Now delete that file: anyone who opens it can read your passwords.") } else { note("Unlock your passwords first"); fillPasswords(t) }
    case "export":
      guard let text = V.csv() else { fillPasswords(t); return }
      let p = NSSavePanel(); p.nameFieldStringValue = "Sleek passwords.csv"; p.message = "This file is not locked. Anyone who opens it can read every password in it."
      if p.runModal() == .OK, let f = p.url { try? text.write(to: f, atomically: true, encoding: .utf8); note("Saved. Keep that file somewhere safe, or delete it when you are done.") }
    case "offer": store.set("savePasswords", m["on"] as? Bool ?? true); fillPasswords(t)
    case "allow": V.neverSave(for: m["site"] as? String ?? "", false)
    case "open": if let u = URL(string: "https://" + (m["site"] as? String ?? "") + "/"), u.host != nil { newTab(u) }
    default: break
    }
  }
}

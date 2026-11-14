// Passwords, kept on this Mac and nowhere else.
//
// Where they are: one file, ~/Library/Application Support/Sleek/passwords.sleekvault. The sign-ins in
// it are encrypted (AES-GCM, 256-bit); the key is kept in the Mac's own Keychain ("Sleek Passwords"),
// which is itself locked with your Mac login. The file also lists, in the clear, which sites have a
// sign-in saved (so Sleek can offer to fill without opening anything) and which sites you said never
// to save for. Names and passwords are never in the clear on disk.
//
// Who can see them: showing, copying or filling a password asks for Touch ID (or the Mac's password)
// first, and the vault closes again five minutes after it was last used. Saving a new sign-in does
// not ask (as with the Mac's own passwords). Until the app is signed for release, Touch ID is a gate
// the app keeps, not a lock on the key itself; with release signing the key can be bound to it.
//
// Nothing here is ever sent anywhere, and nothing is ever written over that could not be read: if
// the key is missing, the file is left exactly as it is.
import AppKit
import CryptoKit
import LocalAuthentication
import Security

struct Login: Codable {
  var id: String
  var site: String          // the site's name, without "www."
  var url: String           // the page it was saved on
  var user: String
  var password: String
  var added: Double         // when, in seconds since 1970
  var used: Double
  var changed: Double
}

@MainActor
final class Vault {
  static let shared = Vault()
  static let stayOpen: TimeInterval = 300
  private var file: URL?
  /// Sites with a sign-in saved, and sites never to save for: known without opening the vault.
  private(set) var sites: Set<String> = []
  private(set) var never: Set<String> = []
  private(set) var count = 0
  private var sealed: Data?               // the sign-ins, encrypted, as on disk
  private var logins: [Login]?            // the sign-ins, readable: only while the vault is open
  private var lastUse = Date.distantPast
  private var key: SymmetricKey?
  private var testKey: SymmetricKey?      // while the app checks itself: a key that is thrown away, so your Keychain is never touched
  var onChange: [() -> Void] = []
  /// A new password you chose on the Passwords page for a site, waiting for the site to take it: kept, in place of the old one, once it has.
  var awaited: [String: String] = [:]
  /// For the app's own checks: whether "Touch ID" says yes.
  var testApproves = true

  static func site(_ host: String?) -> String { let h = (host ?? "").lowercased(); return h.hasPrefix("www.") ? String(h.dropFirst(4)) : h }

  // ---------- the file ----------
  func start(dir: URL) {
    file = dir.appendingPathComponent("passwords.sleekvault")
    guard let f = file, let d = try? Data(contentsOf: f), let o = try? JSONSerialization.jsonObject(with: d) as? [String: Any] else { return }
    sites = Set(o["sites"] as? [String] ?? []); never = Set(o["never"] as? [String] ?? []); count = o["count"] as? Int ?? 0
    sealed = (o["sealed"] as? String).flatMap { Data(base64Encoded: $0) }
  }
  /// Write the file (readable by you alone). False when it could not be written.
  @discardableResult private func write() -> Bool {
    guard let f = file else { return false }
    var o: [String: Any] = ["v": 1, "sites": sites.sorted(), "never": never.sorted(), "count": count]
    if let s = sealed { o["sealed"] = s.base64EncodedString() }
    guard let d = try? JSONSerialization.data(withJSONObject: o, options: [.sortedKeys]), (try? d.write(to: f, options: .atomic)) != nil else { return false }
    try? FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: f.path)
    onChange.forEach { $0() }
    return true
  }
  /// The key: from the Mac's Keychain, made there the first time. Nil when the Keychain will not give it (you said no, or it is locked).
  private func theKey(make: Bool) -> SymmetricKey? {
    if let k = key { return k }
    if Res.selfTest != nil { if testKey == nil { testKey = SymmetricKey(size: .bits256) }; key = testKey; return key }
    let base: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: "Sleek Passwords", kSecAttrAccount as String: "vault key"]
    var find = base; find[kSecReturnData as String] = true; find[kSecMatchLimit as String] = kSecMatchLimitOne
    var out: CFTypeRef?
    let found = SecItemCopyMatching(find as CFDictionary, &out)
    if found == errSecSuccess, let d = out as? Data, d.count == 32 { key = SymmetricKey(data: d); return key }
    guard found == errSecItemNotFound, make, sealed == nil else { return nil }      // never a new key while there is a vault the old key locked
    var bytes = [UInt8](repeating: 0, count: 32)
    guard SecRandomCopyBytes(kSecRandomDefault, 32, &bytes) == errSecSuccess else { return nil }
    var add = base; add[kSecValueData as String] = Data(bytes); add[kSecAttrLabel as String] = "Sleek Passwords"
    add[kSecAttrDescription as String] = "The key to the passwords Sleek keeps on this Mac"
    guard SecItemAdd(add as CFDictionary, nil) == errSecSuccess else { return nil }
    key = SymmetricKey(data: Data(bytes)); return key
  }
  /// Read the sign-ins, without asking for Touch ID. For the app's own use (is this one saved already? which names does this site have?), never for showing a password.
  private func read() -> [Login]? {
    if let l = logins { return l }
    guard let s = sealed else { return [] }
    guard let k = theKey(make: false), let box = try? AES.GCM.SealedBox(combined: s), let plain = try? AES.GCM.open(box, using: k), let l = try? JSONDecoder().decode([Login].self, from: plain) else { return nil }
    return l
  }
  private func keep(_ l: [Login]) -> Bool {
    guard let k = theKey(make: true), let plain = try? JSONEncoder().encode(l), let box = try? AES.GCM.seal(plain, using: k), let combined = box.combined else { return false }
    let was = (sealed, sites, count, logins)
    sealed = combined; sites = Set(l.map { $0.site }); count = l.count
    if logins != nil { logins = l }
    if !write() { (sealed, sites, count, logins) = was; return false }      // not on disk, so not kept: say so rather than pretend
    return true
  }
  /// True when the vault cannot be read at all (its key is gone from the Keychain, or you refused it).
  var unreadable: Bool { sealed != nil && read() == nil }

  // ---------- opening and closing ----------
  var isOpen: Bool { logins != nil && Date().timeIntervalSince(lastUse) < Vault.stayOpen }
  private func used() { lastUse = Date() }
  func lock() { logins = nil; onChange.forEach { $0() } }
  /// For the app's own checks: as if five minutes had gone by since the vault was last used.
  func ageOut() { lastUse = .distantPast }
  /// Ask for Touch ID (or the Mac's password), then open the vault. `why` finishes "Sleek is trying to …".
  func unlock(_ why: String) async -> Bool {
    if isOpen { used(); return true }
    logins = nil
    var yes = false
    if Res.selfTest != nil { yes = testApproves }
    else {
      let c = LAContext(); c.localizedCancelTitle = "Cancel"
      var e: NSError?
      if c.canEvaluatePolicy(.deviceOwnerAuthentication, error: &e) { yes = (try? await c.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: why)) ?? false }
      else { yes = false }      // a Mac with no password set at all: nothing to ask, so nothing is shown
    }
    guard yes, let l = read() else { return false }
    logins = l; used(); onChange.forEach { $0() }; return true
  }

  // ---------- what a site has (no passwords leave here) ----------
  /// The names saved for a site, for the offer to fill. Known without Touch ID; the passwords are not.
  func users(for site: String) -> [[String: String]] { (read() ?? []).filter { $0.site == site }.sorted { $0.used > $1.used }.map { ["id": $0.id, "user": $0.user] } }
  enum Have { case same, changed(String), new, unknown }
  /// Is this name and password already saved for the site?
  func have(site: String, user: String, password: String) -> Have {
    guard let l = read() else { return .unknown }
    let mine = l.filter { $0.site == site }
    if let m = mine.first(where: { $0.user == user }) { return m.password == password ? .same : .changed(m.id) }
    if user.isEmpty, mine.count == 1 { return mine[0].password == password ? .same : .changed(mine[0].id) }
    return .new
  }
  /// Keep a sign-in: a new one, or a new password for one already saved. Does not ask for Touch ID.
  @discardableResult func save(site: String, url: String, user: String, password: String, replacing id: String? = nil) -> Bool {
    guard !site.isEmpty, !password.isEmpty, var l = read() else { return false }
    let now = Date().timeIntervalSince1970
    if let id = id, let i = l.firstIndex(where: { $0.id == id }) { l[i].password = password; l[i].changed = now; l[i].used = now; if !user.isEmpty { l[i].user = user }; if !url.isEmpty { l[i].url = url } }
    else { l.insert(Login(id: UUID().uuidString, site: site, url: url, user: user, password: password, added: now, used: now, changed: now), at: 0) }
    never.remove(site)
    return keep(l)
  }
  func neverSave(for site: String, _ on: Bool) { if on { never.insert(site) } else { never.remove(site) }; write() }
  /// The password to fill, once Touch ID has said yes. Marks the sign-in as used.
  func password(for id: String) -> Login? {
    guard isOpen, var l = logins, let i = l.firstIndex(where: { $0.id == id }) else { return nil }
    used(); l[i].used = Date().timeIntervalSince1970; let got = l[i]; _ = keep(l); return got
  }

  // ---------- the Passwords page (only while open) ----------
  /// Every sign-in, without its password: what the Passwords page lists.
  func list() -> [[String: Any]]? {
    guard isOpen, let l = logins else { return nil }
    used()
    var uses: [String: Int] = [:]; for x in l { uses[x.password, default: 0] += 1 }
    return l.sorted { $0.site == $1.site ? $0.user < $1.user : $0.site < $1.site }.map { x in
      let s = Vault.strength(x.password), again = (uses[x.password] ?? 1) > 1
      return ["id": x.id, "site": x.site, "url": x.url, "user": x.user, "added": x.added, "used": x.used, "changed": x.changed, "bits": Int(s.bits), "verdict": again && s.verdict != "weak" ? "reused" : s.verdict, "sharedWith": again ? (uses[x.password] ?? 1) : 1, "length": x.password.count]
    }
  }
  func reveal(_ id: String) -> String? { guard isOpen, let l = logins else { return nil }; used(); return l.first { $0.id == id }?.password }
  @discardableResult func change(_ id: String, site: String? = nil, user: String? = nil, password: String? = nil) -> Bool {
    guard isOpen, var l = logins, let i = l.firstIndex(where: { $0.id == id }) else { return false }
    used(); let now = Date().timeIntervalSince1970
    if let s = site.map(Vault.site), !s.isEmpty { l[i].site = s }
    if let u = user { l[i].user = u }
    if let p = password, !p.isEmpty, p != l[i].password { l[i].password = p; l[i].changed = now }
    return keep(l)
  }
  @discardableResult func add(site: String, user: String, password: String) -> Bool {
    guard isOpen else { return false }; used()
    let s = Vault.site(URL(string: site.contains("://") ? site : "https://" + site)?.host ?? site)
    return save(site: s, url: "https://" + s + "/", user: user, password: password)
  }
  @discardableResult func remove(_ id: String) -> Bool { guard isOpen, var l = logins else { return false }; used(); l.removeAll { $0.id == id }; return keep(l) }

  // ---------- copying: gone from the clipboard a minute later ----------
  /// The clipboard used (a private one while the app checks itself, so yours is left alone).
  let board: NSPasteboard = Res.selfTest != nil ? NSPasteboard(name: NSPasteboard.Name("sleek-selftest-clip")) : .general
  func copy(_ text: String, forgetAfter seconds: Double = 60) {
    board.clearContents(); board.setString(text, forType: .string)
    board.setString("", forType: NSPasteboard.PasteboardType("org.nspasteboard.ConcealedType"))      // clipboard histories are asked not to keep it
    let mine = board.changeCount
    DispatchQueue.main.asyncAfter(deadline: .now() + seconds) { [weak self] in if let b = self?.board, b.changeCount == mine { b.clearContents() } }
  }

  // ---------- how good a password is ----------
  static let common: Set<String> = ["password", "passw0rd", "password1", "123456", "1234567", "12345678", "123456789", "1234567890", "qwerty", "qwertyuiop", "abc123", "111111", "000000", "letmein", "iloveyou", "admin", "welcome", "monkey", "dragon", "sunshine", "princess", "trustno1", "changeme", "secret"]
  /// About how hard it is to guess, in bits, and a word for it: weak, fair or strong.
  static func strength(_ p: String) -> (bits: Double, verdict: String) {
    if p.isEmpty { return (0, "weak") }
    let low = p.lowercased()
    if common.contains(low) || Set(p).count <= 2 { return (4, "weak") }
    var pool = 0.0
    if p.contains(where: { $0.isLowercase }) { pool += 26 }; if p.contains(where: { $0.isUppercase }) { pool += 26 }
    if p.contains(where: { $0.isNumber }) { pool += 10 }; if p.contains(where: { !$0.isLetter && !$0.isNumber }) { pool += 32 }
    var bits = Double(p.count) * log2(max(pool, 2))
    // runs and repeats are worth far less than their length: "aaaa", "1234", "abcd"
    let u = Array(p.unicodeScalars).map { Int($0.value) }; var easy = 0
    if u.count > 1 { for i in 1..<u.count { let d = u[i] - u[i - 1]; if d == 0 || abs(d) == 1 { easy += 1 } } }
    bits -= Double(easy) * log2(max(pool, 2)) * 0.75
    // a single word with a digit or two on the end is a first guess
    if low.range(of: "^[a-z]+[0-9]{0,4}[!.]?$", options: .regularExpression) != nil { bits = min(bits, 30) }
    bits = max(bits, 4)
    return (bits, bits < 45 ? "weak" : bits < 72 ? "fair" : "strong")
  }

  // ---------- making one ----------
  private static var wordList: [String] = {
    let all = (try? String(contentsOfFile: "/usr/share/dict/words", encoding: .utf8)) ?? ""
    let w = all.split(separator: "\n").map(String.init).filter { $0.count >= 4 && $0.count <= 7 && $0.allSatisfy { $0.isASCII && $0.isLowercase } }
    return w.count > 2000 ? w : ["amber", "birch", "cedar", "delta", "ember", "fable", "glade", "harbor", "indigo", "jasper", "kettle", "lantern", "meadow", "nectar", "orchid", "pebble", "quartz", "river", "saffron", "thistle", "umber", "velvet", "willow", "yonder", "zephyr"]
  }()
  private static func pick(_ n: Int) -> Int { Int.random(in: 0..<n) }      // the Mac's own secure randomness
  /// A password: letters, digits and symbols in easy-to-read groups, or a run of words that is easier to type.
  static func generate(words: Bool, length: Int) -> String {
    let len = max(12, min(40, length))
    if words {
      var out: [String] = [], total = 0
      while total < len - 3 || out.count < 4 { var w = wordList[pick(wordList.count)]; if out.count % 2 == 1 { w = w.prefix(1).uppercased() + w.dropFirst() }; out.append(w); total += w.count + 1 }
      return out.joined(separator: "-") + "-" + String(10 + pick(90))
    }
    let lower = Array("abcdefghijkmnpqrstuvwxyz"), upper = Array("ABCDEFGHJKLMNPQRSTUVWXYZ"), digit = Array("23456789"), sym = Array("!#%*+?@")
    let any = lower + lower + upper + digit + sym
    var c: [Character] = [lower[pick(lower.count)], upper[pick(upper.count)], digit[pick(digit.count)], sym[pick(sym.count)]]
    while c.count < len { c.append(any[pick(any.count)]) }
    c.shuffle()
    return String(c)
  }

  // ---------- from and to a file ----------
  /// The rows of a file of comma-separated values, quotes and all.
  static func rows(csv: String) -> [[String]] {
    var out: [[String]] = [], row: [String] = [], cell = "", quoted = false
    var it = csv.makeIterator(), ahead: Character? = it.next()
    while let ch = ahead {
      ahead = it.next()
      if quoted { if ch == "\"" { if ahead == "\"" { cell.append("\""); ahead = it.next() } else { quoted = false } } else { cell.append(ch) } }
      else if ch == "\"" { quoted = true }
      else if ch == "," { row.append(cell); cell = "" }
      else if ch == "\n" || ch == "\r\n" || ch == "\r" { row.append(cell); cell = ""; if row.contains(where: { !$0.isEmpty }) { out.append(row) }; row = [] }
      else { cell.append(ch) }
    }
    row.append(cell); if row.contains(where: { !$0.isEmpty }) { out.append(row) }
    return out
  }
  /// Bring in the passwords file another browser exports (Chrome, Safari, Firefox, Edge, and most password apps). Says how many came in and how many were here already.
  func bring(csv: String) -> (added: Int, here: Int, unread: Int)? {
    guard isOpen, var l = logins else { return nil }; used()
    let r = Vault.rows(csv: csv); guard let head = r.first?.map({ $0.lowercased().trimmingCharacters(in: .whitespaces) }) else { return (0, 0, 0) }
    func col(_ names: [String]) -> Int? { head.firstIndex { names.contains($0) } }
    guard let cu = col(["url", "login_uri", "website", "web site", "origin_url"]), let cp = col(["password", "login_password"]) else { return (0, 0, r.count) }
    let cn = col(["username", "login_username", "user", "login", "email"]), now = Date().timeIntervalSince1970
    var added = 0, here = 0, unread = 0
    for row in r.dropFirst() {
      guard row.count > max(cu, cp) else { unread += 1; continue }
      let address = row[cu], pass = row[cp], user = cn.flatMap { $0 < row.count ? row[$0] : nil } ?? ""
      let host = Vault.site(URL(string: address.contains("://") ? address : "https://" + address)?.host)
      if host.isEmpty || pass.isEmpty { unread += 1; continue }
      if l.contains(where: { $0.site == host && $0.user == user }) { here += 1; continue }
      l.append(Login(id: UUID().uuidString, site: host, url: address.contains("://") ? address : "https://" + host + "/", user: user, password: pass, added: now, used: 0, changed: now)); added += 1
    }
    if added > 0, !keep(l) { return nil }
    return (added, here, unread)
  }
  /// Every sign-in as a file other apps can read. It is not encrypted: whoever has the file has the passwords.
  func csv() -> String? {
    guard isOpen, let l = logins else { return nil }; used()
    func q(_ s: String) -> String { "\"" + s.replacingOccurrences(of: "\"", with: "\"\"") + "\"" }
    return "name,url,username,password\n" + l.map { [q($0.site), q($0.url), q($0.user), q($0.password)].joined(separator: ",") }.joined(separator: "\n") + "\n"
  }
}

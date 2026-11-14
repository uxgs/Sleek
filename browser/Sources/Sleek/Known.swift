// Two things Sleek knows about sites, both kept on this Mac:
//   Icons   the little picture each site shows in its tab, saved so that bookmarks, the start page and
//           suggestions can show it later (sleek://ui/_icon/<site>). A private window saves none.
//   Sites   a list of well-known sites that ships with the app (Resources/sites.txt), so the address
//           box can finish an address and suggest a site you have never been to. Nothing typed is
//           sent anywhere to do this.
import Foundation

enum Icons {
  nonisolated(unsafe) static var dir: URL?
  nonisolated(unsafe) static var onNew: (() -> Void)?
  nonisolated(unsafe) private static var busy = Set<String>()
  /// The name an icon is kept under: the site's name without "www.", and nothing that could be a path.
  static func key(_ host: String) -> String {
    let h = host.lowercased(), bare = h.hasPrefix("www.") ? String(h.dropFirst(4)) : h
    let k = bare.filter { $0.isLetter || $0.isNumber || $0 == "." || $0 == "-" }
    return k.contains("..") ? "" : k
  }
  static func file(_ host: String) -> URL? { let k = key(host); guard !k.isEmpty, let d = dir else { return nil }; return d.appendingPathComponent(k) }
  /// What kind of picture these bytes are, or nil when they are not one.
  static func type(_ d: Data) -> String? {
    let b = [UInt8](d.prefix(16)); guard b.count >= 12 else { return nil }
    if b.starts(with: [0x89, 0x50, 0x4E, 0x47]) { return "image/png" }
    if b.starts(with: [0xFF, 0xD8, 0xFF]) { return "image/jpeg" }
    if b.starts(with: [0x47, 0x49, 0x46, 0x38]) { return "image/gif" }
    if b.starts(with: [0x00, 0x00, 0x01, 0x00]) { return "image/x-icon" }
    if b.starts(with: [0x52, 0x49, 0x46, 0x46]), Array(b[8..<12]) == [0x57, 0x45, 0x42, 0x50] { return "image/webp" }
    if let head = String(data: d.prefix(600), encoding: .utf8), head.contains("<svg") { return "image/svg+xml" }
    return nil
  }
  /// Fetch a site's icon and keep it, unless the one kept is less than a week old. Called on the main thread.
  static func keep(host: String, from address: String) {
    guard let f = file(host), let u = URL(string: address), u.scheme == "https" || u.scheme == "http", !busy.contains(f.lastPathComponent) else { return }
    if let made = (try? FileManager.default.attributesOfItem(atPath: f.path))?[.modificationDate] as? Date, Date().timeIntervalSince(made) < 7 * 86400 { return }
    busy.insert(f.lastPathComponent)
    var r = URLRequest(url: u); r.timeoutInterval = 15
    URLSession(configuration: .ephemeral).dataTask(with: r) { data, response, _ in
      let good = (response as? HTTPURLResponse)?.statusCode == 200 && data.map { $0.count >= 60 && $0.count <= 600_000 && type($0) != nil } == true
      DispatchQueue.main.async {
        busy.remove(f.lastPathComponent)
        if good, let d = data { try? FileManager.default.createDirectory(at: f.deletingLastPathComponent(), withIntermediateDirectories: true); try? d.write(to: f, options: .atomic); onNew?() }
      }
    }.resume()
  }
}

enum Sites {
  /// (address, name), in the order of the file: the best known first.
  static let all: [(host: String, name: String)] = {
    guard let text = try? String(contentsOf: Res.root.appendingPathComponent("sites.txt"), encoding: .utf8) else { return [] }
    return text.split(separator: "\n").compactMap { line in
      if line.hasPrefix("#") { return nil }
      let parts = line.split(separator: " ", maxSplits: 1).map(String.init); return parts.count == 2 ? (parts[0], parts[1]) : nil
    }
  }()
  /// Well-known sites whose address begins with what was typed, then those whose name does.
  static func matching(_ typed: String, limit: Int) -> [[String: Any]] {
    let q = typed.lowercased().trimmingCharacters(in: .whitespaces); if q.isEmpty || limit <= 0 || q.contains("/") { return [] }
    let bare = q.hasPrefix("www.") ? String(q.dropFirst(4)) : q; if bare.isEmpty { return [] }
    let first = all.filter { $0.host.hasPrefix(bare) }, second = all.filter { !$0.host.hasPrefix(bare) && $0.name.lowercased().hasPrefix(bare) }
    return (first + second).prefix(limit).map { ["title": $0.name, "url": "https://" + $0.host + "/", "kind": "site"] }
  }
}

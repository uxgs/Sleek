// Where you go most, as glass tiles. Each tile is made from the site's own icon (the one it gives
// iPhones, kept by Sleek when you visit) and takes its colours from that icon. Nothing is drawn by
// hand, carried in the app or fetched from anyone else. The ⋯ menu, Appearance, chooses how they look.
import SwiftUI

/// The colours read from a site's icon: its brand colour (the most common strong hue), or nil when the
/// icon is black and white; and the colour in its corner (its background), nil when that is see-through.
struct Tint: Equatable {
  typealias RGB = [Double]
  let accent: RGB?, corner: RGB?, pixels: Int
  nonisolated(unsafe) private static var kept: [String: (Date, Tint)] = [:]

  /// Read once for each icon Sleek keeps, and again when the icon changes.
  static func of(_ host: String) -> Tint? {
    guard let f = Icons.file(host), let at = (try? FileManager.default.attributesOfItem(atPath: f.path))?[.modificationDate] as? Date else { return nil }
    if let k = kept[f.lastPathComponent], k.0 == at { return k.1 }
    guard let img = UIImage(contentsOfFile: f.path), let t = read(img) else { return nil }
    kept[f.lastPathComponent] = (at, t); return t
  }
  static func read(_ img: UIImage) -> Tint? {
    guard let cg = img.cgImage else { return nil }
    let n = 40; var px = [UInt8](repeating: 0, count: n * n * 4)
    guard let cx = CGContext(data: &px, width: n, height: n, bitsPerComponent: 8, bytesPerRow: n * 4, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return nil }
    cx.interpolationQuality = .medium; cx.draw(cg, in: CGRect(x: 0, y: 0, width: n, height: n))
    var buckets: [Int: (n: Int, r: Double, g: Double, b: Double)] = [:]
    func at(_ i: Int) -> (Double, Double, Double, Double) { let a = Double(px[i + 3]); guard a > 0 else { return (0, 0, 0, 0) }; return (Double(px[i]) * 255 / a, Double(px[i + 1]) * 255 / a, Double(px[i + 2]) * 255 / a, a) }
    for i in stride(from: 0, to: px.count, by: 4) {
      let (r, g, b, a) = at(i); if a < 140 { continue }
      let mx = max(r, g, b), mn = min(r, g, b); if mx < 50 || (mx - mn) / mx < 0.35 { continue }
      let c = mx - mn; var h: Double
      if mx == r { h = ((g - b) / c).truncatingRemainder(dividingBy: 6) } else if mx == g { h = (b - r) / c + 2 } else { h = (r - g) / c + 4 }
      let k = Int((((h * 60) + 360).truncatingRemainder(dividingBy: 360) / 20).rounded())
      var B = buckets[k] ?? (0, 0, 0, 0); B.n += 1; B.r += r; B.g += g; B.b += b; buckets[k] = B
    }
    let best = buckets.values.max { $0.n < $1.n }
    let accent: RGB? = best.flatMap { $0.n > n * n * 3 / 100 ? [$0.r / Double($0.n), $0.g / Double($0.n), $0.b / Double($0.n)] : nil }
    let c0 = at(0)                        // the top-left corner
    return Tint(accent: accent, corner: c0.3 < 140 ? nil : [c0.0, c0.1, c0.2], pixels: Int(img.size.width * img.scale))
  }
  static func lum(_ c: RGB) -> Double { (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255 }
  static func mix(_ c: RGB, _ t: RGB, _ k: Double) -> RGB { zip(c, t).map { $0 + ($1 - $0) * k } }
  static func color(_ c: RGB) -> Color { Color(red: c[0] / 255, green: c[1] / 255, blue: c[2] / 255) }

  /// The tile's two colours: lighter and deeper brand colour, or calm graphite or paper for a black-and-white icon.
  func pair(dark: Bool) -> (RGB, RGB) {
    if let a = accent { return (Tint.mix(a, [255, 255, 255], 0.12), Tint.mix(a, [0, 0, 0], 0.38)) }
    if corner.map({ Tint.lum($0) > 0.5 }) ?? true { return dark ? ([58, 60, 70], [30, 31, 38]) : ([250, 250, 252], [214, 217, 226]) }
    return ([56, 58, 66], [18, 18, 22])
  }
}

/// A well-known site's own name ("The Verge" for theverge.com), or the address without "www.".
enum SiteName {
  private static let names: [String: String] = Dictionary(Sites.all.map { ($0.host, $0.name) }, uniquingKeysWith: { a, _ in a })
  static func of(_ host: String) -> String { let bare = host.hasPrefix("www.") ? String(host.dropFirst(4)) : host; return names[bare] ?? bare }
}

/// One tile. Clear glass: frosted, the site's colour glowing through, its icon in the middle. Colour glass:
/// filled with the site's colour, the icon blurred into it, the crisp icon, name and address on top.
struct SiteTile: View {
  let host: String, name: String, style: String, wide: Bool, big: Bool
  var app: String? = nil                                // one of Sleek's own apps: its icon and its colour
  @Environment(\.colorScheme) private var scheme
  private var compact: Bool { !wide && !big }          // square, three across
  /// Sleek's own apps, in their colours.
  static let apps: [String: Tint] = ["slides": Tint(accent: [124, 92, 255], corner: [0, 0, 0], pixels: 192), "docs": Tint(accent: [10, 132, 255], corner: [0, 0, 0], pixels: 192), "tasks": Tint(accent: [18, 163, 106], corner: [0, 0, 0], pixels: 192)]
  private var art: UIImage? { app.map { UIImage(contentsOfFile: Res.site.appendingPathComponent("icons/\($0)-192.png").path) } ?? Icons.file(host).flatMap { UIImage(contentsOfFile: $0.path) } }
  @ViewBuilder private func logo(_ size: CGFloat) -> some View { if let a = app { AppIcon(app: a, size: size) } else { TileLogo(host: host, size: size) } }
  var body: some View {
    let tint = app.flatMap { SiteTile.apps[$0] } ?? Tint.of(host), (c1, c2) = (tint ?? Tint(accent: nil, corner: nil, pixels: 0)).pair(dark: scheme == .dark)
    let shape = RoundedRectangle(cornerRadius: compact ? 18 : 20, style: .continuous)
    let glow = Tint.color(tint?.accent ?? c2)
    Color.clear.aspectRatio(wide ? 16 / 9 : 1, contentMode: .fit)
      .overlay { GeometryReader { g in
        if style == "colour" { colour(g.size, tint, c1, c2) } else { clear(g.size, c1, c2) }
      } }
      .clipShape(shape)
      .overlay {                                          // a little light across the top, and a fine bright edge
        shape.fill(LinearGradient(stops: [.init(color: .white.opacity(style == "colour" ? 0.3 : 0.32), location: 0), .init(color: .white.opacity(0.06), location: 0.32), .init(color: .clear, location: 0.5)], startPoint: .topLeading, endPoint: .bottomTrailing)).allowsHitTesting(false)
      }
      .overlay { shape.strokeBorder(LinearGradient(colors: [.white.opacity(scheme == .dark ? 0.28 : 0.7), .white.opacity(0.08)], startPoint: .top, endPoint: .bottom), lineWidth: 0.8) }
      .overlay { shape.stroke(Color.primary.opacity(0.07), lineWidth: 0.5) }
      .shadow(color: glow.opacity(style == "colour" ? 0.45 : 0.3), radius: 14, y: 8)
      .accessibilityElement(children: .ignore).accessibilityLabel(name).accessibilityAddTraits(.isButton)
  }
  @ViewBuilder private func clear(_ s: CGSize, _ c1: Tint.RGB, _ c2: Tint.RGB) -> some View {
    let logo: CGFloat = big ? (wide ? 58 : 64) : (wide ? 44 : 40)
    ZStack {
      Rectangle().fill(.ultraThinMaterial)
      RadialGradient(colors: [Tint.color(c1).opacity(0.6), .clear], center: UnitPoint(x: 0.95, y: 0), startRadius: 0, endRadius: max(s.width, s.height) * 0.85)
      RadialGradient(colors: [Tint.color(c2).opacity(0.32), .clear], center: UnitPoint(x: 0.05, y: 1.05), startRadius: 0, endRadius: max(s.width, s.height) * 0.7)
      VStack(spacing: compact ? 6 : 8) {
        self.logo(logo).shadow(color: Tint.color(c2).opacity(0.45), radius: 10, y: 6)
        Text(name).font(.system(size: big ? 15 : compact ? 12 : 13, weight: .semibold)).foregroundStyle(.primary.opacity(0.85)).lineLimit(1).minimumScaleFactor(0.8).padding(.horizontal, 8)
      }.offset(y: compact ? 2 : 4)
    }
  }
  @ViewBuilder private func colour(_ s: CGSize, _ tint: Tint?, _ c1: Tint.RGB, _ c2: Tint.RGB) -> some View {
    let mono = tint?.accent == nil, ink: Color = Tint.lum(Tint.mix(c1, c2, 0.5)) > 0.62 ? Color(white: 0.08) : .white
    let logo: CGFloat = big ? 44 : compact ? 30 : 34, pad: CGFloat = big ? 16 : compact ? 10 : 12
    ZStack(alignment: .bottomLeading) {
      if mono { RadialGradient(colors: [Tint.color(Tint.mix(c1, [255, 255, 255], 0.3)), Tint.color(c1), Tint.color(c2)], center: .topTrailing, startRadius: 0, endRadius: max(s.width, s.height) * 1.3) }
      else {
        LinearGradient(colors: [Tint.color(c1), Tint.color(c2)], startPoint: .topLeading, endPoint: .bottomTrailing)
        if let img = art {
          Image(uiImage: img).resizable().scaledToFill().frame(width: s.width * 1.5, height: s.width * 1.5).blur(radius: 26).saturation(1.5).opacity(0.75)
            .position(x: s.width * 1.0, y: s.height * 0.1)
        }
      }
      VStack(alignment: .leading, spacing: 0) {
        self.logo(logo).shadow(color: .black.opacity(0.25), radius: 6, y: 4)
        Spacer(minLength: 4)
        Text(name).font(.system(size: big ? 17 : compact ? 12 : 14, weight: .semibold)).lineLimit(1).minimumScaleFactor(0.8)
        if !compact { Text(app != nil ? "Sleek" : host.hasPrefix("www.") ? String(host.dropFirst(4)) : host).font(.system(size: big ? 12 : 11, weight: .medium)).opacity(0.72).lineLimit(1) }
      }.foregroundStyle(ink).padding(pad).frame(width: s.width, height: s.height, alignment: .topLeading)
    }.frame(width: s.width, height: s.height)
  }
}

/// The site's icon on a tile, filling its rounded shape edge to edge (an icon with a see-through background
/// sits on white, as drawn). Its first letter until there is one.
struct TileLogo: View {
  let host: String, size: CGFloat
  var body: some View { SiteIcon(host: host, size: size, radius: 0.26).overlay(RoundedRectangle(cornerRadius: size * 0.26, style: .continuous).stroke(.black.opacity(0.08), lineWidth: 0.5)) }
}

// Where the iPhone app's own files are, and small things its views lean on.
// (What it shares with the Mac app is in ../../browser/Sources/Sleek: Common, Blocker, Store, Known, Work.)
import SwiftUI
import WebKit

enum Res {
  /// Everything the app carries: the copy of Slides, Docs and Tasks (app), the block lists, sites.txt, and chrome/bridge.html.
  static let root: URL = Bundle.main.resourceURL ?? Bundle.main.bundleURL
  static let site: URL = root.appendingPathComponent("app")
  static let args = CommandLine.arguments
  static func arg(_ name: String) -> String? { if let i = args.firstIndex(of: name), i + 1 < args.count { return args[i + 1] }; return nil }
  /// `--prove`: the app checks itself and quits. The shared code asks selfTest to know (then nothing of yours is touched and nothing fresh is fetched).
  static let proving = args.contains("--prove")
  static let selfTest: String? = proving ? "" : nil
}

func tap(_ style: UIImpactFeedbackGenerator.FeedbackStyle = .light) { UIImpactFeedbackGenerator(style: style).impactOccurred() }

extension Color {
  init(hex: String) { var v: UInt64 = 0; Scanner(string: hex.replacingOccurrences(of: "#", with: "")).scanHexInt64(&v); self.init(red: Double((v >> 16) & 255) / 255, green: Double((v >> 8) & 255) / 255, blue: Double(v & 255) / 255) }
  static let sleekA = Color(hex: "#7E9CFF"), sleekB = Color(hex: "#B48CFF"), sleekC = Color(hex: "#FF8EE0"), tasks = Color(hex: "#12A36A"), slides = Color(hex: "#7C5CFF"), docs = Color(hex: "#0A84FF")
}
let sleekRun = LinearGradient(colors: [.sleekA, .sleekB, .sleekC], startPoint: .topLeading, endPoint: .bottomTrailing)

/// Sleek's mark: two bars, each with one round end.
struct SleekMark: Shape {
  func path(in r: CGRect) -> Path {
    let w = r.width / 280, h = r.height / 252
    func bar(x: CGFloat, y: CGFloat, roundLeft: Bool) -> Path {
      var p = Path(); let b = CGRect(x: r.minX + x * w, y: r.minY + y * h, width: 220 * w, height: 112 * h), rad = b.height / 2
      p.addRoundedRect(in: b, cornerRadii: RectangleCornerRadii(topLeading: roundLeft ? rad : 0, bottomLeading: roundLeft ? rad : 0, bottomTrailing: roundLeft ? 0 : rad, topTrailing: roundLeft ? 0 : rad)); return p
    }
    var p = bar(x: 60, y: 0, roundLeft: true); p.addPath(bar(x: 0, y: 140, roundLeft: false)); return p
  }
}
struct Mark: View { var size: CGFloat = 22; var body: some View { SleekMark().fill(sleekRun).frame(width: size, height: size * 0.9) } }

/// One of Sleek's three apps, as its icon.
struct AppIcon: View {
  let app: String; var size: CGFloat = 38
  var body: some View {
    if let img = UIImage(contentsOfFile: Res.site.appendingPathComponent("icons/\(app)-192.png").path) { Image(uiImage: img).resizable().frame(width: size, height: size).clipShape(RoundedRectangle(cornerRadius: size * 0.26, style: .continuous)) }
    else { Mark(size: size * 0.6).frame(width: size, height: size) }
  }
}
/// A site's own icon, kept by Sleek; its first letter until there is one.
struct SiteIcon: View {
  let host: String; var size: CGFloat = 44
  var body: some View {
    let bare = host.hasPrefix("www.") ? String(host.dropFirst(4)) : host
    ZStack {
      RoundedRectangle(cornerRadius: size * 0.28, style: .continuous).fill(Color(.tertiarySystemFill))
      if let f = Icons.file(host), let img = UIImage(contentsOfFile: f.path) { Image(uiImage: img).resizable().interpolation(.high).scaledToFit().padding(size * 0.16) }
      else { Text(String(bare.prefix(1)).uppercased()).font(.system(size: size * 0.42, weight: .bold, design: .rounded)).foregroundStyle(.secondary) }
    }.frame(width: size, height: size).clipShape(RoundedRectangle(cornerRadius: size * 0.28, style: .continuous))
  }
}
/// Glass: frosted, with a hairline and a soft shadow.
struct Glass<S: Shape>: ViewModifier {
  let shape: S
  func body(content: Content) -> some View { content.background(.ultraThinMaterial, in: shape).overlay(shape.stroke(Color.primary.opacity(0.08), lineWidth: 0.5)).shadow(color: .black.opacity(0.18), radius: 18, y: 8) }
}
/// A button that gives a little under the finger.
struct Press: ButtonStyle { func makeBody(configuration: Configuration) -> some View { configuration.label.scaleEffect(configuration.isPressed ? 0.96 : 1).animation(.spring(response: 0.25, dampingFraction: 0.7), value: configuration.isPressed) } }
/// A page's web view, placed in the screen.
struct WebBox: UIViewRepresentable {
  let web: WKWebView
  func makeUIView(context: Context) -> WKWebView { web }
  func updateUIView(_ v: WKWebView, context: Context) {}
}
/// The view on top, for the few things that must be shown the phone's own way (a page's alert, the share sheet).
@MainActor func topController() -> UIViewController? {
  var c = UIApplication.shared.connectedScenes.compactMap { ($0 as? UIWindowScene)?.keyWindow }.first?.rootViewController
  while let next = c?.presentedViewController { c = next }
  return c
}

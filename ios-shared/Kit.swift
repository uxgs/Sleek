// What Sleek Docs and Sleek Slides for iPhone share: where each app's files are, Sleek's mark and colours,
// glass, a short message over the screen, and small pieces their screens lean on.
// (Each app also compiles, from ../browser/Sources/Sleek: Common.swift, which serves Sleek's own pages from
// inside the app, and Work.swift, the door to the work those pages keep.)
import SwiftUI
import UniformTypeIdentifiers
import WebKit

enum Res {
  /// Everything the app carries: a copy of Sleek's pages (app), and chrome/bridge.html.
  static let root: URL = Bundle.main.resourceURL ?? Bundle.main.bundleURL
  static let site: URL = root.appendingPathComponent("app")
  static let args = CommandLine.arguments
  static func arg(_ name: String) -> String? { if let i = args.firstIndex(of: name), i + 1 < args.count { return args[i + 1] }; return nil }
  /// `--prove`: the app checks itself and quits; nothing of yours is touched (the shared code asks selfTest to know).
  static let proving = args.contains("--prove")
  static let selfTest: String? = proving ? "" : nil
  /// Where the app keeps what is yours, outside the pages' own storage.
  static var support: URL { proving ? FileManager.default.temporaryDirectory.appendingPathComponent("sleek-prove-\(ProcessInfo.processInfo.processIdentifier)") : FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("Sleek") }
}

func tap(_ style: UIImpactFeedbackGenerator.FeedbackStyle = .light) { UIImpactFeedbackGenerator(style: style).impactOccurred() }

extension Color {
  init(hex: String) { var v: UInt64 = 0; Scanner(string: hex.replacingOccurrences(of: "#", with: "")).scanHexInt64(&v); self.init(red: Double((v >> 16) & 255) / 255, green: Double((v >> 8) & 255) / 255, blue: Double(v & 255) / 255) }
  static let sleekA = Color(hex: "#7E9CFF"), sleekB = Color(hex: "#B48CFF"), sleekC = Color(hex: "#FF8EE0"), tasks = Color(hex: "#12A36A"), slides = Color(hex: "#7C5CFF"), docs = Color(hex: "#0A84FF")
}
let sleekRun = LinearGradient(colors: [.sleekA, .sleekB, .sleekC], startPoint: .topLeading, endPoint: .bottomTrailing)
extension UTType { static let sleek = UTType(exportedAs: "com.sleek.file", conformingTo: .json) }

struct Glass<S: Shape>: ViewModifier {
  let shape: S
  func body(content: Content) -> some View { content.background(.ultraThinMaterial, in: shape).overlay(shape.stroke(Color.primary.opacity(0.08), lineWidth: 0.5)).shadow(color: .black.opacity(0.16), radius: 18, y: 8) }
}
struct Press: ButtonStyle { func makeBody(configuration: Configuration) -> some View { configuration.label.scaleEffect(configuration.isPressed ? 0.96 : 1).animation(.spring(response: 0.25, dampingFraction: 0.7), value: configuration.isPressed) } }
/// The soft light at the top of a screen, in the app's colour.
struct Bloom: View {
  let c: Color
  var body: some View { ZStack { Circle().fill(c.opacity(0.30)).frame(width: 320).offset(x: -120, y: -170); Circle().fill(Color.sleekC.opacity(0.16)).frame(width: 280).offset(x: 150, y: -190) }.blur(radius: 80).allowsHitTesting(false) }
}

/// A short message over the screen, gone in a few seconds.
@MainActor
final class Shell: ObservableObject {
  @Published var toast: String?
  private var n = 0
  func say(_ text: String) { n += 1; let mine = n; withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) { toast = text }; DispatchQueue.main.asyncAfter(deadline: .now() + 3) { [weak self] in if self?.n == mine { withAnimation(.easeOut(duration: 0.25)) { self?.toast = nil } } } }
}
struct Toast: ViewModifier {
  @ObservedObject var shell: Shell
  func body(content: Content) -> some View {
    content.overlay(alignment: .top) { if let t = shell.toast { Text(t).font(.system(size: 15, weight: .medium)).multilineTextAlignment(.center).padding(.horizontal, 16).padding(.vertical, 10).modifier(Glass(shape: Capsule())).padding(.top, 6).padding(.horizontal, 20).transition(.move(edge: .top).combined(with: .opacity)).id(t) } }
  }
}

/// A file of text to hand to the Files app or another app (a .sleek copy, Markdown).
struct TextFile: FileDocument {
  static var readableContentTypes: [UTType] { [.sleek, .json, .plainText] }
  var text = ""
  init(text: String) { self.text = text }
  init(configuration: ReadConfiguration) throws { text = String(decoding: configuration.file.regularFileContents ?? Data(), as: UTF8.self) }
  func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper { FileWrapper(regularFileWithContents: Data(text.utf8)) }
}
/// The phone's own share sheet, for a file the app has just written.
struct ShareItems: UIViewControllerRepresentable {
  let items: [Any]
  func makeUIViewController(context: Context) -> UIActivityViewController { UIActivityViewController(activityItems: items, applicationActivities: nil) }
  func updateUIViewController(_ c: UIActivityViewController, context: Context) {}
}
/// "5 minutes ago", "yesterday", from a time in milliseconds as the pages keep it.
func ago(_ ms: Double) -> String { ms <= 0 ? "" : Date(timeIntervalSince1970: ms / 1000).formatted(.relative(presentation: .named)) }

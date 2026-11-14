// Sleek Tasks for iPhone: Sleek's mark and colours, glass, and small pieces the screens share.
import SwiftUI
import UniformTypeIdentifiers

enum Args {
  static let all = CommandLine.arguments
  static let proving = all.contains("--prove")
  static func arg(_ name: String) -> String? { if let i = all.firstIndex(of: name), i + 1 < all.count { return all[i + 1] }; return nil }
}
func tap(_ style: UIImpactFeedbackGenerator.FeedbackStyle = .light) { UIImpactFeedbackGenerator(style: style).impactOccurred() }

extension Color {
  init(hex: String) { var v: UInt64 = 0; Scanner(string: hex.replacingOccurrences(of: "#", with: "")).scanHexInt64(&v); self.init(red: Double((v >> 16) & 255) / 255, green: Double((v >> 8) & 255) / 255, blue: Double(v & 255) / 255) }
  static let sleekA = Color(hex: "#7E9CFF"), sleekB = Color(hex: "#B48CFF"), sleekC = Color(hex: "#FF8EE0"), tasks = Color(hex: "#12A36A")
}
extension UTType { static let sleek = UTType(exportedAs: "com.sleek.file", conformingTo: .json) }

struct Glass<S: Shape>: ViewModifier {
  let shape: S
  func body(content: Content) -> some View { content.background(.ultraThinMaterial, in: shape).overlay(shape.stroke(Color.primary.opacity(0.08), lineWidth: 0.5)).shadow(color: .black.opacity(0.16), radius: 18, y: 8) }
}
struct Press: ButtonStyle { func makeBody(configuration: Configuration) -> some View { configuration.label.scaleEffect(configuration.isPressed ? 0.96 : 1).animation(.spring(response: 0.25, dampingFraction: 0.7), value: configuration.isPressed) } }
/// The soft light at the top of a screen.
struct Bloom: View {
  var c: Color = .tasks
  var body: some View { ZStack { Circle().fill(c.opacity(0.30)).frame(width: 320).offset(x: -120, y: -170); Circle().fill(Color.sleekC.opacity(0.16)).frame(width: 280).offset(x: 150, y: -190) }.blur(radius: 80).allowsHitTesting(false) }
}
/// A small heading over a group of tasks.
struct Head: View {
  let text: String; var c: Color = .secondary
  var body: some View { Text(text.uppercased()).font(.system(size: 12, weight: .semibold)).tracking(1.4).foregroundStyle(c).padding(.top, 14).plainRow() }
}
extension View {
  /// A row of a list drawn as the page itself, with no lines and the page's own margins.
  func plainRow() -> some View { listRowSeparator(.hidden).listRowBackground(Color.clear).listRowInsets(EdgeInsets(top: 0, leading: 22, bottom: 0, trailing: 22)) }
}
/// A copy of your tasks as a file.
struct TasksFile: FileDocument {
  static var readableContentTypes: [UTType] { [.sleek, .json] }
  var text = ""
  init(text: String) { self.text = text }
  init(configuration: ReadConfiguration) throws { text = String(decoding: configuration.file.regularFileContents ?? Data(), as: UTF8.self) }
  func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper { FileWrapper(regularFileWithContents: Data(text.utf8)) }
}

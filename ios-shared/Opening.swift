// A Sleek app opening, as the Sleek browser does (../ios/Sources/Intro.swift): the two bars of Sleek's mark slide
// together, a soft bloom rises behind, the app's name writes itself in, and it all lifts away to show the app, to the
// film's opening sound. The mark, the bloom and the app's own word are in that app's colours. A tap skips it; with
// Reduce Motion it is a quick fade. Sleek Tasks, Docs, Slides and Notes all compile this file, so they open alike.
//
//   TasksRoot().sleekOpening("Tasks", ["#0FA968", "#2CC88E", "#7FE3B5"])          "Sleek Tasks"
//   NotesRoot().sleekOpening("Notes", [...], brand: "Sleeky")                    "Sleeky Notes"
//
// It plays each time the app starts, not when it comes back from the background. Started with `--still` (for
// pictures and checks of the app itself) or `--prove`, it does not play.
import SwiftUI
import AVFoundation

/// The opening's sound (made by ../tools/film/opening.py, the film's opening sting; the file is ../ios/Sounds/opening.m4a).
/// It plays like a system sound: silent when the iPhone is on silent, and over your music without stopping it.
enum Chime {
  nonisolated(unsafe) private static var player: AVAudioPlayer?
  static var url: URL? { Bundle.main.url(forResource: "opening", withExtension: "m4a") }
  static func play() {
    guard let u = url, let p = try? AVAudioPlayer(contentsOf: u) else { return }
    let s = AVAudioSession.sharedInstance(), was = s.category
    try? s.setCategory(.ambient, options: [.mixWithOthers]); try? s.setActive(true)
    player = p; p.play()
    DispatchQueue.main.asyncAfter(deadline: .now() + p.duration + 0.3) {     // then the session as it was, for the app's own sound
      player = nil; try? s.setActive(false, options: .notifyOthersOnDeactivation); try? s.setCategory(was)
    }
  }
}

/// One bar of Sleek's mark, placed as in the whole mark: the top one (1) or the bottom one (2).
private struct OpeningBar: Shape {
  let part: Int
  func path(in r: CGRect) -> Path {
    let w = r.width / 280, h = r.height / 252, top = part == 1
    let b = CGRect(x: r.minX + (top ? 60 : 0) * w, y: r.minY + (top ? 0 : 140) * h, width: 220 * w, height: 112 * h), rad = b.height / 2
    var p = Path()
    p.addRoundedRect(in: b, cornerRadii: RectangleCornerRadii(topLeading: top ? rad : 0, bottomLeading: top ? rad : 0, bottomTrailing: top ? 0 : rad, topTrailing: top ? 0 : rad))
    return p
  }
}

enum Opening {
  /// Whether this start of the app plays it.
  static var plays: Bool { let a = ProcessInfo.processInfo.arguments; return !a.contains("--still") && !a.contains("--prove") }
  static func color(_ hex: String) -> Color {
    var v: UInt64 = 0; Scanner(string: hex.replacingOccurrences(of: "#", with: "")).scanHexInt64(&v)
    return Color(red: Double((v >> 16) & 255) / 255, green: Double((v >> 8) & 255) / 255, blue: Double(v & 255) / 255)
  }
}

struct OpeningView: View {
  let name: String                                 // the app's own word: "Tasks"
  var brand = "Sleek"                              // the word before it
  let colors: [Color]                              // its run of colour, as on its icon
  let done: () -> Void
  @Environment(\.accessibilityReduceMotion) private var calm
  @State private var topIn = false
  @State private var bottomIn = false
  @State private var named = false
  @State private var bloom = false
  @State private var lifting = false
  @State private var gone = false
  @State private var natural: CGFloat = 0
  private let k: CGFloat = 2.4                     // the size the browser's opening is drawn at; narrowed to fit a longer name
  private var run: LinearGradient { LinearGradient(colors: colors, startPoint: .topLeading, endPoint: .bottomTrailing) }
  var body: some View {
    GeometryReader { g in
      let fit = natural > 0 ? min(1, (g.size.width - 56) / natural) : 1
      ZStack {
        Color(.systemBackground).opacity(lifting ? 0 : 1)
        ZStack {
          Circle().fill(colors.first ?? .purple).frame(width: 300).offset(x: -70, y: -50)
          Circle().fill(colors.last ?? .pink).frame(width: 280).offset(x: 80, y: 30)
          Circle().fill(colors.count > 1 ? colors[1] : .purple).frame(width: 260).offset(y: 110)
        }
        .blur(radius: 80).opacity(lifting ? 0 : bloom ? 0.5 : 0).scaleEffect(lifting ? 1.3 : bloom ? 1 : 0.35)
        .offset(y: lifting ? -g.size.height * 0.2 : 0)
        logo
          .background(GeometryReader { l in Color.clear.onAppear { natural = l.size.width } })
          .scaleEffect(fit * (lifting ? 0.6 : 1))
          .offset(y: lifting ? -60 : 0).opacity(lifting ? 0 : natural > 0 ? 1 : 0)
          .position(x: g.size.width / 2, y: g.size.height / 2)
      }
    }
    .ignoresSafeArea()
    .opacity(gone ? 0 : 1)
    .contentShape(Rectangle())
    .onTapGesture { lift(fast: true) }
    .allowsHitTesting(!lifting)
    .accessibilityHidden(true)
    .onAppear(perform: play)
  }
  /// Sleek's mark, its bars apart until they slide together, then "Sleek" and the app's word, written in from the left.
  private var logo: some View {
    HStack(spacing: 12 * k) {
      ZStack {
        OpeningBar(part: 1).fill(run).offset(x: topIn ? 0 : 230).opacity(topIn ? 1 : 0)
        OpeningBar(part: 2).fill(run).offset(x: bottomIn ? 0 : -230).opacity(bottomIn ? 1 : 0)
      }.frame(width: 30 * k, height: 27 * k)
      HStack(spacing: 7 * k) { Text(brand); Text(name).foregroundStyle(run) }
        .font(.system(size: 26 * k, weight: .bold)).tracking(-1 * k).lineLimit(1)
        .mask { GeometryReader { t in
          LinearGradient(stops: [.init(color: .black, location: 0), .init(color: .black, location: 0.7), .init(color: .clear, location: 1)], startPoint: .leading, endPoint: .trailing)
            .frame(width: t.size.width * 1.6).offset(x: named ? 0 : -t.size.width * 1.6)
        } }
        .blur(radius: named ? 0 : 6).offset(y: named ? 0 : 8)
    }.fixedSize()
  }
  private func play() {
    Chime.play()
    if calm {
      topIn = true; bottomIn = true; named = true
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) { withAnimation(.easeOut(duration: 0.3)) { gone = true } }
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.7) { done() }
      return
    }
    withAnimation(.spring(response: 0.6, dampingFraction: 0.68)) { topIn = true }
    withAnimation(.spring(response: 0.6, dampingFraction: 0.68).delay(0.07)) { bottomIn = true }
    withAnimation(.easeOut(duration: 1).delay(0.15)) { bloom = true }
    withAnimation(.easeOut(duration: 0.6).delay(0.45)) { named = true }
    DispatchQueue.main.asyncAfter(deadline: .now() + 1.25) { lift(fast: false) }
  }
  /// It lifts away, and the app is there.
  private func lift(fast: Bool) {
    guard !lifting, !gone else { return }
    if fast { topIn = true; bottomIn = true; named = true; bloom = true }
    withAnimation(.spring(response: fast ? 0.42 : 0.62, dampingFraction: 0.86)) { lifting = true }
    DispatchQueue.main.asyncAfter(deadline: .now() + (fast ? 0.45 : 0.68)) { done() }
  }
}

private struct SleekOpening: ViewModifier {
  let name: String, colors: [Color], brand: String
  @State private var showing = Opening.plays
  func body(content: Content) -> some View {
    ZStack {
      content
      if showing { OpeningView(name: name, brand: brand, colors: colors) { showing = false }.zIndex(10) }
    }
  }
}
extension View {
  /// This app opens as Sleek does: its mark, its name, the opening sound. `colors` is the app's run of colour, as hex.
  func sleekOpening(_ name: String, _ colors: [String], brand: String = "Sleek") -> some View { modifier(SleekOpening(name: name, colors: colors.map(Opening.color), brand: brand)) }
}

// Sleek opening. Every time: the two bars of its mark slide together, a soft bloom rises behind, the name
// writes itself in, and the mark flies up into its place on the start page while the page comes in (on a
// page, it lifts away instead), to the film's opening sound. A tap skips it; with Reduce Motion it is a quick
// fade. The very first time, three short pages about Sleek come before the question about the bar.
import SwiftUI
import AVFoundation

/// The opening's sound (made by tools/film/opening.py, the film's opening sting). It plays like a system
/// sound: silent when the iPhone is on silent, and over your music without stopping it.
enum Chime {
  nonisolated(unsafe) private static var player: AVAudioPlayer?
  static var url: URL? { Bundle.main.url(forResource: "opening", withExtension: "m4a") }
  static func play() {
    guard let u = url, let p = try? AVAudioPlayer(contentsOf: u) else { return }
    let s = AVAudioSession.sharedInstance(), was = s.category
    try? s.setCategory(.ambient, options: [.mixWithOthers]); try? s.setActive(true)
    player = p; p.play()
    DispatchQueue.main.asyncAfter(deadline: .now() + p.duration + 0.3) {     // then the session as it was, for pages' own sound
      player = nil; try? s.setActive(false, options: .notifyOthersOnDeactivation); try? s.setCategory(was)
    }
  }
}

struct LaunchView: View {
  @ObservedObject var b: Browser
  @Environment(\.accessibilityReduceMotion) private var calm
  @State private var topIn = false
  @State private var bottomIn = false
  @State private var named = false
  @State private var bloom = false
  @State private var flying = false
  @State private var gone = false
  @State private var logoAt: CGRect = .zero
  @State private var target: CGRect?
  private let k: CGFloat = 2.4                     // the start page's mark and name, this many times as large
  var body: some View {
    GeometryReader { g in
      ZStack {
        Color(.systemBackground).opacity(flying ? 0 : 1)
        ZStack {
          Circle().fill(Color.sleekA).frame(width: 300).offset(x: -70, y: -50)
          Circle().fill(Color.sleekC).frame(width: 280).offset(x: 80, y: 30)
          Circle().fill(Color.sleekB).frame(width: 260).offset(y: 110)
        }
        .blur(radius: 80).opacity(flying ? 0 : bloom ? 0.5 : 0).scaleEffect(flying ? 1.3 : bloom ? 1 : 0.35)
        .offset(y: flying ? -g.size.height * 0.2 : 0)
        logo
          .background(GeometryReader { l in Color.clear.onAppear { logoAt = l.frame(in: .global) } })
          .scaleEffect(flying ? (target == nil ? 0.6 : 1 / k) : 1, anchor: target == nil ? .center : .leading)
          .offset(flying ? target.map { CGSize(width: $0.minX - logoAt.minX, height: $0.midY - logoAt.midY) } ?? CGSize(width: 0, height: -60) : .zero)
          .opacity(flying && target == nil ? 0 : 1)
          .position(x: g.size.width / 2, y: g.size.height / 2)
      }
    }
    .ignoresSafeArea()
    .opacity(gone ? 0 : 1)
    .contentShape(Rectangle())
    .onTapGesture { fly(fast: true) }
    .allowsHitTesting(!flying)
    .accessibilityHidden(true)
    .onAppear(perform: run)
  }
  /// Sleek's mark, its bars apart until they slide together, and its name, written in from the left.
  private var logo: some View {
    HStack(spacing: 12 * k) {
      ZStack {
        SleekMark(part: 1).fill(sleekRun).offset(x: topIn ? 0 : 230).opacity(topIn ? 1 : 0)
        SleekMark(part: 2).fill(sleekRun).offset(x: bottomIn ? 0 : -230).opacity(bottomIn ? 1 : 0)
      }.frame(width: 30 * k, height: 27 * k)
      Text("Sleek").font(.system(size: 26 * k, weight: .bold)).tracking(-1 * k)
        .mask { GeometryReader { t in
          LinearGradient(stops: [.init(color: .black, location: 0), .init(color: .black, location: 0.7), .init(color: .clear, location: 1)], startPoint: .leading, endPoint: .trailing)
            .frame(width: t.size.width * 1.6).offset(x: named ? 0 : -t.size.width * 1.6)
        } }
        .blur(radius: named ? 0 : 6).offset(y: named ? 0 : 8)
    }.fixedSize()
  }
  private func run() {
    Chime.play()
    if calm {
      topIn = true; bottomIn = true; named = true
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) { b.launch = .flying; withAnimation(.easeOut(duration: 0.3)) { gone = true } }
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.7) { b.launch = .done }
      return
    }
    withAnimation(.spring(response: 0.6, dampingFraction: 0.68)) { topIn = true }
    withAnimation(.spring(response: 0.6, dampingFraction: 0.68).delay(0.07)) { bottomIn = true }
    withAnimation(.easeOut(duration: 1).delay(0.15)) { bloom = true }
    withAnimation(.easeOut(duration: 0.6).delay(0.45)) { named = true }
    DispatchQueue.main.asyncAfter(deadline: .now() + 1.25) { fly(fast: false) }
  }
  /// Up into its place on the start page, as the page comes in around it.
  private func fly(fast: Bool) {
    guard !flying, !gone else { return }
    if fast { topIn = true; bottomIn = true; named = true; bloom = true }
    target = b.brandAt
    b.launch = .flying
    withAnimation(.spring(response: fast ? 0.42 : 0.62, dampingFraction: 0.86)) { flying = true }
    DispatchQueue.main.asyncAfter(deadline: .now() + (fast ? 0.45 : 0.68)) { b.launch = .done }
  }
}

/// The very first time: three short pages about Sleek, before the question about the bar.
struct IntroPages: View {
  @Binding var page: Int
  @State private var at = 0
  @State private var shown = false
  private struct Page { let icon, title, note: String; let c1, c2: Color }
  private let pages = [
    Page(icon: "checkmark.shield", title: "The web, without the clutter.", note: "Adverts, trackers and cookie notices are blocked before they load.", c1: .sleekA, c2: .sleekC),
    Page(icon: "calendar.badge.checkmark", title: "Your day, on every new tab.", note: "What's due from Sleek Tasks, and the sites you visit most as glass tiles.", c1: .tasks, c2: .sleekA),
    Page(icon: "square.grid.2x2", title: "Slides, Docs and Tasks, inside.", note: "Your work stays on this iPhone, and opens without a connection.", c1: .slides, c2: .docs),
  ]
  var body: some View {
    VStack(spacing: 0) {
      HStack { Spacer(); Button { tap(); ask() } label: { Text("Skip").font(.system(size: 16, weight: .semibold)).foregroundStyle(Color(.secondaryLabel)).frame(minWidth: 44, minHeight: 44) } }.padding(.horizontal, 16)
      TabView(selection: $at) { ForEach(0..<3, id: \.self) { i in card(i).tag(i) } }.tabViewStyle(.page(indexDisplayMode: .never))
      HStack(spacing: 8) { ForEach(0..<3, id: \.self) { i in Capsule().fill(Color.primary.opacity(i == at ? 1 : 0.2)).frame(width: i == at ? 24 : 8, height: 8) } }
        .animation(.spring(response: 0.4, dampingFraction: 0.8), value: at).padding(.bottom, 24)
      Button { tap(); if at < 2 { withAnimation(.spring(response: 0.55, dampingFraction: 0.86)) { at += 1 } } else { ask() } } label: {
        Text(at == 2 ? "Get started" : "Continue").font(.system(size: 18, weight: .semibold)).frame(maxWidth: .infinity).frame(height: 56).foregroundStyle(Color(.systemBackground)).background(Color.primary, in: Capsule())
          .contentTransition(.opacity)
      }.buttonStyle(Press()).padding(.horizontal, 20).padding(.bottom, 16)
    }
    .background {
      ZStack { Color(.systemBackground); Circle().fill(pages[at].c1.opacity(0.4)).frame(width: 360).blur(radius: 90).offset(x: -120, y: -260); Circle().fill(pages[at].c2.opacity(0.3)).frame(width: 340).blur(radius: 90).offset(x: 140, y: -190) }
        .animation(.easeInOut(duration: 0.9), value: at).ignoresSafeArea()
    }
    .onAppear { DispatchQueue.main.async { shown = true } }
  }
  private func ask() { withAnimation(.spring(response: 0.55, dampingFraction: 0.86)) { page = 3 } }
  /// One page: a glass emblem in its colours, a line, and a note, each coming in a moment after the last.
  private func card(_ i: Int) -> some View {
    let p = pages[i], on = at == i && shown, run = LinearGradient(colors: [p.c1, p.c2], startPoint: .topLeading, endPoint: .bottomTrailing)
    return VStack(spacing: 0) {
      Spacer()
      ZStack {
        Circle().fill(.ultraThinMaterial)
        Circle().strokeBorder(run, lineWidth: 1.5)
        Image(systemName: p.icon).font(.system(size: 66, weight: .light)).foregroundStyle(run)
      }
      .frame(width: 184, height: 184).shadow(color: p.c1.opacity(0.4), radius: 30, y: 16)
      .scaleEffect(on ? 1 : 0.7).opacity(on ? 1 : 0).animation(.spring(response: 0.7, dampingFraction: 0.7), value: on)
      Text(p.title).font(.system(size: 32, weight: .bold)).tracking(-1).multilineTextAlignment(.center).padding(.top, 40)
        .offset(x: on ? 0 : 40).opacity(on ? 1 : 0).animation(.spring(response: 0.7, dampingFraction: 0.86).delay(0.05), value: on)
      Text(p.note).font(.system(size: 17)).foregroundStyle(.secondary).multilineTextAlignment(.center).padding(.top, 12)
        .offset(x: on ? 0 : 64).opacity(on ? 1 : 0).animation(.spring(response: 0.8, dampingFraction: 0.86).delay(0.1), value: on)
      Spacer(); Spacer()
    }.padding(.horizontal, 32)
  }
}

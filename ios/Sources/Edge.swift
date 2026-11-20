// The page runs flush to the top of the screen, as Safari's does: the strip behind the clock takes the colour along the
// page's own top edge, and the clock and battery turn light or dark to suit it.
import SwiftUI
import WebKit

extension PhoneTab {
  /// The colour of whatever lies along the top edge of the page as it is scrolled now: the first thing there with a
  /// colour of its own (a header, or the page behind it). "r,g,b", or nothing when it cannot tell.
  static let topScript = """
  (function(){ function solid(c){ var m = /^rgba?\\(([^)]+)\\)/.exec(c || ''), k = 1;
      if (!m) { m = /^color\\((?:srgb|display-p3) ([^)]+)\\)/.exec(c || ''); k = 255; } if (!m) return null;
      var p = m[1].split(/[\\s,\\/]+/).filter(Boolean).map(parseFloat); if (p.length < 3 || p.slice(0, 3).some(isNaN)) return null;
      return (p.length < 4 || p[3] >= 0.9) ? [p[0] * k, p[1] * k, p[2] * k].map(Math.round) : null; }
    var all = document.elementsFromPoint(Math.max(1, innerWidth / 2), 1);
    for (var i = 0; i < all.length; i++) { var s = getComputedStyle(all[i]); if (s.backgroundImage && s.backgroundImage !== 'none' && all[i] !== document.documentElement && all[i] !== document.body) return '';
      var c = solid(s.backgroundColor); if (c) return c.join(','); }
    return ''; })()
  """
  /// Look again shortly (pages change as they load and as they scroll; many calls become one look).
  func topSoon() {
    guard !topPending else { return }
    topPending = true
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.12) { [weak self] in self?.topPending = false; self?.readTop() }
  }
  private func readTop() {
    guard !atStart, web.url != nil else { return }
    Task { @MainActor in
      let s = (try? await web.evaluateJavaScript(Self.topScript, in: nil, contentWorld: signInWorld)) as? String ?? ""
      let p = s.split(separator: ",").compactMap { Double($0) }
      let c = p.count == 3 ? UIColor(red: p[0] / 255, green: p[1] / 255, blue: p[2] / 255, alpha: 1) : (web.themeColor ?? web.underPageBackgroundColor)
      setTop(c)
    }
  }
  func setTop(_ c: UIColor?) {
    let key = c.map { TopEdge.key($0) } ?? ""
    guard key != topKey else { return }
    topKey = key; withAnimation(.easeOut(duration: 0.22)) { topColor = c }
    browser?.statusChanged()
  }
}

enum TopEdge {
  static func rgb(_ c: UIColor) -> (Double, Double, Double) { var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0; c.resolvedColor(with: UITraitCollection.current).getRed(&r, green: &g, blue: &b, alpha: &a); return (Double(r), Double(g), Double(b)) }
  static func key(_ c: UIColor) -> String { let (r, g, b) = rgb(c); return "\(Int(r * 255)),\(Int(g * 255)),\(Int(b * 255))" }
  /// Whether white reads better than black on it.
  static func dark(_ c: UIColor) -> Bool { let (r, g, b) = rgb(c); return 0.299 * r + 0.587 * g + 0.114 * b < 0.6 }
}

extension Browser {
  /// What the clock and battery sit on now: a page's top colour, a private tab's dark page, or Sleek's own screens (nil: as the phone has it).
  var statusDark: Bool? {
    guard launch == .done, let t = current else { return nil }
    if t.atStart { return t.isPrivate ? true : nil }
    return t.topColor.map(TopEdge.dark)
  }
  func statusChanged() { StatusBar.show(statusDark.map { $0 ? .lightContent : .darkContent } ?? .default) }
}

/// The clock and battery, light or dark. SwiftUI decides this from the whole app's light or dark look and offers no way to
/// say otherwise for one screen, so the app's first view controller is given a subclass, made here, that answers for it.
enum StatusBar {
  static var style: UIStatusBarStyle = .default
  @MainActor static func show(_ s: UIStatusBarStyle) {
    guard let root = UIApplication.shared.connectedScenes.compactMap({ ($0 as? UIWindowScene)?.keyWindow }).first?.rootViewController else { return }
    adopt(root)
    guard s != style else { return }
    style = s; UIView.animate(withDuration: 0.22) { root.setNeedsStatusBarAppearanceUpdate() }
  }
  @MainActor private static func adopt(_ c: UIViewController) {
    guard let cls = object_getClass(c) else { return }
    let was = NSStringFromClass(cls); if was.hasPrefix("SleekStatus_") { return }
    let name = "SleekStatus_" + was
    var sub: AnyClass? = NSClassFromString(name)
    if sub == nil, let made = objc_allocateClassPair(cls, name, 0) {
      let answer: @convention(block) (AnyObject) -> Int = { _ in StatusBar.style.rawValue }
      class_addMethod(made, #selector(getter: UIViewController.preferredStatusBarStyle), imp_implementationWithBlock(answer), "q@:")
      let none: @convention(block) (AnyObject) -> AnyObject? = { _ in nil }
      class_addMethod(made, #selector(getter: UIViewController.childForStatusBarStyle), imp_implementationWithBlock(none), "@@:")
      objc_registerClassPair(made); sub = made
    }
    if let sub { object_setClass(c, sub) }
  }
}

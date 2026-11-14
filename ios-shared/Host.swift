// One of Sleek's own pages (a Docs page, a deck) shown inside a native app.
//
// The page is the very page Sleek uses on the web, served from inside the app (sleek://app/…, Common.swift),
// so a document or a deck is drawn and edited by the same code everywhere. The app hides the page's own
// bars with a little CSS, puts its own native ones around it, and talks to the page in JavaScript:
//   js(...)        ask the page for something, or tell it to do something
//   onSay          what the page tells the app (window.webkit.messageHandlers.sleekHost.postMessage)
import SwiftUI
import WebKit

@MainActor
final class Host: NSObject, ObservableObject, WKScriptMessageHandler, WKNavigationDelegate, WKUIDelegate {
  let web: WKWebView
  @Published var loaded = false
  var onSay: (([String: Any]) -> Void)?
  var onLoad: (() -> Void)?

  /// `css` hides what the native app replaces; `script` runs in every page once its document is there.
  /// `early` runs before the page's own scripts (to set what they read as they start).
  init(css: String = "", script: String = "", early: String = "") {
    let c = WKWebViewConfiguration()
    c.websiteDataStore = Work.store
    c.setURLSchemeHandler(OwnPages(), forURLScheme: "sleek")
    c.allowsInlineMediaPlayback = true
    c.mediaTypesRequiringUserActionForPlayback = []
    let style = "(function(){ var s = document.createElement('style'); s.id = 'sleek-host'; s.textContent = " + json([css]) + "[0]; (document.head || document.documentElement).appendChild(s); document.documentElement.classList.add('in-app'); })();"
    c.userContentController.addUserScript(WKUserScript(source: style, injectionTime: .atDocumentStart, forMainFrameOnly: true))
    if !early.isEmpty { c.userContentController.addUserScript(WKUserScript(source: early, injectionTime: .atDocumentStart, forMainFrameOnly: true)) }
    if !script.isEmpty { c.userContentController.addUserScript(WKUserScript(source: script, injectionTime: .atDocumentEnd, forMainFrameOnly: true)) }
    web = WKWebView(frame: CGRect(x: 0, y: 0, width: 390, height: 700), configuration: c)
    super.init()
    c.userContentController.add(Weak(self), name: "sleekHost")
    web.navigationDelegate = self; web.uiDelegate = self
    web.isOpaque = false; web.backgroundColor = .clear; web.scrollView.backgroundColor = .clear
    web.scrollView.contentInsetAdjustmentBehavior = .never
    if #available(iOS 16.4, *) { web.isInspectable = true }
  }
  func open(_ address: String) { loaded = false; if let u = URL(string: address) { web.load(URLRequest(url: u)) } }
  /// Run JavaScript in the page (it may `await`, and `return` a value). Nil when it fails.
  @discardableResult func js(_ code: String, _ args: [String: Any] = [:]) async -> Any? { try? await web.callAsyncJavaScript(code, arguments: args, in: nil, contentWorld: .page) }
  /// Tell the page to do something, without waiting for it.
  func tell(_ code: String, _ args: [String: Any] = [:]) { web.callAsyncJavaScript(code, arguments: args, in: nil, in: .page) { _ in } }

  func userContentController(_ c: WKUserContentController, didReceive message: WKScriptMessage) { if let m = message.body as? [String: Any] { onSay?(m) } }
  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { loaded = true; onLoad?() }
  // Sleek's own pages stay inside; a link to the web goes to the phone's browser
  func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
    guard let u = action.request.url, let s = u.scheme else { decisionHandler(.allow); return }
    if ["sleek", "about", "blob", "data"].contains(s) { decisionHandler(.allow); return }
    if action.targetFrame?.isMainFrame != false { UIApplication.shared.open(u); decisionHandler(.cancel) } else { decisionHandler(s == "https" ? .allow : .cancel) }      // a clip or a map set into a page may load; the page itself never leaves
  }
  func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? { if let u = action.request.url, u.scheme == "https" || u.scheme == "http" { UIApplication.shared.open(u) }; return nil }
  private func top() -> UIViewController? { var c = UIApplication.shared.connectedScenes.compactMap { ($0 as? UIWindowScene)?.keyWindow }.first?.rootViewController; while let n = c?.presentedViewController { c = n }; return c }
  func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
    let a = UIAlertController(title: nil, message: message, preferredStyle: .alert); a.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler() })
    if let t = top() { t.present(a, animated: true) } else { completionHandler() }
  }
  func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
    let a = UIAlertController(title: nil, message: message, preferredStyle: .alert); a.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completionHandler(false) }); a.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler(true) })
    if let t = top() { t.present(a, animated: true) } else { completionHandler(false) }
  }
  func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (String?) -> Void) {
    let a = UIAlertController(title: nil, message: prompt, preferredStyle: .alert); a.addTextField { $0.text = defaultText }
    a.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completionHandler(nil) }); a.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler(a.textFields?.first?.text) })
    if let t = top() { t.present(a, animated: true) } else { completionHandler(nil) }
  }
}

// ---------- a bar of the app's own on top of the keyboard ----------
// While you type in a page, the engine puts its own small bar on the keyboard. A page that is a document wants its
// tools there instead. The engine has no setting for this, so the view that takes the typing is given a subclass,
// made on the spot, whose keyboard bar is the one handed in here.
private var barKey: UInt8 = 0
extension Host {
  /// True once the bar is in place.
  @discardableResult func setKeyboardBar(_ bar: UIView?) -> Bool {
    guard let content = web.scrollView.subviews.first(where: { String(describing: type(of: $0)).hasPrefix("WKContent") }) else { return false }
    objc_setAssociatedObject(content, &barKey, bar, .OBJC_ASSOCIATION_RETAIN_NONATOMIC)
    let base: AnyClass = type(of: content), name = "SleekBar_" + NSStringFromClass(base)
    if NSStringFromClass(base).hasPrefix("SleekBar_") { content.reloadInputViews(); return true }
    var sub: AnyClass? = NSClassFromString(name)
    if sub == nil, let made = objc_allocateClassPair(base, name, 0) {
      let getter: @convention(block) (AnyObject) -> UIView? = { me in objc_getAssociatedObject(me, &barKey) as? UIView }
      class_addMethod(made, #selector(getter: UIResponder.inputAccessoryView), imp_implementationWithBlock(getter), "@@:")
      objc_registerClassPair(made); sub = made
    }
    guard let to = sub else { return false }
    object_setClass(content, to); content.reloadInputViews(); return true
  }
  /// A SwiftUI bar, sized for the top of the keyboard.
  static func keyboardBar<V: View>(height: CGFloat = 56, @ViewBuilder _ content: () -> V) -> UIView {
    let h = UIHostingController(rootView: content()); h.view.backgroundColor = .clear; h.view.frame = CGRect(x: 0, y: 0, width: UIScreen.main.bounds.width, height: height); h.view.autoresizingMask = [.flexibleWidth]
    let box = BarBox(frame: h.view.frame); box.autoresizingMask = [.flexibleWidth]; box.backgroundColor = .clear; box.addSubview(h.view); box.keep = h
    return box
  }
}
final class BarBox: UIView { var keep: UIViewController? }

/// The page, placed in the screen.
struct HostView: UIViewRepresentable {
  let host: Host
  func makeUIView(context: Context) -> WKWebView { host.web }
  func updateUIView(_ v: WKWebView, context: Context) {}
}

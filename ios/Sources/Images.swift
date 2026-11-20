// Pressing and holding on a page: a link opens in a new tab (or a private one), is copied or shared; an image opens on
// its own, is saved to Photos, copied or shared. An image that is also a link gets both.
//
// WebKit asks Sleek what to offer only when a link is held. For an image that is not a link it shows a menu of its own,
// which Sleek cannot add to. So a small script apart from the page's own notes the image under each touch and tells
// Sleek; for an image that is not a link it also asks WebKit to leave its menu out, and Sleek shows its own in the
// phone's usual way (a press-and-hold menu on the page as a whole).
import SwiftUI
import WebKit
import Photos
import UniformTypeIdentifiers

/// The image under the finger at the last touch: where it is from, whether a link is around it, and where it sits on the page's view.
struct HeldImage { let src: URL, linked: Bool, box: CGRect?, at: Date }

extension PhoneTab: UIContextMenuInteractionDelegate {
  /// Notes the image under the finger each time the page is touched (the topmost of the few things lying there).
  static let heldScript = """
  (function(){ if (window.__sleekHeld) return; window.__sleekHeld = 1;
    document.addEventListener('touchstart', function(e){ var src = '', linked = false, box = null, p = e.touches && e.touches.length === 1 && e.touches[0];
      if (p) { var all = document.elementsFromPoint(p.clientX, p.clientY);
        for (var i = 0; i < all.length && i < 6 && !src; i++) { var el = all[i];
          if (el.closest && el.closest('a[href]')) linked = true;
          if (el.tagName === 'IMG') { src = el.currentSrc || el.src || '';
            if (src) { var r = el.getBoundingClientRect(), v = window.visualViewport; box = [r.left - (v ? v.offsetLeft : 0), r.top - (v ? v.offsetTop : 0), r.width, r.height];
              if (!linked) el.style.setProperty('-webkit-touch-callout', 'none'); } } }
        if (!src) linked = false; }
      try { window.webkit.messageHandlers.sleekHeld.postMessage({ src: src, linked: linked, box: box }); } catch (x) {}
    }, { capture: true, passive: true });
  })();
  """
  /// What the script said about a touch.
  func noteHeld(_ body: Any) {
    guard let m = body as? [String: Any], let s = m["src"] as? String, !s.isEmpty, let u = URL(string: s), ["https", "http", "data", "blob"].contains(u.scheme ?? "") else { held = nil; return }
    let b = (m["box"] as? [NSNumber])?.map { CGFloat(truncating: $0) }
    held = HeldImage(src: u, linked: m["linked"] as? Bool ?? false, box: b.flatMap { $0.count == 4 ? CGRect(x: $0[0], y: $0[1], width: $0[2], height: $0[3]) : nil }, at: Date())
  }
  /// The image held just now, if it was one.
  var heldNow: HeldImage? { held.flatMap { Date().timeIntervalSince($0.at) < 3 ? $0 : nil } }

  /// A link was held (WebKit asks, in Model.swift): its menu, with the image's too when the link is an image.
  func heldMenu(link: URL?) -> UIContextMenuConfiguration? {
    guard let link else { return nil }
    let image = heldNow.flatMap { $0.linked ? $0.src : nil }
    return UIContextMenuConfiguration(identifier: nil, previewProvider: nil) { [weak self] _ in
      guard let self else { return nil }
      return UIMenu(title: link.absoluteString, children: self.linkMenu(link) + (image.map { [UIMenu(title: "", options: .displayInline, children: self.imageMenu($0, alone: false))] } ?? []))
    }
  }
  /// An image that is not a link was held: Sleek's own menu for it. Anything else is left to WebKit.
  func contextMenuInteraction(_ interaction: UIContextMenuInteraction, configurationForMenuAtLocation location: CGPoint) -> UIContextMenuConfiguration? {
    guard let h = heldNow, !h.linked else { return nil }
    return UIContextMenuConfiguration(identifier: nil, previewProvider: nil) { [weak self] _ in self.map { UIMenu(title: "", children: $0.imageMenu(h.src, alone: true)) } }
  }
  /// Only the image lifts, not the whole page.
  func contextMenuInteraction(_ interaction: UIContextMenuInteraction, configuration: UIContextMenuConfiguration, highlightPreviewForItemWithIdentifier identifier: NSCopying) -> UITargetedPreview? { heldPreview(interaction) }
  func contextMenuInteraction(_ interaction: UIContextMenuInteraction, configuration: UIContextMenuConfiguration, dismissalPreviewForItemWithIdentifier identifier: NSCopying) -> UITargetedPreview? { heldPreview(interaction) }
  private func heldPreview(_ interaction: UIContextMenuInteraction) -> UITargetedPreview? {
    guard web.window != nil else { return nil }
    let z = web.scrollView.zoomScale, top = web.scrollView.adjustedContentInset.top, at = interaction.location(in: web)
    var r = held?.box.map { CGRect(x: $0.minX * z, y: $0.minY * z + top, width: $0.width * z, height: $0.height * z) }?.intersection(web.bounds) ?? .null
    if r.isNull || r.width < 8 || r.height < 8 || !r.insetBy(dx: -24, dy: -24).contains(at) { r = CGRect(x: at.x - 40, y: at.y - 40, width: 80, height: 80).intersection(web.bounds) }      // not where it was thought to be: just around the finger
    let p = UIPreviewParameters(); p.backgroundColor = .clear; p.visiblePath = UIBezierPath(roundedRect: r, cornerRadius: 14)
    return UITargetedPreview(view: web, parameters: p)
  }
  private func linkMenu(_ u: URL) -> [UIMenuElement] {
    [UIAction(title: "Open in Background", image: UIImage(systemName: "square.on.square.dashed")) { [weak self] _ in self?.browser?.newTab(u, isPrivate: self?.isPrivate ?? false, background: true) },
     UIAction(title: "Open in New Tab", image: UIImage(systemName: "plus.square.on.square")) { [weak self] _ in self?.browser?.newTab(u, isPrivate: self?.isPrivate ?? false) },
     UIMenu(title: "", options: .displayInline, children: [
       UIAction(title: "Open in Private Tab", image: UIImage(systemName: "eyeglasses")) { [weak self] _ in self?.browser?.newTab(u, isPrivate: true) }] +
       (isPrivate ? [] : [UIAction(title: "Open in Background Private Tab", image: UIImage(systemName: "eyeglasses")) { [weak self] _ in self?.browser?.newTab(u, isPrivate: true, background: true) }])),
     UIMenu(title: "", options: .displayInline, children: [
       UIAction(title: "Copy Link", image: UIImage(systemName: "doc.on.doc")) { _ in UIPasteboard.general.url = u },
       UIAction(title: "Share Link…", image: UIImage(systemName: "square.and.arrow.up")) { _ in topController()?.present(UIActivityViewController(activityItems: [u], applicationActivities: nil), animated: true) }])]
  }
  /// What an image offers. One that only this page can reach (made by the page itself) opens here, not in another tab.
  private func imageMenu(_ u: URL, alone: Bool) -> [UIMenuElement] {
    let own = u.scheme == "blob" || u.scheme == "data"
    var m: [UIMenuElement] = [UIAction(title: "Open Image", image: UIImage(systemName: "photo")) { [weak self] _ in self?.go(u) }]
    if !own && alone { m.append(UIAction(title: "Open Image in New Tab", image: UIImage(systemName: "plus.square.on.square")) { [weak self] _ in self?.browser?.newTab(u, isPrivate: self?.isPrivate ?? false) }) }
    m.append(UIAction(title: "Save to Photos", image: UIImage(systemName: "square.and.arrow.down")) { [weak self] _ in Task { await self?.saveImage(u) } })
    m.append(UIAction(title: "Copy Image", image: UIImage(systemName: "doc.on.doc")) { [weak self] _ in Task { await self?.copyImage(u) } })
    if alone { m.append(UIAction(title: "Share Image…", image: UIImage(systemName: "square.and.arrow.up")) { [weak self] _ in Task { await self?.shareImage(u) } }) }
    return m
  }

  // ---------- the image itself ----------
  struct Picture { let data: Data, name: String, type: UTType? }
  /// Fetch the image as the page did: with this tab's cookies and the page as where it was asked from. An image the page
  /// made itself (blob:) is read inside the page; one written into the page (data:) is simply unpacked.
  func picture(_ u: URL) async -> Picture? {
    var data: Data?, mime = ""
    if u.scheme == "blob" {
      let code = "const r = await fetch(u); const b = await r.blob(); return await new Promise((ok) => { const f = new FileReader(); f.onload = () => ok(f.result); f.onerror = () => ok(''); f.readAsDataURL(b); });"
      let s = (try? await web.callAsyncJavaScript(code, arguments: ["u": u.absoluteString], in: nil, contentWorld: signInWorld)) as? String ?? ""
      if let at = s.range(of: ";base64,") { data = Data(base64Encoded: String(s[at.upperBound...])); mime = String(s[s.index(s.startIndex, offsetBy: min(5, s.count))..<at.lowerBound]) }
    } else {
      let cfg = URLSessionConfiguration.ephemeral
      if u.scheme != "data" { for c in await web.configuration.websiteDataStore.httpCookieStore.allCookies() { cfg.httpCookieStorage?.setCookie(c) } }
      var r = URLRequest(url: u); r.timeoutInterval = 30
      if let page = web.url, page.scheme?.hasPrefix("http") == true { r.setValue(page.absoluteString, forHTTPHeaderField: "Referer") }
      if let agent = (try? await web.evaluateJavaScript("navigator.userAgent")) as? String { r.setValue(agent, forHTTPHeaderField: "User-Agent") }
      if let (d, resp) = try? await URLSession(configuration: cfg).data(for: r), (resp as? HTTPURLResponse).map({ (200..<300).contains($0.statusCode) }) ?? true { data = d; mime = resp.mimeType ?? "" }
    }
    guard let data, !data.isEmpty else { return nil }
    let type = UTType(mimeType: mime).flatMap { $0.conforms(to: .image) ? $0 : nil } ?? Self.sniff(data)
    var name = u.scheme?.hasPrefix("http") == true ? u.deletingPathExtension().lastPathComponent : ""
    name = String(name.filter { $0.isLetter || $0.isNumber || "-_ ".contains($0) }.prefix(60)); if name.isEmpty { name = "Image" }
    return Picture(data: data, name: name + "." + (type?.preferredFilenameExtension ?? "png"), type: type)
  }
  /// What kind of image the first bytes say it is.
  static func sniff(_ d: Data) -> UTType? {
    let b = [UInt8](d.prefix(12)); guard b.count >= 12 else { return nil }
    if b[0] == 0x89, b[1] == 0x50 { return .png }; if b[0] == 0xFF, b[1] == 0xD8 { return .jpeg }; if b[0] == 0x47, b[1] == 0x49 { return .gif }
    if b[0] == 0x52, b[1] == 0x49, b[8] == 0x57, b[9] == 0x45 { return .webP }; if b[4] == 0x66, b[5] == 0x74, b[6] == 0x79, b[7] == 0x70 { return .heic }
    return nil
  }
  /// Photos is asked only for leave to add, never to look.
  func saveImage(_ u: URL) async {
    guard let p = await picture(u) else { browser?.say("That image couldn't be fetched"); return }
    let leave = await PHPhotoLibrary.requestAuthorization(for: .addOnly)
    guard leave == .authorized || leave == .limited else { browser?.say("Photos is off for Sleek. Turn it on in Settings."); return }
    var saved = (try? await PHPhotoLibrary.shared().performChanges { PHAssetCreationRequest.forAsset().addResource(with: .photo, data: p.data, options: nil) }) != nil
    if !saved, let i = UIImage(data: p.data) { saved = (try? await PHPhotoLibrary.shared().performChanges { PHAssetChangeRequest.creationRequestForAsset(from: i) }) != nil }      // a kind Photos won't keep as it is: as a picture of it
    tap(saved ? .medium : .rigid); browser?.say(saved ? "Saved to Photos" : "Photos can't keep that kind of image")
  }
  func copyImage(_ u: URL) async {
    guard let p = await picture(u) else { browser?.say("That image couldn't be fetched"); return }
    if let t = p.type { UIPasteboard.general.setData(p.data, forPasteboardType: t.identifier) } else if let i = UIImage(data: p.data) { UIPasteboard.general.image = i } else { browser?.say("That image couldn't be copied"); return }
    tap(); browser?.say("Image copied")
  }
  func shareImage(_ u: URL) async {
    guard let p = await picture(u) else { browser?.say("That image couldn't be fetched"); return }
    let dir = FileManager.default.temporaryDirectory.appendingPathComponent("share-\(UUID().uuidString)"), f = dir.appendingPathComponent(p.name)
    try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    guard (try? p.data.write(to: f)) != nil else { browser?.say("That image couldn't be shared"); return }
    let sheet = UIActivityViewController(activityItems: [f], applicationActivities: nil)
    sheet.completionWithItemsHandler = { _, _, _, _ in try? FileManager.default.removeItem(at: dir) }
    topController()?.present(sheet, animated: true)
  }
}

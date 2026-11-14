// A picture dragged into Sleek. Dropped on the bar, on a new tab, or on a page that has no use of its
// own for it, Sleek asks what you want: open the picture, or search Google for it. (A page that takes
// the drop itself, to attach it to a message or add it to a deck, keeps it; Sleek stays out of the way.)
import AppKit
import UniformTypeIdentifiers
import WebKit

struct DroppedImage {
  var file: URL?        // a picture on this Mac
  var url: URL?         // or one on the web
  var name: String { file?.lastPathComponent ?? url?.lastPathComponent ?? "Picture" }

  static let kinds = ["png", "jpg", "jpeg", "gif", "webp", "heic", "heif", "tiff", "tif", "bmp", "avif", "svg"]
  static func isImage(_ u: URL) -> Bool {
    let ext = u.pathExtension.lowercased()
    if u.isFileURL, let t = UTType(filenameExtension: ext) { return t.conforms(to: .image) }
    return kinds.contains(ext)
  }
  /// The picture in what is being dragged, if there is one: a picture file, a picture's address, or the picture itself.
  static func from(_ pb: NSPasteboard, keepIn dir: URL) -> DroppedImage? {
    let urls = (pb.readObjects(forClasses: [NSURL.self], options: nil) as? [URL]) ?? []
    if let f = urls.first(where: { $0.isFileURL && isImage($0) }) { return DroppedImage(file: f, url: nil) }
    if urls.contains(where: { $0.isFileURL }) { return nil }      // some other kind of file: not ours
    if let u = urls.first(where: { ($0.scheme == "https" || $0.scheme == "http") && isImage($0) }) { return DroppedImage(file: nil, url: u) }
    // the picture itself, dragged out of another app: keep a copy to work from
    if let data = pb.data(forType: .png) ?? pb.data(forType: .tiff), let rep = NSBitmapImageRep(data: data), let png = rep.representation(using: .png, properties: [:]) {
      try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
      let f = dir.appendingPathComponent("Picture \(Int(Date().timeIntervalSince1970)).png")
      if (try? png.write(to: f, options: .atomic)) != nil { return DroppedImage(file: f, url: nil) }
    }
    return nil
  }
  /// A small copy to show in the question, as text a page can use for a picture.
  var thumb: String {
    if let u = url { return u.absoluteString }
    guard let f = file, let img = NSImage(contentsOf: f), let small = DroppedImage.jpeg(img, longest: 240, quality: 0.8) else { return "" }
    return "data:image/jpeg;base64," + small.base64EncodedString()
  }
  static func jpeg(_ img: NSImage, longest: CGFloat, quality: Double) -> Data? {
    let s = img.size; guard s.width > 0, s.height > 0 else { return nil }
    let k = min(1, longest / max(s.width, s.height)), w = max(1, Int(s.width * k)), h = max(1, Int(s.height * k))
    guard let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: w, pixelsHigh: h, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0) else { return nil }
    rep.size = NSSize(width: w, height: h)
    NSGraphicsContext.saveGraphicsState(); NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
    NSColor.white.setFill(); NSRect(x: 0, y: 0, width: w, height: h).fill()
    img.draw(in: NSRect(x: 0, y: 0, width: w, height: h), from: .zero, operation: .sourceOver, fraction: 1)
    NSGraphicsContext.restoreGraphicsState()
    return rep.representation(using: .jpeg, properties: [.compressionFactor: quality])
  }
  /// What to load to search Google for this picture: its address handed to Google, or the picture itself sent up.
  /// (Nothing is sent until you choose to search.)
  var search: URLRequest? {
    if let u = url {
      var c = URLComponents(string: "https://lens.google.com/uploadbyurl")!; c.queryItems = [URLQueryItem(name: "url", value: u.absoluteString)]
      return c.url.map { URLRequest(url: $0) }
    }
    guard let f = file, let img = NSImage(contentsOf: f), let data = DroppedImage.jpeg(img, longest: 1600, quality: 0.86) else { return nil }
    let edge = "----Sleek" + UUID().uuidString.replacingOccurrences(of: "-", with: "")
    var body = Data()
    body.append(Data("--\(edge)\r\nContent-Disposition: form-data; name=\"encoded_image\"; filename=\"picture.jpg\"\r\nContent-Type: image/jpeg\r\n\r\n".utf8))
    body.append(data); body.append(Data("\r\n--\(edge)--\r\n".utf8))
    var r = URLRequest(url: URL(string: "https://lens.google.com/v3/upload")!)
    r.httpMethod = "POST"; r.setValue("multipart/form-data; boundary=\(edge)", forHTTPHeaderField: "Content-Type"); r.httpBody = body
    return r
  }
}

/// A page's web view. It notes a picture dropped on it from outside Sleek, so that if nothing on the page takes
/// the drop (the page's script says so), Sleek can step in with its question. The page still gets the drop first.
final class PageView: WKWebView {
  var onDrop: ((NSPasteboard) -> Void)?
  override func performDragOperation(_ sender: NSDraggingInfo) -> Bool { if sender.draggingSource == nil { onDrop?(sender.draggingPasteboard) }; return super.performDragOperation(sender) }
}

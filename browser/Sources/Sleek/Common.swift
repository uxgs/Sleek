// What the Mac app and the iPhone app both stand on, with nothing in it that belongs to one of them:
//   OwnPages      the app's own pages, served from inside the app (sleek://app/… is Slides, Docs and Tasks;
//                 sleek://ui/… is the app's own; sleek://ui/_icon/<site> is a site's kept icon)
//   destination   what was typed in the address box, as an address to go to or a search
//   Search        the search providers on offer
//   readPage      what Save to Sleek takes from a page
// Each app says where its files are (Res, in its own Support.swift). The iPhone app (../../../ios) compiles
// this file, Blocker.swift, Store.swift and Known.swift as they are.
import Foundation
import WebKit

/// sleek://ui/<file> is the app's own pages; sleek://app/<file> is Slides, Docs and Tasks.
final class OwnPages: NSObject, WKURLSchemeHandler {
  static let types: [String: String] = ["html": "text/html; charset=utf-8", "js": "text/javascript; charset=utf-8", "css": "text/css; charset=utf-8", "json": "application/json", "webmanifest": "application/manifest+json",
    "svg": "image/svg+xml", "png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg", "webp": "image/webp", "gif": "image/gif", "mp4": "video/mp4", "webm": "video/webm", "woff2": "font/woff2", "ico": "image/x-icon"]
  func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
    guard let url = task.request.url else { task.didFailWithError(URLError(.badURL)); return }
    // sleek://ui/_icon/<site>: the icon Sleek kept for a site, if it has one
    if url.host == "ui", url.path.hasPrefix("/_icon/") {
      if let f = Icons.file(url.lastPathComponent), let d = try? Data(contentsOf: f), let type = Icons.type(d) {
        task.didReceive(HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: ["Content-Type": type, "Content-Length": "\(d.count)", "Cache-Control": "max-age=3600"])!)
        task.didReceive(d); task.didFinish()
      } else { task.didReceive(HTTPURLResponse(url: url, statusCode: 404, httpVersion: "HTTP/1.1", headerFields: ["Content-Type": "text/plain"])!); task.didReceive(Data()); task.didFinish() }
      return
    }
    // sleek://app/_bridge.html is the app's own door to your work (Work.swift): it lives with the app's own pages, but is
    // served beside Slides, Docs and Tasks so that it shares their storage
    let bridge = url.host == "app" && url.path == "/_bridge.html"
    let base = url.host == "ui" || bridge ? Res.root.appendingPathComponent("chrome") : Res.site
    var path = bridge ? "/bridge.html" : url.path; if path.isEmpty || path == "/" { path = "/index.html" }
    let file = base.appendingPathComponent(String(path.dropFirst())).standardizedFileURL
    guard file.path.hasPrefix(base.standardizedFileURL.path), let data = try? Data(contentsOf: file) else {
      task.didReceive(HTTPURLResponse(url: url, statusCode: 404, httpVersion: "HTTP/1.1", headerFields: ["Content-Type": "text/plain"])!)
      task.didReceive(Data("Not here".utf8)); task.didFinish(); return
    }
    let type = OwnPages.types[file.pathExtension.lowercased()] ?? "application/octet-stream"
    task.didReceive(HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: ["Content-Type": type, "Content-Length": "\(data.count)", "Cache-Control": "no-cache"])!)
    task.didReceive(data); task.didFinish()
  }
  func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}
}

/// Lets a page's messages reach whoever listens without the page keeping the listener alive.
final class Weak: NSObject, WKScriptMessageHandler {
  weak var to: WKScriptMessageHandler?
  init(_ to: WKScriptMessageHandler) { self.to = to }
  func userContentController(_ c: WKUserContentController, didReceive message: WKScriptMessage) { to?.userContentController(c, didReceive: message) }
}

func json(_ value: Any) -> String {
  guard JSONSerialization.isValidJSONObject(value), let d = try? JSONSerialization.data(withJSONObject: value) else { return "null" }
  return String(data: d, encoding: .utf8) ?? "null"
}

/// What someone typed in the address box: an address to go to, or words to search for.
func destination(for typed: String, search: String) -> URL? {
  let t = typed.trimmingCharacters(in: .whitespacesAndNewlines); if t.isEmpty { return nil }
  if t.range(of: "^[a-zA-Z][a-zA-Z0-9+.-]*://", options: .regularExpression) != nil || t.hasPrefix("about:") { return URL(string: t) }
  let looksLikeAddress = !t.contains(" ") && (t.range(of: "^[^/\\s]+\\.[a-zA-Z]{2,}(:\\d+)?(/.*)?$", options: .regularExpression) != nil || t.hasPrefix("localhost") || t.range(of: "^\\d+\\.\\d+\\.\\d+\\.\\d+", options: .regularExpression) != nil)
  if looksLikeAddress { return URL(string: (t.hasPrefix("localhost") || t.first!.isNumber ? "http://" : "https://") + t) }
  // the search address either says where the words go (%s), or takes them as q=…
  if search.contains("%s") { var ok = CharacterSet.urlQueryAllowed; ok.remove(charactersIn: "&+=?#"); return URL(string: search.replacingOccurrences(of: "%s", with: t.addingPercentEncoding(withAllowedCharacters: ok) ?? "")) }
  guard var c = URLComponents(string: search) else { return nil }
  c.queryItems = (c.queryItems ?? []) + [URLQueryItem(name: "q", value: t)]
  return c.url
}

/// Who can answer a search typed in the address box. (The Mac's bar has the same list, in chrome.js.)
enum Search {
  static let providers: [(name: String, address: String)] = [("DuckDuckGo", "https://duckduckgo.com/"), ("Google", "https://www.google.com/search"), ("Bing", "https://www.bing.com/search"), ("Brave Search", "https://search.brave.com/search"),
    ("Ecosia", "https://www.ecosia.org/search"), ("Startpage", "https://www.startpage.com/sp/search?query=%s"), ("Kagi", "https://kagi.com/search")]
  static func name(for address: String) -> String { providers.first { $0.address == address }?.name ?? (URL(string: address)?.host ?? "the web") }
}

/// What Save to Sleek takes from a page: its name and address, the words selected, and otherwise the words of its article.
let readPageScript = """
(function(){ var sel = String(window.getSelection ? window.getSelection() : '').trim(), out = { title: document.title || location.hostname, url: location.href, sel: sel, blocks: [] };
  if(sel){ sel.split(/\\n+/).forEach(function(s){ s = s.trim(); if(s) out.blocks.push({ k: 'p', t: s.slice(0, 4000) }); }); return out; }
  var root = document.querySelector('article') || document.querySelector('main, [role=main]') || document.body, n = 0;
  Array.prototype.forEach.call(root.querySelectorAll('h2, h3, p, li, blockquote'), function(e){
    if(n >= 300 || (e.closest && e.closest('nav, header, footer, aside, form, figure, [role=navigation], [aria-hidden=true]'))) return;
    var tag = e.tagName, t = (e.innerText || '').replace(/\\s+/g, ' ').trim();
    if(tag === 'P' && t.length < 40) return; if(tag === 'LI' && (t.length < 40 || e.querySelector('p, li'))) return; if(tag === 'BLOCKQUOTE' && e.querySelector('p')) return;
    if(tag.charAt(0) === 'H' && (t.length < 3 || t.length > 200)) return;
    out.blocks.push({ k: tag.charAt(0) === 'H' ? 'h' : tag === 'BLOCKQUOTE' ? 'q' : 'p', t: t.slice(0, 4000) }); n++;
  });
  return out; })()
"""

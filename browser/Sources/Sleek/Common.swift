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

/// Signing in, on the Mac and on the iPhone. This script runs apart from the page's own scripts (they cannot see or
/// change it). It notices the boxes of a sign-in form, tells the browser when the cursor goes into one (so it can offer
/// a saved name, or a strong password when signing up) and what name and password the page was sent (so it can offer
/// to keep them), and fills the boxes when the browser says to. It never asks for, or holds, a saved password itself.
@MainActor let signInWorld = WKContentWorld.world(name: "sleek")
let sharedSignInScript = """
(function(){ if(window.top !== window) return; var post = function(m){ try { webkit.messageHandlers.sleekPw.postMessage(m); } catch(e){} };
  function vis(e){ var r = e.getBoundingClientRect(), s = getComputedStyle(e); return r.width > 20 && r.height > 8 && s.visibility !== 'hidden' && s.display !== 'none' && !e.disabled && !e.readOnly; }
  function passes(root){ return [].filter.call((root && root.querySelectorAll ? root : document).querySelectorAll('input[type=password]'), vis); }
  function scope(el){ return el.form || (el.closest && el.closest('form, [role=form], [role=dialog], section, main')) || document.body; }
  function userFor(pw){
    var s = scope(pw), named = s.querySelector('input[autocomplete~=username], input[autocomplete~=email], input[type=email], input[name*=user i], input[name*=email i], input[name*=login i], input[id*=user i], input[id*=email i], input[id*=login i]');
    if(named && named.type !== 'password' && vis(named)) return named;
    var best = null; [].forEach.call(s.querySelectorAll('input'), function(i){ if(/^(text|email|tel|)$/.test(i.type) && vis(i) && (i.compareDocumentPosition(pw) & Node.DOCUMENT_POSITION_FOLLOWING)) best = i; });
    return best;
  }
  function fresh(pw){ return /new-password/.test(pw.getAttribute('autocomplete') || '') || passes(scope(pw)).length >= 2; }
  function rect(e){ var r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }
  var cur = null, last = '';
  document.addEventListener('focusin', function(e){
    var t = e.target; if(!t || t.tagName !== 'INPUT') return;
    var pw = null; if(t.type === 'password') pw = t; else { var ps = passes(scope(t)); if(ps.length && userFor(ps[0]) === t) pw = ps[0]; }
    if(!pw) return;
    cur = { user: userFor(pw), pass: pw, all: passes(scope(pw)) };
    post({ focus: rect(t), on: t === pw ? 'pass' : 'user', fresh: fresh(pw) });
  }, true);
  document.addEventListener('focusout', function(e){ if(cur && (e.target === cur.pass || e.target === cur.user)) setTimeout(function(){ var a = document.activeElement; if(!cur || (a !== cur.pass && a !== cur.user)) post({ blur: 1 }); }, 200); }, true);
  window.addEventListener('scroll', function(){ if(cur) post({ blur: 1, scrolled: 1 }); }, { passive: true, capture: true });
  function set(el, v){ if(!el) return; var d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value'); d.set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }
  window.__sleekFill = function(user, pass, both){
    if(!cur || !cur.pass.isConnected){ var ps = passes(); if(!ps.length) return false; cur = { user: userFor(ps[0]), pass: ps[0], all: passes(scope(ps[0])) }; }
    if(user && cur.user) set(cur.user, user);
    (both ? cur.all : [cur.pass]).forEach(function(p){ set(p, pass); });
    return true;
  };
  // what the page was sent when you signed in or signed up: once for each name and password
  function sent(from){
    var ps = passes(from).filter(function(p){ return p.value; }); if(!ps.length) return;
    var pw = ps[0], u = userFor(pw), k = (u ? u.value : '') + ' / ' + pw.value; if(k === last) return; last = k;
    post({ sent: { user: u ? u.value : '', pass: pw.value } });
  }
  document.addEventListener('submit', function(e){ sent(e.target); }, true);
  document.addEventListener('click', function(e){ var b = e.target.closest && e.target.closest('button, input[type=submit], [role=button]'); if(b && passes(scope(b)).length) sent(scope(b)); }, true);
  document.addEventListener('keydown', function(e){ if(e.key === 'Enter' && e.target && e.target.tagName === 'INPUT') sent(scope(e.target)); }, true);
})();
"""

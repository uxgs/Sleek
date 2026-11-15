// Passkeys, on the Mac and on the iPhone: Sleek is its own passkey keeper, so a site that offers "sign in with a
// passkey" works without a password and without Apple's say-so. (Using the passkeys in iCloud Keychain instead
// needs a permission Apple grants to browsers on request; until then, a passkey made in Sleek lives in Sleek.)
//
// How: a small script in every page stands in for the page's navigator.credentials. When a site asks to make a
// passkey or to sign in with one, the script hands the question to the app; the app asks you (and Touch ID or
// Face ID), and answers as a passkey keeper would. The page never sees a key. Which site is asking is taken from
// the engine (the frame's own origin), never from the page, and a site can only ever use the passkeys made for it.
//
// What is kept: for each passkey, the site it is for, the account name, and its private key (P-256), sealed in
// the same vault as the passwords (Vault.swift). The site keeps only the public half.
import Foundation
import CryptoKit
import WebKit

/// A passkey kept in the vault.
struct Passkey: Codable {
  var id: String            // the credential's id, base64url
  var rp: String            // the site it is for (its "relying party" name, e.g. github.com)
  var user: String          // the account name the site gave
  var display: String       // the name the site shows for it
  var handle: String        // the site's own id for the account, base64url
  var key: String           // the private key, base64 (P-256, raw)
  var url: String           // the page it was made on
  var added: Double
  var used: Double
}

/// A question from a site: make a passkey, or sign in with one.
struct KeyAsk {
  var ask: String           // the page's own number for the question
  var make: Bool            // make one (true) or sign in (false)
  var origin: String        // where the page is, as the engine says: https://host[:port]
  var rp: String            // the site the passkey is for
  var challenge: Data
  var user = "", display = "", handle = Data()
  var allow: [String] = []  // sign in: only these passkeys, when the site names any
  var exclude: [String] = []// make: the site has these already
  var conditional = false   // sign in: offered quietly beside the sign-in box rather than asked
  var credProps = false
}
struct KeyFail: Error { var name: String; var message: String; var reply: [String: Any] { ["error": name, "message": message] } }

enum Passkeys {
  // ---------- base64url ----------
  static func b64u(_ d: Data) -> String { d.base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "") }
  static func unb64u(_ s: String) -> Data? {
    var t = s.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/"); while t.count % 4 != 0 { t += "=" }
    return Data(base64Encoded: t)
  }

  // ---------- CBOR, as much of it as a passkey needs ----------
  indirect enum CBOR { case int(Int), bytes(Data), text(String), map([(CBOR, CBOR)]) }
  static func cbor(_ v: CBOR) -> Data {
    func head(_ major: UInt8, _ n: UInt64) -> Data {
      let m = major << 5
      switch n {
      case 0..<24: return Data([m | UInt8(n)])
      case 24..<256: return Data([m | 24, UInt8(n)])
      case 256..<65536: return Data([m | 25, UInt8(n >> 8), UInt8(n & 0xff)])
      default: return Data([m | 26, UInt8((n >> 24) & 0xff), UInt8((n >> 16) & 0xff), UInt8((n >> 8) & 0xff), UInt8(n & 0xff)])
      }
    }
    switch v {
    case .int(let i): return i >= 0 ? head(0, UInt64(i)) : head(1, UInt64(-1 - i))
    case .bytes(let d): return head(2, UInt64(d.count)) + d
    case .text(let s): let d = Data(s.utf8); return head(3, UInt64(d.count)) + d
    case .map(let kv): return kv.reduce(head(5, UInt64(kv.count))) { $0 + cbor($1.0) + cbor($1.1) }
    }
  }

  // ---------- which site may ask for what ----------
  /// The page's origin, as the engine reports it. Only https pages may use passkeys (and http://localhost, for trying things out).
  static func origin(_ o: WKSecurityOrigin) -> String? {
    let scheme = o.protocol.lowercased(), host = o.host.lowercased()
    guard !host.isEmpty, scheme == "https" || (scheme == "http" && (host == "localhost" || host.hasSuffix(".localhost"))) else { return nil }
    let usual = (scheme == "https" && o.port == 443) || (scheme == "http" && o.port == 80) || o.port == 0
    return scheme + "://" + host + (usual ? "" : ":\(o.port)")
  }
  /// May a page on `host` use passkeys for `rp`? Only for its own name or a name it sits under (accounts.example.com for
  /// example.com), and never for a name that belongs to no one in particular, like "com" or "co.uk".
  static func allowed(rp: String, host: String) -> Bool {
    let rp = rp.lowercased(), host = host.lowercased()
    guard !rp.isEmpty, host == rp || host.hasSuffix("." + rp) else { return false }
    if rp == "localhost" || rp.hasSuffix(".localhost") { return true }
    let parts = rp.split(separator: ".")
    guard parts.count >= 2, rp.range(of: "^[0-9.]+$", options: .regularExpression) == nil else { return false }      // a bare name, or a numeric address
    if parts.count == 2, parts[1].count == 2, ["co", "com", "net", "org", "ac", "gov", "edu", "ne", "or", "go"].contains(String(parts[0])) { return false }      // co.uk, com.au, ne.jp …
    if ["github.io", "gitlab.io", "pages.dev", "netlify.app", "vercel.app", "herokuapp.com", "web.app", "firebaseapp.com", "blogspot.com", "appspot.com", "azurewebsites.net", "cloudfront.net", "workers.dev", "glitch.me", "fly.dev"].contains(rp) { return false }
    return true
  }

  /// Read a question from a page. The site is checked here; nothing is asked of you yet.
  static func read(_ m: [String: Any], origin o: WKSecurityOrigin) -> Result<KeyAsk, KeyFail> {
    let notAllowed = KeyFail(name: "NotAllowedError", message: "The operation either timed out or was not allowed.")
    guard let origin = origin(o) else { return .failure(KeyFail(name: "SecurityError", message: "Passkeys need a secure (https) page.")) }
    guard let op = m["op"] as? String, op == "create" || op == "get", let pk = m["pk"] as? [String: Any],
          let challenge = (pk["challenge"] as? String).flatMap(unb64u), challenge.count >= 16 else { return .failure(notAllowed) }
    let host = o.host.lowercased(), make = op == "create"
    let given = make ? ((pk["rp"] as? [String: Any])?["id"] as? String) : (pk["rpId"] as? String)
    let rp = (given?.isEmpty == false ? given! : host).lowercased()
    guard allowed(rp: rp, host: host) else { return .failure(KeyFail(name: "SecurityError", message: "This page may not use passkeys for " + rp + ".")) }
    var a = KeyAsk(ask: m["ask"] as? String ?? "", make: make, origin: origin, rp: rp, challenge: challenge)
    if make {
      guard let u = pk["user"] as? [String: Any], let h = (u["id"] as? String).flatMap(unb64u), (1...64).contains(h.count) else { return .failure(KeyFail(name: "TypeError", message: "A passkey needs an account.")) }
      let algs = (pk["algs"] as? [Any] ?? []).compactMap { ($0 as? NSNumber)?.intValue }
      guard algs.isEmpty || algs.contains(-7) else { return .failure(KeyFail(name: "NotSupportedError", message: "Sleek makes passkeys of the ES256 kind only.")) }
      a.handle = h; a.user = u["name"] as? String ?? ""; a.display = u["displayName"] as? String ?? ""
      if a.user.isEmpty { a.user = a.display }
      a.exclude = pk["exclude"] as? [String] ?? []
      a.credProps = pk["credProps"] as? Bool ?? false
    } else {
      a.allow = pk["allow"] as? [String] ?? []
      a.conditional = m["conditional"] as? Bool ?? false
    }
    return .success(a)
  }

  // ---------- answering, once you have said yes ----------
  private static let aaguid = Data(count: 16)      // no make or model claimed (attestation "none")
  private static func clientData(_ type: String, _ a: KeyAsk) -> Data {
    Data(("{\"type\":\"" + type + "\",\"challenge\":\"" + b64u(a.challenge) + "\",\"origin\":\"" + a.origin + "\",\"crossOrigin\":false}").utf8)
  }
  private static func rpHash(_ rp: String) -> Data { Data(SHA256.hash(data: Data(rp.utf8))) }

  /// Make a passkey and keep it. The vault must be open (Touch ID said yes). Nil when it could not be kept.
  @MainActor static func make(_ a: KeyAsk, page: String) -> [String: Any]? {
    let key = P256.Signing.PrivateKey()
    var raw = [UInt8](repeating: 0, count: 16); guard SecRandomCopyBytes(kSecRandomDefault, 16, &raw) == errSecSuccess else { return nil }
    let cred = Data(raw), xy = key.publicKey.rawRepresentation
    let cose = cbor(.map([(.int(1), .int(2)), (.int(3), .int(-7)), (.int(-1), .int(1)), (.int(-2), .bytes(xy.prefix(32))), (.int(-3), .bytes(xy.suffix(32)))]))
    var auth = rpHash(a.rp); auth.append(0x45); auth.append(contentsOf: [0, 0, 0, 0])      // user present, user verified, a new key follows; no counter
    auth.append(aaguid); auth.append(contentsOf: [UInt8(cred.count >> 8), UInt8(cred.count & 0xff)]); auth.append(cred); auth.append(cose)
    let att = cbor(.map([(.text("fmt"), .text("none")), (.text("attStmt"), .map([])), (.text("authData"), .bytes(auth))]))
    let now = Date().timeIntervalSince1970
    let p = Passkey(id: b64u(cred), rp: a.rp, user: a.user, display: a.display, handle: b64u(a.handle), key: key.rawRepresentation.base64EncodedString(), url: page, added: now, used: now)
    guard Vault.shared.keepPasskey(p) else { return nil }
    return ["id": p.id, "clientDataJSON": b64u(clientData("webauthn.create", a)), "attestationObject": b64u(att), "authenticatorData": b64u(auth),
            "publicKey": b64u(key.publicKey.derRepresentation), "alg": -7, "transports": ["internal"], "credProps": a.credProps]
  }
  /// Sign in with a kept passkey. The vault must be open. Nil when that passkey is not there, or not for this site.
  @MainActor static func sign(_ a: KeyAsk, with id: String) -> [String: Any]? {
    guard let p = Vault.shared.passkey(id), p.rp == a.rp, a.allow.isEmpty || a.allow.contains(p.id),
          let kd = Data(base64Encoded: p.key), let key = try? P256.Signing.PrivateKey(rawRepresentation: kd) else { return nil }
    var auth = rpHash(a.rp); auth.append(0x05); auth.append(contentsOf: [0, 0, 0, 0])      // user present, user verified
    let cd = clientData("webauthn.get", a)
    guard let sig = try? key.signature(for: auth + Data(SHA256.hash(data: cd))) else { return nil }
    return ["id": p.id, "clientDataJSON": b64u(cd), "authenticatorData": b64u(auth), "signature": b64u(sig.derRepresentation), "userHandle": p.handle]
  }
  /// The passkeys a question may use: for its site, and among the ones it named, if it named any. (Names only; no keys.)
  @MainActor static func choices(_ a: KeyAsk) -> [[String: String]] { Vault.shared.passkeys(for: a.rp).filter { a.allow.isEmpty || a.allow.contains($0["id"] ?? "") } }
  /// Does the site have one of these already (make, with "the site has these")?
  @MainActor static func hasOne(_ a: KeyAsk) -> Bool { !a.exclude.isEmpty && Vault.shared.passkeys(for: a.rp).contains { a.exclude.contains($0["id"] ?? "") } }

  // ---------- the page's side ----------
  /// Stands in for navigator.credentials in every page (the main frame). It holds no keys and decides nothing: it turns
  /// the page's question into words the app can read, and the app's answer into what the page expects.
  static let script = """
  (function(){ if(window.top !== window || !navigator.credentials) return;
    var h; try { h = webkit.messageHandlers.sleekKey; } catch(e){} if(!h) return;
    var C = navigator.credentials, oc = C.create, og = C.get;
    function u8(x){ if(x instanceof ArrayBuffer) return new Uint8Array(x); if(x && ArrayBuffer.isView(x)) return new Uint8Array(x.buffer, x.byteOffset, x.byteLength); return new Uint8Array(0); }
    function enc(x){ var b = u8(x), s = ''; for(var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return btoa(s).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, ''); }
    function dec(s){ s = String(s || '').replace(/-/g, '+').replace(/_/g, '/'); while(s.length % 4) s += '='; var t = atob(s), b = new Uint8Array(t.length); for(var i = 0; i < t.length; i++) b[i] = t.charCodeAt(i); return b.buffer; }
    function proto(n){ var c = window[n]; return c && c.prototype ? c.prototype : Object.prototype; }
    function val(o, k, v){ Object.defineProperty(o, k, { value: v, enumerable: true }); }
    function fn(o, k, f){ Object.defineProperty(o, k, { value: f, enumerable: false }); }
    function answer(r, make){
      var res = Object.create(proto(make ? 'AuthenticatorAttestationResponse' : 'AuthenticatorAssertionResponse')), ad = dec(r.authenticatorData);
      val(res, 'clientDataJSON', dec(r.clientDataJSON));
      if(make){ var pk = dec(r.publicKey); val(res, 'attestationObject', dec(r.attestationObject));
        fn(res, 'getTransports', function(){ return r.transports.slice(); }); fn(res, 'getAuthenticatorData', function(){ return ad.slice(0); });
        fn(res, 'getPublicKey', function(){ return pk.slice(0); }); fn(res, 'getPublicKeyAlgorithm', function(){ return r.alg; }); }
      else { val(res, 'authenticatorData', ad); val(res, 'signature', dec(r.signature)); val(res, 'userHandle', r.userHandle ? dec(r.userHandle) : null); }
      var c = Object.create(proto('PublicKeyCredential')), ext = r.credProps ? { credProps: { rk: true } } : {};
      val(c, 'id', r.id); val(c, 'rawId', dec(r.id)); val(c, 'type', 'public-key'); val(c, 'response', res); val(c, 'authenticatorAttachment', 'platform');
      fn(c, 'getClientExtensionResults', function(){ return JSON.parse(JSON.stringify(ext)); });
      fn(c, 'toJSON', function(){ var o = { id: r.id, rawId: r.id, type: 'public-key', authenticatorAttachment: 'platform', clientExtensionResults: JSON.parse(JSON.stringify(ext)), response: { clientDataJSON: r.clientDataJSON, authenticatorData: r.authenticatorData } };
        if(make){ o.response.attestationObject = r.attestationObject; o.response.transports = r.transports.slice(); o.response.publicKey = r.publicKey; o.response.publicKeyAlgorithm = r.alg; }
        else { o.response.signature = r.signature; o.response.userHandle = r.userHandle || null; }
        return o; });
      return c;
    }
    function words(pk, make){
      var o = { challenge: enc(pk.challenge) };
      if(make){ o.rp = pk.rp ? { id: pk.rp.id, name: pk.rp.name } : {}; o.user = pk.user ? { id: enc(pk.user.id), name: pk.user.name, displayName: pk.user.displayName } : null;
        o.algs = (pk.pubKeyCredParams || []).map(function(p){ return p.alg; }); o.exclude = (pk.excludeCredentials || []).map(function(c){ return enc(c.id); });
        o.credProps = !!(pk.extensions && pk.extensions.credProps); }
      else { o.rpId = pk.rpId; o.allow = (pk.allowCredentials || []).map(function(c){ return enc(c.id); }); }
      return o;
    }
    var n = 0;
    function ask(make, o){
      var pk = o.publicKey, sig = o.signal, id = 'k' + (++n) + Math.random().toString(36).slice(2, 8);
      var why = function(){ return sig && sig.reason !== undefined ? sig.reason : new DOMException('The operation was aborted.', 'AbortError'); };
      if(sig && sig.aborted) return Promise.reject(why());
      var w; try { w = words(pk, make); } catch(e){ return Promise.reject(new TypeError('Those passkey options could not be read.')); }
      return new Promise(function(ok, no){
        var done = false;
        if(sig) sig.addEventListener('abort', function(){ if(done) return; done = true; h.postMessage({ op: 'abort', ask: id }).catch(function(){}); no(why()); });
        h.postMessage({ op: make ? 'create' : 'get', ask: id, conditional: o.mediation === 'conditional', pk: w }).then(function(r){
          if(done) return; done = true;
          if(!r || r.error){ var e = r || {}; no(e.error === 'TypeError' ? new TypeError(e.message) : new DOMException(e.message || 'The operation either timed out or was not allowed.', e.error || 'NotAllowedError')); }
          else ok(answer(r, make));
        }, function(){ if(!done){ done = true; no(new DOMException('The operation either timed out or was not allowed.', 'NotAllowedError')); } });
      });
    }
    var cross = function(o){ var s = o.publicKey.authenticatorSelection; return s && s.authenticatorAttachment === 'cross-platform'; };
    C.create = function(o){ return o && o.publicKey && !cross(o) ? ask(true, o) : oc.apply(C, arguments); };
    C.get = function(o){ return o && o.publicKey ? ask(false, o) : og.apply(C, arguments); };
    var P = window.PublicKeyCredential;
    if(P){ var yes = function(){ return Promise.resolve(true); };
      try { P.isUserVerifyingPlatformAuthenticatorAvailable = yes; P.isConditionalMediationAvailable = yes;
        P.getClientCapabilities = function(){ return Promise.resolve({ conditionalCreate: false, conditionalGet: true, hybridTransport: false, passkeyPlatformAuthenticator: true, userVerifyingPlatformAuthenticator: true, relatedOrigins: false, signalAllAcceptedCredentials: false, signalCurrentUserDetails: false, signalUnknownCredential: false, extensions: ['credProps'] }); };
      } catch(e){}
    }
  })();
  """
}

/// Where a page's passkey questions arrive. Each app says what to do with them (ask you, then answer); the bridge
/// makes sure every question gets exactly one answer, and that a page that went away gets "not allowed".
@MainActor
final class KeyBridge: NSObject, WKScriptMessageHandlerWithReply {
  /// A question, already checked. The app asks you, then calls `answer` once: with the reply, or with nil for "not allowed".
  var onAsk: ((KeyAsk) -> Void)?
  /// The page took a question back (or went away): the app stops asking.
  var onDrop: ((String) -> Void)?
  private var waiting: [String: (Any?, String?) -> Void] = [:]
  private(set) var open: [String: KeyAsk] = [:]

  func userContentController(_ c: WKUserContentController, didReceive message: WKScriptMessage, replyHandler: @escaping (Any?, String?) -> Void) {
    guard message.frameInfo.isMainFrame, let m = message.body as? [String: Any] else { replyHandler(KeyFail(name: "NotAllowedError", message: "Not here.").reply, nil); return }
    if m["op"] as? String == "abort" { drop(m["ask"] as? String ?? ""); replyHandler(nil, nil); return }
    switch Passkeys.read(m, origin: message.frameInfo.securityOrigin) {
    case .failure(let f): replyHandler(f.reply, nil)
    case .success(let a):
      guard !a.ask.isEmpty, waiting[a.ask] == nil else { replyHandler(KeyFail(name: "NotAllowedError", message: "Not allowed.").reply, nil); return }
      if a.make || !a.conditional { for (k, other) in open where other.make || !other.conditional { answer(k, nil) } }      // one question at a time: a new one replaces the last
      waiting[a.ask] = replyHandler; open[a.ask] = a
      onAsk?(a)
    }
  }
  /// Give a question its answer (nil: not allowed). Does nothing when it was answered already.
  func answer(_ ask: String, _ reply: [String: Any]?, fail: KeyFail? = nil) {
    guard let r = waiting.removeValue(forKey: ask) else { return }
    open[ask] = nil
    r(reply ?? (fail ?? KeyFail(name: "NotAllowedError", message: "The operation either timed out or was not allowed.")).reply, nil)
  }
  private func drop(_ ask: String) { guard waiting[ask] != nil else { return }; answer(ask, nil); onDrop?(ask) }
  /// The page is going away (a new page, or the tab closed): every open question is answered "not allowed".
  func dropAll() { for k in Array(waiting.keys) { drop(k) } }
  /// The quiet sign-in question waiting beside the sign-in box, if the page has one.
  var quiet: KeyAsk? { open.values.first { !$0.make && $0.conditional } }
}

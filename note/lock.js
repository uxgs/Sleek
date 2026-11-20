/* Sleeky Notes' lock: a locked note's text is scrambled, and only your passcode, or this device's
   fingerprint or face, can make it readable again.

   How it works. The first time you lock a note, a key is made at random (the vault's key). Each
   locked note's text is scrambled with that key (AES-GCM, a fresh iv each time). The key itself is
   never stored as it is. It is kept scrambled twice over, in the vault (core/note-store.js):
     pass   by a key worked out from your passcode (PBKDF2, SHA-256, 310,000 rounds, a random salt)
     bio    by a secret only this device's passkey can produce, after Touch ID, Face ID or the like
            (WebAuthn's "prf" extension). A browser that cannot do that just uses the passcode.
   So what is on disk is useless without one of the two, and there is no way round a forgotten
   passcode: nothing here, and nobody else, has the key.

   The key is handed to the app (note/app.js) only while a locked note is open, and dropped when you
   leave it. A note's title, icon, tags and folder are not scrambled: that is how you find it. */
(function(){
  var N = window.SleekNotes, enc = new TextEncoder(), dec = new TextDecoder(), ITER = 310000;
  function b64(buf){ var s = '', a = new Uint8Array(buf); for(var i = 0; i < a.length; i++) s += String.fromCharCode(a[i]); return btoa(s); }
  function un64(s){ var b = atob(s), a = new Uint8Array(b.length); for(var i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; }
  function b64url(buf){ return b64(buf).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function rand(n){ return crypto.getRandomValues(new Uint8Array(n)); }
  var AES = { name: 'AES-GCM', length: 256 };

  function passKey(pass, salt, iter){
    return crypto.subtle.importKey('raw', enc.encode(String(pass).normalize('NFKC')), 'PBKDF2', false, ['deriveKey'])
      .then(function(base){ return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: salt, iterations: iter, hash: 'SHA-256' }, base, AES, false, ['encrypt', 'decrypt']); });
  }
  function secretKey(secret){
    return crypto.subtle.importKey('raw', secret, 'HKDF', false, ['deriveKey'])
      .then(function(base){ return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: enc.encode('sleek-notes lock') }, base, AES, false, ['encrypt', 'decrypt']); });
  }
  function wrap(kek, raw){ var iv = rand(12); return crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, kek, raw).then(function(ct){ return { iv: b64(iv), ct: b64(ct) }; }); }
  function unwrap(kek, w){ return crypto.subtle.decrypt({ name: 'AES-GCM', iv: un64(w.iv) }, kek, un64(w.ct)).then(function(raw){ return new Uint8Array(raw); }); }   // fails when the key is the wrong one
  function noteKey(raw){ return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']); }

  /** The lock new notes are locked with: the one made here, else the oldest one that came in from another copy of your
      notes (the Sleek apps on one iPhone share one lock, and so one passcode). */
  function home(){
    var all = N.vaults(), list = Object.keys(all).map(function(id){ return all[id]; }).sort(function(a, b){ return (a.made || 0) - (b.made || 0); });
    return list.filter(function(v){ return v.home; })[0] || list[0] || null;
  }
  /** Make the lock: a new key, kept scrambled by this passcode. Gives { vault, raw }: raw is the key itself, for now. */
  function setup(pass){
    var raw = rand(32), salt = rand(16);
    return passKey(pass, salt, ITER).then(function(kek){ return wrap(kek, raw); }).then(function(w){
      var v = N.setVault({ id: N.uid(), home: true, made: Date.now(), salt: b64(salt), iter: ITER, pass: w, bio: [] });
      return { vault: v, raw: raw };
    });
  }
  /** The key, from the passcode; null when the passcode is not the one. */
  function withPass(v, pass){ return passKey(pass, un64(v.salt), v.iter).then(function(kek){ return unwrap(kek, v.pass); }).then(function(raw){ return raw; }, function(){ return null; }); }

  // ---------- this device's fingerprint or face ----------
  // Inside Sleeky Notes for iPhone the app itself keeps the key, in the iPhone's keychain behind Face ID or Touch ID
  // (ios-notes/Sources/Notes.swift), and hands it over when you unlock. The page asks it through `sleekLock`.
  var native = null, nativeName = '';
  try { native = (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.sleekLock) || null; } catch(e){ native = null; }
  function app(msg){ return native.postMessage(msg); }
  /** Whether this browser, on this device, can ask for a fingerprint or a face at all. */
  function canBio(){
    if(native) return app({ do: 'can' }).then(function(r){ nativeName = (r && r.name) || ''; return !!(r && r.can); }, function(){ return false; });
    if(!window.PublicKeyCredential || !navigator.credentials || !window.isSecureContext || !PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable) return Promise.resolve(false);
    return PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable().then(function(ok){ return !!ok; }, function(){ return false; });
  }
  /** What to call it on this device. */
  function bioName(){
    if(native && nativeName) return nativeName;
    var ua = navigator.userAgent || '', touch = navigator.maxTouchPoints > 1;
    if(/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && touch)) return 'Face ID';
    if(/Macintosh/.test(ua)) return 'Touch ID';
    if(/Windows/.test(ua)) return 'Windows Hello';
    if(/Android/.test(ua)) return 'your fingerprint';
    return 'this device';
  }
  function ask(entries){
    var by = {}; entries.forEach(function(e){ by[b64url(un64(e.id))] = { first: un64(e.salt) }; });
    return navigator.credentials.get({ publicKey: { challenge: rand(32), allowCredentials: entries.map(function(e){ return { type: 'public-key', id: un64(e.id) }; }), userVerification: 'required', extensions: { prf: { evalByCredential: by } } } })
      .then(function(a){
        var r = (a.getClientExtensionResults().prf || {}).results;
        if(!r || !r.first) throw new Error('no-prf');
        return { secret: r.first, id: b64(a.rawId) };
      });
  }
  /** Let this device's fingerprint or face open the lock too. Fails with 'no-prf' where the browser cannot keep a secret behind it. */
  function addBio(v, raw){
    if(native) return app({ do: 'keep', id: v.id, key: b64(raw) }).then(function(r){ if(!r || !r.ok) throw new Error('no-bio'); v.bio = [{ native: true }]; N.setVault(v); return v; });
    var salt = rand(32);
    return navigator.credentials.create({ publicKey: {
      rp: { name: 'Sleeky Notes' }, user: { id: rand(16), name: 'Sleeky Notes lock', displayName: 'Sleeky Notes lock' }, challenge: rand(32),
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
      extensions: { prf: { eval: { first: salt } } } } })
    .then(function(cred){
      var ext = cred.getClientExtensionResults().prf || {}, entry = { id: b64(cred.rawId), salt: b64(salt) };
      if(!ext.enabled && !(ext.results && ext.results.first)) throw new Error('no-prf');
      // some browsers hand over the secret only when the passkey is used, not when it is made
      return (ext.results && ext.results.first ? Promise.resolve(ext.results.first) : ask([entry]).then(function(g){ return g.secret; }))
        .then(secretKey).then(function(kek){ return wrap(kek, raw); })
        .then(function(w){ entry.iv = w.iv; entry.ct = w.ct; v.bio = (v.bio || []).concat([entry]); N.setVault(v); return v; });
    });
  }
  /** The key, from this device's fingerprint or face. Fails when it is refused, cancelled or not possible. */
  function withBio(v){
    if(native) return app({ do: 'key', id: v.id }).then(function(r){ if(!r || !r.key) throw new Error(r && r.missing ? 'missing' : 'refused'); return un64(r.key); });
    return ask(v.bio || []).then(function(g){
      var e = (v.bio || []).filter(function(x){ return x.id === g.id; })[0] || v.bio[0];
      return secretKey(g.secret).then(function(kek){ return unwrap(kek, e); });
    });
  }

  // ---------- a note's text ----------
  function seal(v, raw, text){
    var iv = rand(12);
    return noteKey(raw).then(function(k){ return crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, k, enc.encode(String(text || ''))); }).then(function(ct){ return { v: v.id, iv: b64(iv), ct: b64(ct) }; });
  }
  function unseal(raw, sealed){ return noteKey(raw).then(function(k){ return crypto.subtle.decrypt({ name: 'AES-GCM', iv: un64(sealed.iv) }, k, un64(sealed.ct)); }).then(function(b){ return dec.decode(b); }); }

  window.SleekVault = { home: home, setup: setup, withPass: withPass, canBio: canBio, bioName: bioName, addBio: addBio, withBio: withBio, seal: seal, unseal: unseal, can: !!(window.crypto && crypto.subtle), native: !!native };
})();

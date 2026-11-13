/* Publish: a deck as one HTML file anyone can open in a browser, with nothing to install.

   The file carries the deck, its pictures and videos, the layouts it uses and the player's own
   styles and scripts, all inline. It plays, presents (with the presenter window) and shows every
   feature; it doesn't edit. Built from this page's own files, so it needs a page served over
   http(s) or one where the browser allows reading them. */
(function(){
  var CSS = ['styles.css', 'glow.css', 'features/features.css', 'features/add-slide.css', 'features/before-picker.css', 'features/fit.css', 'features/collage.css', 'features/floats.css', 'features/data.css'];
  var JS = ['features/collage-layout.js', 'features/data-layout.js', 'app.js', 'glow-fx.js', 'features/disassemble.js', 'features/press.js', 'features/mobile.js', 'features/fit.js', 'features/collage.js', 'features/floats.js', 'features/data-slides.js'];
  var HEAD_JS = ['theme-boot.js'];

  function text(u){ return fetch(u, { cache: 'no-cache' }).then(function(r){ if(!r.ok) throw new Error(u + ': ' + r.status); return r.text(); }); }
  function dataUrl(u){
    return fetch(u).then(function(r){ return r.ok ? r.blob() : null; }).then(function(b){
      if(!b) return null;
      return new Promise(function(res){ var fr = new FileReader(); fr.onload = function(){ res(fr.result); }; fr.onerror = function(){ res(null); }; fr.readAsDataURL(b); });
    }, function(){ return null; });
  }
  // a script or JSON inside <script>: nothing in it may close the tag
  function safe(s){ return String(s).replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--'); }
  function slugFile(t){ return (String(t || 'deck').trim().replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ') || 'deck'); }

  function build(id){
    var S = window.SleekStore;
    return S.get(id).then(function(deck){
      if(!deck) throw new Error('No such deck.');
      return Promise.all([
        S.inline(deck.seed, true), text('deck.html'),
        Promise.all(CSS.map(text)), Promise.all(JS.map(text)), Promise.all(HEAD_JS.map(text))
      ]).then(function(r){
        var seed = r[0], html = r[1], css = r[2], js = r[3], headJs = r[4];
        var doc = new DOMParser().parseFromString(html, 'text/html');
        // only the layouts this deck uses
        var used = {}; (seed.added || []).forEach(function(a){ used[a.t] = true; });
        var lib = doc.getElementById('layouts');
        if(lib) Array.prototype.slice.call(lib.content.children).forEach(function(s){ if(s.getAttribute && !used[s.getAttribute('data-note')]) s.remove(); });
        // the head: the deck, then its theme, then the styles; no loader, no storage
        Array.prototype.forEach.call(doc.querySelectorAll('head script, body > script'), function(s){ s.remove(); });
        // it isn't the app: no install, no app icons
        Array.prototype.forEach.call(doc.querySelectorAll('link[rel="manifest"], link[rel~="icon"], link[rel="apple-touch-icon"], meta[name^="apple-mobile"]'), function(l){ l.remove(); });
        Array.prototype.forEach.call(doc.querySelectorAll('link[rel="stylesheet"]'), function(l){
          var href = l.getAttribute('href') || '', k = CSS.indexOf(href);
          if(k < 0){ if(!/^https?:/.test(href)) l.remove(); return; }   // the editor's own styles stay behind
          var st = doc.createElement('style'); st.textContent = css[k]; l.replaceWith(st);
        });
        var pubId = 'p' + deck.id;
        var boot = doc.createElement('script');
        boot.textContent = safe('window.SEED = ' + JSON.stringify(seed) + ';\nwindow.SLEEK_DECK = ' + JSON.stringify({ id: pubId, title: deck.title, published: true }) +
          ';\nwindow.SLEEK_NS = ' + JSON.stringify('pub:' + pubId + ':') + ';\ndocument.documentElement.classList.add("published");');
        doc.head.appendChild(boot);
        headJs.forEach(function(src){ var s = doc.createElement('script'); s.textContent = safe(src); doc.head.appendChild(s); });
        doc.title = deck.title;
        var out = '<!doctype html>\n' + doc.documentElement.outerHTML;
        // the scripts go in as text (so nothing in them is parsed as markup), after the page
        out = out.replace(/<\/body>\s*<\/html>\s*$/i, '');
        js.forEach(function(src){ out += '<script>\n' + safe(src) + '\n</script>\n'; });
        out += '</body>\n</html>\n';
        // every file the page points at goes inside it
        var paths = {};
        out.replace(/(?:assets|images)\/[A-Za-z0-9_\/.-]+\.(?:svg|png|jpe?g|webp|gif|mp4|webm|mov)/g, function(p){ paths[p] = true; return p; });
        var list = Object.keys(paths);
        return Promise.all(list.map(dataUrl)).then(function(urls){
          list.forEach(function(p, k){ if(urls[k]) out = out.split(p).join(urls[k]); });
          return { html: out, name: slugFile(deck.title) + '.html' };
        });
      });
    });
  }
  function download(name, content, type){
    var blob = content instanceof Blob ? content : new Blob([content], { type: type || 'text/html' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  }
  function publish(id){ return build(id).then(function(r){ download(r.name, r.html, 'text/html'); return r; }); }
  // the .sleek file. A deck with speaker notes asks first whether they go in (opts.notes skips the question);
  // resolves the file's name, or null when the question was closed
  function exportFile(id, opts){
    var S = window.SleekStore;
    return S.get(id).then(function(d){
      var keep = opts && typeof opts.notes === 'boolean' ? opts.notes : S.hasNotes(d && d.seed) ? askNotes('save', d && d.title) : true;
      return Promise.resolve(keep).then(function(k){
        if(k == null) return null;
        return S.exportDeck(id, { notes: k }).then(function(text){
          var name = slugFile(d && d.title) + '.sleek';
          download(name, text, 'application/json'); return name;
        });
      });
    });
  }

  // ---------- the speaker-notes question (saving or opening a .sleek file) ----------
  // resolves true (include them), false (leave them out) or null (closed: don't go on)
  var NC_CSS = '' +
    '.nc-back{position:fixed;inset:0;z-index:90;display:grid;place-items:center;padding:16px;background:rgba(0,0,0,.5);' +
      '-webkit-backdrop-filter:blur(16px) saturate(140%);backdrop-filter:blur(16px) saturate(140%);opacity:0;transition:opacity .3s ease;' +
      'font-family:"Inter",-apple-system,BlinkMacSystemFont,system-ui,sans-serif;color:#F2F2F4}' +
    '.nc-back.in{opacity:1}' +
    '.nc-box{position:relative;width:min(460px,100%);padding:28px 28px 24px;border-radius:24px;background:rgba(22,22,26,.96);' +
      'border:1px solid rgba(255,255,255,.12);box-shadow:0 50px 120px -40px rgba(0,0,0,.85),inset 0 1px 0 rgba(255,255,255,.06);' +
      'transform:scale(.92) translateY(8px);opacity:0;transition:transform .5s cubic-bezier(.16,1,.3,1),opacity .25s ease}' +
    '.nc-back.in .nc-box{transform:none;opacity:1}' +
    '.nc-back.out .nc-box{transform:scale(.96) translateY(6px);opacity:0;transition-duration:.22s}' +
    '.nc-k{font-size:12px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:var(--accent,#0A84FF)}' +
    '.nc-h{margin:8px 0 8px;font-size:24px;line-height:1.12;letter-spacing:-.025em;font-weight:650;text-wrap:balance}' +
    '.nc-p{margin:0;color:#A1A1A6;font-size:14.5px;line-height:1.5}' +
    '.nc-acts{display:flex;gap:10px;flex-wrap:wrap;margin-top:22px}' +
    '.nc-btn{display:inline-flex;align-items:center;height:38px;padding:0 18px;border-radius:999px;border:0;cursor:pointer;' +
      'font-family:inherit;font-weight:600;font-size:13.5px;line-height:1;transition:background .2s ease,transform .2s ease,filter .2s ease}' +
    '.nc-btn.yes{background:var(--accent,#0A84FF);color:#fff}.nc-btn.yes:hover{transform:translateY(-1px);filter:brightness(1.08)}' +
    '.nc-btn.no{background:rgba(255,255,255,.07);color:#E5E5EA;box-shadow:inset 0 0 0 1px rgba(255,255,255,.14)}.nc-btn.no:hover{background:rgba(255,255,255,.13)}' +
    '.nc-btn:focus-visible,.nc-x:focus-visible{outline:2px solid #fff;outline-offset:2px}' +
    '.nc-x{position:absolute;top:16px;right:16px;width:32px;height:32px;border-radius:50%;border:0;cursor:pointer;display:grid;place-items:center;' +
      'background:rgba(255,255,255,.06);color:#C7C7CE;font-size:20px;line-height:1;font-family:inherit}.nc-x:hover{background:rgba(255,255,255,.14);color:#fff}' +
    '@media (max-width:420px){.nc-box{padding:24px 20px 20px}.nc-acts{flex-direction:column}.nc-btn{justify-content:center}}' +
    '@media (prefers-reduced-motion:reduce){.nc-back,.nc-box{transition:none}}';
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"]/g, function(ch){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]; }); }
  function askNotes(mode, title){
    return new Promise(function(resolve){
      if(!document.getElementById('nc-css')){ var st = document.createElement('style'); st.id = 'nc-css'; st.textContent = NC_CSS; document.head.appendChild(st); }
      var saving = mode === 'save', prev = document.activeElement, D = window.Deck;
      var el = document.createElement('div');
      el.className = 'nc-back';
      el.innerHTML = '<div class="nc-box" role="dialog" aria-modal="true" aria-labelledby="nc-h">' +
        '<button type="button" class="nc-x" data-v="x" aria-label="' + (saving ? 'Don’t save the file' : 'Don’t open the file') + '">×</button>' +
        '<div class="nc-k">' + (saving ? 'Saving' : 'Opening') + (title ? ' · ' + esc(title) : '') + '</div>' +
        '<h2 class="nc-h" id="nc-h">' + (saving ? 'Put your speaker notes in the file?' : 'This deck has speaker notes. Keep them?') + '</h2>' +
        '<p class="nc-p">' + (saving
          ? 'Leave them out to send the file to someone without your notes. The deck here keeps them either way.'
          : 'Leave them out and the deck opens here without them. The file itself stays as it is.') + '</p>' +
        '<div class="nc-acts"><button type="button" class="nc-btn yes" data-v="yes">Include notes</button>' +
        '<button type="button" class="nc-btn no" data-v="no">Leave them out</button></div></div>';
      document.body.appendChild(el);
      if(D) D.modal = true;
      function done(v){
        if(!el) return;
        var node = el; el = null;
        document.removeEventListener('keydown', onKey, true);
        if(D) D.modal = false;
        node.classList.remove('in'); node.classList.add('out');
        setTimeout(function(){ node.remove(); }, 300);
        if(prev && prev.focus) prev.focus({ preventScroll: true });
        resolve(v);
      }
      function onKey(e){
        if(e.key === 'Escape'){ e.preventDefault(); e.stopImmediatePropagation(); done(null); return; }
        if(e.key === 'Tab'){   // focus stays in the box
          var bs = el.querySelectorAll('button'), a = bs[0], z = bs[bs.length - 1];
          if(e.shiftKey && document.activeElement === a){ e.preventDefault(); z.focus(); }
          else if(!e.shiftKey && document.activeElement === z){ e.preventDefault(); a.focus(); }
          return;
        }
        if(!/^(Enter| )$/.test(e.key)) e.stopImmediatePropagation();   // the deck underneath stays put
      }
      document.addEventListener('keydown', onKey, true);
      el.addEventListener('click', function(e){
        if(e.target === el){ done(null); return; }
        var b = e.target.closest('[data-v]'); if(!b) return;
        var v = b.getAttribute('data-v'); done(v === 'yes' ? true : v === 'no' ? false : null);
      });
      requestAnimationFrame(function(){ requestAnimationFrame(function(){ if(!el) return; el.classList.add('in'); el.querySelector('.nc-btn.yes').focus({ preventScroll: true }); }); });
    });
  }

  window.SleekPublish = { build: build, publish: publish, exportFile: exportFile, askNotes: askNotes, download: download, slugFile: slugFile };
})();

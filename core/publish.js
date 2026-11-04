/* Publish: a deck as one HTML file anyone can open in a browser, with nothing to install.

   The file carries the deck, its pictures and videos, the layouts it uses and the player's own
   styles and scripts, all inline. It plays, presents (with the presenter window) and shows every
   feature; it doesn't edit. Built from this page's own files, so it needs a page served over
   http(s) or one where the browser allows reading them. */
(function(){
  var CSS = ['styles.css', 'glow.css', 'features/features.css', 'features/add-slide.css', 'features/before-picker.css'];
  var JS = ['app.js', 'glow-fx.js', 'features/disassemble.js', 'features/press.js', 'features/mobile.js'];
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
  function exportFile(id){
    return Promise.all([window.SleekStore.get(id), window.SleekStore.exportDeck(id)]).then(function(r){
      var name = slugFile(r[0] && r[0].title) + '.sleek';
      download(name, r[1], 'application/json'); return name;
    });
  }

  window.SleekPublish = { build: build, publish: publish, exportFile: exportFile, download: download, slugFile: slugFile };
})();

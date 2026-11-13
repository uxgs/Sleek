/* Publish as a web page (Share): the page as one .html file anyone can open, with nothing to install.

   The file holds the page as plain HTML (made from the document by the page's own rules, so it
   reads, prints and can be searched even with scripts off), its pictures inside it, the page's look
   (doc/doc.css), and a small reader (doc/reader.css, doc/reader.js): an outline, a progress bar,
   light or dark, and the arrows on collapsible headings. A page with a chart or a before-and-after
   also gets the few scripts those need (doc/data.js with features/data-layout.js; doc/compare.js),
   and nothing it doesn't use. There is no editor in it.

   With "See who's reading" switched on (core/online.js; off unless you switch it on), the file also
   carries the public code and the few lines that report in (features/viewers-beacon.js), exactly as
   a published deck does. For a page, "which slide" is "which block": every top-level block is a
   stop, numbered from 0 (and grouped evenly if a page has more than 499). What is kept on the
   page's record beside the two codes: `slides`, a name for each stop (the heading it is under), and
   `stops`, the id of the block each stop starts at, so readers can be placed on the page as it is
   now (doc/viewers.js). */
(function(){
  var PM = window.SleekPM, K = window.SleekDocKit, A = window.SleekDoc, D = window.SleekDocs, S = window.SleekStore, O = window.SleekOnline;
  if(!A || !K) return;
  var N = K.N, MAX_STOPS = 499;
  function esc(s){ return String(s).replace(/[&<>"]/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function text(url){ return fetch(url).then(function(r){ if(!r.ok) throw new Error('Could not load ' + url); return r.text(); }); }
  function inScript(js){ return js.replace(/<\/script/gi, '<\\/script'); }

  // the stops of a document: for each, the id of its first block and the heading it sits under
  function stopsOf(doc){
    var n = doc.childCount, step = Math.max(1, Math.ceil(n / MAX_STOPS)), ids = [], names = [], under = 'Top', i = 0;
    doc.forEach(function(b){
      if(b.type === N.cover) under = 'Cover'; else if(b.type === N.heading && b.textContent.trim()) under = b.textContent.trim().slice(0, 80);
      if(i % step === 0){ ids.push(b.attrs.id || ''); names.push(under); }
      i++;
    });
    return { step: step, ids: ids, names: names };
  }
  // the document as the HTML a reader gets
  function body(doc){
    var box = document.createElement('div'), step = Math.max(1, Math.ceil(doc.childCount / MAX_STOPS));
    box.appendChild(PM.model.DOMSerializer.fromSchema(K.schema).serializeFragment(doc.content));
    Array.prototype.forEach.call(box.children, function(el, i){ el.setAttribute('data-stop', Math.floor(i / step)); if(/^H[1-3]$/.test(el.tagName)) el.id = 'h' + i; });
    // a cover's empty lines, and empty captions, are left out
    Array.prototype.forEach.call(box.querySelectorAll('.dk-cover > p, figcaption'), function(p){ if(!p.textContent.trim()) p.remove(); });
    Array.prototype.forEach.call(box.querySelectorAll('.dk-fig img'), function(i){ i.setAttribute('loading', 'lazy'); i.setAttribute('decoding', 'async'); });
    // charts and numbers are drawn into the file, finished, so they are there with scripts off (doc/data.js plays them when they can)
    Array.prototype.forEach.call(box.querySelectorAll('.dk-data'), function(el){
      var host = el.querySelector('.ds-host'), kind = el.getAttribute('data-kind') === 'results' ? 'results' : 'chart', ds = null;
      try { ds = JSON.parse(el.getAttribute('data-json') || 'null'); } catch(e){}
      if(host && window.SleekData){ ds = window.SleekData.norm(kind, ds); el.setAttribute('data-type', kind === 'chart' ? ds.type : 'results'); window.SleekData.draw(host, ds, 1e9, { width: 595, max: 76 }); }
    });
    // a table's column widths, as shares of its width
    Array.prototype.forEach.call(box.querySelectorAll('table'), function(t){
      var row = t.querySelector('tr'), ws = []; if(!row) return;
      Array.prototype.forEach.call(row.children, function(c){ String(c.getAttribute('data-colwidth') || '').split(',').forEach(function(w){ ws.push(parseFloat(w) || 0); }); });
      Array.prototype.forEach.call(t.querySelectorAll('[data-colwidth]'), function(c){ c.removeAttribute('data-colwidth'); c.style.removeProperty('width'); });
      if(!ws.some(Boolean)) return;
      // a column you sized keeps its share; the ones you left alone split what remains
      var free = ws.filter(function(w){ return !w; }).length, sum = Math.max(680, ws.reduce(function(a, b){ return a + b; }, 0) + free * 120), g = document.createElement('colgroup');
      ws.forEach(function(w){ var c = document.createElement('col'); if(w) c.style.width = (w / sum * 100).toFixed(2) + '%'; g.appendChild(c); }); t.insertBefore(g, t.firstChild);
    });
    return box.innerHTML;
  }
  function wordsIn(doc){ var m = doc.textBetween(0, doc.content.size, ' ', ' ').match(/\S+/g); return m ? m.length : 0; }

  // build the page; viewers: { url, room } to count readers, or null. Resolves { html, name }
  function build(viewers){
    var m = A.meta();
    return A.flush().then(function(){ return D.get(m.id); }).then(function(d){
      var uses = JSON.stringify(d.seed.doc), hasData = uses.indexOf('"type":"data"') >= 0, hasCompare = uses.indexOf('"type":"compare"') >= 0;
      // the scripts a page gets, in order: the reader, then only what its own blocks need, then the beacon
      var extra = (hasData ? ['features/data-layout.js', 'doc/data.js'] : []).concat(hasCompare ? ['doc/compare.js'] : []).concat(viewers ? ['features/viewers-beacon.js'] : []);
      return Promise.all([S.inline(d.seed, false), text('doc/doc.css'), text('doc/reader.css'), text('doc/reader.js'), Promise.all(extra.map(text))]).then(function(r){
        var seed = r[0], doc = PM.model.Node.fromJSON(K.schema, seed.doc), t = seed.theme || {};
        var mode = t.mode === 'dark' ? 'dark' : 'light', font = t.font === 'editorial' ? 'editorial' : 'inter', accent = /^#[0-9a-f]{6}$/i.test(t.accent || '') ? t.accent : '#7C5CFF';
        var info = { id: 'p' + d.id, title: d.title, published: true }; if(viewers) info.viewers = { url: viewers.url, room: viewers.room };
        var mins = Math.max(1, Math.round(wordsIn(doc) / 220));
        var html = '<!doctype html>\n<html lang="en"' + (mode === 'dark' ? ' data-mode="dark"' : '') + ' data-font="' + font + '" style="--d-accent: ' + accent + '">\n<head>\n<meta charset="utf-8">\n' +
          '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n<title>' + esc(d.title) + '</title>\n<meta name="generator" content="Sleek Docs">\n' +
          '<meta name="theme-color" content="' + (mode === 'dark' ? '#0E0E11' : '#FFFFFF') + '">\n<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n' +
          '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700' + (font === 'editorial' ? '&family=Instrument+Serif' : '') + '&display=swap">\n' +
          '<style>\n' + r[1] + '\n' + r[2] + '\n</style>\n</head>\n<body>\n' +
          '<header class="rd-top"><b class="rd-title">' + esc(d.title) + '</b><span class="rd-time">' + mins + ' min read</span>' +
          '<button type="button" class="rd-mode" id="rd-mode" title="Light or dark" aria-label="Light or dark"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg></button><i class="rd-bar" id="rd-bar"></i></header>\n' +
          '<div class="rd-in"><nav class="rd-outline" id="rd-outline" aria-label="On this page"></nav><main class="rd-main"><article class="dk-doc" id="doc">\n' + body(doc) + '\n</article><footer class="rd-foot">Made with Sleek Docs</footer></main></div>\n' +
          '<script>window.SLEEK_DECK = ' + JSON.stringify(info).replace(/</g, '\\u003c') + '; window.SLEEK_NS = ' + JSON.stringify('pub:p' + d.id + ':') + ';</script>\n' +
          '<script>\n' + inScript(r[3]) + '\n</script>\n' + r[4].map(function(js){ return '<script>\n' + inScript(js) + '\n</script>\n'; }).join('') + '</body>\n</html>\n';
        return { html: html, name: A.fileName(d.title) + '.html' };
      });
    });
  }
  // Publish: with the switch on, the service is told first (so a page is never out there uncounted),
  // then the file is made and downloaded
  function publish(count){
    var m = A.meta(), can = !!(O && O.on), was = m.viewers && m.viewers.on;
    A.view.dispatch(A.view.state.tr.setMeta('ids', true));      // every block has its id before the stops are named
    var st = stopsOf(A.view.state.doc);
    var ready = !can ? Promise.resolve(null)
      : count ? O.set(m.id, true, st.names, { store: D, extra: { stops: st.ids } })
      : was ? O.set(m.id, false, null, { store: D }).then(function(){ return null; }) : Promise.resolve(null);
    return ready.then(function(v){
      return build(count && v ? { url: O.url, room: v.room } : null).then(function(r){
        A.saveFile(r.name, new Blob([r.html], { type: 'text/html' }));
        A.toast(count && v ? 'Published. Readers of this file are counted.' : 'Published as one web page.');
        if(A.viewersChanged) A.viewersChanged();
        return r;
      });
    }, function(e){ console.error(e); A.toast('Couldn’t reach the reader service, so nothing was published. Check your connection, or publish with the switch off.'); return null; });
  }

  // the Share menu's first rows
  var want = null;      // the switch, as last left for this page
  A.onOpen.push(function(){ want = null; });
  A.shareFirst = function(p){
    var m = A.meta(), can = !!(O && O.on); if(want === null) want = !!(m.viewers && m.viewers.on);
    A.item(p, 'web', 'Publish as a web page', 'One file that looks like this page, for anyone', function(){ A.closePop(); publish(can && want); });
    if(can){
      var row = document.createElement('div'); row.className = 'opt';
      row.innerHTML = '<span><b id="sw-l">See who’s reading</b><i>The page tells Sleek when it is open and how far down it is. Readers stay anonymous.</i></span><button type="button" class="sw" role="switch" aria-labelledby="sw-l"></button>';
      var sw = row.querySelector('.sw'); sw.setAttribute('aria-checked', String(want));
      sw.addEventListener('click', function(){ want = !want; sw.setAttribute('aria-checked', String(want)); });
      p.appendChild(row);
    }
    var line = document.createElement('div'); line.className = 'line'; p.appendChild(line);
  };
  window.SleekDocPublish = { build: build, publish: publish, stopsOf: stopsOf };
})();

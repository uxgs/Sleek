/* Make a deck (Share): a Sleek Slides deck made from this page.

   The page is read top to bottom and cut into slides, each one of Slides' own layouts (deck.html's
   <template id="layouts">), so the deck opens in Sleek Slides like any other and is yours to edit:
     the cover, or the page's title         Title
     a big heading (Heading 1)              Section divider
     a heading with a list under it         Bullets: the heading, and up to four points a slide
                                            (a longer list carries on, on the next slide)
     a heading with only short lines        Bullets, each short line a point
     a picture                              Fullscreen image
     a before and after                     Before and after
     big numbers, a chart                   Results, Chart, with the same data
   Everything else (long paragraphs, quotes, tables, code, captions) goes into the speaker notes of
   the slide it belongs to, so nothing on the page is lost. The page's light or dark, colour and
   type carry over. The page itself is not changed.

   A deck's words and pictures are kept by name, "<slide id>.t<N>" and "<slide id>.m<N>", N counting
   the layout's text places and picture tiles in order (app.js). Those numbers are read here from
   the layouts themselves, so this keeps working if a layout gains or loses a line. */
(function(){
  var K = window.SleekDocKit, A = window.SleekDoc, D = window.SleekDocs, S = window.SleekStore; if(!K || !A || !S) return;
  var N = K.N, GONE = '<!--removed-->', main = document.getElementById('main');
  var TEXT_SEL = '.overline, .display, .lead, .one, .body, .section-no, .lbl, .lh, .taglist li, .cap, .meta, .card-item span, .lcol li';   // app.js: TEDIT_SEL
  function esc(s){ return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function short(s, n){ s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1).trim() + '…' : s; }

  // each layout's text places and picture tiles, by what they are: { title: { text: { '.display': ['t1'], … }, media: ['m0', …] } }
  var layouts = null;
  function readLayouts(){
    if(layouts) return Promise.resolve(layouts);
    return fetch('deck.html').then(function(r){ if(!r.ok) throw new Error('offline'); return r.text(); }).then(function(html){
      var doc = new DOMParser().parseFromString(html, 'text/html'), lib = doc.getElementById('layouts'), out = {};
      Array.prototype.forEach.call(lib ? lib.content.children : [], function(s){
        if(!s.matches || !s.matches('.slide[data-note]')) return;
        var key = s.getAttribute('data-note'); if(out[key]) return;
        var L = out[key] = { text: {}, media: [], order: [] }, ti = 0, mi = 0;
        Array.prototype.forEach.call(s.querySelectorAll(TEXT_SEL), function(el){
          var sp = el.getAttribute('data-spare'), name = sp ? 'xt' + sp : 't' + (ti++);
          var kind = el.matches('.taglist li') ? 'point' : el.matches('.cap') ? 'cap' : el.matches('.meta') ? 'meta' : el.matches('.display') ? 'head' : el.matches('.overline') ? 'over' : el.matches('.lead') ? 'lead' : el.matches('.section-no') ? 'no' : 'other';
          (L.text[kind] = L.text[kind] || []).push(name); L.order.push(name);
        });
        Array.prototype.forEach.call(s.querySelectorAll('.media'), function(m){ var sp = m.getAttribute('data-spare'); L.media.push(sp ? 'xm' + sp : 'm' + (mi++)); });
      });
      return layouts = out;
    });
  }

  function inline(node){      // a line's words as the HTML a slide's text holds: bold, italic and underline kept
    var out = '';
    node.forEach(function(c){
      if(!c.isText){ if(c.type === N.hard_break) out += ' '; return; }
      var t = esc(c.text), names = c.marks.map(function(m){ return m.type.name; });
      if(names.indexOf('strong') >= 0) t = '<b>' + t + '</b>'; if(names.indexOf('em') >= 0) t = '<i>' + t + '</i>'; if(names.indexOf('underline') >= 0) t = '<u>' + t + '</u>';
      out += t;
    });
    return out.trim();
  }
  function noteOf(node){      // what goes to the speaker notes for a block
    if(node.type === N.table){ var rows = []; node.forEach(function(r){ var cells = []; r.forEach(function(c){ cells.push(c.textContent.trim()); }); rows.push(cells.join(' | ')); }); return rows.map(function(r){ return '<div>' + esc(r) + '</div>'; }).join(''); }
    if(node.type === N.code_block) return node.textContent.split('\n').map(function(l){ return '<div>' + esc(l) + '</div>'; }).join('');
    if(node.isTextblock) return node.content.size ? '<div>' + inline(node) + '</div>' : '';
    var out = ''; node.forEach(function(c){ out += noteOf(c); }); return out;
  }

  // the page as a list of slides: [{ t: layout, name, over, head, lead, points: [html], src, before, ds, no, notes: html }]
  function plan(doc){
    var slides = [], section = '', parts = 0, cur = null, title = A.title(), lastHead = '';      // lastHead: the heading everything now belongs under
    function plain(html){ return String(html || '').replace(/<[^>]+>/g, ''); }
    function push(s){ s.notes = s.notes || ''; slides.push(s); return s; }
    function first(){ cur = push({ t: 'title', name: 'Title', over: '', head: esc(title), lead: '' }); lastHead = cur.head; }      // a page with no title of its own still opens on one
    function topic(head){ if(head) lastHead = head; cur = push({ t: 'bullets', name: short(plain(head), 40) || 'Bullets', over: esc(section || title), head: head, points: [] }); return cur; }
    function note(html){ if(!html) return; if(!cur) first(); cur.notes += html; }
    function point(html){
      if(!html) return;
      if(!cur) first();
      if(cur.t !== 'bullets') topic(lastHead);
      if(cur.points.length >= 4){ var was = cur; topic(was.head); cur.name = short(plain(was.head), 32) + ' (more)'; }
      cur.points.push(html);
    }
    function walk(node, top){
      node.forEach(function(n, _, i){
        switch(n.type){
          case N.cover:
            var k = n.child(0), h = n.child(1), l = n.child(2);
            cur = push({ t: 'title', name: 'Title', over: inline(k), head: inline(h) || esc(title), lead: inline(l) }); lastHead = cur.head; break;
          case N.heading:
            var text = inline(n); if(!text) break;
            if(top && i === 0 && n.attrs.level === 1 && !slides.length){ cur = push({ t: 'title', name: 'Title', over: '', head: text, lead: '' }); lastHead = text; break; }
            if(n.attrs.level === 1){ section = n.textContent.trim(); parts++; lastHead = text; cur = push({ t: 'divider', name: short(section, 40), no: 'Part ' + (parts < 10 ? '0' : '') + parts, head: text }); break; }
            topic(text); break;
          case N.bullet_list: case N.ordered_list: case N.task_list:
            n.forEach(function(item){ var lead = true; item.forEach(function(b){ if(b.type === N.paragraph && lead){ point(inline(b)); lead = false; } else note(noteOf(b)); }); });      // a point's own sub-list goes to the notes
            if(cur) cur.listed = true;
            break;
          case N.paragraph:
            if(!n.content.size) break;
            // a title slide takes the first short line under it as its lead; otherwise short lines are points and long ones notes
            if(cur && cur.t === 'title' && !cur.lead && n.textContent.length <= 170){ cur.lead = inline(n); break; }
            if(n.textContent.length <= 130 && cur && cur.t === 'bullets' && !cur.listed) point(inline(n)); else note(noteOf(n));
            break;
          case N.figure:
            if(!n.attrs.src) break;
            push({ t: 'fullscreen-image', name: short(n.textContent, 40) || 'Picture', src: n.attrs.src, notes: n.content.size ? '<div>' + inline(n) + '</div>' : '' }); break;
          case N.compare:
            if(!n.attrs.before || !n.attrs.after) break;
            push({ t: 'before-after', name: 'Before and after', head: lastHead || 'Before and after', src: n.attrs.after, before: n.attrs.before }); break;
          case N.data:
            var chart = n.attrs.kind !== 'results';
            push({ t: chart ? 'chart' : 'results', name: (lastHead ? short(plain(lastHead), 34) + ': ' : '') + (chart ? 'chart' : 'numbers'), over: esc(section || title), head: lastHead || (chart ? 'The chart' : 'In numbers'), ds: n.attrs.ds }); break;
          case N.columns: n.forEach(function(c){ walk(c, false); }); break;
          case N.callout: case N.blockquote: walk(n, false); break;
          case N.horizontal_rule: break;
          default: note(noteOf(n));
        }
      });
    }
    walk(doc, true);
    // a heading that ended with nothing under it but notes is still a slide (its points simply stay out); a slide with nothing at all is dropped
    slides = slides.filter(function(s){ return s.t !== 'bullets' || s.head || s.points.length; });
    if(!slides.length || slides[0].t !== 'title') slides.unshift({ t: 'title', name: 'Title', over: '', head: esc(title), lead: '', notes: '' });
    return slides;
  }

  // the deck's seed, from the plan and the layouts' own numbering
  function seedFor(slides, L, theme){
    var seed = { added: [], text: {}, media: {}, noteByKey: {} }, t = theme || {};
    seed.theme = { mode: t.mode === 'dark' ? 'dark' : 'light', accent: /^#[0-9a-f]{6}$/i.test(t.accent || '') ? t.accent : '#7C5CFF', glow: 'aurora', glowColor: 'dusk', motion: 'off', fx: 'smoke' };
    if(t.font === 'editorial') seed.theme.font = { v: 'editorial', d: '"Instrument Serif", Georgia, "Times New Roman", serif', b: '"Inter", -apple-system, BlinkMacSystemFont, system-ui, sans-serif', href: 'https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&display=swap' };
    slides.forEach(function(s){
      var lay = L[s.t]; if(!lay) return;
      var id = S.uid(), entry = { id: id, t: s.t, name: s.name || s.t };
      function set(kind, k, html){ var names = lay.text[kind]; if(names && names[k] != null) seed.text[id + '.' + names[k]] = html; }
      function blankRest(kind, from){ (lay.text[kind] || []).forEach(function(name, k){ if(k >= from) seed.text[id + '.' + name] = kind === 'point' || kind === 'cap' ? GONE : ''; }); }
      set('over', 0, s.over || ''); set('head', 0, s.head || ''); set('lead', 0, s.lead || ''); set('no', 0, s.no || ''); blankRest('meta', 0);
      if(s.t === 'bullets'){ s.points.forEach(function(p, k){ set('point', k, p); }); blankRest('point', s.points.length); }
      if(s.t === 'fullscreen-image') seed.media[id + '.' + lay.media[0]] = s.src;
      if(s.t === 'before-after'){
        // one tile: its After is the picture, its Before sits beside it under "b:"; the layout's other tiles stay out
        seed.media[id + '.' + lay.media[0]] = s.src; seed.media['b:' + id + '.' + lay.media[0]] = s.before;
        set('cap', 0, 'After'); blankRest('cap', 1); set('lead', 0, 'Open the picture to compare it with before.');
      }
      if(s.ds) entry.ds = JSON.parse(JSON.stringify(s.ds));
      if(s.t === 'chart') set('lead', 0, '');
      if(s.notes) seed.noteByKey['add-' + id] = s.notes;
      seed.added.push(entry);
    });
    return seed;
  }
  function build(){
    var m = A.meta();
    return A.flush().then(function(){ return Promise.all([readLayouts(), D.get(m.id)]); }).then(function(r){
      // the stored page: its pictures are short references the deck can keep as they are (both use the same picture store)
      var doc = window.SleekPM.model.Node.fromJSON(K.schema, r[1].seed.doc), slides = plan(doc);
      return { slides: slides, seed: seedFor(slides, r[0], r[1].seed.theme), title: A.title(), cover: { k: slides[0].over ? slides[0].over.replace(/<[^>]+>/g, '') : 'From Sleek Docs', h: A.title() } };
    });
  }
  function make(b){ return S.create({ title: b.title, seed: b.seed, cover: b.cover }); }

  // ---------- the preview: what the deck will be, before it is made ----------
  var WORD = { title: 'Title', divider: 'Section', bullets: 'Bullets', 'fullscreen-image': 'Picture', 'before-after': 'Before and after', results: 'Big numbers', chart: 'Chart' };
  var box = null;
  function close(){ if(box){ box.remove(); box = null; } }
  function open(){
    close(); if(A.closePop) A.closePop();
    A.toast('Reading the page…');
    build().then(function(b){
      var old = document.querySelector('.toast'); if(old) old.remove();
      box = document.createElement('div'); box.className = 'td'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-labelledby', 'td-h');
      var notes = b.slides.filter(function(s){ return s.notes; }).length;
      box.innerHTML = '<div class="td-panel"><h2 id="td-h">Make a deck from this page</h2><p>' + b.slides.length + (b.slides.length === 1 ? ' slide' : ' slides') + ', in this page’s colour and type. ' +
        (notes ? 'Longer text goes into the speaker notes of ' + (notes === 1 ? 'one slide' : notes + ' slides') + '. ' : '') + 'The page stays as it is.</p><ol class="td-list">' +
        b.slides.map(function(s, i){ var plainHead = String(s.head || s.name || '').replace(/<[^>]+>/g, ''); return '<li><span class="td-n">' + (i + 1) + '</span><span class="td-k">' + WORD[s.t] + '</span><span class="td-t">' + esc(short(plainHead || s.name, 70)) + (s.t === 'bullets' && s.points.length ? '<em>' + s.points.length + (s.points.length === 1 ? ' point' : ' points') + '</em>' : '') + '</span></li>'; }).join('') +
        '</ol><div class="td-foot"><button type="button" class="fb w" data-do="no">Not now</button><button type="button" class="btn" data-do="go">Make the deck</button></div></div>';
      main.appendChild(box);
      box.addEventListener('click', function(e){
        var d = e.target.closest('[data-do]'); if(e.target === box || (d && d.getAttribute('data-do') === 'no')){ close(); A.view.focus(); return; }
        if(!d) return;
        d.disabled = true; d.textContent = 'Making it…';
        make(b).then(function(deck){ location.href = 'deck.html?d=' + encodeURIComponent(deck.id); }, function(err){ console.error(err); close(); A.toast('The deck couldn’t be made.'); });
      });
      box.querySelector('[data-do=go]').focus();
    }, function(e){ console.error(e); A.toast(e && e.message === 'offline' ? 'Making a deck needs a connection the first time.' : 'The deck couldn’t be made from this page.'); });
  }
  document.addEventListener('keydown', function(e){ if(box && e.key === 'Escape'){ e.stopPropagation(); close(); A.view.focus(); } }, true);
  A.onOpen.push(close);
  K.makeDeck = open; K.deckPlan = build; K.deckMake = make;
})();

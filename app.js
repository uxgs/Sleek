(function(){
  // every edit kept on this device is named for its deck (core/store.js), so decks never share them
  var NS = window.SLEEK_NS || '';
  // a published deck (one HTML file, core/publish.js) plays and presents; it doesn't edit or save
  var PUBLISHED = !!(window.SLEEK_DECK && window.SLEEK_DECK.published);
  // speaker notes live in the deck's seed (rich HTML)
  var SEED = window.SEED || {};
  var NOTES = (SEED.notes || []).slice();
  // speaker notes edited in Edit mode, by slide index; they save into the deck with every other edit
  var noteOverrides = {};
  try { noteOverrides = JSON.parse(localStorage.getItem(NS + 'deck-notes') || '{}') || {}; } catch(e){ noteOverrides = {}; }
  // slides marked data-note="<key>" keep their notes by name (seed.noteByKey, else the slide's own
  // <template class="slide-notes">), so they stay with their slide when slides move
  var NOTE_BY_KEY = {};
  Object.keys(SEED.noteByKey || {}).forEach(function(k){ NOTE_BY_KEY[k] = SEED.noteByKey[k]; });
  Object.keys(noteOverrides).forEach(function(k){
    if(k.indexOf('k:') === 0) NOTE_BY_KEY[k.slice(2)] = noteOverrides[k]; else NOTES[+k] = noteOverrides[k];
  });
  var PRESENTERWIN = location.hash === '#presenter';
  var POPOUT = PRESENTERWIN;
  if(PRESENTERWIN){ document.body.classList.add('presenterwin'); }
  // the presenter's live preview: a full copy of the deck (deck.html?mirror=1) that replays the
  // audience window's clicks and keys, and sends its own clicks to the audience to perform
  var MIRROR = /[?&]mirror=1/.test(location.search);
  if(MIRROR){ document.body.classList.add('mirror'); }

  // ---------- layouts, and the deck's slides ----------
  // Every layout is a template in deck.html (<template id="layouts">), named by its data-note. A deck
  // is a list of slides, seed.added: [{ id, t: layout, name, fill }], each one made from its layout:
  // with placeholder words, or as written there (fill: "sample", the sample deck). A slide's words
  // and tiles are named for the slide (<id>.t0, <id>.m0), so slides can come and go without anything
  // else moving. The grid's + tile adds one; edits sit on this device and save into the deck.
  var TEMPLATES = [];
  (function(){
    var seen = {}, lib = document.getElementById('layouts');
    Array.prototype.forEach.call(lib ? lib.content.children : [], function(s){
      if(!s.matches || !s.matches('.slide[data-note]')) return;
      var key = s.getAttribute('data-note'); if(seen[key]) return; seen[key] = true;
      var t = s.querySelector('template.slide-notes'), d = document.createElement('div');
      d.innerHTML = t ? t.innerHTML : '';
      var first = (d.querySelector('p') || d).textContent.trim(), desc = (first.match(/^.*?[.!?](\s|$)/) || [first])[0].trim();
      TEMPLATES.push({ key: key, name: s.getAttribute('data-label') || key, desc: desc, html: s.outerHTML });
    });
  })();
  var ADDED_SEED = Array.isArray(SEED.added) ? SEED.added : [];
  var ADDED = ADDED_SEED.slice();
  try { var _ad = JSON.parse(localStorage.getItem(NS + 'deck-added') || 'null'); if(Array.isArray(_ad)) ADDED = _ad; } catch(e){}
  var PH_TEXT = [            // placeholder words, by what the text is
    ['.overline', 'Section'], ['h1.display, h2.display', 'Your headline'], ['.lead, .one.body', 'A sentence that sets up this slide.'],
    ['.taglist li', 'A point worth making'], ['.cap', 'Caption'], ['.meta', 'Detail'], ['.section-no', 'Part 01'],
    ['.p-k', 'Step'], ['.p-n', 'Title'], ['.p-r', 'Detail'], ['.p-d', 'A short description.']
  ];
  function templateBy(key){ return TEMPLATES.filter(function(t){ return t.key === key; })[0]; }
  function makeAdded(a){
    var t = templateBy(a.t); if(!t) return null;
    var d = document.createElement('div'); d.innerHTML = t.html;
    var el = d.firstElementChild;
    el.classList.remove('active');
    el.setAttribute('data-label', a.name); el.setAttribute('data-note', 'add-' + a.id); el.setAttribute('data-added', a.id);
    if(window.SleekCollage) SleekCollage.build(el, a);          // a moodboard: a tile for each of its pictures (features/collage-layout.js)
    if(window.SleekData) SleekData.build(el, a);                // Results and Chart: drawn from the slide's numbers (features/data-layout.js)
    if(window.SleekTaskSlide) SleekTaskSlide.build(el, a);     // Tasks: a project's board or list, from Sleek Tasks (features/tasks-layout.js)
    if(a.fill === 'sample') return el;                         // the layout's own words, pictures and notes
    el.removeAttribute('data-before');
    var notes = el.querySelector('template.slide-notes'); if(notes) notes.remove();
    PH_TEXT.forEach(function(r){ Array.prototype.forEach.call(el.querySelectorAll(r[0]), function(x){ x.textContent = r[1]; }); });
    Array.prototype.forEach.call(el.querySelectorAll('[data-spare] .cap'), function(x){ x.innerHTML = '<!--removed-->'; });   // a spare stays out until it's added
    Array.prototype.forEach.call(el.querySelectorAll('.lcol li'), function(li){
      var m = li.querySelector('.m'); li.removeAttribute('data-press'); li.innerHTML = (m ? m.outerHTML : '') + 'A point worth making';
    });
    return el;
  }
  (function(){
    var host = document.getElementById('screen-slides'), stage0 = document.getElementById('stage');
    ADDED.forEach(function(a){ var el = makeAdded(a); if(el) stage0.insertBefore(el, host); });
  })();
  function saveAdded(){ try { localStorage.setItem(NS + 'deck-added', JSON.stringify(ADDED)); } catch(e){} }

  var slides = Array.prototype.slice.call(document.querySelectorAll('#stage .slide'));
  var i = 0;
  var curEl = document.getElementById('cur');
  var secEl = document.getElementById('seclabel');
  var stage = document.getElementById('stage');
  // the stage is a fixed 1280x720 canvas: never let focus or overflow scroll it out of place
  stage.addEventListener('scroll', function(){ if(stage.scrollTop || stage.scrollLeft){ stage.scrollTop = 0; stage.scrollLeft = 0; } });
  document.getElementById('total').textContent = String(slides.length).padStart(2,'0');

  // attach speaker notes to each static slide; dynamic screen slides get theirs when rendered
  function keyedNote(s){
    var key = s._nkey; if(NOTE_BY_KEY[key] != null) return NOTE_BY_KEY[key];
    var t = s.querySelector('template.slide-notes'); return t ? t.innerHTML.trim() : '';
  }
  (function(){
    var ni = 0;
    slides.forEach(function(s){
      var key = s.getAttribute('data-note');
      if(key){ s._nkey = key; s._notes = keyedNote(s); }
      else { s._ni = ni; s._notes = NOTES[ni]; ni++; }
    });
  })();
  // slide names (the label bottom left, the notes header, the address): editable in Edit mode.
  // Keyed by the name in the markup, so a renamed slide keeps its name wherever it moves.
  var labelOverrides = {};
  try { labelOverrides = JSON.parse(localStorage.getItem(NS + 'deck-labels') || '{}') || {}; } catch(e){ labelOverrides = {}; }
  function seedLabel(key){ return (SEED.labels && SEED.labels[key] != null) ? SEED.labels[key] : key; }
  slides.forEach(function(s){
    var key = s.getAttribute('data-label'); if(key == null) return;
    s._lkey = key;
    var v = labelOverrides[key] != null ? labelOverrides[key] : seedLabel(key);
    if(v !== key) s.setAttribute('data-label', v);
  });
  function rebuildSlides(){
    slides = Array.prototype.slice.call(document.querySelectorAll('#stage .slide'));
    document.getElementById('total').textContent = String(slides.length).padStart(2,'0');
    var pt = document.getElementById('pres-total'); if(pt) pt.textContent = slides.length;
    if(i > slides.length-1) i = slides.length-1;
    if(i < 0) i = 0;
    // re-rendered screen slides are new elements: keep the current one showing
    slides.forEach(function(s, idx){ s.classList.toggle('active', idx === i); });
  }

  // ---------- slide order ----------
  // The markup's order, unless you've dragged slides around in the grid: then it's a list of slide
  // keys (a slide's name in the markup, a screen's id), saved like any other edit (deck-order on
  // this device and saves into seed.order). Slides only move in the page after their
  // text, tiles and notes are attached, so nothing that's numbered by position shifts. A slide
  // added to the markup later lands right after the one it follows there.
  var orderOverride = null, orderReady = false;
  try { orderOverride = JSON.parse(localStorage.getItem(NS + 'deck-order') || 'null'); } catch(e){ orderOverride = null; }
  var NATURAL = Array.prototype.map.call(stage.querySelectorAll(':scope > .slide, :scope > #screen-slides'), function(el){
    return el.id === 'screen-slides' ? null : el._lkey;          // the markup's name; null: where the screens go
  });
  var orderAnchor = document.createComment('slides');
  stage.insertBefore(orderAnchor, stage.querySelector(':scope > .slide'));
  function slideKey(s){ return s._sid != null ? 'scr:' + s._sid : s._lkey; }
  function naturalKeys(){
    var out = [];
    NATURAL.forEach(function(k){ if(k != null) out.push(k); else annData.screens.forEach(function(sc){ out.push('scr:' + sc.id); }); });
    return out;
  }
  function mergeOrder(want, nat){
    if(!want || !want.length) return nat.slice();
    var out = want.filter(function(k, n){ return nat.indexOf(k) > -1 && want.indexOf(k) === n; });
    nat.forEach(function(k, n){ if(out.indexOf(k) < 0) out.splice(n ? out.indexOf(nat[n - 1]) + 1 : 0, 0, k); });
    return out;
  }
  function orderKeys(){ return mergeOrder(orderOverride || SEED.order, naturalKeys()); }
  function orderPending(){
    if(!orderOverride) return false;
    var nat = naturalKeys();
    return JSON.stringify(mergeOrder(orderOverride, nat)) !== JSON.stringify(mergeOrder(SEED.order, nat));
  }
  // put the slides in the page in order; the slide on screen stays on screen
  function applyOrder(){
    var curKey = slides[i] && slideKey(slides[i]), byKey = {};   // by key: a re-rendered screen is a new element
    Array.prototype.forEach.call(stage.querySelectorAll(':scope > .slide, #screen-slides > .slide'), function(s){ byKey[slideKey(s)] = s; });
    orderKeys().forEach(function(k){ if(byKey[k]) stage.insertBefore(byKey[k], orderAnchor); });
    rebuildSlides();
    var n = slides.indexOf(byKey[curKey]); if(n > -1) i = n;
    rebuildSlides();
  }
  function setOrder(keys){
    orderOverride = keys;
    try { localStorage.setItem(NS + 'deck-order', JSON.stringify(keys)); } catch(e){}
    applyOrder();
    try { if(bc) bc.postMessage({ order: true }); } catch(e){}   // before show() sends the new number
    show(i); markChanged();
  }
  // another window (the presenter, its preview) moved slides
  function reloadOrder(){
    try { orderOverride = JSON.parse(localStorage.getItem(NS + 'deck-order') || 'null'); } catch(e){ orderOverride = null; }
    applyOrder(); suppress = true; show(i); suppress = false; markChanged();
  }

  var notesEl = document.getElementById('notes');
  var nK = document.getElementById('n-k'), nT = document.getElementById('n-t'), nText = document.getElementById('n-text');

  var notesShown = -1;
  function renderNotes(){
    var label = slides[i].getAttribute('data-label') || '';
    nK.textContent = label;
    nT.textContent = 'Slide ' + (i+1) + ' of ' + slides.length;
    var s = slides[i];
    var ns = notesSet(s);
    if(ns) paintAnnNotes(nText, ns, editing);                          // an annotated slide: its notes, then each annotation
    else { nText.classList.remove('an-notes'); nText.contentEditable = editing ? 'true' : 'false'; nText.innerHTML = (s && s._notes) || (editing ? '' : '<p>(no notes yet)</p>'); }
    if(notesShown !== i) notesEl.scrollTop = 0;                         // keep your place when the same slide re-renders
    notesShown = i;
  }
  // ---------- annotated slides: the annotations, broken out as speaker notes ----------
  // The slide's own notes, then every pin (by number), box and arrow with its label and note: on an
  // annotated screen, and on any other slide once something is annotated on it. Editing here edits the
  // annotation itself (and the callout on the slide), and the other way round; your own notes stay yours.
  function notesSet(s){
    if(!s) return null;
    if(s._screen) return { sc: s._screen, intro: s._screen.notes || '', ph: 'Notes for this screen\u2026', none: true };
    var pg = s._lkey != null && annData.pages && annData.pages[s._lkey];
    if(pg && ((pg.ann || []).length || (pg.shapes || []).length)) return { sc: pg, intro: s._notes || '', ph: 'Notes for this slide\u2026' };
    return null;
  }
  function annNotesHTML(ns){
    var sc = ns.sc;
    var items = (sc.ann || []).map(function(a, k){ return { a: a, mark: String(k + 1), kind: 'pin', def: 'Note' }; })
      .concat((sc.shapes || []).map(function(x){ return { a: x, mark: x.type === 'box' ? '\u25a2' : '\u2197', kind: x.type, def: x.type === 'box' ? 'Area' : 'Note' }; }));
    var h = '<div class="an-intro" data-part="screen" data-ph="' + ns.ph + '">' + (ns.intro || '') + '</div>';
    if(items.length) h += '<div class="an-list" contenteditable="false">' + items.map(function(it){
      var imgs = (it.a.images || []).map(function(src, k){ return '<button type="button" class="an-img" data-k="' + k + '"><img src="' + src + '" alt=""></button>'; }).join('');
      var tint = it.a.color ? ' style="--ac:' + it.a.color + ';--on-ac:' + (/^#(FFD60A|64D2FF|30D158|FF9F0A)$/i.test(it.a.color) ? '#121214' : '#fff') + '"' : '';
      return '<div class="an-item" data-aid="' + it.a.id + '"><span class="an-mark an-' + it.kind + '"' + tint + '>' + it.mark + '</span><div class="an-body">' +
        '<div class="an-t" data-part="title" data-ph="' + it.def + '">' + escText(it.a.title || '') + '</div>' +
        '<div class="an-b" data-part="note" data-ph="Add a note\u2026">' + noteHTML(it.a.note) + '</div>' +
        (imgs ? '<div class="an-imgs">' + imgs + '</div>' : '') + '</div></div>';
    }).join('') + '</div>';
    else if(ns.none) h += '<p class="an-none">No annotations on this screen yet.</p>';
    return h;
  }
  function paintAnnNotes(el, ns, editable){
    el.contentEditable = 'false';
    el.innerHTML = annNotesHTML(ns);
    el.classList.add('an-notes');
    Array.prototype.forEach.call(el.querySelectorAll('[data-part]'), function(p){ p.contentEditable = editable ? 'true' : 'false'; });
  }
  // an annotation changed: its label and note on the slide
  function updateAnnDOM(aid){
    var r = annById(aid); if(!r) return;
    var label = r.a.title || (r.a.type === 'box' ? 'Area' : 'Note');
    Array.prototype.forEach.call(document.querySelectorAll('#stage .callout[data-aid="'+aid+'"] .ch, #stage .abox-tag[data-aid="'+aid+'"], #stage .aarrow-tag[data-aid="'+aid+'"] .aarrow-text'), function(el){ el.textContent = label; });
    var cb = document.querySelector('#stage .callout[data-aid="'+aid+'"] .cb'); if(cb) cb.innerHTML = noteHTML(r.a.note);
    paintImgBadge(aid);                                        // a box's tag text was just replaced
  }
  // an edit made in the notes (drawer or presenter)
  function editAnnPart(s, part){
    var sc = s._screen, kind = part.getAttribute('data-part');
    if(kind === 'screen'){
      var html = cleanNotesHtml(part);
      if(sc){ sc.notes = html; s._notes = html; saveAnns(); } else saveNoteFor(s, html);   // a slide's own notes
      return;
    }
    var item = part.closest('.an-item'), r = item && annById(item.getAttribute('data-aid')); if(!r) return;
    if(kind === 'title') r.a.title = part.textContent.replace(/\s+/g, ' ').trim();
    else r.a.note = cleanNote(part.innerHTML);
    updateAnnDOM(r.a.id);
    var ed = document.getElementById('pin-ed');                      // the annotation editor, if it's open on this one
    if(ed && !ed.hidden && ed._aid === r.a.id){
      if(kind === 'title') ed.querySelector('.pe-title').value = r.a.title || '';
      else ed.querySelector('.pe-note').innerHTML = noteHTML(r.a.note);
    }
    saveAnns();
  }
  // an annotation changed elsewhere: refresh the notes unless you're typing in them
  function refreshAnnNotes(){
    var s = slides[i]; if(!s) return;                                 // (a slide's first or last annotation changes its notes too)
    if(!nText.contains(document.activeElement)) renderNotes();
    var pn = document.getElementById('pres-ntext');
    if(pn && !pn.contains(document.activeElement)) renderPresenter();
  }
  // thumbnails in the notes open the full-screen viewer
  document.addEventListener('click', function(e){
    var b = e.target.closest && e.target.closest('.an-notes .an-img'); if(!b) return;
    var r = annById(b.closest('.an-item').getAttribute('data-aid')); if(!r) return;
    e.stopPropagation(); openImageViewer(r.a.images, +b.getAttribute('data-k'), b, annViewOpts(r.a.id, r.a.images));
  });
  // ---------- editing speaker notes: the Edit-mode drawer, and the presenter view ----------
  var nSaveT = 0;
  function cleanNotesHtml(el){ return el.innerHTML.replace(/^(\s|<br>|<p><br><\/p>)+$/, ''); }
  // store one slide's notes: in memory, on this device, and tell the other window
  function saveNoteFor(s, html, fromRemote){
    s._notes = html;
    if(s._screen){ s._screen.notes = html; if(!fromRemote) saveAnns(); }                 // an annotated screen's notes
    else if(s._nkey){ NOTE_BY_KEY[s._nkey] = html; noteOverrides['k:' + s._nkey] = html; }
    else if(s._ni != null){ NOTES[s._ni] = html; noteOverrides[s._ni] = html; }
    else return;
    markChanged();
    if(fromRemote) return;
    if(!s._screen){
      clearTimeout(nSaveT);
      nSaveT = setTimeout(function(){
        // merge with anything the other window saved meanwhile
        var stored = {}; try { stored = JSON.parse(localStorage.getItem(NS + 'deck-notes') || '{}') || {}; } catch(e){}
        Object.keys(noteOverrides).forEach(function(k){ stored[k] = noteOverrides[k]; });
        try { localStorage.setItem(NS + 'deck-notes', JSON.stringify(stored)); } catch(e){}
      }, 250);
    }
    var msg = { noteSlide: slides.indexOf(s), noteHtml: html, t: Date.now() };
    try { if(bc) bc.postMessage(msg); } catch(e){}
    try { localStorage.setItem(NS + 'sleek-notesync', JSON.stringify(msg)); } catch(e){}
  }
  function applyRemoteNote(idx, html){
    var s = slides[idx]; if(!s) return;
    saveNoteFor(s, html, true);
    if(idx !== i) return;
    if(!nText.contains(document.activeElement)) renderNotes();
    var pn = document.getElementById('pres-ntext');
    if(pn && !pn.contains(document.activeElement)){ if(notesSet(s)) renderPresenter(); else pn.innerHTML = html || (presEditing ? '' : '<p>(no notes yet)</p>'); }
  }
  // make an element a rich notes editor: "- " bullets, Tab nesting, and a formatting bar
  function notesEditor(el, bar, isOn){
    el.addEventListener('input', function(e){
      if(!isOn()) return;
      var s = slides[i]; if(!s) return;
      var part = e.target.closest && e.target.closest('[data-part]');
      if(notesSet(s)){                                             // an annotated slide: edit that piece of it
        if(part && el.contains(part)){ if(e.inputType) dashToBullet(part, e); editAnnPart(s, part); }
        return;
      }
      if(e && e.inputType) dashToBullet(el, e);
      saveNoteFor(s, cleanNotesHtml(el));
    });
    // after a toolbar or Tab change, report it from the piece being edited
    function fire(){
      var n = window.getSelection().anchorNode, t = n && (n.nodeType === 1 ? n : n.parentNode);
      var p = t && t.closest && t.closest('[data-part]');
      (p && el.contains(p) ? p : el).dispatchEvent(new Event('input', { bubbles: true }));
    }
    // Tab / Shift-Tab on a bullet nests it one level (the next bullet style down) or brings it back
    el.addEventListener('keydown', function(e){
      if(!isOn() || e.key !== 'Tab') return;
      var n = window.getSelection().anchorNode, t = n && (n.nodeType === 1 ? n : n.parentNode);
      if(!t || !t.closest('li')) return;
      e.preventDefault(); document.execCommand(e.shiftKey ? 'outdent' : 'indent'); fire();
    });
    function state(){
      if(!isOn()) return;
      var inEl = el.contains(window.getSelection().anchorNode);
      Array.prototype.forEach.call(bar.querySelectorAll('[data-cmd]'), function(b){
        var on = false;
        if(inEl && !/dent$/.test(b.dataset.cmd)){ try { on = document.queryCommandState(b.dataset.cmd); } catch(_){} }
        b.setAttribute('aria-pressed', String(on));
      });
    }
    Array.prototype.forEach.call(bar.querySelectorAll('[data-cmd]'), function(b){
      b.addEventListener('mousedown', function(e){ e.preventDefault(); });   // keep the selection in the notes
      b.addEventListener('click', function(){
        if(!el.contains(window.getSelection().anchorNode)){ var first = el.querySelector('[data-part][contenteditable="true"]'); (first || el).focus(); }
        document.execCommand(b.dataset.cmd);
        fire(); state();
      });
    });
    document.addEventListener('selectionchange', state);
    var lb = bar.querySelector('.n-link'); if(lb) noteLinks(el, lb, isOn, fire);
  }
  notesEditor(nText, document.getElementById('n-fmt'), function(){ return editing; });

  // ---------- links in the notes to things on the slide ----------
  // Select words in your notes, then Link: pick an image, take-apart or pin on that slide.
  // The words become a link (href "#open:tile:2", "#open:pin:1": by position on the slide, so it
  // survives saving and slides moving) that opens it on the audience screen as if you'd clicked it,
  // from the deck's notes or the presenter's (the preview follows). While editing it's just text.
  function slideTiles(s){
    return Array.prototype.filter.call(s.querySelectorAll('.media'), function(t){ return t.closest('.slide') === s && !t.closest('.car-copy, .fs-copy, .cl-copy') && !t.matches('.car-gone, .fs-gone'); });
  }
  function openTargets(s){
    var out = [], n = 0, nv = 0; if(!s) return out;
    out.push({ ref: 'slide', kind: 'Slide', name: 'Close what\u2019s open', home: true });
    slideTiles(s).forEach(function(m, k){
      var cap = m.querySelector('.cap'), name = cap ? cap.textContent.trim() : '', src = tileSrc(m), kind, vid = isVideo(src);
      if(m.hasAttribute('data-dis')) kind = 'Take apart';
      else if(src && !s.matches('.s-divider, .s-fullvideo, .s-screen') && !m.closest('.filmstrip')) kind = vid ? 'Play video ' + (++nv) : 'Image ' + (++n);   // a video plays full screen
      else return;
      out.push({ ref: 'tile:' + (k + 1), kind: kind, name: name, src: src, video: vid });
    });
    Array.prototype.forEach.call(s.querySelectorAll('.pin'), function(p, k){
      var co = p.parentNode.querySelector('.callout[data-aid="' + p.dataset.aid + '"] .ch');
      out.push({ ref: 'pin:' + (k + 1), kind: 'Pin ' + (k + 1), name: co ? co.textContent : '', pin: p });
    });
    Array.prototype.forEach.call(s.querySelectorAll('[data-press]'), function(p, k){   // a press clipping
      out.push({ ref: 'press:' + (k + 1), kind: 'Press', press: true, name: p.textContent.replace(/^\s*\+\s*/, '').trim() });
    });
    Array.prototype.forEach.call(s.querySelectorAll('[data-pic]'), function(p, k){     // a picture behind a bullet
      var src = window.Deck && Deck.mediaOf(p.getAttribute('data-eid') + '.pic'), vid = isVideo(src);
      out.push({ ref: 'pic:' + (k + 1), kind: vid ? 'Video' : 'Picture', name: p.textContent.replace(/^\s*\+\s*/, '').trim(), src: vid ? null : src, video: vid });
    });
    return out;
  }
  function targetEl(s, ref){
    var m = /^(tile|pin|press|pic):(\d+)$/.exec(ref || ''); if(!m || !s) return null;
    return (m[1] === 'tile' ? slideTiles(s) : s.querySelectorAll(m[1] === 'pin' ? '.pin' : m[1] === 'pic' ? '[data-pic]' : '[data-press]'))[+m[2] - 1] || null;
  }
  // on the audience screen (and its preview, replaying it): do what clicking it would
  // An image already open gives way: it closes, then the cue's thing opens (a cue for the image
  // that's open leaves it be).
  var openT = 0;
  function openTarget(ref){
    if(ref === 'slide'){ if(!editing && !annotating) resetSlide(); return; }
    var el = targetEl(slides[i], ref); if(!el || editing || annotating) return;
    clearTimeout(openT);
    if(viewer && !viewer.el.hidden){
      if(viewer.from === el) return;
      closeImageViewer();
      openT = setTimeout(function(){ openNow(el); }, 420);       // once it has shrunk back into its tile
      return;
    }
    openNow(el);
  }
  // the "Slide" link: whatever is open on this slide closes the way it would by hand, back to how it lands
  function resetSlide(){
    clearTimeout(openT);
    if(viewer && !viewer.el.hidden) closeImageViewer();
    if(window.Deck) Deck.onReset.forEach(function(fn){ try { fn(slides[i]); } catch(e){ console.error(e); } });
  }
  function openNow(el){
    if(!el.closest('#stage .slide.active')) return;            // the slide changed meanwhile
    if(el.classList.contains('media') && isExpandable(el)){ if(!featureOpen()) expandTile(el); }
    else el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  }
  function runOpen(ref){
    var act = { t: 'open', ref: ref };
    if(PRESENTERWIN) sendInput({ kind: 'req', act: act });           // the audience does it and echoes it to the preview
    else if(AUDIENCE){ applyAct(act); sendInput({ kind: 'echo', act: act }); setTimeout(announceFeature, 50); }
  }
  var nlMenu = null, nlCtx = null;
  function closeNoteLink(){
    if(nlMenu) nlMenu.hidden = true;
    if(nlCtx){ nlCtx.btn.setAttribute('aria-expanded', 'false'); unhint(); }
    nlCtx = null;
  }
  function unhint(){ Array.prototype.forEach.call(document.querySelectorAll('.nl-hint'), function(x){ x.classList.remove('nl-hint'); }); }
  function noteLinks(el, btn, isOn, fire){
    btn.addEventListener('mousedown', function(e){ e.preventDefault(); });   // keep the selection in the notes
    btn.addEventListener('click', function(e){
      e.stopPropagation();
      if(nlCtx && nlCtx.btn === btn){ closeNoteLink(); return; }
      openNoteLink(el, btn, fire);
    });
    // a link in the notes: opens its thing (not while you're editing)
    el.addEventListener('click', function(e){
      var a = e.target.closest && e.target.closest('a[href^="#open:"]'); if(!a) return;
      e.preventDefault();
      if(!isOn()) runOpen(a.getAttribute('href').slice(6));
    });
  }
  function openNoteLink(el, btn, fire){
    closeNoteLink();
    var sel = window.getSelection(), range = sel.rangeCount ? sel.getRangeAt(0) : null;
    if(!range || !el.contains(range.commonAncestorContainer)) range = null;
    var start = range && range.startContainer, a = start ? (start.nodeType === 1 ? start : start.parentNode).closest('a[href^="#open:"]') : null;
    if(a && !el.contains(a)) a = null;
    if(!nlMenu){
      nlMenu = document.createElement('div'); nlMenu.className = 'nl-menu'; nlMenu.setAttribute('role', 'menu'); nlMenu.hidden = true;
      document.body.appendChild(nlMenu); uiAnim(nlMenu, 'pop');
      nlMenu.addEventListener('mousedown', function(e){ e.preventDefault(); });   // the notes keep their selection
    }
    var items = (!range || (range.collapsed && !a)) ? null : openTargets(slides[i]);
    var cur = a ? a.getAttribute('href').slice(6) : null, html = '';
    if(!items) html = '<div class="nl-empty">Select some words in your notes first, then Link.</div>';
    else {
      html = '<div class="nl-head">Open on this slide</div>';
      if(!items.length) html += '<div class="nl-empty">Nothing on this slide opens: add an image, a take-apart, a pin, a clipping or a picture.</div>';
      items.forEach(function(t, k){
        var thumb = t.pin ? '<span class="nl-pin" style="' + (t.pin.style.cssText.match(/--ac[^;]*;?/g) || []).join('') + '">' + t.pin.textContent + '</span>'
          : t.video ? '<span class="nl-thumb nl-vid"></span>'
          : t.press ? '<span class="nl-thumb nl-press">Aa</span>'
          : t.home ? '<span class="nl-thumb nl-home"></span>'
          : '<span class="nl-thumb"' + (t.src ? ' style="background-image:url(&quot;' + escText(busted(t.src)) + '&quot;)"' : '') + '></span>';
        html += '<button type="button" role="menuitemradio" aria-checked="' + (t.ref === cur) + '" data-k="' + k + '">' + thumb +
          '<span class="nl-txt"><b>' + escText(t.kind) + '</b>' + (t.name ? '<span>' + escText(t.name) + '</span>' : '') + '</span></button>';
      });
      if(a) html += '<div class="nl-sep"></div><button type="button" class="nl-rm" data-rm>Remove link</button>';
    }
    nlMenu.innerHTML = html;
    nlCtx = { el: el, btn: btn, range: range && range.cloneRange(), a: a, fire: fire };
    btn.setAttribute('aria-expanded', 'true');
    Array.prototype.forEach.call(nlMenu.querySelectorAll('button[data-k]'), function(b){
      var t = items[+b.dataset.k];
      b.addEventListener('click', function(){ applyNoteLink(t.ref); });
      // point it out on the slide while you hover it (where the slide is on screen)
      b.addEventListener('mouseenter', function(){ unhint(); var x = targetEl(slides[i], t.ref); if(x) x.classList.add('nl-hint'); });
      b.addEventListener('mouseleave', unhint);
    });
    var rm = nlMenu.querySelector('[data-rm]'); if(rm) rm.addEventListener('click', function(){ applyNoteLink(null); });
    nlMenu.hidden = false;
    var r = btn.getBoundingClientRect(), w = nlMenu.offsetWidth, h = nlMenu.offsetHeight;
    nlMenu.style.left = Math.max(12, Math.min(r.right - w, window.innerWidth - w - 12)) + 'px';
    nlMenu.style.top = (r.bottom + 8 + h < window.innerHeight - 12 ? r.bottom + 8 : Math.max(12, r.top - 8 - h)) + 'px';
  }
  function applyNoteLink(ref){
    var c = nlCtx; if(!c) return;
    var host = c.range.startContainer; host = (host.nodeType === 1 ? host : host.parentNode).closest('[contenteditable="true"]') || c.el;
    host.focus();
    var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(c.range);
    if(ref == null){
      if(c.a){ var a = c.a; while(a.firstChild) a.parentNode.insertBefore(a.firstChild, a); a.remove(); }
      else document.execCommand('unlink');
    }
    else if(c.a) c.a.setAttribute('href', '#open:' + ref);
    else document.execCommand('createLink', false, '#open:' + ref);
    c.fire();
    closeNoteLink();
  }
  document.addEventListener('mousedown', function(e){ if(nlCtx && !nlMenu.contains(e.target) && !nlCtx.btn.contains(e.target)) closeNoteLink(); });
  document.addEventListener('keydown', function(e){ if(nlCtx && e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); closeNoteLink(); } }, true);
  // "- ", "* " or "• " at the start of a line becomes a bullet (built by hand: execCommand's list
  // loses the caret on a half-typed line)
  function dashToBullet(root, e){
    if(!/^insert(Text|ReplacementText)$/.test(e.inputType)) return;
    var sel = window.getSelection(); if(!sel.rangeCount) return;
    var n = sel.anchorNode, off = sel.anchorOffset;
    if(!n || n.nodeType !== 3 || n.previousSibling || off < 2 || !/^[-*\u2022][\s\u00a0]/.test(n.nodeValue) || n.parentNode.closest('li')) return;
    n.nodeValue = n.nodeValue.slice(2);
    var block = n.parentNode !== root && n.parentNode.parentNode === root ? n.parentNode : n;
    var li = document.createElement('li'), prev = block.previousSibling, ul;
    while(prev && prev.nodeType === 3 && !prev.nodeValue.trim()) prev = prev.previousSibling;
    if(prev && prev.nodeName === 'UL') ul = prev; else { ul = document.createElement('ul'); root.insertBefore(ul, block); }
    if(block === n) li.appendChild(n); else { while(block.firstChild) li.appendChild(block.firstChild); block.remove(); }
    ul.appendChild(li);
    var rg = document.createRange(); rg.setStart(n, off - 2); rg.collapse(true); sel.removeAllRanges(); sel.addRange(rg);
  }

  function setNotesEditable(on){
    nText.contentEditable = on ? 'true' : 'false';
    notesEl.classList.toggle('editable', on);
    renderNotes();
  }
  function show(n){
    i = Math.max(0, Math.min(slides.length-1, n));
    slides.forEach(function(s,idx){ s.classList.toggle('active', idx===i); s.classList.remove('ann-enter'); });
    // the slide's annotations pop in one after another, so you see where they are
    var cur = slides[i]; if(cur){ void cur.offsetWidth; cur.classList.add('ann-enter'); }
    curEl.textContent = String(i+1).padStart(2,'0');
    secEl.textContent = slides[i].getAttribute('data-label') || '';
    // a slide that fills the frame with a picture (a full-bleed capture or photo) hides the stage's
    // glow and smoke, so moving between two of them never flashes the glow through the crossfade
    stage.classList.toggle('glow-off', coversStage(slides[i]) || !themeOn(slides[i]));
    var tbn = document.getElementById('eb-theme'); if(tbn) tbn.setAttribute('aria-pressed', String(themeOn(slides[i])));
    paintCarBar();
    renderNotes();
    renderPresenter();
    broadcast();
    afterShow();
    hideZoom();
    clearTimeout(openT); if(viewer && !viewer.el.hidden) closeImageViewer();   // an image or video open on the old slide closes
    clearMarks();                                                // presenter boxes fade with the slide
    if(PRESENTERWIN){ var wb = document.getElementById('pres-wipe'); if(wb) wb.hidden = wipeTile(slides[i]) < 0; }
    armAmbient();
    if(window.Deck){ Deck.onShow.forEach(function(fn){ try { fn(slides[i], i); } catch(e){ console.error(e); } }); }
    armCarousels();
    armVideos();
    writeSlug();
  }
  // ---------- renaming a slide: click its name bottom left in Edit mode ----------
  function setLabelEditable(on){
    secEl.contentEditable = on ? 'true' : 'false';
    secEl.spellcheck = false;
    secEl.classList.toggle('lbl-edit', on);
    if(!on && document.activeElement === secEl) secEl.blur();
  }
  function paintLabel(s){
    if(s !== slides[i]) return;
    if(document.activeElement !== secEl) secEl.textContent = s.getAttribute('data-label') || '';
    nK.textContent = s.getAttribute('data-label') || '';
    var pl = document.getElementById('pres-label'); if(pl) pl.textContent = s.getAttribute('data-label') || 'Notes';
  }
  function renameSlide(s, v){
    if(s._sid){                                                  // an annotated screen: its name is the screen's
      var sc = annData.screens.filter(function(x){ return x.id === s._sid; })[0]; if(!sc) return;
      sc.name = v || sc.name;
      s.dataset.label = sc.name;
      var sn = s.querySelector('.screenname'); if(sn) sn.textContent = sc.name;
      saveAnns(); paintLabel(s); return;
    }
    if(s._lkey == null) return;
    s.setAttribute('data-label', v || s._lkey);
    labelOverrides[s._lkey] = v || s._lkey;
    try { localStorage.setItem(NS + 'deck-labels', JSON.stringify(labelOverrides)); } catch(e){}
    var msg = { labelKey: s._lkey, label: v || s._lkey, t: Date.now() };
    try { if(bc) bc.postMessage(msg); } catch(e){}
    try { localStorage.setItem(NS + 'sleek-labelsync', JSON.stringify(msg)); } catch(e){}
    paintLabel(s); writeSlug(); markChanged();
  }
  function applyRemoteLabel(key, v){
    var s = slides.filter(function(x){ return x._lkey === key; })[0]; if(!s) return;
    labelOverrides[key] = v; s.setAttribute('data-label', v); paintLabel(s); markChanged();
  }
  secEl.addEventListener('input', function(){ if(editing && slides[i]) renameSlide(slides[i], secEl.textContent.replace(/\s+/g, ' ').trim()); });
  secEl.addEventListener('keydown', function(e){ if(e.key === 'Enter'){ e.preventDefault(); secEl.blur(); } });
  secEl.addEventListener('blur', function(){ if(slides[i]) secEl.textContent = slides[i].getAttribute('data-label') || ''; });
  window.addEventListener('storage', function(e){ if(e.key===NS + 'sleek-labelsync' && e.newValue){ try { var m = JSON.parse(e.newValue); applyRemoteLabel(m.labelKey, m.label); } catch(_){} } });

  // ---------- grid: every slide as a tile, below the deck ----------
  // The chevron (or G) slides the deck up and the grid up into view; a tile jumps to its slide
  // and the deck slides back down into frame. Esc goes back to the slide you were on.
  var gridEl = document.getElementById('grid'), gridTiles = document.getElementById('grid-tiles'), gridOpen = false, gridT = 0;
  function fitGrid(){
    Array.prototype.forEach.call(gridTiles.querySelectorAll('.gt:not(.gt-add) .gt-shot'), function(sh){
      var cv = sh.firstChild; if(cv) cv.style.transform = 'scale(' + (sh.clientWidth / 1280) + ')';
    });
  }
  function buildGrid(){
    gridTiles.innerHTML = '';
    slides.forEach(function(s, k){
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'gt' + (k === i ? ' current' : ''); b.setAttribute('data-k', k);
      b.style.setProperty('--d', Math.min(k, 16) * 0.03);           // tiles rise in, one after another
      b.innerHTML = '<span class="gt-shot"><span class="pres-canvas gt-canvas glow"></span></span>' +
        '<span class="gt-label"><b>' + String(k + 1).padStart(2, '0') + '</b><span></span></span>';
      b.querySelector('.gt-label span').textContent = s.getAttribute('data-label') || ('Slide ' + (k + 1));
      b.querySelector('.gt-canvas').appendChild(cloneSlide(k));
      if(DECK_ID) b.querySelector('.gt-shot').insertAdjacentHTML('beforeend', '<span class="gt-acts">' +
        '<span class="gt-act" data-act="dup" role="button" title="Duplicate slide" aria-label="Duplicate slide"><svg viewBox="0 0 20 20" aria-hidden="true"><rect x="7" y="7" width="9.5" height="9.5" rx="2"/><path d="M13 7V5a1.5 1.5 0 0 0-1.5-1.5h-6A1.5 1.5 0 0 0 4 5v6.5A1.5 1.5 0 0 0 5.5 13H7"/></svg></span>' +
        (slides.length > 1 ? '<span class="gt-act del" data-act="del" role="button" title="Delete slide" aria-label="Delete slide"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 6h12M8 6V4.5h4V6M6 6l.7 10h6.6L14 6"/></svg></span>' : '') + '</span>');
      // a + after each slide but the last (whose neighbour is the Add a slide tile): the new slide goes right there
      if(DECK_ID && window.Deck && Deck.openAddSlide && k < slides.length - 1) b.insertAdjacentHTML('beforeend', '<span class="gt-ins" data-at="' + (k + 1) + '" role="button" title="Add a slide here" aria-label="Add a slide after ' + (k + 1) + '"><i></i></span>');
      gridTiles.appendChild(b);
    });
    // the last tile adds a slide (features/add-slide.js shows the template picker)
    if(window.Deck && Deck.openAddSlide){
      var add = document.createElement('button');
      add.type = 'button'; add.className = 'gt gt-add'; add.style.setProperty('--d', Math.min(slides.length, 16) * 0.03);
      add.setAttribute('aria-label', 'Add a slide');
      add.innerHTML = '<span class="gt-shot"><span class="gt-plus" aria-hidden="true"><i></i></span><span class="gt-add-k">Add a slide</span></span>' +
        '<span class="gt-label"><b>' + String(slides.length + 1).padStart(2, '0') + '</b><span>New slide</span></span>';
      gridTiles.appendChild(add);
    }
    document.getElementById('grid-count').textContent = slides.length;
    if(window.Deck && Deck.onGrid) Deck.onGrid.forEach(function(fn){ try { fn(gridTiles); } catch(e){ console.error(e); } });
  }
  function openGrid(){
    if(gridOpen || POPOUT || MIRROR || featureOpen()) return;
    if(window.Deck && Deck.closeExpanded) Deck.closeExpanded();
    clearTimeout(gridT); gridOpen = true;
    if(gridDeck) gridDeck.textContent = (window.SLEEK_DECK && SLEEK_DECK.title) || document.title || 'This deck';
    buildGrid(); gridEl.hidden = false; fitGrid();
    var cur = gridTiles.querySelector('.gt.current'); gridEl.scrollTop = 0;
    if(cur) gridEl.scrollTop = Math.max(0, cur.offsetTop - gridEl.clientHeight / 2 + cur.offsetHeight / 2);
    void gridEl.offsetWidth;
    document.body.classList.add('grid-open');
    pauseVideosFor(true);
    setTimeout(function(){ if(gridOpen && cur) cur.focus({ preventScroll: true }); }, 400);
  }
  function closeGrid(k){
    if(!gridOpen) return;
    gridOpen = false;
    if(typeof k === 'number' && k !== i) show(k);
    document.body.classList.remove('grid-open');
    gridT =setTimeout(function(){ gridEl.hidden = true; gridTiles.innerHTML = ''; }, 700);
    pauseVideosFor(false);
  }
  function pauseVideosFor(on){ if(on) Array.prototype.forEach.call(document.querySelectorAll('#stage video'), function(v){ v.pause(); }); else armVideos(); }
  document.getElementById('gridbtn').onclick = function(){ openGrid(); };
  document.getElementById('grid-back').onclick = function(){ closeGrid(); };
  // the breadcrumb: your decks (the same as the bar's Sleek button, which saves first), and this deck
  ['grid-home', 'grid-decks'].forEach(function(id){
    var a = document.getElementById(id); if(!a) return;
    a.addEventListener('click', function(e){ if(e.metaKey || e.ctrlKey || e.shiftKey) return; e.preventDefault(); var h = document.getElementById('homebtn'); if(h) h.click(); });
  });
  var gridDeck = document.getElementById('grid-deck');
  if(gridDeck) gridDeck.onclick = function(){ closeGrid(); };
  gridTiles.addEventListener('click', function(e){
    if(Date.now() - gridDragEnd < 400) return;                 // the end of a drag, not a pick
    var act = e.target.closest('.gt-act'); if(act){ slideAction(act.getAttribute('data-act'), +act.closest('.gt').getAttribute('data-k')); return; }
    var ins = e.target.closest('.gt-ins'); if(ins){ Deck.openAddSlide(ins, +ins.getAttribute('data-at')); return; }
    var add = e.target.closest('.gt-add'); if(add){ Deck.openAddSlide(add); return; }
    var b = e.target.closest('.gt'); if(b) closeGrid(+b.getAttribute('data-k'));
  });
  // ---------- drag a tile to move its slide ----------
  // Press and drag: the tile lifts and follows you, a gap opens where it would land and the other
  // tiles slide over to make room (scrolling the grid near its top and bottom edges). Let go and
  // the slide moves there in the deck. A press that doesn't move is still a click.
  var gdrag = null, gridDragEnd = 0;
  function gridRects(){
    var m = new Map();
    Array.prototype.forEach.call(gridTiles.querySelectorAll('.gt:not(.dragging):not(.gt-add)'), function(t){ m.set(t, t.getBoundingClientRect()); });
    return m;
  }
  function gridSlideFrom(before){                              // the tiles that moved glide from where they were
    before.forEach(function(r, t){
      var n = t.getBoundingClientRect(), dx = r.left - n.left, dy = r.top - n.top;
      if(!dx && !dy) return;
      t.style.transition = 'none'; t.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
      void t.offsetWidth;
      t.style.transition = 'transform 0.32s cubic-bezier(0.2, 0.8, 0.2, 1)'; t.style.transform = '';
    });
  }
  function gridDragTo(x, y){
    var d = gdrag; d.b.style.left = (x - d.ox) + 'px'; d.b.style.top = (y - d.oy) + 'px';
    var over = document.elementFromPoint(x, y), t = over && over.closest('.gt:not(.dragging):not(.gt-add)');
    if(!t || !gridTiles.contains(t)) return;
    var r = t.getBoundingClientRect(), after = x > r.left + r.width / 2;
    function skip(n){ while(n === d.b) n = n.nextSibling; return n; }   // the lifted tile is out of the flow
    var ref = skip(after ? t.nextSibling : t);
    if(ref === d.ph || ref === skip(d.ph.nextSibling)) return;          // the gap is already there
    var before = gridRects();
    gridTiles.insertBefore(d.ph, ref);
    gridSlideFrom(before);
  }
  function gridAutoScroll(){
    if(!gdrag || !gdrag.on) return;
    var edge = 90, y = gdrag.y, h = gridEl.clientHeight, v = y < edge ? -(edge - y) : (y > h - edge ? y - (h - edge) : 0);
    if(v){ gridEl.scrollTop += v * 0.25; gridDragTo(gdrag.x, gdrag.y); }
    gdrag.raf = requestAnimationFrame(gridAutoScroll);
  }
  gridTiles.addEventListener('pointerdown', function(e){
    var b = e.target.closest('.gt:not(.gt-add)'); if(!b || e.button !== 0 || !gridOpen || e.target.closest('.gt-act, .gt-ins')) return;
    // phones: slides move only after Edit at the top of All slides (features/mobile.js)
    if(document.body.classList.contains('compact') && !document.body.classList.contains('grid-editing')) return;
    gdrag = { b: b, id: e.pointerId, sx: e.clientX, sy: e.clientY, x: e.clientX, y: e.clientY, on: false };
  });
  window.addEventListener('pointermove', function(e){
    var d = gdrag; if(!d || e.pointerId !== d.id) return;
    d.x = e.clientX; d.y = e.clientY;
    if(!d.on){
      if(Math.abs(e.clientX - d.sx) + Math.abs(e.clientY - d.sy) < 8) return;
      var r = d.b.getBoundingClientRect();
      d.on = true; d.ox = d.sx - r.left; d.oy = d.sy - r.top;
      d.ph = document.createElement('div'); d.ph.className = 'gt-ph'; d.ph.style.height = r.height + 'px';
      d.ph.innerHTML = '<span class="gt-ph-shot"></span>';
      gridTiles.insertBefore(d.ph, d.b);
      d.b.classList.add('dragging'); d.b.style.width = r.width + 'px';
      document.body.classList.add('gt-sorting');
      d.raf = requestAnimationFrame(gridAutoScroll);
    }
    e.preventDefault();
    gridDragTo(e.clientX, e.clientY);
  });
  function gridDrop(e){
    var d = gdrag; if(!d || (e && e.pointerId !== d.id)) return;
    gdrag = null; cancelAnimationFrame(d.raf);
    if(!d.on) return;
    gridDragEnd = Date.now();
    // the tile settles into the gap from wherever you let go
    var from = d.b.getBoundingClientRect();
    gridTiles.insertBefore(d.b, d.ph); d.ph.remove();
    d.b.classList.remove('dragging'); d.b.style.left = d.b.style.top = d.b.style.width = '';
    document.body.classList.remove('gt-sorting');
    var to = d.b.getBoundingClientRect();
    d.b.style.transition = 'none'; d.b.style.transform = 'translate(' + (from.left - to.left) + 'px,' + (from.top - to.top) + 'px)';
    void d.b.offsetWidth;
    d.b.style.transition = 'transform 0.36s cubic-bezier(0.2, 0.8, 0.2, 1)'; d.b.style.transform = '';
    // the deck takes the grid's new order; tiles are renumbered to match
    var tiles = Array.prototype.slice.call(gridTiles.querySelectorAll('.gt:not(.gt-add)'));
    var keys = tiles.map(function(t){ return slideKey(slides[+t.getAttribute('data-k')]); });
    if(JSON.stringify(keys) === JSON.stringify(slides.map(slideKey))) return;   // dropped where it started
    setOrder(keys);
    tiles.forEach(function(t, k){
      t.setAttribute('data-k', k); t.classList.toggle('current', k === i);
      t.querySelector('.gt-label b').textContent = String(k + 1).padStart(2, '0');
    });
  }
  window.addEventListener('pointerup', gridDrop);
  window.addEventListener('pointercancel', gridDrop);
  window.addEventListener('resize', function(){ if(gridOpen) fitGrid(); });

  function coversStage(s){
    if(!s) return false;
    if(s._screen) return !!s._screen.img;
    if(!s.classList.contains('s-divider') && !s.classList.contains('s-fullimage')) return false;
    var m = s.querySelector(':scope > .media');                 // a divider's background picture
    return !!(m && m.classList.contains('filled'));
  }

  // ---------- the theme on each slide ----------
  // Every slide can show your Theme (gradient, effect, motion) or not: the Theme button in the edit
  // bar. By default it's on, except on slides that fill the frame with a picture. On a plain slide the
  // stage's theme shows through; on a picture slide turned on, a theme layer sits over the picture.
  // Saved like other edits (seed.slideTheme by slide name; screens keep theme on the screen).
  var slideThemeOverrides = {};
  try { slideThemeOverrides = JSON.parse(localStorage.getItem(NS + 'deck-slide-theme') || '{}') || {}; } catch(e){ slideThemeOverrides = {}; }
  function themeSetting(s){
    if(!s) return null;
    if(s._screen) return typeof s._screen.theme === 'boolean' ? s._screen.theme : null;
    if(s._lkey == null) return null;
    if(typeof slideThemeOverrides[s._lkey] === 'boolean') return slideThemeOverrides[s._lkey];
    var sd = SEED.slideTheme || {}; return typeof sd[s._lkey] === 'boolean' ? sd[s._lkey] : null;
  }
  function themeOn(s){ var v = themeSetting(s); return v === null ? !coversStage(s) : v; }
  function refreshSlideThemes(){
    slides.forEach(function(s){
      var want = coversStage(s) && themeOn(s), layer = s.querySelector(':scope > .slide-theme');
      if(want && !layer){
        layer = document.createElement('div'); layer.className = 'slide-theme glow'; layer.setAttribute('data-fx', ''); layer.setAttribute('aria-hidden', 'true');
        var after = s.querySelector(':scope > .scrim') || s.querySelector(':scope > .media');
        if(after && after.nextSibling) s.insertBefore(layer, after.nextSibling); else s.appendChild(layer);
        if(window.GlowFX) GlowFX.mount(layer);
      } else if(!want && layer) layer.remove();
    });
    var cur = slides[i]; if(cur) stage.classList.toggle('glow-off', coversStage(cur) || !themeOn(cur));
    var tb = document.getElementById('eb-theme'); if(tb && cur) tb.setAttribute('aria-pressed', String(themeOn(cur)));
  }
  function setSlideTheme(s, on, fromRemote){
    if(s._screen){ s._screen.theme = on; if(!fromRemote) saveAnns(); }
    else if(s._lkey != null){
      slideThemeOverrides[s._lkey] = on;
      try { localStorage.setItem(NS + 'deck-slide-theme', JSON.stringify(slideThemeOverrides)); } catch(e){}
      if(!fromRemote){
        var msg = { themeKey: s._lkey, on: on, t: Date.now() };
        try { if(bc) bc.postMessage(msg); } catch(e){}
        try { localStorage.setItem(NS + 'sleek-themesync', JSON.stringify(msg)); } catch(e){}
      }
    }
    refreshSlideThemes(); markChanged();
  }
  // the whole theme, again from where it now comes from (after Undo or Redo)
  function repaintTheme(){
    applyTheme(DT.get('mode') === 'light' ? 'light' : 'dark'); applyAccent(DT.get('accent'));
    readGlow(); applyGlow(false); var f = DT.get('font'); applyFont(f ? f.v : 'inter', false);
  }
  function applyRemoteTheme(key, on){ var s = slides.filter(function(x){ return x._lkey === key; })[0]; if(s) setSlideTheme(s, on, true); }
  window.addEventListener('storage', function(e){ if(e.key === NS + 'sleek-themesync' && e.newValue){ try { var m = JSON.parse(e.newValue); applyRemoteTheme(m.themeKey, m.on); } catch(_){} } });
  document.getElementById('eb-theme').onclick = function(){ var s = slides[i]; if(s) setSlideTheme(s, !themeOn(s)); };
  // carousels hold still for 2s after you land on their slide, then start rolling from the beginning,
  // unless their slide's Auto scroll is off (Edit bar): then they stay put until you drag them or use
  // their arrows
  var carT = 0;
  function carAuto(s){ var id = s && s.getAttribute('data-added'), a = id && ADDED.filter(function(x){ return x.id === id; })[0]; return !(a && a.still); }
  function paintCarBar(){
    var g = document.getElementById('eb-carousel'), cur = slides[i], b = document.getElementById('car-auto');
    var on = !!(editing && cur && cur.classList.contains('s-carousel') && cur.getAttribute('data-added'));
    if(g) g.hidden = !on;
    if(b && on){ var auto = carAuto(cur); b.setAttribute('aria-pressed', String(auto)); b.querySelector('.lbl').textContent = auto ? 'Auto scroll' : 'Auto scroll off'; }
  }
  document.getElementById('car-auto').onclick = function(){
    var s = slides[i], id = s && s.getAttribute('data-added'), a = id && ADDED.filter(function(x){ return x.id === id; })[0]; if(!a) return;
    if(a.still) delete a.still; else a.still = true;
    saveAdded(); markChanged(); pingReload(); paintCarBar(); armCarousels();
    showToast(a.still ? 'Auto scroll off: it moves when you drag it or use its arrows' : 'Auto scroll on');
  };
  function armCarousels(){
    clearTimeout(carT);
    Array.prototype.forEach.call(document.querySelectorAll('#stage .s-carousel'), function(sl){
      if(sl.classList.contains('rolling') || !sl.classList.contains('active')){
        sl.classList.remove('rolling'); sl.classList.add('car-reset'); void sl.offsetWidth; sl.classList.remove('car-reset');
      }
    });
    var cur = slides[i];
    if(cur && cur.classList.contains('s-carousel') && carAuto(cur)) carT = setTimeout(function(){ cur.classList.add('rolling'); }, 2000);
  }

  // ---------- URL slugs: every slide has an address, so a refresh or a shared link stays put ----------
  function slugify(t){
    return String(t).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
      .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'slide';
  }
  function slugs(){
    var seen = {};
    return slides.map(function(sl, k){
      var base = slugify(sl.getAttribute('data-label') || ('slide ' + (k + 1))), x = base, n = 2;
      while(seen[x]) x = base + '-' + (n++);
      seen[x] = true; return x;
    });
  }
  function writeSlug(){
    if(POPOUT || MIRROR) return;                              // the presenter window keeps #presenter
    var sl = slugs()[i];
    if(sl && location.hash.slice(1) !== sl){ try { history.replaceState(null, '', '#' + sl); } catch(e){} }   // no history spam
  }
  function slideFromHash(){
    var h = decodeURIComponent(location.hash.slice(1));
    return (!h || h === 'presenter') ? -1 : slugs().indexOf(h);
  }
  window.addEventListener('hashchange', function(){ var k = slideFromHash(); if(k >= 0 && k !== i) show(k); });
  function next(){ show(i+1); }
  function prev(){ show(i-1); }

  // while a take-apart is open, clicks never move the deck: close it first
  function featureOpen(){ return !!(window.Deck && Deck.modal); }
  // the Next chevron on the last slide asks whether to start the deck over
  document.getElementById('next').onclick = function(){
    if(featureOpen()) return;
    if(i >= slides.length - 1 && slides.length > 1) askStartOver(); else next();
  };
  function askStartOver(){
    if(document.querySelector('.so-back')) return;
    var prevFocus = document.activeElement, el = document.createElement('div');
    el.className = 'so-back';
    el.innerHTML = '<div class="so-box" role="alertdialog" aria-modal="true" aria-labelledby="so-h" aria-describedby="so-p">' +
      '<div class="so-k">End of the deck \u00b7 ' + slides.length + ' of ' + slides.length + '</div>' +
      '<h2 class="so-h" id="so-h">Start the deck over?</h2>' +
      '<p class="so-p" id="so-p">This is the last slide. Go back to the first one and run it again from the top.</p>' +
      '<div class="so-acts"><button type="button" class="so-btn yes" data-v="yes">' +
        '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4.5 10a5.5 5.5 0 1 0 1.8-4.1"/><path d="M4.5 3.5v3.2h3.2"/></svg>Start over</button>' +
      '<button type="button" class="so-btn no" data-v="no">Stay here</button></div></div>';
    document.body.appendChild(el);
    Deck.modal = true;
    requestAnimationFrame(function(){ requestAnimationFrame(function(){ el.classList.add('in'); }); });
    setTimeout(function(){ var y = el.querySelector('.yes'); if(y) y.focus({ preventScroll: true }); }, 30);
    function done(go){
      if(!el) return;
      var node = el; el = null;
      document.removeEventListener('keydown', onKey, true);
      Deck.modal = false;
      node.classList.remove('in'); node.classList.add('out');
      setTimeout(function(){ node.remove(); }, 300);
      if(go) show(0);
      else if(prevFocus && prevFocus.focus) prevFocus.focus({ preventScroll: true });
    }
    function onKey(e){
      if(e.key === 'Escape'){ e.preventDefault(); e.stopImmediatePropagation(); done(false); return; }
      if(e.key === 'Tab'){                                   // focus stays in the box
        var bs = el.querySelectorAll('button'), a = bs[0], z = bs[bs.length - 1];
        if(e.shiftKey && document.activeElement === a){ e.preventDefault(); z.focus(); }
        else if(!e.shiftKey && document.activeElement === z){ e.preventDefault(); a.focus(); }
        return;
      }
      if(e.key !== 'Enter' && e.key !== ' ') e.stopImmediatePropagation();   // the deck underneath stays put
    }
    document.addEventListener('keydown', onKey, true);
    el.addEventListener('click', function(e){
      if(e.target === el){ done(false); return; }
      var b = e.target.closest('[data-v]'); if(b) done(b.getAttribute('data-v') === 'yes');
    });
  }
  document.getElementById('prev').onclick = function(){ if(!featureOpen()) prev(); };
  // The left/right edge zones turn slides, but an annotation (or its open note) underneath wins.
  var ANNOT_SEL = '#stage .slide.active .pin, #stage .slide.active .abox, #stage .slide.active .aarrow, ' +
                  '#stage .slide.active .aarrow-tag, #stage .slide.active .callout:not([hidden]), #stage .slide.active .adel';
  function annotationAt(x, y){
    var els = document.elementsFromPoint(x, y);
    for(var k = 0; k < els.length; k++){
      var el = els[k];
      if(el.classList && el.classList.contains('zone')) continue;
      var hit = el.closest && el.closest(ANNOT_SEL);
      if(hit) return hit;
    }
    return null;
  }
  // the words under the pointer on the slide on screen, seen through the edge zones
  function textAt(x, y){
    var els = document.elementsFromPoint(x, y);
    for(var k = 0; k < els.length; k++){
      var el = els[k]; if(el.classList && el.classList.contains('zone')) continue;
      var t = el.closest && el.closest('#stage .slide.active [data-eid]'); if(t) return t;
    }
    return null;
  }
  var zoneT = 0;
  function zoneClick(e, fallback){
    if(featureOpen()) return;
    // over words, a click waits a beat: a double-click there starts editing instead of turning twice
    if(!editing && textAt(e.clientX, e.clientY)){
      clearTimeout(zoneT);
      if(e.detail < 2) zoneT = setTimeout(function(){ if(!editing) fallback(); }, 260);
      return;
    }
    var tileHit = expandableTileAt(e.clientX, e.clientY); if(tileHit){ expandTile(tileHit); return; }
    var hit = annotationAt(e.clientX, e.clientY);
    if(hit){
      // hand the click to the exact element under the pointer (a thumbnail inside a note, say), not just the note
      var under = document.elementsFromPoint(e.clientX, e.clientY).filter(function(el){ return !(el.classList && el.classList.contains('zone')) && hit.contains(el); })[0] || hit;
      under.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: e.clientX, clientY: e.clientY })); return;
    }
    fallback();
  }
  document.getElementById('znext').onclick = function(e){ zoneClick(e, next); };
  document.getElementById('zprev').onclick = function(e){ zoneClick(e, prev); };
  Array.prototype.forEach.call(document.querySelectorAll('.zone'), function(z){
    z.addEventListener('dblclick', function(e){ var t = textAt(e.clientX, e.clientY); if(t){ clearTimeout(zoneT); editAt(e, t); } });
  });
  // over an annotation, step the zones aside so hover states and clicks land directly
  var annotRaf = 0, annotPt = null;
  document.addEventListener('mousemove', function(e){
    annotPt = { x: e.clientX, y: e.clientY };
    if(annotRaf) return;
    annotRaf = requestAnimationFrame(function(){
      annotRaf = 0;
      var over = !!(annotPt && annotationAt(annotPt.x, annotPt.y));
      document.body.classList.toggle('over-annot', over);
    });
  });

  var notesOpen = false;
  function toggleNotes(){
    notesOpen = !notesOpen;
    notesEl.classList.toggle('open', notesOpen);
    document.body.classList.toggle('notes-open', notesOpen);
    document.getElementById('notesbtn').setAttribute('aria-pressed', String(notesOpen));
  }
  document.getElementById('notesbtn').onclick = toggleNotes;

  // annotation layer (shown by default; A hides / shows it)
  var annotOn = true;
  function toggleAnnot(){
    annotOn = !annotOn;
    document.body.classList.toggle('annot-off', !annotOn);
    if(!annotOn){
      Array.prototype.forEach.call(document.querySelectorAll('.callout'), function(c){ c.hidden = true; });
      Array.prototype.forEach.call(document.querySelectorAll('.abox.spot'), function(b){ b.classList.remove('spot'); });
    }
    broadcast();
  }
  Array.prototype.forEach.call(document.querySelectorAll('.pin'), function(p){
    p.onclick = function(ev){ ev.stopPropagation(); var c = document.getElementById(p.dataset.callout); if(c) c.hidden = !c.hidden; };
  });

  // ---- presenter view (this window only) ----
  var presenterEl = document.getElementById('presenter');
  // presenter notes are editable too (Edit notes), with the same formatting bar; edits save and sync
  var presEditing = false, presShown = -1;
  var presNText = document.getElementById('pres-ntext'), presEditBtn = document.getElementById('pres-edit');
  function setPresEditing(on){
    presEditing = on;
    presNText.contentEditable = on ? 'true' : 'false';
    presNText.closest('.pres-notes').classList.toggle('editing', on);
    presEditBtn.setAttribute('aria-pressed', String(on));
    presEditBtn.querySelector('.lbl').textContent = on ? 'Done editing' : 'Edit notes';
    presShown = -1; renderPresenter();
    if(on){ presNText.focus(); var r = document.createRange(); r.selectNodeContents(presNText); r.collapse(false); var sl = window.getSelection(); sl.removeAllRanges(); sl.addRange(r); }
  }
  presEditBtn.addEventListener('click', function(){ setPresEditing(!presEditing); });
  notesEditor(presNText, document.getElementById('pres-fmt'), function(){ return presEditing; });
  // layout: notes on the left (read from the middle of your screen) or the right, and a draggable
  // divider between them; both remembered on this device
  var presMain = document.getElementById('pres-main'), presSplitEl = document.getElementById('pres-split');
  var presSwap = true, presSplit = 0.5;                     // presSplit = the preview's share of the width
  try { presSwap = localStorage.getItem('pres-swap') !== '0'; var ps = parseFloat(localStorage.getItem('pres-split')); if(ps > 0) presSplit = ps; } catch(e){}
  function layoutPres(){
    var p = Math.max(0.24, Math.min(0.76, presSplit));
    var now = 'minmax(0, ' + p + 'fr)', notes = 'minmax(0, ' + (1 - p) + 'fr)';
    presMain.classList.toggle('notes-left', presSwap);
    presMain.style.gridTemplateColumns = presSwap ? notes + ' 28px ' + now : now + ' 28px ' + notes;
    fitShots();
  }
  document.getElementById('pres-swap').onclick = function(){
    presSwap = !presSwap; try { localStorage.setItem('pres-swap', presSwap ? '1' : '0'); } catch(e){} layoutPres();
  };
  presSplitEl.addEventListener('pointerdown', function(e){
    e.preventDefault(); presSplitEl.setPointerCapture(e.pointerId); document.body.classList.add('pres-sizing');
    function move(ev){
      var r = presMain.getBoundingClientRect(), left = (ev.clientX - r.left) / r.width;
      presSplit = presSwap ? 1 - left : left; presSplit = Math.max(0.24, Math.min(0.76, presSplit)); layoutPres();
    }
    function up(){
      presSplitEl.removeEventListener('pointermove', move); presSplitEl.removeEventListener('pointerup', up); presSplitEl.removeEventListener('pointercancel', up);
      document.body.classList.remove('pres-sizing'); try { localStorage.setItem('pres-split', String(presSplit)); } catch(e){}
    }
    presSplitEl.addEventListener('pointermove', move); presSplitEl.addEventListener('pointerup', up); presSplitEl.addEventListener('pointercancel', up);
  });
  presSplitEl.addEventListener('dblclick', function(){ presSplit = 0.5; try { localStorage.removeItem('pres-split'); } catch(e){} layoutPres(); });
  document.getElementById('pres-total').textContent = slides.length;
  function slideTitle(idx){
    if(idx < 0 || idx >= slides.length) return '—';
    var s = slides[idx];
    var h = s.querySelector('.display');
    return (h && h.textContent.trim()) || s.getAttribute('data-label') || ('Slide ' + (idx+1));
  }
  function renderPresenter(){
    document.getElementById('pres-cur').textContent = i+1;
    document.getElementById('pres-next-title').textContent = (i+1 < slides.length) ? slideTitle(i+1) : 'End of deck';
    document.getElementById('pres-label').textContent = slides[i].getAttribute('data-label') || 'Notes';
    var pn = document.getElementById('pres-ntext');
    // don't pull the text out from under the caret while it's being edited
    if(!(presEditing && pn.contains(document.activeElement) && presShown === i)){
      var pns = notesSet(slides[i]);
      if(pns) paintAnnNotes(pn, pns, presEditing);
      else { pn.classList.remove('an-notes'); pn.contentEditable = presEditing ? 'true' : 'false'; pn.innerHTML = (slides[i] && slides[i]._notes) || (presEditing ? '' : '<p>(no notes yet)</p>'); }
    }
    if(presShown !== i) pn.scrollTop = 0;                       // a new slide's notes start at the top
    presShown = i;
    if(PRESENTERWIN){ mountMirror(); paintShot('pres-next-canvas', i+1); fitShots(); }
  }
  // live slide previews for the presenter window: a clone of the real slide, scaled to fit
  function paintShot(id, idx){
    var host = document.getElementById(id); if(!host) return;
    host.innerHTML = '';
    if(idx >= slides.length){ host.innerHTML = '<div class="pres-end">End of deck</div>'; return; }
    host.appendChild(cloneSlide(idx));
  }
  // a still copy of a slide for previews (presenter's up next, the grid): no ids, nothing live
  function cloneSlide(idx){ return stillCopy(slides[idx].cloneNode(true)); }
  // a template as it looks in the deck, for the picker: its pictures painted, its films as stills
  function templatePreview(key, extra){
    var t = templateBy(key); if(!t) return null;
    var d = document.createElement('div'); d.innerHTML = t.html;
    var c = d.firstElementChild, n = c.querySelector('template.slide-notes'); if(n) n.remove();
    if(window.SleekData) SleekData.build(c, extra || null);          // a chart, in the version asked for
    if(window.SleekTaskSlide) SleekTaskSlide.build(c, extra || null); // tasks, as a board or a list
    var board = window.SleekCollage && SleekCollage.build(c, null);   // a moodboard, laid out as it would be on the slide
    if(board) SleekCollage.place(board, SleekCollage.NOMINAL.W, SleekCollage.NOMINAL.H, 'fit');
    Array.prototype.forEach.call(c.querySelectorAll('.media[data-default-src]'), function(m){
      var src = m.getAttribute('data-default-src'), pos = (m.getAttribute('data-bg-pos') || 'center top') + '/cover no-repeat url("';
      if(isVideo(src)){ m.classList.add('sample-film'); stillFor(src, function(url){ m.style.background = 'center / cover no-repeat url("' + url + '")'; }); }
      else m.style.background = pos + sampleTint(src, function(u){ m.style.background = pos + u + '")'; }) + '")';   // in the deck's accent
      m.classList.add('filled');
    });
    return stillCopy(c);
  }
  function stillCopy(c){
    c.classList.add('active'); c.classList.remove('rolling', 'ann-enter');   // previews sit still: no entrance
    c.removeAttribute('id');
    Array.prototype.forEach.call(c.querySelectorAll('[id],[data-eid],[data-mid],[contenteditable]'), function(el){
      el.removeAttribute('id'); el.removeAttribute('data-eid'); el.removeAttribute('data-mid'); el.removeAttribute('contenteditable');
    });
    Array.prototype.forEach.call(c.querySelectorAll('.media-clear, .car-add, .media-sizer, iframe, .size-handle, .tx-del, .screen-replace, .cl-opt, .fl-bar, .fl-h, .fl-guide'), function(el){ el.remove(); });
    // a still from a couple of seconds in, as the video's poster: a preview never loads the video itself
    Array.prototype.forEach.call(c.querySelectorAll('video'), function(v){
      var src = vsrc(v).split('#')[0];
      v.removeAttribute('autoplay'); v.removeAttribute('src'); v.removeAttribute('data-src'); v.preload = 'none'; v.muted = true;
      v.classList.add('on');                                    // a background film shows at once, not after a fade
      if(src) stillFor(src, function(url){ v.poster = url; });
    });
    return c;
  }
  function mountMirror(){
    var host = document.getElementById('pres-canvas');
    if(!host || host.querySelector('iframe')) return;
    host.innerHTML = '<iframe class="pres-mirror" src="' + location.pathname.split('/').pop() + (location.search ? location.search + '&' : '?') + 'mirror=1" title="Live preview of the audience screen"></iframe>';
  }
  function fitShots(){
    Array.prototype.forEach.call(document.querySelectorAll('.pres-shot'), function(shot){
      var cv = shot.querySelector('.pres-canvas'); if(cv) cv.style.transform = 'scale(' + (shot.clientWidth / 1280) + ')';
    });
  }
  window.addEventListener('resize', function(){ if(PRESENTERWIN) fitShots(); });
  // Present opens the presenter console in its own window; this window stays the audience deck.
  function openPresenter(){
    broadcast();                                              // so the presenter opens on this slide
    var w = null;
    try { w = window.open(location.href.split('#')[0] + '#presenter', 'sleek-presenter', 'width=1200,height=760'); } catch(e){}
    if(w){ try { w.focus(); } catch(e){} watchPresenter(w); }
    else { var b = document.getElementById('presentbtn'); b.setAttribute('data-tip', 'Allow pop-ups'); setTimeout(function(){ b.removeAttribute('data-tip'); }, 2500); }
  }
  if(PRESENTERWIN){
    presenterEl.hidden = false;
    document.getElementById('pres-exit').textContent = 'Close window';
    document.getElementById('pres-exit').onclick = function(){ window.close(); };
    // (the live preview passes clicks to the audience instead of advancing)
    document.getElementById('pres-next-shot').onclick = function(){ next(); };
    layoutPres();
  }
  // the bar's icons show their name in a tooltip (data-tt) instead of the browser's slow title
  // (just the name: shortcut keys stay out of it)
  var TT = { homebtn: 'Your decks', presentbtn: 'Present', notesbtn: 'Notes', editbtn: 'Edit', 'accent-dot': 'Theme', full: 'Fullscreen', gridbtn: 'All slides' };
  Object.keys(TT).forEach(function(id){ var b = document.getElementById(id); if(b){ b.setAttribute('data-tt', TT[id]); b.removeAttribute('title'); } });
  document.getElementById('presentbtn').onclick = openPresenter;
  // back to your decks (the start screen), once this deck is saved
  document.getElementById('homebtn').onclick = function(){ flushSave().then(function(){ location.href = 'slides.html'; }); };
  // the pointer in the window's top-left corner fades in a Back button to your decks
  if(!POPOUT && !MIRROR && !(window.SLEEK_DECK && SLEEK_DECK.published)){
    var deckBack = document.createElement('button');
    deckBack.type = 'button'; deckBack.className = 'deck-back'; deckBack.setAttribute('aria-label', 'Back to your decks');
    deckBack.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M12.5 4.5 7 10l5.5 5.5"/></svg><span>Decks</span>';
    deckBack.onclick = function(){ document.getElementById('homebtn').click(); };
    document.body.appendChild(deckBack);
    var backOn = false;
    var backShow = function(on){ if(on !== backOn){ backOn = on; deckBack.classList.toggle('on', on); } };
    document.addEventListener('mousemove', function(e){
      var b = document.body.classList;
      backShow(e.clientX < (backOn ? 200 : 120) && e.clientY < (backOn ? 140 : 96) && !b.contains('grid-open') && !b.contains('annotating') && !D_modal());
    }, { passive: true });
    document.documentElement.addEventListener('mouseleave', function(){ backShow(false); });
  }
  function D_modal(){ return !!(window.Deck && Deck.modal); }
  document.getElementById('pres-prev').onclick = prev;
  document.getElementById('pres-next').onclick = next;

  // clock + elapsed timer
  var timerStart = Date.now();
  function two(n){ return String(n).padStart(2,'0'); }
  function tick(){
    var now = new Date();
    var h = now.getHours() % 12 || 12;                          // 12-hour clock
    document.getElementById('pres-clock').textContent = h + ':' + two(now.getMinutes()) + ' ' + (now.getHours() < 12 ? 'AM' : 'PM');
    var s = Math.floor((Date.now() - timerStart)/1000);
    document.getElementById('pres-timer').textContent = two(Math.floor(s/60)) + ':' + two(s%60);
  }
  document.getElementById('pres-reset').onclick = function(){ timerStart = Date.now(); tick(); };
  setInterval(tick, 1000); tick();

  // ---- sync across windows (presenter window <-> audience window), same origin ----
  var bc = null;
  try { bc = new BroadcastChannel(NS + 'sleek'); } catch(e){}
  var suppress = false;
  function broadcast(){
    if(suppress || MIRROR) return;                            // the mirror only ever follows
    var msg = { i: i, annot: annotOn, t: Date.now() };
    try { if(bc) bc.postMessage(msg); } catch(e){}
    try { localStorage.setItem(NS + 'sleek-sync', JSON.stringify(msg)); } catch(e){}
  }
  function onRemote(msg){
    if(!msg) return;
    if(msg.reload){ location.reload(); return; }
    if(msg.steps){ paintSteps(); return; }
    if(msg.anns){ reloadAnns(); return; }
    if(msg.media){ reloadMedia(); return; }
    if(msg.order){ reloadOrder(); return; }
    if(msg.textEid != null){ applyRemoteText(msg.textEid, msg.textHtml); return; }
    if(msg.styleEid != null){ applyRemoteStyle(msg.styleEid, msg.style); return; }
    if(msg.noteSlide != null){ applyRemoteNote(msg.noteSlide, msg.noteHtml); return; }
    if(msg.labelKey != null){ applyRemoteLabel(msg.labelKey, msg.label); return; }
    if(msg.themeKey != null){ applyRemoteTheme(msg.themeKey, msg.on); return; }
    suppress = true;
    if(typeof msg.i === 'number' && msg.i !== i){ show(msg.i); }
    if(typeof msg.annot === 'boolean' && msg.annot !== annotOn){ toggleAnnot(); }
    suppress = false;
  }
  if(bc){ bc.onmessage = function(e){ onRemote(e.data); }; }
  window.addEventListener('storage', function(e){ if(e.key===NS + 'sleek-sync' && e.newValue){ try { onRemote(JSON.parse(e.newValue)); } catch(_){} } });
  window.addEventListener('storage', function(e){ if(e.key===NS + 'sleek-textsync' && e.newValue){ try { var m = JSON.parse(e.newValue); applyRemoteText(m.eid, m.html); } catch(_){} } });
  window.addEventListener('storage', function(e){ if(e.key===NS + 'sleek-reload' && e.newValue){ location.reload(); } });
  // tell the other windows of this deck (the presenter, its preview) to load the page again
  function pingReload(){
    try { if(bc) bc.postMessage({ reload: true }); } catch(e){}
    try { localStorage.setItem(NS + 'sleek-reload', String(Date.now())); } catch(e){}
  }
  window.addEventListener('storage', function(e){ if(e.key===NS + 'sleek-notesync' && e.newValue){ try { var m = JSON.parse(e.newValue); applyRemoteNote(m.noteSlide, m.noteHtml); } catch(_){} } });
  window.addEventListener('storage', function(e){ if(e.key===NS + 'sleek-stylesync' && e.newValue){ try { var m = JSON.parse(e.newValue); applyRemoteStyle(m.eid, m.style); } catch(_){} } });

  document.addEventListener('keydown', function(e){
    if(/^(INPUT|TEXTAREA|SELECT)$/.test(e.target && e.target.tagName)) return;
    if(e.target && e.target.isContentEditable){ if(e.key==='Escape'){ e.target.blur(); if(editing && e.target.closest('#stage [data-eid]')) leaveText(); } return; }
    if(gridOpen){                                              // the grid takes Esc / G; tiles are buttons (Tab, Enter)
      if(e.key==='Escape' || e.key==='g' || e.key==='G'){ e.preventDefault(); closeGrid(); }
      return;
    }
    if(window.Deck && Deck.modal) return;
    if(['ArrowRight','PageDown',' '].indexOf(e.key)>-1){ e.preventDefault(); next(); }
    else if(['ArrowLeft','PageUp'].indexOf(e.key)>-1){ e.preventDefault(); prev(); }
    else if(e.key==='Home'){ show(0); }
    else if(e.key==='End'){ show(slides.length-1); }
    else if(e.key==='n'||e.key==='N'){ if(!POPOUT) toggleNotes(); }
    else if(editing && !e.metaKey && !e.ctrlKey && (e.key==='p'||e.key==='P')){ setTool(addingNote ? null : 'pin'); }
    else if(editing && !e.metaKey && !e.ctrlKey && (e.key==='a'||e.key==='A')){ setTool(drawTool === 'arrow' ? null : 'arrow'); }
    else if(e.key==='a'||e.key==='A'){ toggleAnnot(); }
    else if(e.key==='p'||e.key==='P'){ if(!POPOUT) openPresenter(); }
    else if(e.key==='e'||e.key==='E'){ if(!POPOUT) toggleEdit(); }
    else if(e.key==='t'||e.key==='T'){ toggleTheme(); }
    else if(e.key==='h'||e.key==='H'){ if(!POPOUT && !PUBLISHED) flushSave().then(function(){ location.href = 'slides.html'; }); }
    else if(e.key==='f'||e.key==='F'){ toggleFull(); }
    else if(e.key==='g'||e.key==='G'){ if(!e.metaKey && !e.ctrlKey) openGrid(); }
  });

  // the slide fits above the bottom bar, which sits on its own solid strip (windows without the bar,
  // like the presenter's preview, use the whole height)
  var barEl = document.getElementById('bar'), viewportEl = document.getElementById('viewport');
  // The edit bar takes the bottom bar's row when it fits beside the slide's name (the bar's other
  // buttons step aside while editing); when it doesn't, it sits just above, and the slide moves up
  // so nothing covers it. Returns the room it needs above the bottom bar.
  function placeEditbar(){
    var eb = document.getElementById('editbar'), b = document.body; if(!eb) return 0;
    if(eb.hidden || !barEl || getComputedStyle(barEl).display === 'none'){ b.classList.remove('eb-docked'); return 0; }
    b.classList.remove('eb-docked'); eb.style.right = eb.style.bottom = '';             // measured as it floats
    var compact = b.classList.contains('compact') || b.classList.contains('notes-open');
    var lab = document.getElementById('seclabel'), notes = document.getElementById('notesbtn');
    var left = lab && lab.offsetParent ? lab.getBoundingClientRect().right : 0, right = notes && notes.offsetParent ? notes.getBoundingClientRect().left : window.innerWidth - 22;
    var w = eb.offsetWidth, h = eb.offsetHeight;
    if(!compact && w <= right - left - 44 && h < 60){
      b.classList.add('eb-docked');
      eb.style.right = Math.round(window.innerWidth - right + 12) + 'px'; eb.style.bottom = Math.max(4, Math.round((barEl.offsetHeight - h) / 2)) + 'px';
      return 0;
    }
    return h + 12;
  }
  // the bar's groups come and go with the slide and what is selected: it finds its place again each time its size changes
  if(window.ResizeObserver){ var ebRO = document.getElementById('editbar'); if(ebRO) new ResizeObserver(function(){ if(!ebRO.hidden) fit(); }).observe(ebRO); }
  var fitBusy = false;
  function fit(){
    if(fitBusy) return; fitBusy = true;
    var bh = barEl && getComputedStyle(barEl).display !== 'none' ? barEl.offsetHeight : 0;
    try { bh += placeEditbar(); } catch(e){}
    fitBusy = false;
    bh += (window.Deck && Deck.inset) || 0;                    // a panel open under the slide (features/data-slides.js)
    viewportEl.style.bottom = bh + 'px';
    var s = Math.min(window.innerWidth/1280, (window.innerHeight - bh)/720);
    stage.style.transform = 'translate(-50%,-50%) scale('+s+')';
  }
  window.addEventListener('resize', fit); fit();

  // The theme (mode, accent, the glow, the slide font) is saved with the deck: theme-boot.js reads your
  // change made here, else the seed, else the default. Changing something here records it as a change
  // (save=true), which saves into the seed.
  var DT = window.DeckTheme;
  function applyTheme(t, save){
    if(t==='dark'){ document.documentElement.setAttribute('data-theme','dark'); }
    else { document.documentElement.removeAttribute('data-theme'); }
    if(save){ DT.set('mode', t); markChanged(); }
    var mt = document.getElementById('tp-mode-t'); if(mt) mt.textContent = t === 'dark' ? 'Dark' : 'Light';
  }
  function currentTheme(){ return document.documentElement.getAttribute('data-theme')==='dark' ? 'dark' : 'light'; }
  function toggleTheme(){ applyTheme(currentTheme()==='dark' ? 'light' : 'dark', true); }
  document.getElementById('theme').onclick = toggleTheme;
  applyTheme(DT.get('mode') === 'light' ? 'light' : 'dark');

  // accent: one dot showing the current color; click it for the swatches
  var sws = Array.prototype.slice.call(document.querySelectorAll('.sw'));
  var accentDot = document.getElementById('accent-dot'), swatchesEl = document.getElementById('swatches');
  function setSwatchesOpen(open){ swatchesEl.hidden = !open; accentDot.setAttribute('aria-expanded', String(open)); }
  function applyAccent(hex, save){
    document.documentElement.style.setProperty('--accent', hex);
    sws.forEach(function(b){ b.setAttribute('aria-pressed', String(b.dataset.accent===hex)); });
    if(save){ DT.set('accent', hex); markChanged(); }
    paintThemeSummary();
  }
  sws.forEach(function(b){ b.onclick = function(){ applyAccent(b.dataset.accent, true); }; });   // the menu stays open to keep tuning
  accentDot.onclick = function(ev){ ev.stopPropagation(); setSwatchesOpen(swatchesEl.hidden); };
  document.addEventListener('click', function(ev){ if(!swatchesEl.hidden && !ev.target.closest('.accent-pick')) setSwatchesOpen(false); });
  document.addEventListener('keydown', function(ev){ if(ev.key==='Escape' && !swatchesEl.hidden) setSwatchesOpen(false); });
  applyAccent(DT.get('accent'));

  // ---------- the glow: style, colors, motion (glow.css does the drawing) ----------
  var GLOW_STYLES = [{ v: 'aurora', n: 'Aurora' }, { v: 'horizon', n: 'Horizon' }, { v: 'corners', n: 'Corners' }, { v: 'spotlight', n: 'Spotlight' }, { v: 'none', n: 'None' }];
  // each palette's dot: its left and right bloom colors
  var GLOW_COLORS = [{ v: 'dusk', n: 'Dusk', c: ['#7E9CFF', '#FF8EE0'] }, { v: 'ember', n: 'Ember', c: ['#FFB270', '#FF7092'] },
    { v: 'ocean', n: 'Ocean', c: ['#6ECCFF', '#7C8CFF'] }, { v: 'verdant', n: 'Verdant', c: ['#76E6BC', '#7CCCFF'] },
    { v: 'gold', n: 'Gold', c: ['#FFD678', '#FF9E76'] }, { v: 'accent', n: 'From accent', c: null }];
  var glow = {};
  function readGlow(){ glow.style = DT.get('glow'); glow.color = DT.get('glowColor'); glow.motion = DT.get('motion') === 'on'; glow.fx = DT.get('fx'); glow.fxo = DT.get('fxo'); }
  readGlow();
  var stylesEl = document.getElementById('tp-styles'), colorsEl = document.getElementById('tp-colors'), motionEl = document.getElementById('tp-motion'), fxEl = document.getElementById('tp-fx');
  var fxoEl = document.getElementById('tp-fxo'), fxoV = document.getElementById('tp-v-fxo');
  stylesEl.innerHTML = GLOW_STYLES.map(function(o){
    return '<button type="button" class="tp-style" data-v="' + o.v + '" aria-label="' + o.n + '"><span class="tp-prev glow" data-glow="' + o.v + '"></span><span>' + o.n + '</span></button>';
  }).join('');
  colorsEl.innerHTML = GLOW_COLORS.map(function(o){
    var bg = o.c ? 'linear-gradient(135deg,' + o.c[0] + ' 20%,' + o.c[1] + ' 80%)' : 'conic-gradient(from 210deg, var(--accent), color-mix(in oklab, var(--accent) 50%, #ff8ad8), var(--accent))';
    return '<button type="button" class="tp-gc" data-v="' + o.v + '" title="' + o.n + '" aria-label="' + o.n + '" style="background:' + bg + '"></button>';
  }).join('');
  function applyGlow(save){
    var de = document.documentElement;
    de.setAttribute('data-glow', glow.style); de.setAttribute('data-glow-color', glow.color);
    if(glow.motion) de.setAttribute('data-glow-motion', 'on'); else de.removeAttribute('data-glow-motion');
    de.setAttribute('data-glow-fx', glow.fx);
    var fxo = Math.max(0, Math.min(100, parseFloat(glow.fxo))); if(isNaN(fxo)) fxo = 50;
    de.style.setProperty('--fx-k', String(fxo / 50));
    fxoEl.value = fxo; fxoEl.style.setProperty('--fill', fxo + '%'); fxoV.textContent = fxo + '%';
    fxoEl.disabled = glow.style === 'none' || glow.fx === 'none';
    Array.prototype.forEach.call(stylesEl.children, function(b){ b.setAttribute('aria-pressed', String(b.dataset.v === glow.style)); });
    Array.prototype.forEach.call(colorsEl.children, function(b){ b.setAttribute('aria-pressed', String(b.dataset.v === glow.color)); b.disabled = glow.style === 'none'; });
    motionEl.setAttribute('aria-checked', String(glow.motion)); motionEl.disabled = glow.style === 'none';
    Array.prototype.forEach.call(fxEl.children, function(b){ b.setAttribute('aria-checked', String(b.dataset.v === glow.fx)); b.disabled = glow.style === 'none'; });
    paintThemeSummary();
    if(save){ DT.set('glow', glow.style); DT.set('glowColor', glow.color); DT.set('motion', glow.motion ? 'on' : 'off'); DT.set('fx', glow.fx); DT.set('fxo', String(glow.fxo)); markChanged(); }
  }
  stylesEl.addEventListener('click', function(e){ var b = e.target.closest('.tp-style'); if(b){ glow.style = b.dataset.v; applyGlow(true); } });
  colorsEl.addEventListener('click', function(e){ var b = e.target.closest('.tp-gc'); if(b && !b.disabled){ glow.color = b.dataset.v; applyGlow(true); } });
  motionEl.onclick = function(){ glow.motion = !glow.motion; applyGlow(true); };
  fxEl.addEventListener('click', function(e){ var b = e.target.closest('[data-v]'); if(b && !b.disabled){ glow.fx = b.dataset.v; applyGlow(true); } });
  // the effect's opacity: it shows as you drag, and saves (as one step) when you let go
  fxoEl.addEventListener('input', function(){ glow.fxo = fxoEl.value; applyGlow(false); });
  fxoEl.addEventListener('change', function(){ glow.fxo = fxoEl.value; applyGlow(true); });
  applyGlow(false);
  // ---------- slide fonts: a display face for headings, a body face for the rest ----------
  // Only the slides (and their previews) change; the deck's controls stay in Inter. Each pair's
  // sheet loads when you pick it; the menu's "Aa" samples load just those two letters.
  var SANS = ', -apple-system, BlinkMacSystemFont, system-ui, sans-serif', GF = 'https://fonts.googleapis.com/css2?';
  var FONTS = [
    { v: 'inter', n: 'Inter', d: '"Inter"' + SANS, b: '"Inter"' + SANS, href: '' },
    { v: 'geist', n: 'Geist', d: '"Geist"' + SANS, b: '"Geist"' + SANS, href: GF + 'family=Geist:wght@300;400;500;600;700&display=swap', s: 'Geist:wght@600' },
    { v: 'manrope', n: 'Manrope', d: '"Manrope"' + SANS, b: '"Manrope"' + SANS, href: GF + 'family=Manrope:wght@300;400;500;600;700&display=swap', s: 'Manrope:wght@600' },
    { v: 'grotesk', n: 'Grotesk', d: '"Space Grotesk"' + SANS, b: '"Inter"' + SANS, href: GF + 'family=Space+Grotesk:wght@400;500;600;700&display=swap', s: 'Space+Grotesk:wght@600' },
    { v: 'sora', n: 'Sora', d: '"Sora"' + SANS, b: '"Sora"' + SANS, href: GF + 'family=Sora:wght@300;400;500;600;700&display=swap', s: 'Sora:wght@600' },
    { v: 'editorial', n: 'Editorial', d: '"Instrument Serif", Georgia, "Times New Roman", serif', b: '"Inter"' + SANS, href: GF + 'family=Instrument+Serif:ital@0;1&display=swap', s: 'Instrument+Serif' }
  ];
  var fontsEl = document.getElementById('tp-fonts'), curFont = 'inter';
  var fcs = DT.get('font'); if(fcs && fcs.v) curFont = fcs.v;
  fontsEl.innerHTML = FONTS.map(function(f){
    return '<button type="button" class="tp-font" data-v="' + f.v + '" aria-label="' + f.n + '"><span class="tp-aa" style="font-family:' + f.d.replace(/"/g, '&quot;') + '">Aa</span><span>' + f.n + '</span></button>';
  }).join('');
  var samplesLoaded = false;
  function loadFontSamples(){
    if(samplesLoaded) return; samplesLoaded = true;
    var l = document.createElement('link'); l.rel = 'stylesheet';
    l.href = GF + FONTS.filter(function(f){ return f.s; }).map(function(f){ return 'family=' + f.s; }).join('&') + '&text=Aa&display=swap';
    document.head.appendChild(l);
  }
  function applyFont(v, save){
    var f = FONTS.filter(function(x){ return x.v === v; })[0] || FONTS[0], de = document.documentElement;
    curFont = f.v;
    de.setAttribute('data-font', f.v);
    de.style.setProperty('--slide-display', f.d); de.style.setProperty('--slide-body', f.b);
    var sheet = document.getElementById('font-sheet');
    if(f.href){ if(!sheet){ sheet = document.createElement('link'); sheet.rel = 'stylesheet'; sheet.id = 'font-sheet'; document.head.appendChild(sheet); } if(sheet.getAttribute('href') !== f.href) sheet.href = f.href; }
    else if(sheet) sheet.remove();
    Array.prototype.forEach.call(fontsEl.children, function(b){ b.setAttribute('aria-pressed', String(b.dataset.v === f.v)); });
    if(save){ DT.set('font', f.v === 'inter' ? null : { v: f.v, d: f.d, b: f.b, href: f.href }); markChanged(); }
    paintThemeSummary();
    // text that measures itself (carousel labels, film strips) re-measures once the face arrives
    if(document.fonts && document.fonts.ready) document.fonts.ready.then(function(){ try { syncFilmstrips(); placeHandle(); } catch(_){} });
  }
  fontsEl.addEventListener('click', function(e){ var b = e.target.closest('.tp-font'); if(b) applyFont(b.dataset.v, true); });
  accentDot.addEventListener('click', loadFontSamples);
  applyFont(curFont, false);

  // what's applied, named beside each heading
  function paintThemeSummary(){
    if(typeof glow === 'undefined' || !glow || !document.getElementById('tp-v-accent')) return;   // (the accent paints once before the glow exists)
    var hex = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim().toUpperCase();
    var acc = sws.filter(function(b){ return b.dataset.accent.toUpperCase() === hex; })[0];
    var st = GLOW_STYLES.filter(function(o){ return o.v === glow.style; })[0], co = GLOW_COLORS.filter(function(o){ return o.v === glow.color; })[0];
    var aName = acc ? acc.title : 'Custom', sName = st ? st.n : 'Aurora', cName = co ? co.n : 'Dusk';
    document.getElementById('tp-v-accent').textContent = aName;
    document.getElementById('tp-v-style').textContent = sName;
    document.getElementById('tp-v-color').textContent = glow.style === 'none' ? '' : cName;
    var fo = (typeof FONTS !== 'undefined' && FONTS) ? FONTS.filter(function(f){ return f.v === curFont; })[0] : null;
    if(fo) document.getElementById('tp-v-font').textContent = fo.n;
    document.getElementById('tp-hero').setAttribute('data-glow', glow.style);    // its own style attribute, so its stronger strength applies
  }
  paintThemeSummary();
  // the other windows (presenter, its live preview, the start screen) follow along
  window.addEventListener('storage', function(e){
    if(e.key === NS + 'deck-accent') applyAccent(DT.get('accent'));
    else if(e.key === NS + 'deck-theme') applyTheme(DT.get('mode'));
    else if(e.key === NS + 'deck-font-css'){ var fv = DT.get('font'); applyFont(fv ? fv.v : 'inter', false); }
    else if((e.key || '').indexOf(NS + 'deck-glow') === 0){ readGlow(); applyGlow(false); }
    if(/^deck-(theme|accent|glow|font)/.test((e.key || '').slice(NS.length)) && (e.key || '').indexOf(NS) === 0) markChanged();
  });

  function toggleFull(){
    try {
      if(!document.fullscreenElement){ var p = document.getElementById('viewport').requestFullscreen(); if(p&&p.catch) p.catch(function(){}); }
      else { document.exitFullscreen(); }
    } catch(e){}
  }
  document.getElementById('full').onclick = toggleFull;

  // ================= annotations: annotated screens, and every other slide =================
  // Annotated screens are their own slides (annotations.screens). Any other slide can carry pins and
  // arrows too, in anns.pages under the slide's name from the markup (its _lkey).
  function seedAnnList(list, pre){
    return (list || []).map(function(a, ai){
      var o = { id: pre + '-' + ai, x: a.x, y: a.y, title: a.title, note: a.note, images: (a.images || []).slice() };
      if(a.color) o.color = a.color; return o;
    });
  }
  function seedShapes(list, pre){ return (list || []).map(function(x, k){ var o = JSON.parse(JSON.stringify(x)); o.id = pre + '-s' + k; return o; }); }
  function seedAnns(){
    var src = (SEED.annotations && SEED.annotations.screens) || [], pages = (SEED.annotations && SEED.annotations.pages) || {};
    var out = { screens: src.map(function(sc, si){
      var o = { id: 'seed' + si, name: sc.name || ('Screen ' + (si+1)), img: sc.img || null, notes: sc.notes || '',
        ann: seedAnnList(sc.ann, 'seed' + si), shapes: seedShapes(sc.shapes, 'seed' + si) };
      if(typeof sc.theme === 'boolean') o.theme = sc.theme;
      return o;
    }), pages: {} };
    Object.keys(pages).forEach(function(key, pi){
      out.pages[key] = { id: 'pg' + pi, ann: seedAnnList(pages[key].ann, 'pg' + pi), shapes: seedShapes(pages[key].shapes, 'pg' + pi) };
    });
    return out;
  }
  var DEFAULT_ANNS = seedAnns();
  var annData = JSON.parse(JSON.stringify(DEFAULT_ANNS));
  var editing = false, annotating = false, addingNote = false, drawTool = null, dragMoved = false, suppressClick = false, uid = 100;
  function nid(){ return 'x' + (uid++) + '-' + Date.now().toString(36); }

  var DB = null;
  function idbOpen(cb){
    try {
      var r = indexedDB.open('sleek-' + NS, 1);
      r.onupgradeneeded = function(){ try { r.result.createObjectStore('kv'); } catch(e){} };
      r.onsuccess = function(){ DB = r.result; cb && cb(); };
      r.onerror = function(){ cb && cb(); };
    } catch(e){ cb && cb(); }
  }
  function idbGet(key, cb){
    if(!DB){ cb(null); return; }
    try { var q = DB.transaction('kv','readonly').objectStore('kv').get(key);
      q.onsuccess = function(){ cb(q.result || null); }; q.onerror = function(){ cb(null); };
    } catch(e){ cb(null); }
  }
  function idbSet(key, val){ if(!DB) return; try { DB.transaction('kv','readwrite').objectStore('kv').put(val, key); } catch(e){} }
  function saveAnns(){ setTimeout(refreshAnnNotes, 0); idbSet('annotations', annData); markChanged(); try { localStorage.setItem(NS + 'sleek-ann-ping', String(Date.now())); } catch(e){} try { if(bc) bc.postMessage({ anns: true }); } catch(e){} }
  function reloadAnns(){ idbGet('annotations', function(d){ if(d && d.screens){ annData = d; annData.pages = annData.pages || {}; renderScreens(); rebuildSlides(); renderNotes(); renderPresenter(); } markChanged(); }); }

  function currentScreen(){ var sid = slides[i] && slides[i]._sid; if(!sid) return null; for(var k=0;k<annData.screens.length;k++){ if(annData.screens[k].id===sid) return annData.screens[k]; } return null; }
  // every annotation set: the annotated screens, then the slides' pages
  function annSets(){ var p = annData.pages || {}; return annData.screens.concat(Object.keys(p).map(function(k){ return p[k]; })); }
  // pins live in sc.ann, boxes and arrows in sc.shapes; list is whichever holds it
  function annById(aid){
    var sets = annSets();
    for(var k=0;k<sets.length;k++){
      var sc=sets[k], sh = sc.shapes || [];
      for(var j=0;j<sc.ann.length;j++){ if(sc.ann[j].id===aid) return {sc:sc, a:sc.ann[j], list:sc.ann}; }
      for(var m=0;m<sh.length;m++){ if(sh[m].id===aid) return {sc:sc, a:sh[m], list:sh}; }
    }
    return null;
  }
  function annEls(aid, sel){ return document.querySelectorAll('#stage ' + sel.split(',').map(function(x){ return x.trim() + '[data-aid="' + aid + '"]'; }).join(', #stage ')); }

  // ---------- colors: the accent by default, or one of a few others ----------
  var ANN_COLORS = [{ c: '', n: 'Accent' }, { c: '#FF453A', n: 'Red' }, { c: '#FF9F0A', n: 'Orange' }, { c: '#FFD60A', n: 'Yellow' },
                    { c: '#30D158', n: 'Green' }, { c: '#64D2FF', n: 'Cyan' }, { c: '#BF5AF2', n: 'Purple' }];
  var nextColor = '';
  try { nextColor = localStorage.getItem(NS + 'deck-ann-color') || ''; } catch(e){}
  // the color on an annotation's pieces: --ac, plus dark text on the light colors
  function colorStyle(el, c){
    if(c){ el.style.setProperty('--ac', c); el.style.setProperty('--on-ac', /^#(FFD60A|64D2FF|30D158|FF9F0A)$/i.test(c) ? '#121214' : '#fff'); }
    else { el.style.removeProperty('--ac'); el.style.removeProperty('--on-ac'); }
  }
  function swatchRow(row, cur, pick){
    row.innerHTML = '';
    ANN_COLORS.forEach(function(o){
      var b = document.createElement('button'); b.type = 'button'; b.className = 'acol' + (o.c ? '' : ' acol-accent');
      b.title = o.n; b.setAttribute('role', 'radio'); b.setAttribute('aria-label', o.n); b.setAttribute('aria-checked', String((cur || '') === o.c));
      if(o.c) b.style.background = o.c;
      b.onmousedown = function(e){ e.preventDefault(); };
      b.onclick = function(){ pick(o.c); };
      row.appendChild(b);
    });
  }
  function paintBarColors(){
    var dot = document.querySelector('#eb-color .eb-dot'); if(dot) dot.style.background = nextColor || '';
    swatchRow(document.getElementById('eb-colors'), nextColor, function(c){
      nextColor = c; try { localStorage.setItem(NS + 'deck-ann-color', c); } catch(e){}
      paintBarColors(); setAddMenu(false);
      if(!peEl.hidden && annById(peEl._aid)) setAnnColor(peEl._aid, c);     // and the one you're editing
    });
  }
  function setAnnColor(aid, c){
    var r = annById(aid); if(!r) return;
    if(c) r.a.color = c; else delete r.a.color;
    saveAnns(); renderScreens(); rebuildSlides();
    if(!peEl.hidden && peEl._aid === aid) paintEditorColors();
  }

  // one tool at a time: 'pin' (click to drop), 'arrow' (drag to draw; boxes still show), or none
  function setTool(t){
    addingNote = (t === 'pin'); drawTool = (t === 'box' || t === 'arrow') ? t : null;
    Array.prototype.forEach.call(document.querySelectorAll('#eb-annot [data-tool]'), function(b){ b.setAttribute('aria-pressed', String(b.dataset.tool === t)); });
    document.body.classList.toggle('drawing', !!drawTool);
    document.body.classList.toggle('ann-tool', !!t);
    if(t && activeBlock) leaveText();
    if(t) setAddMenu(false);
    paintContext();
  }
  // the colours open from the bar's one colour dot
  var ebMenu = document.getElementById('eb-colors'), ebColor = document.getElementById('eb-color');
  function setAddMenu(open){ ebMenu.hidden = !open; ebColor.setAttribute('aria-expanded', String(open)); }
  ebColor.onclick = function(){ setAddMenu(ebMenu.hidden); };
  Array.prototype.forEach.call(document.querySelectorAll('#eb-annot [data-tool]'), function(b){ b.onclick = function(){ setAddMenu(false); setTool(b.getAttribute('aria-pressed') === 'true' ? null : b.dataset.tool); }; });
  document.addEventListener('mousedown', function(e){ if(!ebMenu.hidden && !e.target.closest('.eb-addwrap')) setAddMenu(false); });
  document.addEventListener('keydown', function(e){
    if(e.key !== 'Escape' || !annotating) return;
    if(!ebMenu.hidden){ setAddMenu(false); e.stopImmediatePropagation(); }
    else if(addingNote || drawTool){ setTool(null); e.stopImmediatePropagation(); }
  }, true);

  // pins, arrows (and boxes) of one set, drawn into host, positioned on surface (both cover the slide)
  function buildAnns(host, sc, surface){
    sc.ann.forEach(function(a, ai){
      var pin = document.createElement('button'); pin.className = 'pin'; pin.textContent = (ai+1);
      pin.style.left = a.x + '%'; pin.style.top = a.y + '%'; pin.dataset.aid = a.id; pin.style.setProperty('--i', ai);
      var co = document.createElement('div'); co.className = 'callout'; co.hidden = true; co.dataset.aid = a.id;
      co.style.left = a.x + '%'; co.style.top = a.y + '%';
      var ch = document.createElement('div'); ch.className = 'ch'; ch.textContent = a.title || 'Note';
      var cb = document.createElement('div'); cb.className = 'cb'; cb.innerHTML = noteHTML(a.note);
      co.appendChild(ch); co.appendChild(cb); renderCalloutImages(co, a); addCalloutEdit(co, a.id);
      colorStyle(pin, a.color); colorStyle(co, a.color);
      pin.onclick = function(ev){ ev.stopPropagation(); if(suppressClick){ suppressClick = false; return; } if(annotating){ openPinEditor(a.id); } else setCalloutOpen(co, !isCalloutOpen(co)); };
      pin.onmousedown = function(ev){ if(annotating) startDrag(ev, a, pin, co, surface); };
      var px = delButton(a.id); px.classList.add('adel-pin'); px.style.left = a.x + '%'; px.style.top = a.y + '%';
      host.appendChild(pin); host.appendChild(px); host.appendChild(co);
    });
    sc.shapes = sc.shapes || [];
    renderShapes(host, sc, surface);
    sc.ann.concat(sc.shapes).forEach(function(a){ if(a.images && a.images.length) paintImgBadge(a.id, host); });   // (host isn't on the page yet)
    surface.addEventListener('click', function(ev){ if(annotating && addingNote){ ev.stopPropagation(); addAnnotationAt(sc, ev, surface); } });
    surface.addEventListener('mousedown', function(ev){ if(annotating && drawTool){ drawShape(ev, sc, surface, host); } });
  }
  function renderScreens(){
    var host = document.getElementById('screen-slides'); if(!host) return;
    host.innerHTML = '';
    Array.prototype.forEach.call(stage.querySelectorAll(':scope > .s-screen'), function(s){ s.remove(); });   // ones placed by the order
    annData.screens.forEach(function(sc){
      var sec = document.createElement('section');
      sec.className = 'slide s-screen';
      sec.dataset.label = sc.name;
      sec._notes = sc.notes || ''; sec._screen = sc;
      sec._sid = sc.id;
      var media = document.createElement('div');
      media.className = 'media';
      if(sc.img){ media._img = sc.img; screenBg(media); }
      else { var cap = document.createElement('span'); cap.className = 'cap'; cap.textContent = sc.name; media.appendChild(cap); }
      sec.appendChild(media);
      var nm = document.createElement('span'); nm.className = 'screenname'; nm.textContent = sc.name; sec.appendChild(nm);
      sec.appendChild(screenReplaceBtn(sc, media));
      buildAnns(sec, sc, media);
      host.appendChild(sec);
    });
    if(orderReady) applyOrder();
    renderPageAnns();
    if(typeof slideThemeOverrides !== 'undefined') setTimeout(refreshSlideThemes, 0);   // the screens are new elements
  }
  // Edit mode: the picture being annotated can be swapped for another; its pins and shapes stay put
  var screenFile = null;
  function screenReplaceBtn(sc, media){
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'screen-replace';
    b.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="3" y="4" width="14" height="12" rx="2"/><circle cx="7.5" cy="8.5" r="1.4"/><path d="m3.5 14.5 4-4 3 3 2-2 4 4"/></svg><span>' + (sc.img ? 'Replace picture' : 'Add picture') + '</span>';
    b.addEventListener('pointerdown', function(e){ e.stopPropagation(); });
    b.addEventListener('click', function(e){
      e.stopPropagation(); if(!editing) return;
      if(!screenFile){
        screenFile = document.createElement('input'); screenFile.type = 'file'; screenFile.accept = 'image/*'; screenFile.hidden = true;
        document.body.appendChild(screenFile);
        screenFile.addEventListener('change', function(){
          var f = screenFile.files && screenFile.files[0], t = screenFile._for; screenFile.value = ''; screenFile._for = null;
          if(!f || !t) return;
          mediaFromFile(f, function(src){
            t.sc.img = src; t.media._img = src; screenBg(t.media);
            var cap = t.media.querySelector(':scope > .cap'); if(cap) cap.remove();
            t.btn.querySelector('span').textContent = 'Replace picture';
            saveAnns(); refreshSlideThemes(); renderPresenter();
          });
        });
      }
      screenFile._for = { sc: sc, media: media, btn: b };
      screenFile.value = ''; screenFile.click();
    });
    return b;
  }
  // every other slide: an annotation layer over the whole slide (only catches clicks while adding)
  function renderPageAnns(){
    Array.prototype.forEach.call(document.querySelectorAll('#stage .slide:not(.s-screen)'), function(s){
      var old = s.querySelector(':scope > .ann-layer'); if(old) old.remove();
      if(s._lkey == null) return;
      var layer = document.createElement('div'); layer.className = 'ann-layer';
      var sc = (annData.pages || {})[s._lkey] || { id: 'pg-' + slugify(s._lkey), ann: [], shapes: [], _new: true };
      layer._set = sc; layer._key = s._lkey;
      buildAnns(layer, sc, layer);
      s.appendChild(layer);
    });
  }
  // a slide's set, created in anns.pages the first time something is added to it
  function claimSet(sc, surface){
    if(!sc._new) return sc;
    delete sc._new;
    var key = surface._key; annData.pages = annData.pages || {};
    annData.pages[key] = sc; return sc;
  }

  // ---------- boxes (with optional spotlight) and arrows ----------
  // Positions are percentages of the screen, like pins. Arrows draw in an SVG laid over the
  // 1280x720 screen; boxes, labels, handles and callouts are HTML on top.
  var SVGNS = 'http://www.w3.org/2000/svg';
  function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }
  function r1(v){ return Math.round(v * 10) / 10; }
  function makeCallout(s){
    var co = document.createElement('div'); co.className = 'callout'; co.hidden = true; co.dataset.aid = s.id;
    var ch = document.createElement('div'); ch.className = 'ch'; ch.textContent = s.title || (s.type === 'box' ? 'Area' : 'Note');
    var cb = document.createElement('div'); cb.className = 'cb'; cb.innerHTML = noteHTML(s.note);
    co.appendChild(ch); co.appendChild(cb); renderCalloutImages(co, s); addCalloutEdit(co, s.id); return co;
  }

  // ---------- images attached to annotations ----------
  // An annotation's images ride along with it and save with the deck. The expanded note shows them as thumbnails; one click opens the full-screen viewer.
  function renderCalloutImages(co, a){
    var old = co.querySelector('.cimgs'); if(old) old.remove();
    var imgs = a.images || []; if(!imgs.length) return;
    var row = document.createElement('div'); row.className = 'cimgs';
    imgs.forEach(function(src, k){
      var b = document.createElement('button'); b.type = 'button'; b.className = 'cimg';
      b.setAttribute('aria-label', 'Open image ' + (k + 1) + ' of ' + imgs.length);
      b.innerHTML = '<img src="' + src + '" alt="">';
      b.firstChild.addEventListener('load', function(){ fitCallout(co); });   // taller once it loads: it may need to flip above
      b.addEventListener('click', function(ev){ ev.stopPropagation(); openImageViewer(imgs, k, b, annViewOpts(a.id, imgs)); });
      row.appendChild(b);
    });
    var ed = co.querySelector('.c-edit'); if(ed) co.insertBefore(row, ed); else co.appendChild(row);
  }
  // An attached image opens as a before / after: the Before is the screen the annotation sits on
  // (an annotated screen's image, or the picture under it on any other slide), the After is the image.
  function annBefore(aid){
    var r = annById(aid); if(!r) return null;
    if(r.sc.img) return busted(ownSample(r.sc.img) ? sampleTint(r.sc.img) : r.sc.img);
    var el = document.querySelector('#stage .pin[data-aid="' + aid + '"], #stage .abox[data-aid="' + aid + '"], #stage .aarrow-tag[data-aid="' + aid + '"]');
    var s = el && el.closest('.slide'); if(!s) return null;
    var er = el.getBoundingClientRect(), cx = er.left + er.width / 2, cy = er.top + er.height / 2;
    var hit = Array.prototype.filter.call(s.querySelectorAll('.media'), function(m){
      var mr = m.getBoundingClientRect(); return mr.width && cx >= mr.left && cx <= mr.right && cy >= mr.top && cy <= mr.bottom;
    }).pop();
    var src = hit && tileSrc(hit);
    return src && !isVideo(src) ? src : null;
  }
  function annViewOpts(aid, imgs){
    var b = annBefore(aid);
    return b ? { befores: imgs.map(function(){ return b; }) } : null;
  }
  // annotations with attached images wear a small photo badge on their circle (or in their tag)
  var PHOTO_SVG = '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="2.5" y="4" width="15" height="12" rx="2.5"/><circle cx="7.2" cy="8.4" r="1.5"/><path d="m3.5 14.5 4.2-4 3 2.8 2.3-2 3.5 3.2"/></svg>';
  function paintImgBadge(aid, root){
    var r = annById(aid), has = !!(r && r.a.images && r.a.images.length);
    var els = root ? root.querySelectorAll('.pin[data-aid="' + aid + '"], .abox-tag[data-aid="' + aid + '"], .aarrow-tag[data-aid="' + aid + '"]') : annEls(aid, '.pin, .abox-tag, .aarrow-tag');
    Array.prototype.forEach.call(els, function(el){
      var b = el.querySelector(':scope > .a-img');
      if(has && !b){ b = document.createElement('span'); b.className = 'a-img'; b.title = 'Has images'; b.innerHTML = PHOTO_SVG; el.appendChild(b); }
      else if(!has && b) b.remove();
      el.classList.toggle('has-img', has);
    });
  }
  // an open note's Edit button (bottom left): straight into Annotate mode, editing this one
  function addCalloutEdit(co, aid){
    var b = document.createElement('button'); b.type = 'button'; b.className = 'c-edit'; b.setAttribute('aria-label', 'Edit this annotation');
    b.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10.5 17h6.5"/><path d="M13.7 3.1a1.75 1.75 0 0 1 2.5 2.5L6.4 15.4l-3.4.9.9-3.4Z"/></svg>';
    b.addEventListener('mousedown', function(ev){ ev.stopPropagation(); });
    b.addEventListener('click', function(ev){
      ev.stopPropagation(); ev.preventDefault();
      co.hidden = true;
      if(!editing) toggleEdit();
      openPinEditor(aid);
    });
    co.appendChild(b);
    // top right, Mac style: yellow minimizes, red (rightmost) deletes (click, then click again to confirm)
    var dots = document.createElement('div'); dots.className = 'c-dots';
    dots.innerHTML = '<button type="button" class="c-dot c-min" aria-label="Minimize"><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3.1 6h5.8"/></svg></button>' +
      '<button type="button" class="c-dot c-del" aria-label="Delete this annotation"><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3.6 3.6l4.8 4.8M8.4 3.6 3.6 8.4"/></svg><span>Delete?</span></button>';
    var del = dots.querySelector('.c-del'), armT = 0;
    function disarm(){ clearTimeout(armT); del.classList.remove('armed'); del.setAttribute('aria-label', 'Delete this annotation'); }
    dots.addEventListener('mousedown', function(ev){ ev.stopPropagation(); });
    dots.querySelector('.c-min').addEventListener('click', function(ev){ ev.stopPropagation(); disarm(); setCalloutOpen(co, false); });
    del.addEventListener('click', function(ev){
      ev.stopPropagation();
      if(!del.classList.contains('armed')){ del.classList.add('armed'); del.setAttribute('aria-label', 'Click again to delete'); armT = setTimeout(disarm, 3000); return; }
      disarm(); removeAnn(aid);
    });
    co.insertBefore(dots, co.firstChild);
  }
  function refreshCalloutImages(aid){
    var r = annById(aid); if(!r) return;
    var co = annEls(aid, '.callout')[0]; if(co){ renderCalloutImages(co, r.a); if(!co.hidden) fitCallout(co); }
    paintImgBadge(aid);
  }

  // full-screen viewer: grows out of the thumbnail, arrows step through, Esc / click outside closes.
  // Videos play here with controls and sound (the click that opened it counts as permission).
  function isVideo(src){ return /^data:video\//.test(src || '') || /^blob:[^#]*#video$/.test(src || '') || /\.(mp4|webm|mov|m4v)([?#]|$)/i.test(src || ''); }
  var viewer = null;
  function buildViewer(){
    if(viewer) return viewer;
    var v = document.createElement('div'); v.className = 'imgview'; v.hidden = true;
    v.innerHTML = '<div class="iv-dim"></div><img class="iv-img" alt=""><video class="iv-img iv-vid" controls muted playsinline hidden></video>' +
      '<button class="iv-btn iv-prev" type="button" aria-label="Previous">‹</button>' +
      '<button class="iv-btn iv-next" type="button" aria-label="Next">›</button>' +
      '<div class="iv-count"></div><div class="iv-cap"></div><button class="iv-close" type="button" aria-label="Close">×</button>' +
      '<div class="iv-cmp" hidden><img class="iv-before" alt=""><span class="iv-tag iv-tag-b">Before</span><span class="iv-tag iv-tag-a">After</span>' +
      '<div class="iv-handle"><span class="iv-knob"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7.5 6 3.5 10l4 4M12.5 6l4 4-4 4"/></svg></span></div></div>';
    document.body.appendChild(v);
    v.querySelector('.iv-dim').onclick = function(){ closeImageViewer(); };
    v.querySelector('.iv-close').onclick = function(){ closeImageViewer(); };
    v.querySelector('.iv-prev').onclick = function(){ stepImage(-1); };
    v.querySelector('.iv-next').onclick = function(){ stepImage(1); };
    if(MIRROR) v.querySelector('video.iv-vid').muted = true;
    viewer = { el: v, img: v.querySelector('img.iv-img'), vid: v.querySelector('video.iv-vid'), list: [], k: 0, from: null, thumbs: null, caps: null, wasModal: false,
      cmp: v.querySelector('.iv-cmp'), before: v.querySelector('.iv-before'), befores: null, p: 0, cmpT: 0 };
    setupCompare(viewer);
    return viewer;
  }
  function curMedia(){ return viewer.vid.hidden ? viewer.img : viewer.vid; }
  // show item k in the img or the video element; ready() runs once it has a size
  function loadItem(k, ready){
    var v = viewer, src = v.list[k], vid = isVideo(src);
    if(vid){ v.vid.pause(); v.vid.muted = true; } else releaseViewerVideo();   // every video starts muted (its controls unmute it)
    v.img.hidden = vid; v.vid.hidden = !vid;
    var el = vid ? v.vid : v.img, ev = vid ? 'canplay' : 'load';    // a video: once it can actually play
    hideCompare();
    var once = function(){
      var wasOpen = v.el.classList.contains('open');            // (ready() is what opens it, so ask first)
      el.removeEventListener(ev, once); if(ready) ready();
      if(vid && !v.el.hidden && v.k === k) playViewer();
      if(!vid && v.befores && v.befores[k]) showCompare(k, wasOpen ? 240 : 480); };
    el.addEventListener(ev, once);
    if(el.getAttribute('src') === src && (vid ? v.vid.readyState >= 3 : v.img.complete)) once(); else el.src = src;
    v.el.querySelector('.iv-count').textContent = (k + 1) + ' / ' + v.list.length;
    v.el.querySelector('.iv-cap').textContent = (v.caps && v.caps[k]) || '';
  }
  // transform that puts the full-size media exactly over a thumbnail (for the grow / shrink)
  function fromRect(thumb){
    var img = curMedia(), r = thumb && thumb.getBoundingClientRect(), f = img.getBoundingClientRect();
    if(!r || !f.width) return 'scale(0.9)';
    var s = Math.max(r.width / f.width, r.height / f.height);
    return 'translate(' + ((r.left + r.width / 2) - (f.left + f.width / 2)) + 'px,' + ((r.top + r.height / 2) - (f.top + f.height / 2)) + 'px) scale(' + s + ')';
  }
  // muted by default; if it was unmuted and this window hasn't been clicked yet, the browser only lets it play muted
  function playViewer(){
    var vd = viewer.vid, p = vd.play();
    if(p && p.catch) p.catch(function(err){ if(err && err.name === 'NotAllowedError' && !vd.muted){ vd.muted = true; vd.play().catch(function(){}); } });
  }
  // a spinner in the tile while its video loads (the full-screen player waits for it)
  function tileSpin(m, on){
    if(!m || !m.classList || !m.classList.contains('media')) return;
    var s = m.querySelector(':scope > .tile-spin');
    if(on && !s){ s = document.createElement('span'); s.className = 'tile-spin'; s.setAttribute('aria-hidden', 'true'); m.appendChild(s); }
    if(!on && s) s.remove();
    m.classList.toggle('tile-loading', !!on);
  }
  // opts.thumbs: the element for each item (to grow from / shrink back to); opts.caps: a caption for each
  function openImageViewer(list, k, thumb, opts){
    var v = buildViewer(), id = v.openId = (v.openId || 0) + 1;
    v.list = list; v.k = k; v.from = thumb; v.wasModal = window.Deck && Deck.modal;
    v.thumbs = (opts && opts.thumbs) || null; v.caps = (opts && opts.caps) || null; v.befores = (opts && opts.befores) || null;
    if(window.Deck) Deck.modal = true;
    v.el.classList.toggle('single', list.length < 2);
    v.el.hidden = false;
    // a video waits in its tile, with a spinner, until it can play; then it grows out of the tile
    var wait = isVideo(list[k]), done = false;
    if(wait){ v.el.classList.add('iv-wait'); tileSpin(thumb, true); }
    function grow(){
      if(done || v.openId !== id) return; done = true;
      if(wait){ v.el.classList.remove('iv-wait'); tileSpin(thumb, false); }
      var m = curMedia();
      v.el.classList.add('no-anim'); m.style.transform = fromRect(thumb); m.style.opacity = '0.4';
      void m.offsetWidth; v.el.classList.remove('no-anim');
      v.el.classList.add('open'); m.style.transform = ''; m.style.opacity = '';
    }
    loadItem(k, grow);
    if(wait) setTimeout(function(){ if(!done && v.openId === id && !v.el.hidden){ grow(); playViewer(); } }, 12000);   // never stuck on the spinner
  }
  function stepImage(d){
    var v = viewer; if(!v || v.el.hidden || v.list.length < 2) return;
    v.k = (v.k + d + v.list.length) % v.list.length;
    var m = curMedia(); m.classList.add('swap');
    setTimeout(function(){ m.classList.remove('swap'); loadItem(v.k); }, 160);
    // shrink back to the matching thumbnail
    if(v.thumbs) v.from = v.thumbs[v.k]; else { var row = v.from && v.from.parentNode; v.from = row ? row.children[v.k] : v.from; }
  }
  function closeImageViewer(){
    var v = viewer; if(!v || v.el.hidden) return;
    clearViewMarks();
    if(v.el.classList.contains('iv-wait')){                      // still loading in its tile: just stop
      v.openId = (v.openId || 0) + 1; v.el.classList.remove('iv-wait'); tileSpin(v.from, false);
      v.el.hidden = true; releaseViewerVideo(); if(window.Deck) Deck.modal = v.wasModal; return;
    }
    var m = curMedia(), id = v.openId;
    hideCompare();
    v.el.classList.remove('open');
    m.style.transform = (v.from && document.body.contains(v.from)) ? fromRect(v.from) : 'scale(0.92)'; m.style.opacity = '0';
    setTimeout(function(){
      m.style.transform = ''; m.style.opacity = '';
      if(v.openId !== id) return;                                // opened again meanwhile: leave it be
      v.el.hidden = true; releaseViewerVideo();
    }, 380);
    if(window.Deck) Deck.modal = v.wasModal;
  }
  // a closed player lets go of its video (and the connection it holds; see holdVideo)
  function releaseViewerVideo(){ var vd = viewer.vid; vd.pause(); if(vd.getAttribute('src')){ vd.removeAttribute('src'); try { vd.load(); } catch(e){} } }
  // ---------- before / after: a divider you drag across the enlarged After to show the Before ----------
  // A slide marked data-before="<the Before slide's name>" pairs each of its tiles with the Before tile
  // that has the same label. The Before sits over the After, clipped to the left of the divider; it
  // opens by sweeping in to halfway. Drag anywhere on the picture (or click) to move it.
  function placeCompare(){
    var v = viewer; if(!v || v.cmp.hidden) return;
    var r = v.img.getBoundingClientRect();
    v.cmp.style.left = r.left + 'px'; v.cmp.style.top = r.top + 'px'; v.cmp.style.width = r.width + 'px'; v.cmp.style.height = r.height + 'px';
    v.cmp.classList.toggle('tags-in', r.top < 48);              // no room above it for the Before / After pills
  }
  function setCompare(p, fromRemote){
    var v = viewer; if(!v) return;
    v.p = Math.max(0, Math.min(100, p)); v.cmp.style.setProperty('--p', v.p + '%');
    if(!fromRemote && AUDIENCE){ clearTimeout(v.cmpT); v.cmpT = setTimeout(function(){ sendInput({ kind: 'echo', act: { t: 'viewer', op: 'cmp', p: v.p } }); }, 40); }
  }
  function sweepCompare(to, D, then, ease){
    var v = viewer, from = v.p, start = performance.now(), id = v.sweepId = (v.sweepId || 0) + 1; D = D || 700;
    var curve = ease === 'inout' ? function(k){ return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; } : function(k){ return 1 - Math.pow(1 - k, 3); };
    // it lands even if this window isn't drawing (no animation frames), and the preview runs the same sweep
    if(AUDIENCE) sendInput({ kind: 'echo', act: { t: 'viewer', op: 'cmp', p: to, d: D, ease: ease } });
    setTimeout(function(){ if(v.sweepId === id && !v.cmp.hidden){ setCompare(to, true); if(then) then(); } }, D + 60);
    (function step(now){
      if(v.sweepId !== id) return;                              // a hand on the divider stops it
      var k = Math.min(1, (now - start) / D); setCompare(from + (to - from) * curve(k), true); if(k < 1 && !v.cmp.hidden) requestAnimationFrame(step);
    })(start);
  }
  // Space on a before / after: the divider glides all the way over to show the whole Before, rests,
  // then glides back to show the whole After (a hand on the divider stops it)
  // the presenter's Wipe: play the open before / after, or open the slide's first one and play it once it's up
  function wipeTile(s){
    var tiles = s ? slideTiles(s) : [], b = tiles.length ? beforesFor(tiles) : null; if(!b) return -1;
    for(var k = 0; k < b.length; k++) if(b[k] && isExpandable(tiles[k])) return k;
    return -1;
  }
  function runWipe(){
    if(viewer && !viewer.el.hidden && !viewer.cmp.hidden){ playCompare(); return; }
    var k = wipeTile(slides[i]); if(k < 0) return;
    var act = { t: 'open', ref: 'tile:' + (k + 1) }; applyAct(act); sendInput({ kind: 'echo', act: act }); setTimeout(announceFeature, 50);
    if(presenting()) return;                                    // it plays on its own once it opens
    var tries = 0, wait = setInterval(function(){                // the Before sweeps in to halfway first, then the wipe plays
      if(++tries > 40 || !viewer || viewer.el.hidden){ clearInterval(wait); return; }
      if(!viewer.cmp.hidden && viewer.cmp.classList.contains('on')){ clearInterval(wait); setTimeout(playCompare, 900); }
    }, 100);
  }
  function playCompare(){
    var v = viewer; if(!v || v.cmp.hidden) return;
    sweepCompare(100, 1300, function(){
      var id = v.sweepId;
      setTimeout(function(){ if(v.sweepId === id && !v.cmp.hidden) sweepCompare(0, 1600, null, 'inout'); }, 650);
    }, 'inout');
  }
  function showCompare(k, delay){
    var v = viewer; clearTimeout(v.showT);
    v.showT = setTimeout(function(){
      if(v.el.hidden || v.k !== k) return;
      v.before.src = v.befores[k];
      v.cmp.hidden = false; placeCompare();
      // the presenter's preview doesn't sweep on its own: it shows where the audience's divider is
      if(MIRROR){ setCompare(v.remoteP != null ? v.remoteP : 0, true); v.cmp.classList.add('on'); return; }
      setCompare(0, true);
      // in Present Mode it then plays the wipe on its own (whole Before, then whole After)
      var auto = presenting();
      requestAnimationFrame(function(){
        v.cmp.classList.add('on');
        sweepCompare(50, null, auto ? function(){ var id = v.sweepId; setTimeout(function(){ if(v.sweepId === id && !v.cmp.hidden && !v.el.hidden && v.k === k) playCompare(); }, 350); } : null);
      });
    }, delay);
  }
  function hideCompare(){ var v = viewer; if(!v) return; clearTimeout(v.showT); if(v.stopCmpDrag) v.stopCmpDrag(); v.remoteP = null; v.cmp.classList.remove('on'); v.cmp.hidden = true; }
  function setupCompare(v){
    var drag = false;
    function at(e){
      var r = v.cmp.getBoundingClientRect(), p = (e.clientX - r.left) / r.width * 100;
      if(MIRROR) sendInput({ kind: 'req', act: { t: 'viewer', op: 'cmp', p: Math.max(0, Math.min(100, p)) } });   // the audience moves it, then this follows
      else setCompare(p);
    }
    v.cmp.addEventListener('pointerdown', function(e){ e.stopPropagation(); if(e.pointerType === 'mouse' && e.button !== 0) return; drag = true; v.sweepId = (v.sweepId || 0) + 1; try { v.cmp.setPointerCapture(e.pointerId); } catch(_){} at(e); v.cmp.classList.add('dragging'); });
    // it follows the pointer only while the button is held: a let-go it never heard (outside the window,
    // or the picture hid mid-drag) ends the drag on the next move, so a hover never steers it
    function stop(){ drag = false; v.cmp.classList.remove('dragging'); }
    v.cmp.addEventListener('pointermove', function(e){ if(!drag) return; if(e.pointerType === 'mouse' && !(e.buttons & 1)){ stop(); return; } at(e); });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function(t){ v.cmp.addEventListener(t, stop); });
    v.stopCmpDrag = stop;
    v.cmp.addEventListener('click', function(e){ e.stopPropagation(); });
    window.addEventListener('resize', placeCompare);
    // the picture grows open (and swaps) with a transition: line the Before up again once it has settled
    v.img.addEventListener('transitionend', placeCompare);
    v.img.addEventListener('transitionend', placeMarks);          // boxes drawn on the picture follow it as it settles
  }
  // ---------- the Before picture of a tile ----------
  // In order: the one picked for it in Edit mode (its Before button; kept with the tile's media as
  // "b:<tile id>": another tile's id as "tile:<id>", a picture, or "none"), then a data-before-src
  // on the tile (a layout's own sample Before), then the tile with the same caption on the slide its
  // slide names in data-before.
  function tileByMid(mid){
    return Array.prototype.filter.call(document.querySelectorAll('#stage .media[data-mid="' + mid + '"]'), function(m){ return !m.closest('.car-copy, .fs-copy, .cl-copy'); })[0] || null;
  }
  function beforePick(mid){ return mid ? (mediaImages['b:' + mid] || (SEED.media && SEED.media['b:' + mid]) || null) : null; }
  function pairedBefore(t){
    if(t.hasAttribute('data-before-src')) return busted(t.getAttribute('data-before-src'));
    var s = t.closest('.slide'), key = s && s.getAttribute('data-before'), c = t.querySelector('.cap');
    var bs = key && c && slides.filter(function(x){ return x._lkey === key; })[0], want = c && c.textContent.trim().toLowerCase(), hit = null;
    if(bs) Array.prototype.some.call(bs.querySelectorAll('.car-set:not(.car-copy) .media, .grid .media, .asm-row .media'), function(m){
      var cc = m.querySelector('.cap'), src = tileSrc(m);
      if(cc && src && !isVideo(src) && cc.textContent.trim().toLowerCase() === want){ hit = src; return true; }
    });
    return hit;
  }
  function beforeFor(t){
    var v = beforePick(t.getAttribute('data-mid'));
    if(v === 'none') return null;
    if(v && v.indexOf('tile:') === 0){ var o = tileByMid(v.slice(5)), src = o && tileSrc(o); return src && !isVideo(src) ? src : null; }
    if(v) return busted(v);
    return pairedBefore(t);
  }
  function setBefore(mid, v){
    delete mediaImages['b:' + mid];
    var t = tileByMid(mid);
    if(v) mediaImages['b:' + mid] = v;
    else if(beforePick(mid) || (t && pairedBefore(t))) mediaImages['b:' + mid] = 'none';   // "no Before" outranks the seed and captions
    applyMedia(); saveMedia();
  }
  // each of a slide's tiles' Before picture, or null when none has one
  function beforesFor(tiles){
    var out = tiles.map(function(t){ return beforeFor(t); });
    return out.some(Boolean) ? out : null;
  }
  // the Before button on each tile says whether it has one, with a small copy of it
  function paintBefores(){
    Array.prototype.forEach.call(document.querySelectorAll('#stage .media > .media-before'), function(b){
      var t = b.parentNode, src = null; try { src = beforeFor(t); } catch(e){}
      t.classList.toggle('has-before', !!src);
      b.querySelector('i').style.backgroundImage = src ? 'url("' + src + '")' : '';
      b.querySelector('span').textContent = src ? 'Before' : 'Add before';
      b.title = src ? 'Change or remove the Before picture' : 'Pick a Before picture: in Present this tile opens with a wipe between the two';
      paintSplit(t, src);
    });
  }
  // Edit mode: a tile with a Before shows it split down the middle, the Before on the left and the
  // After on the right, so each half is where you click to replace that picture
  function paintSplit(t, src){
    var sp = t.querySelector(':scope > .media-split');
    if(!src || t.classList.contains('is-video')){ if(sp) sp.remove(); t.classList.remove('has-split'); return; }
    if(!sp){
      sp = document.createElement('div'); sp.className = 'media-split';
      sp.innerHTML = '<span class="msp-b" title="Replace the Before picture"><em>Before</em></span><span class="msp-a" aria-hidden="true"><em>After</em></span><i class="msp-line" aria-hidden="true"></i>';
      sp.querySelector('.msp-b').addEventListener('click', function(ev){
        if(!editing) return;
        ev.stopPropagation(); if(Deck.openBeforePicker) Deck.openBeforePicker(t.getAttribute('data-mid'), t);
      });
      t.insertBefore(sp, t.firstChild);
    }
    t.classList.add('has-split');
    sp.querySelector('.msp-b').style.background = (t.getAttribute('data-bg-pos') || 'center top') + '/cover no-repeat url("' + src.replace(/"/g, '%22') + '")';
  }
  // ---------- click a tile to see it big ----------
  // Any filled image tile without a take-apart expands into the full-screen
  // viewer; ←/→ step through the other tiles in the same group (a carousel set, a grid).
  function isExpandable(m){
    return m && m.classList.contains('media') && m.classList.contains('filled') && !editing && !annotating &&
      m.closest('#stage .slide.active') && !m.closest('.s-divider, .s-fullvideo, .s-screen, .filmstrip') && !m.matches('[data-dis], .car-gone');
  }
  function expandableTileAt(x, y){
    var els = document.elementsFromPoint(x, y);
    for(var k = 0; k < els.length; k++){ var m = els[k].closest && els[k].closest('.media'); if(m) return isExpandable(m) ? m : null; }
    return null;
  }
  function expandTile(m){
    var group = m.closest('.car-set, .grid, .asm-row, .cl-set') || m.parentNode;
    var tiles = Array.prototype.filter.call(group.querySelectorAll('.media'), isExpandable);
    if(tiles.indexOf(m) < 0) tiles = [m];
    var list = tiles.map(tileSrc), caps = tiles.map(function(t){ var c = t.querySelector('.cap'); return c ? c.textContent : ''; });
    openImageViewer(list, tiles.indexOf(m), m, { thumbs: tiles, caps: caps, befores: beforesFor(tiles) });
  }
  stage.addEventListener('click', function(e){
    var m = e.target.closest && e.target.closest('.media');
    if(isExpandable(m) && !featureOpen()){ e.stopPropagation(); expandTile(m); }
  });

  // the viewer owns the keyboard while it's open (capture, so slides don't move underneath)
  window.addEventListener('keydown', function(e){
    if(!viewer || viewer.el.hidden) return;
    if(spaceClearsMarks(e)) return;
    if(e.key === 'Escape'){ closeImageViewer(); }
    else if(e.key === ' ' && !viewer.vid.hidden){ if(viewer.vid.paused) viewer.vid.play(); else viewer.vid.pause(); }
    else if(e.key === ' ' && !viewer.cmp.hidden){ playCompare(); }
    else if(e.key === 'ArrowRight' || e.key === ' ' ){ stepImage(1); }
    else if(e.key === 'ArrowLeft'){ stepImage(-1); }
    else return;
    e.preventDefault(); e.stopImmediatePropagation();
  }, true);

  // ---------- annotation notes: rich text (bold, italic, underline, round bullets) ----------
  // Notes are stored as a small, cleaned subset of HTML. Plain text works too.
  var NOTE_TAGS = { B: 'strong', STRONG: 'strong', I: 'em', EM: 'em', U: 'u', UL: 'ul', OL: 'ul', LI: 'li', BR: 'br', P: 'div', DIV: 'div' };
  function escText(t){ return String(t).replace(/[&<>]/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }
  function cleanNote(html){
    var t = document.createElement('template'); t.innerHTML = html || '';
    function walk(node){
      var out = '';
      Array.prototype.forEach.call(node.childNodes, function(n){
        if(n.nodeType === 3){ out += escText(n.nodeValue); return; }
        if(n.nodeType !== 1) return;
        var tag = NOTE_TAGS[n.tagName], inner = walk(n);
        // pasted inline styles: keep bold/italic/underline that came as CSS
        if(!tag && n.style){
          if(/^(bold|[6-9]00)$/.test(n.style.fontWeight)) inner = '<strong>' + inner + '</strong>';
          if(n.style.fontStyle === 'italic') inner = '<em>' + inner + '</em>';
          if(/underline/.test(n.style.textDecoration)) inner = '<u>' + inner + '</u>';
        }
        if(!tag) out += inner;
        else if(tag === 'br') out += '<br>';
        else out += '<' + tag + '>' + inner + '</' + tag + '>';
      });
      return out;
    }
    var out = walk(t.content);
    // nothing but empty lines counts as no note
    return out.replace(/<(div|li|strong|em|u)><\/\1>/g, '').replace(/^(\s|<br>|<div><br><\/div>)+$/, '') ;
  }
  function noteHTML(note){
    if(!note) return '';
    return /<[a-z][\s\S]*>/i.test(note) ? cleanNote(note) : escText(note).replace(/\n/g, '<br>');
  }
  function placeCallout(co, cx, cyBelow, cyAbove){
    var above = cyBelow > 66;                                  // near the bottom: open upward
    co.classList.remove('side-r', 'side-l');
    co.classList.toggle('above', above);
    co.style.left = clamp(cx, 12, 88) + '%';
    co.style.top = (above ? cyAbove : cyBelow) + '%';
  }
  // Keep an open note fully on screen: flip it above its anchor if it runs off the bottom, then nudge
  // it inside the edges. Measured after it opens, so long notes and edge annotations both fit.
  function fitCallout(co){
    if(!co || co.hidden) return;
    var sec = co.closest('.slide'); if(!sec) return;
    co.style.translate = '';
    if(co.dataset.autoAbove){ co.classList.remove('above'); delete co.dataset.autoAbove; }
    var k = stage.getBoundingClientRect().width / 1280, m = 14 * k;
    var b = sec.getBoundingClientRect(), r = co.getBoundingClientRect();
    var beside = co.classList.contains('side-r') || co.classList.contains('side-l');
    if(r.bottom > b.bottom - m && !beside && !co.classList.contains('above')){
      co.classList.add('above'); co.dataset.autoAbove = '1'; r = co.getBoundingClientRect();
      if(r.top < b.top + m){ co.classList.remove('above'); delete co.dataset.autoAbove; r = co.getBoundingClientRect(); }   // didn't fit above either
    }
    var dx = 0, dy = 0;
    if(r.right > b.right - m) dx = (b.right - m) - r.right;
    if(r.left + dx < b.left + m) dx = (b.left + m) - r.left;
    if(r.bottom > b.bottom - m) dy = (b.bottom - m) - r.bottom;
    if(r.top + dy < b.top + m) dy = (b.top + m) - r.top;
    if(dx || dy) co.style.translate = (dx / k) + 'px ' + (dy / k) + 'px';   // slide px, not screen px
  }
  // a box's note sits beside it (right if it fits, else left), top-aligned and kept on screen
  function placeBoxCallout(co, s){
    var right = s.x + s.w <= 74, left = s.x >= 26;
    if(!right && !left){ placeCallout(co, s.x + s.w / 2, s.y + s.h, s.y); return; }
    co.classList.remove('above');
    co.classList.toggle('side-r', right); co.classList.toggle('side-l', !right);
    co.style.left = (right ? s.x + s.w : s.x) + '%';
    co.style.top = clamp(s.y, 3, 76) + '%';
  }
  function placeShape(sec, s){
    var q = function(sel){ return sec.querySelector(sel + '[data-aid="' + s.id + '"]'); };
    if(s.type === 'box'){
      var b = q('.abox'); if(!b) return;
      b.style.left = s.x + '%'; b.style.top = s.y + '%'; b.style.width = s.w + '%'; b.style.height = s.h + '%';
      b.classList.toggle('tag-in', s.y < 6);                 // no room above: label sits inside
      placeBoxCallout(q('.callout'), s);
    } else {
      var g = q('.aarrow'); if(!g) return;
      Array.prototype.forEach.call(g.querySelectorAll('line'), function(l){
        l.setAttribute('x1', s.x1 * 12.8); l.setAttribute('y1', s.y1 * 7.2); l.setAttribute('x2', s.x2 * 12.8); l.setAttribute('y2', s.y2 * 7.2);
      });
      var tag = q('.aarrow-tag'); tag.style.left = s.x1 + '%'; tag.style.top = s.y1 + '%';
      tag.classList.toggle('below', s.y1 < 8);                 // label above the start, below near the top
      var h1 = q('.ah-tail'), h2 = q('.ah-head');
      h1.style.left = s.x1 + '%'; h1.style.top = s.y1 + '%'; h2.style.left = s.x2 + '%'; h2.style.top = s.y2 + '%';
      placeCallout(q('.callout'), s.x1, s.y1 + 2.5, s.y1 - 2.5);
    }
  }
  // notes open by growing out of their annotation and close by shrinking back into it. The size check
  // (fitCallout) runs with the animation held, so it measures the note at full size.
  function isCalloutOpen(co){ return !co.hidden && !co.classList.contains('closing'); }
  function setCalloutOpen(co, open){
    clearTimeout(co._closeT);
    if(open){
      co.classList.remove('closing'); co.classList.add('no-anim');
      co.hidden = false; fitCallout(co);
      void co.offsetWidth; co.classList.remove('no-anim');
    } else if(!co.hidden){
      co.classList.add('closing');
      co._closeT = setTimeout(function(){ co.hidden = true; co.classList.remove('closing'); }, 220);
    }
  }
  function shapeClick(ev, sec, s, co){
    ev.stopPropagation();
    if(suppressClick){ suppressClick = false; return; }
    if(annotating){ openPinEditor(s.id); return; }
    var opening = !isCalloutOpen(co);
    Array.prototype.forEach.call(sec.querySelectorAll('.abox.spot'), function(b){ b.classList.remove('spot'); });
    setCalloutOpen(co, opening);
    if(opening && s.type === 'box' && s.spot){ var b = sec.querySelector('.abox[data-aid="' + s.id + '"]'); if(b) b.classList.add('spot'); }
  }
  function renderShape(sec, svg, sc, s, media){
    var co = makeCallout(s); colorStyle(co, s.color);
    if(s.type === 'box'){
      var b = document.createElement('div'); b.className = 'abox'; b.dataset.aid = s.id; colorStyle(b, s.color);
      b.innerHTML = '<span class="abox-tag"></span><span class="abox-h" title="Drag to resize"></span>';
      b.querySelector('.abox-tag').textContent = s.title || 'Area';
      b.querySelector('.abox-tag').dataset.aid = s.id;
      b.appendChild(delButton(s.id));
      b.onclick = function(ev){ shapeClick(ev, sec, s, co); };
      b.onmousedown = function(ev){ if(annotating && !drawTool) startShapeDrag(ev, s, ev.target.classList.contains('abox-h') ? 'resize' : 'move', media, sec); };
      sec.appendChild(b);
    } else {
      var g = document.createElementNS(SVGNS, 'g'); g.setAttribute('class', 'aarrow'); g.setAttribute('data-aid', s.id); colorStyle(g, s.color);
      // each arrow has its own head (a marker takes its color from where it's defined, not the line)
      var mk = document.createElementNS(SVGNS, 'marker'), mid = 'ah-' + s.id;
      ['viewBox:0 0 10 10', 'refX:6.5', 'refY:5', 'markerWidth:4.2', 'markerHeight:4.2', 'orient:auto'].forEach(function(kv){ var p = kv.split(':'); mk.setAttribute(p[0], p[1]); });
      mk.setAttribute('id', mid); mk.innerHTML = '<path class="ahead" d="M0 0 L10 5 L0 10 Z"/>'; colorStyle(mk, s.color);
      svg.querySelector('defs').appendChild(mk);
      g.innerHTML = '<line class="aarrow-hit"/><line class="aarrow-line" marker-end="url(#' + mid + ')"/>';
      svg.appendChild(g);
      var tag = document.createElement('span'); tag.className = 'aarrow-tag'; tag.dataset.aid = s.id; colorStyle(tag, s.color);
      var tagText = document.createElement('span'); tagText.className = 'aarrow-text'; tagText.textContent = s.title || 'Note';
      tag.appendChild(tagText); tag.appendChild(delButton(s.id));
      var h1 = document.createElement('span'); h1.className = 'ahandle ah-tail'; h1.dataset.aid = s.id; h1.title = 'Drag the start';
      var h2 = document.createElement('span'); h2.className = 'ahandle ah-head'; h2.dataset.aid = s.id; h2.title = 'Drag the point';
      var clickIt = function(ev){ shapeClick(ev, sec, s, co); };
      g.addEventListener('click', clickIt); tag.onclick = clickIt;
      colorStyle(h1, s.color); colorStyle(h2, s.color);
      g.addEventListener('mousedown', function(ev){ if(annotating && !drawTool) startShapeDrag(ev, s, 'move', media, sec); });
      tag.onmousedown = function(ev){ if(annotating && !drawTool) startShapeDrag(ev, s, 'move', media, sec); };
      h1.onmousedown = function(ev){ if(annotating) startShapeDrag(ev, s, 'tail', media, sec); };
      h2.onmousedown = function(ev){ if(annotating) startShapeDrag(ev, s, 'head', media, sec); };
      sec.appendChild(tag); sec.appendChild(h1); sec.appendChild(h2);
    }
    sec.appendChild(co);
    placeShape(sec, s);
  }
  function setEnterOrder(sec, aid, n){ Array.prototype.forEach.call(sec.querySelectorAll('[data-aid="' + aid + '"]'), function(el){ el.style.setProperty('--i', n); }); }
  function renderShapes(sec, sc, media){
    var svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('class', 'aarrows'); svg.setAttribute('viewBox', '0 0 1280 720'); svg.setAttribute('preserveAspectRatio', 'none');
    svg.innerHTML = '<defs></defs>';
    sec.appendChild(svg);
    sc.shapes.forEach(function(s, k){ renderShape(sec, svg, sc, s, media); setEnterOrder(sec, s.id, sc.ann.length + k); });
  }
  function removeAnn(aid){
    var r = annById(aid); if(!r) return;
    var p = r.list.indexOf(r.a); if(p >= 0) r.list.splice(p, 1);
    var pages = annData.pages || {};
    Object.keys(pages).forEach(function(k){ if(pages[k] === r.sc && !r.sc.ann.length && !(r.sc.shapes || []).length) delete pages[k]; });   // nothing left on that slide
    var ed = document.getElementById('pin-ed'); if(ed._aid === aid) ed.hidden = true;
    saveAnns(); renderScreens(); rebuildSlides();
  }
  function delButton(aid){
    var x = document.createElement('button'); x.type = 'button'; x.className = 'adel'; x.title = 'Remove'; x.textContent = '\u00d7';
    x.dataset.aid = aid;
    x.onmousedown = function(ev){ ev.stopPropagation(); };
    x.onclick = function(ev){ ev.stopPropagation(); ev.preventDefault(); removeAnn(aid); };
    return x;
  }
  function startShapeDrag(ev, s, mode, media, sec){
    ev.preventDefault(); ev.stopPropagation(); dragMoved = false;
    var rect = media.getBoundingClientRect(), sx = ev.clientX, sy = ev.clientY, o = JSON.parse(JSON.stringify(s));
    function move(e){
      if(!dragMoved && Math.abs(e.clientX - sx) + Math.abs(e.clientY - sy) < 4) return;
      dragMoved = true;
      var dx = (e.clientX - sx) / rect.width * 100, dy = (e.clientY - sy) / rect.height * 100;
      if(s.type === 'box'){
        if(mode === 'move'){ s.x = clamp(o.x + dx, 0, 100 - s.w); s.y = clamp(o.y + dy, 0, 100 - s.h); }
        else { s.w = clamp(o.w + dx, 2, 100 - s.x); s.h = clamp(o.h + dy, 2, 100 - s.y); }
      } else if(mode === 'move'){
        var mx = clamp(dx, -Math.min(o.x1, o.x2), 100 - Math.max(o.x1, o.x2)), my = clamp(dy, -Math.min(o.y1, o.y2), 100 - Math.max(o.y1, o.y2));
        s.x1 = o.x1 + mx; s.x2 = o.x2 + mx; s.y1 = o.y1 + my; s.y2 = o.y2 + my;
      } else if(mode === 'tail'){ s.x1 = clamp(o.x1 + dx, 0, 100); s.y1 = clamp(o.y1 + dy, 0, 100); }
      else { s.x2 = clamp(o.x2 + dx, 0, 100); s.y2 = clamp(o.y2 + dy, 0, 100); }
      placeShape(sec, s);
    }
    function up(){ document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); if(dragMoved){ suppressClick = true; saveAnns(); } }
    document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
  }
  // drag on the screen to draw; a plain click drops a default-sized one
  function drawShape(ev, sc, media, sec){
    ev.preventDefault(); ev.stopPropagation();
    sc = claimSet(sc, media);
    var rect = media.getBoundingClientRect(), tool = drawTool;
    var px = (ev.clientX - rect.left) / rect.width * 100, py = (ev.clientY - rect.top) / rect.height * 100;
    var s = tool === 'box' ? { id: nid(), type: 'box', x: px, y: py, w: 0, h: 0, title: 'Area', note: '', spot: true }
                           : { id: nid(), type: 'arrow', x1: px, y1: py, x2: px, y2: py, title: 'Note', note: '' };
    if(nextColor) s.color = nextColor;
    sc.shapes.push(s);
    renderShape(sec, sec.querySelector('.aarrows'), sc, s, media);
    var moved = false;
    function move(e){
      var x = clamp((e.clientX - rect.left) / rect.width * 100, 0, 100), y = clamp((e.clientY - rect.top) / rect.height * 100, 0, 100);
      moved = moved || Math.abs(x - px) + Math.abs(y - py) > 1;
      if(tool === 'box'){ s.x = Math.min(px, x); s.y = Math.min(py, y); s.w = Math.abs(x - px); s.h = Math.abs(y - py); }
      else { s.x2 = x; s.y2 = y; }
      placeShape(sec, s);
    }
    function up(){
      document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up);
      if(!moved || (tool === 'box' && (s.w < 2 || s.h < 2))){
        if(tool === 'box'){ s.w = 20; s.h = 16; s.x = clamp(px - 10, 0, 80); s.y = clamp(py - 8, 0, 84); }
        else { s.x2 = clamp(px + 12, 0, 100); s.y2 = clamp(py - 8, 0, 100); }
      }
      ['x', 'y', 'w', 'h', 'x1', 'y1', 'x2', 'y2'].forEach(function(k){ if(typeof s[k] === 'number') s[k] = r1(s[k]); });
      setTool(null); saveAnns(); renderScreens(); rebuildSlides(); openPinEditor(s.id);
    }
    document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
  }

  function startDrag(ev, a, pin, co, media){
    ev.preventDefault(); ev.stopPropagation(); dragMoved = false;
    var rect = media.getBoundingClientRect();
    function move(e){
      dragMoved = true;
      var x = ((e.clientX - rect.left)/rect.width)*100, y = ((e.clientY - rect.top)/rect.height)*100;
      a.x = Math.max(2, Math.min(98, x)); a.y = Math.max(3, Math.min(97, y));
      pin.style.left = a.x+'%'; pin.style.top = a.y+'%'; co.style.left = a.x+'%'; co.style.top = a.y+'%';
      var px = pin.parentNode && pin.parentNode.querySelector('.adel-pin[data-aid="' + a.id + '"]'); if(px){ px.style.left = a.x+'%'; px.style.top = a.y+'%'; }
    }
    function up(){ document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); if(dragMoved){ suppressClick = true; saveAnns(); } }
    document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
  }

  function addAnnotationAt(sc, ev, media){
    var rect = media.getBoundingClientRect();
    var x = ((ev.clientX - rect.left)/rect.width)*100, y = ((ev.clientY - rect.top)/rect.height)*100;
    var a = { id:nid(), x:Math.max(2,Math.min(98,x)), y:Math.max(3,Math.min(97,y)), title:'', note:'' };   // unnamed until you name it (it reads "Note" meanwhile)
    if(nextColor) a.color = nextColor;
    sc = claimSet(sc, media); sc.ann.push(a); setTool(null);
    saveAnns(); renderScreens(); rebuildSlides(); openPinEditor(a.id);
  }

  function openPinEditor(aid){
    var ref = annById(aid); if(!ref) return;
    var pin = annEls(aid, '.pin, .abox-tag, .aarrow-tag')[0]; if(!pin) return;
    var ed = document.getElementById('pin-ed'); ed._aid = aid;
    ed.querySelector('.pe-title').value = ref.a.title || '';
    ed.querySelector('.pe-note').innerHTML = noteHTML(ref.a.note);
    var isBox = ref.a.type === 'box';
    ed.querySelector('.pe-spot').hidden = !isBox;
    ed.querySelector('.pe-spot input').checked = !!ref.a.spot;
    renderEditorThumbs(); paintEditorColors();
    var more = ed.querySelector('.pe-more'); if(more) more.open = !!((ref.a.images && ref.a.images.length) || ref.a.spot);
    var r = pin.getBoundingClientRect();
    ed.style.left = Math.max(12, Math.min(r.left, window.innerWidth - 312)) + 'px';
    ed.hidden = false;
    ed.style.top = Math.max(12, Math.min(r.bottom + 8, window.innerHeight - ed.offsetHeight - 12)) + 'px';
    ed.querySelector('.pe-title').focus();
  }

  function afterShow(){
    var pe = document.getElementById('pin-ed'); if(pe) pe.hidden = true;
    if(!editing && !annotating) return;
    if(editing) editAnns();                           // this slide's annotations, editable with it (or not)
    setAddMenu(false);
    placeHandle(); updateSizeBar();
  }

  // One Edit mode: text, tiles, names, notes, and the slide's pins and arrows (their tools sit in the
  // same bar). The bar shows what applies to what is selected: paintContext().
  function paintModes(){
    document.body.classList.toggle('editing', editing);
    document.body.classList.toggle('annotating', annotating);
    document.getElementById('editbar').hidden = !(editing || annotating);
    document.getElementById('eb-text').hidden = !editing;
    document.getElementById('eb-annot').hidden = !annotating;
    document.getElementById('editbtn').setAttribute('aria-pressed', String(editing));
    paintCarBar();
    syncFilmstrips();   // a strip measures its pictures again without Edit mode's Add picture
    paintContext(); fit();
  }
  // what the bar is about: the text you are in, a pin or arrow being placed or edited, or the slide
  var TEXT_NAMES = [['.display', 'Headline'], ['.overline, .section-no, .lbl, .lh', 'Label'], ['.taglist li, .lcol li', 'Bullet'], ['.cap', 'Caption'], ['.meta', 'Detail'], ['.card-item span', 'Card']];
  function paintContext(){
    var eb = document.getElementById('editbar'), what = document.getElementById('eb-what'), pe = document.getElementById('pin-ed'); if(!eb || !what) return;
    var block = editing && activeBlock && activeBlock.closest('#stage .slide.active') ? activeBlock : null, ref = pe && !pe.hidden ? annById(pe._aid) : null;
    var ctx = (addingNote || drawTool) ? 'tool' : ref ? 'ann' : block ? 'text' : 'slide', name = 'Slide';
    if(ctx === 'tool') name = addingNote ? 'Click the slide to place the pin' : 'Drag on the slide to draw the arrow';
    else if(ctx === 'text'){ name = 'Text'; TEXT_NAMES.some(function(r){ if(block.matches(r[0])){ name = r[1]; return true; } return false; }); }
    else if(ctx === 'ann') name = ref.a.type === 'arrow' ? 'Arrow' : ref.a.type === 'box' ? 'Box' : 'Pin';
    if(eb.getAttribute('data-ctx') !== ctx) eb.setAttribute('data-ctx', ctx);
    if(what.firstChild.textContent !== name) what.firstChild.textContent = name;
    what.disabled = ctx === 'slide' || ctx === 'tool';
    what.title = ctx === 'text' ? 'Back to the slide (Esc)' : ctx === 'ann' ? 'Close the note (Esc)' : '';
    if(!eb.hidden) fit();                                   // the bar's width changed with what it shows
  }
  // out of the text you were in: the bar goes back to the slide
  function leaveText(){
    var a = document.activeElement; if(a && a.closest && a.closest('#stage [data-eid]')) a.blur();
    activeBlock = null; placeHandle(); updateSizeBar();
  }
  // Edit edits the slide's pins and arrows too: Annotate rides alongside, on every slide
  var annotByEdit = false;
  function editAnns(){
    var want = editing;
    if(want === annotating || (annotating && !annotByEdit)) return;
    annotByEdit = want; setAnnotating(want);
  }
  function toggleEdit(){
    if(PUBLISHED && !editing) return;
    if(annotating && !annotByEdit) setAnnotating(false);
    editing = !editing;
    if(!editing && annotByEdit){ annotByEdit = false; setAnnotating(false); }
    paintModes();
    setTextEditable(editing);
    setNotesEditable(editing);
    setLabelEditable(editing);
    if(!editing) activeBlock = null;
    placeHandle(); updateSizeBar();
    if(editing){ editAnns(); afterShow(); }
  }
  function setAnnotating(on){
    annotating = on;
    paintModes();
    if(annotating){
      if(!annotOn) toggleAnnot();                     // you can't edit what's hidden
      paintBarColors(); afterShow();
    } else {
      setTool(null); setAddMenu(false);
      document.getElementById('pin-ed').hidden = true;
    }
  }
  function toggleAnnotate(){
    var on = !annotating || annotByEdit;              // from Edit (with its annotations): Annotate alone
    if(editing) toggleEdit();
    annotByEdit = false;
    setAnnotating(on);
  }
  function closeModes(){ if(editing) toggleEdit(); else if(annotating) toggleAnnotate(); }

  function shapesOut(list){
    return (list || []).map(function(x){
      var o = { type: x.type, title: x.title, note: x.note };
      if(x.color) o.color = x.color;
      if(x.type === 'box'){ o.x = r1(x.x); o.y = r1(x.y); o.w = r1(x.w); o.h = r1(x.h); o.spot = !!x.spot; }
      else { o.x1 = r1(x.x1); o.y1 = r1(x.y1); o.x2 = r1(x.x2); o.y2 = r1(x.y2); }
      return o;
    });
  }
  document.getElementById('editbtn').onclick = toggleEdit;
  // double-click a slide to start editing it: the word you double-clicked comes up selected, ready to retype
  stage.addEventListener('dblclick', function(e){
    if(e.target.closest('.media, .pin, .callout, .abox, .aarrow, a, button, video, iframe, [data-press]')) return;   // those have their own click
    editAt(e, e.target.closest('[data-eid]'));
  });
  function editAt(e, t){
    if(PUBLISHED || editing || annotating || POPOUT || MIRROR || featureOpen() || (viewer && !viewer.el.hidden)) return;
    e.preventDefault();
    toggleEdit();
    if(!t) return;
    t.focus({ preventScroll: true });
    var r = document.caretRangeFromPoint ? document.caretRangeFromPoint(e.clientX, e.clientY) : null, sel = window.getSelection();
    if(r && t.contains(r.startContainer)){
      sel.removeAllRanges(); sel.addRange(r);
      try { sel.modify('move', 'backward', 'word'); sel.modify('extend', 'forward', 'word'); } catch(_){}
    }
  }
  document.getElementById('eb-done').onclick = closeModes;
  document.getElementById('eb-what').onclick = function(){ var pe = document.getElementById('pin-ed'); if(pe && !pe.hidden) pe.hidden = true; else leaveText(); };
  var peEl = document.getElementById('pin-ed');
  new MutationObserver(function(){ paintContext(); }).observe(peEl, { attributes: true, attributeFilter: ['hidden'] });
  peEl.querySelector('.pe-title').oninput = function(){
    var r = annById(peEl._aid); if(!r) return; r.a.title = this.value;
    var label = this.value || (r.a.type === 'box' ? 'Area' : 'Note');
    Array.prototype.forEach.call(document.querySelectorAll('#stage .callout[data-aid="'+peEl._aid+'"] .ch, #stage .abox-tag[data-aid="'+peEl._aid+'"], #stage .aarrow-tag[data-aid="'+peEl._aid+'"] .aarrow-text'), function(el){ el.textContent = label; });
    paintImgBadge(peEl._aid); saveAnns();
  };
  function paintEditorColors(){
    var r = annById(peEl._aid); if(!r) return;
    swatchRow(peEl.querySelector('.pe-colors'), r.a.color, function(c){
      setAnnColor(peEl._aid, c);
      nextColor = c; try { localStorage.setItem(NS + 'deck-ann-color', c); } catch(e){} paintBarColors();   // new ones follow your last pick
    });
  }
  peEl.querySelector('.pe-spot input').onchange = function(){ var r = annById(peEl._aid); if(!r) return; r.a.spot = this.checked; saveAnns(); };
  var noteEd = peEl.querySelector('.pe-note');
  function saveNote(){
    var r = annById(peEl._aid); if(!r) return;
    r.a.note = cleanNote(noteEd.innerHTML);
    if(!r.a.note && noteEd.innerHTML) noteEd.innerHTML = '';            // keep the placeholder showing when it's emptied
    var el = annEls(peEl._aid, '.callout')[0], cbx = el && el.querySelector('.cb'); if(cbx) cbx.innerHTML = r.a.note;
    saveAnns(); fmtState();
  }
  // which formatting buttons are on at the caret
  function fmtState(){
    Array.prototype.forEach.call(peEl.querySelectorAll('.pe-fmt [data-cmd]'), function(b){
      var on = false; try { on = document.queryCommandState(b.dataset.cmd); } catch(_){}
      b.setAttribute('aria-pressed', String(on));
    });
  }
  noteEd.addEventListener('input', function(e){
    // "- ", "* " or "• " at the start of a line starts a bulleted list
    var sel = window.getSelection();
    if(/^insert(Text|ReplacementText)$/.test(e.inputType) && sel.rangeCount){
      var n = sel.anchorNode, off = sel.anchorOffset;
      if(n && n.nodeType === 3 && !n.previousSibling && off >= 2 && /^[-*•][\s\u00a0]/.test(n.nodeValue) && !n.parentNode.closest('li')){
        n.nodeValue = n.nodeValue.slice(2);
        // turn this line into a list item (joining a list just above it); built by hand because
        // execCommand's list drops the caret when the line is half typed
        var block = n.parentNode !== noteEd && n.parentNode.parentNode === noteEd ? n.parentNode : n;
        var li = document.createElement('li'), prev = block.previousSibling, ul;
        if(prev && prev.nodeName === 'UL') ul = prev; else { ul = document.createElement('ul'); noteEd.insertBefore(ul, block); }
        if(block === n) li.appendChild(n); else { while(block.firstChild) li.appendChild(block.firstChild); block.remove(); }
        ul.appendChild(li);
        var rg = document.createRange(); rg.setStart(n, off - 2); rg.collapse(true); sel.removeAllRanges(); sel.addRange(rg);
      }
    }
    saveNote();
  });
  noteEd.addEventListener('keydown', function(e){
    var inLi = window.getSelection().anchorNode, li = inLi && (inLi.nodeType === 1 ? inLi : inLi.parentNode).closest('li');
    if(e.key === 'Tab' && li){ e.preventDefault(); document.execCommand(e.shiftKey ? 'outdent' : 'indent'); saveNote(); }
  });
  noteEd.addEventListener('paste', function(e){
    e.preventDefault();
    var cd = e.clipboardData, files = Array.prototype.filter.call(cd.files || [], function(f){ return /^image\//.test(f.type); });
    if(files.length){ attachImages(files); return; }                   // a pasted screenshot attaches to the annotation
    var html = cd.getData('text/html');
    document.execCommand('insertHTML', false, html ? cleanNote(html) : escText(cd.getData('text/plain')).replace(/\n/g, '<br>'));
  });
  ['keyup', 'mouseup', 'focus'].forEach(function(ev){ noteEd.addEventListener(ev, fmtState); });
  // attaching images: picked, pasted or dropped; kept exactly as supplied (no resizing or re-encoding)
  function renderEditorThumbs(){
    var r = annById(peEl._aid), box = peEl.querySelector('.pe-thumbs'); box.innerHTML = '';
    ((r && r.a.images) || []).forEach(function(src, k){
      var t = document.createElement('div'); t.className = 'pe-thumb';
      t.innerHTML = '<img src="' + src + '" alt=""><button type="button" aria-label="Remove image" title="Remove image">\u00d7</button>';
      t.querySelector('img').onclick = function(){ openImageViewer(r.a.images, k, t.querySelector('img')); };
      t.querySelector('button').onclick = function(){ r.a.images.splice(k, 1); saveAnns(); renderEditorThumbs(); refreshCalloutImages(peEl._aid); };
      box.appendChild(t);
    });
  }
  function attachImages(files){
    var r = annById(peEl._aid); if(!r) return;
    var aid = peEl._aid, left = files.length;
    r.a.images = r.a.images || [];
    Array.prototype.forEach.call(files, function(f){
      var rd = new FileReader();
      rd.onload = function(){
        r.a.images.push(rd.result);
        if(--left === 0){ saveAnns(); if(peEl._aid === aid) renderEditorThumbs(); refreshCalloutImages(aid); }
      };
      rd.readAsDataURL(f);
    });
  }
  peEl.querySelector('.pe-attach input').addEventListener('change', function(e){ if(e.target.files.length) attachImages(e.target.files); e.target.value = ''; });
  peEl.addEventListener('dragover', function(e){ if(e.dataTransfer && Array.prototype.some.call(e.dataTransfer.items || [], function(it){ return it.kind === 'file'; })){ e.preventDefault(); peEl.classList.add('drop'); } });
  peEl.addEventListener('dragleave', function(e){ if(!peEl.contains(e.relatedTarget)) peEl.classList.remove('drop'); });
  peEl.addEventListener('drop', function(e){
    peEl.classList.remove('drop');
    var files = Array.prototype.filter.call((e.dataTransfer && e.dataTransfer.files) || [], function(f){ return /^image\//.test(f.type); });
    if(files.length){ e.preventDefault(); attachImages(files); }
  });
  Array.prototype.forEach.call(peEl.querySelectorAll('.pe-fmt [data-cmd]'), function(b){
    b.addEventListener('mousedown', function(e){ e.preventDefault(); });   // keep the selection in the note
    b.addEventListener('click', function(){ noteEd.focus(); document.execCommand(b.dataset.cmd); saveNote(); });
  });
  document.getElementById('pe-del').onclick = function(){ removeAnn(peEl._aid); };
  document.getElementById('pe-done').onclick = function(){ peEl.hidden = true; };
  window.addEventListener('storage', function(e){ if(e.key===NS + 'sleek-ann-ping'){ reloadAnns(); } });
  window.addEventListener('storage', function(e){ if(e.key===NS + 'sleek-media-ping'){ reloadMedia(); } });

  // ================= free text editing (all static slides) =================
  // Any text block on a non-screen slide can be edited live in edit mode.
  // Edits are keyed by a stable id (document order of the static markup),
  // persisted on this device, and mirrored to the audience window.
  var TEDIT_SEL = '.overline, .display, .lead, .one, .body, .section-no, .lbl, .lh, .taglist li, .cap, .meta, .card-item span, .lcol li';
  var textOverrides = {};
  try { textOverrides = JSON.parse(localStorage.getItem(NS + 'deck-text') || '{}') || {}; } catch(e){ textOverrides = {}; }
  var tSaveTimer = null;
  function saveText(){
    if(tSaveTimer) clearTimeout(tSaveTimer);
    tSaveTimer = setTimeout(function(){ try { localStorage.setItem(NS + 'deck-text', JSON.stringify(textOverrides)); } catch(e){} }, 250);
    markChanged();
  }
  // A bullet deleted in edit mode keeps its id (so nothing after it shifts) and saves as this marker:
  // gone when presenting, a dashed "click to restore" row in edit mode
  var TX_GONE = '<!--removed-->', TX_DEL_SEL = '.taglist li, .lcol li';
  function markGone(el){
    el.classList.toggle('tx-gone', el.innerHTML === TX_GONE);
    var fr = el.classList.contains('cap') && el.closest('.fs-frame');   // a film strip picture is removed by its caption's marker
    if(fr){ fr.classList.toggle('fs-gone', el.innerHTML === TX_GONE); fsMinMark(fr.closest('.fs-set')); }
    var ct = el.classList.contains('cap') && el.closest('.s-carousel .car-set:not(.car-copy) > .media');   // and a carousel's
    if(ct){ ct.classList.toggle('car-gone', el.innerHTML === TX_GONE); carMark(ct.closest('.car-set')); }
  }
  // a carousel has 1 to 5 pictures, the same way: removing one (its ×, or Delete over it in Edit mode)
  // marks its caption, and Add picture brings back one that's out
  var CAR_MIN = 1, CAR_MAX = 5;
  function carLeft(set){ return set ? set.querySelectorAll(':scope > .media:not(.car-gone)').length : 0; }
  function carMark(set){
    if(!set || set.classList.contains('car-copy')) return;
    var n = carLeft(set);
    set.classList.toggle('car-min', n <= CAR_MIN);
    set.classList.toggle('car-full', n >= CAR_MAX || !set.querySelector(':scope > .media.car-gone'));
    if(!set.querySelector(':scope > .car-add')){
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'car-add'; b.innerHTML = '<span>+</span>Add picture';
      b.addEventListener('click', function(ev){ ev.stopPropagation(); addCarTile(set); });
      set.appendChild(b);
    } else set.appendChild(set.querySelector(':scope > .car-add'));   // always last
  }
  function addCarTile(set){
    var t = set.querySelector(':scope > .media.car-gone'), cap = t && t.querySelector('.cap[data-eid]');
    if(!cap || carLeft(set) >= CAR_MAX){ showToast('A carousel holds up to ' + CAR_MAX + ' pictures'); return; }
    var eid = cap.getAttribute('data-eid'), was = domBaseline[eid];
    set.insertBefore(t, set.querySelector(':scope > .car-add')); saveCarOrder(set);   // it joins at the end
    cap.innerHTML = was && was !== TX_GONE ? was : 'Caption'; onTextInput(cap, eid);
    curMid = t.getAttribute('data-mid');                                   // then pick its picture
    var f = document.getElementById('media-file'); f.value = ''; f.click();
  }
  function removeCarTile(t){
    var set = t.closest('.car-set'), cap = t.querySelector('.cap[data-eid]');
    if(!cap) return;
    if(carLeft(set) <= CAR_MIN){ showToast('A carousel keeps at least one picture'); return; }
    cap.innerHTML = TX_GONE; onTextInput(cap, cap.getAttribute('data-eid'));
    showToast('Picture removed from the carousel', true);
  }
  // A carousel's own order: the slide keeps its pictures' places as a list of their names (co), so the
  // names never move (each picture keeps its words and its Before) while the pictures do. Add picture
  // puts the one it brings back last; in Edit mode, drag a picture to its new place.
  function carEntry(set){ var s = set && set.closest('.slide'), id = s && s.getAttribute('data-added'); return id ? ADDED.filter(function(a){ return a.id === id; })[0] || null : null; }
  function carKey(m){ var mid = m.getAttribute('data-mid') || ''; return mid.slice(mid.indexOf('.') + 1); }
  function carTiles(set){ return Array.prototype.slice.call(set.querySelectorAll(':scope > .media')); }
  function applyCarOrders(){
    Array.prototype.forEach.call(document.querySelectorAll('#stage .s-carousel .car-set:not(.car-copy)'), function(set){
      var a = carEntry(set); if(!a || !Array.isArray(a.co)) return;
      var by = {}; carTiles(set).forEach(function(m){ by[carKey(m)] = m; });
      var add = set.querySelector(':scope > .car-add');
      a.co.forEach(function(k){ if(by[k]){ set.insertBefore(by[k], add); delete by[k]; } });
      Object.keys(by).forEach(function(k){ set.insertBefore(by[k], add); });   // any not in the list stay after, as they were
    });
  }
  function saveCarOrder(set){
    var a = carEntry(set); if(!a) return;
    a.co = carTiles(set).map(carKey);
    saveAdded(); markChanged(); pingReload();
  }
  // drag a picture along the carousel (Edit mode): the others make room as it passes them
  var carDrag = null;
  document.addEventListener('pointerdown', function(e){
    if(!editing || e.button !== 0) return;
    var m = e.target.closest && e.target.closest('#stage .slide.active .s-carousel .car-set:not(.car-copy) > .media, #stage .slide.active.s-carousel .car-set:not(.car-copy) > .media');
    if(!m || e.target.closest('.cap, .media-clear, .media-before, .media-split .msp-b, .cl-opt, button')) return;
    carDrag = { m: m, set: m.parentNode, car: m.closest('.carousel'), x: e.clientX, y: e.clientY, id: e.pointerId, on: false };
  }, true);
  function carDragPlace(){
    var d = carDrag; if(!d || !d.on) return;
    var k = stage.getBoundingClientRect().width / 1280, r = d.m.getBoundingClientRect();
    // the picture stays under the pointer wherever the others put it
    var homeX = r.left - (d.tx || 0) * k;
    d.tx = (d.px - d.grab - homeX) / k;
    d.m.style.transform = 'translateX(' + d.tx + 'px) scale(1.03)';
  }
  document.addEventListener('pointermove', function(e){
    var d = carDrag; if(!d || e.pointerId !== d.id) return;
    if(!d.on){
      if(Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) < 8) return;
      d.on = true; d.grab = d.x - d.m.getBoundingClientRect().left; d.tx = 0;
      d.m.classList.add('car-lift'); document.body.classList.add('car-sorting');
      d.raf = requestAnimationFrame(function edge(){                    // near an edge, the strip scrolls on
        if(carDrag !== d) return;
        var cr = d.car.getBoundingClientRect(), v = d.px < cr.left + 90 ? -(cr.left + 90 - d.px) : d.px > cr.right - 90 ? d.px - (cr.right - 90) : 0;
        if(v){ d.car.scrollLeft += v * 0.3; carDragPlace(); }
        d.raf = requestAnimationFrame(edge);
      });
    }
    e.preventDefault();
    d.px = e.clientX;
    // past the middle of a neighbour: swap places with it
    var tiles = carTiles(d.set).filter(function(t){ return t !== d.m && !t.classList.contains('car-gone'); });
    var mid = d.px - d.grab + d.m.offsetWidth * (stage.getBoundingClientRect().width / 1280) / 2, before = null;
    for(var j = 0; j < tiles.length; j++){ var tr = tiles[j].getBoundingClientRect(); if(mid < tr.left + tr.width / 2){ before = tiles[j]; break; } }
    var ref = before || d.set.querySelector(':scope > .car-add');
    if(d.m.nextSibling !== ref && ref !== d.m){
      var first = {}; carTiles(d.set).forEach(function(t){ if(t !== d.m) first[carKey(t)] = t.getBoundingClientRect().left; });
      d.set.insertBefore(d.m, ref);
      carTiles(d.set).forEach(function(t){                               // the others glide to their new places
        if(t === d.m || first[carKey(t)] == null) return;
        var dx = first[carKey(t)] - t.getBoundingClientRect().left; if(!dx) return;
        t.style.transition = 'none'; t.style.transform = 'translateX(' + dx / (stage.getBoundingClientRect().width / 1280) + 'px)';
        void t.offsetWidth; t.style.transition = 'transform .28s cubic-bezier(.2,.8,.2,1)'; t.style.transform = '';
      });
    }
    carDragPlace();
  });
  function carDragEnd(e){
    var d = carDrag; if(!d || (e && e.pointerId !== d.id)) return;
    carDrag = null; cancelAnimationFrame(d.raf);
    if(!d.on) return;
    d.m.classList.remove('car-lift'); document.body.classList.remove('car-sorting');
    d.m.style.transition = 'transform .25s cubic-bezier(.2,.8,.2,1)'; d.m.style.transform = '';
    setTimeout(function(){ d.m.style.transition = ''; }, 260);
    var swallow = function(ev){ ev.stopPropagation(); ev.preventDefault(); window.removeEventListener('click', swallow, true); };   // not "replace it"
    window.addEventListener('click', swallow, true); setTimeout(function(){ window.removeEventListener('click', swallow, true); }, 60);
    saveCarOrder(d.set); syncFilmstrips(); renderPresenter();
  }
  document.addEventListener('pointerup', carDragEnd); document.addEventListener('pointercancel', carDragEnd);

  // Delete (or Backspace) over a carousel's or film strip's picture in Edit mode takes it out
  var overTile = null;
  document.addEventListener('mouseover', function(e){ overTile = e.target.closest ? e.target.closest('#stage .slide.active .car-set:not(.car-copy) > .media, #stage .slide.active .fs-set:not(.fs-copy) > .fs-frame') : null; });
  document.addEventListener('keydown', function(e){
    if(!editing || (e.key !== 'Delete' && e.key !== 'Backspace') || !overTile || !document.body.contains(overTile)) return;
    var a = document.activeElement; if(a && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))) return;   // typing
    if(window.Deck && Deck.modal) return;
    e.preventDefault();
    if(overTile.classList.contains('fs-frame')) removeFrame(overTile); else removeCarTile(overTile);
  });
  // a film strip has 2 to 5 pictures: at the fewest their × can't remove one; below the most, Edit mode
  // offers "Add picture", which brings back a frame that's out (the layout's spare, or one you removed)
  var FS_MIN = 2, FS_MAX = 5;
  function fsLeft(set){ return set ? set.querySelectorAll('.fs-frame:not(.fs-gone)').length : 0; }
  function fsMinMark(set){
    if(!set || set.classList.contains('fs-copy')) return;
    var n = fsLeft(set);
    set.classList.toggle('fs-min', n <= FS_MIN);
    set.classList.toggle('fs-full', n >= FS_MAX || !set.querySelector('.fs-frame.fs-gone'));
    // in Edit mode the strip is drawn to fit its pictures (and Add picture), so every count reads whole
    var strip = set.closest('.filmstrip'), sl = set.closest('.slide');
    if(strip){
      var k = n + (set.classList.contains('fs-full') ? 0 : 1), h = k * 142 + (k - 1) * 14;
      strip.style.setProperty('--fs-edit-scale', Math.min(1.5, ((sl && sl.offsetHeight) || 900) * 0.92 / h).toFixed(3));
    }
    if(!set.querySelector(':scope > .fs-add')){
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'fs-add'; b.innerHTML = '<span>+</span>Add picture';
      b.addEventListener('click', function(ev){ ev.stopPropagation(); addFrame(set); });
      set.appendChild(b);
    }
  }
  function addFrame(set){
    var fr = set.querySelector('.fs-frame.fs-gone'), cap = fr && fr.querySelector('.cap[data-eid]');
    if(!cap || fsLeft(set) >= FS_MAX){ showToast('A film strip holds up to ' + FS_MAX + ' pictures'); return; }
    var eid = cap.getAttribute('data-eid'), was = domBaseline[eid];      // a removed picture comes back with its own name
    cap.innerHTML = was && was !== TX_GONE ? was : 'Caption'; onTextInput(cap, eid);
    curMid = fr.getAttribute('data-mid');                                  // then pick its picture
    var f = document.getElementById('media-file'); f.value = ''; f.click();
  }
  function removeFrame(fr){
    var set = fr.closest('.fs-set'), cap = fr.querySelector('.cap[data-eid]');
    if(!cap) return;
    if(fsLeft(set) <= FS_MIN){ showToast('A film strip keeps at least ' + FS_MIN + ' pictures'); return; }
    cap.innerHTML = TX_GONE; onTextInput(cap, cap.getAttribute('data-eid'));
    showToast('Picture removed from the strip', true);
  }
  function onTextInput(el, eid){
    markGone(el);
    textOverrides[eid] = el.innerHTML;
    if(el.closest('.fs-track, .car-track')) syncFilmstrips();
    saveText();
    var payload = { eid: eid, html: el.innerHTML, t: Date.now() };
    try { if(bc) bc.postMessage({ textEid: eid, textHtml: el.innerHTML, t: Date.now() }); } catch(e){}
    try { localStorage.setItem(NS + 'sleek-textsync', JSON.stringify(payload)); } catch(e){}
    renderPresenter();
    placeHandle();
  }
  function applyRemoteText(eid, html){
    if(eid == null) return;
    var el = document.querySelector('[data-eid="'+eid+'"]');
    textOverrides[eid] = html;
    saveText();
    if(el && el.innerHTML !== html){ el.innerHTML = html; if(el.closest('.fs-track, .car-track')) syncFilmstrips(); }
    if(el) markGone(el);
    renderPresenter();
  }
  var domBaseline = {};
  function seedTextFor(eid){ return (SEED.text && SEED.text[eid] != null) ? SEED.text[eid] : domBaseline[eid]; }
  function setupText(){
    var statics = document.querySelectorAll('.slide:not(.s-screen)');
    Array.prototype.forEach.call(statics, function(sl){
      var idx = 0, pre = (sl.getAttribute('data-added') || 'x') + '.';   // named for its slide
      Array.prototype.forEach.call(sl.querySelectorAll(TEDIT_SEL), function(el){
        var sp = el.getAttribute('data-spare');
        var eid = el.getAttribute('data-eid') || (sp ? pre + 'xt' + sp : pre + 't' + (idx++));   // a carousel's spare: its own name
        el.setAttribute('data-eid', eid);
        domBaseline[eid] = el.innerHTML;
        var html = (textOverrides[eid] != null) ? textOverrides[eid] : seedTextFor(eid);
        if(el.innerHTML !== html){ el.innerHTML = html; }
        markGone(el);
        linkTargets(el);
        el.addEventListener('input', function(){ onTextInput(el, eid); });
        el.addEventListener('blur', function(){ onTextInput(el, eid); });
      });
    });
  }
  // ---------- links in slide text ----------
  // Select text in edit mode, then Link (or Cmd/Ctrl+K): paste an address, Apply. On an existing
  // link the same popover edits or removes it. Links open in a new tab when presenting.
  function linkTargets(root){
    Array.prototype.forEach.call(root.querySelectorAll('a[href]:not([href^="#open:"])'), function(a){ a.target = '_blank'; a.rel = 'noopener noreferrer'; });   // not the notes' links to the slide
  }
  var linkPop = document.getElementById('link-pop'), linkInput = linkPop.querySelector('input'), linkCtx = null;
  function blockOf(node){ var el = node && (node.nodeType === 1 ? node : node.parentNode); return el && el.closest && el.closest('#stage [data-eid].tedit'); }
  function openLinkPop(){
    var sel = window.getSelection(); if(!editing || !sel.rangeCount) return;
    var range = sel.getRangeAt(0), block = blockOf(range.commonAncestorContainer); if(!block) return;
    var start = range.startContainer, a = (start.nodeType === 1 ? start : start.parentNode).closest('a[href]');
    if(a && !block.contains(a)) a = null;
    if(range.collapsed && !a) { flashLinkHint(); return; }               // nothing selected, not on a link
    linkCtx = { block: block, range: range.cloneRange(), a: a };
    linkInput.value = a ? a.getAttribute('href') : '';
    linkPop.querySelector('.lp-rm').hidden = !a;
    var r = (a || range).getBoundingClientRect();
    linkPop.hidden = false;
    linkPop.style.left = Math.max(12, Math.min(r.left, window.innerWidth - linkPop.offsetWidth - 12)) + 'px';
    linkPop.style.top = Math.min(r.bottom + 10, window.innerHeight - linkPop.offsetHeight - 12) + 'px';
    linkInput.focus(); linkInput.select();
  }
  function flashLinkHint(){
    var h = document.querySelector('#eb-link .lbl');
    h.textContent = 'Select words first'; setTimeout(function(){ h.textContent = 'Link'; }, 1800);
  }
  function closeLinkPop(){ linkPop.hidden = true; linkCtx = null; }
  function normalizeUrl(u){
    u = u.trim(); if(!u) return '';
    if(/^(https?:|mailto:|tel:|#)/i.test(u)) return u;
    if(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(u)) return 'mailto:' + u;
    return 'https://' + u.replace(/^\/+/, '');
  }
  function restoreSel(ctx){ ctx.block.focus(); var s = window.getSelection(); s.removeAllRanges(); s.addRange(ctx.range); }
  function applyLink(){
    var ctx = linkCtx, url = normalizeUrl(linkInput.value); if(!ctx) return;
    if(!url){ removeLink(); return; }
    if(ctx.a) ctx.a.setAttribute('href', url);
    else { restoreSel(ctx); document.execCommand('createLink', false, url); }
    linkTargets(ctx.block);
    ctx.block.dispatchEvent(new Event('input'));
    closeLinkPop();
  }
  function removeLink(){
    var ctx = linkCtx; if(!ctx) return;
    if(ctx.a){ var a = ctx.a; while(a.firstChild) a.parentNode.insertBefore(a.firstChild, a); a.remove(); }
    else { restoreSel(ctx); document.execCommand('unlink'); }
    ctx.block.dispatchEvent(new Event('input'));
    closeLinkPop();
  }
  linkPop.querySelector('.lp-ok').onclick = applyLink;
  linkPop.querySelector('.lp-rm').onclick = removeLink;
  linkInput.addEventListener('keydown', function(e){
    if(e.key === 'Enter'){ e.preventDefault(); applyLink(); }
    else if(e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); var c = linkCtx; closeLinkPop(); if(c) restoreSel(c); }
  });
  document.addEventListener('mousedown', function(e){ if(!linkPop.hidden && !linkPop.contains(e.target) && e.target.id !== 'eb-link') closeLinkPop(); });
  var linkBtn = document.getElementById('eb-link');
  linkBtn.addEventListener('mousedown', function(e){ e.preventDefault(); });   // keep the selection
  linkBtn.onclick = openLinkPop;
  // Link is available whenever the caret or a selection is in slide text
  document.addEventListener('selectionchange', function(){ linkBtn.disabled = !(editing && blockOf(window.getSelection().anchorNode)); });
  document.addEventListener('keydown', function(e){
    if((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K') && editing && blockOf(window.getSelection().anchorNode)){
      e.preventDefault(); openLinkPop();
    }
  });

  function setTextEditable(on){
    var els = document.querySelectorAll('.slide:not(.s-screen) [data-eid]');
    Array.prototype.forEach.call(els, function(el){
      el.contentEditable = on ? 'true' : 'false';
      el.classList.toggle('tedit', on);
      if(on){ el.setAttribute('spellcheck','true'); }
    });
  }

  function exportText(){
    // full snapshots: "text" is everything that differs from the markup, "style" every sized block
    var text = {}, style = {};
    Array.prototype.forEach.call(document.querySelectorAll('.slide:not(.s-screen) [data-eid]'), function(el){
      var eid = el.getAttribute('data-eid');
      if(el.innerHTML !== domBaseline[eid]) text[eid] = el.innerHTML;
      var st = styleFor(eid); if(st.w != null || st.fs != null) style[eid] = st;
    });
    Array.prototype.forEach.call(document.querySelectorAll('.slide:not(.s-screen) .media[data-resize][data-mid]'), function(m){
      var key = styleKey(m), st = styleFor(key); if(st.w != null) style[key] = { w: st.w };
    });
    return JSON.stringify({ text: text, style: style }, null, 2);
  }

  // ================= text block sizing (edit mode) =================
  // The block you're editing gets a handle on its right edge: drag it to change the width
  // (text rewraps). A− / A+ in the edit bar change its text size. Values are slide pixels on
  // the 1280×720 canvas, layered like text: SEED.style, then your edits on this device.
  var styleOverrides = {};
  try { styleOverrides = JSON.parse(localStorage.getItem(NS + 'deck-style') || '{}') || {}; } catch(e){ styleOverrides = {}; }
  var activeBlock = null, stSaveTimer = null;
  var sizeHandle = document.createElement('div');
  sizeHandle.className = 'size-handle'; sizeHandle.hidden = true;
  sizeHandle.innerHTML = '<span class="sh-grip"></span><span class="sh-read"></span>';
  stage.appendChild(sizeHandle);
  // the bullet you're editing gets a × beside its dot that deletes it (so does Backspace in an empty one)
  var txDel = document.createElement('button');
  txDel.type = 'button'; txDel.className = 'tx-del'; txDel.hidden = true; txDel.title = 'Delete bullet';
  txDel.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 6l8 8M14 6l-8 8"/></svg>';
  stage.appendChild(txDel);
  function deleteBullet(el){
    el.innerHTML = TX_GONE; onTextInput(el, el.getAttribute('data-eid'));
    el.blur(); activeBlock = null; placeHandle(); updateSizeBar();
  }
  function restoreBullet(el){
    var eid = el.getAttribute('data-eid'), s = seedTextFor(eid);
    el.innerHTML = s !== TX_GONE ? s : domBaseline[eid];          // deleted in the saved deck: back to the markup's text
    onTextInput(el, eid); el.focus();
  }
  txDel.addEventListener('mousedown', function(e){ e.preventDefault(); e.stopPropagation(); if(activeBlock) deleteBullet(activeBlock); });
  document.addEventListener('mousedown', function(e){
    var el = editing && e.target.closest && e.target.closest('#stage .tx-gone');
    if(el){ e.preventDefault(); restoreBullet(el); }
  }, true);
  document.addEventListener('keydown', function(e){
    if(!editing || !activeBlock || (e.key !== 'Backspace' && e.key !== 'Delete') || !activeBlock.matches(TX_DEL_SEL)) return;
    if(activeBlock.textContent.trim() || activeBlock.querySelector('img')) return;
    e.preventDefault(); deleteBullet(activeBlock);
  });

  function styleFor(eid){
    var out = {}, seed = (SEED.style && SEED.style[eid]) || {}, mine = styleOverrides[eid] || {};
    ['w', 'fs'].forEach(function(k){ if(mine[k] != null) out[k] = mine[k]; else if(seed[k] != null) out[k] = seed[k]; });
    return out;
  }
  // sized things: text blocks by their data-eid, resizable media (data-resize) as "m:<data-mid>"
  function styleKey(el){ return el.hasAttribute('data-eid') ? el.getAttribute('data-eid') : 'm:' + el.getAttribute('data-mid'); }
  function styleEl(key){ return document.querySelector(key.indexOf('m:') === 0 ? '#stage .media[data-mid="' + key.slice(2) + '"]' : '#stage [data-eid="' + key + '"]'); }
  function paintStyle(el){
    var st = styleFor(styleKey(el));
    el.style.width = st.w ? st.w + 'px' : '';
    el.style.maxWidth = st.w ? 'none' : '';
    if(el.hasAttribute('data-eid')) el.style.fontSize = st.fs ? st.fs + 'px' : '';
  }
  function applyStyles(){
    Array.prototype.forEach.call(document.querySelectorAll('.slide:not(.s-screen) [data-eid], .slide:not(.s-screen) .media[data-resize][data-mid]'), paintStyle);
  }
  function saveStyles(){
    clearTimeout(stSaveTimer);
    stSaveTimer = setTimeout(function(){ try { localStorage.setItem(NS + 'deck-style', JSON.stringify(styleOverrides)); } catch(e){} }, 200);
    markChanged();
  }
  function setStyle(eid, patch, silent){
    var cur = styleOverrides[eid] || {};
    Object.keys(patch).forEach(function(k){ if(patch[k] == null) delete cur[k]; else cur[k] = patch[k]; });
    if(Object.keys(cur).length) styleOverrides[eid] = cur; else delete styleOverrides[eid];
    var el = styleEl(eid); if(el) paintStyle(el);
    saveStyles();
    if(!silent){
      var payload = { eid: eid, style: styleOverrides[eid] || null, t: Date.now() };
      try { if(bc) bc.postMessage({ styleEid: eid, style: payload.style }); } catch(e){}
      try { localStorage.setItem(NS + 'sleek-stylesync', JSON.stringify(payload)); } catch(e){}
    }
    if(el && el.closest('.fs-track, .car-track')) syncFilmstrips();
    placeHandle(); renderPresenter();
  }
  function applyRemoteStyle(eid, style){
    if(eid == null) return;
    if(style) styleOverrides[eid] = style; else delete styleOverrides[eid];
    var el = styleEl(eid); if(el) paintStyle(el);
    saveStyles(); placeHandle(); renderPresenter();
  }

  function stageScale(){ return stage.getBoundingClientRect().width / 1280; }
  function canResizeWidth(el){
    // inline spans can't take a width, and the film strip is tilted
    return getComputedStyle(el).display !== 'inline' && !el.closest('.filmstrip');
  }
  function placeHandle(){
    var bullet = editing && activeBlock && activeBlock.closest('#stage .slide.active') && activeBlock.matches(TX_DEL_SEL) && !activeBlock.classList.contains('tx-gone');
    if(bullet){
      var bk = stageScale(), bsr = stage.getBoundingClientRect(), br = activeBlock.getBoundingClientRect();
      txDel.style.left = ((br.left - bsr.left) / bk - 34) + 'px';
      txDel.style.top = ((br.top - bsr.top) / bk + Math.min(br.height / bk, 32) / 2) + 'px';
    }
    txDel.hidden = !bullet;
    if(!editing || !activeBlock || !activeBlock.closest('#stage .slide.active') || !canResizeWidth(activeBlock)){ sizeHandle.hidden = true; return; }
    var k = stageScale(), sr = stage.getBoundingClientRect(), r = activeBlock.getBoundingClientRect();
    sizeHandle.style.left = ((r.right - sr.left) / k) + 'px';
    sizeHandle.style.top = ((r.top - sr.top) / k) + 'px';
    sizeHandle.style.height = Math.max(24, r.height / k) + 'px';
    sizeHandle.querySelector('.sh-read').textContent = Math.round(r.width / k) + ' px';
    sizeHandle.hidden = false;
  }
  function updateSizeBar(){
    var on = !!(editing && activeBlock);
    ['eb-fs-down', 'eb-fs-up', 'eb-size-reset'].forEach(function(id){ document.getElementById(id).disabled = !on; });
    document.getElementById('eb-fs').textContent = on ? String(Math.round(parseFloat(getComputedStyle(activeBlock).fontSize))) : '\u2013';
    paintContext();
  }
  function bumpFont(dir){
    if(!activeBlock) return;
    var cur = parseFloat(getComputedStyle(activeBlock).fontSize);
    var step = cur < 24 ? 1 : (cur < 60 ? 2 : 4);
    setStyle(activeBlock.getAttribute('data-eid'), { fs: Math.max(8, Math.min(200, Math.round(cur + dir * step))) });
    updateSizeBar();
  }

  document.addEventListener('focusin', function(e){
    if(!editing) return;
    var el = e.target.closest && e.target.closest('#stage [data-eid]');
    if(el){ activeBlock = el; placeHandle(); updateSizeBar(); }
  });
  // clicking empty slide space deselects (like clicking off a text box)
  stage.addEventListener('mousedown', function(e){
    if(!editing || e.target.closest('[data-eid]') || e.target.closest('.size-handle, .tx-del')) return;
    activeBlock = null; placeHandle(); updateSizeBar();
  });
  sizeHandle.addEventListener('mousedown', function(ev){
    if(!activeBlock) return;
    ev.preventDefault(); ev.stopPropagation();
    var el = activeBlock, eid = el.getAttribute('data-eid'), k = stageScale();
    var r = el.getBoundingClientRect(), slideR = el.closest('.slide').getBoundingClientRect();
    var startX = ev.clientX, startW = r.width / k;
    var maxW = (slideR.right - r.left) / k - 24;                   // stop short of the slide edge
    document.body.classList.add('sizing'); sizeHandle.classList.add('dragging');
    function move(e){ setStyle(eid, { w: Math.round(Math.max(60, Math.min(maxW, startW + (e.clientX - startX) / k))) }); }
    function up(){
      document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up);
      document.body.classList.remove('sizing'); sizeHandle.classList.remove('dragging');
      el.focus();
    }
    document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
  });
  ['eb-fs-down', 'eb-fs-up', 'eb-size-reset'].forEach(function(id){
    // keep the caret in the text block while clicking these
    document.getElementById(id).addEventListener('mousedown', function(e){ e.preventDefault(); });
  });
  document.getElementById('eb-fs-down').onclick = function(){ bumpFont(-1); };
  document.getElementById('eb-fs-up').onclick = function(){ bumpFont(1); };
  document.getElementById('eb-size-reset').onclick = function(){
    if(!activeBlock) return;
    setStyle(activeBlock.getAttribute('data-eid'), { w: null, fs: null }); updateSizeBar();
  };
  window.addEventListener('resize', placeHandle);

  // ================= image tiles (any static slide) =================
  // Seed images are relative paths in SEED.media; images you pick are stored on this device.
  var mediaImages = {}, curMid = null;
  var mediaListeners = [];                                       // fn() after tiles are painted (features/collage.js)
  function saveMedia(){
    idbSet('media', mediaImages); markChanged();
    try { localStorage.setItem(NS + 'sleek-media-ping', String(Date.now())); } catch(e){}
    try { if(bc) bc.postMessage({ media: true }); } catch(e){}
  }
  function reloadMedia(){ idbGet('press', function(p){ pressEdits = p || {}; idbGet('components', function(c){ compEdits = c || {}; idbGet('media', function(d){ mediaImages = d || {}; applyMedia(); pressChanged(); markChanged(); }); }); }); }
  // a take-apart tile's own layers, edited on this device (features/disassemble.js), by tile id;
  // they save into the deck as seed.components['tile:<tile id>']
  var compEdits = {};
  // a bullet's newspaper clipping, edited on this device (features/press.js), by the bullet's text id;
  // they save into the deck as seed.press['<text id>'] (false: this bullet has none, even the layout's)
  var pressEdits = {}, pressListeners = [];
  function pressChanged(){ pressListeners.forEach(function(f){ try { f(); } catch(e){ console.error(e); } }); }
  function savePress(){
    idbSet('press', pressEdits); markChanged(); pressChanged();
    try { localStorage.setItem(NS + 'sleek-media-ping', String(Date.now())); } catch(e){}
    try { if(bc) bc.postMessage({ media: true }); } catch(e){}
  }
  function saveComps(){
    idbSet('components', compEdits); markChanged();
    try { localStorage.setItem(NS + 'sleek-media-ping', String(Date.now())); } catch(e){}
    try { if(bc) bc.postMessage({ media: true }); } catch(e){}
  }
  // ---------- the layouts' sample pictures, in the deck's accent ----------
  // The sample art is drawn in one orange (and a pale tint of it). On a deck with another accent, a tile
  // still showing its layout's own picture shows it in that accent instead, and a sample film is turned
  // to its hue, so a new slide (and the layout picker's previews) look like they belong. Pictures you
  // add are never touched.
  var SAMPLE_ORANGE = [255, 106, 61], tinted = {}, tintWait = {};
  function deckAccent(){
    var v = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
    return /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : null;
  }
  function hexRgb(h){ return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
  function rgbHex(c){ return '#' + c.map(function(x){ return ('0' + Math.round(x).toString(16)).slice(-2); }).join(''); }
  function hsl(c){
    var r = c[0] / 255, g = c[1] / 255, b = c[2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, h = 0, l = (mx + mn) / 2;
    if(d){ h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; if(h < 0) h += 360; }
    return { h: h, s: d ? d / (1 - Math.abs(2 * l - 1)) : 0, l: l };
  }
  function hslRgb(h, s, l){
    var q = (1 - Math.abs(2 * l - 1)) * s, x = q * (1 - Math.abs((h / 60) % 2 - 1)), m = l - q / 2, r = [0, 0, 0], i = Math.floor(h / 60) % 6;
    r = [[q, x, 0], [x, q, 0], [0, q, x], [0, x, q], [x, 0, q], [q, 0, x]][i];
    return r.map(function(v){ return (v + m) * 255; });
  }
  function sampleShift(){
    var a = deckAccent(), de = document.documentElement;
    if(!a || a === rgbHex(SAMPLE_ORANGE)){ de.style.removeProperty('--sample-hue'); de.style.removeProperty('--sample-sat'); de.removeAttribute('data-sample-tint'); return; }
    // a film is toned first (sepia, whose hue is about 38°), then turned to the accent's hue, so every
    // colour in it lands in the accent's family, not only the orange
    var to = hsl(hexRgb(a)); de.setAttribute('data-sample-tint', '');
    de.style.setProperty('--sample-hue', Math.round(to.h - 38) + 'deg');
    de.style.setProperty('--sample-sat', Math.max(0.2, Math.min(3, to.s * 3)).toFixed(2));
  }
  // the sample's colours, written in the deck's accent: the orange becomes the accent, its pale tint a
  // pale accent, the two other ring colours (amber, sky) a lighter accent and a neighbour of it (so the
  // rings stay three, but one family), and the card's warm darks darks warmed by the accent
  function sampleRecolor(text, a){
    a = a || deckAccent();
    if(!text || !a || a === rgbHex(SAMPLE_ORANGE)) return text;
    var c = hexRgb(a), h = hsl(c);
    function mixW(f){ return rgbHex(c.map(function(x){ return x + (255 - x) * f; })); }
    function dark(f){ return rgbHex(c.map(function(x){ return 13 + (x - 13) * f; })); }
    var map = { '#ff6a3d': a, '#ffd2c2': mixW(0.72), '#ffb648': mixW(0.42), '#7ad3ff': rgbHex(hslRgb((h.h + 40) % 360, Math.max(h.s, 0.35), 0.74)),
                '#1a0f1c': dark(0.08), '#2a1420': dark(0.16), '#3a1a22': dark(0.24) };
    return String(text).replace(/#(ff6a3d|ffd2c2|ffb648|7ad3ff|1a0f1c|2a1420|3a1a22)\b/gi, function(m){ return map[m.toLowerCase()]; })
      .replace(/rgba\(\s*255\s*,\s*106\s*,\s*61\s*,/g, 'rgba(' + c.join(', ') + ',');
  }
  // the sample picture src in the deck's accent: at once when it's ready, else src now and cb(tinted) later
  function sampleTint(src, cb){
    if(!tinted) return src;   // before this part of the page has run (retint repaints after)
    var a = deckAccent();
    if(!src || !a || a === rgbHex(SAMPLE_ORANGE) || !/(\.svg([?#]|$))|^data:image\/svg\+xml/i.test(src)) return src;
    var k = a + '|' + src;
    if(tinted[k]) return tinted[k];
    if(cb && (tintWait[k] = tintWait[k] || []).indexOf(cb) < 0) tintWait[k].push(cb);   // each waiter once
    if(tintWait[k] && tintWait[k].started) return src;
    tintWait[k] = tintWait[k] || []; tintWait[k].started = true;
    fetch(src).then(function(r){ return r.text(); }).then(function(t){
      tinted[k] = /#ff6a3d/i.test(t) ? 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(sampleRecolor(t, a)) : src;
    }, function(){ tinted[k] = src; }).then(function(){
      var w = tintWait[k] || []; delete tintWait[k];
      w.forEach(function(f){ try { f(tinted[k]); } catch(e){} });
    });
    return src;
  }
  function samplePic(m, img){
    if(!img || img !== m.getAttribute('data-default-src')) return img;
    if(isVideo(img)){ m.classList.add('sample-film'); return img; }
    return sampleTint(img, repaintMedia);
  }
  // the tiles painted again once their tinted pictures are ready: one repaint for all of them, not
  // one per tile per repaint (a board of many sample pictures would otherwise snowball)
  var repaintT = 0;
  function repaintMedia(){ if(repaintT) return; repaintT = setTimeout(function(){ repaintT = 0; applyMedia(); }, 30); }
  // the layouts' sample pictures start tinting as the deck opens, and again when the accent changes
  var lastAccent = null;
  function retint(){
    var a = deckAccent(); if(a === lastAccent) return; lastAccent = a;
    sampleShift();
    TEMPLATES.forEach(function(t){ (t.html.match(/assets\/sample\/[\w.-]+\.svg/g) || []).forEach(function(src){ sampleTint(src); }); });
    sampleTint('assets/sample/card-rings.svg');
    if(typeof applyMedia === 'function' && document.querySelector('.media[data-mid]')) applyMedia();
    paintScreens();
  }
  new MutationObserver(retint).observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
  retint();

  // Sleek's own sample art used straight from its folder (the sample deck's annotated screens) follows
  // the accent too; a picture you add never lives there
  function ownSample(src){ return /^assets\/sample\/[\w.-]+\.svg$/.test(src || ''); }
  function paintScreens(){ Array.prototype.forEach.call(document.querySelectorAll('#stage .slide.s-screen > .media'), screenBg); }
  function screenBg(media){
    var src = media._img; if(!src) return;
    if(ownSample(src)) src = sampleTint(src, paintScreens);   // the screens on the page then, which may be new ones
    media.style.background = 'center top/cover no-repeat url("' + busted(src) + '")';
  }
  // a tile's picture: a device edit, then the seed, then the layout's own; 'none' is no picture at all
  // (a divider with none shows the theme behind its words)
  function picOf(mid, m){
    var v = mediaImages[mid] || (SEED.media && SEED.media[mid]) || m.getAttribute('data-default-src') || null;
    return v === 'none' ? null : v;
  }
  function applyMedia(){
    Array.prototype.forEach.call(document.querySelectorAll('.slide:not(.s-screen) .media[data-mid]'), function(m){
      var mid = m.getAttribute('data-mid');
      // a device edit, then the seed, then the tile's own data-default-src
      m.classList.remove('sample-film');
      var img = samplePic(m, picOf(mid, m));                     // the layout's own picture, in the deck's accent
      if(img) img = busted(img);                               // a file you replaced on disk loads fresh
      if(img && isVideo(img)){ m.style.background = ''; setTileVideo(m, img); m.classList.add('filled'); }
      else if(img){ setTileVideo(m, null); m.style.background = (m.getAttribute('data-bg-pos') || 'center top') + '/cover no-repeat url("' + img + '")'; m.classList.add('filled'); }   // crops keep the top
      else { setTileVideo(m, null); m.style.background = ''; m.classList.remove('filled'); }
      m.classList.toggle('is-video', !!(img && isVideo(img)));   // the edit-mode hint names what you are replacing
      paintFit(m, img);
    });
    paintBefores();
    syncFilmstrips();
    refreshSlideThemes();                                        // a picture going in or out changes the default
    mediaListeners.forEach(function(f){ try { f(); } catch(e){ console.error(e); } });
    if(PRESENTERWIN) renderPresenter();
  }
  // Fill / Fit / Crop (features/fit.js): how the picture sits in its tile, from the deck's fits by media
  // id. A moodboard keeps its own (features/collage.js). Painted here, before the strips and carousels
  // copy their tiles, so the copies match.
  function fitOf(mid){ return (mid && SEED.fits && SEED.fits[mid]) || null; }
  function setFit(mid, o){
    var e = {}, had = fitOf(mid);
    var bare = o && o.bare !== undefined ? !!o.bare : !!(had && had.bare);   // the backplate stays as it was unless asked
    if(bare) e.bare = true;
    if(o && (o.fit === 'fit' || o.fit === 'crop')) e.fit = o.fit;
    ['z', 'cx', 'cy'].forEach(function(k){ if(o && o[k] != null && isFinite(+o[k])) e[k] = +o[k]; });   // a crop stays for next time
    if(Object.keys(e).length) (SEED.fits = SEED.fits || {})[mid] = e;
    else if(SEED.fits){ delete SEED.fits[mid]; if(!Object.keys(SEED.fits).length) delete SEED.fits; }
    applyMedia();
    Promise.resolve(flushSave()).then(function(){ pingReload(); }, function(){ pingReload(); });   // the other windows load it from the saved deck
  }
  var fitShapes = {}, fitRO = window.ResizeObserver ? new ResizeObserver(function(es){
    es.forEach(function(en){ var m = en.target; if(m.getAttribute('data-fit') === 'crop') SleekCollage.fitTile(m, m.clientWidth, m.clientHeight); });
  }) : null;
  function paintFit(m, src){
    if(m.classList.contains('cl-tile') || !window.SleekCollage) return;
    if(window.Deck && Deck.fitUI && Deck.fitUI.cropping() === m) return;   // the crop being made keeps its live values
    var o = fitOf(m.getAttribute('data-mid')), f = src && o && (o.fit === 'fit' || o.fit === 'crop') ? o.fit : null;
    m.classList.toggle('fit-bare', !!(o && o.bare));          // no backplate: the picture alone on the slide
    if(!f){
      if(m.hasAttribute('data-fit')){ m.removeAttribute('data-fit'); SleekCollage.fitTile(m); }
      return;
    }
    m.setAttribute('data-fit', f);
    ['z', 'cx', 'cy'].forEach(function(k){ if(o[k] != null) m.setAttribute('data-' + k, String(o[k])); else m.removeAttribute('data-' + k); });
    if(f === 'crop'){
      var r = fitShapes[src];
      if(r) m.setAttribute('data-r', String(r));
      else if(r !== 0){                                         // the picture's own shape, once; then paint again
        fitShapes[src] = 0;
        var done = function(v){ if(v){ fitShapes[src] = v; clearTimeout(fitShapes._t); fitShapes._t = setTimeout(applyMedia, 30); } };
        if(isVideo(src)){ var v = document.createElement('video'); v.muted = true; v.preload = 'metadata'; v.onloadedmetadata = function(){ done(v.videoWidth / v.videoHeight); v.removeAttribute('src'); }; v.src = src; }
        else { var im = new Image(); im.onload = function(){ done(im.naturalWidth / im.naturalHeight); }; im.src = src; }
      }
      if(fitRO) fitRO.observe(m);
    }
    SleekCollage.fitTile(m, m.clientWidth, m.clientHeight);
  }
  // a tile whose media is a video plays it silently on a loop (click it for the full player);
  // it waits for its own slide (armVideos), so videos elsewhere in the deck stay still
  function setTileVideo(m, src){
    var v = m.querySelector(':scope > video.tile-video');
    if(!src){ if(v) v.remove(); return; }
    if(!v){
      v = document.createElement('video'); v.className = 'tile-video';
      ['muted', 'loop', 'playsinline'].forEach(function(a){ v.setAttribute(a, ''); });
      v.muted = true; v.preload = 'auto'; m.insertBefore(v, m.firstChild);
    }
    if(vsrc(v) !== src){ v.removeAttribute('src'); v.setAttribute('data-src', src); armVideos(true); }   // armVideos loads it if its slide is up
  }
  // ---------- side video: the page above and below the film, filled from the film ----------
  // On a side-video slide (s-sidevideo), a small canvas behind the film is painted every frame with the
  // film itself, its top rows stretched up to the top of the slide and its bottom rows down to the bottom,
  // then heavily blurred, so the film's own colours carry past its feathered edges and it sits seamless.
  // the glass panel beside the film ends where the film starts: each slide carries the film's width (--vw)
  if(window.ResizeObserver) Array.prototype.forEach.call(document.querySelectorAll('#stage .slide.s-sidevideo'), function(sl){
    var t = sl.querySelector('.side-video'); if(!t) return;
    new ResizeObserver(function(){ if(t.offsetWidth) sl.style.setProperty('--vw', t.offsetWidth + 'px'); }).observe(t);
  });
  var amb = null;
  function armAmbient(){
    if(amb){ cancelAnimationFrame(amb.raf); amb = null; }
    var s = slides[i]; if(PRESENTERWIN || !s || !s.classList.contains('s-sidevideo')) return;
    var tile = s.querySelector('.side-video'); if(!tile) return;
    var cv = s.querySelector(':scope > canvas.amb');
    if(!cv){ cv = document.createElement('canvas'); cv.className = 'amb'; cv.width = 192; cv.height = 168; s.insertBefore(cv, s.firstChild); }
    var ctx = cv.getContext('2d'), me = amb = { raf: 0, n: 0 }, PAD = 90, poster = null;
    function frame(){
      if(amb !== me) return;
      me.raf = requestAnimationFrame(frame);
      if(me.n++ % 2) return;                                     // ~30 a second is plenty under the blur
      var v = tile.querySelector(':scope > video.tile-video'), src = null;
      if(v && v.readyState >= 2) src = v;
      else if(v && v.poster){ if(!poster || poster.src !== v.poster){ poster = new Image(); poster.src = v.poster; } if(poster.complete && poster.naturalWidth) src = poster; }
      if(!src) return;
      var sw = src.videoWidth || src.naturalWidth, sh = src.videoHeight || src.naturalHeight; if(!sw || !sh) return;
      // the canvas covers the film's column, top to bottom of the slide, plus room for the blur to fall off
      var r = Deck.stageRect(tile), X = r.x, Y = -PAD, W = 1280 + PAD - X, H = 720 + 2 * PAD;
      cv.style.left = X + 'px'; cv.style.top = Y + 'px'; cv.style.width = W + 'px'; cv.style.height = H + 'px';
      var kx = cv.width / W, ky = cv.height / H, dx = 0, dw = r.w * kx;
      var top = (r.y - Y) * ky, mid = r.h * ky, bot = cv.height - top - mid, edge = Math.max(2, sh * 0.04);
      ctx.clearRect(0, 0, cv.width, cv.height);
      if(top > 0) ctx.drawImage(src, 0, 0, sw, edge, dx, 0, dw, top);                     // the top rows, stretched up
      ctx.drawImage(src, 0, 0, sw, sh, dx, top, dw, mid);                                // the film
      if(bot > 0) ctx.drawImage(src, 0, sh - edge, sw, edge, dx, top + mid, dw, bot);   // the bottom rows, stretched down
      // the film's right edge carried on to the slide's edge
      var rest = cv.width - dw; if(rest > 0) ctx.drawImage(cv, dw - 2, 0, 2, cv.height, dw, 0, rest, cv.height);
      cv.classList.add('on');
    }
    me.raf = requestAnimationFrame(frame);
  }
  // ---------- videos and the browser's connection limit ----------
  // The browser keeps at most six connections open to the deck server, and a video holds one for as long
  // as it has a source, so a few videos loading in the audience window, the presenter and its preview
  // leave the pictures waiting forever. Only the slide on screen has its videos loaded (the rest keep
  // their address in data-src), and previews show a still grabbed once, one video at a time.
  function vsrc(v){ return v.getAttribute('src') || v.getAttribute('data-src') || ''; }
  function holdVideo(v, on){
    var s = v.getAttribute('src');
    if(on){ if(!s && v.getAttribute('data-src')) v.src = v.getAttribute('data-src'); return; }
    if(s){ v.setAttribute('data-src', s); v.pause(); v.removeAttribute('src'); try { v.load(); } catch(e){} v.classList.remove('on'); }
  }
  var stills = {}, stillWait = {}, stillQ = [], stillBusy = false;
  function stillFor(src, cb){
    if(stills[src]) return cb(stills[src]);
    if(stillWait[src]){ stillWait[src].push(cb); return; }
    stillWait[src] = [cb]; stillQ.push(src); nextStill();
  }
  function nextStill(){
    if(stillBusy || !stillQ.length) return;
    stillBusy = true;
    var src = stillQ.shift(), v = document.createElement('video'), done = false;
    v.muted = true; v.preload = 'auto'; v.playsInline = true;
    function finish(url){
      if(done) return; done = true;
      v.removeAttribute('src'); try { v.load(); } catch(e){}          // let the connection go
      if(url) stills[src] = url;
      (stillWait[src] || []).forEach(function(f){ if(url) f(url); }); delete stillWait[src];
      stillBusy = false; nextStill();
    }
    v.addEventListener('seeked', function(){
      try {
        var w = 480, h = Math.round(w * (v.videoHeight || 9) / (v.videoWidth || 16)), c = document.createElement('canvas');
        c.width = w; c.height = h; c.getContext('2d').drawImage(v, 0, 0, w, h); finish(c.toDataURL('image/jpeg', 0.72));
      } catch(e){ finish(null); }
    });
    v.addEventListener('loadedmetadata', function(){ try { v.currentTime = Math.min(2, (v.duration || 4) / 2); } catch(e){ finish(null); } });   // a couple of seconds in
    v.addEventListener('error', function(){ finish(null); });
    setTimeout(function(){ finish(null); }, 15000);
    v.src = src.split('#')[0];
  }
  // tile videos start 1.5s after you land on their slide, from the top; leaving a slide stops its videos
  var vidT = 0;
  // a slide's background film (video.slide-bg) fades in once its first frame is actually playing
  document.addEventListener('playing', function(e){ if(e.target.matches && e.target.matches('.slide-bg > video.tile-video')) e.target.classList.add('on'); }, true);
  function armVideos(keepPlaying){
    clearTimeout(vidT);
    var cur = slides[i];
    Array.prototype.forEach.call(document.querySelectorAll('#stage .slide video.tile-video'), function(v){
      var here = cur && cur.contains(v);
      holdVideo(v, here && !PRESENTERWIN);                       // only the slide on screen loads its videos (the presenter shows none)
      if(!here) v.classList.remove('on');                        // a slide's background film fades in again next time
      if(here && keepPlaying && !v.paused) return;
      if(!v.paused) v.pause();
      if(!here || !keepPlaying){ try { v.currentTime = 0; } catch(e){} }
    });
    if(!cur) return;
    vidT = setTimeout(function(){
      Array.prototype.forEach.call(cur.querySelectorAll('video.tile-video'), function(v){
        if(v.closest('[data-noautoplay]')) return;                 // shows its first frame; click it to play
        if(v.paused){ var p = v.play(); if(p && p.catch) p.catch(function(){}); }
      });
    }, 1500);
  }
  // Film strip loop: the track holds the real frames plus one mirrored copy, and scrolls
  // up by exactly one set (CSS). The copy is rebuilt from the real frames so images match.
  var FS_SPEED = 20;   // film strip px per second, before its 1.5x scale (about 30px/s on screen)
  function syncFilmstrips(){
    Array.prototype.forEach.call(document.querySelectorAll('#stage .fs-track'), function(track){
      var real = track.querySelector('.fs-set:not(.fs-copy)'); if(!real) return;
      Array.prototype.forEach.call(track.querySelectorAll('.fs-copy'), function(c){ c.remove(); });
      // enough copies to keep the strip full while it scrolls up by exactly one set
      var setH = real.offsetHeight || 936, stripH = track.parentNode.clientHeight || 900;
      var copies = Math.max(1, Math.ceil(stripH / setH));
      for(var k = 0; k < copies; k++){
        var copy = real.cloneNode(true);
        copy.classList.add('fs-copy'); copy.setAttribute('aria-hidden', 'true');
        Array.prototype.forEach.call(copy.querySelectorAll('.media-clear, .fs-add'), function(el){ el.remove(); });
        Array.prototype.forEach.call(copy.querySelectorAll('[data-eid],[data-mid],[contenteditable]'), function(el){
          el.removeAttribute('data-eid'); el.removeAttribute('data-mid'); el.removeAttribute('contenteditable'); el.classList.remove('tedit');
        });
        track.appendChild(copy);
      }
      track.style.setProperty('--set', setH + 'px');
      track.style.animationDuration = (setH / FS_SPEED) + 's';
    });
    syncCarousels();
  }
  // carousels: the same endless loop, sideways and slower, so each surface gets a proper look
  var CAR_SPEED = 30;   // px per second on the 1280x720 slide
  function syncCarousels(){
    Array.prototype.forEach.call(document.querySelectorAll('#stage .car-track'), function(track){
      var real = track.querySelector('.car-set:not(.car-copy)'); if(!real) return;
      Array.prototype.forEach.call(track.querySelectorAll('.car-copy'), function(c){ c.remove(); });
      var setW = real.offsetWidth || 2112, viewW = track.parentNode.clientWidth || 1280;
      var add = real.querySelector(':scope > .car-add');            // Edit mode's Add picture isn't part of the set
      if(add && add.offsetWidth) setW -= add.offsetWidth + 28;
      // every picture already on screen (one, say): it sits still as it is, with no copies to repeat it
      var pad = parseFloat(getComputedStyle(track).paddingLeft) || 0, fits = setW + pad <= viewW + 1;
      track.parentNode.classList.toggle('car-fits', fits);
      var copies = fits ? 0 : Math.max(1, Math.ceil(viewW / setW));
      for(var k = 0; k < copies; k++){
        var copy = real.cloneNode(true);
        copy.classList.add('car-copy'); copy.setAttribute('aria-hidden', 'true');
        Array.prototype.forEach.call(copy.querySelectorAll('.media-clear, .car-add'), function(el){ el.remove(); });
        Array.prototype.forEach.call(copy.querySelectorAll('[data-eid],[data-mid],[contenteditable]'), function(el){
          el.removeAttribute('data-eid'); el.removeAttribute('data-mid'); el.removeAttribute('contenteditable'); el.classList.remove('tedit');
        });
        track.appendChild(copy);
      }
      track.style.setProperty('--set', setW + 'px');
      track.style.animationDuration = (setW / CAR_SPEED) + 's';
    });
    armVideos(true);                                          // fresh copies of video tiles start with the rest
  }
  // ---------- carousels by hand: drag, swipe / wheel, or the arrows ----------
  // All of it scrubs the roll animation itself, so letting go carries on rolling from wherever you left
  // it (and the presenter's preview, which mirrors animation time, follows along). A drag doesn't
  // count as a click, so it never opens the tile underneath.
  function carAnim(track){ return track.getAnimations().filter(function(a){ return a.animationName === 'car-roll'; })[0]; }
  function carMsPerPx(track){ var set = parseFloat(track.style.getPropertyValue('--set')) || 2112; return (set / CAR_SPEED * 1000) / set; }
  function carShift(track, px){                               // + moves the strip left (onward), - back
    var a = carAnim(track); if(!a) return;
    var dur = a.effect.getComputedTiming().duration, t = (a.currentTime || 0) + px * carMsPerPx(track);
    a.currentTime = ((t % dur) + dur) % dur;                  // the copies make the wrap invisible
  }
  // a hand move on a carousel: the preview asks the audience to make it; the audience tells the preview
  function carMove(track, px){
    if(MIRROR){ sendInput({ kind: 'req', act: { t: 'carshift', p: pathOf(track), px: px } }); return; }
    carShift(track, px);
    if(AUDIENCE) sendInput({ kind: 'echo', act: { t: 'carshift', p: pathOf(track), px: px } });
  }
  function carStepPx(track){ var m = track.querySelector('.media'); return m ? m.offsetWidth + 28 : 622; }
  function carGlide(track, px){
    var start = performance.now(), done = 0, D = 520;
    (function step(now){
      var k = Math.min(1, (now - start) / D), e = 1 - Math.pow(1 - k, 3);
      carShift(track, px * e - done); done = px * e;
      if(k < 1) requestAnimationFrame(step);
    })(start);
  }
  function setupCarouselScrub(){
    Array.prototype.forEach.call(document.querySelectorAll('#stage .s-carousel .carousel'), function(car){
      var track = car.querySelector('.car-track'); if(!track) return;
      var nav = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M12.5 4.5 7 10l5.5 5.5"/></svg>';
      ['prev', 'next'].forEach(function(dir){
        var b = document.createElement('button'); b.type = 'button'; b.className = 'car-nav car-' + dir;
        b.setAttribute('aria-label', dir === 'prev' ? 'Previous' : 'Next'); b.innerHTML = nav;
        b.addEventListener('click', function(e){ e.stopPropagation(); carGlide(track, (dir === 'next' ? 1 : -1) * carStepPx(track)); });
        b.addEventListener('pointerdown', function(e){ e.stopPropagation(); });
        car.appendChild(b);
      });
      // wheel / trackpad: sideways swipes, or the wheel itself
      car.addEventListener('wheel', function(e){
        if(editing || annotating || featureOpen()) return;
        var d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY; if(!d) return;
        e.preventDefault(); carMove(track, d * (e.deltaMode === 1 ? 32 : 1) / (stage.getBoundingClientRect().width / 1280));
      }, { passive: false });
      // drag: past a few pixels it's a scrub, and the click that ends it is swallowed
      var drag = null;
      car.addEventListener('pointerdown', function(e){
        if(editing || annotating || featureOpen() || e.button !== 0) return;
        drag = { x: e.clientX, last: e.clientX, moved: false, id: e.pointerId };
      });
      car.addEventListener('pointermove', function(e){
        if(!drag || e.pointerId !== drag.id) return;
        if(!drag.moved && Math.abs(e.clientX - drag.x) < 6) return;
        if(!drag.moved){ drag.moved = true; car.classList.add('dragging'); try { car.setPointerCapture(e.pointerId); } catch(_){} }
        var k = stage.getBoundingClientRect().width / 1280;
        carMove(track, (drag.last - e.clientX) / k); drag.last = e.clientX;
      });
      function end(e){
        if(!drag) return;
        if(drag.moved){ car.classList.remove('dragging'); var swallow = function(ev){ ev.stopPropagation(); ev.preventDefault(); window.removeEventListener('click', swallow, true); }; window.addEventListener('click', swallow, true); setTimeout(function(){ window.removeEventListener('click', swallow, true); }, 50); }
        drag = null;
      }
      car.addEventListener('pointerup', end); car.addEventListener('pointercancel', end);
    });
  }
  // resizable media (data-resize): in edit mode, drag the corner to resize (stays 16:9), double-click it to reset
  function addMediaSizer(m){
    var h = document.createElement('span'); h.className = 'media-sizer'; h.title = 'Drag to resize · double-click to reset';
    h.innerHTML = '<span class="ms-read"></span>';
    m.appendChild(h);
    h.addEventListener('click', function(e){ e.stopPropagation(); });            // not the image picker
    h.addEventListener('dblclick', function(e){ e.stopPropagation(); setStyle(styleKey(m), { w: null }); });
    h.addEventListener('mousedown', function(ev){
      if(!editing) return;
      ev.preventDefault(); ev.stopPropagation();
      var k = stageScale(), r = m.getBoundingClientRect(), slideR = m.closest('.slide').getBoundingClientRect();
      var startX = ev.clientX, startW = r.width / k, maxW = (slideR.right - r.left) / k - 40, key = styleKey(m);
      document.body.classList.add('msizing'); h.classList.add('dragging');
      var fromLeft = m.getAttribute('data-resize') === 'left';           // anchored right: drag the left edge
      if(fromLeft) maxW = 1180;
      function move(e){
        var dx = (e.clientX - startX) / k * (fromLeft ? -1 : 1);
        var w = Math.round(Math.max(fromLeft ? 360 : 240, Math.min(maxW, startW + dx)));
        setStyle(key, { w: w }); h.querySelector('.ms-read').textContent = w + ' \u00d7 ' + Math.round(w * 9 / 16);
      }
      function up(){ document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up);
        document.body.classList.remove('msizing'); h.classList.remove('dragging'); }
      document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
    });
  }
  function setupMedia(){
    Array.prototype.forEach.call(document.querySelectorAll('.slide:not(.s-screen)'), function(sl){
      var idx = 0, pre = (sl.getAttribute('data-added') || 'x') + '.';
      Array.prototype.forEach.call(sl.querySelectorAll('.media'), function(m){
        var sp = m.getAttribute('data-spare');                 // a carousel's spare: its own name, so the rest keep theirs
        if(sp && !m.getAttribute('data-mid')) m.setAttribute('data-mid', pre + 'xm' + sp);
        if(!m.getAttribute('data-mid')) m.setAttribute('data-mid', pre + 'm' + (idx++));   // a moodboard's tiles come named
        setupTile(m);
      });
    });
    applyMedia();
  }
  // a tile's Edit-mode controls: click to replace its picture, x to remove it, and its Before
  function setupTile(m){
    var mid = m.getAttribute('data-mid');
    if(m.hasAttribute('data-resize')) addMediaSizer(m);
    var clr = document.createElement('button');
    clr.className = 'media-clear'; clr.type = 'button'; clr.textContent = '\u00d7'; clr.title = 'Remove image';
    var frame = m.classList.contains('fs-frame'), board = m.classList.contains('cl-tile');
    if(frame) clr.title = 'Remove from the strip';
    if(board) clr.title = 'Remove from the board';
    if(m.closest('.s-carousel .car-set')) clr.title = 'Remove from the carousel (or Delete over it)';
    clr.addEventListener('click', function(ev){ ev.stopPropagation();
      if(frame){ removeFrame(m); return; }                                    // the strip loses the picture, not just its image
      if(m.closest('.s-carousel .car-set')){ removeCarTile(m); return; }       // and a carousel
      if(board){ if(Deck.collageRemove) Deck.collageRemove(m); return; }    // so does a moodboard
      if(m.closest('.s-divider')) mediaImages[mid] = 'none'; else delete mediaImages[mid];   // a divider's backdrop goes, the theme shows
      applyMedia(); saveMedia(); });
    m.appendChild(clr);
    if(!board && !m.closest('.s-divider, .s-fullvideo, .filmstrip') && !m.matches('[data-dis]')){   // a tile that opens big can have a Before
      var bb = document.createElement('button');
      bb.className = 'media-before'; bb.type = 'button'; bb.innerHTML = '<i></i><span>Add before</span>';
      bb.addEventListener('click', function(ev){ ev.stopPropagation(); if(Deck.openBeforePicker) Deck.openBeforePicker(mid, m); });
      m.appendChild(bb);
    }
    m.addEventListener('click', function(ev){
      if(!editing || ev.target === clr || (ev.target.closest && ev.target.closest('.cap'))) return;   // its caption is for typing
      ev.stopPropagation(); curMid = mid;
      var f = document.getElementById('media-file'); f.value = ''; f.click();
    });
  }
  // a picture or video you pick goes into the deck as it is (no resizing or re-encoding)
  function mediaFromFile(f, place){
    var t = fileKind(f);
    if(t && t !== f.type){ try { f = new File([f], f.name, { type: t }); } catch(e){} }
    var rd = new FileReader(); rd.onload = function(){ place(rd.result); }; rd.readAsDataURL(f);
  }
  // what a picked file is, from its type or (when the browser doesn't say) its name. A QuickTime
  // film (.mov) goes in as MP4, which is the same kind of file and plays in every browser that can
  // play its contents.
  var EXT = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif',
              svg: 'image/svg+xml', heic: 'image/heic', mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/mp4', webm: 'video/webm' };
  function fileKind(f){
    var t = (f && f.type) || '';
    if(t === 'video/quicktime' || t === 'video/x-m4v') return 'video/mp4';
    if(/^(image|video)\//.test(t)) return t;
    var m = /\.([a-z0-9]+)$/i.exec((f && f.name) || '');
    return (m && EXT[m[1].toLowerCase()]) || '';
  }
  document.getElementById('media-file').onchange = function(e){
    var f = e.target.files && e.target.files[0], mid = curMid; if(!f || !mid) return;
    e.target.value = '';
    mediaFromFile(f, function(src){ mediaImages[mid] = src; applyMedia(); saveMedia(); });
  };

  // ================= hover a filled tile to see the whole image =================
  // Tiles crop their image (cover). Hovering one opens a larger card at the image's own
  // aspect ratio, centred on the tile, so you see the full frame. Off in edit mode.
  var zoomEl = document.createElement('div');
  zoomEl.className = 'tile-zoom'; zoomEl.hidden = true;
  zoomEl.innerHTML = '<div class="tz-img"></div><div class="tz-cap"></div>';
  stage.appendChild(zoomEl);
  var zoomTile = null, zoomHideT = 0, zoomRaf = 0, lastPt = null, imgRatio = {};
  // a picture's address as the page shows it (kept as one place to adjust addresses)
  function busted(src){ return src; }
  function tileSrc(m){
    var mid = m.getAttribute('data-mid');
    if(mid){ var v = picOf(mid, m); return busted(v && v === m.getAttribute('data-default-src') && !isVideo(v) ? sampleTint(v) : v); }
    var tv = m.querySelector(':scope > video.tile-video'); if(tv) return vsrc(tv);
    var bg = /url\(["']?([^"')]+)["']?\)/.exec(m.style.backgroundImage || '');   // looping copies carry the image inline
    return bg ? bg[1] : null;
  }
  function withRatio(src, cb){
    if(imgRatio[src]) return cb(imgRatio[src]);
    var im = new Image();
    im.onload = function(){ imgRatio[src] = (im.naturalWidth && im.naturalHeight) ? im.naturalWidth / im.naturalHeight : 16/9; cb(imgRatio[src]); };
    im.onerror = function(){ cb(16/9); };
    im.src = src;
  }
  function showZoom(m){
    if(zoomTile === m) return;
    var src = tileSrc(m); if(!src){ hideZoom(); return; }
    zoomTile = m; clearTimeout(zoomHideT);
    withRatio(src, function(ar){
      if(zoomTile !== m) return;
      var sr = stage.getBoundingClientRect(), tr = m.getBoundingClientRect(), k = sr.width / 1280;
      var tx = (tr.left - sr.left) / k, ty = (tr.top - sr.top) / k, tw = tr.width / k, th = tr.height / k;
      var w = Math.min(860, 580 * ar), h = w / ar;               // big, but never past the slide
      var cx = tx + tw / 2, cy = ty + th / 2;
      var x = Math.max(28, Math.min(1280 - 28 - w, cx - w / 2));
      var y = Math.max(28, Math.min(720 - 28 - h, cy - h / 2));
      zoomEl.querySelector('.tz-img').style.backgroundImage = 'url("' + src + '")';
      var cap = m.querySelector('.cap'); zoomEl.querySelector('.tz-cap').textContent = cap ? cap.textContent : '';
      zoomEl.style.left = x + 'px'; zoomEl.style.top = y + 'px';
      zoomEl.style.width = w + 'px'; zoomEl.style.height = h + 'px';
      zoomEl.style.transformOrigin = (cx - x) + 'px ' + (cy - y) + 'px';  // grows out of the tile
      zoomEl.classList.remove('in'); zoomEl.hidden = false;
      void zoomEl.offsetWidth;
      zoomEl.classList.add('in');
    });
  }
  function hideZoom(){
    if(!zoomEl || !zoomTile) return;
    zoomTile = null; zoomEl.classList.remove('in');
    clearTimeout(zoomHideT); zoomHideT = setTimeout(function(){ if(!zoomTile) zoomEl.hidden = true; }, 220);
  }
  // bloom: a blurred, brighter copy of the hovered tile's own image glows out from behind it
  var bloomEl = document.createElement('div'); bloomEl.className = 'tile-bloom'; bloomEl.setAttribute('aria-hidden', 'true');
  var bloomTile = null;
  function showBloom(m){
    if(bloomTile === m) return;
    bloomTile = m;
    var src = tileSrc(m), slide = m.closest('.slide');
    if(!src || !slide || isVideo(src)){ hideBloom(); return; }
    var sr = stage.getBoundingClientRect(), tr = m.getBoundingClientRect(), k = sr.width / 1280;
    if(bloomEl.parentNode !== slide) slide.insertBefore(bloomEl, slide.firstChild);   // painted under the tiles
    bloomEl.style.backgroundImage = 'url("' + src + '")';
    bloomEl.style.left = (tr.left - sr.left) / k + 'px'; bloomEl.style.top = (tr.top - sr.top) / k + 'px';
    bloomEl.style.width = tr.width / k + 'px'; bloomEl.style.height = tr.height / k + 'px';
    bloomEl.style.borderRadius = getComputedStyle(m).borderTopLeftRadius;
    bloomEl.classList.remove('on'); void bloomEl.offsetWidth; bloomEl.classList.add('on');
  }
  function hideBloom(){ bloomTile = null; bloomEl.classList.remove('on'); }
  function zoomCheck(){
    zoomRaf = 0;
    if(editing || POPOUT || !lastPt || (window.Deck && Deck.modal)){ hideZoom(); hideBloom(); return; }
    // elementsFromPoint sees through the edge click-zones and the card itself (pointer-events: none)
    var hit = null, glow = null, els = document.elementsFromPoint(lastPt.x, lastPt.y);
    for(var k = 0; k < els.length; k++){
      var el = els[k];
      if(el.classList && el.classList.contains('media') && el.classList.contains('filled') &&
         el.closest('#stage .slide.active') && !el.closest('.s-divider, .s-fullvideo, .s-screen, .filmstrip')){
        if(!el.closest('.cl-board')) glow = el;                 // a moodboard's tiles lift instead
        if(!el.matches('[data-dis]')) hit = el;
        break;
      }
    }
    if(glow) showBloom(glow); else hideBloom();
    hideZoom();                                             // clicking a tile now expands it (expandTile), so no hover card
    var overCar = !hit && els.some(function(el){ return el.closest && el.closest('#stage .slide.active .carousel'); });
    document.body.classList.toggle('over-tile', !!hit || overCar);     // and the edge zones let that click (or a carousel drag) through
    document.body.classList.toggle('over-link', els.some(function(el){ return el.closest && el.closest('#stage .slide.active a[href]'); }));
  }
  document.addEventListener('mousemove', function(e){ lastPt = { x: e.clientX, y: e.clientY }; if(!zoomRaf) zoomRaf = requestAnimationFrame(zoomCheck); });
  document.documentElement.addEventListener('mouseleave', function(){ lastPt = null; hideZoom(); });

  // ================= saving: every change goes into the deck as you make it =================
  // buildSeed() puts the deck back together from what this page shows: its seed with every edit
  // on this device on top (text, sizes, tiles, annotations, notes, names, order, theme). That is
  // saved into the deck (core/store.js) a moment after each change; pictures go in as they are.
  function imageFile(dataUrl){ return dataUrl || null; }
  function buildSeed(){
    var files = [], ex = JSON.parse(exportText());
    var media = {};
    Object.keys(SEED.media || {}).forEach(function(k){ media[k] = SEED.media[k]; });
    Object.keys(mediaImages).forEach(function(mid){ media[mid] = imageFile(mediaImages[mid], mid, files); });
    var comps = JSON.parse(JSON.stringify(SEED.components || {}));
    Object.keys(compEdits).forEach(function(mid){ comps['tile:' + mid] = compEdits[mid]; });
    var press = JSON.parse(JSON.stringify(SEED.press || {}));
    Object.keys(pressEdits).forEach(function(eid){ press[eid] = pressEdits[eid]; });
    // one set's pins and shapes, with their images written to images/<base>-noteN-k
    function setOut(sc, base){
      return {
        ann: sc.ann.map(function(a, ai){
          var o = { x: Math.round(a.x * 10) / 10, y: Math.round(a.y * 10) / 10, title: a.title, note: a.note };
          if(a.color) o.color = a.color;
          if(a.images && a.images.length) o.images = a.images.map(function(src, k){ return imageFile(src, base + '-note' + (ai + 1) + '-' + (k + 1), files); });
          return o;
        }),
        shapes: shapesOut(sc.shapes).map(function(o, k){
          var src = sc.shapes[k].images;
          if(src && src.length) o.images = src.map(function(s, j){ return imageFile(s, base + '-shape' + (k + 1) + '-' + (j + 1), files); });
          return o;
        }) };
    }
    var anns = { screens: annData.screens.map(function(sc, si){
      var n = String(si + 1).padStart(2, '0'), o = setOut(sc, 'screen-' + n);
      var out = { name: sc.name, notes: sc.notes || '', img: sc.img ? imageFile(sc.img, 'screen-' + n, files) : null, ann: o.ann, shapes: o.shapes };
      if(typeof sc.theme === 'boolean') out.theme = sc.theme;
      return out;
    }) };
    var pages = annData.pages || {};
    Object.keys(pages).forEach(function(key){
      var sc = pages[key]; if(!sc.ann.length && !(sc.shapes || []).length) return;
      anns.pages = anns.pages || {};
      anns.pages[key] = setOut(sc, 'ann-' + slugify(key));
    });
    var seed = JSON.parse(JSON.stringify(SEED));   // keep sections this page doesn't edit
    seed.notes = NOTES.map(function(n){ return n || ''; });
    if(Object.keys(NOTE_BY_KEY).length) seed.noteByKey = NOTE_BY_KEY;
    var labels = {};
    slides.forEach(function(s){ if(s._lkey != null && s.getAttribute('data-label') !== s._lkey) labels[s._lkey] = s.getAttribute('data-label'); });
    if(Object.keys(labels).length) seed.labels = labels; else delete seed.labels;
    var themes = {};
    slides.forEach(function(s){ if(s._lkey != null){ var v = themeSetting(s); if(v !== null) themes[s._lkey] = v; } });
    if(Object.keys(themes).length) seed.slideTheme = themes; else delete seed.slideTheme;
    var order = orderKeys();                                     // only when it's not the markup's own
    if(JSON.stringify(order) !== JSON.stringify(naturalKeys())) seed.order = order; else delete seed.order;
    seed.theme = DT.snapshot();                                  // accent, font, gradient, effect, light / dark
    if(ADDED.length) seed.added = ADDED; else delete seed.added;
    seed.annotations = anns; seed.text = ex.text; seed.style = ex.style; seed.media = media;
    if(Object.keys(comps).length) seed.components = comps; else delete seed.components;
    if(Object.keys(press).length) seed.press = press; else delete seed.press;
    return { seed: seed, files: files };
  }
  function clearDeviceEdits(done){
    try { [NS + 'deck-text', NS + 'deck-style', NS + 'deck-notes', NS + 'deck-labels', NS + 'deck-slide-theme', NS + 'deck-order', NS + 'deck-added'].forEach(function(k){ localStorage.removeItem(k); }); } catch(e){}
    DT.clear();
    if(!DB){ done(); return; }
    try {
      var tx = DB.transaction('kv', 'readwrite'), st = tx.objectStore('kv');
      st.delete('media'); st.delete('annotations'); st.delete('components'); st.delete('press');
      tx.oncomplete = tx.onerror = tx.onabort = function(){ done(); };
    } catch(e){ done(); }
  }
  // the edit bar says where things stand: Saving, Saved; Undo and Redo step through the deck's history
  var DECK_ID = !PUBLISHED && window.SLEEK_DECK && window.SLEEK_DECK.id;
  var savedEl = document.getElementById('eb-saved'), undoBtn = document.getElementById('eb-undo'), redoBtn = document.getElementById('eb-redo');
  var pendT = 0, lastDoc = null, firstSave = true, saving = null, savedT = 0, stepping = false;
  function normHtml(html){ var d = document.createElement('div'); d.innerHTML = html == null ? '' : html; linkTargets(d); return d.innerHTML; }
  function paintSaved(state){
    if(!savedEl) return;
    clearTimeout(savedT);
    savedEl.setAttribute('data-state', state);
    savedEl.querySelector('.lbl').textContent = state === 'saving' ? 'Saving…' : state === 'error' ? 'Not saved' : 'Saved';
    savedEl.title = state === 'error' ? 'This browser refused to save the deck (its storage may be full).' : 'Every change is saved in this browser as you make it.';
  }
  function paintSteps(){
    if(!DECK_ID || !window.SleekStore || !undoBtn) return;
    SleekStore.canStep(DECK_ID).then(function(c){ undoBtn.disabled = !c.undo || stepping; redoBtn.disabled = !c.redo || stepping; });
  }
  function save(){
    if(!DECK_ID || !window.SleekStore || MIRROR || stepping) return Promise.resolve();
    if(!document.querySelector('#stage .slide')) return Promise.resolve();   // a page that lost its slides never overwrites the deck
    var doc;
    try { doc = buildSeed().seed; } catch(e){ console.error(e); return Promise.resolve(); }
    var j = JSON.stringify(doc);
    if(j === lastDoc) return saving || Promise.resolve();
    lastDoc = j;
    var quiet = firstSave; firstSave = false;            // the deck as it opened: tidied, not a step to undo
    if(!quiet) paintSaved('saving');
    saving = SleekStore.save(DECK_ID, doc, { noHistory: quiet, cover: cover() }).then(function(){ paintSaved('saved'); paintSteps(); try { if(bc) bc.postMessage({ steps: true }); } catch(e){} },
      function(e){ console.error('Sleek could not save the deck:', e); paintSaved('error'); });
    return saving;
  }
  // the start screen's card for this deck: the first slide's overline and headline
  function cover(){
    var s = slides[0]; if(!s) return null;
    function txt(sel){ var e = s.querySelector(sel); return e ? e.textContent.replace(/\s+/g, ' ').trim().slice(0, 140) : ''; }
    return { k: txt('.overline'), h: txt('.display, h1, h2') };
  }
  function markChanged(){ clearTimeout(pendT); pendT = setTimeout(save, 250); }
  // save now (before the page goes, or before a step back)
  function flushSave(){ clearTimeout(pendT); return save(); }
  window.addEventListener('pagehide', function(){ flushSave(); });
  document.addEventListener('visibilitychange', function(){ if(document.hidden) flushSave(); });
  // Undo / Redo: the deck becomes the step before (or after); every window of it loads again
  function stepDeck(dir){
    if(!DECK_ID || !window.SleekStore || stepping) return;
    flushSave().then(function(){
      return SleekStore[dir < 0 ? 'undo' : 'redo'](DECK_ID, { keepDevice: true });
    }).then(function(moved){
      if(!moved) return;
      stepping = true; paintSteps();
      clearDeviceEdits(function(){
        pingReload();
        try { sessionStorage.setItem('sleek-arrive', '1'); } catch(e){}   // the page fades back in
        location.reload();
      });
    });
  }
  if(undoBtn) undoBtn.onclick = function(){ stepDeck(-1); };
  if(redoBtn) redoBtn.onclick = function(){ stepDeck(1); };
  document.addEventListener('keydown', function(e){
    if(!(e.metaKey || e.ctrlKey) || (e.key !== 'z' && e.key !== 'Z' && e.key !== 'y')) return;
    var t = e.target;
    if(t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;   // the field undoes its own typing
    if(MIRROR) return;
    e.preventDefault();
    stepDeck(e.key === 'y' || e.shiftKey ? 1 : -1);
  });
  paintSaved('saved'); paintSteps();

  // ---------- duplicate / delete a slide (the grid's tile buttons) ----------
  // Done on the deck itself: put it together, change it, save it as one step, and load again on
  // the grid, with a note saying what happened (and Undo).
  function restructure(change, note){
    if(!DECK_ID || !window.SleekStore || stepping) return;
    flushSave().then(function(){
      var doc = buildSeed().seed;
      if(change(doc) === false) return;
      stepping = true;
      return SleekStore.save(DECK_ID, doc, { newStep: true }).then(function(){
        clearDeviceEdits(function(){
          pingReload();
          try { sessionStorage.setItem('sleek-arrive', '1'); sessionStorage.setItem('sleek-after', JSON.stringify({ grid: true, note: note })); } catch(e){}
          location.reload();
        });
      });
    });
  }
  function freshId(){ return Math.random().toString(36).slice(2, 8); }
  function copyPrefixed(map, from, to){
    if(!map) return;
    Object.keys(map).forEach(function(k){
      if(k.indexOf(from + '.') === 0) map[to + k.slice(from.length)] = JSON.parse(JSON.stringify(map[k]));
      else if(k.indexOf('b:' + from + '.') === 0) map['b:' + to + k.slice(2 + from.length)] = map[k];
      else if(k.indexOf('tile:' + from + '.') === 0) map['tile:' + to + k.slice(5 + from.length)] = JSON.parse(JSON.stringify(map[k]));
    });
  }
  function dropPrefixed(map, id){
    if(!map) return;
    Object.keys(map).forEach(function(k){ if(k.indexOf(id + '.') === 0 || k.indexOf('b:' + id + '.') === 0 || k.indexOf('tile:' + id + '.') === 0) delete map[k]; });
  }
  function slideAction(kind, k){
    var s = slides[k]; if(!s) return;
    var keys = slides.map(slideKey), key = slideKey(s);
    var names = slides.map(function(x){ return x.getAttribute('data-label'); });
    function unique(n){ var out = n, c = 2; while(names.indexOf(out) > -1) out = n + ' ' + (c++); return out; }
    if(kind === 'del'){
      if(slides.length < 2) return;
      restructure(function(doc){
        if(s._sid != null){
          var si = +String(s._sid).replace(/^seed/, ''), scr = (doc.annotations && doc.annotations.screens) || [];
          if(!/^seed\d+$/.test(s._sid) || !scr[si]) return false;
          scr.splice(si, 1);
          doc.order = keys.filter(function(x){ return x !== key; }).map(function(x){
            var m = /^scr:seed(\d+)$/.exec(x); return m && +m[1] > si ? 'scr:seed' + (+m[1] - 1) : x;
          });
        } else {
          var id = s.getAttribute('data-added');
          doc.added = (doc.added || []).filter(function(a){ return a.id !== id; });
          ['text', 'style', 'media', 'components', 'press', 'fits'].forEach(function(f){ dropPrefixed(doc[f], id); });
          if(doc.noteByKey) delete doc.noteByKey['add-' + id];
          doc.order = keys.filter(function(x){ return x !== key; });
        }
      }, (s.getAttribute('data-label') || 'Slide') + ' deleted');
    } else if(kind === 'dup'){
      var name = unique((s.getAttribute('data-label') || 'Slide') + ' copy');
      restructure(function(doc){
        var at = keys.indexOf(key);
        if(s._sid != null){
          var si = +String(s._sid).replace(/^seed/, ''), scr = (doc.annotations && doc.annotations.screens) || [];
          if(!/^seed\d+$/.test(s._sid) || !scr[si]) return false;
          var c = JSON.parse(JSON.stringify(scr[si])); c.name = name;
          scr.splice(si + 1, 0, c);
          var moved = keys.map(function(x){ var m = /^scr:seed(\d+)$/.exec(x); return m && +m[1] > si ? 'scr:seed' + (+m[1] + 1) : x; });
          moved.splice(at + 1, 0, 'scr:seed' + (si + 1));
          doc.order = moved;
        } else {
          var id = s.getAttribute('data-added'), nid = freshId(), list = doc.added || [];
          var src = list.filter(function(a){ return a.id === id; })[0]; if(!src) return false;
          var copy = { id: nid, t: src.t, name: name }; if(src.fill) copy.fill = src.fill;
          if(src.cl) copy.cl = JSON.parse(JSON.stringify(src.cl));   // a moodboard's pictures (their files come with the media below)
          if(src.fl) copy.fl = JSON.parse(JSON.stringify(src.fl));   // and its free pictures
          if(src.still) copy.still = true;                            // a carousel that stays put
          if(src.co) copy.co = src.co.slice();                        // and its pictures' order
          list.splice(list.indexOf(src) + 1, 0, copy); doc.added = list;
          ['text', 'style', 'media', 'components', 'press', 'fits'].forEach(function(f){ copyPrefixed(doc[f], id, nid); });
          doc.noteByKey = doc.noteByKey || {}; doc.noteByKey['add-' + nid] = s._notes || '';
          if(doc.slideTheme && s._lkey != null && doc.slideTheme[s._lkey] != null) doc.slideTheme[name] = doc.slideTheme[s._lkey];
          var pg = doc.annotations && doc.annotations.pages && s._lkey != null && doc.annotations.pages[s._lkey];
          if(pg) doc.annotations.pages[name] = JSON.parse(JSON.stringify(pg));
          var o = keys.slice(); o.splice(at + 1, 0, name); doc.order = o;
        }
      }, name + ' added');
    }
  }
  // after a reload: back on the grid, with a note
  var toastEl = null;
  function showToast(text, undo){
    if(toastEl) toastEl.remove();
    toastEl = document.createElement('div'); toastEl.className = 'sk-toast'; toastEl.setAttribute('role', 'status');
    toastEl.innerHTML = '<span></span>' + (undo ? '<button type="button">Undo</button>' : '');
    toastEl.querySelector('span').textContent = text;
    if(undo) toastEl.querySelector('button').onclick = function(){ toastEl.classList.remove('in'); stepDeck(-1); };
    document.body.appendChild(toastEl);
    var me0 = toastEl; setTimeout(function(){ me0.classList.add('in'); }, 30);
    var me = toastEl; setTimeout(function(){ me.classList.remove('in'); setTimeout(function(){ me.remove(); }, 400); }, 5000);
  }
  (function(){
    var after = null;
    try { after = JSON.parse(sessionStorage.getItem('sleek-after') || 'null'); sessionStorage.removeItem('sleek-after'); } catch(e){}
    if(!after || POPOUT || MIRROR) return;
    setTimeout(function(){ if(after.grid) openGrid(); if(after.note) showToast(after.note, true); }, 60);
  })();

  // ================= presenter remote: the live preview drives the audience screen =================
  // Inputs travel as "acts" over a BroadcastChannel. The audience window performs every act (its own
  // clicks and keys, and requests from the presenter / preview) and echoes each one, so the preview,
  // a mirror deck, replays the same acts and stays in step: take-apart, expanded tiles.
  var AUDIENCE = !PRESENTERWIN && !MIRROR, inputBC = null, remoteFeature = false;
  var presAliveAt = 0;                                          // last heartbeat from an open presenter window
  function presenting(){ return AUDIENCE && Date.now() - presAliveAt < 4000; }
  // the presenter window this one opened: the moment it closes, the bar and the controls come back
  var presWin = null, presWatch = 0;
  function watchPresenter(w){
    presWin = w; clearInterval(presWatch);
    presWatch = setInterval(function(){
      var gone = true; try { gone = !presWin || presWin.closed; } catch(e){}
      if(!gone) return;
      clearInterval(presWatch); presWin = null; presAliveAt = 0; setPresenting(false);
    }, 250);
  }
  // While a presenter window is open, this is the audience's screen: the bar and the other controls
  // go (styles.css, body.presenting) and the slide takes the whole window.
  function setPresenting(on){
    if(document.body.classList.contains('presenting') === on) return;
    document.body.classList.toggle('presenting', on);
    fit();
  }
  if(AUDIENCE) setInterval(function(){ if(!presenting()) setPresenting(false); }, 500);   // a presenter that went quietly
  try { inputBC = new BroadcastChannel(NS + 'sleek-input'); } catch(e){}
  function sendInput(msg){ try { if(inputBC) inputBC.postMessage(msg); } catch(e){} }

  // ---------- presenter annotate: boxes and a cursor the audience sees ----------
  // In the presenter window, Box draws on the preview (the box grows on the audience screen as you drag)
  // and Cursor shows the audience a soft dot where you point on the preview. They travel as "mark"
  // messages in slide coordinates (1280x720); the audience and the preview draw them over everything,
  // the open image included. Changing slides fades them out, and so does Space (it clears first).
  var marksEl = null, markCount = 0;
  function marksLayer(){
    if(!marksEl){
      marksEl = document.createElement('div'); marksEl.className = 'marks'; marksEl.setAttribute('aria-hidden', 'true');
      marksEl.innerHTML = '<span class="mk-cursor"></span>';
      document.body.appendChild(marksEl);
      window.addEventListener('resize', placeMarks);
      document.addEventListener('fullscreenchange', placeMarks);
      placeMarks();
    }
    return marksEl;
  }
  function placeMarks(){
    if(!marksEl) return;
    var r = stage.getBoundingClientRect();
    marksEl.style.transform = 'translate(' + r.left + 'px,' + r.top + 'px) scale(' + (r.width / 1280) + ')';
    Array.prototype.forEach.call(marksEl.querySelectorAll('.mk-box'), function(b){ if(b._m && b._m.space === 'view') drawMark(b._m); });
  }
  // The full-screen player sizes its picture to its own window, so the audience's and the preview's open
  // picture sit in different places on the slide. While one is open, marks are placed on the picture
  // itself (as fractions of it), so a box lands on the same part of it on both screens.
  function viewRect(){
    var v = viewer; if(!v || v.el.hidden || v.el.classList.contains('iv-wait')) return null;
    var m = !v.vid.hidden ? v.vid : v.img, r = m && m.getBoundingClientRect();
    return r && r.width ? { left: r.left, top: r.top, width: r.width, height: r.height } : null;
  }
  window.__viewRect = viewRect;
  // a mark's box in slide coordinates (what the layer draws in)
  function markBox(m){
    if(m.space !== 'view') return { x: m.x, y: m.y, w: m.w || 0, h: m.h || 0 };
    var r = viewRect(); if(!r) return null;
    var sr = stage.getBoundingClientRect(), k = sr.width / 1280;
    return { x: (r.left + m.x * r.width - sr.left) / k, y: (r.top + m.y * r.height - sr.top) / k, w: (m.w || 0) * r.width / k, h: (m.h || 0) * r.height / k };
  }
  // Moves arrive faster than frames: keep the latest box and cursor, and draw them once, on the next frame
  var markQ = {}, markRaf = 0;
  function applyMark(m){
    if(PRESENTERWIN){ if(m.op === 'clear') markCount = 0; return; }
    if(m.op === 'box' && !m.done || m.op === 'cursor'){
      markQ[m.op === 'cursor' ? 'cursor' : m.id] = m;
      if(!markRaf) markRaf = requestAnimationFrame(flushMarks);
      return;
    }
    drawMark(m);
  }
  function flushMarks(){ markRaf = 0; var q = markQ; markQ = {}; Object.keys(q).forEach(function(k){ drawMark(q[k]); }); }
  function drawMark(m){
    var L = marksLayer();
    if(m.op === 'box'){
      if(markQ[m.id]) delete markQ[m.id];
      var g = markBox(m); if(!g) return;
      var b = L.querySelector('.mk-box[data-id="' + m.id + '"]'), isNew = !b;
      if(isNew){ b = document.createElement('div'); b.className = 'mk-box'; b.setAttribute('data-id', m.id); L.appendChild(b); }
      b._m = m; if(m.space === 'view') b.classList.add('on-view');
      b.style.transform = 'translate(' + g.x + 'px,' + g.y + 'px)'; b.style.width = g.w + 'px'; b.style.height = g.h + 'px';
      if(isNew) requestAnimationFrame(function(){ b.classList.add('in'); });
      if(m.done) b.classList.add('set');
    } else if(m.op === 'box-del'){
      delete markQ[m.id];
      var d = L.querySelector('.mk-box[data-id="' + m.id + '"]'); if(d) d.remove();
    } else if(m.op === 'clear'){
      clearMarks();
    } else if(m.op === 'cursor'){
      var cg = markBox(m), c = L.querySelector('.mk-cursor'); if(!cg){ c.classList.remove('on'); return; }
      c.style.transform = 'translate3d(' + cg.x + 'px,' + cg.y + 'px,0)'; c.classList.add('on');
    } else if(m.op === 'cursor-off'){
      delete markQ.cursor; L.querySelector('.mk-cursor').classList.remove('on');
    }
  }
  function sendMark(m){ m.kind = 'mark'; sendInput(m); }
  // fade the boxes out (this window only: every window clears on its own slide change)
  function clearMarks(){
    markCount = 0;
    var cq = markQ && markQ.cursor; markQ = {}; if(cq) markQ.cursor = cq;     // a box still waiting to draw is cleared too
    if(!marksEl) return;
    Array.prototype.forEach.call(marksEl.querySelectorAll('.mk-box:not(.out)'), function(b){
      b.classList.add('out'); setTimeout(function(){ b.remove(); }, 420);
    });
  }
  function clearViewMarks(){
    if(!marksEl) return;
    Array.prototype.forEach.call(marksEl.querySelectorAll('.mk-box.on-view:not(.out)'), function(b){ b.classList.add('out'); setTimeout(function(){ b.remove(); }, 420); });
  }
  function hasMarks(){ return PRESENTERWIN ? markCount > 0 : !!(marksEl && marksEl.querySelector('.mk-box:not(.out)')); }
  // Space with boxes on screen clears them (everywhere) instead of doing what Space does
  function spaceClearsMarks(e){
    if(MIRROR || e.key !== ' ' || e.repeat || !hasMarks()) return false;   // the preview passes its keys on
    if(/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable) return false;
    e.preventDefault(); e.stopImmediatePropagation();
    clearMarks(); sendMark({ op: 'clear' });
    return true;
  }
  if(!MIRROR) window.addEventListener('keydown', spaceClearsMarks, true);
  if(inputBC) inputBC.addEventListener('message', function(e){ var m = e.data || {}; if(m.kind === 'mark') applyMark(m); });
  // the preview reports where the presenter points while Cursor is on (it's the preview's own pointer)
  if(MIRROR){
    var presTool = function(){ try { return window.parent !== window ? window.parent.__presTool : null; } catch(_){ return null; } };
    window.addEventListener('pointermove', function(e){
      if(presTool() !== 'cursor') return;
      var vr = viewRect(), p = vr ? { x: (e.clientX - vr.left) / vr.width, y: (e.clientY - vr.top) / vr.height } : toStageXY(e.clientX, e.clientY);
      var m = { op: 'cursor', x: p.x, y: p.y, space: vr ? 'view' : 'slide' };
      sendMark(m); applyMark(m);
    }, true);
    document.documentElement.addEventListener('pointerleave', function(){ if(presTool() !== 'cursor') return; var m = { op: 'cursor-off' }; applyMark(m); sendMark(m); });
  }
  if(PRESENTERWIN){
    window.__presTool = null;
    var shotEl = document.getElementById('pres-shot'), drawEl = document.createElement('div'), boxN = 0;
    drawEl.className = 'pres-draw'; drawEl.hidden = true; if(shotEl) shotEl.appendChild(drawEl);
    var setTool = function(t){
      if(window.__presTool === 'cursor' && t !== 'cursor') sendMark({ op: 'cursor-off' });
      window.__presTool = t;
      drawEl.hidden = t !== 'box';
      Array.prototype.forEach.call(document.querySelectorAll('.pres-tool'), function(b){ b.setAttribute('aria-pressed', String(b.dataset.tool === t)); });
      document.body.classList.toggle('pres-cursor-on', t === 'cursor');
    };
    Array.prototype.forEach.call(document.querySelectorAll('.pres-tool'), function(b){
      b.addEventListener('click', function(){ setTool(window.__presTool === b.dataset.tool ? null : b.dataset.tool); b.blur(); });
    });
    var wipeBtn = document.getElementById('pres-wipe');
    if(wipeBtn) wipeBtn.addEventListener('click', function(){ sendInput({ kind: 'req', act: { t: 'wipe' } }); wipeBtn.blur(); });
    // the preview's own slide box, so a point on the preview lands on the same spot of the slide
    var viewBox = null;
    var measure = function(){
      var f = shotEl.querySelector('iframe'), sr;
      try { sr = f.contentDocument.getElementById('stage').getBoundingClientRect(); } catch(_){ sr = { left: 0, top: 0, width: 1280 }; }
      try { viewBox = f.contentWindow.__viewRect ? f.contentWindow.__viewRect() : null; } catch(_){ viewBox = null; }
      frameEl = f.getBoundingClientRect(); frameRect = sr;
    };
    var toSlide = function(e){
      var fr = frameEl, sr = frameRect, k = fr.width / 1280;
      var px = (e.clientX - fr.left) / k, py = (e.clientY - fr.top) / k, z = sr.width / 1280;
      if(viewBox) return { x: (px - viewBox.left) / viewBox.width, y: (py - viewBox.top) / viewBox.height };   // fractions of the open picture
      return { x: Math.max(0, Math.min(1280, (px - sr.left) / z)), y: Math.max(0, Math.min(720, (py - sr.top) / z)) };
    };
    var drag = null, frameEl = null, frameRect = null;
    var boxMsg = function(done){
      var a = drag.a, b = drag.b;
      return { op: 'box', id: drag.id, x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y), done: done, space: drag.space };
    };
    drawEl.addEventListener('pointerdown', function(e){
      e.preventDefault(); try { drawEl.setPointerCapture(e.pointerId); } catch(_){}
      measure(); var p = toSlide(e); drag = { id: Date.now().toString(36) + (++boxN), a: p, b: p, sent: false, space: viewBox ? 'view' : 'slide' };
    });
    drawEl.addEventListener('pointermove', function(e){
      if(!drag) return; drag.b = toSlide(e);
      var m = boxMsg(false), big = drag.space === 'view' ? m.w * viewBox.width > 4 || m.h * viewBox.height > 4 : m.w > 4 || m.h > 4;
      if(big){ drag.sent = true; sendMark(m); }
    });
    var endDraw = function(){
      if(!drag) return; var m = boxMsg(true);
      var tiny = drag.space === 'view' ? m.w * viewBox.width < 8 && m.h * viewBox.height < 8 : m.w < 8 && m.h < 8;
      if(tiny){ if(drag.sent) sendMark({ op: 'box-del', id: drag.id }); }   // a click, not a box
      else { sendMark(m); markCount++; }
      drag = null;
    };
    drawEl.addEventListener('pointerup', endDraw); drawEl.addEventListener('pointercancel', endDraw);
  }
  function featureActive(){ return !!((window.Deck && Deck.modal) || document.querySelector('#stage .dis-inline')); }
  function announceFeature(){
    if(!AUDIENCE) return;
    sendInput({ kind: 'feature', on: featureActive() });
    sendInput({ kind: 'echo', act: { t: 'asm', p: asmPath() } });   // the preview matches this state, not just the clicks
    sendInput({ kind: 'echo', act: { t: 'notes-open', s: i, open: openCallouts() } });
  }
  // the annotation notes open on this slide (they stay open across slide changes, so clicks alone drift)
  // Each comes with where it sits (flipped above its pin, nudged in from an edge), so a note lands in the
  // same place on both screens and a click on its image in the preview hits it on the audience screen.
  function openCallouts(){
    var s = slides[i]; if(!s) return [];
    return Array.prototype.filter.call(s.querySelectorAll('.callout'), isCalloutOpen).map(function(co){
      return co.dataset.aid + '|' + (co.classList.contains('above') ? 1 : 0) + '|' + (co.style.translate || '');
    });
  }
  function setOpenCallouts(n, open){
    var s = slides[n]; if(!s || n !== i) return;
    var place = {};
    open.forEach(function(e){ var q = String(e).split('|'); place[q[0]] = { above: q[1] === '1', tr: q[2] || '' }; });
    Array.prototype.forEach.call(s.querySelectorAll('.callout'), function(co){
      var at = place[co.dataset.aid];
      if(isCalloutOpen(co) !== !!at) setCalloutOpen(co, !!at);
      if(at){
        co.classList.toggle('above', at.above);
        if(at.above) co.dataset.autoAbove = '1'; else delete co.dataset.autoAbove;
        co.style.translate = at.tr;
      }
    });
    Array.prototype.forEach.call(s.querySelectorAll('.abox'), function(b){
      var r = annById(b.dataset.aid); b.classList.toggle('spot', !!(r && r.a.spot && place[b.dataset.aid]));
    });
  }
  // the tile taken apart in place , as a path the preview can find
  function asmPath(){ var t = window.Deck && Deck.inlineTile && Deck.inlineTile(); return t ? pathOf(t) : null; }
  function setAsm(p){
    if(!window.Deck || !Deck.inlineSet || asmPath() === p) return;
    var t = p ? byPath(p) : null; if(p && !t) return;
    Deck.inlineSet(t);
  }
  function toStageXY(cx, cy){ var r = stage.getBoundingClientRect(), k = r.width / 1280; return { x: (cx - r.left) / k, y: (cy - r.top) / k }; }
  function inStage(cx, cy){ var r = stage.getBoundingClientRect(); return cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom; }
  function viewerOp(t){
    if(!t.closest || !t.closest('.imgview')) return null;
    if(t.closest('.iv-prev')) return 'prev'; if(t.closest('.iv-next')) return 'next';
    if(t.closest('.iv-close') || t.closest('.iv-dim')) return 'close';
    return 'none';
  }
  function applyAct(a){
    if(a.t === 'click'){
      var r = stage.getBoundingClientRect(), k = r.width / 1280, cx = r.left + a.x * k, cy = r.top + a.y * k;
      var el = document.elementFromPoint(cx, cy);
      if(!el) return;
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window, clientX: cx, clientY: cy }));
    } else if(a.t === 'viewer'){
      if(a.op === 'close') closeImageViewer(); else if(a.op === 'prev') stepImage(-1); else if(a.op === 'next') stepImage(1);
      else if(a.op === 'cmp' && viewer){ viewer.remoteP = a.p; if(a.d && !viewer.cmp.hidden) sweepCompare(a.p, a.d, null, a.ease); else { viewer.sweepId = (viewer.sweepId || 0) + 1; setCompare(a.p, true); } }
    } else if(a.t === 'open'){
      openTarget(a.ref);                                       // a link in the speaker notes
    } else if(a.t === 'wipe'){
      if(AUDIENCE) runWipe();                                   // the preview follows the sweep it echoes
    } else if(a.t === 'asm'){
      setAsm(a.p);
    } else if(a.t === 'notes-open'){
      if(MIRROR) setOpenCallouts(a.s, a.open || []);
    } else if(a.t === 'carshift'){
      var tr = byPath(a.p); if(tr) carShift(tr, a.px);
    } else if(a.t === 'key'){
      document.dispatchEvent(new KeyboardEvent('keydown', { key: a.key, bubbles: true, cancelable: true }));
    }
  }
  var KEYS = ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'PageDown', 'PageUp', ' ', 'Enter', 'Escape', 'Backspace', 'Home', 'End', 'a', 'A'];
  if(inputBC) inputBC.onmessage = function(e){
    var m = e.data || {};
    if(AUDIENCE){
      if(m.kind === 'req'){
        // a slide key only moves slides, and that syncs on its own; echoing it would move the preview twice
        var wasActive = featureActive() || (viewer && !viewer.el.hidden);
        applyAct(m.act);
        if(m.act.t !== 'key' || wasActive) sendInput({ kind: 'echo', act: m.act });
        setTimeout(announceFeature, 50);
      }
      else if(m.kind === 'ask'){ announceFeature(); broadcast(); }   // a presenter or preview just opened: here's where we are
      else if(m.kind === 'pres-alive'){
        presAliveAt = Date.now(); setPresenting(true);
        if(document.body.classList.contains('pres-bar') !== !!m.bar){ document.body.classList.toggle('pres-bar', !!m.bar); fit(); }   // the presenter's Show bottom bar
      }
      else if(m.kind === 'pres-bye'){ presAliveAt = 0; setPresenting(false); }
    } else if(MIRROR){
      if(m.kind === 'echo') applyAct(m.act);
    } else if(PRESENTERWIN){
      if(m.kind === 'feature') remoteFeature = !!m.on;
    }
  };
  if(AUDIENCE){
    // echo what happens here so the preview replays it
    window.addEventListener('click', function(e){
      if(!e.isTrusted || editing) return;
      if(e.target.closest && e.target.closest('.notes, .nl-menu')) return;   // the notes drawer sits over the stage: not a click on the slide
      var op = viewerOp(e.target);
      if(op){ if(op !== 'none') sendInput({ kind: 'echo', act: { t: 'viewer', op: op } }); }
      else if(inStage(e.clientX, e.clientY)){ var p = toStageXY(e.clientX, e.clientY); sendInput({ kind: 'echo', act: { t: 'click', x: p.x, y: p.y } }); }
      setTimeout(announceFeature, 50);
    }, true);
    window.addEventListener('keydown', function(e){
      if(!e.isTrusted || editing || KEYS.indexOf(e.key) < 0) return;
      if(/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable) return;
      if(featureActive() || (viewer && !viewer.el.hidden)) sendInput({ kind: 'echo', act: { t: 'key', key: e.key } });   // slide keys sync on their own
      setTimeout(announceFeature, 50);
    }, true);
  }
  if(MIRROR) sendInput({ kind: 'ask' });
  if(MIRROR){
    // the preview never acts on its own: its clicks and keys go to the audience, and come back as echoes
    window.addEventListener('click', function(e){
      if(!e.isTrusted) return;
      e.preventDefault(); e.stopImmediatePropagation();
      var op = viewerOp(e.target);
      if(op){ if(op !== 'none') sendInput({ kind: 'req', act: { t: 'viewer', op: op } }); return; }
      var p = toStageXY(e.clientX, e.clientY); sendInput({ kind: 'req', act: { t: 'click', x: p.x, y: p.y } });
    }, true);
    ['mousedown', 'mouseup', 'dblclick', 'wheel'].forEach(function(t){ window.addEventListener(t, function(e){
      if(!e.isTrusted) return;
      e.preventDefault(); e.stopImmediatePropagation();
      var car = t === 'wheel' && e.target.closest && e.target.closest('#stage .slide.active .carousel');   // scrolling a carousel in the preview scrolls it for real
      if(car){ var d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY; if(d) carMove(car.querySelector('.car-track'), d * (e.deltaMode === 1 ? 32 : 1) / (stage.getBoundingClientRect().width / 1280)); }
    }, { capture: true, passive: false }); });
    window.addEventListener('keydown', function(e){
      if(!e.isTrusted) return;
      e.preventDefault(); e.stopImmediatePropagation();
      // the presenter's preview has focus: ← / → change slides, like they do everywhere in the presenter
      var nav = (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && (function(){ try { return window.parent !== window && window.parent.__presNav; } catch(_){ return null; } })();
      if(nav){ nav(e.key === 'ArrowRight' ? 1 : -1); return; }
      if(KEYS.indexOf(e.key) > -1) sendInput({ kind: 'req', act: { t: 'key', key: e.key } });
    }, true);
  }
  // ---------- keep the preview's motion 1:1 with the audience ----------
  // A few times a second the audience reports where every animation and video on the current slide
  // is (carousels, film strips, textures, tile videos, the full-screen player); the preview matches
  // play / pause exactly and snaps its time whenever it drifts.
  function pathOf(el){                                       // child indexes from the stage down (blooms don't count)
    var p = [];
    while(el && el !== stage){
      var par = el.parentNode; if(!par) return null;
      var k = 0, c = par.firstElementChild;
      while(c && c !== el){ if(!c.classList.contains('tile-bloom')) k++; c = c.nextElementSibling; }
      p.unshift(k); el = par;
    }
    return el === stage ? p.join('.') : null;
  }
  function byPath(path){
    var el = stage;
    path.split('.').forEach(function(n){
      if(!el) return;
      var k = +n, c = el.firstElementChild;
      while(c && (c.classList.contains('tile-bloom') || k > 0)){ if(!c.classList.contains('tile-bloom')) k--; c = c.nextElementSibling; }
      el = c;
    });
    return el;
  }
  function inScope(el){
    var cur = slides[i]; if(!el || !stage.contains(el)) return false;
    var sl = el.closest('.slide'); return sl ? sl === cur : true;       // the current slide, or a stage overlay (a take-apart)
  }
  function motionState(){
    var anims = [], vids = [];
    (document.getAnimations ? document.getAnimations() : []).forEach(function(a){
      var t = a.effect && a.effect.target;
      if(!t || !a.animationName || !inScope(t)) return;                 // CSS animations only; transitions follow the acts
      var p = pathOf(t); if(p) anims.push({ p: p, n: a.animationName, t: a.currentTime, s: a.playState });
    });
    Array.prototype.forEach.call(stage.querySelectorAll('video'), function(v){
      if(!inScope(v)) return; var p = pathOf(v); if(p) vids.push({ p: p, t: v.currentTime, paused: v.paused });
    });
    var vw = viewer && !viewer.el.hidden && !viewer.vid.hidden && !viewer.el.classList.contains('iv-wait') ? { t: viewer.vid.currentTime, paused: viewer.vid.paused } : null;
    // hid: this window isn't being drawn (hidden, or covered and throttled), so its clocks aren't moving
    return { kind: 'clock', slide: i, at: Date.now(), hid: document.visibilityState === 'hidden', asm: asmPath(), notes: openCallouts(), anims: anims, vids: vids, viewer: vw };
  }
  // The preview runs at its own normal speed and only snaps when it's really off (a scrub, a restart,
  // a quarter second or more). Changing an animation's speed to creep back into step makes Chrome
  // re-seat the moving layer, which flickers, so it never does that. If the audience window isn't drawing
  // (hidden, or covered and throttled, so its clocks stand still), the preview just keeps running on its
  // own rather than being yanked back to a frozen time.
  var lastClock = {}, asmMiss = 0, notesMiss = 0;
  function applyMotion(m){
    if(m.slide !== i) return;
    // take-apart state: if it still disagrees on a second report, match it (a click that slipped)
    if('asm' in m){ if(asmPath() !== m.asm){ if(++asmMiss >= 2){ asmMiss = 0; setAsm(m.asm); } } else asmMiss = 0; }
    // open annotation notes: the same (they stay open across slides, so the preview can start out of step)
    if(m.notes){ if(openCallouts().join() !== m.notes.join()){ if(++notesMiss >= 2){ notesMiss = 0; setOpenCallouts(i, m.notes); } } else notesMiss = 0; }
    if(m.hid) return;
    var lag = Math.max(0, Date.now() - m.at);
    m.anims.forEach(function(a){
      var el = byPath(a.p); if(!el || !el.getAnimations) return;
      var x = el.getAnimations().filter(function(y){ return y.animationName === a.n; })[0]; if(!x) return;
      var key = a.p + '|' + a.n, prev = lastClock[key]; lastClock[key] = { t: a.t, at: m.at };
      if(a.s === 'paused' && x.playState !== 'paused') x.pause();
      else if(a.s === 'running' && x.playState === 'paused') x.play();
      if(a.t == null) return;
      var target = a.s === 'running' ? a.t + lag : a.t, drift = target - (x.currentTime || 0);
      // running there, but its clock hasn't moved: that window has stopped drawing; leave this one be
      var stalled = a.s === 'running' && prev && m.at - prev.at > 200 && (a.t - prev.t) < (m.at - prev.at) * 0.5;
      if(stalled) return;
      if(Math.abs(drift) > (a.s === 'running' ? 250 : 40)) x.currentTime = target;
    });
    m.vids.forEach(function(v){
      var el = byPath(v.p); if(!el || el.tagName !== 'VIDEO') return;
      syncVideo(el, v.t + (v.paused ? 0 : lag / 1000), v.paused);
    });
    // carousel hand moves arrive as their own messages, so a scrub never waits for this
    if(m.viewer && viewer && !viewer.el.hidden && !viewer.vid.hidden) syncVideo(viewer.vid, m.viewer.t + (m.viewer.paused ? 0 : lag / 1000), m.viewer.paused);
  }
  function syncVideo(el, t, paused){
    if(paused && !el.paused) el.pause();
    else if(!paused && el.paused){ var p = el.play(); if(p && p.catch) p.catch(function(){}); }
    if(el.readyState >= 1 && Math.abs(el.currentTime - t) > 0.3){ try { el.currentTime = t; } catch(e){} }
  }
  if(AUDIENCE && inputBC) setInterval(function(){ sendInput(motionState()); }, 350);
  if(MIRROR && inputBC){
    var prevOnMsg = inputBC.onmessage;
    inputBC.onmessage = function(e){ var m = e.data || {}; if(m.kind === 'clock') applyMotion(m); else if(prevOnMsg) prevOnMsg(e); };
  }

  if(PRESENTERWIN){
    sendInput({ kind: 'ask' });
    // Present Mode: while this window is open, the audience deck knows (a before / after plays its wipe on open)
    // Show bottom bar (under the notes): the audience screen keeps its bar while you present. It's
    // remembered on this device, and every heartbeat carries it, so a reloaded audience screen follows too.
    var barOn = false; try { barOn = localStorage.getItem(NS + 'pres-bar') === '1'; } catch(e){}
    var barBtn = document.getElementById('pres-bar');
    function paintBarBtn(){ if(barBtn){ barBtn.setAttribute('aria-pressed', String(barOn)); barBtn.title = barOn ? 'The audience sees the bottom bar: click to hide it' : 'Show the bottom bar on the audience screen'; } }
    function alive(){ sendInput({ kind: 'pres-alive', bar: barOn }); }
    if(barBtn) barBtn.onclick = function(){
      barOn = !barOn; paintBarBtn(); alive();
      try { localStorage.setItem(NS + 'pres-bar', barOn ? '1' : '0'); } catch(e){}
    };
    paintBarBtn();
    alive();
    setInterval(alive, 1500);
    window.addEventListener('pagehide', function(){ sendInput({ kind: 'pres-bye' }); });
    window.addEventListener('beforeunload', function(){ sendInput({ kind: 'pres-bye' }); });
    // ← / → always change slides here, whatever has focus (a button, a cue, the preview) and whatever is
    // open on the audience screen; only typing in the notes keeps them for the caret
    window.__presNav = function(d){ if(d > 0) next(); else prev(); };
    window.addEventListener('keydown', function(e){
      if(e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      if(/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable) return;
      e.preventDefault(); e.stopImmediatePropagation();
      window.__presNav(e.key === 'ArrowRight' ? 1 : -1);
    }, true);
    // while something is open on the audience screen, the presenter's other keys drive it there
    window.addEventListener('keydown', function(e){
      if(!remoteFeature || KEYS.indexOf(e.key) < 0) return;
      if(/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable) return;
      e.preventDefault(); e.stopImmediatePropagation();
      sendInput({ kind: 'req', act: { t: 'key', key: e.key } });
    }, true);
  }

  var deckModal = false;
  window.Deck = {
    stage: stage, SEED: SEED, popout: POPOUT,
    get modal(){ return deckModal; },              // true while a feature owns the screen
    set modal(v){ deckModal = !!v; document.body.classList.toggle('deck-modal', deckModal); announceFeature(); },
    featureChanged: function(){ announceFeature(); },          // features that don't take the screen (in-place take-apart)
    echoAct: function(a){ if(AUDIENCE) sendInput({ kind: 'echo', act: a }); },
    mirror: MIRROR,
    inset: 0, refit: function(){ fit(); },          // room kept clear under the slide, in window pixels
    onShow: [],                                     // fn(slideEl, index) after every slide change
    onReset: [],                                    // fn(slideEl): close what's open, animated (the notes' "Slide" link)
    isEditing: function(){ return editing || annotating; },    // features stay shut while editing or annotating
    current: function(){ return slides[i]; },
    index: function(){ return i; },                 // where the deck is, and a way to go somewhere (features/viewers.js)
    go: function(k){ if(gridOpen) closeGrid(k); else show(k); },
    labels: function(){ return slides.map(function(s, k){ return s.getAttribute('data-label') || ('Slide ' + (k + 1)); }); },
    onGrid: [],                                     // fn(tilesEl) each time All slides is drawn
    tileSrc: function(m){ return tileSrc(m); },     // the image a tile shows (device edit or seed)
    templates: function(){ return TEMPLATES.map(function(t){ return { key: t.key, name: t.name, desc: t.desc }; }); },
    templatePreview: function(key, extra){ return templatePreview(key, extra); },
    sampleTint: function(src, cb){ return sampleTint(src, cb); },   // a layout's sample picture in the deck's accent
    sampleRecolor: function(text){ return sampleRecolor(text); },
    // add a slide from a template; the page rebuilds itself and opens on it. at: where it goes in the
    // deck (none: the end); extra: what it starts with (its name, a chart's kind)
    addSlide: function(key, at, extra){
      var t = templateBy(key); if(!t) return null;
      var names = slides.map(function(s){ return s.getAttribute('data-label'); }).concat(ADDED.map(function(a){ return a.name; }));
      var base = (extra && extra.name) || t.name, name = base, n = 2; while(names.indexOf(name) > -1) name = base + ' ' + (n++);
      var a = { id: Math.random().toString(36).slice(2, 8), t: key, name: name };
      Object.keys(extra || {}).forEach(function(k){ if(k !== 'name' && k !== 'id' && k !== 't') a[k] = extra[k]; });
      ADDED.push(a); saveAdded();
      var end = typeof at !== 'number' || at >= slides.length;
      if(!end || orderOverride || SEED.order){                   // the order says where it goes (the slide joins it when the page loads again); a deck still in its own order takes it last
        var keys = orderKeys(); keys.splice(end ? keys.length : Math.max(0, at), 0, name);
        orderOverride = keys; try { localStorage.setItem(NS + 'deck-order', JSON.stringify(keys)); } catch(e){}
      }
      flushSave();
      try { sessionStorage.setItem('sleek-arrive', '1'); } catch(e){}
      pingReload();
      return '#' + slugify(name);
    },
    // Before pictures (features/before-picker.js)
    beforeInfo: function(mid){
      var t = tileByMid(mid), v = beforePick(mid);
      return { pick: v, src: t ? beforeFor(t) : null, after: t ? tileSrc(t) : null, auto: !v && t ? (t.hasAttribute('data-before-src') ? 'sample' : pairedBefore(t) ? 'caption' : '') : '',
               slide: t && t.closest('.slide') ? t.closest('.slide').getAttribute('data-label') : '' };
    },
    beforeChoices: function(mid){
      var seen = {};
      return Array.prototype.filter.call(document.querySelectorAll('#stage .slide:not(.s-screen) .media[data-mid]'), function(m){
        var id = m.getAttribute('data-mid'), src = tileSrc(m);
        if(seen[id] || id === mid || m.closest('.car-copy, .fs-copy, .cl-copy') || !src || isVideo(src)) return false;
        return (seen[id] = true);
      }).map(function(m){
        var s = m.closest('.slide'), c = m.querySelector('.cap');
        return { mid: m.getAttribute('data-mid'), src: tileSrc(m), slide: s.getAttribute('data-label') || '', cap: c ? c.textContent.trim() : '' };
      });
    },
    setBefore: function(mid, v){ setBefore(mid, v); },
    // take-apart: a tile's own layers (this device's edit, else the deck's), and whether its picture is its own
    tileComponent: function(mid){ return (mid && (compEdits[mid] || (SEED.components && SEED.components['tile:' + mid]))) || null; },
    pressClip: function(eid){ return !eid ? undefined : eid in pressEdits ? pressEdits[eid] : (SEED.press && eid in SEED.press ? SEED.press[eid] : undefined); },
    setPressClip: function(eid, c){ if(!eid) return; if(c === undefined) delete pressEdits[eid]; else pressEdits[eid] = c; savePress(); },
    onPress: pressListeners,
    setTileComponent: function(mid, c){ if(!mid) return; if(c) compEdits[mid] = c; else delete compEdits[mid]; saveComps(); },
    mediaIsCustom: function(mid){
      var t = tileByMid(mid), v = mid && (mediaImages[mid] || (SEED.media && SEED.media[mid]));
      return !!v && (!t || v !== t.getAttribute('data-default-src'));
    },
    tilePicture: function(tile){ return tile ? tileSrc(tile) : null; },
    isVideo: function(src){ return isVideo(src); },
    mediaFromFile: function(f, place){ mediaFromFile(f, place); },
    fileKind: function(f){ return fileKind(f); },
    hideZoom: function(){ hideZoom(); },
    openImage: function(list, k, from){ openImageViewer(list, k || 0, from); },   // the big viewer, growing out of from
    flush: function(){ return flushSave(); },      // save now (before a download or leaving)
    toast: function(text, undo){ showToast(text, undo); },
    // moodboards (features/collage.js): the slide's entry in the deck, and the tiles' pictures
    addedOf: function(s){ var id = s && s.getAttribute('data-added'); return ADDED.filter(function(a){ return a.id === id; })[0] || null; },
    saveAdded: function(){ saveAdded(); markChanged(); },
    setupTile: function(m){ setupTile(m); },
    fitOf: function(mid){ return fitOf(mid); },       // Fill / Fit / Crop (features/fit.js)
    setFit: function(mid, o){ setFit(mid, o); },
    mediaOf: function(mid){ var v = mid && (mediaImages[mid] || (SEED.media && SEED.media[mid])); return v && v !== 'none' ? v : null; },
    setMedia: function(mid, src){ if(src == null) delete mediaImages[mid]; else mediaImages[mid] = src; },
    applyMedia: function(){ applyMedia(); },
    saveMedia: function(){ saveMedia(); },
    onMedia: mediaListeners,
    pingReload: function(){ pingReload(); },
    presenter: PRESENTERWIN,
    armVideos: function(){ armVideos(true); },
    stageRect: function(el){                        // element box in slide (1280x720) coordinates
      var sr = stage.getBoundingClientRect(), k = sr.width / 1280, r = el.getBoundingClientRect();
      return { x: (r.left - sr.left) / k, y: (r.top - sr.top) / k, w: r.width / k, h: r.height / k };
    }
  };

  // ---------- trays and menus animate open and closed ----------
  // Watches each one's hidden attribute, so every place that opens or closes it gets the motion.
  // Opening plays .ui-in; closing keeps it on screen (as .ui-out, still [hidden] for the code that
  // checks) until its fade ends. Groups inside the edit bar only fade in, so the bar never holds the
  // old group while the new one arrives.
  function uiAnim(el, kind, inOnly){
    if(!el) return;
    el.setAttribute('data-ui', kind);
    var disp = el.hidden ? '' : getComputedStyle(el).display, t = 0, was = el.hidden;
    function done(e){ if(e && e.target !== el) return; clearTimeout(t); el.classList.remove('ui-in', 'ui-out'); }
    el.addEventListener('animationend', done); el.addEventListener('animationcancel', done);
    new MutationObserver(function(){
      if(el.hidden === was) return;                         // closing what's already closed (every slide change) plays nothing
      was = el.hidden;
      el.classList.remove('ui-in', 'ui-out'); clearTimeout(t);
      if(!el.hidden){
        disp = getComputedStyle(el).display;
        void el.offsetWidth; el.classList.add('ui-in');
      } else if(disp && !inOnly){
        el.style.setProperty('--ui-display', disp);
        void el.offsetWidth; el.classList.add('ui-out');
        t = setTimeout(done, 450);                          // a window that isn't drawing never ends the fade
      }
    }).observe(el, { attributes: true, attributeFilter: ['hidden'] });
  }
  uiAnim(document.getElementById('editbar'), 'rise');
  uiAnim(document.getElementById('eb-text'), 'fade', true);
  uiAnim(document.getElementById('eb-annot'), 'fade', true);
  uiAnim(document.getElementById('eb-colors'), 'pop');
  uiAnim(document.getElementById('swatches'), 'pop');
  uiAnim(document.getElementById('link-pop'), 'pop');
  uiAnim(document.getElementById('pin-ed'), 'pop');

  // a button clicked with the mouse lets go of focus, so it doesn't keep its hover look (and the
  // bar its "in use" state) once you start using the keyboard; keyboard focus is untouched
  document.addEventListener('click', function(e){
    if(!e.detail) return;                                  // Enter / Space on a focused button
    var b = e.target.closest && e.target.closest('.bar button, .editbar button, .theme-pop button, .grid-back');
    if(b) b.blur();
  });

  setupText();
  applyStyles();
  setupMedia();
  applyCarOrders(); syncFilmstrips();                      // a carousel's own order, after the names above
  setupCarouselScrub();
  renderScreens();
  rebuildSlides();
  applyOrder(); orderReady = true;                           // after the ids above: moving slides doesn't renumber them
  var startAt = Math.max(0, slideFromHash());                // a slide's address opens that slide
  if(POPOUT || MIRROR){ try { var last = JSON.parse(localStorage.getItem(NS + 'sleek-sync') || 'null'); if(last && typeof last.i === 'number') startAt = last.i; } catch(e){} }
  suppress = true; show(startAt); suppress = false;
  idbOpen(function(){ reloadMedia(); idbGet('annotations', function(d){ if(d && d.screens){ annData = d; annData.pages = annData.pages || {}; renderScreens(); rebuildSlides(); renderNotes(); renderPresenter(); } markChanged(); }); });
  markChanged();
})();

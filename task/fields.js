/* What a task can hold beyond its name, and how each kind is edited: used by the grid (a cell) and by
   a task's details (a row).

   The kinds: a task's own built-in ones (its name, status, due date, person, tags and picture), and
   the kinds a project's own fields can be (core/task-store.js): text, number, checkbox, dropdown,
   date, link, person, and a picture or clip.

     A.cell(task, fid)     the HTML that shows and edits one value. fid is a field's id, or one of
                           '@title' '@status' '@due' '@who' '@tags' '@cover' for the built-in ones
     A.wireFields(root)    makes every cell under root work; each cell finds its task from the nearest
                           element with data-task (a row, a card) or data-sheet (a task's details)
     A.media               pictures and clips: add(file), thumb(m), fill(root), view(m, …)

   A picture or clip goes in the picture store every Sleek app shares (core/store.js); a task keeps a
   short reference to it. Large pictures are scaled down first. */
(function(){
  var T = window.SleekTasks, A = window.SleekTaskApp, S = window.SleekStore; if(!T || !A) return;
  var esc = A.esc;
  var KINDS = { text: 'Text', number: 'Number', check: 'Checkbox', select: 'Dropdown', date: 'Date', link: 'Link', person: 'Person', file: 'Picture or clip' };
  var HINTS = { text: 'A few words', number: 'Hours, a price, a count', check: 'Yes or no', select: 'One of your own choices', date: 'A day', link: 'A web address', person: 'Someone', file: 'Drop one in, or choose it' };
  var BUILT = { '@title': { id: '@title', name: 'Task', type: 'title' }, '@status': { id: '@status', name: 'Status', type: 'status' }, '@due': { id: '@due', name: 'Due', type: 'date' },
                '@who': { id: '@who', name: 'Person', type: 'person' }, '@tags': { id: '@tags', name: 'Tags', type: 'tags' }, '@cover': { id: '@cover', name: 'Picture', type: 'file' } };
  A.KINDS = KINDS; A.HINTS = HINTS;
  function fieldOf(t, fid){ return BUILT[fid] || T.field(t.project, fid); }
  function get(t, fid){
    switch(fid){ case '@title': return t.title; case '@status': return t.status; case '@due': return t.due || ''; case '@who': return t.who || ''; case '@tags': return t.tags || []; case '@cover': return t.cover || null; }
    return (t.vals || {})[fid];
  }
  function put(t, fid, v){
    switch(fid){
      case '@title': v = String(v || '').replace(/\s+/g, ' ').trim(); if(v) T.setTask(t.id, { title: v.slice(0, 300) }); else A.paint(); return;
      case '@status': T.setTask(t.id, { status: v, was: '' }); return;
      case '@due': T.setTask(t.id, { due: v || '' }); return;
      case '@who': T.setTask(t.id, { who: v || '' }); return;
      case '@tags': T.setTask(t.id, { tags: v }); return;
      case '@cover': T.setTask(t.id, { cover: v || null }); return;
    }
    T.setVal(t.id, fid, v);
  }
  A.fieldOf = fieldOf; A.val = get; A.setVal = put;
  // a link as typed, made safe to follow: only web and mail addresses
  function link(v){ v = String(v || '').trim(); if(!v) return ''; if(/^[\w.+-]+@[\w-]+\.[\w.-]+$/.test(v)) v = 'mailto:' + v; else if(!/^[a-z][a-z0-9+.-]*:/i.test(v)) v = 'https://' + v; return /^(https?:|mailto:)/i.test(v) ? v.slice(0, 2000) : ''; }
  function linkWords(v){ try { var u = new URL(v); return u.protocol === 'mailto:' ? u.pathname : u.hostname.replace(/^www\./, '') + (u.pathname.length > 1 ? u.pathname.replace(/\/$/, '') : ''); } catch(e){ return v; } }

  // ---------- pictures and clips ----------
  var urls = {}, asking = {}, MAX_CLIP = 40 * 1024 * 1024, EDGE = 1600;
  function load(ref){
    if(urls[ref]) return Promise.resolve(urls[ref]);
    if(!S) return Promise.resolve('');
    if(!asking[ref]) asking[ref] = S.hydrate({ u: ref }).then(function(o){ var u = o && o.u && o.u !== ref ? String(o.u).replace(/#video$/, '') : ''; if(u) urls[ref] = u; delete asking[ref]; return u; }, function(){ delete asking[ref]; return ''; });
    return asking[ref];
  }
  function shrink(file){      // a large picture, scaled to 1600 on its long edge; anything else as it is
    if(!/^image\/(jpeg|png|webp)$/.test(file.type) || !window.createImageBitmap) return Promise.resolve(file);
    return createImageBitmap(file).then(function(bmp){
      var k = EDGE / Math.max(bmp.width, bmp.height); if(k >= 1){ if(bmp.close) bmp.close(); return file; }
      var c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k); c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height); if(bmp.close) bmp.close();
      return new Promise(function(ok){ c.toBlob(function(b){ ok(b || file); }, file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.86); });
    }, function(){ return file; });
  }
  // keep a picture or clip someone chose or dropped: resolves { ref, video, name }, or null with a message shown
  function add(file){
    var video = /^video\//.test(file.type);
    if(!video && !/^image\//.test(file.type)){ A.toast('That isn’t a picture or a clip.'); return Promise.resolve(null); }
    if(video && file.size > MAX_CLIP){ A.toast('That clip is over 40 MB. Trim it, or link to it instead.'); return Promise.resolve(null); }
    if(!S){ A.toast('Pictures can’t be kept in this browser.'); return Promise.resolve(null); }
    return (video ? Promise.resolve(file) : shrink(file)).then(function(blob){ return S.addMedia(blob); }).then(function(u){
      if(!u) return null;
      return S.dehydrate({ u: u }).then(function(o){ var ref = o.u; urls[ref] = String(u).replace(/#video$/, ''); return { ref: ref, video: video, name: String(file.name || '').slice(0, 120) }; });
    }).catch(function(e){ console.error(e); A.toast('That couldn’t be added.'); return null; });
  }
  function thumb(m, cls){
    if(!m || !m.ref) return '';
    var u = urls[m.ref] || '', at = ' data-media="' + esc(m.ref) + '" class="' + (cls || 'thumb') + (m.video ? ' clip' : '') + '"';
    return m.video ? '<video' + at + (u ? ' src="' + u + '#t=0.1"' : '') + ' muted playsinline preload="metadata" tabindex="-1" aria-label="' + esc(m.name || 'Clip') + '"></video>' : '<img' + at + (u ? ' src="' + u + '"' : '') + ' alt="' + esc(m.name || '') + '" draggable="false">';
  }
  // give every picture under root its address, once the store has handed it over
  function fill(root){
    Array.prototype.forEach.call((root || document).querySelectorAll('[data-media]:not([src])'), function(el){
      var ref = el.getAttribute('data-media'); load(ref).then(function(u){ if(u && el.isConnected && !el.getAttribute('src')) el.setAttribute('src', u + (el.tagName === 'VIDEO' ? '#t=0.1' : '')); });
    });
  }
  // the picture or clip, large, over everything; with a way to change it or take it away
  var viewer = null;
  function closeView(){ if(viewer){ viewer.remove(); viewer = null; } }
  function view(m, acts){
    closeView(); acts = acts || {};
    var v = viewer = document.createElement('div'); v.className = 'viewer'; v.setAttribute('role', 'dialog'); v.setAttribute('aria-label', m.video ? 'Clip' : 'Picture');
    v.innerHTML = '<div class="viewer-bar"><span>' + esc(m.name || '') + '</span>' + (acts.replace ? '<button type="button" data-v="replace">Replace</button>' : '') + (acts.remove ? '<button type="button" data-v="remove">Remove</button>' : '') + '<button type="button" data-v="close" aria-label="Close">×</button></div><div class="viewer-in"></div>';
    document.body.appendChild(v);
    load(m.ref).then(function(u){ if(viewer !== v) return; v.querySelector('.viewer-in').innerHTML = !u ? '<p>This ' + (m.video ? 'clip' : 'picture') + ' isn’t in this browser.</p>' : m.video ? '<video src="' + u + '" controls autoplay playsinline></video>' : '<img src="' + u + '" alt="' + esc(m.name || '') + '">'; });
    v.addEventListener('click', function(e){
      var b = e.target.closest('[data-v]'), what = b && b.getAttribute('data-v');
      if(what === 'replace'){ closeView(); acts.replace(); } else if(what === 'remove'){ closeView(); acts.remove(); } else if(what === 'close' || e.target === v || e.target.classList.contains('viewer-in')) closeView();
    });
    v.querySelector('[data-v="close"]').focus();
  }
  document.addEventListener('keydown', function(e){ if(e.key === 'Escape' && viewer){ e.stopPropagation(); e.preventDefault(); closeView(); } }, true);
  A.media = { add: add, thumb: thumb, fill: fill, view: view, load: load, open: function(){ return !!viewer; } };
  A.afterPaint.push(function(){ fill(document.getElementById('body')); });
  // choosing a file: one hidden chooser, whose answer goes to whoever asked last
  var chooser = null, wants = null;
  function choose(then){
    if(!chooser){ chooser = document.createElement('input'); chooser.type = 'file'; chooser.accept = 'image/*,video/*'; chooser.hidden = true; chooser.id = 'tk-file'; document.body.appendChild(chooser);
      chooser.addEventListener('change', function(){ var f = chooser.files[0], w = wants; wants = null; if(f && w) add(f).then(function(m){ if(m) w(m); }); }); }
    wants = then; chooser.value = ''; chooser.click();
  }
  A.chooseFile = choose;

  // ---------- one value, shown so it can be changed ----------
  function people(v){ return '<option value="">Nobody</option>' + T.people().map(function(x){ return '<option' + (v === x.name ? ' selected' : '') + '>' + esc(x.name) + '</option>'; }).join('') + '<option value="+">Add a person…</option>'; }
  function cell(t, fid){
    var f = fieldOf(t, fid); if(!f) return '';
    var v = get(t, fid), k = ' data-k="' + t.id + ':' + fid + '"', at = ' data-fv="' + fid + '"' + k + ' aria-label="' + esc(f.name) + '"', p = T.project(t.project);
    switch(f.type){
      case 'title': return '<input class="cx ttl' + (T.isDone(t) ? ' done-t' : '') + '"' + at + ' value="' + esc(v) + '" maxlength="300">';
      case 'status':
        var st = p.statuses.filter(function(s){ return s.id === v; })[0];
        return '<select class="cx tint"' + at + ' style="--c:' + (st ? st.color : '#8E8E93') + '">' + p.statuses.map(function(s){ return '<option value="' + s.id + '"' + (s.id === v ? ' selected' : '') + '>' + esc(s.name) + '</option>'; }).join('') + '</select>';
      case 'text': return '<input class="cx"' + at + ' value="' + esc(v == null ? '' : v) + '" maxlength="300">';
      case 'number': return '<input class="cx num" type="number" step="any" inputmode="decimal"' + at + ' value="' + esc(v == null ? '' : v) + '">';
      case 'date': return '<input class="cx' + (v ? '' : ' nil') + '" type="date"' + at + ' value="' + esc(v || '') + '">';
      case 'check': return '<button type="button" class="ck sq' + (v ? ' on' : '') + '" data-fcheck="' + fid + '"' + k + ' role="checkbox" aria-checked="' + !!v + '" aria-label="' + esc(f.name) + '"></button>';
      case 'select':
        var opts = f.options || [], on = opts.filter(function(o){ return o.id === v; })[0];
        return '<select class="cx' + (on ? ' tint' : ' nil') + '"' + at + (on ? ' style="--c:' + on.color + '"' : '') + '><option value="">' + (on ? 'None' : '') + '</option>' + opts.map(function(o){ return '<option value="' + o.id + '"' + (o.id === v ? ' selected' : '') + '>' + esc(o.name) + '</option>'; }).join('') + '<option value="+">New choice…</option></select>';
      case 'person': return '<select class="cx' + (v ? '' : ' nil') + '"' + at + '>' + people(v || '') + '</select>';
      case 'link':
        return v ? '<span class="lk"><a href="' + esc(link(v)) + '" target="_blank" rel="noopener noreferrer">' + esc(linkWords(v)) + '</a><button type="button" class="ed" data-fedit="' + fid + '" aria-label="Change the link">✎</button></span>'
                 : '<input class="cx" type="url"' + at + ' placeholder="Paste a link" maxlength="2000">';
      case 'tags':
        return '<span class="tagcell">' + (v || []).map(function(g, i){ return '<span class="pill" style="--c:' + A.tagColor(g) + '">' + esc(g) + '<button type="button" data-funtag="' + i + '" aria-label="Remove the tag ' + esc(g) + '">×</button></span>'; }).join('') +
          '<input class="tagin" data-ftag' + k + ' placeholder="' + ((v || []).length ? '＋' : '＋ Tag') + '" list="tk-taglist" maxlength="30" aria-label="Add a tag"></span>';
      case 'file':
        return '<span class="fcell" data-fdrop="' + fid + '">' + (v && v.ref ? '<button type="button" class="fthumb" data-fview="' + fid + '"' + k + ' aria-label="Open the ' + (v.video ? 'clip' : 'picture') + '">' + thumb(v) + '</button>'
                                                                         : '<button type="button" class="fadd" data-fadd="' + fid + '"' + k + '>＋ Add</button>') + '</span>';
    }
    return '';
  }
  A.cell = cell;
  // every tag in use, for the tag boxes to suggest
  A.tagList = function(){ var known = {}; T.tasks().forEach(function(x){ (x.tags || []).forEach(function(g){ known[g] = 1; }); }); return '<datalist id="tk-taglist">' + Object.keys(known).sort().map(function(g){ return '<option value="' + esc(g) + '">'; }).join('') + '</datalist>'; };

  // ---------- making the cells work ----------
  // a menu's "new…" row was chosen: type the new name where the menu was. done(name) once, or nothing on Escape
  function typeNew(sel, placeholder, done){
    var inp = document.createElement('input'); inp.type = 'text'; inp.className = 'cx'; inp.placeholder = placeholder; inp.maxLength = 40; inp.setAttribute('aria-label', placeholder); sel.replaceWith(inp); inp.focus();
    var over = false, end = function(keep){ if(over) return; over = true; var name = keep ? inp.value.replace(/\s+/g, ' ').trim() : ''; inp.blur(); done(name); };
    inp.addEventListener('keydown', function(e){ if(e.key === 'Enter'){ e.preventDefault(); e.stopPropagation(); end(true); } if(e.key === 'Escape'){ e.stopPropagation(); end(false); } });
    inp.addEventListener('blur', function(){ end(true); });
  }
  function wireFields(root, repaint){
    function taskAt(el){ var h = el.closest('[data-task], [data-sheet]'); return h ? T.task(h.getAttribute('data-task') || h.getAttribute('data-sheet')) : null; }
    function again(){ if(repaint) repaint(); else A.paint(); }
    function addTag(inp){
      var t = taskAt(inp), g = inp.value.replace(/,/g, '').trim(); if(!t) return; inp.value = '';
      if(g && (t.tags || []).indexOf(g) < 0) put(t, '@tags', (t.tags || []).concat([g.slice(0, 30)]).slice(0, 12));
    }
    root.addEventListener('change', function(e){
      var el = e.target, fid = el.getAttribute('data-fv'); if(!fid) return;
      var t = taskAt(el), f = t && fieldOf(t, fid); if(!f) return;
      var v = el.value;
      if(el.tagName === 'SELECT' && v === '+'){
        if(f.type === 'person') typeNew(el, 'Their name', function(name){ var p = name ? T.addPerson(name) : null; if(p) put(t, fid, p.name); else again(); });
        else typeNew(el, 'A new choice', function(name){ var o = name ? T.addOption(t.project, fid, name) : null; if(o) put(t, fid, o.id); else again(); });
        return;
      }
      if(f.type === 'number'){ v = v === '' ? '' : +v; if(v !== '' && !isFinite(v)) v = ''; }
      else if(f.type === 'link'){ var raw = v; v = link(v); if(raw.trim() && !v){ A.toast('That doesn’t look like a web address.'); again(); return; } }
      else if(f.type === 'text') v = v.trim().slice(0, 300);
      put(t, fid, v);
    });
    root.addEventListener('click', function(e){
      var el = e.target, x, t;
      if((x = el.closest('[data-fcheck]'))){ t = taskAt(x); if(t){ var fid = x.getAttribute('data-fcheck'); put(t, fid, !get(t, fid)); } return; }
      if((x = el.closest('[data-fedit]'))){ t = taskAt(x); if(!t) return; var id = x.getAttribute('data-fedit'), box = document.createElement('span'); box.innerHTML = '<input class="cx" type="url" data-fv="' + id + '" data-k="' + t.id + ':' + id + '" value="' + esc(get(t, id) || '') + '" maxlength="2000" aria-label="Link">';
        var inp = box.firstChild; x.closest('.lk').replaceWith(inp); inp.focus(); inp.select(); inp.addEventListener('blur', function(){ setTimeout(function(){ if(inp.isConnected && inp.value === (get(T.task(t.id) || t, id) || '')) again(); }, 0); }); return; }
      if((x = el.closest('[data-funtag]'))){ t = taskAt(x); if(t){ var tags = (t.tags || []).slice(); tags.splice(+x.getAttribute('data-funtag'), 1); put(t, '@tags', tags); } return; }
      if((x = el.closest('[data-fadd]'))){ t = taskAt(x); if(t){ var fa = x.getAttribute('data-fadd'), tid = t.id; choose(function(m){ var now = T.task(tid); if(now) put(now, fa, m); }); } return; }
      if((x = el.closest('[data-fview]'))){ t = taskAt(x); if(!t) return; var fv = x.getAttribute('data-fview'), id2 = t.id, m = get(t, fv); if(!m) return;
        view(m, { replace: function(){ choose(function(n){ var now = T.task(id2); if(now) put(now, fv, n); }); }, remove: function(){ var now = T.task(id2); if(now) put(now, fv, null); } }); return; }
      if(el.classList && el.classList.contains('tagcell')){ var ti = el.querySelector('.tagin'); if(ti) ti.focus(); }
    });
    root.addEventListener('keydown', function(e){
      var el = e.target;
      if(el.hasAttribute && el.hasAttribute('data-ftag')){
        if(e.key === 'Enter' || e.key === ','){ e.preventDefault(); e.stopPropagation(); addTag(el); }
        else if(e.key === 'Backspace' && !el.value){ var t = taskAt(el); if(t && (t.tags || []).length) put(t, '@tags', t.tags.slice(0, -1)); }
        return;
      }
      if(e.key === 'Enter' && el.classList && el.classList.contains('cx') && el.tagName === 'INPUT'){ e.preventDefault(); e.stopPropagation(); el.blur(); }
    });
    root.addEventListener('focusout', function(e){ var el = e.target; if(el.hasAttribute && el.hasAttribute('data-ftag') && el.value.trim()) addTag(el); });
    // a picture or clip dropped on its cell
    root.addEventListener('dragover', function(e){ var c = e.target.closest && e.target.closest('[data-fdrop]'); if(!c || !e.dataTransfer || Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') < 0) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; c.classList.add('over'); });
    root.addEventListener('dragleave', function(e){ var c = e.target.closest && e.target.closest('[data-fdrop]'); if(c && !c.contains(e.relatedTarget)) c.classList.remove('over'); });
    root.addEventListener('drop', function(e){
      var c = e.target.closest && e.target.closest('[data-fdrop]'); if(!c || !e.dataTransfer || !e.dataTransfer.files.length) return;
      e.preventDefault(); c.classList.remove('over'); var t = taskAt(c), fid = c.getAttribute('data-fdrop'); if(!t) return; var tid = t.id;
      add(e.dataTransfer.files[0]).then(function(m){ var now = T.task(tid); if(m && now) put(now, fid, m); });
    });
  }
  A.wireFields = wireFields;
  // how a task repeats, in words
  var REP = { daily: 'Every day', weekdays: 'Every weekday', weekly: 'Every week', monthly: 'Every month', yearly: 'Every year' };
  A.REP = REP;
  A.repH = function(t){ return t.rep && REP[t.rep] ? '<span class="rep" title="Repeats: ' + REP[t.rep].toLowerCase() + '">↻</span>' : ''; };
})();

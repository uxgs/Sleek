/* Sleek's bar: what it shows and what pressing it does.

   The app (Sources/Sleek/BrowserWindow.swift) owns what is open and tells this page with
   Sleek.on({ type: 'state', tabs, panes, at, n, settings, bookmarks, private, downloads }):
     tabs        every tab: { id, url, kind (web, start, slides, docs, tasks), title, loading, progress, back, fwd, icon, zoom }
     panes, at   the tabs showing (one, or up to four in a split view) and which one you are in
     settings    look (light, dark, auto), theme, barAt (top, bottom), imm (immersive), bar (bookmarks bar shown)
   This page draws it, and asks the app to do things with post({ do: … }): go, open, newTab, close,
   select, back, fwd, reload, stop, split, pane, unpane, set, mark, suggest, history, find, zoom, print…

   After every draw it also tells the app where things are (do: 'layout'): the spaces the pages go
   in (slots), the parts of itself that are solid (so a press there is its own, and a press anywhere
   else falls through to the page), and the bare parts that drag the window.

   What only this page knows: which menu is open, what you are typing, and, in immersive, whether
   the bar is showing. */
(function(){
  var win = document.getElementById('win');
  function post(m){ try { window.webkit.messageHandlers.sleek.postMessage(m); } catch(e){} }
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"]/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function $(s, r){ return (r || document).querySelector(s); }
  function $$(s, r){ return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  var ICON = { back: '<path d="M14 5l-7 7 7 7"/>', fwd: '<path d="M10 5l7 7-7 7"/>', reload: '<path d="M19 12a7 7 0 1 1-2.1-5M19 5v4h-4"/>', stop: '<path d="M6 6l12 12M18 6L6 18"/>', lock: '<rect x="6" y="11" width="12" height="9" rx="2"/><path d="M9 11V8a3 3 0 0 1 6 0v3"/>',
    split: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M12 4v16"/>', more: '<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>', search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.500-3.500"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', star: '<path d="M12 4l2.500 5 5.500.800-4 3.900.900 5.500-4.900-2.600-4.900 2.600.900-5.500-4-3.900 5.500-.800z"/>', tab: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18"/>', up: '<path d="M6 14l6-6 6 6"/>', down: '<path d="M6 10l6 6 6-6"/>' };
  function ico(n){ return '<svg class="i" viewBox="0 0 24 24" aria-hidden="true">' + ICON[n] + '</svg>'; }
  var THEMES = [['graphite', 'Graphite', '#6E6E73', '#7C5CFF'], ['violet', 'Violet', '#7C5CFF', '#7C5CFF'], ['ocean', 'Ocean', '#0A84FF', '#0A84FF'], ['forest', 'Forest', '#12A36A', '#12A36A'], ['rose', 'Rose', '#E0457B', '#E0457B'], ['sand', 'Sand', '#C08A2D', '#B0791F']];
  var APPS = { slides: ['Sleek Slides', 'slides.html'], docs: ['Sleek Docs', 'docs.html'], tasks: ['Sleek Tasks', 'tasks.html'] };
  var S = { tabs: [], panes: [], at: 0, n: 1, settings: { look: 'auto', theme: 'graphite', barAt: 'top', imm: false, bar: true }, bookmarks: [], private: false, downloads: [] };
  var L = { pop: null, typed: null, sel: -1, native: { q: '', items: [] }, rows: [], toast: null, toastN: 0, find: false, findText: '', miss: false, history: null, over: false, reach: false, full: false, still: false };

  function cur(){ var id = S.panes[S.at]; return S.tabs.filter(function(t){ return t.id === id; })[0] || S.tabs[0] || null; }
  function marked(u){ return S.bookmarks.filter(function(b){ return b.url === u; })[0] || null; }
  function hostOf(u){ try { return new URL(u).hostname.replace(/^www\./, ''); } catch(e){ return ''; } }
  function pretty(u){ return String(u || '').replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, ''); }
  function shown(t){ return !t || t.kind === 'start' ? '' : APPS[t.kind] ? APPS[t.kind][0] : t.kind === 'sleek' ? 'Sleek' : pretty(t.url); }
  function letter(s){ return esc((String(s || '?').replace(/^the /i, '').charAt(0) || '?').toUpperCase()); }
  function icon(t){
    if(APPS[t.kind]) return '<span class="ic mk"><img src="sleek://app/icons/' + t.kind + '.svg" alt=""></span>';
    if(t.kind === 'start' || t.kind === 'sleek') return '<span class="ic mk"><img src="sleek://app/icons/logo.svg" alt=""></span>';
    return '<span class="ic">' + letter(hostOf(t.url) || t.title) + (t.icon ? '<img src="' + esc(t.icon) + '" alt="" onerror="this.remove()">' : '') + '</span>';
  }
  function bmIcon(b){ var h = hostOf(b.url); return '<span class="ic">' + letter(h || b.title) + (/^https?:/.test(b.url) ? '<img src="' + esc(new URL(b.url).origin) + '/favicon.ico" alt="" onerror="this.remove()">' : '') + '</span>'; }
  function toast(text, act, fn){ L.toast = { text: text, act: act, fn: fn }; var n = ++L.toastN; paint(); setTimeout(function(){ if(L.toastN === n){ L.toast = null; paint(); } }, 3200); }

  // ---------- suggestions under the address box ----------
  function rows(){
    var q = (L.typed || '').trim(), out = [], lo = q.toLowerCase(); if(!q) return out;
    S.tabs.forEach(function(t){ if(t !== cur() && t.kind !== 'start' && (t.title + ' ' + t.url).toLowerCase().indexOf(lo) >= 0 && out.length < 3) out.push({ kind: 'tab', id: t.id, title: t.title, hint: 'Switch to tab' }); });
    if(L.native.q === q) L.native.items.forEach(function(x){ out.push({ kind: x.kind, url: x.url, title: x.title || pretty(x.url), hint: pretty(x.url) }); });
    out.push({ kind: 'search', text: q, title: 'Search the web for “' + q + '”', hint: '' });
    return out;
  }

  // ---------- drawing ----------
  function paint(){
    var t = cur(), set = S.settings, bottom = set.barAt === 'bottom', imm = !!set.imm;
    var mode = S.private ? 'dark' : set.look === 'auto' ? (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : set.look;
    var th = THEMES.filter(function(x){ return x[0] === set.theme; })[0] || THEMES[0], tinted = th[0] !== 'graphite' && !S.private;
    win.setAttribute('data-mode', mode); win.classList.toggle('bottom', bottom); win.classList.toggle('imm', imm); win.classList.toggle('private', !!S.private); win.classList.toggle('full', L.full); win.classList.toggle('still', L.still);
    if(!imm) win.classList.remove('show');
    win.style.setProperty('--tint', th[2]); win.style.setProperty('--tp', tinted ? '20%' : '0%'); win.style.setProperty('--tp2', tinted ? '10%' : '0%'); win.style.setProperty('--tp3', tinted ? '14%' : '0%'); win.style.setProperty('--k-accent', th[3]);
    var act = document.activeElement, keep = act && act.id && /^(url|find|bmname)$/.test(act.id) ? act.id : null, a0 = keep ? act.selectionStart : 0, a1 = keep ? act.selectionEnd : 0;

    var h = (bottom && !imm ? '<div class="titlestrip"></div>' : '') + '<button type="button" class="peek" data-do="peek" aria-label="Show the bar"></button><div class="chrome" id="bar"><div class="tabs" id="tabs"><span class="pins">' +
      ['slides', 'docs', 'tasks'].map(function(k){ return '<button type="button" class="pin' + (t && t.kind === k ? ' on' : '') + '" data-pin="' + k + '" title="' + APPS[k][0] + '" aria-label="' + APPS[k][0] + '"><img src="sleek://app/icons/' + k + '.svg" alt=""></button>'; }).join('') + '</span>' +
      S.tabs.filter(function(x){ return !APPS[x.kind]; }).map(function(x){
        return '<button type="button" class="tab' + (t && x.id === t.id ? ' on' : '') + (S.n > 1 && S.panes.indexOf(x.id) >= 0 ? ' in' : '') + '" data-tab="' + x.id + '" title="' + esc(x.title) + '">' + (x.loading ? '<span class="spin"></span>' : icon(x)) + '<span class="tt">' + esc(x.title) + '</span><span class="x" data-close="' + x.id + '" role="button" aria-label="Close this tab">×</span></button>'; }).join('') +
      '<button type="button" class="plus" data-do="newtab" title="New tab" aria-label="New tab">+</button></div>';
    var web = t && t.kind === 'web', value = L.typed != null ? L.typed : shown(t), bm = t ? marked(t.url) : null;
    h += '<div class="tool"><button type="button" class="ib" data-do="back"' + (t && t.back ? '' : ' disabled') + ' aria-label="Back">' + ico('back') + '</button><button type="button" class="ib" data-do="fwd"' + (t && t.fwd ? '' : ' disabled') + ' aria-label="Forward">' + ico('fwd') + '</button>' +
      '<button type="button" class="ib" data-do="' + (t && t.loading ? 'stop' : 'reload') + '" aria-label="' + (t && t.loading ? 'Stop' : 'Reload') + '">' + ico(t && t.loading ? 'stop' : 'reload') + '</button>' +
      '<div class="addr" id="addr">' + (t && APPS[t.kind] ? '<span class="sec"><img src="sleek://app/icons/' + t.kind + '.svg" alt=""></span>' : web && /^http:/.test(t.url) ? '<span class="sec warn">Not secure</span>' : web ? '<span class="sec" title="The connection to this site is private">' + ico('lock') + '</span>' : '<span class="sec">' + ico('search') + '</span>') +
      '<input id="url" value="' + esc(value) + '" placeholder="Search the web, or type an address" aria-label="Address and search" autocomplete="off" autocapitalize="off" spellcheck="false">' +
      (web ? '<button type="button" class="star' + (bm ? ' on' : '') + '" data-do="star" aria-expanded="' + (L.pop === 'star') + '" title="' + (bm ? 'Bookmarked' : 'Bookmark this page') + '" aria-label="Bookmark this page">' + (bm ? '★' : '☆') + '</button>' : '') + '</div>' +
      '<button type="button" class="ib' + (S.n > 1 ? ' on' : '') + '" data-do="split" id="b-split" aria-expanded="' + (L.pop === 'split') + '" title="Show pages side by side">' + ico('split') + 'Split</button>' +
      '<button type="button" class="ib" data-do="menu" id="b-menu" aria-expanded="' + (L.pop === 'menu') + '" aria-label="More">' + ico('more') + '</button>' +
      '<i class="prog' + (t && t.loading ? ' on' : '') + '" id="prog" style="width:' + (t && t.loading ? Math.max(8, Math.round(t.progress * 100)) : 100) + '%"></i></div>';
    if(set.bar && !imm) h += '<div class="bbar" role="toolbar" aria-label="Bookmarks">' + (S.bookmarks.length ? S.bookmarks.map(function(b, i){ return '<button type="button" class="bm" data-bm="' + i + '" title="' + esc(b.url) + '">' + bmIcon(b) + '<span>' + esc(b.title) + '</span></button>'; }).join('') : '<span class="none">Press the star in the address box to keep a page here.</span>') +
      '<span class="sp"></span><button type="button" class="bm faint" data-do="allmarks" id="b-all">All bookmarks</button></div>';
    h += '</div><div class="mid"><div class="split n' + S.n + '">' + S.panes.map(function(pid, i){
      var pt = S.tabs.filter(function(x){ return x.id === pid; })[0] || {};
      return '<section class="pane' + (i === S.at ? ' on' : '') + '" data-pane="' + i + '">' + (S.n > 1 ? '<div class="pane-h">' + (pt.id ? icon(pt) : '') + '<span>' + esc(pt.title || '') + '</span><button type="button" data-unpane="' + i + '" aria-label="Take this page out of the split">×</button></div>' : '') + '<div class="slot"></div></section>'; }).join('') + '</div></div>';

    // what floats
    if(L.pop === 'menu') h += '<div class="pop menu" id="pop" data-anchor="#b-menu" data-side="right">' + [['newtab', 'New tab', '⌘T'], ['window', 'New window', '⌘N'], ['private', 'New private window', '⇧⌘N'], ['-'], ['history', 'History', '⌘Y'], ['allmarks', 'Bookmarks', '⌥⌘B'], ['bar', set.bar ? 'Hide the bookmarks bar' : 'Show the bookmarks bar', '⇧⌘B'], ['downloads', 'Downloads', '⌥⌘L'], ['-'],
        ['find', 'Find on this page', '⌘F'], ['zoom'], ['print', 'Print…', '⌘P'], ['-'], ['look', 'Look: themes, dark, where the bar sits', '⌘,'], ['default', 'Make Sleek the default browser', '']].map(function(m){
          return m[0] === '-' ? '<div class="line" style="margin:4px"></div>' : m[0] === 'zoom' ? '<div class="zoomrow"><span>Zoom</span><span><button type="button" data-zoom="-1" aria-label="Smaller">−</button><b>' + (t ? t.zoom : 100) + '%</b><button type="button" data-zoom="1" aria-label="Larger">+</button><button type="button" data-zoom="0" style="width:auto;padding:0 8px">Reset</button></span></div>'
            : '<button type="button" class="mi" data-menu="' + m[0] + '"><span>' + m[1] + '</span><small>' + m[2] + '</small></button>'; }).join('') + '</div>';
    if(L.pop === 'look') h += '<div class="pop" id="pop" data-anchor="#b-menu" data-side="right" style="width:330px"><h4>Look</h4><div class="looks">' + [['light', 'Light', '#FFFFFF'], ['dark', 'Dark', '#0E0E11'], ['auto', 'Match the Mac', 'linear-gradient(90deg,#FFFFFF 50%,#0E0E11 50%)']].map(function(l){ return '<button type="button" class="lookb' + (set.look === l[0] ? ' on' : '') + '" data-look="' + l[0] + '"><i style="--p:' + l[2] + '"></i>' + l[1] + '</button>'; }).join('') + '</div>' +
      '<h4 style="margin-top:4px">Theme</h4><div class="swatches">' + THEMES.map(function(x){ return '<button type="button" class="swb' + (set.theme === x[0] ? ' on' : '') + '" data-theme="' + x[0] + '"><i style="--c:' + x[2] + '"></i>' + x[1] + '</button>'; }).join('') + '</div>' +
      '<h4 style="margin-top:4px">The bar</h4><span class="seg">' + [['top', 'At the top'], ['bottom', 'At the bottom']].map(function(o){ return '<button type="button" data-barat="' + o[0] + '" class="' + (set.barAt === o[0] ? 'on' : '') + '">' + o[1] + '</button>'; }).join('') + '</span>' +
      '<div class="sw"><span>Immersive<small>The bar fades away and floats back when you need it</small></span><button type="button" role="switch" aria-checked="' + imm + '" data-do="imm" aria-label="Immersive"></button></div></div>';
    if(L.pop === 'split') h += '<div class="pop" id="pop" data-anchor="#b-split" data-side="right" style="width:330px"><h4>Split view</h4><div class="lays">' + [[1, 'One page', 'l1'], [2, 'Side by side', 'l2'], [3, 'Three across', 'l3'], [4, 'Four corners', 'l4']].map(function(l){ var c = ''; for(var k = 0; k < l[0]; k++) c += '<b></b>'; return '<button type="button" class="lay' + (S.n === l[0] ? ' on' : '') + '" data-lay="' + l[0] + '"><i class="' + l[2] + '">' + c + '</i>' + l[1] + '</button>'; }).join('') + '</div><p>The bar works on the page with the ring. Press a page to move the ring, or a tab to put it there.</p></div>';
    if(L.pop === 'star' && t) h += '<div class="pop" id="pop" data-anchor=".star" data-side="right" style="width:300px"><h4>' + (L.justMarked ? 'Bookmark added' : 'Bookmark') + '</h4><input type="text" id="bmname" value="' + esc(bm ? bm.title : t.title) + '" aria-label="Name" maxlength="80"><div class="frow" style="justify-content:flex-end"><button type="button" class="go ghost" data-do="unstar">Remove</button><button type="button" class="go" data-do="closepop">Done</button></div></div>';
    if(L.pop === 'allmarks') h += '<div class="pop menu" id="pop" data-anchor="' + (set.bar && !imm ? '#b-all' : '#b-menu') + '" data-side="right" style="width:300px"><h4 style="padding:6px 9px 2px">All bookmarks</h4>' + (S.bookmarks.map(function(b, i){ return '<button type="button" class="mi" data-bm="' + i + '"><span class="two"><b>' + esc(b.title) + '</b><i>' + esc(pretty(b.url)) + '</i></span></button>'; }).join('') || '<p style="padding:6px 9px">None yet. Press the star in the address box to keep a page.</p>') + '</div>';
    if(L.pop === 'history') h += '<div class="pop menu" id="pop" data-anchor="#b-menu" data-side="right" style="width:340px"><h4 style="padding:6px 9px 2px">History</h4>' + (S.private ? '<p style="padding:6px 9px">A private window keeps no history.</p>' : !L.history ? '<p style="padding:6px 9px">…</p>' : (L.history.map(function(x){ return '<button type="button" class="mi" data-hist="' + esc(x.u) + '"><span class="two"><b>' + esc(x.t || pretty(x.u)) + '</b><i>' + esc(pretty(x.u)) + '</i></span><small>' + when(x.at) + '</small></button>'; }).join('') || '<p style="padding:6px 9px">Nothing yet.</p>') +
      (L.history.length ? '<div class="line" style="margin:4px"></div><button type="button" class="mi" data-menu="clearhistory"><span style="color:var(--k-warn)">Clear history</span><small></small></button>' : '')) + '</div>';
    if(L.pop === 'downloads') h += '<div class="pop" id="pop" data-anchor="#b-menu" data-side="right" style="width:340px"><h4>Downloads</h4>' + (S.downloads.map(function(d){ return '<div class="dl"><span class="two"><b>' + esc(d.name) + '</b>' + (d.done ? '<i>In your Downloads folder</i>' : d.failed ? '<i style="color:var(--k-warn)">Didn’t finish</i>' : '<span class="bar"><u style="width:' + Math.round(d.part * 100) + '%"></u></span>') + '</span>' + (d.done ? '<button type="button" class="go ghost" data-dl="' + d.id + '">Show</button>' : '') + '</div>'; }).join('') || '<p>Nothing downloaded since Sleek opened.</p>') + '</div>';
    if(L.typed != null){ L.rows = rows(); if(L.sel >= L.rows.length) L.sel = L.rows.length - 1;
      if(L.rows.length) h += '<div class="sugg" id="sugg">' + L.rows.map(function(r, i){ return '<button type="button" class="sg' + (i === L.sel ? ' sel' : '') + '" data-sg="' + i + '">' + ico(r.kind === 'tab' ? 'tab' : r.kind === 'bookmark' ? 'star' : r.kind === 'history' ? 'clock' : 'search') + '<span>' + esc(r.title) + '</span><small>' + esc(r.hint) + '</small></button>'; }).join('') + '</div>'; }
    if(L.find) h += '<div class="findbox' + (L.miss ? ' miss' : '') + '" id="findbox"><input id="find" value="' + esc(L.findText) + '" placeholder="Find on this page" aria-label="Find on this page" autocomplete="off" spellcheck="false">' + (L.miss ? '<small>Not found</small>' : '') + '<button type="button" class="ib" data-do="findprev" aria-label="The one before">' + ico('up') + '</button><button type="button" class="ib" data-do="findnext" aria-label="The next one">' + ico('down') + '</button><button type="button" class="ib" data-do="findclose" aria-label="Close">×</button></div>';
    if(L.toast) h += '<div class="toast" role="status"><span>' + esc(L.toast.text) + '</span>' + (L.toast.act ? '<button type="button" data-do="toastact">' + esc(L.toast.act) + '</button>' : '') + '</div>';
    win.innerHTML = h;
    if(imm && (L.pop || L.typed != null || L.find)) win.classList.add('show');
    place();
    if(keep){ var again = document.getElementById(keep); if(again){ again.focus(); try { again.setSelectionRange(a0, a1); } catch(e){} } }
    report();
  }
  function when(at){ var d = new Date(at * 1000), now = new Date(); return d.toDateString() === now.toDateString() ? d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }); }
  // put what floats beside what it came from: under it with the bar at the top, over it with the bar at the bottom
  function place(){
    var W = win.clientWidth, H = win.clientHeight, bottom = S.settings.barAt === 'bottom', bar = $('#bar').getBoundingClientRect();
    function under(el, a, side){
      var r = a.getBoundingClientRect(), w = el.offsetWidth, left = side === 'right' ? r.right - w : r.left; el.style.left = Math.max(8, Math.min(left, W - w - 8)) + 'px';
      if(bottom) el.style.bottom = (H - r.top + 8) + 'px'; else el.style.top = (r.bottom + 8) + 'px';
    }
    var p = $('#pop'); if(p){ var a = $(p.getAttribute('data-anchor')) || $('#b-menu'); under(p, a, p.getAttribute('data-side')); }
    var s = $('#sugg'); if(s){ var ad = $('#addr').getBoundingClientRect(); s.style.left = ad.left + 'px'; s.style.width = ad.width + 'px'; if(bottom) s.style.bottom = (H - ad.top + 6) + 'px'; else s.style.top = (ad.bottom + 6) + 'px'; }
    var f = $('#findbox'); if(f){ if(bottom) f.style.bottom = (H - bar.top + 10) + 'px'; else f.style.top = (S.settings.imm ? 10 : bar.bottom + 10) + 'px'; }
    var t = $('.toast'); if(t){ if(bottom && !S.settings.imm) t.style.top = '40px'; else t.style.bottom = '22px'; }
  }
  // tell the app where the pages go, what of this page is solid, and what drags the window
  var lastReport = '';
  function box(el){ var r = el.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; }
  function report(){
    var imm = !!S.settings.imm, up = !imm || win.classList.contains('show'), solid = [], drag = [];
    if(imm){ solid.push(box(up ? $('#bar') : $('.peek'))); }
    else { $$('.tool, .bbar, .tab, .pins, .plus').forEach(function(e){ solid.push(box(e)); }); drag.push(box($('#tabs'))); var ts = $('.titlestrip'); if(ts) drag.push(box(ts)); }
    $$('.pane-h, .pop, .sugg, .findbox, .toast').forEach(function(e){ solid.push(box(e)); });
    var m = { do: 'layout', slots: $$('.slot').map(box), solid: solid, drag: drag, modal: false, lights: up && !L.full }, s = JSON.stringify(m);
    if(s !== lastReport){ lastReport = s; post(m); }
  }
  window.addEventListener('resize', function(){ place(); report(); });
  if(window.matchMedia) matchMedia('(prefers-color-scheme: dark)').addEventListener('change', paint);

  // ---------- immersive: the bar comes and goes ----------
  var immT = 0;
  function busy(){ var a = document.activeElement; return !!(L.pop || L.typed != null || L.find || L.over || L.reach || (a && a.id === 'url')); }
  function hideBar(){ clearTimeout(immT); if(!S.settings.imm) return; if(busy()){ immT = setTimeout(hideBar, 900); return; } win.classList.remove('show'); report(); }
  function showBar(){ if(!S.settings.imm) return; win.classList.add('show'); report(); clearTimeout(immT); immT = setTimeout(hideBar, 2600); }
  win.addEventListener('mousemove', function(e){ var on = !!(e.target.closest && e.target.closest('#bar')); if(on !== L.over){ L.over = on; if(on) showBar(); else { clearTimeout(immT); immT = setTimeout(hideBar, 1400); } } });
  win.addEventListener('mouseleave', function(){ if(L.over){ L.over = false; clearTimeout(immT); immT = setTimeout(hideBar, 1400); } });

  // ---------- pressing things ----------
  function closePop(){ if(L.pop){ L.pop = null; paint(); } }
  function openPop(what){ L.pop = L.pop === what ? null : what; L.typed = null; if(what === 'history' && L.pop){ L.history = null; post({ do: 'history' }); } paint(); if(what === 'star'){ var n = $('#bmname'); if(n){ n.focus(); n.select(); } } }
  function choose(i){
    var r = L.rows[i]; L.typed = null; L.sel = -1; if(!r){ paint(); return; }
    if(r.kind === 'tab') post({ do: 'select', id: r.id }); else if(r.kind === 'search') post({ do: 'go', text: r.text }); else post({ do: 'open', url: r.url });
    $('#url').blur(); paint();
  }
  function find(back){ if(L.findText) post({ do: 'find', text: L.findText, back: !!back }); }
  win.addEventListener('mousedown', function(e){ if(e.target.closest('.sugg, .pop .mi, .ib, .star, .pin, .tab, .plus, .bm')) e.preventDefault(); });      // pressing these doesn't take the cursor out of the box you are typing in
  win.addEventListener('click', function(e){
    var t = e.target, x, c = cur();
    if((x = t.closest('[data-close]'))){ e.stopPropagation(); post({ do: 'close', id: x.getAttribute('data-close') }); return; }
    if((x = t.closest('[data-tab]'))){ L.pop = null; post({ do: 'select', id: x.getAttribute('data-tab') }); return; }
    if((x = t.closest('[data-pin]'))){ var k = x.getAttribute('data-pin'), have = S.tabs.filter(function(y){ return y.kind === k; })[0]; L.pop = null; if(have) post({ do: 'select', id: have.id }); else post({ do: 'open', url: 'sleek://app/' + APPS[k][1], new: true }); return; }
    if((x = t.closest('[data-unpane]'))){ post({ do: 'unpane', i: +x.getAttribute('data-unpane') }); return; }
    if((x = t.closest('[data-sg]'))){ choose(+x.getAttribute('data-sg')); return; }
    if((x = t.closest('[data-bm]'))){ var b = S.bookmarks[+x.getAttribute('data-bm')]; L.pop = null; if(b) post({ do: 'open', url: b.url, new: e.metaKey }); paint(); return; }
    if((x = t.closest('[data-hist]'))){ L.pop = null; post({ do: 'open', url: x.getAttribute('data-hist'), new: e.metaKey }); paint(); return; }
    if((x = t.closest('[data-dl]'))){ post({ do: 'reveal', id: x.getAttribute('data-dl') }); return; }
    if((x = t.closest('[data-zoom]'))){ post({ do: 'zoom', by: +x.getAttribute('data-zoom') }); return; }
    if((x = t.closest('[data-look]'))){ post({ do: 'set', k: 'look', v: x.getAttribute('data-look') }); return; }
    if((x = t.closest('[data-theme]'))){ post({ do: 'set', k: 'theme', v: x.getAttribute('data-theme') }); return; }
    if((x = t.closest('[data-barat]'))){ post({ do: 'set', k: 'barAt', v: x.getAttribute('data-barat') }); return; }
    if((x = t.closest('[data-lay]'))){ L.pop = null; post({ do: 'split', n: +x.getAttribute('data-lay') }); paint(); return; }
    if((x = t.closest('[data-menu]'))){
      var m = x.getAttribute('data-menu'); L.pop = null;
      if(m === 'newtab') post({ do: 'newTab' }); else if(m === 'window' || m === 'private' || m === 'print' || m === 'default') post({ do: m });
      else if(m === 'bar') post({ do: 'set', k: 'bar', v: !S.settings.bar }); else if(m === 'find'){ L.find = true; paint(); $('#find').focus(); return; }
      else if(m === 'clearhistory') post({ do: 'clearHistory' }); else { openPop(m); return; }
      paint(); return;
    }
    if((x = t.closest('[data-do]'))){
      var what = x.getAttribute('data-do');
      if(what === 'newtab') post({ do: 'newTab' });
      else if(what === 'back' || what === 'fwd' || what === 'reload' || what === 'stop') post({ do: what });
      else if(what === 'menu' || what === 'split' || what === 'allmarks') openPop(what);
      else if(what === 'star'){ var was = c && marked(c.url); L.justMarked = !was; if(c && !was) post({ do: 'mark', how: 'add', url: c.url, title: c.title }); if(L.pop === 'star' && was) closePop(); else { L.pop = 'star'; L.typed = null; paint(); var nm = $('#bmname'); if(nm){ nm.focus(); nm.select(); } } }
      else if(what === 'unstar'){ if(c) post({ do: 'mark', how: 'remove', url: c.url }); closePop(); }
      else if(what === 'closepop'){ var name = $('#bmname'); if(name && c) post({ do: 'mark', how: 'rename', url: c.url, title: name.value.trim() }); closePop(); }
      else if(what === 'imm') post({ do: 'set', k: 'imm', v: !S.settings.imm });
      else if(what === 'peek') showBar();
      else if(what === 'findnext') find(false); else if(what === 'findprev') find(true);
      else if(what === 'findclose'){ L.find = false; L.miss = false; paint(); post({ do: 'focusPage' }); }
      else if(what === 'toastact'){ var f = L.toast && L.toast.fn; L.toast = null; if(f) f(); else paint(); }
      return;
    }
    if((x = t.closest('[data-pane]')) && +x.getAttribute('data-pane') !== S.at){ post({ do: 'pane', i: +x.getAttribute('data-pane') }); return; }
    if(L.pop && !t.closest('#pop')) closePop();
  });
  win.addEventListener('focusin', function(e){
    if(e.target.id === 'url' && L.typed == null){ var c = cur(); L.typed = c && c.kind === 'web' ? c.url : ''; L.sel = -1; L.pop = null; paint(); var u = $('#url'); u.focus(); u.select(); }
  });
  win.addEventListener('focusout', function(e){ if(e.target.id === 'url') setTimeout(function(){ var a = document.activeElement; if(L.typed != null && !(a && a.id === 'url')){ L.typed = null; L.sel = -1; paint(); } }, 120); });
  win.addEventListener('input', function(e){
    if(e.target.id === 'url'){ L.typed = e.target.value; L.sel = -1; post({ do: 'suggest', q: L.typed.trim() }); paint(); }
    else if(e.target.id === 'find'){ L.findText = e.target.value; L.miss = false; find(false); }
  });
  win.addEventListener('keydown', function(e){
    var t = e.target;
    if(t.id === 'url'){
      if(e.key === 'ArrowDown' || e.key === 'ArrowUp'){ e.preventDefault(); var n = L.rows.length; if(n){ L.sel = e.key === 'ArrowDown' ? (L.sel + 1) % n : (L.sel <= 0 ? n - 1 : L.sel - 1); paint(); } }
      else if(e.key === 'Enter'){ e.preventDefault(); if(L.sel >= 0) choose(L.sel); else { var text = t.value; L.typed = null; t.blur(); if(text.trim()) post({ do: 'go', text: text }); paint(); } }
      else if(e.key === 'Escape'){ L.typed = null; L.sel = -1; t.blur(); paint(); post({ do: 'focusPage' }); }
      return;
    }
    if(t.id === 'find'){ if(e.key === 'Enter'){ e.preventDefault(); find(e.shiftKey); } else if(e.key === 'Escape'){ L.find = false; L.miss = false; paint(); post({ do: 'focusPage' }); } return; }
    if(t.id === 'bmname' && e.key === 'Enter'){ e.preventDefault(); $('[data-do=closepop]').click(); return; }
    if(e.key === 'Escape' && L.pop){ closePop(); post({ do: 'focusPage' }); }
  });

  // ---------- what the app tells this page ----------
  var before = { downloads: 0, done: 0 };
  window.Sleek = {
    on: function(m){
      if(m.type === 'state'){
        var hadImm = !!S.settings.imm; S.tabs = m.tabs; S.panes = m.panes; S.at = m.at; S.n = m.n; S.settings = m.settings; S.bookmarks = m.bookmarks; S.private = m.private; S.downloads = m.downloads || [];
        var done = S.downloads.filter(function(d){ return d.done; }).length;
        if(S.downloads.length > before.downloads){ L.toast = { text: 'Downloading ' + S.downloads[0].name, act: 'Show', fn: function(){ openPop('downloads'); } }; var n1 = ++L.toastN; setTimeout(function(){ if(L.toastN === n1){ L.toast = null; paint(); } }, 3200); }
        else if(done > before.done){ var d = S.downloads.filter(function(x){ return x.done; })[0]; L.toast = { text: 'Downloaded ' + d.name, act: 'Show in Finder', fn: function(){ post({ do: 'reveal', id: d.id }); L.toast = null; paint(); } }; var n2 = ++L.toastN; setTimeout(function(){ if(L.toastN === n2){ L.toast = null; paint(); } }, 4200); }
        before.downloads = S.downloads.length; before.done = done;
        paint(); if(S.settings.imm && !hadImm) showBar();
      }
      else if(m.type === 'suggest'){ L.native = { q: m.q, items: m.items || [] }; if(L.typed != null) paint(); }
      else if(m.type === 'history'){ L.history = m.items || []; if(L.pop === 'history') paint(); }
      else if(m.type === 'find'){ L.miss = !m.found; paint(); }
      else if(m.type === 'toast') toast(m.text);
      else if(m.type === 'focus-url'){ if(S.settings.imm) showBar(); var u = $('#url'); if(u){ u.focus(); u.select(); } }
      else if(m.type === 'show'){ if(S.settings.imm) showBar(); if(m.what === 'find'){ L.find = true; L.pop = null; paint(); var f = $('#find'); f.focus(); f.select(); } else if(m.what === 'star'){ var s = $('.star'); if(s) s.click(); } else openPop(m.what); }
      else if(m.type === 'edge'){ L.reach = !!m.near; if(m.near) showBar(); else { clearTimeout(immT); immT = setTimeout(hideBar, 1400); } }
      else if(m.type === 'scroll'){ if(m.how === 'top') showBar(); else if(!busy()){ clearTimeout(immT); win.classList.remove('show'); report(); } }
      else if(m.type === 'full'){ L.full = !!m.on; paint(); }
    },
    // for the app's own checks: press something, type in the address box, and say what is showing
    test: {
      still: function(){ L.still = true; paint(); },
      click: function(sel){ var e = $(sel); if(!e) return false; e.click(); return true; },
      type: function(text){ $('#url').focus(); var u = $('#url'); u.focus(); u.value = text; u.dispatchEvent(new Event('input', { bubbles: true })); return true; },      // focusing draws the bar again, so the box is found a second time
      enter: function(){ var u = document.activeElement; if(!u) return false; u.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); return true; },
      see: function(){ var b = $('#bar').getBoundingClientRect(); return { tabs: $$('.tab .tt').map(function(e){ return e.textContent; }), on: ($('.tab.on .tt') || {}).textContent || '', url: $('#url').value, pop: L.pop, rows: (L.rows || []).map(function(r){ return r.kind + ':' + r.title; }), marks: $$('.bbar .bm[data-bm] span:last-child').map(function(e){ return e.textContent; }), star: !!$('.star.on'),
        panes: $$('.pane').length, ring: $$('.pane.on').length, barTop: Math.round(b.top), barBottom: Math.round(b.bottom), height: win.clientHeight, cls: win.className, mode: win.getAttribute('data-mode'), find: !!$('#findbox'), miss: L.miss, toast: L.toast ? L.toast.text : '', floating: getComputedStyle($('#bar')).position === 'absolute' }; }
    }
  };
  paint();
  post({ do: 'ready' });
})();

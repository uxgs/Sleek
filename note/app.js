/* Sleeky Notes: the app. Jot something down in a second, and find it later.

   Three parts side by side on a wide screen, one at a time on a phone:
     the side list   All notes, Pinned, Locked, your folders and your tags        (#nav)
     the notes       pinned ones as tiles, the rest as rows, newest first; a box
                     at the foot that keeps whatever you type as a new note        (#chips, #rows, #jot)
     the note        its icon, title, folder, tags and text                        (#note)
   Notes are kept by core/note-store.js; the writing box is note/editor.js; the lock is note/lock.js.

   A locked note shows its title and icon in the list, and "Locked" where its text would be. Opening
   it asks for this device's fingerprint or face, or your passcode; its text is read only then, and
   forgotten again when you leave the note or the page goes out of sight. Search finds a locked note
   by its title and tags, never by its text. */
(function(){
  'use strict';
  var N = window.SleekNotes, V = window.SleekVault, E = window.SleekNoteEditor, de = document.documentElement;
  function $(s){ return document.querySelector(s); }
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"]/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  // ---------- icons: a note's own (NOTE_ICONS), and the app's ----------
  var I = {
    note: '<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4M9 12h7M9 16h5"/>',
    bulb: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.100 1.300 1.100 2.200h5c0-.9.4-1.600 1.100-2.200A6 6 0 0 0 12 3z"/>',
    cart: '<path d="M3 4h2.500l2 11h10.500l2-8H7"/><circle cx="9.500" cy="19" r="1.400"/><circle cx="17" cy="19" r="1.400"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l8-8M16 7l3 3M13.500 9.500l2 2"/>',
    heart: '<path d="M12 20s-7-4.400-7-10a4 4 0 0 1 7-2.500A4 4 0 0 1 19 10c0 5.600-7 10-7 10z"/>',
    star: '<path d="M12 3.500l2.600 5.400 5.900.8-4.300 4.100 1 5.900L12 16.900l-5.200 2.800 1-5.900-4.300-4.100 5.900-.8z"/>',
    plane: '<path d="M21 3L3 10.500l7 2.500 2.500 7z"/><path d="M10 13l5-4"/>',
    book: '<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h11"/>',
    home: '<path d="M4 11l8-7 8 7v9H4z"/><path d="M10 20v-6h4v6"/>',
    work: '<rect x="3" y="7" width="18" height="13" rx="2.500"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18"/>',
    music: '<path d="M9 18V5l11-2v13"/><circle cx="6.500" cy="18" r="2.500"/><circle cx="17.500" cy="16" r="2.500"/>',
    gift: '<rect x="4" y="10" width="16" height="10" rx="2"/><path d="M3 7h18v3H3zM12 7v13"/><path d="M12 7c-1.500-3-5-3.500-5-1.500 0 1.500 2.500 1.500 5 1.500zM12 7c1.500-3 5-3.500 5-1.500 0 1.500-2.500 1.500-5 1.500z"/>',
    wifi: '<path d="M3 9a13 13 0 0 1 18 0M6 12.500a9 9 0 0 1 12 0M9 16a5 5 0 0 1 6 0"/><circle cx="12" cy="19" r="1"/>',
    leaf: '<path d="M5 19c0-9 5-14 15-14 0 10-5 15-14 15z"/><path d="M5 19l8-8"/>',
    food: '<path d="M7 3v8a2 2 0 0 0 2 2v8M5 3v5M9 3v5M16 3c-2 1-3 4-3 7h3v11"/>',
    card: '<rect x="3" y="6" width="18" height="13" rx="2.500"/><path d="M3 10h18M7 15h4"/>',
    code: '<path d="M8 8l-4 4 4 4M16 8l4 4-4 4M13.500 5l-3 14"/>',
    health: '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8v8M8 12h8"/>',
    fit: '<path d="M4 9v6M7 7v10M17 7v10M20 9v6M7 12h10"/>',
    camera: '<path d="M4 8h3l1.500-2h7L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.500"/>',
    car: '<path d="M5 11l1.500-4.500h11L19 11"/><rect x="3" y="11" width="18" height="6" rx="2"/><path d="M6 17v2M18 17v2M7 14h.01M17 14h.01"/>',
    phone: '<rect x="7" y="3" width="10" height="18" rx="2.500"/><path d="M11 18h2"/>',
    chat: '<path d="M4 5h16v11H9l-5 4z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.600 5.600l1.400 1.400M17 17l1.400 1.400M5.600 18.400L7 17M17 7l1.400-1.400"/>',
    pin: '<path d="M9 4h6l-1 6 3 3H7l3-3z"/><path d="M12 13v7"/>',
    lock: '<rect x="5" y="11" width="14" height="9" rx="2.500"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    open: '<rect x="5" y="11" width="14" height="9" rx="2.500"/><path d="M8 11V8a4 4 0 0 1 7.600-1.800"/>',
    folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    all: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 9h8M8 13h8M8 17h5"/>',
    search: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.500-4.500"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
    chev: '<path d="M14.500 6l-6 6 6 6"/>',
    check: '<path d="M5 12.500l4.500 4.500L19 7.500"/>',
    list: '<rect x="4" y="5" width="6" height="6" rx="1.500"/><path d="M5.800 8l1 1 1.800-2M13 8h7M13 16h7"/><rect x="4" y="13" width="6" height="6" rx="1.500"/>',
    bold: '<path d="M8 5h5a3.500 3.500 0 0 1 0 7H8zM8 12h6a3.500 3.500 0 0 1 0 7H8z"/>',
    bin: '<path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12M10.500 11v5M13.500 11v5"/>',
    more: '<circle cx="6" cy="12" r="1.200"/><circle cx="12" cy="12" r="1.200"/><circle cx="18" cy="12" r="1.200"/>',
    moon: '<path d="M19 14.500A7.500 7.500 0 0 1 9.500 5a7.500 7.500 0 1 0 9.500 9.500z"/>',
    touch: '<path d="M7.500 19c.6-1.800.8-3.600.8-5.500V11a3.700 3.700 0 0 1 7.400 0v2.500c0 2.300-.3 4.300-.9 6"/><path d="M4.500 15V11a7.500 7.500 0 0 1 15 0v3.500c0 1.300-.1 2.500-.4 3.700"/><path d="M12 11v3.500c0 2.200-.4 4.200-1.100 6"/>'
  };
  function ic(n){ return '<svg class="i" viewBox="0 0 24 24" aria-hidden="true">' + (I[n] || I.note) + '</svg>'; }
  var NOTE_ICONS = ['note', 'bulb', 'cart', 'key', 'heart', 'star', 'plane', 'book', 'home', 'work', 'music', 'gift', 'wifi', 'leaf', 'food', 'card', 'code', 'health', 'fit', 'camera', 'car', 'phone', 'chat', 'sun'];
  var ICON_NAMES = { note: 'Note', bulb: 'Idea', cart: 'Shopping', key: 'Key', heart: 'Heart', star: 'Star', plane: 'Travel', book: 'Book', home: 'Home', work: 'Work', music: 'Music', gift: 'Gift', wifi: 'Wi-Fi', leaf: 'Garden', food: 'Food', card: 'Money', code: 'Code', health: 'Health', fit: 'Exercise', camera: 'Camera', car: 'Car', phone: 'Phone', chat: 'Chat', sun: 'Sun' };

  // what is showing: the list's filter, the open note, and (only while a locked note is open) its key and text
  var S = { filter: 'all', tag: null, q: '', open: null, key: null, plain: null, fresh: null, adding: null, came: false, hint: '' };
  var wide = matchMedia('(min-width: 860px)'), editor = null, saveT = null, save = null;

  function when(t){
    var d = Date.now() - t, m = Math.floor(d / 60000), D = new Date(t), T = new Date();
    if(m < 1) return 'Now'; if(m < 60) return m + 'm';
    if(D.toDateString() === T.toDateString()) return Math.floor(m / 60) + 'h';
    if(D.toDateString() === new Date(T - 864e5).toDateString()) return 'Yesterday';
    if(d < 6 * 864e5) return D.toLocaleDateString(undefined, { weekday: 'short' });
    return D.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  }
  function folderName(id){ var f = N.folder(id); return f ? f.name : ''; }
  function isFolder(){ return ['all', 'pinned', 'locked'].indexOf(S.filter) < 0; }
  function match(n){
    if(S.filter === 'pinned' && !n.pin) return false;
    if(S.filter === 'locked' && !n.lock) return false;
    if(isFolder() && n.folder !== S.filter) return false;
    if(S.tag && n.tags.indexOf(S.tag) < 0) return false;
    var q = S.q.trim().toLowerCase();
    return !q || (n.title + ' ' + n.tags.join(' ') + ' ' + (n.lock ? '' : E.text(n.body))).toLowerCase().indexOf(q) >= 0;      // a locked note is found by its title and tags only
  }
  function title(n){ return n.title || 'Untitled'; }
  function snippet(n){
    if(n.lock) return '<i class="lk">' + ic('lock') + ' Locked</i>';
    return esc(E.text(n.body).split('\n').filter(function(l){ return l.trim(); }).slice(0, 2).join(' · ')) || '<i class="lk">No more text</i>';
  }
  function under(n){ return esc(n.tags.map(function(t){ return '#' + t; }).concat(folderName(n.folder) || []).join('  ·  ')); }

  // ---------- drawing ----------
  function foot(){
    var v = window.SLEEK_NOTE_CHANGES ? 'v' + window.SLEEK_NOTE_CHANGES[0].v : '';
    return '<div class="foot"><button type="button" data-act="news">' + v + '</button><button type="button" data-act="look" aria-label="Light or dark">' + ic(de.getAttribute('data-mode') === 'dark' ? 'sun' : 'moon') + '</button>' +
      '<button type="button" data-act="export">Save a copy</button><button type="button" data-act="import">Bring one in</button></div>';
  }
  function tagChips(){ return N.tags().map(function(t){ return '<button type="button" class="chip tag" data-tag="' + esc(t) + '" aria-pressed="' + (S.tag === t) + '">#' + esc(t) + '</button>'; }).join(''); }
  function renderNav(){
    function b(id, label, icon){ return '<button type="button" class="navb" data-filter="' + esc(id) + '" aria-pressed="' + (S.filter === id) + '">' + ic(icon) + '<span>' + esc(label) + '</span></button>'; }
    $('#nav').innerHTML = '<a class="brand" href="index.html" title="All of Sleek"><img src="icons/notes.svg" alt="" width="24" height="22"><span>Sleeky Notes</span></a>' +
      '<button type="button" class="navb new" data-act="new">' + ic('plus') + '<span>New note</span></button>' +
      b('all', 'All notes', 'all') + b('pinned', 'Pinned', 'pin') + b('locked', 'Locked', 'lock') +
      '<div class="label">Folders</div>' + N.folders().map(function(f){ return b(f.id, f.name, 'folder'); }).join('') +
      (S.adding === 'folder' ? '<span class="navb"><input class="newfolder" placeholder="Folder name" aria-label="New folder" maxlength="40"></span>' : '<button type="button" class="navb" data-act="addfolder">' + ic('plus') + '<span>New folder</span></button>') +
      (N.tags().length ? '<div class="label">Tags</div><div class="navtags">' + tagChips() + '</div>' : '') + '<span class="grow"></span>' + foot();
  }
  function renderChips(){
    function chip(id, label, icon){ return '<button type="button" class="chip" data-filter="' + esc(id) + '" aria-pressed="' + (S.filter === id) + '">' + (icon ? ic(icon) : '') + esc(label) + '</button>'; }
    $('#chips').innerHTML = '<div class="chips">' + chip('all', 'All') + chip('pinned', 'Pinned', 'pin') + chip('locked', 'Locked', 'lock') + N.folders().map(function(f){ return chip(f.id, f.name, 'folder'); }).join('') +
      (S.adding === 'folder' ? '<span class="chip"><input class="newfolder" placeholder="Folder name" aria-label="New folder" maxlength="40"></span>' : '<button type="button" class="chip" data-act="addfolder" aria-label="New folder">' + ic('plus') + '</button>') + '</div>' +
      (N.tags().length ? '<div class="chips">' + tagChips() + '</div>' : '');
  }
  function renderRows(){
    var found = N.notes().filter(match), pins = S.filter === 'pinned' ? [] : found.filter(function(n){ return n.pin; }), rest = S.filter === 'pinned' ? found : found.filter(function(n){ return !n.pin; });
    var head = S.filter === 'all' ? 'Notes' : S.filter === 'pinned' ? 'Pinned' : S.filter === 'locked' ? 'Locked' : folderName(S.filter);
    function cls(n){ return (n.id === S.open ? ' on' : '') + (n.id === S.fresh ? ' fresh' : ''); }
    $('#rows').innerHTML =
      (pins.length ? '<div class="label">' + ic('pin') + ' Pinned</div><div class="pins">' + pins.map(function(n){
        return '<button type="button" class="tile' + cls(n) + '" data-open="' + n.id + '" style="--c:' + esc(n.color) + '"><span class="ic">' + ic(n.icon) + '</span><b>' + esc(title(n)) + '</b><span class="sn">' + snippet(n) + '</span></button>'; }).join('') + '</div>' : '') +
      '<div class="label"><span>' + esc(head + (S.tag ? '  ·  #' + S.tag : '')) + '</span>' + (isFolder() ? '<button type="button" class="mini" data-act="folder" aria-label="Rename or delete this folder">' + ic('more') + '</button>' : '') + '</div>' +
      '<div class="rows">' + rest.map(function(n){
        return '<button type="button" class="row' + cls(n) + '" data-open="' + n.id + '" style="--c:' + esc(n.color) + '"><span class="ic">' + ic(n.icon) + '</span><span class="tx"><b>' + esc(title(n)) + '</b><span class="sn">' + snippet(n) + '</span>' +
          (under(n) ? '<span class="tg">' + under(n) + '</span>' : '') + '</span><time>' + esc(when(n.updated)) + '</time></button>'; }).join('') + '</div>' +
      (found.length ? '' : '<div class="empty">' + (S.q ? 'Nothing matches “' + esc(S.q) + '”.' : N.notes().length ? 'No notes here yet.' : 'Nothing here yet. Jot something down below.') + '</div>') + foot();
    S.fresh = null;
  }
  function renderList(){ renderNav(); renderChips(); renderRows(); }
  function shut(n){ return n.lock && S.plain === null; }
  function bar(n){
    function tool(act, icon, label, on){ return '<button type="button" class="tool" data-act="' + act + '"' + (on === undefined ? '' : ' aria-pressed="' + on + '"') + ' aria-label="' + label + '" title="' + label + '">' + ic(icon) + '</button>'; }
    return '<button type="button" class="back" data-act="back">' + ic('chev') + 'Notes</button><span class="sp"></span>' +
      (shut(n) ? '' : tool('check', 'list', 'Checklist') + tool('bold', 'bold', 'Bold')) +
      tool('pin', 'pin', n.pin ? 'Unpin this note' : 'Pin this note', n.pin) + tool('lock', n.lock ? 'lock' : 'open', n.lock ? 'Take the lock off' : 'Lock this note', n.lock) + tool('delete', 'bin', 'Delete this note');
  }
  function tagsRow(n){
    return n.tags.map(function(t){ return '<button type="button" class="chip tag" data-untag="' + esc(t) + '" aria-label="Remove the tag ' + esc(t) + '" title="Remove">#' + esc(t) + '</button>'; }).join('') +
      (S.adding === 'tag' ? '<span class="chip tag"><input id="newtag" placeholder="tag" aria-label="New tag" maxlength="40" list="taglist"><datalist id="taglist">' + N.tags().filter(function(t){ return n.tags.indexOf(t) < 0; }).map(function(t){ return '<option value="' + esc(t) + '">'; }).join('') + '</datalist></span>'
                          : '<button type="button" class="chip tag" data-act="addtag">' + ic('plus') + 'Tag</button>');
  }
  function metaRow(n){ return '<button type="button" data-act="move">' + ic('folder') + esc(folderName(n.folder) || 'No folder') + '</button><span>Edited ' + esc(when(n.updated) === 'Now' ? 'just now' : when(n.updated)) + '</span>'; }
  /** Draw the open note. reveal: its text has just been unlocked. */
  function renderNote(reveal, dir){
    var n = N.note(S.open), el = $('#note'); editor = null;
    $('#app').classList.toggle('open', !!n);
    if(!n){ el.innerHTML = '<div class="blank">' + ic('note') + '<span>Choose a note, or jot one down.</span></div>'; return; }
    el.innerHTML = '<div class="in ' + (dir || '') + '"><div class="bar" id="nbar">' + bar(n) + '</div>' +
      (S.hint ? '<div class="hint">' + ic('lock') + '<span>' + esc(S.hint) + '</span></div>' : '') +
      '<button type="button" class="bigic" id="nicon" data-act="icon" style="--c:' + esc(n.color) + '" aria-label="Change the icon">' + ic(n.icon) + '</button>' +
      '<div class="ttl" id="ttl" contenteditable="true" role="textbox" aria-label="Title" data-ph="Title" spellcheck="true">' + esc(n.title) + '</div>' +
      '<div class="meta" id="nmeta">' + metaRow(n) + '</div><div class="tags" id="ntags">' + tagsRow(n) + '</div>' +
      (shut(n) ? '<div class="vault"><span class="big">' + ic('lock') + '</span><b>This note is locked</b><span>Its title and icon show in your list. The rest opens with ' + (bioReady(n) ? V.bioName() + ' or your passcode.' : 'your passcode.') + '</span>' +
                 '<button type="button" class="btn" data-act="unlock">' + ic(bioReady(n) ? 'touch' : 'open') + 'Unlock' + (bioReady(n) ? ' with ' + esc(V.bioName()) : '') + '</button></div>'
               : '<div class="body' + (reveal ? ' reveal' : '') + '" id="body" role="textbox" aria-multiline="true" aria-label="Note" data-ph="Write something…"></div>') + '</div>';
    S.hint = '';
    if(!shut(n)) editor = E.mount($('#body'), n.lock ? S.plain : n.body, function(html){ edited(n.id, html); });
  }
  /** The parts of the open note that change without its text changing. */
  function refreshNote(){
    var n = N.note(S.open); if(!n || !$('#nbar')) return;
    $('#nbar').innerHTML = bar(n); $('#nmeta').innerHTML = metaRow(n); $('#ntags').innerHTML = tagsRow(n);
    var b = $('#nicon'); b.style.setProperty('--c', n.color); b.innerHTML = ic(n.icon);
  }
  function render(){ renderList(); renderNote(); }

  // ---------- saving what is typed ----------
  function edited(id, html){
    var n = N.note(id); if(!n) return;
    if(n.lock) S.plain = html;
    clearTimeout(saveT);
    save = function(){
      save = null; clearTimeout(saveT);
      var m = N.note(id); if(!m) return Promise.resolve();
      if(!m.lock){ N.set(id, { body: html }); return Promise.resolve(); }
      var key = S.key, v = N.vault(m.sealed.v); if(!key || !v) return Promise.resolve();
      return V.seal(v, key, html).then(function(sealed){ if(N.note(id) && N.note(id).lock) N.set(id, { sealed: sealed }); });
    };
    saveT = setTimeout(function(){ if(save) save(); }, 350);
  }
  function flush(){ return save ? Promise.resolve(save()) : Promise.resolve(); }

  // ---------- opening and leaving a note ----------
  function show(id, dir){
    if(S.open && S.open !== id){ flush(); S.key = null; S.plain = null; }
    if(id && !N.note(id)) id = null;
    S.open = id; S.adding = null; renderRows(); renderNote(false, dir);
  }
  function open(id){
    S.came = true;
    if(wide.matches){ try { history.replaceState(null, '', '#n/' + id); } catch(e){} show(id); }
    else location.hash = 'n/' + id;
  }
  function leave(){
    if(wide.matches){ try { history.replaceState(null, '', location.pathname + location.search); } catch(e){} show(null, 'back'); }
    else if(S.came && history.length > 1) history.back();
    else { try { history.replaceState(null, '', location.pathname + location.search); } catch(e){} show(null, 'back'); }
  }
  function route(){ var m = /^#n\/([a-z0-9]+)$/.exec(location.hash); show(m ? m[1] : null, m ? '' : 'back'); }
  /** Lock the open note again: its text and key are forgotten. */
  function relock(){
    var n = N.note(S.open); if(!n || !n.lock || S.plain === null) return;
    flush().then(function(){ S.key = null; S.plain = null; if(N.note(S.open) === n) renderNote(); });
  }

  // ---------- toasts and sheets ----------
  function toast(text, undo){
    var o = $('#over'), old = o.querySelector('.toast'); if(old) old.remove();
    var t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); t.innerHTML = '<span>' + esc(text) + '</span>' + (undo ? '<button type="button">Undo</button>' : '');
    if(undo) t.querySelector('button').addEventListener('click', function(){ t.remove(); undo(); });
    o.appendChild(t); setTimeout(function(){ t.remove(); }, undo ? 6000 : 1900);
  }
  function closeSheet(){ var s = $('#over .shade'); if(s) s.remove(); }
  function sheet(html){ closeSheet(); $('#over').insertAdjacentHTML('beforeend', '<div class="shade" data-act="shut"><div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div>' + html + '</div></div>'); return $('#over .sheet'); }
  function iconSheet(){
    var n = N.note(S.open); if(!n) return;
    sheet('<h3>Icon</h3><div class="icons" style="--c:' + esc(n.color) + '">' + NOTE_ICONS.map(function(k){ return '<button type="button" data-icon="' + k + '" aria-pressed="' + (n.icon === k) + '" aria-label="' + ICON_NAMES[k] + '" title="' + ICON_NAMES[k] + '">' + ic(k) + '</button>'; }).join('') + '</div>' +
      '<div class="dots">' + N.COLORS.map(function(c){ return '<button type="button" data-color="' + c + '" style="--c:' + c + '" aria-pressed="' + (n.color === c) + '" aria-label="Colour"></button>'; }).join('') + '</div>');
  }
  function moveSheet(){
    var n = N.note(S.open); if(!n) return;
    sheet('<h3>Move to</h3><button type="button" class="pick" data-move="" aria-pressed="' + !n.folder + '">' + ic('all') + 'No folder</button>' +
      N.folders().map(function(f){ return '<button type="button" class="pick" data-move="' + f.id + '" aria-pressed="' + (n.folder === f.id) + '">' + ic('folder') + esc(f.name) + '</button>'; }).join('') +
      '<form class="line" id="movenew"><input placeholder="New folder" aria-label="New folder" maxlength="40"><button class="btn small">Add</button></form>');
  }
  function folderSheet(){
    var f = N.folder(S.filter); if(!f) return;
    var s = sheet('<h3>Folder</h3><form class="line" id="rename"><input value="' + esc(f.name) + '" aria-label="Folder name" maxlength="40"><button class="btn small">Rename</button></form>' +
      '<button type="button" class="pick bad" data-act="delfolder">' + ic('bin') + 'Delete this folder</button><p class="small">Its notes stay, in no folder.</p>');
    s.querySelector('input').select();
  }
  function newsSheet(){
    var C = window.SLEEK_NOTE_CHANGES || [];
    sheet('<h3>What’s new in Sleeky Notes</h3>' + C.slice(0, 6).map(function(c){ return '<div class="news"><b>' + esc(c.v) + '</b><span>' + esc(c.date) + '</span><ul>' + c.items.map(function(i){ return '<li>' + esc(i) + '</li>'; }).join('') + '</ul></div>'; }).join(''));
  }

  // ---------- the lock ----------
  function bioReady(n){ var v = n.sealed ? N.vault(n.sealed.v) : V.home(); return !!(v && v.bio && v.bio.length && S.bio); }
  /** Ask for the passcode. Gives the key, or null when the sheet is closed. */
  function askPass(v){
    return new Promise(function(done){
      var s = sheet('<h3>Your passcode</h3><form id="passform"><input type="password" id="pass1" autocomplete="current-password" aria-label="Passcode" placeholder="Passcode"><p class="small bad" id="passnote" hidden>That passcode did not open it.</p><button class="btn wide">Unlock</button></form>');
      var input = s.querySelector('input'), settled = false; input.focus();
      function end(raw){ if(settled) return; settled = true; obs.disconnect(); closeSheet(); done(raw); }
      var obs = new MutationObserver(function(){ if(!document.contains(s)) end(null); }); obs.observe($('#over'), { childList: true });
      s.querySelector('form').addEventListener('submit', function(e){
        e.preventDefault(); var b = s.querySelector('.btn'); b.disabled = true;
        V.withPass(v, input.value).then(function(raw){
          if(raw) return end(raw);
          b.disabled = false; s.querySelector('#passnote').hidden = false; s.classList.remove('shake'); void s.offsetWidth; s.classList.add('shake'); input.select();
        });
      });
    });
  }
  /** The key to a vault: this device's fingerprint or face if it was set up here, else (or if that is refused) the passcode. */
  function needKey(v){
    if(!v) return Promise.resolve(null);
    if(v.bio && v.bio.length && S.bio) return V.withBio(v).then(function(raw){ return raw; }, function(){ return askPass(v); });
    return askPass(v);
  }
  /** The first time: choose a passcode. Gives { vault, raw }, or null. */
  function setupLock(){
    return new Promise(function(done){
      var name = V.bioName();
      var s = sheet('<h3>Lock notes</h3><p class="small">A locked note shows its title and icon in your list. Its text is scrambled, and opens only with your passcode' + (S.bio ? ' or ' + esc(name) : '') + '.</p>' +
        '<form id="setform"><input type="password" id="pass1" autocomplete="new-password" aria-label="Choose a passcode" placeholder="Choose a passcode"><input type="password" id="pass2" autocomplete="new-password" aria-label="The passcode again" placeholder="The passcode again">' +
        (S.bio ? '<label class="tick"><input type="checkbox" id="usebio" checked><span>Also unlock with ' + esc(name) + ' on this device</span></label>' : '') +
        '<p class="small bad" id="setnote" hidden></p><p class="small"><b>Keep this passcode somewhere safe.</b> Nobody can read a locked note without it, and it cannot be reset.</p><button class="btn wide">Set the lock</button></form>');
      var a = s.querySelector('#pass1'), b = s.querySelector('#pass2'), note = s.querySelector('#setnote'), settled = false; a.focus();
      function end(r){ if(settled) return; settled = true; obs.disconnect(); closeSheet(); done(r); }
      var obs = new MutationObserver(function(){ if(!document.contains(s)) end(null); }); obs.observe($('#over'), { childList: true });
      s.querySelector('form').addEventListener('submit', function(e){
        e.preventDefault();
        var msg = a.value.length < 4 ? 'Use four characters or more.' : a.value !== b.value ? 'The two do not match.' : '';
        if(msg){ note.textContent = msg; note.hidden = false; return; }
        var bio = s.querySelector('#usebio') && s.querySelector('#usebio').checked, btn = s.querySelector('.btn'); btn.disabled = true;
        V.setup(a.value).then(function(made){
          if(!bio) return end(made);
          return V.addBio(made.vault, made.raw).then(function(){ end(made); }, function(){ end(made); toast(name + ' is not available here, so your passcode opens locked notes.'); });
        }).catch(function(err){ console.error(err); btn.disabled = false; note.textContent = 'The lock could not be made in this browser.'; note.hidden = false; });
      });
    });
  }
  function toggleLock(){
    var n = N.note(S.open); if(!n) return;
    if(!V.can){ toast('This browser cannot lock notes.'); return; }
    flush().then(function(){
      if(!n.lock){
        var body = editor ? editor.html() : n.body, v = V.home();
        return (v ? needKey(v).then(function(raw){ return raw && { vault: v, raw: raw }; }) : setupLock()).then(function(got){
          if(!got) return;
          return V.seal(got.vault, got.raw, body).then(function(sealed){
            N.set(n.id, { lock: true, sealed: sealed, body: '' }); S.key = got.raw; S.plain = body;
            S.hint = 'Locked. It will ask the next time you open it.'; renderList(); renderNote();
          });
        });
      }
      var v2 = N.vault(n.sealed.v);
      return (S.key ? Promise.resolve(S.key) : needKey(v2)).then(function(raw){
        if(!raw) return;
        return (S.plain !== null ? Promise.resolve(S.plain) : V.unseal(raw, n.sealed)).then(function(text){
          N.set(n.id, { lock: false, sealed: null, body: text }); S.key = null; S.plain = null; toast('Lock taken off'); renderList(); renderNote();
        });
      });
    }).catch(function(e){ console.error(e); toast('That did not work. Nothing was changed.'); });
  }
  function unlock(){
    var n = N.note(S.open); if(!n || !n.lock) return;
    var v = N.vault(n.sealed.v);
    if(!v){ toast('The lock for this note is not in this browser.'); return; }
    needKey(v).then(function(raw){
      if(!raw || N.note(S.open) !== n) return;
      return V.unseal(raw, n.sealed).then(function(text){ S.key = raw; S.plain = text; renderNote(true); });
    }).catch(function(e){ console.error(e); toast('This note could not be opened.'); });
  }

  // ---------- doing things ----------
  function jot(text){
    text = text.trim(); if(!text) return;
    var long = text.length > 80;
    var n = N.add({ title: long ? text.slice(0, 77).replace(/\s+\S*$/, '') + '…' : text, body: long ? E.fromText(text) : '', folder: isFolder() ? S.filter : '', tags: S.tag ? [S.tag] : [] });
    S.fresh = n.id; if(S.q){ S.q = ''; $('#q').value = ''; }
    renderList(); $('#list').scrollTo({ top: 0, behavior: 'smooth' });
  }
  function newNote(){
    var n = N.add({ folder: isFolder() ? S.filter : '', tags: S.tag ? [S.tag] : [] });
    renderList(); open(n.id); setTimeout(function(){ var t = $('#ttl'); if(t) t.focus(); }, wide.matches ? 0 : 60);
  }
  function addFolder(name){ S.adding = null; var f = N.addFolder(name); if(f) S.filter = f.id; renderList(); }
  function look(){
    var dark = de.getAttribute('data-mode') !== 'dark';
    if(dark) de.setAttribute('data-mode', 'dark'); else de.removeAttribute('data-mode');
    try { localStorage.setItem('sleek-notes-look', dark ? 'dark' : 'light'); } catch(e){}
    var m = document.querySelector('meta[name="theme-color"]'); if(m) m.setAttribute('content', dark ? '#0E0E11' : '#FFFFFF');
    renderList();
  }
  function exportFile(){
    N.exportAll().then(function(text){
      var d = new Date(), a = document.createElement('a'), url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      a.href = url; a.download = 'Sleeky Notes ' + d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2) + '.sleek';
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(function(){ URL.revokeObjectURL(url); }, 60000);
      toast('Saved a copy to your downloads');
    });
  }
  function importFile(file){
    if(!file) return;
    file.text().then(function(t){ return N.importAll(t); }).then(function(r){ render(); toast(r.notes ? 'Brought in ' + r.notes + (r.notes === 1 ? ' note' : ' notes') : 'Those notes are all here already'); },
      function(e){ toast(/Sleeky Notes/.test(e && e.message) ? e.message : 'That file could not be read.'); });
  }

  document.addEventListener('click', function(e){
    var t = e.target.closest('button, a, [data-act]'); if(!t || t.tagName === 'A') return;
    var n = N.note(S.open), d = t.dataset;
    if(d.open) return open(d.open);
    if(d.filter){ S.filter = d.filter; S.adding = null; renderList(); return; }
    if(d.tag){ S.tag = S.tag === d.tag ? null : d.tag; renderList(); return; }
    if(d.untag && n){ N.set(n.id, { tags: n.tags.filter(function(x){ return x !== d.untag; }) }); renderList(); refreshNote(); return; }
    if(d.icon && n){ N.set(n.id, { icon: d.icon }); iconSheet(); renderRows(); refreshNote(); return; }
    if(d.color && n){ N.set(n.id, { color: d.color }); iconSheet(); renderRows(); refreshNote(); return; }
    if('move' in d && n){ N.set(n.id, { folder: d.move }); closeSheet(); toast(d.move ? 'Moved to ' + folderName(d.move) : 'Taken out of its folder'); renderList(); refreshNote(); return; }
    switch(d.act){
      case 'shut': if(e.target === t) closeSheet(); break;
      case 'back': leave(); break;
      case 'new': newNote(); break;
      case 'pin': if(n){ N.set(n.id, { pin: !n.pin }); toast(n.pin ? 'Pinned' : 'Unpinned'); renderRows(); refreshNote(); } break;
      case 'lock': toggleLock(); break;
      case 'unlock': unlock(); break;
      case 'check': if(editor) editor.check(); break;
      case 'bold': if(editor) editor.bold(); break;
      case 'delete': if(n){ clearTimeout(saveT); save = null; var was = N.remove(n.id); S.key = null; S.plain = null; leave(); if(wide.matches) render(); toast('Note deleted', function(){ N.restore(was); renderList(); }); } break;
      case 'icon': iconSheet(); break;
      case 'move': moveSheet(); break;
      case 'folder': folderSheet(); break;
      case 'delfolder': N.removeFolder(S.filter); S.filter = 'all'; closeSheet(); render(); toast('Folder deleted'); break;
      case 'addtag': S.adding = 'tag'; refreshNote(); $('#newtag').focus(); break;
      case 'addfolder': S.adding = 'folder'; renderNav(); renderChips(); Array.prototype.forEach.call(document.querySelectorAll('.newfolder'), function(i){ if(i.offsetParent) i.focus(); }); break;
      case 'news': newsSheet(); break;
      case 'look': look(); break;
      case 'export': exportFile(); break;
      case 'import': $('#file').click(); break;
    }
  });
  // the checklist and bold buttons must not take the cursor out of the note
  document.addEventListener('pointerdown', function(e){ var t = e.target.closest('[data-act="check"], [data-act="bold"]'); if(t) e.preventDefault(); });
  document.addEventListener('submit', function(e){
    var id = e.target.id, n = N.note(S.open);
    if(id === 'jot'){ e.preventDefault(); var i = $('#jotin'); jot(i.value); i.value = ''; i.focus({ preventScroll: true }); }
    if(id === 'movenew' && n){ e.preventDefault(); var f = N.addFolder(e.target.querySelector('input').value); if(f){ N.set(n.id, { folder: f.id }); closeSheet(); toast('Moved to ' + f.name); renderList(); refreshNote(); } }
    if(id === 'rename'){ e.preventDefault(); if(N.renameFolder(S.filter, e.target.querySelector('input').value)){ closeSheet(); render(); } }
  });
  document.addEventListener('input', function(e){
    var n = N.note(S.open);
    if(e.target.id === 'q'){ S.q = e.target.value; renderRows(); }
    else if(e.target.id === 'ttl' && n){ N.set(n.id, { title: e.target.innerText.replace(/\s+/g, ' ').trim() }); renderRows(); $('#nmeta').innerHTML = metaRow(N.note(n.id)); }
  });
  document.addEventListener('keydown', function(e){
    var t = e.target, n = N.note(S.open);
    if(e.key === 'Escape' && $('#over .shade')){ closeSheet(); return; }
    if(e.key !== 'Enter' && e.key !== 'Escape') return;
    if(t.id === 'ttl' && e.key === 'Enter'){ e.preventDefault(); var b = $('#body'); if(b) b.focus(); }
    if(t.id === 'newtag'){ e.preventDefault(); var v = N.tag(t.value); S.adding = null; if(e.key === 'Enter' && v && n && n.tags.indexOf(v) < 0) N.set(n.id, { tags: n.tags.concat([v]) }); renderList(); refreshNote(); }
    if(t.classList && t.classList.contains('newfolder')){ e.preventDefault(); addFolder(e.key === 'Enter' ? t.value : ''); }
  });
  document.addEventListener('focusout', function(e){
    if(e.target.id === 'newtag' && S.adding === 'tag'){ var n = N.note(S.open), v = N.tag(e.target.value); S.adding = null; if(v && n && n.tags.indexOf(v) < 0) N.set(n.id, { tags: n.tags.concat([v]) }); renderList(); refreshNote(); }
    if(e.target.classList && e.target.classList.contains('newfolder') && S.adding === 'folder') addFolder(e.target.value);
  });
  document.addEventListener('paste', function(e){ if(e.target.id === 'ttl'){ e.preventDefault(); document.execCommand('insertText', false, (e.clipboardData.getData('text/plain') || '').replace(/\s+/g, ' ')); } });
  $('#file').addEventListener('change', function(e){ importFile(e.target.files[0]); e.target.value = ''; });
  window.addEventListener('hashchange', route);
  wide.addEventListener('change', function(){ render(); });
  // out of sight: a locked note that is open locks again, and anything typed is written
  document.addEventListener('visibilitychange', function(){ if(document.hidden){ flush(); relock(); } });
  window.addEventListener('pagehide', function(){ flush(); });
  // another tab changed something: draw the lists again, and the note too unless you are typing in it
  N.on(function(what){
    if(!what.remote) return;
    renderList();
    if(S.open && !N.note(S.open)){ S.key = null; S.plain = null; show(null); }
    else if(!$('#note').contains(document.activeElement)) { var n = N.note(S.open); if(n && !(n.lock && S.plain !== null)) renderNote(); }
  });

  // ---------- starting ----------
  function welcome(){
    N.add({ title: 'Welcome to Sleeky Notes', icon: 'star', color: '#F5A80C', pin: true, body:
      '<div>Jot something down in the box at the foot of your notes and press return. It is kept at once.</div><div><br></div>' +
      '<div class="ck" data-done="1">Open a note</div><div class="ck" data-done="0">Tap its icon to choose another</div><div class="ck" data-done="0">Pin it, tag it, or move it to a folder</div>' +
      '<div class="ck" data-done="0">Lock a note you want kept private</div><div><br></div><div>A locked note shows only its <b>title and icon</b> until you unlock it.</div>' });
  }
  N.ready().then(function(){ return V.can ? V.canBio() : false; }).then(function(bio){
    S.bio = bio;
    var first = false; try { first = !localStorage.getItem('sleek-notes-begun'); localStorage.setItem('sleek-notes-begun', '1'); } catch(e){}
    if(first && !N.notes().length) welcome();
    $('#send').innerHTML = ic('up'); $('#searchic').innerHTML = ic('search'); $('#newbtn').innerHTML = ic('plus');
    renderList(); route();
    if(wide.matches && !S.open && N.notes().length){ var top = N.notes().filter(function(n){ return n.pin; })[0] || N.notes()[0]; try { history.replaceState(null, '', '#n/' + top.id); } catch(e){} show(top.id); }
    setTimeout(function(){ de.classList.remove('booting'); }, 30);
  }).catch(function(e){
    console.error(e); de.classList.remove('booting');
    $('#rows').innerHTML = '<div class="empty">Sleeky Notes could not open its storage in this browser. A private window can cause this.</div>';
  });

  // the offline cache (sw.js): on for the hosted site; on a local server only when asked for (localStorage sleek-sw = 1)
  if('serviceWorker' in navigator && /^https?:$/.test(location.protocol)){
    var local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname), on = !local;
    try { if(localStorage.getItem('sleek-sw') === '1') on = true; } catch(e){}
    if(on) window.addEventListener('load', function(){ navigator.serviceWorker.register('sw.js').catch(function(){}); });
  }
  window.SleekNotesApp = { state: S };      // for the checks
})();

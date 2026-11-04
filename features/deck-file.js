/* The deck's Share menu (the bar's share icon): rename the deck, duplicate it, download it as a
   .sleek file to keep or send, or publish it as one web page anyone can open, with nothing to install. */
(function(){
  var D = window.Deck, S = window.SleekStore, P = window.SleekPublish, info = window.SLEEK_DECK;
  if(!D || !S || !P || !info || info.published || D.popout) return;
  var full = document.getElementById('full');
  if(!full) return;

  var ICON = {
    share: '<path d="M12 3.5v11"/><path d="m7.5 8 4.5-4.5L16.5 8"/><path d="M5 12.5v6.5a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5v-6.5"/>',
    rename: '<path d="M4 7V5h16v2"/><path d="M12 5v14"/><path d="M9 19h6"/>',
    dup: '<rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    file: '<path d="M6 2.5h8.5L19 7v14.5H6Z"/><path d="M14 2.5V7.5h5"/><path d="M12.5 11v6"/><path d="m10 14.5 2.5 2.5 2.5-2.5"/>',
    folder: '<path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4.4l2 2.2h8.6A1.5 1.5 0 0 1 21 9.7v8.8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5Z"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18"/>'
  };
  function ico(k, cls){ return '<svg class="' + (cls || 'ico') + '" viewBox="0 0 24 24" aria-hidden="true">' + ICON[k] + '</svg>'; }

  var btn = document.createElement('button');
  btn.id = 'filebtn'; btn.type = 'button'; btn.className = 'ibtn icon-only';
  btn.setAttribute('aria-label', 'Share'); btn.setAttribute('aria-haspopup', 'true'); btn.setAttribute('aria-expanded', 'false');
  btn.setAttribute('data-tt', 'Share');
  btn.innerHTML = ico('share');
  var wrap = document.createElement('div'); wrap.className = 'df-wrap';
  full.parentNode.insertBefore(wrap, full);
  wrap.appendChild(btn);

  var pop = document.createElement('div');
  pop.className = 'df-pop'; pop.hidden = true; pop.setAttribute('role', 'menu'); pop.setAttribute('aria-label', 'Share');
  pop.innerHTML =
    '<div class="df-head"><span class="df-k">This deck</span>' +
      '<div class="df-title"><input id="df-name" type="text" spellcheck="false" aria-label="Deck name" maxlength="120"></div>' +
      '<span class="df-sub" id="df-sub">Saved in this browser</span></div>' +
    '<button type="button" class="df-item" data-act="dup" role="menuitem">' + ico('dup', 'df-ico') +
      '<span><b>Duplicate deck</b><i>A copy to try something on</i></span></button>' +
    '<button type="button" class="df-item" data-act="file" role="menuitem">' + ico('file', 'df-ico') +
      '<span><b>Download .sleek file</b><i>Keep it, send it, open it in any browser</i></span></button>' +
    '<button type="button" class="df-item" data-act="pub" role="menuitem">' + ico('globe', 'df-ico') +
      '<span><b>Publish as a web page</b><i>One file that plays anywhere, nothing to install</i></span></button>' +
    '<button type="button" class="df-item df-folder" data-act="folder" role="menuitem" hidden>' + ico('folder', 'df-ico') +
      '<span><b></b><i></i></span></button>' +
    '<div class="df-foot" id="df-foot" aria-live="polite"></div>';
  wrap.appendChild(pop);
  var name = pop.querySelector('#df-name'), sub = pop.querySelector('#df-sub'), foot = pop.querySelector('#df-foot');
  // the linked folder (core/folder.js): where it saves, or a way to link one
  var F = window.SleekFolder, fItem = pop.querySelector('.df-folder');
  function paintFolder(st){
    if(!F || !st.supported){ fItem.hidden = true; return; }
    fItem.hidden = false; fItem.classList.toggle('on', st.ok); fItem.classList.toggle('warn', st.needsReconnect);
    fItem.querySelector('b').textContent = !st.linked ? 'Link a folder…' : st.ok ? 'Saving to ' + st.name : 'Reconnect ' + st.name;
    fItem.querySelector('i').textContent = !st.linked ? 'Keep a .sleek copy of every deck there, as you work' : st.ok ? 'A copy lands there a moment after each change' : 'The browser needs your OK again to save there';
  }
  if(F) F.onChange(paintFolder);

  function ago(t){
    var s = Math.max(0, (Date.now() - t) / 1000);
    if(s < 45) return 'just now';
    if(s < 3600) return Math.round(s / 60) + ' min ago';
    if(s < 86400) return Math.round(s / 3600) + ' h ago';
    return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  function open(){
    pop.hidden = false; btn.setAttribute('aria-expanded', 'true'); foot.textContent = '';
    name.value = info.title || '';
    S.get(info.id).then(function(d){ if(d) sub.textContent = 'Saved in this browser · edited ' + ago(d.updated); });
    requestAnimationFrame(function(){ pop.classList.add('in'); });
    setTimeout(function(){ pop.classList.add('in'); }, 30);
  }
  function close(){ pop.classList.remove('in'); pop.hidden = true; btn.setAttribute('aria-expanded', 'false'); }
  btn.addEventListener('click', function(e){ e.stopPropagation(); if(pop.hidden) open(); else close(); });
  document.addEventListener('pointerdown', function(e){ if(!pop.hidden && !wrap.contains(e.target)) close(); });
  document.addEventListener('keydown', function(e){ if(e.key === 'Escape' && !pop.hidden){ e.stopPropagation(); close(); btn.focus(); } }, true);
  // typing in the name never reaches the deck's keys
  ['keydown', 'keyup', 'keypress'].forEach(function(t){ name.addEventListener(t, function(e){ if(e.key !== 'Escape') e.stopPropagation(); }); });

  function rename(){
    var t = name.value.trim();
    if(!t){ name.value = info.title; return; }
    if(t === info.title) return;
    info.title = t; document.title = t + ' · Sleek';
    S.rename(info.id, t).then(function(){ sub.textContent = 'Renamed'; });
  }
  name.addEventListener('change', rename);
  name.addEventListener('keydown', function(e){ if(e.key === 'Enter'){ e.preventDefault(); rename(); name.blur(); } });

  function busy(item, text){
    item.classList.add('busy'); foot.textContent = text;
    return function(msg){ item.classList.remove('busy'); foot.textContent = msg || ''; };
  }
  pop.addEventListener('click', function(e){
    var item = e.target.closest('.df-item'); if(!item || item.classList.contains('busy')) return;
    var act = item.getAttribute('data-act');
    var flushed = D.flush ? D.flush() : Promise.resolve();
    if(act === 'dup'){
      var done = busy(item, 'Copying…');
      flushed.then(function(){ return S.duplicate(info.id); }).then(function(copy){
        done(); location.href = 'deck.html?d=' + copy.id;
      }, function(err){ console.error(err); done('Couldn’t copy the deck.'); });
    } else if(act === 'file'){
      var done2 = busy(item, 'Packing the deck and its media…');
      flushed.then(function(){ return P.exportFile(info.id); }).then(function(n){
        done2('Downloaded ' + n + '. Open it from the start screen in any browser.');
      }, function(err){ console.error(err); done2('Couldn’t make the file.'); });
    } else if(act === 'folder'){
      var st = F.status();
      if(st.ok){ var done4 = busy(item, 'Saving…'); flushed.then(function(){ return F.write(info.id); }).then(function(){ done4('Saved to ' + st.name + '.'); }); return; }
      (st.linked ? F.reconnect() : F.link()).then(function(s2){ if(s2.ok) foot.textContent = 'Saving to ' + s2.name + '.'; }, function(e){ if(e && e.name !== 'AbortError') foot.textContent = 'Couldn’t link that folder.'; });
    } else if(act === 'pub'){
      var done3 = busy(item, 'Building the page…');
      flushed.then(function(){ return P.publish(info.id); }).then(function(r){
        var mb = r.html.length / 1048576;
        done3('Downloaded ' + r.name + (mb >= 0.1 ? ' (' + mb.toFixed(1) + ' MB)' : '') + '. Send it, or put it on any web host.');
      }, function(err){ console.error(err); done3('Couldn’t build the page.'); });
    }
  });
})();

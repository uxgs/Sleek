/* Before and after pictures in the editor.

   The block is a `compare` node (doc/schema.js): attrs.before and attrs.after are the two pictures
   (kept in the picture store, like any picture: doc/blocks-figure.js), attrs.mode is 'slider' or
   'side'. A new block shows two empty halves; press one (or drop a picture on it) to fill it. With
   both in, it is the slider (doc/compare.js). Its controls switch between the slider and side by
   side, swap the two pictures, and remove the block. */
(function(){
  var PM = window.SleekPM, K = window.SleekDocKit, A = window.SleekDoc, S = window.SleekStore, C = window.SleekCompare;
  if(!PM || !K || !A || !S || !C) return;
  var N = K.N;
  function pickFile(done){ var i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'; i.addEventListener('change', function(){ if(i.files[0]) done(i.files[0]); }); i.click(); }
  K.compareView = function(node, view, getPos){
    var el = document.createElement('div'); el.contentEditable = 'false';
    function set(attrs){ var p = getPos(), n = view.state.doc.nodeAt(p); if(n) view.dispatch(view.state.tr.setNodeMarkup(p, null, Object.assign({}, n.attrs, attrs))); }
    function fill(which, file){
      if(!/^image\//.test(file.type)){ A.toast('That isn’t a picture.'); return; }
      el.classList.add('busy');
      (K.keepPicture ? K.keepPicture(file) : S.addMedia(file)).then(function(url){ el.classList.remove('busy'); if(url){ var a = {}; a[which] = url; set(a); } else A.toast('That picture couldn’t be read.'); });
    }
    function build(n){
      node = n; el.className = 'dk-compare'; el.setAttribute('data-mode', n.attrs.mode); el.removeAttribute('role'); el.removeAttribute('tabindex'); el.innerHTML = '';
      [['before', 'cmp-b', 'Before'], ['after', 'cmp-a', 'After']].forEach(function(s){
        var f = document.createElement('figure'); f.className = s[1];
        if(n.attrs[s[0]]){ var img = document.createElement('img'); img.src = n.attrs[s[0]]; img.alt = s[2]; img.draggable = false; f.appendChild(img); var c = document.createElement('figcaption'); c.textContent = s[2]; f.appendChild(c); }
        else {
          var b = document.createElement('button'); b.type = 'button'; b.className = 'cmp-slot'; b.innerHTML = '<b>＋ ' + s[2] + '</b><span>Choose a picture, or drop one here</span>';
          b.addEventListener('click', function(){ if(!A.locked()) pickFile(function(file){ fill(s[0], file); }); });
          b.addEventListener('dragover', function(e){ e.preventDefault(); e.stopPropagation(); b.classList.add('over'); }); b.addEventListener('dragleave', function(){ b.classList.remove('over'); });
          b.addEventListener('drop', function(e){ e.preventDefault(); e.stopPropagation(); b.classList.remove('over'); var file = e.dataTransfer && e.dataTransfer.files[0]; if(file) fill(s[0], file); });
          f.appendChild(b);
        }
        el.appendChild(f);
      });
      var both = n.attrs.before && n.attrs.after; el.classList.toggle('cmp-empty', !both);
      if(both) C.mount(el, { noToggle: true });
      var tools = document.createElement('div'); tools.className = 'dk-fig-tools';
      tools.innerHTML = (both ? '<button type="button" data-do="mode">' + (n.attrs.mode === 'side' ? 'Slider' : 'Side by side') + '</button><button type="button" data-do="swap">Swap</button>' : '') + '<button type="button" data-do="del">Remove</button>';
      tools.addEventListener('pointerdown', function(e){ e.stopPropagation(); }); tools.addEventListener('mousedown', function(e){ e.preventDefault(); e.stopPropagation(); });
      tools.addEventListener('click', function(e){
        var b = e.target.closest('[data-do]'); if(!b || A.locked()) return; var what = b.getAttribute('data-do');
        if(what === 'mode') set({ mode: node.attrs.mode === 'side' ? 'slider' : 'side' });
        else if(what === 'swap') set({ before: node.attrs.after, after: node.attrs.before });
        else { var p = getPos(); view.dispatch(view.state.tr.delete(p, p + node.nodeSize)); view.focus(); }
      });
      el.appendChild(tools);
    }
    build(node);
    return { dom: el, update: function(n){ if(n.type !== N.compare) return false; if(n.attrs.before !== node.attrs.before || n.attrs.after !== node.attrs.after || n.attrs.mode !== node.attrs.mode) build(n); else node = n; return true; },
             stopEvent: function(){ return true; }, ignoreMutation: function(){ return true; } };
  };
  K.newCompare = function(){ return N.compare.create(); };
})();

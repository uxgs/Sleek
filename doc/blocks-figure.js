/* Pictures in a page: choosing, dropping or pasting one, and the picture block itself.

   A picture is a `figure` block (doc/schema.js): attrs.src is the picture, attrs.size is 'text' (as
   wide as the words), 'wide' or 'full', and the block's own text is the caption. The file goes into the
   picture store (core/store.js addMedia), so the page keeps a short reference, not the picture.
   Big photos are scaled to 2400 px on the long edge first. A picture pasted by address (from a web
   page) is fetched and kept too when its site allows that; otherwise it stays a link to that site. */
(function(){
  var PM = window.SleekPM, K = window.SleekDocKit, S = window.SleekStore; if(!PM || !K || !S) return;
  var N = K.N, MAX = 2400;
  function toast(m){ if(window.SleekDoc) window.SleekDoc.toast(m); }
  function images(list){ return Array.prototype.filter.call(list || [], function(f){ return /^image\//.test(f.type); }); }

  // a photo bigger than MAX on its long edge comes back smaller; anything else comes back as it is
  function fit(file){
    if(!/^image\/(jpeg|png|webp)$/.test(file.type) || !window.createImageBitmap) return Promise.resolve(file);
    return createImageBitmap(file).then(function(bmp){
      var k = MAX / Math.max(bmp.width, bmp.height); if(k >= 1){ if(bmp.close) bmp.close(); return file; }
      var c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height); if(bmp.close) bmp.close();
      return new Promise(function(ok){ c.toBlob(function(b){ ok(b || file); }, file.type, 0.9); });
    }, function(){ return file; });
  }
  function keep(file){ return fit(file).then(function(b){ return S.addMedia(b); }); }

  // put these picture files into the page: at pos (between blocks) if given, else where the cursor is
  function addPictures(view, files, pos){
    var list = images(files); if(!list.length) return false;
    Promise.all(list.map(keep)).then(function(urls){
      urls = urls.filter(Boolean); if(!urls.length){ toast('That picture couldn’t be read.'); return; }
      var nodes = urls.map(function(u){ return N.figure.create({ src: u }); });
      if(pos == null){ nodes.forEach(function(n){ window.SleekDoc.insertBlock(n); }); return; }
      var tr = view.state.tr, at = Math.min(pos, tr.doc.content.size); nodes.forEach(function(n){ tr.insert(at, n); at += n.nodeSize; });
      if(at >= tr.doc.content.size) tr.insert(at, N.paragraph.create());
      view.dispatch(tr.scrollIntoView());
    }).catch(function(e){ console.error(e); toast('That picture couldn’t be added.'); });
    return true;
  }
  // a paste that is only a picture (a screenshot, a copied image): add it as one
  function pastePictures(view, e){
    var cd = e.clipboardData; if(!cd) return false;
    var list = images(cd.files); if(!list.length) return false;
    if((cd.getData('text/plain') || '').trim()) return false;      // words came too: let the normal paste handle it
    e.preventDefault(); return addPictures(view, list);
  }
  function dropPictures(view, e){
    var list = images(e.dataTransfer && e.dataTransfer.files); if(!list.length) return false;
    e.preventDefault();
    var hit = view.posAtCoords({ left: e.clientX, top: e.clientY }), pos = null;
    if(hit){ var $p = view.state.doc.resolve(hit.pos); pos = $p.depth ? $p.after(1) : hit.pos; }
    return addPictures(view, list, pos);
  }
  // after a paste: pictures that came as an address or as inline data are fetched into the picture store
  function localize(view){
    var todo = {};
    view.state.doc.descendants(function(n){ if(n.type === N.figure && /^(https?:|data:image\/)/i.test(n.attrs.src)) todo[n.attrs.src] = 1; });
    Object.keys(todo).forEach(function(src){
      fetch(src).then(function(r){ if(!r.ok) throw 0; return r.blob(); }).then(function(b){ if(!/^image\//.test(b.type)) throw 0; return keep(b); }).then(function(url){
        if(!url) return; var tr = view.state.tr;
        view.state.doc.descendants(function(n, pos){ if(n.type === N.figure && n.attrs.src === src) tr.setNodeMarkup(pos, null, Object.assign({}, n.attrs, { src: url })); });
        if(tr.docChanged) view.dispatch(tr.setMeta('addToHistory', false));
      }).catch(function(){});      // its site won't hand it over: it stays a link to that site
    });
  }

  // the picture block on the page: the picture, two small controls, and the caption you can type in
  function figureView(node, view, getPos){
    var fig = document.createElement('figure'), img = document.createElement('img'), cap = document.createElement('figcaption'), tools = document.createElement('div');
    img.alt = ''; img.draggable = false; img.contentEditable = 'false'; tools.className = 'dk-fig-tools'; tools.contentEditable = 'false';
    var size = document.createElement('button'), del = document.createElement('button'); size.type = del.type = 'button'; del.textContent = 'Remove';
    tools.appendChild(size); tools.appendChild(del); fig.appendChild(img); fig.appendChild(tools); fig.appendChild(cap);
    function paint(n){
      node = n; fig.className = 'dk-fig' + (n.attrs.size === 'wide' ? ' dk-wide' : n.attrs.size === 'full' ? ' dk-full' : '') + (n.content.size ? '' : ' nocap');
      if(img.getAttribute('src') !== n.attrs.src) img.setAttribute('src', n.attrs.src);
      size.textContent = n.attrs.size === 'wide' ? 'Full width' : n.attrs.size === 'full' ? 'Text width' : 'Wide';
    }
    paint(node);
    img.addEventListener('mousedown', function(e){ e.preventDefault(); view.dispatch(view.state.tr.setSelection(PM.state.NodeSelection.create(view.state.doc, getPos()))); view.focus(); });
    tools.addEventListener('mousedown', function(e){ e.preventDefault(); });
    size.addEventListener('click', function(){ view.dispatch(view.state.tr.setNodeMarkup(getPos(), null, Object.assign({}, node.attrs, { size: node.attrs.size === 'wide' ? 'full' : node.attrs.size === 'full' ? 'text' : 'wide' }))); });
    del.addEventListener('click', function(){ var p = getPos(); view.dispatch(view.state.tr.delete(p, p + node.nodeSize)); view.focus(); });
    return { dom: fig, contentDOM: cap,
      update: function(n){ if(n.type !== N.figure) return false; paint(n); return true; },
      stopEvent: function(e){ return tools.contains(e.target); },
      ignoreMutation: function(m){ return !cap.contains(m.target) || m.target === fig; } };
  }

  K.keepPicture = keep; K.addPictures = addPictures; K.pastePictures = pastePictures; K.dropPictures = dropPictures; K.localize = localize; K.figureView = figureView;
})();

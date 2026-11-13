/* Opening a file as a new page (the Docs start screen: Open a file, or drop one on it).

     .sleek            a page saved from Sleek Docs (Share > Download a copy): comes back exactly
     .md, .markdown    Markdown: headings, lists, checklists ("- [ ] "), quotes, code, tables, links
     .txt              plain text: each blank-line-separated block is a paragraph
     .docx             a Word file: headings, lists, tables, links, bold and italic, and its pictures
                       (read by mammoth, vendor/mammoth.js; what Word calls a style, mammoth turns
                       into plain HTML, and from there it is read like everything else)

   Markdown is turned into HTML by markdown-it (vendor/markdown-it.js) and then read by the editor's
   own rules, the same way a paste is, so only what a page can hold gets in. The editor engine and
   markdown-it are loaded here only when a Markdown or text file is opened.

   SleekDocImport.file(file, folder) -> the new page's record */
(function(){
  var D = window.SleekDocs; if(!D) return;
  var loaded = {};
  function need(src){
    if(loaded[src]) return loaded[src];
    return loaded[src] = new Promise(function(ok, no){ var s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = function(){ delete loaded[src]; no(new Error('Could not load ' + src + '. Check your connection.')); }; document.head.appendChild(s); });
  }
  function kit(){
    return (window.SleekPM ? Promise.resolve() : need('vendor/prosemirror.js'))
      .then(function(){ return window.SleekDocKit ? null : need('doc/schema.js'); })
      .then(function(){ return window.SleekMD ? null : need('vendor/markdown-it.js'); });
  }
  function esc(s){ return String(s).replace(/[&<>]/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }
  // HTML -> a page's document, by the page's own rules
  function fromHTML(html){
    var K = window.SleekDocKit, box = document.createElement('div'); box.innerHTML = html;
    // "- [ ] item" lists are checklists
    Array.prototype.forEach.call(box.querySelectorAll('ul'), function(ul){
      var lis = Array.prototype.filter.call(ul.children, function(c){ return c.tagName === 'LI'; }), re = /^\s*\[( |x|X)\]\s+/;
      if(!lis.length || !lis.every(function(li){ return re.test(li.textContent); })) return;
      ul.className = 'dk-tasks';
      lis.forEach(function(li){
        var m = re.exec(li.textContent); li.className = 'dk-task' + (m[1] === ' ' ? '' : ' done');
        var w = document.createTreeWalker(li, NodeFilter.SHOW_TEXT), t = w.nextNode(); if(t) t.nodeValue = t.nodeValue.replace(re, '');
      });
    });
    // a picture the file points to on its own disk can't be found from here
    Array.prototype.forEach.call(box.querySelectorAll('img'), function(i){ if(!/^(https?:|data:image\/)/i.test(i.getAttribute('src') || '')) i.remove(); });
    var doc = window.SleekPM.model.DOMParser.fromSchema(K.schema).parse(box);
    return doc.toJSON();
  }
  // a Word file -> HTML, with its pictures inside as data
  function word(file){
    return (window.SleekPM ? Promise.resolve() : need('vendor/prosemirror.js')).then(function(){ return window.SleekDocKit ? null : need('doc/schema.js'); })
      .then(function(){ return window.mammoth ? null : need('vendor/mammoth.js'); })
      .then(function(){ return new Promise(function(ok, no){ var r = new FileReader(); r.onload = function(){ ok(r.result); }; r.onerror = function(){ no(new Error('That file couldn’t be read.')); }; r.readAsArrayBuffer(file); }); })
      .then(function(buf){
        var M = window.mammoth;
        return M.convertToHtml({ arrayBuffer: buf }, { convertImage: M.images.imgElement(function(image){ return image.read('base64').then(function(b64){ return { src: 'data:' + image.contentType + ';base64,' + b64 }; }); }) });
      }).then(function(r){ return r.value || ''; }, function(e){ throw new Error(/zip|central directory|docx/i.test(String(e && e.message)) ? 'That doesn’t look like a Word (.docx) file.' : (e && e.message) || 'That Word file couldn’t be opened.'); });
  }
  function make(doc, name, folder){
    var first = doc.content && doc.content[0];
    // a file with no heading of its own takes its name as the title
    if(!first || first.type !== 'heading'){ (doc.content = doc.content || []).unshift({ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: name.replace(/\.[a-z0-9]+$/i, '') || 'Untitled' }] }); }
    return D.create({ seed: { kind: 'doc', v: 1, theme: {}, doc: doc }, folder: folder || null });
  }
  function text(file){ return new Promise(function(ok, no){ var r = new FileReader(); r.onload = function(){ ok(String(r.result)); }; r.onerror = function(){ no(new Error('That file couldn’t be read.')); }; r.readAsText(file); }); }
  function file(f, folder){
    var name = f.name || '', ext = (/\.([a-z0-9]+)$/i.exec(name) || [])[1] || '';
    ext = ext.toLowerCase();
    if(ext === 'docx') return word(f).then(function(html){ return make(fromHTML(html), name, folder); });
    if(ext === 'doc') return Promise.reject(new Error('That is an old Word file (.doc). Save it as .docx in Word, then open that.'));
    return text(f).then(function(t){
      if(ext === 'sleek' || ext === 'json') return D.importDoc(t, folder);
      if(ext !== 'md' && ext !== 'markdown' && ext !== 'txt' && ext !== 'text' && ext !== '') throw new Error('Sleek Docs opens .sleek, Word (.docx), Markdown and text files.');
      return kit().then(function(){
        var html = ext === 'txt' || ext === 'text'
          ? t.split(/\n\s*\n/).map(function(p){ return '<p>' + esc(p.trim()).replace(/\n/g, '<br>') + '</p>'; }).join('')
          : window.SleekMD({ html: false, linkify: true }).render(t);
        return make(fromHTML(html), name, folder);
      });
    });
  }
  window.SleekDocImport = { file: file, fromHTML: fromHTML, kit: kit };
})();

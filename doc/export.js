/* Save as Markdown (Share): the page as plain text other writing apps open.

   Headings, lists, checklists, quotes, code, dividers, links, bold, italic, strike and tables are
   written the usual Markdown way; underline and highlight, which Markdown has no marks for, as
   <u> and <mark>. A page with pictures is saved as a .zip: the .md beside an images folder it
   points into. The zip is written here (stored, not squeezed: pictures are already compressed).

   SleekDocKit.toMarkdown(doc) -> { md, pics: [{ name, src }] };  SleekDocKit.saveMarkdown() */
(function(){
  var K = window.SleekDocKit, A = window.SleekDoc; if(!K) return;
  var N = K.N;
  function esc(s){ return s.replace(/([\\`*_\[\]])/g, '\\$1'); }
  function inline(node){
    var out = '';
    node.forEach(function(c){
      if(c.type === N.hard_break){ out += '  \n'; return; }
      if(!c.isText) return;
      var names = c.marks.map(function(m){ return m.type.name; }), t = names.indexOf('code') >= 0 ? '`' + c.text.replace(/`/g, 'ˋ') + '`' : esc(c.text);
      var lead = /^\s*/.exec(t)[0], tail = /\s*$/.exec(t)[0]; t = t.trim(); if(!t){ out += lead || tail; return; }
      if(names.indexOf('strike') >= 0) t = '~~' + t + '~~';
      if(names.indexOf('em') >= 0) t = '*' + t + '*';
      if(names.indexOf('strong') >= 0) t = '**' + t + '**';
      if(names.indexOf('underline') >= 0) t = '<u>' + t + '</u>';
      if(names.indexOf('highlight') >= 0) t = '<mark>' + t + '</mark>';
      c.marks.forEach(function(m){ if(m.type.name === 'link') t = '[' + t + '](' + m.attrs.href.replace(/[()\s]/g, encodeURIComponent) + ')'; });
      out += lead + t + tail;
    });
    return out;
  }
  function toMarkdown(doc){
    var pics = [];
    function pad(s, by){ return s.split('\n').map(function(l, i){ return (i ? by : '') + l; }).join('\n'); }
    function blocks(node){ var a = []; node.forEach(function(c){ var s = block(c); if(s != null) a.push(s); }); return a.join('\n\n'); }
    function items(node, mark){
      var a = []; node.forEach(function(li, _, i){ var m = mark(li, i); a.push(m + pad(blocks(li), new Array(m.length + 1).join(' '))); }); return a.join('\n');
    }
    function block(n){
      switch(n.type){
        case N.paragraph: return inline(n);
        case N.heading: return new Array(n.attrs.level + 1).join('#') + ' ' + inline(n);
        case N.blockquote: return blocks(n).split('\n').map(function(l){ return l ? '> ' + l : '>'; }).join('\n');
        case N.code_block: return '```\n' + n.textContent + '\n```';
        case N.horizontal_rule: return '---';
        case N.bullet_list: return items(n, function(){ return '- '; });
        case N.ordered_list: return items(n, function(li, i){ return (i + 1) + '. '; });
        case N.task_list: return items(n, function(li){ return li.attrs.done ? '- [x] ' : '- [ ] '; });
        case N.figure:
          var src = n.attrs.src, name = src;
          if(!/^https?:/i.test(src)){ name = 'images/picture-' + (pics.length + 1); pics.push({ name: name, src: src }); }
          return '![' + n.textContent.replace(/[\[\]]/g, '') + '](' + name + ')' + (n.content.size ? '\n\n*' + inline(n) + '*' : '');
        case N.table:
          var rows = []; n.forEach(function(r){ var cells = []; r.forEach(function(c){ cells.push(blocks(c).replace(/\n+/g, '<br>').replace(/\|/g, '\\|') || ' '); }); rows.push('| ' + cells.join(' | ') + ' |'); });
          if(rows.length) rows.splice(1, 0, '|' + new Array(n.firstChild.childCount + 1).join(' --- |'));
          return rows.join('\n');
      }
      return n.isTextblock ? inline(n) : null;
    }
    return { md: blocks(doc).replace(/\n{3,}/g, '\n\n').trim() + '\n', pics: pics };
  }

  // ---------- a small zip writer (no compression) ----------
  var CRC = (function(){ var t = [], c, n, k; for(n = 0; n < 256; n++){ c = n; for(k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc(u8){ var c = 0xFFFFFFFF; for(var i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  function zip(files){      // files: [{ name, data: Uint8Array }]
    var enc = new TextEncoder(), parts = [], central = [], off = 0;
    files.forEach(function(f){
      var name = enc.encode(f.name), sum = crc(f.data), head = new DataView(new ArrayBuffer(30)), dir = new DataView(new ArrayBuffer(46));
      head.setUint32(0, 0x04034b50, true); head.setUint16(4, 20, true); head.setUint16(6, 0x0800, true); head.setUint32(14, sum, true); head.setUint32(18, f.data.length, true); head.setUint32(22, f.data.length, true); head.setUint16(26, name.length, true);
      dir.setUint32(0, 0x02014b50, true); dir.setUint16(4, 20, true); dir.setUint16(6, 20, true); dir.setUint16(8, 0x0800, true); dir.setUint32(16, sum, true); dir.setUint32(20, f.data.length, true); dir.setUint32(24, f.data.length, true); dir.setUint16(28, name.length, true); dir.setUint32(42, off, true);
      parts.push(head, name, f.data); central.push(dir, name); off += 30 + name.length + f.data.length;
    });
    var size = central.reduce(function(n, p){ return n + p.byteLength; }, 0), end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, size, true); end.setUint32(16, off, true);
    return new Blob(parts.concat(central, [end]), { type: 'application/zip' });
  }
  var EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif', 'image/webp': '.webp', 'image/svg+xml': '.svg', 'image/avif': '.avif' };
  function saveMarkdown(){
    var m = A.meta(), name = A.fileName(A.title()), out = toMarkdown(A.view.state.doc);
    if(!out.pics.length){ A.saveFile(name + '.md', new Blob([out.md], { type: 'text/markdown' })); return Promise.resolve(); }
    return Promise.all(out.pics.map(function(p){ return fetch(p.src).then(function(r){ return r.blob(); }).then(function(b){ return b.arrayBuffer().then(function(buf){ return { from: p.name, name: p.name + (EXT[b.type] || ''), data: new Uint8Array(buf) }; }); }, function(){ return null; }); }))
      .then(function(files){
        var md = out.md; files = files.filter(Boolean); files.forEach(function(f){ md = md.split('](' + f.from + ')').join('](' + f.name + ')'); });
        A.saveFile(name + '.zip', zip([{ name: name + '.md', data: new TextEncoder().encode(md) }].concat(files)));
        A.toast('Saved as a zip: the page and its pictures');
      });
  }
  K.toMarkdown = toMarkdown; K.zip = zip; K.saveMarkdown = saveMarkdown;
})();

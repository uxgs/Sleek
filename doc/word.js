/* Save as Word (Share): the page as a .docx file, written with the docx library (vendor/docx.js,
   loaded only when this is used).

   What Word has a real form for is written as that: headings, bold and the other marks, links,
   bullets, numbers, tables, pictures with their captions. The rest is put the nearest way Word can
   keep editable:
     checklist            lines starting ☐ or ☑
     quote, callout       indented text; a callout is tinted
     columns              a table with no lines, one cell per column
     cover                the short line, the title (Word's Title style) and the line below
     big numbers          a table with no lines: each number large, with what it is under it
     chart                a picture of the chart as it is drawn
     before and after     the two pictures next to each other, with their labels
   Collapsible headings become ordinary headings. Colours and type are Word's own.

   SleekDocKit.saveWord() */
(function(){
  var K = window.SleekDocKit, A = window.SleekDoc; if(!K || !A) return;
  var N = K.N, loading = null;
  function lib(){
    if(window.SleekDocx) return Promise.resolve(window.SleekDocx);
    if(!loading) loading = new Promise(function(ok, no){ var s = document.createElement('script'); s.src = 'vendor/docx.js'; s.onload = function(){ ok(window.SleekDocx); }; s.onerror = function(){ loading = null; no(new Error('offline')); }; document.head.appendChild(s); });
    return loading;
  }
  var WIDE = 600;      // the room across a Word page, in pixels
  // a picture as Word can hold it: PNG or JPEG bytes, and a size that fits the page
  function picture(src, max){
    return fetch(src).then(function(r){ return r.blob(); }).then(function(b){
      return createImageBitmap(b).then(function(bmp){
        var k = Math.min(1, (max || WIDE) / bmp.width), w = Math.round(bmp.width * k), h = Math.round(bmp.height * k), plain = /^image\/(png|jpeg)$/.test(b.type);
        if(plain) return b.arrayBuffer().then(function(buf){ if(bmp.close) bmp.close(); return { data: new Uint8Array(buf), type: b.type === 'image/png' ? 'png' : 'jpg', w: w, h: h }; });
        var c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height; c.getContext('2d').drawImage(bmp, 0, 0); if(bmp.close) bmp.close();
        return new Promise(function(ok){ c.toBlob(function(png){ png.arrayBuffer().then(function(buf){ ok({ data: new Uint8Array(buf), type: 'png', w: w, h: h }); }); }, 'image/png'); });
      });
    }).catch(function(){ return null; });
  }
  // a chart as it is drawn on the page, as a PNG: its colours are read from the page, since a picture has no stylesheet
  function chartPicture(id){
    var el = null; Array.prototype.forEach.call(A.view.dom.querySelectorAll('.dk-data'), function(d){ if(id && d.getAttribute('data-id') === id) el = d; });
    var svg = el && el.querySelector('svg'); if(!svg) return Promise.resolve(null);
    if(el.__redraw) el.__redraw();
    var copy = svg.cloneNode(true), from = svg.querySelectorAll('*'), to = copy.querySelectorAll('*');
    for(var i = 0; i < from.length; i++){ var cs = getComputedStyle(from[i]); ['fill', 'stroke', 'font-family', 'font-size', 'font-weight', 'opacity', 'stroke-width'].forEach(function(p){ to[i].style.setProperty(p, cs.getPropertyValue(p)); }); }
    copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg'); copy.setAttribute('width', '1280'); copy.setAttribute('height', '880');
    var url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(copy)], { type: 'image/svg+xml' }));
    return new Promise(function(ok){
      var img = new Image(); img.onload = function(){
        var c = document.createElement('canvas'); c.width = 1280; c.height = 880; var x = c.getContext('2d'); x.fillStyle = '#FFFFFF'; x.fillRect(0, 0, 1280, 880); x.drawImage(img, 0, 0, 1280, 880); URL.revokeObjectURL(url);
        c.toBlob(function(png){ png.arrayBuffer().then(function(buf){ ok({ data: new Uint8Array(buf), type: 'png', w: 520, h: 358 }); }); }, 'image/png');
      };
      img.onerror = function(){ URL.revokeObjectURL(url); ok(null); }; img.src = url;
    });
  }

  function build(X, doc){
    var jobs = [], lists = 0;
    var NONE = { style: X.BorderStyle.NONE, size: 0, color: 'FFFFFF' }, noLines = { top: NONE, bottom: NONE, left: NONE, right: NONE, insideHorizontal: NONE, insideVertical: NONE };
    function runs(node, extra){
      var out = [];
      node.forEach(function(c){
        if(c.type === N.hard_break){ out.push(new X.TextRun({ break: 1 })); return; }
        if(c.type === N.task_ref){ var k = K.taskPlain(c); out.push(new X.TextRun(Object.assign({ text: (k.done ? '☑ ' : '☐ ') + k.t }, extra || {}))); return; }
        if(!c.isText) return;
        var o = Object.assign({ text: c.text }, extra || {}), link = null;
        c.marks.forEach(function(m){
          var t = m.type.name;
          if(t === 'strong') o.bold = true; else if(t === 'em') o.italics = true; else if(t === 'underline') o.underline = {}; else if(t === 'strike') o.strike = true;
          else if(t === 'highlight') o.highlight = 'yellow'; else if(t === 'code') o.font = 'Courier New'; else if(t === 'link') link = K.safeHref(m.attrs.href);
        });
        if(link){ o.style = 'Hyperlink'; out.push(new X.ExternalHyperlink({ link: link, children: [new X.TextRun(o)] })); } else out.push(new X.TextRun(o));
      });
      return out;
    }
    function para(node, opts, extra){ return new X.Paragraph(Object.assign({ children: runs(node, extra), spacing: { after: 160 } }, opts || {})); }
    function image(p, opts){ return new X.Paragraph(Object.assign({ alignment: X.AlignmentType.CENTER, spacing: { after: 80 }, children: p ? [new X.ImageRun({ data: p.data, type: p.type, transformation: { width: p.w, height: p.h } })] : [new X.TextRun({ text: '[picture]', italics: true })] }, opts || {})); }
    function cell(children, opts){ return new X.TableCell(Object.assign({ children: children.length ? children : [new X.Paragraph('')], margins: { top: 80, bottom: 80, left: 110, right: 110 } }, opts || {})); }
    function grid(cells, plain){ return new X.Table({ width: { size: 100, type: X.WidthType.PERCENTAGE }, layout: X.TableLayoutType.FIXED, borders: plain ? noLines : undefined, rows: [new X.TableRow({ children: cells })] }); }
    // the blocks of a node, in order. Pictures arrive later, so a slot is left and filled when they do.
    function blocks(node, ctx){
      var out = []; ctx = ctx || {};
      node.forEach(function(n){
        switch(n.type){
          case N.paragraph: out.push(para(n, ctx.para)); break;
          case N.heading: out.push(para(n, { heading: [X.HeadingLevel.HEADING_1, X.HeadingLevel.HEADING_2, X.HeadingLevel.HEADING_3][n.attrs.level - 1], spacing: { before: 240, after: 120 } })); break;
          case N.blockquote: blocks(n, { para: { indent: { left: 500 }, border: { left: { style: X.BorderStyle.SINGLE, size: 12, color: '999999', space: 12 } } } }).forEach(function(b){ out.push(b); }); break;
          case N.callout: blocks(n, { para: { indent: { left: 200, right: 200 }, shading: { type: X.ShadingType.CLEAR, fill: 'EFEAFF', color: 'auto' } } }).forEach(function(b){ out.push(b); }); break;
          case N.code_block: n.textContent.split('\n').forEach(function(l){ out.push(new X.Paragraph({ children: [new X.TextRun({ text: l, font: 'Courier New', size: 20 })], shading: { type: X.ShadingType.CLEAR, fill: 'F1F1F5', color: 'auto' }, spacing: { after: 0 } })); }); out.push(new X.Paragraph('')); break;
          case N.horizontal_rule: out.push(new X.Paragraph({ border: { bottom: { style: X.BorderStyle.SINGLE, size: 6, color: 'BBBBBB', space: 1 } }, spacing: { after: 200 } })); break;
          case N.bullet_list: case N.ordered_list: case N.task_list: list(n, (ctx.level || 0), out); break;
          case N.figure:
            var slot = out.length; out.push(null); out.push(n.content.size ? para(n, { alignment: X.AlignmentType.CENTER, spacing: { after: 200 } }, { italics: true, size: 18, color: '666666' }) : new X.Paragraph(''));
            jobs.push(picture(n.attrs.src, ctx.narrow ? 260 : WIDE).then(function(p){ out[slot] = image(p); })); break;
          case N.table:
            var rows = []; n.forEach(function(r){ var cells = []; r.forEach(function(c){ cells.push(cell(blocks(c, { narrow: true }), c.type === N.table_header ? { shading: { type: X.ShadingType.CLEAR, fill: 'F1F1F5', color: 'auto' } } : null)); }); rows.push(new X.TableRow({ children: cells, tableHeader: r.firstChild.type === N.table_header })); });
            out.push(new X.Table({ width: { size: 100, type: X.WidthType.PERCENTAGE }, rows: rows })); out.push(new X.Paragraph('')); break;
          case N.columns: var cs = []; n.forEach(function(c){ cs.push(cell(blocks(c, { narrow: true }))); }); out.push(grid(cs, true)); out.push(new X.Paragraph('')); break;
          case N.cover:
            n.forEach(function(c, _, i){ if(!c.content.size) return; out.push(i === 1 ? para(c, { heading: X.HeadingLevel.TITLE, spacing: { after: 120 } }) : para(c, { spacing: { after: 120 } }, i === 0 ? { allCaps: true, size: 18, color: '666666' } : { size: 26, color: '444444' })); });
            out.push(new X.Paragraph({ border: { bottom: { style: X.BorderStyle.SINGLE, size: 8, color: '444444', space: 1 } }, spacing: { after: 280 } })); break;
          case N.data:
            if(n.attrs.kind === 'results'){
              var ds = window.SleekData ? window.SleekData.norm('results', n.attrs.ds) : (n.attrs.ds || { rows: [] });
              out.push(grid(ds.rows.map(function(r){ return cell([new X.Paragraph({ children: [new X.TextRun({ text: r.v, bold: true, size: 56 })], spacing: { after: 40 } }), new X.Paragraph({ children: [new X.TextRun({ text: r.l })], spacing: { after: 20 } })].concat(r.c ? [new X.Paragraph({ children: [new X.TextRun({ text: r.c, size: 18, color: '666666' })] })] : [])); }), true)); out.push(new X.Paragraph(''));
            } else { var at = out.length; out.push(null); jobs.push(chartPicture(n.attrs.id).then(function(p){ out[at] = image(p, { spacing: { after: 200 } }); })); }
            break;
          case N.tasks:      // the tasks as ticked and unticked lines, under the project's name
            var tp = K.tasksPlain(n);
            out.push(new X.Paragraph({ children: [new X.TextRun({ text: tp.name, bold: true })], spacing: { before: 120, after: 80 }, keepNext: true }));
            tp.groups.forEach(function(g){
              if(g.name) out.push(new X.Paragraph({ children: [new X.TextRun({ text: g.name, size: 18, color: '666666', allCaps: true })], spacing: { before: 80, after: 40 }, keepNext: true }));
              g.rows.forEach(function(t){ out.push(new X.Paragraph({ children: [new X.TextRun({ text: (t.done ? '☑ ' : '☐ ') + t.t })].concat(t.due ? [new X.TextRun({ text: '   ' + t.due, color: '666666', size: 18 })] : []), spacing: { after: 60 } })); });
            });
            out.push(new X.Paragraph('')); break;
          case N.compare:
            var two = [null, null], labels = ['Before', 'After'], g = out.length; out.push(null); out.push(new X.Paragraph(''));
            jobs.push(Promise.all([picture(n.attrs.before, 280), picture(n.attrs.after, 280)]).then(function(ps){
              out[g] = grid(ps.map(function(p, i){ return cell([image(p), new X.Paragraph({ alignment: X.AlignmentType.CENTER, children: [new X.TextRun({ text: labels[i], size: 18, color: '666666' })] })]); }), true); }));
            break;
          default: if(n.isTextblock) out.push(para(n));
        }
      });
      return out;
    }
    function list(n, level, out){
      var ref = n.type === N.ordered_list ? { reference: 'sleek-numbers', level: Math.min(level, 2), instance: ++lists } : null;
      n.forEach(function(item){
        var first = true;
        item.forEach(function(b){
          if(b.type === N.bullet_list || b.type === N.ordered_list || b.type === N.task_list){ list(b, level + 1, out); return; }
          if(b.type !== N.paragraph){ blocks({ forEach: function(fn){ fn(b); } }, { level: level + 1 }).forEach(function(x){ out.push(x); }); return; }
          var kids = runs(b);
          if(n.type === N.task_list) kids.unshift(new X.TextRun({ text: item.attrs.done ? '☑ ' : '☐ ' }));
          out.push(new X.Paragraph(Object.assign({ children: kids, spacing: { after: 60 } },
            n.type === N.task_list ? { indent: { left: 360 * (level + 1) - 360 } } : !first ? { indent: { left: 720 * (level + 1) } } : ref ? { numbering: ref } : { bullet: { level: Math.min(level, 2) } })));
          first = false;
        });
      });
      out.push(new X.Paragraph({ spacing: { after: 60 }, children: [] }));
    }
    var body = blocks(doc);
    return Promise.all(jobs).then(function(){
      var lv = function(l){ return { level: l, format: X.LevelFormat.DECIMAL, text: '%' + (l + 1) + '.', alignment: X.AlignmentType.START, style: { paragraph: { indent: { left: 720 * (l + 1), hanging: 360 } } } }; };
      return new X.Document({ creator: 'Sleek Docs', title: A.title(), numbering: { config: [{ reference: 'sleek-numbers', levels: [lv(0), lv(1), lv(2)] }] },
        styles: { default: { document: { run: { font: 'Calibri', size: 22 } } } }, sections: [{ children: body.filter(Boolean) }] });
    });
  }
  function saveWord(){
    A.toast('Making the Word file…');
    return A.flush().then(lib).then(function(X){ return build(X, A.view.state.doc).then(function(d){ return X.Packer.toBlob(d); }); }).then(function(blob){
      A.saveFile(A.fileName(A.title()) + '.docx', blob); A.toast('Saved as a Word file');
    }, function(e){ console.error(e); A.toast(e && e.message === 'offline' ? 'Saving as Word needs a connection the first time.' : 'The Word file couldn’t be made.'); });
  }
  K.saveWord = saveWord; K.wordBlob = function(){ return lib().then(function(X){ return build(X, A.view.state.doc).then(function(d){ return X.Packer.toBlob(d); }); }); };
})();

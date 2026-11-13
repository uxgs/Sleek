/* Charts and big numbers in the editor: the block on the page, and Edit data.

   The block is a `data` node (doc/schema.js): attrs.kind is 'results' (big numbers) or 'chart', and
   attrs.ds is what it shows, in the shape Sleek Slides uses (features/data-layout.js):
     results   { rows: [{ v, l, c, t }] }            a number, what it is, a change, and the change's tone
     chart     { type, rows: [[label, value]], hi, pre, post, anim }
   doc/data.js draws it. Pressing the block (or its Edit data button) opens a panel along the bottom
   of the window with one line per number or bar; every change shows on the page as you make it.
   Rows copied from a spreadsheet can be pasted into a chart's first box. */
(function(){
  var PM = window.SleekPM, K = window.SleekDocKit, A = window.SleekDoc, SD = window.SleekData, DD = window.SleekDocData;
  if(!PM || !K || !A || !SD || !DD) return;
  var N = K.N, main = document.getElementById('main');
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"]/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  var START = {
    results: { rows: [{ v: '72%', l: 'What this number is', c: '+8 points this year', t: 'good' }, { v: '1,240', l: 'A second number', c: '', t: 'plain' }, { v: '4.8', l: 'A third', c: '', t: 'plain' }] },
    chart: { type: 'bars', rows: [['Jan', 42], ['Feb', 48], ['Mar', 55], ['Apr', 61], ['May', 72], ['Jun', 86]], hi: 5, pre: '', post: '' }
  };
  K.newData = function(kind){ return N.data.create({ kind: kind, ds: SD.copy(START[kind]) }); };

  // where a block is now, by its id (the page may have changed since the panel opened)
  function find(id){ var hit = null; A.view.state.doc.descendants(function(n, pos){ if(hit) return false; if(n.type === N.data && n.attrs.id === id){ hit = { node: n, pos: pos }; return false; } }); return hit; }

  // ---------- the block ----------
  K.dataView = function(node, view, getPos){
    var el = document.createElement('div'), tools = document.createElement('div');
    el.className = 'dk-data'; el.contentEditable = 'false'; tools.className = 'dk-fig-tools';
    tools.innerHTML = '<button type="button" data-do="edit">Edit data</button><button type="button" data-do="del">Remove</button>';
    function paint(n){ node = n; el.setAttribute('data-id', n.attrs.id || ''); el.setAttribute('data-kind', n.attrs.kind); el.setAttribute('data-json', JSON.stringify(n.attrs.ds || null)); if(el.__redraw) el.__redraw(); }
    paint(node); DD.mount(el); el.appendChild(tools);
    el.addEventListener('mousedown', function(e){ if(tools.contains(e.target)) return; e.preventDefault(); view.dispatch(view.state.tr.setSelection(PM.state.NodeSelection.create(view.state.doc, getPos()))); view.focus(); });
    el.addEventListener('dblclick', function(){ if(!A.locked()) openEditor(node.attrs.id); });
    tools.addEventListener('mousedown', function(e){ e.preventDefault(); e.stopPropagation(); });
    tools.addEventListener('click', function(e){
      var b = e.target.closest('[data-do]'); if(!b || A.locked()) return;
      if(b.getAttribute('data-do') === 'edit') openEditor(node.attrs.id);
      else { closeEditor(); var p = getPos(); view.dispatch(view.state.tr.delete(p, p + node.nodeSize)); view.focus(); }
    });
    return { dom: el, update: function(n){ if(n.type !== N.data || n.attrs.kind !== node.attrs.kind) return false; if(n.attrs.ds !== node.attrs.ds || n.attrs.id !== node.attrs.id) paint(n); else node = n; return true; },
             stopEvent: function(e){ return tools.contains(e.target); }, ignoreMutation: function(){ return true; } };
  };

  // ---------- Edit data ----------
  var panel = null, editing = null;
  function closeEditor(){ if(panel){ panel.remove(); panel = null; } editing = null; }
  function write(ds){ var h = find(editing); if(!h) return closeEditor(); A.view.dispatch(A.view.state.tr.setNodeMarkup(h.pos, null, Object.assign({}, h.node.attrs, { ds: ds }))); }
  function openEditor(id){
    closeEditor(); if(A.closePop) A.closePop();
    var h = find(id); if(!h) return;
    editing = id; panel = document.createElement('div'); panel.className = 'de'; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Edit data'); main.appendChild(panel);
    draw(true);
  }
  function draw(focusFirst){
    var h = find(editing); if(!h){ closeEditor(); return; }
    // redrawing must not lose your place: remember which box had the cursor
    var was = panel.contains(document.activeElement) ? document.activeElement : null, wasRow = was && was.closest('[data-i]'), back = was && was.getAttribute('data-k') != null ? { i: wasRow ? wasRow.getAttribute('data-i') : null, k: was.getAttribute('data-k') } : null;
    var kind = h.node.attrs.kind, ds = SD.norm(kind, h.node.attrs.ds), max = kind === 'results' ? SD.MAX.results : SD.MAX[ds.type], s = '';
    s += '<div class="de-top"><b>' + (kind === 'results' ? 'Big numbers' : 'Chart') + '</b>';
    if(kind === 'chart') s += '<div class="de-seg" role="group" aria-label="Kind of chart">' + SD.TYPES.map(function(t){ return '<button type="button" data-type="' + t + '"' + (ds.type === t ? ' class="on" aria-pressed="true"' : ' aria-pressed="false"') + '>' + { bars: 'Bars', line: 'Line', pie: 'Pie', donut: 'Donut' }[t] + '</button>'; }).join('') + '</div>';
    s += '<span class="de-grow"></span><button type="button" class="btn" data-do="done">Done</button></div><div class="de-rows">';
    if(kind === 'results'){
      s += '<div class="de-row de-head"><span>Number</span><span>What it is</span><span>Change (optional)</span><span>Change is</span><span></span></div>';
      ds.rows.forEach(function(r, i){
        s += '<div class="de-row" data-i="' + i + '"><input data-k="v" value="' + esc(r.v) + '" aria-label="Number ' + (i + 1) + '"><input data-k="l" value="' + esc(r.l) + '" aria-label="What number ' + (i + 1) + ' is">' +
          '<input data-k="c" value="' + esc(r.c) + '" placeholder="+12% this year" aria-label="Change for number ' + (i + 1) + '"><select data-k="t" aria-label="The change is">' +
          [['good', 'Good news'], ['watch', 'One to watch'], ['plain', 'Neither']].map(function(o){ return '<option value="' + o[0] + '"' + (r.t === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') +
          '</select><button type="button" data-do="del" aria-label="Remove number ' + (i + 1) + '"' + (ds.rows.length < 2 ? ' disabled' : '') + '>×</button></div>';
      });
    } else {
      s += '<div class="de-row de-chart de-head"><span>Stands out</span><span>Label</span><span>Value</span><span></span></div>';
      ds.rows.forEach(function(r, i){
        s += '<div class="de-row de-chart" data-i="' + i + '"><label class="de-hi"><input type="radio" name="de-hi" data-k="hi"' + (ds.hi === i ? ' checked' : '') + ' aria-label="Make ' + esc(r[0] || 'this one') + ' stand out"></label>' +
          '<input data-k="0" value="' + esc(r[0]) + '" aria-label="Label ' + (i + 1) + '"><input data-k="1" value="' + esc(r[1]) + '" inputmode="decimal" aria-label="Value ' + (i + 1) + '">' +
          '<button type="button" data-do="del" aria-label="Remove ' + esc(r[0] || 'this row') + '"' + (ds.rows.length < 2 ? ' disabled' : '') + '>×</button></div>';
      });
    }
    s += '</div><div class="de-foot"><button type="button" class="fb w" data-do="add"' + (ds.rows.length >= max ? ' disabled' : '') + '>＋ Add ' + (kind === 'results' ? 'a number' : 'a row') + '</button>';
    if(kind === 'chart') s += '<label>Before each value <input data-k="pre" value="' + esc(ds.pre) + '" placeholder="$" class="de-short"></label><label>After <input data-k="post" value="' + esc(ds.post) + '" placeholder="%" class="de-short"></label>';
    s += '<label class="de-check"><input type="checkbox" data-k="anim"' + (ds.anim === false ? '' : ' checked') + '> Move when it comes into view</label>' +
      '<span class="de-grow"></span><span class="de-note">' + (kind === 'chart' ? 'Up to ' + max + ' rows. Paste rows from a spreadsheet into a label.' : 'Up to four numbers.') + '</span></div>';
    panel.innerHTML = s;
    var f = focusFirst ? panel.querySelector('.de-row:not(.de-head) input:not([type=radio])') : back ? panel.querySelector((back.i != null ? '[data-i="' + back.i + '"] ' : '') + '[data-k="' + back.k + '"]') : null;
    if(!f && !focusFirst) f = panel.querySelector('[data-do=done]');
    if(f){ f.focus(); if(focusFirst && f.select) f.select(); }
  }
  function current(){ var h = find(editing); return h ? { kind: h.node.attrs.kind, ds: SD.norm(h.node.attrs.kind, h.node.attrs.ds) } : null; }
  main.addEventListener('input', function(e){
    if(!panel || !panel.contains(e.target)) return;
    var c = current(), t = e.target, k = t.getAttribute('data-k'), row = t.closest('[data-i]'), i = row ? +row.getAttribute('data-i') : -1; if(!c || k == null) return;
    var ds = c.ds;
    if(k === 'anim'){ if(t.checked) delete ds.anim; else ds.anim = false; }
    else if(k === 'pre' || k === 'post') ds[k] = t.value;
    else if(k === 'hi') ds.hi = i;
    else if(c.kind === 'results') ds.rows[i][k] = t.value;
    else if(k === '0') ds.rows[i][0] = t.value;
    else { var v = parseFloat(String(t.value).replace(/,/g, '')); ds.rows[i][1] = isFinite(v) ? v : 0; }
    write(ds);
  });
  main.addEventListener('change', function(e){ if(panel && panel.contains(e.target) && e.target.tagName === 'SELECT'){ var c = current(), row = e.target.closest('[data-i]'); if(c && row){ c.ds.rows[+row.getAttribute('data-i')].t = e.target.value; write(c.ds); } } });
  main.addEventListener('click', function(e){
    if(!panel || !panel.contains(e.target)) return;
    var b = e.target.closest('[data-do], [data-type]'), c = current(); if(!b || !c) return;
    var ds = c.ds, what = b.getAttribute('data-do');
    if(b.hasAttribute('data-type')){
      var to = b.getAttribute('data-type'); if(SD.family(to) !== SD.family(ds.type) && JSON.stringify(ds.rows) === JSON.stringify(SD.SAMPLE[SD.family(ds.type)].rows)) ds.rows = null;   // untouched sample rows give way to the other kind's
      ds.type = to; ds.rows = ds.rows ? ds.rows.slice(0, SD.MAX[to]) : ds.rows; write(SD.norm('chart', ds)); draw(); return;
    }
    if(what === 'done'){ closeEditor(); A.view.focus(); return; }
    if(what === 'add'){ if(c.kind === 'results') ds.rows.push({ v: '0', l: '', c: '', t: 'plain' }); else ds.rows.push(['', 0]); write(ds); draw(); var ins = panel.querySelectorAll('.de-row:not(.de-head)'), last = ins[ins.length - 1].querySelector('input:not([type=radio])'); if(last) last.focus(); return; }
    if(what === 'del'){ var i = +b.closest('[data-i]').getAttribute('data-i'); ds.rows.splice(i, 1); if(c.kind === 'chart'){ if(ds.hi === i) ds.hi = 0; else if(ds.hi > i) ds.hi--; } write(ds); draw(); }
  });
  // rows copied from a spreadsheet (label, a tab or comma, value; one per line) fill the chart from the row they are pasted into
  main.addEventListener('paste', function(e){
    if(!panel || !panel.contains(e.target)) return;
    var c = current(), row = e.target.closest('[data-i]'), text = (e.clipboardData && e.clipboardData.getData('text/plain')) || '';
    if(!c || c.kind !== 'chart' || !row || !/[\t\n]/.test(text.trim())) return;
    var lines = text.trim().split(/\r?\n/).map(function(l){ var p = l.split(/\t|,(?=\s*-?[\d.]+\s*$)/); return [String(p[0] || '').trim(), parseFloat(String(p[p.length - 1]).replace(/[^\d.\-]/g, '')) || 0]; }).filter(function(r){ return r[0] !== ''; });
    if(lines.length < 2) return;
    e.preventDefault(); var at = +row.getAttribute('data-i'), ds = c.ds;
    ds.rows = ds.rows.slice(0, at).concat(lines).slice(0, SD.MAX[ds.type]); ds.hi = Math.min(ds.hi, ds.rows.length - 1); write(ds); draw();
  });
  // Esc closes the panel from wherever the cursor is
  document.addEventListener('keydown', function(e){ if(panel && e.key === 'Escape'){ e.stopPropagation(); e.preventDefault(); closeEditor(); A.view.focus(); } }, true);
  A.onOpen.push(closeEditor);
  A.onUpdate.push(function(tr){ if(editing && tr.docChanged && !find(editing)) closeEditor(); });
  K.editData = openEditor;
})();

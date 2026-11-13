/* Sleek Tasks' grid: a project's tasks as rows, and what each holds as columns you type straight into.

   The first columns are every task's own: its name, status, due date, person, tags and picture. After
   them come the project's own fields, added with ＋ Field: text, number, checkbox, dropdown, date,
   link, person, or a picture or clip (task/fields.js draws and edits each kind). Press a column's
   heading to sort by it, and, for one of your own, to rename it, edit a dropdown's choices, or
   delete it. The sort is kept with the project (project.grid.sort); with none, rows are in the
   board's order. Enter moves down a row, like a spreadsheet. */
(function(){
  var T = window.SleekTasks, A = window.SleekTaskApp; if(!T || !A || !A.cell) return;
  var esc = A.esc, body = document.getElementById('body'), state = A.state;
  var BUILT = ['@title', '@status', '@due', '@who', '@tags', '@cover'];
  function sortOf(p){ var s = p.grid && p.grid.sort; return s && (BUILT.indexOf(s.f) >= 0 || T.field(p.id, s.f)) ? s : null; }
  // what a value sorts by: a number or a string, or null for nothing (nothing always sorts last)
  function rank(t, f, p){
    var v = A.val(t, f.id);
    switch(f.type){
      case 'status': return p.statuses.map(function(s){ return s.id; }).indexOf(v);
      case 'tags': return v && v.length ? v[0].toLowerCase() : null;
      case 'number': return v === '' || v == null ? null : +v;
      case 'check': return v ? 0 : 1;
      case 'file': return v ? 0 : null;
      case 'select': var i = (f.options || []).map(function(o){ return o.id; }).indexOf(v); return i < 0 ? null : i;
    }
    return v == null || v === '' ? null : String(v).toLowerCase();
  }
  function rows(p){
    var all = T.tasks(p.id).slice().sort(function(a, b){ return (a.order || 0) - (b.order || 0); }), s = sortOf(p); if(!s) return all;
    var f = A.fieldOf({ project: p.id }, s.f);
    return all.map(function(t, i){ return { t: t, r: rank(t, f, p), i: i }; }).sort(function(a, b){
      if(a.r == null || b.r == null) return a.r == null && b.r == null ? a.i - b.i : a.r == null ? 1 : -1;
      var c = typeof a.r === 'number' && typeof b.r === 'number' ? a.r - b.r : String(a.r).localeCompare(String(b.r), undefined, { numeric: true });
      return c ? c * s.dir : a.i - b.i;
    }).map(function(x){ return x.t; });
  }
  A.views.grid = function(p){
    if(!p) return '';
    var fs = T.fields(p.id), s = sortOf(p), cols = BUILT.map(function(id){ return A.fieldOf({ project: p.id }, id); }).concat(fs), list = rows(p);
    var h = '<div class="gridw"><table class="grid"><thead><tr>' + cols.map(function(f){
      var own = f.id.charAt(0) !== '@', on = s && s.f === f.id;
      return '<th class="c-' + f.type + '" data-fcol="' + f.id + '"' + (on ? ' aria-sort="' + (s.dir > 0 ? 'ascending' : 'descending') + '"' : '') + '><button type="button" class="fh" data-fmenu="' + f.id + '" aria-haspopup="true"><b>' + esc(f.name) + '</b>' +
        (own ? '<small>' + A.KINDS[f.type].toLowerCase() + '</small>' : '') + (on ? '<i aria-hidden="true">' + (s.dir > 0 ? '↑' : '↓') + '</i>' : '') + '</button></th>';
    }).join('') + '<th class="c-add"><button type="button" class="gbtn" data-do="field" aria-haspopup="true">＋ Field</button></th></tr></thead><tbody>';
    list.forEach(function(t){
      h += '<tr data-task="' + t.id + '" data-flip="g-' + t.id + '"' + (state.landed === t.id ? ' class="landed"' : '') + '>' + cols.map(function(f){
        if(f.id === '@title') return '<td class="c-title"><div class="tcell">' + A.ck(t) + A.cell(t, f.id) + A.repH(t) + (t.notes || (t.subs || []).length ? '<span class="noteflag" title="Has notes or subtasks">≡</span>' : '') + '<button type="button" class="open" data-open="' + t.id + '" aria-label="Open ' + esc(t.title) + '">Open</button></div></td>';
        return '<td class="c-' + f.type + (f.id === '@due' && A.late(t) ? ' late' : '') + '">' + A.cell(t, f.id) + '</td>';
      }).join('') + '<td></td></tr>';
    });
    return h + '<tr class="addrow"><td colspan="' + (cols.length + 1) + '"><input placeholder="＋ Add a task" data-add="grid" aria-label="Add a task" maxlength="300"></td></tr></tbody></table></div>' + A.tagList() +
      (list.length ? '' : '<div class="empty"><b>No tasks yet.</b>Type one in the grid’s last row and press Enter.</div>');
  };

  // ---------- a column's menu, and ＋ Field ----------
  function two(m, name, hint, act){ var b = document.createElement('button'); b.type = 'button'; b.className = 'mi two'; b.innerHTML = '<b>' + esc(name) + '</b><i>' + esc(hint) + '</i>'; b.addEventListener('click', function(){ act(b); }); m.appendChild(b); return b; }
  function setSort(p, s){ T.setProject(p.id, { grid: Object.assign({}, p.grid, { sort: s }) }); }
  function rename(fid){
    var p = T.project(state.proj), f = p && T.field(p.id, fid), btn = body.querySelector('[data-fmenu="' + fid + '"]'); if(!f || !btn) return;
    var inp = document.createElement('input'); inp.className = 'fname'; inp.value = f.name; inp.maxLength = 40; inp.setAttribute('aria-label', 'Field name'); btn.replaceWith(inp); inp.focus(); inp.select();
    var over = false, end = function(keep){ if(over) return; over = true; var v = inp.value.replace(/\s+/g, ' ').trim(); if(keep && v && v !== f.name) T.setField(p.id, fid, { name: v }); else A.paint(); };
    inp.addEventListener('keydown', function(e){ e.stopPropagation(); if(e.key === 'Enter'){ e.preventDefault(); end(true); } if(e.key === 'Escape') end(false); });
    inp.addEventListener('blur', function(){ end(true); });
  }
  function columnMenu(btn, fid){
    var p = T.project(state.proj), f = A.fieldOf({ project: p.id }, fid), s = sortOf(p), own = fid.charAt(0) !== '@'; if(!f) return;
    A.menu(btn, function(m){
      var words = f.type === 'number' ? ['Sort: smallest first', 'Sort: largest first'] : f.type === 'date' ? ['Sort: soonest first', 'Sort: latest first'] : f.type === 'check' ? ['Sort: ticked first', 'Sort: unticked first'] : f.type === 'status' || f.type === 'select' ? ['Sort: in their order', 'Sort: in reverse order'] : f.type === 'file' ? ['Sort: with one first', 'Sort: without one first'] : ['Sort: A to Z', 'Sort: Z to A'];
      A.item(m, words[0], function(){ A.closePop(); setSort(p, { f: fid, dir: 1 }); }); A.item(m, words[1], function(){ A.closePop(); setSort(p, { f: fid, dir: -1 }); });
      if(s) A.item(m, 'Stop sorting', function(){ A.closePop(); setSort(p, null); });
      if(!own) return;
      var l = document.createElement('div'); l.className = 'line'; m.appendChild(l);
      A.item(m, 'Rename', function(){ A.closePop(); rename(fid); });
      if(f.type === 'select'){
        var h = document.createElement('h4'); h.textContent = 'Choices'; m.appendChild(h);
        var box = document.createElement('div'); box.className = 'opts'; m.appendChild(box);
        var draw = function(){
          var now = T.field(p.id, fid); if(!now) return;
          box.innerHTML = (now.options || []).map(function(o){ return '<div data-opt="' + o.id + '"><i style="--c:' + o.color + '"></i><input value="' + esc(o.name) + '" maxlength="40" aria-label="Choice"><button type="button" aria-label="Remove ' + esc(o.name) + '">×</button></div>'; }).join('') + '<div><i></i><input placeholder="＋ Add a choice" maxlength="40" data-newopt aria-label="Add a choice"></div>';
        };
        draw();
        box.addEventListener('change', function(e){ var row = e.target.closest('[data-opt]'), now = T.field(p.id, fid), v = e.target.value.replace(/\s+/g, ' ').trim(); if(!row || !now) return; if(v) T.setField(p.id, fid, { options: now.options.map(function(o){ return o.id === row.getAttribute('data-opt') ? Object.assign({}, o, { name: v }) : o; }) }); else draw(); });
        box.addEventListener('click', function(e){ var row = e.target.closest('[data-opt]'), now = T.field(p.id, fid); if(!row || e.target.tagName !== 'BUTTON' || !now) return; T.setField(p.id, fid, { options: now.options.filter(function(o){ return o.id !== row.getAttribute('data-opt'); }) }); draw(); });
        box.addEventListener('keydown', function(e){ if(e.key !== 'Enter') return; e.preventDefault(); if(e.target.hasAttribute('data-newopt')){ if(T.addOption(p.id, fid, e.target.value)){ draw(); box.querySelector('[data-newopt]').focus(); } } else e.target.blur(); });
      }
      var l2 = document.createElement('div'); l2.className = 'line'; m.appendChild(l2);
      A.danger(m, 'Delete this field', function(){ T.removeField(p.id, fid); A.toast('Deleted the field “' + f.name + '”'); });
    });
  }
  function fieldMenu(btn){
    var p = T.project(state.proj);
    A.menu(btn, function(m){
      var h = document.createElement('h4'); h.textContent = 'A new field'; m.appendChild(h);
      T.FIELD_TYPES.forEach(function(type){ two(m, A.KINDS[type], A.HINTS[type], function(){
        A.closePop(); var f = T.addField(p.id, { type: type, name: A.KINDS[type] === 'Picture or clip' ? 'File' : A.KINDS[type] });
        if(!f){ A.toast('A project can have 30 fields of its own.'); return; }
        // name it straight away, once it has been drawn
        setTimeout(function(){ var th = body.querySelector('[data-fcol="' + f.id + '"]'); if(th && th.scrollIntoView) th.scrollIntoView({ block: 'nearest', inline: 'nearest' }); rename(f.id); }, 0);
      }); });
    });
  }
  body.addEventListener('click', function(e){
    var x = e.target.closest('[data-fmenu]'); if(x){ columnMenu(x, x.getAttribute('data-fmenu')); return; }
    x = e.target.closest('[data-do="field"]'); if(x) fieldMenu(x);
  });
  // Enter, and the up and down arrows, move between rows in the same column
  body.addEventListener('keydown', function(e){
    var el = e.target; if(!el.closest || !el.closest('table.grid') || el.tagName !== 'INPUT' || !el.classList.contains('cx') || el.type === 'date' || el.type === 'number' && e.key !== 'Enter') return;
    if(e.key !== 'Enter' && e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    var tr = el.closest('tr'), to = e.key === 'ArrowUp' ? tr.previousElementSibling : tr.nextElementSibling, fid = el.getAttribute('data-fv'); if(!to || !fid) return;
    var sel = to.classList.contains('addrow') ? '[data-add="grid"]' : '[data-k="' + to.getAttribute('data-task') + ':' + fid + '"]';
    if(e.key !== 'Enter') e.preventDefault();
    setTimeout(function(){ var next = body.querySelector(sel); if(next){ next.focus(); if(next.select) next.select(); } }, 0);      // after the change has been saved and drawn
  }, true);
  A.wireFields(body);
})();

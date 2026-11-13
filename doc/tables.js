/* Tables in the editor: a small bar of controls that sits above whichever table the cursor is in.

   Add a row or a column (after the cell you are in), delete the row or column you are in, switch
   the top row between a header and an ordinary row, or delete the table. Columns are resized by
   dragging the line between two of them (the editor's own column resizing, switched on in
   doc/editor.js); Tab moves to the next cell and adds a row from the last one. */
(function(){
  var PM = window.SleekPM, K = window.SleekDocKit, A = window.SleekDoc; if(!PM || !K || !A) return;
  var T = PM.tables, box = document.getElementById('pagebox'), bar = document.createElement('div');
  bar.className = 'tb-bar'; bar.hidden = true; bar.setAttribute('role', 'toolbar'); bar.setAttribute('aria-label', 'Table');
  var ACTS = [['row', '＋ Row', 'Add a row below', T.addRowAfter], ['col', '＋ Column', 'Add a column to the right', T.addColumnAfter], ['-row', '− Row', 'Delete this row', T.deleteRow],
              ['-col', '− Column', 'Delete this column', T.deleteColumn], ['head', 'Header row', 'Make the top row a header, or an ordinary row', T.toggleHeaderRow], ['del', 'Delete table', 'Delete the whole table', T.deleteTable]];
  bar.innerHTML = ACTS.map(function(a){ return '<button type="button" data-a="' + a[0] + '" title="' + a[2] + '">' + a[1] + '</button>'; }).join('');
  box.appendChild(bar);
  bar.addEventListener('mousedown', function(e){ e.preventDefault(); });
  bar.addEventListener('click', function(e){
    var b = e.target.closest('[data-a]'); if(!b || A.locked()) return;
    var act = ACTS.filter(function(a){ return a[0] === b.getAttribute('data-a'); })[0]; A.run(act[3]); place();
  });
  function place(){
    var v = A.view; if(!v) return; var st = v.state;
    if(A.locked() || !T.isInTable(st)){ bar.hidden = true; return; }
    var at = v.domAtPos(st.selection.from).node, el = at.nodeType === 1 ? at : at.parentNode, table = el && el.closest ? el.closest('table') : null;
    if(!table){ bar.hidden = true; return; }
    var wrap = table.closest('.tableWrapper') || table, r = wrap.getBoundingClientRect(), b = box.getBoundingClientRect();
    bar.hidden = false;
    bar.style.left = Math.max(0, r.left - b.left) + 'px';
    bar.style.top = (r.top - b.top - bar.offsetHeight - 6) + 'px';
  }
  A.onUpdate.push(function(){ requestAnimationFrame(place); }); A.onOpen.push(function(){ bar.hidden = true; });
  window.addEventListener('resize', place);
})();

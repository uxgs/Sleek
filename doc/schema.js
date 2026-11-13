/* What a Sleek Docs page can hold: its blocks (paragraphs, headings, lists, checklists, quotes, code,
   dividers, pictures with captions, tables, charts and big numbers, before-and-after pictures, tasks
   from Sleek Tasks, and the designed sections: a cover, callouts and columns) and the marks on its words (bold, italic, underline,
   strike, highlight, code, links). The editor (vendor/prosemirror.js) keeps every page to these
   rules, which is also what cleans a paste: anything not listed here doesn't get in.

   A page is stored as this document's JSON (core/doc-store.js: seed.doc). Adding a block type later
   is safe for old pages; a page that uses one this copy doesn't know is shown as "made with a newer
   Sleek Docs" and never saved over (doc/editor.js).

   Every block that can sit at the top level of a page has an `id`, given by the editor
   (doc/editor.js) and never shown: it is how a published page's readers are matched to the page as
   it is now (doc/viewers.js). A heading can be collapsible (`toggle`), and then open or `closed`.

   window.SleekDocKit = { schema, N (its node types), M (its mark types) }; other files add to it. */
(function(){
  var PM = window.SleekPM; if(!PM) return;
  var tn = PM.tables.tableNodes({ tableGroup: 'block', cellContent: 'block+', cellAttributes: {} });
  function has(el, re){ return re.test(el.getAttribute('style') || ''); }
  // only addresses a page should carry: a web or mail link, a picture's own data
  function safeHref(h){ h = String(h || ''); return /^(https?:|mailto:|tel:|#)/i.test(h) ? h : ''; }
  function safeSrc(u){ u = String(u || ''); return /^(https?:|blob:|data:image\/|sleek-media:)/i.test(u) ? u : ''; }
  function json(s){ try { return JSON.parse(s || 'null'); } catch(e){ return null; } }
  function colour(c){ return /^#[0-9a-f]{6}$/i.test(c || '') ? c : '#8E8E93'; }
  // a date as words that stay true whenever they are read: "14 Nov"
  function dateWords(k){ var p = String(k).split('-'); if(p.length !== 3) return ''; var d = new Date(+p[0], +p[1] - 1, +p[2]); return isNaN(d) ? '' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }); }
  function head(level){ return { tag: 'h' + level, getAttrs: function(d){ return { level: Math.min(level, 3), toggle: d.classList.contains('dk-toggle'), closed: d.classList.contains('closed') }; } }; }
  var nodes = {
    doc: { content: 'cover? block+' },
    paragraph: { group: 'block', content: 'inline*', parseDOM: [{ tag: 'p' }], toDOM: function(){ return ['p', 0]; } },
    heading: { group: 'block', content: 'inline*', attrs: { level: { default: 2 }, toggle: { default: false }, closed: { default: false } }, defining: true,
      parseDOM: [head(1), head(2), head(3), head(4), head(5), head(6)],
      toDOM: function(n){ return n.attrs.toggle ? ['h' + n.attrs.level, { class: 'dk-toggle' + (n.attrs.closed ? ' closed' : '') }, 0] : ['h' + n.attrs.level, 0]; } },
    blockquote: { group: 'block', content: 'block+', defining: true, parseDOM: [{ tag: 'blockquote' }], toDOM: function(){ return ['blockquote', 0]; } },
    code_block: { group: 'block', content: 'text*', marks: '', code: true, defining: true, parseDOM: [{ tag: 'pre', preserveWhitespace: 'full' }], toDOM: function(){ return ['pre', ['code', 0]]; } },
    horizontal_rule: { group: 'block', parseDOM: [{ tag: 'hr' }], toDOM: function(){ return ['hr']; } },
    bullet_list: { group: 'block', content: 'list_item+', parseDOM: [{ tag: 'ul' }], toDOM: function(){ return ['ul', 0]; } },
    ordered_list: { group: 'block', content: 'list_item+', parseDOM: [{ tag: 'ol' }], toDOM: function(){ return ['ol', 0]; } },
    list_item: { content: 'paragraph block*', defining: true, parseDOM: [{ tag: 'li' }], toDOM: function(){ return ['li', 0]; } },
    // a checklist: each item is one line and a tick
    task_list: { group: 'block', content: 'task_item+', parseDOM: [{ tag: 'ul.dk-tasks', priority: 60 }], toDOM: function(){ return ['ul', { class: 'dk-tasks' }, 0]; } },
    task_item: { content: 'paragraph', attrs: { done: { default: false } }, defining: true,
      parseDOM: [{ tag: 'li.dk-task', priority: 60, getAttrs: function(d){ return { done: d.classList.contains('done') }; } }],
      toDOM: function(n){ return ['li', { class: 'dk-task' + (n.attrs.done ? ' done' : '') }, ['span', { class: 'dk-check' }], ['div', 0]]; } },
    // a picture: its caption is the block's own text. size is 'text' (as wide as the words), 'wide' or 'full'
    figure: { group: 'block', content: 'inline*', attrs: { src: { default: '' }, size: { default: 'text' } }, draggable: true, isolating: true,
      parseDOM: [
        { tag: 'figure', getAttrs: function(d){ var i = d.querySelector('img[src]'); return i ? { src: i.getAttribute('src'), size: d.classList.contains('dk-full') ? 'full' : d.classList.contains('dk-wide') ? 'wide' : 'text' } : false; },
          contentElement: function(d){ return d.querySelector('figcaption') || document.createElement('span'); } },
        { tag: 'img[src]', getAttrs: function(d){ var s = d.getAttribute('src') || ''; return /^(https?:|data:image\/|blob:)/i.test(s) && d.getAttribute('width') !== '1' ? { src: s } : false; } }
      ],
      toDOM: function(n){ return ['figure', { class: 'dk-fig' + (n.attrs.size === 'wide' ? ' dk-wide' : n.attrs.size === 'full' ? ' dk-full' : '') }, ['img', { src: safeSrc(n.attrs.src), alt: n.textContent }], ['figcaption', 0]]; } },
    // ---------- designed sections ----------
    // a cover: a band across the top of the page, holding a short line above, the title, and a line below.
    // Only ever first (the page is "cover? block+"), so it is not one of the ordinary blocks.
    cover: { content: 'paragraph heading paragraph', defining: true, isolating: true,
      parseDOM: [{ tag: 'header.dk-cover' }], toDOM: function(){ return ['header', { class: 'dk-cover' }, 0]; } },
    // a callout: a tinted box around a few blocks
    callout: { group: 'block', content: 'block+', defining: true, parseDOM: [{ tag: 'aside.dk-callout' }], toDOM: function(){ return ['aside', { class: 'dk-callout' }, 0]; } },
    // columns: two or three side by side, each holding its own blocks
    columns: { group: 'block', content: 'column{2,3}', isolating: true, parseDOM: [{ tag: 'div.dk-cols' }], toDOM: function(n){ return ['div', { class: 'dk-cols dk-cols-' + n.childCount }, 0]; } },
    column: { content: 'block+', isolating: true, parseDOM: [{ tag: 'div.dk-col' }], toDOM: function(){ return ['div', { class: 'dk-col' }, 0]; } },
    // ---------- data and comparisons ----------
    // big numbers, or a chart: drawn by the same code as Sleek Slides' Results and Chart slides
    // (features/data-layout.js says what ds holds). kind is 'results' or 'chart'.
    data: { group: 'block', atom: true, draggable: true, attrs: { kind: { default: 'chart' }, ds: { default: null } },
      parseDOM: [{ tag: 'div.dk-data', getAttrs: function(d){ var ds = null; try { ds = JSON.parse(d.getAttribute('data-json') || 'null'); } catch(e){} return { kind: d.getAttribute('data-kind') === 'results' ? 'results' : 'chart', ds: ds }; } }],
      toDOM: function(n){ return ['div', { class: 'dk-data', 'data-kind': n.attrs.kind, 'data-json': JSON.stringify(n.attrs.ds || null) }, ['div', { class: 'ds-host', 'data-ds': n.attrs.kind === 'results' ? 'results' : 'chart' }]]; } },
    // before and after: two pictures, compared with a slider ('slider') or shown next to each other ('side')
    compare: { group: 'block', atom: true, draggable: true, attrs: { before: { default: '' }, after: { default: '' }, mode: { default: 'slider' } },
      parseDOM: [{ tag: 'div.dk-compare', getAttrs: function(d){ var b = d.querySelector('.cmp-b img'), a = d.querySelector('.cmp-a img'); return { before: b ? b.getAttribute('src') : '', after: a ? a.getAttribute('src') : '', mode: d.getAttribute('data-mode') === 'side' ? 'side' : 'slider' }; } }],
      toDOM: function(n){ return ['div', { class: 'dk-compare', 'data-mode': n.attrs.mode },
        ['figure', { class: 'cmp-b' }, ['img', { src: safeSrc(n.attrs.before), alt: 'Before' }], ['figcaption', 'Before']],
        ['figure', { class: 'cmp-a' }, ['img', { src: safeSrc(n.attrs.after), alt: 'After' }], ['figcaption', 'After']]]; } },
    // ---------- tasks, from Sleek Tasks ----------
    // A task shown in a sentence (task_ref), or a project's tasks as a list or a board (tasks). In the
    // editor these are live (doc/blocks-tasks.js draws them from core/task-store.js). What is stored
    // with them, `snap`, is how they last looked, which is what a published page shows, and what a
    // browser without those tasks falls back to:
    //   task_ref   snap { t: name, done, s: status name, c: its colour, due }
    //   tasks      snap { n: project name, c: its colour, at: when, cols: [{ n, c, done, tasks: [{ t, done, due, who }] }] }
    // tasks.ids, when set, is a hand-picked list of task ids (a checklist turned into tasks) instead of the whole project.
    task_ref: { group: 'inline', inline: true, atom: true, draggable: true, attrs: { task: { default: '' }, snap: { default: null } },
      leafText: function(n){ return n.attrs.snap ? String(n.attrs.snap.t || '') : ''; },
      parseDOM: [{ tag: 'span.dk-tchip', getAttrs: function(d){ return { task: d.getAttribute('data-task') || '', snap: json(d.getAttribute('data-snap')) }; } }],
      toDOM: function(n){
        var s = n.attrs.snap || { t: 'A task' }, kids = [['span', { class: 'tk-ck' + (s.done ? ' on' : '') }], ['span', { class: 'tc-t' }, String(s.t || '')]];
        if(s.s) kids.push(['span', { class: 'tc-s', style: '--c:' + colour(s.c) }, String(s.s)]);
        if(s.due) kids.push(['span', { class: 'tc-d' }, dateWords(s.due)]);
        return ['span', { class: 'dk-tchip' + (s.done ? ' done' : ''), 'data-task': n.attrs.task, 'data-snap': JSON.stringify(n.attrs.snap || null) }].concat(kids);
      } },
    tasks: { group: 'block', atom: true, draggable: true, attrs: { project: { default: '' }, view: { default: 'list' }, show: { default: 'open' }, ids: { default: null }, snap: { default: null } },
      parseDOM: [{ tag: 'div.dk-tasks', getAttrs: function(d){ return { project: d.getAttribute('data-project') || '', view: d.getAttribute('data-view') === 'board' ? 'board' : 'list', show: d.getAttribute('data-show') === 'all' ? 'all' : 'open', ids: json(d.getAttribute('data-ids')), snap: json(d.getAttribute('data-snap')) }; } }],
      toDOM: function(n){
        var a = n.attrs, s = a.snap || { n: 'Tasks', cols: [] }, cols = s.cols || [], body;
        if(a.view === 'board') body = ['div', { class: 'tk-board' }].concat(cols.map(function(c){
          return ['div', { class: 'tk-col' }, ['div', { class: 'tk-colh' }, ['i', { style: '--c:' + colour(c.c) }], ['b', String(c.n || '')], ['span', String((c.tasks || []).length)]]].concat((c.tasks || []).map(function(t){ return ['div', { class: 'tk-card' + (t.done ? ' done' : '') }, String(t.t || '')]; })); }));
        else { var rows = []; cols.forEach(function(c){ (c.tasks || []).forEach(function(t){ if(a.show === 'all' || !t.done) rows.push(t); }); });
          body = ['div', { class: 'tk-list' }].concat(rows.map(function(t){ var r = [['span', { class: 'tk-ck' + (t.done ? ' on' : '') }], ['span', { class: 'tk-t' }, String(t.t || '')]]; if(t.due) r.push(['span', { class: 'tc-d' }, dateWords(t.due)]); return ['div', { class: 'tk-row' + (t.done ? ' done' : '') }].concat(r); })); }
        return ['div', { class: 'dk-tasks', 'data-project': a.project, 'data-view': a.view, 'data-show': a.show, 'data-ids': JSON.stringify(a.ids || null), 'data-snap': JSON.stringify(a.snap || null) },
          ['div', { class: 'tk-h' }, ['i', { style: '--c:' + colour(s.c) }], ['b', String(s.n || 'Tasks')], ['span', (a.view === 'board' ? 'Board' : 'Tasks') + (s.at ? ', as on ' + new Date(s.at).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }) : '')]], body];
      } },
    table: tn.table, table_row: tn.table_row, table_cell: tn.table_cell, table_header: tn.table_header,
    text: { group: 'inline' },
    hard_break: { inline: true, group: 'inline', selectable: false, parseDOM: [{ tag: 'br' }], toDOM: function(){ return ['br']; } }
  };
  var marks = {
    link: { attrs: { href: {} }, inclusive: false,
      parseDOM: [{ tag: 'a[href]', getAttrs: function(d){ var h = d.getAttribute('href') || ''; return /^(https?:|mailto:|tel:|#)/i.test(h) ? { href: h } : false; } }],
      toDOM: function(m){ return ['a', { href: safeHref(m.attrs.href), target: '_blank', rel: 'noopener' }, 0]; } },
    // Google Docs wraps a whole paste in <b style="font-weight:normal">, which is not bold
    strong: { parseDOM: [{ tag: 'strong' }, { tag: 'b', getAttrs: function(d){ return d.style.fontWeight !== 'normal' && d.style.fontWeight !== '400' && null; } },
                         { style: 'font-weight', getAttrs: function(v){ return /^(bold(er)?|[5-9]\d{2,})$/.test(v) && null; } }], toDOM: function(){ return ['strong', 0]; } },
    em: { parseDOM: [{ tag: 'i' }, { tag: 'em' }, { style: 'font-style=italic' }], toDOM: function(){ return ['em', 0]; } },
    underline: { parseDOM: [{ tag: 'u' }, { style: 'text-decoration', getAttrs: function(v){ return /underline/.test(v) && null; } }, { style: 'text-decoration-line', getAttrs: function(v){ return /underline/.test(v) && null; } }], toDOM: function(){ return ['u', 0]; } },
    strike: { parseDOM: [{ tag: 's' }, { tag: 'del' }, { tag: 'strike' }, { style: 'text-decoration', getAttrs: function(v){ return /line-through/.test(v) && null; } }, { style: 'text-decoration-line', getAttrs: function(v){ return /line-through/.test(v) && null; } }], toDOM: function(){ return ['s', 0]; } },
    // any highlighter colour from another app becomes Sleek's one highlight
    highlight: { parseDOM: [{ tag: 'mark' }, { style: 'background-color', getAttrs: function(v){ return !/^(transparent|inherit|initial|unset|none|white|#fff(fff)?|rgba?\(\s*255,\s*255,\s*255|rgba\([^)]*,\s*0\s*\))/i.test(String(v).trim()) && null; } }], toDOM: function(){ return ['mark', 0]; } },
    code: { parseDOM: [{ tag: 'code' }], toDOM: function(){ return ['code', 0]; } }
  };
  // every block that can sit at the top level of a page carries an id (see the note at the top)
  ['paragraph', 'heading', 'blockquote', 'code_block', 'horizontal_rule', 'bullet_list', 'ordered_list', 'task_list', 'figure', 'cover', 'callout', 'columns', 'table', 'data', 'compare', 'tasks'].forEach(function(name){
    var spec = nodes[name] = Object.assign({}, nodes[name]); spec.attrs = Object.assign({}, spec.attrs, { id: { default: null } });
  });
  var schema = new PM.model.Schema({ nodes: nodes, marks: marks });
  var kit = window.SleekDocKit = { schema: schema, N: schema.nodes, M: schema.marks, has: has, safeHref: safeHref, safeSrc: safeSrc };
  // Tasks as plain words, for Markdown, Word and Make a deck: as they are now where this browser has
  // them (doc/blocks-tasks.js adds taskSnap), otherwise as they last looked.
  //   taskPlain(task_ref) -> { t, done }     tasksPlain(tasks) -> { name, board, groups: [{ name, rows: [{ t, done, due }] }] }
  kit.taskPlain = function(n){ var s = (kit.taskSnap ? kit.taskSnap(n) : n.attrs.snap) || {}; return { t: String(s.t || 'A task'), done: !!s.done }; };
  kit.tasksPlain = function(n){
    var s = (kit.taskSnap ? kit.taskSnap(n) : n.attrs.snap) || {}, board = n.attrs.view === 'board', all = [], groups = [];
    (s.cols || []).forEach(function(c){
      var rows = (c.tasks || []).filter(function(t){ return board || n.attrs.show === 'all' || !t.done; }).map(function(t){ return { t: String(t.t || ''), done: !!t.done, due: t.due ? dateWords(t.due) : '' }; });
      if(board){ if(rows.length) groups.push({ name: String(c.n || ''), rows: rows }); } else all = all.concat(rows);
    });
    if(!board) groups.push({ name: '', rows: all });
    return { name: String(s.n || 'Tasks'), board: board, groups: groups };
  };
})();

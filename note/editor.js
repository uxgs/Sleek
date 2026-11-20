/* Sleeky Notes' writing box: plain lines, with bold and checklists, and nothing else.

   A note's text is kept as a run of lines, each a <div>. A line can be a checklist line
   (<div class="ck" data-done="0|1">), and words can be bold (<b>). Whatever is typed, pasted or
   brought in is cut down to exactly that (clean()), so a note can never carry anything but text.

     Enter in a checklist line makes the next line one too; Enter on an empty one ends the list.
     Backspace at the start of a checklist line makes it a plain line.
     "[] " typed at the start of a line makes it a checklist line.
     A click on a line's box ticks it. */
(function(){
  var BLOCK = /^(DIV|P|LI|UL|OL|H[1-6]|BLOCKQUOTE|PRE|SECTION|ARTICLE|TR|TABLE|TBODY)$/;
  function esc(s){ return String(s).replace(/[&<>"]/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function inline(node){
    var s = '';
    Array.prototype.forEach.call(node.childNodes, function(c){
      if(c.nodeType === 3) s += esc(c.nodeValue.replace(/ /g, ' '));
      else if(c.nodeType === 1){
        if(/^(SCRIPT|STYLE|TEMPLATE|IFRAME|OBJECT|SVG|MATH)$/i.test(c.tagName)) return;
        if(c.tagName === 'BR') s += '<br>';
        else if(c.tagName === 'B' || c.tagName === 'STRONG'){ var x = inline(c); if(x.replace(/<br>/g, '')) s += '<b>' + x + '</b>'; }
        else s += inline(c);
      }
    });
    return s;
  }
  function lines(root){
    var out = [], run = document.createElement('div');
    function flush(){ if(run.childNodes.length){ var h = inline(run); if(h) out.push({ html: h }); run = document.createElement('div'); } }
    Array.prototype.forEach.call(root.childNodes, function(c){
      if(c.nodeType === 1 && BLOCK.test(c.tagName)){
        flush();
        if(Array.prototype.some.call(c.children, function(k){ return BLOCK.test(k.tagName); })) out = out.concat(lines(c));
        else out.push({ html: inline(c), ck: c.classList.contains('ck'), done: c.getAttribute('data-done') === '1' });
      } else if(c.nodeType === 1 && c.tagName === 'BR'){ if(run.childNodes.length) flush(); else out.push({ html: '' }); }
      else run.appendChild(c.cloneNode(true));
    });
    flush(); return out;
  }
  /** Any HTML, cut down to a note's lines. */
  function clean(html){
    var t = document.createElement('template'); t.innerHTML = String(html || '');
    return lines(t.content).map(function(l){
      var h = l.html.replace(/(<br>)+$/, '');
      return '<div' + (l.ck ? ' class="ck" data-done="' + (l.done ? 1 : 0) + '"' : '') + '>' + (h || '<br>') + '</div>';
    }).join('');
  }
  /** A note's lines as plain text, one per line. */
  function text(html){
    var t = document.createElement('template'); t.innerHTML = String(html || '');
    return Array.prototype.map.call(t.content.children, function(d){ return d.textContent; }).join('\n');
  }
  /** Plain text as a note's lines. */
  function fromText(s){ return String(s || '').split(/\r?\n/).map(function(l){ return '<div>' + (esc(l) || '<br>') + '</div>'; }).join(''); }

  /** Make el the writing box for this note. changed(html) is told after each change. Gives { check(), bold(), html() }. */
  function mount(el, html, changed){
    el.contentEditable = 'true';
    el.innerHTML = clean(html) || '<div><br></div>';
    function line(){
      var s = getSelection(); if(!s.rangeCount || !el.contains(s.anchorNode)) return null;
      var n = s.anchorNode; if(n === el) return el.children[Math.min(s.anchorOffset, el.children.length - 1)] || null;
      while(n && n.parentNode !== el) n = n.parentNode;
      return n && n.nodeType === 1 ? n : null;
    }
    function atStart(l){ var s = getSelection(); if(!s.isCollapsed) return false; var r = document.createRange(); r.selectNodeContents(l); r.setEnd(s.anchorNode, s.anchorOffset); return r.toString().length === 0; }
    function tell(){ changed(clean(el.innerHTML)); }
    function plain(l){ l.classList.remove('ck'); l.removeAttribute('data-done'); l.removeAttribute('class'); }
    function caretEnd(l){ var r = document.createRange(); r.selectNodeContents(l); r.collapse(false); var s = getSelection(); s.removeAllRanges(); s.addRange(r); }
    el.addEventListener('focus', function(){ try { document.execCommand('defaultParagraphSeparator', false, 'div'); } catch(e){} });
    el.addEventListener('keydown', function(e){
      var l = line();
      if(e.key === 'Enter' && !e.shiftKey && l && l.classList.contains('ck')){
        if(!l.textContent.trim()){ e.preventDefault(); plain(l); tell(); return; }
        setTimeout(function(){ var n = line(); if(n && n !== l && n.classList.contains('ck')) n.setAttribute('data-done', '0'); tell(); }, 0);
      }
      if(e.key === 'Backspace' && l && l.classList.contains('ck') && atStart(l)){ e.preventDefault(); plain(l); tell(); }
    });
    el.addEventListener('input', function(){
      if(!el.firstChild) el.innerHTML = '<div><br></div>';
      var l = line(), m = l && !l.classList.contains('ck') && /^(-\s)?\[\s?\]\s/.exec(l.textContent.replace(/ /g, ' '));
      if(m){ var rest = l.textContent.slice(m[0].length); l.textContent = rest; if(!rest) l.innerHTML = '<br>'; l.className = 'ck'; l.setAttribute('data-done', '0'); caretEnd(l); }
      tell();
    });
    el.addEventListener('paste', function(e){
      e.preventDefault();
      var t = (e.clipboardData || window.clipboardData).getData('text/plain'); if(t) document.execCommand('insertText', false, t);
    });
    // the box at the start of a checklist line
    el.addEventListener('pointerdown', function(e){
      var l = e.target.closest ? e.target.closest('.ck') : null; if(!l || l.parentNode !== el) return;
      var r = l.getBoundingClientRect(), rtl = getComputedStyle(l).direction === 'rtl';
      if(rtl ? e.clientX < r.right - 30 : e.clientX > r.left + 30) return;
      e.preventDefault(); l.setAttribute('data-done', l.getAttribute('data-done') === '1' ? '0' : '1'); tell();
    });
    return {
      html: function(){ return clean(el.innerHTML); },
      bold: function(){ el.focus(); document.execCommand('bold'); tell(); },
      /** Make the line the cursor is in a checklist line, or a plain one again. */
      check: function(){
        el.focus(); var l = line(); if(!l){ l = el.lastElementChild; if(l) caretEnd(l); } if(!l) return;
        if(l.classList.contains('ck')) plain(l); else { l.className = 'ck'; l.setAttribute('data-done', '0'); }
        tell();
      }
    };
  }
  window.SleekNoteEditor = { clean: clean, text: text, fromText: fromText, mount: mount };
})();

/* Cleaning what Word and Google Docs put on the clipboard, before the editor reads it.

   The page's own rules (doc/schema.js) already drop fonts, sizes and colours and keep bold, italic,
   underline, strike, highlight, links, headings, lists and tables. Two things need help first:
     Word        a list is not a list: each item is a paragraph styled "mso-list: l0 level1 lfo1",
                 with its bullet or number typed in as text. These are rebuilt into real lists,
                 nested by level, numbered when the typed marker was a number or a letter.
     Google Docs a link's text is wrapped in an underlined span, which would underline every link.
   Anything from another app passes through untouched.

   SleekDocKit.cleanPaste(html) -> html */
(function(){
  var K = window.SleekDocKit; if(!K) return;
  function all(root, sel){ return Array.prototype.slice.call(root.querySelectorAll(sel)); }
  var MSO = /mso-list:\s*l(\d+)\s+level(\d+)/i;

  function wordLists(body){
    var stack = [], root = null;     // stack: the lists open now, outermost first: { el, level, ordered }
    all(body, 'p, h1, h2, h3, h4, h5, h6').forEach(function(p){
      var m = MSO.exec(p.getAttribute('style') || ''); if(!m || /^h/i.test(p.tagName)) return;
      var level = +m[2], mark = '';
      // the typed bullet or number: Word marks it "mso-list:Ignore" (and wraps it in comments this parser has already dropped)
      all(p, 'span').forEach(function(s){ if(/mso-list:\s*Ignore/i.test(s.getAttribute('style') || '')){ if(!mark) mark = s.textContent; s.remove(); } });
      var ordered = /^\s*(\d+|[a-z]{1,3}|[ivxlc]+)[.)]\s*$/i.test(mark.replace(/ /g, ' '));
      if(!root || p.previousElementSibling !== root){ stack = []; root = null; }     // not straight after the last item: a new list
      while(stack.length && stack[stack.length - 1].level > level) stack.pop();
      var top = stack[stack.length - 1];
      if(!top || top.level < level || top.ordered !== ordered){
        if(top && top.level === level) stack.pop();
        var list = body.ownerDocument.createElement(ordered ? 'ol' : 'ul'), host = stack.length ? stack[stack.length - 1].el.lastElementChild : null;
        if(host) host.appendChild(list); else { p.parentNode.insertBefore(list, p); root = list; }
        stack.push({ el: list, level: level, ordered: ordered });
      }
      var li = body.ownerDocument.createElement('li'); li.innerHTML = p.innerHTML;
      stack[stack.length - 1].el.appendChild(li); p.remove();
    });
  }
  function cleanPaste(html){
    var word = /urn:schemas-microsoft-com|mso-|<o:p/i.test(html), gdocs = /docs-internal-guid/i.test(html);
    if(!word && !gdocs) return html;
    var doc = new DOMParser().parseFromString(html, 'text/html'), body = doc.body;
    all(body, 'style, meta, link, xml, title').forEach(function(n){ n.remove(); });
    if(word){
      wordLists(body);
      all(body, '*').forEach(function(n){ if(n.tagName.indexOf(':') > 0){ while(n.firstChild) n.parentNode.insertBefore(n.firstChild, n); n.remove(); } });   // <o:p> and its kin
    }
    if(gdocs) all(body, 'a span').forEach(function(s){ if(/underline/.test(s.style.textDecoration + s.style.textDecorationLine)){ s.style.textDecoration = 'none'; s.style.textDecorationLine = 'none'; } });
    return body.innerHTML;
  }
  K.cleanPaste = cleanPaste;
})();

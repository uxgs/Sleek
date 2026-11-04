/* The deck's theme (Theme menu): mode, accent, gradient style and color, motion, effect, font.

   Saved with the deck: data/seed.js has `theme`. A change you make sits on this device (localStorage)
   until Save Changes writes it into the seed, like every other edit; Revert to Last Save drops it.
   Each setting is: your unsaved change, else the seed, else the default.

   Loaded in the <head> of the deck and the start screen, right after data/seed.js, so the page paints in the
   right theme from the first frame. */
(function(){
  var KEYS = { mode: 'deck-theme', accent: 'deck-accent', glow: 'deck-glow', glowColor: 'deck-glow-color',
               motion: 'deck-glow-motion', fx: 'deck-glow-fx', font: 'deck-font-css' };
  var DEFAULTS = { mode: 'dark', accent: '#0A84FF', glow: 'aurora', glowColor: 'dusk', motion: 'off', fx: 'smoke', font: null };
  function seed(){ return (window.SEED && window.SEED.theme) || {}; }
  function local(k){
    var v = null;
    try { v = localStorage.getItem(KEYS[k]); } catch(e){}
    if(k === 'font' && v != null){ try { v = JSON.parse(v); } catch(e){ v = null; } }
    return v;
  }
  function base(k){ var s = seed(); return s[k] != null ? s[k] : DEFAULTS[k]; }
  function same(a, b){ return JSON.stringify(a == null ? null : a) === JSON.stringify(b == null ? null : b); }
  var T = window.DeckTheme = {
    keys: KEYS,
    get: function(k){ var v = local(k); return v != null ? v : base(k); },
    // write a change (the deck's Theme menu); a value equal to the seed's is just "no change"
    set: function(k, v){
      try {
        if(same(v, base(k))) localStorage.removeItem(KEYS[k]);
        else localStorage.setItem(KEYS[k], k === 'font' ? JSON.stringify(v) : v);
      } catch(e){}
    },
    pending: function(){ return Object.keys(KEYS).some(function(k){ var v = local(k); return v != null && !same(v, base(k)); }); },
    snapshot: function(){ var o = {}; Object.keys(KEYS).forEach(function(k){ o[k] = T.get(k); }); return o; },
    clear: function(){ try { Object.keys(KEYS).forEach(function(k){ localStorage.removeItem(KEYS[k]); }); } catch(e){} },
    // put it on <html>: data-theme, --accent, the glow attributes, the slide font and its sheet
    paint: function(){
      var de = document.documentElement;
      if(T.get('mode') === 'light') de.removeAttribute('data-theme'); else de.setAttribute('data-theme', 'dark');
      de.style.setProperty('--accent', T.get('accent'));
      de.setAttribute('data-glow', T.get('glow')); de.setAttribute('data-glow-color', T.get('glowColor'));
      if(T.get('motion') === 'on') de.setAttribute('data-glow-motion', 'on'); else de.removeAttribute('data-glow-motion');
      de.setAttribute('data-glow-fx', T.get('fx'));
      var f = T.get('font'), sheet = document.getElementById('font-sheet');
      if(f && f.v && f.v !== 'inter'){
        de.setAttribute('data-font', f.v); de.style.setProperty('--slide-display', f.d); de.style.setProperty('--slide-body', f.b);
        if(f.href){ if(!sheet){ sheet = document.createElement('link'); sheet.rel = 'stylesheet'; sheet.id = 'font-sheet'; document.head.appendChild(sheet); } if(sheet.getAttribute('href') !== f.href) sheet.href = f.href; }
      } else {
        de.setAttribute('data-font', 'inter'); de.style.removeProperty('--slide-display'); de.style.removeProperty('--slide-body');
        if(sheet) sheet.remove();
      }
    }
  };
  try { T.paint(); } catch(e){ document.documentElement.setAttribute('data-theme', 'dark'); }
})();

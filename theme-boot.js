/* The deck's theme (Theme menu): mode, accent, gradient style and color, motion, effect and its opacity, font.

   Saved with the deck: its seed has `theme`. A change from the Theme menu is kept for this deck
   (localStorage, under the deck's own keys) and saves into the seed with every other edit.
   Each setting is: that change, else the seed, else the default.

   Loaded in the <head> of the deck and the start screen, once the deck is loaded (core/boot.js), so the page paints in the
   right theme from the first frame. */
(function(){
  var NS = window.SLEEK_NS || '';               // the open deck's own keys (core/store.js); none on the start screen
  var KEYS = { mode: NS + 'deck-theme', accent: NS + 'deck-accent', glow: NS + 'deck-glow', glowColor: NS + 'deck-glow-color',
               motion: NS + 'deck-glow-motion', fx: NS + 'deck-glow-fx', fxo: NS + 'deck-glow-fx-o', font: NS + 'deck-font-css' };
  var DEFAULTS = { mode: 'dark', accent: '#0A84FF', glow: 'aurora', glowColor: 'dusk', motion: 'off', fx: 'smoke', fxo: '50', font: null };
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
    // the effect's opacity, 0 to 100 (50 is the effect as designed), as a multiplier for its CSS
    fxK: function(){ var v = parseFloat(T.get('fxo')); return isNaN(v) ? 1 : Math.max(0, Math.min(100, v)) / 50; },
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
      de.style.setProperty('--fx-k', String(T.fxK()));
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

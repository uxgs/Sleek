/* Google Analytics, for the hosted site only. It stays quiet anywhere else: a copy run from the
   zip, a local server, a published deck (publishing leaves this file out), the presenter's
   windows and its live preview. Each visit is counted as "Start screen" or "Deck", with the
   address trimmed to the page, so deck names and deck ids are never sent. */
(function(){
  var ID = 'G-BQMRCNNXKF';                // the Measurement ID (G-…) from Analytics > Admin > Data streams
  var HOST = '1fhyi5b';         // a hash of the hosted site's address, so copies hosted elsewhere stay quiet
  function hash(s){ var x = 2166136261; for(var i = 0; i < s.length; i++){ x ^= s.charCodeAt(i); x = Math.imul(x, 16777619) >>> 0; } return x.toString(36); }
  try {
    if(!ID || hash(location.hostname) !== HOST) return;
    if(/[?&]mirror=1/.test(location.search) || /^#presenter/.test(location.hash) || window.top !== window) return;
  } catch(e){ return; }
  var deck = /deck\.html$/.test(location.pathname);
  window.dataLayer = window.dataLayer || [];
  window.gtag = function(){ window.dataLayer.push(arguments); };
  window.gtag('js', new Date());
  window.gtag('config', ID, {
    page_title: deck ? 'Deck' : 'Start screen',
    page_location: location.origin + location.pathname
  });
  var s = document.createElement('script');
  s.async = true; s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(ID);
  document.head.appendChild(s);
})();

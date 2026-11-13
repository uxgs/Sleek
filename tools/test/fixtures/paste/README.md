Paste samples for Sleek Docs' paste cleaning (doc/paste.js).

`gdocs-modelled.html` and `word-modelled.html` are written by hand to the shape Google Docs and
Word put on the clipboard (Google's `font-weight:normal` wrapper and inline-styled spans; Word's
`mso-list` paragraphs with the bullet typed as text). They are stand-ins: replace them with real
captures (copy in the app, paste into a page that prints `clipboardData.getData('text/html')`)
before relying on them.

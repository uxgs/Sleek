#!/usr/bin/env python3
"""Puts the fonts Sleek's pages use inside the app.

Slides, Docs and Tasks ask Google Fonts for their type (Inter, and Instrument Serif in Docs). Inside
the browser that would mean a trip to the web every time one opens, and the wrong type with no
connection. This reads the app's copy of the pages, fetches each font stylesheet they ask for and
the font files it names (once: they are kept in build/fonts and reused), and points the pages at the
copies inside the app instead. Both fonts are under the SIL Open Font License, which allows this.

  python3 fonts.py <the app's copy of the site> <where fetched fonts are kept>

A font that cannot be fetched is left as it was: that page asks the web for it, as before.
"""
import hashlib, os, re, shutil, subprocess, sys

app, cache = sys.argv[1], sys.argv[2]
UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'
LINK = re.compile(r'href="(https://fonts\.googleapis\.com/css2\?[^"]+)"')


def fetch(url):
    # curl, which every Mac has and which trusts what the Mac trusts
    got = subprocess.run(['curl', '-sfL', '--max-time', '30', '-A', UA, url], capture_output=True)
    if got.returncode != 0 or not got.stdout:
        raise RuntimeError('no answer from ' + url.split('/')[2])
    return got.stdout


def short(text, n):
    return hashlib.sha1(text.encode()).hexdigest()[:n]


os.makedirs(cache, exist_ok=True)
out = os.path.join(app, 'fonts')
os.makedirs(out, exist_ok=True)
sheets = {}          # a stylesheet's address on the web -> its name inside the app (None when it could not be had)
pages = 0
for name in sorted(os.listdir(app)):
    if not name.endswith('.html'):
        continue
    path = os.path.join(app, name)
    html = open(path, encoding='utf-8').read()
    changed = False
    for url in sorted(set(LINK.findall(html))):
        real = url.replace('&amp;', '&')
        if real not in sheets:
            css_name = 'f-' + short(real, 10) + '.css'
            kept = os.path.join(cache, css_name)
            try:
                if not os.path.exists(kept):
                    css = fetch(real).decode('utf-8')
                    for font in sorted(set(re.findall(r'url\((https://fonts\.gstatic\.com/[^)]+)\)', css))):
                        file_name = short(font, 12) + os.path.splitext(font)[1]
                        if not os.path.exists(os.path.join(cache, file_name)):
                            open(os.path.join(cache, file_name), 'wb').write(fetch(font))
                        css = css.replace(font, file_name)
                    open(kept, 'w', encoding='utf-8').write(css)
                css = open(kept, encoding='utf-8').read()
                open(os.path.join(out, css_name), 'w', encoding='utf-8').write(css)
                for file_name in sorted(set(re.findall(r'url\(([0-9a-f]{12}\.[a-z0-9]+)\)', css))):
                    shutil.copyfile(os.path.join(cache, file_name), os.path.join(out, file_name))
                sheets[real] = css_name
            except Exception as why:      # no connection, most likely
                print('could not fetch a font (' + str(why) + '); ' + name + ' will ask the web for it')
                sheets[real] = None
        if sheets[real]:
            html = html.replace('href="' + url + '"', 'href="fonts/' + sheets[real] + '"')
            changed = True
    if changed:
        html = re.sub(r'<link rel="preconnect" href="https://fonts\.(googleapis|gstatic)\.com"[^>]*>\n?', '', html)
        open(path, 'w', encoding='utf-8').write(html)
        pages += 1
print('fonts inside the app for ' + str(pages) + ' pages')

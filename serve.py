#!/usr/bin/env python3
"""Serve the deck locally and let it save your edits into data/seed.js.

    python3 serve.py          # http://localhost:8000
    python3 serve.py 8080     # another port

Use this instead of `python3 -m http.server`. It serves the folder the same way, and adds
one thing: the deck's "Save Changes" button (edit mode) POSTs to /api/save, which writes
data/seed.js and any images you added into images/. The previous seed is copied to
data/backups/ first, so a save can always be undone by copying a backup back.

It only listens on this computer (localhost), never on your network.
"""
import base64
import json
import os
import re
import shutil
import socket
import sys
import threading
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, quote, urlsplit

ROOT = os.path.dirname(os.path.abspath(__file__))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
IMG_PATH = re.compile(r'^images/[A-Za-z0-9_-]+\.(png|jpg|webp|gif|svg|mp4|webm|mov)$')
DATA_URL = re.compile(r'^data:(?:image/(?:png|jpe?g|webp|gif|svg\+xml)|video/(?:mp4|webm|quicktime));base64,(.+)$', re.S)
LOCAL_ORIGIN = re.compile(r'^http://(localhost|127\.0\.0\.1|\[::1\]):%d$' % PORT)
MAX_BODY = 300 * 1024 * 1024  # images arrive base64-encoded


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        # always serve the latest seed/app, never a cached copy
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Accept-Ranges', 'bytes')
        super().end_headers()

    def _send_range(self, path, rng):
        """Byte ranges, so big videos start at once and can be scrubbed (browsers ask in pieces)."""
        m = re.match(r'bytes=(\d*)-(\d*)$', rng.strip())
        if not m:
            return False
        size = os.path.getsize(path)
        if m.group(1) == '':
            start, end = max(0, size - int(m.group(2) or 0)), size - 1
        else:
            start = int(m.group(1))
            end = min(int(m.group(2)) if m.group(2) else size - 1, size - 1)
        if start >= size or start > end:
            self.send_response(416)
            self.send_header('Content-Range', 'bytes */%d' % size)
            self.send_header('Content-Length', '0')
            self.end_headers()
            return True
        self.send_response(206)
        self.send_header('Content-Type', self.guess_type(path))
        self.send_header('Content-Range', 'bytes %d-%d/%d' % (start, end, size))
        self.send_header('Content-Length', str(end - start + 1))
        self.end_headers()
        try:
            with open(path, 'rb') as fh:
                fh.seek(start)
                left = end - start + 1
                while left > 0:
                    chunk = fh.read(min(256 * 1024, left))
                    if not chunk:
                        break
                    self.wfile.write(chunk)
                    left -= len(chunk)
        except (BrokenPipeError, ConnectionResetError):
            pass  # the browser moved on (a seek, or the tab closed)
        return True

    def _json(self, code, obj):
        body = json.dumps(obj).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == '/api/ping':
            return self._json(200, {'ok': True})
        if self.path.startswith('/api/find?'):
            return self._find()
        rng = self.headers.get('Range')
        if rng:
            path = self.translate_path(self.path)
            if os.path.isfile(path) and self._send_range(path, rng):
                return
        return super().do_GET()

    def _find(self):
        """A picture picked in edit mode that's already in the project (same name, same size): its
        path, so the tile links to the file and picks up a replacement instead of keeping a copy."""
        q = parse_qs(urlsplit(self.path).query)
        name = os.path.basename((q.get('name') or [''])[0])
        try:
            size = int((q.get('size') or ['-1'])[0])
        except ValueError:
            size = -1
        hits = []
        if name and size >= 0:
            for d, dirs, files in os.walk(ROOT):
                dirs[:] = [x for x in dirs if not x.startswith('.') and x not in ('data', 'node_modules')]
                if name in files and os.path.getsize(os.path.join(d, name)) == size:
                    hits.append(os.path.relpath(os.path.join(d, name), ROOT).replace(os.sep, '/'))
        hits.sort(key=lambda p: (p.startswith('images/'), len(p)))   # a project folder over a saved copy
        return self._json(200, {'ok': True, 'path': quote(hits[0]) if hits else None})

    def do_POST(self):
        if self.path != '/api/save':
            return self._json(404, {'ok': False, 'error': 'not found'})
        origin = self.headers.get('Origin', '')
        if origin and not LOCAL_ORIGIN.match(origin):
            return self._json(403, {'ok': False, 'error': 'saves are only accepted from the deck on this computer'})
        length = int(self.headers.get('Content-Length') or 0)
        if length <= 0 or length > MAX_BODY:
            return self._json(413, {'ok': False, 'error': 'request too large or empty'})
        try:
            payload = json.loads(self.rfile.read(length))
        except ValueError:
            return self._json(400, {'ok': False, 'error': 'not JSON'})

        seed = payload.get('seed')
        if not isinstance(seed, dict) or not isinstance(seed.get('notes'), list):
            return self._json(400, {'ok': False, 'error': 'missing seed'})

        # check every image before writing anything
        images = []
        for f in payload.get('files') or []:
            path = (f or {}).get('path', '')
            m = DATA_URL.match((f or {}).get('data', ''))
            if not IMG_PATH.match(path) or not m:
                return self._json(400, {'ok': False, 'error': 'bad image entry: %s' % path[:80]})
            images.append((path, base64.b64decode(m.group(1))))

        seed_path = os.path.join(ROOT, 'data', 'seed.js')
        backup_dir = os.path.join(ROOT, 'data', 'backups')
        os.makedirs(backup_dir, exist_ok=True)
        stamp = time.strftime('%Y%m%d-%H%M%S')
        backup = None
        if os.path.exists(seed_path):
            backup = 'data/backups/seed-%s.js' % stamp
            shutil.copy2(seed_path, os.path.join(ROOT, backup))

        os.makedirs(os.path.join(ROOT, 'images'), exist_ok=True)
        for path, data in images:
            with open(os.path.join(ROOT, path), 'wb') as fh:
                fh.write(data)

        tmp = seed_path + '.tmp'
        with open(tmp, 'w', encoding='utf-8') as fh:
            fh.write('window.SEED = ' + json.dumps(seed, ensure_ascii=False, indent=2) + ';\n')
        os.replace(tmp, seed_path)  # atomic: the seed is never half-written

        print('saved data/seed.js (%d image%s)%s' % (len(images), '' if len(images) == 1 else 's',
              ', backup ' + backup if backup else ''))
        return self._json(200, {'ok': True, 'backup': backup, 'images': len(images)})


class V6Server(ThreadingHTTPServer):
    address_family = socket.AF_INET6


def main():
    # localhost resolves to either 127.0.0.1 or ::1 depending on the browser; listen on both
    servers = [ThreadingHTTPServer(('127.0.0.1', PORT), Handler)]
    try:
        servers.append(V6Server(('::1', PORT), Handler))
    except OSError:
        pass
    for s in servers[1:]:
        threading.Thread(target=s.serve_forever, daemon=True).start()
    print('Deck: http://localhost:%d   (Ctrl+C to stop)' % PORT)
    try:
        servers[0].serve_forever()
    except KeyboardInterrupt:
        print()


if __name__ == '__main__':
    main()

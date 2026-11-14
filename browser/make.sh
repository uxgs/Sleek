#!/bin/bash
# Builds Sleek.app into browser/build.
#   ./make.sh          build the app
#   ./make.sh test     build it, then have it check itself (pictures go to build/selftest)
# The app holds: the program, the bar's own pages (Resources/chrome), a copy of Slides, Docs and
# Tasks (Resources/app, from the folder above this one), the block lists, and the icon. It is signed for this Mac only;
# signing it for everyone else needs an Apple Developer account and comes with the public release.
set -euo pipefail
cd "$(dirname "$0")"
swift build -c release 2>&1 | grep -E "error|warning: unre|Build complete" || true
APP=build/Sleek.app
rm -rf "$APP"; mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp .build/release/Sleek "$APP/Contents/MacOS/Sleek"
cp Resources/Info.plist "$APP/Contents/Info.plist"
cp -R Resources/chrome "$APP/Contents/Resources/chrome"
cp Resources/Sleek.icns "$APP/Contents/Resources/Sleek.icns"
# The block lists: a copy inside the app, so blocking works from the first launch. They are fetched from
# where they are published (not kept in this repository), again when the copy here is over four days old.
# A fetch that fails or comes back too small is left aside, and the copy already here is used.
mkdir -p build/lists "$APP/Contents/Resources/lists"
for pair in "ads=https://easylist.to/easylist/easylist.txt" "privacy=https://easylist.to/easylist/easyprivacy.txt" "cookies=https://secure.fanboy.co.nz/fanboy-cookiemonster.txt"; do
  name="${pair%%=*}"; url="${pair#*=}"; file="build/lists/$name.txt"
  if [ ! -s "$file" ] || [ -n "$(find "$file" -mtime +4 2>/dev/null)" ]; then
    if curl -sL --max-time 60 -A "Sleek" -o "build/lists/$name.fetched" "$url" && [ "$(wc -c < "build/lists/$name.fetched")" -gt 50000 ]; then mv "build/lists/$name.fetched" "$file"; else echo "could not fetch $name; using the copy here, if any"; fi
  fi
  if [ -s "$file" ]; then cp "$file" "$APP/Contents/Resources/lists/$name.txt"; fi
done
cp Resources/lists-credits.txt "$APP/Contents/Resources/lists/CREDITS.txt"
# Slides, Docs and Tasks: the site itself, without what only its makers need
rsync -a --exclude '.git' --exclude '.DS_Store' --exclude 'browser' --exclude 'tools' --exclude 'service' --exclude '__pycache__' --exclude 'node_modules' --exclude 'README.md' --exclude 'LICENSE' --exclude '.claude' --exclude 'data/backups' ../ "$APP/Contents/Resources/app/"
codesign --force --deep --sign - "$APP" 2>/dev/null
echo "built $APP ($(du -sh "$APP" | cut -f1))"
if [ "${1:-}" = "test" ]; then rm -rf build/selftest; "$APP/Contents/MacOS/Sleek" --selftest "$(pwd)/build/selftest"; fi

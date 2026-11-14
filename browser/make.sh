#!/bin/bash
# Builds Sleek.app into browser/build.
#   ./make.sh          build the app
#   ./make.sh test     build it, then have it check itself (pictures go to build/selftest)
# The app holds: the program, the bar's own pages (Resources/chrome), a copy of Slides, Docs and
# Tasks (Resources/app, from the folder above this one), and the icon. It is signed for this Mac only;
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
# Slides, Docs and Tasks: the site itself, without what only its makers need
rsync -a --exclude '.git' --exclude '.DS_Store' --exclude 'browser' --exclude 'tools' --exclude 'service' --exclude '__pycache__' --exclude 'node_modules' --exclude 'README.md' --exclude 'LICENSE' --exclude '.claude' --exclude 'data/backups' ../ "$APP/Contents/Resources/app/"
codesign --force --deep --sign - "$APP" 2>/dev/null
echo "built $APP ($(du -sh "$APP" | cut -f1))"
if [ "${1:-}" = "test" ]; then rm -rf build/selftest; "$APP/Contents/MacOS/Sleek" --selftest "$(pwd)/build/selftest"; fi

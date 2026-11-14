#!/bin/bash
# Builds Sleek for iPhone.
#   ./make.sh                 build for the Simulator
#   ./make.sh check           build, then have the app check itself in the Simulator that is running
#   ./make.sh phone <team>    build for a real iPhone, signed with your Apple development team, and
#                             install it on the iPhone that is connected (its id is found for you)
# What goes inside the app is gathered into build/inside first: a copy of Slides, Docs and Tasks with
# their fonts, the block lists and fonts the Mac build fetched (run ../browser/make.sh once before
# this), the page that is the app's door to your Sleek work, and the list of well-known sites.
# You need Xcode and xcodegen (brew install xcodegen).
set -euo pipefail
cd "$(dirname "$0")"
SITE=..
if [ ! -s "$SITE/browser/build/lists/ads.txt" ]; then echo "Run ../browser/make.sh once first: it fetches the block lists this app carries."; exit 1; fi
mkdir -p build/inside/app build/inside/lists build/inside/chrome
rsync -a --delete --exclude '.git' --exclude '.DS_Store' --exclude 'browser' --exclude 'ios' --exclude 'ios-*' --exclude 'tools' --exclude 'service' --exclude '__pycache__' --exclude 'node_modules' --exclude 'README.md' --exclude 'LICENSE' --exclude '.claude' --exclude 'data/backups' "$SITE/" build/inside/app/
python3 "$SITE/browser/fonts.py" build/inside/app "$SITE/browser/build/fonts" || echo "fonts were not put inside the app"
cp "$SITE"/browser/build/lists/*.txt build/inside/lists/
cp "$SITE/browser/Resources/lists-credits.txt" build/inside/lists/CREDITS.txt
cp "$SITE/browser/Resources/chrome/bridge.html" build/inside/chrome/bridge.html
cp "$SITE/browser/Resources/sites.txt" build/inside/sites.txt
if [ -s "$SITE/browser/build/sites-more.txt" ]; then
  python3 -c 'import sys
base = [l for l in open(sys.argv[1]).read().split("\n") if l]
for l in sorted(open(sys.argv[2]).read().split("\n")):
    p = l.split(" ", 1)
    if len(p) == 2 and p[0].isdigit(): base.insert(min(int(p[0]), len(base)), p[1])
open(sys.argv[1], "w").write("\n".join(base) + "\n")' build/inside/sites.txt "$SITE/browser/build/sites-more.txt"
fi
# words for the passwords Sleek makes (the Mac's own word list: short, plain, lower-case words)
grep -E '^[a-z]{4,7}$' /usr/share/dict/words > build/inside/words.txt
xcodegen generate --quiet
if [ "${1:-}" = "phone" ]; then
  TEAM="${2:?Give your Apple development team, as in: ./make.sh phone ABCDE12345}"
  PHONE="$(xcrun devicectl list devices 2>/dev/null | grep -E 'available \(paired\)|connected' | grep -i iphone | grep -v simulated | grep -oE '[0-9A-F]{8}-[0-9A-F]{16}' | head -1)"
  if [ -z "$PHONE" ]; then echo "No iPhone is connected and unlocked."; exit 1; fi
  xcodebuild -project Sleek.xcodeproj -scheme Sleek -configuration Debug -destination "id=$PHONE" -derivedDataPath build/phone CODE_SIGN_STYLE=Automatic DEVELOPMENT_TEAM="$TEAM" CODE_SIGN_IDENTITY="Apple Development" -allowProvisioningUpdates build 2>&1 | grep -E "error:|BUILD (SUCCEEDED|FAILED)" || true
  xcrun devicectl device install app --device "$PHONE" build/phone/Build/Products/Debug-iphoneos/Sleek.app | grep -E "App installed|error" || true
  xcrun devicectl device process launch --device "$PHONE" com.sleek.browser | grep -E "Launched|error" || true
  exit 0
fi
xcodebuild -project Sleek.xcodeproj -scheme Sleek -sdk iphonesimulator -configuration Debug -destination "generic/platform=iOS Simulator" -derivedDataPath build/sim build 2>&1 | grep -E "error:|BUILD (SUCCEEDED|FAILED)" || true
APP="$(pwd)/build/sim/Build/Products/Debug-iphonesimulator/Sleek.app"
echo "app: $APP"
if [ "${1:-}" = "check" ]; then
  xcrun simctl terminate booted com.sleek.browser 2>/dev/null || true
  xcrun simctl install booted "$APP"
  xcrun simctl launch --console booted com.sleek.browser --prove 2>&1 | grep -vE "UIAccessibilityLoaderWebShared|^com\.sleek|^\s*$" || true
fi

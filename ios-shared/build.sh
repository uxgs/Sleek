#!/bin/bash
# Builds one of the iPhone apps that carry Sleek's own pages inside (Sleek Docs, Sleek Slides).
# Each app's make.sh calls this from its own folder:   ../ios-shared/build.sh <Scheme> <bundle id> [check | phone <team>]
#   (nothing)        build for the Simulator
#   check            build, then have the app check itself in the Simulator that is running
#   phone <team>     build for a real iPhone, signed with your Apple development team, and install it
# What goes inside the app is gathered into build/inside first: a copy of Sleek's pages with their fonts
# (run ../browser/make.sh once before this: it fetches the fonts), and the page that is the app's door to
# the work those pages keep. You need Xcode and xcodegen (brew install xcodegen).
set -euo pipefail
NAME="$1"; ID="$2"; DO="${3:-}"
SITE=..
mkdir -p build/inside/app build/inside/chrome
rsync -a --delete --exclude '.git' --exclude '.DS_Store' --exclude 'browser' --exclude 'ios' --exclude 'ios-*' --exclude 'tools' --exclude 'service' --exclude '__pycache__' --exclude 'node_modules' --exclude 'README.md' --exclude 'LICENSE' --exclude '.claude' --exclude 'data/backups' "$SITE/" build/inside/app/
python3 "$SITE/browser/fonts.py" build/inside/app "$SITE/browser/build/fonts" >/dev/null || echo "fonts were not put inside the app"
cp "$SITE/browser/Resources/chrome/bridge.html" build/inside/chrome/bridge.html
xcodegen generate --quiet
if [ "$DO" = "phone" ]; then
  TEAM="${4:?Give your Apple development team, as in: ./make.sh phone ABCDE12345}"
  PHONE="$(xcrun devicectl list devices 2>/dev/null | grep -E 'available \(paired\)|connected' | grep -i iphone | grep -v simulated | grep -oE '[0-9A-F]{8}-[0-9A-F]{16}' | head -1)"
  if [ -z "$PHONE" ]; then echo "No iPhone is connected and unlocked."; exit 1; fi
  xcodebuild -project "$NAME.xcodeproj" -scheme "$NAME" -configuration Debug -destination "id=$PHONE" -derivedDataPath build/phone CODE_SIGN_STYLE=Automatic DEVELOPMENT_TEAM="$TEAM" CODE_SIGN_IDENTITY="Apple Development" -allowProvisioningUpdates build 2>&1 | grep -E "error:|BUILD (SUCCEEDED|FAILED)" || true
  xcrun devicectl device install app --device "$PHONE" "build/phone/Build/Products/Debug-iphoneos/$NAME.app" 2>&1 | grep -E "App installed|error" || true
  xcrun devicectl device process launch --device "$PHONE" "$ID" 2>&1 | grep -E "Launched|Locked|error" || true
  exit 0
fi
xcodebuild -project "$NAME.xcodeproj" -scheme "$NAME" -sdk iphonesimulator -configuration Debug -destination "generic/platform=iOS Simulator" -derivedDataPath build/sim build 2>&1 | grep -E "error:|BUILD (SUCCEEDED|FAILED)" || true
APP="$(pwd)/build/sim/Build/Products/Debug-iphonesimulator/$NAME.app"
echo "app: $APP"
if [ "$DO" = "check" ]; then
  xcrun simctl terminate booted "$ID" 2>/dev/null || true
  xcrun simctl install booted "$APP"
  xcrun simctl launch --console booted "$ID" --prove 2>&1 | grep -E "ok |FAIL|passed|FAILED" || true
fi

#!/bin/bash
# Builds Sleek Tasks for iPhone. You need Xcode and xcodegen (brew install xcodegen).
#   ./make.sh                 build for the Simulator
#   ./make.sh check           build, then have the app check itself in the Simulator that is running
#   ./make.sh phone <team>    build for a real iPhone, signed with your Apple development team, and
#                             install it on the iPhone that is connected
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p build
xcodegen generate --quiet
if [ "${1:-}" = "phone" ]; then
  TEAM="${2:?Give your Apple development team, as in: ./make.sh phone ABCDE12345}"
  PHONE="$(xcrun devicectl list devices 2>/dev/null | grep -E 'available \(paired\)|connected' | grep -i iphone | grep -v simulated | grep -oE '[0-9A-F]{8}-[0-9A-F]{16}' | head -1)"
  if [ -z "$PHONE" ]; then echo "No iPhone is connected and unlocked."; exit 1; fi
  # The project xcodegen made (it is not kept in git) is told to sign itself for your team. Passing the team to
  # xcodebuild alone signs the app, but Xcode then leaves the App Group the Sleek apps share out of the profile.
  case "$TEAM" in *[!A-Za-z0-9]*) echo "That does not look like a team: $TEAM"; exit 1;; esac
  sed -i '' -e "s/DevelopmentTeam = \"\";/DevelopmentTeam = $TEAM;/" -e "s/DEVELOPMENT_TEAM = \"\";/DEVELOPMENT_TEAM = $TEAM;/" -e 's/ProvisioningStyle = Manual;/ProvisioningStyle = Automatic;/' -e 's/CODE_SIGN_STYLE = Manual;/CODE_SIGN_STYLE = Automatic;/' -e 's/CODE_SIGN_IDENTITY = "-";/CODE_SIGN_IDENTITY = "Apple Development";/' SleekTasks.xcodeproj/project.pbxproj
  OUT="$(xcodebuild -project SleekTasks.xcodeproj -scheme SleekTasks -configuration Debug -destination "id=$PHONE" -derivedDataPath build/phone CODE_SIGN_STYLE=Automatic DEVELOPMENT_TEAM="$TEAM" CODE_SIGN_IDENTITY="Apple Development" -allowProvisioningUpdates build 2>&1 || true)"; echo "$OUT" | grep -E "error:|BUILD (SUCCEEDED|FAILED)" || true
  if ! echo "$OUT" | grep -q "BUILD SUCCEEDED"; then echo "Not installed: the build failed, so the app on the iPhone was left as it was."; exit 1; fi
  xcrun devicectl device install app --device "$PHONE" build/phone/Build/Products/Debug-iphoneos/SleekTasks.app 2>&1 | grep -E "App installed|error" || true
  xcrun devicectl device process launch --device "$PHONE" com.sleek.tasks 2>&1 | grep -E "Launched|Locked|error" || true
  exit 0
fi
xcodebuild -project SleekTasks.xcodeproj -scheme SleekTasks -sdk iphonesimulator -configuration Debug -destination "generic/platform=iOS Simulator" -derivedDataPath build/sim build 2>&1 | grep -E "error:|BUILD (SUCCEEDED|FAILED)" || true
APP="$(pwd)/build/sim/Build/Products/Debug-iphonesimulator/SleekTasks.app"
echo "app: $APP"
if [ "${1:-}" = "check" ]; then
  xcrun simctl terminate booted com.sleek.tasks 2>/dev/null || true
  xcrun simctl install booted "$APP"
  xcrun simctl launch --console booted com.sleek.tasks --prove 2>&1 | grep -E "ok |FAIL|passed|FAILED" || true
fi

#!/bin/bash
set -euo pipefail

app_path="$1"
output_path="$2"
version="$3"
work_dir="$(mktemp -d)"
mount_dir="$(mktemp -d)"
staging="$(mktemp -u "${TMPDIR:-/tmp}/blink-staging.XXXXXX.dmg")"
trap 'hdiutil detach "$mount_dir" -quiet 2>/dev/null || true; rm -rf "$work_dir" "$mount_dir" "$staging"' EXIT

mkdir -p "$work_dir/.background"
cp -R "$app_path" "$work_dir/Blink.app"
ln -s /Applications "$work_dir/Applications"
cp "$(dirname "$0")/README - macOS.txt" "$work_dir/README - macOS.txt"
qlmanage -t -s 1200 -o "$work_dir/.background" "$(dirname "$0")/dmg-background.svg" >/dev/null 2>&1
mv "$work_dir/.background/dmg-background.svg.png" "$work_dir/.background/background.png"

hdiutil create -volname "Blink" -srcfolder "$work_dir" -ov -format UDRW "$staging" >/dev/null
hdiutil attach "$staging" -mountpoint "$mount_dir" -nobrowse -quiet

osascript <<APPLESCRIPT
tell application "Finder"
  set volumeRoot to POSIX file "$mount_dir" as alias
  set containerWindow to make new Finder window to volumeRoot
  set current view of containerWindow to icon view
  set toolbar visible of containerWindow to false
  set statusbar visible of containerWindow to false
  set bounds of containerWindow to {120, 120, 1020, 680}
  set arrangement of icon view options of containerWindow to not arranged
  set icon size of icon view options of containerWindow to 96
  set position of item "Blink.app" of containerWindow to {230, 280}
  set position of item "Applications" of containerWindow to {670, 280}
  set position of item "README - macOS.txt" of containerWindow to {450, 500}
  set background picture of icon view options of containerWindow to POSIX file "$mount_dir/.background/background.png"
  close containerWindow
end tell
APPLESCRIPT

hdiutil detach "$mount_dir" -quiet
hdiutil convert "$staging" -format UDZO -imagekey zlib-level=9 -ov -o "$output_path" >/dev/null

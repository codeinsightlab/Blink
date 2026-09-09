#!/bin/bash
set -euo pipefail

app_path="$1"
output_path="$2"
version="$3"
work_dir="$(mktemp -d)"
mount_dir="$(mktemp -d)"
trap 'hdiutil detach "$mount_dir" -quiet 2>/dev/null || true; rm -rf "$work_dir" "$mount_dir"' EXIT

mkdir -p "$work_dir/.background"
cp -R "$app_path" "$work_dir/Blink.app"
ln -s /Applications "$work_dir/Applications"
cp "$(dirname "$0")/README - macOS.txt" "$work_dir/README - macOS.txt"
qlmanage -t -s 1200 -o "$work_dir/.background" "$(dirname "$0")/dmg-background.svg" >/dev/null 2>&1
mv "$work_dir/.background/dmg-background.svg.png" "$work_dir/.background/background.png"

staging="$work_dir/Blink-$version.dmg"
hdiutil create -volname "Blink" -srcfolder "$work_dir" -ov -format UDRW "$staging" >/dev/null
hdiutil attach "$staging" -mountpoint "$mount_dir" -nobrowse -quiet

osascript <<APPLESCRIPT
tell application "Finder"
  tell disk "Blink"
    open
    set current view of container window to icon view
    set toolbar visible of container window to false
    set statusbar visible of container window to false
    set bounds of container window to {120, 120, 1020, 680}
    set arrangement of icon view options of container window to not arranged
    set icon size of icon view options of container window to 96
    set position of item "Blink.app" to {230, 280}
    set position of item "Applications" to {670, 280}
    set position of item "README - macOS.txt" to {450, 500}
    set background picture of icon view options of container window to file ".background:background.png"
    close
  end tell
end tell
APPLESCRIPT

hdiutil detach "$mount_dir" -quiet
hdiutil convert "$staging" -format UDZO -imagekey zlib-level=9 -ov -o "$output_path" >/dev/null

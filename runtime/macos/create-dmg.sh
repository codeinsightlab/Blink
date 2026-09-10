#!/bin/bash
set -euo pipefail

app_path="$1"
output_path="$2"
version="$3"
work_dir="$(mktemp -d)"
trap 'rm -rf "$work_dir"' EXIT

mkdir -p "$work_dir/.background"
cp -R "$app_path" "$work_dir/Blink.app"
ln -s /Applications "$work_dir/Applications"
cp "$(dirname "$0")/README - macOS.txt" "$work_dir/README - macOS.txt"
cp "$(dirname "$0")/dmg-background.png" "$work_dir/.background/background.png"
cp "$(dirname "$0")/dmg-window.DS_Store" "$work_dir/.DS_Store"

hdiutil create -volname "Blink" -srcfolder "$work_dir" -ov -format UDZO -imagekey zlib-level=9 "$output_path" >/dev/null

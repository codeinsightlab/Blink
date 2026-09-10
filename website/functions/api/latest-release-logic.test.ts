import assert from "node:assert/strict";
import { classifyReleaseAsset, selectReleaseAssets, type ReleaseAsset } from "./latest-release-logic.ts";

const asset = (name: string): ReleaseAsset => ({ name, browser_download_url: `https://example.test/${name}` });

const arm64 = asset("Blink_0.1.10_aarch64.dmg");
const x64Mac = asset("Blink_0.1.10_x64.dmg");
const universal = asset("Blink_0.1.10_universal.dmg");
const windows = asset("Blink_0.1.10_x64-setup.exe");
const updater = asset("Blink_0.1.10_aarch64-updater.dmg");

assert.equal(selectReleaseAssets([arm64]).macosArm64, arm64.browser_download_url, "A: selects the arm64 installer");

const mixedMac = selectReleaseAssets([x64Mac, arm64]);
assert.equal(mixedMac.macosArm64, arm64.browser_download_url, "B: Apple Silicon remains arm64");
assert.equal(mixedMac.macosX64, x64Mac.browser_download_url, "B: x64 is classified separately");

const universalOnly = selectReleaseAssets([universal]);
assert.equal(universalOnly.macosArm64, null, "C: universal is not silently used as the Apple Silicon asset");
assert.equal(universalOnly.macosUniversal, universal.browser_download_url, "C: universal remains available for future policy");

assert.equal(classifyReleaseAsset(updater.name), "auxiliary", "D: updater DMG is auxiliary");
assert.equal(selectReleaseAssets([updater]).macosArm64, null, "D: updater DMG is not an installer");

assert.deepEqual(selectReleaseAssets([]), {
  macosArm64: null,
  macosX64: null,
  macosUniversal: null,
  windowsX64: null,
}, "E: missing installers return explicit null values");

assert.equal(selectReleaseAssets([windows]).windowsX64, windows.browser_download_url, "F: Windows setup selection is preserved");

const forward = selectReleaseAssets([updater, universal, windows, x64Mac, arm64]);
const reversed = selectReleaseAssets([arm64, x64Mac, windows, universal, updater]);
assert.deepEqual(forward, reversed, "G: selection does not depend on GitHub asset order");

console.log("latest release asset selection tests passed");

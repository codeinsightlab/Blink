import assert from "node:assert/strict";
import { aggregateDownloadStats } from "./download-stats-logic.ts";

const result = aggregateDownloadStats([
  { tag_name: "v1.2.3", draft: false, prerelease: false, published_at: "2026-09-08T00:00:00Z", assets: [
    { name: "Blink_old.dmg", download_count: 3 },
    { name: "Blink_x64-setup.exe", download_count: 4 },
    { name: "Blink_x64.msi", download_count: 99 },
  ] },
  { tag_name: "v1.2.4", draft: true, prerelease: false, assets: [{ name: "x.dmg", download_count: 9 }] },
  { tag_name: "v1.2.5-beta", draft: false, prerelease: true, assets: [{ name: "x.dmg", download_count: 9 }] },
  { tag_name: "latest", draft: false, prerelease: false, assets: [{ name: "x.dmg", download_count: 9 }] },
]);

assert.deepEqual(result, {
  total: 7,
  macos: 3,
  windows: 4,
  releases: [{ tag: "v1.2.3", version: "1.2.3", publishedAt: "2026-09-08T00:00:00Z", macos: 3, windows: 4, total: 7 }],
});

console.log("download-stats logic tests passed");

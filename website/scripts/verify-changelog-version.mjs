import { readFile } from "node:fs/promises";

const rawVersion = process.argv[2] || process.env.RELEASE_TAG || process.env.GITHUB_REF_NAME;
if (!rawVersion) {
  console.error("Usage: npm run verify:changelog -- v0.1.10");
  process.exit(2);
}
const version = rawVersion.replace(/^refs\/tags\//, "").replace(/^v/, "");
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(`Invalid release version: ${rawVersion}`);
  process.exit(2);
}
const entries = JSON.parse(await readFile(new URL("../src/changelog.json", import.meta.url), "utf8"));
const matches = entries.filter((entry) => entry.version === version);
if (matches.length !== 1) {
  console.error(`Expected exactly one changelog entry for ${version}; found ${matches.length}.`);
  process.exit(1);
}
if (!/^\d{4}-\d{2}-\d{2}$/.test(matches[0].releaseDate) || !matches[0].summary?.zh || !matches[0].summary?.en) {
  console.error(`Changelog entry ${version} is missing a release date or bilingual summary.`);
  process.exit(1);
}
console.log(`Verified changelog entry for v${version} (${matches[0].releaseDate}).`);

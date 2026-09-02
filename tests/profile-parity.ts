import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { profileSchema } from "@keyflow/contract";

interface Case {
  id: string;
  valid: boolean;
  profile: unknown;
}
interface RustResult {
  id: string;
  accepted: boolean;
  serialized: unknown;
}

const cases: Case[] = JSON.parse(
  readFileSync(
    new URL("../packages/keyflow-contract/fixtures/profile-v2.parity.json", import.meta.url),
    "utf8",
  ),
);
const rust = spawnSync(
  "cargo",
  ["test", "--offline", "--test", "profile_parity", "--", "--nocapture"],
  {
    cwd: fileURLToPath(new URL("../runtime/src-tauri", import.meta.url)),
    encoding: "utf8",
  },
);
assert.equal(rust.status, 0, rust.error?.message ?? rust.stderr + rust.stdout);
const marker = "PROFILE_PARITY_REPORT=";
const line = rust.stdout.split("\n").find((line) => line.includes(marker));
assert.ok(line, "Rust parity report is missing");
const results: RustResult[] = JSON.parse(line.slice(line.indexOf(marker) + marker.length));
assert.equal(results.length, cases.length);
let accepted = 0;
let roundTrips = 0;
function omitEmptyLocators(value: unknown): unknown {
  return JSON.parse(
    JSON.stringify(value, (key, item) =>
      ["executableNames", "aliases", "bundleIds", "appNames", "knownPaths"].includes(key) &&
      Array.isArray(item) &&
      item.length === 0
        ? undefined
        : item,
    ),
  );
}
for (const [index, test] of cases.entries()) {
  const ts = profileSchema.safeParse(test.profile);
  const result = results[index]!;
  assert.equal(result.id, test.id);
  assert.equal(ts.success, test.valid, "Zod expected: " + test.id);
  assert.equal(result.accepted, ts.success, "TS/Rust mismatch: " + test.id);
  if (ts.success) {
    accepted++;
    const roundTrip = profileSchema.safeParse(result.serialized);
    assert.ok(roundTrip.success, "Rust -> Zod round-trip: " + test.id);
    assert.deepEqual(
      omitEmptyLocators(result.serialized),
      omitEmptyLocators(ts.data),
      "Normalization: " + test.id,
    );
    assert.deepEqual(omitEmptyLocators(roundTrip.data), omitEmptyLocators(ts.data));
    roundTrips++;
  }
}
console.log(
  JSON.stringify(
    {
      total: cases.length,
      tsAccepted: accepted,
      tsRejected: cases.length - accepted,
      rustAccepted: results.filter((item) => item.accepted).length,
      rustRejected: results.filter((item) => !item.accepted).length,
      mismatchCount: 0,
      rustToZodRoundTripsPassed: roundTrips,
    },
    null,
    2,
  ),
);

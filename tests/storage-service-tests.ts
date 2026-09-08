import assert from "node:assert/strict";
import { StorageWriteError, writeStorage } from "../src/services/storageService.ts";

const originalStorage = globalThis.localStorage;
const store = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: { setItem: (key: string, value: string) => store.set(key, value) },
});
assert.equal(writeStorage("ok", { value: 1 }), true);
assert.equal(store.get("ok"), '{"value":1}');

for (const error of [
  new DOMException("full", "QuotaExceededError"),
  new DOMException("blocked", "SecurityError"),
  new Error("unknown"),
]) {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      setItem: () => {
        throw error;
      },
    },
  });
  assert.throws(
    () => writeStorage("failed", {}),
    (actual) => actual instanceof StorageWriteError && actual.cause === error,
  );
}

Object.defineProperty(globalThis, "localStorage", { configurable: true, value: originalStorage });
console.log("storage service tests passed");

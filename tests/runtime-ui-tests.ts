import assert from "node:assert/strict";
import zh from "../runtime/src/locales/zh-CN.json" with { type: "json" };
import en from "../runtime/src/locales/en.json" with { type: "json" };
import {
  readOrder,
  orderedCommands,
  moveCommand,
  saveOrder,
} from "../runtime/src/uiPreferences.ts";

const storage = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  },
});
Object.defineProperty(globalThis, "document", { value: { documentElement: { lang: "" } } });
const locale = await import("../runtime/src/locale.ts");
assert.deepEqual(Object.keys(zh).sort(), Object.keys(en).sort());
assert.equal(locale.getLanguage(), "zh-CN");
assert.equal(locale.setLanguage("en"), true);
assert.equal(locale.t("newCommand"), "New command");
assert.equal(storage.get("keyflow.runtime.language"), "en");
assert.equal(locale.builtinText("copy", "复制"), "Copy");
assert.equal(locale.builtinText("copy", "My Copy"), "My Copy");
const ids = ["a", "b", "c"];
assert.deepEqual(moveCommand(ids, "a", "c", true), ["b", "c", "a"]);
assert.deepEqual(moveCommand(ids, "c", "a", false), ["c", "a", "b"]);
assert.deepEqual(moveCommand(ids, "unknown", "a", false), ids);
assert.deepEqual(ids, ["a", "b", "c"]);
assert.equal(saveOrder(["c", "a", "b"]), true);
assert.deepEqual(readOrder(), ["c", "a", "b"]);
const items = ids.map((id) => ({ id, profile: { name: id }, physicalInput: id }));
const before = JSON.stringify(items);
assert.deepEqual(
  orderedCommands(items).map((x) => x.id),
  ["c", "a", "b"],
);
assert.equal(JSON.stringify(items), before);
assert.deepEqual(
  orderedCommands([{ id: "b" }, { id: "d" }, { id: "a" }, { id: "e" }]).map((x) => x.id),
  ["a", "b", "d", "e"],
);
storage.set("keyflow.runtime.commandOrder", "not json");
assert.deepEqual(readOrder(), []);
storage.set("keyflow.runtime.commandOrder", '["a",1,"a","b"]');
assert.deepEqual(readOrder(), ["a", "b"]);
Object.defineProperty(globalThis, "localStorage", {
  get() {
    throw new Error("storage denied");
  },
});
assert.deepEqual(readOrder(), []);
assert.equal(saveOrder(ids), false);
assert.equal(locale.setLanguage("zh-CN"), false);
assert.equal(locale.getLanguage(), "en");
console.log("Runtime UI locale and local order tests passed");

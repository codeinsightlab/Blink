import assert from "node:assert/strict";
import { profileSchema, type AppDefinition, type CommandDefinition } from "@keyflow/contract";
import { compileProfileDraft } from "../src/services/profileCompiler.ts";

const apps: AppDefinition[] = [
  {
    id: "chrome",
    name: "Chrome",
    platforms: {
      windows: { executableNames: ["chrome.exe"] },
      macos: { bundleIds: ["com.google.Chrome"], appNames: ["Google Chrome.app"] },
    },
    enabled: true,
  },
];
const commands: CommandDefinition[] = [
  {
    id: "COPY",
    name: "复制",
    executions: {
      windows: { type: "SEND_HOTKEY", keys: ["CTRL", "C"] },
      macos: { type: "SEND_HOTKEY", keys: ["META", "C"] },
    },
    enabled: true,
  },
];

const commandProfile = compileProfileDraft(
  { localId: "draft-copy", name: "Copy", actions: [{ type: "COMMAND", commandId: "COPY" }] },
  apps,
  commands,
);
assert.equal(commandProfile.version, "2.0");
assert.equal(commandProfile.actions[0]?.type, "COMMAND");
assert.deepEqual(commandProfile.actions[0]?.executions.windows, {
  type: "SEND_HOTKEY",
  keys: ["CTRL", "C"],
});
assert.equal("commandId" in commandProfile.actions[0]!, false);
assert.equal("localId" in commandProfile, false);

const appProfile = compileProfileDraft(
  { localId: "draft-app", name: "Open Chrome", actions: [{ type: "OPEN_APP", appId: "chrome" }] },
  apps,
  commands,
);
assert.equal(appProfile.actions[0]?.type, "OPEN_APP");
assert.deepEqual(appProfile.actions[0]?.executions.macos, {
  type: "LAUNCH_APP",
  bundleIds: ["com.google.Chrome"],
  appNames: ["Google Chrome.app"],
});
assert.equal("appId" in appProfile.actions[0]!, false);

const handwritten = {
  version: "2.0",
  name: "macOS Copy",
  actions: [
    { type: "COMMAND", executions: { macos: { type: "SEND_HOTKEY", keys: ["META", "C"] } } },
  ],
};
assert.equal(profileSchema.parse(handwritten).name, "macOS Copy");
assert.equal(profileSchema.safeParse({ ...handwritten, version: "1.2" }).success, false);
assert.equal(profileSchema.safeParse({ ...handwritten, slot: "KEY_1" }).success, false);

const ordered = compileProfileDraft(
  {
    localId: "draft-ordered",
    name: "Ordered",
    actions: [
      { type: "OPEN_APP", appId: "chrome" },
      { type: "COMMAND", commandId: "COPY" },
    ],
  },
  apps,
  commands,
);
assert.deepEqual(
  ordered.actions.map((action) => action.type),
  ["OPEN_APP", "COMMAND"],
);

console.log("Profile schema and Web compile tests passed");

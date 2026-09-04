import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  createOpenAppProfile,
  createToggleAppProfile,
  createHotkeyProfile,
  createProfile,
  createTargetProfile,
  officialCommands,
  profileSchema,
  type Profile,
} from "@blink/contract";
import {
  captureCreatorKey,
  saveCreatorProfile,
  profileFromPickedApp,
  CreatorSaveError,
  cleanupCreatedProfile,
  type CreatorApi,
  switchActionType,
  regenerateEditedProfile,
} from "../runtime/src/creator.ts";
import { performBinding, BindingOperationError } from "../runtime/src/bindingOperation.ts";
import { readFileSync } from "node:fs";
import { compileProfileDraft } from "../src/services/profileCompiler.ts";

const profiles = [
  createOpenAppProfile({
    name: "Open Mac App",
    platform: "macos",
    bundleIds: ["com.apple.TextEdit"],
  }),
  createOpenAppProfile({
    name: "Open Windows App",
    platform: "windows",
    executableNames: ["notepad.exe"],
  }),
  createHotkeyProfile({ name: "Command Palette", platform: "macos", keys: ["META", "SHIFT", "P"] }),
  createHotkeyProfile({ name: "Windows Hotkey", platform: "windows", keys: ["CTRL", "ALT", "P"] }),
];
profiles.forEach((profile, index) => {
  assert.equal(profile.version, "2.0");
  assert.ok(profileSchema.safeParse(profile).success);
  assert.equal(profile.actions[0]!.type, index < 2 ? "OPEN_APP" : "COMMAND");
  assert.deepEqual(Object.keys(profile.actions[0]!.executions), [index % 2 ? "windows" : "macos"]);
});
assert.deepEqual(profiles[2]!.actions[0]!.executions.macos, {
  type: "SEND_HOTKEY",
  keys: ["META", "SHIFT", "P"],
});
assert.deepEqual(profiles[3]!.actions[0]!.executions.windows, {
  type: "SEND_HOTKEY",
  keys: ["CTRL", "ALT", "P"],
});
for (const platform of ["macos", "windows"] as const) {
  for (const type of ["OPEN_URL", "OPEN_FILE", "OPEN_FOLDER", "SCRIPT"] as const) {
    const target =
      type === "OPEN_URL"
        ? "https://example.com/?a=1&b=2"
        : platform === "macos"
          ? type === "SCRIPT"
            ? "/tmp/a.sh"
            : "/tmp/Hello world"
          : type === "SCRIPT"
            ? "C:\\a.ps1"
            : "C:\\Hello world";
    const profile = createTargetProfile({ name: type, platform, type, target });
    assert.equal(profile.version, "2.1");
    assert.deepEqual(Object.keys(profile.actions[0]!.executions), [platform]);
    assert.ok(profileSchema.safeParse(profile).success);
    profiles.push(profile);
  }
}
const builtins = JSON.parse(
  readFileSync(
    new URL("../runtime/src-tauri/fixtures/builtin-profiles.json", import.meta.url),
    "utf8",
  ),
);
assert.deepEqual(
  officialCommands.map((command) => command.id),
  ["COPY", "PASTE"],
);
officialCommands.forEach((command, index) => {
  const input = {
    name: command.name,
    ...(command.description ? { description: command.description } : {}),
    actions: [{ type: "COMMAND" as const, executions: command.executions }],
  };
  const produced = createProfile(input);
  assert.deepEqual(produced, builtins[index]);
  assert.deepEqual(
    produced,
    compileProfileDraft(
      {
        localId: "test",
        name: command.name,
        description: command.description,
        actions: [{ type: "COMMAND", commandId: command.id }],
      },
      [],
      officialCommands,
    ),
  );
});
// END is not in the frozen protocol/Executor; never silently substitute another key.
assert.throws(() =>
  createHotkeyProfile({
    name: "Unsupported END",
    platform: "windows",
    keys: ["CTRL", "ALT", "END"] as never,
  }),
);
assert.throws(() =>
  createOpenAppProfile({ name: "", platform: "macos", knownPaths: ["/Applications/TextEdit.app"] }),
);
assert.throws(() => createOpenAppProfile({ name: "No locator", platform: "macos" }));
assert.throws(() => createHotkeyProfile({ name: "Empty", platform: "macos", keys: [] }));
assert.throws(() =>
  createHotkeyProfile({ name: "Duplicate", platform: "macos", keys: ["META", "META"] }),
);
assert.throws(() =>
  createHotkeyProfile({ name: "Bad platform", platform: "linux" as never, keys: ["P"] }),
);
assert.deepEqual(
  profileFromPickedApp("TextEdit", "macos", "/System/Applications/TextEdit.app").actions[0]!
    .executions.macos,
  { type: "LAUNCH_APP", knownPaths: ["/System/Applications/TextEdit.app"] },
);
assert.ok(profileFromPickedApp("Notepad", "windows", "C:\\Windows\\notepad.exe"));
assert.throws(() => profileFromPickedApp("Bad", "macos", "/tmp/document.txt"));

const key = (code: string, key: string, modifiers = {}) => ({
  code,
  key,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  repeat: false,
  isComposing: false,
  ...modifiers,
});
const physical = captureCreatorKey({ mode: "physical" }, key("F11", "F11"));
assert.equal(physical.physicalInput, "F11");
assert.equal(physical.keys, undefined);
const hotkey = captureCreatorKey(
  { ...physical, mode: "hotkey" },
  key("KeyP", "P", { metaKey: true, shiftKey: true }),
);
assert.equal(hotkey.physicalInput, "F11");
assert.deepEqual(hotkey.keys, ["META", "SHIFT", "P"]);
assert.equal(hotkey.mode, null);
const canceled = captureCreatorKey({ ...hotkey, mode: "hotkey" }, key("Escape", "Escape"));
assert.equal(canceled.physicalInput, "F11");
assert.deepEqual(canceled.keys, hotkey.keys);
assert.equal(canceled.mode, null);
const modifierOnly = captureCreatorKey(
  { mode: "physical" },
  key("MetaLeft", "Meta", { metaKey: true }),
);
assert.equal(modifierOnly.physicalInput, undefined);
const repeated = captureCreatorKey({ mode: "physical" }, key("F11", "F11", { repeat: true }));
assert.equal(repeated.physicalInput, undefined);
const invalidAction = captureCreatorKey(
  { ...physical, mode: "hotkey" },
  key("End", "End", { ctrlKey: true, altKey: true }),
);
assert.equal(invalidAction.physicalInput, "F11");
assert.equal(invalidAction.keys, undefined);
assert.ok(invalidAction.error);

function memoryApi(fail: "none" | "create" | "bind" | "cleanup" = "none") {
  const repository = new Map<string, Profile>([["old", profiles[0]!]]);
  const bindings = new Map([["F10", "old"]]);
  let failed = false;
  const api: CreatorApi = {
    create: async (profile) => {
      if (fail === "create") throw new Error("disk");
      repository.set("new", profile);
      return "new";
    },
    resume: async () => {},
    refresh: async () => {},
    bind: async (id, input) => {
      if (id === "new" && fail !== "none" && !failed) {
        failed = true;
        throw new Error("registration failure");
      }
      for (const [key, bound] of bindings) if (bound === id) bindings.delete(key);
      bindings.set(input, id);
    },
    remove: async (id) => {
      if (fail === "cleanup") throw new Error("cleanup disk failure");
      repository.delete(id);
      for (const [input, bound] of bindings) if (bound === id) bindings.delete(input);
    },
  };
  return { repository, bindings, api };
}
const success = memoryApi();
assert.equal(await saveCreatorProfile(profiles[0]!, "F10", success.api), "new");
assert.equal(success.bindings.get("F10"), "new");
assert.equal(success.repository.size, 2);
const failure = memoryApi("bind");
await assert.rejects(saveCreatorProfile(profiles[0]!, "F10", failure.api), /已撤销/);
assert.equal(failure.repository.has("new"), false);
assert.equal(failure.bindings.get("F10"), "old");
const unboundFailure = memoryApi("bind");
await assert.rejects(saveCreatorProfile(profiles[0]!, "F12", unboundFailure.api), /已撤销/);
assert.equal(unboundFailure.repository.has("new"), false);
assert.equal(unboundFailure.bindings.has("F12"), false);
assert.equal(unboundFailure.bindings.get("F10"), "old");
const resumeFailure = memoryApi();
resumeFailure.api.resume = async () => {
  throw new Error("listener recovery failure");
};
await assert.rejects(saveCreatorProfile(profiles[0]!, "F10", resumeFailure.api), /已撤销/);
assert.equal(resumeFailure.repository.has("new"), false);
assert.equal(resumeFailure.bindings.get("F10"), "old");
const createFailure = memoryApi("create");
await assert.rejects(saveCreatorProfile(profiles[0]!, "F10", createFailure.api), /命令创建失败/);
assert.equal(createFailure.repository.size, 1);
const cleanupFailure = memoryApi("cleanup");
await assert.rejects(
  saveCreatorProfile(profiles[0]!, "F10", cleanupFailure.api),
  (error) => error instanceof CreatorSaveError && error.leftoverId === "new",
);
assert.equal(cleanupFailure.bindings.get("F10"), "old");
cleanupFailure.api.remove = async (id) => {
  cleanupFailure.repository.delete(id);
};
await cleanupCreatedProfile("new", cleanupFailure.api);
assert.equal(cleanupFailure.repository.has("new"), false);

// Both entry points run the same operation; last-wins belongs to the backend.
const traces: string[][] = [];
for (const creator of [true, false]) {
  const memory = memoryApi();
  const trace: string[] = [];
  const originalBind = memory.api.bind;
  memory.api.resume = async () => {
    trace.push("resume");
  };
  memory.api.bind = async (id, key) => {
    trace.push(`bind:${id}:${key}`);
    await originalBind(id, key);
  };
  memory.api.refresh = async () => {
    trace.push("refresh");
  };
  if (creator) await saveCreatorProfile(profiles[0]!, "F10", memory.api);
  else await performBinding(memory.api, "new", "F10");
  assert.equal(memory.bindings.get("F10"), "new");
  traces.push(trace);
}
assert.deepEqual(traces[0], ["resume", "bind:new:F10", "refresh"]);
assert.deepEqual(traces[0], traces[1]);
const rebindFailure = memoryApi("bind");
await assert.rejects(performBinding(rebindFailure.api, "new", "F10"), /绑定失败/);
assert.equal(rebindFailure.bindings.get("F10"), "old");
const refreshFailure = memoryApi();
refreshFailure.api.refresh = async () => {
  throw new Error("snapshot unavailable");
};
assert.equal(await saveCreatorProfile(profiles[0]!, "F10", refreshFailure.api), "new");
assert.equal(refreshFailure.bindings.get("F10"), "new");
assert.ok(refreshFailure.repository.has("new"));
await assert.rejects(
  performBinding(refreshFailure.api, "new", "F11"),
  (error) => error instanceof BindingOperationError && error.committed,
);

const actionSamples = [
  profileFromPickedApp("App", "macos", "/Applications/A.app"),
  createHotkeyProfile({ name: "Keys", platform: "macos", keys: ["META", "C"] }),
  ...(["OPEN_URL", "OPEN_FILE", "OPEN_FOLDER", "SCRIPT"] as const).map((type) =>
    createTargetProfile({
      name: type,
      platform: "macos",
      type,
      target:
        type === "OPEN_URL"
          ? "https://example.com"
          : type === "SCRIPT"
            ? "/tmp/test.sh"
            : "/tmp/data",
    }),
  ),
];
const editedProfiles: Profile[] = [];
for (const original of actionSamples) {
  for (const replacement of actionSamples) {
    const before = JSON.stringify(original);
    const edited = regenerateEditedProfile(original, 0, replacement, "macos");
    editedProfiles.push(edited);
    assert.ok(profileSchema.safeParse(edited).success);
    assert.deepEqual(edited.actions[0], replacement.actions[0]);
    assert.equal(JSON.stringify(original), before);
    if (original.actions[0]!.type !== replacement.actions[0]!.type) {
      const reset = switchActionType(
        {
          action: original.actions[0]!.type,
          appPath: "/Applications/Old.app",
          target: "old",
          scriptConsent: true,
          appChanged: true,
          originalExecution: original.actions[0]!.executions.macos,
          capture: {
            mode: "hotkey",
            physicalInput: "F10",
            keys: ["META", "C"],
            error: "old error",
          },
        },
        replacement.actions[0]!.type,
      );
      assert.deepEqual(reset, {
        action: replacement.actions[0]!.type,
        target: "",
        scriptConsent: false,
        appChanged: false,
        capture: { mode: null, physicalInput: "F10" },
      });
    }
  }
}
const multi = createProfile({
  name: "Keep",
  description: "description",
  actions: [
    {
      type: "OPEN_APP",
      executions: {
        ...actionSamples[0]!.actions[0]!.executions,
        windows: { type: "LAUNCH_APP", knownPaths: ["C:\\A.exe"] },
      },
    },
    actionSamples[1]!.actions[0]!,
  ],
});
const sameType = regenerateEditedProfile(
  multi,
  0,
  profileFromPickedApp("B", "macos", "/Applications/B.app"),
  "macos",
);
assert.deepEqual(sameType.actions[0]!.executions.windows, multi.actions[0]!.executions.windows);
const switched = regenerateEditedProfile(multi, 0, actionSamples[2]!, "macos");
assert.equal(switched.actions[0]!.executions.windows, undefined);
assert.deepEqual(switched.actions[1], multi.actions[1]);
assert.equal(switched.name, multi.name);
assert.equal(switched.description, multi.description);
assert.throws(() => regenerateEditedProfile(multi, 99, actionSamples[0]!, "macos"));
console.log(
  "Binding entry parity, committed-refresh failure protection, and 36 Producer edit combinations passed.",
);

const rust = spawnSync(
  "cargo",
  ["test", "--offline", "--test", "profile_parity", "producer_", "--", "--nocapture"],
  {
    cwd: fileURLToPath(new URL("../runtime/src-tauri", import.meta.url)),
    encoding: "utf8",
    env: {
      ...process.env,
      BLINK_PRODUCER_PROFILES: JSON.stringify(profiles),
      BLINK_EDIT_PROFILES: JSON.stringify(editedProfiles),
    },
  },
);
assert.equal(rust.status, 0, rust.error?.message ?? rust.stdout + rust.stderr);
assert.match(rust.stdout, /PRODUCER_REPOSITORY_BINDING=12/);
assert.match(rust.stdout, /PRODUCER_EDIT_REPLACEMENTS=36/);
console.log(
  "Producer, capture isolation, create/bind rollback, and Producer -> Rust Repository/Binding tests passed (12 profiles); official catalog parity passed (COPY/PASTE).",
);

const toggle = createToggleAppProfile({
  name: "Toggle TextEdit",
  platform: "macos",
  knownPaths: ["/System/Applications/TextEdit.app"],
});
assert.equal(toggle.version, "2.1");
assert.equal(toggle.actions[0]?.type, "TOGGLE_APP");
const windowsToggle = createToggleAppProfile({
  name: "Toggle Windows app",
  platform: "windows",
  knownPaths: ["C:\\Program Files\\Example\\Example.exe"],
});
assert.deepEqual(windowsToggle.actions[0]?.executions.windows, {
  type: "TOGGLE_APP",
  knownPaths: ["C:\\Program Files\\Example\\Example.exe"],
});
assert.throws(() =>
  createToggleAppProfile({ name: "Invalid Windows Toggle", platform: "windows", bundleIds: ["x"] }),
);
const toggleDraft = switchActionType(
  {
    action: "OPEN_APP",
    appPath: "/Applications/Old.app",
    target: "",
    scriptConsent: false,
    appChanged: true,
    capture: { mode: null, physicalInput: "F10" },
  },
  "TOGGLE_APP",
);
assert.equal(toggleDraft.appPath, undefined);
assert.equal(toggleDraft.capture.physicalInput, "F10");
assert.equal(regenerateEditedProfile(toggle, 0, toggle, "macos").actions[0]?.type, "TOGGLE_APP");
console.log("Toggle Creator producer/edit tests passed");

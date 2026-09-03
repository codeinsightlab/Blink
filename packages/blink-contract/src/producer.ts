import type { KeyCode, Platform } from "./constants.ts";
import type { LaunchAppExecution } from "./execution.ts";
import type { Profile } from "./profile.ts";
import type { Action, TargetActionType } from "./action.ts";
import { profileSchema } from "./schemas/profile.schema.ts";

// Web resolves Registry references first; every producer shares this boundary.
export function createProfile(input: Omit<Profile, "version">): Profile {
  const extended = input.actions.some((action) => !["OPEN_APP", "COMMAND"].includes(action.type));
  return profileSchema.parse({ ...input, version: extended ? "2.1" : "2.0" });
}

interface ProfileInput {
  name: string;
  description?: string;
  platform: Platform;
}

export type OpenAppProfileInput = ProfileInput & Omit<LaunchAppExecution, "type">;
export type HotkeyProfileInput = ProfileInput & { keys: KeyCode[] };

export function createTargetProfile(
  input: ProfileInput & { type: TargetActionType; target: string },
): Profile {
  const { name, description, platform, type, target } = input;
  const execution =
    type === "OPEN_URL"
      ? { type, url: target }
      : { type: type === "SCRIPT" ? "RUN_SCRIPT" : type, path: target };
  return createProfile({
    name,
    ...(description === undefined ? {} : { description }),
    actions: [{ type, executions: { [platform]: execution } } as Action],
  });
}

export function createOpenAppProfile(input: OpenAppProfileInput): Profile {
  const { name, description, platform, executableNames, aliases, bundleIds, appNames, knownPaths } =
    input;
  return createProfile({
    name,
    ...(description === undefined ? {} : { description }),
    actions: [
      {
        type: "OPEN_APP",
        executions: {
          [platform]: {
            type: "LAUNCH_APP",
            ...(executableNames === undefined ? {} : { executableNames }),
            ...(aliases === undefined ? {} : { aliases }),
            ...(bundleIds === undefined ? {} : { bundleIds }),
            ...(appNames === undefined ? {} : { appNames }),
            ...(knownPaths === undefined ? {} : { knownPaths }),
          },
        },
      },
    ],
  });
}

export function createToggleAppProfile(
  input: Pick<
    OpenAppProfileInput,
    "name" | "description" | "platform" | "bundleIds" | "knownPaths"
  >,
): Profile {
  if (input.platform !== "macos") throw new Error("Toggle App is supported only on macOS");
  const { name, description, bundleIds, knownPaths } = input;
  return createProfile({
    name,
    ...(description === undefined ? {} : { description }),
    actions: [
      {
        type: "TOGGLE_APP",
        executions: {
          macos: {
            type: "TOGGLE_APP",
            ...(bundleIds === undefined ? {} : { bundleIds }),
            ...(knownPaths === undefined ? {} : { knownPaths }),
          },
        },
      },
    ],
  });
}

export function createHotkeyProfile({
  name,
  description,
  platform,
  keys,
}: HotkeyProfileInput): Profile {
  return createProfile({
    name,
    ...(description === undefined ? {} : { description }),
    actions: [{ type: "COMMAND", executions: { [platform]: { type: "SEND_HOTKEY", keys } } }],
  });
}

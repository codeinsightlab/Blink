import type { KeyCode } from "./constants.ts";

export interface LaunchAppExecution {
  type: "LAUNCH_APP";
  executableNames?: string[];
  aliases?: string[];
  bundleIds?: string[];
  appNames?: string[];
  knownPaths?: string[];
}

export interface SendHotkeyExecution {
  type: "SEND_HOTKEY";
  keys: KeyCode[];
}

export type Execution = LaunchAppExecution | SendHotkeyExecution;

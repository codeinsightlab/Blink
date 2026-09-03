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

export interface OpenUrlExecution {
  type: "OPEN_URL";
  url: string;
}
export interface OpenFileExecution {
  type: "OPEN_FILE";
  path: string;
}
export interface OpenFolderExecution {
  type: "OPEN_FOLDER";
  path: string;
}
export interface RunScriptExecution {
  type: "RUN_SCRIPT";
  path: string;
}
export type Execution =
  | LaunchAppExecution
  | SendHotkeyExecution
  | OpenUrlExecution
  | OpenFileExecution
  | OpenFolderExecution
  | RunScriptExecution;

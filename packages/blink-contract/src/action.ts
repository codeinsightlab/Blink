import type {
  LaunchAppExecution,
  ToggleAppExecution,
  SendHotkeyExecution,
  OpenUrlExecution,
  OpenFileExecution,
  OpenFolderExecution,
  RunScriptExecution,
} from "./execution.ts";

export interface OpenAppAction {
  type: "OPEN_APP";
  executions: {
    windows?: LaunchAppExecution;
    macos?: LaunchAppExecution;
  };
}

export interface ToggleAppAction {
  type: "TOGGLE_APP";
  executions: { macos?: ToggleAppExecution; windows?: ToggleAppExecution };
}

export interface CommandAction {
  type: "COMMAND";
  executions: {
    windows?: SendHotkeyExecution;
    macos?: SendHotkeyExecution;
  };
}

export type TargetActionType = "OPEN_URL" | "OPEN_FILE" | "OPEN_FOLDER" | "SCRIPT";
type TargetAction<T, E> = { type: T; executions: { windows?: E; macos?: E } };
export type Action =
  | ToggleAppAction
  | OpenAppAction
  | CommandAction
  | TargetAction<"OPEN_URL", OpenUrlExecution>
  | TargetAction<"OPEN_FILE", OpenFileExecution>
  | TargetAction<"OPEN_FOLDER", OpenFolderExecution>
  | TargetAction<"SCRIPT", RunScriptExecution>;

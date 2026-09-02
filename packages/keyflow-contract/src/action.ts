import type { LaunchAppExecution, SendHotkeyExecution } from "./execution.ts";

export interface OpenAppAction {
  type: "OPEN_APP";
  executions: {
    windows?: LaunchAppExecution;
    macos?: LaunchAppExecution;
  };
}

export interface CommandAction {
  type: "COMMAND";
  executions: {
    windows?: SendHotkeyExecution;
    macos?: SendHotkeyExecution;
  };
}

export type Action = OpenAppAction | CommandAction;

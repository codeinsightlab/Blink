import type { LaunchAppExecution, MacOSAppExecutionTarget, SendHotkeyExecution, WindowsAppExecutionTarget } from "./execution";

export interface OpenAppAction {
  type: "OPEN_APP";
  appId: string;
  executions: {
    windows?: LaunchAppExecution<WindowsAppExecutionTarget>;
    macos?: LaunchAppExecution<MacOSAppExecutionTarget>;
  };
}

export interface CommandAction {
  type: "COMMAND";
  commandId: string;
  name: string;
  executions: {
    windows?: SendHotkeyExecution;
    macos?: SendHotkeyExecution;
  };
}

export type Action = OpenAppAction | CommandAction;

import type { MacOSAppDefinition, WindowsAppDefinition } from "./app";
import type { KeyCode } from "./constants";

export type WindowsAppExecutionTarget = WindowsAppDefinition;
export type MacOSAppExecutionTarget = MacOSAppDefinition;

export type LaunchAppExecution<TApp = WindowsAppExecutionTarget | MacOSAppExecutionTarget> = { type: "LAUNCH_APP" } & TApp;

export interface SendHotkeyExecution {
  type: "SEND_HOTKEY";
  keys: KeyCode[];
}

export type Execution = LaunchAppExecution | SendHotkeyExecution;

export { KEY_CODES, PLATFORMS } from "./constants.ts";
export type { KeyCode, Platform } from "./constants.ts";
export type { Action, CommandAction, OpenAppAction } from "./action.ts";
export type {
  Execution,
  LaunchAppExecution,
  ToggleAppExecution,
  SendHotkeyExecution,
  OpenUrlExecution,
  OpenFileExecution,
  OpenFolderExecution,
  RunScriptExecution,
} from "./execution.ts";
export type { CommandDefinition } from "./command.ts";
export type { Profile } from "./profile.ts";
export type { AppDefinition, MacOSAppDefinition, WindowsAppDefinition } from "./app.ts";
export {
  actionSchema,
  commandActionSchema,
  openAppActionSchema,
  profileSchema,
} from "./schemas/profile.schema.ts";
export {
  appDefinitionSchema,
  macOSAppDefinitionSchema,
  windowsAppDefinitionSchema,
} from "./schemas/app.schema.ts";
export {
  executionSchema,
  keyCodeSchema,
  launchAppExecutionSchema,
  sendHotkeyExecutionSchema,
} from "./schemas/execution.schema.ts";
export { commandDefinitionSchema } from "./schemas/command.schema.ts";
export {
  createProfile,
  createOpenAppProfile,
  createToggleAppProfile,
  createHotkeyProfile,
  createTargetProfile,
} from "./producer.ts";
export type { TargetActionType } from "./action.ts";
export { officialCommands } from "./official-commands.ts";
export type { OpenAppProfileInput, HotkeyProfileInput } from "./producer.ts";

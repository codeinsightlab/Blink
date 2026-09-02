import {
  profileSchema,
  type AppDefinition,
  type CommandDefinition,
  type Profile,
} from "@keyflow/contract";
import type { AuthoringAction, ProfileDraft } from "../models/authoring.ts";

function compileAction(
  action: AuthoringAction,
  apps: AppDefinition[],
  commands: CommandDefinition[],
): Profile["actions"][number] {
  if (action.type === "OPEN_APP") {
    const app = apps.find((item) => item.id === action.appId);
    if (!app) throw new Error(`软件 ${action.appId} 不存在于软件库`);
    return {
      type: "OPEN_APP",
      executions: {
        ...(app.platforms.windows
          ? { windows: { type: "LAUNCH_APP" as const, ...app.platforms.windows } }
          : {}),
        ...(app.platforms.macos
          ? { macos: { type: "LAUNCH_APP" as const, ...app.platforms.macos } }
          : {}),
      },
    };
  }
  const command = commands.find((item) => item.id === action.commandId);
  if (!command) throw new Error(`命令 ${action.commandId} 不存在于命令库`);
  return { type: "COMMAND", executions: command.executions };
}

export function compileProfileDraft(
  draft: ProfileDraft,
  apps: AppDefinition[],
  commands: CommandDefinition[],
): Profile {
  return profileSchema.parse({
    version: "2.0",
    name: draft.name.trim(),
    ...(draft.description?.trim() ? { description: draft.description.trim() } : {}),
    actions: draft.actions.map((action) => compileAction(action, apps, commands)),
  });
}

export function compileProfileDrafts(
  drafts: ProfileDraft[],
  apps: AppDefinition[],
  commands: CommandDefinition[],
): Profile[] {
  return drafts.map((draft) => compileProfileDraft(draft, apps, commands));
}

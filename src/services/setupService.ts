import type { AppDefinition, CommandDefinition, KeyCode } from "@keyflow/contract";
import type { AuthoringAction, ProfileDraft } from "../models/authoring";
import { useProfileStore } from "../stores/profileStore";

const keySymbols: Partial<Record<KeyCode, string>> = {
  META: "⌘",
  CTRL: "Ctrl",
  ALT: "⌥",
  SHIFT: "⇧",
  ENTER: "↵",
  ESCAPE: "Esc",
  SPACE: "Space",
  BACKSPACE: "⌫",
  DELETE: "⌦",
  UP: "↑",
  DOWN: "↓",
  LEFT: "←",
  RIGHT: "→",
};

export function formatHotkey(keys: KeyCode[]) {
  const compact = keys.includes("META");
  if (compact) return keys.map((key) => keySymbols[key] ?? key).join("");
  const textSymbols: Partial<Record<KeyCode, string>> = {
    CTRL: "Ctrl",
    ALT: "Alt",
    SHIFT: "Shift",
    ENTER: "Enter",
    ESCAPE: "Esc",
    SPACE: "Space",
  };
  return keys.map((key) => textSymbols[key] ?? keySymbols[key] ?? key).join("+");
}

export function actionSummary(
  action: AuthoringAction,
  apps: AppDefinition[],
  commands: CommandDefinition[],
) {
  if (action.type === "OPEN_APP") {
    const app = apps.find((item) => item.id === action.appId);
    return {
      name: `打开${app?.name ?? action.appId}`,
      detail: app?.name ?? action.appId,
      kind: "打开软件",
    };
  }
  const command = commands.find((item) => item.id === action.commandId);
  const keys = command?.executions.macos?.keys ?? command?.executions.windows?.keys ?? [];
  return {
    name: command?.name ?? action.commandId,
    detail: formatHotkey(keys),
    kind: "键盘快捷键",
  };
}

export function draftDisplayName(
  draft: ProfileDraft,
  apps: AppDefinition[],
  commands: CommandDefinition[],
) {
  if (!draft.actions.length) return draft.name || "未配置";
  return draft.name || actionSummary(draft.actions[0]!, apps, commands).name;
}

export function saveShortcuts(
  localId: string,
  selectedCommands: CommandDefinition[],
  actionIndex?: number,
) {
  const store = useProfileStore.getState();
  const actions = selectedCommands.map<AuthoringAction>((command) => ({
    type: "COMMAND",
    commandId: command.id,
  }));
  if (actionIndex !== undefined && actions[0])
    store.replaceAction(localId, actionIndex, actions[0]);
  else store.addActions(localId, actions);
}

export function saveOpenApps(localId: string, selectedApps: AppDefinition[], actionIndex?: number) {
  const store = useProfileStore.getState();
  const actions = selectedApps.map<AuthoringAction>((app) => ({ type: "OPEN_APP", appId: app.id }));
  if (actionIndex !== undefined && actions[0])
    store.replaceAction(localId, actionIndex, actions[0]);
  else store.addActions(localId, actions);
}

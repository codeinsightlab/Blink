import { commandDefinitionSchema, profileSchema, type Action, type AppDefinition, type CommandDefinition, type KeyCode, type KeySlot, type Profile } from "@keyflow/contract";
import { useCommandRegistryStore } from "../stores/commandRegistryStore";
import { useProfileStore } from "../stores/profileStore";
import { createCommandAction, createOpenAppAction } from "./profileCompiler";
import { STORAGE_KEYS } from "./storageService";

const SETUP_COMMAND_PREFIX = "SETUP_";
const defaultBindingName = (slot: KeySlot) => `按键 ${Number(slot.slice(4))}`;

const keySymbols: Partial<Record<KeyCode, string>> = {
  META: "⌘", CTRL: "Ctrl", ALT: "⌥", SHIFT: "⇧", ENTER: "↵", ESCAPE: "Esc",
  SPACE: "Space", BACKSPACE: "⌫", DELETE: "⌦", UP: "↑", DOWN: "↓", LEFT: "←", RIGHT: "→",
};

export function formatHotkey(keys: KeyCode[]) {
  const compact = keys.includes("META");
  if (compact) return keys.map((key) => keySymbols[key] ?? key).join("");
  const textSymbols: Partial<Record<KeyCode, string>> = { CTRL: "Ctrl", ALT: "Alt", SHIFT: "Shift", ENTER: "Enter", ESCAPE: "Esc", SPACE: "Space" };
  return keys.map((key) => textSymbols[key] ?? keySymbols[key] ?? key).join("+");
}

export function actionSummary(action: Action, apps: AppDefinition[]) {
  if (action.type === "OPEN_APP") {
    const app = apps.find((item) => item.id === action.appId);
    return { name: `打开${app?.name ?? action.appId}`, detail: app?.name ?? action.appId, kind: "打开软件" };
  }
  const keys = action.executions.macos?.keys ?? action.executions.windows?.keys ?? [];
  return { name: action.name, detail: formatHotkey(keys), kind: "键盘快捷键" };
}

export function bindingDisplayName(profile: Profile, slot: KeySlot, apps: AppDefinition[]) {
  const binding = profile.bindings.find((item) => item.slot === slot);
  if (!binding || !binding.actions.length) return "未配置";
  return binding.name === defaultBindingName(slot) ? actionSummary(binding.actions[0]!, apps).name : binding.name;
}

function commit(nextProfile: Profile, nextCommands: CommandDefinition[]) {
  const parsedProfile = profileSchema.parse(nextProfile);
  const parsedCommands = commandDefinitionSchema.array().parse(nextCommands);
  const previousProfile = localStorage.getItem(STORAGE_KEYS.profile);
  const previousCommands = localStorage.getItem(STORAGE_KEYS.commands);
  try {
    localStorage.setItem(STORAGE_KEYS.commands, JSON.stringify(parsedCommands));
    localStorage.setItem(STORAGE_KEYS.profile, JSON.stringify(parsedProfile));
    useCommandRegistryStore.setState({ commands: parsedCommands });
    useProfileStore.setState({ profile: parsedProfile });
  } catch (error) {
    if (previousCommands === null) localStorage.removeItem(STORAGE_KEYS.commands); else localStorage.setItem(STORAGE_KEYS.commands, previousCommands);
    if (previousProfile === null) localStorage.removeItem(STORAGE_KEYS.profile); else localStorage.setItem(STORAGE_KEYS.profile, previousProfile);
    throw error;
  }
}

function replaceAction(profile: Profile, slot: KeySlot, action: Action, actionIndex?: number, apps: AppDefinition[] = []) {
  return {
    ...profile,
    updatedAt: new Date().toISOString(),
    bindings: profile.bindings.map((binding) => {
      if (binding.slot !== slot) return binding;
      const oldDerived = binding.actions.length ? actionSummary(binding.actions[0]!, apps).name : defaultBindingName(slot);
      const actions = actionIndex === undefined ? [...binding.actions, action] : binding.actions.map((item, index) => index === actionIndex ? action : item);
      const shouldDerive = binding.name === defaultBindingName(slot) || binding.name === oldDerived;
      return { ...binding, name: shouldDerive ? actionSummary(actions[0]!, apps).name : binding.name, actions };
    }),
  };
}

function cleanupGeneratedCommands(profile: Profile, commands: CommandDefinition[]) {
  const referenced = new Set(profile.bindings.flatMap((binding) => binding.actions).filter((action) => action.type === "COMMAND").map((action) => action.commandId));
  return commands.filter((command) => !command.id.startsWith(SETUP_COMMAND_PREFIX) || referenced.has(command.id));
}

export function saveShortcuts(slot: KeySlot, selectedCommands: CommandDefinition[], apps: AppDefinition[], actionIndex?: number) {
  const profile = useProfileStore.getState().profile;
  const commands = useCommandRegistryStore.getState().commands;
  let nextProfile = profile;
  for (const [index, command] of selectedCommands.entries()) nextProfile = replaceAction(nextProfile, slot, createCommandAction(command), actionIndex !== undefined && index === 0 ? actionIndex : undefined, apps);
  commit(nextProfile, cleanupGeneratedCommands(nextProfile, commands));
}

export function saveOpenApp(slot: KeySlot, app: AppDefinition, apps: AppDefinition[], actionIndex?: number) {
  const profile = useProfileStore.getState().profile;
  const commands = useCommandRegistryStore.getState().commands;
  const nextProfile = replaceAction(profile, slot, createOpenAppAction(app), actionIndex, apps);
  commit(nextProfile, cleanupGeneratedCommands(nextProfile, commands));
}

export function saveOpenApps(slot: KeySlot, selectedApps: AppDefinition[], apps: AppDefinition[]) {
  const profile = useProfileStore.getState().profile;
  const commands = useCommandRegistryStore.getState().commands;
  let nextProfile = profile;
  for (const app of selectedApps) nextProfile = replaceAction(nextProfile, slot, createOpenAppAction(app), undefined, apps);
  commit(nextProfile, commands);
}

export function removeSetupAction(slot: KeySlot, actionIndex: number, apps: AppDefinition[]) {
  const profile = useProfileStore.getState().profile;
  const commands = useCommandRegistryStore.getState().commands;
  const nextProfile: Profile = {
    ...profile,
    updatedAt: new Date().toISOString(),
    bindings: profile.bindings.map((binding) => {
      if (binding.slot !== slot) return binding;
      const oldDerived = binding.actions.length ? actionSummary(binding.actions[0]!, apps).name : defaultBindingName(slot);
      const actions = binding.actions.filter((_, index) => index !== actionIndex);
      const shouldDerive = binding.name === defaultBindingName(slot) || binding.name === oldDerived;
      const name = shouldDerive ? (actions.length ? actionSummary(actions[0]!, apps).name : defaultBindingName(slot)) : binding.name;
      return { ...binding, name, actions };
    }),
  };
  commit(nextProfile, cleanupGeneratedCommands(nextProfile, commands));
}

export function clearSetupBinding(slot: KeySlot) {
  const profile = useProfileStore.getState().profile;
  const commands = useCommandRegistryStore.getState().commands;
  const nextProfile: Profile = {
    ...profile,
    updatedAt: new Date().toISOString(),
    bindings: profile.bindings.map((binding) => binding.slot === slot ? { ...binding, name: defaultBindingName(slot), description: undefined, actions: [] } : binding),
  };
  commit(nextProfile, cleanupGeneratedCommands(nextProfile, commands));
}

export function createSetupBinding() {
  const profile = useProfileStore.getState().profile;
  const commands = useCommandRegistryStore.getState().commands;
  const used = new Set(profile.bindings.map((binding) => binding.slot));
  const slot = (["KEY_1", "KEY_2", "KEY_3", "KEY_4", "KEY_5", "KEY_6"] as KeySlot[]).find((item) => !used.has(item));
  if (!slot) throw new Error("当前配置已使用全部 6 个逻辑按键");
  const number = Number(slot.slice(4));
  const nextProfile: Profile = {
    ...profile,
    updatedAt: new Date().toISOString(),
    bindings: [...profile.bindings, { id: `binding-key-${number}`, slot, name: defaultBindingName(slot), actions: [] }].sort((left, right) => left.slot.localeCompare(right.slot)),
  };
  commit(nextProfile, commands);
  return slot;
}

export function deleteSetupBinding(slot: KeySlot) {
  const profile = useProfileStore.getState().profile;
  const commands = useCommandRegistryStore.getState().commands;
  const nextProfile: Profile = { ...profile, updatedAt: new Date().toISOString(), bindings: profile.bindings.filter((binding) => binding.slot !== slot) };
  commit(nextProfile, cleanupGeneratedCommands(nextProfile, commands));
}

export function updateSetupDetails(slot: KeySlot, name: string, description: string) {
  const profile = useProfileStore.getState().profile;
  const commands = useCommandRegistryStore.getState().commands;
  const nextProfile: Profile = {
    ...profile,
    updatedAt: new Date().toISOString(),
    bindings: profile.bindings.map((binding) => binding.slot === slot ? {
      ...binding, name: name.trim() || defaultBindingName(slot), ...(description.trim() ? { description: description.trim() } : { description: undefined }),
    } : binding),
  };
  commit(nextProfile, commands);
}

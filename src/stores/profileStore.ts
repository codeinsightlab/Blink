import { create } from "zustand";
import { KEY_SLOTS, profileSchema, type KeySlot, type Profile } from "@keyflow/contract";
import { readStorage, STORAGE_KEYS, writeStorage } from "../services/storageService";
import { createCommandAction, createOpenAppAction } from "../services/profileCompiler";
import { useAppRegistryStore } from "./appRegistryStore";
import { useCommandRegistryStore } from "./commandRegistryStore";

function defaultProfile(): Profile {
  const now = new Date().toISOString();
  return { version: "1.2", id: "default", name: "我的 KeyFlow", bindings: [], createdAt: now, updatedAt: now };
}
const LEGACY_SLOT_MAP: Record<string, KeySlot> = { F13: "KEY_1", F14: "KEY_2", F15: "KEY_3", F16: "KEY_4", F17: "KEY_5", F18: "KEY_6" };
function migrateExecution(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const execution = value as Record<string, unknown>;
  if (execution.type === "OPEN_APP") {
    const app = execution.app && typeof execution.app === "object" ? execution.app as Record<string, unknown> : {};
    return { type: "LAUNCH_APP", ...app };
  }
  if (execution.type === "HOTKEY") return { ...execution, type: "SEND_HOTKEY" };
  return value;
}
function migrateLegacyProfile(raw: unknown): { value: unknown; migrated: boolean } {
  if (!raw || typeof raw !== "object") return { value: raw, migrated: false };
  const profile = raw as Record<string, unknown>;
  if (!Array.isArray(profile.bindings)) return { value: raw, migrated: false };
  let migrated = false;
  const apps = useAppRegistryStore.getState().apps;
  const commands = useCommandRegistryStore.getState().commands;
  const bindings = profile.bindings.map((item, index) => {
    if (!item || typeof item !== "object") return item;
    const binding = item as Record<string, unknown>;
    const legacySlot = typeof binding.trigger === "string" ? LEGACY_SLOT_MAP[binding.trigger] : undefined;
    if (legacySlot) migrated = true;
    const slot = legacySlot ?? binding.slot;
    const actions = Array.isArray(binding.actions) ? binding.actions.map((item) => {
      if (!item || typeof item !== "object") return item;
      const action = item as Record<string, unknown>;
      if (action.type === "OPEN_APP" && typeof action.appId === "string" && !("executions" in action)) {
        migrated = true;
        const app = apps.find((candidate) => candidate.id === action.appId);
        return app ? createOpenAppAction(app) : { ...action, executions: {} };
      }
      if (action.type === "COMMAND" && typeof action.commandId === "string" && !("executions" in action)) {
        migrated = true;
        const command = commands.find((candidate) => candidate.id === action.commandId);
        return command ? createCommandAction(command) : { ...action, executions: {} };
      }
      if (action.executions && typeof action.executions === "object") {
        const executions = action.executions as Record<string, unknown>;
        const windows = migrateExecution(executions.windows); const macos = migrateExecution(executions.macos);
        if (windows !== executions.windows || macos !== executions.macos) { migrated = true; return { ...action, executions: { ...(windows ? { windows } : {}), ...(macos ? { macos } : {}) } }; }
      }
      return item;
    }) : [];
    return {
      id: legacySlot ? `binding-key-${index + 1}` : binding.id,
      slot,
      name: typeof binding.name === "string" && binding.name.trim() ? binding.name.trim() : `按键 ${index + 1}`,
      ...(typeof binding.description === "string" && binding.description.trim() ? { description: binding.description.trim() } : {}),
      actions,
    };
  });
  if (profile.version === "1.0" || profile.version === "1.1") migrated = true;
  return { value: migrated ? { ...profile, version: "1.2", bindings } : raw, migrated };
}
function loadProfile() {
  const migration = migrateLegacyProfile(readStorage(STORAGE_KEYS.profile));
  const parsed = profileSchema.safeParse(migration.value);
  if (!parsed.success) return defaultProfile();
  const localized = parsed.data.name === "My KeyFlow" ? { ...parsed.data, name: "我的 KeyFlow" } : parsed.data;
  const bindings = localized.bindings.filter((binding) => {
    const number = Number(binding.slot.slice(4));
    return binding.actions.length > 0 || Boolean(binding.description?.trim()) || binding.name !== `按键 ${number}`;
  });
  const profile = bindings.length === localized.bindings.length ? localized : { ...localized, bindings, updatedAt: new Date().toISOString() };
  if (migration.migrated || profile !== parsed.data) writeStorage(STORAGE_KEYS.profile, profile);
  return profile;
}
type ProfileState = {
  profile: Profile;
  setProfileName: (name: string) => void;
  setBindingName: (slot: KeySlot, name: string) => void;
  setBindingDescription: (slot: KeySlot, description: string) => void;
  addApps: (slot: KeySlot, appIds: string[]) => void;
  addCommands: (slot: KeySlot, commandIds: string[]) => void;
  removeAction: (slot: KeySlot, index: number) => void;
  moveAction: (slot: KeySlot, index: number, direction: -1 | 1) => void;
};
const update = (profile: Profile) => { const next = { ...profile, updatedAt: new Date().toISOString() }; writeStorage(STORAGE_KEYS.profile, next); return next; };
export const useProfileStore = create<ProfileState>((set) => ({
  profile: loadProfile(),
  setProfileName: (name) => set((state) => ({ profile: update({ ...state.profile, name }) })),
  setBindingName: (slot, name) => set((state) => ({ profile: update({ ...state.profile, bindings: state.profile.bindings.map((binding) => binding.slot === slot ? { ...binding, name } : binding) }) })),
  setBindingDescription: (slot, description) => set((state) => ({ profile: update({ ...state.profile, bindings: state.profile.bindings.map((binding) => binding.slot === slot ? { ...binding, description } : binding) }) })),
  addApps: (slot, appIds) => set((state) => ({ profile: update({ ...state.profile, bindings: state.profile.bindings.map((binding) => binding.slot === slot ? { ...binding, actions: [...binding.actions, ...appIds.filter((id) => !binding.actions.some((action) => action.type === "OPEN_APP" && action.appId === id)).map((id) => createOpenAppAction(useAppRegistryStore.getState().apps.find((app) => app.id === id)!))] } : binding) }) })),
  addCommands: (slot, commandIds) => set((state) => ({ profile: update({ ...state.profile, bindings: state.profile.bindings.map((binding) => binding.slot === slot ? { ...binding, actions: [...binding.actions, ...commandIds.filter((id) => !binding.actions.some((action) => action.type === "COMMAND" && action.commandId === id)).map((id) => createCommandAction(useCommandRegistryStore.getState().commands.find((command) => command.id === id)!))] } : binding) }) })),
  removeAction: (slot, index) => set((state) => ({ profile: update({ ...state.profile, bindings: state.profile.bindings.map((binding) => binding.slot === slot ? { ...binding, actions: binding.actions.filter((_, i) => i !== index) } : binding) }) })),
  moveAction: (slot, index, direction) => set((state) => ({ profile: update({ ...state.profile, bindings: state.profile.bindings.map((binding) => {
    if (binding.slot !== slot) return binding; const target = index + direction; if (target < 0 || target >= binding.actions.length) return binding;
    const actions = [...binding.actions]; [actions[index], actions[target]] = [actions[target]!, actions[index]!]; return { ...binding, actions };
  }) }) })),
}));

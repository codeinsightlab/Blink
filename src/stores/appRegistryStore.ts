import { create } from "zustand";
import initialApps from "../data/apps.json";
import { appDefinitionSchema, type AppDefinition } from "@blink/contract";
import { readStorage, STORAGE_KEYS, writeStorage } from "../services/storageService";

const categoryTranslations: Record<string, string> = {
  Browser: "浏览器",
  Communication: "沟通",
  Office: "办公",
  Creative: "创意",
  Developer: "开发",
};
function localizeCategories(apps: AppDefinition[]) {
  return apps.map((app) => ({
    ...app,
    category: app.category ? (categoryTranslations[app.category] ?? app.category) : app.category,
  }));
}
function loadApps(): AppDefinition[] {
  const parsed = appDefinitionSchema.array().safeParse(readStorage(STORAGE_KEYS.apps));
  const initial = appDefinitionSchema.array().safeParse(initialApps);
  return localizeCategories(parsed.success ? parsed.data : initial.success ? initial.data : []);
}
type RegistryState = {
  apps: AppDefinition[];
  upsertApp: (app: AppDefinition) => void;
  deleteApp: (id: string) => void;
  toggleApp: (id: string) => void;
};
const persist = (apps: AppDefinition[]) => {
  writeStorage(STORAGE_KEYS.apps, apps);
  return apps;
};
export const useAppRegistryStore = create<RegistryState>((set) => ({
  apps: loadApps(),
  upsertApp: (app) =>
    set((state) => ({
      apps: persist(
        state.apps.some((item) => item.id === app.id)
          ? state.apps.map((item) => (item.id === app.id ? app : item))
          : [...state.apps, app],
      ),
    })),
  deleteApp: (id) => set((state) => ({ apps: persist(state.apps.filter((app) => app.id !== id)) })),
  toggleApp: (id) =>
    set((state) => ({
      apps: persist(
        state.apps.map((app) =>
          app.id === id
            ? { ...app, enabled: !app.enabled, updatedAt: new Date().toISOString() }
            : app,
        ),
      ),
    })),
}));

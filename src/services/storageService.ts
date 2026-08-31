export const STORAGE_KEYS = { profile: "keyflow.currentProfile", apps: "keyflow.appRegistry", commands: "keyflow.commandRegistry" } as const;

export function readStorage(key: string): unknown {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
export function writeStorage(key: string, value: unknown) { localStorage.setItem(key, JSON.stringify(value)); }

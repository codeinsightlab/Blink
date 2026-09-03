export const STORAGE_KEYS = {
  drafts: "blink.profileDrafts",
  apps: "blink.appRegistry",
  commands: "blink.commandRegistry",
} as const;

export function readStorage(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
export function writeStorage(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
}

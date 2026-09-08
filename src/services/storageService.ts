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

export class StorageWriteError extends Error {
  readonly key: string;
  readonly cause: unknown;

  constructor(key: string, cause: unknown) {
    super("无法保存数据，请检查浏览器存储空间或权限后重试");
    this.name = "StorageWriteError";
    this.key = key;
    this.cause = cause;
  }
}

export function writeStorage(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    throw new StorageWriteError(key, error);
  }
}

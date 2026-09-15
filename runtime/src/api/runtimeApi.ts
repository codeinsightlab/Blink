import { invoke } from "@tauri-apps/api/core";

/** The only frontend boundary allowed to issue raw Tauri commands. */
export function invokeRuntime<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  return invoke<T>(command, args);
}

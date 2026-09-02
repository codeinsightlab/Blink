export type RuntimeStatus = "PROFILE_ERROR" | "UNBOUND" | "PARTIAL_BINDING" | "READY";
export type ListenerStatus = "LISTENING" | "PAUSED" | "ERROR";

export type ProfileSource = "SYSTEM" | "EXTERNAL";
export type RuntimePlatform = "macos" | "windows";
export interface RuntimeProfile {
  id: string;
  name: string;
  description?: string;
  physicalInput?: string;
  actionHotkey?: string[];
  iconId?: string;
  source: ProfileSource;
}
export interface RuntimeSnapshot {
  profiles: RuntimeProfile[];
  platform: RuntimePlatform;
  listenerStatus: ListenerStatus;
  lastError?: string;
  lastEvent?: string;
}

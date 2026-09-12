export type RuntimeStatus = "PROFILE_ERROR" | "UNBOUND" | "PARTIAL_BINDING" | "READY";
export type ListenerStatus = "LISTENING" | "PAUSED" | "ERROR";

export type ProfileSource = "SYSTEM" | "EXTERNAL";
export type RuntimePlatform = "macos" | "windows";

import type { Action } from "@blink/contract";

export interface WorkspaceItem {
  id: string;
  action: Action;
  enabled: boolean;
  order: number;
}
export interface Workspace {
  id: string;
  name: string;
  items: WorkspaceItem[];
}
export type WorkspaceItemOutcome =
  | "LAUNCHED"
  | "ALREADY_RUNNING"
  | "OPEN_REQUEST_ACCEPTED"
  | "STARTED"
  | "FAILED";
export interface WorkspaceItemResult {
  itemId: string;
  actionType: string;
  outcome: WorkspaceItemOutcome;
  error?: string;
}
export interface WorkspaceRun {
  id: string;
  workspaceId: string;
  workspaceName: string;
  startedAt: number;
  results: WorkspaceItemResult[];
  status: "COMPLETE" | "PARTIAL" | "FAILED";
}
export interface WorkspaceSnapshot {
  workspaces: Workspace[];
  loadError?: string;
  lastRun?: WorkspaceRun;
}
export interface RuntimeProfile {
  id: string;
  name: string;
  description?: string;
  physicalInput?: string;
  actionHotkey?: string[];
  actionType?:
    "TOGGLE_APP" | "OPEN_APP" | "COMMAND" | "OPEN_URL" | "OPEN_FILE" | "OPEN_FOLDER" | "SCRIPT";
  iconId?: string;
  iconSource?: string;
  source: ProfileSource;
}
export interface RuntimeSnapshot {
  profiles: RuntimeProfile[];
  platform: RuntimePlatform;
  listenerStatus: ListenerStatus;
  lastError?: string;
  lastEvent?: string;
}

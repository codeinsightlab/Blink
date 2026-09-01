export type RuntimeStatus = "PROFILE_ERROR" | "UNBOUND" | "PARTIAL_BINDING" | "READY";
export type ListenerStatus = "LISTENING" | "PAUSED" | "ERROR";

export interface RuntimeProfile { id: string; name: string; description?: string; physicalInput?: string; iconId?: string }
export interface RuntimeSnapshot { profiles: RuntimeProfile[]; listenerStatus: ListenerStatus; lastError?: string; lastEvent?: string }

import type { Action } from "./action";
import type { KeySlot } from "./constants";

export interface KeyBinding {
  id: string;
  slot: KeySlot;
  name: string;
  description?: string;
  actions: Action[];
}

export interface Profile {
  version: string;
  id: string;
  name: string;
  bindings: KeyBinding[];
  createdAt: string;
  updatedAt: string;
}

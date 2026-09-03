import type { Action } from "./action.ts";

export interface Profile {
  version: string;
  name: string;
  description?: string;
  actions: Action[];
}

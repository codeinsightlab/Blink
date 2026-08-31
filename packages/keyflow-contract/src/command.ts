import type { SendHotkeyExecution } from "./execution";

export interface CommandDefinition {
  id: string;
  name: string;
  description?: string;
  category?: string;
  executions: {
    windows?: SendHotkeyExecution;
    macos?: SendHotkeyExecution;
  };
  enabled: boolean;
  createdAt?: string;
  updatedAt?: string;
}

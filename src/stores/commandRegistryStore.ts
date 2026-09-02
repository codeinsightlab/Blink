import { commandDefinitionSchema, type CommandDefinition } from "@keyflow/contract";
import { create } from "zustand";
import { initialCommands } from "../data/commands";
import { readStorage, STORAGE_KEYS, writeStorage } from "../services/storageService";

function loadCommands(): CommandDefinition[] {
  const parsed = commandDefinitionSchema.array().safeParse(readStorage(STORAGE_KEYS.commands));
  return parsed.success ? parsed.data : initialCommands;
}

type CommandRegistryState = {
  commands: CommandDefinition[];
  upsertCommand: (command: CommandDefinition) => void;
  deleteCommand: (id: string) => void;
  toggleCommand: (id: string) => void;
};

const persist = (commands: CommandDefinition[]) => {
  writeStorage(STORAGE_KEYS.commands, commands);
  return commands;
};

export const useCommandRegistryStore = create<CommandRegistryState>((set) => ({
  commands: loadCommands(),
  upsertCommand: (command) =>
    set((state) => ({
      commands: persist(
        state.commands.some((item) => item.id === command.id)
          ? state.commands.map((item) => (item.id === command.id ? command : item))
          : [...state.commands, command],
      ),
    })),
  deleteCommand: (id) =>
    set((state) => ({ commands: persist(state.commands.filter((command) => command.id !== id)) })),
  toggleCommand: (id) =>
    set((state) => ({
      commands: persist(
        state.commands.map((command) =>
          command.id === id
            ? { ...command, enabled: !command.enabled, updatedAt: new Date().toISOString() }
            : command,
        ),
      ),
    })),
}));

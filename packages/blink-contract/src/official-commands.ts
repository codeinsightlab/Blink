import type { CommandDefinition } from "./command.ts";
import type { KeyCode } from "./constants.ts";
import type { SendHotkeyExecution } from "./execution.ts";

const hotkey = (...keys: KeyCode[]): SendHotkeyExecution => ({ type: "SEND_HOTKEY", keys });

export const officialCommands: CommandDefinition[] = [
  {
    id: "COPY",
    name: "复制",
    description: "复制当前选中内容",
    category: "编辑",
    executions: { windows: hotkey("CTRL", "C"), macos: hotkey("META", "C") },
    enabled: true,
  },
  {
    id: "PASTE",
    name: "粘贴",
    description: "粘贴剪贴板内容",
    category: "编辑",
    executions: { windows: hotkey("CTRL", "V"), macos: hotkey("META", "V") },
    enabled: true,
  },
];

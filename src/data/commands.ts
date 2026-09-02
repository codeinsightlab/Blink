import type { CommandDefinition, KeyCode, SendHotkeyExecution } from "@keyflow/contract";

const hotkey = (...keys: KeyCode[]): SendHotkeyExecution => ({ type: "SEND_HOTKEY", keys });

export const initialCommands: CommandDefinition[] = [
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
  {
    id: "CUT",
    name: "剪切",
    description: "剪切当前选中内容",
    category: "编辑",
    executions: { windows: hotkey("CTRL", "X"), macos: hotkey("META", "X") },
    enabled: true,
  },
  {
    id: "UNDO",
    name: "撤销",
    category: "编辑",
    executions: { windows: hotkey("CTRL", "Z"), macos: hotkey("META", "Z") },
    enabled: true,
  },
  {
    id: "REDO",
    name: "重做",
    category: "编辑",
    executions: { windows: hotkey("CTRL", "Y"), macos: hotkey("META", "SHIFT", "Z") },
    enabled: true,
  },
  {
    id: "SELECT_ALL",
    name: "全选",
    category: "编辑",
    executions: { windows: hotkey("CTRL", "A"), macos: hotkey("META", "A") },
    enabled: true,
  },
  {
    id: "SAVE",
    name: "保存",
    category: "文件",
    executions: { windows: hotkey("CTRL", "S"), macos: hotkey("META", "S") },
    enabled: true,
  },
  {
    id: "FIND",
    name: "查找",
    category: "编辑",
    executions: { windows: hotkey("CTRL", "F"), macos: hotkey("META", "F") },
    enabled: true,
  },
];

import type { Action } from "@blink/contract";
import type { RuntimePlatform } from "../types";

export const workspaceActionText = (action: Action) =>
  ({
    OPEN_APP: "打开 App",
    OPEN_URL: "打开 URL",
    OPEN_FILE: "打开文件",
    OPEN_FOLDER: "打开文件夹",
    SCRIPT: "运行脚本",
    TOGGLE_APP: "切换 App",
    COMMAND: "快捷键",
  })[action.type];

export function workspaceActionTarget(action: Action, platform: RuntimePlatform) {
  const execution = action.executions[platform];
  if (!execution) return "当前平台未配置";
  if (execution.type === "LAUNCH_APP")
    return (
      execution.appNames?.[0] ??
      execution.knownPaths?.[0] ??
      execution.bundleIds?.[0] ??
      execution.executableNames?.[0] ??
      "App"
    );
  return "url" in execution ? execution.url : "path" in execution ? execution.path : execution.type;
}

export function workspaceTargetLabel(action: Action, platform: RuntimePlatform) {
  const target = workspaceActionTarget(action, platform);
  if (action.type === "OPEN_URL") {
    try {
      return new URL(target).hostname.replace(/^www\./, "");
    } catch {
      return target;
    }
  }
  return ["OPEN_APP", "OPEN_FILE", "OPEN_FOLDER", "SCRIPT"].includes(action.type)
    ? (target.split(/[\\/]/).filter(Boolean).pop() ?? target)
    : target;
}

export const workspaceActionIcon = (action: Action) =>
  action.type === "OPEN_FOLDER" || action.type === "OPEN_FILE"
    ? "folder"
    : action.type === "SCRIPT"
      ? "terminal"
      : action.type === "OPEN_URL"
        ? "external"
        : "app";

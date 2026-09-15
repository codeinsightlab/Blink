import { RuntimeIcon } from "../../runtimeIcon";
import type { RuntimePlatform, WorkspaceItem, WorkspaceRun, WorkspaceSnapshot } from "../../types";
import {
  workspaceActionIcon,
  workspaceActionTarget,
  workspaceActionText,
  workspaceTargetLabel,
} from "../../domain/workspaceActions";

export interface WorkspaceEditorState {
  id: string;
  name: string;
  items: WorkspaceItem[];
}
export interface WorkspaceActionDraft {
  index?: number;
  type: "OPEN_APP" | "OPEN_URL" | "OPEN_FILE" | "OPEN_FOLDER" | "SCRIPT";
  target: string;
}
const escapeHtml = (value: string) =>
  value.replace(
    /[&<>\"]/g,
    (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character]!,
  );
const resultText = (result: WorkspaceRun["status"]) =>
  ({ COMPLETE: "加载完成", PARTIAL: "部分完成", FAILED: "加载失败" })[result];
const outcomeText = (result: WorkspaceRun["results"][number]["outcome"]) =>
  ({
    LAUNCHED: "已启动",
    ALREADY_RUNNING: "已运行",
    OPEN_REQUEST_ACCEPTED: "已打开",
    STARTED: "已开始",
    FAILED: "失败",
  })[result];

export class WorkspacePage {
  mount(
    state: WorkspaceSnapshot | undefined,
    editor: WorkspaceEditorState | undefined,
    draft: WorkspaceActionDraft | undefined,
    busy: boolean,
    platform: RuntimePlatform,
  ): string {
    if (!state) return `<div class="workspace-empty">正在读取工作空间…</div>`;
    const editorMarkup = this.editor(editor, draft, platform);
    const warning = state.loadError
      ? `<div class="workspace-warning"><strong>Workspace 配置未载入</strong><span>${escapeHtml(state.loadError)}。V1 命令与绑定不受影响；保存新的 Workspace 后会重建独立配置。</span></div>`
      : "";
    const rows = state.workspaces
      .map((item) => {
        const run = state.lastRun?.workspaceId === item.id ? state.lastRun : undefined;
        const succeeded = run?.results.filter((result) => result.outcome !== "FAILED").length ?? 0;
        const ordered = [...item.items].sort((a, b) => a.order - b.order);
        const status = run
          ? `<details class="workspace-run-status ${run.status.toLowerCase()}"><summary><span class="workspace-status-dot"></span>${resultText(run.status)} · ${succeeded}/${run.results.length}</summary><div class="workspace-result-details">${run.results
              .map((result) => {
                const source = item.items.find((entry) => entry.id === result.itemId);
                return `<p class="${result.outcome === "FAILED" ? "failed" : ""}"><span>${escapeHtml(source ? workspaceTargetLabel(source.action, platform) : result.actionType)}</span><b>${outcomeText(result.outcome)}${result.error ? ` · ${escapeHtml(result.error)}` : ""}</b></p>`;
              })
              .join("")}</div></details>`
          : "";
        return `<article class="workspace-row"><div class="workspace-row-main"><span class="command-icon tone-external">${RuntimeIcon("workspace")}</span><div class="workspace-row-copy"><div class="workspace-row-head"><div><h2>${escapeHtml(item.name)}</h2><div class="workspace-meta"><span>${item.items.filter((entry) => entry.enabled).length} 个动作</span>${status}</div></div><div class="deck-actions workspace-row-controls"><button class="primary-button" data-workspace-run="${item.id}" ${busy ? "disabled" : ""}>${RuntimeIcon("play")}加载</button><button class="more" data-menu="workspace:${item.id}" aria-label="更多操作">${RuntimeIcon("more")}</button></div></div><div class="workspace-summary">${ordered
          .slice(0, 5)
          .map(
            (entry) =>
              `<span class="${entry.enabled ? "" : "disabled"}">${RuntimeIcon(workspaceActionIcon(entry.action))}${this.summary(entry.action, platform)}</span>`,
          )
          .join(
            "",
          )}${ordered.length > 5 ? `<button class="bind-cta" data-workspace-edit="${item.id}">+${ordered.length - 5}</button>` : ""}</div></div></div></article>`;
      })
      .join("");
    return `${warning}${editorMarkup}<div class="workspace-list">${rows || `<div class="workspace-empty"><h2>建立第一个工作空间</h2><p>一键同时打开一组 App、网页、文件、文件夹和脚本，快速准备你的工作环境。</p></div>`}</div>`;
  }

  private summary(action: WorkspaceItem["action"], platform: RuntimePlatform) {
    const target = escapeHtml(workspaceTargetLabel(action, platform));
    return action.type === "OPEN_APP"
      ? target
      : action.type === "OPEN_URL"
        ? `URL · ${target}`
        : action.type === "OPEN_FOLDER"
          ? `文件夹 · ${target}`
          : action.type === "OPEN_FILE"
            ? `文件 · ${target}`
            : action.type === "SCRIPT"
              ? `脚本 · ${target}`
              : `${escapeHtml(workspaceActionText(action))} · ${target}`;
  }

  private editor(
    editor: WorkspaceEditorState | undefined,
    draft: WorkspaceActionDraft | undefined,
    platform: RuntimePlatform,
  ) {
    if (!editor) return "";
    const draftMarkup = draft
      ? `<div class="workspace-action-form"><select id="workspace-action-type">${["OPEN_APP", "OPEN_URL", "OPEN_FILE", "OPEN_FOLDER", "SCRIPT"].map((type) => `<option value="${type}" ${draft.type === type ? "selected" : ""}>${({ OPEN_APP: "打开 App", OPEN_URL: "打开 URL", OPEN_FILE: "打开文件", OPEN_FOLDER: "打开文件夹", SCRIPT: "运行脚本" } as Record<string, string>)[type]}</option>`).join("")}</select><input id="workspace-action-target" value="${escapeHtml(draft.target)}" placeholder="选择目标或输入 URL">${draft.type === "OPEN_URL" ? "" : `<button id="workspace-pick-target">选择…</button>`}<button id="workspace-action-cancel">取消</button><button class="primary-button" id="workspace-action-confirm">${draft.index === undefined ? "添加" : "更新"}</button></div>`
      : "";
    const items =
      [...editor.items]
        .sort((a, b) => a.order - b.order)
        .map(
          (item, index) =>
            `<div><label><input type="checkbox" data-workspace-enabled="${index}" ${item.enabled ? "checked" : ""}>${workspaceActionText(item.action)}</label><span><small>${escapeHtml(workspaceActionTarget(item.action, platform))}</small></span><button data-workspace-up="${index}" ${index === 0 ? "disabled" : ""}>上移</button><button data-workspace-down="${index}" ${index === editor.items.length - 1 ? "disabled" : ""}>下移</button><button data-workspace-edit-action="${index}">编辑</button><button data-workspace-remove-action="${index}">移除</button></div>`,
        )
        .join("") || `<p>请至少添加一个动作。</p>`;
    return `<div class="workspace-editor"><label>名称<input id="workspace-name" maxlength="80" value="${escapeHtml(editor.name)}" placeholder="例如：Blink Development"></label><div class="workspace-editor-title"><strong>动作</strong><button id="workspace-add-action">添加动作</button></div><p class="workspace-contract-note">排序只影响展示和日志顺序，所有已启用动作会同时开始。</p>${draftMarkup}<div class="workspace-editor-apps">${items}</div><div class="workspace-editor-actions"><button id="workspace-editor-cancel">取消</button><button class="primary-button" id="workspace-editor-save">保存 Workspace</button></div></div>`;
  }

  unmount() {}
}

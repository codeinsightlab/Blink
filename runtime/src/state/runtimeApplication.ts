import { t, getLanguage, setLanguage } from "../locale.ts";
import { invokeRuntime as invoke } from "../api/runtimeApi";
import { open, save, confirm } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";
import { RuntimeIcon, type RuntimeIconName } from "../runtimeIcon";
import type {
  RuntimeProfile,
  RuntimeSnapshot,
  Workspace,
  WorkspaceItem,
  WorkspaceRun,
  WorkspaceSnapshot,
} from "../types";
import { openRuntimeCreator, captureCreatorKey } from "../creator";
import { performBinding, type BindingOperationApi } from "../bindingOperation";
import type { Action, Profile } from "@blink/contract";
import { BrandSidebarHeader } from "../settingsView";
import { saveOrder } from "../uiPreferences";
import { CommandPage } from "../pages/command/CommandPage";
import { SettingsPage } from "../pages/settings/SettingsPage";
import { WorkspacePage } from "../pages/workspace/WorkspacePage";

import { startCommandDrag } from "../commandDrag";

let cancelCommandDrag: (() => void) | undefined;

const app = document.querySelector<HTMLDivElement>("#app")!;
const escapeHtml = (value: string) =>
  value.replace(
    /[&<>\"]/g,
    (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character]!,
  );
const iconChoices: RuntimeIconName[] = [
  "command",
  "app",
  "copy",
  "paste",
  "cut",
  "undo",
  "redo",
  "select-all",
  "save",
  "find",
];
let snapshot: RuntimeSnapshot | undefined;
let workspaceSnapshot: WorkspaceSnapshot | undefined;
let workspaceEditor: { id: string; name: string; items: WorkspaceItem[] } | undefined;
let workspaceActionDraft:
  | {
      index?: number;
      type: "OPEN_APP" | "OPEN_URL" | "OPEN_FILE" | "OPEN_FOLDER" | "SCRIPT";
      target: string;
    }
  | undefined;
let workspaceBusy = false;
let bindingProfileId: string | undefined;
let bindingBusy = false;
let creatorOpen = false;
let activeMenu: { id: string; x: number; y: number } | undefined;
const MENU_WIDTH = 184;
const MENU_ESTIMATED_HEIGHT = 226;
const MENU_SAFE_MARGIN = 12;

function menuPosition(trigger: DOMRect) {
  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));
  const maxLeft = Math.max(MENU_SAFE_MARGIN, window.innerWidth - MENU_WIDTH - MENU_SAFE_MARGIN);
  const left = clamp(trigger.right - MENU_WIDTH, MENU_SAFE_MARGIN, maxLeft);
  const below = trigger.bottom + 7;
  const top =
    below + MENU_ESTIMATED_HEIGHT <= window.innerHeight - MENU_SAFE_MARGIN
      ? below
      : clamp(
          trigger.top - MENU_ESTIMATED_HEIGHT - 7,
          MENU_SAFE_MARGIN,
          window.innerHeight - MENU_SAFE_MARGIN,
        );
  return { x: left, y: top };
}
let dialog:
  { kind: "rename" | "delete" | "delete-many" | "icons"; id: string; name: string } | undefined;
let notice = "";
let toastTimer: ReturnType<typeof setTimeout> | undefined;
function showNotice(message: string) {
  clearTimeout(toastTimer);
  notice = message;
  if (message)
    toastTimer = setTimeout(() => {
      notice = "";
      document.querySelector(".notice")?.remove();
    }, 2800);
}
let page: "deck" | "workspaces" | "settings" = "deck";
let deckTab: "mine" | "system" = "mine";
let editingExternal = false;
let selectedExternalIds = new Set<string>();
let deckScrollTop = 0;
const commandPage = new CommandPage(() => ({
  snapshot,
  bindingProfileId,
  creatorOpen,
  activeMenuId: activeMenu?.id,
  editingExternal,
  selectedExternalIds,
  deckTab,
}));
const settingsPage = new SettingsPage();
const workspacePage = new WorkspacePage();

const statusText = (): Record<string, string> => ({
  LISTENING: t("live"),
  PAUSED: t("paused"),
  ERROR: t("attention"),
});

const bindingApi: BindingOperationApi = {
  resume: () => invoke("cancel_binding_capture"),
  bind: (profileId, physicalKey) => invoke("bind_key", { profileId, physicalKey }),
  refresh: reloadRuntimeSnapshot,
};

async function reloadRuntimeSnapshot() {
  snapshot = await invoke<RuntimeSnapshot>("runtime_snapshot");
  workspaceSnapshot = await invoke<WorkspaceSnapshot>("workspace_snapshot");
  render();
}

const workspaceResultText = (result: WorkspaceRun["status"]) =>
  ({ COMPLETE: "加载完成", PARTIAL: "部分完成", FAILED: "加载失败" })[result];
const itemOutcomeText = (result: WorkspaceRun["results"][number]["outcome"]) =>
  ({
    LAUNCHED: "已启动",
    ALREADY_RUNNING: "已运行",
    OPEN_REQUEST_ACCEPTED: "已打开",
    STARTED: "已开始",
    FAILED: "失败",
  })[result];
const actionText = (action: Action) =>
  ({
    OPEN_APP: "打开 App",
    OPEN_URL: "打开 URL",
    OPEN_FILE: "打开文件",
    OPEN_FOLDER: "打开文件夹",
    SCRIPT: "运行脚本",
    TOGGLE_APP: "切换 App",
    COMMAND: "快捷键",
  })[action.type];
const actionTarget = (action: Action) => {
  const execution = action.executions[snapshot?.platform ?? "macos"];
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
};

const workspaceActionIcon = (action: Action) =>
  action.type === "OPEN_FOLDER" || action.type === "OPEN_FILE"
    ? "folder"
    : action.type === "SCRIPT"
      ? "terminal"
      : action.type === "OPEN_URL"
        ? "external"
        : "app";

const workspaceTargetLabel = (action: Action) => {
  const target = actionTarget(action);
  if (action.type === "OPEN_URL") {
    try {
      return new URL(target).hostname.replace(/^www\./, "");
    } catch {
      return target;
    }
  }
  if (["OPEN_APP", "OPEN_FILE", "OPEN_FOLDER", "SCRIPT"].includes(action.type)) {
    return target.split(/[\\/]/).filter(Boolean).pop() ?? target;
  }
  return target;
};

const workspaceActionSummary = (action: Action) => {
  const target = escapeHtml(workspaceTargetLabel(action));
  switch (action.type) {
    case "OPEN_APP":
      return target;
    case "OPEN_URL":
      return `URL · ${target}`;
    case "OPEN_FOLDER":
      return `文件夹 · ${target}`;
    case "OPEN_FILE":
      return `文件 · ${target}`;
    case "SCRIPT":
      return `脚本 · ${target}`;
    default:
      return `${escapeHtml(actionText(action))} · ${target}`;
  }
};

function workspaceMarkup() {
  const state = workspaceSnapshot;
  if (!state) return `<div class="workspace-empty">正在读取工作空间…</div>`;
  const warning = state.loadError
    ? `<div class="workspace-warning"><strong>Workspace 配置未载入</strong><span>${escapeHtml(state.loadError)}。V1 命令与绑定不受影响；保存新的 Workspace 后会重建独立配置。</span></div>`
    : "";
  const rows = state.workspaces
    .map((item) => {
      const run = state.lastRun?.workspaceId === item.id ? state.lastRun : undefined;
      const enabled = item.items.filter((entry) => entry.enabled).length;
      const succeeded = run?.results.filter((result) => result.outcome !== "FAILED").length ?? 0;
      const orderedItems = [...item.items].sort((a, b) => a.order - b.order);
      const hiddenCount = Math.max(0, orderedItems.length - 5);
      const status = run
        ? `<details class="workspace-run-status ${run.status.toLowerCase()}"><summary><span class="workspace-status-dot"></span>${workspaceResultText(run.status)} · ${succeeded}/${run.results.length}</summary><div class="workspace-result-details">${run.results
            .map((result) => {
              const source = item.items.find((entry) => entry.id === result.itemId);
              return `<p class="${result.outcome === "FAILED" ? "failed" : ""}"><span>${escapeHtml(source ? workspaceTargetLabel(source.action) : result.actionType)}</span><b>${itemOutcomeText(result.outcome)}${result.error ? ` · ${escapeHtml(result.error)}` : ""}</b></p>`;
            })
            .join("")}</div></details>`
        : "";
      return `<article class="workspace-row"><div class="workspace-row-main"><span class="command-icon tone-external">${RuntimeIcon("workspace")}</span><div class="workspace-row-copy"><div class="workspace-row-head"><div><h2>${escapeHtml(item.name)}</h2><div class="workspace-meta"><span>${enabled} 个动作</span>${status}</div></div><div class="deck-actions workspace-row-controls"><button class="primary-button" data-workspace-run="${item.id}" ${workspaceBusy ? "disabled" : ""}>${RuntimeIcon("play")}加载</button><button class="more" data-menu="workspace:${item.id}" aria-label="更多操作">${RuntimeIcon("more")}</button></div></div><div class="workspace-summary">${orderedItems
        .slice(0, 5)
        .sort((a, b) => a.order - b.order)
        .map(
          (entry) =>
            `<span class="${entry.enabled ? "" : "disabled"}">${RuntimeIcon(workspaceActionIcon(entry.action))}${workspaceActionSummary(entry.action)}</span>`,
        )
        .join(
          "",
        )}${hiddenCount ? `<button class="bind-cta" data-workspace-edit="${item.id}">+${hiddenCount}</button>` : ""}</div></div></div></article>`;
    })
    .join("");
  return `${warning}${workspaceEditorMarkup()}<div class="workspace-list">${rows || `<div class="workspace-empty"><h2>建立第一个工作空间</h2><p>一键同时打开一组 App、网页、文件、文件夹和脚本，快速准备你的工作环境。</p></div>`}</div>`;
}

function workspaceEditorMarkup() {
  if (!workspaceEditor) return "";
  const draft = workspaceActionDraft
    ? `<div class="workspace-action-form"><select id="workspace-action-type">${["OPEN_APP", "OPEN_URL", "OPEN_FILE", "OPEN_FOLDER", "SCRIPT"].map((type) => `<option value="${type}" ${workspaceActionDraft!.type === type ? "selected" : ""}>${({ OPEN_APP: "打开 App", OPEN_URL: "打开 URL", OPEN_FILE: "打开文件", OPEN_FOLDER: "打开文件夹", SCRIPT: "运行脚本" } as Record<string, string>)[type]}</option>`).join("")}</select><input id="workspace-action-target" value="${escapeHtml(workspaceActionDraft.target)}" placeholder="选择目标或输入 URL">${workspaceActionDraft.type === "OPEN_URL" ? "" : `<button id="workspace-pick-target">选择…</button>`}<button id="workspace-action-cancel">取消</button><button class="primary-button" id="workspace-action-confirm">${workspaceActionDraft.index === undefined ? "添加" : "更新"}</button></div>`
    : "";
  return `<div class="workspace-editor"><label>名称<input id="workspace-name" maxlength="80" value="${escapeHtml(workspaceEditor.name)}" placeholder="例如：Blink Development"></label><div class="workspace-editor-title"><strong>动作</strong><button id="workspace-add-action">添加动作</button></div><p class="workspace-contract-note">排序只影响展示和日志顺序，所有已启用动作会同时开始。</p>${draft}<div class="workspace-editor-apps">${
    [...workspaceEditor.items]
      .sort((a, b) => a.order - b.order)
      .map(
        (item, index) =>
          `<div><label><input type="checkbox" data-workspace-enabled="${index}" ${item.enabled ? "checked" : ""}>${actionText(item.action)}</label><span><small>${escapeHtml(actionTarget(item.action))}</small></span><button data-workspace-up="${index}" ${index === 0 ? "disabled" : ""}>上移</button><button data-workspace-down="${index}" ${index === workspaceEditor!.items.length - 1 ? "disabled" : ""}>下移</button><button data-workspace-edit-action="${index}">编辑</button><button data-workspace-remove-action="${index}">移除</button></div>`,
      )
      .join("") || `<p>请至少添加一个动作。</p>`
  }</div><div class="workspace-editor-actions"><button id="workspace-editor-cancel">取消</button><button class="primary-button" id="workspace-editor-save">保存 Workspace</button></div></div>`;
}

async function startWorkspaceEditor(id?: string) {
  const existing = id ? workspaceSnapshot?.workspaces.find((item) => item.id === id) : undefined;
  workspaceEditor = {
    id: existing?.id ?? `ws-${crypto.randomUUID()}`,
    name: existing?.name ?? "",
    items: existing?.items.map((item) => structuredClone(item)) ?? [],
  };
  workspaceActionDraft = undefined;
  render();
}

async function saveWorkspaceEditor() {
  if (!workspaceEditor) return;
  const name = document.querySelector<HTMLInputElement>("#workspace-name")?.value.trim() ?? "";
  if (!name || !workspaceEditor.items.length) {
    showNotice("请输入名称并至少添加一个动作");
    render();
    return;
  }
  const item: Workspace = {
    id: workspaceEditor.id,
    name,
    items: workspaceEditor.items.map((entry, index) => ({ ...entry, order: index })),
  };
  await invoke("save_workspace", { item });
  workspaceEditor = undefined;
  await reloadRuntimeSnapshot();
}

async function runWorkspace(id: string) {
  if (workspaceBusy) return;
  workspaceBusy = true;
  render();
  try {
    const run = await invoke<WorkspaceRun>("run_workspace", { workspaceId: id });
    workspaceSnapshot = { ...workspaceSnapshot!, lastRun: run };
  } catch (error) {
    showNotice(`加载失败：${String(error)}`);
  } finally {
    workspaceBusy = false;
    await reloadRuntimeSnapshot();
  }
}

function editWorkspaceAction(index?: number) {
  if (!workspaceEditor || !snapshot) return;
  const existing = index === undefined ? undefined : workspaceEditor.items[index];
  const type = existing?.action.type;
  if (type === "TOGGLE_APP" || type === "COMMAND") return;
  workspaceActionDraft = {
    index,
    type: type ?? "OPEN_APP",
    target: existing ? actionTarget(existing.action) : "",
  };
  render();
}

function confirmWorkspaceAction() {
  if (!workspaceEditor || !workspaceActionDraft || !snapshot) return;
  const selected = workspaceActionDraft.type;
  const target =
    document.querySelector<HTMLInputElement>("#workspace-action-target")?.value.trim() ?? "";
  if (!target) {
    showNotice("请选择或输入动作目标");
    render();
    return;
  }
  const platform = snapshot.platform;
  let action: Action;
  if (selected === "OPEN_APP") {
    const filename = target.split(/[\\/]/).pop() ?? target;
    action = {
      type: "OPEN_APP",
      executions: {
        [platform]: {
          type: "LAUNCH_APP",
          ...(platform === "macos"
            ? { appNames: [filename.replace(/\.app$/i, "")], knownPaths: [target] }
            : { executableNames: [filename], knownPaths: [target] }),
        },
      },
    };
  } else if (selected === "OPEN_URL")
    action = { type: "OPEN_URL", executions: { [platform]: { type: "OPEN_URL", url: target } } };
  else if (selected === "OPEN_FILE")
    action = { type: "OPEN_FILE", executions: { [platform]: { type: "OPEN_FILE", path: target } } };
  else if (selected === "OPEN_FOLDER")
    action = {
      type: "OPEN_FOLDER",
      executions: { [platform]: { type: "OPEN_FOLDER", path: target } },
    };
  else
    action = { type: "SCRIPT", executions: { [platform]: { type: "RUN_SCRIPT", path: target } } };
  const existing =
    workspaceActionDraft.index === undefined
      ? undefined
      : workspaceEditor.items[workspaceActionDraft.index];
  const item: WorkspaceItem = {
    id: existing?.id ?? `item-${crypto.randomUUID()}`,
    action,
    enabled: existing?.enabled ?? true,
    order: existing?.order ?? workspaceEditor.items.length,
  };
  if (workspaceActionDraft.index === undefined) workspaceEditor.items.push(item);
  else workspaceEditor.items[workspaceActionDraft.index] = item;
  workspaceActionDraft = undefined;
  render();
}
async function startCreator(editId?: string) {
  if (creatorOpen || bindingProfileId) return;
  if (!snapshot || (!editId && snapshot.listenerStatus !== "LISTENING")) {
    showNotice(t("resumeFirst"));
    render();
    return;
  }
  creatorOpen = true;
  const platform = snapshot.platform;
  const wasPaused = snapshot.listenerStatus === "PAUSED";
  activeMenu = undefined;
  try {
    const item = editId ? snapshot.profiles.find((item) => item.id === editId) : undefined;
    if (editId && (!item || item.source !== "EXTERNAL")) throw new Error(t("userOnly"));
    const edit = item
      ? {
          profile: await invoke<Profile>("get_editable_profile", { profileId: item.id }),
          name: item.name,
          physicalInput: item.physicalInput,
          save: (profile: Profile, name: string) =>
            invoke<void>("update_runtime_profile", {
              profileId: item.id,
              profile,
              name,
            }),
        }
      : undefined;
    await openRuntimeCreator({
      edit,
      platform,
      profiles: snapshot.profiles,
      pause: async () => {
        const current = await invoke<RuntimeSnapshot>("runtime_snapshot");
        if (current.listenerStatus !== "PAUSED") await invoke("toggle_listener_command");
      },
      pickApp: async () => {
        const path = await open({
          title: platform === "macos" ? t("pickMac") : t("pickWindows"),
          multiple: false,
          directory: false,
          ...(platform === "macos" ? { defaultPath: "/Applications" } : {}),
          filters: [{ name: t("app"), extensions: [platform === "macos" ? "app" : "exe"] }],
        });
        return typeof path === "string" ? path : null;
      },
      pickTarget: async (type) => {
        const path = await open({
          title:
            type === "OPEN_FOLDER"
              ? t("pickFolder")
              : type === "SCRIPT"
                ? t("pickTrustedScript")
                : t("pickFile"),
          directory: type === "OPEN_FOLDER",
          multiple: false,
          ...(type === "SCRIPT"
            ? {
                filters: [{ name: t("script"), extensions: [platform === "macos" ? "sh" : "ps1"] }],
              }
            : {}),
        });
        return typeof path === "string" ? path : null;
      },
      api: {
        ...bindingApi,
        create: (profile) => invoke<string>("create_runtime_profile", { profile }),
        remove: async (profileId) => {
          const current = await invoke<RuntimeSnapshot>("runtime_snapshot");
          if (current.profiles.some((profile) => profile.id === profileId)) {
            await invoke("delete_profile", { profileId });
          }
        },
        resume: () => (wasPaused ? Promise.resolve() : invoke("cancel_binding_capture")),
      },
      finish: async (message) => {
        creatorOpen = false;
        showNotice(message);
        try {
          await reloadRuntimeSnapshot();
        } catch (error) {
          showNotice(message + t("refreshFailedSuffix") + String(error));
          render();
        }
      },
    });
  } catch (error) {
    creatorOpen = false;
    showNotice((editId ? t("editFailed") : t("createStartFailed")) + String(error));
    await reloadRuntimeSnapshot();
  }
}
let dataBusy = false;
async function manageData(mode: "export" | "backup" | "restore") {
  if (dataBusy) return;
  dataBusy = true;
  document
    .querySelectorAll<HTMLButtonElement>(".settings-data-actions button")
    .forEach((button) => {
      button.disabled = true;
    });
  try {
    const filters = [{ name: t("profileFile"), extensions: ["json"] }];
    const path =
      mode === "restore"
        ? await open({ multiple: false, filters })
        : await save({
            filters,
            defaultPath: mode === "export" ? "blink-commands.json" : "blink-runtime.backup.json",
          });
    if (!path || Array.isArray(path)) return;
    if (mode === "restore") {
      if (!(await confirm(t("restoreWarning"), { title: t("restoreRuntime"), kind: "warning" })))
        return;
      await invoke("restore_runtime", { path });
      showNotice(t("dataRestored"));
    } else {
      await invoke("export_runtime", { path, portable: mode === "export" });
      showNotice(t("dataSaved"));
    }
    try {
      await reloadRuntimeSnapshot();
    } catch (error) {
      showNotice(
        t(mode === "restore" ? "dataRestored" : "dataSaved") +
          t("refreshFailedSuffix") +
          String(error),
      );
    }
  } catch (error) {
    showNotice(t("dataFailed") + String(error));
  } finally {
    dataBusy = false;
    render();
    document
      .querySelectorAll<HTMLButtonElement>(".settings-data-actions button")
      .forEach((button) => {
        button.disabled = false;
      });
  }
}
async function importProfile() {
  const path = await open({
    multiple: false,
    filters: [{ name: t("profileFile"), extensions: ["json"] }],
  });
  if (!path || Array.isArray(path)) return;
  if (!(await confirm(t("trustImport"), { title: t("trustTitle"), kind: "warning" }))) return;
  try {
    await invoke("load_profile", { path });
    showNotice(t("imported"));
  } catch {
    showNotice(t("importFailed"));
  }
  await reloadRuntimeSnapshot();
}
async function toggleListener() {
  await invoke("toggle_listener_command");
  await reloadRuntimeSnapshot();
}
async function bind(physicalKey: string) {
  if (!bindingProfileId || bindingBusy) return;
  bindingBusy = true;
  try {
    await performBinding(bindingApi, bindingProfileId, physicalKey);
    showNotice(`${t("boundPrefix")}${physicalKey}`);
  } catch (error) {
    showNotice(String(error));
  }
  bindingProfileId = undefined;
  bindingBusy = false;
  render();
}
async function unbind(id: string) {
  await invoke("unbind_profile", { profileId: id });
  await reloadRuntimeSnapshot();
}
async function selectIcon(id: string, iconId: string) {
  await invoke("set_profile_icon", { profileId: id, iconId });
  dialog = undefined;
  showNotice(t("iconUpdated"));
  await reloadRuntimeSnapshot();
}
async function startBinding(id: string) {
  if (creatorOpen || bindingBusy || bindingProfileId) return;
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  activeMenu = undefined;
  showNotice("");
  try {
    await invoke("begin_binding_capture", { profileId: id });
    bindingProfileId = id;
  } catch {
    showNotice(t("bindStartFailed"));
  }
  render();
}
async function stopBinding() {
  if (bindingBusy) return;
  bindingProfileId = undefined;
  try {
    await invoke("cancel_binding_capture");
  } catch {
    showNotice(t("resumeFailed"));
  }
  await reloadRuntimeSnapshot();
}
window.addEventListener(
  "keydown",
  (event) => {
    if (creatorOpen || !bindingProfileId || bindingBusy) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    if (event.key === "Escape") {
      void stopBinding();
      return;
    }
    const captured = captureCreatorKey({ mode: "physical" }, event);
    if (captured.error) {
      showNotice(captured.error);
      render();
    }
    if (captured.physicalInput) void bind(captured.physicalInput);
  },
  true,
);

function render() {
  cancelCommandDrag?.();
  cancelCommandDrag = undefined;
  const previousDeckScroll = document.querySelector<HTMLElement>(".grid-scroll");
  if (previousDeckScroll) deckScrollTop = previousDeckScroll.scrollTop;
  // Presentation only: retain the full snapshot for bindings and Creator conflict checks.
  const profiles = (snapshot?.profiles ?? []).filter(
    (item) =>
      item.source !== "SYSTEM" ||
      item.id === "system-builtin-copy" ||
      item.id === "system-builtin-paste",
  );
  const platform = snapshot?.platform ?? "macos";
  const status = snapshot?.listenerStatus ?? "ERROR";
  const systemCount = profiles.filter((item) => item.source === "SYSTEM").length;
  const externalCount = profiles.length - systemCount;
  const title =
    page === "deck" ? t("deckTitle") : page === "workspaces" ? "工作空间" : t("settings");
  const subtitle =
    page === "deck"
      ? `${externalCount}${t("userCountSuffix")}${systemCount}${t("systemCountSuffix")}`
      : page === "workspaces"
        ? "一键同时发起一组动作，快速准备你的工作环境"
        : t("settingsSubtitle");
  app.innerHTML = `<main class="runtime-shell ${status === "PAUSED" ? "is-paused" : ""}"><aside class="sidebar"><div>${BrandSidebarHeader()}<nav><button class="nav-item ${page === "deck" ? "active" : ""}" data-page="deck">${RuntimeIcon("deck")}${t("deck")}</button><button class="nav-item ${page === "workspaces" ? "active" : ""}" data-page="workspaces">${RuntimeIcon("app")}工作空间</button><button class="nav-item ${page === "settings" ? "active" : ""}" data-page="settings">${RuntimeIcon("settings")}${t("settings")}</button></nav></div><div class="sidebar-bottom"><button class="sidebar-status ${status.toLowerCase()}" id="toggle-listener"><i></i>${statusText()[status]}</button><span>${t("runtimePrefix")}${status === "LISTENING" ? t("running") : t("notListening")}</span></div></aside>
    <section class="main-content ${page === "settings" ? "settings-content" : page === "workspaces" ? "workspace-content" : ""}"><header class="main-header"><div><h1>${title}</h1><p>${subtitle}</p></div>${page === "deck" ? `<div class="deck-actions"><button class="manage-button ${editingExternal ? "is-active" : ""}" id="toggle-external-edit">${RuntimeIcon("folder")}${editingExternal ? t("doneManaging") : t("manageCommands")}</button><button class="import-button" id="import">${RuntimeIcon("import")}${t("importProfile")}</button></div>` : page === "workspaces" ? `<div class="deck-actions"><button class="primary-button" id="workspace-create">${RuntimeIcon("plus")}新建工作空间</button></div>` : ""}</header>${notice ? `<p class="notice" role="status">${escapeHtml(notice)}</p>` : ""}${page === "deck" ? commandPage.mount(profiles, platform) : page === "workspaces" ? workspacePage.mount(workspaceSnapshot, workspaceEditor, workspaceActionDraft, workspaceBusy, platform) : settingsPage.mount(status, snapshot)}</section></main>${menuMarkup()}${dialogMarkup()}`;
  wireEvents();
  const scroll = document.querySelector<HTMLElement>(".grid-scroll");
  if (scroll) scroll.scrollTop = deckScrollTop;
}

function wireEvents() {
  document
    .querySelector<HTMLSelectElement>("#runtime-language")
    ?.addEventListener("change", (event) => {
      const next = (event.target as HTMLSelectElement).value;
      if (next !== "en" && next !== "zh-CN") return;
      showNotice(setLanguage(next) ? "" : t("preferenceFailed"));
      void invoke("set_ui_language", { language: getLanguage() }).catch(console.error);
      render();
      document.querySelector<HTMLSelectElement>("#runtime-language")?.focus();
    });
  document.querySelectorAll<HTMLButtonElement>("[data-tab]").forEach((button) => {
    button.disabled = Boolean(bindingProfileId) || creatorOpen;
    button.tabIndex = button.dataset.tab === deckTab ? 0 : -1;
    button.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const next =
        event.key === "Home"
          ? "mine"
          : event.key === "End"
            ? "system"
            : deckTab === "mine"
              ? "system"
              : "mine";
      document.querySelector<HTMLButtonElement>(`[data-tab="${next}"]`)?.click();
    });
    button.addEventListener("click", () => {
      deckTab = button.dataset.tab as typeof deckTab;
      deckScrollTop = 0;
      const scroll = document.querySelector(".grid-scroll");
      if (scroll) scroll.scrollTop = 0;
      render();
      document.querySelector<HTMLButtonElement>(`[data-tab="${deckTab}"]`)?.focus();
    });
  });
  document.querySelectorAll<HTMLButtonElement>("[data-drag-id]").forEach((handle) => {
    handle.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || !event.isPrimary || bindingProfileId || creatorOpen) return;
      event.preventDefault();
      cancelCommandDrag?.();
      cancelCommandDrag = startCommandDrag(event, handle, (order) => {
        showNotice(saveOrder(order) ? t("orderSaved") : t("preferenceFailed"));
        render();
      });
    });
  });
  document.querySelectorAll<HTMLImageElement>(".native-app-icon").forEach((image) => {
    const show = () => image.parentElement?.classList.add("has-native-icon");
    image.addEventListener("load", show);
    image.addEventListener("error", () => {
      image.parentElement?.classList.remove("has-native-icon");
      image.remove();
    });
    if (image.complete && image.naturalWidth > 0) show();
  });
  document
    .querySelectorAll<HTMLButtonElement>("[data-edit]")
    .forEach((button) =>
      button.addEventListener("click", () => void startCreator(button.dataset.edit!)),
    );
  const actions = document.querySelector(".deck-actions");
  if (actions && page === "deck") {
    const createButton = document.createElement("button");
    createButton.className = "primary-button";
    createButton.id = "create-command";
    createButton.innerHTML = `${RuntimeIcon("plus")}${t("newCommand")}`;
    createButton.disabled = creatorOpen || Boolean(bindingProfileId);
    createButton.addEventListener("click", () => void startCreator());
    actions.prepend(createButton);
  }
  document
    .querySelectorAll<HTMLButtonElement>("#import")
    .forEach((button) => button.addEventListener("click", () => void importProfile()));
  document
    .querySelectorAll<HTMLButtonElement>("#toggle-listener")
    .forEach((button) => button.addEventListener("click", () => void toggleListener()));
  document
    .querySelectorAll<HTMLButtonElement>("[data-bind]")
    .forEach((button) =>
      button.addEventListener("click", () => void startBinding(button.dataset.bind!)),
    );
  document
    .querySelectorAll<HTMLButtonElement>("[data-cancel-bind]")
    .forEach((button) => button.addEventListener("click", () => void stopBinding()));
  document.querySelectorAll<HTMLButtonElement>("[data-page]").forEach((button) =>
    button.addEventListener("click", () => {
      page = button.dataset.page as "deck" | "workspaces" | "settings";
      activeMenu = undefined;
      render();
    }),
  );
  document.querySelector("#toggle-external-edit")?.addEventListener("click", () => {
    editingExternal = !editingExternal;
    selectedExternalIds.clear();
    render();
  });
  document.querySelector("#delete-selected-external")?.addEventListener("click", () => {
    dialog = {
      kind: "delete-many",
      id: "",
      name: `${t("selectedPrefix")}${selectedExternalIds.size}${t("commandsCountSuffix")}`,
    };
    render();
  });
  document.querySelectorAll<HTMLButtonElement>("[data-select-external]").forEach((button) =>
    button.addEventListener("click", () => {
      const id = button.dataset.selectExternal!;
      selectedExternalIds.has(id) ? selectedExternalIds.delete(id) : selectedExternalIds.add(id);
      render();
    }),
  );
  document.querySelectorAll<HTMLButtonElement>("[data-menu]").forEach((button) =>
    button.addEventListener("click", () => {
      const rect = button.getBoundingClientRect();
      activeMenu =
        activeMenu?.id === button.dataset.menu
          ? undefined
          : {
              id: button.dataset.menu!,
              ...menuPosition(rect),
            };
      render();
    }),
  );
  document.querySelector("#menu-backdrop")?.addEventListener("click", () => {
    activeMenu = undefined;
    render();
  });
  document
    .querySelectorAll<HTMLButtonElement>("[data-unbind]")
    .forEach((button) =>
      button.addEventListener("click", () => void unbind(button.dataset.unbind!)),
    );
  document.querySelectorAll<HTMLButtonElement>("[data-rename]").forEach((button) =>
    button.addEventListener("click", () => {
      dialog = { kind: "rename", id: button.dataset.rename!, name: button.dataset.name! };
      activeMenu = undefined;
      render();
    }),
  );
  document.querySelectorAll<HTMLButtonElement>("[data-delete]").forEach((button) =>
    button.addEventListener("click", () => {
      dialog = { kind: "delete", id: button.dataset.delete!, name: button.dataset.name! };
      activeMenu = undefined;
      render();
    }),
  );
  document.querySelectorAll<HTMLButtonElement>("[data-icons]").forEach((button) =>
    button.addEventListener("click", () => {
      dialog = { kind: "icons", id: button.dataset.icons!, name: button.dataset.name! };
      activeMenu = undefined;
      render();
    }),
  );
  document
    .querySelectorAll<HTMLButtonElement>("[data-icon-choice]")
    .forEach((button) =>
      button.addEventListener(
        "click",
        () => void selectIcon(dialog!.id, button.dataset.iconChoice!),
      ),
    );
  document
    .querySelector("#export-commands")
    ?.addEventListener("click", () => void manageData("export"));
  document
    .querySelector("#backup-runtime")
    ?.addEventListener("click", () => void manageData("backup"));
  document
    .querySelector("#restore-runtime")
    ?.addEventListener("click", () => void manageData("restore"));
  document.querySelector("#dialog-cancel")?.addEventListener("click", () => {
    dialog = undefined;
    render();
  });
  document.querySelector("#dialog-confirm")?.addEventListener("click", () => void confirmDialog());
  document
    .querySelector("#quit")
    ?.addEventListener("click", () => void invoke("quit_blink_command"));
  document
    .querySelector("#workspace-create")
    ?.addEventListener("click", () => void startWorkspaceEditor());
  document.querySelector("#workspace-editor-cancel")?.addEventListener("click", () => {
    workspaceEditor = undefined;
    workspaceActionDraft = undefined;
    render();
  });
  document
    .querySelector("#workspace-editor-save")
    ?.addEventListener("click", () => void saveWorkspaceEditor());
  document
    .querySelector<HTMLInputElement>("#workspace-name")
    ?.addEventListener("input", (event) => {
      if (workspaceEditor) workspaceEditor.name = (event.target as HTMLInputElement).value;
    });
  document
    .querySelector("#workspace-add-action")
    ?.addEventListener("click", () => editWorkspaceAction());
  document
    .querySelector<HTMLSelectElement>("#workspace-action-type")
    ?.addEventListener("change", (event) => {
      if (!workspaceActionDraft) return;
      workspaceActionDraft.type = (event.target as HTMLSelectElement)
        .value as typeof workspaceActionDraft.type;
      workspaceActionDraft.target = "";
      render();
    });
  document.querySelector("#workspace-action-cancel")?.addEventListener("click", () => {
    workspaceActionDraft = undefined;
    render();
  });
  document
    .querySelector("#workspace-action-confirm")
    ?.addEventListener("click", confirmWorkspaceAction);
  document.querySelector("#workspace-pick-target")?.addEventListener("click", async () => {
    if (!workspaceActionDraft || !snapshot) return;
    const type = workspaceActionDraft.type;
    const path = await open({
      title:
        type === "OPEN_APP"
          ? "选择 App"
          : type === "OPEN_FOLDER"
            ? "选择文件夹"
            : type === "SCRIPT"
              ? "选择可信脚本"
              : "选择文件",
      multiple: false,
      directory: type === "OPEN_FOLDER",
      ...(type === "OPEN_APP" && snapshot.platform === "macos"
        ? { defaultPath: "/Applications" }
        : {}),
      ...(type === "SCRIPT"
        ? {
            filters: [{ name: "脚本", extensions: [snapshot.platform === "macos" ? "sh" : "ps1"] }],
          }
        : {}),
    });
    if (typeof path === "string" && workspaceActionDraft) {
      workspaceActionDraft.target = path;
      render();
    }
  });
  document.querySelectorAll<HTMLInputElement>("[data-workspace-enabled]").forEach((input) =>
    input.addEventListener("change", () => {
      if (workspaceEditor)
        workspaceEditor.items[Number(input.dataset.workspaceEnabled)].enabled = input.checked;
      render();
    }),
  );
  document
    .querySelectorAll<HTMLButtonElement>("[data-workspace-edit-action]")
    .forEach((button) =>
      button.addEventListener("click", () =>
        editWorkspaceAction(Number(button.dataset.workspaceEditAction)),
      ),
    );
  document.querySelectorAll<HTMLButtonElement>("[data-workspace-remove-action]").forEach((button) =>
    button.addEventListener("click", () => {
      workspaceEditor?.items.splice(Number(button.dataset.workspaceRemoveAction), 1);
      render();
    }),
  );
  for (const direction of ["up", "down"] as const)
    document
      .querySelectorAll<HTMLButtonElement>(`[data-workspace-${direction}]`)
      .forEach((button) =>
        button.addEventListener("click", () => {
          if (!workspaceEditor) return;
          const index = Number(
            button.dataset[direction === "up" ? "workspaceUp" : "workspaceDown"],
          );
          const other = direction === "up" ? index - 1 : index + 1;
          [workspaceEditor.items[index], workspaceEditor.items[other]] = [
            workspaceEditor.items[other],
            workspaceEditor.items[index],
          ];
          workspaceEditor.items.forEach((item, itemIndex) => (item.order = itemIndex));
          render();
        }),
      );
  document
    .querySelectorAll<HTMLButtonElement>("[data-workspace-edit]")
    .forEach((button) =>
      button.addEventListener(
        "click",
        () => void startWorkspaceEditor(button.dataset.workspaceEdit),
      ),
    );
  document
    .querySelectorAll<HTMLButtonElement>("[data-workspace-run]")
    .forEach((button) =>
      button.addEventListener("click", () => void runWorkspace(button.dataset.workspaceRun!)),
    );
  document.querySelectorAll<HTMLButtonElement>("[data-workspace-menu-edit]").forEach((button) =>
    button.addEventListener("click", () => {
      activeMenu = undefined;
      void startWorkspaceEditor(button.dataset.workspaceMenuEdit);
    }),
  );
  document.querySelectorAll<HTMLButtonElement>("[data-workspace-menu-delete]").forEach((button) =>
    button.addEventListener("click", async () => {
      activeMenu = undefined;
      if (await confirm("删除这个 Workspace？其中的动作与 V1 命令不会被执行或删除。")) {
        await invoke("delete_workspace", { workspaceId: button.dataset.workspaceMenuDelete });
        await reloadRuntimeSnapshot();
      }
    }),
  );
  document.querySelectorAll<HTMLButtonElement>("[data-workspace-delete]").forEach((button) =>
    button.addEventListener("click", async () => {
      if (await confirm("删除这个 Workspace？其中的动作与 V1 命令不会被执行或删除。")) {
        await invoke("delete_workspace", { workspaceId: button.dataset.workspaceDelete });
        await reloadRuntimeSnapshot();
      }
    }),
  );
}

function menuMarkup() {
  if (!activeMenu || !snapshot) return "";
  if (activeMenu.id.startsWith("workspace:")) {
    const id = activeMenu.id.slice("workspace:".length);
    const item = workspaceSnapshot?.workspaces.find((workspace) => workspace.id === id);
    if (!item) return "";
    return `<div id="menu-backdrop" class="menu-backdrop"></div><div class="profile-menu" style="left:${activeMenu.x}px;top:${activeMenu.y}px"><button data-workspace-menu-edit="${item.id}">${RuntimeIcon("rename")}编辑 Workspace</button><hr><button class="danger" data-workspace-menu-delete="${item.id}">${RuntimeIcon("delete")}删除 Workspace</button></div>`;
  }
  const item = snapshot.profiles.find((profile) => profile.id === activeMenu!.id);
  if (!item) return "";
  return `<div id="menu-backdrop" class="menu-backdrop"></div><div class="profile-menu" style="left:${activeMenu.x}px;top:${activeMenu.y}px">${item.source === "EXTERNAL" ? `<button data-edit="${item.id}">${RuntimeIcon("rename")}${t("editCommand")}</button>` : ""}<button data-bind="${item.id}">${RuntimeIcon("command")}${item.physicalInput ? t("rebind") : t("bind")}</button>${item.physicalInput ? `<button data-unbind="${item.id}">${RuntimeIcon("unbind")}${t("removeBinding")}</button>` : ""}<button data-icons="${item.id}" data-name="${escapeHtml(item.name)}">${RuntimeIcon("image")}${t("changeIcon")}</button><button data-rename="${item.id}" data-name="${escapeHtml(item.name)}">${RuntimeIcon("rename")}${t("rename")}</button><hr><button class="danger" data-delete="${item.id}" data-name="${escapeHtml(item.name)}">${RuntimeIcon("delete")}${t("delete")}</button></div>`;
}
async function confirmDialog() {
  if (!dialog) return;
  if (dialog.kind === "rename") {
    const name = document.querySelector<HTMLInputElement>("#rename-input")?.value.trim();
    if (!name) return;
    await invoke("rename_profile", { profileId: dialog.id, name });
  } else if (dialog.kind === "delete") await invoke("delete_profile", { profileId: dialog.id });
  else if (dialog.kind === "delete-many") {
    const count = await invoke<number>("delete_external_profiles", {
      profileIds: [...selectedExternalIds],
    });
    selectedExternalIds.clear();
    editingExternal = false;
    showNotice(`${t("deletedPrefix")}${count}${t("commandsCountSuffix")}`);
  }
  dialog = undefined;
  await reloadRuntimeSnapshot();
}
function dialogMarkup() {
  if (!dialog) return "";
  if (dialog.kind === "icons")
    return `<div class="dialog-backdrop"><section class="dialog icon-dialog"><p class="dialog-kicker">${t("presetIcons")}</p><h2>${t("iconForPrefix")}${escapeHtml(dialog.name)}${t("iconForSuffix")}</h2><div class="icon-grid">${iconChoices.map((id, index) => `<button data-icon-choice="${id}" aria-label="${t("presetIcons")} ${index + 1}">${RuntimeIcon(id)}</button>`).join("")}</div><div><button id="dialog-cancel" class="dialog-cancel">${t("cancel")}</button></div></section></div>`;
  const deleting = dialog.kind !== "rename";
  return `<div class="dialog-backdrop"><section class="dialog"><p class="dialog-kicker">${deleting ? t("deleteCommands") : t("renameCommand")}</p><h2>${deleting ? `${t("deletePrefix")}${escapeHtml(dialog.name)}${t("deleteSuffix")}` : t("newDisplayName")}</h2>${deleting ? `<p>${t("deleteHint")}</p>` : `<input id="rename-input" maxlength="80" value="${escapeHtml(dialog.name)}">`}<div><button id="dialog-cancel" class="dialog-cancel">${t("cancel")}</button><button id="dialog-confirm" class="${deleting ? "dialog-danger" : ""}">${deleting ? t("delete") : t("save")}</button></div></section></div>`;
}

export function bootstrapApp() {
  document.documentElement.lang = getLanguage();
  void invoke("set_ui_language", { language: getLanguage() }).catch(console.error);
  void reloadRuntimeSnapshot();
  void listen("runtime-diagnostic", () => void reloadRuntimeSnapshot());
}

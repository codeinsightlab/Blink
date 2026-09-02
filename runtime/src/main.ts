import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";
import { HotkeyDisplay } from "./keycap";
import { RuntimeIcon, type RuntimeIconName } from "./runtimeIcon";
import type { RuntimePlatform, RuntimeProfile, RuntimeSnapshot } from "./types";
import "./style.css";

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
let bindingProfileId: string | undefined;
let activeMenu: { id: string; x: number; y: number } | undefined;
let dialog:
  { kind: "rename" | "delete" | "delete-many" | "icons"; id: string; name: string } | undefined;
let notice = "";
let page: "deck" | "settings" = "deck";
let editingExternal = false;
let selectedExternalIds = new Set<string>();
let deckScrollTop = 0;

const statusText: Record<string, string> = {
  LISTENING: "LIVE",
  PAUSED: "已暂停",
  ERROR: "需要处理",
};

function actionIcon(item: RuntimeProfile): RuntimeIconName {
  if (item.iconId && iconChoices.includes(item.iconId as RuntimeIconName))
    return item.iconId as RuntimeIconName;
  const systemId = item.id.replace("system-builtin-", "");
  if (iconChoices.includes(systemId as RuntimeIconName)) return systemId as RuntimeIconName;
  return item.actionHotkey ? "command" : "app";
}

async function reloadRuntimeSnapshot() {
  snapshot = await invoke<RuntimeSnapshot>("runtime_snapshot");
  render();
}
async function importProfile() {
  const path = await open({
    multiple: false,
    filters: [{ name: "KeyFlow Profile", extensions: ["json"] }],
  });
  if (!path || Array.isArray(path)) return;
  try {
    await invoke("load_profile", { path });
    notice = "Profile 已导入";
  } catch {
    notice = "无法导入此 Profile";
  }
  await reloadRuntimeSnapshot();
}
async function toggleListener() {
  await invoke("toggle_listener_command");
  await reloadRuntimeSnapshot();
}
async function bind(physicalKey: string) {
  if (!bindingProfileId) return;
  try {
    await invoke("bind_key", { profileId: bindingProfileId, physicalKey });
    notice = `已绑定 ${physicalKey}`;
  } catch {
    await invoke("cancel_binding_capture").catch(() => undefined);
    notice = "无法绑定此按键";
  }
  bindingProfileId = undefined;
  await reloadRuntimeSnapshot();
}
async function unbind(id: string) {
  await invoke("unbind_profile", { profileId: id });
  await reloadRuntimeSnapshot();
}
async function selectIcon(id: string, iconId: string) {
  await invoke("set_profile_icon", { profileId: id, iconId });
  dialog = undefined;
  notice = "图标已更新";
  await reloadRuntimeSnapshot();
}
async function startBinding(id: string) {
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  activeMenu = undefined;
  notice = "";
  try {
    await invoke("begin_binding_capture", { profileId: id });
    bindingProfileId = id;
  } catch {
    notice = "无法开始绑定，请先恢复监听";
  }
  render();
}
async function stopBinding() {
  bindingProfileId = undefined;
  try {
    await invoke("cancel_binding_capture");
  } catch {
    notice = "无法恢复快捷键监听";
  }
  await reloadRuntimeSnapshot();
}
function physicalInput(event: KeyboardEvent) {
  const key =
    event.code === "Space"
      ? "SPACE"
      : event.key.length === 1
        ? event.key.toUpperCase()
        : event.key.toUpperCase();
  const modifiers = [
    event.metaKey && "META",
    event.ctrlKey && "CTRL",
    event.altKey && "ALT",
    event.shiftKey && "SHIFT",
  ].filter(Boolean);
  return [...modifiers, key].join("+");
}
window.addEventListener(
  "keydown",
  (event) => {
    if (!bindingProfileId) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    if (event.key === "Escape") {
      void stopBinding();
      return;
    }
    const key = physicalInput(event);
    if (!["META", "CTRL", "ALT", "SHIFT"].includes(key)) void bind(key);
  },
  true,
);

function bindingMarkup(item: RuntimeProfile, platform: RuntimePlatform, showUnbind = false) {
  if (bindingProfileId === item.id)
    return `<div class="binding-capture"><span>按下新的实体按键</span><button data-cancel-bind>Esc 取消</button></div>`;
  if (!item.physicalInput)
    return `<button class="bind-cta" data-bind="${escapeHtml(item.id)}">＋ 绑定</button>`;
  const status =
    snapshot?.listenerStatus === "PAUSED"
      ? "paused"
      : snapshot?.listenerStatus === "ERROR"
        ? "registration-failed"
        : undefined;
  return `<span class="bound-control">${HotkeyDisplay(item.physicalInput.split("+"), platform, { interactiveId: item.id, status })}${showUnbind ? `<button class="unbind-inline" data-unbind="${escapeHtml(item.id)}">解绑</button>` : ""}</span>`;
}

function externalRow(item: RuntimeProfile, platform: RuntimePlatform) {
  const menuOpen = activeMenu?.id === item.id;
  const selecting = editingExternal;
  const selected = selectedExternalIds.has(item.id);
  return `<article class="command-row ${bindingProfileId === item.id ? "is-binding" : ""} ${selected ? "is-selected" : ""}">
    <div class="row-identity"><span class="command-icon tone-external">${RuntimeIcon(actionIcon(item))}</span><div><h3>${escapeHtml(item.name)}</h3><p>${escapeHtml(item.description ?? "执行 Profile 定义的动作")}</p></div></div>
    <span class="source-label">${RuntimeIcon("external")}外部 Profile</span>
    <div class="row-binding">${bindingMarkup(item, platform)}</div>
    <div class="row-tools">${selecting ? `<button class="profile-select" data-select-external="${item.id}" aria-pressed="${selected}">${selected ? "✓" : ""}</button>` : `<button class="more ${menuOpen ? "is-open" : ""}" data-menu="${item.id}" aria-label="更多操作">${RuntimeIcon("more")}</button>`}</div>
  </article>`;
}

function systemTile(item: RuntimeProfile, platform: RuntimePlatform) {
  return `<article class="system-tile ${bindingProfileId === item.id ? "is-binding" : ""}">
    <div class="system-tile-head"><span class="command-icon tone-${actionIcon(item)}">${RuntimeIcon(actionIcon(item))}</span><div><h3>${escapeHtml(item.name)}</h3><p>${escapeHtml(item.description ?? "系统快捷动作")}</p></div>${item.actionHotkey?.length ? HotkeyDisplay(item.actionHotkey, platform) : `<span class="unsupported">当前平台无快捷键</span>`}</div>
    <div class="system-tile-bind">${bindingMarkup(item, platform, true)}</div>
  </article>`;
}

function deckMarkup(profiles: RuntimeProfile[], platform: RuntimePlatform) {
  const external = profiles.filter((item) => item.source === "EXTERNAL");
  const system = profiles.filter((item) => item.source === "SYSTEM");
  return `<div class="grid-scroll">
    <section class="deck-section"><div class="section-heading"><h2>我的命令 <small>${external.length}</small></h2>${editingExternal && selectedExternalIds.size ? `<button class="delete-selected" id="delete-selected-external">删除已选</button>` : ""}</div>
      ${external.length ? `<div class="command-list"><div class="command-list-labels"><span>名称 / 描述</span><span>来源</span><span>绑定按键</span><span></span></div>${external.map((item) => externalRow(item, platform)).join("")}</div>` : `<div class="empty-inline">还没有外部命令，导入 Profile 后会显示在这里。</div>`}
    </section>
    <section class="deck-section system-section"><div class="section-heading"><h2>系统快捷动作 <small>${system.length}</small></h2><p>快捷键来自当前 Profile，不由 Runtime 推断或修正</p></div><div class="system-grid">${system.map((item) => systemTile(item, platform)).join("")}</div></section>
    <aside class="deck-tip">${RuntimeIcon("info")}<span>点击已绑定 Keycap 可重新绑定；动作快捷键只展示 Profile 的原始平台数据。</span></aside>
  </div>`;
}

function render() {
  const previousDeckScroll = document.querySelector<HTMLElement>(".grid-scroll");
  if (previousDeckScroll) deckScrollTop = previousDeckScroll.scrollTop;
  const profiles = snapshot?.profiles ?? [];
  const platform = snapshot?.platform ?? "macos";
  const status = snapshot?.listenerStatus ?? "ERROR";
  const systemCount = profiles.filter((item) => item.source === "SYSTEM").length;
  const externalCount = profiles.length - systemCount;
  app.innerHTML = `<main class="runtime-shell ${status === "PAUSED" ? "is-paused" : ""}"><aside class="sidebar"><div><div class="sidebar-brand"><span>${RuntimeIcon("brand")}</span><b>KEYFLOW</b></div><nav><button class="nav-item ${page === "deck" ? "active" : ""}" data-page="deck">${RuntimeIcon("deck")}Command Deck</button><button class="nav-item ${page === "settings" ? "active" : ""}" data-page="settings">${RuntimeIcon("settings")}设置</button></nav></div><div class="sidebar-bottom"><button class="sidebar-status ${status.toLowerCase()}" id="toggle-listener"><i></i>${statusText[status]}</button><span>Runtime ${status === "LISTENING" ? "运行中" : "未监听"}</span></div></aside>
    <section class="main-content"><header class="main-header"><div><h1>${page === "deck" ? "Personal Command Deck" : "设置"}</h1><p>${page === "deck" ? `${externalCount} 个外部导入 · ${systemCount} 个系统快捷动作` : "运行状态与应用行为"}</p></div>${page === "deck" ? `<div class="deck-actions"><button class="manage-button ${editingExternal ? "is-active" : ""}" id="toggle-external-edit">${RuntimeIcon("folder")}${editingExternal ? "完成管理" : "管理外部命令"}</button><button class="import-button" id="import">${RuntimeIcon("import")}导入 Profile</button></div>` : ""}</header>${notice ? `<p class="notice" role="status">${escapeHtml(notice)}</p>` : ""}${page === "deck" ? deckMarkup(profiles, platform) : settingsMarkup(status)}${menuMarkup()}${dialogMarkup()}</section></main>`;
  wireEvents();
  const scroll = document.querySelector<HTMLElement>(".grid-scroll");
  if (scroll) scroll.scrollTop = deckScrollTop;
}

function wireEvents() {
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
      page = button.dataset.page as "deck" | "settings";
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
      name: `已选择 ${selectedExternalIds.size} 个外部 Profile`,
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
              x: Math.min(rect.right - 190, window.innerWidth - 202),
              y: rect.bottom + 7,
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
  document.querySelector("#dialog-cancel")?.addEventListener("click", () => {
    dialog = undefined;
    render();
  });
  document.querySelector("#dialog-confirm")?.addEventListener("click", () => void confirmDialog());
  document
    .querySelector("#quit")
    ?.addEventListener("click", () => void invoke("quit_keyflow_command"));
}

function menuMarkup() {
  if (!activeMenu || !snapshot) return "";
  const item = snapshot.profiles.find((profile) => profile.id === activeMenu!.id);
  if (!item) return "";
  return `<div id="menu-backdrop" class="menu-backdrop"></div><div class="profile-menu" style="left:${activeMenu.x}px;top:${activeMenu.y}px"><button data-bind="${item.id}">${RuntimeIcon("command")}${item.physicalInput ? "重新绑定" : "绑定"}</button>${item.physicalInput ? `<button data-unbind="${item.id}">${RuntimeIcon("unbind")}解除绑定</button>` : ""}<button data-icons="${item.id}" data-name="${escapeHtml(item.name)}">${RuntimeIcon("image")}更换图标</button><button data-rename="${item.id}" data-name="${escapeHtml(item.name)}">${RuntimeIcon("rename")}改名</button><hr><button class="danger" data-delete="${item.id}" data-name="${escapeHtml(item.name)}">${RuntimeIcon("delete")}删除</button></div>`;
}
function settingsMarkup(status: string) {
  const event = snapshot?.lastEvent ?? "尚未收到已绑定快捷键";
  const result = snapshot?.lastError ? `失败：${snapshot.lastError}` : "未发现最近一次执行错误";
  return `<div class="settings-page"><section class="settings-hero"><span class="settings-eyebrow">KEYFLOW RUNTIME</span><h2>${status === "LISTENING" ? "正在监听" : status === "PAUSED" ? "监听已暂停" : "监听需要处理"}</h2><p>Runtime 只消费 Profile、绑定实体按键并执行原始动作。</p></section><section class="setting-group"><p class="setting-label">快捷键诊断</p><div class="setting-panel"><div class="setting-row"><div><b>最近全局快捷键</b><span>${escapeHtml(event)}</span></div></div><div class="setting-row"><div><b>最近命令结果</b><span>${escapeHtml(result)}</span></div></div></div></section><section class="setting-group"><div class="setting-panel"><div class="setting-row"><div><b>退出 KeyFlow</b><span>停止监听并退出常驻应用</span></div><button id="quit" class="setting-danger">退出</button></div></div></section></div>`;
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
    notice = `已删除 ${count} 个外部 Profile`;
  }
  dialog = undefined;
  await reloadRuntimeSnapshot();
}
function dialogMarkup() {
  if (!dialog) return "";
  if (dialog.kind === "icons")
    return `<div class="dialog-backdrop"><section class="dialog icon-dialog"><p class="dialog-kicker">统一 Lucide 图标</p><h2>为「${escapeHtml(dialog.name)}」选择图标</h2><div class="icon-grid">${iconChoices.map((id) => `<button data-icon-choice="${id}" aria-label="${id}">${RuntimeIcon(id)}</button>`).join("")}</div><div><button id="dialog-cancel" class="dialog-cancel">取消</button></div></section></div>`;
  const deleting = dialog.kind !== "rename";
  return `<div class="dialog-backdrop"><section class="dialog"><p class="dialog-kicker">${deleting ? "删除外部 Profile" : "重命名命令"}</p><h2>${deleting ? `删除「${escapeHtml(dialog.name)}」？` : "输入新的显示名称"}</h2>${deleting ? `<p>只从 Runtime 移除，不修改原始 Profile 文件。</p>` : `<input id="rename-input" maxlength="80" value="${escapeHtml(dialog.name)}">`}<div><button id="dialog-cancel" class="dialog-cancel">取消</button><button id="dialog-confirm" class="${deleting ? "dialog-danger" : ""}">${deleting ? "删除" : "保存"}</button></div></section></div>`;
}

void reloadRuntimeSnapshot();
void listen("runtime-diagnostic", () => void reloadRuntimeSnapshot());

import { t, getLanguage, setLanguage, builtinText } from "./locale.ts";
import { invoke } from "@tauri-apps/api/core";
import { open, confirm } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";
import { HotkeyDisplay } from "./keycap";
import { RuntimeIcon, type RuntimeIconName } from "./runtimeIcon";
import type { RuntimePlatform, RuntimeProfile, RuntimeSnapshot } from "./types";
import { openRuntimeCreator, captureCreatorKey } from "./creator";
import { performBinding, type BindingOperationApi } from "./bindingOperation";
import type { Profile } from "@blink/contract";
import "./style.css";
import "./settings.css";
import { BrandSidebarHeader, SettingsView } from "./settingsView";
import { orderedCommands, saveOrder } from "./uiPreferences";

import { startCommandDrag } from "./commandDrag";

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
      : clamp(trigger.top - MENU_ESTIMATED_HEIGHT - 7, MENU_SAFE_MARGIN, window.innerHeight - MENU_SAFE_MARGIN);
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
let page: "deck" | "settings" = "deck";
let deckTab: "mine" | "system" = "mine";
let editingExternal = false;
let selectedExternalIds = new Set<string>();
let deckScrollTop = 0;

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

function actionIcon(item: RuntimeProfile): RuntimeIconName {
  if (item.iconId && iconChoices.includes(item.iconId as RuntimeIconName))
    return item.iconId as RuntimeIconName;
  const systemId = item.id.replace("system-builtin-", "");
  if (iconChoices.includes(systemId as RuntimeIconName)) return systemId as RuntimeIconName;
  if (item.actionType)
    return (
      {
        OPEN_APP: "app",
        TOGGLE_APP: "app",
        COMMAND: "command",
        OPEN_URL: "external",
        OPEN_FILE: "import",
        OPEN_FOLDER: "folder",
        SCRIPT: "command",
      } as const
    )[item.actionType];
  return item.actionHotkey ? "command" : "app";
}

function profileIcon(item: RuntimeProfile): string {
  const fallback = RuntimeIcon(actionIcon(item));
  return item.iconSource?.startsWith("data:image/png;base64,")
    ? `${fallback}<img class="native-app-icon" src="${escapeHtml(item.iconSource)}" alt="" draggable="false" />`
    : fallback;
}

async function reloadRuntimeSnapshot() {
  snapshot = await invoke<RuntimeSnapshot>("runtime_snapshot");
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

function bindingMarkup(item: RuntimeProfile, platform: RuntimePlatform, showUnbind = false) {
  if (bindingProfileId === item.id)
    return `<div class="binding-capture"><span>${t("pressNewPhysical")}</span><button data-cancel-bind>${t("escapeCancel")}</button></div>`;
  if (!item.physicalInput)
    return `<button class="bind-cta" data-bind="${escapeHtml(item.id)}">${t("bindButton")}</button>`;
  const status =
    snapshot?.listenerStatus === "PAUSED"
      ? "paused"
      : snapshot?.listenerStatus === "ERROR"
        ? "registration-failed"
        : undefined;
  return `<span class="bound-control">${HotkeyDisplay(item.physicalInput.split("+"), platform, { interactiveId: item.id, status })}${showUnbind ? `<button class="unbind-inline" data-unbind="${escapeHtml(item.id)}">${t("unbind")}</button>` : ""}</span>`;
}

function externalRow(item: RuntimeProfile, platform: RuntimePlatform) {
  const menuOpen = activeMenu?.id === item.id;
  const selecting = editingExternal;
  const selected = selectedExternalIds.has(item.id);
  return `<article data-row-id="${escapeHtml(item.id)}" class="command-row ${bindingProfileId === item.id ? "is-binding" : ""} ${selected ? "is-selected" : ""}">
    <div class="row-identity"><button class="drag-handle" ${bindingProfileId || creatorOpen ? "disabled" : ""} data-drag-id="${escapeHtml(item.id)}" aria-label="${t("dragSort")}" title="${t("dragSort")}">${RuntimeIcon("drag")}</button><span class="command-icon tone-external">${profileIcon(item)}</span><div><h3>${escapeHtml(item.name)}</h3><p>${escapeHtml(item.description ?? t("actionDescription"))}</p></div></div>
    <span class="source-label">${RuntimeIcon("external")}${t("userProfile")}</span>
    <div class="row-binding">${bindingMarkup(item, platform)}</div>
    <div class="row-tools">${selecting ? `<button class="profile-select" data-select-external="${item.id}" aria-pressed="${selected}">${selected ? "✓" : ""}</button>` : `<button class="more ${menuOpen ? "is-open" : ""}" data-menu="${item.id}" aria-label="${t("moreActions")}">${RuntimeIcon("more")}</button>`}</div>
  </article>`;
}

function systemTile(item: RuntimeProfile, platform: RuntimePlatform) {
  const key: "copy" | "paste" = item.id === "system-builtin-copy" ? "copy" : "paste";
  const name = builtinText(key, item.name);
  const description = builtinText(
    key === "copy" ? "copyDescription" : "pasteDescription",
    item.description ?? "",
  );

  return `<article class="system-tile ${bindingProfileId === item.id ? "is-binding" : ""}">
    <div class="system-tile-head"><span class="command-icon tone-${actionIcon(item)}">${RuntimeIcon(actionIcon(item))}</span><div><h3>${escapeHtml(name)}</h3><p>${escapeHtml(description || t("systemActions"))}</p></div>${item.actionHotkey?.length ? HotkeyDisplay(item.actionHotkey, platform) : `<span class="unsupported">${t("noPlatformHotkey")}</span>`}</div>
    <div class="system-tile-bind">${bindingMarkup(item, platform, true)}</div>
  </article>`;
}

function deckMarkup(profiles: RuntimeProfile[], platform: RuntimePlatform) {
  const external = orderedCommands(profiles.filter((item) => item.source === "EXTERNAL"));
  const system = profiles.filter((item) => item.source === "SYSTEM");
  return `<div class="deck-tabs" role="tablist" aria-label="${t("commandSections")}"><button role="tab" id="mine-tab" aria-controls="mine-panel" aria-selected="${deckTab === "mine"}" data-tab="mine">${t("myCommands")} <small>${external.length}</small></button><button role="tab" id="system-tab" aria-controls="system-panel" aria-selected="${deckTab === "system"}" data-tab="system">${t("systemActions")} <small>${system.length}</small></button></div><div class="grid-scroll" role="tabpanel" id="${deckTab}-panel" aria-labelledby="${deckTab}-tab">
    ${
      deckTab === "mine"
        ? `
    <section class="deck-section"><div class="section-heading"><h2>${t("myCommands")} <small>${external.length}</small></h2>${editingExternal && selectedExternalIds.size ? `<button class="delete-selected" id="delete-selected-external">${t("deleteSelected")}</button>` : ""}</div>
      ${external.length ? `<div class="command-list"><div class="command-list-labels"><span>${t("nameDescription")}</span><span>${t("source")}</span><span>${t("boundKey")}</span><span></span></div>${external.map((item) => externalRow(item, platform)).join("")}</div>` : `<div class="empty-inline">${t("emptyCommands")}</div>`}
    </section>
    `
        : `<section class="deck-section system-section"><div class="section-heading"><h2>${t("systemActions")} <small>${system.length}</small></h2><p>${t("systemHint")}</p></div><div class="system-grid">${system.map((item) => systemTile(item, platform)).join("")}</div></section>`
    }
  </div><aside class="deck-tip">${RuntimeIcon("info")}<span>${t("bottomHint")}</span></aside>`;
}

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
  app.innerHTML = `<main class="runtime-shell ${status === "PAUSED" ? "is-paused" : ""}"><aside class="sidebar"><div>${BrandSidebarHeader()}<nav><button class="nav-item ${page === "deck" ? "active" : ""}" data-page="deck">${RuntimeIcon("deck")}${t("deck")}</button><button class="nav-item ${page === "settings" ? "active" : ""}" data-page="settings">${RuntimeIcon("settings")}${t("settings")}</button></nav></div><div class="sidebar-bottom"><button class="sidebar-status ${status.toLowerCase()}" id="toggle-listener"><i></i>${statusText()[status]}</button><span>${t("runtimePrefix")}${status === "LISTENING" ? t("running") : t("notListening")}</span></div></aside>
    <section class="main-content ${page === "settings" ? "settings-content" : ""}"><header class="main-header"><div><h1>${page === "deck" ? t("deckTitle") : t("settings")}</h1><p>${page === "deck" ? `${externalCount}${t("userCountSuffix")}${systemCount}${t("systemCountSuffix")}` : t("settingsSubtitle")}</p></div>${page === "deck" ? `<div class="deck-actions"><button class="manage-button ${editingExternal ? "is-active" : ""}" id="toggle-external-edit">${RuntimeIcon("folder")}${editingExternal ? t("doneManaging") : t("manageCommands")}</button><button class="import-button" id="import">${RuntimeIcon("import")}${t("importProfile")}</button></div>` : ""}</header>${notice ? `<p class="notice" role="status">${escapeHtml(notice)}</p>` : ""}${page === "deck" ? deckMarkup(profiles, platform) : settingsMarkup(status)}</section></main>${menuMarkup()}${dialogMarkup()}`;
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
  if (actions) {
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
  document.querySelector("#dialog-cancel")?.addEventListener("click", () => {
    dialog = undefined;
    render();
  });
  document.querySelector("#dialog-confirm")?.addEventListener("click", () => void confirmDialog());
  document
    .querySelector("#quit")
    ?.addEventListener("click", () => void invoke("quit_blink_command"));
}

function menuMarkup() {
  if (!activeMenu || !snapshot) return "";
  const item = snapshot.profiles.find((profile) => profile.id === activeMenu!.id);
  if (!item) return "";
  return `<div id="menu-backdrop" class="menu-backdrop"></div><div class="profile-menu" style="left:${activeMenu.x}px;top:${activeMenu.y}px">${item.source === "EXTERNAL" ? `<button data-edit="${item.id}">${RuntimeIcon("rename")}${t("editCommand")}</button>` : ""}<button data-bind="${item.id}">${RuntimeIcon("command")}${item.physicalInput ? t("rebind") : t("bind")}</button>${item.physicalInput ? `<button data-unbind="${item.id}">${RuntimeIcon("unbind")}${t("removeBinding")}</button>` : ""}<button data-icons="${item.id}" data-name="${escapeHtml(item.name)}">${RuntimeIcon("image")}${t("changeIcon")}</button><button data-rename="${item.id}" data-name="${escapeHtml(item.name)}">${RuntimeIcon("rename")}${t("rename")}</button><hr><button class="danger" data-delete="${item.id}" data-name="${escapeHtml(item.name)}">${RuntimeIcon("delete")}${t("delete")}</button></div>`;
}
function settingsMarkup(status: string) {
  const event = snapshot?.lastEvent ?? t("noEvents");
  const result = snapshot?.lastError
    ? `${t("failedPrefix")}${snapshot.lastError === "TOGGLE_APP_FAILED" ? t("toggleAppFailed") : snapshot.lastError}`
    : t("noErrors");
  return SettingsView(status, event, result);
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

document.documentElement.lang = getLanguage();
void invoke("set_ui_language", { language: getLanguage() }).catch(console.error);
void reloadRuntimeSnapshot();
void listen("runtime-diagnostic", () => void reloadRuntimeSnapshot());

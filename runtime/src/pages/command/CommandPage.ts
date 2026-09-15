import { builtinText, t } from "../../locale";
import { HotkeyDisplay } from "../../keycap";
import { RuntimeIcon, type RuntimeIconName } from "../../runtimeIcon";
import type { RuntimePlatform, RuntimeProfile, RuntimeSnapshot } from "../../types";
import { orderedCommands } from "../../uiPreferences";

export interface CommandPageState {
  snapshot?: RuntimeSnapshot;
  bindingProfileId?: string;
  creatorOpen: boolean;
  activeMenuId?: string;
  editingExternal: boolean;
  selectedExternalIds: Set<string>;
  deckTab: "mine" | "system";
}

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
const escapeHtml = (value: string) =>
  value.replace(
    /[&<>\"]/g,
    (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character]!,
  );

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

export class CommandPage {
  constructor(private readonly state: () => CommandPageState) {}

  mount(profiles: RuntimeProfile[], platform: RuntimePlatform): string {
    const state = this.state();
    const bindingMarkup = (item: RuntimeProfile, showUnbind = false) => {
      if (state.bindingProfileId === item.id)
        return `<div class="binding-capture"><span>${t("pressNewPhysical")}</span><button data-cancel-bind>${t("escapeCancel")}</button></div>`;
      if (!item.physicalInput)
        return `<button class="bind-cta" data-bind="${escapeHtml(item.id)}">${t("bindButton")}</button>`;
      const status =
        state.snapshot?.listenerStatus === "PAUSED"
          ? "paused"
          : state.snapshot?.listenerStatus === "ERROR"
            ? "registration-failed"
            : undefined;
      return `<span class="bound-control">${HotkeyDisplay(item.physicalInput.split("+"), platform, { interactiveId: item.id, status })}${showUnbind ? `<button class="unbind-inline" data-unbind="${escapeHtml(item.id)}">${t("unbind")}</button>` : ""}</span>`;
    };
    const externalRow = (item: RuntimeProfile) => {
      const selected = state.selectedExternalIds.has(item.id);
      return `<article data-row-id="${escapeHtml(item.id)}" class="command-row ${state.bindingProfileId === item.id ? "is-binding" : ""} ${selected ? "is-selected" : ""}"><div class="row-identity"><button class="drag-handle" ${state.bindingProfileId || state.creatorOpen ? "disabled" : ""} data-drag-id="${escapeHtml(item.id)}" aria-label="${t("dragSort")}" title="${t("dragSort")}">${RuntimeIcon("drag")}</button><span class="command-icon tone-external">${profileIcon(item)}</span><div><h3>${escapeHtml(item.name)}</h3><p>${escapeHtml(item.description ?? t("actionDescription"))}</p></div></div><span class="source-label">${RuntimeIcon("external")}${t("userProfile")}</span><div class="row-binding">${bindingMarkup(item)}</div><div class="row-tools">${state.editingExternal ? `<button class="profile-select" data-select-external="${item.id}" aria-pressed="${selected}">${selected ? "✓" : ""}</button>` : `<button class="more ${state.activeMenuId === item.id ? "is-open" : ""}" data-menu="${item.id}" aria-label="${t("moreActions")}">${RuntimeIcon("more")}</button>`}</div></article>`;
    };
    const systemTile = (item: RuntimeProfile) => {
      const key: "copy" | "paste" = item.id === "system-builtin-copy" ? "copy" : "paste";
      const name = builtinText(key, item.name);
      const description = builtinText(
        key === "copy" ? "copyDescription" : "pasteDescription",
        item.description ?? "",
      );
      return `<article class="system-tile ${state.bindingProfileId === item.id ? "is-binding" : ""}"><div class="system-tile-head"><span class="command-icon tone-${actionIcon(item)}">${RuntimeIcon(actionIcon(item))}</span><div><h3>${escapeHtml(name)}</h3><p>${escapeHtml(description || t("systemActions"))}</p></div>${item.actionHotkey?.length ? HotkeyDisplay(item.actionHotkey, platform) : `<span class="unsupported">${t("noPlatformHotkey")}</span>`}</div><div class="system-tile-bind">${bindingMarkup(item, true)}</div></article>`;
    };
    const external = orderedCommands(profiles.filter((item) => item.source === "EXTERNAL"));
    const system = profiles.filter((item) => item.source === "SYSTEM");
    return `<div class="deck-tabs" role="tablist" aria-label="${t("commandSections")}"><button role="tab" id="mine-tab" aria-controls="mine-panel" aria-selected="${state.deckTab === "mine"}" data-tab="mine">${t("myCommands")} <small>${external.length}</small></button><button role="tab" id="system-tab" aria-controls="system-panel" aria-selected="${state.deckTab === "system"}" data-tab="system">${t("systemActions")} <small>${system.length}</small></button></div><div class="grid-scroll" role="tabpanel" id="${state.deckTab}-panel" aria-labelledby="${state.deckTab}-tab">${state.deckTab === "mine" ? `<section class="deck-section"><div class="section-heading"><h2>${t("myCommands")} <small>${external.length}</small></h2>${state.editingExternal && state.selectedExternalIds.size ? `<button class="delete-selected" id="delete-selected-external">${t("deleteSelected")}</button>` : ""}</div>${external.length ? `<div class="command-list"><div class="command-list-labels"><span>${t("nameDescription")}</span><span>${t("source")}</span><span>${t("boundKey")}</span><span></span></div>${external.map(externalRow).join("")}</div>` : `<div class="empty-inline">${t("emptyCommands")}</div>`}</section>` : `<section class="deck-section system-section"><div class="section-heading"><h2>${t("systemActions")} <small>${system.length}</small></h2><p>${t("systemHint")}</p></div><div class="system-grid">${system.map(systemTile).join("")}</div></section>`}</div><aside class="deck-tip">${RuntimeIcon("info")}<span>${t("bottomHint")}</span></aside>`;
  }

  unmount() {}
}

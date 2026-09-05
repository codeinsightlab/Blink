import { getLanguage, t, type MessageKey } from "./locale";
import { RuntimeIcon, type RuntimeIconName } from "./runtimeIcon";

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>\"]/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]!,
  );

export function BrandSidebarHeader() {
  return `<div class="blink-brand">${RuntimeIcon("brand")}<div><b>Blink</b><p>${t("brandSubtitle")}</p></div></div>`;
}

function section(
  id: string,
  icon: RuntimeIconName,
  title: MessageKey,
  hint: MessageKey,
  content: string,
) {
  return `<section class="settings-card" aria-labelledby="${id}"><header class="settings-card-heading"><span class="settings-card-icon ${id}">${RuntimeIcon(icon)}</span><div><h2 id="${id}">${t(title)}</h2><p>${t(hint)}</p></div></header>${content}</section>`;
}

export function SettingsView(status: string, event: string, result: string) {
  const state = status === "LISTENING" ? "listening" : status === "PAUSED" ? "paused" : "error";
  const stateLabel =
    status === "LISTENING"
      ? t("listening")
      : status === "PAUSED"
        ? t("listeningPaused")
        : t("listeningError");
  return `<div class="blink-settings">
    ${section("settings-general", "settings", "generalSettings", "generalSettingsHint", `<div class="settings-inset settings-preference"><div><label for="runtime-language">${t("displayLanguage")}</label><p>${t("languageHint")}</p></div><div class="settings-select"><select id="runtime-language"><option value="zh-CN" ${getLanguage() === "zh-CN" ? "selected" : ""}>${t("languageChinese")}</option><option value="en" ${getLanguage() === "en" ? "selected" : ""}>${t("languageEnglish")}</option></select>${RuntimeIcon("chevron-down")}</div></div>`)}
    ${section("settings-data", "save", "dataManagement", "dataManagementHint", `<div class="settings-data-actions"><button id="export-commands">${t("exportCommands")}</button><button id="backup-runtime">${t("backupRuntime")}</button><button id="restore-runtime">${t("restoreRuntime")}</button></div>`)}
    ${section("settings-runtime", "activity", "runtimeStatus", "runtimeStatusHint", `<div class="settings-inset settings-runtime-summary ${state}"><div><span class="settings-status-brand"><i></i>Blink</span><h3>${stateLabel}</h3></div><p>${t("runtimeDescription")}</p></div><h3 class="settings-diagnostics-title">${t("diagnostics")}</h3><dl class="settings-inset settings-diagnostics"><div>${RuntimeIcon("keyboard")}<div><dt>${t("lastShortcut")}</dt><dd class="diagnostic-value">${escapeHtml(event)}</dd></div></div><div>${RuntimeIcon("result")}<div><dt>${t("lastResult")}</dt><dd class="diagnostic-value">${escapeHtml(result)}</dd></div></div></dl>`)}
    ${section("settings-feedback", "help", "helpFeedback", "helpFeedbackHint", `<div class="settings-inset settings-feedback-body"><p>${t("feedbackTip")}</p><span class="settings-email" tabindex="0" aria-label="${t("feedbackEmail")}">${RuntimeIcon("mail")}<span>lixinzhang0703@gmail.com</span></span></div>`)}
    <section class="settings-card settings-quit" aria-labelledby="settings-quit-title"><header class="settings-card-heading"><span class="settings-card-icon">${RuntimeIcon("quit")}</span><div><h2 id="settings-quit-title">${t("quitBlink")}</h2><p>${t("quitDescription")}</p></div></header><button id="quit" class="settings-quit-button">${t("quit")}</button></section>
  </div>`;
}

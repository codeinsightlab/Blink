import { t } from "./locale.ts";
import { formatHotkeyForDisplay, type HotkeyPlatform } from "./hotkeyFormatter";

export type HotkeyState = "conflict" | "registration-failed" | "paused";
const STATE_LABEL = (): Record<HotkeyState, string> => ({
  conflict: t("conflict"),
  "registration-failed": t("registrationFailed"),
  paused: t("paused"),
});

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>\"]/g,
    (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character]!,
  );

export function Keycap(label: string, options: { modifier?: boolean; unknown?: boolean } = {}) {
  const classes = ["keycap", options.modifier && "is-modifier", options.unknown && "is-unknown"]
    .filter(Boolean)
    .join(" ");
  return `<span class="${classes}" title="${options.unknown ? `${t("unknownKey")}${escapeHtml(label)}` : escapeHtml(label)}">${escapeHtml(label)}</span>`;
}

export function HotkeyDisplay(
  keys: readonly string[],
  platform: HotkeyPlatform,
  options: { interactiveId?: string; status?: HotkeyState } = {},
) {
  const keycaps = formatHotkeyForDisplay(keys, platform)
    .map((key) => Keycap(key.label, key))
    .join("");
  const content = `<span class="hotkey-display">${keycaps}${options.status ? `<span class="hotkey-state is-${options.status}">${STATE_LABEL()[options.status]}</span>` : ""}</span>`;
  return options.interactiveId
    ? `<button class="hotkey-button" data-bind="${escapeHtml(options.interactiveId)}" aria-label="${t("rebindShortcut")}">${content}</button>`
    : content;
}

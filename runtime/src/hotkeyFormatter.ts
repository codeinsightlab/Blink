export type HotkeyPlatform = "macos" | "windows";

export interface DisplayKey {
  raw: string;
  label: string;
  modifier: boolean;
  unknown: boolean;
}

const MODIFIER_GROUPS = [["CTRL", "CONTROL"], ["ALT"], ["SHIFT"], ["META"]] as const;

const MODIFIER_LABELS: Record<HotkeyPlatform, Record<string, string>> = {
  macos: { CTRL: "⌃", CONTROL: "⌃", ALT: "⌥", SHIFT: "⇧", META: "⌘" },
  windows: { CTRL: "Ctrl", CONTROL: "Ctrl", ALT: "Alt", SHIFT: "Shift", META: "Win" },
};

const SPECIAL_KEY_LABELS: Record<string, string> = {
  UP: "↑",
  DOWN: "↓",
  LEFT: "←",
  RIGHT: "→",
  ENTER: "↵",
  BACKSPACE: "⌫",
  TAB: "⇥",
  SPACE: "Space",
  ESCAPE: "Esc",
  DELETE: "Del",
};

const CHARACTER_KEY = /^[A-Z0-9]$/;
const FUNCTION_KEY = /^F(?:[1-9]|1[0-2])$/;

function isKnownKey(key: string) {
  return CHARACTER_KEY.test(key) || FUNCTION_KEY.test(key) || key in SPECIAL_KEY_LABELS;
}

export function formatHotkeyForDisplay(keys: readonly string[], platform: HotkeyPlatform): DisplayKey[] {
  const normalized = keys.map((key) => key.trim().toUpperCase()).filter(Boolean);
  const modifierKeys = MODIFIER_GROUPS.flat();
  const modifiers = MODIFIER_GROUPS.flatMap((aliases) => aliases.find((modifier) => normalized.includes(modifier)) ?? []);
  const nonModifiers = normalized.filter((key) => !modifierKeys.includes(key as (typeof modifierKeys)[number]));

  return [...modifiers, ...nonModifiers].map((raw) => {
    const modifierLabel = MODIFIER_LABELS[platform][raw];
    if (modifierLabel) return { raw, label: modifierLabel, modifier: true, unknown: false };
    return {
      raw,
      label: SPECIAL_KEY_LABELS[raw] ?? raw,
      modifier: false,
      unknown: !isKnownKey(raw),
    };
  });
}

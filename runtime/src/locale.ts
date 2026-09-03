import zh from "./locales/zh-CN.json" with { type: "json" };
import en from "./locales/en.json" with { type: "json" };
import { readPreference, writePreference } from "./uiPreferences.ts";

export type Language = "zh-CN" | "en";
export type MessageKey = keyof typeof zh;
const resources: Record<Language, Record<MessageKey, string>> = { "zh-CN": zh, en };
const LANGUAGE_KEY = "keyflow.runtime.language";
let language: Language = readPreference(LANGUAGE_KEY) === "en" ? "en" : "zh-CN";
export function getLanguage(): Language {
  return language;
}
export function t(key: MessageKey): string {
  return resources[language][key];
}
export function setLanguage(next: Language): boolean {
  if (!writePreference(LANGUAGE_KEY, next)) return false;
  language = next;
  document.documentElement.lang = next;
  return true;
}

/** Translate only official seed copy. User-authored names and diagnostics stay intact. */
export function builtinText(
  key: "copy" | "paste" | "copyDescription" | "pasteDescription",
  value: string,
): string {
  const original = key === "copyDescription" ? "复制当前选中内容" : zh[key];
  return value === original || value === zh[key] || value === en[key] ? t(key) : value;
}

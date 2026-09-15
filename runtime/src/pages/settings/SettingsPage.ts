import { t } from "../../locale";
import { SettingsView } from "../../settingsView";
import type { RuntimeSnapshot } from "../../types";

export class SettingsPage {
  mount(status: string, snapshot?: RuntimeSnapshot): string {
    const event = snapshot?.lastEvent ?? t("noEvents");
    const result = snapshot?.lastError
      ? `${t("failedPrefix")}${snapshot.lastError === "TOGGLE_APP_FAILED" ? t("toggleAppFailed") : snapshot.lastError}`
      : t("noErrors");
    return SettingsView(status, event, result);
  }

  unmount() {}
}

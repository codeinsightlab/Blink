import { t } from "./locale.ts";
import {
  createHotkeyProfile,
  createOpenAppProfile,
  createToggleAppProfile,
  createTargetProfile,
  createProfile,
  type Action,
  type TargetActionType,
  KEY_CODES,
  type KeyCode,
  type Platform,
  type Profile,
  type Execution,
} from "@blink/contract";
import {
  performBinding,
  BindingOperationError,
  type BindingOperationApi,
} from "./bindingOperation.ts";

type KeyEvent = Pick<
  KeyboardEvent,
  "code" | "key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey" | "repeat" | "isComposing"
>;
export interface CreatorCapture {
  mode: "physical" | "hotkey" | null;
  physicalInput?: string;
  keys?: KeyCode[];
  error?: string;
}

function eventKeys(event: KeyEvent): string[] | undefined {
  if (event.repeat || event.isComposing || ["Meta", "Control", "Alt", "Shift"].includes(event.key))
    return;
  const special: Record<string, string> = {
    Space: "SPACE",
    Enter: "ENTER",
    Escape: "ESCAPE",
    Backspace: "BACKSPACE",
    Delete: "DELETE",
    Tab: "TAB",
    ArrowUp: "UP",
    ArrowDown: "DOWN",
    ArrowLeft: "LEFT",
    ArrowRight: "RIGHT",
    End: "END",
    Home: "HOME",
  };
  const key = /^Key[A-Z]$/.test(event.code)
    ? event.code.slice(3)
    : /^Digit[0-9]$/.test(event.code)
      ? event.code.slice(5)
      : (special[event.code] ??
        (/^F(?:[1-9]|1[0-9]|2[0-4])$/.test(event.code) ? event.code : undefined));
  if (!key) throw new Error(t("invalidInput"));
  return [
    ...(event.metaKey ? ["META"] : []),
    ...(event.ctrlKey ? ["CTRL"] : []),
    ...(event.altKey ? ["ALT"] : []),
    ...(event.shiftKey ? ["SHIFT"] : []),
    key,
  ];
}

export function captureCreatorKey(state: CreatorCapture, event: KeyEvent): CreatorCapture {
  if (!state.mode) return state;
  if (event.key === "Escape") return { ...state, mode: null, error: t("captureCanceled") };
  try {
    const keys = eventKeys(event);
    if (!keys) return state;
    if (state.mode === "physical")
      return { ...state, physicalInput: keys.join("+"), mode: null, error: undefined };
    if (!keys.every((key) => (KEY_CODES as readonly string[]).includes(key))) {
      throw new Error(t("unsupportedKey"));
    }
    return { ...state, keys: keys as KeyCode[], mode: null, error: undefined };
  } catch (error) {
    return { ...state, error: String(error) };
  }
}

export interface CreatorApi extends BindingOperationApi {
  create(profile: Profile): Promise<string>;
  bind(id: string, physicalInput: string): Promise<void>;
  remove(id: string): Promise<void>;
  resume(): Promise<void>;
}

export class CreatorSaveError extends Error {
  leftoverId?: string;
  constructor(message: string, leftoverId?: string) {
    super(message);
    this.leftoverId = leftoverId;
  }
}

export async function cleanupCreatedProfile(id: string, api: CreatorApi) {
  // bind_key rolls back its own failed operation. Only remove this attempt's new profile.
  const errors: string[] = [];
  try {
    await api.remove(id);
  } catch (error) {
    errors.push(String(error));
  }
  if (errors.length)
    throw new CreatorSaveError(
      t("cleanupFailed") + id + t("separator") + errors.join(t("separator")),
      id,
    );
}

export async function saveCreatorProfile(
  profile: Profile,
  physicalInput: string,
  api: CreatorApi,
): Promise<string> {
  let id: string;
  try {
    id = await api.create(profile);
  } catch (error) {
    throw new CreatorSaveError(t("createFailed") + String(error));
  }
  try {
    await performBinding(api, id, physicalInput);
    return id;
  } catch (error) {
    // A failed refresh must never delete an already committed command/binding.
    if (error instanceof BindingOperationError && error.committed) return id;
    await cleanupCreatedProfile(id, api);
    throw new CreatorSaveError(t("bindingRolledBack") + String(error));
  }
}

export interface CreatorActionDraft {
  action?: Action["type"];
  appPath?: string;
  target: string;
  scriptConsent: boolean;
  originalExecution?: Execution;
  appChanged: boolean;
  capture: CreatorCapture;
}

export function switchActionType(
  draft: CreatorActionDraft,
  action: Action["type"],
): CreatorActionDraft {
  if (draft.action === action) return draft;
  return {
    action,
    target: "",
    scriptConsent: false,
    appChanged: false,
    capture: { mode: null, physicalInput: draft.capture.physicalInput },
  };
}

export function regenerateEditedProfile(
  original: Profile,
  index: number,
  replacement: Profile,
  platform: Platform,
): Profile {
  const previous = original.actions[index];
  const next = replacement.actions[0];
  if (!previous || !next || replacement.actions.length !== 1) throw new Error(t("invalidEdit"));
  const action =
    previous.type === next.type
      ? ({ ...next, executions: { ...previous.executions, ...next.executions } } as Action)
      : next;
  if (!action.executions[platform]) throw new Error(t("platformMissing"));
  return createProfile({
    name: original.name,
    description: original.description,
    actions: original.actions.map((entry, position) => (position === index ? action : entry)),
  });
}

export function profileFromPickedApp(name: string, platform: Platform, path: string): Profile {
  const valid =
    platform === "macos"
      ? path.startsWith("/") && /\.app$/i.test(path)
      : /^(?:[a-z]:\\|\\\\)/i.test(path) && /\.exe$/i.test(path);
  if (!valid) throw new Error(platform === "macos" ? t("requireMacApp") : t("requireExe"));
  return createOpenAppProfile({ name, platform, knownPaths: [path] });
}

interface CreatorHost {
  platform: Platform;
  profiles: { id: string; name: string; physicalInput?: string }[];
  pause(): Promise<void>;
  pickApp(): Promise<string | null>;
  pickTarget(type: "OPEN_FILE" | "OPEN_FOLDER" | "SCRIPT"): Promise<string | null>;
  api: CreatorApi;
  edit?: {
    profile: Profile;
    name: string;
    physicalInput?: string;
    save(profile: Profile, name: string): Promise<void>;
  };
  finish(message: string): Promise<void>;
}

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"]/g,
    (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character]!,
  );

export async function openRuntimeCreator(host: CreatorHost) {
  await host.pause();
  let capture: CreatorCapture = {
    mode: host.edit ? null : "physical",
    physicalInput: host.edit?.physicalInput,
  };
  let action: Action["type"] | undefined;
  let appPath: string | undefined;
  let target = "";
  let scriptConsent = false;
  let name = host.edit?.name ?? "";
  let actionIndex = 0;
  let originalExecution: Execution | undefined;
  let appChanged = false;
  const loadAction = () => {
    const entry = host.edit?.profile.actions[actionIndex];
    if (!entry) return;
    action = entry.type;
    originalExecution = entry.executions[host.platform];
    appChanged = false;
    appPath =
      originalExecution?.type === "LAUNCH_APP" || originalExecution?.type === "TOGGLE_APP"
        ? originalExecution.knownPaths?.[0]
        : undefined;
    capture = {
      ...capture,
      mode: null,
      error: undefined,
      keys: originalExecution?.type === "SEND_HOTKEY" ? [...originalExecution.keys] : undefined,
    };
    target =
      originalExecution && "url" in originalExecution
        ? originalExecution.url
        : originalExecution && "path" in originalExecution
          ? originalExecution.path
          : "";
    scriptConsent = false;
  };
  loadAction();
  let message = "";
  let busy = false;
  let leftoverId: string | undefined;
  const previousId = () =>
    host.profiles.find((item) => item.physicalInput === capture.physicalInput)?.id;
  const root = document.createElement("div");
  root.className = "dialog-backdrop creator-backdrop";
  document.body.append(root);
  const previousFocus = document.activeElement as HTMLElement | null;
  const detach = () => {
    window.removeEventListener("keydown", onKey, true);
    document.removeEventListener("visibilitychange", onVisibility);
    root.remove();
    previousFocus?.focus();
  };
  const finish = async (text: string) => {
    detach();
    await host.finish(text);
  };
  const cancel = async () => {
    if (busy || leftoverId) return;
    busy = true;
    try {
      await host.api.resume();
      await finish(host.edit ? t("editCanceled") : t("createCanceled"));
    } catch (error) {
      busy = false;
      message = t("cancelResumeFailed") + String(error);
      render();
    }
  };

  function render() {
    const existing = !host.edit && host.profiles.find((item) => item.id === previousId());
    root.innerHTML = `
      <section class="dialog creator-dialog" role="dialog" aria-modal="true" aria-labelledby="creator-title">
        <p class="dialog-kicker">${t("creatorKicker")}</p>
        <h2 id="creator-title">${host.edit ? t("editCommand") : t("newCommand")}</h2>
        <label>${t("physicalTrigger")}</label>
        <button data-physical ${busy || leftoverId || host.edit ? "disabled" : ""}>
          ${capture.mode === "physical" ? t("pressPhysical") : escapeHtml(capture.physicalInput ?? (host.edit ? t("unbound") : t("capturePhysical")))}
        </button>
        ${host.edit ? `<p>${t("editHint")}</p>${host.edit.profile.actions.length > 1 ? `<label for="edit-action-index">${t("chooseEditAction")}</label><select id="edit-action-index" ${busy ? "disabled" : ""}>${host.edit.profile.actions.map((entry, index) => `<option value="${index}" ${index === actionIndex ? "selected" : ""}>${t("actionIndexPrefix")}${index + 1}${t("actionIndexSuffix")}${{ OPEN_APP: t("openApp"), TOGGLE_APP: t("openApp"), COMMAND: t("hotkey"), OPEN_URL: t("openUrl"), OPEN_FILE: t("openFile"), OPEN_FOLDER: t("openFolder"), SCRIPT: t("runScript") }[entry.type]}</option>`).join("")}</select>` : ""}` : ""}
        ${existing ? `<p class="creator-warning">${t("conflictPrefix")}${escapeHtml(existing.name)}${t("conflictSuffix")}</p>` : ""}
        ${
          host.edit || capture.physicalInput
            ? `
          <label>${t("chooseAction")}</label>
          <div class="creator-actions">
            <button data-action="OPEN_APP" aria-pressed="${action === "OPEN_APP" || action === "TOGGLE_APP"}" ${busy || leftoverId ? "disabled" : ""}>${t("openApp")}</button>
            <button data-action="COMMAND" aria-pressed="${action === "COMMAND"}" ${busy || leftoverId ? "disabled" : ""}>${t("hotkey")}</button>
            ${(
              [
                ["OPEN_URL", t("openUrl")],
                ["OPEN_FILE", t("openFile")],
                ["OPEN_FOLDER", t("openFolder")],
                ["SCRIPT", t("runScript")],
              ] as const
            )
              .map(
                ([type, label]) =>
                  `<button data-action="${type}" aria-pressed="${action === type}" ${busy || leftoverId ? "disabled" : ""}>${label}</button>`,
              )
              .join("")}
          </div>
        `
            : ""
        }
        ${
          action === "OPEN_APP" || action === "TOGGLE_APP"
            ? `
          <label><input id="app-toggle-enabled" type="checkbox" ${action === "TOGGLE_APP" ? "checked" : ""} ${busy || leftoverId ? "disabled" : ""}>${t("appToggleEnabled")}</label><p>${action === "TOGGLE_APP" ? t("toggleAppHint") : t("appOpenOnlyHint")}</p>
          <button data-pick ${busy || leftoverId ? "disabled" : ""}>${t("pickAppButton")}</button>
          <p class="creator-target">${escapeHtml(appPath ?? (originalExecution?.type === "LAUNCH_APP" || originalExecution?.type === "TOGGLE_APP" ? t("keepLocator") : host.platform === "macos" ? t("pickerMacHint") : t("pickerWindowsHint")))}</p>
        `
            : action === "COMMAND"
              ? `
          <button data-hotkey ${busy || leftoverId ? "disabled" : ""}>
            ${capture.mode === "hotkey" ? t("pressHotkey") : escapeHtml(capture.keys?.join(" + ") ?? t("captureHotkey"))}
          </button>
          <p>${t("hotkeyHint")}</p>
        `
              : action === "OPEN_URL"
                ? `<label for="creator-target">${t("urlLabel")}</label><input id="creator-target" type="url" value="${escapeHtml(target)}" ${busy || leftoverId ? "disabled" : ""}>`
                : action
                  ? `<button data-target-pick ${busy || leftoverId ? "disabled" : ""}>${action === "OPEN_FOLDER" ? t("pickFolderButton") : action === "SCRIPT" ? t("pickScriptButton") : t("pickFileButton")}</button><p class="creator-target">${escapeHtml(target || t("notSelected"))}</p>${action === "SCRIPT" ? `<p class="creator-warning">${t("scriptWarningPrefix")}${host.platform === "macos" ? ".sh (/bin/sh)" : ".ps1 (PowerShell)"}${t("scriptWarningSuffix")}</p><label><input id="script-consent" type="checkbox" ${scriptConsent ? "checked" : ""} ${busy || leftoverId ? "disabled" : ""}>${t("scriptConsent")}</label>` : ""}`
                  : ""
        }
        ${action ? `<label for="creator-name">${t("commandName")}</label><input id="creator-name" value="${escapeHtml(name)}" ${busy || leftoverId ? "disabled" : ""}>` : ""}
        <p class="creator-message" role="status">${escapeHtml(message || capture.error || "")}</p>
        <div class="creator-footer">
          <button data-cancel ${busy || leftoverId ? "disabled" : ""}>${t("cancel")}</button>
          ${leftoverId ? `<button data-cleanup>${t("retryCleanup")}</button>` : `<button data-save ${busy || (!host.edit && !capture.physicalInput) || !action || capture.mode ? "disabled" : ""}>${busy ? t("working") : host.edit ? t("saveChanges") : t("saveAndBind")}</button>`}
        </div>
        <small>${t("creatorFooter")}</small>
      </section>
    `;
    root.querySelector("[data-physical]")?.addEventListener("click", () => {
      capture = { ...capture, mode: "physical", error: undefined };
      message = "";
      render();
    });
    root
      .querySelector<HTMLSelectElement>("#edit-action-index")
      ?.addEventListener("change", (event) => {
        actionIndex = Number((event.target as HTMLSelectElement).value);
        loadAction();
        message = "";
        render();
      });
    root.querySelectorAll<HTMLButtonElement>("[data-action]").forEach((button) =>
      button.addEventListener("click", () => {
        ({ action, appPath, target, scriptConsent, originalExecution, appChanged, capture } =
          switchActionType(
            { action, appPath, target, scriptConsent, originalExecution, appChanged, capture },
            button.dataset.action === "OPEN_APP"
              ? action === "OPEN_APP" || action === "TOGGLE_APP"
                ? action
                : host.platform === "macos"
                  ? "TOGGLE_APP"
                  : "OPEN_APP"
              : (button.dataset.action as Action["type"]),
          ));
        message = "";
        render();
      }),
    );
    root
      .querySelector<HTMLInputElement>("#app-toggle-enabled")
      ?.addEventListener("change", (event) => {
        action = (event.target as HTMLInputElement).checked ? "TOGGLE_APP" : "OPEN_APP";
        message = "";
        render();
      });
    root.querySelector("[data-hotkey]")?.addEventListener("click", () => {
      capture = { ...capture, mode: "hotkey", error: undefined };
      message = "";
      render();
    });
    root.querySelector<HTMLInputElement>("#creator-name")?.addEventListener("input", (event) => {
      name = (event.target as HTMLInputElement).value;
    });
    root.querySelector("[data-cancel]")?.addEventListener("click", () => void cancel());
    root.querySelector("[data-pick]")?.addEventListener("click", () => void pick());
    root.querySelector<HTMLInputElement>("#creator-target")?.addEventListener("input", (event) => {
      target = (event.target as HTMLInputElement).value;
    });
    root.querySelector<HTMLInputElement>("#script-consent")?.addEventListener("change", (event) => {
      scriptConsent = (event.target as HTMLInputElement).checked;
    });
    root.querySelector("[data-target-pick]")?.addEventListener("click", () => void pickTarget());
    root.querySelector("[data-save]")?.addEventListener("click", () => void save());
    root.querySelector("[data-cleanup]")?.addEventListener("click", () => void cleanup());
    if (capture.mode) (root.querySelector("section") as HTMLElement).setAttribute("tabindex", "-1");
    if (capture.mode) (root.querySelector("section") as HTMLElement).focus();
  }

  async function pick() {
    busy = true;
    capture.mode = null;
    message = "";
    render();
    try {
      const path = await host.pickApp();
      if (!path) {
        message = t("appPickCanceled");
        return;
      }
      profileFromPickedApp(t("validateApp"), host.platform, path);
      appPath = path;
      appChanged = true;
      if (!name.trim())
        name =
          t("openPrefix") +
          path
            .split(/[\\/]/)
            .pop()!
            .replace(/\.(app|exe)$/i, "");
    } catch (error) {
      message = t("appPickFailed") + String(error);
    } finally {
      busy = false;
      render();
    }
  }

  async function pickTarget() {
    if (action !== "OPEN_FILE" && action !== "OPEN_FOLDER" && action !== "SCRIPT") return;
    busy = true;
    capture.mode = null;
    render();
    try {
      const path = await host.pickTarget(action);
      if (path) {
        target = path;
        scriptConsent = false;
        if (!name.trim())
          name =
            (action === "SCRIPT" ? t("runPrefix") : t("openPrefix")) + path.split(/[\\/]/).pop();
      } else message = t("pickCanceled");
    } catch (error) {
      message = t("pickFailed") + String(error);
    } finally {
      busy = false;
      render();
    }
  }

  async function save() {
    if (busy || leftoverId || (!host.edit && !capture.physicalInput) || !action || capture.mode)
      return;
    let profile: Profile;
    try {
      if (action === "TOGGLE_APP") {
        if (
          !appPath &&
          !(
            host.edit &&
            !appChanged &&
            (originalExecution?.type === "TOGGLE_APP" || originalExecution?.type === "LAUNCH_APP")
          )
        )
          throw new Error(t("chooseAppFirst"));
        profile = createToggleAppProfile({
          name,
          platform: host.platform,
          ...(host.edit &&
          !appChanged &&
          (originalExecution?.type === "TOGGLE_APP" || originalExecution?.type === "LAUNCH_APP")
            ? { bundleIds: originalExecution.bundleIds, knownPaths: originalExecution.knownPaths }
            : { knownPaths: [appPath!] }),
        });
      } else if (action === "OPEN_APP") {
        if (
          host.edit &&
          !appChanged &&
          (originalExecution?.type === "LAUNCH_APP" || originalExecution?.type === "TOGGLE_APP")
        ) {
          profile = createOpenAppProfile({ ...originalExecution, name, platform: host.platform });
        } else {
          if (!appPath) throw new Error(t("chooseAppFirst"));
          profile = profileFromPickedApp(name, host.platform, appPath);
        }
      } else if (action === "COMMAND") {
        if (!capture.keys) throw new Error(t("captureHotkeyFirst"));
        if (capture.keys.join("+") === capture.physicalInput) throw new Error(t("selfTrigger"));
        profile = createHotkeyProfile({ name, platform: host.platform, keys: capture.keys });
      } else {
        if (action === "SCRIPT" && !scriptConsent) throw new Error(t("trustScriptFirst"));
        profile = createTargetProfile({ name, platform: host.platform, type: action, target });
      }
    } catch (error) {
      message = t("validationFailed") + String(error);
      render();
      return;
    }
    busy = true;
    message = "";
    render();
    if (host.edit) {
      try {
        await host.edit.save(
          regenerateEditedProfile(host.edit.profile, actionIndex, profile, host.platform),
          name,
        );
      } catch (error) {
        busy = false;
        message = t("saveFailed") + String(error);
        render();
        return;
      }
      let result = t("editSaved");
      try {
        await host.api.resume();
      } catch (error) {
        result += t("manualResumeSuffix") + String(error);
      }
      await finish(result);
      return;
    }
    try {
      await saveCreatorProfile(profile, capture.physicalInput!, host.api);
    } catch (error) {
      message = String(error);
      leftoverId = error instanceof CreatorSaveError ? error.leftoverId : undefined;
      if (!leftoverId) {
        // Registration may have resumed the listener: pause again before any recapture.
        try {
          await host.pause();
        } catch (pauseError) {
          await finish(message + t("pauseFailedSuffix") + String(pauseError));
          return;
        }
      }
      busy = false;
      render();
      return;
    }
    await finish(t("createdBoundPrefix") + capture.physicalInput + t("readySuffix"));
  }

  async function cleanup() {
    if (!leftoverId || busy || !capture.physicalInput) return;
    busy = true;
    render();
    try {
      await cleanupCreatedProfile(leftoverId, host.api);
      leftoverId = undefined;
      await host.api.resume();
      await finish(t("cleanupDone"));
    } catch (error) {
      message = String(error);
      busy = false;
      render();
    }
  }

  function onKey(event: KeyboardEvent) {
    if (busy) return;
    if (!capture.mode && event.key === "Tab") {
      const controls = [
        ...root.querySelectorAll<HTMLElement>(
          "button:not(:disabled), input:not(:disabled), select:not(:disabled)",
        ),
      ];
      const index = controls.indexOf(document.activeElement as HTMLElement);
      const next = event.shiftKey
        ? index <= 0
          ? controls.length - 1
          : index - 1
        : (index + 1) % controls.length;
      event.preventDefault();
      event.stopImmediatePropagation();
      controls[next]?.focus();
      return;
    }
    if (event.key === "Escape" && !capture.mode) {
      event.preventDefault();
      event.stopImmediatePropagation();
      void cancel();
      return;
    }
    if (!capture.mode) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    capture = captureCreatorKey(capture, event);
    if (action === "COMMAND" && capture.keys && !name.trim()) name = capture.keys.join(" + ");
    render();
  }
  function onVisibility() {
    if (document.hidden && !busy && !leftoverId) void cancel();
  }
  window.addEventListener("keydown", onKey, true);
  document.addEventListener("visibilitychange", onVisibility);
  render();
}

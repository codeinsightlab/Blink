import {
  AppWindow,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Keyboard,
  MoreHorizontal,
  Plus,
  Trash2,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { AppDefinition, CommandDefinition } from "@blink/contract";
import { ActionPicker } from "../components/key-setup/ActionPicker";
import { ShortcutPicker } from "../components/key-setup/ShortcutPicker";
import { AppPicker } from "../components/key-mapping/AppPicker";
import { PageHeader } from "../components/PageHeader";
import {
  actionSummary,
  draftDisplayName,
  saveOpenApps,
  saveShortcuts,
} from "../services/setupService";
import { useAppRegistryStore } from "../stores/appRegistryStore";
import { useCommandRegistryStore } from "../stores/commandRegistryStore";
import { useProfileStore } from "../stores/profileStore";

type Picker = null | { kind: "choice" | "hotkey" | "app"; actionIndex?: number };
type SaveState = { kind: "idle" | "saving" | "success" | "error"; message?: string };

export function KeySetupPage() {
  const apps = useAppRegistryStore((state) => state.apps);
  const commands = useCommandRegistryStore((state) => state.commands);
  const { drafts, createDraft, deleteDraft, updateDraftDetails, removeAction, moveAction } =
    useProfileStore();
  const [selectedId, setSelectedId] = useState<string | undefined>(drafts[0]?.localId);
  const [picker, setPicker] = useState<Picker>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>({ kind: "idle" });
  const draft = drafts.find((item) => item.localId === selectedId) ?? null;
  const [customName, setCustomName] = useState(draft?.name ?? "");
  const [description, setDescription] = useState(draft?.description ?? "");
  useEffect(() => {
    if (!draft) return;
    setCustomName(draft.name);
    setDescription(draft.description ?? "");
    setMoreOpen(false);
  }, [draft?.localId, draft?.name, draft?.description]);
  useEffect(() => {
    if (!draft && drafts[0]) setSelectedId(drafts[0].localId);
  }, [draft, drafts]);
  useEffect(() => {
    if (saveState.kind !== "success") return;
    const timer = window.setTimeout(() => setSaveState({ kind: "idle" }), 2400);
    return () => window.clearTimeout(timer);
  }, [saveState.kind]);
  const runSave = (operation: () => void) => {
    setSaveState({ kind: "saving" });
    try {
      operation();
      setSaveState({ kind: "success", message: "已保存到当前草稿" });
      setPicker(null);
    } catch (error) {
      setSaveState({
        kind: "error",
        message: error instanceof Error ? error.message : "保存失败，请重试",
      });
    }
  };
  const create = () => {
    try {
      const id = createDraft();
      setSelectedId(id);
      setSaveState({ kind: "success", message: "已新增能力草稿" });
    } catch (error) {
      setSaveState({ kind: "error", message: error instanceof Error ? error.message : "新增失败" });
    }
  };
  const existingAppIds = useMemo(
    () =>
      draft?.actions.filter((action) => action.type === "OPEN_APP").map((action) => action.appId) ??
      [],
    [draft?.actions],
  );
  if (!draft)
    return (
      <>
        <PageHeader
          title="能力配置"
          description="每个草稿独立编译为一个可导入 Profile。"
          action={
            <button className="btn-primary" onClick={create}>
              <Plus size={16} />
              新增能力
            </button>
          }
        />
        <section className="panel flex min-h-[520px] flex-col items-center justify-center p-10 text-center">
          <Keyboard size={28} className="text-indigo-600" />
          <h2 className="mt-4 text-lg font-semibold">还没有能力草稿</h2>
          <p className="mt-2 text-sm text-slate-500">
            新增后选择动作；导出时不会携带本地 ID 或 Registry ID。
          </p>
          <button className="btn-primary mt-6" onClick={create}>
            <Plus size={16} />
            新增第一个能力
          </button>
        </section>
      </>
    );
  return (
    <>
      <PageHeader
        title="能力配置"
        description="数组序号仅用于当前页面展示，不进入 Profile Protocol。"
        action={
          <button className="btn-primary" onClick={create}>
            <Plus size={16} />
            新增能力
          </button>
        }
      />
      <div className="grid grid-cols-[320px_minmax(0,1fr)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <aside className="border-r border-slate-200 bg-slate-50/70 p-4">
          <div className="mb-3 px-2">
            <h2 className="text-sm font-semibold">我的能力</h2>
            <p className="mt-1 text-xs text-slate-500">共 {drafts.length} 项</p>
          </div>
          <div className="space-y-1.5">
            {drafts.map((item, index) => {
              const selected = item.localId === selectedId;
              const summary = item.actions[0]
                ? actionSummary(item.actions[0], apps, commands)
                : null;
              return (
                <button
                  key={item.localId}
                  className={`flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left ${selected ? "border-indigo-200 bg-white" : "border-transparent hover:bg-white"}`}
                  onClick={() => {
                    setSelectedId(item.localId);
                    setPicker(null);
                  }}
                >
                  <span
                    className={`flex h-10 w-10 items-center justify-center rounded-xl ${selected ? "bg-indigo-600 text-white" : "bg-slate-200 text-slate-700"}`}
                  >
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <b className="block truncate text-sm">
                      {draftDisplayName(item, apps, commands)}
                    </b>
                    <small className="block truncate text-xs text-slate-400">
                      {summary?.detail ?? "点击开始配置"}
                    </small>
                  </span>
                </button>
              );
            })}
          </div>
        </aside>
        <section className="min-h-[620px] p-7">
          <div className="flex items-start justify-between border-b pb-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                独立 Profile 草稿
              </p>
              <h1 className="mt-1 text-2xl font-semibold">
                {draftDisplayName(draft, apps, commands)}
              </h1>
            </div>
            <button className="btn-secondary px-2.5" onClick={() => setMoreOpen((value) => !value)}>
              <MoreHorizontal size={18} />
            </button>
          </div>
          {saveState.kind !== "idle" && (
            <div
              className={`mt-5 flex items-center gap-2 rounded-xl border px-4 py-3 text-sm ${saveState.kind === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}
            >
              {saveState.kind === "error" ? <XCircle size={17} /> : <CheckCircle2 size={17} />}
              <span>{saveState.kind === "saving" ? "正在保存…" : saveState.message}</span>
            </div>
          )}
          {moreOpen && (
            <div className="mt-5 rounded-xl border bg-slate-50 p-4">
              <div className="grid grid-cols-2 gap-4">
                <label>
                  <span className="label">名称</span>
                  <input
                    className="field"
                    value={customName}
                    onChange={(event) => setCustomName(event.target.value)}
                  />
                </label>
                <label>
                  <span className="label">说明</span>
                  <input
                    className="field"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                  />
                </label>
              </div>
              <div className="mt-3 flex justify-between">
                <button
                  className="btn-danger"
                  onClick={() => {
                    if (window.confirm(`删除「${draft.name}」？`)) {
                      const remaining = drafts.filter((item) => item.localId !== draft.localId);
                      runSave(() => deleteDraft(draft.localId));
                      setSelectedId(remaining[0]?.localId);
                    }
                  }}
                >
                  <Trash2 size={15} />
                  删除能力
                </button>
                <button
                  className="btn-primary"
                  onClick={() =>
                    runSave(() => updateDraftDetails(draft.localId, customName, description))
                  }
                >
                  保存设置
                </button>
              </div>
            </div>
          )}
          <div className="mt-7 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold">动作</h2>
              <p className="mt-1 text-xs text-slate-500">按数组顺序执行</p>
            </div>
            <button className="btn-primary" onClick={() => setPicker({ kind: "choice" })}>
              <Plus size={16} />
              添加动作
            </button>
          </div>
          <div className="mt-4 space-y-3">
            {draft.actions.map((action, index) => {
              const summary = actionSummary(action, apps, commands);
              return (
                <article
                  key={`${action.type}-${index}`}
                  className="flex items-center gap-4 rounded-xl border p-4"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100">
                    {index + 1}
                  </span>
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                    {action.type === "COMMAND" ? <Keyboard size={19} /> : <AppWindow size={19} />}
                  </span>
                  <button
                    className="min-w-0 flex-1 text-left"
                    onClick={() =>
                      setPicker({
                        kind: action.type === "COMMAND" ? "hotkey" : "app",
                        actionIndex: index,
                      })
                    }
                  >
                    <small className="text-xs text-slate-400">{summary.kind}</small>
                    <b className="block truncate text-sm">{summary.detail}</b>
                  </button>
                  <button
                    disabled={index === 0}
                    onClick={() => moveAction(draft.localId, index, -1)}
                  >
                    <ArrowUp size={16} />
                  </button>
                  <button
                    disabled={index === draft.actions.length - 1}
                    onClick={() => moveAction(draft.localId, index, 1)}
                  >
                    <ArrowDown size={16} />
                  </button>
                  <button onClick={() => runSave(() => removeAction(draft.localId, index))}>
                    <Trash2 size={16} />
                  </button>
                </article>
              );
            })}
            {!draft.actions.length && (
              <button
                className="flex w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed py-20 text-slate-400"
                onClick={() => setPicker({ kind: "choice" })}
              >
                <Plus size={22} />
                <b className="mt-3 text-sm">添加第一个动作</b>
              </button>
            )}
          </div>
        </section>
      </div>
      {picker?.kind === "choice" && (
        <ActionPicker
          onClose={() => setPicker(null)}
          onHotkey={() => setPicker({ kind: "hotkey" })}
          onApp={() => setPicker({ kind: "app" })}
        />
      )}
      {picker?.kind === "hotkey" && (
        <ShortcutPicker
          commands={commands}
          existing={draft.actions.flatMap((action, index) =>
            action.type === "COMMAND" &&
            (picker.actionIndex === undefined || index !== picker.actionIndex)
              ? [action.commandId]
              : [],
          )}
          single={picker.actionIndex !== undefined}
          onClose={() => setPicker(null)}
          onSave={(ids) => {
            const selectedCommands = ids
              .map((id) => commands.find((command) => command.id === id))
              .filter((command): command is CommandDefinition => Boolean(command));
            if (selectedCommands.length)
              runSave(() => saveShortcuts(draft.localId, selectedCommands, picker.actionIndex));
          }}
        />
      )}
      {picker?.kind === "app" && (
        <AppPicker
          apps={apps}
          existing={existingAppIds}
          onClose={() => setPicker(null)}
          onAdd={(ids) => {
            const selectedApps = ids
              .map((id) => apps.find((app) => app.id === id))
              .filter((app): app is AppDefinition => Boolean(app));
            if (selectedApps.length)
              runSave(() => saveOpenApps(draft.localId, selectedApps, picker.actionIndex));
          }}
        />
      )}
    </>
  );
}

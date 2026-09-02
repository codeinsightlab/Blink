import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { AppPicker } from "../components/key-mapping/AppPicker";
import { CommandPicker } from "../components/key-mapping/CommandPicker";
import { PageHeader } from "../components/PageHeader";
import { actionSummary } from "../services/setupService";
import { useAppRegistryStore } from "../stores/appRegistryStore";
import { useCommandRegistryStore } from "../stores/commandRegistryStore";
import { useProfileStore } from "../stores/profileStore";

export function KeyMappingPage() {
  const apps = useAppRegistryStore((state) => state.apps);
  const commands = useCommandRegistryStore((state) => state.commands);
  const { drafts, createDraft, updateDraftDetails, addActions, removeAction, moveAction } =
    useProfileStore();
  const [picker, setPicker] = useState<{
    localId: string;
    kind: "choice" | "apps" | "commands";
  } | null>(null);
  const selected = drafts.find((draft) => draft.localId === picker?.localId);
  return (
    <>
      <PageHeader
        title="能力列表"
        description="数组顺序只用于 Studio 展示；每项独立编译为一个 Profile。"
        action={
          <button className="btn-primary" onClick={() => createDraft()}>
            <Plus size={15} />
            新增能力
          </button>
        }
      />
      <div className="grid grid-cols-2 gap-5">
        {drafts.map((draft, draftIndex) => (
          <section className="panel p-5" key={draft.localId}>
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-16 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-2xl font-semibold text-indigo-600">
                {draftIndex + 1}
              </div>
              <div className="flex-1">
                <div className="mb-3 text-xs font-medium text-slate-400">
                  能力 · 第 {draftIndex + 1} 项
                </div>
                <label>
                  <span className="label">名称（必填）</span>
                  <input
                    className="field"
                    value={draft.name}
                    onChange={(event) =>
                      updateDraftDetails(draft.localId, event.target.value, draft.description ?? "")
                    }
                  />
                </label>
              </div>
            </div>
            <label className="mt-4 block">
              <span className="label">说明（可选）</span>
              <textarea
                className="field"
                rows={2}
                value={draft.description ?? ""}
                onChange={(event) =>
                  updateDraftDetails(draft.localId, draft.name, event.target.value)
                }
              />
            </label>
            <div className="my-5 border-t" />
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                动作 · {draft.actions.length}
              </span>
              <button
                className="btn-secondary py-1.5"
                onClick={() => setPicker({ localId: draft.localId, kind: "choice" })}
              >
                <Plus size={14} />
                添加 Action
              </button>
            </div>
            <div className="space-y-2">
              {draft.actions.map((action, index) => {
                const display = actionSummary(action, apps, commands);
                return (
                  <div
                    key={`${action.type}-${index}`}
                    className="flex items-center gap-3 rounded-lg border border-slate-200 p-3"
                  >
                    <span className="flex h-7 w-7 items-center justify-center rounded bg-indigo-50 text-xs font-semibold text-indigo-600">
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{display.name}</div>
                      <div className="text-xs text-slate-400">
                        {display.kind} · {display.detail}
                      </div>
                    </div>
                    <button
                      title="上移"
                      disabled={index === 0}
                      className="p-1 text-slate-400 disabled:opacity-20"
                      onClick={() => moveAction(draft.localId, index, -1)}
                    >
                      <ArrowUp size={15} />
                    </button>
                    <button
                      title="下移"
                      disabled={index === draft.actions.length - 1}
                      className="p-1 text-slate-400 disabled:opacity-20"
                      onClick={() => moveAction(draft.localId, index, 1)}
                    >
                      <ArrowDown size={15} />
                    </button>
                    <button
                      title="删除"
                      className="p-1 text-slate-400 hover:text-red-600"
                      onClick={() => removeAction(draft.localId, index)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                );
              })}
              {!draft.actions.length && (
                <div className="rounded-lg border border-dashed py-7 text-center text-sm text-slate-400">
                  尚未配置动作
                </div>
              )}
            </div>
          </section>
        ))}
      </div>
      {picker?.kind === "choice" && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-slate-950/40">
          <div className="panel w-[420px] p-6">
            <h2 className="text-lg font-semibold">添加动作</h2>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                className="rounded-xl border p-4 text-left"
                onClick={() => setPicker({ ...picker, kind: "apps" })}
              >
                打开软件
              </button>
              <button
                className="rounded-xl border p-4 text-left"
                onClick={() => setPicker({ ...picker, kind: "commands" })}
              >
                系统命令
              </button>
            </div>
            <div className="mt-5 text-right">
              <button className="btn-secondary" onClick={() => setPicker(null)}>
                取消
              </button>
            </div>
          </div>
        </div>
      )}
      {picker?.kind === "apps" && selected && (
        <AppPicker
          apps={apps}
          existing={selected.actions
            .filter((action) => action.type === "OPEN_APP")
            .map((action) => action.appId)}
          onClose={() => setPicker(null)}
          onAdd={(ids) => {
            addActions(
              selected.localId,
              ids.map((appId) => ({ type: "OPEN_APP", appId })),
            );
            setPicker(null);
          }}
        />
      )}
      {picker?.kind === "commands" && selected && (
        <CommandPicker
          commands={commands}
          existing={selected.actions
            .filter((action) => action.type === "COMMAND")
            .map((action) => action.commandId)}
          onClose={() => setPicker(null)}
          onAdd={(ids) => {
            addActions(
              selected.localId,
              ids.map((commandId) => ({ type: "COMMAND", commandId })),
            );
            setPicker(null);
          }}
        />
      )}
    </>
  );
}

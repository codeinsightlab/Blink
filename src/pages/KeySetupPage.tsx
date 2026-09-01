import { AppWindow, ArrowDown, ArrowUp, CheckCircle2, ChevronDown, Keyboard, MoreHorizontal, Plus, Trash2, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Action, KeySlot } from "@keyflow/contract";
import { ActionPicker } from "../components/key-setup/ActionPicker";
import { ShortcutPicker } from "../components/key-setup/ShortcutPicker";
import { AppPicker } from "../components/key-mapping/AppPicker";
import { PageHeader } from "../components/PageHeader";
import { actionSummary, bindingDisplayName, createSetupBinding, deleteSetupBinding, removeSetupAction, saveOpenApp, saveOpenApps, saveShortcuts, updateSetupDetails } from "../services/setupService";
import { useAppRegistryStore } from "../stores/appRegistryStore";
import { useCommandRegistryStore } from "../stores/commandRegistryStore";
import { useProfileStore } from "../stores/profileStore";

type Picker = null | { kind: "choice" | "hotkey" | "app"; actionIndex?: number };
type SaveState = { kind: "idle" | "saving" | "success" | "error"; message?: string };
const slotNumber = (slot: KeySlot) => Number(slot.slice(4));

export function KeySetupPage() {
  const apps = useAppRegistryStore((state) => state.apps);
  const commands = useCommandRegistryStore((state) => state.commands);
  const { profile, moveAction } = useProfileStore();
  const [selectedSlot, setSelectedSlot] = useState<KeySlot>(profile.bindings[0]?.slot ?? "KEY_1");
  const [picker, setPicker] = useState<Picker>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>({ kind: "idle" });
  const binding = profile.bindings.find((item) => item.slot === selectedSlot) ?? null;
  const [customName, setCustomName] = useState(binding?.name ?? "");
  const [description, setDescription] = useState(binding?.description ?? "");
  useEffect(() => { if (!binding) return; setCustomName(binding.name); setDescription(binding.description ?? ""); setMoreOpen(false); }, [binding?.id, binding?.name, binding?.description]);
  useEffect(() => { if (!binding && profile.bindings[0]) setSelectedSlot(profile.bindings[0].slot); }, [binding, profile.bindings]);
  useEffect(() => { if (saveState.kind !== "success") return; const timer = window.setTimeout(() => setSaveState({ kind: "idle" }), 2400); return () => window.clearTimeout(timer); }, [saveState.kind]);

  const runSave = (operation: () => void) => {
    setSaveState({ kind: "saving" });
    try { operation(); setSaveState({ kind: "success", message: "已保存到当前配置" }); setPicker(null); }
    catch (error) { setSaveState({ kind: "error", message: error instanceof Error ? error.message : "保存失败，请重试" }); }
  };
  const createKey = () => {
    setSaveState({ kind: "saving" });
    try { const slot = createSetupBinding(); setSelectedSlot(slot); setSaveState({ kind: "success", message: "已保存到当前配置" }); }
    catch (error) { setSaveState({ kind: "error", message: error instanceof Error ? error.message : "新增失败，请重试" }); }
  };
  const editAction = picker?.actionIndex === undefined || !binding ? undefined : binding.actions[picker.actionIndex];
  const existingAppIds = useMemo(() => binding?.actions.filter((action) => action.type === "OPEN_APP").map((action) => action.appId) ?? [], [binding?.actions]);

  if (!binding) return <><PageHeader title="按键配置" description="按需新增按键，然后直接告诉 KeyFlow 它要做什么。" action={<button className="btn-primary" onClick={createKey}><Plus size={16}/>新增按键</button>}/><section className="panel flex min-h-[520px] flex-col items-center justify-center p-10 text-center"><span className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600"><Keyboard size={27}/></span><h2 className="text-lg font-semibold">当前配置还没有按键</h2><p className="mt-2 max-w-md text-sm leading-6 text-slate-500">需要几个就新增几个。导出时只会包含已经配置动作的按键，不会生成空数据。</p><button className="btn-primary mt-6" onClick={createKey}><Plus size={16}/>新增第一个按键</button>{saveState.kind === "error" && <p className="mt-4 text-sm text-red-600">{saveState.message}</p>}</section></>;

  return <>
    <PageHeader title="按键配置" description="按需新增按键，然后直接告诉 KeyFlow 它要做什么。" action={<button className="btn-primary" disabled={profile.bindings.length >= 6} onClick={createKey}><Plus size={16}/>{profile.bindings.length >= 6 ? "已达上限" : "新增按键"}</button>}/>
    <div className="grid grid-cols-[320px_minmax(0,1fr)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <aside className="border-r border-slate-200 bg-slate-50/70 p-4"><div className="mb-3 px-2"><h2 className="text-sm font-semibold text-slate-900">我的按键</h2><p className="mt-1 text-xs text-slate-500">共 {profile.bindings.length} 个逻辑按键</p></div><div className="space-y-1.5">{profile.bindings.map((item) => {
        const selected = item.slot === selectedSlot; const summary = item.actions[0] ? actionSummary(item.actions[0], apps) : null;
        return <button key={item.slot} className={`flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition ${selected ? "border-indigo-200 bg-white shadow-sm ring-1 ring-indigo-100" : "border-transparent hover:bg-white"}`} onClick={() => { setSelectedSlot(item.slot); setPicker(null); setSaveState({ kind: "idle" }); }}>
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-semibold ${selected ? "bg-indigo-600 text-white" : item.actions.length ? "bg-slate-200 text-slate-700" : "border border-dashed border-slate-300 bg-white text-slate-400"}`}>{slotNumber(item.slot)}</span>
          <span className="min-w-0 flex-1"><b className={`block truncate text-sm ${item.actions.length ? "text-slate-900" : "font-medium text-slate-400"}`}>{bindingDisplayName(profile, item.slot, apps)}</b><small className="mt-0.5 block truncate text-xs text-slate-400">{summary ? (item.actions.length === 1 ? summary.detail : `${item.actions.length} 个动作`) : "点击开始配置"}</small></span>
          <span className={`text-sm ${item.actions.length ? "text-slate-400" : "text-indigo-500"}`}>{item.actions.length ? (item.actions.length > 1 ? item.actions.length : "") : "+"}</span>
        </button>;
      })}</div></aside>
      <section className="min-h-[620px] p-7"><div className="flex items-start justify-between border-b border-slate-100 pb-6"><div className="flex items-center gap-4"><span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-xl font-semibold text-indigo-600">{slotNumber(selectedSlot)}</span><div><p className="text-xs font-semibold uppercase tracking-wider text-slate-400">按键 {slotNumber(selectedSlot)}</p><h1 className="mt-1 text-2xl font-semibold text-slate-950">{bindingDisplayName(profile, selectedSlot, apps)}</h1></div></div><button className="btn-secondary px-2.5" title="更多设置" onClick={() => setMoreOpen((value) => !value)}><MoreHorizontal size={18}/></button></div>
        {saveState.kind !== "idle" && <div className={`mt-5 flex items-center gap-2 rounded-xl border px-4 py-3 text-sm ${saveState.kind === "error" ? "border-red-200 bg-red-50 text-red-700" : saveState.kind === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-indigo-200 bg-indigo-50 text-indigo-700"}`}>{saveState.kind === "error" ? <XCircle size={17}/> : <CheckCircle2 size={17}/>}<span>{saveState.kind === "saving" ? "正在保存…" : saveState.message}</span></div>}
        {moreOpen && <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="grid grid-cols-2 gap-4"><label><span className="label">自定义名称</span><input className="field" value={customName} onChange={(event) => setCustomName(event.target.value)} placeholder="可选"/></label><label><span className="label">说明</span><input className="field" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="可选"/></label></div><div className="mt-3 flex justify-between"><button className="btn-danger" onClick={() => { if (window.confirm(`从当前配置中删除按键 ${slotNumber(selectedSlot)}？`)) { const remaining = profile.bindings.filter((item) => item.slot !== selectedSlot); runSave(() => deleteSetupBinding(selectedSlot)); if (remaining[0]) setSelectedSlot(remaining[0].slot); } }}><Trash2 size={15}/>删除按键</button><button className="btn-primary" onClick={() => runSave(() => updateSetupDetails(selectedSlot, customName, description))}>保存更多设置</button></div></div>}
        <div className="mt-7 flex items-center justify-between"><div><h2 className="text-sm font-semibold text-slate-900">动作</h2><p className="mt-1 text-xs text-slate-500">将按照从上到下的顺序执行</p></div><button className="btn-primary" onClick={() => setPicker({ kind: "choice" })}><Plus size={16}/>添加动作</button></div>
        <div className="mt-4 space-y-3">{binding.actions.map((action, index) => { const summary = actionSummary(action, apps); return <article key={`${action.type}-${index}-${summary.detail}`} className="group flex items-center gap-4 rounded-xl border border-slate-200 p-4 hover:border-slate-300"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-sm font-semibold text-slate-500">{index + 1}</span><span className={`flex h-10 w-10 items-center justify-center rounded-xl ${action.type === "COMMAND" ? "bg-indigo-50 text-indigo-600" : "bg-violet-50 text-violet-600"}`}>{action.type === "COMMAND" ? <Keyboard size={19}/> : <AppWindow size={19}/>}</span><button className="min-w-0 flex-1 text-left" onClick={() => setPicker({ kind: action.type === "COMMAND" ? "hotkey" : "app", actionIndex: index })}><small className="text-xs text-slate-400">{summary.kind}</small><b className="mt-0.5 block truncate text-sm text-slate-900">{summary.detail}</b></button><button title="上移" disabled={index === 0} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 disabled:opacity-20" onClick={() => runSave(() => moveAction(selectedSlot, index, -1))}><ArrowUp size={16}/></button><button title="下移" disabled={index === binding.actions.length - 1} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 disabled:opacity-20" onClick={() => runSave(() => moveAction(selectedSlot, index, 1))}><ArrowDown size={16}/></button><button title="删除动作" className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600" onClick={() => runSave(() => removeSetupAction(selectedSlot, index, apps))}><Trash2 size={16}/></button></article>; })}
          {!binding.actions.length && <button className="flex w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 py-20 text-slate-400 hover:border-indigo-200 hover:bg-indigo-50/30 hover:text-indigo-600" onClick={() => setPicker({ kind: "choice" })}><span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100"><Plus size={22}/></span><b className="text-sm">为按键 {slotNumber(selectedSlot)} 添加第一个动作</b><small className="mt-1 text-xs">直接选择已配置动作</small></button>}
        </div>
        {binding.actions.length > 0 && <button className="mt-4 flex items-center gap-2 text-sm font-medium text-indigo-600 hover:text-indigo-700" onClick={() => setPicker({ kind: "choice" })}><Plus size={15}/>添加另一个动作</button>}
        <div className="mt-8 flex items-center gap-2 border-t border-slate-100 pt-5 text-xs text-slate-400"><ChevronDown size={14}/><span>配置保存在当前浏览器；需要导出 JSON 并在 Runtime 手动导入后才会生效。</span></div>
      </section>
    </div>
    {picker?.kind === "choice" && <ActionPicker onClose={() => setPicker(null)} onHotkey={() => setPicker({ kind: "hotkey" })} onApp={() => setPicker({ kind: "app" })}/>} 
    {picker?.kind === "hotkey" && <ShortcutPicker commands={commands} existing={binding.actions.flatMap((action, index) => action.type === "COMMAND" && (picker.actionIndex === undefined || index !== picker.actionIndex) ? [action.commandId] : [])} single={picker.actionIndex !== undefined} onClose={() => setPicker(null)} onSave={(ids) => { const selectedCommands = ids.map((id) => commands.find((command) => command.id === id)).filter((command): command is NonNullable<typeof command> => Boolean(command)); if (selectedCommands.length) runSave(() => saveShortcuts(selectedSlot, selectedCommands, apps, picker.actionIndex)); }}/>} 
    {picker?.kind === "app" && <AppPicker apps={apps} existing={picker.actionIndex === undefined ? existingAppIds : existingAppIds.filter((id) => editAction?.type !== "OPEN_APP" || id !== editAction.appId)} onClose={() => setPicker(null)} onAdd={(ids) => { const selectedApps = ids.map((id) => apps.find((item) => item.id === id)).filter((item): item is NonNullable<typeof item> => Boolean(item)); if (!selectedApps.length) return; runSave(() => picker.actionIndex === undefined ? saveOpenApps(selectedSlot, selectedApps, apps) : saveOpenApp(selectedSlot, selectedApps[0]!, apps, picker.actionIndex)); }}/>} 
  </>;
}

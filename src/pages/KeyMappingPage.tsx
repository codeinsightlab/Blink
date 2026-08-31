import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import type { Action, KeySlot } from "@keyflow/contract";
import { AppPicker } from "../components/key-mapping/AppPicker";
import { CommandPicker } from "../components/key-mapping/CommandPicker";
import { PageHeader } from "../components/PageHeader";
import { useAppRegistryStore } from "../stores/appRegistryStore";
import { useCommandRegistryStore } from "../stores/commandRegistryStore";
import { useProfileStore } from "../stores/profileStore";

function slotNumber(slot: KeySlot) { return Number(slot.slice(4)); }

export function KeyMappingPage() {
  const apps = useAppRegistryStore((state) => state.apps);
  const commands = useCommandRegistryStore((state) => state.commands);
  const { profile, setProfileName, setBindingName, setBindingDescription, addApps, addCommands, removeAction, moveAction } = useProfileStore();
  const [picker, setPicker] = useState<KeySlot | null>(null); const [pickerType, setPickerType] = useState<"choice" | "apps" | "commands" | null>(null);
  const selectedBinding = profile.bindings.find((binding) => binding.slot === picker);
  const actionLabel = (action: Action) => action.type === "OPEN_APP" ? { badge: "APP", name: apps.find((app) => app.id === action.appId)?.name ?? action.appId, detail: action.appId } : { badge: "COMMAND", name: action.name, detail: action.commandId };

  return <>
    <PageHeader
      title="逻辑按键"
      description="定义每个逻辑按钮要执行的动作；真实物理按键由未来本地运行端负责绑定。"
      action={<label className="flex items-center gap-3"><span className="text-sm text-slate-500">配置方案</span><input className="field w-56" value={profile.name} onChange={(event) => setProfileName(event.target.value)}/></label>}
    />
    <div className="grid grid-cols-2 gap-5">
      {profile.bindings.map((binding) => <section className="panel p-5" key={binding.id}>
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-16 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-2xl font-semibold text-indigo-600 shadow-inner">{slotNumber(binding.slot)}</div>
          <div className="flex-1">
            <div className="mb-3 text-xs font-medium text-slate-400">逻辑槽位 · KEY {slotNumber(binding.slot)}</div>
            <label><span className="label">功能名称（必填）</span><input className="field" placeholder="例如：打开工作台" value={binding.name} onChange={(event) => setBindingName(binding.slot, event.target.value)}/></label>
          </div>
        </div>
        <label className="mt-4 block"><span className="label">说明（可选）</span><textarea className="field" rows={2} placeholder="例如：打开微信、Chrome 和 Excel" value={binding.description ?? ""} onChange={(event) => setBindingDescription(binding.slot, event.target.value)}/></label>
        <div className="my-5 border-t"/>
        <div className="mb-3 flex items-center justify-between"><span className="text-xs font-semibold uppercase tracking-wide text-slate-500">动作 · {binding.actions.length}</span><button className="btn-secondary py-1.5" onClick={() => { setPicker(binding.slot); setPickerType("choice"); }}><Plus size={14}/>添加 Action</button></div>
        <div className="space-y-2">
          {binding.actions.map((action, index) => {
            const display = actionLabel(action);
            return <div key={`${action.type}-${display.detail}-${index}`} className="flex items-center gap-3 rounded-lg border border-slate-200 p-3">
              <span className="flex h-7 w-7 items-center justify-center rounded bg-indigo-50 text-xs font-semibold text-indigo-600">{index + 1}</span>
              <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium"><span className="mr-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">{display.badge}</span>{display.name}</div><div className="text-xs text-slate-400">{action.type === "OPEN_APP" ? "打开软件" : "系统命令"} · {display.detail}</div></div>
              <button title="上移" disabled={index === 0} className="p-1 text-slate-400 disabled:opacity-20" onClick={() => moveAction(binding.slot, index, -1)}><ArrowUp size={15}/></button>
              <button title="下移" disabled={index === binding.actions.length - 1} className="p-1 text-slate-400 disabled:opacity-20" onClick={() => moveAction(binding.slot, index, 1)}><ArrowDown size={15}/></button>
              <button title="删除动作" className="p-1 text-slate-400 hover:text-red-600" onClick={() => removeAction(binding.slot, index)}><Trash2 size={15}/></button>
            </div>;
          })}
          {!binding.actions.length && <div className="rounded-lg border border-dashed py-7 text-center text-sm text-slate-400">尚未配置动作</div>}
        </div>
      </section>)}
    </div>
    {picker && selectedBinding && pickerType === "choice" && <div className="fixed inset-0 z-20 flex items-center justify-center bg-slate-950/40"><div className="panel w-[420px] p-6"><h2 className="text-lg font-semibold">添加 Action</h2><p className="mt-1 text-sm text-slate-500">选择这个逻辑按钮要执行的动作类型。</p><div className="mt-5 grid grid-cols-2 gap-3"><button className="rounded-xl border p-4 text-left hover:border-indigo-300 hover:bg-indigo-50" onClick={() => setPickerType("apps")}><div className="font-medium">打开软件</div><div className="mt-1 text-xs text-slate-500">使用 App Registry 生成 OPEN_APP</div></button><button className="rounded-xl border p-4 text-left hover:border-indigo-300 hover:bg-indigo-50" onClick={() => setPickerType("commands")}><div className="font-medium">系统命令</div><div className="mt-1 text-xs text-slate-500">使用 Command Registry 生成 COMMAND</div></button></div><div className="mt-5 text-right"><button className="btn-secondary" onClick={() => { setPicker(null); setPickerType(null); }}>取消</button></div></div></div>}
    {picker && selectedBinding && pickerType === "apps" && <AppPicker apps={apps} existing={selectedBinding.actions.filter((action) => action.type === "OPEN_APP").map((action) => action.appId)} onClose={() => { setPicker(null); setPickerType(null); }} onAdd={(ids) => { addApps(picker, ids); setPicker(null); setPickerType(null); }}/>} 
    {picker && selectedBinding && pickerType === "commands" && <CommandPicker commands={commands} existing={selectedBinding.actions.filter((action) => action.type === "COMMAND").map((action) => action.commandId)} onClose={() => { setPicker(null); setPickerType(null); }} onAdd={(ids) => { addCommands(picker, ids); setPicker(null); setPickerType(null); }}/>} 
  </>;
}

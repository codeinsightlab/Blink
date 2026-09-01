import { Check, Keyboard, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { CommandDefinition } from "@keyflow/contract";
import { formatHotkey } from "../../services/setupService";

export function ShortcutPicker({ commands, existing, single, onClose, onSave }: {
  commands: CommandDefinition[];
  existing: string[];
  single?: boolean;
  onClose: () => void;
  onSave: (commandIds: string[]) => void;
}) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("全部");
  const [selected, setSelected] = useState<string[]>([]);
  const categories = useMemo(() => ["全部", ...Array.from(new Set(commands.map((command) => command.category).filter((value): value is string => Boolean(value))))], [commands]);
  const shown = commands.filter((command) => command.enabled && !existing.includes(command.id) && (command.name.toLowerCase().includes(search.toLowerCase()) || (command.description ?? "").toLowerCase().includes(search.toLowerCase())) && (category === "全部" || command.category === category));
  const toggle = (id: string) => setSelected((current) => single ? [id] : current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);

  return <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-950/45 p-6" role="dialog" aria-modal="true" aria-label="选择键盘快捷键"><section className="panel w-full max-w-2xl overflow-hidden">
    <header className="flex items-start justify-between border-b px-6 py-5"><div><div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600"><Keyboard size={20}/></div><h2 className="text-lg font-semibold">选择键盘快捷键</h2><p className="mt-1 text-sm text-slate-500">选择已配置好 Windows 与 macOS 实现的快捷动作。</p></div><button className="rounded-lg p-2 text-slate-400 hover:bg-slate-100" onClick={onClose} aria-label="关闭"><X size={18}/></button></header>
    <div className="grid grid-cols-[1fr_170px] gap-3 border-b bg-slate-50/70 p-4"><div className="relative"><Search size={16} className="absolute left-3 top-3 text-slate-400"/><input className="field pl-9" placeholder="搜索复制、粘贴、保存…" value={search} onChange={(event) => setSearch(event.target.value)}/></div><select className="field" value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map((item) => <option key={item}>{item}</option>)}</select></div>
    <div className="max-h-[420px] space-y-2 overflow-auto p-4">{shown.map((command) => { const checked = selected.includes(command.id); return <button key={command.id} className={`flex w-full items-center gap-4 rounded-xl border p-4 text-left ${checked ? "border-indigo-300 bg-indigo-50" : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"}`} onClick={() => toggle(command.id)}><span className={`flex h-10 w-10 items-center justify-center rounded-xl ${checked ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-500"}`}>{checked ? <Check size={18}/> : <Keyboard size={18}/>}</span><span className="min-w-0 flex-1"><b className="block text-sm text-slate-900">{command.name}</b><small className="mt-1 block truncate text-xs text-slate-500">{command.description || command.category || "键盘快捷键"}</small></span><span className="grid min-w-40 gap-1 text-right text-xs"><span className="text-slate-500"><i className="mr-2 not-italic text-slate-300">macOS</i>{command.executions.macos ? formatHotkey(command.executions.macos.keys) : "未配置"}</span><span className="text-slate-500"><i className="mr-2 not-italic text-slate-300">Windows</i>{command.executions.windows ? formatHotkey(command.executions.windows.keys) : "未配置"}</span></span></button>; })}{!shown.length && <div className="py-14 text-center text-sm text-slate-500">没有可选择的快捷动作。请先在高级管理的命令库中维护跨平台配置。</div>}</div>
    <footer className="flex items-center justify-between border-t bg-slate-50 px-6 py-4"><span className="text-xs text-slate-400">快捷键定义由命令库统一维护</span><div className="flex gap-3"><button className="btn-secondary" onClick={onClose}>取消</button><button className="btn-primary" disabled={!selected.length} onClick={() => onSave(selected)}>添加{selected.length > 1 ? ` ${selected.length} 个` : ""}快捷键</button></div></footer>
  </section></div>;
}

import { Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { AppDefinition } from "@blink/contract";
export function AppPicker({
  apps,
  existing,
  onClose,
  onAdd,
}: {
  apps: AppDefinition[];
  existing: string[];
  onClose: () => void;
  onAdd: (ids: string[]) => void;
}) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("全部");
  const [selected, setSelected] = useState<string[]>([]);
  const categories = useMemo(
    () => [
      "全部",
      ...Array.from(new Set(apps.map((a) => a.category).filter((x): x is string => Boolean(x)))),
    ],
    [apps],
  );
  const shown = apps.filter(
    (a) =>
      a.enabled &&
      !existing.includes(a.id) &&
      a.name.toLowerCase().includes(search.toLowerCase()) &&
      (category === "全部" || a.category === category),
  );
  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-slate-950/40">
      <div className="panel w-[620px] overflow-hidden">
        <header className="flex items-center justify-between border-b p-5">
          <div>
            <h2 className="font-semibold">添加软件</h2>
            <p className="text-xs text-slate-500">每个软件都会生成一个 OPEN_APP 动作。</p>
          </div>
          <button title="关闭" className="btn-secondary px-2" onClick={onClose}>
            <X size={16} />
          </button>
        </header>
        <div className="grid grid-cols-[1fr_180px] gap-3 border-b p-4">
          <div className="relative">
            <Search className="absolute left-3 top-3 text-slate-400" size={16} />
            <input
              className="field pl-9"
              placeholder="搜索已启用的软件"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select className="field" value={category} onChange={(e) => setCategory(e.target.value)}>
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        <div className="grid max-h-80 grid-cols-2 gap-2 overflow-auto p-4">
          {shown.map((app) => (
            <label
              key={app.id}
              className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 ${selected.includes(app.id) ? "border-indigo-300 bg-indigo-50" : "border-slate-200"}`}
            >
              <input
                type="checkbox"
                checked={selected.includes(app.id)}
                onChange={() =>
                  setSelected((s) =>
                    s.includes(app.id) ? s.filter((id) => id !== app.id) : [...s, app.id],
                  )
                }
              />
              <div>
                <div className="text-sm font-medium">{app.name}</div>
                <div className="text-xs text-slate-500">{app.category}</div>
              </div>
            </label>
          ))}
          {!shown.length && (
            <div className="col-span-2 py-10 text-center text-sm text-slate-500">
              没有可添加的软件。
            </div>
          )}
        </div>
        <footer className="flex justify-end gap-3 border-t bg-slate-50 p-4">
          <button className="btn-secondary" onClick={onClose}>
            取消
          </button>
          <button
            disabled={!selected.length}
            className="btn-primary disabled:opacity-50"
            onClick={() => onAdd(selected)}
          >
            添加{selected.length ? ` ${selected.length} 个` : ""}软件
          </button>
        </footer>
      </div>
    </div>
  );
}

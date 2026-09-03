import { Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { CommandEditor } from "../components/command-registry/CommandEditor";
import { PageHeader } from "../components/PageHeader";
import { useCommandRegistryStore } from "../stores/commandRegistryStore";
import { officialCommands } from "@keyflow/contract";

export function CommandRegistryPage() {
  const { commands, upsertCommand, deleteCommand, toggleCommand } = useCommandRegistryStore();
  const [selectedId, setSelectedId] = useState<string | null>(commands[0]?.id ?? null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("全部");
  const categories = useMemo(
    () => [
      "全部",
      ...Array.from(
        new Set(
          commands
            .map((command) => command.category)
            .filter((value): value is string => Boolean(value)),
        ),
      ),
    ],
    [commands],
  );
  const shown = commands.filter(
    (command) =>
      command.name.includes(search) && (category === "全部" || command.category === category),
  );
  const selected = commands.find((command) => command.id === selectedId) ?? null;
  return (
    <>
      <PageHeader
        title="命令库"
        description="维护系统命令及其 Windows/macOS 快捷键实现。"
        action={
          <div className="flex gap-2">
            <button
              className="btn-secondary"
              onClick={() =>
                officialCommands
                  .filter((command) => !commands.some((item) => item.id === command.id))
                  .forEach(upsertCommand)
              }
            >
              补充缺少的官方命令
            </button>
            <button className="btn-primary" onClick={() => setSelectedId(null)}>
              <Plus size={16} />
              新增命令
            </button>
          </div>
        }
      />
      <div className="grid grid-cols-[360px_1fr] gap-6">
        <aside className="panel h-fit overflow-hidden">
          <div className="space-y-3 border-b p-4">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-3 text-slate-400" />
              <input
                className="field pl-9"
                placeholder="搜索命令"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <select
              className="field"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              {categories.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </div>
          <div>
            {shown.map((command) => (
              <button
                key={command.id}
                onClick={() => setSelectedId(command.id)}
                className={`flex w-full items-center gap-3 border-b border-slate-100 p-4 text-left ${selectedId === command.id ? "bg-indigo-50" : "hover:bg-slate-50"}`}
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-xs font-semibold">
                  ⌘
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{command.name}</div>
                  <div className="text-xs text-slate-500">
                    {command.id} · {command.category || "未分类"}
                  </div>
                </div>
                <span
                  title={command.enabled ? "点击停用" : "点击启用"}
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleCommand(command.id);
                  }}
                  className={`h-5 w-9 rounded-full p-0.5 ${command.enabled ? "bg-indigo-600" : "bg-slate-300"}`}
                >
                  <span
                    className={`block h-4 w-4 rounded-full bg-white transition ${command.enabled ? "translate-x-4" : ""}`}
                  />
                </span>
              </button>
            ))}
            {!shown.length && (
              <div className="p-8 text-center text-sm text-slate-500">没有找到命令。</div>
            )}
          </div>
        </aside>
        <CommandEditor
          selected={selected}
          onSave={(command) => {
            upsertCommand(command);
            setSelectedId(command.id);
          }}
          onDelete={(id) => {
            if (window.confirm("确定删除该命令吗？已有配置方案中的引用将保留。")) {
              deleteCommand(id);
              setSelectedId(null);
            }
          }}
        />
      </div>
    </>
  );
}

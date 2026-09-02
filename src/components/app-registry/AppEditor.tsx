import { Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { appDefinitionSchema, type AppDefinition } from "@keyflow/contract";

const emptyApp = (): AppDefinition => ({
  id: "",
  name: "",
  category: "",
  description: "",
  icon: "",
  platforms: {
    windows: { executableNames: [], knownPaths: [], aliases: [] },
    macos: { bundleIds: [], appNames: [], knownPaths: [] },
  },
  enabled: true,
});
function ArrayField({
  label,
  values,
  onChange,
}: {
  label: string;
  values: string[];
  onChange: (v: string[]) => void;
}) {
  return (
    <div>
      <span className="label">{label}</span>
      <div className="space-y-2">
        {values.map((value, i) => (
          <div className="flex gap-2" key={i}>
            <input
              className="field"
              value={value}
              onChange={(e) => onChange(values.map((v, j) => (j === i ? e.target.value : v)))}
            />
            <button
              title="删除此项"
              className="btn-secondary px-2"
              onClick={() => onChange(values.filter((_, j) => j !== i))}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        <button className="btn-secondary py-1.5" onClick={() => onChange([...values, ""])}>
          <Plus size={14} /> 新增
        </button>
      </div>
    </div>
  );
}
export function AppEditor({
  selected,
  onSave,
  onDelete,
}: {
  selected: AppDefinition | null;
  onSave: (app: AppDefinition) => void;
  onDelete: (id: string) => void;
}) {
  const [draft, setDraft] = useState<AppDefinition>(selected ?? emptyApp());
  const [error, setError] = useState("");
  useEffect(() => {
    setDraft(selected ?? emptyApp());
    setError("");
  }, [selected]);
  const text = (key: "id" | "name" | "category" | "description" | "icon", value: string) =>
    setDraft({ ...draft, [key]: value });
  const arr = (os: "windows" | "macos", key: string, value: string[]) =>
    setDraft({
      ...draft,
      platforms: { ...draft.platforms, [os]: { ...draft.platforms[os], [key]: value } },
    });
  const save = () => {
    const clean: AppDefinition = {
      ...draft,
      updatedAt: new Date().toISOString(),
      createdAt: draft.createdAt ?? new Date().toISOString(),
      platforms: {
        windows: draft.platforms.windows
          ? {
              ...draft.platforms.windows,
              executableNames: draft.platforms.windows.executableNames.filter(Boolean),
              knownPaths: draft.platforms.windows.knownPaths?.filter(Boolean),
              aliases: draft.platforms.windows.aliases?.filter(Boolean),
            }
          : undefined,
        macos: draft.platforms.macos
          ? {
              bundleIds: draft.platforms.macos.bundleIds?.filter(Boolean),
              appNames: draft.platforms.macos.appNames?.filter(Boolean),
              knownPaths: draft.platforms.macos.knownPaths?.filter(Boolean),
            }
          : undefined,
      },
    };
    const result = appDefinitionSchema.safeParse(clean);
    if (!result.success) {
      setError(result.error.issues[0]?.message ?? "软件定义不合法");
      return;
    }
    onSave(result.data);
    setError("");
  };
  return (
    <div className="panel p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="font-semibold">{selected ? "编辑软件" : "新增软件"}</h2>
          <p className="text-xs text-slate-500">软件库定义项</p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={draft.enabled}
            onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })}
          />{" "}
          已启用
        </label>
      </div>
      <h3 className="mb-4 border-b pb-2 text-sm font-semibold">基本信息</h3>
      <div className="grid grid-cols-2 gap-4">
        <label>
          <span className="label">标识 ID</span>
          <input
            disabled={Boolean(selected)}
            className="field disabled:bg-slate-50"
            value={draft.id}
            onChange={(e) => text("id", e.target.value)}
          />
        </label>
        <label>
          <span className="label">名称</span>
          <input
            className="field"
            value={draft.name}
            onChange={(e) => text("name", e.target.value)}
          />
        </label>
        <label>
          <span className="label">分类</span>
          <input
            className="field"
            value={draft.category ?? ""}
            onChange={(e) => text("category", e.target.value)}
          />
        </label>
        <label>
          <span className="label">图标</span>
          <input
            className="field"
            value={draft.icon ?? ""}
            onChange={(e) => text("icon", e.target.value)}
          />
        </label>
        <label className="col-span-2">
          <span className="label">描述</span>
          <textarea
            className="field"
            rows={2}
            value={draft.description ?? ""}
            onChange={(e) => text("description", e.target.value)}
          />
        </label>
      </div>
      <div className="mt-7 grid grid-cols-2 gap-6">
        <section>
          <h3 className="mb-4 border-b pb-2 text-sm font-semibold">Windows</h3>
          <div className="space-y-4">
            <ArrayField
              label="可执行文件名"
              values={draft.platforms.windows?.executableNames ?? []}
              onChange={(v) => arr("windows", "executableNames", v)}
            />
            <ArrayField
              label="已知路径"
              values={draft.platforms.windows?.knownPaths ?? []}
              onChange={(v) => arr("windows", "knownPaths", v)}
            />
            <ArrayField
              label="别名"
              values={draft.platforms.windows?.aliases ?? []}
              onChange={(v) => arr("windows", "aliases", v)}
            />
          </div>
        </section>
        <section>
          <h3 className="mb-4 border-b pb-2 text-sm font-semibold">macOS</h3>
          <div className="space-y-4">
            <ArrayField
              label="Bundle ID"
              values={draft.platforms.macos?.bundleIds ?? []}
              onChange={(v) => arr("macos", "bundleIds", v)}
            />
            <ArrayField
              label="应用名称"
              values={draft.platforms.macos?.appNames ?? []}
              onChange={(v) => arr("macos", "appNames", v)}
            />
            <ArrayField
              label="已知路径"
              values={draft.platforms.macos?.knownPaths ?? []}
              onChange={(v) => arr("macos", "knownPaths", v)}
            />
          </div>
        </section>
      </div>
      {error && <div className="mt-5 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      <div className="mt-6 flex justify-between">
        {selected ? (
          <button className="btn-danger" onClick={() => onDelete(selected.id)}>
            <Trash2 size={15} /> 删除
          </button>
        ) : (
          <span />
        )}
        <button className="btn-primary" onClick={save}>
          保存软件
        </button>
      </div>
    </div>
  );
}

import { AppWindow, ArrowRight, Download, Keyboard, Monitor, Plus } from "lucide-react";
import { Link } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import { actionSummary } from "../services/setupService";
import { useAppRegistryStore } from "../stores/appRegistryStore";
import { useCommandRegistryStore } from "../stores/commandRegistryStore";
import { useProfileStore } from "../stores/profileStore";

export function OverviewPage() {
  const apps = useAppRegistryStore((state) => state.apps);
  const commands = useCommandRegistryStore((state) => state.commands);
  const drafts = useProfileStore((state) => state.drafts);
  const configured = drafts.filter((draft) => draft.actions.length > 0);
  const stats = [
    { label: "软件总数", value: apps.length, icon: AppWindow },
    {
      label: "支持 Windows",
      value: apps.filter((app) => app.platforms.windows).length,
      icon: Monitor,
    },
    { label: "支持 macOS", value: apps.filter((app) => app.platforms.macos).length, icon: Monitor },
    { label: "已配置能力", value: configured.length, icon: Keyboard },
  ];
  return (
    <>
      <PageHeader title="概览" description="查看当前本地 Blink 能力草稿。" />
      <div className="grid grid-cols-4 gap-4">
        {stats.map(({ label, value, icon: Icon }) => (
          <div className="panel p-5" key={label}>
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-500">{label}</span>
              <Icon size={18} className="text-slate-400" />
            </div>
            <div className="mt-3 text-3xl font-semibold">{value}</div>
          </div>
        ))}
      </div>
      <div className="mt-6 grid grid-cols-[1fr_340px] gap-6">
        <section className="panel p-6">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="font-semibold">当前能力</h2>
              <p className="text-sm text-slate-500">每项将独立编译为一个 Profile</p>
            </div>
            <Link to="/setup" className="btn-secondary">
              配置 <ArrowRight size={15} />
            </Link>
          </div>
          {configured.length ? (
            <div className="divide-y divide-slate-100">
              {configured.map((draft, index) => (
                <div key={draft.localId} className="grid grid-cols-[80px_1fr] py-4">
                  <strong className="text-indigo-600">{index + 1}</strong>
                  <div>
                    <div className="text-sm font-medium">{draft.name}</div>
                    {draft.description && (
                      <div className="mt-1 text-xs text-slate-400">{draft.description}</div>
                    )}
                    <div className="mt-1 text-sm text-slate-500">
                      {draft.actions
                        .map((action) => actionSummary(action, apps, commands).name)
                        .join(" / ")}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-slate-300 py-12 text-center text-sm text-slate-500">
              尚未配置任何能力。
            </div>
          )}
        </section>
        <aside className="space-y-3">
          <h2 className="px-1 text-sm font-semibold">快捷操作</h2>
          <Link to="/apps" className="panel flex items-center gap-4 p-4 hover:border-indigo-200">
            <Plus className="text-indigo-600" />
            <div>
              <div className="text-sm font-medium">管理软件库</div>
              <div className="text-xs text-slate-500">新增或编辑软件启动目标</div>
            </div>
          </Link>
          <Link to="/setup" className="panel flex items-center gap-4 p-4 hover:border-indigo-200">
            <Keyboard className="text-indigo-600" />
            <div>
              <div className="text-sm font-medium">配置能力</div>
              <div className="text-xs text-slate-500">每项独立导入与绑定</div>
            </div>
          </Link>
          <Link to="/export" className="panel flex items-center gap-4 p-4 hover:border-indigo-200">
            <Download className="text-indigo-600" />
            <div>
              <div className="text-sm font-medium">批量导出</div>
              <div className="text-xs text-slate-500">校验并下载 Profile 数组</div>
            </div>
          </Link>
        </aside>
      </div>
    </>
  );
}

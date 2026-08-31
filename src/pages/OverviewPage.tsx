import { AppWindow, ArrowRight, Download, Keyboard, Monitor, Plus } from "lucide-react";
import { Link } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import { useAppRegistryStore } from "../stores/appRegistryStore";
import { useCommandRegistryStore } from "../stores/commandRegistryStore";
import { useProfileStore } from "../stores/profileStore";

export function OverviewPage() {
  const apps = useAppRegistryStore((s) => s.apps); const profile = useProfileStore((s) => s.profile);
  const commands = useCommandRegistryStore((s) => s.commands);
  const configured = profile.bindings.filter((b) => b.actions.length > 0);
  const stats = [{label:"软件总数",value:apps.length,icon:AppWindow},{label:"支持 Windows",value:apps.filter(a=>a.platforms.windows).length,icon:Monitor},{label:"支持 macOS",value:apps.filter(a=>a.platforms.macos).length,icon:Monitor},{label:"已配置按键",value:configured.length,icon:Keyboard}];
  return <><PageHeader title="概览" description="查看当前本地 KeyFlow 配置摘要。" />
    <div className="grid grid-cols-4 gap-4">{stats.map(({label,value,icon:Icon})=><div className="panel p-5" key={label}><div className="flex items-center justify-between"><span className="text-sm text-slate-500">{label}</span><Icon size={18} className="text-slate-400"/></div><div className="mt-3 text-3xl font-semibold">{value}</div></div>)}</div>
    <div className="mt-6 grid grid-cols-[1fr_340px] gap-6"><section className="panel p-6"><div className="mb-5 flex items-center justify-between"><div><h2 className="font-semibold">当前配置方案</h2><p className="text-sm text-slate-500">{profile.name}</p></div><Link to="/mapping" className="btn-secondary">配置 <ArrowRight size={15}/></Link></div>
      {configured.length ? <div className="divide-y divide-slate-100">{configured.map(b=><div key={b.id} className="grid grid-cols-[80px_1fr] py-4"><strong className="text-indigo-600">{Number(b.slot.slice(4))}</strong><div><div className="text-sm font-medium">{b.name}</div>{b.description && <div className="mt-1 text-xs text-slate-400">{b.description}</div>}<div className="mt-1 text-sm text-slate-500">{b.actions.map((action) => action.type === "OPEN_APP" ? (apps.find((app) => app.id === action.appId)?.name || action.appId) : (commands.find((command) => command.id === action.commandId)?.name || action.name)).join(" / ")}</div></div></div>)}</div> : <div className="rounded-lg border border-dashed border-slate-300 py-12 text-center text-sm text-slate-500">尚未配置任何逻辑按键。</div>}
    </section><aside className="space-y-3"><h2 className="px-1 text-sm font-semibold">快捷操作</h2><Link to="/apps" className="panel flex items-center gap-4 p-4 hover:border-indigo-200"><Plus className="text-indigo-600"/><div><div className="text-sm font-medium">管理软件库</div><div className="text-xs text-slate-500">新增或编辑软件启动目标</div></div></Link><Link to="/mapping" className="panel flex items-center gap-4 p-4 hover:border-indigo-200"><Keyboard className="text-indigo-600"/><div><div className="text-sm font-medium">配置逻辑按键</div><div className="text-xs text-slate-500">定义六个逻辑按钮的功能</div></div></Link><Link to="/export" className="panel flex items-center gap-4 p-4 hover:border-indigo-200"><Download className="text-indigo-600"/><div><div className="text-sm font-medium">导出配置方案</div><div className="text-xs text-slate-500">校验并下载 JSON</div></div></Link></aside></div>
  </>;
}

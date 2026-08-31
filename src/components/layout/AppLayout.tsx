import { AppWindow, Download, Grid2X2, Keyboard, TerminalSquare, Workflow } from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";

const links = [
  { to: "/", label: "概览", icon: Grid2X2 },
  { to: "/apps", label: "软件库", icon: AppWindow },
  { to: "/commands", label: "命令库", icon: TerminalSquare },
  { to: "/mapping", label: "逻辑按键", icon: Keyboard },
  { to: "/export", label: "导出", icon: Download },
];
export function AppLayout() {
  return <div className="flex min-h-screen">
    <aside className="fixed inset-y-0 left-0 w-60 border-r border-slate-800 bg-slate-950 p-5 text-slate-300">
      <div className="mb-8 flex items-center gap-3 px-2"><div className="rounded-lg bg-indigo-500 p-2 text-white"><Workflow size={20}/></div><div><div className="font-semibold text-white">KeyFlow Studio</div><div className="text-xs text-slate-500">网页配置器 · V1</div></div></div>
      <nav className="space-y-1">{links.map(({to,label,icon:Icon}) => <NavLink key={to} to={to} end={to === "/"} className={({isActive}) => `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm ${isActive ? "bg-slate-800 text-white" : "hover:bg-slate-900 hover:text-white"}`}><Icon size={18}/>{label}</NavLink>)}</nav>
      <div className="absolute bottom-5 left-5 right-5 rounded-lg border border-slate-800 p-3 text-xs leading-5 text-slate-500">仅限本地配置<br/>运行端尚未连接</div>
    </aside>
    <main className="ml-60 min-h-screen flex-1 p-8"><div className="mx-auto max-w-7xl"><Outlet/></div></main>
  </div>;
}

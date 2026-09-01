import { AppWindow, Download, Grid2X2, Keyboard, SlidersHorizontal, TerminalSquare, Workflow } from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";

const primaryLinks = [
  { to: "/", label: "概览", icon: Grid2X2 },
  { to: "/setup", label: "按键配置", icon: SlidersHorizontal },
];
const advancedLinks = [
  { to: "/apps", label: "软件库", icon: AppWindow },
  { to: "/commands", label: "命令库", icon: TerminalSquare },
  { to: "/mapping", label: "逻辑按键", icon: Keyboard },
  { to: "/export", label: "导出", icon: Download },
];
export function AppLayout() {
  return <div className="flex min-h-screen">
    <aside className="fixed inset-y-0 left-0 w-60 border-r border-slate-800 bg-slate-950 p-5 text-slate-300">
      <div className="mb-8 flex items-center gap-3 px-2"><div className="rounded-lg bg-indigo-500 p-2 text-white"><Workflow size={20}/></div><div><div className="font-semibold text-white">KeyFlow Studio</div><div className="text-xs text-slate-500">网页配置器 · V1</div></div></div>
      <nav><div className="space-y-1">{primaryLinks.map(({to,label,icon:Icon}) => <NavLink key={to} to={to} end={to === "/"} className={({isActive}) => `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm ${isActive ? "bg-indigo-600 text-white" : "hover:bg-slate-900 hover:text-white"}`}><Icon size={18}/>{label}</NavLink>)}</div><div className="mb-2 mt-7 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">高级管理</div><div className="space-y-1">{advancedLinks.map(({to,label,icon:Icon}) => <NavLink key={to} to={to} className={({isActive}) => `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm ${isActive ? "bg-slate-800 text-white" : "hover:bg-slate-900 hover:text-white"}`}><Icon size={18}/>{label}</NavLink>)}</div></nav>
      <div className="absolute bottom-5 left-5 right-5 rounded-lg border border-slate-800 p-3 text-xs leading-5 text-slate-500">仅限本地配置<br/>运行端尚未连接</div>
    </aside>
    <main className="ml-60 min-h-screen flex-1 p-8"><div className="mx-auto max-w-7xl"><Outlet/></div></main>
  </div>;
}

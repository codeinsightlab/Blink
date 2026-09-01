import { AppWindow, Keyboard, X } from "lucide-react";

export function ActionPicker({ onClose, onHotkey, onApp }: { onClose: () => void; onHotkey: () => void; onApp: () => void }) {
  return <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-950/45 p-6" role="dialog" aria-modal="true" aria-label="添加动作"><section className="panel w-full max-w-lg overflow-hidden">
    <header className="flex items-start justify-between border-b px-6 py-5"><div><h2 className="text-lg font-semibold">添加动作</h2><p className="mt-1 text-sm text-slate-500">选择这个按键要做什么。</p></div><button className="rounded-lg p-2 text-slate-400 hover:bg-slate-100" onClick={onClose} aria-label="关闭"><X size={18}/></button></header>
    <div className="space-y-3 p-6"><button className="group flex w-full items-center gap-4 rounded-xl border border-slate-200 p-4 text-left hover:border-indigo-300 hover:bg-indigo-50" onClick={onHotkey}><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 group-hover:bg-white"><Keyboard size={21}/></span><span><b className="block text-sm">键盘快捷键</b><small className="mt-1 block text-xs text-slate-500">选择已配置好的跨平台快捷动作</small></span></button>
      <button className="group flex w-full items-center gap-4 rounded-xl border border-slate-200 p-4 text-left hover:border-indigo-300 hover:bg-indigo-50" onClick={onApp}><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-50 text-violet-600 group-hover:bg-white"><AppWindow size={21}/></span><span><b className="block text-sm">打开软件</b><small className="mt-1 block text-xs text-slate-500">从现有软件库中选择</small></span></button></div>
    <footer className="flex justify-end border-t bg-slate-50 px-6 py-4"><button className="btn-secondary" onClick={onClose}>取消</button></footer>
  </section></div>;
}

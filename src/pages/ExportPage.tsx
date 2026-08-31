import { CheckCircle2, Download, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { PageHeader } from "../components/PageHeader";
import { downloadProfile, prepareProfileExport } from "../services/exportService";
import { useAppRegistryStore } from "../stores/appRegistryStore";
import { useCommandRegistryStore } from "../stores/commandRegistryStore";
import { useProfileStore } from "../stores/profileStore";

export function ExportPage() {
  const profile = useProfileStore((state) => state.profile); const apps = useAppRegistryStore((state) => state.apps); const commands = useCommandRegistryStore((state) => state.commands);
  const prepared = useMemo(() => prepareProfileExport(profile, apps, commands), [profile, apps, commands]); const [downloadError, setDownloadError] = useState("");
  const bindings = profile.bindings.filter((binding) => binding.actions.length); const actions = profile.bindings.flatMap((binding) => binding.actions); const appIds = new Set(actions.filter((action) => action.type === "OPEN_APP").map((action) => action.appId));
  const download = () => { const result = downloadProfile(profile, apps, commands); setDownloadError(result.success ? "" : result.errors.join("；")); };
  return <><PageHeader title="导出配置方案" description="编译为包含 Windows/macOS 执行描述的 Profile v1.2。" action={<button disabled={!prepared.success} className="btn-primary disabled:cursor-not-allowed disabled:opacity-50" onClick={download}><Download size={16}/>下载 profile.json</button>}/><div className="grid grid-cols-4 gap-4">{[["配置方案名称", profile.name], ["已配置按键", bindings.length], ["动作数量", actions.length], ["涉及软件", appIds.size]].map(([label, value]) => <div className="panel p-4" key={label}><div className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</div><div className="mt-2 truncate text-xl font-semibold">{value}</div></div>)}</div><div className={`mt-5 flex items-start gap-3 rounded-xl border p-4 ${prepared.success ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}>{prepared.success ? <CheckCircle2 size={20}/> : <XCircle size={20}/>}<div><div className="text-sm font-semibold">{prepared.success ? "配置方案校验通过" : "配置方案无法导出"}</div><div className="mt-1 text-xs">{prepared.success ? "JSON 符合 KeyFlow 配置方案 v1.2，并已包含跨平台 Execution。" : prepared.errors.join(" · ")}</div></div></div>{downloadError && <div className="mt-3 text-sm text-red-600">{downloadError}</div>}<section className="panel mt-5 overflow-hidden"><div className="border-b bg-white px-5 py-3 text-sm font-semibold">可执行 JSON 预览</div><pre className="max-h-[600px] overflow-auto bg-slate-950 p-6 text-xs leading-6 text-slate-300">{JSON.stringify(prepared.compiled, null, 2)}</pre></section></>;
}

import { CheckCircle2, Download, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { PageHeader } from "../components/PageHeader";
import {
  downloadProfiles,
  prepareProfileExport,
  profileVersionLabel,
} from "../services/exportService";
import { useAppRegistryStore } from "../stores/appRegistryStore";
import { useCommandRegistryStore } from "../stores/commandRegistryStore";
import { useProfileStore } from "../stores/profileStore";

export function ExportPage() {
  const drafts = useProfileStore((state) => state.drafts);
  const apps = useAppRegistryStore((state) => state.apps);
  const commands = useCommandRegistryStore((state) => state.commands);
  const prepared = useMemo(
    () => prepareProfileExport(drafts, apps, commands),
    [drafts, apps, commands],
  );
  const [downloadError, setDownloadError] = useState("");
  const configured = drafts.filter((draft) => draft.actions.length > 0);
  const actions = configured.flatMap((draft) => draft.actions);
  const appIds = new Set(
    actions.filter((action) => action.type === "OPEN_APP").map((action) => action.appId),
  );
  const download = () => {
    const result = downloadProfiles(drafts, apps, commands);
    setDownloadError(result.success ? "" : result.errors.join("；"));
  };
  return (
    <>
      <PageHeader
        title="批量导出 Profile"
        description="每个能力编译为独立 Profile，并以 JSON 数组下载；版本以实际编译结果为准。"
        action={
          <button
            disabled={!prepared.success}
            className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"
            onClick={download}
          >
            <Download size={16} />
            下载 profiles.json
          </button>
        }
      />
      <div className="grid grid-cols-4 gap-4">
        {[
          ["Profile 数量", configured.length],
          ["动作数量", actions.length],
          ["涉及软件", appIds.size],
          ["协议版本", profileVersionLabel(prepared.compiled)],
        ].map(([label, value]) => (
          <div className="panel p-4" key={label}>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              {label}
            </div>
            <div className="mt-2 truncate text-xl font-semibold">{value}</div>
          </div>
        ))}
      </div>
      <div
        className={`mt-5 flex items-start gap-3 rounded-xl border p-4 ${prepared.success ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}
      >
        {prepared.success ? <CheckCircle2 size={20} /> : <XCircle size={20} />}
        <div>
          <div className="text-sm font-semibold">
            {prepared.success ? "Profile 校验通过" : "Profile 无法导出"}
          </div>
          <div className="mt-1 text-xs">
            {prepared.success
              ? "数组中的每项都是独立、自包含的 KeyFlow Profile，协议版本见各项 version 字段。"
              : prepared.errors.join(" · ")}
          </div>
        </div>
      </div>
      {downloadError && <div className="mt-3 text-sm text-red-600">{downloadError}</div>}
      <section className="panel mt-5 overflow-hidden">
        <div className="border-b bg-white px-5 py-3 text-sm font-semibold">
          Profile JSON 数组预览
        </div>
        <pre className="max-h-[600px] overflow-auto bg-slate-950 p-6 text-xs leading-6 text-slate-300">
          {JSON.stringify(prepared.compiled, null, 2)}
        </pre>
      </section>
    </>
  );
}

import type { AppDefinition, CommandDefinition, Profile } from "@blink/contract";
import type { ProfileDraft } from "../models/authoring";
import { compileProfileDrafts } from "./profileCompiler.ts";

export function profileVersionLabel(profiles: Pick<Profile, "version">[]): string {
  return [...new Set(profiles.map((profile) => profile.version))].sort().join(" / ") || "—";
}

export function prepareProfileExport(
  drafts: ProfileDraft[],
  apps: AppDefinition[],
  commands: CommandDefinition[],
) {
  try {
    const compiled = compileProfileDrafts(
      drafts.filter((draft) => draft.actions.length > 0),
      apps,
      commands,
    );
    if (!compiled.length)
      return { compiled: [] as Profile[], errors: ["至少需要一个包含动作的能力"], success: false };
    return { compiled, errors: [] as string[], success: true };
  } catch (error) {
    return {
      compiled: [] as Profile[],
      errors: [error instanceof Error ? error.message : "Profile 编译失败"],
      success: false,
    };
  }
}

export function downloadProfiles(
  drafts: ProfileDraft[],
  apps: AppDefinition[],
  commands: CommandDefinition[],
) {
  const result = prepareProfileExport(drafts, apps, commands);
  if (!result.success) return result;
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(result.compiled, null, 2)], { type: "application/json" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "blink-profiles.json";
  anchor.click();
  URL.revokeObjectURL(url);
  return result;
}

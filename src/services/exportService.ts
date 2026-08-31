import { profileSchema, type Profile } from "@keyflow/contract";
import type { AppDefinition, CommandDefinition } from "@keyflow/contract";
import { compileProfile, validateProfileBusiness } from "./profileCompiler";

export function validateProfile(profile: Profile) { return profileSchema.safeParse(profile); }
export function prepareProfileExport(profile: Profile, apps: AppDefinition[], commands: CommandDefinition[]) {
  const compiled = compileProfile(profile, apps, commands);
  const schema = validateProfile(compiled);
  const businessErrors = schema.success ? validateProfileBusiness(compiled, apps, commands) : schema.error.issues.map((issue) => `字段 ${issue.path.join(".")} 不符合要求`);
  return { compiled, errors: businessErrors, success: schema.success && businessErrors.length === 0 };
}
export function downloadProfile(profile: Profile, apps: AppDefinition[], commands: CommandDefinition[]) {
  const result = prepareProfileExport(profile, apps, commands);
  if (!result.success) return result;
  const url = URL.createObjectURL(new Blob([JSON.stringify(result.compiled, null, 2)], { type: "application/json" }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = "keyflow-profile.json"; anchor.click();
  URL.revokeObjectURL(url);
  return result;
}

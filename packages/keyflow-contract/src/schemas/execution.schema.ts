import { z } from "zod";
import { KEY_CODES } from "../constants.ts";

export const keyCodeSchema = z.enum(KEY_CODES);

export const sendHotkeyExecutionSchema = z
  .object({
    type: z.literal("SEND_HOTKEY"),
    keys: z
      .array(keyCodeSchema)
      .min(1, "快捷键不能为空")
      .refine((keys) => new Set(keys).size === keys.length, "快捷键不能包含重复按键"),
  })
  .strict();

export const launchAppExecutionSchema = z
  .object({
    type: z.literal("LAUNCH_APP"),
    executableNames: z.array(z.string().trim().min(1)).optional(),
    aliases: z.array(z.string().trim().min(1)).optional(),
    bundleIds: z.array(z.string().trim().min(1)).optional(),
    appNames: z.array(z.string().trim().min(1)).optional(),
    knownPaths: z.array(z.string().trim().min(1)).optional(),
  })
  .strict()
  .refine(
    (execution) =>
      [
        execution.executableNames,
        execution.aliases,
        execution.bundleIds,
        execution.appNames,
        execution.knownPaths,
      ].some((values) => values?.length),
    "LAUNCH_APP 至少需要一个应用定位线索",
  );

// Deliberately small URL subset: HTTP(S), ASCII DNS/localhost, optional port.
export const portableHttpUrl = (value: string) => {
  if (/[\s\\\u0000-\u001f\u007f]/u.test(value)) return false;
  const match = /^https?:\/\/([^/?#]+)(?:[/?#].*)?$/.exec(value);
  if (!match) return false;
  const parts = match[1]!.split(":");
  return (
    parts.length <= 2 &&
    /^[A-Za-z0-9][A-Za-z0-9.-]*$/.test(parts[0]!) &&
    (parts.length === 1 || (/^[0-9]+$/.test(parts[1]!) && +parts[1]! > 0 && +parts[1]! <= 65535))
  );
};
const targetPath = z
  .string()
  .min(1)
  .refine((s) => !/[\u0000-\u001f\u007f]/.test(s), "路径不能包含控制字符");
export const openUrlExecutionSchema = z
  .object({
    type: z.literal("OPEN_URL"),
    url: z.string().refine(portableHttpUrl, "请输入完整 HTTP/HTTPS 地址"),
  })
  .strict();
export const openFileExecutionSchema = z
  .object({ type: z.literal("OPEN_FILE"), path: targetPath })
  .strict();
export const openFolderExecutionSchema = z
  .object({ type: z.literal("OPEN_FOLDER"), path: targetPath })
  .strict();
export const runScriptExecutionSchema = z
  .object({ type: z.literal("RUN_SCRIPT"), path: targetPath })
  .strict();
export const executionSchema = z.union([
  launchAppExecutionSchema,
  sendHotkeyExecutionSchema,
  openUrlExecutionSchema,
  openFileExecutionSchema,
  openFolderExecutionSchema,
  runScriptExecutionSchema,
]);

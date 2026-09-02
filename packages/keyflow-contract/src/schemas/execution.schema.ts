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

export const executionSchema = z.union([launchAppExecutionSchema, sendHotkeyExecutionSchema]);

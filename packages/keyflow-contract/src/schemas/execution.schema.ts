import { z } from "zod";
import { KEY_CODES } from "../constants";
import { macOSAppDefinitionSchema, windowsAppDefinitionSchema } from "./app.schema";

export const keyCodeSchema = z.enum(KEY_CODES);

export const sendHotkeyExecutionSchema = z.object({
  type: z.literal("SEND_HOTKEY"),
  keys: z.array(keyCodeSchema).min(1, "快捷键不能为空").refine((keys) => new Set(keys).size === keys.length, "快捷键不能包含重复按键"),
});

export const windowsLaunchAppExecutionSchema = windowsAppDefinitionSchema.extend({ type: z.literal("LAUNCH_APP") });
export const macOSLaunchAppExecutionSchema = macOSAppDefinitionSchema.extend({ type: z.literal("LAUNCH_APP") });

export const executionSchema = z.union([windowsLaunchAppExecutionSchema, macOSLaunchAppExecutionSchema, sendHotkeyExecutionSchema]);

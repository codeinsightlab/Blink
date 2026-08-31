import { z } from "zod";
import { KEY_SLOTS } from "../constants";
import { macOSLaunchAppExecutionSchema, sendHotkeyExecutionSchema, windowsLaunchAppExecutionSchema } from "./execution.schema";

export const openAppActionSchema = z.object({
  type: z.literal("OPEN_APP"),
  appId: z.string().trim().min(1),
  executions: z.object({ windows: windowsLaunchAppExecutionSchema.optional(), macos: macOSLaunchAppExecutionSchema.optional() }),
});

export const commandActionSchema = z.object({
  type: z.literal("COMMAND"),
  commandId: z.string().trim().min(1),
  name: z.string().trim().min(1),
  executions: z.object({ windows: sendHotkeyExecutionSchema.optional(), macos: sendHotkeyExecutionSchema.optional() }),
});

export const actionSchema = z.discriminatedUnion("type", [openAppActionSchema, commandActionSchema]);

export const keyBindingSchema = z.object({
  id: z.string().trim().min(1),
  slot: z.enum(KEY_SLOTS),
  name: z.string().trim().min(1, "功能名称不能为空"),
  description: z.string().trim().optional(),
  actions: z.array(actionSchema),
});

export const profileSchema = z.object({
  version: z.literal("1.2"),
  id: z.string().trim().min(1),
  name: z.string().trim().min(1, "Profile 名称不能为空"),
  bindings: z.array(keyBindingSchema),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

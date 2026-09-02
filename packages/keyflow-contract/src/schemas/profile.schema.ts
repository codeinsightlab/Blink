import { z } from "zod";
import { launchAppExecutionSchema, sendHotkeyExecutionSchema } from "./execution.schema.ts";

const implementations = <T extends z.ZodType>(schema: T) =>
  z
    .object({ windows: schema.optional(), macos: schema.optional() })
    .strict()
    .refine((value) => Boolean(value.windows || value.macos), "至少需要一个平台实现");

export const openAppActionSchema = z
  .object({
    type: z.literal("OPEN_APP"),
    executions: implementations(launchAppExecutionSchema),
  })
  .strict();

export const commandActionSchema = z
  .object({
    type: z.literal("COMMAND"),
    executions: implementations(sendHotkeyExecutionSchema),
  })
  .strict();

export const actionSchema = z.discriminatedUnion("type", [
  openAppActionSchema,
  commandActionSchema,
]);

export const profileSchema = z
  .object({
    version: z.literal("2.0"),
    name: z.string().trim().min(1, "Profile 名称不能为空"),
    description: z.string().trim().min(1).optional(),
    actions: z.array(actionSchema).min(1, "Profile 至少需要一个动作"),
  })
  .strict();

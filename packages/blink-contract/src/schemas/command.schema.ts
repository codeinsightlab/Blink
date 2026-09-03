import { z } from "zod";
import { sendHotkeyExecutionSchema } from "./execution.schema.ts";

const optionalText = z.string().trim().optional();

export const commandDefinitionSchema = z.object({
  id: z
    .string()
    .trim()
    .min(1)
    .regex(/^[A-Z0-9_]+$/, "ID 仅支持大写字母、数字和下划线"),
  name: z.string().trim().min(1, "名称不能为空"),
  description: optionalText,
  category: optionalText,
  executions: z.object({
    windows: sendHotkeyExecutionSchema.optional(),
    macos: sendHotkeyExecutionSchema.optional(),
  }),
  enabled: z.boolean(),
  createdAt: optionalText,
  updatedAt: optionalText,
});

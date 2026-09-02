import { z } from "zod";

const optionalText = z.string().trim().optional();

export const windowsAppDefinitionSchema = z.object({
  executableNames: z.array(z.string().trim().min(1)),
  knownPaths: z.array(z.string().trim().min(1)).optional(),
  aliases: z.array(z.string().trim().min(1)).optional(),
});

export const macOSAppDefinitionSchema = z.object({
  bundleIds: z.array(z.string().trim().min(1)).optional(),
  appNames: z.array(z.string().trim().min(1)).optional(),
  knownPaths: z.array(z.string().trim().min(1)).optional(),
});

export const appDefinitionSchema = z.object({
  id: z
    .string()
    .trim()
    .min(1)
    .regex(/^[a-z0-9][a-z0-9-]*$/, "ID 仅支持小写字母、数字和连字符"),
  name: z.string().trim().min(1, "名称不能为空"),
  category: optionalText,
  description: optionalText,
  icon: optionalText,
  platforms: z.object({
    windows: windowsAppDefinitionSchema.optional(),
    macos: macOSAppDefinitionSchema.optional(),
  }),
  enabled: z.boolean(),
  createdAt: optionalText,
  updatedAt: optionalText,
});

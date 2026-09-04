import { z } from "zod";
import {
  toggleAppExecutionSchema,
  macosToggleAppExecutionSchema,
  windowsToggleAppExecutionSchema,
  launchAppExecutionSchema,
  sendHotkeyExecutionSchema,
  openUrlExecutionSchema,
  openFileExecutionSchema,
  openFolderExecutionSchema,
  runScriptExecutionSchema,
} from "./execution.schema.ts";

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
  z
    .object({
      type: z.literal("TOGGLE_APP"),
      executions: z
        .object({ macos: macosToggleAppExecutionSchema.optional(), windows: windowsToggleAppExecutionSchema.optional() })
        .strict()
        .refine((value) => Boolean(value.macos || value.windows), "至少需要一个平台实现"),
    })
    .strict(),
  openAppActionSchema,
  commandActionSchema,
  z
    .object({ type: z.literal("OPEN_URL"), executions: implementations(openUrlExecutionSchema) })
    .strict(),
  z
    .object({ type: z.literal("OPEN_FILE"), executions: implementations(openFileExecutionSchema) })
    .strict(),
  z
    .object({
      type: z.literal("OPEN_FOLDER"),
      executions: implementations(openFolderExecutionSchema),
    })
    .strict(),
  z
    .object({ type: z.literal("SCRIPT"), executions: implementations(runScriptExecutionSchema) })
    .strict(),
]);

export const profileSchema = z
  .object({
    version: z.enum(["2.0", "2.1"]),
    name: z.string().trim().min(1, "Profile 名称不能为空"),
    description: z.string().trim().min(1).optional(),
    actions: z.array(actionSchema).min(1, "Profile 至少需要一个动作"),
  })
  .strict()
  .superRefine((profile, ctx) => {
    profile.actions.forEach((action, index) => {
      if (profile.version === "2.0" && !["OPEN_APP", "COMMAND"].includes(action.type)) {
        ctx.addIssue({
          code: "custom",
          path: ["actions", index],
          message: "新增动作需要 Profile v2.1",
        });
      }
      for (const [platform, execution] of Object.entries(action.executions)) {
        if (!("path" in execution)) continue;
        const path = execution.path;
        const absolute =
          platform === "macos"
            ? path.startsWith("/")
            : /^(?:[A-Za-z]:[\\/]|\\\\[^\\]+\\[^\\]+)/.test(path);
        if (
          !absolute ||
          (execution.type === "RUN_SCRIPT" &&
            !path.toLowerCase().endsWith(platform === "macos" ? ".sh" : ".ps1"))
        ) {
          ctx.addIssue({
            code: "custom",
            path: ["actions", index, "executions", platform, "path"],
            message: "请选择当前平台绝对路径；脚本仅支持 macOS .sh / Windows .ps1",
          });
        }
      }
    });
  });

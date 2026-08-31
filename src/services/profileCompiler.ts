import type { Action, AppDefinition, CommandDefinition, OpenAppAction, Profile } from "@keyflow/contract";

export function createOpenAppAction(app: AppDefinition): OpenAppAction {
  return {
    type: "OPEN_APP",
    appId: app.id,
    executions: {
      ...(app.platforms.windows ? { windows: { type: "LAUNCH_APP" as const, ...app.platforms.windows } } : {}),
      ...(app.platforms.macos ? { macos: { type: "LAUNCH_APP" as const, ...app.platforms.macos } } : {}),
    },
  };
}

export function createCommandAction(command: CommandDefinition): Action {
  return { type: "COMMAND", commandId: command.id, name: command.name, executions: command.executions };
}

export function compileProfile(profile: Profile, apps: AppDefinition[], commands: CommandDefinition[]): Profile {
  return {
    ...profile,
    bindings: profile.bindings.map((binding) => ({
      ...binding,
      actions: binding.actions.map((action) => {
        if (action.type === "OPEN_APP") {
          const app = apps.find((item) => item.id === action.appId);
          return app ? createOpenAppAction(app) : action;
        }
        const command = commands.find((item) => item.id === action.commandId);
        return command ? createCommandAction(command) : action;
      }),
    })),
  };
}

export function validateProfileBusiness(profile: Profile, apps: AppDefinition[], commands: CommandDefinition[]): string[] {
  const errors: string[] = [];
  for (const binding of profile.bindings) {
    binding.actions.forEach((action, index) => {
      const location = `${binding.slot} 第 ${index + 1} 个动作`;
      if (action.type === "OPEN_APP") {
        if (!apps.some((app) => app.id === action.appId)) errors.push(`${location}：软件 ${action.appId} 不存在于软件库`);
        if (!action.executions.windows && !action.executions.macos) errors.push(`${location}：至少需要一个平台的打开软件实现`);
      } else {
        if (!commands.some((command) => command.id === action.commandId)) errors.push(`${location}：命令 ${action.commandId} 不存在于命令库`);
        if (!action.executions.windows && !action.executions.macos) errors.push(`${location}：至少需要一个平台的快捷键实现`);
        for (const [platform, execution] of Object.entries(action.executions)) {
          if (execution && execution.keys.length === 0) errors.push(`${location}：${platform} 快捷键不能为空`);
        }
      }
    });
  }
  return errors;
}

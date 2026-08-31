# KeyFlow Studio Web V1 架构与 Profile Contract

## 2026-08-31：Web V1 初始实现

### 范围

Web V1 只负责维护 App Registry、配置 F13–F18 的 `OPEN_APP` Action、校验并导出 Profile JSON。它不查找或启动本机软件，不监听键盘，不包含后端、账号、数据库、Electron/Tauri、USB/HID 或 Local Runtime。

### 模块边界

- `AppDefinition` 是软件识别信息的唯一来源，包含 Windows/macOS 的候选标识。
- `Profile` 只保存稳定的 `appId` 引用，不保存安装路径或平台识别细节。
- `Action` 从 V1 开始保持可辨识联合类型结构；当前唯一成员为 `OpenAppAction`。
- App Registry 和 Profile 分别持久化到 `keyflow.appRegistry` 与 `keyflow.currentProfile`，删除 Registry 项不会隐式删除 Profile 引用。
- 导出是独立服务，必须先通过 Zod `ProfileSchema`，失败时不创建下载。

### Profile v1.0 Contract

Runtime 对接时必须遵守以下规则：

1. 顶层 `version` 固定为字符串 `"1.0"`。
2. `bindings[].trigger` 在 V1 仅允许 `F13`、`F14`、`F15`、`F16`、`F17`、`F18`。
3. `bindings[].actions` 是有序数组；Runtime 应按数组顺序执行。
4. V1 Action 固定为 `{ "type": "OPEN_APP", "appId": string }`。
5. Runtime 使用 `appId` 到独立 App Registry/内置注册信息解析平台标识；不得要求 Profile 提供绝对路径。
6. Runtime 遇到未知 `type` 或无法解析的 `appId` 时应返回明确错误，不应猜测路径或静默执行其他动作。
7. `createdAt`、`updatedAt` 为 ISO 8601 UTC datetime；Web 每次配置变更更新 `updatedAt`。

### 当前持久化与兼容性限制

- 当前仅维护一个 Profile，数据只存在当前浏览器 localStorage。
- App Registry 删除与 Profile 引用没有级联关系，因此导出的 Schema 仍可能允许一个当前 Registry 中不存在的 `appId`；这是契约层与本地目录层分离的结果，Runtime 必须处理无法解析的引用。
- 初始软件库的平台信息用于候选识别，Web V1 不验证用户设备是否安装这些软件。
- V1 不实现 Profile 导入、Registry 导入/导出或跨设备同步。

## 2026-08-31：逻辑 Slot 与物理按键解耦

### 调整原因与历史兼容

初始 Profile Contract 曾将 `F13`–`F18` 直接写入 `bindings[].trigger`。该设计把 Web 定义的功能配置与用户设备上的真实输入耦合，现已由逻辑槽位 `bindings[].slot` 取代。以上初始章节作为历史记录保留，不再代表当前有效 Contract。

Web 在读取 `keyflow.currentProfile` 时先执行一次兼容迁移，再使用当前 Zod Schema 校验。旧数据按 `F13 → KEY_1`、`F14 → KEY_2`、`F15 → KEY_3`、`F16 → KEY_4`、`F17 → KEY_5`、`F18 → KEY_6` 转换；原有 Actions 与顺序保留，空名称补为“按键 1”至“按键 6”，迁移成功后立即写回 localStorage。无法识别或校验失败的数据不会部分迁移，而是回退到默认 Profile。

### 当前 Profile v1.0 Contract

`KeyBinding` 当前结构为：

```ts
interface KeyBinding {
  id: string;
  slot: "KEY_1" | "KEY_2" | "KEY_3" | "KEY_4" | "KEY_5" | "KEY_6";
  name: string;
  description?: string;
  actions: Action[];
}
```

- `id` 是内部记录唯一标识。
- `slot` 是稳定协议字段，不随用户修改名称而改变；Web V1 只接受 `KEY_1`–`KEY_6`。
- `name` 是必填、trim 后不可为空的用户功能名称，也是 Runtime 未来的主要展示字段。
- `description` 是可选说明。
- `actions` 是有序动作列表，当前允许空数组；唯一合法 Action 为 `{ "type": "OPEN_APP", "appId": string }`。
- Profile 及其导出结果不得包含 `trigger`、F 键、组合键或其他真实物理键值。

### Web 与 Runtime 责任边界

Web Profile 只负责：

```text
slot + name + description + actions
```

未来 Runtime 的本地配置负责维护 `slot → 真实物理按键`，例如：

```json
{
  "keyBindings": {
    "KEY_1": "F11",
    "KEY_2": "F12",
    "KEY_3": "CTRL+SHIFT+F9"
  }
}
```

该 Runtime 本地配置不是 Web Profile 的一部分。Web 不监听、不识别、不保存，也不提供任何真实物理按键绑定界面。

### 未来完整执行链

```text
用户按下真实物理按键
→ Runtime 捕获输入
→ Runtime 根据本地映射解析为 KEY_1
→ Runtime 读取 Web Profile
→ 找到 slot 为 KEY_1 的 KeyBinding
→ 读取 name / actions
→ 按顺序执行 OPEN_APP
```

例如：`F11 → KEY_1 → “打开工作台” → 微信 + Chrome + Excel`。其中只有 `KEY_1`、功能信息和 Actions 来自 Web Profile；`F11 → KEY_1` 的映射完全属于 Runtime 本地配置。

## 2026-08-31：共享 Contract Package 抽离

### 审查结论

`Profile`、`KeyBinding`、`Action`、`OpenAppAction` 与 `KEY_SLOTS` 是 Web 和未来 Runtime 都必须解释一致的领域协议，已抽离到 workspace package `packages/keyflow-contract`。

`AppDefinition` 同样属于共享协议：Runtime 执行 `OPEN_APP` 时必须通过 `appId` 消费 Windows 的 `executableNames`、`knownPaths`、`aliases`，以及 macOS 的 `bundleIds`、`appNames`、`knownPaths`。当前模型中的 `category`、`description`、`icon`、`enabled` 和时间字段也是 Registry 交换数据的稳定部分。现有 App 模型没有混入 selected、editing、searchText、formError 等 Web UI 状态，因此整体进入 Contract；页面筛选、编辑草稿和错误状态继续由 Web 自己维护。

### 唯一事实源与依赖方向

```text
             @keyflow/contract
                    ↑
          ┌─────────┴─────────┐
Web Configurator        Future Runtime
  生产 Profile          消费 Profile
```

`@keyflow/contract` 是 KeyFlow 跨应用领域协议的唯一事实源，同时导出类型、常量和 Zod Schema。Web 已删除原 `src/models/action.ts`、`src/models/app.ts`、`src/models/profile.ts`、`src/schemas/app.schema.ts`、`src/schemas/profile.schema.ts`，业务代码只允许通过包名导入，不使用指向 package 源码的深层相对路径。

Contract 当前包含：

- `KEY_SLOTS`、`KeySlot`
- `OpenAppAction`、`Action`
- `KeyBinding`、`Profile`
- `WindowsAppDefinition`、`MacOSAppDefinition`、`AppDefinition`
- `openAppActionSchema`、`keyBindingSchema`、`profileSchema`
- `windowsAppDefinitionSchema`、`macOSAppDefinitionSchema`、`appDefinitionSchema`

### Profile v1.0 冻结与迁移边界

本次只改变依赖方向，没有改变已经验证的 Profile JSON。当前 Profile v1.0 视为 Runtime V0 的正式输入协议；除非发现明确 Contract Bug，不再随 Web 实现细节调整字段。

Contract 只回答“当前合法数据长什么样”。`trigger → slot` 的历史 localStorage 迁移仍保留在 Web `profileStore`，因为它回答“旧 Web 数据如何升级”，不属于跨应用当前协议。

### Runtime 后续接入

TypeScript Runtime 必须通过 workspace、发布包或受控本地包依赖 `@keyflow/contract`，直接使用其中的类型、`KEY_SLOTS` 和 `profileSchema`，不得重写协议副本。若 Runtime 核心采用 Rust，也必须以该 Contract/Schema 为标准生成或映射 Rust 类型，并通过共同的 JSON Fixture 做兼容测试，不能人工维护一套含义不同的结构。

## 2026-08-31：Action 与 Execution 执行模型（Profile v1.1）

### Action vs Execution

```text
Action    = 用户要做什么（打开软件、复制）
Execution = 当前 OS 如何做（应用识别目标、具体快捷键）
Runtime   = Execution Engine
```

Action 保留产品语义，当前合法类型为 `OPEN_APP` 与 `COMMAND`；它们不能被合并为通用系统调用。Execution 只表达 OS 最终执行描述，当前合法类型为 `OPEN_APP` 和 `HOTKEY`。平台枚举固定为 `windows`、`macos`，底层按键使用共享 `KEY_CODES`。

```text
App Registry ──────┐
                   │
Command Registry ──┼─→ Web Compiler → Executable Profile v1.1 → Runtime
                   │
User Profile ──────┘
```

### 可执行 Profile

Profile v1.1 的 `OPEN_APP` 不只保存 `appId`，还保存各平台的 `OpenAppExecution`；`COMMAND` 不只保存 `commandId`、`name`，还保存各平台 `HotkeyExecution`。因此 Runtime 读取单份 Profile 就能按当前 OS 选择 `executions.windows` 或 `executions.macos`，不需要加载 Web 的 Registry。

例如 `COPY` 明确携带 Windows `CTRL + C` 与 macOS `META + C`。`META` 的实际系统映射仍由 Runtime 执行层处理，但 Web 不会把 COPY 简化为“自动推断 Ctrl/Command”。

### 迁移与完整性校验

Web 读取旧 v1.0 Profile 时，会使用当前 App Registry 为旧 `OPEN_APP` action 生成 executions，并将版本升级为 `1.1`。若对应 App 不存在，Action 会被保留并标记为空 executions；导出时业务校验会明确报错并禁止下载，不会静默丢失数据。

导出前 Web Compiler 会再次从当前 Registry 编译 Action，然后校验：App/Command 是否仍存在、每个 Action 是否至少有一个平台 Execution、快捷键是否非空且无重复键，以及整体 `profileSchema` 是否通过。

### Runtime 正式责任边界

Runtime 只负责读取和校验 Profile、捕获物理按键、映射到 Slot、选择当前 OS Execution 并执行。它不允许维护 COPY 快捷键、Chrome Bundle ID/executableName、工作台或游戏模式等业务知识。当前示例 Fixture 位于 `packages/keyflow-contract/fixtures/profile-v1.2.example.json`。

## 2026-08-31：Runtime 开发前 Execution Primitive 收敛（Profile v1.2）

### v1.2 变更与版本决策

v1.1 已被定义为 Runtime 的正式输入协议；本次对已导出的 Execution JSON 做了结构性重命名，因此升级为 `1.2`，而不是静默沿用 `1.1`。Action 业务语义不变：`OPEN_APP` 与 `COMMAND`。只有 Runtime Primitive 改为 `LAUNCH_APP` 与 `SEND_HOTKEY`，从而避免 Action 与 Execution 共用名称。

```text
Action = 用户想做什么
  OPEN_APP | COMMAND

Execution = 操作系统最终执行什么
  LAUNCH_APP | SEND_HOTKEY

Runtime = Execution Engine
```

`LAUNCH_APP` 直接携带对应平台的应用定位字段（例如 `executableNames`、`bundleIds`、`appNames`），不再嵌套 `app`。`SEND_HOTKEY` 直接携带共享 `KeyCode[]`。

### Runtime 强约束

Runtime 只允许读取 `slot`、仅供 GUI 展示的 `binding.name` / `description`、`executions[currentPlatform]`、`Execution.type` 及其参数。真正的执行分发只能按 `Execution.type` 进入 Primitive Executor：`LAUNCH_APP → LaunchAppExecutor`、`SEND_HOTKEY → SendHotkeyExecutor`。

Runtime 禁止使用 `Action.type`、`commandId`、`appId`、命令/软件名称、Command Registry 或 App Registry 决定系统执行逻辑；禁止出现 `if commandId === "COPY"`、`if appId === "chrome"` 或通过 `switch action.type` 分发执行。

### Runtime Profile Binding 模型

Profile 是 Web 生成的只读描述，只说明“Slot 执行什么”。Runtime 导入 Profile 后读取其中实际存在的 Slot 与展示名称，让用户分别绑定真实物理按键；它不预设任何 Slot 到 F 键的映射，也不修改 Profile。

```json
{
  "profileId": "default",
  "keyBindings": {
    "KEY_1": "F11",
    "KEY_2": "F12"
  }
}
```

未绑定 Slot 可以不存在。该 Runtime State 与 Profile 分离，仅由 Runtime 本地维护。

### 迁移与最终执行流

Web localStorage 在读取时会将旧 v1.0/v1.1 Profile 升级为 v1.2：旧 Execution 的 `OPEN_APP` 变为扁平 `LAUNCH_APP`，旧 `HOTKEY` 变为 `SEND_HOTKEY`；业务 Action 的 `OPEN_APP` / `COMMAND` 不变。迁移后写回 localStorage，现有配置不会丢失。

```text
真实物理按键
→ Runtime 本地 Key Binding
→ Slot
→ Profile Binding
→ executions[currentPlatform]
→ Execution.type
→ Primitive Executor
→ 系统 API
```

Runtime 不需要知道 KEY_2 的业务含义是“复制”；在 macOS 上只需读到 `SEND_HOTKEY` 和 `META + C` 后执行。

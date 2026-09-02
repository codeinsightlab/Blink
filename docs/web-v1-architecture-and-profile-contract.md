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

## 2026-09-02：Runtime V1 Keycap、快捷键展示层与统一图标

### 实施前审查结论

Runtime GUI 当前采用 Tauri 2 + Rust Core + 原生 TypeScript/Vite；页面由 `runtime/src/main.ts` 的字符串模板渲染，没有 React/Vue 组件体系。全局样式与 Design Token 位于 `runtime/src/style.css`。Profile v1.2 的共享事实源仍是 `packages/keyflow-contract`；Rust `Profile` 只做对应 DTO 映射，`SEND_HOTKEY` 的唯一数据结构为 `{ type: "SEND_HOTKEY", keys: KeyCode[] }`。

Runtime 存在两类容易混淆但语义不同的快捷键：

- `bindings.json` 中的 `physicalInput` 是用户在本机为 RuntimeProfile 绑定的实体触发键。
- Profile `actions[].executions[platform].keys` 是 Profile 编译后携带的动作执行快捷键。

执行层按当前构建平台读取 `executions.windows` 或 `executions.macos`，然后把原始 `keys` 直接传给 `execution::dispatch`。本轮只让 snapshot 额外暴露同一路径下首个 `SEND_HOTKEY.keys` 供系统动作卡片展示；没有修改 Profile、RuntimeProfile 持久化结构或 Executor 输入。

此前 GUI 在 `main.ts` 内维护一套手写 SVG path 字典，业务模板直接调用 `icon(id)`；快捷键则把整个 `physicalInput` 字符串塞进单个 `.keycap`，没有独立 formatter，也没有未知键展示约束。

### 表现层与数据流

新增表现层严格保持以下两条链路分离：

```text
Profile → Runtime snapshot actionHotkey → formatHotkeyForDisplay → HotkeyDisplay → Keycap → UI
Profile → executions[currentPlatform] → Primitive Executor
```

`formatHotkeyForDisplay` 只完成 trim/大写、稳定 modifier 展示排序和平台标签转换。macOS 使用 `⌃ ⌥ ⇧ ⌘`，Windows 使用 `Ctrl Alt Shift Win`；字符键、F1–F12 和 Contract 已有特殊键按原始含义显示。正式 Contract 使用 `CTRL`，Formatter 仅为展示兼容把旧/raw `CONTROL` 同样标成 Ctrl，未向 Schema 或 Executor 增加该键。其他未知 key code 保留原值并以虚线 Keycap 标记，不回退为空，也不替换为其他按键。稳定排序仅作用于返回给 UI 的新数组，不修改 Profile 或 Executor 使用的原数组。

实体触发键也复用同一个 `HotkeyDisplay`/`Keycap`，但来源仍是 Runtime 本地绑定。未绑定项只显示低权重“＋ 绑定”，不渲染空 Keycap。监听暂停或注册失败会在 Keycap 后显示克制的状态文字；渲染器也预留 `conflict` 状态。当前 BindingState 采用单一物理键单一 Profile 且新绑定 last-wins，因此 snapshot 不会产生持久化冲突项。Keycap 本身不使用大面积错误色。

### Icon System 决策

Runtime 主图标库统一为 Lucide。选择原因是：现有手写图标本身已经接近 Lucide 的 24px outline 语言，Lucide 可覆盖导航、导入、设置、菜单和八种系统动作，接入后无需引入 UI framework。新增唯一生产依赖 `lucide`，业务模板只能通过 `RuntimeIcon(name)` 使用受控语义名称；该封装按需导入 IconNode 并生成 SVG，页面不再直接维护 SVG path 或混用第二套 icon set。

### UI 结构调整

外部 Profile 改为紧凑“我的命令”列表，列为名称/描述、来源、本机绑定和弱化操作菜单；已绑定 Keycap 可直接点击重新绑定。系统内置项保留 Compact Tile，动作区展示 Profile 的实际 `SEND_HOTKEY.keys`，底部“＋ 绑定”仍表示实体触发键绑定。两处快捷键视觉使用同一个 formatter 和 Keycap 渲染器。

Runtime 没有也不允许建立 `COPY → META+C`、`PASTE → META+V` 等业务快捷键映射。系统动作名称只用于选择区分性的 Lucide 图标，不参与快捷键展示或执行。

### 2026-09-02：系统动作自捕获与解绑入口修复

用户将单字符实体键绑定到系统动作后，诊断日志曾连续出现同一实体键“执行完成”，但前台应用没有得到预期效果。根因是 Runtime 在执行 `SEND_HOTKEY` 时仍保持全局实体键注册：例如 `C → 复制` 会注入 `META + C`，其中注入的 `C` 又命中 Runtime 自己的全局 `C` 注册，产生递归自捕获。Profile、系统动作 keys 与 Enigo 映射均存在，不能把 Executor 的无错误返回误判为端到端执行成功。

当前 `dispatch_profile` 在取得不可变的原始 Execution 与 BindingState 快照后，先撤销全部全局快捷键注册，再按 Profile 顺序执行 Primitive，最后使用原 BindingState 恢复注册。执行期间注入的按键不会再回流到 Runtime handler。恢复失败会把 listener 置为 `ERROR` 并写入诊断日志；不会继续声称命令成功。该隔离没有修改 Profile keys，也没有增加命令语义判断。

上述首版隔离随后被运行时事实推翻：最新日志两次停在“已收到全局快捷键 C”，既没有完成/失败诊断，也没有生成 macOS `.ips`，进程直接退出。崩溃点位于 global-shortcut 插件自己的 handler 回调栈内调用 `unregister_all()`；在该回调内改变同一插件的注册表不安全，因此该方案已完整撤销。

稳定修复不再在执行路径修改全局注册表。`RuntimeCore` 维护只在内存存在的 `suppress_shortcuts_until`：执行 Profile 前开启 500ms 隔离窗口，执行完成后保留 250ms 尾窗；global-shortcut handler 在窗口内直接忽略 Runtime 注入产生的回流事件。Profile 原始 Execution、持久化 BindingState 与注册表均不修改，正常用户输入在极短尾窗后继续由既有 handler 处理。

后端 `unbind_profile` 一直同时支持 SYSTEM 与 EXTERNAL RuntimeProfile；此前仅外部项的更多菜单接入了该命令。系统 Tile 现对已绑定项在 Keycap 后显示低权重“解绑”，仍复用相同后端事务：生成 next BindingState、重新注册、持久化，失败时保留 previous state。

## 2026-08-31：独立 KeyFlow Runtime V0 首轮实现

### 工程与职责边界

独立桌面项目位于 `runtime/`，采用 Tauri 2（Rust Core）和 TypeScript/Vite GUI。它不依赖 Web 源码，运行时只消费 Profile JSON；开发期唯一共享输入为 `packages/keyflow-contract/fixtures/profile-v1.2.example.json`。Fixture 解析测试直接嵌入 Rust `ProfileLoader`，以保证 Runtime DTO 与 v1.2 JSON 同步。

Runtime 无业务知识，但拥有必要的操作系统能力：它能根据 `LAUNCH_APP` 的定位线索启动应用，并把 `SEND_HOTKEY.keys` 交给系统级按键模拟。它不以 `Action.type`、`appId`、`commandId`、功能名称或 Registry 分发执行；`Action` 在 Runtime 内仅作为保留顺序的 `executions` 容器。

### Profile Loader 与错误模型

`ProfileLoader` 支持从用户选择的 JSON 文件读取，也提供仅用于开发验证的 v1.2 fixture 加载入口。它要求版本为 `"1.2"`，并校验 Profile/Slot 名称、应用定位线索和快捷键数组。失败不会退出应用，GUI 保持 `PROFILE_ERROR` 并显示错误。

错误码/错误前缀包括：`INVALID_JSON`、`UNSUPPORTED_PROFILE_VERSION`、`INVALID_PROFILE`、`UNSUPPORTED_PLATFORM`、`UNKNOWN_EXECUTION`。Runtime 不修改或回写 Profile。

### Runtime State 与物理按键绑定

绑定状态独立持久化在 Tauri app-data 下的 `bindings.json`，格式为：

```json
{
  "profileId": "default",
  "keyBindings": { "KEY_1": "F11" }
}
```

GUI 根据当前 Profile 实际出现的 Slot 展示功能名称与描述，不预设 KEY_1～KEY_6 或 F 键。用户点击绑定后，GUI 捕获下一次实体按键；同一按键若已属于另一 Slot 则拒绝覆盖。绑定会在写入成功后重新注册全局监听；解绑也会更新持久化状态。

GUI 状态固定为 `PROFILE_ERROR`、`UNBOUND`、`PARTIAL_BINDING`、`READY`，分别表达加载失败、零绑定、部分绑定和全部 Profile Slot 已绑定。

### Platform Router 与 Execution Dispatcher

全局监听仅注册当前 Binding Store 中的物理按键。触发后按 Slot 找到 Profile Binding，按照 `actions` 原始顺序读取 `executions[currentPlatform]`；缺少当前 OS 项记录 `UNSUPPORTED_PLATFORM`，不回退到另一平台。

分发只按 `Execution.type`：

```text
LAUNCH_APP  → LaunchAppExecutor
SEND_HOTKEY → SendHotkeyExecutor
```

固定失败策略为“记录最近错误后继续当前 Slot 的后续 Execution”。这确保多个 Action 的行为可预测，且单项失败不会让 Runtime 崩溃。

### 系统能力实现与当前限制

macOS 的 `LAUNCH_APP` 按 `bundleIds → appNames → knownPaths` 顺序调用 Launch Services `open`（`-b`、`-a`、路径 fallback），不拼接固定 `/Applications` 路径。Windows 边界保留为 `executableNames/aliases → knownPaths`，通过 Windows `start` 使用系统 PATH/App Execution Alias 解析；App Paths Registry 的专用查询尚未加入，属于后续 Windows 真实机验证项。

`SEND_HOTKEY` 直接将 Contract `keys` 交给 `enigo` 发送，不把 COPY 等业务名称转换为快捷键。macOS 真实发送依赖系统授予辅助功能（Accessibility）权限；Windows 需要真实机验证系统事件与权限边界。

首轮源代码阶段尚未具备 Rust/Cargo；后续本机已补齐工具链并完成 `cargo check`、fixture `cargo test`、TypeScript 构建和 `tauri:dev` 启动。全局监听、Chrome/VS Code 启动和系统级快捷键仍需要按实际 Profile 与 macOS 辅助功能权限逐项验收，不能由静态构建替代。

## 2026-08-31：Runtime Menu Bar / System Tray 常驻模型

### 产品入口与启动行为

Runtime 的主要入口调整为 macOS Menu Bar / Windows System Tray。生产构建启动时默认隐藏主窗口，初始化本地 Binding Store、注册已绑定的全局快捷键并创建 Tray；开发构建保留窗口显示以便调试。主窗口只承担 Profile 导入与实体按键绑定管理，不是长期停留的管理后台。

TrayController 统一提供“打开 KeyFlow”“暂停监听 / 恢复监听”“退出 KeyFlow”。左击 Tray 图标打开并聚焦现有主窗口；不会创建第二个窗口。退出前解除所有全局快捷键注册，再显式结束进程。

### 窗口与监听状态

用户点击主窗口关闭按钮时，WindowController 会阻止关闭并隐藏窗口；Runtime 与全局监听继续常驻。**关闭主窗口不等于退出 KeyFlow。** 只有 Tray 的“退出 KeyFlow”会结束进程。

Runtime Core 新增单一 `listenerStatus`，可取 `LISTENING`、`PAUSED`、`ERROR`。Tray 菜单文本和 GUI 顶部状态均读取该状态：暂停会解除当前 global shortcuts，但保留 Profile 和 Binding；恢复会重新注册 Binding。GUI 的暂停按钮调用 Rust command，不维护第二份前端状态。

### 当前平台边界与验证

Tray 使用 Tauri 2 的 `tray-icon` feature、默认窗口图标和原生菜单 API，macOS 会显示为 Menu Bar 图标，Windows 会显示于 Notification Area。当前 `icon.png` 为 512×512 主图标；小尺寸/模板图标的专项视觉微调，以及 Windows Tray 的真实机点击、任务栏隐藏与权限行为，仍需各平台实机验证。

## 2026-09-01：RuntimeProfile Repository 与物理绑定重构

Runtime 不再把 Profile 内部 `slot` 作为物理按键身份。导入一个 Profile v1.2 文件时，Runtime adapter 会按其实际 `bindings[]` 展开为多条本地 `RuntimeProfile`；每条保存完整只读 `sourceProfile`、对应的内部 source binding id、本地显示 name/description 与 Runtime 本地 id。重复导入相同 JSON 仍会插入新的本地记录，不会覆盖已有记录。

Repository 持久化到 app-data `profiles.json`，Binding 持久化到独立 `bindings.json`，且磁盘仅保存 `{ runtimeProfileId, physicalInput }` 数组。启动时会根据 Repository 清除引用已删除 RuntimeProfile 的 Binding，并重建内存 `physicalToProfile` 与 `profileToPhysical` 双向索引。

绑定规则为一对一且 Last Binding Wins：一个新的 `RuntimeProfile → PhysicalInput` 关系会自动释放该输入原有归属，也会释放该 Profile 的旧输入，然后更新两张内存 Map、注册全局快捷键并持久化。按键触发流程为 `PhysicalInput → RuntimeProfileId → RuntimeProfile.sourceProfile 的指定功能 → 当前平台 Execution`。Pause/Resume 改为遍历此新 Binding Map 解除或恢复注册；Tray 和 GUI 继续读取同一 Runtime Core 状态。

## 2026-09-01：Runtime UI / UX 视觉升级

Runtime 默认采用深石墨 Personal Command Deck 视觉：CSS Variables 统一背景、层级 Surface、文字、边框、状态色、圆角与间距；不引入新业务状态。主窗口以 KEYFLOW / Personal Command Deck Header、简洁 LIVE 状态、Command 卡片、实体按键 Keycap 和低权重导入入口构成。

Binding Mode 直接将当前卡片转为 accent 边框与“等待输入”提示；已绑定实体输入呈键帽视觉，未绑定呈命令式“+ 绑定”。更多菜单、重命名和删除使用轻量界面层，删除保留原始 Profile 文件的说明。状态点仅在 LISTENING 时以低频呼吸动画出现，并尊重 `prefers-reduced-motion`。

Runtime 局部 `postcss.config.cjs` 使 Vite 不再继承根项目的 Tailwind 配置，已消除 `Tailwind content missing` 构建警告。

## 2026-09-01：Runtime GUI 参考图收敛、按键捕获与图标选择

主窗口调整为 560×740（最小 500×640）的紧凑桌面工具比例。视觉结构改为深色 Header、KEYFLOW / Personal Command Deck 品牌区、LIVE 状态胶囊、图标化 Profile 卡片、实体 Keycap、底部导入入口。卡片不再使用业务编号；`Space` 使用宽键帽展示，未绑定维持“+ 绑定”命令入口。

绑定捕获监听在 `window` capture 阶段执行。进入绑定前会失焦当前控件，捕获期间阻止默认行为与继续传播，因此 Space 不会再触发按钮 click，而是以 `Space` 作为物理输入提交；Escape 仅取消绑定，不会成为绑定值。

更多菜单从卡片 DOM 层级中抽离，按触发按钮的屏幕坐标渲染为 fixed popover，并配合独立的 click-away layer。菜单不会被相邻卡片或滚动容器覆盖，点击操作和点击外部关闭均属于同一交互层。

`RuntimeProfile` 增加本地可选 `iconId`，以 `serde(default)` 兼容既有 `profiles.json`；导入仍默认无图标并在 GUI 统一显示 Command 图标。图标不从 Profile 业务信息推断。GUI 通过 `set_profile_icon` command 持久化用户在 24 个内置 SVG 图标中选择的结果，保留 `sourceProfile` 只读、Import = Insert 与 Binding/Execution 的既有语义。

## 2026-09-01：Runtime 左右分栏与 Command Tile 网格

Runtime 主窗口调整为 880×640，最小尺寸为 760×540。界面由 176px 的深色 Sidebar 和可滚动的 Main Content 组成：Sidebar 只有 Command Deck、设置以及底部单一监听状态；不引入不存在的账户、设备、云同步或统计模块。

Command Deck 的 Header 保持固定，提供 Profile 数量与导入入口。RuntimeProfile 以三列紧凑 Tile 呈现；当窗口接近最小宽度时自动改为两列。Tile 只包含图标、名称、单行描述、固定底部 Keycap/绑定入口和右上角更多菜单。Profile 较多时仅右侧网格滚动，Sidebar 与 Header 不参与滚动。

Settings 为前端轻量页面状态，不引入路由框架。它仅暴露现有 Runtime 真相：监听暂停/恢复、关闭窗口后继续驻留说明和显式退出。Space capture、Escape cancel、fixed More Menu popover、Icon Picker、Rename/Delete 与所有 Runtime Core 语义不随本次布局变化。

## 2026-09-01：Runtime macOS 原生窗口质感收敛

Runtime 的 Tauri 2 窗口改为 1120×760（最小 900×620），使用 `titleBarStyle: "Overlay"`、`hiddenTitle: true` 与原生 `trafficLightPosition`。窗口仍保留系统 decorations，因此关闭、最小化、缩放/全屏均为 macOS 原生 Traffic Light，不存在 CSS 模拟按钮；前端只在顶部提供不覆盖控件的 Tauri drag region。

视觉层以 Mail/Finder 的空间尺度为参考而不引入其业务结构：Sidebar 调整为 232px、导航行 34px、标题/按钮/辅助文字均收敛，主分栏只保留低对比 1px divider。Tile、菜单、Dialog 与 Settings 面板缩小圆角、边框和内部阴影；Settings 继续限制为最大 480px 的紧凑 Panel，命令 Grid 维持原有模块语义和滚动边界。

## 2026-09-01：Runtime Raycast 风格玻璃材质

不改变既有 Sidebar + Content 结构、窗口尺寸、三列 Command Tile、Header 文案或业务交互，仅重构 CSS token 与表面材质。窗口以深蓝黑和极弱冷紫/冷蓝环境渐变建立统一空间；Sidebar、Content、Tile、Menu、Settings 与 Dialog 使用低饱和半透明 surface、细微高光边缘和受控的 backdrop blur，而非纯黑色块或高饱和霓虹。

新的 token 明确区分 window/sidebar/content 背景、普通/抬升/hover/selected surface、Card surface、subtle border、divider、低饱和 accent 与柔和 LIVE green。卡片 hover 仅增强表面和边缘，不移动布局；Binding 使用克制的蓝紫层次。若系统/WebView 对真实 backdrop blur 支持有限，渐变透明层、内侧 1px 高光与低对比边界仍会提供同等的玻璃层次感。

## 2026-09-01：macOS COPY Profile 执行核查

`keyflow-profile (1).json` 的 Web 输出符合 Profile v1.2 Contract：`binding-key-1` 的 macOS Execution 为 `SEND_HOTKEY`，keys 为 `META`、`C`。Runtime 解析只按 `executions.macos` 与 Execution.type 分发，不依赖 `commandId: COPY`；`SendHotkeyExecutor` 将其按 Meta press → c press → c release → Meta release 的顺序交给 enigo。新增单元测试固定验证此 Contract 映射。

该 JSON 只包含逻辑 Slot `KEY_1`，没有物理键映射；导入后 Runtime 会创建本地 RuntimeProfile，用户仍需在 GUI 为“复制”绑定一个实体输入，才能注册 global shortcut。此行为是已冻结的 RuntimeProfile ↔ PhysicalInput 模型，不是 Web 导出遗漏。macOS 最终真实复制仍依赖运行 KeyFlow 二进制获得系统“辅助功能”权限，以及触发时目标 App 中确有可复制的选区；Terminal/System Events 的授权不能替代对 KeyFlow Runtime 自身的授权。

## 2026-09-01：macOS 全局快捷键与跨应用执行审查

### 结论与边界

KeyFlow 不是 Electron；它使用 Tauri 2 的 `tauri-plugin-global-shortcut`，在 Rust Runtime 进程中创建 `GlobalHotKeyManager`。渲染层唯一的 `window.addEventListener("keydown")` 仅在 GUI Binding Mode 下捕获“下一次输入”以建立 Binding；绑定完成后不承担命令触发。因此代码并非把已绑定命令依赖于 WebView 焦点。

全局 Binding 的生命周期为：启动时从 `bindings.json` 载入并 `refresh_listener`；bind/rebind/unbind 通过 `commit_bindings` 先 unregister-all 再注册整份候选状态；Pause unregister-all；Resume 重新注册；显式退出解除所有注册。Window close 被 `prevent_close` 后 hide，Tray 与 Runtime Process 保持，因此关闭主窗口不应停止全局注册。

### 已确认缺口

操作系统或其他应用占用快捷键时，插件 `register` 会返回错误，Runtime 会进入 `ERROR` 并回滚旧注册，但启动路径用 `.ok()` 丢弃具体错误，GUI bind 路径也只显示“无法绑定此按键”；没有针对 Profile 的“快捷键不可用/冲突原因”状态。`SEND_HOTKEY` 使用 enigo 模拟键盘；其错误写入 `last_error`，但前端未显示 `RuntimeSnapshot.lastError`。因此当前实现不能从 GUI 区分“全局事件未到达”和“事件已到达但 macOS 拒绝向其他 App 注入输入”。

### 最小修复建议（未在本审查实施）

1. 将注册结果按 PhysicalInput 持久化为 GUI 可读状态，并展示系统占用/解析失败的具体原因；启动恢复也不得吞掉注册错误。
2. 在 global callback、Profile dispatch 与 enigo 执行失败处写入结构化本地日志/最近执行状态，以便定位 A（捕获）与 B（跨应用自动化）。
3. 在 Settings 明确显示 KeyFlow Runtime 自身的 macOS 辅助功能授权状态和可操作指引。未获授权时，不应把跨应用复制失败表现为静默无反应。

### 后续最小诊断实现

为区分实际问题 A/B，Runtime 现将全局快捷键回调写入 `lastEvent`：收到 Binding 时先记录“已收到全局快捷键 <PhysicalInput>”，所有 Execution 成功后记录“命令执行完成”；enigo/平台执行失败则记录“已收到快捷键，但命令执行失败”及原始错误。每次状态变化通过 Tauri event 通知前端，Settings 的“快捷键诊断”显示最近全局事件与最近命令结果。该改动不改变 Binding、Profile、Execution 或系统调用语义，仅提供可验证的运行证据。

### 受控后台验证（待真实键盘复核）

在当前 macOS app-data 的 `bindings.json` 中，复制 RuntimeProfile 的实际持久化 PhysicalInput 为 `F10`，不是口述的 F8。受控流程将 KeyFlow Runtime 运行于后台、TextEdit 放到前台，选中临时文本后通过 System Events 合成 F10；随后剪贴板未得到测试文本。该结果只能证明此合成路径没有完成复制，不能证明真实 F10 的全局捕获失败：macOS 全局 hotkey API 可以忽略由 System Events/Quartz 合成而非实体键盘产生的事件。下一步必须使用实体 F10 触发，并从 Settings 的新增诊断读取 A（未收到全局快捷键）或 B（已收到但 enigo 失败）的具体证据。

### 当前版本启动核验

曾经运行的实例来自 `/Volumes/dmg.../KeyFlow Runtime.app`，不是源码的开发构建；单实例插件会把新的 `tauri dev` 启动转交给该旧实例，因而旧实例不会具备新增的诊断代码。正常退出该实例后，当前源码构建已实际启动，并在 app-data 的 `runtime-diagnostics.log` 写入“已注册 1 个全局快捷键”。这证明 F10 已被 macOS `RegisterEventHotKey` 成功接受，而不是在注册阶段静默失败。

底层 `global-hotkey 0.8.0` 的 macOS 实现使用 Carbon `RegisterEventHotKey` 与 application event target；`F10` 解析为 `Code::F10`，扫描码为 `0x6d`，映射无误。仍缺少的是一次实体键盘触发后日志中的“已收到全局快捷键 F10”：没有该行时，问题位于 macOS 事件投递/键盘层；有该行但随后命令失败时，问题位于 enigo 的跨应用注入层。合成键盘事件不能作为该分界的替代证据。

### 实体 F10 复核与 COPY 解析结论

实体 F10 已在 ChatGPT 前台场景触发多次；`runtime-diagnostics.log` 每次均记录“已收到全局快捷键 F10”，紧接着记录“已收到快捷键，命令执行完成”。因此全局监听、Binding 查找、RuntimeProfile 定位、Profile v1.2 的 macOS Execution 选择和 Dispatcher 调用均已被真实运行证据覆盖，问题不在 F10 监听。

COPY 的 `META` 也不存在 macOS 解析错误：Profile keys 是 `["META", "C"]`，Runtime 转成 `Key::Meta` 和 `Key::Unicode('c')`；enigo 0.2.1 的 macOS 后端明确将 `Key::Meta` 映射为 `KeyCode::COMMAND`，即左 Command。按键顺序为 Command down、C down、C up、Command up，符合复制语义。

根因是 enigo 的 macOS `CGEventPost` API 没有返回“目标应用已接受事件”的结果；旧代码把 key event 已提交给 CoreGraphics 误报为“命令执行完成”。Runtime 现会在 `SEND_HOTKEY` 前直接调用 macOS `AXIsProcessTrusted()`；若当前实际运行的 KeyFlow 二进制没有辅助功能权限，则返回明确错误而非假成功。注意 `/Volumes/dmg...` 的旧 App 与 `target/debug/keyflow-runtime` 的开发二进制不是同一个可直接互相证明授权的运行实体，必须以当前正在运行的二进制的检查结果为准。

### 授权复核与注入层结论

在加入 `AXIsProcessTrusted()` 检查后再次以实体 F10 触发，诊断没有出现辅助功能拒绝错误，仍显示 F10 已收到且 `SEND_HOTKEY` 已返回。故当前开发二进制已通过该 macOS 授权检查；不能再把本次“未复制”归因为未授权或 `META` 键解析错误。

enigo 0.2.1 的 macOS 实现对每个按下/释放事件调用 `CGEvent::new_keyboard_event(...).post(CGEventTapLocation::HID)`，投递 API 本身没有成功/失败返回值。它无法证明 ChatGPT 已执行复制；该库也存在公开的 macOS 修饰键组合兼容性问题。当前需要替换或补强的是 macOS 跨应用输入注入实现，并以 TextEdit/ChatGPT 的真实选区验证，而不是继续调整 Profile 的 `["META", "C"]` Contract 或 F10 global shortcut。

### 后续解决方向：不依赖 enigo

KeyFlow 不必依赖 enigo。macOS 适配层应改为直接封装 CoreGraphics：以目标应用前台 PID 构造 `CGEvent`，为 C down/up 显式设置 Command modifier flag，并经 `CGEventPostToPid`（或经验证的 HID post）投递；每次事件创建、投递目标 PID 和辅助功能状态均写入诊断。这样可消除 enigo 对修饰键状态与投递结果不可观察的黑箱。

实体按键监听也应作为独立 macOS backend 评估：现有 Carbon `RegisterEventHotKey` 已证明能收到 F10，但它只适合已注册组合，不能提供原始键事件的可消费语义。若产品需要稳定地阻止 F10 同时触发前台应用功能，应使用获辅助功能授权的 `CGEventTap`，在 KeyDown/KeyUp 命中 Binding 时消费事件，再异步调度 RuntimeProfile。该替换只改变平台输入适配层，不改变 RuntimeProfile、Binding Map 或 Profile v1.2 Contract。

## 2026-09-01：C 端双平台输入执行策略评估（未实施）

### 共同结论

“跨平台”不等于底层输入 API 必须只有一套。KeyFlow 可继续共用 Contract、ProfileRepository、Binding Map、Dispatcher、Tray/Window 生命周期和 Runtime Snapshot；需要分平台的仅是很薄的 `InputBackend`：全局输入注册/消费与 `SEND_HOTKEY` 注入。这个边界约占当前 Runtime 代码很小的一部分，不会造成两份 Runtime。

### 三条路径与估算

1. **直接修补/长期 fork enigo 0.2.1：不建议。** 现版本无法观测目标应用是否接受 `CGEventPost`，要修复 Command flag、事件状态、目标 PID 等能力将把 KeyFlow 变成 enigo 的私有维护者；首轮约 3–6 人日，后续需持续跟随上游，且仍不能保证跨 App 行为。
2. **升级 enigo 并做严格的时间盒验证：优先的第一步。** 当前锁定 `0.2.1`，而上游后续版本公开记录了 macOS 修饰键状态、物理键盘状态和辅助功能检查的修复。升级/适配预计 0.5–1 人日，macOS/Windows 的真实应用矩阵验证预计 1–2 人日。若在规定矩阵中稳定，可保留 enigo 作为共享默认 backend；若失败，立即停止继续 patch，不投入 fork。
3. **建立平台适配层：C 端产品的长期落点。** macOS 以 CoreGraphics/Accessibility（必要时 `CGEventTap`）实现，Windows 以 `SendInput` 实现；各自报告权限、完整性/安全桌面和注入计数等系统事实。适配接口与诊断约 0.5–1 人日，macOS 注入与真实验证约 2–3 人日，Windows `SendInput` 与 UAC 诊断/验证约 1.5–2.5 人日，总计约 4–6 人日。若还要求物理 F-key 被稳定消费、不传递给前台应用，macOS event tap 另加 2–3 人日；Windows low-level hook 另加 1.5–2.5 人日。

### 推荐决策与门槛

不应现在就做两套完整的监听和执行；先保留 Tauri global shortcut（当前 F10 证明其可捕获），做 enigo 最新版升级 spike。验收矩阵至少包含 TextEdit、Chrome/ChatGPT、Finder、IDEA/VS Code 以及中英文输入法，且测试 dev 与签名安装包；每项覆盖前台/后台触发、复制、键释放、暂停/恢复。任一核心目标 App 仍出现“回调已到但复制无效”或修饰键串扰，就停止 enigo 方案，落地 macOS 原生注入 adapter；Windows 先继续使用经矩阵验证的 enigo，只有出现 Windows 输入缺陷时才替换为 `SendInput`。这种渐进路径把一次性成本控制在约 2–3 人日的验证，失败时再增量投入 macOS 2–3 人日，而非一开始承诺两套完整实现。

无论选择哪条路径，均无法在 macOS 安全桌面、受保护输入框、Windows UAC 高完整性目标等系统边界上承诺“所有 App 必然可控”；C 端产品应将这些状态明确反馈给用户，而非静默成功。

### 2026-09-01：enigo 升级 spike 已开始

按决策先实施最低成本验证路径：Runtime 的 `enigo` 依赖从 `0.2` 升级至当前稳定版 `0.6.1`。当前 Rust 工具链为 `1.98.0`，高于该版本要求的 `1.85`；既有 `SEND_HOTKEY` 调用 API 无需适配。`cargo check`、`cargo test`（4/4）、`npm run typecheck` 和 `npm run build` 已通过，并已以干净的 `tauri dev` 重启运行升级版本。

此次升级只改变依赖锁定和底层输入实现，不修改 Profile v1.2 Contract、RuntimeProfile、Binding、快捷键生命周期或 UI。后续必须以实体输入在真实目标 App（TextEdit、Chrome/ChatGPT、Finder、IDEA/VS Code，中英文输入法）中完成验证，不能用编译成功替代跨应用复制证据。

升级验证期间曾在多次人工停止进程、安装版/开发版交替启动的测试环境中观察到 app-data `bindings.json` 为一个空数组，而 `profiles.json` 完整保留。该单一样本尚未在正常用户操作中复现，不能定性为 Runtime 的 Binding 丢失 Bug，也不能归因于 enigo 升级。为继续既定验证，已仅恢复此前已存在的“复制”RuntimeProfile (`rp-1788229480936-0-0`) → `F10` 绑定；未修改任何 Profile 或 Execution 数据。恢复后，enigo 0.6.1 运行实例的诊断确认“已注册 1 个全局快捷键”。

### 验收隔离修正

一次“F10 已收到但缺少辅助功能权限”的日志来自 `/Applications/KeyFlow Runtime.app` 安装实例，而不是 enigo 0.6.1 的源码进程；单实例机制曾把源码启动请求转交给安装实例。该日志只能说明安装版未获授权，不能作为升级后 enigo 行为的验收结论。已正常退出安装版并确认当前运行路径为 `runtime/src-tauri/target/debug/keyflow-runtime`，且其启动日志为“已注册 1 个全局快捷键”。后续实体 F10 / ChatGPT 复制结果才是有效的升级验收样本。

### enigo 0.6.1 当前 macOS 样本

在隔离后的源码实例中，实体 F10 连续触发均记录“已收到全局快捷键 F10”与“已收到快捷键，命令执行完成”，没有出现辅助功能拒绝。该样本证明新版执行链可完成调用；是否构成端到端通过仍以“F10 后粘贴板内容确为前台应用选区”为准。手动 Command-C/Command-V 无需 KeyFlow 自动化权限，不能单独证明 Runtime 的跨应用输入能力；对新用户机器仍必须保留权限检查与清晰错误反馈。

### 建议的下一阶段顺序

1. 固化 enigo 0.6.1，先补真实验收矩阵与 dev/安装包的实例隔离；不再修改 InputBackend。
2. 将测试环境中出现的空 `bindings.json` 记录为待复核项，在正常重启、第二实例和异常退出场景补一轮持久化回归；未复现前不作为已确认缺陷或阻塞项。
3. 制作签名安装包，并仅对安装包进行 macOS 权限、后台驻留、窗口关闭后快捷键、F10 复制的完整验收。开发二进制和 `/Applications` 包不得混用作为同一验收对象。
4. 在 macOS 验收稳定后，在 Windows 先验证 enigo 0.6.1 的 `SEND_HOTKEY` 与 Tauri global shortcut；只有出现真实缺陷时才引入 `SendInput` adapter。
5. 最后再进入新能力（更多 Primitive、上下文、开机自启等），避免把不稳定输入层固化到上层产品功能。

## 2026-09-01：Runtime UI 与绑定交互细节收敛

本轮未改变 Profile、RuntimeProfile、Binding Map 的业务语义。Settings 页面改为同一视觉层级的 Runtime 状态 Hero、分组 Panel 与低权重危险区；通知从 Header 右上角移至窗口右下角的临时 Toast，不再与“导入 Profile”竞争；右上角更多按钮点击后保持 active 状态，所在 Command Tile 同步保持轻量选中边框，关闭菜单才恢复。

绑定模式新增 Runtime 级 capture gate：点击绑定/重新绑定时，先解除现有全局快捷键注册并进入“等待新的实体按键”状态，防止待绑定的 F10 等旧快捷键先执行原 Profile。前端收到键后调用既有 `bind_key`；BindingState 的 Last Binding Wins 会原子释放该 PhysicalInput 原先所属 Profile，再把它绑定给目标 Profile，最后重新注册完整的最新 BindingState。取消绑定模式会恢复原注册。该方案限制于主窗口正在进行绑定捕获的现有交互范围；未引入原始系统级 input tap。

若改绑提交因无效按键或系统注册失败而失败，前端会显式调用取消 capture 的 Runtime command 恢复上一份全局注册；不会让 Runtime 因一次失败操作持续处于未注册状态。

## 2026-09-01：窗口缩放与拖动区适配

窗口继续保留 Tauri 的 900×620 最小尺寸，但内容不再依赖固定三列/两列的窗口宽度断点。Command Grid 改为按实际主内容区自动在 210px 最小 Tile 宽度下增减列数；Header 和滚动区 padding 使用 `clamp()`，在较窄窗口收敛留白；Settings Hero 在较窄尺寸自动改为纵向排列，避免状态胶囊挤压标题。

此前顶部拖动区是透明的 44px 覆盖层，在 Overlay title bar 下没有可辨认视觉，容易被误认为失效。自绘 drag region 和模拟的 `grab/grabbing` 反馈已删除。窗口改为 Tauri/macOS `titleBarStyle: "Transparent"`：保留系统原生标题栏、Traffic Light 与顶部拖动行为，同时让原生标题栏显示 KeyFlow 的深石墨窗口背景 `#10121a`。这不使用 Overlay，因此不会重新引入“窗口未聚焦时拖动失效”的自绘拖动区问题；原生顶部只能稳定使用单色/系统材质，应用正文仍保持既有深色 UI。

验证：`npm run build` 与 `cargo check` 通过。需要在 Tauri 主窗口人工验证最小尺寸、两/三列切换和拖动区域是否符合 macOS 手感。

验证：`cargo check`、`cargo test`（4/4）、`npm run typecheck` 与 `npm run build` 全部通过。视觉效果需在重启后的 Tauri 窗口中人工复核 Settings、Toast、更多按钮选中态和“F10 从 A 改绑到 B 时 A 不执行、B 获得 F10”场景。

## 2026-09-01：RuntimeProfile GUI 闭环与重启恢复

GUI 的 Profile 卡片仅显示名称、描述与实体按键状态；通过轻量“更多”菜单可执行绑定/重新绑定、解除绑定、改名和删除。改名通过本地 RuntimeProfile command 完成，删除有确认且只删除本地 Repository 记录；所有 import、bind、unbind、rename、delete 成功后统一重新读取 RuntimeSnapshot。

启动恢复从 `profiles.json` 加载 Repository，再从 `bindings.json` 加载 Binding。孤儿 Binding 会被过滤，磁盘异常的重复 PhysicalInput 按文件顺序 Last Binding Wins 重建双向 Map，并立即把清理后的 bindings.json 写回。PAUSED 不持久化，启动一律恢复为 LISTENING 并注册有效按键。

## 2026-09-01：Tray 主入口操作补充

Tray/Menu Bar 的主操作明确为“显示主界面”和“退出 KeyFlow”。左键点击图标会显示并聚焦现有主窗口；菜单中的“显示主界面”走同一个 WindowController 路径。退出继续走统一 `quit_keyflow()`，不是 Window CloseRequested。

## 2026-09-01：Companion Runtime 设计对齐审查

Companion Runtime 是桌面壳层的参照，不是 KeyFlow 的业务实现来源。Companion 的链路是外部事件到角色行为；KeyFlow 的链路是实体输入到 Profile Execution。因此 KeyFlow 不引入 Behavior/Event 总线、Character Registry、桌宠窗口或 Electron 依赖。

应对齐的是壳层纪律：Companion 将启动、单实例、Tray 生命周期、窗口显示/隐藏及有序退出收敛为 LifecycleManager、WindowManager 与 TrayManager，并为这些边界定义可替换接口和测试。KeyFlow 已具备相应能力，但当前编排仍主要集中在 `src-tauri/src/main.rs`。

后续对齐顺序是：抽出不改变 Binding/Execution 语义的 RuntimeLifecycleController；让 `window.rs` 成为唯一 show/hide/focus 入口；让 `tray.rs` 完整拥有 Tray create/destroy/菜单刷新；补齐 lifecycle 退出顺序与失败回滚测试；增加最小结构化本地日志记录启动、Tray、快捷键注册、暂停/恢复、退出。不记录业务 Execution 内容或敏感 Profile 数据。

## 2026-09-01：Runtime 常驻壳能力补全

Runtime 使用官方 `tauri-plugin-single-instance` 作为最先初始化的插件；第二次启动不会初始化 Tray 或 Global Shortcut，而是唤醒并聚焦既有主窗口。Tray handle 被保存在 Tauri managed state，和应用同生命周期，窗口 hide/show 不会销毁 Menu Bar/System Tray 图标。

退出路径统一为 `quit_keyflow()`：先标记 `AppLifecycle` 为 Quitting，再解除全局快捷键、保存 Repository 与 Binding Store，最后 `app.exit(0)`。Window CloseRequested 只有非 Quitting 状态才 prevent-close 并隐藏窗口，因此关闭窗口不等于退出 KeyFlow；Tray 与 GUI 的“退出 KeyFlow”均走显式退出路径。

## 2026-09-01：Studio 第二阶段按键配置 UX 审查（实施前）

### 当前配置与执行链路

Studio 当前路由为 `/`、`/apps`、`/commands`、`/mapping`、`/export`，左侧导航没有主入口与高级管理分组。`/mapping` 同时展开六张完整表单；每张表单要求填写非空 `KeyBinding.name`，Action 只能从既有 App Registry 或 Command Registry 中选择。因此空白 KEY 配置一个未预置快捷键的现有流程是：先在 `/commands` 创建 `CommandDefinition`（ID、名称、平台快捷键），再到 `/mapping` 填写功能名称并选择该 Command。预置的 COPY 等命令可省略第一步，但仍需理解 Command 与逻辑按键。

Studio 的单一事实源仍是三项浏览器 localStorage：`keyflow.currentProfile`、`keyflow.commandRegistry`、`keyflow.appRegistry`。`profileStore.addCommands` / `addApps` 把 Registry 定义编译为带平台 `executions` 的 `COMMAND` / `OPEN_APP` Action 并追加到 `Profile.bindings[].actions`；删除和上下移动直接修改同一有序数组。每次 Profile 变更同步调用 `localStorage.setItem` 并更新时间，但当前写入函数不返回结果，也没有保存中、成功或失败状态。

导出时 `compileProfile` 会再次用当前 Registry 刷新 Action execution，随后执行 Zod 与业务校验并下载 Profile v1.2 JSON。Studio 没有调用 Runtime Tauri command，也不会主动更新已导入的 RuntimeProfile。Runtime 仅通过 `load_profile` 读取用户选择的 JSON，把每个 source binding 展开为独立本地 RuntimeProfile，另以 `bindings.json` 保存 RuntimeProfile 与实体按键的一对一关系。实体按键触发后，Runtime 走 `PhysicalInput → RuntimeProfileId → sourceBindingId → actions 原顺序 → 当前平台 execution → LAUNCH_APP / SEND_HOTKEY`。当前执行器遇到第一个失败即返回，不继续后续 Action。

### 新页面复用方案

新增 `/setup` 的“按键配置”作为 orchestration layer 即可，Profile Contract、Binding Map、RuntimeProfile 与 Rust 均无需修改。页面使用 Master / Detail：左侧紧凑展示六个 KEY 的推导名称与 Action 摘要，右侧只编辑当前 KEY。旧 `/apps`、`/commands`、`/mapping`、`/export` 保留，并在导航中归入低权重的“高级管理”。

可直接复用：`@keyflow/contract` 的 `Profile`、`KeyBinding`、`Action`、`CommandDefinition`、`KEY_CODES` 与 Schema；三个 Zustand store；`createOpenAppAction`、`createCommandAction`、`compileProfile` 和业务校验；现有 `AppPicker` 的筛选思路；Action 有序数组的删除和上下移动能力。`CommandEditor.HotkeyField` 目前是文件内私有组件且依赖手选 key，不适合直接复用，应提取或新增面向按键捕获的快捷键编辑器。现有 Picker 文案暴露 Registry/Action 内部模型，也应由面向用户意图的新 Picker 包装，而不是原样嵌入。

第一版只展示 Runtime 真实支持的两类用户动作：键盘快捷键（内部为 `COMMAND → SEND_HOTKEY`）和打开软件（内部为 `OPEN_APP → LAUNCH_APP`）。打开网址、输入文本和任意 shell 命令没有当前 Contract/Runtime primitive 支持，不能展示。功能名称默认从首个 Action 推导：已知快捷键优先匹配 COPY/PASTE 等 Registry 名称，打开软件使用“打开 + 软件名”，其他快捷键使用格式化组合键；自定义名称与说明放入“更多设置”。由于 Contract 仍要求 `binding.name` 非空，未配置项保留稳定默认名，首次添加动作时写入推导名即可，无需修改 Schema。

直接创建自定义快捷键时，orchestration 必须同时在现有 Command Registry 中创建或复用 `CommandDefinition`，再通过现有 `COMMAND` Action 写入当前 binding；不能只写一个游离 Action，否则导出业务校验会因 Registry 缺失而失败，旧命令库也无法读取。建议为页面生成的命令使用稳定的内部 ID/来源标识策略，并以“相同跨平台 execution”查重；编辑由该页面独占的生成命令时可原位更新 Command 与引用 Action，若命令被多个 binding 引用则应复制后再编辑，避免隐式改变其他 KEY。清空 KEY 只清空该 binding 的 actions，并恢复默认展示名；是否删除已无引用的页面生成 Command 必须限定为可证明由 setup 创建且全局零引用，用户手建命令不得级联删除。

为满足真实保存反馈，建议新增一个 store 级 orchestration 操作，把“Command upsert + binding action/name 更新”作为一次受控操作执行，捕获 localStorage 配额/安全异常并向页面返回 success/error。浏览器 localStorage 不提供真正跨 key 事务，因此需要先构造并校验 next commands/profile，再写入；若第二次写入失败应回写原快照并报告失败。普通查看、删除、排序仍操作现有 Profile，不创建第二套 setup state。

### 兼容性与风险

- 新旧页面读取同一 Zustand store 与 localStorage key，可实现页面级双向可见；不得新增 `setupBinding` 或第二份配置文件。
- `CommandDefinition.executions` 与已写入 Action 的 `executions` 是重复快照；Registry 更新后旧页面不会立即刷新既有 Action，只有导出编译会刷新。新页面编辑生成命令时应同时更新当前 Action，跨页面一致性则以导出编译结果为最终准绳。
- 当前 `addCommands` 按 `commandId` 阻止同一 binding 重复，但不能阻止不同 ID 的等价快捷键。setup 需按 execution 查重或明确允许重复动作。
- Action 顺序已由数组和上移/下移支持；新页面应保留，不需要拖拽。
- 当前只有一个浏览器 Profile，没有“当前 Profile 选择”问题；未来多 Profile 不能由本轮提前虚构。
- `writeStorage` 除同步写入外没有保存状态，且写失败会直接抛出；新页面必须显示失败，不能只做瞬时“已保存”视觉。
- Studio 没有 Runtime reload API。新页面保存后只能说明“Studio 配置已保存”，运行生效仍需导出并在 Runtime 导入；同一 JSON 重复导入当前是 Insert，会产生新的 RuntimeProfile，而不是覆盖旧记录。
- Runtime import 会为 Profile 中全部 bindings 建立 RuntimeProfile，包括 actions 为空的 binding；清空 Web KEY 不会自动删除 Runtime 已导入的旧 RuntimeProfile，也不会解除其实体绑定。
- 快捷键冲突目前只存在 Runtime 的实体物理按键注册冲突；Studio 配置的是输出快捷键，没有现成冲突检测 API，第一版不应伪造检测结果。
- 平台 execution 可以仅含 Windows 或 macOS；编辑器必须清楚显示平台覆盖情况。缺少当前平台 execution 时 Runtime 返回 `UNSUPPORTED_PLATFORM`。
- macOS `SEND_HOTKEY` 依赖当前 Runtime 二进制的辅助功能权限；Windows 系统行为仍需真实机验证。Web build 或 Schema 通过不能替代 Runtime 实机执行证据。

### 实施边界与建议验收

本阶段建议改动限于新页面、导航、新的 setup 组件/摘要工具与 store orchestration，不改 Contract 和 Rust。编码后的 Case 1–5 应分层记录：页面交互与 localStorage 可由浏览器实际验证；导出 JSON 可由 Schema/构建测试验证；旧页面互读可由同一浏览器会话验证；Runtime 执行、Runtime 中旧记录清理、macOS/Windows 行为必须通过手工导出导入和真实按键执行验证，未执行时标记“待确认”，不能写成已闭环。

## 2026-09-01：Studio 第二阶段按键配置 UX 实施

### 新入口与用户交互

Studio 新增 `/setup` 一级入口“按键配置”，采用 320px 紧凑 KEY 列表与单 KEY Detail。左侧显示推导名称、组合键或动作数量；右侧只展示当前 KEY 的有序 Action，支持添加、点击编辑、删除及上下移动。“软件库 / 命令库 / 逻辑按键”保留并归入“高级管理”，没有删除一期入口。

添加动作仅展示当前 Runtime 已支持的“键盘快捷键”和“打开软件”。快捷键可直接捕获组合键，并提供复制、粘贴、剪切、撤销、重做、全选、保存七个稳定快捷入口；除这七类外只生成“快捷键 + 可读组合”的摘要，不引入大型语义字典。打开软件继续使用现有 App Registry。自定义名称和说明收进“更多设置”，空 KEY 首次添加动作时自动推导名称。

页面反馈固定为“正在保存…”、“已保存到当前配置”或具体失败信息；页面底部明确提示“配置保存在当前浏览器；需要导出 JSON 并在 Runtime 手动导入后才会生效”。未使用“已应用”或“已生效”。

### Registry 编排与清理边界

`CommandDefinition` 当前没有 metadata/source 字段，本轮没有修改共享 Contract。setup 首先按完整跨平台 executions 复用等价既有 Command；没有等价项时，以 `SETUP_<时间片>_<随机片>` 创建 Registry Command。该前缀是 Studio Registry 层的最小来源标记，不进入 Runtime 判定逻辑。

每次 setup 写入会先使用现有 Zod Schema 校验完整 next Profile 与 next Command Registry，再依次写原有 `keyflow.commandRegistry` 和 `keyflow.currentProfile`；第二次写入失败时恢复两项原快照并显示错误。页面没有第二份 setup state 或 setup 文件。

删除 Action 或清空 KEY 后，只清理同时满足 `command.id` 以 `SETUP_` 开头且全 Profile 零引用的 Command。COPY/PASTE/SAVE 等既有命令以及用户从旧命令库创建的任何非 `SETUP_` 命令均不会被自动删除。清空 KEY 会把名称恢复为稳定的“按键 N”、移除说明和全部 Actions，但不会触碰其他 KEY。

### 当前验证记录

- 静态验证：根项目 `npm run typecheck` 与 `npm run build` 均通过；Vite 生产构建生成成功。
- Case 1：浏览器从空白 KEY 2 进入 Action Picker，选择键盘快捷键与“复制”，保存后左侧显示“复制 / ⌘C”，当前区显示“已保存到当前配置”，无需访问命令库或填写名称。
- Case 2：点击 KEY 2 的既有快捷键，在当前详情改为“粘贴”后保存，左侧与详情同步显示“粘贴 / ⌘V”。
- Case 3：`clearSetupBinding` 已实现为单次校验、写入和零引用 setup Command 清理；浏览器删除验收尚待用户确认清理本轮临时测试数据。
- Case 4：在 KEY 2 的粘贴后追加 Google Chrome，页面显示两个有序动作，导出统计与 JSON 均包含两个 Action。
- Case 5：setup 创建的 KEY 2 在旧逻辑按键页可见为“粘贴 + Google Chrome”；旧逻辑按键页为 KEY 3 添加 SAVE 后，setup 立即显示“保存 / ⌘S”。导出页通过 Profile v1.2 Schema 与业务校验。
- 来源标记：通过 setup 为 KEY 4 创建与现有 REDO execution 不等价的“重做”，旧命令库实际显示 `SETUP_` 前缀 ID，证明自动命令与手工命令可区分。

上述浏览器验证只证明 Studio localStorage、旧页面互读和可导出 JSON 闭环。Runtime 没有被修改或调用；“导出 JSON → Runtime 手动导入 → Runtime 绑定实体按键 → 实际执行”仍是独立人工链路，不能由本轮 Web 验证替代。

### 2026-09-01：快捷键录入方案纠偏

首次实施曾让 `/setup` 捕获一次本机组合键，并通过 `META ↔ CTRL` 替换生成另一平台 execution。复核后确认该推断只对少量常见快捷键成立，无法代表通用跨平台配置；例如项目现有 REDO 的 macOS 是 `META + SHIFT + Z`，Windows 是 `CTRL + Y`，机械转换会错误生成 `CTRL + SHIFT + Z`。因此已移除 `HotkeyDialog`、常用硬编码按钮和 setup 自动生成 Command 的入口。

当前 `/setup` 的“键盘快捷键”改为联动现有 Command Registry：只列出已启用命令，以面向用户的动作名称、说明、macOS 组合和 Windows 组合展示；支持搜索、分类、单选替换和多选追加。用户选择后直接通过 `createCommandAction(command)` 复用该 Command 已明确配置的双平台 executions，不录入、不推断、不改写平台快捷键。命令库是快捷键平台配置的唯一事实源，`/setup` 只负责“KEY 选择什么动作”的编排。

`SETUP_` 前缀识别与零引用清理仅为兼容首次实施期间已经产生的数据保留；当前 UI 不再创建 `SETUP_` Command。旧命令库手工创建的非 `SETUP_` 命令仍不参与自动清理。

浏览器只读复核确认选择器会显示真实差异：COPY 为 macOS `⌘C` / Windows `Ctrl+C`，现有 REDO 为 macOS `⌘⇧Z` / Windows `Ctrl+Y`。根项目 `npm run typecheck` 与 `npm run build` 在纠偏后再次通过。

### 2026-09-01：Profile Binding 改为按需新增与删除

此前 `defaultProfile()` 会固定创建 KEY_1～KEY_6 六条 Binding，即使用户只配置一个按键，导出 JSON 仍携带五条空 Binding；Runtime 的 Import = Insert 会按 source bindings 全量展开，因此空 Binding 也会产生无动作 RuntimeProfile。

当前不修改 Profile v1.2 的 `KEY_1…KEY_6` Slot Contract，只改变 Profile 中实际 Binding 的数量：新 Profile 默认 `bindings: []`；`/setup` 提供“新增按键”，从尚未使用的 Slot 中选择编号最小的一项加入当前 Profile；“删除按键”从当前 Profile 移除整条 Binding。用户维护几条，Studio Profile 就保存几条，最多仍受当前六个逻辑 Slot Contract 限制。

读取历史 localStorage 时，仅自动移除同时满足“actions 为空、没有 description、名称仍为默认按键 N”的占位 Binding；已有动作、自定义名称或说明的 Binding 保留。该兼容收敛避免历史默认空项继续进入后续导出，同时不删除有用户信息的配置。

导出编译增加第二道边界：`compileProfile` 只编译 `actions.length > 0` 的 Binding。因此用户刚新增但尚未选动作的草稿不会进入下载 JSON，Runtime 手动导入时也不会再为它创建空 RuntimeProfile。Studio 保存成功仍只表示“已保存到当前配置”，Runtime 生效继续要求手工导出、导入与实体按键绑定。

验证：纠偏后 `npm run typecheck` 与 `npm run build` 均通过。浏览器中的历史空 Binding 清理和删除操作会改变当前 localStorage，本轮未在未经确认的情况下主动执行删除型浏览器验收。

## 2026-09-01：Runtime Settings 紧凑布局与侧栏退出入口清理

Runtime 的 Settings 主区域不再固定为左侧 680px 的单列。正常桌面宽度使用最大 840px 的双列网格：状态概览横跨全宽，运行状态与快捷键诊断并排，应用退出区横跨全宽；这样保留现有信息层级，同时消除右侧大面积无意义留白。窗口宽度不足 980px 时自动退回单列，卡片、按钮与文字不会因拖窄而挤压。

Sidebar 中仅保留运行状态；已移除设置页条件渲染的底部退出按钮及对应样式，避免正常窗口尺寸下不可见、但在极端高度下出现的隐藏操作入口。显式退出仍由 Settings 的“应用”区域和系统托盘菜单提供，产品的常驻/退出边界不变。

## 2026-09-01：Runtime 系统内置与外部导入 Profile 分层

Web 当前不存在可由桌面安装包读取的“启用 Profile 列表”：它只有浏览器 localStorage 中的一份当前 Profile；带 `enabled` 状态的是内置命令库。因此 Runtime 将 Web 当前八个启用的跨平台命令（复制、粘贴、剪切、撤销、重做、全选、保存、查找）固化为随安装包提供的 `builtin-profile.json`，启动时以稳定 `system-builtin-*` RuntimeProfile id 补齐。这些 Profile 的 Execution 直接来自 Web 命令定义，仍是 Profile v1.2 的 `SEND_HOTKEY`，没有新增 Contract 或 Runtime Primitive。浏览器中用户临时配置无法被桌面进程直接读取，仍应通过 Web 导出 JSON 后进入外部导入流程。

`RuntimeProfile` 新增持久化本地字段 `source`，仅取 `SYSTEM` 或 `EXTERNAL`；`serde(default)` 将旧 `profiles.json` 记录兼容为 `EXTERNAL`。系统 Profile 在启动时去重补齐、不会重复插入；Repository 拒绝删除系统项，GUI 的系统内置卡片也不显示删除菜单。外部导入维持 Import = Insert，仍可单项删除，并增加“管理外部”模式：可多选外部项、确认后批量删除。批量删除只接受 Repository 仍判定为 `EXTERNAL` 的 id，因此 GUI 状态不能绕过后端保护；删除前会解除关联实体按键，保留原始 JSON 文件不变。

验证：`cargo check`、`cargo test`（5/5）、`npm run typecheck` 与 `npm run build` 通过。首次启动实际窗口时应确认八个内置卡片均出现、外部卡片可进入批量管理、系统卡片无删除入口，以及一次外部删除后其物理绑定被同步解除。

## 2026-09-01：Runtime Deck 滚动与窗口缩放视觉验收

实际 Tauri 窗口验收覆盖 900×620 最小尺寸、1120×760 默认尺寸与 1400×900 放大尺寸。最小尺寸使用两列 Tile，默认尺寸使用三列；放大后按可用主内容区继续扩展卡片宽度与列数。原实现将 Grid 和分组标题限制为 `max-width: 930px`，放大窗口时会留下不必要的右侧空白，已删除该限制，并将每列最低宽度定为 220px，保持卡片信息密度。

Deck “看似不能滚动”的根因是 `.main-content` 同时作为 CSS Grid item 和 Flex container，却缺少 `min-height: 0`。长列表会将其撑到内容高度，外层 `.runtime-shell` 的 `overflow: hidden` 再裁切底部，`grid-scroll` 无法形成真实 overflow。现已为主内容、Deck Scroll 和 Settings Scroll 明确设置高度收缩边界；Deck/Settings 都使用独立 `overflow-y: auto`、`overscroll-behavior: contain` 和稳定 scrollbar gutter。这样滚轮只滚动内容区，不移动 Header/Sidebar，也不会向外层泄漏。

该轮实际截图确认了修复前的底部裁切与修复后的受约束滚动布局；系统级模拟滚轮的命令行注入未能完成，因此仍需用户用触控板或鼠标在 Deck 内容区实际滚动一次，确认 macOS WebView 的输入链路。静态构建验证作为独立记录，不替代该最后一步人工输入验收。

### 后续视觉一致性调整

Profile 的来源是分组属性，不是卡片类型。Deck 不再在每张卡片上显示“内置/导入”角标，所有 RuntimeProfile 共用相同卡片骨架、图标位置、更多按钮和绑定区；来源差异只体现在分组标题与系统项不提供删除操作。外部导入分组调整到首屏，系统内置紧随其后。

Deck 内容区顶部新增粘性分组导航，可一键定位“外部导入”或“系统内置”。由于 GUI 使用整块 `innerHTML` 重绘，管理外部、选中卡片和打开菜单前会保存 `grid-scroll.scrollTop`，完成重绘后恢复；因此外部管理不会再自动跳回列表顶部。

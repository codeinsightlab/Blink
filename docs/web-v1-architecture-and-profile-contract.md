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

该“只忽略 handler”方案解决了递归与崩溃，却没有恢复 `SEND_HOTKEY` 的实际效果：只要裸键 `C` 仍在 OS global-shortcut 层注册，Enigo 注入 `META + C` 中的 `C` 仍会被全局注册截获；handler 即使选择忽略，该事件也不会继续传给前台应用。因此“Executor 返回 Ok”仍不能证明复制发生。

最终执行生命周期改为在实体快捷键 `Released` 事件触发，确保触发键已经物理释放；handler 只解析 RuntimeProfile 并使用 `run_on_main_thread` 排队，立即结束自身回调。排队任务在回调栈外安全地撤销全局注册、执行 Profile 原始 Execution、再恢复原 BindingState 注册。这样注入的 `META + C` 没有注册拦截，可以到达前台应用，同时避免在插件 handler 内修改注册表导致退出。

后端 `unbind_profile` 一直同时支持 SYSTEM 与 EXTERNAL RuntimeProfile；此前仅外部项的更多菜单接入了该命令。系统 Tile 现对已绑定项在 Keycap 后显示低权重“解绑”，仍复用相同后端事务：生成 next BindingState、重新注册、持久化，失败时保留 previous state。

### “我的命令”与“系统快捷动作”的执行一致性

两类 RuntimeProfile 的执行入口完全相同：实体键先从同一份 `BindingState.physical_to_profile` 解析为 RuntimeProfile id，再统一进入 `dispatch_profile`；该函数不读取 `ProfileSource`，只按 `source_binding_id` 找到原始 Binding、选择当前平台 Execution，最后交给同一个 `execution::dispatch`。因此 SYSTEM/EXTERNAL 不是两套 Executor，也没有系统命令名称分支。

两者此前表现不同，原因是数据来源和常见 Execution 类型不同，而不是执行框架不同：SYSTEM 由内置 Profile seed，八项当前都是 `SEND_HOTKEY`；EXTERNAL 来自用户导入，可能是 `LAUNCH_APP`、`SEND_HOTKEY` 或有序混合。`LAUNCH_APP` 启动子进程，不会产生键盘事件；`SEND_HOTKEY` 通过 Enigo 注入按键，若注入序列包含当前实体绑定键，才可能回流到 global-shortcut handler。故外部 Profile 若同样配置 `SEND_HOTKEY` 且与实体键重叠，也会遇到相同问题，修复必须放在统一 `dispatch_profile`/handler 边界，不能只对 SYSTEM 特判。

UI 结构确有差异：外部 Profile 使用“我的命令”列表并通过更多菜单管理，SYSTEM 使用 Compact Tile 且不可删除；这只影响展示和管理权限。绑定、重新绑定、解绑现在都调用相同 Tauri command，执行路径不因 UI 分组改变。

### 2026-09-02：本会话 UI 范围越界审查

本会话原始范围是 Keycap、HotkeyFormatter、列表/系统动作视觉和图标库。提交 `1d2e16e` 将 UI 与 Rust 变更混在同一个提交中，其中可由 UI 需求解释的 Rust 变化仅是 `RuntimeSnapshot` 增加只读 `platform`、`actionHotkey`，以及从现有 Profile Execution 提取展示数据；这些变化不应触碰监听或执行生命周期。

实际越界并导致回归的改动包括：

1. 给 `RuntimeCore` 增加 `suppress_shortcuts_until`，在 `dispatch_profile` 写入 500ms/250ms 窗口，并在 `dispatch_physical_key` 改变事件处理逻辑。
2. 后续未提交改动把 global-shortcut 触发条件从 `Pressed` 改为 `Released`。
3. 后续未提交改动把原来的同步 `dispatch_profile` 改为 `run_on_main_thread` 调度。
4. 后续未提交改动又在执行路径增加 `unregister_all → execution::dispatch → register_state`，反复改变全局注册表。

这些都不是 UI 所需改动。最新运行证据为：绑定文件仍有 `system-builtin-copy → C`，诊断日志最后一条是“已释放全局快捷键 C”，之后没有执行完成、失败或恢复注册记录，同时 Runtime 进程已不存在。这把故障边界定位在新增的调度/注册生命周期，而不是 Profile、`SEND_HOTKEY` keys、Enigo 映射或 Keycap UI。

恢复原有正常执行功能的安全回退边界应是：以 `1d2e16e^` 的 `dispatch_profile`、`dispatch_physical_key`、`ShortcutState::Pressed` 和原 `RuntimeCore` 为基线；保留 UI 文件、Lucide、Formatter、Keycap，以及 `RuntimeSnapshot.platform/actionHotkey` 这种只读展示桥接。系统 Tile 的“解绑”只调用既有 `unbind_profile`，可以独立保留。任何关于裸字符全局键与注入快捷键回流的问题，应另立 Runtime 执行层任务、建立可重复端到端测试后处理，不能继续夹带在 UI 任务中试修。

### 2026-09-02：回归修复落地与验证

执行层已按 `1d2e16e^` 精确恢复，不以新实现替代回退：`RuntimeCore` 删除 `suppress_shortcuts_until`；`dispatch_profile` 恢复为读取当前平台 Execution 后同步顺序调用 `execution::dispatch`；`dispatch_physical_key` 恢复为解析绑定、记录事件并直接调用 `dispatch_profile`；handler 恢复 `ShortcutState::Pressed`。执行路径不再包含 suppress/debounce、`run_on_main_thread` 或每次执行时的 `unregister_all/register_state`。注册表生命周期重新只存在于启动/刷新、绑定提交、绑定捕获、暂停/恢复和退出等原有位置。

最终 `main.rs` 相比 `1d2e16e^` 只保留 UI 所需只读差异：`RuntimeProfileView.action_hotkey`、`RuntimeSnapshot.platform`、`current_platform()`、`action_hotkey()`，以及 snapshot 映射。它们只读取已有 Profile Execution，不改变 Profile、RuntimeProfile 持久化、Executor 参数或调度。

验证结果：Rust tests 5/5、TypeScript typecheck、Vite production build 与 `git diff --check` 均通过。真实 Tauri Runtime 从现有 `system-builtin-copy → C` 注册启动；使用系统输入连续触发 C 三次，诊断逐次出现“已收到全局快捷键 C”与“命令执行完成”，进程继续存活且未重新注册。实际窗口确认外部命令列表、系统 Tile、Keycap/HotkeyFormatter、`META + C → ⌘ C` snapshot 展示和系统 Tile 解绑入口均正常保留。该验证证明恢复了基准执行路径与进程稳定性；未读取剪贴板内容，因此不把日志中的 Executor 成功扩张为剪贴板内容级证明。

### 2026-09-02：功能结果闭环补验与验收口径纠正

上一节最初在聊天回执中把“全局快捷键回调发生、`execution::dispatch` 返回成功、Runtime 仍存活”列为 Case 1/2 通过，这是错误的验收口径。上述证据只证明调度链和进程稳定性，不能证明前台应用收到注入组合键，更不能证明复制或粘贴产生了业务结果。对 `SEND_HOTKEY`，完成标准必须检查目标应用最终状态：复制应验证剪贴板内容，粘贴应验证目标输入内容；注册成功和诊断日志只能作为过程证据。

补验开始前读取当前持久化状态，`bindings.json` 为 `{ "bindings": [] }`，因此当时直接按 C 不可能触发任何 RuntimeProfile。测试没有直接改写该文件，而是通过 Runtime UI 的系统 Tile 正常建立 `system-builtin-copy → C` 与 `system-builtin-paste → V`，完成后又通过 UI 解除两项测试绑定，最终文件恢复为空数组。

真实 macOS 端到端结果如下：

1. 复制：TextEdit 写入并全选唯一文本 `KEYFLOW_E2E_COPY_20260902_0852`，先将剪贴板置为不同哨兵值，再仅发送物理键 C。`pbpaste` 最终与选中文本完全一致。
2. 粘贴：剪贴板预置 `KEYFLOW_E2E_PASTE_20260902_0855`，在空白 TextEdit 文档中仅发送物理键 V。读取前台文档文本后与剪贴板预置值完全一致。
3. 连续复制：依次使用 `KEYFLOW_REPEAT_COPY_1`、`KEYFLOW_REPEAT_COPY_2`、`KEYFLOW_REPEAT_COPY_3`，每轮都先覆盖剪贴板哨兵、全选目标文本、发送物理键 C，再读取剪贴板；3/3 内容完全一致。
4. 过程旁证：每次均出现对应的全局快捷键与命令完成诊断，测试结束时 `target/debug/keyflow-runtime` 仍存活；这些记录仅辅助解释执行路径，不代替上述内容断言。

因此，当前代码在本机以明确建立的 C/V 绑定可以完成真实复制和粘贴；用户此前报告的失败不能被“日志成功”否定。当前可确认的状态差异是补验前持久化绑定为空。若用户在 UI 中再次建立绑定后仍失败，后续应记录当次 `bindings.json`、前台应用、选区/焦点、剪贴板前后值和诊断时间点，再定位环境或具体应用差异；不得退回以注册成功作为功能通过。

### 2026-09-02：实体键与输出主键重叠问题

用户在真实键盘测试中确认：复制动作绑定 C 不生效，改绑 F10 后生效。该对照将问题进一步收敛为实体触发键与输出快捷键主键重叠，而不是复制 Profile、`SEND_HOTKEY`、Enigo 或辅助功能权限整体失效。

当前稳定基准的实际时序是 `ShortcutState::Pressed → dispatch_physical_key → dispatch_profile → execution::dispatch`，并且调用是同步的。复制 Execution 随后由 Enigo 依次按下 `META` 和 `C`。当实体绑定也是 C 时，执行发生在原物理 C 尚未释放的窗口内，第二次 C 按下可能不会形成新的有效按键边沿，因此前台应用收不到完整的 `⌘C`；F10 与输出主键 C 不重叠，不存在该冲突。

前一节的自动化使用 `System Events key code` 快速生成完整按下/释放，无法可靠模拟用户持续按住实体键期间触发回调，因此即使剪贴板结果通过，也不能覆盖“物理键保持 + 同键重叠”场景。后续回归矩阵必须拆分为至少两类：非重叠键（如 `F10 → ⌘C`）和重叠键（如 `C → ⌘C`），并以真实键盘保持时序验收。

本轮回归任务明确禁止改变 Pressed/Released 语义、线程模型、suppress/debounce 和 register/unregister 生命周期，因此这里只记录问题，不在 UI 回退中设计修复。若产品要求普通字母键也能映射到包含同一字母的系统快捷键，需要另立执行层任务，先确定允许的触发时机和系统事件策略，再进行端到端验证。

### 2026-09-02：整套 Runtime 恢复到昨日提交

用户确认 2026-09-01 的已提交 Runtime 在真实键盘上不存在 C 绑定复制失败，因而授权以已知可用提交替代继续设计执行层方案。按本地提交时间，昨日最后提交为 `9cfefbb`（2026-09-01 15:52:55，`Update runtime interface`）。整个 `runtime/` 目录已精确恢复到该提交，`git diff 9cfefbb -- runtime` 为空。

这是整套 Runtime 回退，不只是 `main.rs`：今天新增的 `hotkeyFormatter.ts`、`keycap.ts`、`runtimeIcon.ts` 及配套 Runtime UI、Snapshot 类型和前端依赖均随之撤销。审查文档保留，以记录回归时间线和撤销原因。恢复后 `cargo test` 5/5、Runtime TypeScript typecheck、Vite production build、`git diff --check` 均通过，debug 二进制也已重新构建。

尝试停止回退前仍在运行的 Runtime/Vite 进程以启动新构建时，进程终止授权未获批准，因此当前内存实例不能作为 `9cfefbb` 的真实运行证据。用户需要正常退出并重新启动 Runtime 后，再以真实键盘执行 `C → 复制 → 检查剪贴板内容`；在该结果出现前，本节只确认源码与构建恢复，不宣称功能实机通过。

### 2026-09-02：回退范围纠正为仅执行层

用户随后澄清：要求回退的是执行层，Runtime UI 仍须保留今天版本。前一节“整套 Runtime 恢复”的范围理解错误，已立即撤销。最终组合如下：Runtime 前端、依赖和 UI 文件全部恢复为 `1d2e16e`，包括 Keycap、HotkeyFormatter、Lucide/RuntimeIcon、“我的命令”列表、系统 Tile、解绑入口及现有样式；执行层保持 `9cfefbb` 的 `RuntimeCore`、`dispatch_profile`、`dispatch_physical_key`、`ShortcutState::Pressed` 和原注册生命周期。

最终 `git diff 1d2e16e -- runtime` 只剩 `runtime/src-tauri/src/main.rs` 的执行层回退；UI 文件与今天提交完全一致。最终 `main.rs` 相比 `9cfefbb` 只增加 UI 必需的只读 `RuntimeSnapshot.platform`、`RuntimeProfileView.action_hotkey` 及其读取映射，不改变执行语义。`suppress_shortcuts_until`、`run_on_main_thread`、`Released` 和执行期间 unregister/register 均不存在。

纠正后重新执行 `cargo test`（5/5）、Runtime TypeScript typecheck、Vite production build 和 `git diff --check`，全部通过。由于旧 Runtime 内存进程仍未获授权停止，真实键盘结果仍须在用户正常退出并重启新构建后验收。

### 2026-09-02：Pressed / Released 监听历史澄清

提交历史确认：昨日 `9cfefbb` 的 global-shortcut handler 已经是 `event.state() == ShortcutState::Pressed`，今天提交 `1d2e16e` 仍保持 `Pressed`，没有在该提交中改为弹起触发。插件回调本身可以报告按下和弹起状态，但 Runtime 业务条件只处理 `Pressed`，`Released` 事件不会进入 `dispatch_physical_key`。

本会话后续未提交实验曾短暂把条件改为 `ShortcutState::Released`，并伴随 `run_on_main_thread` 和执行期间 unregister/register 尝试；这些都已撤销。当前最终代码再次与昨日版本一致：只在 `Pressed` 执行，没有独立的 key-up 执行逻辑。Runtime UI 用于录入实体绑定的浏览器监听同样只有 `window.addEventListener("keydown", ...)`，没有 `keyup` 绑定提交逻辑。

### 2026-09-02：Pressed 与 Released 执行语义比较

`Pressed` 的优势是响应最快，符合传统快捷键“按下即触发”的体验，也保持昨日已提交行为；但执行发生时实体键仍处于按下状态。当实体键与输出快捷键主键重叠（例如 `C → ⌘C`）时，Enigo 注入的第二次 C 可能没有新的按下边沿。长按还可能产生系统重复 Pressed，若底层上报重复事件，存在重复执行风险。

`Released` 会等实体键物理释放后再注入，因此天然避开 `C → ⌘C` 的同键保持冲突，也通常只对应一次完整敲击；代价是执行延迟等于用户按住时间，长按时命令一直不执行，若系统切换、设备断连或底层丢失 key-up，命令可能不触发。组合实体键还必须明确是在最后一个键弹起还是主键弹起时执行，并验证各平台 global-hotkey 后端的 Released 可靠性。

对于 KeyFlow 当前允许裸字母实体键且系统动作大量输出 `⌘/Ctrl + 同字母` 的产品形态，Released 在同键重叠正确性上更匹配；Pressed 在低延迟和历史兼容上更有优势。但该选择属于执行层产品语义，不能只替换一个枚举后宣称完成：必须用真实键盘覆盖短按、长按、连续触发、组合键、同键重叠、非重叠键和进程存活。当前回归版本仍保持 Pressed，本节只记录方案分析，不修改实现。

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

## 2026-09-02：实体 C 触发复制失败的执行层审查

审查结论：当前 Runtime 的执行层与“Studio 决定业务、Profile 承载结果、Runtime 忠实展示/绑定/执行”的原则一致。`dispatch_profile` 仅选择 `executions.macos`；复制 Profile 的持久化数据明确是 `SEND_HOTKEY ["META", "C"]`。`to_key` 将 `META` 映射为 `Key::Meta`、`C` 映射为 `Key::Unicode('c')`，不存在以名称“复制”推断或纠正平台快捷键的分支。

当前 app-data 诊断日志多次包含连续的“已收到全局快捷键 C”与“已收到快捷键，命令执行完成”；这证明 C 的 global shortcut 注册、Binding 命中、Profile 查找和 `SEND_HOTKEY` 调用均已进入。该日志的“完成”仅代表 enigo 调用返回，不能证明目标应用已把选区写入剪贴板。审查时 `bindings.json` 已为空，因而不能将该文件当作当前仍生效的 C 绑定证据；上述日志是历史真实运行证据。

“实体 C 绑定复制失败、实体 D/F10 绑定同一复制 Profile 可以成功”的最强解释是触发键与动作终止键的同键竞争：Tauri global shortcut 当前只在 `ShortcutState::Pressed` 时同步 dispatch，实体 C 仍被物理按下时，enigo 随即再投递 `Meta down → C down → C up → Meta up`。macOS 可能将第二个 C down 合并/忽略，或裸 C 已先影响目标应用的选区；D/F10 不与输出 `⌘C` 重叠，因而不存在这一竞争。此结论解释了差异性，不涉及 Profile 的 macOS 解析错误，也不能通过把 Profile 强制改成其他快捷键解决。

最小产品保护应在绑定阶段检测“无修饰实体键”是否等于 `SEND_HOTKEY` 的非修饰终止键，并明确提示该组合不可靠，建议使用 F 键、Macro Pad 键或带修饰键的实体输入。若产品必须可靠支持此组合，则需要平台输入层能力：至少等待源键释放后再注入；若还要阻止裸 C 抵达前台应用，则 macOS 需使用可消费事件的原生 event tap，而不是只依赖 Tauri global shortcut。两者都属于 Input Backend/交互能力升级，不能偷换为 Runtime 对 Profile 业务规则的修正。

# Phase 0 Architecture Audit

> 审查日期：2026-09-02
>
> 审查范围：当前工作树中的 `packages/keyflow-contract`、根目录 Studio Web、`runtime` TypeScript GUI 与 Rust Core。
>
> 纪律：本节只记录当前代码事实与 Phase 1 文件级计划；未实现 Factory、Creator、Profile、Binding 或 UI 变更。

## 1. Executive Conclusion

1. 当前架构可以低成本进入 Phase 1：Profile v1.2 已能在一个 Action 内分别携带 `windows` / `macos` Execution，单平台配置在数据结构上成立，Runtime 也只读取当前平台项。
2. Contract 目前是“JSON 语义部分共享”：Studio Web 直接依赖 `@keyflow/contract`；Rust Runtime 手写了可反序列化同一 JSON 的结构，并用共享 fixture 做兼容测试，但没有依赖或生成自同一类型模块。因此最终判断为 **部分共享**，不是“真正共享”。
3. Runtime Rust `Action` 只保留 `executions`，导入 JSON 后会丢弃 `Action.type`、`appId`、`commandId`、`name` 等业务字段；Repository 再保存的是这份裁剪后的 `source_profile`。内置 fixture 还使用共享 Contract 不允许的 `KEY_7/KEY_8`，并省略 Action 判别与业务字段；它能加载仅因为 Rust 模型/校验更宽。这是另一套持久化业务模型的直接证据。
4. 当前没有共享 `ProfileFactory`。Studio Web 在 `profileStore.ts`、`setupService.ts` 和 `profileCompiler.ts` 分散拼装默认 Profile、Binding、`OPEN_APP` 与 `COMMAND` Action；Runtime 只能导入文件，不能创建 Profile。
5. Binding 闭环已经具备：`bind_key` 会校验物理键、更新双向 Map、注册最新全局快捷键、失败时恢复旧注册、保存 `bindings.json`，无需重启即可生效。
6. Runtime Creator 真正缺失的是：共享 Factory、Runtime 的 Open App/Hotkey 收集 UI、把内存 Profile 交给 Repository 的 command/API，以及 GUI 依次调用“创建并持久化 → 绑定并注册”。无需先建新的 orchestration framework。
7. `OPEN_APP` 执行器已支持 macOS 的 bundle id / app name / path 和 Windows 的 executable name / alias / path；Runtime 只有 Profile JSON 文件选择器，没有应用选择器。
8. `SEND_HOTKEY` 的跨平台 Contract 与执行器已存在；Runtime 没有动作快捷键录入 UI。现有实体绑定的 `keydown` 捕获和 `physicalInput()` 只能复用交互思路，不能当作 Factory 或跨平台推断逻辑。
9. 当前没有在导入/展示阶段显式区分“Profile 非法”和“当前平台未配置”：非法数据在 `Profile::from_json` 返回错误；缺少当前平台 Execution 直到按键触发才以 `UNSUPPORTED_PLATFORM` 进入最近错误，GUI 导入失败还会丢弃具体错误文本。
10. Binding 是纯 Key-level。`physicalInput: String` 没有设备身份，因此主键盘 F13、Macro Pad A 的 F13、Macro Pad B 的 F13 无法区分；这是 Phase 1 已知边界，不应在本阶段扩张 Device Identity 或键盘底层架构。

## 2. Current Architecture Map

```text
Studio Web
  App Registry + Command Registry + current Profile
      │ localStorage:
      │ keyflow.appRegistry / keyflow.commandRegistry / keyflow.currentProfile
      ↓
  profileCompiler + Zod/business validation
      ↓ download JSON

Runtime import picker
      ↓ load_profile(path)
  Rust Profile::from_file / from_json
      ↓ ProfileRepository::insert_import (每个 source binding 展开一个 RuntimeProfile)
  app-data/profiles.json                         [Profile 持久化]

Runtime binding capture (WebView keydown)
      ↓ begin_binding_capture → bind_key(profileId, physicalKey)
  BindingState::bind_profile
      ↓ app-data/bindings.json                   [Binding 持久化]
  register_state → tauri global-shortcut         [Runtime 注册]
      ↓
Physical Key / Shortcut
      ↓ dispatch_physical_key
physical_to_profile: physicalInput → RuntimeProfileId
      ↓ repository.find + sourceBindingId
ProfileBinding.actions (原顺序)
      ↓ executions[currentPlatform]
Execution::LaunchApp | Execution::SendHotkey
      ↓ execution::dispatch
macOS open / Windows cmd start | enigo
```

代码中的实际 Runtime 关联不是早期文档设想的 `physical key → slot → Profile`，而是：

```text
physicalInput → RuntimeProfile.id
RuntimeProfile.sourceBindingId → sourceProfile.bindings[].id
```

`slot` 会被导入和持久化，但当前按键查找链不使用 `slot`。

## 3. Reuse

| 能力 | 文件 | 为什么可以直接复用 |
| --- | --- | --- |
| Profile/Action/Execution 的 TypeScript Contract | `packages/keyflow-contract/src/profile.ts`、`action.ts`、`execution.ts` | 已表达有序 Action 和可选的双平台实现；Phase 1 不需要新 Contract 模型。 |
| Zod 结构校验 | `packages/keyflow-contract/src/schemas/*.ts` | 可供共享 Factory 输出后校验；现有 Profile v1.2 无需升级版本。 |
| 当前平台 Execution 路由 | `runtime/src-tauri/src/main.rs` 的 `current_platform`、`dispatch_profile` | 忠实选择当前平台，不推断另一平台。 |
| Primitive 执行器 | `runtime/src-tauri/src/execution.rs` | `LAUNCH_APP` 与 `SEND_HOTKEY` 均已分发并实现 macOS/Windows 路径。 |
| Runtime Profile Repository | `runtime/src-tauri/src/repository.rs` | 已能 Insert、持久化、查询、重命名和删除 RuntimeProfile；需要的只是接受 Creator 内存 Profile 的入口与返回新 id。 |
| Binding 双向 Map 与持久化 | `runtime/src-tauri/src/binding.rs` | 已实现一键一 Profile、last-wins、解绑、重建与 `bindings.json` 保存。 |
| 即时全局注册与失败恢复 | `runtime/src-tauri/src/main.rs` 的 `commit_bindings`、`bind_key` | 新 Binding 成功后立即注册；注册失败恢复上一份注册，无需重启。 |
| Runtime 实体键捕获交互 | `runtime/src/main.ts` 的 `physicalInput`、capture 状态与 `keydown` handler | 可复用“按下一次即收集”的 UI/事件处理思路；仍需把动作快捷键和实体绑定状态分开。 |
| Tauri Dialog 插件 | `runtime/package.json`、`runtime/src-tauri/Cargo.toml`、`runtime/src/main.ts` | 插件已安装并初始化；当前只用于 JSON，Phase 1 可在同一能力边界增加系统应用文件选择。 |
| Studio Registry 到 Action 的既有映射规则 | `src/services/profileCompiler.ts` | 是提取共享 Factory 时的现有业务规则证据；迁移后调用共享实现，不保留复制品。 |

## 4. Modify

| 模块 | 现状 | Phase 1 需要修改什么 | 为什么 |
| --- | --- | --- | --- |
| `@keyflow/contract` | 只有类型、Schema、常量 | 在现有 package 内加入最小 `ProfileFactory`，仅公开 `createOpenApp(...)`、`createHotkey(...)` | 这是 Web/Studio/Runtime 都能依赖的最自然现有 shared/profile 边界。 |
| Studio Profile 创建调用点 | 默认 Profile、Binding、Action 分散拼装 | 改为调用共享 Factory；保留 store、localStorage、页面编排 | 消除标准 Profile 创建规则复制，不重做 Studio 状态架构。 |
| Runtime frontend package | 未依赖 workspace Contract | 增加 `@keyflow/contract` workspace 依赖，Creator 直接调用同一 Factory | Runtime GUI 是 TypeScript，能以最小成本真正消费共享 Factory。 |
| Runtime Repository command 边界 | 只接受文件导入，`load_profile` 不返回新 id | 增加接受 Factory 产物的内存/JSON Profile 创建入口，并返回创建的 RuntimeProfile id | GUI 必须知道刚创建哪一项，才能立即调用既有 `bind_key`。 |
| Runtime GUI | 只有导入、管理、实体绑定 | 加 Key-centric Creator 流程：选实体键 → 选动作 → picker/capture → Factory → persist → `bind_key` | 满足连续体验，不暴露 Profile/Action/Binding 管理后台。 |
| Runtime snapshot/error 展示 | 仅展示 hotkey/来源等视图字段，导入错误被前端概括 | 对“当前平台未配置”提供显式可展示状态；保留非法 Profile 的具体导入错误 | 产品必须区分 invalid 与 current platform missing。 |
| Rust Contract 映射 | 手写结构且 `Action` 丢弃业务字段 | 最小补齐与 Profile v1.2 一致的 Action tagged enum，或至少保真保存 Action 字段并增加 parity tests | 当前 Repository 回写后不再是完整统一 Contract。不要新建 RuntimeProfile Contract。 |

## 5. Add

只需要以下最小新增能力：

1. **Shared ProfileFactory**：放进现有 `packages/keyflow-contract`，只实现 `createOpenApp(...)` 与 `createHotkey(...)`，输出现有 Profile v1.2；不引入 Factory 版本、Migration Registry 或未来 Action。
2. **Runtime Open App Creator UI**：调用系统 picker，向 Factory 传递用户明确选中的当前平台应用目标；不让用户手填路径，也不猜另一平台。
3. **Runtime Hotkey Creator UI**：捕获用户明确按下的动作快捷键，生成当前平台 `SEND_HOTKEY.keys`；不根据 Copy/Paste/Save 名称推断。
4. **Creator Profile persist command/API**：接受 Factory 生成的 Profile，复用 `ProfileRepository::insert_import/save`，返回唯一新 RuntimeProfile id。它不是第二套 Profile 模型。
5. **GUI 级 Create+Bind 组合**：创建成功后立刻调用现有 `bind_key`。Phase 1 先组合已有能力；只有真实失败一致性要求证明需要时，才考虑后端事务命令。

## 6. Do Not Touch

- `runtime/src-tauri/src/execution.rs` 的 Input Backend 架构：不做 interception、event suppression、synthetic event 重构或 modifier state engine。
- `tauri-plugin-global-shortcut` 的监听生命周期与完整主键盘 remap：Phase 1 继续以 F13–F24、Macro Pad、外接键盘等可注册输入为主要边界；注意当前 Action `KeyCode` 只含 F1–F12，这与实体触发字符串是两个模型。
- Device Identity：不把 `physicalInput` 扩成 Device + Key。
- Blink 架构：不新增 Builder、Workflow、Condition、Loop、Variable、State Machine 或 Agent。
- Profile Version/Migration：保留当前已有 `version: "1.2"` 兼容事实，但不新增 `schemaVersion`、Factory 版本或升级流水线。
- Cloud Sync / Marketplace：不增加云端持久化、账号或同步。
- App/Command Registry 的管理后台：Creator 可以复用其规则，不需要把 Runtime 变成 Registry 管理器。
- `RuntimeProfile` 的本地展示字段（source/icon/createdAt）：除接受新 Profile 所必需的调用边界外，不做 Repository 重构。

## 7. Profile Contract Audit

### A. Profile Contract

1. **Profile 核心类型**：`packages/keyflow-contract/src/profile.ts`；`Profile = { version, id, name, bindings, createdAt, updatedAt }`，`KeyBinding = { id, slot, name, description?, actions }`。
2. **Action 定义**：`packages/keyflow-contract/src/action.ts`；`Action = OpenAppAction | CommandAction`，由 `type: "OPEN_APP" | "COMMAND"` 区分。
3. **Platform/OS 表达**：`packages/keyflow-contract/src/constants.ts` 定义字符串联合 `"windows" | "macos"`；实际实现嵌套在每个 Action 的 `executions.windows?` / `executions.macos?`。
4. **多个 OS implementation**：支持，同一 Action 可同时包含两项。
5. **只有一个 OS implementation**：类型与 Zod Schema 都允许；Studio 导出业务校验只要求至少一个平台，因此这是合法导出。
6. **合法性验证**：共享 Zod 在 `packages/keyflow-contract/src/schemas/profile.schema.ts` 及 execution/app/command schemas；Studio 导出额外业务校验在 `src/services/profileCompiler.ts::validateProfileBusiness`；Rust 导入验证在 `runtime/src-tauri/src/profile.rs::Profile::from_json`。三者强度并不一致。
7. **Runtime 当前平台选择**：`runtime/src-tauri/src/main.rs::current_platform` 和 `dispatch_profile` 读取 `action.executions[currentPlatform]`；Windows 取 `windows`，其他构建实际都落入 `macos`，虽然正式目标只有 Windows/macOS。
8. **非法 vs 当前平台未配置**：底层错误来源有区分，但产品状态没有完整区分。非法 Profile 在导入时返回 `INVALID_JSON` / `UNSUPPORTED_PROFILE_VERSION` / `INVALID_PROFILE` / `UNKNOWN_EXECUTION`；当前平台缺项在执行时返回 `UNSUPPORTED_PLATFORM`。GUI 导入 catch 统一显示“无法导入此 Profile”，且未配置状态不在导入/卡片阶段显式呈现。

关键文件与核心类型：

| 文件 | 核心类型/职责 |
| --- | --- |
| `packages/keyflow-contract/src/profile.ts` | `Profile`、`KeyBinding` |
| `packages/keyflow-contract/src/action.ts` | `OpenAppAction`、`CommandAction`、`Action` |
| `packages/keyflow-contract/src/execution.ts` | `LaunchAppExecution`、`SendHotkeyExecution`、`Execution` |
| `packages/keyflow-contract/src/constants.ts` | `Platform`、`KeySlot`、`KeyCode` |
| `packages/keyflow-contract/src/schemas/profile.schema.ts` | Profile/Binding/Action Zod Schema |
| `runtime/src-tauri/src/profile.rs` | Rust `Profile`、`ProfileBinding`、缩窄后的 `Action`、`Execution` |

### B. Web / Runtime / Studio 是否真正共享 Contract

- **Web/Studio**：当前仓库根 React 应用就是 Studio Web，没有另一套 Studio 业务应用。它直接从 workspace package `@keyflow/contract` 导入 `Profile`、Action、Schema 与常量。
- **Runtime TypeScript GUI**：只使用 `runtime/src/types.ts` 的 `RuntimeProfile` / `RuntimeSnapshot` 视图 DTO，不依赖 `@keyflow/contract`，也不直接持有完整 Profile。
- **Runtime Rust Core**：使用 `runtime/src-tauri/src/profile.rs` 的手写 Rust struct/enum；它与 TypeScript package 不属于同一个 package/crate/module，只通过共享 JSON fixture 测试部分兼容。
- **复制/映射事实**：Rust `Profile` / `ProfileBinding` 是 Contract 的手写 DTO；Rust `Action { executions }` 比统一 Contract 更窄。导入时 serde 忽略未知字段，随后 `ProfileRepository::insert` 将每个 source binding 展开为本地 `RuntimeProfile`，并把裁剪后的 `source_profile` 整体复制进每个 RuntimeProfile。
- **当前内置数据反证**：`runtime/src-tauri/fixtures/builtin-profile.json` 的 `builtin-save` / `builtin-find` 使用 `KEY_7` / `KEY_8`，而共享 `KEY_SLOTS` 只有 `KEY_1`–`KEY_6`；所有内置 Action 只有 `executions`，不符合共享 `Action` discriminated union。它不是可通过 `profileSchema` 的 Profile v1.2。
- **判断**：**部分共享**。JSON shape 的执行核心兼容并有 fixture 测试，但只有 Studio Web 真正依赖共享 package；Runtime 既有手写 DTO，又有 JSON → `RuntimeProfile` 的二次持久化映射。

### C. 当前 Profile 创建逻辑

| 入口 | 文件 | 当前创建方式 | 是否重复业务规则 | 建议 Reuse/Modify |
| --- | --- | --- | --- | --- |
| Studio 默认 Profile | `src/stores/profileStore.ts::defaultProfile` | 对象字面量拼顶层 Profile | 是，标准 id/version/time 规则在端内 | Modify：改用共享 Factory 或其基础创建能力 |
| Studio 新增逻辑 Binding | `src/services/setupService.ts::createSetupBinding` | 手拼 `KeyBinding` 后写入当前 Profile | 是，id/name/slot/time 属于标准创建规则 | Modify：共享 Factory 创建标准单 Binding Profile/片段，页面只收集输入 |
| Studio OPEN_APP | `src/services/profileCompiler.ts::createOpenAppAction` | 从 `AppDefinition.platforms` 展开 `LAUNCH_APP` | 是；这是当前唯一明确规则源但位于 Web service | Move/Reuse：规则进入共享 Factory，原调用点改为委托 |
| Studio Hotkey/COMMAND | `src/services/profileCompiler.ts::createCommandAction` | 复制 Command id/name/executions | 是 | Move/Reuse：规则进入共享 Factory，Command Registry 仍只负责输入来源 |
| Studio setup 保存 | `src/services/setupService.ts::saveShortcuts/saveOpenApp(s)` | 调上面 helper，再拼 Profile 并原子式写两个 localStorage key | 编排可保留，创建规则重复 | Modify：保留 commit/rollback，改调共享 Factory |
| Studio export compile | `src/services/profileCompiler.ts::compileProfile` | 再从 Registry 重建 Action execution | 与创建 helper 共用同文件规则 | Modify：调用共享 Factory；保留过滤空 Binding 与业务校验 |
| Runtime import | `runtime/src-tauri/src/main.rs::load_profile/import_profile` | 文件反序列化为 Rust Profile，Repository 按 binding 展开 RuntimeProfile | 不是标准创建；是导入/本地映射 | Reuse：Creator 复用 Repository insert/save，但增加内存输入与返回 id |
| Runtime 内置 Profile | `runtime/src-tauri/src/repository.rs::ensure_system_profiles` + fixture | 从固定 JSON 反序列化后插入 | fixture 是手工 Profile 创建物 | Reuse unchanged：Phase 1 不改系统内置数据 |

当前不存在命名为 Factory/Builder 的共享实现。`profileCompiler.ts` 有 Action helper，但只属于 Studio Web，且没有创建完整 Profile。

### D. Shared ProfileFactory 应该放在哪里

**推荐位置**：`packages/keyflow-contract/src/profileFactory.ts`，并由 `packages/keyflow-contract/src/index.ts` 导出。若希望文件名小写与当前风格一致，可用 `profile-factory.ts`；不要新造 package。

**依赖方向**：

```text
packages/keyflow-contract
  Profile types + schemas + ProfileFactory
             ↑                 ↑
      Studio Web          Runtime TypeScript GUI
                               ↓ JSON/serde command
                         Runtime Rust Repository/Executor
```

**原因**：现有 package 已是 Profile Contract 的 TypeScript 唯一事实源，Factory 只依赖同包类型/Schema；Studio 与 Runtime GUI 都能直接依赖 workspace package。把 Factory 放进 `RuntimeUtils` 或 Web service 会制造复制或反向依赖。

需要修改的现有创建入口：`src/stores/profileStore.ts::defaultProfile`、`src/services/profileCompiler.ts::createOpenAppAction/createCommandAction/compileProfile`、`src/services/setupService.ts::createSetupBinding/saveShortcuts/saveOpenApp/saveOpenApps`。Runtime 新 Creator 只能调用该共享 Factory，不能再写一份 Rust/TS Factory。

## 8. Binding Audit

### E. 当前 Binding 模型

1. **类型**：`runtime/src-tauri/src/binding.rs::PersistedBinding { runtime_profile_id, physical_input }`；内存态为 `BindingState`，同时维护 persisted vector 与两个反向 HashMap。
2. **关联 Profile**：绑定关联的是本地 `RuntimeProfile.id`，不是 source Profile id，也不是 `slot`。
3. **key 表达**：`physical_input: String`，例如 `F11`、`CTRL+SHIFT+F9`；注册前把字符串中的 `META` 替换为插件使用的 `SUPER` 再解析 `Shortcut`。
4. **保存位置**：Tauri `app_data_dir()/bindings.json`；Profile Repository 另存为同目录 `profiles.json`。
5. **加载**：启动时先加载/补齐 Repository，再以有效 RuntimeProfile ids 调 `BindingState::load`；`rebuild` 清孤儿、重建双向 Map，并 last-wins 收敛冲突。
6. **启动恢复**：清理后的 BindingState 立即回写 `bindings.json`，随后 `refresh_listener` 调 `register_state` 注册全部物理键。
7. **新增注册**：GUI capture 后调用 `bind_key`；后端克隆 state、`bind_profile`、`commit_bindings`。非暂停态先注册 next，成功才替换内存并保存。
8. **修改/删除**：重新 bind 自动释放该 Profile 的旧 key，也会释放新 key 原来关联的其他 Profile；`unbind_profile` 更新并重新注册/保存；删除 Profile 前先 unbind。
9. **是否重启**：不需要。`commit_bindings` 成功即为当前进程注册最新状态。

真实链路：

```text
GUI 捕获 physicalInput
→ bind_key(profileId, physicalKey)
→ BindingState::bind_profile
→ register_state(next)                         注册/验证
→ core.bindings = next
→ bindings.json                               持久化
→ global-shortcut Pressed
→ dispatch_physical_key
→ physical_to_profile → RuntimeProfile
→ sourceBindingId → ProfileBinding
→ actions[] → executions[currentPlatform]
→ execution::dispatch
```

### F. 创建后立即 Binding

未来 GUI 已有 `physicalKey + Profile` 后，最小链路应为：

```text
shared ProfileFactory 生成并校验 Profile
→ 新增的 Runtime create-profile command 接收内存 Profile
→ ProfileRepository::insert_import + profiles.json
→ command 返回新 RuntimeProfile.id
→ 既有 bind_key(id, physicalKey)
→ commit_bindings 注册 + bindings.json
→ 立即 active
```

已经存在：Rust Profile 反序列化/验证、Repository insert/save、`bind_key`、Binding save、全局注册、失败时恢复旧注册、snapshot reload。只需组合：Creator 成功后用返回 id 调 `bind_key`，最后 reload snapshot。真正缺失：共享 Factory、Runtime Creator UI、非文件 Profile 创建 command 及其返回 id。

注意当前 `insert_import` 可能返回多个 RuntimeProfile；最小 Creator 应生成恰好一个 Binding 的 Profile，并由 command 明确拒绝空/多 Binding 或明确返回 ids 后由 GUI绑定目标，不能猜第一个。Phase 1 的唯一目标适合“一次 Creator 创建一个单 Binding Profile”。

## 9. OPEN_APP Audit

1. **Action schema**：`{ type: "OPEN_APP", appId, executions: { windows?: LAUNCH_APP, macos?: LAUNCH_APP } }`。
2. **目标保存**：Windows execution 包含必填 `executableNames[]`，可选 `knownPaths[]/aliases[]`；macOS 可含 `bundleIds[]/appNames[]/knownPaths[]`。它们直接随 Profile JSON 持久化。
3. **Runtime 执行**：`dispatch_profile` 选当前平台；`execution::dispatch` 进入 `launch_app`。
4. **接受形式**：macOS 依次接受 bundle id、app name（通常可为 `.app` 名称）、known path；Windows 接受 executable name、alias、known path。没有单独的通用 `path` 字段，也没有 Runtime App Registry 查询。
5. **picker 现状**：Runtime 已装 Dialog 插件，但代码中唯一 `open()` 是选择 Profile JSON；没有应用/可执行文件 picker。Studio Web 的 `AppPicker` 只是浏览器内 App Registry 列表，不是系统 picker。
6. **Factory 输入**：系统 picker 应把“用户明确选择的当前平台应用目标”交给 Factory。最小数据包括当前 `platform`、显示名/稳定 id 生成所需的用户输入或本地标识，以及 picker 返回的实际 path；Factory 只为当前平台写 execution。Windows 现有 Schema 还要求 `executableNames` 非空，因此应从用户选择结果提供可执行文件名与 path；macOS 可直接提供 `.app` path，并可选提供由系统元数据明确读取的 bundle id。不得从产品名称猜路径或另一平台实现。

目标 UI 仍是：

```text
选择“打开应用” → 系统 Picker → 用户选择应用 → Shared ProfileFactory
```

不暴露底层路径文本框。

## 10. SEND_HOTKEY Audit

1. **schema**：业务 Action 为 `{ type: "COMMAND", commandId, name, executions }`；平台 execution 为 `{ type: "SEND_HOTKEY", keys: KeyCode[] }`。
2. **modifier**：和普通键统一放在有序 `keys` 数组，modifier code 为 `CTRL`、`META`、`ALT`、`SHIFT`。
3. **key**：共享 `KeyCode` 字符串联合，包含字母、数字、常用特殊键、方向键与 F1–F12；Schema 要求至少一个且不重复。
4. **macOS/Windows Contract**：同一个 `SendHotkeyExecution` 类型，通过 `executions.macos?` / `.windows?` 分平台携带；数值不必相同。
5. **Runtime 执行**：当前平台 execution 交给 enigo；按数组顺序 Press，再逆序 Release。Rust `to_key` 不读取 `commandId` 或名称。
6. **Runtime 录入 UI**：没有动作快捷键 Creator/capture。已有 capture 是为实体 Binding；Studio 当前 ShortcutPicker 只从 Command Registry 选择，也不捕获新快捷键。
7. **可复用代码**：Runtime `physicalInput()` 与 capture gate 可复用键盘事件归一化思路，Contract `KEY_CODES`/Schema 可校验输出，`hotkeyFormatter.ts`/Keycap 可复用展示。动作快捷键 capture 必须是独立 UI 状态，不能调用 `bind_key`，也不能把 `META`/`CTRL` 自动跨平台转换。

Runtime 必须执行 Profile 明确写入的 keys。`Copy`、`Paste`、`Save` 等名称只用于展示，不能成为快捷键推断依据。

## 11. Platform Audit

1. **platform 形式**：共享常量层是 string union；Profile 中是每个 Action 的可选嵌套 implementation，而非顶层单值 enum。
2. **双平台差异**：同一 Action 的 `executions.windows` / `executions.macos` 各自携带完整 Primitive。
3. **检测位置**：Rust `main.rs::current_platform()` 使用编译期 `cfg!(target_os)`；`execution.rs` 的 launch 实现使用 `#[cfg(target_os)]`。
4. **缺少当前平台**：Profile 仍能导入、显示和绑定；按键触发时 `dispatch_profile` 生成 `UNSUPPORTED_PLATFORM`，记录“命令执行失败”并停止该 Binding 后续 Action。卡片未统一显示这种状态；只有系统 hotkey Tile 在 `actionHotkey` 为空时显示“当前平台无快捷键”，OPEN_APP 外部项没有对应状态。
5. **部分平台配置**：共享结构与 Studio 导出业务校验满足“至少一个平台即可合法”。Rust 导入甚至允许 Action 的 `executions` 为空，因此 Rust 合法性比 Studio 导出边界更宽；最小差距是统一导入校验规则，并把“合法但当前平台未配置”从执行错误提升为明确状态。

不需要 Migration。当前 `version` 字段是既有 Contract 事实，本阶段不扩张版本体系。

## 12. Physical Key Identity Audit

结论：**当前是 Key-level Binding**。

证据：`PersistedBinding` 只有 `runtimeProfileId` 与 `physicalInput`；两个索引都是 `HashMap<String, String>`，key 是可解析成 global shortcut 的字符串。浏览器 `KeyboardEvent` 捕获也只生成 modifier + key，没有 vendor/product/device/path/serial 信息。

因此以下输入在当前 Runtime 中都归一为同一个 `F13`：

```text
主键盘 F13
Macro Pad A 的 F13
Macro Pad B 的 F13
```

Runtime 无法区分设备来源，且同一 `physicalInput` 只能关联一个 RuntimeProfile，后绑定者覆盖旧关联。Phase 1 记录这一边界即可，不升级 Device Identity。

## 13. Minimal Phase 1 Change Set

以下是计划，不是已实施代码。

### CREATE

| 文件 | 用途 |
| --- | --- |
| `packages/keyflow-contract/src/profileFactory.ts` | 唯一共享 Factory；仅 `createOpenApp(...)`、`createHotkey(...)`，输出并校验当前 Profile v1.2。 |
| `runtime/src/creator.ts`（或与现有无框架结构一致的单个模块） | Runtime Key-centric Creator 的临时 UI state 与 create → persist → bind 调用组合；不创建领域模型。 |

如 `runtime/src/main.ts` 继续保持当前单文件规模且新增模块反而割裂状态，可不创建 `creator.ts`，直接最小修改 `main.ts`；不为结构整洁强制拆分。

### MODIFY

| 文件 | 用途 |
| --- | --- |
| `packages/keyflow-contract/src/index.ts` | 导出共享 Factory 与其最小输入类型。 |
| `src/services/profileCompiler.ts` | 删除/委托端内 Action 创建规则，改用共享 Factory；保留 export compile 与业务校验职责。 |
| `src/stores/profileStore.ts` | 默认 Profile/标准创建调用改用共享 Factory，不改 Zustand/localStorage 架构。 |
| `src/services/setupService.ts` | 保存编排继续存在，但标准 Profile/Action 构造交给共享 Factory。 |
| `runtime/package.json`、`runtime/package-lock.json` | 增加 workspace `@keyflow/contract` 依赖。 |
| `runtime/src/main.ts` | 新增选实体键、选择 Open App/Hotkey、系统 picker/capture、Factory 调用、persist 后立即 `bind_key`、明确错误反馈。 |
| `runtime/src/types.ts` | 只补 Creator/snapshot 所需视图状态，例如 current-platform-not-configured；不复制 Profile Contract。 |
| `runtime/src-tauri/src/main.rs` | 暴露接受内存 Profile 的最小创建 command，返回新 id；复用 `bind_key`，并在 snapshot 中区分当前平台未配置。 |
| `runtime/src-tauri/src/repository.rs` | 让单 Binding Creator 插入返回明确 id；沿用 `profiles.json`。 |
| `runtime/src-tauri/src/profile.rs` | 补齐统一 Action 的保真 Rust 映射与 parity validation；不新增 RuntimeProfile Contract 或版本系统。 |
| `runtime/src-tauri/fixtures/builtin-profile.json` | 补齐统一 Action 字段，并把 `KEY_7/KEY_8` 收敛到合法 Slot 表达；Runtime 当前按 binding id 查找，修正 slot 不改变实体绑定关联。 |
| `runtime/src/style.css` | 仅为 Creator 连续流程增加必要样式。 |
| `runtime/src-tauri/capabilities/default.json` | 仅当应用 picker 所需 dialog 权限不能被现有 `dialog:default` 覆盖时最小补权；先验证再改。 |

### REUSE UNCHANGED

| 文件 | 用途 |
| --- | --- |
| `packages/keyflow-contract/src/profile.ts`、`action.ts`、`execution.ts`、现有 schemas | 继续作为唯一 Contract；不加新 Profile 类型。 |
| `runtime/src-tauri/src/binding.rs` | Binding model、持久化和 last-wins 规则。 |
| `runtime/src-tauri/src/execution.rs` | OPEN_APP / SEND_HOTKEY Primitive 执行。 |
| `runtime/src/hotkeyFormatter.ts`、`runtime/src/keycap.ts` | Creator 快捷键展示。 |
| `src/components/key-setup/ShortcutPicker.tsx`、`src/components/key-mapping/AppPicker.tsx` | Studio 继续使用；Runtime 不复制其 Registry 管理语义。 |

### DO NOT TOUCH

| 范围 | 原因 |
| --- | --- |
| global-shortcut / keyboard interception 架构 | 不扩张完整 remap、suppression 或 synthetic event。 |
| Device Identity / HID | 当前产品边界是 Key-level。 |
| Blink / Workflow / Agent | 不属于最小 Creator 闭环。 |
| Profile version/migration | 当前无真实 Contract 升级需求。 |
| Cloud/Marketplace/Sync | 不属于本地即时闭环。 |

## 14. Open Questions

代码审查后没有必须先问用户才能开始 Phase 1 的产品问题。以下两项是实现时必须用目标系统验证的技术门槛，但不阻塞文件级方案：

1. macOS 的 Tauri open dialog 对 `.app` bundle 的返回行为，以及 Windows 对 `.exe` 的筛选/路径返回，需要分别在真实系统验证；当前代码只证明 Dialog 插件存在并能选 JSON。
2. Windows Creator 与 `LAUNCH_APP` 的真实机闭环尚无当前运行证据；代码路径使用 `cmd /C start`，静态与单元测试通过不能替代真实应用启动。

## Phase 0 Verification Receipt

- 根 Studio：`npm run typecheck` 通过。
- Runtime GUI：`npm run typecheck` 通过。
- Runtime Rust：`cargo test` 通过，5/5。
- 上述仅证明当前工作树静态类型与已有单元测试通过；未启动 Runtime、未操作系统 picker、未创建/绑定新 Profile，也未提供 macOS/Windows 实机 Creator 证据。

# Profile Contract Simplification Audit

> 审查日期：2026-09-02
>
> 范围：当前 TypeScript shared contract、Zod Schema、Studio Web、Runtime Rust DTO/Repository、fixtures、import/export。
>
> 本节只判断目标模型，不设计兼容迁移，不修改任何代码。

## 1. Executive Conclusion

1. 当前 Contract **明显携带上一阶段架构遗留**：`slot`、`KEY_1`–`KEY_6`、`KeyBinding` 命名和 `Profile → bindings[]` 层级都来自“逻辑键盘槽位”模型，而当前 Runtime 已是 `physicalInput → RuntimeProfileId`。
2. `KeyBinding.slot` 的明确结论是 **REMOVE**。它在 Studio 中只是本地列表 key/编号/排序工具；Runtime 不用它导入、覆盖、绑定、查找或执行。数组顺序与本地 UI identity 可以替代其全部当前职责。
3. `KEY_SLOTS` / `KeySlot` 的明确结论也是 **REMOVE**。它们没有跨 Web/Runtime 的领域语义，还人为把 Studio 限制为六项；Runtime 内置 fixture 已出现 `KEY_7/KEY_8`，证明 Runtime 运行模型并不服从该 Contract 限制。
4. Profile 中的 `KeyBinding` 已不是真正 Binding。真正 Binding 是 Runtime 的 `{ runtimeProfileId, physicalInput }`；前者实际是一个独立可命名、可描述、可按序执行 Actions 的 **ProfileEntry/可执行命令**。继续叫 Binding 会与 Runtime Binding 产生概念冲突。
5. 当前代码实际是：Studio 把 `Profile` 当“一组可导出的命令集合”，Runtime import 却把每个 `bindings[]` 元素展开为独立 `RuntimeProfile` 并逐个绑定。因此设计定义与运行粒度不一致。
6. `bindings[]` 多一层没有不可替代的当前价值。最小目标应让一个共享 `Profile` 就代表一个可独立导入、显示、绑定和执行的用户能力，直接拥有 `name/description/actions`；批量导出只是传输层批量，不应迫使领域对象保留伪 Binding。
7. 编译后的共享 Profile 不需要 `appId`、`commandId` 或 `CommandAction.name`。它们当前只服务 Studio Registry 选择、显示、查重和重新编译，应 **MOVE 到 Web-only authoring state**；Runtime 只需要平台 Execution。
8. `Action → executions[platform] → Execution` 仍有真实价值：Action 保留动作顺序和一组平台替代实现，Execution 表达最终 Primitive。但 Action 顶层 `OPEN_APP/COMMAND` type 可由平台 Execution type 推导，当前 Runtime 也不读取，建议 **DERIVE/REMOVE from wire**。
9. `Profile.id`、`KeyBinding.id`、`sourceBindingId` 当前形成无效身份链：Import=Insert 从不按 source id 覆盖；真正本地实例身份是 `RuntimeProfile.id`。目标共享 Profile 不需要这两个 source id，`sourceBindingId` 随 `bindings[]` 删除。
10. RuntimeProfile 存在明显副本：`name/description` 从 source binding 复制，整份 `sourceProfile` 又为每个展开项重复保存。保留本地可改名 override、icon、source 和 RuntimeProfile.id；description 应从单个 source Profile 推导，createdAt 当前无人读取，应删除。

## 2. Current Actual Model

```text
Studio localStorage
  keyflow.currentProfile
  Profile.id = "default"                         [未用于导入身份]
  Profile.bindings[]
    KeyBinding.id                                [Studio React key / Runtime source lookup]
    KeyBinding.slot                              [Studio 编号、选择、排序]
    name / description / actions[]
      appId / commandId                          [Studio Registry 引用]
      executions.windows? / macos?               [实际跨端执行数据]
          ↓
Studio compile + export one JSON Profile
          ↓
Runtime Profile::from_json
  丢弃 Action.type/appId/commandId/name
          ↓
ProfileRepository::insert_import
  对每个 source_profile.bindings[i]：append 一个 RuntimeProfile
    RuntimeProfile.id                            [本地实例身份]
    name / description                           [source binding 的副本]
    sourceProfile                                [整包副本，每项重复]
    sourceBindingId                              [回指包内 entry]
          ↓
BindingState
  runtimeProfileId + physicalInput               [真正实体键 Binding]
          ↓
sourceBindingId 查找 actions[]
          ↓
executions[currentPlatform] → Execution.type → Executor
```

当前身份链：

```text
Profile.id                      不参与 Runtime Insert/覆盖/执行
KeyBinding.id                   仅用于 sourceBindingId 回查
RuntimeProfile.id               真正本地实例 identity
PersistedBinding.runtimeProfileId
physicalInput
```

## 3. Slot Audit

### 逐项事实

1. **Web 创建为什么需要 slot**：`createSetupBinding` 用它寻找 `KEY_1`–`KEY_6` 中未使用的最小编号、生成默认名称/id，并限制最多六项。这是 Studio 当前 UI 规则，不是执行需求。
2. **Web 展示是否真正依赖 slot**：页面用 `slot` 查找当前 entry、作为 React key、显示数字、排序和生成“按键 N”。这些都可由 entry 本地 id、数组 index/order 和显示名替代。
3. **导出是否需要 slot**：`compileProfile` 原样保留；业务校验只把它写进错误位置字符串。没有任何执行编译以 slot 为输入。
4. **Runtime 导入是否使用 slot**：Rust 校验只检查非空并保存；Repository 对 `bindings` 逐项 enumerate，不按 slot 去重、排序、覆盖或定位。
5. **Runtime 执行是否使用 slot**：不使用。`dispatch_profile` 按 `sourceBindingId == binding.id` 查找。
6. **Runtime Binding 是否使用 slot**：不使用。Binding 是 `runtimeProfileId ↔ physicalInput`。
7. **Runtime Repository 是否使用 slot**：不使用。稳定系统 id 来自 `binding.id`，外部 id 来自时间/index/长度。
8. **builtin 是否需要 slot**：不需要。`KEY_7/KEY_8` 能加载且正常展开，正说明 Rust 只要求非空字符串；这些值不影响系统项 id、展示、绑定或执行。
9. **删除后的能力损失**：没有跨端产品能力损失。Studio 需把 selection/update key 换成本地 entry id，并用 array order/index 展示；Runtime 无执行改动。
10. **顺序是否可由 array order 取代**：可以。Profile 当前已经用数组表达 entries 顺序，Action 也用数组顺序执行；另加 `KEY_N` 是重复顺序编码，并可能与数组位置不一致。

### 明确判断

```text
KeyBinding.slot: REMOVE
KEY_SLOTS: REMOVE
KeySlot: REMOVE
slot Zod Schema: REMOVE
```

`slot` 不应 MOVE 到 Runtime local state，因为 Runtime 已有更真实的 `physicalInput` Binding；如果 Studio 仍想显示序号，那只是由 array index 派生的 Web UI state。

### 代码证据

- 定义/约束：`packages/keyflow-contract/src/constants.ts`、`profile.ts`、`schemas/profile.schema.ts`。
- Studio 本地用途：`src/services/setupService.ts`、`src/stores/profileStore.ts`、`src/pages/KeySetupPage.tsx`、`KeyMappingPage.tsx`、`OverviewPage.tsx`。
- Runtime 不使用：`runtime/src-tauri/src/repository.rs` 只 enumerate；`main.rs::dispatch_profile` 按 `source_binding_id` 找 `binding.id`；`binding.rs` 只持有 RuntimeProfile id 与 physical input。
- 反例：`runtime/src-tauri/fixtures/builtin-profile.json` 使用 `KEY_7/KEY_8`，超出 shared `KEY_SLOTS`，仍可通过 Rust loader。

## 4. Profile Granularity Audit

### Studio 实际粒度

Studio 当前只有一个 `keyflow.currentProfile`，名称默认“我的 KeyFlow”；用户在其中新增多个 `bindings[]`，每项有独立名称、描述和 actions。导出也是一次导出整个集合。因此 Studio 当前把 Profile 当作 **模型 A：一整套配置/命令集合**。

### Runtime 实际粒度

Runtime 并不把导入的顶层 Profile 当成一个可绑定对象。`ProfileRepository::insert` 对每个 binding 建一个 RuntimeProfile；GUI 每个 RuntimeProfile 单独显示、改名、选图标、删除和实体绑定。因此 Runtime 的实际可操作单位是 **模型 B：一个用户命令/能力**。

### Import 粒度

源 JSON 同时还是 **模型 C：可包含多个独立命令的导入包**。但代码把同一个类型 `Profile` 同时用于“Studio 当前集合”“传输包”和“单个 Runtime 命令来源”，导致名字和身份层次相互覆盖。

### 判断

运行模型已经选择了“一个 RuntimeProfile = 一个可独立绑定能力”。共享领域 `Profile` 最小应与这个单位对齐，即 **一个 Profile 代表一个用户命令/能力**。Studio 的多项编辑和批量下载是本地集合/传输行为，不足以证明共享 Profile 本身必须是集合。

## 5. `bindings[]` Layer Audit

这层最初承担“一个 Profile 内多个逻辑键槽”的结构；当前仍承载四个事实：entry identity、显示 metadata、Action 顺序、Studio 集合。但它们都不要求叫 Binding 或要求 slot：

- identity 可由 Web 本地编辑 state 管理；Runtime import 后重新分配本地 id。
- name/description 应属于独立 Profile。
- actions[] 本来就可直接属于独立 Profile。
- Studio 多项集合可由数组保存，批量导出可由传输层数组表达。

Runtime import 立即把每个 binding 展开为 RuntimeProfile，证明该层不是不可分割的 Profile 内部组成，而是实际的独立领域对象。

明确结论：

```text
bindings[] layer: REMOVE
KeyBinding type: REMOVE / fold into Profile
KeyBinding name: rename is worth including in this Contract cleanup
```

概念上它最接近 `ProfileEntry`，但目标模型无需先 rename 为另一个中间类型；直接把它提升为 `Profile` 更少。

## 6. Field Reduction Table

| 字段 | 当前用途 | 谁读取 | 参与执行 | 参与身份 | 只是 UI | 历史遗留 | 建议 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `Profile.version` | TS literal 与 Rust v1.2 gate；Web 历史迁移写回 | Schema、Web loader、Rust loader | 否 | 否 | 否 | 是；当前明确不建设版本体系 | **REMOVE** |
| `Profile.id` | Web 固定 `default`；Rust 保存但不查找 | Schema/loader | 否 | 实际否 | 否 | 是 | **REMOVE**；Web 草稿若需 identity，MOVE 到 Web-only |
| `Profile.name` | Studio 集合/导出包名称 | Web 页面、Rust 保存；Runtime GUI不用此值 | 否 | 否 | 是 | 当前层级语义已失配 | **REMOVE current package meaning**；目标 Profile.name 来自 entry name |
| `Profile.createdAt` | Web 创建时间；fixture 字段 | Web 更新/Schema、Rust保存 | 否 | 否 | 管理 metadata | 是 | **MOVE** 到 Web-only；共享 wire 删除 |
| `Profile.updatedAt` | 每次 Studio 修改更新时间 | Web store/Schema、Rust保存 | 否 | 否 | 管理 metadata | 是 | **MOVE** 到 Web-only；共享 wire 删除 |
| `KeyBinding.id` | React key；Runtime 生成 system id/source 回查 | Web、Repository、dispatch | 间接，仅因嵌套回查 | 包内 entry identity | 否 | 是 | **REMOVE**；RuntimeProfile.id 已承担本地 identity |
| `KeyBinding.slot` | Web 查找、编号、排序、六项限制 | Web；Rust只校验/保存 | 否 | 否 | 是 | 是 | **REMOVE**，编号由 array index 派生 |
| `KeyBinding.name` | 实际独立命令显示名 | Web、Repository复制、Runtime GUI | 否 | 否 | 用户可见领域 metadata | 否 | **MOVE** 为目标 `Profile.name` |
| `KeyBinding.description` | 独立命令说明 | Web、Repository复制、Runtime GUI | 否 | 否 | 用户可见 metadata | 否 | **MOVE** 为目标 `Profile.description?` |
| `KeyBinding.actions` | 有序动作链 | Web、Runtime dispatch | 是 | 否 | 否 | 否 | **MOVE/KEEP** 为目标 `Profile.actions` |
| `OpenAppAction.type` | TS discriminant/Schema/UI | Web；Rust丢弃 | Runtime 否 | 否 | 部分 | 可由 Execution.type 推导 | **DERIVE**，wire 中删除 |
| `OpenAppAction.appId` | Registry lookup、显示、去重、重新编译 | Studio only；Rust丢弃 | 否 | Registry ref | 否 | 对编译后 Profile 是 authoring metadata | **MOVE** 到 Web-only |
| `OpenAppAction.executions` | 每平台最终启动描述 | Web compile、Runtime | 是 | 否 | 否 | 否 | **KEEP** |
| `CommandAction.type` | TS discriminant/Schema/UI | Web；Rust丢弃 | Runtime 否 | 否 | 部分 | 可由 Execution.type 推导 | **DERIVE**，wire 中删除 |
| `CommandAction.commandId` | Registry lookup、显示、去重、清理 | Studio only；Rust丢弃 | 否 | Registry ref | 否 | 对编译后 Profile 是 authoring metadata | **MOVE** 到 Web-only |
| `CommandAction.name` | Studio Action 展示/默认 Profile 命名 | Studio only；Rust丢弃 | 否 | 否 | 是 | 与 Profile/entry name 重复 | **MOVE** 到 Web-only或 **DERIVE** 自 Registry |
| `CommandAction.executions` | 每平台最终快捷键 | Web compile、Runtime | 是 | 否 | 否 | 否 | **KEEP** |
| `Execution.type` | Primitive dispatcher discriminant | Web Schema、Rust dispatch | 是 | 否 | 否 | 否 | **KEEP** |
| `SendHotkeyExecution.keys` | 要按下/释放的真实键序列 | Runtime executor | 是 | 否 | 也用于展示 | 否 | **KEEP** |
| `LAUNCH_APP.executableNames` | Windows 启动候选 | Windows executor | 是 | 否 | 否 | 否 | **KEEP** |
| `LAUNCH_APP.aliases` | Windows alias 候选 | Windows executor | 是 | 否 | 否 | 否 | **KEEP** |
| `LAUNCH_APP.bundleIds` | macOS bundle 定位 | macOS executor | 是 | 否 | 否 | 否 | **KEEP** |
| `LAUNCH_APP.appNames` | macOS app name 定位 | macOS executor | 是 | 否 | 否 | 否 | **KEEP** |
| `LAUNCH_APP.knownPaths` | 当前平台显式路径 fallback | 两平台 executor | 是 | 否 | 否 | 否 | **KEEP** |

补充约束减法：

- 删除 `KEY_1`–`KEY_6` enum、slot 非空/enum 校验及“最多六项”领域约束。
- 保留 `actions` 数组顺序和 `keys` 非空/不重复约束。
- 保留每个 Action 至少一个平台 implementation；“当前平台未配置”仍是合法 Profile 的运行状态。
- 统一 Action 内不同平台应保持同一种 Execution primitive；这样 Action.type 才能安全派生。当前两个 TS Action schema 已隐含该约束。

## 7. Identity Model

### 当前 ID 用途

| ID | 真实用途 | 分类 | 目标判断 |
| --- | --- | --- | --- |
| `Profile.id` | 仅校验/保存；Import 不按它覆盖或去重 | 无关键逻辑 | **REMOVE** from shared |
| `KeyBinding.id` | 包内回查与 system Runtime id 种子 | 嵌套结构派生 identity | **REMOVE** with bindings layer |
| `RuntimeProfile.id` | GUI command target、Repository find/delete/rename、Binding foreign key | 真正客户端本地实例 identity | **KEEP local** |
| `sourceBindingId` | 从重复保存的 source Profile 中找回展开 entry | bindings[] 造成的 adapter key | **REMOVE** with flattening |
| `appId` | App Registry 引用 | Web authoring/Registry identity | **MOVE Web-only** |
| `commandId` | Command Registry 引用、SETUP 清理 | Web authoring/Registry identity | **MOVE Web-only** |

### 最小身份关系

```text
Web authoring item localId ── references ── appId / commandId
             │ compile
             ↓
Shared Profile (no required shared id)
             │ Runtime Import = Insert
             ↓
RuntimeProfile.id ── referenced by ── PersistedBinding.runtimeProfileId
                                           + physicalInput
```

当前没有真正需要跨系统稳定 Profile identity 的行为：没有按 id 更新、同步、去重、Marketplace identity 或 round-trip merge。重复导入明确生成新 RuntimeProfile，所以不能用未来假设保留 Profile.id。

## 8. Shared vs Local State

### Shared Profile Contract

只保留跨 Studio 编译结果、Runtime 与未来分发真正需要的内容：

```text
Profile
  name
  description?
  actions[]
    executions
      windows?
      macos?
        Execution.type
        Execution payload
```

`name/description` 虽不参与系统执行，但它们是用户创建能力的跨端展示语义，Runtime 当前真实显示，因此保留。

### Runtime Local State

```text
RuntimeProfile.id
localNameOverride?          // 只有用户改名后才需持久化
iconId?
source: SYSTEM | EXTERNAL
Profile                    // 单个共享 Profile，不再是多-entry source package

PersistedBinding
  runtimeProfileId
  physicalInput

Repository Vec order       // 当前显示顺序，无需新增 order 字段
```

当前 `RuntimeProfile.name` 是真实本地 override，但初始化时复制 source name。目标可改为可选 `localNameOverride` 并由 `override ?? profile.name` 派生展示。`description` 没有本地编辑入口，应从 Profile 推导。`createdAt` 无读取者，应删除。`source`、`iconId`、实体 Binding 都属于 Runtime local，不进入 shared Profile。

### Web-only State

```text
current draft/list identity
array selection/index/order
createdAt / updatedAt
appId / commandId Registry references
Registry item name/category/enabled
editing/search/form/save state
legacy localStorage handling（如果产品另行决定保留）
```

这些字段可用于 Studio 编辑与重新编译，但不应进入最终共享执行 Profile。

## 9. Proposed Minimal Target POJO

概念目标，不是本轮代码：

```text
Profile {
  name
  description?
  actions[]
}

Action {
  executions {
    windows?: Execution
    macos?: Execution
  }
}

Execution =
  LAUNCH_APP { platform locator fields }
  | SEND_HOTKEY { keys[] }
```

一个 Profile 就是一个可独立导入、展示、绑定和执行的用户能力。多个 Profile 的 Studio 列表或一次批量下载只是集合/传输表示；本轮不为它命名新的 `ProfilePackage` Domain 类型。

删除/下沉内容：

- 删除 `version/id/createdAt/updatedAt`：当前共享运行语义不需要；时间移到 Web 管理状态。
- 删除 `bindings[]/KeyBinding/id/slot/KEY_SLOTS`：独立 entry 提升为 Profile；数组顺序替代 slot 顺序。
- 删除 wire Action 顶层 `type`：由 Execution primitive 派生。
- 移出 `appId/commandId/CommandAction.name`：只留在 Web authoring/Registry state。
- 保留 Action 层：它仍表达“一个有序动作及其平台替代实现”，不是空壳。
- 保留 Execution type/payload：它是 Runtime 唯一执行依据。

### RuntimeProfile Reduction Detail

当前字段逐项：

| RuntimeProfile 字段 | 为什么存在 | 来源/是否副本 | 是否可推导 | 是否需持久化 | 目标 |
| --- | --- | --- | --- | --- | --- |
| `id` | 本地实例 command 与 Binding foreign key | 本地生成 | 否 | 是 | **KEEP** |
| `name` | GUI 展示、支持本地改名 | 初始复制 source binding；之后可分叉 | 默认值可推导，override 不可 | 仅 override 需 | **DERIVE + KEEP optional override** |
| `description` | GUI 副标题 | source binding 副本 | 是 | 否 | **REMOVE cache / DERIVE** |
| `iconId` | 用户本地图标选择 | 本地 | 否 | 是 | **KEEP local** |
| `source` | 系统项删除保护与 UI 分组 | 本地 import source | 否 | 是 | **KEEP local** |
| `sourceProfile` | 保存执行 payload | 整个导入包被每个 entry 重复复制 | flatten 后变成单 Profile | 是 | **KEEP one flattened Profile** |
| `sourceBindingId` | 在 sourceProfile.bindings 中找 entry | adapter identity | flatten 后不需要 | 否 | **REMOVE** |
| `createdAt` | 插入时间 | 本地生成；当前无读取 | 不需要 | 否 | **REMOVE** |

`RuntimeProfile.name + source binding.name` 的重复目前有一个真实理由：本地 rename 不修改原始 source Profile。但不需要始终复制；用 `localNameOverride?: string` 即可表达差异。`description` 没有本地编辑，因此纯属 convenience cache。

### Import Semantics Confirmation

当前代码明确符合：

```text
Import = Insert
```

证据：

- `insert_import` 总是调用 `insert(..., stable_ids=false)`。
- 外部 RuntimeProfile id 由时间、binding index 和当前 repository 长度组成。
- 没有按 `Profile.id` 查找或覆盖。
- 没有 slot 冲突检测、按 slot 覆盖或固定位置替换。
- 同一 fixture 连续导入的单元测试明确断言生成两组不同 ids、Repository 数量累加。
- 实体键冲突只在之后的 BindingState 处理，last binding wins；与 source slot 无关。

因此 `slot` 与当前 Import 语义完全无关。三个导出能力 Open IDEA / Copy / Paste 无需预声明 KEY_1/2/3；Runtime 只需要 append 三个本地实例，再由用户分别绑定 physical input。

### Platform and Action/Execution Reduction Detail

1. `executions.windows? / macos?` **KEEP**：当前产品明确允许单平台配置，Runtime 必须在一个动作中选择当前 OS implementation。
2. Action/Execution 分层 **KEEP，但缩窄 Action**：Action 保留有序动作边界和跨平台 alternatives；Execution 保留具体 primitive 与 payload。
3. 重复字段：`OpenAppAction.type` 与所有 implementation 的 `Execution.type=LAUNCH_APP` 重复；`CommandAction.type` 与 `SEND_HOTKEY` 重复。顶层 type 可派生。
4. `OPEN_APP appId + executions`：Studio 草稿阶段同时需要，编译后的共享 Profile 不需要 appId。
5. `COMMAND commandId + name + executions`：Studio Registry/展示阶段需要，Runtime Profile 不需要 id/name；Profile 自身已有用户可见 name。
6. Runtime 不读取 Registry ids，不是偶然缺实现：它已经只按 Execution dispatch。当前真实 round-trip 也不存在，因为 Rust serde 会丢弃这些字段并持久化裁剪结果。
7. 因此 Registry id 属于 Web 编译阶段 metadata，不应进入最终 shared Runtime Contract。

## 10. Impact Map

| 范围 | 收敛到目标 POJO 的影响 |
| --- | --- |
| Web/Studio | 当前单一集合需变为本地 Profile 列表；selection/update 从 slot 改为 Web local id/index；名称/说明/actions 从 binding 提升到 Profile；Registry refs 留在 authoring state。 |
| Contract | 删除 `KeySlot/KEY_SLOTS/KeyBinding`、顶层 metadata 和 Registry ids；Profile 直接持有 actions；Action wire 只持有平台 executions。 |
| Zod | 删除 slot enum、Profile version/time/id 和 Action Registry 字段校验；保留名称、actions、平台 implementation、Execution payload 约束。 |
| Runtime Rust | `Profile` 直接含 name/description/actions；删除 `ProfileBinding`、sourceBindingId 与按 binding 查找；Rust DTO 与 shared wire 对齐。 |
| Repository | 一次 Profile insert 生成一个 RuntimeProfile；不再复制整个多-binding source Profile N 次；本地 name 改为 optional override，description 派生，createdAt 删除。 |
| builtin fixture | 八个 binding entry 变为八个独立最小 Profile 数据项/加载输入；删除虚假 slot 和缺失 shared Action shape 的偏差。具体文件批量封装属于 transport，不新增 Domain 模型。 |
| localStorage | 现有 `keyflow.currentProfile` shape 会受影响；这是历史数据影响记录，不构成本轮保留旧字段的理由，也不在本轮设计 migration。 |
| export | 从“一个 Profile 包含多个 bindings”变为导出一个或多个独立 Profile；array order 可表达批量顺序。 |
| import | 从“一包展开 N 个 RuntimeProfile”变为“每个 Profile Insert 一个 RuntimeProfile”；重复导入仍 append，不按共享 id 覆盖。 |

## 11. Safe Cleanup Order

下一轮若获准清理，推荐顺序严格遵循减法：

1. **先删除纯历史字段**：确认目标后移除 shared `slot/KEY_SLOTS`、顶层时间、无用途 Profile.id；Studio 用 local id/index 维持编辑。
2. **再收平粒度**：把 entry 的 name/description/actions 提升到 Profile，删除 `KeyBinding/bindings[]`；先让 Studio export 与 shared Schema 一致。
3. **再移出 authoring metadata**：把 appId/commandId/CommandAction.name 留在 Web-only Registry/draft，shared Action 只输出 platform executions。
4. **再统一 Runtime adapter**：Rust Profile 与 shared wire 对齐；一次 Profile Insert 一个 RuntimeProfile；删除 sourceBindingId、description cache、createdAt，name 改为 local override。
5. **再修 fixtures/import-export tests**：builtin 和 example fixture 只使用目标 POJO，验证重复 import=append、当前平台选择和 Action 顺序。
6. **最后才考虑 Factory**：Factory 只能基于已经收敛的最小 Contract 创建 Open App/Hotkey Profile，不能先固化旧层级。

不先设计 compatibility registry、version upgrader 或并行 V2 类型。历史 localStorage/JSON 的处理应在目标模型获批后另行决定。

## 12. Do Not Add

本次审查不建议新增：

- 新版本系统或 `schemaVersion`
- Migration framework / compatibility registry
- Device Identity / HID 模型
- Workflow、Condition、Loop、Variable、Agent
- 新 App/Command Registry
- 新 Domain Layer
- `WebProfile / RuntimeProfileContract / StudioProfile` 等并行共享 Profile 类型体系
- 为批量下载而提前建立 `ProfilePackage` 领域模型

目标是让现有领域模型显露出来：共享 Profile 是一个可独立执行与绑定的能力；实体键、实例身份、来源、图标、改名和本地顺序属于 Runtime；Registry 引用与编辑时间属于 Web。

## Simplification Audit Receipt

- 本轮只使用 `rg` 与逐文件只读核对当前引用，没有修改 Contract、Rust、Studio、fixture、localStorage 或 Runtime 数据。
- 仅向既有架构文档追加本审查章节，保留上一轮结论与时间线。
- 未运行构建或测试：本轮没有代码变化，结论是静态代码事实审查，不宣称任何迁移或新目标 POJO已验证。

# Three-Layer Model Simplification Audit

> 审查日期：2026-09-02
>
> 本节以 `Web Authoring → Profile Transfer Protocol → Runtime Internal` 三层职责重新审查当前代码，只输出目标边界，不修改代码、Schema 或数据。
>
> 本节是三层职责明确后的最终结论；如与上一节“Profile Contract Simplification Audit”冲突，以本节为准。主要修正是：`Action.type` 应保留，`version` 应作为协议判别器保留。

## 1. Executive Conclusion

1. 三层不应共用一个 POJO。当前主要问题不是类型数量少，而是 Web authoring 字段、传输协议字段和 Runtime 本地字段混装在同一个 Profile shape 中。
2. Web 当前 `Profile.bindings[]` 实际是 authoring entries；`slot/KEY_SLOTS` 只服务旧逻辑键 UI，应完全退出 Web 最小持久模型和传输协议。entry 的稳定编辑 identity 应是 Web-only `localId`，顺序由数组表达。
3. Web authoring 中 `appId/commandId` 有真实职责：Registry 选择、查重和重新编译，因此保留为 Web-only。Action 内缓存的 `executions` 与 Registry 重复，导出时又会重新编译，应从最小 Web 草稿中删除并由 Registry 派生。
4. Profile Transfer Protocol 收敛为“一个 Profile = 一个可独立理解、导入、展示、绑定、执行的能力”，直接拥有 `name/description/actions`；`bindings[]/KeyBinding/slot` 全部退出协议。
5. `Profile.version` **KEEP**，但只作为协议 schema discriminator，用于接收方拒绝不兼容结构；它不等于 migration framework、upgrade pipeline 或多版本 Domain 类型。
6. `Action.type` **KEEP**，表达跨端业务意图 `OPEN_APP/COMMAND`；`Execution.type` **KEEP**，表达 Runtime primitive `LAUNCH_APP/SEND_HOTKEY`。Executor 不读取 Action.type，不代表协议接收方不需要业务语义。
7. `Profile.id/appId/commandId/createdAt/updatedAt` 全部退出传输协议：当前 Import=Insert，不按 source id 去重、覆盖或同步；Registry id 与时间只属于 producer authoring。
8. Runtime 最小模型是 `Runtime local state + 原始 Profile`：保留 RuntimeProfile.id、localNameOverride、iconId、source、Repository 数组顺序和独立 physical binding；删除 sourceBindingId、slot、createdAt、description cache 与整包重复副本。
9. Profile 导入只需要一个明确 adapter：校验协议、生成 RuntimeProfile.id/source、本地 override 置空并 append。执行时直接读取内嵌 Profile；不需要 Profile DTO → RuntimeDomain → RuntimeAction 的多层同构复制。
10. 本轮没有代码无法回答的字段归属问题。唯一未规定的是“批量 Profile 文件采用数组还是 envelope”，它是 transport container 选择，不影响单 Profile 协议，列入 DEFER。

## 2. Web Authoring Model Audit

### 当前真实结构

当前 Web 持久化三份数据：

```text
keyflow.currentProfile
keyflow.appRegistry
keyflow.commandRegistry
```

`currentProfile.bindings[]` 同时保存 entry 编辑 identity、slot、展示 metadata、Registry 引用和已编译 executions。页面 selection/editing/picker/search/saveState 存在 React component state 中，不进入 localStorage。当前没有独立 compile cache；`compileProfile` 在导出时从 Registry 重新生成 executions。

| 字段 | 当前职责 | Web 是否需要 | 是否应进入 Profile | 可否推导 | 建议 |
| --- | --- | ---: | ---: | ---: | --- |
| current Profile/draft 容器 | 保存当前编辑集合 | 是 | 否，容器不是单能力协议 | 否 | **KEEP WEB-ONLY** |
| `bindings[]` | 保存多个可编辑能力 entry | 是，但命名/shape 不需要 | 否 | 可改为 drafts 数组 | **REMOVE** 旧 shape，保留 Web-only draft list |
| `KeyBinding.id` | React key、Web entry identity | 是 | 否 | index 不足以稳定支撑编辑/删除 | **KEEP WEB-ONLY**，语义改为 `localId` |
| `slot` | 查找 entry、显示编号、排序、限制六项 | 否 | 否 | 全部可由 localId + array index/order 派生 | **REMOVE** |
| `KEY_SLOTS/KeySlot` | 旧逻辑键 enum 与六项上限 | 否 | 否 | 不需要 | **REMOVE** |
| entry `name` | 用户能力名称 | 是 | 是 | 否 | **MOVE TO PROFILE** |
| entry `description` | 用户能力说明 | 是 | 是，可选 | 否 | **MOVE TO PROFILE** |
| entry `actions[]` | 用户配置的有序动作 | 是 | 是 | 顺序由数组表达 | **MOVE TO PROFILE**，但编译前后字段不同 |
| authoring Action `type` | 区分 App/Command Registry 引用与 UI | 是 | 对应业务 type 也应进入协议 | 否 | **KEEP WEB-ONLY** authoring discriminant，并在 compile 输出到 Profile |
| `appId` | App Registry 引用、查重、显示、重新编译 | 是 | 否 | 不能从 execution 稳定反查 Registry | **KEEP WEB-ONLY** |
| `commandId` | Command Registry 引用、查重、清理、重新编译 | 是 | 否 | 不能从 keys 稳定反查 Registry | **KEEP WEB-ONLY** |
| `CommandAction.name` 快照 | Action 展示和默认命名 | 否 | 否 | 可由 Command Registry 的 commandId 派生 | **DERIVE** |
| authoring Action `executions` 快照 | 当前 Profile 内缓存 Registry 编译结果 | 否，导出会重新编译 | 编译结果应进入 Profile | 可由 Registry ref 派生 | **DERIVE**；不要在最小草稿重复持久化 |
| `Profile.id="default"` | Schema 必填；无 Web 选择/引用行为 | 否 | 否 | 不需要 | **REMOVE** |
| `createdAt` | 创建时写入；UI 不读取 | 否 | 否 | 不需要 | **REMOVE** |
| `updatedAt` | 每次写入刷新；UI 不读取 | 否 | 否 | 不需要 | **REMOVE** |
| draft array order | Studio 列表顺序、批量 export 顺序 | 是 | 否 | 数组自身表达 | **DERIVE**，不新增 order 字段 |
| action array order | 动作执行顺序 | 是 | 是 | 数组自身表达 | **MOVE TO PROFILE** |
| selection/current entry | 当前编辑对象 | 是，瞬时 UI state | 否 | 由 selected localId + list 得到 | **KEEP WEB-ONLY** |
| picker/editing/search/save state | UI 交互状态 | 是，瞬时 | 否 | 部分可派生但无须协议化 | **KEEP WEB-ONLY** |
| compile cache | 当前不存在；export 即时 compile | 否 | 否 | 即时生成 | **REMOVE / DO NOT ADD** |
| App/Command Registry metadata | authoring 选择与编译来源 | 是 | 否 | Registry 自身是事实源 | **KEEP WEB-ONLY** |

### 最小 Web 减法

Web 不需要继续持久化“带 executions 的传输 Profile 草稿”。最小 authoring state 只保存独立能力 drafts 和 Registry refs；compile 时读取 Registry，输出自包含 Profile。这样避免同一 execution 同时存在 Registry、draft Action 和导出 Profile 三份快照。

## 3. Profile Transfer Protocol Audit

判断标准不是“当前 Rust Executor 是否读取”，而是任意接收方能否在没有 Web Registry、Runtime database、slot 或 producer id 时完整理解该能力。

| 字段 | 建议 | 跨端不可替代职责 / 移除归属 |
| --- | --- | --- |
| `Profile.version` | **KEEP** | 协议 schema discriminator；接收方需要明确判断能否安全解析。只支持一个值也有拒绝错误协议的职责，不意味着 migration system。 |
| `Profile.name` | **KEEP** | 人类可读的能力名称；Runtime 导入后需要展示，手写 Profile 也需要自描述。 |
| `Profile.description?` | **KEEP** | 可选的人类可读说明；跨 producer/consumer 解释能力，不是 Runtime cache。 |
| `Profile.actions[]` | **KEEP** | 能力的有序动作链，是实际行为主体。 |
| `Action.type` | **KEEP** | 业务意图：`OPEN_APP` 或 `COMMAND`。允许 UI/validator 在当前平台未配置时仍理解动作，约束各平台 execution 属于同一业务动作。 |
| `Action.executions` | **KEEP** | 将同一业务动作的 Windows/macOS 明确实现收在一起，支持单平台合法配置且禁止跨平台猜测。 |
| `executions.windows?` | **KEEP** | Windows 明确 implementation。 |
| `executions.macos?` | **KEEP** | macOS 明确 implementation。 |
| `Execution.type` | **KEEP** | Runtime primitive dispatcher 的唯一判别：`LAUNCH_APP/SEND_HOTKEY`。与 Action.type 职责不同。 |
| `SEND_HOTKEY.keys[]` | **KEEP** | 自包含的实际按键序列；接收方不能从 `COMMAND` 名称推断。 |
| `LAUNCH_APP.executableNames` | **KEEP** | Windows 应用启动 locator。 |
| `LAUNCH_APP.aliases` | **KEEP** | Windows alias/PATH 候选。 |
| `LAUNCH_APP.bundleIds` | **KEEP** | macOS bundle locator。 |
| `LAUNCH_APP.appNames` | **KEEP** | macOS app name locator。 |
| `LAUNCH_APP.knownPaths` | **KEEP** | 用户/producer 明确提供的当前平台路径 fallback。 |
| `Profile.id` | **REMOVE** | 当前没有 transfer identity 使用；Import=Insert，不去重、覆盖或同步。若 Web 需 local id，留在 authoring。 |
| `bindings[]` | **REMOVE** | 旧“一个包内多个逻辑键”层；一个 Profile 已收敛为一个独立能力。 |
| `KeyBinding` | **REMOVE** | 不含实体键关系，名称与 Runtime Binding 冲突；其 name/description/actions 提升到 Profile。 |
| `slot/KEY_SLOTS` | **REMOVE** | producer UI 顺序泄漏；接收方理解和执行不需要。 |
| `KeyBinding.id` | **REMOVE** | 只为旧包内 entry/sourceBindingId 回查；单能力 Profile 不需要。 |
| `appId` | **REMOVE** | Web App Registry identity；最终 execution 已自包含启动 locator。 |
| `commandId` | **REMOVE** | Web Command Registry identity；最终 execution 已自包含 keys。 |
| `CommandAction.name` | **REMOVE** | Web Registry/UI metadata；能力层已有 Profile.name，Action 业务 type 已足够理解动作。 |
| `createdAt/updatedAt` | **REMOVE** | producer authoring metadata；不影响接收方理解、校验或执行。 |
| physical input / icon / source / local order / local rename | **REMOVE** | Runtime local state，不属于可移植能力。 |

### 协议约束

- Profile 表示单能力，可以包含多个有序 Action。
- 每个 Action 至少提供一个平台 implementation。
- `OPEN_APP` 的所有 implementation 必须是 `LAUNCH_APP`；`COMMAND` 的所有 implementation 必须是 `SEND_HOTKEY`。
- 当前平台缺失是合法 Profile 的运行状态，不回退、不转换、不猜测。
- keys 必须非空且不能重复；locator 必须至少提供一个当前 primitive 可用的定位线索。
- Profile 应能脱离 Registry 独立阅读、手写、验证和执行。

## 4. Runtime Internal Model Audit

### 当前模型

```text
RuntimeProfile {
  id, name, description, iconId, source,
  sourceProfile, sourceBindingId, createdAt
}

BindingState {
  bindings: PersistedBinding[]
  physicalToProfile
  profileToPhysical
}

PersistedBinding {
  runtimeProfileId,
  physicalInput
}
```

| 字段 | 当前职责 | 本地真实状态 | Profile 副本 | 可推导 | 需持久化 | 建议 |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| `RuntimeProfile.id` | Repository command identity、Binding foreign key | 是 | 否 | 否 | 是 | **KEEP LOCAL** |
| `RuntimeProfile.name` | 初始复制 entry name；rename 后成为本地值 | 部分 | 是 | 默认可由 Profile.name 推导 | 只有 override 需 | **REPLACE WITH localNameOverride?** |
| `RuntimeProfile.description` | GUI 副标题 | 否 | 是 | 可由 Profile.description 推导 | 否 | **REMOVE / DERIVE** |
| `iconId?` | 用户本地图标选择 | 是 | 否 | 否 | 是 | **KEEP LOCAL** |
| `source` | SYSTEM/EXTERNAL 分组与删除保护 | 是 | 否 | 否 | 是 | **KEEP LOCAL** |
| `sourceProfile` | 保存导入执行 payload | 旧整包在每个 entry 重复 | flatten 后是单个原始 Profile | 不可删除执行 payload | 是 | **KEEP AS profile: Profile**，不再复制 package |
| `sourceBindingId` | 在旧 sourceProfile.bindings 中找被展开 entry | 否 | 否 | 只因旧层级存在 | 否 | **REMOVE** |
| `createdAt` | insert 时生成；当前无人读取 | 否 | 否 | 不需要 | 否 | **REMOVE** |
| `slot`（source 内） | Rust只保存/校验 | 否 | 是 | 不需要 | 否 | **REMOVE** |
| repository Vec order | GUI 当前显示/插入顺序 | 是 | 否 | Vec 自身表达 | 随 repository 保存 | **KEEP/DERIVE**，不新增 order 字段 |
| `PersistedBinding.runtimeProfileId` | 指向本地实例 | 是 | 否 | 否 | 是 | **KEEP LOCAL** |
| `PersistedBinding.physicalInput` | 实体触发键 | 是 | 否 | 否 | 是 | **KEEP LOCAL** |
| `physicalToProfile` | 执行时从 key 查实例 | 是，内存索引 | 否 | 可由 persisted bindings rebuild | 否 | **DERIVE IN MEMORY** |
| `profileToPhysical` | UI/改绑/解绑反向索引 | 是，内存索引 | 否 | 可由 persisted bindings rebuild | 否 | **DERIVE IN MEMORY** |
| snapshot `actionHotkey` | GUI convenience | 否 | 是/执行数据投影 | 可从 Profile 当前平台 actions 派生 | 否 | **DERIVE VIEW ONLY** |
| snapshot `physicalInput` | GUI 展示 | 否，view projection | 来自 BindingState | 可查反向索引 | 否 | **DERIVE VIEW ONLY** |

### Adapter 最小职责

```text
validated Profile
→ allocate RuntimeProfile.id
→ set source
→ localNameOverride = none
→ iconId = none
→ append { local state + Profile }
```

不需要把 Action/Execution 再复制为 RuntimeAction/RuntimeExecution；Rust 需要一个与协议对应的 serde DTO 作为 RuntimeProfile 内的 `profile`，Executor 直接读取它即可。

## 5. Cross-Layer Leakage

| 字段/结构 | 当前在哪层定义 | 实际属于哪层 | 泄漏原因 | 应如何收回 |
| --- | --- | --- | --- | --- |
| `slot/KEY_SLOTS` | shared Profile + Web + Rust DTO | 旧 Web UI；目标中无职责 | 曾把 logical key 当跨端 identity | 删除；Web 用 localId/index，Runtime 用 physical Binding |
| `bindings[]/KeyBinding` | shared Profile | 旧 Web authoring collection | 曾把一套键盘配置作为单 Profile | entry 提升为单 Profile，Web 自己维护 draft list |
| `Profile.id="default"` | shared Profile | 当前无真实层归属 | Schema/历史 shape 要求 | 删除；Web 若需 local identity 使用 localId |
| `createdAt/updatedAt` | shared Profile | Web authoring metadata，但当前 UI也不用 | Web store 时间戳直接进入 export | 从协议删除；当前无功能则 Web 也删除 |
| `appId` | shared Action | Web Registry authoring | Web draft 与 compiled Profile 共用 POJO | 留在 Web action draft，compile 后丢弃 |
| `commandId` | shared Action | Web Registry authoring | 同上 | 留在 Web action draft，compile 后丢弃 |
| `CommandAction.name` | shared Action | Web Registry/UI projection | 缓存 command name | 从 Registry 派生，不输出到协议 |
| Action `executions` 草稿快照 | Web localStorage/shared shape | Profile compile output | authoring 与 transfer 同 POJO | Web 只存 Registry ref；compile 生成 protocol executions |
| `sourceBindingId` | RuntimeProfile | 旧 Profile→Runtime adapter | import 将包内 entry 展开却保留整包 | 单 Profile import 后删除 |
| Runtime `description` | RuntimeProfile | Profile | GUI convenience cache | 从 `profile.description` 派生 |
| Runtime `name` 初始副本 | RuntimeProfile | Profile + Runtime override | 为支持本地 rename 而全量复制 | 只持久化 `localNameOverride?` |
| source Profile package copy | 每个 RuntimeProfile | Transfer payload，但粒度错误 | 每个 binding 都复制整包 | RuntimeProfile 只嵌入对应单 Profile |
| `iconId` | RuntimeProfile/snapshot | Runtime local | 当前没有泄漏进 shared Profile | 保持 Runtime-only |
| `source` | RuntimeProfile/snapshot | Runtime local | 当前没有泄漏进 shared Profile | 保持 Runtime-only |
| `physicalInput` | Binding/snapshot | Runtime local | 当前没有泄漏进 shared Profile | 保持 Runtime-only |

当前没有 Runtime-only 字段进入 TypeScript shared Profile 的严重反向泄漏；主要泄漏方向是 Web authoring → Profile，以及 Profile 旧包结构 → Runtime 重复缓存。

## 6. Identity Audit

### Web identity

```text
Draft.localId
AppDefinition.id (appId)
CommandDefinition.id (commandId)
```

- `Draft.localId`：用于 React key、选择、编辑、删除和 localStorage 中稳定定位，只在 Web 有意义。
- `appId/commandId`：真正 Registry identity，用于 lookup、查重和 compile；不跨入 Profile Protocol。
- 当前 `Profile.id/default` 没有 Web 引用者，不是有效 authoring identity。

### Transfer identity

当前 Profile **不需要稳定 id**：

- 不用于引用：Runtime Binding 指向 RuntimeProfile.id。
- 不用于去重：重复 import 会 append。
- 不用于覆盖：Repository 从不按 Profile.id 查找。
- 不用于同步：当前没有 sync/merge。
- 不用于 Registry lookup：协议已 self-contained。

因此 Transfer Profile 的 identity 是其传输对象本身，而不是一个 id 字段。文件名也不进入协议。

### Runtime identity

```text
RuntimeProfile.id
PersistedBinding.runtimeProfileId → RuntimeProfile.id
```

这是当前真正用于 Repository find、rename、icon、delete、snapshot command 和实体 Binding foreign key 的 identity，必须保留为 Runtime local。

`KeyBinding.id/sourceBindingId` 只因旧多-entry Profile 展开存在；`builtin-*` id 当前也兼作稳定 system Runtime id 种子。目标应由 builtin import/seed adapter 直接分配稳定 RuntimeProfile.id，而不是把 fixture entry id 留在 Transfer Profile。

## 7. Final Web Model

唯一推荐的最小 authoring 概念：

```text
WebAuthoringState {
  drafts: ProfileDraft[]
  appRegistry: AppDefinition[]
  commandRegistry: CommandDefinition[]
}

ProfileDraft {
  localId
  name
  description?
  actions: AuthoringAction[]
}

AuthoringAction =
  { type: OPEN_APP, appId }
  | { type: COMMAND, commandId }
```

规则：

- draft 与 action 顺序由数组表达，不保存 slot/order 字段。
- selection/editing/search/picker/save feedback 是 component/store UI state，不属于持久 authoring Domain。
- executions 在 compile 时从 Registry 读取，不在 draft 重复缓存。
- createdAt/updatedAt 当前没有产品功能读取，删除而不是保留“以备以后”。
- `localId` 不输出到 Profile。

## 8. Final Profile Protocol

唯一推荐的最小、可手写协议：

```text
Profile {
  version
  name
  description?
  actions: Action[]
}

Action =
  OpenAppAction {
    type: OPEN_APP
    executions {
      windows?: LaunchAppExecution
      macos?: LaunchAppExecution
    }
  }
  |
  CommandAction {
    type: COMMAND
    executions {
      windows?: SendHotkeyExecution
      macos?: SendHotkeyExecution
    }
  }

LaunchAppExecution {
  type: LAUNCH_APP
  executableNames? / aliases? / bundleIds? / appNames? / knownPaths?
}

SendHotkeyExecution {
  type: SEND_HOTKEY
  keys[]
}
```

示例：

```json
{
  "version": "<target-protocol-version>",
  "name": "复制",
  "description": "复制当前选中的内容",
  "actions": [
    {
      "type": "COMMAND",
      "executions": {
        "windows": { "type": "SEND_HOTKEY", "keys": ["CTRL", "C"] },
        "macos": { "type": "SEND_HOTKEY", "keys": ["META", "C"] }
      }
    }
  ]
}
```

上例中的 `version` 是概念占位符，不是建议的实际字面值。目标 shape 与当前 v1.2 不兼容，因此不能继续标成 `1.2`；实际 discriminator 需在实施前单独确定。该对象不依赖 producer id、Registry、slot、UI 顺序或 Runtime local database。`version` 只是协议判别器；本轮不新增迁移或升级设施。

## 9. Final Runtime Model

唯一推荐的最小 Runtime 持久结构：

```text
RuntimeRepository {
  profiles: RuntimeProfile[]          // 数组即本地顺序
}

RuntimeProfile {
  id                                 // Runtime local instance id
  profile: Profile                   // 原始、已验证 transfer object
  localNameOverride?
  iconId?
  source: SYSTEM | EXTERNAL
}

BindingStore {
  bindings: PersistedBinding[]
}

PersistedBinding {
  runtimeProfileId
  physicalInput
}

Runtime memory indexes {
  physicalToProfile                  // 从 bindings 派生
  profileToPhysical                  // 从 bindings 派生
}
```

展示字段：

```text
displayName = localNameOverride ?? profile.name
description = profile.description
physicalInput = profileToPhysical[runtimeProfile.id]
actionHotkey = derive(profile.actions, currentPlatform)
```

Runtime 不保存 slot、sourceBindingId、createdAt、description cache、name 默认副本或重复 source package。

## 10. Final Data Flow

### 正向

```text
Web ProfileDraft
  localId + Registry refs
        ↓ compile
  丢弃 localId/appId/commandId/UI state
  从 Registry 生成 self-contained executions
        ↓
Profile Transfer Protocol
  version + name + description? + typed actions/executions
        ↓ validate + import adapter
  校验 protocol
  生成 RuntimeProfile.id/source
  初始化 localNameOverride/iconId
        ↓
RuntimeProfile { local state + Profile }
        ↓ bind
PersistedBinding { runtimeProfileId, physicalInput }
        ↓ physical key
RuntimeProfile.profile.actions（数组顺序）
        ↓ executions[currentPlatform]
Execution.type
        ↓
LAUNCH_APP / SEND_HOTKEY Executor
```

只发生两次有价值的转换：

1. compile：Registry refs → 自包含 platform executions。
2. import adapter：portable Profile → Runtime local instance。

其余 Action/Execution 不应同构复制。

### Runtime 反向导出

```text
RuntimeProfile
        ↓ export adapter
取 runtimeProfile.profile
丢弃 id/localNameOverride/iconId/source/physicalInput/local order
        ↓
Profile Transfer Protocol
```

默认导出保留原始 portable `profile.name`，不把本地 rename 写回协议；本地 rename 是实例偏好。如果产品明确提供“将本地改名另存为新 Profile”，那是显式用户操作，不是默认 adapter 行为。

## 11. Safe Remove

以下是纯历史、未参与当前关键行为或可直接派生的目标删除项：

- `RuntimeProfile.createdAt`：当前没有读取者。
- RuntimeProfile `description` cache：直接来自 Profile，无本地编辑。
- snapshot 持久化设想中的 `actionHotkey/physicalInput`：保持 view projection，不进入 Repository。
- Web `Profile.createdAt/updatedAt`：当前 UI、排序、查重和 compile 都不读取。
- Web/Transfer `Profile.id="default"`：没有引用、覆盖、去重或同步职责。
- `CommandAction.name` 快照：由 Command Registry 派生，协议由 Profile.name + Action.type 自描述。
- authoring draft 中的 executions cache：export 已从 Registry 重新编译。
- 显式 `order` 字段：当前不存在，也不应新增；数组顺序已足够。

这些字段的代码删除仍需正常静态测试，但不改变业务能力或目标 shape 的主体粒度。

## 12. Structural Cleanup

以下删除会调整结构，但不改变现有产品能力：

- `bindings[]/KeyBinding` 收平为一个 Profile 一个能力。
- entry `name/description/actions` 提升到 Profile。
- 删除 `slot/KEY_SLOTS/KeySlot`，Web update/selection 改用 localId，编号用 array index。
- Web authoring 与 Transfer Profile 分离：appId/commandId 留在 draft，compile 只输出 executions。
- Rust `ProfileBinding` 删除，Profile 直接持有 actions。
- Runtime Import 从“一包展开 N 项”变为“一 Profile Insert 一 RuntimeProfile”。
- 删除 `sourceBindingId` 与 source package N 份复制。
- Runtime `name` 改为 `localNameOverride?`，默认展示从 Profile 推导。
- builtin fixture 从旧多-binding package 收敛为单能力 Profile 输入集合；稳定 system id 由 Runtime seed adapter 分配。
- import/export fixture、Schema parity 与 Repository tests 按三层边界重写。

这些都是 shape/adapter 清理，不需要新 Domain Layer、package 或 Factory。

## 13. Keep

### Web-only

- draft `localId`
- Profile draft name/description/actions
- `appId/commandId`
- App/Command Registry 及其编辑 metadata
- draft/action 数组顺序
- selection/editing/search/save feedback 等 UI state

### Profile Protocol

- `version`（仅 protocol discriminator）
- `name/description?`
- 有序 `actions[]`
- `Action.type`
- `executions.windows?/macos?`
- `Execution.type`
- `SEND_HOTKEY.keys`
- `LAUNCH_APP` 当前 locator fields

### Runtime-only

- `RuntimeProfile.id`
- 内嵌、已验证 `Profile`
- `localNameOverride?`
- `iconId?`
- `source`
- Repository 数组顺序
- `runtimeProfileId + physicalInput`
- 从 Binding 派生的双向内存索引

## 14. Deferred Questions

1. **批量文件容器**：一次导出多个独立 Profile 时使用 JSON array，还是使用仅负责 transport 的 envelope。当前代码只能证明需要批量能力，不能决定外部生态更适合哪种文件容器；这不影响单 Profile Protocol。
2. **目标 protocol discriminator 字面值**：目标 shape 与当前 v1.2 不兼容，必须使用不同 discriminator，但仅靠当前代码不能命名它。本轮不把该问题扩张成版本系统或 migration 设计。

除此之外没有需要 DEFER 的字段归属问题。尤其 `slot`、三层 ids、Action.type、version 字段本身、Registry refs 和 Runtime caches 都能由当前职责直接判断。

## Three-Layer Audit Receipt

- 本轮只审查现有三层职责并追加文档，没有修改 TypeScript、Rust、Schema、fixture、localStorage 或 Runtime 数据。
- 未设计 migration、Factory、Creator、Device Identity、Workflow、新 Domain Layer或新 package。
- 未运行构建/测试；没有代码变化。本节结论来自当前代码引用、import/export、Repository、Binding 与执行路径的静态事实。

# Three-Layer Cleanup Receipt

## 1. Final Models

实际代码已落地为三层不同模型。

```text
Web Authoring
WebAuthoringState { drafts[] }
ProfileDraft { localId, name, description?, AuthoringAction[] }
AuthoringAction = OPEN_APP + appId | COMMAND + commandId

Profile Protocol v2.0
Profile { version, name, description?, Action[] }
Action.type + executions.windows?/macos?
Execution.type + payload

Runtime Internal
RuntimeProfile { id, profile, localNameOverride?, iconId?, source }
PersistedBinding { runtimeProfileId, physicalInput }
```

Web 与 Runtime 不再把 Transfer Profile 当内部 authoring/local POJO。唯一跨端标准位于 `packages/keyflow-contract` 的 Profile v2.0 shape，Rust `profile.rs` 是该协议的 serde 映射。

## 2. Removed Fields

实际从 Profile Protocol 删除：

- `Profile.id`
- `createdAt/updatedAt`
- `bindings[]/KeyBinding/KeyBinding.id`
- `slot/KEY_SLOTS/KeySlot`
- `appId/commandId/CommandAction.name`
- 所有 Runtime-only identity、physical binding、icon、source/order

实际从 Web draft 删除：

- fixed `KEY_1`–`KEY_6` 与最多六项限制
- `Profile.id="default"`
- timestamps
- Action executions 快照
- Command name 快照

实际从 RuntimeProfile 删除：

- `name` 默认副本，改为 `localNameOverride?`
- description cache
- `sourceProfile/sourceBindingId`
- createdAt
- slot/ProfileBinding
- 每个 entry 重复保存旧 source package

Registry 的 AppDefinition/CommandDefinition 仍保留各自 Web 管理 metadata；这些不是 Profile Protocol 字段。

## 3. Web Compile Path

```text
ProfileDraft.localId/name/description/actions
  OPEN_APP.appId ── lookup App Registry ── LAUNCH_APP executions
  COMMAND.commandId ─ lookup Command Registry ─ SEND_HOTKEY executions
        ↓ profileSchema.parse
Profile v2.0
```

`localId/appId/commandId` 在 `profileCompiler.ts` 终止，不进入返回的 Profile。缺失 Registry 引用、空名称、空 Action、无平台 implementation 或非法 execution 会阻止导出。

## 4. Profile Protocol

最终 TypeScript 概念与 Zod shape：

```ts
interface Profile {
  version: string; // Schema literal: "2.0"
  name: string;
  description?: string;
  actions: Action[];
}

type Action =
  | { type: "OPEN_APP"; executions: { windows?: LaunchAppExecution; macos?: LaunchAppExecution } }
  | { type: "COMMAND"; executions: { windows?: SendHotkeyExecution; macos?: SendHotkeyExecution } };

type Execution =
  | { type: "LAUNCH_APP"; executableNames?; aliases?; bundleIds?; appNames?; knownPaths? }
  | { type: "SEND_HOTKEY"; keys: KeyCode[] };
```

最终 protocol discriminator 是 **`"2.0"`**。选择原因：目标 shape 与 v1.2 不兼容，`2.0` 是不引入额外版本设施的最小明确 major discriminator。没有新增 FactoryV2、MigrationRegistry 或 UpgradePipeline。

## 5. Runtime Import Path

```text
JSON object 或 JSON Profile[]
→ Profile::many_from_file / many_from_json
→ serde strict DTO + Profile::validate
→ ProfileRepository::insert_import
→ RuntimeProfile { generated id, profile, no override/icon, EXTERNAL }
→ profiles.json
```

一个 Profile 生成一个 RuntimeProfile。数组文件按数组顺序逐个 Insert。重复导入不按 source id 去重。

## 6. Runtime Execution Path

```text
physicalInput
→ BindingState.physicalToProfile
→ RuntimeProfile.id
→ RuntimeProfile.profile.executions_for(currentPlatform)
→ Profile.actions 原数组顺序
→ action.executions[currentPlatform]
→ Execution.type
→ existing Executor
```

不存在 RuntimeAction/RuntimeExecution 同构副本。`Action.type` 只用于协议业务语义与校验；Executor 继续仅按 `Execution.type` 分发。

## 7. Runtime Local State

- `RuntimeProfile.id`：Repository identity 与 PersistedBinding foreign key，持久化在 `profiles.json`。
- `profile`：完整、严格验证后的 portable Profile，持久化在 `profiles.json`。
- `localNameOverride?`：默认 None；用户 rename 后才写入。UI 为 `override ?? profile.name`。
- `iconId?`：本地图标选择，持久化在 `profiles.json`。
- `source`：SYSTEM/EXTERNAL 分组与删除保护，持久化在 `profiles.json`。
- local order：由 Repository `profiles` 数组顺序表达，没有新增 order 字段。
- physical binding：`runtimeProfileId + physicalInput` 独立保存在 `bindings.json`。
- 双向 Map：启动时从 PersistedBinding rebuild，不单独持久化。

默认导出 portable Profile 时不包含 localNameOverride；本轮没有新增 Runtime export UI。

## 8. Builtin Cleanup

旧 `builtin-profile.json` 已删除。新 `builtin-profiles.json` 是 8 个独立 Profile v2.0 的数组：复制、粘贴、剪切、撤销、重做、全选、保存、查找。

这些 Profile 不含 id、slot、KEY_1–KEY_8、bindings 或 Registry id。`repository.rs` seed adapter 按数组顺序配对 Runtime-only stable ids：

```text
system-builtin-copy
system-builtin-paste
...
system-builtin-find
```

stable id 不进入 Profile Protocol。

## 9. Import / Export Semantics

```text
Import = Insert
```

同一 Profile 导入两次生成两个不同 RuntimeProfile.id。Web 批量导出最终选择最小 JSON array；数组每一项都独立通过 Profile v2.0 Schema，Runtime 同时接受单 Profile object 和 Profile array 文件。

## 10. Compatibility Impact

- 旧 `keyflow.currentProfile` localStorage 不再读取；Web 使用新 key `keyflow.profileDrafts`。旧浏览器配置不会自动迁移，页面从空 drafts 开始。
- 旧 Profile v1.2 JSON 会被 Runtime 以 `UNSUPPORTED_PROFILE_VERSION` 或 shape error 拒绝。
- 旧 Runtime `profiles.json` 与新 RuntimeProfile shape 不兼容；沿用 Repository 现有失败回退行为，旧 external RuntimeProfile 不会载入，随后重新 seed 8 个 system profiles。
- `bindings.json` 会在启动 rebuild 时过滤不存在的旧 external RuntimeProfile id；稳定 system ids 仍可继续关联对应 system profile。
- 没有建设 migration framework；开发环境需要旧外部能力时，应重新从 v2.0 Profile 导入。

## 11. Files Changed

- `packages/keyflow-contract/src/{profile,action,execution,constants,index}.ts`：Profile v2.0 类型减法。
- `packages/keyflow-contract/src/schemas/{profile,execution}.schema.ts`：严格 v2.0 Schema 与 execution 校验。
- `packages/keyflow-contract/fixtures/profile-v2.0.example.json`：独立、可手写 Profile fixture；删除 v1.2 fixture。
- `src/models/authoring.ts`：最小 Web-only draft 边界。
- `src/stores/profileStore.ts`、`storageService.ts`：draft list/localId 持久化，删除 slot 与旧 migration。
- `src/services/profileCompiler.ts`：Registry ref → self-contained Profile compile。
- `src/services/exportService.ts`：Profile 数组校验/下载。
- `src/services/setupService.ts`：仅处理 authoring refs 与展示派生，不创建 transfer Action cache。
- `src/pages/{Overview,KeySetup,KeyMapping,Export}Page.tsx`、`AppLayout.tsx`：按 draft/index 展示与编辑，移除逻辑 Slot/六项 UI。
- `runtime/src-tauri/src/profile.rs`：Rust v2.0 protocol DTO、严格验证、当前平台/顺序读取。
- `runtime/src-tauri/src/repository.rs`：最小 RuntimeProfile、Import=Insert、本地 rename override、builtin seed。
- `runtime/src-tauri/src/main.rs`：直接通过 `RuntimeProfile.profile.actions` 执行与派生 snapshot。
- `runtime/src-tauri/fixtures/builtin-profiles.json`：8 个独立 Profile；删除旧 fixture。
- `tests/model-tests.ts`、root `package.json`：Profile Schema/Web compile tests。

`.gitignore` 中 `docs/` 是本轮开始前已存在的用户修改，本轮未编辑或撤销。

## 12. Tests Added / Updated

- TS model tests：Command compile 无 commandId、App compile 无 appId、无 localId、v2.0 Schema、拒绝 v1.2/slot、macOS-only、Action 顺序。
- Rust Profile tests：手写 v2.0、macOS-only import、Action/Execution mismatch、CURRENT_PLATFORM_NOT_CONFIGURED、多 Action 顺序。
- Rust Repository tests：重复 Import ids 不同、本地 rename 不改 portable name、8 个 system profiles seed once/不可删除。
- 既有 Binding last-wins 与 Execution key mapping tests 保留未改。

## 13. Verification Results

### Passed

- Studio `npm run typecheck`
- Studio `npm run build`
- Studio `npm run test:models`
- Runtime TypeScript `npm run typecheck`
- Runtime TypeScript `npm run build`
- Runtime Rust `cargo check`
- Runtime Rust `cargo test`：8 项通过
- `git diff --check`

### Not run

- 工程没有现成的真实浏览器自动化测试基础设施，因此未执行 Web 浏览器端到端测试。
- 未启动桌面 Runtime 对旧开发数据执行人工重置与窗口冒烟测试。
- 按本轮范围，未执行真实键盘、macOS/Windows Executor、全局快捷键和系统应用启动实机验证。

### Requires manual verification

- 清理旧 `keyflow.currentProfile` 与旧 Runtime `profiles.json` 后，人工确认首次启动、八个 builtin 展示和批量 JSON 导入 UI。
- 静态、构建和仓储测试通过不等同于真实桌面窗口与操作系统 Executor 证明。

## 14. Scope Check

本轮没有修改：

- `runtime/src-tauri/src/execution.rs` Execution backend / enigo
- `runtime/src-tauri/src/binding.rs` Binding semantics
- global shortcut 注册、Pressed/Released 语义
- Device Identity
- Blink / Workflow
- ProfileFactory
- Runtime Creator / Open App Picker / Hotkey Capture
- Cloud / Account
- Migration Framework

修改仅覆盖三层模型、两个明确边界、fixtures、对应 UI 适配与测试。

## 2026-09-02：deps 编译产物与磁盘占用核查

本次仅检查磁盘、Cargo 配置及 Git 忽略状态，没有执行清理或构建。

- `runtime/src-tauri/target/debug/deps` 实际磁盘占用约 2.0 GiB，包含 7,502 个文件，是 Runtime 的 Rust/Cargo 调试编译产物目录。
- 文件包括 5,999 个 `.o` 目标文件、383 个 `.rlib` Rust 库、535 个 `.rmeta` 编译元数据、23 个 `.dylib` 动态库，以及依赖描述文件和可执行文件。文件逻辑大小之和与 `du` 的磁盘占用不同，不应混用。
- Cargo.toml 声明 Tauri、对话框、全局快捷键、单实例、serde、enigo 等依赖；目录中可见 tauri、tauri_utils、objc2_app_kit、tokio 等直接或传递依赖的编译文件。同一库存在多个带不同哈希的产物，说明缓存中有多个编译实例；具体由哪次源码、特性或构建参数变化产生，未逐项追溯。开发编译及中间文件保留共同导致体积较大。
- 整个 `runtime/src-tauri/target` 约 2.5 GiB，其中 `debug/build` 约 348 MiB、`debug/incremental` 约 147 MiB。另有两处 Vite 预构建缓存：根目录 `node_modules/.vite/deps` 约 8.6 MiB，Runtime 下同名目录约 3.1 MiB。
- 当前 `.gitignore` 包含 `target/`，`git check-ignore` 确认该 deps 路径被忽略，`git ls-files runtime/src-tauri/target` 无输出，因此当前 Git 索引未跟踪该目录。

需要回收空间时，可在停止开发构建/运行后进入 `runtime/src-tauri` 执行 `cargo clean`，清理整个 target。它清理编译产物，不修改项目源码；后续开发构建会重新生成，首次重编译会更慢。这里只提供清理方式，尚未执行。

# Post-Cleanup Implementation Audit

审查日期：2026-09-02。审查对象：当前工作树中的 Three-Layer Cleanup 实现，而非设计稿或历史提交。只追加本节，没有修改项目源码、fixture 或项目测试。实验程序位于 /private/tmp/keyflow-audit.9uhX5o，使用 #[path] 引用当前真实 Rust 模块，没有复制实现。现有工作区改动和既有文档章节保留。

## 1. Verdict

**FAIL**

三层主结构及旧字段删除已经落地，但严格跨端校验与自然反向序列化尚未满足验收要求。存在两处实测 TS/Rust 接受集合差异，以及一个合法 Profile 经 Rust 序列化后不再符合 Zod 的反向边界问题。原 Cleanup Receipt 的“完整 portable Profile 可直接反向导出”结论需要以下事实限定。

## 2. Legacy Residue

检索覆盖当前仓库源码、测试、fixtures、隐藏文件和被 .gitignore 忽略的 docs；使用 rg --hidden --no-ignore，排除 .git、node_modules、target、dist（第三方依赖、历史 Git 对象和生成产物不是当前源模型）。没有仅依赖默认 rg，否则当前被忽略的 docs 会漏检。不存在 doc/、knowledge/；复用既有 docs 文档。

检索表达式：KEY_[1-8]|KEY_SLOTS|KeySlot|slot|KeyBinding|bindings|sourceBindingId|Profile\\.id|createdAt|updatedAt|appId|commandId。逐文件全部命中行号如下；同一行多次命中合并一次。行号指追加本节前快照，避免把报告自身新增的关键字误判为实现残留。

| 路径 | 全部命中行号（本次追加前） | 分类 | 职责说明 |
|---|---|---|---|
| `src/services/setupService.ts` | 19, 20, 22, 24, 34, 41 | VALID WEB-ONLY | Web 草稿引用、选择器、显示或统计 |
| `src/services/profileCompiler.ts` | 6, 7, 16, 17 | VALID WEB-ONLY | 查 Registry 生成 portable executions，引用不输出 |
| `src/pages/ExportPage.tsx` | 17, 19 | VALID WEB-ONLY | Web 草稿引用、选择器、显示或统计 |
| `src/pages/KeyMappingPage.tsx` | 20, 21 | VALID WEB-ONLY | Web 草稿引用、选择器、显示或统计 |
| `src/pages/KeySetupPage.tsx` | 32, 36 | VALID WEB-ONLY | Web 草稿引用、选择器、显示或统计 |
| `src/components/command-registry/CommandEditor.tsx` | 14 | VALID WEB-ONLY | Web Registry metadata，未进入 Profile schema |
| `src/components/key-setup/ShortcutPicker.tsx` | 11 | VALID WEB-ONLY | Web 草稿引用、选择器、显示或统计 |
| `src/stores/commandRegistryStore.ts` | 24 | VALID WEB-ONLY | Web Registry metadata，未进入 Profile schema |
| `src/components/app-registry/AppEditor.tsx` | 11 | VALID WEB-ONLY | Web Registry metadata，未进入 Profile schema |
| `src/stores/appRegistryStore.ts` | 25 | VALID WEB-ONLY | Web Registry metadata，未进入 Profile schema |
| `src/models/authoring.ts` | 4, 5, 17, 18 | VALID WEB-ONLY | Web 草稿引用、选择器、显示或统计 |
| `packages/keyflow-contract/src/command.ts` | 13, 14 | VALID WEB-ONLY | Web Registry metadata，未进入 Profile schema |
| `docs/web-v1-architecture-and-profile-contract.md` | 12, 22, 23, 24, 25, 26, 27, 32, 40, 42, 46, 49, 51, 59, 62, 70, 73, 78, 79, 80, 92, 94, 99, 105, 107, 123, 125, 134, 138, 162, 196, 198, 208, 209, 231, 241, 322, 331, 379, 389, 394, 398, 443, 445, 489, 491, 499, 517, 569, 582, 609, 633, 635, 637, 643, 655, 660, 711, 713, 753, 771, 773, 800, 806, 814, 817, 818, 821, 832, 833, 869, 875, 888, 891, 901, 909, 943, 945, 947, 948, 950, 959, 960, 964, 977, 979, 989, 1006, 1010, 1069, 1117, 1118, 1119, 1120, 1121, 1122, 1123, 1125, 1126, 1133, 1134, 1135, 1136, 1138, 1144, 1147, 1148, 1151, 1156, 1164, 1165, 1166, 1175, 1176, 1177, 1178, 1179, 1180, 1181, 1182, 1189, 1190, 1191, 1192, 1195, 1202, 1208, 1222, 1224, 1236, 1237, 1238, 1248, 1250, 1251, 1252, 1253, 1254, 1255, 1256, 1258, 1261, 1274, 1285, 1286, 1287, 1288, 1289, 1290, 1295, 1301, 1305, 1330, 1343, 1350, 1351, 1386, 1387, 1389, 1405, 1406, 1422, 1423, 1425, 1427, 1434, 1435, 1443, 1444, 1445, 1446, 1447, 1448, 1450, 1457, 1458, 1459, 1460, 1498, 1499, 1500, 1503, 1504, 1505, 1520, 1525, 1526, 1527, 1528, 1533, 1534, 1535, 1537, 1538, 1539, 1553, 1572, 1573, 1574, 1575, 1576, 1577, 1578, 1580, 1599, 1603, 1616, 1622, 1623, 1624, 1628, 1629, 1637, 1650, 1651, 1652, 1653, 1654, 1655, 1658, 1674, 1675, 1679, 1680, 1686, 1688, 1697, 1698, 1703, 1724, 1725, 1730, 1733, 1795, 1815, 1824, 1825, 1834, 1838, 1848, 1855, 1893, 1896, 1897, 1908, 1910, 1911, 1914, 1927, 1945, 1959, 1977, 1995, 1996, 1997, 1998, 1999, 2004, 2005, 2014, 2015, 2016, 2025, 2026, 2031, 2074, 2086, 2092, 2101, 2118, 2125, 2134, 2149 | DOCUMENTATION ONLY | 历史审查、已删除字段说明和清理回执；保留时间线，不代表当前执行代码 |
| `packages/keyflow-contract/src/schemas/app.schema.ts` | 28, 29 | VALID WEB-ONLY | Web Registry metadata，未进入 Profile schema |
| `packages/keyflow-contract/src/app.ts` | 24, 25 | VALID WEB-ONLY | Web Registry metadata，未进入 Profile schema |
| `packages/keyflow-contract/src/schemas/command.schema.ts` | 13, 14 | VALID WEB-ONLY | Web Registry metadata，未进入 Profile schema |
| `tests/model-tests.ts` | 24, 28, 31, 34, 43, 48 | TEST/FIXTURE ONLY | 编译输入及拒绝旧 slot 字段的负例 |
| `runtime/src-tauri/src/main.rs` | 23, 89, 91, 92, 94, 95, 108, 112, 124, 126, 184, 230, 264, 351, 355, 361, 362, 366, 445, 446, 447, 450 | VALID RUNTIME-LOCAL | 实体输入 BindingStore、内存索引及 bindings.json；不是 Profile.bindings |
| `runtime/src-tauri/src/binding.rs` | 10, 18, 21 | VALID RUNTIME-LOCAL | 实体输入 BindingStore、内存索引及 bindings.json；不是 Profile.bindings |


分类结论：

- INVALID LEGACY RESIDUE：当前业务源码和当前 fixture 中没有检出旧 Profile slot/bindings/sourceBindingId 结构。
- KEY_1 仅在 tests/model-tests.ts:43 作为拒绝样例及历史文档出现；KEY_2～KEY_8、KEY_SLOTS、KeySlot、KeyBinding、sourceBindingId 没有当前实现引用。
- appId/commandId 没有进入 Profile v2 schema、Rust protocol DTO 或 Runtime execution。
- packages/keyflow-contract 中 AppDefinition/CommandDefinition 的 timestamps 是 Web Registry 模型，不是 Profile 字段。包名“contract”不等于其所有导出都属于 portable Protocol。
- 扩展检索 system-builtin-：repository.rs:45,48 为 VALID RUNTIME-LOCAL seed/id 操作；repository.rs:93 为 TEST/FIXTURE ONLY；runtime/src/main.ts:26 为 VALID RUNTIME-LOCAL UI 图标派生。fixture JSON 中不存在 system ID。
- 扩展检索 RuntimeAction/RuntimeExecution/ExecutableAction/CompiledAction/ActionDTO/ExecutionDTO/ProfileBinding/sourceProfile/LEGACY_SLOT_MAP/migrateLegacyProfile：当前 runtime、src、packages 无命中。
- 文档旧模型内容保留历史上下文，不应当作当前协议使用。

## 3. Web Authoring Path

实际持久化数据：

```ts
// keyflow.profileDrafts
{ drafts: ProfileDraft[] }

// ProfileDraft
{ localId: string; name: string; description?: string; actions: AuthoringAction[] }

// AuthoringAction
{ type: "OPEN_APP"; appId: string }
| { type: "COMMAND"; commandId: string }
```

appRegistry 与 commandRegistry 是两个独立 store/storage key，不嵌入 keyflow.profileDrafts。WebAuthoringState 类型本身只有 drafts，不是上一阶段目标示例中的三个字段同一对象；职责仍分离。

1. profileStore.ts:loadAuthoringState/persist 使用 authoring strict schema；draft 不接受 executions、name 快照或 slot。
2. Registry 更新通过 upsert 生成新数组；ExportPage 订阅 apps/commands/drafts。compileProfileDraft 每次按当下传入数组 lookup。
3. 临时实测把 COPY 的 macos keys 从 META+C 改为 META+V，同一 draft 重编译得到 META+V，第一次编译结果仍为 META+C。没有 draft 执行缓存。
4. 正式路径唯一：ExportPage → downloadProfiles → prepareProfileExport → compileProfileDrafts → compileProfileDraft → profileSchema.parse → JSON array/Blob。
5. ExportPage 的预览同样调用 prepareProfileExport，不是第二个协议构造路径。
6. src/pages 没有直接构造 portable Action/Execution。CommandEditor 与 src/data/commands.ts 构造 SEND_HOTKEY 是合法 Registry authoring，不是导出旁路。
7. src 中没有 keyflow.currentProfile、migrateLegacyProfile 或 v1.2 fallback。新 drafts key 无效时返回空 drafts；Registry 无效时回退各自初始 Registry，不读取旧 Profile。
8. 没有固定六项限制；编号从数组 index 派生。

## 4. Profile v2 Protocol

实际 TypeScript（packages/keyflow-contract/src/profile.ts 等）：

```ts
interface Profile {
  version: string;
  name: string;
  description?: string;
  actions: Action[];
}
type Action =
  | { type: "OPEN_APP"; executions: {
      windows?: LaunchAppExecution; macos?: LaunchAppExecution;
    } }
  | { type: "COMMAND"; executions: {
      windows?: SendHotkeyExecution; macos?: SendHotkeyExecution;
    } };
interface LaunchAppExecution {
  type: "LAUNCH_APP";
  executableNames?: string[];
  aliases?: string[];
  bundleIds?: string[];
  appNames?: string[];
  knownPaths?: string[];
}
interface SendHotkeyExecution {
  type: "SEND_HOTKEY";
  keys: KeyCode[];
}
```

重要纠正：实际 interface.version 是 string，并非上一轮聊天回执展示的字面值类型；实际 Zod Schema 使用 z.literal("2.0")。这不导致正式 compile/import 接受其他版本，但应区分类型与运行时约束。

Schema shape：所有对象 strict；name trim 后非空；description 若存在必须字符串且 trim 后非空；actions 至少一项；executions 仅 windows/macos 且至少一项；OPEN_APP 对应 LAUNCH_APP，COMMAND 对应 SEND_HOTKEY；keys 来自 KEY_CODES 且非空不重复；每个 locator 字符串 trim 后非空，且至少一个 locator 数组非空。

协议数据不依赖 App Registry、Command Registry、localId、RuntimeProfileId、slot 或外部 lookup table。操作系统实际是否安装应用/授权输入仍属执行环境，不是 Web Registry 依赖。

## 5. TS / Rust Validation Parity

**不完全一致。** 实验使用相同 21 个 JSON，分别送入 Zod、Rust Profile::from_json 和正式文件导入所用 Profile::many_from_json。后两者本次结果一致。

| 输入类别 | Zod | Rust 两条 parser |
|---|---|---|
| 手写 macOS-only Copy | 接受 | 接受 |
| 未知 Profile / Action / Execution 字段（3 例） | 拒绝 | 拒绝 |
| Profile 的 appId / commandId / slot / bindings / id / createdAt / updatedAt（7 例） | 拒绝 | 拒绝 |
| Action 的 appId / commandId（2 例） | 拒绝 | 拒绝 |
| version=1.2 | 拒绝 | 拒绝 |
| 未知平台 linux | 拒绝 | 拒绝 |
| OPEN_APP + SEND_HOTKEY | 拒绝 | 拒绝 |
| description="" / windows=null / actions=[]（3 例） | 拒绝 | 拒绝 |
| description=null | 拒绝 | **接受** |
| LAUNCH_APP appNames=["Chrome",""] | 拒绝 | **接受** |

反向 COMMAND + LAUNCH_APP 由现有 Rust mismatch test 通过证明拒绝；TS commandActionSchema 明确只接受 sendHotkeyExecutionSchema。

差异原因：

- profile.rs:22 的 Option<String> 将显式 null 反序列化为 None；validate 无法分辨 null 和缺省。
- profile.rs:89 只要求所有 locator 中“至少一个不是空白”；Zod 要求“每个元素非空”再要求有一个非空数组。
- 另外 Zod 对 name/description/locator 执行 trim 并返回规范化值，Rust 只用 trim 判断而保留原字符串。这是值规范化差异，不等同于本次两项接受/拒绝差异；尤其 locator 前后空格可能影响实际匹配。

## 6. Runtime Internal Model

持久化 Rust RuntimeProfile 的全部字段（repository.rs:13）：

```text
id: String
profile: Profile
local_name_override: Option<String>
icon_id: Option<String>
source: ProfileSource
```

serde 输出 localNameOverride/iconId。没有 name、description、createdAt、sourceBindingId、slot、actions copy、execution copy。

repository.rs:25 的 display_name = override.unwrap_or(profile.name)。main.rs:262-263 生成视图时读取 display_name 和 profile.description。BindingStore 独立保存 runtimeProfileId/physicalInput；Repository Vec 顺序即本地排列顺序。

runtime/src/types.ts:6 仍有名为 RuntimeProfile 的前端类型，字段是 id/name/description/physicalInput/actionHotkey/iconId/source。它实际上对应 Rust RuntimeProfileView 的派生 UI snapshot，不持久化，也不参与执行；不是第二套领域模型，但同名容易误读。

反向导出：本地字段确实隔离在 wrapper 外，取 profile 无需剥离 id/icon/Binding。然而“取 profile 直接 Serialize 后就是合法 v2 JSON”目前不成立。对没有 description 的合法手写 Profile，serde_json::to_value 输出 description:null；Zod 实测拒绝。LaunchApp 缺省数组序列化成 [] 本身仍合法，但可选 description 的 null 已阻断自然 round-trip。不实现 export，只记录缺陷。

## 7. Runtime Import Path

```text
load_profile(path)
→ Profile::many_from_file
→ many_from_json
→ serde object 或 Vec<Profile>
→ 每个 Profile.validate()
→ import_profiles
→ 每个 Profile 调用 repository.insert_import 一次
→ RuntimeProfile { new id, profile, None overrides, External }
→ repository.save
```

单对象是一项；数组是逐 Profile 插入，不展开 actions。many_from_json 在返回前校验整个数组。builtin 使用同一 many_from_json，再添加本地 seed metadata。

临时实验确认：单对象接受；两元素 array 返回 2；同一 Profile 连续 insert 两次 count=2 且 id 不同；本地 rename 不改 Profile.name。八个 builtin 插入后共 10 个实例。

另一个持久化边界缺口：repository.rs:32 的 load 只 serde 反序列化，不调用 Profile.validate。临时仓储 JSON 将嵌入 Profile 的 version 改为 1.2，load 仍保留该实例。此问题不是正式外部 import 的 v1.2 兼容分支，但说明重启恢复不是完整验证边界。load 失败时 unwrap_or_default 的静默清空行为也仍存在；这不是迁移。

## 8. Runtime Execution Path

```text
global shortcut Pressed
→ dispatch_physical_key
→ BindingState.physical_to_profile
→ dispatch_profile(runtimeProfileId)
→ repository.find(id).profile.executions_for(current_platform())
→ actions 原数组顺序查 executions
→ Vec<同一个协议 Execution 类型>
→ execution::dispatch(&execution)
→ match Execution::LaunchApp / Execution::SendHotkey
→ existing executor
```

证据：main.rs:158-174、179-198，profile.rs:64-65，execution.rs:4-8。

没有 Action.type → executor 分支；Action.type 只参与验证/业务语义。executions_for 会 clone 同一协议 Execution 为一次执行快照，不是 RuntimeExecution 第二套领域结构，也不持久化。它先收集所有当前平台 implementations；任一 Action 缺平台则返回错误，尚未执行任何动作。

macOS-only Profile：两端验证成功、repository 插入成功；executions_for("windows") 明确返回 CURRENT_PLATFORM_NOT_CONFIGURED。该实验模拟平台参数，没有启动 Windows/键盘 executor。

## 9. Builtin Compliance

builtin-profiles.json 为 8 项 JSON array：复制、粘贴、剪切、撤销、重做、全选、保存、查找，分别对应 Copy/Paste/Cut/Undo/Redo/Select All/Save/Find。

实测 8 项全部通过外部同一个 Zod profileSchema；Rust ensure_system_profiles 使用外部同一个 Profile::many_from_json/validate。无特殊宽松 Schema，JSON 无 id/slot/Registry refs。

稳定 id 配对位于 repository.rs:42-49 的 seed metadata，与数组顺序配对。Runtime UI 也读取本地 system ID 派生图标，这是本地 ID 消费，不是协议泄漏。

## 10. Handwritten Profile Test

实际同时通过两端验证并创建 RuntimeProfile 的最小例子：

```json
{
  "version": "2.0",
  "name": "Copy",
  "actions": [
    {
      "type": "COMMAND",
      "executions": {
        "macos": {
          "type": "SEND_HOTKEY",
          "keys": ["META", "C"]
        }
      }
    }
  ]
}
```

字段来源：

- version：JSON 自带 discriminator，Rust validate 检查。
- name：JSON 自带默认展示名。
- description：缺省，不影响执行。
- actions：JSON 自带动作及顺序。
- COMMAND：业务意图；校验必须匹配 SEND_HOTKEY。
- macos：当前平台匹配目标。
- SEND_HOTKEY：系统 primitive，Executor 唯一分派依据。
- META/C：JSON 自带完整键值；无需 commandId/Registry 查找。

本轮验证：

- npm run test:models：通过。
- cargo test --offline：8/8 通过。
- 临时 21-case TS/Rust parity 实验：发现上节 2 处真实差异。
- 临时 Rust serialize → Zod：失败，description:null。
- Registry 最新值编译：通过。
- 单对象/数组/重复导入/rename/mac-only/8 builtin：通过。
- 临时持久化非法版本 reload：证实未重新 validate。
- 未运行 GUI、实际键盘和系统 Executor；未重跑 build/typecheck（本轮项目代码无修改）。

## 11. Findings

### BLOCKER

**B1 — TS/Rust 接受集合不同。** profile.rs:22,75,89。description:null 与 appNames:["Chrome",""] 在 Rust 的正式导入 parser 均被接受，而 Zod 拒绝。不能宣称严格跨端协议一致。

**B2 — Rust portable Profile 序列化不闭合。** profile.rs:17-23。合法省略 description 的 Profile 变成 description:null，不能通过 Zod 回验；Runtime 本地字段虽未泄漏，但自然反向导出能力不满足本轮审查要求。

### SHOULD CLEAN

**S1 — 持久化恢复跳过 Protocol.validate。** repository.rs:32。实测 version=1.2 的嵌入 Profile 能从仓储恢复，外部 import 的拒绝规则不覆盖此路径。不是要求 migration，而是指出验证边界缺失。

**S2 — 回归测试未覆盖 parity/round-trip。** 现有 8 个 Rust tests 与 Web models tests 均通过，但没有捕获 B1/B2；当前绿色测试不能证明这两项验收结论。

**S3 — 回执与命名需要准确。** TypeScript Profile.version 实际是 string，非聊天回执中的字面值类型；Runtime TS 的 RuntimeProfile 实际是 UI View。两者不构成旧领域模型残留，但容易让后续开发误读。

### ACCEPTABLE

- Web-only Registry refs/timestamps；Runtime-local bindings/system IDs。
- Snapshot 中的 name/description/actionHotkey 为即时派生 View，非持久化 cache。
- 同一 Execution 类型的临时 clone，没有第二套 Action/Execution 领域模型。
- 历史审查文档保留旧字段。
- 单平台合法但实际执行时缺平台报错。
- Zod trim 与 Rust 保留原文的差异已记录，不能把“语义载荷完整”宣称为逐字节保留。

## 12. Scope Confirmation

没有修改项目代码，没有开发 Factory/Creator，没有修改 Executor/Binding，没有新增 migration。仅追加同主题审查文档；临时实验文件在 /private/tmp，不进入项目实现。没有清理用户 localStorage、Runtime profiles.json、bindings.json 或任何现有开发数据。

本节 supersedes 先前回执中关于“校验一致/直接 portable 序列化已经完整满足”的过度结论；不改动历史章节，不重新讨论目标架构。

## 13. Code Style Follow-up — 2026-09-02

用户指出 App.tsx 等文件长单行不利于阅读和 review。检查当前仓库：没有检出 Prettier、ESLint、Biome、rustfmt 配置或 .editorconfig；根目录及 Runtime package.json 没有 format、format:check 或 lint 脚本，也没有声明对应 JS 格式化/lint 工具依赖。现有 typecheck/build 不能约束排版。

src/App.tsx:9 将整个路由 JSX 写在单行；src/pages/KeyMappingPage.tsx:18 长达 2,567 字符；src/pages/ExportPage.tsx:19 长达 1,662 字符。这是实际可读性问题，而非用户阅读习惯问题。此前清理新增或保留这种写法，也说明交付验证漏掉了格式与人工 review 可读性。

后续应将自动格式化及只检查不写入的格式校验纳入工程命令，并约束 JSX、函数体和分支展开。纯格式化应与协议缺陷修复分开，避免混淆 review。此处仅记录事实与建议，尚未安装工具、添加规则或修改源码。

## 14. Code Formatting Receipt — 2026-09-02

经用户授权完成本轮纯格式化。根 package.json/package-lock.json 新增锁定版本的 Prettier 3.9.6；新增 .prettierrc.json、.prettierignore、.editorconfig 与 runtime/src-tauri/rustfmt.toml。JS/TS/TSX 使用 2 空格、双引号、分号、尾逗号、100 列目标宽度、LF；Rust 使用 rustfmt 的标准 4 空格和 100 列目标宽度。长字符串/模板文本不是强制拆分对象，避免改变字符串语义；100 列不是所有文本的绝对上限。

自动格式化范围：Web src、共享 contract 源码和 fixtures、tests、Runtime TS/CSS、Rust 源码、相关 JSON/HTML/构建配置。App.tsx 的路由树、页面 JSX、store 更新和 Rust 函数已展开。Executor/Binding 源文件本轮也经过 rustfmt，但没有手动修改其执行逻辑或绑定语义。

可重复执行的命令（从仓库根目录）：

- npm run format：格式化 Web/contract/Runtime 前端及 Rust。
- npm run format:check：只检查上述范围，不写入。
- format:web / format:web:check、format:rust / format:rust:check：可单独执行。

未批量格式化历史 docs、overview.md、.workbuddy-ai、依赖、锁文件和生成目录；锁文件仅由安装 Prettier 更新。已有未提交模型变更继续保留，因此完整 git diff 同时包含上一轮模型修改，不能把整个工作树差异描述成纯格式化。本轮未修复 post-cleanup audit 的协议缺陷，未添加 ESLint 或 CI/hook。

验证通过：format:check；Studio typecheck/build/test:models；Runtime TypeScript typecheck/build；cargo check --offline；cargo test --offline（8/8）；git diff --check。未运行真实 GUI/键盘 Executor 验证。

# Profile V2 Parity Fix Receipt

日期：2026-09-02。仅修复 Profile v2 的跨语言校验、序列化和 Repository 验证边界；不重构三层模型。以下结果对应当前代码和实际执行测试。

## 1. Root Causes

- optional → null：Rust Option<String> 的默认 Deserialize 接受显式 null，默认 Serialize 将 None 输出为 null；Zod optional 只接受缺省或合法字符串。
- Rust validation gap：原 locator 校验只要求至少一个非空字符串，没有逐个检查数组元素；Rust trim 与 JavaScript String.trim 的 Unicode 空白字符集合也不同。
- repository restore bypass：原 load 只反序列化并静默 fallback 到空仓储，没有调用 Profile.validate。

## 2. Rust Validation Changes

profile.rs 保留 Profile/Action/Execution 的 deny_unknown_fields；不修改 Zod 或协议 shape。

- description 使用 default + 自定义 String 反序列化：字段缺省得到 None，字段存在就必须是 String，null/数字被拒绝。
- name、description、五类 locator 全部使用与 JS String.trim 对应的空白集合；验证后的文本与 Zod 一样进行 trim 规范化。包括 BOM U+FEFF，同时不误删 JS 不 trim 的 U+0085。
- executableNames、aliases、bundleIds、appNames、knownPaths：每个元素 trim 后必须非空，并且所有数组合计至少一个元素；混合有效元素与空元素也拒绝。
- version 必须 2.0；name/actions 非空；executions 至少一个且只允许 windows/macos。
- keys 非空、合法且不重复；Action 与 Execution 的两种组合约束保持不变。
- required/string/array/null 类型由 serde 严格检查；未知字段仍拒绝。

## 3. Serialization Changes

- description=None 使用 skip_serializing_if = Option::is_none，输出省略字段，不输出 null。
- windows/macos 在 HashMap 中缺省时本来就没有对应 key；显式 null 不能反序列化为 Execution。
- 五个 locator arrays 使用 default Vec 和 skip_serializing_if = Vec::is_empty。缺省或合法显式 [] 在输出中省略；非空数组保持内容，绝不输出 null。
- RuntimeProfile 本地 optional 元数据不属于 Profile v2；没有为本轮顺手改动本地 wrapper shape。
- 这是合法协议的语义 round-trip，不承诺保留输入 JSON 空白、字段顺序或“显式空数组 vs 缺省”的字面差别。

## 4. Repository Restore

策略：**整次恢复失败并返回明确错误**，不跳过部分记录、不静默清空、不覆盖原文件。

profiles.json → serde RuntimeProfile → 每条 profile.validate() → 全部成功后返回 Repository。文件不存在仍表示首次运行的空仓储；读取错误、解析错误、任一非法 Profile 返回 REPOSITORY_RESTORE_FAILED。main.rs 最小适配 load 的 Result 并向启动错误传播，验证失败时不会继续 seed/save。

insert_import/内部 insert 同样验证再加入；Import=Insert 不变。save 在写文件前验证并规范化待序列化副本，非法 payload 不会覆盖已有文件。未来调用现有插入入口也不能绕过验证；没有创建 Creator/Factory。

新增测试：

- 合法 save/load，保留 id、localNameOverride、iconId 和 portable name。
- version=1.2 恢复失败。
- appNames=[""] 恢复失败。
- 同一矩阵全部 70 个非法 Profile 都不能恢复（仓储同时带合法记录也整体报错），并验证原文件未改变。
- 非法 Profile 不能 insert；仓储保存前发现非法 Profile 不覆盖已有文件。

## 5. Parity Matrix

共享输入：packages/keyflow-contract/fixtures/profile-v2.parity.json。

| 指标 | 实测结果 |
|---|---:|
| total cases | 84 |
| TS accepted | 14 |
| TS rejected | 70 |
| Rust accepted | 14 |
| Rust rejected | 70 |
| mismatch count | **0** |

涵盖用户要求的 6 类 valid 和 19 类 invalid；扩展五类 locator 的空元素、混合空元素、空白/null/非字符串、未知平台、未知 type、缺失必填字段、Unicode trim 等。

Rust integration test 使用 #[path] 直接引用生产 profile.rs，不复制 parser。对每个案例同时检查 from_json、many_from_json 的单对象和数组输入。TS 测试运行真实 Rust test，读取该进程输出并与同一 JSON 经实际 Zod 的结果逐项比较，同时检查预期合法性，避免“两边都放宽”也误通过。

执行：npm run test:parity。该矩阵是明确的回归覆盖证据，不是对所有可能 JSON 输入的形式化证明。

## 6. Round-Trip

14 个合法案例逐一执行：

valid JSON → Rust parse/validate → Rust serialize → Zod parse → PASS。

包含 description missing、windows missing、macos missing、五类 locator missing。还比较 Zod 的规范化结果和 Rust 输出（仅将合法空 locator 数组与缺省视为等价），确认字符串 trim 一致。Rust 自身 reparse 也通过。没有通过放宽 Schema 接受 null 来绕过问题。

## 7. Files Changed

仅列本轮，而非整个已有 dirty worktree：

- runtime/src-tauri/src/profile.rs：optional serde、逐项 locator validation、JS trim 对齐与输出省略。
- runtime/src-tauri/src/repository.rs：restore/insert/save 验证入口及五项仓储回归测试；适配原有测试的 Result。
- runtime/src-tauri/src/main.rs：传播 load/insert 的 Result；不改执行链和监听。
- packages/keyflow-contract/fixtures/profile-v2.parity.json：同一组跨端案例。
- runtime/src-tauri/tests/profile_parity.rs：真实 Rust parser/serializer 矩阵报告。
- tests/profile-parity.ts：Zod/Rust 逐项比较与跨语言往返验证。
- package.json：新增 test:parity 命令。
- docs/web-v1-architecture-and-profile-contract.md：追加本节，保留先前失败审查与修复时间线。

## 8. Verification

Passed：

- Studio npm run typecheck
- Studio npm run build
- npm run test:models
- Runtime npm run typecheck
- Runtime npm run build
- cargo check --offline
- cargo test --offline：13 项主程序测试 + 4 项 integration binary 测试通过（后者包含引用模块的 3 个既有 Profile tests 与 1 个共享矩阵 test）。
- npm run test:parity：84 cases，mismatch=0，14 Rust → Zod round-trips。
- 本轮 TS/JSON/package 文件 Prettier check。
- cargo fmt -- --check。
- git diff --check。

额外全仓 npm run format:check 未通过：唯一报告为 src/App.tsx 当前四空格缩进，不符合仓库两空格配置。本轮没有改该文件，保留范围外现状，没有为了全仓绿色扩大 Web 修改。

Not run：真实桌面启动、真实键盘和 OS Executor；本轮没有修改这些路径。

## 9. Scope Confirmation

没有修改 Profile shape/version、Web authoring、Action/Execution 分层、RuntimeProfile 本地方向、Binding、Import=Insert、Execution backend/enigo、global shortcut、Pressed/Released、Device Identity、builtin 产品内容、Factory/Creator、Picker/Capture、Workflow/Cloud 或 Migration Framework。

Runtime TS 的 RuntimeProfile View 命名问题继续 DEFER。此前 Post-Cleanup Audit 的 B1/B2 和 restore bypass 已由本节代码与测试证据解决；不删除历史审查，不改变目标架构。

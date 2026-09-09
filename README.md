# Blink

> 一键触发，全局可达 —— 把常用操作绑定到全局快捷键，跨应用即时执行。

**Blink** 是一个桌面效率工具：在 Web 配置端把「物理按键 / 快捷键」绑定到一组动作（打开应用、发送快捷键、打开网址 / 文件 / 文件夹、运行脚本），编译导出为 **Profile** JSON，再由 **Tauri 桌面运行时** 导入并监听全局快捷键，随时触发执行。

项目由三个核心部分组成，围绕一份共享的 **契约协议** 协同工作：

- **Web 配置端**（`src/`）：软件库、命令库、能力配置、编译导出。
- **Tauri 运行时**（`runtime/`）：导入 Profile、全局快捷键监听、动作执行、系统托盘。
- **契约协议包**（`packages/blink-contract/`）：TypeScript 类型 + Zod Schema + Producer 工厂，是 Web 端与 Rust 端的**唯一事实源**。

---

## 功能特性

| 能力 | Web 配置端 | Runtime 运行时 |
|------|:---:|:---:|
| 打开应用 `OPEN_APP` | ✅ | ✅ |
| 发送快捷键 `COMMAND` | ✅ | ✅ |
| 打开网址 `OPEN_URL` | ❌（仅 Runtime） | ✅ |
| 打开文件 `OPEN_FILE` | ❌（仅 Runtime） | ✅ |
| 打开文件夹 `OPEN_FOLDER` | ❌（仅 Runtime） | ✅ |
| 运行脚本 `SCRIPT` | ❌（仅 Runtime） | ✅ |

**Web 端**：软件库 CRUD、命令库 CRUD、能力配置（Master-Detail）、批量导出（校验 + 预览 + 下载）、localStorage 持久化。

**Runtime 端**：Profile 导入 / CRUD、全局快捷键监听、6 种动作执行分发、系统托盘、单实例、隐藏到后台、Runtime Creator 原生对话框、诊断日志。

**安全防护**（Runtime 内置）：
- 脚本执行 30s 超时 + 串行防并发 + 扩展名校验（`.sh` / `.ps1`）
- 可执行文件防注入（拦截 `.exe` / `.com` / `.bat` / `.sh` / `.ps1` 等）
- URL 校验（拒绝 `javascript:` 协议）
- 路径校验（macOS 绝对路径 / Windows 盘符路径）
- macOS 跨应用控制的辅助功能权限检查与系统设置引导

---

## 架构总览

```
┌─────────────────────────────────────────────────────────────┐
│                    @blink/contract                        │
│  (TypeScript 类型 + Zod Schema + Producer 工厂函数)          │
│  Action: OPEN_APP | COMMAND | OPEN_URL | OPEN_FILE          │
│          | OPEN_FOLDER | SCRIPT                             │
│  Execution: LAUNCH_APP | SEND_HOTKEY | OPEN_URL             │
│             | OPEN_FILE | OPEN_FOLDER | RUN_SCRIPT          │
│  Profile: v2.0 (经典) | v2.1 (扩展)                         │
└────────────────────────┬────────────────────────────────────┘
                         │
          ┌──────────────┴──────────────┐
          │                             │
   ┌──────▼──────┐              ┌───────▼────────┐
   │  Web 端     │              │  Runtime 端    │
   │  (React)    │              │  (Tauri+Rust)  │
   ├─────────────┤              ├────────────────┤
   │ 软件库 CRUD  │              │ Profile 导入   │
   │ 命令库 CRUD  │              │ Profile CRUD   │
   │ 能力配置     │              │ 键绑定管理      │
   │ 编译导出 JSON │ ──────────→ │ 全局快捷键监听  │
   │ localStorage │              │ 6 种 Execution  │
   └─────────────┘              └────────────────┘
```

核心闭环：**Web 端配置 → 编译导出 Profile JSON → Runtime 导入 → 全局快捷键触发 → 动作执行**。

---

## 技术栈

| 部分 | 技术 |
|------|------|
| Web 配置端 | React 19 · TypeScript · Vite 8 · Tailwind CSS · Zustand · React Router |
| 契约协议 | TypeScript · Zod |
| Runtime 运行时 | Tauri 2 · Rust · enigo（键盘模拟） |
| 官网 | React 19 · Vite 8 |

---

## 项目结构

```
Blink/
├── src/                          # Web 配置端（React）
│   ├── components/               # UI 组件（布局 / 软件库 / 命令库 / 能力配置）
│   ├── models/                   # 领域模型（authoring）
│   ├── pages/                    # 页面（概览 / 软件库 / 命令库 / 能力配置 / 能力列表 / 导出）
│   ├── services/                 # 编译、导出、存储服务
│   └── stores/                   # Zustand 状态
├── packages/
│   └── blink-contract/           # 契约协议包（TS 类型 + Zod Schema + Producer）
├── runtime/                      # Tauri 桌面运行时
│   ├── src/                      # 前端壳
│   └── src-tauri/                # Rust 源码（执行分发、绑定管理、托盘等）
├── website/                      # 官网
├── docs/                         # 架构文档（不随 git 提交）
├── tests/                        # 测试（model-tests / profile-parity / creator-tests）
├── index.html
├── package.json                  # workspace 根（Web 端）
└── vite.config.ts
```

---

## 快速开始

### 环境要求

- **Node.js** ≥ 20（推荐 22+）
- **Rust** 稳定版 ≥ 1.77（仅 Runtime 端需要）
- **macOS**：Xcode Command Line Tools（`xcode-select --install`）
- **Windows**：MSVC 构建工具（Visual Studio Build Tools）

### 安装

```bash
# 根目录（Web 端 + Contract 包）
npm install

# Runtime 端（独立安装）
cd runtime && npm install && cd ..
```

### macOS 安装、权限与升级

> 当前 macOS 版本是 **Apple Silicon 测试构建**，尚未使用 Developer ID 签名和 Apple notarization，不应视为可无感升级的正式发行版。

Blink 的“发送快捷键”和部分应用控制能力需要 macOS 辅助功能权限。首次安装后：

1. 将 `Blink.app` 拖入 `/Applications`，并从该位置启动。
2. 按应用提示打开“系统设置 → 隐私与安全性 → 辅助功能”。
3. 添加并开启当前 `/Applications/Blink.app`。
4. 返回 Blink 后，用目标应用实际验证一次快捷键；列表中显示开启不等于当前进程一定已获授权。

当前测试包采用 ad-hoc 签名。下载新版本并覆盖旧版时，macOS 可能把新版识别为新的代码身份，导致旧的辅助功能授权无法继续使用。若升级后 Blink 提示没有权限：

1. 完全退出 Blink。
2. 在“辅助功能”列表中删除旧的 Blink 条目。
3. 重新添加当前 `/Applications/Blink.app` 并开启权限。
4. 重新启动 Blink，再做一次跨应用快捷键验证。

更换为应用内下载、增量更新或其他本地升级方式不能消除这一限制；只要 Blink 可执行代码改变，ad-hoc 签名身份就可能改变。正式解决方案是后续所有 macOS 版本持续使用同一 Apple Developer 团队的 `Developer ID Application` 身份签名，保持 `com.blink.runtime` 不变，并完成 notarization。首次从当前测试包迁移到正式签名包时，仍可能需要重新授权一次。

### 开发

```bash
# 启动 Web 配置端（开发服务器）
npm run dev

# 启动 Tauri 桌面运行时（开发模式）
cd runtime && npm run tauri:dev

# 启动官网
cd website && npm run dev
```

### 构建与检查

```bash
# 类型检查
npm run typecheck

# 构建 Web 端产物
npm run build

# 构建 Tauri 桌面应用
cd runtime && npm run build
```

### 测试

```bash
npm run test:models     # Profile Schema 校验、编译器输出、版本检查
npm run test:parity     # TS Zod ↔ Rust serde 双向一致性（round-trip）
npm run test:creator    # Producer 工厂、Creator 捕获、save/bind 回滚
```

### 格式化

```bash
npm run format          # Prettier（web）+ cargo fmt（rust）
npm run format:check    # 仅检查，不写入
```

---

## 协议说明

Profile 是 Web 端与 Runtime 端之间的数据契约，由 `@blink/contract` 包统一定义：

- **v2.0（经典）**：仅支持 `OPEN_APP` + `COMMAND` 两种动作。
- **v2.1（扩展）**：新增 `OPEN_URL` / `OPEN_FILE` / `OPEN_FOLDER` / `SCRIPT`。

Profile 版本在编译时**自动探测**：纯 `OPEN_APP` / `COMMAND` 编译为 v2.0，含扩展动作则编译为 v2.1。Zod Schema 通过 `discriminatedUnion` + `superRefine` 做跨字段校验，Rust 端用 `serde` 做 `deny_unknown_fields` 反序列化，两者语义由 `tests/profile-parity.ts` 的双向一致性测试保证。

---

## 安全说明

- 配置与密钥一律不写入代码库，`.env` 已加入 `.gitignore`（仅提交 `.env.example`）。
- Runtime 对脚本、可执行文件、URL、路径均做白名单 / 黑名单校验（见上文「功能特性」）。
- 脚本执行带 30s 超时与串行防并发，避免长任务阻塞或资源滥用。
- macOS 辅助功能权限由系统 TCC 管理，Blink 只能检查状态并引导用户授权，不能静默授予、迁移或修复该权限。

---

## 文档

更详细的架构与协议说明见 `docs/` 目录（该目录不随 git 提交，属于本地资料）：

- `docs/web-v1-architecture-and-profile-contract.md` — 架构与 Profile 契约
- `docs/runtime-settings-ui.md` — Runtime 设置 UI
- `docs/macos-toggle-app.md` — macOS 切换应用说明
- `docs/macos-extended-function-key-capture-audit.md` — macOS 按键、辅助功能权限与覆盖升级 RCA
- `docs/blink-official-website.md` — 官网说明

---

## License

当前仓库**未指定许可证**。如需开源，建议补充 `LICENSE` 文件并在此声明。

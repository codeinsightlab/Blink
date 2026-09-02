# KeyFlow Studio 项目记忆

## 产品定位
- 核心需求：一键式场景化工作空间启动器（"一键打开设计模式/电商模式/开发模式"）
- 差异化：场景预设 + 多动作序列 + 跨平台（Win+Mac）+ Web 可视化配置
- 竞品中最接近的：Stream Deck（硬件）、Workspaces by Same Team（macOS 专属）
- "场景化 + 跨平台 + Web 配置"组合目前市面空白

## 技术架构
- Web 端：React + TypeScript + Vite + Zustand + Tailwind + Zod
- Contract 包：`@keyflow/contract` workspace package（类型 + Schema + 常量）
- Runtime：Tauri 2 + Rust，独立桌面应用
- Profile 协议 v2.0：纯 actions 数组（OPEN_APP / COMMAND → LAUNCH_APP / SEND_HOTKEY）
- 数据流：Web 配置 → 编译 Profile JSON → Runtime 导入 → 物理键触发 → 执行

## 审查发现的关键问题（2026-09-02）
- 依赖全部用 "latest" tag（P0）
- 大量组件代码压缩为单行（P0）
- 无 ESLint/Prettier（P0）
- 文档停在 v1.2，代码已到 v2.0（P1）
- 测试仅 1 个文件（P1）
- 无 Error Boundary（P1）
- writeStorage 未处理 QuotaExceededError（P1）

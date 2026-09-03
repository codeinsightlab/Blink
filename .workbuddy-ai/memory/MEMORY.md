# KeyFlow Studio 项目记忆

## 产品定位
- 核心需求：一键式场景化工作空间启动器（"一键打开设计模式/电商模式/开发模式"）
- 差异化：场景预设 + 多动作序列 + 跨平台（Win+Mac）+ Web 可视化配置
- 竞品中最接近的：Stream Deck（硬件）、Workspaces by Same Team（macOS 专属）
- "场景化 + 跨平台 + Web 配置"组合目前市面空白

## 技术架构
- Web 端：React + TypeScript + Vite + Zustand + Tailwind + Zod
- Contract 包：`@keyflow/contract` workspace package（类型 + Schema + 常量 + Producer 工厂）
- Runtime：Tauri 2 + Rust，独立桌面应用（含系统托盘、单实例、全局快捷键）
- Profile 协议 v2.0（OPEN_APP/COMMAND）+ v2.1（OPEN_URL/OPEN_FILE/OPEN_FOLDER/SCRIPT）
- 数据流：Web 配置 → 编译 Profile JSON → Runtime 导入 → 物理键触发 → 执行
- Producer 模式：`createProfile/createOpenAppProfile/createHotkeyProfile/createTargetProfile`
- Runtime Creator：原生 HTML 对话框，支持 6 种动作类型创建/编辑 + 脚本同意机制

## 第二次审查发现（2026-09-02 迭代后）
- ✅ 已修复：组件格式化、Prettier 配置、测试增至 3 个文件、TS↔Rust 一致性测试
- ✅ Runtime 全功能实现：6 种 Execution 分发 + 脚本超时 + 可执行文件防注入 + URL 校验
- ❌ 未修复：依赖仍用 "latest"（P0）、文档仍停在 v1.x（P0）、无 ESLint（P1）
- ⚠️ ExportPage 硬编码 "协议版本": "2.0"（P1）
- 综合评分从 6.8 → 7.7（架构 9.0，功能 8.5，代码 7.5，安全 8.5，工程 6.0，文档 6.5）
- V1 适配度结论：可以发布，核心闭环完整，安全防护到位

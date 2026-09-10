# Blink 跨平台架构最高约束

## 1. 核心原则

Blink 的跨平台设计必须遵循以下最高原则：

> **Blink 统一“是什么”，不同操作系统分别决定“怎么做”。**

也就是说：

* Blink 先定义统一的产品概念、用户语义和能力契约。
* macOS 根据 macOS 自身的系统模型、公开 API、权限机制和交互习惯实现该能力。
* Windows 根据 Windows 自身的进程、窗口、输入和系统 API 模型实现该能力。
* 不要求 macOS 和 Windows 使用相同的状态机、相同的底层 API、相同的恢复路径或相同的内部实现。

跨平台一致性的目标是：

> **用户理解一致、上层接口一致、结果语义一致。**

而不是：

> **底层代码结构一致、状态模型一致、实现流程一致。**

---

# 2. Blink Concept 优先

任何跨平台能力，在设计实现之前，必须先定义：

```text
Blink Concept
```

即：

> 这个能力对用户到底意味着什么。

例如：

```text
TOGGLE_APP
```

Blink 的概念可以定义为：

> 如果目标 App 当前不是用户正在使用的 App，则把目标 App 叫到当前工作状态；如果目标 App 已经是当前工作对象，则把它收起来。

这里定义的是：

```text
产品语义
```

而不是：

```text
NSRunningApplication
HWND
Hidden
IsIconic
AXWindows
SetForegroundWindow
```

这些都属于平台实现细节，不应该进入 Blink Concept。

---

# 3. 正确的设计顺序

所有平台能力必须按照以下顺序设计：

```text
1. Blink Concept
2. macOS Implementation
3. Windows Implementation
4. Shared Contract
```

不要反过来。

错误方式：

```text
先设计一套跨平台状态机
↓
再要求 macOS 和 Windows 都适配这套状态
```

正确方式：

```text
先确定 Blink 想给用户什么能力
↓
分别寻找 macOS 最自然的实现
↓
分别寻找 Windows 最自然的实现
↓
最后只抽取真正需要统一的契约
```

---

# 4. 允许平台实现完全不同

对于同一个 Blink 能力，macOS 和 Windows 可以拥有完全不同的：

* 状态机
* 系统 API
* 进程检测逻辑
* 窗口检测逻辑
* 激活逻辑
* 隐藏逻辑
* 最小化逻辑
* 恢复逻辑
* 输入监听方式
* 输入发送方式
* 权限判断
* fallback
* retry
* timeout
* degraded behavior
* 日志字段

只要满足：

```text
Blink Concept
```

和上层接口约定即可。

---

# 5. 不允许为了“代码统一”牺牲平台正确性

禁止为了：

* 少写代码
* 少维护两个实现
* 共用一个 enum
* 共用一套状态机
* 共用一个第三方跨平台库
* 让代码结构看起来更漂亮

而牺牲：

* 平台原生语义
* 稳定性
* 可观察性
* 可测试性
* 用户体验
* 错误诊断能力

如果平台原生实现明显更稳定、更简单，则优先使用平台原生实现。

---

# 6. Shared Contract 只统一必要内容

Blink 上层允许统一：

```text
Capability
Input
Output
Result
Error boundary
Product semantics
```

例如：

```text
toggle_app(target) -> Result
```

上层只需要知道：

```text
执行成功
```

或：

```text
执行失败及失败原因
```

但不应该要求平台实现都拥有：

```text
Foreground
Background
Hidden
Minimized
Unknown
```

除非这些状态本身确实属于 Blink 产品概念。

---

# 7. 平台状态不得无理由上升为公共模型

任何准备加入公共 enum、公共 Contract、公共 Runtime Model 的状态，都必须先回答：

> 这是 Blink 的产品概念，还是某个 OS 的实现概念？

如果答案是：

```text
某个 OS 的实现概念
```

则应该保留在对应的平台模块中。

例如：

macOS 可能关心：

```text
frontmost
hidden
running
AX minimized state
```

Windows 可能关心：

```text
process exists
HWND
foreground HWND
IsIconic
cloaked
ToolWindow
AppWindow
```

这些不应为了统一而强行映射成完全相同的公共状态模型。

---

# 8. TOGGLE_APP 示例

## Blink Concept

```text
TOGGLE_APP
```

统一产品语义：

> 目标 App 当前不是用户正在使用的 App时，把它叫到前台。

> 目标 App 已经是当前工作 App 时，把它收起来。

---

## macOS

macOS 可以按照：

```text
running?
frontmost?
hidden?
```

实现。

例如：

```text
Not Running
→ Open
→ Activate

Running + Frontmost
→ Hide

Running + Not Frontmost + Hidden
→ Unhide
→ Activate

Running + Not Frontmost + Not Hidden
→ Activate
```

macOS 的成功标准可以是：

```text
frontmostApplication.pid == target.pid
```

这里不需要为了兼容 Windows 而强行引入 HWND、Minimize 等概念。

---

## Windows

Windows 可以按照：

```text
process exists?
eligible HWND exists?
foreground?
iconic?
```

实现。

例如：

```text
Not Running
→ Launch
→ locate window
→ foreground

Running + Foreground
→ Minimize

Running + Background
→ foreground existing HWND

Running + Minimized
→ Restore
→ foreground
```

这里也不需要为了兼容 macOS 而模拟 Hidden / Unhide 语义。

---

# 9. 第三方跨平台库使用原则

允许使用跨平台库。

但跨平台库只是：

```text
实现工具
```

不是：

```text
架构约束
```

如果跨平台库在某个平台出现：

* 功能缺失
* 行为不稳定
* API 语义不准确
* 日志不可观察
* 权限问题
* 特殊键不支持
* 无法满足产品语义

则允许该平台绕过跨平台库，使用原生实现。

例如：

```text
macOS 使用原生 CoreGraphics / AppKit
Windows 使用 Win32
```

即使另一个平台仍继续使用原跨平台库，也是允许的。

---

# 10. 禁止“最小公分母设计”

不要因为某个平台能力较弱，就把所有平台都限制到较弱的平台能力。

例如：

```text
macOS 能稳定实现能力 A
Windows 只能实现能力 B
```

不代表：

```text
macOS 也必须只实现 B
```

只要不破坏 Blink Concept，可以允许：

```text
macOS capability implementation
```

和：

```text
Windows capability implementation
```

存在合理差异。

必要时，可以在产品层明确：

```text
该能力在不同 OS 上存在平台差异。
```

而不是在代码层强行伪装成完全一致。

---

# 11. 禁止“伪统一”

以下情况视为需要警惕的架构信号：

```text
为了让两个 OS 共用同一个 enum，
给某个平台增加没有实际意义的状态。
```

```text
为了让两个 OS 共用同一个函数，
在内部增加大量 if platform 分支。
```

```text
某个平台已有简单原生实现，
但为了统一强制走更复杂的跨平台路径。
```

```text
平台错误被转换成模糊公共状态，
导致无法定位真正问题。
```

```text
为了让两个平台行为看起来一致，
牺牲其中一个平台的原生用户体验。
```

遇到这些情况，应优先考虑：

```text
共享接口
+
独立平台 adapter
```

而不是继续增加兼容逻辑。

---

# 12. 推荐架构方向

优先形成：

```text
Blink Capability Layer
        |
        v
Shared Interface / Contract
        |
   -------------
   |           |
 macOS       Windows
 Adapter      Adapter
   |           |
 AppKit      Win32
 CGEvent     HWND
 AX          Process APIs
 ...         ...
```

上层不得依赖具体 OS 实现细节。

平台层不得因为公共层存在而被迫使用不自然的实现方式。

---

# 13. 错误模型原则

允许平台内部错误非常具体。

例如：

macOS：

```text
ActivationFailed
AXPermissionDenied
FrontmostVerificationFailed
```

Windows：

```text
WindowNotFound
ForegroundActivationFailed
OpenProcessFailed
```

公共层如果需要统一错误，可以映射成较高层语义。

但必须保留足够诊断信息。

禁止为了跨平台统一，把所有平台错误压成：

```text
ToggleFailed
```

并丢失根因。

---

# 14. 测试原则

跨平台能力必须：

```text
分别测试 macOS
分别测试 Windows
```

不要因为：

```text
公共单元测试通过
```

就认为平台行为已经正确。

真正验收标准是：

> Blink Concept 在目标 OS 上是否成立。

因此允许：

```text
macOS test matrix
```

和：

```text
Windows test matrix
```

完全不同。

---

# 15. 代码审查原则

任何涉及平台能力的 PR / Codex 任务，在方案阶段必须回答：

```text
1. Blink Concept 是什么？
2. macOS 最自然实现是什么？
3. Windows 最自然实现是什么？
4. 哪些内容真正需要共享？
5. 是否存在为了代码统一而牺牲平台正确性的情况？
```

如果任务只涉及一个 OS，则：

> 只优化这个 OS。

不要因为担心另一个 OS 而主动引入跨平台兼容层，除非公共 Contract 确实需要修改。

---

# 16. 平台问题的平台解决原则

如果 bug 只发生在：

```text
macOS
```

则优先：

```text
分析 macOS
→ 修改 macOS adapter
→ 测试 macOS
```

不要默认：

```text
同步修改 Windows
```

反之亦然。

只有确认问题属于：

```text
Blink Concept
Shared Contract
Shared Runtime
```

时，才修改公共层。

---

# 17. 最小影响原则

平台独立实现不代表可以随意重构。

仍然遵循：

```text
先定位根因
→ 最小平台修复
→ 实机验证
→ 再判断是否需要结构调整
```

不要因为发现平台差异，就一次性重写整个 Runtime。

---

# 18. Blink 的最终跨平台哲学

Blink 是：

```text
一个跨平台产品
```

而不是：

```text
一套跨平台底层实现
```

跨平台的核心是：

> 用户在不同系统上理解的是同一个 Blink。

但 Blink 应尊重每个操作系统自己的模型。

最终原则：

> **产品概念统一。**

> **上层契约统一。**

> **平台实现独立。**

> **平台原生正确性高于底层代码统一。**

> **不要为了“一套方案兼容两个 OS”而设计。**

> **先问 Blink 惐表达什么，再问这个 OS 应该如何正确实现它。**

这条约束优先级高于“减少重复代码”“状态机统一”“跨平台库统一”等工程便利性目标。

# 项目执行规范

## Website 托管与发布边界

- `website/` 是 Blink 官方网站的唯一网站实现。
- Website 生产环境统一托管在 Cloudflare Pages；当前 Cloudflare 项目为 `blink`，生产分支为 `main`。
- Website 的构建配置默认保持：Root directory `website`、Build command `npm run build`、Output directory `dist`、Node.js 22。
- Website 发布验证必须区分 GitHub Actions 构建成功与 Cloudflare Pages deployment 成功；只有 Cloudflare 生成成功 deployment URL 后，才可声称线上已更新。
- Cloudflare Pages 的 Build Watch Paths 使用 Cloudflare 语法；website monorepo 路径使用 `website/*`，不要把 GitHub Actions 的 `website/**` 语法直接复制到 Cloudflare 控制台。

## GPT Sites 禁止项

- 本项目放弃 GPT Sites / `gpt.site` 作为网站托管、预览、发布或下载入口。
- 后续任何代码、配置、工作流、文档、脚本、环境变量或发布说明中，不得新增、恢复或依赖 GPT Sites、`gpt.site`、GPT Sites hosting、GPT Sites deployment 等相关内容。
- 不得把 Website 发布到 `gpt.site`，不得把官网链接、下载链接、canonical、sitemap、README 或 release notes 指向 `gpt.site`。
- 不得为 GPT Sites 增加适配器、部署脚本、构建分支、环境变量、回退路径或兼容层。
- Website 的线上域名、Preview、Production 和部署排查只使用 Cloudflare Pages 及其自定义域名配置。
- 如果发现历史文件中存在 GPT Sites 遗留内容，先报告文件和影响范围；只有在当前任务明确要求清理时才删除或改写，不要借机修改无关业务代码。

## 变更与验证要求

- 不得因为托管迁移修改 Blink 业务语义或 Runtime 行为。
- Website 改动至少运行 `cd website && npm run typecheck` 与 `cd website && npm run build`。
- Cloudflare 配置变更不能通过提交假代码或空提交伪造验证；应使用真实 Website 变更或 Cloudflare 控制台 Retry，并记录 deployment URL 和状态。
- 不得把 GitHub Actions 成功、Cloudflare 提交记录存在或本地构建成功，误写成 Cloudflare 线上部署成功。

## Release Changelog Rule

Every public release tag MUST have a corresponding website changelog entry.

Before creating or pushing a release tag:

1. Determine the previous public release tag.
2. Review local development logs, commits, and release-related changes since the previous version.
3. Summarize only user-visible changes.
4. Add the new release entry to `website/src/changelog.json`.
5. Include the version number and release date.
6. Group changes using Added / Improved / Fixed / Known Issues when applicable; omit empty groups.
7. Run `cd website && npm run verify:changelog -- vX.Y.Z`.
8. Run `cd website && npm run typecheck` and `cd website && npm run build`, and verify changelog SEO metadata and sitemap output remain valid.
9. Commit the changelog update before creating or pushing the release tag.

Do not publish a release tag whose changelog entry is missing. The local development log is an implementation record, not public release notes. Translate internal debugging details, refactors, and implementation-only changes into concise user-facing release notes or omit them.

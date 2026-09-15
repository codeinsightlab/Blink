# Blink 第一版官方网站

> 最新产品战略审查见 [Blink 产品审查与长期规划](blink-product-strategy.md)。本文件保留历次网站实现与发布记录，最新复审按日期追加于文末。

## 2026-09-07：暂时关闭官网 macOS 下载

- 导航、首屏和页尾主 CTA 统一明确标记“下载 Windows 版 / Download for Windows”；中英文同时说明 macOS 暂未开放，不承诺开放日期。
- 官网只解析 Windows 安装包；macOS 下载解析返回 null。接口异常或 Windows 资产缺失时，保留已发布 v0.1.1 的 Windows EXE 直链，避免全部版本页再次引导到 macOS 下载。
- Pages Function 的 macos 字段返回 null，并使用新的缓存键隔离旧响应。已存在的浏览器缓存不影响新前端只读取 windows 字段。
- 未删除 GitHub Release 中已有 macOS 资产，未修改 Runtime；本次关闭范围为官网入口。
- 验证：website typecheck、build（含 prerender）通过；下载解析检查覆盖 macOS 禁用、Windows 最新链接和缺失资产回退，均通过。
- 本轮未提交或推送，未执行 Cloudflare 部署；线上尚待发布验证。

## 2026-09-03：仓库审查与能力表述边界

已搜索 docs/、doc/、knowledge/。现有文档讨论 Runtime 设置、Toggle App 与 Web 协议，没有官网专题，因此创建本文。保留全部既有未提交修改，仅新增 website/ 与本报告。

参考 https://www.raycast.com/ 的产品展示节奏、大标题、深色留白和分区结构，不复制其素材、UI、用户背书或产品能力。

- 根目录为 React 19 / TypeScript / Vite Creator；runtime/ 为独立 Tauri Runtime。官网放 website/，独立 package.json、lockfile、配置、构建目录和 Sites 源码仓库，不进入根 workspace，不改 Creator 或 Runtime。
- 正式图标复用 runtime/src-tauri/icons/icon.svg；截图复用 docs/runtime-settings-ui-zh.png。后者来自真实组件的浏览器模拟测试，非原生实时运行截图，首页明确标注模拟数据。
- runtime/src-tauri/src/execution.rs 的 dispatch 已处理 LaunchApp、OpenUrl、RunScript、SendHotkey、OpenFile、OpenFolder。macOS 脚本限定本地绝对路径 .sh，经 /bin/sh 执行，30 秒超时。官网不宣称支持任意语言脚本。
- ToggleApp 已有 contract、dispatch 和 app_toggle 模块，但 docs/macos-toggle-app.md 仍处实施记录，未找到稳定发布及完整真实应用验收证据。官网标注“即将支持”，三态图明确为行为示意。
- Profile.actions 是数组，main.rs::dispatch_profile 遍历 executions，并在错误时停止。因此不能断言底层只支持一个 action。官网场景采用“一排独立按键”示例，不承诺一键同时启动整套工作流。
- 三步流程遵循当前 Runtime：连接设备 → 创建动作 → 录制绑定；修正需求草案中先录制再选择动作的顺序。
- 键盘兼容性限定为系统可识别、Blink 可监听的按键；不承诺接管任意厂商特殊键。配置在电脑端，不包含账号同步。
- Windows 仅列后续计划；下载地址未提供，不伪造 GitHub Release，不标为 Available。

## 2026-09-03：页面结构与实现

技术栈：React 19、TypeScript、Vite 8、Lucide 图标、原生 CSS。无需 UI 大框架。沿用现有技术栈，在非空产品仓库中新增独立官网，不替换现有工程。

结构：
1. Hero：把常用动作，交给一个按键。正式图标、双 CTA、Runtime 截图。
2. 工作场景：开发者 / 电商运营 / 内容与办公可切换，F13–F16 每键独立示例。
3. App 快速切换：一键叫出，再按一次收起；即将支持。
4. 闲置按键：那些闲着的按键，可以很有用。
5. 五类能力：App、URL、脚本、系统快捷操作、App 切换。
6. 无需刷固件：软件侧定义与设备兼容边界。
7. 三步开始：连接设备、创建动作、录制绑定。
8. 下载：macOS 优先；当前下载禁用且注明即将开放，提供联系作者入口。
9. Footer：产品锚点和反馈邮箱，无假 GitHub / Privacy / Terms 链接。

文案集中在 website/src/content.ts。DOWNLOAD_URL_PLACEHOLDER 当前为 #download；配置正式 URL 后，下载按钮自动启用，Hero 状态同步更新。站点源 SITE_URL 用于构建绝对 canonical、OG 和 sitemap。

主要文件：
- website/src/App.tsx：页面结构、场景切换和 CTA。
- website/src/content.ts：全部主要文案、场景、状态示意、下载地址和站点地址。
- website/src/style.css：主题、栅格、600/900px 断点、焦点状态与 reduced-motion。
- website/src/main.tsx：客户端渲染 / 静态 HTML hydration。
- website/scripts/prerender.mjs：React 构建后静态预渲染、SEO、robots.txt、sitemap.xml。
- website/index.html、package.json、package-lock.json、tsconfig.json、vite.config.ts、src/vite-env.d.ts：独立工程。
- website/public/blink.svg、blink.png、runtime-settings.png、og.png：正式图标、现有截图和品牌社交图。
- website/.openai/hosting.json：Sites 身份与静态 dist 输出。

SEO：中文 title/description、viewport、favicon、OG website/locale/title/description/image、Twitter summary_large_image、canonical、robots.txt、sitemap.xml。正文预渲染后无 JavaScript 也可阅读，场景切换在 hydration 后启用。私有 Sites 的平台访问限制独立于 SEO，配置不代表搜索引擎已收录。

响应式：桌面四列场景卡片、三/两列功能卡片，平板收窄间距；手机隐藏中间导航、场景/功能/步骤单列、CTA 保留、映射列表单列。没有 WebGL、粒子、重型动画。交互仅锚点、原生按钮切换和 hover。

## 2026-09-03：验证与交付

验证和发布回执在最终交付时追加。需要用户补充正式 macOS 下载地址；可选补充原生 Runtime 主命令面板截图、正式域名和 Toggle 稳定验收结果。

本地命令（仓库根目录）：

```sh
npm --prefix website ci
npm --prefix website run dev
npm --prefix website run typecheck
npm --prefix website run build
npm --prefix website run preview
```

开发地址 http://127.0.0.1:5180/；构建预览地址 http://127.0.0.1:5181/。仅启动官网，不启动或更改 Runtime。

### 本次验证结果

- `npm --prefix website run typecheck`：通过。
- `npm --prefix website run build`：通过，包括 typecheck、Vite 构建和 React 静态预渲染。
- 生产 JS 211.79 kB（gzip 67.84 kB），CSS 12.93 kB（gzip 3.75 kB）。页面 HTML 20,037 字节，包含正文和唯一 h1；没有 JS 也能读取默认场景与全部主段落。
- 浏览器检查：1440×1000 桌面、768×1024 平板、390×844 手机。三种尺寸无横向溢出；产品图正常加载。开发版场景切换及生产构建 hydration 后电商场景切换均正常。
- 导航进入 #download；下载按钮为 disabled，明确“即将开放”，无虚构外部下载链接。mailto 链接目标已核对，未发送邮件。
- 截图：`docs/blink-website-desktop.png`、`docs/blink-website-mobile.png`。这是官网浏览器截图，不是原生 Runtime 能力验证。
- 页面标题、description、favicon、OG 标题/描述、Twitter Card 已生成。**由于发布连接受阻，SITE_URL 仍为空，因此当前产物未生成 canonical、og:image/twitter:image 的绝对 URL，sitemap.xml 为待填充结构。** 已有品牌 og.png；取得可信站点域名后设置 SITE_URL 并重建即可补齐。不使用 localhost 或猜测的域名冒充正式 canonical。

### Sites 发布阻塞与恢复点

- 已创建并持久化 Sites project_id：`appgprj_6a99206a3a88819185bc3d7104006567`，后续必须复用 website/.openai/hosting.json，禁止重复创建。
- Sites 当前访问策略是 owner-only，仅当前用户可见。正式公开还需切换访问权限并确认公开发布。
- 官网源码位于 website/ 独立 Git 仓库；本次本地 commit 为 `97bed925e960d67d642b30bd6ad03572d4eb7879`。未提交父仓库和用户其他产品修改。
- 构建归档已由 Sites 官方 package-site.sh 成功打包；源码 push 未完成，因此未调用 save_site_version 和 deploy，尚无线上 URL。
- 直连及 Mac 当前代理 `127.0.0.1:1082` 均返回 `LibreSSL SSL_connect: SSL_ERROR_SYSCALL`，连接目标为 Sites 返回的源码服务器 `git.chatgpt-team.site:443`。经沙箱外重试仍失败；不关闭证书校验、不修改系统代理设置。
- 恢复顺序：确认源码服务器 TLS 可达 → 获取有效的短期写凭证 → 推送并验证远端 HEAD → 保存构建版本 → owner-only 部署 → 用实际返回 URL 填写 SITE_URL → 重建推送并部署最终 SEO 版本。不得把本地 commit 或归档当作已发布证明。
- 本地构建预览暂保留在 http://127.0.0.1:5181/，便于当前用户审阅；开发服务器已停止。重启命令见上文。

### 仍需提供的材料

必需：正式 macOS 安装包/下载 URL。公开上线时需确认域名与访问范围。
可选：原生 Runtime 命令面板正式截图、系统最低版本与架构支持信息、Toggle App 稳定验收结论。当前不虚构版本号、支持范围、用户量或产品背书。

## 2026-09-03：首版布局密度、三视图与自定义按键叙事修正

### 本轮范围与页面变化

遵循用户最新约束：仅修改代码和本地验证，本轮不提交、不推送、不保存 Sites 版本、不发布。沿用现有深色蓝青品牌方向、技术栈和 section，不修改 Runtime 源文件。

- Hero 标题保留居中；产品区域取消 82% 窄幅限制，容器上限由 1120px 提升到 1360px，超宽屏为 1500px。产品区采用宽截图 + 说明侧栏。
- 新增独立 `ProductShowcase.tsx`：React useState 管理命令面板 / 设置与状态 / 按键与动作三个视图。原生按钮、aria-pressed、aria-controls 与 aria-live；键盘 Tab/Enter 可操作。无自动播放、定时器或新增依赖，200ms 淡入并尊重 reduced-motion。
- 默认命令面板：使用当前 `runtime/src/main.ts` 与真实样式，在临时本地隔离页面中模拟 native snapshot 渲染，再截图。四个示例命令（打开编辑器、项目文档、本地启动脚本、复制）均未绑定，监听暂停。截图明确标注示例，不证明原生执行效果。截图没有修改 Runtime 代码，也未启动原生 Runtime。
- 设置视图继续使用既有新版设置页截图，并保留模拟状态说明。
- 动作视图是五行独立绑定关系：App、URL、脚本、系统快捷操作、快速切换 App；最后一项继续标为即将支持。每行独立，不宣称一次触发全部。
- 场景模块改成左侧标题 + 右侧切换和卡片；开发者、电商、内容办公保留，内容办公覆盖邮箱、Notion、ChatGPT、协作工具。
- App 切换模块采用更宽双栏，按键提示改为“你的按键”，保留真实状态三态说明。
- 原闲置功能键区改为“你手边的键盘，就是动作入口”。普通键盘与 Macro Pad 两类说明配合用户提供的三键小键盘图，桌面左文右图，移动端纵排。通过 CSS object-fit/object-position 裁去留白，原始图片不改写；注明不限定此款、不提供硬件购买入口，兼容性仍以系统可识别与 Blink 可监听为界。
- 功能区标题与说明左右展开，功能卡片加宽；无需刷固件区保留双栏，三步区标题左对齐。移动端收为单列。

### 文案替换与素材

- 三类场景中所有 F13–F16 均改为“自定义按键”；描述改为“一个键打开编辑器 / 进入终端 / 查看仓库 / 打开调试地址”等动作语义。
- `localhost` 改为“本地项目页面”。App 状态示意中的 F13 改为“你的按键”。移除旧 keyMappings 固定键位清单。
- Hero 改为“用你喜欢的实体按键，唤起 App、URL、脚本和系统动作。普通键盘，或外接小键盘。让常用动作一键直达。”
- 产品视图、设备类型、图片 alt/caption 和所有主要文案继续集中于 content.ts。
- 新增 public/runtime-commands.png（真实 Runtime 组件 + 示例数据截图）、public/macro-pad.png（用户本轮提供的三键设备图）。现有设置图、正式图标继续复用。
- 待补充：可用原生 Runtime 正式命令面板截图替换当前示例组件截图；正式下载地址仍待提供。三键图片已收到并使用，无需重复提供。

### 验证回执

- 独立 typecheck 由 build 脚本执行，通过；Vite 构建和静态预渲染通过。
- JS 215.50 kB，gzip 约 68.96 kB；没有新增依赖。
- 浏览器检查 CSS viewport 1440px、768px、390px：均无横向溢出；三个产品视图可切换，动作示意五行没有被容器裁切；设置图与三键图正常加载。
- 三类场景切换正常，电商及办公卡片内容符合新文案。官网源码及渲染正文未发现 F13–F16。
- 本地预览仍为 http://127.0.0.1:5181/。临时 Runtime 截图服务已停止。
- 变更文件：website/src/App.tsx、website/src/content.ts、website/src/style.css、新增 website/src/ProductShowcase.tsx、两张 public 图片，以及本文追加记录和官网预览截图。

## 2026-09-05：Product Design website UX / Accessibility 审查

### 审查范围

- 目标：审查 Blink 官网从首屏理解产品、查看 Runtime 证据、浏览使用场景、了解能力边界到下载/联系作者的完整单页路径。
- 当前证据：本轮本地开发页 `http://127.0.0.1:5180/` 的桌面完整截图、390×844 移动端首屏截图、DOM/可访问性树和实际场景切换控件状态。
- 限制：本轮浏览器服务不能把截图字节另存为新的 workspace 文件，因此截图已在审查回复中内联展示；`docs/blink-website-desktop.png` 与 `docs/blink-website-mobile.png` 是历史验证产物，不作为本轮证据。未做真实屏幕阅读器、键盘硬件、浏览器缩放、色彩对比度仪器或真实下载/安装测试。

### 用户目标与总体判断

用户需要快速判断“Blink 能否把自己的实体键盘变成可靠的 App/URL/脚本/系统动作入口”，然后决定是否下载。视觉方向成熟、产品边界总体诚实，但当前转化路径仍像“产品概念展示页”，不像一个能让用户立即完成下一步的官网：下载未开放时，首屏和底部都把注意力推向不可执行的 CTA；同时长页面的信息密度和重复叙事会削弱首次访问者对“现在能做什么、还不能做什么”的判断。

### 分步健康度

1. 首屏理解产品：中等。标题和两条 CTA 清楚，产品定位一眼可懂；但“下载 Blink”在首屏视觉权重最高，实际却不能下载，容易造成预期落差。
2. 查看产品证据：中等偏好。三个产品视图有真实感，标签切换可用，图片 alt 与 `aria-pressed`/`aria-live` 基础语义存在；但截图中的示例数据与真实 Runtime 能力的区分仍主要依赖小字号说明。
3. 选择使用场景：良好。开发者/电商运营/内容与办公的分组易懂，切换后内容更新，场景卡片结构一致。
4. 理解能力边界：中等。已实现/即将支持和设备兼容边界都有说明；但“打开 App / 快速切换 App / 一键叫出”在不同区块重复出现，读者需要自己汇总能力矩阵。
5. 了解上手流程：良好。连接键盘→选择动作→录制绑定的顺序合理，三步文案直接。
6. 下载或联系作者：偏弱。下载按钮为 disabled，状态文本明确，但首屏 CTA、导航 CTA 和底部下载区形成多个不可完成入口；唯一可执行的联系作者是 mailto，且没有明确说明反馈/申请内测/获取下载地址的区别。

### 优点

- 深色背景、蓝青强调色、截图与硬件图形成统一视觉语言，品牌辨识度较强。
- 页面不是凭空承诺，明确写出“即将支持”“行为示意”“设备需能向系统发送可识别按键”“当前不提供账号同步”等边界。
- DOM 结构有唯一 h1、分区 heading 层级、skip link、图片 alt、按钮状态和 live region；场景与产品视图并非依赖自动播放。
- 移动端 390px 下首屏仍能完整呈现品牌、标题、说明和双 CTA，截图未见横向溢出。

### UX 风险（按优先级）

1. **P0：主要 CTA 与真实状态冲突。** 首屏“下载 Blink”和导航“下载 Blink”看起来像立即下载，但实际地址仍是 `#download`，底部按钮 disabled 且写“即将开放”。建议统一为一个当前可执行目标：若未开放，首屏 CTA 改为“申请内测/获取通知/联系作者”，并把“下载”降级为状态标签；开放后再恢复下载主 CTA。
2. **P1：长页面中产品叙事重复，增加决策成本。** Runtime 展示、场景卡、App 切换示意、硬件故事、功能卡都重复表达“一个键触发一个动作”。建议把内容收敛为“现在可用能力 / 即将支持 / 兼容条件”三组，保留一处情绪化硬件故事即可。
3. **P1：证据与营销文案的层级不够分明。** “真实界面”“行为示意”“功能开发中”存在，但说明字号偏小，用户先看到的是大标题和截图，容易把模拟数据或规划能力当成已验证能力。建议给截图增加更明显的状态徽章，使用统一的“已实现 / 示例 / 开发中”视觉标识，并在能力区放一张可扫描的状态表。
4. **P2：产品视图切换的控件形态不够直观。** 可访问性树将其暴露为 checkbox，而视觉上更像 tabs；对普通用户来说当前页、可切换页和数量关系需要靠样式猜。建议使用 `role=tablist`/`role=tab`/`aria-selected`/`aria-controls`，并在视觉上明确选中态。
5. **P2：移动端导航信息架构被过度压缩。** 390px 截图只保留品牌和下载，用户无法直接跳到功能、场景或如何使用；对于长页面，回到关心区块的成本较高。建议保留一个可展开菜单，或增加固定的“功能 / 场景 / 如何使用”锚点入口。

### Accessibility 风险

- 截图可见的低对比度小字、英文 eyebrow 和深色边框，在移动端尤其可能低于舒适阅读阈值；需用实际颜色值做 WCAG 对比度检测，不能仅凭截图确认合规。
- 当前产品视图和场景切换在 DOM 树中表现为 checkbox，不是最贴切的 tab 语义；需用键盘和屏幕阅读器确认是否能感知当前项、切换结果和关联内容。
- “下载 Blink” disabled 后没有可执行替代路径；这不是纯可访问性错误，但会让键盘用户和辅助技术用户停在无结果的主路径上。应提供可聚焦、可执行的联系/申请入口，或把不可用 CTA 改为普通状态文本。
- 需要额外验证焦点环在深色背景和移动端按钮上的可见度、固定/粘性导航是否遮挡锚点目标，以及 200%/400% 缩放下产品截图和横向布局是否仍可读。

### 建议的最小改动顺序

1. 先修 CTA 状态：明确“当前不可下载”对应的唯一下一步，并统一导航、首屏、底部的文案与交互。
2. 把产品能力改成三段状态矩阵：已实现、示例/需权限、即将支持；截图说明提升为可见徽章。
3. 将产品视图切换改成语义 tabs，并补充键盘方向键/Tab 行为测试。
4. 移动端提供长页面导航入口；再处理长页面重复叙事和低对比度小字。

### 审查回执

- 文档路径：`docs/blink-official-website.md`
- 新增章节：`2026-09-05：Product Design website UX / Accessibility 审查`
- 追加摘要：记录本轮本地桌面/移动端实际审查范围、六步路径健康度、4 项主要 UX 风险、4 项可访问性风险、证据限制和最小改动顺序。

## 2026-09-05：按审查结论完成 CTA、状态与页面收敛

### 修改内容

- `website/src/App.tsx`：下载地址仍未配置时，导航、Hero 和底部主 CTA 统一改为“申请 Blink 内测”，指向带主题的作者邮箱；开放正式下载地址后自动恢复下载文案。
- `website/src/App.tsx`：移除独立的 App 切换大区块，保留“快速切换 App”为功能卡中的“即将支持”，减少重复的三态叙事。
- `website/src/App.tsx`：场景区增加“使用示例”状态，功能卡统一显示“已实现 / 即将支持”。
- `website/src/ProductShowcase.tsx`：Runtime 产品视图统一显示“已支持”或“示例流程”状态。
- `website/src/content.ts`：集中新增 CTA 和示例状态文案；未新增任何 Blink 能力。

### 本轮实际复审

- 以新的本地端口 `http://127.0.0.1:5182/` 启动当前源码，避免旧端口缓存影响证据。
- 桌面完整截图确认：Hero、导航和下载区均显示“申请 Blink 内测”；功能区五张卡明确显示四项“已实现”和一项“即将支持”；页面整体明显缩短。
- 产品视图切换确认：切换到“绑定按键”后，捕获中/已绑定两张图和“示例流程”状态正常更新。
- DOM/可访问性树确认：主要 CTA 均为可执行 mailto 链接，不再是 disabled 下载按钮；主页面仍保留唯一 h1、分区标题和图片 alt。
- 已执行 `npm run typecheck` 与 `npm run build`，均通过。

### 复审结论

本轮三项目标均达到：CTA 与当前发布状态一致；已支持、示例、即将支持在页面上可区分；移除了重复的 App 切换展示区，页面更短且主线更集中。仍待后续单独验证：真实邮件客户端打开行为、实际下载发布后的正式 URL、屏幕阅读器与 200%/400% 缩放体验，以及颜色对比度数值。

## 2026-09-05：Cloudflare Pages 发布与 CI/CD 配置（阻塞）

- Local Build：`website` 独立构建；`npm ci`（隔离临时 cache）通过；`npm run typecheck` 通过；`npm run build` 通过；输出 `website/dist`；Node `v22.23.1`。
- Cloudflare 目标配置已确认：GitHub 仓库 `codeinsightlab/Blink`，生产分支 `main`，Root directory `website`，Build command `npm run build`，Output directory `dist`，Node 22；未配置自定义域名。
- GitHub：仅提交 website 相关变更，提交 `ea56274` 已推送到 `main`；未修改 Runtime、Tauri 或 Release workflow。
- Chrome 浏览器操作：接管已登录 Chrome 中的 Cloudflare DNS 标签页，进入 Workers & Pages；刷新后页面主体仍为空白，无法可靠读取 Pages 项目列表，也无法判断是否已有同名项目。
- 因 Cloudflare Pages 页面渲染阻塞，未创建项目、未授权 GitHub、未触发 Production/Preview 部署、未修改 DNS、未进行付费升级或账户级设置。
- Production URL、Preview 验证、线上资源检查和 CI/CD 验证均未完成；当前状态为 BLOCKED。

## 2026-09-05：发布前最终 Product Design 审查

### 必须发布前修复

- **首屏理解：通过。** 5 秒内可理解 Blink 是把 App、URL、脚本和系统动作绑定到实体键盘的 macOS 优先桌面工具。
- **CTA：通过。** 下载地址未配置时，桌面和移动端首屏、导航、底部 CTA 均显示“申请 Blink 内测”，没有伪造下载地址。
- **能力状态：基本通过。** 功能卡明确区分“已实现 / 即将支持”，Runtime 展示区区分“已支持 / 示例流程”。发布前应确认“真实 Runtime 界面”是否会让用户误解为完整原生能力已验证；如果截图含模拟数据，建议改为“Runtime 界面示例”。

### 可以发布后优化

- 将产品视图和场景切换改为语义化 tabs，并做屏幕阅读器与键盘方向键测试。
- 移动端补充长页面导航入口。
- 将“使用示例 / 配置示例 / 真实界面 / 示例流程”收敛为统一状态图例。
- 补做颜色对比度、200%/400% 缩放、焦点环和真实邮件客户端测试。

### 不建议修改

- 不建议改变当前深色背景、蓝青强调色、居中 Hero 和大幅产品截图的整体方向；桌面与移动端视觉层级一致。
- 不建议恢复独立的 App 切换大区块；当前作为“即将支持”功能卡更集中。
- 不建议增加账号同步、Windows 下载、硬件购买、自动播放或其他未验证能力。

### 最终结论

当前页面可进入发布准备阶段。唯一建议发布前确认的是 Runtime 截图标签：若截图包含模拟数据，应先改为“Runtime 界面示例”；除此之外，本轮七项检查没有发现必须阻断发布的问题。

### 审查回执

- 文档路径：`docs/blink-official-website.md`
- 新增章节：`2026-09-05：发布前最终 Product Design 审查`
- 追加摘要：记录桌面与 390×844 移动端实际截图、首屏理解度、CTA、状态标识、重复叙事、截图说服力、响应式层级和能力误解风险。

## 2026-09-05：CI/CD 整理与 Cloudflare Pages 重试

### CI/CD Review

- 当前 workflow：`release.yml` 负责 `v*` tag / 手动客户端发布；`build-candidate.yml` 负责手动候选客户端构建；`verify.yml` 负责 Runtime、Rust、Tauri 和共享 contract 回归检查。
- 原问题：`verify.yml` 原先监听所有 branch push 和所有 PR，website 改动会触发 macOS/Windows Runtime 检查；website 本身不导入 `@blink/contract`，Runtime 通过 `file:../packages/blink-contract` 依赖共享包。
- 未发现 Runtime 改动触发 website CI 的必要共享依赖；本轮将两条链路按真实依赖隔离。

### CI/CD Changes

- 新增 `.github/workflows/website.yml`：仅对 `website/**` 或自身 workflow 变化的 `main` push、PR 运行；执行 Node 22、`npm ci`、`npm run typecheck`、`npm run build`。
- `verify.yml` 增加 Runtime、`packages/blink-contract`、tests、根 package/lockfile 和自身 workflow 的 paths 过滤；保留原 Runtime 检查内容与 Release 对它的 reusable workflow 调用。
- `release.yml` 未重写，仍仅由 `v*` tag 或手动 workflow_dispatch 触发。

### Trigger Matrix

| 改动 | Website CI | Runtime CI | Desktop Release |
|---|---|---|---|
| `website/**` | 是 | 否 | 否 |
| `runtime/**` | 否 | 是 | 否 |
| `packages/blink-contract/**` | 否 | 是 | 否 |
| `v*` tag | 否 | 否（Release 内部按既有调用执行验证） | 是 |

### Validation

- website `npm ci`、`npm run typecheck`、`npm run build`：本地通过。
- workflow YAML：`website.yml`、`verify.yml`、`release.yml`、`build-candidate.yml` 均通过 Ruby YAML 解析。
- GitHub Actions：`Build Blink website` run `33951878822`，commit `b3a96b2`，成功；typecheck/build steps 均成功。

### Cloudflare Retry / Deployment

- Chrome 中已接管用户已登录的 Cloudflare 账户，检查发现没有 Blink 同名 Pages 项目；已有项目为 promptforge-site 和 baby-card。
- 创建 Pages 项目：`blink`，GitHub 仓库 `codeinsightlab/Blink`，Production branch `main`。
- 配置：Root `website`，Build command `npm run build`，Output `dist`，文本变量 `NODE_VERSION=22`。
- Production 部署成功，默认地址：`https://blink-4zm.pages.dev/`。
- Cloudflare 设置确认：Production 自动部署已启用；Preview deployments 默认公开。
- Cloudflare 构建监视路径已从默认 `*` 收窄为 `website/**`，避免 Runtime 无关变更触发官网部署。
- 线上 Chrome 验证：首页、CSS、图片、CTA、Runtime 产品视图切换正常；控制台无 warning/error；HTTP HEAD 返回 200。
- 未配置自定义域名，未修改 DNS、未进行付费升级、未删除资源、未创建 API token。

### Fallback / 未完成项

- Wrangler fallback：不需要；Cloudflare Git 集成和 Production 已成功。
- Preview：Cloudflare 设置确认 Preview 默认公开，但本轮未创建临时 branch，因此没有独立的 Preview URL 验证。
- 自定义域名：未配置；不猜测正式域名。
- 当前已知仓库未提交变更：根 `.gitignore` 仍有用户既有修改，本轮未触碰。

### 发布回执

- 文档路径：`docs/blink-official-website.md`
- 新增章节：`2026-09-05：CI/CD 整理与 Cloudflare Pages 重试`
- 追加摘要：记录 CI/CD 职责隔离、触发矩阵、本地与 GitHub Actions 验证、Cloudflare Pages 项目配置、Production URL、Preview 状态、线上检查和未完成风险。

## 2026-09-05：Cloudflare Preview Deployment 验证与自定义域名

### Preview Verification

- 临时分支：`chore/verify-cloudflare-preview`
- 验证提交：`86b469c`，仅在 `website/src/ProductShowcase.tsx` 增加无行为影响的注释。
- Cloudflare 已识别该分支并创建 Preview deployment 记录，但状态为 `skipped`，未启动构建；Preview URL 为 `https://908211ab.blink-4zm.pages.dev`，因此没有可验证的 Preview 页面、HTTP 或控制台结果。
- 未 merge。由于验证未成功，按条件保留本地和远程临时分支，避免删除可复现证据。

### Custom Domain

- 按用户指定配置 `blink.learnaiwithcode.com`，未修改 nameserver。
- Cloudflare Pages 自动准备 CNAME：`blink → blink-4zm.pages.dev`。
- Pages 状态为“正在初始化”，提示 DNS 更新可能需要最长 48 小时；配置后即时访问返回 HTTP 522，Production `https://blink-4zm.pages.dev/` 仍返回 HTTP 200。
- 未覆盖已有生产域名，未删除资源，未进行付费升级。

### 当前未完成项

- Preview 自动部署仍需进一步查明为何被 Cloudflare 标记为 `skipped`，并重新取得成功的 Preview URL 后再做浏览器、资源和控制台验证。
- 自定义域名仍处于初始化/DNS 生效阶段，尚不能作为已完成线上访问证明。

## 2026-09-05：main Merge 后 Cloudflare 触发解释

### 事实

- website 功能提交已在 `57174c2` 推送到 `main`；该 push 实际触发 GitHub Actions `Build Blink website` run `33953492406`，并成功完成 typecheck/build。
- 随后的整体 merge commit `77f672f` 只带来了 `docs/blink-official-website.md`，没有新增或修改 `website/**`。
- `.github/workflows/website.yml` 的 `push` 触发条件是 `branches: main` 且 `paths: website/**` 或 workflow 文件本身；因此 `77f672f` 不会再次触发 Website CI。
- Cloudflare Pages 也配置为仅监视 `website/**`，所以 docs-only merge 不会触发 Cloudflare Production deployment。

### 结论

- 这不是 push 失败，也不是 Cloudflare 权限错误，而是路径过滤按预期跳过了不包含 website 文件的 merge push。
- 需要重新部署时，应在 Cloudflare Pages 控制台对最近一次 Production deployment 执行 Retry，或推送实际包含 `website/**` 变更的提交；不应为了触发部署制造无意义的空代码提交。

### 发布回执

- 文档路径：`docs/blink-official-website.md`
- 新增章节：`2026-09-05：main Merge 后 Cloudflare 触发解释`
- 追加摘要：记录 `57174c2` 的成功 website CI、`77f672f` 的 docs-only merge、GitHub/Cloudflare `website/**` 路径过滤及正确重试方式。

## 2026-09-05：Cloudflare Production 显示“暂无可用部署”排查

### 事实

- Cloudflare Pages 的提交列表能看到 `128beb7`、`b5ca0b8`，但部署列显示“暂无可用部署”；这表示 Cloudflare Git 集成看到了提交记录，不等于已经创建了可访问的 Pages deployment。
- GitHub Actions `Build Blink website` 对 `128beb7` 的 run `33953867064` 已成功完成；因此当前证据支持“仓库代码与 GitHub CI 正常”，不支持“GitHub push 失败”。
- 两个提交均包含 `website/**` 变更，按当前配置本应满足 Cloudflare 的网站路径过滤条件；因此需要在 Cloudflare 该提交的“详细”页区分 `skipped`、构建失败、分支部署控制或 GitHub 授权失效。

### 建议检查顺序

1. Pages 项目 `blink` → Settings → Builds & deployments：确认连接仓库为 `codeinsightlab/Blink`、Production branch 为 `main`、自动部署未暂停。
2. 确认 Root directory 为 `website`、Build command 为 `npm run build`、Output directory 为 `dist`、Node 为 22。
3. 检查 Build watch paths 的 include/exclude。为诊断可暂时将 include 放宽为 `*`（并移除匹配 `website` 的 exclude），保存后对 `128beb7` 执行 Retry；成功后再收窄为能匹配仓库路径的 `website/*`。
4. 若详情仍显示 skipped，检查该项目的 Branch deployment controls 与 Cloudflare GitHub App 对 Private `Blink` 的授权；若显示 failed，则以构建日志中的首个 error 为准，不把 GitHub Actions 成功当作 Cloudflare 部署成功。

### 结论边界

- “GitHub Actions 成功”与“Cloudflare Pages 生成 deployment”是两条独立链路；前者不能证明后者。
- 在 Cloudflare 详情页得到 `success` 和 deployment URL 之前，不能把 `https://blink-4zm.pages.dev/` 视为本次提交已部署，也不能声称公开线上内容已更新。

### 根因定位与修正

- 已核对 Pages 提交记录中的 `128beb7` 与当前 Private 源码仓库 `codeinsightlab/Blink` 的 `main` 提交完全一致；因此“连接了最初旧 Git 仓库”不是当前证据支持的根因。
- GitHub 对该提交只有 Website CI 成功检查，没有 Cloudflare Pages check run；结合 Cloudflare 显示“暂无可用部署”，更符合 Pages 在部署创建前被跳过，而不是构建失败。
- Cloudflare 官方 Build Watch Paths 语法使用单个 `*` 匹配跨目录路径，官方 monorepo 示例为 `project-a/*`。因此将 Pages Include 从 `website/**` 修正为 `website/*`（或先临时使用 `*`）是必要的仓库外配置修正；GitHub Actions 中的 `website/**` 不需要改动。
- 修正后应在 Cloudflare 对提交 `128beb7` Retry；只有看到成功 deployment URL，才算完成线上部署验证。

### 发布回执

- 文档路径：`docs/blink-official-website.md`
- 新增章节：`2026-09-05：Cloudflare Production 显示“暂无可用部署”排查`
- 追加摘要：记录 GitHub CI 与 Cloudflare deployment 的边界、当前提交证据、路径过滤/分支控制/授权的排查顺序及未确认项。

## 2026-09-05：工作流场景卡片切换出现追加内容

### 根因

- `website/src/App.tsx` 的工作流卡片列表原来使用第一列 `key` 作为 React key。
- 同一场景的四张卡片第一列相同（例如都为“自定义按键”），形成重复 React key。
- 切换场景或语言时，React 无法稳定对应旧节点与新节点，可能出现旧卡片残留、中英文混杂或内容像追加一样增长。

### 修正

- 改为使用 `scenario`、卡片索引、图标和名称组合的稳定唯一 key：`${scenario}-${index}-${icon}-${name}`。
- 未修改工作流文案语义；保留用户对 `website/src/content.ts` 的现有未提交修改。

### 验证

- `website`: `npm run typecheck` 通过。
- `website`: `npm run build` 通过。
- 预渲染首页包含 4 张工作流卡片，未出现重复追加。

### 发布边界

- 本次修改尚未提交或推送；需要提交并触发 Cloudflare Pages 部署后，再验证线上场景切换。

## 2026-09-05：官网最新下载链路与首屏 CTA 优化

### 审查结论

- 原实现直接从浏览器请求 GitHub Releases API，所有访问者共享 GitHub API 限流和跨域网络延迟。
- `platform` 初始值固定为 `other`，`downloadLoading` 初始为 `true`；因此 macOS/Windows 首屏会先显示“正在匹配”类文案，API 返回后才切换。
- 原实现的 Releases 页面 fallback 正确，但只在 API 失败或没有匹配 asset 后生效。
- 项目此前没有 Cloudflare Pages Functions；本次没有引入 GitHub token、Secret、独立服务器或数据库。

### 实现

- 新增 `website/functions/api/latest-release.ts`：Cloudflare Pages Function 请求 `Blink-Releases` 的 latest release，只返回 `tag`、`macos`、`windows`、`releasePage`，不透传 GitHub 完整响应。
- Function 对成功结果设置 5 分钟 `max-age` 和 `stale-while-revalidate`，发布新 Release 后无需 website rebuild/redeploy，缓存过期后自动更新。
- 前端改为请求 `/api/latest-release`，不再让浏览器直接请求 GitHub API。
- OS 检测在前端首个渲染状态同步完成，分类仅为 macOS、Windows、other；API 请求只静默替换 href。
- 初始 href 始终为 `https://github.com/codeinsightlab/Blink-Releases/releases/latest`，API 慢、超时、429、5xx、JSON 异常或缺少平台 asset 时 CTA 仍可点击。
- 移除首屏 loading 文案，不再渲染“正在匹配 / Finding your download”。

### 验证

- `cd website && npm run typecheck`：通过。
- `cd website && npm run build`：通过。
- 预渲染产物不包含 loading 文案；首页仍生成两个可点击的下载 CTA。
- 浏览器真实 macOS/Windows/other、Cloudflare Function 缓存命中/失效和线上部署 URL 尚未在本次本地构建中证明，需 Cloudflare 部署后继续验收。

## 2026-09-05：首屏 locale/platform 同步初始化与闪烁修复

### Root Cause

- 静态预渲染 HTML 固定输出默认 locale；客户端随后从 `localStorage`/`navigator.language` 读取真实 locale，造成英文→中文或中文→英文的短暂切换。
- `platform` 虽已改为 state initializer，但预渲染 HTML 与浏览器平台仍不一致；`hydrateRoot` 会在首次客户端 render 时进行 hydration reconciliation，造成 `other`→macOS/Windows 的短暂切换。
- `<html lang>` 原先依赖 React mount 后的 effect，首个 HTML 状态不一定反映用户偏好。

### Changes

- `website/index.html` head 新增同步 bootstrap：在主 bundle 前读取 `blink-language`、fallback `navigator.language`，同步写入 `data-locale`、`data-platform` 和 `<html lang>`。
- `website/src/App.tsx` 首次 state 直接读取 bootstrap；locale/platform 不再通过初始 `useEffect` 二次赋值。
- 手动切换语言时同步更新 `localStorage`、`data-locale` 和 `<html lang>`；latest-release 请求仍只更新下载 href。
- `website/src/main.tsx` 改为客户端 `createRoot`，不再用预渲染 HTML 做 hydration，避免服务端默认状态与真实客户端状态对比造成闪烁。
- 中文 Hero 文案更新为“为你的 PC，多一点顺手”。

### Validation Boundary

- `cd website && npm run typecheck`：通过。
- `cd website && npm run build`：通过。
- 产物包含 bootstrap，且 latest-release Function 未修改。
- 中文/英文、macOS/Windows、无 localStorage/已有 localStorage 的真实浏览器首帧 filmstrip 尚未在本地工具中完成；需 Cloudflare Production 部署后匿名浏览器复核。
# 2026-09-10 Changelog 与发布门禁

## 新增章节

- 官网新增可静态抓取的 `/changelog` 页面，版本数据集中维护于 `website/src/changelog.json`，覆盖现有 `v0.1.0` 至 `v0.1.10` 正式 tag。
- 历史内容依据 tag 日期、tag 间提交与已有发布审查转换为用户视角；证据不足的 `v0.1.5`、`v0.1.6` 明确保守标为维护版本，没有虚构修复项。
- Changelog 具备独立 title、description、canonical、Open Graph、Twitter metadata、语义化 H1/H2/H3、版本 anchor，并写入 sitemap；`lastmod` 使用最新 release 日期而非构建时间。
- `website/scripts/verify-changelog-version.mjs` 校验指定 tag 恰有一条带日期及中英文摘要的记录；Release workflow preflight 在构建安装包前执行该门禁。
- `AGENTS.md` 新增 Release Changelog Rule，要求 changelog 提交先于 tag 创建或推送。

## 多语言 SEO 状态

当前官网延续单 URL 客户端中英文切换，Changelog 不强行引入新路由体系。预渲染正文以站点默认语言输出，浏览器可切换完整中英文内容；当前没有 `/zh/`、`/en/` 或 `hreflang`。若未来建立稳定的 locale URL，再统一为各语言生成 canonical 与 hreflang，避免只为单页形成不一致的路由模型。

## 发布边界

本次只修改本地网站、Release preflight 与项目约束；没有创建或推送 tag，没有触发 GitHub Release，也没有执行 Cloudflare Pages 部署。线上是否更新仍必须以 Cloudflare Production deployment URL 与真实页面验证为准。

## 2026-09-10 Production Deployment

- Changelog/SEO/发布门禁提交 `fda802f95d1eba76b1717425265ba61c0186bf95` 已推送至 `main`。Cloudflare Pages Git integration 对应 Production deployment 状态为 `success`，北京时间 2026-09-10 11:08 完成，deployment URL 为 `https://f52ee500.blink-4zm.pages.dev`，自定义域 `https://blink.learnaiwithcode.com/` 已切换到该产物。
- 线上首页、`/changelog`、`/changelog#v0-1-10`、`/sitemap.xml`、`/robots.txt` 均为 HTTP 200；浏览器确认首页导航与 Footer 入口、双平台 v0.1.10 下载、中英文切换及版本锚点正常。
- `/changelog` 与 `/changelog/` 均返回 200，且 canonical 统一为 `https://blink.learnaiwithcode.com/changelog`；`/changelog.html` 返回 308 并跳转至 `/changelog`，当前无需 duplicate route follow-up。
- sitemap 使用 HTTPS 正式域名，Changelog `lastmod` 为 `2026-09-09`。robots 的通用规则允许 `/`，Cloudflare Managed Content 仅限制部分 AI crawler；页面无 `noindex`/`nofollow`，响应无 `X-Robots-Tag: noindex`。
- GitHub Website build run `34432136410` 因账户账单或 spending limit 在 runner 启动前失败；Cloudflare 自身构建日志确认 Node 22 构建、上传与 Production 部署成功。该 GitHub Actions 账户问题不改变本次 Cloudflare 上线结果，但应单独修复 CI 可用性。
- 未创建 Runtime tag、GitHub Release 或桌面安装包；未提交 Google Search Console，也不声称搜索引擎已收录。

## 2026-09-10 v0.1.11 Changelog 与发布状态

- `website/src/changelog.json` 已新增 `v0.1.11`，只记录 `v0.1.10` 之后可证实的用户变化：macOS DMG 布局修正、官网安装包架构选择改进和正式 Changelog 上线；保留 macOS 尚未 Developer ID 签名/公证的已知问题。
- Changelog 提交 `f9da4a2b58b6c48ea43858b87199733fa5e883b9` 已推送至 `main`；annotated tag `v0.1.11` 指向同一提交并已推送。本地 Changelog gate、Website typecheck、release asset selection test、build 与生成产物检查均通过。
- Cloudflare Production 的 `/changelog` 已显示 `Blink v0.1.11`，sitemap `lastmod` 为 `2026-09-10`。Release run `34439630093` 则因 GitHub Actions 账户付款/spending limit 在 runner 启动前失败，后续 verify、双平台构建与 publish 全部 skipped。
- `Blink-Releases` 中 `v0.1.11` 仍为 HTTP 404，没有新 DMG、EXE、MSI 或 checksums。当前状态为 `TAG_AND_CHANGELOG_PUBLISHED / DESKTOP_RELEASE_BLOCKED`。修复 GitHub Actions billing/spending limit 后，应重跑原 release run 或对既有 `v0.1.11` tag 执行 workflow_dispatch；不要创建替代 tag，也不要移动已发布 tag。

## 2026-09-15 产品战略审查：官网承诺与使用路径复核

### 范围与结论

本轮以“确立 Blink 长期产品方向与差异化”为目标，使用 Product Design 审查流程重新观察当前官网，结合当前源码及公开 Release 核对承诺。战略规划集中在 [产品战略文档](blink-product-strategy.md)，本节只保存官网体验事实。

**官网清楚表达了一键动作，但需要按已发布版本维护能力状态，并补足从下载到第一次真实成功的说明。** 本轮没有修改网站产品代码或部署配置。

### 步骤 1：首屏理解产品｜中等

![本轮官网首屏](audits/product-strategy-2026-09-15/01-website-entry.png)

- 优点：标题、动作说明和 macOS 下载按钮集中，测试构建状态可见；主价值容易理解。
- UX 风险：“实体键盘”与页面后续 Macro Pad 图片可能让部分用户以为必须购买专用设备。后文已有普通键盘说明，建议首屏旁给一个普通键盘的可用例子，并保留“系统能识别且能注册”的前提。
- 可访问性风险：小号灰色状态文字在深色背景中不突出，需要独立测量对比度和放大阅读；本轮不作 WCAG 合规判定。

### 步骤 2：功能说明｜需要修正

![本轮功能说明](audits/product-strategy-2026-09-15/02-website-features.png)

- 优点：每项能力附一句结果说明，并区分状态。
- 确认的不一致：“快速切换 App”仍显示“即将支持”，而当前公开 v0.1.11 Release 已列“打开与快速切换应用”，源码也有平台模块。建议建立按版本与 OS 标注的能力清单，不直接把所有平台改为同一成功状态。
- 产品风险：页面同时讲开发者、电商运营、内容办公，却尚无本次获得的用户研究支持哪类是主市场。战略文档建议先以行为筛选一个首批人群。
- 可访问性边界：状态有文字、不只靠颜色；状态小字、图片替代文字是否充分，仍需完整辅助技术测试。

### 步骤 3：上手说明与下载｜部分可用

![本轮上手及下载](audits/product-strategy-2026-09-15/03-website-onboarding-download.png)

- 优点：连接键盘、选择动作、录制绑定三步简明；提供双平台入口和 macOS 测试包提醒。
- UX 风险：这三步描述配置过程，未覆盖安装、权限与跨应用实际验证。建议补一条首次成功路径，帮助用户识别卡在哪一步。
- 本轮浏览器 DOM：macOS 下载指向 v0.1.11，Windows 下载仍指向 v0.1.1。`website/src/App.tsx` 分别请求两平台下载；`downloads.ts` 保留 v0.1.1 Windows fallback，异常被静默忽略。这里只确认本次会话的旧链接与源码路径，没有证明每次访问都会发生。
- 本轮一次命令行 API 请求返回 v0.1.11 的 macOS/Windows 地址，后续两次请求得到 HTTP 502。需要单独复核官网 API 和失败反馈；未查 Cloudflare 当前 deployment/日志，不能据此指定基础设施根因。
- 可访问性边界：DOM 中按钮和链接有名称；未完整验证键盘顺序、焦点样式、屏幕阅读器和移动端。

### 步骤 4：桌面配置与真实触发｜本轮未验证

`/Applications/Blink.app` 原生界面读取超时 `timeoutReached`。本轮没有桌面有效截图，未创建或执行用户动作，不把官网的 Runtime 展示图片当成原生证明。此处保留为具名验证缺口，不据工具故障判定 Blink 自身卡死。

### 发布事实更新：旧阻塞记录已过时

保留上节历史时间线。2026-09-15 当前 [公开 v0.1.11 Release](https://github.com/codeinsightlab/Blink-Releases/releases/tag/v0.1.11) 已存在，发布时间为 `2026-09-10T05:28:04Z`；包含 arm64 DMG、x64 EXE/MSI 和 checksums。旧的 `DESKTOP_RELEASE_BLOCKED` 不再代表当前状态。

这只证明公开资产存在；Release 说明仍称 macOS 为 unsigned/non-notarized 测试构建。本轮未下载核验签名、安装、升级或执行效果。

### 建议顺序与回执

1. 对齐官网能力、Release 和平台支持说明。
2. 定位动态下载失败及旧版本 fallback 的用户反馈问题。
3. 补足从安装到第一次真实成功的路径，再用目标用户验证。

- 证据目录：`docs/audits/product-strategy-2026-09-15/`。三张分区截图均由本轮浏览器截图工具获取、保存后重新查看；早期不完整截图已被重新捕获覆盖。完整截图与 DOM 另存用于追溯。
- 结果边界：完成官网有限流程审查、当前源码事实审查和规划；原生闭环未验证。
- 未运行网站 build/typecheck，因为没有网站代码变化；文档变更完成 `git diff --check`。未发布内容、未推送、未创建 tag、未执行 Cloudflare 部署。

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

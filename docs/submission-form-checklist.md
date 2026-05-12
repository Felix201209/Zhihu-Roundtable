# 知辩圆桌提交表单清单

本文件用于最后提交平台时逐项核对。凡是标注“待外部确认”的项目，都不能靠本地验证替代。

## 1. 可直接填写

项目名称：

```text
知辩圆桌
```

一句话介绍：

```text
面向知乎创作者和圈子运营者的 AI 讨论组织台，把热榜话题转化成可发布、可回流、可继续创作的圈子讨论。
```

推荐赛道：

```text
引力场｜知乎 × 社交
```

备选关联：

```text
刘看山｜知乎 × IP
灵感引擎｜知乎 × 创作
```

项目详情：

```text
知辩圆桌是一个面向知乎创作者、圈主和官方号运营者的 AI 讨论组织台。它从知乎热榜中选择具有讨论价值的话题，先通过知乎站内搜索和全网搜索建立证据池，再把热榜改写成开放讨论问题，生成讨论目标、站队选项、引导评论、风险提醒和可发布到圈子的草稿。刘看山在其中不是陪聊 Bot，而是主持人和圈子控场员：发帖前帮创作者检查标题是否可讨论、是否容易引战、反方空间是否足够；发帖后帮助识别高质量评论、新反方、真实经验和补充资料，再生成下一轮话题和下一篇内容方向。它不是 AI 总结器，也不是 AI 帮用户写知乎回答，而是帮助创作者和圈主把一次热点组织成一场持续发生的社区讨论。
```

技术摘要：

```text
前端使用 React + Vite，主流程为选题雷达、讨论方案准备、刘看山主持校验、发布策划与圈子帖预览、评论复盘与下一轮创作。后端使用 Node/TypeScript HTTP 服务，封装 ZhihuProvider 和 LlmProvider；支持 mock/live/fallback，所有关键模型输出经过 JSON schema 校验，服务层默认拒绝 live 写操作，所有真实发布、评论和 reaction 都必须经过用户确认 token。部署时同一个 Node 进程托管 dist/ 和 /api，默认 mock-safe，避免现场真实接口限流影响演示。
```

## 2. 待外部确认后填写

可运行体验链接：

```text
https://zhihu-roundtable.felixypz.me
```

知乎登录回调地址：

```text
https://zhihu-roundtable.felixypz.me/api/oauth/callback
```

代码仓库链接：

```text
https://github.com/Felix201209/Zhihu-Roundtable
```

仓库访问状态：

```text
当前仓库为 public，可供评委访问。
```

补充材料链接：

```text
README.md / JUDGE_GUIDE.md / docs/judge-defense-matrix.md / docs/final-readiness-audit.md / docs/external-closure-runbook.md
```

## 3. 提交前必须通过

```bash
npm ci
npm run verify:submission
npm run evidence:submission
node scripts/print-submission-evidence.mjs --markdown
npm run verify:judge
npm run audit:high
npm run capture:demo:auto:mock
PUBLIC_DEMO_URL=https://zhihu-roundtable.felixypz.me PUBLIC_DEMO_EXPECT_PROVIDER=live npm run verify:public:full
npm run verify:remote-ci -- --wait
PUBLIC_DEMO_URL=https://zhihu-roundtable.felixypz.me PUBLIC_DEMO_EXPECT_PROVIDER=live npm run verify:final
```

`verify:submission` 会跑评审门禁、生成源码 ZIP，并在打包后自动运行 `evidence:submission`；它要求 git 工作区干净。
`evidence:submission` 只读打印当前 commit、源码包文件数/ZIP 实际文件数、sha256、截图尺寸、支撑材料和最终外部验收命令，方便复制到提交备注或路演备忘；`node scripts/print-submission-evidence.mjs --markdown` 会输出更适合直接粘贴的 Markdown 版。正式证据要求工作区干净，本地预览才追加 `--allow-dirty`。
`verify:judge` 还会在本机存在 Chrome/Chromium 时启动 headless browser，验证生产式页面可以手动走完 5 步主流程，且不会自动跳过讨论方案准备和主持校验。
`verify:public:full` 用于部署后公网验收，会检查首页 bundle、后端健康、模型状态、知乎状态、OAuth callback，并对公网 Demo 跑首页到评论复盘的浏览器点击流，默认要求线上 demo 是 mock-safe。
`verify:remote-ci -- --wait` 用于 push 后等待并确认 GitHub Actions `Verify` 已针对当前 HEAD 成功。
`verify:final` 用于 push、远端 CI、公网 Demo 和仓库授权都完成后的最终严格验收。

公网部署推荐：

```text
Render Blueprint: render.yaml
树莓派自托管: docs/raspberry-pi-deployment.md
Build Command: npm ci && npm run build
Start Command: npm run start
Health Check Path: /api/health
Node: 24
```

如果平台临时要求源码压缩包：

```bash
npm run package:source
```

输出位置：

```text
.cache/submission/zhihu-roundtable-source.zip
.cache/submission/manifest.json
```

这个 ZIP 由 `git archive HEAD` 生成，不包含 `.env.local`、`.cache/`、`dist/` 或 `node_modules/`。`manifest.json` 记录 HEAD commit、跟踪文件数、ZIP 实际文件数、ZIP 大小和 sha256，便于提交前核对。
正式打包要求 git 工作区干净，避免 ZIP 漏掉未提交改动；本地调试才使用 `node scripts/package-source.mjs --allow-dirty`。

## 4. 不要填写或提交

- 不要提交 `.env.local`、`.cache/`、`dist/`、`node_modules/`。
- 不要把真实 `DEEPSEEK_API_KEY`、`ZHIHU_APP_SECRET`、`ZHIHU_APP_KEY` 填进 README、提交材料、Render Blueprint 或树莓派 systemd 配置。
- 不要声明已经真实发布到知乎，除非用户明确确认并完成真实写操作。
- 不要把 mock-safe 演示说成真实评论数据；可以说“真实接口接入边界已准备，现场默认 mock-safe”。

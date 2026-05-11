# 知辩圆桌｜创作者的 AI 讨论组织台

知辩圆桌是一个面向知乎创作者、圈主和官方号运营者的 AI 讨论组织台。

它从知乎热榜或圈子话题中选择具有讨论价值的议题，先通过站内搜索和全网搜索建立证据池，再把热点改写成开放问题，生成讨论目标、站队选项、引导评论、风险提醒和圈子帖草稿。发布后，系统会拉取真实评论，识别高质量观点、新反方、真实经验和补充资料，继续生成下一轮讨论与下一篇内容方向。

它不是 AI 总结器，也不是 AI 帮用户写回答；它的目标是让创作者从“凭感觉发帖”变成“有结构地组织讨论”。

## Demo 闭环

```text
知乎热榜
-> AI 讨论潜力评分
-> 知乎站内/全网证据池
-> 讨论方案：开放问题、站队选项、引导评论、风险提醒
-> 刘看山主持校验：证据、反方、普通用户可理解性
-> 用户确认发布到圈子
-> 评论回流复盘
-> 下一轮讨论 / 下一篇创作方向
```

## 技术亮点

- 固定状态机 + 讨论组织台：比自由群聊稳定，适合黑客松路演。
- Kimi K2.6 + DeepSeek V4 可配置国内模型路由：证据/发言走 Kimi，批量分类走 DeepSeek V4 Flash，重构/总结/发布润色走 DeepSeek V4 Pro。
- 所有模型输出 JSON 化，并用 zod schema 校验。
- 官方 API wrapper：热榜、知乎搜索、全网搜索、圈子、发布、评论、reaction。
- Mock-safe + live-ready：现场只读 API 或模型失败可 fallback，不影响完整 Demo；真实写操作失败不会伪装成功。
- SSE 路演流：前端可逐节点播放“选题、证据、讨论方案、发布、回流”。
- Readiness 自检：按官方评分维度生成夺奖面板。
- 前端无需改代码即可切模型策略：URL 参数或 `VITE_DEMO_*` 环境变量可切 `mock/auto/live`。
- 想法试验场作为副入口复用同一套社区反馈引擎：脑洞生成 3 个版本，发布到圈子收集反馈，再输出决策报告。

## 快速运行

```bash
npm ci
npm run verify
npm run demo:serve:mock
```

或者手动分两个终端启动：

```bash
npm run backend:serve
npm run dev
```

打开 Vite 输出的本地地址，默认前端会通过代理访问 `http://localhost:8787/api`。如需改端口，设置 `BACKEND_URL` / `DEMO_URL`，或使用更短的 `DEMO_BACKEND_PORT` / `DEMO_FRONTEND_PORT`；脚本会同步配置 Vite API proxy。

## 核心命令

- `npm run dev`：启动前端 Demo。
- `npm run serve:app`：生产式本机预览，先构建前端，再用同一个 Node 进程托管 `dist/` 和 `/api`。
- `npm run start`：部署平台启动命令；需要先执行 `npm run build`，然后托管 `dist/` 和后端 API。
- `npm run demo:serve`：一键启动后端和前端，适合路演前本机验证。
- `npm run demo:serve:mock`：强制 mock-safe 启动，忽略本机 `.env.local` 里的知乎 live 地址，适合现场路演。
- `npm run build`：生产构建前端。
- `npm run backend:serve`：启动后端 API，默认 `http://localhost:8787`。
- `npm run capture:demo`：在前后端服务启动后，抓取桌面/移动 Demo 截图到 `artifacts/`。
- `npm run capture:demo:auto`：自动启动前后端并抓取桌面/移动 Demo 截图。
- `npm run capture:demo:auto:mock`：强制 mock-safe 自动截图，适合提交前刷新截图。
- 自定义端口示例：`BACKEND_URL=http://localhost:8877/api/health DEMO_URL=http://localhost:5177/ npm run capture:demo:auto`。
- 端口别名示例：`DEMO_BACKEND_PORT=8877 DEMO_FRONTEND_PORT=5177 npm run capture:demo:auto`。
- `npm run demo`：运行离线 demo-runner 摘要。
- `npm run backend:demo`：运行完整后端闭环。
- `npm test`：demo-runner、schema、provider、service、HTTP API 测试。
- `npm run typecheck`：TypeScript 类型检查。
- `npm run verify`：提交前总验证，串行执行类型检查、测试、生产构建和后端完整 Demo。
- `npm run verify:production`：构建后启动 `npm run start`，真实请求生产式首页和 `/api/health`；本机有 Chrome/Chromium 时还会走完整 5 步浏览器点击流。
- `PUBLIC_DEMO_URL=https://你的线上域名 npm run verify:public`：部署后验证公网首页、`/api/health`、知乎状态和 OAuth callback，默认要求 mock-safe。
- `PUBLIC_DEMO_URL=https://你的线上域名 npm run verify:public:full`：部署后同时验证公网 API smoke 和首页到评论复盘的浏览器点击流。
- `npm run verify:remote-ci`：push 后检查 GitHub Actions `Verify` 是否针对当前 HEAD 成功；远端会运行 `npm run verify:submission`。push 前可用 `node scripts/verify-remote-ci.mjs --allow-not-pushed` 预检远端状态。
- `PUBLIC_DEMO_URL=https://你的线上域名 REVIEWER_REPO_ACCESS_CONFIRMED=1 npm run verify:final`：push、部署和仓库授权都完成后的最终严格验收。
- `npm run completion:audit`：把 `/goal` 拆成产品定位、主流程、安全边界、验证门禁、部署准备和外部交付项逐项检查；本地项失败会退出，公网 Demo、远端 CI、仓库访问这类外部项会列为 blocker。若仓库保持 private，但已给评委/主办方授权，可设置 `REVIEWER_REPO_ACCESS_CONFIRMED=1` 作为审计证据。
- `npm run package:source`：从干净 HEAD 生成 `.cache/submission/zhihu-roundtable-source.zip` 和 `.cache/submission/manifest.json`，并打印 commit、大小和 sha256。
- `npm run verify:judge`：本地评审基础门禁，避免依赖外部 live API 或 npm audit 网络；CI 会跑更完整的 `verify:submission`。
- `npm run audit:high`：可选依赖安全公告检查，需要 npm registry 网络稳定。

## 真实 API / 模型环境变量

默认不需要任何 key，使用 mock-safe 演示。

可从 `.env.example` 复制本地配置；不要提交真实 `.env`。`.env.local`、`.env`、`.env.*` 都已被 `.gitignore` 忽略，后端和一键脚本会自动读取 `.env.local`。

推荐本机写法：

```bash
cp .env.example .env.local
```

然后只在 `.env.local` 里填真实 key：

```bash
VITE_DEMO_MODEL_MODE=auto
VITE_DEMO_DEFAULT_PROVIDER=deepseek-v4-flash
VITE_DEMO_FALLBACK_TO_MOCK=true
DEEPSEEK_API_KEY=sk-...
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
DEEPSEEK_FLASH_MODEL=deepseek-v4-flash
```

真实模型：

- `KIMI_API_KEY` 或 `MOONSHOT_API_KEY`
- `KIMI_BASE_URL` 或 `MOONSHOT_BASE_URL`
- `KIMI_MODEL` 或 `MOONSHOT_MODEL`（可选，用于覆盖默认 `kimi-k2.6`）
- `DEEPSEEK_API_KEY`
- `DEEPSEEK_BASE_URL`
- `DEEPSEEK_FLASH_MODEL` / `DEEPSEEK_PRO_MODEL` / `DEEPSEEK_MODEL`（可选，用于覆盖默认 DeepSeek V4 模型名）

前端路演模型切换：

- 默认 mock-safe：不设置即可。
- 路演强制安全模式：`npm run demo:serve:mock`，即使本机 `.env.local` 里有 `ZHIHU_API_BASE_URL` 也不会进入 live provider。
- URL 临时切换：`/?modelMode=auto&defaultProvider=kimi&fallbackToMock=true`
- Vite 环境变量：`VITE_DEMO_MODEL_MODE`、`VITE_DEMO_DEFAULT_PROVIDER`、`VITE_DEMO_KIMI_MODEL`、`VITE_DEMO_DEEPSEEK_FLASH_MODEL`、`VITE_DEMO_DEEPSEEK_PRO_MODEL`、`VITE_DEMO_FALLBACK_TO_MOCK`

知乎 live provider：

- `ZHIHU_PROVIDER=live`
- `ZHIHU_API_BASE_URL=https://openapi.zhihu.com`，真实 fetch 只允许知乎 HTTPS 域名
- `ZHIHU_APP_KEY`，官方文档里的 `app_key`，即知乎用户 token
- `ZHIHU_APP_SECRET`，官方文档里的 `app_secret`
- `ZHIHU_ACCESS_TOKEN`，`app_key` 的兼容别名
- `ZHIHU_RING_ID`，默认圈子；不填时使用 `2029619126742656657`（黑客松脑洞补给站）
- `ZHIHU_HOT_LIST_HOURS`，热榜最近 N 小时时间窗

OpenAPI 请求会按官方文档自动生成 `X-App-Key`、`X-Timestamp`、`X-Log-Id`、`X-Sign`、`X-Extra-Info`，签名字符串为 `app_key:{app_key}|ts:{timestamp}|logid:{log_id}|extra_info:{extra_info}`。

为保护每日调用额度，live 只读接口默认启用本地文件缓存：

- `ZHIHU_CACHE_FILE=.cache/zhihu-openapi-cache.json`
- `ZHIHU_CACHE_HOT_TTL_MS=1800000`，热榜默认缓存 30 分钟
- `ZHIHU_CACHE_SEARCH_TTL_MS=43200000`，知乎/全网搜索默认缓存 12 小时
- `ZHIHU_CACHE_RING_TTL_MS=86400000`，圈子详情默认缓存 24 小时
- `ZHIHU_CACHE_COMMENT_TTL_MS=60000`，评论默认缓存 1 分钟
- `ZHIHU_CACHE_ERROR_TTL_MS=900000`，404/失败默认负缓存 15 分钟，避免错误路径反复烧额度

写接口不走缓存，也不会在 live 失败时伪装成 mock 成功。

知乎 OAuth 登录回调：

- 提交广场时填写：`https://你的线上-demo域名/api/oauth/callback`
- `GET /api/oauth/status` 可检查 callback、App_ID/App_KEY、授权 URL 是否配置。
- `GET /api/oauth/start` 在配置 `ZHIHU_OAUTH_AUTHORIZE_URL` 后会跳转知乎授权页；未配置时返回一页 mock-safe 说明，不影响评委体验。
- 可选变量：`PUBLIC_APP_URL`、`ZHIHU_OAUTH_REDIRECT_URI`、`ZHIHU_OAUTH_CLIENT_ID`、`ZHIHU_OAUTH_AUTHORIZE_URL`、`ZHIHU_OAUTH_TOKEN_URL`、`ZHIHU_OAUTH_SCOPE`、`ZHIHU_OAUTH_CLIENT_SECRET`。

知乎直答 Agent 可作为 `custom` OpenAI-compatible 模型接入：

- `CUSTOM_LLM_BASE_URL=https://api.zhihu.com/v1`
- `CUSTOM_LLM_API_KEY` 或 `ZHIHU_DIRECT_AGENT_API_KEY`
- `CUSTOM_LLM_MODEL` 或 `ZHIHU_DIRECT_AGENT_MODEL`

live 写操作不会绕过用户确认：发布、主持评论、reaction 都需要后端一次性 confirmation token；真实写失败不会被伪装成 mock 成功。

## Reviewer 入口

- 评审快速指南：[JUDGE_GUIDE.md](JUDGE_GUIDE.md)
- 部署指南：[docs/deployment.md](docs/deployment.md)
- 提交表单清单：[docs/submission-form-checklist.md](docs/submission-form-checklist.md)
- 后端契约：[docs/backend-contract.md](docs/backend-contract.md)
- 路演计划：[docs/hackathon-demo-plan.md](docs/hackathon-demo-plan.md)
- 夺冠红队审计：[docs/championship-redteam.md](docs/championship-redteam.md)
- 最终 readiness 审计：[docs/final-readiness-audit.md](docs/final-readiness-audit.md)
- 最初方案完成度对照：[docs/original-plan-coverage.md](docs/original-plan-coverage.md)
- 来源边界记录：[docs/hackathon-source-notes.md](docs/hackathon-source-notes.md)

## 验证状态

当前核心门禁：

- `npm run verify`
- `npm run verify:judge`
- `npm run audit:high`
- `npm run typecheck`
- `npm test`
- `npm run build`
- `npm run verify:production`

这些命令均应通过；provider fallback 测试会故意打印一次知乎 API 502 警告，用来证明 live 只读接口失败时会切换 mock。

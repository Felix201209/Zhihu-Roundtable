# 知辩圆桌｜创作者的 AI 讨论组织台

知辩圆桌是一个面向知乎创作者、圈主和官方号运营者的 AI 讨论组织台。

它从知乎热榜或圈子话题中选择具有讨论价值的议题，先通过站内搜索和全网搜索建立证据池，再把热点改写成开放问题，生成讨论目标、站队选项、引导评论、风险提醒和圈子帖草稿。发布后，系统会拉取真实评论，识别高质量观点、新反方、真实经验和补充资料，继续生成下一轮讨论与下一篇内容方向。

它不是 AI 总结器，也不是 AI 帮用户写回答；它的目标是让创作者从“凭感觉发帖”变成“有结构地组织讨论”。

## 绝对亮点

知辩圆桌的亮点不是“又一个 AI 写作工具”，而是把知乎热榜变成一条可持续的社区讨论生产线：

1. **热榜不直接发**：先判断争议度、资料量、站内讨论空间和下一轮内容潜力。
2. **刘看山发布前质检**：每个议题都要过三问：有人站队吗、反方说得通吗、证据够支撑吗。
3. **发帖后还能回流**：评论区的新反方、真实经验和高质量补充会进入下一轮话题，而不是停在一次生成。

这让作品从“生成内容”变成“组织社区讨论”：AI 不替用户表达观点，而是帮创作者把一次热点运营成一场有证据、有分歧、有后续的知乎讨论。

## Demo 闭环

```text
知乎热榜
-> AI 讨论潜力评分
-> 知乎站内/全网证据池
-> 讨论方案：开放问题、站队选项、引导评论、风险提醒
-> 刘看山主持校验：证据、反方、知乎讨论追问价值
-> 用户确认发布到圈子
-> 评论回流复盘
-> 下一轮讨论 / 下一篇创作方向
```

## 技术亮点

- 固定状态机 + 讨论组织台：比自由群聊稳定，适合黑客松路演。
- DeepSeek V4 默认真实模型路由：Flash 负责热榜评分、证据池、角色 brief 和讨论席，Pro 负责问题重构、观点综合和发布稿；Kimi / custom provider 仍可按需切换。
- 所有模型输出 JSON 化，并用 zod schema 校验。
- 官方 API wrapper：热榜、知乎搜索、全网搜索、圈子、发布、评论、reaction。
- Mock-safe + live-ready：现场只读 API 或模型失败可 fallback，不影响完整 Demo；真实写操作不会伪装成 live 成功，发布被限流时会明确标注并转入 mock-safe 复盘。
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
- `npm run verify:raspberry-pi`：检查树莓派 env、systemd 和 Cloudflare Tunnel 模板保持 mock-safe，且端口一致。
- `PUBLIC_DEMO_URL=https://你的线上域名 npm run verify:public`：部署到 Render、树莓派或其他公网 Node 服务后，验证公网首页、`/api/health`、知乎状态和 OAuth callback，默认要求 mock-safe。
- `PUBLIC_DEMO_URL=https://你的线上域名 npm run verify:public:full`：部署后同时验证公网 API smoke 和首页到评论复盘的浏览器点击流。
- `npm run verify:remote-ci`：push 后检查 GitHub Actions `Verify` 是否针对当前 HEAD 成功；远端会运行 `npm run verify:submission`。push 前可用 `node scripts/verify-remote-ci.mjs --allow-not-pushed` 预检远端状态；push 刚完成时可用 `npm run verify:remote-ci -- --wait` 等待 CI 创建并完成。
- `npm run verify:external-preflight`：push 前只读预检 clean 状态、`git push --dry-run`、远端 CI 当前 HEAD 状态和 GitHub 仓库元数据；不会执行真实 push。GitHub API 查询默认重试 3 次，仍失败才显示 warning，不会覆盖本地 ready 结论；需要机器读取可用 `node scripts/verify-external-preflight.mjs --json`，需要把 GitHub 元数据或远端 CI 查询失败视为失败时追加 `--strict-gh` 或 `--strict-remote-ci`。
- `PUBLIC_DEMO_URL=https://你的线上域名 REVIEWER_REPO_ACCESS_CONFIRMED=1 npm run verify:final`：push、部署和仓库授权都完成后的最终严格验收。
- `npm run completion:audit`：把 `/goal` 拆成产品定位、主流程、安全边界、验证门禁、部署准备和外部交付项逐项检查；本地项失败会退出，公网 Demo、远端 CI、仓库访问这类外部项会列为 blocker。若仓库保持 private，但已给评委/主办方授权，可设置 `REVIEWER_REPO_ACCESS_CONFIRMED=1` 作为审计证据。
- `PUBLIC_DEMO_URL=https://你的线上域名 PUBLIC_DEMO_EXPECT_PROVIDER=live npm run verify:goal-readiness`：`/goal` 最终完成前的总闸门；会在 2026-05-13 07:30 +08:00 前拒绝通过，时间到后串起本地 verify、公网 final、源码包和证据输出。
- `npm run package:source`：从干净 HEAD 生成 `.cache/submission/zhihu-roundtable-source.zip` 和 `.cache/submission/manifest.json`，并打印 commit、大小和 sha256；`verify:submission` 会在打包后自动运行 `evidence:submission`。
- `npm run evidence:submission`：只读打印当前 commit、源码包文件数/ZIP 实际文件数、sha256、截图尺寸、支撑材料和最终外部验收命令，要求工作区干净；提交表或路演备忘可用 `node scripts/print-submission-evidence.mjs --markdown` 输出 Markdown，本地预览可追加 `--allow-dirty`。
- `npm run verify:judge`：本地评审基础门禁，避免依赖外部 live API 或 npm audit 网络；CI 会跑更完整的 `verify:submission`。
- `npm run audit:high`：可选依赖安全公告检查，需要 npm registry 网络稳定。

## 真实 API / 模型环境变量

默认不需要任何 key；不填 key 时会 mock-safe 演示。填入 DeepSeek / 知乎 key 后，默认优先走真实 DeepSeek 和知乎 live provider，并保留 mock 兜底。

可从 `.env.example` 复制本地配置；不要提交真实 `.env`。`.env.local`、`.env`、`.env.*` 都已被 `.gitignore` 忽略，后端和一键脚本会自动读取 `.env.local`。

推荐本机写法：

```bash
cp .env.example .env.local
```

然后只在 `.env.local` 里填真实 key：

```bash
VITE_DEMO_MODEL_MODE=auto
VITE_DEMO_DEFAULT_PROVIDER=deepseek-v4-pro
VITE_DEMO_FALLBACK_TO_MOCK=true
DEEPSEEK_API_KEY=sk-...
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
DEEPSEEK_FLASH_MODEL=deepseek-v4-flash
DEEPSEEK_PRO_MODEL=deepseek-v4-pro
LLM_TIMEOUT_MS=30000
LLM_MAX_RETRIES=1
```

真实模型：

- `KIMI_API_KEY` 或 `MOONSHOT_API_KEY`
- `KIMI_BASE_URL` 或 `MOONSHOT_BASE_URL`
- `KIMI_MODEL` 或 `MOONSHOT_MODEL`（可选，用于覆盖默认 `kimi-k2.6`）
- `DEEPSEEK_API_KEY`
- `DEEPSEEK_BASE_URL`
- `DEEPSEEK_FLASH_MODEL` / `DEEPSEEK_PRO_MODEL` / `DEEPSEEK_MODEL`（可选，用于覆盖默认 DeepSeek V4 模型名）
- `LLM_TIMEOUT_MS` / `LLM_MAX_RETRIES`（可选，公网路演可调低超时并保留 fallback，避免真实模型慢请求把用户卡在等待态）
- `LLM_CACHE_FILE=.cache/llm-json-cache.json`
- `LLM_CACHE_TTL_MS=86400000`，DeepSeek JSON 结果默认缓存 24 小时
- `LLM_CACHE_ERROR_TTL_MS=300000`，模型失败默认负缓存 5 分钟，避免错误配置反复烧额度

前端路演模型切换：

- 默认 DeepSeek 优先：有 key 就走真实 DeepSeek；无 key 或失败时按 `fallbackToMock` 兜底。
- 路演强制安全模式：`npm run demo:serve:mock`，即使本机 `.env.local` 里有 `ZHIHU_API_BASE_URL` 也不会进入 live provider。
- URL 临时切换：`/?modelMode=auto&defaultProvider=deepseek-v4-pro&fallbackToMock=true`
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

如果知乎给你的 app 下发了不同路径，可以用 `ZHIHU_ENDPOINT_HOT_LIST`、`ZHIHU_ENDPOINT_ZHIHU_SEARCH`、`ZHIHU_ENDPOINT_GLOBAL_SEARCH`、`ZHIHU_ENDPOINT_RING_DETAIL` 覆盖默认 endpoint。当前实现会先试内容热榜/搜索；若内容接口不可用，会继续用真实 `ring/detail` 读接口生成候选话题和证据，不会立刻掉成纯 mock。

为保护每日调用额度，live 只读接口默认启用本地文件缓存：

- `ZHIHU_CACHE_FILE=.cache/zhihu-openapi-cache.json`
- `ZHIHU_CACHE_HOT_TTL_MS=1800000`，热榜默认缓存 30 分钟
- `ZHIHU_CACHE_SEARCH_TTL_MS=43200000`，知乎/全网搜索默认缓存 12 小时
- `ZHIHU_CACHE_RING_TTL_MS=86400000`，圈子详情默认缓存 24 小时
- `ZHIHU_CACHE_COMMENT_TTL_MS=60000`，评论默认缓存 1 分钟
- `ZHIHU_CACHE_ERROR_TTL_MS=900000`，404/失败默认负缓存 15 分钟，避免错误路径反复烧额度

写接口不走缓存；发布被知乎限流或拒绝时不会伪装成 live 成功，系统会明确记录失败并转入 mock-safe 评论复盘。评论和 reaction 失败则保持失败，不自动伪造成功。

知乎 OAuth 登录回调：

- 提交广场时填写：`https://你的线上-demo域名/api/oauth/callback`
- `GET /api/oauth/status` 可检查 callback、App_ID/App_KEY、授权 URL 是否配置。
- `GET /api/oauth/start` 在配置 `ZHIHU_OAUTH_AUTHORIZE_URL` 后会跳转知乎授权页；未配置时返回一页 mock-safe 说明，不影响评委体验。
- 可选变量：`PUBLIC_APP_URL`、`ZHIHU_OAUTH_REDIRECT_URI`、`ZHIHU_OAUTH_CLIENT_ID`、`ZHIHU_OAUTH_AUTHORIZE_URL`、`ZHIHU_OAUTH_TOKEN_URL`、`ZHIHU_OAUTH_SCOPE`、`ZHIHU_OAUTH_CLIENT_SECRET`。

知乎直答 Agent 可作为 `custom` OpenAI-compatible 模型接入：

- `CUSTOM_LLM_BASE_URL=https://api.zhihu.com/v1`
- `CUSTOM_LLM_API_KEY` 或 `ZHIHU_DIRECT_AGENT_API_KEY`
- `CUSTOM_LLM_MODEL` 或 `ZHIHU_DIRECT_AGENT_MODEL`

live 写操作不会绕过用户确认：发布、主持评论、reaction 都需要后端一次性 confirmation token；发布失败会明确标注并转入 mock-safe 复盘，评论和 reaction 失败不会被伪装成功。

## Reviewer 入口

- 评审快速指南：[JUDGE_GUIDE.md](JUDGE_GUIDE.md)
- 路演当天速查卡：[docs/demo-day-quick-card.md](docs/demo-day-quick-card.md)
- 评委追问防守矩阵：[docs/judge-defense-matrix.md](docs/judge-defense-matrix.md)
- 部署指南：[docs/deployment.md](docs/deployment.md)
- 树莓派部署指南：[docs/raspberry-pi-deployment.md](docs/raspberry-pi-deployment.md)
- 树莓派现场检查清单：[docs/raspberry-pi-ops-checklist.md](docs/raspberry-pi-ops-checklist.md)
- 外部交付闭环 Runbook：[docs/external-closure-runbook.md](docs/external-closure-runbook.md)
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

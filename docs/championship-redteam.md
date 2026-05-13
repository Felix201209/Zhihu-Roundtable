# 知辩圆桌夺冠级红队审计

本文件记录当前实现按“能不能冲综合大奖”做的风险审计。结论不是承诺比赛结果，而是把可控风险压到没有已知可复现 blocker。

## 1. 当前判断

当前实现已经具备夺冠候选作品需要的四个硬条件：

1. **场景强绑定知乎**：入口是热榜，证据来自知乎站内/全网，出口回到圈子，评论再回流。
2. **AI 不是薄包装**：热榜评分、问题重构、证据池、Agent briefing、圆桌发言、观点地图、发布稿、评论回流都经过统一 LLM provider。
3. **路演稳定**：默认 mock-safe；Kimi/DeepSeek/Zhihu live 只读链路失败都可显式 fallback，不会中断 demo；真实写操作失败不伪装成功。
4. **第一屏可懂**：默认视觉已收敛为创作者讨论组织台，热榜入口、发布边界和评论回流价值前置，技术细节后置。

## 2. 已修复高风险项

| 风险 | 原因 | 修复 |
| --- | --- | --- |
| 模型路线不符合国内优先策略 | 旧文档和配置残留 GPT 分工 | 默认改为 Kimi K2.6 + DeepSeek V4 Flash/Pro，并支持环境变量覆盖模型名 |
| live 发布成功后被圈子详情失败误伤 | `publishDraft` 成功后如果再取 ring 失败，会误 fallback mock | 发布结果只依赖 `POST /openapi/publish/pin`，圈子信息从响应或输入兜底 |
| SSE 单条坏包让前端卡住 | `JSON.parse` 未捕获 | 前端 stream 解析失败会进入明确错误态并关闭流 |
| 第一屏像复杂后台 | 旧版右侧同时展示 8 个 panel，评委学习成本高 | 首屏收敛为“创作者 / 圈主 / 官方号的讨论组织台”，主 CTA 直达热榜讨论方案，技术细节后置 |
| 文档和 UI 操作不一致 | 旧文档仍写 `确认发布闭环` | 统一为 `从热榜生成讨论方案`、`发布策划与圈子帖预览` 和 `评论复盘与下一轮创作` |
| 提交 README 使用本机绝对链接 | GitHub/reviewer 打开不可用 | 改为相对文档链接 |
| 社区互动缺少二次确认 | reaction / 主持评论如果 live 调用会代表用户互动 | `有启发` 和 `主持评论` 都新增社区互动确认弹层；HTTP 缺 token 返回 `confirmation_required` |
| 人工确认只停在前端 | 如果 live 后端允许直接 POST 发布，会被质疑“AI 自动替用户发帖” | live 写操作新增一次性 confirmation token；服务层默认拒绝 live 写，HTTP 消费 token 后才传 `allowLiveWrite: true`；`run/stream publish=true` 在 live 模式拒绝绕过确认 |
| live 写失败被 mock 成功掩盖 | 评委可能以为真实发帖成功，实际只是 fallback | 发布失败会明确标注并进入 mock-safe 复盘，评论和 reaction 失败不伪装成功；读接口仍可 fallback 保障路演 |
| live API base URL 误配泄露凭证 | `ZHIHU_API_BASE_URL` 如果指向非知乎域，会把官方 HMAC 头发错地方 | 真实 fetch 强制知乎 HTTPS 域名；测试注入 `fetchImpl` 才允许假域 |
| 原始 plan 完成度靠口头说明 | 评委可能追问 60 节点和 30 节方案是否真的完成 | 新增 `docs/original-plan-coverage.md` 逐项映射完成度 |
| 热榜卡片只像可选但不驱动后端 | 评委点击第二个话题如果内容不变，会破坏“从知乎热榜开始”的可信度 | 前端切换、重播、SSE、发布全部传递 `topicId`，并新增烟测防回归 |
| 发布确认测试是假阳性 | 旧烟测一开始就给前端 `publishResult`，可能掩盖“未发布前不能互动、确认后才回流”的社区边界 | 烟测改为未发布初态，点击确认后断言调用 `confirm-publish` 且携带当前 snapshot，不再重跑整条 workflow |
| 未确认发布也提前评论回流 | `publish=false` 如果已经出现 `comment_feedback`，会削弱“用户确认后回流”的闭环叙事 | `runFullWorkflow({ publish:false })` 只到发布预览；确认发布后才进入 `comment_feedback`，并新增回归测试 |
| 本机演示启动步骤太分散 | 路演前手动开两个终端容易漏开后端或截图失败 | 新增 `npm run demo:serve` 和 `npm run capture:demo:auto`，队友拉仓库后可一键启动/截图 |
| 前端硬编码 mock 模型策略 | 后端 live-ready 但 UI 不能不改代码切 Kimi/DeepSeek，会显得“只是假演示” | URL 参数和 `VITE_DEMO_*` 环境变量可切 `mock/auto/live`，并覆盖 run + SSE 两条链路 |
| 私密仓库缺少自动门禁 | 备份存在但 reviewer/队友无法看到每次推送是否仍可运行 | 新增 GitHub Actions `Verify`，推送、PR 和手动触发都运行 `npm run verify:submission`；CI 先打印 Chrome/Chromium 版本，再设置 `PRODUCTION_FLOW_REQUIRE_BROWSER=true`，浏览器流缺失会失败，并生成源码包兜底 |
| 评委入口分散 | README、路演文档、后端契约都有信息，但现场可能来不及串起来 | 新增根目录 `JUDGE_GUIDE.md`，3 分钟验证路径和评分项映射放在一页 |
| judge 门禁依赖 npm audit 网络 | npm registry/TLS 抖动会让可运行项目被外部网络误判失败 | `verify:judge` 改为离线可复现门禁，`audit:high` 保留为独立可选检查 |
| 自定义端口验证是假阳性 | `BACKEND_URL` 可改端口，但 Vite `/api` proxy 曾硬指向 `8787`，截图可能误用旧后端 | Vite proxy 现在从 `BACKEND_URL` / `VITE_BACKEND_PROXY_TARGET` 派生，前端 `/api/health` 会校验真实后端端口，并新增配置测试 |
| 路演脚本环境变量不够防呆 | 队友可能用 `DEMO_BACKEND_PORT` / `DEMO_FRONTEND_PORT` 这类直觉变量，导致截图命令误走默认端口 | `demo:serve` 和 `capture:demo:auto` 同时支持完整 URL 与端口别名，README 和提交审计文档补充示例 |
| 评分/原始方案来源靠口头记忆 | 评委或队友追问“这个权重/30 节 plan 从哪里来”时，容易现场解释打结 | 新增 `docs/hackathon-source-notes.md` 说明赛事截图、原始 30 节方案、readiness 边界和 API 接入边界 |
| 本机 `.env.local` 配了 live 地址导致路演误入 live provider | 普通启动会读取本机真实配置，可能消耗额度或出现接口 404 噪音 | 新增 `demo:serve:mock` / `capture:demo:auto:mock`，显式 `ZHIHU_PROVIDER=mock` 并使用 8877/5177 独立端口；provider 测试锁死 mock 优先级 |
| 评论回流页像“没人支持” | mock 评论初版全被归为质疑/中立，支持率显示 0% 容易被误解为讨论失败 | mock 评论输入增加明确支持样本，HTTP 端到端测试要求回流页必须有高质量评论和新反方 |

## 3. 仍需主动说明的非代码风险

| 风险 | 现场话术 |
| --- | --- |
| 真实知乎 OAuth 最终字段可能随官方文档调整 | 当前已提供 `/api/oauth/start`、`/api/oauth/callback`、`/api/oauth/status`；社区 OpenAPI 走 `ZHIHU_APP_KEY` + `ZHIHU_APP_SECRET` 官方 HMAC，发布仍必须人工确认 |
| 正式刘看山素材未授权 | Demo 使用原创占位主持形象；如官方提供素材可直接替换视觉层 |
| mock-safe 被误解成假功能 | 现场强调 mock 是防限流/断网兜底；需要时可用 `/?modelMode=auto&defaultProvider=kimi&fallbackToMock=true` 临时切 live/auto 策略 |
| 评委只看 6 分钟，可能看不到后端厚度 | 路演时在最后 20 秒展示 `npm run verify`、`backend-contract.md`、`modelUsages/nodeResults` |
| 线上体验链接尚未填入提交包 | 当前生产部署需要同时托管 Vite 静态页和 Node API，不能只上传 `dist/` | 已补 `npm run start` 单进程静态/API 服务、`render.yaml`、`docs/deployment.md`、`docs/raspberry-pi-deployment.md` 和 `verify:production`；公开部署前必须确认不带 `.env.local` 和真实写权限 |

## 4. 夺冠演示顺序

1. 打开页面：让评委先看到“创作者 / 圈主 / 官方号的讨论组织台”和主按钮 `从热榜生成讨论方案`。
2. 点 `从热榜生成讨论方案`：主流程直接展示 SSE 节点流，不是静态页面。
3. 进入 `讨论方案准备`：强调开放问题、证据池、讨论目标和参与人群。
4. 进入 `刘看山主持校验`：说明它不是陪聊 Bot，而是检查证据、反方和知乎讨论追问空间。
5. 点 `生成发布策划`：展示讨论目标、站队选项、引导评论、风险提醒和圈子帖草稿。
6. 点 `确认发布到圈子`：展示评论回流，强调闭环杀手锏。
7. 展开 `技术细节 / 评委验证`：展示模型分工、节点、readiness。

## 5. 最终验证命令

```bash
npm run verify
npm run verify:judge
npm run verify:production
npm run demo:serve:mock
npm run capture:demo:auto:mock
```

`npm run verify` 必须通过 typecheck、全部测试、build 和 backend demo。`npm run verify:judge` 额外检查演示脚本语法、生产式服务烟测和生产式浏览器点击流，且不依赖外部 live API。`npm run verify:submission` 在 `verify:judge` 后继续生成源码 ZIP，并运行 `evidence:submission` 打印提交证据；GitHub Actions 推送、PR 和手动触发都会跑这条提交包门禁，并强制要求浏览器流跑通。`npm run verify:production` 会实际启动 `npm run start`、请求 `/` 与 `/api/health`，并在本机存在 Chrome/Chromium 时验证首页到评论复盘的 5 步点击流。`npm run audit:high` 可在网络稳定时单独检查依赖安全公告。`npm run demo:serve:mock` 使用 8877/5177 独立端口，适合现场演示；`npm run capture:demo:auto:mock` 必须能自动启动前后端并生成桌面和移动截图。

# 知辩圆桌夺冠级红队审计

本文件记录当前实现按“能不能冲综合大奖”做的风险审计。结论不是承诺比赛结果，而是把可控风险压到没有已知可复现 blocker。

## 1. 当前判断

当前实现已经具备夺冠候选作品需要的四个硬条件：

1. **场景强绑定知乎**：入口是热榜，证据来自知乎站内/全网，出口回到圈子，评论再回流。
2. **AI 不是薄包装**：热榜评分、问题重构、证据池、Agent briefing、圆桌发言、观点地图、发布稿、评论回流都经过统一 LLM provider。
3. **路演稳定**：默认 mock-safe；Kimi/DeepSeek/Zhihu live 失败都可显式 fallback，不会中断 demo。
4. **第一屏可懂**：默认视觉已收敛为热榜、圆桌、讨论沉淀三栏，技术细节后置。

## 2. 已修复高风险项

| 风险 | 原因 | 修复 |
| --- | --- | --- |
| 模型路线不符合国内优先策略 | 旧文档和配置残留 GPT 分工 | 默认改为 Kimi K2.6 + DeepSeek V4 Flash/Pro，并支持环境变量覆盖模型名 |
| live 发布成功后被圈子详情失败误伤 | `publishDraft` 成功后如果再取 ring 失败，会误 fallback mock | 发布结果只依赖 `POST /openapi/publish/pin`，圈子信息从响应或输入兜底 |
| SSE 单条坏包让前端卡住 | `JSON.parse` 未捕获 | 前端 stream 解析失败会进入明确错误态并关闭流 |
| 第一屏像复杂后台 | 右侧同时展示 8 个 panel，评委学习成本高 | 默认改为 `讨论沉淀`，证据/共识/追问/发布主按钮聚合；模型、节点、readiness 后置到 details |
| 文档和 UI 操作不一致 | 旧文档仍写 `确认发布闭环` | 统一为 `生成圈子帖` 和当前三栏工作台 |
| 提交 README 使用本机绝对链接 | GitHub/reviewer 打开不可用 | 改为相对文档链接 |
| 社区互动缺少二次确认 | reaction / 主持评论如果 live 调用会代表用户互动 | `有启发` 和 `主持评论` 都新增社区互动确认弹层 |
| 原始 plan 完成度靠口头说明 | 评委可能追问 60 节点和 30 节方案是否真的完成 | 新增 `docs/original-plan-coverage.md` 逐项映射完成度 |
| 热榜卡片只像可选但不驱动后端 | 评委点击第二个话题如果内容不变，会破坏“从知乎热榜开始”的可信度 | 前端切换、重播、SSE、发布全部传递 `topicId`，并新增烟测防回归 |
| 本机演示启动步骤太分散 | 路演前手动开两个终端容易漏开后端或截图失败 | 新增 `npm run demo:serve` 和 `npm run capture:demo:auto`，队友拉仓库后可一键启动/截图 |
| 前端硬编码 mock 模型策略 | 后端 live-ready 但 UI 不能不改代码切 Kimi/DeepSeek，会显得“只是假演示” | URL 参数和 `VITE_DEMO_*` 环境变量可切 `mock/auto/live`，并覆盖 run + SSE 两条链路 |
| 私密仓库缺少自动门禁 | 备份存在但 reviewer/队友无法看到每次推送是否仍可运行 | 新增 GitHub Actions `Verify`，推送和 PR 都运行 `npm run verify:judge` |
| 评委入口分散 | README、路演文档、后端契约都有信息，但现场可能来不及串起来 | 新增根目录 `JUDGE_GUIDE.md`，3 分钟验证路径和评分项映射放在一页 |
| judge 门禁依赖 npm audit 网络 | npm registry/TLS 抖动会让可运行项目被外部网络误判失败 | `verify:judge` 改为离线可复现门禁，`audit:high` 保留为独立可选检查 |
| 自定义端口验证是假阳性 | `BACKEND_URL` 可改端口，但 Vite `/api` proxy 曾硬指向 `8787`，截图可能误用旧后端 | Vite proxy 现在从 `BACKEND_URL` / `VITE_BACKEND_PROXY_TARGET` 派生，并新增配置测试 |

## 3. 仍需主动说明的非代码风险

| 风险 | 现场话术 |
| --- | --- |
| 真实知乎 OAuth 未开放/未接完 | 当前用 `ZHIHU_ACCESS_TOKEN` 抽象 live provider；真正上线时接 OAuth 回调，发布仍必须人工确认 |
| 正式刘看山素材未授权 | Demo 使用原创占位主持形象；如官方提供素材可直接替换视觉层 |
| mock-safe 被误解成假功能 | 现场强调 mock 是防限流/断网兜底；需要时可用 `/?modelMode=auto&defaultProvider=kimi&fallbackToMock=true` 临时切 live/auto 策略 |
| 评委只看 6 分钟，可能看不到后端厚度 | 路演时在最后 20 秒展示 `npm run verify`、`backend-contract.md`、`modelUsages/nodeResults` |

## 4. 夺冠演示顺序

1. 打开页面：让评委先看到热榜、刘看山圆桌、讨论沉淀三栏。
2. 点 `路演模式`：展示 SSE 节点流，不是静态页面。
3. 点发言流里的反方：说明多 Agent 有制衡。
4. 看右侧 `讨论沉淀`：证据、共识、追问一屏可见。
5. 点 `生成圈子帖`：展示人工确认，强调社区边界。
6. 点 `确认发布并回流`：展示评论回流，强调闭环杀手锏。
7. 展开 `技术细节 / 评分自检`：展示模型分工、节点、readiness。

## 5. 最终验证命令

```bash
npm run verify
npm run verify:judge
npm run capture:demo:auto
```

`npm run verify` 必须通过 typecheck、全部测试、build 和 backend demo。`npm run verify:judge` 额外检查演示脚本语法且不依赖外部 live API。`npm run audit:high` 可在网络稳定时单独检查依赖安全公告。`npm run capture:demo:auto` 必须能自动启动前后端并生成桌面和移动截图。

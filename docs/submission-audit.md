# 知辩圆桌提交前完成度审计

本文件把 `/goal` 的目标拆成可检查交付物，避免只用“跑起来了”当完成证据。

## 1. 目标拆解

当前 `/goal`：

> 把知辩圆桌从“能跑”打磨到可提交、可路演、可防追问的高置信作品：产品定位清晰、主流程完整、mock-safe 与 live 边界可靠、UI/文档/验证/部署准备都经得起评委审查。

具体成功标准：

1. 第一屏 5 秒内说清“面向知乎创作者和圈子运营者的 AI 讨论组织台”。
2. 后端完整闭环：热榜、证据、Agent、观点地图、发布、评论回流。
3. AI 模型可覆盖所有核心 endpoint，并支持 Kimi/DeepSeek V4 路由。
4. 对齐知乎官方 API 能力与配额限制。
5. 前端主流程是讨论组织台，而不是摘要器、聊天框或多角色表演。
6. 发布前必须人工确认，不能自动发帖。
7. 现场只读 API/模型失败时有 mock/cache fallback，真实写操作失败必须显式失败。
8. 文档足够让 reviewer 快速运行、理解、评分。
9. 有测试、类型检查、构建、生产烟测、生产式浏览器点击流和浏览器截图验证。
10. 服务能本地生产式启动，且具备公网部署说明。

## 2. Prompt-to-Artifact Checklist

| 要求 | 证据 | 当前状态 |
|---|---|---|
| 路演任务队列 | `docs/hackathon-demo-plan.md` 里 72 项收口清单 | Done |
| 多轮持续推进 | 后端、前端、文档、测试、浏览器验证均有产物 | Done |
| 后端完整闭环 | `src/backend/workflow-service.ts` 的 `runFullWorkflow` | Done |
| HTTP endpoints | `src/backend/http-server.ts` 暴露 workflow、quota、models、zhihu status、readiness | Done |
| SSE 路演 | `GET /api/workflow/stream` + 前端热榜主流程逐节点播放 | Done |
| Kimi/DeepSeek V4 模型路由 | `src/providers/llm-provider.ts` `DEFAULT_MODEL_POLICY` | Done |
| JSON schema 校验 | `src/llm/schemas.ts` + `tests/llm-schemas.test.ts` | Done |
| 知乎 API wrapper | `src/providers/zhihu-provider.ts` live/mock/fallback provider | Done |
| 官方配额 | `src/backend/quota.ts` + UI `API 配额` | Done |
| 讨论组织台 UI | `src/frontend/main.tsx` 主流程 5 页 | Done |
| 证据池 | `EvidencePrep`、`EvidenceCard` + `Evidence` types | Done |
| 观点地图 | `RoundtableView` 里的支持/反对/事实/追问结构 + `ViewpointMap` | Done |
| 主持任务卡 | `agentBriefs` + 刘看山主持校验、站内观点席、反方校验席、刘看山追问席 | Done |
| 发布策划 | `RoundtablePublishView` + `PublishDraft` | Done |
| 人工确认发布 | `confirmRoundtablePublish` + live confirmation token | Done |
| 评论回流 | `RoundtableFeedbackView` + `CommentInsight` | Done |
| 模型/节点可观察性 | `AdvancedDetails` 展示模型、节点、安全边界和 readiness | Done |
| readiness 评分 | `src/backend/readiness.ts` + `AdvancedDetails` | Done |
| README | `README.md` | Done |
| 后端契约 | `docs/backend-contract.md` | Done |
| 路演脚本/Q&A | `docs/hackathon-demo-plan.md` | Done |
| 来源边界 | `docs/hackathon-source-notes.md` | Done |
| 前端 smoke test | `tests/frontend-smoke.test.tsx` | Done |
| HTTP contract test | `tests/http-server.test.ts` | Done |
| Provider fallback test | `tests/provider-integrations.test.ts` | Done |
| Browser desktop screenshot | `artifacts/zhihu-roundtable-desktop.png`，verifier 校验 PNG 与 1440x1100 视口 | Verified |
| Browser mobile screenshot | `artifacts/zhihu-roundtable-mobile.png`，verifier 校验 PNG 与 390x900 视口 | Verified |
| 可重复截图脚本 | `npm run capture:demo:auto:mock` -> `artifacts/` | Done |

## 3. 最新验证命令

这些命令在当前工作区跑通：

```bash
npm run typecheck
npm test
npm run build
npm run demo
npm run backend:demo
npm run verify
npm run verify:production
npm run verify:judge
npm run verify:submission
npm run capture:demo:auto:mock
npm run audit:high
```

浏览器验证：

```bash
npm run capture:demo:auto:mock
```

如默认端口被占用，可直接用端口别名避开：

```bash
ZHIHU_PROVIDER=mock DEMO_BACKEND_PORT=8877 DEMO_FRONTEND_PORT=5177 npm run capture:demo:auto
```

项目内固定截图脚本会输出到：

```bash
artifacts/zhihu-roundtable-desktop.png
artifacts/zhihu-roundtable-mobile.png
```

浏览器验证：

- `npm run demo:serve:mock` 后打开 `http://localhost:5177/`
- 点击 `从热榜生成讨论方案`，进入 `选题雷达`
- 点击 `生成讨论方案`，页面应停在 `讨论方案准备`
- 点击 `让刘看山校验讨论方案`，进入 `刘看山主持校验`
- 点击 `生成发布策划`，进入 `发布策划与圈子帖预览`
- 点击 `确认发布到圈子`，确认写操作必须经过用户确认后进入评论复盘
- 评论回流页出现 `高质量评论 / 新争议 / 下一轮创作方向`
- 展开 `技术细节 / 评委验证`，确认接口、模型、节点、安全边界和 readiness 证据可见
- `npm run verify:production` 会在本机存在 Chrome/Chromium 时自动验证生产式 5 步点击流。

## 4. 剩余风险

- 真实知乎用户 OAuth 回调仍取决于官方最终文档；当前 live provider 已按正式 OpenAPI 文档支持 `ZHIHU_APP_KEY`（用户 token）、`ZHIHU_APP_SECRET`（官方密钥）、HMAC 签名、默认圈子和热榜时间窗。路演时可说明“开发者绑定接口已接入，用户级授权边界放在人工确认和 provider 层，避免自动发帖风险”。
- 刘看山 IP 素材已接入；当前前端使用参赛者提供的官方活动资源包裁切正面图，并保持“主持人/控场员”定位。
- 备用录屏不是代码阻塞；已提供 `npm run capture:demo:auto` 固定截图兜底。如果提交平台允许，可最后录一段 2 分钟固定路径视频。

## 5. 当前判断

核心工程、演示闭环、评分对齐、第一屏产品观感、mock-safe 安全边界和生产式本地服务已经覆盖。

还不能宣称 `/goal` 完成的外部事项：

1. 需要拿到一个可访问的公网 Demo URL。
2. 当前本地提交需要 push 到远端。
3. GitHub 仓库目前是 private；提交前要给评委/主办方授权，或经用户确认后切 public。

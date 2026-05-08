# 知辩圆桌提交前完成度审计

本文件把 `/goal` 的目标拆成可检查交付物，避免只用“跑起来了”当完成证据。

## 1. 目标拆解

原目标：

> 把知辩圆桌打磨到知乎 Hackathon 顶级夺奖水准：建立 50+ 个连续任务队列，持续多轮推进后端、前端、路演、验证、文档、提交物和现场稳定性，目标是炸裂 Demo 表现和评委可感知的完成度。

具体成功标准：

1. 至少 50 个任务的连续队列和路演计划。
2. 后端完整闭环：热榜、证据、Agent、观点地图、发布、评论回流。
3. AI 模型可覆盖所有核心 endpoint，并支持 Kimi/DeepSeek V4 路由。
4. 对齐知乎官方 API 能力与配额限制。
5. 前端能展示一个强记忆点的圆桌体验，而不只是聊天框。
6. 发布前必须人工确认，不能自动发帖。
7. 现场 API/模型失败时有 mock/cache fallback。
8. 文档足够让 reviewer 快速运行、理解、评分。
9. 有测试、类型检查、构建和浏览器截图验证。
10. 服务能在本机实际启动并完成路演路径。

## 2. Prompt-to-Artifact Checklist

| 要求 | 证据 | 当前状态 |
|---|---|---|
| 50+ tasks | `docs/hackathon-demo-plan.md` 里 72 项任务队列表 | Done |
| 多轮持续推进 | 后端、前端、文档、测试、浏览器验证均有产物 | Done |
| 后端完整闭环 | `src/backend/workflow-service.ts` 的 `runFullWorkflow` | Done |
| HTTP endpoints | `src/backend/http-server.ts` 暴露 workflow、quota、models、zhihu status、readiness | Done |
| SSE 路演 | `GET /api/workflow/stream` + 前端 `路演模式` | Done |
| Kimi/DeepSeek V4 模型路由 | `src/providers/llm-provider.ts` `DEFAULT_MODEL_POLICY` | Done |
| JSON schema 校验 | `src/llm/schemas.ts` + `tests/llm-schemas.test.ts` | Done |
| 知乎 API wrapper | `src/providers/zhihu-provider.ts` live/mock/fallback provider | Done |
| 官方配额 | `src/backend/quota.ts` + UI `API 配额` | Done |
| 圆桌 UI | `src/frontend/main.tsx` `Roundtable` | Done |
| 证据池 | `EvidencePanel` + `Evidence` types | Done |
| 观点地图 | `ViewpointPanel` + `ViewpointMap` | Done |
| Agent 任务卡 | `AgentBriefPanel` 展示 mission/tone/evidence | Done |
| 发布预览 | `PublishPanel` + `PublishDraft` | Done |
| 人工确认发布 | `PublishConfirmDialog` in-app modal | Done |
| 评论回流 | `FeedbackPanel` + `CommentInsight` | Done |
| 模型/节点可观察性 | `ModelPanel`、`NodeTimeline` | Done |
| readiness 评分 | `src/backend/readiness.ts` + `ReadinessPanel` | Done |
| README | `README.md` | Done |
| 后端契约 | `docs/backend-contract.md` | Done |
| 路演脚本/Q&A | `docs/hackathon-demo-plan.md` | Done |
| 前端 smoke test | `tests/frontend-smoke.test.tsx` | Done |
| HTTP contract test | `tests/http-server.test.ts` | Done |
| Provider fallback test | `tests/provider-integrations.test.ts` | Done |
| Browser desktop screenshot | `artifacts/zhihu-roundtable-desktop.png` | Verified |
| Browser mobile screenshot | `artifacts/zhihu-roundtable-mobile.png` | Verified |
| 可重复截图脚本 | `npm run capture:demo` -> `artifacts/` | Done |

## 3. 最新验证命令

这些命令在当前工作区跑通：

```bash
npm run typecheck
npm test
npm run build
npm run demo
npm run backend:demo
npm run verify
npm run capture:demo
```

浏览器验证：

```bash
npx -y playwright@1.56.1 screenshot --channel chrome --viewport-size 1440,1100 --wait-for-selector '.roundtable' --wait-for-timeout 1800 http://localhost:5173/ artifacts/zhihu-roundtable-desktop.png
npx -y playwright@1.56.1 screenshot --channel chrome --viewport-size 390,900 --wait-for-selector '.roundtable' --wait-for-timeout 1800 http://localhost:5173/ artifacts/zhihu-roundtable-mobile.png
```

项目内固定截图脚本会输出到：

```bash
artifacts/zhihu-roundtable-desktop.png
artifacts/zhihu-roundtable-mobile.png
```

手动 Chrome 验证：

- 页面加载到 `http://localhost:5173/`
- 点击 `路演模式`，状态到 `路演播放完成`
- 点击 `生成圈子帖`，出现 `人工确认节点` 弹层
- 点击 `确认发布并回流`，右侧节点出现 `发布节点`

## 4. 剩余风险

- 真实知乎 OAuth 暂未实现；当前 live provider 依赖 `ZHIHU_ACCESS_TOKEN` 环境变量。路演时可说明“官方开放 OAuth 后接入回调，目前把授权边界放在人工确认和 provider 层，避免自动发帖风险”。
- 正式刘看山素材未接入；当前用合规占位形象，避免盗用未授权图片。
- 备用录屏不是代码阻塞；已提供 `npm run capture:demo` 固定截图兜底。如果提交平台允许，可最后录一段 2 分钟固定路径视频。

## 5. 当前判断

核心工程、演示闭环、评分对齐、第一屏产品观感和现场稳定性已经覆盖。剩余主要是真实授权接入和正式刘看山素材授权，不影响 mock-safe 路演。

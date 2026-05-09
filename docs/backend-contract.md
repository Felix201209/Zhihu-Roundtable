# 知辩圆桌 Backend Contract

后端核心是 framework-agnostic 的 `RoundtableWorkflowService`，HTTP 层只是轻量适配器。前端可以直接 import service，也可以启动 HTTP server 调接口。

这版后端不再把 AI 只用于一个局部步骤：热榜评分、问题重构、证据池、Agent briefing、圆桌发言、观点地图、发布稿、标题候选、发布质量评分、评论回流都通过 `LlmProvider`。默认是 mock-safe；配置 key 后可以按角色路由到 Kimi K2.6 和 DeepSeek V4。

## Scripts

- `npm run demo`：本地静态核心流程摘要。
- `npm run backend:demo`：后端 service 完整流程，包含 mock 发布和评论回流。
- `npm run backend:serve`：启动 HTTP API，默认 `http://localhost:8787`。
- `npm test`：核心、schema、service、HTTP 全部测试。

## Model Policy

默认策略：

```json
{
  "mode": "mock",
  "kimiModel": "kimi-k2.6",
  "deepseekFlashModel": "deepseek-v4-flash",
  "deepseekProModel": "deepseek-v4-pro",
  "defaultProvider": "mock",
  "fallbackToMock": true,
  "roleMap": {
    "topic_scoring": "deepseek-v4-flash",
    "question": "deepseek-v4-pro",
    "evidence": "kimi",
    "briefing": "deepseek-v4-flash",
    "debate": "kimi",
    "synthesis": "deepseek-v4-pro",
    "publish": "deepseek-v4-pro",
    "feedback": "deepseek-v4-flash"
  }
}
```

真实模型环境变量：

- Kimi: `KIMI_API_KEY` 或 `MOONSHOT_API_KEY`
- Kimi base URL: `KIMI_BASE_URL` 或 `MOONSHOT_BASE_URL`，默认 `https://api.moonshot.cn/v1`
- Kimi model override: `KIMI_MODEL` 或 `MOONSHOT_MODEL`
- DeepSeek: `DEEPSEEK_API_KEY`
- DeepSeek base URL: `DEEPSEEK_BASE_URL`，默认 `https://api.deepseek.com/v1`
- DeepSeek model override: `DEEPSEEK_FLASH_MODEL`、`DEEPSEEK_PRO_MODEL`，或统一 `DEEPSEEK_MODEL`

所有模型调用都要求 JSON object，并经过 zod schema 校验；如果 `fallbackToMock=true` 且 live 调用失败，会自动回退 mock 并在 `modelUsages[].fallbackUsed` 标记。

前端路演默认使用 mock-safe，但不再需要改代码才能切 live/auto。可在 URL 上追加：

```text
/?modelMode=auto&defaultProvider=kimi&fallbackToMock=true
```

也可通过 `VITE_DEMO_MODEL_MODE`、`VITE_DEMO_DEFAULT_PROVIDER`、`VITE_DEMO_KIMI_MODEL`、`VITE_DEMO_DEEPSEEK_FLASH_MODEL`、`VITE_DEMO_DEEPSEEK_PRO_MODEL`、`VITE_DEMO_FALLBACK_TO_MOCK` 固化到本地 `.env`。这些值会同时作用于 `POST /api/workflow/run` 和 `GET /api/workflow/stream`。

模型响应容错：

- 支持 OpenAI-compatible `/chat/completions`。
- 使用 `response_format: { "type": "json_object" }`。
- 如果模型仍返回 ```json fence``` 或 JSON 前后夹杂文字，会尝试提取 JSON object/array。
- 默认 30 秒超时、1 次重试；失败后按 `fallbackToMock` 决定是否回退。
- `modelUsages[]` 会记录 `provider`、`model`、`role`、`task`、`fallbackUsed`、`latencyMs`、`attempts`、`errorMessage`。

## Zhihu Provider

默认使用 `MockZhihuProvider`。如果配置以下变量，会启用 live provider，并由 `FallbackZhihuProvider` 兜底到 mock：

- `ZHIHU_PROVIDER=live`
- `ZHIHU_API_BASE_URL`
- `ZHIHU_ACCESS_TOKEN`

Live provider 对齐方案里的官方接口规划：

- `GET /api/v1/content/hot_list`
- `GET /api/v1/content/zhihu_search?q=...`
- `GET /api/v1/content/global_search?q=...`
- `GET /openapi/ring/detail`
- `POST /openapi/publish/pin`
- `POST /openapi/comment/create`
- `GET /openapi/comment/list`
- `POST /openapi/reaction`

接口返回 shape 做了宽松映射，支持常见的 `data/items/list/results/comments` 包装；任何 live 失败都会记录在 `provider.failures[]` 并使用缓存案例继续演示。

官方限制已进入后端保护：

- 热榜：默认 `hot_list` 100 次/天。
- 站内搜索：默认 `zhihu_search` 1000 次/天。
- 全网搜索：默认 `global_search` 1000 次/天。
- 其他圈子/发布/评论/reaction 也有本地 quota 计数。
- `GET /api/quota` 可查看当前配额状态；live 配额耗尽会触发 fallback，不让路演中断。

## HTTP API

- `GET /api/health`
  - 返回 `{ ok: true, service, endpoints }`。
- `GET /api/topics`
  - 支持 query model 参数：`modelMode`、`defaultProvider`、`kimiModel`、`deepseekFlashModel`、`deepseekProModel`、`fallbackToMock`。
  - 返回 `{ topics: Topic[] }`。
- `GET /api/models`
  - 返回默认模型策略、Kimi/DeepSeek/知乎 token 是否配置。
- `GET /api/zhihu/status`
  - 返回 `{ mode, accessTokenConfigured, baseUrlConfigured, failures, quotas }`。
  - 用于 UI 显示 live/mock 状态、官方接口配额、以及现场 API 失败后的 fallback 证据。
- `GET /api/quota`
  - 返回 `{ quotas: ApiQuotaStatus[] }`。
- `GET /api/ring/default`
  - 返回 `{ ring: RingDetail }`。
- `POST /api/workflow/start`
  - body: `{ topicId?: string, modelPolicy?: Partial<ModelPolicy> }`
  - 返回 `{ snapshot, modelUsages, nodeResults }`，用于手动/分步流程起点。
- `POST /api/workflow/prepare`
  - body: `{ snapshot: RoundtableSnapshot, modelPolicy?: Partial<ModelPolicy> }`
  - 运行 AI 问题重构、证据池、Agent briefing。
- `POST /api/workflow/debate`
  - body: `{ snapshot: RoundtableSnapshot, modelPolicy?: Partial<ModelPolicy> }`
  - 运行四个前台 Agent 发言和观点地图生成。
- `POST /api/workflow/publish-draft`
  - body: `{ snapshot: RoundtableSnapshot, modelPolicy?: Partial<ModelPolicy> }`
  - 生成发布草稿、标题候选、讨论质量评分。
- `POST /api/workflow/confirm-publish`
  - body: `{ snapshot: RoundtableSnapshot, ringId?: string }`
  - 用户确认后发布或 mock 发布。
  - 返回 `{ snapshot, publishResult, modelUsages, nodeResults }`，其中 `snapshot.nodeResults` 会追加 `publish` 节点。
- `POST /api/workflow/comment`
  - body: `{ publishId: string, content: string }`
  - 用户确认后让刘看山补主持评论。
- `POST /api/workflow/reaction`
  - body: `{ targetId: string, type: "support" | "oppose" | "inspired" | "neutral" }`
  - 初始化或模拟“支持/反对/有启发”等轻互动入口。
- `POST /api/workflow/feedback`
  - body: `{ snapshot: RoundtableSnapshot, publishResult?: { id: string }, publishId?: string, modelPolicy?: Partial<ModelPolicy> }`
  - 拉评论并用 AI 生成回流分析。
- `POST /api/readiness`
  - body: `{ snapshot: RoundtableSnapshot }`
  - 按官方评分维度输出 `HackathonReadinessReport`。
- `POST /api/workflow/run`
  - body: `{ topicId?: string, publish?: boolean, ringId?: string, modelPolicy?: Partial<ModelPolicy> }`
  - 返回完整 `{ topics, snapshot, publishResult?, providerMode, modelPolicy, modelUsages, nodeResults }`。
  - 同时返回 `providerFailures[]`，用于证明 live API 异常时系统不会中断路演。
- `GET /api/workflow/stream?topicId=&publish=&ringId=&modelMode=&defaultProvider=&kimiModel=&deepseekFlashModel=&deepseekProModel=&fallbackToMock=`
  - SSE 输出事件：`radar`、`prepare`、`agent_briefing`、`debate_turn`、`debate_done`、`publish`、`feedback`、`error`。

错误语义：

- 请求 JSON 不是 object：`400 invalid_json`
- step endpoint 缺少或传错 snapshot：`400 missing_snapshot` / `400 invalid_snapshot`
- reaction 参数错误：`400 invalid_reaction`
- comment 参数错误：`400 invalid_comment`
- 未知路由：`404 not_found`
- 后端未知错误：`500 backend_error`

## Hackathon Readiness

`POST /api/readiness` 对齐截图里的官方评分维度：

- AI 场景价值：35%
- 创新度：25%
- 完成度：25%
- 产品体验与设计感：8%
- 计划书和演示环节：7%

返回内容包括：

- `totalScore`
- `awardTargets`
- `items[]`：每个维度的分数、理由、风险
- `strongestProof`
- `missingProof`
- `demoChecklist`

这个 endpoint 的用途不是替代评委，而是给路演页/控制台一个“夺奖自检面板”：哪些证据已经足够，哪些还需要 UI 或真实 API 日志补强。

## Workflow Nodes

返回的 `nodeResults` 对齐方案里的关键节点：

- 热榜拉取与 AI 评分：`hot_list`、`topic_scoring`
- 话题选择：`topic_selection`
- 议题重构：`question_rewrite`
- 证据池：`evidence_pool`
- 角色任务卡：`agent_briefing`
- 多 Agent 圆桌：`debate`
- 观点地图：`viewpoint_map`
- 发布预览：`publish_draft`、`publish_confirm`
- 用户确认发布：`publish`
- 评论回流：`comment_feedback`
- 稳定性：缓存由 `MemoryCache` 提供；live 失败由 `RoutedLlmProvider` 和 `FallbackZhihuProvider` 回退。

## Frontend Hand-Off

UI 第一版只需要接两种方式之一：

- 快速版：`POST /api/workflow/run` 一次拿完整结果，前端自己按阶段播放。
- 路演版：`GET /api/workflow/stream` 用 SSE 逐步驱动圆桌动画和右侧面板增长。
- 手动版：`start -> prepare -> debate -> publish-draft -> confirm-publish -> feedback`，每一步都能传 `modelPolicy`，适合前端做“暂停/继续/重新生成”。

所有发布默认 mock；如果未来接真实知乎 API，只需要实现 `ZhihuProvider` 接口并传给 `RoundtableWorkflowService`。前端不需要知道模型具体是谁，只读 `snapshot.modelUsages` 和 `snapshot.nodeResults` 做“AI 正在工作”的可视化。

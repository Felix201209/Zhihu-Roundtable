# 知辩圆桌 Backend Contract

后端核心是 framework-agnostic 的 `RoundtableWorkflowService`，HTTP 层只是轻量适配器。前端可以直接 import service，也可以启动 HTTP server 调接口。

这版后端不再把 AI 只用于一个局部步骤：热榜评分、问题重构、证据池、Agent briefing、圆桌发言、观点地图、发布稿、标题候选、发布质量评分、评论回流都通过 `LlmProvider`。默认策略是 DeepSeek 优先；没有 key 或 live 调用失败时才按 `fallbackToMock` 回到 mock。

## Scripts

- `npm run demo`：本地静态核心流程摘要。
- `npm run backend:demo`：后端 service 完整流程，包含 mock 发布和评论回流。
- `npm run backend:serve`：启动 HTTP API，默认 `http://localhost:8787`。
- `npm test`：核心、schema、service、HTTP 全部测试。

## Model Policy

默认策略：

```json
{
  "mode": "auto",
  "kimiModel": "kimi-k2.6",
  "deepseekFlashModel": "deepseek-v4-flash",
  "deepseekProModel": "deepseek-v4-pro",
  "defaultProvider": "deepseek-v4-pro",
  "fallbackToMock": true,
  "roleMap": {
    "topic_scoring": "deepseek-v4-flash",
    "question": "deepseek-v4-pro",
    "evidence": "deepseek-v4-flash",
    "briefing": "deepseek-v4-flash",
    "debate": "deepseek-v4-flash",
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

本地推荐把真实 key 放在 `.env.local`，不要写进聊天记录和 git：

```bash
VITE_DEMO_MODEL_MODE=auto
VITE_DEMO_DEFAULT_PROVIDER=deepseek-v4-pro
VITE_DEMO_FALLBACK_TO_MOCK=true
DEEPSEEK_API_KEY=sk-...
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
DEEPSEEK_FLASH_MODEL=deepseek-v4-flash
DEEPSEEK_PRO_MODEL=deepseek-v4-pro
```

`npm run backend:serve`、`npm run backend:demo`、`npm run demo:serve`、`npm run capture:demo:auto` 都会读取 `.env.local`；shell 里已经设置的环境变量优先级更高。

所有模型调用都要求 JSON object，并经过 zod schema 校验；如果 `fallbackToMock=true` 且 live 调用失败，会自动回退 mock 并在 `modelUsages[].fallbackUsed` 标记。

前端路演默认使用 `auto + deepseek-v4-pro`，不再需要改代码才能切 live/auto/mock。可在 URL 上追加：

```text
/?modelMode=auto&defaultProvider=deepseek-v4-pro&fallbackToMock=true
```

也可通过 `VITE_DEMO_MODEL_MODE`、`VITE_DEMO_DEFAULT_PROVIDER`、`VITE_DEMO_KIMI_MODEL`、`VITE_DEMO_DEEPSEEK_FLASH_MODEL`、`VITE_DEMO_DEEPSEEK_PRO_MODEL`、`VITE_DEMO_FALLBACK_TO_MOCK` 固化到本地 `.env`。这些值会同时作用于 `POST /api/workflow/run` 和 `GET /api/workflow/stream`。

模型响应容错：

- 支持 OpenAI-compatible `/chat/completions`。
- 使用 `response_format: { "type": "json_object" }`。
- 如果模型仍返回 ```json fence``` 或 JSON 前后夹杂文字，会尝试提取 JSON object/array。
- 默认 30 秒超时、1 次重试；失败后按 `fallbackToMock` 决定是否回退。
- DeepSeek/OpenAI-compatible JSON 响应默认写入 `.cache/llm-json-cache.json`，由 `LLM_CACHE_TTL_MS` 控制 TTL，失败由 `LLM_CACHE_ERROR_TTL_MS` 做短负缓存。
- `modelUsages[]` 会记录 `provider`、`model`、`role`、`task`、`fallbackUsed`、`latencyMs`、`attempts`、`cached`、`errorMessage`。

## Zhihu Provider

默认使用 `MockZhihuProvider`。如果配置以下变量，会启用 live provider，并由 `FallbackZhihuProvider` 兜底到 mock：

- `ZHIHU_PROVIDER=live`
- `ZHIHU_API_BASE_URL`
- `ZHIHU_APP_KEY`，官方文档里的 `app_key`，即知乎用户 token
- `ZHIHU_APP_SECRET`，官方文档里的 `app_secret`
- `ZHIHU_ACCESS_TOKEN`，`app_key` 的兼容别名
- `ZHIHU_RING_ID`，指定默认发布圈子；不填时使用 `2029619126742656657`（黑客松脑洞补给站）
- `ZHIHU_HOT_LIST_HOURS`，指定热榜最近 N 小时时间窗

使用真实 `fetch` 时，`ZHIHU_API_BASE_URL` 必须是知乎 HTTPS 域名，避免把官方 HMAC 凭证发送到非知乎域；单元测试可通过 `fetchImpl` 注入假域。

OpenAPI 鉴权按官方 HMAC 规则生成：

```text
sign_str = app_key:{app_key}|ts:{timestamp}|logid:{log_id}|extra_info:{extra_info}
X-Sign = base64(hmac_sha256(sign_str, app_secret))
```

所有 live 请求都会带：

```text
X-App-Key
X-Timestamp
X-Log-Id
X-Sign
X-Extra-Info
Content-Type: application/json
```

Live provider 对齐方案里的官方接口规划：

- `GET /api/v1/content/hot_list`
- `GET /api/v1/content/zhihu_search?q=...`
- `GET /api/v1/content/global_search?q=...`
- `GET /openapi/ring/detail`
- `POST /openapi/publish/pin`
- `POST /openapi/comment/create`
- `GET /openapi/comment/list`
- `POST /openapi/reaction`
- 可选 `GET /openapi/feed/following`、`GET /openapi/user/following`、`GET /openapi/user/followers` 作为后续个性化入口；当前不放进主线，避免稀释“热榜讨论组织器”。
- 可选故事/知识接口作为内容创意补充；当前主线不依赖，避免踩付费内容署名和非商用边界。
- 可选知乎直答 Agent：通过 `defaultProvider=custom` + `CUSTOM_LLM_BASE_URL=https://api.zhihu.com/v1` 或 `ZHIHU_DIRECT_AGENT_BASE_URL` 接入 OpenAI-compatible `/chat/completions`。

接口返回 shape 做了宽松映射，支持常见的 `data/items/list/results/comments` 包装。内容热榜/搜索接口如果对当前 app 返回 404，会记录 `provider.failures[]`，然后继续走真实 `ring/detail` 读接口生成候选话题和证据；只有这些 live 读接口都失败时，外层 `FallbackZhihuProvider` 才切到 mock。若知乎给当前 app 下发了不同路径，可用 `ZHIHU_ENDPOINT_HOT_LIST`、`ZHIHU_ENDPOINT_ZHIHU_SEARCH`、`ZHIHU_ENDPOINT_GLOBAL_SEARCH`、`ZHIHU_ENDPOINT_RING_DETAIL` 覆盖默认路径。live 写操作失败必须显式失败。

官方限制已进入后端保护：

- 热榜：默认 `hot_list` 100 次/天。
- 站内搜索：默认 `zhihu_search` 1000 次/天。
- 全网搜索：默认 `global_search` 1000 次/天。
- 其他圈子/发布/评论/reaction 也有本地 quota 计数。
- `GET /api/quota` 可查看当前配额状态；读接口 live 配额耗尽会触发 fallback，不让路演中断。
- 发布、评论、reaction 是真实社区写操作：live 模式下不会 fallback 成 mock 成功，必须显式失败或由用户切回 mock-safe 路演。
- 服务层默认拒绝 live 写操作；HTTP 层只有在消费一次性 confirmation token 后，才会以 `allowLiveWrite: true` 调用发布、主持评论、reaction 或想法试验发布。

live 只读接口还有本地文件缓存，默认写入 `.cache/zhihu-openapi-cache.json`：

- `ring/detail`：24 小时
- `hot_list`：30 分钟
- `zhihu_search` / `global_search`：12 小时
- `comment/list`：1 分钟
- 失败/404：15 分钟负缓存

缓存命中不会消耗本地 quota，也不会触发真实 HTTP 请求。写接口不缓存。

## Zhihu OAuth

为满足黑客松广场“知乎登录回调地址”字段，后端提供一组轻量 OAuth 端点：

- `GET /api/oauth/status`
  - 返回 `{ configured, clientIdConfigured, clientSecretConfigured, openApiAppKeyConfigured, openApiAppSecretConfigured, authorizeUrlConfigured, tokenUrlConfigured, callbackUrl, mode }`。
- `GET /api/oauth/start`
  - 未配置官方授权地址时返回 mock-safe 说明页，并展示可提交的 callback URL。
  - 配置 `ZHIHU_OAUTH_AUTHORIZE_URL`、`ZHIHU_OAUTH_CLIENT_ID`、`ZHIHU_OAUTH_CLIENT_SECRET` 后跳转知乎授权页。
- `GET /api/oauth/callback`
  - 校验 `state` 和 `code`。
  - 配置 `ZHIHU_OAUTH_TOKEN_URL` 后会向官方 token endpoint 换 token。

线上提报时建议填写：

```text
https://你的线上-demo域名/api/oauth/callback
```

OAuth 不改变主线的开发者绑定接口：热榜、搜索、圈子发布、评论回流仍通过 `ZhihuProvider` 调用，写操作继续需要用户确认 token。

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
- 用于 UI 显示 live/mock 状态、官方接口配额、以及现场只读 API 失败后的 fallback 证据。
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
  - 生成发布草稿、标题候选、讨论质量评分；live 模式额外返回 `publishConfirmation`。
- `POST /api/workflow/confirmation`
  - body: `{ action: "publish" | "comment" | "reaction", snapshot?: RoundtableSnapshot, subject?: string }`
  - 为 live 写操作生成一次性确认 token。`publish` 绑定当前 snapshot；`comment/reaction` 绑定 publishId/targetId。
  - token 消费后立即失效；action、subject 或 snapshot hash 不匹配会返回 `confirmation_mismatch`。
- `POST /api/workflow/confirm-publish`
  - body: `{ snapshot: RoundtableSnapshot, ringId?: string, confirmationToken?: string }`
  - 用户确认后发布或 mock 发布。
  - live 模式必须带服务端生成的一次性 `confirmationToken`；`POST /api/workflow/run publish=true` 和 SSE `publish=true` 不允许绕过确认。
  - 返回 `{ snapshot, publishResult, modelUsages, nodeResults }`，其中 `snapshot.nodeResults` 会追加 `publish` 节点。
- `POST /api/workflow/comment`
  - body: `{ publishId: string, content: string, confirmationToken?: string }`
  - 用户确认后让刘看山补主持评论；live 模式缺 token 返回 `confirmation_required`。
- `POST /api/workflow/reaction`
  - body: `{ targetId: string, type: "support" | "oppose" | "inspired" | "neutral", confirmationToken?: string }`
  - 初始化或模拟“支持/反对/有启发”等轻互动入口；live 模式缺 token 返回 `confirmation_required`。
- `POST /api/workflow/feedback`
  - body: `{ snapshot: RoundtableSnapshot, publishResult?: { id: string }, publishId?: string, modelPolicy?: Partial<ModelPolicy> }`
  - 拉评论并用 AI 生成回流分析。
- `POST /api/readiness`
  - body: `{ snapshot: RoundtableSnapshot }`
  - 按官方评分维度输出 `HackathonReadinessReport`。
- `POST /api/workflow/run`
  - body: `{ topicId?: string, publish?: boolean, ringId?: string, modelPolicy?: Partial<ModelPolicy> }`
  - `publish=false` 返回到发布预览阶段；`publish=true` 在 mock-safe 演示中会继续完成发布和评论回流。
  - live 模式禁止 `publish=true` 绕过用户确认。
  - 返回 `{ topics, snapshot, publishResult?, providerMode, modelPolicy, modelUsages, nodeResults }`。
  - 同时返回 `providerFailures[]`，用于证明 live API 异常时系统不会中断路演。
- `GET /api/workflow/stream?topicId=&publish=&ringId=&modelMode=&defaultProvider=&kimiModel=&deepseekFlashModel=&deepseekProModel=&fallbackToMock=`
  - SSE 输出事件：`radar`、`prepare`、`agent_briefing`、`debate_turn`、`debate_done`、`publish`、`error`。
  - 只有 `publish=true` 且 mock-safe 场景才继续输出 `feedback`；live 模式禁止通过 SSE 自动发布。

错误语义：

- 请求 JSON 不是 object：`400 invalid_json`
- step endpoint 缺少或传错 snapshot：`400 missing_snapshot` / `400 invalid_snapshot`
- reaction 参数错误：`400 invalid_reaction`
- comment 参数错误：`400 invalid_comment`
- live 写操作缺少确认：`403 confirmation_required`
- 确认 token 过期或不匹配：`403 confirmation_invalid` / `403 confirmation_mismatch`
- 未知路由：`404 not_found`
- 后端未知错误：`500 backend_error`

## Hackathon Readiness

`POST /api/readiness` 对齐赛事手册截图里的评审维度；来源边界见 `docs/hackathon-source-notes.md`：

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
- 刘看山主持校验：`debate`
- 观点地图：`viewpoint_map`
- 发布预览：`publish_draft`、`publish_confirm`
- 用户确认发布：`publish`
- 评论回流：`comment_feedback`
- 稳定性：缓存由 `MemoryCache` 提供；live 失败由 `RoutedLlmProvider` 和 `FallbackZhihuProvider` 回退。

## Frontend Hand-Off

UI 第一版只需要接两种方式之一：

- 快速版：`POST /api/workflow/run` 一次拿完整结果，前端自己按阶段播放。
- 路演版：`GET /api/workflow/stream` 用 SSE 逐步驱动主持校验和右侧面板增长。
- 手动版：`start -> prepare -> debate -> publish-draft -> confirm-publish -> feedback`，每一步都能传 `modelPolicy`，适合前端做“暂停/继续/重新生成”。

所有发布默认 mock；接入真实知乎 API 时，写操作必须走确认 token，且失败不会被伪装为 mock 成功。前端不需要知道模型具体是谁，只读 `snapshot.modelUsages` 和 `snapshot.nodeResults` 做“AI 正在工作”的可视化。

# 知辩圆桌 Hackathon Demo Plan

面向 reviewer 的路演文档。目标是在 3-6 分钟内证明：知辩圆桌不是“AI 代写回答”，也不是热榜摘要器，而是一个围绕知乎热榜、证据检索、刘看山主持校验、发布策划和评论回流的社区讨论组织系统。

## 1. Demo 叙事主线

一句话定位：

> 把知乎热榜变成可回流的高质量讨论。

路演只讲一条闭环，避免分散：

1. 热榜进入：系统读取/模拟知乎热榜，按讨论潜力、证据可得性和争议度评分。
2. 议题重构：把热点标题改写成适合讨论的问题，而不是直接生成观点。
3. 证据池：拉取知乎站内、全网与缓存证据，按支持、反对、中立、背景分组。
4. 主持校验：刘看山控场，站内观点席提炼已有观点，反方校验席挑战证据不足，普通用户席判断是否愿意参与。
5. 讨论包生成：沉淀讨论目标、站队选项、引导评论、风险提醒和下一轮追问。
6. 发布策划：生成圈子帖草稿和标题候选，但保留用户确认发布。
7. 评论回流：读取/模拟评论，分析新争议，并给下一轮讨论建议。

核心证明点：

- AI 价值在“组织讨论质量”，不是替用户灌水。
- 每个 AI 节点都有结构化输出、schema 校验、模型调用记录和 fallback。
- 项目已经提供前端 demo、后端 service、HTTP API、SSE、readiness 自检与测试。

## 2. 72 项收口清单

这份清单用于 reviewer 判断完成度，也用于现场排练和最终提交前检查。状态以当前代码库能力为准：`Ready` 表示已有可演示实现，`Polish` 表示主要是路演表达/视觉呈现补强，`Fallback` 表示现场兜底材料。

| # | 模块 | 任务 | 路演证据 | 状态 |
|---:|---|---|---|---|
| 1 | 项目定位 | 明确“不是 AI 写回答，而是组织讨论” | mission strip 文案 | Ready |
| 2 | 项目定位 | 固定 6 分钟主线，不展示无关支线 | 本文第 3 节 | Ready |
| 3 | 选题雷达 | 展示 3 个可选热点话题 | 左侧热榜卡片 | Ready |
| 4 | 选题雷达 | 为话题展示热度分 | `Topic.hotScore` | Ready |
| 5 | 选题雷达 | 为话题展示讨论潜力分 | `discussionPotential` / `debateScore` | Ready |
| 6 | 选题雷达 | 为话题展示证据可得性 | `evidenceScore` | Ready |
| 7 | 选题雷达 | 解释为什么选择该话题 | `Topic.reason` | Ready |
| 8 | 选题雷达 | 对接知乎热榜接口规划 | `ZhihuProvider` contract | Ready |
| 9 | 配额保护 | 展示官方接口调用配额 | `/api/quota` | Ready |
| 10 | 配额保护 | hot_list 100 次/天保护 | quota panel | Ready |
| 11 | 配额保护 | zhihu_search 1000 次/天保护 | quota panel | Ready |
| 12 | 配额保护 | global_search 1000 次/天保护 | quota panel | Ready |
| 13 | 议题重构 | 将热点标题改写成开放讨论问题 | stage header | Ready |
| 14 | 议题重构 | 说明问题重构由 DeepSeek V4 Pro 角色负责 | `modelUsages` | Ready |
| 15 | 证据池 | 展示至少 3 条证据 | 右侧证据池 | Ready |
| 16 | 证据池 | 区分知乎、全网、mock 来源 | source badge | Ready |
| 17 | 证据池 | 展示证据质量分 | `qualityScore` | Ready |
| 18 | 证据池 | 按立场预览分组 | `stancePreview` | Ready |
| 19 | 证据池 | 说明 Kimi 适合长上下文证据整理 | model policy | Ready |
| 20 | Agent briefing | 为每个角色生成任务卡 | `agentBriefs` | Ready |
| 21 | Agent briefing | 角色必须引用证据 | `mustUseEvidenceIds` | Ready |
| 22 | Agent briefing | 每个角色有语气和规避项 | `AgentBrief` | Ready |
| 23 | 主持校验 | 刘看山负责主持控场 | 讨论组织台 | Ready |
| 24 | 主持校验 | 站内观点席基于公开内容提炼观点 | 校验发言流 | Ready |
| 25 | 主持校验 | 反方校验席提出逻辑挑战 | 校验发言流 | Ready |
| 26 | 主持校验 | 普通用户席判断是否看得懂、愿意回 | 校验发言流 | Ready |
| 27 | 主持校验 | 自动播放校验节奏 | 前端 timer | Ready |
| 28 | 主持校验 | 支持点击切换校验发言 | transcript buttons | Ready |
| 29 | 主持校验 | 每轮发言带 claim | speech bubble | Ready |
| 30 | 主持校验 | 每轮发言可关联证据 | `evidenceIds` | Ready |
| 31 | 讨论包 | 输出站队选项 | right rail | Ready |
| 32 | 讨论包 | 输出反方/质疑点 | right rail | Ready |
| 33 | 讨论包 | 输出中立/事实信息 | `ViewpointMap` | Ready |
| 34 | 讨论包 | 输出风险提醒 | `disputes` | Ready |
| 35 | 讨论包 | 输出下一轮追问 | `followups` | Ready |
| 36 | 发布预览 | 生成圈子帖标题 | publish panel | Ready |
| 37 | 发布预览 | 生成开场引导 | publish panel | Ready |
| 38 | 发布预览 | 生成站队选项 | `PublishDraft.consensus` | Ready |
| 39 | 发布预览 | 生成风险提醒 | `PublishDraft.disputes` | Ready |
| 40 | 发布预览 | 生成后续问题 | `PublishDraft.questions` | Ready |
| 41 | 发布预览 | 明确披露 demo/缓存边界 | `disclosure` | Ready |
| 42 | 发布控制 | 发布前保留用户确认 | `confirm-publish` endpoint | Ready |
| 43 | 发布控制 | 支持 mock 发布 | `MockZhihuProvider` | Ready |
| 44 | 发布控制 | 支持 live 发布接口规划 | `POST /openapi/publish/pin` | Ready |
| 45 | 评论互动 | 支持“有启发”等 reaction | `reaction` endpoint | Ready |
| 46 | 评论互动 | 支持主持评论 | `comment` endpoint | Ready |
| 47 | 评论回流 | 拉取/模拟评论列表 | feedback stage | Ready |
| 48 | 评论回流 | 分析支持/反对/中立情绪 | `CommentInsight.sentiment` | Ready |
| 49 | 评论回流 | 提取高质量评论 | `highQualityComments` | Ready |
| 50 | 评论回流 | 提取新争议 | `newDisputes` | Ready |
| 51 | 评论回流 | 给下一轮建议 | `nextRoundSuggestions` | Ready |
| 52 | 模型路由 | Kimi/DeepSeek V4 按角色分工 | `ModelPolicy.roleMap` | Ready |
| 53 | 模型路由 | mock/auto/live 三种模式 | model policy | Ready |
| 54 | 模型路由 | OpenAI-compatible JSON 调用 | backend contract | Ready |
| 55 | 稳定性 | zod schema 校验模型输出 | `llm/schemas.ts` | Ready |
| 56 | 稳定性 | 模型失败 fallback mock | `fallbackUsed` | Ready |
| 57 | 稳定性 | 知乎只读 API 失败 fallback cache | provider failures | Ready |
| 58 | 稳定性 | 30 秒超时 + 1 次重试 | backend contract | Ready |
| 59 | 可观察性 | 每个节点有 nodeResults | `nodeResults` | Ready |
| 60 | 可观察性 | 每次模型调用有 modelUsages | `modelUsages` | Ready |
| 61 | HTTP API | 一键完整 workflow | `POST /api/workflow/run` | Ready |
| 62 | HTTP API | 分步 workflow | start/prepare/debate/publish/feedback | Ready |
| 63 | HTTP API | SSE 路演流 | `/api/workflow/stream` | Ready |
| 64 | 自检 | 官方评分 readiness report | `POST /api/readiness` | Ready |
| 65 | 测试 | workflow / demo-runner 测试 | `npm test` | Ready |
| 66 | 测试 | HTTP server 测试 | `tests/http-server.test.ts` | Ready |
| 67 | 测试 | provider integration 测试 | `tests/provider-integrations.test.ts` | Ready |
| 68 | 测试 | LLM schema 测试 | `tests/llm-schemas.test.ts` | Ready |
| 69 | 路演 | 准备固定 demo 话题 | demo data | Ready |
| 70 | 路演 | 准备 live 失败兜底话术 | 本文第 5 节 | Ready |
| 71 | 提交 | 提交 README/文档/源码/测试命令 | 本文第 7 节 | Polish |
| 72 | 提交 | 准备 2 分钟备用录屏 | 本文第 5 节 | Fallback |

## 3. 6 分钟路演节奏

### 0:00 - 0:35 开场：痛点和定位

画面：打开首页，停在 `创作者 / 圈主 / 官方号的讨论组织台` 首屏和主按钮 `从热榜生成讨论方案`。

话术：

- “知乎最难的不是缺内容，而是热点下高质量讨论很难被组织起来。”
- “我们不是让 AI 代写回答，而是让 AI 帮创作者把热点组织成可参与、可站队、可回流的圈子讨论。”

评委要听到的关键词：知乎社区、讨论质量、证据、闭环、人确认发布。

### 0:35 - 1:20 选题雷达：选一个值得讨论的话题

画面：左侧选题雷达，选择默认话题 `AI 工具是否正在改变职场新人能力评价？`

展示点：

- 热度分、讨论潜力、证据可得性。
- 不是所有热点都适合组织讨论，系统先做“可讨论性筛选”。
- 真实环境可接 `GET /api/v1/content/hot_list`，现场默认有 mock-safe 路径。

### 1:20 - 2:05 议题重构和证据池

画面：`讨论方案准备` 页里的原始热榜、重构问题、讨论目标和证据卡。

展示点：

- 热榜标题被改写成开放问题，避免直接站队。
- 证据池区分知乎、全网、缓存来源。
- 支持、反对、中立、背景材料会进入后续主持校验。

话术重点：

- “AI 先找证据再说话，这比直接生成答案更适合社区讨论。”

### 2:05 - 3:15 刘看山主持校验

画面：刘看山主持校验页和四个前台席位。

展示点：

- 刘看山：主持控场，把讨论拉回问题。
- 站内观点席：基于知乎站内公开内容提炼结构化观点。
- 反方校验席：专门找漏洞和证据不足，防止同温层。
- 普通用户席：提出普通用户会问的问题。
- 每个席位都有 mission、tone、证据约束，证明它们是在校验讨论方案，而不是随机聊天。

操作：

- 展示刘看山、站内观点席、反方校验席和普通用户席的任务分工。
- 指出每条发言都可以关联证据 ID，而不是纯口胡。

### 3:15 - 4:05 发布策划与圈子帖预览

画面：`发布策划与圈子帖预览`，展示讨论目标、站队选项、引导评论、风险提醒和圈子帖草稿。

展示点：

- 系统把校验结果沉淀成可直接发起讨论的发布包。
- 发布稿不是最终自动发出，而是给人确认。
- 披露字段说明 demo/缓存边界，避免把 AI 内容伪装成真实社区事实。

话术重点：

- “这一步体现知乎生态价值：AI 帮社区整理讨论，而不是替社区下结论。”

### 4:05 - 4:55 确认发布和评论回流

画面：点击 `确认发布到圈子`，展示人工确认后的评论复盘页。

展示点：

- 发布前必须人工确认，真实环境会等待用户授权。
- 评论回流会分析支持/反对/中立、新反方、值得回复的评论和下一篇内容方向。
- 这让产品从一次性生成变成社区循环。

### 4:55 - 5:35 官方评委验证

画面：Readiness 分数和自检面板。

展示点：

- 后端 `POST /api/readiness` 直接按官方评分维度输出报告。
- 不是自吹，而是把评委关心的证据变成可检查列表。

一句话收束：

- “我们的系统把评分维度也产品化了：价值、创新、完成度、体验、演示证据都有对应输出。”

### 5:35 - 6:00 结尾

最后 25 秒只讲交付：

- “完整流程可本地运行：`npm run demo:serve:mock`、`npm run verify:judge`、`npm run capture:demo:auto:mock`。”
- “没有真实 token 也能稳定演示，有 token 时可以切 live provider。”
- “我们提交的是一个可运行的社区讨论组织系统，不是静态 mockup。”

## 4. 官方评分对齐

项目里 `POST /api/readiness` 已按官方评分权重输出 `HackathonReadinessReport`。路演时按照下表对齐证据。

| 官方维度 | 权重 | 我们怎么拿分 | 现场证据 |
|---|---:|---|---|
| AI 场景价值 | 35% | 直接服务知乎讨论质量：从热点到证据、讨论设计、发布策划、评论回流 | mission strip、讨论包、发布策划、反馈面板 |
| 创新度 | 25% | 不是问答机器人，而是“社区讨论组织层”；刘看山主持校验 + 站队设计 + 评论回流 | 讨论组织台、校验发言、发布策划 |
| 完成度 | 25% | 后端 service、HTTP API、SSE、mock/live provider、配额、fallback、测试都已跑通 | `backend-contract.md`、API、测试文件 |
| 产品体验与设计感 | 8% | 前端用讨论组织台表达从选题到发布再到回流的闭环 | 首页 demo UI |
| 计划书和演示环节 | 7% | 本文提供 6 分钟节奏、任务队列、兜底策略、Q&A、提交清单 | `docs/hackathon-demo-plan.md` |

最强证据：

- 完整社区闭环：热榜 -> 证据 -> 主持校验 -> 发布策划 -> 评论回流。
- 模型工程不是黑盒：Kimi/DeepSeek V4 角色路由、JSON schema 校验、fallback 标记、调用日志。
- 与知乎生态强相关：热榜、搜索、圈子发布、评论、reaction 都有接口规划和 mock-safe 实现。

需要主动解释的风险：

- 如果没有真实知乎 API token，现场会使用 mock provider；这不是假功能，而是为了不让第三方限流/网络影响评审。
- demo 数据中的部分链接和内容是缓存/模拟材料，发布稿内会披露边界。
- 最终线上版本需要更严格的内容安全审核、人审发布策略和真实账号权限控制。

## 5. 现场兜底策略

### A. 网络或知乎 API 不稳定

处理：

1. 切回默认 mock provider。
2. 打开 quota panel，说明 live 只读接口失败会 fallback；发布被限流会明确进入 mock-safe 复盘，评论和 reaction 失败不伪装成功。
3. 展示 `provider.failures[]` / `fallbackUsed`，把事故转成稳定性证据。

话术：

- “黑客松现场网络不可控，所以我们把 live 接口和 mock-safe 演示解耦。真实 token 存在时走 live，失败时保留可验证闭环。”

### B. 大模型 key 缺失或模型超时

处理：

1. 使用 `mode: mock` 或默认 fallback。
2. 指出每次模型调用都有 `modelUsages`，fallback 会被标记，不会伪装成 live。
3. 用 cached demo 继续跑完整流程。

话术：

- “这里我们更看重产品闭环和工程韧性。模型不可用时系统不崩，而是显式降级。”

### C. 前端 dev server 卡住

处理：

1. 先跑 `npm run backend:demo`，在终端展示 provider、topic、stage、evidence、turns、draft、nodes、models、feedback。
2. 再打开 `docs/backend-contract.md` 说明 API 已可接 UI。
3. 若浏览器恢复，再切回 UI。

备用命令：

```bash
npm run backend:demo
npm run demo
npm test
```

### D. 现场时间被压缩到 3 分钟

压缩版：

1. 20 秒：痛点和定位。
2. 40 秒：热榜 + 证据池。
3. 70 秒：刘看山主持校验 + 讨论包。
4. 40 秒：发布 + 评论回流。
5. 10 秒：readiness + 可运行提交。

### E. 评委质疑“这只是内容生成”

回应：

- “如果只是内容生成，输出会停在一篇回答。我们这里有选题评分、证据组织、角色任务、反方挑战、观点地图、人确认发布、评论回流。AI 的位置是讨论基础设施，不是替人表达最终立场。”

## 6. 评委 Q&A

### Q1：为什么这个适合知乎，而不是任意内容平台？

知乎的核心资产是问题、回答、评论和高质量讨论。知辩圆桌围绕这些资产设计：热榜选题、站内搜索、圈子发布、评论回流、reaction 都对应知乎生态接口。它不是泛化文章生成器，而是把知乎讨论链路变成可持续的 AI 协作流程。

### Q2：AI 会不会制造更多低质量内容？

产品设计上不让 AI 直接自动发布。AI 先组织证据和观点，再生成发布预览，最后由用户确认。系统还保留 disclosure，区分 demo/缓存/真实来源，并把反方校验席和证据引用作为质量约束。

### Q3：为什么要有多个校验席位？

单次生成容易直接给结论，多个校验席位可以形成制衡：刘看山控场、站内观点席补结构、反方校验席找漏洞、普通用户席判断是否愿意参与。最后系统把分歧沉淀成站队选项、风险提醒和下一轮追问，比单篇回答更像知乎社区里的真实讨论组织。

### Q4：如果真实知乎 API 没有完全开放，项目还能成立吗？

成立。当前代码把知乎接口抽象成 `ZhihuProvider`，默认 mock-safe，live provider 按官方接口规划映射。没有 token 时可以完整演示产品闭环；有 token 时可以替换为 live 数据。这个架构正适合 hackathon 现场和后续生态接入。

同时我们没有把“用户确认”只做成前端样子。live 模式下，发布、主持评论和 reaction 都要求后端一次性 confirmation token；`run/stream publish=true` 不能绕过确认自动发帖，真实写失败也不会被伪装成 mock 成功。

### Q5：Kimi 和 DeepSeek V4 的分工是什么？

默认策略是按任务路由：Kimi K2.6 更适合证据整理、主持校验发言等长文本任务；DeepSeek V4 Flash 负责选题评分、briefing、评论回流等高频结构化任务；DeepSeek V4 Pro 负责问题重构、综合判断、发布稿润色等关键决策节点。所有输出都要求 JSON object，并经过 schema 校验。

### Q6：如何防止幻觉？

三层约束：先有证据池再发言；Agent briefing 要求引用证据 ID；模型输出必须过 zod schema。现场版本仍会明确标注 mock/cache 边界，后续 live 版本需要接入更严格的引用校验和内容审核。

### Q7：评分面板是不是自己给自己打分？

不是替代评委，而是把官方评分维度变成工程自检表。`readiness` 会列出已有证据、缺失证据和 demo checklist，帮助 reviewer 快速定位项目完成度。

### Q8：和“AI 总结评论区”有什么区别？

AI 总结评论区通常停在事后归纳；知辩圆桌从发帖前就开始组织讨论，先设计开放问题、站队选项和引导评论，发布后再把真实评论回流成下一轮讨论和下一篇内容方向。

### Q9：上线后如何商业化或产品化？

可以作为知乎圈子/热榜运营工具、创作者选题助手、品牌/知识社区讨论组织工具。核心价值不是替代创作者，而是提高讨论组织效率和内容质量。

### Q10：你们最想拿什么奖？

综合大奖、生态共振奖、极致交付奖。理由分别是：闭环完整、强绑定知乎生态、工程上有 API/provider/fallback/test/readiness，而不是只做静态演示。

## 7. 提交物清单

### 必交

- 源码：`src/`、`tests/`、`package.json`、`package-lock.json`、`tsconfig.json`、`vite.config.ts`、`index.html`。
- 文档：`docs/submission-package.md`、`docs/backend-contract.md`、`docs/hackathon-demo-plan.md`、`docs/championship-redteam.md`。
- 运行说明：安装依赖、启动前端、启动后端、运行测试。
- Demo 截图或录屏：展示首页定位、选题雷达、讨论方案准备、刘看山主持校验、发布策划、评论复盘、技术细节自检。
- 黑客松广场 OAuth 回调地址：`https://你的线上-demo域名/api/oauth/callback`。

### 建议提交说明

```bash
npm ci
npm run verify
npm run dev
npm run backend:serve
npm run backend:demo
npm test
npm run typecheck
```

### Reviewer 快速验证路径

1. `npm ci`
2. `npm run verify`
3. `npm run backend:serve`
4. 另开终端执行 `npm run dev`
5. 打开前端页面，点击 `从热榜生成讨论方案`，完整跑到发布预览与评论回流
6. 如需提交截图或备份材料，执行 `npm run capture:demo:auto`

### 不建议提交

- `.env` 或任何真实 API key。
- `node_modules/`、`dist/`、临时录屏原始大文件。
- 未说明来源的真实知乎用户内容截图。

### 最终提交前检查

- 前端能在无 key 环境下展示完整闭环。
- 后端 demo 输出 `stage: feedback`。
- `npm test` 通过。
- 文档说明 mock/live/fallback 边界。
- `/api/oauth/status` 能返回 callback URL。
- 录屏不暴露 token、私人账号或本地路径敏感信息。

## 8. 路演最后一句

“知辩圆桌把 AI 从回答者变成讨论组织者：它不替知乎用户下结论，而是帮社区把热点变成有证据、有反驳、有共识、有下一轮追问的高质量讨论。”

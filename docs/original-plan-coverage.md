# 最初方案完成度对照

本文件按最开始的《知辩圆桌》30 节方案做逐项对照。结论：核心闭环已经完成；少数内容属于官方权限/素材依赖或黑客松阶段刻意不做的大型系统，已在 Demo 中用 live-ready provider、mock-safe fallback 和现场话术覆盖。

## 1. 30 节方案对照

| 原始章节 | 当前状态 | 证据 / 说明 |
| --- | --- | --- |
| 0 项目定位 | 完成 | 主赛道仍是引力场，副赛道融合刘看山 IP 和灵感引擎；README 与路演文档已统一口径 |
| 1 产品核心闭环 | 完成 | `runFullWorkflow` 跑通热榜 -> 证据 -> 圆桌 -> 发布 -> 评论回流；前端热榜选择会真实传递 `topicId` |
| 2 官方评分对齐 | 完成 | `src/backend/readiness.ts` + `POST /api/readiness` + `docs/hackathon-demo-plan.md` |
| 3 用户看到的产品 | 完成 | 第一屏三栏：热榜雷达 / 刘看山圆桌 / 讨论沉淀；热榜卡片可真实切换工作流 |
| 4 UI/UX 总原则 | 完成 | 保持知乎蓝、白底、卡片、圆桌核心；没有做成小游戏 |
| 5 UI 视觉设计 | 完成 | `DESIGN.md` + `src/frontend/styles.css`，技术 panel 后置 |
| 6 刘看山设计 | 基本完成 | UI 有主持人角色、控场文案、任务卡；正式素材需官方授权后替换 |
| 7 角色设计 | 完成 | 前台 4 角色：刘看山、大 V、反方、吃瓜群众；后台有 briefing/证据/共识/发布/评论分析角色逻辑 |
| 8 产品主要页面 | 完成但收敛 | 黑客松版没有做多路由页面，而是单页工作台承载热榜、准备、圆桌、发布、回流，减少路演跳转 |
| 9 完整系统节点 | 大部分完成 | 60 节点被映射为 `nodeResults`、provider、LLM schema、fallback、SSE；OAuth 是官方权限依赖 |
| 10 技术架构 | 完成但技术栈收敛 | 当前用 Vite + React + Node HTTP，保留 SSE/provider/schema/test；没有引入 Supabase/Redis，避免黑客松复杂度 |
| 11 模型使用方案 | 已按新策略完成 | 用户后续要求国内模型，运行时改为 Kimi K2.6 + DeepSeek V4 Flash/Pro；GPT 仅作为开发协作口径 |
| 12 状态机设计 | 完成 | `src/backend/workflow-service.ts` 和 `src/core/state-machine.ts` 固定顺序工作流 |
| 13 核心数据结构 | 完成并扩展 | `src/core/types.ts` 覆盖 Topic/Evidence/DebateTurn/PublishDraft/CommentInsight/ModelUsage |
| 14 Prompt 设计原则 | 完成 | `src/llm/prompts.ts` 输出 JSON；`src/llm/schemas.ts` 用 zod 校验 |
| 15 Agent Prompt 方向 | 完成 | 刘看山、大 V、反方、群众、共识/发布/评论分析均有 prompt 或 provider 方法 |
| 16 API 使用规划 | 完成 live-ready | 热榜、搜索、全网、圈子、发布、评论、reaction 均由 `ZhihuProvider` 映射；OAuth 暂以 token env 注入 |
| 17 Vibe Coding 执行方式 | 完成 | 项目已按模块逐步落地，并有 verify/capture 脚本 |
| 18 前端组件清单 | 基本完成 | 以单文件组件实现 AppShell/TopNav/LeftRail/Roundtable/Insight/Publish/Feedback/Utility；后续可拆文件 |
| 19 圆桌动画设计 | 基本完成 | active speaker 高亮、轮播、SSE 路演；未做复杂动画，符合原始“简单但有效” |
| 20 路演 Demo 流程 | 完成 | `docs/hackathon-demo-plan.md` 6 分钟脚本，固定案例 |
| 21 话题类型 | 完成 | 默认示例为 AI 工具与职场评价，低敏、争议清楚、容易理解 |
| 22 发布帖模板 | 完成 | `PublishDraft` 包含标题、开场、共识、争议、问题、AI disclosure |
| 23 最大亮点 | 完成 | 文档和 UI 都强调“社区型 AI，不是工具型 AI” |
| 24 必须砍掉的东西 | 完成 | 没有多人在线、积分系统、复杂 3D、自动无限辩论、自动发帖 |
| 25 一定做好的 5 点 | 完成 | 第一屏清楚、圆桌记忆点、证据来源、发布确认、评论回流均已覆盖 |
| 26 项目介绍页文案 | 完成并压缩 | 以 mission strip 呈现，不做冗长 landing page |
| 27 路演金句 | 完成 | `docs/hackathon-demo-plan.md` 已收录核心话术 |
| 28 最终产品形态 | 完成 | 文档说明热榜入口、圈子入口、回答页入口 |
| 29 最终取舍 | 完成 | 最小完整产品已经按核心闭环交付 |
| 30 一句话总结 | 完成 | README / 路演文档 / 红队审计统一表达 |

## 2. 60 节点覆盖摘要

| 节点组 | 当前覆盖 | 说明 |
| --- | --- | --- |
| A 入口节点 01-05 | 部分完成 | 热榜拉取、清洗/评分、话题选择完成且前端传递 `topicId`；OAuth 等官方权限，当前用 `ZHIHU_ACCESS_TOKEN` live-ready |
| B 议题重构 06-12 | 完成 | 问题重构、事实/价值/人群/质量控制由 prompt + schema + model usage 覆盖 |
| C 证据节点 13-19 | 完成 | zhihu/global search wrapper、摘要、立场、质量分、证据池完成 |
| D 圆桌准备 20-24 | 完成 | agent briefing、发言顺序、冲突/安全边界通过 prompt 和固定状态机覆盖 |
| E 多 Agent 圆桌 25-36 | 完成 | 刘看山开场、专家、反方、用户、补强、共识、争议、讨论价值评分均在 workflow 中体现 |
| F 输出节点 37-44 | 完成 | 观点地图、共识/争议/追问、发布草稿、标题候选、知乎语气、AI 标注完成 |
| G 发布节点 45-50 | 大部分完成 | 圈子详情、发布、reaction、评论接口都有 provider；发布和社区互动前端均要求用户确认 |
| H 回流节点 51-56 | 完成 | 评论拉取、情绪/高质量评论/新争议/下一轮建议/作者反馈信息完成 |
| I 稳定性节点 57-60 | 完成 | quota、mock fallback、错误提示、SSE 路演模式完成 |

## 3. 刻意不做或现场说明项

| 项 | 为什么不做满 | 现场说法 |
| --- | --- | --- |
| 完整 OAuth 登录 | 官方接口和审核权限依赖，不适合在无正式 token 环境硬接 | 当前 provider 已把授权边界抽象出来，正式开放后接 OAuth callback 即可 |
| Supabase/Redis | 黑客松 Demo 没有长期数据要求，引入会增加故障面 | 当前 Memory/mock cache 足够完成现场闭环；线上化再换持久层 |
| 多页面路由 | 路演时多页切换会增加认知成本 | 单页工作台把 7 个页面压缩为一条可看懂的主线 |
| 正式刘看山素材 | 未拿官方素材授权前不盗图 | 用原创占位主持形象，获得素材后只替换视觉层 |
| 真实多人在线 | 原始方案明确必须砍掉 | 产品核心是 AI 组织讨论，不是实时社交房间 |

## 4. 当前结论

原始 plan 的冠军关键项已经完成：**从知乎开始、由刘看山主持、证据驱动、多 Agent 反驳、共识沉淀、用户确认发布、评论回流、稳定 fallback、路演脚本和验证证据**。

仍不可承诺比赛结果 100%，但当前没有已知可复现 blocker。剩余风险主要来自外部权限、评委偏好和现场讲解，而不是实现缺口。

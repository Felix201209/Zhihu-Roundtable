# 知辩圆桌作品提报包

## 1. 项目基础信息

项目名称：

```text
知辩圆桌
```

一句话介绍：

```text
面向知乎创作者和圈子运营者的 AI 讨论组织台，把热榜话题转化成可发布、可回流、可继续创作的圈子讨论。
```

项目详情：

```text
知辩圆桌是一个面向知乎创作者、圈主和官方号运营者的 AI 讨论组织台。

它从知乎热榜中选择具有讨论价值的话题，先通过知乎站内搜索和全网搜索建立证据池，再把热榜改写成开放讨论问题，生成讨论目标、站队选项、引导评论、风险提醒和可发布到圈子的草稿。

刘看山在其中不是陪聊 Bot，而是主持人和圈子控场员：发帖前帮创作者检查标题是否可讨论、是否容易引战、反方空间是否足够；发帖后帮助识别高质量评论、新反方、真实经验和补充资料，再生成下一轮话题和下一篇内容方向。

它不是 AI 总结器，也不是 AI 帮用户写知乎回答，而是帮助创作者和圈主把一次热点组织成一场持续发生的社区讨论。
```

主题选择：

```text
引力场｜知乎 × 社交
刘看山｜知乎 × IP
灵感引擎｜知乎 × 创作
```

推荐主赛道：

```text
引力场｜知乎 × 社交
```

## 2. 提交链接占位

可运行体验链接：

```text
待部署后填写。推荐使用仓库里的 Render Blueprint，或按 [树莓派部署指南](raspberry-pi-deployment.md)自托管；树莓派可复制模板位于 `deploy/raspberry-pi/`，现场排障看 [树莓派公网 Demo 现场检查清单](raspberry-pi-ops-checklist.md)。平台需运行 Node 服务，而不是只托管 Vite dist。构建命令 `npm ci && npm run build`，启动命令 `npm run start`，健康检查 `/api/health`。
```

知乎登录回调地址：

```text
https://你的线上-demo域名/api/oauth/callback
```

代码仓库链接：

```text
https://github.com/Felix201209/Zhihu-Roundtable

当前仓库是 private；提交前需要给评委/主办方授予访问权限，或经确认后切为 public。若保持 private，授权完成后用 `REVIEWER_REPO_ACCESS_CONFIRMED=1 npm run completion:audit -- --strict` 留下最终审计证据。
```

其他链接：

```text
README / JUDGE_GUIDE / docs/submission-form-checklist.md / docs/final-readiness-audit.md / docs/external-closure-runbook.md / 产品说明文档链接均可填写
如平台需要源码压缩包，使用 npm run package:source 生成 .cache/submission/zhihu-roundtable-source.zip 和 .cache/submission/manifest.json；manifest 会记录 HEAD commit、文件数、ZIP 大小和 sha256。提交备注或路演备忘可用 npm run evidence:submission 打印当前 commit、源码包 sha256、截图尺寸和最终外部验收命令；本地预览才使用 `node scripts/print-submission-evidence.mjs --allow-dirty`。
```

## 3. 知乎生态契合度

```text
知辩圆桌直接服务知乎的核心生态：热点、内容、观点、圈子和评论。

对创作者：它能帮助创作者从热榜中找到真正值得讨论的问题，并直接生成讨论标题、开放问题、站队选项、引导评论和下一篇创作方向。

对圈主/社区运营者：它能快速生成每日讨论帖，降低冷场、跑偏和低质灌水风险，并从评论里发现高质量成员和下一轮主题。

对内容消费者：它把分散、情绪化、重复的热点讨论组织成可参与的问题，让用户不只是看摘要，而是能站队、补充经验和提出反例。

对圈子和社区：它不是把内容带离知乎，而是把讨论结果发布回圈子，再把真实评论回流成下一轮讨论，让社区反馈成为产品闭环的一部分。

对知乎业务：它可以作为热榜页、圈子页、回答页的 AI 原生入口，让知乎从“看观点”升级为“组织高质量讨论”。
```

## 4. 技术方案摘要

```text
前端使用 React + Vite，主流程压缩为 5 页：选题雷达、讨论方案准备、刘看山主持校验、发布策划与圈子帖预览、评论复盘与下一轮创作。

后端使用 Node/TypeScript HTTP 服务，封装 ZhihuProvider 和 LlmProvider 两层：

1. ZhihuProvider 对接知乎热榜、站内搜索、全网搜索、圈子发布、评论列表、评论创建和 reaction。
2. LlmProvider 支持 DeepSeek Flash、DeepSeek Pro、Kimi、知乎直答 Agent/custom OpenAI-compatible provider，并提供 Mock fallback。
3. 所有关键模型输出都经过 JSON schema 解析，不让前端解析自由文本。
4. 所有真实写操作都必须经过用户确认 token，禁止自动发布、刷屏或灌水。
5. 热榜和搜索接口有本地 quota 保护和缓存兜底，避免重复请求耗尽额度。
6. 断网或 live 只读 API 失败时，系统会切回 mock-safe 演示数据，保证评委可完整体验；真实写操作失败不会伪装成 mock 成功。
```

## 5. 官方接口使用说明

核心接口：

```text
GET /api/v1/content/hot_list
GET /api/v1/content/zhihu_search
GET /api/v1/content/global_search
GET /openapi/ring/detail
POST /openapi/publish/pin
GET /openapi/comment/list
POST /openapi/comment/create
POST /openapi/reaction
POST /v1/chat/completions
```

可选扩展：

```text
GET /openapi/feed/following
GET /openapi/user/following
GET /openapi/user/followers
GET /ring/moltbook/api/community/story_list
知乎知识内容接口
```

当前主线不强依赖故事/知识接口，避免稀释热榜讨论组织器定位；这些接口可作为后续“故事讨论”“知识讨论”的扩展模式。

## 6. 社区安全声明

```text
知辩圆桌不会批量、高频、无意义地发布内容。

所有发布、评论和 reaction 都必须由用户确认；AI 不会自动代表用户发帖或评论。

站内观点席不模拟任何具体知乎用户，只基于知乎站内公开内容提炼观点结构。

无法核验的观点会被标注为待验证。

真实接口失败时，系统会停止真实写操作或切换到演示模式，不会把失败的 live 写操作伪装成成功。
```

## 7. 提交前命令

```bash
npm ci
npm run evidence:submission
npm run verify:judge
npm run audit:high
npm run capture:demo:auto:mock
```

# 知辩圆桌评审指南

## 30 秒看懂

知辩圆桌不是“AI 写知乎回答”，也不是热榜摘要工具。它是面向知乎创作者、圈主和官方号运营者的 AI 讨论组织台：先从热榜或圈子话题中判断讨论潜力，再生成开放问题、站队选项、引导评论和圈子帖草稿，经用户确认发布后，把评论区的新观点回流成下一轮讨论和下一篇内容方向。

核心闭环：

```text
热榜选择 -> 议题重构 -> 证据池 -> 讨论方案 -> 用户确认发布 -> 评论复盘 -> 下一轮创作方向
```

## 3 分钟本地验证

```bash
npm ci
npm run verify:judge
npm run demo:serve:mock
```

`verify:judge` 不依赖外部 live API 或 npm audit 网络；如需额外查依赖公告，可单独运行：

```bash
npm run audit:high
```

打开前端地址后，建议按这个顺序看：

1. 点击 `从热榜生成讨论方案`，进入选题雷达。
2. 选择一个热榜话题，展示议题重构、站内证据、全网背景和讨论目标。
3. 进入 `刘看山主持校验`，确认角色为站内观点席、反方校验席、普通用户席，且发言绑定来源标签。
4. 进入 `发布策划与圈子帖预览`，确认有站队选项、引导评论、风险提醒，且发布前有人工确认。
5. 发布后看 `评论复盘与下一轮创作`，确认真实评论或演示评论会生成下一篇内容方向。
6. 展开 `技术细节 / 评委验证`，看接口、模型调用、节点和 readiness 证据。

## 截图/备份验证

```bash
npm run capture:demo:auto:mock
```

会自动启动前后端并生成：

- `artifacts/zhihu-roundtable-desktop.png`
- `artifacts/zhihu-roundtable-mobile.png`

如果默认端口被占用，可以临时切端口：

```bash
ZHIHU_PROVIDER=mock BACKEND_URL=http://localhost:8877/api/health DEMO_URL=http://localhost:5177/ npm run capture:demo:auto
```

也可以使用更短的端口别名：

```bash
ZHIHU_PROVIDER=mock DEMO_BACKEND_PORT=8877 DEMO_FRONTEND_PORT=5177 npm run capture:demo:auto
```

脚本会把 Vite 的 `/api` proxy 同步指向 `BACKEND_URL` 对应的 origin，避免前端仍误打默认 `8787`。
截图前还会通过前端 `/api/health` 校验实际后端端口，防止复用旧 Vite 服务造成假阳性。

## live / mock 边界

默认不需要任何 key，使用 mock-safe 路演，避免现场网络、限流、第三方接口影响演示。

如果本机 `.env.local` 已经填了知乎 live 地址和 token，路演仍建议使用 `npm run demo:serve:mock`；该命令会显式设置 `ZHIHU_PROVIDER=mock`，不会触发真实知乎 provider。

公网体验部署请看 [docs/deployment.md](docs/deployment.md)。推荐 Render Blueprint 或 [树莓派自托管](docs/raspberry-pi-deployment.md)：构建 `npm ci && npm run build`，启动 `npm run start`，同一个 Node 服务会托管前端页面和 `/api`。

提交前完整 readiness 和剩余外部交付缺口记录在 [docs/final-readiness-audit.md](docs/final-readiness-audit.md)。

如需切模型策略，不改代码即可使用：

```text
/?modelMode=auto&defaultProvider=kimi&fallbackToMock=true
```

真实知乎接口通过 `ZHIHU_PROVIDER=live`、`ZHIHU_API_BASE_URL=https://openapi.zhihu.com`、`ZHIHU_APP_KEY`（知乎用户 token）和 `ZHIHU_APP_SECRET`（官方密钥）接入；后端会按官方 HMAC-SHA256 规则生成 `X-Sign`。可用 `ZHIHU_RING_ID` 指定圈子、`ZHIHU_HOT_LIST_HOURS` 指定热榜时间窗。发布、reaction、主持评论仍然要求用户确认。live 模式下后端也会校验一次性 confirmation token，`run/stream publish=true` 不能绕过确认自动发帖。

提报“知乎登录回调地址”时填写线上域名下的 `/api/oauth/callback`。后端已提供 `/api/oauth/start`、`/api/oauth/callback`、`/api/oauth/status`，未配置官方 OAuth URL 时保持 mock-safe，配置后可跳转知乎授权页。

知乎直答 Agent 已预留为 `defaultProvider=custom` 的 OpenAI-compatible provider，可通过 `CUSTOM_LLM_BASE_URL=https://api.zhihu.com/v1` 和 `CUSTOM_LLM_API_KEY` / `ZHIHU_DIRECT_AGENT_API_KEY` 接入；现场默认仍使用 DeepSeek / Kimi / Mock fallback，保证稳定。

## 评分项对应

| 评分项 | 证据 |
| --- | --- |
| AI 场景价值 | 帮创作者/圈主把热榜转成讨论方案、圈子帖和下一轮创作方向 |
| 创新度 | 刘看山作为主持控场员 + 证据约束 + 站队设计 + 评论回流再组织 |
| 完成度 | `npm run verify:judge`、HTTP API、SSE、截图脚本、fallback 测试 |
| UI/UX | 第一屏双入口：热榜讨论组织台为主，想法试验场为副；主流程 5 页跑完 |
| 刘看山 IP | 主持、控场、追问、降温、发现高质量评论和下一轮话题，不是陪聊 bot |

## 扩展场景

`测试一个脑洞` 会进入想法试验场。它复用同一套社区反馈引擎：把一个脑洞生成 3 个版本，发布到圈子收集点赞和评论，再生成试验报告。这个流程是备选演示线，不抢热榜圆桌主叙事。

## 不可控但已说明

- 完整用户 OAuth token 字段取决于官方最终文档；当前已提供 callback/start/status 端点、开发者绑定凭证、access token 和写操作人工确认。
- 正式刘看山素材需授权；当前用原创占位主持形象，避免盗图。
- 比赛结果无法承诺 100%，但当前没有已知可复现实现 blocker。

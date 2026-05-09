# 知辩圆桌评审指南

## 30 秒看懂

知辩圆桌不是“AI 写知乎回答”，而是把知乎热榜组织成一场由刘看山主持的结构化圆桌：先找证据，再让多 Agent 交锋，最后沉淀成可发布到圈子的讨论帖，并把评论拉回生成下一轮议题。

核心闭环：

```text
热榜选择 -> 议题重构 -> 证据池 -> 刘看山圆桌 -> 共识/争议 -> 用户确认发布 -> 评论回流
```

## 3 分钟本地验证

```bash
npm ci
npm run verify:judge
npm run demo:serve
```

`verify:judge` 不依赖外部 live API 或 npm audit 网络；如需额外查依赖公告，可单独运行：

```bash
npm run audit:high
```

打开前端地址后，建议按这个顺序看：

1. 左侧点第二个热榜话题，确认问题和圆桌内容会切换。
2. 点 `路演模式`，确认 SSE 会逐节点播放，而不是静态页面。
3. 点 `生成圈子帖`，确认发布前有人工确认。
4. 展开 `技术细节 / 评分自检`，看模型调用、节点、readiness 证据。

## 截图/备份验证

```bash
npm run capture:demo:auto
```

会自动启动前后端并生成：

- `artifacts/zhihu-roundtable-desktop.png`
- `artifacts/zhihu-roundtable-mobile.png`

如果默认端口被占用，可以临时切端口：

```bash
BACKEND_URL=http://localhost:8877/api/health DEMO_URL=http://localhost:5177/ npm run capture:demo:auto
```

也可以使用更短的端口别名：

```bash
DEMO_BACKEND_PORT=8877 DEMO_FRONTEND_PORT=5177 npm run capture:demo:auto
```

脚本会把 Vite 的 `/api` proxy 同步指向 `BACKEND_URL` 对应的 origin，避免前端仍误打默认 `8787`。
截图前还会通过前端 `/api/health` 校验实际后端端口，防止复用旧 Vite 服务造成假阳性。

## live / mock 边界

默认不需要任何 key，使用 mock-safe 路演，避免现场网络、限流、第三方接口影响演示。

如需切模型策略，不改代码即可使用：

```text
/?modelMode=auto&defaultProvider=kimi&fallbackToMock=true
```

真实知乎接口通过 `ZHIHU_PROVIDER=live`、`ZHIHU_API_BASE_URL`、`ZHIHU_ACCESS_TOKEN` 接入；发布、reaction、主持评论仍然要求用户确认。live 模式下后端也会校验一次性 confirmation token，`run/stream publish=true` 不能绕过确认自动发帖。

## 评分项对应

| 评分项 | 证据 |
| --- | --- |
| AI 场景价值 | 热榜、证据、圆桌、圈子发布、评论回流的社区闭环 |
| 创新度 | 刘看山主持 + 多 Agent 交锋 + 观点地图 + 回流再组织 |
| 完成度 | `npm run verify:judge`、HTTP API、SSE、截图脚本、fallback 测试 |
| UI/UX | 第一屏三栏：热榜雷达 / 圆桌舞台 / 讨论沉淀 |
| 刘看山 IP | 主持、控场、提醒引用证据、总结共识，不是普通聊天 bot |

## 不可控但已说明

- 完整 OAuth 取决于官方开放节奏；当前已抽象为 live provider。
- 正式刘看山素材需授权；当前用原创占位主持形象，避免盗图。
- 比赛结果无法承诺 100%，但当前没有已知可复现实现 blocker。

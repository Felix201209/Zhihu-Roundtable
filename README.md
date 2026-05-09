# 知辩圆桌｜刘看山主持的知乎 AI 观点实验室

把知乎热榜话题变成一场由刘看山主持、多 Agent 参与、有证据、有反驳、有共识沉淀、最终能回流圈子的 AI 圆桌讨论。

这不是“AI 帮你写回答”，而是“AI 帮知乎组织高质量讨论”。

## Demo 闭环

```text
知乎热榜
-> AI 讨论潜力评分
-> 知乎站内/全网证据池
-> 多 Agent 圆桌辩论
-> 刘看山控场总结
-> 共识/争议/追问沉淀
-> 用户确认发布到圈子
-> 评论回流分析
-> 下一轮圆桌建议
```

## 技术亮点

- 固定状态机 + Agent 表演：比自由群聊稳定，适合黑客松路演。
- Kimi K2.6 + DeepSeek V4 可配置国内模型路由：证据/发言走 Kimi，批量分类走 DeepSeek V4 Flash，重构/总结/发布润色走 DeepSeek V4 Pro。
- 所有模型输出 JSON 化，并用 zod schema 校验。
- 官方 API wrapper：热榜、知乎搜索、全网搜索、圈子、发布、评论、reaction。
- Mock-safe + live-ready：现场 API 失败会自动 fallback，不影响完整 Demo。
- SSE 路演流：前端可逐节点播放“AI 正在工作”。
- Readiness 自检：按官方评分维度生成夺奖面板。
- 前端无需改代码即可切模型策略：URL 参数或 `VITE_DEMO_*` 环境变量可切 `mock/auto/live`。

## 快速运行

```bash
npm install
npm run verify
npm run demo:serve
```

或者手动分两个终端启动：

```bash
npm run backend:serve
npm run dev
```

打开 Vite 输出的本地地址，默认前端会通过代理访问 `http://localhost:8787/api`。如需改端口，设置 `BACKEND_URL` / `DEMO_URL`，脚本会同步配置 Vite API proxy。

## 核心命令

- `npm run dev`：启动前端 Demo。
- `npm run demo:serve`：一键启动后端和前端，适合路演前本机验证。
- `npm run build`：生产构建前端。
- `npm run backend:serve`：启动后端 API，默认 `http://localhost:8787`。
- `npm run capture:demo`：在前后端服务启动后，抓取桌面/移动 Demo 截图到 `artifacts/`。
- `npm run capture:demo:auto`：自动启动前后端并抓取桌面/移动 Demo 截图。
- 自定义端口示例：`BACKEND_URL=http://localhost:8877/api/health DEMO_URL=http://localhost:5177/ npm run capture:demo:auto`。
- `npm run demo`：运行核心状态机摘要。
- `npm run backend:demo`：运行完整后端闭环。
- `npm test`：状态机、schema、provider、service、HTTP API 测试。
- `npm run typecheck`：TypeScript 类型检查。
- `npm run verify`：提交前总验证，串行执行类型检查、测试、生产构建和后端完整 Demo。
- `npm run verify:judge`：评审/CI 门禁，避免依赖外部 live API 或 npm audit 网络。
- `npm run audit:high`：可选依赖安全公告检查，需要 npm registry 网络稳定。

## 真实 API / 模型环境变量

默认不需要任何 key，使用 mock-safe 演示。

可从 `.env.example` 复制本地配置；不要提交真实 `.env`。

真实模型：

- `KIMI_API_KEY` 或 `MOONSHOT_API_KEY`
- `KIMI_BASE_URL` 或 `MOONSHOT_BASE_URL`
- `KIMI_MODEL` 或 `MOONSHOT_MODEL`（可选，用于覆盖默认 `kimi-k2.6`）
- `DEEPSEEK_API_KEY`
- `DEEPSEEK_BASE_URL`
- `DEEPSEEK_FLASH_MODEL` / `DEEPSEEK_PRO_MODEL` / `DEEPSEEK_MODEL`（可选，用于覆盖默认 DeepSeek V4 模型名）

前端路演模型切换：

- 默认 mock-safe：不设置即可。
- URL 临时切换：`/?modelMode=auto&defaultProvider=kimi&fallbackToMock=true`
- Vite 环境变量：`VITE_DEMO_MODEL_MODE`、`VITE_DEMO_DEFAULT_PROVIDER`、`VITE_DEMO_KIMI_MODEL`、`VITE_DEMO_DEEPSEEK_FLASH_MODEL`、`VITE_DEMO_DEEPSEEK_PRO_MODEL`、`VITE_DEMO_FALLBACK_TO_MOCK`

知乎 live provider：

- `ZHIHU_PROVIDER=live`
- `ZHIHU_API_BASE_URL`，真实 fetch 只允许 `https://*.zhihu.com`
- `ZHIHU_ACCESS_TOKEN`

live 写操作不会绕过用户确认：发布、主持评论、reaction 都需要后端一次性 confirmation token；真实写失败不会被伪装成 mock 成功。

## Reviewer 入口

- 评审快速指南：[JUDGE_GUIDE.md](JUDGE_GUIDE.md)
- 后端契约：[docs/backend-contract.md](docs/backend-contract.md)
- 路演计划：[docs/hackathon-demo-plan.md](docs/hackathon-demo-plan.md)
- 夺冠红队审计：[docs/championship-redteam.md](docs/championship-redteam.md)
- 最初方案完成度对照：[docs/original-plan-coverage.md](docs/original-plan-coverage.md)

## 验证状态

当前核心门禁：

- `npm run verify`
- `npm run verify:judge`
- `npm run audit:high`
- `npm run typecheck`
- `npm test`
- `npm run build`

这些命令均应通过；provider fallback 测试会故意打印一次知乎 API 502 警告，用来证明 live 失败时会切换 mock。

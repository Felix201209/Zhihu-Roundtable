# 评委追问防守矩阵

本页用于路演问答时快速把回答落到可验证证据。原则是：先用一句话回答，再现场点一个位置或跑一条命令，最后给出对应文件，避免只靠口头解释。

## 1. 尖锐追问速答

| 追问 | 30 秒回答 | 现场动作 | 证据 |
| --- | --- | --- | --- |
| 这是不是 AI 帮用户写知乎回答？ | 不是。AI 不替用户下结论，它把热榜组织成可讨论的问题、证据池、站队选项、引导评论和下一轮创作方向。 | 首页点 `从热榜生成讨论方案`，一路展示到 `评论复盘与下一轮创作`。 | `README.md`、`JUDGE_GUIDE.md`、`src/frontend/main.tsx` |
| 和普通热榜摘要有什么区别？ | 摘要停在“发生了什么”，知辩圆桌继续判断讨论价值、补证据、做反方校验、生成发布策划，再把评论回流成下一轮话题。 | 展示 `讨论方案准备`、`刘看山主持校验`、`发布策划与圈子帖预览` 三页。 | `src/backend/workflow-service.ts`、`docs/backend-contract.md` |
| 为什么说它绑定知乎生态？ | 入口是知乎热榜或圈子话题，证据包含知乎站内来源，出口是圈子帖草稿，回流对象是知乎评论。 | 展示热榜话题卡、证据来源 badge、圈子帖预览和评论复盘。 | `src/demo/demo-data.ts`、`src/providers/zhihu-provider.ts` |
| 真实接口没打通怎么办？ | 路演默认 mock-safe，读接口失败可以 fallback 保证体验；真实写操作失败不会伪装成成功。 | 运行 `npm run demo:serve:mock` 或展示 `provider: mock` 的 `backend:demo` 输出。 | `scripts/serve-demo.mjs`、`src/providers/zhihu-provider.ts`、`tests/provider-integrations.test.ts` |
| 会不会自动发帖或误触真实知乎写操作？ | 不会。发布、主持评论和 reaction 都需要一次性 confirmation token，服务层默认拒绝 live 写；mock 发布不会被包装成真实知乎成功。 | 展示发布页的 `Mock-safe 演示模式` / `Live 写入保护已开启` 提示，或说明 HTTP API 没 token 会返回 `confirmation_required`。 | `src/frontend/main.tsx`、`src/backend/http-server.ts`、`src/backend/workflow-service.ts`、`tests/http-server.test.ts` |
| AI 胡说或编证据怎么控制？ | 先生成证据池，再让席位引用证据 ID；结构化输出走 schema 校验，无法核验的观点会被标注为待验证。 | 展示证据卡、发言来源标签和技术细节里的节点/模型调用。 | `src/llm/schemas.ts`、`src/llm/prompts.ts`、`tests/llm-schemas.test.ts` |
| 刘看山在这里是不是装饰？ | 不是装饰，它是主持和控场角色：开场、追问、降温、检查反方空间和普通用户参与感。 | 进入 `刘看山主持校验`，展示四个席位的 mission、tone 和证据约束。 | `docs/hackathon-demo-plan.md`、`src/backend/workflow-service.ts` |
| 为什么评委能相信完成度？ | 本地门禁覆盖类型、测试、构建、后端闭环、生产式服务、浏览器点击流、树莓派模板和源码包证据。 | 运行或展示 `npm run verify:submission` 与 `npm run evidence:submission`。 | `package.json`、`scripts/verify-submission.mjs`、`scripts/print-submission-evidence.mjs` |
| 公网 Demo 怎么验收？ | 部署后用同一套公网验证检查首页、API health、模型状态、知乎状态、OAuth callback 和浏览器主流程。 | 拿到域名后运行 `PUBLIC_DEMO_URL=https://你的线上-demo域名 npm run verify:public:full`。 | `scripts/verify-public-demo.mjs`、`scripts/verify-production-flow.mjs`、`docs/deployment.md` |
| 仓库 private 会不会影响提交？ | 会。提交前必须切 public，或给评委/主办方授权，再用严格审计留下证据。 | 授权后运行 `PUBLIC_DEMO_URL=... REVIEWER_REPO_ACCESS_CONFIRMED=1 npm run verify:final`。 | `docs/external-closure-runbook.md`、`scripts/completion-audit.mjs` |

## 2. 不能现场越界的红线

- 不展示或打印 `.env.local`、真实 token、真实知乎密钥。
- 不在未获用户确认时触发真实知乎发布、评论、reaction 或删除动作。
- 不把 mock 发布链接说成真实知乎发帖成功。
- 不把本地通过等同于最终完成；最终还需要 push、远端 CI、公网 Demo 和仓库访问闭环。

## 3. 最短证据命令

```bash
npm run verify:submission
npm run evidence:submission
node scripts/print-submission-evidence.mjs --markdown
PUBLIC_DEMO_URL=https://你的线上-demo域名 npm run verify:public:full
PUBLIC_DEMO_URL=https://你的线上-demo域名 REVIEWER_REPO_ACCESS_CONFIRMED=1 npm run verify:final
```

`verify:submission` 证明本地作品质量；`evidence:submission` 和 `--markdown` 证明当前提交、源码包和截图；`verify:public:full` 与 `verify:final` 只在 push、部署和评委仓库访问都完成后运行。

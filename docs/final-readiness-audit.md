# 知辩圆桌最终 Readiness 审计

审计日期：2026-05-13

本文件用于判断当前 `/goal` 是否真的完成，而不是用“能跑”或“测试通过”替代交付结论。

## 1. 目标拆解

目标：

> 把知辩圆桌从“能跑”打磨到可提交、可路演、可防追问的高置信作品：产品定位清晰、主流程完整、mock-safe 与 live 边界可靠、UI/文档/验证/部署准备都经得起评委审查。

具体交付标准：

| 标准 | 当前证据 | 状态 |
| --- | --- | --- |
| 产品定位清晰 | `README.md`、`JUDGE_GUIDE.md`、前端首页统一为“面向知乎创作者、圈主和官方号运营者的 AI 讨论组织台” | 已完成 |
| 主流程完整 | 前端 5 步：选题雷达、讨论方案准备、刘看山主持校验、发布策划、评论复盘 | 已完成 |
| 后端闭环完整 | `RoundtableWorkflowService.runFullWorkflow` 覆盖热榜、证据、校验席位、观点地图、发布草稿、确认发布、评论回流 | 已完成 |
| mock-safe 可靠 | `demo:serve:mock`、`capture:demo:auto:mock`、`ZHIHU_PROVIDER=mock` hard override、本地验证输出 `provider: mock` | 已完成 |
| live 边界可靠 | live 写操作需要后端 confirmation token；服务层默认拒绝 live 写，HTTP 消费 token 后才放行；真实写失败不会伪装 mock 成功；`.env.local` 被忽略 | 已完成 |
| UI 可路演 | 浏览器主流程已跑通，截图存在桌面和移动视口 | 已完成 |
| 文档可交付 | `README.md`、`JUDGE_GUIDE.md`、`docs/demo-day-quick-card.md`、`docs/judge-defense-matrix.md`、`docs/submission-package.md`、`docs/deployment.md`、`docs/external-closure-runbook.md`、`docs/hackathon-demo-plan.md` | 已完成 |
| 验证门禁 | `npm run verify:submission`、`npm run verify:judge`、`npm run verify:external-preflight`、`npm run audit:high` 通过；`PUBLIC_DEMO_URL=https://zhihu-roundtable.felixypz.me PUBLIC_DEMO_EXPECT_PROVIDER=live npm run verify:final` 已对当前 HEAD 通过 | 已完成 |
| 完成审计可执行化 | `npm run completion:audit` 将本页 checklist 固化为脚本，本地失败直接退出，外部交付项列为 blocker | 已完成 |
| 部署准备 | `render.yaml`、`deploy/raspberry-pi/` 模板、`npm run start`、`npm run verify:production`、`npm run verify:public:full`、`scripts/verify-production-flow.mjs`、`scripts/verify-public-demo.mjs`、`docs/deployment.md`、`docs/raspberry-pi-deployment.md`、`docs/raspberry-pi-ops-checklist.md`；公网部署后可一条命令复用 API smoke 和浏览器点击流 | 已准备 |
| 源码包兜底 | `npm run package:source` 可生成干净源码 ZIP 和 `.cache/submission/manifest.json`，并输出 HEAD commit、跟踪文件数、ZIP 实际文件数、文件大小和 sha256 | 已准备 |
| 公网 Demo URL | `https://zhihu-roundtable.felixypz.me`；公网 smoke 和公网浏览器点击流已通过 | 已完成 |
| 代码远端同步 | 当前 HEAD 已 push 到 `origin/main`；`completion:audit --strict` 验证本地 HEAD 与 upstream 一致 | 已完成 |
| 评委仓库访问 | GitHub 仓库为 public：`https://github.com/Felix201209/Zhihu-Roundtable` | 已完成 |

## 2. Prompt-to-Artifact Checklist

| 明确要求 | 对应产物 | 已检查证据 |
| --- | --- | --- |
| “可提交” | `docs/submission-package.md`、`docs/submission-form-checklist.md`、`README.md`、`JUDGE_GUIDE.md`、`scripts/print-submission-evidence.mjs` | 提交包有项目介绍、赛道、运行命令、仓库链接、部署占位、源码 ZIP 兜底和可复制提交证据 |
| “可路演” | `docs/demo-day-quick-card.md`、`docs/hackathon-demo-plan.md`、截图 artifacts | 一页式现场操作卡、6 分钟脚本、3 分钟压缩版、Q&A、本地桌面/移动截图和公网桌面/移动截图 |
| “可防追问” | `docs/judge-defense-matrix.md`、`docs/championship-redteam.md`、`docs/final-readiness-audit.md`、`docs/external-closure-runbook.md` | 尖锐追问短答、现场动作、风险、边界、live/mock、安全发布、部署缺口和外部闭环步骤已列明 |
| “产品定位清晰” | README/JUDGE/前端文案 | 旧的偏聊天表演口径已清理 |
| “主流程完整” | `src/frontend/main.tsx`、`src/backend/workflow-service.ts` | 前后端都覆盖发布前策划和发布后回流 |
| “mock-safe 与 live 边界可靠” | `src/providers/zhihu-provider.ts`、`src/backend/http-server.ts`、测试 | mock 强制覆盖 live env，live 写操作要确认 token |
| “UI/文档/验证/部署准备” | `package.json` scripts、`render.yaml`、`deploy/raspberry-pi/`、`docs/deployment.md`、`docs/raspberry-pi-deployment.md`、`docs/raspberry-pi-ops-checklist.md`、`scripts/verify-external-preflight.mjs` | 生产式本地服务、Render Blueprint、树莓派自托管路径、可复制部署模板、现场排障清单和 push 前只读外部预检已准备 |
| “不要用代理信号当完成” | `scripts/completion-audit.mjs` | 把目标拆成可检查项，并把远端同步、远端 CI、公网 Demo、评委仓库访问列为外部 blocker；private repo 可用 `REVIEWER_REPO_ACCESS_CONFIRMED=1` 表示已授权 |
| “不要泄露 key” | `.gitignore`、`git ls-files`、secret scan | `.env.local`、`.cache`、`dist`、`node_modules` 未被跟踪 |

## 3. 最新实证

当前本地 Git 状态以终端输出为准，最终复核时重新运行：

```bash
git status -sb
git log -1 --oneline
```

已通过：

```bash
npm run verify:submission
npm run evidence:submission
npm run completion:audit
npm run verify:judge
npm run verify:external-preflight
npm run audit:high
PUBLIC_DEMO_URL=https://zhihu-roundtable.felixypz.me PUBLIC_DEMO_EXPECT_PROVIDER=live npm run verify:final
```

`verify:submission` 会先跑 `verify:judge`，再跑 `completion:audit`，最后生成并检查源码 ZIP，并自动运行 `evidence:submission` 打印提交证据；打包脚本会打印 HEAD commit、文件大小和 sha256，便于提交前留存证据。`verify:judge` 覆盖：

- `npm run typecheck`
- `npm test`，9 个测试文件，64 个测试通过
- `npm run build`
- `npm run backend:demo`
- 脚本语法检查
- `scripts/verify-production-server.mjs`
- `scripts/verify-production-flow.mjs`
- `scripts/verify-public-demo.mjs`
- `scripts/verify-external-preflight.mjs`
- `scripts/verify-remote-ci.mjs`
- `scripts/package-source.mjs` 语法检查
- `npm run verify:raspberry-pi`，确认树莓派 env、systemd 和 Cloudflare Tunnel 模板 mock-safe 且端口一致

`completion:audit` 会把目标拆成产品定位、主流程、mock-safe、live 写保护、验证门禁、部署准备、提交包安全和截图 artifacts；这些本地项必须 PASS。远端同步、远端 CI、公网 Demo、评委仓库访问在未完成前会列为 BLOCKED，防止把本地绿灯误读为外部交付完成。若仓库保持 private，但已经给评委/主办方授权，可用 `PUBLIC_DEMO_URL=https://你的线上-demo域名 REVIEWER_REPO_ACCESS_CONFIRMED=1 npm run verify:final` 作为最终审计证据；其中公网 Demo 会同时跑 API smoke 和公网浏览器点击流。

源码 ZIP 输出会随最终提交 hash 改变，提交时以 `npm run package:source` 的终端输出和 `.cache/submission/manifest.json` 为准。该脚本会输出：

```text
source package ready: .cache/submission/zhihu-roundtable-source.zip
manifest: .cache/submission/manifest.json
files: <tracked source file count>
commit: <current HEAD>
size: <zip size>
sha256: <zip sha256>
```

`evidence:submission` 还会输出可提交证据块，包含当前 commit、源码包文件数/ZIP 实际文件数、sha256、截图尺寸、支撑材料、可复跑本地门禁和外部闭环命令。Markdown 版可用：

```bash
node scripts/print-submission-evidence.mjs --markdown
```

`backend:demo` 输出确认：

```text
provider: mock
stage: 评论复盘(feedback)
published: https://www.zhihu.com/pin/mock-...
```

截图文件确认：

```text
artifacts/zhihu-roundtable-desktop.png: 1440 x 1100
artifacts/zhihu-roundtable-mobile.png: 390 x 900
artifacts/zhihu-roundtable-public-desktop.png: 1440 x 1100
artifacts/zhihu-roundtable-public-mobile.png: 390 x 900
```

浏览器人工路径确认：

```text
npm run demo:serve:mock
http://localhost:5177/
```

- 首页能在首屏看到“创作者和圈主的 AI 讨论组织台”和主按钮“从热榜生成讨论方案”。
- 主流程可从首页手动点击到选题雷达、讨论方案准备、刘看山主持校验、发布策划与圈子帖预览，再经“确认发布到圈子”进入评论复盘。
- 评论复盘页显示值得回复的评论、新的反方/追问和下一篇内容方向。
- 想法试验场副线可完成：输入脑洞、生成 3 个版本、发布确认、回收反馈、生成试验报告。
- 浏览器控制台没有 React error 或 key warning；只有 Vite 连接和 React DevTools 提示。
- 检查结束后已停止本地 `8877` / `5177` 服务。

生产式浏览器路径确认：

```text
PORT=8898 ZHIHU_PROVIDER=mock npm run serve:app
http://localhost:8898/
```

- 构建后的 `dist/` 与 `/api` 由同一个 Node 进程托管。
- 生产式页面可从首页手动走完选题雷达、讨论方案准备、刘看山主持校验、发布策划与圈子帖预览、评论复盘。
- 点击“生成讨论方案”后，页面停留在“讨论方案准备”，不会因为后台 SSE 已经生成发布预览而自动跳过中间步骤。
- `scripts/verify-production-flow.mjs` 已把这条生产式 5 步点击流固化成门禁；本机有 Chrome/Chromium 时会自动启动 headless browser 验证，部署后也可设置 `PRODUCTION_FLOW_URL=https://你的线上-demo域名` 对公网 Demo 跑同一条点击流。
- 浏览器控制台没有 warning/error。
- 检查结束后已停止本地 `8898` 服务。

安全面确认：

```text
.env.local ignored by .gitignore
.cache ignored by .gitignore
dist ignored by .gitignore
node_modules ignored by .gitignore
git ls-files shows none of those paths tracked
git archive HEAD contains no real .env/.cache/dist/node_modules entries; only .env.example is included
git grep secret scan only finds .env.example placeholders and tests/local-env fake key
npm run package:source outputs .cache/submission/zhihu-roundtable-source.zip and .cache/submission/manifest.json from clean HEAD, with commit, tracked file count, archive file count, size and sha256 printed
```

GitHub 远端状态确认：

```text
repo: https://github.com/Felix201209/Zhihu-Roundtable
visibility: PUBLIC
default branch: main
current HEAD: 899f5511b5c521efc91f36c6bfcfc1eb2d6e4267
remote workflow: Verify completed/success for current HEAD
remote CI verifier: npm run verify:remote-ci -- --wait passed for current HEAD
```

公网 Demo 验收准备：

```text
PUBLIC_DEMO_URL=https://zhihu-roundtable.felixypz.me PUBLIC_DEMO_EXPECT_PROVIDER=live npm run verify:public:full
PUBLIC_DEMO_URL=https://zhihu-roundtable.felixypz.me PUBLIC_DEMO_EXPECT_PROVIDER=live npm run verify:final
```

- 公网验收会检查公网首页、前端 bundle 中的产品关键文案、`/api/health`、`/api/models`、`/api/zhihu/status` 和 `/api/oauth/status`。
- 当前公网 demo 运行在 `live` 读链路，`/api/zhihu/status` 报告知乎 app credentials、base URL、读接口缓存和 LLM JSON 缓存均开启。
- 真实写操作仍需要 confirmation token；公网浏览器流验证了首页到评论复盘的完整路径。
- OAuth callback 匹配公网域名下的 `/api/oauth/callback`。

## 4. 完成状态

当前工程已达到本地和外部高置信状态：

1. 公网 Demo URL 已可访问：`https://zhihu-roundtable.felixypz.me`。
2. 当前 HEAD 已 push，GitHub Actions Verify 对当前 HEAD 成功。
3. 仓库为 public，可供评委访问。
4. `verify:final` 严格验收已通过，`completion:audit --strict` 无 local failures 或 external blockers。
5. `/goal` 仍必须遵守用户指定的时间约束：不能在 `2026-05-13 07:30 Asia/Shanghai` 之前标记完成。

## 5. 下一步动作

在 `2026-05-13 07:30 Asia/Shanghai` 之后，做最后一次快速复核：

```bash
/Users/felix/.codex/skills/check-date-time/scripts/check-date-time.sh
git status --short
PUBLIC_DEMO_URL=https://zhihu-roundtable.felixypz.me PUBLIC_DEMO_EXPECT_PROVIDER=live npm run verify:final
```

只有这些仍然通过，才可以调用 `update_goal(status=complete)`。

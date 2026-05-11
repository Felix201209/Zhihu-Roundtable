# 知辩圆桌最终 Readiness 审计

审计日期：2026-05-12

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
| 文档可交付 | `README.md`、`JUDGE_GUIDE.md`、`docs/submission-package.md`、`docs/deployment.md`、`docs/hackathon-demo-plan.md` | 已完成 |
| 验证门禁 | `npm run verify:submission`、`npm run verify:judge`、`npm run audit:high` 通过；`npm run verify:remote-ci` 和 `npm run verify:final` 已准备给 push/部署后验收 | 已完成 |
| 完成审计可执行化 | `npm run completion:audit` 将本页 checklist 固化为脚本，本地失败直接退出，外部交付项列为 blocker | 已完成 |
| 部署准备 | `render.yaml`、`npm run start`、`npm run verify:production`、`npm run verify:public:full`、`scripts/verify-production-flow.mjs`、`scripts/verify-public-demo.mjs`、`docs/deployment.md`；公网部署后可一条命令复用 API smoke 和浏览器点击流 | 已准备 |
| 源码包兜底 | `npm run package:source` 可生成干净源码 ZIP 和 `.cache/submission/manifest.json`，并输出 HEAD commit、文件大小和 sha256 | 已准备 |
| 公网 Demo URL | 需要部署后填写 | 未完成 |
| 代码远端同步 | 当前本地分支已提交但尚未 push；以 `git status -sb`、`git log -1 --oneline` 和 `git push --dry-run origin main` 为准 | 未完成 |
| 评委仓库访问 | GitHub 仓库当前为 private；可切 public，或给评委/主办方授权后用 `REVIEWER_REPO_ACCESS_CONFIRMED=1 npm run completion:audit -- --strict` 验收 | 未完成 |

## 2. Prompt-to-Artifact Checklist

| 明确要求 | 对应产物 | 已检查证据 |
| --- | --- | --- |
| “可提交” | `docs/submission-package.md`、`docs/submission-form-checklist.md`、`README.md`、`JUDGE_GUIDE.md` | 提交包有项目介绍、赛道、运行命令、仓库链接、部署占位和源码 ZIP 兜底 |
| “可路演” | `docs/hackathon-demo-plan.md`、截图 artifacts | 6 分钟脚本、3 分钟压缩版、Q&A、桌面/移动截图 |
| “可防追问” | `docs/championship-redteam.md`、`docs/final-readiness-audit.md` | 风险、边界、live/mock、安全发布、部署缺口已列明 |
| “产品定位清晰” | README/JUDGE/前端文案 | 旧的偏聊天表演口径已清理 |
| “主流程完整” | `src/frontend/main.tsx`、`src/backend/workflow-service.ts` | 前后端都覆盖发布前策划和发布后回流 |
| “mock-safe 与 live 边界可靠” | `src/providers/zhihu-provider.ts`、`src/backend/http-server.ts`、测试 | mock 强制覆盖 live env，live 写操作要确认 token |
| “UI/文档/验证/部署准备” | `package.json` scripts、`render.yaml`、`docs/deployment.md` | 生产式本地服务与 Render Blueprint 已准备 |
| “不要用代理信号当完成” | `scripts/completion-audit.mjs` | 把目标拆成可检查项，并把远端同步、远端 CI、公网 Demo、评委仓库访问列为外部 blocker；private repo 可用 `REVIEWER_REPO_ACCESS_CONFIRMED=1` 表示已授权 |
| “不要泄露 key” | `.gitignore`、`git ls-files`、secret scan | `.env.local`、`.cache`、`dist`、`node_modules` 未被跟踪 |

## 3. 最新实证

当前本地 Git 状态以提交前终端输出为准，提交前重新运行：

```bash
git status -sb
git log -1 --oneline
```

已通过：

```bash
npm run verify:submission
npm run completion:audit
npm run verify:judge
npm run audit:high
git push --dry-run origin main
node scripts/verify-remote-ci.mjs --allow-not-pushed
```

`verify:submission` 会先跑 `verify:judge`，再跑 `completion:audit`，最后生成并检查源码 ZIP；打包脚本会打印 HEAD commit、文件大小和 sha256，便于提交前留存证据。`verify:judge` 覆盖：

- `npm run typecheck`
- `npm test`，9 个测试文件，60 个测试通过
- `npm run build`
- `npm run backend:demo`
- 脚本语法检查
- `scripts/verify-production-server.mjs`
- `scripts/verify-production-flow.mjs`
- `scripts/verify-public-demo.mjs`
- `scripts/verify-remote-ci.mjs`
- `scripts/package-source.mjs` 语法检查

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
npm run package:source outputs .cache/submission/zhihu-roundtable-source.zip and .cache/submission/manifest.json from clean HEAD, with commit, size and sha256 printed
```

GitHub 远端状态确认：

```text
repo: https://github.com/Felix201209/Zhihu-Roundtable
visibility: PRIVATE
default branch: main
last pushed: 2026-05-09T05:18:35Z
push dry-run: origin/main..HEAD main -> main passed
remote workflow: Verify active on current remote
local HEAD workflow: push, PR and manual dispatch all run npm run verify:submission
local HEAD browser gate: GitHub Actions checks Chrome/Chromium version first, then runs PRODUCTION_FLOW_REQUIRE_BROWSER=true
local HEAD package gate: GitHub Actions also runs package:source through verify:submission
remote CI verifier: npm run verify:remote-ci checks current HEAD after push; npm run verify:remote-ci -- --wait waits for GitHub Actions to create and finish the current HEAD run
remote CI precheck: no run yet for current unpushed HEAD; latest remote run was completed/success
push dry-run: origin/main..HEAD main -> main passed
note: local workflow hardening only becomes active on GitHub after push
```

公网 Demo 验收准备：

```text
PUBLIC_DEMO_URL=https://你的线上-demo域名 npm run verify:public:full
PUBLIC_DEMO_URL=https://你的线上-demo域名 REVIEWER_REPO_ACCESS_CONFIRMED=1 npm run verify:final
```

- 部署后会检查公网首页、前端 bundle 中的产品关键文案、`/api/health`、`/api/models`、`/api/zhihu/status` 和 `/api/oauth/status`。
- 默认要求线上 demo 仍是 `mock` / `mock-safe`，避免评审访问时消耗真实知乎额度或触发 live 边界风险。
- mock-safe 公网 demo 不能报告知乎 live 凭证已配置；OAuth callback 必须匹配公网域名下的 `/api/oauth/callback`。

## 4. 不能标记 Goal 完成的原因

当前工程本身已经达到本地高置信状态，但 `/goal` 要求“可提交、可路演、可防追问”。这里的“可提交”还包含外部交付闭环，因此目前不能标记完成：

1. 没有公网可访问 Demo URL。
2. 本地提交还没有 push 到远端；`git push --dry-run origin main` 已确认推送计划可行。
3. GitHub 仓库仍是 private，评委无法直接访问，除非后续授权并设置 `REVIEWER_REPO_ACCESS_CONFIRMED=1` 作为审计证据，或切 public。

## 5. 下一步动作

需要用户确认后才能做的动作：

1. push 当前本地提交到 `origin/main`。
2. 部署 Render 或其他公网服务。
3. 给评委授权 private repo，或把仓库切为 public。

确认前可继续做的本地动作：

1. 做一次人工浏览器全流程检查。
2. 等待用户确认后 push，并检查远端 CI 结果。
3. 等待用户确认后部署公网 Demo。

# 知辩圆桌外部交付闭环 Runbook

本文件只覆盖本地已经 ready 之后的外部闭环。没有完成这里的步骤前，不要把 `/goal` 标记为完成。

## 0. 当前完成定义

只有同时满足以下条件，才算“可提交、可路演、可防追问”真正完成：

1. 本地 `HEAD` 已 push 到 `origin/main`，且本地/远端 commit 完全一致。
2. GitHub Actions `Verify` 已针对当前 `HEAD` 成功。
3. 已有公网 Demo URL，且线上保持 mock-safe。
4. 公网 Demo 同时通过 API smoke 和浏览器主流程点击流。
5. GitHub 仓库已 public，或 private 仓库已给评委/主办方授权并留下审计证据。

## 1. Push 前预检

```bash
git status -sb
git log -1 --oneline
git push --dry-run origin main
npm run completion:audit
```

预期：

- 工作区 clean。
- `git push --dry-run` 显示 `main -> main`。
- `completion:audit` 本地项 PASS，外部项仍可能 BLOCKED。

## 2. 推送当前提交

需要用户明确确认后再执行：

```bash
git push origin main
```

推送后检查：

```bash
git fetch origin main --prune
git status -sb
git rev-parse HEAD
git rev-parse origin/main
```

预期：`HEAD` 与 `origin/main` 完全一致，没有 ahead/behind/diverged。

## 3. 等待远端 CI

```bash
npm run verify:remote-ci -- --wait
```

预期：

- 找到当前 `HEAD` 对应的 GitHub Actions `Verify` run。
- run 状态为 `completed/success`。
- 输出 Actions URL，留作提交证据。

## 4. 部署公网 Demo

可选 Render Blueprint：

```text
Blueprint: render.yaml
Build Command: npm ci && npm run build
Start Command: npm run start
Health Check Path: /api/health
Node: 24
```

线上环境必须保持 mock-safe：

```text
NODE_VERSION=24
ZHIHU_PROVIDER=mock
VITE_DEMO_MODEL_MODE=mock
VITE_DEMO_DEFAULT_PROVIDER=mock
VITE_DEMO_FALLBACK_TO_MOCK=true
```

不要把 `.env.local`、真实 `DEEPSEEK_API_KEY`、`ZHIHU_APP_KEY` 或 `ZHIHU_APP_SECRET` 填入 Render Blueprint。

也可以部署到树莓派，详见 [树莓派部署指南](raspberry-pi-deployment.md) 和 [树莓派公网 Demo 现场检查清单](raspberry-pi-ops-checklist.md)。树莓派路径同样必须满足：

- 已 push 的当前提交被拉到树莓派。
- 本地已通过 `npm run verify:raspberry-pi`，确认 env、systemd 和 Cloudflare Tunnel 模板仍保持 mock-safe。
- `npm ci && npm run build` 成功。
- `npm run start` 由 systemd 或等价进程管理器常驻。
- 可先复制 `deploy/raspberry-pi/` 里的 mock-safe env、systemd 和 Cloudflare Tunnel 模板。
- 公网入口代理到同一个 Node 服务，而不是只代理 `dist/`。
- 线上环境保持 `ZHIHU_PROVIDER=mock` 和 `VITE_DEMO_FALLBACK_TO_MOCK=true`。

## 5. 公网验收

拿到公网 URL 后执行：

```bash
PUBLIC_DEMO_URL=https://你的线上-demo域名 npm run verify:public:full
```

预期：

- 首页和前端 bundle 能加载。
- `/api/health`、`/api/models`、`/api/zhihu/status`、`/api/oauth/status` 正常。
- provider 为 `mock`。
- OAuth callback 等于 `https://你的线上-demo域名/api/oauth/callback`。
- 浏览器流通过：`home -> radar -> prepare -> debate -> publish -> feedback -> next-content`。

## 6. 仓库访问

二选一：

1. 将 GitHub 仓库切为 public。
2. 保持 private，但确认评委/主办方已有访问权限。

如果选择 private 授权，最终审计时设置：

```bash
REVIEWER_REPO_ACCESS_CONFIRMED=1
```

## 7. 最终严格审计

```bash
PUBLIC_DEMO_URL=https://你的线上-demo域名 REVIEWER_REPO_ACCESS_CONFIRMED=1 npm run verify:final
```

如果仓库已 public，可以省略 `REVIEWER_REPO_ACCESS_CONFIRMED=1`。

预期：

- 远端同步 PASS。
- 远端 CI PASS。
- 公网 Demo PASS。
- 评委仓库访问 PASS。
- `completion:audit -- --strict` 不再有 blocker。

全部通过后，才能调用 `update_goal({ status: "complete" })`。

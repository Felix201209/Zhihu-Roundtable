# 知辩圆桌部署指南

## 推荐路径：Render

本项目需要同时托管前端静态文件和后端 `/api`，不要只把 `dist/` 上传到静态站点。

仓库已包含 `render.yaml`，可以在 Render 里用 Blueprint 从 GitHub 仓库创建 Web Service。

注意：Render 只能部署已经推送到 GitHub/GitLab/Bitbucket 的代码。当前本地提交必须先 push 到远端；如果仓库保持 private，需要在 Render 授权 GitHub 访问该 private repo。

默认配置是 mock-safe：

- Build Command: `npm ci && npm run build`
- Start Command: `npm run start`
- Health Check Path: `/api/health`
- Node: `24`，与 `.node-version`、`package.json engines`、GitHub Actions 和 `render.yaml` 对齐。Render 官方支持用 `NODE_VERSION`、`.node-version` 或 `package.json engines` 指定 Node 版本；本项目三处都锁在 `>=24 <25` / `24`，避免线上构建漂到其他大版本。
- `ZHIHU_PROVIDER=mock`
- `VITE_DEMO_MODEL_MODE=mock`
- `VITE_DEMO_DEFAULT_PROVIDER=mock`

这条路径不会使用真实知乎 token，也不会触发真实发布。

## 本地生产式验证

```bash
npm ci
npm run build
ZHIHU_PROVIDER=mock PORT=8899 npm run start
```

验证：

```bash
curl -fsS http://127.0.0.1:8899/ >/dev/null
curl -fsS http://127.0.0.1:8899/api/health
```

也可以直接跑自动生产烟测：

```bash
npm run verify:production
```

预期：

- `/` 返回前端页面。
- `/api/health` 返回 `ok: true`，并包含 `/api/workflow/run`。
- 本机存在 Chrome/Chromium 时，会自动启动 headless browser，验证首页 -> 选题雷达 -> 讨论方案准备 -> 刘看山主持校验 -> 发布策划 -> 评论复盘这条生产式点击流。
- 点击“生成讨论方案”后，页面应停留在“讨论方案准备”，不能因为后台已生成发布预览而跳过主持校验。

## 提交表单填写

- 可运行体验链接：Render 服务公网 URL。
- 知乎登录回调地址：`https://你的线上-demo域名/api/oauth/callback`
- 代码仓库链接：GitHub 仓库 URL。

公网服务创建后，先跑：

```bash
PUBLIC_DEMO_URL=https://你的线上-demo域名 npm run verify:public:full
```

这会检查公网首页、前端 bundle 里的关键产品文案、`/api/health`、`/api/models`、`/api/zhihu/status` 和 `/api/oauth/status`，并对公网 Demo 跑同一条首页 -> 选题雷达 -> 讨论方案准备 -> 刘看山主持校验 -> 发布策划 -> 评论复盘的浏览器点击流。默认要求线上 demo 保持 `ZHIHU_PROVIDER=mock`，避免评审点击时消耗真实知乎额度或触发 live 写操作。

push 后还要确认远端 CI 针对当前 HEAD 成功；如果刚 push 完，建议使用等待模式，避免 CI 还在排队时误判失败：

```bash
npm run verify:remote-ci -- --wait
```

如果仓库保持 private，给评委/主办方授权后再跑最终严格审计：

```bash
PUBLIC_DEMO_URL=https://你的线上-demo域名 REVIEWER_REPO_ACCESS_CONFIRMED=1 npm run verify:final
```

这条命令会把远端 CI、公网 Demo、远端同步和仓库访问都纳入最终验收；其中公网 Demo 会同时验证 `verify:public` 和公网浏览器点击流。

## 切 live 前检查

只有在明确需要真实接口联调时才切 live：

```bash
ZHIHU_PROVIDER=live
ZHIHU_API_BASE_URL=https://openapi.zhihu.com
ZHIHU_APP_KEY=...
ZHIHU_APP_SECRET=...
ZHIHU_REQUIRE_CONFIRMATION=true
```

真实发布、评论和 reaction 必须经过用户确认 token。不要把真实 key 写进仓库、Render Blueprint 或提交材料。

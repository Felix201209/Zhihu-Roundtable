# 知辩圆桌树莓派部署指南

这条路径用于把知辩圆桌部署到家里的树莓派，并通过公网域名提供评委可访问的 Demo。它和 Render 路径等价：同一个 Node 进程托管 `dist/` 和 `/api`，线上默认保持 mock-safe。

## 适用场景

- 需要自托管、可控、常驻的公网 Demo。
- Render 暂时不可用，或希望避免免费实例冷启动。
- 已有树莓派、域名或 Cloudflare Tunnel。

不要把真实 `.env.local` 上传到树莓派；路演和评审默认只需要 mock 环境变量。

仓库里提供了可复制的部署模板：

- `deploy/raspberry-pi/env.production.local.example`
- `deploy/raspberry-pi/zhihu-roundtable.service.example`
- `deploy/raspberry-pi/cloudflared-config.example.yml`

修改模板后先在本机跑：

```bash
npm run verify:raspberry-pi
```

现场照着部署和排障时看 [树莓派公网 Demo 现场检查清单](raspberry-pi-ops-checklist.md)。

## 树莓派要求

- OS: Raspberry Pi OS 64-bit 或其他 64-bit Linux。
- Node: `24.x`，与 `.node-version`、GitHub Actions 和 `package.json engines` 对齐。
- npm: 随 Node 24 安装即可。
- 内存：建议 2GB 以上。
- 反向代理：推荐 Cloudflare Tunnel；也可以使用 Nginx/Caddy 代理到本机端口。

如果树莓派还没有 Node 24，推荐用 `nvm` 安装：

```bash
curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.2/install.sh | bash
source ~/.nvm/nvm.sh
nvm install 24
nvm use 24
node -v
```

## 首次部署

在树莓派上拉取已经推送到 GitHub 的当前提交：

```bash
git clone https://github.com/Felix201209/Zhihu-Roundtable.git
cd Zhihu-Roundtable
git rev-parse HEAD
npm ci
```

构建前先创建只含 mock-safe 变量的生产环境文件。可以直接复制模板：

```bash
cp deploy/raspberry-pi/env.production.local.example .env.production.local
```

模板里必须保留 `ZHIHU_PROVIDER=mock`、`VITE_DEMO_MODEL_MODE=mock`、`VITE_DEMO_DEFAULT_PROVIDER=mock` 和 `VITE_DEMO_FALLBACK_TO_MOCK=true`，这样树莓派公网 Demo 才不会误读本机 live 配置或触发真实知乎写操作。

如果已有公网域名，也可以在树莓派本机的 `.env.production.local` 里补 `PUBLIC_APP_URL=https://你的树莓派公网域名`，用于让 OAuth callback 和公网 origin 保持一致。

把变量导入当前 shell 后再构建和启动：

```bash
set -a
source .env.production.local
set +a
npm run build
npm run start
```

另开一个终端检查：

```bash
curl -fsS http://127.0.0.1:8899/ >/dev/null
curl -fsS http://127.0.0.1:8899/api/health
```

## systemd 常驻服务

确认手动启动可用后，创建 systemd service。下面假设项目目录为 `/home/pi/Zhihu-Roundtable`，Node 来自 `nvm`；如果用户名或 Node 路径不同，先用 `which node` 和 `pwd` 改成真实值。

模板见 `deploy/raspberry-pi/zhihu-roundtable.service.example`。如果用户名、项目目录或 Node 路径不同，先复制模板再改。

写入并启动：

```bash
sudo cp deploy/raspberry-pi/zhihu-roundtable.service.example /etc/systemd/system/zhihu-roundtable.service
sudo nano /etc/systemd/system/zhihu-roundtable.service
sudo systemctl daemon-reload
sudo systemctl enable --now zhihu-roundtable
sudo systemctl status zhihu-roundtable --no-pager
```

查看日志：

```bash
journalctl -u zhihu-roundtable -f
```

## Cloudflare Tunnel

推荐把公网域名通过 Cloudflare Tunnel 指向本机服务：

```bash
cloudflared tunnel create zhihu-roundtable
cloudflared tunnel route dns zhihu-roundtable zhihu-roundtable.example.com
```

`~/.cloudflared/config.yml` 可以从 `deploy/raspberry-pi/cloudflared-config.example.yml` 复制后修改域名和 `<tunnel-id>`。

安装为服务：

```bash
sudo cloudflared service install
sudo systemctl restart cloudflared
cloudflared tunnel info zhihu-roundtable
```

确认 `cloudflared tunnel info` 里有 active connection 后，再从非局域网访问公网 URL。

## 公网验收

拿到公网 URL 后，在本机或树莓派上执行：

```bash
PUBLIC_DEMO_URL=https://你的树莓派公网域名 npm run verify:public:full
```

预期：

- 首页和前端 bundle 能加载。
- `/api/health`、`/api/models`、`/api/zhihu/status`、`/api/oauth/status` 正常。
- `ZHIHU_PROVIDER` 是 `mock`。
- OAuth callback 等于 `https://你的树莓派公网域名/api/oauth/callback`。
- 浏览器流通过：`home -> radar -> prepare -> debate -> publish -> feedback -> next-content`。

## 更新部署

每次本地改完并 push 后，在树莓派上更新：

```bash
cd /home/pi/Zhihu-Roundtable
git fetch origin main
git checkout main
git pull --ff-only origin main
npm ci
set -a
source .env.production.local
set +a
npm run build
sudo systemctl restart zhihu-roundtable
sudo systemctl status zhihu-roundtable --no-pager
```

更新后重新跑：

```bash
PUBLIC_DEMO_URL=https://你的树莓派公网域名 npm run verify:public:full
```

## 切 live 前检查

评审和路演不需要 live 写。只有明确要真实联调时才添加知乎或模型密钥，并且不要写入仓库：

```bash
ZHIHU_PROVIDER=live
ZHIHU_API_BASE_URL=https://openapi.zhihu.com
ZHIHU_APP_KEY=...
ZHIHU_APP_SECRET=...
ZHIHU_REQUIRE_CONFIRMATION=true
```

真实发布、主持评论和 reaction 仍必须经过一次性 confirmation token。不要为了演示把确认保护关掉。

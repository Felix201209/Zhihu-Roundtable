# 树莓派公网 Demo 现场检查清单

这份清单用于回家部署时快速排障。它假设代码已经 push，树莓派能访问 GitHub，且公网入口走 Cloudflare Tunnel 或等价反向代理。

## 0. 不变边界

- 不上传 `.env.local`。
- 公网评审 Demo 保持 `ZHIHU_PROVIDER=mock`。
- 公网评审 Demo 保持 `VITE_DEMO_MODEL_MODE=mock`、`VITE_DEMO_DEFAULT_PROVIDER=mock`、`VITE_DEMO_FALLBACK_TO_MOCK=true`。
- 不把 `DEEPSEEK_API_KEY`、`ZHIHU_APP_KEY`、`ZHIHU_APP_SECRET` 或 OAuth secret 写进 systemd、模板或提交材料。
- 不打开真实发布、主持评论、reaction 的确认保护。

## 1. 本机出发前

```bash
git status -sb
git log -1 --oneline
npm run verify:submission
npm run verify:raspberry-pi
```

预期：

- `git status -sb` 没有未提交改动。
- `verify:submission` 通过测试、build、生产式 smoke、浏览器流、completion audit、源码包生成和提交证据打印。
- `verify:raspberry-pi` 输出 `provider: mock` 和 `port: 8899`。

如果失败：先修本地，不要上树莓派赌运气。

## 2. 树莓派基础环境

```bash
uname -m
node -v
npm -v
git --version
```

预期：

- `uname -m` 是 `aarch64` 或其他 64-bit 架构。
- `node -v` 是 `v24.x`。
- `npm` 和 `git` 都可用。

如果 Node 不是 24：

```bash
source ~/.nvm/nvm.sh
nvm install 24
nvm use 24
node -v
```

## 3. 拉取当前提交

```bash
cd /home/pi
git clone https://github.com/Felix201209/Zhihu-Roundtable.git
cd Zhihu-Roundtable
git fetch origin main
git checkout main
git pull --ff-only origin main
git rev-parse HEAD
```

预期：`git rev-parse HEAD` 等于本机准备部署的 commit。

如果仓库仍是 private：先确认树莓派上的 GitHub 凭证有读取权限，或临时用有权限的 clone URL。

## 4. mock-safe 环境文件

```bash
cp deploy/raspberry-pi/env.production.local.example .env.production.local
sed -n '1,80p' .env.production.local
```

预期看到：

```text
NODE_ENV=production
PORT=8899
STATIC_DIR=dist
ZHIHU_PROVIDER=mock
VITE_DEMO_MODEL_MODE=mock
VITE_DEMO_DEFAULT_PROVIDER=mock
VITE_DEMO_FALLBACK_TO_MOCK=true
```

如果已有公网域名，可追加：

```bash
printf '\nPUBLIC_APP_URL=https://你的树莓派公网域名\n' >> .env.production.local
```

不要追加任何真实 secret。

## 5. 构建和本机 smoke

```bash
npm ci
set -a
source .env.production.local
set +a
npm run build
npm run verify:raspberry-pi
PORT=8899 STATIC_DIR=dist ZHIHU_PROVIDER=mock npm run start
```

另开一个树莓派终端：

```bash
curl -fsS http://127.0.0.1:8899/ >/dev/null
curl -fsS http://127.0.0.1:8899/api/health
curl -fsS http://127.0.0.1:8899/api/zhihu/status
```

预期：

- 首页请求返回 0 exit code。
- `/api/health` 返回 `ok: true`。
- `/api/zhihu/status` 显示 mock provider。

如果端口占用：

```bash
lsof -i :8899
```

换端口时要同时改 `.env.production.local` 和 Cloudflare Tunnel service 地址。

## 6. systemd 常驻

```bash
which node
pwd
sudo cp deploy/raspberry-pi/zhihu-roundtable.service.example /etc/systemd/system/zhihu-roundtable.service
sudo nano /etc/systemd/system/zhihu-roundtable.service
sudo systemctl daemon-reload
sudo systemctl enable --now zhihu-roundtable
sudo systemctl status zhihu-roundtable --no-pager
```

必须核对：

- `WorkingDirectory` 是真实项目目录。
- `EnvironmentFile` 指向真实 `.env.production.local`。
- `ExecStart` 里的 Node/npm 路径来自 `which node` 所在版本目录。

如果服务启动失败：

```bash
journalctl -u zhihu-roundtable -n 120 --no-pager
```

## 7. Cloudflare Tunnel

```bash
cloudflared tunnel info zhihu-roundtable
```

预期：有 active connection。

如果还没配置：

```bash
cloudflared tunnel create zhihu-roundtable
cloudflared tunnel route dns zhihu-roundtable 你的域名
cp deploy/raspberry-pi/cloudflared-config.example.yml ~/.cloudflared/config.yml
nano ~/.cloudflared/config.yml
sudo cloudflared service install
sudo systemctl restart cloudflared
cloudflared tunnel info zhihu-roundtable
```

必须核对：

- `hostname` 是真实公网域名。
- `service` 是 `http://127.0.0.1:8899`，或和 `.env.production.local` 的 `PORT` 一致。

## 8. 公网验证

在本机或树莓派执行：

```bash
PUBLIC_DEMO_URL=https://你的树莓派公网域名 npm run verify:public:full
```

预期：

- 公网页面和 bundle 可加载。
- `/api/health`、`/api/models`、`/api/zhihu/status`、`/api/oauth/status` 正常。
- 线上仍是 mock-safe。
- 浏览器流通过 `home -> radar -> prepare -> debate -> publish -> feedback -> next-content`。

如果公网失败但本机 `127.0.0.1:8899` 成功：优先查 Cloudflare Tunnel active connection、hostname、service 端口和 DNS。

## 9. 最终闭环

远端 CI、公网 Demo 和仓库访问都准备好后，在本机执行：

```bash
PUBLIC_DEMO_URL=https://你的树莓派公网域名 REVIEWER_REPO_ACCESS_CONFIRMED=1 npm run verify:final
```

如果仓库改为 public，可省略 `REVIEWER_REPO_ACCESS_CONFIRMED=1`。

这条命令全过后，才算外部闭环完成。

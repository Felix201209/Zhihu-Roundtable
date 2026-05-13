# 路演当天速查卡

这是一页式现场卡片，用于真正开始演示前最后扫一遍。长版节奏看 `docs/hackathon-demo-plan.md`，尖锐追问看 `docs/judge-defense-matrix.md`。

## 0. 开场一句话

```text
知辩圆桌不是 AI 写回答，而是面向知乎创作者和圈子运营者的讨论组织台：把热榜变成有证据、有反方、有站队、有评论回流的圈子讨论。
```

## 1. 上台前 4 条命令

```bash
git status -sb
npm run verify:submission
npm run verify:external-preflight
npm run demo:serve:mock
```

预期：

- 工作区 clean。
- `verify:submission` 本地门禁通过，外部项只在未 push/未部署时保持 blocked。
- `verify:external-preflight` 只做 dry-run push 和只读 GitHub 检查，不会真实 push；GitHub API 抖动会先重试，仍失败才显示 warning。
- 本地 demo 地址打开后，首页主按钮是 `从热榜生成讨论方案`。

## 2. 现场点击顺序

1. 首页：讲清“刘看山主持的知乎讨论组织台”。
2. 点 `从热榜生成讨论方案`：进入选题雷达，选一个热榜话题。
3. `讨论方案准备`：展示开放问题、讨论目标、证据池、来源标签。
4. `刘看山主持校验`：展示主持、站内观点、反方校验、刘看山追问席位。
5. `发布策划与圈子帖预览`：展示站队选项、引导评论、风险提醒、人工确认和 `Mock-safe 演示模式` 安全提示。
6. `评论复盘与下一轮创作`：展示高质量评论、新反方、下一篇内容方向。
7. 展开 `技术证据`：收束到模型、节点、readiness 和验证命令。

## 3. 如果现场出问题

| 情况 | 立刻做什么 | 话术 |
| --- | --- | --- |
| 公网 URL 访问慢 | 切本机 `npm run demo:serve:mock` | “公网链路不稳定不影响项目闭环，本地 mock-safe 路径和线上服务是同一套 Node/API。” |
| 知乎 live API 或网络失败 | 保持 mock-safe，展示 provider/fallback 标记 | “读接口失败只影响 live 数据新鲜度；发布限流会明确转 mock-safe 复盘，不会伪装成真实知乎成功。” |
| 模型 key 或模型超时 | 使用 mock/fallback 输出，展示 schema 和 modelUsages | “模型不可用会显式降级，系统仍能保留结构化流程和证据边界。” |
| 时间只剩 3 分钟 | 只走热榜 -> 证据 -> 主持校验 -> 发布策划 -> 评论回流 | “我们演示的是社区讨论闭环，不是单次生成。” |
| 被追问可信度 | 打开 `docs/judge-defense-matrix.md` | “每个尖锐问题都有短答、现场动作和文件/命令证据。” |

## 4. 最后 20 秒收束

```text
完整本地门禁是 npm run verify:submission；公网部署后用 verify:public:full 和 verify:final 收口。AI 不替用户表达结论，而是帮知乎社区把一次热点组织成可持续讨论。
```

## 5. 不能说错

- 不把 mock-safe 演示说成真实知乎发帖。
- 不展示 `.env.local` 或真实 token。
- 不承诺比赛结果，只说“当前没有已知可复现实现 blocker”。
- 不说 goal 已最终完成，直到 push、远端 CI、公网 Demo 和评委仓库访问全部闭环。

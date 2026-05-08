# plan.md｜知辩圆桌最终冲刺计划

> 目标：根据当前项目、三张 Image Gen 风格参考、`DESIGN.md` 和黑客松评分标准，把未完成的部分收敛成可执行清单。后续交给 Kimi 改 UI 时，按本文件分批执行。

> 2026-05-08 更新：Phase 1-4 的第一屏收敛已落地到 `src/frontend/main.tsx` 和 `src/frontend/styles.css`。当前默认首屏已经是“热榜 / 刘看山圆桌 / 讨论沉淀”三栏，技术细节后置到折叠区。后续 Kimi 只需要继续做视觉精修，不要再把 8 个技术 panel 放回第一屏。

## 0. 最终判断

当前项目的后端和闭环已经够强，真正影响夺奖观感的是：

1. 第一屏还不够像一个“知乎会接进去的产品”。
2. 当前 UI 信息太满，评委需要学习界面。
3. 圆桌舞台有了，但还没有成为唯一记忆点。
4. 右侧能力展示太多，反而削弱“证据 / 共识 / 追问 / 发布”的核心。
5. 视觉缺少统一 icon/component kit，容易显得像临时 dashboard。

最终方向不是继续堆功能，而是：

**保留后端完整闭环，把前端压缩成一个 5 秒能懂的知乎式 AI 圆桌工作台。**

## 1. 三个风格怎么借鉴

### 风格 A：组件 / Icon Kit

参考图：

`/Users/felix/.codex/generated_images/019e02c4-ac2d-72a0-a7a0-2c6acc3f9d08/ig_01a08d94549c73c00169fd4eee40d88196a91f9725d2bb4f5a.png`

可借鉴：

- 24px 线性 icon 风格
- 知乎蓝 active、slate inactive
- source badge、status chip、score pill 的统一语言
- “热榜 / 证据 / 圆桌 / 观点 / 发布 / 评论 / 回流”的图标方向

不要照搬：

- 不要把组件全集都放进最终第一屏。
- 不要为了展示完整度而塞满各种小组件。

落地方式：

- 用 lucide-react 做统一 icon 系统，不新增重图库。
- 所有按钮和 panel header 都用 icon + 2-4 字标题。
- 高级组件只在 secondary drawer / collapsed panel 出现。

### 风格 B：复杂 Cockpit 版

参考图：

`/Users/felix/.codex/generated_images/019e02c4-ac2d-72a0-a7a0-2c6acc3f9d08/ig_01a08d94549c73c00169fd4e0dc6c88196b75a8898d68786af.png`

可借鉴：

- 产品级完整度
- 三栏结构
- 顶部流程状态
- 热榜、圆桌、证据、发布、评论回流都在同一个工作台内

不要照搬：

- 不要 tabs 太多。
- 不要右侧放 8 个 panel。
- 不要让“模型分工 / node timeline / readiness”抢走产品主线。

落地方式：

- 复杂能力保留在“技术细节 / 评分自检”折叠区。
- 路演默认只展示热榜、圆桌、讨论沉淀、发布按钮。
- 高级证据在演示时用一句话带过，不作为视觉主角。

### 风格 C：极简三栏最终版

参考图：

`/Users/felix/.codex/generated_images/019e02c4-ac2d-72a0-a7a0-2c6acc3f9d08/ig_01a08d94549c73c00169fd4ffdde9881968d007b2320e9b895.png`

这是最终 UI 的主方向。

必须保留：

- 顶部简洁导航
- 左侧 3 个热榜话题
- 中间刘看山圆桌
- 右侧“证据 / 共识 / 追问”
- 底部当前发言条
- 一个清晰主按钮：`生成圈子帖`

需要增强：

- 右侧要能进入发布确认和评论回流，不只停在总结。
- 圆桌发言要连接真实 transcript 数据。
- 热榜卡片要连接当前 workflow 的 selected topic。
- 需要保留 fallback/mock/live 状态，但用小 chip，不要大面板。

## 2. 当前完成度

### 已完成，不要重做

- 后端 workflow：热榜、议题重构、证据、Agent、观点地图、发布、评论回流。
- HTTP API：workflow run、SSE stream、quota、zhihu status、readiness。
- 模型路由：Kimi K2.6 / DeepSeek V4 / mock fallback。
- Zod schema 校验。
- 发布确认 modal。
- 评论回流数据结构。
- 前端已经能运行并截图。
- `README.md`、`DESIGN.md`、`docs/backend-contract.md`、`docs/hackathon-demo-plan.md`、`docs/submission-audit.md`。

### 现在没做完 / 需要补齐

| 模块 | 当前问题 | 最终要求 |
| --- | --- | --- |
| TopNav | 按钮太多，像后台工具 | 只保留产品名、路演模式、运行状态、一个主操作 |
| Hero | hero 太大，像 landing page | 改成 56-72px mission strip，不能抢圆桌 |
| LeftRail | 信息还可以，但视觉偏普通卡片 | 只展示 3 个话题，讨论潜力 pill 更清楚 |
| CenterStage | 圆桌可用，但“刘看山主持感”不够 | 极简主持 icon + active speaker ring + 一句主持发言 |
| RightRail | 8 个面板太满 | 默认只保留证据 / 共识 / 追问 / 主按钮 |
| Publish | 有发布 panel，但不是核心流程按钮 | 右侧主按钮直接触发发布预览/确认 |
| Feedback | 有评论回流，但藏太深 | 发布后右侧从“追问”切换到“评论回流”摘要 |
| Icon | lucide 已引入，但风格不统一 | 建立统一 icon mapping 和 header 规格 |
| Mobile | 已适配但仍偏长 | 移动端按热榜 -> 圆桌 -> 沉淀 -> 发言顺序 |
| Screenshot | 有 artifacts，但视觉不是最终态 | 改完后重新跑 `npm run capture:demo` |

## 3. 最终第一屏规格

最终第一屏只允许出现这些主要区域：

```text
┌────────────────────────────────────────────────────────────┐
│ 知辩圆桌  AI 多智能体观点实验室        路演模式   运行中      │
├────────────────────────────────────────────────────────────┤
│ 知乎热榜 -> 证据池 -> 刘看山圆桌 -> 圈子发布 -> 评论回流       │
├───────────────┬─────────────────────────────┬──────────────┤
│ 热榜话题       │ 刘看山圆桌                    │ 讨论沉淀      │
│ 3 cards       │ 4 avatars + 1 bubble          │ 证据          │
│ score pill    │ active speaker                │ 共识          │
│               │                               │ 追问          │
│               │                               │ 生成圈子帖     │
├───────────────┴─────────────────────────────┴──────────────┤
│ 当前发言：反方 正在发言  学术不端的定义本身存在模糊地带……       │
└────────────────────────────────────────────────────────────┘
```

必须 5 秒内传达：

- 左边是知乎热榜入口。
- 中间是刘看山主持 AI 圆桌。
- 右边是讨论沉淀结果。
- 底部说明 AI 正在组织讨论。
- 主按钮把结果带回圈子。

## 4. UI 执行总原则

1. **减半原则**：当前可见 panel 数量砍半，默认只展示主线。
2. **圆桌优先**：中间圆桌必须是视觉中心，不能被 readiness 或 node 抢戏。
3. **证据可信**：证据来源必须清楚，但不要把证据做成超长列表。
4. **发布确认显性**：主按钮进入发布确认，体现社区产品边界。
5. **评论回流可见**：发布后右侧出现评论回流摘要，证明闭环。
6. **技术细节后置**：模型分工、node timeline、readiness 放到折叠区或底部 secondary 区。
7. **不再做新页面**：当前阶段集中改一个 AppShell，不做复杂路由。

## 5. Kimi 改 UI 的文件边界

允许改：

- `src/frontend/main.tsx`
- `src/frontend/styles.css`
- 必要时新增 `src/frontend/components/*`
- 必要时新增 `src/frontend/ui-copy.ts` 或 `src/frontend/icons.tsx`

不要改：

- `src/backend/*`
- `src/core/*`
- `src/providers/*`
- `src/llm/*`
- `tests/backend*`
- API contract
- workflow 数据结构
- 发布确认逻辑

必须保证：

- `npm run typecheck`
- `npm test`
- `npm run build`
- `npm run capture:demo`

## 6. 分阶段任务

### Phase 1：视觉收敛，不动逻辑

目标：先把页面从“复杂 dashboard”收敛成极简三栏。

任务：

1. 去掉大 hero 的视觉重量，改成 mission strip。
2. TopNav 只保留：
   - 产品名
   - `AI 多智能体观点实验室`
   - `路演模式`
   - `运行中 / 缓存案例`
   - 一个 primary action
3. `.workspace` 改成更清楚的三栏：
   - `320px / minmax(560px, 1fr) / 420px`
4. 所有 panel 统一白底、细 border、8-12px radius。
5. 去掉 body 大渐变，改成清爽浅灰背景。
6. 把 `Readiness` 大圆环移到折叠区，不在第一屏。

验收：

- 打开页面第一眼不再像 dashboard。
- 圆桌高度和宽度足够突出。
- 顶部没有按钮拥挤。

### Phase 2：左侧热榜话题重做

目标：左侧像“热榜选择器”，不是数据表。

任务：

1. 默认只显示 3 个 topic。
2. 每个 card 显示：
   - 排名 1/2/3
   - 标题
   - `讨论潜力 92` pill
3. 只保留一句 reason，不显示多项指标。
4. selected card 使用知乎蓝边框和淡蓝底。
5. 下方只保留一个小链接：`查看完整热榜 >`
6. API 配额 / 知乎接入状态改成最底部小 chip，不占大块。

验收：

- 左栏 3 张卡清爽、有选择感。
- 评委一眼知道“从热榜开始”。

### Phase 3：中间刘看山圆桌重做

目标：让中间成为 Demo 的记忆点。

任务：

1. 圆桌 card header 显示：
   - icon
   - `刘看山圆桌`
   - 当前 stage chip
2. 圆桌里保留 4 个角色：
   - 刘看山
   - 大 V
   - 反方
   - 用户
3. 刘看山使用原创极简小狐狸/主持 icon，不用官方素材。
4. active speaker 加 2px ring 和轻微 pulse。
5. 中央只放一句主持原则：`先看证据，再谈判断。`
6. 当前发言 bubble 只显示一句，不要多 bubble。
7. 原来的 long transcript 移到底部横条。
8. bottom transcript 只显示：
   - avatar/icon
   - speaker
   - `正在发言`
   - 当前发言一句
   - 小波形 / 小进度点

验收：

- 中间没有复杂表格。
- 刘看山的位置明确是主持人。
- 发言状态一眼可见。

### Phase 4：右侧讨论沉淀重做

目标：右侧默认只讲“证据、共识、追问”，主按钮生成圈子帖。

任务：

1. `right-rail` 默认只显示一个大 panel：`讨论沉淀`。
2. 内部三张小卡：
   - 证据：2 条来源 chip，知乎站内 / 全网背景
   - 共识：最多 2 条
   - 追问：1 条高质量问题
3. `观点地图` 不作为独立大 panel，合并进共识/追问。
4. `发布预览` 不作为常驻大 panel，点击 `生成圈子帖` 后展开。
5. `评论回流` 在发布确认后替换/追加到右侧：
   - 情绪小条
   - 高质量评论 1 条
   - 下一轮圆桌 1 条
6. `Agent 任务卡 / 模型分工 / 工作流节点 / 夺奖自检` 放到 `技术细节` 折叠区。

验收：

- 右侧不超过 4 个可见块。
- 评委能迅速理解“AI 讨论最后沉淀了什么”。
- 主按钮清楚引向圈子发布。

### Phase 5：发布确认和回流强化

目标：把闭环杀手锏做得可感知。

任务：

1. 主按钮文案：`生成圈子帖`。
2. 点击后打开 modal：
   - 标题
   - 3 条以内共识
   - 3 条以内争议
   - AI 标注
   - `返回修改`
   - `确认发布到圈子`
3. 确认后：
   - 调用现有 publish workflow
   - 右侧显示 `评论回流已完成`
   - bottom strip 文案改为 `刘看山正在总结真实评论`
4. 发布按钮必须保留人工确认，不得一键自动发布。

验收：

- 现场能演示“发布前确认”。
- 发布后能看到评论回流，不只是弹个成功 toast。

### Phase 6：Icon / Component 统一

目标：吸收组件板风格，让 UI 像一套系统。

任务：

1. 建立 icon mapping：
   - 热榜：Flame 或 TrendingUp
   - 证据：FileText 或 CircleDot
   - 圆桌：UsersRound
   - 共识：CheckCircle2
   - 追问：CircleHelp
   - 发布：Send
   - 评论：MessageSquare
   - 回流：RefreshCcw
   - API：Database
   - 安全确认：ShieldCheck
2. 所有 section title 使用同样结构：
   - 24px icon
   - 16-20px title
   - 小 status chip
3. 所有 badge 统一：
   - height 26px
   - pill radius
   - soft background
4. 按钮统一：
   - primary = Zhihu blue
   - secondary = white + border
   - tertiary = text button

验收：

- 页面看起来不是临时写出来的。
- 所有 icon 风格一致。

### Phase 7：移动端和截图

目标：提交和路演都不翻车。

任务：

1. 1024px 以下改成单栏顺序：
   - TopNav
   - Mission strip
   - 热榜话题
   - 圆桌
   - 讨论沉淀
   - 当前发言
2. 移动端隐藏复杂技术细节。
3. 所有按钮不能超出宽度。
4. 圆桌 avatar 不重叠。
5. 运行截图脚本：

```bash
npm run capture:demo
```

6. 检查：
   - `artifacts/zhihu-roundtable-desktop.png`
   - `artifacts/zhihu-roundtable-mobile.png`

验收：

- 桌面截图就是最终路演画面。
- 移动端至少不丑、不溢出。

## 7. 完整任务清单

### Critical

1. 第一屏去 dashboard 化。
2. TopNav 简化。
3. Hero 改 mission strip。
4. 左栏只保留 3 个热榜话题。
5. 中间圆桌成为最大视觉焦点。
6. 右栏合并成 `讨论沉淀`。
7. 底部改成当前发言 strip。
8. 主按钮变为 `生成圈子帖`。
9. 发布确认 modal 重写文案。
10. 发布后显示评论回流摘要。
11. 技术细节全部折叠。
12. 截图重新生成。

### Important

13. 统一 icon set。
14. 统一 badge / chip。
15. 统一 panel header。
16. 统一 button hover/focus。
17. 刘看山原创 placeholder 更可爱但不幼稚。
18. active speaker pulse。
19. evidence chip 引用视觉。
20. mock/cache 状态小型化。
21. mobile 单栏优化。
22. long text clamp。
23. reduced-motion。
24. focus-visible。

### Nice To Have

25. 技术细节 drawer。
26. readiness 小型评分 chip。
27. node timeline compact view。
28. model usage compact row。
29. 一键复制发布草稿。
30. 备用路演状态 banner。

## 8. 最终 Kimi Prompt

第一轮给 Kimi：

```text
目标：按照 plan.md 和 DESIGN.md，把当前知辩圆桌前端从复杂 dashboard 收敛成极简知乎式三栏工作台。只改 UI，不改后端。

视觉参考：
- 最终第一屏采用极简三栏风格：左热榜、中圆桌、右讨论沉淀、底部当前发言。
- 组件/icon 风格借鉴 Image Gen 组件板：知乎蓝、白底、浅灰边框、24px 线性 icon。
- 复杂 cockpit 只借鉴完整度，不要照搬信息密度。

允许改：
- src/frontend/main.tsx
- src/frontend/styles.css
- 必要时新增 src/frontend/components/*

禁止改：
- src/backend/*
- src/core/*
- src/providers/*
- workflow 数据结构
- 发布确认逻辑

必须实现：
1. TopNav 简化
2. Hero 改 mission strip
3. 左侧只显示 3 个热榜 topic
4. 中间圆桌重做为简洁 2D 舞台
5. 右侧只显示证据/共识/追问和“生成圈子帖”
6. 底部当前发言 strip
7. 发布确认 modal 保留人工确认
8. 发布后显示评论回流摘要
9. 技术细节折叠，不默认展示
10. mobile 不溢出

完成后运行：
npm run typecheck
npm test
npm run build
npm run capture:demo
```

第二轮给 Kimi：

```text
目标：只做视觉 polish，不改结构。

重点：
1. icon 风格统一
2. card 间距统一
3. badge/chip 统一
4. active speaker 状态更明显
5. 刘看山 placeholder 更像主持人
6. 右侧讨论沉淀更清楚
7. 桌面截图第一眼能懂
8. 移动端无横向滚动

不要增加新功能，不要新增复杂面板。
```

第三轮给 Kimi：

```text
目标：做最终路演稳定性和截图验收。

检查：
1. 所有按钮能点击
2. 路演模式能播放
3. 生成圈子帖会弹确认 modal
4. 确认后评论回流出现
5. mock/cache 状态清楚
6. 桌面截图和移动截图都清楚

最后跑 npm run verify。
```

## 9. 验证命令

每轮 UI 改完必须跑：

```bash
npm run typecheck
npm test
npm run build
```

最终提交前跑：

```bash
npm run verify
npm run capture:demo
```

人工检查：

1. 打开本地前端。
2. 5 秒内能否看懂产品。
3. 点击 `路演模式`。
4. 点击 `生成圈子帖`。
5. 确认发布。
6. 看到评论回流。
7. 检查移动端没有横向滚动。

## 10. 绝对不要做

- 不要继续加页面。
- 不要继续堆右侧 panel。
- 不要把模型分工、node timeline、readiness 放第一屏。
- 不要改后端 workflow。
- 不要自动发布。
- 不要盗用官方刘看山素材。
- 不要做赛博朋克或 3D 场景。
- 不要用大渐变球、光污染背景。
- 不要把 UI 做成“数据监控后台”。
- 不要为了展示完成度牺牲第一眼理解。

## 11. 赢的标准

最终评委看到的不是“我们做了很多 endpoint”，而是：

> 知辩圆桌像一个知乎可以真实接入的 AI 讨论组织功能。

最终 UI 要让评委自然产生这个判断：

- 从知乎热榜开始。
- AI 先找证据。
- 刘看山主持观点碰撞。
- 结果沉淀成共识和追问。
- 用户确认后回到圈子。
- 评论还能进入下一轮。

这就是我们和普通 AI 写作助手、AI 聊天室、AI 小游戏拉开差距的地方。

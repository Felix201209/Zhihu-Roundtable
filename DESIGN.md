# DESIGN.md｜知辩圆桌 UI/UX 设计规范

> 给 Kimi / 前端实现 Agent 的唯一 UI 设计源。后续改 UI 时先读本文件，不要凭感觉重画。

## 0. 设计目标

知辩圆桌不是聊天框，不是营销落地页，也不是小游戏。它应该像一个可以接入知乎的 AI 原生讨论组织台：

**知乎产品外壳 + 刘看山圆桌舞台 + 证据/观点工作台 + 圈子回流闭环。**

评委打开 5 秒内必须看懂三件事：

1. 这是从知乎热榜开始的讨论组织工具。
2. 中间的记忆点是“刘看山主持多 Agent 圆桌”。
3. 右侧能看到证据、共识、争议、发布、评论回流，不是 AI 瞎编。

本设计参考 `/Users/felix/Desktop/styles-refero-design-clone` 的风格方法，不照搬其品牌视觉。可吸收的点是：高密度信息、清晰分栏、精确边界、语义化色彩、规格面板感、克制但高级的交互状态。

## 1. 产品气质

### North Star

**知乎热榜研究室，刘看山在圆桌中央控场。**

视觉应该像：

- 知乎站内的专业工作台
- 编辑部的选题会
- 研究员的证据墙
- 社区运营的讨论复盘面板

不应该像：

- 赛博朋克 AI 大屏
- 纯聊天机器人
- 只有 hero 的官网
- 战斗小游戏
- 随机拼 shadcn 卡片
- 跟知乎毫无关系的 Agent 玩具

## 2. 参考风格提炼

从 Refero 克隆参考库中吸收这些原则：

| 参考特征 | 在本项目中的转译 |
| --- | --- |
| 左右分栏、内容和代码/规格面板并置 | 左侧热榜，中间圆桌，右侧证据/观点/发布 inspector |
| 边界清楚、阴影克制 | 用 1px border 和浅色 surface 区分层级，少用大阴影 |
| 少量强 accent | 以知乎蓝为主，橙色只用于冲突/提醒/关键时刻 |
| 高密度但不乱 | 每个区域都有标题、状态、操作，避免大空白 |
| 设计系统文档化 | 所有颜色、间距、组件状态写成 token 和规则 |
| 工作台气质 | 第一屏直接进入可操作 cockpit，不做长篇介绍页 |

## 3. 页面信息架构

### Desktop 主屏

推荐桌面布局：`1440px` 宽度下三栏工作台。

```text
┌────────────────────────────────────────────────────────────┐
│ TopNav：产品名 / Demo 模式 / API 状态 / 主操作               │ 64px
├────────────────────────────────────────────────────────────┤
│ MissionBand：当前热榜 -> 重构问题 -> 闭环状态                │ 96-128px
├───────────────┬──────────────────────────┬─────────────────┤
│ LeftRail       │ CenterStage              │ RightInspector  │
│ 热榜/潜力评分   │ 圆桌舞台/发言流/进度       │ 证据/观点/发布/回流 │
│ 280-320px      │ minmax(620px, 1fr)       │ 360-420px       │
└───────────────┴──────────────────────────┴─────────────────┘
```

### Mobile / Narrow

移动端不需要复刻三栏，按演示顺序堆叠：

1. TopNav
2. 当前话题和讨论潜力
3. 圆桌舞台
4. 当前发言流
5. Inspector tabs：证据 / 观点 / 发布 / 回流
6. 操作栏 sticky bottom

移动端必须保证按钮文字不溢出，圆桌不被右侧面板挤压。

## 4. 设计 Tokens

### Color

不要做单一蓝色页面。知乎蓝是主动作色，其他颜色服务于“证据来源、立场、风险、状态”。

```css
:root {
  --zhihu-blue: #1772f6;
  --zhihu-blue-600: #0f66e8;
  --zhihu-blue-50: #eef6ff;

  --ink-950: #111827;
  --ink-900: #172033;
  --ink-700: #374151;
  --ink-500: #637083;
  --ink-400: #8a97aa;

  --page: #f6f8fb;
  --surface: #ffffff;
  --surface-soft: #fafbfc;
  --surface-muted: #f0f3f7;
  --border: #dfe6ef;
  --border-strong: #c9d3df;

  --support: #16a34a;
  --support-soft: #eaf7ef;
  --oppose: #dc2626;
  --oppose-soft: #fef0f0;
  --neutral: #64748b;
  --neutral-soft: #f1f5f9;
  --followup: #6d5df7;
  --followup-soft: #f2f0ff;

  --attention: #ff6a3d;
  --attention-soft: #fff2ec;
  --warning: #f59e0b;
  --warning-soft: #fff7e6;

  --mock: #94a3b8;
  --mock-soft: #f1f5f9;
}
```

### 颜色用途

| 用途 | 颜色 |
| --- | --- |
| 主按钮、当前步骤、知乎来源 | `--zhihu-blue` |
| 反方挑战、冲突点、需要裁判介入 | `--attention` |
| 支持观点 | `--support` |
| 反对观点 | `--oppose` |
| 中立/背景 | `--neutral` |
| 追问/下一轮方向 | `--followup` |
| API fallback/mock | `--mock` |
| 警告、发布前确认 | `--warning` |

### Typography

中文优先使用系统字体，保证本机和 Vercel 都稳定。

```css
--font-sans: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", "Inter", system-ui, sans-serif;
--font-mono: "JetBrains Mono", "SFMono-Regular", Consolas, monospace;
```

| Token | Size | Line Height | Weight | 用途 |
| --- | --- | --- | --- | --- |
| `display` | 36-40 | 1.12 | 700 | 仅首页/mission band 主句 |
| `title-lg` | 24-28 | 1.2 | 700 | 圆桌问题、发布标题 |
| `title` | 18-20 | 1.35 | 650 | 面板标题 |
| `body` | 14-15 | 1.65 | 400 | 正文、发言 |
| `body-sm` | 13 | 1.55 | 400 | 证据摘要、说明 |
| `caption` | 11-12 | 1.4 | 500 | tag、来源、时间 |
| `metric` | 28-44 | 1 | 750 | 讨论潜力评分 |

规则：

- 不使用 viewport-width 缩放字体。
- 不使用负 letter-spacing。
- 小面板标题不要用 hero 字号。
- 证据 ID、node ID、模型名用 mono。

### Spacing / Radius / Border

```css
--space-1: 4px;
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--space-5: 20px;
--space-6: 24px;
--space-8: 32px;

--radius-sm: 6px;
--radius-md: 8px;
--radius-lg: 12px;
--radius-pill: 999px;

--shadow-panel: 0 10px 30px rgba(15, 23, 42, 0.06);
--shadow-popover: 0 20px 50px rgba(15, 23, 42, 0.14);
```

规则：

- 页面 section 不做浮动大卡片。
- 卡片只用于重复 item、modal、独立工具块。
- 不要卡片套卡片。
- 面板边界主要用 `1px solid --border`，阴影只用于 modal / popover。
- 圆角默认 `8px`，不要到处 `24px`。

## 5. 核心区域规范

### 5.1 TopNav

用途：告诉评委这是知乎 AI 圆桌实验室，并展示 demo/API 状态。

内容：

- 左侧：`知辩圆桌` + 小副标 `知乎 AI 观点实验室`
- 中间：流程小 stepper：热榜 / 证据 / 圆桌 / 发布 / 回流
- 右侧：API 状态、Demo 模式、主按钮

视觉：

- 高度 60-64px
- 白底或 `rgba(255,255,255,0.86)`，轻 backdrop blur
- 下边框 `1px solid --border`
- 不要大 logo，不要巨型导航

### 5.2 MissionBand

用途：第一屏 5 秒理解产品，不是营销 hero。

结构：

- 左：一句话主张：`把热榜变成一场有证据、有反驳、有共识沉淀的圆桌讨论`
- 中：当前重构问题
- 右：闭环状态 chip：`知乎热榜 -> 证据池 -> AI 圆桌 -> 圈子发布 -> 评论回流`

视觉：

- 高度 96-128px
- 背景 `--surface`
- 下边框
- 可用一条很细的知乎蓝进度线，不要渐变大背景

### 5.3 LeftRail：热榜雷达

每张 HotTopicCard 必须显示：

- 标题
- 热度
- 讨论潜力分
- 争议度
- 资料丰富度
- 适合圆桌原因，最多 3 条
- 来源状态：live / cached / mock

交互：

- 点击选择话题
- 选中态左侧 3px 知乎蓝竖线
- hover 只轻微变底色，不要跳动

卡片规格：

- padding 12-14px
- gap 8px
- border-bottom 或 1px border
- 评分用小型仪表，不要大型彩虹图

### 5.4 CenterStage：圆桌主舞台

这是整个 Demo 的记忆点。必须比聊天框更像“知乎圆桌”。

组成：

1. 问题 Header：原始热榜 + 重构后的知乎式问题
2. 2D 圆桌 Canvas：刘看山 + 大 V + 反方 + 吃瓜群众
3. Debate Progress：当前 node / agent / 状态
4. Transcript：实时发言流
5. Control Bar：开始、暂停、继续、生成总结、进入发布

圆桌视觉：

- 中央桌面用浅蓝灰椭圆或圆形，不用 3D
- 四个角色围绕桌子固定位置
- 正在发言的角色有 `2px` 发光 ring 和小 pulse
- 刘看山是主持人位置，视觉权重最高
- 如果没有官方素材，用原创极简主持人占位，不要盗用官方图

刘看山状态：

| 状态 | UI 表现 |
| --- | --- |
| idle | 常态，淡蓝 ring |
| thinking | 小点 loading，轻微上下浮动 |
| speaking | 蓝色 ring + speech bubble |
| warning | 橙色 ring + “拉回证据”提示 |
| happy | 绿色小 sparkle，不要幼稚 |
| summary | 桌面中心出现 `共识沉淀` |

Transcript 规则：

- 新消息从底部进入，最多保留可视 5-7 条
- 每条消息显示 speaker、role、内容、引用证据数量
- 引用证据以 `ev_01` chip 显示，可点击/hover 对应右侧证据高亮
- 不要让长文本撑爆布局，最多 4 行，支持展开

### 5.5 RightInspector：证据/观点/发布/回流

右侧是产品可信度核心，必须信息清楚。

建议 tab：

1. `证据池`
2. `观点地图`
3. `发布预览`
4. `评论回流`
5. `Agent / Node`

#### 证据池

EvidenceCard 内容：

- 来源 badge：知乎 / 全网 / 评论 / AI 推理 / Mock
- 标题
- 一句话摘要
- 立场 tag：支持 / 反对 / 中立 / 背景
- 质量分
- 引用次数

视觉：

- 来源 badge 用蓝/橙/灰，不要全彩
- 质量分用细 progress bar
- Mock 数据必须明确标注 `缓存案例` 或 `Mock`

#### 观点地图

分组：

- 支持观点
- 反对观点
- 中立事实
- 共识
- 争议
- 待验证问题

每个观点都要显示来源：

- `来自证据 ev_03`
- `来自反方挑战`
- `来自评论回流`
- `来自 AI 推理`

不要画复杂节点图导致失控。第一版可用纵向结构化 map，局部用连接线。

#### 发布预览

必须像一条即将发布到圈子的知乎帖子草稿，而不是 markdown dump。

包含：

- 标题候选 3 个
- 开场问题
- 核心共识最多 3 条
- 主要争议最多 3 条
- 想邀请圈友讨论的问题
- AI 标注声明
- 圈子选择
- `确认发布` modal

红线：

- 不允许自动发布。
- 不允许自动发评论。
- 必须有用户确认状态。

#### 评论回流

显示：

- 评论聚类：支持 / 反对 / 补充 / 质疑 / 跑题 / 高质量观点
- 高质量评论列表
- 新争议
- 下一轮圆桌建议
- 作者反馈卡

这是黑客松闭环亮点，不要藏在角落。

## 6. 组件规格

### Buttons

Primary：

- 背景 `--zhihu-blue`
- 白字
- radius `8px`
- 高度 36-40px
- 可带 lucide icon

Secondary：

- 白底
- border `--border`
- text `--ink-700`

Danger / Warning：

- 仅用于发布确认、接口异常、情绪降温
- 不要大面积红色

Icon buttons：

- 32-36px 方形
- hover 背景 `--surface-muted`
- 必须有 aria-label / tooltip

### Badges / Tags

使用 pill 但尺寸克制：

- height 22-26px
- padding 6-8px
- font 11-12px
- 不要堆太多颜色，优先 soft background + darker text

### Panels

Panel header 固定结构：

```text
标题        状态/数量
一句短说明或当前状态
```

Panel body：

- item gap 8-10px
- 内容密度高，但每个 item 边界明确
- 不要空洞大卡

### Modal

发布确认 Modal：

- 明确显示将发布到哪个圈子
- 显示 AI 标注
- 显示“发布后会拉取评论回流分析”
- 主按钮文案：`确认发布到圈子`
- 次按钮：`返回修改`

### Empty / Loading / Error

Loading 不要只有 spinner。要显示当前节点：

- `正在拉取知乎热榜`
- `正在压缩证据`
- `反方刺客正在挑战观点`
- `评论回流分析中`

Error 要可演示：

- `知乎接口暂时不可用，正在使用缓存案例继续演示。`
- 显示 `切换到路演模式` 按钮

## 7. 动效规范

只做轻动效，强化“AI 正在组织讨论”。

必须有：

- 发言角色高亮 ring
- 刘看山 thinking 轻微浮动
- 新发言进入
- 证据卡被引用时闪一下
- 观点地图新增 item 时轻微 slide/fade
- 总结时桌面中心出现 `共识沉淀`

禁止：

- 复杂走路动画
- 3D 桌面
- 过度粒子
- 大面积渐变波浪
- 战斗/攻击特效

动效时间：

- hover/press：120-180ms
- message enter：180-240ms
- stage transition：260-360ms

必须支持 `prefers-reduced-motion`。

## 8. 文案规范

语气：知乎式、理性、清楚、略有温度。

可以说：

- `刘看山正在把争议拉回证据。`
- `这条观点缺少可验证来源。`
- `当前讨论已形成 2 条共识、3 条争议。`

不要说：

- `AI 魔法即将开始`
- `炸裂生成`
- `一键颠覆知乎`
- `自动帮你发爆款`

刘看山发言：

- 短句
- 不装专家
- 不幼稚
- 会提醒引用证据
- 会降温
- 会总结共识和争议

## 9. 关键 UX 流程

### Demo 主线

1. 打开后展示路演案例和热榜列表
2. 用户选择一个热榜
3. 展示讨论潜力评分
4. 展示原始热榜如何被重构成知乎式问题
5. 证据池生成并标注来源
6. 点击进入圆桌
7. 四个角色依次发言，右侧观点地图同步更新
8. 刘看山总结共识、争议、追问
9. 生成圈子帖草稿
10. 用户确认发布
11. 评论回流分析
12. 下一轮圆桌建议

### 失败兜底

任何 API 失败都不应中断演示：

- 热榜失败：使用缓存热榜
- 搜索失败：使用缓存证据
- 模型失败：使用 fallback 结构化结果
- 发布失败：进入模拟发布成功态并标注 `路演模式`
- 评论失败：使用缓存评论回流案例

## 10. 可访问性与响应式

必须：

- 所有按钮可键盘聚焦
- focus ring 使用 `--zhihu-blue`
- 主要文字对比度达标
- 长标题和长发言不溢出
- 移动端不能横向滚动
- 当前发言区域不遮挡操作按钮
- modal 可以 Esc 关闭

不要：

- 用颜色作为唯一状态表达
- 小于 11px 的正文
- 在按钮里塞过长中文
- hover 才能看到核心信息

## 11. Kimi 实施边界

### 可改文件

UI 阶段优先只改：

- `src/frontend/main.tsx`
- `src/frontend/styles.css`
- 必要时新增 `src/frontend/components/*`
- 必要时新增前端测试或截图脚本

### 不要改

除非明确要求，不要改：

- 后端 API route 行为
- AI workflow 状态机
- 发布确认逻辑
- mock/cache 数据语义
- `README.md`、后端 contract 文档
- package 架构和部署脚本

### 必须保留

- 热榜入口
- 议题重构
- 证据池
- 多 Agent 圆桌
- 刘看山主持状态
- 发布前人工确认
- 评论回流
- Demo/mock fallback

### 推荐执行顺序

1. 先建立 CSS tokens，不动业务逻辑
2. 重排 AppShell 三栏结构
3. 优化 TopNav 和 MissionBand
4. 重做 LeftRail HotTopicCard
5. 重做 CenterStage 圆桌视觉
6. 重做 Transcript
7. 重做 RightInspector tabs
8. 完成 EvidenceCard / ViewpointMap
9. 完成 PublishPreview / ConfirmModal
10. 完成 FeedbackPanel
11. 做移动端布局
12. 做动效和状态细节
13. 全量交互 sweep
14. 截图验收

## 12. 60 项 UI 任务清单

给多轮 vibe coding 使用，按批次交给 Kimi。

### A. 基础系统

1. 建立 CSS token：颜色、间距、圆角、字体、阴影。
2. 清理全局背景，改为知乎式浅灰工作台。
3. 统一 body 字体和 line-height。
4. 统一 button/reset/input 样式。
5. 增加 focus-visible 样式。
6. 增加 reduced-motion 分支。
7. 定义 panel、rail、stage、inspector 的基础 class。
8. 定义 badge/tag/score 的基础 class。

### B. AppShell

9. 重做 TopNav 的 64px sticky header。
10. 增加流程 stepper。
11. 增加 API/Demo 状态区。
12. 重做 MissionBand。
13. 把主布局改为三栏 grid。
14. 调整桌面最大宽度和 gutter。
15. 增加窄屏单栏布局。
16. 增加 sticky mobile action bar。

### C. 热榜雷达

17. 重做 HotTopicCard 结构。
18. 增加讨论潜力分视觉。
19. 增加热度/争议度/资料丰富度小指标。
20. 增加适合圆桌原因列表。
21. 增加选中态蓝色竖线。
22. 增加 live/cached/mock 来源 badge。
23. 优化 topic list hover/focus。
24. 保证长标题换行不撑爆。

### D. 议题准备

25. 做原始热榜到重构问题的对照块。
26. 做事实层/价值层/人群层 preview。
27. 做问题质量评分小卡。
28. 做准备节点 loading 状态。
29. 做证据生成完成态。

### E. 圆桌舞台

30. 重做 RoundTableCanvas。
31. 设计原创刘看山占位主持人。
32. 设计大 V / 反方 / 吃瓜群众 avatar。
33. 增加 speaking ring。
34. 增加 thinking pulse。
35. 增加 warning 状态。
36. 增加 summary 状态。
37. 增加桌面中心的共识沉淀提示。
38. 优化 DebateProgressStepper。
39. 增加 pause/resume/generate controls。
40. 保证 stage 在 1024px 宽度下不挤压。

### F. 发言流

41. 重做 TranscriptMessage。
42. 增加 speaker role badge。
43. 增加 evidence chip。
44. 增加长文本折叠。
45. 增加新消息进入动效。
46. 增加引用证据高亮联动。

### G. 右侧 Inspector

47. 做 Inspector tab 栏。
48. 重做 EvidenceCard。
49. 增加 evidence quality bar。
50. 增加来源/立场 tag。
51. 重做 ViewpointMap 分组。
52. 增加共识/争议/追问卡片。
53. 重做 AgentBriefCard。
54. 重做 NodeTimeline。
55. 重做 ModelUsage 面板。

### H. 发布与回流

56. 重做 PublishPreview 为知乎帖子草稿样式。
57. 增加标题候选切换。
58. 重做 ConfirmPublishModal。
59. 重做 PublishResultCard。
60. 重做 CommentClusterPanel。
61. 重做 HighQualityCommentCard。
62. 重做 NextRoundSuggestionCard。
63. 增加作者反馈卡。

### I. 验收

64. 检查桌面截图是否 5 秒可懂。
65. 检查移动端无横向滚动。
66. 检查所有按钮可点击。
67. 检查键盘 focus。
68. 检查发布必须确认。
69. 检查 mock/cache 标注清楚。
70. 运行 typecheck/test/build。
71. 生成 demo screenshots。
72. 对照本 DESIGN.md 做最终 UI review。

## 13. 验收标准

UI 完成后必须满足：

- 第一屏不是 landing page，而是可操作工作台。
- 中间圆桌有明确记忆点。
- 刘看山是主持人，不是普通聊天 bot。
- 右侧证据来源和 AI 推理边界清楚。
- 用户能看见“从知乎开始，回到知乎”的闭环。
- 发布和发评论都必须人工确认。
- 评论回流不是装饰，而是最后一个强节点。
- 视觉干净、理性、像知乎生态产品。
- 没有赛博朋克、渐变球、过度游戏化。
- 桌面和移动端都不溢出。

## 14. 给 Kimi 的执行 Prompt

```text
目标：按照 DESIGN.md 重做知辩圆桌前端 UI/UX，不改后端逻辑。

项目定位：
这是知乎 Hackathon 项目，核心是“知乎热榜 -> 证据池 -> 刘看山主持多 Agent 圆桌 -> 共识/争议 -> 圈子发布确认 -> 评论回流”。

设计原则：
严格遵守 DESIGN.md。不要做营销 landing page，不要做赛博朋克，不要做小游戏，不要盗用官方刘看山素材。第一屏必须是可操作的知乎式 AI 圆桌工作台。

允许修改：
- src/frontend/main.tsx
- src/frontend/styles.css
- 必要时新增 src/frontend/components/*
- 必要时新增前端测试

禁止修改：
- 后端 API 行为
- AI workflow 状态机
- 发布确认逻辑
- mock/cache 数据语义
- README 和后端文档

重点交付：
1. 三栏工作台布局
2. 左侧热榜雷达
3. 中间 2D 圆桌舞台
4. 右侧证据/观点/发布/回流 inspector
5. 发布确认 modal
6. 评论回流分析面板
7. 桌面与移动端响应式
8. 所有按钮真实可交互

验收：
完成后运行 npm run typecheck、npm test、npm run build。如有截图脚本，也运行截图验证。不要只改视觉，要保证现有流程仍能跑通。
```


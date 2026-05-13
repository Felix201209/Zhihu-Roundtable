import type {
  CommentInsight,
  DebateTurn,
  Evidence,
  PublishDraft,
  Topic,
  ViewpointMap,
} from "../core/types.js";

export const demoTopics: Topic[] = [
  {
    id: "ai-newcomer-evaluation",
    title: "AI 工具是否正在改变职场新人能力评价？",
    hotScore: 92,
    debateScore: 88,
    evidenceScore: 84,
    reason: "招聘、试用期和新人培养都在被 AI 协作方式重写，适合展开低敏圈子讨论。",
  },
  {
    id: "ai-resume-portfolio",
    title: "新人作品集中使用 AI 辅助，应该如何说明边界？",
    hotScore: 84,
    debateScore: 82,
    evidenceScore: 79,
    reason: "用户关心公平性、透明度和真实能力判断，容易形成多方观点。",
  },
  {
    id: "ai-workplace-mentoring",
    title: "AI 助手会削弱还是放大职场导师的价值？",
    hotScore: 78,
    debateScore: 80,
    evidenceScore: 76,
    reason: "讨论点集中在反馈质量、经验传递和新人独立解决问题能力。",
  },
];

export const demoEvidence: Record<string, Evidence[]> = {
  "ai-newcomer-evaluation": [
    {
      id: "ev-ai-output-quality",
      source: "mock",
      title: "产品团队新人任务复盘：AI 辅助提高初稿完整度",
      summary: "模拟访谈显示，新人使用 AI 后更快交付结构化初稿，但最终质量仍取决于问题拆解和业务判断。",
      stance: "support",
      qualityScore: 86,
    },
    {
      id: "ev-manager-concern",
      source: "zhihu",
      title: "管理者担心 AI 掩盖基础能力差异",
      summary: "部分回答认为，AI 会让新人文档看起来更成熟，面试和试用期需要增加追问过程与复盘证据。",
      url: "https://www.zhihu.com/question/mock-ai-newcomer",
      stance: "oppose",
      qualityScore: 81,
    },
    {
      id: "ev-skill-shift",
      source: "global",
      title: "入门岗位能力从执行熟练度转向判断与协作",
      summary: "公开趋势材料普遍提到，AI 工具让低阶执行门槛下降，同时放大沟通、验证和责任归因能力。",
      stance: "background",
      qualityScore: 83,
    },
  ],
  "ai-resume-portfolio": [
    {
      id: "ev-portfolio-disclosure",
      source: "mock",
      title: "作品集标注 AI 参与比例后，评审更关注候选人的取舍理由",
      summary: "模拟评审记录显示，清楚说明提示词、人工修改和最终决策依据，会提升可信度。",
      stance: "support",
      qualityScore: 82,
    },
    {
      id: "ev-polished-sameness",
      source: "zhihu",
      title: "大量 AI 辅助作品出现表达趋同",
      summary: "讨论中常见担忧是作品看起来完整但缺少真实约束，难以判断候选人是否经历过关键取舍。",
      url: "https://www.zhihu.com/question/mock-ai-portfolio",
      stance: "oppose",
      qualityScore: 78,
    },
    {
      id: "ev-process-proof",
      source: "global",
      title: "过程证据比最终成品更能反映能力",
      summary: "多类招聘建议都强调版本记录、失败方案和复盘说明，有助于区分工具能力与个人能力。",
      stance: "neutral",
      qualityScore: 80,
    },
  ],
  "ai-workplace-mentoring": [
    {
      id: "ev-mentor-scale",
      source: "mock",
      title: "AI 让导师反馈从答疑转向校准",
      summary: "新人先用 AI 完成低风险问题梳理，导师把时间更多放在业务背景、风险判断和组织规则。",
      stance: "support",
      qualityScore: 79,
    },
    {
      id: "ev-hidden-misunderstanding",
      source: "zhihu",
      title: "AI 可能让新人更晚暴露误解",
      summary: "一些职场回答提醒，流畅输出会掩盖概念误用，导师仍需通过追问确认新人是否真正理解。",
      url: "https://www.zhihu.com/question/mock-ai-mentor",
      stance: "oppose",
      qualityScore: 77,
    },
    {
      id: "ev-feedback-loop",
      source: "global",
      title: "高质量反馈依赖上下文和责任边界",
      summary: "工具能提供即时建议，但具体团队的优先级、风险偏好和历史经验仍需要人来解释。",
      stance: "background",
      qualityScore: 81,
    },
  ],
};

export const demoDebateTurns: Record<string, DebateTurn[]> = {
  "ai-newcomer-evaluation": [
    {
      id: "turn-liu-1",
      speaker: "liu",
      content: "我更倾向于说评价标准正在迁移：不只是看新人会不会做，还要看他会不会定义问题、验证 AI 结果。",
      evidenceIds: ["ev-ai-output-quality", "ev-skill-shift"],
      claim: "AI 放大了问题拆解和结果校验能力。",
      nextQuestion: "如果初稿都能被 AI 抬高，企业应该怎么观察真实水平？",
    },
    {
      id: "turn-expert-1",
      speaker: "expert",
      content: "试用期可以增加过程型评价，例如让新人解释需求理解、替代方案和放弃某个 AI 建议的原因。",
      evidenceIds: ["ev-manager-concern"],
      claim: "过程证据比单次交付更可靠。",
    },
    {
      id: "turn-opponent-1",
      speaker: "opponent",
      content: "但不能把工具使用能力等同于综合能力。新人如果没有基础训练，遇到异常问题时反而更容易失真。",
      evidenceIds: ["ev-manager-concern", "ev-skill-shift"],
      claim: "基础能力仍然需要单独验证。",
    },
    {
      id: "turn-public-1",
      speaker: "public",
      content: "刘看山会把追问落到规则上：公司是否应该公开 AI 使用边界，否则这场讨论很容易只停在态度表态。",
      evidenceIds: [],
      nextQuestion: "评价标准变化后，公司需要同步更新新人手册吗？",
    },
  ],
  "ai-resume-portfolio": [
    {
      id: "turn-liu-portfolio",
      speaker: "liu",
      content: "作品集可以接受 AI 辅助，但候选人必须讲清楚哪些是工具生成，哪些是自己的判断。",
      evidenceIds: ["ev-portfolio-disclosure", "ev-process-proof"],
      claim: "透明披露能降低评审误判。",
    },
    {
      id: "turn-expert-portfolio",
      speaker: "expert",
      content: "评审重点应从视觉完整度转向过程材料，例如草稿、版本变化和关键约束。",
      evidenceIds: ["ev-process-proof"],
      claim: "过程材料能还原候选人的真实贡献。",
    },
    {
      id: "turn-opponent-portfolio",
      speaker: "opponent",
      content: "如果没有统一披露标准，诚实的人可能吃亏，不披露的人反而显得更成熟。",
      evidenceIds: ["ev-polished-sameness"],
      claim: "缺少规则会制造新的不公平。",
    },
  ],
  "ai-workplace-mentoring": [
    {
      id: "turn-liu-mentor",
      speaker: "liu",
      content: "AI 可以承担即时答疑，但导师的核心价值会转到判断题：什么重要、什么危险、什么在这个团队可行。",
      evidenceIds: ["ev-mentor-scale", "ev-feedback-loop"],
      claim: "导师价值从答疑转向校准。",
    },
    {
      id: "turn-expert-mentor",
      speaker: "expert",
      content: "好的导师会要求新人带着 AI 的中间推理来讨论，而不是只交一个漂亮结论。",
      evidenceIds: ["ev-hidden-misunderstanding"],
      claim: "导师需要检查理解过程。",
    },
    {
      id: "turn-public-mentor",
      speaker: "public",
      content: "刘看山可以继续追问：AI 降低求助门槛后，导师应该检查的是答案本身，还是新人带来的问题质量？",
      evidenceIds: ["ev-mentor-scale"],
      claim: "AI 降低了求助门槛。",
    },
  ],
};

export const demoViewpointMaps: Record<string, ViewpointMap> = {
  "ai-newcomer-evaluation": {
    support: ["AI 让新人更快完成初稿，评价应重视拆解、校验和协作。", "会用 AI 本身已经成为现代工作能力的一部分。"],
    oppose: ["流畅输出可能掩盖基础薄弱。", "没有过程追问时，管理者容易高估新人独立能力。"],
    neutral: ["评价标准不是降低，而是从执行结果转向过程证据。"],
    facts: ["AI 辅助能提升初稿完整度。", "试用期仍需要观察真实问题解决过程。"],
    disputes: ["工具使用能力是否应计入核心能力。", "企业是否需要统一 AI 使用披露规范。"],
    followups: ["新人任务是否要保留 AI 使用记录？", "面试环节怎样设计低成本过程追问？"],
  },
  "ai-resume-portfolio": {
    support: ["清楚披露 AI 参与方式能提升作品集可信度。"],
    oppose: ["AI 作品趋同会削弱作品集区分度。", "没有统一规则时，诚实披露可能带来不利。"],
    neutral: ["最终成品需要和过程证据一起看。"],
    facts: ["评审者更容易从版本记录看到真实取舍。"],
    disputes: ["是否需要强制标注 AI 参与比例。", "提示词是否算作品集的一部分。"],
    followups: ["作品集模板是否应加入 AI 使用说明页？", "公司应如何定义可接受辅助？"],
  },
  "ai-workplace-mentoring": {
    support: ["AI 能承担重复答疑，让导师聚焦高价值反馈。"],
    oppose: ["新人可能被流畅答案带偏，误解更晚暴露。"],
    neutral: ["导师不会消失，但工作方式会变化。"],
    facts: ["团队上下文、优先级和风险偏好仍需要人传递。"],
    disputes: ["AI 是否会减少新人向真人求助。", "导师应该检查结论还是检查过程。"],
    followups: ["新人周会是否加入 AI 使用复盘？", "导师如何设定 AI 辅助边界？"],
  },
};

export const demoPublishDrafts: Record<string, PublishDraft> = {
  "ai-newcomer-evaluation": {
    title: "AI 工具正在改变职场新人评价，你更看重结果还是过程？",
    opening: "这条热榜适合发起一场圈子讨论：AI 让新人交付变快，但也让管理者更难判断真实能力。想邀请创作者、职场新人和管理者一起聊聊判断标准。",
    consensus: ["站 A：会用 AI 本身已经是现代工作能力。", "站 B：只看漂亮结果会高估新人独立能力。", "站 C：关键不是禁用 AI，而是保留过程证据。"],
    disputes: ["AI 使用能力是否应该成为硬性评价项。", "新人是否必须披露每一次 AI 辅助。"],
    questions: ["试用期任务怎样保留过程证据？", "管理者如何避免只看 polished output？", "新人如何证明自己不是只会复制答案？"],
    disclosure: "本文为 AI 讨论组织台辅助策划，发布前经过用户确认；演示证据和案例均为缓存数据。",
  },
  "ai-resume-portfolio": {
    title: "AI 参与作品集之后，候选人到底该怎么披露？",
    opening: "这条热榜可以转成一个很适合创作者和招聘者参与的讨论：作品集不再只是成品展示，也越来越像一次过程说明。",
    consensus: ["站 A：AI 辅助不必一概扣分。", "站 B：披露边界能提升信任。", "站 C：过程材料比单张成品更有判断价值。"],
    disputes: ["披露标准是否应统一。", "AI 生成内容占比高时是否仍能代表个人能力。"],
    questions: ["作品集应如何标注 AI 参与？", "评审是否应该要求版本记录？", "提示词和修改记录是否需要提交？"],
    disclosure: "本文为 AI 讨论组织台辅助策划，发布前经过用户确认；演示证据和案例均为缓存数据。",
  },
  "ai-workplace-mentoring": {
    title: "AI 助手普及后，职场导师的价值会变少还是变贵？",
    opening: "这条热榜适合做圈子讨论：AI 改变了新人求助路径，但导师对上下文、风险和组织经验的解释仍然不可替代。",
    consensus: ["站 A：AI 能降低基础提问门槛。", "站 B：导师价值会转向校准和复盘。", "站 C：新人仍需要暴露自己的理解过程。"],
    disputes: ["AI 是否会减少真人沟通。", "导师应该鼓励还是限制新人先问 AI。"],
    questions: ["导师如何查看 AI 中间过程？", "哪些问题必须找真人确认？", "团队是否需要 AI 使用规范？"],
    disclosure: "本文为 AI 讨论组织台辅助策划，发布前经过用户确认；演示证据和案例均为缓存数据。",
  },
};

export const demoCommentInsights: Record<string, CommentInsight> = {
  "ai-newcomer-evaluation": {
    sentiment: { support: 46, oppose: 31, neutral: 23 },
    highQualityComments: [
      "建议把新人评价拆成三栏：独立理解、AI 协作、结果校验。",
      "最怕的是不会问问题但会包装答案，面试应该追问失败路径。",
      "公司也要给规则，不能让新人自己猜哪些场景能用 AI。",
    ],
    newDisputes: ["是否应要求新人提交 AI 对话记录。", "基础岗位是否会因此更难进入。"],
    nextRoundSuggestions: ["下一轮圈子话题：新人如何证明自己不是只会复制 AI 答案？", "下一篇内容方向：整理一份试用期 AI 使用披露模板。"],
  },
  "ai-resume-portfolio": {
    sentiment: { support: 39, oppose: 37, neutral: 24 },
    highQualityComments: [
      "披露不应该只写“用了 AI”，而要写 AI 帮了哪一步。",
      "评审可以给同一个约束现场追问，能看出是不是本人做的。",
    ],
    newDisputes: ["AI 作品集是否需要行业统一标签。", "提示词能力是否属于创作能力。"],
    nextRoundSuggestions: ["下一轮圈子话题：作品集里提示词和修改记录算不算作品的一部分？", "下一篇内容方向：整理一份作品集 AI 披露模板。"],
  },
  "ai-workplace-mentoring": {
    sentiment: { support: 52, oppose: 22, neutral: 26 },
    highQualityComments: [
      "导师不是答案机，真正有价值的是帮新人理解为什么这个团队这样做。",
      "AI 先问一轮很好，但新人要带着自己的判断来问导师。",
    ],
    newDisputes: ["AI 是否会让新人减少主动沟通。", "导师是否有义务检查 AI 使用过程。"],
    nextRoundSuggestions: ["下一轮圈子话题：新人周报要不要加入 AI 使用复盘？", "下一篇内容方向：写一份导师检查 AI 中间过程的操作清单。"],
  },
};

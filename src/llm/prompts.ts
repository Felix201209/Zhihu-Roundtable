import type {
  CommentInsight,
  AgentBrief,
  DebateTurn,
  Evidence,
  EvidencePool,
  IdeaVariant,
  PublishDraft,
  Topic,
  VariantFeedback,
  ViewpointMap,
} from "../core/types.js";

export type LlmMessage = {
  role: "system" | "user";
  content: string;
};

export type LlmPrompt = {
  task:
    | "question_rewrite"
    | "topic_scoring"
    | "evidence_pool"
    | "agent_briefing"
    | "agent_turn"
    | "consensus"
    | "publish_draft"
    | "comment_analysis"
    | "idea_variants"
    | "experiment_report";
  messages: LlmMessage[];
  responseSchemaName: string;
};

export type AgentPersona = DebateTurn["speaker"];

const jsonSystemPrompt = [
  "你是知乎创作者和圈子运营者的 AI 讨论组织助手。",
  "只输出一个合法 JSON 对象，不要 Markdown，不要代码块，不要额外解释。",
  "凡是涉及事实、引用、案例或统计，必须使用输入 evidence 里的 evidenceIds。",
  "不能伪造来源、链接、数据、机构、人名或未提供的证据。",
  "目标不是总结热点，也不是替用户写回答，而是帮助创作者把话题组织成可发布、可站队、可回流的圈子讨论。",
  "语气要像知乎高质量讨论策划：克制、具体、讲证据，允许保留分歧，并明确下一步行动。",
].join("\n");

const formatEvidence = (evidence: Evidence[]) =>
  evidence
    .map(
      (item) =>
        [
          `- id: ${item.id}`,
          `  source: ${item.source}`,
          `  title: ${item.title}`,
          `  stance: ${item.stance}`,
          `  qualityScore: ${item.qualityScore}`,
          `  summary: ${item.summary}`,
          item.url ? `  url: ${item.url}` : undefined,
        ]
          .filter(Boolean)
          .join("\n"),
    )
    .join("\n");

const formatTurns = (turns: DebateTurn[]) =>
  turns
    .map(
      (turn) =>
        `- ${turn.speaker}(${turn.id}) evidence=[${turn.evidenceIds.join(", ")}]: ${turn.content}`,
    )
    .join("\n");

const formatTopic = (topic: Topic) =>
  [
    `id: ${topic.id}`,
    `title: ${topic.title}`,
    `hotScore: ${topic.hotScore}`,
    `debateScore: ${topic.debateScore}`,
    `evidenceScore: ${topic.evidenceScore}`,
    `reason: ${topic.reason}`,
  ].join("\n");

export const buildQuestionRewritePrompt = (input: {
  topic: Topic;
  evidence?: Evidence[];
}): LlmPrompt => ({
  task: "question_rewrite",
  responseSchemaName: "QuestionRewriteJson",
  messages: [
    { role: "system", content: jsonSystemPrompt },
    {
      role: "user",
      content: [
        "请把候选知乎热点改写成一个适合圈子讨论的开放问题。",
        "输出 JSON 字段：rewrittenQuestion(string), rationale(string), evidenceIds(string[])。",
        "rewrittenQuestion 必须压缩成一句短问题，建议 18-36 个中文字符，最多 48 个中文字符。",
        "rewrittenQuestion 要开放、可站队、可邀请真实经验，不能只是新闻标题或摘要。",
        "不要把背景材料、项目名单、解释性长句塞进 rewrittenQuestion；背景放进 rationale。",
        "evidenceIds 只能来自输入 evidence；没有证据就输出空数组。",
        "",
        "topic:",
        formatTopic(input.topic),
        "",
        "evidence:",
        formatEvidence(input.evidence ?? []),
      ].join("\n"),
    },
  ],
});

export const buildTopicScoringPrompt = (input: { topics: Topic[] }): LlmPrompt => ({
  task: "topic_scoring",
  responseSchemaName: "TopicScore[]",
  messages: [
    { role: "system", content: jsonSystemPrompt },
    {
      role: "user",
      content: [
        "请为知乎热榜候选话题做讨论组织潜力评分。",
        "输出必须是 JSON 数组，每项符合 TopicScore：topicId, debateScore, evidenceScore, discussionPotential, controversyLevel, reason。",
        "评分标准：事实复杂度、争议程度、知乎讨论参与空间、圈子讨论适配度、资料丰富度、刘看山能否继续追问出下一轮内容。",
        "过滤纯娱乐、纯广告、信息不足、强敏感风险话题；但不要删除输入，只通过低分和 reason 表达。",
        "",
        "topics:",
        input.topics.map((topic) => formatTopic(topic)).join("\n---\n"),
      ].join("\n"),
    },
  ],
});

export const buildEvidencePoolPrompt = (input: {
  topic: Topic;
  rawEvidence: Evidence[];
}): LlmPrompt => ({
  task: "evidence_pool",
  responseSchemaName: "EvidencePool",
  messages: [
    { role: "system", content: jsonSystemPrompt },
    {
      role: "user",
      content: [
        "请把知乎站内证据和全网背景整理成证据池。",
        "输出必须符合 EvidencePool JSON：evidence, stancePreview, warnings。",
        "evidence 中每条只能来自输入 rawEvidence；可以压缩 summary、修正 stance、调整 qualityScore，但不能新造来源、URL 或 id。",
        "stancePreview 要给右侧面板直接展示：support/oppose/neutral/background。",
        "warnings 写证据不足、来源偏单一、需要人工确认等风险。",
        "",
        "topic:",
        formatTopic(input.topic),
        "",
        "rawEvidence:",
        formatEvidence(input.rawEvidence),
      ].join("\n"),
    },
  ],
});

export const buildAgentBriefingPrompt = (input: {
  topic: Topic;
  rewrittenQuestion: string;
  evidencePool: EvidencePool;
}): LlmPrompt => ({
  task: "agent_briefing",
  responseSchemaName: "AgentBrief[]",
  messages: [
    { role: "system", content: jsonSystemPrompt },
    {
      role: "user",
      content: [
        "请为知乎讨论组织台生成四个前台席位的任务卡。",
        "输出必须是 AgentBrief 数组，speaker 必须且仅包含 liu、expert、opponent、public。",
        "刘看山是讨论主持人和圈子控场员；expert 是站内观点席，只能基于站内公开内容和证据池提炼已有观点结构；opponent 是反方校验席；public 是刘看山追问席，用知乎主持人的口吻提出开放追问，不代表具体普通用户发言。",
        "每个 brief 必须包含 mission、tone、mustUseEvidenceIds、avoid。",
        "avoid 必须强调不人身攻击、不伪造证据、不伪造具体知乎用户或大 V、不自动替用户发布。",
        "",
        "topic:",
        formatTopic(input.topic),
        "",
        `rewrittenQuestion: ${input.rewrittenQuestion}`,
        "",
        "evidencePool:",
        JSON.stringify(input.evidencePool, null, 2),
      ].join("\n"),
    },
  ],
});

export const buildAgentTurnPrompt = (input: {
  topic: Topic;
  rewrittenQuestion: string;
  speaker: AgentPersona;
  evidence: Evidence[];
  brief?: AgentBrief;
  priorTurns: DebateTurn[];
}): LlmPrompt => ({
  task: "agent_turn",
  responseSchemaName: "DebateTurn",
  messages: [
    { role: "system", content: jsonSystemPrompt },
    {
      role: "user",
      content: [
        `请以 ${input.speaker} 的身份生成一轮知乎讨论组织校验发言。`,
        "输出必须符合 DebateTurn JSON：id, speaker, content, evidenceIds, claim?, nextQuestion?。",
        "content 要服务于创作者发起讨论：指出问题是否可讨论、站队是否清楚、评论区可能怎么回应；每个事实性判断都要能追到 evidenceIds。",
        "不要引用 evidence 中没有的来源；如果证据不足，要明确说证据不足。",
        "",
        "topic:",
        formatTopic(input.topic),
        "",
        `rewrittenQuestion: ${input.rewrittenQuestion}`,
        "",
        "brief:",
        input.brief ? JSON.stringify(input.brief, null, 2) : "未提供，按 speaker 默认职责发言。",
        "",
        "evidence:",
        formatEvidence(input.evidence),
        "",
        "priorTurns:",
        formatTurns(input.priorTurns),
      ].join("\n"),
    },
  ],
});

export const buildConsensusPrompt = (input: {
  topic: Topic;
  rewrittenQuestion: string;
  evidence: Evidence[];
  turns: DebateTurn[];
}): LlmPrompt => ({
  task: "consensus",
  responseSchemaName: "ViewpointMap",
  messages: [
    { role: "system", content: jsonSystemPrompt },
    {
      role: "user",
      content: [
        "请归纳这场讨论策划的观点地图。",
        "输出必须符合 ViewpointMap JSON：support, oppose, neutral, facts, disputes, followups。",
        "facts 只能写有 evidenceIds 支撑的事实；disputes 要保留真实分歧，不要强行和稀泥。",
        "followups 要像知乎圈子下一轮追问，具体、能引导评论或下一篇创作。",
        "",
        "topic:",
        formatTopic(input.topic),
        "",
        `rewrittenQuestion: ${input.rewrittenQuestion}`,
        "",
        "evidence:",
        formatEvidence(input.evidence),
        "",
        "turns:",
        formatTurns(input.turns),
      ].join("\n"),
    },
  ],
});

export const buildPublishDraftPrompt = (input: {
  topic: Topic;
  rewrittenQuestion: string;
  evidence: Evidence[];
  turns: DebateTurn[];
  viewpointMap: ViewpointMap;
}): LlmPrompt => ({
  task: "publish_draft",
  responseSchemaName: "PublishPackage",
  messages: [
    { role: "system", content: jsonSystemPrompt },
    {
      role: "user",
      content: [
        "请生成可发布到知乎圈子的讨论帖草稿和发布质量判断。",
        "输出必须符合 PublishPackage JSON：draft, titleOptions, quality。",
        "draft 必须符合 PublishDraft：title, opening, consensus, disputes, questions, disclosure。",
        "title 要像一个能引发圈子回复的开放问题；opening 必须像知乎主持人的发帖开场：有真实语气、可站队、可追问，不要写成结论文章或产品说明。",
        "consensus 用作站队选项或可讨论立场，格式尽量写成「A 站：...」「B 站：...」；disputes 写反方和风险；questions 写引导评论和下一轮追问。",
        "必须邀请不同人群参与，例如创作者、圈主/运营者、亲历者、反方和补充资料的人；不能预设唯一答案。",
        "disclosure 只能是一句很短的末尾标注，不能抢正文戏份；不要写成安全公告或产品说明。",
        "titleOptions 给 3 个标题候选；quality 判断这条讨论帖是否值得发布到圈子，以及有哪些跑偏/引战风险。",
        "",
        "topic:",
        formatTopic(input.topic),
        "",
        `rewrittenQuestion: ${input.rewrittenQuestion}`,
        "",
        "evidence:",
        formatEvidence(input.evidence),
        "",
        "turns:",
        formatTurns(input.turns),
        "",
        "viewpointMap:",
        JSON.stringify(input.viewpointMap, null, 2),
      ].join("\n"),
    },
  ],
});

export const buildCommentAnalysisPrompt = (input: {
  publishDraft: PublishDraft;
  comments: string[];
}): LlmPrompt => ({
  task: "comment_analysis",
  responseSchemaName: "CommentInsight",
  messages: [
    { role: "system", content: jsonSystemPrompt },
    {
      role: "user",
      content: [
        "请把知乎评论反馈分析成创作者下一步行动指南。",
        "输出必须符合 CommentInsight JSON：sentiment, highQualityComments, newDisputes, nextRoundSuggestions。",
        "sentiment 用非负数字计数或权重；不要臆造评论中没有的新观点。",
        "highQualityComments 只摘取输入评论里的高质量内容，可做轻微概括，并优先保留真实经验、补充资料和可追问评论。",
        "newDisputes 写新的反方、质疑或跑偏风险。",
        "nextRoundSuggestions 要能直接变成下一轮圈子话题、下一篇回答/文章选题或刘看山追问。",
        "",
        "publishDraft:",
        JSON.stringify(input.publishDraft, null, 2),
        "",
        "comments:",
        input.comments.map((comment, index) => `- c${index + 1}: ${comment}`).join("\n"),
      ].join("\n"),
    },
  ],
});

export const buildIdeaVariantsPrompt = (input: {
  idea: string;
  similarEvidence?: Evidence[];
  hotTopics?: Topic[];
}): LlmPrompt => ({
  task: "idea_variants",
  responseSchemaName: "IdeaVariant[]",
  messages: [
    { role: "system", content: jsonSystemPrompt },
    {
      role: "user",
      content: [
        "请把用户的一个脑洞改写成 3 个可发到知乎圈子测试的产品版本。",
        "输出必须是合法 JSON 对象，唯一顶层字段为 variants。",
        "variants 必须是数组，长度为 3，id 必须分别是 A、B、C。",
        "每项必须符合 IdeaVariant：id, title, oneLiner, highlight, risk。",
        "title 要短，oneLiner 要一眼能懂，highlight 写为什么可能有人感兴趣，risk 写为什么可能失败。",
        "A 通常偏效率工具，B 通常偏防撞/实用，C 通常偏社区众测/知乎感；但要贴合用户输入。",
        "不要输出超过 3 个版本，不要写长段落。",
        "",
        `idea: ${input.idea}`,
        "",
        "zhihuSimilarEvidence:",
        formatEvidence(input.similarEvidence ?? []),
        "",
        "hotTopics:",
        (input.hotTopics ?? []).slice(0, 5).map((topic) => formatTopic(topic)).join("\n---\n"),
      ].join("\n"),
    },
  ],
});

export const buildExperimentReportPrompt = (input: {
  idea: string;
  variants: IdeaVariant[];
  feedback: VariantFeedback[];
}): LlmPrompt => ({
  task: "experiment_report",
  responseSchemaName: "ExperimentReport",
  messages: [
    { role: "system", content: jsonSystemPrompt },
    {
      role: "user",
      content: [
        "请根据知乎圈子实验反馈生成最终决策报告。",
        "输出必须符合 ExperimentReport JSON：recommendedVariantId, recommendedTitle, conclusion, whyWinner, userConcerns, finalPositioning, pitchLine, mvpFeatures, nextActions。",
        "结论要直接，不要只说分数；要把真实社区反馈转成产品方向、MVP 和路演表达。",
        "whyWinner 只写能从 feedback 看出的原因；userConcerns 必须来自评论和当前判断。",
        "nextActions 固定保持 3 条以内。",
        "",
        `idea: ${input.idea}`,
        "",
        "variants:",
        JSON.stringify(input.variants, null, 2),
        "",
        "feedback:",
        JSON.stringify(input.feedback, null, 2),
      ].join("\n"),
    },
  ],
});

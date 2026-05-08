import type {
  CommentInsight,
  AgentBrief,
  DebateTurn,
  Evidence,
  EvidencePool,
  PublishDraft,
  Topic,
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
    | "comment_analysis";
  messages: LlmMessage[];
  responseSchemaName: string;
};

export type AgentPersona = DebateTurn["speaker"];

const jsonSystemPrompt = [
  "你是知乎圆桌讨论的结构化写作助手。",
  "只输出一个合法 JSON 对象，不要 Markdown，不要代码块，不要额外解释。",
  "凡是涉及事实、引用、案例或统计，必须使用输入 evidence 里的 evidenceIds。",
  "不能伪造来源、链接、数据、机构、人名或未提供的证据。",
  "语气要像知乎高质量讨论：克制、具体、讲证据，允许保留分歧。",
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
        "请把候选知乎热点改写成一个适合圆桌讨论的问题。",
        "输出 JSON 字段：rewrittenQuestion(string), rationale(string), evidenceIds(string[])。",
        "rewrittenQuestion 要开放、可辩、不过度标题党。",
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
        "请为知乎热榜候选话题做讨论潜力评分。",
        "输出必须是 JSON 数组，每项符合 TopicScore：topicId, debateScore, evidenceScore, discussionPotential, controversyLevel, reason。",
        "评分标准：事实复杂度、争议程度、公众相关性、知乎讨论适配度、资料丰富度。",
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
        "请为知乎 AI 圆桌生成四个前台 Agent 的任务卡。",
        "输出必须是 AgentBrief 数组，speaker 必须且仅包含 liu、expert、opponent、public。",
        "刘看山是主持人和社区气氛调节器；expert 是知乎大 V；opponent 是反方刺客；public 是吃瓜群众。",
        "每个 brief 必须包含 mission、tone、mustUseEvidenceIds、avoid。",
        "avoid 必须强调不人身攻击、不伪造证据、不自动替用户发布。",
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
        `请以 ${input.speaker} 的身份生成一轮知乎圆桌发言。`,
        "输出必须符合 DebateTurn JSON：id, speaker, content, evidenceIds, claim?, nextQuestion?。",
        "content 要像知乎讨论，不站上帝视角；每个事实性判断都要能追到 evidenceIds。",
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
        "请归纳圆桌讨论的观点地图。",
        "输出必须符合 ViewpointMap JSON：support, oppose, neutral, facts, disputes, followups。",
        "facts 只能写有 evidenceIds 支撑的事实；disputes 要保留真实分歧，不要强行和稀泥。",
        "followups 要像知乎追问，具体、可继续讨论。",
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
        "请生成可发布到知乎圈子的讨论草稿和发布质量判断。",
        "输出必须符合 PublishPackage JSON：draft, titleOptions, quality。",
        "draft 必须符合 PublishDraft：title, opening, consensus, disputes, questions, disclosure。",
        "title 像知乎问题或圆桌标题；opening 克制引入，不夸大。",
        "consensus/disputes/questions 都必须基于输入讨论和证据。",
        "disclosure 必须说明这是 AI 辅助整理，并说明不伪造来源。",
        "titleOptions 给 3 个标题候选；quality 判断这场讨论是否值得发布到圈子。",
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
        "请分析知乎评论反馈。",
        "输出必须符合 CommentInsight JSON：sentiment, highQualityComments, newDisputes, nextRoundSuggestions。",
        "sentiment 用非负数字计数或权重；不要臆造评论中没有的新观点。",
        "highQualityComments 只摘取输入评论里的高质量内容，可做轻微概括。",
        "nextRoundSuggestions 要能指导下一轮圆桌追问。",
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

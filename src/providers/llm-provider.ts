import type {
  AgentBrief,
  CommentInsight,
  DebateTurn,
  Evidence,
  EvidencePool,
  ModelPolicy,
  ModelProviderName,
  ModelRole,
  ModelUsage,
  PublishDraft,
  PublishPackage,
  Topic,
  TopicScore,
  ViewpointMap,
} from "../core/types.js";
import {
  buildAgentBriefingPrompt,
  buildAgentTurnPrompt,
  buildCommentAnalysisPrompt,
  buildConsensusPrompt,
  buildEvidencePoolPrompt,
  buildPublishDraftPrompt,
  buildQuestionRewritePrompt,
  buildTopicScoringPrompt,
  type AgentPersona,
  type LlmPrompt,
} from "../llm/prompts.js";
import {
  parseAgentBriefs,
  parseCommentInsight,
  parseDebateTurn,
  parseEvidencePool,
  parsePublishDraft,
  parsePublishPackage,
  parseQuestionRewrite,
  parseTopicScores,
  parseViewpointMap,
} from "../llm/schemas.js";

export type LlmProviderRole = ModelRole;

export type LlmProviderProfile = {
  provider: ModelProviderName;
  model: string;
  preferredRoles: LlmProviderRole[];
};

export type RewriteQuestionResult = {
  rewrittenQuestion: string;
  rationale: string;
  evidenceIds: string[];
};

export type LlmCallResult<T> = {
  value: T;
  usage: ModelUsage;
};

export interface LlmProvider {
  readonly profile: LlmProviderProfile;
  scoreTopics(input: { topics: Topic[] }): Promise<LlmCallResult<TopicScore[]>>;
  rewriteQuestion(input: { topic: Topic; evidence?: Evidence[] }): Promise<LlmCallResult<RewriteQuestionResult>>;
  buildEvidencePool(input: { topic: Topic; rawEvidence: Evidence[] }): Promise<LlmCallResult<EvidencePool>>;
  buildAgentBriefs(input: {
    topic: Topic;
    rewrittenQuestion: string;
    evidencePool: EvidencePool;
  }): Promise<LlmCallResult<AgentBrief[]>>;
  generateAgentTurn(input: {
    topic: Topic;
    rewrittenQuestion: string;
    speaker: AgentPersona;
    evidence: Evidence[];
    brief?: AgentBrief;
    priorTurns: DebateTurn[];
  }): Promise<LlmCallResult<DebateTurn>>;
  buildConsensus(input: {
    topic: Topic;
    rewrittenQuestion: string;
    evidence: Evidence[];
    turns: DebateTurn[];
  }): Promise<LlmCallResult<ViewpointMap>>;
  buildPublishPackage(input: {
    topic: Topic;
    rewrittenQuestion: string;
    evidence: Evidence[];
    turns: DebateTurn[];
    viewpointMap: ViewpointMap;
  }): Promise<LlmCallResult<PublishPackage>>;
  buildPublishDraft(input: {
    topic: Topic;
    rewrittenQuestion: string;
    evidence: Evidence[];
    turns: DebateTurn[];
    viewpointMap: ViewpointMap;
  }): Promise<LlmCallResult<PublishDraft>>;
  analyzeComments(input: {
    publishDraft: PublishDraft;
    comments: string[];
  }): Promise<LlmCallResult<CommentInsight>>;
}

export const DEFAULT_MODEL_POLICY: ModelPolicy = {
  mode: "mock",
  kimiModel: "kimi-k2.6",
  deepseekFlashModel: "deepseek-v4-flash",
  deepseekProModel: "deepseek-v4-pro",
  defaultProvider: "mock",
  roleMap: {
    topic_scoring: "deepseek-v4-flash",
    question: "deepseek-v4-pro",
    evidence: "kimi",
    briefing: "deepseek-v4-flash",
    debate: "kimi",
    synthesis: "deepseek-v4-pro",
    publish: "deepseek-v4-pro",
    feedback: "deepseek-v4-flash",
  },
  fallbackToMock: true,
};

function usage(profile: LlmProviderProfile, role: ModelRole, task: string, fallbackUsed = false): ModelUsage {
  return {
    provider: profile.provider,
    model: profile.model,
    role,
    task,
    fallbackUsed,
  };
}

function cloneEvidence(evidence: Evidence): Evidence {
  return { ...evidence };
}

function stancePreview(evidence: Evidence[]): EvidencePool["stancePreview"] {
  return {
    support: evidence.filter((item) => item.stance === "support").map((item) => item.summary),
    oppose: evidence.filter((item) => item.stance === "oppose").map((item) => item.summary),
    neutral: evidence.filter((item) => item.stance === "neutral").map((item) => item.summary),
    background: evidence.filter((item) => item.stance === "background").map((item) => item.summary),
  };
}

function parseJsonContent(content: string): unknown {
  const trimmed = content.trim();

  try {
    return JSON.parse(trimmed);
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
    if (fenced) {
      return JSON.parse(fenced);
    }

    const first = trimmed.indexOf("{");
    const last = trimmed.lastIndexOf("}");
    if (first >= 0 && last > first) {
      return JSON.parse(trimmed.slice(first, last + 1));
    }

    const arrayFirst = trimmed.indexOf("[");
    const arrayLast = trimmed.lastIndexOf("]");
    if (arrayFirst >= 0 && arrayLast > arrayFirst) {
      return JSON.parse(trimmed.slice(arrayFirst, arrayLast + 1));
    }

    throw new Error("模型返回不是可解析 JSON。");
  }
}

export class MockLlmProvider implements LlmProvider {
  readonly profile: LlmProviderProfile = {
    provider: "mock",
    model: "demo-safe-structured-mock",
    preferredRoles: [
      "topic_scoring",
      "question",
      "evidence",
      "briefing",
      "debate",
      "synthesis",
      "publish",
      "feedback",
    ],
  };

  private lastPrompt?: LlmPrompt;

  getLastPrompt(): LlmPrompt | undefined {
    return this.lastPrompt;
  }

  async scoreTopics(input: { topics: Topic[] }): Promise<LlmCallResult<TopicScore[]>> {
    this.lastPrompt = buildTopicScoringPrompt(input);
    const value = parseTopicScores(
      input.topics.map((topic) => ({
        topicId: topic.id,
        debateScore: topic.debateScore,
        evidenceScore: topic.evidenceScore,
        discussionPotential: topic.discussionPotential ?? Math.round((topic.debateScore + topic.evidenceScore) / 2),
        controversyLevel:
          topic.controversyLevel ?? (topic.debateScore >= 86 ? "high" : topic.debateScore >= 75 ? "medium" : "low"),
        reason: topic.reason,
      })),
    );

    return { value, usage: usage(this.profile, "topic_scoring", "topic_scoring") };
  }

  async rewriteQuestion(input: { topic: Topic; evidence?: Evidence[] }): Promise<LlmCallResult<RewriteQuestionResult>> {
    this.lastPrompt = buildQuestionRewritePrompt(input);
    const evidenceIds = (input.evidence ?? []).slice(0, 3).map((item) => item.id);
    const value = parseQuestionRewrite({
      rewrittenQuestion: `${input.topic.title}：企业和用户应该如何重新界定真实能力？`,
      rationale: "把热榜标题改成开放问题，保留事实层、价值层和规则层的讨论空间。",
      evidenceIds,
    });

    return { value, usage: usage(this.profile, "question", "question_rewrite") };
  }

  async buildEvidencePool(input: { topic: Topic; rawEvidence: Evidence[] }): Promise<LlmCallResult<EvidencePool>> {
    this.lastPrompt = buildEvidencePoolPrompt(input);
    const evidence = input.rawEvidence.map(cloneEvidence);
    const value = parseEvidencePool({
      evidence,
      stancePreview: stancePreview(evidence),
      warnings: evidence.length < 3 ? ["当前证据数量偏少，建议现场使用缓存案例兜底。"] : [],
    });

    return { value, usage: usage(this.profile, "evidence", "evidence_pool") };
  }

  async buildAgentBriefs(input: {
    topic: Topic;
    rewrittenQuestion: string;
    evidencePool: EvidencePool;
  }): Promise<LlmCallResult<AgentBrief[]>> {
    this.lastPrompt = buildAgentBriefingPrompt(input);
    const evidenceIds = input.evidencePool.evidence.map((item) => item.id).slice(0, 3);
    const value = parseAgentBriefs([
      {
        speaker: "liu",
        mission: "主持圆桌，拆分事实和价值判断，提醒引用证据，并在争论升温时降温。",
        tone: "清楚、友善、有一点可爱但不幼稚。",
        mustUseEvidenceIds: evidenceIds,
        avoid: ["不要替用户下最终结论", "不要自动发布", "不要伪造证据"],
      },
      {
        speaker: "expert",
        mission: "代表知乎深度回答者，基于证据池提出结构化观点和限制条件。",
        tone: "专业、克制、像高质量知乎回答。",
        mustUseEvidenceIds: evidenceIds,
        avoid: ["不要空喊口号", "不要忽略反方证据", "不要营销腔"],
      },
      {
        speaker: "opponent",
        mission: "找逻辑漏洞、反例和证据不足，推动观点变得更严谨。",
        tone: "锋利但不攻击人。",
        mustUseEvidenceIds: evidenceIds,
        avoid: ["不要人身攻击", "不要情绪化扣帽子", "不要编造反例"],
      },
      {
        speaker: "public",
        mission: "代表普通用户，提出真实关心的问题和使用者视角。",
        tone: "直接、具体、有人味。",
        mustUseEvidenceIds: [],
        avoid: ["不要装专家", "不要跑题", "不要把体验说成事实"],
      },
    ]);

    return { value, usage: usage(this.profile, "briefing", "agent_briefing") };
  }

  async generateAgentTurn(input: {
    topic: Topic;
    rewrittenQuestion: string;
    speaker: AgentPersona;
    evidence: Evidence[];
    brief?: AgentBrief;
    priorTurns: DebateTurn[];
  }): Promise<LlmCallResult<DebateTurn>> {
    this.lastPrompt = buildAgentTurnPrompt(input);
    const evidenceIds = input.evidence.slice(0, input.speaker === "public" ? 1 : 2).map((item) => item.id);
    const persona: Record<AgentPersona, string> = {
      liu: "先别急着站队，我把问题拆成事实、评价和规则三层。",
      expert: "从证据看，真正要评价的是问题拆解、工具协作和结果校验。",
      opponent: "这个观点还需要防止一个漏洞：流畅输出不等于独立能力。",
      public: "普通用户最关心的是规则是否透明，以及自己怎样合理使用 AI。",
    };
    const value = parseDebateTurn({
      id: `mock-turn-${input.priorTurns.length + 1}-${input.speaker}`,
      speaker: input.speaker,
      content: `${persona[input.speaker]}围绕「${input.rewrittenQuestion}」，我会引用现有证据，但保留还没解决的分歧。`,
      evidenceIds,
      claim: input.brief?.mission ?? "把讨论拉回证据和真实场景。",
      nextQuestion:
        input.speaker === "liu" || input.speaker === "public"
          ? "下一步最需要哪类证据来确认这个判断？"
          : undefined,
    });

    return { value, usage: usage(this.profile, "debate", "agent_turn") };
  }

  async buildConsensus(input: {
    topic: Topic;
    rewrittenQuestion: string;
    evidence: Evidence[];
    turns: DebateTurn[];
  }): Promise<LlmCallResult<ViewpointMap>> {
    this.lastPrompt = buildConsensusPrompt(input);
    const value = parseViewpointMap({
      support: ["AI 工具使用能力已经成为一部分工作能力，但需要看过程而不只看结果。"],
      oppose: ["流畅输出可能掩盖基础薄弱，基础能力仍要单独验证。"],
      neutral: ["评价标准不是简单降低或提高，而是在向过程证据迁移。"],
      facts: input.evidence.slice(0, 3).map((item) => `${item.id}: ${item.summary}`),
      disputes: ["工具使用能力是否应计入核心评价。", "是否要求新人披露 AI 使用过程。"],
      followups: ["试用期任务如何保留过程证据？", "平台和圈子如何把评论中的新争议带回下一轮圆桌？"],
    });

    return { value, usage: usage(this.profile, "synthesis", "consensus") };
  }

  async buildPublishPackage(input: {
    topic: Topic;
    rewrittenQuestion: string;
    evidence: Evidence[];
    turns: DebateTurn[];
    viewpointMap: ViewpointMap;
  }): Promise<LlmCallResult<PublishPackage>> {
    this.lastPrompt = buildPublishDraftPrompt(input);
    const value = parsePublishPackage({
      draft: {
        title: `关于「${input.topic.title}」的圆桌讨论：真正争议的是什么？`,
        opening: `今天刘看山圆桌围绕「${input.topic.title}」进行了结构化讨论。我们先区分事实、观点和仍待验证的问题。`,
        consensus: input.viewpointMap.facts.slice(0, 3),
        disputes: input.viewpointMap.disputes.slice(0, 3),
        questions: input.viewpointMap.followups.slice(0, 3),
        disclosure: "本文由 AI 圆桌辅助整理，发布前需要用户确认；系统不会伪造来源或自动发布。",
      },
      titleOptions: [
        `关于「${input.topic.title}」的圆桌讨论：真正争议的是什么？`,
        `${input.rewrittenQuestion}`,
        `刘看山圆桌：${input.topic.title}`,
      ],
      quality: {
        publishable: true,
        score: 88,
        reasons: ["有事实层、价值层和规则层", "证据池覆盖支持与反对", "能引导评论区继续讨论"],
        risks: ["证据仍是 demo 缓存，真实发布前需要核查来源"],
      },
    });

    return { value, usage: usage(this.profile, "publish", "publish_draft") };
  }

  async buildPublishDraft(input: {
    topic: Topic;
    rewrittenQuestion: string;
    evidence: Evidence[];
    turns: DebateTurn[];
    viewpointMap: ViewpointMap;
  }): Promise<LlmCallResult<PublishDraft>> {
    const result = await this.buildPublishPackage(input);
    return {
      value: result.value.draft,
      usage: result.usage,
    };
  }

  async analyzeComments(input: {
    publishDraft: PublishDraft;
    comments: string[];
  }): Promise<LlmCallResult<CommentInsight>> {
    this.lastPrompt = buildCommentAnalysisPrompt(input);
    const normalized = input.comments.map((comment) => comment.trim()).filter(Boolean);
    const value = parseCommentInsight({
      sentiment: {
        support: normalized.filter((comment) => /支持|赞同|有道理/.test(comment)).length,
        oppose: normalized.filter((comment) => /反对|不同意|质疑/.test(comment)).length,
        neutral: normalized.filter(
          (comment) => !/支持|赞同|有道理|反对|不同意|质疑/.test(comment),
        ).length,
      },
      highQualityComments: normalized.slice(0, 3),
      newDisputes: normalized
        .filter((comment) => /但是|不过|问题|质疑|为什么|是否/.test(comment))
        .slice(0, 3),
      nextRoundSuggestions: ["优先回应评论区反复出现的质疑点。", "补充能直接验证争议问题的证据，再开启下一轮讨论。"],
    });

    return { value, usage: usage(this.profile, "feedback", "comment_analysis") };
  }
}

export type OpenAiCompatibleProviderOptions = {
  provider: Exclude<ModelProviderName, "mock">;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  preferredRoles: LlmProviderRole[];
  maxRetries?: number;
  timeoutMs?: number;
};

export class OpenAiCompatibleJsonProvider extends MockLlmProvider {
  readonly profile: LlmProviderProfile;
  private readonly apiKey?: string;
  private readonly baseUrl: string;
  private readonly maxRetries: number;
  private readonly timeoutMs: number;

  constructor(options: OpenAiCompatibleProviderOptions) {
    super();
    this.profile = {
      provider: options.provider,
      model: options.model,
      preferredRoles: options.preferredRoles,
    };
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl ?? "https://api.openai.com/v1";
    this.maxRetries = options.maxRetries ?? 1;
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  private async completeJson(prompt: LlmPrompt): Promise<{ json: unknown; latencyMs: number; attempts: number }> {
    if (!this.apiKey) {
      throw new Error(`${this.profile.provider} 缺少 API key，无法调用真实模型。`);
    }

    const started = Date.now();
    let lastError: unknown;

    for (let attempt = 1; attempt <= this.maxRetries + 1; attempt += 1) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
        const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}/chat/completions`, {
          method: "POST",
          signal: controller.signal,
          headers: {
            authorization: `Bearer ${this.apiKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: this.profile.model,
            messages: prompt.messages,
            response_format: { type: "json_object" },
            temperature: 0.4,
          }),
        }).finally(() => clearTimeout(timeout));

        if (!response.ok) {
          throw new Error(`${this.profile.provider} API ${response.status}: ${await response.text()}`);
        }

        const json = await response.json();
        const content = json?.choices?.[0]?.message?.content;

        if (typeof content !== "string") {
          throw new Error(`${this.profile.provider} 返回缺少 message.content。`);
        }

        return {
          json: parseJsonContent(content),
          latencyMs: Date.now() - started,
          attempts: attempt,
        };
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError instanceof Error ? lastError : new Error(`${this.profile.provider} 调用失败。`);
  }

  override async scoreTopics(input: { topics: Topic[] }): Promise<LlmCallResult<TopicScore[]>> {
    const prompt = buildTopicScoringPrompt(input);
    const completed = await this.completeJson(prompt);
    const value = parseTopicScores(completed.json);
    return { value, usage: { ...usage(this.profile, "topic_scoring", prompt.task), latencyMs: completed.latencyMs, attempts: completed.attempts } };
  }

  override async rewriteQuestion(input: { topic: Topic; evidence?: Evidence[] }): Promise<LlmCallResult<RewriteQuestionResult>> {
    const prompt = buildQuestionRewritePrompt(input);
    const completed = await this.completeJson(prompt);
    const value = parseQuestionRewrite(completed.json);
    return { value, usage: { ...usage(this.profile, "question", prompt.task), latencyMs: completed.latencyMs, attempts: completed.attempts } };
  }

  override async buildEvidencePool(input: { topic: Topic; rawEvidence: Evidence[] }): Promise<LlmCallResult<EvidencePool>> {
    const prompt = buildEvidencePoolPrompt(input);
    const completed = await this.completeJson(prompt);
    const value = parseEvidencePool(completed.json);
    return { value, usage: { ...usage(this.profile, "evidence", prompt.task), latencyMs: completed.latencyMs, attempts: completed.attempts } };
  }

  override async buildAgentBriefs(input: {
    topic: Topic;
    rewrittenQuestion: string;
    evidencePool: EvidencePool;
  }): Promise<LlmCallResult<AgentBrief[]>> {
    const prompt = buildAgentBriefingPrompt(input);
    const completed = await this.completeJson(prompt);
    const value = parseAgentBriefs(completed.json);
    return { value, usage: { ...usage(this.profile, "briefing", prompt.task), latencyMs: completed.latencyMs, attempts: completed.attempts } };
  }

  override async generateAgentTurn(input: {
    topic: Topic;
    rewrittenQuestion: string;
    speaker: AgentPersona;
    evidence: Evidence[];
    brief?: AgentBrief;
    priorTurns: DebateTurn[];
  }): Promise<LlmCallResult<DebateTurn>> {
    const prompt = buildAgentTurnPrompt(input);
    const completed = await this.completeJson(prompt);
    const value = parseDebateTurn(completed.json);
    return { value, usage: { ...usage(this.profile, "debate", prompt.task), latencyMs: completed.latencyMs, attempts: completed.attempts } };
  }

  override async buildConsensus(input: {
    topic: Topic;
    rewrittenQuestion: string;
    evidence: Evidence[];
    turns: DebateTurn[];
  }): Promise<LlmCallResult<ViewpointMap>> {
    const prompt = buildConsensusPrompt(input);
    const completed = await this.completeJson(prompt);
    const value = parseViewpointMap(completed.json);
    return { value, usage: { ...usage(this.profile, "synthesis", prompt.task), latencyMs: completed.latencyMs, attempts: completed.attempts } };
  }

  override async buildPublishPackage(input: {
    topic: Topic;
    rewrittenQuestion: string;
    evidence: Evidence[];
    turns: DebateTurn[];
    viewpointMap: ViewpointMap;
  }): Promise<LlmCallResult<PublishPackage>> {
    const prompt = buildPublishDraftPrompt(input);
    const completed = await this.completeJson(prompt);
    const value = parsePublishPackage(completed.json);
    return { value, usage: { ...usage(this.profile, "publish", prompt.task), latencyMs: completed.latencyMs, attempts: completed.attempts } };
  }

  override async analyzeComments(input: {
    publishDraft: PublishDraft;
    comments: string[];
  }): Promise<LlmCallResult<CommentInsight>> {
    const prompt = buildCommentAnalysisPrompt(input);
    const completed = await this.completeJson(prompt);
    const value = parseCommentInsight(completed.json);
    return { value, usage: { ...usage(this.profile, "feedback", prompt.task), latencyMs: completed.latencyMs, attempts: completed.attempts } };
  }
}

export class RoutedLlmProvider implements LlmProvider {
  readonly profile: LlmProviderProfile;
  private readonly fallback = new MockLlmProvider();

  constructor(
    private readonly policy: ModelPolicy,
    private readonly providers: Partial<Record<ModelProviderName, LlmProvider>>,
  ) {
    this.profile = {
      provider: policy.defaultProvider,
      model:
        policy.defaultProvider === "kimi"
          ? policy.kimiModel
          : policy.defaultProvider === "deepseek-v4-flash"
            ? policy.deepseekFlashModel
            : policy.defaultProvider === "deepseek-v4-pro"
              ? policy.deepseekProModel
              : "router",
      preferredRoles: [
        "topic_scoring",
        "question",
        "evidence",
        "briefing",
        "debate",
        "synthesis",
        "publish",
        "feedback",
      ],
    };
  }

  private providerFor(role: ModelRole): LlmProvider {
    if (this.policy.mode === "mock") {
      return this.fallback;
    }

    const name = this.policy.roleMap[role] ?? this.policy.defaultProvider;
    return this.providers[name] ?? this.fallback;
  }

  private async call<T>(role: ModelRole, fn: (provider: LlmProvider) => Promise<LlmCallResult<T>>): Promise<LlmCallResult<T>> {
    const provider = this.providerFor(role);

    try {
      return await fn(provider);
    } catch (error) {
      if (!this.policy.fallbackToMock) {
        throw error;
      }

      const result = await fn(this.fallback);
      return {
        value: result.value,
        usage: {
          ...result.usage,
          fallbackUsed: true,
          errorMessage: error instanceof Error ? error.message : "未知模型路由错误",
        },
      };
    }
  }

  scoreTopics(input: { topics: Topic[] }) {
    return this.call("topic_scoring", (provider) => provider.scoreTopics(input));
  }

  rewriteQuestion(input: { topic: Topic; evidence?: Evidence[] }) {
    return this.call("question", (provider) => provider.rewriteQuestion(input));
  }

  buildEvidencePool(input: { topic: Topic; rawEvidence: Evidence[] }) {
    return this.call("evidence", (provider) => provider.buildEvidencePool(input));
  }

  buildAgentBriefs(input: { topic: Topic; rewrittenQuestion: string; evidencePool: EvidencePool }) {
    return this.call("briefing", (provider) => provider.buildAgentBriefs(input));
  }

  generateAgentTurn(input: {
    topic: Topic;
    rewrittenQuestion: string;
    speaker: AgentPersona;
    evidence: Evidence[];
    brief?: AgentBrief;
    priorTurns: DebateTurn[];
  }) {
    return this.call("debate", (provider) => provider.generateAgentTurn(input));
  }

  buildConsensus(input: { topic: Topic; rewrittenQuestion: string; evidence: Evidence[]; turns: DebateTurn[] }) {
    return this.call("synthesis", (provider) => provider.buildConsensus(input));
  }

  buildPublishPackage(input: {
    topic: Topic;
    rewrittenQuestion: string;
    evidence: Evidence[];
    turns: DebateTurn[];
    viewpointMap: ViewpointMap;
  }) {
    return this.call("publish", (provider) => provider.buildPublishPackage(input));
  }

  async buildPublishDraft(input: {
    topic: Topic;
    rewrittenQuestion: string;
    evidence: Evidence[];
    turns: DebateTurn[];
    viewpointMap: ViewpointMap;
  }) {
    const result = await this.buildPublishPackage(input);
    return {
      value: result.value.draft,
      usage: result.usage,
    };
  }

  analyzeComments(input: { publishDraft: PublishDraft; comments: string[] }) {
    return this.call("feedback", (provider) => provider.analyzeComments(input));
  }
}

export function createModelPolicy(input: Partial<ModelPolicy> = {}): ModelPolicy {
  return {
    ...DEFAULT_MODEL_POLICY,
    ...input,
    roleMap: {
      ...DEFAULT_MODEL_POLICY.roleMap,
      ...(input.roleMap ?? {}),
    },
  };
}

export function resolveModelPolicy(input: Partial<ModelPolicy> = {}): ModelPolicy {
  const policy = createModelPolicy(input);

  return {
    ...policy,
    kimiModel: process.env.KIMI_MODEL ?? process.env.MOONSHOT_MODEL ?? policy.kimiModel,
    deepseekFlashModel: process.env.DEEPSEEK_FLASH_MODEL ?? process.env.DEEPSEEK_MODEL ?? policy.deepseekFlashModel,
    deepseekProModel: process.env.DEEPSEEK_PRO_MODEL ?? process.env.DEEPSEEK_MODEL ?? policy.deepseekProModel,
  };
}

export function createRoutedLlmProvider(policy: ModelPolicy = DEFAULT_MODEL_POLICY): RoutedLlmProvider {
  const resolvedPolicy = resolveModelPolicy(policy);
  const kimi = new OpenAiCompatibleJsonProvider({
    provider: "kimi",
    model: resolvedPolicy.kimiModel,
    apiKey: process.env.KIMI_API_KEY ?? process.env.MOONSHOT_API_KEY,
    baseUrl: process.env.KIMI_BASE_URL ?? process.env.MOONSHOT_BASE_URL ?? "https://api.moonshot.cn/v1",
    preferredRoles: ["evidence", "debate", "feedback"],
  });
  const deepseekFlash = new OpenAiCompatibleJsonProvider({
    provider: "deepseek-v4-flash",
    model: resolvedPolicy.deepseekFlashModel,
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseUrl: process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com/v1",
    preferredRoles: ["topic_scoring", "briefing", "feedback"],
  });
  const deepseekPro = new OpenAiCompatibleJsonProvider({
    provider: "deepseek-v4-pro",
    model: resolvedPolicy.deepseekProModel,
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseUrl: process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com/v1",
    preferredRoles: ["question", "synthesis", "publish"],
  });

  return new RoutedLlmProvider(resolvedPolicy, {
    mock: new MockLlmProvider(),
    kimi,
    "deepseek-v4-flash": deepseekFlash,
    "deepseek-v4-pro": deepseekPro,
  });
}

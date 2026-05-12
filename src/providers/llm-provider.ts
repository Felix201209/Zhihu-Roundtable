import { createHash } from "node:crypto";
import type {
  AgentBrief,
  CommentInsight,
  DebateTurn,
  Evidence,
  EvidencePool,
  ExperimentReport,
  IdeaVariant,
  ModelPolicy,
  ModelProviderName,
  ModelRole,
  ModelUsage,
  PublishDraft,
  PublishPackage,
  Topic,
  TopicScore,
  VariantFeedback,
  ViewpointMap,
} from "../core/types.js";
import {
  buildAgentBriefingPrompt,
  buildAgentTurnPrompt,
  buildCommentAnalysisPrompt,
  buildConsensusPrompt,
  buildEvidencePoolPrompt,
  buildExperimentReportPrompt,
  buildIdeaVariantsPrompt,
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
  parseExperimentReport,
  parseIdeaVariants,
  parsePublishDraft,
  parsePublishPackage,
  parseQuestionRewrite,
  parseTopicScores,
  parseViewpointMap,
} from "../llm/schemas.js";
import { JsonFileCache } from "../backend/cache.js";

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
  generateIdeaVariants(input: {
    idea: string;
    similarEvidence?: Evidence[];
    hotTopics?: Topic[];
  }): Promise<LlmCallResult<IdeaVariant[]>>;
  buildExperimentReport(input: {
    idea: string;
    variants: IdeaVariant[];
    feedback: VariantFeedback[];
  }): Promise<LlmCallResult<ExperimentReport>>;
  analyzeComments(input: {
    publishDraft: PublishDraft;
    comments: string[];
  }): Promise<LlmCallResult<CommentInsight>>;
}

export const DEFAULT_MODEL_POLICY: ModelPolicy = {
  mode: "auto",
  kimiModel: "kimi-k2.6",
  deepseekFlashModel: "deepseek-v4-flash",
  deepseekProModel: "deepseek-v4-pro",
  defaultProvider: "deepseek-v4-pro",
  roleMap: {
    topic_scoring: "deepseek-v4-flash",
    question: "deepseek-v4-pro",
    evidence: "deepseek-v4-flash",
    briefing: "deepseek-v4-flash",
    debate: "deepseek-v4-flash",
    synthesis: "deepseek-v4-pro",
    publish: "deepseek-v4-pro",
    feedback: "deepseek-v4-flash",
  },
  fallbackToMock: true,
};

type CachedLlmResponse =
  | { ok: true; json: unknown }
  | { ok: false; message: string };

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

function envMs(key: string, fallback: number): number {
  const parsed = Number(process.env[key]);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

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

    const arrayFirst = trimmed.indexOf("[");
    const arrayLast = trimmed.lastIndexOf("]");
    const first = trimmed.indexOf("{");
    const last = trimmed.lastIndexOf("}");

    if (arrayFirst >= 0 && arrayLast > arrayFirst && (first < 0 || arrayFirst < first)) {
      return JSON.parse(trimmed.slice(arrayFirst, arrayLast + 1));
    }

    if (first >= 0 && last > first) {
      return JSON.parse(trimmed.slice(first, last + 1));
    }

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
        mission: "作为刘看山主持人，帮助创作者把热榜改造成可参与的圈子讨论，拆分事实、立场和追问，并在争论升温时降温。",
        tone: "清楚、友善、有一点可爱但不幼稚。",
        mustUseEvidenceIds: evidenceIds,
        avoid: ["不要替用户下最终结论", "不要自动发布", "不要伪造证据", "不要把讨论做成摘要"],
      },
      {
        speaker: "expert",
        mission: "作为站内观点席，基于知乎站内和全网证据池提炼已有观点结构、可站队立场和限制条件，不模拟任何具体用户。",
        tone: "专业、克制、像高质量知乎讨论整理。",
        mustUseEvidenceIds: evidenceIds,
        avoid: ["不要空喊口号", "不要忽略反方证据", "不要营销腔", "不要伪造大 V 或具体用户身份"],
      },
      {
        speaker: "opponent",
        mission: "作为反方校验席，找讨论帖可能被反驳、跑偏或证据不足的地方，帮创作者提前设计反方问题。",
        tone: "锋利但不攻击人。",
        mustUseEvidenceIds: evidenceIds,
        avoid: ["不要人身攻击", "不要情绪化扣帽子", "不要编造反例"],
      },
      {
        speaker: "public",
        mission: "作为普通用户席，判断普通读者是否看得懂、愿不愿意回复，并提出更具体的评论引导问题。",
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
      liu: "先别急着下结论，我会把这条热榜整理成一个能让大家参与站队的讨论。",
      expert: "从站内内容看，这个话题至少能拆出支持、反方和经验补充三类评论入口。",
      opponent: "这个讨论帖需要提前留出反方空间，否则容易变成单向输出或情绪站队。",
      public: "普通用户最关心的是自己能不能看懂、有没有具体场景可以回应。",
    };
    const value = parseDebateTurn({
      id: `mock-turn-${input.priorTurns.length + 1}-${input.speaker}`,
      speaker: input.speaker,
      content: `${persona[input.speaker]}围绕「${input.rewrittenQuestion}」，我会引用现有证据，但保留还没解决的分歧。`,
      evidenceIds,
      claim: input.brief?.mission ?? "把讨论设计拉回证据、参与感和下一步行动。",
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
      support: ["可以站队：AI 工具使用能力已经成为一部分工作能力，但需要看过程而不只看结果。"],
      oppose: ["反方入口：流畅输出可能掩盖基础薄弱，基础能力仍要单独验证。"],
      neutral: ["中间立场：评价标准不是简单降低或提高，而是在向过程证据迁移。"],
      facts: input.evidence.slice(0, 3).map((item) => `${item.id}: ${item.summary}`),
      disputes: ["工具使用能力是否应计入核心评价。", "是否要求新人披露 AI 使用过程。"],
      followups: ["试用期任务如何保留过程证据？", "如果你是创作者/管理者，会怎样设计一个不跑偏的讨论帖？"],
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
        title: `围绕「${input.topic.title}」开个讨论：你站哪一边？`,
        opening: `最近这个热榜很适合发起一场圈子讨论。与其只看结论，不如请创作者、普通用户和有经验的人一起补充：这个问题在真实场景里到底怎么判断？`,
        consensus: input.viewpointMap.support.slice(0, 2).concat(input.viewpointMap.neutral.slice(0, 1)),
        disputes: input.viewpointMap.disputes.slice(0, 3),
        questions: [
          input.rewrittenQuestion,
          ...input.viewpointMap.followups,
          "如果你有亲历经验，最想补充哪一个反例或判断标准？",
        ].slice(0, 3),
        disclosure: "本文由 AI 讨论组织台辅助策划，发布前需要用户确认；系统不会伪造来源、伪造真人观点或自动发布。",
      },
      titleOptions: [
        `围绕「${input.topic.title}」开个讨论：你站哪一边？`,
        `${input.rewrittenQuestion}`,
        `刘看山帮忙组织一个热榜讨论：${input.topic.title}`,
      ],
      quality: {
        publishable: true,
        score: 88,
        reasons: ["有开放问题、站队空间和真实经验入口", "证据池覆盖支持与反对", "能把评论回流成下一轮选题"],
        risks: ["证据仍是 demo 缓存，真实发布前需要核查来源", "发布时要避免把 AI 整理写成唯一结论"],
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
      nextRoundSuggestions: [
        "把评论区反复出现的质疑改成下一轮圈子问题。",
        "整理一篇回答/文章：列出支持方、反方和真实经验各自最强的证据。",
      ],
    });

    return { value, usage: usage(this.profile, "feedback", "comment_analysis") };
  }

  async generateIdeaVariants(input: {
    idea: string;
    similarEvidence?: Evidence[];
    hotTopics?: Topic[];
  }): Promise<LlmCallResult<IdeaVariant[]>> {
    this.lastPrompt = buildIdeaVariantsPrompt(input);
    const baseIdea = input.idea.replace(/\s+/g, " ").trim();
    const isSelectionIdea = /选题|创作|文章|内容/.test(baseIdea);
    const variants = parseIdeaVariants([
      {
        id: "A",
        title: isSelectionIdea ? "30 秒生成知乎选题" : "30 秒生成行动方案",
        oneLiner: isSelectionIdea
          ? "AI 根据热点和你的领域，快速生成可写的知乎选题。"
          : "AI 把一个脑洞快速包装成可执行的最小方案。",
        highlight: "启动成本低，用户能立刻得到一个结果。",
        risk: "撞车风险高，容易像普通 AI 写作助手或灵感生成器。",
      },
      {
        id: "B",
        title: isSelectionIdea ? "选题防撞雷达" : "脑洞防撞雷达",
        oneLiner: "发之前先查知乎站内和全网相似内容，再给出差异化改法。",
        highlight: "实用性强，能解决创作者和参赛者怕重复、怕没新意的问题。",
        risk: "新意中等，如果没有社区反馈，仍像一个查重工具。",
      },
      {
        id: "C",
        title: "想法试验场",
        oneLiner: "把脑洞变成 3 个版本，发到圈子让真实用户投票和吐槽，再由 AI 给出最终方向。",
        highlight: "知乎社区参与感强，能把真实反馈变成决策建议。",
        risk: "需要足够评论样本，现场必须有演示数据兜底。",
      },
    ]);

    return { value: variants, usage: usage(this.profile, "topic_scoring", "idea_variants") };
  }

  async buildExperimentReport(input: {
    idea: string;
    variants: IdeaVariant[];
    feedback: VariantFeedback[];
  }): Promise<LlmCallResult<ExperimentReport>> {
    this.lastPrompt = buildExperimentReportPrompt(input);
    const winner = [...input.feedback].sort((a, b) => {
      const qualityScore = (quality: VariantFeedback["quality"]) => quality === "high" ? 3 : quality === "medium" ? 2 : 1;
      return (b.likes + b.comments * 2 + qualityScore(b.quality) * 20) -
        (a.likes + a.comments * 2 + qualityScore(a.quality) * 20);
    })[0] ?? input.feedback[0];
    const variant = input.variants.find((item) => item.id === winner?.variantId) ?? input.variants[2] ?? input.variants[0];
    const value = parseExperimentReport({
      recommendedVariantId: variant.id,
      recommendedTitle: `${variant.id} ${variant.title}`,
      conclusion: "用户更愿意参与“帮脑洞投票和吐槽”，而不是再用一个普通 AI 工具听 AI 自评。",
      whyWinner: [
        "有效反馈最多，评论更具体。",
        "更像知乎社区产品，而不是单向生成工具。",
        "和普通 AI 写作助手差异最大。",
      ],
      userConcerns: [
        "用户怕项目或选题撞车。",
        "用户希望看到真实反馈，而不是 AI 自评。",
        "用户不想看太抽象的产品概念。",
      ],
      finalPositioning:
        "「想法试验场」是一个给知乎创作者和 Hackathon 参赛者使用的脑洞众测工具：它把一个想法生成 3 个版本，发布到圈子收集真实反馈，再根据点赞、评论和吐槽判断哪个方向最值得做。",
      pitchLine: "AI 不替用户判断什么是好想法，知乎真实用户来判断。",
      mvpFeatures: ["输入脑洞", "生成 3 个版本", "发圈子测试", "回收点赞和评论", "生成最终建议"],
      nextActions: ["继续优化这个方向", "生成路演稿", "再做一轮测试"],
    });

    return { value, usage: usage(this.profile, "feedback", "experiment_report") };
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
  fetchImpl?: typeof fetch;
  cache?: JsonFileCache | false;
};

export class OpenAiCompatibleJsonProvider extends MockLlmProvider {
  readonly profile: LlmProviderProfile;
  private readonly apiKey?: string;
  private readonly baseUrl: string;
  private readonly maxRetries: number;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly cache?: JsonFileCache;

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
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.cache = options.cache === false
      ? undefined
      : options.cache ?? (options.fetchImpl ? undefined : defaultLlmCache());
  }

  private async completeJson(prompt: LlmPrompt): Promise<{ json: unknown; latencyMs: number; attempts: number; cached?: boolean }> {
    if (!this.apiKey) {
      throw new Error(`${this.profile.provider} 缺少 API key，无法调用真实模型。`);
    }

    const cacheKey = this.cacheKey(prompt);
    const cached = this.cache?.get<CachedLlmResponse>(cacheKey);
    if (cached) {
      if (cached.ok) {
        return {
          json: cached.json,
          latencyMs: 0,
          attempts: 0,
          cached: true,
        };
      }
      throw new Error(cached.message);
    }

    const started = Date.now();
    let lastError: unknown;

    for (let attempt = 1; attempt <= this.maxRetries + 1; attempt += 1) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
        const response = await this.fetchImpl(`${this.baseUrl.replace(/\/$/, "")}/chat/completions`, {
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

        const parsed = parseJsonContent(content);
        this.cache?.set<CachedLlmResponse>(
          cacheKey,
          { ok: true, json: parsed },
          envMs("LLM_CACHE_TTL_MS", 24 * HOUR_MS),
        );

        return {
          json: parsed,
          latencyMs: Date.now() - started,
          attempts: attempt,
        };
      } catch (error) {
        lastError = error;
      }
    }

    const error = lastError instanceof Error ? lastError : new Error(`${this.profile.provider} 调用失败。`);
    this.cache?.set<CachedLlmResponse>(
      cacheKey,
      { ok: false, message: error.message },
      envMs("LLM_CACHE_ERROR_TTL_MS", 5 * MINUTE_MS),
    );
    throw error;
  }

  private cacheKey(prompt: LlmPrompt): string {
    const hash = createHash("sha256")
      .update(JSON.stringify({
        provider: this.profile.provider,
        model: this.profile.model,
        baseUrl: this.baseUrl.replace(/\/$/, ""),
        task: prompt.task,
        messages: prompt.messages,
      }))
      .digest("hex");
    return `llm-json:${hash}`;
  }

  override async scoreTopics(input: { topics: Topic[] }): Promise<LlmCallResult<TopicScore[]>> {
    const prompt = buildTopicScoringPrompt(input);
    const completed = await this.completeJson(prompt);
    const value = parseTopicScores(completed.json);
    return { value, usage: { ...usage(this.profile, "synthesis", prompt.task), latencyMs: completed.latencyMs, attempts: completed.attempts, cached: completed.cached } };
  }

  override async rewriteQuestion(input: { topic: Topic; evidence?: Evidence[] }): Promise<LlmCallResult<RewriteQuestionResult>> {
    const prompt = buildQuestionRewritePrompt(input);
    const completed = await this.completeJson(prompt);
    const value = parseQuestionRewrite(completed.json);
    return { value, usage: { ...usage(this.profile, "question", prompt.task), latencyMs: completed.latencyMs, attempts: completed.attempts, cached: completed.cached } };
  }

  override async buildEvidencePool(input: { topic: Topic; rawEvidence: Evidence[] }): Promise<LlmCallResult<EvidencePool>> {
    const prompt = buildEvidencePoolPrompt(input);
    const completed = await this.completeJson(prompt);
    const value = parseEvidencePool(completed.json);
    return { value, usage: { ...usage(this.profile, "evidence", prompt.task), latencyMs: completed.latencyMs, attempts: completed.attempts, cached: completed.cached } };
  }

  override async buildAgentBriefs(input: {
    topic: Topic;
    rewrittenQuestion: string;
    evidencePool: EvidencePool;
  }): Promise<LlmCallResult<AgentBrief[]>> {
    const prompt = buildAgentBriefingPrompt(input);
    const completed = await this.completeJson(prompt);
    const value = parseAgentBriefs(completed.json);
    return { value, usage: { ...usage(this.profile, "briefing", prompt.task), latencyMs: completed.latencyMs, attempts: completed.attempts, cached: completed.cached } };
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
    return { value, usage: { ...usage(this.profile, "debate", prompt.task), latencyMs: completed.latencyMs, attempts: completed.attempts, cached: completed.cached } };
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
    return { value, usage: { ...usage(this.profile, "topic_scoring", prompt.task), latencyMs: completed.latencyMs, attempts: completed.attempts, cached: completed.cached } };
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
    return { value, usage: { ...usage(this.profile, "publish", prompt.task), latencyMs: completed.latencyMs, attempts: completed.attempts, cached: completed.cached } };
  }

  override async analyzeComments(input: {
    publishDraft: PublishDraft;
    comments: string[];
  }): Promise<LlmCallResult<CommentInsight>> {
    const prompt = buildCommentAnalysisPrompt(input);
    const completed = await this.completeJson(prompt);
    const value = parseCommentInsight(completed.json);
    return { value, usage: { ...usage(this.profile, "feedback", prompt.task), latencyMs: completed.latencyMs, attempts: completed.attempts, cached: completed.cached } };
  }

  override async generateIdeaVariants(input: {
    idea: string;
    similarEvidence?: Evidence[];
    hotTopics?: Topic[];
  }): Promise<LlmCallResult<IdeaVariant[]>> {
    const prompt = buildIdeaVariantsPrompt(input);
    const completed = await this.completeJson(prompt);
    const value = parseIdeaVariants(completed.json);
    return { value, usage: { ...usage(this.profile, "synthesis", prompt.task), latencyMs: completed.latencyMs, attempts: completed.attempts, cached: completed.cached } };
  }

  override async buildExperimentReport(input: {
    idea: string;
    variants: IdeaVariant[];
    feedback: VariantFeedback[];
  }): Promise<LlmCallResult<ExperimentReport>> {
    const prompt = buildExperimentReportPrompt(input);
    const completed = await this.completeJson(prompt);
    const value = parseExperimentReport(completed.json);
    return { value, usage: { ...usage(this.profile, "feedback", prompt.task), latencyMs: completed.latencyMs, attempts: completed.attempts, cached: completed.cached } };
  }
}

function defaultLlmCache(): JsonFileCache | undefined {
  if (process.env.LLM_CACHE_ENABLED === "false") {
    return undefined;
  }
  return new JsonFileCache(process.env.LLM_CACHE_FILE ?? ".cache/llm-json-cache.json");
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

  generateIdeaVariants(input: { idea: string; similarEvidence?: Evidence[]; hotTopics?: Topic[] }) {
    return this.call("topic_scoring", (provider) => provider.generateIdeaVariants(input));
  }

  buildExperimentReport(input: { idea: string; variants: IdeaVariant[]; feedback: VariantFeedback[] }) {
    return this.call("feedback", (provider) => provider.buildExperimentReport(input));
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
  const custom = new OpenAiCompatibleJsonProvider({
    provider: "custom",
    model: process.env.CUSTOM_LLM_MODEL ?? process.env.ZHIHU_DIRECT_AGENT_MODEL ?? "zhihu-direct-agent",
    apiKey: process.env.CUSTOM_LLM_API_KEY ?? process.env.ZHIHU_DIRECT_AGENT_API_KEY ?? process.env.ZHIHU_ACCESS_TOKEN,
    baseUrl: process.env.CUSTOM_LLM_BASE_URL ?? process.env.ZHIHU_DIRECT_AGENT_BASE_URL ?? "https://api.zhihu.com/v1",
    preferredRoles: ["question", "synthesis", "publish", "feedback"],
  });

  return new RoutedLlmProvider(resolvedPolicy, {
    mock: new MockLlmProvider(),
    kimi,
    "deepseek-v4-flash": deepseekFlash,
    "deepseek-v4-pro": deepseekPro,
    custom,
  });
}

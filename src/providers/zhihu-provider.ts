import type { ApiQuotaStatus, CommentInsight, Evidence, PublishDraft, ReactionType, Topic } from "../core/types.js";
import { ApiQuotaManager } from "../backend/quota.js";
import {
  demoCommentInsights,
  demoEvidence,
  demoPublishDrafts,
  demoTopics,
} from "../demo/demo-data.js";

export type RingDetail = {
  id: string;
  name: string;
  description: string;
};

export type PublishResult = {
  id: string;
  url: string;
  ring: RingDetail;
  draft: PublishDraft;
  mode: "mock" | "live";
  createdAt: string;
};

export type CommentCreateResult = {
  id: string;
  content: string;
  mode: "mock" | "live";
  createdAt: string;
};

export type ReactionResult = {
  id: string;
  targetId: string;
  type: ReactionType;
  mode: "mock" | "live";
  createdAt: string;
};

export type ZhihuProviderMode = "mock" | "live";

export type ZhihuProviderFailure = {
  operation: string;
  message: string;
  at: string;
};

export interface ZhihuProvider {
  readonly mode: ZhihuProviderMode;
  readonly failures?: ZhihuProviderFailure[];
  getHotTopics(): Promise<Topic[]>;
  searchEvidence(topic: Topic): Promise<Evidence[]>;
  getDefaultRing(): Promise<RingDetail>;
  publishDraft(input: { draft: PublishDraft; ringId?: string }): Promise<PublishResult>;
  listComments(input: { topicId: string; publishId?: string }): Promise<string[]>;
  createComment(input: { publishId: string; content: string }): Promise<CommentCreateResult>;
  react(input: { targetId: string; type: ReactionType }): Promise<ReactionResult>;
  getQuotaStatus?(): ApiQuotaStatus[];
  getCachedCommentInsight(topicId: string): Promise<CommentInsight | undefined>;
}

type LiveZhihuProviderOptions = {
  baseUrl: string;
  accessToken?: string;
  fetchImpl?: typeof fetch;
  quota?: ApiQuotaManager;
};

export class MockZhihuProvider implements ZhihuProvider {
  readonly mode = "mock";

  async getHotTopics(): Promise<Topic[]> {
    return demoTopics.map((topic) => ({ ...topic }));
  }

  async searchEvidence(topic: Topic): Promise<Evidence[]> {
    return (demoEvidence[topic.id] ?? []).map((item) => ({ ...item }));
  }

  async getDefaultRing(): Promise<RingDetail> {
    return {
      id: "ring-ai-workplace",
      name: "AI 与职场圆桌",
      description: "围绕 AI 工具、职场评价和新人协作的高质量讨论圈子。",
    };
  }

  async publishDraft(input: { draft: PublishDraft; ringId?: string }): Promise<PublishResult> {
    const ring = await this.getDefaultRing();

    return {
      id: `mock-pin-${Date.now()}`,
      url: `https://www.zhihu.com/pin/mock-${encodeURIComponent(input.draft.title)}`,
      ring: input.ringId ? { ...ring, id: input.ringId } : ring,
      draft: {
        ...input.draft,
        consensus: [...input.draft.consensus],
        disputes: [...input.draft.disputes],
        questions: [...input.draft.questions],
      },
      mode: "mock",
      createdAt: new Date().toISOString(),
    };
  }

  async listComments(input: { topicId: string }): Promise<string[]> {
    const insight = demoCommentInsights[input.topicId];

    if (!insight) {
      return [];
    }

    return [
      ...insight.highQualityComments,
      ...insight.newDisputes.map((item) => `质疑：${item}`),
      ...insight.nextRoundSuggestions.map((item) => `建议：${item}`),
    ];
  }

  async createComment(input: { publishId: string; content: string }): Promise<CommentCreateResult> {
    return {
      id: `mock-comment-${Date.now()}`,
      content: input.content,
      mode: "mock",
      createdAt: new Date().toISOString(),
    };
  }

  async react(input: { targetId: string; type: ReactionType }): Promise<ReactionResult> {
    return {
      id: `mock-reaction-${Date.now()}`,
      targetId: input.targetId,
      type: input.type,
      mode: "mock",
      createdAt: new Date().toISOString(),
    };
  }

  getQuotaStatus(): ApiQuotaStatus[] {
    return new ApiQuotaManager().all();
  }

  async getCachedCommentInsight(topicId: string): Promise<CommentInsight | undefined> {
    const insight = demoCommentInsights[topicId];

    if (!insight) {
      return undefined;
    }

    return {
      sentiment: { ...insight.sentiment },
      highQualityComments: [...insight.highQualityComments],
      newDisputes: [...insight.newDisputes],
      nextRoundSuggestions: [...insight.nextRoundSuggestions],
    };
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }

  const record = asRecord(value);
  for (const key of ["data", "items", "list", "results", "comments"]) {
    if (Array.isArray(record[key])) {
      return record[key] as unknown[];
    }
  }

  return [];
}

function numberValue(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function topicFromApi(item: unknown, index: number): Topic {
  const record = asRecord(item);
  const title = stringValue(record.title ?? record.name ?? record.question_title, `知乎热榜话题 ${index + 1}`);
  const hotScore = numberValue(record.hotScore ?? record.hot_score ?? record.heat ?? record.score, 70);

  return {
    id: stringValue(record.id ?? record.topic_id ?? record.question_id, `zhihu-hot-${index + 1}`),
    title,
    source: "zhihu_hot",
    hotScore,
    debateScore: numberValue(record.debateScore ?? record.debate_score, Math.min(95, Math.round(hotScore * 0.9))),
    evidenceScore: numberValue(record.evidenceScore ?? record.evidence_score, 72),
    reason: stringValue(record.reason ?? record.excerpt ?? record.summary, "来自知乎热榜，等待 AI 讨论潜力评分。"),
  };
}

function evidenceFromApi(item: unknown, index: number, source: Evidence["source"]): Evidence {
  const record = asRecord(item);
  const id = stringValue(record.id ?? record.answer_id ?? record.article_id, `${source}-ev-${index + 1}`);
  const title = stringValue(record.title ?? record.question_title ?? record.name, `证据 ${index + 1}`);
  const summary = stringValue(record.summary ?? record.excerpt ?? record.content ?? record.text, title);
  const stance = ["support", "oppose", "neutral", "background"].includes(String(record.stance))
    ? (record.stance as Evidence["stance"])
    : "neutral";

  return {
    id,
    source,
    title,
    summary,
    url: typeof record.url === "string" ? record.url : undefined,
    author: optionalString(record.author ?? record.author_name),
    publishedAt: optionalString(record.publishedAt ?? record.published_at ?? record.created_at),
    relevanceScore: numberValue(record.relevanceScore ?? record.relevance_score, 0),
    favoriteCount: numberValue(record.favoriteCount ?? record.favorite_count ?? record.voteup_count, 0),
    commentCount: numberValue(record.commentCount ?? record.comment_count, 0),
    stance,
    qualityScore: numberValue(record.qualityScore ?? record.quality_score, source === "zhihu" ? 80 : 74),
  };
}

export class LiveZhihuProvider implements ZhihuProvider {
  readonly mode = "live";
  readonly failures: ZhihuProviderFailure[] = [];
  private readonly fetchImpl: typeof fetch;
  private readonly quota: ApiQuotaManager;

  constructor(private readonly options: LiveZhihuProviderOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.quota = options.quota ?? new ApiQuotaManager();
  }

  async getHotTopics(): Promise<Topic[]> {
    this.quota.consume("hot_list");
    const json = await this.request("/api/v1/content/hot_list");
    const topics = asArray(json).map(topicFromApi);

    if (topics.length === 0) {
      throw new Error("知乎热榜接口返回空列表。");
    }

    return topics;
  }

  async searchEvidence(topic: Topic): Promise<Evidence[]> {
    this.quota.consume("zhihu_search");
    const zhihu = await this.request("/api/v1/content/zhihu_search", { q: topic.title });
    this.quota.consume("global_search");
    const global = await this.request("/api/v1/content/global_search", { q: topic.title });

    return [
      ...asArray(zhihu).map((item, index) => evidenceFromApi(item, index, "zhihu")),
      ...asArray(global).map((item, index) => evidenceFromApi(item, index, "global")),
    ];
  }

  async getDefaultRing(): Promise<RingDetail> {
    this.quota.consume("ring_detail");
    const json = asRecord(await this.request("/openapi/ring/detail"));
    const data = asRecord(json.data ?? json.ring ?? json);

    return {
      id: stringValue(data.id ?? data.ring_id, "default-ring"),
      name: stringValue(data.name ?? data.title, "知乎圆桌圈子"),
      description: stringValue(data.description ?? data.desc, "由知乎 API 返回的默认圈子。"),
    };
  }

  async publishDraft(input: { draft: PublishDraft; ringId?: string }): Promise<PublishResult> {
    this.quota.consume("publish_pin");
    const json = asRecord(
      await this.request("/openapi/publish/pin", undefined, {
        method: "POST",
        body: JSON.stringify({
          ring_id: input.ringId,
          title: input.draft.title,
          content: [
            input.draft.opening,
            "",
            "共识：",
            ...input.draft.consensus.map((item, index) => `${index + 1}. ${item}`),
            "",
            "争议：",
            ...input.draft.disputes.map((item, index) => `${index + 1}. ${item}`),
            "",
            "继续讨论：",
            ...input.draft.questions.map((item, index) => `${index + 1}. ${item}`),
            "",
            input.draft.disclosure,
          ].join("\n"),
        }),
      }),
    );
    const data = asRecord(json.data ?? json);
    const ringData = asRecord(data.ring ?? data.ring_detail);
    const ring = {
      id: stringValue(input.ringId ?? data.ring_id ?? ringData.id ?? ringData.ring_id, "default-ring"),
      name: stringValue(ringData.name ?? ringData.title, "知乎圆桌圈子"),
      description: stringValue(ringData.description ?? ringData.desc, "发布接口返回的圈子信息。"),
    };

    return {
      id: stringValue(data.id ?? data.pin_id, `live-pin-${Date.now()}`),
      url: stringValue(data.url, `https://www.zhihu.com/pin/${stringValue(data.id ?? data.pin_id, "unknown")}`),
      ring,
      draft: input.draft,
      mode: "live",
      createdAt: new Date().toISOString(),
    };
  }

  async listComments(input: { topicId: string; publishId?: string }): Promise<string[]> {
    this.quota.consume("comment_list");
    const json = await this.request("/openapi/comment/list", {
      topic_id: input.topicId,
      pin_id: input.publishId,
    });

    return asArray(json)
      .map((item) => {
        const record = asRecord(item);
        return stringValue(record.content ?? record.text ?? record.summary);
      })
      .filter(Boolean);
  }

  async createComment(input: { publishId: string; content: string }): Promise<CommentCreateResult> {
    this.quota.consume("comment_create");
    const json = asRecord(
      await this.request("/openapi/comment/create", undefined, {
        method: "POST",
        body: JSON.stringify({
          pin_id: input.publishId,
          content: input.content,
        }),
      }),
    );
    const data = asRecord(json.data ?? json);

    return {
      id: stringValue(data.id ?? data.comment_id, `live-comment-${Date.now()}`),
      content: input.content,
      mode: "live",
      createdAt: new Date().toISOString(),
    };
  }

  async react(input: { targetId: string; type: ReactionType }): Promise<ReactionResult> {
    this.quota.consume("reaction");
    const json = asRecord(
      await this.request("/openapi/reaction", undefined, {
        method: "POST",
        body: JSON.stringify({
          target_id: input.targetId,
          reaction: input.type,
        }),
      }),
    );
    const data = asRecord(json.data ?? json);

    return {
      id: stringValue(data.id ?? data.reaction_id, `live-reaction-${Date.now()}`),
      targetId: input.targetId,
      type: input.type,
      mode: "live",
      createdAt: new Date().toISOString(),
    };
  }

  getQuotaStatus(): ApiQuotaStatus[] {
    return this.quota.all();
  }

  async getCachedCommentInsight(): Promise<CommentInsight | undefined> {
    return undefined;
  }

  private async request(
    path: string,
    query?: Record<string, string | undefined>,
    init: RequestInit = {},
  ): Promise<unknown> {
    const url = new URL(path, this.options.baseUrl.replace(/\/$/, "") + "/");

    for (const [key, value] of Object.entries(query ?? {})) {
      if (value) {
        url.searchParams.set(key, value);
      }
    }

    const response = await this.fetchImpl(url, {
      ...init,
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        ...(this.options.accessToken ? { authorization: `Bearer ${this.options.accessToken}` } : {}),
        ...(init.headers ?? {}),
      },
    });

    if (!response.ok) {
      throw new Error(`知乎 API ${response.status}: ${await response.text()}`);
    }

    return response.json();
  }
}

export class FallbackZhihuProvider implements ZhihuProvider {
  readonly mode: ZhihuProviderMode;
  readonly failures: ZhihuProviderFailure[] = [];

  constructor(
    private readonly primary: ZhihuProvider,
    private readonly fallback: ZhihuProvider = new MockZhihuProvider(),
  ) {
    this.mode = primary.mode;
  }

  async getHotTopics(): Promise<Topic[]> {
    return this.withFallback("getHotTopics", () => this.primary.getHotTopics(), () =>
      this.fallback.getHotTopics(),
    );
  }

  async searchEvidence(topic: Topic): Promise<Evidence[]> {
    return this.withFallback("searchEvidence", () => this.primary.searchEvidence(topic), () =>
      this.fallback.searchEvidence(topic),
    );
  }

  async getDefaultRing(): Promise<RingDetail> {
    return this.withFallback("getDefaultRing", () => this.primary.getDefaultRing(), () =>
      this.fallback.getDefaultRing(),
    );
  }

  async publishDraft(input: { draft: PublishDraft; ringId?: string }): Promise<PublishResult> {
    return this.withFallback("publishDraft", () => this.primary.publishDraft(input), () =>
      this.fallback.publishDraft(input),
    );
  }

  async listComments(input: { topicId: string; publishId?: string }): Promise<string[]> {
    return this.withFallback("listComments", () => this.primary.listComments(input), () =>
      this.fallback.listComments(input),
    );
  }

  async createComment(input: { publishId: string; content: string }): Promise<CommentCreateResult> {
    return this.withFallback("createComment", () => this.primary.createComment(input), () =>
      this.fallback.createComment(input),
    );
  }

  async react(input: { targetId: string; type: ReactionType }): Promise<ReactionResult> {
    return this.withFallback("react", () => this.primary.react(input), () =>
      this.fallback.react(input),
    );
  }

  getQuotaStatus(): ApiQuotaStatus[] {
    return this.primary.getQuotaStatus?.() ?? this.fallback.getQuotaStatus?.() ?? [];
  }

  async getCachedCommentInsight(topicId: string): Promise<CommentInsight | undefined> {
    return this.withFallback(
      "getCachedCommentInsight",
      () => this.primary.getCachedCommentInsight(topicId),
      () => this.fallback.getCachedCommentInsight(topicId),
    );
  }

  private async withFallback<T>(
    operation: string,
    primary: () => Promise<T>,
    fallback: () => Promise<T>,
  ): Promise<T> {
    try {
      return await primary();
    } catch (error) {
      const failure = {
        operation,
        message: error instanceof Error ? error.message : "未知知乎 provider 错误",
        at: new Date().toISOString(),
      };
      this.failures.push(failure);
      console.warn(`[zhihu-provider] ${operation} failed, using fallback`, error);
      return fallback();
    }
  }
}

export function createDefaultZhihuProvider(): ZhihuProvider {
  const useLive = process.env.ZHIHU_PROVIDER === "live" || Boolean(process.env.ZHIHU_API_BASE_URL);

  if (!useLive) {
    return new MockZhihuProvider();
  }

  return new FallbackZhihuProvider(
    new LiveZhihuProvider({
      baseUrl: process.env.ZHIHU_API_BASE_URL ?? "https://api.zhihu.com",
      accessToken: process.env.ZHIHU_ACCESS_TOKEN,
    }),
    new MockZhihuProvider(),
  );
}

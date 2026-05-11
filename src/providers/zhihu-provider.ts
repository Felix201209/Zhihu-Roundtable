import { createHash, createHmac, randomUUID } from "node:crypto";
import type { ApiQuotaKey, ApiQuotaStatus, CommentInsight, Evidence, PublishDraft, ReactionType, Topic } from "../core/types.js";
import { ApiQuotaManager } from "../backend/quota.js";
import { JsonFileCache } from "../backend/cache.js";
import {
  demoCommentInsights,
  demoEvidence,
  demoPublishDrafts,
  demoTopics,
} from "../demo/demo-data.js";

export const HACKATHON_DEFAULT_RING_ID = "2029619126742656657";

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
  /** Legacy alias for the Hackathon app_key/user token. */
  accessToken?: string;
  /** Official app_key: user token copied from the Zhihu profile URL. */
  appKey?: string;
  /** Official app_secret: Hackathon app secret from Zhihu. */
  appSecret?: string;
  extraInfo?: string;
  ringId?: string;
  hotListHours?: string;
  fetchImpl?: typeof fetch;
  quota?: ApiQuotaManager;
  readCache?: JsonFileCache | false;
};

type CachedZhihuResponse =
  | { ok: true; json: unknown }
  | { ok: false; message: string };

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

function envMs(key: string, fallback: number): number {
  const parsed = Number(process.env[key]);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

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
      ...insight.highQualityComments.map((item, index) => (index === 0 ? `支持：${item}` : item)),
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

  const data = asRecord(record.data);
  for (const key of ["contents", "comments", "items", "list", "results"]) {
    if (Array.isArray(data[key])) {
      return data[key] as unknown[];
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

function officialStatusError(json: unknown): string | undefined {
  const record = asRecord(json);
  const status = record.status ?? record.code;
  if (status === undefined || status === null || Number(status) === 0) {
    return undefined;
  }

  return stringValue(record.msg ?? asRecord(record.error).message, `status=${String(status)}`);
}

function contentTokenFrom(data: Record<string, unknown>, fallback: string): string {
  return stringValue(data.content_token ?? data.pin_id ?? data.id ?? data.comment_id, fallback);
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
  private readonly readCache?: JsonFileCache;

  constructor(private readonly options: LiveZhihuProviderOptions) {
    if (!options.fetchImpl) {
      assertSafeZhihuBaseUrl(options.baseUrl);
    }
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.quota = options.quota ?? new ApiQuotaManager();
    this.readCache = options.readCache === false
      ? undefined
      : options.readCache ?? (options.fetchImpl ? undefined : defaultZhihuReadCache());
  }

  async getHotTopics(): Promise<Topic[]> {
    const json = await this.request("/api/v1/content/hot_list", {
      hours: this.options.hotListHours,
    }, undefined, {
      quotaKey: "hot_list",
      cacheTtlMs: envMs("ZHIHU_CACHE_HOT_TTL_MS", 30 * MINUTE_MS),
    });
    const topics = asArray(json).map(topicFromApi);

    if (topics.length === 0) {
      throw new Error("知乎热榜接口返回空列表。");
    }

    return topics;
  }

  async searchEvidence(topic: Topic): Promise<Evidence[]> {
    const zhihu = await this.request("/api/v1/content/zhihu_search", { q: topic.title }, undefined, {
      quotaKey: "zhihu_search",
      cacheTtlMs: envMs("ZHIHU_CACHE_SEARCH_TTL_MS", 12 * HOUR_MS),
    });
    const global = await this.request("/api/v1/content/global_search", { q: topic.title }, undefined, {
      quotaKey: "global_search",
      cacheTtlMs: envMs("ZHIHU_CACHE_SEARCH_TTL_MS", 12 * HOUR_MS),
    });

    return [
      ...asArray(zhihu).map((item, index) => evidenceFromApi(item, index, "zhihu")),
      ...asArray(global).map((item, index) => evidenceFromApi(item, index, "global")),
    ];
  }

  async getDefaultRing(): Promise<RingDetail> {
    const json = asRecord(await this.request("/openapi/ring/detail", {
      ring_id: this.options.ringId ?? HACKATHON_DEFAULT_RING_ID,
      page_num: "1",
      page_size: "20",
    }, undefined, {
      quotaKey: "ring_detail",
      cacheTtlMs: envMs("ZHIHU_CACHE_RING_TTL_MS", DAY_MS),
    }));
    const data = asRecord(json.data ?? json);
    const ringInfo = asRecord(data.ring_info ?? data.ring ?? json.ring ?? data);

    return {
      id: stringValue(ringInfo.id ?? ringInfo.ring_id, this.options.ringId ?? HACKATHON_DEFAULT_RING_ID),
      name: stringValue(ringInfo.name ?? ringInfo.ring_name ?? ringInfo.title, "知乎圆桌圈子"),
      description: stringValue(ringInfo.description ?? ringInfo.ring_desc ?? ringInfo.desc, "由知乎 API 返回的默认圈子。"),
    };
  }

  async publishDraft(input: { draft: PublishDraft; ringId?: string }): Promise<PublishResult> {
    this.quota.consume("publish_pin");
    const ringId = input.ringId ?? this.options.ringId ?? HACKATHON_DEFAULT_RING_ID;
    const json = asRecord(
      await this.request("/openapi/publish/pin", undefined, {
        method: "POST",
        body: JSON.stringify({
          ring_id: ringId,
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
    const contentToken = contentTokenFrom(data, `live-pin-${Date.now()}`);
    const ring = {
      id: stringValue(ringId ?? data.ring_id ?? ringData.id ?? ringData.ring_id, "default-ring"),
      name: stringValue(ringData.name ?? ringData.title, "知乎圆桌圈子"),
      description: stringValue(ringData.description ?? ringData.desc, "发布接口返回的圈子信息。"),
    };

    return {
      id: contentToken,
      url: stringValue(data.url, `https://www.zhihu.com/pin/${contentToken}`),
      ring,
      draft: input.draft,
      mode: "live",
      createdAt: new Date().toISOString(),
    };
  }

  async listComments(input: { topicId: string; publishId?: string }): Promise<string[]> {
    const json = await this.request("/openapi/comment/list", {
      content_token: input.publishId ?? input.topicId,
      content_type: "pin",
      page_num: "1",
      page_size: "50",
    }, undefined, {
      quotaKey: "comment_list",
      cacheTtlMs: envMs("ZHIHU_CACHE_COMMENT_TTL_MS", MINUTE_MS),
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
          content_token: input.publishId,
          content_type: "pin",
          content: input.content,
        }),
      }),
    );
    const data = asRecord(json.data ?? json);

    return {
      id: contentTokenFrom(data, `live-comment-${Date.now()}`),
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
          content_token: input.targetId,
          content_type: "pin",
          action_type: "like",
          action_value: input.type === "neutral" ? 0 : 1,
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
    options: { quotaKey?: ApiQuotaKey; cacheTtlMs?: number; negativeCacheTtlMs?: number } = {},
  ): Promise<unknown> {
    const url = new URL(path, this.options.baseUrl.replace(/\/$/, "") + "/");

    for (const [key, value] of Object.entries(query ?? {})) {
      if (value) {
        url.searchParams.set(key, value);
      }
    }
    const method = (init.method ?? "GET").toUpperCase();
    const authHeaders = this.officialAuthHeaders();
    const cacheKey = method === "GET" && options.cacheTtlMs !== 0
      ? this.cacheKey(method, url)
      : undefined;
    const cached = cacheKey ? this.readCache?.get<CachedZhihuResponse>(cacheKey) : undefined;

    if (cached) {
      if (cached.ok) {
        return cached.json;
      }
      throw new Error(cached.message);
    }

    if (options.quotaKey) {
      this.quota.consume(options.quotaKey);
    }

    const response = await this.fetchImpl(url, {
      ...init,
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        ...authHeaders,
        ...(init.headers ?? {}),
      },
    });

    if (!response.ok) {
      const message = `知乎 API ${response.status}: ${await response.text()}`;
      this.storeNegativeCache(cacheKey, message, options.negativeCacheTtlMs);
      throw new Error(message);
    }

    const json = await response.json();
    const businessError = officialStatusError(json);
    if (businessError) {
      const message = `知乎 API 业务错误: ${businessError}`;
      this.storeNegativeCache(cacheKey, message, options.negativeCacheTtlMs);
      throw new Error(message);
    }

    if (cacheKey && options.cacheTtlMs && this.readCache) {
      this.readCache.set<CachedZhihuResponse>(cacheKey, { ok: true, json }, options.cacheTtlMs);
    }

    return json;
  }

  private officialAuthHeaders(): Record<string, string> {
    const appKey = this.options.appKey ?? this.options.accessToken;
    const appSecret = this.options.appSecret;
    if (!appKey) {
      return {};
    }

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const logId = `zhihu-roundtable-${randomUUID()}`;
    const extraInfo = this.options.extraInfo ?? "";
    const headers: Record<string, string> = {
      "X-App-Key": appKey,
      "X-Timestamp": timestamp,
      "X-Log-Id": logId,
      "X-Extra-Info": extraInfo,
    };

    if (appSecret) {
      const signString = `app_key:${appKey}|ts:${timestamp}|logid:${logId}|extra_info:${extraInfo}`;
      headers["X-Sign"] = createHmac("sha256", appSecret).update(signString).digest("base64");
    }

    return headers;
  }

  private cacheKey(method: string, url: URL): string {
    const appKey = this.options.appKey ?? this.options.accessToken ?? "anonymous";
    const appKeyHash = createHash("sha256").update(appKey).digest("hex").slice(0, 12);
    const normalized = new URL(url.toString());
    normalized.searchParams.sort();
    return `zhihu-openapi:${appKeyHash}:${method}:${normalized.pathname}?${normalized.searchParams.toString()}`;
  }

  private storeNegativeCache(cacheKey: string | undefined, message: string, ttlMs = envMs("ZHIHU_CACHE_ERROR_TTL_MS", 15 * MINUTE_MS)): void {
    if (!cacheKey || !this.readCache || ttlMs <= 0) {
      return;
    }
    this.readCache.set<CachedZhihuResponse>(cacheKey, { ok: false, message }, ttlMs);
  }
}

function defaultZhihuReadCache(): JsonFileCache | undefined {
  if (process.env.ZHIHU_CACHE_ENABLED === "false") {
    return undefined;
  }
  return new JsonFileCache(process.env.ZHIHU_CACHE_FILE ?? ".cache/zhihu-openapi-cache.json");
}

function assertSafeZhihuBaseUrl(baseUrl: string): void {
  const url = new URL(baseUrl);
  const isZhihuHost = url.hostname === "zhihu.com" || url.hostname.endsWith(".zhihu.com");

  if (url.protocol !== "https:" || !isZhihuHost) {
    throw new Error("ZHIHU_API_BASE_URL 必须是 https://*.zhihu.com，避免把授权 token 发到非知乎域。");
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
    { allowWriteFallback: false });
  }

  async listComments(input: { topicId: string; publishId?: string }): Promise<string[]> {
    return this.withFallback("listComments", () => this.primary.listComments(input), () =>
      this.fallback.listComments(input),
    );
  }

  async createComment(input: { publishId: string; content: string }): Promise<CommentCreateResult> {
    return this.withFallback("createComment", () => this.primary.createComment(input), () =>
      this.fallback.createComment(input),
    { allowWriteFallback: false });
  }

  async react(input: { targetId: string; type: ReactionType }): Promise<ReactionResult> {
    return this.withFallback("react", () => this.primary.react(input), () =>
      this.fallback.react(input),
    { allowWriteFallback: false });
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
    options: { allowWriteFallback?: boolean } = {},
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
      if (options.allowWriteFallback === false) {
        throw error;
      }
      console.warn(`[zhihu-provider] ${operation} failed, using fallback`, error);
      return fallback();
    }
  }
}

export function createDefaultZhihuProvider(): ZhihuProvider {
  if (process.env.ZHIHU_PROVIDER === "mock") {
    return new MockZhihuProvider();
  }

  const useLive = process.env.ZHIHU_PROVIDER === "live" || Boolean(process.env.ZHIHU_API_BASE_URL);

  if (!useLive) {
    return new MockZhihuProvider();
  }

  return new FallbackZhihuProvider(
    new LiveZhihuProvider({
      baseUrl: process.env.ZHIHU_API_BASE_URL ?? "https://openapi.zhihu.com",
      accessToken: process.env.ZHIHU_ACCESS_TOKEN,
      appKey: process.env.ZHIHU_APP_KEY ?? process.env.ZHIHU_ACCESS_TOKEN,
      appSecret: process.env.ZHIHU_APP_SECRET ?? process.env.ZHIHU_APP_KEY_SECRET,
      extraInfo: process.env.ZHIHU_EXTRA_INFO ?? "",
      ringId: process.env.ZHIHU_RING_ID,
      hotListHours: process.env.ZHIHU_HOT_LIST_HOURS,
    }),
    new MockZhihuProvider(),
  );
}

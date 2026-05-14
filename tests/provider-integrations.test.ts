import { createHmac } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { JsonFileCache } from "../src/backend/cache.js";
import {
  createModelPolicy,
  createRoutedLlmProvider,
  MockLlmProvider,
  OpenAiCompatibleJsonProvider,
  RoutedLlmProvider,
  type LlmCallResult,
  type LlmProvider,
} from "../src/providers/llm-provider.js";
import { createDefaultZhihuProvider, FallbackZhihuProvider, LiveZhihuProvider, MockZhihuProvider } from "../src/providers/zhihu-provider.js";

class FailingLlmProvider extends MockLlmProvider implements LlmProvider {
  override async rewriteQuestion(): Promise<LlmCallResult<{ rewrittenQuestion: string; rationale: string; evidenceIds: string[] }>> {
    throw new Error("live model exploded");
  }
}

describe("provider integrations", () => {
  it("routes failed live model calls to mock and records fallback reason", async () => {
    const provider = new RoutedLlmProvider(
      createModelPolicy({
        mode: "live",
        defaultProvider: "deepseek-v4-pro",
        roleMap: { question: "deepseek-v4-pro" },
        fallbackToMock: true,
      }),
      {
        mock: new MockLlmProvider(),
        "deepseek-v4-pro": new FailingLlmProvider(),
      },
    );
    const result = await provider.rewriteQuestion({
      topic: {
        id: "topic-1",
        title: "AI 工具是否改变新人评价？",
        hotScore: 90,
        debateScore: 88,
        evidenceScore: 82,
        reason: "demo",
      },
      evidence: [],
    });

    expect(result.usage.fallbackUsed).toBe(true);
    expect(result.usage.errorMessage).toContain("live model exploded");
    expect(result.value.rewrittenQuestion).toContain("AI 工具");
  });

  it("allows domestic model names to be overridden by environment variables", () => {
    const previous = {
      DEEPSEEK_PRO_MODEL: process.env.DEEPSEEK_PRO_MODEL,
      DEEPSEEK_FLASH_MODEL: process.env.DEEPSEEK_FLASH_MODEL,
      KIMI_MODEL: process.env.KIMI_MODEL,
    };

    try {
      process.env.DEEPSEEK_PRO_MODEL = "deepseek-v4-pro-live";
      process.env.DEEPSEEK_FLASH_MODEL = "deepseek-v4-flash-live";
      process.env.KIMI_MODEL = "kimi-k2.6-live";

      const provider = createRoutedLlmProvider(
        createModelPolicy({
          mode: "live",
          defaultProvider: "deepseek-v4-pro",
          fallbackToMock: true,
        }),
      );

      expect(provider.profile).toMatchObject({
        provider: "deepseek-v4-pro",
        model: "deepseek-v4-pro-live",
      });
    } finally {
      process.env.DEEPSEEK_PRO_MODEL = previous.DEEPSEEK_PRO_MODEL;
      process.env.DEEPSEEK_FLASH_MODEL = previous.DEEPSEEK_FLASH_MODEL;
      process.env.KIMI_MODEL = previous.KIMI_MODEL;
    }
  });

  it("parses fenced and mixed live model JSON without real API keys", async () => {
    const responses = [
      "```json\n{\"rewrittenQuestion\":\"AI 工具会如何改变新人评价？\",\"rationale\":\"把热榜改成可讨论问题\",\"evidenceIds\":[\"ev-1\"]}\n```",
      "模型先解释一句：[{\"id\":\"A\",\"title\":\"效率版\",\"oneLiner\":\"30 秒生成选题\",\"highlight\":\"快\",\"risk\":\"容易同质化\"},{\"id\":\"B\",\"title\":\"防撞版\",\"oneLiner\":\"发前查重\",\"highlight\":\"实用\",\"risk\":\"社区感不足\"},{\"id\":\"C\",\"title\":\"众测版\",\"oneLiner\":\"让真实用户投票吐槽\",\"highlight\":\"社区反馈强\",\"risk\":\"需要冷启动\"}]",
    ];
    const provider = new OpenAiCompatibleJsonProvider({
      provider: "deepseek-v4-pro",
      model: "deepseek-v4-pro",
      apiKey: "test-key",
      baseUrl: "https://llm.example.test/v1",
      preferredRoles: ["question", "synthesis"],
      fetchImpl: async () => Response.json({
        choices: [{ message: { content: responses.shift() } }],
      }),
    });

    const rewritten = await provider.rewriteQuestion({
      topic: {
        id: "topic-1",
        title: "AI 工具是否改变新人评价？",
        hotScore: 90,
        debateScore: 88,
        evidenceScore: 82,
        reason: "demo",
      },
      evidence: [],
    });
    const variants = await provider.generateIdeaVariants({ idea: "AI 选题工具" });

    expect(rewritten.value.rewrittenQuestion).toContain("新人评价");
    expect(variants.value).toHaveLength(3);
    expect(variants.value[2]).toMatchObject({ id: "C", title: "众测版" });
  });

  it("aborts slow live model response bodies before falling back", async () => {
    const provider = new OpenAiCompatibleJsonProvider({
      provider: "deepseek-v4-pro",
      model: "deepseek-v4-pro",
      apiKey: "test-key",
      baseUrl: "https://deepseek.example.test/v1",
      preferredRoles: ["question"],
      timeoutMs: 5,
      maxRetries: 0,
      cache: false,
      fetchImpl: async (_input, init) => ({
        ok: true,
        json: () => new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("body aborted")), { once: true });
        }),
      }) as Response,
    });

    await expect(provider.rewriteQuestion({
      topic: {
        id: "topic-1",
        title: "AI 工具是否改变新人评价？",
        hotScore: 90,
        debateScore: 88,
        evidenceScore: 82,
        reason: "demo",
      },
      evidence: [],
    })).rejects.toThrow("body aborted");
  });

  it("caches successful DeepSeek-compatible JSON calls before hitting the model again", async () => {
    const dir = mkdtempSync(join(tmpdir(), "llm-cache-"));
    try {
      let fetchCount = 0;
      const provider = new OpenAiCompatibleJsonProvider({
        provider: "deepseek-v4-pro",
        model: "deepseek-v4-pro",
        apiKey: "test-key",
        baseUrl: "https://deepseek.example.test/v1",
        preferredRoles: ["question"],
        cache: new JsonFileCache(join(dir, "cache.json")),
        fetchImpl: async () => {
          fetchCount += 1;
          return Response.json({
            choices: [{
              message: {
                content: "{\"rewrittenQuestion\":\"AI 工具会如何改变新人评价？\",\"rationale\":\"把热榜改成可讨论问题\",\"evidenceIds\":[\"ev-1\"]}",
              },
            }],
          });
        },
      });
      const input = {
        topic: {
          id: "topic-1",
          title: "AI 工具是否改变新人评价？",
          hotScore: 90,
          debateScore: 88,
          evidenceScore: 82,
          reason: "demo",
        },
        evidence: [],
      };

      const first = await provider.rewriteQuestion(input);
      const second = await provider.rewriteQuestion(input);

      expect(fetchCount).toBe(1);
      expect(first.usage.cached).toBeUndefined();
      expect(second.usage.cached).toBe(true);
      expect(second.usage.attempts).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("maps live Zhihu API endpoints into backend topic/evidence/publish shapes", async () => {
    const requested: string[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = input.toString();
      requested.push(`${init?.method ?? "GET"} ${new URL(url).pathname}`);

      if (url.includes("/api/v1/content/hot_list")) {
        return Response.json({
          data: [{
            id: "q1",
            title: "<p>AI 工具是否改变新人评价？</p>",
            heat: 98,
            excerpt: "<p>热榜摘要&nbsp;&amp;讨论背景：&#34;旧答案&#34;与&#x65B0;问题</p>",
          }],
        });
      }

      if (url.includes("/api/v1/content/zhihu_search")) {
        return Response.json({ data: [{ id: "a1", title: "<b>站内回答</b>", summary: "<p>站内证据</p>" }] });
      }

      if (url.includes("/api/v1/content/global_search")) {
        return Response.json({ data: [{ id: "g1", title: "全网资料", summary: "全网证据" }] });
      }

      if (url.includes("/openapi/ring/detail")) {
        return Response.json({ status: 0, msg: "success", data: { ring_info: { ring_id: "r1", ring_name: "AI 圈子", ring_desc: "圈子描述" } } });
      }

      if (url.includes("/openapi/publish/pin")) {
        return Response.json({ status: 0, msg: "success", data: { content_token: "p1" } });
      }

      if (url.includes("/openapi/comment/list")) {
        return Response.json({ status: 0, msg: "success", data: { comments: [{ content: "支持，但想看更多证据" }] } });
      }

      if (url.includes("/openapi/comment/create")) {
        return Response.json({ code: 0, msg: "success", data: { comment_id: "c1" } });
      }

      if (url.includes("/openapi/reaction")) {
        return Response.json({ status: 0, msg: "success", data: { success: true } });
      }

      return Response.json({}, { status: 404 });
    };
    const provider = new LiveZhihuProvider({
      baseUrl: "https://example.test",
      accessToken: "token",
      fetchImpl,
    });

    const topics = await provider.getHotTopics();
    const evidence = await provider.searchEvidence(topics[0]);
    const publish = await provider.publishDraft({
      ringId: "r1",
      draft: {
        title: "标题",
        opening: "开场",
        consensus: ["共识"],
        disputes: ["争议"],
        questions: ["问题"],
        disclosure: "AI 辅助整理",
      },
    });
    const comments = await provider.listComments({ topicId: "q1", publishId: publish.id });
    const comment = await provider.createComment({ publishId: publish.id, content: "主持补充" });
    const reaction = await provider.react({ targetId: publish.id, type: "support" });

    expect(topics[0]).toMatchObject({
      id: "q1",
      source: "zhihu_hot",
      title: "AI 工具是否改变新人评价？",
      reason: "热榜摘要 &讨论背景：\"旧答案\"与新问题",
    });
    expect(evidence[0]).toMatchObject({ title: "站内回答", summary: "站内证据" });
    expect(evidence.map((item) => item.source)).toEqual(["zhihu", "global"]);
    expect(publish).toMatchObject({ id: "p1", mode: "live" });
    expect(comments).toEqual(["支持，但想看更多证据"]);
    expect(comment).toMatchObject({ id: "c1", mode: "live" });
    expect(reaction).toMatchObject({ targetId: publish.id, type: "support", mode: "live" });
    expect(provider.getQuotaStatus().find((quota) => quota.key === "comment_create")?.used).toBe(1);
    const publishBody = requested.find((item) => item === "POST /openapi/publish/pin");
    expect(publishBody).toBeTruthy();
    expect(requested).toEqual(
      expect.arrayContaining([
        "GET /api/v1/content/hot_list",
        "GET /api/v1/content/zhihu_search",
        "GET /api/v1/content/global_search",
        "POST /openapi/publish/pin",
        "GET /openapi/comment/list",
        "POST /openapi/comment/create",
        "POST /openapi/reaction",
      ]),
    );
  });

  it("passes official HMAC credentials, ring id and hot-list window to live Zhihu requests", async () => {
    const seen: Array<{ path: string; search: string; headers: Headers; body?: string }> = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = new URL(input.toString());
      seen.push({
        path: url.pathname,
        search: url.search,
        headers: new Headers(init?.headers),
        body: typeof init?.body === "string" ? init.body : undefined,
      });

      if (url.pathname.includes("/api/v1/content/hot_list")) {
        return Response.json({ status: 0, msg: "success", data: [{ id: "q1", title: "热榜", heat: 90 }] });
      }
      if (url.pathname.includes("/openapi/ring/detail")) {
        return Response.json({ status: 0, msg: "success", data: { ring_info: { ring_id: "ring-official", ring_name: "黑客松脑洞补给站" } } });
      }
      if (url.pathname.includes("/openapi/publish/pin")) {
        return Response.json({ status: 0, msg: "success", data: { content_token: "pin-1" } });
      }
      if (url.pathname.includes("/openapi/comment/list")) {
        return Response.json({ status: 0, msg: "success", data: { comments: [] } });
      }

      return Response.json({});
    };
    const provider = new LiveZhihuProvider({
      baseUrl: "https://example.test",
      appKey: "user-token",
      appSecret: "official-secret",
      ringId: "ring-official",
      hotListHours: "12",
      fetchImpl,
    });

    await provider.getHotTopics();
    await provider.getDefaultRing();
    await provider.publishDraft({
      draft: {
        title: "标题",
        opening: "开场",
        consensus: ["共识"],
        disputes: ["争议"],
        questions: ["问题"],
        disclosure: "AI 辅助整理",
      },
    });
    await provider.listComments({ topicId: "q1", publishId: "pin-1" });

    expect(seen.find((item) => item.path.includes("/api/v1/content/hot_list"))?.search).toContain("hours=12");
    expect(seen.find((item) => item.path.includes("/openapi/ring/detail"))?.search).toContain("ring_id=ring-official");
    expect(seen.find((item) => item.path.includes("/openapi/comment/list"))?.search).toContain("content_type=pin");
    expect(seen.find((item) => item.path.includes("/openapi/comment/list"))?.search).toContain("content_token=pin-1");
    expect(seen.every((item) => item.headers.get("X-App-Key") === "user-token")).toBe(true);
    expect(seen.every((item) => item.headers.get("X-Timestamp"))).toBe(true);
    expect(seen.every((item) => item.headers.get("X-Log-Id"))).toBe(true);
    expect(seen.every((item) => item.headers.get("X-Sign"))).toBe(true);
    expect(seen.every((item) => item.headers.has("X-Extra-Info"))).toBe(true);
    const first = seen[0];
    const signString = `app_key:user-token|ts:${first.headers.get("X-Timestamp")}|logid:${first.headers.get("X-Log-Id")}|extra_info:`;
    expect(first.headers.get("X-Sign")).toBe(createHmac("sha256", "official-secret").update(signString).digest("base64"));
    const publishRequest = seen.find((item) => item.path.includes("/openapi/publish/pin"));
    expect(publishRequest?.body).toContain("\"ring_id\":\"ring-official\"");
    expect(publishRequest?.body).toContain("你可以直接站队");
    expect(publishRequest?.body).toContain("刘看山想追问");
    expect(publishRequest?.body).not.toContain("系统不会伪造来源");
  });

  it("caches successful live read requests before consuming quota again", async () => {
    const dir = mkdtempSync(join(tmpdir(), "zhihu-cache-"));
    try {
      let fetchCount = 0;
      const cache = new JsonFileCache(join(dir, "cache.json"));
      const fetchImpl: typeof fetch = async () => {
        fetchCount += 1;
        return Response.json({ status: 0, msg: "success", data: [{ id: "q1", title: "热榜", heat: 90 }] });
      };
      const provider = new LiveZhihuProvider({
        baseUrl: "https://example.test",
        appKey: "user-token",
        appSecret: "official-secret",
        fetchImpl,
        readCache: cache,
      });

      await provider.getHotTopics();
      await provider.getHotTopics();

      expect(fetchCount).toBe(1);
      expect(provider.getQuotaStatus().find((quota) => quota.key === "hot_list")?.used).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("negative-caches failed live read requests to avoid repeated quota burn", async () => {
    const dir = mkdtempSync(join(tmpdir(), "zhihu-cache-"));
    try {
      let fetchCount = 0;
      const cache = new JsonFileCache(join(dir, "cache.json"));
      const fetchImpl: typeof fetch = async () => {
        fetchCount += 1;
        return Response.json({ error: "missing" }, { status: 404 });
      };
      const provider = new LiveZhihuProvider({
        baseUrl: "https://example.test",
        appKey: "user-token",
        appSecret: "official-secret",
        fetchImpl,
        readCache: cache,
      });

      await expect(provider.getHotTopics()).rejects.toThrow(/知乎 API 404/);
      await expect(provider.getHotTopics()).rejects.toThrow(/知乎 API 404/);

      expect(fetchCount).toBe(2);
      expect(provider.getQuotaStatus().find((quota) => quota.key === "hot_list")?.used).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("uses live ring detail as a read fallback when content hot list is unavailable", async () => {
    let hotListHits = 0;
    let ringHits = 0;
    const fetchImpl: typeof fetch = async (input) => {
      const url = new URL(input.toString());
      if (url.pathname.includes("/api/v1/content/hot_list")) {
        hotListHits += 1;
        return Response.json({ error: "missing" }, { status: 404 });
      }
      if (url.pathname.includes("/openapi/ring/detail")) {
        ringHits += 1;
        return Response.json({
          status: 0,
          msg: "success",
          data: {
            ring_info: { ring_id: "ring-1", ring_name: "黑客松脑洞补给站" },
            contents: [{
              content_token: "pin-1",
              content: "AI 作品集是否应该展示工具使用过程？",
              like_num: 42,
              comment_num: 9,
            }],
          },
        });
      }
      return Response.json({}, { status: 404 });
    };
    const provider = new LiveZhihuProvider({
      baseUrl: "https://example.test",
      fetchImpl,
      readCache: false,
    });

    const topics = await provider.getHotTopics();
    const evidence = await provider.searchEvidence(topics[0]);

    expect(topics[0]).toMatchObject({
      id: "pin-1",
      source: "zhihu_hot",
      title: "AI 作品集是否应该展示工具使用过程？",
    });
    expect(evidence[0]).toMatchObject({
      id: "pin-1",
      source: "zhihu",
      summary: "AI 作品集是否应该展示工具使用过程？",
    });
    expect(hotListHits).toBe(1);
    expect(ringHits).toBeGreaterThanOrEqual(1);
    expect(provider.failures.map((failure) => failure.operation)).toEqual(
      expect.arrayContaining([
        "getHotTopics.hotList",
        "searchEvidence.zhihuSearch",
        "searchEvidence.globalSearch",
      ]),
    );
  });

  it("lets an explicit mock provider override live Zhihu env configuration", () => {
    const previous = {
      ZHIHU_PROVIDER: process.env.ZHIHU_PROVIDER,
      ZHIHU_API_BASE_URL: process.env.ZHIHU_API_BASE_URL,
      ZHIHU_APP_KEY: process.env.ZHIHU_APP_KEY,
      ZHIHU_APP_SECRET: process.env.ZHIHU_APP_SECRET,
    };

    try {
      process.env.ZHIHU_PROVIDER = "mock";
      process.env.ZHIHU_API_BASE_URL = "https://openapi.zhihu.com";
      process.env.ZHIHU_APP_KEY = "local-user-token";
      process.env.ZHIHU_APP_SECRET = "local-secret";

      expect(createDefaultZhihuProvider().mode).toBe("mock");
    } finally {
      restoreEnv("ZHIHU_PROVIDER", previous.ZHIHU_PROVIDER);
      restoreEnv("ZHIHU_API_BASE_URL", previous.ZHIHU_API_BASE_URL);
      restoreEnv("ZHIHU_APP_KEY", previous.ZHIHU_APP_KEY);
      restoreEnv("ZHIHU_APP_SECRET", previous.ZHIHU_APP_SECRET);
    }
  });

  it("keeps a successful live publish result even when ring detail would fail", async () => {
    const requested: string[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = input.toString();
      requested.push(`${init?.method ?? "GET"} ${new URL(url).pathname}`);

      if (url.includes("/openapi/publish/pin")) {
        return Response.json({ status: 0, msg: "success", data: { content_token: "p1" } });
      }

      if (url.includes("/openapi/ring/detail")) {
        return Response.json({ error: "ring detail down" }, { status: 503 });
      }

      return Response.json({}, { status: 404 });
    };
    const provider = new LiveZhihuProvider({
      baseUrl: "https://example.test",
      fetchImpl,
    });

    const publish = await provider.publishDraft({
      ringId: "ring-selected-by-user",
      draft: {
        title: "标题",
        opening: "开场",
        consensus: ["共识"],
        disputes: ["争议"],
        questions: ["问题"],
        disclosure: "AI 辅助整理",
      },
    });

    expect(publish).toMatchObject({
      id: "p1",
      url: "https://www.zhihu.com/pin/p1",
      mode: "live",
      ring: { id: "ring-selected-by-user" },
    });
    expect(requested).toEqual(["POST /openapi/publish/pin"]);
  });

  it("falls back from broken live Zhihu provider to mock data", async () => {
    const live = new LiveZhihuProvider({
      baseUrl: "https://example.test",
      fetchImpl: async () => Response.json({ error: "down" }, { status: 502 }),
    });
    const provider = new FallbackZhihuProvider(live, new MockZhihuProvider());
    const topics = await provider.getHotTopics();

    expect(topics.length).toBeGreaterThan(0);
    expect(provider.failures[0].operation).toBe("getHotTopics");
  });

  it("does not turn failed live write operations into mock success", async () => {
    const live = new LiveZhihuProvider({
      baseUrl: "https://example.test",
      fetchImpl: async () => Response.json({ error: "forbidden" }, { status: 403 }),
    });
    const provider = new FallbackZhihuProvider(live, new MockZhihuProvider());

    await expect(provider.publishDraft({
      ringId: "ring-selected-by-user",
      draft: {
        title: "标题",
        opening: "开场",
        consensus: ["共识"],
        disputes: ["争议"],
        questions: ["问题"],
        disclosure: "AI 辅助整理",
      },
    })).rejects.toThrow(/知乎 API 403/);

    expect(provider.failures.at(-1)?.operation).toBe("publishDraft");
  });

  it("rejects unsafe live Zhihu API base URLs when using real fetch", () => {
    expect(() => new LiveZhihuProvider({ baseUrl: "http://api.zhihu.com" })).toThrow(/https/);
    expect(() => new LiveZhihuProvider({ baseUrl: "https://example.test" })).toThrow(/非知乎域/);
    expect(() => new LiveZhihuProvider({ baseUrl: "https://api.zhihu.com" })).not.toThrow();
  });
});

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
}

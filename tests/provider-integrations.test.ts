import { describe, expect, it } from "vitest";
import {
  createModelPolicy,
  createRoutedLlmProvider,
  MockLlmProvider,
  RoutedLlmProvider,
  type LlmCallResult,
  type LlmProvider,
} from "../src/providers/llm-provider.js";
import { FallbackZhihuProvider, LiveZhihuProvider, MockZhihuProvider } from "../src/providers/zhihu-provider.js";

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

  it("maps live Zhihu API endpoints into backend topic/evidence/publish shapes", async () => {
    const requested: string[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = input.toString();
      requested.push(`${init?.method ?? "GET"} ${new URL(url).pathname}`);

      if (url.includes("/api/v1/content/hot_list")) {
        return Response.json({
          data: [{ id: "q1", title: "AI 工具是否改变新人评价？", heat: 98, excerpt: "热榜摘要" }],
        });
      }

      if (url.includes("/api/v1/content/zhihu_search")) {
        return Response.json({ data: [{ id: "a1", title: "站内回答", summary: "站内证据" }] });
      }

      if (url.includes("/api/v1/content/global_search")) {
        return Response.json({ data: [{ id: "g1", title: "全网资料", summary: "全网证据" }] });
      }

      if (url.includes("/openapi/ring/detail")) {
        return Response.json({ data: { id: "r1", name: "AI 圈子", description: "圈子描述" } });
      }

      if (url.includes("/openapi/publish/pin")) {
        return Response.json({ data: { id: "p1", url: "https://zhihu.com/pin/p1" } });
      }

      if (url.includes("/openapi/comment/list")) {
        return Response.json({ comments: [{ content: "支持，但想看更多证据" }] });
      }

      if (url.includes("/openapi/comment/create")) {
        return Response.json({ data: { id: "c1" } });
      }

      if (url.includes("/openapi/reaction")) {
        return Response.json({ data: { id: "rx1" } });
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

    expect(topics[0]).toMatchObject({ id: "q1", source: "zhihu_hot" });
    expect(evidence.map((item) => item.source)).toEqual(["zhihu", "global"]);
    expect(publish).toMatchObject({ id: "p1", mode: "live" });
    expect(comments).toEqual(["支持，但想看更多证据"]);
    expect(comment).toMatchObject({ id: "c1", mode: "live" });
    expect(reaction).toMatchObject({ id: "rx1", type: "support" });
    expect(provider.getQuotaStatus().find((quota) => quota.key === "comment_create")?.used).toBe(1);
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

  it("keeps a successful live publish result even when ring detail would fail", async () => {
    const requested: string[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = input.toString();
      requested.push(`${init?.method ?? "GET"} ${new URL(url).pathname}`);

      if (url.includes("/openapi/publish/pin")) {
        return Response.json({ data: { id: "p1", url: "https://zhihu.com/pin/p1" } });
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
      url: "https://zhihu.com/pin/p1",
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
});

import { describe, expect, it } from "vitest";
import { parseEvidencePool, validateDebateTurn, validatePublishDraft } from "../src/llm/schemas.js";
import type { DebateTurn, PublishDraft } from "../src/core/types.js";

type Validator = (payload: unknown) => unknown;

function expectValid(validator: Validator, payload: unknown): void {
  expect(() => validator(payload)).not.toThrow();
  const result = validator(payload);

  if (typeof result === "boolean") {
    expect(result).toBe(true);
  }

  if (result && typeof result === "object" && "success" in result) {
    expect(result).toMatchObject({ success: true });
  }
}

function expectInvalid(validator: Validator, payload: unknown): void {
  let failed = false;

  try {
    const result = validator(payload);
    failed =
      result === false ||
      Boolean(result && typeof result === "object" && "success" in result && result.success === false);
  } catch {
    failed = true;
  }

  expect(failed).toBe(true);
}

describe("LLM JSON schemas", () => {
  it("accepts a valid debate turn with evidence references", () => {
    const validTurn: DebateTurn = {
      id: "turn-liu-1",
      speaker: "liu",
      content: "这个议题不能只看效率，还要看高质量回答者是否仍有动力留下深度解释。",
      evidenceIds: ["ev-zhihu-creator", "ev-global-ai-search"],
      claim: "AI 搜索会放大答案分发效率，但也会改变创作者激励。",
      nextQuestion: "平台应该如何把 AI 摘要流量回流给原作者？",
    };

    expectValid(validateDebateTurn, validTurn);
  });

  it("rejects a debate turn without evidenceIds", () => {
    expectInvalid(validateDebateTurn, {
      id: "turn-opponent-1",
      speaker: "opponent",
      content: "没有引用证据的观点不能进入 demo 辩论区。",
      claim: "AI 搜索不会影响知乎。",
    });
  });

  it("rejects a debate turn with an invalid stance-like field", () => {
    expectInvalid(validateDebateTurn, {
      id: "turn-expert-1",
      speaker: "expert",
      stance: "agree",
      content: "错误 stance 应该被 schema 拦住，避免 LLM 自造枚举污染状态机。",
      evidenceIds: ["ev-1"],
    });
  });

  it("accepts a valid publish draft for the final Zhihu answer", () => {
    const validDraft: PublishDraft = {
      title: "AI 搜索会不会重塑知乎问答生态？",
      opening: "这不是一个简单的替代问题，而是分发、署名、激励和证据质量一起变化的问题。",
      consensus: ["AI 能降低获取信息的门槛", "高质量证据仍需要可追溯来源"],
      disputes: ["AI 摘要是否会削弱原回答流量", "平台是否应该强制展示引用链"],
      questions: ["什么样的引用回流机制对创作者公平？", "评论区的新争议如何进入下一轮圆桌？"],
      disclosure: "本文为黑客松 demo 生成草稿，证据引用来自模拟数据。",
    };

    expectValid(validatePublishDraft, validDraft);
  });

  it("rejects a publish draft missing required question prompts", () => {
    expectInvalid(validatePublishDraft, {
      title: "AI 搜索会不会重塑知乎问答生态？",
      opening: "缺少 questions 会让发布稿无法引导评论反馈。",
      consensus: ["AI 摘要需要证据链"],
      disputes: ["创作者激励仍有争议"],
      disclosure: "本文为黑客松 demo 生成草稿。",
    });
  });

  it("accepts live evidence metadata when building evidence pools", () => {
    const pool = parseEvidencePool({
      evidence: [
        {
          id: "a1",
          source: "zhihu",
          title: "站内回答",
          summary: "站内证据摘要",
          url: "https://www.zhihu.com/question/1/answer/2",
          author: "知乎用户",
          publishedAt: "2026-05-08T00:00:00.000Z",
          relevanceScore: 0.91,
          favoriteCount: 120,
          commentCount: 18,
          stance: "support",
          qualityScore: 86,
        },
      ],
      stancePreview: {
        support: ["站内证据摘要"],
        oppose: [],
        neutral: [],
        background: [],
      },
      warnings: [],
    });

    expect(pool.evidence[0].author).toBe("知乎用户");
    expect(pool.evidence[0].favoriteCount).toBe(120);
  });
});

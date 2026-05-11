import { describe, expect, it } from "vitest";
import {
  parseCommentInsight,
  parseEvidencePool,
  parseViewpointMap,
  validateCommentInsight,
  validateDebateTurn,
  validateExperimentReport,
  validateIdeaVariants,
  validatePublishDraft,
  validatePublishPackage,
} from "../src/llm/schemas.js";
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
      content: "没有引用证据的观点不能进入主持校验区。",
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

  it("accepts a valid publish draft for the final Zhihu discussion post", () => {
    const validDraft: PublishDraft = {
      title: "AI 搜索会不会重塑知乎问答生态？",
      opening: "这不是一个简单的替代问题，而是分发、署名、激励和证据质量一起变化的问题。",
      consensus: ["AI 能降低获取信息的门槛", "高质量证据仍需要可追溯来源"],
      disputes: ["AI 摘要是否会削弱原回答流量", "平台是否应该强制展示引用链"],
      questions: ["什么样的引用回流机制对创作者公平？", "评论区的新争议如何进入下一轮讨论策划？"],
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

  it("accepts publish packages with title options and quality signals", () => {
    expectValid(validatePublishPackage, {
      draft: {
        title: "围绕 AI 工具开个圈子讨论：你站哪一边？",
        opening: "今天刘看山围绕热榜做了一次发布前主持校验。",
        consensus: ["站 A：创作效率提高", "站 B：证据链仍然重要"],
        disputes: ["风险提醒：同质化风险是否会加剧"],
        questions: ["真实创作者如何判断工具边界？"],
        disclosure: "本文由 AI 讨论组织台辅助整理，发布前经过用户确认。",
      },
      titleOptions: ["标题 A", "标题 B", "标题 C"],
      quality: {
        publishable: true,
        score: 88,
        reasons: ["证据清楚", "追问明确"],
        risks: ["需要真实评论补充"],
      },
    });
  });

  it("validates comment insights and experiment reports", () => {
    expectValid(validateCommentInsight, {
      sentiment: { support: 12, oppose: 3, neutral: 5 },
      highQualityComments: ["这个更像社区产品，不只是 AI 工具。"],
      newDisputes: ["冷启动时样本不足怎么办？"],
      nextRoundSuggestions: ["围绕真实反馈权重继续组织下一轮讨论。"],
    });

    expectValid(validateExperimentReport, {
      recommendedVariantId: "C",
      recommendedTitle: "想法试验场",
      conclusion: "用户更愿意参与脑洞众测。",
      whyWinner: ["评论最多", "知乎社区感最强"],
      userConcerns: ["怕撞车", "想看真实反馈"],
      finalPositioning: "想法试验场是脑洞众测工具。",
      mvpFeatures: ["输入脑洞", "生成三版本", "回收反馈"],
      pitchLine: "AI 不替用户判断好想法，知乎真实用户来判断。",
      nextActions: ["继续优化这个方向"],
    });
  });

  it("normalizes richer model objects in viewpoint map arrays", () => {
    const parsed = parseViewpointMap({
      support: [{ point: "支持观点", evidenceIds: ["ev-1"] }],
      oppose: [{ claim: "反方观点" }],
      neutral: ["中立观点"],
      facts: [{ summary: "事实证据" }],
      disputes: [{ question: "争议问题" }],
      followups: [{ text: "下一轮追问" }],
    });

    expect(parsed.support).toEqual(["支持观点"]);
    expect(parsed.oppose).toEqual(["反方观点"]);
    expect(parsed.facts).toEqual(["事实证据"]);
  });

  it("normalizes compact comment analysis responses", () => {
    const parsed = parseCommentInsight({
      sentiment: 0.7,
      comments: [{ content: "高质量评论" }],
      disputes: [{ point: "新争议" }],
      suggestions: [{ text: "下一轮建议" }],
    });

    expect(parsed.sentiment).toEqual({ support: 0, oppose: 0, neutral: 0 });
    expect(parsed.highQualityComments).toEqual(["高质量评论"]);
    expect(parsed.newDisputes).toEqual(["新争议"]);
    expect(parsed.nextRoundSuggestions).toEqual(["下一轮建议"]);
  });

  it("validates idea variants from object or array responses consistently", () => {
    const variants = [
      { id: "A", title: "效率版", oneLiner: "快速生成选题", highlight: "快", risk: "容易同质化" },
      { id: "B", title: "防撞版", oneLiner: "发前查重", highlight: "实用", risk: "社区感不足" },
      { id: "C", title: "众测版", oneLiner: "用户投票吐槽", highlight: "反馈真实", risk: "需要冷启动" },
    ];

    expectValid(validateIdeaVariants, variants);
    expectValid(validateIdeaVariants, { variants });
    expectInvalid(validateIdeaVariants, { variants: variants.slice(0, 2) });
  });
});

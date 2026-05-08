import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App, normalizeSentiment } from "../src/frontend/main.js";

const workflow = {
  topics: [
    {
      id: "topic-1",
      title: "AI 工具是否正在改变职场新人能力评价？",
      hotScore: 92,
      debateScore: 88,
      evidenceScore: 84,
      discussionPotential: 86,
      reason: "适合展开低敏圆桌讨论。",
    },
    {
      id: "topic-2",
      title: "新人作品集中使用 AI 辅助，应该如何说明边界？",
      hotScore: 89,
      debateScore: 91,
      evidenceScore: 83,
      discussionPotential: 90,
      reason: "有创作伦理、能力评价和社区规范三层争议。",
    },
  ],
  snapshot: {
    stage: "feedback",
    selectedTopic: {
      id: "topic-1",
      title: "AI 工具是否正在改变职场新人能力评价？",
      hotScore: 92,
      debateScore: 88,
      evidenceScore: 84,
      discussionPotential: 86,
      reason: "适合展开低敏圆桌讨论。",
    },
    rewrittenQuestion: "企业和用户应该如何重新界定真实能力？",
    evidence: [
      {
        id: "ev-1",
        source: "zhihu",
        title: "管理者担心 AI 掩盖基础能力差异",
        summary: "需要追问过程与复盘证据。",
        stance: "oppose",
        qualityScore: 81,
      },
    ],
    turns: [
      {
        id: "turn-1",
        speaker: "liu",
        content: "先别急着站队，我把问题拆成事实、评价和规则三层。",
        evidenceIds: ["ev-1"],
        claim: "主持控场",
      },
    ],
    viewpointMap: {
      support: ["AI 工具使用能力已经成为一部分工作能力。"],
      oppose: ["流畅输出可能掩盖基础薄弱。"],
      neutral: [],
      facts: ["ev-1: 需要追问过程与复盘证据。"],
      disputes: ["是否要求披露 AI 使用过程。"],
      followups: ["试用期任务如何保留过程证据？"],
    },
    publishDraft: {
      title: "关于 AI 工具的圆桌讨论",
      opening: "今天刘看山圆桌进行了结构化讨论。",
      consensus: ["需要看过程而不只看结果。"],
      disputes: ["披露边界仍有争议。"],
      questions: ["如何保留过程证据？"],
      disclosure: "由 AI 圆桌辅助整理，用户确认发布。",
    },
    titleOptions: ["关于 AI 工具的圆桌讨论"],
    commentInsight: {
      sentiment: { support: 60, oppose: 25, neutral: 15 },
      highQualityComments: ["建议把新人评价拆成三栏。"],
      newDisputes: ["是否提交 AI 对话记录。"],
      nextRoundSuggestions: ["继续围绕过程证据讨论。"],
    },
    agentBriefs: [
      {
        speaker: "liu",
        mission: "主持控场，提醒大家引用证据。",
        tone: "清楚、友善、有一点可爱但不幼稚。",
        mustUseEvidenceIds: ["ev-1"],
        avoid: ["不要替用户下最终结论"],
      },
    ],
    nodeResults: [],
    modelUsages: [],
    statusMessage: "反馈已分析",
  },
  providerMode: "mock",
  providerFailures: [],
  publishResult: {
    id: "mock-pin-1",
    url: "https://www.zhihu.com/pin/mock-pin-1",
    ring: {
      id: "ring-ai-workplace",
      name: "AI 与职场圆桌",
      description: "围绕 AI 工具、职场评价和新人协作的高质量讨论圈子。",
    },
    draft: {
      title: "关于 AI 工具的圆桌讨论",
      opening: "今天刘看山圆桌进行了结构化讨论。",
      consensus: ["需要看过程而不只看结果。"],
      disputes: ["披露边界仍有争议。"],
      questions: ["如何保留过程证据？"],
      disclosure: "由 AI 圆桌辅助整理，用户确认发布。",
    },
    mode: "mock",
    createdAt: "2026-05-08T00:00:00.000Z",
  },
  modelUsages: [],
  nodeResults: [],
};

const switchedWorkflow = {
  ...workflow,
  snapshot: {
    ...workflow.snapshot,
    selectedTopic: workflow.topics[1],
    rewrittenQuestion: "作品集中的 AI 使用边界应该如何披露？",
  },
};

describe("frontend smoke", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the roundtable demo shell from backend workflow data", async () => {
    const workflowRequests: Array<{ url: string; body?: Record<string, unknown> }> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes("/api/workflow/run")) {
        const body = typeof init?.body === "string" ? JSON.parse(init.body) as Record<string, unknown> : undefined;
        workflowRequests.push({ url, body });
        return Response.json(body?.topicId === "topic-2" ? switchedWorkflow : workflow);
      }
      if (url.includes("/api/quota")) {
        return Response.json({ quotas: [] });
      }
      if (url.includes("/api/zhihu/status")) {
        return Response.json({
          mode: "mock",
          accessTokenConfigured: false,
          baseUrlConfigured: false,
          failures: [],
          quotas: [],
        });
      }
      if (url.includes("/api/readiness")) {
        return Response.json({
          report: {
            totalScore: 100,
            awardTargets: ["综合大奖"],
            items: [],
            strongestProof: [],
            missingProof: [],
            demoChecklist: [],
          },
        });
      }
      if (url.includes("/api/workflow/reaction")) {
        return Response.json({ reaction: { id: "rx-1", type: "inspired", mode: "mock" } });
      }
      if (url.includes("/api/workflow/comment")) {
        return Response.json({ comment: { id: "comment-1", content: "主持补充", mode: "mock" } });
      }
      return Response.json({});
    });

    render(<App />);

    await waitFor(() => expect(screen.getByText("完整闭环已就绪")).toBeInTheDocument());
    expect(screen.getByRole("heading", { name: /把热榜变成/ })).toBeInTheDocument();
    expect(screen.getByText("讨论沉淀")).toBeInTheDocument();
    expect(screen.getByText("技术细节 / 评分自检")).toBeInTheDocument();
    expect(screen.getByText("证据池")).toBeInTheDocument();
    expect(screen.getByText("评论回流")).toBeInTheDocument();
    expect(screen.getByText("Agent 任务卡")).toBeInTheDocument();
    expect(screen.getByText("主持控场，提醒大家引用证据。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /路演模式/ })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /生成圈子帖/ }).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: /新人作品集中使用 AI 辅助/ }));
    await waitFor(() => expect(screen.getByRole("heading", { name: /作品集中的 AI 使用边界/ })).toBeInTheDocument());
    expect(workflowRequests.some((request) => request.body?.topicId === "topic-2")).toBe(true);

    fireEvent.click(screen.getAllByRole("button", { name: /生成圈子帖/ })[0]);
    expect(screen.getByRole("dialog", { name: /确认把圆桌结果发布到圈子/ })).toBeInTheDocument();
    expect(screen.getByText(/真实知乎环境下/)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("关闭发布确认"));

    fireEvent.click(screen.getByRole("button", { name: "有启发" }));
    expect(screen.getByRole("dialog", { name: /确认发送「有启发」互动/ })).toBeInTheDocument();
    expect(screen.getByText(/必须由你二次确认/)).toBeInTheDocument();
  });

  it("normalizes comment sentiment counts into display percentages", () => {
    expect(normalizeSentiment({ support: 2, oppose: 1, neutral: 1 })).toEqual({
      support: 50,
      oppose: 25,
      neutral: 25,
    });
    expect(normalizeSentiment({ support: 46, oppose: 31, neutral: 23 })).toEqual({
      support: 46,
      oppose: 31,
      neutral: 23,
    });
    expect(normalizeSentiment({ support: 0, oppose: 0, neutral: 0 })).toEqual({
      support: 0,
      oppose: 0,
      neutral: 0,
    });
  });
});

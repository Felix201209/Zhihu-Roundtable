import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runWorkflow } from "../src/frontend/api.js";
import { App, normalizeSentiment } from "../src/frontend/main.js";

const commentInsight = {
  sentiment: { support: 60, oppose: 25, neutral: 15 },
  highQualityComments: ["建议把新人评价拆成三栏。"],
  newDisputes: ["是否提交 AI 对话记录。"],
  nextRoundSuggestions: ["继续围绕过程证据讨论。"],
};

const workflow = {
  topics: [
    {
      id: "topic-1",
      title: "AI 工具是否正在改变职场新人能力评价？",
      hotScore: 92,
      debateScore: 88,
      evidenceScore: 84,
      discussionPotential: 86,
      reason: "适合展开低敏圈子讨论。",
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
    stage: "publish",
    selectedTopic: {
      id: "topic-1",
      title: "AI 工具是否正在改变职场新人能力评价？",
      hotScore: 92,
      debateScore: 88,
      evidenceScore: 84,
      discussionPotential: 86,
      reason: "适合展开低敏圈子讨论。",
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
      title: "围绕 AI 工具开个圈子讨论：你站哪一边？",
      opening: "今天刘看山进行了发布前主持校验。",
      consensus: ["需要看过程而不只看结果。"],
      disputes: ["披露边界仍有争议。"],
      questions: ["如何保留过程证据？"],
      disclosure: "由 AI 讨论组织台辅助整理，用户确认发布。",
    },
    titleOptions: ["围绕 AI 工具开个圈子讨论：你站哪一边？"],
    commentInsight: undefined,
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
  modelUsages: [],
  nodeResults: [],
};

const publishResult = {
    id: "mock-pin-1",
    url: "https://www.zhihu.com/pin/mock-pin-1",
    ring: {
      id: "ring-ai-workplace",
      name: "AI 与职场讨论圈",
      description: "围绕 AI 工具、职场评价和新人协作的高质量讨论圈子。",
    },
    draft: {
      title: "围绕 AI 工具开个圈子讨论：你站哪一边？",
      opening: "今天刘看山进行了发布前主持校验。",
      consensus: ["需要看过程而不只看结果。"],
      disputes: ["披露边界仍有争议。"],
      questions: ["如何保留过程证据？"],
      disclosure: "由 AI 讨论组织台辅助整理，用户确认发布。",
    },
    mode: "mock",
    createdAt: "2026-05-08T00:00:00.000Z",
};

const switchedWorkflow = {
  ...workflow,
  snapshot: {
    ...workflow.snapshot,
    selectedTopic: workflow.topics[1],
    rewrittenQuestion: "作品集中的 AI 使用边界应该如何披露？",
  },
};

const publishedWorkflow = {
  ...workflow,
  snapshot: {
    ...workflow.snapshot,
    stage: "feedback",
    commentInsight,
  },
  publishResult,
};

const switchedPublishedWorkflow = {
  ...switchedWorkflow,
  snapshot: {
    ...switchedWorkflow.snapshot,
    stage: "feedback",
    commentInsight,
  },
  publishResult,
};

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  readonly listeners = new Map<string, (message: MessageEvent) => void>();
  onerror?: ((event: Event) => void) | null;
  closed = false;

  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }

  addEventListener(name: string, handler: EventListenerOrEventListenerObject) {
    this.listeners.set(name, handler as (message: MessageEvent) => void);
  }

  close() {
    this.closed = true;
  }

  triggerError() {
    this.onerror?.(new Event("error"));
  }

  emit(name: string, payload: unknown) {
    const handler = this.listeners.get(name);
    if (!handler) return;
    handler({ data: JSON.stringify(payload) } as MessageEvent);
  }
}

describe("frontend smoke", () => {
  beforeEach(() => {
    Object.defineProperty(window, "scrollTo", { value: vi.fn(), writable: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
    window.history.pushState(null, "", "/");
    FakeEventSource.instances = [];
    vi.restoreAllMocks();
  });

  it("runs the simplified idea experiment from input to report", async () => {
    const requests: Array<{ url: string; body?: Record<string, unknown> }> = [];
    const baseExperiment = {
      id: "exp-1",
      idea: "我想做一个 AI 工具，帮知乎创作者判断选题有没有撞车，并给出改法。",
      stage: "Generated",
      selectedVariantIds: ["A", "B", "C"],
      variants: [
        {
          id: "A",
          title: "30 秒生成知乎选题",
          oneLiner: "AI 根据热点和你的领域，快速生成可写的知乎选题。",
          highlight: "启动成本低，用户能立刻得到一个结果。",
          risk: "撞车风险高，像普通 AI 写作助手。",
        },
        {
          id: "B",
          title: "选题防撞雷达",
          oneLiner: "发之前先查重，看看你的脑洞有没有撞车，并给出差异化改法。",
          highlight: "实用性强，能解决怕重复的问题。",
          risk: "新意中等，需要社区反馈增强。",
        },
        {
          id: "C",
          title: "想法试验场",
          oneLiner: "把脑洞变成 3 个版本，发到圈子让真实用户投票和吐槽。",
          highlight: "知乎社区参与感强。",
          risk: "需要足够评论样本。",
        },
      ],
      statusMessage: "已生成 3 个可测试版本",
      technicalSnapshot: workflow.snapshot,
      modelUsages: [],
      nodeResults: [],
    };
    const previewExperiment = {
      ...baseExperiment,
      stage: "PublishConfirm",
      postPreview: {
        title: "我有 3 个 AI Hackathon 项目方向，想请大家帮忙选一个最有意思的",
        body: "A：30 秒生成知乎选题\nB：选题防撞雷达\nC：想法试验场\n你更想用哪个？为什么？",
        disclosure: "本文由 AI 想法试验场辅助整理，发布前经过用户确认。",
        optionComments: [
          { variantId: "A", title: "A 30 秒生成知乎选题", content: "A 效率版：30 秒生成知乎选题" },
          { variantId: "B", title: "B 选题防撞雷达", content: "B 防撞版：发之前先看有没有撞车" },
          { variantId: "C", title: "C 想法试验场", content: "C 众测版：让真实用户帮你测试脑洞" },
        ],
      },
    };
    const collectingExperiment = {
      ...previewExperiment,
      stage: "Collecting",
      publishResult: {
        id: "mock-pin-1",
        url: "https://www.zhihu.com/pin/mock-pin-1",
        mode: "mock",
        createdAt: "2026-05-08T00:00:00.000Z",
        optionCommentIds: ["c-a", "c-b", "c-c"],
      },
      demoData: true,
      feedback: [
        { variantId: "A", likes: 32, comments: 6, quality: "low", currentJudgment: "容易撞车", typicalComments: ["这不就是 AI 写作助手吗？"] },
        { variantId: "B", likes: 75, comments: 18, quality: "medium", currentJudgment: "有实用性", typicalComments: ["防撞有用，但最好加真实用户投票。"] },
        { variantId: "C", likes: 129, comments: 34, quality: "high", currentJudgment: "最有潜力", typicalComments: ["这个更像知乎社区产品，不只是 AI 工具。"] },
      ],
    };
    const reportExperiment = {
      ...collectingExperiment,
      stage: "ReportReady",
      report: {
        recommendedVariantId: "C",
        recommendedTitle: "C 想法试验场",
        conclusion: "用户更愿意参与帮脑洞投票和吐槽。",
        whyWinner: ["点赞最多", "有效反馈最多", "最有知乎社区感"],
        userConcerns: ["用户怕项目撞车", "用户希望看到真实反馈"],
        finalPositioning: "想法试验场是一个脑洞众测工具。",
        pitchLine: "AI 不替用户判断什么是好想法，知乎真实用户来判断。",
        mvpFeatures: ["输入脑洞", "生成 3 个版本", "发圈子测试"],
        nextActions: ["继续优化这个方向", "生成路演稿", "再做一轮测试"],
      },
    };

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      const body = typeof init?.body === "string" ? JSON.parse(init.body) as Record<string, unknown> : undefined;
      requests.push({ url, body });
      if (url.includes("/api/experiment/generate")) {
        return Response.json({ experiment: baseExperiment, modelUsages: [], nodeResults: [] });
      }
      if (url.includes("/api/experiment/publish-preview")) {
        return Response.json({ experiment: previewExperiment, modelUsages: [], nodeResults: [] });
      }
      if (url.includes("/api/experiment/confirm-publish")) {
        return Response.json({ experiment: collectingExperiment, modelUsages: [], nodeResults: [] });
      }
      if (url.includes("/api/experiment/collect")) {
        return Response.json({ experiment: collectingExperiment, demoData: true, modelUsages: [], nodeResults: [] });
      }
      if (url.includes("/api/experiment/report")) {
        return Response.json({ experiment: reportExperiment, report: reportExperiment.report, modelUsages: [], nodeResults: [] });
      }
      if (url.includes("/api/workflow/run")) {
        const body = typeof init?.body === "string" ? JSON.parse(init.body) as Record<string, unknown> : undefined;
        return Response.json(body?.topicId === "topic-2" ? switchedWorkflow : workflow);
      }
      if (url.includes("/api/topics")) {
        return Response.json({ topics: workflow.topics });
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
      return Response.json({});
    });

    render(<App />);

    expect(screen.getByRole("heading", { name: "知辩圆桌" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /从热榜生成讨论方案/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /测试一个脑洞/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /测试一个脑洞/ }));
    expect(screen.getByRole("heading", { name: "想法试验场" })).toBeInTheDocument();
    expect(screen.getByLabelText("输入你的脑洞")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("输入你的脑洞"), { target: { value: baseExperiment.idea } });
    fireEvent.click(screen.getByRole("button", { name: /开始试验/ }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "生成了 3 个可测试版本" })).toBeInTheDocument());
    expect(screen.getByRole("heading", { name: "30 秒生成知乎选题" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "选题防撞雷达" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "想法试验场" })).toBeInTheDocument();
    expect(screen.getAllByRole("checkbox").every((checkbox) => (checkbox as HTMLInputElement).checked)).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: /发布到圈子测试/ }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "发布前确认" })).toBeInTheDocument());
    expect(screen.getByText(/主帖预览/)).toBeInTheDocument();
    expect(screen.getByText(/C 众测版/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /确认发布/ }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "实验进行中" })).toBeInTheDocument());
    expect(screen.getByText("演示数据")).toBeInTheDocument();
    expect(screen.getByText("最有潜力")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /生成试验报告/ }));
    await waitFor(() => expect(screen.getByText("推荐方向")).toBeInTheDocument());
    expect(screen.getByRole("heading", { name: "C 想法试验场" })).toBeInTheDocument();
    expect(screen.getByText("AI 不替用户判断什么是好想法，知乎真实用户来判断。")).toBeInTheDocument();
    expect(screen.getByText("技术细节 / 评委验证")).toBeInTheDocument();
    expect(requests.some((request) => request.url.includes("/api/experiment/confirm-publish"))).toBe(true);
  });

  it("runs the primary hot-list roundtable path from radar to comment feedback", async () => {
    const requests: Array<{ url: string; body?: Record<string, unknown> }> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      const body = typeof init?.body === "string" ? JSON.parse(init.body) as Record<string, unknown> : undefined;
      requests.push({ url, body });

      if (url.includes("/api/topics")) {
        return Response.json({ topics: workflow.topics });
      }
      if (url.includes("/api/workflow/run")) {
        return Response.json(body?.topicId === "topic-2" ? switchedWorkflow : workflow);
      }
      if (url.includes("/api/workflow/confirmation")) {
        return Response.json({
          confirmation: { action: "publish", token: "confirm-token", expiresAt: "2026-05-08T00:05:00.000Z" },
        });
      }
      if (url.includes("/api/workflow/confirm-publish")) {
        return Response.json({ ...workflow, snapshot: workflow.snapshot, publishResult });
      }
      if (url.includes("/api/workflow/feedback")) {
        return Response.json({ snapshot: publishedWorkflow.snapshot, modelUsages: [], nodeResults: [] });
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
            totalScore: 98,
            awardTargets: ["综合大奖"],
            items: [],
            strongestProof: [],
            missingProof: [],
            demoChecklist: [],
          },
        });
      }
      return Response.json({});
    });

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /从热榜生成讨论方案/ }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "选题雷达" })).toBeInTheDocument());
    expect(screen.getByText("AI 工具是否正在改变职场新人能力评价？")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: /生成讨论方案/ })[0]);
    await waitFor(() => expect(screen.getByRole("heading", { name: "讨论方案准备" })).toBeInTheDocument());
    expect(screen.getAllByText("知乎站内").length).toBeGreaterThan(0);
    expect(screen.getByText(/AI 会标注观点来源/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /让刘看山校验讨论方案/ }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "刘看山主持校验" })).toBeInTheDocument());
    expect(screen.getByText("站内观点席")).toBeInTheDocument();
    expect(screen.getByText("反方校验席")).toBeInTheDocument();
    expect(screen.queryByText("知乎大 V")).not.toBeInTheDocument();
    expect(screen.queryByText("反方刺客")).not.toBeInTheDocument();
    expect(screen.getByText(/来源：知乎站内/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /生成发布策划/ }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "发布策划与圈子帖预览" })).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /确认发布到圈子/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /确认发布到圈子/ }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "评论复盘与下一轮创作" })).toBeInTheDocument());
    expect(screen.getByText("下一轮创作/讨论建议")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /开启下一轮讨论策划/ })).toBeInTheDocument();
    expect(requests.some((request) => request.url.includes("/api/workflow/confirm-publish"))).toBe(true);
  });

  it("uses workflow SSE in browsers that support EventSource", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/api/topics")) {
        return Response.json({ topics: workflow.topics });
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
            totalScore: 98,
            awardTargets: ["综合大奖"],
            items: [],
            strongestProof: [],
            missingProof: [],
            demoChecklist: [],
          },
        });
      }
      return Response.json({});
    });
    Object.defineProperty(window, "EventSource", { value: FakeEventSource, configurable: true });

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /从热榜生成讨论方案/ }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "选题雷达" })).toBeInTheDocument());
    fireEvent.click(screen.getAllByRole("button", { name: /生成讨论方案/ })[0]);

    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    const source = FakeEventSource.instances[0];
    expect(source.url).toContain("/api/workflow/stream");
    expect(source.url).toContain("topicId=topic-1");

    act(() => {
      source.emit("radar", {
        type: "radar",
        topics: workflow.topics,
        snapshot: { stage: "radar", evidence: [], turns: [], statusMessage: "雷达已就绪" },
        node: { id: "hot_list", label: "热榜拉取", status: "completed", summary: "完成", startedAt: "2026-05-08T00:00:00.000Z" },
      });
      source.emit("prepare", {
        type: "prepare",
        snapshot: { ...workflow.snapshot, stage: "prepare", turns: [], publishDraft: undefined },
        node: { id: "evidence_pool", label: "证据池", status: "completed", summary: "完成", startedAt: "2026-05-08T00:00:00.000Z" },
      });
    });
    expect(screen.getByRole("heading", { name: "讨论方案准备" })).toBeInTheDocument();

    act(() => {
      source.emit("debate_turn", {
        type: "debate_turn",
        snapshot: { ...workflow.snapshot, stage: "prepare" },
        turn: workflow.snapshot.turns[0],
        node: { id: "debate", label: "发言", status: "completed", summary: "完成", startedAt: "2026-05-08T00:00:00.000Z" },
      });
      source.emit("publish", {
        type: "publish",
        snapshot: workflow.snapshot,
        node: { id: "publish_confirm", label: "发布预览", status: "completed", summary: "完成", startedAt: "2026-05-08T00:00:00.000Z" },
      });
    });

    await waitFor(() => expect(screen.getByRole("heading", { name: "讨论方案准备" })).toBeInTheDocument());
    expect(screen.queryByRole("heading", { name: "发布策划与圈子帖预览" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /让刘看山校验讨论方案/ }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "刘看山主持校验" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /生成发布策划/ }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "发布策划与圈子帖预览" })).toBeInTheDocument());
    expect(source.closed).toBe(true);
  });

  it("retries SSE once and falls back to workflow run when the stream stays broken", async () => {
    const requests: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      requests.push(url);
      if (url.includes("/api/topics")) {
        return Response.json({ topics: workflow.topics });
      }
      if (url.includes("/api/workflow/run")) {
        return Response.json(workflow);
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
            totalScore: 98,
            awardTargets: ["综合大奖"],
            items: [],
            strongestProof: [],
            missingProof: [],
            demoChecklist: [],
          },
        });
      }
      return Response.json({});
    });
    Object.defineProperty(window, "EventSource", { value: FakeEventSource, configurable: true });

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /从热榜生成讨论方案/ }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "选题雷达" })).toBeInTheDocument());
    fireEvent.click(screen.getAllByRole("button", { name: /生成讨论方案/ })[0]);
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));

    act(() => {
      FakeEventSource.instances[0].triggerError();
    });
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(2));

    act(() => {
      FakeEventSource.instances[1].triggerError();
    });

    await waitFor(() => expect(screen.getByRole("heading", { name: "讨论方案准备" })).toBeInTheDocument());
    expect(requests.some((url) => url.includes("/api/workflow/run"))).toBe(true);
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

  it("allows the demo frontend to switch model policy through URL parameters", async () => {
    let requestBody: Record<string, unknown> | undefined;
    window.history.pushState(
      null,
      "",
      "/?modelMode=auto&defaultProvider=kimi&fallbackToMock=false&kimiModel=kimi-k2.6-live",
    );
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      requestBody = typeof init?.body === "string" ? JSON.parse(init.body) as Record<string, unknown> : undefined;
      return Response.json(workflow);
    });

    await runWorkflow(false, "topic-2");

    expect(requestBody).toMatchObject({
      topicId: "topic-2",
      modelPolicy: {
        mode: "auto",
        defaultProvider: "kimi",
        fallbackToMock: "false",
        kimiModel: "kimi-k2.6-live",
      },
    });
  });
});

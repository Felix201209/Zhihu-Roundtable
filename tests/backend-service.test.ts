import { describe, expect, it } from "vitest";
import { MemoryCache } from "../src/backend/cache.js";
import { encodeSseEvent } from "../src/backend/sse.js";
import { RoundtableWorkflowService } from "../src/backend/workflow-service.js";
import { MockZhihuProvider, type ZhihuProvider } from "../src/providers/zhihu-provider.js";

class LiveModeMockZhihuProvider implements ZhihuProvider {
  readonly mode = "live" as const;
  private readonly mock = new MockZhihuProvider();

  getHotTopics = () => this.mock.getHotTopics();
  searchEvidence = (topic: Parameters<MockZhihuProvider["searchEvidence"]>[0]) => this.mock.searchEvidence(topic);
  getDefaultRing = () => this.mock.getDefaultRing();
  publishDraft = (input: Parameters<MockZhihuProvider["publishDraft"]>[0]) => this.mock.publishDraft(input);
  listComments = (input: Parameters<MockZhihuProvider["listComments"]>[0]) => this.mock.listComments(input);
  createComment = (input: Parameters<MockZhihuProvider["createComment"]>[0]) => this.mock.createComment(input);
  react = (input: Parameters<MockZhihuProvider["react"]>[0]) => this.mock.react(input);
  getQuotaStatus = () => this.mock.getQuotaStatus();
  getCachedCommentInsight = (topicId: string) => this.mock.getCachedCommentInsight(topicId);
}

describe("backend workflow service", () => {
  it("runs the complete backend workflow with mock publish and feedback", async () => {
    const service = new RoundtableWorkflowService();
    const result = await service.runFullWorkflow({ publish: true });

    expect(result.providerMode).toBe("mock");
    expect(result.snapshot.stage).toBe("feedback");
    expect(result.snapshot.selectedTopic).toBeDefined();
    expect(result.snapshot.evidence.length).toBeGreaterThanOrEqual(3);
    expect(result.snapshot.turns.length).toBeGreaterThanOrEqual(4);
    expect(result.snapshot.publishDraft).toBeDefined();
    expect(result.publishResult?.mode).toBe("mock");
    expect(result.snapshot.commentInsight?.nextRoundSuggestions.length).toBeGreaterThan(0);
    expect(result.modelUsages.map((usage) => usage.role)).toEqual(
      expect.arrayContaining([
        "question",
        "evidence",
        "briefing",
        "debate",
        "synthesis",
        "publish",
        "feedback",
      ]),
    );
    expect(result.nodeResults.map((node) => node.id)).toEqual(
      expect.arrayContaining([
        "hot_list",
        "topic_selection",
        "question_rewrite",
        "evidence_pool",
        "agent_briefing",
        "debate",
        "viewpoint_map",
        "publish_draft",
        "publish",
        "comment_feedback",
      ]),
    );
  });

  it("stops at publish preview when the user has not confirmed publishing", async () => {
    const service = new RoundtableWorkflowService();
    const result = await service.runFullWorkflow({ publish: false });

    expect(result.snapshot.stage).toBe("publish");
    expect(result.snapshot.publishDraft).toBeDefined();
    expect(result.publishResult).toBeUndefined();
    expect(result.snapshot.commentInsight).toBeUndefined();
    expect(result.nodeResults.map((node) => node.id)).not.toContain("comment_feedback");
  });

  it("streams stage events in UI-friendly order", async () => {
    const service = new RoundtableWorkflowService();
    const events = [];

    for await (const event of service.streamWorkflow()) {
      events.push(event);
    }

    expect(events.map((event) => event.type)).toEqual([
      "radar",
      "prepare",
      "agent_briefing",
      "debate_turn",
      "debate_turn",
      "debate_turn",
      "debate_turn",
      "debate_done",
      "publish",
    ]);
    expect(events.at(-1)?.type).toBe("publish");
  });

  it("streams feedback only after publish is explicitly enabled", async () => {
    const service = new RoundtableWorkflowService();
    const events = [];

    for await (const event of service.streamWorkflow({ publish: true })) {
      events.push(event);
    }

    expect(events.map((event) => event.type)).toContain("feedback");
    expect(events.at(-1)?.type).toBe("feedback");
  });

  it("requires publish-stage snapshots before confirming publish", async () => {
    const service = new RoundtableWorkflowService();
    const initial = await service.createInitialSnapshot();

    await expect(service.confirmPublishWithSnapshot(initial)).rejects.toThrow(/publish 阶段/);
  });

  it("blocks direct live publish calls unless an explicit confirmation path allows them", async () => {
    const previous = process.env.ALLOW_LIVE_WRITES;
    delete process.env.ALLOW_LIVE_WRITES;
    try {
      const service = new RoundtableWorkflowService({
        zhihuProvider: new LiveModeMockZhihuProvider(),
      });

      await expect(service.runFullWorkflow({ publish: true })).rejects.toThrow(/live 写操作需要显式用户确认/);
      await expect(service.createHostComment({
        publishId: "live-pin-1",
        content: "刘看山补充：欢迎继续围绕证据讨论。",
      })).rejects.toThrow(/live 写操作需要显式用户确认/);
      await expect(service.react({ targetId: "live-pin-1", type: "inspired" })).rejects.toThrow(/live 写操作需要显式用户确认/);

      const generated = await service.generateIdeaExperiment({
        idea: "帮知乎创作者把热榜改成可组织讨论的圈子活动。",
      });
      const preview = service.createExperimentPublishPreview({ experiment: generated });
      await expect(service.confirmExperimentPublish({ experiment: preview })).rejects.toThrow(/live 写操作需要显式用户确认/);

      await expect(service.createHostComment(
        { publishId: "live-pin-1", content: "刘看山补充：欢迎继续围绕证据讨论。" },
        { allowLiveWrite: true },
      )).resolves.toMatchObject({ mode: "mock" });
      await expect(service.react(
        { targetId: "live-pin-1", type: "inspired" },
        { allowLiveWrite: true },
      )).resolves.toMatchObject({ type: "inspired" });
    } finally {
      process.env.ALLOW_LIVE_WRITES = previous;
    }
  });

  it("caches radar topics through MemoryCache", async () => {
    const cache = new MemoryCache(60_000);
    const service = new RoundtableWorkflowService({
      cache,
      zhihuProvider: new MockZhihuProvider(),
    });

    const first = await service.getRadar();
    const second = await service.getRadar();

    expect(first).toStrictEqual(second);
    expect(first.length).toBeGreaterThan(0);
  });

  it("encodes workflow events as valid SSE chunks", async () => {
    const service = new RoundtableWorkflowService();
    const iterator = service.streamWorkflow();
    const first = await iterator.next();

    expect(first.done).toBe(false);
    expect(encodeSseEvent(first.value)).toContain("event: radar");
    expect(encodeSseEvent(first.value)).toContain("data:");
  });
});

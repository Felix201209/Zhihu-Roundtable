import { describe, expect, it } from "vitest";
import { MemoryCache } from "../src/backend/cache.js";
import { encodeSseEvent } from "../src/backend/sse.js";
import { RoundtableWorkflowService } from "../src/backend/workflow-service.js";
import { MockZhihuProvider } from "../src/providers/zhihu-provider.js";

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
      "feedback",
    ]);
    expect(events.at(-1)?.type).toBe("feedback");
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

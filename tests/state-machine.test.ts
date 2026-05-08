import { describe, expect, it } from "vitest";
import {
  analyzeFeedback,
  createInitialSnapshot,
  generatePublishDraft,
  prepareTopic,
  runDebate,
  runFullDemo,
  selectTopic,
} from "../src/core/state-machine.js";
import type { RoundtableSnapshot } from "../src/core/types.js";

const expectedStages: RoundtableSnapshot["stage"][] = [
  "radar",
  "prepare",
  "debate",
  "publish",
  "feedback",
];

describe("demo-first state machine", () => {
  function defaultTopicId(): string {
    const topicId = runFullDemo().selectedTopic?.id;
    expect(topicId).toBeTruthy();
    return topicId as string;
  }

  function runDemoStages(topicId = defaultTopicId()): RoundtableSnapshot[] {
    const selected = selectTopic(createInitialSnapshot(), topicId);
    const prepared = prepareTopic(selected);
    const debated = runDebate(prepared);
    const drafted = generatePublishDraft(debated);
    const feedback = analyzeFeedback(drafted);

    return [selected, prepared, debated, drafted, feedback];
  }

  it("runs the full hackathon demo from topic radar to feedback loop", () => {
    const snapshots = runDemoStages();

    expect(snapshots.map((snapshot) => snapshot.stage)).toEqual(expectedStages);

    const finalSnapshot = snapshots.at(-1);
    expect(finalSnapshot).toBeDefined();
    expect(finalSnapshot?.selectedTopic?.title).toMatch(/知乎|AI|问答|圆桌/);
    expect(finalSnapshot?.rewrittenQuestion).toBeTruthy();
    expect(finalSnapshot?.evidence.length).toBeGreaterThanOrEqual(3);
    expect(finalSnapshot?.turns.length).toBeGreaterThanOrEqual(4);
    expect(finalSnapshot?.viewpointMap?.support.length).toBeGreaterThan(0);
    expect(finalSnapshot?.viewpointMap?.oppose.length).toBeGreaterThan(0);
    expect(finalSnapshot?.publishDraft?.title).toMatch(/知乎|AI|问答|圆桌/);
    expect(finalSnapshot?.commentInsight?.nextRoundSuggestions.length).toBeGreaterThan(0);
  });

  it("rejects stage calls in the wrong order", () => {
    const topicId = defaultTopicId();
    const initial = createInitialSnapshot();
    const selected = selectTopic(initial, topicId);
    const prepared = prepareTopic(selected);

    expect(() => prepareTopic(initial)).toThrow(/选题|select|radar/i);
    expect(() => runDebate(selected)).toThrow(/准备|prepare/i);
    expect(() => generatePublishDraft(prepared)).toThrow(/辩论|debate/i);
    expect(() => analyzeFeedback(runDebate(prepared))).toThrow(/发布|publish/i);
  });

  it("updates snapshots immutably across stages", () => {
    const initial = createInitialSnapshot();
    const initialBefore = structuredClone(initial);

    const selected = selectTopic(initial, defaultTopicId());
    const selectedBefore = structuredClone(selected);
    const prepared = prepareTopic(selected);

    expect(selected).not.toBe(initial);
    expect(prepared).not.toBe(selected);
    expect(initial).toEqual(initialBefore);
    expect(selected).toEqual(selectedBefore);
    expect(initial.selectedTopic).toBeUndefined();
    expect(selected.evidence).toHaveLength(0);
    expect(prepared.evidence.length).toBeGreaterThanOrEqual(3);
    expect(prepared.evidence).not.toBe(selected.evidence);
  });

  it("selects a default demo topic for one-command full demo runs", () => {
    const selected = runFullDemo();

    expect(selected.stage).toBe("feedback");
    expect(selected.selectedTopic).toBeDefined();
    expect(selected.selectedTopic?.id).toBeTruthy();
    expect(selected.selectedTopic?.title).toMatch(/知乎|AI|问答|圆桌/);
    expect(selected.selectedTopic?.hotScore).toBeGreaterThan(0);
    expect(selected.selectedTopic?.debateScore).toBeGreaterThan(0);
    expect(selected.selectedTopic?.evidenceScore).toBeGreaterThan(0);
    expect(selected.statusMessage).toMatch(/反馈|完成|分析/);
    expect(selected.publishDraft).toBeDefined();
    expect(selected.commentInsight).toBeDefined();
  });

  it("can select an explicit topic id for a live demo variation", () => {
    const topicId = defaultTopicId();

    const selected = selectTopic(createInitialSnapshot(), topicId);

    expect(selected.stage).toBe("radar");
    expect(selected.selectedTopic?.id).toBe(topicId);
    expect(selected.selectedTopic?.title).toMatch(/知乎|AI|问答|圆桌|新人|能力/);
  });
});

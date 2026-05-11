import {
  demoCommentInsights,
  demoDebateTurns,
  demoEvidence,
  demoPublishDrafts,
  demoTopics,
  demoViewpointMaps,
} from "../demo/demo-data.js";
import type { RoundtableSnapshot, RoundtableStage, Topic } from "./types.js";

const STAGE_ORDER: RoundtableStage[] = ["radar", "prepare", "debate", "publish", "feedback"];

// Demo runner only: deterministic cached snapshots for tests, screenshots, and offline judging.
// Production workflow logic lives in backend/workflow-service.ts.

function cloneTopic(topic: Topic): Topic {
  return { ...topic };
}

function assertStage(snapshot: RoundtableSnapshot, expected: RoundtableStage, action: string): void {
  if (snapshot.stage !== expected) {
    throw new Error(`${action} 只能在 ${expected} 阶段调用，当前阶段是 ${snapshot.stage}。固定流程为 ${STAGE_ORDER.join(" -> ")}。`);
  }
}

function requireSelectedTopic(snapshot: RoundtableSnapshot, action: string): Topic {
  if (!snapshot.selectedTopic) {
    throw new Error(`${action} 需要先选题。`);
  }

  return snapshot.selectedTopic;
}

function resolveTopic(topicIdOrTopic: string | Topic | undefined = demoTopics[0]?.id): Topic {
  if (!topicIdOrTopic) {
    throw new Error("selectTopic 需要至少一个 demo 话题。");
  }

  if (typeof topicIdOrTopic !== "string") {
    return topicIdOrTopic;
  }

  const topic = demoTopics.find((item) => item.id === topicIdOrTopic);

  if (!topic) {
    throw new Error(`找不到话题 ${topicIdOrTopic}，请使用 demoTopics 中的有效 id。`);
  }

  return topic;
}

export function createInitialSnapshot(): RoundtableSnapshot {
  return {
    stage: "radar",
    evidence: [],
    turns: [],
    statusMessage: "话题雷达已就绪",
  };
}

export function selectTopic(snapshot: RoundtableSnapshot, topicIdOrTopic?: string | Topic): RoundtableSnapshot {
  assertStage(snapshot, "radar", "selectTopic");

  const selectedTopic = resolveTopic(topicIdOrTopic);

  return {
    ...snapshot,
    selectedTopic: cloneTopic(selectedTopic),
    statusMessage: "已选择话题",
  };
}

export function prepareTopic(snapshot: RoundtableSnapshot): RoundtableSnapshot {
  assertStage(snapshot, "radar", "prepareTopic");

  const selectedTopic = requireSelectedTopic(snapshot, "prepareTopic");
  const evidence = demoEvidence[selectedTopic.id];

  if (!evidence) {
    throw new Error(`话题 ${selectedTopic.id} 缺少证据缓存。`);
  }

  return {
    ...snapshot,
    stage: "prepare",
    rewrittenQuestion: `${selectedTopic.title}企业和新人应该如何重新界定真实能力？`,
    evidence: evidence.map((item) => ({ ...item })),
    turns: [],
    viewpointMap: undefined,
    publishDraft: undefined,
    commentInsight: undefined,
    statusMessage: "证据已准备",
  };
}

export function runDebate(snapshot: RoundtableSnapshot): RoundtableSnapshot {
  assertStage(snapshot, "prepare", "runDebate");

  const selectedTopic = requireSelectedTopic(snapshot, "runDebate");
  const turns = demoDebateTurns[selectedTopic.id];
  const viewpointMap = demoViewpointMaps[selectedTopic.id];

  if (!turns || !viewpointMap) {
    throw new Error(`话题 ${selectedTopic.id} 缺少主持校验缓存。`);
  }

  return {
    ...snapshot,
    stage: "debate",
    turns: turns.map((turn) => ({
      ...turn,
      evidenceIds: [...turn.evidenceIds],
      claimSources: turn.claimSources?.map((source) => ({ ...source })),
    })),
    viewpointMap: {
      support: [...viewpointMap.support],
      oppose: [...viewpointMap.oppose],
      neutral: [...viewpointMap.neutral],
      facts: [...viewpointMap.facts],
      disputes: [...viewpointMap.disputes],
      followups: [...viewpointMap.followups],
    },
    statusMessage: "主持校验已完成",
  };
}

export function generatePublishDraft(snapshot: RoundtableSnapshot): RoundtableSnapshot {
  assertStage(snapshot, "debate", "generatePublishDraft");

  const selectedTopic = requireSelectedTopic(snapshot, "generatePublishDraft");
  const publishDraft = demoPublishDrafts[selectedTopic.id];

  if (!publishDraft) {
    throw new Error(`话题 ${selectedTopic.id} 缺少发布稿缓存。`);
  }

  return {
    ...snapshot,
    stage: "publish",
    publishDraft: {
      ...publishDraft,
      consensus: [...publishDraft.consensus],
      disputes: [...publishDraft.disputes],
      questions: [...publishDraft.questions],
      claimSources: publishDraft.claimSources?.map((source) => ({ ...source })),
    },
    statusMessage: "发布稿已生成",
  };
}

export function analyzeFeedback(snapshot: RoundtableSnapshot): RoundtableSnapshot {
  assertStage(snapshot, "publish", "analyzeFeedback");

  const selectedTopic = requireSelectedTopic(snapshot, "analyzeFeedback");
  const commentInsight = demoCommentInsights[selectedTopic.id];

  if (!commentInsight) {
    throw new Error(`话题 ${selectedTopic.id} 缺少评论洞察缓存。`);
  }

  return {
    ...snapshot,
    stage: "feedback",
    commentInsight: {
      sentiment: { ...commentInsight.sentiment },
      highQualityComments: [...commentInsight.highQualityComments],
      newDisputes: [...commentInsight.newDisputes],
      nextRoundSuggestions: [...commentInsight.nextRoundSuggestions],
    },
    statusMessage: "反馈已分析",
  };
}

export function runFullDemo(topicId = demoTopics[0]?.id): RoundtableSnapshot {
  if (!topicId) {
    throw new Error("runFullDemo 需要至少一个 demo 话题。");
  }

  const selected = selectTopic(createInitialSnapshot(), topicId);
  const prepared = prepareTopic(selected);
  const debated = runDebate(prepared);
  const drafted = generatePublishDraft(debated);

  return analyzeFeedback(drafted);
}

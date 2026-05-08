import { pathToFileURL } from "node:url";
import {
  analyzeFeedback,
  createInitialSnapshot,
  generatePublishDraft,
  prepareTopic,
  runDebate,
  runFullDemo,
  selectTopic,
} from "../core/state-machine.js";
import type { RoundtableSnapshot } from "../core/types.js";

type StageSummary = {
  label: string;
  detail: string;
};

const stageNames: Record<RoundtableSnapshot["stage"], string> = {
  radar: "热点雷达",
  prepare: "议题准备",
  debate: "圆桌辩论",
  publish: "发布草稿",
  feedback: "评论反馈",
};

function summarizeSnapshot(snapshot: RoundtableSnapshot, index: number): StageSummary {
  const topic = snapshot.selectedTopic?.title ?? "尚未选题";

  switch (snapshot.stage) {
    case "radar":
      return {
        label: `${index}. ${stageNames.radar}`,
        detail: `当前选题：${topic}。${snapshot.statusMessage}`,
      };
    case "prepare":
      return {
        label: `${index}. ${stageNames.prepare}`,
        detail: [
          `问题改写：${snapshot.rewrittenQuestion ?? "待生成"}`,
          `证据数量：${snapshot.evidence.length}`,
          snapshot.statusMessage,
        ].join("；"),
      };
    case "debate":
      return {
        label: `${index}. ${stageNames.debate}`,
        detail: [
          `观点回合：${snapshot.turns.length}`,
          `支持点：${snapshot.viewpointMap?.support.length ?? 0}`,
          `反对点：${snapshot.viewpointMap?.oppose.length ?? 0}`,
          `待追问：${snapshot.viewpointMap?.followups.length ?? 0}`,
          snapshot.statusMessage,
        ].join("；"),
      };
    case "publish":
      return {
        label: `${index}. ${stageNames.publish}`,
        detail: [
          `标题：${snapshot.publishDraft?.title ?? "待生成"}`,
          `共识：${snapshot.publishDraft?.consensus.length ?? 0}`,
          `争议：${snapshot.publishDraft?.disputes.length ?? 0}`,
          snapshot.statusMessage,
        ].join("；"),
      };
    case "feedback":
      return {
        label: `${index}. ${stageNames.feedback}`,
        detail: [
          `支持 ${snapshot.commentInsight?.sentiment.support ?? 0}`,
          `反对 ${snapshot.commentInsight?.sentiment.oppose ?? 0}`,
          `中立 ${snapshot.commentInsight?.sentiment.neutral ?? 0}`,
          `下一轮建议：${snapshot.commentInsight?.nextRoundSuggestions.length ?? 0}`,
          snapshot.statusMessage,
        ].join("；"),
      };
  }
}

export function printDemoSummary(snapshots: RoundtableSnapshot[]): void {
  console.log("知乎黑客松核心 Demo：AI 圆桌问答工作流");
  console.log("目标：从热点识别到证据辩论、发布草稿和评论反馈，跑通一条可展示闭环。");
  console.log("");

  snapshots.forEach((snapshot, index) => {
    const summary = summarizeSnapshot(snapshot, index + 1);
    console.log(`【${summary.label}】`);
    console.log(summary.detail);
    console.log("");
  });
}

export function buildDemoSnapshots(topicId = runFullDemo().selectedTopic?.id): RoundtableSnapshot[] {
  if (!topicId) {
    throw new Error("无法运行 demo：缺少默认话题。");
  }

  const selected = selectTopic(createInitialSnapshot(), topicId);
  const prepared = prepareTopic(selected);
  const debated = runDebate(prepared);
  const drafted = generatePublishDraft(debated);
  const feedback = analyzeFeedback(drafted);

  return [selected, prepared, debated, drafted, feedback];
}

export function runDemo(): RoundtableSnapshot[] {
  const snapshots = buildDemoSnapshots();
  printDemoSummary(snapshots);
  return snapshots;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runDemo();
}

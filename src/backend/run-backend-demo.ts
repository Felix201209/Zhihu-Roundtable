import { pathToFileURL } from "node:url";
import { loadLocalEnv } from "./env.js";
import { RoundtableWorkflowService } from "./workflow-service.js";

const stageLabels: Record<string, string> = {
  radar: "选题雷达",
  prepare: "讨论方案准备",
  debate: "刘看山主持校验",
  publish: "发布策划",
  feedback: "评论复盘",
};

const nodeLabels: Record<string, string> = {
  topic_selection: "话题选择",
  hot_list: "热榜拉取",
  topic_scoring: "讨论潜力评分",
  question_rewrite: "议题重构",
  evidence_pool: "证据池",
  agent_briefing: "主持席位任务卡",
  debate: "主持校验",
  viewpoint_map: "讨论包沉淀",
  publish_draft: "发布策划",
  publish_confirm: "发布确认",
  publish: "确认发布",
  comment_feedback: "评论复盘",
};

const roleLabels: Record<string, string> = {
  question: "议题重构",
  evidence: "证据组织",
  briefing: "主持任务卡",
  debate: "主持校验发言",
  synthesis: "讨论包沉淀",
  publish: "发布策划",
  feedback: "评论复盘",
};

loadLocalEnv();

if (process.env.ALLOW_LIVE_BACKEND_DEMO !== "1") {
  process.env.ZHIHU_PROVIDER = "mock";
  delete process.env.ZHIHU_API_BASE_URL;
}

export async function runBackendDemo(): Promise<void> {
  const service = new RoundtableWorkflowService({
    modelPolicy: process.env.ALLOW_LIVE_BACKEND_DEMO === "1" ? undefined : { mode: "mock" },
  });
  const result = await service.runFullWorkflow({ publish: true });
  const topic = result.snapshot.selectedTopic;

  console.log("知辩圆桌后端工作流 Demo");
  console.log(`provider: ${result.providerMode}`);
  console.log(`topic: ${topic?.title ?? "unknown"}`);
  console.log(`stage: ${formatStage(result.snapshot.stage)}`);
  console.log(`evidence: ${result.snapshot.evidence.length}`);
  console.log(`turns: ${result.snapshot.turns.length}`);
  console.log(`draft: ${result.snapshot.publishDraft?.title ?? "none"}`);
  console.log(`published: ${result.publishResult?.url ?? "not requested"}`);
  console.log(`nodes: ${result.nodeResults.map((node) => `${formatNode(node.id)}:${node.status}`).join(" -> ")}`);
  console.log(
    `models: ${result.modelUsages
      .map((usage) => `${formatRole(usage.role)}=${usage.provider}/${usage.model}${usage.fallbackUsed ? "(fallback)" : ""}`)
      .join(", ")}`,
  );
  console.log(
    `feedback: ${result.snapshot.commentInsight?.nextRoundSuggestions.join(" / ") ?? "none"}`,
  );
}

function formatStage(stage: string): string {
  return stageLabels[stage] ? `${stageLabels[stage]}(${stage})` : stage;
}

function formatNode(nodeId: string): string {
  return nodeLabels[nodeId] ? `${nodeLabels[nodeId]}(${nodeId})` : nodeId;
}

function formatRole(role: string): string {
  return roleLabels[role] ? `${roleLabels[role]}(${role})` : role;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runBackendDemo().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

import { pathToFileURL } from "node:url";
import { loadLocalEnv } from "./env.js";
import { RoundtableWorkflowService } from "./workflow-service.js";

loadLocalEnv();

export async function runBackendDemo(): Promise<void> {
  const service = new RoundtableWorkflowService();
  const result = await service.runFullWorkflow({ publish: true });
  const topic = result.snapshot.selectedTopic;

  console.log("知辩圆桌后端工作流 Demo");
  console.log(`provider: ${result.providerMode}`);
  console.log(`topic: ${topic?.title ?? "unknown"}`);
  console.log(`stage: ${result.snapshot.stage}`);
  console.log(`evidence: ${result.snapshot.evidence.length}`);
  console.log(`turns: ${result.snapshot.turns.length}`);
  console.log(`draft: ${result.snapshot.publishDraft?.title ?? "none"}`);
  console.log(`published: ${result.publishResult?.url ?? "not requested"}`);
  console.log(`nodes: ${result.nodeResults.map((node) => `${node.id}:${node.status}`).join(" -> ")}`);
  console.log(
    `models: ${result.modelUsages
      .map((usage) => `${usage.role}=${usage.provider}/${usage.model}${usage.fallbackUsed ? "(fallback)" : ""}`)
      .join(", ")}`,
  );
  console.log(
    `feedback: ${result.snapshot.commentInsight?.nextRoundSuggestions.join(" / ") ?? "none"}`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runBackendDemo().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

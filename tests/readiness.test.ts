import { describe, expect, it } from "vitest";
import { buildReadinessReport } from "../src/backend/readiness.js";
import { RoundtableWorkflowService } from "../src/backend/workflow-service.js";

describe("hackathon readiness report", () => {
  it("scores a full workflow against official-style judging dimensions", async () => {
    const service = new RoundtableWorkflowService();
    const result = await service.runFullWorkflow({ publish: true });
    const report = buildReadinessReport(result.snapshot);

    expect(report.totalScore).toBeGreaterThan(80);
    expect(report.items.map((item) => item.key)).toEqual([
      "ai_value",
      "innovation",
      "completion",
      "ux",
      "pitch",
    ]);
    expect(report.demoChecklist.length).toBeGreaterThanOrEqual(6);
    expect(report.strongestProof.join(" ")).toContain("社区型 AI");
  });
});

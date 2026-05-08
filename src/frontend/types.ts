import type {
  ApiQuotaStatus,
  DebateTurn,
  HackathonReadinessReport,
  ModelUsage,
  RoundtableSnapshot,
  Topic,
  WorkflowNodeResult,
} from "../core/types.js";
import type { PublishResult, ZhihuProviderFailure } from "../providers/zhihu-provider.js";

export type WorkflowRunResponse = {
  topics: Topic[];
  snapshot: RoundtableSnapshot;
  providerMode: "mock" | "live";
  modelUsages: ModelUsage[];
  nodeResults: WorkflowNodeResult[];
  providerFailures?: ZhihuProviderFailure[];
  publishResult?: PublishResult;
};

export type ModelsResponse = {
  defaultPolicy: unknown;
  env: {
    kimiConfigured: boolean;
    deepseekConfigured: boolean;
    kimiModelOverride?: boolean;
    deepseekModelOverride?: boolean;
    zhihuConfigured?: boolean;
  };
};

export type QuotaResponse = {
  quotas: ApiQuotaStatus[];
};

export type ZhihuStatusResponse = {
  mode: "mock" | "live";
  accessTokenConfigured: boolean;
  baseUrlConfigured: boolean;
  failures: ZhihuProviderFailure[];
  quotas: ApiQuotaStatus[];
};

export type ReadinessResponse = {
  report: HackathonReadinessReport;
};

export type WorkflowStreamEvent =
  | { type: "radar"; snapshot: RoundtableSnapshot; topics: Topic[]; node: WorkflowNodeResult }
  | { type: "prepare"; snapshot: RoundtableSnapshot; node: WorkflowNodeResult }
  | { type: "agent_briefing"; snapshot: RoundtableSnapshot; node: WorkflowNodeResult }
  | { type: "debate_turn"; snapshot: RoundtableSnapshot; turn: DebateTurn; node: WorkflowNodeResult }
  | { type: "debate_done"; snapshot: RoundtableSnapshot; node: WorkflowNodeResult }
  | { type: "publish"; snapshot: RoundtableSnapshot; publishResult?: PublishResult; node: WorkflowNodeResult }
  | { type: "feedback"; snapshot: RoundtableSnapshot; node: WorkflowNodeResult }
  | { type: "error"; message: string };

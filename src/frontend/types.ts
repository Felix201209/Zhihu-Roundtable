import type {
  ApiQuotaStatus,
  DebateTurn,
  HackathonReadinessReport,
  IdeaExperiment,
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
  publishConfirmation?: ConfirmationPayload;
};

export type TopicsResponse = {
  topics: Topic[];
};

export type ExperimentResponse = {
  experiment: IdeaExperiment;
  modelUsages: ModelUsage[];
  nodeResults: WorkflowNodeResult[];
  demoData?: boolean;
  publishConfirmation?: ConfirmationPayload;
};

export type ExperimentReportResponse = ExperimentResponse & {
  report: IdeaExperiment["report"];
};

export type ConfirmationPayload = {
  action: "publish" | "comment" | "reaction";
  token: string;
  expiresAt: string;
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
  appCredentialsConfigured?: boolean;
  appSecretConfigured?: boolean;
  baseUrlConfigured: boolean;
  ringIdConfigured?: boolean;
  hotListHours?: string;
  cache?: {
    zhihuReadsEnabled: boolean;
    llmJsonEnabled: boolean;
    hotTtlMs?: string;
    searchTtlMs?: string;
    llmTtlMs?: string;
  };
  failures: ZhihuProviderFailure[];
  quotas: ApiQuotaStatus[];
};

export type ReadinessResponse = {
  report: HackathonReadinessReport;
};

export type OAuthStatusResponse = {
  configured: boolean;
  clientIdConfigured: boolean;
  clientSecretConfigured: boolean;
  authorizeUrlConfigured: boolean;
  tokenUrlConfigured: boolean;
  callbackUrl: string;
  mode: "mock-safe" | "live-ready";
  session: {
    authenticated: boolean;
    user?: {
      name?: string;
      url?: string;
    };
  };
  aiUsageGuardMode: "off" | "ip" | "oauth" | "oauth_or_ip";
};

export type UsageStatusResponse = {
  guardMode: "off" | "ip" | "oauth" | "oauth_or_ip";
  identity: string;
  authenticated: boolean;
  limit: number;
  bonus: number;
  used: number;
  remaining: number;
  resetAt: string;
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

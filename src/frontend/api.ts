import type {
  QuotaResponse,
  ReadinessResponse,
  ConfirmationPayload,
  ExperimentReportResponse,
  ExperimentResponse,
  OAuthStatusResponse,
  TopicsResponse,
  UsageStatusResponse,
  WorkflowRunResponse,
  WorkflowStreamEvent,
  ZhihuStatusResponse,
} from "./types.js";
import type { IdeaExperiment, IdeaVariantId, RoundtableSnapshot } from "../core/types.js";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const frontendModelKeys = [
  "modelMode",
  "defaultProvider",
  "kimiModel",
  "deepseekFlashModel",
  "deepseekProModel",
  "fallbackToMock",
] as const;

async function jsonFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiError(body.message ?? `${path} failed with ${response.status}`, response.status, body.error);
  }

  return response.json() as Promise<T>;
}

export async function runWorkflow(
  publish = false,
  topicId?: string,
  modelPolicyOverride: Record<string, unknown> = {},
): Promise<WorkflowRunResponse> {
  const modelPolicy = {
    ...getFrontendModelPolicy(),
    ...modelPolicyOverride,
  };
  return jsonFetch<WorkflowRunResponse>("/api/workflow/run", {
    method: "POST",
    body: JSON.stringify({
      publish,
      topicId,
      modelPolicy,
    }),
  });
}

export async function getTopics(): Promise<TopicsResponse> {
  const params = new URLSearchParams();
  applyFrontendModelQuery(params);
  const query = params.toString();
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), 8000);
  try {
    return await jsonFetch<TopicsResponse>(`/api/topics${query ? `?${query}` : ""}`, { signal: controller.signal });
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

export async function getQuota(): Promise<QuotaResponse> {
  return jsonFetch<QuotaResponse>("/api/quota");
}

export async function getOAuthStatus(): Promise<OAuthStatusResponse> {
  return jsonFetch<OAuthStatusResponse>("/api/oauth/status");
}

export async function getUsageStatus(): Promise<UsageStatusResponse> {
  return jsonFetch<UsageStatusResponse>("/api/usage/status");
}

export async function getZhihuStatus(): Promise<ZhihuStatusResponse> {
  return jsonFetch<ZhihuStatusResponse>("/api/zhihu/status");
}

export async function getReadiness(snapshot: RoundtableSnapshot): Promise<ReadinessResponse> {
  return jsonFetch<ReadinessResponse>("/api/readiness", {
    method: "POST",
    body: JSON.stringify({ snapshot }),
  });
}

export async function generateExperiment(idea: string): Promise<ExperimentResponse> {
  return jsonFetch<ExperimentResponse>("/api/experiment/generate", {
    method: "POST",
    body: JSON.stringify({
      idea,
      modelPolicy: getFrontendModelPolicy(),
    }),
  });
}

export async function previewExperimentPublish(
  experiment: IdeaExperiment,
  selectedVariantIds: IdeaVariantId[],
): Promise<ExperimentResponse> {
  return jsonFetch<ExperimentResponse>("/api/experiment/publish-preview", {
    method: "POST",
    body: JSON.stringify({ experiment, selectedVariantIds }),
  });
}

export async function confirmExperimentPublish(
  experiment: IdeaExperiment,
  confirmationToken?: string,
): Promise<ExperimentResponse> {
  return jsonFetch<ExperimentResponse>("/api/experiment/confirm-publish", {
    method: "POST",
    body: JSON.stringify({ experiment, confirmationToken }),
  });
}

export async function collectExperimentFeedback(experiment: IdeaExperiment): Promise<ExperimentResponse> {
  return jsonFetch<ExperimentResponse>("/api/experiment/collect", {
    method: "POST",
    body: JSON.stringify({ experiment }),
  });
}

export async function generateExperimentReport(experiment: IdeaExperiment): Promise<ExperimentReportResponse> {
  return jsonFetch<ExperimentReportResponse>("/api/experiment/report", {
    method: "POST",
    body: JSON.stringify({
      experiment,
      modelPolicy: getFrontendModelPolicy(),
    }),
  });
}

export async function confirmPublish(snapshot: RoundtableSnapshot, confirmationToken?: string): Promise<WorkflowRunResponse> {
  return jsonFetch<WorkflowRunResponse>("/api/workflow/confirm-publish", {
    method: "POST",
    body: JSON.stringify({ snapshot, confirmationToken }),
  });
}

export async function analyzeFeedback(
  snapshot: RoundtableSnapshot,
  publishResult?: WorkflowRunResponse["publishResult"],
): Promise<Pick<WorkflowRunResponse, "snapshot" | "modelUsages" | "nodeResults">> {
  return jsonFetch<Pick<WorkflowRunResponse, "snapshot" | "modelUsages" | "nodeResults">>("/api/workflow/feedback", {
    method: "POST",
    body: JSON.stringify({ snapshot, publishResult }),
  });
}

export async function createConfirmation(input: {
  action: "publish" | "comment" | "reaction";
  snapshot?: RoundtableSnapshot;
  subject?: string;
}): Promise<ConfirmationPayload> {
  const result = await jsonFetch<{ confirmation: ConfirmationPayload }>("/api/workflow/confirmation", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return result.confirmation;
}

export async function createHostComment(publishId: string, content: string, confirmationToken?: string) {
  return jsonFetch("/api/workflow/comment", {
    method: "POST",
    body: JSON.stringify({ publishId, content, confirmationToken }),
  });
}

export async function react(targetId: string, type: "support" | "oppose" | "inspired" | "neutral", confirmationToken?: string) {
  return jsonFetch("/api/workflow/reaction", {
    method: "POST",
    body: JSON.stringify({ targetId, type, confirmationToken }),
  });
}

export function streamWorkflow(input: {
  publish?: boolean;
  topicId?: string;
  onEvent: (event: WorkflowStreamEvent) => void;
  onError: (message: string) => void;
  onDone: () => void;
  onRetry?: (attempt: number) => void;
  maxRetries?: number;
}) {
  const params = new URLSearchParams({
    publish: String(input.publish ?? false),
  });
  applyFrontendModelQuery(params);
  if (input.topicId) {
    params.set("topicId", input.topicId);
  }
  let source: EventSource | undefined;
  let closed = false;
  let retries = 0;
  const maxRetries = input.maxRetries ?? 1;
  const eventNames: WorkflowStreamEvent["type"][] = [
    "radar",
    "prepare",
    "agent_briefing",
    "debate_turn",
    "debate_done",
    "publish",
    "feedback",
    "error",
  ];

  const close = () => {
    closed = true;
    source?.close();
  };

  const finish = () => {
    input.onDone();
    close();
  };

  const connect = () => {
    source?.close();
    source = new window.EventSource(`/api/workflow/stream?${params.toString()}`);

    eventNames.forEach((name) => {
      source?.addEventListener(name, (message) => {
        let parsed: WorkflowStreamEvent;

        try {
          parsed = JSON.parse((message as MessageEvent).data) as WorkflowStreamEvent;
        } catch {
          input.onError("SSE 事件解析失败，已停止本轮实时流。");
          finish();
          return;
        }

        input.onEvent(parsed);
        if (parsed.type === "publish" && !input.publish) {
          finish();
        }

        if (parsed.type === "feedback" || parsed.type === "error") {
          finish();
        }
      });
    });

    source.onerror = () => {
      source?.close();
      if (closed) return;
      if (retries < maxRetries) {
        retries += 1;
        input.onRetry?.(retries);
        window.setTimeout(connect, 400);
        return;
      }

      input.onError("SSE 连接中断，正在切换到一次性兜底流程。");
      input.onDone();
    };
  };

  connect();
  return close;
}

function getFrontendModelPolicy(): Record<string, unknown> {
  const query = getSearchParams();
  const env = getFrontendEnv();
  const mode = query.get("modelMode") ?? env.VITE_DEMO_MODEL_MODE ?? "auto";
  const defaultProvider = query.get("defaultProvider") ?? env.VITE_DEMO_DEFAULT_PROVIDER ?? "deepseek-v4-pro";
  const policy: Record<string, unknown> = {
    mode,
    defaultProvider,
  };

  for (const key of ["kimiModel", "deepseekFlashModel", "deepseekProModel"] as const) {
    const value = query.get(key) ?? env[toEnvKey(key)];
    if (value) {
      policy[key] = value;
    }
  }

  const fallbackToMock = query.get("fallbackToMock") ?? env.VITE_DEMO_FALLBACK_TO_MOCK;
  if (fallbackToMock !== undefined && fallbackToMock !== null && fallbackToMock !== "") {
    policy.fallbackToMock = fallbackToMock;
  }

  return policy;
}

function applyFrontendModelQuery(params: URLSearchParams) {
  const policy = getFrontendModelPolicy();
  for (const key of frontendModelKeys) {
    const policyKey = key === "modelMode" ? "mode" : key;
    const value = policy[policyKey];
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, String(value));
    }
  }
}

function getSearchParams() {
  if (typeof window === "undefined") {
    return new URLSearchParams();
  }

  return new URLSearchParams(window.location.search);
}

function getFrontendEnv(): Record<string, string | undefined> {
  const meta = import.meta as ImportMeta & { env?: Record<string, string | boolean | undefined> };
  return Object.fromEntries(
    Object.entries(meta.env ?? {}).map(([key, value]) => [key, typeof value === "string" ? value : undefined]),
  );
}

function toEnvKey(key: "kimiModel" | "deepseekFlashModel" | "deepseekProModel") {
  return `VITE_DEMO_${key.replace(/[A-Z]/g, (char) => `_${char}`).toUpperCase()}`;
}

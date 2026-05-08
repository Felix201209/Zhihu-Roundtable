import type {
  QuotaResponse,
  ReadinessResponse,
  WorkflowRunResponse,
  WorkflowStreamEvent,
  ZhihuStatusResponse,
} from "./types.js";
import type { RoundtableSnapshot } from "../core/types.js";

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
    throw new Error(body.message ?? `${path} failed with ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export async function runWorkflow(publish = false, topicId?: string): Promise<WorkflowRunResponse> {
  return jsonFetch<WorkflowRunResponse>("/api/workflow/run", {
    method: "POST",
    body: JSON.stringify({
      publish,
      topicId,
      modelPolicy: {
        mode: "mock",
        defaultProvider: "mock",
      },
    }),
  });
}

export async function getQuota(): Promise<QuotaResponse> {
  return jsonFetch<QuotaResponse>("/api/quota");
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

export async function createHostComment(publishId: string, content: string) {
  return jsonFetch("/api/workflow/comment", {
    method: "POST",
    body: JSON.stringify({ publishId, content }),
  });
}

export async function react(targetId: string, type: "support" | "oppose" | "inspired" | "neutral") {
  return jsonFetch("/api/workflow/reaction", {
    method: "POST",
    body: JSON.stringify({ targetId, type }),
  });
}

export function streamWorkflow(input: {
  publish?: boolean;
  topicId?: string;
  onEvent: (event: WorkflowStreamEvent) => void;
  onError: (message: string) => void;
  onDone: () => void;
}) {
  const params = new URLSearchParams({
    publish: String(input.publish ?? false),
    modelMode: "mock",
    defaultProvider: "mock",
  });
  if (input.topicId) {
    params.set("topicId", input.topicId);
  }
  const source = new EventSource(`/api/workflow/stream?${params.toString()}`);
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

  eventNames.forEach((name) => {
    source.addEventListener(name, (message) => {
      let parsed: WorkflowStreamEvent;

      try {
        parsed = JSON.parse((message as MessageEvent).data) as WorkflowStreamEvent;
      } catch {
        input.onError("SSE 事件解析失败，已停止本轮实时流。");
        input.onDone();
        source.close();
        return;
      }

      input.onEvent(parsed);
      if (parsed.type === "feedback" || parsed.type === "error") {
        input.onDone();
        source.close();
      }
    });
  });

  source.onerror = () => {
    input.onError("SSE 连接中断，已保留当前快照。");
    input.onDone();
    source.close();
  };

  return () => source.close();
}

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { URL } from "node:url";
import { RoundtableWorkflowService } from "./workflow-service.js";
import { encodeSseEvent } from "./sse.js";
import { buildReadinessReport } from "./readiness.js";
import { resolveModelPolicy } from "../providers/llm-provider.js";
import type { ModelPolicy, ModelProviderName, ReactionType } from "../core/types.js";
import type { RoundtableSnapshot } from "../core/types.js";

export type BackendServerOptions = {
  port?: number;
  service?: RoundtableWorkflowService;
};

type JsonRecord = Record<string, unknown>;

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function readJson(req: IncomingMessage): Promise<JsonRecord> {
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString("utf8").trim();

  if (!raw) {
    return {};
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new HttpError(400, "invalid_json", "请求体必须是有效 JSON。");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new HttpError(400, "invalid_json", "请求体必须是 JSON object。");
  }

  return parsed as JsonRecord;
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
  });
  res.end(JSON.stringify(payload, null, 2));
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function booleanValue(value: unknown): boolean {
  return value === true || value === "true";
}

function snapshotValue(value: unknown): RoundtableSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpError(400, "missing_snapshot", "请求体缺少 snapshot object。");
  }

  const snapshot = value as Partial<RoundtableSnapshot>;
  if (
    snapshot.stage !== "radar" &&
    snapshot.stage !== "prepare" &&
    snapshot.stage !== "debate" &&
    snapshot.stage !== "publish" &&
    snapshot.stage !== "feedback"
  ) {
    throw new HttpError(400, "invalid_snapshot", "snapshot.stage 无效。");
  }

  if (!Array.isArray(snapshot.evidence) || !Array.isArray(snapshot.turns)) {
    throw new HttpError(400, "invalid_snapshot", "snapshot 必须包含 evidence[] 和 turns[]。");
  }

  return snapshot as RoundtableSnapshot;
}

function providerValue(value: unknown): ModelProviderName | undefined {
  return value === "mock" ||
    value === "kimi" ||
    value === "deepseek-v4-flash" ||
    value === "deepseek-v4-pro" ||
    value === "custom"
    ? value
    : undefined;
}

function reactionValue(value: unknown): ReactionType {
  if (value === "support" || value === "oppose" || value === "inspired" || value === "neutral") {
    return value;
  }

  throw new HttpError(400, "invalid_reaction", "reaction type 必须是 support/oppose/inspired/neutral。");
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function parseModelPolicy(source: URLSearchParams | JsonRecord): Partial<ModelPolicy> | undefined {
  const read = (key: string): unknown => source instanceof URLSearchParams ? source.get(key) : source[key];
  const nested = objectValue(read("modelPolicy"));
  const mode = read("modelMode") ?? nested?.mode;
  const defaultProvider = read("defaultProvider") ?? nested?.defaultProvider;
  const kimiModel = read("kimiModel") ?? nested?.kimiModel;
  const deepseekFlashModel = read("deepseekFlashModel") ?? nested?.deepseekFlashModel;
  const deepseekProModel = read("deepseekProModel") ?? nested?.deepseekProModel;
  const fallbackToMock = read("fallbackToMock") ?? nested?.fallbackToMock;
  const roleMap = objectValue(read("roleMap") ?? nested?.roleMap);
  const policy: Partial<ModelPolicy> = {};

  if (mode === "mock" || mode === "auto" || mode === "live") {
    policy.mode = mode;
  }

  const provider = providerValue(defaultProvider);
  if (provider) {
    policy.defaultProvider = provider;
  }

  if (typeof kimiModel === "string" && kimiModel.length > 0) {
    policy.kimiModel = kimiModel;
  }

  if (typeof deepseekFlashModel === "string" && deepseekFlashModel.length > 0) {
    policy.deepseekFlashModel = deepseekFlashModel;
  }

  if (typeof deepseekProModel === "string" && deepseekProModel.length > 0) {
    policy.deepseekProModel = deepseekProModel;
  }

  if (fallbackToMock !== undefined) {
    policy.fallbackToMock = booleanValue(fallbackToMock);
  }

  if (roleMap) {
    policy.roleMap = Object.fromEntries(
      Object.entries(roleMap).filter(([, value]) => providerValue(value)),
    ) as Partial<ModelPolicy["roleMap"]>;
  }

  return Object.keys(policy).length > 0 ? policy : undefined;
}

async function handleRequest(
  service: RoundtableWorkflowService,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (req.method === "OPTIONS") {
    sendJson(res, 204, {});
    return;
  }

  const url = new URL(req.url ?? "/", "http://localhost");

  if (req.method === "GET" && url.pathname === "/api/health") {
    sendJson(res, 200, {
      ok: true,
      service: "zhihu-roundtable-backend",
      endpoints: [
        "/api/topics",
        "/api/models",
        "/api/zhihu/status",
        "/api/readiness",
        "/api/quota",
        "/api/ring/default",
        "/api/workflow/start",
        "/api/workflow/prepare",
        "/api/workflow/debate",
        "/api/workflow/publish-draft",
        "/api/workflow/confirm-publish",
        "/api/workflow/comment",
        "/api/workflow/reaction",
        "/api/workflow/feedback",
        "/api/workflow/run",
        "/api/workflow/stream",
      ],
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/topics") {
    const scoped = service.withModelPolicy(parseModelPolicy(url.searchParams));
    sendJson(res, 200, { topics: await scoped.getRadar() });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/models") {
    sendJson(res, 200, {
      defaultPolicy: resolveModelPolicy(),
      env: {
        kimiConfigured: Boolean(process.env.KIMI_API_KEY ?? process.env.MOONSHOT_API_KEY),
        deepseekConfigured: Boolean(process.env.DEEPSEEK_API_KEY),
        kimiModelOverride: Boolean(process.env.KIMI_MODEL ?? process.env.MOONSHOT_MODEL),
        deepseekModelOverride: Boolean(
          process.env.DEEPSEEK_FLASH_MODEL ?? process.env.DEEPSEEK_PRO_MODEL ?? process.env.DEEPSEEK_MODEL,
        ),
        zhihuConfigured: Boolean(process.env.ZHIHU_ACCESS_TOKEN),
      },
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/zhihu/status") {
    sendJson(res, 200, {
      mode: process.env.ZHIHU_PROVIDER === "live" || Boolean(process.env.ZHIHU_API_BASE_URL) ? "live" : "mock",
      accessTokenConfigured: Boolean(process.env.ZHIHU_ACCESS_TOKEN),
      baseUrlConfigured: Boolean(process.env.ZHIHU_API_BASE_URL),
      failures: service.getProviderFailures(),
      quotas: service.getQuotaStatus(),
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/quota") {
    sendJson(res, 200, { quotas: service.getQuotaStatus() });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/ring/default") {
    sendJson(res, 200, { ring: await service.getDefaultRing() });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/workflow/run") {
    const body = await readJson(req);
    const result = await service.runFullWorkflow({
      topicId: stringValue(body.topicId),
      publish: booleanValue(body.publish),
      ringId: stringValue(body.ringId),
      modelPolicy: parseModelPolicy(body),
    });
    sendJson(res, 200, result);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/workflow/start") {
    const body = await readJson(req);
    const scoped = service.withModelPolicy(parseModelPolicy(body));
    const snapshot = await scoped.createInitialSnapshot(stringValue(body.topicId));
    sendJson(res, 200, { snapshot, modelUsages: snapshot.modelUsages ?? [], nodeResults: snapshot.nodeResults ?? [] });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/workflow/prepare") {
    const body = await readJson(req);
    const scoped = service.withModelPolicy(parseModelPolicy(body));
    const snapshot = await scoped.prepareTopic(snapshotValue(body.snapshot));
    sendJson(res, 200, { snapshot, modelUsages: snapshot.modelUsages ?? [], nodeResults: snapshot.nodeResults ?? [] });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/workflow/debate") {
    const body = await readJson(req);
    const scoped = service.withModelPolicy(parseModelPolicy(body));
    const snapshot = await scoped.runDebate(snapshotValue(body.snapshot));
    sendJson(res, 200, { snapshot, modelUsages: snapshot.modelUsages ?? [], nodeResults: snapshot.nodeResults ?? [] });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/workflow/publish-draft") {
    const body = await readJson(req);
    const scoped = service.withModelPolicy(parseModelPolicy(body));
    const snapshot = await scoped.generatePublishDraft(snapshotValue(body.snapshot));
    sendJson(res, 200, { snapshot, modelUsages: snapshot.modelUsages ?? [], nodeResults: snapshot.nodeResults ?? [] });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/workflow/confirm-publish") {
    const body = await readJson(req);
    const scoped = service.withModelPolicy(parseModelPolicy(body));
    const result = await scoped.confirmPublishWithSnapshot(snapshotValue(body.snapshot), stringValue(body.ringId));
    sendJson(res, 200, {
      ...result,
      modelUsages: result.snapshot.modelUsages ?? [],
      nodeResults: result.snapshot.nodeResults ?? [],
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/workflow/comment") {
    const body = await readJson(req);
    const publishId = stringValue(body.publishId);
    const content = stringValue(body.content);
    if (!publishId || !content) {
      throw new HttpError(400, "invalid_comment", "publishId 和 content 必填。");
    }
    const comment = await service.createHostComment({ publishId, content });
    sendJson(res, 200, { comment });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/workflow/reaction") {
    const body = await readJson(req);
    const targetId = stringValue(body.targetId);
    if (!targetId) {
      throw new HttpError(400, "invalid_reaction", "targetId 必填。");
    }
    const reaction = await service.react({ targetId, type: reactionValue(body.type) });
    sendJson(res, 200, { reaction });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/workflow/feedback") {
    const body = await readJson(req);
    const scoped = service.withModelPolicy(parseModelPolicy(body));
    const publishResult = objectValue(body.publishResult);
    const publishId = stringValue(body.publishId) ?? stringValue(publishResult?.id);
    const snapshot = await scoped.analyzeFeedback(
      snapshotValue(body.snapshot),
      publishId ? { id: publishId } : undefined,
    );
    sendJson(res, 200, { snapshot, modelUsages: snapshot.modelUsages ?? [], nodeResults: snapshot.nodeResults ?? [] });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/readiness") {
    const body = await readJson(req);
    sendJson(res, 200, { report: buildReadinessReport(snapshotValue(body.snapshot)) });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/workflow/stream") {
    res.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "access-control-allow-origin": "*",
    });

    for await (const event of service.streamWorkflow({
      topicId: stringValue(url.searchParams.get("topicId")),
      publish: booleanValue(url.searchParams.get("publish")),
      ringId: stringValue(url.searchParams.get("ringId")),
      modelPolicy: parseModelPolicy(url.searchParams),
    })) {
      res.write(encodeSseEvent(event));
    }

    res.end();
    return;
  }

  sendJson(res, 404, { error: "not_found", message: `未找到接口 ${req.method} ${url.pathname}` });
}

export function createBackendServer(options: BackendServerOptions = {}) {
  const service = options.service ?? new RoundtableWorkflowService();

  return createServer((req, res) => {
    handleRequest(service, req, res).catch((error) => {
      const status = error instanceof HttpError ? error.status : 500;
      sendJson(res, status, {
        error: error instanceof HttpError ? error.code : "backend_error",
        message: error instanceof Error ? error.message : "未知后端错误。",
      });
    });
  });
}

export async function startBackendServer(options: BackendServerOptions = {}): Promise<{
  port: number;
  close: () => Promise<void>;
}> {
  const server = createBackendServer(options);
  const port = options.port ?? 8787;

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolve();
    };

    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port);
  });

  const address = server.address() as AddressInfo;

  return {
    port: address.port,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      }),
  };
}

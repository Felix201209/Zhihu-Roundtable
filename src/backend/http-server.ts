import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createHash, randomUUID } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { extname, resolve } from "node:path";
import { URL } from "node:url";
import { RoundtableWorkflowService } from "./workflow-service.js";
import { encodeSseEvent } from "./sse.js";
import { buildReadinessReport } from "./readiness.js";
import { createRoutedLlmProvider, resolveModelPolicy } from "../providers/llm-provider.js";
import type { IdeaExperiment, IdeaVariantId, ModelPolicy, ModelProviderName, ModelRole, ReactionType } from "../core/types.js";
import type { RoundtableSnapshot } from "../core/types.js";

export type BackendServerOptions = {
  port?: number;
  service?: RoundtableWorkflowService;
  staticDir?: string;
};

type JsonRecord = Record<string, unknown>;
type ConfirmationAction = "publish" | "comment" | "reaction";

type OAuthStateRecord = {
  state: string;
  redirectUri: string;
  expiresAt: number;
};

type ConfirmationRecord = {
  action: ConfirmationAction;
  subject?: string;
  snapshotHash?: string;
  expiresAt: number;
};

type ConfirmationPayload = {
  action: ConfirmationAction;
  token: string;
  expiresAt: string;
};

class ConfirmationRegistry {
  private readonly records = new Map<string, ConfirmationRecord>();

  create(input: Omit<ConfirmationRecord, "expiresAt">, ttlMs = 5 * 60_000): ConfirmationPayload {
    this.prune();
    const token = randomUUID();
    const expiresAt = Date.now() + ttlMs;
    this.records.set(token, { ...input, expiresAt });
    return {
      action: input.action,
      token,
      expiresAt: new Date(expiresAt).toISOString(),
    };
  }

  consume(token: string | undefined, expected: Omit<ConfirmationRecord, "expiresAt">): void {
    this.prune();
    if (!token) {
      throw new HttpError(403, "confirmation_required", "真实知乎写操作需要先经过用户确认 token。");
    }

    const record = this.records.get(token);
    this.records.delete(token);

    if (!record || record.expiresAt < Date.now()) {
      throw new HttpError(403, "confirmation_invalid", "确认 token 无效或已过期。");
    }

    if (
      record.action !== expected.action ||
      record.subject !== expected.subject ||
      record.snapshotHash !== expected.snapshotHash
    ) {
      throw new HttpError(403, "confirmation_mismatch", "确认 token 与本次写操作不匹配。");
    }
  }

  private prune(): void {
    const nowMs = Date.now();
    for (const [token, record] of this.records.entries()) {
      if (record.expiresAt < nowMs) {
        this.records.delete(token);
      }
    }
  }
}

class OAuthStateRegistry {
  private readonly records = new Map<string, OAuthStateRecord>();

  create(redirectUri: string, ttlMs = 10 * 60_000): OAuthStateRecord {
    this.prune();
    const state = randomUUID();
    const record = {
      state,
      redirectUri,
      expiresAt: Date.now() + ttlMs,
    };
    this.records.set(state, record);
    return record;
  }

  consume(state: string | undefined): OAuthStateRecord {
    this.prune();
    if (!state) {
      throw new HttpError(400, "oauth_missing_state", "OAuth 回调缺少 state。");
    }

    const record = this.records.get(state);
    this.records.delete(state);

    if (!record || record.expiresAt < Date.now()) {
      throw new HttpError(400, "oauth_invalid_state", "OAuth state 无效或已过期。");
    }

    return record;
  }

  private prune(): void {
    const nowMs = Date.now();
    for (const [state, record] of this.records.entries()) {
      if (record.expiresAt < nowMs) {
        this.records.delete(state);
      }
    }
  }
}

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
    "access-control-allow-origin": allowedCorsOrigin(),
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
  });
  res.end(JSON.stringify(payload, null, 2));
}

function sendHtml(res: ServerResponse, status: number, html: string): void {
  res.writeHead(status, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(html);
}

function redirect(res: ServerResponse, location: string, headers: Record<string, string> = {}): void {
  res.writeHead(302, {
    location,
    "cache-control": "no-store",
    ...headers,
  });
  res.end();
}

const staticMimeTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
};

async function serveStatic(staticDir: string, pathname: string, res: ServerResponse): Promise<void> {
  const root = resolve(staticDir);
  const decoded = safeDecodePath(pathname);
  const relativePath = decoded === "/" ? "/index.html" : decoded;
  const requestedPath = resolve(root, `.${relativePath}`);

  if (requestedPath !== root && !requestedPath.startsWith(`${root}/`)) {
    sendJson(res, 403, { error: "static_forbidden", message: "静态资源路径非法。" });
    return;
  }

  const fallbackPath = extname(requestedPath) ? undefined : resolve(root, "index.html");
  const filePath = await existingFileOrSpaFallback(requestedPath, fallbackPath);
  if (!filePath) {
    sendJson(res, 404, { error: "not_found", message: `未找到页面 ${pathname}` });
    return;
  }

  const body = await readFile(filePath);
  res.writeHead(200, {
    "content-type": staticMimeTypes[extname(filePath)] ?? "application/octet-stream",
    "cache-control": filePath.endsWith("index.html") ? "no-cache" : "public, max-age=31536000, immutable",
  });
  res.end(body);
}

function safeDecodePath(pathname: string): string {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return "/";
  }
}

async function existingFileOrSpaFallback(filePath: string, fallbackPath: string | undefined): Promise<string | undefined> {
  if (await isFile(filePath)) {
    return filePath;
  }
  if (fallbackPath && await isFile(fallbackPath)) {
    return fallbackPath;
  }
  return undefined;
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function booleanValue(value: unknown): boolean {
  return value === true || value === "true";
}

function allowedCorsOrigin(): string {
  return process.env.CORS_ALLOW_ORIGIN ?? `http://localhost:${process.env.VITE_DEV_PORT ?? "5173"}`;
}

function publicOrigin(req: IncomingMessage): string {
  if (process.env.PUBLIC_APP_URL) {
    return process.env.PUBLIC_APP_URL.replace(/\/$/, "");
  }

  const rawHost = headerValue(req.headers["x-forwarded-host"] ?? req.headers.host) ?? `localhost:${process.env.BACKEND_PORT ?? "8787"}`;
  const rawProto = headerValue(req.headers["x-forwarded-proto"]) ?? (isLocalHost(rawHost) ? "http" : "https");
  return `${rawProto.split(",")[0].trim()}://${rawHost.split(",")[0].trim()}`;
}

function oauthRedirectUri(req: IncomingMessage): string {
  return process.env.ZHIHU_OAUTH_REDIRECT_URI ?? `${publicOrigin(req)}/api/oauth/callback`;
}

function oauthConfigured(): boolean {
  return Boolean(process.env.ZHIHU_OAUTH_CLIENT_ID && process.env.ZHIHU_OAUTH_CLIENT_SECRET);
}

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function isLocalHost(host: string): boolean {
  const hostname = host.split(":")[0].replace(/^\[|\]$/g, "");
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function oauthCookie(state: string, maxAgeSeconds = 600): string {
  return [
    `zhihu_oauth_state=${encodeURIComponent(state)}`,
    "Path=/api/oauth",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
  ].join("; ");
}

function cookieValue(req: IncomingMessage, key: string): string | undefined {
  const cookie = req.headers.cookie;
  if (!cookie) return undefined;
  for (const part of cookie.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (rawName === key) {
      return decodeURIComponent(rawValue.join("="));
    }
  }
  return undefined;
}

async function deploymentCommit(): Promise<string | undefined> {
  if (process.env.DEPLOYMENT_COMMIT) {
    return process.env.DEPLOYMENT_COMMIT;
  }
  try {
    return (await readFile(resolve(".deployed-commit"), "utf8")).trim() || undefined;
  } catch {
    return undefined;
  }
}

function jsonHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function snapshotHash(snapshot: RoundtableSnapshot): string {
  return jsonHash(snapshot);
}

function experimentHash(experiment: IdeaExperiment): string {
  return jsonHash(experiment);
}

function requiresWriteConfirmation(service: RoundtableWorkflowService): boolean {
  return service.getProviderMode() === "live" && process.env.ZHIHU_REQUIRE_CONFIRMATION !== "false";
}

function livePublishRequested(input: { publish?: unknown; modelPolicy?: Partial<ModelPolicy> }, service: RoundtableWorkflowService): boolean {
  return booleanValue(input.publish) && requiresWriteConfirmation(service);
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

function modelRoleValue(value: string): ModelRole {
  if (
    value === "topic_scoring" ||
    value === "question" ||
    value === "evidence" ||
    value === "briefing" ||
    value === "debate" ||
    value === "synthesis" ||
    value === "publish" ||
    value === "feedback"
  ) {
    return value;
  }

  throw new HttpError(400, "invalid_model_policy", `未知模型角色 ${value}。`);
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

function ideaExperimentValue(value: unknown): IdeaExperiment {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpError(400, "missing_experiment", "请求体缺少 experiment object。");
  }

  const experiment = value as Partial<IdeaExperiment>;
  if (!experiment.id || typeof experiment.id !== "string") {
    throw new HttpError(400, "invalid_experiment", "experiment.id 必须是字符串。");
  }
  if (!experiment.idea || typeof experiment.idea !== "string") {
    throw new HttpError(400, "invalid_experiment", "experiment.idea 必须是字符串。");
  }
  if (!Array.isArray(experiment.variants) || experiment.variants.length !== 3) {
    throw new HttpError(400, "invalid_experiment", "experiment.variants 必须包含 3 个版本。");
  }
  if (!Array.isArray(experiment.selectedVariantIds)) {
    throw new HttpError(400, "invalid_experiment", "experiment.selectedVariantIds 必须是数组。");
  }

  return experiment as IdeaExperiment;
}

function variantIdsValue(value: unknown): IdeaVariantId[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const ids = value.filter((item): item is IdeaVariantId => item === "A" || item === "B" || item === "C");
  return ids.length ? [...new Set(ids)] : undefined;
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
    const parsedRoleMap: Partial<ModelPolicy["roleMap"]> = {};
    for (const [key, value] of Object.entries(roleMap)) {
      const provider = providerValue(value);
      if (!provider) continue;
      parsedRoleMap[modelRoleValue(key)] = provider;
    }
    policy.roleMap = parsedRoleMap;
  }

  return Object.keys(policy).length > 0 ? policy : undefined;
}

async function handleRequest(
  service: RoundtableWorkflowService,
  confirmations: ConfirmationRegistry,
  oauthStates: OAuthStateRegistry,
  staticDir: string | undefined,
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
      port: req.socket.localPort,
      deploymentCommit: await deploymentCommit(),
      endpoints: [
        "/api/topics",
        "/api/oauth/start",
        "/api/oauth/callback",
        "/api/oauth/status",
        "/api/models",
        "/api/models/probe",
        "/api/zhihu/status",
        "/api/readiness",
        "/api/quota",
        "/api/ring/default",
        "/api/experiment/generate",
        "/api/experiment/publish-preview",
        "/api/experiment/confirm-publish",
        "/api/experiment/collect",
        "/api/experiment/report",
        "/api/workflow/start",
        "/api/workflow/prepare",
        "/api/workflow/debate",
        "/api/workflow/publish-draft",
        "/api/workflow/confirmation",
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

  if (req.method === "GET" && url.pathname === "/api/oauth/status") {
    sendJson(res, 200, {
      configured: oauthConfigured(),
      clientIdConfigured: Boolean(process.env.ZHIHU_OAUTH_CLIENT_ID),
      clientSecretConfigured: Boolean(process.env.ZHIHU_OAUTH_CLIENT_SECRET),
      openApiAppKeyConfigured: Boolean(process.env.ZHIHU_APP_KEY),
      openApiAppSecretConfigured: Boolean(process.env.ZHIHU_APP_SECRET),
      authorizeUrlConfigured: Boolean(process.env.ZHIHU_OAUTH_AUTHORIZE_URL),
      tokenUrlConfigured: Boolean(process.env.ZHIHU_OAUTH_TOKEN_URL),
      callbackUrl: oauthRedirectUri(req),
      mode: oauthConfigured() ? "live-ready" : "mock-safe",
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/oauth/start") {
    const redirectUri = oauthRedirectUri(req);
    const stateRecord = oauthStates.create(redirectUri);
    const authorizeUrl = process.env.ZHIHU_OAUTH_AUTHORIZE_URL;

    if (!oauthConfigured() || !authorizeUrl) {
      sendHtml(res, 200, [
        "<!doctype html><meta charset=\"utf-8\">",
        "<title>知乎登录待配置</title>",
        "<style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:720px;margin:48px auto;padding:0 24px;line-height:1.7;color:#1f2329}code{background:#f6f6f6;padding:2px 6px;border-radius:6px}</style>",
        "<h1>知乎 OAuth 回调已就绪</h1>",
        "<p>当前环境尚未配置官方授权地址或 App 密钥，所以保持 mock-safe 体验。</p>",
        `<p>提交广场时可填写回调地址：<code>${redirectUri}</code></p>`,
        "<p>配置 <code>ZHIHU_OAUTH_CLIENT_ID</code>、<code>ZHIHU_OAUTH_CLIENT_SECRET</code>、<code>ZHIHU_OAUTH_AUTHORIZE_URL</code> 后，此入口会跳转到知乎授权页。</p>",
      ].join(""));
      return;
    }

    const auth = new URL(authorizeUrl);
    auth.searchParams.set("client_id", process.env.ZHIHU_OAUTH_CLIENT_ID ?? "");
    auth.searchParams.set("redirect_uri", redirectUri);
    auth.searchParams.set("response_type", "code");
    auth.searchParams.set("state", stateRecord.state);
    auth.searchParams.set("scope", process.env.ZHIHU_OAUTH_SCOPE ?? "read");
    redirect(res, auth.toString(), {
      "set-cookie": oauthCookie(stateRecord.state),
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/oauth/callback") {
    const state = url.searchParams.get("state") ?? undefined;
    const code = url.searchParams.get("code") ?? undefined;
    const cookieState = cookieValue(req, "zhihu_oauth_state");

    if (cookieState && state && cookieState !== state) {
      throw new HttpError(400, "oauth_state_mismatch", "OAuth state 与本地 cookie 不匹配。");
    }

    const record = oauthStates.consume(state);
    if (!code) {
      throw new HttpError(400, "oauth_missing_code", "OAuth 回调缺少 code。");
    }

    const tokenUrl = process.env.ZHIHU_OAUTH_TOKEN_URL;
    const clientSecret = process.env.ZHIHU_OAUTH_CLIENT_SECRET;
    const tokenPayload = {
      grant_type: "authorization_code",
      code,
      redirect_uri: record.redirectUri,
      client_id: process.env.ZHIHU_OAUTH_CLIENT_ID,
      client_secret: clientSecret,
    };
    let tokenExchange: { ok: boolean; status?: number; configured: boolean } = { ok: false, configured: false };

    if (tokenUrl && process.env.ZHIHU_OAUTH_CLIENT_ID && clientSecret) {
      const response = await fetch(tokenUrl, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
        },
        body: JSON.stringify(tokenPayload),
      });
      tokenExchange = { ok: response.ok, status: response.status, configured: true };
    }

    sendHtml(res, tokenExchange.ok ? 200 : 202, [
      "<!doctype html><meta charset=\"utf-8\">",
      "<title>知乎登录回调</title>",
      "<style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:720px;margin:48px auto;padding:0 24px;line-height:1.7;color:#1f2329}.ok{color:#0f7b33}.warn{color:#8a5a00}</style>",
      `<h1 class="${tokenExchange.ok ? "ok" : "warn"}">${tokenExchange.ok ? "知乎登录已完成" : "知乎登录回调已接收"}</h1>`,
      tokenExchange.configured
        ? `<p>授权码已提交到官方 token endpoint，返回状态：${tokenExchange.status}。</p>`
        : "<p>当前未配置 token endpoint；系统已验证 state/code，等待填入官方 OAuth token URL 后即可完成换 token。</p>",
      "<p>你可以关闭此页，回到知辩圆桌继续体验。</p>",
    ].join(""));
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/topics") {
    const scoped = service.withModelPolicy(parseModelPolicy(url.searchParams));
    sendJson(res, 200, { topics: await scoped.getRadar() });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/models") {
    const liveEffective = zhihuStatusMode() === "live";
    sendJson(res, 200, {
      defaultPolicy: resolveModelPolicy(),
      env: {
        kimiConfigured: Boolean(process.env.KIMI_API_KEY ?? process.env.MOONSHOT_API_KEY),
        deepseekConfigured: Boolean(process.env.DEEPSEEK_API_KEY),
        zhihuDirectAgentConfigured: Boolean(
          process.env.CUSTOM_LLM_API_KEY ?? process.env.ZHIHU_DIRECT_AGENT_API_KEY ?? (liveEffective ? process.env.ZHIHU_ACCESS_TOKEN : undefined),
        ),
        kimiModelOverride: Boolean(process.env.KIMI_MODEL ?? process.env.MOONSHOT_MODEL),
        deepseekModelOverride: Boolean(
          process.env.DEEPSEEK_FLASH_MODEL ?? process.env.DEEPSEEK_PRO_MODEL ?? process.env.DEEPSEEK_MODEL,
        ),
        zhihuConfigured: liveEffective && Boolean((process.env.ZHIHU_APP_KEY ?? process.env.ZHIHU_ACCESS_TOKEN) && process.env.ZHIHU_APP_SECRET),
      },
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/models/probe") {
    const probeProvider = createRoutedLlmProvider(resolveModelPolicy({
      mode: "auto",
      defaultProvider: "deepseek-v4-flash",
      roleMap: {
        question: "deepseek-v4-flash",
      },
      fallbackToMock: false,
    }));
    const result = await probeProvider.rewriteQuestion({
      topic: {
        id: `deepseek-probe-${Date.now()}`,
        title: "知乎黑客松提交前，创作者如何判断一个热点是否值得组织讨论？",
        source: "mock",
        hotScore: 1,
        debateScore: 1,
        evidenceScore: 1,
        reason: "只读探针，用于确认线上 DeepSeek JSON 调用可用。",
      },
    });
    sendJson(res, 200, {
      ok: true,
      provider: result.usage.provider,
      model: result.usage.model,
      cached: result.usage.cached === true,
      fallbackUsed: result.usage.fallbackUsed === true,
      latencyMs: result.usage.latencyMs,
      attempts: result.usage.attempts,
      rewrittenQuestionLength: result.value.rewrittenQuestion.length,
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/zhihu/status") {
    const mode = zhihuStatusMode();
    const liveEffective = mode === "live";
    sendJson(res, 200, {
      mode,
      accessTokenConfigured: liveEffective && Boolean(process.env.ZHIHU_ACCESS_TOKEN),
      appCredentialsConfigured: liveEffective && Boolean((process.env.ZHIHU_APP_KEY ?? process.env.ZHIHU_ACCESS_TOKEN) && process.env.ZHIHU_APP_SECRET),
      appSecretConfigured: liveEffective && Boolean(process.env.ZHIHU_APP_SECRET),
      baseUrlConfigured: liveEffective && Boolean(process.env.ZHIHU_API_BASE_URL),
      ringIdConfigured: Boolean(process.env.ZHIHU_RING_ID),
      hotListHours: process.env.ZHIHU_HOT_LIST_HOURS,
      cache: {
        zhihuReadsEnabled: process.env.ZHIHU_CACHE_ENABLED !== "false",
        llmJsonEnabled: process.env.LLM_CACHE_ENABLED !== "false",
        hotTtlMs: process.env.ZHIHU_CACHE_HOT_TTL_MS,
        searchTtlMs: process.env.ZHIHU_CACHE_SEARCH_TTL_MS,
        llmTtlMs: process.env.LLM_CACHE_TTL_MS,
      },
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

  if (req.method === "POST" && url.pathname === "/api/experiment/generate") {
    const body = await readJson(req);
    const idea = stringValue(body.idea);
    if (!idea) {
      throw new HttpError(400, "missing_idea", "请输入一个脑洞，才能开始试验。");
    }
    const scoped = service.withModelPolicy(parseModelPolicy(body));
    const experiment = await scoped.generateIdeaExperiment({
      idea,
      selectedVariantIds: variantIdsValue(body.selectedVariantIds),
      modelPolicy: parseModelPolicy(body),
    });
    sendJson(res, 200, {
      experiment,
      modelUsages: experiment.modelUsages ?? [],
      nodeResults: experiment.nodeResults ?? [],
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/experiment/publish-preview") {
    const body = await readJson(req);
    const experiment = service.createExperimentPublishPreview({
      experiment: ideaExperimentValue(body.experiment),
      selectedVariantIds: variantIdsValue(body.selectedVariantIds),
    });
    sendJson(res, 200, {
      experiment,
      publishConfirmation: requiresWriteConfirmation(service)
        ? confirmations.create({ action: "publish", snapshotHash: experimentHash(experiment) })
        : undefined,
      modelUsages: experiment.modelUsages ?? [],
      nodeResults: experiment.nodeResults ?? [],
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/experiment/confirm-publish") {
    const body = await readJson(req);
    const experiment = ideaExperimentValue(body.experiment);
    if (requiresWriteConfirmation(service)) {
      confirmations.consume(stringValue(body.confirmationToken), {
        action: "publish",
        snapshotHash: experimentHash(experiment),
      });
    }
    const result = await service.confirmExperimentPublish({
      experiment,
      ringId: stringValue(body.ringId),
      allowLiveWrite: true,
    });
    sendJson(res, 200, {
      experiment: result,
      modelUsages: result.modelUsages ?? [],
      nodeResults: result.nodeResults ?? [],
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/experiment/collect") {
    const body = await readJson(req);
    const result = await service.collectExperimentFeedback({
      experiment: ideaExperimentValue(body.experiment),
    });
    sendJson(res, 200, {
      experiment: result,
      demoData: result.demoData === true,
      modelUsages: result.modelUsages ?? [],
      nodeResults: result.nodeResults ?? [],
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/experiment/report") {
    const body = await readJson(req);
    const scoped = service.withModelPolicy(parseModelPolicy(body));
    const result = await scoped.buildExperimentReport({
      experiment: ideaExperimentValue(body.experiment),
      modelPolicy: parseModelPolicy(body),
    });
    sendJson(res, 200, {
      experiment: result,
      report: result.report,
      modelUsages: result.modelUsages ?? [],
      nodeResults: result.nodeResults ?? [],
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/workflow/run") {
    const body = await readJson(req);
    if (livePublishRequested(body, service)) {
      throw new HttpError(403, "confirmation_required", "真实知乎发布必须走发布预览和用户确认，不能通过一键 run 自动发布。");
    }
    const result = await service.runFullWorkflow({
      topicId: stringValue(body.topicId),
      publish: booleanValue(body.publish),
      ringId: stringValue(body.ringId),
      modelPolicy: parseModelPolicy(body),
    });
    sendJson(res, 200, {
      ...result,
      publishConfirmation: requiresWriteConfirmation(service) && result.snapshot.publishDraft
        ? confirmations.create({ action: "publish", snapshotHash: snapshotHash(result.snapshot) })
        : undefined,
    });
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
    sendJson(res, 200, {
      snapshot,
      publishConfirmation: requiresWriteConfirmation(service)
        ? confirmations.create({ action: "publish", snapshotHash: snapshotHash(snapshot) })
        : undefined,
      modelUsages: snapshot.modelUsages ?? [],
      nodeResults: snapshot.nodeResults ?? [],
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/workflow/confirmation") {
    const body = await readJson(req);
    const action = body.action === "publish" || body.action === "comment" || body.action === "reaction"
      ? body.action
      : undefined;

    if (!action) {
      throw new HttpError(400, "invalid_confirmation", "action 必须是 publish/comment/reaction。");
    }

    const snapshot = action === "publish" ? snapshotValue(body.snapshot) : undefined;
    const subject = action === "publish" ? undefined : stringValue(body.subject);
    if (action !== "publish" && !subject) {
      throw new HttpError(400, "invalid_confirmation", "comment/reaction 确认必须绑定 subject。");
    }

    sendJson(res, 200, {
      confirmation: confirmations.create({
        action,
        subject,
        snapshotHash: snapshot ? snapshotHash(snapshot) : undefined,
      }),
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/workflow/confirm-publish") {
    const body = await readJson(req);
    const scoped = service.withModelPolicy(parseModelPolicy(body));
    const snapshot = snapshotValue(body.snapshot);
    if (requiresWriteConfirmation(service)) {
      confirmations.consume(stringValue(body.confirmationToken), {
        action: "publish",
        snapshotHash: snapshotHash(snapshot),
      });
    }
    const result = await scoped.confirmPublishWithSnapshot(snapshot, stringValue(body.ringId), { allowLiveWrite: true });
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
    if (requiresWriteConfirmation(service)) {
      confirmations.consume(stringValue(body.confirmationToken), { action: "comment", subject: publishId });
    }
    const comment = await service.createHostComment({ publishId, content }, { allowLiveWrite: true });
    sendJson(res, 200, { comment });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/workflow/reaction") {
    const body = await readJson(req);
    const targetId = stringValue(body.targetId);
    if (!targetId) {
      throw new HttpError(400, "invalid_reaction", "targetId 必填。");
    }
    if (requiresWriteConfirmation(service)) {
      confirmations.consume(stringValue(body.confirmationToken), { action: "reaction", subject: targetId });
    }
    const reaction = await service.react({ targetId, type: reactionValue(body.type) }, { allowLiveWrite: true });
    sendJson(res, 200, { reaction });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/workflow/feedback") {
    const body = await readJson(req);
    const scoped = service.withModelPolicy(parseModelPolicy(body));
    const publishResult = objectValue(body.publishResult);
    const publishId = stringValue(body.publishId) ?? stringValue(publishResult?.id);
    const publishMode = publishResult?.mode === "mock" || publishResult?.mode === "live"
      ? publishResult.mode
      : publishId?.startsWith("mock-") ? "mock" : undefined;
    const snapshot = await scoped.analyzeFeedback(
      snapshotValue(body.snapshot),
      publishId ? { id: publishId, mode: publishMode } : undefined,
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
    if (booleanValue(url.searchParams.get("publish")) && requiresWriteConfirmation(service)) {
      throw new HttpError(403, "confirmation_required", "真实知乎发布必须走发布预览和用户确认，不能通过 SSE 自动发布。");
    }
    res.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "access-control-allow-origin": allowedCorsOrigin(),
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

  if (staticDir && req.method === "GET" && !url.pathname.startsWith("/api/")) {
    await serveStatic(staticDir, url.pathname, res);
    return;
  }

  sendJson(res, 404, { error: "not_found", message: `未找到接口 ${req.method} ${url.pathname}` });
}

function zhihuStatusMode(): "mock" | "live" {
  if (process.env.ZHIHU_PROVIDER === "mock") {
    return "mock";
  }
  return process.env.ZHIHU_PROVIDER === "live" || Boolean(process.env.ZHIHU_API_BASE_URL) ? "live" : "mock";
}

export function createBackendServer(options: BackendServerOptions = {}) {
  const service = options.service ?? new RoundtableWorkflowService();
  const confirmations = new ConfirmationRegistry();
  const oauthStates = new OAuthStateRegistry();
  const staticDir = options.staticDir;

  return createServer((req, res) => {
    handleRequest(service, confirmations, oauthStates, staticDir, req, res).catch((error) => {
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

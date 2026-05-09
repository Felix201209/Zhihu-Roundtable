import { afterEach, describe, expect, it } from "vitest";
import { startBackendServer } from "../src/backend/http-server.js";
import { RoundtableWorkflowService } from "../src/backend/workflow-service.js";
import { MockZhihuProvider, type ZhihuProvider } from "../src/providers/zhihu-provider.js";

class LiveLikeProvider implements ZhihuProvider {
  readonly mode = "live" as const;
  private readonly mock = new MockZhihuProvider();

  getHotTopics = this.mock.getHotTopics.bind(this.mock);
  searchEvidence = this.mock.searchEvidence.bind(this.mock);
  getDefaultRing = this.mock.getDefaultRing.bind(this.mock);
  publishDraft: ZhihuProvider["publishDraft"] = async (input) => ({
    ...(await this.mock.publishDraft(input)),
    mode: "live",
  });
  listComments = this.mock.listComments.bind(this.mock);
  createComment: ZhihuProvider["createComment"] = async (input) => ({
    ...(await this.mock.createComment(input)),
    mode: "live",
  });
  react: ZhihuProvider["react"] = async (input) => ({
    ...(await this.mock.react(input)),
    mode: "live",
  });
  getQuotaStatus = this.mock.getQuotaStatus.bind(this.mock);
  getCachedCommentInsight = this.mock.getCachedCommentInsight.bind(this.mock);
}

type StartedServer = Awaited<ReturnType<typeof startBackendServer>>;

let started: StartedServer | undefined;

afterEach(async () => {
  await started?.close();
  started = undefined;
});

describe("backend HTTP server", () => {
  it("serves health, topics and workflow JSON", async () => {
    started = await startBackendServer({ port: 0 });
    const baseUrl = `http://127.0.0.1:${started.port}`;

    const health = await fetch(`${baseUrl}/api/health`).then((res) => res.json());
    expect(health).toMatchObject({ ok: true });
    expect(health.port).toBe(started.port);
    expect(health.endpoints).toContain("/api/models");
    expect(health.endpoints).toContain("/api/zhihu/status");
    expect(health.endpoints).toContain("/api/readiness");
    expect(health.endpoints).toContain("/api/quota");

    const models = await fetch(`${baseUrl}/api/models`).then((res) => res.json());
    expect(models.defaultPolicy.roleMap.debate).toBe("kimi");
    expect(models.defaultPolicy.roleMap.publish).toBe("deepseek-v4-pro");
    expect(models.defaultPolicy.roleMap.feedback).toBe("deepseek-v4-flash");
    expect(models.env).toHaveProperty("zhihuConfigured");
    expect(models.env).toHaveProperty("deepseekConfigured");

    const zhihuStatus = await fetch(`${baseUrl}/api/zhihu/status`).then((res) => res.json());
    expect(zhihuStatus.mode).toBe("mock");
    expect(Array.isArray(zhihuStatus.quotas)).toBe(true);

    const topics = await fetch(`${baseUrl}/api/topics?modelMode=mock&defaultProvider=mock`).then((res) => res.json());
    expect(topics.topics.length).toBeGreaterThan(0);

    const workflow = await fetch(`${baseUrl}/api/workflow/run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        publish: true,
        modelPolicy: {
          mode: "mock",
          defaultProvider: "mock",
          roleMap: { publish: "mock" },
        },
      }),
    }).then((res) => res.json());

    expect(workflow.snapshot.stage).toBe("feedback");
    expect(workflow.publishResult.mode).toBe("mock");
    expect(workflow.modelPolicy.roleMap.publish).toBe("mock");
    expect(workflow.modelUsages.length).toBeGreaterThan(0);

    const readiness = await fetch(`${baseUrl}/api/readiness`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ snapshot: workflow.snapshot }),
    }).then((res) => res.json());
    expect(readiness.report.totalScore).toBeGreaterThan(80);
    expect(readiness.report.awardTargets).toContain("综合大奖");
  });

  it("serves workflow stream as SSE", async () => {
    started = await startBackendServer({ port: 0 });
    const baseUrl = `http://127.0.0.1:${started.port}`;
    const response = await fetch(`${baseUrl}/api/workflow/stream`);
    const body = await response.text();

    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(body).toContain("event: radar");
    expect(body).toContain("event: feedback");
  });

  it("serves step-by-step workflow endpoints with model policy", async () => {
    started = await startBackendServer({ port: 0 });
    const baseUrl = `http://127.0.0.1:${started.port}`;
    const post = (path: string, body: unknown) =>
      fetch(`${baseUrl}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...(body as Record<string, unknown>),
          modelPolicy: { mode: "mock", defaultProvider: "mock" },
        }),
      }).then((res) => res.json());

    const startedWorkflow = await post("/api/workflow/start", {});
    expect(startedWorkflow.snapshot.stage).toBe("radar");

    const prepared = await post("/api/workflow/prepare", { snapshot: startedWorkflow.snapshot });
    expect(prepared.snapshot.stage).toBe("prepare");
    expect(prepared.modelUsages.map((usage: { role: string }) => usage.role)).toContain("evidence");

    const debated = await post("/api/workflow/debate", { snapshot: prepared.snapshot });
    expect(debated.snapshot.stage).toBe("debate");

    const drafted = await post("/api/workflow/publish-draft", { snapshot: debated.snapshot });
    expect(drafted.snapshot.stage).toBe("publish");

    const published = await post("/api/workflow/confirm-publish", { snapshot: drafted.snapshot });
    expect(published.publishResult.id).toBeTruthy();
    expect(published.snapshot.nodeResults.map((node: { id: string }) => node.id)).toContain("publish");

    const feedback = await post("/api/workflow/feedback", {
      snapshot: published.snapshot,
      publishResult: published.publishResult,
    });
    expect(feedback.snapshot.stage).toBe("feedback");

    const comment = await post("/api/workflow/comment", {
      publishId: "mock-pin-1",
      content: "刘看山补充：欢迎继续围绕证据讨论。",
    });
    expect(comment.comment.mode).toBe("mock");

    const reaction = await post("/api/workflow/reaction", {
      targetId: "mock-pin-1",
      type: "inspired",
    });
    expect(reaction.reaction.type).toBe("inspired");
  });

  it("requires explicit confirmation tokens for live Zhihu write operations", async () => {
    started = await startBackendServer({
      port: 0,
      service: new RoundtableWorkflowService({ zhihuProvider: new LiveLikeProvider() }),
    });
    const baseUrl = `http://127.0.0.1:${started.port}`;
    const post = (path: string, body: unknown) =>
      fetch(`${baseUrl}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });

    const directPublish = await post("/api/workflow/run", { publish: true });
    expect(directPublish.status).toBe(403);
    await expect(directPublish.json()).resolves.toMatchObject({ error: "confirmation_required" });

    const preview = await post("/api/workflow/run", {});
    expect(preview.status).toBe(200);
    const previewWorkflow = await preview.json();
    expect(previewWorkflow.publishConfirmation.token).toBeTruthy();

    const rejectedPublish = await post("/api/workflow/confirm-publish", { snapshot: previewWorkflow.snapshot });
    expect(rejectedPublish.status).toBe(403);

    const confirmedPublish = await post("/api/workflow/confirm-publish", {
      snapshot: previewWorkflow.snapshot,
      confirmationToken: previewWorkflow.publishConfirmation.token,
    });
    expect(confirmedPublish.status).toBe(200);
    const published = await confirmedPublish.json();
    expect(published.publishResult.mode).toBe("live");

    const rejectedReaction = await post("/api/workflow/reaction", {
      targetId: published.publishResult.id,
      type: "inspired",
    });
    expect(rejectedReaction.status).toBe(403);

    const reactionConfirmation = await post("/api/workflow/confirmation", {
      action: "reaction",
      subject: published.publishResult.id,
    }).then((response) => response.json());
    const reaction = await post("/api/workflow/reaction", {
      targetId: published.publishResult.id,
      type: "inspired",
      confirmationToken: reactionConfirmation.confirmation.token,
    });
    expect(reaction.status).toBe(200);
  });

  it("falls back safely when domestic live model keys are missing", async () => {
    started = await startBackendServer({ port: 0 });
    const baseUrl = `http://127.0.0.1:${started.port}`;
    const response = await fetch(`${baseUrl}/api/workflow/run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        modelPolicy: {
          mode: "live",
          defaultProvider: "deepseek-v4-pro",
          roleMap: {
            topic_scoring: "deepseek-v4-flash",
            question: "deepseek-v4-pro",
            evidence: "kimi",
            debate: "kimi",
            synthesis: "deepseek-v4-pro",
            publish: "deepseek-v4-pro",
            feedback: "deepseek-v4-flash",
          },
          fallbackToMock: true,
        },
      }),
    });
    const workflow = await response.json();

    expect(response.status).toBe(200);
    expect(workflow.snapshot.stage).toBe("publish");
    expect(workflow.publishResult).toBeUndefined();
    expect(workflow.snapshot.commentInsight).toBeUndefined();
    expect(workflow.modelPolicy.roleMap.publish).toBe("deepseek-v4-pro");
    expect(workflow.modelUsages.some((usage: { fallbackUsed: boolean }) => usage.fallbackUsed)).toBe(true);
  });

  it("returns 400 for invalid step endpoint snapshots", async () => {
    started = await startBackendServer({ port: 0 });
    const baseUrl = `http://127.0.0.1:${started.port}`;
    const response = await fetch(`${baseUrl}/api/workflow/prepare`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ snapshot: { stage: "radar" } }),
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("invalid_snapshot");
  });

  it("returns 400 for malformed JSON bodies", async () => {
    started = await startBackendServer({ port: 0 });
    const baseUrl = `http://127.0.0.1:${started.port}`;
    const response = await fetch(`${baseUrl}/api/workflow/run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not-json",
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("invalid_json");
  });

  it("rejects startup when the requested port is already in use", async () => {
    started = await startBackendServer({ port: 0 });

    await expect(startBackendServer({ port: started.port })).rejects.toThrow();
  });
});

import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
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

class FailingLivePublishProvider extends LiveLikeProvider {
  publishDraft: ZhihuProvider["publishDraft"] = async () => {
    throw new Error("知乎 API 业务错误: rate limit exceeded");
  };

  listComments: ZhihuProvider["listComments"] = async () => {
    throw new Error("mock publish results must not query live comments");
  };
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
    expect(health.endpoints).toContain("/api/oauth/callback");
    expect(health.endpoints).toContain("/api/models");
    expect(health.endpoints).toContain("/api/zhihu/status");
    expect(health.endpoints).toContain("/api/readiness");
    expect(health.endpoints).toContain("/api/quota");
    expect(health.endpoints).toContain("/api/experiment/generate");

    const models = await fetch(`${baseUrl}/api/models`).then((res) => res.json());
    expect(models.defaultPolicy.roleMap.debate).toBe("deepseek-v4-flash");
    expect(models.defaultPolicy.roleMap.publish).toBe("deepseek-v4-pro");
    expect(models.defaultPolicy.roleMap.feedback).toBe("deepseek-v4-flash");
    expect(models.env).toHaveProperty("zhihuConfigured");
    expect(models.env).toHaveProperty("deepseekConfigured");

    const zhihuStatus = await fetch(`${baseUrl}/api/zhihu/status`).then((res) => res.json());
    expect(zhihuStatus.mode).toBe("mock");
    expect(Array.isArray(zhihuStatus.quotas)).toBe(true);

    const oauthStatus = await fetch(`${baseUrl}/api/oauth/status`).then((res) => res.json());
    expect(oauthStatus.callbackUrl).toBe(`${baseUrl}/api/oauth/callback`);
    expect(oauthStatus.mode).toBe("mock-safe");

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

  it("uses forwarded public origin for OAuth callback URLs", async () => {
    started = await startBackendServer({ port: 0 });
    const baseUrl = `http://127.0.0.1:${started.port}`;

    const oauthStatus = await fetch(`${baseUrl}/api/oauth/status`, {
      headers: {
        "x-forwarded-host": "zhihu-roundtable.onrender.com",
        "x-forwarded-proto": "https",
      },
    }).then((res) => res.json());

    expect(oauthStatus.callbackUrl).toBe("https://zhihu-roundtable.onrender.com/api/oauth/callback");
  });

  it("reports mock-safe Zhihu status when ZHIHU_PROVIDER=mock overrides live-looking env", async () => {
    const previousEnv = {
      ZHIHU_PROVIDER: process.env.ZHIHU_PROVIDER,
      ZHIHU_API_BASE_URL: process.env.ZHIHU_API_BASE_URL,
      ZHIHU_ACCESS_TOKEN: process.env.ZHIHU_ACCESS_TOKEN,
      ZHIHU_APP_KEY: process.env.ZHIHU_APP_KEY,
      ZHIHU_APP_SECRET: process.env.ZHIHU_APP_SECRET,
    };
    process.env.ZHIHU_PROVIDER = "mock";
    process.env.ZHIHU_API_BASE_URL = "https://openapi.zhihu.com";
    process.env.ZHIHU_ACCESS_TOKEN = "x";
    process.env.ZHIHU_APP_KEY = "x";
    process.env.ZHIHU_APP_SECRET = "x";

    try {
      started = await startBackendServer({ port: 0 });
      const baseUrl = `http://127.0.0.1:${started.port}`;
      const zhihuStatus = await fetch(`${baseUrl}/api/zhihu/status`).then((res) => res.json());

      expect(zhihuStatus).toMatchObject({
        mode: "mock",
        accessTokenConfigured: false,
        appCredentialsConfigured: false,
        appSecretConfigured: false,
        baseUrlConfigured: false,
      });

      const models = await fetch(`${baseUrl}/api/models`).then((res) => res.json());
      expect(models.env.zhihuConfigured).toBe(false);
      expect(models.env.zhihuDirectAgentConfigured).toBe(false);
    } finally {
      restoreEnv(previousEnv);
    }
  });

  it("can serve the built frontend and API from one Node process", async () => {
    const dir = mkdtempSync(join(tmpdir(), "zhihu-static-"));
    try {
      mkdirSync(join(dir, "assets"));
      writeFileSync(join(dir, "index.html"), "<!doctype html><title>知辩圆桌</title><div id=\"root\"></div>");
      writeFileSync(join(dir, "assets", "app.js"), "console.log('zhihu roundtable');");

      started = await startBackendServer({ port: 0, staticDir: dir });
      const baseUrl = `http://127.0.0.1:${started.port}`;

      const home = await fetch(`${baseUrl}/`);
      const asset = await fetch(`${baseUrl}/assets/app.js`);
      const spaRoute = await fetch(`${baseUrl}/roundtable/demo`);
      const missingAsset = await fetch(`${baseUrl}/assets/missing.js`);
      const health = await fetch(`${baseUrl}/api/health`).then((res) => res.json());

      expect(await home.text()).toContain("知辩圆桌");
      expect(asset.headers.get("content-type")).toContain("text/javascript");
      expect(await asset.text()).toContain("zhihu roundtable");
      expect(await spaRoute.text()).toContain("知辩圆桌");
      expect(missingAsset.status).toBe(404);
      expect(health.service).toBe("zhihu-roundtable-backend");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("exposes a submit-ready OAuth callback surface without requiring official OAuth URLs in mock mode", async () => {
    started = await startBackendServer({ port: 0 });
    const baseUrl = `http://127.0.0.1:${started.port}`;

    const start = await fetch(`${baseUrl}/api/oauth/start`, { redirect: "manual" });
    const html = await start.text();

    expect(start.status).toBe(200);
    expect(html).toContain("/api/oauth/callback");

    const badCallback = await fetch(`${baseUrl}/api/oauth/callback?code=test-code&state=missing-state`);
    const body = await badCallback.json();
    expect(badCallback.status).toBe(400);
    expect(body.error).toBe("oauth_invalid_state");
  });

  it("serves the idea experiment endpoints end to end", async () => {
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
      }).then(async (res) => ({ status: res.status, body: await res.json() }));

    const empty = await post("/api/experiment/generate", { idea: "" });
    expect(empty.status).toBe(400);
    expect(empty.body.error).toBe("missing_idea");

    const generated = await post("/api/experiment/generate", {
      idea: "我想做一个 AI 工具，帮知乎创作者判断选题有没有撞车，并给出改法。",
    });
    expect(generated.status).toBe(200);
    expect(generated.body.experiment.stage).toBe("Generated");
    expect(generated.body.experiment.variants).toHaveLength(3);

    const preview = await post("/api/experiment/publish-preview", {
      experiment: generated.body.experiment,
      selectedVariantIds: ["A", "B", "C"],
    });
    expect(preview.status).toBe(200);
    expect(preview.body.experiment.stage).toBe("PublishConfirm");
    expect(preview.body.experiment.postPreview.optionComments).toHaveLength(3);

    const published = await post("/api/experiment/confirm-publish", {
      experiment: preview.body.experiment,
    });
    expect(published.status).toBe(200);
    expect(published.body.experiment.stage).toBe("Collecting");
    expect(published.body.experiment.publishResult.optionCommentIds).toHaveLength(3);

    const collected = await post("/api/experiment/collect", {
      experiment: published.body.experiment,
    });
    expect(collected.status).toBe(200);
    expect(collected.body.demoData).toBe(true);
    expect(collected.body.experiment.feedback).toHaveLength(3);

    const report = await post("/api/experiment/report", {
      experiment: collected.body.experiment,
    });
    expect(report.status).toBe(200);
    expect(report.body.experiment.stage).toBe("ReportReady");
    expect(report.body.report.recommendedVariantId).toBeTruthy();
    expect(report.body.report.mvpFeatures.length).toBeGreaterThan(0);
    expect(report.body.report.pitchLine).toContain("知乎");
  });

  it("serves workflow stream as SSE", async () => {
    started = await startBackendServer({ port: 0 });
    const baseUrl = `http://127.0.0.1:${started.port}`;
    const response = await fetch(`${baseUrl}/api/workflow/stream`);
    const body = await response.text();

    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(body).toContain("event: radar");
    expect(body).toContain("event: publish");
    expect(body).not.toContain("event: feedback");
  });

  it("rejects SSE auto-publish in live mode before streaming starts", async () => {
    started = await startBackendServer({
      port: 0,
      service: new RoundtableWorkflowService({ zhihuProvider: new LiveLikeProvider() }),
    });
    const baseUrl = `http://127.0.0.1:${started.port}`;
    const response = await fetch(`${baseUrl}/api/workflow/stream?publish=true`);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toMatchObject({ error: "confirmation_required" });
  });

  it("rejects invalid model role keys instead of silently ignoring them", async () => {
    started = await startBackendServer({ port: 0 });
    const baseUrl = `http://127.0.0.1:${started.port}`;
    const response = await fetch(`${baseUrl}/api/workflow/run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        modelPolicy: {
          mode: "mock",
          defaultProvider: "mock",
          roleMap: { fake_role: "mock" },
        },
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toMatchObject({ error: "invalid_model_policy" });
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
    expect(feedback.snapshot.commentInsight.highQualityComments.length).toBeGreaterThan(0);
    expect(feedback.snapshot.commentInsight.newDisputes.length).toBeGreaterThan(0);

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
    await expect(rejectedReaction.json()).resolves.toMatchObject({ error: "confirmation_required" });

    const mismatchedReactionConfirmation = await post("/api/workflow/confirmation", {
      action: "reaction",
      subject: "another-pin",
    }).then((response) => response.json());
    const mismatchedReaction = await post("/api/workflow/reaction", {
      targetId: published.publishResult.id,
      type: "inspired",
      confirmationToken: mismatchedReactionConfirmation.confirmation.token,
    });
    expect(mismatchedReaction.status).toBe(403);
    await expect(mismatchedReaction.json()).resolves.toMatchObject({ error: "confirmation_mismatch" });

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
    const replayedReaction = await post("/api/workflow/reaction", {
      targetId: published.publishResult.id,
      type: "inspired",
      confirmationToken: reactionConfirmation.confirmation.token,
    });
    expect(replayedReaction.status).toBe(403);
    await expect(replayedReaction.json()).resolves.toMatchObject({ error: "confirmation_invalid" });

    const rejectedComment = await post("/api/workflow/comment", {
      publishId: published.publishResult.id,
      content: "刘看山补充：欢迎继续围绕证据讨论。",
    });
    expect(rejectedComment.status).toBe(403);
    await expect(rejectedComment.json()).resolves.toMatchObject({ error: "confirmation_required" });

    const commentConfirmation = await post("/api/workflow/confirmation", {
      action: "comment",
      subject: published.publishResult.id,
    }).then((response) => response.json());
    const comment = await post("/api/workflow/comment", {
      publishId: published.publishResult.id,
      content: "刘看山补充：欢迎继续围绕证据讨论。",
      confirmationToken: commentConfirmation.confirmation.token,
    });
    expect(comment.status).toBe(200);
    await expect(comment.json()).resolves.toMatchObject({ comment: { mode: "live" } });

    const experimentGenerated = await post("/api/experiment/generate", {
      idea: "我想做一个 AI 工具，帮知乎创作者判断选题有没有撞车。",
    }).then((response) => response.json());
    const experimentPreviewResponse = await post("/api/experiment/publish-preview", {
      experiment: experimentGenerated.experiment,
      selectedVariantIds: ["A", "B", "C"],
    });
    expect(experimentPreviewResponse.status).toBe(200);
    const experimentPreview = await experimentPreviewResponse.json();
    expect(experimentPreview.publishConfirmation.token).toBeTruthy();

    const rejectedExperimentPublish = await post("/api/experiment/confirm-publish", {
      experiment: experimentPreview.experiment,
    });
    expect(rejectedExperimentPublish.status).toBe(403);

    const confirmedExperimentPublish = await post("/api/experiment/confirm-publish", {
      experiment: experimentPreview.experiment,
      confirmationToken: experimentPreview.publishConfirmation.token,
    });
    expect(confirmedExperimentPublish.status).toBe(200);
    const experimentPublished = await confirmedExperimentPublish.json();
    expect(experimentPublished.experiment.publishResult.mode).toBe("live");
    expect(experimentPublished.experiment.publishResult.optionCommentIds).toHaveLength(3);
  });

  it("keeps the demo flow moving with an explicit mock publish when live publish is rate limited", async () => {
    started = await startBackendServer({
      port: 0,
      service: new RoundtableWorkflowService({ zhihuProvider: new FailingLivePublishProvider() }),
    });
    const baseUrl = `http://127.0.0.1:${started.port}`;
    const post = (path: string, body: unknown) =>
      fetch(`${baseUrl}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });

    const preview = await post("/api/workflow/run", {}).then((response) => response.json());
    const confirmed = await post("/api/workflow/confirm-publish", {
      snapshot: preview.snapshot,
      confirmationToken: preview.publishConfirmation.token,
    });
    expect(confirmed.status).toBe(200);
    const body = await confirmed.json();
    expect(body.publishResult.mode).toBe("mock");
    expect(body.snapshot.nodeResults.at(-1).summary).toContain("真实发布失败，已转为模拟发布");

    const feedback = await post("/api/workflow/feedback", {
      snapshot: body.snapshot,
      publishResult: body.publishResult,
    });
    expect(feedback.status).toBe(200);
    await expect(feedback.json()).resolves.toMatchObject({ snapshot: { stage: "feedback" } });
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
            evidence: "deepseek-v4-flash",
            debate: "deepseek-v4-flash",
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

function restoreEnv(values: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

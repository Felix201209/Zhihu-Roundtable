const rawUrl = process.env.PUBLIC_DEMO_URL ?? process.argv[2];

if (!rawUrl) {
  console.error("PUBLIC_DEMO_URL is required. Example: PUBLIC_DEMO_URL=https://your-demo.example.com npm run verify:public");
  process.exit(1);
}

const origin = normalizeOrigin(rawUrl);
const expectedProvider = process.env.PUBLIC_DEMO_EXPECT_PROVIDER ?? "mock";
const expectedCommit = process.env.PUBLIC_DEMO_EXPECT_COMMIT;

const home = await fetchText(`${origin}/`);
if (!home.includes("<!doctype html>") || !home.includes("/assets/")) {
  throw new Error("public demo home page did not look like the built Vite app");
}
const bundleText = await fetchPublicBundles(origin, home);
for (const snippet of [
  "知辩圆桌",
  "从热榜生成讨论方案",
  "创作者 / 圈主 / 官方号的讨论组织台",
  "读接口失败可演示模式兜底",
]) {
  assert(bundleText.includes(snippet), `public demo bundle is missing product copy: ${snippet}`);
}

const health = await fetchJson(`${origin}/api/health`);
assert(health.ok === true, "public demo health payload must include ok: true");
assert(health.service === "zhihu-roundtable-backend", "public demo health payload has unexpected service");
assert(Array.isArray(health.endpoints), "public demo health payload must list endpoints");
if (expectedCommit) {
  assert(
    health.deploymentCommit === expectedCommit,
    `public demo deploymentCommit should be ${expectedCommit}, got ${health.deploymentCommit ?? "missing"}`,
  );
}
for (const endpoint of ["/api/workflow/run", "/api/zhihu/status", "/api/oauth/status"]) {
  assert(health.endpoints.includes(endpoint), `public demo health payload is missing ${endpoint}`);
}

const zhihuStatus = await fetchJson(`${origin}/api/zhihu/status`);
if (expectedProvider !== "any") {
  assert(zhihuStatus.mode === expectedProvider, `public demo provider mode should be ${expectedProvider}, got ${zhihuStatus.mode}`);
}
if (expectedProvider === "mock") {
  assert(zhihuStatus.accessTokenConfigured === false, "mock-safe public demo should not expose a configured access token");
  assert(zhihuStatus.baseUrlConfigured === false, "mock-safe public demo should not use a live Zhihu base URL");
} else if (expectedProvider === "live") {
  assert(zhihuStatus.appCredentialsConfigured === true, "live public demo should report Zhihu app credentials configured");
  assert(zhihuStatus.baseUrlConfigured === true, "live public demo should report a Zhihu API base URL");
  assert(zhihuStatus.cache?.zhihuReadsEnabled !== false, "live public demo should keep Zhihu read cache enabled");
  assert(zhihuStatus.cache?.llmJsonEnabled !== false, "live public demo should keep DeepSeek JSON cache enabled");
}

const topics = await fetchJson(`${origin}/api/topics`);
assert(Array.isArray(topics.topics), "public demo topics endpoint should return topics[]");
assert(topics.topics.length > 0, "public demo topics endpoint should return at least one topic");
for (const topic of topics.topics.slice(0, 6)) {
  assert(typeof topic.title === "string" && topic.title.trim().length > 0, "public demo topic title should be non-empty text");
  assert(!containsRawHtml(topic.title), `public demo topic title should be plain text, got ${JSON.stringify(topic.title)}`);
  if (typeof topic.reason === "string") {
    assert(!containsRawHtml(topic.reason), `public demo topic reason should be plain text, got ${JSON.stringify(topic.reason)}`);
  }
}

const models = await fetchJson(`${origin}/api/models`);
assert(models.defaultPolicy?.roleMap?.publish, "public demo models endpoint should expose the default publish role");
if (expectedProvider === "mock") {
  assert(models.env?.zhihuConfigured === false, "mock-safe public demo should not report Zhihu live credentials configured");
} else if (expectedProvider === "live") {
  assert(models.env?.deepseekConfigured === true, "live public demo should report DeepSeek configured");
  assert(models.env?.zhihuConfigured === true, "live public demo should report Zhihu configured");
  const workflow = await fetchJson(`${origin}/api/workflow/run`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ publish: false }),
  });
  const modelUsages = workflow.snapshot?.modelUsages ?? workflow.modelUsages ?? [];
  assert(workflow.providerMode === "live", `live public workflow should use live Zhihu provider mode, got ${workflow.providerMode}`);
  assert(modelUsages.length > 0, "live public workflow should report model usage");
  assert(
    modelUsages.some((usage) => String(usage.provider).startsWith("deepseek-v4-")),
    "live public workflow should show at least one real DeepSeek model call",
  );
  assert(
    modelUsages.some((usage) => String(usage.provider).startsWith("deepseek-v4-") && usage.fallbackUsed !== true),
    "live public workflow should not route every DeepSeek task through mock fallback",
  );
}

const oauthStatus = await fetchJson(`${origin}/api/oauth/status`);
assert(typeof oauthStatus.callbackUrl === "string", "OAuth status must include callbackUrl");
assert(
  oauthStatus.callbackUrl === `${origin}/api/oauth/callback`,
  `OAuth callbackUrl should match the public origin, got ${oauthStatus.callbackUrl}`,
);
if (expectedProvider === "mock") {
  assert(oauthStatus.mode === "mock-safe", `mock-safe public demo OAuth mode should be mock-safe, got ${oauthStatus.mode}`);
}

console.log(`public demo smoke passed at ${origin}`);
console.log(`provider: ${zhihuStatus.mode}`);
if (health.deploymentCommit) {
  console.log(`deployment commit: ${health.deploymentCommit}`);
}
console.log(`oauth callback: ${oauthStatus.callbackUrl}`);

async function fetchPublicBundles(origin, homeHtml) {
  const assetPaths = [...homeHtml.matchAll(/(?:src|href)="([^"]*\/assets\/[^"]+)"/g)]
    .map((match) => match[1])
    .filter((path) => path.endsWith(".js") || path.endsWith(".css"));
  assert(assetPaths.some((path) => path.endsWith(".js")), "public demo home page must reference a JS bundle");

  const texts = [];
  for (const path of [...new Set(assetPaths)]) {
    texts.push(await fetchText(new URL(path, `${origin}/`).toString()));
  }
  return texts.join("\n");
}

async function fetchText(url) {
  const response = await fetchWithRetry(url, { redirect: "manual" });
  assert(response.ok, `${url} returned ${response.status}`);
  return response.text();
}

async function fetchJson(url, options = {}) {
  const response = await fetchWithRetry(url, { redirect: "manual", ...options });
  assert(response.ok, `${url} returned ${response.status}`);
  const contentType = response.headers.get("content-type") ?? "";
  assert(contentType.includes("application/json"), `${url} did not return JSON`);
  return response.json();
}

async function fetchWithRetry(url, options = {}, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fetch(url, options);
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await delay(500 * attempt);
      }
    }
  }
  throw lastError;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeOrigin(value) {
  const parsed = new URL(value);
  parsed.pathname = "";
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString().replace(/\/$/, "");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function containsRawHtml(value) {
  return /<\/?[a-z][\s\S]*?>/i.test(value) || /&(nbsp|amp|lt|gt|quot|apos|#[0-9]+);/i.test(value);
}

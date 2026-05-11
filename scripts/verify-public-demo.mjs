const rawUrl = process.env.PUBLIC_DEMO_URL ?? process.argv[2];

if (!rawUrl) {
  console.error("PUBLIC_DEMO_URL is required. Example: PUBLIC_DEMO_URL=https://your-demo.example.com npm run verify:public");
  process.exit(1);
}

const origin = normalizeOrigin(rawUrl);
const expectedProvider = process.env.PUBLIC_DEMO_EXPECT_PROVIDER ?? "mock";

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
}

const models = await fetchJson(`${origin}/api/models`);
assert(models.defaultPolicy?.roleMap?.publish, "public demo models endpoint should expose the default publish role");
if (expectedProvider === "mock") {
  assert(models.env?.zhihuConfigured === false, "mock-safe public demo should not report Zhihu live credentials configured");
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
  const response = await fetch(url, { redirect: "manual" });
  assert(response.ok, `${url} returned ${response.status}`);
  return response.text();
}

async function fetchJson(url) {
  const response = await fetch(url, { redirect: "manual" });
  assert(response.ok, `${url} returned ${response.status}`);
  const contentType = response.headers.get("content-type") ?? "";
  assert(contentType.includes("application/json"), `${url} did not return JSON`);
  return response.json();
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

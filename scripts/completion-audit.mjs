import { existsSync, readFileSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";

const args = new Set(process.argv.slice(2));
const strict = args.has("--strict");

const checks = [];

check("产品定位清晰", "README/JUDGE/首页文案明确是知乎创作者和圈子运营者的 AI 讨论组织台", () => {
  assertIncludes("README.md", [
    "面向知乎创作者、圈主和官方号运营者的 AI 讨论组织台",
    "它不是 AI 总结器，也不是 AI 帮用户写回答",
  ]);
  assertIncludes("JUDGE_GUIDE.md", ["不是“AI 写知乎回答”", "AI 讨论组织台"]);
  assertIncludes("src/frontend/main.tsx", [
    "创作者 / 圈主 / 官方号的讨论组织台",
    "从热榜生成讨论方案",
  ]);
});

check("主流程完整", "前端 5 步和后端闭环覆盖选题、准备、主持校验、发布策划、评论回流", () => {
  assertIncludes("src/frontend/main.tsx", [
    "选题雷达",
    "讨论方案准备",
    "刘看山主持校验",
    "发布策划与圈子帖预览",
    "评论复盘与下一轮创作",
  ]);
  assertIncludes("src/backend/workflow-service.ts", [
    "runFullWorkflow",
    "buildEvidencePool",
    "buildConsensus",
    "generatePublishDraft",
    "analyzeComments",
  ]);
});

check("mock-safe 边界", "路演脚本和公网部署路径默认强制 mock，不依赖本机 live env", () => {
  assertIncludes("package.json", [
    "\"demo:serve:mock\"",
    "ZHIHU_PROVIDER=mock",
    "\"capture:demo:auto:mock\"",
  ]);
  assertIncludes("render.yaml", [
    "ZHIHU_PROVIDER",
    "value: mock",
    "VITE_DEMO_MODEL_MODE",
    "VITE_DEMO_DEFAULT_PROVIDER",
    "VITE_DEMO_FALLBACK_TO_MOCK",
    "value: \"true\"",
  ]);
  assertIncludes("docs/raspberry-pi-deployment.md", [
    "ZHIHU_PROVIDER=mock",
    "VITE_DEMO_MODEL_MODE=mock",
    "VITE_DEMO_DEFAULT_PROVIDER=mock",
    "VITE_DEMO_FALLBACK_TO_MOCK=true",
  ]);
  assertIncludes("src/providers/zhihu-provider.ts", [
    "if (process.env.ZHIHU_PROVIDER === \"mock\")",
    "MockZhihuProvider",
  ]);
});

check("live 写操作保护", "真实发布、评论、reaction 需要 confirmation token，服务层默认拒绝 live 写", () => {
  assertIncludes("src/backend/workflow-service.ts", [
    "allowLiveWrite",
    "live 写操作需要显式用户确认",
    "confirmPublish",
    "createHostComment",
    "react",
  ]);
  assertIncludes("src/backend/http-server.ts", [
    "confirmations.consume",
    "confirmation_required",
    "allowLiveWrite: true",
  ]);
  assertIncludes("tests/http-server.test.ts", [
    "requires explicit confirmation tokens for live Zhihu write operations",
    "confirmation_mismatch",
    "confirmation_invalid",
  ]);
});

check("验证门禁完整", "本地、生产式、远端 CI、公网验证和源码打包脚本都存在并被文档化", () => {
  assertIncludes("package.json", [
    "\"verify:submission\": \"npm run verify:judge && npm run completion:audit && npm run package:source && npm run evidence:submission\"",
    "\"verify:public\": \"node scripts/verify-public-demo.mjs\"",
    "\"verify:remote-ci\": \"node scripts/verify-remote-ci.mjs\"",
    "\"verify:raspberry-pi\": \"node scripts/verify-raspberry-pi-templates.mjs\"",
    "\"evidence:submission\": \"node scripts/print-submission-evidence.mjs\"",
    "\"completion:audit\": \"node scripts/completion-audit.mjs\"",
  ]);
  for (const file of [
    ".github/workflows/verify.yml",
    "scripts/print-submission-evidence.mjs",
    "scripts/verify-production-server.mjs",
    "scripts/verify-production-flow.mjs",
    "scripts/verify-public-demo.mjs",
    "scripts/verify-remote-ci.mjs",
    "scripts/verify-raspberry-pi-templates.mjs",
    "scripts/package-source.mjs",
  ]) {
    assertExists(file);
  }
});

check("防追问证据", "评委尖锐追问有短答、现场动作和文件/命令证据", () => {
  assertIncludes("JUDGE_GUIDE.md", ["docs/judge-defense-matrix.md"]);
  assertIncludes("docs/final-readiness-audit.md", ["docs/judge-defense-matrix.md"]);
  assertIncludes("docs/judge-defense-matrix.md", [
    "这是不是 AI 帮用户写知乎回答？",
    "真实接口没打通怎么办？",
    "会不会自动发帖或误触真实知乎写操作？",
    "PUBLIC_DEMO_URL=https://你的线上-demo域名 REVIEWER_REPO_ACCESS_CONFIRMED=1 npm run verify:final",
  ]);
});

check("路演速查卡", "现场开场、点击顺序、失败兜底和收束命令集中在一页", () => {
  assertIncludes("JUDGE_GUIDE.md", ["docs/demo-day-quick-card.md"]);
  assertIncludes("docs/final-readiness-audit.md", ["docs/demo-day-quick-card.md"]);
  assertIncludes("docs/demo-day-quick-card.md", [
    "上台前 3 条命令",
    "现场点击顺序",
    "如果现场出问题",
    "不把 mock-safe 演示说成真实知乎发帖",
  ]);
});

check("部署准备", "同一 Node 服务托管 dist 与 /api，Render/树莓派部署路径和公网 verifier 已准备", () => {
  assertIncludes("src/backend/http-server.ts", ["staticDir", "serveStatic"]);
  assertIncludes("src/backend/serve.ts", ["STATIC_DIR", "startBackendServer"]);
  assertIncludes("docs/deployment.md", ["Render Blueprint", "verify:public"]);
  assertIncludes("docs/raspberry-pi-deployment.md", ["Node: `24.x`", "Cloudflare Tunnel", "ZHIHU_PROVIDER=mock"]);
  assertIncludes("docs/raspberry-pi-ops-checklist.md", [
    "PUBLIC_DEMO_URL=https://你的树莓派公网域名 npm run verify:public:full",
    "cloudflared tunnel info zhihu-roundtable",
  ]);
  assertIncludes("scripts/verify-public-demo.mjs", [
    "fetchPublicBundles",
    "/api/health",
    "/api/zhihu/status",
    "/api/oauth/status",
  ]);
});

check("提交包安全", "git 跟踪文件和源码包不包含真实 env、cache、dist 或 node_modules", () => {
  const tracked = git(["ls-files"]).split("\n").filter(Boolean);
  const forbidden = tracked.filter((file) => {
    if (file === ".env.example") {
      return false;
    }
    return (
      file === ".env" ||
      file.startsWith(".env.") ||
      file.startsWith(".cache/") ||
      file.startsWith("dist/") ||
      file.startsWith("node_modules/")
    );
  });
  assert(forbidden.length === 0, `forbidden tracked files:\n${forbidden.join("\n")}`);
  assertIncludes(".gitignore", [".env.*", "!.env.example", ".cache/", "dist/", "node_modules/"]);
});

check("截图 artifacts", "桌面和移动截图存在且不是空文件", () => {
  for (const file of ["artifacts/zhihu-roundtable-desktop.png", "artifacts/zhihu-roundtable-mobile.png"]) {
    assertExists(file);
    assert(statSync(file).size > 10_000, `${file} appears too small`);
  }
});

blocker("远端同步", "当前 HEAD 必须和 upstream HEAD 完全一致，避免 ahead/behind/diverged 被误判", () => {
  const localHead = git(["rev-parse", "HEAD"]);
  const upstreamHead = git(["rev-parse", "@{u}"]);
  return localHead === upstreamHead;
});

blocker("远端 CI", "GitHub Actions Verify 需要对当前 HEAD 成功", () => {
  const result = spawnSync("node", ["scripts/verify-remote-ci.mjs"], { encoding: "utf8" });
  return result.status === 0;
});

blocker("公网 Demo", "需要 PUBLIC_DEMO_URL，并同时通过公网 API smoke 与公网浏览器点击流", () => {
  const url = process.env.PUBLIC_DEMO_URL;
  if (!url) {
    return false;
  }
  const publicSmoke = spawnSync("node", ["scripts/verify-public-demo.mjs", url], {
    encoding: "utf8",
    env: process.env,
  });
  if (publicSmoke.status !== 0) {
    return false;
  }

  const browserFlow = spawnSync("node", ["scripts/verify-production-flow.mjs"], {
    encoding: "utf8",
    env: {
      ...process.env,
      PRODUCTION_FLOW_URL: url,
      PRODUCTION_FLOW_REQUIRE_BROWSER: "true",
    },
  });
  return browserFlow.status === 0;
});

blocker("评委仓库访问", "GitHub 仓库需要 public，或设置 REVIEWER_REPO_ACCESS_CONFIRMED=1 表示 private repo 已授权评委/主办方", () => {
  if (process.env.REVIEWER_REPO_ACCESS_CONFIRMED === "1") {
    return true;
  }

  const view = spawnSync("gh", ["repo", "view", "--json", "visibility"], { encoding: "utf8" });
  if (view.status === 0) {
    try {
      return JSON.parse(view.stdout).visibility === "PUBLIC";
    } catch {
      return false;
    }
  }
  return false;
});

const failed = checks.filter((item) => item.status === "fail");
const externalBlockers = checks.filter((item) => item.status === "blocker");
const blockerNextSteps = new Map([
  ["远端同步", "next: git push origin main; then git fetch origin main --prune && git status -sb"],
  ["远端 CI", "next: npm run verify:remote-ci -- --wait"],
  ["公网 Demo", "next: deploy the Node service, then PUBLIC_DEMO_URL=https://你的线上-demo域名 npm run verify:public:full"],
  ["评委仓库访问", "next: make the repo public, or confirm reviewer access and run with REVIEWER_REPO_ACCESS_CONFIRMED=1"],
]);

for (const item of checks) {
  const marker = item.status === "pass" ? "PASS" : item.status === "blocker" ? "BLOCKED" : "FAIL";
  console.log(`${marker} ${item.name} - ${item.detail}`);
}

if (failed.length > 0) {
  console.error(`\ncompletion audit failed: ${failed.length} local requirement(s) failed.`);
  process.exit(1);
}

if (externalBlockers.length > 0) {
  console.log(`\ncompletion audit local-ready, external blockers: ${externalBlockers.length}`);
  for (const item of externalBlockers) {
    console.log(`- ${item.name}: ${item.detail}`);
    const nextStep = blockerNextSteps.get(item.name);
    if (nextStep) {
      console.log(`  ${nextStep}`);
    }
  }
  if (strict) {
    process.exit(2);
  }
} else {
  console.log("\ncompletion audit passed: no local failures or external blockers.");
}

function check(name, detail, fn) {
  try {
    fn();
    checks.push({ name, detail, status: "pass" });
  } catch (error) {
    checks.push({ name, detail: `${detail}; ${error.message}`, status: "fail" });
  }
}

function blocker(name, detail, fn) {
  let passed = false;
  try {
    passed = fn();
  } catch {
    passed = false;
  }
  checks.push({ name, detail, status: passed ? "pass" : "blocker" });
}

function assertExists(file) {
  assert(existsSync(file), `missing ${file}`);
}

function assertIncludes(file, snippets) {
  assertExists(file);
  const content = readFileSync(file, "utf8");
  for (const snippet of snippets) {
    assert(content.includes(snippet), `${file} missing ${JSON.stringify(snippet)}`);
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function git(args) {
  const result = spawnSync("git", args, { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(result.stderr || `git ${args.join(" ")} failed`);
  }
  return result.stdout.trim();
}

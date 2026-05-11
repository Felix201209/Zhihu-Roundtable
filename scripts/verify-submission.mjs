import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, normalize } from "node:path";

const requiredFiles = [
  "README.md",
  "JUDGE_GUIDE.md",
  "DESIGN.md",
  ".env.example",
  ".node-version",
  ".github/workflows/verify.yml",
  "docs/backend-contract.md",
  "docs/hackathon-demo-plan.md",
  "docs/hackathon-source-notes.md",
  "docs/championship-redteam.md",
  "docs/original-plan-coverage.md",
  "docs/submission-audit.md",
  "docs/submission-package.md",
  "docs/submission-form-checklist.md",
  "docs/deployment.md",
  "docs/external-closure-runbook.md",
  "docs/final-readiness-audit.md",
  "render.yaml",
  "scripts/package-source.mjs",
  "scripts/completion-audit.mjs",
  "scripts/verify-remote-ci.mjs",
  "scripts/verify-public-demo.mjs",
  "scripts/verify-production-flow.mjs",
  "scripts/verify-production-server.mjs",
  "src/backend/workflow-service.ts",
  "src/frontend/main.tsx",
  "tests/frontend-smoke.test.tsx",
  "artifacts/zhihu-roundtable-desktop.png",
  "artifacts/zhihu-roundtable-mobile.png",
];

const commands = [
  ["npm", ["run", "typecheck"]],
  ["npm", ["test"]],
  ["npm", ["run", "build"]],
  ["npm", ["run", "backend:demo"]],
];

const requiredPngDimensions = new Map([
  ["artifacts/zhihu-roundtable-desktop.png", { minWidth: 1200, minHeight: 900 }],
  ["artifacts/zhihu-roundtable-mobile.png", { minWidth: 360, minHeight: 760, maxWidth: 520 }],
]);

const publicNarrativeFiles = [
  "README.md",
  "JUDGE_GUIDE.md",
  "docs/submission-package.md",
  "docs/submission-form-checklist.md",
  "docs/hackathon-demo-plan.md",
  "docs/championship-redteam.md",
  "docs/final-readiness-audit.md",
];

const bannedPublicPhrases = [
  "多 Agent",
  "结构化圆桌",
  "AI 圆桌",
  "圆桌问答",
  "圆桌结果",
  "知乎大 V",
  "反方刺客",
  "吃瓜群众",
];

const trackedSecretPatterns = [
  /sk-[A-Za-z0-9_-]{16,}/,
  /DEEPSEEK_API_KEY=sk-[A-Za-z0-9_-]{8,}/,
  /ZHIHU_APP_SECRET=.+[A-Za-z0-9]{8,}/,
  /app_secret['"]?\s*[:=]\s*['"][A-Za-z0-9_-]{8,}/i,
];

const allowedSecretScanHits = new Set([
  ".env.example",
  "tests/local-env.test.ts",
  "tests/provider-integrations.test.ts",
]);

for (const file of requiredFiles) {
  if (!existsSync(file)) {
    console.error(`missing required file: ${file}`);
    process.exit(1);
  }
  if (file.startsWith("artifacts/") && statSync(file).size < 10_000) {
    console.error(`artifact appears empty or corrupted: ${file}`);
    process.exit(1);
  }
  const dimensionRule = requiredPngDimensions.get(file);
  if (dimensionRule) {
    assertPngDimensions(file, dimensionRule);
  }
}

assertFileIncludes("package.json", [
  "\"start\": \"STATIC_DIR=dist tsx src/backend/serve.ts\"",
  "\"serve:app\": \"npm run build && STATIC_DIR=dist tsx src/backend/serve.ts\"",
  "\"verify:production\": \"npm run build && node scripts/verify-production-server.mjs && node scripts/verify-production-flow.mjs\"",
  "\"verify:public\": \"node scripts/verify-public-demo.mjs\"",
  "\"verify:public:full\": \"npm run verify:public && PRODUCTION_FLOW_REQUIRE_BROWSER=true node scripts/verify-production-flow.mjs\"",
  "\"verify:remote-ci\": \"node scripts/verify-remote-ci.mjs\"",
  "\"verify:final\": \"npm run verify:remote-ci -- --wait && npm run verify:public:full && npm run completion:audit -- --strict\"",
  "\"completion:audit\": \"node scripts/completion-audit.mjs\"",
  "\"verify:judge\":",
  "node --check scripts/verify-public-demo.mjs",
  "node --check scripts/verify-remote-ci.mjs",
  "\"verify:submission\": \"npm run verify:judge && npm run completion:audit && npm run package:source\"",
  "\"package:source\": \"node scripts/package-source.mjs\"",
]);
assertPackageJson();

assertExactFileText(".node-version", "24\n");

assertFileIncludes("README.md", [
  "npm ci",
  "npm run verify",
  "npm run demo:serve:mock",
  "CI 会跑更完整的 `verify:submission`",
  "live 只读接口失败",
  "真实写操作失败不会伪装成功",
  "docs/submission-form-checklist.md",
  "docs/external-closure-runbook.md",
  "docs/final-readiness-audit.md",
  "REVIEWER_REPO_ACCESS_CONFIRMED=1",
]);

assertFileIncludes(".env.example", [
  "PUBLIC_DEMO_URL=https://your-demo-domain.com",
  "REVIEWER_REPO_ACCESS_CONFIRMED",
]);

assertFileIncludes("render.yaml", [
  "NODE_VERSION",
  "value: \"24\"",
  "buildCommand: npm ci && npm run build",
  "startCommand: npm run start",
  "healthCheckPath: /api/health",
  "ZHIHU_PROVIDER",
  "value: mock",
  "VITE_DEMO_MODEL_MODE",
  "VITE_DEMO_DEFAULT_PROVIDER",
  "VITE_DEMO_FALLBACK_TO_MOCK",
  "value: \"true\"",
]);

assertFileIncludes("scripts/verify-public-demo.mjs", [
  "fetchPublicBundles",
  "从热榜生成讨论方案",
  "models.env?.zhihuConfigured",
  "mock-safe public demo should not report Zhihu live credentials configured",
]);

assertFileIncludes("scripts/verify-production-flow.mjs", [
  "PRODUCTION_FLOW_URL",
  "PUBLIC_DEMO_URL",
  "normalizeOrigin",
]);

assertFileIncludes("scripts/completion-audit.mjs", [
  "scripts/verify-public-demo.mjs",
  "scripts/verify-production-flow.mjs",
  "PRODUCTION_FLOW_REQUIRE_BROWSER",
]);

assertFileIncludes("scripts/package-source.mjs", [
  ".github/workflows/verify.yml",
  "scripts/verify-submission.mjs",
  "scripts/completion-audit.mjs",
  "manifest.json",
  "generatedAt",
  "docs/external-closure-runbook.md",
  "scripts/verify-production-server.mjs",
  "tests/http-server.test.ts",
]);

assertFileIncludes(".github/workflows/verify.yml", [
  "workflow_dispatch",
  "node-version: 24",
  "npm ci",
  "Check browser gate",
  "google-chrome --version",
  "npm run verify:submission",
  "PRODUCTION_FLOW_REQUIRE_BROWSER",
  "\"true\"",
]);

assertFileIncludes("docs/final-readiness-audit.md", [
  "公网 Demo URL",
  "代码远端同步",
  "评委仓库访问",
  "服务层默认拒绝 live 写",
  "npm run verify:submission",
  "git push --dry-run origin main",
  "node scripts/verify-remote-ci.mjs --allow-not-pushed",
  "npm run completion:audit",
  "REVIEWER_REPO_ACCESS_CONFIRMED=1",
  "61 个测试通过",
  "生产式浏览器路径确认",
  "前端 bundle 中的产品关键文案",
  "mock-safe 公网 demo 不能报告知乎 live 凭证已配置",
]);

assertFileIncludes("docs/backend-contract.md", [
  "live 只读接口失败",
  "live 写操作失败必须显式失败",
  "服务层默认拒绝 live 写操作",
]);

assertFileIncludes("docs/deployment.md", [
  "npm run verify:remote-ci",
  "PUBLIC_DEMO_URL=https://你的线上-demo域名 npm run verify:public:full",
  "PUBLIC_DEMO_URL=https://你的线上-demo域名 REVIEWER_REPO_ACCESS_CONFIRMED=1 npm run verify:final",
  "公网 Demo 会同时验证 `verify:public` 和公网浏览器点击流",
  "npm run verify:remote-ci -- --wait",
  "VITE_DEMO_FALLBACK_TO_MOCK=true",
]);

assertFileIncludes("docs/external-closure-runbook.md", [
  "git push origin main",
  "npm run verify:remote-ci -- --wait",
  "PUBLIC_DEMO_URL=https://你的线上-demo域名 npm run verify:public:full",
  "PUBLIC_DEMO_URL=https://你的线上-demo域名 REVIEWER_REPO_ACCESS_CONFIRMED=1 npm run verify:final",
  "ZHIHU_PROVIDER=mock",
  "VITE_DEMO_FALLBACK_TO_MOCK=true",
  "update_goal",
]);

assertFileIncludes("docs/submission-form-checklist.md", [
  "项目名称",
  "可运行体验链接",
  "知乎登录回调地址",
  "当前仓库为 private",
  "npm run verify:submission",
  "npm run verify:judge",
  "npm run package:source",
  "verify:remote-ci -- --wait",
  "REVIEWER_REPO_ACCESS_CONFIRMED=1",
  "不要提交 `.env.local`",
]);

assertFileIncludes("docs/submission-package.md", [
  ".cache/submission/zhihu-roundtable-source.zip",
  ".cache/submission/manifest.json",
  "HEAD commit",
  "sha256",
  "docs/external-closure-runbook.md",
]);

for (const file of publicNarrativeFiles) {
  assertFileExcludes(file, bannedPublicPhrases);
}

for (const file of publicNarrativeFiles) {
  assertLocalMarkdownLinks(file);
}

assertNoForbiddenTrackedFiles();
assertNoTrackedSecrets();

for (const [cmd, args] of commands) {
  await run(cmd, args);
}

console.log("\nsubmission verify passed: docs, tests, build and backend demo are ready.");

function assertPngDimensions(file, rule) {
  const buffer = readFileSync(file);
  const pngSignature = "89504e470d0a1a0a";
  if (buffer.subarray(0, 8).toString("hex") !== pngSignature) {
    console.error(`artifact is not a PNG: ${file}`);
    process.exit(1);
  }

  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  if (width < rule.minWidth || height < rule.minHeight) {
    console.error(`artifact dimensions too small: ${file} is ${width}x${height}`);
    process.exit(1);
  }
  if (rule.maxWidth && width > rule.maxWidth) {
    console.error(`artifact width too large for mobile screenshot: ${file} is ${width}x${height}`);
    process.exit(1);
  }
}

function assertPackageJson() {
  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
  if (!packageJson.dependencies?.tsx) {
    console.error("package.json must keep tsx in dependencies because npm run start uses it on deploy platforms.");
    process.exit(1);
  }
  if (packageJson.engines?.node !== ">=24 <25") {
    console.error("package.json must pin the supported runtime to Node 24, matching .node-version, Render and GitHub Actions.");
    process.exit(1);
  }

  const packageLock = JSON.parse(readFileSync("package-lock.json", "utf8"));
  if (packageLock.packages?.[""]?.engines?.node !== ">=24 <25") {
    console.error("package-lock.json root package engines must match package.json.");
    process.exit(1);
  }
}

function assertFileIncludes(file, snippets) {
  if (!existsSync(file)) {
    console.error(`missing required file: ${file}`);
    process.exit(1);
  }

  const content = readFileSync(file, "utf8");
  for (const snippet of snippets) {
    if (!content.includes(snippet)) {
      console.error(`required content missing from ${file}: ${snippet}`);
      process.exit(1);
    }
  }
}

function assertExactFileText(file, expected) {
  if (!existsSync(file)) {
    console.error(`missing required file: ${file}`);
    process.exit(1);
  }

  const content = readFileSync(file, "utf8");
  if (content !== expected) {
    console.error(`unexpected content in ${file}: expected ${JSON.stringify(expected)}`);
    process.exit(1);
  }
}

function assertFileExcludes(file, snippets) {
  if (!existsSync(file)) {
    console.error(`missing required file: ${file}`);
    process.exit(1);
  }

  const content = readFileSync(file, "utf8");
  for (const snippet of snippets) {
    if (content.includes(snippet)) {
      console.error(`banned public-facing phrase found in ${file}: ${snippet}`);
      process.exit(1);
    }
  }
}

function assertLocalMarkdownLinks(file) {
  if (!existsSync(file)) {
    console.error(`missing required file: ${file}`);
    process.exit(1);
  }

  const content = readFileSync(file, "utf8");
  const linkPattern = /!?\[[^\]]+\]\(([^)]+)\)/g;

  for (const match of content.matchAll(linkPattern)) {
    const rawTarget = match[1].trim();
    if (
      !rawTarget ||
      rawTarget.startsWith("#") ||
      rawTarget.startsWith("http://") ||
      rawTarget.startsWith("https://") ||
      rawTarget.startsWith("mailto:")
    ) {
      continue;
    }

    const withoutTitle = rawTarget.split(/\s+["'][^"']*["']$/)[0];
    const [pathPart] = withoutTitle.split("#");
    if (!pathPart) {
      continue;
    }

    const target = normalize(join(dirname(file), decodeURIComponent(pathPart)));
    if (!existsSync(target)) {
      console.error(`broken local markdown link in ${file}: ${rawTarget} -> ${target}`);
      process.exit(1);
    }
  }
}

function assertNoForbiddenTrackedFiles() {
  const trackedFiles = gitLines(["ls-files"]);
  const forbidden = trackedFiles.filter((file) => {
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

  if (forbidden.length > 0) {
    console.error(`forbidden tracked files found:\n${forbidden.join("\n")}`);
    process.exit(1);
  }
}

function assertNoTrackedSecrets() {
  const trackedFiles = gitLines(["ls-files"]).filter((file) => {
    if (allowedSecretScanHits.has(file)) {
      return false;
    }

    return (
      !file.startsWith("artifacts/") &&
      !file.endsWith(".png") &&
      existsSync(file)
    );
  });

  for (const file of trackedFiles) {
    const content = readFileSync(file, "utf8");
    for (const pattern of trackedSecretPatterns) {
      if (pattern.test(content)) {
        console.error(`possible secret found in tracked file: ${file}`);
        process.exit(1);
      }
    }
  }
}

function gitLines(args) {
  const result = spawnSync("git", args, {
    encoding: "utf8",
  });

  if (result.status !== 0) {
    console.error(result.stderr || `git ${args.join(" ")} failed`);
    process.exit(result.status ?? 1);
  }

  return result.stdout.split("\n").map((line) => line.trim()).filter(Boolean);
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    console.log(`\n> ${[cmd, ...args].join(" ")}`);
    const child = spawn(cmd, args, {
      stdio: "inherit",
      shell: process.platform === "win32",
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${cmd} ${args.join(" ")} failed with ${code}`));
    });
  });
}

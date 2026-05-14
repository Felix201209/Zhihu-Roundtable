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
  "docs/demo-day-quick-card.md",
  "docs/hackathon-demo-plan.md",
  "docs/hackathon-source-notes.md",
  "docs/championship-redteam.md",
  "docs/original-plan-coverage.md",
  "docs/submission-audit.md",
  "docs/submission-package.md",
  "docs/submission-form-checklist.md",
  "docs/deployment.md",
  "docs/judge-defense-matrix.md",
  "docs/raspberry-pi-deployment.md",
  "docs/raspberry-pi-ops-checklist.md",
  "docs/external-closure-runbook.md",
  "docs/final-readiness-audit.md",
  "render.yaml",
  "deploy/raspberry-pi/env.production.local.example",
  "deploy/raspberry-pi/zhihu-roundtable.service.example",
  "deploy/raspberry-pi/cloudflared-config.example.yml",
  "scripts/package-source.mjs",
  "scripts/print-submission-evidence.mjs",
  "scripts/completion-audit.mjs",
  "scripts/verify-external-preflight.mjs",
  "scripts/verify-remote-ci.mjs",
  "scripts/verify-raspberry-pi-templates.mjs",
  "scripts/verify-public-demo.mjs",
  "scripts/verify-final.mjs",
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
  "docs/demo-day-quick-card.md",
  "docs/submission-package.md",
  "docs/submission-form-checklist.md",
  "docs/demo-day-quick-card.md",
  "docs/judge-defense-matrix.md",
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
  "\"verify:external-preflight\": \"node scripts/verify-external-preflight.mjs\"",
  "\"verify:remote-ci\": \"node scripts/verify-remote-ci.mjs\"",
  "\"verify:raspberry-pi\": \"node scripts/verify-raspberry-pi-templates.mjs\"",
  "\"verify:final\": \"node scripts/verify-final.mjs\"",
  "\"verify:goal-readiness\": \"node scripts/verify-goal-readiness.mjs\"",
  "\"completion:audit\": \"node scripts/completion-audit.mjs\"",
  "\"verify:judge\":",
  "node --check scripts/verify-public-demo.mjs",
  "node --check scripts/verify-external-preflight.mjs",
  "node --check scripts/verify-remote-ci.mjs",
  "node --check scripts/verify-raspberry-pi-templates.mjs",
  "node --check scripts/verify-final.mjs",
  "node --check scripts/verify-goal-readiness.mjs",
  "npm run verify:raspberry-pi",
  "\"verify:submission\": \"npm run verify:judge && npm run completion:audit && npm run package:source && npm run evidence:submission\"",
  "\"package:source\": \"node scripts/package-source.mjs\"",
  "\"evidence:submission\": \"node scripts/print-submission-evidence.mjs\"",
]);
assertPackageJson();

assertExactFileText(".node-version", "24\n");

assertFileIncludes("README.md", [
  "npm ci",
  "npm run verify",
  "npm run demo:serve:mock",
  "CI 会跑更完整的 `verify:submission`",
  "live 只读接口失败",
  "发布被限流时会明确标注并转入 mock-safe 复盘",
  "docs/demo-day-quick-card.md",
  "docs/submission-form-checklist.md",
  "docs/judge-defense-matrix.md",
  "docs/raspberry-pi-deployment.md",
  "docs/raspberry-pi-ops-checklist.md",
  "docs/external-closure-runbook.md",
  "docs/final-readiness-audit.md",
  "verify:goal-readiness",
  "--strict-remote-ci",
  "npm run evidence:submission",
  "npm run verify:raspberry-pi",
  "REVIEWER_REPO_ACCESS_CONFIRMED=1",
]);

assertFileIncludes("JUDGE_GUIDE.md", [
  "docs/demo-day-quick-card.md",
  "docs/judge-defense-matrix.md",
  "路演问答时优先按这页回答",
]);

assertFileIncludes("docs/demo-day-quick-card.md", [
  "上台前 4 条命令",
  "npm run verify:external-preflight",
  "npm run demo:serve:mock",
  "现场点击顺序",
  "如果现场出问题",
  "不把 mock-safe 演示说成真实知乎发帖",
  "不说 goal 已最终完成",
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
  "先继续体验",
  "models.env?.zhihuConfigured",
  "mock-safe public demo should not report Zhihu live credentials configured",
]);

assertFileIncludes("scripts/verify-external-preflight.mjs", [
  "push",
  "--dry-run",
  "scripts/verify-remote-ci.mjs",
  "--allow-not-pushed",
  "GITHUB_PREFLIGHT_RETRIES",
  "verify:final",
]);

assertFileIncludes("scripts/verify-production-flow.mjs", [
  "PRODUCTION_FLOW_URL",
  "PUBLIC_DEMO_URL",
  "normalizeOrigin",
  "Mock-safe 演示模式",
]);

assertFileIncludes("scripts/completion-audit.mjs", [
  "scripts/verify-public-demo.mjs",
  "scripts/verify-production-flow.mjs",
  "PRODUCTION_FLOW_REQUIRE_BROWSER",
  "公网部署路径默认强制 mock",
  "blockerNextSteps",
  "npm run verify:remote-ci -- --wait",
]);

assertFileIncludes("scripts/package-source.mjs", [
  ".github/workflows/verify.yml",
  "deploy/raspberry-pi/env.production.local.example",
  "scripts/verify-raspberry-pi-templates.mjs",
  "scripts/print-submission-evidence.mjs",
  "scripts/verify-submission.mjs",
  "scripts/completion-audit.mjs",
  "manifest.json",
  "archiveFileCount",
  "assertArchiveEntriesSafe",
  "generatedAt",
  "docs/external-closure-runbook.md",
  "scripts/verify-production-server.mjs",
  "tests/http-server.test.ts",
]);

assertFileIncludes("scripts/print-submission-evidence.mjs", [
  ".cache/submission/manifest.json",
  "archiveFileCount",
  "artifacts/zhihu-roundtable-desktop.png",
  "artifacts/zhihu-roundtable-public-desktop.png",
  "supportingDocs",
  "docs/demo-day-quick-card.md",
  "docs/judge-defense-matrix.md",
  "docs/raspberry-pi-ops-checklist.md",
  "## 支撑材料",
  "--allow-dirty",
  "--markdown",
  "# 知辩圆桌提交证据",
  "submission evidence requires a clean worktree",
  "process.env.PUBLIC_DEMO_URL",
  "PUBLIC_DEMO_EXPECT_PROVIDER",
  "npm run verify:goal-readiness",
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
  "npm run verify:external-preflight",
  "PUBLIC_DEMO_URL=https://zhihu-roundtable.felixypz.me PUBLIC_DEMO_EXPECT_PROVIDER=live npm run verify:final",
  "/api/health.deploymentCommit",
  "remote CI verifier: npm run verify:remote-ci -- --wait passed for current HEAD",
  "node scripts/print-submission-evidence.mjs --markdown",
  "npm run completion:audit",
  "visibility: PUBLIC",
  "deploy/raspberry-pi/",
  "npm run verify:raspberry-pi",
  "docs/raspberry-pi-ops-checklist.md",
  "66 个测试通过",
  "生产式浏览器路径确认",
  "前端 bundle 中的产品关键文案",
  "当前公网 demo 运行在 `live` 读链路",
]);

assertFileIncludes("docs/backend-contract.md", [
  "live 只读接口失败",
  "发布被限流时会明确转入 mock-safe 复盘",
  "服务层默认拒绝 live 写操作",
]);

assertFileIncludes("docs/deployment.md", [
  "npm run verify:remote-ci",
  "树莓派部署指南",
  "PUBLIC_DEMO_URL=https://你的线上-demo域名 npm run verify:public:full",
  "PUBLIC_DEMO_URL=https://你的线上-demo域名 REVIEWER_REPO_ACCESS_CONFIRMED=1 npm run verify:final",
  "公网 Demo 会同时验证 `verify:public` 和公网浏览器点击流",
  "npm run verify:remote-ci -- --wait",
  "VITE_DEMO_FALLBACK_TO_MOCK=true",
  "deploy/raspberry-pi/",
  "树莓派 systemd 配置",
]);

assertFileIncludes("docs/raspberry-pi-deployment.md", [
  "deploy/raspberry-pi/env.production.local.example",
  "deploy/raspberry-pi/zhihu-roundtable.service.example",
  "deploy/raspberry-pi/cloudflared-config.example.yml",
  "npm run verify:raspberry-pi",
  "树莓派公网 Demo 现场检查清单",
  "Node: `24.x`",
  "ZHIHU_PROVIDER=mock",
  "VITE_DEMO_FALLBACK_TO_MOCK=true",
  "systemd",
  "Cloudflare Tunnel",
  "PUBLIC_DEMO_URL=https://你的树莓派公网域名 npm run verify:public:full",
  "不要为了演示把确认保护关掉",
]);

assertFileIncludes("scripts/verify-raspberry-pi-templates.mjs", [
  "ZHIHU_PROVIDER",
  "VITE_DEMO_FALLBACK_TO_MOCK",
  "service: http://127.0.0.1:${env.PORT}",
  "Raspberry Pi deployment templates verified.",
]);

assertFileIncludes("deploy/raspberry-pi/env.production.local.example", [
  "ZHIHU_PROVIDER=mock",
  "VITE_DEMO_MODEL_MODE=mock",
  "VITE_DEMO_DEFAULT_PROVIDER=mock",
  "VITE_DEMO_FALLBACK_TO_MOCK=true",
]);

assertFileIncludes("deploy/raspberry-pi/zhihu-roundtable.service.example", [
  "EnvironmentFile=/home/pi/Zhihu-Roundtable/.env.production.local",
  "ExecStart=/home/pi/.nvm/versions/node/v24.12.0/bin/npm run start",
  "Restart=always",
]);

assertFileIncludes("deploy/raspberry-pi/cloudflared-config.example.yml", [
  "tunnel: zhihu-roundtable",
  "service: http://127.0.0.1:8899",
  "service: http_status:404",
]);

assertFileIncludes("docs/external-closure-runbook.md", [
  "git push origin main",
  "npm run verify:remote-ci -- --wait",
  "verify:external-preflight",
  "--strict-gh",
  "--strict-remote-ci",
  "树莓派部署指南",
  "树莓派公网 Demo 现场检查清单",
  "deploy/raspberry-pi/",
  "npm run verify:raspberry-pi",
  "PUBLIC_DEMO_URL=https://你的线上-demo域名 npm run verify:public:full",
  "PUBLIC_DEMO_URL=https://你的线上-demo域名 REVIEWER_REPO_ACCESS_CONFIRMED=1 npm run verify:final",
  "ZHIHU_PROVIDER=mock",
  "VITE_DEMO_FALLBACK_TO_MOCK=true",
  "update_goal",
]);

assertFileIncludes("docs/submission-form-checklist.md", [
  "项目名称",
  "可运行体验链接",
  "docs/judge-defense-matrix.md",
  "https://zhihu-roundtable.felixypz.me",
  "知乎登录回调地址",
  "当前仓库为 public",
  "npm run verify:submission",
  "npm run evidence:submission",
  "node scripts/print-submission-evidence.mjs --markdown",
  "npm run verify:judge",
  "npm run package:source",
  "verify:remote-ci -- --wait",
  "docs/raspberry-pi-deployment.md",
  "PUBLIC_DEMO_EXPECT_PROVIDER=live npm run verify:final",
  "不要提交 `.env.local`",
  "树莓派 systemd 配置",
]);

assertFileIncludes("docs/championship-redteam.md", [
  "docs/raspberry-pi-deployment.md",
  "不能只上传 `dist/`",
  "真实写权限",
]);

assertFileIncludes("docs/judge-defense-matrix.md", [
  "这是不是 AI 帮用户写知乎回答？",
  "和普通热榜摘要有什么区别？",
  "真实接口没打通怎么办？",
  "会不会自动发帖或误触真实知乎写操作？",
  "AI 胡说或编证据怎么控制？",
  "不展示或打印 `.env.local`",
  "node scripts/print-submission-evidence.mjs --markdown",
  "PUBLIC_DEMO_URL=https://你的线上-demo域名 REVIEWER_REPO_ACCESS_CONFIRMED=1 npm run verify:final",
]);

assertFileIncludes("docs/submission-package.md", [
  ".cache/submission/zhihu-roundtable-source.zip",
  ".cache/submission/manifest.json",
  "HEAD commit",
  "sha256",
  "docs/judge-defense-matrix.md",
  "docs/external-closure-runbook.md",
  "deploy/raspberry-pi/",
  "evidence:submission",
  "树莓派公网 Demo 现场检查清单",
  "树莓派部署指南",
]);

assertFileIncludes("docs/raspberry-pi-ops-checklist.md", [
  "ZHIHU_PROVIDER=mock",
  "npm run verify:raspberry-pi",
  "cloudflared tunnel info zhihu-roundtable",
  "PUBLIC_DEMO_URL=https://你的树莓派公网域名 npm run verify:public:full",
  "PUBLIC_DEMO_URL=https://你的树莓派公网域名 REVIEWER_REPO_ACCESS_CONFIRMED=1 npm run verify:final",
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

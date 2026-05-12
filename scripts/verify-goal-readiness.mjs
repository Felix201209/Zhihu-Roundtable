import { spawnSync } from "node:child_process";

const notBefore = new Date(process.env.GOAL_NOT_BEFORE ?? "2026-05-13T07:30:00+08:00");
const now = new Date();
const publicDemoUrl = process.env.PUBLIC_DEMO_URL;
const expectedProvider = process.env.PUBLIC_DEMO_EXPECT_PROVIDER ?? "live";

const checklist = [
  ["用户交互体验、排版、设计、UI/UX 可路演", "npm run verify covers frontend smoke; verify:final covers public browser flow; completion:audit checks screenshot artifacts"],
  ["真实 DeepSeek + 知乎 live 读链路", "PUBLIC_DEMO_EXPECT_PROVIDER=live npm run verify:final checks /api/zhihu/status, /api/models and public browser flow"],
  ["缓存开启并被公网验收", "scripts/verify-public-demo.mjs asserts Zhihu read cache and DeepSeek JSON cache are enabled"],
  ["知乎 live 富文本不会污染 UI", "scripts/verify-public-demo.mjs samples /api/topics titles/reasons and rejects raw HTML/entities"],
  ["live 写操作安全", "tests/http-server.test.ts covers confirmation tokens and mock-safe publish fallback; completion:audit checks live write protection"],
  ["部署与公网演示可验证", "verify:final checks remote CI, public smoke, public browser flow and strict completion audit"],
  ["提交证据与源码包对齐当前 HEAD", "npm run package:source && npm run evidence:submission prints clean HEAD, manifest, file counts and sha256"],
  ["不要在 2026-05-13 07:30 Asia/Shanghai 前完成", "this script refuses to pass before GOAL_NOT_BEFORE"],
];

console.log("goal readiness checklist:");
for (const [index, [requirement, evidence]] of checklist.entries()) {
  console.log(`${index + 1}. ${requirement}`);
  console.log(`   evidence: ${evidence}`);
}

if (Number.isNaN(notBefore.getTime())) {
  fail(`invalid GOAL_NOT_BEFORE: ${process.env.GOAL_NOT_BEFORE}`);
}

if (now < notBefore) {
  fail(`goal cannot be marked complete before ${notBefore.toISOString()}; now=${now.toISOString()}`);
}

if (!publicDemoUrl) {
  fail("PUBLIC_DEMO_URL is required for final goal readiness verification.");
}

if (expectedProvider !== "live") {
  fail(`PUBLIC_DEMO_EXPECT_PROVIDER must be live for goal readiness, got ${expectedProvider}`);
}

run("npm", ["run", "verify"]);
run("npm", ["run", "verify:final"]);
run("npm", ["run", "package:source"]);
run("npm", ["run", "evidence:submission"]);

console.log("goal readiness passed: objective evidence is current and complete.");

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env: process.env,
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function fail(message) {
  console.error(`goal readiness failed: ${message}`);
  process.exit(1);
}

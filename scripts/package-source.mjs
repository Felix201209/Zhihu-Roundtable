import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { dirname } from "node:path";
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const allowDirty = args.includes("--allow-dirty");
const outputPath = args.find((arg) => arg !== "--allow-dirty") ?? ".cache/submission/zhihu-roundtable-source.zip";
const prefix = "zhihu-roundtable/";
const requiredSourceFiles = [
  "README.md",
  "JUDGE_GUIDE.md",
  "package.json",
  "package-lock.json",
  ".github/workflows/verify.yml",
  "render.yaml",
  "docs/backend-contract.md",
  "docs/deployment.md",
  "docs/submission-form-checklist.md",
  "docs/final-readiness-audit.md",
  "scripts/verify-submission.mjs",
  "scripts/completion-audit.mjs",
  "scripts/verify-remote-ci.mjs",
  "scripts/verify-public-demo.mjs",
  "scripts/verify-production-server.mjs",
  "scripts/verify-production-flow.mjs",
  "src/backend/workflow-service.ts",
  "src/frontend/main.tsx",
  "tests/frontend-smoke.test.tsx",
  "tests/http-server.test.ts",
];

if (!allowDirty) {
  assertCleanWorktree();
}

mkdirSync(dirname(outputPath), { recursive: true });
rmSync(outputPath, { force: true });

const sourceFiles = run("git", ["ls-tree", "-r", "--name-only", "HEAD"], { capture: true }).stdout
  .split("\n")
  .map((line) => line.trim())
  .filter(Boolean);

const forbidden = sourceFiles.filter((file) => {
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
  console.error(`HEAD contains forbidden source package entries:\n${forbidden.join("\n")}`);
  process.exit(1);
}

const missingRequired = requiredSourceFiles.filter((file) => !sourceFiles.includes(file));
if (missingRequired.length > 0) {
  console.error(`HEAD is missing required source package entries:\n${missingRequired.join("\n")}`);
  process.exit(1);
}

run("git", ["archive", "--format=zip", `--prefix=${prefix}`, "-o", outputPath, "HEAD"]);

const stats = existsSync(outputPath) ? statSync(outputPath) : null;
if (!stats || stats.size < 10_000) {
  console.error(`source package appears missing or too small: ${outputPath}`);
  process.exit(1);
}

const commit = run("git", ["rev-parse", "HEAD"], { capture: true }).stdout.trim();
const sha256 = createHash("sha256").update(readFileSync(outputPath)).digest("hex");

console.log(`source package ready: ${outputPath}`);
console.log(`files: ${sourceFiles.length}`);
console.log(`commit: ${commit}`);
console.log(`size: ${stats.size} bytes`);
console.log(`sha256: ${sha256}`);

function assertCleanWorktree() {
  const status = run("git", ["status", "--porcelain"], { capture: true }).stdout.trim();
  if (status) {
    console.error("source package requires a clean git worktree because it archives HEAD.");
    console.error("Commit or stash local changes first, or pass --allow-dirty for local debugging only.");
    process.exit(1);
  }
}

function run(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, {
    encoding: "utf8",
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });

  if (result.status !== 0) {
    if (options.capture) {
      process.stderr.write(result.stderr);
    }
    console.error(`${cmd} ${args.join(" ")} failed with ${result.status}`);
    process.exit(result.status ?? 1);
  }

  return result;
}

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
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
  "deploy/raspberry-pi/env.production.local.example",
  "deploy/raspberry-pi/zhihu-roundtable.service.example",
  "deploy/raspberry-pi/cloudflared-config.example.yml",
  "docs/backend-contract.md",
  "docs/deployment.md",
  "docs/raspberry-pi-deployment.md",
  "docs/raspberry-pi-ops-checklist.md",
  "docs/external-closure-runbook.md",
  "docs/submission-form-checklist.md",
  "docs/final-readiness-audit.md",
  "scripts/verify-submission.mjs",
  "scripts/print-submission-evidence.mjs",
  "scripts/completion-audit.mjs",
  "scripts/verify-remote-ci.mjs",
  "scripts/verify-raspberry-pi-templates.mjs",
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
const manifestPath = join(dirname(outputPath), "manifest.json");
const manifest = {
  package: outputPath,
  manifest: manifestPath,
  generatedAt: new Date().toISOString(),
  commit,
  fileCount: sourceFiles.length,
  sizeBytes: stats.size,
  sha256,
  allowDirty,
  requiredSourceFiles,
};

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
assertManifestMatchesPackage(manifestPath, manifest);

console.log(`source package ready: ${outputPath}`);
console.log(`manifest: ${manifestPath}`);
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

function assertManifestMatchesPackage(manifestPath, expected) {
  const actual = JSON.parse(readFileSync(manifestPath, "utf8"));
  for (const key of ["package", "manifest", "commit", "fileCount", "sizeBytes", "sha256", "allowDirty"]) {
    if (actual[key] !== expected[key]) {
      console.error(`source package manifest mismatch for ${key}: expected ${expected[key]}, got ${actual[key]}`);
      process.exit(1);
    }
  }

  const packageStats = existsSync(actual.package) ? statSync(actual.package) : null;
  if (!packageStats || packageStats.size !== actual.sizeBytes) {
    console.error(`source package manifest size mismatch for ${actual.package}`);
    process.exit(1);
  }

  const packageSha256 = createHash("sha256").update(readFileSync(actual.package)).digest("hex");
  if (packageSha256 !== actual.sha256) {
    console.error(`source package manifest sha256 mismatch for ${actual.package}`);
    process.exit(1);
  }

  if (
    !Array.isArray(actual.requiredSourceFiles) ||
    actual.requiredSourceFiles.length !== expected.requiredSourceFiles.length ||
    actual.requiredSourceFiles.some((file, index) => file !== expected.requiredSourceFiles[index])
  ) {
    console.error("source package manifest missing requiredSourceFiles");
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

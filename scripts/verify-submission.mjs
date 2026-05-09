import { spawn } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";

const requiredFiles = [
  "README.md",
  "JUDGE_GUIDE.md",
  "DESIGN.md",
  ".env.example",
  ".github/workflows/verify.yml",
  "docs/backend-contract.md",
  "docs/hackathon-demo-plan.md",
  "docs/hackathon-source-notes.md",
  "docs/championship-redteam.md",
  "docs/original-plan-coverage.md",
  "docs/submission-audit.md",
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

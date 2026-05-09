import { spawn } from "node:child_process";
import { existsSync, statSync } from "node:fs";

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

for (const file of requiredFiles) {
  if (!existsSync(file)) {
    console.error(`missing required file: ${file}`);
    process.exit(1);
  }
  if (file.startsWith("artifacts/") && statSync(file).size < 10_000) {
    console.error(`artifact appears empty or corrupted: ${file}`);
    process.exit(1);
  }
}

for (const [cmd, args] of commands) {
  await run(cmd, args);
}

console.log("\nsubmission verify passed: docs, tests, build and backend demo are ready.");

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

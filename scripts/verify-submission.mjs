import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

const requiredFiles = [
  "README.md",
  "JUDGE_GUIDE.md",
  ".env.example",
  ".github/workflows/verify.yml",
  "docs/backend-contract.md",
  "docs/hackathon-demo-plan.md",
  "docs/championship-redteam.md",
  "docs/original-plan-coverage.md",
  "docs/submission-audit.md",
  "src/backend/workflow-service.ts",
  "src/frontend/main.tsx",
  "tests/frontend-smoke.test.tsx",
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

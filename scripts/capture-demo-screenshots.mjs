import { mkdirSync } from "node:fs";
import { spawn } from "node:child_process";

const outDir = "artifacts";
const baseUrl = process.env.DEMO_URL ?? "http://localhost:5173/";
const backendUrl = process.env.BACKEND_URL ?? "http://localhost:8787/api/health";

mkdirSync(outDir, { recursive: true });

await assertReachable(backendUrl, "backend");
await assertReachable(baseUrl, "frontend");

await run("npx", [
  "-y",
  "playwright@1.56.1",
  "screenshot",
  "--channel",
  "chrome",
  "--viewport-size",
  "1440,1100",
  "--wait-for-selector",
  ".roundtable",
  "--wait-for-timeout",
  "1800",
  baseUrl,
  `${outDir}/zhihu-roundtable-desktop.png`,
]);

await run("npx", [
  "-y",
  "playwright@1.56.1",
  "screenshot",
  "--channel",
  "chrome",
  "--viewport-size",
  "390,900",
  "--wait-for-selector",
  ".roundtable",
  "--wait-for-timeout",
  "1800",
  baseUrl,
  `${outDir}/zhihu-roundtable-mobile.png`,
]);

console.log(`\ndemo screenshots captured in ${outDir}/`);

async function assertReachable(url, label) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`${response.status}`);
    }
  } catch (error) {
    console.error(`${label} is not reachable at ${url}. Start backend:serve and dev first.`);
    throw error;
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

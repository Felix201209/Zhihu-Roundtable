import { mkdirSync } from "node:fs";
import { spawn } from "node:child_process";

const outDir = "artifacts";
const baseUrl = process.env.DEMO_URL ?? "http://localhost:5173/";
const backendUrl = process.env.BACKEND_URL ?? "http://localhost:8787/api/health";
const autoStart = process.env.AUTO_START_DEMO === "1";
const children = [];

process.on("exit", cleanup);
process.on("SIGINT", () => {
  cleanup();
  process.exit(130);
});
process.on("SIGTERM", () => {
  cleanup();
  process.exit(143);
});

mkdirSync(outDir, { recursive: true });

if (autoStart) {
  await ensureReachable({
    url: backendUrl,
    label: "backend",
    command: "npm",
    args: ["run", "backend:serve"],
    env: { PORT: portFromUrl(backendUrl) },
  });
  await ensureReachable({
    url: baseUrl,
    label: "frontend",
    command: "npm",
    args: ["run", "dev", "--", "--host", "127.0.0.1", "--port", portFromUrl(baseUrl)],
    env: {
      VITE_DEV_PORT: portFromUrl(baseUrl),
      VITE_BACKEND_PROXY_TARGET: originFromUrl(backendUrl),
    },
  });
} else {
  await assertReachable(backendUrl, "backend");
  await assertReachable(baseUrl, "frontend");
}

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
cleanup();

async function ensureReachable({ url, label, command, args, env = {} }) {
  if (await isReachable(url)) {
    return;
  }

  console.log(`${label} is not reachable at ${url}. Starting ${command} ${args.join(" ")}...`);
  const child = spawn(command, args, {
    stdio: "pipe",
    shell: process.platform === "win32",
    env: { ...process.env, ...env },
  });
  children.push(child);
  child.stdout.on("data", (chunk) => writeChild(label, chunk));
  child.stderr.on("data", (chunk) => writeChild(label, chunk));

  await waitForReachable(url, label);
}

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

async function isReachable(url) {
  try {
    const response = await fetch(url);
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForReachable(url, label) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 30_000) {
    if (await isReachable(url)) {
      console.log(`${label} is reachable at ${url}`);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`${label} did not become reachable at ${url}`);
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

function writeChild(label, chunk) {
  const lines = String(chunk).split(/\r?\n/).filter(Boolean);
  for (const line of lines) {
    console.log(`[${label}] ${line}`);
  }
}

function cleanup() {
  for (const child of children) {
    child.kill("SIGTERM");
  }
}

function portFromUrl(url) {
  const parsed = new URL(url);
  if (parsed.port) {
    return parsed.port;
  }

  return parsed.protocol === "https:" ? "443" : "80";
}

function originFromUrl(url) {
  return new URL(url).origin;
}

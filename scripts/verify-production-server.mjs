import { spawn } from "node:child_process";

const port = process.env.PRODUCTION_SMOKE_PORT ?? "8899";
const origin = `http://127.0.0.1:${port}`;

const child = spawn("npm", ["run", "start"], {
  stdio: "pipe",
  shell: process.platform === "win32",
  detached: process.platform !== "win32",
  env: {
    ...process.env,
    PORT: port,
    ZHIHU_PROVIDER: "mock",
    VITE_DEMO_MODEL_MODE: "mock",
    VITE_DEMO_DEFAULT_PROVIDER: "mock",
    VITE_DEMO_FALLBACK_TO_MOCK: "true",
  },
});

let output = "";
child.stdout.on("data", (chunk) => {
  output += String(chunk);
});
child.stderr.on("data", (chunk) => {
  output += String(chunk);
});

try {
  await waitFor(`${origin}/api/health`);

  const home = await fetch(origin).then((response) => response.text());
  if (!home.includes("<!doctype html>") || !home.includes("/assets/")) {
    throw new Error("production home page did not look like the built Vite app");
  }

  const health = await fetch(`${origin}/api/health`).then((response) => response.json());
  if (health.ok !== true || health.service !== "zhihu-roundtable-backend") {
    throw new Error("production API health check returned an unexpected payload");
  }
  if (!health.endpoints?.includes?.("/api/workflow/run")) {
    throw new Error("production API health check is missing workflow endpoints");
  }

  console.log(`production server smoke passed at ${origin}`);
} finally {
  terminateProcess(child);
}

process.exit(0);

async function waitFor(url) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 30_000) {
    if (child.exitCode !== null) {
      throw new Error(`production server exited early with ${child.exitCode}\n${output}`);
    }

    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Keep waiting until the server is ready.
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`production server did not become ready at ${url}\n${output}`);
}

function terminateProcess(childProcess) {
  if (!childProcess || childProcess.killed) return;
  try {
    if (process.platform !== "win32" && childProcess.pid) {
      process.kill(-childProcess.pid, "SIGTERM");
      return;
    }
    childProcess.kill("SIGTERM");
  } catch {
    try {
      childProcess.kill("SIGTERM");
    } catch {
      // Process already exited.
    }
  }
}

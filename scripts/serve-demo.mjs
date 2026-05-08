import { spawn } from "node:child_process";

const targets = [
  {
    label: "backend",
    url: process.env.BACKEND_URL ?? "http://localhost:8787/api/health",
    command: "npm",
    args: ["run", "backend:serve"],
    displayUrl: "http://localhost:8787",
  },
  {
    label: "frontend",
    url: process.env.DEMO_URL ?? "http://localhost:5173/",
    command: "npm",
    args: ["run", "dev", "--", "--host", "127.0.0.1"],
    displayUrl: "http://localhost:5173",
  },
];

const children = [];

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    cleanup(signal);
    process.exit(0);
  });
}

console.log("\n知辩圆桌 Demo 正在启动：");
for (const target of targets) {
  await ensureRunning(target);
}

console.log("\nDemo 已就绪：");
for (const target of targets) {
  console.log(`- ${target.label}: ${target.displayUrl}`);
}
console.log("\n按 Ctrl+C 停止本脚本启动的服务；已存在的服务会保持运行。\n");

await new Promise(() => {});

async function ensureRunning(target) {
  if (await isReachable(target.url)) {
    console.log(`- ${target.label} 已在运行：${target.displayUrl}`);
    return;
  }

  const child = spawn(target.command, target.args, {
    stdio: "pipe",
    shell: process.platform === "win32",
    env: process.env,
  });
  children.push(child);
  child.stdout.on("data", (chunk) => write(target.label, chunk));
  child.stderr.on("data", (chunk) => write(target.label, chunk));
  child.on("exit", (code, signal) => {
    if (signal || code === 0) return;
    console.error(`[${target.label}] exited with code ${code}`);
    cleanup("SIGTERM");
    process.exit(code ?? 1);
  });

  await waitForReachable(target.url, target.label);
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
      console.log(`- ${label} 已启动`);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`${label} did not become reachable at ${url}`);
}

function write(label, chunk) {
  const lines = String(chunk).split(/\r?\n/).filter(Boolean);
  for (const line of lines) {
    console.log(`[${label}] ${line}`);
  }
}

function cleanup(signal) {
  for (const child of children) {
    child.kill(signal);
  }
}

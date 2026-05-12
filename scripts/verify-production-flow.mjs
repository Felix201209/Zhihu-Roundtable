import { spawn, spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";

const appPort = process.env.PRODUCTION_FLOW_PORT ?? "8900";
const chromePort = process.env.PRODUCTION_FLOW_CHROME_PORT ?? "9230";
const externalOrigin = process.env.PRODUCTION_FLOW_URL ?? process.env.PUBLIC_DEMO_URL;
const origin = externalOrigin ? normalizeOrigin(externalOrigin) : `http://127.0.0.1:${appPort}`;
const chromePath = findChrome();
const requireBrowser = process.env.PRODUCTION_FLOW_REQUIRE_BROWSER === "true";

if (!chromePath) {
  if (requireBrowser) {
    console.error("production browser flow failed: Chrome/Chromium executable was required but not found.");
    process.exit(1);
  }
  console.log("production browser flow skipped: Chrome/Chromium executable was not found.");
  process.exit(0);
}

const app = externalOrigin ? null : spawn("npm", ["run", "start"], {
  stdio: "pipe",
  shell: process.platform === "win32",
  env: {
    ...process.env,
    PORT: appPort,
    ZHIHU_PROVIDER: "mock",
    VITE_DEMO_MODEL_MODE: "mock",
    VITE_DEMO_DEFAULT_PROVIDER: "mock",
    VITE_DEMO_FALLBACK_TO_MOCK: "true",
  },
});

let appOutput = "";
app?.stdout.on("data", (chunk) => {
  appOutput += String(chunk);
});
app?.stderr.on("data", (chunk) => {
  appOutput += String(chunk);
});

const userDataDir = ".cache/chrome-production-flow";
rmSync(userDataDir, { recursive: true, force: true });
const chrome = spawn(chromePath, [
  "--headless=new",
  "--disable-gpu",
  "--disable-dev-shm-usage",
  "--no-sandbox",
  "--no-first-run",
  "--no-default-browser-check",
  `--remote-debugging-port=${chromePort}`,
  `--user-data-dir=${userDataDir}`,
  "about:blank",
], { stdio: ["ignore", "ignore", "pipe"] });

let chromeOutput = "";
chrome.stderr.on("data", (chunk) => {
  chromeOutput += String(chunk);
});

try {
  await waitForApp();
  const result = await runBrowserFlow();
  console.log(`production browser flow passed at ${origin}`);
  console.log(`steps: ${result.observations.map((item) => item.label).join(" -> ")}`);
} finally {
  app?.kill("SIGTERM");
  chrome.kill("SIGTERM");
}

async function runBrowserFlow() {
  const target = await waitForPageTarget();
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const consoleIssues = [];
  const observations = [];

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      message.error ? reject(new Error(JSON.stringify(message.error))) : resolve(message.result);
      return;
    }

    if (message.method === "Runtime.consoleAPICalled") {
      const type = message.params?.type;
      if (["warning", "error", "assert"].includes(type)) {
        consoleIssues.push({
          type,
          text: message.params.args?.map((arg) => arg.value ?? arg.description).join(" "),
        });
      }
    }

    if (message.method === "Runtime.exceptionThrown") {
      consoleIssues.push({ type: "exception", text: message.params.exceptionDetails?.text });
    }

    if (message.method === "Log.entryAdded") {
      const entry = message.params.entry;
      if (["warning", "error"].includes(entry?.level)) {
        consoleIssues.push({ type: entry.level, text: entry.text, url: entry.url });
      }
    }
  });

  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });

  function send(method, params = {}) {
    const requestId = ++id;
    socket.send(JSON.stringify({ id: requestId, method, params }));
    return new Promise((resolve, reject) => pending.set(requestId, { resolve, reject }));
  }

  async function evaluate(expression) {
    const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.text);
    }
    return result.result.value;
  }

  async function waitForText(text) {
    const escaped = JSON.stringify(text);
    const startedAt = Date.now();
    while (Date.now() - startedAt < 8_000) {
      const found = await evaluate(`document.body && document.body.innerText.includes(${escaped})`);
      if (found) return;
      await delay(150);
    }
    throw new Error(`missing text after wait: ${text}`);
  }

  async function observe(label, expectedText) {
    await waitForText(expectedText);
    const body = await evaluate("document.body.innerText");
    observations.push({ label, expectedText, found: body.includes(expectedText) });
  }

  async function clickButton(pattern) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < 12_000) {
      const clicked = await evaluate(`(() => {
        const re = new RegExp(${JSON.stringify(pattern.source)}, ${JSON.stringify(pattern.flags)});
        const button = [...document.querySelectorAll("button")].find((item) => {
          const label = item.textContent || item.innerText || item.getAttribute("aria-label") || "";
          return re.test(label);
        });
        if (!button || button.disabled) return false;
        button.scrollIntoView({ block: "center", inline: "center" });
        button.click();
        return true;
      })()`);

      if (clicked) return;
      await delay(200);
    }

    const buttons = await evaluate(`JSON.stringify([...document.querySelectorAll("button")].map((item) => ({
      label: item.textContent || item.innerText || item.getAttribute("aria-label") || "",
      disabled: item.disabled
    })))`);
    const body = await evaluate("document.body.innerText.slice(0, 1200)");
    throw new Error(`enabled button not found: ${pattern}; buttons: ${buttons}; body: ${JSON.stringify(body)}`);
  }

  try {
    await send("Runtime.enable");
    await send("Log.enable");
    await send("Page.enable");
    await send("Page.navigate", { url: `${origin}/` });

    await observe("home", "创作者和圈主的 AI 讨论组织台");
    await clickButton(/从热榜生成讨论方案/);
    await observe("radar", "选题雷达");
    await clickButton(/生成讨论方案/);
    await observe("prepare", "讨论方案准备");
    await delay(2_500);
    const stayedOnPrepare = (await evaluate("document.body.innerText")).includes("讨论方案准备");
    if (!stayedOnPrepare) {
      throw new Error("production flow skipped away from discussion preparation after generating a plan");
    }

    await clickButton(/让刘看山校验讨论方案/);
    await observe("debate", "刘看山主持校验");
    await clickButton(/生成发布策划/);
    await observe("publish", "发布策划与圈子帖预览");
    await observe("publish-safety", "Mock-safe 演示模式");
    await clickButton(/确认发布到圈子/);
    await observe("feedback", "评论复盘与下一轮创作");
    await observe("next-content", "下一篇内容方向");

    const meaningfulIssues = consoleIssues.filter((issue) => !isBenignConsoleIssue(issue));
    if (meaningfulIssues.length > 0) {
      throw new Error(`browser console had warnings/errors:\n${JSON.stringify(meaningfulIssues, null, 2)}`);
    }

    return { observations };
  } finally {
    socket.close();
  }
}

function isBenignConsoleIssue(issue) {
  const text = issue.text ?? "";
  const url = issue.url ?? "";
  if (/favicon/i.test(`${text} ${url}`)) return true;
  return /Failed to load resource/i.test(text) && /status of 404|404 \(Not Found\)/i.test(text) && /\/favicon\.ico(?:$|\?)/i.test(url);
}

async function waitForApp() {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 30_000) {
    if (app && app.exitCode !== null) {
      throw new Error(`production app exited early with ${app.exitCode}\n${appOutput}`);
    }
    try {
      const response = await fetch(`${origin}/api/health`);
      if (response.ok) return;
    } catch {
      // Keep waiting until the server is ready.
    }
    await delay(500);
  }
  throw new Error(`production app did not become ready at ${origin}\n${appOutput}`);
}

async function waitForPageTarget() {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 10_000) {
    if (chrome.exitCode !== null) {
      throw new Error(`Chrome exited early with ${chrome.exitCode}\n${chromeOutput}`);
    }
    try {
      const response = await fetch(`http://127.0.0.1:${chromePort}/json/list`);
      if (response.ok) {
        const targets = await response.json();
        const page = targets.find((target) => target.type === "page" && target.webSocketDebuggerUrl);
        if (page) return page;
      }
    } catch {
      // Keep waiting until the Chrome debugging target is ready.
    }
    await delay(150);
  }
  throw new Error(`Chrome page target did not become ready\n${chromeOutput}`);
}

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  for (const binary of ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "chrome"]) {
    const found = spawnSync(process.platform === "win32" ? "where" : "which", [binary], { encoding: "utf8" });
    if (found.status === 0) {
      return found.stdout.split("\n").map((line) => line.trim()).find(Boolean);
    }
  }

  return undefined;
}

function normalizeOrigin(value) {
  const parsed = new URL(value);
  parsed.pathname = "";
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString().replace(/\/$/, "");
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

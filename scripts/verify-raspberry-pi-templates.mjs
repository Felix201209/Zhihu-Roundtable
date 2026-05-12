import { existsSync, readFileSync } from "node:fs";

const envPath = "deploy/raspberry-pi/env.production.local.example";
const servicePath = "deploy/raspberry-pi/zhihu-roundtable.service.example";
const tunnelPath = "deploy/raspberry-pi/cloudflared-config.example.yml";

for (const file of [envPath, servicePath, tunnelPath]) {
  if (!existsSync(file)) {
    fail(`missing Raspberry Pi deployment template: ${file}`);
  }
}

const envContent = readFileSync(envPath, "utf8");
const env = parseEnv(envContent);
const service = readFileSync(servicePath, "utf8");
const tunnel = readFileSync(tunnelPath, "utf8");

assertEnvValue("NODE_ENV", "production");
assertEnvValue("PORT", "8899");
assertEnvValue("STATIC_DIR", "dist");
assertEnvValue("ZHIHU_PROVIDER", "mock");
assertEnvValue("VITE_DEMO_MODEL_MODE", "mock");
assertEnvValue("VITE_DEMO_DEFAULT_PROVIDER", "mock");
assertEnvValue("VITE_DEMO_FALLBACK_TO_MOCK", "true");

assertNotIncludes(envPath, envContent, [
  "DEEPSEEK_API_KEY=",
  "ZHIHU_APP_KEY=",
  "ZHIHU_APP_SECRET=",
  "ZHIHU_ACCESS_TOKEN=",
  "ZHIHU_OAUTH_CLIENT_SECRET=",
]);

assertIncludes(servicePath, service, [
  "WorkingDirectory=/home/pi/Zhihu-Roundtable",
  "EnvironmentFile=/home/pi/Zhihu-Roundtable/.env.production.local",
  "Environment=PATH=/home/pi/.nvm/versions/node/v24.",
  "ExecStart=/home/pi/.nvm/versions/node/v24.",
  "/bin/npm run start",
  "Restart=always",
]);

assertIncludes(tunnelPath, tunnel, [
  "tunnel: zhihu-roundtable",
  "credentials-file: /home/pi/.cloudflared/<tunnel-id>.json",
  `service: http://127.0.0.1:${env.PORT}`,
  "service: http_status:404",
]);

console.log("Raspberry Pi deployment templates verified.");
console.log(`port: ${env.PORT}`);
console.log("provider: mock");

function parseEnv(content) {
  const result = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(trimmed);
    if (!match) {
      fail(`invalid env line in ${envPath}: ${line}`);
    }
    result[match[1]] = match[2];
  }
  return result;
}

function assertEnvValue(key, expected) {
  if (env[key] !== expected) {
    fail(`${envPath} expected ${key}=${expected}, got ${env[key] ?? "<missing>"}`);
  }
}

function assertIncludes(file, content, snippets) {
  for (const snippet of snippets) {
    if (!content.includes(snippet)) {
      fail(`${file} missing ${JSON.stringify(snippet)}`);
    }
  }
}

function assertNotIncludes(file, content, snippets) {
  for (const snippet of snippets) {
    if (content.includes(snippet)) {
      fail(`${file} must not include ${JSON.stringify(snippet)}`);
    }
  }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

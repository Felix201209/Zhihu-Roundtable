import { spawnSync } from "node:child_process";

const args = new Set(process.argv.slice(2));
const allowDirty = args.has("--allow-dirty");
const json = args.has("--json");
const strictGh = args.has("--strict-gh");
const strictRemoteCi = args.has("--strict-remote-ci");
const ghRetries = positiveInt(process.env.GITHUB_PREFLIGHT_RETRIES, 3);

const branch = runRequired("git", ["rev-parse", "--abbrev-ref", "HEAD"]).stdout.trim();
const head = runRequired("git", ["rev-parse", "HEAD"]).stdout.trim();
const latestCommit = runRequired("git", ["log", "-1", "--oneline"]).stdout.trim();
const gitStatus = runRequired("git", ["status", "-sb"]).stdout.trim();
const dirty = runRequired("git", ["status", "--porcelain"]).stdout.trim();
const remoteUrl = runRequired("git", ["remote", "get-url", "origin"]).stdout.trim();
const repo = process.env.GITHUB_REPOSITORY || process.env.REMOTE_CI_REPO || parseGithubRepo(remoteUrl);

if (dirty && !allowDirty) {
  fail(`external preflight requires a clean worktree. Commit or stash changes first, or pass --allow-dirty for local debugging only.\n${dirty}`);
}

const pushDryRun = runRequired("git", ["push", "--dry-run", "origin", branch]);
const remoteCi = runOptional("node", ["scripts/verify-remote-ci.mjs", "--allow-not-pushed"]);
const repoInfo = repo ? runGhJson(["api", `repos/${repo}`, "--jq", "{full_name, private, visibility, default_branch, pushed_at, html_url}"]) : null;
const invitations = repo ? runGhJson(["api", `repos/${repo}/invitations`, "--jq", "map({id:.id, invitee:.invitee.login, permissions:.permissions})"]) : null;
const collaborators = repo ? runGhJson(["api", `repos/${repo}/collaborators`, "--jq", "map({login:.login, permissions:.permissions})"]) : null;
const githubWarnings = [repoInfo?.warning, invitations?.warning, collaborators?.warning].filter(Boolean);
const warnings = [remoteCi.warning, ...githubWarnings].filter(Boolean);

const result = {
  ok: true,
  branch,
  head,
  latestCommit,
  gitStatus,
  allowDirty,
  repo,
  pushDryRun: compactOutput(pushDryRun),
  remoteCiPrecheck: remoteCi.ok ? compactOutput(remoteCi.result) : null,
  github: {
    repo: repoInfo?.value ?? null,
    invitations: invitations?.value ?? null,
    collaborators: collaborators?.value ?? null,
    warnings: githubWarnings,
  },
  warnings,
  nextSteps: [
    "git push origin main",
    "npm run verify:remote-ci -- --wait",
    "PUBLIC_DEMO_URL=https://你的线上-demo域名 npm run verify:public:full",
    "PUBLIC_DEMO_URL=https://你的线上-demo域名 REVIEWER_REPO_ACCESS_CONFIRMED=1 npm run verify:final",
  ],
};

if (strictGh && githubWarnings.length > 0) {
  fail(`GitHub metadata preflight failed:\n${githubWarnings.join("\n")}`);
}

if (strictRemoteCi && remoteCi.warning) {
  fail(remoteCi.warning);
}

if (json) {
  console.log(JSON.stringify(result, null, 2));
} else {
  printText(result);
}

function printText(result) {
  console.log(`external preflight passed for ${result.head}`);
  console.log(`branch: ${result.branch}`);
  console.log(`latest: ${result.latestCommit}`);
  console.log(`status: ${result.gitStatus}`);
  console.log("\npush dry-run:");
  console.log(result.pushDryRun || "(no output)");
  console.log("\nremote CI precheck:");
  console.log(result.remoteCiPrecheck || "(not available; see warnings)");

  if (result.github.repo) {
    console.log("\nGitHub repo:");
    console.log(JSON.stringify(result.github.repo, null, 2));
  }
  if (result.github.invitations) {
    console.log("\nGitHub pending invitations:");
    console.log(JSON.stringify(result.github.invitations, null, 2));
  }
  if (result.github.collaborators) {
    console.log("\nGitHub collaborators:");
    console.log(JSON.stringify(result.github.collaborators, null, 2));
  }
  for (const warning of result.warnings) {
    console.log(`\nwarning: ${warning}`);
  }

  console.log("\nnext:");
  for (const step of result.nextSteps) {
    console.log(`- ${step}`);
  }
}

function runGhJson(args) {
  let result;
  for (let attempt = 1; attempt <= ghRetries; attempt += 1) {
    result = spawnSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    if (result.status === 0) break;
    if (attempt < ghRetries) sleepSync(Math.min(250 * attempt, 1_000));
  }

  if (result.status !== 0) {
    const output = compactOutput(result);
    return { warning: `gh ${args.join(" ")} failed after ${ghRetries} attempt(s): ${output || `exit ${result.status}`}` };
  }

  try {
    return { value: JSON.parse(result.stdout) };
  } catch {
    return { warning: `gh ${args.join(" ")} did not return JSON: ${result.stdout.trim()}` };
  }
}

function positiveInt(value, fallback) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function runOptional(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (result.status !== 0) {
    const output = compactOutput(result);
    return { ok: false, warning: `${command} ${args.join(" ")} failed: ${output || `exit ${result.status}`}` };
  }
  return { ok: true, result };
}

function runRequired(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    fail(`${command} ${args.join(" ")} failed with ${result.status}`);
  }
  return result;
}

function compactOutput(result) {
  return [result.stdout, result.stderr]
    .map((text) => text.trim())
    .filter(Boolean)
    .join("\n");
}

function parseGithubRepo(remoteUrl) {
  const httpsMatch = remoteUrl.match(/github\.com[:/]([^/]+\/[^/.]+)(?:\.git)?$/);
  return httpsMatch?.[1] ?? null;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

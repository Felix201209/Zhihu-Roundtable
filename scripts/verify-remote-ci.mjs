import { spawnSync } from "node:child_process";

const repo = process.env.GITHUB_REPOSITORY || process.env.REMOTE_CI_REPO || "Felix201209/Zhihu-Roundtable";
const workflow = process.env.REMOTE_CI_WORKFLOW || "Verify";
const allowNotPushed = process.argv.includes("--allow-not-pushed");
const wait = process.argv.includes("--wait");
const timeoutMs = readPositiveInt(process.env.REMOTE_CI_WAIT_MS, 20 * 60 * 1000);
const intervalMs = readPositiveInt(process.env.REMOTE_CI_POLL_MS, 10 * 1000);
const headSha = run("git", ["rev-parse", "HEAD"]).stdout.trim();
const deadline = Date.now() + timeoutMs;

while (true) {
  const runs = listRuns();
  const runForHead = runs.find((item) => item.headSha === headSha);

  if (!runForHead) {
    const latest = runs[0];
    const message = [
      `no remote CI run found for current HEAD ${headSha}`,
      latest ? `latest remote run is ${latest.headSha} (${latest.status}/${latest.conclusion}) at ${latest.url}` : "no remote runs returned",
      wait ? "waiting for GitHub Actions to create a run for the current commit" : "push the current commit, then run npm run verify:remote-ci again",
    ].join("\n");

    if (allowNotPushed) {
      console.log(`remote CI precheck: ${message}`);
      process.exit(0);
    }

    if (wait && Date.now() < deadline) {
      console.log(`remote CI pending: ${message}`);
      sleep(intervalMs);
      continue;
    }

    console.error(message);
    process.exit(1);
  }

  if (runForHead.status === "completed" && runForHead.conclusion === "success") {
    console.log(`remote CI passed for ${headSha}`);
    console.log(runForHead.url);
    process.exit(0);
  }

  if (runForHead.status === "completed") {
    console.error(
      `remote CI for current HEAD is not successful: ${runForHead.status}/${runForHead.conclusion}\n${runForHead.url}`,
    );
    process.exit(1);
  }

  if (!wait || Date.now() >= deadline) {
    console.error(
      `remote CI for current HEAD is not successful: ${runForHead.status}/${runForHead.conclusion}\n${runForHead.url}`,
    );
    process.exit(1);
  }

  console.log(`remote CI pending for ${headSha}: ${runForHead.status}/${runForHead.conclusion ?? "none"}`);
  console.log(runForHead.url);
  sleep(intervalMs);
}

function listRuns() {
  return JSON.parse(
    run("gh", [
      "run",
      "list",
      "--repo",
      repo,
      "--workflow",
      workflow,
      "--limit",
      "20",
      "--json",
      "databaseId,headSha,status,conclusion,createdAt,url,event",
    ]).stdout,
  );
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function readPositiveInt(value, fallback) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function run(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    console.error(`${command} ${args.join(" ")} failed with ${result.status}`);
    process.exit(result.status ?? 1);
  }
  return result;
}

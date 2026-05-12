import { spawnSync } from "node:child_process";

const publicDemoUrl = process.env.PUBLIC_DEMO_URL;
const expectedCommit = process.env.PUBLIC_DEMO_EXPECT_COMMIT ?? gitHead();

if (!publicDemoUrl) {
  console.error("PUBLIC_DEMO_URL is required. Example: PUBLIC_DEMO_URL=https://your-demo.example.com npm run verify:final");
  process.exit(1);
}

run("npm", ["run", "verify:remote-ci", "--", "--wait"]);
run("npm", ["run", "verify:public:full"], {
  ...process.env,
  PUBLIC_DEMO_EXPECT_COMMIT: expectedCommit,
});
run("npm", ["run", "completion:audit", "--", "--strict"], {
  ...process.env,
  REMOTE_CI_VERIFIED: "1",
  PUBLIC_DEMO_VERIFIED: "1",
  PUBLIC_DEMO_URL: publicDemoUrl,
});

function gitHead() {
  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    return undefined;
  }
  return result.stdout.trim() || undefined;
}

function run(command, args, env = process.env) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env,
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

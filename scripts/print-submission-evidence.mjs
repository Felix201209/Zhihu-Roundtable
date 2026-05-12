import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";

const args = new Set(process.argv.slice(2));
const allowDirty = args.has("--allow-dirty");
const manifestPath = ".cache/submission/manifest.json";
const desktopScreenshot = "artifacts/zhihu-roundtable-desktop.png";
const mobileScreenshot = "artifacts/zhihu-roundtable-mobile.png";

const head = run("git", ["rev-parse", "HEAD"]).trim();
const branch = run("git", ["rev-parse", "--abbrev-ref", "HEAD"]).trim();
const status = run("git", ["status", "-sb"]).trim();
const dirty = run("git", ["status", "--porcelain"]).trim();
const shortLog = run("git", ["log", "-1", "--oneline"]).trim();

if (dirty && !allowDirty) {
  fail(`submission evidence requires a clean worktree. Commit or stash changes first, or pass --allow-dirty for local preview only.\n${dirty}`);
}

const manifest = readJson(manifestPath);
if (manifest.commit !== head) {
  fail(`${manifestPath} commit ${manifest.commit} does not match HEAD ${head}. Run npm run package:source.`);
}

if (!existsSync(manifest.package)) {
  fail(`source package missing: ${manifest.package}. Run npm run package:source.`);
}

const packageStats = statSync(manifest.package);
const packageSha256 = createHash("sha256").update(readFileSync(manifest.package)).digest("hex");
if (packageStats.size !== manifest.sizeBytes || packageSha256 !== manifest.sha256) {
  fail(`${manifest.package} does not match ${manifestPath}. Run npm run package:source.`);
}

const desktop = readPngDimensions(desktopScreenshot);
const mobile = readPngDimensions(mobileScreenshot);

console.log(JSON.stringify({
  project: "知辩圆桌",
  branch,
  head,
  latestCommit: shortLog,
  gitStatus: status,
  allowDirty,
  sourcePackage: {
    path: manifest.package,
    manifest: manifestPath,
    generatedAt: manifest.generatedAt,
    fileCount: manifest.fileCount,
    sizeBytes: manifest.sizeBytes,
    sha256: manifest.sha256,
  },
  screenshots: {
    desktop: { path: desktopScreenshot, ...desktop },
    mobile: { path: mobileScreenshot, ...mobile },
  },
  localGates: [
    "npm run verify:submission",
    "npm run verify:raspberry-pi",
    "npm run completion:audit",
  ],
  externalGates: [
    "git push origin main",
    "npm run verify:remote-ci -- --wait",
    "PUBLIC_DEMO_URL=https://你的线上-demo域名 npm run verify:public:full",
    "PUBLIC_DEMO_URL=https://你的线上-demo域名 REVIEWER_REPO_ACCESS_CONFIRMED=1 npm run verify:final",
  ],
}, null, 2));

function readJson(path) {
  if (!existsSync(path)) {
    fail(`missing ${path}. Run npm run package:source.`);
  }
  return JSON.parse(readFileSync(path, "utf8"));
}

function readPngDimensions(path) {
  if (!existsSync(path)) {
    fail(`missing screenshot: ${path}`);
  }
  const stats = statSync(path);
  const buffer = readFileSync(path);
  if (buffer.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
    fail(`not a PNG screenshot: ${path}`);
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
    sizeBytes: stats.size,
  };
}

function run(cmd, args) {
  const result = spawnSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    fail(`${cmd} ${args.join(" ")} failed with ${result.status}`);
  }
  return result.stdout;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

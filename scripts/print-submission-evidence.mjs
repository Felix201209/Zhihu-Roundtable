import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";

const args = new Set(process.argv.slice(2));
const allowDirty = args.has("--allow-dirty");
const markdown = args.has("--markdown");
const manifestPath = ".cache/submission/manifest.json";
const desktopScreenshot = "artifacts/zhihu-roundtable-desktop.png";
const mobileScreenshot = "artifacts/zhihu-roundtable-mobile.png";
const supportingDocs = [
  { label: "评审快速指南", path: "JUDGE_GUIDE.md", purpose: "3 分钟验证入口" },
  { label: "路演当天速查卡", path: "docs/demo-day-quick-card.md", purpose: "现场点击顺序和兜底动作" },
  { label: "评委追问防守矩阵", path: "docs/judge-defense-matrix.md", purpose: "尖锐追问短答和证据路径" },
  { label: "提交表单清单", path: "docs/submission-form-checklist.md", purpose: "平台填表材料" },
  { label: "树莓派部署指南", path: "docs/raspberry-pi-deployment.md", purpose: "回家部署公网 Demo" },
  { label: "树莓派现场检查清单", path: "docs/raspberry-pi-ops-checklist.md", purpose: "公网 Demo 排障和验收" },
  { label: "外部交付闭环", path: "docs/external-closure-runbook.md", purpose: "push、CI、公网和仓库访问收口" },
];

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
if (manifest.archiveFileCount !== manifest.fileCount) {
  fail(`${manifestPath} fileCount ${manifest.fileCount} does not match archiveFileCount ${manifest.archiveFileCount}. Run npm run package:source.`);
}

const desktop = readPngDimensions(desktopScreenshot);
const mobile = readPngDimensions(mobileScreenshot);
for (const doc of supportingDocs) {
  if (!existsSync(doc.path)) {
    fail(`missing supporting doc: ${doc.path}`);
  }
}

const evidence = {
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
    archiveFileCount: manifest.archiveFileCount,
    sizeBytes: manifest.sizeBytes,
    sha256: manifest.sha256,
  },
  screenshots: {
    desktop: { path: desktopScreenshot, ...desktop },
    mobile: { path: mobileScreenshot, ...mobile },
  },
  supportingDocs,
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
};

if (markdown) {
  console.log(formatMarkdown(evidence));
} else {
  console.log(JSON.stringify(evidence, null, 2));
}

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

function formatMarkdown(evidence) {
  return [
    "# 知辩圆桌提交证据",
    "",
    "## 版本",
    "",
    `- Branch: \`${evidence.branch}\``,
    `- HEAD: \`${evidence.head}\``,
    `- Latest commit: \`${evidence.latestCommit}\``,
    `- Allow dirty preview: \`${String(evidence.allowDirty)}\``,
    "- Git status:",
    "",
    "```text",
    evidence.gitStatus,
    "```",
    "",
    "## 源码包",
    "",
    `- Path: \`${evidence.sourcePackage.path}\``,
    `- Manifest: \`${evidence.sourcePackage.manifest}\``,
    `- Generated at: \`${evidence.sourcePackage.generatedAt}\``,
    `- Files: \`${evidence.sourcePackage.fileCount}\``,
    `- Archive files: \`${evidence.sourcePackage.archiveFileCount}\``,
    `- Size: \`${evidence.sourcePackage.sizeBytes}\` bytes`,
    `- SHA256: \`${evidence.sourcePackage.sha256}\``,
    "",
    "## 截图",
    "",
    formatScreenshot("Desktop", evidence.screenshots.desktop),
    formatScreenshot("Mobile", evidence.screenshots.mobile),
    "",
    "## 支撑材料",
    "",
    ...evidence.supportingDocs.map((doc) => `- ${doc.label}: \`${doc.path}\` - ${doc.purpose}`),
    "",
    "## 本地门禁",
    "",
    ...evidence.localGates.map((gate) => `- \`${gate}\``),
    "",
    "## 外部闭环",
    "",
    ...evidence.externalGates.map((gate) => `- \`${gate}\``),
  ].join("\n");
}

function formatScreenshot(label, screenshot) {
  return `- ${label}: \`${screenshot.path}\` (${screenshot.width}x${screenshot.height}, ${screenshot.sizeBytes} bytes)`;
}

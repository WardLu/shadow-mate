import { execFileSync } from "node:child_process";
import { lstat, readFile, readdir } from "node:fs/promises";
import { basename, join, relative, resolve } from "node:path";
import {
  collectReleaseFindings,
  scanReleaseEntries,
  verifyThirdPartyNotices,
} from "./release-check-lib.mjs";

const root = process.cwd();
const ZIP_MAX_BUFFER = 256 * 1024 * 1024;
const readText = (file) => readFile(join(root, file), "utf8");
const readJson = async (file) => JSON.parse(await readText(file));
const normalize = (value) => value.replaceAll("\\", "/");

async function collectDirectoryEntries(target, base = target) {
  const info = await lstat(target).catch(() => null);
  if (!info) throw new Error(`Release path does not exist: ${target}`);
  if (info.isSymbolicLink()) throw new Error(`Release path must not contain symlinks: ${target}`);
  if (info.isFile()) {
    return [{ name: normalize(relative(base, target) || basename(target)), data: await readFile(target) }];
  }
  const entries = [];
  for (const name of await readdir(target)) {
    entries.push(...await collectDirectoryEntries(join(target, name), base));
  }
  return entries;
}

function collectZipEntries(archive) {
  const names = execFileSync("unzip", ["-Z1", archive], { encoding: "utf8", maxBuffer: ZIP_MAX_BUFFER })
    .split(/\r?\n/)
    .map((name) => normalize(name.trim()))
    .filter((name) => name && !name.endsWith("/"));
  return names.map((name) => ({
    name,
    data: execFileSync("unzip", ["-p", archive, name], { maxBuffer: ZIP_MAX_BUFFER }),
  }));
}

async function collectReleaseArtifact(config) {
  const artifact = process.env.RELEASE_ARTIFACT;
  if (artifact) {
    const target = resolve(root, artifact);
    if (artifact.toLowerCase().endsWith(".zip")) return collectZipEntries(target);
    return collectDirectoryEntries(target);
  }
  const entries = [];
  for (const configuredPath of config.artifactPaths || []) {
    entries.push(...await collectDirectoryEntries(resolve(root, configuredPath)));
  }
  return entries;
}

async function checkProduction(config) {
  const url = process.env.RELEASE_URL;
  if (!url) {
    if (process.env.RELEASE_REQUIRE_PRODUCTION === "1") {
      return ["RELEASE_URL is required when RELEASE_REQUIRE_PRODUCTION=1"];
    }
    console.log("Production checks skipped (set RELEASE_URL to run them).");
    return [];
  }
  if (!url.startsWith("https://")) return ["RELEASE_URL must use HTTPS"];

  const findings = [];
  for (const path of config.production?.paths || ["/"]) {
    const response = await fetch(new URL(path, url));
    if (response.status !== 200) {
      findings.push(`${path}: production response status is ${response.status}, expected 200`);
    }
    if (path === "/") {
      const html = await response.text();
      if (!html.includes("manifest.json")) findings.push("/: production HTML is missing manifest.json");
    }
    for (const header of config.production?.requiredHeaders || []) {
      if (!response.headers.get(header)) findings.push(`${path}: production response is missing ${header}`);
    }
    for (const forbidden of config.production?.forbiddenHeaderValues || []) {
      for (const [name, value] of response.headers) {
        if (value.toLowerCase().includes(forbidden.toLowerCase())) {
          findings.push(`${path}: production header ${name} contains forbidden value ${forbidden}`);
        }
      }
    }
  }
  return findings;
}

const config = await readJson("release-gate.config.json");
const tag = process.env.RELEASE_TAG || (process.env.GITHUB_REF_TYPE === "tag" ? process.env.GITHUB_REF_NAME : "");
const metadataFindings = collectReleaseFindings({
  packageJson: await readText("package.json"),
  packageLock: await readText("package-lock.json"),
  readme: await readText("README.md"),
  changelog: await readText("CHANGELOG.md"),
  releaseNotes: await readText("RELEASE_NOTES.md"),
  tag,
});
if (tag) {
  const head = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const tagCommit = execFileSync("git", ["rev-parse", `${tag}^{commit}`], { encoding: "utf8" }).trim();
  if (head !== tagCommit) metadataFindings.push(`release tag ${tag} must point to HEAD`);
}

const sourceEntries = [];
for (const file of config.vendoredPaths || []) {
  sourceEntries.push({ name: file, data: await readFile(join(root, file)).catch(() => Buffer.alloc(0)) });
}
const artifactEntries = await collectReleaseArtifact(config);
const findings = [
  ...metadataFindings,
  ...scanReleaseEntries(artifactEntries),
  ...verifyThirdPartyNotices({
    files: sourceEntries,
    notices: await readText("THIRD_PARTY_NOTICES.md"),
    vendoredPaths: config.vendoredPaths || [],
  }),
  ...await checkProduction(config),
];

if (findings.length) {
  throw new Error(`Release checks failed:\n- ${[...new Set(findings)].join("\n- ")}`);
}

console.log(`Release checks passed (tag=${tag || "not provided"}, artifact files=${artifactEntries.length}).`);

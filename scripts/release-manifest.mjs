import { appendFile, readFile, unlink, writeFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { createReleaseManifest } from "./release-manifest-lib.mjs";

const root = process.cwd();
const eventName = process.env.GITHUB_EVENT_NAME || "";
const eventPath = process.env.GITHUB_EVENT_PATH || "";
const outputName = process.env.RELEASE_MANIFEST_OUTPUT || "release-manifest.json";

function resolveOutputPath(name) {
  if (isAbsolute(name)) throw new Error("RELEASE_MANIFEST_OUTPUT must be relative to the repository");
  const outputPath = resolve(root, name);
  const relativePath = relative(root, outputPath);
  if (!relativePath || relativePath.startsWith("..") || isAbsolute(relativePath)) {
    throw new Error("RELEASE_MANIFEST_OUTPUT must stay inside the repository");
  }
  return outputPath;
}

if (!eventName) throw new Error("GITHUB_EVENT_NAME is required");
if (!eventPath) throw new Error("GITHUB_EVENT_PATH is required");

const payload = JSON.parse(await readFile(eventPath, "utf8"));
const packageJson = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
const outputPath = resolveOutputPath(outputName);

if (process.env.GITHUB_SHA && !/^[a-f0-9]{40}$/i.test(process.env.GITHUB_SHA)) {
  throw new Error("GITHUB_SHA has an invalid format");
}

const manifest = createReleaseManifest({
  eventName,
  payload,
  repository: process.env.GITHUB_REPOSITORY,
  packageVersion: packageJson.version,
});

if (manifest.status === "skipped") {
  await unlink(outputPath).catch((error) => {
    if (error.code !== "ENOENT") throw error;
  });
  console.log(`release-manifest: skipped reason=${manifest.reason} issues=0 tasks=0`);
} else {
  await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  if (process.env.GITHUB_OUTPUT) {
    const delimiter = `RELEASE_MANIFEST_${manifest.releaseId}`;
    await appendFile(
      process.env.GITHUB_OUTPUT,
      `release_id=${manifest.releaseId}\nmanifest_json<<${delimiter}\n${JSON.stringify(manifest)}\n${delimiter}\n`,
      "utf8",
    );
  }
  console.log(`release-manifest: accepted release_id=${manifest.releaseId} commit=${manifest.commitSha}`);
}

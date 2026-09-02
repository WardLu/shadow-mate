import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, readFile, readdir, stat } from "node:fs/promises";
import { listBundledPiperRuntimePackages } from "../src/piper-resource-registry.js";

const requiredBuildFiles = [
  "dist/index.html",
  "dist/privacy.html",
  "dist/privacy-policy.css",
  "dist/manifest.json",
  "dist/sw.js",
  "dist/icons/icon-192.png",
  "dist/icons/icon-512.png",
  "dist/icons/icon-maskable.png",
];

for (const file of requiredBuildFiles) {
  await access(file).catch(() => {
    throw new Error(`Build output is missing ${file}`);
  });
}

async function fingerprint(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

for (const resourcePackage of listBundledPiperRuntimePackages()) {
  for (const file of resourcePackage.files) {
    const path = `dist${file.url}`;
    await access(path).catch(() => {
      throw new Error(`Build output is missing bundled Piper runtime ${path}`);
    });
    if ((await stat(path)).size !== file.bytes) {
      throw new Error(`Built Piper runtime ${path} byte size does not match the registry`);
    }
    if (await fingerprint(path) !== file.sha256) {
      throw new Error(`Built Piper runtime ${path} SHA-256 does not match the registry`);
    }
  }
}

const assets = await readdir("dist/assets");
const jsAssets = assets.filter((name) => name.endsWith(".js"));
const cssAssets = assets.filter((name) => name.endsWith(".css"));
if (!jsAssets.length || !cssAssets.length) {
  throw new Error("Vite build must emit bundled JavaScript and CSS assets");
}

const html = await readFile("dist/index.html", "utf8");
if (!html.includes('href="manifest.json"') || !html.includes("/assets/")) {
  throw new Error("Built HTML is missing manifest or bundled asset references");
}

const privacyHtml = await readFile("dist/privacy.html", "utf8");
if (
  !privacyHtml.includes('<meta charset="utf-8">') ||
  !privacyHtml.includes("<title>影伴隐私说明</title>") ||
  !privacyHtml.includes('<link rel="stylesheet" href="/privacy-policy.css">')
) {
  throw new Error("Built privacy HTML is missing its charset, title, or stylesheet");
}

const serviceWorker = await readFile("dist/sw.js", "utf8");
if (!serviceWorker.includes('CACHE_NAME = "shadow-mate-app-v4"')) {
  throw new Error("Built service worker must use shadow-mate-app-v4");
}
if (!serviceWorker.includes("keys.filter((key) => isAppShellCacheName(key) && key !== CACHE_NAME).map((key) => caches.delete(key))")) {
  throw new Error("Built service worker must delete only stale app-shell caches");
}
if (/caches\.keys\(\)\s*\.then\(\(keys\)\s*=>\s*Promise\.all\(keys\.map\(.*caches\.delete/s.test(serviceWorker)) {
  throw new Error("Built service worker must not unconditionally delete every cache");
}
if (!serviceWorker.includes("/^shadow-mate-app-v\\d+$/.test(name) || /^shadow-mate-v\\d+$/.test(name)")) {
  throw new Error("Built service worker cache deletion must exclude shadow-mate-piper-* caches");
}

for (const asset of jsAssets) {
  const source = await readFile(`dist/assets/${asset}`, "utf8");
  if (/https:\/\/esm\.sh/i.test(source)) {
    throw new Error(`Built JavaScript still depends on a runtime CDN: ${asset}`);
  }
}

console.log("Build artifact checks passed.");

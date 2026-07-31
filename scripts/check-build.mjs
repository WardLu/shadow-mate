import { access, readFile, readdir } from "node:fs/promises";

const requiredBuildFiles = [
  "dist/index.html",
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

for (const asset of jsAssets) {
  const source = await readFile(`dist/assets/${asset}`, "utf8");
  if (/https:\/\/esm\.sh/i.test(source)) {
    throw new Error(`Built JavaScript still depends on a runtime CDN: ${asset}`);
  }
}

console.log("Build artifact checks passed.");

import { readFile } from "node:fs/promises";

const requiredFiles = [
  "index.html",
  "public/manifest.json",
  "public/sw.js",
  "public/config.js",
  "src/cloud.js",
];

for (const file of requiredFiles) {
  try {
    await readFile(file);
  } catch (error) {
    throw new Error(`Missing required artifact: ${file}`);
  }
}

const manifest = JSON.parse(await readFile("public/manifest.json", "utf8"));
if (!manifest.icons?.some((icon) => icon.sizes === "192x192")) {
  throw new Error("PWA manifest is missing a 192x192 icon");
}
if (!manifest.icons?.some((icon) => icon.sizes === "512x512")) {
  throw new Error("PWA manifest is missing a 512x512 icon");
}

const html = await readFile("index.html", "utf8");
for (const marker of ["id=\"accountButton\"", "id=\"cloudDialog\"", "src=\"/src/cloud.js\""]) {
  if (!html.includes(marker)) throw new Error(`index.html is missing ${marker}`);
}

console.log("Static checks passed.");

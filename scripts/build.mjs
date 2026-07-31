import { cp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(".");
const output = resolve("dist");

if (output === root || !output.endsWith("dist")) {
  throw new Error(`Refusing to replace unsafe output path: ${output}`);
}

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp("index.html", "dist/index.html");
await cp("src", "dist/src", { recursive: true });
await cp("public", "dist", { recursive: true });

console.log("Static build created in dist/.");

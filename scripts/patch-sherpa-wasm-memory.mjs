import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const SOURCE_SHA256 = "9554feafc2bf4452c3e1f5d5d4b29b690e6e7db1eb3835478a793e864111f640";
const OUTPUT_SHA256 = "ff161b9927ca92164930fe564476ee32edaf8ec460b94df2353af7333754119e";

function encodeUnsignedLeb128(value) {
  const bytes = [];
  let remaining = value;
  do {
    let byte = remaining & 0x7f;
    remaining = Math.floor(remaining / 128);
    if (remaining) byte |= 0x80;
    bytes.push(byte);
  } while (remaining);
  return bytes;
}

function indexOfAll(bytes, pattern) {
  const matches = [];
  for (let index = 0; index <= bytes.length - pattern.length; index += 1) {
    if (pattern.every((byte, offset) => bytes[index + offset] === byte)) matches.push(index);
  }
  return matches;
}

export function patchWasmInitialMemory(source, {
  fromPages = 8192,
  toPages = 4096,
  maximumPages = 32768,
} = {}) {
  const input = source instanceof Uint8Array ? source : new Uint8Array(source);
  const from = Uint8Array.from([3, ...encodeUnsignedLeb128(fromPages), ...encodeUnsignedLeb128(maximumPages)]);
  const to = Uint8Array.from([3, ...encodeUnsignedLeb128(toPages), ...encodeUnsignedLeb128(maximumPages)]);
  if (from.length !== to.length) throw new Error("WASM memory patch must preserve the binary length");
  const matches = indexOfAll(input, from);
  if (matches.length !== 1) throw new Error(`Expected the WASM shared-memory declaration exactly once; found ${matches.length}`);
  const output = new Uint8Array(input);
  output.set(to, matches[0]);
  return output;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function main([sourcePath, outputPath]) {
  if (!sourcePath || !outputPath) throw new Error("Usage: node scripts/patch-sherpa-wasm-memory.mjs <official.wasm> <mobile.wasm>");
  const source = new Uint8Array(await readFile(sourcePath));
  const sourceHash = sha256(source);
  if (sourceHash !== SOURCE_SHA256) throw new Error(`Official WASM SHA-256 mismatch: ${sourceHash}`);
  const output = patchWasmInitialMemory(source);
  const outputHash = sha256(output);
  if (outputHash !== OUTPUT_SHA256) throw new Error(`Patched WASM SHA-256 mismatch: ${outputHash}`);
  await writeFile(outputPath, output);
  console.log(JSON.stringify({ source: sourceHash, output: outputHash, bytes: output.byteLength }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

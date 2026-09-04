import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { createPiperResourceSha256 } from "../src/piper-resource-hash.js";

function hash(bytes) {
  return createPiperResourceSha256().update(bytes).digestHex();
}

const execFileAsync = promisify(execFile);

export async function verifyTencentTtsEntry(entry, { fetchImpl = fetch, origin = "https://preview-sm.shadow.wang", timeoutMs = 20000, decodeAudio = async () => {} } = {}) {
  if (!entry?.url?.startsWith("https://voice.shadow.wang/tts/tencent/v1/")) throw new Error("invalid-audio-url");
  const startedAt = Date.now();
  const response = await fetchImpl(entry.url, { headers: { Origin: origin }, signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`cdn-http:${response.status}`);
  if (response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "audio/mpeg") throw new Error("cdn-invalid-media");
  const corsOrigin = response.headers.get("access-control-allow-origin");
  if (!["*", origin].includes(corsOrigin)) throw new Error("cdn-invalid-cors-origin");
  if (!/\bGET\b/i.test(response.headers.get("access-control-allow-methods") || "") || !/\bHEAD\b/i.test(response.headers.get("access-control-allow-methods") || "")) throw new Error("cdn-invalid-cors-methods");
  if (!/\bContent-Length\b/i.test(response.headers.get("access-control-expose-headers") || "")) throw new Error("cdn-invalid-cors-expose");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength !== entry.bytes || Number(response.headers.get("content-length")) !== entry.bytes) throw new Error("cdn-invalid-length");
  if (hash(bytes) !== entry.audioSha256) throw new Error("cdn-invalid-hash");
  const isMp3 = bytes.length >= 3 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33
    || bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;
  if (!isMp3) throw new Error("cdn-invalid-mp3");
  await decodeAudio(bytes, entry);
  return { contentId: entry.contentId, bytes: bytes.byteLength, latencyMs: Date.now() - startedAt };
}

async function mapLimit(values, limit, operation) {
  const results = new Array(values.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, async () => {
    while (next < values.length) {
      const index = next++;
      results[index] = await operation(values[index]);
    }
  }));
  return results;
}

async function main() {
  const args = process.argv.slice(2);
  let manifestPath = resolve("public/tts/tencent-v1-manifest.json");
  let origin = "https://preview-sm.shadow.wang";
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--manifest" && args[index + 1]) manifestPath = resolve(args[++index]);
    else if (args[index] === "--origin" && args[index + 1]) origin = args[++index];
    else throw new Error(`unknown-argument:${args[index]}`);
  }
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const decodeDir = await mkdtemp(join(tmpdir(), "shadow-mate-tts-decode-"));
  try {
    const decodeAudio = async (bytes, entry) => {
      const path = join(decodeDir, `${entry.audioSha256}.mp3`);
      await writeFile(path, bytes);
      const { stdout } = await execFileAsync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", path], { timeout: 20000 });
      if (!(Number.parseFloat(stdout) > 0)) throw new Error(`cdn-audio-decode-failed:${entry.contentId}`);
    };
    const results = await mapLimit(manifest.entries || [], 4, (entry) => verifyTencentTtsEntry(entry, { origin, decodeAudio }));
    console.log(JSON.stringify({ verified: results.length, bytes: results.reduce((sum, item) => sum + item.bytes, 0) }));
  } finally {
    await rm(decodeDir, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(error?.message || "tencent-tts-smoke-failed"); process.exitCode = 1; });
}

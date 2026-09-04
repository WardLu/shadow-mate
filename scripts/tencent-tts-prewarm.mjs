import { randomUUID } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import COS from "cos-nodejs-sdk-v5";
import tencentcloud from "tencentcloud-sdk-nodejs-tts";
import hanziWritingV2Pilot from "../src/content/hanzi-writing/v2-pilot-1.json" with { type: "json" };
import { createPiperResourceSha256 } from "../src/piper-resource-hash.js";
import {
  buildTencentSpeechCatalog,
  TENCENT_TTS_CDN_ORIGIN,
  validateTencentTtsManifest,
} from "../src/tencent-tts-catalog.js";

const DEFAULT_BUCKET = "shadow-mate-voice-1307628881";
const DEFAULT_REGION = "ap-guangzhou";

function sha256Hex(bytes) {
  return createPiperResourceSha256().update(bytes).digestHex();
}

function assertMp3(bytes) {
  const id3 = bytes.length >= 3 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33;
  const frame = bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;
  if (!id3 && !frame) throw new Error("invalid-mp3-audio");
}

function validateReadback(result) {
  const bytes = result?.bytes instanceof Uint8Array ? result.bytes : new Uint8Array(result?.bytes || []);
  if (!bytes.byteLength || result.contentType?.split(";", 1)[0]?.trim().toLowerCase() !== "audio/mpeg") throw new Error("cdn-invalid-media");
  if (Number(result.contentLength) !== bytes.byteLength) throw new Error("cdn-invalid-length");
  const allowedOrigin = ["*", "https://preview-sm.shadow.wang", "https://sm.shadow.wang"].includes(result.corsOrigin);
  if (!allowedOrigin || !/\bGET\b/i.test(result.corsMethods || "") || !/\bHEAD\b/i.test(result.corsMethods || "") || !/\bContent-Length\b/i.test(result.corsExposeHeaders || "")) {
    throw new Error("cdn-invalid-cors");
  }
  assertMp3(bytes);
  return bytes;
}

function publicEntry(record, bytes) {
  return {
    contentId: record.contentId,
    textSha256: record.textSha256,
    provider: record.provider,
    synthesisVersion: record.synthesisVersion,
    locale: record.locale,
    voiceId: record.voiceId,
    speed: record.speed,
    codec: record.codec,
    sampleRate: record.sampleRate,
    url: `${TENCENT_TTS_CDN_ORIGIN}/${record.objectKey}`,
    bytes: bytes.byteLength,
    audioSha256: sha256Hex(bytes),
  };
}

export async function prewarmTencentTts({ catalog, ttsClient, cosClient, cdnClient, manifestPath, dryRun = false, outputDir } = {}) {
  if (!Array.isArray(catalog) || !catalog.length) throw new Error("empty-tts-catalog");
  if (dryRun) return { reused: 0, generated: 0, missing: catalog.length, entries: [] };
  const entries = [];
  let reused = 0;
  let generated = 0;
  for (const record of catalog) {
    const exists = await cosClient.exists(record.objectKey);
    if (!exists) {
      let synthesized;
      try {
        synthesized = await ttsClient.synthesize(record);
      } catch (error) {
        const category = error?.name === "AbortError" || error?.name === "TimeoutError" || /timeout/i.test(error?.code || "")
          ? "provider-timeout"
          : "provider-synthesis-failed";
        throw new Error(`${category}:${record.contentId}`);
      }
      const bytes = new Uint8Array(synthesized);
      assertMp3(bytes);
      await cosClient.put(record.objectKey, bytes, {
        ContentType: "audio/mpeg",
        CacheControl: "public, max-age=31536000, immutable",
        "x-cos-meta-provider": "tencent",
        "x-cos-meta-synthesis-version": "v1",
        "x-cos-meta-voice-id": record.voiceId,
      });
      generated += 1;
    } else {
      reused += 1;
    }
    const bytes = validateReadback(await cdnClient.read(record));
    if (outputDir) {
      await mkdir(outputDir, { recursive: true });
      await writeFile(resolve(outputDir, `${record.contentId.replace(/:/g, "-")}.mp3`), bytes);
    }
    entries.push(publicEntry(record, bytes));
  }
  entries.sort((left, right) => left.contentId.localeCompare(right.contentId));
  const manifest = { entries };
  validateTencentTtsManifest(manifest, catalog);
  await mkdir(dirname(manifestPath), { recursive: true });
  const temporaryPath = `${manifestPath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  await rename(temporaryPath, manifestPath);
  return { reused, generated, missing: 0, entries };
}

function requiredEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`missing-environment:${name}`);
  return value;
}

function createReleaseClients() {
  const secretId = requiredEnvironment("TENCENTCLOUD_SECRET_ID");
  const secretKey = requiredEnvironment("TENCENTCLOUD_SECRET_KEY");
  const token = process.env.TENCENTCLOUD_TOKEN?.trim() || undefined;
  const region = process.env.TENCENT_TTS_REGION || DEFAULT_REGION;
  const bucket = process.env.TENCENT_COS_BUCKET || DEFAULT_BUCKET;
  const TtsClient = tencentcloud.tts.v20190823.Client;
  const client = new TtsClient({ credential: { secretId, secretKey, token }, region, profile: { httpProfile: { reqTimeout: 20 } } });
  const cos = new COS({ SecretId: secretId, SecretKey: secretKey, SecurityToken: token, Timeout: 20000 });
  const cosCall = (method, params) => new Promise((resolvePromise, reject) => cos[method](params, (error, data) => error ? reject(error) : resolvePromise(data)));
  return {
    ttsClient: {
      async synthesize(record) {
        const response = await client.TextToVoice({
          Text: record.text,
          SessionId: randomUUID(),
          Volume: 0,
          Speed: record.speed,
          VoiceType: Number(record.voiceId),
          PrimaryLanguage: record.locale === "zh-CN" ? 1 : 2,
          SampleRate: record.sampleRate,
          Codec: record.codec,
        });
        if (!response?.Audio) throw new Error(`provider-empty-audio:${record.contentId}`);
        return Uint8Array.from(Buffer.from(response.Audio, "base64"));
      },
    },
    cosClient: {
      async exists(key) {
        try { await cosCall("headObject", { Bucket: bucket, Region: region, Key: key }); return true; }
        catch (error) { if (error?.statusCode === 404 || error?.code === "NoSuchKey") return false; throw new Error("cos-head-failed", { cause: error }); }
      },
      async put(key, bytes, metadata) {
        await cosCall("putObject", { Bucket: bucket, Region: region, Key: key, Body: Buffer.from(bytes), ...metadata });
      },
    },
    cdnClient: {
      async read(record) {
        const response = await fetch(`${TENCENT_TTS_CDN_ORIGIN}/${record.objectKey}`, {
          headers: { Origin: "https://preview-sm.shadow.wang" },
          signal: AbortSignal.timeout(20000),
        });
        if (!response.ok) throw new Error(`cdn-readback-http:${response.status}`);
        return {
          bytes: new Uint8Array(await response.arrayBuffer()),
          contentType: response.headers.get("content-type"),
          contentLength: response.headers.get("content-length"),
          corsOrigin: response.headers.get("access-control-allow-origin"),
          corsMethods: response.headers.get("access-control-allow-methods"),
          corsExposeHeaders: response.headers.get("access-control-expose-headers"),
        };
      },
    },
  };
}

function parseArguments(argv) {
  const options = { dryRun: false, manifestPath: resolve("public/tts/tencent-v1-manifest.json") };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--dry-run") options.dryRun = true;
    else if (argument === "--manifest" && argv[index + 1]) options.manifestPath = resolve(argv[++index]);
    else if (argument === "--output-dir" && argv[index + 1]) options.outputDir = resolve(argv[++index]);
    else throw new Error(`unknown-argument:${argument}`);
  }
  return options;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const catalog = await buildTencentSpeechCatalog(hanziWritingV2Pilot.items);
  if (options.dryRun) {
    console.log(JSON.stringify({ catalogEntries: catalog.length, locales: { "zh-CN": 64, "en-US": 32 }, networkWrites: 0 }));
    return;
  }
  const result = await prewarmTencentTts({ catalog, ...createReleaseClients(), ...options });
  console.log(JSON.stringify({ reused: result.reused, generated: result.generated, entries: result.entries.length }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error?.message || "tencent-tts-prewarm-failed");
    process.exitCode = 1;
  });
}

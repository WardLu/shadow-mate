import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToLowercaseHex } from "./piper-resource-hash.js";

export const TENCENT_TTS_MANIFEST_URL = "/tts/tencent-v1-manifest.json";
export const TENCENT_TTS_CDN_ORIGIN = "https://voice.shadow.wang";
export const TENCENT_TTS_POLICY = Object.freeze({
  "zh-CN": Object.freeze({ voiceId: "101030", speed: 0, codec: "mp3", sampleRate: 16000 }),
  "en-US": Object.freeze({ voiceId: "101050", speed: 0, codec: "mp3", sampleRate: 16000 }),
});

const MANIFEST_FIELDS = Object.freeze([
  "contentId", "textSha256", "provider", "synthesisVersion", "locale", "voiceId",
  "speed", "codec", "sampleRate", "url", "bytes", "audioSha256",
]);
const SHA256_RE = /^[a-f0-9]{64}$/;

function hashText(value) {
  return bytesToLowercaseHex(sha256(new TextEncoder().encode(value)));
}

export function normalizeSpeechText(value) {
  const text = String(value ?? "").normalize("NFC").trim().replace(/\s+/gu, " ");
  if (!text || /[\u0000-\u001f\u007f]/u.test(text) || /https?:\/\//iu.test(text) || /[<>]/u.test(text)) {
    throw new Error("invalid-speech-text");
  }
  return text;
}

export async function createTencentSpeechHash(input) {
  const text = normalizeSpeechText(input?.text);
  const payload = [
    "tencent",
    "v1",
    input?.locale,
    String(input?.voiceId ?? ""),
    String(input?.speed ?? ""),
    input?.codec,
    String(input?.sampleRate ?? ""),
    text,
  ].join("\n");
  return hashText(payload);
}

function speechValues(item) {
  return [
    ["glyph", "zh-CN", item?.glyph],
    ["english", "en-US", item?.concept?.characterEnglishLabel || item?.concept?.englishLabel],
    ["meaning", "zh-CN", item?.concept?.characterMeaning || item?.concept?.visual?.alt || item?.concept?.label],
  ];
}

export async function buildTencentSpeechCatalog(items) {
  if (!Array.isArray(items)) throw new Error("invalid-curriculum-items");
  const contentIds = new Set();
  const catalog = [];
  for (const item of items) {
    if (!item?.id || contentIds.has(`${item.id}:glyph`)) throw new Error("invalid-or-duplicate-curriculum-id");
    for (const [kind, locale, rawText] of speechValues(item)) {
      const contentId = `${item.id}:${kind}`;
      if (contentIds.has(contentId)) throw new Error("duplicate-speech-content-id");
      contentIds.add(contentId);
      const text = normalizeSpeechText(rawText);
      const maximumLength = locale === "zh-CN" ? 150 : 500;
      if (Array.from(text).length > maximumLength) throw new Error(`speech-text-too-long:${contentId}`);
      const policy = TENCENT_TTS_POLICY[locale];
      const objectHash = await createTencentSpeechHash({ ...policy, locale, text });
      catalog.push(Object.freeze({
        contentId,
        text,
        textSha256: hashText(text),
        provider: "tencent",
        synthesisVersion: "v1",
        locale,
        ...policy,
        objectHash,
        objectKey: `tts/tencent/v1/${locale}/${policy.voiceId}/${objectHash}.mp3`,
      }));
    }
  }
  return catalog.sort((left, right) => left.contentId.localeCompare(right.contentId));
}

export function validateTencentTtsManifest(manifest, expectedCatalog) {
  if (!manifest || !Array.isArray(manifest.entries) || !Array.isArray(expectedCatalog)) {
    throw new Error("invalid-manifest-shape");
  }
  if (manifest.entries.length !== expectedCatalog.length) throw new Error("manifest-parity-count");
  const expectedById = new Map(expectedCatalog.map((entry) => [entry.contentId, entry]));
  let priorId = "";
  for (const entry of manifest.entries) {
    const keys = Object.keys(entry).sort();
    if (JSON.stringify(keys) !== JSON.stringify([...MANIFEST_FIELDS].sort())) throw new Error("manifest-fields");
    if (entry.contentId <= priorId) throw new Error("manifest-order");
    priorId = entry.contentId;
    const expected = expectedById.get(entry.contentId);
    if (!expected) throw new Error("manifest-parity-id");
    for (const key of ["contentId", "textSha256", "provider", "synthesisVersion", "locale", "voiceId", "speed", "codec", "sampleRate"]) {
      if (entry[key] !== expected[key]) throw new Error(`manifest-parity-${key}`);
    }
    if (entry.url !== `${TENCENT_TTS_CDN_ORIGIN}/${expected.objectKey}`) throw new Error("manifest-url");
    if (!Number.isSafeInteger(entry.bytes) || entry.bytes <= 0) throw new Error("manifest-bytes");
    if (!SHA256_RE.test(entry.textSha256) || !SHA256_RE.test(entry.audioSha256)) throw new Error("manifest-sha256");
  }
  return true;
}

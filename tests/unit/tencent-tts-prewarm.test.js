import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { prewarmTencentTts } from "../../scripts/tencent-tts-prewarm.mjs";

const catalog = [{
  contentId: "hz-001:glyph", text: "一", textSha256: "1".repeat(64), provider: "tencent",
  synthesisVersion: "v1", locale: "zh-CN", voiceId: "101030", speed: 0, codec: "mp3",
  sampleRate: 16000, objectKey: `tts/tencent/v1/zh-CN/101030/${"2".repeat(64)}.mp3`,
}];
const audio = Uint8Array.from([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 1]);

describe("Tencent TTS prewarm", () => {
  it("reuses verified objects without synthesis and writes a public-only manifest", async () => {
    const root = await mkdtemp(join(tmpdir(), "shadow-mate-tts-"));
    const manifestPath = join(root, "manifest.json");
    const ttsClient = { synthesize: vi.fn() };
    const cosClient = { exists: vi.fn(async () => true), put: vi.fn() };
    const cdnClient = { read: vi.fn(async () => ({ bytes: audio, contentType: "audio/mpeg", corsOrigin: "*", corsMethods: "GET, HEAD, OPTIONS", corsExposeHeaders: "Content-Length", contentLength: audio.byteLength })) };

    const result = await prewarmTencentTts({ catalog, ttsClient, cosClient, cdnClient, manifestPath });

    expect(result).toMatchObject({ reused: 1, generated: 0 });
    expect(ttsClient.synthesize).not.toHaveBeenCalled();
    expect(cosClient.put).not.toHaveBeenCalled();
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    expect(Object.keys(manifest.entries[0]).sort()).toEqual([
      "audioSha256", "bytes", "codec", "contentId", "locale", "provider", "sampleRate",
      "speed", "synthesisVersion", "textSha256", "url", "voiceId",
    ]);
    expect(JSON.stringify(manifest)).not.toContain("一");
  });

  it("synthesizes and uploads only a missing object", async () => {
    const root = await mkdtemp(join(tmpdir(), "shadow-mate-tts-"));
    const ttsClient = { synthesize: vi.fn(async () => audio) };
    const cosClient = { exists: vi.fn(async () => false), put: vi.fn(async () => {}) };
    const cdnClient = { read: vi.fn(async () => ({ bytes: audio, contentType: "audio/mpeg", corsOrigin: "https://preview-sm.shadow.wang", corsMethods: "GET, HEAD", corsExposeHeaders: "Content-Length", contentLength: audio.byteLength })) };

    const result = await prewarmTencentTts({ catalog, ttsClient, cosClient, cdnClient, manifestPath: join(root, "manifest.json") });

    expect(result).toMatchObject({ reused: 0, generated: 1 });
    expect(ttsClient.synthesize).toHaveBeenCalledOnce();
    expect(cosClient.put).toHaveBeenCalledWith(catalog[0].objectKey, audio, expect.objectContaining({ ContentType: "audio/mpeg" }));
  });

  it("does not replace the previous manifest when CDN readback fails", async () => {
    const root = await mkdtemp(join(tmpdir(), "shadow-mate-tts-"));
    const manifestPath = join(root, "manifest.json");
    await import("node:fs/promises").then(({ writeFile }) => writeFile(manifestPath, "previous\n"));
    await expect(prewarmTencentTts({
      catalog,
      ttsClient: { synthesize: async () => audio },
      cosClient: { exists: async () => false, put: async () => {} },
      cdnClient: { read: async () => { throw new Error("cdn-readback-failed"); } },
      manifestPath,
    })).rejects.toThrow("cdn-readback-failed");
    expect(await readFile(manifestPath, "utf8")).toBe("previous\n");
  });

  it("redacts provider failures and preserves only the stable content id", async () => {
    const root = await mkdtemp(join(tmpdir(), "shadow-mate-tts-"));
    const secretProviderMessage = "secret request payload 一";
    let failure;
    try {
      await prewarmTencentTts({
        catalog,
        ttsClient: { synthesize: async () => { throw new Error(secretProviderMessage); } },
        cosClient: { exists: async () => false, put: async () => {} },
        cdnClient: { read: async () => { throw new Error("must-not-read"); } },
        manifestPath: join(root, "manifest.json"),
      });
    } catch (error) {
      failure = error;
    }
    expect(failure?.message).toBe("provider-synthesis-failed:hz-001:glyph");
    expect(failure?.message).not.toContain(secretProviderMessage);
  });
});

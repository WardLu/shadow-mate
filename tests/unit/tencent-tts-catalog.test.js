import { describe, expect, it } from "vitest";
import hanziWritingV2Pilot from "../../src/content/hanzi-writing/v2-pilot-1.json" with { type: "json" };
import {
  buildTencentSpeechCatalog,
  createTencentSpeechHash,
  normalizeSpeechText,
  validateTencentTtsManifest,
} from "../../src/tencent-tts-catalog.js";

describe("Tencent TTS catalog", () => {
  it("maps every active curriculum item to fixed Chinese and English voices", async () => {
    const catalog = await buildTencentSpeechCatalog(hanziWritingV2Pilot.items);

    expect(catalog).toHaveLength(96);
    expect(catalog.map(({ contentId }) => contentId)).toEqual([...catalog.map(({ contentId }) => contentId)].sort());
    expect(catalog.find(({ contentId }) => contentId === "hz-001:glyph")).toMatchObject({
      locale: "zh-CN", voiceId: "101030", text: "一", codec: "mp3", sampleRate: 16000,
    });
    expect(catalog.find(({ contentId }) => contentId === "hz-001:english")).toMatchObject({
      locale: "en-US", voiceId: "101050", text: "one",
    });
    expect(catalog.find(({ contentId }) => contentId === "hz-001:meaning")).toMatchObject({
      locale: "zh-CN", voiceId: "101030", text: "表示数量一",
    });
  });

  it("normalizes safe whitespace and rejects unsafe release input", () => {
    expect(normalizeSpeechText("  花\n朵  ")).toBe("花 朵");
    expect(() => normalizeSpeechText("https://example.test/audio")).toThrow("invalid-speech-text");
    expect(() => normalizeSpeechText("<speak>花</speak>")).toThrow("invalid-speech-text");
    expect(() => normalizeSpeechText("\u0000花")).toThrow("invalid-speech-text");
  });

  it("invalidates the object hash when a synthesis input changes", async () => {
    const input = { locale: "zh-CN", voiceId: "101030", speed: 0, codec: "mp3", sampleRate: 16000, text: "花" };
    expect(await createTencentSpeechHash(input)).toBe("5579fff459ab1a0fe8f9ea4248259f1dd5c52e026e47bfbb8f2f1318e2497a05");
    await expect(createTencentSpeechHash({ ...input, voiceId: "101050" })).resolves.not.toBe("5579fff459ab1a0fe8f9ea4248259f1dd5c52e026e47bfbb8f2f1318e2497a05");
  });

  it("accepts only an exact sorted immutable manifest", async () => {
    const expected = (await buildTencentSpeechCatalog([hanziWritingV2Pilot.items[0]]))
      .find(({ contentId }) => contentId === "hz-001:glyph");
    const entry = {
      contentId: expected.contentId,
      textSha256: expected.textSha256,
      provider: expected.provider,
      synthesisVersion: expected.synthesisVersion,
      locale: expected.locale,
      voiceId: expected.voiceId,
      speed: expected.speed,
      codec: expected.codec,
      sampleRate: expected.sampleRate,
      url: `https://voice.shadow.wang/${expected.objectKey}`,
      bytes: 1234,
      audioSha256: "a".repeat(64),
    };

    expect(validateTencentTtsManifest({ entries: [entry] }, [expected])).toBe(true);
    expect(() => validateTencentTtsManifest({ entries: [{ ...entry, voiceId: "101050" }] }, [expected])).toThrow(/parity/);
    expect(() => validateTencentTtsManifest({ entries: [{ ...entry, extra: true }] }, [expected])).toThrow(/fields/);
    expect(() => validateTencentTtsManifest({ entries: [{ ...entry, url: "https://example.test/a.mp3" }] }, [expected])).toThrow(/url/);
  });
});

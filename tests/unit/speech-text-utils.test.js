import { describe, it, expect } from "vitest";
import { cleanSpeechText } from "../../src/speech-text-utils.js";

describe("cleanSpeechText", () => {
  it("strips emojis and special symbols", () => {
    const raw = "🔟 数字十 ten 十个小手指 🎉";
    const cleaned = cleanSpeechText(raw);
    expect(cleaned).not.toContain("🔟");
    expect(cleaned).not.toContain("🎉");
    expect(cleaned).toContain("数字十 ten 十个小手指");
  });

  it("converts range like 1-4 to 一到四 for smooth TTS", () => {
    const raw = "把 1-4 填入每行每列（4×4 入门版，含比较/分类/形状思维）。";
    const cleaned = cleanSpeechText(raw);
    expect(cleaned).toContain("一到四");
    expect(cleaned).toContain("四乘四");
    expect(cleaned).not.toContain("（");
    expect(cleaned).not.toContain("）");
  });

  it("converts '按 1 递增' to '按一递增'", () => {
    const raw = "点击问号格，选出它应该是哪个数字（按 1 递增顺序）。";
    const cleaned = cleanSpeechText(raw);
    expect(cleaned).toContain("按一递增顺序");
  });

  it("handles null or undefined gracefully", () => {
    expect(cleanSpeechText(null)).toBe("");
    expect(cleanSpeechText(undefined)).toBe("");
    expect(cleanSpeechText("")).toBe("");
  });
});

describe("isMandarinChineseVoiceLocale", () => {
  it("recognizes standard Mandarin locales and subtags", async () => {
    const { isMandarinChineseVoiceLocale } = await import("../../src/speech-text-utils.js");
    expect(isMandarinChineseVoiceLocale("zh-CN")).toBe(true);
    expect(isMandarinChineseVoiceLocale("zh_CN")).toBe(true);
    expect(isMandarinChineseVoiceLocale("zh-Hans")).toBe(true);
    expect(isMandarinChineseVoiceLocale("zh-Hans-CN")).toBe(true);
    expect(isMandarinChineseVoiceLocale("zh-SG")).toBe(true);
    expect(isMandarinChineseVoiceLocale("zh")).toBe(true);
    expect(isMandarinChineseVoiceLocale("cmn")).toBe(true);
    expect(isMandarinChineseVoiceLocale("cmn-Hans-CN")).toBe(true);
    expect(isMandarinChineseVoiceLocale("zho-CHN")).toBe(true);
  });

  it("rejects Cantonese and non-Mandarin languages", async () => {
    const { isMandarinChineseVoiceLocale } = await import("../../src/speech-text-utils.js");
    expect(isMandarinChineseVoiceLocale("yue")).toBe(false);
    expect(isMandarinChineseVoiceLocale("yue-HK")).toBe(false);
    expect(isMandarinChineseVoiceLocale("zh-HK")).toBe(false);
    expect(isMandarinChineseVoiceLocale("zh-TW")).toBe(false);
    expect(isMandarinChineseVoiceLocale("en-US")).toBe(false);
    expect(isMandarinChineseVoiceLocale("ja-JP")).toBe(false);
    expect(isMandarinChineseVoiceLocale("")).toBe(false);
    expect(isMandarinChineseVoiceLocale(null)).toBe(false);
  });
});

describe("findMatchingVoice", () => {
  it("finds exact locale match first", async () => {
    const { findMatchingVoice } = await import("../../src/speech-text-utils.js");
    const voices = [
      { lang: "en-GB", name: "British" },
      { lang: "en-US", name: "American" },
    ];
    expect(findMatchingVoice(voices, "en-US")).toEqual({ lang: "en-US", name: "American" });
  });

  it("falls back to language prefix match for English (e.g. en-GB when en-US requested)", async () => {
    const { findMatchingVoice } = await import("../../src/speech-text-utils.js");
    const voices = [
      { lang: "en-GB", name: "British" },
      { lang: "fr-FR", name: "French" },
    ];
    expect(findMatchingVoice(voices, "en-US")).toEqual({ lang: "en-GB", name: "British" });
  });

  it("matches Mandarin Chinese voices accurately", async () => {
    const { findMatchingVoice } = await import("../../src/speech-text-utils.js");
    const voices = [
      { lang: "en-US", name: "English" },
      { lang: "zh-Hans-CN", name: "Ting-Ting" },
    ];
    expect(findMatchingVoice(voices, "zh-CN")).toEqual({ lang: "zh-Hans-CN", name: "Ting-Ting" });
  });

  it("never matches Cantonese or English voice when Chinese is requested", async () => {
    const { findMatchingVoice } = await import("../../src/speech-text-utils.js");
    const voices = [
      { lang: "en-US", name: "English" },
      { lang: "zh-HK", name: "Cantonese" },
    ];
    expect(findMatchingVoice(voices, "zh-CN")).toBeNull();
  });

  it("returns null for empty voices or non-array", async () => {
    const { findMatchingVoice } = await import("../../src/speech-text-utils.js");
    expect(findMatchingVoice([], "zh-CN")).toBeNull();
    expect(findMatchingVoice(null, "zh-CN")).toBeNull();
    expect(findMatchingVoice(undefined, "en-US")).toBeNull();
  });
});


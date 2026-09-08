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

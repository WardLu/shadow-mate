import { describe, expect, it } from "vitest";
import { getEnglishVisualSvg, renderEnglishVisual } from "../../src/content/english-visuals.js";
import { getLearningCatalog } from "../../src/content/learning-catalog.js";

describe("english-visuals", () => {
  it("generates color swatches for color words", () => {
    const redSvg = getEnglishVisualSvg("red", "颜色", "红色");
    expect(redSvg).toContain('fill="#EF4444"');

    const blueSvg = getEnglishVisualSvg("blue", "颜色", "蓝色");
    expect(blueSvg).toContain('fill="#3B82F6"');
  });

  it("generates dot arrays for number words", () => {
    const threeSvg = getEnglishVisualSvg("three", "数字", "三");
    expect(threeSvg).toContain(">3<");
    expect(threeSvg.match(/<circle/g)).toHaveLength(3);

    const fiveSvg = getEnglishVisualSvg("five", "数字", "五");
    expect(fiveSvg).toContain(">5<");
    expect(fiveSvg.match(/<circle/g)).toHaveLength(5);
  });

  it("generates specific object SVGs for fruits and animals", () => {
    const appleSvg = getEnglishVisualSvg("apple", "水果", "苹果");
    expect(appleSvg).toContain('circle cx="32" cy="36"');

    const catSvg = getEnglishVisualSvg("cat", "动物", "猫");
    expect(catSvg).toContain("polygon");
  });

  it("renders accessible visual container", () => {
    const html = renderEnglishVisual("apple", "水果", "苹果");
    expect(html).toContain('class="english-visual"');
    expect(html).toContain('data-english-visual="apple"');
    expect(html).toContain('aria-label="apple（苹果）"');
    expect(html).toContain('role="img"');
    expect(html).toContain("<svg");
  });

  it("covers all words in the learning catalog without crashing", () => {
    const catalog = getLearningCatalog(["foundation-v2", "bridging-v1"]);
    expect(catalog.english.length).toBeGreaterThan(100);

    for (const item of catalog.english) {
      const html = renderEnglishVisual(item.word, item.theme, item.meaning);
      expect(html).toContain("<svg");
      expect(html).toContain(`data-english-visual="${item.word}"`);
    }
  });
});

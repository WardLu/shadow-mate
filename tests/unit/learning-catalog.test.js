import { describe, expect, it } from "vitest";
import { getLearningCatalog, getLearningItem } from "../../src/content/learning-catalog.js";
import { CORE_LEARNING_SPEECH_ENTRIES } from "../../src/content/core-learning-speech.js";
import { LEGACY_BOOK_IDS, LEGACY_READING_LIST_IDS, BOOKS, READING_LISTS } from "../../src/content/books.js";

const foundation = getLearningCatalog("foundation-v2");
const bridging = getLearningCatalog("bridging-v1");

describe("learning catalog identity and age recommendations", () => {
  it("shares each foundation identity with bridging and global lookup", () => {
    const activities = { literacy: "recognition", poems: "poem", english: "english", books: "book", writing: "writing" };
    for (const [kind, activity] of Object.entries(activities)) {
      const byId = new Map(bridging[kind].map((item) => [item.id, item]));
      expect(byId.size).toBe(bridging[kind].length);
      for (const item of foundation[kind]) {
        expect(byId.get(item.id)).toBe(item);
        expect(getLearningItem(activity, item.id)).toBe(item);
      }
    }
    const advanced = bridging.literacy.find((item) => !item.agePackages.includes("foundation-v2"));
    expect(getLearningItem("literacy", advanced.id)).toBe(advanced);
  });

  it("retains legacy identities and legacy ordering", () => {
    expect(foundation.literacy[0]).toMatchObject({ id: "literacy-001", glyph: "一", pinyin: "yī", word: "一个", speechId: "literacy-001:reading" });
    expect(foundation.literacy[97]).toMatchObject({ id: "literacy-098", glyph: "圆", word: "圆圈" });
    expect(foundation.poems[0]).toMatchObject({ id: "poem-001", title: "咏鹅", headerSpeechId: "poem-001:header" });
    expect(foundation.poems[15]).toMatchObject({ id: "poem-016", title: "山行" });
    expect(foundation.english[64]).toMatchObject({ id: "word-065", word: "ten", speechId: "word-065:pronunciation" });
    expect(foundation.writing[0]).toMatchObject({ id: "hz-001", glyph: "一", optional: true });
    expect(BOOKS.slice(0, 8).map((item) => item.id)).toEqual(LEGACY_BOOK_IDS);
    expect(READING_LISTS.slice(0, 12).map((item) => item.id)).toEqual(LEGACY_READING_LIST_IDS);
    expect(READING_LISTS[7].t).toBe("好饿的毛毛虫 The Very Hungry Caterpillar");
  });

  it("contains valid single characters, words, themes and declared provenance", () => {
    expect(new Set(bridging.literacy.map((item) => item.glyph)).size).toBe(bridging.literacy.length);
    expect(new Set(bridging.english.map((item) => item.word)).size).toBe(bridging.english.length);
    expect(new Set(bridging.poems.map((item) => item.lines.join(""))).size).toBe(bridging.poems.length);
    for (const item of bridging.literacy) {
      expect(item.glyph).toMatch(/^\p{Script=Han}$/u);
      expect(item.word).toContain(item.glyph);
    }
    for (const items of [bridging.literacy, bridging.poems, bridging.english, bridging.books]) {
      for (const item of items) {
        expect(item.theme).toBeTruthy();
        expect(item.sourceRef).toBeTruthy();
        expect(item.prompt).toBeTruthy();
      }
    }
  });

  it("resolves every catalog speech identity from the same content facts", () => {
    const entries = new Map(CORE_LEARNING_SPEECH_ENTRIES.map((entry) => [entry.contentId, entry]));
    expect(entries.size).toBe(CORE_LEARNING_SPEECH_ENTRIES.length);
    for (const item of [...bridging.literacy, ...bridging.english]) expect(entries.has(item.speechId)).toBe(true);
    for (const poem of bridging.poems) {
      expect(entries.has(poem.headerSpeechId)).toBe(true);
      expect(poem.lineSpeechIds).toHaveLength(poem.lines.length);
      for (const id of poem.lineSpeechIds) expect(entries.has(id)).toBe(true);
    }
  });

  it("rejects unknown packages and returns null for unknown global identities", () => {
    expect(() => getLearningCatalog("unknown")).toThrow("unknown-learning-package");
    expect(getLearningItem("recognition", "unknown")).toBeNull();
    expect(getLearningItem("unknown", "literacy-001")).toBeNull();
  });
});

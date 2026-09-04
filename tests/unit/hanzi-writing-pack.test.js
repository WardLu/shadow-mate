import { describe, expect, it } from "vitest";
import {
  HANZI_WRITING_V2_PILOT,
  getActiveHanziWritingPack,
} from "../../src/content/hanzi-writing/manifest.js";
import { validateHanziWritingPack } from "../../src/content/hanzi-writing/validate-pack.js";

function clonePack() {
  return structuredClone(HANZI_WRITING_V2_PILOT);
}

function clonePackWithLearningMetadata() {
  const pack = clonePack();

  pack.items.forEach((item) => {
    item.concept = {
      label: `${item.glyph}概念`,
      visual: {
        kind: "emoji",
        value: "🌟",
        alt: "一个学习画面",
      },
      englishLabel: "learning concept",
      characterEnglishLabel: "learning character",
      characterMeaning: "这个单字的意思",
    };
    item.exampleWords = [item.exampleWord, `${item.glyph}词`];
    item.sentence = `这是${item.glyph}。`;
    item.writing = {
      strokeCount: 1,
      structure: "独体字",
      hint: "先看清字的样子。",
    };
  });

  return pack;
}

function expectInvalid(pack, messagePart) {
  const result = validateHanziWritingPack(pack);

  expect(result.valid).toBe(false);
  expect(result.errors.some((error) => error.includes(messagePart))).toBe(true);
}

describe("Hanzi writing V2 Pilot content pack", () => {
  it("exposes the fixed pilot metadata and enough active writing items", () => {
    const pack = getActiveHanziWritingPack();

    expect(pack).toBe(HANZI_WRITING_V2_PILOT);
    expect(pack).toMatchObject({
      schemaVersion: 1,
      setId: "hanzi-writing-v2",
      contentVersion: "hanzi-v2-pilot-1",
      algorithmCompatibility: "rotation-v1",
      locale: "zh-CN",
      targetAgeRange: [4, 5],
      worksheetPolicy: { rowsPerDay: 4, recentDayWindow: 7 },
      reviewers: ["product-owner"],
      sourceRefs: ["shadow-mate-preschool-hanzi-curriculum"],
    });
    expect(pack.items.filter((item) => item.status === "active").length).toBeGreaterThanOrEqual(32);
    expect(pack.items.every((item) =>
      [
        "id",
        "glyph",
        "pinyin",
        "exampleWord",
        "order",
        "theme",
        "difficulty",
        "status",
        "sourceRefs",
        "traceEligible",
      ].every((field) => Object.hasOwn(item, field))
    )).toBe(true);

    expect(pack.items.every((item) =>
      Object.hasOwn(item, "concept") &&
      Object.hasOwn(item.concept, "label") &&
      Object.hasOwn(item.concept, "visual") &&
      Object.hasOwn(item.concept.visual, "kind") &&
      Object.hasOwn(item.concept.visual, "value") &&
      Object.hasOwn(item.concept.visual, "alt") &&
      Object.hasOwn(item.concept, "englishLabel") &&
      Object.hasOwn(item.concept, "characterEnglishLabel") &&
      Object.hasOwn(item.concept, "characterMeaning") &&
      Object.hasOwn(item, "exampleWords") &&
      Object.hasOwn(item, "sentence") &&
      Object.hasOwn(item, "writing")
    )).toBe(true);
  });

  it("accepts the checked-in pilot pack", () => {
    expect(validateHanziWritingPack(getActiveHanziWritingPack())).toEqual({ valid: true, errors: [] });
  });

  it("accepts a complete learning metadata fixture", () => {
    expect(validateHanziWritingPack(clonePackWithLearningMetadata())).toEqual({ valid: true, errors: [] });
  });

  it("rejects duplicate item ids", () => {
    const pack = clonePack();
    pack.items[1].id = pack.items[0].id;

    expectInvalid(pack, "duplicate id");
  });

  it("rejects duplicate glyphs", () => {
    const pack = clonePack();
    pack.items[1].glyph = pack.items[0].glyph;

    expectInvalid(pack, "duplicate glyph");
  });

  it("rejects duplicate ordering values", () => {
    const pack = clonePack();
    pack.items[1].order = pack.items[0].order;

    expectInvalid(pack, "duplicate order");
  });

  it("requires at least 32 active items", () => {
    const pack = clonePack();
    pack.items = pack.items.slice(0, 31);

    expectInvalid(pack, "at least 32 active items");
  });

  it("requires each glyph to be one CJK ideograph", () => {
    const pack = clonePack();
    pack.items[0].glyph = "A";

    expectInvalid(pack, "single CJK ideograph");
  });

  it("requires a declared pack source reference", () => {
    const pack = clonePack();
    delete pack.sourceRefs;

    expectInvalid(pack, "sourceRefs");
  });

  it("requires every item to carry a source reference", () => {
    const pack = clonePack();
    delete pack.items[0].sourceRefs;

    expectInvalid(pack, "items[0].sourceRefs");
  });

  it("rejects item sources that are not declared by the pack", () => {
    const pack = clonePack();
    pack.items[0].sourceRefs = ["unlisted-source"];

    expectInvalid(pack, "not declared by pack.sourceRefs");
  });

  it("rejects retired items from the active pilot pack", () => {
    const pack = clonePack();
    pack.items[0].status = "retired";

    expectInvalid(pack, "retired item");
  });

  it("rejects malformed field types", () => {
    const pack = clonePack();
    pack.items[0].pinyin = 42;
    pack.items[0].order = "1";
    pack.items[0].traceEligible = "yes";

    const result = validateHanziWritingPack(pack);

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      "items[0].pinyin must be a non-empty string",
      "items[0].order must be a positive integer",
      "items[0].traceEligible must be a boolean",
    ]));
  });

  it("rejects HTML-like text in content fields", () => {
    const pack = clonePack();
    pack.items[0].exampleWord = "<script>alert(1)</script>";

    expectInvalid(pack, "unsafe HTML-like text");
  });

  it("requires the visual descriptor", () => {
    const pack = clonePackWithLearningMetadata();
    delete pack.items[0].concept.visual;

    expectInvalid(pack, "items[0].concept.visual");
  });

  it("requires at least two example words", () => {
    const pack = clonePackWithLearningMetadata();
    delete pack.items[0].exampleWords;

    expectInvalid(pack, "items[0].exampleWords");
  });

  it("requires a child-readable sentence", () => {
    const pack = clonePackWithLearningMetadata();
    delete pack.items[0].sentence;

    expectInvalid(pack, "items[0].sentence");
  });

  it("requires writing metadata for traceable items", () => {
    const pack = clonePackWithLearningMetadata();
    delete pack.items[0].writing;

    expectInvalid(pack, "items[0].writing");
  });

  it("rejects a visual kind other than emoji", () => {
    const pack = clonePackWithLearningMetadata();
    pack.items[0].concept.visual.kind = "image";

    expectInvalid(pack, "items[0].concept.visual.kind");
  });

  it("rejects a visual value with more than eight graphemes", () => {
    const pack = clonePackWithLearningMetadata();
    pack.items[0].concept.visual.value = "😀😀😀😀😀😀😀😀😀";

    expectInvalid(pack, "items[0].concept.visual.value");
  });

  it("rejects URLs in visual values", () => {
    const pack = clonePackWithLearningMetadata();
    pack.items[0].concept.visual.value = "https://example.com";

    expectInvalid(pack, "items[0].concept.visual.value");
  });

  it("rejects an overlong visual alt", () => {
    const pack = clonePackWithLearningMetadata();
    pack.items[0].concept.visual.alt = "a".repeat(121);

    expectInvalid(pack, "items[0].concept.visual.alt");
  });

  it("requires every example word to contain the target glyph", () => {
    const pack = clonePackWithLearningMetadata();
    pack.items[0].exampleWords[1] = "没有目标字";

    expectInvalid(pack, "items[0].exampleWords[1]");
  });

  it("rejects stroke counts outside the supported range", () => {
    const pack = clonePackWithLearningMetadata();
    pack.items[0].writing.strokeCount = 65;

    expectInvalid(pack, "items[0].writing.strokeCount");
  });

  it("does not allow writing metadata when tracing is disabled", () => {
    const pack = clonePackWithLearningMetadata();
    pack.items[0].traceEligible = false;

    expectInvalid(pack, "items[0].writing");
  });

  it("runs unsafe text checks through every new field path", () => {
    const pack = clonePackWithLearningMetadata();
    pack.items[0].concept.visual.alt = "<script>alert(1)</script>";

    expectInvalid(pack, "items[0].concept.visual.alt contains unsafe HTML-like text");
  });
});

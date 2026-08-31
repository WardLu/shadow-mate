import { describe, expect, it } from "vitest";
import {
  HANZI_WRITING_V2_PILOT,
  getActiveHanziWritingPack,
} from "../../src/content/hanzi-writing/manifest.js";
import { validateHanziWritingPack } from "../../src/content/hanzi-writing/validate-pack.js";

function clonePack() {
  return structuredClone(HANZI_WRITING_V2_PILOT);
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
  });

  it("accepts the checked-in pilot pack", () => {
    expect(validateHanziWritingPack(getActiveHanziWritingPack())).toEqual({ valid: true, errors: [] });
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
});

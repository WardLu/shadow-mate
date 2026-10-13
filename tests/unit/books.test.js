import { describe, expect, it } from "vitest";
import { migrateLegacyBookState, LEGACY_BOOK_IDS, LEGACY_READING_LIST_IDS } from "../../src/content/books.js";

describe("legacy book identity migration", () => {
  it("maps fixed legacy positions, preserving false and unknown entries", () => {
    const source = { bookShelf: { 0: true, 1: false, 7: true, 99: true, custom: true }, peanutRead: { 7: true, 11: false, 99: true } };
    const migrated = migrateLegacyBookState(source);
    expect(migrated.bookShelf).toEqual({ [LEGACY_BOOK_IDS[0]]: true, [LEGACY_BOOK_IDS[1]]: false, [LEGACY_BOOK_IDS[7]]: true, 99: true, custom: true });
    expect(migrated.peanutRead).toEqual({ "reading-very-hungry-caterpillar": true, [LEGACY_READING_LIST_IDS[11]]: false, 99: true });
    expect(source.bookShelf[0]).toBe(true);
    expect(migrateLegacyBookState(migrated)).toEqual(migrated);
  });

  it("preserves explicit stable-ID choices over stale numeric choices", () => {
    expect(migrateLegacyBookState({ bookShelf: { 0: true, [LEGACY_BOOK_IDS[0]]: false } }).bookShelf).toEqual({ [LEGACY_BOOK_IDS[0]]: false });
    expect(migrateLegacyBookState({ bookShelf: null, peanutRead: [] })).toEqual({ bookShelf: {}, peanutRead: {} });
  });
});

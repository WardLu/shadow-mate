import { describe, expect, it } from "vitest";
import { selectDailyWritingGroups } from "../../src/lib.js";

const WRITING_GROUPS = ["一二三人", "上下大", "口手日", "月水火", "木山中", "田土石", "天王马", "牛羊鸟"];

describe("daily writing workbook selection", () => {
  it("keeps one calendar day's workbook stable across refreshes and check-in state changes", () => {
    const morning = selectDailyWritingGroups(WRITING_GROUPS, new Date(2026, 7, 20, 9, 0));
    const evening = selectDailyWritingGroups(WRITING_GROUPS, new Date(2026, 7, 20, 21, 30));

    expect(morning).toEqual(evening);
    expect(morning).toHaveLength(4);
  });

  it("rotates to the next sheet on the following day and reaches all eight groups", () => {
    const firstDay = selectDailyWritingGroups(WRITING_GROUPS, new Date(2026, 7, 20));
    const nextDay = selectDailyWritingGroups(WRITING_GROUPS, new Date(2026, 7, 21));

    expect(nextDay).not.toEqual(firstDay);
    expect(new Set([...firstDay, ...nextDay])).toEqual(new Set(WRITING_GROUPS));
  });

  it("continues rotating across a calendar-year boundary", () => {
    const lastDay = selectDailyWritingGroups(WRITING_GROUPS, new Date(2026, 11, 31));
    const nextDay = selectDailyWritingGroups(WRITING_GROUPS, new Date(2027, 0, 1));

    expect(nextDay).not.toEqual(lastDay);
  });
});

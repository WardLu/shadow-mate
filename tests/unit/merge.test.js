import { describe, it, expect } from "vitest";
import {
  escapeHtml,
  formatAuthError,
  formatCloudError,
  stateHasData,
  mergeObjects,
  mergeState,
  GRADE_LABELS,
  GRADE_OPTIONS,
  gradeLabel,
  gradeOptionsSelected,
  buildMissingSequence,
  latestUpdatedAt,
  passwordStrength,
} from "../../src/lib.js";
import { resolveDailyWorksheet } from "../../src/hanzi-worksheet-rotation.js";
import { getActiveHanziWritingPack } from "../../src/content/hanzi-writing/manifest.js";

const HANZI_PACK = getActiveHanziWritingPack();

function makeRotationState(learnerScope = "anonymous") {
  return resolveDailyWorksheet({
    rotationState: {},
    pack: HANZI_PACK,
    learnerScope,
    now: new Date("2026-09-01T00:30:00.000Z"),
    timeZone: "Asia/Singapore",
  }).rotationState;
}

describe("family sync metadata", () => {
  it("uses the newest child state timestamp for the family workspace", () => {
    expect(latestUpdatedAt([
      { profile_id: "older", updated_at: "2026-08-01T01:00:00.000Z" },
      { profile_id: "newer", updated_at: "2026-08-01T02:30:00.000Z" },
    ])).toBe("2026-08-01T02:30:00.000Z");
  });

  it("ignores missing or invalid timestamps", () => {
    expect(latestUpdatedAt([{ updated_at: "not-a-date" }, {}])).toBeNull();
  });
});

describe("grade labels", () => {
  it("covers K12 plus preschool", () => {
    expect(Object.keys(GRADE_LABELS)).toHaveLength(13);
    expect(gradeLabel(0)).toBe("学前");
    expect(gradeLabel(12)).toBe("十二年级");
  });

  it("renders an independently selectable option for every grade", () => {
    expect(GRADE_OPTIONS).toContain('<option value="7">七年级</option>');
    expect(gradeOptionsSelected(10)).toContain('<option value="10" selected>十年级</option>');
    expect(gradeOptionsSelected(99)).not.toContain(" selected");
  });
});

describe("number sense sequence", () => {
  it("leaves one missing value without skipping the following number", () => {
    const sequence = buildMissingSequence({ start: 1, length: 20, missingIndex: 9 });
    expect(sequence.answer).toBe(10);
    expect(sequence.values.slice(7, 12)).toEqual([8, 9, null, 11, 12]);
  });
});

describe("escapeHtml", () => {
  it("escapes all HTML special characters", () => {
    expect(escapeHtml('<script>alert("x")</script>')).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;"
    );
  });
  it("escapes single quotes", () => {
    expect(escapeHtml("it's")).toBe("it&#039;s");
  });
  it("handles empty input", () => {
    expect(escapeHtml()).toBe("");
    expect(escapeHtml("")).toBe("");
  });
  it("handles non-string input", () => {
    expect(escapeHtml(42)).toBe("42");
    expect(escapeHtml(null)).toBe("null");
  });
});

describe("cloud error messages", () => {
  it("explains the auth cooldown in Chinese and keeps the wait time", () => {
    expect(formatAuthError({
      message: "For security purposes, you can only request this after 7 seconds.",
    })).toBe("请求过于频繁，请等待 7 秒后再试。");
  });

  it("explains expired and invalid verification codes", () => {
    expect(formatAuthError({ message: "Token has expired or is invalid" })).toBe(
      "验证码已过期，请重新发送验证码。",
    );
    expect(formatAuthError({ message: "Invalid token" })).toBe(
      "验证码无效，请检查后重新输入。",
    );
  });

  it("does not expose raw cloud permission errors", () => {
    expect(formatCloudError(
      { message: "new row violates row-level security policy" },
      "删除家庭失败，请稍后再试。",
    )).toBe("当前账号没有执行此操作的权限。");
  });

  it("explains password login and password length errors in Chinese", () => {
    expect(formatAuthError({ message: "Invalid login credentials" })).toBe(
      "邮箱或密码不正确；如果尚未设置密码，请改用邮箱验证码登录。",
    );
    expect(formatAuthError({ code: "weak_password", message: "Password is too short" })).toBe(
      "密码至少需要 6 位。",
    );
  });
});

describe("additional error branches", () => {
  it("translates rate-limit, unchanged-password, network, and fallback errors", () => {
    expect(formatAuthError({ message: "Too many requests" }, "fallback")).not.toBe("fallback");
    expect(formatAuthError({ message: "The new password is the same password" }, "fallback")).not.toBe("fallback");
    expect(formatAuthError({ message: "Failed to fetch" }, "fallback")).not.toBe("fallback");
    expect(formatAuthError({ message: "unexpected auth failure" }, "fallback")).toBe("fallback");
  });

  it("translates cloud conflict, network, and fallback errors", () => {
    expect(formatCloudError({ message: "learning_state_conflict" }, "fallback")).not.toBe("fallback");
    expect(formatCloudError({ message: "network timeout" }, "fallback")).not.toBe("fallback");
    expect(formatCloudError({ message: "unexpected cloud failure" }, "fallback")).toBe("fallback");
  });
});

describe("passwordStrength", () => {
  it("uses six characters as the only hard requirement", () => {
    expect(passwordStrength("12345").valid).toBe(false);
    expect(passwordStrength("123456").valid).toBe(true);
  });

  it("raises the advisory score for length and character variety", () => {
    expect(passwordStrength("abcdef").label).toBe("中");
    expect(passwordStrength("StrongPass123!").label).toBe("强");
  });
});

describe("stateHasData", () => {
  it("returns false for empty state", () => {
    expect(stateHasData({})).toBe(false);
    expect(stateHasData({ checkins: {}, points: {}, bookShelf: {}, peanutRead: {}, peanutLog: [] })).toBe(false);
  });
  it("returns false for null/undefined", () => {
    expect(stateHasData(null)).toBe(false);
    expect(stateHasData(undefined)).toBe(false);
  });
  it("returns true when checkins exist", () => {
    expect(stateHasData({ checkins: { "2026-08-01": { chinese: 1 } } })).toBe(true);
  });
  it("returns true when points exist", () => {
    expect(stateHasData({ points: { "2026-08": { "1": 5 } } })).toBe(true);
  });
  it("returns true when peanutLog has entries", () => {
    expect(stateHasData({ peanutLog: [{ title: "Book", date: "2026-08-01", rating: 5 }] })).toBe(true);
  });
  it("returns true when bookShelf has entries", () => {
    expect(stateHasData({ bookShelf: { 0: 1 } })).toBe(true);
  });
  it("returns true for a valid rotation assignment", () => {
    expect(stateHasData({
      extra: { hanziWorksheetRotationV1: makeRotationState() },
    })).toBe(true);
  });
  it("rejects empty, malformed, and cross-scope rotation state", () => {
    const malformed = makeRotationState();
    malformed.assignments["2026-09-01"] = {};

    const crossScope = makeRotationState("profile:learner-a");
    crossScope.learnerScope = "profile:learner-b";

    expect(stateHasData({ extra: { hanziWorksheetRotationV1: {} } })).toBe(false);
    expect(stateHasData({ extra: { hanziWorksheetRotationV1: [] } })).toBe(false);
    expect(stateHasData({ extra: { hanziWorksheetRotationV1: malformed } })).toBe(false);
    expect(stateHasData({ extra: { hanziWorksheetRotationV1: crossScope } })).toBe(false);
  });
});

describe("mergeObjects", () => {
  it("merges flat objects with local taking priority", () => {
    expect(mergeObjects({ a: 1, b: 2 }, { b: 3, c: 4 })).toEqual({ a: 1, b: 2, c: 4 });
  });
  it("recursively merges nested objects", () => {
    const local = { checkins: { "d1": { math: 1 } } };
    const remote = { checkins: { "d2": { english: 1 } } };
    const result = mergeObjects(local, remote);
    expect(result.checkins).toEqual({ "d1": { math: 1 }, "d2": { english: 1 } });
  });
  it("local arrays replace remote arrays", () => {
    expect(mergeObjects({ list: [1, 2] }, { list: [3, 4] })).toEqual({ list: [1, 2] });
  });
  it("handles null values", () => {
    expect(mergeObjects({ a: null }, { a: 1, b: 2 })).toEqual({ a: null, b: 2 });
  });
  it("handles empty inputs", () => {
    expect(mergeObjects({}, { a: 1 })).toEqual({ a: 1 });
    expect(mergeObjects({ a: 1 }, {})).toEqual({ a: 1 });
  });
  it("does not mutate inputs", () => {
    const local = { a: { b: 1 } };
    const remote = { a: { c: 2 } };
    mergeObjects(local, remote);
    expect(local).toEqual({ a: { b: 1 } });
    expect(remote).toEqual({ a: { c: 2 } });
  });
});

describe("mergeState", () => {
  it("merges states and deduplicates peanutLog by date+title+rating", () => {
    const local = {
      checkins: { "d1": { math: 1 } },
      peanutLog: [{ title: "Book A", date: "2026-08-01", rating: 5 }],
    };
    const remote = {
      checkins: { "d2": { english: 1 } },
      peanutLog: [
        { title: "Book A", date: "2026-08-01", rating: 5 },
        { title: "Book B", date: "2026-08-02", rating: 3 },
      ],
    };
    const merged = mergeState(local, remote);
    expect(merged.checkins).toHaveProperty("d1");
    expect(merged.checkins).toHaveProperty("d2");
    expect(merged.peanutLog).toHaveLength(2);
  });
  it("sorts peanutLog by date", () => {
    const local = { peanutLog: [{ title: "A", date: "2026-08-01", rating: 5 }] };
    const remote = { peanutLog: [{ title: "B", date: "2026-08-03", rating: 4 }] };
    // Remote processed first: insertion order is [08-03, 08-01]; sort must reorder
    const merged = mergeState(local, remote);
    expect(merged.peanutLog[0].date).toBe("2026-08-01");
    expect(merged.peanutLog[1].date).toBe("2026-08-03");
  });
  it("handles empty peanutLog", () => {
    const merged = mergeState({ checkins: {} }, { checkins: {} });
    expect(merged.peanutLog).toEqual([]);
  });
});

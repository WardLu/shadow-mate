import { describe, expect, it } from "vitest";
import {
  canLearnSpokenCourse,
  getSpokenCourse,
  getSpokenCourseTarget,
  normalizeSpokenCourseSelection,
  SPOKEN_COURSE_SELECTION_LIMIT,
  SPOKEN_LANGUAGE_REGISTRY,
} from "../../src/spoken-language-courses.js";

describe("spoken language courses", () => {
  it("separates interface text, instruction speech, and target variety", () => {
    expect(SPOKEN_LANGUAGE_REGISTRY.defaults).toEqual({ interfaceLanguage: "zh-Hans", instructionLanguage: "cmn-CN" });
    expect(SPOKEN_LANGUAGE_REGISTRY.interfaceLanguages.map(({ interfaceLanguage }) => interfaceLanguage)).toEqual(["zh-Hans", "en"]);
    expect(SPOKEN_LANGUAGE_REGISTRY.languages.find(({ languageId }) => languageId === "zh").varieties.map(({ varietyId }) => varietyId)).toEqual(["cmn-CN", "yue-HK"]);
    expect(getSpokenCourseTarget("yue-hk-everyday-speaking")).toEqual({ languageId: "zh", varietyId: "yue-HK", locale: "yue-HK" });
    expect(getSpokenCourseTarget("cmn-cn-everyday-speaking")).toEqual({ languageId: "zh", varietyId: "cmn-CN", locale: "zh-CN" });
    expect(getSpokenCourseTarget("unknown")).toBeNull();
  });

  it("does not make planned courses learnable or imply shared completion across varieties", () => {
    expect(getSpokenCourse("yue-hk-everyday-speaking")).toMatchObject({ languageId: "zh", varietyId: "yue-HK", status: "planned", availability: "unavailable", contentAvailable: false });
    for (const course of SPOKEN_LANGUAGE_REGISTRY.courses) {
      expect(canLearnSpokenCourse(course.courseId)).toBe(false);
      expect(course).not.toHaveProperty("checkinKey");
    }
    expect(canLearnSpokenCourse("unknown")).toBe(false);
    expect(getSpokenCourse("unknown")).toBeNull();
  });

  it("normalizes multiple selection paths with allowlisting and deduplication", () => {
    const known = SPOKEN_LANGUAGE_REGISTRY.courses.map(({ courseId }) => courseId);
    const noisy = [...known, ...known, null, "not-a-course", { courseId: "not-a-course" }];
    expect(normalizeSpokenCourseSelection(noisy)).toEqual(known);
    expect(normalizeSpokenCourseSelection({ spoken_courses: [known[1], known[1], { courseId: known[0] }, "untrusted"] })).toEqual([known[1], known[0]]);
    expect(normalizeSpokenCourseSelection({ courseIds: known.slice().reverse() })).toEqual([...known].reverse());
    expect(normalizeSpokenCourseSelection({ courses: known.map((courseId) => ({ course_id: courseId })) })).toEqual(known);
    expect(normalizeSpokenCourseSelection(` ${known[0]} `)).toEqual([known[0]]);
    expect(normalizeSpokenCourseSelection(known, { limit: 1 })).toEqual([known[0]]);
    expect(normalizeSpokenCourseSelection(known, { limit: 0 })).toEqual([]);
    expect(normalizeSpokenCourseSelection(null)).toEqual([]);
  });

  it("limits scanning of untrusted input and bounds output regardless of caller limit", () => {
    const known = SPOKEN_LANGUAGE_REGISTRY.courses.map(({ courseId }) => courseId);
    const input = Array(SPOKEN_COURSE_SELECTION_LIMIT * 4).fill("unknown").concat(known);
    expect(normalizeSpokenCourseSelection(input)).toEqual([]);
    expect(normalizeSpokenCourseSelection(known, { limit: Infinity }).length).toBeLessThanOrEqual(SPOKEN_COURSE_SELECTION_LIMIT);
    expect(normalizeSpokenCourseSelection(known, { limit: 1000 })).toEqual(known);
  });
});

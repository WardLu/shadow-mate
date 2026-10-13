export const SPOKEN_COURSE_SELECTION_LIMIT = 12;

export const SPOKEN_LANGUAGE_REGISTRY = Object.freeze({
  defaults: Object.freeze({ interfaceLanguage: "zh-Hans", instructionLanguage: "cmn-CN" }),
  interfaceLanguages: Object.freeze([
    Object.freeze({ interfaceLanguage: "zh-Hans", label: "简体中文" }),
    Object.freeze({ interfaceLanguage: "en", label: "English" }),
  ]),
  languages: Object.freeze([
    Object.freeze({
      languageId: "zh",
      label: "中文",
      varieties: Object.freeze([
        Object.freeze({ varietyId: "cmn-CN", label: "普通话", locale: "zh-CN" }),
        Object.freeze({ varietyId: "yue-HK", label: "粤语（香港）", locale: "yue-HK" }),
      ]),
    }),
    Object.freeze({
      languageId: "en",
      label: "英语",
      varieties: Object.freeze([
        Object.freeze({ varietyId: "en-US", label: "美式英语", locale: "en-US" }),
      ]),
    }),
  ]),
  courses: Object.freeze([
    Object.freeze({
      courseId: "cmn-cn-everyday-speaking",
      languageId: "zh",
      varietyId: "cmn-CN",
      status: "planned",
      availability: "unavailable",
      contentAvailable: false,
    }),
    Object.freeze({
      courseId: "yue-hk-everyday-speaking",
      languageId: "zh",
      varietyId: "yue-HK",
      status: "planned",
      availability: "unavailable",
      contentAvailable: false,
    }),
    Object.freeze({
      courseId: "en-us-everyday-speaking",
      languageId: "en",
      varietyId: "en-US",
      status: "planned",
      availability: "unavailable",
      contentAvailable: false,
    }),
  ]),
});

const COURSE_IDS = new Set(SPOKEN_LANGUAGE_REGISTRY.courses.map(({ courseId }) => courseId));

function selectionId(value) {
  if (typeof value === "string") return value.trim();
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  for (const key of ["courseId", "course_id"]) {
    if (typeof value[key] === "string") return value[key].trim();
  }
  return "";
}

function selectionValues(selection) {
  if (Array.isArray(selection)) return selection.slice(0, SPOKEN_COURSE_SELECTION_LIMIT * 4);
  if (!selection || typeof selection !== "object") return [selection];
  if (Array.isArray(selection.spoken_courses)) return selection.spoken_courses.slice(0, SPOKEN_COURSE_SELECTION_LIMIT * 4);
  if (Array.isArray(selection.courseIds)) return selection.courseIds.slice(0, SPOKEN_COURSE_SELECTION_LIMIT * 4);
  if (Array.isArray(selection.courses)) return selection.courses.slice(0, SPOKEN_COURSE_SELECTION_LIMIT * 4);
  return [selection];
}

export function normalizeSpokenCourseSelection(selection, { limit = SPOKEN_COURSE_SELECTION_LIMIT } = {}) {
  const maximum = Number.isInteger(limit) && limit >= 0
    ? Math.min(limit, SPOKEN_COURSE_SELECTION_LIMIT)
    : SPOKEN_COURSE_SELECTION_LIMIT;
  if (maximum === 0) return [];
  const selected = [];
  const seen = new Set();

  for (const value of selectionValues(selection)) {
    const courseId = selectionId(value);
    if (!COURSE_IDS.has(courseId) || seen.has(courseId)) continue;
    seen.add(courseId);
    selected.push(courseId);
    if (selected.length >= maximum) break;
  }

  return selected;
}

export function getSpokenCourse(courseId) {
  return SPOKEN_LANGUAGE_REGISTRY.courses.find((course) => course.courseId === courseId) || null;
}

export function getSpokenCourseTarget(courseId) {
  const course = getSpokenCourse(courseId);
  if (!course) return null;
  const language = SPOKEN_LANGUAGE_REGISTRY.languages.find(({ languageId }) => languageId === course.languageId);
  const variety = language?.varieties.find(({ varietyId }) => varietyId === course.varietyId);
  return variety ? { languageId: course.languageId, varietyId: variety.varietyId, locale: variety.locale } : null;
}

export function canLearnSpokenCourse(courseId) {
  const course = getSpokenCourse(courseId);
  return Boolean(course && course.status === "published" && course.availability === "available" && course.contentAvailable === true);
}

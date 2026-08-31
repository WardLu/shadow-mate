import { normalizeRotationState } from "./hanzi-worksheet-rotation.js";

const STATE_KEYS = ["checkins", "extra", "points", "bookShelf", "peanutLog", "peanutRead"];
const HANZI_ROTATION_STATE_KEY = "hanziWorksheetRotationV1";

export const CHECKIN_GROUPS = {
  chinese: ["chinese-literacy", "chinese-poem", "chinese-writing"],
  math: ["math-mental", "math-sense"],
  english: ["english-vocabulary"],
  book: ["book-reading"],
};

const CHECKIN_GROUP_BY_KEY = Object.fromEntries(
  Object.entries(CHECKIN_GROUPS).flatMap(([group, keys]) => keys.map((key) => [key, group]))
);

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function cloneRecord(value) {
  return isRecord(value) ? structuredClone(value) : {};
}

function normalizeExtra(value) {
  const extra = cloneRecord(value);
  if (Object.hasOwn(extra, HANZI_ROTATION_STATE_KEY)) {
    extra[HANZI_ROTATION_STATE_KEY] = normalizeRotationState(extra[HANZI_ROTATION_STATE_KEY]);
  }
  return extra;
}

export function createLearningState(initial = {}) {
  const source = isRecord(initial) ? initial : {};
  return {
    checkins: cloneRecord(source.checkins),
    extra: normalizeExtra(source.extra),
    points: cloneRecord(source.points),
    bookShelf: cloneRecord(source.bookShelf),
    peanutLog: Array.isArray(source.peanutLog) ? structuredClone(source.peanutLog) : [],
    peanutRead: cloneRecord(source.peanutRead),
  };
}

export function getHanziRotationState(state) {
  return state?.extra?.[HANZI_ROTATION_STATE_KEY] || null;
}

export function hasCompatibleHanziRotationScope(state, learnerScope) {
  const rotationState = getHanziRotationState(state);
  if (!rotationState) return true;
  return typeof learnerScope === "string" && learnerScope.trim().length > 0 &&
    rotationState.learnerScope === learnerScope;
}

/**
 * Normalizes a state without hiding a rotation scope mismatch. Callers that
 * explicitly choose to discard an incompatible rotation may opt into that
 * lossy operation; ordinary hydration and activation must retain the
 * mismatch so hasCompatibleHanziRotationScope() can fail closed.
 */
export function normalizeLearningStateForScope(
  state,
  _learnerScope,
) {
  // The expected scope is intentionally not used to rewrite or discard data.
  // Callers must inspect hasCompatibleHanziRotationScope() and choose an
  // explicit drop API when losing an incompatible rotation is acceptable.
  return normalizeLearningState(state);
}

export function dropIncompatibleHanziRotation(state, learnerScope) {
  const normalized = normalizeLearningStateForScope(state, learnerScope);
  return hasCompatibleHanziRotationScope(normalized, learnerScope)
    ? normalized
    : replaceHanziRotationState(normalized, null);
}

export function replaceHanziRotationState(state, rotationState) {
  const next = createLearningState(state);
  if (rotationState === null || rotationState === undefined) {
    delete next.extra[HANZI_ROTATION_STATE_KEY];
  } else {
    const currentRotation = getHanziRotationState(next);
    const expectedLearnerScope = currentRotation?.learnerScope;
    next.extra[HANZI_ROTATION_STATE_KEY] = normalizeRotationState(
      rotationState,
      expectedLearnerScope ? { learnerScope: expectedLearnerScope } : {}
    );
  }
  return next;
}

export function hasCheckin(day, key) {
  if (!isRecord(day)) return false;
  if (day[key]) return true;
  const group = CHECKIN_GROUP_BY_KEY[key];
  if (group && day[group]) return true;
  const keys = CHECKIN_GROUPS[key];
  return Boolean(keys?.some((item) => day[item]));
}

function toggleFlag(record, key) {
  if (key === undefined || key === null || key === "") return;
  const normalizedKey = String(key);
  if (record[normalizedKey]) delete record[normalizedKey];
  else record[normalizedKey] = 1;
}

function toggleCheckin(state, { date, key }) {
  if (!date || !key) return state;
  if (!state.checkins[date]) state.checkins[date] = {};
  const day = state.checkins[date];
  const group = CHECKIN_GROUP_BY_KEY[key];
  if (group && day[group]) {
    delete day[group];
    for (const item of CHECKIN_GROUPS[group]) day[item] = true;
  }
  if (day[key]) delete day[key];
  else day[key] = true;
  if (!Object.keys(day).length) delete state.checkins[date];
  return state;
}

function togglePoint(state, { month, itemIndex, day }) {
  if (!month || itemIndex === undefined || day === undefined) return state;
  const monthKey = String(month);
  const itemKey = String(itemIndex);
  const dayKey = String(day);
  if (!state.points[monthKey]) state.points[monthKey] = {};
  if (!state.points[monthKey][itemKey]) state.points[monthKey][itemKey] = {};
  const record = state.points[monthKey][itemKey];
  if (record[dayKey]) delete record[dayKey];
  else record[dayKey] = 1;
  return state;
}

export function transitionLearningState(current, action = {}) {
  if (action.type === "STATE_REPLACED") return createLearningState(action.state);

  const state = createLearningState(current);
  switch (action.type) {
    case "CHECKIN_TOGGLED":
      return toggleCheckin(state, action);
    case "POINT_TOGGLED":
      return togglePoint(state, action);
    case "POINTS_CLEARED":
      if (action.month) delete state.points[String(action.month)];
      return state;
    case "SHELF_TOGGLED":
      toggleFlag(state.bookShelf, action.bookIndex);
      return state;
    case "PEANUT_READ_TOGGLED":
      toggleFlag(state.peanutRead, action.bookIndex);
      return state;
    case "HANZI_ROTATION_REPLACED":
      return replaceHanziRotationState(state, action.rotationState);
    case "READING_LOG_ADDED":
      if (isRecord(action.record)) state.peanutLog.push(structuredClone(action.record));
      return state;
    case "READING_LOG_REMOVED":
      if (Number.isInteger(action.index) && action.index >= 0 && action.index < state.peanutLog.length) {
        state.peanutLog.splice(action.index, 1);
      }
      return state;
    default:
      return state;
  }
}

export function isPointMarked(state, month, itemIndex, day) {
  return Boolean(state?.points?.[String(month)]?.[String(itemIndex)]?.[String(day)]);
}

export function normalizeLearningState(state) {
  return createLearningState(state);
}

export const LEARNING_STATE_KEYS = STATE_KEYS;

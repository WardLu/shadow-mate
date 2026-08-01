// Pure functions extracted from cloud.js for unit testing.
// These do not depend on DOM, Supabase, or any external state.

export function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function stateHasData(state) {
  return Boolean(
    Object.keys(state?.checkins || {}).length ||
      Object.keys(state?.points || {}).length ||
      Object.keys(state?.bookShelf || {}).length ||
      Object.keys(state?.peanutRead || {}).length ||
      (state?.peanutLog || []).length
  );
}

export function mergeObjects(local = {}, remote = {}) {
  const result = structuredClone(remote);
  for (const [key, value] of Object.entries(local)) {
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      result[key] &&
      typeof result[key] === "object" &&
      !Array.isArray(result[key])
    ) {
      result[key] = mergeObjects(value, result[key]);
    } else {
      result[key] = structuredClone(value);
    }
  }
  return result;
}

export function mergeState(local, remote) {
  const merged = mergeObjects(local, remote);
  const logMap = new Map();
  for (const item of [...(remote?.peanutLog || []), ...(local?.peanutLog || [])]) {
    const key = `${item.date || ""}|${item.title || ""}|${item.rating || ""}`;
    logMap.set(key, item);
  }
  merged.peanutLog = [...logMap.values()].sort((a, b) =>
    String(a.date || "").localeCompare(String(b.date || ""))
  );
  return merged;
}

export function latestUpdatedAt(rows = []) {
  let latestTime = 0;
  let latestValue = null;
  for (const row of rows) {
    const value = row?.updated_at;
    const time = Date.parse(value || "");
    if (Number.isFinite(time) && time > latestTime) {
      latestTime = time;
      latestValue = value;
    }
  }
  return latestValue;
}

export const GRADE_LABELS = {
  0: "学前", 1: "一年级", 2: "二年级", 3: "三年级",
  4: "四年级", 5: "五年级", 6: "六年级", 7: "七年级",
  8: "八年级", 9: "九年级", 10: "十年级", 11: "十一年级", 12: "十二年级",
};

export const GRADE_OPTIONS = Object.entries(GRADE_LABELS)
  .map(([v, label]) => `<option value="${v}">${label}</option>`)
  .join("");

export function gradeLabel(level) {
  return GRADE_LABELS[level] || "一年级";
}

export function gradeOptionsSelected(selected) {
  return Object.entries(GRADE_LABELS)
    .map(([v, label]) => `<option value="${v}"${Number(v) === selected ? " selected" : ""}>${label}</option>`)
    .join("");
}

export function buildMissingSequence({ start = 1, length = 20, missingIndex = 9 } = {}) {
  const safeLength = Math.max(2, Math.floor(Number(length) || 20));
  const safeStart = Math.max(1, Math.floor(Number(start) || 1));
  const safeMissingIndex = Math.min(
    safeLength - 1,
    Math.max(1, Math.floor(Number(missingIndex) || 1))
  );
  const answer = safeStart + safeMissingIndex;
  const values = Array.from({ length: safeLength }, (_, index) => {
    if (index === safeMissingIndex) return null;
    return safeStart + index;
  });
  return { answer, values };
}

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

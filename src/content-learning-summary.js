import { CONTENT_LEARNING_ACTIVITIES, listContentHistory } from "./content-learning.js";

const CATALOG_KEYS = { poem: "poems", book: "books" };

function emptyActivity(activityId) {
  return { activityId, itemCount: 0, occurrenceCount: 0, reviewCount: 0, dayCount: 0,
    firstDay: null, latestDay: null, items: [] };
}

/** Read-only facts: one activity/item per day, never exposure or inferred mastery. */
export function summarizeContentLearning(learning, { referenceDay, catalog } = {}) {
  if (typeof referenceDay !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(referenceDay) || referenceDay.startsWith("0000") ||
      !Number.isFinite(Date.parse(`${referenceDay}T00:00:00Z`)) ||
      new Date(`${referenceDay}T00:00:00Z`).toISOString().slice(0, 10) !== referenceDay) {
    throw new TypeError("Invalid summary reference day");
  }
  const facts = listContentHistory(learning).filter((entry) => !entry.revoked && entry.dayKey <= referenceDay);
  const activities = Object.fromEntries(CONTENT_LEARNING_ACTIVITIES.map((id) => [id, emptyActivity(id)]));
  const grouped = new Map();
  const days = new Set();
  for (const fact of facts) {
    days.add(fact.dayKey);
    const key = `${fact.activityId}\0${fact.itemId}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(fact);
  }
  for (const history of grouped.values()) {
    const first = history[0];
    const latest = history.at(-1);
    const activity = activities[first.activityId];
    activity.items.push({ itemId: first.itemId, activityId: first.activityId,
      count: history.length, reviewCount: history.length - 1,
      firstDay: first.dayKey, latestDay: latest.dayKey, feedback: latest.feedback,
      stage: history.length === 1 ? "first" : "revisited", history });
  }
  for (const activity of Object.values(activities)) {
    activity.items.sort((a, b) => b.latestDay.localeCompare(a.latestDay) || a.itemId.localeCompare(b.itemId));
    activity.itemCount = activity.items.length;
    activity.occurrenceCount = activity.items.reduce((sum, item) => sum + item.count, 0);
    activity.reviewCount = activity.items.reduce((sum, item) => sum + item.reviewCount, 0);
    const dates = activity.items.flatMap((item) => item.history.map((entry) => entry.dayKey));
    activity.dayCount = new Set(dates).size;
    const sortedDays = [...new Set(dates)].sort();
    activity.firstDay = sortedDays[0] || null;
    activity.latestDay = sortedDays.at(-1) || null;
    if (catalog) {
      const ids = new Set((catalog[CATALOG_KEYS[activity.activityId] || activity.activityId] || []).map((item) => item.id));
      activity.catalogCount = ids.size;
      activity.learnedCatalogCount = activity.items.filter((item) => ids.has(item.itemId)).length;
    }
  }
  const sortedDays = [...days].sort();
  return { dayCount: days.size, occurrenceCount: facts.length, itemCount: grouped.size,
    reviewCount: Object.values(activities).reduce((sum, activity) => sum + activity.reviewCount, 0),
    firstDay: sortedDays[0] || null, latestDay: sortedDays.at(-1) || null, activities };
}

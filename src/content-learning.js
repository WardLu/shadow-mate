export const CONTENT_LEARNING_STATE_KEY = "contentLearningV1";
export const CONTENT_LEARNING_ACTIVITIES = Object.freeze(["literacy", "poem", "english", "book", "writing"]);
export const CONTENT_LEARNING_LIMITS = Object.freeze({
  literacy: Object.freeze({ new: 2, review: 2, continue: 2, total: 4 }),
  poem: Object.freeze({ new: 1, review: 1, continue: 1, total: 1, newPerIsoWeek: 2 }),
  english: Object.freeze({ new: 2, review: 2, continue: 2, total: 4 }),
  book: Object.freeze({ new: 1, review: 1, continue: 1, total: 1 }),
  writing: Object.freeze({ rows: 4 }),
});

const MAX_PAYLOAD_BYTES = 550 * 1024;
const MAX_PLAN_CANDIDATES = 48;
const RETAINED_PLAN_DAYS = 90;
const INTERVALS = [1, 3, 7, 14, 30];
const FEEDBACK_VALUES = ["needs-help", "independent"];
const CATALOG_KEYS = { literacy: "literacy", poem: "poems", english: "english", book: "books", writing: "writing" };

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireString(value, label, maximum = 256) {
  if (typeof value !== "string" || !value.trim() || value.length > maximum) throw new TypeError(`Invalid ${label}`);
  return value;
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (!isRecord(value)) return JSON.stringify(value);
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
}

function stableHash(value) {
  let hash = 0x811c9dc5;
  for (const character of value) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function requireActivity(value) {
  if (!CONTENT_LEARNING_ACTIVITIES.includes(value)) throw new TypeError("Invalid activityId");
  return value;
}

function requireScope(value) {
  requireString(value, "learnerScope");
  if (value !== "anonymous" && !/^profile:\S+$/.test(value)) throw new TypeError("Invalid learnerScope");
  return value;
}

function dayOrdinal(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new TypeError("Invalid dayKey");
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value || value.startsWith("0000")) {
    throw new TypeError("Invalid dayKey");
  }
  return date.getTime() / 86400000;
}

function isoWeek(value) {
  const date = new Date(dayOrdinal(value) * 86400000);
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  return date.toISOString().slice(0, 10);
}

function requireTimestamp(value) {
  requireString(value, "completedAt", 64);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) ||
    !Number.isFinite(Date.parse(value))) throw new TypeError("Invalid completedAt");
  dayOrdinal(value.slice(0, 10));
  return new Date(value).toISOString();
}

function normalizeStamp(record) {
  const revision = record.revision ?? 0;
  if (!Number.isSafeInteger(revision) || revision < 0) throw new TypeError("Invalid revision");
  return { revision, deviceId: requireString(record.deviceId ?? "local", "deviceId") };
}

function compareStamp(left, right) {
  return left.revision - right.revision || compareText(left.deviceId, right.deviceId) || compareText(canonical(left), canonical(right));
}

function itemKey(record) {
  return `${record.activityId}\0${record.itemId}`;
}

function chooseStamped(left, right) {
  return compareStamp(left, right) >= 0 ? left : right;
}

function unionRecords(left, right, keyOf, choose) {
  const records = new Map();
  for (const record of [...left, ...right]) {
    const key = keyOf(record);
    records.set(key, records.has(key) ? choose(records.get(key), record) : record);
  }
  return [...records.entries()].sort(([a], [b]) => compareText(a, b)).map(([, record]) => record);
}

function chooseIntroduction(left, right) {
  return (compareText(left.firstPlannedDay, right.firstPlannedDay) || compareText(canonical(left), canonical(right))) <= 0
    ? left : right;
}

function chooseOccurrence(left, right) {
  const completion = chooseStamped(
    Object.fromEntries(Object.entries(left).filter(([key]) => key !== "revoked" && !key.startsWith("revocation"))),
    Object.fromEntries(Object.entries(right).filter(([key]) => key !== "revoked" && !key.startsWith("revocation"))),
  );
  const revocations = [left, right].filter((entry) => entry.revoked);
  if (!revocations.length) return { ...completion, revoked: false };
  const tombstone = revocations.sort((a, b) =>
    (a.revocationRevision ?? a.revision) - (b.revocationRevision ?? b.revision) ||
    compareText(a.revocationDeviceId ?? a.deviceId, b.revocationDeviceId ?? b.deviceId),
  ).at(-1);
  return { ...completion, revoked: true, revocationRevision: tombstone.revocationRevision ?? tombstone.revision,
    revocationDeviceId: tombstone.revocationDeviceId ?? tombstone.deviceId };
}

function normalizeItemRef(record) {
  if (!isRecord(record)) throw new TypeError("Invalid content learning record");
  return { activityId: requireActivity(record.activityId), itemId: requireString(record.itemId, "itemId") };
}

function normalizeIntroduction(record) {
  const item = normalizeItemRef(record);
  try {
    dayOrdinal(record.firstPlannedDay);
  } catch (_) {
    return null;
  }
  return { ...item, firstPlannedDay: record.firstPlannedDay };
}

export function contentLearningOccurrenceId(activityId, itemId, dayKey) {
  requireActivity(activityId);
  requireString(itemId, "itemId");
  dayOrdinal(dayKey);
  return `${activityId}:${encodeURIComponent(itemId)}:${dayKey}`;
}

function normalizeOccurrence(record) {
  const item = normalizeItemRef(record);
  const occurrenceId = contentLearningOccurrenceId(item.activityId, item.itemId, record.dayKey);
  if (record.occurrenceId !== occurrenceId) throw new TypeError("Invalid occurrenceId");
  return {
    ...item,
    occurrenceId,
    dayKey: record.dayKey,
    completedAt: requireTimestamp(record.completedAt),
    ...normalizeStamp(record),
    revoked: record.revoked === true,
    ...(record.revoked === true ? {
      revocationRevision: Number.isSafeInteger(record.revocationRevision) && record.revocationRevision >= 0
        ? record.revocationRevision : (Number.isSafeInteger(record.revision) && record.revision >= 0 ? record.revision : 0),
      revocationDeviceId: typeof record.revocationDeviceId === "string"
        ? requireString(record.revocationDeviceId, "revocationDeviceId") : requireString(record.deviceId ?? "local", "deviceId"),
    } : {}),
  };
}

function normalizeFeedback(record) {
  if (!isRecord(record) || !FEEDBACK_VALUES.includes(record.feedback)) throw new TypeError("Invalid feedback");
  return { occurrenceId: requireString(record.occurrenceId, "occurrenceId", 2048), feedback: record.feedback, ...normalizeStamp(record) };
}

function normalizeSkip(record) {
  if (typeof record?.skipped !== "boolean") throw new TypeError("Invalid skipped flag");
  return { ...normalizeItemRef(record), skipped: record.skipped, ...normalizeStamp(record) };
}

function normalizeActivities(value = CONTENT_LEARNING_ACTIVITIES) {
  if (!Array.isArray(value)) throw new TypeError("Invalid enabledActivities");
  return [...new Set(value.map(requireActivity))].sort(compareText);
}

function normalizeLimits(raw = {}) {
  if (!isRecord(raw)) throw new TypeError("Invalid limits");
  return Object.fromEntries(CONTENT_LEARNING_ACTIVITIES.map((activity) => {
    const defaults = CONTENT_LEARNING_LIMITS[activity];
    const overrides = raw[activity] ?? {};
    if (!isRecord(overrides)) throw new TypeError("Invalid activity limits");
    const limits = Object.fromEntries(Object.entries(defaults).map(([key, maximum]) => {
      const limit = overrides[key] ?? maximum;
      if (!Number.isInteger(limit) || limit < 0 || limit > maximum) throw new RangeError(`Invalid limit: ${activity}.${key}`);
      return [key, limit];
    }));
    return [activity, limits];
  }));
}

function planSignature(plan) {
  return canonical({ learnerScope: plan.learnerScope, packageId: plan.packageId, contentVersion: plan.contentVersion,
    enabledActivities: plan.enabledActivities, limits: plan.limits });
}

function normalizePlan(raw, learnerScope) {
  if (!isRecord(raw)) throw new TypeError("Invalid daily learning plan");
  dayOrdinal(raw.dayKey);
  const plan = {
    planId: requireString(raw.planId, "planId"),
    learnerScope: requireScope(raw.learnerScope),
    dayKey: raw.dayKey,
    packageId: requireString(raw.packageId, "packageId"),
    contentVersion: requireString(raw.contentVersion, "contentVersion"),
    enabledActivities: normalizeActivities(raw.enabledActivities),
    limits: normalizeLimits(raw.limits),
    activities: {},
  };
  if (learnerScope && plan.learnerScope !== learnerScope) throw new RangeError("Daily learning plan scope mismatch");
  for (const activity of CONTENT_LEARNING_ACTIVITIES) {
    const rows = raw.activities?.[activity];
    if (!Array.isArray(rows) || rows.length > 4) throw new TypeError("Invalid daily learning plan rows");
    if (!plan.enabledActivities.includes(activity) && rows.length) throw new TypeError("Disabled activity has plan rows");
    plan.activities[activity] = rows.map((row) => {
      const item = normalizeItemRef(row);
      if (item.activityId !== activity || !["new", "continue", "review"].includes(row.reason)) throw new TypeError("Invalid daily learning plan row");
      const occurrenceId = contentLearningOccurrenceId(activity, item.itemId, plan.dayKey);
      if (row.occurrenceId !== occurrenceId) throw new TypeError("Invalid plan occurrenceId");
      return { ...item, occurrenceId, reason: row.reason,
        ...(row.optional === true ? { optional: true } : {}),
        ...(row.role !== undefined ? { role: requireString(row.role, "writing role", 128) } : {}) };
    });
    if (new Set(plan.activities[activity].map((row) => row.itemId)).size !== rows.length) throw new TypeError("Duplicate plan items");
  }
  return plan;
}

function normalizeArray(source, key, normalizer) {
  if (source[key] === undefined) return [];
  if (!Array.isArray(source[key])) throw new TypeError(`Invalid ${key}`);
  return source[key].map(normalizer).filter(Boolean);
}

function mergePlans(left, right, learnerScope, referenceDay) {
  const plans = {};
  for (const source of [left, right]) {
    if (source === undefined) continue;
    if (!isRecord(source)) throw new TypeError("Invalid plans");
    for (const [day, record] of Object.entries(source)) {
      dayOrdinal(day);
      if (!isRecord(record?.candidates)) throw new TypeError("Invalid plan candidates");
      const retained = !referenceDay || dayOrdinal(referenceDay) - dayOrdinal(day) < RETAINED_PLAN_DAYS;
      if (retained) plans[day] ||= { candidates: {} };
      for (const rawPlan of Object.values(record.candidates)) {
        const plan = normalizePlan(rawPlan, learnerScope);
        if (day !== plan.dayKey) throw new TypeError("Plan day mismatch");
        if (!retained) continue;
        const previous = plans[day].candidates[plan.planId];
        plans[day].candidates[plan.planId] = previous && canonical(previous) < canonical(plan) ? previous : plan;
      }
      if (retained && Object.keys(plans[day].candidates).length > MAX_PLAN_CANDIDATES) throw new RangeError("Daily plan candidate limit exceeded");
    }
  }
  return Object.fromEntries(Object.keys(plans).sort(compareText).map((day) => {
    const candidates = Object.fromEntries(Object.entries(plans[day].candidates).sort(([a], [b]) => compareText(a, b)));
    return [day, { canonicalPlanId: Object.keys(candidates)[0] ?? null, candidates }];
  }));
}

function ensureBudget(learning) {
  const byteLength = (value) => new TextEncoder().encode(JSON.stringify(value)).length;
  let bytes = byteLength(learning);
  if (bytes < MAX_PAYLOAD_BYTES) return learning;
  const plans = { ...learning.plans };
  const days = Object.keys(plans).sort(compareText);
  for (const day of days.slice(0, -1)) {
    // Remove only old snapshots. Their exposure facts and occurrence tombstones live outside plans.
    bytes -= byteLength(day) + 1 + byteLength(plans[day]) + 1;
    delete plans[day];
    if (bytes < MAX_PAYLOAD_BYTES) return { ...learning, plans };
  }
  throw new RangeError("Content learning ledger exceeds the 550 KiB payload budget; no learning facts were removed");
}

export function hasContentLearningData(raw) {
  return isRecord(raw) && ["introductions", "occurrences", "feedback", "skips"]
    .some((key) => Array.isArray(raw[key]) && raw[key].length > 0);
}

export function normalizeContentLearning(raw, expectedScope) {
  if (raw != null && !isRecord(raw)) throw new TypeError("Invalid content learning ledger");
  const source = raw ?? {};
  if (source.schemaVersion !== undefined && source.schemaVersion !== 1) throw new RangeError("Unsupported content learning ledger version");
  if (!source.learnerScope && (hasContentLearningData(source) || (isRecord(source.plans) && Object.keys(source.plans).length > 0))) {
    throw new TypeError("Content learning data has no learnerScope");
  }
  const learnerScope = requireScope(source.learnerScope ?? expectedScope ?? "anonymous");
  if (expectedScope !== undefined && requireScope(expectedScope) !== learnerScope) throw new RangeError("Content learning ledger scope mismatch");
  const introductions = unionRecords(normalizeArray(source, "introductions", normalizeIntroduction), [], itemKey, chooseIntroduction);
  const occurrences = unionRecords(normalizeArray(source, "occurrences", normalizeOccurrence), [], (entry) => entry.occurrenceId, chooseOccurrence);
  const feedback = unionRecords(normalizeArray(source, "feedback", normalizeFeedback), [], (entry) => entry.occurrenceId, chooseStamped);
  const skips = unionRecords(normalizeArray(source, "skips", normalizeSkip), [], itemKey, chooseStamped);
  if (source.referenceDay !== undefined) dayOrdinal(source.referenceDay);
  const referenceDay = [source.referenceDay, ...introductions.map((entry) => entry.firstPlannedDay), ...occurrences.map((entry) => entry.dayKey),
    ...Object.keys(source.plans ?? {})].filter(Boolean).sort(compareText).at(-1);
  const plans = mergePlans(source.plans, undefined, learnerScope, referenceDay);
  return ensureBudget({ schemaVersion: 1, learnerScope, introductions, occurrences, feedback, skips, plans,
    ...(referenceDay ? { referenceDay } : {}) });
}

export function migrateAnonymousContentLearning(learning, learnerScope) {
  const targetScope = requireScope(learnerScope);
  if (targetScope === "anonymous") throw new RangeError("Anonymous content learning migration requires a profile scope");
  const source = normalizeContentLearning(learning, "anonymous");
  const plans = {};
  for (const [dayKey, day] of Object.entries(source.plans)) {
    const candidates = {};
    for (const plan of Object.values(day.candidates)) {
      const migrated = { ...structuredClone(plan), learnerScope: targetScope };
      delete migrated.planId;
      const signature = canonical(migrated);
      migrated.planId = `plan-${stableHash(signature).toString(36)}-${stableHash(`${signature}\0content-plan-v1`).toString(36)}`;
      candidates[migrated.planId] = migrated;
    }
    plans[dayKey] = { canonicalPlanId: Object.keys(candidates).sort(compareText)[0] ?? null, candidates };
  }
  return normalizeContentLearning({ ...source, learnerScope: targetScope, plans }, targetScope);
}

export function mergeContentLearning(left, right) {
  if (left == null) return normalizeContentLearning(right);
  if (right == null) return normalizeContentLearning(left);
  const a = normalizeContentLearning(left);
  const b = normalizeContentLearning(right, a.learnerScope);
  const referenceDay = [a.referenceDay, b.referenceDay].filter(Boolean).sort(compareText).at(-1);
  return normalizeContentLearning({
    schemaVersion: 1,
    learnerScope: a.learnerScope,
    introductions: unionRecords(a.introductions, b.introductions, itemKey, chooseIntroduction),
    occurrences: unionRecords(a.occurrences, b.occurrences, (entry) => entry.occurrenceId, chooseOccurrence),
    feedback: unionRecords(a.feedback, b.feedback, (entry) => entry.occurrenceId, chooseStamped),
    skips: unionRecords(a.skips, b.skips, itemKey, chooseStamped),
    plans: mergePlans(a.plans, b.plans, a.learnerScope, referenceDay),
    ...(referenceDay ? { referenceDay } : {}),
  });
}

function buildContext(learning) {
  const priorPlanIndexes = new Map();
  for (const day of Object.keys(learning?.plans ?? {}).sort(compareText)) {
    const candidates = Object.values(learning.plans[day]?.candidates ?? {});
    for (const p of candidates) {
      for (const [act, rows] of Object.entries(p?.activities ?? {})) {
        if (Array.isArray(rows)) {
          rows.forEach((row, idx) => {
            priorPlanIndexes.set(itemKey({ activityId: act, itemId: row.itemId }), idx);
          });
        }
      }
    }
  }
  const context = { introductions: new Map(learning.introductions.map((entry) => [itemKey(entry), entry.firstPlannedDay])),
    introductionIndexes: new Map(learning.introductions.map((entry, index) => [itemKey(entry), index])),
    priorPlanIndexes,
    feedback: new Map(learning.feedback.map((entry) => [entry.occurrenceId, entry.feedback])),
    skips: new Map(learning.skips.map((entry) => [itemKey(entry), entry.skipped])), histories: new Map() };
  for (const occurrence of learning.occurrences) {
    if (occurrence.revoked) continue;
    const key = itemKey(occurrence);
    if (!context.histories.has(key)) context.histories.set(key, []);
    context.histories.get(key).push(occurrence);
  }
  for (const history of context.histories.values()) history.sort((a, b) => compareText(a.dayKey, b.dayKey));
  return context;
}

function classifyItem(activityId, item, dayKey, context) {
  const key = itemKey({ activityId, itemId: item.id });
  if (item.excluded === true || context.skips.get(key) === true) return null;
  const history = (context.histories.get(key) ?? []).filter((entry) => entry.dayKey <= dayKey);
  if (activityId === "book" && [item.read, item.isRead, item.completed].some((flag) => flag === true)) return null;
  const firstPlannedDay = context.introductions.get(key);
  const firstPlannedIndex = context.introductionIndexes.get(key);
  const priorPlanIndex = context.priorPlanIndexes.get(key);
  if (!history.length) return { reason: firstPlannedDay ? "continue" : "new", firstPlannedDay, firstPlannedIndex, priorPlanIndex, item };
  let interval = -1;
  for (const occurrence of history) {
    interval = context.feedback.get(occurrence.occurrenceId) === "needs-help" ? 0 : Math.min(interval + 1, INTERVALS.length - 1);
  }
  const latest = history.at(-1);
  const due = dayOrdinal(latest.dayKey) + INTERVALS[interval];
  return dayOrdinal(dayKey) >= due ? { reason: "review", due, item, firstPlannedDay } : null;
}

function sortCandidates(left, right) {
  const priority = { review: 0, continue: 1, new: 2 };
  return priority[left.reason] - priority[right.reason] ||
    (left.reason === "review" ? left.due - right.due : 0) ||
    (left.reason === "continue" ? compareText(left.firstPlannedDay, right.firstPlannedDay) : 0) ||
    (left.reason === "continue" && left.priorPlanIndex !== undefined && right.priorPlanIndex !== undefined
      ? left.priorPlanIndex - right.priorPlanIndex : 0) ||
    (left.reason === "continue" && left.firstPlannedIndex !== undefined && right.firstPlannedIndex !== undefined
      ? left.firstPlannedIndex - right.firstPlannedIndex : 0) ||
    left.item.order - right.item.order ||
    (left.item.strokeCount ?? Infinity) - (right.item.strokeCount ?? Infinity) ||
    compareText(left.item.id, right.item.id);
}

function normalizeCatalog(raw) {
  if (!isRecord(raw)) throw new TypeError("Invalid content catalog");
  const catalog = { version: requireString(raw.version, "catalog.version") };
  for (const activity of CONTENT_LEARNING_ACTIVITIES) {
    const items = raw[CATALOG_KEYS[activity]] ?? [];
    if (!Array.isArray(items) || items.length > 4096) throw new RangeError("Invalid catalog items");
    const ids = new Set();
    catalog[activity] = items.map((item, index) => {
      if (!isRecord(item)) throw new TypeError("Invalid catalog item");
      const id = requireString(item.id, "catalog item id");
      if (ids.has(id)) throw new TypeError("Duplicate catalog item id");
      ids.add(id);
      return { ...item, id, order: Number.isFinite(item.order) ? item.order : index,
        strokeCount: item.strokeCount ?? item.writing?.strokeCount };
    });
  }
  return catalog;
}

function selectRows(activity, candidates, limits, weeklyNewPoems, exposedGlyphs = new Set()) {
  if (activity === "writing") {
    if (limits.rows === 0) return [];
    const selected = [];
    const roles = new Set();
    const add = (candidate) => {
      const role = candidate.item.role ?? candidate.item.id;
      if (roles.has(role)) return;
      roles.add(role);
      selected.push(candidate);
    };
    for (const candidate of candidates) {
      if (candidate.reason === "new" && !exposedGlyphs.has(candidate.item.glyph)) continue;
      add(candidate);
      if (selected.length >= limits.rows) return selected;
    }
    return selected;
  }
  const continues = candidates.filter((entry) => entry.reason === "continue");
  const reviews = candidates.filter((entry) => entry.reason === "review");
  const newItems = candidates.filter((entry) => entry.reason === "new");
  const selected = reviews.slice(0, Math.min(limits.review, limits.total));
  selected.push(...continues.slice(0, Math.min(limits.continue, limits.total - selected.length)));
  const selectedReviews = selected.filter((entry) => entry.reason === "review").length;
  const backlog = Math.max(0, reviews.length - selectedReviews);
  const selectedContinues = selected.filter((entry) => entry.reason === "continue").length;
  const outstandingContinues = Math.max(0, continues.length - selectedContinues);
  const freshContentBudget = backlog || outstandingContinues
    ? 0
    : Math.max(0, limits.new - selectedContinues);
  const newLimit = Math.max(0, Math.min(freshContentBudget, limits.total - selected.length,
    activity === "poem" ? limits.newPerIsoWeek - weeklyNewPoems : limits.new));
  selected.push(...newItems.slice(0, newLimit));
  return selected;
}

export function resolveDailyLearningPlan({ learning, learnerScope, dayKey, packageId, catalog,
  enabledActivities = CONTENT_LEARNING_ACTIVITIES, deviceId = "local", limits } = {}) {
  requireScope(learnerScope);
  requireString(packageId, "packageId");
  requireString(deviceId, "deviceId");
  dayOrdinal(dayKey);
  const nextLearning = normalizeContentLearning(learning, learnerScope);
  const content = normalizeCatalog(catalog);
  const enabled = normalizeActivities(enabledActivities);
  const resolvedLimits = normalizeLimits(limits);
  const plan = { learnerScope, dayKey, packageId, contentVersion: content.version, enabledActivities: enabled,
    limits: resolvedLimits, activities: Object.fromEntries(CONTENT_LEARNING_ACTIVITIES.map((activity) => [activity, []])) };
  const saved = Object.values(nextLearning.plans[dayKey]?.candidates ?? {})
    .filter((candidate) => planSignature(candidate) === planSignature(plan)).sort((a, b) => compareText(a.planId, b.planId))[0];
  if (saved) return { plan: structuredClone(saved), nextLearning };
  if (!enabled.length) {
    plan.planId = `plan-${stableHash(canonical(plan)).toString(36)}`;
    return { plan, nextLearning };
  }
  const context = buildContext(nextLearning);
  const weeklyNewPoems = nextLearning.introductions.filter((entry) => entry.activityId === "poem" &&
    isoWeek(entry.firstPlannedDay) === isoWeek(dayKey)).length;
  for (const activity of enabled) {
    const exposedGlyphs = activity === "writing"
      ? new Set(content.literacy.filter((item) => context.introductions.has(itemKey({ activityId: "literacy", itemId: item.id })))
        .map((item) => item.glyph).filter((glyph) => typeof glyph === "string" && glyph.length > 0))
      : new Set();
    const candidates = content[activity].map((item) => classifyItem(activity, item, dayKey, context)).filter(Boolean).sort(sortCandidates);
    const selected = selectRows(activity, candidates, resolvedLimits[activity], weeklyNewPoems, exposedGlyphs);
    plan.activities[activity] = selected.map(({ item, reason }) => {
      const key = itemKey({ activityId: activity, itemId: item.id });
      if (!context.introductions.has(key)) {
        nextLearning.introductions.push({ activityId: activity, itemId: item.id, firstPlannedDay: dayKey });
        context.introductions.set(key, dayKey);
      }
      return { activityId: activity, itemId: item.id, occurrenceId: contentLearningOccurrenceId(activity, item.id, dayKey), reason,
        ...(activity === "writing" ? { role: item.role ?? item.id, ...((item.optional === true || reason === "new") ? { optional: true } : {}) } : {}) };
    });
  }
  plan.planId = `plan-${stableHash(canonical(plan)).toString(36)}-${stableHash(`${canonical(plan)}\0content-plan-v1`).toString(36)}`;
  nextLearning.plans[dayKey] ||= { candidates: {} };
  nextLearning.plans[dayKey].candidates[plan.planId] = plan;
  nextLearning.referenceDay = [nextLearning.referenceDay, dayKey].filter(Boolean).sort(compareText).at(-1);
  return { plan: structuredClone(plan), nextLearning: normalizeContentLearning(nextLearning, learnerScope) };
}

function nextRevision(records, key, keyOf) {
  return records.filter((entry) => keyOf(entry) === key).reduce((maximum, entry) => Math.max(maximum, entry.revision), -1) + 1;
}

export function recordContentCompletion({ learning, plan, activityId, itemId, dayKey, deviceId = "local", feedback, completedAt } = {}) {
  requireActivity(activityId);
  requireString(deviceId, "deviceId");
  dayOrdinal(dayKey);
  const next = normalizeContentLearning(learning);
  const snapshot = normalizePlan(plan, next.learnerScope);
  const rows = snapshot.activities[activityId].filter((row) => itemId === undefined || row.itemId === itemId);
  if (rows.length !== 1) throw new RangeError("Completion requires one item from the selected daily plan");
  const selected = rows[0];
  if (next.skips.some((entry) => itemKey(entry) === itemKey(selected) && entry.skipped)) {
    throw new RangeError("A skipped item cannot be completed");
  }
  const occurrenceId = contentLearningOccurrenceId(activityId, selected.itemId, dayKey);
  const previous = next.occurrences.find((entry) => entry.occurrenceId === occurrenceId);
  if (previous?.revoked) throw new RangeError("A revoked completion cannot be recreated for the same learning day");
  if (feedback !== undefined && !FEEDBACK_VALUES.includes(feedback)) throw new TypeError("Invalid feedback");
  if (!previous) {
    next.occurrences.push({ occurrenceId, activityId, itemId: selected.itemId, dayKey,
      completedAt: requireTimestamp(completedAt ?? `${dayKey}T00:00:00.000Z`), revision: 0, deviceId, revoked: false });
    if (!next.introductions.some((entry) => itemKey(entry) === itemKey(selected))) {
      next.introductions.push({ activityId, itemId: selected.itemId, firstPlannedDay: snapshot.dayKey });
    }
  }
  next.referenceDay = [next.referenceDay, dayKey].filter(Boolean).sort(compareText).at(-1);
  return feedback !== undefined ? setContentFeedback({ learning: next, occurrenceId, feedback, deviceId }) : normalizeContentLearning(next);
}

export function recordManualContentCompletion({ learning, learnerScope, activityId, itemId, dayKey,
  deviceId = "local", completedAt } = {}) {
  requireScope(learnerScope);
  requireActivity(activityId);
  requireString(itemId, "itemId");
  requireString(deviceId, "deviceId");
  dayOrdinal(dayKey);
  const next = normalizeContentLearning(learning, learnerScope);
  const key = itemKey({ activityId, itemId });
  if (next.skips.some((entry) => itemKey(entry) === key && entry.skipped)) {
    throw new RangeError("A skipped item cannot be completed manually");
  }
  const occurrenceId = contentLearningOccurrenceId(activityId, itemId, dayKey);
  const previous = next.occurrences.find((entry) => entry.occurrenceId === occurrenceId);
  if (previous?.revoked) throw new RangeError("A revoked completion cannot be recreated for the same learning day");
  if (!previous) {
    next.occurrences.push({ occurrenceId, activityId, itemId, dayKey,
      completedAt: requireTimestamp(completedAt ?? `${dayKey}T00:00:00.000Z`), revision: 0, deviceId, revoked: false });
  }
  if (!next.introductions.some((entry) => itemKey(entry) === key)) {
    next.introductions.push({ activityId, itemId, firstPlannedDay: dayKey });
  }
  next.referenceDay = [next.referenceDay, dayKey].filter(Boolean).sort(compareText).at(-1);
  return normalizeContentLearning(next, learnerScope);
}

export function setContentFeedback({ learning, occurrenceId, feedback, deviceId = "local" } = {}) {
  requireString(occurrenceId, "occurrenceId", 2048);
  requireString(deviceId, "deviceId");
  if (!FEEDBACK_VALUES.includes(feedback)) throw new TypeError("Invalid feedback");
  const next = normalizeContentLearning(learning);
  if (!next.occurrences.some((entry) => entry.occurrenceId === occurrenceId && !entry.revoked)) throw new RangeError("Feedback requires a current completion");
  const previous = next.feedback.find((entry) => entry.occurrenceId === occurrenceId);
  if (previous?.feedback === feedback) return next;
  const revision = nextRevision(next.feedback, occurrenceId, (entry) => entry.occurrenceId);
  next.feedback = next.feedback.filter((entry) => entry.occurrenceId !== occurrenceId);
  next.feedback.push({ occurrenceId, feedback, revision, deviceId });
  return normalizeContentLearning(next);
}

export function revokeContentCompletion({ learning, occurrenceId, deviceId = "local" } = {}) {
  requireString(occurrenceId, "occurrenceId", 2048);
  requireString(deviceId, "deviceId");
  const next = normalizeContentLearning(learning);
  const occurrence = next.occurrences.find((entry) => entry.occurrenceId === occurrenceId);
  if (!occurrence) throw new RangeError("Completion occurrence was not found");
  if (occurrence.revoked) return next;
  const revision = occurrence.revocationRevision === undefined ? occurrence.revision : occurrence.revocationRevision;
  occurrence.revoked = true;
  occurrence.revocationRevision = revision + 1;
  occurrence.revocationDeviceId = deviceId;
  return normalizeContentLearning(next);
}

export function skipContentItem({ learning, activityId, itemId, deviceId = "local", skipped = true } = {}) {
  requireActivity(activityId);
  requireString(itemId, "itemId");
  requireString(deviceId, "deviceId");
  if (typeof skipped !== "boolean") throw new TypeError("Invalid skipped flag");
  const next = normalizeContentLearning(learning);
  const key = itemKey({ activityId, itemId });
  const previous = next.skips.find((entry) => itemKey(entry) === key);
  if (previous?.skipped === skipped) return next;
  const revision = nextRevision(next.skips, key, itemKey);
  next.skips = next.skips.filter((entry) => itemKey(entry) !== key);
  next.skips.push({ activityId, itemId, skipped, revision, deviceId });
  return normalizeContentLearning(next);
}

export function listContentHistory(learning, activityId) {
  if (activityId !== undefined) requireActivity(activityId);
  const normalized = normalizeContentLearning(learning);
  const feedback = new Map(normalized.feedback.map((entry) => [entry.occurrenceId, entry.feedback]));
  return normalized.occurrences.filter((entry) => activityId === undefined || entry.activityId === activityId)
    .map((entry) => ({ ...structuredClone(entry), feedback: feedback.get(entry.occurrenceId) ?? null }))
    .sort((a, b) => compareText(a.dayKey, b.dayKey) || compareText(a.activityId, b.activityId) || compareText(a.itemId, b.itemId));
}

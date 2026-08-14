export const GROWTH_LOOP_SCHEMA_VERSION = 1;

export const recommendedPointItems = [
  { name: "一起做家务", description: "收拾 / 洗碗", default_points: 2, category: "family", icon_key: "house" },
  { name: "认真完成学习", description: "完成约定的学习时间", default_points: 3, category: "learning", icon_key: "bookCheck" },
  { name: "帮助家人", description: "主动帮助弟弟或家人", default_points: 2, category: "family", icon_key: "learner" },
  { name: "古诗词跟读", description: "完成一次跟读", default_points: 3, category: "learning", icon_key: "bookMarked" },
  { name: "撒谎", description: "需要和家长一起复盘", default_points: -10, category: "growth", icon_key: "circleX" },
  { name: "不爱护身体", description: "需要温和提醒", default_points: -2, category: "growth", icon_key: "alert" },
  { name: "不收玩具", description: "完成整理后再记录", default_points: -3, category: "family", icon_key: "eraser" },
];

export const recommendedRewards = [
  { name: "一起去公园", description: "和家长安排一次户外时间", cost_points: 10, category: "activity", icon_key: "trees" },
  { name: "选择今晚的绘本", description: "由孩子选择睡前故事", cost_points: 6, category: "family", icon_key: "book" },
  { name: "亲子游戏 20 分钟", description: "安排一段专属亲子时间", cost_points: 15, category: "activity", icon_key: "party" },
];

let fallbackId = 0;

function createId(prefix = "growth") {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  fallbackId += 1;
  return `${prefix}-${Date.now()}-${fallbackId}`;
}

function clone(value) {
  return structuredClone(value);
}

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeScope(scope = {}) {
  return {
    household_id: scope.household_id ?? scope.householdId ?? null,
    profile_id: scope.profile_id ?? scope.profileId ?? null,
  };
}

function scopeKey(scope = {}) {
  const normalized = normalizeScope(scope);
  return `${normalized.household_id || "pending"}:${normalized.profile_id || "pending"}`;
}

function normalizePointItem(item = {}) {
  const defaultPoints = Number(item.default_points ?? item.pts ?? 0);
  return {
    id: item.id || createId("point-item"),
    household_id: item.household_id ?? null,
    name: String(item.name || "未命名项目").slice(0, 60),
    description: item.description ?? item.desc ?? null,
    default_points: Number.isFinite(defaultPoints) && defaultPoints !== 0 ? Math.max(-1000, Math.min(1000, defaultPoints)) : 1,
    item_kind: item.item_kind || "custom",
    category: item.category || "growth",
    icon_key: item.icon_key || "star",
    is_active: item.is_active !== false,
    source: item.source || "local",
  };
}

function normalizeReward(reward = {}) {
  const cost = Number(reward.cost_points ?? reward.cost ?? 1);
  return {
    id: reward.id || createId("reward"),
    household_id: reward.household_id ?? null,
    name: String(reward.name || "未命名奖励").slice(0, 60),
    description: reward.description ?? null,
    cost_points: Number.isFinite(cost) && cost > 0 ? Math.min(100000, Math.trunc(cost)) : 1,
    reward_kind: reward.reward_kind || "custom",
    category: reward.category || "family",
    icon_key: reward.icon_key || "gift",
    is_active: reward.is_active !== false,
    source: reward.source || "local",
  };
}

function activeLedgerEntries(snapshot) {
  return (snapshot.ledger || []).filter((entry) => !["rejected", "conflict"].includes(entry.status));
}

function latestCreated(entries) {
  return entries.slice().sort((left, right) => String(left.created_at || "").localeCompare(String(right.created_at || ""))).at(-1);
}

function resolvePointItem(snapshot, pointItemId) {
  return snapshot.point_items.find((item) => item.id === pointItemId) || null;
}

function resolvePointValue(snapshot, profileId, pointItemId) {
  const item = resolvePointItem(snapshot, pointItemId);
  const binding = snapshot.profile_point_items.find(
    (entry) => entry.profile_id === profileId && entry.point_item_id === pointItemId,
  );
  return Number(binding?.points_override ?? item?.default_points ?? 0);
}

function addUniqueById(rows, row) {
  const index = rows.findIndex((item) => item.id === row.id);
  if (index === -1) rows.push(row);
  else rows[index] = { ...rows[index], ...row };
}

function localEvent({ type, scope, request_id, payload, depends_on = [] }) {
  return {
    event_id: request_id || createId("event"),
    request_id: request_id || null,
    scope_key: scopeKey(scope),
    household_id: normalizeScope(scope).household_id,
    profile_id: normalizeScope(scope).profile_id,
    schema_version: GROWTH_LOOP_SCHEMA_VERSION,
    type,
    payload: clone(payload || {}),
    depends_on: [...depends_on],
    created_at: new Date().toISOString(),
  };
}

function normalizeLedgerEntry(entry, scope) {
  const normalizedScope = normalizeScope(scope);
  return {
    id: entry.id || createId("ledger"),
    household_id: entry.household_id ?? normalizedScope.household_id,
    profile_id: entry.profile_id ?? normalizedScope.profile_id,
    point_item_id: entry.point_item_id ?? null,
    delta: Number(entry.delta || 0),
    entry_type: entry.entry_type || "manual",
    item_name_snapshot: String(entry.item_name_snapshot || "积分调整").slice(0, 60),
    note: entry.note ?? null,
    request_id: entry.request_id || createId("request"),
    occurred_on: entry.occurred_on || new Date().toISOString().slice(0, 10),
    created_at: entry.created_at || new Date().toISOString(),
    status: entry.status || "confirmed",
    metadata: isRecord(entry.metadata) ? clone(entry.metadata) : {},
    redemption_id: entry.redemption_id ?? null,
  };
}

export function createGrowthLoopState(scope = {}) {
  return {
    schema_version: GROWTH_LOOP_SCHEMA_VERSION,
    scope: normalizeScope(scope),
    point_items: [],
    profile_point_items: [],
    rewards: [],
    profile_rewards: [],
    ledger: [],
    redemptions: [],
    sync: {
      last_server_sync_at: null,
      blocked: false,
    },
  };
}

export function normalizeGrowthLoopState(input = {}, scope = input.scope || {}) {
  const base = createGrowthLoopState(scope);
  const source = isRecord(input) ? input : {};
  return {
    ...base,
    ...clone(source),
    schema_version: GROWTH_LOOP_SCHEMA_VERSION,
    scope: normalizeScope(source.scope || scope),
    point_items: Array.isArray(source.point_items) ? source.point_items.map(normalizePointItem) : [],
    profile_point_items: Array.isArray(source.profile_point_items) ? clone(source.profile_point_items) : [],
    rewards: Array.isArray(source.rewards) ? source.rewards.map(normalizeReward) : [],
    profile_rewards: Array.isArray(source.profile_rewards) ? clone(source.profile_rewards) : [],
    ledger: Array.isArray(source.ledger) ? source.ledger.map((entry) => normalizeLedgerEntry(entry, scope)) : [],
    redemptions: Array.isArray(source.redemptions) ? clone(source.redemptions) : [],
    sync: { ...base.sync, ...(isRecord(source.sync) ? clone(source.sync) : {}) },
  };
}

export function getBalance(snapshot) {
  return activeLedgerEntries(snapshot).reduce((total, entry) => total + Number(entry.delta || 0), 0);
}

export function getActivePointAction(snapshot, pointItemId, occurredOn) {
  const entries = activeLedgerEntries(snapshot).filter(
    (entry) => entry.point_item_id === pointItemId && entry.occurred_on === occurredOn,
  );
  return entries.reduce((total, entry) => total + Number(entry.delta || 0), 0) !== 0;
}

export function getPointDayTotal(snapshot, occurredOn) {
  return activeLedgerEntries(snapshot)
    .filter((entry) => entry.occurred_on === occurredOn)
    .reduce((total, entry) => total + Number(entry.delta || 0), 0);
}

export function getPointItemTotal(snapshot, pointItemId) {
  return activeLedgerEntries(snapshot)
    .filter((entry) => entry.point_item_id === pointItemId)
    .reduce((total, entry) => total + Number(entry.delta || 0), 0);
}

export function getPointPeriodTotal(snapshot, pointItemId, periodKey) {
  const prefix = String(periodKey || "");
  return activeLedgerEntries(snapshot)
    .filter((entry) => entry.point_item_id === pointItemId && String(entry.occurred_on || "").startsWith(prefix))
    .reduce((total, entry) => total + Number(entry.delta || 0), 0);
}

function ensurePointItem(snapshot, scope, item) {
  const normalizedScope = normalizeScope(scope);
  const pointItem = normalizePointItem({ ...item, household_id: item.household_id ?? normalizedScope.household_id });
  const isNew = !snapshot.point_items.some((row) => row.id === pointItem.id);
  addUniqueById(snapshot.point_items, pointItem);
  const binding = snapshot.profile_point_items.find(
    (row) => row.profile_id === normalizedScope.profile_id && row.point_item_id === pointItem.id,
  );
  const bindingIsNew = !binding;
  if (bindingIsNew) {
    snapshot.profile_point_items.push({
      household_id: normalizedScope.household_id,
      profile_id: normalizedScope.profile_id,
      point_item_id: pointItem.id,
      points_override: null,
      enabled: true,
      source: "local",
    });
  }
  return { pointItem, isNew, bindingIsNew };
}

function buildPointEvents(scope, pointItem, binding, ledgerEntry, requestId, dependencies = []) {
  const events = [];
  if (binding?.isNew) {
    events.push(localEvent({
      type: "point_item_upsert",
      scope,
      request_id: `${requestId}:item`,
      payload: { point_item: pointItem },
    }));
    if (binding.row) {
      events.push(localEvent({
        type: "profile_point_item_upsert",
        scope,
        request_id: `${requestId}:binding`,
        depends_on: [`${requestId}:item`],
        payload: { profile_point_item: binding.row },
      }));
      dependencies = [...dependencies, `${requestId}:binding`];
    }
  }
  events.push(localEvent({
    type: "point_record",
    scope,
    request_id: requestId,
    depends_on: dependencies,
    payload: {
      profile_id: ledgerEntry.profile_id,
      point_item_id: ledgerEntry.point_item_id,
      delta: ledgerEntry.delta,
      entry_type: ledgerEntry.entry_type,
      note: ledgerEntry.note,
      item_name_snapshot: ledgerEntry.item_name_snapshot,
      occurred_on: ledgerEntry.occurred_on,
    },
  }));
  return events;
}

function buildDefinitionEvents(scope, definition, binding, requestId, definitionType) {
  const events = [];
  if (definitionType === "point_item") {
    events.push(localEvent({
      type: "point_item_upsert",
      scope,
      request_id: `${requestId}:item`,
      payload: { point_item: definition },
    }));
    if (binding) {
      events.push(localEvent({
        type: "profile_point_item_upsert",
        scope,
        request_id: `${requestId}:binding`,
        depends_on: [`${requestId}:item`],
        payload: { profile_point_item: binding },
      }));
    }
  }
  return events;
}

export function applyPointItemCreation(current, { scope = current.scope, item, request_id = createId("point-item") }) {
  const snapshot = normalizeGrowthLoopState(current, scope);
  const normalizedScope = normalizeScope(scope);
  const ensured = ensurePointItem(snapshot, normalizedScope, item);
  const binding = snapshot.profile_point_items.find(
    (row) => row.profile_id === normalizedScope.profile_id && row.point_item_id === ensured.pointItem.id,
  );
  return {
    snapshot,
    item: ensured.pointItem,
    events: ensured.isNew
      ? buildDefinitionEvents(normalizedScope, ensured.pointItem, binding, request_id, "point_item")
      : [],
  };
}

export function applyPointAction(current, { scope = current.scope, item, occurred_on, request_id = createId("point") }) {
  const snapshot = normalizeGrowthLoopState(current, scope);
  const normalizedScope = normalizeScope(scope);
  const ensured = ensurePointItem(snapshot, normalizedScope, item);
  const pointItem = ensured.pointItem;
  const existingEntries = activeLedgerEntries(snapshot).filter(
    (entry) => entry.point_item_id === pointItem.id && entry.occurred_on === occurred_on,
  );
  const net = existingEntries.reduce((total, entry) => total + Number(entry.delta || 0), 0);
  const delta = net === 0
    ? resolvePointValue(snapshot, normalizedScope.profile_id, pointItem.id)
    : -net;
  const previous = latestCreated(existingEntries);
  const ledgerEntry = normalizeLedgerEntry({
    id: createId("ledger"),
    household_id: normalizedScope.household_id,
    profile_id: normalizedScope.profile_id,
    point_item_id: pointItem.id,
    delta,
    entry_type: net === 0 ? "manual" : "adjustment",
    item_name_snapshot: pointItem.name,
    note: net === 0 ? null : "撤销上一条本地记录",
    request_id,
    occurred_on,
    status: "pending",
    metadata: net === 0 ? {} : { undo_of: previous?.request_id || null },
  }, normalizedScope);
  snapshot.ledger.push(ledgerEntry);
  const binding = ensured.isNew
    ? {
        isNew: true,
        row: snapshot.profile_point_items.find(
          (row) => row.profile_id === normalizedScope.profile_id && row.point_item_id === pointItem.id,
        ),
      }
    : { isNew: false, row: null };
  return {
    snapshot,
    ledgerEntry,
    events: buildPointEvents(normalizedScope, pointItem, binding, ledgerEntry, request_id),
  };
}

export function closePointPeriod(current, { scope = current.scope, period_key, request_id = createId("period-close") }) {
  const snapshot = normalizeGrowthLoopState(current, scope);
  const normalizedScope = normalizeScope(scope);
  const grouped = new Map();
  for (const entry of activeLedgerEntries(snapshot)) {
    if (!entry.point_item_id || !String(entry.occurred_on || "").startsWith(String(period_key || ""))) continue;
    const key = `${entry.point_item_id}:${entry.occurred_on}`;
    const currentGroup = grouped.get(key) || { point_item_id: entry.point_item_id, occurred_on: entry.occurred_on, entries: [], net: 0 };
    currentGroup.entries.push(entry);
    currentGroup.net += Number(entry.delta || 0);
    grouped.set(key, currentGroup);
  }
  const events = [];
  for (const group of grouped.values()) {
    if (!group.net) continue;
    const item = resolvePointItem(snapshot, group.point_item_id);
    const entryRequestId = createId("period-entry");
    const ledgerEntry = normalizeLedgerEntry({
      id: createId("ledger"),
      household_id: normalizedScope.household_id,
      profile_id: normalizedScope.profile_id,
      point_item_id: group.point_item_id,
      delta: -group.net,
      entry_type: "adjustment",
      item_name_snapshot: item?.name || "积分周期调整",
      note: `结束 ${period_key} 积分周期`,
      request_id: entryRequestId,
      occurred_on: group.occurred_on,
      status: "pending",
      metadata: {
        period_close: period_key,
        undo_of: group.entries.at(-1)?.request_id || null,
      },
    }, normalizedScope);
    snapshot.ledger.push(ledgerEntry);
    events.push(localEvent({
      type: "point_record",
      scope: normalizedScope,
      request_id: entryRequestId,
      payload: {
        profile_id: normalizedScope.profile_id,
        point_item_id: group.point_item_id,
        delta: ledgerEntry.delta,
        entry_type: "adjustment",
        note: ledgerEntry.note,
        item_name_snapshot: ledgerEntry.item_name_snapshot,
        occurred_on: group.occurred_on,
      },
    }));
  }
  return { snapshot, events };
}

export function applyRewardCreation(current, { scope = current.scope, reward, request_id = createId("reward") }) {
  const snapshot = normalizeGrowthLoopState(current, scope);
  const normalizedScope = normalizeScope(scope);
  const normalizedReward = normalizeReward({ ...reward, household_id: reward.household_id ?? normalizedScope.household_id });
  const isNew = !snapshot.rewards.some((row) => row.id === normalizedReward.id);
  addUniqueById(snapshot.rewards, normalizedReward);
  if (!snapshot.profile_rewards.some((row) => row.profile_id === normalizedScope.profile_id && row.reward_id === normalizedReward.id)) {
    snapshot.profile_rewards.push({
      household_id: normalizedScope.household_id,
      profile_id: normalizedScope.profile_id,
      reward_id: normalizedReward.id,
      cost_override: null,
      enabled: true,
      source: "local",
    });
  }
  const events = [];
  if (isNew) {
    events.push(localEvent({ type: "reward_upsert", scope: normalizedScope, request_id: `${request_id}:reward`, payload: { reward: normalizedReward } }));
    events.push(localEvent({
      type: "profile_reward_upsert",
      scope: normalizedScope,
      request_id: `${request_id}:binding`,
      depends_on: [`${request_id}:reward`],
      payload: { profile_reward: snapshot.profile_rewards.at(-1) },
    }));
  }
  return { snapshot, reward: normalizedReward, events };
}

export function applyRedemption(current, { scope = current.scope, reward_id, request_id = createId("redemption") }) {
  const snapshot = normalizeGrowthLoopState(current, scope);
  const normalizedScope = normalizeScope(scope);
  const reward = snapshot.rewards.find((row) => row.id === reward_id);
  const profileReward = snapshot.profile_rewards.find(
    (row) => row.profile_id === normalizedScope.profile_id && row.reward_id === reward_id && row.enabled !== false,
  );
  if (!reward || !profileReward) return { snapshot, events: [], error: "reward_not_enabled" };
  const cost = Number(profileReward.cost_override ?? reward.cost_points);
  if (getBalance(snapshot) < cost) return { snapshot, events: [], error: "insufficient_points" };
  const redemption = {
    id: request_id,
    household_id: normalizedScope.household_id,
    profile_id: normalizedScope.profile_id,
    reward_id,
    reward_name_snapshot: reward.name,
    cost_points_snapshot: cost,
    status: "pending",
    request_id,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    source: "local",
  };
  snapshot.redemptions.push(redemption);
  snapshot.ledger.push(normalizeLedgerEntry({
    id: createId("ledger"),
    household_id: normalizedScope.household_id,
    profile_id: normalizedScope.profile_id,
    point_item_id: null,
    delta: -cost,
    entry_type: "redemption",
    item_name_snapshot: reward.name,
    note: "待联网确认的奖励兑换",
    request_id: `${request_id}:debit`,
    occurred_on: new Date().toISOString().slice(0, 10),
    status: "pending",
    redemption_id: request_id,
  }, normalizedScope));
  return {
    snapshot,
    redemption,
    events: [localEvent({
      type: "reward_redeem",
      scope: normalizedScope,
      request_id,
      payload: { profile_id: normalizedScope.profile_id, reward_id },
    })],
  };
}

export function mergeGrowthLoopSnapshot(remote, local) {
  const remoteSnapshot = normalizeGrowthLoopState(remote, remote?.scope || local?.scope || {});
  const localSnapshot = normalizeGrowthLoopState(local, remoteSnapshot.scope);
  const mergeRows = (remoteRows, localRows, keyFor = (row) => row.id) => {
    const rows = new Map((localRows || []).map((row) => [keyFor(row), row]));
    for (const row of remoteRows || []) rows.set(keyFor(row), row);
    return [...rows.values()];
  };
  const remoteRequests = new Set(remoteSnapshot.ledger.map((entry) => entry.request_id).filter(Boolean));
  const merged = {
    ...remoteSnapshot,
    point_items: mergeRows(remoteSnapshot.point_items, localSnapshot.point_items),
    profile_point_items: mergeRows(
      remoteSnapshot.profile_point_items,
      localSnapshot.profile_point_items,
      (row) => `${row.profile_id}:${row.point_item_id}`,
    ),
    rewards: mergeRows(remoteSnapshot.rewards, localSnapshot.rewards),
    profile_rewards: mergeRows(
      remoteSnapshot.profile_rewards,
      localSnapshot.profile_rewards,
      (row) => `${row.profile_id}:${row.reward_id}`,
    ),
    ledger: [
      ...remoteSnapshot.ledger,
      ...localSnapshot.ledger.filter((entry) => !remoteRequests.has(entry.request_id)),
    ],
    redemptions: mergeRows(
      remoteSnapshot.redemptions,
      localSnapshot.redemptions,
      (row) => row.request_id || row.id,
    ),
    sync: { ...remoteSnapshot.sync, ...(localSnapshot.sync || {}) },
  };
  return normalizeGrowthLoopState(merged, remoteSnapshot.scope);
}

export function scopeKeyForGrowthLoop(scope) {
  return scopeKey(scope);
}

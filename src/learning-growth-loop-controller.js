import {
  applyLegacyPointsImport,
  applyOpeningBalance,
  applyPointAction,
  applyPointItemCreation,
  applyRedemption,
  applyRewardCreation,
  closePointPeriod,
  createGrowthLoopState,
  getLegacyPointsImport,
  getOpeningBalance,
  mergeGrowthLoopSnapshot,
  normalizeGrowthLoopState,
  recommendedPointItems,
  recommendedRewards,
  scopeKeyForGrowthLoop,
} from "./learning-growth-loop.js";
import { buildActivityEvent } from "./learning-analytics.js";
import { createOutboxSync } from "./learning-growth-loop-sync.js";

function clone(value) {
  return structuredClone(value);
}

function createId() {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  return `growth-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function pendingStatuses() {
  return ["pending", "retryable", "conflict", "rejected"];
}

function rebindSnapshotScope(input, scope) {
  const next = normalizeGrowthLoopState(input, scope);
  next.scope = { ...scope };
  next.point_items = next.point_items.map((item) => ({
    ...item,
    household_id: item.household_id || scope.household_id,
  }));
  next.profile_point_items = next.profile_point_items.map((item) => ({
    ...item,
    household_id: item.household_id || scope.household_id,
    profile_id: item.profile_id || scope.profile_id,
  }));
  next.rewards = next.rewards.map((reward) => ({
    ...reward,
    household_id: reward.household_id || scope.household_id,
  }));
  next.profile_rewards = next.profile_rewards.map((reward) => ({
    ...reward,
    household_id: reward.household_id || scope.household_id,
    profile_id: reward.profile_id || scope.profile_id,
  }));
  next.ledger = next.ledger.map((entry) => ({
    ...entry,
    household_id: entry.household_id || scope.household_id,
    profile_id: entry.profile_id || scope.profile_id,
  }));
  next.redemptions = next.redemptions.map((redemption) => ({
    ...redemption,
    household_id: redemption.household_id || scope.household_id,
    profile_id: redemption.profile_id || scope.profile_id,
  }));
  return next;
}

export function createGrowthLoopController({ db, canWrite = () => true } = {}) {
  if (!db) throw new Error("growth_loop_local_db_required");
  let scope = { household_id: null, profile_id: null };
  let scopeKey = scopeKeyForGrowthLoop(scope);
  let snapshot = createGrowthLoopState(scope);
  const listeners = new Set();
  let scopeWriteGuard = null;

  function isWriteAllowed() {
    return canWrite() !== false && (!scopeWriteGuard || scopeWriteGuard() !== false);
  }

  function currentWriteGuard() {
    return () => isWriteAllowed();
  }

  function isStaleWrite(error) {
    return error?.code === "profile_scope_write_stale";
  }

  function notify() {
    const value = clone(snapshot);
    for (const listener of listeners) listener(value);
  }

  async function persist(nextSnapshot, events = [], { canCommit = isWriteAllowed } = {}) {
    // The local event and its outbox entry are durable before the projection
    // becomes visible to the UI. A failed local write must not look successful.
    if (!isWriteAllowed() || !canCommit()) return clone(snapshot);
    try {
      if (db.persistScope) {
        const committed = await db.persistScope(scopeKey, nextSnapshot, events, { canCommit });
        if (committed === false) return clone(snapshot);
      } else {
        for (const event of events) await db.appendOutbox(event, { canCommit });
        await db.putSnapshot(scopeKey, nextSnapshot, { canCommit });
      }
    } catch (error) {
      if (isStaleWrite(error)) return clone(snapshot);
      throw error;
    }
    snapshot = normalizeGrowthLoopState(nextSnapshot, scope);
    notify();
    return clone(snapshot);
  }

  async function loadScope(nextScope = {}, { adoptPending = false, canCommit = () => true } = {}) {
    const normalizedScope = {
      household_id: nextScope.household_id ?? nextScope.householdId ?? null,
      profile_id: nextScope.profile_id ?? nextScope.profileId ?? null,
    };
    const nextScopeKey = scopeKeyForGrowthLoop(normalizedScope);
    const previousWriteGuard = scopeWriteGuard;
    scopeWriteGuard = canCommit;
    let committed = false;
    let nextSnapshot;
    let pendingMovedWithSnapshot = false;
    try {
      nextSnapshot = await db.getSnapshot(nextScopeKey);
      if (!canCommit()) return clone(snapshot);
      if (adoptPending && nextScopeKey !== "pending:pending") {
        const pending = await db.getSnapshot("pending:pending");
        if (!canCommit()) return clone(snapshot);
        if (pending) {
          const reboundPending = rebindSnapshotScope(pending, normalizedScope);
          if (!canCommit()) return clone(snapshot);
          nextSnapshot = nextSnapshot
            ? mergeGrowthLoopSnapshot(nextSnapshot, reboundPending)
            : reboundPending;
          await db.moveScope("pending:pending", nextScopeKey, normalizedScope, {
            canCommit,
            targetSnapshot: nextSnapshot,
          });
          pendingMovedWithSnapshot = true;
        }
      }
      if (!nextSnapshot) {
        nextSnapshot = createGrowthLoopState(normalizedScope);
      }
      if (!canCommit()) return clone(snapshot);
      if (!pendingMovedWithSnapshot) {
        await db.putSnapshot(nextScopeKey, nextSnapshot, { canCommit });
      }
      if (!canCommit()) return clone(snapshot);
      scope = normalizedScope;
      scopeKey = nextScopeKey;
      snapshot = normalizeGrowthLoopState(nextSnapshot, scope);
      committed = true;
      notify();
      return clone(snapshot);
    } catch (error) {
      if (isStaleWrite(error)) return clone(snapshot);
      throw error;
    } finally {
      if (!committed && scopeWriteGuard === canCommit) scopeWriteGuard = previousWriteGuard;
    }
  }

  async function hydrate() {
    return loadScope(scope);
  }

  function getSnapshot() {
    return clone(snapshot);
  }

  function getScope() {
    return { ...scope };
  }

  function openingBalance() {
    const entry = getOpeningBalance(snapshot);
    return entry ? clone(entry) : null;
  }

  async function confirmOpeningBalance({ balance, note = "期初积分", request_id = createId() }) {
    const result = applyOpeningBalance(snapshot, { scope, balance, note, request_id });
    if (result.error) {
      return { ...clone(snapshot), error: result.error, entry: result.entry ? clone(result.entry) : null };
    }
    await persist(result.snapshot, result.events);
    return clone(snapshot);
  }

  function legacyPointsImportStatus() {
    const summary = getLegacyPointsImport(snapshot);
    return summary ? { ...summary } : null;
  }

  async function importLegacyPoints({ entries, request_id = createId() }) {
    const result = applyLegacyPointsImport(snapshot, { scope, entries, request_id });
    if (result.error) {
      return { ...clone(snapshot), error: result.error };
    }
    await persist(result.snapshot, result.events);
    return clone(snapshot);
  }

  function getPointItems({ includeRecommendations = true } = {}) {
    if (!includeRecommendations) return clone(snapshot.point_items);
    const existingNames = new Set(snapshot.point_items.map((item) => item.name));
    const recommendations = recommendedPointItems.filter((item) => !existingNames.has(item.name)).map((item, index) => ({
      ...clone(item),
      id: `recommended:${index}:${item.name}`,
      item_kind: "recommended",
      source: "recommendation",
    }));
    return [...clone(snapshot.point_items), ...recommendations];
  }

  function getRewards({ includeRecommendations = true } = {}) {
    if (!includeRecommendations) return clone(snapshot.rewards);
    const existingNames = new Set(snapshot.rewards.map((item) => item.name));
    const recommendations = recommendedRewards.filter((item) => !existingNames.has(item.name)).map((item, index) => ({
      ...clone(item),
      id: `recommended-reward:${index}:${item.name}`,
      reward_kind: "recommended",
      source: "recommendation",
    }));
    return [...clone(snapshot.rewards), ...recommendations];
  }

  async function recordPoint({ item, occurred_on, request_id = createId() }) {
    const inputItem = String(item?.id || "").startsWith("recommended:") ? { ...item, id: undefined } : item;
    const result = applyPointAction(snapshot, { scope, item: inputItem, occurred_on, request_id });
    return persist(result.snapshot, result.events);
  }

  async function createPointItem({ item, request_id = createId() }) {
    const result = applyPointItemCreation(snapshot, { scope, item, request_id });
    return persist(result.snapshot, result.events);
  }

  async function closePeriod({ period_key, request_id = createId() }) {
    const result = closePointPeriod(snapshot, { scope, period_key, request_id });
    return persist(result.snapshot, result.events);
  }

  async function createReward({ reward, request_id = createId() }) {
    const inputReward = String(reward?.id || "").startsWith("recommended-reward:") ? { ...reward, id: undefined } : reward;
    const result = applyRewardCreation(snapshot, { scope, reward: inputReward, request_id });
    return persist(result.snapshot, result.events);
  }

  async function redeemReward({ reward_id, request_id = createId() }) {
    let actualRewardId = reward_id;
    if (String(reward_id || "").startsWith("recommended-reward:")) {
      const recommendation = getRewards().find((reward) => reward.id === reward_id);
      if (!recommendation) return { ...clone(snapshot), error: "reward_not_enabled" };
      const definition = applyRewardCreation(snapshot, {
        scope,
        reward: { ...recommendation, id: undefined },
        request_id: `${request_id}:definition`,
      });
      actualRewardId = definition.reward.id;
      await persist(definition.snapshot, definition.events);
    }
    const result = applyRedemption(snapshot, { scope, reward_id: actualRewardId, request_id });
    if (result.error) return { ...clone(snapshot), error: result.error };
    await persist(result.snapshot, result.events);
    return clone(snapshot);
  }

  async function queueActivity({ event_type, payload = {}, occurred_at, client_version, timezone, event_id }) {
    if (!isWriteAllowed()) return null;
    const canCommit = currentWriteGuard();
    const event = buildActivityEvent({
      event_type,
      household_id: scope.household_id,
      profile_id: scope.profile_id,
      payload,
      occurred_at,
      client_version,
      timezone,
      event_id,
    });
    const outboxEvent = {
      event_id: event.event_id,
      request_id: event.event_id,
      scope_key: scopeKey,
      household_id: scope.household_id,
      profile_id: scope.profile_id,
      type: "activity_event",
      payload: { event },
    };
    try {
      if (db.persistActivity) {
        const committed = await db.persistActivity(event, outboxEvent, { canCommit });
        return committed === false ? null : event;
      }
      await db.putActivityEvent(event, { canCommit });
      await db.appendOutbox(outboxEvent, { canCommit });
      return event;
    } catch (error) {
      if (isStaleWrite(error)) return null;
      throw error;
    }
  }

  async function mergeRemote(remoteSnapshot) {
    const merged = mergeGrowthLoopSnapshot(remoteSnapshot, snapshot);
    return persist(merged);
  }

  async function reconcileConfirmed(event, result, canCommit = isWriteAllowed) {
    const next = normalizeGrowthLoopState(snapshot, scope);
    const remote = result?.data;
    if (event.type === "point_record") {
      const row = next.ledger.find((entry) => entry.request_id === event.request_id);
      if (row) {
        Object.assign(row, remote || {}, { status: "confirmed" });
      }
    } else if (event.type === "point_item_upsert" && remote?.id) {
      const row = next.point_items.find((item) => item.id === event.payload.point_item?.id);
      if (row) Object.assign(row, remote);
    } else if (event.type === "reward_upsert" && remote?.id) {
      const row = next.rewards.find((reward) => reward.id === event.payload.reward?.id);
      if (row) Object.assign(row, remote);
    } else if (event.type === "opening_balance_confirm") {
      const row = next.ledger.find((entry) => entry.request_id === event.request_id);
      if (row) {
        Object.assign(row, remote || {}, { status: "confirmed" });
      }
    } else if (event.type === "legacy_points_import") {
      const requestIds = new Set((event.payload.entries || []).map((entry) => entry.request_id));
      for (const row of next.ledger) {
        if (row.entry_type === "legacy_import" && requestIds.has(row.request_id)) {
          Object.assign(row, { status: "confirmed" });
        }
      }
    } else if (event.type === "reward_redeem") {
      const redemption = next.redemptions.find((entry) => entry.request_id === event.request_id);
      if (redemption) {
        Object.assign(redemption, remote || {}, { status: remote?.status || "pending" });
        const debit = next.ledger.find((entry) => entry.redemption_id === redemption.id);
        if (debit && remote?.id) debit.redemption_id = remote.id;
      }
    }
    await persist(next, [], { canCommit });
  }

  async function reconcileUnconfirmed(event, result, canCommit = isWriteAllowed) {
    const next = normalizeGrowthLoopState(snapshot, scope);
    if (event.type === "point_record") {
      const row = next.ledger.find((entry) => entry.request_id === event.request_id);
      if (row) Object.assign(row, { status: result.status, sync_error: result.error_code || "rejected" });
    }
    if (event.type === "opening_balance_confirm") {
      const row = next.ledger.find((entry) => entry.request_id === event.request_id);
      if (row) Object.assign(row, { status: result.status, sync_error: result.error_code || "rejected" });
    }
    if (event.type === "legacy_points_import") {
      const requestIds = new Set((event.payload.entries || []).map((entry) => entry.request_id));
      for (const row of next.ledger) {
        if (row.entry_type === "legacy_import" && requestIds.has(row.request_id)) {
          Object.assign(row, { status: result.status, sync_error: result.error_code || "rejected" });
        }
      }
    }
    if (event.type === "reward_redeem") {
      const redemption = next.redemptions.find((entry) => entry.request_id === event.request_id);
      if (redemption) Object.assign(redemption, { status: result.status, sync_error: result.error_code || "rejected" });
      const debit = next.ledger.find((entry) => entry.request_id === `${event.request_id}:debit`);
      if (debit) Object.assign(debit, { status: result.status, sync_error: result.error_code || "rejected" });
    }
    await persist(next, [], { canCommit });
  }

  async function sync({ transport, limit = 100 } = {}) {
    if (!transport || !isWriteAllowed()) return { skipped: true, reason: "cloud_unavailable" };
    const canCommit = currentWriteGuard();
    const syncEngine = createOutboxSync({
      db,
      transport,
      onConfirmed: (event, result) => reconcileConfirmed(event, result, canCommit),
      onRetryable: (event, result) => reconcileUnconfirmed(event, result, canCommit),
      onRejected: (event, result) => reconcileUnconfirmed(event, result, canCommit),
    });
    let report;
    try {
      report = await syncEngine.syncScope(scopeKey, { limit, canCommit });
    } catch (error) {
      if (isStaleWrite(error)) return { skipped: true, reason: "stale_profile_scope" };
      throw error;
    }
    const next = {
      ...snapshot,
      sync: {
        ...snapshot.sync,
        blocked: report.blocked,
        last_sync_report: report,
        last_server_sync_at: report.blocked ? snapshot.sync.last_server_sync_at : new Date().toISOString(),
      },
    };
    await persist(next, [], { canCommit });
    return report;
  }

  async function pendingOutbox() {
    return db.listOutbox(scopeKey, { statuses: pendingStatuses(), now: Number.MAX_SAFE_INTEGER });
  }

  async function clearScope(targetScope = null) {
    if (!isWriteAllowed()) return;
    if (targetScope) {
      await db.clearScope(scopeKeyForGrowthLoop(targetScope));
      if (scopeKeyForGrowthLoop(targetScope) !== scopeKey) return;
    } else {
      await db.clearScope(scopeKey);
    }
    snapshot = createGrowthLoopState(scope);
    notify();
  }

  async function clearAllLocalData() {
    await db.clearAll();
    scope = { household_id: null, profile_id: null };
    scopeKey = scopeKeyForGrowthLoop(scope);
    snapshot = createGrowthLoopState(scope);
    scopeWriteGuard = null;
    notify();
  }

  async function hasPendingData() {
    const pending = await db.getSnapshot("pending:pending");
    if (pending) {
      return Boolean(
        pending.point_items?.length
        || pending.rewards?.length
        || pending.ledger?.length
        || pending.redemptions?.length,
      );
    }
    return false;
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return {
    hydrate,
    loadScope,
    getSnapshot,
    getScope,
    openingBalance,
    confirmOpeningBalance,
    legacyPointsImportStatus,
    importLegacyPoints,
    getPointItems,
    getRewards,
    createPointItem,
    recordPoint,
    closePeriod,
    createReward,
    redeemReward,
    queueActivity,
    mergeRemote,
    sync,
    pendingOutbox,
    clearScope,
    clearAllLocalData,
    hasPendingData,
    subscribe,
  };
}

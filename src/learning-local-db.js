export const LEARNING_LOCAL_DB_NAME = "shadow-mate-learning-v1";
export const LEARNING_LOCAL_DB_VERSION = 1;

const OUTBOX_STATUSES = new Set(["pending", "retryable", "conflict", "rejected", "confirmed"]);
const STALE_WRITE_ERROR_CODE = "profile_scope_write_stale";
const transactionStaleErrors = new WeakMap();

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function nowIso() {
  return new Date().toISOString();
}

function createLeaseId() {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  return `lease-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function staleWriteError() {
  const error = new Error("profile_scope_write_stale");
  error.code = STALE_WRITE_ERROR_CODE;
  return error;
}

function abortStaleTransaction(transaction) {
  const error = staleWriteError();
  if (transaction) transactionStaleErrors.set(transaction, error);
  try {
    transaction?.abort?.();
  } catch (_) {
    // The transaction may already be completing; the stale write remains rejected.
  }
  return error;
}

function throwIfStale(canCommit, transaction = null, signal = null) {
  if (signal?.aborted || (canCommit && !canCommit())) throw abortStaleTransaction(transaction);
}

function watchWriteRequest(request, transaction, canCommit, signal = null) {
  if (!request || (!canCommit && !signal)) return;
  request.onsuccess = () => {
    if (signal?.aborted || (canCommit && !canCommit())) abortStaleTransaction(transaction);
  };
}

function normalizeOutboxEvent(event, sequence) {
  const createdAt = event.created_at || nowIso();
  return {
    ...clone(event),
    event_id: event.event_id,
    scope_key: event.scope_key || "pending:pending",
    sequence: event.sequence || sequence,
    status: event.status || "pending",
    attempts: Number(event.attempts || 0),
    next_attempt_at: event.next_attempt_at ?? 0,
    created_at: createdAt,
    updated_at: event.updated_at || createdAt,
    error_code: event.error_code || null,
    error_message: event.error_message || null,
    processing_by: event.processing_by || null,
    lease_until: Number(event.lease_until || 0),
    lease_id: event.lease_id || null,
    operation_id: event.operation_id || null,
  };
}

function matchesExpectedClaim(event, expectedClaim) {
  if (!expectedClaim) return true;
  return event?.processing_by === expectedClaim.worker_id
    && event?.operation_id === expectedClaim.operation_id
    && event?.lease_id === expectedClaim.lease_id
    && Number(event?.lease_until || 0) > Number(expectedClaim.now ?? Date.now());
}

function rehomeOutboxEvent(event, scopeKey, scope) {
  const next = normalizeOutboxEvent({
    ...clone(event),
    scope_key: scopeKey,
    household_id: scope.household_id,
    profile_id: scope.profile_id,
    processing_by: null,
    lease_until: 0,
    lease_id: null,
    operation_id: null,
  }, event.sequence);
  const payload = next.payload && typeof next.payload === "object" ? clone(next.payload) : null;
  if (payload) {
    if (next.type === "point_item_upsert" && payload.point_item) {
      payload.point_item.household_id = scope.household_id;
    }
    if (next.type === "profile_point_item_upsert" && payload.profile_point_item) {
      payload.profile_point_item.household_id = scope.household_id;
      payload.profile_point_item.profile_id = scope.profile_id;
    }
    if (next.type === "point_record" && payload) payload.profile_id = scope.profile_id;
    if (next.type === "opening_balance_confirm" && payload) payload.profile_id = scope.profile_id;
    if (next.type === "legacy_points_import" && payload) payload.profile_id = scope.profile_id;
    if (next.type === "reward_upsert" && payload.reward) {
      payload.reward.household_id = scope.household_id;
    }
    if (next.type === "profile_reward_upsert" && payload.profile_reward) {
      payload.profile_reward.household_id = scope.household_id;
      payload.profile_reward.profile_id = scope.profile_id;
    }
    if (next.type === "reward_redeem" && payload) payload.profile_id = scope.profile_id;
    if (next.type === "activity_event" && payload.event) {
      payload.event.household_id = scope.household_id;
      payload.event.profile_id = scope.profile_id;
      payload.event.scope_key = scopeKey;
    }
    next.payload = payload;
  }
  return next;
}

function makeMemoryStore() {
  const snapshots = new Map();
  const outbox = new Map();
  const activityEvents = new Map();
  const sequences = new Map();

  return {
    kind: "memory",
    async getSnapshot(scopeKey) {
      return clone(snapshots.get(scopeKey) || null);
    },
    async putSnapshot(scopeKey, snapshot, { canCommit, signal } = {}) {
      throwIfStale(canCommit, null, signal);
      snapshots.set(scopeKey, clone(snapshot));
      return clone(snapshot);
    },
    async appendOutbox(event, { canCommit, signal } = {}) {
      throwIfStale(canCommit, null, signal);
      const existing = outbox.get(event.event_id);
      if (existing) return clone(existing);
      const nextSequence = (sequences.get(event.scope_key || "pending:pending") || 0) + 1;
      const normalized = normalizeOutboxEvent(event, nextSequence);
      sequences.set(normalized.scope_key, nextSequence);
      outbox.set(normalized.event_id, normalized);
      return clone(normalized);
    },
    async getOutbox(eventId) {
      return clone(outbox.get(eventId) || null);
    },
    async listOutbox(scopeKey, options = {}) {
      const statuses = new Set(options.statuses || ["pending", "retryable", "conflict"]);
      const now = Number(options.now ?? Date.now());
      return [...outbox.values()]
        .filter((event) => event.scope_key === scopeKey && statuses.has(event.status) && Number(event.next_attempt_at || 0) <= now)
        .sort((left, right) => left.sequence - right.sequence)
        .slice(0, options.limit || 100)
        .map(clone);
    },
    async updateOutbox(eventId, patch, { canCommit, signal, expectedClaim } = {}) {
      throwIfStale(canCommit, null, signal);
      const current = outbox.get(eventId);
      if (!current) return null;
      if (!matchesExpectedClaim(current, expectedClaim)) return null;
      const next = normalizeOutboxEvent({ ...current, ...clone(patch), updated_at: nowIso() }, current.sequence);
      if (!OUTBOX_STATUSES.has(next.status)) throw new Error("outbox_status_invalid");
      outbox.set(eventId, next);
      return clone(next);
    },
    async claimOutbox(eventId, {
      worker_id,
      operation_id = null,
      now = Date.now(),
      lease_ms = 30_000,
      canCommit,
      signal,
    } = {}) {
      throwIfStale(canCommit, null, signal);
      const current = outbox.get(eventId);
      if (!current || !worker_id) return false;
      const activeLease = Number(current.lease_until || 0) > Number(now)
        && current.processing_by;
      if (activeLease || !["pending", "retryable"].includes(current.status)) return false;
      const next = normalizeOutboxEvent({
        ...current,
        processing_by: worker_id,
        lease_until: Number(now) + Number(lease_ms),
        lease_id: createLeaseId(),
        operation_id,
      }, current.sequence);
      outbox.set(eventId, next);
      return clone(next);
    },
    async releaseOutboxClaim(eventId, { worker_id, lease_id, operation_id } = {}) {
      const current = outbox.get(eventId);
      if (!current || current.processing_by !== worker_id) return false;
      if (lease_id && current.lease_id !== lease_id) return false;
      if (operation_id && current.operation_id !== operation_id) return false;
      const next = normalizeOutboxEvent({
        ...current,
        processing_by: null,
        lease_until: 0,
        lease_id: null,
        operation_id: null,
      }, current.sequence);
      outbox.set(eventId, next);
      return true;
    },
    async putActivityEvent(event, { canCommit, signal } = {}) {
      throwIfStale(canCommit, null, signal);
      const existing = activityEvents.get(event.event_id);
      if (existing) return clone(existing);
      activityEvents.set(event.event_id, clone(event));
      return clone(event);
    },
    async listActivityEvents(scopeKey) {
      return [...activityEvents.values()].filter((event) => event.scope_key === scopeKey).map(clone);
    },
    async clearScope(scopeKey) {
      snapshots.delete(scopeKey);
      for (const [eventId, event] of outbox.entries()) if (event.scope_key === scopeKey) outbox.delete(eventId);
      for (const [eventId, event] of activityEvents.entries()) if (event.scope_key === scopeKey) activityEvents.delete(eventId);
      sequences.delete(scopeKey);
    },
    async clearAll() {
      snapshots.clear();
      outbox.clear();
      activityEvents.clear();
      sequences.clear();
    },
    async moveScope(fromScopeKey, toScopeKey, scope, { canCommit, targetSnapshot, signal } = {}) {
      const previousSnapshots = new Map([...snapshots].map(([key, value]) => [key, clone(value)]));
      const previousOutbox = new Map([...outbox].map(([key, value]) => [key, clone(value)]));
      const previousActivityEvents = new Map([...activityEvents].map(([key, value]) => [key, clone(value)]));
      const previousSequences = new Map(sequences);
      try {
        throwIfStale(canCommit, null, signal);
        const snapshot = snapshots.get(fromScopeKey);
        if (snapshot) {
          throwIfStale(canCommit, null, signal);
          snapshots.delete(fromScopeKey);
        }
        const events = [...outbox.values()]
          .filter((event) => event.scope_key === fromScopeKey)
          .sort((left, right) => left.sequence - right.sequence);
        let sequence = sequences.get(toScopeKey) || 0;
        for (const event of events) {
          throwIfStale(canCommit, null, signal);
          outbox.delete(event.event_id);
          const next = rehomeOutboxEvent(event, toScopeKey, scope);
          sequence += 1;
          next.sequence = sequence;
          outbox.set(next.event_id, next);
        }
        throwIfStale(canCommit, null, signal);
        sequences.delete(fromScopeKey);
        sequences.set(toScopeKey, sequence);
        for (const [eventId, event] of activityEvents.entries()) {
          if (event.scope_key !== fromScopeKey) continue;
          throwIfStale(canCommit, null, signal);
          activityEvents.delete(eventId);
          activityEvents.set(eventId, {
            ...clone(event),
            scope_key: toScopeKey,
            household_id: scope.household_id,
            profile_id: scope.profile_id,
          });
        }
        if (targetSnapshot !== undefined) {
          throwIfStale(canCommit, null, signal);
          snapshots.set(toScopeKey, clone(targetSnapshot));
        }
        throwIfStale(canCommit, null, signal);
        return clone(snapshot || null);
      } catch (error) {
        snapshots.clear();
        previousSnapshots.forEach((value, key) => snapshots.set(key, value));
        outbox.clear();
        previousOutbox.forEach((value, key) => outbox.set(key, value));
        activityEvents.clear();
        previousActivityEvents.forEach((value, key) => activityEvents.set(key, value));
        sequences.clear();
        previousSequences.forEach((value, key) => sequences.set(key, value));
        throw error;
      }
    },
    async persistScope(scopeKey, snapshot, events = [], { canCommit, signal } = {}) {
      const previousSnapshots = new Map([...snapshots].map(([key, value]) => [key, clone(value)]));
      const previousOutbox = new Map([...outbox].map(([key, value]) => [key, clone(value)]));
      const previousSequences = new Map(sequences);
      try {
        throwIfStale(canCommit, null, signal);
        for (const event of events) {
          if (outbox.has(event.event_id)) continue;
          throwIfStale(canCommit, null, signal);
          const nextSequence = (sequences.get(event.scope_key || scopeKey) || 0) + 1;
          const normalized = normalizeOutboxEvent(event, nextSequence);
          sequences.set(normalized.scope_key, nextSequence);
          outbox.set(normalized.event_id, normalized);
        }
        throwIfStale(canCommit, null, signal);
        snapshots.set(scopeKey, clone(snapshot));
        throwIfStale(canCommit, null, signal);
        return true;
      } catch (error) {
        snapshots.clear();
        previousSnapshots.forEach((value, key) => snapshots.set(key, value));
        outbox.clear();
        previousOutbox.forEach((value, key) => outbox.set(key, value));
        sequences.clear();
        previousSequences.forEach((value, key) => sequences.set(key, value));
        throw error;
      }
    },
    async persistActivity(event, outboxEvent, { canCommit, signal } = {}) {
      const previousActivityEvents = new Map([...activityEvents].map(([key, value]) => [key, clone(value)]));
      const previousOutbox = new Map([...outbox].map(([key, value]) => [key, clone(value)]));
      const previousSequences = new Map(sequences);
      try {
        throwIfStale(canCommit, null, signal);
        if (!activityEvents.has(event.event_id)) {
          throwIfStale(canCommit, null, signal);
          activityEvents.set(event.event_id, clone(event));
        }
        if (!outbox.has(outboxEvent.event_id)) {
          throwIfStale(canCommit, null, signal);
          const nextSequence = (sequences.get(outboxEvent.scope_key || "pending:pending") || 0) + 1;
          const normalized = normalizeOutboxEvent(outboxEvent, nextSequence);
          sequences.set(normalized.scope_key, nextSequence);
          outbox.set(normalized.event_id, normalized);
        }
        throwIfStale(canCommit, null, signal);
        return true;
      } catch (error) {
        activityEvents.clear();
        previousActivityEvents.forEach((value, key) => activityEvents.set(key, value));
        outbox.clear();
        previousOutbox.forEach((value, key) => outbox.set(key, value));
        sequences.clear();
        previousSequences.forEach((value, key) => sequences.set(key, value));
        throw error;
      }
    },
  };
}

function requestPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("indexeddb_request_failed"));
  });
}

function transactionPromise(transaction, { canCommit, signal } = {}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let monitor = null;
    const onAbort = () => checkStale();
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      if (monitor) clearInterval(monitor);
      signal?.removeEventListener?.("abort", onAbort);
      callback(value);
    };
    const checkStale = () => {
      if (settled || (!signal?.aborted && (!canCommit || canCommit()))) return;
      finish(reject, abortStaleTransaction(transaction));
    };
    transaction.oncomplete = () => finish(resolve);
    transaction.onerror = () => finish(
      reject,
      transactionStaleErrors.get(transaction) || transaction.error || new Error("indexeddb_transaction_failed"),
    );
    transaction.onabort = () => finish(
      reject,
      transactionStaleErrors.get(transaction) || transaction.error || new Error("indexeddb_transaction_aborted"),
    );
    if (canCommit) {
      monitor = setInterval(checkStale, 1);
      queueMicrotask(checkStale);
    }
    if (signal) {
      if (signal.aborted) checkStale();
      else signal.addEventListener?.("abort", onAbort, { once: true });
    }
  });
}

function openDatabase(indexedDB) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(LEARNING_LOCAL_DB_NAME, LEARNING_LOCAL_DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains("snapshots")) database.createObjectStore("snapshots", { keyPath: "scope_key" });
      if (!database.objectStoreNames.contains("outbox")) {
        const store = database.createObjectStore("outbox", { keyPath: "event_id" });
        store.createIndex("scope_status", ["scope_key", "status"], { unique: false });
        store.createIndex("scope_sequence", ["scope_key", "sequence"], { unique: false });
      }
      if (!database.objectStoreNames.contains("activity_events")) database.createObjectStore("activity_events", { keyPath: "event_id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("indexeddb_open_failed"));
  });
}

function isClosingDatabaseConnection(error) {
  return error?.name === "InvalidStateError"
    && /database connection is closing/i.test(String(error?.message || ""));
}

export function createMemoryLearningDb() {
  return makeMemoryStore();
}

function makeUnavailableStore() {
  const error = new Error("indexeddb_unavailable");
  error.code = "indexeddb_unavailable";
  const reject = async () => { throw error; };
  return {
    kind: "unavailable",
    getSnapshot: reject,
    putSnapshot: reject,
    appendOutbox: reject,
    getOutbox: reject,
    listOutbox: reject,
    updateOutbox: reject,
    claimOutbox: reject,
    releaseOutboxClaim: reject,
    putActivityEvent: reject,
    listActivityEvents: reject,
    clearScope: reject,
    clearAll: reject,
    moveScope: reject,
    persistScope: reject,
    persistActivity: reject,
  };
}

export function createIndexedDbLearningDb({ indexedDB = globalThis.indexedDB, deferOpen = false } = {}) {
  if (!indexedDB) return makeUnavailableStore();
  let activeDatabase;
  let databasePromise = null;
  let reopeningPromise = null;

  function rememberDatabase(database) {
    activeDatabase = database;
    databasePromise = Promise.resolve(database);
    return database;
  }

  function ensureDatabasePromise() {
    if (!databasePromise) {
      databasePromise = openDatabase(indexedDB).then(rememberDatabase);
    }
    return databasePromise;
  }

  if (!deferOpen) ensureDatabasePromise();

  function reopenDatabase(staleDatabase) {
    if (staleDatabase !== activeDatabase) return ensureDatabasePromise();
    if (!reopeningPromise) {
      const openingPromise = openDatabase(indexedDB);
      reopeningPromise = openingPromise;
      void openingPromise.then(
        rememberDatabase,
        () => {},
      ).then(() => {
        if (reopeningPromise === openingPromise) reopeningPromise = null;
      });
    }
    return reopeningPromise;
  }

  async function useDatabase(operation) {
    const database = await ensureDatabasePromise();
    try {
      return await operation(database);
    } catch (error) {
      if (database.kind === "memory" || !isClosingDatabaseConnection(error)) throw error;
      return operation(await reopenDatabase(database));
    }
  }

  return {
    kind: "indexeddb",
    async getSnapshot(scopeKey) {
      return useDatabase(async (database) => {
        if (database.kind === "memory") return database.getSnapshot(scopeKey);
        const transaction = database.transaction(["snapshots"], "readonly");
        const row = await requestPromise(transaction.objectStore("snapshots").get(scopeKey));
        return clone(row?.snapshot || null);
      });
    },
    async putSnapshot(scopeKey, snapshot, { canCommit, signal } = {}) {
      return useDatabase(async (database) => {
        if (database.kind === "memory") return database.putSnapshot(scopeKey, snapshot, { canCommit, signal });
        throwIfStale(canCommit, null, signal);
        const transaction = database.transaction(["snapshots"], "readwrite");
        const store = transaction.objectStore("snapshots");
        throwIfStale(canCommit, transaction, signal);
        watchWriteRequest(
          store.put({ scope_key: scopeKey, snapshot: clone(snapshot), updated_at: nowIso() }),
          transaction,
          canCommit,
          signal,
        );
        throwIfStale(canCommit, transaction, signal);
        await transactionPromise(transaction, { canCommit, signal });
        return clone(snapshot);
      });
    },
    async appendOutbox(event, { canCommit, signal } = {}) {
      return useDatabase(async (database) => {
        if (database.kind === "memory") return database.appendOutbox(event, { canCommit, signal });
        const transaction = database.transaction(["outbox"], "readwrite");
        const store = transaction.objectStore("outbox");
        const [existing, all] = await Promise.all([
          requestPromise(store.get(event.event_id)),
          requestPromise(store.getAll()),
        ]);
        if (existing) {
          await transactionPromise(transaction);
          return clone(existing);
        }
        throwIfStale(canCommit, null, signal);
        const scopeKey = event.scope_key || "pending:pending";
        const nextSequence = all
          .filter((item) => item.scope_key === scopeKey)
          .reduce((max, item) => Math.max(max, Number(item.sequence || 0)), 0) + 1;
        const normalized = normalizeOutboxEvent(event, nextSequence);
        throwIfStale(canCommit, transaction, signal);
        watchWriteRequest(store.put(normalized), transaction, canCommit, signal);
        throwIfStale(canCommit, transaction, signal);
        await transactionPromise(transaction, { canCommit, signal });
        return clone(normalized);
      });
    },
    async getOutbox(eventId) {
      return useDatabase(async (database) => {
        if (database.kind === "memory") return database.getOutbox(eventId);
        const transaction = database.transaction(["outbox"], "readonly");
        return clone(await requestPromise(transaction.objectStore("outbox").get(eventId)) || null);
      });
    },
    async listOutbox(scopeKey, options = {}) {
      return useDatabase(async (database) => {
        if (database.kind === "memory") return database.listOutbox(scopeKey, options);
        const transaction = database.transaction(["outbox"], "readonly");
        const rows = await requestPromise(transaction.objectStore("outbox").getAll());
        const statuses = new Set(options.statuses || ["pending", "retryable", "conflict"]);
        const now = Number(options.now ?? Date.now());
        return rows
          .filter((event) => event.scope_key === scopeKey && statuses.has(event.status) && Number(event.next_attempt_at || 0) <= now)
          .sort((left, right) => left.sequence - right.sequence)
          .slice(0, options.limit || 100)
          .map((event) => clone(event));
      });
    },
    async updateOutbox(eventId, patch, { canCommit, signal, expectedClaim } = {}) {
      return useDatabase(async (database) => {
        if (database.kind === "memory") {
          return database.updateOutbox(eventId, patch, { canCommit, signal, expectedClaim });
        }
        const transaction = database.transaction(["outbox"], "readwrite");
        const store = transaction.objectStore("outbox");
        const current = await requestPromise(store.get(eventId));
        if (!current) {
          await transactionPromise(transaction);
          return null;
        }
        if (!matchesExpectedClaim(current, expectedClaim)) {
          await transactionPromise(transaction);
          return null;
        }
        const next = normalizeOutboxEvent({ ...current, ...clone(patch), updated_at: nowIso() }, current.sequence);
        if (!OUTBOX_STATUSES.has(next.status)) throw new Error("outbox_status_invalid");
        throwIfStale(canCommit, null, signal);
        watchWriteRequest(store.put(next), transaction, canCommit, signal);
        throwIfStale(canCommit, transaction, signal);
        await transactionPromise(transaction, { canCommit, signal });
        return clone(next);
      });
    },
    async claimOutbox(eventId, {
      worker_id,
      operation_id = null,
      now = Date.now(),
      lease_ms = 30_000,
      canCommit,
      signal,
    } = {}) {
      if (!worker_id) return false;
      return useDatabase(async (database) => {
        if (database.kind === "memory") {
          return database.claimOutbox(eventId, { worker_id, operation_id, now, lease_ms, canCommit, signal });
        }
        const transaction = database.transaction(["outbox"], "readwrite");
        const store = transaction.objectStore("outbox");
        const current = await requestPromise(store.get(eventId));
        if (!current) {
          await transactionPromise(transaction);
          return false;
        }
        const activeLease = Number(current.lease_until || 0) > Number(now)
          && current.processing_by;
        if (activeLease || !["pending", "retryable"].includes(current.status)) return false;
        throwIfStale(canCommit, null, signal);
        const next = normalizeOutboxEvent({
          ...current,
          processing_by: worker_id,
          lease_until: Number(now) + Number(lease_ms),
          lease_id: createLeaseId(),
          operation_id,
        }, current.sequence);
        watchWriteRequest(store.put(next), transaction, canCommit, signal);
        throwIfStale(canCommit, transaction, signal);
        await transactionPromise(transaction, { canCommit, signal });
        return clone(next);
      });
    },
    async releaseOutboxClaim(eventId, { worker_id, lease_id, operation_id } = {}) {
      return useDatabase(async (database) => {
        if (database.kind === "memory") {
          return database.releaseOutboxClaim(eventId, { worker_id, lease_id, operation_id });
        }
        const transaction = database.transaction(["outbox"], "readwrite");
        const store = transaction.objectStore("outbox");
        const current = await requestPromise(store.get(eventId));
        if (!current || current.processing_by !== worker_id) {
          await transactionPromise(transaction);
          return false;
        }
        if (lease_id && current.lease_id !== lease_id) {
          await transactionPromise(transaction);
          return false;
        }
        if (operation_id && current.operation_id !== operation_id) {
          await transactionPromise(transaction);
          return false;
        }
        const released = normalizeOutboxEvent({
          ...current,
          processing_by: null,
          lease_until: 0,
          lease_id: null,
          operation_id: null,
        }, current.sequence);
        store.put(released);
        await transactionPromise(transaction);
        return true;
      });
    },
    async putActivityEvent(event, { canCommit, signal } = {}) {
      return useDatabase(async (database) => {
        if (database.kind === "memory") return database.putActivityEvent(event, { canCommit, signal });
        const transaction = database.transaction(["activity_events"], "readwrite");
        const store = transaction.objectStore("activity_events");
        const existing = await requestPromise(store.get(event.event_id));
        if (!existing) {
          throwIfStale(canCommit, null, signal);
          watchWriteRequest(store.put(clone(event)), transaction, canCommit, signal);
          throwIfStale(canCommit, transaction, signal);
        }
        await transactionPromise(transaction, { canCommit, signal });
        return clone(existing || event);
      });
    },
    async persistScope(scopeKey, snapshot, events = [], { canCommit, signal } = {}) {
      return useDatabase(async (database) => {
        if (database.kind === "memory") return database.persistScope(scopeKey, snapshot, events, { canCommit, signal });
        const transaction = database.transaction(["snapshots", "outbox"], "readwrite");
        const snapshotsStore = transaction.objectStore("snapshots");
        const outboxStore = transaction.objectStore("outbox");
        const rows = await requestPromise(outboxStore.getAll());
        throwIfStale(canCommit, null, signal);
        const existingIds = new Set(rows.map((event) => event.event_id));
        let sequence = rows
          .filter((event) => event.scope_key === scopeKey)
          .reduce((max, event) => Math.max(max, Number(event.sequence || 0)), 0);
        for (const event of events) {
          if (existingIds.has(event.event_id)) continue;
          throwIfStale(canCommit, transaction, signal);
          sequence += 1;
          watchWriteRequest(outboxStore.put(normalizeOutboxEvent(event, sequence)), transaction, canCommit, signal);
          existingIds.add(event.event_id);
          throwIfStale(canCommit, transaction, signal);
        }
        throwIfStale(canCommit, transaction, signal);
        watchWriteRequest(
          snapshotsStore.put({ scope_key: scopeKey, snapshot: clone(snapshot), updated_at: nowIso() }),
          transaction,
          canCommit,
          signal,
        );
        throwIfStale(canCommit, transaction, signal);
        await transactionPromise(transaction, { canCommit, signal });
        return true;
      });
    },
    async persistActivity(event, outboxEvent, { canCommit, signal } = {}) {
      return useDatabase(async (database) => {
        if (database.kind === "memory") return database.persistActivity(event, outboxEvent, { canCommit, signal });
        const transaction = database.transaction(["activity_events", "outbox"], "readwrite");
        const activityStore = transaction.objectStore("activity_events");
        const outboxStore = transaction.objectStore("outbox");
        const [existingActivity, outboxRows] = await Promise.all([
          requestPromise(activityStore.get(event.event_id)),
          requestPromise(outboxStore.getAll()),
        ]);
        throwIfStale(canCommit, null, signal);
        if (!existingActivity) {
          throwIfStale(canCommit, transaction, signal);
          watchWriteRequest(activityStore.put(clone(event)), transaction, canCommit, signal);
          throwIfStale(canCommit, transaction, signal);
        }
        if (!outboxRows.some((item) => item.event_id === outboxEvent.event_id)) {
          const scopeKey = outboxEvent.scope_key || "pending:pending";
          const sequence = outboxRows
            .filter((item) => item.scope_key === scopeKey)
            .reduce((max, item) => Math.max(max, Number(item.sequence || 0)), 0) + 1;
          throwIfStale(canCommit, transaction, signal);
          watchWriteRequest(outboxStore.put(normalizeOutboxEvent(outboxEvent, sequence)), transaction, canCommit, signal);
          throwIfStale(canCommit, transaction, signal);
        }
        throwIfStale(canCommit, transaction, signal);
        await transactionPromise(transaction, { canCommit, signal });
        return true;
      });
    },
    async listActivityEvents(scopeKey) {
      return useDatabase(async (database) => {
        if (database.kind === "memory") return database.listActivityEvents(scopeKey);
        const transaction = database.transaction(["activity_events"], "readonly");
        const rows = await requestPromise(transaction.objectStore("activity_events").getAll());
        return rows.filter((event) => event.scope_key === scopeKey).map((event) => clone(event));
      });
    },
    async clearScope(scopeKey) {
      return useDatabase(async (database) => {
        if (database.kind === "memory") return database.clearScope(scopeKey);
        const transaction = database.transaction(["snapshots", "outbox", "activity_events"], "readwrite");
        transaction.objectStore("snapshots").delete(scopeKey);
        for (const storeName of ["outbox", "activity_events"]) {
          const store = transaction.objectStore(storeName);
          const rows = await requestPromise(store.getAll());
          rows.filter((event) => event.scope_key === scopeKey).forEach((event) => store.delete(event.event_id));
        }
        await transactionPromise(transaction);
      });
    },
    async clearAll() {
      return useDatabase(async (database) => {
        if (database.kind === "memory") return database.clearAll();
        const transaction = database.transaction(["snapshots", "outbox", "activity_events"], "readwrite");
        transaction.objectStore("snapshots").clear();
        transaction.objectStore("outbox").clear();
        transaction.objectStore("activity_events").clear();
        await transactionPromise(transaction);
      });
    },
    async moveScope(fromScopeKey, toScopeKey, scope, { canCommit, targetSnapshot, signal } = {}) {
      return useDatabase(async (database) => {
        if (database.kind === "memory") {
          return database.moveScope(fromScopeKey, toScopeKey, scope, { canCommit, targetSnapshot, signal });
        }
        const transaction = database.transaction(["snapshots", "outbox", "activity_events"], "readwrite");
        const snapshotsStore = transaction.objectStore("snapshots");
        const outboxStore = transaction.objectStore("outbox");
        const activityStore = transaction.objectStore("activity_events");
        const [snapshot, outboxRows, activityRows] = await Promise.all([
          requestPromise(snapshotsStore.get(fromScopeKey)),
          requestPromise(outboxStore.getAll()),
          requestPromise(activityStore.getAll()),
        ]);
        throwIfStale(canCommit, null, signal);
        throwIfStale(canCommit, transaction, signal);
        snapshotsStore.delete(fromScopeKey);
        const sourceEvents = outboxRows
          .filter((event) => event.scope_key === fromScopeKey)
          .sort((left, right) => left.sequence - right.sequence);
        const targetEvents = outboxRows.filter((event) => event.scope_key === toScopeKey);
        let sequence = targetEvents.reduce((max, event) => Math.max(max, Number(event.sequence || 0)), 0);
        for (const event of sourceEvents) {
          throwIfStale(canCommit, transaction, signal);
          outboxStore.delete(event.event_id);
          sequence += 1;
          const next = rehomeOutboxEvent(event, toScopeKey, scope);
          next.sequence = sequence;
          watchWriteRequest(outboxStore.put(next), transaction, canCommit, signal);
          throwIfStale(canCommit, transaction, signal);
        }
        for (const event of activityRows.filter((item) => item.scope_key === fromScopeKey)) {
          throwIfStale(canCommit, transaction, signal);
          activityStore.delete(event.event_id);
          watchWriteRequest(activityStore.put({
            ...clone(event),
            scope_key: toScopeKey,
            household_id: scope.household_id,
            profile_id: scope.profile_id,
          }), transaction, canCommit, signal);
          throwIfStale(canCommit, transaction, signal);
        }
        if (targetSnapshot !== undefined) {
          throwIfStale(canCommit, transaction, signal);
          watchWriteRequest(
            snapshotsStore.put({ scope_key: toScopeKey, snapshot: clone(targetSnapshot), updated_at: nowIso() }),
            transaction,
            canCommit,
            signal,
          );
        }
        throwIfStale(canCommit, transaction, signal);
        await transactionPromise(transaction, { canCommit, signal });
        return clone(snapshot || null);
      });
    },
  };
}

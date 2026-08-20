export const LEARNING_LOCAL_DB_NAME = "shadow-mate-learning-v1";
export const LEARNING_LOCAL_DB_VERSION = 1;

const OUTBOX_STATUSES = new Set(["pending", "retryable", "conflict", "rejected", "confirmed"]);
const STALE_WRITE_ERROR_CODE = "profile_scope_write_stale";

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function nowIso() {
  return new Date().toISOString();
}

function throwIfStale(canCommit, transaction = null) {
  if (canCommit && !canCommit()) {
    try {
      transaction?.abort?.();
    } catch (_) {
      // The transaction may already be completing; the stale write remains rejected.
    }
    const error = new Error("profile_scope_write_stale");
    error.code = STALE_WRITE_ERROR_CODE;
    throw error;
  }
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
  };
}

function rehomeOutboxEvent(event, scopeKey, scope) {
  const next = normalizeOutboxEvent({
    ...clone(event),
    scope_key: scopeKey,
    household_id: scope.household_id,
    profile_id: scope.profile_id,
    processing_by: null,
    lease_until: 0,
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
    async putSnapshot(scopeKey, snapshot, { canCommit } = {}) {
      throwIfStale(canCommit);
      snapshots.set(scopeKey, clone(snapshot));
      return clone(snapshot);
    },
    async appendOutbox(event, { canCommit } = {}) {
      throwIfStale(canCommit);
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
    async updateOutbox(eventId, patch, { canCommit } = {}) {
      throwIfStale(canCommit);
      const current = outbox.get(eventId);
      if (!current) return null;
      const next = normalizeOutboxEvent({ ...current, ...clone(patch), updated_at: nowIso() }, current.sequence);
      if (!OUTBOX_STATUSES.has(next.status)) throw new Error("outbox_status_invalid");
      outbox.set(eventId, next);
      return clone(next);
    },
    async claimOutbox(eventId, { worker_id, now = Date.now(), lease_ms = 30_000, canCommit } = {}) {
      throwIfStale(canCommit);
      const current = outbox.get(eventId);
      if (!current || !worker_id) return false;
      const activeLease = Number(current.lease_until || 0) > Number(now)
        && current.processing_by
        && current.processing_by !== worker_id;
      if (activeLease || !["pending", "retryable"].includes(current.status)) return false;
      const next = normalizeOutboxEvent({
        ...current,
        processing_by: worker_id,
        lease_until: Number(now) + Number(lease_ms),
      }, current.sequence);
      outbox.set(eventId, next);
      return true;
    },
    async putActivityEvent(event, { canCommit } = {}) {
      throwIfStale(canCommit);
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
    async moveScope(fromScopeKey, toScopeKey, scope, { canCommit, targetSnapshot } = {}) {
      const previousSnapshots = new Map([...snapshots].map(([key, value]) => [key, clone(value)]));
      const previousOutbox = new Map([...outbox].map(([key, value]) => [key, clone(value)]));
      const previousActivityEvents = new Map([...activityEvents].map(([key, value]) => [key, clone(value)]));
      const previousSequences = new Map(sequences);
      try {
        throwIfStale(canCommit);
        const snapshot = snapshots.get(fromScopeKey);
        if (snapshot) {
          throwIfStale(canCommit);
          snapshots.delete(fromScopeKey);
        }
        const events = [...outbox.values()]
          .filter((event) => event.scope_key === fromScopeKey)
          .sort((left, right) => left.sequence - right.sequence);
        let sequence = sequences.get(toScopeKey) || 0;
        for (const event of events) {
          throwIfStale(canCommit);
          outbox.delete(event.event_id);
          const next = rehomeOutboxEvent(event, toScopeKey, scope);
          sequence += 1;
          next.sequence = sequence;
          outbox.set(next.event_id, next);
        }
        throwIfStale(canCommit);
        sequences.delete(fromScopeKey);
        sequences.set(toScopeKey, sequence);
        for (const [eventId, event] of activityEvents.entries()) {
          if (event.scope_key !== fromScopeKey) continue;
          throwIfStale(canCommit);
          activityEvents.delete(eventId);
          activityEvents.set(eventId, {
            ...clone(event),
            scope_key: toScopeKey,
            household_id: scope.household_id,
            profile_id: scope.profile_id,
          });
        }
        if (targetSnapshot !== undefined) {
          throwIfStale(canCommit);
          snapshots.set(toScopeKey, clone(targetSnapshot));
        }
        throwIfStale(canCommit);
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
    async persistScope(scopeKey, snapshot, events = [], { canCommit } = {}) {
      const previousSnapshots = new Map([...snapshots].map(([key, value]) => [key, clone(value)]));
      const previousOutbox = new Map([...outbox].map(([key, value]) => [key, clone(value)]));
      const previousSequences = new Map(sequences);
      try {
        throwIfStale(canCommit);
        for (const event of events) {
          if (outbox.has(event.event_id)) continue;
          throwIfStale(canCommit);
          const nextSequence = (sequences.get(event.scope_key || scopeKey) || 0) + 1;
          const normalized = normalizeOutboxEvent(event, nextSequence);
          sequences.set(normalized.scope_key, nextSequence);
          outbox.set(normalized.event_id, normalized);
        }
        throwIfStale(canCommit);
        snapshots.set(scopeKey, clone(snapshot));
        throwIfStale(canCommit);
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
    async persistActivity(event, outboxEvent, { canCommit } = {}) {
      const previousActivityEvents = new Map([...activityEvents].map(([key, value]) => [key, clone(value)]));
      const previousOutbox = new Map([...outbox].map(([key, value]) => [key, clone(value)]));
      const previousSequences = new Map(sequences);
      try {
        throwIfStale(canCommit);
        if (!activityEvents.has(event.event_id)) {
          throwIfStale(canCommit);
          activityEvents.set(event.event_id, clone(event));
        }
        if (!outbox.has(outboxEvent.event_id)) {
          throwIfStale(canCommit);
          const nextSequence = (sequences.get(outboxEvent.scope_key || "pending:pending") || 0) + 1;
          const normalized = normalizeOutboxEvent(outboxEvent, nextSequence);
          sequences.set(normalized.scope_key, nextSequence);
          outbox.set(normalized.event_id, normalized);
        }
        throwIfStale(canCommit);
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

function transactionPromise(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("indexeddb_transaction_failed"));
    transaction.onabort = () => reject(transaction.error || new Error("indexeddb_transaction_aborted"));
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

export function createIndexedDbLearningDb({ indexedDB = globalThis.indexedDB } = {}) {
  if (!indexedDB) return makeMemoryStore();
  let activeDatabase;
  let databasePromise;
  let reopeningPromise = null;

  function rememberDatabase(database) {
    activeDatabase = database;
    databasePromise = Promise.resolve(database);
    return database;
  }

  databasePromise = openDatabase(indexedDB).then(
    rememberDatabase,
    () => rememberDatabase(makeMemoryStore()),
  );

  function reopenDatabase(staleDatabase) {
    if (staleDatabase !== activeDatabase) return databasePromise;
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
    const database = await databasePromise;
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
    async putSnapshot(scopeKey, snapshot, { canCommit } = {}) {
      return useDatabase(async (database) => {
        if (database.kind === "memory") return database.putSnapshot(scopeKey, snapshot, { canCommit });
        throwIfStale(canCommit);
        const transaction = database.transaction(["snapshots"], "readwrite");
        const store = transaction.objectStore("snapshots");
        throwIfStale(canCommit, transaction);
        store.put({ scope_key: scopeKey, snapshot: clone(snapshot), updated_at: nowIso() });
        throwIfStale(canCommit, transaction);
        await transactionPromise(transaction);
        return clone(snapshot);
      });
    },
    async appendOutbox(event, { canCommit } = {}) {
      return useDatabase(async (database) => {
        if (database.kind === "memory") return database.appendOutbox(event, { canCommit });
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
        throwIfStale(canCommit);
        const scopeKey = event.scope_key || "pending:pending";
        const nextSequence = all
          .filter((item) => item.scope_key === scopeKey)
          .reduce((max, item) => Math.max(max, Number(item.sequence || 0)), 0) + 1;
        const normalized = normalizeOutboxEvent(event, nextSequence);
        throwIfStale(canCommit, transaction);
        store.put(normalized);
        throwIfStale(canCommit, transaction);
        await transactionPromise(transaction);
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
    async updateOutbox(eventId, patch, { canCommit } = {}) {
      return useDatabase(async (database) => {
        if (database.kind === "memory") return database.updateOutbox(eventId, patch, { canCommit });
        const transaction = database.transaction(["outbox"], "readwrite");
        const store = transaction.objectStore("outbox");
        const current = await requestPromise(store.get(eventId));
        if (!current) {
          await transactionPromise(transaction);
          return null;
        }
        const next = normalizeOutboxEvent({ ...current, ...clone(patch), updated_at: nowIso() }, current.sequence);
        if (!OUTBOX_STATUSES.has(next.status)) throw new Error("outbox_status_invalid");
        throwIfStale(canCommit);
        store.put(next);
        throwIfStale(canCommit, transaction);
        await transactionPromise(transaction);
        return clone(next);
      });
    },
    async claimOutbox(eventId, { worker_id, now = Date.now(), lease_ms = 30_000, canCommit } = {}) {
      if (!worker_id) return false;
      return useDatabase(async (database) => {
        if (database.kind === "memory") return database.claimOutbox(eventId, { worker_id, now, lease_ms, canCommit });
        const transaction = database.transaction(["outbox"], "readwrite");
        const store = transaction.objectStore("outbox");
        const current = await requestPromise(store.get(eventId));
        if (!current) {
          await transactionPromise(transaction);
          return false;
        }
        const activeLease = Number(current.lease_until || 0) > Number(now)
          && current.processing_by
          && current.processing_by !== worker_id;
        if (activeLease || !["pending", "retryable"].includes(current.status)) return false;
        throwIfStale(canCommit);
        store.put(normalizeOutboxEvent({
          ...current,
          processing_by: worker_id,
          lease_until: Number(now) + Number(lease_ms),
        }, current.sequence));
        throwIfStale(canCommit, transaction);
        await transactionPromise(transaction);
        return true;
      });
    },
    async putActivityEvent(event, { canCommit } = {}) {
      return useDatabase(async (database) => {
        if (database.kind === "memory") return database.putActivityEvent(event, { canCommit });
        const transaction = database.transaction(["activity_events"], "readwrite");
        const store = transaction.objectStore("activity_events");
        const existing = await requestPromise(store.get(event.event_id));
        if (!existing) {
          throwIfStale(canCommit);
          store.put(clone(event));
          throwIfStale(canCommit, transaction);
        }
        await transactionPromise(transaction);
        return clone(existing || event);
      });
    },
    async persistScope(scopeKey, snapshot, events = [], { canCommit } = {}) {
      return useDatabase(async (database) => {
        if (database.kind === "memory") return database.persistScope(scopeKey, snapshot, events, { canCommit });
        const transaction = database.transaction(["snapshots", "outbox"], "readwrite");
        const snapshotsStore = transaction.objectStore("snapshots");
        const outboxStore = transaction.objectStore("outbox");
        const rows = await requestPromise(outboxStore.getAll());
        throwIfStale(canCommit);
        const existingIds = new Set(rows.map((event) => event.event_id));
        let sequence = rows
          .filter((event) => event.scope_key === scopeKey)
          .reduce((max, event) => Math.max(max, Number(event.sequence || 0)), 0);
        for (const event of events) {
          if (existingIds.has(event.event_id)) continue;
          throwIfStale(canCommit, transaction);
          sequence += 1;
          outboxStore.put(normalizeOutboxEvent(event, sequence));
          existingIds.add(event.event_id);
          throwIfStale(canCommit, transaction);
        }
        throwIfStale(canCommit, transaction);
        snapshotsStore.put({ scope_key: scopeKey, snapshot: clone(snapshot), updated_at: nowIso() });
        throwIfStale(canCommit, transaction);
        await transactionPromise(transaction);
        return true;
      });
    },
    async persistActivity(event, outboxEvent, { canCommit } = {}) {
      return useDatabase(async (database) => {
        if (database.kind === "memory") return database.persistActivity(event, outboxEvent, { canCommit });
        const transaction = database.transaction(["activity_events", "outbox"], "readwrite");
        const activityStore = transaction.objectStore("activity_events");
        const outboxStore = transaction.objectStore("outbox");
        const [existingActivity, outboxRows] = await Promise.all([
          requestPromise(activityStore.get(event.event_id)),
          requestPromise(outboxStore.getAll()),
        ]);
        throwIfStale(canCommit);
        if (!existingActivity) {
          throwIfStale(canCommit, transaction);
          activityStore.put(clone(event));
          throwIfStale(canCommit, transaction);
        }
        if (!outboxRows.some((item) => item.event_id === outboxEvent.event_id)) {
          const scopeKey = outboxEvent.scope_key || "pending:pending";
          const sequence = outboxRows
            .filter((item) => item.scope_key === scopeKey)
            .reduce((max, item) => Math.max(max, Number(item.sequence || 0)), 0) + 1;
          throwIfStale(canCommit, transaction);
          outboxStore.put(normalizeOutboxEvent(outboxEvent, sequence));
          throwIfStale(canCommit, transaction);
        }
        throwIfStale(canCommit, transaction);
        await transactionPromise(transaction);
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
    async moveScope(fromScopeKey, toScopeKey, scope, { canCommit, targetSnapshot } = {}) {
      return useDatabase(async (database) => {
        if (database.kind === "memory") {
          return database.moveScope(fromScopeKey, toScopeKey, scope, { canCommit, targetSnapshot });
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
        throwIfStale(canCommit);
        throwIfStale(canCommit, transaction);
        snapshotsStore.delete(fromScopeKey);
        const sourceEvents = outboxRows
          .filter((event) => event.scope_key === fromScopeKey)
          .sort((left, right) => left.sequence - right.sequence);
        const targetEvents = outboxRows.filter((event) => event.scope_key === toScopeKey);
        let sequence = targetEvents.reduce((max, event) => Math.max(max, Number(event.sequence || 0)), 0);
        for (const event of sourceEvents) {
          throwIfStale(canCommit, transaction);
          outboxStore.delete(event.event_id);
          sequence += 1;
          const next = rehomeOutboxEvent(event, toScopeKey, scope);
          next.sequence = sequence;
          outboxStore.put(next);
          throwIfStale(canCommit, transaction);
        }
        for (const event of activityRows.filter((item) => item.scope_key === fromScopeKey)) {
          throwIfStale(canCommit, transaction);
          activityStore.delete(event.event_id);
          activityStore.put({
            ...clone(event),
            scope_key: toScopeKey,
            household_id: scope.household_id,
            profile_id: scope.profile_id,
          });
          throwIfStale(canCommit, transaction);
        }
        if (targetSnapshot !== undefined) {
          throwIfStale(canCommit, transaction);
          snapshotsStore.put({ scope_key: toScopeKey, snapshot: clone(targetSnapshot), updated_at: nowIso() });
        }
        throwIfStale(canCommit, transaction);
        await transactionPromise(transaction);
        return clone(snapshot || null);
      });
    },
  };
}

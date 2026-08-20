import { describe, expect, it } from "vitest";
import { createIndexedDbLearningDb, createMemoryLearningDb } from "../../src/learning-local-db.js";

function requestThatResolves(result) {
  const request = {};
  queueMicrotask(() => {
    request.result = result;
    request.onsuccess?.();
  });
  return request;
}

function requestThatRejects(error) {
  const request = {};
  queueMicrotask(() => {
    request.error = error;
    request.onerror?.();
  });
  return request;
}

function pendingRequest() {
  const request = {};
  return {
    request,
    resolve(result) {
      request.result = result;
      request.onsuccess?.();
    },
  };
}

function closingDatabase(error) {
  return {
    transaction() {
      throw error;
    },
  };
}

function snapshotDatabase(readSnapshot) {
  return {
    transaction(storeNames, mode) {
      expect(storeNames).toEqual(["snapshots"]);
      expect(mode).toBe("readonly");
      return {
        objectStore(storeName) {
          expect(storeName).toBe("snapshots");
          return { get: (scopeKey) => requestThatResolves(readSnapshot(scopeKey)) };
        },
      };
    },
  };
}

function closingError(message = "The database connection is closing.") {
  const error = new Error(message);
  error.name = "InvalidStateError";
  return error;
}

describe("local Growth Loop database", () => {
  it("isolates snapshots by household and profile scope", async () => {
    const db = createMemoryLearningDb();
    await db.putSnapshot("household-1:profile-1", { scope: { profile_id: "profile-1" }, value: 1 });
    await db.putSnapshot("household-1:profile-2", { scope: { profile_id: "profile-2" }, value: 2 });

    await expect(db.getSnapshot("household-1:profile-1")).resolves.toEqual({ scope: { profile_id: "profile-1" }, value: 1 });
    await expect(db.getSnapshot("household-1:profile-2")).resolves.toEqual({ scope: { profile_id: "profile-2" }, value: 2 });
  });

  it("assigns a monotonic sequence per scope and preserves outbox order", async () => {
    const db = createMemoryLearningDb();
    await db.appendOutbox({ event_id: "event-2", scope_key: "h:p", type: "point_record" });
    await db.appendOutbox({ event_id: "event-1", scope_key: "h:p", type: "point_item_upsert" });
    await db.appendOutbox({ event_id: "other", scope_key: "h:other", type: "point_record" });

    await expect(db.listOutbox("h:p")).resolves.toEqual([
      expect.objectContaining({ event_id: "event-2", sequence: 1 }),
      expect.objectContaining({ event_id: "event-1", sequence: 2 }),
    ]);
    await expect(db.listOutbox("h:other")).resolves.toEqual([
      expect.objectContaining({ event_id: "other", sequence: 1 }),
    ]);
  });

  it("does not duplicate the same event when an app retries the local write", async () => {
    const db = createMemoryLearningDb();
    const event = { event_id: "event-1", scope_key: "h:p", type: "point_record" };
    const first = await db.appendOutbox(event);
    const second = await db.appendOutbox(event);

    expect(second).toEqual(first);
    await expect(db.listOutbox("h:p")).resolves.toHaveLength(1);
  });

  it("keeps rejected events available for export instead of deleting them", async () => {
    const db = createMemoryLearningDb();
    await db.appendOutbox({ event_id: "event-1", scope_key: "h:p", type: "point_record" });
    await db.updateOutbox("event-1", { status: "rejected", error_code: "scope_deleted" });

    await expect(db.listOutbox("h:p", { statuses: ["rejected"] })).resolves.toEqual([
      expect.objectContaining({ event_id: "event-1", status: "rejected", error_code: "scope_deleted" }),
    ]);
  });

  it("claims an event once when two connections try to sync the same scope", async () => {
    const db = createMemoryLearningDb();
    await db.appendOutbox({ event_id: "event-1", scope_key: "h:p", type: "point_record" });

    await expect(db.claimOutbox("event-1", {
      worker_id: "tab-a",
      operation_id: "operation-a",
      now: 1000,
      lease_ms: 5000,
    })).resolves.toEqual(expect.objectContaining({
      event_id: "event-1",
      processing_by: "tab-a",
      lease_until: 6000,
      operation_id: "operation-a",
      lease_id: expect.any(String),
    }));
    await expect(db.claimOutbox("event-1", { worker_id: "tab-b", now: 1000, lease_ms: 5000 }))
      .resolves.toBe(false);
    await expect(db.getOutbox("event-1")).resolves.toEqual(expect.objectContaining({
      processing_by: "tab-a",
      lease_until: 6000,
    }));
  });

  it("does not replace a live lease with a new operation from the same worker", async () => {
    const db = createMemoryLearningDb();
    await db.appendOutbox({ event_id: "event-1", scope_key: "h:p", type: "point_record" });

    const first = await db.claimOutbox("event-1", {
      worker_id: "worker-a",
      operation_id: "operation-a",
      now: 1000,
      lease_ms: 5000,
    });
    await expect(db.claimOutbox("event-1", {
      worker_id: "worker-a",
      operation_id: "operation-b",
      now: 1000,
      lease_ms: 5000,
    })).resolves.toBe(false);
    await expect(db.getOutbox("event-1")).resolves.toEqual(expect.objectContaining({
      processing_by: "worker-a",
      operation_id: "operation-a",
      lease_id: first.lease_id,
    }));
  });

  it("moves pending local records and outbox events into the authenticated scope", async () => {
    const db = createMemoryLearningDb();
    await db.putSnapshot("pending:pending", { scope: { household_id: null, profile_id: null }, value: 1 });
    await db.appendOutbox({
      event_id: "event-1",
      scope_key: "pending:pending",
      household_id: null,
      profile_id: null,
      type: "point_record",
      payload: { profile_id: null },
    });

    await db.moveScope("pending:pending", "household-1:profile-1", {
      household_id: "household-1",
      profile_id: "profile-1",
    });

    await expect(db.getSnapshot("pending:pending")).resolves.toBeNull();
    await expect(db.getOutbox("event-1")).resolves.toEqual(expect.objectContaining({
      scope_key: "household-1:profile-1",
      household_id: "household-1",
      profile_id: "profile-1",
      payload: { profile_id: "profile-1" },
    }));
  });

  it("rolls back an atomic scope persist when its guard becomes stale", async () => {
    const db = createMemoryLearningDb();
    let checks = 0;

    await expect(db.persistScope(
      "household-1:profile-1",
      { scope: { household_id: "household-1", profile_id: "profile-1" } },
      [{ event_id: "event-1", scope_key: "household-1:profile-1", type: "point_record" }],
      { canCommit: () => checks++ !== 2 },
    )).rejects.toMatchObject({ code: "profile_scope_write_stale" });

    await expect(db.getSnapshot("household-1:profile-1")).resolves.toBeNull();
    await expect(db.getOutbox("event-1")).resolves.toBeNull();
  });

  it("rolls back activity and outbox together when their guard becomes stale", async () => {
    const db = createMemoryLearningDb();
    let checks = 0;
    const event = {
      event_id: "activity-1",
      scope_key: "household-1:profile-1",
      household_id: "household-1",
      profile_id: "profile-1",
      event_type: "household_activated",
    };
    const outboxEvent = {
      event_id: "activity-1",
      scope_key: "household-1:profile-1",
      type: "activity_event",
      payload: { event },
    };

    await expect(db.persistActivity(event, outboxEvent, {
      canCommit: () => checks++ !== 2,
    })).rejects.toMatchObject({ code: "profile_scope_write_stale" });

    await expect(db.listActivityEvents("household-1:profile-1")).resolves.toEqual([]);
    await expect(db.getOutbox("activity-1")).resolves.toBeNull();
  });

  it("aborts an IndexedDB write that becomes stale after request success before transaction complete", async () => {
    const snapshots = new Map();
    let current = true;
    let requestSucceeded = false;
    let transactionCompleted = false;
    const database = {
      transaction(storeNames, mode) {
        expect(storeNames).toEqual(["snapshots"]);
        const transaction = {
          error: null,
          objectStore(storeName) {
            expect(storeName).toBe("snapshots");
            return {
              put(row) {
                const previous = snapshots.get(row.scope_key);
                snapshots.set(row.scope_key, row);
                const request = {};
                queueMicrotask(() => {
                  request.result = row;
                  requestSucceeded = true;
                  request.onsuccess?.();
                  current = false;
                  setTimeout(() => {
                    if (transaction.aborted) return;
                    transactionCompleted = true;
                    transaction.oncomplete?.();
                  }, 15);
                });
                transaction.abort = () => {
                  if (transaction.aborted) return;
                  transaction.aborted = true;
                  if (previous === undefined) snapshots.delete(row.scope_key);
                  else snapshots.set(row.scope_key, previous);
                  transaction.error = new Error("indexeddb_transaction_aborted");
                  transaction.onabort?.();
                };
                return request;
              },
              get(scopeKey) {
                return requestThatResolves(snapshots.get(scopeKey));
              },
            };
          },
        };
        if (mode === "readonly") transaction.oncomplete = () => {};
        return transaction;
      },
    };
    const indexedDB = { open: () => requestThatResolves(database) };
    const db = createIndexedDbLearningDb({ indexedDB });

    await expect(db.putSnapshot(
      "household-1:profile-1",
      { scope: { household_id: "household-1", profile_id: "profile-1" } },
      { canCommit: () => current },
    )).rejects.toMatchObject({ code: "profile_scope_write_stale" });
    expect(requestSucceeded).toBe(true);
    expect(transactionCompleted).toBe(false);
    await expect(db.getSnapshot("household-1:profile-1")).resolves.toBeNull();
  });

  it("aborts when an operation signal fires in the microtask before transaction complete", async () => {
    const snapshots = new Map();
    const operation = new AbortController();
    let requestSucceeded = false;
    let transactionCompleted = false;
    const database = {
      transaction(storeNames, mode) {
        expect(storeNames).toEqual(["snapshots"]);
        const transaction = {
          error: null,
          objectStore(storeName) {
            expect(storeName).toBe("snapshots");
            return {
              put(row) {
                snapshots.set(row.scope_key, row);
                const request = {};
                queueMicrotask(() => {
                  request.result = row;
                  requestSucceeded = true;
                  request.onsuccess?.();
                  queueMicrotask(() => operation.abort());
                  queueMicrotask(() => {
                    if (transaction.aborted) return;
                    transactionCompleted = true;
                    transaction.oncomplete?.();
                  });
                });
                transaction.abort = () => {
                  if (transaction.aborted) return;
                  transaction.aborted = true;
                  snapshots.delete(row.scope_key);
                  transaction.error = new Error("indexeddb_transaction_aborted");
                  transaction.onabort?.();
                };
                return request;
              },
              get(scopeKey) {
                return requestThatResolves(snapshots.get(scopeKey));
              },
            };
          },
        };
        return transaction;
      },
    };
    const indexedDB = { open: () => requestThatResolves(database) };
    const db = createIndexedDbLearningDb({ indexedDB });

    await expect(db.putSnapshot(
      "household-1:profile-1",
      { scope: { household_id: "household-1", profile_id: "profile-1" } },
      { canCommit: () => true, signal: operation.signal },
    )).rejects.toMatchObject({ code: "profile_scope_write_stale" });
    expect(requestSucceeded).toBe(true);
    expect(transactionCompleted).toBe(false);
    await expect(db.getSnapshot("household-1:profile-1")).resolves.toBeNull();
  });

  it("keeps the requested learner scope when recovering a closing IndexedDB connection", async () => {
    let openCount = 0;
    const scopeKey = "household-1:profile-2";
    const requestedScopes = [];
    const healthyDatabase = snapshotDatabase((requestedScopeKey) => {
      requestedScopes.push(requestedScopeKey);
      return { snapshot: { scope_key: requestedScopeKey } };
    });
    const indexedDB = {
      open() {
        openCount += 1;
        return requestThatResolves(openCount === 1 ? closingDatabase(closingError()) : healthyDatabase);
      },
    };
    const db = createIndexedDbLearningDb({ indexedDB });

    await expect(db.getSnapshot(scopeKey)).resolves.toEqual({ scope_key: scopeKey });
    expect(requestedScopes).toEqual([scopeKey]);
    expect(openCount).toBe(2);
  });

  it("propagates non-closing IndexedDB errors without reopening", async () => {
    let openCount = 0;
    const error = closingError("The transaction is inactive.");
    const indexedDB = {
      open() {
        openCount += 1;
        return requestThatResolves(closingDatabase(error));
      },
    };
    const db = createIndexedDbLearningDb({ indexedDB });

    await expect(db.getSnapshot("household-1:profile-2")).rejects.toBe(error);
    expect(openCount).toBe(1);
  });

  it("retries a closing IndexedDB operation only once", async () => {
    let openCount = 0;
    const firstError = closingError();
    const retryError = closingError();
    const indexedDB = {
      open() {
        openCount += 1;
        return requestThatResolves(closingDatabase(openCount === 1 ? firstError : retryError));
      },
    };
    const db = createIndexedDbLearningDb({ indexedDB });

    await expect(db.getSnapshot("household-1:profile-2")).rejects.toBe(retryError);
    expect(openCount).toBe(2);
  });

  it("propagates a failed IndexedDB reopen instead of falling back to memory", async () => {
    let openCount = 0;
    const reopenError = new Error("indexeddb_reopen_failed");
    const indexedDB = {
      open() {
        openCount += 1;
        return openCount === 1
          ? requestThatResolves(closingDatabase(closingError()))
          : requestThatRejects(reopenError);
      },
    };
    const db = createIndexedDbLearningDb({ indexedDB });

    await expect(db.getSnapshot("household-1:profile-2")).rejects.toBe(reopenError);
    expect(openCount).toBe(2);
  });

  it("single-flights concurrent recovery of a closing IndexedDB connection", async () => {
    let openCount = 0;
    const reopen = pendingRequest();
    const healthyDatabase = snapshotDatabase((scopeKey) => ({ snapshot: { scope_key: scopeKey } }));
    const indexedDB = {
      open() {
        openCount += 1;
        return openCount === 1
          ? requestThatResolves(closingDatabase(closingError()))
          : reopen.request;
      },
    };
    const db = createIndexedDbLearningDb({ indexedDB });
    const firstRead = db.getSnapshot("household-1:profile-1");
    const secondRead = db.getSnapshot("household-1:profile-2");

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(openCount).toBe(2);

    reopen.resolve(healthyDatabase);
    await expect(Promise.all([firstRead, secondRead])).resolves.toEqual([
      { scope_key: "household-1:profile-1" },
      { scope_key: "household-1:profile-2" },
    ]);
  });
});

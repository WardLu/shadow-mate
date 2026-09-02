const activeTasks = new Map();
const LEASE_MS = 15_000;
const LEASE_PREFIX = "shadow-mate-piper-lock:";

function lockName(key) {
  return `shadow-mate-piper:${key}`;
}

function createOwnerToken() {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function readLease(storage, key) {
  try {
    const value = storage.getItem(`${LEASE_PREFIX}${key}`);
    return value ? JSON.parse(value) : null;
  } catch (_) {
    return null;
  }
}

function writeLease(storage, key, lease) {
  storage.setItem(`${LEASE_PREFIX}${key}`, JSON.stringify(lease));
  return readLease(storage, key)?.owner === lease.owner;
}

async function runWithLocalStorageLease(key, task) {
  const owner = createOwnerToken();
  const fallback = () => {
    const controller = new AbortController();
    return task({
      signal: controller.signal,
      canCommit: () => !controller.signal.aborted,
      ownerToken: owner,
      coordination: "same-tab-only",
    });
  };
  let storage;
  try {
    storage = globalThis.localStorage;
  } catch (_) {
    return fallback();
  }
  if (!storage) {
    return fallback();
  }

  const existing = readLease(storage, key);
  if (existing?.owner && existing.expiresAt > Date.now()) {
    throw new Error("Piper resource download is already active in another tab");
  }

  const lease = { owner, expiresAt: Date.now() + LEASE_MS };
  try {
    if (!writeLease(storage, key, lease)) throw new Error("Piper resource download lease is unavailable");
  } catch (_) {
    // Storage can be blocked by browser privacy settings. Keep the same-tab single flight,
    // but never assume this tab owns another tab's cache.
    return fallback();
  }

  const controller = new AbortController();
  let leaseLost = false;
  const loseLease = () => {
    if (leaseLost) return;
    leaseLost = true;
    controller.abort(new DOMException("Piper resource download lease was lost", "AbortError"));
  };
  const canCommit = () => {
    const current = readLease(storage, key);
    const owned = current?.owner === owner && current.expiresAt > Date.now();
    if (!owned) loseLease();
    return owned && !controller.signal.aborted;
  };
  const leaseKey = `${LEASE_PREFIX}${key}`;
  const onStorage = (event) => {
    if (event.key === leaseKey) canCommit();
  };
  globalThis.addEventListener?.("storage", onStorage);

  const renewal = globalThis.setInterval?.(() => {
    try {
      if (!canCommit()) return;
      if (!writeLease(storage, key, { owner, expiresAt: Date.now() + LEASE_MS })) loseLease();
    } catch (_) {
      // Completion is checked below; a failed renewal must not grant cross-tab ownership.
    }
  }, Math.floor(LEASE_MS / 2));

  try {
    const result = await task({ signal: controller.signal, canCommit, ownerToken: owner, coordination: "lease" });
    if (!canCommit()) throw new Error("Piper resource download lease was lost before completion");
    return result;
  } finally {
    globalThis.clearInterval?.(renewal);
    globalThis.removeEventListener?.("storage", onStorage);
    try {
      const current = readLease(storage, key);
      if (current?.owner === owner) storage.removeItem(`${LEASE_PREFIX}${key}`);
    } catch (_) {
      // Do not remove a lease we cannot prove belongs to this tab.
    }
  }
}

export function acquirePiperDownloadLock(key, task) {
  if (activeTasks.has(key)) return activeTasks.get(key);
  const run = () => {
    if (typeof globalThis.navigator?.locks?.request === "function") {
      return globalThis.navigator.locks.request(lockName(key), { mode: "exclusive" }, () => {
        const controller = new AbortController();
        return task({
          signal: controller.signal,
          canCommit: () => !controller.signal.aborted,
          ownerToken: createOwnerToken(),
          coordination: "web-lock",
        });
      });
    }
    return runWithLocalStorageLease(key, task);
  };
  const active = Promise.resolve().then(run).finally(() => activeTasks.delete(key));
  activeTasks.set(key, active);
  return active;
}

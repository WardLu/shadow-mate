const ANONYMOUS = { household_id: null, profile_id: null };
const BLOCK_KEY = 'shadow_mate_profile_scope_blocked';
const ACTIVE_KEY = 'shadow_mate_active_profile';

export function sameProfileScope(left, right) {
  return left?.household_id === right?.household_id && left?.profile_id === right?.profile_id;
}

/** Owns the local scope protocol. Storage adapters retain their transaction guards. */
export function createLearnerSession({ storage, sessionStorage, getLearningDesk, getGrowthLoop }) {
  let blocked = storage.getItem(BLOCK_KEY) === '1' || sessionStorage?.getItem(BLOCK_KEY) === '1';
  let identity = null;
  let scope = { ...ANONYMOUS };
  let ready = true;
  let switching = false;
  let queue = Promise.resolve();
  let abort = new AbortController();
  let operation = makeOperation();
  const listeners = new Set();

  function makeOperation() {
    const controller = abort;
    return Object.freeze({ signal: controller.signal, canCommit: () => !controller.signal.aborted && !isBlocked() });
  }
  function isBlocked() {
    if (!blocked) {
      try {
        if (storage.getItem(BLOCK_KEY) === '1' || sessionStorage?.getItem(BLOCK_KEY) === '1') block();
      } catch (_) { block(); }
    }
    return blocked;
  }
  function getStatus() {
    isBlocked();
    return { scope: { ...scope }, phase: blocked ? 'blocked' : switching ? 'switching' : 'ready',
      writable: !blocked && !switching && ready && (!identity || Boolean(scope.profile_id)) };
  }
  function notify() { for (const listener of listeners) listener(getStatus()); }
  function invalidate() {
    abort.abort();
    getGrowthLoop()?.invalidateWriteOperations?.();
    abort = new AbortController();
    operation = makeOperation();
    return operation;
  }
  function block() {
    blocked = true;
    ready = false;
    invalidate();
    try { storage.setItem(BLOCK_KEY, '1'); } catch (_) { /* The in-memory guard still holds. */ }
    notify();
  }
  function run(work, { advanceGeneration = true } = {}) {
    const captured = advanceGeneration ? invalidate() : operation;
    const result = queue.then(() => work(captured));
    queue = result.catch(() => {});
    return result;
  }
  async function restoreOne(getScope, restore, previous, target) {
    try {
      if (sameProfileScope(getScope(), previous)) return true;
      if (!sameProfileScope(getScope(), target)) return false;
      if (!sameProfileScope(getScope(), target)) return false;
      await restore(previous, { adoptPending: false });
      return sameProfileScope(getScope(), previous);
    } catch (_) { return false; }
  }
  async function transition(target, { adoptPending = false, operation: captured = operation, signedOut = false } = {}) {
    if (!captured.canCommit()) return { status: blocked ? 'blocked' : 'superseded', scope: { ...scope } };
    const growth = getGrowthLoop();
    const learning = getLearningDesk();
    const previous = { scope: { ...scope }, ready, identity, growth: growth?.getScope?.(), learning: learning?.getEnvelope?.()?.scope,
      key: storage.getItem(ACTIVE_KEY) };
    switching = true;
    notify();
    let stage = 'growth';
    try {
      if (!growth?.loadScope || !growth?.getScope || !learning?.setScope || !learning?.getEnvelope) {
        throw new Error('profile_scope_dependencies_missing');
      }
      for (let attempt = 0; attempt < 2; attempt++) {
        await growth.loadScope(target, { adoptPending, canCommit: captured.canCommit });
        if (!captured.canCommit()) throw new Error('superseded');
        if (sameProfileScope(growth.getScope(), target)) break;
        if (attempt === 1) throw new Error('growth_loop_scope_not_ready');
      }
      stage = 'learning';
      await learning.setScope(target, { adoptPending, canCommit: captured.canCommit });
      if (!captured.canCommit()) throw new Error('superseded');
      if (!sameProfileScope(learning.getEnvelope()?.scope, target) || !sameProfileScope(growth.getScope(), target)) {
        throw new Error('profile_scope_not_ready');
      }
      if (target.profile_id) storage.setItem(ACTIVE_KEY, target.profile_id);
      else storage.removeItem(ACTIVE_KEY);
      scope = { ...target };
      ready = true;
      return { status: 'committed', scope: { ...scope } };
    } catch (error) {
      const growthRestored = await restoreOne(() => growth?.getScope?.(), (s, o) => growth.loadScope(s, o), previous.growth, target);
      const learningRestored = await restoreOne(() => learning?.getEnvelope?.()?.scope, (s, o) => learning.setScope(s, o), previous.learning, target);
      let keyRestored = false;
      try {
        const key = storage.getItem(ACTIVE_KEY);
        if (key === previous.key || key === target.profile_id) {
          if (previous.key) storage.setItem(ACTIVE_KEY, previous.key);
          else storage.removeItem(ACTIVE_KEY);
          keyRestored = storage.getItem(ACTIVE_KEY) === previous.key;
        }
      } catch (_) { /* Restoration cannot be confirmed. */ }
      if (signedOut || !growthRestored || !learningRestored || !keyRestored) block();
      else { scope = previous.scope; ready = previous.identity === identity && previous.ready; }
      return { status: blocked ? 'blocked' : !captured.canCommit() ? 'superseded' : 'restored', scope: { ...scope }, stage };
    } finally { switching = false; notify(); }
  }
  function select(target, options = {}) {
    return options.operation ? transition(target, options)
      : run((captured) => transition(target, { ...options, operation: captured }));
  }
  async function resetLocal({ clearData = false } = {}) {
    if (!clearData) return run((captured) => transition(ANONYMOUS, { operation: captured, signedOut: true }));
    block();
    // Drain previous transitions before deleting their durable state.
    return run(async () => {
      try {
        storage.removeItem(ACTIVE_KEY);
        await getGrowthLoop().clearAllLocalData();
        getLearningDesk().clearLocalData({ reload: false });
        storage.removeItem(BLOCK_KEY);
        sessionStorage?.removeItem(BLOCK_KEY);
        if (storage.getItem(BLOCK_KEY) !== null || sessionStorage?.getItem(BLOCK_KEY)) throw new Error('scope_block_cleanup_failed');
        blocked = false;
        scope = { ...ANONYMOUS };
        ready = true;
        invalidate();
        notify();
        return { status: 'committed', scope: { ...scope } };
      } catch (error) { block(); throw error; }
    });
  }
  return {
    select, resetLocal, getStatus, captureOperation: () => operation, run, invalidate, block,
    canTransition: () => !isBlocked(),
    deactivate() { ready = false; invalidate(); notify(); },
    setIdentity(userId) {
      if (userId === identity) return;
      identity = userId;
      ready = false;
      invalidate();
      notify();
    },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  };
}

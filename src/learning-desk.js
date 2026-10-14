import { createLearningState, hasCompatibleContentLearningScope, transitionLearningState } from './learning-state.js';
import { getLearningStateStorageKey, migrateLegacyLearningState } from './learning-state-envelope.js';
import { loadLearningStateEnvelope, adoptPendingLearningState, clearLearningDeskStorage, LEGACY_LEARNING_STATE_KEY } from './learning-state-storage.js';
import { decodeLearningStateArchive, encodeLearningStateArchive } from './learning-state-codec.js';

const learningFrom = envelope => envelope?.schema_version === 2 && envelope.learning ? envelope.learning : envelope;
const isEnvelope = value => value?.schema_version === 2 && value.learning && typeof value.learning === 'object';
const sameScope = (left, right) => left?.household_id === right?.household_id && left?.profile_id === right?.profile_id;

/** One owner for learning state and its v1/v2 persistence contract. */
export function createLearningDesk({ storage, canWrite = () => true, canTransition = canWrite }) {
  const readStorage = canTransition() ? storage : { getItem: key => storage.getItem(key), setItem() {} };
  let envelope = loadLearningStateEnvelope(readStorage, {});
  let state = createLearningState(learningFrom(envelope));
  const listeners = new Set();
  let persistenceFailure = null;
  function getState() { return structuredClone(state); }
  function assertStorageAvailable() {
    if (persistenceFailure) throw persistenceFailure;
  }
  function learnerScopeFor(envelopeValue) {
    const profileId = envelopeValue?.scope?.profile_id;
    return typeof profileId === 'string' && profileId.trim() ? `profile:${profileId}` : 'anonymous';
  }
  function assertContentLearningScope(nextState, nextEnvelope) {
    if (!hasCompatibleContentLearningScope(nextState, learnerScopeFor(nextEnvelope))) {
      throw new RangeError('Content learning ledger scope does not match the learning envelope');
    }
  }
  function getEnvelope() {
    return structuredClone({ ...envelope, schema_version: 2, product_id: 'shadow-mate', learning: state });
  }
  function notify({ render = true, scopeChanged = false } = {}) {
    for (const listener of listeners) listener(getState(), { render, scopeChanged });
  }
  function persist({ canCommit = () => true, transition = false, nextState = state, nextEnvelope = envelope, priorScopedRaw } = {}) {
    assertStorageAvailable();
    if (!(transition ? canTransition() : canWrite()) || !canCommit()) return false;
    const committedEnvelope = structuredClone({
      ...nextEnvelope,
      schema_version: 2,
      product_id: 'shadow-mate',
      learning: nextState,
    });
    assertContentLearningScope(nextState, committedEnvelope);
    const serialized = JSON.stringify(encodeLearningStateArchive(committedEnvelope));
    const scopedKey = getLearningStateStorageKey(committedEnvelope.scope || {});
    const previousScopedRaw = priorScopedRaw !== undefined ? priorScopedRaw : storage.getItem(scopedKey);
    const previousLegacyRaw = storage.getItem(LEGACY_LEARNING_STATE_KEY);
    let scopedWriteAttempted = false;
    let legacyWriteAttempted = false;
    try {
      scopedWriteAttempted = true;
      storage.setItem(scopedKey, serialized);
      // Retain v1 readers without exporting the new Growth Loop ledger into points.
      legacyWriteAttempted = true;
      storage.setItem(LEGACY_LEARNING_STATE_KEY, JSON.stringify({ ...nextState, points: {} }));
      envelope = committedEnvelope;
      return true;
    } catch (error) {
      const compensationErrors = [];
      const restore = (key, raw) => {
        try {
          if (storage.getItem(key) !== raw) {
            if (raw === null) storage.removeItem(key);
            else storage.setItem(key, raw);
          }
          if (storage.getItem(key) !== raw) {
            throw new Error('restored value did not match the previous value');
          }
        } catch (cause) {
          compensationErrors.push(new Error(`learning_state_compensation_failed:${key}`, { cause }));
        }
      };
      if (scopedWriteAttempted) restore(scopedKey, previousScopedRaw);
      if (legacyWriteAttempted) restore(LEGACY_LEARNING_STATE_KEY, previousLegacyRaw);
      if (compensationErrors.length) {
        const details = compensationErrors.map(({ message }) => message).join(', ');
        persistenceFailure = new AggregateError(
          [error, ...compensationErrors],
          `learning_state_persist_failed:${error?.message || error}; ${details}`,
          { cause: error },
        );
        throw persistenceFailure;
      }
      throw error;
    }
  }
  return {
    getState, getEnvelope,
    async setScope(scope, { adoptPending = false, canCommit = () => true } = {}) {
      assertStorageAvailable();
      if (!canTransition() || !canCommit()) return getEnvelope();
      const scopedKey = getLearningStateStorageKey(scope || {});
      const priorScopedRaw = storage.getItem(scopedKey);
      let nextEnvelope;
      try {
        nextEnvelope = adoptPending ? adoptPendingLearningState(storage, scope) : loadLearningStateEnvelope(storage, scope);
      } catch (error) {
        if (storage.getItem(scopedKey) !== priorScopedRaw) {
          if (priorScopedRaw === null) storage.removeItem(scopedKey);
          else storage.setItem(scopedKey, priorScopedRaw);
        }
        throw error;
      }
      const nextState = createLearningState(learningFrom(nextEnvelope));
      assertContentLearningScope(nextState, nextEnvelope);
      if (!canTransition() || !canCommit()) {
        if (adoptPending && storage.getItem(scopedKey) !== priorScopedRaw) {
          if (priorScopedRaw === null) storage.removeItem(scopedKey);
          else storage.setItem(scopedKey, priorScopedRaw);
        }
        return getEnvelope();
      }
      if (!persist({ canCommit, transition: true, nextState, nextEnvelope, priorScopedRaw })) {
        if (adoptPending && storage.getItem(scopedKey) !== priorScopedRaw) {
          if (priorScopedRaw === null) storage.removeItem(scopedKey);
          else storage.setItem(scopedKey, priorScopedRaw);
        }
        return getEnvelope();
      }
      state = nextState;
      notify({ scopeChanged: true });
      return getEnvelope();
    },
    replaceState(next, { persist: write = false, render = true } = {}) {
      assertStorageAvailable();
      if (!canWrite()) return false;
      next = decodeLearningStateArchive(next);
      const nextEnvelope = isEnvelope(next) ? structuredClone(next) : getEnvelope();
      if (isEnvelope(next) && !sameScope(nextEnvelope.scope, envelope.scope)) return false;
      const nextLearning = isEnvelope(next) ? learningFrom(nextEnvelope) : next;
      const updated = transitionLearningState(state, { type: 'STATE_REPLACED', state: nextLearning });
      assertContentLearningScope(updated, nextEnvelope);
      const changed = JSON.stringify(updated) !== JSON.stringify(state)
        || (isEnvelope(next) && JSON.stringify(nextEnvelope) !== JSON.stringify(envelope));
      if (write && !persist({ nextState: updated, nextEnvelope })) return false;
      if (!write) envelope = nextEnvelope;
      state = updated;
      if (changed) notify({ render });
      return true;
    },
    flushLocalState: () => persist(),
    getPendingState() {
      assertStorageAvailable();
      return structuredClone(loadLearningStateEnvelope(storage, {}));
    },
    clearLocalData() {
      clearLearningDeskStorage(storage);
      persistenceFailure = null;
      envelope = migrateLegacyLearningState({}, {});
      state = createLearningState();
      notify({ scopeChanged: true });
    },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  };
}

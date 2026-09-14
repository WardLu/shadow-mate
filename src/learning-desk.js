import { createLearningState, transitionLearningState } from './learning-state.js';
import { getLearningStateStorageKey, migrateLegacyLearningState } from './learning-state-envelope.js';
import { loadLearningStateEnvelope, adoptPendingLearningState, clearLearningDeskStorage, LEGACY_LEARNING_STATE_KEY } from './learning-state-storage.js';

const learningFrom = envelope => envelope?.schema_version === 2 && envelope.learning ? envelope.learning : envelope;

/** One owner for learning state and its v1/v2 persistence contract. */
export function createLearningDesk({ storage, canWrite = () => true, canTransition = canWrite }) {
  const readStorage = canTransition() ? storage : { getItem: key => storage.getItem(key), setItem() {} };
  let envelope = loadLearningStateEnvelope(readStorage, {});
  let state = createLearningState(learningFrom(envelope));
  const listeners = new Set();
  function getState() { return structuredClone(state); }
  function getEnvelope() {
    return structuredClone({ ...envelope, schema_version: 2, product_id: 'shadow-mate', learning: state });
  }
  function notify({ render = true, scopeChanged = false } = {}) {
    for (const listener of listeners) listener(getState(), { render, scopeChanged });
  }
  function persist({ canCommit = () => true, transition = false } = {}) {
    if (!(transition ? canTransition() : canWrite()) || !canCommit()) return false;
    envelope = getEnvelope();
    storage.setItem(getLearningStateStorageKey(envelope.scope || {}), JSON.stringify(envelope));
    // Retain v1 readers without exporting the new Growth Loop ledger into points.
    storage.setItem(LEGACY_LEARNING_STATE_KEY, JSON.stringify({ ...state, points: {} }));
    return true;
  }
  return {
    getState, getEnvelope,
    async setScope(scope, { adoptPending = false, canCommit = () => true } = {}) {
      if (!canTransition() || !canCommit()) return getEnvelope();
      envelope = adoptPending ? adoptPendingLearningState(storage, scope) : loadLearningStateEnvelope(storage, scope);
      state = createLearningState(learningFrom(envelope));
      if (!canTransition() || !canCommit()) return getEnvelope();
      persist({ canCommit, transition: true });
      notify({ scopeChanged: true });
      return getEnvelope();
    },
    replaceState(next, { persist: write = false, render = true } = {}) {
      if (!canWrite()) return false;
      const updated = transitionLearningState(state, { type: 'STATE_REPLACED', state: learningFrom(next) });
      const changed = JSON.stringify(updated) !== JSON.stringify(state);
      state = updated;
      if (write && !persist()) return false;
      if (changed) notify({ render });
      return true;
    },
    flushLocalState: () => persist(),
    getPendingState: () => structuredClone(loadLearningStateEnvelope(storage, {})),
    clearLocalData() {
      clearLearningDeskStorage(storage);
      envelope = migrateLegacyLearningState({}, {});
      state = createLearningState();
      notify({ scopeChanged: true });
    },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  };
}

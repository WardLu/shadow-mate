import { beforeEach, expect, it, vi } from 'vitest';
import { createLearningDesk } from '../../src/learning-desk.js';
import { getLearningStateStorageKey, migrateLegacyLearningState } from '../../src/learning-state-envelope.js';
import { LEGACY_LEARNING_STATE_KEY } from '../../src/learning-state-storage.js';
import { resolveDailyLearningPlan } from '../../src/content-learning.js';

const A = { household_id: 'h', profile_id: 'a' };
const B = { household_id: 'h', profile_id: 'b' };
const state = { checkins: { '2026-09-14': { math: true } }, points: { old: 3 } };
function makeLedger(learnerScope = 'anonymous') {
  return resolveDailyLearningPlan({
    learning: null,
    learnerScope,
    dayKey: '2026-10-12',
    packageId: 'foundation-v2',
    catalog: { version: 'test-v1', english: [{ id: 'word-a', order: 1 }] },
    enabledActivities: ['english'],
    deviceId: 'device-a',
  }).nextLearning;
}
beforeEach(() => localStorage.clear());

it('migrates legacy learning and retains it through a reopen', () => {
  localStorage.setItem('shadow_mate_workbench_v1', JSON.stringify(state));
  const desk = createLearningDesk({ storage: localStorage });
  expect(desk.getState().checkins).toEqual(state.checkins);
  desk.flushLocalState();
  expect(createLearningDesk({ storage: localStorage }).getState().checkins).toEqual(state.checkins);
  expect(JSON.parse(localStorage.getItem('shadow_mate_workbench_v1')).points).toEqual({});
});
it('isolates two learner states and returns detached copies', async () => {
  const desk = createLearningDesk({ storage: localStorage });
  await desk.setScope(A);
  desk.replaceState(state, { persist: true });
  await desk.setScope(B);
  expect(desk.getState().checkins).toEqual({});
  await desk.setScope(A);
  const copy = desk.getState();
  copy.checkins = {};
  expect(desk.getState().checkins).toEqual(state.checkins);
  const reopened = createLearningDesk({ storage: localStorage });
  await reopened.setScope(A);
  expect(reopened.getState().checkins).toEqual(state.checkins);
});
it('does not migrate or write while protection is active', async () => {
  localStorage.setItem('shadow_mate_workbench_v1', JSON.stringify(state));
  const before = { ...localStorage };
  const desk = createLearningDesk({ storage: localStorage, canWrite: () => false });
  await desk.setScope(A, { adoptPending: true });
  expect(desk.replaceState({}, { persist: true })).toBe(false);
  expect(desk.flushLocalState()).toBe(false);
  expect({ ...localStorage }).toEqual(before);
});
it('does not acknowledge a failed compatibility write and can retry the same state', () => {
  let fail = false;
  const storage = {
    getItem: key => localStorage.getItem(key),
    setItem(key, value) {
      if (fail && key === 'shadow_mate_workbench_v1') throw new Error('quota_exceeded');
      localStorage.setItem(key, value);
    },
    removeItem: key => localStorage.removeItem(key),
  };
  const desk = createLearningDesk({ storage });
  const changed = vi.fn();
  desk.subscribe(changed);
  const stateBefore = desk.getState();
  const envelopeBefore = desk.getEnvelope();
  const scopedRawBefore = localStorage.getItem(getLearningStateStorageKey());
  const legacyRawBefore = localStorage.getItem('shadow_mate_workbench_v1');
  fail = true;
  expect(() => desk.replaceState(state, { persist: true })).toThrow('quota_exceeded');
  expect(changed).not.toHaveBeenCalled();
  expect(desk.getState()).toEqual(stateBefore);
  expect(desk.getEnvelope()).toEqual(envelopeBefore);
  expect(localStorage.getItem(getLearningStateStorageKey())).toBe(scopedRawBefore);
  expect(localStorage.getItem('shadow_mate_workbench_v1')).toBe(legacyRawBefore);
  fail = false;
  expect(desk.replaceState(state, { persist: true })).toBe(true);
  expect(createLearningDesk({ storage }).getState().checkins).toEqual(state.checkins);
});
it('reports compensation failure and retains the original write error when v2 cannot be restored', () => {
  let fail = false;
  let v2Writes = 0;
  const storage = {
    getItem: key => localStorage.getItem(key),
    setItem(key, value) {
      if (fail && key === 'shadow_mate_workbench_v1') throw new Error('quota_exceeded');
      if (fail && key === getLearningStateStorageKey() && ++v2Writes > 1) {
        throw new Error('compensation_denied');
      }
      localStorage.setItem(key, value);
    },
    removeItem: key => localStorage.removeItem(key),
  };
  const desk = createLearningDesk({ storage });
  const oldRaw = localStorage.getItem(getLearningStateStorageKey());
  fail = true;

  let caught;
  try {
    desk.replaceState(state, { persist: true });
  } catch (error) {
    caught = error;
  }

  expect(caught).toBeInstanceOf(AggregateError);
  expect(caught.message).toContain('quota_exceeded');
  expect(caught.message).toContain('learning_state_compensation_failed:shadow_mate_learning_v2:pending');
  expect(caught.errors[0].message).toBe('quota_exceeded');
  expect(caught.errors[1].cause.message).toBe('compensation_denied');
  expect(desk.getState().checkins).toEqual({});
  expect(desk.getEnvelope().learning.checkins).toEqual({});
  expect(localStorage.getItem(getLearningStateStorageKey())).not.toBe(oldRaw);
});
it('reports first-write failure without claiming the new state is durable', () => {
  let fail = false;
  const storage = {
    getItem: key => localStorage.getItem(key),
    setItem(key, value) { if (fail) throw new Error('storage_denied'); localStorage.setItem(key, value); },
    removeItem: key => localStorage.removeItem(key),
  };
  const desk = createLearningDesk({ storage });
  fail = true;
  expect(() => desk.replaceState(state, { persist: true })).toThrow('storage_denied');
  expect(createLearningDesk({ storage: localStorage }).getState().checkins).toEqual({});
  expect(desk.getState().checkins).toEqual({});
});
it('adopts pending data once and can clear all owned keys without deleting unrelated data', async () => {
  const desk = createLearningDesk({ storage: localStorage });
  desk.replaceState(state, { persist: true });
  await desk.setScope(A, { adoptPending: true });
  await desk.setScope(A, { adoptPending: true });
  expect(desk.getState().checkins).toEqual(state.checkins);
  localStorage.setItem('unrelated', 'keep');
  desk.clearLocalData({ reload: false });
  expect(Object.keys(localStorage)).toEqual(['unrelated']);
  expect(desk.getState().checkins).toEqual({});
});
it('explicitly adopts anonymous content learning into one child and fail-closes regular scope replacement', async () => {
  const pendingEnvelope = migrateLegacyLearningState({ extra: { contentLearningV1: makeLedger() } });
  localStorage.setItem('shadow_mate_learning_v2:pending', JSON.stringify(pendingEnvelope));
  const desk = createLearningDesk({ storage: localStorage });
  await desk.setScope(A, { adoptPending: true });
  const adopted = desk.getState().extra.contentLearningV1;
  expect(adopted.learnerScope).toBe('profile:a');
  const adoptedPlan = Object.values(adopted.plans['2026-10-12'].candidates)[0];
  expect(adoptedPlan.learnerScope).toBe('profile:a');
  expect(adoptedPlan.planId).not.toBe(Object.values(makeLedger().plans['2026-10-12'].candidates)[0].planId);
  expect(desk.getEnvelope().migration.adopted_to).toBe('a');

  const otherChild = createLearningDesk({ storage: localStorage });
  await otherChild.setScope(B);
  expect(otherChild.getState().extra.contentLearningV1).toBeUndefined();

  const wrongEnvelope = migrateLegacyLearningState({}, A);
  wrongEnvelope.learning.content_config = { enabled: false };
  const wrongState = makeLedger('profile:b');
  wrongEnvelope.learning.extra.contentLearningV1 = wrongState;
  expect(() => desk.replaceState(wrongEnvelope, { persist: true })).toThrow(/scope/i);
  expect(desk.getState().extra.contentLearningV1.learnerScope).toBe('profile:a');
});
it('atomically replaces scoped envelope metadata while keeping the learner scope', async () => {
  const desk = createLearningDesk({ storage: localStorage });
  await desk.setScope(A);
  const remoteEnvelope = {
    ...desk.getEnvelope(),
    legacy: { points_readonly: { '2026-08': { '0': { '1': 1 } } } },
    extensions: { content_sync: { cursor: 'remote-cursor' } },
    migration: { source_schema: 'remote-v2' },
  };
  expect(desk.replaceState(remoteEnvelope, { persist: true, render: false })).toBe(true);
  expect(desk.getEnvelope()).toMatchObject({
    scope: A,
    legacy: remoteEnvelope.legacy,
    extensions: remoteEnvelope.extensions,
    migration: remoteEnvelope.migration,
  });
  const saved = JSON.parse(localStorage.getItem(getLearningStateStorageKey(A)));
  expect(saved).toMatchObject({ legacy: remoteEnvelope.legacy, extensions: remoteEnvelope.extensions, migration: remoteEnvelope.migration });
  desk.replaceState(state, { persist: true });
  expect(desk.getEnvelope()).toMatchObject({ learning: { checkins: state.checkins }, extensions: remoteEnvelope.extensions });
  const reopened = createLearningDesk({ storage: localStorage });
  await reopened.setScope(A);
  expect(reopened.getEnvelope()).toMatchObject({ legacy: remoteEnvelope.legacy, extensions: remoteEnvelope.extensions, migration: remoteEnvelope.migration });
});
it('refuses regular child activation with a ledger owned by another child and preserves the active state', async () => {
  const desk = createLearningDesk({ storage: localStorage });
  await desk.setScope(A);
  desk.replaceState(state, { persist: true });
  const before = desk.getEnvelope();
  const wrongEnvelope = migrateLegacyLearningState({ extra: { contentLearningV1: makeLedger('profile:a') } }, B);
  const raw = JSON.stringify(wrongEnvelope);
  localStorage.setItem(getLearningStateStorageKey(B), raw);
  const changed = vi.fn();
  desk.subscribe(changed);

  await expect(desk.setScope(B)).rejects.toThrow(/scope/i);
  expect(desk.getEnvelope()).toEqual(before);
  expect(localStorage.getItem(getLearningStateStorageKey(B))).toBe(raw);
  expect(changed).not.toHaveBeenCalled();
  expect(desk.replaceState({ ...before, scope: B }, { persist: true })).toBe(false);
  expect(desk.getEnvelope()).toEqual(before);
});
it('does not notify or mutate when an operation is already stale', async () => {
  const desk = createLearningDesk({ storage: localStorage });
  const changed = vi.fn();
  desk.subscribe(changed);
  await desk.setScope(A, { canCommit: () => false });
  expect(changed).not.toHaveBeenCalled();
  expect(desk.getEnvelope().scope.profile_id).toBeNull();
});
it('clearing local data resets the persistence failure latch', () => {
  let fail = false;
  const storage = {
    getItem: key => localStorage.getItem(key),
    setItem(key, value) { if (fail) throw new Error('storage_denied'); localStorage.setItem(key, value); },
    removeItem: key => localStorage.removeItem(key),
  };
  const desk = createLearningDesk({ storage });
  fail = true;
  expect(() => desk.replaceState(state, { persist: true })).toThrow('storage_denied');
  fail = false;
  desk.clearLocalData();
  expect(desk.replaceState(state, { persist: true })).toBe(true);
});
it('restores previous target scoped raw when adopting pending fails during legacy persistence', async () => {
  const map = new Map();
  let failLegacy = false;
  const storage = {
    getItem: key => map.get(key) ?? null,
    setItem(key, value) {
      if (failLegacy && key === LEGACY_LEARNING_STATE_KEY) throw new Error('quota_exceeded');
      map.set(key, value);
    },
    removeItem: key => map.delete(key),
  };
  const desk = createLearningDesk({ storage });
  desk.replaceState(state, { persist: true });
  const targetKey = getLearningStateStorageKey(B);
  map.set(targetKey, 'prior-target-b');
  failLegacy = true;
  await expect(desk.setScope(B, { adoptPending: true })).rejects.toThrow('quota_exceeded');
  expect(map.get(targetKey)).toBe('prior-target-b');
  expect(desk.getEnvelope().scope.profile_id).toBeNull();
});

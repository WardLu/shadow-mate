import { beforeEach, expect, it, vi } from 'vitest';
import { createLearningDesk } from '../../src/learning-desk.js';
import { getLearningStateStorageKey } from '../../src/learning-state-envelope.js';

const A = { household_id: 'h', profile_id: 'a' };
const B = { household_id: 'h', profile_id: 'b' };
const state = { checkins: { '2026-09-14': { math: true } }, points: { old: 3 } };
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
  };
  const desk = createLearningDesk({ storage });
  const changed = vi.fn();
  desk.subscribe(changed);
  fail = true;
  expect(() => desk.replaceState(state, { persist: true })).toThrow('quota_exceeded');
  expect(changed).not.toHaveBeenCalled();
  expect(JSON.parse(localStorage.getItem(getLearningStateStorageKey())).learning.checkins).toEqual(state.checkins);
  fail = false;
  expect(desk.flushLocalState()).toBe(true);
  expect(createLearningDesk({ storage }).getState().checkins).toEqual(state.checkins);
});
it('reports first-write failure without claiming the new state is durable', () => {
  let fail = false;
  const storage = {
    getItem: key => localStorage.getItem(key),
    setItem(key, value) { if (fail) throw new Error('storage_denied'); localStorage.setItem(key, value); },
  };
  const desk = createLearningDesk({ storage });
  fail = true;
  expect(() => desk.replaceState(state, { persist: true })).toThrow('storage_denied');
  expect(createLearningDesk({ storage: localStorage }).getState().checkins).toEqual({});
  expect(desk.getState().checkins).toEqual(state.checkins);
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
it('does not notify or mutate when an operation is already stale', async () => {
  const desk = createLearningDesk({ storage: localStorage });
  const changed = vi.fn();
  desk.subscribe(changed);
  await desk.setScope(A, { canCommit: () => false });
  expect(changed).not.toHaveBeenCalled();
  expect(desk.getEnvelope().scope.profile_id).toBeNull();
});

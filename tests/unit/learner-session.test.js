import { createLearningDesk } from "../../src/learning-desk.js";
import { beforeEach, describe, expect, it } from 'vitest';
import { createLearnerSession } from '../../src/learner-session.js';
import { createGrowthLoopController } from '../../src/learning-growth-loop-controller.js';
import { createMemoryLearningDb } from '../../src/learning-local-db.js';

const A = { household_id: 'household', profile_id: 'a' };
const B = { household_id: 'household', profile_id: 'b' };
const C = { household_id: 'household', profile_id: 'c' };
const pending = { household_id: null, profile_id: null };
function fixture() {
  const db = createMemoryLearningDb();
  let session;
  const growth = createGrowthLoopController({ db,
    canWrite: () => session.getStatus().writable,
    canTransition: () => session.canTransition(),
  });
  const learning = createLearningDesk({ storage: localStorage,
    canWrite: () => !session || session.getStatus().writable,
    canTransition: () => !session || session.canTransition(),
  });
  session = createLearnerSession({ storage: localStorage, sessionStorage, getLearningDesk: () => learning, getGrowthLoop: () => growth });
  return { session, growth, learning, db };
}
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });
describe('learner session protocol', () => {
  it('honors another tab setting the durable block before the next write', async () => {
    const { session, growth, learning } = fixture();
    await session.select(A);
    const operation = session.captureOperation();
    localStorage.setItem('shadow_mate_profile_scope_blocked', '1');
    expect(session.getStatus().writable).toBe(false);
    expect(operation.canCommit()).toBe(false);
    expect(session.canTransition()).toBe(false);
    expect(learning.replaceState({ checkins: { leaked: true } }, { persist: true })).toBe(false);
    await growth.recordPoint({ item: { id: 'tidy', name: '整理', default_points: 2 }, occurred_on: '2026-09-14', request_id: 'blocked-point' });
    expect(growth.getSnapshot().ledger).toHaveLength(0);
  });
  it('commits both scopes and restores the previous learner after a target write fails', async () => {
    const { session, growth, learning } = fixture();
    await session.select(A);
    const setScope = learning.setScope;
    learning.setScope = async (scope) => {
      if (scope.profile_id === 'b') throw new Error('target_write_failed');
      return setScope(scope);
    };
    expect((await session.select(B)).status).toBe('restored');
    expect(growth.getScope()).toEqual(A);
    expect(learning.getEnvelope().scope).toEqual(A);
    expect(session.getStatus()).toMatchObject({ scope: A, writable: true });
    expect(localStorage.getItem('shadow_mate_active_profile')).toBe('a');
  });
  it('invalidates a delayed transition and commits only the last requested learner', async () => {
    const { session, growth, learning } = fixture();
    await session.select(A);
    let release;
    let started;
    const entered = new Promise(resolve => { started = resolve; });
    const setScope = learning.setScope;
    learning.setScope = async (scope) => {
      if (scope.profile_id === 'b') { started(); await new Promise(resolve => { release = resolve; }); }
      return setScope(scope);
    };
    const old = session.captureOperation();
    const b = session.select(B);
    await entered;
    const c = session.select(C);
    release();
    expect((await b).status).toBe('superseded');
    expect((await c).status).toBe('committed');
    expect(old.canCommit()).toBe(false);
    expect(growth.getScope()).toEqual(C);
    expect(learning.getEnvelope().scope).toEqual(C);
  });
  it('keeps protection across reload and failed cleanup, then clears both stores', async () => {
    const { session, growth, learning } = fixture();
    await session.select(A);
    const setScope = learning.setScope;
    learning.setScope = async (scope) => {
      await setScope(scope);
      throw new Error('target_and_rollback_failed');
    };
    expect((await session.select(B)).status).toBe('blocked');
    expect(fixture().session.getStatus().writable).toBe(false);
    const clear = growth.clearAllLocalData;
    growth.clearAllLocalData = async () => { throw new Error('clear_failed'); };
    await expect(session.resetLocal({ clearData: true })).rejects.toThrow('clear_failed');
    expect(localStorage.getItem('shadow_mate_profile_scope_blocked')).toBe('1');
    growth.clearAllLocalData = clear;
    expect((await session.resetLocal({ clearData: true })).status).toBe('committed');
    expect(session.getStatus().writable).toBe(true);
    expect(learning.getEnvelope().scope).toEqual(pending);
  });
  it('distinguishes account changes from token refresh and blocks failed sign-out reset', async () => {
    const { session, growth } = fixture();
    session.setIdentity('parent-a');
    await session.select(A);
    const operation = session.captureOperation();
    session.setIdentity('parent-a');
    expect(operation.canCommit()).toBe(true);
    session.setIdentity('parent-b');
    expect(operation.signal.aborted).toBe(true);
    expect(session.getStatus().writable).toBe(false);
    session.setIdentity(null);
    growth.loadScope = async () => { throw new Error('reset_failed'); };
    expect((await session.resetLocal({ clearData: false })).status).toBe('blocked');
  });
  it('adopts pending ledger and outbox without duplicating either on repeated selection', async () => {
    const { session, growth, db } = fixture();
    await growth.hydrate();
    await growth.recordPoint({ item: { id: 'tidy', name: '整理玩具', default_points: 2 }, occurred_on: '2026-09-14', request_id: 'point-1' });
    await session.select(A, { adoptPending: true });
    await session.select(A, { adoptPending: true });
    expect(growth.getSnapshot().ledger).toHaveLength(1);
    expect(await db.getSnapshot('pending:pending')).toBeNull();
    expect((await growth.pendingOutbox()).filter(e => e.event_id === 'point-1')).toHaveLength(1);
  });
});

import { describe, expect, it, vi } from "vitest";
import {
  createGrowthLoopRetryScheduler,
  growthLoopRemoteRetryDelay,
} from "../../src/learning-growth-loop-retry.js";

function createFakeClock() {
  let currentTime = 0;
  let nextTimerId = 1;
  const timers = new Map();

  return {
    now: () => currentTime,
    setTimer(callback, delay) {
      const id = nextTimerId;
      nextTimerId += 1;
      timers.set(id, { callback, at: currentTime + delay });
      return id;
    },
    clearTimer(id) {
      timers.delete(id);
    },
    advanceTo(targetAt) {
      currentTime = targetAt;
      const due = [...timers.entries()]
        .filter(([, timer]) => timer.at <= currentTime)
        .sort((left, right) => left[1].at - right[1].at);
      for (const [id, timer] of due) {
        timers.delete(id);
        timer.callback();
      }
    },
    scheduledTimes() {
      return [...timers.values()].map((timer) => timer.at).sort((left, right) => left - right);
    },
  };
}

describe("Growth Loop remote snapshot retry", () => {
  it("uses exponential delays instead of polling fixed every second during continuous 5xx failures", () => {
    expect([1, 2, 3, 4].map((failures) => growthLoopRemoteRetryDelay(failures, {
      jitter: 0,
    }))).toEqual([1000, 2000, 4000, 8000]);
  });

  it("applies jitter without exceeding the 15 minute hard cap", () => {
    expect(growthLoopRemoteRetryDelay(1, { random: () => 0 })).toBe(800);
    expect(growthLoopRemoteRetryDelay(1, { random: () => 1 })).toBe(1200);
    expect(growthLoopRemoteRetryDelay(100, { random: () => 1 })).toBe(15 * 60 * 1000);
  });

  it("cancels the pending retry and returns to base delay after a profile or session scope change", () => {
    const clock = createFakeClock();
    const scheduler = createGrowthLoopRetryScheduler({
      now: clock.now,
      setTimer: clock.setTimer,
      clearTimer: clock.clearTimer,
      jitter: 0,
      onTimer: vi.fn(),
    });

    expect(scheduler.recordRemoteFailure()).toBe(1000);
    clock.advanceTo(1000);
    expect(scheduler.recordRemoteFailure()).toBe(3000);

    scheduler.resetRemoteFailures({ clearTimer: true });

    expect(scheduler.recordRemoteFailure()).toBe(2000);
    expect(clock.scheduledTimes()).toEqual([2000]);
  });

  it("allows one immediate online attempt and returns its failure to the existing backoff sequence", () => {
    const clock = createFakeClock();
    const onTimer = vi.fn();
    const scheduler = createGrowthLoopRetryScheduler({
      now: clock.now,
      setTimer: clock.setTimer,
      clearTimer: clock.clearTimer,
      jitter: 0,
      onTimer,
    });

    expect(scheduler.recordRemoteFailure()).toBe(1000);
    clock.advanceTo(1000);
    expect(scheduler.recordRemoteFailure()).toBe(3000);

    expect(scheduler.scheduleNow()).toBe(1000);
    expect(clock.scheduledTimes()).toEqual([1000]);
    clock.advanceTo(1000);
    expect(onTimer).toHaveBeenCalledTimes(2);

    expect(scheduler.recordRemoteFailure()).toBe(5000);
    expect(clock.scheduledTimes()).toEqual([5000]);
  });

  it("keeps an earlier timer when a later retry is proposed", () => {
    const clock = createFakeClock();
    const scheduler = createGrowthLoopRetryScheduler({
      now: clock.now,
      setTimer: clock.setTimer,
      clearTimer: clock.clearTimer,
      jitter: 0,
      onTimer: vi.fn(),
    });

    expect(scheduler.scheduleAt(5000)).toBe(5000);
    expect(scheduler.scheduleAt(7000)).toBe(5000);
    expect(clock.scheduledTimes()).toEqual([5000]);

    expect(scheduler.scheduleAt(3000)).toBe(3000);
    expect(clock.scheduledTimes()).toEqual([3000]);
  });
});

import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  createSoundEngine,
  DEFAULT_SETTINGS,
  normalizeSettings,
  renderRecipe,
  SOUND_EVENT_KEYS,
  SOUND_EVENTS,
} from "../../src/learning-sounds.js";

function createFakeAudioContext() {
  const oscillators = [];
  const ctx = {
    currentTime: 100,
    state: "running",
    destination: { label: "destination" },
    resume: vi.fn(() => Promise.resolve()),
    createGain: () => ({
      gain: {
        value: 0,
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
    }),
    createBiquadFilter: () => ({
      type: "bandpass",
      frequency: { value: 0 },
      Q: { value: 1 },
      connect: vi.fn(),
    }),
    createOscillator: () => {
      const oscillator = {
        type: "sine",
        frequency: { value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      };
      oscillators.push(oscillator);
      return oscillator;
    },
  };
  return { ctx, oscillators };
}

function createMemoryStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, String(value)); },
    removeItem: (key) => { map.delete(key); },
    clear: () => { map.clear(); },
    raw: (key) => map.get(key),
  };
}

function makeEngine({ settings, now } = {}) {
  let current = now || 1000;
  const clock = () => current;
  const storage = createMemoryStorage();
  if (settings) {
    storage.setItem("shadow_mate_sound_settings_v1", JSON.stringify(settings));
  }
  const engine = createSoundEngine({
    storage,
    now: clock,
    getAudioContext: () => createFakeAudioContext().ctx,
  });
  return { engine, storage, advance: (ms) => { current += ms; } };
}

let storage; // 每个用例的独立内存存储。

beforeEach(() => {
  storage = createMemoryStorage();
});

describe("fixed event recipes", () => {
  it("defines exactly the five stable events with the expected priority order", () => {
    expect(SOUND_EVENT_KEYS).toEqual([
      "action_completed",
      "points_earned",
      "try_again",
      "points_deducted",
      "reward_fulfilled",
    ]);
    expect(SOUND_EVENTS.reward_fulfilled.priority).toBeGreaterThan(SOUND_EVENTS.points_earned.priority);
    expect(SOUND_EVENTS.points_earned.priority).toBeGreaterThan(SOUND_EVENTS.action_completed.priority);
  });

  it("keeps two to three fixed variants per event and never randomizes recipes", () => {
    for (const key of SOUND_EVENT_KEYS) {
      const variants = Object.values(SOUND_EVENTS[key].variants);
      expect(variants.length).toBeGreaterThanOrEqual(2);
      expect(variants.length).toBeLessThanOrEqual(3);
      for (const variant of variants) {
        expect(variant.recipe.maxDurationMs).toBeGreaterThan(0);
        expect(Array.isArray(variant.recipe.notes)).toBe(true);
        expect(variant.recipe.notes.length).toBeGreaterThan(0);
        for (const note of variant.recipe.notes) {
          expect(Number.isFinite(note.freq) || (Array.isArray(note.freq) && note.freq.length === 2)).toBe(true);
          expect(Number.isFinite(note.gain)).toBe(true);
          expect(note.gain).toBeGreaterThan(0);
        }
        // 配方是纯数据（可 JSON 往返），保证固定不随机。
        expect(JSON.parse(JSON.stringify(variant.recipe))).toEqual(variant.recipe);
      }
    }
  });

  it("keeps negative events soft and non-alarming", () => {
    const tryAgain = Object.values(SOUND_EVENTS.try_again.variants).map((v) => v.recipe);
    const deducted = Object.values(SOUND_EVENTS.points_deducted.variants).map((v) => v.recipe);
    const negativePeaks = [...tryAgain, ...deducted].flatMap((recipe) => recipe.notes.map((note) => note.gain));
    expect(Math.max(...negativePeaks)).toBeLessThan(0.45);
    expect(tryAgain.every((recipe) => recipe.notes.every((note) => note.wave === "sine"))).toBe(true);
  });
});

describe("settings normalization and persistence", () => {
  it("defaults to master on, 60% volume, all events on, default variants", () => {
    const settings = DEFAULT_SETTINGS;
    expect(settings.enabled).toBe(true);
    expect(settings.volume).toBe(0.6);
    for (const key of SOUND_EVENT_KEYS) {
      expect(settings.events[key].enabled).toBe(true);
      expect(settings.events[key].variant).toBe(SOUND_EVENTS[key].defaultVariant);
    }
  });

  it("sanitizes invalid stored values back to defaults", () => {
    const normalized = normalizeSettings({
      enabled: "no",
      volume: 99,
      events: { action_completed: { enabled: false, variant: "not_a_variant" } },
    });
    expect(normalized.enabled).toBe(true);
    expect(normalized.volume).toBe(1);
    expect(normalized.events.action_completed.enabled).toBe(false);
    expect(normalized.events.action_completed.variant).toBe("block_click");
  });

  it("persists changes to device-local storage and loads them back", () => {
    const { engine, storage } = makeEngine();
    engine.setEnabled(false);
    engine.setVolume(0.4);
    engine.setEventEnabled("points_earned", false);
    engine.setEventVariant("reward_fulfilled", "chest_open");
    const saved = JSON.parse(storage.raw("shadow_mate_sound_settings_v1"));
    expect(saved.enabled).toBe(false);
    expect(saved.volume).toBe(0.4);
    expect(saved.events.points_earned.enabled).toBe(false);
    expect(saved.events.reward_fulfilled.variant).toBe("chest_open");

    const reloaded = createSoundEngine({ storage, now: () => 0 }).getSettings();
    expect(reloaded.enabled).toBe(false);
    expect(reloaded.volume).toBe(0.4);
    expect(reloaded.events.points_earned.enabled).toBe(false);
    expect(reloaded.events.reward_fulfilled.variant).toBe("chest_open");
  });

  it("restores defaults on demand", () => {
    const { engine } = makeEngine();
    engine.setEnabled(false);
    engine.setVolume(0.1);
    engine.setEventVariant("points_earned", "star_triple");
    engine.resetDefaults();
    expect(engine.getSettings()).toEqual(DEFAULT_SETTINGS);
  });
});

describe("play gating and boundaries", () => {
  it("silently drops plays when master or the event is disabled", () => {
    const { engine } = makeEngine();
    engine.setEnabled(false);
    expect(engine.play("action_completed")).toEqual({ played: false, reason: "master_disabled" });
    engine.setEnabled(true);
    engine.setEventEnabled("points_earned", false);
    expect(engine.play("points_earned")).toEqual({ played: false, reason: "event_disabled" });
    expect(engine.play("action_completed")).toEqual({ played: true, duration: 220, event: "action_completed" });
  });

  it("skips UI sounds while TTS is playing and resumes after it finishes", () => {
    const { engine, advance } = makeEngine();
    engine.setTtsActive(true);
    expect(engine.play("action_completed")).toEqual({ played: false, reason: "tts_active" });
    expect(engine.preview("points_earned")).toEqual({ played: false, reason: "tts_active" });
    engine.setTtsActive(false);
    advance(1000);
    expect(engine.play("action_completed").played).toBe(true);
  });

  it("throttles rapid repeated plays and does not overlap sounds", () => {
    const { engine, advance } = makeEngine();
    expect(engine.play("action_completed").played).toBe(true);
    // 同一个事件在防重窗口内被丢弃。
    advance(50);
    expect(engine.play("action_completed").reason).toBe("throttled");
    // 上一个音效仍在播放期内时，其它事件也被节流，保证不叠加。
    expect(engine.play("points_earned").reason).toBe("busy");
    // 上一音效结束后，其它事件可以播放；正在播放的事件仍被节流。
    advance(500);
    expect(engine.play("points_earned").played).toBe(true);
    expect(engine.play("action_completed").reason).toBe("busy");
    // 完全结束后可以再次播放。
    advance(500);
    expect(engine.play("action_completed").played).toBe(true);
  });

  it("drops an unknown event without throwing", () => {
    const { engine } = makeEngine();
    expect(engine.play("not_an_event")).toEqual({ played: false, reason: "unknown_event" });
  });

  it("degrades silently when the audio context is unavailable", () => {
    const engine = createSoundEngine({ storage, now: () => 0, getAudioContext: () => null });
    expect(engine.play("points_earned")).toEqual({ played: false, reason: "unavailable" });
  });

  it("never lets a failing render affect business state", () => {
    const render = vi.fn(() => null);
    const engine = createSoundEngine({
      storage,
      now: () => 0,
      render,
      getAudioContext: () => createFakeAudioContext().ctx,
    });
    const result = engine.play("action_completed");
    expect(result).toEqual({ played: false, reason: "unavailable" });
    expect(() => engine.getSettings()).not.toThrow();
  });
});

describe("priority selection", () => {
  it("plays only the highest-priority event for one operation", () => {
    const { engine, advance } = makeEngine();
    const result = engine.playPriority(["action_completed", "points_earned"]);
    expect(result.event).toBe("points_earned");
    // 上一音效结束后，再次从同一操作的多事件中选择最高优先级。
    advance(1000);
    const top = engine.playPriority(["action_completed", "points_earned", "reward_fulfilled"]);
    expect(top.event).toBe("reward_fulfilled");
  });

  it("falls through to the next enabled event when the top one is disabled", () => {
    const { engine } = makeEngine();
    engine.setEventEnabled("points_earned", false);
    const result = engine.playPriority(["action_completed", "points_earned"]);
    expect(result.event).toBe("action_completed");
  });

  it("plays nothing when no candidate is playable", () => {
    const { engine } = makeEngine();
    engine.setEnabled(false);
    expect(engine.playPriority(["action_completed", "points_earned"])).toEqual({ played: false, reason: "none_playable" });
  });
});

describe("preview and variant selection", () => {
  it("previews the selected variant even when the event is disabled", () => {
    const { engine } = makeEngine();
    engine.setEventEnabled("points_earned", false);
    engine.setEventVariant("points_earned", "star_triple");
    const result = engine.preview("points_earned");
    expect(result.played).toBe(true);
    expect(result.variant).toBe("star_triple");
  });

  it("previews a specific variant override", () => {
    const { engine } = makeEngine();
    const result = engine.preview("reward_fulfilled", { variant: "finish_chord" });
    expect(result.played).toBe(true);
    expect(result.variant).toBe("finish_chord");
  });
});

describe("web audio rendering", () => {
  it("schedules one oscillator per recipe note through a live context", () => {
    const { ctx, oscillators } = createFakeAudioContext();
    const duration = renderRecipe(SOUND_EVENTS.action_completed.variants.block_click.recipe, {
      volume: 0.6,
      getAudioContext: () => ctx,
    });
    expect(duration).toBe(220);
    expect(oscillators.length).toBe(2);
    expect(oscillators[0].start).toHaveBeenCalled();
    expect(oscillators[0].stop).toHaveBeenCalled();
  });

  it("returns null and never throws when there is no audio context", () => {
    expect(renderRecipe(SOUND_EVENTS.reward_fulfilled.variants.squad_cheer.recipe, { getAudioContext: () => null })).toBe(null);
  });

  it("returns null and never throws when a context throws mid-render", () => {
    const broken = {
      currentTime: 0,
      state: "running",
      destination: {},
      createGain: () => { throw new Error("audio blocked"); },
    };
    expect(() => renderRecipe(SOUND_EVENTS.points_earned.variants.star_collect.recipe, { getAudioContext: () => broken })).not.toThrow();
    expect(renderRecipe(SOUND_EVENTS.points_earned.variants.star_collect.recipe, { getAudioContext: () => broken })).toBe(null);
  });
});

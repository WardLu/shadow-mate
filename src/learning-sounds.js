/* 影伴品牌音效引擎：Web Audio 实时合成 + 设备级设置
 *
 * - 五类事件固定配方（不随机生成），每类 2~3 个内置变体。
 * - 设置仅保存在当前设备（localStorage），不同步云端。
 * - 播放边界：同操作只播最高优先级、不叠加节流、TTS 互斥、
 *   浏览器阻止/音频不可用时静默降级，绝不影响业务写入。
 * - 默认音量克制；"再试一次"与"扣除积分"不使用强烈负向声音。
 */

const STORAGE_KEY = "shadow_mate_sound_settings_v1";
const REPEAT_THROTTLE_MS = 300;
const PLAY_GAP_MS = 60;

export const SOUND_EVENT_KEYS = [
  "action_completed",
  "points_earned",
  "try_again",
  "points_deducted",
  "reward_fulfilled",
];

export const SOUND_EVENTS = {
  action_completed: {
    label: "完成行动",
    priority: 3,
    defaultVariant: "block_click",
    variants: {
      block_click: {
        name: "积木咔嗒",
        recipe: {
          maxDurationMs: 220,
          notes: [
            { t: 0, dur: 80, freq: 520, wave: "triangle", gain: 0.5, filter: { type: "bandpass", freq: 2000, q: 1.1 } },
            { t: 70, dur: 120, freq: 700, wave: "triangle", gain: 0.55, filter: { type: "bandpass", freq: 2200, q: 1.1 } },
          ],
        },
      },
      little_rise: {
        name: "小小上扬",
        recipe: {
          maxDurationMs: 180,
          notes: [
            { t: 0, dur: 70, freq: 660, wave: "sine", gain: 0.4 },
            { t: 55, dur: 100, freq: 880, wave: "sine", gain: 0.45 },
          ],
        },
      },
      bubble_done: {
        name: "泡泡完成",
        recipe: {
          maxDurationMs: 230,
          notes: [
            { t: 0, dur: 90, freq: 587.33, wave: "sine", gain: 0.42 },
            { t: 90, dur: 120, freq: 783.99, wave: "sine", gain: 0.5 },
          ],
        },
      },
    },
  },
  points_earned: {
    label: "获得积分",
    priority: 4,
    defaultVariant: "star_collect",
    variants: {
      star_collect: {
        name: "星星收集",
        recipe: {
          maxDurationMs: 330,
          notes: [
            { t: 0, dur: 90, freq: 523.25, wave: "triangle", gain: 0.55 },
            { t: 90, dur: 90, freq: 659.25, wave: "triangle", gain: 0.6 },
            { t: 180, dur: 130, freq: 783.99, wave: "triangle", gain: 0.65 },
          ],
        },
      },
      flash_twin: {
        name: "闪光两连",
        recipe: {
          maxDurationMs: 280,
          notes: [
            { t: 0, dur: 110, freq: 880, wave: "triangle", gain: 0.55 },
            { t: 100, dur: 150, freq: 1318.51, wave: "triangle", gain: 0.62 },
          ],
        },
      },
      star_triple: {
        name: "星光三连",
        recipe: {
          maxDurationMs: 300,
          notes: [
            { t: 0, dur: 80, freq: 659.25, wave: "triangle", gain: 0.5 },
            { t: 80, dur: 80, freq: 880, wave: "triangle", gain: 0.55 },
            { t: 160, dur: 120, freq: 1174.66, wave: "triangle", gain: 0.6 },
          ],
        },
      },
    },
  },
  try_again: {
    label: "再试一次",
    priority: 2,
    defaultVariant: "bubble_bounce",
    variants: {
      bubble_bounce: {
        name: "泡泡回弹",
        recipe: {
          maxDurationMs: 220,
          notes: [
            { t: 0, dur: 130, freq: [392, 500], wave: "sine", gain: 0.4 },
            { t: 110, dur: 90, freq: 440, wave: "sine", gain: 0.25 },
          ],
        },
      },
      gentle_nudge: {
        name: "轻轻提醒",
        recipe: {
          maxDurationMs: 200,
          notes: [
            { t: 0, dur: 80, freq: 523.25, wave: "sine", gain: 0.32 },
            { t: 90, dur: 100, freq: 587.33, wave: "sine", gain: 0.3 },
          ],
        },
      },
      small_step: {
        name: "小步再来",
        recipe: {
          maxDurationMs: 240,
          notes: [
            { t: 0, dur: 70, freq: 392, wave: "sine", gain: 0.34 },
            { t: 70, dur: 80, freq: 466.16, wave: "sine", gain: 0.34 },
            { t: 140, dur: 90, freq: 523.25, wave: "sine", gain: 0.3 },
          ],
        },
      },
    },
  },
  points_deducted: {
    label: "扣除积分",
    priority: 1,
    defaultVariant: "soft_reminder",
    variants: {
      soft_reminder: {
        name: "柔和提醒",
        recipe: {
          maxDurationMs: 220,
          notes: [
            { t: 0, dur: 90, freq: 329.63, wave: "sine", gain: 0.3 },
            { t: 90, dur: 120, freq: 293.66, wave: "sine", gain: 0.28 },
          ],
        },
      },
      slow_down: {
        name: "慢一点",
        recipe: {
          maxDurationMs: 270,
          notes: [
            { t: 0, dur: 110, freq: 349.23, wave: "sine", gain: 0.3 },
            { t: 120, dur: 140, freq: 311.13, wave: "sine", gain: 0.28 },
          ],
        },
      },
      soft_wooden: {
        name: "轻声木鱼",
        recipe: {
          maxDurationMs: 170,
          notes: [
            { t: 0, dur: 60, freq: 660, wave: "triangle", gain: 0.3, filter: { type: "bandpass", freq: 1800, q: 1.3 } },
            { t: 90, dur: 60, freq: 660, wave: "triangle", gain: 0.26, filter: { type: "bandpass", freq: 1800, q: 1.3 } },
          ],
        },
      },
    },
  },
  reward_fulfilled: {
    label: "奖励已兑现",
    priority: 5,
    defaultVariant: "squad_cheer",
    variants: {
      squad_cheer: {
        name: "小队庆祝",
        recipe: {
          maxDurationMs: 680,
          notes: [
            { t: 0, dur: 110, freq: 523.25, wave: "triangle", gain: 0.5 },
            { t: 100, dur: 110, freq: 659.25, wave: "triangle", gain: 0.52 },
            { t: 200, dur: 110, freq: 783.99, wave: "triangle", gain: 0.55 },
            { t: 300, dur: 130, freq: 1046.5, wave: "triangle", gain: 0.6 },
            { t: 480, dur: 180, freq: 523.25, wave: "sine", gain: 0.28 },
            { t: 480, dur: 180, freq: 783.99, wave: "sine", gain: 0.28 },
            { t: 480, dur: 180, freq: 1046.5, wave: "sine", gain: 0.28 },
          ],
        },
      },
      chest_open: {
        name: "宝箱打开",
        recipe: {
          maxDurationMs: 560,
          notes: [
            { t: 0, dur: 110, freq: 392, wave: "triangle", gain: 0.5 },
            { t: 100, dur: 110, freq: 523.25, wave: "triangle", gain: 0.55 },
            { t: 200, dur: 120, freq: 659.25, wave: "triangle", gain: 0.58 },
            { t: 320, dur: 220, freq: 523.25, wave: "sine", gain: 0.26 },
            { t: 320, dur: 220, freq: 659.25, wave: "sine", gain: 0.26 },
            { t: 320, dur: 220, freq: 783.99, wave: "sine", gain: 0.26 },
          ],
        },
      },
      finish_chord: {
        name: "完成和弦",
        recipe: {
          maxDurationMs: 500,
          notes: [
            { t: 0, dur: 420, freq: 523.25, wave: "sine", gain: 0.26 },
            { t: 0, dur: 420, freq: 659.25, wave: "sine", gain: 0.26 },
            { t: 0, dur: 420, freq: 783.99, wave: "sine", gain: 0.26 },
            { t: 180, dur: 200, freq: 1046.5, wave: "triangle", gain: 0.3 },
          ],
        },
      },
    },
  },
};

export function normalizeSettings(input = {}) {
  const events = {};
  for (const key of SOUND_EVENT_KEYS) {
    const def = SOUND_EVENTS[key];
    const raw = input?.events?.[key] || {};
    events[key] = {
      enabled: raw.enabled !== false,
      variant: def.variants[raw.variant] ? raw.variant : def.defaultVariant,
    };
  }
  const rawVolume = Number(input?.volume);
  return {
    schema_version: 1,
    enabled: input?.enabled !== false,
    volume: Number.isFinite(rawVolume) ? Math.max(0, Math.min(1, rawVolume)) : 0.6,
    events,
  };
}

export const DEFAULT_SETTINGS = normalizeSettings({});

function cloneSettings(settings) {
  return structuredClone(settings);
}

function loadSettings(store) {
  if (!store) return cloneSettings(DEFAULT_SETTINGS);
  try {
    const raw = JSON.parse(store.getItem(STORAGE_KEY) || "null");
    return normalizeSettings(raw);
  } catch (_) {
    return cloneSettings(DEFAULT_SETTINGS);
  }
}

function saveSettings(store, settings) {
  if (!store) return;
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (_) {
    // 存储不可用（隐私模式/配额）时静默降级为仅本次会话有效。
  }
}

let sharedContext = null;

function defaultGetAudioContext() {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (typeof Ctor !== "function") return null;
  if (!sharedContext || sharedContext.state === "closed") {
    try {
      sharedContext = new Ctor();
    } catch (_) {
      sharedContext = null;
    }
  }
  return sharedContext;
}

export function renderRecipe(recipe, { volume = 1, getAudioContext = defaultGetAudioContext } = {}) {
  const ctx = getAudioContext();
  if (!ctx) return null;
  try {
    if (typeof ctx.resume === "function" && ctx.state === "suspended") {
      try {
        void ctx.resume();
      } catch (_) {
        // 用户手势之外被暂停时，等待下次手势即可。
      }
    }
    const master = ctx.createGain();
    master.gain.value = Math.max(0, Math.min(1, volume));
    master.connect(ctx.destination);
    for (const note of recipe.notes || []) {
      const start = ctx.currentTime + (note.t || 0) / 1000;
      const duration = Math.max(0.03, (note.dur || 100) / 1000);
      const osc = ctx.createOscillator();
      osc.type = note.wave || "sine";
      const freq = note.freq;
      osc.frequency.setValueAtTime(Array.isArray(freq) ? freq[0] : freq, start);
      if (Array.isArray(freq) && freq.length === 2) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(1, freq[1]), start + duration);
      }
      const envelope = ctx.createGain();
      const peak = Math.max(0, Math.min(1, note.gain || 0.3));
      const attack = Math.max(0.001, (note.attack || 5) / 1000);
      envelope.gain.setValueAtTime(0.0001, start);
      envelope.gain.linearRampToValueAtTime(peak, start + attack);
      envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      let output = envelope;
      if (note.filter) {
        const filter = ctx.createBiquadFilter();
        filter.type = note.filter.type || "bandpass";
        filter.frequency.value = note.filter.freq || 1200;
        filter.Q.value = note.filter.q ?? 1;
        envelope.connect(filter);
        output = filter;
      }
      osc.connect(envelope);
      output.connect(master);
      osc.start(start);
      osc.stop(start + duration + 0.05);
    }
    return Number(recipe.maxDurationMs) || 0;
  } catch (_) {
    // 音频上下文异常/浏览器阻止播放：静默降级，不向业务抛出。
    return null;
  }
}

export function createSoundEngine({
  storage = null,
  now = () => Date.now(),
  getAudioContext = defaultGetAudioContext,
  render = renderRecipe,
} = {}) {
  const store = storage || (typeof window !== "undefined" ? window.localStorage : null);
  let settings = loadSettings(store);
  let ttsActive = false;
  let activeUntil = 0;
  const lastPlayedAt = Object.fromEntries(SOUND_EVENT_KEYS.map((key) => [key, -Infinity]));

  function persist() {
    saveSettings(store, settings);
  }

  function getSettings() {
    return cloneSettings(settings);
  }

  function setEnabled(value) {
    settings = { ...settings, enabled: Boolean(value) };
    persist();
  }

  function setVolume(value) {
    const volume = Number(value);
    settings = { ...settings, volume: Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : settings.volume };
    persist();
  }

  function setEventEnabled(event, value) {
    if (!SOUND_EVENTS[event]) return;
    settings = {
      ...settings,
      events: { ...settings.events, [event]: { ...settings.events[event], enabled: Boolean(value) } },
    };
    persist();
  }

  function setEventVariant(event, variant) {
    if (!SOUND_EVENTS[event] || !SOUND_EVENTS[event].variants[variant]) return;
    settings = {
      ...settings,
      events: { ...settings.events, [event]: { ...settings.events[event], variant } },
    };
    persist();
  }

  function resetDefaults() {
    settings = cloneSettings(DEFAULT_SETTINGS);
    persist();
  }

  function setTtsActive(value) {
    ttsActive = Boolean(value);
  }

  function isTtsActive() {
    return ttsActive;
  }

  function resolveRecipe(event, variantOverride = null) {
    const def = SOUND_EVENTS[event];
    if (!def) return null;
    const variantKey = variantOverride || settings.events[event]?.variant || def.defaultVariant;
    const variant = def.variants[variantKey] || def.variants[def.defaultVariant];
    return { recipe: variant.recipe, variantKey };
  }

  function play(event, { force = false } = {}) {
    const def = SOUND_EVENTS[event];
    if (!def) return { played: false, reason: "unknown_event" };
    const eventSettings = settings.events[event] || DEFAULT_SETTINGS.events[event];
    if (!force) {
      if (!settings.enabled) return { played: false, reason: "master_disabled" };
      if (!eventSettings.enabled) return { played: false, reason: "event_disabled" };
      if (ttsActive) return { played: false, reason: "tts_active" };
      const time = now();
      if (time - lastPlayedAt[event] < REPEAT_THROTTLE_MS) return { played: false, reason: "throttled" };
      if (time < activeUntil) return { played: false, reason: "busy" };
    }
    const resolved = resolveRecipe(event);
    if (!resolved) return { played: false, reason: "no_recipe" };
    const duration = render(resolved.recipe, { volume: settings.volume, getAudioContext });
    if (duration === null) return { played: false, reason: "unavailable" };
    if (!force) {
      const time = now();
      lastPlayedAt[event] = time;
      activeUntil = time + duration + PLAY_GAP_MS;
    }
    return { played: true, duration, event };
  }

  function preview(event, { variant = null, force = false } = {}) {
    const def = SOUND_EVENTS[event];
    if (!def) return { played: false, reason: "unknown_event" };
    if (!force && ttsActive) return { played: false, reason: "tts_active" };
    const resolved = resolveRecipe(event, variant);
    if (!resolved) return { played: false, reason: "no_recipe" };
    const duration = render(resolved.recipe, { volume: settings.volume, getAudioContext });
    if (duration === null) return { played: false, reason: "unavailable" };
    return { played: true, duration, event, variant: resolved.variantKey };
  }

  function playPriority(events, options = {}) {
    const candidates = [...events].filter((event) => SOUND_EVENTS[event]);
    if (!candidates.length) return { played: false, reason: "unknown_event" };
    const ranked = candidates.slice().sort((a, b) => SOUND_EVENTS[b].priority - SOUND_EVENTS[a].priority);
    for (const event of ranked) {
      const result = play(event, options);
      if (result.played) return result;
      if (result.reason === "unavailable" || result.reason === "unknown_event") break;
    }
    return { played: false, reason: "none_playable" };
  }

  return {
    getSettings,
    setEnabled,
    setVolume,
    setEventEnabled,
    setEventVariant,
    resetDefaults,
    setTtsActive,
    isTtsActive,
    play,
    preview,
    playPriority,
  };
}

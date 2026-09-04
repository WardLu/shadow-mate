import { describe, expect, it, vi } from "vitest";
import { createPiperPhonemizeRuntime, phonemizeChineseText } from "../../src/piper-pinyin.js";

const PINYIN_ID_MAP = {
  _: [0],
  "^": [1],
  $: [2],
  "Ø": [3],
  b: [4],
  d: [8],
  f: [7],
  h: [14],
  k: [13],
  w: [26],
  zh: [18],
  a: [27],
  ai: [30],
  e: [29],
  en: [35],
  er: [62],
  i: [39],
  u: [49],
  ua: [50],
  ang: [36],
  "1": [64],
  "2": [65],
  "3": [66],
  "4": [67],
  "5": [68],
  "。": [69],
};

const CHINESE_METADATA = {
  phoneme_type: "pinyin",
  phoneme_id_map: PINYIN_ID_MAP,
};

describe("Chinese Piper Pinyin phonemization", () => {
  it("turns 花 into the Chaowen model's expected initial, final, and tone ids", () => {
    const result = phonemizeChineseText("花", CHINESE_METADATA);

    expect(result.phonemes).toEqual(["h", "ua", "1"]);
    expect(result.phoneme_ids).toEqual([1, 14, 50, 64, 0, 2]);
  });

  it("keeps tones and punctuation for a fixed curriculum meaning", () => {
    const result = phonemizeChineseText("植物开放的部分。", CHINESE_METADATA);

    expect(result.phonemes).toEqual([
      "zh", "i", "2",
      "w", "u", "4",
      "k", "ai", "1",
      "f", "ang", "4",
      "d", "e", "5",
      "b", "u", "4",
      "f", "en", "5",
      "。",
    ]);
    expect(result.phoneme_ids).not.toContain(undefined);
    expect(result.phoneme_ids.at(-1)).toBe(2);
  });

  it("uses the model's zero-initial token for 二", () => {
    const result = phonemizeChineseText("二", CHINESE_METADATA);

    expect(result.phonemes).toEqual(["Ø", "er", "4"]);
    expect(result.phoneme_ids).toEqual([1, 3, 62, 67, 0, 2]);
  });

  it("fails closed when a Pinyin token is absent from the voice metadata", () => {
    expect(() => phonemizeChineseText("花", {
      ...CHINESE_METADATA,
      phoneme_id_map: { ...PINYIN_ID_MAP, ua: undefined },
    })).toThrow(/unsupported Pinyin phoneme/i);
  });

  it("keeps non-Pinyin voices on the existing eSpeak runtime", async () => {
    const espeakResult = { phonemes: ["e", "n"], phoneme_ids: [1, 2] };
    const espeakRuntime = {
      phonemize: vi.fn().mockResolvedValue(espeakResult),
      destroy: vi.fn(),
    };
    const runtime = createPiperPhonemizeRuntime(espeakRuntime);
    const voice = [{ phoneme_type: "espeak", espeak: { voice: "en-us" } }];

    await expect(runtime.phonemize("rain", voice)).resolves.toBe(espeakResult);
    expect(espeakRuntime.phonemize).toHaveBeenCalledWith("rain", voice);
    runtime.destroy();
    expect(espeakRuntime.destroy).toHaveBeenCalledOnce();
  });
});

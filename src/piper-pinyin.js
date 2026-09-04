import { pinyin } from "pinyin-pro";

const PINYIN_INITIALS = [
  "zh", "ch", "sh",
  "b", "p", "m", "f", "d", "t", "n", "l", "g", "k", "h",
  "j", "q", "x", "r", "z", "c", "s", "y", "w",
];

const GROUP_END_PHONEMES = new Set([
  "1", "2", "3", "4", "5",
  "。", "？", "！", ".", "?", "!",
  "—", "…", "、", "，", "：", "；", ",", ":", ";", " ",
]);

function requireIds(idMap, phoneme) {
  const ids = idMap?.[phoneme];
  if (!Array.isArray(ids) || ids.length === 0 || ids.some((id) => !Number.isInteger(id))) {
    throw new Error(`Unsupported Pinyin phoneme: ${phoneme}`);
  }
  return ids;
}

function splitPinyinSyllable(value) {
  const normalized = String(value || "")
    .toLowerCase()
    .replaceAll("u:", "v")
    .replaceAll("ü", "v")
    .replace(/0$/, "5");
  const match = normalized.match(/^([a-zv]+?)([1-5])$/);
  if (!match) return null;
  const [, base, tone] = match;
  const initial = PINYIN_INITIALS.find((candidate) => base.startsWith(candidate)) || "Ø";
  const final = initial === "Ø" ? base : base.slice(initial.length);
  if (!final) throw new Error(`Unsupported Pinyin syllable: ${value}`);
  return [initial, final, tone];
}

export function phonemizeChineseText(text, metadata) {
  if (metadata?.phoneme_type !== "pinyin") {
    throw new Error("Chinese Piper voice must declare phoneme_type pinyin");
  }
  const idMap = metadata.phoneme_id_map;
  const sourceText = String(text || "").trim();
  if (!sourceText) throw new Error("Chinese Piper text is empty");

  const phonemes = [];
  const sourceTokens = pinyin(sourceText, { toneType: "num", type: "array" });
  for (const token of sourceTokens) {
    const syllable = splitPinyinSyllable(token);
    if (syllable) {
      for (const phoneme of syllable) {
        requireIds(idMap, phoneme);
        phonemes.push(phoneme);
      }
      continue;
    }
    requireIds(idMap, token);
    phonemes.push(token);
  }

  const phonemeIds = [...requireIds(idMap, "^")];
  for (const phoneme of phonemes) {
    phonemeIds.push(...requireIds(idMap, phoneme));
    if (GROUP_END_PHONEMES.has(phoneme)) phonemeIds.push(...requireIds(idMap, "_"));
  }
  phonemeIds.push(...requireIds(idMap, "$"));

  return {
    text: sourceText,
    phonemes,
    phoneme_ids: phonemeIds,
  };
}

export function createPiperPhonemizeRuntime(espeakRuntime) {
  return {
    phonemize(text, voice) {
      const metadata = voice?.[0];
      if (metadata?.phoneme_type === "pinyin") {
        return Promise.resolve(phonemizeChineseText(text, metadata));
      }
      return espeakRuntime.phonemize(text, voice);
    },
    destroy() {
      espeakRuntime.destroy?.();
    },
  };
}

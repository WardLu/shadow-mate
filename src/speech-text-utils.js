// Utility functions for preparing child-friendly speech text for Web Speech / TTS

const DIGIT_TO_CHINESE = {
  "0": "零",
  "1": "一",
  "2": "二",
  "3": "三",
  "4": "四",
  "5": "五",
  "6": "六",
  "7": "七",
  "8": "八",
  "9": "九",
  "10": "十",
};

/**
 * Clean and format text to be read naturally by TTS engines for children.
 * @param {string} text
 * @returns {string}
 */
export function cleanSpeechText(text) {
  if (!text) return "";
  let s = String(text);

  // 1. Remove emojis and symbol pictographs
  s = s.replace(/\p{Extended_Pictographic}/gu, "");
  s = s.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}]/gu, "");

  // 2. Oral conversion for common instructional phrases
  s = s.replace(/按\s*1\s*递增/g, "按一递增");
  s = s.replace(/4\s*[×*xX]\s*4/g, "四乘四");

  // Convert digit-digit ranges like "1-4" or "1~4"
  s = s.replace(/(\d+)\s*[-~至到]\s*(\d+)/g, (_, start, end) => {
    const sCn = DIGIT_TO_CHINESE[start] || start;
    const eCn = DIGIT_TO_CHINESE[end] || end;
    return `${sCn}到${eCn}`;
  });

  // 3. Smooth brackets: replace parenthesis with commas so TTS pauses rather than reading brackets
  s = s.replace(/[（(]([^）)]+)[）)]/g, "，$1，");

  // 4. Remove book titles brackets 《 》, quotes 「」“”
  s = s.replace(/[《》「」“”"']/g, "");

  // 5. Clean up duplicate punctuation and whitespaces
  s = s.replace(/[，,]{2,}/g, "，");
  s = s.replace(/^[，,\s]+|[，,\s]+$/g, "");
  s = s.replace(/\s+/g, " ").trim();

  return s;
}

function normalizeVoiceLocale(locale) {
  return typeof locale === "string" ? locale.trim().replace(/_/g, "-").toLowerCase() : "";
}

export function isCantoneseVoiceLocale(locale) {
  const normalized = normalizeVoiceLocale(locale);
  return /^yue(?:-|$)/.test(normalized) || /^zh-(?:hans-|hant-)?hk(?:-|$)/.test(normalized);
}

/** Mandarin aliases must never capture a Cantonese voice. */
export function isMandarinChineseVoiceLocale(locale) {
  const normalizedLocale = normalizeVoiceLocale(locale);
  if (!normalizedLocale || isCantoneseVoiceLocale(normalizedLocale)) return false;
  if (/^cmn(?:-|$)/.test(normalizedLocale)) return true;
  if (normalizedLocale === "zh") return true;
  if (!/^zh-/.test(normalizedLocale) && !/^zho-/.test(normalizedLocale) && !/^chi-/.test(normalizedLocale)) return false;

  const subtags = normalizedLocale.split("-").slice(1);
  return subtags.includes("hans") || subtags.includes("cn") || subtags.includes("sg") || subtags.includes("chn");
}

/** Exact match first; only known variety aliases may cross locales in strict mode. */
export function findMatchingVoice(voices, locale, { strictVoice = false } = {}) {
  if (!Array.isArray(voices)) return null;
  const normalizedLocale = normalizeVoiceLocale(locale);
  if (!normalizedLocale) return null;
  const voiceLocale = (voice) => normalizeVoiceLocale(voice?.lang);
  const exact = voices.find((voice) => voiceLocale(voice) === normalizedLocale);
  if (exact) return exact;
  if (isCantoneseVoiceLocale(normalizedLocale)) {
    return voices.find((voice) => isCantoneseVoiceLocale(voiceLocale(voice))) || null;
  }
  if (isMandarinChineseVoiceLocale(normalizedLocale)) {
    return voices.find((voice) => isMandarinChineseVoiceLocale(voiceLocale(voice))) || null;
  }
  if (strictVoice) return null;
  const language = normalizedLocale.split("-")[0];
  return voices.find((voice) => voiceLocale(voice).split("-")[0] === language) || null;
}

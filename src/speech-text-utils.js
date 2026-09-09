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

/**
 * Determine if a voice locale represents Mandarin Chinese.
 * Excludes Cantonese (yue) while supporting standard subtags and 3-letter codes.
 * @param {string} locale
 * @returns {boolean}
 */
export function isMandarinChineseVoiceLocale(locale) {
  const normalizedLocale = String(locale || "").replace(/_/g, "-").toLowerCase();
  if (!normalizedLocale || /^yue(?:-|$)/.test(normalizedLocale)) return false;
  if (/^cmn(?:-|$)/.test(normalizedLocale)) return true;
  if (normalizedLocale === "zh") return true;
  if (!/^zh-/.test(normalizedLocale) && !/^zho-/.test(normalizedLocale) && !/^chi-/.test(normalizedLocale)) return false;

  const subtags = normalizedLocale.split("-").slice(1);
  return subtags.includes("hans") || subtags.includes("cn") || subtags.includes("sg") || subtags.includes("chn");
}

/**
 * Find best matching system voice from a given list of voices.
 * @param {Array} voices
 * @param {string} locale
 * @returns {object|null}
 */
export function findMatchingVoice(voices, locale) {
  if (!Array.isArray(voices)) return null;
  const normalizedLocale = String(locale || "").replace(/_/g, "-").toLowerCase();
  const language = normalizedLocale.split("-")[0];
  const normalizeVoiceLocale = (voice) => String(voice?.lang || "").replace(/_/g, "-").toLowerCase();
  return voices.find((voice) => normalizeVoiceLocale(voice) === normalizedLocale)
    || voices.find((voice) => locale === "zh-CN"
      ? isMandarinChineseVoiceLocale(normalizeVoiceLocale(voice))
      : normalizeVoiceLocale(voice).split("-")[0] === language)
    || null;
}

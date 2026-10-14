const CHINESE_DIGITS = Object.freeze(["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"]);

export function chineseNumber(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0 || number > 100) throw new Error("unsupported-speech-number");
  if (number < 10) return CHINESE_DIGITS[number];
  if (number === 100) return "一百";
  const tens = Math.floor(number / 10);
  const ones = number % 10;
  return `${tens === 1 ? "" : CHINESE_DIGITS[tens]}十${ones ? CHINESE_DIGITS[ones] : ""}`;
}

export const mathNumberSpeechId = (number) => `math:number-${String(number).padStart(3, "0")}`;

const fragments = Object.freeze({
  "operator-plus": "加",
  "operator-minus": "减",
  "question-result": "等于几？",
  "sense-count-v1": "数一数画面中的圆点，选择数量。",
  "sense-compare-a-v1": "A组有",
  "sense-compare-b-v1": "B组有",
  "sense-dots-v1": "个圆点。",
  "sense-compare-question-v1": "哪一组的数量更多，还是一样多？",
  "sense-classify-start-v1": "从左到右，图形依次是：",
  "sense-circle-v1": "圆形。",
  "sense-triangle-v1": "三角形。",
  "sense-classify-question-v1": "找出和其他图形不一样的那一个。",
  "sense-pattern-start-v1": "数列依次是：",
  "sense-pattern-question-v1": "找出规律，下一个数字是什么？",
  "sense-spatial-lamp-v1": "看看台灯和桌子。台灯在桌子的上面还是下面？",
  "sense-spatial-cat-v1": "看看小猫和桌子。小猫在桌子的上面还是下面？",
  "sense-spatial-ball-v1": "看看球和积木。球在积木的左边还是右边？",
  "sense-compose-middle-v1": "可以分成",
  "sense-compose-question-v1": "和多少？",
});

export const MATH_SPEECH_ENTRIES = Object.freeze([
  ...Object.entries(fragments).map(([key, text]) => Object.freeze({ contentId: `math:${key}`, locale: "zh-CN", text })),
  ...Array.from({ length: 101 }, (_, number) => Object.freeze({
    contentId: mathNumberSpeechId(number), locale: "zh-CN", text: chineseNumber(number),
  })),
]);

const speechById = new Map(MATH_SPEECH_ENTRIES.map((entry) => [entry.contentId, entry]));
const fragmentId = (key) => `math:${key}`;

export function numberSenseSpeech(activity) {
  let contentIds;
  if (activity.kind === "count") {
    contentIds = [fragmentId("sense-count-v1")];
  } else if (activity.kind === "compare") {
    contentIds = [
      fragmentId("sense-compare-a-v1"), mathNumberSpeechId(activity.illustration.groups.A), fragmentId("sense-dots-v1"),
      fragmentId("sense-compare-b-v1"), mathNumberSpeechId(activity.illustration.groups.B), fragmentId("sense-dots-v1"),
      fragmentId("sense-compare-question-v1"),
    ];
  } else if (activity.kind === "classify") {
    contentIds = [
      fragmentId("sense-classify-start-v1"),
      ...activity.illustration.shapes.map((shape) => fragmentId(shape === "▲" ? "sense-triangle-v1" : "sense-circle-v1")),
      fragmentId("sense-classify-question-v1"),
    ];
  } else if (activity.kind === "pattern") {
    contentIds = [
      fragmentId("sense-pattern-start-v1"),
      ...activity.illustration.values.map(mathNumberSpeechId),
      fragmentId("sense-pattern-question-v1"),
    ];
  } else if (activity.kind === "spatial") {
    contentIds = [fragmentId(`sense-spatial-${activity.illustration.subject}-v1`)];
  } else if (activity.kind === "compose") {
    contentIds = [
      mathNumberSpeechId(activity.illustration.total), fragmentId("sense-compose-middle-v1"),
      mathNumberSpeechId(activity.illustration.first), fragmentId("sense-compose-question-v1"),
    ];
  } else {
    throw new Error("unsupported-number-sense-speech");
  }
  const entries = contentIds.map((id) => {
    const entry = speechById.get(id);
    if (!entry) throw new Error(`missing-number-sense-speech:${id}`);
    return entry;
  });
  return Object.freeze({
    contentIds: Object.freeze(contentIds),
    speechText: entries.map((entry) => entry.text).join(" "),
  });
}

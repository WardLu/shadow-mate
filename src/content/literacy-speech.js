import { HANZI } from "./literacy.js";
import { getActiveHanziWritingPack } from "./hanzi-writing/manifest.js";
import { cleanSpeechText } from "../speech-text-utils.js";

export const LITERACY_SPEECH_ENTRIES = [
  ...HANZI.map((item, index) => ({
    contentId: `literacy-${String(index + 1).padStart(3, "0")}:reading`,
    locale: "zh-CN",
    text: cleanSpeechText(`${item[0]}，${item[2]}`),
  })),
  ...getActiveHanziWritingPack().items.flatMap((item) => {
    const words = item.exampleWords?.length ? item.exampleWords : [item.exampleWord];
    return [
      ["visual", `${item.concept.label}，${item.concept.visual.alt}`],
      ...words.map((word, index) => [`word-${index + 1}`, word]),
      ["sentence", `例句：${item.sentence}`],
      ["hint", item.writing.hint],
    ].map(([kind, rawText]) => ({
      contentId: `${item.id}:${kind}`,
      locale: "zh-CN",
      text: cleanSpeechText(rawText),
    }));
  }),
];

const idsByText = new Map(LITERACY_SPEECH_ENTRIES.map((entry) => [entry.text, entry.contentId]));

export function literacySpeechId(text) {
  return idsByText.get(cleanSpeechText(text)) || "";
}

import { HANZI, literacyItemId } from "./literacy.js";
import { POEMS, ENGLISH, poemSpeechIds, englishItemId, englishWordSpeechId } from "./core-learning-speech.js";
import { BOOKS } from "./books.js";
import { getActiveHanziWritingPack } from "./hanzi-writing/manifest.js";

export const LEARNING_CATALOG_VERSION = "age-aware-content-1";
export const LEARNING_CONTENT_SOURCES = Object.freeze({
  "shadow-mate-preschool-hanzi-curriculum": { kind: "legacy", verification: "preserved-project-content" },
  "legacy-poems": { kind: "legacy", verification: "preserved-project-content" },
  "original-vocabulary-curation": { kind: "original", verification: "not-dictionary-reviewed" },
  "original-learning-prompts": { kind: "original" },
  "wikisource-mujiangyin": { kind: "reference", url: "https://zh.wikisource.org/wiki/暮江吟", verification: "text-compared-with-listed-source" },
  "hnwu-poetry-transcription": {
    kind: "reference",
    url: "http://www.hnwu.edu.cn/ewebeditor/uploadfile/20231006195220323.pdf",
    verification: "text-compared-with-listed-source",
    note: "学校整理的正文含个别抄录差异，不代表学前学习要求。",
  },
});

const packages = Object.freeze(["foundation-v2", "bridging-v1"]);
const recommendedPackages = (packageId) => packageId === "bridging-v1" ? ["bridging-v1"] : [...packages];
const freezeItems = (items) => Object.freeze(items.map((item) => Object.freeze(item)));

const literacy = freezeItems(HANZI.map((item, index) => {
  const id = literacyItemId(item, index);
  return {
    id, glyph: item[0], pinyin: item[1], word: item[2], theme: item[3] || "生活识字",
    speechId: `${id}:reading`, agePackages: recommendedPackages(item[4]),
    sourceRef: index < 98 ? "shadow-mate-preschool-hanzi-curriculum" : "original-vocabulary-curation",
    prompt: "在生活里找找这个字，愿意时再读一读。",
    promptSourceRef: "original-learning-prompts",
  };
}));
const poems = freezeItems(POEMS.map((poem, index) => {
  const speechIds = poemSpeechIds(index);
  return {
    id: poem.id || `poem-${String(index + 1).padStart(3, "0")}`,
    title: poem.t, author: poem.a, lines: Object.freeze([...poem.c]),
    prompt: poem.prompt || "听一听诗里的声音，聊聊你想到的画面。",
    theme: poem.theme || "自然与生活", agePackages: poem.agePackages || [...packages],
    headerSpeechId: speechIds.header,
    lineSpeechIds: Object.freeze(poem.c.map((_, lineIndex) => speechIds.line(lineIndex))),
    sourceRef: poem.sourceRef || "legacy-poems", promptSourceRef: "original-learning-prompts",
    ...(poem.sourceNote ? { sourceNote: poem.sourceNote, additionalSourceUrl: poem.additionalSourceUrl } : {}),
  };
}));
const english = freezeItems(ENGLISH.map((item, index) => ({
  id: englishItemId(index), word: item[0], phonetic: item[1], meaning: item[2], theme: item[3],
  speechId: englishWordSpeechId(index), agePackages: recommendedPackages(item[4]),
  sourceRef: index < 65 ? "shadow-mate-preschool-hanzi-curriculum" : item[5],
  prompt: "在图片或日常生活中找找它，愿意时跟读。", promptSourceRef: "original-learning-prompts",
})));
const writing = freezeItems(getActiveHanziWritingPack().items.filter((item) => item.status === "active").map((item) => ({
  ...item, agePackages: item.agePackages || [...packages], optional: true,
})));
const all = Object.freeze({ literacy, poems, english, books: BOOKS, writing });
const indexes = {
  literacy: new Map(literacy.map((item) => [item.id, item])),
  poem: new Map(poems.map((item) => [item.id, item])),
  english: new Map(english.map((item) => [item.id, item])),
  book: new Map(BOOKS.map((item) => [item.id, item])),
  writing: new Map(writing.map((item) => [item.id, item])),
};

export function getLearningCatalog(packageId = "foundation-v2") {
  if (!packages.includes(packageId)) throw new Error(`unknown-learning-package:${packageId}`);
  return Object.freeze({
    version: LEARNING_CATALOG_VERSION,
    ...Object.fromEntries(Object.entries(all).map(([kind, items]) => [kind, Object.freeze(items.filter((item) => item.agePackages.includes(packageId)))])),
  });
}

export function getLearningItem(activityId, itemId) {
  const kind = activityId === "recognition" ? "literacy" : activityId;
  return indexes[kind]?.get(itemId) || null;
}

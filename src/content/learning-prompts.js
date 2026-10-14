export const ENGLISH_DAILY_PROMPT = Object.freeze({
  contentId: "prompt:english-daily-v2",
  speechId: "prompt:english-daily-v2",
  text: "看看图，听一听单词。愿意时跟读，再由家长确认今天的练习。",
});

export const SUDOKU_PROMPT = Object.freeze({
  contentId: "prompt:sudoku-v2",
  speechId: "prompt:sudoku-v2",
  text: "把一到四填进空格。每一行、每一列和每个四格小宫里，数字都不能重复。",
});

export const MATH_SEQUENCE_PROMPT = Object.freeze({
  contentId: "prompt:math-sequence-v2",
  speechId: "prompt:math-sequence-v2",
  text: "按从小到大的顺序数一数。点击问号格，选出缺少的数字。",
});

export const LEARNING_PROMPT_SPEECH_ENTRIES = Object.freeze([
  ENGLISH_DAILY_PROMPT, SUDOKU_PROMPT, MATH_SEQUENCE_PROMPT,
].map((prompt) => Object.freeze({ ...prompt, locale: "zh-CN" })));

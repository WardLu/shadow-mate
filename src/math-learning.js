const MAX_MATH_LEVEL = 10000;
const NUMBER_SENSE_KINDS = Object.freeze([
  "count",
  "compare",
  "classify",
  "pattern",
  "spatial",
  "compose",
]);

const MATH_POLICIES = Object.freeze({
  "foundation-v2": Object.freeze({
    packageId: "foundation-v2",
    suggestedAge: "4-5",
    defaultMaxOperand: 5,
    defaultMaxResult: 10,
    maxSequenceValue: 20,
    optionalMaxNumber: null,
  }),
  "bridging-v1": Object.freeze({
    packageId: "bridging-v1",
    suggestedAge: "5-6",
    defaultMaxOperand: 10,
    defaultMaxResult: 20,
    maxSequenceValue: 20,
    optionalMaxNumber: 100,
  }),
});

function hashSeed(seed) {
  const text = String(seed);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createRandom(source) {
  const injected = typeof source === "function" ? source : source?.random;
  if (typeof injected === "function") {
    return () => {
      const value = Number(injected());
      return Number.isFinite(value) ? Math.max(0, Math.min(0.999999999999, value)) : 0;
    };
  }

  const seed = source && typeof source === "object" ? source.seed : source;
  if (seed === undefined || seed === null) return Math.random;
  let state = typeof seed === "number" && Number.isFinite(seed) ? seed >>> 0 : hashSeed(seed);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function integerBetween(random, minimum, maximum) {
  if (maximum <= minimum) return minimum;
  return minimum + Math.floor(random() * (maximum - minimum + 1));
}

function shuffled(values, random) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = integerBetween(random, 0, index);
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

export function getMathPolicy(packageId) {
  return MATH_POLICIES[packageId] || MATH_POLICIES["foundation-v2"];
}

export function buildMentalQuestion(level, seedOrRandom) {
  const parsedLevel = Number(level);
  if (!Number.isFinite(parsedLevel) || parsedLevel < 0) throw new RangeError("invalid-math-level");
  const maximum = Math.min(MAX_MATH_LEVEL, Math.floor(parsedLevel));
  const random = createRandom(seedOrRandom);
  const operator = random() < 0.5 ? "+" : "-";
  const a = integerBetween(random, 0, maximum);
  const b = integerBetween(random, 0, operator === "+" ? maximum - a : a);
  const answer = operator === "+" ? a + b : a - b;

  return { a, b, operator, answer, text: `${a} ${operator} ${b} = ?` };
}

function baseSudokuSolution(random) {
  const bandOrder = shuffled([0, 1], random);
  const rowOrder = bandOrder.flatMap((band) => shuffled([0, 1], random).map((withinBand) => band * 2 + withinBand));
  const stackOrder = shuffled([0, 1], random);
  const columnOrder = stackOrder.flatMap((stack) => shuffled([0, 1], random).map((withinStack) => stack * 2 + withinStack));
  const symbols = shuffled([1, 2, 3, 4], random);
  const transpose = random() < 0.5;
  const board = rowOrder.map((row) => columnOrder.map((column) => {
    const sourceRow = transpose ? column : row;
    const sourceColumn = transpose ? row : column;
    const symbolIndex = (sourceRow * 2 + Math.floor(sourceRow / 2) + sourceColumn) % 4;
    return symbols[symbolIndex];
  }));
  return board;
}

function candidatesFor(board, row, column) {
  const used = new Set(board[row]);
  for (let index = 0; index < 4; index += 1) used.add(board[index][column]);
  const boxRow = Math.floor(row / 2) * 2;
  const boxColumn = Math.floor(column / 2) * 2;
  for (let rowIndex = boxRow; rowIndex < boxRow + 2; rowIndex += 1) {
    for (let columnIndex = boxColumn; columnIndex < boxColumn + 2; columnIndex += 1) {
      used.add(board[rowIndex][columnIndex]);
    }
  }
  return [1, 2, 3, 4].filter((value) => !used.has(value));
}

export function countSudokuSolutions(puzzle, limit = 2) {
  if (!Array.isArray(puzzle) || puzzle.length !== 4 || puzzle.some((row) => !Array.isArray(row) || row.length !== 4)) return 0;
  const board = puzzle.map((row) => [...row]);
  if (board.some((row) => row.some((value) => value !== null && (!Number.isInteger(value) || value < 1 || value > 4)))) return 0;
  for (let row = 0; row < 4; row += 1) {
    const values = board[row].filter((value) => value !== null);
    if (new Set(values).size !== values.length) return 0;
  }
  for (let column = 0; column < 4; column += 1) {
    const values = board.map((row) => row[column]).filter((value) => value !== null);
    if (new Set(values).size !== values.length) return 0;
  }
  for (let boxRow = 0; boxRow < 4; boxRow += 2) {
    for (let boxColumn = 0; boxColumn < 4; boxColumn += 2) {
      const values = [
        board[boxRow][boxColumn], board[boxRow][boxColumn + 1],
        board[boxRow + 1][boxColumn], board[boxRow + 1][boxColumn + 1],
      ].filter((value) => value !== null);
      if (new Set(values).size !== values.length) return 0;
    }
  }
  const maximum = Number.isInteger(limit) && limit > 0 ? limit : 2;
  let count = 0;

  function search() {
    if (count >= maximum) return;
    let bestCell = null;
    let bestCandidates = null;
    for (let row = 0; row < 4; row += 1) {
      for (let column = 0; column < 4; column += 1) {
        if (board[row][column] !== null) continue;
        const candidates = candidatesFor(board, row, column);
        if (candidates.length === 0) return;
        if (!bestCandidates || candidates.length < bestCandidates.length) {
          bestCell = [row, column];
          bestCandidates = candidates;
        }
      }
    }
    if (!bestCell) {
      count += 1;
      return;
    }
    const [row, column] = bestCell;
    for (const value of bestCandidates) {
      board[row][column] = value;
      search();
      board[row][column] = null;
      if (count >= maximum) return;
    }
  }

  search();
  return count;
}

export function buildSudoku4(seed, options = {}) {
  const source = seed && typeof seed === "object" ? seed : seed;
  const settings = seed && typeof seed === "object" ? { ...seed, ...options } : options;
  const random = createRandom(source);
  const solution = baseSudokuSolution(random);
  const difficulty = ["easy", "medium", "hard"].includes(settings.difficulty) ? settings.difficulty : "easy";
  const range = { easy: [3, 5], medium: [4, 8], hard: [6, 10] }[difficulty];
  const targetBlanks = integerBetween(random, range[0], range[1]);
  const puzzle = solution.map((row) => [...row]);
  const cells = shuffled(Array.from({ length: 16 }, (_, index) => [Math.floor(index / 4), index % 4]), random);
  let blanks = 0;

  for (const [row, column] of cells) {
    if (blanks >= targetBlanks) break;
    const value = puzzle[row][column];
    puzzle[row][column] = null;
    if (countSudokuSolutions(puzzle, 2) === 1) blanks += 1;
    else puzzle[row][column] = value;
  }

  return { solution, puzzle, difficulty };
}

function shuffledOptions(answer, distractors, random) {
  const unique = [...new Set([answer, ...distractors])];
  return shuffled(unique, random);
}

function boundedNumberSenseLimit(packageId) {
  return getMathPolicy(packageId).defaultMaxResult;
}

export function buildNumberSenseActivity(seed, packageId = "foundation-v2") {
  const random = createRandom(seed);
  const policy = getMathPolicy(packageId);
  const maximum = boundedNumberSenseLimit(packageId);
  const kind = NUMBER_SENSE_KINDS[integerBetween(random, 0, NUMBER_SENSE_KINDS.length - 1)];

  if (kind === "count") {
    const answer = integerBetween(random, 1, maximum);
    return {
      kind,
      prompt: "数一数有几个圆点？",
      illustration: { type: "dots", text: "● ".repeat(answer).trim() },
      options: shuffledOptions(answer, [Math.max(0, answer - 1), Math.min(maximum, answer + 1), Math.max(0, answer - 2)], random),
      answer,
    };
  }

  if (kind === "compare") {
    const comparisonMaximum = getMathPolicy(packageId).defaultMaxOperand;
    const left = integerBetween(random, 1, comparisonMaximum);
    const right = integerBetween(random, 1, comparisonMaximum);
    const answer = left === right ? "一样多" : left > right ? "A" : "B";
    const groups = Object.freeze({ A: left, B: right });
    return {
      kind,
      prompt: "哪一组的数量更多，还是一样多？",
      illustration: {
        type: "groups",
        groups,
        text: `A：${"● ".repeat(left).trim()}　B：${"● ".repeat(right).trim()}`,
      },
      options: ["A", "B", "一样多"],
      answer,
    };
  }

  if (kind === "classify") {
    const oddIndex = integerBetween(random, 0, 3);
    const shapes = Array.from({ length: 4 }, (_, index) => index === oddIndex ? "▲" : "●");
    const options = ["第1个", "第2个", "第3个", "第4个"];
    return {
      kind,
      prompt: "找出和其他图形不一样的那一个。",
      illustration: { type: "shapes", shapes: Object.freeze(shapes), text: shapes.join("　") },
      options,
      answer: options[oddIndex],
    };
  }

  if (kind === "pattern") {
    const step = integerBetween(random, 1, 3);
    const first = integerBetween(random, 1, policy.maxSequenceValue - step * 3);
    const values = Array.from({ length: 4 }, (_, index) => first + step * index);
    const answer = values[3];
    const distractors = [answer - step, answer + step, answer + 1, answer - 1]
      .filter((value) => value >= 0 && value <= policy.maxSequenceValue && value !== answer);
    return {
      kind,
      prompt: "找出数列的规律，下一个数字是什么？",
      illustration: { type: "number-sequence", text: `${values.slice(0, 3).join("，")}，？` },
      options: shuffledOptions(answer, distractors, random),
      answer,
    };
  }

  if (kind === "spatial") {
    const scenes = [
      { text: "台灯放在桌面上。", prompt: "台灯在桌子的上面还是下面？", options: ["上面", "下面"], answer: "上面" },
      { text: "小猫躲在桌子底下。", prompt: "小猫在桌子的上面还是下面？", options: ["上面", "下面"], answer: "下面" },
      { text: "从左往右摆：球　积木", prompt: "球在积木的左边还是右边？", options: ["左边", "右边"], answer: "左边" },
      { text: "从左往右摆：积木　球", prompt: "球在积木的左边还是右边？", options: ["左边", "右边"], answer: "右边" },
    ];
    const scene = scenes[integerBetween(random, 0, scenes.length - 1)];
    return {
      kind,
      prompt: scene.prompt,
      illustration: { type: "spatial-scene", text: scene.text },
      options: shuffled(scene.options, random),
      answer: scene.answer,
    };
  }

  const total = integerBetween(random, 2, maximum);
  const first = integerBetween(random, 1, total - 1);
  const answer = total - first;
  const distractors = [...new Set([answer - 1, answer + 1].filter((value) => value >= 0 && value <= maximum && value !== answer))];
  return {
    kind,
    prompt: `${total}可以分成${first}和多少？`,
    illustration: { type: "number-bond", text: `${first} + ？ = ${total}` },
    options: shuffledOptions(answer, distractors, random),
    answer,
  };
}

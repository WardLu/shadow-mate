import { describe, expect, it } from "vitest";
import { buildMentalQuestion, buildNumberSenseActivity, buildSudoku4, countSudokuSolutions, getMathPolicy } from "../../src/math-learning.js";

function randomSequence(...values) {
  let index = 0;
  return () => values[index++ % values.length];
}

function solutionCount(puzzle) {
  const board = puzzle.map((row) => [...row]);
  function solve(index = 0) {
    if (index === 16) return 1;
    const row = Math.floor(index / 4);
    const column = index % 4;
    if (board[row][column] !== null) return solve(index + 1);
    let count = 0;
    for (let digit = 1; digit <= 4; digit += 1) {
      const inColumn = board.some((values) => values[column] === digit);
      const inBox = board.slice(row - row % 2, row - row % 2 + 2)
        .some((values) => values.slice(column - column % 2, column - column % 2 + 2).includes(digit));
      if (board[row].includes(digit) || inColumn || inBox) continue;
      board[row][column] = digit;
      count += solve(index + 1);
      board[row][column] = null;
      if (count >= 2) return count;
    }
    return count;
  }
  return solve();
}

describe("math learning generators", () => {
  it("keeps operands and results inside every selected number range", () => {
    for (const level of [0, 1, 5, 10, 20, 100]) {
      const operators = new Set();
      for (let seed = 0; seed < 80; seed += 1) {
        const question = buildMentalQuestion(level, seed);
        expect(buildMentalQuestion(level, seed)).toEqual(question);
        for (const value of [question.a, question.b, question.answer]) {
          expect(Number.isInteger(value)).toBe(true);
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThanOrEqual(level);
        }
        expect(question.answer).toBe(question.operator === "+" ? question.a + question.b : question.a - question.b);
        expect(question.text).toBe(`${question.a} ${question.operator} ${question.b} = ?`);
        operators.add(question.operator);
      }
      expect(operators).toEqual(new Set(["+", "-"]));
    }
  });

  it("accepts injected randomness without permitting overflowing sums or negative subtraction", () => {
    expect(buildMentalQuestion(5, randomSequence(0, 0.99, 0.99))).toEqual({ a: 5, b: 0, operator: "+", answer: 5, text: "5 + 0 = ?" });
    expect(buildMentalQuestion(5, randomSequence(0.99, 0, 0.99))).toMatchObject({ a: 0, b: 0, operator: "-", answer: 0 });
    expect(() => buildMentalQuestion(-1, 0)).toThrow(RangeError);
    expect(() => buildMentalQuestion(Number.NaN, 0)).toThrow(RangeError);
    expect(buildMentalQuestion(1_000_000, 12).answer).toBeLessThanOrEqual(10_000);
  });

  it("offers age guidance and optional extensions rather than required school algorithms", () => {
    expect(getMathPolicy("foundation-v2")).toMatchObject({ defaultMaxOperand: 5, defaultMaxResult: 10, maxSequenceValue: 20, optionalMaxNumber: null });
    expect(getMathPolicy("bridging-v1")).toMatchObject({ defaultMaxOperand: 10, defaultMaxResult: 20, maxSequenceValue: 20, optionalMaxNumber: 100 });
    expect(getMathPolicy("unknown")).toEqual(getMathPolicy("foundation-v2"));
  });

  it("makes distinct kinds of activities stable for the same day and package", () => {
    for (const packageId of ["foundation-v2", "bridging-v1"]) {
      const kinds = new Set();
      const comparisonAnswers = new Set();
      const spatialAnswers = new Set();
      const policy = getMathPolicy(packageId);
      for (let seed = 0; seed < 240; seed += 1) {
        const activity = buildNumberSenseActivity(seed, packageId);
        expect(buildNumberSenseActivity(seed, packageId)).toEqual(activity);
        expect(activity.prompt).toBeTruthy();
        expect(activity.illustration.text).toBeTruthy();
        expect(activity.options.filter((option) => option === activity.answer)).toHaveLength(1);
        expect(new Set(activity.options).size).toBe(activity.options.length);
        kinds.add(activity.kind);
        if (activity.kind === "count") {
          expect(activity.answer).toBe(activity.illustration.text.match(/●/gu).length);
          expect(activity.options.every((option) => option >= 0 && option <= policy.defaultMaxResult)).toBe(true);
        }
        if (activity.kind === "compare") {
          const [aText, bText] = activity.illustration.text.split("　");
          const a = aText.match(/●/gu).length;
          const b = bText.match(/●/gu).length;
          expect(a).toBeLessThanOrEqual(policy.defaultMaxOperand);
          expect(b).toBeLessThanOrEqual(policy.defaultMaxOperand);
          expect(activity.answer).toBe(a === b ? "一样多" : a > b ? "A" : "B");
          expect(activity.options).toEqual(["A", "B", "一样多"]);
          comparisonAnswers.add(activity.answer);
        }
        if (activity.kind === "classify") {
          const shapes = activity.illustration.text.split("　");
          const unique = shapes.filter((shape) => shapes.filter((item) => item === shape).length === 1);
          expect(unique).toHaveLength(1);
          expect(activity.answer).toBe(`第${shapes.indexOf(unique[0]) + 1}个`);
        }
        if (activity.kind === "pattern") {
          const [first, second, third] = activity.illustration.text.split("，").slice(0, 3).map(Number);
          expect(second - first).toBe(third - second);
          expect(activity.answer).toBe(third + second - first);
          expect(activity.options.every((option) => option >= 0 && option <= policy.maxSequenceValue)).toBe(true);
        }
        if (activity.kind === "spatial") {
          expect(activity.illustration.text).not.toMatch(/180|°|\n/);
          spatialAnswers.add(activity.answer);
        }
        if (activity.kind === "compose") {
          const [, first, total] = activity.illustration.text.match(/(\d+) \+ ？ = (\d+)/);
          expect(Number(first) + activity.answer).toBe(Number(total));
          expect(Number(total)).toBeLessThanOrEqual(policy.defaultMaxResult);
        }
      }
      expect(kinds).toEqual(new Set(["count", "compare", "classify", "pattern", "spatial", "compose"]));
      expect(comparisonAnswers).toEqual(new Set(["A", "B", "一样多"]));
      expect(spatialAnswers).toEqual(new Set(["上面", "下面", "左边", "右边"]));
    }
  });

  it("gives the correct answer for familiar spatial scenes", () => {
    const expectations = [
      ["台灯放在桌面上。", "上面"],
      ["小猫躲在桌子底下。", "下面"],
      ["从左往右摆：球　积木", "左边"],
      ["从左往右摆：积木　球", "右边"],
    ];
    expectations.forEach(([text, answer], index) => {
      const activity = buildNumberSenseActivity(randomSequence(0.7, index / 4, 0.5));
      expect(activity.kind).toBe("spatial");
      expect(activity.illustration.text).toBe(text);
      expect(activity.answer).toBe(answer);
    });
  });

  it("generates varied valid sudoku solutions and blanks with exactly one solution", () => {
    const solutions = new Set();
    const blankLayouts = new Set();
    for (const difficulty of ["easy", "medium", "hard"]) {
      for (let seed = 0; seed < 20; seed += 1) {
        const generated = buildSudoku4(seed, { difficulty });
        expect(buildSudoku4(seed, { difficulty })).toEqual(generated);
        for (let index = 0; index < 4; index += 1) {
          expect([...generated.solution[index]].sort()).toEqual([1, 2, 3, 4]);
          expect(generated.solution.map((row) => row[index]).sort()).toEqual([1, 2, 3, 4]);
          const row = Math.floor(index / 2) * 2;
          const column = index % 2 * 2;
          const box = generated.solution.slice(row, row + 2).flatMap((values) => values.slice(column, column + 2));
          expect(box.sort()).toEqual([1, 2, 3, 4]);
        }
        generated.puzzle.forEach((row, r) => row.forEach((value, c) => {
          if (value !== null) expect(value).toBe(generated.solution[r][c]);
        }));
        expect(solutionCount(generated.puzzle)).toBe(1);
        expect(countSudokuSolutions(generated.puzzle)).toBe(1);
        expect(generated.puzzle.flat().filter((value) => value === null).length).toBeGreaterThanOrEqual(3);
        solutions.add(JSON.stringify(generated.solution));
        blankLayouts.add(JSON.stringify(generated.puzzle.map((row) => row.map((value) => value === null))));
      }
    }
    expect(solutions.size).toBeGreaterThan(10);
    expect(blankLayouts.size).toBeGreaterThan(10);
  });

  it("rejects invalid sudoku clues and detects multiple solutions", () => {
    expect(countSudokuSolutions([[1, 1, null, null], [null, null, null, null], [null, null, null, null], [null, null, null, null]])).toBe(0);
    expect(countSudokuSolutions([])).toBe(0);
    expect(countSudokuSolutions(Array.from({ length: 4 }, () => Array(4).fill(null)))).toBe(2);
  });
});

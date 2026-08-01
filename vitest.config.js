import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["tests/unit/**/*.test.js"],
    globals: true,
  },
  coverage: {
    provider: "v8",
    reporter: ["text", "json-summary", "html"],
    include: ["src/lib.js", "src/learning-state.js"],
    all: true,
    thresholds: {
      statements: 80,
      branches: 80,
      functions: 80,
      lines: 80,
    },
  },
});

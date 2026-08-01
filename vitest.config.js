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
    // This gate is intentionally the deterministic unit/state layer. Browser
    // behavior in app.js and cloud.js is verified by Playwright; database RLS
    // and optimistic concurrency are verified by Supabase pgTAP.
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

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.eval.ts"],
    testTimeout: 60000,
  },
  resolve: {
    alias: {
      "@": "/Users/akshitkalra/Code/chess-coach-multiagents/src",
    },
  },
});

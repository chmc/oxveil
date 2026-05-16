import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/test/**/*.test.ts"],
    globals: true,
    coverage: {
      provider: "v8",
      thresholds: {
        statements: 60,
        branches: 50,
      },
    },
  },
});

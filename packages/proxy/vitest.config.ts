import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // index.ts is the CLI bootstrap (binds a socket); covered by the smoke script.
      exclude: ["src/**/*.test.ts", "src/index.ts", "src/adapters/types.ts"],
      thresholds: { lines: 80, functions: 85, branches: 75, statements: 80 },
    },
  },
});

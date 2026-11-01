import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: ["packages/*", "apps/*"],
    coverage: {
      provider: "v8",
      include: ["packages/*/src/**", "apps/*/src/**"],
      exclude: ["**/*.test.{ts,tsx}"],
      reporter: ["text-summary", "text"],
      thresholds: {
        // packages/schema is the source of truth: keep it essentially fully covered.
        "packages/schema/src/**": { lines: 95, statements: 95, functions: 95, branches: 90 },
        // The Action Registry feeds every UI surface and (later) the AI: keep it fully tested.
        "packages/actions/src/**": { lines: 95, statements: 95, functions: 95, branches: 90 },
      },
    },
  },
});

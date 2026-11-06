import { defineProject } from "vitest/config";

export default defineProject({
  test: { name: "render-page", environment: "node", include: ["test/**/*.test.ts"] },
});

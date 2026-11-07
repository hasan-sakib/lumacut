import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "effects",
    include: ["test/**/*.test.ts"],
  },
});

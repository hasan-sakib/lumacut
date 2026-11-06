import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "ops",
    include: ["test/**/*.test.ts"],
  },
});

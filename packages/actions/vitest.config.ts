import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "actions",
    include: ["test/**/*.test.ts"],
  },
});

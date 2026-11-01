import { defineConfig, devices } from "@playwright/test";

// e2e runs against the running stack (`make test-stack` starts it). Default target is the
// compose `web` service; set LUMACUT_WEB_URL=http://localhost:5173 to test `pnpm dev` instead.
export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  reporter: [["list"]],
  use: {
    baseURL: process.env.LUMACUT_WEB_URL ?? "http://localhost:8080",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});

import { playwright } from "@vitest/browser-playwright";
import { defineProject } from "vitest/config";

// Browser tests run the real engine (WebGL2, WebCodecs, Workers, Web Audio) in Chromium. The test
// server is cross-origin isolated like the app, and autoplay is allowed so AudioContext can run.
export default defineProject({
  // Pre-bundle up front so Vite doesn't reload the page mid-run when it first sees the dependency.
  optimizeDeps: { include: ["mediabunny"] },
  server: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  test: {
    name: "engine-browser",
    include: ["browser-test/**/*.test.ts"],
    testTimeout: 60_000,
    // The live playback tests measure real time against SwiftShader rendering: files running side by
    // side in other tabs would starve them, so browser test files run one after another.
    fileParallelism: false,
    browser: {
      enabled: true,
      headless: true,
      provider: playwright({
        launchOptions: { args: ["--autoplay-policy=no-user-gesture-required"] },
      }),
      instances: [{ browser: "chromium" }],
    },
  },
});

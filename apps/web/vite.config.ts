import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Cross-origin isolation is on from the first milestone: the engine (M2) needs SharedArrayBuffer
// for decoded audio/video ring buffers. Every resource must therefore be same-origin (API and
// media go through the /api proxy) or send CORP/CORS headers.
const isolationHeaders = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
};

const proxy = {
  "/api": {
    target: process.env.LUMACUT_API_PROXY_TARGET ?? "http://localhost:8000",
    changeOrigin: true,
  },
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // The engine runs in a module Worker (ES imports inside the worker bundle).
  worker: { format: "es" },
  server: { port: 5173, strictPort: true, headers: isolationHeaders, proxy },
  preview: { port: 8080, strictPort: true, host: true, headers: isolationHeaders, proxy },
});

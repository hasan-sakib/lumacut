import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import type { Connect, Plugin } from "vite";
import { defineConfig } from "vite";

const root = (path: string) => fileURLToPath(new URL(`../../${path}`, import.meta.url));

/** Where /media/<file> is looked up, first match wins. */
const MEDIA_DIRS = [root("samples/generated/perf"), root("packages/engine/fixtures")];

const TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
};

/** Serves renditions with Range support (Mediabunny reads video by byte range). */
const serveMedia: Connect.NextHandleFunction = (req, res, next) => {
  const url = new URL(req.url ?? "/", "http://x");
  if (!url.pathname.startsWith("/media/")) return next();
  const name = normalize(decodeURIComponent(url.pathname.slice("/media/".length)));
  if (name.startsWith("..") || name.includes("/")) {
    res.statusCode = 400;
    return res.end("bad path");
  }
  const dir = MEDIA_DIRS.find((d) => existsSync(join(d, name)));
  if (dir === undefined) {
    res.statusCode = 404;
    return res.end("not found");
  }
  const path = join(dir, name);
  const size = statSync(path).size;
  res.setHeader("Content-Type", TYPES[extname(name)] ?? "application/octet-stream");
  res.setHeader("Accept-Ranges", "bytes");
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? "");
  if (range === null) {
    res.setHeader("Content-Length", size);
    return createReadStream(path).pipe(res);
  }
  const start = range[1] === "" ? Math.max(0, size - Number(range[2])) : Number(range[1]);
  const end = range[1] === "" || range[2] === "" ? size - 1 : Math.min(size - 1, Number(range[2]));
  if (start > end || start >= size) {
    res.statusCode = 416;
    res.setHeader("Content-Range", `bytes */${String(size)}`);
    return res.end();
  }
  res.statusCode = 206;
  res.setHeader("Content-Range", `bytes ${String(start)}-${String(end)}/${String(size)}`);
  res.setHeader("Content-Length", end - start + 1);
  createReadStream(path, { start, end }).pipe(res);
};

const mediaPlugin: Plugin = {
  name: "lumacut-media",
  configureServer: (server) => void server.middlewares.use(serveMedia),
  configurePreviewServer: (server) => void server.middlewares.use(serveMedia),
};

// Cross-origin isolated like the app (the engine and memory telemetry depend on it).
const headers = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
};

export default defineConfig({
  plugins: [mediaPlugin],
  worker: { format: "es" },
  server: { port: 5174, strictPort: true, headers },
  preview: { port: 4174, strictPort: true, headers },
});

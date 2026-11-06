import { chromium, type Browser, type Page } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { build, preview } from "vite";
import type { LumacutApi, PageInfo } from "../src/api.ts";

const appRoot = fileURLToPath(new URL("..", import.meta.url));

/** The two WebGL backends we compare: Playwright's bundled Chromium (SwiftShader, CPU) and the installed Chrome (the machine's GPU). */
export type Backend = "swiftshader" | "gpu";

export interface Server {
  url: string;
  close: () => Promise<void>;
}

/** Builds the page (minified, like production) and serves it with the media routes. */
export async function startServer(): Promise<Server> {
  await build({ root: appRoot, logLevel: "warn" });
  const server = await preview({ root: appRoot, logLevel: "warn" });
  const url = server.resolvedUrls?.local[0];
  if (url === undefined) throw new Error("The preview server didn't report a URL");
  return { url, close: () => server.close() };
}

export interface Session {
  backend: Backend;
  page: Page;
  info: PageInfo;
  /** Runs an API call inside the page. */
  call: <T>(fn: (api: LumacutApi) => Promise<T>) => Promise<T>;
  close: () => Promise<void>;
}

const ARGS = ["--autoplay-policy=no-user-gesture-required"];

async function launch(backend: Backend): Promise<Browser> {
  if (backend === "swiftshader") return chromium.launch({ headless: true, args: ARGS });
  try {
    // Headed on purpose when LUMACUT_HEADED=1: some machines only enable the GPU in a real window.
    return await chromium.launch({
      channel: "chrome",
      headless: process.env.LUMACUT_HEADED !== "1",
      args: ARGS,
    });
  } catch (error) {
    throw new Error(
      `Couldn't start the installed Google Chrome (needed for the GPU backend): ${String(error)}`,
    );
  }
}

export async function openSession(backend: Backend, url: string): Promise<Session> {
  const browser = await launch(backend);
  const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
  page.on("pageerror", (error) => {
    console.error(`[page error] ${error.message}`);
  });
  await page.goto(url);
  await page.waitForFunction(() => window.__lumacut !== undefined, undefined, { timeout: 60_000 });
  const call = <T>(fn: (api: LumacutApi) => Promise<T>): Promise<T> =>
    page.evaluate(`(${fn.toString()})(window.__lumacut)`) as Promise<T>;
  const info = await call((api) => api.info());
  return { backend, page, info, call, close: () => browser.close() };
}

export const isSoftwareRenderer = (renderer: string): boolean =>
  /swiftshader|llvmpipe|software/i.test(renderer);

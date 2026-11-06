/// Entry point of the engine's module Worker: `new Worker(new URL("./engine.worker.ts", import.meta.url), { type: "module" })`.
import { EngineHost } from "./engine-host.ts";
import type { PortLike } from "./rpc.ts";

new EngineHost(self as unknown as PortLike);

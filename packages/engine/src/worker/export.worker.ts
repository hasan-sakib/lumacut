/// Entry point of the export Worker: `new Worker(new URL("./export.worker.ts", import.meta.url), { type: "module" })`.
import { ExportHost } from "./export-host.ts";
import type { PortLike } from "./rpc.ts";

new ExportHost(self as unknown as PortLike);

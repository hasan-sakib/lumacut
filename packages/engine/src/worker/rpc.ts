/** Minimal two-way request/response messaging over a Worker or a worker's global scope. */
export interface PortLike {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  addEventListener(type: "message", listener: (event: MessageEvent<unknown>) => void): void;
  removeEventListener(type: "message", listener: (event: MessageEvent<unknown>) => void): void;
}

type Wire =
  | { kind: "call"; id: number; type: string; payload: unknown }
  | { kind: "reply"; id: number; ok: true; result: unknown }
  | { kind: "reply"; id: number; ok: false; error: { name: string; message: string } }
  | { kind: "event"; type: string; payload: unknown };

export interface HandlerResult {
  result: unknown;
  transfer?: Transferable[];
}

export type Handler = (
  payload: never,
) => Promise<HandlerResult | undefined> | HandlerResult | undefined;

export class RpcError extends Error {
  override name = "RpcError";
}

function isWire(value: unknown): value is Wire {
  return typeof value === "object" && value !== null && "kind" in value;
}

/**
 * Both sides create one `Rpc` on their end of the port. `call` awaits the other side's handler;
 * `notify` is fire-and-forget; incoming events go to `onEvent`.
 */
export class Rpc {
  readonly #port: PortLike;
  readonly #handlers: Record<string, Handler>;
  readonly #pending = new Map<
    number,
    { resolve: (v: unknown) => void; reject: (e: Error) => void }
  >();
  readonly #eventListeners = new Map<string, Set<(payload: never) => void>>();
  readonly #listener: (event: MessageEvent<unknown>) => void;
  #nextId = 1;
  #closed = false;

  constructor(port: PortLike, handlers: Record<string, Handler> = {}) {
    this.#port = port;
    this.#handlers = handlers;
    this.#listener = (event) => {
      if (isWire(event.data)) void this.#receive(event.data);
    };
    port.addEventListener("message", this.#listener);
    (port as { start?: () => void }).start?.();
  }

  call<T>(type: string, payload?: unknown, transfer?: Transferable[]): Promise<T> {
    if (this.#closed) return Promise.reject(new RpcError("The connection was closed"));
    const id = this.#nextId++;
    return new Promise<T>((resolve, reject) => {
      this.#pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      this.#port.postMessage({ kind: "call", id, type, payload } satisfies Wire, transfer);
    });
  }

  notify(type: string, payload?: unknown, transfer?: Transferable[]): void {
    this.#port.postMessage({ kind: "event", type, payload } satisfies Wire, transfer);
  }

  /** Subscribes to an event; the listener's payload type is the caller's contract. */
  on(type: string, listener: (payload: never) => void): () => void {
    const set = this.#eventListeners.get(type) ?? new Set();
    set.add(listener);
    this.#eventListeners.set(type, set);
    return () => set.delete(listener);
  }

  dispose(): void {
    this.#closed = true;
    this.#port.removeEventListener("message", this.#listener);
    for (const { reject } of this.#pending.values())
      reject(new RpcError("The connection was closed"));
    this.#pending.clear();
  }

  async #receive(message: Wire): Promise<void> {
    if (message.kind === "reply") {
      const waiter = this.#pending.get(message.id);
      if (waiter === undefined) return;
      this.#pending.delete(message.id);
      if (message.ok) waiter.resolve(message.result);
      else waiter.reject(new RpcError(`${message.error.name}: ${message.error.message}`));
      return;
    }
    if (message.kind === "event") {
      // Fire-and-forget: an event may run a registered handler (no reply is sent) and notify
      // listeners. Nobody waits for the outcome of a notification, so handler errors are dropped.
      const eventHandler = this.#handlers[message.type];
      if (eventHandler !== undefined) {
        try {
          await eventHandler(message.payload as never);
        } catch {
          // See above.
        }
      }
      for (const listener of this.#eventListeners.get(message.type) ?? [])
        listener(message.payload as never);
      return;
    }
    const handler = this.#handlers[message.type];
    try {
      if (handler === undefined) throw new RpcError(`No handler for "${message.type}"`);
      const out = await handler(message.payload as never);
      this.#port.postMessage(
        { kind: "reply", id: message.id, ok: true, result: out?.result } satisfies Wire,
        out?.transfer,
      );
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.#port.postMessage({
        kind: "reply",
        id: message.id,
        ok: false,
        error: { name: err.name, message: err.message },
      } satisfies Wire);
    }
  }
}

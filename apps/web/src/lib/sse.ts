/** Minimal server-sent-events client over fetch (EventSource can't send an Authorization header). */

export interface SseMessage {
  event: string;
  data: string;
}

/** Incremental parser: feed text chunks, get complete messages. Comments (pings) are skipped. */
export class SseParser {
  #buffer = "";
  #event = "message";
  #data: string[] = [];

  push(chunk: string): SseMessage[] {
    this.#buffer += chunk;
    const out: SseMessage[] = [];
    let newline: number;
    while ((newline = this.#buffer.search(/\r\n|\n|\r/)) !== -1) {
      const line = this.#buffer.slice(0, newline);
      const width = this.#buffer.startsWith("\r\n", newline) ? 2 : 1;
      this.#buffer = this.#buffer.slice(newline + width);
      if (line === "") {
        if (this.#data.length > 0) out.push({ event: this.#event, data: this.#data.join("\n") });
        this.#event = "message";
        this.#data = [];
        continue;
      }
      if (line.startsWith(":")) continue;
      const colon = line.indexOf(":");
      const field = colon === -1 ? line : line.slice(0, colon);
      const value = colon === -1 ? "" : line.slice(colon + 1).replace(/^ /, "");
      if (field === "event") this.#event = value;
      else if (field === "data") this.#data.push(value);
    }
    return out;
  }
}

export interface SseConnection {
  close: () => void;
}

export interface SseOptions {
  url: string;
  token: () => string | null;
  refreshToken: () => Promise<string | null>;
  onMessage: (message: SseMessage) => void;
  /** Called after every (re)connect, before the first message of that connection. */
  onOpen?: () => void;
  onStatus?: (connected: boolean) => void;
}

/** Connects and keeps reconnecting with backoff (1 s → 15 s) until closed. */
export function connectSse(options: SseOptions): SseConnection {
  let closed = false;
  // Read through a function: the flag changes from close(), which TS flow analysis can't see.
  const isClosed = () => closed;
  let controller = new AbortController();
  let attempt = 0;

  const loop = async () => {
    while (!isClosed()) {
      controller = new AbortController();
      try {
        let token = options.token();
        let res = await fetch(options.url, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          signal: controller.signal,
        });
        if (res.status === 401) {
          token = await options.refreshToken();
          if (token === null) return; // signed out
          res = await fetch(options.url, {
            headers: { Authorization: `Bearer ${token}` },
            signal: controller.signal,
          });
        }
        if (!res.ok || res.body === null) throw new Error(`HTTP ${String(res.status)}`);
        attempt = 0;
        options.onStatus?.(true);
        options.onOpen?.();
        const parser = new SseParser();
        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          for (const message of parser.push(value)) options.onMessage(message);
        }
      } catch {
        // Network error or abort: fall through to reconnect (unless closed).
      }
      options.onStatus?.(false);
      if (isClosed()) return;
      attempt += 1;
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(15_000, 1000 * 2 ** (attempt - 1))),
      );
    }
  };
  void loop();
  return {
    close() {
      closed = true;
      controller.abort();
    },
  };
}

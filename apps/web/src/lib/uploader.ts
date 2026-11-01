/**
 * Resumable multipart upload engine. Storage is the source of truth: on (re)start it asks the API
 * which parts already arrived and only sends the missing ones, so a refresh or network drop never
 * re-uploads finished parts.
 */

export interface UploadPlan {
  assetId: string;
  sizeBytes: number;
  partSizeBytes: number;
  partCount: number;
}

export interface UploadApi {
  create(file: { name: string; size: number; type: string }): Promise<UploadPlan>;
  status(
    assetId: string,
  ): Promise<UploadPlan & { uploadedParts: { partNumber: number; sizeBytes: number }[] }>;
  partUrls(assetId: string, partNumbers: number[]): Promise<Map<number, string>>;
  complete(assetId: string): Promise<void>;
}

/** PUTs one part; reports bytes sent so far for that part. Rejects with PartError on failure. */
export type PutPart = (
  url: string,
  body: Blob,
  onProgress: (sentBytes: number) => void,
  signal: AbortSignal,
) => Promise<void>;

export class PartError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(
      status === 0 ? "Network error while uploading" : `Storage responded HTTP ${String(status)}`,
    );
    this.status = status;
  }
}

export interface UploadOptions {
  file: Blob & { name: string };
  /** Resume this existing upload instead of creating a new one. */
  assetId?: string;
  api: UploadApi;
  putPart: PutPart;
  signal: AbortSignal;
  concurrency?: number;
  retries?: number;
  retryDelayMs?: number;
  onCreated?: (plan: UploadPlan) => void;
  onProgress?: (uploadedBytes: number, totalBytes: number) => void;
}

const URL_BATCH = 50;

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new DOMException("Upload cancelled", "AbortError"));
    });
  });
}

export async function runUpload(options: UploadOptions): Promise<void> {
  const { api, file, signal } = options;
  const concurrency = options.concurrency ?? 4;
  const retries = options.retries ?? 3;
  const retryDelayMs = options.retryDelayMs ?? 1000;

  let assetId = options.assetId;
  if (assetId === undefined) {
    const plan = await api.create({ name: file.name, size: file.size, type: file.type });
    assetId = plan.assetId;
    options.onCreated?.(plan);
  }
  const status = await api.status(assetId);
  if (status.sizeBytes !== file.size) {
    throw new Error(
      `This file is ${String(file.size)} bytes but the upload expects ${String(status.sizeBytes)}.`,
    );
  }
  const partSize = status.partSizeBytes;
  const done = new Map(status.uploadedParts.map((p) => [p.partNumber, p.sizeBytes]));
  const inFlight = new Map<number, number>();
  const report = () => {
    let bytes = 0;
    for (const size of done.values()) bytes += size;
    for (const sent of inFlight.values()) bytes += sent;
    options.onProgress?.(Math.min(bytes, file.size), file.size);
  };
  report();

  const missing: number[] = [];
  for (let n = 1; n <= status.partCount; n += 1) if (!done.has(n)) missing.push(n);
  const urls = new Map<number, string>();

  // Single flight: parallel workers share one presign batch instead of requesting overlaps.
  let pendingBatch: Promise<void> | null = null;
  const fetchBatch = (first: number) => {
    pendingBatch ??= (async () => {
      try {
        const wanted = missing.filter((m) => m !== first && !urls.has(m) && !done.has(m));
        const batch = [first, ...wanted].slice(0, URL_BATCH);
        for (const [k, v] of await api.partUrls(assetId, batch)) urls.set(k, v);
      } finally {
        pendingBatch = null;
      }
    })();
    return pendingBatch;
  };

  const urlFor = async (n: number, refresh = false): Promise<string> => {
    if (refresh) urls.delete(n);
    for (let tries = 0; tries < 3; tries += 1) {
      const cached = urls.get(n);
      if (cached !== undefined) return cached;
      await (pendingBatch ?? fetchBatch(n));
    }
    throw new Error(`No upload URL for part ${String(n)}`);
  };

  const uploadPart = async (n: number) => {
    const body = file.slice((n - 1) * partSize, Math.min(n * partSize, file.size));
    for (let attempt = 0; ; attempt += 1) {
      signal.throwIfAborted();
      try {
        // A 403 usually means the presigned URL expired: ask for a fresh one.
        await options.putPart(
          await urlFor(n, attempt > 0),
          body,
          (sent) => {
            inFlight.set(n, sent);
            report();
          },
          signal,
        );
        inFlight.delete(n);
        done.set(n, body.size);
        report();
        return;
      } catch (error) {
        inFlight.delete(n);
        if (signal.aborted || attempt >= retries || !(error instanceof PartError)) throw error;
        await sleep(retryDelayMs * 2 ** attempt, signal);
      }
    }
  };

  const queue = [...missing];
  const worker = async () => {
    for (let n = queue.shift(); n !== undefined; n = queue.shift()) await uploadPart(n);
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));
  signal.throwIfAborted();
  await api.complete(assetId);
}

/** Real transport: XHR (fetch has no upload progress). */
export const xhrPutPart: PutPart = (url, body, onProgress, signal) =>
  new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.upload.onprogress = (e) => {
      onProgress(e.loaded);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new PartError(xhr.status));
    };
    xhr.onerror = () => {
      reject(new PartError(0));
    };
    xhr.onabort = () => {
      reject(new DOMException("Upload cancelled", "AbortError"));
    };
    signal.addEventListener("abort", () => {
      xhr.abort();
    });
    xhr.send(body);
  });

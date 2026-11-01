import { describe, expect, it, vi } from "vitest";
import { PartError, runUpload, type PutPart, type UploadApi } from "./uploader.ts";

const PART = 10;

function fakeApi(size: number, uploaded: number[] = []) {
  const partCount = Math.ceil(size / PART);
  const issued: number[][] = [];
  const create = vi.fn(() =>
    Promise.resolve({ assetId: "a1", sizeBytes: size, partSizeBytes: PART, partCount }),
  );
  const partUrls = vi.fn((_id: string, numbers: number[]) => {
    issued.push(numbers);
    return Promise.resolve(
      new Map(numbers.map((n) => [n, `url-${String(n)}-${String(issued.length)}`])),
    );
  });
  const api: UploadApi & { completed: string[] } = {
    completed: [],
    create,
    status: vi.fn(() =>
      Promise.resolve({
        assetId: "a1",
        sizeBytes: size,
        partSizeBytes: PART,
        partCount,
        uploadedParts: uploaded.map((n) => ({
          partNumber: n,
          sizeBytes: Math.min(PART, size - (n - 1) * PART),
        })),
      }),
    ),
    partUrls,
    complete: vi.fn((id: string) => {
      api.completed.push(id);
      return Promise.resolve();
    }),
  };
  return { api, issued, create, partUrls };
}

function file(size: number) {
  return Object.assign(new Blob([new Uint8Array(size)]), { name: "clip.mp4" });
}

function recorder(failures: Record<string, number> = {}) {
  const puts: { url: string; size: number }[] = [];
  const put: PutPart = (url, body, onProgress) => {
    const key = url.split("-")[1] ?? "";
    if ((failures[key] ?? 0) > 0) {
      failures[key] = (failures[key] ?? 0) - 1;
      return Promise.reject(new PartError(403));
    }
    onProgress(body.size / 2);
    onProgress(body.size);
    puts.push({ url, size: body.size });
    return Promise.resolve();
  };
  return { put, puts };
}

describe("runUpload", () => {
  it("creates, uploads every part and completes, with monotonic progress", async () => {
    const { api } = fakeApi(35);
    const { put, puts } = recorder();
    const progress: number[] = [];
    const created = vi.fn();
    await runUpload({
      file: file(35),
      api,
      putPart: put,
      signal: new AbortController().signal,
      onCreated: created,
      onProgress: (bytes) => progress.push(bytes),
    });
    expect(created).toHaveBeenCalledWith(expect.objectContaining({ assetId: "a1", partCount: 4 }));
    expect(puts.map((p) => p.size).sort()).toEqual([10, 10, 10, 5]);
    expect(api.completed).toEqual(["a1"]);
    expect(progress.at(-1)).toBe(35);
  });

  it("resumes: only parts storage doesn't have are sent", async () => {
    const { api, create, partUrls } = fakeApi(40, [1, 3]);
    const { put, puts } = recorder();
    await runUpload({
      file: file(40),
      assetId: "a1",
      api,
      putPart: put,
      signal: new AbortController().signal,
    });
    expect(create).not.toHaveBeenCalled();
    expect(puts.map((p) => p.url.split("-")[1]).sort()).toEqual(["2", "4"]);
    expect(partUrls).toHaveBeenCalledTimes(1);
  });

  it("retries a failing part with a fresh URL", async () => {
    const { api, issued } = fakeApi(20);
    const { put, puts } = recorder({ "2": 2 });
    await runUpload({
      file: file(20),
      api,
      putPart: put,
      signal: new AbortController().signal,
      concurrency: 1,
      retryDelayMs: 1,
    });
    expect(puts).toHaveLength(2);
    expect(issued.filter((batch) => batch[0] === 2).length).toBeGreaterThanOrEqual(2);
    expect(api.completed).toEqual(["a1"]);
  });

  it("gives up after the retry budget and never completes", async () => {
    const { api } = fakeApi(10);
    const { put } = recorder({ "1": 99 });
    await expect(
      runUpload({
        file: file(10),
        api,
        putPart: put,
        signal: new AbortController().signal,
        retries: 2,
        retryDelayMs: 1,
      }),
    ).rejects.toBeInstanceOf(PartError);
    expect(api.completed).toEqual([]);
  });

  it("refuses to resume with a different file", async () => {
    const { api } = fakeApi(40, [1]);
    await expect(
      runUpload({
        file: file(41),
        assetId: "a1",
        api,
        putPart: recorder().put,
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow(/expects 40/);
  });

  it("stops when cancelled", async () => {
    const { api } = fakeApi(10);
    const controller = new AbortController();
    controller.abort();
    await expect(
      runUpload({ file: file(10), api, putPart: recorder().put, signal: controller.signal }),
    ).rejects.toThrow();
    expect(api.completed).toEqual([]);
  });
});

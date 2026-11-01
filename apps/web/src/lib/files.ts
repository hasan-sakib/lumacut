/** Picking files, keeping a FileSystemFileHandle when the browser offers one (Chrome/Edge),
 * so an interrupted upload can resume after a page refresh without re-picking the file. */

export interface PickedFile {
  file: File;
  handle?: FileSystemFileHandle;
}

interface PermissionCapableHandle extends FileSystemFileHandle {
  queryPermission?: (d: { mode: "read" }) => Promise<PermissionState>;
  requestPermission?: (d: { mode: "read" }) => Promise<PermissionState>;
}

type ShowOpenFilePicker = (options: { multiple: boolean }) => Promise<FileSystemFileHandle[]>;

function nativePicker(): ShowOpenFilePicker | undefined {
  return (window as unknown as { showOpenFilePicker?: ShowOpenFilePicker }).showOpenFilePicker;
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

/** Opens the hidden <input type=file> and resolves with the chosen files ([] if cancelled). */
export function pickWithInput(input: HTMLInputElement, multiple: boolean): Promise<PickedFile[]> {
  return new Promise((resolve) => {
    input.multiple = multiple;
    input.value = "";
    const finish = () => {
      input.removeEventListener("change", finish);
      input.removeEventListener("cancel", finish);
      resolve(Array.from(input.files ?? [], (file) => ({ file })));
    };
    input.addEventListener("change", finish);
    input.addEventListener("cancel", finish);
    input.click();
  });
}

export async function pickFiles(input: HTMLInputElement, multiple = true): Promise<PickedFile[]> {
  const picker = nativePicker();
  if (picker === undefined) return pickWithInput(input, multiple);
  try {
    const handles = await picker({ multiple });
    return await Promise.all(
      handles.map(async (handle) => ({ file: await handle.getFile(), handle })),
    );
  } catch (error) {
    if (isAbort(error)) return [];
    return pickWithInput(input, multiple);
  }
}

/** Files from a drop, with handles where the browser supports them. */
export async function droppedFiles(transfer: DataTransfer): Promise<PickedFile[]> {
  type HandleItem = DataTransferItem & {
    getAsFileSystemHandle?: () => Promise<FileSystemHandle | null>;
  };
  const items = Array.from(transfer.items).filter((i) => i.kind === "file") as HandleItem[];
  // Every getAsFile/getAsFileSystemHandle call must happen synchronously in the drop handler.
  const pending = items.map((item) => ({
    file: item.getAsFile(),
    handle: item.getAsFileSystemHandle?.(),
  }));
  const picked: PickedFile[] = [];
  for (const { file, handle } of pending) {
    if (file === null) continue;
    const resolved = await handle?.catch(() => null);
    picked.push(
      resolved?.kind === "file" ? { file, handle: resolved as FileSystemFileHandle } : { file },
    );
  }
  return picked;
}

/** Re-open a stored handle after a refresh; asks for permission (call from a click). */
export async function fileFromHandle(handle: FileSystemFileHandle): Promise<File | null> {
  const h = handle as PermissionCapableHandle;
  try {
    let state = (await h.queryPermission?.({ mode: "read" })) ?? "granted";
    if (state !== "granted") state = (await h.requestPermission?.({ mode: "read" })) ?? "denied";
    return state === "granted" ? await handle.getFile() : null;
  } catch {
    return null;
  }
}

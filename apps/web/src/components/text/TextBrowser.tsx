import { useState } from "react";
import { CAPTION_STYLES } from "../../captions/styles.ts";

interface TextBrowserProps {
  /** A caption clip is selected (so a style can be applied). */
  hasCaption: boolean;
  /** Runs an action by id (`text.add`, `caption.add`…); resolves with an error message or null. */
  run: (id: string, args?: unknown) => Promise<string | null>;
}

/** Add titles and captions: type words, paste a transcript, or import an SRT / VTT file. */
export function TextBrowser({ hasCaption, run }: TextBrowserProps) {
  const [words, setWords] = useState("");
  const [error, setError] = useState<string | null>(null);
  const call = async (id: string, args?: unknown) => {
    const message = await run(id, args);
    setError(message ?? null);
  };
  return (
    <section aria-label="Text and captions" className="flex flex-col gap-3 p-3 text-xs">
      <button
        type="button"
        title="Add a title at the playhead"
        onMouseDown={(e) => {
          e.preventDefault();
        }}
        onClick={() => void call("text.add")}
        className="self-start rounded bg-sky-700 px-3 py-1.5 text-white hover:bg-sky-600"
      >
        + Add text
      </button>

      <div className="flex flex-col gap-2">
        <h3 className="font-semibold text-neutral-300">Captions</h3>
        <textarea
          aria-label="Words to caption"
          rows={4}
          placeholder="Paste the words here, or the contents of an .srt / .vtt file"
          value={words}
          onChange={(e) => {
            setWords(e.target.value);
          }}
          className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-neutral-100 outline-none focus:border-sky-500"
        />
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            disabled={words.trim() === ""}
            title="Time the words evenly over a caption clip at the playhead"
            onMouseDown={(e) => {
              e.preventDefault();
            }}
            onClick={() => void call("caption.add", { text: words })}
            className="rounded bg-neutral-800 px-2 py-1 text-neutral-200 hover:bg-neutral-700 disabled:opacity-40"
          >
            Add from text
          </button>
          <button
            type="button"
            disabled={words.trim() === ""}
            title="Use the timing in pasted subtitle text (SRT or VTT)"
            onMouseDown={(e) => {
              e.preventDefault();
            }}
            onClick={() => void call("caption.importSrt", { subtitles: words })}
            className="rounded bg-neutral-800 px-2 py-1 text-neutral-200 hover:bg-neutral-700 disabled:opacity-40"
          >
            Import SRT / VTT
          </button>
          <label className="cursor-pointer rounded bg-neutral-800 px-2 py-1 text-neutral-200 hover:bg-neutral-700">
            Open file…
            <input
              type="file"
              accept=".srt,.vtt,text/vtt,text/plain"
              aria-label="Open a subtitle file"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file === undefined) return;
                void file
                  .text()
                  .then((content) => call("caption.importSrt", { subtitles: content }));
              }}
            />
          </label>
        </div>
        {error !== null && (
          <p role="alert" className="text-red-300">
            {error}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <h3 className="font-semibold text-neutral-300">Caption styles</h3>
        {!hasCaption && <p className="text-neutral-500">Select a caption clip to style it.</p>}
        <ul className="flex flex-col gap-1">
          {CAPTION_STYLES.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                disabled={!hasCaption}
                title={`${s.name}: ${s.description}`}
                aria-label={`Apply ${s.name} caption style`}
                onMouseDown={(e) => {
                  e.preventDefault();
                }}
                onClick={() => void call("caption.applyStyle", { style: s.id })}
                className="w-full rounded px-2 py-1.5 text-left text-neutral-200 hover:bg-neutral-800 disabled:opacity-40"
              >
                <span className="block font-medium">{s.name}</span>
                <span className="block text-neutral-500">{s.description}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

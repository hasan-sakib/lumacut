export type DiagnosticLevel = "warning" | "error";

/**
 * Something the engine could not draw or had to approximate. Nothing unsupported is ever dropped
 * silently: the render completes and these explain what is missing.
 */
export interface Diagnostic {
  /** The clip concerned, or null when it is about the composition as a whole. */
  clipId: string | null;
  level: DiagnosticLevel;
  /** Stable machine-readable code, e.g. "unsupported_clip_type". */
  code: string;
  message: string;
}

/** Collects diagnostics for one render, keeping one entry per (clip, code). */
export class DiagnosticSink {
  readonly #byKey = new Map<string, Diagnostic>();

  add(diagnostic: Diagnostic): void {
    const key = `${diagnostic.clipId ?? ""}|${diagnostic.code}`;
    if (!this.#byKey.has(key)) this.#byKey.set(key, diagnostic);
  }

  list(): Diagnostic[] {
    return [...this.#byKey.values()];
  }
}

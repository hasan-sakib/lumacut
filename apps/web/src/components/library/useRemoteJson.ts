import { useEffect, useRef, useState, type RefObject } from "react";

const cache = new Map<string, Promise<unknown>>();

/** Stable cache key for a presigned URL (the signature changes on every list request). */
function cacheKey(url: string): string {
  const u = new URL(url);
  return u.origin + u.pathname;
}

/** Fetches JSON from storage (CORS) once `enabled`, cached across components. */
/** Callers cast the result: it is JSON written by our own worker (index, waveform). */
export function useRemoteJson(url: string | null | undefined, enabled: boolean): unknown {
  const [value, setValue] = useState<unknown>(null);
  useEffect(() => {
    if (!url || !enabled) return;
    let active = true;
    const key = cacheKey(url);
    let pending = cache.get(key);
    if (pending === undefined) {
      pending = fetch(url, { mode: "cors" }).then((r) => (r.ok ? r.json() : null));
      pending.catch(() => cache.delete(key));
      cache.set(key, pending);
    }
    pending.then(
      (data) => {
        if (active) setValue(data);
      },
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, [url, enabled]);
  return value;
}

/** True once the element has scrolled into view (always true without IntersectionObserver). */
export function useInView<E extends Element>(): [RefObject<E | null>, boolean] {
  const ref = useRef<E>(null);
  const [inView, setInView] = useState(typeof IntersectionObserver === "undefined");
  useEffect(() => {
    if (inView || ref.current === null) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setInView(true);
        observer.disconnect();
      }
    });
    observer.observe(ref.current);
    return () => {
      observer.disconnect();
    };
  }, [inView]);
  return [ref, inView];
}

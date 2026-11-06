import type { Composition, Project } from "@lumacut/schema";

/** 32-bit FNV-1a pair as hex; enough to tell compositions apart in a cache key. */
export function hashString(text: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ (c + i), 0x85ebca6b);
  }
  return `${(h1 >>> 0).toString(16)}${(h2 >>> 0).toString(16)}`;
}

/**
 * Structural hash of a composition and every composition nested inside it, so a nested render is
 * cached under a key that changes whenever anything it shows changes. Memoised per project.
 */
export function compositionHash(
  project: Project,
  composition: Composition,
  memo: Map<string, string>,
): string {
  const cached = memo.get(composition.id);
  if (cached !== undefined) return cached;
  const byId = new Map(project.compositions.map((c) => [c.id, c]));
  const children: string[] = [];
  for (const track of composition.tracks) {
    for (const clip of track.clips) {
      const child = clip.compositionId === undefined ? undefined : byId.get(clip.compositionId);
      if (clip.type === "composition" && child !== undefined) {
        children.push(compositionHash(project, child, memo));
      }
    }
  }
  const hash = hashString(JSON.stringify(composition) + children.join(","));
  memo.set(composition.id, hash);
  return hash;
}

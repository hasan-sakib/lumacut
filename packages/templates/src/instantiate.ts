import type { Clip, Project } from "@lumacut/schema";

/**
 * A new project from a template: every composition, track and clip gets a fresh id (references
 * between them follow), clips are marked as coming from the template, and the project remembers
 * which template it came from. Ids inside a clip (effects, masks, shape items, animators) only
 * need to be unique within it, so they and the keyframe paths that name them stay as they are.
 */
export function instantiateTemplate(
  template: Project,
  templateId: string,
  newId: () => string,
): Project {
  const ids = new Map<string, string>();
  const fresh = (old: string): string => {
    let id = ids.get(old);
    if (id === undefined) {
      id = newId();
      ids.set(old, id);
    }
    return id;
  };
  // Clip ids first, so mattes and links can be remapped wherever they appear.
  for (const comp of template.compositions) {
    fresh(`comp:${comp.id}`);
    for (const track of comp.tracks) for (const clip of track.clips) fresh(`clip:${clip.id}`);
  }
  const clipId = (id: string) => ids.get(`clip:${id}`) ?? id;
  const compId = (id: string) => ids.get(`comp:${id}`) ?? id;
  const remapClip = (clip: Clip): Clip => ({
    ...structuredClone(clip),
    id: clipId(clip.id),
    source: "template",
    ...(clip.compositionId === undefined ? {} : { compositionId: compId(clip.compositionId) }),
    ...(clip.linkId === undefined ? {} : { linkId: fresh(`link:${clip.linkId}`) }),
    ...(clip.trackMatte === undefined
      ? {}
      : { trackMatte: { ...clip.trackMatte, sourceClipId: clipId(clip.trackMatte.sourceClipId) } }),
  });
  return {
    ...structuredClone(template),
    compositions: template.compositions.map((comp) => ({
      ...structuredClone(comp),
      id: compId(comp.id),
      tracks: comp.tracks.map((track) => ({
        ...structuredClone(track),
        id: fresh(`track:${track.id}`),
        clips: track.clips.map(remapClip),
      })),
      markers: comp.markers.map((m) => ({ ...m, id: fresh(`marker:${m.id}`) })),
    })),
    mainCompositionId: compId(template.mainCompositionId),
    meta: { ...template.meta, templateId, aiRuns: [] },
  };
}

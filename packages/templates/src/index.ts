import { INTROS } from "./catalog/intros.ts";
import { LOWER_THIRDS } from "./catalog/lowerThirds.ts";
import { QUOTE_CARDS } from "./catalog/quoteCards.ts";
import { REELS } from "./catalog/reels.ts";
import { SLIDESHOWS } from "./catalog/slideshows.ts";
import type { TemplateDefinition } from "./catalog/types.ts";

/** The 20 built-in templates. */
export const TEMPLATES: readonly TemplateDefinition[] = [
  ...REELS,
  ...INTROS,
  ...LOWER_THIRDS,
  ...SLIDESHOWS,
  ...QUOTE_CARDS,
];

export const templateById = (id: string): TemplateDefinition | undefined =>
  TEMPLATES.find((t) => t.id === id);

/** Templates whose name, category, description or keywords contain every word typed. */
export function searchTemplates(query: string): TemplateDefinition[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...TEMPLATES];
  return TEMPLATES.filter((t) => {
    const haystack = [t.name, t.category, t.description, t.aspect, ...t.keywords]
      .join(" ")
      .toLowerCase();
    return words.every((w) => haystack.includes(w));
  });
}

export {
  CATEGORY_LABEL,
  type TemplateAspect,
  type TemplateCategory,
  type TemplateDefinition,
} from "./catalog/types.ts";
export {
  TemplateBuilder,
  evenWords,
  hex,
  textData,
  type Box,
  type Span,
  type TextStyle,
} from "./builder.ts";
export { instantiateTemplate } from "./instantiate.ts";
export {
  projectSlots,
  replaceMediaOps,
  setColorOps,
  setTextOps,
  slotColor,
  slotText,
  type Slot,
} from "./slots.ts";
export { STICKERS, stickerById, type Sticker } from "./stickers.ts";

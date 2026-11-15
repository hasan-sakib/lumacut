import type { Project } from "@lumacut/schema";

export type TemplateCategory = "reels" | "intros" | "lowerThirds" | "slideshows" | "quoteCards";
export type TemplateAspect = "9:16" | "16:9" | "1:1" | "4:5";

export interface TemplateDefinition {
  id: string;
  name: string;
  category: TemplateCategory;
  description: string;
  aspect: TemplateAspect;
  keywords: readonly string[];
  /** Builds the template's project (deterministic: the same document every time). */
  build: () => Project;
}

export const CATEGORY_LABEL: Record<TemplateCategory, string> = {
  reels: "Reels",
  intros: "Intros",
  lowerThirds: "Lower thirds",
  slideshows: "Slideshows",
  quoteCards: "Quote cards",
};

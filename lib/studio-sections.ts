import { AudioLines, Clapperboard, Image as ImageIcon, LayoutGrid } from "lucide-react";

import type { Locale } from "@/lib/i18n";

/**
 * The single definition of Studio's library taxonomy, shared by the sidebar's
 * Studio content mode and (later) the unified grid's filter. Kept in one place
 * for the same reason as `community-sections.ts`: duplicating the labels across
 * the sidebar and the grid is how the two drift apart.
 *
 * Unlike community sections, a Studio section is NOT a route segment — it is a
 * `kind` filter over the one unified playground grid. `kind: null` is "all
 * media". Each consumer builds its own href (the sidebar appends `?kind=<kind>`
 * to the studio route; the grid reads the same param). The kinds mirror the
 * catalog's own `kind` union (image | video | audio) so the taxonomy can never
 * name a category the data cannot produce.
 */
export type StudioSectionKind = "image" | "video" | "audio";

export type StudioSection = {
  id: string;
  /** `null` = all media; otherwise the catalog `kind` this section filters to. */
  kind: StudioSectionKind | null;
  labelSr: string;
  labelEn: string;
  icon: typeof LayoutGrid;
  staffOnly?: boolean;
};

export const STUDIO_SECTIONS: StudioSection[] = [
  {
    id: "all",
    kind: null,
    labelSr: "Sav sadržaj",
    labelEn: "All media",
    icon: LayoutGrid,
  },
  {
    id: "images",
    kind: "image",
    labelSr: "Slike",
    labelEn: "Images",
    icon: ImageIcon,
  },
  {
    id: "videos",
    kind: "video",
    labelSr: "Video",
    labelEn: "Video",
    icon: Clapperboard,
  },
  {
    id: "audio",
    kind: "audio",
    labelSr: "Zvuk",
    labelEn: "Audio",
    icon: AudioLines,
  },
];

export function studioSectionsFor(isStaff: boolean) {
  return STUDIO_SECTIONS.filter((section) => !section.staffOnly || isStaff);
}

export function studioSectionLabel(section: StudioSection, locale: Locale) {
  return locale === "sr" ? section.labelSr : section.labelEn;
}

/**
 * Resolves the active section id from the `kind` query value the grid filters on.
 * An unknown or absent kind falls back to "all", so the sidebar never highlights
 * a section the data cannot produce.
 */
export function activeStudioSection(kind: string | null | undefined) {
  if (!kind) return "all";
  const match = STUDIO_SECTIONS.find((section) => section.kind === kind);
  return match ? match.id : "all";
}

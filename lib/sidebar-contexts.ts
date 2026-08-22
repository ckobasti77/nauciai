import { LayoutDashboard, Wand2, type LucideIcon } from "lucide-react";

import { locales, withLocale, type Locale } from "@/lib/i18n";
import {
  STUDIO_SECTIONS,
  activeStudioSection,
  type StudioSection,
} from "@/lib/studio-sections";

/**
 * The single source of truth for what the app sidebar shows. Before this, the sidebar
 * hardcoded exactly two states ("classic" and "studio") behind a boolean; every new area
 * meant another boolean and another pair of drift-prone label lists. A context is resolved
 * from the pathname, and `SidebarNavSwap` gets N contexts instead of 2.
 *
 * The declarative section sources (`lib/studio-sections.ts`, `lib/community-sections.ts`)
 * stay authoritative: this registry *imports and adapts* them into the shared shape, it
 * never re-writes their labels. `href`/`isActive` are functions so one type absorbs three
 * destination encodings (route segment + preserved query, `?kind=` filter, full route).
 */

export type SidebarContextId = "home" | "classroom" | "studio" | "community" | "admin";
export type SidebarBadgeKey = "myThreads" | "community" | "pendingApprovals" | "messages";

/** Params read from the pathname (useParams) plus the query-state community must preserve. */
export type SidebarHrefParams = {
  courseSlug?: string;
  trackSlug?: string;
  lessonSlug?: string;
  courseTitle?: string;
  trackTitle?: string;
  /** scope/track/course/q/sort — re-added by the community href builder. */
  preserved?: URLSearchParams;
};

export type SidebarSection = {
  id: string;
  labelSr: string;
  labelEn: string;
  icon: LucideIcon;
  /** Destination. A function so it absorbs segment | query | full route. */
  href: (locale: Locale, params: SidebarHrefParams) => string;
  /** Activity. Absorbs the pathname vs. `?kind=` difference. */
  isActive: (pathname: string, searchParams: URLSearchParams, params: SidebarHrefParams) => boolean;
  /** Conditional sections (classroom); default: always visible. */
  visible?: (params: SidebarHrefParams) => boolean;
  /** Computed label (classroom "Smer · X"); default: labelSr/labelEn. */
  dynamicLabel?: (params: SidebarHrefParams, locale: Locale) => string;
  badgeKey?: SidebarBadgeKey;
  staffOnly?: boolean;
  adminOnly?: boolean;
};

export type SidebarContext = {
  id: SidebarContextId;
  /** Path prefixes without the locale; first match wins. Not consulted for `home` (fallback). */
  matches: readonly string[];
  rootHref: (locale: Locale) => string;
  /**
   * In Phase 1 `labelSr/labelEn` is the nav's `aria-label` — the only place the context label
   * is consumed until the home launcher renders context tiles (Phase 2+). Studio keeps its
   * exact wording so its rendered nav is unchanged.
   */
  labelSr: string;
  labelEn: string;
  icon: LucideIcon;
  /** The group heading above the section list ("Biblioteka" for studio). */
  groupLabelSr?: string;
  groupLabelEn?: string;
  /** Whole context gated to admins. */
  adminOnly?: boolean;
  sections: SidebarSection[];
};

/** Drops a leading `/sr` or `/en` so contexts match on the locale-free path. */
function stripLocale(pathname: string): string {
  const parts = pathname.split("/");
  if (parts[1] && (locales as readonly string[]).includes(parts[1])) {
    parts.splice(1, 1);
  }
  const stripped = parts.join("/");
  return stripped === "" ? "/" : stripped;
}

// --- studio ------------------------------------------------------------------

/** Adapts one declarative `StudioSection` (a `?kind=` filter) into the shared shape. */
function fromStudioSection(section: StudioSection): SidebarSection {
  return {
    id: section.id,
    labelSr: section.labelSr,
    labelEn: section.labelEn,
    icon: section.icon,
    staffOnly: section.staffOnly,
    href: (locale) => {
      const base = withLocale(locale, "/app/studio");
      return section.kind ? `${base}?kind=${section.kind}` : base;
    },
    isActive: (_pathname, searchParams) => activeStudioSection(searchParams.get("kind")) === section.id,
  };
}

const studioContext: SidebarContext = {
  id: "studio",
  matches: ["/app/studio"],
  rootHref: (locale) => withLocale(locale, "/app/studio"),
  labelSr: "Studijska biblioteka",
  labelEn: "Studio library",
  icon: Wand2,
  groupLabelSr: "Biblioteka",
  groupLabelEn: "Library",
  sections: STUDIO_SECTIONS.map(fromStudioSection),
};

// --- home (fallback sentinel) ------------------------------------------------

const homeContext: SidebarContext = {
  id: "home",
  matches: ["/app"],
  rootHref: (locale) => withLocale(locale, "/app"),
  labelSr: "Početna",
  labelEn: "Home",
  icon: LayoutDashboard,
  // The home branch is still rendered by the hand-written `classic` slot in `app-sidebar.tsx`;
  // these sections are not rendered in Phase 1 — home exists so `resolveSidebarContext` has a
  // non-null fallback and the swap stays on `classic`.
  sections: [],
};

// Non-home contexts, checked in order; community + admin are added in Phase 1b/1c.
const CONTEXTS: readonly SidebarContext[] = [studioContext];

export function resolveSidebarContext(pathname: string): SidebarContext {
  const path = stripLocale(pathname);
  for (const context of CONTEXTS) {
    if (context.matches.some((match) => path === match || path.startsWith(`${match}/`))) {
      return context;
    }
  }
  return homeContext;
}

export function sectionsFor(
  context: SidebarContext,
  { isStaff, isAdmin, params }: { isStaff: boolean; isAdmin: boolean; params: SidebarHrefParams },
): SidebarSection[] {
  return context.sections.filter((section) => {
    if (section.staffOnly && !isStaff) return false;
    if (section.adminOnly && !isAdmin) return false;
    if (section.visible && !section.visible(params)) return false;
    return true;
  });
}

export function activeSectionId(
  context: SidebarContext,
  pathname: string,
  searchParams: URLSearchParams,
  params: SidebarHrefParams,
): string | null {
  const match = context.sections.find((section) => section.isActive(pathname, searchParams, params));
  return match ? match.id : null;
}

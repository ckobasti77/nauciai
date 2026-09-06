import {
  BarChart3,
  BookOpen,
  Compass,
  FileText,
  GraduationCap,
  LayoutDashboard,
  Megaphone,
  MessageCircle,
  Settings2,
  Shield,
  ShieldCheck,
  Users,
  Wand2,
  type LucideIcon,
} from "lucide-react";

import { classroomPath, coursePath, trackPath } from "@/lib/app-routes";
import {
  COMMUNITY_SECTIONS,
  activeCommunitySection,
  type CommunitySection,
} from "@/lib/community-sections";
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

// --- community ---------------------------------------------------------------

/**
 * The query keys community carries between sections. The sidebar used to drop these; the
 * registry preserves them, matching community's own nav. The caller builds `params.preserved`
 * from these keys; the href re-appends whatever it is given.
 */
export const COMMUNITY_PRESERVED_KEYS = ["scope", "track", "course", "q", "sort"] as const;

/** Adapts one declarative `CommunitySection` (a route segment) into the shared shape. */
function fromCommunitySection(section: CommunitySection): SidebarSection {
  return {
    id: section.id,
    labelSr: section.labelSr,
    labelEn: section.labelEn,
    icon: section.icon,
    staffOnly: section.staffOnly,
    badgeKey: section.badgeKey,
    href: (locale, params) => {
      const base = withLocale(locale, `/app/community/${section.path}`);
      const query = params.preserved?.toString() ?? "";
      return query ? `${base}?${query}` : base;
    },
    isActive: (pathname) => activeCommunitySection(pathname) === section.id,
  };
}

const communityContext: SidebarContext = {
  id: "community",
  matches: ["/app/community"],
  rootHref: (locale) => withLocale(locale, "/app/community/discussions"),
  labelSr: "Sekcije zajednice",
  labelEn: "Community sections",
  icon: MessageCircle,
  groupLabelSr: "Zajednica",
  groupLabelEn: "Community",
  sections: COMMUNITY_SECTIONS.map(fromCommunitySection),
};

// --- admin -------------------------------------------------------------------

/** Authors one admin section as a full route. Gate is per-section (adminOnly / staffOnly). */
function adminSection(opts: {
  id: string;
  labelSr: string;
  labelEn: string;
  icon: LucideIcon;
  path: string;
  staffOnly?: boolean;
  adminOnly?: boolean;
}): SidebarSection {
  return {
    id: opts.id,
    labelSr: opts.labelSr,
    labelEn: opts.labelEn,
    icon: opts.icon,
    staffOnly: opts.staffOnly,
    adminOnly: opts.adminOnly,
    href: (locale) => withLocale(locale, opts.path),
    isActive: (pathname) => stripLocale(pathname) === opts.path,
  };
}

const adminContext: SidebarContext = {
  id: "admin",
  matches: ["/app/admin"],
  rootHref: (locale) => withLocale(locale, "/app/admin/content"),
  labelSr: "Admin sekcije",
  labelEn: "Admin sections",
  icon: ShieldCheck,
  groupLabelSr: "Administracija",
  groupLabelEn: "Admin",
  // Whole group is admin-only; Chat sigurnost is the one section staff (moderators) also see.
  adminOnly: true,
  sections: [
    adminSection({ id: "content", labelSr: "Sadržaj", labelEn: "Content", icon: FileText, path: "/app/admin/content", adminOnly: true }),
    adminSection({ id: "users", labelSr: "Korisnici", labelEn: "Users", icon: Users, path: "/app/admin/users", adminOnly: true }),
    adminSection({ id: "growth", labelSr: "Rast", labelEn: "Growth", icon: Megaphone, path: "/app/admin/growth", adminOnly: true }),
    adminSection({ id: "analytics", labelSr: "Analitika", labelEn: "Analytics", icon: BarChart3, path: "/app/admin/analytics", adminOnly: true }),
    adminSection({ id: "chat", labelSr: "Chat sigurnost", labelEn: "Chat safety", icon: Shield, path: "/app/admin/chat", staffOnly: true }),
    adminSection({ id: "studio", labelSr: "Studio admin", labelEn: "Studio admin", icon: Wand2, path: "/app/admin/studio", adminOnly: true }),
    adminSection({ id: "settings", labelSr: "Opšte informacije", labelEn: "General info", icon: Settings2, path: "/app/admin/settings", adminOnly: true }),
  ],
};

// --- classroom ---------------------------------------------------------------

const CLASSROOM_ROOT = "/app/classroom";

/**
 * Overview/Tracks/Courses all live on the hub, distinguished by `?view=`. isActive reads the
 * query the same way studio reads `?kind=`; a track/course detail route activates its own
 * conditional section below instead, never these three.
 */
function classroomViewSection(opts: {
  id: string;
  labelSr: string;
  labelEn: string;
  icon: LucideIcon;
  view?: "tracks" | "courses";
}): SidebarSection {
  return {
    id: opts.id,
    labelSr: opts.labelSr,
    labelEn: opts.labelEn,
    icon: opts.icon,
    href: (locale) => (opts.view ? `${classroomPath(locale)}?view=${opts.view}` : classroomPath(locale)),
    isActive: (pathname, searchParams) =>
      stripLocale(pathname) === CLASSROOM_ROOT && (searchParams.get("view") ?? "") === (opts.view ?? ""),
  };
}

const classroomContext: SidebarContext = {
  id: "classroom",
  matches: [CLASSROOM_ROOT],
  rootHref: (locale) => classroomPath(locale),
  labelSr: "Učionica",
  labelEn: "Classroom",
  icon: GraduationCap,
  groupLabelSr: "Učionica",
  groupLabelEn: "Classroom",
  sections: [
    classroomViewSection({ id: "overview", labelSr: "Pregled", labelEn: "Overview", icon: LayoutDashboard }),
    classroomViewSection({ id: "tracks", labelSr: "Smerovi", labelEn: "Tracks", icon: Compass, view: "tracks" }),
    classroomViewSection({ id: "courses", labelSr: "Kursevi", labelEn: "Courses", icon: BookOpen, view: "courses" }),
    // Conditional: present only inside a track/course, with a computed "Smer · X" / "Kurs · Y" label.
    {
      id: "track",
      labelSr: "Smer",
      labelEn: "Track",
      icon: Compass,
      visible: (params) => Boolean(params.trackSlug),
      dynamicLabel: (params, locale) => {
        const prefix = locale === "sr" ? "Smer" : "Track";
        return params.trackTitle ? `${prefix} · ${params.trackTitle}` : prefix;
      },
      href: (locale, params) => (params.trackSlug ? trackPath(locale, params.trackSlug) : classroomPath(locale)),
      isActive: (_pathname, _searchParams, params) => Boolean(params.trackSlug),
    },
    {
      id: "course",
      labelSr: "Kurs",
      labelEn: "Course",
      icon: GraduationCap,
      visible: (params) => Boolean(params.courseSlug),
      dynamicLabel: (params, locale) => {
        const prefix = locale === "sr" ? "Kurs" : "Course";
        return params.courseTitle ? `${prefix} · ${params.courseTitle}` : prefix;
      },
      href: (locale, params) => (params.courseSlug ? coursePath(locale, params.courseSlug) : classroomPath(locale)),
      isActive: (_pathname, _searchParams, params) => Boolean(params.courseSlug) && !params.lessonSlug,
    },
  ],
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

// Non-home contexts, checked in order; the first prefix match wins.
const CONTEXTS: readonly SidebarContext[] = [classroomContext, studioContext, communityContext, adminContext];

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

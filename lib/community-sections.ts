import { BarChart3, Bell, BookOpenText, MessageSquareText, ShieldCheck, Users } from "lucide-react";

import type { Locale } from "@/lib/i18n";

/**
 * The single definition of community's sub-sections, shared by community's own section
 * nav and by the primary sidebar's nested group. Duplicating six labels across two files
 * is how the two navs drift apart, which is what made these sections invisible from the
 * primary navigation in the first place.
 *
 * `path` is a bare segment, appended to /app/community/ by each consumer's own href
 * builder — community's preserves scope/track/course/q/sort, the sidebar's does not.
 */
export type CommunitySection = {
  id: string;
  path: string;
  labelSr: string;
  labelEn: string;
  icon: typeof MessageSquareText;
  /** Which key on the community filters `counts` payload feeds this section's badge. */
  badgeKey?: "myThreads" | "community" | "pendingApprovals";
  staffOnly?: boolean;
};

export const COMMUNITY_SECTIONS: CommunitySection[] = [
  {
    id: "discussions",
    path: "discussions",
    labelSr: "Diskusije",
    labelEn: "Discussions",
    icon: MessageSquareText,
  },
  {
    id: "my-threads",
    path: "my-threads",
    labelSr: "Moji predlozi",
    labelEn: "My ideas",
    icon: BookOpenText,
    badgeKey: "myThreads",
  },
  {
    id: "notifications",
    path: "notifications",
    labelSr: "Obaveštenja",
    labelEn: "Notifications",
    icon: Bell,
    badgeKey: "community",
  },
  {
    id: "members",
    path: "members",
    labelSr: "Članovi",
    labelEn: "Members",
    icon: Users,
  },
  {
    id: "leaderboard",
    path: "leaderboard",
    labelSr: "Leaderboard",
    labelEn: "Leaderboard",
    icon: BarChart3,
  },
  {
    id: "moderation",
    path: "moderation",
    labelSr: "Odobrenja",
    labelEn: "Approvals",
    icon: ShieldCheck,
    badgeKey: "pendingApprovals",
    staffOnly: true,
  },
];

export function communitySectionsFor(isStaff: boolean) {
  return COMMUNITY_SECTIONS.filter((section) => !section.staffOnly || isStaff);
}

export function communitySectionLabel(section: CommunitySection, locale: Locale) {
  return locale === "sr" ? section.labelSr : section.labelEn;
}

/**
 * Resolves a pathname to a section id. `new`, `edit` and bare post ids all belong to
 * Discussions. Kept here so the sidebar highlights the same section community does.
 */
export function activeCommunitySection(pathname: string) {
  const match = pathname.match(/\/community\/([^/?#]+)/);
  const segment = match?.[1];
  if (!segment || segment === "new" || segment === "edit" || !Number.isNaN(Number(segment))) {
    return "discussions";
  }
  // `mentions` is a legacy redirect stub that lands on notifications.
  if (segment === "mentions") return "notifications";
  if (COMMUNITY_SECTIONS.some((section) => section.id === segment)) return segment;
  return "discussions";
}

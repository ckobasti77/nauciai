import { MessagesSquare } from "lucide-react";

import { BadgeSticker } from "@/components/igra/badge-sticker";
import { LevelStamp } from "@/components/igra/level-stamp";
import { XpBar } from "@/components/igra/xp-bar";
import { cn } from "@/components/ui/primitives";
import type { CommunityBadgeKey } from "@/lib/community-gamification";
import { COMMUNITY_BADGE_STICKER } from "@/lib/igra-community";
import { levelFromXp } from "@/lib/igra-level";
import { communityGamificationContent, type Locale } from "@/lib/i18n";

/*
 * Nivo i značke člana (N12, K11) - lista članova i profil člana. Stoje u svom fajlu, a ne
 * uz `VoteScore` u `community-gamification.tsx`: nalepnice vuku katalog bedževa, amblem
 * nivoa i GSAP hookove, a brojač glasova čitaju i feed, detalj teme i rang lista.
 */

/**
 * Nivo člana: nalepnica nivoa sa imenom i XP traka do sledećeg, od IGRA primitiva. Nivo
 * računa `levelFromXp` - isti izvor kao ljuska i panel „Moj napredak", pa član nema jedan
 * nivo u zajednici, a drugi na tabli. `compact` je za karticu u listi članova: bez
 * natpisa iznad trake i bez animacije ispune.
 */
export function LevelMeter({
  locale,
  xp,
  compact = false,
  className,
}: {
  locale: Locale;
  xp: number | undefined;
  compact?: boolean;
  className?: string;
}) {
  const safeXp = xp ?? 0;

  return (
    <div className={cn("min-w-0", className)}>
      <LevelStamp level={levelFromXp(safeXp).level} locale={locale} size="sm" showName />
      <XpBar xp={safeXp} locale={locale} size="sm" showLabel={!compact} animate={!compact} className="mt-2" />
    </div>
  );
}

/**
 * Značke člana pored imena. Značka koja ima svoj bedž crta se kao njegova nalepnica
 * (`BadgeSticker`: naziv i uslov su u oblačiću i u nazivu dugmeta); „Deset komentara"
 * nema bedž, pa ostaje ikonica sa `title` i `aria-label`.
 */
export function CommunityBadgeRow({
  locale,
  badges,
  className,
}: {
  locale: Locale;
  badges: CommunityBadgeKey[];
  className?: string;
}) {
  if (!badges.length) return null;
  const t = communityGamificationContent[locale];
  const tenComments = `${t.tenComments.title} — ${t.tenComments.body}`;

  return (
    <span role="group" aria-label={t.badgesLabel} className={cn("inline-flex items-center gap-1", className)}>
      {badges.map((badge) => {
        const sticker = COMMUNITY_BADGE_STICKER[badge];
        if (sticker) return <BadgeSticker key={badge} badge={sticker} state="unlocked" size="sm" locale={locale} />;
        return (
          <span
            key={badge}
            title={tenComments}
            aria-label={tenComments}
            role="img"
            className="grid size-8 shrink-0 place-items-center rounded-full bg-igra-track text-ink"
          >
            <MessagesSquare className="size-4" aria-hidden="true" />
          </span>
        );
      })}
    </span>
  );
}

"use client";

import { BadgeCheck, Flame, MessagesSquare, PenLine, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/components/ui/primitives";
import {
  levelAccentVar,
  levelProgress,
  type CommunityBadgeKey,
} from "@/lib/community-gamification";
import { communityGamificationContent, type Locale } from "@/lib/i18n";

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia(REDUCED_MOTION).matches;
}

/**
 * Tanka traka napretka do sledećeg nivoa. Boju nosi akcent nivoa (token
 * `--level-accent-*`), a brojevi ostaju u mastilu/muted — akcent nikad ne nosi
 * kontrast teksta. `compact` je varijanta uz avatar u listi članova: kolona je široka
 * koliko i avatar, pa se natpis tu ne lomi nego živi u `title` i `aria-label`.
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
  const t = communityGamificationContent[locale];
  const { level, percent, xpToNext } = levelProgress(xp);
  const nextLevel = level + 1;
  const caption = `${t.levelLabel(level)} · ${t.toNextLevel(xpToNext, nextLevel)}`;

  return (
    <div className={cn("min-w-0", className)} title={compact ? caption : undefined}>
      {compact ? null : (
        <p className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 type-caption font-black text-ink">
          <span>{t.levelLabel(level)}</span>
          <span className="font-bold text-muted">{t.toNextLevel(xpToNext, nextLevel)}</span>
        </p>
      )}
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label={compact ? caption : t.meterLabel(nextLevel)}
        className={cn("w-full overflow-hidden rounded-full bg-line", compact ? "h-1" : "mt-1 h-1.5")}
      >
        <span
          className="block h-full rounded-full"
          style={{ width: `${percent}%`, backgroundColor: levelAccentVar(level) }}
        />
      </div>
    </div>
  );
}

const BADGE_ICON: Record<CommunityBadgeKey, typeof Sparkles> = {
  first_thread: PenLine,
  ten_comments: MessagesSquare,
  first_helpful: BadgeCheck,
  week_streak: Flame,
};

/** Svaka značka nosi jedan ton iz istog seta akcenata kao nivoi. */
const BADGE_ACCENT: Record<CommunityBadgeKey, string> = {
  first_thread: "var(--level-accent-1)",
  ten_comments: "var(--level-accent-2)",
  first_helpful: "var(--level-accent-3)",
  week_streak: "var(--level-accent-4)",
};

/**
 * Sitne okrugle oznake pored imena. Akcent je SAMO tinta podloge (`color-mix` sa
 * papirom), ikonica ostaje mastilo — pa kontrast ne zavisi od akcenta ni u jednoj
 * temi. Tooltip je `title`, a isti tekst ide i u `aria-label` (title sam po sebi
 * nije pouzdan za čitače ekrana).
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

  return (
    <span className={cn("inline-flex items-center gap-1", className)} aria-label={t.badgesLabel}>
      {badges.map((badge) => {
        const Icon = BADGE_ICON[badge];
        const copy = t.badges[badge];
        const label = `${copy.title} — ${copy.body}`;
        return (
          <span
            key={badge}
            title={label}
            aria-label={label}
            role="img"
            className="grid size-5 shrink-0 place-items-center rounded-full border border-line text-ink"
            style={{ backgroundColor: `color-mix(in srgb, ${BADGE_ACCENT[badge]} 30%, var(--paper-strong))` }}
          >
            <Icon className="size-3" aria-hidden="true" />
          </span>
        );
      })}
    </span>
  );
}

/**
 * Brojač glasova koji se PREBROJI NAGORE kad vrednost poraste, uz jednu iskru iznad
 * sebe. Radi samo kad je `celebrate` tačno (sadržaj je viewer-ov) — tuđi brojač se
 * menja bez ijedne animacije.
 *
 * Tri kapije, sve tri jeftine i sve tri obavezne:
 *   · prvi render nikad ne animira (referenca kreće od početne vrednosti),
 *   · `prefers-reduced-motion` daje trenutnu promenu i nijednu iskru,
 *   · van kadra se ne pokreće — jedan `getBoundingClientRect` u trenutku promene,
 *     bez ijednog `IntersectionObserver`-a po redu liste (feed diskusija ne sme da
 *     nosi observer po kartici).
 */
export function VoteScore({
  value,
  celebrate,
  locale,
  className,
  children,
}: {
  value: number;
  celebrate: boolean;
  locale: Locale;
  className?: string;
  children?: ReactNode;
}) {
  const t = communityGamificationContent[locale];
  const [display, setDisplay] = useState(value);
  const [sparkKey, setSparkKey] = useState(0);
  const previous = useRef(value);
  const hostRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const from = previous.current;
    previous.current = value;
    if (from === value) return;

    const host = hostRef.current;
    const inView = host
      ? (() => {
          const rect = host.getBoundingClientRect();
          return rect.bottom > 0 && rect.top < window.innerHeight;
        })()
      : false;

    if (!celebrate || value < from || !inView || prefersReducedMotion()) {
      setDisplay(value);
      return;
    }

    setSparkKey((key) => key + 1);
    const start = performance.now();
    let frame = window.requestAnimationFrame(function step(now) {
      const progress = Math.min(1, (now - start) / 400);
      setDisplay(Math.round(from + (value - from) * progress));
      if (progress < 1) frame = window.requestAnimationFrame(step);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [celebrate, value]);

  return (
    <span ref={hostRef} className={cn("relative tabular-nums", className)}>
      {display}
      {children}
      {sparkKey > 0 ? (
        // Iskra se SKIDA čim animacija prođe — inače bi nevidljiv (opacity 0) element
        // sa imenom zauvek ostao u stablu pristupačnosti.
        <Sparkles
          key={sparkKey}
          aria-label={t.upvoteSpark}
          onAnimationEnd={() => setSparkKey(0)}
          className="community-spark pointer-events-none absolute -top-1 left-1/2 size-4 fill-yellow text-ink opacity-0"
        />
      ) : null}
    </span>
  );
}

/**
 * Ulaz redova rang liste sa razmakom od 30 ms. Klasa se dodaje TEK kad sekcija uđe
 * u kadar (jedan observer po LISTI, ne po redu), pa se van ekrana ne animira ništa;
 * pod `prefers-reduced-motion` CSS pravilo ne postoji, pa redovi odmah stoje.
 */
export function useEnterOnView<T extends HTMLElement>() {
  // Ime NIJE `ref`: React compiler lint pravilo (`Cannot access refs during render`)
  // gleda ime pristupa, pa bi `state.ref` u JSX-u pao iako je to samo prosleđivanje.
  const containerRef = useRef<T>(null);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    const node = containerRef.current;
    if (!node || entered) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          setEntered(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [entered]);

  return { containerRef, entered };
}

"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { AnimatePresence, motion, MotionConfig, type Variants } from "motion/react";
import type { ReactNode } from "react";

import { cn } from "@/components/ui/primitives";
import { type Locale } from "@/lib/i18n";
import {
  sectionsFor,
  type SidebarBadgeKey,
  type SidebarContext,
  type SidebarHrefParams,
} from "@/lib/sidebar-contexts";
import { studioMotionTokens } from "@/lib/studio-motion";

/**
 * Sadržaj sidebara po kontekstu i USMEREN prelaz izmedju home (classic) i aktivnog konteksta.
 *
 * Vozi ga registry (`resolveSidebarContext` u `app-sidebar.tsx`), ne boolean: kontrola za
 * skupljanje je iznad regiona zamene i ne pomera se, a menja se samo sadržaj ispod nje -
 * „isti sidebar, drugi sadržaj". `leading` (opciono) renderuje ne-sekcijski widget IZNAD liste
 * (classroom: LearningSwitcher); studio dodaje `FiltersDivider` ispod liste.
 *
 * Koreografija (rečnik pokreta — prelaz + element stagger):
 * - USMEREN, ne simetričan: ulaz u kontekst -> sadržaj konteksta ulazi s DESNA, home
 *   izlazi ULEVO; „Nazad" -> obrnuto (iOS navigation-stack model, kontekst je
 *   „desno od" aplikacije, `Nazad` je korak unazad).
 * - Visina se NE animira: `AnimatePresence mode="popLayout"` izbacuje sloj koji
 *   izlazi iz toka (apsolutan), pa razliku u visini apsorbuje dno, bez reflow-a.
 * - Stavke ulaze staggered (~25 ms, odozgo nadole), najviše 5-6.
 * - Rečnik pokreta: ulaz 260 ms, izlaz 200 ms (izlaz brži od ulaza), MD3 easing.
 * - `prefers-reduced-motion`: bez klizanja i stagger-a, trenutna zamena; oslonac
 *   je dugme „Nazad" koje se pojavi, ne pokret.
 */

const OFFSET = 24;
const ENTER = {
  duration: studioMotionTokens.prelaz.enterDuration,
  ease: studioMotionTokens.prelaz.easeEnter,
};
const EXIT = {
  duration: studioMotionTokens.prelaz.exitDuration,
  ease: studioMotionTokens.prelaz.easeExit,
};

const LIST: Variants = {
  show: {
    transition: {
      staggerChildren: studioMotionTokens.element.stagger,
      delayChildren: 0.04,
    },
  },
};
const ITEM: Variants = {
  hidden: { opacity: 0, y: 6 },
  show: {
    opacity: 1,
    y: 0,
    transition: {
      duration: studioMotionTokens.element.enterDuration,
      ease: studioMotionTokens.element.easeEnter,
    },
  },
};

/**
 * Region fiksne pozicije u kojem se dva sadržaja smenjuju. `compact` (rail, 80px)
 * gasi horizontalno klizanje - na toj širini bi klizanje seklo ikone, pa je to
 * čist opacity crossfade; značenje na rail-u nosi „Nazad" ikona koja se pojavi.
 */
export function SidebarNavSwap({
  active,
  reduce,
  classic,
  studio,
  compact = false,
  className,
}: {
  active: boolean;
  reduce: boolean;
  classic: ReactNode;
  studio: ReactNode;
  compact?: boolean;
  className?: string;
}) {
  const offset = compact ? 0 : OFFSET;

  // `MotionConfig reducedMotion="user"` gasi transform-animacije SVE dece
  // sidebara odjednom kad korisnik traži manje pokreta - ne samo swap (koji
  // dodatno gasi `reduce` fast-path ispod, radi trenutne zamene bez fade-a),
  // nego i ulaz stavki, `whileHover` i `whileTap` u `StudioSidebarNav`/`Rail`,
  // koji su ranije animirali i pod `prefers-reduced-motion` (nalaz iz izveštaja,
  // sekcija 4).
  return (
    <MotionConfig reducedMotion="user">
      {reduce ? (
        // Trenutna zamena, bez klizanja/fade-a swap-a.
        <div className={cn("relative", className)}>{active ? studio : classic}</div>
      ) : (
        <div className={cn("relative", className)}>
          <AnimatePresence initial={false} mode="popLayout">
            {active ? (
              <motion.div
                key="studio"
                initial={{ x: offset, opacity: 0 }}
                animate={{ x: 0, opacity: 1, transition: ENTER }}
                exit={{ x: offset, opacity: 0, transition: EXIT }}
              >
                {studio}
              </motion.div>
            ) : (
              <motion.div
                key="classic"
                initial={{ x: -offset, opacity: 0 }}
                animate={{ x: 0, opacity: 1, transition: ENTER }}
                exit={{ x: -offset, opacity: 0, transition: EXIT }}
              >
                {classic}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </MotionConfig>
  );
}

const ROW_BASE =
  "inline-flex min-h-11 w-full min-w-0 items-center gap-3 rounded-full border-2 px-3 py-2 text-sm font-extrabold text-ink transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";
const ROW_ACTIVE = "border-ink bg-yellow shadow-[3px_3px_0_0_var(--shadow-hard-14)]";
const ROW_IDLE = "border-transparent bg-transparent hover:border-ink hover:bg-yellow/25";
// „Nazad" je akcija (izlaz iz alata), ne odredište - zato okvir + senka i strelica.
const BACK_ROW =
  "inline-flex min-h-11 w-full min-w-0 items-center gap-3 rounded-full border-2 border-ink bg-paper-strong px-3 py-2 text-sm font-extrabold text-ink shadow-[3px_3px_0_0_var(--shadow-hard-14)] transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

function Item({ reduce, children }: { reduce: boolean; children: ReactNode }) {
  if (reduce) return <div className="min-w-0">{children}</div>;
  return (
    <motion.div variants={ITEM} whileHover={{ x: 2 }} whileTap={{ scale: 0.98 }} className="min-w-0">
      {children}
    </motion.div>
  );
}

/**
 * Prošireni sadržaj konteksta: „Nazad" + sekcije konteksta (`context.sections`). Studio
 * dodatno dobija `FiltersDivider` (studio-specifičan, uslovan na `context.id === "studio"`),
 * pa zajednica/admin ne dobijaju studijske filtere. Sekcije su i dalje deklarisane u
 * `lib/studio-sections.ts` / `lib/community-sections.ts`; registry ih samo adaptira.
 */
export function ContextSidebarNav({
  context,
  locale,
  activeId,
  onBack,
  reduce,
  isStaff = false,
  isAdmin = false,
  params = {},
  badges = {},
  leading,
}: {
  context: SidebarContext;
  locale: Locale;
  activeId: string | null;
  onBack: () => void;
  reduce: boolean;
  isStaff?: boolean;
  isAdmin?: boolean;
  params?: SidebarHrefParams;
  badges?: Partial<Record<SidebarBadgeKey, number>>;
  /** Non-section widget rendered above the list (classroom: LearningSwitcher). */
  leading?: ReactNode;
}) {
  const sections = sectionsFor(context, { isStaff, isAdmin, params });
  const navLabel = locale === "sr" ? context.labelSr : context.labelEn;
  const backLabel = locale === "sr" ? "Nazad" : "Back";
  const groupLabel = locale === "sr" ? context.groupLabelSr : context.groupLabelEn;

  const rows = (
    <>
      <Item reduce={reduce}>
        <button type="button" onClick={onBack} className={BACK_ROW}>
          <ChevronLeft className="size-4 shrink-0" />
          <span className="truncate">{backLabel}</span>
        </button>
      </Item>
      {leading ? <Item reduce={reduce}>{leading}</Item> : null}
      {groupLabel ? (
        <p className="px-3 pb-1 pt-3 text-[11px] font-black uppercase tracking-[0.04em] text-muted">
          {groupLabel}
        </p>
      ) : null}
      {sections.map((section) => {
        const Icon = section.icon;
        const active = section.id === activeId;
        const label = section.dynamicLabel
          ? section.dynamicLabel(params, locale)
          : locale === "sr"
            ? section.labelSr
            : section.labelEn;
        const badge = section.badgeKey ? badges[section.badgeKey] ?? 0 : 0;
        return (
          <Item key={section.id} reduce={reduce}>
            <Link
              href={section.href(locale, params)}
              aria-current={active ? "page" : undefined}
              className={cn(ROW_BASE, active ? ROW_ACTIVE : ROW_IDLE)}
            >
              <Icon className="size-4 shrink-0" />
              <span className="truncate">{label}</span>
              {badge > 0 ? (
                <span className="ml-auto flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full border border-ink bg-red-600 px-1 text-[10px] font-black text-white">
                  {badge > 99 ? "99+" : badge}
                </span>
              ) : null}
            </Link>
          </Item>
        );
      })}
    </>
  );

  if (reduce) {
    return (
      <nav aria-label={navLabel} className="mt-5 flex flex-col gap-2">
        {rows}
      </nav>
    );
  }

  return (
    <nav aria-label={navLabel} className="mt-5">
      <motion.div initial="hidden" animate="show" variants={LIST} className="flex flex-col gap-2">
        {rows}
      </motion.div>
    </nav>
  );
}

// Rail (skupljeno): ikona + tooltip s desne strane, isti oblik kao `RailAction`.
const RAIL_BASE =
  "group relative flex size-12 items-center justify-center rounded-full border-2 text-ink transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";
const RAIL_ACTIVE = "border-ink bg-yellow shadow-[3px_3px_0_var(--shadow-hard-16)]";
const RAIL_IDLE = "border-transparent bg-paper-strong hover:border-ink hover:bg-yellow/25";
const RAIL_TOOLTIP =
  "pointer-events-none absolute left-[calc(100%+12px)] z-[80] whitespace-nowrap rounded-full border-2 border-ink bg-paper-strong px-3 py-1.5 text-xs font-black text-ink opacity-0 shadow-[4px_4px_0_var(--shadow-hard-14)] transition group-hover:opacity-100 group-focus-visible:opacity-100";

function RailTooltip({ label }: { label: string }) {
  return (
    <span role="tooltip" className={RAIL_TOOLTIP}>
      {label}
    </span>
  );
}

/** Skupljeni rail konteksta: „Nazad" + ikone sekcija sa tooltipom. */
export function ContextSidebarRail({
  context,
  locale,
  activeId,
  onBack,
  isStaff = false,
  isAdmin = false,
  params = {},
  badges = {},
  leading,
}: {
  context: SidebarContext;
  locale: Locale;
  activeId: string | null;
  onBack: () => void;
  isStaff?: boolean;
  isAdmin?: boolean;
  params?: SidebarHrefParams;
  badges?: Partial<Record<SidebarBadgeKey, number>>;
  /** Non-section rail control rendered above the icons (classroom: LearningSwitcher flyout). */
  leading?: ReactNode;
}) {
  const sections = sectionsFor(context, { isStaff, isAdmin, params });
  const navLabel = locale === "sr" ? context.labelSr : context.labelEn;
  const backLabel = locale === "sr" ? "Nazad" : "Back";

  return (
    <nav aria-label={navLabel} className="flex flex-col items-center gap-2">
      <button type="button" aria-label={backLabel} onClick={onBack} className={cn(RAIL_BASE, RAIL_IDLE)}>
        <ChevronLeft className="size-5" />
        <RailTooltip label={backLabel} />
      </button>
      {leading}
      {sections.map((section) => {
        const Icon = section.icon;
        const active = section.id === activeId;
        const label = section.dynamicLabel
          ? section.dynamicLabel(params, locale)
          : locale === "sr"
            ? section.labelSr
            : section.labelEn;
        const badge = section.badgeKey ? badges[section.badgeKey] ?? 0 : 0;
        return (
          <Link
            key={section.id}
            href={section.href(locale, params)}
            aria-label={label}
            aria-current={active ? "page" : undefined}
            className={cn(RAIL_BASE, active ? RAIL_ACTIVE : RAIL_IDLE)}
          >
            {active ? (
              <span aria-hidden="true" className="absolute -left-[15px] h-7 w-1.5 rounded-full bg-yellow ring-2 ring-ink" />
            ) : null}
            <Icon className="size-5" />
            {badge > 0 ? (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-ink bg-red-600 px-1 text-[9px] font-black text-white">
                {badge > 99 ? "99+" : badge}
              </span>
            ) : null}
            <RailTooltip label={label} />
          </Link>
        );
      })}
    </nav>
  );
}

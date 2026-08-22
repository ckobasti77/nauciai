"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { AnimatePresence, motion, MotionConfig, type Variants } from "motion/react";
import type { ReactNode } from "react";

import { cn } from "@/components/ui/primitives";
import { withLocale, type Locale } from "@/lib/i18n";
import { studioMotionTokens } from "@/lib/studio-motion";
import { studioSectionLabel, studioSectionsFor, type StudioSection } from "@/lib/studio-sections";

/**
 * Studijski sadržaj sidebara i USMEREN prelaz izmedju klasičnog i studijskog.
 *
 * Aditivno uz `app-sidebar.tsx` (koji ostaje netaknut osim što ovo umeće iza
 * `studioActive`): kontrola za skupljanje je iznad regiona zamene i ne pomera se,
 * a menja se samo sadržaj ispod nje - „isti sidebar, drugi sadržaj".
 *
 * Koreografija (rečnik pokreta — prelaz + element stagger):
 * - USMEREN, ne simetričan: ulaz u Studio -> studijsko ulazi s DESNA, klasično
 *   izlazi ULEVO; „Nazad" -> obrnuto (iOS navigation-stack model, Studio je
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

function sectionHref(locale: Locale, section: StudioSection): string {
  const base = withLocale(locale, "/app/studio");
  return section.kind ? `${base}?kind=${section.kind}` : base;
}

function Item({ reduce, children }: { reduce: boolean; children: ReactNode }) {
  if (reduce) return <div className="min-w-0">{children}</div>;
  return (
    <motion.div variants={ITEM} whileHover={{ x: 2 }} whileTap={{ scale: 0.98 }} className="min-w-0">
      {children}
    </motion.div>
  );
}

/** Prošireni studijski sadržaj: „Nazad" + taksonomija biblioteke (vrste medija). */
export function StudioSidebarNav({
  locale,
  activeId,
  onBack,
  reduce,
  isStaff = false,
}: {
  locale: Locale;
  activeId: string;
  onBack: () => void;
  reduce: boolean;
  isStaff?: boolean;
}) {
  const sections = studioSectionsFor(isStaff);
  const navLabel = locale === "sr" ? "Studijska biblioteka" : "Studio library";
  const backLabel = locale === "sr" ? "Nazad" : "Back";
  const libraryLabel = locale === "sr" ? "Biblioteka" : "Library";

  const rows = (
    <>
      <Item reduce={reduce}>
        <button type="button" onClick={onBack} className={BACK_ROW}>
          <ChevronLeft className="size-4 shrink-0" />
          <span className="truncate">{backLabel}</span>
        </button>
      </Item>
      <p className="px-3 pb-1 pt-3 text-[11px] font-black uppercase tracking-[0.04em] text-muted">
        {libraryLabel}
      </p>
      {sections.map((section) => {
        const Icon = section.icon;
        const active = section.id === activeId;
        return (
          <Item key={section.id} reduce={reduce}>
            <Link
              href={sectionHref(locale, section)}
              aria-current={active ? "page" : undefined}
              className={cn(ROW_BASE, active ? ROW_ACTIVE : ROW_IDLE)}
            >
              <Icon className="size-4 shrink-0" />
              <span className="truncate">{studioSectionLabel(section, locale)}</span>
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

/** Skupljeni studijski rail: „Nazad" + ikone vrsta medija sa tooltipom. */
export function StudioSidebarRail({
  locale,
  activeId,
  onBack,
  isStaff = false,
}: {
  locale: Locale;
  activeId: string;
  onBack: () => void;
  isStaff?: boolean;
}) {
  const sections = studioSectionsFor(isStaff);
  const navLabel = locale === "sr" ? "Studijska biblioteka" : "Studio library";
  const backLabel = locale === "sr" ? "Nazad" : "Back";

  return (
    <nav aria-label={navLabel} className="flex flex-col items-center gap-2">
      <button type="button" aria-label={backLabel} onClick={onBack} className={cn(RAIL_BASE, RAIL_IDLE)}>
        <ChevronLeft className="size-5" />
        <RailTooltip label={backLabel} />
      </button>
      {sections.map((section) => {
        const Icon = section.icon;
        const active = section.id === activeId;
        const label = studioSectionLabel(section, locale);
        return (
          <Link
            key={section.id}
            href={sectionHref(locale, section)}
            aria-label={label}
            aria-current={active ? "page" : undefined}
            className={cn(RAIL_BASE, active ? RAIL_ACTIVE : RAIL_IDLE)}
          >
            {active ? (
              <span aria-hidden="true" className="absolute -left-[15px] h-7 w-1.5 rounded-full bg-yellow ring-2 ring-ink" />
            ) : null}
            <Icon className="size-5" />
            <RailTooltip label={label} />
          </Link>
        );
      })}
    </nav>
  );
}

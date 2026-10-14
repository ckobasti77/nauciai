import { Flame } from "lucide-react";

import { IgraSkeleton, type Loadable } from "@/components/igra/igra-skeleton";
import { LevelRing } from "@/components/igra/level-ring";
import { cn } from "@/components/ui/primitives";
import { IGRA_SHELL_COPY } from "@/lib/igra-copy";
import { shellProgressView, type ShellProgressInput, type ShellProgressView } from "@/lib/igra-shell";
import type { Locale } from "@/lib/i18n";

/**
 * Napredak u ljusci aplikacije (K06, plan K01 §6.1): red u sidebaru, krug u rail-u i čip
 * u mobilnom zaglavlju. Sva tri su JEDNO dugme koje otvara panel „Moj napredak" i ne
 * učitavaju nijednu sliku - pečat nivoa je crtan u kodu, plamen je ikonica. Dok upit ne
 * stigne stoji skelet iste veličine, pa se ništa ne pomera kad stigne.
 */

type Props = Loadable<{ progress: ShellProgressInput }> & { locale: Locale; onOpen: () => void; className?: string };

const FOCUS = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";
/** Ista kolona ikonice i ista kolona teksta kao redovi navigacije (`SIDEBAR_ROW_*`). */
const ICON_COL = "grid w-[var(--sidebar-icon-col)] shrink-0 place-items-center";
const LABEL_COL = "app-sidebar-label block min-w-0 flex-1 pl-1 pr-3 md:w-[var(--sidebar-label-w)] md:flex-none";

const SEAL = {
  sm: { box: "size-7", ring: 28, stroke: 2.5, disc: "size-5 text-[10px]" },
  md: { box: "size-10", ring: 40, stroke: 3.5, disc: "size-7 text-xs" },
} as const;

/** Pečat nivoa crtan u kodu: broj u krugu mastila, oko njega prsten napretka kroz nivo. */
export function LevelSeal({ level, progress, size = "md" }: { level: number; progress: number; size?: keyof typeof SEAL }) {
  const dims = SEAL[size];
  return (
    <span aria-hidden="true" className={cn("relative grid shrink-0 place-items-center", dims.box)}>
      <LevelRing progress={progress} size={dims.ring} stroke={dims.stroke} />
      <span className={cn("grid place-items-center rounded-full bg-paper-strong font-black tabular-nums leading-none text-ink shadow-[inset_0_0_0_2px_var(--ink)]", dims.disc)}>
        {level}
      </span>
    </span>
  );
}

const STREAK_TEXT = "text-xs font-black tabular-nums leading-none";

function streakTone(view: Pick<ShellProgressView, "streakBurning">) {
  return view.streakBurning ? "text-ink" : "text-muted";
}

/** Plamen: gori (žuta ispuna) kad je danas upisano, inače tinja. */
function StreakIcon({ view }: { view: Pick<ShellProgressView, "streakBurning"> }) {
  return <Flame className={cn("size-3.5", view.streakBurning && "fill-igra-marker")} />;
}

/** Plamen sa brojem dana. */
export function ShellStreak({ view, className }: { view: Pick<ShellProgressView, "streakCount" | "streakBurning">; className?: string }) {
  return (
    <span aria-hidden="true" className={cn("inline-flex shrink-0 items-center gap-0.5", STREAK_TEXT, streakTone(view), className)}>
      <StreakIcon view={view} />
      {view.streakCount}
    </span>
  );
}

/** Red u proširenom sidebaru i u fioci na telefonu: pečat, ime nivoa, plamen, XP traka. Visina 48 px. */
export function ShellProgressRow(props: Props) {
  const { locale, onOpen, className } = props;
  const box = "flex h-12 w-full items-center";

  if (props.loading) {
    return (
      <div aria-busy="true" className={cn(box, className)}>
        <span className={ICON_COL}>
          <IgraSkeleton className="size-10 rounded-full" />
        </span>
        <span className={cn(LABEL_COL, "grid gap-2.5")}>
          <IgraSkeleton className="h-3 w-20 rounded-full" />
          <IgraSkeleton className="h-1.5 rounded-full" />
        </span>
      </div>
    );
  }

  const view = shellProgressView(props.progress, locale);
  return (
    <button type="button" onClick={onOpen} aria-haspopup="dialog" aria-label={view.label} className={cn(box, "rounded-full text-left transition-colors hover:bg-yellow/15", FOCUS, className)}>
      <span className={ICON_COL}>
        <LevelSeal level={view.level} progress={view.progress} />
      </span>
      <span className={LABEL_COL}>
        <span className="flex items-center justify-between gap-2">
          <span className="truncate text-xs font-black leading-tight text-ink">{view.levelName}</span>
          <ShellStreak view={view} />
        </span>
        <span className="mt-1.5 flex items-center gap-2">
          <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-igra-track">
            <span className="block h-full origin-left bg-igra-marker transition-transform duration-700 ease-out motion-reduce:transition-none" style={{ transform: `scaleX(${view.progress})` }} />
          </span>
          <span className="shrink-0 text-[10px] font-bold tabular-nums leading-none text-muted">{view.xpText}</span>
        </span>
      </span>
    </button>
  );
}

/** Isti pečat kao krug `size-12` u skupljenom sidebaru, na istom mestu kao red iznad. */
export function ShellProgressRail(props: Props) {
  const { locale, onOpen, className } = props;

  if (props.loading) {
    return (
      <span aria-busy="true" className={cn("grid size-12 place-items-center", className)}>
        <IgraSkeleton className="size-10 rounded-full" />
      </span>
    );
  }

  const view = shellProgressView(props.progress, locale);
  return (
    <button type="button" onClick={onOpen} aria-haspopup="dialog" aria-label={view.label} className={cn("group relative grid size-12 place-items-center rounded-full transition-colors hover:bg-yellow/15", FOCUS, className)}>
      <LevelSeal level={view.level} progress={view.progress} />
      <span
        role="tooltip"
        className="pointer-events-none absolute left-[calc(100%+12px)] z-[80] whitespace-nowrap rounded-full border-2 border-ink bg-paper-strong px-3 py-1.5 text-xs font-black text-ink opacity-0 shadow-[4px_4px_0_var(--shadow-hard-14)] transition group-hover:opacity-100 group-focus-visible:opacity-100"
      >
        {IGRA_SHELL_COPY.panelTitle[locale]}
      </span>
    </button>
  );
}

/**
 * Čip u mobilnom zaglavlju: pečat nivoa, a uz njega plamen i broj dana KAD IMA MESTA.
 * Zaglavlje već nosi logo, kredite i „Više", pa širina zavisi i od broja cifara kredita.
 * Zato se čip sam skuplja (jedini u redu sme): red se prelama, a ono što pređe u drugi
 * red odseca fiksna visina - broj nestaje prvi, pa plamen, pečat ostaje uvek. Sve je i
 * dalje u nazivu dugmeta, u fioci i u panelu. Meta dodira je 44 px (`px-2` preko razmaka
 * u redu, `-mx-2` da raspored računa samo sadržaj). Ispod 375 px čipa nema: tu ni sam
 * pečat ne staje pored logotipa, pa napredak ostaje u fioci.
 */
export function ShellProgressChip(props: Props) {
  const { locale, onOpen, className } = props;
  const box = "-mx-2 flex h-11 min-w-11 shrink flex-wrap content-start justify-end gap-x-0.5 overflow-hidden px-2 max-[374px]:hidden";
  const cell = "flex h-11 shrink-0 items-center";

  if (props.loading) {
    return (
      <span aria-busy="true" className={cn(box, className)}>
        <span className={cell}>
          <IgraSkeleton className="size-7 rounded-full" />
        </span>
      </span>
    );
  }

  const view = shellProgressView(props.progress, locale);
  return (
    <button type="button" onClick={onOpen} aria-haspopup="dialog" aria-label={view.label} className={cn(box, "rounded-full transition-colors active:bg-yellow/15", FOCUS, className)}>
      <span className={cell}>
        <LevelSeal level={view.level} progress={view.progress} size="sm" />
      </span>
      <span aria-hidden="true" className={cn(cell, streakTone(view))}>
        <StreakIcon view={view} />
      </span>
      <span aria-hidden="true" className={cn(cell, STREAK_TEXT, streakTone(view))}>
        {view.streakCount}
      </span>
    </button>
  );
}

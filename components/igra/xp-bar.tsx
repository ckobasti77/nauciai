"use client";

import { useRef } from "react";

import { IgraSkeleton, type Loadable } from "@/components/igra/igra-skeleton";
import { useMarkerFill } from "@/components/igra/motion/use-marker-fill";
import { cn } from "@/components/ui/primitives";
import { xpBarA11y, xpBarCaption, xpBarFraction } from "@/lib/igra-a11y";
import { levelFromXp } from "@/lib/igra-level";
import type { Locale } from "@/lib/i18n";

const TRACK = { sm: "h-2", md: "h-3", lg: "h-4" } as const;
const FILL = "block h-full origin-left bg-igra-marker";

/** Ispuna koju marker „razlije" do vrednosti; uz smanjen pokret odmah stoji na njoj. */
function MarkerFill({ progress }: { progress: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useMarkerFill(ref, progress);
  // Prazna do prvog frejma animacije, da puna traka ne blesne pre nego što krene.
  return <span ref={ref} className={FILL} style={{ transform: "scaleX(0)" }} />;
}

/**
 * XP traka (K05): žuti marker kroz tekući nivo, a iznad „još N XP do nivoa X". Nivo i
 * procenat računa `levelFromXp`; na poslednjem nivou traka je puna. `sm` je bez natpisa
 * (ljuska, kompaktna kartica) - vrednost i tada čuje čitač ekrana.
 */
export function XpBar(
  props: Loadable<{ xp: number }> & {
    locale: Locale;
    size?: keyof typeof TRACK;
    /** Natpis iznad trake; podrazumevano ga `sm` nema. */
    showLabel?: boolean;
    /** `false` = ispuna odmah na vrednosti (liste, gusti ekrani). */
    animate?: boolean;
    className?: string;
  },
) {
  const { locale, size = "md", animate = true, className } = props;
  const showLabel = props.showLabel ?? size !== "sm";

  if (props.loading) {
    return (
      <div aria-busy="true" className={cn("w-full", className)}>
        {showLabel ? <IgraSkeleton className="mb-2 h-4 w-44 max-w-full rounded-full" /> : null}
        <IgraSkeleton className={cn("rounded-full", TRACK[size])} />
      </div>
    );
  }

  const { xp } = props;
  const { progress } = levelFromXp(xp);
  const fraction = xpBarFraction(xp, locale);

  return (
    <div className={cn("w-full", className)}>
      {showLabel ? (
        <p className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3 type-caption font-bold text-muted">
          <span>{xpBarCaption(xp, locale)}</span>
          {fraction ? <span className="tabular-nums">{fraction}</span> : null}
        </p>
      ) : null}
      <div {...xpBarA11y(xp, locale)} className={cn("overflow-hidden rounded-full bg-igra-track", TRACK[size])}>
        {animate ? <MarkerFill progress={progress} /> : <span className={FILL} style={{ transform: `scaleX(${progress})` }} />}
      </div>
    </div>
  );
}

"use client";

import { useRef } from "react";

import { IgraSkeleton, type Loadable } from "@/components/igra/igra-skeleton";
import { useCountUp } from "@/components/igra/motion/use-count-up";
import { cn } from "@/components/ui/primitives";
import { formatOdometer } from "@/lib/igra-motion";
import type { Locale } from "@/lib/i18n";

const SIZE = { hero: "type-hero", lg: "type-h1", md: "type-h3", sm: "type-body-sm" } as const;
/** Širina skeleta; visina je 1em u istom tipu kao broj, pa red ima istu visinu i pre podataka (K28). */
const SKELETON = { hero: "w-36", lg: "w-28", md: "w-20", sm: "w-14" } as const;

function Rolling({ value, locale }: { value: number; locale: Locale }) {
  const ref = useRef<HTMLSpanElement>(null);
  useCountUp(ref, value, { locale });
  return (
    <span ref={ref} className="inline-block tabular-nums">
      {formatOdometer(value, locale)}
    </span>
  );
}

/**
 * Odometar (K05): broj kao heroj, vrti se do vrednosti. Čitač ekrana dobija samo krajnju
 * vrednost; cifre u pokretu su skrivene. Uz smanjen pokret ili `animate={false}` broj
 * odmah stoji.
 */
export function Odometer(
  props: Loadable<{ value: number }> & {
    locale: Locale;
    size?: keyof typeof SIZE;
    animate?: boolean;
    /** Jedinica iza broja („XP"), manja i tiša od broja. */
    suffix?: string;
    className?: string;
  },
) {
  const { locale, size = "md", animate = true, suffix, className } = props;

  if (props.loading) {
    return (
      <span className={cn("inline-block", SIZE[size], className)}>
        <IgraSkeleton className={cn("inline-block h-[1em] rounded-full align-middle", SKELETON[size])} />
      </span>
    );
  }

  const text = formatOdometer(props.value, locale);
  return (
    <span className={cn("inline-block font-black text-ink", SIZE[size], className)}>
      <span className="sr-only">{suffix ? `${text} ${suffix}` : text}</span>
      <span aria-hidden="true">
        {animate ? <Rolling value={props.value} locale={locale} /> : <span className="tabular-nums">{text}</span>}
        {suffix ? <span className="ml-[0.3em] text-[0.5em] text-muted">{suffix}</span> : null}
      </span>
    </span>
  );
}

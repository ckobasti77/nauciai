"use client";

import { useRef } from "react";

import { IgraArt } from "@/components/igra/igra-art";
import { IgraSkeleton, type Loadable } from "@/components/igra/igra-skeleton";
import { useStampIn } from "@/components/igra/motion/use-stamp-in";
import { cn } from "@/components/ui/primitives";
import { clampLevel, formatLevel, levelLabel, levelName } from "@/lib/igra-a11y";
import { igraNivoArt } from "@/lib/igra-art";
import type { Locale } from "@/lib/i18n";

type Size = "xs" | "sm" | "md" | "lg";

const BOX: Record<Size, string> = { xs: "size-6", sm: "size-10", md: "size-16", lg: "size-24" };
/** Broj nivoa na amblemu; `xs` je premali za njega (broj je tada u nazivu). */
const NUMBER: Record<Size, string | null> = {
  xs: null,
  sm: "size-5 type-eyebrow-sm",
  md: "size-6 type-caption",
  lg: "size-8 type-body-sm",
};
const NAME: Record<Size, string> = {
  xs: "type-body-sm font-black",
  sm: "type-body-sm font-black",
  md: "font-display type-display-sm",
  lg: "font-display type-display-sm",
};

function Stamp({ level, size, playKey }: { level: number; size: Size; playKey: string | number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useStampIn(ref, { playKey });
  const number = NUMBER[size];

  return (
    <span ref={ref} className="group/stamp relative block shrink-0">
      <IgraArt id={igraNivoArt(level)} size={size} decorative />
      {number ? (
        // Samo preko slike: fallback amblema već nosi broj u krugu, pa se drugi ne crta.
        <span
          aria-hidden="true"
          className={cn("absolute -bottom-0.5 -right-0.5 hidden place-items-center rounded-full bg-ink font-black tabular-nums text-paper-strong group-has-[img]/stamp:grid", number)}
        >
          {level}
        </span>
      ) : null}
    </span>
  );
}

/**
 * Pečat nivoa (K05): amblem `nivo.NN` sa brojem. „Udari" (`useStampIn`) kad se `stampKey`
 * promeni - podrazumevano kad se promeni sam nivo; pri prvom prikazu miruje. Uz `showName`
 * pored stoji „Nivo 3 · Skicar"; bez toga isti naziv čuje čitač ekrana.
 */
export function LevelStamp(
  props: Loadable<{ level: number }> & {
    locale: Locale;
    size?: Size;
    showName?: boolean;
    /** Ključ koji okida pečat (npr. broj otvaranja panela); bez njega okida promena nivoa. */
    stampKey?: string | number;
    className?: string;
  },
) {
  const { locale, size = "md", showName = false, stampKey, className } = props;
  const gap = size === "lg" ? "gap-4" : size === "md" ? "gap-3" : "gap-2";

  if (props.loading) {
    return (
      <span aria-busy="true" className={cn("inline-flex items-center", gap, className)}>
        <IgraSkeleton className={cn("shrink-0 rounded-full", BOX[size])} />
        {showName ? (
          <span className="grid gap-1.5">
            <IgraSkeleton className="h-3 w-12 rounded-full" />
            <IgraSkeleton className="h-5 w-24 rounded-full" />
          </span>
        ) : null}
      </span>
    );
  }

  const level = clampLevel(props.level);
  const stamp = <Stamp level={level} size={size} playKey={stampKey ?? level} />;

  if (!showName) {
    return (
      <span role="img" aria-label={levelLabel(level, locale)} className={cn("inline-flex", className)}>
        {stamp}
      </span>
    );
  }
  return (
    <span className={cn("inline-flex items-center", gap, className)}>
      {stamp}
      <span className="min-w-0">
        <span className="block type-eyebrow text-muted">{formatLevel(level, locale)}</span>
        <span className={cn("block text-ink", NAME[size])}>{levelName(level, locale)}</span>
      </span>
    </span>
  );
}

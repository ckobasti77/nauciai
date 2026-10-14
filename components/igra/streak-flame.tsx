import { IgraArt } from "@/components/igra/igra-art";
import { IgraSkeleton, type Loadable } from "@/components/igra/igra-skeleton";
import { cn } from "@/components/ui/primitives";
import { streakFlameView } from "@/lib/igra-a11y";
import type { Locale } from "@/lib/i18n";

type Size = "sm" | "md" | "lg";

const ART = { sm: "xs", md: "sm", lg: "md" } as const;
const BOX: Record<Size, string> = { sm: "size-6", md: "size-10", lg: "size-16" };
const NUMBER: Record<Size, string> = { sm: "type-body-sm", md: "type-h2", lg: "type-hero" };

/**
 * Plamen niza (K05): `rang.plamen` + broj dana. Kad je danas već upisano plamen gori; kad
 * nije, tinja (prigušena boja) uz blag poziv - bez straha i bez odbrojavanja (O9). `lg`
 * ispisuje i poziv; manje veličine ga nose u nazivu za čitač ekrana.
 */
export function StreakFlame(
  props: Loadable<{ current: number; todayDone: boolean }> & {
    locale: Locale;
    size?: Size;
    className?: string;
  },
) {
  const { locale, size = "md", className } = props;
  const gap = size === "sm" ? "gap-1" : "gap-2.5";

  if (props.loading) {
    return (
      <span aria-busy="true" className={cn("inline-flex items-center", gap, className)}>
        <IgraSkeleton className={cn("shrink-0 rounded-full", BOX[size])} />
        <IgraSkeleton className={cn("rounded-full", size === "sm" ? "h-4 w-5" : size === "md" ? "h-6 w-14" : "h-9 w-24")} />
      </span>
    );
  }

  const view = streakFlameView(props.current, props.todayDone, locale);
  const flame = <IgraArt id="rang.plamen" size={ART[size]} decorative className={view.burning ? undefined : "opacity-60 saturate-[0.15]"} />;

  if (size === "lg") {
    return (
      <span className={cn("inline-flex items-center", gap, className)}>
        {flame}
        <span className="min-w-0">
          <span className="flex items-baseline gap-1.5">
            <span className={cn("font-black tabular-nums text-ink", NUMBER.lg)}>{view.count}</span>
            <span className="type-body-sm font-black text-muted">{view.unit}</span>
          </span>
          <span className="block type-caption font-semibold text-muted">{view.hint}</span>
        </span>
      </span>
    );
  }
  return (
    <span role="img" aria-label={view.label} className={cn("inline-flex items-center", gap, className)}>
      {flame}
      <span className={cn("font-black tabular-nums", NUMBER[size], view.burning ? "text-ink" : "text-muted")}>{view.count}</span>
      {size === "md" ? <span className="type-caption font-black text-muted">{view.unit}</span> : null}
    </span>
  );
}

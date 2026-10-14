import { IgraArt } from "@/components/igra/igra-art";
import { IgraSkeleton, type Loadable } from "@/components/igra/igra-skeleton";
import { cn } from "@/components/ui/primitives";
import { rankChipView, type RankMedal } from "@/lib/igra-a11y";
import type { IgraArtId } from "@/lib/igra-art";
import type { Locale } from "@/lib/i18n";

const MEDAL_ART = { zlato: "rang.zlato", srebro: "rang.srebro", bronza: "rang.bronza" } as const satisfies Record<RankMedal, IgraArtId>;

const SIZE = {
  sm: { chip: "min-h-6 gap-1 px-2 type-caption", medal: 16, skeleton: "h-6 w-11" },
  md: { chip: "min-h-8 gap-1.5 px-3 type-body-sm", medal: 22, skeleton: "h-8 w-14" },
} as const;

/**
 * Rang čip (K05): `#N`, sa medaljom za prva tri mesta. Žuto je samo prvo mesto; ko još
 * nije na listi dobija crtu, bez praznog mesta u redu.
 */
export function RankChip(
  props: Loadable<{ rank: number | null }> & {
    locale: Locale;
    size?: keyof typeof SIZE;
    className?: string;
  },
) {
  const { locale, size = "md", className } = props;
  const dims = SIZE[size];
  if (props.loading) return <IgraSkeleton className={cn("inline-block rounded-full align-middle", dims.skeleton, className)} />;

  const view = rankChipView(props.rank, locale);
  const first = view.medal === "zlato";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full align-middle font-black tabular-nums",
        dims.chip,
        first ? "bg-yellow text-ink" : view.ranked ? "bg-igra-track text-ink" : "bg-igra-track text-muted",
        className,
      )}
    >
      {view.medal ? <IgraArt id={MEDAL_ART[view.medal]} size={dims.medal} decorative /> : null}
      <span aria-hidden="true">{view.text}</span>
      <span className="sr-only">{view.label}</span>
    </span>
  );
}

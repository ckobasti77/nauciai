import { IgraArt } from "@/components/igra/igra-art";
import { cn } from "@/components/ui/primitives";
import { igraLikArt, type IgraArtSize, type IgraLik as IgraLikName, type IgraPoza } from "@/lib/igra-art";
import type { Locale } from "@/lib/i18n";

/**
 * Lik ekipe (K05): `<IgraLik lik="robi" poza="mase" />` preko `IgraArt`, sa opcionim
 * oblačićem. Oblačić je površina sa tankom linijom, ne drugi okvir, pa lik sme da stoji
 * i u kartici koja već ima svoj.
 */
export function IgraLik({
  lik,
  poza = "mase",
  size = "lg",
  bubble,
  className,
  decorative,
  locale,
}: {
  lik: IgraLikName;
  poza?: IgraPoza;
  size?: IgraArtSize;
  /** Kratka rečenica koju lik „kaže". */
  bubble?: string;
  className?: string;
} & ({ decorative: true; locale?: Locale } | { decorative?: false; locale: Locale })) {
  const id = igraLikArt(lik, poza);
  const art = decorative || !locale ? <IgraArt id={id} size={size} decorative /> : <IgraArt id={id} size={size} locale={locale} />;
  if (!bubble) return className ? <span className={cn("inline-block", className)}>{art}</span> : art;

  return (
    <span className={cn("inline-flex items-center gap-3", className)}>
      {art}
      <span className="surface-inset relative min-w-0 bg-paper px-3 py-2 type-body-sm font-bold text-ink shadow-[inset_0_0_0_1px_var(--shadow-hard-14)]">
        <span aria-hidden="true" className="absolute -left-1 top-1/2 size-2 -translate-y-1/2 rotate-45 bg-paper shadow-[inset_1px_-1px_0_0_var(--shadow-hard-14)]" />
        {bubble}
      </span>
    </span>
  );
}

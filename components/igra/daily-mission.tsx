import { ArrowRight } from "lucide-react";

import { IgraLik } from "@/components/igra/igra-lik";
import { IgraSkeleton, type Loadable } from "@/components/igra/igra-skeleton";
import { cn, LinkButton } from "@/components/ui/primitives";
import type { IgraLik as IgraLikName, IgraPoza } from "@/lib/igra-art";
import { IGRA_PRIMITIVE_COPY } from "@/lib/igra-copy";
import type { Locale } from "@/lib/i18n";

export type IgraMission = {
  title: string;
  body: string;
  /** Gotov URL (pozivalac ga provlači kroz `withLocale`). */
  href: string;
  cta: string;
  lik: IgraLikName;
  poza?: IgraPoza;
};

/**
 * Misija dana (K05): kartica „sledeći korak" - jedan predlog, jedan lik, jedno dugme. Ovo
 * je vodič, ne zadatak: nema nagrade, roka ni brojača. Bez misije (`null`) kartica mirno
 * kaže da je za danas sve na mestu. Naslov je `<p>`, jer kartica staje na razne dubine.
 */
export function DailyMission(
  props: Loadable<{ mission: IgraMission | null }> & {
    locale: Locale;
    className?: string;
  },
) {
  const { locale, className } = props;
  const copy = IGRA_PRIMITIVE_COPY;
  const mission = props.loading ? null : props.mission;

  return (
    <article
      aria-busy={props.loading || undefined}
      className={cn("surface-card relative border-2 border-ink bg-paper-strong p-5 shadow-[6px_6px_0_0_var(--shadow-hard-13)] sm:p-6", className)}
    >
      <span aria-hidden="true" className="igra-tape -top-2.5 left-8" />
      <div className="flex items-start gap-4 sm:gap-6">
        {props.loading ? (
          <div className="min-w-0 flex-1">
            <span role="status" className="sr-only">
              {copy.loading[locale]}
            </span>
            <IgraSkeleton className="h-3 w-24 rounded-full" />
            <IgraSkeleton className="mt-3 h-6 w-3/4 rounded-full" />
            <IgraSkeleton className="mt-3 h-4 w-full rounded-full" />
            <IgraSkeleton className="mt-5 h-11 w-40 rounded-full" />
          </div>
        ) : (
          <div className="min-w-0 flex-1">
            <p className="type-eyebrow text-muted">{copy.missionEyebrow[locale]}</p>
            <p className="mt-1.5 type-h2 text-ink">{mission ? mission.title : copy.missionEmptyTitle[locale]}</p>
            <p className="mt-2 type-body-sm font-semibold text-muted">{mission ? mission.body : copy.missionEmptyBody[locale]}</p>
            {mission ? (
              <LinkButton href={mission.href} tone="yellow" className="mt-4">
                {mission.cta}
                <ArrowRight aria-hidden="true" className="size-4" />
              </LinkButton>
            ) : null}
          </div>
        )}
        <div className="w-16 shrink-0 sm:w-24">
          {props.loading ? (
            <IgraSkeleton className="aspect-square rounded-full" />
          ) : (
            <IgraLik lik={mission?.lik ?? "robi"} poza={mission ? (mission.poza ?? "misli") : "slavi"} size="hero" decorative />
          )}
        </div>
      </div>
    </article>
  );
}

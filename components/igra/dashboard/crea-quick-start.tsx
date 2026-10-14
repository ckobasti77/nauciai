import { IgraLik } from "@/components/igra/igra-lik";
import { PeelLink } from "@/components/igra/peel-link";
import { cn } from "@/components/ui/primitives";
import type { IgraLik as IgraLikName } from "@/lib/igra-art";
import { IGRA_DASHBOARD_COPY } from "@/lib/igra-copy";
import { CREA_AREA_LIK } from "@/lib/igra-crea";
import { withLocale, type Locale, type LocalizedText } from "@/lib/i18n";

/** Oblast Cree u adresi (`?oblast=`), isto kao u sidebaru (`lib/sidebar-contexts.ts`). */
const AREAS: ReadonlyArray<{ area: string; lik: IgraLikName; label: LocalizedText }> = [
  { area: "slika", lik: CREA_AREA_LIK.slika, label: IGRA_DASHBOARD_COPY.creaImage },
  { area: "video", lik: CREA_AREA_LIK.video, label: IGRA_DASHBOARD_COPY.creaVideo },
  { area: "zvuk", lik: CREA_AREA_LIK.zvuk, label: IGRA_DASHBOARD_COPY.creaSound },
];

/**
 * Crea brzi start na kontrolnoj tabli (K08): tri ulaza u radionicu, svaki sa svojim likom
 * (Piksi slika, Kadar video, Eho zvuk). Jedan okvir; pločice se odvajaju površinom.
 */
export function CreaQuickStart({ locale, className }: { locale: Locale; className?: string }) {
  const copy = IGRA_DASHBOARD_COPY;
  const base = withLocale(locale, "/app/studio");

  return (
    <section
      data-motion="card"
      aria-labelledby="igra-crea-quick-start"
      className={cn("surface-card border-2 border-ink bg-paper-strong p-5 shadow-[6px_6px_0_0_var(--shadow-hard-13)] sm:p-6", className)}
    >
      <p className="type-eyebrow text-muted">{copy.creaEyebrow[locale]}</p>
      <h2 id="igra-crea-quick-start" className="mt-1 type-h2 text-ink">
        {copy.creaTitle[locale]}
      </h2>
      <ul className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
        {AREAS.map((item) => (
          <li key={item.area}>
            <PeelLink
              href={`${base}?oblast=${item.area}`}
              className="flex h-full flex-col items-center gap-2 surface-inset bg-paper px-2 py-4 text-center transition-colors duration-200 hover:bg-igra-marker-wash focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              <span data-igra-peel className="block">
                <IgraLik lik={item.lik} poza="mase" size="md" decorative />
              </span>
              <span className="type-body-sm font-black text-ink">{item.label[locale]}</span>
            </PeelLink>
          </li>
        ))}
      </ul>
    </section>
  );
}

import { preload } from "react-dom";

import { IgraArt } from "@/components/igra/igra-art";
import { IgraLik } from "@/components/igra/igra-lik";
import { HandUnderline, cn } from "@/components/ui/primitives";
import { igraArt, igraArtRenderable, type IgraArtId } from "@/lib/igra-art";
import type { Locale } from "@/lib/i18n";

/**
 * Heroj zajednice (K11): naslov sekcije, Iskra sa kratkim pozivom i scena trga. Scena je
 * crtana preko celog lista (nema prazan levi deo kao scene table), pa ovde nije pozadina
 * teksta nego medij uz desnu ivicu, sa levom ivicom pretopljenom u papir. Kartica je list
 * u boji papira scene: svetlo ostrvo i u tamnoj temi.
 *
 * Ispod `lg` scene NEMA (heroj je naslov + Iskra). Zato slika nije `priority` (lenja
 * slika u skrivenoj kutiji se ne skida, pa je telefon ne plaća), nego je unapred traži
 * `<link rel="preload">` sa `media` od `lg` naviše: na računaru stiže iz HTML-a kao LCP
 * slika, na telefonu se ne traži uopšte.
 */
export function CommunityHero({
  art = "scena.zajednica",
  locale,
  title,
  subtitle,
  call,
  className,
}: {
  art?: IgraArtId;
  locale: Locale;
  title: string;
  subtitle: string;
  /** Kratka Iskrina rečenica (poziv). */
  call: string;
  className?: string;
}) {
  const scene = igraArt(art);
  if (igraArtRenderable(scene)) preload(scene.src, { as: "image", fetchPriority: "high", media: "(min-width: 64rem)" });

  return (
    <section
      data-igra-hero=""
      data-motion="hero"
      className={cn(
        "paper-island relative overflow-hidden surface-card border-2 border-ink bg-igra-scene-paper shadow-[6px_6px_0_0_var(--shadow-hard-12)]",
        className,
      )}
    >
      <div className="absolute inset-y-0 right-0 hidden w-[46%] lg:block">
        <IgraArt id={art} locale={locale} className="h-full [mask-image:linear-gradient(to_right,transparent,black_26%)]" />
      </div>
      <div data-motion="copy" className="relative p-4 sm:p-6 lg:w-[58%] lg:p-8">
        <h1 className="type-h1 text-ink">{title}</h1>
        <HandUnderline size="sm" className="mt-1" />
        <p className="mt-3 hidden type-body-sm type-measure font-bold text-ink/75 sm:block">{subtitle}</p>
        <IgraLik lik="iskra" poza="mase" size="md" decorative bubble={call} className="mt-3 sm:mt-4" />
      </div>
    </section>
  );
}

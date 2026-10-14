import type { ReactNode } from "react";

import { IgraArt } from "@/components/igra/igra-art";
import { cn } from "@/components/ui/primitives";
import type { IgraArtId } from "@/lib/igra-art";
import type { Locale } from "@/lib/i18n";

/**
 * Heroj površine (K08): JEDNA jaka ilustracija ekrana. IGRA scene su crtane kao list
 * papira sa crtežom u desnoj polovini i praznim papirom levo, pa je cela kartica taj list
 * (`bg-igra-scene-paper`, svetlo ostrvo i u tamnoj temi): scena stoji uz desnu ivicu, a
 * tekst levo, na praznom delu.
 *
 *  - telefon i tablet: scena je traka na vrhu (ceo crtež, desno), pozdrav je u levom,
 *    praznom delu trake, sadržaj ispod;
 *  - od `lg`: scena puni desnu stranu po celoj visini, sadržaj je u levoj koloni.
 *
 * Jedini nosilac `data-igra-hero` i jedina `priority` slika na strani. Scena je medij u
 * okviru kartice (bez svog okvira); leva ivica slike se pretapa u papir.
 */
export function IgraHero({
  art,
  locale,
  greeting,
  children,
  aside,
  className,
}: {
  art: IgraArtId;
  locale: Locale;
  /** Rukopisni pozdrav; na telefonu stoji preko praznog dela scene. */
  greeting: ReactNode;
  children: ReactNode;
  /** Sloj preko scene (npr. 3D maskota na računaru). */
  aside?: ReactNode;
  className?: string;
}) {
  return (
    <section
      data-igra-hero=""
      data-motion="hero"
      className={cn(
        "paper-island relative overflow-hidden surface-card border-2 border-ink bg-igra-scene-paper shadow-[6px_6px_0_0_var(--shadow-hard-12)]",
        className,
      )}
    >
      <div className="absolute right-0 top-0 aspect-[3/2] h-52 sm:h-60 lg:inset-y-0 lg:aspect-auto lg:h-auto lg:w-[55%]">
        <IgraArt
          id={art}
          priority
          locale={locale}
          className="[mask-image:linear-gradient(to_right,transparent,black_18%)] lg:h-full [&>img]:object-right"
        />
      </div>
      {aside}
      <div data-motion="copy" className="relative lg:w-[52%] lg:p-8">
        <div className="flex h-52 items-center px-5 sm:h-60 sm:px-6 lg:h-auto lg:px-0">
          <p className="max-w-[46%] break-words font-display type-display-sm text-ink lg:max-w-none">{greeting}</p>
        </div>
        <div className="px-5 pb-5 sm:px-6 sm:pb-6 lg:mt-4 lg:px-0 lg:pb-0">{children}</div>
      </div>
    </section>
  );
}

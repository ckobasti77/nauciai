import { IgraArt } from "@/components/igra/igra-art";
import { IgraLik } from "@/components/igra/igra-lik";
import { SectionHeader } from "@/components/ui/primitives";
import type { IgraArtId } from "@/lib/igra-art";
import type { ReactNode } from "react";

/**
 * Zaglavlje strana naloga (K19): krediti, pretplata, profil, API ključevi. Isti
 * `SectionHeader` kao i pre (naslov, tekst, žuti potez), samo sa ikonom strane uz naslov
 * i, na kredit stranama, Robijem sa desne strane od `lg`. Bez okvira, bez markera i bez
 * ičega što se animira: ovo su stranice novca i podešavanja, ne mesto za slavlje.
 */
export function AccountHead({
  art,
  title,
  body,
  back,
  robi = false,
}: {
  art: IgraArtId;
  title: string;
  body?: string;
  /** Veza „nazad" iznad zaglavlja (studio krediti, API ključevi). */
  back?: ReactNode;
  /** Robi koji razmišlja, samo od `lg` (plan §6.8). */
  robi?: boolean;
}) {
  return (
    <div className="space-y-3">
      {back}
      <div className="flex items-center gap-4">
        <IgraArt id={art} size="md" decorative />
        <SectionHeader variant="app" underline title={title} body={body} className="min-w-0 flex-1" />
        {robi ? (
          <span className="hidden shrink-0 lg:block">
            <IgraLik lik="robi" poza="misli" size={120} decorative />
          </span>
        ) : null}
      </div>
    </div>
  );
}

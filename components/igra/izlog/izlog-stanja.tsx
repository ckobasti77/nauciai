"use client";

import { IzlogDemo, IzlogSection } from "@/components/igra/izlog/izlog-kit";
import { IgraState } from "@/components/igra/igra-state";
import { t, type Locale } from "@/lib/i18n";
import type { IgraFixtureId } from "@/lib/igra-fixtures";
import { IGRA_STATE_VARIANTS } from "@/lib/igra-state";

/**
 * Izlog, deo „stanja" (K23): svih sedam varijanti `IgraState` sa podrazumevanim tekstom,
 * pa ekran greške i 404 kakvi su u aplikaciji (`page`). Test korisnik se ne menja: stanja
 * ne zavise od njega.
 */

const noop = () => undefined;

export function IzlogStanja({ locale }: { locale: Locale; stanje: IgraFixtureId }) {
  return (
    <div className="grid gap-8">
      <IzlogSection
        title={t(locale, "Sva stanja", "All states")}
        note={t(locale, "Jedna komponenta, sedam varijanti. Greška i offline imaju „Pokušaj ponovo“, 404 vraća na tablu.", "One component, seven variants. Error and offline get “Try again”, 404 goes back to the dashboard.")}
      >
        <div className="grid gap-5 md:grid-cols-2">
          {IGRA_STATE_VARIANTS.map((variant) => (
            <IzlogDemo key={variant} label={variant}>
              <IgraState variant={variant} locale={locale} onRetry={noop} />
            </IzlogDemo>
          ))}
        </div>
      </IzlogSection>
      <IzlogSection
        title={t(locale, "Kompaktno", "Compact")}
        note={t(locale, "Unutar liste, dijaloga ili uskog panela: bez okvira, jedna rečenica.", "Inside a list, dialog or narrow panel: no frame, one sentence.")}
      >
        <div className="grid gap-5 md:grid-cols-3">
          <IzlogDemo label="compact · prazno">
            <IgraState compact variant="prazno" art="prazno.pretraga" locale={locale} title={t(locale, "Nema pronađenih poruka.", "No messages found.")} />
          </IzlogDemo>
          <IzlogDemo label="compact · ucitavanje">
            <IgraState compact variant="ucitavanje" locale={locale} title={t(locale, "Učitavam…", "Loading…")} />
          </IzlogDemo>
          <IzlogDemo label="compact · uskoro">
            <IgraState compact variant="uskoro" locale={locale} title={t(locale, "Video za ovaj deo lekcije još nije dodat.", "The video for this part of the lesson has not been added yet.")} />
          </IzlogDemo>
        </div>
      </IzlogSection>
      <IzlogSection title={t(locale, "Ceo ekran", "Full screen")} note={t(locale, "Ovako stoji granica greške i 404 unutar ljuske.", "How the error boundary and 404 sit inside the shell.")}>
        <div className="grid gap-5 lg:grid-cols-2">
          <IzlogDemo label="page · greska">
            <IgraState page variant="greska" locale={locale} onRetry={noop} />
          </IzlogDemo>
          <IzlogDemo label="page · 404">
            <IgraState page variant="404" locale={locale} />
          </IzlogDemo>
        </div>
      </IzlogSection>
    </div>
  );
}

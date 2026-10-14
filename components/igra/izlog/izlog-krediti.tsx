"use client";

import { useState } from "react";

import { CreditsView } from "@/components/app/credits-page";
import { ApiKeysEmpty, HelpTopicsEmpty } from "@/components/igra/account/account-empty";
import { AccountHead } from "@/components/igra/account/account-head";
import { IzlogDemo, IzlogSection } from "@/components/igra/izlog/izlog-kit";
import { cn } from "@/components/ui/primitives";
import { CREDITS_FIXTURES, IGRA_FIXTURE_TODAY, type IgraFixtureId } from "@/lib/igra-fixtures";
import { t, type Locale } from "@/lib/i18n";

/**
 * Izlog, deo „krediti" (K19): PRAVA strana kredita (`CreditsView`) nad test podacima,
 * zaglavlja strana naloga i njihova prazna stanja. Test korisnik bira stanje: bez kredita i
 * istorije, sa kreditima (jedan lot ističe), sa mnogo. Limit potrošnje je Convex kartica i
 * ovde je izostavljen. Kupovina ide na pravu Stripe rutu, pa je u izlogu ne pokreći.
 */

const CHIP =
  "inline-flex min-h-11 items-center rounded-full border-2 border-ink px-4 text-sm font-black text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";
const on = (active: boolean) => (active ? "bg-ink text-paper-strong" : "bg-paper-strong hover:bg-paper");
const NOW = Date.parse(`${IGRA_FIXTURE_TODAY}T07:30:00Z`);
const noop = () => undefined;

export function IzlogKrediti({ locale, stanje }: { locale: Locale; stanje: IgraFixtureId }) {
  const [noPacks, setNoPacks] = useState(false);
  const data = CREDITS_FIXTURES[stanje];

  return (
    <div className="space-y-8">
      <IzlogSection
        id="krediti"
        title={t(locale, "Strana kredita", "Credits page")}
        note={t(locale, "Stanje, paketi, pretplata i istorija iz istih izvora kao prava strana; menja se samo izgled.", "Balance, packs, subscription and history come from the same sources as the real page; only the look changes.")}
      >
        <div className="mb-5 flex flex-wrap gap-2" role="group" aria-label={t(locale, "Paketi", "Packs")}>
          <button type="button" aria-pressed={!noPacks} onClick={() => setNoPacks(false)} className={cn(CHIP, on(!noPacks))}>
            {t(locale, "Paketi u prodaji", "Packs on sale")}
          </button>
          <button type="button" aria-pressed={noPacks} onClick={() => setNoPacks(true)} className={cn(CHIP, on(noPacks))}>
            {t(locale, "Nijedan paket", "No packs")}
          </button>
        </div>
        <CreditsView
          locale={locale}
          isStudio={false}
          renderedAt={NOW}
          balance={data.balance}
          lots={data.lots}
          packs={noPacks ? [] : data.packs}
          models={data.models}
          transactions={{ status: "Exhausted", results: data.transactions, loadMore: noop }}
        />
      </IzlogSection>

      <IzlogSection id="zaglavlja" title={t(locale, "Zaglavlja naloga", "Account headers")} note={t(locale, "Podešavanja (profil, API ključevi), pretplata i pomoć.", "Settings (profile, API keys), billing and help.")}>
        <div className="grid gap-8">
          <IzlogDemo label="ikona.podesavanja">
            <AccountHead art="ikona.podesavanja" title={t(locale, "Profil", "Profile")} body={t(locale, "Uredi ime, prezime, avatar i osnovna podešavanja naloga.", "Edit your name, avatar, and basic account settings.")} />
          </IzlogDemo>
          <IzlogDemo label="ikona.krediti">
            <AccountHead art="ikona.krediti" title={t(locale, "Pretplata", "Billing")} body={t(locale, "Status pretplate je vezan za konkretan kurs.", "Subscription status is tied to a course.")} />
          </IzlogDemo>
        </div>
      </IzlogSection>

      <IzlogSection id="prazno" title={t(locale, "Prazna stanja", "Empty states")} note={t(locale, "API ključevi i teme pomoći; prazni paketi i istorija su gore.", "API keys and help topics; empty packs and history are above.")}>
        <div className="grid gap-6 md:grid-cols-2">
          <IzlogDemo label="prazno.zakljucano">
            <ApiKeysEmpty locale={locale} onCreate={noop} />
          </IzlogDemo>
          <IzlogDemo label="prazno.uskoro">
            <div className="grid md:grid-cols-2">
              <HelpTopicsEmpty locale={locale} />
            </div>
          </IzlogDemo>
        </div>
      </IzlogSection>
    </div>
  );
}

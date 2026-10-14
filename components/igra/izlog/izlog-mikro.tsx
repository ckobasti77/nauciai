"use client";

import { ArrowRight, BookOpen, Sparkles, Trophy } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { SoundToggle } from "@/components/app/sound-toggle";
import { CreaQuickStart } from "@/components/igra/dashboard/crea-quick-start";
import { IzlogDemo, IzlogSection } from "@/components/igra/izlog/izlog-kit";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast-provider";
import { t, type Locale } from "@/lib/i18n";
import type { IgraFixtureId } from "@/lib/igra-fixtures";

/**
 * Izlog, deo „mikro" (K24): zajednički recepti `igra-press` / `igra-lift` (globals.css),
 * dugme aplikacije, jezičci i prekidač sa podrazumevanim fokusom i prelazom ljuske
 * (`[data-igra-ui]`), nalepnica-peel na posebnim CTA-ima i tostovi sa zvukom.
 */
export function IzlogMikro({ locale }: { locale: Locale; stanje: IgraFixtureId }) {
  const toast = useToast();
  const [tab, setTab] = useState<"sve" | "neprocitano" | "grupe">("sve");
  const [period, setPeriod] = useState<"week" | "all_time">("week");
  const [on, setOn] = useState(true);

  const tabs = [
    { id: "sve", label: t(locale, "Sve", "All") },
    { id: "neprocitano", label: t(locale, "Nepročitano", "Unread") },
    { id: "grupe", label: t(locale, "Grupe", "Groups") },
  ] as const;

  return (
    <div className="grid gap-8">
      <IzlogSection
        title={t(locale, "Dugmad: pritisak", "Buttons: press")}
        note={t(
          locale,
          "Hover podigne 2 px i produži tvrdu senku, pritisak spusti 1 px i senku skrati. Uz „manje pokreta” nema pomeranja, menja se samo senka.",
          "Hover lifts 2 px and lengthens the hard shadow, press sinks 1 px and shortens it. With reduced motion nothing moves; only the shadow changes.",
        )}
      >
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <IzlogDemo label="<Button> primary · secondary">
            <div className="flex flex-wrap gap-3">
              <Button>{t(locale, "Sačuvaj", "Save")}</Button>
              <Button variant="secondary">{t(locale, "Otkaži", "Cancel")}</Button>
            </div>
          </IzlogDemo>
          <IzlogDemo label="<Button> ghost · destructive">
            <div className="flex flex-wrap gap-3">
              <Button variant="ghost">{t(locale, "Preskoči", "Skip")}</Button>
              <Button variant="destructive">{t(locale, "Obriši", "Delete")}</Button>
            </div>
          </IzlogDemo>
          <IzlogDemo label="<Button> loading · disabled">
            <div className="flex flex-wrap gap-3">
              <Button loading>{t(locale, "Šaljem", "Sending")}</Button>
              <Button disabled>{t(locale, "Zaključano", "Locked")}</Button>
            </div>
          </IzlogDemo>
          <IzlogDemo label="igra-press · shadow-ink / -yellow / -soft">
            <div className="flex flex-wrap gap-3">
              <button type="button" className="igra-press igra-shadow-ink inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-ink bg-yellow px-4 text-sm font-black text-ink">
                <Sparkles className="size-4" aria-hidden="true" />
                {t(locale, "Napravi", "Create")}
              </button>
              <button type="button" className="igra-press igra-shadow-yellow igra-depth-4 inline-flex min-h-11 items-center rounded-full border-2 border-ink bg-ink px-4 text-sm font-black text-paper-strong">
                {t(locale, "Nastavi", "Continue")}
              </button>
              <button type="button" className="igra-press igra-shadow-soft igra-depth-2 inline-flex min-h-11 items-center rounded-full border-2 border-ink bg-paper-strong px-4 text-xs font-black text-ink">
                {t(locale, "Filter", "Filter")}
              </button>
            </div>
          </IzlogDemo>
        </div>
      </IzlogSection>

      <IzlogSection
        title={t(locale, "Kartice: mirni hover", "Cards: calm hover")}
        note={t(locale, "Kartica-link se podigne 2 px uz dužu senku. Veličina, okvir i tekst stoje.", "A card link lifts 2 px with a longer shadow. Size, border and text stay put.")}
      >
        <ul className="grid gap-4 sm:grid-cols-3">
          {[
            { icon: BookOpen, title: t(locale, "Uvod u AI", "Intro to AI"), body: t(locale, "6 od 12 lekcija", "6 of 12 lessons") },
            { icon: Trophy, title: t(locale, "Rang lista", "Leaderboard"), body: t(locale, "#4 ove nedelje", "#4 this week") },
            { icon: Sparkles, title: t(locale, "Crea radionica", "Crea workshop"), body: t(locale, "Napravi prvi video", "Make your first video") },
          ].map((card) => (
            <li key={card.title}>
              <Link
                href="?deo=mikro"
                className="igra-lift igra-shadow-soft igra-depth-4 flex h-full items-start gap-3 surface-card border-2 border-ink bg-paper-strong p-4 text-ink"
              >
                <card.icon className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block type-h4">{card.title}</span>
                  <span className="mt-1 block type-body-sm font-semibold text-muted">{card.body}</span>
                </span>
                <ArrowRight className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      </IzlogSection>

      <IzlogSection
        title={t(locale, "Jezičci i prekidači", "Tabs and switches")}
        note={t(
          locale,
          "Unutar ljuske (`data-igra-ui`) jezičak, prekidač i dugme-prekidač bez svog fokusa dobijaju isti prsten, a boja se menja mirno.",
          "Inside the shell (`data-igra-ui`) a tab, switch or toggle button without its own focus style gets the same ring, and colour changes calmly.",
        )}
      >
        <div className="grid gap-5 md:grid-cols-3">
          <IzlogDemo label='role="tab"'>
            <div role="tablist" aria-label={t(locale, "Filter razgovora", "Conversation filter")} className="grid grid-cols-3 gap-2">
              {tabs.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === item.id}
                  onClick={() => setTab(item.id)}
                  className={cn("min-h-11 rounded-full border-2 border-ink px-2 type-caption font-black", tab === item.id ? "bg-ink text-paper-strong" : "bg-paper-strong text-ink")}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </IzlogDemo>
          <IzlogDemo label="aria-pressed">
            <div role="group" aria-label={t(locale, "Period rangiranja", "Ranking period")} className="inline-flex gap-1 rounded-full border border-line bg-ink/5 p-1">
              {(["week", "all_time"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={period === value}
                  onClick={() => setPeriod(value)}
                  className={cn("min-h-10 whitespace-nowrap rounded-full px-4 text-xs font-black", period === value ? "bg-ink text-paper-strong" : "text-ink/65 hover:bg-paper-strong hover:text-ink")}
                >
                  {value === "week" ? t(locale, "Ova nedelja", "This week") : t(locale, "Ukupno", "All time")}
                </button>
              ))}
            </div>
          </IzlogDemo>
          <IzlogDemo label='role="switch"'>
            <div className="inline-flex min-h-11 items-center gap-3 type-body-sm font-bold text-ink">
              <button
                type="button"
                role="switch"
                aria-checked={on}
                aria-labelledby="izlog-mikro-switch"
                onClick={() => setOn((value) => !value)}
                className={cn("inline-flex h-7 w-12 shrink-0 items-center rounded-full border-2 border-ink p-0.5", on ? "bg-yellow" : "bg-paper")}
              >
                <span className={cn("size-5 rounded-full border-2 border-ink bg-paper-strong transition-[translate] duration-200", on && "translate-x-5")} />
              </button>
              <span id="izlog-mikro-switch">{t(locale, "Noćna tura", "Night run")}</span>
            </div>
          </IzlogDemo>
        </div>
      </IzlogSection>

      <IzlogSection
        title={t(locale, "Poseban CTA: nalepnica se odlepi", "Special CTA: sticker peel")}
        note={t(locale, "Samo na ulazima u stvaranje. Pod mišem se nalepnica nagne i sine; na dodir i uz „manje pokreta” miruje.", "Only on entries into creating. Under the mouse the sticker tilts and shines; on touch and with reduced motion it stays still.")}
      >
        <CreaQuickStart locale={locale} className="max-w-xl" />
      </IzlogSection>

      <IzlogSection
        title={t(locale, "Tostovi i zvuk", "Toasts and sound")}
        note={t(
          locale,
          "Uspeh: marker preko naslova, mali Robi i kratak zvon, samo ako je zvuk uključen. Greška ostaje crvena, sa ikonom i bez zvuka.",
          "Success: marker behind the title, little Robi and a short chime, only when sound is on. Errors stay red, with an icon and no sound.",
        )}
      >
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => toast.success(t(locale, "Sačuvano", "Saved"), t(locale, "Profil je ažuriran.", "Your profile is updated."))}>
            {t(locale, "Tost uspeha", "Success toast")}
          </Button>
          <Button variant="secondary" onClick={() => toast.error(t(locale, "Nije sačuvano", "Not saved"), t(locale, "Veza je pukla. Pokušaj ponovo za koji trenutak.", "The connection dropped. Try again in a moment."))}>
            {t(locale, "Tost greške", "Error toast")}
          </Button>
          <Button variant="ghost" onClick={() => toast.warning(t(locale, "Još malo", "Almost there"), t(locale, "Dodaj naslov pre objave.", "Add a title before posting."))}>
            {t(locale, "Upozorenje", "Warning")}
          </Button>
          <SoundToggle locale={locale} />
        </div>
      </IzlogSection>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useState, type MouseEvent } from "react";

import { CreaHistoryEmpty } from "@/components/crea/crea-history";
import { CreaStage } from "@/components/crea/crea-stage";
import { CreaStartScreen } from "@/components/crea/crea-start-screen";
import { CreaWorkshop } from "@/components/crea/crea-workshop";
import { CreaGameProvider } from "@/components/crea/game/crea-game-context";
import { CreaGameStrip } from "@/components/crea/game/crea-game-strip";
import { CreaAreaHeader } from "@/components/igra/crea/crea-area-header";
import { IzlogDemo, IzlogSection } from "@/components/igra/izlog/izlog-kit";
import { cn } from "@/components/ui/primitives";
import { CREA_AREAS, creaModeDef, parseCreaShellState, type CreaArea, type CreaModeId } from "@/lib/crea-shell";
import { IGRA_CREA_COPY } from "@/lib/igra-copy";
import { CREA_GAME_FIXTURES, IGRA_FIXTURE_IDS, IGRA_FIXTURE_LABEL, IGRA_FIXTURE_TODAY, type IgraFixtureId } from "@/lib/igra-fixtures";
import { t, withLocale, type Locale } from "@/lib/i18n";

/**
 * Izlog, deo „crea" (K15): PRAVA radionica Cree nad test podacima, bez prijave i bez
 * upita - ulaz „Šta praviš danas?" sa likovima, zaglavlja radionica, prazne pozornice i
 * traka napretka. Radionica je uživo: pilule oblasti, pločice likova i kartice ciljeva
 * menjaju oblast ovde umesto da odu u aplikaciju (koja traži prijavu). Composer,
 * istorija radova i alati nisu deo izloga (čitaju bazu; alati vuku WASM koji `next dev
 * --webpack` ne ume da učita), pa i režim sa alatima ovde crta praznu pozornicu.
 */

const CHIP =
  "inline-flex min-h-11 items-center rounded-full border-2 border-ink px-4 text-sm font-black text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

const HELP = { slika: IGRA_CREA_COPY.helpSlika, video: IGRA_CREA_COPY.helpVideo, zvuk: IGRA_CREA_COPY.helpZvuk } as const;
const APP_PATH = "/app/studio";
const noop = () => {};

function LiveWorkshop({ locale }: { locale: Locale }) {
  const [shell, setShell] = useState<{ area: CreaArea | null; mode: CreaModeId | null }>({ area: null, mode: null });
  const modeDef = shell.area ? creaModeDef(shell.area, shell.mode) : null;

  // Pločica lika i kartica cilja su pravi linkovi ka radionici; ovde samo menjaju oblast.
  function stayInIzlog(event: MouseEvent) {
    const anchor = (event.target as Element).closest("a");
    if (!anchor) return;
    const url = new URL(anchor.href);
    if (!url.pathname.endsWith(APP_PATH)) return;
    const next = parseCreaShellState(url.searchParams);
    if (!next.area) return;
    event.preventDefault();
    setShell({ area: next.area, mode: next.mode });
  }

  const stage =
    shell.area === null || modeDef === null ? (
      <CreaStartScreen locale={locale} pathname={withLocale(locale, APP_PATH)} searchParams={new URLSearchParams()} />
    ) : (
      <CreaStage
        locale={locale}
        area={shell.area}
        mode={modeDef}
        job={null}
        isLoading={false}
        composerDocked
        onOpenDetail={noop}
        onReuse={noop}
        onExtend={noop}
      />
    );

  return (
    <div onClickCapture={stayInIzlog} className="surface-card bg-studio-canvas p-3 sm:p-5">
      <CreaWorkshop
        locale={locale}
        area={shell.area}
        mode={modeDef?.id ?? null}
        onNavigate={(next) =>
          setShell((current) => ({
            area: next.area !== undefined ? next.area : current.area,
            mode: next.area !== undefined && next.area !== current.area ? null : next.mode !== undefined ? next.mode : current.mode,
          }))
        }
        panel={null}
        stage={stage}
        history={shell.area ? <CreaHistoryEmpty locale={locale} area={shell.area} /> : null}
      />
    </div>
  );
}

export function IzlogCrea({ locale, stanje }: { locale: Locale; stanje: IgraFixtureId }) {
  const base = withLocale(locale, "/igra-izlog");
  const game = CREA_GAME_FIXTURES[stanje];

  return (
    <div className="space-y-10">
      <nav aria-label={t(locale, "Test korisnik", "Test user")} className="flex flex-wrap gap-2">
        {IGRA_FIXTURE_IDS.map((id) => (
          <Link
            key={id}
            href={`${base}?deo=crea&stanje=${id}`}
            aria-current={id === stanje ? "true" : undefined}
            className={cn(CHIP, id === stanje ? "bg-ink text-paper-strong" : "bg-paper")}
          >
            {IGRA_FIXTURE_LABEL[id][locale]}
          </Link>
        ))}
      </nav>

      <IzlogSection
        id="radionica"
        title={t(locale, "Radionica (uživo)", "Workshop (live)")}
        note={t(
          locale,
          "Prava radionica: ulaz sa scenom i tri lika, pa zaglavlje radionice i prazna pozornica. Pilule oblasti, pločice likova i kartice ciljeva rade.",
          "The real workshop: the entry with the scene and three characters, then the workshop header and the empty stage. Area pills, character tiles and goal cards work.",
        )}
      >
        <LiveWorkshop key={locale} locale={locale} />
      </IzlogSection>

      <IzlogSection
        id="zaglavlja"
        title={t(locale, "Zaglavlja radionica", "Workshop headers")}
        note={t(locale, "Lik oblasti sa kratkim savetom; na telefonu manji lik.", "The area character with a short tip; a smaller character on phones.")}
      >
        <div className="space-y-5">
          {CREA_AREAS.map((area) => (
            <IzlogDemo key={area} label={`area="${area}"`}>
              <CreaAreaHeader area={area} help={HELP[area][locale]} />
            </IzlogDemo>
          ))}
        </div>
      </IzlogSection>

      <IzlogSection
        id="traka"
        title={t(locale, "Traka napretka", "Progress strip")}
        note={t(
          locale,
          "Pečat nivoa iz ljuske (iz XP-a, ne iz starog serverskog nivoa), niz dana, XP i album. Na telefonu samo pečat, niz i sveska.",
          "The level seal from the shell (from XP, not the old server level), the streak, XP and the album. On phones only the seal, streak and notebook.",
        )}
      >
        <CreaGameProvider value={{ game, unlock: { all: true }, freeTries: [], notebookPath: "/app/studio/sveska", todayKey: IGRA_FIXTURE_TODAY }}>
          <IzlogDemo label={`xp=${game.xp} · streak=${game.streak.current}`}>
            <CreaGameStrip locale={locale} />
          </IzlogDemo>
        </CreaGameProvider>
      </IzlogSection>
    </div>
  );
}

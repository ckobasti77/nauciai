"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { CreaAlbumView } from "@/components/crea/game/crea-album-view";
import { CreaGameProvider, useCreaGame, useCreaGameValue } from "@/components/crea/game/crea-game-context";
import { CreaLessonPlayer } from "@/components/crea/game/crea-lesson-player";
import { CreaReportCardPanel } from "@/components/crea/game/crea-report-card-panel";
import { CreaSkillMap } from "@/components/crea/game/crea-skill-map";
import { CreaStampHost } from "@/components/crea/game/crea-stamp-host";
import { CreaStreakPanel } from "@/components/crea/game/crea-streak-panel";
import { CreaLogo } from "@/components/crea/crea-logo";
import { LinkButton, cn } from "@/components/ui/primitives";
import { CREA_NOTEBOOK_COPY } from "@/lib/crea-game-copy";
import { miniLessonById } from "@/lib/crea-mini-lessons";
import { withLocale, type Locale } from "@/lib/i18n";

type Section = "album" | "mapa" | "knjizica";
const SECTIONS: readonly Section[] = ["album", "mapa", "knjizica"];

/**
 * Sveska Cree (K26): niz dana na vrhu, pa tri dela kao listovi sveske - album sličica
 * (G4), mapa veština sa mini-lekcijama (G6, G7, U10) i đačka knjižica (G5). Deo i
 * otvorena lekcija su u URL-u (`?deo=`, `?lekcija=`, `?test=1`), pa se link deli.
 */
export function CreaNotebook({
  locale,
  notebookPath,
  appPath,
  signInHref,
}: {
  locale: Locale;
  /** Kanonska putanja ove sveske (`/studio/sveska` ili `/app/studio/sveska`). */
  notebookPath: string;
  /** Kanonska putanja radionice. */
  appPath: string;
  signInHref: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const value = useCreaGameValue(notebookPath);
  const raw = searchParams.get("deo");
  const section: Section = SECTIONS.includes(raw as Section) ? (raw as Section) : "album";
  const lesson = miniLessonById(searchParams.get("lekcija"));
  const startWithTest = searchParams.get("test") === "1";

  const hrefFor = (next: Record<string, string | null>) => {
    const query = new URLSearchParams(searchParams.toString());
    for (const [key, val] of Object.entries(next)) {
      if (val === null) query.delete(key);
      else query.set(key, val);
    }
    const text = query.toString();
    return `${pathname}${text ? `?${text}` : ""}`;
  };
  const lessonHref = (lessonId: string, test = false) => hrefFor({ deo: "mapa", lekcija: lessonId, test: test ? "1" : null });
  const label: Record<Section, string> = {
    album: CREA_NOTEBOOK_COPY.tabAlbum[locale],
    mapa: CREA_NOTEBOOK_COPY.tabMap[locale],
    knjizica: CREA_NOTEBOOK_COPY.tabCard[locale],
  };

  const game = value.game;

  return (
    <CreaGameProvider value={value}>
      <div className="mx-auto max-w-6xl space-y-5 text-ink">
        <CreaStampHost locale={locale} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href={withLocale(locale, appPath)}
            className="inline-flex min-h-11 items-center gap-2 rounded-full px-2 text-sm font-black text-ink underline decoration-yellow decoration-2 underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            {CREA_NOTEBOOK_COPY.back[locale]}
          </Link>
        </div>
        <header className="flex items-start gap-4">
          <CreaLogo variant="znak" className="size-12 shrink-0" />
          <div>
            <h1 className="type-h1">{CREA_NOTEBOOK_COPY.title[locale]}</h1>
            <p className="mt-1 type-body type-measure text-muted">{CREA_NOTEBOOK_COPY.subtitle[locale]}</p>
          </div>
        </header>

        {game === null ? (
          <section className="surface-card border-2 border-ink bg-paper-strong p-6 text-center shadow-[6px_6px_0_0_var(--shadow-hard-16)]">
            <p className="type-h3">{CREA_NOTEBOOK_COPY.guestTitle[locale]}</p>
            <p className="mt-2 type-body-sm font-semibold text-muted">{CREA_NOTEBOOK_COPY.guestBody[locale]}</p>
            <LinkButton href={signInHref} tone="ink" className="mt-4">
              {CREA_NOTEBOOK_COPY.guestCta[locale]}
            </LinkButton>
          </section>
        ) : game === undefined ? (
          <p role="status" className="type-body font-bold text-muted">
            {CREA_NOTEBOOK_COPY.loading[locale]}
          </p>
        ) : (
          <>
            <CreaStreakPanel locale={locale} streak={game.streak} />
            <nav aria-label={CREA_NOTEBOOK_COPY.tabs[locale]} className="flex flex-wrap gap-2">
              {SECTIONS.map((id) => (
                <Link
                  key={id}
                  href={hrefFor({ deo: id, lekcija: null, test: null })}
                  scroll={false}
                  aria-current={section === id ? "page" : undefined}
                  className={cn(
                    "inline-flex min-h-11 items-center rounded-full border-2 border-ink px-5 text-sm font-black transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink motion-reduce:transition-none",
                    section === id ? "bg-ink text-paper-strong shadow-[3px_3px_0_0_var(--yellow)]" : "bg-paper-strong text-ink hover:-translate-y-0.5",
                  )}
                >
                  {label[id]}
                </Link>
              ))}
            </nav>

            {section === "album" ? <CreaAlbumView locale={locale} /> : null}
            {section === "mapa" ? (
              lesson ? (
                <CreaLessonPlayer
                  key={`${lesson.id}:${startWithTest ? "t" : "l"}`}
                  locale={locale}
                  lesson={lesson}
                  startWithTest={startWithTest}
                  appPath={appPath}
                  onClose={() => router.push(hrefFor({ lekcija: null, test: null }), { scroll: false })}
                />
              ) : (
                <CreaSkillMap locale={locale} lessonHref={lessonHref} />
              )
            ) : null}
            {section === "knjizica" ? <MyReportCard locale={locale} /> : null}
          </>
        )}
      </div>
    </CreaGameProvider>
  );
}

function MyReportCard({ locale }: { locale: Locale }) {
  const username = useCreaGame().game?.username;
  if (!username) {
    return (
      <p className="type-body font-bold text-muted">
        {locale === "sr" ? "Knjižica traži korisničko ime - postavi ga u " : "The report card needs a username - set it in "}
        <Link href={`${withLocale(locale, "/app/profile")}#public-profile`} className="font-black text-ink underline decoration-yellow decoration-2 underline-offset-4">
          {locale === "sr" ? "profilu" : "your profile"}
        </Link>
        .
      </p>
    );
  }
  return (
    <div className="max-w-2xl">
      <CreaReportCardPanel locale={locale} username={username} />
    </div>
  );
}

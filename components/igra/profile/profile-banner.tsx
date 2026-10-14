"use client";

/* eslint-disable @next/next/no-img-element -- avatar člana je korisnička slika (Convex storage ili spoljna adresa), isto kao u ostatku profila. */

import { Paintbrush } from "lucide-react";

import { IgraArt } from "@/components/igra/igra-art";
import { LevelRing } from "@/components/igra/level-ring";
import { LevelStamp } from "@/components/igra/level-stamp";
import { igraBannerArt, type IgraBannerKey } from "@/lib/igra-banners";
import { IGRA_PROFILE_COPY } from "@/lib/igra-copy";
import type { Locale } from "@/lib/i18n";

const AVATAR_FALLBACK = "/images/avatars/mythic-mentor.png";

/**
 * Zaglavlje profila (K13): baner `baner.<kljuc>` preko cele širine, avatar u prstenu
 * nivoa preko donje ivice banera, ime, korisničko ime i uloga, a desno pečat nivoa. Dok
 * se baner ne zna (`banner` je `undefined`) stoji prazan papir iste veličine, pa se ništa
 * ne pomera. Na sopstvenom profilu dugme u uglu banera otvara izbor banera.
 *
 * Prezentaciono: podaci samo kroz props (stranica ih vezuje za upite, izlog za test
 * podatke). Baner je jedina velika slika strane i LCP, pa je jedini `priority`.
 */
export function ProfileBanner({
  banner,
  name,
  username,
  avatarUrl,
  roleLabel,
  level,
  levelProgress,
  locale,
  onEditBanner,
}: {
  banner: IgraBannerKey | undefined;
  name: string;
  username: string;
  avatarUrl?: string | null;
  roleLabel: string;
  /** `null`: nalog tima, nivo se ne prikazuje (kao i danas). */
  level: number | null;
  /** Napredak kroz tekući nivo, 0..1 (prsten oko avatara). */
  levelProgress: number;
  locale: Locale;
  /** Samo vlasnik: otvara izbor banera. */
  onEditBanner?: () => void;
}) {
  const copy = IGRA_PROFILE_COPY;

  return (
    <section
      aria-labelledby="profile-name"
      className="surface-card overflow-hidden border-2 border-ink bg-paper-strong shadow-[6px_6px_0_0_var(--shadow-hard-13)]"
    >
      <div data-igra-hero="" className="relative aspect-[3/1] md:aspect-[4/1]">
        {banner ? (
          <IgraArt key={banner} id={igraBannerArt(banner)} size="hero" priority decorative className="absolute inset-0 size-full" />
        ) : (
          <span aria-hidden="true" className="absolute inset-0 bg-surface-b sketch-grid" />
        )}
        {onEditBanner ? (
          <button
            type="button"
            onClick={onEditBanner}
            className="absolute right-3 top-3 inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-ink bg-paper-strong px-4 text-sm font-black text-ink shadow-[3px_3px_0_0_var(--ink)] transition hover:bg-yellow active:translate-y-px focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            <Paintbrush aria-hidden="true" className="size-4" />
            <span className="max-sm:sr-only">{copy.bannerEdit[locale]}</span>
          </button>
        ) : null}
      </div>

      <div className="flex flex-col gap-4 px-4 pb-5 sm:flex-row sm:items-start sm:gap-5 sm:px-6 sm:pb-6">
        <div className="relative -mt-12 grid size-28 shrink-0 place-items-center self-start rounded-full bg-paper-strong sm:-mt-16 sm:size-36">
          {level !== null ? (
            <>
              <LevelRing progress={levelProgress} size={112} stroke={5} className="sm:hidden" />
              <LevelRing progress={levelProgress} size={144} stroke={6} className="max-sm:hidden" />
            </>
          ) : null}
          <img
            src={avatarUrl || AVATAR_FALLBACK}
            alt={name}
            className="size-[5.75rem] rounded-full border-2 border-ink object-cover sm:size-[7.5rem]"
          />
        </div>

        <div className="min-w-0 flex-1 sm:pt-4">
          <h1 id="profile-name" className="break-words type-h1 text-ink">
            {name}
          </h1>
          <p className="mt-2 flex flex-wrap items-center gap-2 text-sm font-bold text-muted">
            <span className="font-mono">@{username}</span>
            <span className="rounded-full border-2 border-ink bg-yellow px-3 py-0.5 type-eyebrow text-ink">{roleLabel}</span>
          </p>
        </div>

        {level !== null ? <LevelStamp level={level} locale={locale} size="lg" showName className="shrink-0 sm:pt-4" /> : null}
      </div>
    </section>
  );
}

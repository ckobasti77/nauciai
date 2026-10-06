"use client";

import type { CSSProperties } from "react";

import { useActiveSeason } from "@/components/crea/community/use-season";
import { cn } from "@/components/ui/primitives";
import { CREA_SEASON_COPY } from "@/lib/crea-community-copy";
import type { CreaSeason, SeasonEffect } from "@/lib/crea-seasons";
import { stickerById, stickerUrl } from "@/lib/crea-stickers";
import type { Locale } from "@/lib/i18n";

/** Gde padaju pahulje (levo, kašnjenje, trajanje) - fiksno, da se ne menja pri renderu. */
const FLAKES = [
  [6, 0, 7.5],
  [18, 2.4, 9],
  [31, 4.1, 8],
  [47, 1.2, 10],
  [58, 5.3, 7],
  [69, 0.6, 9.5],
  [81, 3.2, 8.5],
  [93, 6.1, 7.8],
] as const;

function Effect({ effect }: { effect: SeasonEffect }) {
  if (effect === "sneg") {
    return (
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        {FLAKES.map(([left, delay, duration]) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={left}
            src={stickerUrl("pahulja")}
            alt=""
            className="crea-season-fall absolute top-1 size-4 opacity-60"
            style={{ left: `${left}%`, "--fall-delay": `${delay}s`, "--fall-duration": `${duration}s` } as CSSProperties}
          />
        ))}
      </span>
    );
  }
  if (effect === "reflektori") {
    return (
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        {[20, 78].map((left, index) => (
          <span
            key={left}
            className="crea-season-sweep absolute -bottom-8 h-[160%] w-16 origin-bottom bg-yellow/25"
            style={{ left: `${left}%`, "--fall-delay": `${index * 1.5}s`, clipPath: "polygon(45% 100%, 55% 100%, 100% 0, 0 0)" } as CSSProperties}
          />
        ))}
      </span>
    );
  }
  return null;
}

function stickerMotion(effect: SeasonEffect): string {
  if (effect === "svece") return "crea-season-flicker";
  if (effect === "jaja") return "crea-season-bob";
  return "";
}

/**
 * Traka tematske nedelje (K27, G12): ime i opis sezone, njene nalepnice i efekat.
 * Pojavljuje se samo dok sezona traje (ili za `?sezona=` pregled - samo izgled).
 */
export function CreaSeasonBanner({ locale, preview }: { locale: Locale; preview?: string | null }) {
  const season = useActiveSeason(preview);
  if (!season) return null;
  return <SeasonCard locale={locale} season={season} previewing={Boolean(preview) && season.id === preview} />;
}

function SeasonCard({ locale, season, previewing }: { locale: Locale; season: CreaSeason; previewing: boolean }) {
  const stickers = season.stickers.flatMap((id) => {
    const sticker = stickerById(id);
    return sticker ? [sticker] : [];
  });
  const motion = stickerMotion(season.effect);
  return (
    <section
      aria-label={`${CREA_SEASON_COPY.kicker[locale]}: ${season.label[locale]}`}
      className="surface-card relative overflow-hidden border-2 border-ink bg-surface-b p-4 text-ink shadow-[4px_4px_0_0_var(--shadow-hard-14)] sm:p-5"
    >
      <Effect effect={season.effect} />
      <div className="relative flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="type-display text-lg text-ink">
            {CREA_SEASON_COPY.kicker[locale]}
            {previewing ? <span className="ml-2 rounded-full border border-ink px-2 py-0.5 text-xs font-black">{CREA_SEASON_COPY.preview[locale]}</span> : null}
          </p>
          <h2 className="type-h3">{season.label[locale]}</h2>
          <p className="mt-1 type-body-sm font-semibold text-muted type-measure">{season.tagline[locale]}</p>
          <p className="mt-1 text-xs font-bold text-muted">{CREA_SEASON_COPY.stickers[locale]}</p>
        </div>
        <ul aria-hidden="true" className="flex flex-wrap items-center gap-1.5">
          {stickers.map((sticker, index) => (
            <li key={sticker.id} className="grid size-11 place-items-center rounded-full bg-paper-strong">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={stickerUrl(sticker.id)}
                alt=""
                className={cn("size-7", motion)}
                style={{ "--fall-delay": `${index * 0.35}s` } as CSSProperties}
              />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

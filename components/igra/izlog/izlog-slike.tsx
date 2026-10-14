import type { ReactNode } from "react";

import { IgraArt, IgraArtFallback } from "@/components/igra/igra-art";
import { cn } from "@/components/ui/primitives";
import {
  IGRA_ART_KINDS,
  IGRA_ART_SIZES,
  igraArt,
  igraArtIds,
  igraArtRenderable,
  isIgraSticker,
  type IgraArtId,
  type IgraArtKind,
} from "@/lib/igra-art";
import { t, type Locale } from "@/lib/i18n";

/**
 * Izlog, deo „slike i tokeni" (K02): svaka slika iz manifesta sa statusom, fallback po
 * vrsti, silueta i novi tokeni/klase u obe teme. Bez podataka i bez prijave - služi za
 * pregled i snimke. Ljusku izloga i ostale delove dodaje K05.
 */

const KIND_TITLE: Record<IgraArtKind, { sr: string; en: string }> = {
  lik: { sr: "Likovi", en: "Characters" },
  nivo: { sr: "Amblemi nivoa", en: "Level emblems" },
  bedz: { sr: "Bedževi", en: "Badges" },
  rang: { sr: "Rang i meta", en: "Rank and meta" },
  scena: { sr: "Scene", en: "Scenes" },
  "scena-nalepnica": { sr: "Scene-nalepnice", en: "Scene stickers" },
  baner: { sr: "Baneri profila", en: "Profile banners" },
  prazno: { sr: "Prazna stanja", en: "Empty states" },
  admin: { sr: "Admin ikone", en: "Admin icons" },
  ikona: { sr: "Ikone aplikacije", en: "App icons" },
};

const SWATCHES = [
  { name: "--igra-marker", className: "bg-igra-marker" },
  { name: "--igra-marker-wash", className: "bg-igra-marker-wash" },
  { name: "--igra-track", className: "bg-igra-track" },
  { name: "--igra-stamp", className: "bg-igra-stamp" },
  { name: "--igra-sticker-edge", className: "bg-igra-sticker-edge" },
  { name: "--igra-medal-gold", className: "bg-[var(--igra-medal-gold)]" },
  { name: "--igra-medal-silver", className: "bg-[var(--igra-medal-silver)]" },
  { name: "--igra-medal-bronze", className: "bg-[var(--igra-medal-bronze)]" },
] as const;

const FALLBACK_SAMPLES: IgraArtId[] = ["lik.sova.mase", "nivo.07", "bedz.niz-7", "rang.pehar", "prazno.offline", "admin.sistem", "ikona.krediti"];

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="surface-card border-2 border-ink bg-paper-strong p-4 shadow-[6px_6px_0_0_var(--shadow-hard-13)] sm:p-6">
      <h2 className="type-h3 text-ink">{title}</h2>
      {note ? <p className="mt-1 type-body-sm font-semibold text-muted">{note}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Caption({ children }: { children: ReactNode }) {
  return <span className="mt-2 block break-all font-mono type-caption text-muted">{children}</span>;
}

export function IzlogSlike({ locale }: { locale: Locale }) {
  const ids = igraArtIds();
  const byKind = IGRA_ART_KINDS.map((kind) => ({ kind, ids: ids.filter((id) => igraArt(id).kind === kind) })).filter((group) => group.ids.length > 0);
  const ready = ids.filter((id) => igraArtRenderable(igraArt(id))).length;

  return (
    <div className="space-y-6">
      <Section
        title={t(locale, "Tokeni i klase", "Tokens and classes")}
        note={t(locale, "Isti uzorci u svetloj i tamnoj temi. Žuta markera se ne menja.", "Same samples in light and dark. Marker yellow never changes.")}
      >
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {SWATCHES.map((swatch) => (
            <li key={swatch.name}>
              <span className={cn("surface-inset block h-12 shadow-[inset_0_0_0_1px_var(--shadow-hard-14)]", swatch.className)} />
              <Caption>{swatch.name}</Caption>
            </li>
          ))}
        </ul>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="igra-paper surface-inset relative bg-surface-b p-5">
            <span className="igra-tape -top-2 left-6" aria-hidden="true" />
            <p className="type-eyebrow text-muted">.igra-paper + .igra-tape</p>
            <p className="mt-3 type-h2 text-ink">
              {t(locale, "Osvojio si", "You earned")} <span className="igra-marker bg-yellow text-ink">+100 XP</span>
            </p>
            <p className="mt-4 flex flex-wrap items-center gap-4">
              <span className="igra-stamp min-h-11 px-4 type-eyebrow">{t(locale, "Završeno", "Completed")}</span>
              <span className="igra-stamp size-14 type-h3 tabular-nums">7</span>
            </p>
          </div>
          <div className="surface-inset bg-paper p-5">
            <p className="type-eyebrow text-muted">.igra-sticker · data-locked</p>
            <div className="mt-3 flex flex-wrap items-end gap-5">
              <IgraArt id="bedz.prva-lekcija" size="lg" locale={locale} />
              <IgraArt id="bedz.prva-lekcija" size="lg" locked locale={locale} />
              <IgraArt id="nivo.03" size="lg" locale={locale} />
              <IgraArt id="nivo.03" size="lg" locked locale={locale} />
            </div>
          </div>
        </div>
      </Section>

      <Section title={t(locale, "Veličine", "Sizes")} note="xs 24 · sm 40 · md 64 · lg 96 · 160 px">
        <div className="flex flex-wrap items-end gap-6">
          {(Object.keys(IGRA_ART_SIZES) as Array<keyof typeof IGRA_ART_SIZES>).map((size) => (
            <IgraArt key={size} id="lik.robi.mase" size={size} locale={locale} />
          ))}
          <IgraArt id="lik.robi.mase" size={160} locale={locale} />
        </div>
      </Section>

      <Section
        title="Fallback"
        note={t(locale, "Šta stoji dok slika ne stigne ili ako fajl fali: ista kutija, bez slomljene slike.", "What shows until an image arrives or when the file is missing: same box, never a broken image.")}
      >
        <ul className="flex flex-wrap items-end gap-5">
          {FALLBACK_SAMPLES.map((id) => (
            <li key={id} className="w-24">
              <span className="relative block aspect-square w-24">
                <IgraArtFallback id={id} />
              </span>
              <Caption>{id}</Caption>
            </li>
          ))}
          <li className="w-24">
            <span className="relative block aspect-square w-24">
              <IgraArtFallback id="bedz.niz-7" locked />
            </span>
            <Caption>bedz.niz-7 · locked</Caption>
          </li>
          <li className="w-24">
            <IgraArt id="prazno.galerija" size="lg" locale={locale} />
            <Caption>
              prazno.galerija
              {igraArtRenderable(igraArt("prazno.galerija")) ? null : ` · ${t(locale, "planirana", "planned")}`}
            </Caption>
          </li>
          <li className="w-60">
            <span className="paper-island surface-media relative block aspect-[3/2] w-60 overflow-hidden">
              <IgraArtFallback id="scena.zajednica" />
            </span>
            <Caption>scena.* / baner.*</Caption>
          </li>
        </ul>
      </Section>

      <p className="type-body-sm font-black text-ink" role="status">
        {t(locale, `Manifest: ${ready} od ${ids.length} slika je spremno.`, `Manifest: ${ready} of ${ids.length} images are ready.`)}
      </p>

      {byKind.map((group) => {
        const sticker = isIgraSticker(group.kind);
        return (
          <Section key={group.kind} title={`${KIND_TITLE[group.kind][locale]} · ${group.ids.length}`}>
            <ul className={cn("grid gap-4", sticker ? "grid-cols-3 sm:grid-cols-5 lg:grid-cols-8" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3")}>
              {group.ids.map((id) => {
                const info = igraArt(id);
                return (
                  <li key={id} className="min-w-0">
                    <IgraArt id={id} size={sticker ? "lg" : "hero"} locale={locale} className={sticker ? undefined : "surface-media"} />
                    <Caption>
                      {id}
                      {igraArtRenderable(info) ? null : ` · ${t(locale, "čeka", "pending")}`}
                    </Caption>
                  </li>
                );
              })}
            </ul>
          </Section>
        );
      })}
    </div>
  );
}

"use client";

import Image from "next/image";
import { useSyncExternalStore, type ReactNode } from "react";

import { MarkerHighlight } from "@/components/marketing/marker-highlight";
import { HandUnderline, LinkButton } from "@/components/ui/primitives";

/**
 * Hero javnih PODstrana (N7) — isti jezik kao hero landinga (krem full-bleed podloga,
 * tekst levo u centriranom `max-w-7xl` kontejneru, vizual desno, ivice maskirane), ali
 * NIŽI: `62svh` umesto `100svh`, jer odmah ispod njega počinje sadržaj strane. Ispod
 * heroja nema talasa — granica je ista mastilo linija kao na landingu i Studiju.
 *
 * CENTRIRANJE (isto pravilo kao N3, ali bez ijednog media upita na odnos ekrana):
 * vizual sedi u kutiji koja je ISTI centrirani `max-w-7xl` kontejner u kom je i tekst i
 * poravnat je uz njenu DESNU ivicu — pa je krem višak IZVAN kontejnera jednak levo i
 * desno na širokim ekranima, a leva trećina ostaje tekstu. Sam vizual je „contain" preko
 * `max-w-full max-h-full` (pravila za zamenjene elemente), pa se nikad ne kropuje ni
 * razvlači i ne mora da zna visinu sekcije. Ispod `lg` vizuala nema (vidi komentar uz
 * kutiju medija): tamo nema leve kolone u koju bi tekst stao.
 *
 * MEDIJ JE OPCION i degradira graciozno, jer poster/loop za neku stranu možda još ne
 * postoje (pozivalac ih proverava `existingPublicPath` iz `lib/public-media.ts`):
 *   · poster + mp4 → `<video>` sa posterom (autoplay/muted/loop/playsinline, `preload="none"`);
 *   · samo poster → mirna slika;
 *   · ništa → samo krem podloga. Nikad `<video>` ni `<img>` bez izvora.
 * `prefers-reduced-motion` ILI data-saver (`saveData`) uvek pada na poster (isti obrazac
 * i isti `useSyncExternalStore` ugovor kao `hero-loop.tsx`: server snapshot je `false`,
 * pa nema hydration nesklada).
 */

type NetworkInfo = EventTarget & { saveData?: boolean };

function getConnection(): NetworkInfo | undefined {
  return (navigator as Navigator & { connection?: NetworkInfo }).connection;
}

function subscribe(onChange: () => void): () => void {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  const connection = getConnection();
  query.addEventListener("change", onChange);
  connection?.addEventListener?.("change", onChange);
  return () => {
    query.removeEventListener("change", onChange);
    connection?.removeEventListener?.("change", onChange);
  };
}

function getSnapshot(): boolean {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  return reduce || Boolean(getConnection()?.saveData);
}

function getServerSnapshot(): boolean {
  return false;
}

export type PageHeroCta = {
  label: string;
  href: string;
  tone?: "yellow" | "paper";
  icon?: ReactNode;
};

const MEDIA_CLASS = "hero-cover-mask h-auto max-h-full w-auto max-w-full";

/** Prag desktop videa (= lg): ispod njega telefon vidi statičnu portret sliku i NIJEDAN
 *  `<source>` ne pogađa, pa se video konekcija nikad ne otvori (Network: samo .avif). */
const DESKTOP_MEDIA = "(min-width: 1024px)";

function PageHeroMedia({
  posterSrc,
  webmSrc,
  mp4Src,
  label,
  width,
  height,
  /** Kad je zadato, `<source>`-ovi nose ovaj media upit — telefon ne skida video. */
  sourceMedia,
}: {
  posterSrc?: string;
  webmSrc?: string;
  mp4Src?: string;
  label: string;
  width: number;
  height: number;
  sourceMedia?: string;
}) {
  const stillOnly = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  if (mp4Src && !stillOnly) {
    return (
      <video
        className={MEDIA_CLASS}
        width={width}
        height={height}
        autoPlay
        muted
        loop
        playsInline
        preload="none"
        poster={posterSrc}
        aria-label={label}
      >
        {webmSrc ? <source src={webmSrc} type="video/webm" media={sourceMedia} /> : null}
        <source src={mp4Src} type="video/mp4" media={sourceMedia} />
      </video>
    );
  }

  if (!posterSrc) return null;

  return (
    <Image
      src={posterSrc}
      alt={label}
      width={width}
      height={height}
      sizes="(min-width: 1024px) 80rem, 100vw"
      className={MEDIA_CLASS}
      priority
    />
  );
}

export function PageHero({
  titleLead,
  titleHighlight,
  underline = false,
  subtitle,
  ctas = [],
  mediaLabel,
  posterSrc,
  webmSrc,
  mp4Src,
  mediaWidth = 1920,
  mediaHeight = 1072,
  portraitSrc,
  bg = "var(--hero-paper)",
  children,
}: {
  /** Ceo naslov kad nema markera; inače deo pre markera. */
  titleLead: string;
  /** Ključna fraza pod marker potezom (isti obrazac kao naslovi sekcija). */
  titleHighlight?: string;
  /** Školski žuti potez ispod naslova — alternativa markeru (Studio hero). */
  underline?: boolean;
  subtitle?: string;
  /** Do dva CTA; prvi je primarni (žut), drugi sekundarni (papir). */
  ctas?: PageHeroCta[];
  /** Opis vizuala za čitač ekrana; obavezan samo kad medij postoji. */
  mediaLabel?: string;
  posterSrc?: string;
  /** WebM izvor (ide PRE mp4). Zajedno sa `portraitSrc` uključuje N-hero obrazac:
   *  desktop video sa `<source media>` gejtom, telefon statična portret slika. */
  webmSrc?: string;
  mp4Src?: string;
  /** Prirodne dimenzije medija — drže odnos pre učitavanja (bez CLS-a). */
  mediaWidth?: number;
  mediaHeight?: number;
  /** Statična portret slika za telefon (< lg). Kad postoji, desktop video se skida samo
   *  od lg naviše (`<source media>`), pa telefon u mreži vidi samo .avif — nikad .mp4/.webm. */
  portraitSrc?: string;
  /** Krem ton podloge; podrazumevano token heroja. Prosleđuje se kad je izmerena
   *  boja ivica konkretnog videa drugačija, da spoj ostane bešavan. */
  bg?: string;
  /** Dodatni red ispod CTA (npr. bonus napomena na Studiju). */
  children?: ReactNode;
}) {
  const hasMedia = Boolean(posterSrc || mp4Src);

  return (
    <section
      data-motion="hero"
      style={{ backgroundColor: bg }}
      className="page-hero hero-paper-island relative flex items-center overflow-hidden border-b-2 border-ink"
    >
      {hasMedia ? (
        <>
          {/* Telefon (< lg): statična portret slika kao pozadina heroja. Postoji SAMO kad je
              `portraitSrc` zadat; video ispod je gejtovan `<source media>`-om na lg naviše, pa
              telefon nikad ne otvori video konekciju (Network: samo .avif). Krem scrim s leve/donje
              strane drži kontrast teksta preko ilustracije. */}
          {portraitSrc ? (
            <div className="absolute inset-0 z-0 lg:hidden" aria-hidden="true">
              <Image src={portraitSrc} alt="" fill sizes="100vw" className="object-cover" priority />
              {/* Blag krem sloj odozgo — drži kontrast naslova/podnaslova (dark ink) preko
                  gornjeg dela ilustracije; ilustracija ispod ostaje čista. */}
              <div
                className="absolute inset-0"
                style={{
                  background:
                    "linear-gradient(to bottom, var(--hero-paper) 10%, color-mix(in srgb, var(--hero-paper) 55%, transparent) 34%, transparent 52%)",
                }}
              />
            </div>
          ) : null}
          {/* Kutija vizuala: isti centrirani `max-w-7xl` kontejner kao tekst, vizual uz
              njenu desnu ivicu. SAMO od `lg` — vizuali su crtani sa praznom levom trećinom
              za tekst, a na užem ekranu se skupe u nisku traku preko koje bi tekst pao na
              ilustrovani deo (kontrast ispod 4.5:1). */}
          <div className="absolute inset-0 z-0 hidden items-center justify-end lg:left-1/2 lg:right-auto lg:flex lg:w-full lg:max-w-7xl lg:-translate-x-1/2">
            <PageHeroMedia
              posterSrc={posterSrc}
              webmSrc={webmSrc}
              mp4Src={mp4Src}
              label={mediaLabel ?? ""}
              width={mediaWidth}
              height={mediaHeight}
              sourceMedia={portraitSrc ? DESKTOP_MEDIA : undefined}
            />
          </div>
        </>
      ) : null}

      <div className="relative z-20 mx-auto w-full max-w-7xl px-4 pb-12 pt-20 sm:px-6 lg:px-8">
        <div className="max-w-md xl:max-w-lg" data-motion="copy">
          <h1 className="text-balance text-4xl font-black leading-[1.03] text-ink sm:text-5xl lg:text-6xl">
            {titleLead}
            {titleHighlight ? <MarkerHighlight>{titleHighlight}</MarkerHighlight> : null}
          </h1>
          {underline ? <HandUnderline className="mt-4" /> : null}
          {subtitle ? (
            <p className="mt-5 text-lg font-bold leading-8 text-muted">{subtitle}</p>
          ) : null}
          {ctas.length ? (
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              {ctas.map((cta, index) => (
                <LinkButton
                  key={cta.href}
                  href={cta.href}
                  tone={cta.tone ?? (index === 0 ? "yellow" : "paper")}
                  size="lg"
                  className="w-full sm:w-auto"
                >
                  {cta.icon}
                  {cta.label}
                </LinkButton>
              ))}
            </div>
          ) : null}
          {children}
        </div>
      </div>
    </section>
  );
}

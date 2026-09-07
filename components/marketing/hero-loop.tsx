"use client";

import Image from "next/image";
import { useEffect, useRef, useSyncExternalStore, type CSSProperties } from "react";

/**
 * Hero video petlja. Podrazumevano se renderuje `<video>` (autoplay/muted/loop/playsinline,
 * `preload="none"` + poster, pa se ništa teško ne skida do reprodukcije). Uz
 * `prefers-reduced-motion` ILI data-saver (`navigator.connection.saveData`) prelazi na
 * mirnu fallback sliku.
 *
 * Src-ovi idu kroz props (podrazumevano marketing home hero) da bi ista komponenta
 * mogla da nosi drugi loop na drugim javnim stranicama (npr. Studio).
 *
 * `variant`:
 *   - "panel" (podrazumevano): uramljen 16/9 vizual (mastilo okvir, `surface-media`).
 *   - "cover": ceo vizual je UVEK vidljiv (fit-by-height, contain — NIKAD krop).
 *     Visina vizuala = visina hero sekcije; prazan prostor sa strana (jer ekran nije
 *     16:9) je `bg` boja, a mask fade-uje sve 4 ivice u transparentno pa se stapaju u
 *     tu istu boju — bešavno, bez ijedne vidljive linije. Desktop (lg+): poravnat desno
 *     (leva trećina prazna za tekst); ispod lg: centriran. Roditelj mora biti `relative`
 *     (ili sam apsolutni sloj) i držati visinu.
 *
 * `portrait` (L3.1, samo `cover`): drugi, portret asset za `(orientation: portrait)`.
 *   JEDAN `<video>` sa 4 `<source media>` — pretraživač skida samo izvor čiji media upit
 *   važi (portret: `(orientation: portrait)`; landscape: `(orientation: landscape) and
 *   (min-width: 1024px)`, pa landscape telefon ne skida NIJEDAN video i vidi samo poster).
 *   Poster ne ide kroz `poster` atribut (ne ume po orijentaciji) nego kao CSS pozadina
 *   videa (`--hero-poster-*`, bira globals.css), a `<link rel="preload" media fetchpriority="high">`
 *   ga i dalje najavljuje rano za LCP (Lighthouse: poster je LCP element, otkriven u HTML-u). Rotacija: `video.load()` ponovo bira izvor. Reduced-motion
 *   grana je `<picture>` sa istim media upitom (Next „art direction" preko `getImageProps`).
 *
 * `useSyncExternalStore` čita okruženje bez `setState`-a u efektu: server snapshot je uvek
 * `false` (SSR renderuje video, isto kao prvi klijentski kadar → nema hydration nesklada),
 * a klijent se pretplati na promenu reduced-motion / mrežnog stanja.
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

/** L3.1 → portret landinga je STATIČNA slika (nema videa u portretu: telefon ne otvara
 *  nijednu video konekciju). Landscape ostaje video + 3D kartice. */
export type HeroPortraitSources = {
  src: string;
  width: number;
  height: number;
};

const PORTRAIT_MEDIA = "(orientation: portrait)";
const LANDSCAPE_MEDIA = "(orientation: landscape) and (min-width: 1024px)";

export function HeroLoop({
  label,
  // Hero (L3, stari loop — življa petlja): video + poster su 1928×1076; poster je webp i ide
  // direktno u `<video poster>` (ne kroz next/image). Fallback `hero.png` je 2752×1536 — ista
  // kompozicija, odnos 1.7917 ≈ 1.7918.
  webmSrc = "/images/landing/hero-loop.webm",
  mp4Src = "/images/landing/hero-loop.mp4",
  posterSrc = "/images/landing/hero-poster.webp",
  fallbackSrc = "/images/landing/hero.png",
  portrait,
  variant = "panel",
  bg = "#F8EDD8",
}: {
  label: string;
  webmSrc?: string;
  mp4Src?: string;
  posterSrc?: string;
  fallbackSrc?: string;
  /** Portret asset (L3.1) — samo uz `variant="cover"`. */
  portrait?: HeroPortraitSources;
  variant?: "panel" | "cover";
  /** Hex pozadine (izmerena prosečna boja ivičnih piksela videa) — puni prazan
   *  prostor sa strana i backuje mask fade, pa je spoj bešavan. Samo `cover`. */
  bg?: string;
}) {
  const stillOnly = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Rotacija: `<source media>` se bira samo pri učitavanju, pa promena orijentacije mora
  // ponovo da pokrene izbor izvora (`load()`), inače bi na rotiranom tabletu ostao stari video.
  useEffect(() => {
    if (!portrait) return;
    const query = window.matchMedia(PORTRAIT_MEDIA);
    const reload = () => {
      const video = videoRef.current;
      if (!video) return;
      video.load();
      void video.play().catch(() => {});
    };
    query.addEventListener("change", reload);
    return () => query.removeEventListener("change", reload);
  }, [portrait]);

  if (variant === "cover") {
    // `.hero-cover-media` (globals.css): ceo vizual pune visine (100vh) desno na
    // desktopu, a na uskim ekranima contain (letterbox u bg boji) — NIKAD krop ni
    // distorzija; element == sadržaj pa se `.hero-cover-mask` fade poklapa sa ivicama.
    // Sloj 3D kartica (`HeroCards3d`) nosi ISTU klasu u ISTOM roditelju, pa se
    // normalizovane koordinate ploča poklapaju sa pikselima videa na svakoj rezoluciji.
    // L3.1: PORTRET je statična slika (`.hero-cover-portrait`, vidljiva samo u portretu),
    // a LANDSCAPE video/mirna slika (`.hero-cover-landscape`, skrivena u portretu) nosi
    // `<source media>` gejt — na telefonu u portretu se nijedan video izvor ne pogađa.
    const dual = portrait ? "" : undefined;
    const posterVars: CSSProperties | undefined = portrait
      ? ({ "--hero-poster-landscape": `url("${posterSrc}")` } as CSSProperties)
      : undefined;

    return (
      <div className="absolute inset-0" style={{ backgroundColor: bg }}>
        {portrait ? (
          <>
            <link rel="preload" as="image" href={portrait.src} media={PORTRAIT_MEDIA} fetchPriority="high" />
            <link rel="preload" as="image" href={posterSrc} media={LANDSCAPE_MEDIA} fetchPriority="high" />
            {/* Portret: statična slika, jedini LCP element na telefonu. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={portrait.src}
              alt={label}
              width={portrait.width}
              height={portrait.height}
              className="hero-cover-media hero-cover-mask hero-cover-portrait"
            />
          </>
        ) : null}
        {stillOnly ? (
          <Image
            src={fallbackSrc}
            alt={label}
            width={2752}
            height={1536}
            sizes="100vw"
            className={`hero-cover-media hero-cover-mask${portrait ? " hero-cover-landscape" : ""}`}
            priority
          />
        ) : (
          <video
            ref={videoRef}
            className={`hero-cover-media hero-cover-mask hero-cover-video${portrait ? " hero-cover-landscape" : ""}`}
            data-dual={dual}
            style={posterVars}
            autoPlay
            muted
            loop
            playsInline
            preload="none"
            poster={portrait ? undefined : posterSrc}
            aria-label={label}
          >
            {portrait ? (
              <>
                <source src={mp4Src} type="video/mp4" media={LANDSCAPE_MEDIA} />
                <source src={webmSrc} type="video/webm" media={LANDSCAPE_MEDIA} />
              </>
            ) : (
              <>
                <source src={mp4Src} type="video/mp4" />
                <source src={webmSrc} type="video/webm" />
              </>
            )}
          </video>
        )}
      </div>
    );
  }

  return (
    <div className="relative aspect-[16/9] overflow-hidden rounded-[8px] border-2 border-ink bg-paper">
      {stillOnly ? (
        <Image
          src={fallbackSrc}
          alt={label}
          fill
          sizes="(min-width: 1024px) 44vw, 100vw"
          className="object-cover"
          priority
        />
      ) : (
        <video
          className="h-full w-full object-cover"
          autoPlay
          muted
          loop
          playsInline
          preload="none"
          poster={posterSrc}
          aria-label={label}
        >
          <source src={mp4Src} type="video/mp4" />
          <source src={webmSrc} type="video/webm" />
        </video>
      )}
    </div>
  );
}

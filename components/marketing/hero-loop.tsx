"use client";

import Image, { getImageProps } from "next/image";
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

export type HeroPortraitSources = {
  webmSrc: string;
  mp4Src: string;
  posterSrc: string;
  fallbackSrc: string;
  width: number;
  height: number;
};

const PORTRAIT_MEDIA = "(orientation: portrait)";
const LANDSCAPE_MEDIA = "(orientation: landscape) and (min-width: 1024px)";

export function HeroLoop({
  label,
  // Hero v2 (L3): video + poster su 1920×1072 (24 fps, prvi = poslednji frejm, sveska
  // statična); poster je webp i ide direktno u `<video poster>` (ne kroz next/image).
  // Fallback `hero-v2.png` je 2752×1536 — ista kompozicija, odnos 1.7917 ≈ 1.7910.
  webmSrc = "/images/landing/hero-v2-loop.webm",
  mp4Src = "/images/landing/hero-v2-loop.mp4",
  posterSrc = "/images/landing/hero-v2-poster.webp",
  fallbackSrc = "/images/landing/hero-v2.png",
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
    const dual = portrait ? "" : undefined;
    const posterVars: CSSProperties | undefined = portrait
      ? ({
          "--hero-poster-landscape": `url("${posterSrc}")`,
          "--hero-poster-portrait": `url("${portrait.posterSrc}")`,
        } as CSSProperties)
      : undefined;

    return (
      <div className="absolute inset-0" style={{ backgroundColor: bg }}>
        {portrait ? (
          <>
            <link rel="preload" as="image" href={portrait.posterSrc} media={PORTRAIT_MEDIA} fetchPriority="high" />
            <link rel="preload" as="image" href={posterSrc} media={LANDSCAPE_MEDIA} fetchPriority="high" />
          </>
        ) : null}
        {stillOnly ? (
          portrait ? (
            <CoverStill
              label={label}
              landscapeSrc={fallbackSrc}
              portraitSrc={portrait.fallbackSrc}
              portraitWidth={portrait.width}
              portraitHeight={portrait.height}
            />
          ) : (
            <Image
              src={fallbackSrc}
              alt={label}
              width={2752}
              height={1536}
              sizes="100vw"
              className="hero-cover-media hero-cover-mask"
              priority
            />
          )
        ) : (
          <video
            ref={videoRef}
            className="hero-cover-media hero-cover-mask hero-cover-video"
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
                <source src={portrait.webmSrc} type="video/webm" media={PORTRAIT_MEDIA} />
                <source src={portrait.mp4Src} type="video/mp4" media={PORTRAIT_MEDIA} />
                <source src={webmSrc} type="video/webm" media={LANDSCAPE_MEDIA} />
                <source src={mp4Src} type="video/mp4" media={LANDSCAPE_MEDIA} />
              </>
            ) : (
              <>
                <source src={webmSrc} type="video/webm" />
                <source src={mp4Src} type="video/mp4" />
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
          <source src={webmSrc} type="video/webm" />
          <source src={mp4Src} type="video/mp4" />
        </video>
      )}
    </div>
  );
}

/** Mirna slika (reduced-motion / data-saver) sa art-direction po orijentaciji. */
function CoverStill({
  label,
  landscapeSrc,
  portraitSrc,
  portraitWidth,
  portraitHeight,
}: {
  label: string;
  landscapeSrc: string;
  portraitSrc: string;
  portraitWidth: number;
  portraitHeight: number;
}) {
  const common = { alt: label, sizes: "100vw", priority: true };
  const {
    props: { srcSet: portraitSrcSet },
  } = getImageProps({ ...common, src: portraitSrc, width: portraitWidth, height: portraitHeight });
  const {
    props: { srcSet: landscapeSrcSet, ...rest },
  } = getImageProps({ ...common, src: landscapeSrc, width: 2752, height: 1536 });
  return (
    <picture>
      <source media={PORTRAIT_MEDIA} srcSet={portraitSrcSet} />
      <source srcSet={landscapeSrcSet} />
      <img {...rest} alt={label} className="hero-cover-media hero-cover-mask" data-dual="" />
    </picture>
  );
}

"use client";

import Image from "next/image";
import { useSyncExternalStore, type CSSProperties } from "react";

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
 * `useSyncExternalStore` čita okruženje bez `setState`-a u efektu: server snapshot je uvek
 * `false` (SSR renderuje video, isto kao prvi klijentski kadar → nema hydration nesklada),
 * a klijent se pretplati na promenu reduced-motion / mrežnog stanja.
 */

/**
 * Mask koji fade-uje sve 4 ivice vizuala u transparentno (→ ista `bg` boja iza),
 * pa se ton videa stapa u pozadinu čak i ako se po frejmu minimalno razlikuje.
 * `intersect` (WebKit: `source-in`) ukršta horizontalni i vertikalni gradijent.
 */
const EDGE_MASK =
  "linear-gradient(to right, transparent 0%, black 7%, black 93%, transparent 100%), linear-gradient(to bottom, transparent 0%, black 7%, black 93%, transparent 100%)";

const edgeMaskStyle: CSSProperties = {
  WebkitMaskImage: EDGE_MASK,
  maskImage: EDGE_MASK,
  WebkitMaskComposite: "source-in",
  maskComposite: "intersect",
  WebkitMaskRepeat: "no-repeat",
  maskRepeat: "no-repeat",
};

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

export function HeroLoop({
  label,
  // Hero v2 (L3): video + poster su 1920×1072 (24 fps, prvi = poslednji frejm, sveska
  // statična); poster je webp i ide direktno u `<video poster>` (ne kroz next/image).
  // Fallback `hero-v2.png` je 2752×1536 — ista kompozicija, odnos 1.7917 ≈ 1.7910.
  webmSrc = "/images/landing/hero-v2-loop.webm",
  mp4Src = "/images/landing/hero-v2-loop.mp4",
  posterSrc = "/images/landing/hero-v2-poster.webp",
  fallbackSrc = "/images/landing/hero-v2.png",
  variant = "panel",
  bg = "#F8EDD8",
}: {
  label: string;
  webmSrc?: string;
  mp4Src?: string;
  posterSrc?: string;
  fallbackSrc?: string;
  variant?: "panel" | "cover";
  /** Hex pozadine (izmerena prosečna boja ivičnih piksela videa) — puni prazan
   *  prostor sa strana i backuje mask fade, pa je spoj bešavan. Samo `cover`. */
  bg?: string;
}) {
  const stillOnly = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  if (variant === "cover") {
    // `.hero-cover-media` (globals.css): ceo vizual pune visine (100vh) desno na
    // desktopu, a na uskim ekranima contain (letterbox u bg boji) — NIKAD krop ni
    // distorzija; element == sadržaj pa se `edgeMaskStyle` fade poklapa sa ivicama.
    // Sloj 3D kartica (`HeroCards3d`) nosi ISTU klasu u ISTOM roditelju, pa se
    // normalizovane koordinate ploča poklapaju sa pikselima videa na svakoj rezoluciji.
    return (
      <div className="absolute inset-0" style={{ backgroundColor: bg }}>
        {stillOnly ? (
          <Image
            src={fallbackSrc}
            alt={label}
            width={2752}
            height={1536}
            sizes="100vw"
            className="hero-cover-media"
            style={edgeMaskStyle}
            priority
          />
        ) : (
          <video
            className="hero-cover-media"
            style={edgeMaskStyle}
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

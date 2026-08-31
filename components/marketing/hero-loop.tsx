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
  webmSrc = "/images/landing/hero-loop.webm",
  mp4Src = "/images/landing/hero-loop.mp4",
  posterSrc = "/images/landing/hero-poster.png",
  fallbackSrc = "/images/landing/hero.png",
  variant = "panel",
  bg = "#F8EDD8",
  fill = false,
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
  /** `cover` na desktopu: `false` (podrazumevano) = fit-by-height uz contain,
   *  poravnat desno. `true` = video puni PUNU visinu sekcije (100svh) i centriran
   *  je; prazan prostor levo/desno je `bg` boja. Roditelj mora biti `overflow-hidden`. */
  fill?: boolean;
}) {
  const stillOnly = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  if (variant === "cover") {
    // Mobilni (u aspect-boxu): `h-full w-auto max-w-full` = ceo video, sitan
    // letterbox u bg boji. Desktop (lg):
    //   - fill: `lg:max-w-none` skida cap → video je PUNE visine (100svh), centriran;
    //     višak po širini nevidljivo klipuje `overflow-hidden` roditelj, prazne
    //     strane su `bg` boja. Mask fade-uje ivice → bešavno.
    //   - default: `lg:right-0` poravna desno (leva trećina prazna za tekst),
    //     `max-w-full` čuva contain (NIKAD krop).
    const boxClass = fill
      ? // `lg:left-1/2 -translate-x-1/2` centrira i kad je širi od ekrana (m-auto
        // ne centrira preširok element) — `overflow-hidden` roditelj klipuje višak.
        "absolute inset-0 m-auto h-full w-auto max-w-full lg:right-auto lg:left-1/2 lg:m-0 lg:max-w-none lg:-translate-x-1/2"
      : "absolute inset-0 m-auto h-full w-auto max-w-full lg:left-auto lg:right-0";
    return (
      <div className="absolute inset-0" style={{ backgroundColor: bg }}>
        {stillOnly ? (
          <Image
            src={fallbackSrc}
            alt={label}
            width={1600}
            height={900}
            sizes="100vw"
            className={boxClass}
            style={edgeMaskStyle}
            priority
          />
        ) : (
          <video
            className={boxClass}
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

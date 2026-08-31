"use client";

import Image from "next/image";
import { useSyncExternalStore } from "react";

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
 *   - "cover": full-bleed pozadina — vizual apsolutno prekriva roditelja (`inset-0`,
 *     `object-cover`), fokus desno-centar (desktop) / desno-dole (mobilni), bez okvira.
 *     Roditelj mora biti `relative` (ili sam apsolutni sloj) i držati visinu.
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

export function HeroLoop({
  label,
  webmSrc = "/images/landing/hero-loop.webm",
  mp4Src = "/images/landing/hero-loop.mp4",
  posterSrc = "/images/landing/hero-poster.png",
  fallbackSrc = "/images/landing/hero.png",
  variant = "panel",
}: {
  label: string;
  webmSrc?: string;
  mp4Src?: string;
  posterSrc?: string;
  fallbackSrc?: string;
  variant?: "panel" | "cover";
}) {
  const stillOnly = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  if (variant === "cover") {
    // Fokus vizuala: desno-dole na mobilnom (prazan levi/gornji prostor za tekst),
    // desno-centar od `md` naviše — isti prelom kao mobilni vertikalni scrim.
    const positionClass = "object-right-bottom md:object-right";
    return stillOnly ? (
      <Image
        src={fallbackSrc}
        alt={label}
        fill
        sizes="100vw"
        className={`object-cover ${positionClass}`}
        priority
      />
    ) : (
      <video
        className={`absolute inset-0 h-full w-full object-cover ${positionClass}`}
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

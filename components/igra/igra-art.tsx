"use client";

/* eslint-disable @next/next/no-img-element -- IGRA slike su gotovi AVIF fajlovi iz public/brand/igra sa dimenzijama iz manifesta; optimizator next/image im ne treba. */

import { useState, type ReactNode } from "react";

import { IgraFallbackIcon } from "@/components/igra/igra-fallback-icons";
import { cn } from "@/components/ui/primitives";
import {
  igraArt,
  igraArtAlt,
  igraArtFallbackShape,
  igraArtRenderable,
  igraArtWidth,
  igraNivoOf,
  isIgraSticker,
  type IgraArtId,
  type IgraArtSize,
} from "@/lib/igra-art";
import type { Locale } from "@/lib/i18n";

export type IgraArtProps = {
  id: IgraArtId;
  /** `xs` 24 · `sm` 40 · `md` 64 · `lg` 96 px, `hero` = širina roditelja, ili broj piksela. */
  size?: IgraArtSize;
  /** Samo za LCP sliku ekrana: učitava se odmah i sa visokim prioritetom. */
  priority?: boolean;
  /** Silueta (zaključan bedž). */
  locked?: boolean;
  fit?: "contain" | "cover";
  /** Zamena za podrazumevani fallback. */
  fallback?: ReactNode;
  className?: string;
} & (
  | { decorative: true; locale?: Locale; alt?: never }
  | { decorative?: false; locale: Locale; alt?: string }
);

/**
 * Jedini način da se IGRA slika nađe na ekranu (K02). Kutija ima širinu i odnos strana
 * iz manifesta pre nego što slika stigne, pa ni spora slika ni fallback ne pomeraju
 * layout. Slika koja nije spremna (`ready: false`), planirana slika i slika čiji fajl
 * fali (404) crtaju isti miran fallback - nikad slomljenu sliku.
 */
export function IgraArt({ id, size, priority = false, locked = false, fit, fallback, className, decorative, locale, alt }: IgraArtProps) {
  const info = igraArt(id);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const src = info.src;
  // Greška koja se desila PRE hidratacije ne okida `onError`; slika je tada već `complete`.
  const checkLoaded = (img: HTMLImageElement | null) => {
    if (img && img.complete && img.naturalWidth === 0) setFailedSrc(src);
  };

  const sticker = isIgraSticker(info.kind);
  const width = igraArtWidth(size, info.kind);
  const showImage = igraArtRenderable(info) && failedSrc !== src;
  const label = decorative || !locale ? undefined : (alt ?? igraArtAlt(info, locale));

  return (
    <span
      data-igra-art={info.id}
      role={!showImage && label ? "img" : undefined}
      aria-label={!showImage ? label : undefined}
      aria-hidden={decorative ? true : undefined}
      className={cn(
        "relative shrink-0",
        width === null ? "block w-full" : "inline-block align-middle",
        // Scena i baner su list papira: svetlo ostrvo i u tamnoj temi.
        !sticker && "paper-island overflow-hidden",
        className,
      )}
      style={{ width: width ?? undefined, aspectRatio: `${info.w} / ${info.h}` }}
    >
      {showImage ? (
        <img
          ref={checkLoaded}
          src={src}
          width={info.w}
          height={info.h}
          alt={label ?? ""}
          loading={priority ? "eager" : "lazy"}
          decoding={priority ? undefined : "async"}
          fetchPriority={priority ? "high" : undefined}
          draggable={false}
          data-locked={locked ? "true" : undefined}
          onError={() => setFailedSrc(src)}
          className={cn("absolute inset-0 size-full", (fit ?? (sticker ? "contain" : "cover")) === "cover" ? "object-cover" : "object-contain", sticker && "igra-sticker")}
        />
      ) : (
        (fallback ?? <IgraArtFallback id={id} locked={locked} />)
      )}
    </span>
  );
}

/**
 * Ono što stoji u kutiji dok slike nema: krem krug sa ikonom (nalepnice), krug sa brojem
 * (nivo) ili list papira sa mrežom (scene i baneri). Uvek dekorativno - naziv nosi kutija.
 */
export function IgraArtFallback({ id, locked = false }: { id: IgraArtId; locked?: boolean }) {
  const info = igraArt(id);
  const shape = igraArtFallbackShape(info.kind);

  if (shape === "paper") {
    return <span aria-hidden="true" className="absolute inset-0 bg-surface-b sketch-grid" />;
  }

  const level = igraNivoOf(info.id);
  return (
    <span
      aria-hidden="true"
      data-locked={locked ? "true" : undefined}
      className={cn(
        "igra-sticker absolute inset-[6%] grid place-items-center rounded-full bg-igra-sticker-edge text-ink shadow-[inset_0_0_0_1px_var(--shadow-hard-14)]",
        // Krem krug je svetlo ostrvo (mastilo na kremu u obe teme). Silueta NIJE ostrvo:
        // njen filter mora da se razreši po temi stranice, inače bi na tamnom nestala.
        !locked && "paper-island",
      )}
    >
      {shape === "level" && level !== null ? (
        <svg viewBox="0 0 100 100" className="size-full">
          <text x="50" y="52" textAnchor="middle" dominantBaseline="central" fontSize="46" fontWeight="900" fill="currentColor">
            {level}
          </text>
        </svg>
      ) : (
        <IgraFallbackIcon id={info.id} kind={info.kind} className="size-[46%]" />
      )}
    </span>
  );
}

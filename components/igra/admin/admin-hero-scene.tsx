"use client";

import { useSyncExternalStore } from "react";
import { preload } from "react-dom";

import { IgraArt } from "@/components/igra/igra-art";
import { igraArt, igraArtRenderable } from "@/lib/igra-art";

const WIDE = "(min-width: 1024px)";

function subscribe(onChange: () => void) {
  const query = window.matchMedia(WIDE);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/**
 * Scena Kontrolne sobe (K21): crta se TEK kad je ekran širok (`lg`). Lenja slika u
 * `display:none` omotaču se u Chromiumu ipak preuzima (izmereno u izlogu na 390 px), pa se
 * na telefonu `<img>` uopšte ne pravi. Server i prvi klijentski prolaz je nemaju (isti
 * snimak, bez neslaganja pri hidrataciji); kutija je apsolutna, pa dolazak slike ne pomera
 * tekst. Nije `priority`, ali je na računaru najveći element heroja (LCP kandidat), pa je
 * unapred traži `<link rel="preload">` sa `media` od `lg` naviše, kao `CommunityHero` (K28):
 * stiže iz HTML-a, a telefon je ne traži uopšte.
 */
export function AdminHeroScene() {
  const scene = igraArt("scena.kontrolna-soba");
  if (igraArtRenderable(scene)) preload(scene.src, { as: "image", fetchPriority: "high", media: WIDE });
  const wide = useSyncExternalStore(subscribe, () => window.matchMedia(WIDE).matches, () => false);
  if (!wide) return null;
  return (
    <div className="absolute inset-y-0 right-0 w-[42%]">
      <IgraArt
        id="scena.kontrolna-soba"
        size="hero"
        decorative
        className="h-full [mask-image:linear-gradient(to_right,transparent,black_18%)] [&>img]:object-right"
      />
    </div>
  );
}

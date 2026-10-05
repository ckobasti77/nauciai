"use client";

import { useEffect, useState } from "react";

import { loadSticker } from "@/components/crea/editor/assets";

/** Slike nalepnica koje montaža koristi (učitane jednom, isti origin - platno ostaje čisto). */
export function useStickerImages(ids: readonly string[]): ReadonlyMap<string, HTMLImageElement> {
  const [images, setImages] = useState<ReadonlyMap<string, HTMLImageElement>>(() => new Map());
  const key = [...new Set(ids)].sort().join(",");
  useEffect(() => {
    let alive = true;
    for (const id of key ? key.split(",") : []) {
      void loadSticker(id)
        .then((image) => {
          if (alive) setImages((current) => (current.has(id) ? current : new Map(current).set(id, image)));
        })
        .catch(() => undefined);
    }
    return () => {
      alive = false;
    };
  }, [key]);
  return images;
}

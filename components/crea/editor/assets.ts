"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { looksLikeHeic } from "@/lib/crea-image-format";
import { CreaLocalAiError } from "@/lib/crea-local-ai/errors";
import { stickerUrl } from "@/lib/crea-stickers";

/**
 * Slike u editoru (S28/S29, K10). Scena pamti samo id (`slika-3`); ovde je
 * sam fajl: smanjen `ImageBitmap` za crtanje i `blob:` URL za sličice u
 * panelima. Ništa ne ide na server - sve ostaje u memoriji strane.
 */

/** Duža stranica slike u editoru: dovoljno za oštar izvoz 2× (2160 px), a štedi memoriju telefona. */
const ASSET_MAX_SIDE = 3072;

export type EditorAsset = {
  id: string;
  name: string;
  /** `blob:` URL originala - za sličice u panelima. */
  url: string;
  width: number;
  height: number;
  bitmap: ImageBitmap;
};

async function toAsset(id: string, file: File): Promise<EditorAsset> {
  let ready: Blob = file;
  if (looksLikeHeic(file.name, file.type)) {
    const { heicToJpeg } = await import("@/components/crea/tools/heic");
    ready = await heicToJpeg(file);
  } else if (!file.type.startsWith("image/")) {
    throw new CreaLocalAiError("BAD_INPUT");
  }
  let probe: ImageBitmap;
  try {
    probe = await createImageBitmap(ready, { imageOrientation: "from-image" });
  } catch (error) {
    throw new CreaLocalAiError("BAD_INPUT", error);
  }
  const scale = Math.min(1, ASSET_MAX_SIDE / Math.max(probe.width, probe.height));
  let bitmap = probe;
  if (scale < 1) {
    bitmap = await createImageBitmap(probe, {
      resizeWidth: Math.max(1, Math.round(probe.width * scale)),
      resizeHeight: Math.max(1, Math.round(probe.height * scale)),
      resizeQuality: "high",
    });
    probe.close();
  }
  return { id, name: file.name, url: URL.createObjectURL(ready), width: bitmap.width, height: bitmap.height, bitmap };
}

export function useEditorAssets() {
  const [assets, setAssets] = useState<ReadonlyMap<string, EditorAsset>>(() => new Map());
  const counter = useRef(0);
  const owned = useRef<EditorAsset[]>([]);

  // Sve što je editor napravio oslobađa se kad se alat zatvori (i fotke koje su posle poništene).
  useEffect(
    () => () => {
      for (const asset of owned.current) {
        URL.revokeObjectURL(asset.url);
        asset.bitmap.close();
      }
      owned.current = [];
    },
    [],
  );

  /** Fajlovi → slike u editoru; ono što nije slika se preskače. Vraća nove slike redom. */
  const addFiles = useCallback(async (files: readonly File[]): Promise<EditorAsset[]> => {
    const added: EditorAsset[] = [];
    for (const file of files) {
      counter.current += 1;
      const asset = await toAsset(`slika-${counter.current}`, file).catch(() => null);
      if (asset) added.push(asset);
    }
    if (added.length > 0) {
      owned.current.push(...added);
      setAssets((current) => {
        const next = new Map(current);
        for (const asset of added) next.set(asset.id, asset);
        return next;
      });
    }
    return added;
  }, []);

  return { assets, addFiles };
}

// ── Nalepnice ───────────────────────────────────────────────────────────────

const stickers = new Map<string, Promise<HTMLImageElement>>();

/**
 * Nalepnica kao slika za platno. SVG ima prirodnu veličinu 32 px, a Safari ga
 * na platnu crta u toj veličini pa razvuče (mutno) - zato se pre učitavanja
 * veličina u SVG-u podigne na 512 px. Fajl je naš (isti origin), pa platno ostaje čisto.
 */
export function loadSticker(id: string): Promise<HTMLImageElement> {
  let pending = stickers.get(id);
  if (!pending) {
    pending = fetch(stickerUrl(id))
      .then((response) => (response.ok ? response.text() : Promise.reject(new Error(String(response.status)))))
      .then(async (svg) => {
        const sized = svg.replace(/width="32" height="32"/, 'width="512" height="512"');
        const url = URL.createObjectURL(new Blob([sized], { type: "image/svg+xml" }));
        const image = new Image();
        image.src = url;
        await image.decode();
        return image;
      });
    pending.catch(() => stickers.delete(id));
    stickers.set(id, pending);
  }
  return pending;
}

export function useStickerImage(id: string): HTMLImageElement | null {
  const [loaded, setLoaded] = useState<{ id: string; image: HTMLImageElement } | null>(null);
  useEffect(() => {
    let alive = true;
    void loadSticker(id)
      .then((image) => {
        if (alive) setLoaded({ id, image });
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [id]);
  return loaded?.id === id ? loaded.image : null;
}

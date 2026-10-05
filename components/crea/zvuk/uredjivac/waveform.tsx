"use client";

import { useEffect, useRef, useState } from "react";
import type WaveSurfer from "wavesurfer.js";
import type RegionsPlugin from "wavesurfer.js/plugins/regions";
import type { Region } from "wavesurfer.js/plugins/regions";

import { THEME_ATTRIBUTE } from "@/lib/theme";

/**
 * Talas zvuka (Crea K24): `wavesurfer.js` v8 + regioni (BSD-3), učitan lenjo.
 * Prevlačenjem se bira deo (jedan izbor), a `marks` su obeležja koja se ne
 * pomeraju (rezovi transkripta, udarci ritma). Boje platna se čitaju iz tokena
 * teme (`--ink`, `--muted`) i menjaju se kad se tema promeni; obeležja su DOM,
 * pa idu kroz `color-mix` nad tokenima.
 */

export type WaveSelection = { start: number; end: number };
export type WaveMark = { id: string; start: number; end?: number; tone: "cut" | "beat" | "downbeat" };

export type WaveformHandle = {
  playPause: () => void;
  pause: () => void;
  seek: (seconds: number) => void;
  zoom: (pxPerSec: number) => void;
  media: () => HTMLMediaElement | null;
};

type Props = {
  url: string;
  label: string;
  height?: number;
  selectable?: boolean;
  selection?: WaveSelection | null;
  onSelection?: (selection: WaveSelection | null) => void;
  marks?: readonly WaveMark[];
  onReady?: (duration: number) => void;
  onTime?: (seconds: number) => void;
  onPlayChange?: (playing: boolean) => void;
  handleRef?: (handle: WaveformHandle | null) => void;
};

type Regions = InstanceType<typeof RegionsPlugin>;

const MARK_COLORS: Record<WaveMark["tone"], string> = {
  cut: "color-mix(in srgb, var(--color-red-500, #ef4444) 30%, transparent)",
  beat: "color-mix(in srgb, var(--ink) 40%, transparent)",
  downbeat: "var(--yellow)",
};
const SELECTION_COLOR = "color-mix(in srgb, var(--yellow) 40%, transparent)";
const SELECTION_ID = "izbor";

function themeColors() {
  const style = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  return { wave: read("--muted", "#536273"), progress: read("--ink", "#0e3158") };
}

export function Waveform({ url, label, height = 112, selectable = false, selection, onSelection, marks, onReady, onTime, onPlayChange, handleRef }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const waveRef = useRef<WaveSurfer | null>(null);
  const regionsRef = useRef<Regions | null>(null);
  const selectionRef = useRef<Region | null>(null);
  const [loaded, setLoaded] = useState(0);
  const callbacks = useRef({ onSelection, onReady, onTime, onPlayChange, handleRef });
  useEffect(() => {
    callbacks.current = { onSelection, onReady, onTime, onPlayChange, handleRef };
  });

  // Jedan wavesurfer po komponenti; nov `url` se samo učita u isti.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let alive = true;
    let observer: MutationObserver | null = null;
    void (async () => {
      const [{ default: WaveSurferCtor }, { default: Plugin }] = await Promise.all([import("wavesurfer.js"), import("wavesurfer.js/plugins/regions")]);
      if (!alive) return;
      const colors = themeColors();
      const regions = Plugin.create();
      const wave = WaveSurferCtor.create({
        container,
        height,
        waveColor: colors.wave,
        progressColor: colors.progress,
        cursorColor: colors.progress,
        cursorWidth: 2,
        barWidth: 2,
        barGap: 1,
        barRadius: 2,
        normalize: true,
        dragToSeek: true,
        autoScroll: true,
        plugins: [regions],
      });
      waveRef.current = wave;
      regionsRef.current = regions;
      wave.on("ready", (duration) => {
        // Regioni preživljavaju novo učitavanje: stari izbor ne važi za nov zvuk.
        for (const region of regions.getRegions()) if (region.id.startsWith(SELECTION_ID)) region.remove();
        selectionRef.current = null;
        setLoaded((count) => count + 1);
        callbacks.current.onReady?.(duration);
      });
      wave.on("timeupdate", (time) => callbacks.current.onTime?.(time));
      wave.on("play", () => callbacks.current.onPlayChange?.(true));
      wave.on("pause", () => callbacks.current.onPlayChange?.(false));
      wave.on("finish", () => callbacks.current.onPlayChange?.(false));
      if (selectable) {
        regions.enableDragSelection({ color: SELECTION_COLOR, id: SELECTION_ID });
        regions.on("region-created", (region: Region) => {
          if (!region.id.startsWith(SELECTION_ID)) return;
          // Samo jedan izbor: nov briše stari.
          if (selectionRef.current && selectionRef.current !== region) selectionRef.current.remove();
          selectionRef.current = region;
          callbacks.current.onSelection?.({ start: region.start, end: region.end });
        });
        regions.on("region-updated", (region: Region) => {
          if (region === selectionRef.current) callbacks.current.onSelection?.({ start: region.start, end: region.end });
        });
      }
      observer = new MutationObserver(() => {
        const next = themeColors();
        wave.setOptions({ waveColor: next.wave, progressColor: next.progress, cursorColor: next.progress });
      });
      observer.observe(document.documentElement, { attributes: true, attributeFilter: [THEME_ATTRIBUTE] });
      callbacks.current.handleRef?.({
        playPause: () => void wave.playPause().catch(() => undefined),
        pause: () => wave.pause(),
        seek: (seconds) => wave.setTime(seconds),
        zoom: (pxPerSec) => wave.zoom(pxPerSec),
        media: () => wave.getMediaElement(),
      });
      void wave.load(url).catch(() => undefined);
    })();
    return () => {
      alive = false;
      observer?.disconnect();
      callbacks.current.handleRef?.(null);
      waveRef.current?.destroy();
      waveRef.current = null;
      regionsRef.current = null;
      selectionRef.current = null;
    };
    // `url` učitava efekat ispod; wavesurfer se pravi jednom po visini i načinu rada.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [height, selectable]);

  useEffect(() => {
    const wave = waveRef.current;
    if (!wave) return;
    void wave.load(url).catch(() => undefined);
  }, [url]);

  // Izbor spolja (polja „od/do", „poništi izbor"), posle svakog učitavanja.
  useEffect(() => {
    const regions = regionsRef.current;
    if (!regions || !selectable || loaded === 0) return;
    const current = selectionRef.current;
    if (!selection) {
      current?.remove();
      selectionRef.current = null;
      return;
    }
    if (current && Math.abs(current.start - selection.start) < 1e-3 && Math.abs(current.end - selection.end) < 1e-3) return;
    if (current) current.setOptions({ start: selection.start, end: selection.end });
    else selectionRef.current = regions.addRegion({ id: `${SELECTION_ID}-polja`, start: selection.start, end: selection.end, color: SELECTION_COLOR });
  }, [selection, selectable, loaded]);

  // Obeležja (ne pomeraju se); izbor ostaje.
  useEffect(() => {
    const regions = regionsRef.current;
    if (!regions || loaded === 0) return;
    for (const region of regions.getRegions()) if (region.id.startsWith("oznaka-")) region.remove();
    for (const mark of marks ?? []) {
      regions.addRegion({
        id: `oznaka-${mark.id}`,
        start: mark.start,
        ...(mark.end !== undefined ? { end: mark.end } : {}),
        color: MARK_COLORS[mark.tone],
        drag: false,
        resize: false,
      });
    }
  }, [marks, loaded]);

  return <div ref={containerRef} role="img" aria-label={label} className="w-full touch-pan-y" />;
}

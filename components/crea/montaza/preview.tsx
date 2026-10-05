"use client";

import { Pause, Play, SkipBack } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { formatClock } from "@/components/crea/montaza/format";
import type { MontagePlayerControls } from "@/components/crea/montaza/use-montage-player";
import { cn } from "@/components/ui/primitives";
import { MONTAGE_COPY as T } from "@/lib/crea-montage-copy";
import { aspectRatio, type Rect01, type TimelineAspect } from "@/lib/crea-timeline";
import type { Locale } from "@/lib/i18n";

/**
 * Pregled montaže (K19): platno u tamnom medijskom bunaru (DNK: medij se smiruje
 * „bunarom", ne efektima), ispod pusti/pauza i vreme. Sigurna zona mreže se
 * crta kao sloj iznad platna (HTML), pa nikad ne ulazi u izvoz.
 */

const FOCUS = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";
/** Najveća duža stranica platna pregleda u pikselima (telefon ne crta 4K). */
const PREVIEW_MAX_PX = 1280;

export function MontagePreview({
  locale,
  player,
  aspect,
  duration,
  safeZone,
  empty,
  maxHeightVh = 56,
}: {
  locale: Locale;
  player: MontagePlayerControls;
  aspect: TimelineAspect;
  duration: number;
  safeZone: Rect01 | null;
  empty: boolean;
  maxHeightVh?: number;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [box, setBox] = useState({ width: 320, height: 568 });
  const ratio = aspectRatio(aspect);
  const { attach, resized } = player;

  useEffect(() => {
    attach(canvasRef.current);
    return () => attach(null);
  }, [attach]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const measure = () => {
      const maxHeight = (window.innerHeight * maxHeightVh) / 100;
      const width = Math.min(wrap.clientWidth, maxHeight * ratio);
      setBox({ width: Math.max(120, Math.floor(width)), height: Math.max(120, Math.floor(width / ratio)) });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(wrap);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [ratio, maxHeightVh]);

  // Pikseli platna: CSS veličina × gustina ekrana (do 2), najviše 1280 po dužoj stranici.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const density = Math.min(2, window.devicePixelRatio || 1);
    const scale = Math.min(density, PREVIEW_MAX_PX / Math.max(box.width, box.height));
    canvas.width = Math.round(box.width * scale);
    canvas.height = Math.round(box.height * scale);
    resized();
  }, [box, resized]);

  return (
    <div className="min-w-0">
      <div ref={wrapRef} className="surface-card grid place-items-center overflow-hidden bg-studio-well p-2 shadow-[inset_0_0_0_1px_var(--shadow-hard-14)]">
        <div className="relative" style={{ width: box.width, height: box.height }}>
          <canvas
            ref={canvasRef}
            role="img"
            aria-label={T.previewLabel[locale]}
            className="surface-media block size-full bg-studio-well"
            onClick={() => player.toggle()}
          />
          {safeZone ? (
            <div aria-hidden="true" className="surface-media pointer-events-none absolute inset-0 overflow-hidden">
              {/* Osenčeno je ono što pokrivaju dugmad i opis platforme. */}
              <div className="absolute inset-x-0 top-0 bg-scrim/45" style={{ height: `${safeZone.y * 100}%` }} />
              <div className="absolute inset-x-0 bottom-0 bg-scrim/45" style={{ height: `${(1 - safeZone.y - safeZone.h) * 100}%` }} />
              <div
                className="absolute left-0 bg-scrim/45"
                style={{ top: `${safeZone.y * 100}%`, height: `${safeZone.h * 100}%`, width: `${safeZone.x * 100}%` }}
              />
              <div
                className="absolute right-0 bg-scrim/45"
                style={{ top: `${safeZone.y * 100}%`, height: `${safeZone.h * 100}%`, width: `${(1 - safeZone.x - safeZone.w) * 100}%` }}
              />
              <div
                className="surface-media absolute border-2 border-dashed border-yellow"
                style={{
                  left: `${safeZone.x * 100}%`,
                  top: `${safeZone.y * 100}%`,
                  width: `${safeZone.w * 100}%`,
                  height: `${safeZone.h * 100}%`,
                }}
              />
            </div>
          ) : null}
          {empty ? (
            <p className="pointer-events-none absolute inset-0 grid place-items-center p-6 text-center text-sm font-extrabold text-white/80">
              {T.previewEmpty[locale]}
            </p>
          ) : null}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => player.seek(0)}
          aria-label={T.toStart[locale]}
          title={T.toStart[locale]}
          disabled={empty}
          className={cn("grid size-11 place-items-center rounded-full border-2 border-ink bg-paper text-ink disabled:opacity-40", FOCUS)}
        >
          <SkipBack aria-hidden="true" className="size-4" />
        </button>
        <button
          type="button"
          onClick={() => player.toggle()}
          aria-label={player.playing ? T.pause[locale] : T.play[locale]}
          title={`${player.playing ? T.pause[locale] : T.play[locale]} · ${T.spaceHint[locale]}`}
          disabled={empty}
          className={cn(
            "grid size-12 place-items-center rounded-full border-2 border-ink bg-yellow text-ink shadow-[3px_3px_0_0_var(--ink)] transition hover:-translate-y-0.5 disabled:opacity-40 motion-reduce:transition-none",
            FOCUS,
          )}
        >
          {player.playing ? <Pause aria-hidden="true" className="size-5" /> : <Play aria-hidden="true" className="size-5" />}
        </button>
        <p className="font-mono text-sm font-bold tabular-nums text-ink">
          {formatClock(player.time, locale)} <span className="text-muted">/ {formatClock(duration, locale)}</span>
        </p>
      </div>
    </div>
  );
}

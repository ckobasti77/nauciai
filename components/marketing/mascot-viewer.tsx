"use client";

import { Loader2, Pause, Play, RotateCcw } from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";

import { Button, cn } from "@/components/ui/primitives";
import { mascotPageContent } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n";
import {
  MASCOT_JOINT_KEYS,
  MASCOT_MODEL_URL,
  mascotDefaultJointValues,
  mascotJointRange,
  type MascotJointKey,
  type MascotVariant,
} from "@/lib/mascot-rig";

/**
 * `/3d` (3D-FAZA5): orkestrira R3F canvas + kontrole. Sam canvas (`MascotCanvas`)
 * ide kroz `next/dynamic` sa `ssr:false` I renderuje se tek kad kutija uđe u vidno
 * polje (IntersectionObserver ispod) — GLB se ne skida na mount, three.js chunk
 * se ne ubacuje u zajednički bundle drugih strana.
 */
const MascotCanvas = dynamic(() => import("@/components/marketing/mascot-canvas").then((m) => m.MascotCanvas), {
  ssr: false,
});

function useReducedMotion(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia("(prefers-reduced-motion: reduce)");
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
}

function useInView<T extends HTMLElement>(): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || inView) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) setInView(true);
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [inView]);

  return [ref, inView];
}

function formatFileSize(bytes: number | null, locale: Locale): string | null {
  if (bytes === null) return null;
  const mb = bytes / (1024 * 1024);
  return `${new Intl.NumberFormat(locale === "sr" ? "sr-RS" : "en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(mb)} MB`;
}

function formatTriangles(count: number | null, locale: Locale): string | null {
  if (count === null) return null;
  return new Intl.NumberFormat(locale === "sr" ? "sr-RS" : "en-US").format(count);
}

const VARIANTS: MascotVariant[] = ["basic", "premium"];

export function MascotViewer({ locale }: { locale: Locale }) {
  const t = mascotPageContent[locale];
  const [containerRef, inView] = useInView<HTMLDivElement>();
  const reducedMotion = useReducedMotion();

  const [variant, setVariant] = useState<MascotVariant>("basic");
  const [playing, setPlaying] = useState(true);
  const [jointValues, setJointValues] = useState<Record<MascotJointKey, number>>(() => mascotDefaultJointValues("basic"));
  const [triangleCount, setTriangleCount] = useState<number | null>(null);
  const [fileSize, setFileSize] = useState<number | null>(null);

  const selectVariant = useCallback((next: MascotVariant) => {
    setVariant(next);
    setTriangleCount(null);
    setFileSize(null);
    // Klizači prate isti zglob u novoj varijanti; opseg lakta je uži kod premiuma
    // (RIG.md: basic -10..110, premium -10..100), pa se vrednost sabija u opseg.
    setJointValues((prev) => {
      const next2 = { ...prev };
      for (const key of MASCOT_JOINT_KEYS) {
        const range = mascotJointRange(next, key);
        next2[key] = Math.min(range.max, Math.max(range.min, prev[key]));
      }
      return next2;
    });
  }, []);

  const resetPose = useCallback(() => {
    setJointValues(mascotDefaultJointValues(variant));
  }, [variant]);

  // Veličina fajla se čita sa samog GLB-a, ne iz izveštaja o gradnji — tek kad kutija
  // uđe u vidno polje, isti trenutak kad canvas krene da skida model. `blob.size` (a
  // ne `Content-Length` sa HEAD-a) jer dev server šalje GLB gzipovan bez tog zaglavlja
  // (chunked transfer); `blob.size` je uvek stvarna (raspakovana) veličina fajla.
  useEffect(() => {
    if (!inView) return;
    let cancelled = false;
    fetch(MASCOT_MODEL_URL[variant])
      .then((res) => res.blob())
      .then((blob) => {
        if (!cancelled) setFileSize(blob.size);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [variant, inView]);

  const onReady = useCallback((triangles: number) => {
    setTriangleCount(triangles);
  }, []);

  const triangleLabel = formatTriangles(triangleCount, locale);
  const fileSizeLabel = formatFileSize(fileSize, locale);
  const modelReady = triangleCount !== null;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div>
        <div
          role="group"
          aria-label={t.variant.label}
          className="surface-inset mb-4 inline-flex gap-1 border-2 border-ink bg-paper p-1"
        >
          {VARIANTS.map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={variant === v}
              onClick={() => selectVariant(v)}
              className={cn(
                "rounded-full border-2 border-ink px-4 py-1.5 text-sm font-black transition duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
                variant === v ? "bg-ink text-paper-strong" : "bg-paper-strong text-ink hover:-translate-y-0.5",
              )}
            >
              {t.variant[v]}
            </button>
          ))}
        </div>

        <div
          ref={containerRef}
          role="region"
          aria-label={t.canvasLabel}
          className="surface-card relative aspect-square w-full overflow-hidden border-2 border-ink bg-surface-b sm:aspect-video"
        >
          {inView ? (
            <MascotCanvas
              variant={variant}
              jointValues={jointValues}
              playing={playing}
              reducedMotion={reducedMotion}
              onReady={onReady}
            />
          ) : null}
          {!modelReady ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-surface-b text-ink">
              <Loader2 className="size-8 animate-spin" aria-hidden="true" />
              <p className="text-sm font-extrabold">{t.loading}</p>
            </div>
          ) : null}
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-muted">
          <span>{t.orbitHint}</span>
          {modelReady ? (
            <span className="tabular-nums">
              {triangleLabel} {t.stats.triangles}
              {fileSizeLabel ? ` · ${fileSizeLabel} ${t.stats.fileSize}` : ""}
            </span>
          ) : null}
        </div>

        {reducedMotion ? <p className="mt-3 text-sm font-bold text-muted">{t.reducedMotionNote}</p> : null}

        <div className="mt-4 flex flex-wrap gap-3">
          <Button tone="yellow" onClick={() => setPlaying((p) => !p)} disabled={reducedMotion}>
            {playing && !reducedMotion ? <Pause className="size-4" /> : <Play className="size-4" />}
            {playing && !reducedMotion ? t.playback.pause : t.playback.play}
          </Button>
          <Button tone="paper" onClick={resetPose}>
            <RotateCcw className="size-4" />
            {t.playback.reset}
          </Button>
        </div>
      </div>

      <div className="surface-card border-2 border-ink bg-paper-strong p-5">
        <p className="text-xs font-black uppercase tracking-wide text-muted">{t.joints.groupLabel}</p>
        <div className="mt-3 flex flex-col gap-4">
          {MASCOT_JOINT_KEYS.map((key) => {
            const range = mascotJointRange(variant, key);
            return (
              <JointSlider
                key={key}
                label={t.joints[key]}
                value={jointValues[key]}
                min={range.min}
                max={range.max}
                onChange={(next) => setJointValues((prev) => ({ ...prev, [key]: next }))}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

function JointSlider({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (next: number) => void;
}) {
  const id = useId();
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-[11px] font-black uppercase tracking-wide text-muted">
          {label}
        </label>
        <span className="text-xs font-black tabular-nums text-ink">{Math.round(value)}°</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-1.5 w-full accent-ink"
      />
    </div>
  );
}

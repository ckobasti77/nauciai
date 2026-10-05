"use client";

import { Volume2, VolumeX } from "lucide-react";
import { useEffect, useState } from "react";

import type { CreaToolOutput } from "@/components/crea/tool-runner";
import type { PickedVideo } from "@/components/crea/tools/video-input";
import type { ProbedVideo } from "@/components/crea/video/engine/transform";
import { fillCopy } from "@/lib/crea-copy";
import type { CreaDeviceCaps } from "@/lib/crea-device";
import { estimateBytes, EXPORT_MAX_BYTES, exportLimits, maxDurationFor } from "@/lib/crea-video-caps";
import { CREA_VIDEO_TOOLS_COPY as T } from "@/lib/crea-video-tools-copy";
import type { Locale } from "@/lib/i18n";

/**
 * Zajednički delovi lokalnih video alata (Crea K20): čitanje videa (trajanje,
 * veličina, fps, zvuk - kroz mediabunny, lenjo), red sa podacima i gotov video.
 */

export type VideoProbe = { status: "idle" } | { status: "loading" } | { status: "ready"; info: ProbedVideo } | { status: "error" };

/** Podaci o izabranom videu; motor se učitava tek kad postoji video. */
export function useVideoProbe(picked: PickedVideo | null): VideoProbe {
  const [probe, setProbe] = useState<{ key: string; value: VideoProbe } | null>(null);
  const key = picked?.key ?? null;
  const source = picked?.source ?? null;

  useEffect(() => {
    if (!key || !source) return;
    let alive = true;
    void (async () => {
      try {
        const { probeVideo } = await import("@/components/crea/video/engine/transform");
        const info = await probeVideo(source);
        if (alive) setProbe({ key, value: { status: "ready", info } });
      } catch {
        if (alive) setProbe({ key, value: { status: "error" } });
      }
    })();
    return () => {
      alive = false;
    };
  }, [key, source]);

  if (!key) return { status: "idle" };
  return probe?.key === key ? probe.value : { status: "loading" };
}

function seconds(value: number, locale: Locale): string {
  return value.toLocaleString(locale === "sr" ? "sr-Latn-RS" : "en-GB", { maximumFractionDigits: 1 });
}

/** „12,4 s · 1920 × 1080" ili čitanje / greška. */
export function VideoProbeLine({ locale, probe }: { locale: Locale; probe: VideoProbe }) {
  if (probe.status === "idle") return null;
  if (probe.status === "loading") return <p className="type-body-sm font-semibold text-muted">{T.probing[locale]}</p>;
  if (probe.status === "error") {
    return (
      <p role="alert" className="type-body-sm font-black text-red-700 dark:text-red-300">
        {T.probeFailed[locale]}
      </p>
    );
  }
  return (
    <p className="font-mono text-xs font-bold text-muted">
      {fillCopy(T.videoInfo[locale], { s: seconds(probe.info.durationS, locale), w: probe.info.width, h: probe.info.height })}
    </p>
  );
}

/** Najveća duža stranica izvoza na ovom uređaju (K17-4). */
export function outputLongSide(caps: CreaDeviceCaps | null): number {
  return caps ? exportLimits(caps).maxLongSide : 1920;
}

/**
 * Rečenica kad je izvoz predug za ovaj uređaj ili za galeriju (≤ 190 MB, K17-4);
 * inače `null`.
 */
export function videoTooLong(
  caps: CreaDeviceCaps | null,
  size: { width: number; height: number },
  durationS: number,
  locale: Locale,
  withAudio = true,
): string | null {
  const maxS = caps ? maxDurationFor(exportLimits(caps), size.width, size.height) : 240;
  if (durationS > maxS + 0.5 || estimateBytes(size.width, size.height, durationS, withAudio) > EXPORT_MAX_BYTES) {
    return fillCopy(T.tooLong[locale], { min: Math.max(1, Math.floor(maxS / 60)) });
  }
  return null;
}

export type VideoOutputExtra = { width: number; height: number; durationS: number; hasAudio: boolean; audioDropped: boolean; note?: string };

/** Ime fajla izvoza: `crea-<alat>-<oznaka>.mp4`. */
export function videoFileName(tool: string, tag: string): string {
  const clean = tag.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return clean ? `crea-${tool}-${clean}.mp4` : `crea-${tool}.mp4`;
}

/** Gotov video: plejer, veličina, trajanje i šta je sa zvukom. */
export function VideoResult({ locale, output }: { locale: Locale; output: CreaToolOutput<VideoOutputExtra> }) {
  const { extra } = output;
  return (
    <div className="space-y-2">
      {output.previewUrl ? (
        <video
          src={output.previewUrl}
          controls
          playsInline
          aria-label={T.resultLabel[locale]}
          className="surface-media mx-auto max-h-[60vh] w-full bg-paper object-contain shadow-[inset_0_0_0_1px_var(--shadow-hard-14)]"
        />
      ) : null}
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-sm font-black text-ink">
        <span>{fillCopy(T.resultInfo[locale], { w: extra.width, h: extra.height, s: seconds(extra.durationS, locale) })}</span>
        <span className="inline-flex items-center gap-1 font-sans text-xs font-bold text-muted">
          {extra.hasAudio ? <Volume2 aria-hidden="true" className="size-4" /> : <VolumeX aria-hidden="true" className="size-4" />}
          {extra.hasAudio ? T.soundKept[locale] : T.soundDropped[locale]}
        </span>
      </p>
      {extra.audioDropped ? <p className="type-body-sm font-semibold text-muted">{T.soundLost[locale]}</p> : null}
      {extra.note ? <p className="type-body-sm font-semibold text-muted">{extra.note}</p> : null}
    </div>
  );
}

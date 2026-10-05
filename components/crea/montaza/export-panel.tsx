/* eslint-disable @next/next/no-img-element -- rezultat (GIF) je lokalni `blob:` URL, koji next/image ne obrađuje. */
"use client";

import { CircleAlert, CircleCheck, Download, Film, ImagePlus, Info, Lightbulb, Square, Wand2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { formatClock } from "@/components/crea/montaza/format";
import { useSaveLocalResult } from "@/components/crea/use-save-local-result";
import type { MixResult } from "@/components/crea/video/engine/audio-mix";
import type { ExportMedia, ExportResult } from "@/components/crea/video/engine/export";
import { ChoiceChips } from "@/components/crea/tools/choice-chips";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/primitives";
import type { Id } from "@/convex/_generated/dataModel";
import { LOCAL_RESULT_MAX_BYTES } from "@/convex/creaLocalCore";
import { masterFixForPeak } from "@/lib/crea-audio-plan";
import { CREA_TOOL_COPY, creaSaveErrorMessage, fillCopy } from "@/lib/crea-copy";
import {
  EXPORT_PRESETS,
  EXPORT_PRESET_IDS,
  exportFileName,
  GIF_LIMITS,
  outputSize,
  PLATFORM_FACTS_CHECKED,
  type ExportPresetId,
} from "@/lib/crea-export-presets";
import { localAiErrorMessage, toLocalAiError, type LocalAiErrorCode } from "@/lib/crea-local-ai/errors";
import { formatBytes } from "@/lib/crea-local-ai/progress";
import { MONTAGE_COPY as T } from "@/lib/crea-montage-copy";
import { canExport, runPreflight, type PreflightFix, type PreflightItem } from "@/lib/crea-preflight";
import {
  exportParentJobId,
  fitItemsToSafeZone,
  timelineDuration,
  timelineJobIds,
  trimTimelineTo,
  type CreaTimelineV1,
  type MainClip,
} from "@/lib/crea-timeline";
import { estimateBytes, maxDurationFor, type ExportLimits, type VideoSupportTier } from "@/lib/crea-video-caps";
import type { Locale } from "@/lib/i18n";

/**
 * Izvoz za mreže (K19, V30): preset platforme, sigurna zona u pregledu,
 * „Proveri pre objave" sa popravkama, pa izvoz MP4/GIF na uređaju (0 kredita)
 * uz napredak i „Odustani". Rezultat ide u galeriju kao verzija prvog klipa iz
 * galerije (`derivation: "montaza"`) sa svim izvorima - ili se preuzima.
 */

type Phase =
  | { name: "idle" }
  | { name: "audio" }
  | { name: "reverse" }
  | { name: "video"; percent: number }
  | { name: "done"; result: ExportResult; url: string; format: "mp4" | "gif" }
  | { name: "error"; code: LocalAiErrorCode };

type SaveState = { status: "idle" | "saving" | "saved" } | { status: "error"; message: string };

const LEVEL_ICON = { ok: CircleCheck, tip: Lightbulb, warn: CircleAlert, block: CircleAlert } as const;

export type ExportPanelProps = {
  locale: Locale;
  timeline: CreaTimelineV1;
  onTimelineChange: (next: CreaTimelineV1, key?: string) => void;
  presetId: ExportPresetId;
  onPresetChange: (id: ExportPresetId) => void;
  safeZoneOn: boolean;
  onSafeZoneChange: (on: boolean) => void;
  tier: VideoSupportTier;
  limits: ExportLimits;
  mix: { status: string; result: MixResult | null; renderNow: (timeline: CreaTimelineV1, signal: AbortSignal) => Promise<MixResult> };
  media: ExportMedia;
  /** Pre izvoza: obrnuti snimci za klipove unazad/bumerang (K17-9). */
  prepareReversed: (clips: MainClip[], signal: AbortSignal) => Promise<void>;
  /** „Popravi" za kuku: natpis na početak (alat ga i izabere). */
  onAddHookTitle: () => void;
  toolId: string;
  canSave: boolean;
  projectId: Id<"studioProjects"> | null;
  onSaved?: (jobId: Id<"generationJobs">) => void;
  /** Roditelj u stablu verzija kad nije prvi klip iz galerije (K21: kratak klip je verzija dugog videa). */
  parentJobId?: Id<"generationJobs"> | null;
};

export function ExportPanel(props: ExportPanelProps) {
  const { locale, timeline, presetId, tier, limits, mix } = props;
  const preset = EXPORT_PRESETS[presetId];
  const gif = preset.format === "gif";
  const [smaller, setSmaller] = useState(false);
  const [phase, setPhase] = useState<Phase>({ name: "idle" });
  const [save, setSave] = useState<SaveState>({ status: "idle" });
  const abortRef = useRef<AbortController | null>(null);
  const saveLocalResult = useSaveLocalResult();

  const effective = useMemo(() => (gif ? trimTimelineTo(timeline, GIF_LIMITS.maxDurationS) : timeline), [gif, timeline]);
  const gifTrimmed = gif && timelineDuration(timeline) > GIF_LIMITS.maxDurationS + 0.01;
  const deviceLimits = smaller ? { ...limits, maxLongSide: Math.min(limits.maxLongSide, 1280) } : limits;
  const size = outputSize(preset, timeline.aspect, deviceLimits);
  const duration = timelineDuration(effective);
  const audioStats = mix.status === "ready" && mix.result ? mix.result.stats : null;
  const estimated = gif ? 0 : estimateBytes(size.width, size.height, duration, audioStats?.audible ?? true);
  const items = runPreflight({
    timeline: effective,
    preset,
    output: size,
    deviceMaxS: gif ? GIF_LIMITS.maxDurationS : maxDurationFor(deviceLimits, size.width, size.height),
    estimatedBytes: estimated,
    audio: gif ? null : audioStats,
  });
  const exportable = canExport(items) && (gif || tier === "webcodecs");
  const busy = phase.name === "audio" || phase.name === "reverse" || phase.name === "video";

  const doneUrl = phase.name === "done" ? phase.url : null;
  useEffect(() => () => {
    if (doneUrl) URL.revokeObjectURL(doneUrl);
  }, [doneUrl]);
  useEffect(() => () => abortRef.current?.abort(), []);

  const applyFix = (fix: PreflightFix) => {
    switch (fix.kind) {
      case "skrati":
        props.onTimelineChange(trimTimelineTo(timeline, fix.seconds));
        return;
      case "odnos":
        props.onTimelineChange({ ...timeline, aspect: preset.aspect });
        return;
      case "sigurna-zona":
        props.onTimelineChange(fitItemsToSafeZone(timeline, preset.safeZone));
        props.onSafeZoneChange(true);
        return;
      case "utisaj":
        if (audioStats) props.onTimelineChange({ ...timeline, mix: { ...timeline.mix, masterDb: masterFixForPeak(audioStats.peakDb, timeline.mix.masterDb) } });
        return;
      case "naslov-na-pocetak":
        props.onAddHookTitle();
        return;
      case "manja-rezolucija":
        setSmaller(true);
        return;
    }
  };

  async function run() {
    if (!exportable || busy) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setSave({ status: "idle" });
    try {
      let audio: AudioBuffer | null = null;
      if (!gif) {
        setPhase({ name: "audio" });
        audio = (await mix.renderNow(effective, controller.signal)).buffer;
      }
      const reversed = effective.main.filter((clip) => clip.media === "video" && (clip.reverse || clip.boomerang));
      if (reversed.length > 0) {
        setPhase({ name: "reverse" });
        await props.prepareReversed(reversed, controller.signal);
      }
      setPhase({ name: "video", percent: 0 });
      const { exportTimeline } = await import("@/components/crea/video/engine/export");
      const result = await exportTimeline({
        timeline: effective,
        format: gif ? "gif" : "mp4",
        width: size.width,
        height: size.height,
        fps: gif ? GIF_LIMITS.fps : effective.fps,
        audio,
        media: props.media,
        signal: controller.signal,
        onProgress: (fraction) => {
          if (!controller.signal.aborted) setPhase({ name: "video", percent: Math.round(fraction * 100) });
        },
      });
      if (controller.signal.aborted) return;
      setPhase({ name: "done", result, url: URL.createObjectURL(result.blob), format: gif ? "gif" : "mp4" });
    } catch (error) {
      if (controller.signal.aborted) return;
      setPhase({ name: "error", code: toLocalAiError(error, "INFERENCE_FAILED").code });
    }
  }

  function cancel() {
    abortRef.current?.abort();
    setPhase({ name: "error", code: "ABORTED" });
  }

  async function saveToGallery(result: ExportResult, format: "mp4" | "gif") {
    setSave({ status: "saving" });
    try {
      const parent = props.parentJobId !== undefined ? props.parentJobId : (exportParentJobId(effective) as Id<"generationJobs"> | null);
      const saved = await saveLocalResult({
        toolId: props.toolId,
        kind: format === "gif" ? "image" : "video",
        blob: result.blob,
        params: {
          preset: preset.id,
          sekundi: Math.round(result.durationS * 10) / 10,
          sirina: size.width,
          visina: size.height,
          zvuk: result.hasAudio,
        },
        projectId: props.projectId,
        parentJobId: parent,
        derivation: "montaza",
        sourceJobIds: timelineJobIds(effective).slice(0, 40) as Id<"generationJobs">[],
      });
      if (saved.ok) {
        setSave({ status: "saved" });
        props.onSaved?.(saved.jobId);
      } else {
        setSave({ status: "error", message: creaSaveErrorMessage(saved.reason, locale) });
      }
    } catch (error) {
      setSave({ status: "error", message: creaSaveErrorMessage(error instanceof Error ? error.message : String(error), locale) });
    }
  }

  function download(result: ExportResult) {
    const url = URL.createObjectURL(result.blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = exportFileName(preset, result.durationS);
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const presetOptions = EXPORT_PRESET_IDS.map((id) => ({ id, label: EXPORT_PRESETS[id].label[locale] }));

  return (
    <div className="space-y-5">
      {tier !== "webcodecs" ? (
        <div role="status" className="surface-inset flex gap-3 bg-paper p-3">
          <Info aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-ink" />
          <div>
            <p className="type-body-sm font-black text-ink">{T.previewOnlyTitle[locale]}</p>
            <p className="mt-1 type-body-sm font-semibold text-muted">{T.previewOnlyBody[locale]}</p>
          </div>
        </div>
      ) : null}

      <div className="space-y-2">
        <ChoiceChips legend={T.preset[locale]} name="preset" options={presetOptions} value={presetId} onChange={props.onPresetChange} disabled={busy} />
        <p className="type-body-sm font-semibold text-muted">{preset.hint[locale]}</p>
        <p className="text-xs font-semibold text-muted">{fillCopy(T.approx[locale], { date: PLATFORM_FACTS_CHECKED })}</p>
        <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 type-body-sm font-black text-ink">
          <input type="checkbox" checked={props.safeZoneOn} onChange={(event) => props.onSafeZoneChange(event.target.checked)} className="size-5 accent-ink" />
          {T.safeZone[locale]}
        </label>
        {props.safeZoneOn ? <p className="type-body-sm font-semibold text-muted">{T.safeZoneHint[locale]}</p> : null}
      </div>

      <section aria-labelledby="crea-preflight" className="space-y-2 border-t border-line pt-4">
        <h4 id="crea-preflight" className="type-h4 text-ink">
          {T.check[locale]}
        </h4>
        {!gif && mix.status !== "ready" && timeline.main.length > 0 ? (
          <p className="type-body-sm font-semibold text-muted">{T.checkPending[locale]}</p>
        ) : null}
        <ul className="divide-y divide-line">
          {items.map((item) => (
            <PreflightRow key={item.id} locale={locale} item={item} onFix={applyFix} disabled={busy} />
          ))}
        </ul>
        {gifTrimmed ? <p className="type-body-sm font-semibold text-muted">{T.gifLimit[locale]}</p> : null}
        {smaller ? <p className="type-body-sm font-semibold text-muted">{T.smallerOn[locale]}</p> : null}
      </section>

      <div className="space-y-3 border-t border-line pt-4">
        <div className="flex flex-wrap items-center gap-3">
          {busy ? (
            <Button variant="secondary" onClick={cancel} icon={<Square aria-hidden="true" className="size-4" />}>
              {CREA_TOOL_COPY.cancel[locale]}
            </Button>
          ) : (
            <Button
              onClick={() => void run()}
              disabled={!exportable || timeline.main.length === 0}
              icon={gif ? <ImagePlus aria-hidden="true" className="size-4" /> : <Film aria-hidden="true" className="size-4" />}
              className="shadow-[4px_4px_0_0_var(--ink)]"
            >
              {gif ? T.exportGif[locale] : T.exportMp4[locale]}
            </Button>
          )}
          <p className="font-mono text-xs font-bold text-muted">
            {fillCopy(T.estimate[locale], { w: size.width, h: size.height, size: gif ? "GIF" : formatBytes(estimated, locale) })}
          </p>
        </div>
        {!canExport(items) ? <p className="type-body-sm font-bold text-ink">{T.exportBlocked[locale]}</p> : null}
        <div aria-live="polite">
          {busy ? (
            <ExportProgress
              locale={locale}
              label={
                phase.name === "audio"
                  ? T.preparingAudio[locale]
                  : phase.name === "reverse"
                    ? T.reversingClips[locale]
                    : fillCopy(gif ? T.exportingGif[locale] : T.exporting[locale], { p: phase.name === "video" ? phase.percent : 0 })
              }
              percent={phase.name === "video" ? phase.percent : null}
            />
          ) : null}
          {phase.name === "error" ? (
            <p className={cn("type-body-sm font-black", phase.code === "ABORTED" ? "text-muted" : "text-red-700 dark:text-red-300")}>
              {localAiErrorMessage(phase.code, locale)}
            </p>
          ) : null}
        </div>
      </div>

      {phase.name === "done" ? (
        <section className="space-y-3 border-t border-line pt-4">
          <h4 className="flex items-center gap-2 type-h4 text-ink">
            <Wand2 aria-hidden="true" className="size-5" />
            {T.resultTitle[locale]}
          </h4>
          {phase.format === "gif" ? (
            <img src={phase.url} alt="" className="surface-media max-h-[420px] w-auto max-w-full bg-studio-well shadow-[inset_0_0_0_1px_var(--shadow-hard-14)]" />
          ) : (
            <video src={phase.url} controls playsInline className="surface-media max-h-[420px] w-full bg-studio-well shadow-[inset_0_0_0_1px_var(--shadow-hard-14)]" />
          )}
          <p className="font-mono text-xs font-bold text-muted">
            {fillCopy(T.exportedLength[locale], { s: formatClock(phase.result.durationS, locale), size: formatBytes(phase.result.blob.size, locale) })}
          </p>
          {phase.result.audioDropped ? <p className="type-body-sm font-bold text-ink">{T.audioDropped[locale]}</p> : null}
          <ResultActions
            locale={locale}
            canSave={props.canSave && phase.result.blob.size <= LOCAL_RESULT_MAX_BYTES[phase.format === "gif" ? "image" : "video"]}
            save={save}
            onSave={() => void saveToGallery(phase.result, phase.format)}
            onDownload={() => download(phase.result)}
            noAccess={!props.canSave}
          />
        </section>
      ) : null}
    </div>
  );
}

function PreflightRow({ locale, item, onFix, disabled }: { locale: Locale; item: PreflightItem; onFix: (fix: PreflightFix) => void; disabled: boolean }) {
  const Icon = LEVEL_ICON[item.level];
  return (
    <li className="flex flex-wrap items-start gap-3 py-2.5">
      <Icon
        aria-hidden="true"
        className={cn(
          "mt-0.5 size-5 shrink-0",
          item.level === "block" ? "text-red-700 dark:text-red-300" : item.level === "warn" ? "text-amber-700 dark:text-amber-300" : "text-ink",
        )}
      />
      <p className="min-w-0 flex-1 type-body-sm font-semibold text-ink">
        <span className="font-black">{T.levels[item.level][locale]}: </span>
        {item.message[locale]}
      </p>
      {item.fix ? (
        <Button variant="secondary" onClick={() => onFix(item.fix!)} disabled={disabled}>
          {T.fix[locale]}
        </Button>
      ) : null}
    </li>
  );
}

function ExportProgress({ locale, label, percent }: { locale: Locale; label: string; percent: number | null }) {
  return (
    <div className="space-y-2">
      <p className="type-body-sm font-black text-ink">{label}</p>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent ?? undefined}
        className="h-3 overflow-hidden rounded-full border-2 border-ink bg-paper"
      >
        <div
          className={cn("h-full origin-left bg-yellow transition-transform duration-200 ease-out motion-reduce:transition-none", percent === null && "motion-safe:animate-pulse")}
          style={{ transform: `scaleX(${(percent ?? 30) / 100})` }}
        />
      </div>
      <p className="type-body-sm font-semibold text-muted">{T.keepTab[locale]}</p>
    </div>
  );
}

function ResultActions({
  locale,
  canSave,
  noAccess,
  save,
  onSave,
  onDownload,
}: {
  locale: Locale;
  canSave: boolean;
  noAccess: boolean;
  save: SaveState;
  onSave: () => void;
  onDownload: () => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {canSave ? (
          save.status === "saved" ? (
            <p className="inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-ink bg-paper px-4 text-sm font-black text-ink">
              <CircleCheck aria-hidden="true" className="size-4" />
              {CREA_TOOL_COPY.saved[locale]}
            </p>
          ) : (
            <Button onClick={onSave} loading={save.status === "saving"} icon={<ImagePlus aria-hidden="true" className="size-4" />} className="shadow-[4px_4px_0_0_var(--ink)]">
              {save.status === "saving" ? CREA_TOOL_COPY.saving[locale] : CREA_TOOL_COPY.save[locale]}
            </Button>
          )
        ) : null}
        <Button variant="secondary" onClick={onDownload} icon={<Download aria-hidden="true" className="size-4" />}>
          {CREA_TOOL_COPY.download[locale]}
        </Button>
      </div>
      {save.status === "error" ? (
        <p role="alert" className="type-body-sm font-black text-red-700 dark:text-red-300">
          {save.message}
        </p>
      ) : null}
      {noAccess ? <p className="type-body-sm font-semibold text-muted">{CREA_TOOL_COPY.noAccess[locale]}</p> : null}
    </div>
  );
}


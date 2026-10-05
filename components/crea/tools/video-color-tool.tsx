"use client";

import { Palette, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";

import { ToolRunner, type CreaToolOutput, type ToolRunContext } from "@/components/crea/tool-runner";
import { ChoiceChips } from "@/components/crea/tools/choice-chips";
import { AdjustSlider, ColorPreview, gradeFor, Slider, type Grade } from "@/components/crea/tools/color-tool";
import type { CreaToolProps } from "@/components/crea/tools/types";
import { useVideoInput, VideoInput, type PickedVideo } from "@/components/crea/tools/video-input";
import {
  outputLongSide,
  useVideoProbe,
  VideoProbeLine,
  VideoResult,
  videoFileName,
  videoTooLong,
  type VideoOutputExtra,
} from "@/components/crea/tools/video-tool-kit";
import { Button } from "@/components/ui/button";
import type { CreaDeviceCaps } from "@/lib/crea-device";
import { CREA_COLOR_COPY } from "@/lib/crea-edit-copy";
import { CreaLocalAiError } from "@/lib/crea-local-ai/errors";
import { ADJUST_SLIDERS, CREA_LOOKS, isNeutralGrade, lookById, NEUTRAL_ADJUST } from "@/lib/crea-lut";
import { exportSize } from "@/lib/crea-video-caps";
import { CREA_VIDEO_TOOLS_COPY as T } from "@/lib/crea-video-tools-copy";

async function colorVideo(picked: PickedVideo, grade: Grade, caps: CreaDeviceCaps | null, context: ToolRunContext): Promise<CreaToolOutput<VideoOutputExtra>> {
  context.reportRunning();
  const [engine, { ColorRenderer }] = await Promise.all([
    import("@/components/crea/video/engine/transform"),
    import("@/components/crea/tools/color-render"),
  ]);
  const info = await engine.probeVideo(picked.source);
  const renderer = new ColorRenderer(true);
  try {
    const size = exportSize(info.width, info.height, Math.min(outputLongSide(caps), renderer.maxSide));
    const { canvas, ctx } = engine.workCanvas(size.width, size.height);
    renderer.setGrade(gradeFor(grade));
    const frameTime = 1 / Math.max(1, info.fps);
    const result = await engine.transformVideo({
      source: picked.source,
      width: size.width,
      height: size.height,
      audio: "copy",
      signal: context.signal,
      onProgress: (fraction) => context.reportProgress(fraction * 100),
      render: ({ sample }) => {
        sample.draw(ctx, 0, 0, size.width, size.height);
        renderer.setFrame(canvas);
        // Zrno filma: vreme teče po kadru, pa je šum isti pri svakom izvozu.
        renderer.render(size.width, size.height, frameTime);
        return renderer.canvas;
      },
    });
    if (context.signal.aborted) throw new CreaLocalAiError("ABORTED");
    return {
      blob: result.blob,
      kind: "video",
      fileName: videoFileName("boje", grade.lookId),
      previewUrl: URL.createObjectURL(result.blob),
      params: { izgled: grade.lookId, jacina: grade.intensity, sirina: size.width, visina: size.height },
      extra: { width: size.width, height: size.height, durationS: info.durationS, hasAudio: result.hasAudio, audioDropped: result.audioDropped },
    };
  } finally {
    renderer.dispose();
  }
}

/** Kadar videa kao fajl za pregled boja (isti pregled kao za sliku, K11). */
function useFrameFile(picked: PickedVideo | null, percent: number): File | null {
  const [frame, setFrame] = useState<{ key: string; file: File } | null>(null);
  const key = picked ? `${picked.key}:${percent}` : null;
  const source = picked?.source ?? null;
  useEffect(() => {
    if (!key || !source) return;
    let alive = true;
    const controller = new AbortController();
    // Klizač šalje mnogo promena - kadar se vadi tek kad stane.
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const { extractFrame } = await import("@/components/crea/video/engine/frames");
          const extracted = await extractFrame(source, { fraction: percent / 100 }, controller.signal);
          if (alive) setFrame({ key, file: new File([extracted.blob], "kadar.jpg", { type: extracted.blob.type }) });
        } catch {
          // Pregled nije obavezan: bez kadra ostaju klizači i izvoz.
        }
      })();
    }, 250);
    return () => {
      alive = false;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [key, source, percent]);
  return frame && picked && frame.key.startsWith(`${picked.key}:`) ? frame.file : null;
}

/**
 * Boje videa (Crea K20, V16): isti filmski izgledi i klizači kao „Boje i svetlo"
 * za sliku (S17, `lib/crea-lut.ts`), na svakom kadru. Pregled je jedan kadar
 * (klizač bira koji); izvoz ide kroz isti `ColorRenderer` sa jednom teksturom i
 * zrnom po kadru, zvuk se prenosi. 0 kredita, rezultat je verzija izvora.
 */
export default function VideoColorTool({ tool, locale, caps, canSave, projectId, source }: CreaToolProps) {
  const video = useVideoInput(source);
  const probe = useVideoProbe(video.picked);
  const [grade, setGrade] = useState<Grade>({ adjust: NEUTRAL_ADJUST, lookId: "original", intensity: 100 });
  const [percent, setPercent] = useState(30);
  const picked = video.picked;
  const frameFile = useFrameFile(picked, percent);
  const neutral = isNeutralGrade(grade.adjust, lookById(grade.lookId), grade.intensity / 100);
  const gradeKey = `${grade.lookId}:${grade.intensity}:${ADJUST_SLIDERS.map((slider) => grade.adjust[slider.key]).join(",")}`;
  const tooLong =
    probe.status === "ready"
      ? videoTooLong(caps, exportSize(probe.info.width, probe.info.height, outputLongSide(caps)), probe.info.durationS, locale)
      : null;

  return (
    <ToolRunner
      tool={tool}
      locale={locale}
      caps={caps}
      canSave={canSave}
      projectId={projectId}
      parentJobId={picked?.sourceJobId ?? null}
      canRun={picked !== null && probe.status === "ready" && !neutral && tooLong === null}
      inputKey={picked ? `${picked.key}:${gradeKey}` : null}
      runLabel={T.colorRun[locale]}
      icon={<Palette aria-hidden="true" className="size-5" />}
      run={(context) => colorVideo(picked!, grade, caps, context)}
      renderResult={(output) => <VideoResult locale={locale} output={output} />}
    >
      {({ busy }) => (
        <div className="space-y-5">
          <VideoInput locale={locale} input={video} disabled={busy} />
          <VideoProbeLine locale={locale} probe={probe} />
          {tooLong ? <p className="type-body-sm font-black text-ink">{tooLong}</p> : null}
          {picked ? (
            <div className="space-y-2">
              {frameFile ? <ColorPreview locale={locale} file={frameFile} grade={grade} /> : null}
              <Slider label={T.colorFrame[locale]} value={percent} min={0} max={100} disabled={busy} onChange={setPercent} />
            </div>
          ) : null}

          <ChoiceChips
            legend={CREA_COLOR_COPY.looks[locale]}
            name="crea-video-color-look"
            options={CREA_LOOKS.map((look) => ({ id: look.id, label: look.label[locale] }))}
            value={grade.lookId}
            onChange={(lookId) => setGrade((current) => ({ ...current, lookId }))}
            disabled={busy}
          />
          {grade.lookId !== "original" ? (
            <Slider
              label={CREA_COLOR_COPY.intensity[locale]}
              value={grade.intensity}
              min={0}
              max={100}
              disabled={busy}
              onChange={(intensity) => setGrade((current) => ({ ...current, intensity }))}
            />
          ) : null}

          <fieldset disabled={busy} className="min-w-0 space-y-1">
            <legend className="type-body-sm font-black text-ink">{CREA_COLOR_COPY.basic[locale]}</legend>
            {ADJUST_SLIDERS.filter((slider) => slider.basic).map((slider) => (
              <AdjustSlider key={slider.key} locale={locale} sliderKey={slider.key} grade={grade} setGrade={setGrade} disabled={busy} />
            ))}
          </fieldset>
          <details className="group">
            <summary className="inline-flex min-h-11 cursor-pointer items-center type-body-sm font-black text-ink underline decoration-2 underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
              {CREA_COLOR_COPY.more[locale]}
            </summary>
            <div className="mt-2 space-y-1">
              {ADJUST_SLIDERS.filter((slider) => !slider.basic).map((slider) => (
                <AdjustSlider key={slider.key} locale={locale} sliderKey={slider.key} grade={grade} setGrade={setGrade} disabled={busy} />
              ))}
            </div>
          </details>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="ghost"
              onClick={() => setGrade({ adjust: NEUTRAL_ADJUST, lookId: "original", intensity: 100 })}
              disabled={busy || neutral}
              icon={<RotateCcw aria-hidden="true" className="size-4" />}
            >
              {CREA_COLOR_COPY.reset[locale]}
            </Button>
            {picked && neutral ? <p className="type-body-sm font-semibold text-muted">{CREA_COLOR_COPY.neutral[locale]}</p> : null}
          </div>
          {busy ? <p className="type-body-sm font-semibold text-muted">{T.keepTabOpen[locale]}</p> : null}
        </div>
      )}
    </ToolRunner>
  );
}

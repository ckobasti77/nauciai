"use client";

import { Tv } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { canvasFont, loadCanvasFonts } from "@/components/crea/editor/fonts";
import { ToolRunner, type CreaToolOutput, type ToolRunContext } from "@/components/crea/tool-runner";
import { ChoiceChips } from "@/components/crea/tools/choice-chips";
import { Slider } from "@/components/crea/tools/color-tool";
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
import type { RetroRenderer } from "@/components/crea/video/engine/retro-shaders";
import { cn } from "@/components/ui/primitives";
import type { CreaDeviceCaps } from "@/lib/crea-device";
import { CreaLocalAiError } from "@/lib/crea-local-ai/errors";
import {
  cleanTypewriterText,
  dateInputValue,
  NOKIA,
  nokiaSize,
  parseDateInput,
  RETRO_PRESETS,
  RETRO_STRENGTH,
  retroParamsFor,
  retroPreset,
  retroSeed,
  retroTick,
  TYPEWRITER,
  typewriterTitle,
  vhsStamp,
  type RetroId,
  type VhsStamp,
} from "@/lib/crea-retro";
import { CREA_RETRO_COPY as T } from "@/lib/crea-retro-copy";
import { exportSize } from "@/lib/crea-video-caps";
import { CREA_VIDEO_TOOLS_COPY } from "@/lib/crea-video-tools-copy";
import type { Locale } from "@/lib/i18n";

type RetroSettings = {
  id: RetroId;
  strength: number;
  params: Record<string, number>;
  /** VHS: natpis „PLAY ▶" i datum. */
  stamp: boolean;
  /** VHS: datum kao vrednost polja `<input type="date">`. */
  date: string;
  /** Pisaća mašina: naslov koji se kuca. */
  title: string;
};

/**
 * Boje natpisa koji se utiskuju u sam video (ne UI: video nema svetlu i tamnu
 * temu, pa ovde nema tokena). OSD kamere je beo sa senkom, mastilo pisaće
 * mašine tamnosmeđe na sepiji.
 */
const OSD_TEXT = "#ffffff";
const OSD_SHADOW = "rgba(0, 0, 0, 0.65)";
const TYPE_INK = "#2b1d12";
const LCD_GAP = "#000000";

function presetSettings(id: RetroId, keep: Pick<RetroSettings, "stamp" | "date" | "title">): RetroSettings {
  const values = retroParamsFor(id);
  return { id, strength: values.strength, params: values.params, stamp: keep.stamp, date: keep.date, title: keep.title };
}

/** 2D platno samo za `drawImage` (bez `willReadFrequently`, ostaje na GPU-u). */
function canvas2d(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new CreaLocalAiError("UNSUPPORTED");
  return { canvas, ctx };
}

/** Nokia: tamne linije između krupnih piksela (mreža LCD ekrana), crta se jednom. */
function nokiaGrid(width: number, height: number, cells: { width: number; height: number }, amount: number): HTMLCanvasElement | null {
  if (amount <= 0) return null;
  const { canvas, ctx } = canvas2d(width, height);
  const cellW = width / cells.width;
  const cellH = height / cells.height;
  const line = Math.max(1, Math.round(Math.min(cellW, cellH) * 0.14));
  ctx.globalAlpha = Math.min(1, amount * 0.6);
  ctx.fillStyle = LCD_GAP;
  for (let x = 1; x < cells.width; x += 1) ctx.fillRect(Math.round(x * cellW) - Math.floor(line / 2), 0, line, height);
  for (let y = 1; y < cells.height; y += 1) ctx.fillRect(0, Math.round(y * cellH) - Math.floor(line / 2), width, line);
  return canvas;
}

/** VHS natpis dole levo: „PLAY ▶", pa datum i brojač. */
function drawVhsStamp(ctx: CanvasRenderingContext2D, width: number, height: number, stamp: VhsStamp) {
  const size = Math.max(10, Math.round(Math.min(width, height) * 0.06));
  const x = Math.round(width * 0.06);
  const bottom = Math.round(height * 0.93);
  ctx.save();
  ctx.font = `700 ${size}px ui-monospace, "Courier New", monospace`;
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = OSD_TEXT;
  ctx.shadowColor = OSD_SHADOW;
  ctx.shadowOffsetX = Math.max(1, Math.round(size * 0.08));
  ctx.shadowOffsetY = Math.max(1, Math.round(size * 0.08));
  ctx.fillText(stamp.play, x, bottom - Math.round(size * 1.3));
  ctx.fillText(`${stamp.date}  ${stamp.counter}`, x, bottom);
  ctx.restore();
}

/** Naslov pisaće mašine: otkucan deo, poravnat kao da je ceo naslov u sredini (slova ne skaču). */
function drawTypewriter(ctx: CanvasRenderingContext2D, width: number, height: number, full: string, visible: string) {
  if (!visible) return;
  let size = Math.max(10, Math.round(Math.min(width, height) * 0.075));
  ctx.save();
  ctx.font = canvasFont("lora", 700, size);
  let fullWidth = ctx.measureText(full).width;
  const maxWidth = width * 0.88;
  if (fullWidth > maxWidth) {
    size = Math.max(10, Math.floor((size * maxWidth) / fullWidth));
    ctx.font = canvasFont("lora", 700, size);
    fullWidth = ctx.measureText(full).width;
  }
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = TYPE_INK;
  ctx.fillText(visible, Math.round((width - fullWidth) / 2), Math.round(height * 0.86));
  ctx.restore();
}

type Painter = (draw: (ctx: CanvasRenderingContext2D, width: number, height: number) => void, index: number, time: number) => void;

/**
 * Jedan kadar sa efektom na platno `out` - isti put za pregled i izvoz:
 * kadar u radno platno (Nokia: 176 px), GPU efekat, kopija na `out` (Nokia:
 * najbliži piksel, `imageSmoothingEnabled = false`), pa mreža i natpisi.
 */
function retroPainter(renderer: RetroRenderer, settings: RetroSettings, out: HTMLCanvasElement): Painter {
  const outCtx = out.getContext("2d");
  if (!outCtx) throw new CreaLocalAiError("UNSUPPORTED");
  const nokia = settings.id === "nokia";
  const small = nokia ? nokiaSize(out.width, out.height) : { width: out.width, height: out.height };
  const work = canvas2d(small.width, small.height);
  work.ctx.imageSmoothingQuality = "high";
  const values = retroParamsFor(settings.id, settings.strength, settings.params);
  const grid = nokia ? nokiaGrid(out.width, out.height, small, ((values.params.mreza ?? 0) / 100) * (values.strength / 100)) : null;
  const stamp = settings.id === "vhs" && settings.stamp ? parseDateInput(settings.date) : null;
  const title = settings.id === "pisaca-masina" ? cleanTypewriterText(settings.title) : "";
  return (draw, index, time) => {
    draw(work.ctx, small.width, small.height);
    renderer.setFrame(work.canvas, small.width, small.height);
    renderer.render(settings.id, values, retroSeed(index), time);
    outCtx.imageSmoothingEnabled = !nokia;
    outCtx.imageSmoothingQuality = "high";
    outCtx.drawImage(renderer.canvas, 0, 0, out.width, out.height);
    if (grid) outCtx.drawImage(grid, 0, 0);
    if (stamp) drawVhsStamp(outCtx, out.width, out.height, vhsStamp(stamp, time));
    if (title) drawTypewriter(outCtx, out.width, out.height, title, typewriterTitle(title, time));
  };
}

async function retroVideo(
  picked: PickedVideo,
  settings: RetroSettings,
  caps: CreaDeviceCaps | null,
  context: ToolRunContext,
): Promise<CreaToolOutput<VideoOutputExtra>> {
  context.reportRunning();
  const [engine, { RetroRenderer: Renderer }] = await Promise.all([
    import("@/components/crea/video/engine/transform"),
    import("@/components/crea/video/engine/retro-shaders"),
  ]);
  const info = await engine.probeVideo(picked.source);
  if (settings.id === "pisaca-masina" && settings.title.trim()) await loadCanvasFonts();
  const renderer = new Renderer();
  try {
    const size = exportSize(info.width, info.height, Math.min(outputLongSide(caps), renderer.maxSide));
    const { canvas: out } = engine.workCanvas(size.width, size.height);
    const paint = retroPainter(renderer, settings, out);
    const nokia = settings.id === "nokia";
    let lastTick = -1;
    const result = await engine.transformVideo({
      source: picked.source,
      width: size.width,
      height: size.height,
      audio: "copy",
      signal: context.signal,
      onProgress: (fraction) => context.reportProgress(fraction * 100),
      render: ({ sample, time, index }) => {
        if (nokia) {
          // Nokia: slika se menja 12 puta u sekundi, između toga ostaje držan kadar.
          const tick = retroTick(time, NOKIA.fps);
          if (tick === lastTick) return out;
          lastTick = tick;
        }
        // Seme šuma = broj kadra, pa je izvoz isti pri svakom pokretanju.
        paint((ctx, width, height) => sample.draw(ctx, 0, 0, width, height), index, time);
        return out;
      },
    });
    if (context.signal.aborted) throw new CreaLocalAiError("ABORTED");
    return {
      blob: result.blob,
      kind: "video",
      fileName: videoFileName("retro", settings.id),
      previewUrl: URL.createObjectURL(result.blob),
      params: { efekat: settings.id, jacina: settings.strength, sirina: size.width, visina: size.height },
      extra: { width: size.width, height: size.height, durationS: info.durationS, hasAudio: result.hasAudio, audioDropped: result.audioDropped },
    };
  } finally {
    renderer.dispose();
  }
}

type FrameBitmap = { key: string; bitmap: ImageBitmap; timeS: number };

/** Kadar videa (pune veličine) za pregled; vadi se tek kad klizač stane. */
function useFrameBitmap(picked: PickedVideo | null, percent: number): FrameBitmap | null {
  const [frame, setFrame] = useState<FrameBitmap | null>(null);
  const key = picked ? `${picked.key}:${percent}` : null;
  const source = picked?.source ?? null;
  useEffect(() => {
    if (!key || !source) return;
    let alive = true;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const { extractFrame } = await import("@/components/crea/video/engine/frames");
          const extracted = await extractFrame(source, { fraction: percent / 100 }, controller.signal);
          const bitmap = await createImageBitmap(extracted.blob);
          if (alive) setFrame({ key, bitmap, timeS: extracted.timeS });
          else bitmap.close();
        } catch {
          // Pregled nije obavezan: bez kadra ostaju podešavanja i izvoz.
        }
      })();
    }, 250);
    return () => {
      alive = false;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [key, source, percent]);
  useEffect(() => () => frame?.bitmap.close(), [frame]);
  return frame && picked && frame.key.startsWith(`${picked.key}:`) ? frame : null;
}

/** Pregled jednog kadra u veličini izvoza, kroz isti `retroPainter` kao izvoz (isto seme, isti natpisi). */
function RetroPreview({
  locale,
  picked,
  percent,
  size,
  fps,
  settings,
}: {
  locale: Locale;
  picked: PickedVideo;
  percent: number;
  size: { width: number; height: number };
  fps: number;
  settings: RetroSettings;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frame = useFrameBitmap(picked, percent);
  const [renderer, setRenderer] = useState<RetroRenderer | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    let created: RetroRenderer | null = null;
    void (async () => {
      try {
        const { RetroRenderer: Renderer } = await import("@/components/crea/video/engine/retro-shaders");
        if (!alive) return;
        created = new Renderer();
        setRenderer(created);
      } catch {
        if (alive) setFailed(true);
      }
    })();
    return () => {
      alive = false;
      created?.dispose();
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!renderer || !frame || !canvas) return;
    let alive = true;
    // Klizači šalju mnogo promena - kadar se crta kad stanu.
    const timer = window.setTimeout(() => {
      void (async () => {
        if (settings.id === "pisaca-masina" && settings.title.trim()) await loadCanvasFonts();
        if (!alive) return;
        try {
          const paint = retroPainter(renderer, settings, canvas);
          paint((ctx, width, height) => ctx.drawImage(frame.bitmap, 0, 0, width, height), Math.round(frame.timeS * fps), frame.timeS);
        } catch {
          setFailed(true);
        }
      })();
    }, 80);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [renderer, frame, settings, fps]);

  if (failed) return <p className="type-body-sm font-black text-ink">{T.noWebgl[locale]}</p>;

  return (
    <div className="surface-media relative overflow-hidden bg-paper shadow-[inset_0_0_0_1px_var(--shadow-hard-14)]">
      <canvas
        ref={canvasRef}
        width={size.width}
        height={size.height}
        role="img"
        aria-label={T.previewLabel[locale]}
        className={cn("mx-auto block h-auto max-h-[60vh] w-auto max-w-full", frame && renderer ? null : "invisible")}
      />
      {frame && renderer ? null : (
        <p className="absolute inset-0 grid place-items-center type-body-sm font-semibold text-muted">{T.previewLoading[locale]}</p>
      )}
    </div>
  );
}

/**
 * Retro efekti (Crea K21, V27): VHS, stari televizor, glič, termo kamera,
 * noćni vid, Nokia, pisaća mašina i Super 8 na svakom kadru videa. Pregled je
 * jedan kadar (klizač bira koji) kroz isti GPU efekat i isto seme šuma kao
 * izvoz; izvoz ide kroz `transformVideo`, zvuk se prenosi. 0 kredita, sve na
 * uređaju; rezultat je verzija izvora.
 */
export default function RetroTool({ tool, locale, caps, canSave, projectId, source }: CreaToolProps) {
  const video = useVideoInput(source);
  const probe = useVideoProbe(video.picked);
  const [settings, setSettings] = useState<RetroSettings>(() => presetSettings("vhs", { stamp: true, date: dateInputValue(new Date()), title: "" }));
  const [percent, setPercent] = useState(30);
  const dateId = useId();
  const titleId = useId();
  const picked = video.picked;
  const preset = retroPreset(settings.id);
  const size = probe.status === "ready" ? exportSize(probe.info.width, probe.info.height, outputLongSide(caps)) : null;
  const tooLong = probe.status === "ready" && size ? videoTooLong(caps, size, probe.info.durationS, locale) : null;
  const dateMissing = settings.id === "vhs" && settings.stamp && parseDateInput(settings.date) === null;

  return (
    <ToolRunner
      tool={tool}
      locale={locale}
      caps={caps}
      canSave={canSave}
      projectId={projectId}
      parentJobId={picked?.sourceJobId ?? null}
      canRun={picked !== null && probe.status === "ready" && tooLong === null}
      inputKey={picked ? `${picked.key}:${JSON.stringify(settings)}` : null}
      runLabel={T.run[locale]}
      icon={<Tv aria-hidden="true" className="size-5" />}
      run={(context) => retroVideo(picked!, settings, caps, context)}
      renderResult={(output) => <VideoResult locale={locale} output={output} />}
    >
      {({ busy }) => (
        <div className="space-y-5">
          <VideoInput locale={locale} input={video} disabled={busy} />
          <VideoProbeLine locale={locale} probe={probe} />
          {tooLong ? <p className="type-body-sm font-black text-ink">{tooLong}</p> : null}
          {picked && probe.status === "ready" && size ? (
            <div className="space-y-2">
              <RetroPreview locale={locale} picked={picked} percent={percent} size={size} fps={probe.info.fps} settings={settings} />
              <Slider label={T.frame[locale]} value={percent} min={0} max={100} disabled={busy} onChange={setPercent} />
            </div>
          ) : null}

          <div className="space-y-2">
            <ChoiceChips<RetroId>
              legend={T.effect[locale]}
              name="crea-video-retro-effect"
              options={RETRO_PRESETS.map((entry) => ({ id: entry.id, label: entry.label[locale] }))}
              value={settings.id}
              onChange={(id) => setSettings((current) => presetSettings(id, current))}
              disabled={busy}
            />
            <p className="type-body-sm font-semibold text-muted">{preset.hint[locale]}</p>
          </div>

          <Slider
            label={T.strength[locale]}
            value={settings.strength}
            min={RETRO_STRENGTH.min}
            max={RETRO_STRENGTH.max}
            disabled={busy}
            onChange={(strength) => setSettings((current) => ({ ...current, strength }))}
          />
          <fieldset disabled={busy} className="min-w-0 space-y-1">
            <legend className="type-body-sm font-black text-ink">{T.settings[locale]}</legend>
            {preset.params.map((entry) => (
              <Slider
                key={`${settings.id}:${entry.key}`}
                label={entry.label[locale]}
                value={settings.params[entry.key] ?? entry.default}
                min={entry.min}
                max={entry.max}
                disabled={busy}
                onChange={(value) => setSettings((current) => ({ ...current, params: { ...current.params, [entry.key]: value } }))}
              />
            ))}
          </fieldset>

          {settings.id === "vhs" ? (
            <div className="space-y-2">
              <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 type-body-sm font-black text-ink">
                <input
                  type="checkbox"
                  checked={settings.stamp}
                  disabled={busy}
                  onChange={(event) => setSettings((current) => ({ ...current, stamp: event.target.checked }))}
                  className="size-5 accent-ink"
                />
                {T.stamp[locale]}
              </label>
              {settings.stamp ? (
                <div>
                  <label htmlFor={dateId} className="type-body-sm font-black text-ink">
                    {T.date[locale]}
                  </label>
                  <input
                    id={dateId}
                    type="date"
                    value={settings.date}
                    min="1950-01-01"
                    max="2099-12-31"
                    disabled={busy}
                    onChange={(event) => setSettings((current) => ({ ...current, date: event.target.value }))}
                    className="surface-inset mt-2 block min-h-11 w-full max-w-xs border-2 border-ink bg-paper-strong px-3 py-2 type-body font-bold text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                  />
                  {dateMissing ? <p className="mt-1 type-body-sm font-semibold text-muted">{T.dateMissing[locale]}</p> : null}
                </div>
              ) : null}
            </div>
          ) : null}

          {settings.id === "pisaca-masina" ? (
            <div>
              <label htmlFor={titleId} className="type-body-sm font-black text-ink">
                {T.title[locale]}
              </label>
              <input
                id={titleId}
                value={settings.title}
                maxLength={TYPEWRITER.maxChars}
                disabled={busy}
                autoComplete="off"
                placeholder={T.titlePlaceholder[locale]}
                onChange={(event) => setSettings((current) => ({ ...current, title: event.target.value }))}
                className="surface-inset mt-2 block min-h-11 w-full max-w-md border-2 border-ink bg-paper-strong px-3 py-2 type-body font-bold text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
              />
              <p className="mt-1 type-body-sm font-semibold text-muted">{T.titleHint[locale]}</p>
            </div>
          ) : null}

          {busy ? <p className="type-body-sm font-semibold text-muted">{CREA_VIDEO_TOOLS_COPY.keepTabOpen[locale]}</p> : null}
        </div>
      )}
    </ToolRunner>
  );
}

"use client";

import { Scissors } from "lucide-react";
import { useState } from "react";

import { ToolRunner, type CreaToolOutput, type ToolRunContext } from "@/components/crea/tool-runner";
import { decodeImage } from "@/components/crea/tools/canvas";
import { ChoiceChips } from "@/components/crea/tools/choice-chips";
import { ImageInput, useImageInput } from "@/components/crea/tools/image-input";
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
import { cn } from "@/components/ui/primitives";
import type { CreaDeviceCaps } from "@/lib/crea-device";
import { CREA_BACKGROUND_COPY } from "@/lib/crea-edit-copy";
import { coverCrop } from "@/lib/crea-editor-scene";
import { CreaLocalAiError } from "@/lib/crea-local-ai/errors";
import { loadVideoPersonSegmenter } from "@/lib/crea-local-ai/runtime";
import { BACKGROUND_SWATCHES, backgroundBlurRadius, normalizeHex } from "@/lib/crea-matting";
import { exportSize } from "@/lib/crea-video-caps";
import { blendMatte, matteAlpha, matteCoverage } from "@/lib/crea-video-matte";
import { CREA_VIDEO_TOOLS_COPY as T } from "@/lib/crea-video-tools-copy";
import type { Locale } from "@/lib/i18n";

type BackgroundKind = "boja" | "zamuceno" | "slika";
type Settings = { kind: BackgroundKind; color: string; blur: "blago" | "jako" };

/** Zeleno platno za montažu (hroma ključ) - podatak za platno, ne klasa. */
const GREEN_SCREEN = "#00b140";
const SWATCHES = [GREEN_SCREEN, ...BACKGROUND_SWATCHES];
/**
 * Kadar za model: duža stranica 512, odnos stranica ostaje (MediaPipe sam svodi
 * na 256 × 256; spljošten kadar bi iskrivio osobu i masku).
 */
const SEGMENT_LONG_SIDE = 512;

function canvas2d(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new CreaLocalAiError("UNSUPPORTED");
  return { canvas, ctx };
}

async function replaceVideoBackground(
  picked: PickedVideo,
  settings: Settings,
  backgroundFile: File | null,
  caps: CreaDeviceCaps | null,
  locale: Locale,
  context: ToolRunContext,
): Promise<CreaToolOutput<VideoOutputExtra>> {
  const [engine, segmenter] = await Promise.all([
    import("@/components/crea/video/engine/transform"),
    loadVideoPersonSegmenter({ signal: context.signal, onProgress: context.reportDownload }),
  ]);
  context.reportRunning();
  const info = await engine.probeVideo(picked.source);
  const size = exportSize(info.width, info.height, outputLongSide(caps));
  const { width, height } = size;

  // Platna se prave jednom i koriste za svaki kadar.
  const frame = canvas2d(width, height);
  const segmentScale = Math.min(1, SEGMENT_LONG_SIDE / Math.max(width, height));
  const small = canvas2d(Math.max(2, Math.round(width * segmentScale)), Math.max(2, Math.round(height * segmentScale)));
  const out = canvas2d(width, height);
  const person = canvas2d(width, height);
  let alphaCanvas: ReturnType<typeof canvas2d> | null = null;
  const blurFactor = Math.max(2, backgroundBlurRadius(width, height, settings.blur === "jako" ? 2.5 : 1));
  const blurSmall = canvas2d(Math.max(1, Math.round(width / blurFactor)), Math.max(1, Math.round(height / blurFactor)));

  let background: ImageBitmap | null = null;
  if (settings.kind === "slika" && backgroundFile) background = await decodeImage(backgroundFile);
  let previous: Float32Array | null = null;
  let coverageSum = 0;
  let frames = 0;

  try {
    const result = await engine.transformVideo({
      source: picked.source,
      width,
      height,
      audio: "copy",
      signal: context.signal,
      onProgress: (fraction) => context.reportProgress(fraction * 100),
      render: ({ sample }) => {
        sample.draw(frame.ctx, 0, 0, width, height);
        small.ctx.drawImage(frame.canvas, 0, 0, small.canvas.width, small.canvas.height);
        const mask = segmenter.segment(small.canvas);

        // Maska kroz vreme (bez treptanja ivice), pa meka providnost.
        if (mask) previous = blendMatte(previous, mask.confidence);
        const alpha = previous ? matteAlpha(previous) : null;
        if (alpha && mask) {
          coverageSum += matteCoverage(alpha);
          if (!alphaCanvas || alphaCanvas.canvas.width !== mask.width || alphaCanvas.canvas.height !== mask.height) {
            alphaCanvas = canvas2d(mask.width, mask.height);
          }
          const image = alphaCanvas.ctx.createImageData(mask.width, mask.height);
          for (let index = 0; index < alpha.length; index++) image.data[index * 4 + 3] = alpha[index]!;
          alphaCanvas.ctx.putImageData(image, 0, 0);
        }
        frames += 1;

        // Osoba: kadar „izrezan" maskom razvučenom glatko na punu veličinu.
        person.ctx.globalCompositeOperation = "copy";
        person.ctx.drawImage(frame.canvas, 0, 0);
        person.ctx.globalCompositeOperation = "destination-in";
        if (alphaCanvas && alpha) {
          person.ctx.imageSmoothingQuality = "high";
          person.ctx.drawImage(alphaCanvas.canvas, 0, 0, width, height);
        } else {
          person.ctx.clearRect(0, 0, width, height);
        }
        person.ctx.globalCompositeOperation = "source-over";

        // Pozadina, pa osoba preko nje.
        if (settings.kind === "boja") {
          out.ctx.fillStyle = settings.color;
          out.ctx.fillRect(0, 0, width, height);
        } else if (settings.kind === "zamuceno") {
          // Bez `ctx.filter` (Safari): umanji pa razvuci glatko.
          blurSmall.ctx.drawImage(frame.canvas, 0, 0, blurSmall.canvas.width, blurSmall.canvas.height);
          out.ctx.drawImage(blurSmall.canvas, 0, 0, width, height);
        } else if (background) {
          const crop = coverCrop(background.width, background.height, width, height);
          out.ctx.drawImage(background, crop.x, crop.y, crop.width, crop.height, 0, 0, width, height);
        }
        out.ctx.drawImage(person.canvas, 0, 0);
        return out.canvas;
      },
    });
    if (context.signal.aborted) throw new CreaLocalAiError("ABORTED");
    const coverage = frames > 0 ? coverageSum / frames : 0;
    return {
      blob: result.blob,
      kind: "video",
      fileName: videoFileName("pozadina", settings.kind),
      previewUrl: URL.createObjectURL(result.blob),
      params: { pozadina: settings.kind, sirina: width, visina: height },
      extra: {
        width,
        height,
        durationS: info.durationS,
        hasAudio: result.hasAudio,
        audioDropped: result.audioDropped,
        ...(coverage < 0.01 ? { note: T.bgNoPerson[locale] } : {}),
      },
    };
  } finally {
    background?.close();
  }
}

/**
 * Ukloni pozadinu videa (Crea K20, V18): LJUDI se iseku na uređaju (MediaPipe
 * selfie segmenter u režimu VIDEO, maska 256 px izglađena kroz vreme i razvučena
 * meko), pa idu na boju, zamućenje ili tvoju sliku; zvuk ostaje. 0 kredita.
 * Predmeti su plaćeni put koji čeka model (piše „uskoro").
 */
export default function VideoBackgroundTool({ tool, locale, caps, canSave, projectId, source }: CreaToolProps) {
  const video = useVideoInput(source);
  const probe = useVideoProbe(video.picked);
  const backgroundImage = useImageInput();
  const [settings, setSettings] = useState<Settings>({ kind: "boja", color: GREEN_SCREEN, blur: "jako" });
  const picked = video.picked;
  const needsImage = settings.kind === "slika" && backgroundImage.picked === null;
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
      canRun={picked !== null && probe.status === "ready" && !needsImage && tooLong === null}
      inputKey={picked ? `${picked.key}:${settings.kind}:${settings.color}:${settings.blur}:${backgroundImage.picked?.key ?? ""}` : null}
      runLabel={T.bgRun[locale]}
      icon={<Scissors aria-hidden="true" className="size-5" />}
      run={(context) => replaceVideoBackground(picked!, settings, backgroundImage.picked?.file ?? null, caps, locale, context)}
      renderResult={(output) => <VideoResult locale={locale} output={output} />}
    >
      {({ busy }) => (
        <div className="space-y-5">
          <VideoInput locale={locale} input={video} disabled={busy} />
          <VideoProbeLine locale={locale} probe={probe} />
          {tooLong ? <p className="type-body-sm font-black text-ink">{tooLong}</p> : null}
          <p className="type-body-sm font-semibold text-muted">{T.bgObjects[locale]}</p>

          <ChoiceChips<BackgroundKind>
            legend={CREA_BACKGROUND_COPY.background[locale]}
            name="crea-video-bg-kind"
            options={(["boja", "zamuceno", "slika"] as const).map((id) => ({ id, label: CREA_BACKGROUND_COPY.kinds[id][locale] }))}
            value={settings.kind}
            onChange={(kind) => setSettings((current) => ({ ...current, kind }))}
            disabled={busy}
          />

          {settings.kind === "boja" ? (
            <fieldset disabled={busy} className="min-w-0">
              <legend className="type-body-sm font-black text-ink">{CREA_BACKGROUND_COPY.color[locale]}</legend>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {SWATCHES.map((swatch) => (
                  <button
                    key={swatch}
                    type="button"
                    aria-label={swatch === GREEN_SCREEN ? T.bgGreen[locale] : swatch}
                    aria-pressed={settings.color === swatch}
                    onClick={() => setSettings((current) => ({ ...current, color: swatch }))}
                    className={cn(
                      "size-11 rounded-full border-2 transition-transform focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink motion-reduce:transition-none",
                      settings.color === swatch ? "scale-110 border-ink" : "border-ink/25 hover:border-ink",
                    )}
                    style={{ backgroundColor: swatch }}
                  />
                ))}
                <label className="inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-ink/25 bg-paper px-3 text-sm font-black text-ink hover:border-ink">
                  <input
                    type="color"
                    value={settings.color}
                    onChange={(event) => {
                      const color = normalizeHex(event.target.value);
                      if (color) setSettings((current) => ({ ...current, color }));
                    }}
                    className="size-7 cursor-pointer rounded-full border-0 bg-transparent"
                  />
                  {CREA_BACKGROUND_COPY.customColor[locale]}
                </label>
              </div>
              {settings.color === GREEN_SCREEN ? <p className="mt-2 type-body-sm font-semibold text-muted">{T.bgGreen[locale]}</p> : null}
            </fieldset>
          ) : null}

          {settings.kind === "zamuceno" ? (
            <ChoiceChips<"blago" | "jako">
              legend={CREA_BACKGROUND_COPY.blur[locale]}
              name="crea-video-bg-blur"
              options={(["blago", "jako"] as const).map((id) => ({ id, label: CREA_BACKGROUND_COPY.blurs[id][locale] }))}
              value={settings.blur}
              onChange={(blur) => setSettings((current) => ({ ...current, blur }))}
              disabled={busy}
            />
          ) : null}

          {settings.kind === "slika" ? (
            <div className="space-y-2">
              <p className="type-body-sm font-black text-ink">{CREA_BACKGROUND_COPY.bgImage[locale]}</p>
              <ImageInput
                locale={locale}
                input={backgroundImage}
                disabled={busy}
                fullScreenDrop={false}
                chooseLabel={CREA_BACKGROUND_COPY.bgImageCta[locale]}
              />
              {needsImage ? <p className="type-body-sm font-semibold text-muted">{CREA_BACKGROUND_COPY.needBgImage[locale]}</p> : null}
            </div>
          ) : null}

          <p className="type-body-sm font-semibold text-muted">{T.bgNoTransparent[locale]}</p>
          {busy ? <p className="type-body-sm font-semibold text-muted">{T.keepTabOpen[locale]}</p> : null}
        </div>
      )}
    </ToolRunner>
  );
}

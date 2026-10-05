"use client";

import { Orbit } from "lucide-react";
import { useReducedMotion } from "motion/react";
import { useState } from "react";

import { ToolRunner, type CreaToolOutput, type ToolRunContext } from "@/components/crea/tool-runner";
import { createCanvas, decodeImage } from "@/components/crea/tools/canvas";
import { ChoiceChips } from "@/components/crea/tools/choice-chips";
import { ImageInput, useImageInput } from "@/components/crea/tools/image-input";
import type { CreaToolProps } from "@/components/crea/tools/types";
import { fillCopy } from "@/lib/crea-copy";
import { CREA_PHOTO3D_COPY as T } from "@/lib/crea-editor-copy";
import type { Photo3dSettings } from "@/components/crea/tools/photo-3d-render";
import { CreaLocalAiError } from "@/lib/crea-local-ai/errors";
import { loadDepthSession } from "@/lib/crea-local-ai/runtime";
import {
  blurDepth,
  depthInputSize,
  normalizeDepth,
  PHOTO3D_DURATIONS,
  PHOTO3D_MOTIONS,
  PHOTO3D_STRENGTHS,
  rgbaToTensor,
} from "@/lib/crea-photo3d";
import type { Locale } from "@/lib/i18n";

type Settings = Photo3dSettings;
type Photo3dExtra = { width: number; height: number; seconds: number };

/** Depth Anything V2 Small → mapa dubine 0..1 (1 = najbliže), sređena za reljef. */
async function estimateDepth(bitmap: ImageBitmap, context: ToolRunContext) {
  const { ort, session } = await loadDepthSession({ signal: context.signal, onProgress: context.reportDownload });
  context.reportRunning();
  const size = depthInputSize(bitmap.width, bitmap.height);
  const { ctx } = createCanvas(size.width, size.height);
  ctx.drawImage(bitmap, 0, 0, size.width, size.height);
  const pixels = ctx.getImageData(0, 0, size.width, size.height).data;
  const input = new ort.Tensor("float32", rgbaToTensor(pixels, size.width, size.height), [1, 3, size.height, size.width]);
  let output: Float32Array;
  let width = size.width;
  let height = size.height;
  try {
    const results = await session.run({ [session.inputNames[0]!]: input });
    const tensor = results[session.outputNames[0]!]!;
    output = tensor.data as Float32Array;
    // Izlaz je [1, H, W] (ili [1, 1, H, W]); poslednje dve dimenzije su mere mape.
    height = Number(tensor.dims[tensor.dims.length - 2]);
    width = Number(tensor.dims[tensor.dims.length - 1]);
  } catch (error) {
    throw new CreaLocalAiError("INFERENCE_FAILED", error);
  } finally {
    input.dispose();
  }
  const depth = blurDepth(normalizeDepth(output), width, height, Math.max(1, Math.round(Math.min(width, height) / 160)));
  return { depth, width, height };
}

async function make3dPhoto(file: File, settings: Settings, context: ToolRunContext): Promise<CreaToolOutput<Photo3dExtra>> {
  const bitmap = await decodeImage(file);
  try {
    const depth = await estimateDepth(bitmap, context);
    if (context.signal.aborted) throw new CreaLocalAiError("ABORTED");
    const { renderPhoto3dVideo } = await import("@/components/crea/tools/photo-3d-render");
    const video = await renderPhoto3dVideo(bitmap, depth, settings, context);
    const base = file.name.replace(/\.[^.]+$/, "").replace(/[^a-z0-9-]+/gi, "-").toLowerCase() || "foto";
    return {
      blob: video.blob,
      kind: "video",
      fileName: `crea-3d-${base}.mp4`,
      previewUrl: URL.createObjectURL(video.blob),
      params: {
        pokret: settings.motion,
        jacina: settings.strength,
        trajanje: settings.duration,
        sirina: video.width,
        visina: video.height,
      },
      extra: { width: video.width, height: video.height, seconds: settings.duration },
    };
  } finally {
    bitmap.close();
  }
}

/**
 * „3D foto" (S33, K10): Depth Anything V2 Small na uređaju → three.js
 * paralaksa (kamera polako kruži) → kratak MP4 kroz mediabunny. 0 kredita;
 * samo računar sa WebGL2 i WebCodecs (registar alata) - telefon i slab uređaj
 * dobijaju poruku iz `ToolRunner`-a umesto alata.
 */
export default function Photo3dTool({ tool, locale, caps, canSave, projectId, source }: CreaToolProps) {
  const image = useImageInput(source);
  const [settings, setSettings] = useState<Settings>({ motion: "krug", strength: "srednje", duration: 5 });

  return (
    <ToolRunner
      tool={tool}
      locale={locale}
      caps={caps}
      canSave={canSave}
      projectId={projectId}
      parentJobId={image.picked?.sourceJobId ?? null}
      canRun={image.picked !== null}
      inputKey={image.picked ? `${image.picked.key}:${settings.motion}:${settings.strength}:${settings.duration}` : null}
      runLabel={T.run[locale]}
      icon={<Orbit aria-hidden="true" className="size-5" />}
      run={(context) => make3dPhoto(image.picked!.file, settings, context)}
      renderResult={(output) => <Photo3dResult locale={locale} output={output} />}
    >
      {({ busy }) => (
        <div className="space-y-5">
          <ImageInput locale={locale} input={image} disabled={busy} />
          <ChoiceChips
            legend={T.motion[locale]}
            name="crea-3d-motion"
            options={PHOTO3D_MOTIONS.map((entry) => ({ id: entry.id, label: entry.label[locale] }))}
            value={settings.motion}
            onChange={(motion) => setSettings((current) => ({ ...current, motion }))}
            disabled={busy}
          />
          <div className="grid gap-5 sm:grid-cols-2">
            <ChoiceChips
              legend={T.strength[locale]}
              name="crea-3d-strength"
              options={PHOTO3D_STRENGTHS.map((entry) => ({ id: entry.id, label: entry.label[locale] }))}
              value={settings.strength}
              onChange={(strength) => setSettings((current) => ({ ...current, strength }))}
              disabled={busy}
            />
            <ChoiceChips
              legend={T.duration[locale]}
              name="crea-3d-duration"
              options={PHOTO3D_DURATIONS.map((seconds) => ({ id: seconds, label: fillCopy(T.seconds[locale], { n: seconds }) }))}
              value={settings.duration}
              onChange={(duration) => setSettings((current) => ({ ...current, duration }))}
              disabled={busy}
            />
          </div>
          <div className="space-y-1">
            <p className="type-body-sm font-semibold text-muted">{T.tips[locale]}</p>
            <p className="type-body-sm font-semibold text-muted">{T.privacy[locale]}</p>
          </div>
        </div>
      )}
    </ToolRunner>
  );
}

function Photo3dResult({ locale, output }: { locale: Locale; output: CreaToolOutput<Photo3dExtra> }) {
  const reduceMotion = useReducedMotion();
  return (
    <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:items-start">
      {output.previewUrl ? (
        <video
          src={output.previewUrl}
          aria-label={T.playLabel[locale]}
          // Uz „smanji pokrete" video ne kreće sam; kontrole su tu da ga korisnik pusti.
          autoPlay={!reduceMotion}
          loop
          muted
          playsInline
          controls
          className="surface-media max-h-96 w-full bg-paper object-contain shadow-[inset_0_0_0_1px_var(--shadow-hard-14)]"
        />
      ) : null}
      <div className="space-y-1">
        <p className="break-all type-body-sm font-semibold text-muted">{output.fileName}</p>
        <p className="font-mono text-sm font-black text-ink">
          {fillCopy(T.result[locale], { w: output.extra.width, h: output.extra.height, s: output.extra.seconds })}
        </p>
      </div>
    </div>
  );
}

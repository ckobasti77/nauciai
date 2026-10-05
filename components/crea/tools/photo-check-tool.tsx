/* eslint-disable @next/next/no-img-element -- rezultat je lokalni `blob:` URL, koji next/image ne obrađuje. */
"use client";

import { CircleAlert, CircleCheck, CircleX, ScanFace } from "lucide-react";

import { ImageInput, useImageInput } from "@/components/crea/tools/image-input";
import { ToolRunner, type CreaToolOutput, type ToolRunContext } from "@/components/crea/tool-runner";
import type { CreaToolProps } from "@/components/crea/tools/types";
import { cn } from "@/components/ui/primitives";
import { CREA_PHOTO_CHECK_COPY, fillCopy } from "@/lib/crea-copy";
import { fitPixels } from "@/lib/crea-image-format";
import { CreaLocalAiError, toLocalAiError } from "@/lib/crea-local-ai/errors";
import { loadFaceDetector } from "@/lib/crea-local-ai/runtime";
import {
  assessPhoto,
  laplacianVariance,
  photoCheckParams,
  SHARPNESS_SAMPLE_PX,
  sharpnessRegion,
  toGrayscale,
  type FaceBox,
  type PhotoCheckResult,
  type PhotoCheckStatus,
} from "@/lib/crea-photo-check";
import type { Locale } from "@/lib/i18n";

/**
 * Boje pečata na SAČUVANOJ slici: ona je fajl, ne deo interfejsa, pa izgleda isto
 * u obe teme - brend mastilo, žuta i papir (`app/globals.css`, svetla tema).
 */
const STAMP = { ink: "#0e3158", yellow: "#f4be30", paper: "#fffdf8" } as const;

function measureSharpness(bitmap: ImageBitmap, face: FaceBox | null): number {
  const region = sharpnessRegion(face, bitmap.width, bitmap.height);
  const scale = SHARPNESS_SAMPLE_PX / Math.max(region.width, region.height);
  const width = Math.max(3, Math.round(region.width * scale));
  const height = Math.max(3, Math.round(region.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new CreaLocalAiError("UNSUPPORTED");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, region.x, region.y, region.width, region.height, 0, 0, width, height);
  const { data } = ctx.getImageData(0, 0, width, height);
  return laplacianVariance(toGrayscale(data, width, height), width, height);
}

/** Fotka sa okvirom oko lica i pečatom ocene - to je rad koji ide u galeriju. */
async function drawReport(bitmap: ImageBitmap, result: PhotoCheckResult, faces: FaceBox[], locale: Locale) {
  const fit = fitPixels(bitmap.width, bitmap.height);
  const scale = fit.width / bitmap.width;
  const canvas = document.createElement("canvas");
  canvas.width = fit.width;
  canvas.height = fit.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new CreaLocalAiError("UNSUPPORTED");
  ctx.drawImage(bitmap, 0, 0, fit.width, fit.height);

  const unit = Math.max(2, Math.round(Math.min(fit.width, fit.height) / 200));
  for (const face of faces) {
    const x = face.x * scale;
    const y = face.y * scale;
    ctx.lineWidth = unit * 3;
    ctx.strokeStyle = STAMP.ink;
    ctx.strokeRect(x, y, face.width * scale, face.height * scale);
    ctx.lineWidth = unit * 1.5;
    ctx.strokeStyle = STAMP.yellow;
    ctx.strokeRect(x, y, face.width * scale, face.height * scale);
  }

  const family = getComputedStyle(document.body).fontFamily || "sans-serif";
  const fontSize = Math.max(14, Math.round(Math.min(fit.width, fit.height) / 18));
  ctx.font = `900 ${fontSize}px ${family}`;
  const label = CREA_PHOTO_CHECK_COPY.stamp[result.verdict][locale];
  const padX = fontSize * 0.6;
  const boxWidth = ctx.measureText(label).width + padX * 2;
  const boxHeight = fontSize * 1.6;
  const margin = fontSize * 0.6;
  ctx.fillStyle = STAMP.ink;
  ctx.fillRect(margin + unit * 2, margin + unit * 2, boxWidth, boxHeight);
  ctx.fillStyle = result.verdict === "ok" ? STAMP.yellow : STAMP.paper;
  ctx.fillRect(margin, margin, boxWidth, boxHeight);
  ctx.lineWidth = unit;
  ctx.strokeStyle = STAMP.ink;
  ctx.strokeRect(margin, margin, boxWidth, boxHeight);
  ctx.fillStyle = STAMP.ink;
  ctx.textBaseline = "middle";
  ctx.fillText(label, margin + padX, margin + boxHeight / 2);

  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
}

async function checkPhoto(file: File, locale: Locale, context: ToolRunContext): Promise<CreaToolOutput<PhotoCheckResult>> {
  const detector = await loadFaceDetector({ signal: context.signal, onProgress: context.reportDownload });
  context.reportRunning();

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch (error) {
    throw new CreaLocalAiError("BAD_INPUT", error);
  }

  try {
    let faces: FaceBox[];
    try {
      faces = detector.detect(bitmap).detections.flatMap((detection) =>
        detection.boundingBox
          ? [
              {
                x: detection.boundingBox.originX,
                y: detection.boundingBox.originY,
                width: detection.boundingBox.width,
                height: detection.boundingBox.height,
                score: detection.categories[0]?.score ?? 0,
              },
            ]
          : [],
      );
    } catch (error) {
      throw toLocalAiError(error, "INFERENCE_FAILED");
    }
    if (context.signal.aborted) throw new CreaLocalAiError("ABORTED");

    const preliminary = assessPhoto({ width: bitmap.width, height: bitmap.height, faces, sharpness: 0 });
    const sharpness = measureSharpness(bitmap, preliminary.mainFace);
    const result = assessPhoto({ width: bitmap.width, height: bitmap.height, faces, sharpness });
    const blob = await drawReport(bitmap, result, faces, locale);
    if (!blob) throw new CreaLocalAiError("INFERENCE_FAILED");

    const base = file.name.replace(/\.[^.]*$/, "").trim().slice(0, 70) || "fotka";
    return {
      blob,
      kind: "image",
      fileName: `${base}-provera.jpg`,
      previewUrl: URL.createObjectURL(blob),
      params: photoCheckParams(result),
      extra: result,
    };
  } finally {
    bitmap.close();
  }
}

export default function PhotoCheckTool({ tool, locale, caps, canSave, projectId, source }: CreaToolProps) {
  const image = useImageInput(source);

  return (
    <ToolRunner
      tool={tool}
      locale={locale}
      caps={caps}
      canSave={canSave}
      projectId={projectId}
      parentJobId={image.picked?.sourceJobId ?? null}
      canRun={image.picked !== null}
      inputKey={image.picked?.key ?? null}
      icon={<ScanFace aria-hidden="true" className="size-5" />}
      run={(context) => checkPhoto(image.picked!.file, locale, context)}
      renderResult={(output) => <PhotoCheckReport locale={locale} output={output} />}
    >
      {({ busy }) => <ImageInput locale={locale} input={image} disabled={busy} />}
    </ToolRunner>
  );
}

const STATUS_ICON: Record<PhotoCheckStatus, typeof CircleCheck> = {
  ok: CircleCheck,
  warn: CircleAlert,
  fail: CircleX,
};

const STATUS_TONE: Record<PhotoCheckStatus, string> = {
  ok: "text-ink",
  warn: "text-amber-700 dark:text-amber-300",
  fail: "text-red-700 dark:text-red-300",
};

function PhotoCheckReport({ locale, output }: { locale: Locale; output: CreaToolOutput<PhotoCheckResult> }) {
  const result = output.extra;
  const VerdictIcon = STATUS_ICON[result.verdict];
  return (
    <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:items-start">
      {output.previewUrl ? (
        <img
          src={output.previewUrl}
          alt={CREA_PHOTO_CHECK_COPY.verdict[result.verdict][locale]}
          className="surface-media max-h-96 w-full bg-paper object-contain shadow-[inset_0_0_0_1px_var(--shadow-hard-14)]"
        />
      ) : null}
      <div>
        <p className={cn("flex items-center gap-2 type-h4", STATUS_TONE[result.verdict])}>
          <VerdictIcon aria-hidden="true" className="size-5 shrink-0" />
          {CREA_PHOTO_CHECK_COPY.verdict[result.verdict][locale]}
        </p>
        <ul className="mt-3 divide-y divide-line border-y border-line">
          {result.items.map((item) => {
            const Icon = STATUS_ICON[item.status];
            return (
              <li key={item.id} className="flex items-start gap-2 py-2.5 type-body-sm font-semibold text-ink">
                <Icon aria-hidden="true" className={cn("mt-0.5 size-4 shrink-0", STATUS_TONE[item.status])} />
                <span>{fillCopy(CREA_PHOTO_CHECK_COPY.items[item.id][item.status][locale], { n: item.value })}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

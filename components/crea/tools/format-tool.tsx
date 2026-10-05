/* eslint-disable @next/next/no-img-element -- rezultat je lokalni `blob:` URL, koji next/image ne obrađuje. */
"use client";

import { FileImage, ShieldCheck } from "lucide-react";
import { useState } from "react";

import { ImageInput, useImageInput } from "@/components/crea/tools/image-input";
import { ToolRunner, type CreaToolOutput, type ToolRunContext } from "@/components/crea/tool-runner";
import type { CreaToolProps } from "@/components/crea/tools/types";
import { cn } from "@/components/ui/primitives";
import { CREA_FORMAT_COPY, fillCopy } from "@/lib/crea-copy";
import {
  CREA_IMAGE_FORMAT_IDS,
  CREA_IMAGE_FORMATS,
  encoderQuality,
  fitPixels,
  needsWasmEncoder,
  outputFileName,
  QUALITY_DEFAULT,
  QUALITY_MAX,
  QUALITY_MIN,
  sensitiveMetadata,
  sizeChangePercent,
  type CreaImageFormat,
  type MetadataKind,
} from "@/lib/crea-image-format";
import { CreaLocalAiError, toLocalAiError } from "@/lib/crea-local-ai/errors";
import { formatBytes } from "@/lib/crea-local-ai/progress";
import type { Locale } from "@/lib/i18n";

type FormatExtra = {
  beforeBytes: number;
  removed: MetadataKind[];
  /** Nova slika je ponovo pročitana i u njoj nema ličnih podataka. */
  verifiedClean: boolean;
  width: number;
  height: number;
  scaled: boolean;
};

async function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number | undefined): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Konverzija u browseru. Sliku dekodira `createImageBitmap` (uz okretanje po
 * EXIF orijentaciji), platno je ponovo kodira - i time briše SVE skrivene
 * podatke, jer platno piše samo piksele. Safari ne ume WebP kroz platno, pa tada
 * kodira jSquash (WASM, učitava se tek tada).
 */
async function convertImage(
  file: File,
  format: CreaImageFormat,
  quality: number,
  context: ToolRunContext,
): Promise<CreaToolOutput<FormatExtra>> {
  context.reportRunning();
  const { default: exifr } = await import("exifr");
  const before = await exifr.parse(file).catch(() => undefined);

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch (error) {
    throw new CreaLocalAiError("BAD_INPUT", error);
  }
  if (context.signal.aborted) throw new CreaLocalAiError("ABORTED");

  const fit = fitPixels(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = fit.width;
  canvas.height = fit.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new CreaLocalAiError("UNSUPPORTED");
  if (format === "jpeg") {
    // JPG nema providnost: providni delovi bi postali crni.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, fit.width, fit.height);
  }
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, fit.width, fit.height);
  bitmap.close();

  const spec = CREA_IMAGE_FORMATS[format];
  let blob = await canvasToBlob(canvas, spec.mime, encoderQuality(format, quality));
  if (needsWasmEncoder(format, blob?.type)) {
    if (format !== "webp") throw new CreaLocalAiError("UNSUPPORTED");
    try {
      const { default: encodeWebp } = await import("@jsquash/webp/encode");
      const pixels = ctx.getImageData(0, 0, fit.width, fit.height);
      const encoded = await encodeWebp(pixels, { quality });
      blob = new Blob([encoded], { type: spec.mime });
    } catch (error) {
      throw toLocalAiError(error, "UNSUPPORTED");
    }
  }
  if (!blob) throw new CreaLocalAiError("INFERENCE_FAILED");
  if (context.signal.aborted) throw new CreaLocalAiError("ABORTED");

  const after = await exifr.parse(blob).catch(() => undefined);
  const removed = sensitiveMetadata(before);
  return {
    blob,
    kind: "image",
    fileName: outputFileName(file.name, format),
    previewUrl: URL.createObjectURL(blob),
    params: {
      format,
      ...(spec.lossy ? { kvalitet: quality } : {}),
      sirina: fit.width,
      visina: fit.height,
      preKB: Math.round(file.size / 1024),
      posleKB: Math.round(blob.size / 1024),
      uklonjeno: removed.length > 0 ? removed.join(",") : "nista",
    },
    extra: {
      beforeBytes: file.size,
      removed,
      verifiedClean: sensitiveMetadata(after).length === 0,
      width: fit.width,
      height: fit.height,
      scaled: fit.scaled,
    },
  };
}

export default function FormatTool({ tool, locale, caps, canSave, projectId }: CreaToolProps) {
  const image = useImageInput();
  const [format, setFormat] = useState<CreaImageFormat>("webp");
  const [quality, setQuality] = useState(QUALITY_DEFAULT);
  const lossy = CREA_IMAGE_FORMATS[format].lossy;

  return (
    <ToolRunner
      tool={tool}
      locale={locale}
      caps={caps}
      canSave={canSave}
      projectId={projectId}
      canRun={image.picked !== null}
      inputKey={image.picked ? `${image.picked.key}:${format}:${quality}` : null}
      icon={<FileImage aria-hidden="true" className="size-5" />}
      run={(context) => convertImage(image.picked!.file, format, quality, context)}
      renderResult={(output) => <FormatResult locale={locale} output={output} />}
    >
      {({ busy }) => (
        <div className="space-y-5">
          <ImageInput locale={locale} input={image} disabled={busy} />

          <fieldset disabled={busy}>
            <legend className="type-body-sm font-black text-ink">{CREA_FORMAT_COPY.format[locale]}</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {CREA_IMAGE_FORMAT_IDS.map((id) => (
                <label
                  key={id}
                  className={cn(
                    "inline-flex min-h-11 cursor-pointer items-center rounded-full border-2 px-4 text-sm font-black transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink motion-reduce:transition-none",
                    format === id ? "border-ink bg-ink text-paper-strong" : "border-ink/25 bg-paper text-ink hover:border-ink",
                  )}
                >
                  <input
                    type="radio"
                    name="crea-format"
                    value={id}
                    checked={format === id}
                    onChange={() => setFormat(id)}
                    className="sr-only"
                  />
                  {CREA_FORMAT_COPY.formats[id][locale]}
                </label>
              ))}
            </div>
          </fieldset>

          {lossy ? (
            <div>
              <label htmlFor="crea-format-quality" className="flex items-baseline justify-between gap-3">
                <span className="type-body-sm font-black text-ink">{CREA_FORMAT_COPY.quality[locale]}</span>
                <span className="font-mono text-sm font-black text-ink">{quality}</span>
              </label>
              <input
                id="crea-format-quality"
                type="range"
                min={QUALITY_MIN}
                max={QUALITY_MAX}
                step={1}
                value={quality}
                disabled={busy}
                onChange={(event) => setQuality(Number(event.target.value))}
                className="mt-2 h-11 w-full cursor-pointer accent-ink"
              />
              <p className="type-body-sm font-semibold text-muted">{CREA_FORMAT_COPY.qualityHint[locale]}</p>
            </div>
          ) : (
            <p className="type-body-sm font-semibold text-muted">{CREA_FORMAT_COPY.pngNoQuality[locale]}</p>
          )}
        </div>
      )}
    </ToolRunner>
  );
}

function FormatResult({ locale, output }: { locale: Locale; output: CreaToolOutput<FormatExtra> }) {
  const { extra } = output;
  const change = sizeChangePercent(extra.beforeBytes, output.blob.size);
  const changeText =
    change < 0
      ? fillCopy(CREA_FORMAT_COPY.smaller[locale], { n: -change })
      : change > 0
        ? fillCopy(CREA_FORMAT_COPY.bigger[locale], { n: change })
        : CREA_FORMAT_COPY.same[locale];
  const removedList = extra.removed.map((kind) => CREA_FORMAT_COPY.metadata[kind][locale]).join(", ");

  return (
    <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:items-start">
      {output.previewUrl ? (
        <img
          src={output.previewUrl}
          alt={output.fileName}
          className="surface-media max-h-80 w-full bg-paper object-contain shadow-[inset_0_0_0_1px_var(--shadow-hard-14)]"
        />
      ) : null}
      <dl className="space-y-3">
        <div>
          <dt className="type-body-sm font-semibold text-muted">{output.fileName}</dt>
          <dd className="mt-0.5 type-h4 text-ink">
            <span className="font-mono">
              {formatBytes(extra.beforeBytes, locale)} → {formatBytes(output.blob.size, locale)}
            </span>
            <span className="ml-2 rounded-full border-2 border-ink bg-yellow px-2 py-0.5 text-xs font-black">
              {changeText}
            </span>
          </dd>
        </div>
        <div className="surface-inset bg-paper p-3">
          <dt className="flex items-center gap-2 type-body-sm font-black text-ink">
            <ShieldCheck aria-hidden="true" className="size-4" />
            {CREA_FORMAT_COPY.privacyTitle[locale]}
          </dt>
          <dd className="mt-1 type-body-sm font-semibold text-ink">
            {extra.removed.length > 0
              ? fillCopy(CREA_FORMAT_COPY.privacyFound[locale], { list: removedList })
              : CREA_FORMAT_COPY.privacyNone[locale]}
          </dd>
        </div>
        {extra.scaled ? (
          <dd className="type-body-sm font-semibold text-muted">
            {fillCopy(CREA_FORMAT_COPY.scaled[locale], { w: extra.width, h: extra.height })}
          </dd>
        ) : null}
      </dl>
    </div>
  );
}

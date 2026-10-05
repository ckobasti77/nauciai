/* eslint-disable @next/next/no-img-element -- ulaz i rezultat su lokalni `blob:` URL-ovi, koje next/image ne obrađuje. */
"use client";

import { ScanFace } from "lucide-react";
import { useState } from "react";

import { ToolRunner, type CreaToolOutput, type ToolRunContext } from "@/components/crea/tool-runner";
import { canvasToBlob, createCanvas, decodeImage, drawScaled, resizeCanvas } from "@/components/crea/tools/canvas";
import { ChoiceChips } from "@/components/crea/tools/choice-chips";
import { ImageInput, useImageInput } from "@/components/crea/tools/image-input";
import type { CreaToolProps } from "@/components/crea/tools/types";
import { fillCopy } from "@/lib/crea-copy";
import { cropFileName, cropOutputType, cropPreset, outputSize, SMART_CROP_PRESET_IDS, type Box, type CropPresetId } from "@/lib/crea-crop";
import { CREA_IMAGE_TOOL_COPY, CREA_SMART_CROP_COPY } from "@/lib/crea-image-tools-copy";
import { fitPixels } from "@/lib/crea-image-format";
import { CreaLocalAiError, toLocalAiError } from "@/lib/crea-local-ai/errors";
import { loadFaceDetector } from "@/lib/crea-local-ai/runtime";
import { detectionTiles, mergeFaces, smartCropBox, type SmartCropResult } from "@/lib/crea-smartcrop";
import type { Locale } from "@/lib/i18n";

/** `smartcrop` gleda smanjenu sliku - predlog kadra ne treba više detalja, a brz je i na telefonu. */
const ANALYSIS_MAX_SIDE = 512;

type SmartExtra = {
  result: SmartCropResult;
  image: { width: number; height: number };
  /** Ulaz za „pre": ista slika koju je korisnik izabrao. */
  inputUrl: string;
};

async function smartCrop(
  file: File,
  inputUrl: string,
  presetId: CropPresetId,
  context: ToolRunContext,
): Promise<CreaToolOutput<SmartExtra>> {
  const preset = cropPreset(presetId);
  const detector = await loadFaceDetector({ signal: context.signal, onProgress: context.reportDownload });
  context.reportRunning();

  const bitmap = await decodeImage(file);
  try {
    // Široka/visoka fotka se pregleda kroz kvadratne prozore (`detectionTiles`), da lice ne bude premalo za BlazeFace.
    let faces: Box[];
    try {
      const found: Array<Box & { score: number }> = [];
      for (const tile of detectionTiles(bitmap.width, bitmap.height)) {
        const { canvas: window, ctx: windowCtx } = createCanvas(tile.width, tile.height);
        windowCtx.drawImage(bitmap, tile.x, tile.y, tile.width, tile.height, 0, 0, tile.width, tile.height);
        for (const detection of detector.detect(window).detections) {
          if (!detection.boundingBox) continue;
          found.push({
            x: tile.x + detection.boundingBox.originX,
            y: tile.y + detection.boundingBox.originY,
            width: detection.boundingBox.width,
            height: detection.boundingBox.height,
            score: detection.categories[0]?.score ?? 0,
          });
        }
      }
      faces = mergeFaces(found);
    } catch (error) {
      throw new CreaLocalAiError("INFERENCE_FAILED", error);
    }

    // Bez lica: `smartcrop` (ivice, zasićenost, koža) predloži gde je predmet.
    let suggestion: Box | null = null;
    if (faces.length === 0) {
      const { canvas: small, scale } = drawScaled(bitmap, ANALYSIS_MAX_SIDE);
      const aspect = preset.aspect ?? 1;
      const width = Math.min(small.width, Math.round(small.height * aspect));
      const height = Math.min(small.height, Math.round(width / aspect));
      try {
        const { default: smartcrop } = await import("smartcrop");
        const { topCrop } = await smartcrop.crop(small, { width, height, minScale: 1 });
        suggestion = {
          x: topCrop.x / scale,
          y: topCrop.y / scale,
          width: topCrop.width / scale,
          height: topCrop.height / scale,
        };
      } catch (error) {
        throw toLocalAiError(error, "INFERENCE_FAILED");
      }
    }
    if (context.signal.aborted) throw new CreaLocalAiError("ABORTED");

    const image = { width: bitmap.width, height: bitmap.height };
    const result = smartCropBox({ image, aspect: preset.aspect ?? 1, faces, suggestion });
    const box = result.crop;
    const size = outputSize(box, preset, null);

    const mid = fitPixels(box.width, box.height);
    const { canvas, ctx } = createCanvas(mid.width, mid.height);
    const type = cropOutputType(file.type);
    if (type === "image/jpeg") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, mid.width, mid.height);
    }
    ctx.drawImage(bitmap, box.x, box.y, box.width, box.height, 0, 0, mid.width, mid.height);
    const out = await resizeCanvas(canvas, size.width, size.height);
    const blob = await canvasToBlob(out, type, type === "image/png" ? undefined : 0.92);

    return {
      blob,
      kind: "image",
      fileName: cropFileName(file.name, blob.type),
      previewUrl: URL.createObjectURL(blob),
      params: {
        format: preset.id,
        sirina: size.width,
        visina: size.height,
        lica: result.facesFound,
        uKadru: result.facesInside,
        kadar: result.reason,
      },
      extra: { result, image, inputUrl },
    };
  } finally {
    bitmap.close();
  }
}

export default function SmartCropTool({ tool, locale, caps, canSave, projectId, source }: CreaToolProps) {
  const image = useImageInput(source);
  const [presetId, setPresetId] = useState<CropPresetId>("prica");

  return (
    <ToolRunner
      tool={tool}
      locale={locale}
      caps={caps}
      canSave={canSave}
      projectId={projectId}
      parentJobId={image.picked?.sourceJobId ?? null}
      canRun={image.picked !== null}
      inputKey={image.picked ? `${image.picked.key}:${presetId}` : null}
      icon={<ScanFace aria-hidden="true" className="size-5" />}
      run={(context) => smartCrop(image.picked!.file, image.picked!.url, presetId, context)}
      renderResult={(output) => <SmartCropResultView locale={locale} output={output} />}
    >
      {({ busy }) => (
        <div className="space-y-5">
          <ImageInput locale={locale} input={image} disabled={busy} />
          <ChoiceChips
            legend={CREA_IMAGE_TOOL_COPY.format[locale]}
            name="crea-smart-crop-preset"
            options={SMART_CROP_PRESET_IDS.map((id) => {
              const preset = cropPreset(id);
              return { id, label: preset.label[locale], hint: preset.hint[locale] };
            })}
            value={presetId}
            onChange={setPresetId}
            disabled={busy}
          />
        </div>
      )}
    </ToolRunner>
  );
}

function SmartCropResultView({ locale, output }: { locale: Locale; output: CreaToolOutput<SmartExtra> }) {
  const { result, image, inputUrl } = output.extra;
  const frame = result.crop;
  const pct = (value: number, total: number) => `${(value / total) * 100}%`;
  const reason = CREA_SMART_CROP_COPY.reason[result.reason][locale];

  return (
    <div className="space-y-4">
      <p className="type-body font-black text-ink">
        {fillCopy(reason, { inside: result.facesInside, found: result.facesFound })}
      </p>
      <div className="grid gap-4 sm:grid-cols-2 sm:items-start">
        <figure className="space-y-2">
          {/* Omotač je tačno veličine slike, pa se okvir isečka crta u procentima originala. */}
          <div className="surface-media relative mx-auto w-fit overflow-hidden bg-paper">
            <img src={inputUrl} alt="" className="block max-h-80 max-w-full" />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute outline outline-[3px] outline-yellow shadow-[0_0_0_9999px_color-mix(in_srgb,var(--scrim)_45%,transparent)]"
              style={{
                left: pct(frame.x, image.width),
                top: pct(frame.y, image.height),
                width: pct(frame.width, image.width),
                height: pct(frame.height, image.height),
              }}
            />
          </div>
          <figcaption className="type-body-sm font-semibold text-muted">
            {CREA_IMAGE_TOOL_COPY.before[locale]} · {CREA_SMART_CROP_COPY.frameLabel[locale]}
          </figcaption>
        </figure>
        <figure className="space-y-2">
          {output.previewUrl ? (
            <img
              src={output.previewUrl}
              alt={output.fileName}
              className="surface-media block max-h-80 w-full bg-paper object-contain shadow-[inset_0_0_0_1px_var(--shadow-hard-14)]"
            />
          ) : null}
          <figcaption className="font-mono text-sm font-black text-ink">
            {CREA_IMAGE_TOOL_COPY.after[locale]} ·{" "}
            {fillCopy(CREA_IMAGE_TOOL_COPY.outputSize[locale], {
              w: Number(output.params?.sirina ?? 0),
              h: Number(output.params?.visina ?? 0),
            })}
          </figcaption>
        </figure>
      </div>
    </div>
  );
}

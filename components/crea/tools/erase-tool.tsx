"use client";

import { Eraser } from "lucide-react";
import { useCallback, useRef, useState } from "react";

import BeforeAfter from "@/components/crea/before-after";
import { ToolRunner, type CreaToolOutput, type ToolRunContext } from "@/components/crea/tool-runner";
import { canvasToBlob, createCanvas } from "@/components/crea/tools/canvas";
import { ImageInput, useImageInput } from "@/components/crea/tools/image-input";
import {
  outputMaxSide,
  outputTypeFor,
  prepareMaskEdit,
  renderSized,
  resultFileName,
  scaleMask,
  softMask,
  useWorkImage,
  type WorkImage,
} from "@/components/crea/tools/mask-canvas";
import { MaskEditor, type MaskEditorHandle } from "@/components/crea/tools/mask-editor";
import { PaidEditPanel } from "@/components/crea/tools/paid-edit";
import type { CreaToolProps } from "@/components/crea/tools/types";
import { CREA_ERASE_COPY as T, CREA_PAID_EDIT_COPY } from "@/lib/crea-edit-copy";
import { CREA_IMAGE_TOOL_COPY } from "@/lib/crea-image-tools-copy";
import { CreaLocalAiError } from "@/lib/crea-local-ai/errors";
import { loadOnnxModel } from "@/lib/crea-local-ai/runtime";
import { dilateMask, inpaintCrop, isLargeObject, maskIsUsable, maskStats, miganMask, workSize, type MaskStats } from "@/lib/crea-mask";
import { BRUSH_ROUTES } from "@/lib/crea-paid-edit";
import type { Locale } from "@/lib/i18n";

type EraseExtra = { width: number; height: number };

/** Isečak koji ide modelu: MI-GAN radi na 512 px, pa veći isečak samo troši memoriju. */
const MIGAN_MAX_SIDE = 1024;

/**
 * MI-GAN na uređaju: isečak oko predmeta (sa okolinom) ide u model, a zakrpa
 * se lepi nazad kroz proširenu masku sa mekom ivicom. Ostatak fotke ostaje
 * netaknut, u punoj veličini.
 */
async function erase(
  work: WorkImage,
  file: File,
  maskCanvas: HTMLCanvasElement,
  mobile: boolean,
  context: ToolRunContext,
): Promise<CreaToolOutput<EraseExtra>> {
  const { ort, session } = await loadOnnxModel("migan", "wasm", { signal: context.signal, onProgress: context.reportDownload });
  context.reportRunning();
  const { canvas: photo, ctx: photoCtx } = renderSized(work.full, outputMaxSide(mobile));
  const { width, height } = photo;

  const raw = scaleMask(maskCanvas, width, height, true);
  // Proširenje pokriva ivicu i senku koje četkica promaši (~0,6 % slike).
  const grow = Math.max(3, Math.round(Math.max(width, height) * 0.006));
  const mask = dilateMask(raw, width, height, grow);
  const stats = maskStats(mask, width, height);
  if (!stats.box) throw new CreaLocalAiError("BAD_INPUT");

  const crop = inpaintCrop(stats.box, width, height);
  const size = workSize(crop.width, crop.height, MIGAN_MAX_SIDE);
  const { canvas: cropCanvas, ctx: cropCtx } = createCanvas(size.width, size.height);
  cropCtx.drawImage(photo, crop.x, crop.y, crop.width, crop.height, 0, 0, size.width, size.height);
  const pixels = cropCtx.getImageData(0, 0, size.width, size.height).data;

  // Maska isečka u veličini modela.
  const cropMaskFull = new Uint8ClampedArray(crop.width * crop.height);
  for (let y = 0; y < crop.height; y++) {
    cropMaskFull.set(mask.subarray((crop.y + y) * width + crop.x, (crop.y + y) * width + crop.x + crop.width), y * crop.width);
  }
  const { canvas: cropMaskCanvas, ctx: cropMaskCtx } = createCanvas(crop.width, crop.height);
  const maskImage = cropMaskCtx.createImageData(crop.width, crop.height);
  for (let i = 0; i < cropMaskFull.length; i++) maskImage.data[i * 4 + 3] = cropMaskFull[i];
  cropMaskCtx.putImageData(maskImage, 0, 0);
  const modelMask = scaleMask(cropMaskCanvas, size.width, size.height, true);

  const plane = size.width * size.height;
  const imageTensor = new Uint8Array(plane * 3);
  for (let i = 0; i < plane; i++) {
    imageTensor[i] = pixels[i * 4];
    imageTensor[plane + i] = pixels[i * 4 + 1];
    imageTensor[2 * plane + i] = pixels[i * 4 + 2];
  }
  const inputs = {
    image: new ort.Tensor("uint8", imageTensor, [1, 3, size.height, size.width]),
    mask: new ort.Tensor("uint8", miganMask(modelMask), [1, 1, size.height, size.width]),
  };
  let output: Uint8Array;
  try {
    const results = await session.run(inputs);
    output = results[session.outputNames[0]!]!.data as Uint8Array;
  } catch (error) {
    throw new CreaLocalAiError("INFERENCE_FAILED", error);
  } finally {
    inputs.image.dispose();
    inputs.mask.dispose();
  }
  if (context.signal.aborted) throw new CreaLocalAiError("ABORTED");

  // Zakrpa → platno isečka → nazad u fotku, samo kroz meku masku.
  const patchImage = cropCtx.createImageData(size.width, size.height);
  for (let i = 0; i < plane; i++) {
    patchImage.data[i * 4] = output[i];
    patchImage.data[i * 4 + 1] = output[plane + i];
    patchImage.data[i * 4 + 2] = output[2 * plane + i];
    patchImage.data[i * 4 + 3] = 255;
  }
  cropCtx.putImageData(patchImage, 0, 0);
  const { canvas: patch, ctx: patchCtx } = createCanvas(crop.width, crop.height);
  patchCtx.drawImage(cropCanvas, 0, 0, crop.width, crop.height);
  patchCtx.globalCompositeOperation = "destination-in";
  patchCtx.drawImage(softMask(cropMaskFull, crop.width, crop.height, Math.max(2, Math.round(grow / 2))), 0, 0);
  photoCtx.drawImage(patch, crop.x, crop.y);

  const type = outputTypeFor(file);
  const blob = await canvasToBlob(photo, type, 0.92);
  return {
    blob,
    kind: "image",
    fileName: resultFileName("obrisano", file, type),
    previewUrl: URL.createObjectURL(blob),
    params: { sirina: width, visina: height, oznaceno: Math.round(stats.coverage * 1000) / 10 },
    extra: { width, height },
  };
}

/**
 * Obriši predmet (S13, K11): označi predmet (četkica, klik), MI-GAN ga briše
 * na uređaju (0 kr). Za veliki predmet, gde zakrpa ume da se razmaže, tu je i
 * plaćeni put - ista maska ide Ideogramu (ili obojena zona Nano Banani).
 */
export default function EraseTool({ tool, locale, caps, canSave, projectId, source, paid }: CreaToolProps) {
  const image = useImageInput(source);
  const { work } = useWorkImage(image.picked?.file ?? null);
  const editor = useRef<MaskEditorHandle | null>(null);
  const [stats, setStats] = useState<MaskStats>({ coverage: 0, box: null });
  const onStats = useCallback((next: MaskStats) => setStats(next), []);
  const usable = maskIsUsable(stats);
  const big = work !== null && isLargeObject(stats, work.work.width, work.work.height);
  const maskKey = `${stats.coverage.toFixed(5)}:${stats.box ? `${stats.box.x},${stats.box.y},${stats.box.width},${stats.box.height}` : ""}`;

  return (
    <ToolRunner
      tool={tool}
      locale={locale}
      caps={caps}
      canSave={canSave}
      projectId={projectId}
      parentJobId={image.picked?.sourceJobId ?? null}
      canRun={work !== null && usable}
      inputKey={image.picked ? `${image.picked.key}:${maskKey}` : null}
      runLabel={T.run[locale]}
      icon={<Eraser aria-hidden="true" className="size-5" />}
      run={(context) => {
        const maskCanvas = editor.current?.maskCanvas();
        if (!work || !maskCanvas || !image.picked) throw new CreaLocalAiError("BAD_INPUT");
        return erase(work, image.picked.file, maskCanvas, caps?.mobile === true, context);
      }}
      renderResult={(output) => <EraseResult locale={locale} output={output} beforeUrl={image.picked?.url ?? ""} />}
    >
      {({ busy }) => (
        <div className="space-y-5">
          <ImageInput locale={locale} input={image} disabled={busy} />
          {work && image.picked ? (
            <MaskEditor
              key={image.picked.key}
              ref={editor}
              locale={locale}
              image={work.work}
              tools={["cetkica", "gumica", "klik"]}
              disabled={busy}
              caps={caps}
              onStats={onStats}
            />
          ) : null}
          {work && !usable ? <p className="type-body-sm font-semibold text-muted">{T.needMask[locale]}</p> : null}
          {work ? <p className="type-body-sm font-semibold text-muted">{T.tip[locale]}</p> : null}
          {big && image.picked ? (
            <div className="surface-inset space-y-3 bg-paper p-4">
              <p className="type-body font-black text-ink">{T.bigTitle[locale]}</p>
              <p className="type-body-sm font-semibold text-muted">{T.bigBody[locale]}</p>
              <PaidEditPanel
                locale={locale}
                routes={BRUSH_ROUTES}
                purpose="erase"
                ready={usable}
                notReadyReason={CREA_PAID_EDIT_COPY.needMask[locale]}
                prepare={async (route) => {
                  const maskCanvas = editor.current?.maskCanvas();
                  if (!work || !maskCanvas) throw new Error("NEISPRAVNI_ULAZI");
                  return prepareMaskEdit(work, maskCanvas, route);
                }}
                parentJobId={image.picked.sourceJobId ?? null}
                projectId={projectId}
                canSubmit={canSave}
                paid={paid}
              />
            </div>
          ) : null}
        </div>
      )}
    </ToolRunner>
  );
}

function EraseResult({ locale, output, beforeUrl }: { locale: Locale; output: CreaToolOutput<EraseExtra>; beforeUrl: string }) {
  return (
    <div className="space-y-2">
      {output.previewUrl ? (
        <BeforeAfter
          beforeUrl={beforeUrl}
          afterUrl={output.previewUrl}
          beforeLabel={CREA_IMAGE_TOOL_COPY.before[locale]}
          afterLabel={CREA_IMAGE_TOOL_COPY.after[locale]}
          label={`${CREA_IMAGE_TOOL_COPY.before[locale]} / ${CREA_IMAGE_TOOL_COPY.after[locale]}`}
        />
      ) : null}
      <p className="font-mono text-sm font-black text-ink">
        {output.extra.width} × {output.extra.height} px
      </p>
    </div>
  );
}

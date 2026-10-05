"use client";

import { Maximize2 } from "lucide-react";
import { useEffect, useState } from "react";

import BeforeAfter from "@/components/crea/before-after";
import { ToolRunner, type CreaToolOutput, type ToolRunContext } from "@/components/crea/tool-runner";
import { canvasToBlob, createCanvas, decodeImage } from "@/components/crea/tools/canvas";
import { ImageInput, useImageInput } from "@/components/crea/tools/image-input";
import { outputTypeFor, resultFileName } from "@/components/crea/tools/mask-canvas";
import type { CreaToolProps } from "@/components/crea/tools/types";
import { fillCopy } from "@/lib/crea-copy";
import { classifyDevice, type CreaDeviceCaps } from "@/lib/crea-device";
import { CREA_UPSCALE_COPY as T } from "@/lib/crea-edit-copy";
import { CREA_IMAGE_TOOL_COPY } from "@/lib/crea-image-tools-copy";
import { CreaLocalAiError } from "@/lib/crea-local-ai/errors";
import { loadOnnxModel, type OnnxBackend, type OnnxModel } from "@/lib/crea-local-ai/runtime";
import { checkUpscale, planTiles, sampleTile, upscaleTileSide, writeTile } from "@/lib/crea-upscale";
import type { Locale } from "@/lib/i18n";

type UpscaleExtra = { width: number; height: number };

function backendFor(caps: CreaDeviceCaps | null): OnnxBackend {
  return caps && classifyDevice(caps) === "desktop-gpu" ? "webgpu" : "wasm";
}

/** Swin2SR na traženom izvršiocu; WebGPU koji ne uspe da napravi sesiju pada na WASM. */
async function loadSwin(backend: OnnxBackend, context: ToolRunContext): Promise<OnnxModel> {
  const options = { signal: context.signal, onProgress: context.reportDownload };
  if (backend === "wasm") return loadOnnxModel("swin2sr-x2", "wasm", options);
  try {
    return await loadOnnxModel("swin2sr-x2", "webgpu", options);
  } catch (error) {
    if (context.signal.aborted) throw error;
    return loadOnnxModel("swin2sr-x2", "wasm", options);
  }
}

async function upscale(file: File, backend: OnnxBackend, context: ToolRunContext): Promise<CreaToolOutput<UpscaleExtra>> {
  let model = await loadSwin(backend, context);
  context.reportRunning();
  const bitmap = await decodeImage(file);
  const width = bitmap.width;
  const height = bitmap.height;
  const { ctx } = createCanvas(width, height);
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const source = ctx.getImageData(0, 0, width, height).data;

  const { canvas: out, ctx: outCtx } = createCanvas(width * 2, height * 2);
  const result = outCtx.createImageData(width * 2, height * 2);
  let tiles = planTiles(width, height, upscaleTileSide(model.backend));
  for (let index = 0; index < tiles.length; index++) {
    if (context.signal.aborted) throw new CreaLocalAiError("ABORTED");
    const tile = tiles[index];
    const input = new model.ort.Tensor("float32", sampleTile(source, width, height, tile.input), [1, 3, tile.input.height, tile.input.width]);
    try {
      const results = await model.session.run({ [model.session.inputNames[0]!]: input });
      writeTile(result.data, width * 2, results[model.session.outputNames[0]!]!.data as Float32Array, tile);
    } catch (error) {
      // WebGPU koji pukne usred rada (memorija, drajver): ista slika ispočetka na WASM-u.
      if (model.backend !== "webgpu" || context.signal.aborted) throw new CreaLocalAiError("INFERENCE_FAILED", error);
      model = await loadOnnxModel("swin2sr-x2", "wasm", { signal: context.signal, onProgress: context.reportDownload });
      tiles = planTiles(width, height, upscaleTileSide("wasm"));
      index = -1;
      continue;
    } finally {
      input.dispose();
    }
    context.reportProgress(((index + 1) / tiles.length) * 100);
    // Strana ostaje živa između pločica (i „Odustani" stiže na red).
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  outCtx.putImageData(result, 0, 0);

  // Providnost (PNG) model ne vidi - razvuče se glatko i vrati na rezultat.
  const type = outputTypeFor(file);
  if (type === "image/png") {
    let transparent = false;
    for (let i = 3; i < source.length; i += 4) {
      if (source[i] < 255) {
        transparent = true;
        break;
      }
    }
    if (transparent) {
      const { canvas: alpha, ctx: alphaCtx } = createCanvas(width * 2, height * 2);
      alphaCtx.drawImage(ctx.canvas, 0, 0, width * 2, height * 2);
      outCtx.globalCompositeOperation = "destination-in";
      outCtx.drawImage(alpha, 0, 0);
    }
  }

  const blob = await canvasToBlob(out, type, 0.92);
  return {
    blob,
    kind: "image",
    fileName: resultFileName("2x", file, type),
    previewUrl: URL.createObjectURL(blob),
    params: { sirina: width * 2, visina: height * 2, izvrsilac: model.backend },
    extra: { width: width * 2, height: height * 2 },
  };
}

/** Mere izabrane slike (za poruku o veličini pre pokretanja). */
function useImageSize(file: File | null) {
  const [size, setSize] = useState<{ key: File; width: number; height: number } | null>(null);
  useEffect(() => {
    if (!file) return;
    let alive = true;
    void decodeImage(file)
      .then((bitmap) => {
        if (alive) setSize({ key: file, width: bitmap.width, height: bitmap.height });
        bitmap.close();
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [file]);
  return file && size?.key === file ? size : null;
}

/**
 * Uvećaj 2× (S16, K11): Swin2SR lightweight ×2 na uređaju, u pločicama sa
 * preklopom (bez šavova), 0 kredita. Na računaru sa WebGPU-om brzo i do ~2 MP
 * ulaza; inače WASM sa manjom granicom. Veće uvećanje uz kredite ne postoji u
 * katalogu, pa ga alat ne nudi (ODLUKA K11).
 */
export default function UpscaleTool({ tool, locale, caps, canSave, projectId, source }: CreaToolProps) {
  const image = useImageInput(source);
  const size = useImageSize(image.picked?.file ?? null);
  const backend = backendFor(caps);
  const check = size && caps ? checkUpscale(size.width, size.height, classifyDevice(caps)) : null;

  return (
    <ToolRunner
      tool={tool}
      locale={locale}
      caps={caps}
      canSave={canSave}
      projectId={projectId}
      parentJobId={image.picked?.sourceJobId ?? null}
      webgpu={backend === "webgpu"}
      canRun={image.picked !== null && check?.ok === true}
      inputKey={image.picked?.key ?? null}
      runLabel={T.run[locale]}
      icon={<Maximize2 aria-hidden="true" className="size-5" />}
      run={(context) => upscale(image.picked!.file, backend, context)}
      renderResult={(output) => <UpscaleResult locale={locale} output={output} beforeUrl={image.picked?.url ?? ""} />}
    >
      {({ busy }) => (
        <div className="space-y-4">
          <ImageInput locale={locale} input={image} disabled={busy} />
          {size && check ? (
            check.ok ? (
              <div className="space-y-1">
                <p className="font-mono text-sm font-black text-ink">
                  {fillCopy(T.output[locale], { w: size.width * 2, h: size.height * 2, ow: size.width, oh: size.height })}
                </p>
                <p className="type-body-sm font-semibold text-muted">{backend === "webgpu" ? T.fast[locale] : T.slow[locale]}</p>
              </div>
            ) : (
              <div role="status" className="space-y-1">
                <p className="type-body-sm font-black text-ink">{fillCopy(T.tooBig[locale], { side: check.maxSide })}</p>
                <p className="type-body-sm font-semibold text-muted">{T.noPaid[locale]}</p>
              </div>
            )
          ) : null}
        </div>
      )}
    </ToolRunner>
  );
}

function UpscaleResult({ locale, output, beforeUrl }: { locale: Locale; output: CreaToolOutput<UpscaleExtra>; beforeUrl: string }) {
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
      <p className="font-mono text-sm font-black text-ink">{fillCopy(T.result[locale], { w: output.extra.width, h: output.extra.height })}</p>
    </div>
  );
}

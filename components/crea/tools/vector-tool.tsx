"use client";

import { PenTool } from "lucide-react";
import { useState } from "react";
import type { BinaryImageConverter } from "vectortracer";

import BeforeAfter from "@/components/crea/before-after";
import { ToolRunner, type CreaToolOutput, type ToolRunContext } from "@/components/crea/tool-runner";
import { createCanvas, decodeImage } from "@/components/crea/tools/canvas";
import { ChoiceChips } from "@/components/crea/tools/choice-chips";
import { ImageInput, useImageInput } from "@/components/crea/tools/image-input";
import type { CreaToolProps } from "@/components/crea/tools/types";
import { CREA_VERSION_COPY, fillCopy } from "@/lib/crea-copy";
import { CREA_IMAGE_TOOL_COPY, CREA_VECTOR_COPY } from "@/lib/crea-image-tools-copy";
import { outputFileName } from "@/lib/crea-image-format";
import { CreaLocalAiError, toLocalAiError } from "@/lib/crea-local-ai/errors";
import { formatBytes } from "@/lib/crea-local-ai/progress";
import { rgbToHex } from "@/lib/crea-palette";
import {
  assembleSvg,
  extractPaths,
  layerOrder,
  luminanceOf,
  maskImage,
  otsuThreshold,
  stackedMask,
  VECTOR_COLOR_COUNTS,
  VECTOR_DEFAULT_COLORS,
  VECTOR_MAX_SIDE,
} from "@/lib/crea-vector";
import type { Locale } from "@/lib/i18n";

type VectorMode = "crno" | "boje";
type Corners = "spline" | "polygon";
type VectorExtra = { paths: number; inputUrl: string };

const DEG = Math.PI / 180;

/** Jedan prolaz VTracer-a; radi u malim koracima da stranica ne zamrzne i da „Odustani" radi. */
function trace(converter: BinaryImageConverter, signal: AbortSignal): Promise<string> {
  converter.init();
  return new Promise((resolve, reject) => {
    const step = () => {
      if (signal.aborted) {
        converter.free();
        reject(new CreaLocalAiError("ABORTED"));
        return;
      }
      const until = performance.now() + 12;
      let done = false;
      while (!done && performance.now() < until) done = converter.tick();
      if (!done) {
        setTimeout(step, 0);
        return;
      }
      const svg = converter.getResult();
      converter.free();
      resolve(svg);
    };
    step();
  });
}

async function vectorize(
  file: File,
  inputUrl: string,
  mode: VectorMode,
  colorCount: number,
  corners: Corners,
  speckle: number,
  context: ToolRunContext,
): Promise<CreaToolOutput<VectorExtra>> {
  context.reportRunning();
  const bitmap = await decodeImage(file);
  const scale = Math.min(1, VECTOR_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const { canvas, ctx } = createCanvas(bitmap.width * scale, bitmap.height * scale);
  // Providno = papir: logo bez pozadine ostaje bez pozadine.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const { width, height } = canvas;
  const rgba = ctx.getImageData(0, 0, width, height).data;
  const pixels = width * height;

  let svg: string;
  let pathCount = 0;
  try {
    const { BinaryImageConverter } = await import("vectortracer");
    const params = {
      debug: undefined,
      mode: corners,
      filterSpeckle: speckle,
      cornerThreshold: 60 * DEG,
      lengthThreshold: 4,
      maxIterations: 10,
      spliceThreshold: 45 * DEG,
      pathPrecision: 2,
    };
    const options = { invert: undefined, pathFill: undefined, backgroundColor: undefined, attributes: undefined, scale: 1 };
    const pathsOf = async (mask: Uint8ClampedArray<ArrayBuffer>) =>
      extractPaths(await trace(new BinaryImageConverter(new ImageData(mask, width, height), params, options), context.signal));

    if (mode === "crno") {
      const gray = luminanceOf(rgba);
      const threshold = otsuThreshold(gray);
      const ink = (i: number) => gray[i] < threshold;
      // Boja mastila = prosek tamnih piksela: plav logo ostaje plav, potpis ostaje svoje boje.
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let i = 0; i < pixels; i += 1) {
        if (!ink(i)) continue;
        r += rgba[i * 4];
        g += rgba[i * 4 + 1];
        b += rgba[i * 4 + 2];
        n += 1;
      }
      const fill = n > 0 ? rgbToHex([r / n, g / n, b / n]) : "#000000";
      const paths = await pathsOf(maskImage(pixels, ink));
      pathCount = paths.length;
      svg = assembleSvg(width, height, null, [{ fill, paths }]);
    } else {
      const { quantize, applyPalette } = await import("gifenc");
      const palette = quantize(rgba, colorCount, { format: "rgb444" });
      const indices = applyPalette(rgba, palette, "rgb444");
      const counts = new Array<number>(palette.length).fill(0);
      for (const index of indices) counts[index] += 1;
      const order = layerOrder(counts);
      const hex = (index: number) => rgbToHex([palette[index][0], palette[index][1], palette[index][2]]);
      const layers: Array<{ fill: string; paths: string[] }> = [];
      for (let layer = 1; layer < order.length; layer += 1) {
        const paths = await pathsOf(stackedMask(indices, order, layer));
        pathCount += paths.length;
        layers.push({ fill: hex(order[layer]), paths });
      }
      svg = assembleSvg(width, height, order.length > 0 ? hex(order[0]) : null, layers);
    }
  } catch (error) {
    throw toLocalAiError(error, "INFERENCE_FAILED");
  }

  const blob = new Blob([svg], { type: "image/svg+xml" });
  return {
    blob,
    kind: "svg",
    fileName: outputFileName(file.name, "png").replace(/\.png$/, ".svg"),
    previewUrl: URL.createObjectURL(blob),
    extra: { paths: pathCount, inputUrl },
  };
}

export default function VectorTool({ tool, locale, caps, canSave, projectId, source }: CreaToolProps) {
  const image = useImageInput(source);
  const [mode, setMode] = useState<VectorMode>("crno");
  const [colorCount, setColorCount] = useState<number>(VECTOR_DEFAULT_COLORS);
  const [corners, setCorners] = useState<Corners>("spline");
  const [speckle, setSpeckle] = useState(4);

  return (
    <ToolRunner
      tool={tool}
      locale={locale}
      caps={caps}
      canSave={canSave}
      projectId={projectId}
      canRun={image.picked !== null}
      inputKey={image.picked ? `${image.picked.key}:${mode}:${colorCount}:${corners}:${speckle}` : null}
      icon={<PenTool aria-hidden="true" className="size-5" />}
      run={(context) => vectorize(image.picked!.file, image.picked!.url, mode, colorCount, corners, speckle, context)}
      renderResult={(output) => <VectorResult locale={locale} output={output} />}
    >
      {({ busy }) => (
        <div className="space-y-5">
          <ImageInput locale={locale} input={image} disabled={busy} />
          <p className="type-body-sm font-semibold text-muted">{CREA_VECTOR_COPY.tip[locale]}</p>
          <ChoiceChips
            legend={CREA_VECTOR_COPY.mode[locale]}
            name="crea-vector-mode"
            options={(["crno", "boje"] as const).map((id) => ({
              id,
              label: fillCopy(CREA_VECTOR_COPY.modes[id][locale], { n: Math.max(...VECTOR_COLOR_COUNTS) }),
            }))}
            value={mode}
            onChange={setMode}
            disabled={busy}
          />
          {mode === "boje" ? (
            <ChoiceChips
              legend={CREA_VECTOR_COPY.colors[locale]}
              name="crea-vector-colors"
              options={VECTOR_COLOR_COUNTS.map((n) => ({ id: n, label: String(n) }))}
              value={colorCount}
              onChange={setColorCount}
              disabled={busy}
            />
          ) : null}
          <ChoiceChips
            legend={CREA_VECTOR_COPY.corners[locale]}
            name="crea-vector-corners"
            options={(["spline", "polygon"] as const).map((id) => ({ id, label: CREA_VECTOR_COPY.cornerModes[id][locale] }))}
            value={corners}
            onChange={setCorners}
            disabled={busy}
          />
          <div>
            <label htmlFor="crea-vector-speckle" className="flex items-baseline justify-between gap-3">
              <span className="type-body-sm font-black text-ink">{CREA_VECTOR_COPY.clean[locale]}</span>
              <span className="font-mono text-sm font-black text-ink">{speckle}</span>
            </label>
            <input
              id="crea-vector-speckle"
              type="range"
              min={0}
              max={30}
              step={1}
              value={speckle}
              disabled={busy}
              onChange={(event) => setSpeckle(Number(event.target.value))}
              className="mt-2 h-11 w-full cursor-pointer accent-ink"
            />
            <p className="type-body-sm font-semibold text-muted">{CREA_VECTOR_COPY.cleanHint[locale]}</p>
          </div>
        </div>
      )}
    </ToolRunner>
  );
}

function VectorResult({ locale, output }: { locale: Locale; output: CreaToolOutput<VectorExtra> }) {
  return (
    <div className="space-y-3">
      {output.previewUrl ? (
        // SVG se prikazuje kroz <img>: tako browser ne izvršava ništa iz fajla.
        <div className="surface-media overflow-hidden bg-paper shadow-[inset_0_0_0_1px_var(--shadow-hard-14)]">
          <BeforeAfter
            beforeUrl={output.extra.inputUrl}
            afterUrl={output.previewUrl}
            beforeLabel={CREA_IMAGE_TOOL_COPY.before[locale]}
            afterLabel={CREA_IMAGE_TOOL_COPY.after[locale]}
            label={CREA_VERSION_COPY.compareLabel[locale]}
          />
        </div>
      ) : null}
      <p className="font-mono text-sm font-black text-ink">
        {fillCopy(CREA_VECTOR_COPY.stats[locale], { paths: output.extra.paths, size: formatBytes(output.blob.size, locale) })}
      </p>
      <p className="type-body-sm font-semibold text-muted">{CREA_VECTOR_COPY.svgOnly[locale]}</p>
    </div>
  );
}

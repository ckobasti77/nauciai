"use client";

import { MousePointerClick } from "lucide-react";
import { useCallback, useRef, useState } from "react";

import { ToolRunner, type CreaToolOutput, type ToolRunContext } from "@/components/crea/tool-runner";
import { canvasToBlob, createCanvas } from "@/components/crea/tools/canvas";
import { ChoiceChips } from "@/components/crea/tools/choice-chips";
import { ImageInput, useImageInput } from "@/components/crea/tools/image-input";
import { maskToCanvas, outputMaxSide, renderSized, resultFileName, scaleMask, useWorkImage, type WorkImage } from "@/components/crea/tools/mask-canvas";
import { MaskEditor, type MaskEditorHandle } from "@/components/crea/tools/mask-editor";
import { TransparentPreview } from "@/components/crea/tools/transparent-preview";
import type { CreaToolProps } from "@/components/crea/tools/types";
import { CREA_BACKGROUND_COPY, CREA_SELECT_COPY as T } from "@/lib/crea-edit-copy";
import { CreaLocalAiError } from "@/lib/crea-local-ai/errors";
import { maskIsUsable, maskStats, type MaskStats } from "@/lib/crea-mask";
import type { Locale } from "@/lib/i18n";

type SelectOutput = "izdvoji" | "boja";
type SelectExtra = { width: number; height: number; transparent: boolean };

/**
 * Izabran predmet u punoj veličini: „izdvoji" = samo predmet na providnom,
 * isečen oko predmeta; „boja" = predmet u boji, ostatak crno-beo.
 */
async function makeSelection(
  work: WorkImage,
  file: File,
  maskCanvas: HTMLCanvasElement,
  output: SelectOutput,
  mobile: boolean,
  context: ToolRunContext,
): Promise<CreaToolOutput<SelectExtra>> {
  context.reportRunning();
  const { canvas: photo } = renderSized(work.full, outputMaxSide(mobile));
  const { width, height } = photo;
  const mask = scaleMask(maskCanvas, width, height, true);
  const stats = maskStats(mask, width, height);
  if (!stats.box) throw new CreaLocalAiError("BAD_INPUT");
  // Ivica = maska razvučena glatko (bez proširenja): proširena bi povukla rub pozadine uz predmet.
  const edge = maskToCanvas(scaleMask(maskCanvas, width, height, false), width, height);

  // Predmet u boji: fotka kroz meku masku.
  const { canvas: object, ctx: objectCtx } = createCanvas(width, height);
  objectCtx.drawImage(photo, 0, 0);
  objectCtx.globalCompositeOperation = "destination-in";
  objectCtx.drawImage(edge, 0, 0);

  let result: HTMLCanvasElement;
  if (output === "izdvoji") {
    const pad = Math.round(Math.max(stats.box.width, stats.box.height) * 0.04);
    const x = Math.max(0, stats.box.x - pad);
    const y = Math.max(0, stats.box.y - pad);
    const w = Math.min(width, stats.box.x + stats.box.width + pad) - x;
    const h = Math.min(height, stats.box.y + stats.box.height + pad) - y;
    const { canvas, ctx } = createCanvas(w, h);
    ctx.drawImage(object, x, y, w, h, 0, 0, w, h);
    result = canvas;
  } else {
    const { canvas, ctx } = createCanvas(width, height);
    ctx.drawImage(photo, 0, 0);
    const pixels = ctx.getImageData(0, 0, width, height);
    const data = pixels.data;
    for (let i = 0; i < data.length; i += 4) {
      const l = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      data[i] = l;
      data[i + 1] = l;
      data[i + 2] = l;
    }
    ctx.putImageData(pixels, 0, 0);
    ctx.drawImage(object, 0, 0);
    result = canvas;
  }
  if (context.signal.aborted) throw new CreaLocalAiError("ABORTED");

  const type = output === "izdvoji" ? "image/png" : "image/jpeg";
  const blob = await canvasToBlob(result, type, 0.92);
  return {
    blob,
    kind: "image",
    fileName: resultFileName(output === "izdvoji" ? "predmet" : "boja", file, type),
    previewUrl: URL.createObjectURL(blob),
    params: { izlaz: output, sirina: result.width, visina: result.height },
    extra: { width: result.width, height: result.height, transparent: output === "izdvoji" },
  };
}

/**
 * Klikni i izaberi (S12, K11): klik na predmet (MediaPipe MagicTouch, na
 * uređaju) daje masku; četkica i gumica je doteruju. Rezultat ide u galeriju:
 * samo predmet bez pozadine ili predmet u boji na crno-beloj fotki. 0 kredita.
 */
export default function SelectTool({ tool, locale, caps, canSave, projectId, source }: CreaToolProps) {
  const image = useImageInput(source);
  const { work } = useWorkImage(image.picked?.file ?? null);
  const editor = useRef<MaskEditorHandle | null>(null);
  const [stats, setStats] = useState<MaskStats>({ coverage: 0, box: null });
  const onStats = useCallback((next: MaskStats) => setStats(next), []);
  const [output, setOutput] = useState<SelectOutput>("izdvoji");
  const usable = maskIsUsable(stats);
  // Svaka promena maske menja ključ, pa stari rezultat ne ostaje uz novu oznaku.
  const maskKey = `${stats.coverage.toFixed(5)}:${stats.box ? `${stats.box.x},${stats.box.y},${stats.box.width},${stats.box.height}` : ""}`;

  return (
    <ToolRunner
      tool={tool}
      locale={locale}
      caps={caps}
      canSave={canSave}
      projectId={projectId}
      parentJobId={image.picked?.sourceJobId ?? null}
      // Klik preuzima MagicTouch u editoru (sa svojom porukom); „Napravi" ne preuzima ništa.
      models={[]}
      canRun={work !== null && usable}
      inputKey={image.picked ? `${image.picked.key}:${maskKey}:${output}` : null}
      runLabel={T.run[locale]}
      icon={<MousePointerClick aria-hidden="true" className="size-5" />}
      run={(context) => {
        const maskCanvas = editor.current?.maskCanvas();
        if (!work || !maskCanvas || !image.picked) throw new CreaLocalAiError("BAD_INPUT");
        return makeSelection(work, image.picked.file, maskCanvas, output, caps?.mobile === true, context);
      }}
      renderResult={(result) => <SelectResult locale={locale} output={result} />}
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
              tools={["klik", "cetkica", "gumica"]}
              initialTool="klik"
              disabled={busy}
              caps={caps}
              onStats={onStats}
            />
          ) : null}
          <ChoiceChips
            legend={T.output[locale]}
            name="crea-select-output"
            options={(["izdvoji", "boja"] as const).map((id) => ({ id, label: T.outputs[id][locale] }))}
            value={output}
            onChange={setOutput}
            disabled={busy}
          />
          {work && !usable ? <p className="type-body-sm font-semibold text-muted">{T.needMask[locale]}</p> : null}
        </div>
      )}
    </ToolRunner>
  );
}

function SelectResult({ locale, output }: { locale: Locale; output: CreaToolOutput<SelectExtra> }) {
  return (
    <div className="space-y-2">
      {output.previewUrl ? (
        <TransparentPreview url={output.previewUrl} alt={T.outputs.izdvoji[locale]} transparent={output.extra.transparent} />
      ) : null}
      <p className="font-mono text-sm font-black text-ink">
        {output.extra.width} × {output.extra.height} px
      </p>
      {output.extra.transparent ? <p className="type-body-sm font-semibold text-muted">{CREA_BACKGROUND_COPY.transparentNote[locale]}</p> : null}
    </div>
  );
}

"use client";

import { Eraser, FilePlus2, ScanText, Type } from "lucide-react";
import { useRef, useState } from "react";

import { useEditorAssets } from "@/components/crea/editor/assets";
import { EditorResult, ExportOptions, useCanvasMaxHeight, type EditorExtra, type ExportChoice } from "@/components/crea/editor/export-options";
import type { SceneCanvasHandle } from "@/components/crea/editor/scene-canvas";
import { SceneEditor } from "@/components/crea/editor/scene-editor";
import { useSceneHistory } from "@/components/crea/editor/use-scene-history";
import { ToolHeader, ToolRunner, type CreaToolOutput, type ToolRunContext } from "@/components/crea/tool-runner";
import { decodeImage, drawScaled } from "@/components/crea/tools/canvas";
import { ChoiceChips } from "@/components/crea/tools/choice-chips";
import { erase } from "@/components/crea/tools/erase-tool";
import { ImageInput, useImageInput } from "@/components/crea/tools/image-input";
import { LocalStepStatus, useLocalStep, type LocalStepContext } from "@/components/crea/tools/local-step";
import { loadWorkImage, maskToCanvas, prepareMaskEdit } from "@/components/crea/tools/mask-canvas";
import { PaidEditPanel } from "@/components/crea/tools/paid-edit";
import type { CreaToolProps } from "@/components/crea/tools/types";
import { Button } from "@/components/ui/button";
import type { Id } from "@/convex/_generated/dataModel";
import { fillCopy } from "@/lib/crea-copy";
import { CREA_TEXT_LAYER_COPY as T } from "@/lib/crea-edit-copy";
import { CREA_EDITOR_COPY } from "@/lib/crea-editor-copy";
import { exportFileName, exportPlan } from "@/lib/crea-editor-scene";
import { CREA_OCR_COPY } from "@/lib/crea-image-tools-copy";
import { CreaLocalAiError, toLocalAiError } from "@/lib/crea-local-ai/errors";
import { downloadBytes } from "@/lib/crea-local-ai/models";
import { formatBytes } from "@/lib/crea-local-ai/progress";
import { loadOcrWorker, terminateOcrWorker, type OcrLanguage } from "@/lib/crea-local-ai/runtime";
import { OCR_LOW_CONFIDENCE, OCR_SCRIPTS, ocrLanguages, type OcrScript } from "@/lib/crea-ocr";
import { BRUSH_ROUTES } from "@/lib/crea-paid-edit";
import {
  groupLines,
  linesFromOcr,
  sceneWithText,
  textColorIn,
  textMask,
  type FoundTextLine,
  type OcrBlocks,
} from "@/lib/crea-text-layer";

/** Isto kao „Tekst sa slike" (K09): duža stranica do 3000 px je dovoljna za sitna slova. */
const OCR_MAX_SIDE = 3000;

type Line = FoundTextLine & { color: string; include: boolean };
type Found = { lines: Line[]; width: number; height: number };

/** Tesseract sa okvirima redova + boja svakog reda (iz piksela originala, pre brisanja). */
async function findText(file: File, script: OcrScript, context: LocalStepContext): Promise<Found> {
  const worker = await loadOcrWorker(ocrLanguages(script) as OcrLanguage[], { signal: context.signal, onProgress: context.reportDownload });
  context.reportRunning();
  const bitmap = await decodeImage(file);
  const { width, height } = bitmap;
  const { canvas, ctx, scale } = drawScaled(bitmap, OCR_MAX_SIDE);
  bitmap.close();
  const stop = () => terminateOcrWorker();
  context.signal.addEventListener("abort", stop, { once: true });
  let blocks: OcrBlocks | null;
  try {
    const { data } = await worker.recognize(canvas, {}, { blocks: true });
    blocks = data.blocks as OcrBlocks | null;
  } catch (error) {
    throw toLocalAiError(error, context.signal.aborted ? "ABORTED" : "INFERENCE_FAILED");
  } finally {
    context.signal.removeEventListener("abort", stop);
  }
  if (context.signal.aborted) throw new CreaLocalAiError("ABORTED");
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const lines = linesFromOcr(blocks, scale).map((line) => {
    const box = {
      x: Math.min(canvas.width - 1, Math.round(line.box.x * scale)),
      y: Math.min(canvas.height - 1, Math.round(line.box.y * scale)),
      width: Math.max(1, Math.min(canvas.width - Math.round(line.box.x * scale), Math.round(line.box.width * scale))),
      height: Math.max(1, Math.min(canvas.height - Math.round(line.box.y * scale), Math.round(line.box.height * scale))),
    };
    return { ...line, color: textColorIn(pixels, canvas.width, box), include: true };
  });
  return { lines, width, height };
}

/** Briše izabrane redove grupu po grupu (MI-GAN na uređaju); vraća očišćenu fotku. */
async function eraseLines(file: File, found: Found, mobile: boolean, context: LocalStepContext): Promise<File> {
  let current: File = file;
  for (const group of groupLines(found.lines.filter((line) => line.include))) {
    const work = await loadWorkImage(current);
    try {
      const mask = maskToCanvas(textMask(group.map((line) => line.box), found.width, found.height), found.width, found.height);
      const output = await erase(work, current, mask, mobile, {
        signal: context.signal,
        reportDownload: context.reportDownload,
        reportRunning: context.reportRunning,
        reportProgress: () => undefined,
      });
      current = new File([output.blob], output.fileName, { type: output.blob.type });
      if (output.previewUrl) URL.revokeObjectURL(output.previewUrl);
    } finally {
      work.full.close();
    }
  }
  return current;
}

/**
 * Tekst kao sloj (S21, K12): Tesseract (srpska latinica i ćirilica) nađe redove,
 * korisnik ispravi tekst, stari tekst se obriše na uređaju (MI-GAN) - ili AI-jem
 * kad je pozadina teška - a novi stoji kao sloj editora (K10) sa našim fontom.
 * Izvoz i čuvanje idu kroz `ToolRunner`, kao verzija rada iz galerije.
 */
export default function TextLayerTool({ tool, locale, caps, canSave, projectId, source, paid }: CreaToolProps) {
  const image = useImageInput(source);
  const [script, setScript] = useState<OcrScript>("oba");
  const [found, setFound] = useState<{ key: string; data: Found } | null>(null);
  const step = useLocalStep();
  const history = useSceneHistory();
  const { scene, reset } = history;
  const { assets, addFiles } = useEditorAssets();
  const canvasRef = useRef<SceneCanvasHandle | null>(null);
  const [choice, setChoice] = useState<ExportChoice>({ format: "png", scale: 1 });
  const [parentJobId, setParentJobId] = useState<Id<"generationJobs"> | null>(null);
  const maxDisplayHeight = useCanvasMaxHeight();
  const mobile = caps?.mobile ?? false;
  const picked = image.picked;
  const current = found && picked && found.key === picked.key ? found.data : null;
  const chosen = current?.lines.filter((line) => line.include) ?? [];
  const ocrSize = formatBytes(downloadBytes(["tess-srp", "tess-srp-latn"]), locale);
  const eraseSize = formatBytes(downloadBytes(["migan"]), locale);

  function updateLine(id: string, patch: Partial<Line>) {
    if (!found) return;
    setFound({ ...found, data: { ...found.data, lines: found.data.lines.map((line) => (line.id === id ? { ...line, ...patch } : line)) } });
  }

  async function openEditor(photo: File, lines: readonly Line[], imageWidth: number) {
    const [asset] = await addFiles([photo]);
    if (!asset) return;
    reset(sceneWithText(asset, lines, imageWidth));
    setParentJobId(picked?.sourceJobId ?? null);
  }

  async function runExport(context: ToolRunContext): Promise<CreaToolOutput<EditorExtra>> {
    const canvas = canvasRef.current;
    if (!scene || !canvas) throw new CreaLocalAiError("UNSUPPORTED");
    context.reportRunning();
    const plan = exportPlan(scene, choice.scale, mobile);
    const blob = await canvas.exportImage({ width: plan.width, height: plan.height, format: choice.format, quality: 0.92 });
    return {
      blob,
      kind: "image",
      fileName: exportFileName("tekst", choice.format, plan.width, plan.height),
      previewUrl: URL.createObjectURL(blob),
      params: { sirina: plan.width, visina: plan.height, redova: scene.nodes.filter((node) => node.kind === "text").length, format: choice.format },
      extra: { width: plan.width, height: plan.height },
    };
  }

  if (scene) {
    return (
      <ToolRunner
        tool={tool}
        locale={locale}
        caps={caps}
        canSave={canSave}
        projectId={projectId}
        parentJobId={parentJobId}
        // Izvoz ne preuzima ništa (prepoznavanje i brisanje su već urađeni).
        models={[]}
        canRun={scene.nodes.length > 0}
        inputKey={`${history.revision}:${choice.format}:${choice.scale}`}
        runLabel={CREA_EDITOR_COPY.exportCta[locale]}
        icon={<Type aria-hidden="true" className="size-5" />}
        run={runExport}
        renderResult={(output) => <EditorResult locale={locale} output={output} />}
      >
        {({ busy }) => (
          <div className="space-y-4">
            <p className="type-body-sm font-semibold text-muted">{T.editorNote[locale]}</p>
            <SceneEditor
              locale={locale}
              history={history}
              assets={assets}
              addFiles={addFiles}
              canvasRef={canvasRef}
              maxDisplayHeight={maxDisplayHeight}
            />
            <ExportOptions locale={locale} scene={scene} mobile={mobile} value={choice} onChange={setChoice} />
            <div className="border-t border-line pt-4">
              <Button
                variant="ghost"
                disabled={busy}
                icon={<FilePlus2 aria-hidden="true" className="size-4" />}
                onClick={() => {
                  if (history.canUndo && !window.confirm(T.restartConfirm[locale])) return;
                  reset(null);
                  setFound(null);
                  setParentJobId(null);
                }}
              >
                {T.restart[locale]}
              </Button>
            </div>
          </div>
        )}
      </ToolRunner>
    );
  }

  return (
    <section
      aria-labelledby="crea-tool-title"
      className="surface-card border-2 border-ink bg-paper-strong p-4 shadow-[6px_6px_0_0_var(--shadow-hard)] sm:p-6"
    >
      <ToolHeader tool={tool} locale={locale} icon={<Type aria-hidden="true" className="size-5" />} />
      <div className="mt-5 space-y-5 border-t border-line pt-5">
        <ImageInput locale={locale} input={image} disabled={step.busy} />

        {picked && !current ? (
          <div className="space-y-4">
            <ChoiceChips
              legend={CREA_OCR_COPY.script[locale]}
              name="crea-text-layer-script"
              options={OCR_SCRIPTS.map((id) => ({ id, label: CREA_OCR_COPY.scripts[id][locale] }))}
              value={script}
              onChange={setScript}
              disabled={step.busy}
            />
            <div className="flex flex-wrap items-center gap-3">
              <Button
                loading={step.busy}
                icon={<ScanText aria-hidden="true" className="size-4" />}
                className="shadow-[4px_4px_0_0_var(--ink)]"
                onClick={async () => {
                  const result = await step.run((context) => findText(picked.file, script, context), true);
                  if (result) setFound({ key: picked.key, data: result });
                }}
              >
                {T.find[locale]}
              </Button>
              <Button variant="ghost" disabled={step.busy} onClick={() => void openEditor(picked.file, [], 1)}>
                {T.skip[locale]}
              </Button>
            </div>
            <p className="type-body-sm font-semibold text-muted">{fillCopy(T.findNote[locale], { size: ocrSize })}</p>
          </div>
        ) : null}

        {picked && current ? (
          current.lines.length === 0 ? (
            <div className="space-y-3">
              <p className="type-body font-bold text-ink">{T.none[locale]}</p>
              <Button variant="secondary" onClick={() => void openEditor(picked.file, [], 1)}>
                {T.skip[locale]}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="type-body-sm font-bold text-ink">{fillCopy(T.found[locale], { n: current.lines.length })}</p>
              <ol className="divide-y divide-line">
                {current.lines.map((line, index) => (
                  <li key={line.id} className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                    <label className="block min-w-0">
                      <span className="flex items-center gap-2 type-body-sm font-black text-ink">
                        <span
                          aria-hidden="true"
                          className="inline-block size-4 shrink-0 rounded-full shadow-[inset_0_0_0_1px_var(--shadow-hard-25)]"
                          // Boja starog teksta - podatak slike, ne boja interfejsa.
                          style={{ backgroundColor: line.color }}
                        />
                        {fillCopy(T.lineLabel[locale], { n: index + 1 })}
                        {line.confidence < OCR_LOW_CONFIDENCE ? (
                          <span className="rounded-full border border-line px-2 text-xs font-bold text-muted">{T.lowConfidence[locale]}</span>
                        ) : null}
                      </span>
                      <input
                        type="text"
                        value={line.text}
                        maxLength={300}
                        disabled={step.busy}
                        onChange={(event) => updateLine(line.id, { text: event.target.value })}
                        className="surface-inset mt-1 block min-h-11 w-full border-2 border-ink bg-paper px-3 type-body font-semibold text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                      />
                    </label>
                    <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 type-body-sm font-bold text-ink">
                      <input
                        type="checkbox"
                        checked={line.include}
                        disabled={step.busy}
                        onChange={(event) => updateLine(line.id, { include: event.target.checked })}
                        className="size-5 accent-ink"
                      />
                      {T.lineInclude[locale]}
                    </label>
                  </li>
                ))}
              </ol>
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  disabled={chosen.length === 0}
                  loading={step.busy}
                  icon={<Eraser aria-hidden="true" className="size-4" />}
                  className="shadow-[4px_4px_0_0_var(--ink)]"
                  onClick={async () => {
                    const cleaned = await step.run((context) => eraseLines(picked.file, current, mobile, context), true);
                    if (cleaned) await openEditor(cleaned, chosen, current.width);
                  }}
                >
                  {T.erase[locale]}
                </Button>
                {chosen.length === 0 ? <p className="type-body-sm font-semibold text-muted">{T.needLine[locale]}</p> : null}
              </div>
              <p className="type-body-sm font-semibold text-muted">{fillCopy(T.eraseNote[locale], { size: eraseSize })}</p>

              <div className="surface-inset space-y-3 bg-paper p-4">
                <p className="type-body font-black text-ink">{T.paidTitle[locale]}</p>
                <p className="type-body-sm font-semibold text-muted">{T.paidBody[locale]}</p>
                <PaidEditPanel
                  locale={locale}
                  routes={BRUSH_ROUTES}
                  purpose="erase"
                  ready={chosen.length > 0 && !step.busy}
                  notReadyReason={T.needLine[locale]}
                  prepare={async (route) => {
                    const work = await loadWorkImage(picked.file);
                    try {
                      const mask = maskToCanvas(textMask(chosen.map((line) => line.box), current.width, current.height), current.width, current.height);
                      return await prepareMaskEdit(work, mask, route);
                    } finally {
                      work.full.close();
                    }
                  }}
                  parentJobId={picked.sourceJobId ?? null}
                  projectId={projectId}
                  canSubmit={canSave}
                  paid={paid}
                />
              </div>
            </div>
          )
        ) : null}

        <LocalStepStatus locale={locale} state={step.state} onCancel={step.cancel} />
      </div>
    </section>
  );
}

"use client";

import { Scissors } from "lucide-react";
import { useCallback, useRef, useState } from "react";

import { ToolRunner, type CreaToolOutput, type ToolRunContext } from "@/components/crea/tool-runner";
import { canvasToBlob, createCanvas, decodeImage } from "@/components/crea/tools/canvas";
import { ChoiceChips } from "@/components/crea/tools/choice-chips";
import { ImageInput, useImageInput } from "@/components/crea/tools/image-input";
import { outputMaxSide, renderSized, resultFileName, useWorkImage } from "@/components/crea/tools/mask-canvas";
import { MaskEditor, type MaskEditorHandle } from "@/components/crea/tools/mask-editor";
import { PaidEditPanel } from "@/components/crea/tools/paid-edit";
import { TransparentPreview } from "@/components/crea/tools/transparent-preview";
import type { CreaToolProps } from "@/components/crea/tools/types";
import { cn } from "@/components/ui/primitives";
import { CREA_BACKGROUND_COPY as T, CREA_PAID_EDIT_COPY } from "@/lib/crea-edit-copy";
import { coverCrop } from "@/lib/crea-editor-scene";
import { CreaLocalAiError } from "@/lib/crea-local-ai/errors";
import { loadOnnxModel } from "@/lib/crea-local-ai/runtime";
import { maskIsUsable, type MaskStats } from "@/lib/crea-mask";
import {
  BACKGROUND_SWATCHES,
  backgroundBlurRadius,
  matteCoverage,
  matteFromOutput,
  modnetInputSize,
  modnetTensor,
  normalizeHex,
  type CreaBackgroundKind,
} from "@/lib/crea-matting";
import { SCENE_ROUTES } from "@/lib/crea-paid-edit";
import type { Locale } from "@/lib/i18n";

/** Prednji plan: osoba se iseca sama (MODNet), predmet ili ljubimac klikom (MagicTouch). */
type Subject = "osoba" | "predmet";
/** Providnost prednjeg plana u svojoj veličini (izlaz modela ili radna maska). */
type Matte = { alpha: Uint8ClampedArray; width: number; height: number };
type BackgroundExtra = { width: number; height: number; transparent: boolean; coverage: number };
type Settings = { kind: CreaBackgroundKind; color: string; blur: "blago" | "jako" };

/** MODNet (~6,6 MB, WASM, svaki uređaj): providnost osobe u veličini ulaza modela. */
async function personMatte(file: File, context: ToolRunContext): Promise<Matte> {
  const { ort, session } = await loadOnnxModel("modnet", "wasm", { signal: context.signal, onProgress: context.reportDownload });
  context.reportRunning();
  const bitmap = await decodeImage(file);
  const size = modnetInputSize(bitmap.width, bitmap.height);
  const { ctx } = createCanvas(size.width, size.height);
  ctx.drawImage(bitmap, 0, 0, size.width, size.height);
  bitmap.close();
  const pixels = ctx.getImageData(0, 0, size.width, size.height).data;
  const input = new ort.Tensor("float32", modnetTensor(pixels, size.width, size.height), [1, 3, size.height, size.width]);
  try {
    const results = await session.run({ [session.inputNames[0]!]: input });
    const output = results[session.outputNames[0]!]!;
    return { alpha: matteFromOutput(output.data as Float32Array), width: Number(output.dims[3]), height: Number(output.dims[2]) };
  } catch (error) {
    throw new CreaLocalAiError("INFERENCE_FAILED", error);
  } finally {
    input.dispose();
  }
}

/** Maska iz editora (klik/četkica) kao providnost u radnoj veličini. */
function maskMatte(maskCanvas: HTMLCanvasElement): Matte {
  const data = maskCanvas.getContext("2d")!.getImageData(0, 0, maskCanvas.width, maskCanvas.height).data;
  const alpha = new Uint8ClampedArray(maskCanvas.width * maskCanvas.height);
  for (let i = 0; i < alpha.length; i++) alpha[i] = data[i * 4 + 3];
  return { alpha, width: maskCanvas.width, height: maskCanvas.height };
}

/** Mutna verzija fotke bez `ctx.filter` (Safari ga nema): umanji, pa razvuci glatko. */
function blurred(photo: HTMLCanvasElement, radius: number): HTMLCanvasElement {
  const factor = Math.max(2, radius);
  const { canvas: small, ctx: smallCtx } = createCanvas(Math.max(1, photo.width / factor), Math.max(1, photo.height / factor));
  smallCtx.drawImage(photo, 0, 0, small.width, small.height);
  const { canvas, ctx } = createCanvas(photo.width, photo.height);
  ctx.drawImage(small, 0, 0, photo.width, photo.height);
  return canvas;
}

async function replaceBackground(
  file: File,
  settings: Settings,
  backgroundFile: File | null,
  matte: Matte,
  mobile: boolean,
  context: ToolRunContext,
): Promise<CreaToolOutput<BackgroundExtra>> {
  const bitmap = await decodeImage(file);
  try {
    const { canvas: photo } = renderSized(bitmap, outputMaxSide(mobile));
    const { width, height } = photo;
    // Providnost se razvuče glatko na punu veličinu - ivica dobija blag prelaz.
    const { canvas: alphaCanvas, ctx: alphaCtx } = createCanvas(matte.width, matte.height);
    const alphaImage = alphaCtx.createImageData(matte.width, matte.height);
    for (let i = 0; i < matte.alpha.length; i++) alphaImage.data[i * 4 + 3] = matte.alpha[i];
    alphaCtx.putImageData(alphaImage, 0, 0);

    const { canvas: cutout, ctx: cutoutCtx } = createCanvas(width, height);
    cutoutCtx.drawImage(photo, 0, 0);
    cutoutCtx.globalCompositeOperation = "destination-in";
    cutoutCtx.drawImage(alphaCanvas, 0, 0, width, height);

    const { canvas: out, ctx } = createCanvas(width, height);
    if (settings.kind === "boja") {
      ctx.fillStyle = settings.color;
      ctx.fillRect(0, 0, width, height);
    } else if (settings.kind === "zamuceno") {
      ctx.drawImage(blurred(photo, backgroundBlurRadius(width, height, settings.blur === "jako" ? 2.5 : 1)), 0, 0);
    } else if (settings.kind === "slika" && backgroundFile) {
      const background = await decodeImage(backgroundFile);
      const crop = coverCrop(background.width, background.height, width, height);
      ctx.drawImage(background, crop.x, crop.y, crop.width, crop.height, 0, 0, width, height);
      background.close();
    }
    ctx.drawImage(cutout, 0, 0);
    if (context.signal.aborted) throw new CreaLocalAiError("ABORTED");

    const transparent = settings.kind === "providno";
    const type = transparent ? "image/png" : "image/jpeg";
    const blob = await canvasToBlob(out, type, 0.92);
    return {
      blob,
      kind: "image",
      fileName: resultFileName("pozadina", file, type),
      previewUrl: URL.createObjectURL(blob),
      params: { pozadina: settings.kind, ...(settings.kind === "boja" ? { boja: settings.color } : {}), sirina: width, visina: height },
      extra: { width, height, transparent, coverage: matteCoverage(matte.alpha) },
    };
  } finally {
    bitmap.close();
  }
}

/**
 * Ukloni pozadinu (S14, K11): osoba se iseca sama (MODNet, ~6,6 MB, na svakom
 * uređaju), a predmet ili ljubimac klikom (MagicTouch, isti editor kao „Klikni i
 * izaberi"). Nova pozadina: providna, boja, zamućena fotka ili tvoja slika (0 kr);
 * AI scena iza osobe ide kroz plaćenu izmenu (Nano Banana 2). Isečak osobe se
 * pamti, pa promena pozadine ne pokreće model ponovo.
 *
 * BiRefNet lite (plan: računar sa WebGPU-om) ne radi na onnxruntime-web 1.30 -
 * vidi `lib/crea-local-ai/models.ts` i ODLUKE K11.
 */
export default function BackgroundTool({ tool, locale, caps, canSave, projectId, source, paid }: CreaToolProps) {
  const image = useImageInput(source);
  const backgroundImage = useImageInput(null);
  const [subject, setSubject] = useState<Subject>("osoba");
  const [settings, setSettings] = useState<Settings>({ kind: "providno", color: "#ffffff", blur: "blago" });
  const { work } = useWorkImage(subject === "predmet" ? (image.picked?.file ?? null) : null);
  const editor = useRef<MaskEditorHandle | null>(null);
  const [stats, setStats] = useState<MaskStats>({ coverage: 0, box: null });
  const onStats = useCallback((next: MaskStats) => setStats(next), []);
  const mattes = useRef(new Map<string, Matte>());
  const isAi = settings.kind === "ai";
  const needsBackground = settings.kind === "slika" && !backgroundImage.picked;
  const needsMask = subject === "predmet" && !maskIsUsable(stats);
  const maskKey =
    subject === "predmet" ? `${stats.coverage.toFixed(5)}:${stats.box ? `${stats.box.x},${stats.box.y},${stats.box.width},${stats.box.height}` : ""}` : "";

  async function run(context: ToolRunContext) {
    const picked = image.picked;
    if (!picked) throw new CreaLocalAiError("BAD_INPUT");
    let matte: Matte;
    if (subject === "predmet") {
      const maskCanvas = editor.current?.maskCanvas();
      if (!maskCanvas) throw new CreaLocalAiError("BAD_INPUT");
      context.reportRunning();
      matte = maskMatte(maskCanvas);
    } else {
      const cached = mattes.current.get(picked.key);
      if (cached) context.reportRunning();
      matte = cached ?? (await personMatte(picked.file, context));
      mattes.current.set(picked.key, matte);
    }
    return replaceBackground(picked.file, settings, backgroundImage.picked?.file ?? null, matte, caps?.mobile === true, context);
  }

  const kinds: CreaBackgroundKind[] = ["providno", "boja", "zamuceno", "slika", "ai"];

  return (
    <ToolRunner
      tool={tool}
      locale={locale}
      caps={caps}
      canSave={canSave}
      projectId={projectId}
      parentJobId={image.picked?.sourceJobId ?? null}
      // Osoba preuzima MODNet kroz „Pokreni"; klik za predmet preuzima editor sa svojom porukom.
      models={subject === "osoba" ? ["modnet"] : []}
      canRun={image.picked !== null && !isAi && !needsBackground && !needsMask}
      inputKey={
        image.picked
          ? `${image.picked.key}:${subject}:${maskKey}:${settings.kind}:${settings.color}:${settings.blur}:${backgroundImage.picked?.key ?? ""}`
          : null
      }
      runLabel={T.run[locale]}
      icon={<Scissors aria-hidden="true" className="size-5" />}
      run={run}
      renderResult={(output) => <BackgroundResult locale={locale} output={output} subject={subject} />}
    >
      {({ busy }) => (
        <div className="space-y-5">
          <ImageInput locale={locale} input={image} disabled={busy} />
          <ChoiceChips
            legend={T.subject[locale]}
            name="crea-background-subject"
            options={(["osoba", "predmet"] as const).map((id) => ({ id, label: T.subjects[id][locale], hint: T.subjectHints[id][locale] }))}
            value={subject}
            onChange={setSubject}
            disabled={busy || isAi}
          />
          {subject === "predmet" && !isAi && work && image.picked ? (
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
            legend={T.background[locale]}
            name="crea-background-kind"
            options={kinds.map((id) => ({
              id,
              label: T.kinds[id][locale],
              ...(id === "ai" ? { hint: T.aiHint[locale] } : {}),
            }))}
            value={settings.kind}
            onChange={(kind) => setSettings((current) => ({ ...current, kind }))}
            disabled={busy}
          />

          {settings.kind === "boja" ? (
            <fieldset disabled={busy} className="min-w-0">
              <legend className="type-body-sm font-black text-ink">{T.color[locale]}</legend>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {BACKGROUND_SWATCHES.map((swatch) => (
                  <button
                    key={swatch}
                    type="button"
                    aria-label={swatch}
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
                  {T.customColor[locale]}
                </label>
              </div>
            </fieldset>
          ) : null}

          {settings.kind === "zamuceno" ? (
            <ChoiceChips
              legend={T.blur[locale]}
              name="crea-background-blur"
              options={(["blago", "jako"] as const).map((id) => ({ id, label: T.blurs[id][locale] }))}
              value={settings.blur}
              onChange={(blur) => setSettings((current) => ({ ...current, blur }))}
              disabled={busy}
            />
          ) : null}

          {settings.kind === "slika" ? (
            <div>
              <p className="type-body-sm font-black text-ink">{T.bgImage[locale]}</p>
              <div className="mt-2">
                <ImageInput
                  locale={locale}
                  input={backgroundImage}
                  disabled={busy}
                  fullScreenDrop={false}
                  chooseLabel={T.bgImageCta[locale]}
                />
              </div>
            </div>
          ) : null}

          {isAi ? (
            <div className="surface-inset bg-paper p-4">
              <PaidEditPanel
                locale={locale}
                routes={SCENE_ROUTES}
                purpose="scene"
                ready={image.picked !== null}
                notReadyReason={CREA_PAID_EDIT_COPY.needImage[locale]}
                prepare={async () => {
                  const picked = image.picked;
                  if (!picked) throw new Error("NEISPRAVNI_ULAZI");
                  const bitmap = await decodeImage(picked.file);
                  try {
                    const { canvas } = renderSized(bitmap, 2048);
                    return { files: { image: [await canvasToBlob(canvas, "image/jpeg", 0.92)] }, width: canvas.width, height: canvas.height };
                  } finally {
                    bitmap.close();
                  }
                }}
                parentJobId={image.picked?.sourceJobId ?? null}
                projectId={projectId}
                canSubmit={canSave}
                paid={paid}
              />
            </div>
          ) : null}
          {needsBackground ? <p className="type-body-sm font-semibold text-muted">{T.needBgImage[locale]}</p> : null}
          {needsMask && !isAi && work ? <p className="type-body-sm font-semibold text-muted">{T.needMask[locale]}</p> : null}
        </div>
      )}
    </ToolRunner>
  );
}

function BackgroundResult({ locale, output, subject }: { locale: Locale; output: CreaToolOutput<BackgroundExtra>; subject: Subject }) {
  return (
    <div className="space-y-2">
      {output.previewUrl ? (
        <TransparentPreview url={output.previewUrl} alt={T.run[locale]} transparent={output.extra.transparent} />
      ) : null}
      <p className="font-mono text-sm font-black text-ink">
        {output.extra.width} × {output.extra.height} px
      </p>
      {subject === "osoba" && output.extra.coverage < 0.01 ? (
        <p role="status" className="type-body-sm font-black text-ink">
          {T.nothingFound[locale]}
        </p>
      ) : null}
      {output.extra.transparent ? <p className="type-body-sm font-semibold text-muted">{T.transparentNote[locale]}</p> : null}
    </div>
  );
}

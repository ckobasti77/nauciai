/* eslint-disable @next/next/no-img-element -- pregled je lokalni `blob:` URL, koji next/image ne obrađuje. */
"use client";

import { Crop } from "lucide-react";
import { useState } from "react";

import { ToolRunner, type CreaToolOutput, type ToolRunContext } from "@/components/crea/tool-runner";
import { canvasToBlob, createCanvas, decodeImage, resizeCanvas } from "@/components/crea/tools/canvas";
import { ChoiceChips } from "@/components/crea/tools/choice-chips";
import { ImageInput, useImageInput } from "@/components/crea/tools/image-input";
import { PaidEditPanel } from "@/components/crea/tools/paid-edit";
import type { CreaToolProps } from "@/components/crea/tools/types";
import { fillCopy } from "@/lib/crea-copy";
import { cropFileName, cropOutputType, outputSize } from "@/lib/crea-crop";
import { CREA_PAID_EDIT_COPY, CREA_REFRAME_COPY as T } from "@/lib/crea-edit-copy";
import { CREA_IMAGE_TOOL_COPY } from "@/lib/crea-image-tools-copy";
import { EXPAND_ROUTES } from "@/lib/crea-paid-edit";
import {
  cropAxis,
  EXPAND_FILL,
  expandLayout,
  expandModelRatio,
  expandPrompt,
  REFRAME_PRESET_IDS,
  reframeCrop,
  reframePreset,
  type ReframePresetId,
} from "@/lib/crea-reframe";
import type { Locale } from "@/lib/i18n";

type ReframeExtra = { width: number; height: number; belowRecommended: number | null };

/** Isečak na punoj rezoluciji u jednom crtanju, pa `pica` do veličine preseta (nikad uvećanje). */
async function cropImage(file: File, presetId: ReframePresetId, shift: number, context: ToolRunContext): Promise<CreaToolOutput<ReframeExtra>> {
  context.reportRunning();
  const preset = reframePreset(presetId);
  const bitmap = await decodeImage(file);
  const box = reframeCrop(bitmap.width, bitmap.height, preset.aspect, shift);
  const { canvas, ctx } = createCanvas(box.width, box.height);
  ctx.drawImage(bitmap, box.x, box.y, box.width, box.height, 0, 0, box.width, box.height);
  bitmap.close();
  const size = outputSize(box, preset, null);
  const sized = await resizeCanvas(canvas, size.width, size.height);
  const type = cropOutputType(file.type);
  const blob = await canvasToBlob(sized, type, 0.92);
  return {
    blob,
    kind: "image",
    fileName: cropFileName(file.name, type),
    previewUrl: URL.createObjectURL(blob),
    params: { format: presetId, sirina: size.width, visina: size.height },
    extra: { width: size.width, height: size.height, belowRecommended: size.belowRecommended ? (preset.size?.width ?? null) : null },
  };
}

/** Fotka na sivom platnu odnosa koji model prima - ono što AI doslikava je sivo. */
async function expandCanvas(file: File, ratio: string) {
  const bitmap = await decodeImage(file);
  const layout = expandLayout(bitmap.width, bitmap.height, ratio);
  const { canvas, ctx } = createCanvas(layout.canvasWidth, layout.canvasHeight);
  ctx.fillStyle = EXPAND_FILL;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, layout.photo.x, layout.photo.y, layout.photo.width, layout.photo.height);
  bitmap.close();
  return { blob: await canvasToBlob(canvas, "image/jpeg", 0.92), layout };
}

/**
 * Proširi ili iseci kadar (S15, K12): izaberi „za Instagram / TikTok / YouTube",
 * pa iseci besplatno na uređaju (pomeri kadar klizačem) ili proširi plaćeno -
 * Nano Banana 2 dobija celu fotku na sivom platnu i doslika ostatak.
 */
export default function ReframeTool({ tool, locale, caps, canSave, projectId, source, paid }: CreaToolProps) {
  const image = useImageInput(source);
  const [presetId, setPresetId] = useState<ReframePresetId>("prica");
  const [shift, setShift] = useState(0);
  const [size, setSize] = useState<{ key: string; width: number; height: number } | null>(null);
  const preset = reframePreset(presetId);
  const picked = image.picked;
  const known = picked && size?.key === picked.key ? size : null;
  const axis = known ? cropAxis(known.width, known.height, preset.aspect) : null;
  const modelRatio = expandModelRatio(preset.aspect);
  const layout = known ? expandLayout(known.width, known.height, modelRatio) : null;

  return (
    <ToolRunner
      tool={tool}
      locale={locale}
      caps={caps}
      canSave={canSave}
      projectId={projectId}
      parentJobId={picked?.sourceJobId ?? null}
      canRun={picked !== null && axis !== null}
      inputKey={picked ? `${picked.key}:${presetId}:${shift}` : null}
      runLabel={T.run[locale]}
      icon={<Crop aria-hidden="true" className="size-5" />}
      run={(context) => cropImage(picked!.file, presetId, shift, context)}
      renderResult={(output) => <ReframeResult locale={locale} output={output} />}
    >
      {({ busy }) => (
        <div className="space-y-5">
          <ImageInput locale={locale} input={image} disabled={busy} />
          {picked ? (
            <img
              src={picked.url}
              alt=""
              className="hidden"
              onLoad={(event) =>
                setSize({ key: picked.key, width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })
              }
            />
          ) : null}
          <ChoiceChips
            legend={T.target[locale]}
            name="crea-reframe-preset"
            options={REFRAME_PRESET_IDS.map((id) => {
              const option = reframePreset(id);
              return { id, label: option.label[locale], hint: option.hint[locale] };
            })}
            value={presetId}
            onChange={(id) => {
              setPresetId(id);
              setShift(0);
            }}
            disabled={busy}
          />

          {known && axis === null ? <p className="type-body-sm font-bold text-ink">{T.same[locale]}</p> : null}

          {known && picked && axis !== null ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <section className="surface-inset space-y-3 bg-paper p-4">
                <h3 className="type-body font-black text-ink">{T.cropTitle[locale]}</h3>
                <p className="type-body-sm font-semibold text-muted">{T.cropBody[locale]}</p>
                <CropPreview locale={locale} url={picked.url} size={known} aspect={preset.aspect} shift={shift} />
                <div>
                  <div className="flex items-baseline justify-between gap-2">
                    <label htmlFor="crea-reframe-shift" className="type-body-sm font-black text-ink">
                      {T.shift[locale]}
                    </label>
                    <span className="text-xs font-bold text-muted">{axis === "x" ? T.shiftX[locale] : T.shiftY[locale]}</span>
                  </div>
                  <input
                    id="crea-reframe-shift"
                    type="range"
                    min={-100}
                    max={100}
                    step={1}
                    value={Math.round(shift * 100)}
                    disabled={busy}
                    onChange={(event) => setShift(Number(event.target.value) / 100)}
                    className="h-11 w-full cursor-pointer accent-ink"
                  />
                </div>
              </section>

              <section className="surface-inset space-y-3 bg-paper p-4">
                <h3 className="type-body font-black text-ink">{T.expandTitle[locale]}</h3>
                <p className="type-body-sm font-semibold text-muted">
                  {fillCopy(T.expandBody[locale], {
                    where: layout?.grows === "vertical" ? T.whereVertical[locale] : T.whereHorizontal[locale],
                  })}
                </p>
                {layout ? <ExpandPreview locale={locale} url={picked.url} layout={layout} /> : null}
                {modelRatio !== preset.ratio ? (
                  <p className="type-body-sm font-semibold text-muted">
                    {fillCopy(T.modelRatio[locale], { ratio: modelRatio, target: preset.ratio })}
                  </p>
                ) : null}
                <PaidEditPanel
                  locale={locale}
                  routes={EXPAND_ROUTES}
                  purpose="edit"
                  ready={!busy}
                  notReadyReason={CREA_PAID_EDIT_COPY.needImage[locale]}
                  prepare={async () => {
                    const { blob, layout: prepared } = await expandCanvas(picked.file, modelRatio);
                    return { files: { image: [blob] }, width: prepared.canvasWidth, height: prepared.canvasHeight };
                  }}
                  request={(_route, text) => ({
                    prompt: expandPrompt(modelRatio, layout?.grows ?? "vertical", text, locale),
                    aspect_ratio: modelRatio,
                  })}
                  textField={{ label: T.extraLabel[locale], placeholder: T.extraPlaceholder[locale], required: false }}
                  label={T.expandCta[locale]}
                  parentJobId={picked.sourceJobId ?? null}
                  projectId={projectId}
                  canSubmit={canSave}
                  paid={paid}
                />
              </section>
            </div>
          ) : null}
        </div>
      )}
    </ToolRunner>
  );
}

/** Fotka sa svetlim kadrom koji ostaje; ostatak je zatamnjen. */
function CropPreview({
  locale,
  url,
  size,
  aspect,
  shift,
}: {
  locale: Locale;
  url: string;
  size: { width: number; height: number };
  aspect: number;
  shift: number;
}) {
  const box = reframeCrop(size.width, size.height, aspect, shift);
  return (
    <div
      role="img"
      aria-label={T.previewLabel[locale]}
      className="surface-media relative mx-auto w-full overflow-hidden bg-paper-strong"
      // Okvir ima tačno odnos fotke (do 18 rem visine), pa procenti kadra pogađaju fotku.
      style={{ aspectRatio: `${size.width} / ${size.height}`, maxWidth: `${(18 * size.width) / size.height}rem` }}
    >
      <img src={url} alt="" className="absolute inset-0 size-full opacity-35" />
      <div
        aria-hidden="true"
        className="absolute overflow-hidden outline outline-2 outline-yellow"
        style={{
          left: `${(box.x / size.width) * 100}%`,
          top: `${(box.y / size.height) * 100}%`,
          width: `${(box.width / size.width) * 100}%`,
          height: `${(box.height / size.height) * 100}%`,
        }}
      >
        <img
          src={url}
          alt=""
          className="absolute max-w-none"
          style={{
            width: `${(size.width / box.width) * 100}%`,
            height: `${(size.height / box.height) * 100}%`,
            left: `${(-box.x / box.width) * 100}%`,
            top: `${(-box.y / box.height) * 100}%`,
          }}
        />
      </div>
    </div>
  );
}

/** Platno za proširenje: fotka u sredini, sivo okolo - tačno ono što ide modelu. */
function ExpandPreview({ locale, url, layout }: { locale: Locale; url: string; layout: ReturnType<typeof expandLayout> }) {
  return (
    <div
      role="img"
      aria-label={T.expandPreviewLabel[locale]}
      className="surface-media relative mx-auto w-full overflow-hidden"
      // Siva je podatak koji ide modelu (prazan deo platna), ne boja interfejsa.
      style={{
        aspectRatio: `${layout.canvasWidth} / ${layout.canvasHeight}`,
        maxWidth: `${(18 * layout.canvasWidth) / layout.canvasHeight}rem`,
        backgroundColor: EXPAND_FILL,
      }}
    >
      <img
        src={url}
        alt=""
        className="absolute"
        style={{
          left: `${(layout.photo.x / layout.canvasWidth) * 100}%`,
          top: `${(layout.photo.y / layout.canvasHeight) * 100}%`,
          width: `${(layout.photo.width / layout.canvasWidth) * 100}%`,
          height: `${(layout.photo.height / layout.canvasHeight) * 100}%`,
        }}
      />
    </div>
  );
}

function ReframeResult({ locale, output }: { locale: Locale; output: CreaToolOutput<ReframeExtra> }) {
  return (
    <div className="space-y-2">
      {output.previewUrl ? (
        <img
          src={output.previewUrl}
          alt={CREA_IMAGE_TOOL_COPY.after[locale]}
          className="surface-media mx-auto block max-h-96 w-auto max-w-full bg-paper"
        />
      ) : null}
      <p className="font-mono text-sm font-black text-ink">{fillCopy(T.result[locale], { w: output.extra.width, h: output.extra.height })}</p>
      {output.extra.belowRecommended ? (
        <p className="type-body-sm font-semibold text-muted">{fillCopy(T.belowRecommended[locale], { w: output.extra.belowRecommended })}</p>
      ) : null}
    </div>
  );
}

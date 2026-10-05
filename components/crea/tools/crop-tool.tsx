/* eslint-disable @next/next/no-img-element -- rezultat je lokalni `blob:` URL, koji next/image ne obrađuje. */
"use client";

import { Crop, FlipHorizontal2, FlipVertical2, RotateCcw, RotateCw } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import Cropper, { type Area, type Point } from "react-easy-crop";

import { ToolRunner, type CreaToolOutput, type ToolRunContext } from "@/components/crea/tool-runner";
import { canvasToBlob, createCanvas, decodeImage, drawScaled, resizeCanvas } from "@/components/crea/tools/canvas";
import { ChoiceChips } from "@/components/crea/tools/choice-chips";
import { ImageInput, useImageInput } from "@/components/crea/tools/image-input";
import type { CreaToolProps } from "@/components/crea/tools/types";
import { Spinner } from "@/components/ui/spinner";
import { fillCopy } from "@/lib/crea-copy";
import {
  CROP_PRESETS,
  cropFileName,
  cropOutputType,
  cropPreset,
  flip,
  NO_ORIENTATION,
  orientationMatrix,
  orientedSize,
  outputSize,
  percentToPixels,
  rotateBy,
  type CropPreset,
  type CropPresetId,
  type Orientation,
  type OutputSize,
} from "@/lib/crea-crop";
import { CREA_CROP_COPY, CREA_IMAGE_TOOL_COPY } from "@/lib/crea-image-tools-copy";
import { fitPixels } from "@/lib/crea-image-format";
import { CreaLocalAiError } from "@/lib/crea-local-ai/errors";
import type { Locale } from "@/lib/i18n";

/** Pregled za isecanje je manji od originala - dovoljno za oko, a brz i na telefonu. */
const PREVIEW_MAX_SIDE = 1600;

type CropExtra = { size: OutputSize };

/**
 * Isečak na punoj rezoluciji: okreni/preslikaj pa iseci u jednom crtanju (bez
 * međuslike cele fotke), pa `pica` do izlazne veličine. Ponovno kodiranje
 * usput briše i skrivene podatke (EXIF/GPS), kao u „Promeni format".
 */
async function cropImage(
  file: File,
  orientation: Orientation,
  area: Area,
  preset: CropPreset,
  customWidth: number | null,
  context: ToolRunContext,
): Promise<CreaToolOutput<CropExtra>> {
  context.reportRunning();
  const bitmap = await decodeImage(file);
  try {
    const oriented = orientedSize(bitmap.width, bitmap.height, orientation);
    const box = percentToPixels(area, oriented.width, oriented.height);
    const size = outputSize(box, preset, customWidth);

    const mid = fitPixels(box.width, box.height);
    const scale = mid.width / box.width;
    const { canvas, ctx } = createCanvas(mid.width, mid.height);
    const type = cropOutputType(file.type);
    if (type === "image/jpeg") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, mid.width, mid.height);
    }
    ctx.setTransform(scale, 0, 0, scale, -box.x * scale, -box.y * scale);
    ctx.transform(...orientationMatrix(bitmap.width, bitmap.height, orientation));
    ctx.drawImage(bitmap, 0, 0);
    if (context.signal.aborted) throw new CreaLocalAiError("ABORTED");

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
        ...(orientation.rotation ? { okret: orientation.rotation } : {}),
        ...(orientation.flipH ? { preslikano: "levo-desno" } : orientation.flipV ? { preslikano: "gore-dole" } : {}),
      },
      extra: { size },
    };
  } finally {
    bitmap.close();
  }
}

type OrientedPreview = {
  url: string;
  width: number;
  height: number;
  /** Okrenute dimenzije ORIGINALA - u njima se računa izlazna veličina. */
  full: { width: number; height: number };
};

/** Pregled okrenute slike (manji od originala) kao `blob:` URL za `react-easy-crop`. */
function useOrientedPreview(file: File | null, orientation: Orientation) {
  const [preview, setPreview] = useState<OrientedPreview | null>(null);

  useEffect(() => {
    if (!file) return;
    let alive = true;
    let url: string | null = null;
    void (async () => {
      const bitmap = await decodeImage(file).catch(() => null);
      if (!bitmap || !alive) return;
      const full = orientedSize(bitmap.width, bitmap.height, orientation);
      const { canvas: small } = drawScaled(bitmap, PREVIEW_MAX_SIDE);
      bitmap.close();
      const size = orientedSize(small.width, small.height, orientation);
      const { canvas, ctx } = createCanvas(size.width, size.height);
      ctx.setTransform(...orientationMatrix(small.width, small.height, orientation));
      ctx.drawImage(small, 0, 0);
      const blob = await canvasToBlob(canvas, "image/jpeg", 0.85).catch(() => null);
      if (!blob || !alive) return;
      url = URL.createObjectURL(blob);
      setPreview({ url, width: size.width, height: size.height, full });
    })();
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [file, orientation]);

  return file ? preview : null;
}

function IconAction({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="grid size-11 place-items-center rounded-full border-2 border-ink bg-paper text-ink transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
    >
      {children}
    </button>
  );
}

export default function CropTool({ tool, locale, caps, canSave, projectId, source }: CreaToolProps) {
  const image = useImageInput(source);
  const file = image.picked?.file ?? null;
  const [presetId, setPresetId] = useState<CropPresetId>("kvadrat");
  const [orientation, setOrientation] = useState<Orientation>(NO_ORIENTATION);
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);
  const [widthText, setWidthText] = useState("");
  const preset = cropPreset(presetId);
  const preview = useOrientedPreview(file, orientation);

  // Nova slika ili nov položaj: isečak kreće iz sredine.
  const [seen, setSeen] = useState({ file, orientation, presetId });
  if (seen.file !== file || seen.orientation !== orientation || seen.presetId !== presetId) {
    setSeen({ file, orientation, presetId });
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setArea(null);
  }

  const aspect = preset.aspect ?? (preview ? preview.width / preview.height : 1);
  const customWidth = presetId === "original" && widthText.trim() ? Number(widthText) : null;
  // Izlazna veličina za prikaz: procenti isečka primenjeni na okrenut ORIGINAL.
  const fullSize = preview && area ? percentToPixels(area, preview.full.width, preview.full.height) : null;
  const planned = fullSize ? outputSize(fullSize, preset, customWidth) : null;
  const areaKey = area ? [area.x, area.y, area.width, area.height].map((n) => n.toFixed(2)).join(",") : "";

  return (
    <ToolRunner
      tool={tool}
      locale={locale}
      caps={caps}
      canSave={canSave}
      projectId={projectId}
      parentJobId={image.picked?.sourceJobId ?? null}
      canRun={image.picked !== null && area !== null}
      inputKey={
        image.picked
          ? `${image.picked.key}:${presetId}:${orientation.rotation}${orientation.flipH}${orientation.flipV}:${areaKey}:${customWidth}`
          : null
      }
      icon={<Crop aria-hidden="true" className="size-5" />}
      run={(context) => cropImage(image.picked!.file, orientation, area!, preset, customWidth, context)}
      renderResult={(output) => <CropResult locale={locale} output={output} />}
    >
      {({ busy }) => (
        <div className="space-y-5">
          <ImageInput locale={locale} input={image} disabled={busy} />

          <ChoiceChips
            legend={CREA_IMAGE_TOOL_COPY.format[locale]}
            name="crea-crop-preset"
            options={CROP_PRESETS.map((entry) => ({ id: entry.id, label: entry.label[locale], hint: entry.hint[locale] }))}
            value={presetId}
            onChange={setPresetId}
            disabled={busy}
          />

          {image.picked ? (
            <div className="space-y-3">
              <div className="surface-inset relative h-72 overflow-hidden bg-paper sm:h-96">
                {preview ? (
                  <Cropper
                    image={preview.url}
                    crop={crop}
                    zoom={zoom}
                    rotation={0}
                    aspect={aspect}
                    minZoom={1}
                    maxZoom={4}
                    cropShape={preset.round ? "round" : "rect"}
                    showGrid={!preset.round}
                    zoomSpeed={0.5}
                    restrictPosition
                    keyboardStep={10}
                    onCropChange={setCrop}
                    onZoomChange={setZoom}
                    onCropComplete={(percentages) => setArea(percentages)}
                    style={{}}
                    classes={{}}
                    mediaProps={{ alt: "" }}
                    cropperProps={{ "aria-label": CREA_CROP_COPY.cropLabel[locale] }}
                  />
                ) : (
                  <p className="grid h-full place-items-center type-body-sm font-bold text-muted">
                    <span className="inline-flex items-center gap-2">
                      <Spinner size="xs" />
                      {CREA_CROP_COPY.previewing[locale]}
                    </span>
                  </p>
                )}
              </div>
              <p className="type-body-sm font-semibold text-muted">{CREA_CROP_COPY.cropLabel[locale]}</p>

              <div className="flex flex-wrap items-center gap-3">
                <IconAction label={CREA_CROP_COPY.rotateLeft[locale]} disabled={busy} onClick={() => setOrientation((o) => rotateBy(o, -90))}>
                  <RotateCcw aria-hidden="true" className="size-5" />
                </IconAction>
                <IconAction label={CREA_CROP_COPY.rotateRight[locale]} disabled={busy} onClick={() => setOrientation((o) => rotateBy(o, 90))}>
                  <RotateCw aria-hidden="true" className="size-5" />
                </IconAction>
                <IconAction label={CREA_CROP_COPY.flipH[locale]} disabled={busy} onClick={() => setOrientation((o) => flip(o, "h"))}>
                  <FlipHorizontal2 aria-hidden="true" className="size-5" />
                </IconAction>
                <IconAction label={CREA_CROP_COPY.flipV[locale]} disabled={busy} onClick={() => setOrientation((o) => flip(o, "v"))}>
                  <FlipVertical2 aria-hidden="true" className="size-5" />
                </IconAction>
                <label className="flex min-w-[10rem] flex-1 items-center gap-3">
                  <span className="type-body-sm font-black text-ink">{CREA_CROP_COPY.zoom[locale]}</span>
                  <input
                    type="range"
                    min={1}
                    max={4}
                    step={0.05}
                    value={zoom}
                    disabled={busy}
                    onChange={(event) => setZoom(Number(event.target.value))}
                    className="h-11 w-full cursor-pointer accent-ink"
                  />
                </label>
              </div>

              {presetId === "original" ? (
                <div>
                  <label htmlFor="crea-crop-width" className="type-body-sm font-black text-ink">
                    {CREA_CROP_COPY.width[locale]}
                  </label>
                  <input
                    id="crea-crop-width"
                    type="number"
                    inputMode="numeric"
                    min={16}
                    max={8192}
                    value={widthText}
                    placeholder={fullSize ? String(fullSize.width) : ""}
                    disabled={busy}
                    onChange={(event) => setWidthText(event.target.value)}
                    className="surface-inset mt-2 block min-h-11 w-40 border-2 border-ink bg-paper px-3 font-mono text-base font-bold text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                  />
                  <p className="mt-1 type-body-sm font-semibold text-muted">{CREA_CROP_COPY.widthHint[locale]}</p>
                </div>
              ) : null}

              {planned ? <PlannedSize locale={locale} preset={preset} size={planned} /> : null}
            </div>
          ) : null}
        </div>
      )}
    </ToolRunner>
  );
}

function PlannedSize({ locale, preset, size }: { locale: Locale; preset: CropPreset; size: OutputSize }) {
  return (
    <div className="space-y-1">
      <p className="font-mono text-sm font-black text-ink">
        {fillCopy(CREA_IMAGE_TOOL_COPY.outputSize[locale], { w: size.width, h: size.height })}
      </p>
      {size.belowRecommended && preset.size ? (
        <p className="type-body-sm font-semibold text-muted">
          {fillCopy(CREA_IMAGE_TOOL_COPY.belowRecommended[locale], { w: preset.size.width })}
        </p>
      ) : null}
      {size.limited ? <p className="type-body-sm font-semibold text-muted">{CREA_IMAGE_TOOL_COPY.limited[locale]}</p> : null}
    </div>
  );
}

function CropResult({ locale, output }: { locale: Locale; output: CreaToolOutput<CropExtra> }) {
  return (
    <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:items-start">
      {output.previewUrl ? (
        <img
          src={output.previewUrl}
          alt={output.fileName}
          className="surface-media max-h-80 w-full bg-paper object-contain shadow-[inset_0_0_0_1px_var(--shadow-hard-14)]"
        />
      ) : null}
      <div className="space-y-1">
        <p className="type-body-sm font-semibold text-muted">{output.fileName}</p>
        <p className="font-mono text-sm font-black text-ink">
          {fillCopy(CREA_IMAGE_TOOL_COPY.outputSize[locale], { w: output.extra.size.width, h: output.extra.size.height })}
        </p>
      </div>
    </div>
  );
}

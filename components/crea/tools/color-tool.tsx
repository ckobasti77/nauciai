"use client";

import { Eye, Palette, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import BeforeAfter from "@/components/crea/before-after";
import { ToolRunner, type CreaToolOutput, type ToolRunContext } from "@/components/crea/tool-runner";
import type { ColorRenderer } from "@/components/crea/tools/color-render";
import { decodeImage } from "@/components/crea/tools/canvas";
import { ChoiceChips } from "@/components/crea/tools/choice-chips";
import { ImageInput, useImageInput } from "@/components/crea/tools/image-input";
import { outputMaxSide, outputTypeFor, renderSized, resultFileName } from "@/components/crea/tools/mask-canvas";
import type { CreaToolProps } from "@/components/crea/tools/types";
import { Button } from "@/components/ui/button";
import { CREA_COLOR_COPY as T } from "@/lib/crea-edit-copy";
import { CREA_IMAGE_TOOL_COPY } from "@/lib/crea-image-tools-copy";
import { CreaLocalAiError } from "@/lib/crea-local-ai/errors";
import {
  ADJUST_SLIDERS,
  buildLutData,
  CREA_LOOKS,
  isNeutralGrade,
  lookById,
  NEUTRAL_ADJUST,
  screenEffects,
  type CreaAdjustKey,
  type CreaColorAdjust,
} from "@/lib/crea-lut";
import type { Locale } from "@/lib/i18n";

export type Grade = { adjust: CreaColorAdjust; lookId: string; intensity: number };
type ColorExtra = { width: number; height: number };

/** Pregled: dovoljno oštar za oko, dovoljno mali da klizač radi glatko. */
const PREVIEW_MAX_SIDE = 1024;

export function gradeFor(grade: Grade, neutral = false) {
  const look = lookById(neutral ? "original" : grade.lookId);
  const adjust = neutral ? NEUTRAL_ADJUST : grade.adjust;
  const intensity = neutral ? 1 : grade.intensity / 100;
  return { lut: buildLutData(adjust, look, intensity), ...screenEffects(adjust, look, intensity) };
}

async function exportGraded(file: File, grade: Grade, mobile: boolean, context: ToolRunContext): Promise<CreaToolOutput<ColorExtra>> {
  context.reportRunning();
  const { ColorRenderer: Renderer } = await import("@/components/crea/tools/color-render");
  const renderer = new Renderer(true);
  const bitmap = await decodeImage(file);
  try {
    const { canvas } = renderSized(bitmap, Math.min(outputMaxSide(mobile), renderer.maxSide));
    renderer.setImage(canvas);
    renderer.setGrade(gradeFor(grade));
    if (context.signal.aborted) throw new CreaLocalAiError("ABORTED");
    const type = outputTypeFor(file);
    const blob = await renderer.toBlob(canvas.width, canvas.height, type, 0.92);
    return {
      blob,
      kind: "image",
      fileName: resultFileName("boje", file, type),
      previewUrl: URL.createObjectURL(blob),
      params: { izgled: grade.lookId, jacina: grade.intensity, sirina: canvas.width, visina: canvas.height },
      extra: { width: canvas.width, height: canvas.height },
    };
  } finally {
    bitmap.close();
    renderer.dispose();
  }
}

/**
 * Boje i svetlo (S17, K11): klizači (svetlo, kontrast, zasićenost, toplina…)
 * i filmski izgledi kao 3D tabela boja na `postprocessing`-u (three.js), uz
 * živ pregled i „drži za original". Konačna slika se crta istim lancem u punoj
 * veličini. 0 kredita, sve na uređaju.
 */
export default function ColorTool({ tool, locale, caps, canSave, projectId, source }: CreaToolProps) {
  const image = useImageInput(source);
  const [grade, setGrade] = useState<Grade>({ adjust: NEUTRAL_ADJUST, lookId: "original", intensity: 100 });
  const neutral = isNeutralGrade(grade.adjust, lookById(grade.lookId), grade.intensity / 100);
  const gradeKey = `${grade.lookId}:${grade.intensity}:${ADJUST_SLIDERS.map((slider) => grade.adjust[slider.key]).join(",")}`;

  return (
    <ToolRunner
      tool={tool}
      locale={locale}
      caps={caps}
      canSave={canSave}
      projectId={projectId}
      parentJobId={image.picked?.sourceJobId ?? null}
      canRun={image.picked !== null && !neutral}
      inputKey={image.picked ? `${image.picked.key}:${gradeKey}` : null}
      runLabel={T.run[locale]}
      icon={<Palette aria-hidden="true" className="size-5" />}
      run={(context) => exportGraded(image.picked!.file, grade, caps?.mobile === true, context)}
      renderResult={(output) => <ColorResult locale={locale} output={output} beforeUrl={image.picked?.url ?? ""} />}
    >
      {({ busy }) => (
        <div className="space-y-5">
          <ImageInput locale={locale} input={image} disabled={busy} />
          {image.picked ? <ColorPreview locale={locale} file={image.picked.file} grade={grade} /> : null}

          <ChoiceChips
            legend={T.looks[locale]}
            name="crea-color-look"
            options={CREA_LOOKS.map((look) => ({ id: look.id, label: look.label[locale] }))}
            value={grade.lookId}
            onChange={(lookId) => setGrade((current) => ({ ...current, lookId }))}
            disabled={busy}
          />
          {grade.lookId !== "original" ? (
            <Slider
              label={T.intensity[locale]}
              value={grade.intensity}
              min={0}
              max={100}
              disabled={busy}
              onChange={(intensity) => setGrade((current) => ({ ...current, intensity }))}
            />
          ) : null}

          <fieldset disabled={busy} className="min-w-0 space-y-1">
            <legend className="type-body-sm font-black text-ink">{T.basic[locale]}</legend>
            {ADJUST_SLIDERS.filter((slider) => slider.basic).map((slider) => (
              <AdjustSlider key={slider.key} locale={locale} sliderKey={slider.key} grade={grade} setGrade={setGrade} disabled={busy} />
            ))}
          </fieldset>
          <details className="group">
            <summary className="inline-flex min-h-11 cursor-pointer items-center type-body-sm font-black text-ink underline decoration-2 underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
              {T.more[locale]}
            </summary>
            <div className="mt-2 space-y-1">
              {ADJUST_SLIDERS.filter((slider) => !slider.basic).map((slider) => (
                <AdjustSlider key={slider.key} locale={locale} sliderKey={slider.key} grade={grade} setGrade={setGrade} disabled={busy} />
              ))}
            </div>
          </details>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="ghost"
              onClick={() => setGrade({ adjust: NEUTRAL_ADJUST, lookId: "original", intensity: 100 })}
              disabled={busy || neutral}
              icon={<RotateCcw aria-hidden="true" className="size-4" />}
            >
              {T.reset[locale]}
            </Button>
            {image.picked && neutral ? <p className="type-body-sm font-semibold text-muted">{T.neutral[locale]}</p> : null}
          </div>
        </div>
      )}
    </ToolRunner>
  );
}

export function Slider({
  label,
  value,
  min,
  max,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className="grid min-h-11 grid-cols-[minmax(6.5rem,8rem)_minmax(0,1fr)_2.75rem] items-center gap-3 type-body-sm font-black text-ink">
      <span>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-11 w-full cursor-pointer accent-ink disabled:cursor-not-allowed"
      />
      <span className="text-right font-mono text-xs text-muted">{value > 0 && min < 0 ? `+${value}` : value}</span>
    </label>
  );
}

export function AdjustSlider({
  locale,
  sliderKey,
  grade,
  setGrade,
  disabled,
}: {
  locale: Locale;
  sliderKey: CreaAdjustKey;
  grade: Grade;
  setGrade: (update: (current: Grade) => Grade) => void;
  disabled: boolean;
}) {
  const slider = ADJUST_SLIDERS.find((entry) => entry.key === sliderKey)!;
  return (
    <Slider
      label={slider.label[locale]}
      value={grade.adjust[sliderKey]}
      min={slider.min}
      max={100}
      disabled={disabled}
      onChange={(value) => setGrade((current) => ({ ...current, adjust: { ...current.adjust, [sliderKey]: value } }))}
    />
  );
}

/** Živ pregled na GPU-u; „Drži za original" privremeno pokazuje fotku bez izmena. */
export function ColorPreview({ locale, file, grade }: { locale: Locale; file: File; grade: Grade }) {
  const host = useRef<HTMLDivElement | null>(null);
  const [renderer, setRenderer] = useState<{ instance: ColorRenderer; width: number; height: number } | null>(null);
  const [failed, setFailed] = useState(false);
  const [holding, setHolding] = useState(false);

  useEffect(() => {
    let alive = true;
    let created: ColorRenderer | null = null;
    void (async () => {
      try {
        const [{ ColorRenderer: Renderer }, bitmap] = await Promise.all([import("@/components/crea/tools/color-render"), decodeImage(file)]);
        const { canvas } = renderSized(bitmap, PREVIEW_MAX_SIDE);
        bitmap.close();
        if (!alive) return;
        created = new Renderer();
        created.setImage(canvas);
        created.canvas.className = "block h-auto w-full";
        created.canvas.setAttribute("aria-label", T.previewLabel[locale]);
        created.canvas.setAttribute("role", "img");
        host.current?.replaceChildren(created.canvas);
        setRenderer({ instance: created, width: canvas.width, height: canvas.height });
      } catch {
        if (alive) setFailed(true);
      }
    })();
    return () => {
      alive = false;
      created?.dispose();
      setRenderer(null);
    };
  }, [file, locale]);

  const lut = useMemo(() => gradeFor(grade, holding), [grade, holding]);
  useEffect(() => {
    if (!renderer) return;
    // Jedan crtež po kadru ekrana, i kad klizač šalje mnogo promena.
    const frame = requestAnimationFrame(() => {
      renderer.instance.setGrade(lut);
      renderer.instance.render(renderer.width, renderer.height);
    });
    return () => cancelAnimationFrame(frame);
  }, [renderer, lut]);

  if (failed) return <p className="type-body-sm font-black text-ink">{T.noWebgl[locale]}</p>;

  return (
    <div className="space-y-2">
      <div className="surface-media relative overflow-hidden bg-paper shadow-[inset_0_0_0_1px_var(--shadow-hard-14)]">
        <div ref={host} className="mx-auto max-h-[60vh] w-full max-w-full" />
        {holding ? (
          <span className="pointer-events-none absolute left-3 top-3 rounded-full border-2 border-ink bg-paper-strong px-3 py-1 text-xs font-black text-ink">
            {T.showing[locale]}
          </span>
        ) : null}
      </div>
      <Button
        variant="secondary"
        icon={<Eye aria-hidden="true" className="size-4" />}
        onPointerDown={() => setHolding(true)}
        onPointerUp={() => setHolding(false)}
        onPointerLeave={() => setHolding(false)}
        onPointerCancel={() => setHolding(false)}
        onKeyDown={(event) => {
          if (event.key === " " || event.key === "Enter") setHolding(true);
        }}
        onKeyUp={() => setHolding(false)}
        onBlur={() => setHolding(false)}
        disabled={!renderer}
      >
        {T.hold[locale]}
      </Button>
    </div>
  );
}

function ColorResult({ locale, output, beforeUrl }: { locale: Locale; output: CreaToolOutput<ColorExtra>; beforeUrl: string }) {
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

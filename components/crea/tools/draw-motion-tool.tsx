/* eslint-disable @next/next/no-img-element -- pregled je lokalni `blob:` URL, koji next/image ne obrađuje. */
"use client";

import { MoveUpRight, Trash2, Undo2 } from "lucide-react";
import { useId, useState, type PointerEvent as ReactPointerEvent } from "react";

import { ToolHeader } from "@/components/crea/tool-runner";
import { ImageInput, useImageInput } from "@/components/crea/tools/image-input";
import { providerPhoto } from "@/components/crea/tools/mask-canvas";
import { PaidEditPanel } from "@/components/crea/tools/paid-edit";
import type { CreaToolProps } from "@/components/crea/tools/types";
import { CREA_TOOL_COPY, fillCopy } from "@/lib/crea-copy";
import { DRAW_MOTION_MODELS, MAX_ARROWS, motionPrompt, usableArrows, type MotionArrow } from "@/lib/crea-motion-arrows";
import type { CreaPaidRoute } from "@/lib/crea-paid-edit";
import { CREA_VIDEO_COPY as T } from "@/lib/crea-video-copy";

const W = 1000;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Strelica u SVG-u: debela linija mastilom, preko nje žuta, glava na kraju i redni broj na početku. */
function ArrowShape({ arrow, height, index }: { arrow: MotionArrow; height: number; index: number }) {
  const x1 = arrow.x1 * W;
  const y1 = arrow.y1 * height;
  const x2 = arrow.x2 * W;
  const y2 = arrow.y2 * height;
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const head = 34;
  const wing = (offset: number) => `${x2 - head * Math.cos(angle + offset)},${y2 - head * Math.sin(angle + offset)}`;
  return (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--ink)" strokeWidth={16} strokeLinecap="round" />
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--yellow)" strokeWidth={8} strokeLinecap="round" />
      <polygon points={`${x2},${y2} ${wing(0.5)} ${wing(-0.5)}`} fill="var(--yellow)" stroke="var(--ink)" strokeWidth={6} strokeLinejoin="round" />
      <circle cx={x1} cy={y1} r={26} fill="var(--yellow)" stroke="var(--ink)" strokeWidth={6} />
      <text x={x1} y={y1} dy="0.35em" textAnchor="middle" fontSize={30} fontWeight={900} fill="var(--ink)">
        {index + 1}
      </text>
    </g>
  );
}

/**
 * „Crtaj pokret" (Crea K18, V12): strelice preko slike - od onoga što se pomera
 * do mesta gde stiže - postaju rečenice za model (`motionPrompt`), a slika je prvi
 * kadar (`image` režim). Plaćeno kroz postojeći tok (`PaidEditPanel` →
 * `studio.createJob`), sa cenom izabranog modela na dugmetu.
 */
export default function DrawMotionTool({ tool, locale, canSave, projectId, source, paid }: CreaToolProps) {
  const image = useImageInput(source);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [arrows, setArrows] = useState<MotionArrow[]>([]);
  const [draft, setDraft] = useState<MotionArrow | null>(null);
  const [text, setText] = useState("");
  const textId = useId();
  const picked = image.picked;
  const height = size ? Math.round((W * size.height) / size.width) : W;
  const usable = usableArrows(arrows);
  const prompt = motionPrompt(text, usable);

  // Nova slika = nove strelice (stare pripadaju drugom kadru).
  const [pickedKey, setPickedKey] = useState<string | null>(null);
  if ((picked?.key ?? null) !== pickedKey) {
    setPickedKey(picked?.key ?? null);
    setArrows([]);
    setSize(null);
  }

  const routes: CreaPaidRoute[] = DRAW_MOTION_MODELS.flatMap((slug) => {
    const model = paid?.catalog.find((entry) => entry.slug === slug);
    return model ? [{ modelSlug: slug, inputMode: "image", kind: "photo" as const, label: { sr: model.labelSr, en: model.labelEn } }] : [];
  });

  function point(event: ReactPointerEvent<SVGSVGElement>): { x: number; y: number } {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: clamp01((event.clientX - rect.left) / rect.width), y: clamp01((event.clientY - rect.top) / rect.height) };
  }

  return (
    <section aria-labelledby="crea-tool-title" className="surface-card border-2 border-ink bg-paper-strong p-4 shadow-[6px_6px_0_0_var(--shadow-hard)] sm:p-6">
      <ToolHeader tool={tool} locale={locale} icon={<MoveUpRight aria-hidden="true" className="size-5" />} />
      <div className="mt-5 space-y-5 border-t border-line pt-5">
        <ImageInput locale={locale} input={image} disabled={false} />
        {picked ? (
          <div className="space-y-3">
            <p className="type-body-sm font-semibold text-muted">{T.drawHow[locale]}</p>
            <div className="surface-media relative overflow-hidden bg-paper shadow-[inset_0_0_0_1px_var(--shadow-hard-14)]">
              <img
                src={picked.url}
                alt=""
                draggable={false}
                onLoad={(event) => setSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
                className="block h-auto w-full select-none"
              />
              {size ? (
                <svg
                  viewBox={`0 0 ${W} ${height}`}
                  role="img"
                  aria-label={`${T.arrowsLabel[locale]}: ${fillCopy(T.arrowsCount[locale], { n: usable.length, max: MAX_ARROWS })}`}
                  className="absolute inset-0 size-full cursor-crosshair touch-none"
                  onPointerDown={(event) => {
                    if (usable.length >= MAX_ARROWS) return;
                    event.currentTarget.setPointerCapture(event.pointerId);
                    const start = point(event);
                    setDraft({ x1: start.x, y1: start.y, x2: start.x, y2: start.y });
                  }}
                  onPointerMove={(event) => {
                    if (!draft) return;
                    const end = point(event);
                    setDraft({ ...draft, x2: end.x, y2: end.y });
                  }}
                  onPointerUp={() => {
                    if (draft && usableArrows([draft]).length === 1) setArrows((list) => [...usableArrows(list), draft].slice(0, MAX_ARROWS));
                    setDraft(null);
                  }}
                  onPointerCancel={() => setDraft(null)}
                >
                  {usable.map((arrow, index) => (
                    <ArrowShape key={index} arrow={arrow} height={height} index={index} />
                  ))}
                  {draft ? <ArrowShape arrow={draft} height={height} index={usable.length} /> : null}
                </svg>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={usable.length === 0}
                onClick={() => setArrows((list) => usableArrows(list).slice(0, -1))}
                className="inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-ink bg-paper-strong px-4 text-sm font-black text-ink transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-40 motion-reduce:transition-none"
              >
                <Undo2 aria-hidden="true" className="size-4" />
                {T.undoArrow[locale]}
              </button>
              <button
                type="button"
                disabled={usable.length === 0}
                onClick={() => setArrows([])}
                className="inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-ink/25 bg-paper px-4 text-sm font-black text-ink transition-colors hover:border-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-40"
              >
                <Trash2 aria-hidden="true" className="size-4" />
                {T.clearArrows[locale]}
              </button>
              <p className="font-mono text-sm font-black tabular-nums text-ink">{fillCopy(T.arrowsCount[locale], { n: usable.length, max: MAX_ARROWS })}</p>
            </div>
          </div>
        ) : null}
        <div>
          <label htmlFor={textId} className="type-body-sm font-black text-ink">
            {T.drawExtra[locale]}
          </label>
          <input
            id={textId}
            value={text}
            maxLength={400}
            onChange={(event) => setText(event.target.value)}
            placeholder={T.drawPlaceholder[locale]}
            className="surface-inset mt-2 block min-h-11 w-full border-2 border-ink bg-paper px-3 type-body font-semibold text-ink placeholder:text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          />
        </div>
        {usable.length > 0 ? (
          <details className="text-xs font-bold text-muted">
            <summary className="cursor-pointer select-none py-1 text-ink">{T.drawPreview[locale]}</summary>
            <p className="mt-1 whitespace-pre-line break-words font-semibold">{prompt}</p>
          </details>
        ) : null}
      </div>
      <div className="mt-5 border-t border-line pt-5">
        <PaidEditPanel
          locale={locale}
          routes={routes}
          purpose="edit"
          ready={picked !== null && usable.length > 0}
          notReadyReason={picked ? T.needArrow[locale] : CREA_TOOL_COPY.chooseFile[locale]}
          prepare={async () => {
            const prepared = await providerPhoto(picked!.file);
            return { files: { image: [prepared.blob] }, width: prepared.width, height: prepared.height };
          }}
          request={() => ({ prompt })}
          textField={null}
          label={T.drawCreate[locale]}
          parentJobId={picked?.sourceJobId ?? null}
          derivation="animacija"
          projectId={projectId}
          canSubmit={canSave}
          paid={paid}
        />
      </div>
    </section>
  );
}

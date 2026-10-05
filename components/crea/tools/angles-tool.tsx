/* eslint-disable @next/next/no-img-element -- isečci su lokalni `blob:` URL-ovi, koje next/image ne obrađuje. */
"use client";

import { CircleCheck, Download, Grid3x3, ImagePlus, Scissors } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { ToolHeader } from "@/components/crea/tool-runner";
import { canvasToBlob, createCanvas } from "@/components/crea/tools/canvas";
import { ChoiceChips } from "@/components/crea/tools/choice-chips";
import { ImageInput, useImageInput } from "@/components/crea/tools/image-input";
import { loadImageFromUrl, naturalSize, useWatchedJob } from "@/components/crea/tools/job-image";
import { LocalStepStatus, useLocalStep, type LocalStepContext } from "@/components/crea/tools/local-step";
import { providerPhoto } from "@/components/crea/tools/mask-canvas";
import { PaidEditPanel } from "@/components/crea/tools/paid-edit";
import type { CreaPaidContext, CreaToolProps } from "@/components/crea/tools/types";
import { useSaveLocalResult } from "@/components/crea/use-save-local-result";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { Id } from "@/convex/_generated/dataModel";
import { creaSaveErrorMessage, fillCopy } from "@/lib/crea-copy";
import { CREA_ANGLES_COPY as T, CREA_PAID_EDIT_COPY } from "@/lib/crea-edit-copy";
import {
  ANGLES_GRID_PARAMS,
  angleFileName,
  anglesGridPrompt,
  anglesSavings,
  CAMERA_ANGLES,
  GRID_COLS,
  GRID_INSET,
  GRID_ROWS,
  gridCells,
} from "@/lib/crea-grid-crop";
import { ANGLES_ROUTES } from "@/lib/crea-paid-edit";
import type { Locale } from "@/lib/i18n";
import { buildParams, creditsFor, formatCredits, paramValuesForMode } from "@/lib/studio-params";

type Mode = "napravi" | "iseci";
type Cut = { index: number; blob: Blob; url: string };
type SaveState = { saved: ReadonlySet<number>; saving: number | null; error: string | null };

/** Mreža → 9 isečaka (JPG), redom polja; ivica polja se odseca (tanka linija između kadrova). */
async function cutGrid(url: string, context: LocalStepContext): Promise<Cut[]> {
  context.reportRunning();
  const { image, release } = await loadImageFromUrl(url, context.signal);
  try {
    const { width, height } = naturalSize(image);
    const cuts: Cut[] = [];
    for (const cell of gridCells(width, height, GRID_ROWS, GRID_COLS, GRID_INSET)) {
      const { canvas, ctx } = createCanvas(cell.width, cell.height);
      ctx.drawImage(image, cell.x, cell.y, cell.width, cell.height, 0, 0, cell.width, cell.height);
      const blob = await canvasToBlob(canvas, "image/jpeg", 0.92);
      cuts.push({ index: cell.index, blob, url: URL.createObjectURL(blob) });
    }
    return cuts;
  } finally {
    release();
  }
}

/** Cena mreže (4K) i jedne obične slike istog modela (podrazumevana podešavanja), kao na dugmetu. */
function useGridPrices(paid: CreaPaidContext | null) {
  return useMemo(() => {
    const route = ANGLES_ROUTES[0]!;
    const model = paid?.catalog.find((entry) => entry.slug === route.modelSlug);
    if (!model) return { grid: null, single: null };
    const price = (values: Record<string, string>) =>
      creditsFor(
        model.priceRule,
        buildParams(model.paramSpec, { ...paramValuesForMode(model.paramSpec, route.inputMode), ...values }, route.inputMode),
        route.inputMode,
        model.creditFactor,
      );
    return { grid: price({ ...ANGLES_GRID_PARAMS }), single: price({}) };
  }, [paid]);
}

/**
 * Uglovi kamere (S19, K12): JEDNA plaćena generacija pravi mrežu 3×3 (devet
 * uglova istog subjekta), a mreža se na uređaju iseče u 9 zasebnih radova -
 * svaki je verzija mreže u stablu. Mreža iz galerije (ili fajl) može i samo da
 * se iseče, besplatno.
 */
export default function AnglesTool({ tool, locale, canSave, projectId, source, paid }: CreaToolProps) {
  const [mode, setMode] = useState<Mode>(source ? "iseci" : "napravi");
  const image = useImageInput(source);
  const [gridJobId, setGridJobId] = useState<Id<"generationJobs"> | null>(null);
  const gridJob = useWatchedJob(gridJobId);
  const step = useLocalStep();
  const [cutSet, setCutSet] = useState<{ key: string; cuts: Cut[]; parent: Id<"generationJobs"> | null; demo: boolean } | null>(null);
  const prices = useGridPrices(paid);
  const savings = anglesSavings(prices.grid, prices.single);

  // Isečci se oslobađaju kad odu sa ekrana (novo isecanje ili zatvaranje alata).
  useEffect(
    () => () => {
      for (const cut of cutSet?.cuts ?? []) URL.revokeObjectURL(cut.url);
    },
    [cutSet],
  );

  async function cut(key: string, url: string, parent: Id<"generationJobs"> | null, demo: boolean) {
    const result = await step.run((context) => cutGrid(url, context));
    if (result) setCutSet({ key, cuts: result, parent, demo });
  }

  const gridReady = gridJob?.status === "done" && gridJob.outputUrl ? gridJob.outputUrl : null;
  const gridFailed = gridJob?.status === "failed" || gridJob?.status === "refunded";
  // Isečci važe samo za izvor iz kojeg su nastali (mreža iz ovog alata ili izabrana slika).
  const currentKey = mode === "napravi" ? (gridJobId ? `posao:${gridJobId}` : null) : image.picked ? `slika:${image.picked.key}` : null;
  const cuts = cutSet && cutSet.key === currentKey ? cutSet.cuts : null;

  return (
    <section
      aria-labelledby="crea-tool-title"
      className="surface-card border-2 border-ink bg-paper-strong p-4 shadow-[6px_6px_0_0_var(--shadow-hard)] sm:p-6"
    >
      <ToolHeader tool={tool} locale={locale} icon={<Grid3x3 aria-hidden="true" className="size-5" />} />
      <div className="mt-5 space-y-5 border-t border-line pt-5">
        <ChoiceChips<Mode>
          legend={T.mode[locale]}
          name="crea-angles-mode"
          options={(["napravi", "iseci"] as const).map((id) => ({ id, label: T.modes[id][locale] }))}
          value={mode}
          onChange={(next) => {
            setMode(next);
            step.reset();
          }}
          disabled={step.busy}
        />
        <ImageInput locale={locale} input={image} disabled={step.busy} />

        {mode === "napravi" ? (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              <section className="surface-inset space-y-2 bg-paper p-4">
                <h3 className="type-body font-black text-ink">{T.whyTitle[locale]}</h3>
                <p className="type-body-sm font-semibold text-muted">
                  {savings
                    ? fillCopy(T.whyBody[locale], {
                        grid: formatCredits(savings.grid, locale),
                        separately: formatCredits(savings.separately, locale),
                        // Decimala po jeziku: „3,7 kr" / „3.7 cr".
                        perAngle: formatCredits(savings.perAngle, locale).replace(".", locale === "sr" ? "," : "."),
                        percent: savings.percent,
                      })
                    : T.whyFallback[locale]}
                </p>
              </section>
              <section className="surface-inset bg-paper p-4">
                <h3 className="type-body font-black text-ink">{T.angles[locale]}</h3>
                <ol className="surface-media mt-2 grid grid-cols-3 gap-px overflow-hidden bg-line">
                  {CAMERA_ANGLES.map((angle, index) => (
                    <li key={angle.id} className="flex min-h-14 flex-col justify-center bg-paper-strong px-2 py-1.5 text-center">
                      <span className="font-mono text-[11px] font-bold text-muted">{index + 1}</span>
                      <span className="text-xs font-black leading-tight text-ink">{angle.label[locale]}</span>
                    </li>
                  ))}
                </ol>
              </section>
            </div>

            {gridJobId === null ? (
              <PaidEditPanel
                locale={locale}
                routes={ANGLES_ROUTES}
                purpose="edit"
                ready={image.picked !== null}
                notReadyReason={CREA_PAID_EDIT_COPY.needImage[locale]}
                prepare={async () => {
                  const photo = await providerPhoto(image.picked!.file);
                  return { files: { image: [photo.blob] }, width: photo.width, height: photo.height };
                }}
                request={(_route, text) => ({ prompt: anglesGridPrompt(locale, text), ...ANGLES_GRID_PARAMS })}
                textField={{ label: T.extraLabel[locale], placeholder: T.extraPlaceholder[locale], required: false }}
                label={T.cta[locale]}
                parentJobId={image.picked?.sourceJobId ?? null}
                projectId={projectId}
                canSubmit={canSave}
                paid={paid}
                onSent={setGridJobId}
              />
            ) : (
              <div className="surface-inset space-y-3 bg-paper p-4" aria-live="polite">
                {gridFailed ? (
                  <>
                    <p className="type-body-sm font-black text-red-700 dark:text-red-300">{T.failed[locale]}</p>
                    <Button variant="secondary" onClick={() => setGridJobId(null)}>
                      {T.cta[locale]}
                    </Button>
                  </>
                ) : gridReady ? (
                  <>
                    <p className="inline-flex items-center gap-2 type-body font-black text-ink">
                      <CircleCheck aria-hidden="true" className="size-5" />
                      {T.arrived[locale]}
                    </p>
                    <img src={gridReady} alt="" className="surface-media block max-h-64 w-auto max-w-full bg-paper-strong" />
                    <div className="flex flex-wrap gap-3">
                      {cuts === null ? (
                        <Button
                          onClick={() => void cut(`posao:${gridJobId}`, gridReady, gridJobId, gridJob?.isMock === true)}
                          loading={step.busy}
                          icon={<Scissors aria-hidden="true" className="size-4" />}
                          className="shadow-[4px_4px_0_0_var(--ink)]"
                        >
                          {T.cut[locale]}
                        </Button>
                      ) : null}
                      <Button variant="ghost" disabled={step.busy} onClick={() => setGridJobId(null)}>
                        {T.another[locale]}
                      </Button>
                    </div>
                  </>
                ) : (
                  <p className="inline-flex items-center gap-2 type-body-sm font-black text-ink">
                    <Spinner size="sm" />
                    {T.waiting[locale]}
                  </p>
                )}
              </div>
            )}
          </>
        ) : image.picked && cuts === null ? (
          <Button
            onClick={() => void cut(`slika:${image.picked!.key}`, image.picked!.url, image.picked!.sourceJobId ?? null, false)}
            loading={step.busy}
            icon={<Scissors aria-hidden="true" className="size-4" />}
            className="shadow-[4px_4px_0_0_var(--ink)]"
          >
            {T.cut[locale]}
          </Button>
        ) : null}

        <LocalStepStatus locale={locale} state={step.state} onCancel={step.cancel} />

        {cutSet && cuts ? (
          <AngleCuts
            key={cutSet.key}
            locale={locale}
            toolId={tool.id}
            cuts={cuts}
            parentJobId={cutSet.parent}
            projectId={projectId}
            canSave={canSave}
            demo={cutSet.demo}
          />
        ) : null}
      </div>
    </section>
  );
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** 9 isečaka sa nazivom ugla; „Sačuvaj svih 9" čuva redom (svaki je zaseban rad, dete mreže). */
function AngleCuts({
  locale,
  toolId,
  cuts,
  parentJobId,
  projectId,
  canSave,
  demo,
}: {
  locale: Locale;
  toolId: string;
  cuts: readonly Cut[];
  parentJobId: Id<"generationJobs"> | null;
  projectId: Id<"studioProjects"> | null;
  canSave: boolean;
  demo: boolean;
}) {
  const saveLocalResult = useSaveLocalResult();
  const [save, setSave] = useState<SaveState>({ saved: new Set(), saving: null, error: null });
  const running = useRef(false);
  const allSaved = save.saved.size === cuts.length;

  async function saveAll() {
    if (running.current) return;
    running.current = true;
    const saved = new Set(save.saved);
    setSave({ saved, saving: saved.size + 1, error: null });
    try {
      for (const cut of cuts) {
        if (saved.has(cut.index)) continue;
        setSave({ saved: new Set(saved), saving: saved.size + 1, error: null });
        let reason: string | null = null;
        try {
          const result = await saveLocalResult({
            toolId,
            kind: "image",
            blob: cut.blob,
            params: { ugao: CAMERA_ANGLES[cut.index]?.id ?? "polje", polje: cut.index + 1 },
            projectId,
            parentJobId,
          });
          if (!result.ok) reason = result.reason;
        } catch (error) {
          reason = error instanceof Error ? error.message : String(error);
        }
        if (reason !== null) {
          setSave({ saved: new Set(saved), saving: null, error: creaSaveErrorMessage(reason, locale) });
          return;
        }
        saved.add(cut.index);
      }
      setSave({ saved: new Set(saved), saving: null, error: null });
    } finally {
      running.current = false;
    }
  }

  return (
    <section className="space-y-4 border-t border-line pt-5">
      <h3 className="type-h4 text-ink">{T.cutsTitle[locale]}</h3>
      <ol className="grid max-w-2xl grid-cols-3 gap-2 sm:gap-3">
        {cuts.map((cut) => {
          const angle = CAMERA_ANGLES[cut.index];
          const name = angle?.label[locale] ?? String(cut.index + 1);
          return (
            <li key={cut.index} className="min-w-0">
              <figure className="space-y-1">
                <div className="surface-media relative overflow-hidden bg-paper">
                  <img src={cut.url} alt={name} className="block aspect-square w-full object-cover" />
                  {/* Tanka ivica preko slike: svetao kadar se inače stapa sa papirom. */}
                  <span aria-hidden="true" className="pointer-events-none absolute inset-0 surface-media shadow-[inset_0_0_0_1px_var(--shadow-hard-14)]" />
                  {save.saved.has(cut.index) ? (
                    <span className="absolute right-1 top-1 grid size-7 place-items-center rounded-full border-2 border-ink bg-yellow text-ink">
                      <CircleCheck aria-hidden="true" className="size-4" />
                    </span>
                  ) : null}
                </div>
                <figcaption className="flex items-center justify-between gap-1">
                  <span className="min-w-0 truncate text-xs font-black text-ink">{`${cut.index + 1}. ${name}`}</span>
                  <button
                    type="button"
                    onClick={() => download(cut.blob, angleFileName(cut.index, cut.blob.type))}
                    aria-label={fillCopy(T.downloadOne[locale], { name })}
                    className="grid size-11 shrink-0 place-items-center rounded-full text-ink hover:bg-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                  >
                    <Download aria-hidden="true" className="size-4" />
                  </button>
                </figcaption>
              </figure>
            </li>
          );
        })}
      </ol>

      {demo ? <p className="type-body-sm font-semibold text-muted">{T.demoNote[locale]}</p> : null}

      <div className="flex flex-wrap items-center gap-3">
        {canSave ? (
          allSaved ? (
            <p className="inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-ink bg-paper px-4 text-sm font-black text-ink">
              <CircleCheck aria-hidden="true" className="size-4" />
              {T.savedAll[locale]}
            </p>
          ) : (
            <Button
              onClick={() => void saveAll()}
              loading={save.saving !== null}
              icon={<ImagePlus aria-hidden="true" className="size-4" />}
              className="shadow-[4px_4px_0_0_var(--ink)]"
            >
              {save.saving !== null
                ? fillCopy(T.savingN[locale], { n: save.saving })
                : save.saved.size > 0
                  ? T.saveRest[locale]
                  : T.saveAll[locale]}
            </Button>
          )
        ) : null}
        <Button
          variant="secondary"
          icon={<Download aria-hidden="true" className="size-4" />}
          onClick={() => {
            for (const cut of cuts) download(cut.blob, angleFileName(cut.index, cut.blob.type));
          }}
        >
          {T.downloadAll[locale]}
        </Button>
      </div>
      <div aria-live="polite">
        {save.error ? (
          <p role="alert" className="type-body-sm font-black text-red-700 dark:text-red-300">
            {fillCopy(T.savedSome[locale], { n: save.saved.size, reason: save.error })}
          </p>
        ) : null}
        {!canSave ? <p className="type-body-sm font-semibold text-muted">{T.noAccess[locale]}</p> : null}
      </div>
    </section>
  );
}

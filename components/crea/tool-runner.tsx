"use client";

import { CircleAlert, CircleCheck, Download, ImagePlus, Play, Square, Wrench } from "lucide-react";
import { motion, useReducedMotion, type Easing } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { ToolBadges } from "@/components/crea/tool-badges";
import { useSaveLocalResult } from "@/components/crea/use-save-local-result";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/primitives";
import { Spinner } from "@/components/ui/spinner";
import type { Id } from "@/convex/_generated/dataModel";
import { LOCAL_RESULT_MAX_BYTES } from "@/convex/creaLocalCore";
import { CREA_DEVICE_COPY, CREA_TOOL_COPY, creaSaveErrorMessage, fillCopy } from "@/lib/crea-copy";
import { needsDownloadConfirm, toolAvailability, type CreaDeviceCaps } from "@/lib/crea-device";
import { modelsCached } from "@/lib/crea-local-ai/cache";
import { localAiErrorMessage, toLocalAiError, type LocalAiErrorCode } from "@/lib/crea-local-ai/errors";
import { downloadBytes, type CreaLocalModelId } from "@/lib/crea-local-ai/models";
import { estimateSecondsLeft, formatBytes, type AggregateProgress } from "@/lib/crea-local-ai/progress";
import type { CreaMediaKind, CreaTool } from "@/lib/crea-tools";
import type { Locale } from "@/lib/i18n";
import { getStudioMotion } from "@/lib/studio-motion";

/** Ono što alat vrati: fajl za galeriju/preuzimanje i dodatak koji crta samo taj alat. */
export type CreaToolOutput<TExtra = unknown> = {
  blob: Blob;
  /** `text` i `svg` (paleta, OCR, vektor) se samo preuzimaju ili kopiraju - nikad u galeriju. */
  kind: CreaMediaKind | "text" | "svg";
  fileName: string;
  /** Opis rada u galeriji („Istorija"): samo JSON primitive. */
  params?: Record<string, string | number | boolean>;
  /** `blob:` URL pregleda; ToolRunner ga oslobađa kad rezultat ode sa ekrana. */
  previewUrl?: string;
  extra: TExtra;
};

export type ToolRunContext = {
  signal: AbortSignal;
  /** Napredak preuzimanja modela (bajtovi, procenat). */
  reportDownload: (progress: AggregateProgress) => void;
  /** Preuzimanje gotovo, alat računa. */
  reportRunning: () => void;
  /** Dug rad (npr. snimanje videa, K10): procenat 0-100 uz poruku „Radim…". */
  reportProgress: (percent: number) => void;
};

type Phase<TExtra> =
  | { name: "idle" }
  | { name: "confirm"; bytes: number }
  | { name: "downloading"; progress: AggregateProgress | null; startedAt: number; elapsedMs: number }
  | { name: "running"; percent?: number }
  | { name: "done"; output: CreaToolOutput<TExtra> }
  | { name: "error"; code: LocalAiErrorCode };

type SaveState = { status: "idle" | "saving" | "saved" } | { status: "error"; message: string };

/** Zaglavlje kartice alata: ikonica, naziv, rečenica i oznake (deli ga i plaćena četkica, K11). */
export function ToolHeader({ tool, locale, icon }: { tool: CreaTool; locale: Locale; icon?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-start gap-3">
      <span className="paper-island grid size-11 shrink-0 place-items-center rounded-full border-2 border-ink bg-yellow text-ink">
        {icon ?? <Wrench aria-hidden="true" className="size-5" />}
      </span>
      <div className="min-w-0 flex-1">
        <h2 id="crea-tool-title" className="type-h3 text-ink">
          {tool.title[locale]}
        </h2>
        <p className="mt-1 type-body-sm font-semibold text-muted">{tool.summary[locale]}</p>
        <ToolBadges tool={tool} locale={locale} className="mt-3" />
      </div>
    </header>
  );
}

/**
 * Generički okvir lokalnog alata (K04, plan K01 §3.5): ulaz → „Pokreni" → (prvo
 * preuzimanje uz potvrdu i traku napretka) → rad na uređaju → pregled → „Sačuvaj
 * u galeriju" / „Preuzmi". Sve vreme se može odustati. Alat daje samo ulaz
 * (`children`), funkciju `run` i crtež rezultata (`renderResult`).
 *
 * Jedan okvir po grupi: ivica `border-2 border-ink` je samo na spoljnoj kartici;
 * delovi unutra se dele tankom linijom (`border-line`).
 */
export function ToolRunner<TExtra>({
  tool,
  locale,
  caps,
  canSave,
  projectId,
  parentJobId = null,
  models: modelsOverride,
  webgpu = false,
  canRun,
  inputKey,
  runLabel,
  run,
  renderResult,
  icon,
  onSaved,
  children,
}: {
  tool: CreaTool;
  locale: Locale;
  caps: CreaDeviceCaps | null;
  /** Kapija za čuvanje (`hasStudioAccess`); bez nje ostaje „Preuzmi". */
  canSave: boolean;
  projectId: Id<"studioProjects"> | null;
  /** Rad iz galerije koji je bio ulaz (K05): sačuvan rezultat postaje njegova verzija. */
  parentJobId?: Id<"generationJobs"> | null;
  /**
   * Modeli koje ovaj uređaj stvarno preuzima (K11: BiRefNet ILI MODNet) - za
   * veličinu preuzimanja, potvrdu i „već je na uređaju". Podrazumevano svi iz registra.
   */
  models?: readonly CreaLocalModelId[];
  /** ONNX modeli idu kroz WebGPU izdanje ORT-a (drugi WASM; K11). */
  webgpu?: boolean;
  /** Ulaz je spreman (npr. izabrana slika). */
  canRun: boolean;
  /** Menja se sa ulazom; nova vrednost vraća runner na početak. */
  inputKey: string | null;
  /** Natpis glavnog dugmeta kad „Pokreni" ne opisuje radnju (editor: „Napravi sliku"). */
  runLabel?: string;
  run: (context: ToolRunContext) => Promise<CreaToolOutput<TExtra>>;
  renderResult: (output: CreaToolOutput<TExtra>) => ReactNode;
  icon?: ReactNode;
  /** Rezultat je sačuvan kao rad (K18: „Nastavi odavde" vodi dalje sa tim radom). */
  onSaved?: (jobId: Id<"generationJobs">) => void;
  children: (state: { busy: boolean }) => ReactNode;
}) {
  const reduceMotion = useReducedMotion();
  const motionParams = getStudioMotion(Boolean(reduceMotion));
  const saveLocalResult = useSaveLocalResult();
  const [phase, setPhase] = useState<Phase<TExtra>>({ name: "idle" });
  const [save, setSave] = useState<SaveState>({ status: "idle" });
  const [cached, setCached] = useState<boolean | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const models = modelsOverride ?? tool.localModels ?? [];
  const modelsKey = models.join("|");
  const availability = caps ? toolAvailability(tool, caps) : null;
  const busy = phase.name === "downloading" || phase.name === "running";

  // Nov ulaz = nov početak (rezultat starog ulaza više ne važi).
  const [seenInputKey, setSeenInputKey] = useState(inputKey);
  if (inputKey !== seenInputKey) {
    setSeenInputKey(inputKey);
    setPhase({ name: "idle" });
    setSave({ status: "idle" });
  }

  useEffect(() => {
    let alive = true;
    const ids = modelsKey ? (modelsKey.split("|") as CreaLocalModelId[]) : [];
    if (ids.length > 0) {
      void modelsCached(ids, { webgpu }).then((value) => {
        if (alive) setCached(value);
      });
    }
    return () => {
      alive = false;
    };
  }, [modelsKey, webgpu]);

  // Pregled rezultata (`blob:` URL) se oslobađa čim rezultat ode sa ekrana ili se alat zatvori.
  const previewUrl = phase.name === "done" ? phase.output.previewUrl : undefined;
  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl],
  );

  useEffect(() => () => abortRef.current?.abort(), []);

  async function start(confirmed: boolean) {
    if (!canRun || busy) return;
    if (!confirmed && models.length > 0 && caps) {
      const bytes = downloadBytes(models, { webgpu });
      if (needsDownloadConfirm(bytes, caps) && !(await modelsCached(models, { webgpu }))) {
        setPhase({ name: "confirm", bytes });
        return;
      }
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setSave({ status: "idle" });
    setPhase(models.length > 0 ? { name: "downloading", progress: null, startedAt: Date.now(), elapsedMs: 0 } : { name: "running" });
    try {
      const output = await run({
        signal: controller.signal,
        reportDownload: (progress) => {
          if (controller.signal.aborted) return;
          const now = Date.now();
          setPhase((current) =>
            current.name === "downloading" ? { ...current, progress, elapsedMs: now - current.startedAt } : current,
          );
        },
        reportRunning: () => {
          if (!controller.signal.aborted) setPhase({ name: "running" });
        },
        reportProgress: (percent) => {
          if (!controller.signal.aborted) setPhase({ name: "running", percent: Math.max(0, Math.min(100, Math.round(percent))) });
        },
      });
      if (controller.signal.aborted) {
        if (output.previewUrl) URL.revokeObjectURL(output.previewUrl);
        return;
      }
      if (models.length > 0) setCached(true);
      setPhase({ name: "done", output });
    } catch (error) {
      if (controller.signal.aborted) return;
      setPhase({ name: "error", code: toLocalAiError(error, "INFERENCE_FAILED").code });
    }
  }

  function cancel() {
    abortRef.current?.abort();
    setPhase({ name: "error", code: "ABORTED" });
  }

  async function saveToGallery(output: CreaToolOutput<TExtra>) {
    const kind = output.kind;
    if (kind === "text" || kind === "svg") return;
    setSave({ status: "saving" });
    try {
      const result = await saveLocalResult({
        toolId: tool.id,
        kind,
        blob: output.blob,
        params: output.params,
        projectId,
        parentJobId,
      });
      setSave(result.ok ? { status: "saved" } : { status: "error", message: creaSaveErrorMessage(result.reason, locale) });
      if (result.ok) onSaved?.(result.jobId);
    } catch (error) {
      setSave({
        status: "error",
        message: creaSaveErrorMessage(error instanceof Error ? error.message : String(error), locale),
      });
    }
  }

  function download(output: CreaToolOutput<TExtra>) {
    const url = URL.createObjectURL(output.blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = output.fileName;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const enter = {
    initial: reduceMotion ? false : ({ opacity: 0, y: 8 } as const),
    animate: { opacity: 1, y: 0 },
    transition: {
      duration: motionParams.element.enter.duration,
      ease: motionParams.element.enter.ease as Easing,
    },
  };

  const downloadSize = models.length > 0 ? formatBytes(downloadBytes(models, { webgpu }), locale) : null;

  return (
    <section
      aria-labelledby="crea-tool-title"
      className="surface-card border-2 border-ink bg-paper-strong p-4 shadow-[6px_6px_0_0_var(--shadow-hard)] sm:p-6"
    >
      <ToolHeader tool={tool} locale={locale} icon={icon} />

      {availability && !availability.ok ? (
        <p role="status" className="surface-inset mt-5 flex gap-2 bg-paper p-3 type-body-sm font-bold text-ink">
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {CREA_DEVICE_COPY.reasons[availability.reason][locale]}
        </p>
      ) : (
        <>
          <div className="mt-5 border-t border-line pt-5">{children({ busy })}</div>

          <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-line pt-5">
            {busy ? (
              <Button variant="secondary" onClick={cancel} icon={<Square aria-hidden="true" className="size-4" />}>
                {CREA_TOOL_COPY.cancel[locale]}
              </Button>
            ) : phase.name === "confirm" ? null : (
              // Posle rezultata glavna radnja je „Sačuvaj"; ponovno pokretanje se povlači u drugi plan.
              <Button
                variant={phase.name === "done" ? "secondary" : "primary"}
                onClick={() => void start(false)}
                disabled={!canRun || availability === null}
                icon={<Play aria-hidden="true" className="size-4" />}
                className={phase.name === "done" ? undefined : "shadow-[4px_4px_0_0_var(--ink)]"}
              >
                {runLabel ?? (phase.name === "done" || phase.name === "error" ? CREA_TOOL_COPY.again[locale] : CREA_TOOL_COPY.run[locale])}
              </Button>
            )}
            {downloadSize && !busy && phase.name !== "confirm" ? (
              <p className="type-body-sm font-semibold text-muted">
                {cached ? CREA_TOOL_COPY.cachedNote[locale] : fillCopy(CREA_TOOL_COPY.firstRunNote[locale], { size: downloadSize })}
              </p>
            ) : null}
            {availability === null ? (
              <p className="inline-flex items-center gap-2 type-body-sm font-semibold text-muted">
                <Spinner size="xs" />
                {CREA_TOOL_COPY.checking[locale]}
              </p>
            ) : null}
          </div>

          <div aria-live="polite">
            {phase.name === "confirm" ? (
              <motion.div {...enter} className="surface-inset mt-4 bg-paper p-4">
                <p className="type-body font-black text-ink">{CREA_TOOL_COPY.confirmTitle[locale]}</p>
                <p className="mt-1 type-body-sm font-semibold text-muted">
                  {fillCopy(CREA_TOOL_COPY.confirmBody[locale], { size: formatBytes(phase.bytes, locale) })}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button onClick={() => void start(true)} icon={<Download aria-hidden="true" className="size-4" />}>
                    {CREA_TOOL_COPY.confirmCta[locale]}
                  </Button>
                  <Button variant="ghost" onClick={() => setPhase({ name: "idle" })}>
                    {CREA_TOOL_COPY.cancel[locale]}
                  </Button>
                </div>
              </motion.div>
            ) : null}

            {phase.name === "downloading" ? (
              <DownloadProgress locale={locale} progress={phase.progress} elapsedMs={phase.elapsedMs} />
            ) : null}

            {phase.name === "running" ? (
              <p className="mt-4 inline-flex items-center gap-2 type-body-sm font-black text-ink">
                <Spinner size="sm" />
                {CREA_TOOL_COPY.running[locale]}
                {phase.percent !== undefined ? ` ${phase.percent} %` : ""}
              </p>
            ) : null}

            {phase.name === "error" ? (
              <p
                className={cn(
                  "mt-4 type-body-sm font-black",
                  phase.code === "ABORTED" ? "text-muted" : "text-red-700 dark:text-red-300",
                )}
              >
                {localAiErrorMessage(phase.code, locale)}
              </p>
            ) : null}
          </div>

          {phase.name === "done" ? (
            <motion.div {...enter} className="mt-5 border-t border-line pt-5">
              <h3 className="flex items-center gap-2 type-h4 text-ink">
                <CircleCheck aria-hidden="true" className="size-5" />
                {CREA_TOOL_COPY.doneTitle[locale]}
              </h3>
              <div className="mt-3">{renderResult(phase.output)}</div>
              <ResultActions
                locale={locale}
                tool={tool}
                output={phase.output}
                canSave={canSave}
                save={save}
                onSave={() => void saveToGallery(phase.output)}
                onDownload={() => download(phase.output)}
              />
            </motion.div>
          ) : null}
        </>
      )}
    </section>
  );
}

function DownloadProgress({
  locale,
  progress,
  elapsedMs,
}: {
  locale: Locale;
  progress: AggregateProgress | null;
  elapsedMs: number;
}) {
  const percent = progress?.percent ?? null;
  // Procena se računa pri svakom javljanju napretka - dovoljno često, a bez tajmera.
  const secondsLeft = progress ? estimateSecondsLeft(progress, elapsedMs) : null;
  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2 type-body-sm font-black text-ink">
        <span className="inline-flex items-center gap-2">
          <Spinner size="xs" />
          {CREA_TOOL_COPY.downloading[locale]}
          {percent !== null ? ` · ${percent} %` : ""}
        </span>
        {progress ? (
          <span className="font-mono text-xs font-bold text-muted">
            {progress.total !== null
              ? fillCopy(CREA_TOOL_COPY.downloadedOf[locale], {
                  loaded: formatBytes(Math.min(progress.loaded, progress.total), locale),
                  total: formatBytes(progress.total, locale),
                })
              : formatBytes(progress.loaded, locale)}
            {secondsLeft !== null && secondsLeft > 0
              ? ` · ${fillCopy(CREA_TOOL_COPY.secondsLeft[locale], { n: secondsLeft })}`
              : ""}
          </span>
        ) : null}
      </div>
      <div
        role="progressbar"
        aria-label={CREA_TOOL_COPY.downloading[locale]}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent ?? undefined}
        className="mt-2 h-3 overflow-hidden rounded-full border-2 border-ink bg-paper"
      >
        <div
          className="h-full origin-left bg-yellow transition-transform duration-200 ease-out motion-reduce:transition-none"
          style={{ transform: `scaleX(${(percent ?? 0) / 100})` }}
        />
      </div>
    </div>
  );
}

function ResultActions<TExtra>({
  locale,
  tool,
  output,
  canSave,
  save,
  onSave,
  onDownload,
}: {
  locale: Locale;
  tool: CreaTool;
  output: CreaToolOutput<TExtra>;
  canSave: boolean;
  save: SaveState;
  onSave: () => void;
  onDownload: () => void;
}) {
  const maxBytes = output.kind === "text" || output.kind === "svg" ? 0 : LOCAL_RESULT_MAX_BYTES[output.kind];
  const fitsGallery = output.blob.size <= maxBytes;
  const offerSave = tool.savesToGallery && canSave && fitsGallery;

  return (
    <div className="mt-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {offerSave ? (
          save.status === "saved" ? (
            <p className="inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-ink bg-paper px-4 text-sm font-black text-ink">
              <CircleCheck aria-hidden="true" className="size-4" />
              {CREA_TOOL_COPY.saved[locale]}
            </p>
          ) : (
            <Button
              onClick={onSave}
              loading={save.status === "saving"}
              icon={<ImagePlus aria-hidden="true" className="size-4" />}
              className="shadow-[4px_4px_0_0_var(--ink)]"
            >
              {save.status === "saving" ? CREA_TOOL_COPY.saving[locale] : CREA_TOOL_COPY.save[locale]}
            </Button>
          )
        ) : null}
        <Button variant="secondary" onClick={onDownload} icon={<Download aria-hidden="true" className="size-4" />}>
          {CREA_TOOL_COPY.download[locale]}
        </Button>
      </div>
      {save.status === "error" ? (
        <p role="alert" className="type-body-sm font-black text-red-700 dark:text-red-300">
          {save.message}
        </p>
      ) : null}
      {tool.savesToGallery && !canSave ? (
        <p className="type-body-sm font-semibold text-muted">{CREA_TOOL_COPY.noAccess[locale]}</p>
      ) : null}
      {tool.savesToGallery && canSave && !fitsGallery ? (
        <p className="type-body-sm font-semibold text-muted">
          {fillCopy(CREA_TOOL_COPY.saveTooBig[locale], { size: formatBytes(maxBytes, locale) })}
        </p>
      ) : null}
    </div>
  );
}

"use client";

import { useConvexAuth } from "@convex-dev/auth/react";
import { usePaginatedQuery, useMutation, useQuery } from "convex/react";
import { Coins, Download, Loader2, Sparkles, Wand2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { DropSlot, DropSlotGrid, FrameSlotPair, ReferenceSlots } from "@/components/studio/drop-slot";
import { GenerateButton } from "@/components/studio/generate-button";
import { ModelPicker } from "@/components/studio/model-picker";
import { ModeSwitcher } from "@/components/studio/mode-switcher";
import { ParamForm, useParamValues } from "@/components/studio/param-form";
import { Panel, SectionHeader, cn } from "@/components/ui/primitives";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { parseQuantitySource, promptControlOf } from "@/convex/studioJobCore";
import { withLocale, type Locale } from "@/lib/i18n";
import { jobPrompt, jobStatusText, jobTileState, RECENT_JOBS_COUNT } from "@/lib/studio-form";
import { parseStudioModel, type StudioModel, type StudioModelRow } from "@/lib/studio-models";
import {
  measuredDurationNotice,
  STUDIO_NOT_ENROLLED,
  STUDIO_NO_GENERATIONS,
  STUDIO_PAUSED,
} from "@/lib/studio-messages";
import { creditsFor, type ParamValues } from "@/lib/studio-params";
import {
  generateBlock,
  inputsPayload,
  measuredFile,
  measuredParams,
  measureMismatch,
  optionalSlots,
  promptRequired,
  type PlaygroundState,
} from "@/lib/studio-playground";
import {
  framePairFiles,
  measuredExtraCounts,
  missingInput,
  missingInputMessage,
  singleDropSlot,
  slotsForMode,
  type FramePair,
  type SlotFile,
  type SlotFiles,
} from "@/lib/studio-slots";

type StudioJob = {
  _id: string;
  modelSlug: string;
  kind: "image" | "video" | "audio";
  params: string;
  status: string;
  creditCost: number;
  outputUrl: string | null;
  error?: string;
  isMock: boolean;
  expiresAt?: number;
  createdAt: number;
};

/** Predlog koji prazna galerija ubacuje u polje jednim klikom. */
const FIRST_PROMPT = {
  sr: "ilustracija starog Beograda u stilu akvarela, topla večernja svetlost, tekstura papira",
  en: "watercolour illustration of old Belgrade, warm evening light, paper texture",
};

/** Tri stanja pločice bez slike; svako ima svoj tekst, nijedno nije prazno. */
const TILE_LABELS = {
  image: { sr: "", en: "" },
  refunded: { sr: "vraćeno", en: "refunded" },
  expired: { sr: "isteklo", en: "expired" },
  pending: { sr: "u izradi", en: "in progress" },
} as const;

const PILL =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border-2 px-5 py-2.5 text-sm font-extrabold transition duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-not-allowed disabled:opacity-60";

function formatDate(timestamp: number, locale: Locale) {
  return new Date(timestamp).toLocaleDateString(locale === "sr" ? "sr-RS" : "en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/**
 * Stanje u koje "Generiši ponovo" vraća formu: model, režim, parametri i
 * ULAZI. Bez ulaza dugme kod modela sa slikama ne znači ništa - ista slika sa
 * drugim promptom nije ista generacija.
 */
type RegenerateSeed = {
  id: string;
  inputMode?: string;
  params?: ParamValues;
  files?: SlotFiles;
  prompt?: string;
};

/** Sve što jedan poziv `createJob`-a nosi. */
type JobPayload = {
  params: Record<string, unknown>;
  inputMode: string;
  inputs: Record<string, string[]>;
};

/**
 * Slotovi izabranog režima. Koje komponente idu na ekran kaže `inputSpec`, ne
 * kod: par kadrova ima svoj oblik, reference svoj, a sve ostalo je jedan slot
 * po ulazu (STUDIO-CATALOG-V4 sekcija 5).
 */
function ModeInputs({
  model,
  inputMode,
  files,
  onFilesChange,
  frames,
  onFramesChange,
  locale,
  disabled,
}: {
  model: StudioModel;
  inputMode: string;
  files: SlotFiles;
  onFilesChange: (next: SlotFiles) => void;
  frames: FramePair;
  onFramesChange: (next: FramePair) => void;
  locale: Locale;
  disabled: boolean;
}) {
  const slots = slotsForMode(model.inputSpec, inputMode);
  if (slots.length === 0) return null;

  // Režim sa tačno jednim slotom je jedini smislen cilj za prijem preko celog
  // ekrana (AGENTS.md); sa dva se iz fajla ne vidi u koji slot ide.
  const single = singleDropSlot(model.inputSpec, inputMode) !== null;

  if (inputMode === "first_last") {
    return (
      <FrameSlotPair
        spec={slots[0]}
        frames={frames}
        onChange={onFramesChange}
        locale={locale}
        disabled={disabled}
      />
    );
  }

  if (inputMode === "reference") {
    return (
      <ReferenceSlots
        modeSpec={model.inputSpec[inputMode]}
        files={files}
        onChange={onFilesChange}
        locale={locale}
        disabled={disabled}
      />
    );
  }

  return (
    <div className="space-y-4">
      {slots.map((entry) =>
        entry.max > 1 ? (
          <DropSlotGrid
            key={entry.slot}
            slot={entry.slot}
            spec={entry}
            files={files[entry.slot] ?? []}
            onChange={(next) => onFilesChange({ ...files, [entry.slot]: next })}
            locale={locale}
            numbered
            fullScreen={single}
            disabled={disabled}
          />
        ) : (
          <DropSlot
            key={entry.slot}
            slot={entry.slot}
            spec={entry}
            file={files[entry.slot]?.[0] ?? null}
            onChange={(next) => onFilesChange({ ...files, [entry.slot]: next ? [next] : [] })}
            locale={locale}
            fullScreen={single}
            disabled={disabled}
          />
        ),
      )}
    </div>
  );
}

/**
 * Dužina okačenog snimka, pročitana iz metapodataka u browseru.
 *
 * Po njoj se NE naplaćuje - trajanje meri server iz zaglavlja fajla (W5,
 * `studioActions.measureInputUpload`) i ono ide u cenu. Ova cifra stoji samo
 * radi poređenja: kad se dve raziđu za više od 5%, korisniku se izmereno
 * trajanje kaže pre nego što pritisne dugme.
 */
function useMediaSeconds(file: SlotFile | null): number | null {
  // Rezultat se pamti ZAJEDNO sa adresom fajla, pa se pri promeni fajla ne
  // mora ništa nulovati u efektu - stara vrednost prosto više ne odgovara
  // trenutnom URL-u i ne vraća se.
  const [measured, setMeasured] = useState<{ url: string; seconds: number } | null>(null);
  const url = file?.url ?? null;
  const isVideo = file?.mime.startsWith("video/") ?? false;

  useEffect(() => {
    if (!url) return;

    let cancelled = false;
    const element = document.createElement(isVideo ? "video" : "audio");
    element.preload = "metadata";
    element.onloadedmetadata = () => {
      if (!cancelled && Number.isFinite(element.duration)) {
        setMeasured({ url, seconds: element.duration });
      }
    };
    element.src = url;

    return () => {
      cancelled = true;
      element.removeAttribute("src");
    };
  }, [url, isVideo]);

  return measured !== null && measured.url === url ? measured.seconds : null;
}

/**
 * Leva kolona: režim, ulazi, kontrole i dugme. Ima svoje stanje i zato se
 * remontira na promenu modela (`key` kod pozivaoca) - podešavanja jednog
 * modela ne smeju da procure u drugi.
 */
function PlaygroundForm({
  model,
  locale,
  studioState,
  balance,
  topUpHref,
  seed,
  isPending,
  error,
  onGenerate,
}: {
  model: StudioModel;
  locale: Locale;
  studioState: PlaygroundState | undefined;
  balance: number | undefined;
  topUpHref: string;
  seed: RegenerateSeed | null;
  isPending: boolean;
  error: string | null;
  onGenerate: (payload: JobPayload) => void;
}) {
  const [inputMode, setInputMode] = useState(
    () => seed?.inputMode ?? model.inputModes[0] ?? "text",
  );
  const [files, setFiles] = useState<SlotFiles>(() => seed?.files ?? {});
  const [frames, setFrames] = useState<FramePair>(() => ({
    first: seed?.files?.image?.[0] ?? null,
    last: seed?.files?.image?.[1] ?? null,
  }));

  // `first_last` drži par imenovano (S6 ODLUKA 9), ali i cena i `createJob`
  // gledaju obične slotove - pa se par ovde spaja nazad u slot `image`.
  const effectiveFiles: SlotFiles =
    inputMode === "first_last" ? { ...files, image: framePairFiles(frames) } : files;

  const quantitySource = useMemo(() => parseQuantitySource(JSON.stringify(model.capabilities)), [model]);
  const measureTarget = quantitySource
    ? measuredFile(quantitySource, model.inputSpec, inputMode, effectiveFiles)
    : null;
  const browserSeconds = useMediaSeconds(measureTarget);
  // Naplaćuje se ono što je server pročitao iz zaglavlja fajla, pa se po tome i
  // prikazuje cena (katalog 1.3: cifra na dugmetu i naplaćena cifra su ista
  // računica nad istim brojem). Browserova dužina služi samo za poređenje.
  const serverSeconds = measureTarget?.measuredSeconds ?? null;

  const promptControl = promptControlOf(model.paramSpec, inputMode);
  const initialValues = useMemo(() => {
    const values: ParamValues = { ...(seed?.params ?? {}) };
    if (seed?.prompt !== undefined && promptControl) values[promptControl.key] = seed.prompt;

    return values;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- početno stanje, ne prati kasnije promene
  }, []);

  // Merena količina ide u ISTI objekat parametara iz kojeg izlazi i cena na
  // dugmetu i ono što `createJob` naplati (katalog 1.3).
  const textValueKey = quantitySource?.measuredFrom ?? promptControl?.key;
  const [textLength, setTextLength] = useState(0);
  const measured = measuredParams(quantitySource, serverSeconds, textLength);
  const extras = measuredExtraCounts(model.priceRule, effectiveFiles);
  const form = useParamValues(model.paramSpec, inputMode, { ...measured, ...extras }, initialValues);

  const currentText = textValueKey ? form.values[textValueKey] : undefined;
  const currentTextLength = typeof currentText === "string" ? currentText.length : 0;
  if (currentTextLength !== textLength) setTextLength(currentTextLength);

  const optional = optionalSlots(model.paramSpec, form.values, model.inputSpec, inputMode);
  const missing = missingInput(
    model.inputSpec,
    inputMode,
    effectiveFiles,
    optional,
    inputMode === "first_last" ? frames : undefined,
  );
  const credits = creditsFor(model.priceRule, form.params, inputMode);
  const promptValue = promptControl ? form.values[promptControl.key] : undefined;
  const block = generateBlock({
    state: studioState,
    balance,
    credits,
    missingInputMessage: missingInputMessage(missing, locale),
    promptMissing:
      promptRequired(model.inputSpec, inputMode) &&
      (typeof promptValue !== "string" || promptValue.trim().length === 0),
    quantityMissing: quantitySource !== null && measured[quantitySource.param] === undefined,
  });

  function submit() {
    onGenerate({ params: form.params, inputMode, inputs: inputsPayload(effectiveFiles) });
  }

  return (
    <div className="space-y-5">
      <ModeSwitcher
        spec={model.inputSpec}
        modes={model.inputModes}
        value={inputMode}
        onChange={setInputMode}
        files={files}
        onFilesChange={setFiles}
        locale={locale}
        disabled={isPending}
      />

      <ModeInputs
        model={model}
        inputMode={inputMode}
        files={files}
        onFilesChange={setFiles}
        frames={frames}
        onFramesChange={setFrames}
        locale={locale}
        disabled={isPending}
      />

      <ParamForm
        spec={model.paramSpec}
        state={form}
        rule={model.priceRule}
        locale={locale}
        inputMode={inputMode}
        disabled={isPending}
      />

      <GenerateButton
        locale={locale}
        credits={credits}
        block={block}
        isPending={isPending}
        onGenerate={submit}
        topUpHref={topUpHref}
        error={error}
        notice={
          serverSeconds !== null && measureMismatch(browserSeconds, serverSeconds)
            ? measuredDurationNotice(serverSeconds, locale)
            : null
        }
      />
    </div>
  );
}

function DemoBadge({ locale }: { locale: Locale }) {
  return (
    <span
      title={
        locale === "sr"
          ? "Demo generacija - napravio ju je ugrađeni mock provajder, ne pravi model."
          : "Demo generation - produced by the built-in mock provider, not a real model."
      }
      className="rounded-full border-2 border-ink bg-white px-2.5 py-0.5 text-xs font-black uppercase text-ink"
    >
      DEMO
    </span>
  );
}

/**
 * Izlaz jednog posla. Video nikad ne ide kao goli `<video src>` - `preload="metadata"`
 * sa `#t=0.1` povuče samo zaglavlje i prvi kadar.
 */
function JobOutput({ job, alt }: { job: StudioJob; alt: string }) {
  if (!job.outputUrl) return null;

  if (job.kind === "video") {
    return (
      <video
        preload="metadata"
        controls
        muted
        playsInline
        className="h-full w-full object-cover"
        src={`${job.outputUrl}#t=0.1`}
      />
    );
  }

  if (job.kind === "audio") {
    return (
      <div className="grid h-full place-items-center p-4">
        <audio controls preload="metadata" src={job.outputUrl} className="w-full">
          <track kind="captions" />
        </audio>
      </div>
    );
  }

  return (
    <Image
      src={job.outputUrl}
      alt={alt || job.modelSlug}
      fill
      unoptimized
      sizes="(min-width: 1024px) 40vw, 100vw"
      className="object-cover"
    />
  );
}

/** Veliki prikaz najnovijeg posla. Status stiže sam - `useQuery` je pretplata. */
function LatestJob({ job, locale }: { job: StudioJob; locale: Locale }) {
  const isWorking = job.status === "reserved" || job.status === "running";
  const prompt = jobPrompt(job.params);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full border-2 border-ink bg-yellow px-3 py-0.5 text-xs font-black uppercase text-ink">
          {job.modelSlug}
        </span>
        <span className="rounded-full border-2 border-ink bg-white px-3 py-0.5 text-xs font-black text-ink">
          {job.creditCost} {locale === "sr" ? "kr" : "cr"}
        </span>
        {job.isMock ? <DemoBadge locale={locale} /> : null}
      </div>

      <div className="surface-media relative aspect-square w-full overflow-hidden border-2 border-ink bg-paper">
        {job.outputUrl ? (
          <JobOutput job={job} alt={prompt} />
        ) : (
          <div
            className={cn(
              "grid h-full place-items-center px-6 text-center",
              isWorking && "motion-safe:animate-pulse bg-ink/5",
            )}
          >
            <p className="text-base font-black text-muted">{jobStatusText(job, locale)}</p>
          </div>
        )}
      </div>

      {prompt ? <p className="text-sm font-bold text-muted">{prompt}</p> : null}

      <div className="flex flex-wrap items-center gap-3">
        {job.outputUrl ? (
          // Convex storage je druga adresa, pa `download` sam po sebi ne
          // primorava snimanje - zato nov tab, da se playground ne izgubi.
          <a
            href={job.outputUrl}
            download
            target="_blank"
            rel="noreferrer"
            className={cn(PILL, "border-ink bg-white text-ink shadow-[3px_3px_0_0_rgba(14,49,88,0.18)] hover:-translate-y-0.5")}
          >
            <Download className="size-4" />
            {locale === "sr" ? "Preuzmi" : "Download"}
          </a>
        ) : null}
        {job.outputUrl && job.expiresAt ? (
          <p className="text-xs font-bold text-muted">
            {locale === "sr" ? "fajl je dostupan do" : "the file is available until"}{" "}
            {formatDate(job.expiresAt, locale)}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function StudioPage({ locale }: { locale: Locale }) {
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const state = useQuery(api.studio.getStudioState, isAuthenticated ? {} : "skip");
  const balance = useQuery(api.credits.getBalance, isAuthenticated ? {} : "skip");
  const models = useQuery(api.studioModels.listModels, isAuthenticated ? {} : "skip");
  const jobs = usePaginatedQuery(api.studio.listMyJobs, isAuthenticated ? {} : "skip", {
    initialNumItems: RECENT_JOBS_COUNT + 1,
  });
  const createJob = useMutation(api.studio.createJob);

  // Galerija vodi ovde sa `?regenerate=<jobId>`; posao nosi model, režim,
  // parametre i ulaze, pa forma može da se vrati u tačno isto stanje. Lekcija
  // (P9) vodi sa `?lessonId=` i `?taskId=` - ta dva idu u `createJob` da bi
  // izlaz upisao `labOutputs` i zazeleneo zadatak.
  const searchParams = useSearchParams();
  const regenerateId = searchParams.get("regenerate");
  const regenerated = useQuery(
    api.studio.getJobForRegenerate,
    regenerateId && isAuthenticated ? { jobId: regenerateId as Id<"generationJobs"> } : "skip",
  );
  const lessonId = searchParams.get("lessonId") as Id<"lessons"> | null;
  const taskId = searchParams.get("taskId") as Id<"lessonTasks"> | null;

  const [selectedSlug, setSelectedSlug] = useState<string | null>(() => searchParams.get("model"));
  const [starterPrompt, setStarterPrompt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const creditsHref = withLocale(locale, "/app/credits");

  // Redovi se parsiraju JEDNOM: `useParamValues` promenu modela prepoznaje po
  // REFERENCI `paramSpec`-a, pa bi parsiranje u svakom renderu obaralo formu.
  const catalog = useMemo(
    () =>
      ((models ?? []) as StudioModelRow[])
        .map((row) => parseStudioModel(row))
        .filter((model): model is StudioModel => model !== null),
    [models],
  );

  const seed: RegenerateSeed | null = useMemo(() => {
    if (!regenerateId || !regenerated) return null;

    const files: SlotFiles = {};
    for (const input of regenerated.inputs) {
      const list = files[input.slot] ?? [];
      list.push({
        storageId: input.storageId,
        name: input.slot,
        mime: input.mime ?? "",
        size: input.size ?? 0,
        url: input.url,
        ...(input.durationS !== undefined ? { measuredSeconds: input.durationS } : {}),
      });
      files[input.slot] = list;
    }

    let params: ParamValues = {};
    try {
      const parsed: unknown = JSON.parse(regenerated.params);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        params = parsed as ParamValues;
      }
    } catch {
      params = {};
    }

    return {
      id: regenerateId,
      ...(regenerated.inputMode ? { inputMode: regenerated.inputMode } : {}),
      params,
      files,
    };
  }, [regenerateId, regenerated]);

  const header = (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <SectionHeader
        title={locale === "sr" ? "Studio" : "Studio"}
        body={
          locale === "sr"
            ? "Opiši šta hoćeš, izaberi model i generiši. Svaka generacija se plaća kreditima."
            : "Describe what you want, pick a model and generate. Every generation is paid in credits."
        }
      />
      {/* Balans je uvek vidljiv i uvek vodi na dopunu; `useQuery` je pretplata,
          pa broj padne sam čim `createJob` skine kredite. */}
      <Link
        href={creditsHref}
        className={cn(PILL, "shrink-0 border-ink bg-white text-ink shadow-[3px_3px_0_0_rgba(14,49,88,0.18)] hover:-translate-y-0.5")}
      >
        <Coins className="size-4" />
        {balance === undefined
          ? "—"
          : balance.balance.toLocaleString(locale === "sr" ? "sr-RS" : "en-US")}{" "}
        {locale === "sr" ? "kr" : "cr"}
      </Link>
    </div>
  );

  if (authLoading) {
    return (
      <div className="space-y-6">
        {header}
        <Panel className="flex min-h-32 items-center justify-center p-6">
          <Loader2 className="size-5 animate-spin text-muted" />
        </Panel>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="space-y-6">
        {header}
        <Panel className="p-6">
          <p className="text-base font-bold text-muted">
            {locale === "sr"
              ? "Prijavi se da bi generisao u Studiju."
              : "Sign in to generate in the Studio."}
          </p>
          <Link
            href={withLocale(locale, "/sign-in")}
            className={cn(PILL, "mt-4 border-ink bg-ink text-white shadow-[4px_4px_0_0_#f4be30] hover:-translate-y-0.5")}
          >
            {locale === "sr" ? "Prijavi se" : "Sign in"}
          </Link>
        </Panel>
      </div>
    );
  }

  const recommended = catalog.find((model) => model.badge === "preporuceno");
  // Ručan izbor ima prednost nad linkom: `?regenerate=` otvara model tog posla,
  // ali čim korisnik izabere drugi, link prestaje da ga vraća nazad.
  const activeModel =
    catalog.find((model) => model.slug === selectedSlug) ??
    (regenerated ? catalog.find((model) => model.slug === regenerated.modelSlug) : undefined) ??
    recommended ??
    catalog[0];

  const jobRows = jobs.results as unknown as StudioJob[];
  const latest = jobRows[0];
  const recent = jobRows.slice(1, RECENT_JOBS_COUNT + 1);

  async function generate(payload: JobPayload) {
    if (!activeModel) return;
    setIsPending(true);
    setError(null);
    try {
      // Prompt se namerno NE briše: sledeći korak je skoro uvek ista ideja sa
      // sitnom izmenom, a posao je već upisan i vidi se desno.
      await createJob({
        modelSlug: activeModel.slug,
        params: JSON.stringify(payload.params),
        inputMode: payload.inputMode,
        ...(Object.keys(payload.inputs).length > 0
          ? { inputs: JSON.stringify(payload.inputs) }
          : {}),
        ...(lessonId ? { lessonId } : {}),
        ...(lessonId && taskId ? { taskId } : {}),
      });
    } catch (thrown) {
      // Sirov kod greške se nikad ne prikazuje - `<GenerateButton>` ima rečenicu.
      setError(thrown instanceof Error ? thrown.message : String(thrown));
    } finally {
      setIsPending(false);
    }
  }

  const leftColumn = () => {
    if (state !== undefined && !state.enabled) {
      return (
        <Panel className="p-6">
          <h3 className="text-2xl font-black text-ink">{STUDIO_PAUSED.title[locale]}</h3>
          <p className="mt-2 text-base font-bold text-muted">{STUDIO_PAUSED.body[locale]}</p>
          <Link
            href={creditsHref}
            className={cn(PILL, "mt-4 border-ink bg-white text-ink shadow-[3px_3px_0_0_rgba(14,49,88,0.18)] hover:-translate-y-0.5")}
          >
            <Coins className="size-4" />
            {STUDIO_PAUSED.cta[locale]}
          </Link>
        </Panel>
      );
    }

    if (state !== undefined && !state.hasStudioAccess) {
      return (
        <Panel className="p-6">
          <h3 className="text-2xl font-black text-ink">{STUDIO_NOT_ENROLLED.title[locale]}</h3>
          <p className="mt-2 text-base font-bold text-muted">{STUDIO_NOT_ENROLLED.body[locale]}</p>
          <Link
            href={withLocale(locale, "/app/courses")}
            className={cn(PILL, "mt-4 border-ink bg-yellow text-ink shadow-[4px_4px_0_0_#0e3158] hover:-translate-y-0.5")}
          >
            {STUDIO_NOT_ENROLLED.cta[locale]}
          </Link>
        </Panel>
      );
    }

    return (
      <div className="space-y-6">
        <Panel className="p-6">
          <h3 className="text-2xl font-black text-ink">{locale === "sr" ? "Model" : "Model"}</h3>

          {models === undefined ? (
            <div className="mt-5 flex min-h-24 items-center justify-center">
              <Loader2 className="size-5 animate-spin text-muted" />
            </div>
          ) : catalog.length === 0 ? (
            <p className="surface-inset mt-5 border-2 border-ink bg-paper p-4 text-sm font-bold text-muted">
              {locale === "sr"
                ? "Nijedan model trenutno nije uključen. Javi se podršci."
                : "No model is enabled right now. Please contact support."}
            </p>
          ) : (
            <div className="mt-5">
              <ModelPicker
                models={catalog}
                selectedSlug={activeModel?.slug ?? null}
                onSelect={(model) => {
                  setSelectedSlug(model.slug);
                  setStarterPrompt(null);
                }}
                locale={locale}
              />
            </div>
          )}
        </Panel>

        {activeModel ? (
          <Panel className="p-6">
            <PlaygroundForm
              key={`${activeModel.slug}:${seed?.id ?? ""}:${starterPrompt ?? ""}`}
              model={activeModel}
              locale={locale}
              studioState={state}
              balance={balance?.balance}
              topUpHref={creditsHref}
              seed={
                starterPrompt !== null
                  ? { id: "starter", prompt: starterPrompt }
                  : seed && regenerated?.modelSlug === activeModel.slug
                    ? seed
                    : null
              }
              isPending={isPending}
              error={error}
              onGenerate={generate}
            />
          </Panel>
        ) : null}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {header}

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        {leftColumn()}

        <Panel className="p-6">
          <h3 className="text-2xl font-black text-ink">{locale === "sr" ? "Rezultat" : "Result"}</h3>

          {jobs.status === "LoadingFirstPage" ? (
            <div className="mt-5 flex min-h-48 items-center justify-center">
              <Loader2 className="size-5 animate-spin text-muted" />
            </div>
          ) : latest === undefined ? (
            <div className="surface-inset mt-5 border-2 border-ink bg-paper p-5">
              <p className="inline-flex items-center gap-2 text-base font-black text-ink">
                <Sparkles className="size-4" />
                {STUDIO_NO_GENERATIONS.title[locale]}
              </p>
              <p className="mt-2 text-base font-bold text-muted">{STUDIO_NO_GENERATIONS.body[locale]}</p>
              <button
                type="button"
                onClick={() => setStarterPrompt(FIRST_PROMPT[locale])}
                className={cn(PILL, "mt-4 border-ink bg-yellow text-ink shadow-[4px_4px_0_0_#0e3158] hover:-translate-y-0.5")}
              >
                <Wand2 className="size-4" />
                {STUDIO_NO_GENERATIONS.cta[locale]}
              </button>
              <p className="mt-2 text-sm font-bold text-muted">&bdquo;{FIRST_PROMPT[locale]}&ldquo;</p>
            </div>
          ) : (
            <div className="mt-5 space-y-6">
              <LatestJob job={latest} locale={locale} />

              {recent.length > 0 ? (
                <div>
                  <p className="text-sm font-black uppercase tracking-wide text-muted">
                    {locale === "sr" ? "Ranije generacije" : "Earlier generations"}
                  </p>
                  <div className="mt-3 grid grid-cols-3 gap-3">
                    {recent.map((job) => (
                      <div
                        key={job._id}
                        title={jobPrompt(job.params) || job.modelSlug}
                        className="surface-media relative aspect-square overflow-hidden border-2 border-ink bg-paper"
                      >
                        {job.outputUrl && job.kind === "image" ? (
                          <Image
                            src={job.outputUrl}
                            alt={jobPrompt(job.params) || job.modelSlug}
                            fill
                            unoptimized
                            sizes="(min-width: 1024px) 12vw, 30vw"
                            className="object-cover"
                          />
                        ) : job.outputUrl && job.kind === "video" ? (
                          <video
                            preload="metadata"
                            muted
                            playsInline
                            className="h-full w-full object-cover"
                            src={`${job.outputUrl}#t=0.1`}
                          />
                        ) : (
                          <div className="grid h-full place-items-center px-2 text-center">
                            <span className="text-xs font-black text-muted">
                              {job.outputUrl && job.kind === "audio"
                                ? locale === "sr"
                                  ? "zvuk"
                                  : "audio"
                                : TILE_LABELS[jobTileState(job)][locale]}
                            </span>
                          </div>
                        )}
                        {job.isMock ? (
                          <span className="absolute left-1 top-1 rounded-full border-2 border-ink bg-white px-1.5 text-[10px] font-black uppercase text-ink">
                            demo
                          </span>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

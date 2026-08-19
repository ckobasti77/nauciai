"use client";

import { useConvexAuth } from "@convex-dev/auth/react";
import { usePaginatedQuery, useMutation, useQuery } from "convex/react";
import { Coins, Download, Loader2, Sparkles, Wand2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

import { Panel, SectionHeader, cn } from "@/components/ui/primitives";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { withLocale, type Locale } from "@/lib/i18n";
import {
  buildJobParams,
  clampNumber,
  controlFields,
  generateButtonLabel,
  initialParamValues,
  jobCreditCost,
  jobPrompt,
  jobStatusText,
  jobTileState,
  parseParamSchema,
  promptField,
  RECENT_JOBS_COUNT,
  type ParamValues,
  type StudioField,
} from "@/lib/studio-form";
import { STUDIO_NOT_ENROLLED, STUDIO_NO_GENERATIONS, STUDIO_PAUSED, studioErrorMessage } from "@/lib/studio-messages";

type CatalogModel = {
  slug: string;
  kind: "image" | "video" | "audio";
  labelSr: string;
  labelEn: string;
  descriptionSr: string;
  descriptionEn: string;
  creditCost: number;
  paramSchema: string;
  badge?: "preporuceno" | "skupo" | "novo";
};

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

const BADGE_LABELS = {
  preporuceno: { sr: "preporučeno", en: "recommended" },
  skupo: { sr: "skupo", en: "expensive" },
  novo: { sr: "novo", en: "new" },
} as const;

/**
 * Vrste modela. Samo slike su uključene u katalogu (Faza A); video i zvuk se
 * ne sakrivaju nego stoje zasivljeni sa "Uskoro", da se vidi šta dolazi.
 */
const MODEL_KINDS = [
  { kind: "image", sr: "Slika", en: "Image", available: true },
  { kind: "video", sr: "Video", en: "Video", available: false },
  { kind: "audio", sr: "Zvuk", en: "Audio", available: false },
] as const;

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

function modelLabel(model: CatalogModel, locale: Locale) {
  return locale === "sr" ? model.labelSr : model.labelEn;
}

/**
 * Levi panel: forma iz `paramSchema` plus dugme. Ima svoje stanje parametara i
 * zato se remontira na promenu modela (`key={model.slug}` kod pozivaoca) -
 * podešavanja jednog modela ne smeju da procure u drugi, a prompt živi iznad
 * pa se pri promeni modela ne gubi.
 */
function GenerateForm({
  locale,
  model,
  prompt,
  onPromptChange,
  onSubmit,
  isPending,
  disabledReason,
  topUpHref,
}: {
  locale: Locale;
  model: CatalogModel;
  prompt: string;
  onPromptChange: (value: string) => void;
  onSubmit: (params: Record<string, unknown>) => void;
  isPending: boolean;
  disabledReason: "credits" | "active" | null;
  topUpHref: string;
}) {
  const fields = parseParamSchema(model.paramSchema);
  const [values, setValues] = useState<ParamValues>(() => initialParamValues(fields));
  const promptMeta = promptField(fields);
  const controls = controlFields(fields);
  const remaining = promptMeta.maxLength - prompt.length;
  // Isti objekat ide i u cenu i u `createJob`, pa dugme ne može da pokaže
  // jednu cifru a server da naplati drugu: `num_images` množi obe strane.
  const jobParams = buildJobParams(fields, values, prompt);
  const creditCost = jobCreditCost(model.creditCost, jobParams);

  function setValue(field: StudioField, raw: string) {
    setValues((current) => ({
      ...current,
      [field.key]:
        field.kind === "number" ? (raw === "" ? "" : clampNumber(Number(raw), field)) : raw,
    }));
  }

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="studio-prompt" className="text-sm font-black uppercase tracking-wide text-muted">
          {locale === "sr" ? "Prompt" : "Prompt"}
        </label>
        <textarea
          id="studio-prompt"
          value={prompt}
          maxLength={promptMeta.maxLength}
          onChange={(event) => onPromptChange(event.target.value)}
          rows={5}
          placeholder={
            locale === "sr"
              ? "Opiši sliku koju hoćeš - motiv, stil, svetlo, boje."
              : "Describe the image you want - subject, style, light, colours."
          }
          className="surface-inset mt-2 w-full border-2 border-ink bg-white px-4 py-3 text-base font-bold text-ink placeholder:font-bold placeholder:text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        />
        <p className={cn("mt-1 text-xs font-black", remaining < 100 ? "text-amber-900" : "text-muted")}>
          {prompt.length} / {promptMeta.maxLength}
        </p>
      </div>

      {controls.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {controls.map((field) => (
            <div key={field.key}>
              <label
                htmlFor={`studio-${field.key}`}
                className="text-sm font-black uppercase tracking-wide text-muted"
              >
                {field.label}
              </label>
              {field.kind === "select" ? (
                <select
                  id={`studio-${field.key}`}
                  value={String(values[field.key] ?? "")}
                  onChange={(event) => setValue(field, event.target.value)}
                  className="surface-inset mt-2 w-full border-2 border-ink bg-white px-4 py-2.5 text-base font-extrabold text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                >
                  {field.options.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              ) : field.kind === "number" ? (
                <input
                  id={`studio-${field.key}`}
                  type="number"
                  inputMode="numeric"
                  value={String(values[field.key] ?? "")}
                  min={field.min}
                  max={field.max}
                  onChange={(event) => setValue(field, event.target.value)}
                  className="surface-inset mt-2 w-full border-2 border-ink bg-white px-4 py-2.5 text-base font-extrabold text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                />
              ) : (
                <input
                  id={`studio-${field.key}`}
                  type="text"
                  value={String(values[field.key] ?? "")}
                  onChange={(event) => setValue(field, event.target.value)}
                  className="surface-inset mt-2 w-full border-2 border-ink bg-white px-4 py-2.5 text-base font-extrabold text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                />
              )}
              {field.kind === "number" && (field.min !== undefined || field.max !== undefined) ? (
                <p className="mt-1 text-xs font-bold text-muted">
                  {locale === "sr" ? "dozvoljeno" : "allowed"} {field.min ?? 1}–{field.max ?? "∞"}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {/* Cena je uvek na dugmetu i uvek iz kataloga (STUDIO-PLAN 2.5). Bez
          kredita dugme prestaje da bude dugme i postaje put do dopune. */}
      {disabledReason === "credits" ? (
        <div className="space-y-2">
          <Link
            href={topUpHref}
            className={cn(PILL, "w-full border-ink bg-yellow text-ink shadow-[4px_4px_0_0_#0e3158] hover:-translate-y-0.5")}
          >
            <Coins className="size-4" />
            {locale === "sr" ? "Dopuni kredite" : "Top up credits"}
          </Link>
          <p className="text-sm font-bold text-muted">
            {locale === "sr"
              ? `Ova generacija košta ${creditCost} kr, a toliko trenutno nemaš na nalogu.`
              : `This generation costs ${creditCost} credits, which is more than your balance.`}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <button
            type="button"
            disabled={isPending || disabledReason === "active" || prompt.trim().length === 0}
            onClick={() => onSubmit(jobParams)}
            className={cn(
              PILL,
              "w-full border-ink bg-ink text-white shadow-[4px_4px_0_0_#f4be30] hover:-translate-y-0.5",
            )}
          >
            {isPending ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
            {generateButtonLabel(creditCost, locale)}
          </button>
          {disabledReason === "active" ? (
            <p className="text-sm font-bold text-muted">
              {locale === "sr"
                ? "Sačekaj da se završi trenutna generacija."
                : "Wait for the current generation to finish."}
            </p>
          ) : prompt.trim().length === 0 ? (
            <p className="text-sm font-bold text-muted">
              {locale === "sr"
                ? "Napiši prompt da bi dugme proradilo."
                : "Write a prompt to enable the button."}
            </p>
          ) : null}
        </div>
      )}
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
        {job.outputUrl && job.kind === "image" ? (
          <Image
            src={job.outputUrl}
            alt={prompt || job.modelSlug}
            fill
            unoptimized
            sizes="(min-width: 1024px) 40vw, 100vw"
            className="object-cover"
          />
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
  const models = useQuery(api.modelCatalog.listModels, { kind: "image" });
  const jobs = usePaginatedQuery(api.studio.listMyJobs, isAuthenticated ? {} : "skip", {
    initialNumItems: RECENT_JOBS_COUNT + 1,
  });
  const createJob = useMutation(api.studio.createJob);

  // Galerija (P7) vodi ovde sa `?model=` i `?prompt=` na "Generiši ponovo" -
  // ako model iz linka nije (više) u uključenom katalogu, izbor pada na
  // podrazumevani model kao i inače (vidi `activeModel` niže). Lekcija (P9)
  // vodi ovde sa `?lessonId=` i `?taskId=` na dugme "Otvori u Studiju" - ta dva
  // idu direktno u `createJob` da bi izlaz upisao `labOutputs` i zazeleneo
  // zadatak, isto kao playground unutar same lekcije.
  const searchParams = useSearchParams();
  const [selectedSlug, setSelectedSlug] = useState<string | null>(() => searchParams.get("model"));
  const [prompt, setPrompt] = useState(() => searchParams.get("prompt") ?? "");
  const lessonId = searchParams.get("lessonId") as Id<"lessons"> | null;
  const taskId = searchParams.get("taskId") as Id<"lessonTasks"> | null;
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const creditsHref = withLocale(locale, "/app/credits");

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

  const imageModels = (models ?? []) as CatalogModel[];
  const recommended = imageModels.find((model) => model.badge === "preporuceno");
  const activeModel =
    imageModels.find((model) => model.slug === selectedSlug) ?? recommended ?? imageModels[0];

  const jobRows = jobs.results as unknown as StudioJob[];
  const latest = jobRows[0];
  const recent = jobRows.slice(1, RECENT_JOBS_COUNT + 1);

  const currentBalance = balance?.balance ?? 0;
  const atJobLimit = state !== undefined && state.activeJobs >= state.maxActiveJobs;
  const shortOnCredits =
    balance !== undefined && activeModel !== undefined && currentBalance < activeModel.creditCost;

  async function generate(params: Record<string, unknown>) {
    if (!activeModel) return;
    setIsPending(true);
    setError(null);
    try {
      // Prompt se namerno NE briše: sledeći korak je skoro uvek ista ideja sa
      // sitnom izmenom, a posao je već upisan i vidi se desno.
      await createJob({
        modelSlug: activeModel.slug,
        params: JSON.stringify(params),
        ...(lessonId ? { lessonId } : {}),
        ...(lessonId && taskId ? { taskId } : {}),
      });
    } catch (thrown) {
      // Sirov kod greške se nikad ne prikazuje - svaki ima svoju rečenicu.
      setError(studioErrorMessage(thrown instanceof Error ? thrown.message : String(thrown), locale));
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

    if (state !== undefined && !state.isEnrolled) {
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

          {/* Video i zvuk stižu u Fazi B i C. Ne sakrivaju se - stoje ugašeni
              sa "Uskoro", da se vidi da Studio nije samo slike. */}
          <div className="mt-4 flex flex-wrap gap-2">
            {MODEL_KINDS.map((entry) => (
              <span
                key={entry.kind}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full border-2 border-ink px-4 py-1.5 text-sm font-black",
                  entry.available ? "bg-ink text-white" : "bg-paper text-muted opacity-60",
                )}
              >
                {locale === "sr" ? entry.sr : entry.en}
                {entry.available ? null : (
                  <span className="text-xs font-black uppercase">
                    {locale === "sr" ? "Uskoro" : "Soon"}
                  </span>
                )}
              </span>
            ))}
          </div>

          {models === undefined ? (
            <div className="mt-5 flex min-h-24 items-center justify-center">
              <Loader2 className="size-5 animate-spin text-muted" />
            </div>
          ) : imageModels.length === 0 ? (
            <p className="surface-inset mt-5 border-2 border-ink bg-paper p-4 text-sm font-bold text-muted">
              {locale === "sr"
                ? "Nijedan model trenutno nije uključen. Javi se podršci."
                : "No model is enabled right now. Please contact support."}
            </p>
          ) : (
            <div className="mt-5 grid gap-3">
              {imageModels.map((model) => {
                const isActive = activeModel?.slug === model.slug;
                return (
                  <button
                    key={model.slug}
                    type="button"
                    onClick={() => setSelectedSlug(model.slug)}
                    aria-pressed={isActive}
                    className={cn(
                      "surface-inset flex w-full flex-col gap-1 border-2 border-ink p-4 text-left transition duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
                      isActive
                        ? "bg-yellow shadow-[4px_4px_0_0_#0e3158]"
                        : "bg-paper hover:-translate-y-0.5",
                    )}
                  >
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-base font-black text-ink">{modelLabel(model, locale)}</span>
                      {model.badge ? (
                        <span className="rounded-full border-2 border-ink bg-white px-2.5 py-0.5 text-xs font-black text-ink">
                          {BADGE_LABELS[model.badge][locale]}
                        </span>
                      ) : null}
                      <span className="ml-auto rounded-full border-2 border-ink bg-ink px-3 py-0.5 text-xs font-black text-white">
                        {model.creditCost} {locale === "sr" ? "kr" : "cr"}
                      </span>
                    </span>
                    <span className="text-sm font-bold text-muted">
                      {locale === "sr" ? model.descriptionSr : model.descriptionEn}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </Panel>

        {activeModel ? (
          <Panel className="p-6">
            <GenerateForm
              key={activeModel.slug}
              locale={locale}
              model={activeModel}
              prompt={prompt}
              onPromptChange={setPrompt}
              onSubmit={generate}
              isPending={isPending}
              disabledReason={shortOnCredits ? "credits" : atJobLimit ? "active" : null}
              topUpHref={creditsHref}
            />
            {error ? <p className="mt-3 text-sm font-black text-red-700">{error}</p> : null}
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
                onClick={() => setPrompt(FIRST_PROMPT[locale])}
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
                        ) : (
                          <div className="grid h-full place-items-center px-2 text-center">
                            <span className="text-xs font-black text-muted">
                              {TILE_LABELS[jobTileState(job)][locale]}
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

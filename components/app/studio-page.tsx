"use client";

import { useConvexAuth } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import { Coins, Loader2 } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";

import { StudioMediaDetail } from "@/components/app/studio-media-detail";
import { StudioMediaGrid } from "@/components/app/studio-media-grid";
import type { StudioTileJob } from "@/components/app/studio-media-tile";
import { StudioComposer, type JobPayload, type RegenerateSeed } from "@/components/studio/studio-composer";
import { Panel, SectionHeader, cn } from "@/components/ui/primitives";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { withLocale, type Locale } from "@/lib/i18n";
import { jobPrompt } from "@/lib/studio-form";
import { parseStudioModel, type StudioModel, type StudioModelRow } from "@/lib/studio-models";
import {
  PRIVACY_POLICY_PATH,
  STUDIO_NOT_ENROLLED,
  STUDIO_PAUSED,
  STUDIO_TERMS_GATE,
  STUDIO_TERMS_PATH,
} from "@/lib/studio-messages";
import type { StudioSectionKind } from "@/lib/studio-sections";
import type { SlotFiles } from "@/lib/studio-slots";
import type { ParamValues } from "@/lib/studio-params";

const PILL =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border-2 px-5 py-2.5 text-sm font-extrabold transition duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-not-allowed disabled:opacity-60";

/**
 * Kapija pred prvom generacijom: jedna kvačica i jedno dugme.
 */
function StudioTermsGate({ locale }: { locale: Locale }) {
  const acceptTerms = useMutation(api.studio.acceptStudioTerms);
  const [checked, setChecked] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  async function accept() {
    setIsSaving(true);
    setFailed(false);
    try {
      await acceptTerms({});
    } catch {
      setFailed(true);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Panel className="p-6">
      <h3 className="text-2xl font-black text-ink">{STUDIO_TERMS_GATE.title[locale]}</h3>
      <p className="mt-2 text-base font-bold text-muted">{STUDIO_TERMS_GATE.body[locale]}</p>

      <div className="surface-inset mt-5 flex gap-3 border-2 border-ink bg-paper p-4">
        <input
          id="studio-terms-accept"
          type="checkbox"
          checked={checked}
          onChange={(event) => setChecked(event.target.checked)}
          className="mt-1 size-5 shrink-0 accent-ink"
        />
        <label htmlFor="studio-terms-accept" className="text-sm font-bold leading-6 text-ink">
          {STUDIO_TERMS_GATE.checkbox[locale]}
        </label>
      </div>

      <div className="mt-4 flex flex-wrap gap-4 text-sm font-extrabold">
        <Link href={withLocale(locale, STUDIO_TERMS_PATH)} className="text-ink underline">
          {locale === "sr" ? "Uslovi korišćenja Studija" : "Studio terms of use"}
        </Link>
        <Link href={withLocale(locale, PRIVACY_POLICY_PATH)} className="text-ink underline">
          {locale === "sr" ? "Politika privatnosti" : "Privacy policy"}
        </Link>
      </div>

      <button
        type="button"
        onClick={accept}
        disabled={!checked || isSaving}
        className={cn(PILL, "mt-5 border-ink bg-yellow text-ink shadow-[4px_4px_0_0_#0e3158] hover:-translate-y-0.5")}
      >
        {isSaving ? <Loader2 className="size-4 animate-spin" /> : null}
        {STUDIO_TERMS_GATE.cta[locale]}
      </button>

      {failed ? (
        <p className="mt-3 text-sm font-bold text-muted">{STUDIO_TERMS_GATE.failed[locale]}</p>
      ) : null}
    </Panel>
  );
}

export function StudioPage({
  locale,
  initialJobId,
}: {
  locale: Locale;
  initialJobId?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const state = useQuery(api.studio.getStudioState, isAuthenticated ? {} : "skip");
  const balance = useQuery(api.credits.getBalance, isAuthenticated ? {} : "skip");
  const models = useQuery(api.studioModels.listModels, isAuthenticated ? {} : "skip");
  const createJob = useMutation(api.studio.createJob);

  const searchParams = useSearchParams();
  const regenerateId = searchParams.get("regenerate");
  const regenerated = useQuery(
    api.studio.getJobForRegenerate,
    regenerateId && isAuthenticated ? { jobId: regenerateId as Id<"generationJobs"> } : "skip",
  );
  const lessonId = searchParams.get("lessonId") as Id<"lessons"> | null;
  const taskId = searchParams.get("taskId") as Id<"lessonTasks"> | null;

  // Detalj medija i navigacija (sinhronizovano preko Next.js App Router-a)
  const routeDetailMatch = pathname.match(/\/app\/studio\/m\/([^/]+)/);
  const activeJobId = routeDetailMatch ? routeDetailMatch[1] : (initialJobId ?? null);
  const [loadedJobs, setLoadedJobs] = useState<StudioTileJob[]>([]);

  // Taksonomija biblioteke iz URL query parametra (?kind=)
  const kindParam = searchParams.get("kind");
  const activeKind: StudioSectionKind | null =
    kindParam === "image" || kindParam === "video" || kindParam === "audio"
      ? (kindParam as StudioSectionKind)
      : null;

  const [selectedSlug, setSelectedSlug] = useState<string | null>(() => searchParams.get("model"));
  const [starterPrompt, setStarterPrompt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const creditsHref = withLocale(locale, "/app/credits");

  // Dinamičko merenje stvarne visine lebdećeg composera/panela preko ResizeObserver-a (popravka 1.2)
  const floatingContainerRef = useRef<HTMLDivElement | null>(null);
  const [floatingHeight, setFloatingHeight] = useState<number>(140);

  useEffect(() => {
    const el = floatingContainerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const height = entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height;
        if (height > 0) {
          setFloatingHeight(height);
        }
      }
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Redovi se parsiraju jednom po promeni `models` liste
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
      ...(regenerated.missingSlots.length > 0 ? { missingSlots: regenerated.missingSlots } : {}),
    };
  }, [regenerateId, regenerated]);

  const recommended = catalog.find((model) => model.badge === "preporuceno");
  const activeModel =
    catalog.find((model) => model.slug === selectedSlug) ??
    (regenerated ? catalog.find((model) => model.slug === regenerated.modelSlug) : undefined) ??
    recommended ??
    catalog[0];

  const singleJobQuery = useQuery(
    api.studio.getJobForRegenerate,
    activeJobId && !loadedJobs.some((j) => j._id === activeJobId) && isAuthenticated
      ? { jobId: activeJobId as Id<"generationJobs"> }
      : "skip",
  );

  const activeJob: StudioTileJob | null = useMemo(() => {
    if (!activeJobId) return null;
    const found = loadedJobs.find((j) => j._id === activeJobId);
    if (found) return found;
    if (singleJobQuery) {
      const firstInput = singleJobQuery.inputs?.[0];
      return {
        _id: activeJobId,
        modelSlug: singleJobQuery.modelSlug,
        kind: catalog.find((m) => m.slug === singleJobQuery.modelSlug)?.kind ?? "image",
        status: "completed",
        creditCost: 0,
        params: singleJobQuery.params,
        outputUrl: firstInput?.url ?? null,
        isMock: false,
        createdAt: 0,
        ...(singleJobQuery.inputMode ? { inputMode: singleJobQuery.inputMode } : {}),
      };
    }
    return null;
  }, [activeJobId, loadedJobs, singleJobQuery, catalog]);

  function handleOpenDetail(job: StudioTileJob) {
    router.push(withLocale(locale, `/app/studio/m/${job._id}`), { scroll: false });
  }

  function handleCloseDetail() {
    const prevId = activeJobId;
    const target = kindParam ? `/app/studio?kind=${kindParam}` : `/app/studio`;
    router.push(withLocale(locale, target), { scroll: false });
    setTimeout(() => {
      if (prevId) {
        document.getElementById(`tile-${prevId}`)?.focus();
      }
    }, 60);
  }

  function handleSelectDetailJob(nextJob: StudioTileJob) {
    router.replace(withLocale(locale, `/app/studio/m/${nextJob._id}`), { scroll: false });
  }

  function handleKindChange(nextKind: StudioSectionKind | null) {
    if (nextKind) {
      router.push(withLocale(locale, `/app/studio?kind=${nextKind}`), { scroll: false });
    } else {
      router.push(withLocale(locale, "/app/studio"), { scroll: false });
    }
  }

  async function generate(payload: JobPayload) {
    if (!activeModel) return;
    setIsPending(true);
    setError(null);
    try {
      await createJob({
        modelSlug: activeModel.slug,
        params: JSON.stringify(payload.params),
        inputMode: payload.inputMode,
        ...(Object.keys(payload.inputs).length > 0
          ? { inputs: JSON.stringify(payload.inputs) }
          : {}),
        ...(payload.sourceJobId ? { sourceJobId: payload.sourceJobId } : {}),
        ...(lessonId ? { lessonId } : {}),
        ...(lessonId && taskId ? { taskId } : {}),
      });
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : String(thrown));
    } finally {
      setIsPending(false);
    }
  }

  function handleReuse(job: StudioTileJob) {
    setSelectedSlug(job.modelSlug);
    const p = jobPrompt(job.params);
    if (p) setStarterPrompt(p);
  }

  function handleExtend(job: StudioTileJob) {
    setSelectedSlug(job.modelSlug);
    const p = jobPrompt(job.params);
    if (p) setStarterPrompt(p);
  }

  function handleUseStarterPrompt(prompt: string) {
    setStarterPrompt(prompt);
  }

  function handleResetKind() {
    router.push(withLocale(locale, "/app/studio"));
  }

  const topbar = (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <SectionHeader
        title={locale === "sr" ? "Studio" : "Studio"}
        body={
          locale === "sr"
            ? "Opiši šta hoćeš, izaberi model i generiši. Svaka generacija se plaća kreditima."
            : "Describe what you want, pick a model and generate. Every generation is paid in credits."
        }
      />
      <div className="flex items-center gap-3">
        {/* Placeholder za projekte */}
        <span
          title={locale === "sr" ? "Projekti nisu u obimu — mesto rezervisano" : "Projects out of scope — reserved slot"}
          className="hidden sm:inline-flex items-center gap-1.5 rounded-full border-2 border-dashed border-line px-3 py-1.5 text-xs font-extrabold text-muted"
        >
          {locale === "sr" ? "Bez projekta" : "No project"}
        </span>

        {/* Balans je uvek vidljiv i uvek vodi na dopunu */}
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
    </div>
  );

  if (authLoading) {
    return (
      <div className="space-y-6">
        {topbar}
        <Panel className="flex min-h-32 items-center justify-center p-6">
          <Loader2 className="size-5 animate-spin text-muted" />
        </Panel>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="space-y-6">
        {topbar}
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

  const floatingContent = () => {
    if (state !== undefined && !state.enabled) {
      return (
        <div className="surface-card border-2 border-ink bg-white p-5 shadow-[6px_6px_0_0_rgba(14,49,88,0.16)]">
          <h3 className="text-xl font-black text-ink">{STUDIO_PAUSED.title[locale]}</h3>
          <p className="mt-1 text-sm font-bold text-muted">{STUDIO_PAUSED.body[locale]}</p>
          <Link
            href={creditsHref}
            className={cn(PILL, "mt-3 border-ink bg-white text-ink shadow-[3px_3px_0_0_rgba(14,49,88,0.18)] hover:-translate-y-0.5")}
          >
            <Coins className="size-4" />
            {STUDIO_PAUSED.cta[locale]}
          </Link>
        </div>
      );
    }

    if (state !== undefined && !state.hasStudioAccess) {
      return (
        <div className="surface-card border-2 border-ink bg-white p-5 shadow-[6px_6px_0_0_rgba(14,49,88,0.16)]">
          <h3 className="text-xl font-black text-ink">{STUDIO_NOT_ENROLLED.title[locale]}</h3>
          <p className="mt-1 text-sm font-bold text-muted">{STUDIO_NOT_ENROLLED.body[locale]}</p>
        </div>
      );
    }

    if (state !== undefined && !state.hasAcceptedTerms) {
      return <StudioTermsGate locale={locale} />;
    }

    if (models === undefined) {
      return (
        <div className="surface-card flex min-h-24 items-center justify-center border-2 border-ink bg-white p-4 shadow-[6px_6px_0_0_rgba(14,49,88,0.16)]">
          <Loader2 className="size-5 animate-spin text-muted" />
        </div>
      );
    }

    if (catalog.length === 0) {
      return (
        <p className="surface-card border-2 border-ink bg-paper p-4 text-sm font-bold text-muted shadow-[6px_6px_0_0_rgba(14,49,88,0.16)]">
          {locale === "sr"
            ? "Nijedan model trenutno nije uključen. Javi se podršci."
            : "No model is enabled right now. Please contact support."}
        </p>
      );
    }

    if (!activeModel) return null;

    return (
      <StudioComposer
        models={catalog}
        activeModel={activeModel}
        onSelectModel={(model) => {
          setSelectedSlug(model.slug);
          setStarterPrompt(null);
        }}
        locale={locale}
        studioState={state}
        balance={balance?.balance}
        topUpHref={creditsHref}
        seed={seed && regenerated?.modelSlug === activeModel.slug ? seed : null}
        starterPrompt={starterPrompt}
        isPending={isPending}
        error={error}
        variant="create"
        onGenerate={generate}
      />
    );
  };

  return (
    <div className="relative -mx-4 -mt-5 min-h-[calc(100vh-5rem)] bg-studio-canvas px-4 pt-4 text-ink sm:-mx-6 sm:px-6 md:-mx-8 md:-mt-8 md:px-8 md:pt-6">
      <div className="space-y-6">
        {topbar}

        {/* Mreža generisanih medija sa dinamičkim donjim paddingom prema izmerenoj visini composera */}
        <div style={{ paddingBottom: `${floatingHeight + 28}px` }}>
          <StudioMediaGrid
            locale={locale}
            kind={activeKind}
            catalog={catalog}
            onKindChange={handleKindChange}
            onReuse={handleReuse}
            onExtend={handleExtend}
            onOpenDetail={handleOpenDetail}
            onLoadedJobsChange={setLoadedJobs}
            onUseStarterPrompt={handleUseStarterPrompt}
            onResetKind={handleResetKind}
          />
        </div>
      </div>

      {/* Lebdeći kontejner composera (usidren dole po sredini, iznad mreže) */}
      <div
        ref={floatingContainerRef}
        className="pointer-events-none fixed bottom-4 left-0 right-0 z-30 flex justify-center px-4"
      >
        <div className="pointer-events-auto w-full max-w-[720px]">
          {floatingContent()}
        </div>
      </div>

      {/* Puni detalj medija / editor */}
      <AnimatePresence>
        {activeJobId && activeJob ? (
          <StudioMediaDetail
            key={activeJob._id}
            job={activeJob}
            jobs={loadedJobs}
            catalog={catalog}
            activeModel={activeModel}
            onSelectModel={(model) => {
              setSelectedSlug(model.slug);
              setStarterPrompt(null);
            }}
            locale={locale}
            studioState={state}
            balance={balance?.balance}
            topUpHref={creditsHref}
            onClose={handleCloseDetail}
            onSelectJob={handleSelectDetailJob}
            onGenerate={generate}
            isPending={isPending}
            error={error}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePaginatedQuery, useMutation, useQuery } from "convex/react";
import Image from "next/image";
import { Eye, Loader2, Play, Search, Volume2, X } from "lucide-react";

import { cn } from "@/components/ui/primitives";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { Locale } from "@/lib/i18n";
import { isExpiredOutput, jobPrompt, jobStatusText } from "@/lib/studio-form";
import {
  filterJobOwners,
  jobParamSummary,
  JOB_STATUS_LABELS,
  JOB_STATUSES,
  type JobStatus,
  REVEAL_AUDIT_NOTE,
  REVEAL_DETAILS,
  REVEAL_FAILED,
  STUDIO_PROVIDER_LABELS,
  STUDIO_PROVIDERS,
  type StudioProvider,
} from "@/lib/studio-gallery";
import { distributeGridColumns, useGridColumnCount } from "@/lib/studio-grid";
import { modelLabel, type StudioModel } from "@/lib/studio-models";

const PAGE_SIZE = 12;

const CHIP =
  "inline-flex min-h-8 items-center gap-1 rounded-full border-2 border-ink px-3 py-1 text-xs font-black studio-anim-mikro focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink cursor-pointer disabled:cursor-not-allowed disabled:opacity-50";

type InputThumbs = { items: Array<{ slot: string; storageId: string; url: string | null }>; total: number };

/** Red staff galerije, onako kako `listAllJobs` vraća (admin dobija i `params`/`inputThumbs`). */
type StaffJob = {
  _id: Id<"generationJobs">;
  modelSlug: string;
  kind: "image" | "video" | "audio";
  status: string;
  creditCost: number;
  outputUrl: string | null;
  inputMode: string;
  error?: string;
  isMock: boolean;
  expiresAt?: number;
  createdAt: number;
  ownerEmail: string;
  provider: string;
};

/**
 * Moderatorski pregled "Svi korisnici" (nalaz N1 / H3), vraćen u jeziku mreže:
 * tamni bunar (Rešenje A), čipovi identiteta, vlasnik i status. Uloga stoji na
 * SERVERU (`listAllJobs`, `revealJobDetail`) - ovaj sloj je prikaz. "Prikaži
 * detalje" postoji SAMO adminu i ide kroz `revealJobDetail`, koja upisuje audit
 * red; moderator dobija moderacijski podskup bez prompta i bez ulaznih sličica.
 */
export function StudioModerationGrid({
  locale,
  isStudioAdmin,
  catalog = [],
}: {
  locale: Locale;
  isStudioAdmin: boolean;
  catalog?: StudioModel[];
}) {
  const [ownerId, setOwnerId] = useState<Id<"users"> | null>(null);
  const [ownerSearch, setOwnerSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<JobStatus | null>(null);
  const [providerFilter, setProviderFilter] = useState<StudioProvider | null>(null);

  const queryArgs = useMemo(
    () => ({
      ...(ownerId ? { userId: ownerId } : {}),
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(providerFilter ? { provider: providerFilter } : {}),
    }),
    [ownerId, statusFilter, providerFilter],
  );

  const jobs = usePaginatedQuery(api.studio.listAllJobs, queryArgs, { initialNumItems: PAGE_SIZE });
  const owners = useQuery(api.studio.listJobOwners, {});
  const revealJobDetail = useMutation(api.studio.revealJobDetail);

  const { status: jobStatus, results, loadMore } = jobs;
  const rawJobs = results as unknown as StaffJob[];
  const resultsCount = rawJobs.length;

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const isLoadingRef = useRef(false);

  // Provajder se filtrira posle `paginate`, pa prva stranica ume da vrati 0 uz
  // `CanLoadMore` - klijent nastavlja dovlačenje dok ne popuni ekran ili iscrpi bazu.
  useEffect(() => {
    if (jobStatus === "CanLoadMore" && resultsCount < PAGE_SIZE && !isLoadingRef.current) {
      isLoadingRef.current = true;
      loadMore(PAGE_SIZE);
    }
  }, [jobStatus, resultsCount, loadMore]);

  useEffect(() => {
    if (jobStatus !== "LoadingMore") isLoadingRef.current = false;
  }, [jobStatus]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || jobStatus !== "CanLoadMore") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && jobStatus === "CanLoadMore" && !isLoadingRef.current) {
          isLoadingRef.current = true;
          loadMore(PAGE_SIZE);
        }
      },
      { rootMargin: "300px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [jobStatus, loadMore]);

  const columnCount = useGridColumnCount();
  const columns = useMemo(() => distributeGridColumns(rawJobs, columnCount), [rawJobs, columnCount]);

  const modelLabelBySlug = useMemo(() => {
    const map = new Map<string, string>();
    for (const model of catalog) map.set(model.slug, modelLabel(model, locale));
    return map;
  }, [catalog, locale]);

  const visibleOwners = useMemo(() => filterJobOwners(owners ?? [], ownerSearch), [owners, ownerSearch]);
  const filtersActive = ownerId !== null || statusFilter !== null || providerFilter !== null;
  const isLoadingFirst =
    jobStatus === "LoadingFirstPage" || (rawJobs.length === 0 && jobStatus === "LoadingMore");

  return (
    <div className="space-y-4">
      {/* ── Filter bar (osoblje) ─────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 rounded-2xl border-2 border-ink bg-white p-3 shadow-[3px_3px_0_0_rgba(14,49,88,0.12)]">
        <div className="flex flex-wrap items-center gap-2">
          {/* Filter po vlasniku */}
          {owners && owners.length > 0 ? (
            <div className="flex items-center gap-1.5">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted" />
                <input
                  type="text"
                  value={ownerSearch}
                  onChange={(e) => setOwnerSearch(e.target.value)}
                  placeholder={locale === "sr" ? "Traži vlasnika…" : "Search owner…"}
                  className="surface-inset h-8 w-[150px] border-2 border-ink bg-paper pl-7 pr-2 text-xs font-bold text-ink outline-none placeholder:text-muted focus:bg-white focus:ring-2 focus:ring-yellow/30"
                />
              </div>
              <select
                value={ownerId ?? ""}
                onChange={(e) => setOwnerId(e.target.value === "" ? null : (e.target.value as Id<"users">))}
                aria-label={locale === "sr" ? "Filter po vlasniku" : "Filter by owner"}
                className="surface-inset h-8 max-w-[180px] border-2 border-ink bg-white px-2 text-xs font-black text-ink outline-none cursor-pointer hover:bg-paper"
              >
                <option value="">{locale === "sr" ? "Svi vlasnici" : "All owners"}</option>
                {visibleOwners.map((owner) => (
                  <option key={owner.userId} value={owner.userId}>
                    {owner.label} ({owner.jobCount})
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <span className="hidden h-5 w-px bg-ink/15 sm:inline-block" aria-hidden="true" />

          {/* Filter statusa */}
          <div className="flex flex-wrap items-center gap-1">
            {JOB_STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter((prev) => (prev === s ? null : s))}
                aria-pressed={statusFilter === s}
                className={cn(CHIP, statusFilter === s ? "bg-ink text-white" : "bg-white text-ink hover:-translate-y-0.5")}
              >
                {JOB_STATUS_LABELS[s][locale]}
              </button>
            ))}
          </div>

          <span className="hidden h-5 w-px bg-ink/15 sm:inline-block" aria-hidden="true" />

          {/* Filter provajdera */}
          <div className="flex flex-wrap items-center gap-1">
            {STUDIO_PROVIDERS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setProviderFilter((prev) => (prev === p ? null : p))}
                aria-pressed={providerFilter === p}
                className={cn(CHIP, providerFilter === p ? "bg-ink text-white" : "bg-white text-ink hover:-translate-y-0.5")}
              >
                {STUDIO_PROVIDER_LABELS[p]}
              </button>
            ))}
          </div>

          {filtersActive ? (
            <button
              type="button"
              onClick={() => {
                setOwnerId(null);
                setStatusFilter(null);
                setProviderFilter(null);
              }}
              className="ml-auto inline-flex h-8 items-center gap-1 rounded-full border-2 border-dashed border-ink/40 px-2.5 text-xs font-black text-muted transition hover:border-ink hover:text-ink cursor-pointer"
            >
              <X className="size-3" />
              {locale === "sr" ? "Poništi filtere" : "Reset filters"}
            </button>
          ) : null}
        </div>
      </div>

      {/* ── Mreža ────────────────────────────────────────────────────────────── */}
      {isLoadingFirst ? (
        <div className="grid place-items-center py-16">
          <Loader2 className="size-6 animate-spin text-muted" />
        </div>
      ) : rawJobs.length === 0 ? (
        <div className="surface-card mx-auto max-w-md border-2 border-ink bg-white p-6 text-center shadow-[3px_3px_0_0_rgba(14,49,88,0.12)]">
          <p className="text-base font-bold text-muted">
            {locale === "sr" ? "Nema poslova za ove filtere." : "No jobs match these filters."}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-3">
            {columns.map((col, colIndex) => (
              <div key={colIndex} className="flex flex-col gap-4">
                {col.map((job) => (
                  <ModerationTile
                    key={job._id}
                    job={job}
                    locale={locale}
                    modelName={modelLabelBySlug.get(job.modelSlug) ?? job.modelSlug}
                    paramSpec={catalog.find((m) => m.slug === job.modelSlug)?.paramSpec}
                    onReveal={
                      isStudioAdmin
                        ? (jobId) => revealJobDetail({ jobId })
                        : undefined
                    }
                  />
                ))}
              </div>
            ))}
          </div>

          <div ref={sentinelRef} aria-hidden="true" className="h-4" />

          {jobStatus === "LoadingMore" ? (
            <div className="flex justify-center py-4">
              <span className="inline-flex items-center gap-2 rounded-full border-2 border-ink bg-white px-4 py-2 text-xs font-extrabold text-ink shadow-[2px_2px_0_0_rgba(14,49,88,0.14)]">
                <Loader2 className="size-4 animate-spin text-muted" />
                {locale === "sr" ? "Učitavanje još…" : "Loading more…"}
              </span>
            </div>
          ) : jobStatus === "CanLoadMore" ? (
            <div className="flex justify-center py-4">
              <button
                type="button"
                onClick={() => {
                  isLoadingRef.current = true;
                  loadMore(PAGE_SIZE);
                }}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border-2 border-ink bg-white px-5 py-2.5 text-sm font-extrabold text-ink shadow-[3px_3px_0_0_rgba(14,49,88,0.18)] transition hover:-translate-y-0.5 cursor-pointer"
              >
                {locale === "sr" ? "Učitaj još" : "Load more"}
              </button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

/** Jedna moderatorska kartica: tamni bunar + identitet + (admin) otkrivanje detalja. */
function ModerationTile({
  job,
  locale,
  modelName,
  paramSpec,
  onReveal,
}: {
  job: StaffJob;
  locale: Locale;
  modelName: string;
  paramSpec: StudioModel["paramSpec"] | undefined;
  onReveal?: (jobId: Id<"generationJobs">) => Promise<{ params: string; inputThumbs: InputThumbs }>;
}) {
  const [revealed, setRevealed] = useState<{ params: string; inputThumbs: InputThumbs } | null>(null);
  const [isRevealing, setIsRevealing] = useState(false);
  const [revealError, setRevealError] = useState<string | null>(null);

  const hasOutput = Boolean(job.outputUrl);
  const expired = isExpiredOutput(job);
  const isWorking = job.status === "reserved" || job.status === "running";
  const revealedPrompt = revealed ? jobPrompt(revealed.params) : "";
  const revealedSummary = revealed ? jobParamSummary(revealed.params, paramSpec, locale) : "";

  return (
    <div className="surface-card mb-4 break-inside-avoid border-2 border-ink bg-white p-2 text-ink shadow-[3px_3px_0_0_rgba(14,49,88,0.12)]">
      {/* Tamni bunar (Rešenje A) */}
      <div className="surface-media relative min-h-[160px] overflow-hidden bg-studio-well shadow-[inset_0_0_0_1px_rgba(14,49,88,0.14)]">
        {job.isMock ? (
          <span className="absolute right-2 top-2 z-10 rounded-full border-2 border-ink bg-white px-2 py-0.5 text-[10px] font-black uppercase text-ink">
            DEMO
          </span>
        ) : null}

        {hasOutput && !isWorking && !expired && job.kind === "image" ? (
          <div className="relative min-h-[160px] w-full">
            <Image
              src={job.outputUrl as string}
              alt={job.modelSlug}
              fill
              unoptimized
              sizes="(min-width: 1280px) 30vw, (min-width: 640px) 45vw, 90vw"
              className="object-cover"
            />
          </div>
        ) : hasOutput && !isWorking && !expired && job.kind === "video" ? (
          <div className="relative">
            <video
              preload="metadata"
              controls
              muted
              playsInline
              className="max-h-[420px] w-full object-contain"
              src={`${job.outputUrl}#t=0.1`}
            />
            <Play className="pointer-events-none absolute left-2 top-2 size-4 text-white/70" />
          </div>
        ) : hasOutput && !isWorking && !expired && job.kind === "audio" ? (
          <div className="grid min-h-[160px] place-items-center gap-2 p-4 text-white/80">
            <Volume2 className="size-6" />
            <audio controls src={job.outputUrl as string} className="w-full" />
          </div>
        ) : (
          <div className="grid min-h-[160px] place-items-center p-6 text-center">
            <p className="text-sm font-extrabold text-white/85">
              {expired ? (locale === "sr" ? "Fajl je istekao" : "File expired") : jobStatusText(job, locale)}
            </p>
          </div>
        )}
      </div>

      {/* Identitet */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="rounded-full border-2 border-ink bg-yellow px-2.5 py-0.5 text-[11px] font-black text-ink">{modelName}</span>
        <span className="rounded-full border-2 border-ink bg-paper px-2.5 py-0.5 text-[11px] font-black text-ink">
          {STUDIO_PROVIDER_LABELS[job.provider as StudioProvider] ?? job.provider}
        </span>
        <span className="rounded-full border-2 border-ink bg-white px-2.5 py-0.5 text-[11px] font-black text-ink">
          {JOB_STATUS_LABELS[job.status as JobStatus]?.[locale] ?? job.status}
        </span>
        <span className="rounded-full border-2 border-ink bg-white px-2.5 py-0.5 text-[11px] font-black text-ink">
          {job.creditCost} {locale === "sr" ? "kr" : "cr"}
        </span>
      </div>

      <p className="mt-1.5 truncate text-[11px] font-black text-ink" title={job.ownerEmail}>
        {job.ownerEmail || (locale === "sr" ? "(nepoznat vlasnik)" : "(unknown owner)")}
      </p>

      {/* Otkrivanje — samo admin; napomena stoji PRE klika (posle je red već upisan) */}
      {onReveal && revealed === null ? (
        <div className="mt-2">
          <button
            type="button"
            disabled={isRevealing}
            onClick={async () => {
              setIsRevealing(true);
              setRevealError(null);
              try {
                setRevealed(await onReveal(job._id));
              } catch {
                setRevealError(REVEAL_FAILED[locale]);
              } finally {
                setIsRevealing(false);
              }
            }}
            className={cn(CHIP, "border-ink bg-white text-ink hover:-translate-y-0.5")}
          >
            {isRevealing ? <Loader2 className="size-3.5 animate-spin" /> : <Eye className="size-3.5" />}
            {REVEAL_DETAILS[locale]}
          </button>
          <p className="mt-1 text-[10px] font-bold text-muted">{REVEAL_AUDIT_NOTE[locale]}</p>
          {revealError ? <p className="mt-1 text-[11px] font-black text-red-700">{revealError}</p> : null}
        </div>
      ) : null}

      {/* Otkriveni sadržaj (posle audita) */}
      {revealed ? (
        <div className="mt-2 space-y-1.5">
          {revealedPrompt ? <p className="line-clamp-3 text-xs font-bold text-ink">{revealedPrompt}</p> : null}
          {revealedSummary ? <p className="line-clamp-2 text-[11px] font-bold text-muted">{revealedSummary}</p> : null}
          {revealed.inputThumbs.items.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {revealed.inputThumbs.items.map((thumb) =>
                thumb.url ? (
                  <span key={thumb.storageId} className="surface-media relative size-12 overflow-hidden border-2 border-ink bg-studio-well">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={thumb.url} alt={thumb.slot} className="size-full object-cover" />
                  </span>
                ) : (
                  <span key={thumb.storageId} className="surface-media grid size-12 place-items-center border-2 border-dashed border-ink/40 text-[9px] font-black text-muted">
                    {locale === "sr" ? "nema" : "gone"}
                  </span>
                ),
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

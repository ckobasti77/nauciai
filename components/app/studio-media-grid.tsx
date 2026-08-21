"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePaginatedQuery } from "convex/react";
import { CheckSquare, Download, Loader2, Search, Sparkles, Wand2, X } from "lucide-react";

import { StudioMediaSkeletonTile, StudioMediaTile, type StudioTileJob } from "@/components/app/studio-media-tile";
import { api } from "@/convex/_generated/api";
import { cn } from "@/components/ui/primitives";
import type { Locale } from "@/lib/i18n";
import { jobPrompt } from "@/lib/studio-form";
import {
  DATE_RANGE_LABELS,
  DATE_RANGE_PRESETS,
  dateRangeCutoff,
  downloadMediaFiles,
  GALLERY_KIND_LABELS,
  GALLERY_KINDS,
  type DateRangePreset,
} from "@/lib/studio-gallery";
import { distributeGridColumns, useGridColumnCount } from "@/lib/studio-grid";
import { GALLERY_NO_MATCHES, STUDIO_NO_GENERATIONS } from "@/lib/studio-messages";
import { modelLabel, type StudioModel } from "@/lib/studio-models";
import type { StudioSectionKind } from "@/lib/studio-sections";

const PAGE_SIZE = 12;

const FIRST_PROMPT = {
  sr: "ilustracija starog Beograda u stilu akvarela, topla večernja svetlost, tekstura papira",
  en: "watercolour illustration of old Belgrade, warm evening light, paper texture",
};

const CHIP =
  "inline-flex min-h-8 items-center gap-1 rounded-full border-2 border-ink px-3 py-1 text-xs font-black studio-anim-mikro focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink cursor-pointer disabled:cursor-not-allowed disabled:opacity-50";

export function StudioMediaGrid({
  locale,
  kind,
  catalog = [],
  onKindChange,
  onReuse,
  onExtend,
  onOpenDetail,
  onLoadedJobsChange,
  onUseStarterPrompt,
  onResetKind,
}: {
  locale: Locale;
  kind: StudioSectionKind | null;
  catalog?: StudioModel[];
  onKindChange?: (nextKind: StudioSectionKind | null) => void;
  onReuse: (job: StudioTileJob) => void;
  onExtend: (job: StudioTileJob) => void;
  onOpenDetail: (job: StudioTileJob) => void;
  onLoadedJobsChange?: (jobs: StudioTileJob[]) => void;
  onUseStarterPrompt: (prompt: string) => void;
  onResetKind: () => void;
}) {
  // Prozor za zamrznut timestamp (Date.now() unutar state-a na mount-u)
  const [now] = useState(() => Date.now());

  // Filteri
  const [modelFilter, setModelFilter] = useState<string | null>(null);
  const [dateFilter, setDateFilter] = useState<DateRangePreset>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Višestruki izbor i grupno preuzimanje (C7 + C13)
  const [selectedJobs, setSelectedJobs] = useState<Map<string, StudioTileJob>>(new Map());
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<{ current: number; total: number } | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const queryArgs = useMemo(() => {
    return {
      ...(kind ? { kind } : {}),
      ...(modelFilter ? { modelSlug: modelFilter } : {}),
      ...(dateFilter !== "all" ? { createdAfter: dateRangeCutoff(dateFilter, now) } : {}),
    };
  }, [kind, modelFilter, dateFilter, now]);

  const jobs = usePaginatedQuery(api.studio.listMyJobs, queryArgs, {
    initialNumItems: PAGE_SIZE,
  });

  const { status: jobStatus, results: jobResults, loadMore } = jobs;
  const resultsCount = jobResults.length;

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const isLoadingRef = useRef(false);

  // Popravka defekta C2 + 1.3: `listMyJobs` primenjuje filter posle `paginate`.
  // Ako je prva stranica vratila < PAGE_SIZE redova jer su u tom segmentu baze poslovi druge
  // vrste/modela, a `status` je `CanLoadMore`, klijent automatski nastavlja dovlačenje.
  useEffect(() => {
    if (jobStatus === "CanLoadMore" && resultsCount < PAGE_SIZE && !isLoadingRef.current) {
      isLoadingRef.current = true;
      loadMore(PAGE_SIZE);
    }
  }, [jobStatus, resultsCount, loadMore]);

  useEffect(() => {
    if (jobStatus !== "LoadingMore") {
      isLoadingRef.current = false;
    }
  }, [jobStatus]);

  // Beskonačni skrol preko IntersectionObserver-a kada je korisnik blizu dna.
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
  const rawJobRows = jobResults as unknown as StudioTileJob[];

  // Klijentska pretraga po promptu / nazivu modela
  const filteredJobs = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase();
    if (!needle) return rawJobRows;
    return rawJobRows.filter((job) => {
      const prompt = jobPrompt(job.params).toLowerCase();
      const model = job.modelSlug.toLowerCase();
      return prompt.includes(needle) || model.includes(needle);
    });
  }, [rawJobRows, searchQuery]);

  const columns = useMemo(
    () => distributeGridColumns(filteredJobs, columnCount),
    [filteredJobs, columnCount],
  );

  useEffect(() => {
    onLoadedJobsChange?.(rawJobRows);
  }, [rawJobRows, onLoadedJobsChange]);

  const filtersActive =
    kind !== null || modelFilter !== null || dateFilter !== "all" || searchQuery.trim() !== "";

  function resetAllFilters() {
    onResetKind();
    setModelFilter(null);
    setDateFilter("all");
    setSearchQuery("");
  }

  // Preuzimljiv posao = ima izlaz i završen je. Status završenog je "done"
  // (schema), ne "completed" - stara provera je bila mrtva, pa "Izaberi sve
  // vidljive" nikad nije izlazio.
  function isJobDownloadable(job: StudioTileJob): boolean {
    return Boolean(job.outputUrl) && job.status === "done";
  }

  // Selekcija pojedinačnog tajla: u izbor ulazi SAMO preuzimljiv posao (brojač i
  // preuzimanje inače lažu). Uklanjanje je uvek dozvoljeno.
  function handleToggleSelect(job: StudioTileJob) {
    setSelectedJobs((prev) => {
      const next = new Map(prev);
      if (next.has(job._id)) {
        next.delete(job._id);
      } else if (isJobDownloadable(job)) {
        next.set(job._id, job);
      }
      return next;
    });
  }

  // Preuzimljivi poslovi sa ekrana koji odgovaraju trenutnom prikazu
  const visibleDownloadable = useMemo(() => filteredJobs.filter(isJobDownloadable), [filteredJobs]);

  function handleSelectAllVisible() {
    setSelectedJobs((prev) => {
      const next = new Map(prev);
      for (const job of visibleDownloadable) {
        next.set(job._id, job);
      }
      return next;
    });
  }

  function handleClearSelection() {
    setSelectedJobs(new Map());
    setDownloadError(null);
  }

  // Popravka C7: Sekvencijalno grupno preuzimanje sa napretkom i očuvanjem selekcije
  async function handleDownloadSelected() {
    if (selectedJobs.size === 0 || isDownloading) return;
    setIsDownloading(true);
    setDownloadError(null);
    setDownloadProgress({ current: 0, total: selectedJobs.size });

    const itemsToDownload = Array.from(selectedJobs.values());
    const result = await downloadMediaFiles(itemsToDownload, (current, total) => {
      setDownloadProgress({ current, total });
    });

    setIsDownloading(false);
    setDownloadProgress(null);

    if (result.failed.length > 0) {
      // Ako neki nisu prošli, ukloni samo one koji jesu a zadrži neuspele u selekciji
      setSelectedJobs((prev) => {
        const next = new Map(prev);
        for (const id of result.succeeded) {
          next.delete(id);
        }
        return next;
      });
      setDownloadError(
        locale === "sr"
          ? `Preuzimanje nije uspelo za ${result.failed.length} ${result.failed.length === 1 ? "fajl" : "fajla"}.`
          : `Download failed for ${result.failed.length} ${result.failed.length === 1 ? "file" : "files"}.`,
      );
    } else {
      // Svi uspešno preuzeti -> očisti selekciju
      setSelectedJobs(new Map());
    }
  }

  const isLoadingFirst =
    jobStatus === "LoadingFirstPage" ||
    (rawJobRows.length === 0 && (jobStatus === "CanLoadMore" || jobStatus === "LoadingMore"));

  return (
    <div className="space-y-4">
      {/* ── Gornja traka filtera mreže ────────────────────────────────────────── */}
      <div className="surface-card flex flex-col gap-3 border-2 border-ink bg-white p-3 shadow-[3px_3px_0_0_rgba(14,49,88,0.12)] sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          {/* Pretraga po promptu */}
          <div className="relative min-w-[180px] max-w-xs flex-1 sm:flex-none">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={locale === "sr" ? "Pretraži promptove…" : "Search prompts…"}
              className="surface-inset h-8 w-full border-2 border-ink bg-paper pl-8 pr-7 text-xs font-bold text-ink outline-none placeholder:text-muted focus:bg-white studio-focus-ink"
            />
            {searchQuery ? (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                aria-label={locale === "sr" ? "Obriši pretragu" : "Clear search"}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-ink cursor-pointer"
              >
                <X className="size-3.5" />
              </button>
            ) : null}
          </div>

          <span className="hidden h-5 w-px bg-ink/15 sm:inline-block" aria-hidden="true" />

          {/* Filter vrste (Kind) — uvezan sa sidebarom i routerom */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => (onKindChange ? onKindChange(null) : onResetKind())}
              aria-pressed={kind === null}
              className={cn(
                CHIP,
                kind === null ? "bg-ink text-white" : "bg-white text-ink hover:-translate-y-0.5",
              )}
            >
              {locale === "sr" ? "Sve vrste" : "All kinds"}
            </button>
            {GALLERY_KINDS.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => (onKindChange ? onKindChange(k) : null)}
                aria-pressed={kind === k}
                className={cn(
                  CHIP,
                  kind === k ? "bg-ink text-white" : "bg-white text-ink hover:-translate-y-0.5",
                )}
              >
                {GALLERY_KIND_LABELS[k][locale]}
              </button>
            ))}
          </div>

          <span className="hidden h-5 w-px bg-ink/15 sm:inline-block" aria-hidden="true" />

          {/* Filter modela */}
          {catalog.length > 0 ? (
            <select
              value={modelFilter ?? ""}
              onChange={(e) => setModelFilter(e.target.value === "" ? null : e.target.value)}
              aria-label={locale === "sr" ? "Filter po modelu" : "Filter by model"}
              className="surface-inset h-8 border-2 border-ink bg-white px-2.5 text-xs font-black text-ink outline-none cursor-pointer hover:bg-paper studio-focus-ink"
            >
              <option value="">{locale === "sr" ? "Svi modeli" : "All models"}</option>
              {catalog.map((model) => (
                <option key={model.slug} value={model.slug}>
                  {modelLabel(model, locale)}
                </option>
              ))}
            </select>
          ) : null}

          {/* Filter perioda */}
          <div className="flex flex-wrap items-center gap-1">
            {DATE_RANGE_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setDateFilter(preset)}
                aria-pressed={dateFilter === preset}
                className={cn(
                  CHIP,
                  dateFilter === preset ? "bg-ink text-white" : "bg-white text-ink hover:-translate-y-0.5",
                )}
              >
                {DATE_RANGE_LABELS[preset][locale]}
              </button>
            ))}
          </div>

          {/* Poništi sve filtere ako je neki aktivan */}
          {filtersActive ? (
            <button
              type="button"
              onClick={resetAllFilters}
              className="ml-auto inline-flex h-8 items-center gap-1 rounded-full border-2 border-dashed border-ink/40 px-2.5 text-xs font-black text-muted transition hover:border-ink hover:text-ink cursor-pointer"
            >
              <X className="size-3" />
              {locale === "sr" ? "Poništi filtere" : "Reset filters"}
            </button>
          ) : null}
        </div>

        {/* Dugme za uključivanje režima izbora */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsSelectMode((prev) => !prev)}
            aria-pressed={isSelectMode || selectedJobs.size > 0}
            className={cn(
              CHIP,
              isSelectMode || selectedJobs.size > 0
                ? "bg-yellow text-ink shadow-[2px_2px_0_0_#0e3158]"
                : "bg-white text-ink hover:-translate-y-0.5",
            )}
          >
            <CheckSquare className="size-3.5" />
            {isSelectMode || selectedJobs.size > 0
              ? locale === "sr"
                ? "Izbor aktivan"
                : "Select active"
              : locale === "sr"
                ? "Izaberi više"
                : "Select multiple"}
          </button>
        </div>
      </div>

      {/* ── Traka za grupne akcije (C7 + C13) ─────────────────────────────────── */}
      {selectedJobs.size > 0 ? (
        <div className="surface-card flex flex-wrap items-center justify-between gap-3 border-2 border-ink bg-paper p-3 shadow-[3px_3px_0_0_rgba(14,49,88,0.12)]">
          <div className="flex items-center gap-3">
            <span className="rounded-full border-2 border-ink bg-yellow px-3 py-1 text-xs font-black text-ink shadow-[2px_2px_0_0_#0e3158]">
              {locale === "sr" ? `Izabrano: ${selectedJobs.size}` : `Selected: ${selectedJobs.size}`}
            </span>
            {visibleDownloadable.length > 0 ? (
              <button
                type="button"
                onClick={handleSelectAllVisible}
                className="text-xs font-bold text-muted underline transition hover:text-ink cursor-pointer"
              >
                {locale === "sr"
                  ? `Izaberi sve vidljive (${visibleDownloadable.length})`
                  : `Select all visible (${visibleDownloadable.length})`}
              </button>
            ) : null}
            <button
              type="button"
              onClick={handleClearSelection}
              disabled={isDownloading}
              className="text-xs font-bold text-muted underline transition hover:text-ink cursor-pointer disabled:opacity-50"
            >
              {locale === "sr" ? "Očisti izbor" : "Clear selection"}
            </button>
          </div>

          <div className="flex items-center gap-3">
            {downloadError ? (
              <span className="text-xs font-extrabold text-red-700">{downloadError}</span>
            ) : null}
            <button
              type="button"
              onClick={handleDownloadSelected}
              disabled={isDownloading}
              className="inline-flex min-h-9 items-center justify-center gap-2 rounded-full border-2 border-ink bg-yellow px-4 py-1.5 text-xs font-black text-ink shadow-[3px_3px_0_0_#0e3158] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-70 cursor-pointer"
            >
              {isDownloading ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  {downloadProgress
                    ? `${locale === "sr" ? "Preuzimanje" : "Downloading"} (${downloadProgress.current}/${downloadProgress.total})…`
                    : locale === "sr"
                      ? "Preuzimanje…"
                      : "Downloading…"}
                </>
              ) : (
                <>
                  <Download className="size-3.5" />
                  {locale === "sr" ? "Preuzmi izabrano" : "Download selected"}
                </>
              )}
            </button>
          </div>
        </div>
      ) : null}

      {/* ── Stanja mreže: Učitavanje / Prazno / Rezultati ─────────────────────── */}
      {isLoadingFirst ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-3">
          {distributeGridColumns(Array.from({ length: 6 }, (_, i) => i), columnCount).map(
            (col, colIndex) => (
              <div key={colIndex} className="flex flex-col gap-4">
                {col.map((item) => (
                  <StudioMediaSkeletonTile key={item} />
                ))}
              </div>
            ),
          )}
        </div>
      ) : filteredJobs.length === 0 ? (
        <div className="surface-card mx-auto max-w-md border-2 border-ink bg-white p-6 text-center shadow-[3px_3px_0_0_rgba(14,49,88,0.12)]">
          {filtersActive ? (
            <>
              <p className="text-base font-bold text-muted">{GALLERY_NO_MATCHES.body[locale]}</p>
              <button
                type="button"
                onClick={resetAllFilters}
                className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-full border-2 border-ink bg-white px-5 py-2.5 text-sm font-extrabold text-ink shadow-[3px_3px_0_0_rgba(14,49,88,0.18)] transition hover:-translate-y-0.5 cursor-pointer"
              >
                {GALLERY_NO_MATCHES.cta[locale]}
              </button>
            </>
          ) : (
            <>
              <p className="inline-flex items-center gap-2 text-lg font-black text-ink">
                <Sparkles className="size-5 text-yellow" />
                {STUDIO_NO_GENERATIONS.title[locale]}
              </p>
              <p className="mt-2 text-sm font-bold text-muted">{STUDIO_NO_GENERATIONS.body[locale]}</p>
              <button
                type="button"
                onClick={() => onUseStarterPrompt(FIRST_PROMPT[locale])}
                className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-full border-2 border-ink bg-yellow px-5 py-2.5 text-sm font-extrabold text-ink shadow-[4px_4px_0_0_#0e3158] transition hover:-translate-y-0.5 cursor-pointer"
              >
                <Wand2 className="size-4" />
                {STUDIO_NO_GENERATIONS.cta[locale]}
              </button>
              <p className="mt-3 text-xs font-bold text-muted">&bdquo;{FIRST_PROMPT[locale]}&ldquo;</p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-3">
            {columns.map((col, colIndex) => (
              <div key={colIndex} className="flex flex-col gap-4">
                {col.map((job) => (
                  <StudioMediaTile
                    key={job._id}
                    job={job}
                    locale={locale}
                    onReuse={onReuse}
                    onExtend={onExtend}
                    onOpenDetail={onOpenDetail}
                    selected={selectedJobs.has(job._id)}
                    onToggleSelect={handleToggleSelect}
                    isSelectMode={isSelectMode || selectedJobs.size > 0}
                    animateEntrance={job.status === "reserved" || job.status === "running" || now - job.createdAt < 20_000}
                  />
                ))}
              </div>
            ))}
          </div>

          {/* Sentinel za beskonačni skrol */}
          <div ref={sentinelRef} aria-hidden="true" className="h-4" />

          {/* Indikator / dugme za još stranica */}
          {jobStatus === "LoadingMore" ? (
            <div className="flex justify-center py-4">
              <div className="inline-flex items-center gap-2 rounded-full border-2 border-ink bg-white px-4 py-2 text-xs font-extrabold text-ink shadow-[2px_2px_0_0_rgba(14,49,88,0.14)]">
                <Loader2 className="size-4 animate-spin text-muted" />
                {locale === "sr" ? "Učitavanje još medija…" : "Loading more media…"}
              </div>
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


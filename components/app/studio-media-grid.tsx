"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePaginatedQuery } from "convex/react";
import { Download, SlidersHorizontal, Sparkles, Wand2 } from "lucide-react";

import { StudioMediaSkeletonTile, StudioMediaTile, type StudioTileJob } from "@/components/app/studio-media-tile";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/convex/_generated/api";
import type { Locale } from "@/lib/i18n";
import { resetStudioFilters, setStudioFilters, useStudioFilters } from "@/lib/studio-filters-store";
import { jobPrompt } from "@/lib/studio-form";
import { dateRangeCutoff, downloadMediaFiles } from "@/lib/studio-gallery";
import { distributeGridColumns, useGridColumnCount } from "@/lib/studio-grid";
import { GALLERY_NO_MATCHES, PROJECT_NO_GENERATIONS, STUDIO_NO_GENERATIONS } from "@/lib/studio-messages";
import type { StudioModel } from "@/lib/studio-models";
import type { StudioSectionKind } from "@/lib/studio-sections";
import type { Id } from "@/convex/_generated/dataModel";

const PAGE_SIZE = 12;

const FIRST_PROMPT = {
  sr: "ilustracija starog Beograda u stilu akvarela, topla večernja svetlost, tekstura papira",
  en: "watercolour illustration of old Belgrade, warm evening light, paper texture",
};

export function StudioMediaGrid({
  locale,
  kind,
  projectId = null,
  catalog = [],
  onReuse,
  onExtend,
  onOpenDetail,
  onLoadedJobsChange,
  onUseStarterPrompt,
  onResetKind,
}: {
  locale: Locale;
  kind: StudioSectionKind | null;
  projectId?: Id<"studioProjects"> | null;
  catalog?: StudioModel[];
  onReuse: (job: StudioTileJob) => void;
  onExtend: (job: StudioTileJob) => void;
  onOpenDetail: (job: StudioTileJob) => void;
  onLoadedJobsChange?: (jobs: StudioTileJob[]) => void;
  onUseStarterPrompt: (prompt: string) => void;
  onResetKind: () => void;
}) {
  // Prozor za zamrznut timestamp (Date.now() unutar state-a na mount-u)
  const [now] = useState(() => Date.now());

  // Filteri (SP2): žive u deljenom store-u - prozor ih menja, sidebar-linija
  // broji, ovde se samo čitaju. Vrsta i dalje dolazi kroz `kind` (URL).
  const { modelSlug: modelFilter, range: dateFilter, query: searchQuery, selectMode: isSelectMode } = useStudioFilters();

  // Višestruki izbor i grupno preuzimanje (C7 + C13)
  const [selectedJobs, setSelectedJobs] = useState<Map<string, StudioTileJob>>(new Map());
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<{ current: number; total: number } | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const queryArgs = useMemo(() => {
    return {
      ...(kind ? { kind } : {}),
      ...(projectId ? { projectId } : {}),
      ...(modelFilter ? { modelSlug: modelFilter } : {}),
      ...(dateFilter !== "all" ? { createdAfter: dateRangeCutoff(dateFilter, now) } : {}),
    };
  }, [kind, projectId, modelFilter, dateFilter, now]);

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

  // SP1, tačka 9: kad se promeni vrsta, filter po modelu koji NE pripada novoj
  // vrsti bi vratio nula pogodaka i korisnik vidi prazno stanje kao da je izgubio
  // radove. Resetuj filter na „Svi modeli" umesto da ostane i vrati prazno.
  // Sinhronizacija tokom rendera (a ne u efektu) - isti obrazac kao u composeru,
  // tako da query nikad ne krene sa modelom van izabrane vrste.
  const [prevKind, setPrevKind] = useState(kind);
  if (kind !== prevKind) {
    setPrevKind(kind);
    if (modelFilter && kind) {
      const selected = catalog.find((model) => model.slug === modelFilter);
      if (selected && selected.kind !== kind) {
        setStudioFilters({ modelSlug: null });
      }
    }
  }

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

  const loadingMoreSkeletons = useMemo(
    () => distributeGridColumns(Array.from({ length: Math.min(Math.max(2, columnCount), 3) }, (_, i) => i), columnCount),
    [columnCount],
  );

  useEffect(() => {
    onLoadedJobsChange?.(rawJobRows);
  }, [rawJobRows, onLoadedJobsChange]);

  const filtersActive =
    kind !== null || modelFilter !== null || dateFilter !== "all" || searchQuery.trim() !== "";

  function resetAllFilters() {
    onResetKind();
    resetStudioFilters();
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
      {/* ── Traka za grupne akcije (C7 + C13) ─────────────────────────────────── */}
      {selectedJobs.size > 0 ? (
        <div className="surface-card flex flex-wrap items-center justify-between gap-3 border-2 border-ink bg-paper p-3 shadow-[3px_3px_0_0_var(--shadow-hard-12)]">
          <div className="flex items-center gap-3">
            <span className="rounded-full border-2 border-ink bg-yellow px-3 py-1 type-eyebrow text-ink shadow-[2px_2px_0_0_var(--ink)]">
              {locale === "sr" ? `Izabrano: ${selectedJobs.size}` : `Selected: ${selectedJobs.size}`}
            </span>
            {visibleDownloadable.length > 0 ? (
              <button
                type="button"
                onClick={handleSelectAllVisible}
                className="type-caption font-bold text-muted underline transition hover:text-ink cursor-pointer"
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
              className="type-caption font-bold text-muted underline transition hover:text-ink cursor-pointer disabled:opacity-50"
            >
              {locale === "sr" ? "Očisti izbor" : "Clear selection"}
            </button>
          </div>

          <div className="flex items-center gap-3">
            {downloadError ? (
              <span className="type-caption font-extrabold text-red-700">{downloadError}</span>
            ) : null}
            <button
              type="button"
              onClick={handleDownloadSelected}
              disabled={isDownloading}
              className="inline-flex min-h-9 items-center justify-center gap-2 rounded-full border-2 border-ink bg-yellow px-4 py-1.5 text-xs font-black text-ink shadow-[3px_3px_0_0_var(--ink)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-70 cursor-pointer"
            >
              {isDownloading ? (
                <>
                  <Spinner size="xs" />
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
        // Sva tri prazna stanja Studija idu kroz isti `EmptyState` primitiv kao
        // ostatak aplikacije (ikona u zutom krugu, naslov, recenica sa sledecim
        // korakom, jedno dugme). Ranije su bila tri rucno slozena bloka, a filter
        // bez pogodaka je jedini u proizvodu koji je gutao svoj naslov.
        <div className="mx-auto max-w-xl">
          {filtersActive ? (
            <EmptyState
              icon={SlidersHorizontal}
              title={GALLERY_NO_MATCHES.title[locale]}
              body={GALLERY_NO_MATCHES.body[locale]}
              action={
                <Button variant="secondary" onClick={resetAllFilters}>
                  {GALLERY_NO_MATCHES.cta[locale]}
                </Button>
              }
            />
          ) : projectId ? (
            <EmptyState
              icon={Sparkles}
              title={PROJECT_NO_GENERATIONS.title[locale]}
              body={PROJECT_NO_GENERATIONS.body[locale]}
              action={
                <Button icon={<Wand2 className="size-4" />} onClick={() => onUseStarterPrompt(FIRST_PROMPT[locale])}>
                  {PROJECT_NO_GENERATIONS.cta[locale]}
                </Button>
              }
            />
          ) : (
            <>
              <EmptyState
                icon={Sparkles}
                title={STUDIO_NO_GENERATIONS.title[locale]}
                body={STUDIO_NO_GENERATIONS.body[locale]}
                action={
                  <Button icon={<Wand2 className="size-4" />} onClick={() => onUseStarterPrompt(FIRST_PROMPT[locale])}>
                    {STUDIO_NO_GENERATIONS.cta[locale]}
                  </Button>
                }
              />
              {/* Primer opisa je namerno ISPOD praznog stanja i u navodnicima: to
                  je uzorak teksta koji dugme ubacuje, ne jos jedno uputstvo. */}
              <p className="mt-3 text-center type-caption font-bold text-muted">
                &bdquo;{FIRST_PROMPT[locale]}&ldquo;
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-3">
            {columns.map((col, colIndex) => (
              <div key={colIndex} className="flex flex-col gap-4">
                {col.map((job, itemIndex) => (
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
                    animateEntrance
                    index={itemIndex}
                  />
                ))}
                {jobStatus === "LoadingMore" &&
                  loadingMoreSkeletons[colIndex]?.map((skeletonIndex) => (
                    <StudioMediaSkeletonTile key={`loading-more-${skeletonIndex}`} />
                  ))}
              </div>
            ))}
          </div>

          {/* Sentinel za beskonačni skrol */}
          <div ref={sentinelRef} aria-hidden="true" className="h-4" />

          {/* Indikator / dugme za još stranica */}
          {jobStatus === "LoadingMore" ? (
            <div className="flex justify-center py-4">
              <div className="inline-flex items-center gap-2 rounded-full border-2 border-ink bg-paper-strong px-4 py-2 type-caption font-extrabold text-ink shadow-[2px_2px_0_0_var(--shadow-hard-14)]">
                <Spinner className="text-muted" />
                {locale === "sr" ? "Učitavanje još medija…" : "Loading more media…"}
              </div>
            </div>
          ) : jobStatus === "CanLoadMore" ? (
            <div className="flex justify-center py-4">
              <Button
                variant="secondary"
                onClick={() => {
                  isLoadingRef.current = true;
                  loadMore(PAGE_SIZE);
                }}
              >
                {locale === "sr" ? "Učitaj još" : "Load more"}
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}


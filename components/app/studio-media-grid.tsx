"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { CopyCheck, Download, SlidersHorizontal, Sparkles, Wand2 } from "lucide-react";

import { StudioMediaSkeletonTile, StudioMediaTile, type StudioTileJob } from "@/components/app/studio-media-tile";
import { CreaCompare } from "@/components/crea/compare";
import { LibraryBulkActions } from "@/components/crea/library-bulk-actions";
import { LibraryDuplicates } from "@/components/crea/library-duplicates";
import type { QuickActionLink } from "@/components/crea/quick-actions-menu";
import { Button } from "@/components/ui/button";
import { IgraArt } from "@/components/igra/igra-art";
import { EmptyState } from "@/components/ui/empty-state";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/convex/_generated/api";
import type { Locale } from "@/lib/i18n";
import { isFreshCreaWork } from "@/lib/igra-crea";
import { resetStudioFilters, setStudioFilters, useStudioFilters } from "@/lib/studio-filters-store";
import { dateRangeCutoff, downloadMediaFiles } from "@/lib/studio-gallery";
import { CREA_LIBRARY_COPY } from "@/lib/crea-library-copy";
import { columnsForTileWidth, distributeGridColumns, useGridColumnCount } from "@/lib/studio-grid";
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
  fitToContainer = false,
  emptyState,
  quickActionsFor,
  library = false,
  tileWidth,
  semanticJobs = null,
  modelName = (slug) => slug,
}: {
  locale: Locale;
  kind: StudioSectionKind | null;
  projectId?: Id<"studioProjects"> | null;
  catalog?: StudioModel[];
  onReuse: (job: StudioTileJob) => void;
  onExtend: (job: StudioTileJob) => void;
  onOpenDetail: (job: StudioTileJob) => void;
  /** Drugi argument: prva stranica još stiže (prazan niz tada ne znači „nema radova"). */
  onLoadedJobsChange?: (jobs: StudioTileJob[], isLoadingFirst: boolean) => void;
  onUseStarterPrompt: (prompt: string) => void;
  onResetKind?: () => void;
  /** Broj kolona po širini OVOG elementa, ne prozora (uska kolona istorije u Crei). */
  fitToContainer?: boolean;
  /**
   * Prazno stanje kad korisnik nije sam suzio prikaz (model, period, pretraga). Vrsta
   * tada nije „filter" nego radionica u kojoj je (Crea, K03), pa ne nudi reset vrste.
   */
  emptyState?: ReactNode;
  /** Brze akcije za karticu (K16, S44). */
  quickActionsFor?: (job: StudioTileJob) => QuickActionLink[];
  /** Biblioteka (K16, U9): duplikati i kartice zadate širine (`tileWidth`). */
  library?: boolean;
  /** Najmanja širina kartice u biblioteci (klizač veličine); kolone se računaju po širini mreže. */
  tileWidth?: number;
  /** Pogoci pametne pretrage (CLIP, K16) - dodaju se posle pogodaka po opisu. */
  semanticJobs?: StudioTileJob[] | null;
  /** Ime modela za poređenje. */
  modelName?: (slug: string) => string;
}) {
  // Prozor za zamrznut timestamp (Date.now() unutar state-a na mount-u)
  const [now] = useState(() => Date.now());

  // Filteri (SP2): žive u deljenom store-u - prozor ih menja, sidebar-linija
  // broji, ovde se samo čitaju. Vrsta i dalje dolazi kroz `kind` (URL).
  const {
    modelSlug: modelFilter,
    range: dateFilter,
    query: searchQuery,
    favorite: favoriteFilter,
    cost: costFilter,
    selectMode: isSelectMode,
  } = useStudioFilters();

  // Višestruki izbor i grupno preuzimanje (C7 + C13)
  const [selectedJobs, setSelectedJobs] = useState<Map<string, StudioTileJob>>(new Map());
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<{ current: number; total: number } | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  // Poruka posle masovne akcije (K16): premešteno / obrisano / preskočeno.
  const [actionNotice, setActionNotice] = useState<{ text: string; error: boolean } | null>(null);
  const [comparing, setComparing] = useState<StudioTileJob[] | null>(null);
  const [duplicateScan, setDuplicateScan] = useState<StudioTileJob[] | null>(null);
  const toggleFavorite = useMutation(api.creaLibrary.toggleFavorite);

  const queryArgs = useMemo(() => {
    return {
      ...(kind ? { kind } : {}),
      ...(projectId ? { projectId } : {}),
      ...(modelFilter ? { modelSlug: modelFilter } : {}),
      ...(dateFilter !== "all" ? { createdAfter: dateRangeCutoff(dateFilter, now) } : {}),
      ...(favoriteFilter ? { favorite: true } : {}),
      ...(costFilter !== "all" ? { cost: costFilter } : {}),
    };
  }, [kind, projectId, modelFilter, dateFilter, favoriteFilter, costFilter, now]);

  // Pretraga na srpskom (K16, S43) ide na server (search indeks nad SVIM radovima), ne
  // samo kroz učitane strane; isti filteri važe i za pogotke.
  const trimmedQuery = searchQuery.trim();
  const searchResults = useQuery(
    api.creaSearch.searchMyJobs,
    trimmedQuery ? { query: trimmedQuery, ...queryArgs } : "skip",
  );
  const isSearching = trimmedQuery !== "";

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

  const rootRef = useRef<HTMLDivElement | null>(null);
  const fittedColumns = useGridColumnCount(fitToContainer ? rootRef : undefined);
  const [rootWidth, setRootWidth] = useState<number | null>(null);
  useEffect(() => {
    const element = rootRef.current;
    if (!element || tileWidth === undefined) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry && entry.contentRect.width > 0) setRootWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [tileWidth]);
  const columnCount =
    tileWidth !== undefined && rootWidth !== null ? columnsForTileWidth(rootWidth, tileWidth) : fittedColumns;
  const fixedColumns = fitToContainer || tileWidth !== undefined;
  const gridClass = fixedColumns ? "grid gap-4" : "grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-3";
  const gridStyle = fixedColumns ? { gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))` } : undefined;
  const rawJobRows = jobResults as unknown as StudioTileJob[];

  // Pogoci pretrage (po opisu sa servera, pa „po slici" iz pametne pretrage) umesto strana mreže.
  const filteredJobs = useMemo(() => {
    if (!isSearching) return rawJobRows;
    const byText = (searchResults ?? []) as unknown as StudioTileJob[];
    const seen = new Set(byText.map((job) => job._id));
    return [...byText, ...(semanticJobs ?? []).filter((job) => !seen.has(job._id))];
  }, [rawJobRows, isSearching, searchResults, semanticJobs]);

  const columns = useMemo(
    () => distributeGridColumns(filteredJobs, columnCount),
    [filteredJobs, columnCount],
  );

  const loadingMoreSkeletons = useMemo(
    () => distributeGridColumns(Array.from({ length: Math.min(Math.max(2, columnCount), 3) }, (_, i) => i), columnCount),
    [columnCount],
  );


  const userFiltersActive =
    modelFilter !== null || dateFilter !== "all" || searchQuery.trim() !== "" || favoriteFilter || costFilter !== "all";
  const filtersActive = userFiltersActive || (kind !== null && emptyState === undefined);

  function resetAllFilters() {
    onResetKind?.();
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
    setActionNotice(null);
  }

  // Omiljeno (K16): mutacija menja red, pretplata osveži karticu sama.
  const handleToggleFavorite = useCallback(
    (job: StudioTileJob) => {
      void toggleFavorite({ jobId: job._id as Id<"generationJobs"> }).catch(() => {});
    },
    [toggleFavorite],
  );

  // Duplikati (K16): izbor dobija sve osim prvog u svakoj grupi.
  function handleSelectDuplicates(duplicates: StudioTileJob[]) {
    setSelectedJobs((prev) => {
      const next = new Map(prev);
      for (const job of duplicates) if (isJobDownloadable(job)) next.set(job._id, job);
      return next;
    });
    setDuplicateScan(null);
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

  const pageLoadingFirst =
    jobStatus === "LoadingFirstPage" ||
    (rawJobRows.length === 0 && (jobStatus === "CanLoadMore" || jobStatus === "LoadingMore"));
  const isLoadingFirst = isSearching ? searchResults === undefined : pageLoadingFirst;

  useEffect(() => {
    onLoadedJobsChange?.(rawJobRows, pageLoadingFirst);
  }, [rawJobRows, pageLoadingFirst, onLoadedJobsChange]);

  return (
    <div ref={rootRef} className="space-y-4">
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

          <div className="flex flex-wrap items-center gap-3">
            {downloadError ? (
              <span className="type-caption font-extrabold text-red-700">{downloadError}</span>
            ) : null}
            <LibraryBulkActions
              locale={locale}
              selectedIds={[...selectedJobs.keys()]}
              busy={isDownloading}
              onCompare={() => setComparing([...selectedJobs.values()])}
              onDone={({ removedIds, message, error }) => {
                setActionNotice({ text: message, error: error === true });
                if (removedIds.length === 0) return;
                setSelectedJobs((prev) => {
                  const next = new Map(prev);
                  for (const id of removedIds) next.delete(id);
                  return next;
                });
              }}
            />
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

      {actionNotice ? (
        <p role="status" className={actionNotice.error ? "type-caption font-extrabold text-red-700 dark:text-red-300" : "type-caption font-extrabold text-ink"}>
          {actionNotice.text}
        </p>
      ) : null}

      {/* Biblioteka (K16): duplikati među učitanim slikama */}
      {library && !isLoadingFirst && filteredJobs.some((job) => job.kind === "image") ? (
        duplicateScan ? (
          <LibraryDuplicates
            locale={locale}
            jobs={duplicateScan}
            onSelect={handleSelectDuplicates}
            onClose={() => setDuplicateScan(null)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setDuplicateScan(filteredJobs)}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-full border-2 border-ink bg-paper-strong px-3 text-xs font-black text-ink shadow-[2px_2px_0_0_var(--shadow-hard)] transition hover:-translate-y-0.5 pointer-coarse:min-h-11 studio-focus-ink motion-reduce:transition-none motion-reduce:hover:translate-y-0"
          >
            <CopyCheck aria-hidden="true" className="size-3.5" />
            {CREA_LIBRARY_COPY.duplicates[locale]}
          </button>
        )
      ) : null}

      {comparing ? (
        <CreaCompare
          locale={locale}
          jobs={comparing}
          modelName={modelName}
          onClose={() => setComparing(null)}
          onOpen={(job) => {
            setComparing(null);
            onOpenDetail(job);
          }}
        />
      ) : null}

      {/* ── Stanja mreže: Učitavanje / Prazno / Rezultati ─────────────────────── */}
      {isLoadingFirst ? (
        <div className={gridClass} style={gridStyle}>
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
      ) : filteredJobs.length === 0 && emptyState !== undefined && !userFiltersActive ? (
        emptyState
      ) : filteredJobs.length === 0 ? (
        // Sva tri prazna stanja Studija idu kroz isti `EmptyState` primitiv kao
        // ostatak aplikacije (ikona u zutom krugu, naslov, recenica sa sledecim
        // korakom, jedno dugme). Ranije su bila tri rucno slozena bloka, a filter
        // bez pogodaka je jedini u proizvodu koji je gutao svoj naslov.
        <div className="mx-auto max-w-xl">
          {filtersActive ? (
            <EmptyState
              icon={SlidersHorizontal}
              art={<IgraArt id="prazno.pretraga" size={120} decorative />}
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
              art={<IgraArt id="prazno.radovi" size={120} decorative />}
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
                art={<IgraArt id="prazno.radovi" size={120} decorative />}
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
          <div className={gridClass} style={gridStyle}>
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
                    onToggleFavorite={handleToggleFavorite}
                    waitHistory={rawJobRows}
                    fresh={library && isFreshCreaWork(job, now)}
                    {...(quickActionsFor ? { quickActions: quickActionsFor(job) } : {})}
                  />
                ))}
                {!isSearching && jobStatus === "LoadingMore" &&
                  loadingMoreSkeletons[colIndex]?.map((skeletonIndex) => (
                    <StudioMediaSkeletonTile key={`loading-more-${skeletonIndex}`} />
                  ))}
              </div>
            ))}
          </div>

          {/* Sentinel za beskonačni skrol (pretraga vraća jednu stranu pogodaka) */}
          {isSearching ? null : <div ref={sentinelRef} aria-hidden="true" className="h-4" />}

          {/* Indikator / dugme za još stranica */}
          {isSearching ? null : jobStatus === "LoadingMore" ? (
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


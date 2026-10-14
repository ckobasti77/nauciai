"use client";

import { ArrowLeft, CheckSquare, Heart, Search, X } from "lucide-react";
import { useCallback, useId, useRef, useState, type ReactNode } from "react";

import { StudioMediaGrid } from "@/components/app/studio-media-grid";
import type { StudioTileJob } from "@/components/app/studio-media-tile";
import type { QuickActionLink } from "@/components/crea/quick-actions-menu";
import { SmartSearch } from "@/components/crea/smart-search";
import { cn } from "@/components/ui/primitives";
import type { Id } from "@/convex/_generated/dataModel";
import { CREA_LIBRARY_COPY as L } from "@/lib/crea-library-copy";
import { CREA_AREA_META } from "@/lib/crea-shell";
import type { Locale } from "@/lib/i18n";
import { setStudioFilters, useStudioFilters, type StudioCostFilter } from "@/lib/studio-filters-store";
import { modelLabel, type StudioModel } from "@/lib/studio-models";

/** Veličine kartice (najmanja širina u px) na klizaču; srednja je podrazumevana. */
export const LIBRARY_TILE_SIZES = [140, 190, 250, 330, 440] as const;
const SIZE_STORAGE_KEY = "crea-library-size";

const KINDS = [
  { id: null, label: L.areaAll },
  { id: "image", label: CREA_AREA_META.slika.label },
  { id: "video", label: CREA_AREA_META.video.label },
  { id: "audio", label: CREA_AREA_META.zvuk.label },
] as const;
const COSTS: ReadonlyArray<{ id: StudioCostFilter; label: { sr: string; en: string } }> = [
  { id: "all", label: L.costAll },
  { id: "free", label: L.costFree },
  { id: "paid", label: L.costPaid },
];

const CHIP = "inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 rounded-full border-2 px-3 text-xs font-black transition pointer-coarse:min-h-11 studio-focus-ink motion-reduce:transition-none";
const CHIP_ON = "border-ink bg-yellow text-ink shadow-[2px_2px_0_0_var(--ink)]";
const CHIP_OFF = "border-line bg-paper text-ink hover:border-ink";

function readSize(): number {
  try {
    const stored = Number(localStorage.getItem(SIZE_STORAGE_KEY));
    if (Number.isInteger(stored) && stored >= 0 && stored < LIBRARY_TILE_SIZES.length) return stored;
  } catch {}
  return 2;
}

/**
 * Biblioteka Cree (K16: U9 Galerija 2.0 + S43 pametna biblioteka): svi radovi preko
 * cele širine. Pretraga na srpskom (i „po slici" na jačem računaru), filteri (oblast,
 * omiljeno, cena; model i period su u „Filteri", projekat gore desno), klizač
 * veličine, višestruki izbor sa masovnim akcijama, duplikati i poređenje.
 */
export function CreaLibrary({
  locale,
  catalog,
  projectId,
  onBack,
  onOpenDetail,
  onReuse,
  onExtend,
  onLoadedJobsChange,
  quickActionsFor,
}: {
  locale: Locale;
  catalog: StudioModel[];
  projectId: Id<"studioProjects"> | null;
  onBack: () => void;
  onOpenDetail: (job: StudioTileJob) => void;
  onReuse: (job: StudioTileJob) => void;
  onExtend: (job: StudioTileJob) => void;
  onLoadedJobsChange: (jobs: StudioTileJob[], isLoadingFirst: boolean) => void;
  quickActionsFor: (job: StudioTileJob) => QuickActionLink[];
}) {
  const filters = useStudioFilters();
  const [kind, setKind] = useState<LibraryKind>(null);
  // Biblioteka se crta tek posle prijave (na klijentu), pa sme odmah da pročita izbor.
  const [sizeIndex, setSizeIndex] = useState(readSize);
  const [semanticJobs, setSemanticJobs] = useState<StudioTileJob[] | null>(null);

  function changeSize(next: number) {
    setSizeIndex(next);
    try {
      localStorage.setItem(SIZE_STORAGE_KEY, String(next));
    } catch {}
  }

  const modelName = useCallback(
    (slug: string) => {
      const model = catalog.find((entry) => entry.slug === slug);
      return model ? modelLabel(model, locale) : slug;
    },
    [catalog, locale],
  );

  return (
    <section aria-labelledby="crea-library-title" className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="igra-press igra-shadow igra-depth-2 inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-ink bg-paper-strong px-4 text-sm font-black text-ink studio-focus-ink"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          {L.back[locale]}
        </button>
        <div className="min-w-0">
          <h2 id="crea-library-title" className="type-h2 text-ink">
            {L.title[locale]}
          </h2>
          <p className="type-body-sm font-semibold text-muted">{L.intro[locale]}</p>
        </div>
      </div>

      <LibraryToolbar
        locale={locale}
        kind={kind}
        onKindChange={setKind}
        sizeIndex={sizeIndex}
        onSizeChange={changeSize}
        smartSearch={
          <SmartSearch
            locale={locale}
            query={filters.query}
            filters={{
              ...(kind ? { kind } : {}),
              ...(projectId ? { projectId } : {}),
              ...(filters.modelSlug ? { modelSlug: filters.modelSlug } : {}),
              ...(filters.favorite ? { favorite: true } : {}),
              ...(filters.cost !== "all" ? { cost: filters.cost } : {}),
            }}
            onResults={setSemanticJobs}
          />
        }
      />

      <StudioMediaGrid
        locale={locale}
        kind={kind}
        projectId={projectId}
        catalog={catalog}
        onReuse={onReuse}
        onExtend={onExtend}
        onOpenDetail={onOpenDetail}
        onLoadedJobsChange={onLoadedJobsChange}
        onUseStarterPrompt={() => onBack()}
        onResetKind={() => setKind(null)}
        library
        tileWidth={LIBRARY_TILE_SIZES[sizeIndex]}
        semanticJobs={semanticJobs}
        modelName={modelName}
        quickActionsFor={quickActionsFor}
      />
    </section>
  );
}

export type LibraryKind = "image" | "video" | "audio" | null;

/**
 * Traka biblioteke (K16): pretraga, mesto za pametnu pretragu, oblast, omiljeno, cena,
 * „Izaberi više" i klizač veličine. Bez Convex-a - filteri žive u deljenom store-u.
 */
export function LibraryToolbar({
  locale,
  kind,
  onKindChange,
  sizeIndex,
  onSizeChange,
  smartSearch,
}: {
  locale: Locale;
  kind: LibraryKind;
  onKindChange: (kind: LibraryKind) => void;
  sizeIndex: number;
  onSizeChange: (index: number) => void;
  smartSearch: ReactNode;
}) {
  const filters = useStudioFilters();
  const searchId = useId();
  const sizeId = useId();
  const searchRef = useRef<HTMLInputElement>(null);

  return (
    <div className="surface-card space-y-3 border-2 border-ink bg-paper-strong p-3 shadow-[4px_4px_0_0_var(--shadow-hard-14)] sm:p-4">
      <div>
        <label htmlFor={searchId} className="text-xs font-extrabold text-ink">
          {L.searchLabel[locale]}
        </label>
        <div className="relative mt-1.5 flex items-center">
          <Search aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input
            ref={searchRef}
            id={searchId}
            type="search"
            value={filters.query}
            onChange={(event) => setStudioFilters({ query: event.target.value })}
            placeholder={L.searchPlaceholder[locale]}
            className="h-12 w-full rounded-full border-2 border-ink bg-paper pl-11 pr-11 text-sm font-bold text-ink outline-none placeholder:text-muted studio-focus-ink"
          />
          {filters.query ? (
            <button
              type="button"
              onClick={() => {
                setStudioFilters({ query: "" });
                searchRef.current?.focus();
              }}
              aria-label={L.cancel[locale]}
              className="absolute right-1 top-1/2 inline-flex size-10 -translate-y-1/2 items-center justify-center rounded-full text-muted hover:text-ink studio-focus-ink"
            >
              <X aria-hidden="true" className="size-4" />
            </button>
          ) : null}
        </div>
        <p className="mt-1.5 type-caption font-semibold text-muted">{L.searchHint[locale]}</p>
      </div>

      {smartSearch}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-line pt-3">
        <div role="group" aria-label={L.areaLabel[locale]} className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs font-extrabold text-muted">{L.areaLabel[locale]}</span>
          {KINDS.map((entry) => (
            <button
              key={entry.id ?? "all"}
              type="button"
              aria-pressed={kind === entry.id}
              onClick={() => onKindChange(entry.id)}
              className={cn(CHIP, kind === entry.id ? CHIP_ON : CHIP_OFF)}
            >
              {entry.label[locale]}
            </button>
          ))}
        </div>
        <button
          type="button"
          aria-pressed={filters.favorite}
          onClick={() => setStudioFilters({ favorite: !filters.favorite })}
          className={cn(CHIP, filters.favorite ? CHIP_ON : CHIP_OFF)}
        >
          <Heart aria-hidden="true" className={cn("size-3.5", filters.favorite && "fill-current")} />
          {L.favorite[locale]}
        </button>
        <div role="group" aria-label={L.costLabel[locale]} className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs font-extrabold text-muted">{L.costLabel[locale]}</span>
          {COSTS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              aria-pressed={filters.cost === entry.id}
              onClick={() => setStudioFilters({ cost: entry.id })}
              className={cn(CHIP, filters.cost === entry.id ? CHIP_ON : CHIP_OFF)}
            >
              {entry.label[locale]}
            </button>
          ))}
        </div>
        <button
          type="button"
          aria-pressed={filters.selectMode}
          onClick={() => setStudioFilters({ selectMode: !filters.selectMode })}
          className={cn(CHIP, filters.selectMode ? CHIP_ON : CHIP_OFF)}
        >
          <CheckSquare aria-hidden="true" className="size-3.5" />
          {L.select[locale]}
        </button>
        <div className="flex min-w-[220px] flex-1 items-center gap-2 sm:max-w-xs">
          <label htmlFor={sizeId} className="shrink-0 text-xs font-extrabold text-muted">
            {L.sizeLabel[locale]}
          </label>
          <input
            id={sizeId}
            type="range"
            min={0}
            max={LIBRARY_TILE_SIZES.length - 1}
            step={1}
            value={sizeIndex}
            onChange={(event) => onSizeChange(Number(event.target.value))}
            aria-valuetext={`${LIBRARY_TILE_SIZES[sizeIndex]} px`}
            className="h-11 min-w-0 flex-1 cursor-pointer accent-ink"
          />
        </div>
      </div>
      <p className="type-caption font-semibold text-muted">{L.projectHint[locale]}</p>
    </div>
  );
}

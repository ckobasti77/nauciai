"use client";

import { CheckSquare, Search, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useRef } from "react";

import { cn } from "@/components/ui/primitives";
import type { Locale } from "@/lib/i18n";
import {
  activeFilterCount,
  closeStudioFilters,
  resetStudioFilters,
  setStudioFilters,
  useStudioFilters,
} from "@/lib/studio-filters-store";
import { DATE_RANGE_LABELS, DATE_RANGE_PRESETS, GALLERY_KIND_LABELS, GALLERY_KINDS } from "@/lib/studio-gallery";
import { modelLabel, type StudioModel } from "@/lib/studio-models";
import type { StudioSectionKind } from "@/lib/studio-sections";

const CHIP =
  "inline-flex min-h-9 items-center gap-1 rounded-full border-2 border-ink px-3 py-1 text-xs font-black studio-anim-mikro focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink cursor-pointer";

/**
 * Prozor sa filterima mreže (SP2). Otvara ga linija u sidebaru
 * (`openStudioFilters`), stoji po sredini ekrana; klik na scrim, Esc i X ga
 * zatvaraju. Vrsta (Slika/Video/Zvuk) NIJE ovde - nju nosi sidebar.
 */
export function StudioFiltersDialog({
  locale,
  kind,
  catalog,
}: {
  locale: Locale;
  kind: StudioSectionKind | null;
  catalog: StudioModel[];
}) {
  const filters = useStudioFilters();
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!filters.open) return;
    const timer = setTimeout(() => searchRef.current?.focus(), 60);
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeStudioFilters();
    }
    document.addEventListener("keydown", onKeyDown);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [filters.open]);

  if (!filters.open) return null;

  const count = activeFilterCount(filters);
  const title = locale === "sr" ? "Filteri mreže" : "Grid filters";

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-scrim/45 p-4 backdrop-blur-[2px]"
      onMouseDown={() => closeStudioFilters()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
        className="surface-card w-full max-w-[520px] border-2 border-ink bg-paper-strong shadow-[8px_8px_0_0_var(--shadow-hard-16)]"
      >
        <div className="flex items-center justify-between rounded-t-[inherit] border-b-2 border-ink bg-paper px-4 py-3">
          <span className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-wider text-ink">
            <SlidersHorizontal className="size-4" />
            {title}
            {count > 0 ? (
              <span className="rounded-full border-2 border-ink bg-yellow px-1.5 text-[10px] text-ink">{count}</span>
            ) : null}
          </span>
          <button
            type="button"
            onClick={() => closeStudioFilters()}
            aria-label={locale === "sr" ? "Zatvori" : "Close"}
            className="inline-flex size-8 items-center justify-center rounded-full border-2 border-ink bg-paper-strong text-ink shadow-[2px_2px_0_0_var(--shadow-hard)] transition hover:-translate-y-0.5 studio-focus-ink"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-4 p-4">
          {/* Pretraga po promptu */}
          <label className="block">
            <span className="mb-1 block text-[11px] font-black uppercase tracking-wider text-muted">
              {locale === "sr" ? "Pretraga" : "Search"}
            </span>
            <span className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
              <input
                ref={searchRef}
                type="search"
                value={filters.query}
                onChange={(event) => setStudioFilters({ query: event.target.value })}
                placeholder={locale === "sr" ? "Pretraži promptove…" : "Search prompts…"}
                className="surface-inset h-11 w-full border-2 border-ink bg-paper pl-9 pr-3 text-sm font-bold text-ink outline-none placeholder:text-muted studio-focus-ink"
              />
            </span>
          </label>

          {/* Model */}
          {catalog.length > 0 ? (
            <label className="block">
              <span className="mb-1 block text-[11px] font-black uppercase tracking-wider text-muted">
                {locale === "sr" ? "Model" : "Model"}
              </span>
              <select
                value={filters.modelSlug ?? ""}
                onChange={(event) => setStudioFilters({ modelSlug: event.target.value === "" ? null : event.target.value })}
                className="surface-inset h-11 w-full border-2 border-ink bg-paper-strong px-3 text-sm font-black text-ink outline-none cursor-pointer studio-focus-ink"
              >
                <option value="">{locale === "sr" ? "Svi modeli" : "All models"}</option>
                {kind
                  ? catalog
                      .filter((model) => model.kind === kind)
                      .map((model) => (
                        <option key={model.slug} value={model.slug}>
                          {modelLabel(model, locale)}
                        </option>
                      ))
                  : GALLERY_KINDS.filter((k) => catalog.some((model) => model.kind === k)).map((k) => (
                      <optgroup key={k} label={GALLERY_KIND_LABELS[k][locale]}>
                        {catalog
                          .filter((model) => model.kind === k)
                          .map((model) => (
                            <option key={model.slug} value={model.slug}>
                              {modelLabel(model, locale)}
                            </option>
                          ))}
                      </optgroup>
                    ))}
              </select>
            </label>
          ) : null}

          {/* Period */}
          <div>
            <span className="mb-1 block text-[11px] font-black uppercase tracking-wider text-muted">
              {locale === "sr" ? "Period" : "Period"}
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              {DATE_RANGE_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setStudioFilters({ range: preset })}
                  aria-pressed={filters.range === preset}
                  className={cn(
                    CHIP,
                    filters.range === preset ? "bg-ink text-paper-strong" : "bg-paper-strong text-ink hover:-translate-y-0.5",
                  )}
                >
                  {DATE_RANGE_LABELS[preset][locale]}
                </button>
              ))}
            </div>
          </div>

          {/* Režim višestrukog izbora */}
          <button
            type="button"
            onClick={() => setStudioFilters({ selectMode: !filters.selectMode })}
            aria-pressed={filters.selectMode}
            className={cn(
              CHIP,
              filters.selectMode
                ? "bg-yellow text-ink shadow-[2px_2px_0_0_var(--ink)]"
                : "bg-paper-strong text-ink hover:-translate-y-0.5",
            )}
          >
            <CheckSquare className="size-3.5" />
            {filters.selectMode
              ? locale === "sr"
                ? "Izbor aktivan"
                : "Select active"
              : locale === "sr"
                ? "Izaberi više"
                : "Select multiple"}
          </button>
        </div>

        <div className="flex items-center justify-between gap-3 rounded-b-[inherit] border-t-2 border-ink bg-paper px-4 py-3">
          <button
            type="button"
            onClick={() => resetStudioFilters()}
            disabled={count === 0}
            className="inline-flex h-9 items-center gap-1 rounded-full border-2 border-dashed border-ink/40 px-3 text-xs font-black text-muted transition hover:border-ink hover:text-ink disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
          >
            <X className="size-3" />
            {locale === "sr" ? "Poništi filtere" : "Reset filters"}
          </button>
          <button
            type="button"
            onClick={() => closeStudioFilters()}
            className="inline-flex min-h-9 items-center justify-center rounded-full border-2 border-ink bg-ink px-4 text-xs font-black text-paper-strong shadow-[3px_3px_0_0_var(--yellow)] transition hover:-translate-y-0.5 cursor-pointer"
          >
            {locale === "sr" ? "Gotovo" : "Done"}
          </button>
        </div>
      </div>
    </div>
  );
}

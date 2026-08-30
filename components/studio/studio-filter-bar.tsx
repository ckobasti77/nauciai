"use client";

import { AnimatePresence, motion } from "motion/react";
import { Filter, Search, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import type { Locale } from "@/lib/i18n";
import {
  DATE_RANGE_LABELS,
  DATE_RANGE_PRESETS,
  GALLERY_KIND_LABELS,
  GALLERY_KINDS,
  GALLERY_SCOPE_LABELS,
  GALLERY_SCOPES,
  type DateRangePreset,
  type GalleryScope,
} from "@/lib/studio-gallery";
import { modelLabel, type StudioModel } from "@/lib/studio-models";
import type { StudioSectionKind } from "@/lib/studio-sections";
import {
  activeFilterCount,
  resetStudioFilters,
  setStudioFilters,
  useStudioFilters,
} from "@/lib/studio-filters-store";
import { cn } from "@/components/ui/primitives";

const CHIP_BASE =
  "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-full border-2 px-3 text-xs font-black transition cursor-pointer studio-focus-ink whitespace-nowrap select-none";
const CHIP_ACTIVE = "border-ink bg-yellow text-ink shadow-[2px_2px_0_0_var(--ink)]";
const CHIP_IDLE =
  "border-ink bg-paper-strong text-ink hover:-translate-y-0.5 shadow-[2px_2px_0_0_var(--shadow-hard)]";

export function StudioFilterBar({
  locale,
  isStaff,
  scope,
  onSelectScope,
  activeKind,
  catalog,
}: {
  locale: Locale;
  isStaff: boolean;
  scope: GalleryScope;
  onSelectScope: (scope: GalleryScope) => void;
  activeKind: StudioSectionKind | null;
  onSelectKind?: (kind: StudioSectionKind | null) => void;
  catalog: StudioModel[];
}) {
  const searchInputId = useId();
  const modelSelectId = useId();
  const filters = useStudioFilters();

  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerButtonRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const count = activeFilterCount(filters);
  const hasActiveFilters = count > 0;

  function handleReset() {
    resetStudioFilters();
  }

  // Modeli filtrirani po aktivnoj vrsti (iz sidebara/URL-a)
  const visibleModels = activeKind
    ? catalog.filter((m) => m.kind === activeKind)
    : catalog;

  // Zatvaranje na klik van i na Escape, sa vraćanjem fokusa na dugme Filteri
  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
        triggerButtonRef.current?.focus();
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  // Automatski fokus na polje za pretragu čim se panel otvori
  useEffect(() => {
    if (isOpen) {
      // Mala pauza za animaciju/mount
      const timer = setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const filterButtonLabel =
    count > 0
      ? locale === "sr"
        ? `Filteri · ${count}`
        : `Filters · ${count}`
      : locale === "sr"
        ? "Filteri"
        : "Filters";

  return (
    <div ref={containerRef} className="relative inline-flex items-center gap-2">
      {/* 1. Obim (Samo moji / Svi korisnici) — samo za osoblje */}
      {isStaff ? (
        <>
          <div className="flex shrink-0 items-center gap-1">
            {GALLERY_SCOPES.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => onSelectScope(option)}
                aria-pressed={scope === option}
                className={cn(
                  "inline-flex h-8 shrink-0 items-center justify-center gap-1 rounded-full border-2 px-3 text-xs font-black transition cursor-pointer studio-focus-ink whitespace-nowrap select-none",
                  scope === option
                    ? CHIP_ACTIVE
                    : "border-transparent bg-transparent text-ink/75 hover:border-ink/20 hover:bg-paper-strong hover:text-ink",
                )}
              >
                {GALLERY_SCOPE_LABELS[option][locale]}
              </button>
            ))}
          </div>
          <span aria-hidden="true" className="h-4 w-px shrink-0 bg-ink/20 self-center" />
        </>
      ) : null}

      {/* 2. Dugme Filteri sa brojem aktivnih filtera */}
      <button
        ref={triggerButtonRef}
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        title={filterButtonLabel}
        className={cn(
          CHIP_BASE,
          hasActiveFilters ? CHIP_ACTIVE : CHIP_IDLE,
        )}
      >
        <Filter className="size-3.5 shrink-0" />
        <span>{filterButtonLabel}</span>
      </button>

      {/* 3. Dropdown / Popover panel sa filterima */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Mobilni overlay za zatvaranje (ispod sm) */}
            <div
              className="fixed inset-0 z-40 bg-ink/20 backdrop-blur-[1px] sm:hidden"
              onClick={() => setIsOpen(false)}
              aria-hidden="true"
            />

            <motion.div
              role="dialog"
              aria-modal="false"
              aria-label={locale === "sr" ? "Filteri" : "Filters"}
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.98 }}
              transition={{ duration: 0.15 }}
              className={cn(
                "surface-card border-2 border-ink bg-paper-strong p-4 shadow-[6px_6px_0_0_var(--shadow-hard-16)] z-50",
                // Desktop: usidren desno/levo uz dugme (width 320px)
                "sm:absolute sm:left-0 sm:top-full sm:mt-2 sm:w-80 sm:max-w-[calc(100vw-2rem)]",
                // Mobilni (< 640px): list zakačen za donju ivicu ekrana
                "fixed inset-x-0 bottom-0 sm:bottom-auto rounded-b-none sm:rounded-b-[16px]",
              )}
            >
              <div className="flex flex-col gap-3.5">
                {/* Zaglavlje panela (mobilni ima naslov i X za zatvaranje) */}
                <div className="flex items-center justify-between pb-1 border-b border-ink/10">
                  <span className="text-xs font-black uppercase tracking-wider text-muted">
                    {locale === "sr" ? "Filteri pretrage" : "Search filters"}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setIsOpen(false);
                      triggerButtonRef.current?.focus();
                    }}
                    title={locale === "sr" ? "Zatvori" : "Close"}
                    className="inline-flex size-6 items-center justify-center rounded-full text-muted hover:text-ink hover:bg-ink/5 cursor-pointer"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>

                {/* 1. Pretraga po promptu (puna širina) */}
                <div className="flex flex-col gap-1.5">
                  <label htmlFor={searchInputId} className="text-xs font-extrabold text-ink">
                    {locale === "sr" ? "Pretraga po tvom opisu" : "Search by your description"}
                  </label>
                  <div className="relative flex items-center">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted" />
                    <input
                      ref={searchInputRef}
                      id={searchInputId}
                      type="search"
                      value={filters.query}
                      onChange={(e) => setStudioFilters({ query: e.target.value })}
                      placeholder={locale === "sr" ? "Upiši reč iz opisa…" : "Type a word from a description…"}
                      className="h-9 w-full rounded-full border-2 border-ink/40 bg-paper pl-8.5 pr-8 text-xs font-bold text-ink outline-none placeholder:text-muted focus:border-ink studio-focus-ink"
                    />
                    {filters.query ? (
                      <button
                        type="button"
                        onClick={() => {
                          setStudioFilters({ query: "" });
                          searchInputRef.current?.focus();
                        }}
                        title={locale === "sr" ? "Obriši" : "Clear"}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-ink cursor-pointer"
                      >
                        <X className="size-3.5" />
                      </button>
                    ) : null}
                  </div>
                </div>

                {/* 2. Model (select filtriran po vrsti) */}
                <div className="flex flex-col gap-1.5">
                  <label htmlFor={modelSelectId} className="text-xs font-extrabold text-ink">
                    {locale === "sr" ? "Model" : "Model"}
                  </label>
                  <select
                    id={modelSelectId}
                    value={filters.modelSlug ?? ""}
                    onChange={(e) =>
                      setStudioFilters({ modelSlug: e.target.value === "" ? null : e.target.value })
                    }
                    className="h-9 w-full rounded-full border-2 border-ink/40 bg-paper px-3 text-xs font-black text-ink outline-none cursor-pointer focus:border-ink studio-focus-ink"
                  >
                    <option value="">{locale === "sr" ? "Svi modeli" : "All models"}</option>
                    {activeKind
                      ? visibleModels.map((model) => (
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
                </div>

                {/* 3. Period (Sve · 7 dana · 30 dana) */}
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-extrabold text-ink">
                    {locale === "sr" ? "Period" : "Period"}
                  </span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {DATE_RANGE_PRESETS.map((preset: DateRangePreset) => {
                      const isSelected = filters.range === preset;
                      return (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setStudioFilters({ range: preset })}
                          aria-pressed={isSelected}
                          className={cn(
                            "inline-flex h-7.5 shrink-0 items-center justify-center rounded-full border-2 px-3 text-xs font-black transition cursor-pointer studio-focus-ink whitespace-nowrap select-none",
                            isSelected
                              ? CHIP_ACTIVE
                              : "border-ink/30 bg-paper text-ink/80 hover:border-ink hover:text-ink",
                          )}
                        >
                          {DATE_RANGE_LABELS[preset][locale]}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 4. Poništi filtere — vidljivo samo kada je bar jedan filter aktivan */}
                {hasActiveFilters ? (
                  <div className="pt-2 border-t border-ink/10 flex justify-between items-center">
                    <button
                      type="button"
                      onClick={handleReset}
                      className="text-xs font-black text-muted underline hover:text-ink transition cursor-pointer whitespace-nowrap"
                    >
                      {locale === "sr" ? "Poništi filtere" : "Reset filters"}
                    </button>
                    <span className="text-[11px] font-bold text-muted">
                      {count} {locale === "sr" ? (count === 1 ? "aktivan filter" : "aktivna filtera") : (count === 1 ? "active filter" : "active filters")}
                    </span>
                  </div>
                ) : null}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}


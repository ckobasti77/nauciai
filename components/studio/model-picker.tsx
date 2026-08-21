"use client";

import { Search, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/components/ui/primitives";
import type { Locale } from "@/lib/i18n";
import {
  defaultCredits,
  familyMark,
  filterModels,
  groupByFamily,
  hasAudio,
  modelLabel,
  modelTagline,
  MODEL_BADGE_LABELS,
  type StudioModel,
} from "@/lib/studio-models";
import {
  buildParams,
  creditsPerUnit,
  formatCredits,
  formatCreditsPerUnit,
  paramValuesForMode,
} from "@/lib/studio-params";

const KIND_LABELS = {
  all: { sr: "Sve", en: "All" },
  image: { sr: "Slika", en: "Image" },
  video: { sr: "Video", en: "Video" },
  audio: { sr: "Zvuk", en: "Audio" },
} as const;

const KINDS = ["image", "video", "audio"] as const;

/**
 * Prikaz cene za red modela.
 */
export function modelPriceSummary(model: StudioModel, locale: Locale, duration?: number): string {
  const quantityParam = model.priceRule.quantityParam;
  const override: Record<string, number> =
    quantityParam === "duration" && duration !== undefined ? { duration } : {};
  const credits = defaultCredits(model, override);
  if (credits === null) {
    return locale === "sr" ? "cena po ulazu" : "priced by input";
  }

  if (model.priceRule.unit !== "second") {
    if (model.priceRule.unit === "chars1k") {
      const for1k = defaultCredits(model, { char_count: 1000 });
      if (for1k !== null) {
        return locale === "sr" ? `${for1k} kr/1k znak.` : `${for1k} cr/1k ch.`;
      }
    }
    return formatCredits(credits, locale);
  }

  const mode = model.inputModes[0];
  const values = paramValuesForMode(model.paramSpec, mode);
  const params = buildParams(model.paramSpec, values, mode, override);
  const perSecond = creditsPerUnit(model.priceRule, params, mode);

  return perSecond === null
    ? formatCredits(credits, locale)
    : `${formatCreditsPerUnit(perSecond, "s", locale)} · ${formatCredits(credits, locale)}`;
}

/**
 * P2 posvećeni birač modela (Overlay / Modal) sa pretragom, familijskim grupama,
 * zakačenim trenutnim i nedavnim modelima, i punom tastaturnom navigacijom (↑↓, Enter, Esc).
 */
export function ModelPickerOverlay({
  open,
  onClose,
  models,
  selectedSlug,
  recentSlugs = [],
  onSelect,
  locale,
  duration,
}: {
  open: boolean;
  onClose: () => void;
  models: StudioModel[];
  selectedSlug: string | null;
  recentSlugs?: string[];
  onSelect: (model: StudioModel) => void;
  locale: Locale;
  duration?: number;
}) {
  const [kind, setKind] = useState<"image" | "video" | "audio" | null>(null);
  const [audioOnly, setAudioOnly] = useState(false);
  const [query, setQuery] = useState("");
  const [kbdIndex, setKbdIndex] = useState<number>(-1);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setQuery("");
      setKbdIndex(-1);
    }
  }

  // Autofokus na polje za pretragu kad se birač otvori
  useEffect(() => {
    if (open) {
      const timer = setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [open]);

  // Escape taster zatvara birač
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  const filtered = useMemo(
    () => filterModels(models, { ...(kind ? { kind } : {}), audioOnly, query }, locale),
    [models, kind, audioOnly, query, locale],
  );

  const activeModel = useMemo(
    () => models.find((model) => model.slug === selectedSlug) ?? null,
    [models, selectedSlug],
  );

  const recentModels = useMemo(() => {
    if (query.trim().length > 0) return [];
    return recentSlugs
      .filter((slug) => slug !== selectedSlug)
      .map((slug) => models.find((m) => m.slug === slug))
      .filter((m): m is StudioModel => m !== undefined && (!kind || m.kind === kind) && (!audioOnly || hasAudio(m)));
  }, [recentSlugs, selectedSlug, models, kind, audioOnly, query]);

  const groups = useMemo(() => {
    const shownSlugs = new Set<string>();
    if (!query.trim()) {
      if (activeModel && (!kind || activeModel.kind === kind) && (!audioOnly || hasAudio(activeModel))) {
        shownSlugs.add(activeModel.slug);
      }
      for (const rm of recentModels) {
        shownSlugs.add(rm.slug);
      }
    }

    const remaining = filtered.filter((m) => !shownSlugs.has(m.slug));
    return groupByFamily(remaining);
  }, [filtered, query, activeModel, kind, audioOnly, recentModels]);

  // Spisak svih vidljivih slugova redom za tastaturnu navigaciju
  const visibleSlugs = useMemo(() => {
    const list: string[] = [];
    if (!query.trim()) {
      if (activeModel && (!kind || activeModel.kind === kind) && (!audioOnly || hasAudio(activeModel))) {
        list.push(activeModel.slug);
      }
      for (const rm of recentModels) {
        list.push(rm.slug);
      }
    }
    for (const group of groups) {
      for (const m of group.models) {
        list.push(m.slug);
      }
    }
    return list;
  }, [query, activeModel, kind, audioOnly, recentModels, groups]);

  function handleSelectSlug(slug: string) {
    const target = models.find((m) => m.slug === slug);
    if (target) {
      onSelect(target);
      onClose();
    }
  }

  function handleInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (visibleSlugs.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setKbdIndex((prev) => {
        const next = prev + 1 >= visibleSlugs.length ? 0 : prev + 1;
        scrollIndexIntoView(next);
        return next;
      });
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setKbdIndex((prev) => {
        const next = prev - 1 < 0 ? visibleSlugs.length - 1 : prev - 1;
        scrollIndexIntoView(next);
        return next;
      });
    } else if (event.key === "Enter") {
      event.preventDefault();
      const targetSlug = kbdIndex >= 0 && kbdIndex < visibleSlugs.length
        ? visibleSlugs[kbdIndex]
        : visibleSlugs[0];
      if (targetSlug) {
        handleSelectSlug(targetSlug);
      }
    }
  }

  function scrollIndexIntoView(index: number) {
    const container = listRef.current;
    if (!container) return;
    const items = container.querySelectorAll<HTMLElement>("[data-model-slug]");
    const target = items[index];
    if (target) {
      target.scrollIntoView({ block: "nearest" });
    }
  }

  const availableKinds = KINDS.filter((entry) => models.some((model) => model.kind === entry));

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={locale === "sr" ? "Izaberi model" : "Choose a model"}
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/35 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="surface-card flex max-h-[85vh] w-full max-w-[720px] flex-col overflow-hidden border-2 border-ink bg-white shadow-[6px_6px_0_0_rgba(14,49,88,0.16)] sm:max-h-[80vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b-2 border-ink bg-paper px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-yellow" />
            <h2 className="text-sm font-black uppercase tracking-wide text-ink">
              {locale === "sr" ? "Izaberi model" : "Choose a model"}
            </h2>
            <span className="hidden text-xs font-bold text-muted sm:inline">
              · {locale === "sr" ? "↑↓ Enter · kucaj za pretragu · Esc" : "↑↓ Enter · type to search · Esc"}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={locale === "sr" ? "Zatvori" : "Close"}
            className="inline-flex size-8 items-center justify-center rounded-full border-2 border-ink bg-white text-ink shadow-[2px_2px_0_0_rgba(14,49,88,0.18)] transition hover:-translate-y-0.5"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Filteri po vrsti & Pretraga */}
        <div className="space-y-3 border-b-2 border-ink bg-white p-4 sm:px-6">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              aria-pressed={kind === null}
              onClick={() => {
                setKind(null);
                setKbdIndex(-1);
              }}
              className={cn(
                "rounded-full border-2 border-ink px-3.5 py-1 text-xs font-black transition duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
                kind === null ? "bg-ink text-white" : "bg-white text-ink hover:-translate-y-0.5",
              )}
            >
              {KIND_LABELS.all[locale]}
            </button>
            {availableKinds.map((entry) => (
              <button
                key={entry}
                type="button"
                aria-pressed={kind === entry}
                onClick={() => {
                  setKind(kind === entry ? null : entry);
                  setKbdIndex(-1);
                }}
                className={cn(
                  "rounded-full border-2 border-ink px-3.5 py-1 text-xs font-black transition duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
                  kind === entry ? "bg-ink text-white" : "bg-white text-ink hover:-translate-y-0.5",
                )}
              >
                {KIND_LABELS[entry][locale]}
              </button>
            ))}
            <button
              type="button"
              aria-pressed={audioOnly}
              onClick={() => {
                setAudioOnly((current) => !current);
                setKbdIndex(-1);
              }}
              className={cn(
                "rounded-full border-2 border-ink px-3.5 py-1 text-xs font-black transition duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
                audioOnly ? "bg-yellow text-ink" : "bg-white text-ink hover:-translate-y-0.5",
              )}
            >
              {locale === "sr" ? "Sa zvukom" : "With audio"}
            </button>
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <input
              ref={searchInputRef}
              type="search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setKbdIndex(-1);
              }}
              onKeyDown={handleInputKeyDown}
              placeholder={locale === "sr" ? "Pretraži modele po imenu ili familiji…" : "Search models by name or family…"}
              aria-label={locale === "sr" ? "Pretraži modele" : "Search models"}
              className="surface-inset w-full border-2 border-ink bg-paper py-2 pl-9 pr-4 text-base font-bold text-ink placeholder:font-bold placeholder:text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            />
          </div>
        </div>

        {/* Spisak modela */}
        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto p-4 sm:px-6">
          {visibleSlugs.length === 0 ? (
            <p className="surface-inset border-2 border-ink bg-paper p-4 text-center text-sm font-bold text-muted">
              {locale === "sr"
                ? "Nijedan model ne odgovara pretrazi. Očisti pretragu ili isključi filtere."
                : "No model matches your search. Clear the search or toggle filters."}
            </p>
          ) : (
            <div className="space-y-4">
              {/* Trenutni model (zakačen na vrh ako nema aktivne pretrage) */}
              {!query.trim() && activeModel && (!kind || activeModel.kind === kind) && (!audioOnly || hasAudio(activeModel)) ? (
                <div>
                  <div className="sticky top-0 z-10 bg-white/95 pb-1 pt-0 text-[11px] font-black uppercase tracking-wider text-ink backdrop-blur-xs">
                    {locale === "sr" ? "Trenutni model" : "Current model"}
                  </div>
                  <ModelRowButton
                    model={activeModel}
                    locale={locale}
                    duration={duration}
                    isSelected={true}
                    isHighlighted={visibleSlugs[kbdIndex] === activeModel.slug}
                    onSelect={() => handleSelectSlug(activeModel.slug)}
                  />
                </div>
              ) : null}

              {/* Nedavni modeli */}
              {!query.trim() && recentModels.length > 0 ? (
                <div>
                  <div className="sticky top-0 z-10 bg-white/95 pb-1 pt-1 text-[11px] font-black uppercase tracking-wider text-muted backdrop-blur-xs">
                    {locale === "sr" ? "Nedavni" : "Recent"}
                  </div>
                  <div className="grid gap-1.5">
                    {recentModels.map((m) => (
                      <ModelRowButton
                        key={m.slug}
                        model={m}
                        locale={locale}
                        duration={duration}
                        isSelected={m.slug === selectedSlug}
                        isHighlighted={visibleSlugs[kbdIndex] === m.slug}
                        onSelect={() => handleSelectSlug(m.slug)}
                      />
                    ))}
                  </div>
                </div>
              ) : null}

              {/* Familijske grupe */}
              {groups.map((group) => (
                <div key={group.family} className="space-y-1.5">
                  <div className="sticky top-0 z-10 bg-white/95 pb-1 pt-1 text-[11px] font-black uppercase tracking-wider text-muted backdrop-blur-xs">
                    {group.family} · {group.models.length}
                  </div>
                  <div className="grid gap-1.5">
                    {group.models.map((m) => (
                      <ModelRowButton
                        key={m.slug}
                        model={m}
                        locale={locale}
                        duration={duration}
                        isSelected={m.slug === selectedSlug}
                        isHighlighted={visibleSlugs[kbdIndex] === m.slug}
                        onSelect={() => handleSelectSlug(m.slug)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ModelRowButton({
  model,
  locale,
  duration,
  isSelected,
  isHighlighted,
  onSelect,
}: {
  model: StudioModel;
  locale: Locale;
  duration?: number;
  isSelected: boolean;
  isHighlighted: boolean;
  onSelect: () => void;
}) {
  const mark = familyMark(model);
  const price = modelPriceSummary(model, locale, duration);

  return (
    <button
      type="button"
      data-model-slug={model.slug}
      onClick={onSelect}
      className={cn(
        "surface-inset flex min-h-[52px] w-full items-center gap-3 border-2 border-ink p-3 text-left transition duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
        isSelected
          ? "bg-ink text-white"
          : isHighlighted
            ? "bg-yellow/30 text-ink"
            : "bg-paper hover:bg-[#fff7e6] text-ink",
      )}
    >
      {/* Monohromni znak familije */}
      <span
        className={cn(
          "inline-flex size-8 shrink-0 items-center justify-center rounded-full border-2 border-ink font-mono text-xs font-black",
          isSelected ? "bg-white text-ink" : "bg-ink text-white",
        )}
      >
        {mark}
      </span>

      {/* Naziv i opis */}
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-black leading-none">{modelLabel(model, locale)}</span>
          {model.badge ? (
            <span
              className={cn(
                "rounded-full border-2 border-ink px-2 py-0.5 text-[10px] font-black uppercase tracking-wide",
                isSelected ? "bg-paper text-ink" : "bg-white text-ink",
              )}
            >
              {MODEL_BADGE_LABELS[model.badge][locale]}
            </span>
          ) : null}
          {hasAudio(model) ? (
            <span
              className={cn(
                "rounded-full border-2 border-ink px-2 py-0.5 text-[10px] font-black uppercase tracking-wide",
                isSelected ? "bg-paper text-ink" : "bg-white text-ink",
              )}
            >
              {locale === "sr" ? "zvuk" : "audio"}
            </span>
          ) : null}
        </span>
        <span
          className={cn(
            "mt-1 block truncate text-xs font-bold",
            isSelected ? "text-white/80" : "text-muted",
          )}
        >
          {modelTagline(model, locale)}
        </span>
      </span>

      {/* Cena */}
      <span
        className={cn(
          "ml-auto shrink-0 rounded-full border-2 border-ink px-3 py-1 font-mono text-xs font-black",
          isSelected ? "bg-white text-ink" : "bg-ink text-white",
        )}
      >
        {price}
      </span>
    </button>
  );
}

/**
 * Zadržana kompatibilnost sa postojećim pozivaocima.
 */
export function ModelPicker({
  models,
  selectedSlug,
  onSelect,
  locale,
  duration,
}: {
  models: StudioModel[];
  selectedSlug: string | null;
  onSelect: (model: StudioModel) => void;
  locale: Locale;
  duration?: number;
}) {
  return (
    <ModelPickerOverlay
      open={true}
      onClose={() => {}}
      models={models}
      selectedSlug={selectedSlug}
      onSelect={onSelect}
      locale={locale}
      duration={duration}
    />
  );
}

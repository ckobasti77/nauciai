"use client";

import { ArrowLeft, ChevronDown, Lightbulb, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { CreditIcon } from "@/components/studio/credit-icon";
import { InputCapabilityIcons } from "@/components/studio/input-capabilities";
import { ModelMark } from "@/components/studio/provider-mark";
import { cn } from "@/components/ui/primitives";
import type { Locale } from "@/lib/i18n";
import {
  defaultCredits,
  filterModels,
  groupByFamily,
  modelLabel,
  modelTagline,
  MODEL_BADGE_LABELS,
  PROVIDER_BRAND_NAME,
  providerBrandOf,
  type ProviderBrand,
  type StudioModel,
} from "@/lib/studio-models";
import {
  buildParams,
  creditsPerUnit,
  creditsPerUnitValue,
  formatCredits,
  formatCreditsPerUnit,
  paramValuesForMode,
} from "@/lib/studio-params";
import {
  recommendationLabel,
  recommendationsFor,
  type Recommendation,
} from "@/lib/studio-recommendations";
import type { StudioSectionKind } from "@/lib/studio-sections";

const KIND_OPTIONS: Array<{ value: "image" | "video" | "audio" | "all"; label: Record<Locale, string> }> = [
  { value: "image", label: { sr: "Slika", en: "Image" } },
  { value: "video", label: { sr: "Video", en: "Video" } },
  { value: "audio", label: { sr: "Audio", en: "Audio" } },
  { value: "all", label: { sr: "Sve", en: "All" } },
];

/**
 * Prikaz cene za red modela. Vraća kratak niz koji staje u desnu kolonu:
 * `16 kr`, `19 kr/s · 95 kr`, ili „cena po ulazu" kad se količina meri iz fajla.
 */
export function modelPriceSummary(model: StudioModel, locale: Locale, duration?: number): string {
  const quantityParam = model.priceRule.quantityParam;

  if (model.priceRule.unit === "chars1k") {
    const for1k = defaultCredits(model, { char_count: 1000 });
    if (for1k !== null) {
      return locale === "sr" ? `${for1k} kr/1k` : `${for1k} cr/1k`;
    }
  }

  const override: Record<string, number> =
    quantityParam === "duration" && duration !== undefined ? { duration } : {};
  const credits = defaultCredits(model, override);
  if (credits === null) {
    return locale === "sr" ? "cena po ulazu" : "priced by input";
  }

  if (model.priceRule.unit !== "second") {
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
 * Prikaz cene modela sa ikonicom kredita (`<CreditIcon />`) i punom aria-labelom.
 */
export function ModelPriceDisplay({
  model,
  locale,
  duration,
  className,
}: {
  model: StudioModel;
  locale: Locale;
  duration?: number;
  className?: string;
}) {
  const summary = modelPriceSummary(model, locale, duration);
  const quantityParam = model.priceRule.quantityParam;

  if (model.priceRule.unit === "chars1k") {
    const for1k = defaultCredits(model, { char_count: 1000 });
    if (for1k !== null) {
      return (
        <span aria-label={summary} className={cn("inline-flex items-center gap-0.5", className)}>
          <span>{for1k}</span>
          <CreditIcon className="size-3" />
          <span>/1k</span>
        </span>
      );
    }
  }

  const override: Record<string, number> =
    quantityParam === "duration" && duration !== undefined ? { duration } : {};
  const credits = defaultCredits(model, override);
  if (credits === null) {
    return <span className={className}>{locale === "sr" ? "cena po ulazu" : "priced by input"}</span>;
  }

  if (model.priceRule.unit !== "second") {
    return (
      <span aria-label={summary} className={cn("inline-flex items-center gap-0.5", className)}>
        <span>{credits}</span>
        <CreditIcon className="size-3" />
      </span>
    );
  }

  const mode = model.inputModes[0];
  const values = paramValuesForMode(model.paramSpec, mode);
  const params = buildParams(model.paramSpec, values, mode, override);
  const perSecond = creditsPerUnit(model.priceRule, params, mode);

  if (perSecond === null) {
    return (
      <span aria-label={summary} className={cn("inline-flex items-center gap-0.5", className)}>
        <span>{credits}</span>
        <CreditIcon className="size-3" />
      </span>
    );
  }

  return (
    <span aria-label={summary} className={cn("inline-flex items-center gap-1", className)}>
      <span className="inline-flex items-center gap-0.5">
        <span>{creditsPerUnitValue(perSecond, locale)}</span>
        <CreditIcon className="size-3" />
        <span>/s</span>
      </span>
      <span>·</span>
      <span className="inline-flex items-center gap-0.5">
        <span>{credits}</span>
        <CreditIcon className="size-3" />
      </span>
    </span>
  );
}

type KindFilter = "all" | StudioSectionKind;

/**
 * Prilagođena Select / Dropdown komponenta za filtere na vrhu birača.
 */
function FilterDropdown<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value) ?? options[0];

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  return (
    <div ref={dropdownRef} className="relative flex-1">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((prev) => !prev)}
        className="surface-inset flex h-10 w-full items-center justify-between gap-2 border-2 border-ink bg-paper px-3 text-xs font-black text-ink shadow-[2px_2px_0_0_var(--shadow-hard)] transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        <span className="truncate">{selectedOption?.label ?? label}</span>
        <ChevronDown className={cn("size-3.5 shrink-0 transition-transform duration-150", isOpen && "rotate-180")} />
      </button>

      {isOpen ? (
        <div
          role="listbox"
          className="surface-card absolute left-0 top-[calc(100%+4px)] z-50 max-h-56 w-full min-w-[140px] overflow-y-auto border-2 border-ink bg-paper-strong p-1 shadow-[4px_4px_0_0_var(--shadow-hard-16)]"
        >
          {options.map((opt) => {
            const isSelected = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  onChange(opt.value);
                  setIsOpen(false);
                }}
                className={cn(
                  "flex w-full items-center justify-between surface-inset px-3 py-1.5 text-xs font-black text-left transition hover:bg-yellow/25",
                  isSelected ? "bg-ink text-paper-strong" : "text-ink",
                )}
              >
                <span className="truncate">{opt.label}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Birač modela u pojednostavljenom formatu (Slika 2 i Slika 4).
 */
export function ModelPickerPanel({
  models,
  selectedSlug,
  activeKind,
  providerStatus,
  onSelect,
  locale,
  className,
}: {
  models: StudioModel[];
  selectedSlug: string | null;
  activeKind: StudioSectionKind;
  recentSlugs?: string[];
  lastByKind?: Partial<Record<StudioSectionKind, string>>;
  providerStatus?: Partial<Record<StudioModel["provider"], boolean>>;
  onSelect: (model: StudioModel) => void;
  onCollapse: () => void;
  locale: Locale;
  className?: string;
}) {
  const [kind, setKind] = useState<KindFilter>(activeKind);
  const [providerFilter, setProviderFilter] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [kbdIndex, setKbdIndex] = useState<number>(-1);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Autofokus na pretragu kad se otvori
  useEffect(() => {
    const timer = setTimeout(() => searchInputRef.current?.focus(), 60);
    return () => clearTimeout(timer);
  }, []);

  // Dostupni provajderi iz kataloga modela
  const providerOptions = useMemo(() => {
    const brands = new Set<ProviderBrand>();
    for (const m of models) {
      const b = providerBrandOf(m);
      if (b) brands.add(b);
    }
    const list = Array.from(brands).map((b) => ({
      value: b,
      label: PROVIDER_BRAND_NAME[b] ?? b,
    }));
    return [
      { value: "all", label: locale === "sr" ? "Svi provajderi" : "All providers" },
      ...list,
    ];
  }, [models, locale]);

  // Filtrirani modeli po vrsti, provajderu i query-ju
  const filteredModels = useMemo(() => {
    const q = query.trim().toLowerCase();
    return models.filter((m) => {
      if (kind !== "all" && m.kind !== kind) return false;
      if (providerFilter !== "all") {
        const brand = providerBrandOf(m);
        if (brand !== providerFilter) return false;
      }
      if (q) {
        const matchLabel = modelLabel(m, locale).toLowerCase().includes(q);
        const matchTag = modelTagline(m, locale).toLowerCase().includes(q);
        const matchSlug = m.slug.toLowerCase().includes(q);
        if (!matchLabel && !matchTag && !matchSlug) return false;
      }
      return true;
    });
  }, [models, kind, providerFilter, query, locale]);

  // Grupisanje: SAMO ako je izabrano "Sve" (kind === "all"), grupišemo po Slika, Video, Audio
  const groups = useMemo(() => {
    if (kind !== "all") return null;

    const kinds: Array<"image" | "video" | "audio"> = ["image", "video", "audio"];
    const result: Array<{ kind: "image" | "video" | "audio"; label: string; models: StudioModel[] }> = [];

    for (const k of kinds) {
      const subset = filteredModels.filter((m) => m.kind === k);
      if (subset.length > 0) {
        const opt = KIND_OPTIONS.find((o) => o.value === k);
        result.push({
          kind: k,
          label: opt?.label[locale] ?? k,
          models: subset,
        });
      }
    }
    return result;
  }, [kind, filteredModels, locale]);

  const visibleSlugs = useMemo(() => filteredModels.map((m) => m.slug), [filteredModels]);

  function choose(slug: string) {
    const target = models.find((m) => m.slug === slug);
    if (target) onSelect(target);
  }

  function scrollIndexIntoView(index: number) {
    const items = listRef.current?.querySelectorAll<HTMLElement>("[data-model-slug]");
    items?.[index]?.scrollIntoView({ block: "nearest" });
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
      const targetSlug =
        kbdIndex >= 0 && kbdIndex < visibleSlugs.length ? visibleSlugs[kbdIndex] : visibleSlugs[0];
      if (targetSlug) choose(targetSlug);
    }
  }

  const highlightedSlug = kbdIndex >= 0 ? visibleSlugs[kbdIndex] : null;

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      {/* Pretraga i dva dropdowna gore */}
      <div className="space-y-2.5 pb-3">
        {/* Pretraga bez strelice levo */}
        <div className="relative w-full">
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
            placeholder={locale === "sr" ? "Pretraži modele…" : "Search models…"}
            aria-label={locale === "sr" ? "Pretraži modele" : "Search models"}
            className="surface-inset h-11 w-full border-2 border-ink bg-paper py-2 pl-9 pr-3 text-base font-bold text-ink placeholder:font-bold placeholder:text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          />
        </div>

        {/* 2 Select komponente u jednom redu: Tip (Slika/Video/Audio/Sve) i Provajder */}
        <div className="flex items-center gap-2">
          <FilterDropdown
            label={locale === "sr" ? "Tip modela" : "Model type"}
            value={kind}
            options={KIND_OPTIONS.map((opt) => ({
              value: opt.value,
              label: opt.label[locale],
            }))}
            onChange={(val) => {
              setKind(val);
              setKbdIndex(-1);
            }}
          />

          <FilterDropdown
            label={locale === "sr" ? "Provajder" : "Provider"}
            value={providerFilter}
            options={providerOptions}
            onChange={(val) => {
              setProviderFilter(val);
              setKbdIndex(-1);
            }}
          />
        </div>
      </div>

      {/* Spisak modela */}
      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto">
        {filteredModels.length === 0 ? (
          <p className="surface-inset border-2 border-ink bg-paper p-4 text-center text-sm font-bold text-muted">
            {locale === "sr"
              ? "Nijedan alat ne odgovara ovom izboru. Obriši reč iz pretrage ili izaberi drugu vrstu iznad."
              : "No tool matches this selection. Clear the search word or pick a different type above."}
          </p>
        ) : groups ? (
          /* Grupisanje samo kad je izabrano 'Sve' */
          <div className="space-y-3">
            {groups.map((group) => (
              <div key={group.kind} className="space-y-1">
                <GroupHeader label={group.label} />
                {group.models.map((m) => (
                  <ModelRow
                    key={m.slug}
                    model={m}
                    locale={locale}
                    isDemo={providerStatus?.[m.provider] === false}
                    isSelected={m.slug === selectedSlug}
                    isHighlighted={highlightedSlug === m.slug}
                    onSelect={() => choose(m.slug)}
                  />
                ))}
              </div>
            ))}
          </div>
        ) : (
          /* Obična lista bez sekcijskih zaglavlja kad je izabran specifičan tip */
          <div className="space-y-1">
            {filteredModels.map((m) => (
              <ModelRow
                key={m.slug}
                model={m}
                locale={locale}
                isDemo={providerStatus?.[m.provider] === false}
                isSelected={m.slug === selectedSlug}
                isHighlighted={highlightedSlug === m.slug}
                onSelect={() => choose(m.slug)}
              />
            ))}
          </div>
        )}

        {/* Pravna napomena o znakovima */}
        <p className="px-1 pt-3 text-[10px] font-bold leading-4 text-muted">
          {locale === "sr"
            ? "Imena i znakovi modela pripadaju njihovim vlasnicima; koriste se radi prepoznavanja, bez podrazumevane povezanosti."
            : "Model names and marks belong to their owners; shown for recognition, with no implied affiliation."}
        </p>
      </div>
    </div>
  );
}

function GroupHeader({ label }: { label: string }) {
  return (
    <div className="sticky top-0 z-10 bg-paper-strong/95 py-1 text-[11px] font-black uppercase tracking-wider text-muted backdrop-blur-xs">
      {label}
    </div>
  );
}

/**
 * Kartica modela (Slika 4):
 * Naziv modela je GORE sa VEĆIM fontom (npr. 15px font-black).
 * Opis modela je DOLE sa MANJIM fontom (npr. 11px font-semibold text-muted).
 */
function ModelRow({
  model,
  locale,
  isSelected,
  isHighlighted,
  isDemo = false,
  onSelect,
}: {
  model: StudioModel;
  locale: Locale;
  isSelected: boolean;
  isHighlighted: boolean;
  isDemo?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      data-model-slug={model.slug}
      aria-pressed={isSelected}
      onClick={onSelect}
      className={cn(
        "surface-inset flex min-h-[46px] w-full items-center gap-3 border-2 px-3 py-2 text-left transition duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
        isSelected
          ? "border-ink bg-ink text-paper-strong shadow-[2px_2px_0_0_var(--shadow-hard)]"
          : isHighlighted
            ? "border-ink bg-yellow/20 text-ink"
            : "border-ink/15 bg-paper text-ink hover:border-ink hover:bg-yellow/10",
      )}
    >
      <ModelMark model={model} size={22} className="shrink-0" />
      <span className="min-w-0 flex-1">
        {/* 1. Naziv modela (Gore, veći font) */}
        <span className="flex items-center gap-2">
          <span
            className={cn(
              "truncate text-[15px] font-black leading-tight",
              isSelected ? "text-paper-strong" : "text-ink",
            )}
          >
            {modelLabel(model, locale)}
          </span>
          {model.badge ? (
            <span
              className={cn(
                "shrink-0 rounded-full border-2 border-ink px-1.5 py-0 text-[9px] font-black uppercase tracking-wide",
                isSelected ? "bg-paper text-ink" : "bg-paper-strong text-ink",
              )}
            >
              {MODEL_BADGE_LABELS[model.badge][locale]}
            </span>
          ) : null}
          {isDemo ? (
            <span
              title={locale === "sr" ? "Provajder nije povezan - izlaz je probni." : "Provider not connected - the output is a sample."}
              className="shrink-0 rounded-full border-2 border-ink bg-yellow px-1.5 py-0 text-[9px] font-black uppercase tracking-wide text-ink"
            >
              DEMO
            </span>
          ) : null}
        </span>
        {/* 2. Opis / Tagline modela (Dole, manji font) */}
        <span
          className={cn(
            "mt-0.5 block truncate text-[11px] font-semibold leading-tight",
            isSelected ? "text-paper-strong/75" : "text-muted",
          )}
        >
          {modelTagline(model, locale)}
        </span>
      </span>
      {/* Sposobnosti unosa (ikone) */}
      <InputCapabilityIcons model={model} locale={locale} muted={!isSelected} />
      {/* Cena */}
      <span
        className={cn(
          "shrink-0 whitespace-nowrap text-right font-mono text-[11px] font-black tabular-nums",
          isSelected ? "text-paper-strong" : "text-ink",
        )}
      >
        <ModelPriceDisplay model={model} locale={locale} />
      </span>
    </button>
  );
}

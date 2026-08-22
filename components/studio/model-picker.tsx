"use client";

import { ArrowLeft, Lightbulb, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

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
  type StudioModel,
} from "@/lib/studio-models";
import {
  buildParams,
  creditsPerUnit,
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

const KIND_LABELS = {
  all: { sr: "Sve", en: "All" },
  image: { sr: "Slika", en: "Image" },
  video: { sr: "Video", en: "Video" },
  audio: { sr: "Zvuk", en: "Audio" },
} as const;

const KINDS = ["image", "video", "audio"] as const;

/**
 * Prikaz cene za red modela. Vraća kratak niz koji staje u desnu kolonu:
 * `16 kr`, `19 kr/s · 95 kr`, ili „cena po ulazu" kad se količina meri iz fajla.
 */
export function modelPriceSummary(model: StudioModel, locale: Locale, duration?: number): string {
  const quantityParam = model.priceRule.quantityParam;

  // chars1k (TTS/dijalog): cena po 1000 znakova je stabilna i poznata unapred,
  // pa je pokazujemo umesto „cena po ulazu" - broj koji korisnik može da uporedi.
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

type KindFilter = "all" | StudioSectionKind;

/**
 * Birač modela kao GORNJA ZONA panela (SP1, tačka 1) - ne zaseban prozor.
 * Fiksne je visine (flex-col: pretraga+filteri gore, spisak skroluje), pa se
 * composer i cena ne pomeraju dok korisnik bira. Sav znak firme, gustina (dva
 * reda po modelu, cena u tabularnoj koloni), preporuke po poslu i tastatura su
 * ovde; nijedan `if (slug === …)`.
 */
export function ModelPickerPanel({
  models,
  selectedSlug,
  activeKind,
  recentSlugs = [],
  lastByKind = {},
  onSelect,
  onCollapse,
  locale,
  className,
}: {
  models: StudioModel[];
  selectedSlug: string | null;
  /** Vrsta trenutnog modela - filter se otvara na njoj (tačka 8: ne baca na tuđu vrstu). */
  activeKind: StudioSectionKind;
  recentSlugs?: string[];
  lastByKind?: Partial<Record<StudioSectionKind, string>>;
  onSelect: (model: StudioModel) => void;
  onCollapse: () => void;
  locale: Locale;
  className?: string;
}) {
  const [kind, setKind] = useState<KindFilter>(activeKind);
  const [query, setQuery] = useState("");
  const [kbdIndex, setKbdIndex] = useState<number>(-1);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Autofokus na pretragu kad se zona otvori.
  useEffect(() => {
    const timer = setTimeout(() => searchInputRef.current?.focus(), 60);
    return () => clearTimeout(timer);
  }, []);

  const specificKind: StudioSectionKind | null = kind === "all" ? null : kind;

  const filtered = useMemo(
    () => filterModels(models, { ...(specificKind ? { kind: specificKind } : {}), query }, locale),
    [models, specificKind, query, locale],
  );

  const activeModel = useMemo(
    () => models.find((model) => model.slug === selectedSlug) ?? null,
    [models, selectedSlug],
  );

  const matchesFilter = (model: StudioModel) =>
    (!specificKind || model.kind === specificKind) && (query.trim().length === 0);

  // „Poslednji korišćen" za trenutnu vrstu (tačka 8) - da prebacivanje vrste
  // vrati na poznat model, ne na nasumičan. Preskače trenutni i one već gore.
  const lastUsedModel = useMemo(() => {
    if (!specificKind || query.trim().length > 0) return null;
    const slug = lastByKind[specificKind];
    if (!slug || slug === selectedSlug || recentSlugs.includes(slug)) return null;
    const model = models.find((m) => m.slug === slug);
    return model && model.kind === specificKind ? model : null;
  }, [specificKind, query, lastByKind, selectedSlug, recentSlugs, models]);

  const recentModels = useMemo(() => {
    if (query.trim().length > 0) return [];
    return recentSlugs
      .filter((slug) => slug !== selectedSlug && slug !== lastUsedModel?.slug)
      .map((slug) => models.find((m) => m.slug === slug))
      .filter((m): m is StudioModel => m !== undefined && (!specificKind || m.kind === specificKind));
  }, [recentSlugs, selectedSlug, lastUsedModel, models, specificKind, query]);

  const recommendations = useMemo(() => {
    if (!specificKind || query.trim().length > 0) return [];
    return recommendationsFor(specificKind, models);
  }, [specificKind, query, models]);

  const groups = useMemo(() => {
    const shown = new Set<string>();
    if (!query.trim()) {
      if (activeModel && matchesFilter(activeModel)) shown.add(activeModel.slug);
      if (lastUsedModel) shown.add(lastUsedModel.slug);
      for (const m of recentModels) shown.add(m.slug);
    }
    return groupByFamily(filtered.filter((m) => !shown.has(m.slug)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, query, activeModel, lastUsedModel, recentModels, specificKind]);

  // Redosled svih vidljivih model-redova za tastaturu (preporuke nisu u nizu -
  // one su prečice na dodir, i dalje dostupne Tab-om).
  const visibleSlugs = useMemo(() => {
    const list: string[] = [];
    if (!query.trim()) {
      if (activeModel && matchesFilter(activeModel)) list.push(activeModel.slug);
      if (lastUsedModel) list.push(lastUsedModel.slug);
      for (const m of recentModels) list.push(m.slug);
    }
    for (const group of groups) for (const m of group.models) list.push(m.slug);
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, activeModel, lastUsedModel, recentModels, groups, specificKind]);

  function choose(slug: string) {
    const target = models.find((m) => m.slug === slug);
    if (target) onSelect(target);
  }

  function scrollIndexIntoView(index: number) {
    const items = listRef.current?.querySelectorAll<HTMLElement>("[data-model-slug]");
    items?.[index]?.scrollIntoView({ block: "nearest" });
  }

  function handleInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onCollapse();
      return;
    }
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

  const availableKinds = KINDS.filter((entry) => models.some((model) => model.kind === entry));
  const highlightedSlug = kbdIndex >= 0 ? visibleSlugs[kbdIndex] : null;

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      {/* Filteri po vrsti + pretraga (zakačeni gore, ne skroluju) */}
      <div className="space-y-2.5 pb-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCollapse}
            aria-label={locale === "sr" ? "Nazad na podešavanja" : "Back to settings"}
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-full border-2 border-ink bg-paper-strong text-ink shadow-[2px_2px_0_0_var(--shadow-hard)] transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            <ArrowLeft className="size-4" />
          </button>
          <div className="relative flex-1">
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
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <KindChip label={KIND_LABELS.all[locale]} active={kind === "all"} onClick={() => { setKind("all"); setKbdIndex(-1); }} />
          {availableKinds.map((entry) => (
            <KindChip
              key={entry}
              label={KIND_LABELS[entry][locale]}
              active={kind === entry}
              onClick={() => { setKind(entry); setKbdIndex(-1); }}
            />
          ))}
        </div>
      </div>

      {/* Spisak (jedini deo koji skroluje) */}
      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto">
        {visibleSlugs.length === 0 && recommendations.length === 0 ? (
          <p className="surface-inset border-2 border-ink bg-paper p-4 text-center text-sm font-bold text-muted">
            {locale === "sr"
              ? "Nijedan model ne odgovara pretrazi."
              : "No model matches your search."}
          </p>
        ) : (
          <div className="space-y-3">
            {/* Preporuke po poslu — ulaz za početnika, pre punog spiska */}
            {recommendations.length > 0 ? (
              <div className="space-y-1">
                <GroupHeader label={locale === "sr" ? "Za tvoj posao" : "For your job"} />
                {recommendations.map((rec) => (
                  <RecommendationRow
                    key={rec.id}
                    rec={rec}
                    model={models.find((m) => m.slug === rec.slug)!}
                    locale={locale}
                    onSelect={() => choose(rec.slug)}
                  />
                ))}
              </div>
            ) : null}

            {/* Trenutni model */}
            {!query.trim() && activeModel && matchesFilter(activeModel) ? (
              <div className="space-y-1">
                <GroupHeader label={locale === "sr" ? "Trenutni model" : "Current model"} />
                <ModelRow
                  model={activeModel}
                  locale={locale}
                  isSelected
                  isHighlighted={highlightedSlug === activeModel.slug}
                  onSelect={() => choose(activeModel.slug)}
                />
              </div>
            ) : null}

            {/* Poslednji korišćen za ovu vrstu */}
            {lastUsedModel ? (
              <div className="space-y-1">
                <GroupHeader label={locale === "sr" ? "Poslednji korišćen" : "Last used"} />
                <ModelRow
                  model={lastUsedModel}
                  locale={locale}
                  isSelected={lastUsedModel.slug === selectedSlug}
                  isHighlighted={highlightedSlug === lastUsedModel.slug}
                  onSelect={() => choose(lastUsedModel.slug)}
                />
              </div>
            ) : null}

            {/* Nedavni */}
            {recentModels.length > 0 ? (
              <div className="space-y-1">
                <GroupHeader label={locale === "sr" ? "Nedavni" : "Recent"} />
                {recentModels.map((m) => (
                  <ModelRow
                    key={m.slug}
                    model={m}
                    locale={locale}
                    isSelected={m.slug === selectedSlug}
                    isHighlighted={highlightedSlug === m.slug}
                    onSelect={() => choose(m.slug)}
                  />
                ))}
              </div>
            ) : null}

            {/* Familijske grupe */}
            {groups.map((group) => (
              <div key={group.family} className="space-y-1">
                <GroupHeader label={`${group.family} · ${group.models.length}`} />
                {group.models.map((m) => (
                  <ModelRow
                    key={m.slug}
                    model={m}
                    locale={locale}
                    isSelected={m.slug === selectedSlug}
                    isHighlighted={highlightedSlug === m.slug}
                    onSelect={() => choose(m.slug)}
                  />
                ))}
              </div>
            ))}

            {/* Pravna napomena o znakovima (SP1, tačka 2) */}
            <p className="px-1 pt-1 text-[10px] font-bold leading-4 text-muted">
              {locale === "sr"
                ? "Imena i znakovi modela pripadaju njihovim vlasnicima; koriste se radi prepoznavanja, bez podrazumevane povezanosti."
                : "Model names and marks belong to their owners; shown for recognition, with no implied affiliation."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function KindChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "rounded-full border-2 border-ink px-3 py-1 text-xs font-black transition duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
        active ? "bg-ink text-paper-strong" : "bg-paper-strong text-ink hover:-translate-y-0.5",
      )}
    >
      {label}
    </button>
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
 * Dva reda: znak + ime + cena (gore), rečenica opisa (dole, `truncate`). Cena je
 * u desnoj tabularnoj koloni kroz ceo spisak. Selekcija je ink (žuto je samo za
 * cenu/akciju na baru); znak je `currentColor`, pa prati i temu i selekciju.
 */
function ModelRow({
  model,
  locale,
  isSelected,
  isHighlighted,
  onSelect,
}: {
  model: StudioModel;
  locale: Locale;
  isSelected: boolean;
  isHighlighted: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      data-model-slug={model.slug}
      aria-pressed={isSelected}
      onClick={onSelect}
      className={cn(
        "surface-inset flex min-h-[44px] w-full items-center gap-3 border-2 px-3 py-1.5 text-left transition duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
        isSelected
          ? "border-ink bg-ink text-paper-strong"
          : isHighlighted
            ? "border-ink bg-yellow/20 text-ink"
            : "border-ink/15 bg-paper text-ink hover:border-ink hover:bg-[#fff7e6] dark:hover:bg-yellow/10",
      )}
    >
      <ModelMark model={model} size={20} className="shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-[15px] font-black leading-tight">{modelLabel(model, locale)}</span>
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
        </span>
        <span
          className={cn(
            "mt-0.5 block truncate text-[11px] font-semibold leading-tight",
            isSelected ? "text-paper-strong/75" : "text-muted",
          )}
        >
          {modelTagline(model, locale)}
        </span>
      </span>
      <span
        className={cn(
          "shrink-0 whitespace-nowrap text-right font-mono text-[11px] font-black tabular-nums",
          isSelected ? "text-paper-strong" : "text-ink",
        )}
      >
        {modelPriceSummary(model, locale)}
      </span>
    </button>
  );
}

/**
 * Preporuka po POSLU: vodi labela posla (bold), pa model na koji vodi (muted),
 * cena desno. Bez znaka firme - da se ne pomeša sa spiskom modela i da znak ne
 * postane svuda (tačka 2: znak koji je svuda prestaje da bude informacija).
 */
function RecommendationRow({
  rec,
  model,
  locale,
  onSelect,
}: {
  rec: Recommendation;
  model: StudioModel;
  locale: Locale;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="surface-inset flex min-h-[44px] w-full items-center gap-3 border-2 border-ink/15 bg-paper px-3 py-1.5 text-left text-ink transition duration-150 hover:border-ink hover:bg-[#fff7e6] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink dark:hover:bg-yellow/10"
    >
      <Lightbulb className="size-4 shrink-0 text-ink" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-black leading-tight">{recommendationLabel(rec, locale)}</span>
        <span className="block truncate text-xs font-bold leading-tight text-muted">{modelLabel(model, locale)}</span>
      </span>
      <span className="shrink-0 whitespace-nowrap text-right font-mono text-[11px] font-black tabular-nums text-ink">
        {modelPriceSummary(model, locale)}
      </span>
    </button>
  );
}

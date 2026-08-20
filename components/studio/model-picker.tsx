"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";

import { cn } from "@/components/ui/primitives";
import type { Locale } from "@/lib/i18n";
import {
  defaultCredits,
  filterModels,
  groupByFamily,
  hasAudio,
  modelLabel,
  modelTagline,
  MODEL_BADGE_LABELS,
  type StudioModel,
} from "@/lib/studio-models";
import { creditsPerUnit, formatCredits, formatCreditsPerUnit, paramValuesForMode, buildParams } from "@/lib/studio-params";

const KIND_LABELS = {
  image: { sr: "Slika", en: "Image" },
  video: { sr: "Video", en: "Video" },
  audio: { sr: "Zvuk", en: "Audio" },
} as const;

const KINDS = ["image", "video", "audio"] as const;

/**
 * Cena modela za listu. Kod video modela je to i cena po sekundi i cena za
 * trenutno izabrano trajanje (STUDIO-CATALOG-V4 sekcija 6) - obe iz istog
 * `computeCredits`-a kojim se posao naplaćuje.
 *
 * `null` znači "količina se meri iz ulaza" (Kling lipsync se naplaćuje po
 * sekundi okačenog videa) - lista tada ne izmišlja cifru.
 */
function priceSummary(model: StudioModel, locale: Locale, duration?: number): string {
  const quantityParam = model.priceRule.quantityParam;
  const override: Record<string, number> =
    quantityParam === "duration" && duration !== undefined ? { duration } : {};
  const credits = defaultCredits(model, override);
  if (credits === null) {
    return locale === "sr" ? "cena po ulazu" : "priced by input";
  }

  if (model.priceRule.unit !== "second") return formatCredits(credits, locale);

  const mode = model.inputModes[0];
  const values = paramValuesForMode(model.paramSpec, mode);
  const params = buildParams(model.paramSpec, values, mode, override);
  const perSecond = creditsPerUnit(model.priceRule, params, mode);

  return perSecond === null
    ? formatCredits(credits, locale)
    : `${formatCreditsPerUnit(perSecond, "s", locale)} · ${formatCredits(credits, locale)}`;
}

/**
 * Izbor modela: grupisano po porodici u akordeonu, filter po vrsti i po zvuku,
 * pretraga po imenu. Komponenta ne zna nijedan slug - porodice, vrste i značke
 * dolaze iz redova kataloga.
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
  /** Trenutno izabrano trajanje, da cena video modela prati slajder. */
  duration?: number;
}) {
  const [kind, setKind] = useState<"image" | "video" | "audio" | null>(null);
  const [audioOnly, setAudioOnly] = useState(false);
  const [query, setQuery] = useState("");

  const groups = useMemo(
    () =>
      groupByFamily(
        filterModels(models, { ...(kind ? { kind } : {}), audioOnly, query }, locale),
      ),
    [models, kind, audioOnly, query, locale],
  );

  const availableKinds = KINDS.filter((entry) => models.some((model) => model.kind === entry));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {availableKinds.map((entry) => (
          <button
            key={entry}
            type="button"
            aria-pressed={kind === entry}
            onClick={() => setKind(kind === entry ? null : entry)}
            className={cn(
              "rounded-full border-2 border-ink px-4 py-1.5 text-sm font-black transition duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
              kind === entry ? "bg-ink text-white" : "bg-white text-ink hover:-translate-y-0.5",
            )}
          >
            {KIND_LABELS[entry][locale]}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={audioOnly}
          onClick={() => setAudioOnly((current) => !current)}
          className={cn(
            "rounded-full border-2 border-ink px-4 py-1.5 text-sm font-black transition duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
            audioOnly ? "bg-yellow text-ink" : "bg-white text-ink hover:-translate-y-0.5",
          )}
        >
          {locale === "sr" ? "Sa zvukom" : "With audio"}
        </button>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={locale === "sr" ? "Pretraži modele" : "Search models"}
          aria-label={locale === "sr" ? "Pretraži modele" : "Search models"}
          className="surface-inset w-full border-2 border-ink bg-white py-2.5 pl-9 pr-4 text-base font-bold text-ink placeholder:font-bold placeholder:text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        />
      </div>

      {groups.length === 0 ? (
        <p className="surface-inset border-2 border-ink bg-paper p-4 text-sm font-bold text-muted">
          {locale === "sr"
            ? "Nijedan model ne odgovara filterima. Očisti pretragu ili isključi filter."
            : "No model matches the filters. Clear the search or turn a filter off."}
        </p>
      ) : (
        <div className="space-y-2">
          {groups.map((group) => (
            <details
              key={group.family}
              open={group.models.some((model) => model.slug === selectedSlug) || groups.length <= 3}
              className="surface-inset border-2 border-ink bg-paper"
            >
              <summary className="cursor-pointer px-4 py-3 text-sm font-black uppercase tracking-wide text-ink">
                {group.family} · {group.models.length}
              </summary>

              <div className="grid gap-2 px-3 pb-3">
                {group.models.map((model) => {
                  const active = model.slug === selectedSlug;

                  return (
                    <button
                      key={model.slug}
                      type="button"
                      aria-pressed={active}
                      onClick={() => onSelect(model)}
                      className={cn(
                        "surface-inset flex w-full flex-col gap-1 border-2 border-ink p-3 text-left transition duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
                        active ? "bg-yellow shadow-[4px_4px_0_0_#0e3158]" : "bg-white hover:-translate-y-0.5",
                      )}
                    >
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-base font-black text-ink">{modelLabel(model, locale)}</span>
                        {model.badge ? (
                          <span className="rounded-full border-2 border-ink bg-white px-2.5 py-0.5 text-xs font-black text-ink">
                            {MODEL_BADGE_LABELS[model.badge][locale]}
                          </span>
                        ) : null}
                        {hasAudio(model) ? (
                          <span className="rounded-full border-2 border-ink bg-white px-2.5 py-0.5 text-xs font-black text-ink">
                            {locale === "sr" ? "zvuk" : "audio"}
                          </span>
                        ) : null}
                        <span className="ml-auto rounded-full border-2 border-ink bg-ink px-3 py-0.5 text-xs font-black text-white">
                          {priceSummary(model, locale, duration)}
                        </span>
                      </span>
                      <span className="text-sm font-bold text-muted">{modelTagline(model, locale)}</span>
                    </button>
                  );
                })}
              </div>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
